# 统一大模型配置入口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个统一的大模型添加和分配入口，让管理员可以把模型分配到元数据提取、深度分析和 PDF 翻译功能。

**Architecture:** 后端新增统一配置服务和 `/api/admin/model-configs` 接口，保留现有两张配置表和运行链路。前端新增独立模型配置组件，管理员页只负责挂载组件，翻译监控组件回归队列监控职责。

**Tech Stack:** FastAPI、SQLAlchemy、Pydantic、Next.js App Router、React、TypeScript、现有 `apiClient`。

---

## 文件结构

- Create: `backend/core/llm_config_service.py`
  - 统一模型配置服务，负责读取、创建、更新、删除、启用切换、主模型设置和测试调度。
- Modify: `backend/schemas.py`
  - 增加统一模型配置请求/响应 Pydantic 模型。
- Modify: `backend/routers/admin.py`
  - 增加 `/api/admin/model-configs` 路由，保留旧路由。
- Create: `test/test_llm_config_service.py`
  - 服务层映射与行为测试。当前仓库已有 `test/` 目录，沿用该目录。
- Create: `test/test_model_config_fallback.mjs`
  - 前端旧接口回退映射测试。
- Create: `frontend/components/admin/model-config/types.ts`
  - 前端统一模型配置类型。
- Create: `frontend/components/admin/model-config/modelConfigApi.ts`
  - 统一配置 API 适配层。
- Create: `frontend/components/admin/model-config/modelConfigFallback.ts`
  - 新统一接口返回 404 时，把旧接口数据映射为统一配置列表，避免未重启后端导致页面崩溃。
- Create: `frontend/components/admin/model-config/ModelProviderForm.tsx`
  - 添加/编辑表单。
- Create: `frontend/components/admin/model-config/ModelTargetSection.tsx`
  - 单个目标配置列表。
- Create: `frontend/components/admin/model-config/ModelConfigPanel.tsx`
  - 统一模型配置主面板。
- Modify: `frontend/app/admin/page.tsx`
  - 移除内联 LLM 配置状态和 JSX，改为挂载 `ModelConfigPanel`。
- Modify: `frontend/components/TranslationMonitor.tsx`
  - 移除翻译提供商 CRUD UI，只保留队列状态、任务列表和工作线程控制。

## Task 1: 后端 Schema

**Files:**
- Modify: `backend/schemas.py`

- [ ] **Step 1: 增加统一目标类型和请求/响应模型**

在 `TranslationProviderResponse` 后追加：

```python
class ModelTargetOptions(BaseModel):
    """单个目标的附加配置"""
    target: str
    priority: int = 100
    enabled: bool = True
    weight: int = 10
    is_primary: bool = False
    qps: int = 4
    pool_max_workers: Optional[int] = None
    no_auto_extract_glossary: bool = False
    disable_rich_text_translate: bool = False


class ModelConfigCreateRequest(BaseModel):
    """统一创建模型配置"""
    name: str
    request_format: str = "openai"
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    proxy: Optional[str] = None
    model: str
    targets: list[ModelTargetOptions]


class ModelConfigUpdateRequest(BaseModel):
    """统一更新模型配置"""
    name: Optional[str] = None
    request_format: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    proxy: Optional[str] = None
    model: Optional[str] = None
    priority: Optional[int] = None
    enabled: Optional[bool] = None
    weight: Optional[int] = None
    is_primary: Optional[bool] = None
    qps: Optional[int] = None
    pool_max_workers: Optional[int] = None
    no_auto_extract_glossary: Optional[bool] = None
    disable_rich_text_translate: Optional[bool] = None


class ModelConfigResponse(BaseModel):
    """统一模型配置响应"""
    id: int
    target: str
    name: str
    request_format: str
    base_url: Optional[str] = None
    proxy: Optional[str] = None
    model: str
    priority: int
    enabled: bool
    has_api_key: bool
    api_key: Optional[str] = None
    weight: Optional[int] = None
    is_primary: Optional[bool] = None
    qps: Optional[int] = None
    pool_max_workers: Optional[int] = None
    no_auto_extract_glossary: Optional[bool] = None
    disable_rich_text_translate: Optional[bool] = None
    last_success_at: Optional[str] = None
    last_failure_at: Optional[str] = None
    last_error: Optional[str] = None
    avg_latency_ms: Optional[int] = None
    created_at: Optional[str] = None
```

- [ ] **Step 2: 确认导入**

确认 `backend/schemas.py` 顶部已有：

```python
from typing import Optional
from pydantic import BaseModel
```

Expected: 文件不需要新增第三方依赖。

## Task 2: 后端统一配置服务

**Files:**
- Create: `backend/core/llm_config_service.py`

- [ ] **Step 1: 创建服务文件和常量**

```python
"""
统一模型配置服务 - 将元数据、分析、翻译模型配置收敛到同一业务入口。
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.core.db_models import LLMProvider, TranslationLLMProvider
from backend.core.llm_format import (
    format_to_legacy_api_type,
    normalize_request_format,
    normalize_translation_request_format,
)
from backend.schemas import (
    ModelConfigCreateRequest,
    ModelConfigResponse,
    ModelConfigUpdateRequest,
    ModelTargetOptions,
)

MODEL_TARGET_METADATA = "metadata"
MODEL_TARGET_ANALYSIS = "analysis"
MODEL_TARGET_TRANSLATION = "translation"
LLM_TARGETS = {MODEL_TARGET_METADATA, MODEL_TARGET_ANALYSIS}
ALL_TARGETS = LLM_TARGETS | {MODEL_TARGET_TRANSLATION}
```

- [ ] **Step 2: 添加校验与通用工具**

```python
def validate_target(target: str) -> str:
    normalized = (target or "").strip().lower()
    if normalized not in ALL_TARGETS:
        raise HTTPException(status_code=400, detail="不支持的模型配置目标")
    return normalized


def pick_model(value: str | None) -> str:
    model = (value or "").strip()
    if not model:
        raise HTTPException(status_code=400, detail="模型名称不能为空")
    return model


def has_key(value: str | None) -> bool:
    return bool((value or "").strip())
```

- [ ] **Step 3: 添加 ORM 到统一响应的映射**

```python
def to_model_config_response(provider: LLMProvider) -> ModelConfigResponse:
    request_format = normalize_request_format(
        getattr(provider, "request_format", None),
        api_type=getattr(provider, "api_type", None),
    )
    return ModelConfigResponse(
        id=provider.id,
        target=provider.pool_type,
        name=provider.name,
        request_format=request_format,
        base_url=provider.base_url,
        proxy=getattr(provider, "proxy", None),
        model=provider.models,
        priority=getattr(provider, "priority", 100),
        enabled=provider.enabled,
        has_api_key=has_key(provider.api_key),
        api_key=provider.api_key,
        weight=getattr(provider, "weight", 10),
        is_primary=provider.is_primary,
        last_success_at=getattr(provider, "last_success_at", None),
        last_failure_at=getattr(provider, "last_failure_at", None),
        last_error=getattr(provider, "last_error", None),
        avg_latency_ms=getattr(provider, "avg_latency_ms", None),
        created_at=getattr(provider, "created_at", None),
    )


def to_translation_config_response(provider: TranslationLLMProvider) -> ModelConfigResponse:
    request_format = normalize_translation_request_format(
        getattr(provider, "request_format", None),
        engine_type=getattr(provider, "engine_type", None),
    )
    return ModelConfigResponse(
        id=provider.id,
        target=MODEL_TARGET_TRANSLATION,
        name=provider.name,
        request_format=request_format,
        base_url=provider.base_url,
        proxy=getattr(provider, "proxy", None),
        model=provider.model or "",
        priority=provider.priority,
        enabled=provider.enabled,
        has_api_key=has_key(provider.api_key),
        qps=provider.qps,
        pool_max_workers=provider.pool_max_workers,
        no_auto_extract_glossary=provider.no_auto_extract_glossary,
        disable_rich_text_translate=provider.disable_rich_text_translate,
        created_at=provider.created_at,
    )
```

- [ ] **Step 4: 实现读取列表**

```python
def list_model_configs(db: Session) -> list[ModelConfigResponse]:
    llm_providers = (
        db.query(LLMProvider)
        .order_by(LLMProvider.pool_type.asc(), LLMProvider.is_primary.desc(), LLMProvider.priority.asc())
        .all()
    )
    translation_providers = (
        db.query(TranslationLLMProvider)
        .order_by(TranslationLLMProvider.priority.asc())
        .all()
    )
    return [
        *[to_model_config_response(provider) for provider in llm_providers],
        *[to_translation_config_response(provider) for provider in translation_providers],
    ]
```

- [ ] **Step 5: 实现创建配置**

```python
def create_model_configs(db: Session, request: ModelConfigCreateRequest) -> list[ModelConfigResponse]:
    model = pick_model(request.model)
    if not request.targets:
        raise HTTPException(status_code=400, detail="至少选择一个分配目标")

    created: list[ModelConfigResponse] = []
    for target_options in request.targets:
        target = validate_target(target_options.target)
        if target in LLM_TARGETS:
            created.append(_create_llm_config(db, request, target_options, target, model))
        else:
            created.append(_create_translation_config(db, request, target_options, model))
    db.commit()
    return created


def _create_llm_config(
    db: Session,
    request: ModelConfigCreateRequest,
    options: ModelTargetOptions,
    target: str,
    model: str,
) -> ModelConfigResponse:
    request_format = normalize_request_format(request.request_format)
    if options.is_primary:
        db.query(LLMProvider).filter(
            LLMProvider.pool_type == target,
            LLMProvider.is_primary == True,
        ).update({"is_primary": False})

    provider = LLMProvider(
        name=request.name,
        base_url=request.base_url or "",
        api_key=request.api_key or "",
        proxy=request.proxy,
        pool_type=target,
        api_type=format_to_legacy_api_type(request_format),
        request_format=request_format,
        models=model,
        is_primary=options.is_primary,
        weight=options.weight,
        priority=options.priority,
        enabled=options.enabled,
    )
    db.add(provider)
    db.flush()
    return to_model_config_response(provider)


def _create_translation_config(
    db: Session,
    request: ModelConfigCreateRequest,
    options: ModelTargetOptions,
    model: str,
) -> ModelConfigResponse:
    request_format = normalize_translation_request_format(request.request_format)
    provider = TranslationLLMProvider(
        name=request.name,
        engine_type=request_format,
        request_format=request_format,
        base_url=request.base_url,
        api_key=request.api_key,
        proxy=request.proxy,
        model=model,
        priority=options.priority,
        qps=options.qps,
        pool_max_workers=options.pool_max_workers,
        no_auto_extract_glossary=options.no_auto_extract_glossary,
        disable_rich_text_translate=options.disable_rich_text_translate,
        enabled=options.enabled,
    )
    db.add(provider)
    db.flush()
    return to_translation_config_response(provider)
```

- [ ] **Step 6: 实现查询单条、更新、删除、启用和主模型**

```python
def get_provider_by_target(db: Session, target: str, provider_id: int):
    target = validate_target(target)
    if target in LLM_TARGETS:
        provider = db.query(LLMProvider).filter(
            LLMProvider.id == provider_id,
            LLMProvider.pool_type == target,
        ).first()
    else:
        provider = db.query(TranslationLLMProvider).filter(
            TranslationLLMProvider.id == provider_id,
        ).first()
    if not provider:
        raise HTTPException(status_code=404, detail="提供商不存在")
    return provider


def update_model_config(
    db: Session,
    target: str,
    provider_id: int,
    request: ModelConfigUpdateRequest,
) -> ModelConfigResponse:
    provider = get_provider_by_target(db, target, provider_id)
    normalized_target = validate_target(target)
    if normalized_target in LLM_TARGETS:
        response = _update_llm_config(db, provider, request)
    else:
        response = _update_translation_config(provider, request)
    db.commit()
    db.refresh(provider)
    return response


def _update_llm_config(db: Session, provider: LLMProvider, request: ModelConfigUpdateRequest) -> ModelConfigResponse:
    if request.is_primary:
        db.query(LLMProvider).filter(
            LLMProvider.pool_type == provider.pool_type,
            LLMProvider.id != provider.id,
            LLMProvider.is_primary == True,
        ).update({"is_primary": False})

    if request.name is not None:
        provider.name = request.name
    if request.base_url is not None:
        provider.base_url = request.base_url
    if request.api_key is not None:
        provider.api_key = request.api_key
    if request.proxy is not None:
        provider.proxy = request.proxy
    if request.model is not None:
        provider.models = pick_model(request.model)
    if request.request_format is not None:
        provider.request_format = normalize_request_format(request.request_format)
        provider.api_type = format_to_legacy_api_type(provider.request_format)
    if request.priority is not None:
        provider.priority = request.priority
    if request.enabled is not None:
        provider.enabled = request.enabled
    if request.weight is not None:
        provider.weight = request.weight
    if request.is_primary is not None:
        provider.is_primary = request.is_primary
    return to_model_config_response(provider)


def _update_translation_config(
    provider: TranslationLLMProvider,
    request: ModelConfigUpdateRequest,
) -> ModelConfigResponse:
    if request.name is not None:
        provider.name = request.name
    if request.base_url is not None:
        provider.base_url = request.base_url
    if request.api_key:
        provider.api_key = request.api_key
    if request.proxy is not None:
        provider.proxy = request.proxy
    if request.model is not None:
        provider.model = pick_model(request.model)
    if request.request_format is not None:
        provider.request_format = normalize_translation_request_format(request.request_format)
        provider.engine_type = provider.request_format
    if request.priority is not None:
        provider.priority = request.priority
    if request.enabled is not None:
        provider.enabled = request.enabled
    if request.qps is not None:
        provider.qps = request.qps
    if request.pool_max_workers is not None:
        provider.pool_max_workers = request.pool_max_workers
    if request.no_auto_extract_glossary is not None:
        provider.no_auto_extract_glossary = request.no_auto_extract_glossary
    if request.disable_rich_text_translate is not None:
        provider.disable_rich_text_translate = request.disable_rich_text_translate
    return to_translation_config_response(provider)


def delete_model_config(db: Session, target: str, provider_id: int) -> None:
    provider = get_provider_by_target(db, target, provider_id)
    db.delete(provider)
    db.commit()


def toggle_model_config(db: Session, target: str, provider_id: int) -> bool:
    provider = get_provider_by_target(db, target, provider_id)
    provider.enabled = not provider.enabled
    db.commit()
    return provider.enabled


def set_primary_model_config(db: Session, target: str, provider_id: int) -> None:
    normalized_target = validate_target(target)
    if normalized_target not in LLM_TARGETS:
        raise HTTPException(status_code=400, detail="翻译配置不支持主模型设置")
    provider = get_provider_by_target(db, normalized_target, provider_id)
    db.query(LLMProvider).filter(
        LLMProvider.pool_type == provider.pool_type,
        LLMProvider.is_primary == True,
    ).update({"is_primary": False})
    provider.is_primary = True
    db.commit()
```

## Task 3: 后端统一路由

**Files:**
- Modify: `backend/routers/admin.py`

- [ ] **Step 1: 增加 schema 和服务导入**

在现有 `from backend.schemas import (...)` 中加入：

```python
    ModelConfigCreateRequest,
    ModelConfigResponse,
    ModelConfigUpdateRequest,
```

在文件顶部服务导入附近加入：

```python
from backend.core.llm_config_service import (
    delete_model_config,
    get_provider_by_target,
    list_model_configs,
    create_model_configs,
    set_primary_model_config,
    toggle_model_config,
    update_model_config,
)
from backend.core.translation_service import translation_service
```

- [ ] **Step 2: 新增统一读取和创建路由**

放在现有 `# ================= LLM 配置 =================` 前：

```python
@router.get("/model-configs", response_model=list[ModelConfigResponse])
async def get_model_configs(
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """获取统一模型配置列表"""
    return list_model_configs(db)


@router.post("/model-configs", response_model=list[ModelConfigResponse])
async def create_model_config_entries(
    request: ModelConfigCreateRequest,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """通过统一入口创建模型配置"""
    result = create_model_configs(db, request)
    if any(item.target in ("metadata", "analysis") for item in result):
        trigger_reload_async()
    return result
```

- [ ] **Step 3: 新增更新、删除、启用、主模型路由**

```python
@router.put("/model-configs/{target}/{provider_id}", response_model=ModelConfigResponse)
async def update_model_config_entry(
    target: str,
    provider_id: int,
    request: ModelConfigUpdateRequest,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """更新统一模型配置"""
    result = update_model_config(db, target, provider_id, request)
    if result.target in ("metadata", "analysis"):
        trigger_reload_async()
    return result


@router.delete("/model-configs/{target}/{provider_id}")
async def delete_model_config_entry(
    target: str,
    provider_id: int,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """删除统一模型配置"""
    normalized_target = target.strip().lower()
    delete_model_config(db, target, provider_id)
    if normalized_target in ("metadata", "analysis"):
        trigger_reload_async()
    return {"message": "删除成功"}


@router.post("/model-configs/{target}/{provider_id}/toggle")
async def toggle_model_config_entry(
    target: str,
    provider_id: int,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """切换统一模型配置启用状态"""
    normalized_target = target.strip().lower()
    enabled = toggle_model_config(db, target, provider_id)
    if normalized_target in ("metadata", "analysis"):
        trigger_reload_async()
    return {"message": "切换成功", "enabled": enabled}


@router.post("/model-configs/{target}/{provider_id}/set-primary")
async def set_primary_model_config_entry(
    target: str,
    provider_id: int,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """设置元数据/分析配置为主模型"""
    set_primary_model_config(db, target, provider_id)
    trigger_reload_async()
    return {"message": "设置成功"}
```

- [ ] **Step 4: 新增统一测试路由**

```python
@router.post("/model-configs/{target}/{provider_id}/test")
async def test_model_config_entry(
    target: str,
    provider_id: int,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """测试统一模型配置"""
    normalized_target = target.strip().lower()
    provider = get_provider_by_target(db, target, provider_id)
    if normalized_target in ("metadata", "analysis"):
        return await _test_provider_connectivity(provider)

    db.expunge(provider)
    return await translation_service.test_provider_connectivity(provider)
```

## Task 4: 后端服务层测试

**Files:**
- Create: `test/test_llm_config_service.py`

- [ ] **Step 1: 写映射测试**

```python
from backend.core.db_models import LLMProvider, TranslationLLMProvider
from backend.core.llm_config_service import (
    to_model_config_response,
    to_translation_config_response,
    validate_target,
)


def test_llm_provider_maps_to_unified_response():
    provider = LLMProvider(
        id=1,
        name="OpenAI Mini",
        base_url="https://api.openai.com/v1",
        api_key="sk-test",
        pool_type="metadata",
        api_type="openai",
        request_format="openai",
        models="gpt-4o-mini",
        is_primary=True,
        weight=10,
        priority=1,
        enabled=True,
    )

    response = to_model_config_response(provider)

    assert response.target == "metadata"
    assert response.model == "gpt-4o-mini"
    assert response.has_api_key is True
    assert response.is_primary is True


def test_translation_provider_maps_to_unified_response():
    provider = TranslationLLMProvider(
        id=2,
        name="Translator",
        engine_type="openai",
        request_format="openai",
        base_url="https://api.openai.com/v1",
        api_key="sk-test",
        model="gpt-4o-mini",
        priority=100,
        qps=4,
        enabled=True,
    )

    response = to_translation_config_response(provider)

    assert response.target == "translation"
    assert response.model == "gpt-4o-mini"
    assert response.qps == 4
    assert response.has_api_key is True


def test_validate_target_rejects_unknown_value():
    try:
        validate_target("unknown")
    except Exception as exc:
        assert getattr(exc, "status_code", None) == 400
    else:
        raise AssertionError("validate_target should reject unknown target")
```

- [ ] **Step 2: 运行测试**

Run:

```powershell
pytest "test/test_llm_config_service.py" -q
```

Expected: `3 passed`。

如果当前环境未安装 pytest，记录缺失依赖，不新增依赖。

## Task 5: 前端类型和 API 适配层

**Files:**
- Create: `frontend/components/admin/model-config/types.ts`
- Create: `frontend/components/admin/model-config/modelConfigApi.ts`

- [ ] **Step 1: 创建类型文件**

```typescript
export type ModelTarget = 'metadata' | 'analysis' | 'translation';

export interface ModelTargetOptions {
  target: ModelTarget;
  priority: number;
  enabled: boolean;
  weight: number;
  is_primary: boolean;
  qps: number;
  pool_max_workers: number | null;
  no_auto_extract_glossary: boolean;
  disable_rich_text_translate: boolean;
}

export interface ModelConfig {
  id: number;
  target: ModelTarget;
  name: string;
  request_format: string;
  base_url: string | null;
  proxy: string | null;
  model: string;
  priority: number;
  enabled: boolean;
  has_api_key: boolean;
  api_key?: string | null;
  weight?: number | null;
  is_primary?: boolean | null;
  qps?: number | null;
  pool_max_workers?: number | null;
  no_auto_extract_glossary?: boolean | null;
  disable_rich_text_translate?: boolean | null;
  last_success_at?: string | null;
  last_failure_at?: string | null;
  last_error?: string | null;
  avg_latency_ms?: number | null;
  created_at?: string | null;
}

export interface ModelConfigFormData {
  name: string;
  request_format: string;
  base_url: string;
  proxy: string;
  api_key: string;
  model: string;
  targets: ModelTargetOptions[];
}

export const MODEL_TARGET_LABELS: Record<ModelTarget, string> = {
  metadata: '元数据提取',
  analysis: '深度分析',
  translation: 'PDF 翻译',
};
```

- [ ] **Step 2: 创建 API 文件**

```typescript
import { apiClient } from '@/lib/apiClient';
import type { ModelConfig, ModelConfigFormData, ModelTarget } from './types';

export const modelConfigApi = {
  list: () => apiClient.get<ModelConfig[]>('/api/admin/model-configs'),

  create: (payload: ModelConfigFormData) =>
    apiClient.post<ModelConfig[]>('/api/admin/model-configs', payload),

  update: (target: ModelTarget, id: number, payload: Partial<ModelConfigFormData & ModelConfig>) =>
    apiClient.put<ModelConfig>(`/api/admin/model-configs/${target}/${id}`, payload),

  remove: (target: ModelTarget, id: number) =>
    apiClient.delete(`/api/admin/model-configs/${target}/${id}`),

  toggle: (target: ModelTarget, id: number) =>
    apiClient.post<{ enabled: boolean }>(`/api/admin/model-configs/${target}/${id}/toggle`),

  setPrimary: (target: ModelTarget, id: number) =>
    apiClient.post(`/api/admin/model-configs/${target}/${id}/set-primary`),

  test: (target: ModelTarget, id: number) =>
    apiClient.post<{
      success: boolean;
      message: string;
      latency_ms?: number;
      model?: string;
      request_format?: string;
      sample?: string;
    }>(`/api/admin/model-configs/${target}/${id}/test`),
};
```

## Task 6: 前端统一表单组件

**Files:**
- Create: `frontend/components/admin/model-config/ModelProviderForm.tsx`

- [ ] **Step 1: 实现表单组件**

```tsx
'use client';

import type { ModelConfig, ModelConfigFormData, ModelTarget, ModelTargetOptions } from './types';
import { MODEL_TARGET_LABELS } from './types';

const REQUEST_FORMATS = [
  { value: 'openai', label: 'OpenAI Chat Completions' },
  { value: 'openai_response', label: 'OpenAI Responses' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'anthropic', label: 'Anthropic Claude' },
];

const createTargetOptions = (target: ModelTarget): ModelTargetOptions => ({
  target,
  priority: target === 'translation' ? 100 : 1,
  enabled: true,
  weight: 10,
  is_primary: false,
  qps: 4,
  pool_max_workers: null,
  no_auto_extract_glossary: false,
  disable_rich_text_translate: false,
});

interface Props {
  value: ModelConfigFormData;
  editingConfig: ModelConfig | null;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  onChange: (value: ModelConfigFormData) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

export function ModelProviderForm({ value, editingConfig, saveStatus, onChange, onCancel, onSubmit }: Props) {
  const updateTarget = (target: ModelTarget, patch: Partial<ModelTargetOptions>) => {
    onChange({
      ...value,
      targets: value.targets.map(item => item.target === target ? { ...item, ...patch } : item),
    });
  };

  const toggleTarget = (target: ModelTarget) => {
    const exists = value.targets.some(item => item.target === target);
    onChange({
      ...value,
      targets: exists
        ? value.targets.filter(item => item.target !== target)
        : [...value.targets, createTargetOptions(target)],
    });
  };

  const selectedTargets = new Set(value.targets.map(item => item.target));
  const isEditing = Boolean(editingConfig);

  return (
    <div className="fluent-card p-6 border-2 border-purple-500/50 mb-6 fluent-scale-in">
      <h3 className="text-lg font-semibold text-[var(--fluent-foreground)] mb-5">
        {isEditing ? '编辑模型配置' : '添加模型配置'}
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className="block text-sm font-medium text-[var(--fluent-foreground)] mb-2">名称</label>
          <input className="fluent-input w-full" value={value.name} onChange={event => onChange({ ...value, name: event.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--fluent-foreground)] mb-2">请求格式</label>
          <select className="fluent-select w-full" value={value.request_format} onChange={event => onChange({ ...value, request_format: event.target.value })}>
            {REQUEST_FORMATS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-[var(--fluent-foreground)] mb-2">Base URL</label>
          <input className="fluent-input w-full" value={value.base_url} onChange={event => onChange({ ...value, base_url: event.target.value })} />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-[var(--fluent-foreground)] mb-2">Proxy</label>
          <input className="fluent-input w-full" value={value.proxy} onChange={event => onChange({ ...value, proxy: event.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--fluent-foreground)] mb-2">API Key</label>
          <input className="fluent-input w-full" type="password" value={value.api_key} onChange={event => onChange({ ...value, api_key: event.target.value })} placeholder={isEditing ? '留空表示不修改' : ''} />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--fluent-foreground)] mb-2">模型名称</label>
          <input className="fluent-input w-full" value={value.model} onChange={event => onChange({ ...value, model: event.target.value })} />
        </div>
      </div>

      {!isEditing && (
        <div className="mt-5">
          <label className="block text-sm font-medium text-[var(--fluent-foreground)] mb-3">分配目标</label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(['metadata', 'analysis', 'translation'] as ModelTarget[]).map(target => (
              <label key={target} className="fluent-card p-3 flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={selectedTargets.has(target)} onChange={() => toggleTarget(target)} />
                <span>{MODEL_TARGET_LABELS[target]}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 space-y-4">
        {value.targets.map(options => (
          <div key={options.target} className="fluent-card p-4">
            <div className="font-medium text-[var(--fluent-foreground)] mb-3">{MODEL_TARGET_LABELS[options.target]}</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input className="fluent-input" type="number" value={options.priority} onChange={event => updateTarget(options.target, { priority: Number(event.target.value) })} />
              {options.target !== 'translation' && (
                <>
                  <input className="fluent-input" type="number" value={options.weight} onChange={event => updateTarget(options.target, { weight: Number(event.target.value) })} />
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={options.is_primary} onChange={event => updateTarget(options.target, { is_primary: event.target.checked })} />主模型</label>
                </>
              )}
              {options.target === 'translation' && (
                <>
                  <input className="fluent-input" type="number" value={options.qps} onChange={event => updateTarget(options.target, { qps: Number(event.target.value) })} />
                  <input className="fluent-input" type="number" value={options.pool_max_workers ?? ''} onChange={event => updateTarget(options.target, { pool_max_workers: event.target.value ? Number(event.target.value) : null })} />
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <button className="fluent-button px-5 py-2" onClick={onCancel}>取消</button>
        <button className="fluent-button fluent-button-accent px-5 py-2" onClick={onSubmit} disabled={saveStatus === 'saving'}>
          {saveStatus === 'saving' ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  );
}
```

## Task 7: 前端目标列表组件

**Files:**
- Create: `frontend/components/admin/model-config/ModelTargetSection.tsx`

- [ ] **Step 1: 实现目标列表**

```tsx
'use client';

import type { ModelConfig, ModelTarget } from './types';
import { MODEL_TARGET_LABELS } from './types';

interface Props {
  target: ModelTarget;
  configs: ModelConfig[];
  testingId: string | null;
  onAdd: (target: ModelTarget) => void;
  onEdit: (config: ModelConfig) => void;
  onDelete: (config: ModelConfig) => void;
  onToggle: (config: ModelConfig) => void;
  onSetPrimary: (config: ModelConfig) => void;
  onTest: (config: ModelConfig) => void;
}

export function ModelTargetSection({
  target,
  configs,
  testingId,
  onAdd,
  onEdit,
  onDelete,
  onToggle,
  onSetPrimary,
  onTest,
}: Props) {
  return (
    <div className="fluent-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-[var(--fluent-foreground)]">{MODEL_TARGET_LABELS[target]}</h3>
        <button className="fluent-button fluent-button-accent px-4 py-2" onClick={() => onAdd(target)}>添加模型</button>
      </div>
      <div className="space-y-3">
        {configs.map(config => {
          const key = `${config.target}:${config.id}`;
          return (
            <div key={key} className="fluent-card p-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--fluent-foreground)]">{config.name}</span>
                    {config.is_primary && <span className="fluent-badge fluent-badge-success">主模型</span>}
                    {!config.enabled && <span className="fluent-badge">已停用</span>}
                  </div>
                  <div className="text-sm text-[var(--fluent-foreground-secondary)] mt-1">{config.model}</div>
                  <div className="text-xs text-[var(--fluent-foreground-secondary)] mt-1">{config.base_url || '未配置 Base URL'}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="fluent-button px-3 py-1.5" onClick={() => onTest(config)}>{testingId === key ? '测试中...' : '测试'}</button>
                  {target !== 'translation' && <button className="fluent-button px-3 py-1.5" onClick={() => onSetPrimary(config)}>设为主模型</button>}
                  <button className="fluent-button px-3 py-1.5" onClick={() => onToggle(config)}>{config.enabled ? '停用' : '启用'}</button>
                  <button className="fluent-button px-3 py-1.5" onClick={() => onEdit(config)}>编辑</button>
                  <button className="fluent-button px-3 py-1.5" onClick={() => onDelete(config)}>删除</button>
                </div>
              </div>
            </div>
          );
        })}
        {configs.length === 0 && (
          <div className="text-center py-10 text-[var(--fluent-foreground-secondary)]">尚未配置 {MODEL_TARGET_LABELS[target]} 模型</div>
        )}
      </div>
    </div>
  );
}
```

## Task 8: 前端统一面板

**Files:**
- Create: `frontend/components/admin/model-config/ModelConfigPanel.tsx`

- [ ] **Step 1: 实现主面板**

```tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ModelProviderForm } from './ModelProviderForm';
import { ModelTargetSection } from './ModelTargetSection';
import { modelConfigApi } from './modelConfigApi';
import type { ModelConfig, ModelConfigFormData, ModelTarget, ModelTargetOptions } from './types';

const targets: ModelTarget[] = ['metadata', 'analysis', 'translation'];

const createTargetOptions = (target: ModelTarget): ModelTargetOptions => ({
  target,
  priority: target === 'translation' ? 100 : 1,
  enabled: true,
  weight: 10,
  is_primary: false,
  qps: 4,
  pool_max_workers: null,
  no_auto_extract_glossary: false,
  disable_rich_text_translate: false,
});

const createEmptyFormData = (target: ModelTarget): ModelConfigFormData => ({
  name: '',
  request_format: 'openai',
  base_url: '',
  proxy: '',
  api_key: '',
  model: '',
  targets: [createTargetOptions(target)],
});

const formDataFromConfig = (config: ModelConfig): ModelConfigFormData => ({
  name: config.name,
  request_format: config.request_format,
  base_url: config.base_url || '',
  proxy: config.proxy || '',
  api_key: '',
  model: config.model,
  targets: [{
    target: config.target,
    priority: config.priority,
    enabled: config.enabled,
    weight: config.weight ?? 10,
    is_primary: Boolean(config.is_primary),
    qps: config.qps ?? 4,
    pool_max_workers: config.pool_max_workers ?? null,
    no_auto_extract_glossary: Boolean(config.no_auto_extract_glossary),
    disable_rich_text_translate: Boolean(config.disable_rich_text_translate),
  }],
});

export function ModelConfigPanel() {
  const [configs, setConfigs] = useState<ModelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<ModelConfigFormData | null>(null);
  const [editingConfig, setEditingConfig] = useState<ModelConfig | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [testingId, setTestingId] = useState<string | null>(null);

  const loadConfigs = useCallback(async () => {
    const data = await modelConfigApi.list();
    setConfigs(data);
  }, []);

  useEffect(() => {
    loadConfigs().finally(() => setLoading(false));
  }, [loadConfigs]);

  const grouped = useMemo(() => ({
    metadata: configs.filter(item => item.target === 'metadata'),
    analysis: configs.filter(item => item.target === 'analysis'),
    translation: configs.filter(item => item.target === 'translation'),
  }), [configs]);

  const handleAdd = (target: ModelTarget) => {
    setEditingConfig(null);
    setFormData(createEmptyFormData(target));
  };

  const handleEdit = (config: ModelConfig) => {
    setEditingConfig(config);
    setFormData(formDataFromConfig(config));
  };

  const resetForm = () => {
    setEditingConfig(null);
    setFormData(null);
    setSaveStatus('idle');
  };

  const save = async () => {
    if (!formData) return;
    setSaveStatus('saving');
    try {
      if (editingConfig) {
        const targetOptions = formData.targets[0];
        await modelConfigApi.update(editingConfig.target, editingConfig.id, {
          ...formData,
          ...targetOptions,
        });
      } else {
        await modelConfigApi.create(formData);
      }
      await loadConfigs();
      resetForm();
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const remove = async (config: ModelConfig) => {
    if (!confirm('确定要删除这个模型配置吗？')) return;
    await modelConfigApi.remove(config.target, config.id);
    await loadConfigs();
  };

  const toggle = async (config: ModelConfig) => {
    await modelConfigApi.toggle(config.target, config.id);
    await loadConfigs();
  };

  const setPrimary = async (config: ModelConfig) => {
    await modelConfigApi.setPrimary(config.target, config.id);
    await loadConfigs();
  };

  const test = async (config: ModelConfig) => {
    const key = `${config.target}:${config.id}`;
    setTestingId(key);
    try {
      const result = await modelConfigApi.test(config.target, config.id);
      const latency = result.latency_ms !== undefined ? `（${result.latency_ms}ms）` : '';
      alert(`✅ ${result.message}${latency}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '测试失败';
      alert(`❌ ${message}`);
    } finally {
      setTestingId(null);
    }
  };

  if (loading) {
    return <div className="text-[var(--fluent-foreground-secondary)]">加载中...</div>;
  }

  return (
    <div className="space-y-6 fluent-fade-in">
      {formData && (
        <ModelProviderForm
          value={formData}
          editingConfig={editingConfig}
          saveStatus={saveStatus}
          onChange={setFormData}
          onCancel={resetForm}
          onSubmit={save}
        />
      )}
      {targets.map(target => (
        <ModelTargetSection
          key={target}
          target={target}
          configs={grouped[target]}
          testingId={testingId}
          onAdd={handleAdd}
          onEdit={handleEdit}
          onDelete={remove}
          onToggle={toggle}
          onSetPrimary={setPrimary}
          onTest={test}
        />
      ))}
    </div>
  );
}
```

## Task 9: 接入管理员页并简化翻译监控

**Files:**
- Modify: `frontend/app/admin/page.tsx`
- Modify: `frontend/components/TranslationMonitor.tsx`

- [ ] **Step 1: 管理员页引入统一面板**

在 `frontend/app/admin/page.tsx` 顶部添加：

```typescript
import { ModelConfigPanel } from '@/components/admin/model-config/ModelConfigPanel';
```

- [ ] **Step 2: 管理员页替换 LLM Tab 内容**

将 `activeTab === 'llm'` 下的大块 LLM 配置 JSX 替换为：

```tsx
{activeTab === 'llm' && <ModelConfigPanel />}
```

- [ ] **Step 3: 删除管理员页中旧 LLM 状态和函数**

删除只服务旧 LLM 配置 UI 的内容：

```typescript
interface LLMProvider
const createEmptyProvider
const API_TYPE_INFO
const POOL_INFO
providers
activePoolTab
editingProvider
isAdding
formData
saveStatus
testingProviderId
handleEdit
handleAdd
handleSave
handleDelete
toggleProvider
setPrimary
testProvider
metadataProviders
analysisProviders
currentPoolProviders
poolInfo
renderProviderForm
renderProviderCard
```

保留 `retryCount` 和 `saveRetryConfig`，并把重试配置后续移入 `ModelConfigPanel`，或在第一阶段继续留在管理员页的系统配置区域。

- [ ] **Step 4: 简化数据加载**

将 `loadData` 中旧模型配置请求移除：

```typescript
const [statsRes, storageRes] = await Promise.all([
  apiClient.get<AdminStats>('/api/admin/stats'),
  apiClient.get<StorageStats>('/api/admin/storage-stats')
]);
setStats(statsRes);
setStorageStats(storageRes);
```

- [ ] **Step 5: 简化 TranslationMonitor**

从 `TranslationMonitor.tsx` 删除提供商管理表单和 CRUD 函数：

```typescript
ProviderFormData
REQUEST_FORMATS
createEmptyFormData
isAdding
editingProvider
formData
saveStatus
testingProviderId
deleteProvider
resetForm
handleAdd
handleEdit
createProvider
updateProvider
toggleProvider
testProvider
```

保留 `Provider` 类型、`fetchProviders` 和 provider 列表读取，因为队列任务和批量翻译仍需要展示可用翻译提供商。

## Task 10: 验证

**Files:**
- No code changes.

- [ ] **Step 1: 后端语法检查**

Run:

```powershell
python -m py_compile "backend/core/llm_config_service.py" "backend/routers/admin.py" "backend/schemas.py"
```

Expected: 无输出且退出码为 0。

- [ ] **Step 2: 后端测试**

Run:

```powershell
pytest "test/test_llm_config_service.py" -q
```

Expected: `5 passed`。如果 pytest 未安装，记录环境缺失。

- [ ] **Step 3: 前端 lint**

Run:

```powershell
Set-Location "frontend"; npm run lint
```

Expected: ESLint 通过。

- [ ] **Step 4: 前端回退映射测试**

Run:

```powershell
node --experimental-strip-types "test/test_model_config_fallback.mjs"
```

Expected: 退出码为 0。

- [ ] **Step 5: 手工 API 验证**

启动后端：

```powershell
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Expected: 在仓库根目录启动，`GET /health` 返回 `{"status":"ok"}`；`GET /api/admin/model-configs` 在未登录或无效 token 下返回 `401` 而不是 `404`。

使用管理员账号登录后验证：

- 打开管理员页。
- 进入 LLM 提供商页签。
- 创建一个模型，同时勾选元数据提取和深度分析。
- 再创建一个模型，只勾选 PDF 翻译。
- 分别测试三个目标配置。
- 停用、启用、删除配置，确认列表刷新正常。
- 确认翻译队列页仍能读取翻译提供商。

## 自检

- 设计不合并数据库表，避免大范围迁移。
- 统一接口不破坏旧接口。
- 每个新增文件职责单一。
- 前端组件拆分后，页面文件复杂度下降。
- 计划不包含 git commit、git push、reset 等操作。
