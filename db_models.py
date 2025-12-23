from sqlalchemy import create_engine, Column, Integer, String, Text, JSON, Table, ForeignKey, Boolean
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

# ================= 6. 初始化 =================
# 优先从 Streamlit Secrets 读取，其次从环境变量，最后使用默认值
try:
    import streamlit as st
    DB_URL = st.secrets.get("DB_URL", os.getenv("DB_URL", "sqlite:///papers.db"))
except:
    DB_URL = os.getenv("DB_URL", "sqlite:///papers.db")

engine = create_engine(DB_URL)
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)
