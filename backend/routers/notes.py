"""
论文笔记路由 - CRUD 操作
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from backend.core.db_models import PaperNote, Paper, User
from backend.deps import get_current_user, get_db
from backend.services.paper_service import PaperService
from backend.schemas import (
    CreateNoteRequest, UpdateNoteRequest, NoteResponse
)

router = APIRouter(prefix="/api/papers/{paper_id}/notes", tags=["论文笔记"])


def _note_to_resp(n: PaperNote, username: str) -> NoteResponse:
    return NoteResponse(
        id=n.id, paper_id=n.paper_id, user_id=n.user_id,
        username=username, content=n.content,
        highlight_text=n.highlight_text, page_number=n.page_number,
        created_at=n.created_at, updated_at=n.updated_at
    )


def _check_paper_access(paper_id: int, user: User, db: Session) -> Paper:
    paper_service = PaperService(db)
    paper = paper_service.get_paper(paper_id)
    paper_service.ensure_access(paper, user)
    return paper


@router.get("", response_model=list[NoteResponse])
async def list_notes(
    paper_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _check_paper_access(paper_id, current_user, db)
    notes = db.query(PaperNote).filter(
        PaperNote.paper_id == paper_id,
        PaperNote.user_id == current_user.id
    ).order_by(PaperNote.created_at.desc()).all()
    return [_note_to_resp(n, current_user.username) for n in notes]


@router.post("", response_model=NoteResponse)
async def create_note(
    paper_id: int,
    req: CreateNoteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _check_paper_access(paper_id, current_user, db)
    now = datetime.now().isoformat()
    note = PaperNote(
        paper_id=paper_id, user_id=current_user.id,
        content=req.content, highlight_text=req.highlight_text,
        page_number=req.page_number, created_at=now, updated_at=now
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return _note_to_resp(note, current_user.username)


@router.put("/{note_id}", response_model=NoteResponse)
async def update_note(
    paper_id: int,
    note_id: int,
    req: UpdateNoteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _check_paper_access(paper_id, current_user, db)
    note = db.query(PaperNote).filter(
        PaperNote.id == note_id,
        PaperNote.paper_id == paper_id,
        PaperNote.user_id == current_user.id
    ).first()
    if not note:
        raise HTTPException(status_code=404, detail="笔记不存在")
    if req.content is not None:
        note.content = req.content
    if req.highlight_text is not None:
        note.highlight_text = req.highlight_text
    if req.page_number is not None:
        note.page_number = req.page_number
    note.updated_at = datetime.now().isoformat()
    db.commit()
    db.refresh(note)
    return _note_to_resp(note, current_user.username)


@router.delete("/{note_id}")
async def delete_note(
    paper_id: int,
    note_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _check_paper_access(paper_id, current_user, db)
    note = db.query(PaperNote).filter(
        PaperNote.id == note_id,
        PaperNote.paper_id == paper_id,
        PaperNote.user_id == current_user.id
    ).first()
    if not note:
        raise HTTPException(status_code=404, detail="笔记不存在")
    db.delete(note)
    db.commit()
    return {"message": "删除成功"}
