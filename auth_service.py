"""
认证服务模块 - 处理用户登录和注册
"""
import hashlib
from db_service import get_db_session
from db_models import User
from log_service import auth_logger


def make_password_hash(password: str) -> str:
    """简单的密码哈希"""
    return hashlib.sha256(password.encode()).hexdigest()


def verify_user(username: str, password: str) -> dict | None:
    """验证用户登录"""
    with get_db_session() as session:
        user = session.query(User).filter_by(username=username).first()
        if user and user.password_hash == make_password_hash(password):
            auth_logger.log_login(username, True)
            return {"id": user.id, "username": user.username, "role": user.role}
    auth_logger.log_login(username, False)
    return None


def register_user(username: str, password: str, email: str) -> tuple[bool, str]:
    """注册新用户"""
    with get_db_session() as session:
        if session.query(User).filter_by(username=username).first():
            auth_logger.log_register(username, False)
            return False, "用户名已存在"

        # 如果是第一个注册用户，自动设为管理员
        user_count = session.query(User).count()
        role = "admin" if user_count == 0 else "user"

        new_user = User(
            username=username,
            password_hash=make_password_hash(password),
            email=email,
            role=role
        )
        session.add(new_user)
        auth_logger.log_register(username, True)
        return True, f"注册成功！角色: {role}"

