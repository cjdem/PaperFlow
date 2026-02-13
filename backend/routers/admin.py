"""
管理员路由 - 系统管理功能
"""
import logging
import time
from typing import Optional
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db_models import User, Paper, Group, LLMProvider, SystemConfig, AuditLog
from llm_pool import llm_manager, GeminiClientWrapper, AnthropicClientWrapper, build_httpx_client
from file_service import file_service
from llm_format import normalize_request_format, format_to_legacy_api_type

from deps import get_db, get_current_admin
from llm_service import mark_provider_success, mark_provider_failure
from schemas import (
    DbStatsResponse, LLMProviderResponse,
    CreateLLMProviderRequest, UpdateLLMProviderRequest,
    SystemConfigRequest, UserResponse, UserQuotaRequest
)
from openai import AsyncOpenAI, APIStatusError
import httpx

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


def _pick_first(value: str) -> str:
    items = [item.strip() for item in (value or "").split(",") if item.strip()]
    return items[0] if items else ""


async def _test_provider_connectivity(provider: LLMProvider) -> dict:
    api_key = _pick_first(provider.api_key)
    model = _pick_first(provider.models)
    request_format = normalize_request_format(
        getattr(provider, "request_format", None),
        api_type=(provider.api_type or "openai"),
    )
    base_url = (provider.base_url or "").strip()
    base_url = base_url.rstrip("/") if base_url else None
    proxy = (getattr(provider, "proxy", None) or "").strip() or None

    if not api_key:
        raise HTTPException(status_code=400, detail="API Key 为空，无法测试")
    if not model:
        raise HTTPException(status_code=400, detail="模型名称为空，无法测试")

    messages = [{"role": "user", "content": "请回复：OK"}]
    start_time = time.monotonic()

    try:
        response_format = {"type": "text"}

        if request_format == "gemini":
            client = GeminiClientWrapper(api_key=api_key, base_url=base_url, proxy=proxy)
            response = await client.create_chat_completion(
                model=model,
                messages=messages,
                temperature=0,
                response_format=response_format
            )
        elif request_format == "anthropic":
            client = AnthropicClientWrapper(api_key=api_key, base_url=base_url, proxy=proxy)
            response = await client.create_chat_completion(
                model=model,
                messages=messages,
                temperature=0,
                max_tokens=32,
                response_format=response_format
            )
        elif request_format == "openai_response":
            timeout = httpx.Timeout(30.0, connect=10.0)
            if proxy:
                http_client = build_httpx_client(timeout, proxy)
                client = AsyncOpenAI(
                    api_key=api_key,
                    base_url=base_url,
                    http_client=http_client
                )
            else:
                client = AsyncOpenAI(
                    api_key=api_key,
                    base_url=base_url,
                    timeout=timeout
                )
            response = await client.responses.create(
                model=model,
                input=messages,
                temperature=0,
                text={"format": {"type": "text"}},
                max_output_tokens=32
            )
        else:
            timeout = httpx.Timeout(30.0, connect=10.0)
            if proxy:
                http_client = build_httpx_client(timeout, proxy)
                client = AsyncOpenAI(
                    api_key=api_key,
                    base_url=base_url,
                    http_client=http_client
                )
            else:
                client = AsyncOpenAI(
                    api_key=api_key,
                    base_url=base_url,
                    timeout=timeout
                )
            kwargs = {
                "model": model,
                "messages": messages,
                "temperature": 0,
                "max_tokens": 16,
                "response_format": response_format
            }
            try:
                response = await client.chat.completions.create(**kwargs)
            except APIStatusError as api_error:
                status_code = getattr(getattr(api_error, "response", None), "status_code", None)
                combined = (str(api_error) + " " + str(getattr(api_error, "body", ""))).lower()
                if response_format and status_code in (400, 403) and (
                    "response_format" in combined or "json_object" in combined
                ):
                    fallback_kwargs = dict(kwargs)
                    fallback_kwargs.pop("response_format", None)
                    _logger.warning(f"⚠️ {provider.id} 不支持 response_format，已降级重试")
                    response = await client.chat.completions.create(**fallback_kwargs)
                else:
                    raise

        latency_ms = int((time.monotonic() - start_time) * 1000)
        mark_provider_success(provider.id, latency_ms)
        content = ""
        try:
            if request_format == "openai_response":
                content = getattr(response, "output_text", "") or ""
            elif response and response.choices:
                content = response.choices[0].message.content or ""
        except Exception:
            content = ""

        return {
            "success": True,
            "message": "联通成功",
            "latency_ms": latency_ms,
            "model": model,
            "api_type": format_to_legacy_api_type(request_format),
            "request_format": request_format,
            "sample": content[:200]
        }
    except Exception as e:
        error_text = str(e) or "未知错误"
        if isinstance(e, APIStatusError):
            status_code = getattr(getattr(e, "response", None), "status_code", None)
            if status_code:
                error_text = f"HTTP {status_code}: {error_text}"
        mark_provider_failure(provider.id, error_text)
        raise HTTPException(status_code=502, detail=f"测试失败: {error_text[:300]}")


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


@router.post("/users/{user_id}/quota")
async def set_user_quota(
    user_id: int,
    request: UserQuotaRequest,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """设置用户存储配额（管理员）"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    user.storage_quota_mb = max(0, request.storage_quota_mb)
    db.commit()
    return {"message": "设置成功"}


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
            proxy=getattr(p, "proxy", None),
            pool_type=p.pool_type,
            api_type=getattr(p, 'api_type', 'openai'),
            request_format=normalize_request_format(
                getattr(p, "request_format", None),
                api_type=getattr(p, "api_type", None),
            ),
            is_primary=p.is_primary,
            weight=getattr(p, 'weight', 10),
            priority=getattr(p, 'priority', 1),
            models=p.models,
            enabled=p.enabled,
            last_success_at=getattr(p, "last_success_at", None),
            last_failure_at=getattr(p, "last_failure_at", None),
            last_error=getattr(p, "last_error", None),
            avg_latency_ms=getattr(p, "avg_latency_ms", None),
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
    request_format = normalize_request_format(request.request_format, api_type=request.api_type)

    provider = LLMProvider(
        name=request.name,
        base_url=request.base_url,
        api_key=request.api_key,
        proxy=request.proxy,
        pool_type=request.pool_type,
        api_type=format_to_legacy_api_type(request_format),
        request_format=request_format,
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
        proxy=getattr(provider, "proxy", None),
        pool_type=provider.pool_type,
        api_type=provider.api_type,
        request_format=normalize_request_format(
            getattr(provider, "request_format", None),
            api_type=getattr(provider, "api_type", None),
        ),
        is_primary=provider.is_primary,
        weight=provider.weight,
        priority=getattr(provider, 'priority', 1),
        models=provider.models,
        enabled=provider.enabled,
        last_success_at=getattr(provider, "last_success_at", None),
        last_failure_at=getattr(provider, "last_failure_at", None),
        last_error=getattr(provider, "last_error", None),
        avg_latency_ms=getattr(provider, "avg_latency_ms", None),
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
    request_format_input = update_data.pop("request_format", None)
    api_type_input = update_data.pop("api_type", None)

    resolved_request_format = normalize_request_format(
        request_format_input if request_format_input is not None else getattr(provider, "request_format", None),
        api_type=api_type_input if api_type_input is not None else getattr(provider, "api_type", None),
    )
    provider.request_format = resolved_request_format
    provider.api_type = format_to_legacy_api_type(resolved_request_format)

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
        proxy=getattr(provider, "proxy", None),
        pool_type=provider.pool_type,
        api_type=getattr(provider, 'api_type', 'openai'),
        request_format=normalize_request_format(
            getattr(provider, "request_format", None),
            api_type=getattr(provider, "api_type", None),
        ),
        is_primary=provider.is_primary,
        weight=getattr(provider, 'weight', 10),
        priority=getattr(provider, 'priority', 1),
        models=provider.models,
        enabled=provider.enabled,
        last_success_at=getattr(provider, "last_success_at", None),
        last_failure_at=getattr(provider, "last_failure_at", None),
        last_error=getattr(provider, "last_error", None),
        avg_latency_ms=getattr(provider, "avg_latency_ms", None),
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


@router.post("/llm-providers/{provider_id}/test")
async def test_llm_provider(
    provider_id: int,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """测试 LLM 提供商连通性"""
    provider = db.query(LLMProvider).filter(LLMProvider.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="提供商不存在")
    if provider.pool_type not in ("metadata", "analysis"):
        raise HTTPException(status_code=400, detail="仅支持元数据/分析池的测试")

    return await _test_provider_connectivity(provider)


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


# ================= 审计日志 =================
@router.get("/audit-logs")
async def get_audit_logs(
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """获取审计日志（管理员）"""
    query = db.query(AuditLog).order_by(AuditLog.created_at.desc())
    if user_id is not None:
        query = query.filter(AuditLog.user_id == user_id)
    if action:
        query = query.filter(AuditLog.action == action)

    total = query.count()
    logs = query.offset(offset).limit(min(limit, 500)).all()
    return {
        "total": total,
        "logs": [
            {
                "id": log.id,
                "user_id": log.user_id,
                "action": log.action,
                "resource_type": log.resource_type,
                "resource_id": log.resource_id,
                "details": log.details,
                "created_at": log.created_at
            }
            for log in logs
        ]
    }


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
