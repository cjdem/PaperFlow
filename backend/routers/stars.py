"""
星标/收藏与阅读历史路由
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime

from backend.core.db_models import PaperStar, ReadingHistory, Paper, User
from backend.deps import get_current_user, get_db
from backend.schemas import StarResponse, ReadingHistoryResponse

router = APIRouter(prefix="/api", tags=["星标与历史"])


@router.get("/papers/starred", response_model=list[dict])
async def list_starred_papers(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    stars = db.query(PaperStar).filter(PaperStar.user_id == current_user.id).all()
    paper_ids = [s.paper_id for s in stars]
    if not paper_ids:
        return []
    from backend.routers.papers import paper_to_response
    from sqlalchemy.orm import joinedload
    papers = db.query(Paper).options(joinedload(Paper.groups), joinedload(Paper.owner)).filter(Paper.id.in_(paper_ids)).all()
    return [paper_to_response(p, user_id=current_user.id, db=db).model_dump() for p in papers]


@router.put("/papers/{paper_id}/star", response_model=StarResponse)
async def toggle_star(
    paper_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")
    existing = db.query(PaperStar).filter(
        PaperStar.user_id == current_user.id,
        PaperStar.paper_id == paper_id
    ).first()
    if existing:
        db.delete(existing)
        db.commit()
        return StarResponse(paper_id=paper_id, starred=False)
    else:
        star = PaperStar(
            user_id=current_user.id, paper_id=paper_id,
            created_at=datetime.now().isoformat()
        )
        db.add(star)
        db.commit()
        return StarResponse(paper_id=paper_id, starred=True)


@router.get("/papers/{paper_id}/star", response_model=StarResponse)
async def check_star(
    paper_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    existing = db.query(PaperStar).filter(
        PaperStar.user_id == current_user.id,
        PaperStar.paper_id == paper_id
    ).first()
    return StarResponse(paper_id=paper_id, starred=existing is not None)


@router.post("/papers/{paper_id}/view")
async def record_view(
    paper_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")
    existing = db.query(ReadingHistory).filter(
        ReadingHistory.user_id == current_user.id,
        ReadingHistory.paper_id == paper_id
    ).first()
    now = datetime.now().isoformat()
    if existing:
        existing.viewed_at = now
    else:
        history = ReadingHistory(
            user_id=current_user.id, paper_id=paper_id, viewed_at=now
        )
        db.add(history)
    db.commit()
    return {"message": "记录成功"}


@router.get("/papers/recent", response_model=list[ReadingHistoryResponse])
async def list_recent(
    limit: int = Query(20, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    histories = db.query(ReadingHistory).filter(
        ReadingHistory.user_id == current_user.id
    ).order_by(ReadingHistory.viewed_at.desc()).limit(limit).all()
    result = []
    for h in histories:
        paper = db.query(Paper).filter(Paper.id == h.paper_id).first()
        if paper:
            result.append(ReadingHistoryResponse(
                paper_id=paper.id, title=paper.title or "",
                title_cn=paper.title_cn, viewed_at=h.viewed_at
            ))
    return result
