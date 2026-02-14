"""
认证路由 - 登录、注册、获取当前用户
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from backend.core.db_models import User
from backend.core.utils import make_password_hash

from backend.deps import get_db, create_access_token, get_current_user
from backend.schemas import RegisterRequest, TokenResponse, UserResponse

router = APIRouter(prefix="/api/auth", tags=["认证"])

@router.post("/login", response_model=TokenResponse)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """用户登录"""
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or user.password_hash != make_password_hash(form_data.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": str(user.id)})
    return TokenResponse(access_token=access_token)


@router.post("/register", response_model=UserResponse)
async def register(request: RegisterRequest, db: Session = Depends(get_db)):
    """用户注册"""
    # 检查用户名是否已存在
    if db.query(User).filter(User.username == request.username).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已存在"
        )
    
    # 如果是第一个用户，设为管理员
    user_count = db.query(User).count()
    role = "admin" if user_count == 0 else "user"
    
    new_user = User(
        username=request.username,
        password_hash=make_password_hash(request.password),
        email=request.email,
        role=role
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return UserResponse(id=new_user.id, username=new_user.username, role=new_user.role)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """获取当前用户信息"""
    return UserResponse(id=current_user.id, username=current_user.username, role=current_user.role)

