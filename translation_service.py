"""
翻译服务封装模块
封装 pdf2zh-next 的翻译功能，提供统一的翻译接口
"""

import os
import asyncio
from pathlib import Path
from typing import Optional, AsyncGenerator, Dict, Any
from datetime import datetime

from log_service import get_logger
from db_models import Session, Paper, TranslationLLMProvider, TranslationLog

logger = get_logger("translation_service")


class TranslationService:
    """PDF 翻译服务"""
    
    def __init__(self):
        self._load_config()
    
    def _load_config(self):
        """加载翻译配置"""
        from dotenv import load_dotenv
        load_dotenv()
        
        # 翻译参数配置
        self.max_pages_per_part = int(os.getenv("TRANSLATION_MAX_PAGES_PER_PART", "50"))
        self.qps = int(os.getenv("TRANSLATION_QPS", "4"))
        self.lang_in = os.getenv("TRANSLATION_LANG_IN", "en")
        self.lang_out = os.getenv("TRANSLATION_LANG_OUT", "zh")
        
        # 重试配置
        self.retry_max = int(os.getenv("TRANSLATION_RETRY_MAX", "3"))
        self.retry_delay = int(os.getenv("TRANSLATION_RETRY_DELAY", "60"))
        self.retry_backoff = float(os.getenv("TRANSLATION_RETRY_BACKOFF", "2.0"))
        self.task_timeout = int(os.getenv("TRANSLATION_TASK_TIMEOUT", "30"))
    
    def _build_settings(self, provider: TranslationLLMProvider, output_dir: str) -> "SettingsModel":
        """
        根据提供商配置构建 pdf2zh-next 的 SettingsModel
        
        Args:
            provider: 翻译 LLM 提供商配置
            output_dir: 输出目录
            
        Returns:
            SettingsModel 配置对象
        """
        from pdf2zh_next.config.model import SettingsModel, TranslationSettings, PDFSettings
        from pdf2zh_next.config.translate_engine_model import (
            OpenAISettings, DeepSeekSettings, OllamaSettings, GeminiSettings,
            GoogleSettings, DeepLSettings, AzureSettings, OpenAICompatibleSettings,
            SiliconFlowSettings, ZhipuSettings, GroqSettings, AliyunDashScopeSettings
        )
        
        # 构建翻译引擎设置
        engine_type = provider.engine_type.lower()
        translate_engine_settings = None
        
        if engine_type == "openai":
            translate_engine_settings = OpenAISettings(
                openai_api_key=provider.api_key,
                openai_base_url=provider.base_url or "https://api.openai.com/v1",
                openai_model=provider.model or "gpt-4o-mini",
            )
        elif engine_type == "deepseek":
            translate_engine_settings = DeepSeekSettings(
                deepseek_api_key=provider.api_key,
                deepseek_model=provider.model or "deepseek-chat",
            )
        elif engine_type == "google":
            translate_engine_settings = GoogleSettings()
        elif engine_type == "deepl":
            translate_engine_settings = DeepLSettings(
                deepl_auth_key=provider.api_key,
            )
        elif engine_type == "ollama":
            translate_engine_settings = OllamaSettings(
                ollama_host=provider.base_url or "http://localhost:11434",
                ollama_model=provider.model or "gemma2",
            )
        elif engine_type == "gemini":
            translate_engine_settings = GeminiSettings(
                gemini_api_key=provider.api_key,
                gemini_model=provider.model or "gemini-1.5-flash",
            )
        elif engine_type == "azure":
            translate_engine_settings = AzureSettings(
                azure_api_key=provider.api_key,
                azure_endpoint=provider.base_url,
            )
        elif engine_type == "siliconflow":
            translate_engine_settings = SiliconFlowSettings(
                siliconflow_api_key=provider.api_key,
                siliconflow_base_url=provider.base_url or "https://api.siliconflow.cn/v1",
                siliconflow_model=provider.model or "Qwen/Qwen2.5-7B-Instruct",
            )
        elif engine_type == "zhipu":
            translate_engine_settings = ZhipuSettings(
                zhipu_api_key=provider.api_key,
                zhipu_model=provider.model or "glm-4-flash",
            )
        elif engine_type == "groq":
            translate_engine_settings = GroqSettings(
                groq_api_key=provider.api_key,
                groq_model=provider.model or "llama-3-3-70b-versatile",
            )
        elif engine_type == "aliyundashscope":
            translate_engine_settings = AliyunDashScopeSettings(
                aliyun_dashscope_api_key=provider.api_key,
                aliyun_dashscope_base_url=provider.base_url or "https://dashscope.aliyuncs.com/compatible-mode/v1",
                aliyun_dashscope_model=provider.model or "qwen-plus-latest",
            )
        elif engine_type == "openaicompatible":
            translate_engine_settings = OpenAICompatibleSettings(
                openai_compatible_api_key=provider.api_key,
                openai_compatible_base_url=provider.base_url,
                openai_compatible_model=provider.model or "gpt-4o-mini",
            )
        else:
            # 默认使用 OpenAI 兼容模式
            translate_engine_settings = OpenAICompatibleSettings(
                openai_compatible_api_key=provider.api_key,
                openai_compatible_base_url=provider.base_url,
                openai_compatible_model=provider.model or "gpt-4o-mini",
            )
        
        # 构建完整的 SettingsModel
        settings = SettingsModel(
            translation=TranslationSettings(
                lang_in=self.lang_in,
                lang_out=self.lang_out,
                output=output_dir,
                qps=provider.qps if provider.qps else self.qps,
            ),
            pdf=PDFSettings(
                max_pages_per_part=self.max_pages_per_part,
            ),
            translate_engine_settings=translate_engine_settings,
        )
        
        return settings
    
    def _log_to_db(
        self, 
        level: str, 
        message: str, 
        task_id: Optional[int] = None, 
        paper_id: Optional[int] = None,
        details: Optional[Dict] = None
    ):
        """记录日志到数据库"""
        session = Session()
        try:
            log_entry = TranslationLog(
                task_id=task_id,
                paper_id=paper_id,
                level=level,
                message=message,
                details=details,
                created_at=datetime.now().isoformat()
            )
            session.add(log_entry)
            session.commit()
        except Exception as e:
            logger.error(f"写入翻译日志失败: {e}")
        finally:
            session.close()
    
    def get_provider(self, provider_id: Optional[int] = None) -> Optional[TranslationLLMProvider]:
        """
        获取翻译提供商
        
        Args:
            provider_id: 指定的提供商 ID，如果为 None 则获取优先级最高的启用提供商
            
        Returns:
            TranslationLLMProvider 或 None
        """
        session = Session()
        try:
            if provider_id:
                provider = session.query(TranslationLLMProvider).filter(
                    TranslationLLMProvider.id == provider_id,
                    TranslationLLMProvider.enabled == True
                ).first()
            else:
                provider = session.query(TranslationLLMProvider).filter(
                    TranslationLLMProvider.enabled == True
                ).order_by(TranslationLLMProvider.priority).first()
            
            if provider:
                # 分离对象以便在 session 关闭后使用
                session.expunge(provider)
            return provider
        finally:
            session.close()
    
    def get_paper_pdf_path(self, paper: Paper) -> Optional[str]:
        """获取论文的 PDF 文件路径"""
        from file_service import file_service
        
        if paper.file_path:
            return file_service.get_file_path_by_relative(paper.file_path)
        elif paper.md5_hash and paper.owner_id:
            return file_service.get_file_path(paper.owner_id, paper.md5_hash)
        return None
    
    def get_output_paths(self, input_path: str) -> Dict[str, str]:
        """
        根据输入路径生成输出文件路径
        
        pdf2zh-next 生成的文件名格式：
        - 中文版: {base_name}.zh.mono.pdf
        - 双语版: {base_name}.zh.dual.pdf
        - 词汇表: {base_name}.zh.glossary.csv (需要删除)
        
        Args:
            input_path: 原始 PDF 路径
            
        Returns:
            包含 mono_path 和 dual_path 的字典
        """
        input_path = Path(input_path)
        base_name = input_path.stem
        output_dir = input_path.parent
        
        return {
            "mono_path": str(output_dir / f"{base_name}.zh.mono.pdf"),
            "dual_path": str(output_dir / f"{base_name}.zh.dual.pdf"),
            "glossary_path": str(output_dir / f"{base_name}.zh.glossary.csv"),
        }
    
    def cleanup_glossary_file(self, input_path: str):
        """
        删除翻译生成的词汇表文件
        
        Args:
            input_path: 原始 PDF 路径
        """
        output_paths = self.get_output_paths(input_path)
        glossary_path = output_paths.get("glossary_path")
        if glossary_path and os.path.exists(glossary_path):
            try:
                os.remove(glossary_path)
                logger.info(f"已删除词汇表文件: {glossary_path}")
            except Exception as e:
                logger.warning(f"删除词汇表文件失败: {e}")
    
    async def translate_pdf(
        self,
        paper_id: int,
        provider_id: Optional[int] = None,
        task_id: Optional[int] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        翻译 PDF 文件（异步生成器）
        
        Args:
            paper_id: 论文 ID
            provider_id: 翻译提供商 ID（可选）
            task_id: 翻译任务 ID（可选，用于日志记录）
            
        Yields:
            翻译进度事件字典
        """
        session = Session()
        try:
            # 获取论文信息
            paper = session.query(Paper).filter(Paper.id == paper_id).first()
            if not paper:
                yield {"type": "error", "error": "论文不存在"}
                return
            
            # 获取 PDF 路径
            pdf_path = self.get_paper_pdf_path(paper)
            if not pdf_path or not os.path.exists(pdf_path):
                yield {"type": "error", "error": "PDF 文件不存在"}
                return
            
            # 获取翻译提供商
            provider = self.get_provider(provider_id)
            if not provider:
                yield {"type": "error", "error": "没有可用的翻译提供商"}
                return
            
            # 记录开始日志
            self._log_to_db(
                "INFO", 
                f"开始翻译论文: {paper.title or paper_id}",
                task_id=task_id,
                paper_id=paper_id,
                details={"provider": provider.name, "engine": provider.engine_type}
            )
            logger.info(f"[task_{task_id}] 开始翻译论文: {paper_id}, 使用提供商: {provider.name}")
            
            # 构建配置
            output_dir = str(Path(pdf_path).parent)
            settings = self._build_settings(provider, output_dir)
            
            # 调用 pdf2zh-next 进行翻译
            from pdf2zh_next.high_level import do_translate_async_stream
            
            output_paths = self.get_output_paths(pdf_path)
            
            # 注意：do_translate_async_stream 的参数顺序是 (settings, file)
            async for event in do_translate_async_stream(settings, pdf_path):
                event_type = event.get("type", "")
                
                if event_type == "stage_summary":
                    yield {
                        "type": "stage",
                        "stage": event.get("stage", ""),
                        "message": event.get("message", "")
                    }
                    self._log_to_db(
                        "DEBUG",
                        f"翻译阶段: {event.get('stage', '')}",
                        task_id=task_id,
                        paper_id=paper_id
                    )
                
                elif event_type == "progress_start":
                    yield {
                        "type": "progress_start",
                        "stage": event.get("stage", ""),
                        "total": event.get("total", 0)
                    }
                
                elif event_type == "progress_update":
                    progress = event.get("progress", 0)
                    total = event.get("total", 1)
                    overall_progress = int((progress / total) * 100) if total > 0 else 0
                    
                    yield {
                        "type": "progress",
                        "progress": progress,
                        "total": total,
                        "overall_progress": overall_progress,
                        "stage": event.get("stage", ""),
                        "part_index": event.get("part_index", 0),
                        "total_parts": event.get("total_parts", 1)
                    }
                
                elif event_type == "progress_end":
                    yield {
                        "type": "progress_end",
                        "stage": event.get("stage", "")
                    }
                
                elif event_type == "finish":
                    # 翻译完成
                    mono_path = event.get("translate_path", output_paths["mono_path"])
                    dual_path = event.get("translate_dual_path", output_paths["dual_path"])
                    
                    # 删除词汇表文件
                    self.cleanup_glossary_file(pdf_path)
                    
                    # 更新论文记录
                    paper.translation_status = "completed"
                    paper.translation_progress = 100
                    paper.translated_file_path = mono_path
                    paper.translated_dual_path = dual_path
                    paper.translated_at = datetime.now().isoformat()
                    paper.translation_error = None
                    session.commit()
                    
                    self._log_to_db(
                        "INFO",
                        f"翻译完成: {paper.title or paper_id}",
                        task_id=task_id,
                        paper_id=paper_id,
                        details={"mono_path": mono_path, "dual_path": dual_path}
                    )
                    logger.info(f"[task_{task_id}] 翻译完成: {paper_id}")
                    
                    yield {
                        "type": "finish",
                        "mono_path": mono_path,
                        "dual_path": dual_path
                    }
                
                elif event_type == "error":
                    error_msg = event.get("error", "翻译失败")
                    
                    paper.translation_status = "failed"
                    paper.translation_error = error_msg
                    session.commit()
                    
                    self._log_to_db(
                        "ERROR",
                        f"翻译失败: {error_msg}",
                        task_id=task_id,
                        paper_id=paper_id
                    )
                    logger.error(f"[task_{task_id}] 翻译失败: {paper_id}, 错误: {error_msg}")
                    
                    yield {"type": "error", "error": error_msg}
        
        except Exception as e:
            import traceback
            error_msg = str(e)
            stack_trace = traceback.format_exc()
            self._log_to_db(
                "ERROR",
                f"翻译异常: {error_msg}",
                task_id=task_id,
                paper_id=paper_id,
                details={"stack_trace": stack_trace}
            )
            logger.error(f"[task_{task_id}] 翻译异常: {paper_id}, 错误: {error_msg}\n{stack_trace}")
            yield {"type": "error", "error": error_msg}
        
        finally:
            session.close()


# 全局翻译服务实例
translation_service = TranslationService()