"""
智能导入路由 - DOI / arXiv / BibTeX
"""
import re
import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from backend.core.db_models import Paper, User
from backend.deps import get_current_user, get_db
from backend.schemas import ImportRequest, ImportResultResponse, BatchImportRequest

router = APIRouter(prefix="/api/papers/import", tags=["智能导入"])


async def fetch_doi_metadata(doi: str) -> dict | None:
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(
                f"https://api.openalex.org/works/doi:{doi}",
                headers={"User-Agent": "PaperFlow/1.0"}
            )
            if resp.status_code == 200:
                data = resp.json()
                title = data.get("title", "")
                authors_list = data.get("authorships", [])
                authors = ", ".join(
                    a.get("author", {}).get("display_name", "")
                    for a in authors_list
                )
                year = str(data.get("publication_year", "")) if data.get("publication_year") else None
                journal_info = data.get("primary_location", {}) or {}
                source = journal_info.get("source", {}) or {}
                journal = source.get("display_name", "")
                abstract_dict = data.get("abstract_inverted_index")
                abstract = None
                if abstract_dict:
                    words = [""] * max(max(v) for v in abstract_dict.values()) if abstract_dict else []
                    for word, positions in abstract_dict.items():
                        for pos in positions:
                            if pos < len(words):
                                words[pos] = word
                    abstract = " ".join(words)
                return {
                    "title": title, "authors": authors,
                    "year": year, "journal": journal,
                    "abstract_en": abstract
                }
        except Exception:
            pass

        try:
            resp = await client.get(
                f"https://api.crossref.org/works/{doi}",
                headers={"User-Agent": "PaperFlow/1.0 mailto:paperflow@example.com"}
            )
            if resp.status_code == 200:
                msg = resp.json().get("message", {})
                title_list = msg.get("title", [])
                title = title_list[0] if title_list else ""
                authors_list = msg.get("author", [])
                authors = ", ".join(
                    f"{a.get('given', '')} {a.get('family', '')}".strip()
                    for a in authors_list
                )
                year_raw = msg.get("published-print", {}).get("date-parts", [[None]])[0]
                year = str(year_raw[0]) if year_raw and year_raw[0] else None
                journal_list = msg.get("container-title", [])
                journal = journal_list[0] if journal_list else ""
                abstract = msg.get("abstract", "")
                return {
                    "title": title, "authors": authors,
                    "year": year, "journal": journal,
                    "abstract_en": abstract
                }
        except Exception:
            pass
    return None


async def fetch_arxiv_metadata(arxiv_id: str) -> dict | None:
    arxiv_id = arxiv_id.strip()
    if arxiv_id.startswith("http"):
        match = re.search(r"(\d{4}\.\d{4,5}(?:v\d+)?)", arxiv_id)
        if match:
            arxiv_id = match.group(1)
        else:
            match = re.search(r"abs/(.+)$", arxiv_id)
            if match:
                arxiv_id = match.group(1)
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(
                f"http://export.arxiv.org/api/query?id_list={arxiv_id}",
                headers={"User-Agent": "PaperFlow/1.0"}
            )
            if resp.status_code == 200:
                import xml.etree.ElementTree as ET
                root = ET.fromstring(resp.text)
                ns = {"atom": "http://www.w3.org/2005/Atom"}
                entry = root.find("atom:entry", ns)
                if entry is None:
                    return None
                title = (entry.find("atom:title", ns).text or "").strip().replace("\n", " ")
                authors = ", ".join(
                    (a.find("atom:name", ns).text or "").strip()
                    for a in entry.findall("atom:author", ns)
                )
                summary = (entry.find("atom:summary", ns).text or "").strip()
                published = entry.find("atom:published", ns)
                year = None
                if published is not None and published.text:
                    year = published.text[:4]
                return {
                    "title": title, "authors": authors,
                    "year": year, "journal": "arXiv",
                    "abstract_en": summary
                }
        except Exception:
            pass
    return None


def parse_bibtex_single(bibtex_str: str) -> dict | None:
    match = re.match(r"@\w+\{[^,]*,(.*)\}", bibtex_str.strip(), re.DOTALL)
    if not match:
        return None
    fields_str = match.group(1)
    fields = {}
    for m in re.finditer(r'(\w+)\s*=\s*[{"](.*?)[}"]', fields_str, re.DOTALL):
        fields[m.group(1).lower()] = m.group(2).strip()
    title = fields.get("title", "")
    authors = fields.get("author", "").replace(" and ", ", ")
    year = fields.get("year", "")
    journal = fields.get("journal", "") or fields.get("booktitle", "")
    abstract = fields.get("abstract", "")
    if not title:
        return None
    return {
        "title": title, "authors": authors,
        "year": year, "journal": journal,
        "abstract_en": abstract
    }


@router.post("", response_model=ImportResultResponse)
async def import_paper(
    req: ImportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    metadata = None
    if req.type == "doi":
        metadata = await fetch_doi_metadata(req.value)
    elif req.type == "arxiv":
        metadata = await fetch_arxiv_metadata(req.value)
    elif req.type == "bibtex":
        metadata = parse_bibtex_single(req.value)
    else:
        return ImportResultResponse(success=False, error=f"不支持的导入类型: {req.type}")

    if not metadata:
        return ImportResultResponse(success=False, error="无法获取论文元数据")

    now = datetime.now().isoformat()
    paper = Paper(
        title=metadata.get("title", ""),
        authors=metadata.get("authors", ""),
        year=metadata.get("year"),
        journal=metadata.get("journal", ""),
        abstract_en=metadata.get("abstract_en"),
        owner_id=current_user.id,
        uploaded_at=now,
        md5_hash=""
    )
    db.add(paper)
    db.commit()
    db.refresh(paper)
    return ImportResultResponse(
        success=True, paper_id=paper.id, title=paper.title
    )


@router.post("/batch", response_model=list[ImportResultResponse])
async def batch_import(
    req: BatchImportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    results = []
    for item in req.items:
        result = await import_paper(item, current_user, db)
        results.append(result)
    return results
