"""
翻译 API 路由
提供 PDF 翻译相关的 API 接口
"""

import os
import sys
import json
import asyncio
from pathlib import Path
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from fastapi.responses import StreamingResponse, FileResponse
from sqlalchemy.orm import Session

# 添加父目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from db_models import Paper, User, TranslationLLMProvider, TranslationQueue, Session as DBSession
from deps import get_db, get_current_user, get_current_admin
from schemas import (
    TranslateRequest, BatchTranslateRequest, TranslateStatusResponse,
    TranslationQueueStats, TranslationProviderCreate, TranslationProviderResponse
)

router = APIRouter(prefix="/api/translate", tags=["翻译"])


# ================= 翻译任务 API =================

@router.post("/papers/{paper_id}")
async def start_translation(
    paper_id: int,
    request: TranslateRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """添加单篇论文到翻译队列"""
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")
    
    if current_user.role != "admin" and paper.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权翻译此论文")
    
    # 检查是否有原始 PDF
    from file_service import file_service
    
    pdf_path = None
    if paper.file_path:
        pdf_path = file_service.get_file_path_by_relative(paper.file_path)
    elif paper.md5_hash and paper.owner_id:
        pdf_path = file_service.get_file_path(paper.owner_id, paper.md5_hash)
    
    if not pdf_path or not os.path.exists(pdf_path):
        raise HTTPException(status_code=400, detail="原始 PDF 文件不存在")
    
    # 检查是否正在翻译
    if paper.translation_status == "processing":
        raise HTTPException(status_code=400, detail="论文正在翻译中")
    
    # 添加到翻译队列
    from translation_queue import translation_queue_manager
    
    try:
        task = translation_queue_manager.add_to_queue(
            paper_id=paper_id,
            user_id=current_user.id,
            provider_id=request.provider_id,
            priority=request.priority or 100
        )
        return {"message": "已添加到翻译队列", "task_id": task.id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/batch")
async def batch_translate(
    request: BatchTranslateRequest,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """批量添加翻译任务（管理员）"""
    from translation_queue import translation_queue_manager
    
    result = translation_queue_manager.batch_add_to_queue(
        paper_ids=request.paper_ids,
        user_id=current_user.id,
        provider_id=request.provider_id,
        priority=request.priority or 100
    )
    
    return {
        "message": f"已添加 {result['added']} 个任务，跳过 {result['skipped']} 个",
        **result
    }


@router.get("/papers/{paper_id}/status", response_model=TranslateStatusResponse)
async def get_translation_status(
    paper_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取翻译状态"""
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")
    
    if current_user.role != "admin" and paper.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权查看此论文")
    
    return TranslateStatusResponse(
        paper_id=paper_id,
        status=paper.translation_status,
        progress=paper.translation_progress or 0,
        error=paper.translation_error,
        translated_file_path=paper.translated_file_path,
        translated_dual_path=paper.translated_dual_path,
        translated_at=paper.translated_at
    )


@router.get("/papers/{paper_id}/stream")
async def stream_translation_progress(
    paper_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """SSE 流式获取翻译进度"""
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")
    
    if current_user.role != "admin" and paper.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权查看此论文")
    
    async def event_generator():
        last_progress = -1
        
        while True:
            session = DBSession()
            try:
                p = session.query(Paper).filter(Paper.id == paper_id).first()
                if p:
                    status = p.translation_status
                    progress = p.translation_progress or 0
                    error = p.translation_error
                    
                    if progress != last_progress or status in ["completed", "failed"]:
                        last_progress = progress
                        data = json.dumps({
                            "status": status,
                            "progress": progress,
                            "error": error
                        })
                        yield f"data: {data}\n\n"
                    
                    if status in ["completed", "failed"]:
                        break
            finally:
                session.close()
            
            await asyncio.sleep(1)
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream"
    )


# ================= 下载 API =================

def sanitize_filename(title: str) -> str:
    """
    清理文件名，移除不合法字符
    """
    import re
    # 移除 Windows 和 Unix 不允许的文件名字符
    sanitized = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '', title)
    # 移除首尾空格和点
    sanitized = sanitized.strip(' .')
    # 如果为空，使用默认名称
    return sanitized if sanitized else 'paper'


@router.get("/papers/{paper_id}/download/{file_type}")
async def download_translated_pdf(
    paper_id: int,
    file_type: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    下载 PDF 文件
    
    file_type:
    - original: 原始英文 PDF
    - zh: 中文翻译版 PDF
    - dual: 双语对照版 PDF
    
    文件命名规则:
    - 英文原版: {论文标题}.pdf
    - 中文版: {论文标题}_zh.pdf
    - 双语对照版: {论文标题}_dual.pdf
    """
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")
    
    if current_user.role != "admin" and paper.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权下载此论文")
    
    from file_service import file_service
    
    # 清理论文标题作为文件名
    base_name = sanitize_filename(paper.title or 'paper')
    
    if file_type == "original":
        # 原始 PDF: {论文标题}.pdf
        if paper.file_path:
            file_path = file_service.get_file_path_by_relative(paper.file_path)
        elif paper.md5_hash and paper.owner_id:
            file_path = file_service.get_file_path(paper.owner_id, paper.md5_hash)
        else:
            file_path = None
        filename = f"{base_name}.pdf"
    
    elif file_type == "zh":
        # 中文版: {论文标题}_zh.pdf
        if paper.translation_status != "completed":
            raise HTTPException(status_code=400, detail="论文尚未翻译完成")
        file_path = paper.translated_file_path
        filename = f"{base_name}_zh.pdf"
    
    elif file_type == "dual":
        # 双语对照版: {论文标题}_dual.pdf
        if paper.translation_status != "completed":
            raise HTTPException(status_code=400, detail="论文尚未翻译完成")
        file_path = paper.translated_dual_path
        filename = f"{base_name}_dual.pdf"
    
    else:
        raise HTTPException(status_code=400, detail="无效的文件类型，可选: original, zh, dual")
    
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    
    encoded_filename = quote(filename)
    
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"
        }
    )


# ================= 队列管理 API（管理员）=================

@router.get("/queue/stats", response_model=TranslationQueueStats)
async def get_queue_stats(
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """获取翻译队列统计（管理员）"""
    from translation_queue import translation_queue_manager
    
    stats = translation_queue_manager.get_queue_stats()
    return TranslationQueueStats(**stats)


@router.get("/queue/tasks")
async def get_queue_tasks(
    status: Optional[str] = Query(None, description="筛选状态: pending, processing, completed, failed"),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """获取翻译队列任务列表（管理员）"""
    from translation_queue import translation_queue_manager
    
    tasks = translation_queue_manager.get_tasks(status=status, limit=limit)
    return {"tasks": tasks}


@router.post("/queue/start")
async def start_translation_worker(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_admin)
):
    """启动翻译工作线程（管理员）"""
    from translation_queue import translation_queue_manager
    
    if translation_queue_manager.is_running:
        return {"message": "翻译工作线程已在运行"}
    
    background_tasks.add_task(translation_queue_manager.start_worker)
    return {"message": "翻译工作线程已启动"}


@router.post("/queue/stop")
async def stop_translation_worker(
    current_user: User = Depends(get_current_admin)
):
    """停止翻译工作线程（管理员）"""
    from translation_queue import translation_queue_manager
    
    translation_queue_manager.stop_worker()
    return {"message": "翻译工作线程已停止"}


@router.delete("/queue/tasks/{task_id}")
async def cancel_translation_task(
    task_id: int,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """取消翻译任务（管理员）"""
    from translation_queue import translation_queue_manager
    
    success = translation_queue_manager.cancel_task(task_id)
    if success:
        return {"message": "任务已取消"}
    else:
        raise HTTPException(status_code=404, detail="任务不存在或无法取消")


# ================= 翻译 LLM 提供商管理 API（管理员）=================

@router.get("/providers")
async def get_translation_providers(
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """获取翻译 LLM 提供商列表"""
    providers = db.query(TranslationLLMProvider).order_by(
        TranslationLLMProvider.priority
    ).all()
    
    return {
        "providers": [
            {
                "id": p.id,
                "name": p.name,
                "engine_type": p.engine_type,
                "base_url": p.base_url,
                "model": p.model,
                "priority": p.priority,
                "qps": p.qps,
                "pool_max_workers": p.pool_max_workers,
                "no_auto_extract_glossary": p.no_auto_extract_glossary,
                "disable_rich_text_translate": p.disable_rich_text_translate,
                "enabled": p.enabled,
                "created_at": p.created_at,
                "has_api_key": bool(p.api_key and len(p.api_key) > 0)  # 显示是否已配置 API Key
            }
            for p in providers
        ]
    }


@router.post("/providers")
async def create_translation_provider(
    request: TranslationProviderCreate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """创建翻译 LLM 提供商"""
    provider = TranslationLLMProvider(
        name=request.name,
        engine_type=request.engine_type,
        base_url=request.base_url,
        api_key=request.api_key,
        model=request.model,
        priority=request.priority,
        qps=request.qps,
        pool_max_workers=request.pool_max_workers,
        no_auto_extract_glossary=request.no_auto_extract_glossary,
        disable_rich_text_translate=request.disable_rich_text_translate,
        enabled=request.enabled
    )
    db.add(provider)
    db.commit()
    db.refresh(provider)
    
    return {"message": "创建成功", "id": provider.id}


@router.put("/providers/{provider_id}")
async def update_translation_provider(
    provider_id: int,
    request: TranslationProviderCreate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """更新翻译 LLM 提供商"""
    provider = db.query(TranslationLLMProvider).filter(
        TranslationLLMProvider.id == provider_id
    ).first()
    
    if not provider:
        raise HTTPException(status_code=404, detail="提供商不存在")
    
    provider.name = request.name
    provider.engine_type = request.engine_type
    provider.base_url = request.base_url
    if request.api_key:  # 只有提供了新 key 才更新
        provider.api_key = request.api_key
    provider.model = request.model
    provider.priority = request.priority
    provider.qps = request.qps
    provider.pool_max_workers = request.pool_max_workers
    provider.no_auto_extract_glossary = request.no_auto_extract_glossary
    provider.disable_rich_text_translate = request.disable_rich_text_translate
    provider.enabled = request.enabled
    
    db.commit()
    return {"message": "更新成功"}


@router.delete("/providers/{provider_id}")
async def delete_translation_provider(
    provider_id: int,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """删除翻译 LLM 提供商"""
    provider = db.query(TranslationLLMProvider).filter(
        TranslationLLMProvider.id == provider_id
    ).first()
    
    if not provider:
        raise HTTPException(status_code=404, detail="提供商不存在")
    
    db.delete(provider)
    db.commit()
    return {"message": "删除成功"}