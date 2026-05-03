import os
import shutil
from sqlalchemy import create_engine, Column, Integer, String, Text, JSON, Table, ForeignKey, Boolean, UniqueConstraint, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from datetime import datetime

from backend.core.settings import settings

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
    
    # 文件存储相关字段
    file_path = Column(String(500), nullable=True)      # 文件相对路径
    file_size = Column(Integer, nullable=True)          # 文件大小（字节）
    original_filename = Column(String(255), nullable=True)  # 原始文件名
    uploaded_at = Column(String(50), nullable=True)     # 上传时间
    
    # 翻译相关字段
    translation_status = Column(String(20), nullable=True)  # pending/processing/completed/failed
    translation_progress = Column(Integer, default=0)       # 翻译进度 0-100
    translated_file_path = Column(String(500), nullable=True)   # 中文版 PDF 路径
    translated_dual_path = Column(String(500), nullable=True)   # 双语对照版 PDF 路径
    translated_at = Column(String(50), nullable=True)       # 翻译完成时间
    translation_error = Column(Text, nullable=True)         # 翻译错误信息

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
    storage_quota_mb = Column(Integer, nullable=True)  # 用户存储配额（MB），为空则使用系统默认

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
    proxy = Column(String(500), nullable=True)
    pool_type = Column(String(20), nullable=False)
    api_type = Column(String(20), default="openai")  # 兼容旧字段（openai/gemini/anthropic）
    request_format = Column(String(30), default="openai")  # openai/openai_response/gemini/anthropic
    is_primary = Column(Boolean, default=False)
    priority = Column(Integer, default=100)
    weight = Column(Integer, default=10)  # 权重，用于负载均衡
    models = Column(String(255), nullable=False)
    enabled = Column(Boolean, default=True)
    created_at = Column(String(50), default=str(datetime.now()))
    last_success_at = Column(String(50), nullable=True)
    last_failure_at = Column(String(50), nullable=True)
    last_error = Column(Text, nullable=True)
    avg_latency_ms = Column(Integer, nullable=True)

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

# ================= 11. TranslationLLMProvider 模型（翻译 LLM 提供商）=================
class TranslationLLMProvider(Base):
    """翻译 LLM 提供商配置（独立于元数据/分析 LLM 池）"""
    __tablename__ = 'translation_llm_providers'
    
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)              # 提供商名称
    engine_type = Column(String(50), nullable=False)        # 引擎类型: openai/deepseek/google/deepl/ollama/gemini/azure
    request_format = Column(String(30), default="openai")   # openai/openai_response/gemini/anthropic
    base_url = Column(String(500), nullable=True)           # API 基础 URL
    api_key = Column(Text, nullable=True)                   # API 密钥（加密存储）
    proxy = Column(String(500), nullable=True)              # 可选代理地址
    model = Column(String(100), nullable=True)              # 模型名称
    priority = Column(Integer, default=100)                 # 优先级（数字越小优先级越高）
    qps = Column(Integer, default=4)                        # 每秒请求数限制
    pool_max_workers = Column(Integer, nullable=True)       # 最大工作线程数（默认为 qps * 10）
    no_auto_extract_glossary = Column(Boolean, default=False)  # 禁用自动术语提取（加速翻译）
    disable_rich_text_translate = Column(Boolean, default=False)  # 禁用富文本翻译（加速但丢失格式）
    enabled = Column(Boolean, default=True)                 # 是否启用
    created_at = Column(String(50), default=lambda: datetime.now().isoformat())

# ================= 12. TranslationQueue 模型（翻译队列）=================
class TranslationQueue(Base):
    """翻译任务队列"""
    __tablename__ = 'translation_queue'
    
    id = Column(Integer, primary_key=True)
    paper_id = Column(Integer, ForeignKey("papers.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    provider_id = Column(Integer, ForeignKey("translation_llm_providers.id"), nullable=True)
    
    status = Column(String(20), default="pending")          # pending/processing/completed/failed
    progress = Column(Integer, default=0)                   # 翻译进度 0-100
    current_stage = Column(String(100), nullable=True)      # 当前阶段描述
    current_part = Column(Integer, default=0)               # 当前分片索引
    total_parts = Column(Integer, default=1)                # 总分片数
    error_message = Column(Text, nullable=True)             # 错误信息
    retry_count = Column(Integer, default=0)                # 重试次数
    priority = Column(Integer, default=100)                 # 任务优先级
    
    created_at = Column(String(50), default=lambda: datetime.now().isoformat())
    started_at = Column(String(50), nullable=True)          # 开始时间
    completed_at = Column(String(50), nullable=True)        # 完成时间
    
    # 关系
    paper = relationship("Paper")
    user = relationship("User")
    provider = relationship("TranslationLLMProvider")

# ================= 13. TranslationLog 模型（翻译日志）=================
class TranslationLog(Base):
    """翻译任务日志"""
    __tablename__ = 'translation_logs'
    
    id = Column(Integer, primary_key=True)
    task_id = Column(Integer, ForeignKey("translation_queue.id"), nullable=True)
    paper_id = Column(Integer, ForeignKey("papers.id"), nullable=True)
    level = Column(String(20), nullable=False)              # DEBUG/INFO/WARNING/ERROR/CRITICAL
    message = Column(Text, nullable=False)                  # 日志消息
    details = Column(JSON, nullable=True)                   # 详细信息（JSON）
    created_at = Column(String(50), default=lambda: datetime.now().isoformat())
    
    # 关系
    task = relationship("TranslationQueue")
    paper = relationship("Paper")

# ================= 14. AuditLog 模型（审计日志）=================
class AuditLog(Base):
    """审计日志"""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String(100), nullable=False)
    resource_type = Column(String(50), nullable=False)
    resource_id = Column(String(50), nullable=True)
    details = Column(JSON, nullable=True)
    created_at = Column(String(50), default=lambda: datetime.now().isoformat())

    user = relationship("User")

# ================= 15. PaperNote 模型（论文笔记/批注）=================
class PaperNote(Base):
    """论文笔记/批注"""
    __tablename__ = 'paper_notes'

    id = Column(Integer, primary_key=True)
    paper_id = Column(Integer, ForeignKey("papers.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    highlight_text = Column(Text, nullable=True)
    page_number = Column(Integer, nullable=True)
    created_at = Column(String(50), default=lambda: datetime.now().isoformat())
    updated_at = Column(String(50), default=lambda: datetime.now().isoformat(), onupdate=lambda: datetime.now().isoformat())

    paper = relationship("Paper")
    user = relationship("User")

# ================= 16. ReadingHistory 模型（阅读历史）=================
class ReadingHistory(Base):
    """阅读历史"""
    __tablename__ = 'reading_history'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    paper_id = Column(Integer, ForeignKey("papers.id"), nullable=False)
    viewed_at = Column(String(50), default=lambda: datetime.now().isoformat())

    user = relationship("User")
    paper = relationship("Paper")

    __table_args__ = (UniqueConstraint('user_id', 'paper_id', name='uq_user_paper_history'),)

# ================= 17. PaperStar 模型（论文星标/收藏）=================
class PaperStar(Base):
    """论文星标/收藏"""
    __tablename__ = 'paper_stars'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    paper_id = Column(Integer, ForeignKey("papers.id"), nullable=False)
    created_at = Column(String(50), default=lambda: datetime.now().isoformat())

    user = relationship("User")
    paper = relationship("Paper")

    __table_args__ = (UniqueConstraint('user_id', 'paper_id', name='uq_user_paper_star'),)

# ================= 18. PaperChatHistory 模型（论文问答历史）=================
class PaperChatHistory(Base):
    """论文问答历史"""
    __tablename__ = 'paper_chat_history'

    id = Column(Integer, primary_key=True)
    paper_id = Column(Integer, ForeignKey("papers.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(String(50), default=lambda: datetime.now().isoformat())

    paper = relationship("Paper")
    user = relationship("User")

# ================= 初始化 =================
DB_URL = settings.db_url


def _extract_sqlite_file_path(db_url: str) -> str | None:
    """从 SQLite URL 提取文件路径"""
    prefix = "sqlite:///"
    if not db_url.startswith(prefix):
        return None

    raw_path = db_url[len(prefix):].split("?", 1)[0]
    if not raw_path or raw_path in (":memory:", "file::memory:?cache=shared"):
        return None
    if raw_path.startswith("file:"):
        return None

    db_path = raw_path.replace("/", os.sep)
    return os.path.abspath(db_path)


def _ensure_sqlite_parent_dir(db_url: str) -> None:
    """确保 SQLite 数据库父目录存在"""
    db_path = _extract_sqlite_file_path(db_url)
    if not db_path:
        return

    parent_dir = os.path.dirname(db_path)
    if parent_dir:
        os.makedirs(parent_dir, exist_ok=True)


def _migrate_legacy_default_sqlite(db_url: str) -> None:
    """兼容旧默认路径：首次切换到 data/papers.db 时迁移根目录 papers.db"""
    db_path = _extract_sqlite_file_path(db_url)
    if not db_path:
        return

    project_root = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
    new_default_path = os.path.abspath(os.path.join(project_root, "data", "papers.db"))
    legacy_path = os.path.abspath(os.path.join(project_root, "papers.db"))

    if os.path.normcase(db_path) != os.path.normcase(new_default_path):
        return
    if os.path.exists(db_path) or not os.path.exists(legacy_path):
        return

    shutil.copy2(legacy_path, db_path)


_ensure_sqlite_parent_dir(DB_URL)
_migrate_legacy_default_sqlite(DB_URL)

engine = create_engine(DB_URL)
Base.metadata.create_all(engine)

def _add_column_if_missing(table: str, column: str, column_type: str):
    try:
        inspector = inspect(engine)
        if table not in inspector.get_table_names():
            return
        columns = [c["name"] for c in inspector.get_columns(table)]
        if column in columns:
            return
        with engine.begin() as conn:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {column_type}"))
    except Exception:
        return

# 兼容旧数据库：为 llm_providers 增加 proxy 列（若缺失）
_add_column_if_missing("llm_providers", "proxy", "VARCHAR(500)")
_add_column_if_missing("llm_providers", "request_format", "VARCHAR(30)")
_add_column_if_missing("translation_llm_providers", "request_format", "VARCHAR(30)")
_add_column_if_missing("translation_llm_providers", "proxy", "VARCHAR(500)")

Session = sessionmaker(bind=engine)


