"""
上传进度路由 - 使用 SSE 推送处理进度
"""
import os
import sys
import asyncio
import hashlib
from datetime import datetime
from fastapi import APIRouter, Depends, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List
import json

# 添加父目录到路径
root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, root_dir)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db_models import Paper, User
from utils import calculate_md5
from file_service import file_service

from deps import get_db, get_current_user

router = APIRouter(prefix="/api/upload-stream", tags=["上传流"])


async def process_with_progress(file_content: bytes, filename: str, md5: str, owner_id: int, db: Session, file_info: dict = None):
    """处理文件并 yield 进度更新"""
    import importlib.util
    
    # 使用 importlib 明确加载根目录的 main.py（避免与 backend/main.py 冲突）
    main_path = os.path.join(root_dir, "main.py")
    spec = importlib.util.spec_from_file_location("paper_main", main_path)
    paper_main = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(paper_main)
    
    extract_pdf_content = paper_main.extract_pdf_content
    task_extract_metadata = paper_main.task_extract_metadata
    task_analyze_paper = paper_main.task_analyze_paper
    normalize_title = paper_main.normalize_title
    
    # 获取 llm_manager (已在 paper_main 中初始化)
    from llm_pool import llm_manager
    
    # 步骤 1: 保存临时文件用于处理
    yield {"step": 1, "total": 4, "message": "保存文件...", "status": "processing"}
    
    temp_path = file_service.get_temp_path(filename)
    
    with open(temp_path, "wb") as f:
        f.write(file_content)
    
    try:
        # 确保使用最新的 LLM 配置
        llm_manager.reload_config()
        
        # 步骤 2: 解析 PDF
        yield {"step": 2, "total": 4, "message": "解析 PDF 内容...", "status": "processing"}
        head_text, full_text = extract_pdf_content(temp_path)
        
        if not head_text:
            yield {"step": 2, "total": 4, "message": "PDF 解析失败", "status": "error"}
            return
        
        # 步骤 3: 提取元数据
        yield {"step": 3, "total": 4, "message": "提取元数据 (调用 LLM)...", "status": "processing"}
        metadata = await task_extract_metadata(head_text)
        
        if not metadata or not metadata.get('title'):
            yield {"step": 3, "total": 4, "message": "元数据提取失败", "status": "error"}
            return
        
        title = metadata.get('title', filename)
        yield {"step": 3, "total": 4, "message": f"元数据提取成功: {title[:30]}...", "status": "processing"}
        
        # 检查语义重复（用户范围内）
        normalized_current = normalize_title(title)
        existing_papers = db.query(Paper.title).filter(Paper.owner_id == owner_id).all()
        for (db_title,) in existing_papers:
            if normalize_title(db_title) == normalized_current:
                yield {"step": 3, "total": 4, "message": f"语义重复: {title[:30]}...", "status": "error"}
                return
        
        # 步骤 4: 深度分析 - 使用流式响应以提高稳定性
        yield {"step": 4, "total": 4, "message": "深度分析 (调用 LLM, 流式模式)...", "status": "processing"}
        analysis = await task_analyze_paper(full_text, use_stream=True)
        
        # 写入数据库（包含文件信息）
        yield {"step": 4, "total": 4, "message": "写入数据库...", "status": "processing"}
        new_paper = Paper(
            md5_hash=md5,
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
        db.add(new_paper)
        db.commit()
        
        yield {"step": 4, "total": 4, "message": f"处理完成: {title[:30]}...", "status": "success"}
        
    except TimeoutError as e:
        yield {"step": 0, "total": 4, "message": f"请求超时: {str(e)[:80]}", "status": "error"}
    except Exception as e:
        error_msg = str(e)
        # 提供更详细的错误信息
        if "timeout" in error_msg.lower():
            yield {"step": 0, "total": 4, "message": f"请求超时: {error_msg[:80]}", "status": "error"}
        else:
            yield {"step": 0, "total": 4, "message": f"处理失败: {error_msg[:80]}", "status": "error"}
    finally:
        # 清理临时文件
        file_service.cleanup_temp(filename)


@router.post("")
async def upload_with_stream(
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """上传 PDF 并通过 SSE 返回处理进度"""
    
    async def generate():
        total_files = len(files)
        
        for file_index, file in enumerate(files):
            base_info = {
                'filename': file.filename,
                'fileIndex': file_index,
                'totalFiles': total_files
            }
            
            if not file.filename.lower().endswith('.pdf'):
                yield f"data: {json.dumps({**base_info, 'step': 0, 'total': 4, 'message': '不是 PDF 文件', 'status': 'error'})}\n\n"
                continue
            
            content = await file.read()
            md5 = calculate_md5(content)
            
            # 检查当前用户是否已有此 MD5 的文件（用户范围去重）
            existing = db.query(Paper.id).filter(
                Paper.md5_hash == md5,
                Paper.owner_id == current_user.id
            ).first()
            if existing:
                yield f"data: {json.dumps({**base_info, 'step': 0, 'total': 4, 'message': '文件已存在 (MD5 重复)', 'status': 'error'})}\n\n"
                continue
            
            yield f"data: {json.dumps({**base_info, 'step': 0, 'total': 4, 'message': '开始处理...', 'status': 'processing'})}\n\n"
            
            # 保存文件到用户目录（持久化存储）
            file_info = file_service.save_file(
                content=content,
                user_id=current_user.id,
                md5_hash=md5,
                original_filename=file.filename
            )
            
            # 标记是否处理成功
            process_success = False
            
            async for progress in process_with_progress(content, file.filename, md5, current_user.id, db, file_info):
                progress.update(base_info)
                yield f"data: {json.dumps(progress)}\n\n"
                
                # 检查是否处理成功
                if progress.get('status') == 'success':
                    process_success = True
                elif progress.get('status') == 'error':
                    # 处理失败，删除已保存的文件
                    file_service.delete_file(current_user.id, md5)
        
        yield f"data: {json.dumps({'done': True})}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )

