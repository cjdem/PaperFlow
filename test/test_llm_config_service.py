from fastapi import HTTPException

from backend.core.db_models import LLMProvider, TranslationLLMProvider
from backend.core.llm_config_service import (
    _update_llm_config,
    _update_translation_config,
    to_model_config_response,
    to_translation_config_response,
    validate_target,
)
from backend.schemas import ModelConfigUpdateRequest


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
    assert response.weight == 10


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
    except HTTPException as exc:
        assert exc.status_code == 400
    else:
        raise AssertionError("validate_target should reject unknown target")


def test_empty_api_key_does_not_clear_llm_provider_key():
    provider = LLMProvider(
        id=3,
        name="OpenAI Mini",
        base_url="https://api.openai.com/v1",
        api_key="sk-existing",
        pool_type="analysis",
        api_type="openai",
        request_format="openai",
        models="gpt-4o-mini",
        is_primary=False,
        weight=10,
        priority=1,
        enabled=True,
    )
    request = ModelConfigUpdateRequest(api_key="")

    _update_llm_config(None, provider, request)

    assert provider.api_key == "sk-existing"


def test_translation_update_can_clear_pool_max_workers():
    provider = TranslationLLMProvider(
        id=4,
        name="Translator",
        engine_type="openai",
        request_format="openai",
        base_url="https://api.openai.com/v1",
        api_key="sk-existing",
        model="gpt-4o-mini",
        priority=100,
        qps=4,
        pool_max_workers=40,
        enabled=True,
    )
    request = ModelConfigUpdateRequest(pool_max_workers=None)

    _update_translation_config(provider, request)

    assert provider.pool_max_workers is None
