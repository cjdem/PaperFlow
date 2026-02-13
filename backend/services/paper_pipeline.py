import os
import json
import re
import fitz  # PyMuPDF
import asyncio
from sqlalchemy.orm import Session
from backend.core.db_models import Paper, Session as DBSession
from json_repair import repair_json
from backend.core.llm_pool import llm_manager
from backend.core.log_service import workflow_logger, get_logger
logger = get_logger("main")


# ================= 工具函数 =================

def normalize_title(title):
    if not title: return ""
    return re.sub(r'[^a-zA-Z0-9]', '', title).lower()

_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")

def sanitize_text_for_llm(text: str) -> str:
    """移除控制字符，降低上游接口误拦截概率"""
    if not text:
        return ""
    return _CONTROL_CHARS_RE.sub("", text)

def extract_pdf_content(file_path):
    logger.debug(f"正在读取 PDF: {file_path}")
    try:
        # 元数据提取只需要前几页（标题/作者/摘要通常都在首页），避免输入过长或包含无关内容
        head_pages = 2
        head_max_chars = 8000

        full_text_parts = []
        head_text_parts = []

        with fitz.open(file_path) as doc:
            for page_index, page in enumerate(doc):
                page_text = page.get_text()
                full_text_parts.append(page_text)
                if page_index < head_pages and len("".join(head_text_parts)) < head_max_chars:
                    head_text_parts.append(page_text)

        full_text = sanitize_text_for_llm("".join(full_text_parts))
        head_text = sanitize_text_for_llm("".join(head_text_parts))[:head_max_chars]
        if not head_text and full_text:
            head_text = full_text[:head_max_chars]
        
        if len(full_text) < 100:
            logger.warning("提取内容过少，可能是扫描件")
            return None, None

        return head_text, full_text
    except Exception as e:
        logger.error(f"PDF 读取失败: {e}")
        return None, None

# ================= LLM 任务 =================

async def task_extract_metadata(text):
    if not text: return None
    logger.info("请求元数据提取 (Pool: Metadata)")
    
    def validate_json(content):
        return "title" in content and len(content) > 20

    safe_text = sanitize_text_for_llm(text)
    prompt = f"""
    你是一个专业的学术文献解析助手。请从论文片段中提取元数据。
    
    【重要提示】：
    1. **作者提取**：作者通常位于标题正下方。如果名字后面带有数字角标，请去除数字。
    2. **格式**：authors 字段请返回一个**字符串**，多个作者用英文逗号拼接。
    
    【输出 JSON 字段】：
    - title (String): 英文标题
    - title_cn (String): 中文翻译标题
    - authors (String): 作者列表字符串
    - journal (String): 期刊名
    - year (Integer): 年份
    - abstract_en (String): 英文摘要原文
    - abstract (String): 中文摘要翻译

    【论文片段】：
    {safe_text} ... 

    【输出要求】：只输出 JSON，不要包含任何解释、Markdown、代码块标记。
    """
    
    try:
        response = await llm_manager.chat(
            pool_name="metadata",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.1,
            validator=validate_json
        )
        content = response.choices[0].message.content
        parsed_json = json.loads(repair_json(content))
        
        if isinstance(parsed_json.get('authors'), list):
            parsed_json['authors'] = ", ".join(parsed_json['authors'])
            
        logger.info(f"元数据提取成功: {parsed_json.get('title_cn')}")
        return parsed_json

    except Exception as e:
        # 部分 OpenAI 兼容中转/网关会对 JSON mode 或大段文本触发拦截（403 blocked）。
        # 这里做一次降级：缩短输入 + 不使用 response_format，再尝试一次。
        try:
            from openai import APIStatusError
        except Exception:
            APIStatusError = ()  # type: ignore

        should_fallback = False
        if APIStatusError and isinstance(e, APIStatusError):
            status_code = getattr(getattr(e, "response", None), "status_code", None)
            body = getattr(e, "body", None)
            msg = str(e) or ""
            body_text = ""
            try:
                if body is not None:
                    body_text = json.dumps(body, ensure_ascii=False)
            except Exception:
                body_text = str(body) if body is not None else ""

            combined = (msg + " " + body_text).lower()
            if status_code in (400, 403) and ("response_format" in combined or "json_object" in combined or "blocked" in combined):
                should_fallback = True

        if should_fallback:
            logger.warning("元数据提取被上游拦截/不兼容，尝试降级请求（缩短文本 + 关闭 JSON mode）")
            fallback_text = safe_text[:4000]
            fallback_prompt = f"""
            你是一个专业的学术文献解析助手。请从论文片段中提取元数据。

            【输出 JSON 字段】：
            - title (String)
            - title_cn (String)
            - authors (String)  # 多个作者用英文逗号拼接
            - journal (String)
            - year (Integer)
            - abstract_en (String)
            - abstract (String)

            【论文片段】：
            {fallback_text}

            【输出要求】：只输出 JSON，不要包含任何解释、Markdown、代码块标记。
            """
            try:
                response = await llm_manager.chat(
                    pool_name="metadata",
                    messages=[{"role": "user", "content": fallback_prompt}],
                    temperature=0.1,
                    validator=validate_json
                )
                content = response.choices[0].message.content
                parsed_json = json.loads(repair_json(content))
                if isinstance(parsed_json.get('authors'), list):
                    parsed_json['authors'] = ", ".join(parsed_json['authors'])
                logger.info(f"元数据提取成功(降级): {parsed_json.get('title_cn')}")
                return parsed_json
            except Exception as e2:
                logger.error(f"Metadata 降级请求失败: {e2}")

        logger.error(f"Metadata 任务失败: {e}")
        raise e

def _get_analysis_prompts(input_text: str) -> tuple[str, str]:
    """
    获取深度分析的 system prompt 和 user prompt
    
    Args:
        input_text: 论文全文
    
    Returns:
        (system_prompt, user_prompt) 元组
    """
    system_prompt = """
    你是一位严谨的学术研究员。请根据用户提供的论文全文，撰写一份【全面、系统、批判性】的分析报告。
    【核心原则】：
    1. **格式严格**：必须严格遵守用户给定的 Markdown 结构。
    2. **屏蔽引用**：不要生成参考文献章节。
    3. **数学公式**：行内公式用 $...$，独立公式用 $$...$$。
    4. **中文报告**：报告必须是中文，除必要的英文描述外，其他内容均需用中文。
    """

    user_prompt = f"""
    请阅读以下论文内容，并按照下方的 <OUTPUT_TEMPLATE> 生成报告。

    <OUTPUT_TEMPLATE>
    1. **结构化**：报告必须包括标题、摘要、引言、方法、实验/结果、讨论、结论、创新点、局限性、未来工作建议，层级使用 Markdown 标题（#、##、###）明确划分。
    2. **信息完整**：对每一章节给出 **概要**（200‑300 字）、**关键技术/方法细节**（公式、算法、实验设计等），并用 **表格或列表** 梳理重要信息。
    3. **批判性评价**：从创新性、理论贡献、实验设计、结果可信度、可重复性、实际应用价值等方面给出 **优点** 与 **缺点**，并提供 **改进建议**。
    4. **可读性**：使用 **简洁、专业的语言**，避免冗长；关键概念用 **粗体** 标记；重要数字、公式或实验结果使用 **代码块或 LaTeX** 进行渲染。

    ---

    ## 📌 输入信息（请完整填写）

    - **论文标题**：`【论文标题】`
    - **作者 / 机构**：`【作者列表】`
    - **出版年份 / 会议 / 期刊**：`【出版信息】`
    - **DOI / 链接**：`【论文链接或 DOI】`
    - **全文（可粘贴或提供链接）**：`【论文全文或 PDF 链接】`
    - **研究背景（可选）**：`【该论文所属领域的简要背景】`
    - **重点关注**（可多选）：
    - ☐ 方法创新
    - ☐ 实验设计
    - ☐ 理论证明
    - ☐ 应用价值
    - ☐ 代码实现
    - ☐ 其他（请说明）`【关注点】`

    ---

    ## 🧭 期望输出（Markdown 报告结构示例）

    ```markdown
    # 论文标题：<论文标题>

    **作者**：<作者列表>
    **出版信息**：<会议/期刊, 年份>
    **DOI / 链接**：<链接>

    ---

    ## 摘要 (Summary)
    - 150‑200 字概括论文核心贡献、方法与主要结论。

    ## 1. 引言 (Introduction)
    - 研究动机、背景、问题定义
    - 与现有工作对比，指出研究空白

    ## 2. 方法 (Methodology)
    ### 2.1 模型/算法概述
    - 关键公式（使用 LaTeX）
    - 算法流程图（文字描述或伪代码）
    ### 2.2 实现细节
    - 数据预处理、超参数设置、硬件环境

    ## 3. 实验设计与结果 (Experiments & Results)
    - 数据集介绍（表格）
    - 实验设置（对比基线、评价指标）
    - 结果展示（表格 + 图表）
    - 消融实验与敏感性分析

    ## 4. 讨论 (Discussion)
    - 结果解读、优势分析
    - 局限性与潜在偏差

    ## 5. 创新点 (Key Contributions)
    - 列举 3‑5 条，使用项目符号

    ## 6. 局限性与改进建议 (Limitations & Future Work)
    - 方法局限、实验限制
    - 未来可能的研究方向

    ## 7. 总结
    - 用一段话总结文章的内容
    </OUTPUT_TEMPLATE>

    ---
    【论文全文输入】：
    {input_text}
    """
    
    return system_prompt, user_prompt


def _validate_analysis(content: str) -> bool:
    """验证分析内容是否有效"""
    if len(content) < 100:
        return False
    bad_words = ["Bad Gateway", "upstream connect error", "Service Unavailable", "<html>"]
    for w in bad_words:
        if w.lower() in content.lower():
            return False
    return True


async def task_analyze_paper(full_text, timeout_seconds: float = 300.0, use_stream: bool = False):
    """
    深度分析论文内容
    
    Args:
        full_text: 论文全文
        timeout_seconds: 超时时间（秒），默认5分钟
        use_stream: 是否使用流式响应，默认 False
    
    Returns:
        分析报告内容
    
    Raises:
        TimeoutError: LLM 请求超时
        Exception: 其他错误
    """
    if not full_text: return "无内容"
    logger.info(f"请求深度分析 (Pool: Analysis, 超时: {timeout_seconds}秒, 流式: {use_stream})")
    
    system_prompt, user_prompt = _get_analysis_prompts(full_text)
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]

    try:
        if use_stream:
            # 使用流式响应 - 更稳定，可以更早发现问题
            logger.info("使用流式响应模式")
            content = await asyncio.wait_for(
                llm_manager.chat_stream(
                    pool_name="analysis",
                    messages=messages,
                    temperature=0.2,
                    response_format={"type": "text"}
                ),
                timeout=timeout_seconds
            )
            
            # 验证内容
            if not _validate_analysis(content):
                raise ValueError(f"内容质检未通过: {content[:50]}...")
            
            logger.info("详细报告生成成功 (流式)")
            return content
        else:
            # 使用普通响应
            response = await asyncio.wait_for(
                llm_manager.chat(
                    pool_name="analysis",
                    messages=messages,
                    temperature=0.2,
                    response_format={"type": "text"},
                    validator=_validate_analysis
                ),
                timeout=timeout_seconds
            )
            logger.info("详细报告生成成功")
            return response.choices[0].message.content
            
    except asyncio.TimeoutError:
        logger.error(f"Analysis 任务超时 (超过 {timeout_seconds} 秒)")
        raise TimeoutError(f"LLM 深度分析请求超时（超过 {timeout_seconds} 秒），请检查网络连接或稍后重试")
    except Exception as e:
        logger.error(f"Analysis 任务失败: {e}")
        raise e

# ================= 核心编排 =================

async def process_workflow(pdf_path, file_md5=None, owner_id=None, file_info=None):
    """
    处理 PDF 文件的完整工作流
    
    Args:
        pdf_path: PDF 文件路径
        file_md5: 文件 MD5 哈希值
        owner_id: 当前上传用户的 ID
        file_info: 文件存储信息（可选），包含 file_path, file_size, original_filename, uploaded_at
    """
    # 1. 解析 PDF
    workflow_logger.log_start(pdf_path)
    head_text, full_text = extract_pdf_content(pdf_path)
    if not head_text: raise ValueError("PDF解析为空")

    # 2. 提取元数据 (Metadata)
    workflow_logger.log_step(1, 4, "提取元数据以查重")
    metadata = await task_extract_metadata(head_text)
    
    if not metadata or not metadata.get('title'):
        raise ValueError("元数据提取失败，无法查重")

    # === 🛑 语义查重（用户范围内）===
    current_title = metadata.get('title')
    normalized_current = normalize_title(current_title)
    
    session = DBSession()
    try:
        # 只查询当前用户的论文进行语义去重
        if owner_id:
            existing_papers = session.query(Paper.title).filter(Paper.owner_id == owner_id).all()
        else:
            existing_papers = session.query(Paper.title).all()
        
        for (db_title,) in existing_papers:
            if normalize_title(db_title) == normalized_current:
                workflow_logger.log_skip(pdf_path, f"语义重复: {current_title}")
                raise FileExistsError(f"语义重复: {current_title}")
    finally:
        session.close()

    logger.info("通过查重，开始深度分析")
    
    # 3. 深度分析 (Analysis)
    workflow_logger.log_step(2, 4, "深度分析")
    analysis = await task_analyze_paper(full_text)

    # 4. 入库 (关联 Owner 和文件信息)
    workflow_logger.log_step(3, 4, "写入数据库")
    session = DBSession()
    try:
        new_paper = Paper(
            md5_hash=file_md5,
            title=metadata.get('title'),
            title_cn=metadata.get('title_cn'),
            journal=metadata.get('journal'),
            year=str(metadata.get('year')),
            authors=metadata.get('authors'),
            abstract_en=metadata.get('abstract_en'),
            abstract=metadata.get('abstract'),
            detailed_analysis=analysis,
            owner_id=owner_id,
            # 文件存储信息
            file_path=file_info.get('file_path') if file_info else None,
            file_size=file_info.get('file_size') if file_info else None,
            original_filename=file_info.get('original_filename') if file_info else None,
            uploaded_at=file_info.get('uploaded_at') if file_info else None
        )
        session.add(new_paper)
        session.commit()
        workflow_logger.log_complete(pdf_path, metadata.get('title', ''))
        
    except Exception as e:
        session.rollback()
        raise e
    finally:
        session.close()


async def reanalyze_paper(paper_id: int, owner_id: int = None):
    """
    重新分析已存储的论文
    
    Args:
        paper_id: 论文 ID
        owner_id: 当前用户 ID（用于权限检查）
    
    Returns:
        更新后的分析结果
    
    Raises:
        ValueError: 论文不存在或无权限
        FileNotFoundError: PDF 文件不存在
    """
    from backend.core.file_service import file_service
    
    session = DBSession()
    try:
        paper = session.query(Paper).filter(Paper.id == paper_id).first()
        
        if not paper:
            raise ValueError("论文不存在")
        
        # 权限检查（如果提供了 owner_id）
        if owner_id and paper.owner_id != owner_id:
            raise ValueError("无权重新分析此论文")
        
        # 获取 PDF 文件路径
        file_path = file_service.resolve_paper_file_path(
            relative_path=paper.file_path,
            user_id=paper.owner_id,
            md5_hash=paper.md5_hash
        )
        
        if not file_path or not os.path.exists(file_path):
            raise FileNotFoundError("PDF 文件不存在，无法重新分析")
        
        # 重新提取 PDF 内容
        logger.info(f"开始重新分析论文: {paper.title}")
        head_text, full_text = extract_pdf_content(file_path)
        
        if not full_text:
            raise ValueError("PDF 内容提取失败")

        # 尝试重新提取元数据（可选，失败不影响继续生成分析）
        metadata = None
        try:
            if head_text:
                metadata = await task_extract_metadata(head_text)
        except Exception as meta_error:
            logger.warning(f"重新分析：元数据提取失败，跳过更新元数据: {meta_error}")
        
        # 重新进行深度分析
        analysis = await task_analyze_paper(full_text)
        
        # 更新数据库
        paper.detailed_analysis = analysis
        if metadata and metadata.get("title"):
            paper.title = metadata.get("title")
            paper.title_cn = metadata.get("title_cn")
            paper.journal = metadata.get("journal")
            paper.year = str(metadata.get("year")) if metadata.get("year") is not None else paper.year
            paper.authors = metadata.get("authors")
            paper.abstract_en = metadata.get("abstract_en")
            paper.abstract = metadata.get("abstract")
        session.commit()
        
        logger.info(f"论文重新分析完成: {paper.title}")
        return analysis
        
    except Exception as e:
        session.rollback()
        raise e
    finally:
        session.close()

