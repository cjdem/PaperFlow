"""
分组路由 - 分组的 CRUD 操作
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db_models import Group, User

from deps import get_db, get_current_user
from schemas import CreateGroupRequest, GroupResponse

router = APIRouter(prefix="/api/groups", tags=["分组"])


@router.get("", response_model=list[GroupResponse])
async def get_groups(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取所有分组"""
    groups = db.query(Group).all()
    return [GroupResponse(id=g.id, name=g.name) for g in groups]


@router.post("", response_model=GroupResponse)
async def create_group(
    request: CreateGroupRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """创建新分组"""
    if not request.name or not request.name.strip():
        raise HTTPException(status_code=400, detail="分组名不能为空")
    
    # 检查是否已存在
    if db.query(Group).filter(Group.name == request.name).first():
        raise HTTPException(status_code=400, detail="分组已存在")
    
    group = Group(name=request.name.strip())
    db.add(group)
    db.commit()
    db.refresh(group)
    
    return GroupResponse(id=group.id, name=group.name)


@router.delete("/{group_id}")
async def delete_group(
    group_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """删除分组"""
    group = db.query(Group).filter(Group.id == group_id).first()
    
    if not group:
        raise HTTPException(status_code=404, detail="分组不存在")
    
    db.delete(group)
    db.commit()
    
    return {"message": "删除成功"}
