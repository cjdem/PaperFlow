"""
论文问答路由 - 基于 LLM 的 RAG 对话
"""
import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from datetime import datetime

from backend.core.db_models import Paper, PaperChatHistory, User
from backend.core.llm_pool import llm_manager
from backend.deps import get_current_user, get_db
from backend.services.paper_service import PaperService
from backend.schemas import ChatRequest, ChatMessageResponse

router = APIRouter(prefix="/api/papers/{paper_id}/chat", tags=["论文问答"])


def _check_paper_access(paper_id: int, user: User, db: Session):
    ps = PaperService(db)
    paper = ps.get_paper(paper_id)
    ps.ensure_access(paper, user)
    return paper


@router.get("/history", response_model=list[ChatMessageResponse])
async def get_chat_history(
    paper_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _check_paper_access(paper_id, current_user, db)
    messages = db.query(PaperChatHistory).filter(
        PaperChatHistory.paper_id == paper_id,
        PaperChatHistory.user_id == current_user.id
    ).order_by(PaperChatHistory.created_at.asc()).all()
    return [
        ChatMessageResponse(id=m.id, role=m.role, content=m.content, created_at=m.created_at)
        for m in messages
    ]


@router.delete("/history")
async def clear_chat_history(
    paper_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _check_paper_access(paper_id, current_user, db)
    db.query(PaperChatHistory).filter(
        PaperChatHistory.paper_id == paper_id,
        PaperChatHistory.user_id == current_user.id
    ).delete()
    db.commit()
    return {"message": "清除成功"}


@router.post("")
async def chat_with_paper(
    paper_id: int,
    req: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    paper = _check_paper_access(paper_id, current_user, db)

    now = datetime.now().isoformat()
    user_msg = PaperChatHistory(
        paper_id=paper_id, user_id=current_user.id,
        role="user", content=req.question, created_at=now
    )
    db.add(user_msg)
    db.commit()

    paper_context = ""
    if paper.abstract:
        paper_context += f"摘要: {paper.abstract}\n\n"
    if paper.abstract_en:
        paper_context += f"Abstract: {paper.abstract_en}\n\n"
    if paper.detailed_analysis:
        analysis_trunc = paper.detailed_analysis[:8000]
        paper_context += f"深度分析:\n{analysis_trunc}\n\n"

    history_messages = db.query(PaperChatHistory).filter(
        PaperChatHistory.paper_id == paper_id,
        PaperChatHistory.user_id == current_user.id
    ).order_by(PaperChatHistory.created_at.asc()).limit(20).all()

    system_prompt = (
        "你是一个学术论文研究助手。根据以下论文内容回答用户的问题。"
        "如果论文内容不足以回答问题，请基于你的知识补充，但要明确说明。"
        "使用中文回答，学术表达要准确。\n\n"
        f"论文标题: {paper.title or ''}\n"
        f"论文中文标题: {paper.title_cn or ''}\n"
        f"作者: {paper.authors or ''}\n"
        f"期刊: {paper.journal or ''} ({paper.year or ''})\n\n"
        f"{paper_context}"
    )

    chat_messages = [{"role": "system", "content": system_prompt}]
    for m in history_messages:
        chat_messages.append({"role": m.role, "content": m.content})

    async def generate():
        full_response = ""
        try:
            response = await llm_manager.chat(
                pool_name="analysis",
                messages=chat_messages
            )
            if hasattr(response, 'choices') and response.choices:
                full_response = response.choices[0].message.content or ""
            elif isinstance(response, str):
                full_response = response
            if full_response:
                yield f"data: {json.dumps({'content': full_response})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            return

        if full_response:
            assistant_msg = PaperChatHistory(
                paper_id=paper_id, user_id=current_user.id,
                role="assistant", content=full_response,
                created_at=datetime.now().isoformat()
            )
            db.add(assistant_msg)
            db.commit()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )
