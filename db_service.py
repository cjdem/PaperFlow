"""
数据库服务模块 - 封装所有数据库访问逻辑
"""
import os
from contextlib import contextmanager
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, joinedload
import streamlit as st

from db_models import Paper, Group, User, SystemConfig

# ================= 数据库连接 =================
DB_URL = os.getenv("DB_URL", "sqlite:///papers.db")


@st.cache_resource
def get_engine():
    """获取数据库引擎（带缓存）"""
    return create_engine(DB_URL, pool_pre_ping=True)


engine = get_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@contextmanager
def get_db_session():
    """获取数据库会话的上下文管理器"""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


# ================= 分组操作 =================
def get_all_groups_list() -> list[str]:
    """获取所有分组名称列表"""
    try:
        with get_db_session() as session:
            return [g.name for g in session.query(Group).all()]
    except Exception:
        return []


def create_group(name: str) -> bool:
    """创建新分组"""
    if not name or not name.strip():
        return False
    try:
        with get_db_session() as session:
            if not session.query(Group).filter_by(name=name).first():
                session.add(Group(name=name))
                return True
        return False
    except Exception:
        return False


def update_paper_groups(paper_id: int, new_groups: list[str]):
    """更新论文的分组标签"""
    try:
        with get_db_session() as session:
            paper = session.query(Paper).get(paper_id)
            if paper:
                groups = session.query(Group).filter(Group.name.in_(new_groups)).all()
                paper.groups = groups
    except Exception:
        pass


# ================= 论文操作 =================
def get_papers(user_info: dict, view_mode: str = "all", search_query: str = None) -> list:
    """根据条件获取论文列表"""
    session = SessionLocal()
    try:
        query = (
            session.query(Paper)
            .options(joinedload(Paper.groups), joinedload(Paper.owner))
            .order_by(Paper.id.desc())
        )

        if user_info['role'] != 'admin':
            query = query.filter(Paper.owner_id == user_info['id'])

        if view_mode == "ungrouped":
            query = query.filter(~Paper.groups.any())
        elif view_mode != "all":
            query = query.filter(Paper.groups.any(name=view_mode))

        if search_query:
            q = search_query.lower()
            query = query.filter(
                (Paper.title.ilike(f"%{q}%"))
                | (Paper.title_cn.ilike(f"%{q}%"))
                | (Paper.authors.ilike(f"%{q}%"))
            )
        return query.all()
    except Exception:
        return []
    finally:
        session.close()


def is_md5_exist(md5_val: str) -> bool:
    """检查MD5是否已存在"""
    try:
        with get_db_session() as session:
            return session.query(Paper.id).filter_by(md5_hash=md5_val).first() is not None
    except Exception:
        return False


def delete_paper(paper_id: int) -> bool:
    """删除指定论文"""
    try:
        with get_db_session() as session:
            paper = session.query(Paper).filter_by(id=paper_id).first()
            if paper:
                session.delete(paper)
                return True
            return False
    except Exception:
        return False


# ================= 管理员操作 =================
def get_db_stats() -> dict:
    """获取数据库统计信息"""
    with get_db_session() as session:
        return {
            "user_count": session.query(User).count(),
            "paper_count": session.query(Paper).count(),
            "group_count": session.query(Group).count(),
        }


def get_all_users() -> list[dict]:
    """获取所有用户信息"""
    with get_db_session() as session:
        users = session.query(User).all()
        return [
            {"ID": u.id, "用户": u.username, "邮箱": u.email, "角色": u.role}
            for u in users
        ]


# ================= 系统配置操作 =================
def get_config(key: str, default: str = None) -> str:
    """获取系统配置值"""
    try:
        with get_db_session() as session:
            config = session.query(SystemConfig).filter_by(key=key).first()
            return config.value if config else default
    except Exception:
        return default


def set_config(key: str, value: str) -> bool:
    """设置系统配置值"""
    try:
        with get_db_session() as session:
            config = session.query(SystemConfig).filter_by(key=key).first()
            if config:
                config.value = str(value)
            else:
                session.add(SystemConfig(key=key, value=str(value)))
            return True
    except Exception:
        return False
