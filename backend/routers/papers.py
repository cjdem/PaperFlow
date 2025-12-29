"""
论文路由 - 论文的 CRUD 操作
"""
import re
import asyncio
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from typing import Optional, List
from urllib.parse import quote

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db_models import Paper, Group, User
from file_service import file_service
# 注意：reanalyze_paper 使用延迟导入以避免循环导入

from deps import get_db, get_current_user
from schemas import (
    PaperResponse, PaperListResponse, UpdatePaperGroupsRequest, GroupInfo,
    BatchDeleteRequest, BatchDeleteResponse, BatchGroupRequest, BatchGroupResponse,
    FilterOptionsResponse, JournalOption
)

router = APIRouter(prefix="/api/papers", tags=["论文"])


def sanitize_filename(filename: str) -> str:
    """清理文件名，移除不安全字符"""
    # 移除或替换不安全的文件名字符
    filename = re.sub(r'[<>:"/\\|?*]', '_', filename)
    # 限制长度
    if len(filename) > 200:
        filename = filename[:200]
    return filename


def paper_to_response(paper: Paper) -> PaperResponse:
    """将 Paper ORM 对象转换为响应模型"""
    # 判断是否有关联文件
    has_file = bool(paper.file_path) or (
        paper.md5_hash and paper.owner_id and
        file_service.file_exists(paper.owner_id, paper.md5_hash)
    )
    
    return PaperResponse(
        id=paper.id,
        title=paper.title,
        title_cn=paper.title_cn,
        authors=paper.authors,
        year=paper.year,
        journal=paper.journal,
        abstract=paper.abstract,
        abstract_en=paper.abstract_en,
        detailed_analysis=paper.detailed_analysis,
        groups=[GroupInfo(id=g.id, name=g.name) for g in paper.groups],
        owner_username=paper.owner.username if paper.owner else None,
        # 文件相关字段
        file_path=paper.file_path,
        file_size=paper.file_size,
        original_filename=paper.original_filename,
        uploaded_at=paper.uploaded_at,
        has_file=has_file
    )


@router.get("/filter-options", response_model=FilterOptionsResponse)
async def get_filter_options(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取筛选选项（年份列表、期刊列表）"""
    query = db.query(Paper)
    
    # 非管理员只能看自己的论文
    if current_user.role != "admin":
        query = query.filter(Paper.owner_id == current_user.id)
    
    papers = query.all()
    
    # 统计年份（去重并排序）
    years = sorted(set(p.year for p in papers if p.year), reverse=True)
    
    # 统计期刊（带数量）
    journal_counts = {}
    for p in papers:
        if p.journal:
            journal_counts[p.journal] = journal_counts.get(p.journal, 0) + 1
    
    journals = [
        JournalOption(name=name, count=count)
        for name, count in sorted(journal_counts.items(), key=lambda x: -x[1])
    ]
    
    return FilterOptionsResponse(years=years, journals=journals)


@router.get("", response_model=PaperListResponse)
async def get_papers(
    view: str = Query("all", description="视图模式: all, ungrouped, 或分组名"),
    search: Optional[str] = Query(None, description="搜索关键词"),
    search_fields: Optional[str] = Query("all", description="搜索字段: all, title, authors, abstract, journal（逗号分隔）"),
    year_from: Optional[str] = Query(None, description="起始年份"),
    year_to: Optional[str] = Query(None, description="结束年份"),
    journals: Optional[str] = Query(None, description="期刊列表（逗号分隔）"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取论文列表（支持高级搜索）"""
    query = (
        db.query(Paper)
        .options(joinedload(Paper.groups), joinedload(Paper.owner))
        .order_by(Paper.id.desc())
    )
    
    # 非管理员只能看自己的论文
    if current_user.role != "admin":
        query = query.filter(Paper.owner_id == current_user.id)
    
    # 视图过滤
    if view == "ungrouped":
        query = query.filter(~Paper.groups.any())
    elif view != "all":
        query = query.filter(Paper.groups.any(name=view))
    
    # 高级搜索过滤
    if search:
        q = search.lower()
        fields = [f.strip() for f in search_fields.split(",")] if search_fields else ["all"]
        
        conditions = []
        if "all" in fields or "title" in fields:
            conditions.extend([
                Paper.title.ilike(f"%{q}%"),
                Paper.title_cn.ilike(f"%{q}%")
            ])
        if "all" in fields or "authors" in fields:
            conditions.append(Paper.authors.ilike(f"%{q}%"))
        if "all" in fields or "abstract" in fields:
            conditions.extend([
                Paper.abstract.ilike(f"%{q}%"),
                Paper.abstract_en.ilike(f"%{q}%")
            ])
        if "all" in fields or "journal" in fields:
            conditions.append(Paper.journal.ilike(f"%{q}%"))
        
        if conditions:
            query = query.filter(or_(*conditions))
    
    # 年份筛选
    if year_from:
        query = query.filter(Paper.year >= year_from)
    if year_to:
        query = query.filter(Paper.year <= year_to)
    
    # 期刊筛选
    if journals:
        journal_list = [j.strip() for j in journals.split(",")]
        query = query.filter(Paper.journal.in_(journal_list))
    
    papers = query.all()
    return PaperListResponse(
        papers=[paper_to_response(p) for p in papers],
        total=len(papers)
    )


@router.get("/{paper_id}", response_model=PaperResponse)
async def get_paper(
    paper_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取单篇论文详情"""
    paper = (
        db.query(Paper)
        .options(joinedload(Paper.groups), joinedload(Paper.owner))
        .filter(Paper.id == paper_id)
        .first()
    )
    
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")
    
    # 权限检查
    if current_user.role != "admin" and paper.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权访问此论文")
    
    return paper_to_response(paper)


@router.delete("/{paper_id}")
async def delete_paper(
    paper_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """删除论文（同时删除物理文件和翻译文件）"""
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")
    
    # 权限检查
    if current_user.role != "admin" and paper.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权删除此论文")
    
    # 删除原始 PDF 文件
    if paper.file_path:
        file_service.delete_file_by_path(paper.file_path)
    elif paper.md5_hash and paper.owner_id:
        file_service.delete_file(paper.owner_id, paper.md5_hash)
    
    # 删除翻译后的 PDF 文件（中文版和双语对照版）
    if paper.translated_file_path:
        file_service.delete_file_by_absolute_path(paper.translated_file_path)
    if paper.translated_dual_path:
        file_service.delete_file_by_absolute_path(paper.translated_dual_path)
    
    db.delete(paper)
    db.commit()
    return {"message": "删除成功"}


@router.get("/{paper_id}/download")
async def download_paper(
    paper_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """下载论文 PDF 文件"""
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")
    
    # 权限检查
    if current_user.role != "admin" and paper.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权下载此论文")
    
    # 获取文件路径
    file_path = None
    if paper.file_path:
        file_path = file_service.get_file_path_by_relative(paper.file_path)
    elif paper.md5_hash and paper.owner_id:
        file_path = file_service.get_file_path(paper.owner_id, paper.md5_hash)
    
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    
    # 使用论文标题作为下载文件名
    download_filename = sanitize_filename(paper.title or "paper") + ".pdf"
    
    # 对文件名进行 URL 编码以支持中文
    encoded_filename = quote(download_filename)
    
    return FileResponse(
        path=file_path,
        filename=download_filename,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"
        }
    )


@router.get("/{paper_id}/preview")
async def preview_paper(
    paper_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """预览论文 PDF 文件（在浏览器中打开）"""
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")
    
    # 权限检查
    if current_user.role != "admin" and paper.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权预览此论文")
    
    # 获取文件路径
    file_path = None
    if paper.file_path:
        file_path = file_service.get_file_path_by_relative(paper.file_path)
    elif paper.md5_hash and paper.owner_id:
        file_path = file_service.get_file_path(paper.owner_id, paper.md5_hash)
    
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    
    # 使用论文标题作为文件名
    preview_filename = sanitize_filename(paper.title or "paper") + ".pdf"
    encoded_filename = quote(preview_filename)
    
    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"inline; filename*=UTF-8''{encoded_filename}"
        }
    )


@router.put("/{paper_id}/groups")
async def update_paper_groups(
    paper_id: int,
    request: UpdatePaperGroupsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """更新论文的分组"""
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")
    
    # 权限检查
    if current_user.role != "admin" and paper.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权修改此论文")
    
    # 获取分组对象
    groups = db.query(Group).filter(Group.name.in_(request.groups)).all()
    paper.groups = groups
    db.commit()
    
    return {"message": "分组更新成功"}


# ================= 批量操作 API =================

@router.delete("/batch", response_model=BatchDeleteResponse)
async def batch_delete_papers(
    request: BatchDeleteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """批量删除论文（同时删除物理文件和翻译文件）"""
    deleted_count = 0
    failed_ids = []
    
    for paper_id in request.paper_ids:
        paper = db.query(Paper).filter(Paper.id == paper_id).first()
        if not paper:
            failed_ids.append(paper_id)
            continue
        
        # 权限检查
        if current_user.role != "admin" and paper.owner_id != current_user.id:
            failed_ids.append(paper_id)
            continue
        
        # 删除原始 PDF 文件
        if paper.file_path:
            file_service.delete_file_by_path(paper.file_path)
        elif paper.md5_hash and paper.owner_id:
            file_service.delete_file(paper.owner_id, paper.md5_hash)
        
        # 删除翻译后的 PDF 文件（中文版和双语对照版）
        if paper.translated_file_path:
            file_service.delete_file_by_absolute_path(paper.translated_file_path)
        if paper.translated_dual_path:
            file_service.delete_file_by_absolute_path(paper.translated_dual_path)
        
        db.delete(paper)
        deleted_count += 1
    
    db.commit()
    return BatchDeleteResponse(
        message=f"成功删除 {deleted_count} 篇论文",
        deleted_count=deleted_count,
        failed_ids=failed_ids
    )


@router.put("/batch/groups", response_model=BatchGroupResponse)
async def batch_update_groups(
    request: BatchGroupRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """批量更新论文分组"""
    updated_count = 0
    target_groups = db.query(Group).filter(Group.name.in_(request.groups)).all()
    
    for paper_id in request.paper_ids:
        paper = db.query(Paper).filter(Paper.id == paper_id).first()
        if not paper:
            continue
        
        # 权限检查
        if current_user.role != "admin" and paper.owner_id != current_user.id:
            continue
        
        if request.action == "add":
            # 添加到分组
            for g in target_groups:
                if g not in paper.groups:
                    paper.groups.append(g)
        elif request.action == "remove":
            # 从分组移除
            paper.groups = [g for g in paper.groups if g not in target_groups]
        elif request.action == "set":
            # 设置为指定分组
            paper.groups = target_groups
        
        updated_count += 1
    
    db.commit()
    return BatchGroupResponse(
        message=f"成功更新 {updated_count} 篇论文的分组",
        updated_count=updated_count
    )


# ================= 重新分析 API =================

@router.post("/{paper_id}/reanalyze")
async def reanalyze_paper_endpoint(
    paper_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    重新分析论文（使用已存储的 PDF 文件）
    
    需要论文有关联的 PDF 文件才能重新分析
    """
    # 先检查论文是否存在
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")
    
    # 权限检查
    if current_user.role != "admin" and paper.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权重新分析此论文")
    
    # 检查是否有文件
    has_file = bool(paper.file_path) or (
        paper.md5_hash and paper.owner_id and
        file_service.file_exists(paper.owner_id, paper.md5_hash)
    )
    
    if not has_file:
        raise HTTPException(status_code=400, detail="论文没有关联的 PDF 文件，无法重新分析")
    
    try:
        # 延迟导入以避免循环导入
        from main import reanalyze_paper
        
        # 执行重新分析（允许管理员分析任何论文）
        owner_id = None if current_user.role == "admin" else current_user.id
        analysis = await reanalyze_paper(paper_id, owner_id)
        
        return {
            "message": "重新分析完成",
            "paper_id": paper_id,
            "analysis_preview": analysis[:500] + "..." if len(analysis) > 500 else analysis
        }
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"重新分析失败: {str(e)}")
