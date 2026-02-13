"""
存储配额与统计服务
"""
from typing import Optional

from backend.core.log_service import get_logger
from backend.core.settings import settings
from backend.core.db_models import SystemConfig, User, Session

logger = get_logger("storage")


def _get_system_quota_mb(session: Session) -> Optional[int]:
    """读取系统默认配额（MB）"""
    config = session.query(SystemConfig).filter_by(key="storage_quota_mb").first()
    if config and config.value:
        try:
            return int(config.value)
        except ValueError:
            return None
    return settings.storage_quota_mb


def get_user_quota_bytes(session: Session, user: User) -> Optional[int]:
    """获取用户配额（字节）"""
    if user.storage_quota_mb is not None:
        return max(0, int(user.storage_quota_mb)) * 1024 * 1024
    quota_mb = _get_system_quota_mb(session)
    if quota_mb is None:
        return None
    return max(0, int(quota_mb)) * 1024 * 1024


