"""
引用格式化路由 - APA / MLA / Chicago / GB/T 7714
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.core.db_models import Paper, User
from backend.deps import get_current_user, get_db
from backend.schemas import CitationRequest, CitationResponse

router = APIRouter(prefix="/api/papers/cite", tags=["引用格式化"])


def format_apa(paper: Paper) -> str:
    authors = paper.authors or "Unknown"
    year = paper.year or "n.d."
    title = paper.title or "Untitled"
    journal = paper.journal or ""
    if journal:
        return f"{authors} ({year}). {title}. {journal}."
    return f"{authors} ({year}). {title}."


def format_mla(paper: Paper) -> str:
    authors = paper.authors or "Unknown"
    title = paper.title or "Untitled"
    journal = paper.journal or ""
    year = paper.year or "n.d."
    if journal:
        return f'{authors}. "{title}." {journal} ({year}).'
    return f'{authors}. "{title}." ({year}).'


def format_chicago(paper: Paper) -> str:
    authors = paper.authors or "Unknown"
    title = paper.title or "Untitled"
    journal = paper.journal or ""
    year = paper.year or "n.d."
    if journal:
        return f'{authors}. "{title}." {journal} ({year}).'
    return f'{authors}. "{title}." ({year}).'


def format_gbt7714(paper: Paper) -> str:
    authors = paper.authors or "Unknown"
    title = paper.title or "Untitled"
    journal = paper.journal or ""
    year = paper.year or "n.d."
    author_list = [a.strip() for a in authors.split(",")]
    if len(author_list) > 3:
        formatted_authors = ", ".join(a.strip() for a in author_list[:3]) + ", 等"
    else:
        formatted_authors = ", ".join(a.strip() for a in author_list)
    if journal:
        return f"{formatted_authors}. {title}[J]. {journal}, {year}."
    return f"{formatted_authors}. {title}[R]. {year}."


FORMATTERS = {
    "apa": format_apa,
    "mla": format_mla,
    "chicago": format_chicago,
    "gbt7714": format_gbt7714,
}


@router.post("", response_model=CitationResponse)
async def generate_citations(
    req: CitationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if req.style not in FORMATTERS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的引用格式: {req.style}，支持: {', '.join(FORMATTERS.keys())}"
        )
    formatter = FORMATTERS[req.style]
    papers = db.query(Paper).filter(Paper.id.in_(req.paper_ids)).all()
    if not papers:
        raise HTTPException(status_code=404, detail="未找到指定论文")
    citations = [formatter(p) for p in papers]
    return CitationResponse(citations=citations)


@router.get("/{paper_id}", response_model=CitationResponse)
async def get_citation(
    paper_id: int,
    style: str = "apa",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if style not in FORMATTERS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的引用格式: {style}，支持: {', '.join(FORMATTERS.keys())}"
        )
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")
    return CitationResponse(citations=[FORMATTERS[style](paper)])
