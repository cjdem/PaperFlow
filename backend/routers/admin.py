"""
管理员路由 - 系统管理功能
"""
import logging
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db_models import User, Paper, Group, LLMProvider, SystemConfig
from llm_pool import llm_manager
from file_service import file_service

from deps import get_db, get_current_admin
from schemas import (
    DbStatsResponse, LLMProviderResponse,
    CreateLLMProviderRequest, UpdateLLMProviderRequest,
    SystemConfigRequest, UserResponse
)

router = APIRouter(prefix="/api/admin", tags=["管理"])

# 创建线程池用于后台任务
_executor = ThreadPoolExecutor(max_workers=2)
_logger = logging.getLogger(__name__)


def _reload_config_background():
    """后台线程中执行配置重载"""
    try:
        llm_manager.reload_config()
        _logger.info("✅ LLM 配置后台重载成功")
    except Exception as e:
        _logger.error(f"❌ 后台重载 LLM 配置失败: {e}")


def trigger_reload_async():
    """触发异步重载（非阻塞）"""
    _executor.submit(_reload_config_background)


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
    """获取 LLM 提供商列表，主模型优先，然后按优先级排序"""
    query = db.query(LLMProvider).order_by(
        LLMProvider.is_primary.desc(),  # 主模型优先
        LLMProvider.priority.asc()       # 然后按优先级排序
    )
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
    trigger_reload_async()  # 异步刷新内存配置（非阻塞）
    
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
    trigger_reload_async()  # 异步刷新内存配置（非阻塞）
    
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
    trigger_reload_async()  # 异步刷新内存配置（非阻塞）
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
    trigger_reload_async()  # 异步刷新内存配置（非阻塞）
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
    trigger_reload_async()  # 异步刷新内存配置（非阻塞）
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


# ================= 存储统计 =================
@router.get("/storage-stats")
async def get_storage_stats(
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """获取存储统计信息（管理员）"""
    # 获取文件系统统计
    storage_stats = file_service.get_all_storage_stats()
    
    # 获取用户名映射
    user_ids = [u["user_id"] for u in storage_stats.get("users", [])]
    users = db.query(User).filter(User.id.in_(user_ids)).all() if user_ids else []
    user_map = {u.id: u.username for u in users}
    
    # 添加用户名到统计数据
    for user_stat in storage_stats.get("users", []):
        user_stat["username"] = user_map.get(user_stat["user_id"], f"user_{user_stat['user_id']}")
    
    # 格式化大小为人类可读格式
    def format_size(size_bytes):
        if size_bytes < 1024:
            return f"{size_bytes} B"
        elif size_bytes < 1024 * 1024:
            return f"{size_bytes / 1024:.2f} KB"
        elif size_bytes < 1024 * 1024 * 1024:
            return f"{size_bytes / (1024 * 1024):.2f} MB"
        else:
            return f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"
    
    return {
        "total_size": storage_stats["total_size"],
        "total_size_formatted": format_size(storage_stats["total_size"]),
        "total_files": storage_stats["total_files"],
        "users": [
            {
                "user_id": u["user_id"],
                "username": u["username"],
                "file_count": u["file_count"],
                "total_size": u["total_size"],
                "total_size_formatted": format_size(u["total_size"])
            }
            for u in storage_stats.get("users", [])
        ]
    }
