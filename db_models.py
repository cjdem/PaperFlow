from sqlalchemy import create_engine, Column, Integer, String, Text, JSON, Table, ForeignKey, Boolean
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
import os
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

Base = declarative_base()

# ================= 1. 多对多关联表 =================
# 记录论文与分组的对应关系
paper_group_association = Table(
    'paper_group_association',
    Base.metadata,
    Column('paper_id', Integer, ForeignKey('papers.id')),
    Column('group_id', Integer, ForeignKey('groups.id'))
)

# ================= 2. 用户模型 (新增) =================
class User(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True)
    username = Column(String(50), unique=True, nullable=False)
    password_hash = Column(String(128), nullable=False)
    email = Column(String(100))
    role = Column(String(20), default="user")  # 'admin' 或 'user'
    created_at = Column(Integer, default=lambda: int(datetime.now().timestamp()))

    # 反向关联：一个用户拥有多篇论文
    papers = relationship("Paper", back_populates="owner")

# ================= 3. 论文模型 (修改) =================
class Paper(Base):
    __tablename__ = 'papers'

    id = Column(Integer, primary_key=True)
    file_md5 = Column(String(32), unique=True, index=True) 
    title = Column(String)
    title_cn = Column(String)
    journal = Column(String)
    year = Column(String)
    authors = Column(Text)
    abstract_en = Column(Text)
    abstract = Column(Text)
    detailed_analysis = Column(Text)
    raw_metadata = Column(JSON)

    # 新增：所有者ID (关联到 User)
    owner_id = Column(Integer, ForeignKey('users.id'))
    owner = relationship("User", back_populates="papers")

    # 建立与分组的反向关联
    groups = relationship("Group", secondary=paper_group_association, back_populates="papers")

# ================= 4. 分组模型 =================
class Group(Base):
    __tablename__ = 'groups'
    id = Column(Integer, primary_key=True)
    name = Column(String(50), unique=True, nullable=False)

    # 建立与论文的关联
    papers = relationship("Paper", secondary=paper_group_association, back_populates="groups")

# ================= 5. LLM 提供商模型 =================
class LLMProvider(Base):
    __tablename__ = 'llm_providers'
    
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)  # 提供商名称
    base_url = Column(String(500), nullable=False)  # API 地址
    api_key = Column(String(500), nullable=False)  # API 密钥
    pool_type = Column(String(20), nullable=False)  # 'metadata' 或 'analysis'
    is_primary = Column(Boolean, default=False)  # 是否为主模型
    priority = Column(Integer, default=100)  # 优先级（数字越小优先级越高）
    models = Column(String(500), nullable=False)  # 支持的模型列表（逗号分隔）
    enabled = Column(Boolean, default=True)  # 是否启用
    created_at = Column(Integer, default=lambda: int(datetime.now().timestamp()))

# ================= 5. 初始化 =================
DB_URL = os.getenv("DB_URL", "sqlite:///papers.db")
engine = create_engine(DB_URL)
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)
