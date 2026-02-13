"""
LLM 请求格式兼容工具
"""

from __future__ import annotations


REQUEST_FORMAT_OPENAI = "openai"
REQUEST_FORMAT_OPENAI_RESPONSE = "openai_response"
REQUEST_FORMAT_GEMINI = "gemini"
REQUEST_FORMAT_ANTHROPIC = "anthropic"

SUPPORTED_REQUEST_FORMATS = {
    REQUEST_FORMAT_OPENAI,
    REQUEST_FORMAT_OPENAI_RESPONSE,
    REQUEST_FORMAT_GEMINI,
    REQUEST_FORMAT_ANTHROPIC,
}


def normalize_request_format(
    request_format: str | None = None,
    *,
    api_type: str | None = None,
) -> str:
    """
    统一主链路请求格式。旧字段 api_type 作为兼容兜底。
    """
    value = (request_format or "").strip().lower()
    if value in SUPPORTED_REQUEST_FORMATS:
        return value

    legacy = (api_type or "").strip().lower()
    if legacy in (REQUEST_FORMAT_GEMINI, REQUEST_FORMAT_ANTHROPIC):
        return legacy
    return REQUEST_FORMAT_OPENAI


def normalize_translation_request_format(
    request_format: str | None = None,
    *,
    engine_type: str | None = None,
) -> str:
    """
    统一翻译链路请求格式。旧字段 engine_type 作为兼容兜底。
    """
    value = (request_format or "").strip().lower()
    if value in SUPPORTED_REQUEST_FORMATS:
        return value

    legacy = (engine_type or "").strip().lower()
    if legacy in (REQUEST_FORMAT_GEMINI, REQUEST_FORMAT_ANTHROPIC, REQUEST_FORMAT_OPENAI_RESPONSE):
        return legacy
    return REQUEST_FORMAT_OPENAI


def format_to_legacy_api_type(request_format: str | None) -> str:
    """
    将标准格式回写到旧字段 api_type（保持兼容）。
    """
    normalized = normalize_request_format(request_format)
    if normalized == REQUEST_FORMAT_ANTHROPIC:
        return REQUEST_FORMAT_ANTHROPIC
    if normalized == REQUEST_FORMAT_GEMINI:
        return REQUEST_FORMAT_GEMINI
    return REQUEST_FORMAT_OPENAI


