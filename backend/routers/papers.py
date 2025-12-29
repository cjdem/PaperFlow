"""
论文路由 - 论文的 CRUD 操作
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db_models import Paper, Group, User

from deps import get_db, get_current_user
from schemas import (
    PaperResponse, PaperListResponse, UpdatePaperGroupsRequest, GroupInfo,
    BatchDeleteRequest, BatchDeleteResponse, BatchGroupRequest, BatchGroupResponse
)

router = APIRouter(prefix="/api/papers", tags=["论文"])


def paper_to_response(paper: Paper) -> PaperResponse:
    """将 Paper ORM 对象转换为响应模型"""
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
        owner_username=paper.owner.username if paper.owner else None
    )


@router.get("", response_model=PaperListResponse)
async def get_papers(
    view: str = Query("all", description="视图模式: all, ungrouped, 或分组名"),
    search: Optional[str] = Query(None, description="搜索关键词"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取论文列表"""
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
    
    # 搜索过滤
    if search:
        q = search.lower()
        query = query.filter(
            (Paper.title.ilike(f"%{q}%"))
            | (Paper.title_cn.ilike(f"%{q}%"))
            | (Paper.authors.ilike(f"%{q}%"))
        )
    
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
    """删除论文"""
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")
    
    # 权限检查
    if current_user.role != "admin" and paper.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权删除此论文")
    
    db.delete(paper)
    db.commit()
    return {"message": "删除成功"}


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
    """批量删除论文"""
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
