"""
上传进度路由 - 使用 SSE 推送处理进度
"""
import os
import sys
import asyncio
import hashlib
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

from deps import get_db, get_current_user

router = APIRouter(prefix="/api/upload-stream", tags=["上传流"])


async def process_with_progress(file_content: bytes, filename: str, md5: str, owner_id: int, db: Session):
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
    
    # 步骤 1: 保存临时文件
    yield {"step": 1, "total": 4, "message": "保存临时文件...", "status": "processing"}
    
    temp_dir = os.path.join(root_dir, "temp")
    os.makedirs(temp_dir, exist_ok=True)
    temp_path = os.path.join(temp_dir, filename)
    
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
        
        # 检查语义重复
        normalized_current = normalize_title(title)
        existing_papers = db.query(Paper.title).all()
        for (db_title,) in existing_papers:
            if normalize_title(db_title) == normalized_current:
                yield {"step": 3, "total": 4, "message": f"语义重复: {title[:30]}...", "status": "error"}
                return
        
        # 步骤 4: 深度分析
        yield {"step": 4, "total": 4, "message": "深度分析 (调用 LLM)...", "status": "processing"}
        analysis = await task_analyze_paper(full_text)
        
        # 写入数据库
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
            owner_id=owner_id
        )
        db.add(new_paper)
        db.commit()
        
        yield {"step": 4, "total": 4, "message": f"处理完成: {title[:30]}...", "status": "success"}
        
    except Exception as e:
        yield {"step": 0, "total": 4, "message": f"处理失败: {str(e)[:50]}", "status": "error"}
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


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
            
            # 检查 MD5 重复
            if db.query(Paper.id).filter(Paper.md5_hash == md5).first():
                yield f"data: {json.dumps({**base_info, 'step': 0, 'total': 4, 'message': '文件已存在 (MD5 重复)', 'status': 'error'})}\n\n"
                continue
            
            yield f"data: {json.dumps({**base_info, 'step': 0, 'total': 4, 'message': '开始处理...', 'status': 'processing'})}\n\n"
            
            async for progress in process_with_progress(content, file.filename, md5, current_user.id, db):
                progress.update(base_info)
                yield f"data: {json.dumps(progress)}\n\n"
        
        yield f"data: {json.dumps({'done': True})}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )

