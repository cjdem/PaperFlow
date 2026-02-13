"""
审计日志服务模块
用于记录关键用户操作
"""
from datetime import datetime
from typing import Optional, Dict

from log_service import get_logger
from db_models import Session, AuditLog

logger = get_logger("audit")


def log_audit_event(
    action: str,
    resource_type: str,
    resource_id: Optional[str] = None,
    user_id: Optional[int] = None,
    details: Optional[Dict] = None
) -> None:
    """写入审计日志"""
    session = Session()
    try:
        entry = AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id is not None else None,
            details=details,
            created_at=datetime.now().isoformat()
        )
        session.add(entry)
        session.commit()
    except Exception as e:
        logger.warning(f"审计日志写入失败: {e}")
    finally:
        session.close()
