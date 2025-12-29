"""
导出路由 - 批量导出论文数据
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
import csv
import io
import json
from datetime import datetime

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db_models import Paper, User

from deps import get_db, get_current_user
from schemas import BatchExportRequest

router = APIRouter(prefix="/api/papers", tags=["导出"])


def generate_csv(papers: list[Paper]) -> str:
    """生成 CSV 格式数据"""
    output = io.StringIO()
    writer = csv.writer(output)
    
    # 写入表头
    writer.writerow([
        'ID', '标题', '中文标题', '作者', '年份', '期刊', '分组', '摘要'
    ])
    
    # 写入数据
    for paper in papers:
        groups = ','.join([g.name for g in paper.groups])
        writer.writerow([
            paper.id,
            paper.title,
            paper.title_cn or '',
            paper.authors or '',
            paper.year or '',
            paper.journal or '',
            groups,
            paper.abstract or ''
        ])
    
    return output.getvalue()


def generate_bibtex(papers: list[Paper]) -> str:
    """生成 BibTeX 格式数据"""
    entries = []
    
    for paper in papers:
        # 生成引用键
        first_author = (paper.authors or 'Unknown').split(',')[0].split(' ')[-1].lower()
        year = paper.year or 'unknown'
        cite_key = f"{first_author}{year}_{paper.id}"
        
        # 构建 BibTeX 条目
        entry = f"""@article{{{cite_key},
  title = {{{paper.title}}},
  author = {{{paper.authors or 'Unknown'}}},
  year = {{{paper.year or ''}}},
  journal = {{{paper.journal or ''}}}
}}"""
        entries.append(entry)
    
    return '\n\n'.join(entries)


def generate_markdown(papers: list[Paper]) -> str:
    """生成 Markdown 格式数据"""
    lines = [
        "# 论文分析报告导出",
        f"\n导出时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"\n共 {len(papers)} 篇论文\n",
        "---\n"
    ]
    
    for i, paper in enumerate(papers, 1):
        groups = ', '.join([g.name for g in paper.groups]) or '未分组'
        
        lines.append(f"## {i}. {paper.title}")
        if paper.title_cn:
            lines.append(f"**中文标题**: {paper.title_cn}\n")
        
        lines.append(f"- **作者**: {paper.authors or '未知'}")
        lines.append(f"- **年份**: {paper.year or '未知'}")
        lines.append(f"- **期刊**: {paper.journal or '未知'}")
        lines.append(f"- **分组**: {groups}")
        
        if paper.abstract:
            lines.append(f"\n### 摘要\n{paper.abstract}")
        
        if paper.detailed_analysis:
            lines.append(f"\n### 深度分析\n{paper.detailed_analysis}")
        
        lines.append("\n---\n")
    
    return '\n'.join(lines)


def generate_json(papers: list[Paper]) -> str:
    """生成 JSON 格式数据"""
    data = {
        "export_time": datetime.now().isoformat(),
        "total": len(papers),
        "papers": []
    }
    
    for paper in papers:
        paper_data = {
            "id": paper.id,
            "title": paper.title,
            "title_cn": paper.title_cn,
            "authors": paper.authors,
            "year": paper.year,
            "journal": paper.journal,
            "abstract": paper.abstract,
            "abstract_en": paper.abstract_en,
            "detailed_analysis": paper.detailed_analysis,
            "groups": [{"id": g.id, "name": g.name} for g in paper.groups]
        }
        data["papers"].append(paper_data)
    
    return json.dumps(data, ensure_ascii=False, indent=2)


@router.post("/batch/export")
async def batch_export_papers(
    request: BatchExportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """批量导出论文"""
    # 查询论文
    papers = (
        db.query(Paper)
        .options(joinedload(Paper.groups))
        .filter(Paper.id.in_(request.paper_ids))
        .all()
    )
    
    # 权限过滤（非管理员只能导出自己的论文）
    if current_user.role != "admin":
        papers = [p for p in papers if p.owner_id == current_user.id]
    
    if not papers:
        raise HTTPException(status_code=404, detail="没有可导出的论文")
    
    # 生成文件名
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    
    # 根据格式生成内容
    if request.format == "csv":
        content = generate_csv(papers)
        filename = f"papers_export_{timestamp}.csv"
        media_type = "text/csv; charset=utf-8"
    elif request.format == "bibtex":
        content = generate_bibtex(papers)
        filename = f"papers_export_{timestamp}.bib"
        media_type = "application/x-bibtex; charset=utf-8"
    elif request.format == "markdown":
        content = generate_markdown(papers)
        filename = f"papers_export_{timestamp}.md"
        media_type = "text/markdown; charset=utf-8"
    elif request.format == "json":
        content = generate_json(papers)
        filename = f"papers_export_{timestamp}.json"
        media_type = "application/json; charset=utf-8"
    else:
        raise HTTPException(status_code=400, detail="不支持的导出格式")
    
    # 返回文件流
    return StreamingResponse(
        io.BytesIO(content.encode('utf-8')),
        media_type=media_type,
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )