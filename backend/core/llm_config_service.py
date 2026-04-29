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


def field_was_set(model, field_name: str) -> bool:
    fields_set = getattr(model, "model_fields_set", None)
    if fields_set is None:
        fields_set = getattr(model, "__fields_set__", set())
    return field_name in fields_set


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


def list_model_configs(db: Session) -> list[ModelConfigResponse]:
    llm_providers = (
        db.query(LLMProvider)
        .order_by(
            LLMProvider.pool_type.asc(),
            LLMProvider.is_primary.desc(),
            LLMProvider.priority.asc(),
        )
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


def create_model_configs(
    db: Session,
    request: ModelConfigCreateRequest,
) -> list[ModelConfigResponse]:
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


def get_provider_by_target(db: Session, target: str, provider_id: int):
    target = validate_target(target)
    if target in LLM_TARGETS:
        provider = (
            db.query(LLMProvider)
            .filter(LLMProvider.id == provider_id, LLMProvider.pool_type == target)
            .first()
        )
    else:
        provider = (
            db.query(TranslationLLMProvider)
            .filter(TranslationLLMProvider.id == provider_id)
            .first()
        )
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
        _update_llm_config(db, provider, request)
        response = to_model_config_response(provider)
    else:
        _update_translation_config(provider, request)
        response = to_translation_config_response(provider)
    db.commit()
    db.refresh(provider)
    return response


def _update_llm_config(
    db: Session,
    provider: LLMProvider,
    request: ModelConfigUpdateRequest,
) -> None:
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
    if request.api_key:
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


def _update_translation_config(
    provider: TranslationLLMProvider,
    request: ModelConfigUpdateRequest,
) -> None:
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
    if field_was_set(request, "pool_max_workers"):
        provider.pool_max_workers = request.pool_max_workers
    if request.no_auto_extract_glossary is not None:
        provider.no_auto_extract_glossary = request.no_auto_extract_glossary
    if request.disable_rich_text_translate is not None:
        provider.disable_rich_text_translate = request.disable_rich_text_translate


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
