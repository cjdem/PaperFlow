from sqlalchemy import create_engine, Column, Integer, String, Text, JSON, Table, ForeignKey, Boolean, UniqueConstraint
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
import os
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

Base = declarative_base()

# ================= 1. 关联表 =================
paper_group = Table('paper_group', Base.metadata,
    Column('paper_id', Integer, ForeignKey('papers.id'), primary_key=True),
    Column('group_id', Integer, ForeignKey('groups.id'), primary_key=True)
)

# ================= 2. Paper 模型 =================
class Paper(Base):
    __tablename__ = 'papers'

    id = Column(Integer, primary_key=True)
    title = Column(Text)
    title_cn = Column(Text, nullable=True)
    authors = Column(Text)
    year = Column(String(10))
    journal = Column(String(100))
    abstract = Column(Text, nullable=True)
    abstract_en = Column(Text, nullable=True)
    detailed_analysis = Column(Text, nullable=True)
    md5_hash = Column(String(32))
    owner_id = Column(Integer, ForeignKey("users.id"))

    owner = relationship("User", back_populates="papers")
    groups = relationship("Group", secondary=paper_group, back_populates="papers")

# ================= 3. Group 模型 =================
class Group(Base):
    __tablename__ = 'groups'

    id = Column(Integer, primary_key=True)
    name = Column(String(100), unique=True)

    papers = relationship("Paper", secondary=paper_group, back_populates="groups")

# ================= 4. User 模型 =================
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    username = Column(String(100), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    email = Column(String(100), nullable=True)
    role = Column(String(20), default="user")

    papers = relationship("Paper", back_populates="owner")
    # 团队空间关系
    owned_workspaces = relationship("Workspace", back_populates="owner")
    workspace_memberships = relationship("WorkspaceMember", back_populates="user")

# ================= 5. LLMProvider 模型 =================
class LLMProvider(Base):
    __tablename__ = "llm_providers"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    base_url = Column(String(255), nullable=False)
    api_key = Column(Text, nullable=False)
    pool_type = Column(String(20), nullable=False)
    api_type = Column(String(20), default="openai")  # openai 或 gemini
    is_primary = Column(Boolean, default=False)
    priority = Column(Integer, default=100)
    weight = Column(Integer, default=10)  # 权重，用于负载均衡
    models = Column(String(255), nullable=False)
    enabled = Column(Boolean, default=True)
    created_at = Column(String(50), default=str(datetime.now()))

# ================= 6. SystemConfig 模型 =================
class SystemConfig(Base):
    """系统全局配置表"""
    __tablename__ = "system_config"
    
    key = Column(String(50), primary_key=True)
    value = Column(String(255), nullable=False)

# ================= 7. Workspace 模型（团队空间）=================
class Workspace(Base):
    """团队空间"""
    __tablename__ = 'workspaces'
    
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(String(50), default=lambda: datetime.now().isoformat())
    updated_at = Column(String(50), default=lambda: datetime.now().isoformat())
    
    # 关系
    owner = relationship("User", back_populates="owned_workspaces")
    members = relationship("WorkspaceMember", back_populates="workspace", cascade="all, delete-orphan")
    papers = relationship("WorkspacePaper", back_populates="workspace", cascade="all, delete-orphan")
    invitations = relationship("WorkspaceInvitation", back_populates="workspace", cascade="all, delete-orphan")

# ================= 8. WorkspaceMember 模型（空间成员）=================
class WorkspaceMember(Base):
    """空间成员"""
    __tablename__ = 'workspace_members'
    
    id = Column(Integer, primary_key=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role = Column(String(20), default="member")  # owner, admin, member
    joined_at = Column(String(50), default=lambda: datetime.now().isoformat())
    
    # 关系
    workspace = relationship("Workspace", back_populates="members")
    user = relationship("User", back_populates="workspace_memberships")
    
    # 唯一约束：一个用户在一个空间只能有一个成员记录
    __table_args__ = (UniqueConstraint('workspace_id', 'user_id', name='uq_workspace_user'),)

# ================= 9. WorkspaceInvitation 模型（邀请）=================
class WorkspaceInvitation(Base):
    """空间邀请"""
    __tablename__ = 'workspace_invitations'
    
    id = Column(Integer, primary_key=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False)
    inviter_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    invitee_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String(20), default="pending")  # pending, accepted, rejected, expired
    created_at = Column(String(50), default=lambda: datetime.now().isoformat())
    expires_at = Column(String(50), nullable=True)  # 可选的过期时间
    
    # 关系
    workspace = relationship("Workspace", back_populates="invitations")
    inviter = relationship("User", foreign_keys=[inviter_id])
    invitee = relationship("User", foreign_keys=[invitee_id])

# ================= 10. WorkspacePaper 模型（空间论文关联）=================
class WorkspacePaper(Base):
    """空间论文关联"""
    __tablename__ = 'workspace_papers'
    
    id = Column(Integer, primary_key=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False)
    paper_id = Column(Integer, ForeignKey("papers.id"), nullable=False)
    shared_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    shared_at = Column(String(50), default=lambda: datetime.now().isoformat())
    
    # 关系
    workspace = relationship("Workspace", back_populates="papers")
    paper = relationship("Paper")
    sharer = relationship("User")
    
    # 唯一约束：一篇论文在一个空间只能存在一次
    __table_args__ = (UniqueConstraint('workspace_id', 'paper_id', name='uq_workspace_paper'),)

# ================= 11. 初始化 =================
# 优先从 Streamlit Secrets 读取，其次从环境变量，最后使用默认值
try:
    import streamlit as st
    DB_URL = st.secrets.get("DB_URL", os.getenv("DB_URL", "sqlite:///papers.db"))
except:
    DB_URL = os.getenv("DB_URL", "sqlite:///papers.db")

engine = create_engine(DB_URL)
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)
