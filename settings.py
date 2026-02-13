"""
配置中心 - 统一读取环境变量与 Secrets
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

from dotenv import load_dotenv

# Load .env from repo root to avoid CWD-dependent behavior.
_ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
load_dotenv(dotenv_path=_ENV_PATH)


def _get_streamlit_secret(key: str) -> Optional[str]:
    """优先从 Streamlit Secrets 读取配置"""
    try:
        import streamlit as st
        value = st.secrets.get(key)
    except Exception:
        return None

    if value is None:
        return None
    value_str = str(value).strip()
    return value_str or None


def _get_env(key: str, default: Optional[str] = None) -> Optional[str]:
    """读取环境变量，空字符串视为未设置"""
    value = os.getenv(key)
    if value is None:
        return default
    value = value.strip()
    return value if value else default


def _get_required(key: str) -> str:
    """读取必填配置，缺失时抛出异常"""
    value = _get_streamlit_secret(key) or _get_env(key)
    if value is None:
        raise RuntimeError(f"缺少必填环境变量: {key}")
    return value


def _get_int(key: str, default: int) -> int:
    """读取整型配置"""
    value = _get_env(key)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _get_float(key: str, default: float) -> float:
    """读取浮点型配置"""
    value = _get_env(key)
    if value is None:
        return default
    try:
        return float(value)
    except ValueError:
        return default


def _get_bool(key: str, default: bool) -> bool:
    """读取布尔配置"""
    value = _get_env(key)
    if value is None:
        return default
    value_lower = value.lower()
    if value_lower in ("1", "true", "yes", "y", "on"):
        return True
    if value_lower in ("0", "false", "no", "n", "off"):
        return False
    return default


@dataclass(frozen=True)
class Settings:
    """全局配置"""
    db_url: str
    jwt_secret_key: str
    jwt_algorithm: str
    jwt_access_token_expire_minutes: int
    translation_max_pages_per_part: int
    translation_qps: int
    translation_lang_in: str
    translation_lang_out: str
    translation_retry_max: int
    translation_retry_delay: int
    translation_retry_backoff: float
    translation_task_timeout: int
    translation_max_concurrent: int
    log_dir: str
    log_file: str
    log_format: str
    log_date_format: str
    log_max_size: int
    log_backup_count: int
    log_level: str
    log_enabled: bool
    llm_max_retries: int
    file_storage_path: str
    storage_quota_mb: int


def load_settings() -> Settings:
    """加载全局配置"""
    db_url = _get_streamlit_secret("DB_URL") or _get_env("DB_URL", "sqlite:///papers.db")

    return Settings(
        db_url=db_url,
        jwt_secret_key=_get_required("JWT_SECRET_KEY"),
        jwt_algorithm=_get_env("JWT_ALGORITHM", "HS256"),
        jwt_access_token_expire_minutes=_get_int("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", 60 * 24 * 7),
        translation_max_pages_per_part=_get_int("TRANSLATION_MAX_PAGES_PER_PART", 50),
        translation_qps=_get_int("TRANSLATION_QPS", 4),
        translation_lang_in=_get_env("TRANSLATION_LANG_IN", "en"),
        translation_lang_out=_get_env("TRANSLATION_LANG_OUT", "zh"),
        translation_retry_max=_get_int("TRANSLATION_RETRY_MAX", 3),
        translation_retry_delay=_get_int("TRANSLATION_RETRY_DELAY", 60),
        translation_retry_backoff=_get_float("TRANSLATION_RETRY_BACKOFF", 2.0),
        translation_task_timeout=_get_int("TRANSLATION_TASK_TIMEOUT", 30),
        translation_max_concurrent=_get_int("TRANSLATION_MAX_CONCURRENT", 2),
        log_dir=_get_env("LOG_DIR", "logs"),
        log_file=_get_env("LOG_FILE", "paperflow.log"),
        log_format=_get_env(
            "LOG_FORMAT",
            "%(asctime)s | %(levelname)-8s | %(name)-20s | %(message)s"
        ),
        log_date_format=_get_env("LOG_DATE_FORMAT", "%Y-%m-%d %H:%M:%S"),
        log_max_size=_get_int("LOG_MAX_SIZE", 5 * 1024 * 1024),
        log_backup_count=_get_int("LOG_BACKUP_COUNT", 3),
        log_level=_get_env("LOG_LEVEL", "INFO"),
        log_enabled=_get_bool("LOG_ENABLED", True),
        llm_max_retries=_get_int("LLM_MAX_RETRIES", 3),
        file_storage_path=_get_env("FILE_STORAGE_PATH", "./uploads"),
        storage_quota_mb=_get_int("STORAGE_QUOTA_MB", 2048),
    )


settings = load_settings()
