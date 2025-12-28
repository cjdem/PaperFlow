"""
管理员路由 - 系统管理功能
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db_models import User, Paper, Group, LLMProvider, SystemConfig
from llm_pool import llm_manager

from deps import get_db, get_current_admin
from schemas import (
    DbStatsResponse, LLMProviderResponse, 
    CreateLLMProviderRequest, UpdateLLMProviderRequest,
    SystemConfigRequest, UserResponse
)

router = APIRouter(prefix="/api/admin", tags=["管理"])


# ================= 系统概览 =================
@router.get("/stats", response_model=DbStatsResponse)
async def get_stats(
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """获取系统统计信息"""
    return DbStatsResponse(
        user_count=db.query(User).count(),
        paper_count=db.query(Paper).count(),
        group_count=db.query(Group).count()
    )


@router.get("/users", response_model=list[UserResponse])
async def get_users(
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """获取所有用户"""
    users = db.query(User).all()
    return [UserResponse(id=u.id, username=u.username, role=u.role) for u in users]


# ================= LLM 配置 =================
@router.get("/llm-providers", response_model=list[LLMProviderResponse])
async def get_llm_providers(
    pool_type: str = None,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """获取 LLM 提供商列表，按优先级排序"""
    query = db.query(LLMProvider).order_by(LLMProvider.priority.asc())
    if pool_type:
        query = query.filter(LLMProvider.pool_type == pool_type)
    
    providers = query.all()
    return [
        LLMProviderResponse(
            id=p.id,
            name=p.name,
            base_url=p.base_url,
            api_key=p.api_key,
            pool_type=p.pool_type,
            api_type=getattr(p, 'api_type', 'openai'),
            is_primary=p.is_primary,
            weight=getattr(p, 'weight', 10),
            priority=getattr(p, 'priority', 1),
            models=p.models,
            enabled=p.enabled
        )
        for p in providers
    ]


@router.post("/llm-providers", response_model=LLMProviderResponse)
async def create_llm_provider(
    request: CreateLLMProviderRequest,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """添加 LLM 提供商"""
    # 如果设置为主模型，先取消其他主模型
    if request.is_primary:
        db.query(LLMProvider).filter(
            LLMProvider.pool_type == request.pool_type,
            LLMProvider.is_primary == True
        ).update({"is_primary": False})
    
    provider = LLMProvider(
        name=request.name,
        base_url=request.base_url,
        api_key=request.api_key,
        pool_type=request.pool_type,
        api_type=request.api_type,
        models=request.models,
        is_primary=request.is_primary,
        weight=request.weight,
        priority=request.priority,
        enabled=True
    )
    db.add(provider)
    db.commit()
    db.refresh(provider)
    llm_manager.reload_config()  # 刷新内存配置
    
    return LLMProviderResponse(
        id=provider.id,
        name=provider.name,
        base_url=provider.base_url,
        api_key=provider.api_key,
        pool_type=provider.pool_type,
        api_type=provider.api_type,
        is_primary=provider.is_primary,
        weight=provider.weight,
        priority=getattr(provider, 'priority', 1),
        models=provider.models,
        enabled=provider.enabled
    )


@router.put("/llm-providers/{provider_id}", response_model=LLMProviderResponse)
async def update_llm_provider(
    provider_id: int,
    request: UpdateLLMProviderRequest,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """更新 LLM 提供商"""
    provider = db.query(LLMProvider).filter(LLMProvider.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="提供商不存在")
    
    # 更新字段
    update_data = request.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if value is not None:
            setattr(provider, key, value)
    
    db.commit()
    db.refresh(provider)
    llm_manager.reload_config()  # 刷新内存配置
    
    return LLMProviderResponse(
        id=provider.id,
        name=provider.name,
        base_url=provider.base_url,
        api_key=provider.api_key,
        pool_type=provider.pool_type,
        api_type=getattr(provider, 'api_type', 'openai'),
        is_primary=provider.is_primary,
        weight=getattr(provider, 'weight', 10),
        priority=getattr(provider, 'priority', 1),
        models=provider.models,
        enabled=provider.enabled
    )


@router.delete("/llm-providers/{provider_id}")
async def delete_llm_provider(
    provider_id: int,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """删除 LLM 提供商"""
    provider = db.query(LLMProvider).filter(LLMProvider.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="提供商不存在")
    
    db.delete(provider)
    db.commit()
    llm_manager.reload_config()  # 刷新内存配置
    return {"message": "删除成功"}


@router.post("/llm-providers/{provider_id}/set-primary")
async def set_primary(
    provider_id: int,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """设置为主模型"""
    provider = db.query(LLMProvider).filter(LLMProvider.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="提供商不存在")
    
    # 取消该类型的其他主模型
    db.query(LLMProvider).filter(
        LLMProvider.pool_type == provider.pool_type,
        LLMProvider.is_primary == True
    ).update({"is_primary": False})
    
    provider.is_primary = True
    db.commit()
    llm_manager.reload_config()  # 刷新内存配置
    return {"message": "设置成功"}


@router.post("/llm-providers/{provider_id}/toggle")
async def toggle_enabled(
    provider_id: int,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """切换启用状态"""
    provider = db.query(LLMProvider).filter(LLMProvider.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="提供商不存在")
    
    provider.enabled = not provider.enabled
    db.commit()
    llm_manager.reload_config()  # 刷新内存配置
    return {"message": "切换成功", "enabled": provider.enabled}


# ================= 系统配置 =================
@router.get("/config/{key}")
async def get_config(
    key: str,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """获取系统配置"""
    config = db.query(SystemConfig).filter(SystemConfig.key == key).first()
    return {"key": key, "value": config.value if config else None}


@router.post("/config")
async def set_config(
    request: SystemConfigRequest,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """设置系统配置"""
    config = db.query(SystemConfig).filter(SystemConfig.key == request.key).first()
    if config:
        config.value = request.value
    else:
        db.add(SystemConfig(key=request.key, value=request.value))
    
    db.commit()
    return {"message": "设置成功"}
