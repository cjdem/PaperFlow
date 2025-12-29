"""
依赖项模块 - 数据库会话、JWT 认证等
"""
import os
import sys
from datetime import datetime, timedelta
from typing import Generator, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from dotenv import load_dotenv

# 添加父目录到路径，以便导入共享模块
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 复用 db_models 中的数据库配置，确保使用同一个数据库
from db_models import Base, User, Session as DBSession, Workspace, WorkspaceMember

load_dotenv()

# ================= 数据库配置 =================
# 直接使用 db_models 中的 Session，不创建新的引擎
def get_db() -> Generator[Session, None, None]:
    """获取数据库会话"""
    db = DBSession()
    try:
        yield db
    finally:
        db.close()


# ================= JWT 配置 =================
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "paperflow-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 天

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """创建 JWT Token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """从 JWT Token 解析当前用户"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无效的认证凭据",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id_str = payload.get("sub")
        if user_id_str is None:
            raise credentials_exception
        user_id = int(user_id_str)
    except JWTError:
        raise credentials_exception
    
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception
    return user


async def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    """确保当前用户是管理员"""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要管理员权限"
        )
    return current_user


# ================= 空间权限检查 =================
def get_workspace_member(
    workspace_id: int,
    user: User,
    db: Session
) -> WorkspaceMember | None:
    """获取用户在空间中的成员记录"""
    return db.query(WorkspaceMember).filter(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == user.id
    ).first()


def check_workspace_access(
    workspace_id: int,
    user: User,
    db: Session,
    required_roles: list[str] | None = None
) -> tuple[Workspace, WorkspaceMember]:
    """
    检查用户是否有权访问空间
    
    Args:
        workspace_id: 空间 ID
        user: 当前用户
        db: 数据库会话
        required_roles: 需要的角色列表，None 表示只需是成员即可
    
    Returns:
        (workspace, member) 元组
    
    Raises:
        HTTPException: 空间不存在或无权访问
    """
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="空间不存在"
        )
    
    member = get_workspace_member(workspace_id, user, db)
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="您不是此空间的成员"
        )
    
    if required_roles and member.role not in required_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"需要 {', '.join(required_roles)} 权限"
        )
    
    return workspace, member


def check_workspace_admin(
    workspace_id: int,
    user: User,
    db: Session
) -> tuple[Workspace, WorkspaceMember]:
    """检查用户是否是空间管理员（owner 或 admin）"""
    return check_workspace_access(workspace_id, user, db, ["owner", "admin"])


def check_workspace_owner(
    workspace_id: int,
    user: User,
    db: Session
) -> tuple[Workspace, WorkspaceMember]:
    """检查用户是否是空间所有者"""
    return check_workspace_access(workspace_id, user, db, ["owner"])
