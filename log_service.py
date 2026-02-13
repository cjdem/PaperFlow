"""
日志服务模块 - 为整个项目提供统一的日志记录功能
"""
import logging
import os
import sys
from datetime import datetime
from logging.handlers import RotatingFileHandler

from settings import settings

# ================= 日志配置 =================
LOG_DIR = settings.log_dir
LOG_FILE = settings.log_file
LOG_FORMAT = settings.log_format
LOG_DATE_FORMAT = settings.log_date_format
MAX_LOG_SIZE = settings.log_max_size  # 5MB
BACKUP_COUNT = settings.log_backup_count  # 保留3个备份文件

# 全局日志开关
_log_enabled = settings.log_enabled

DEFAULT_LOG_LEVEL = settings.log_level
DEFAULT_LOG_ENABLED = settings.log_enabled


def is_logging_enabled() -> bool:
    """检查日志是否启用"""
    return _log_enabled


def set_logging_enabled(enabled: bool):
    """
    设置日志启用状态并重新配置日志系统
    
    Args:
        enabled: True 启用日志，False 禁用日志
    """
    global _log_enabled
    _log_enabled = enabled
    
    # 重新配置日志系统
    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    
    if enabled:
        # 启用日志：添加文件和控制台处理器
        _add_handlers(root_logger)
    else:
        # 禁用日志：只添加 NullHandler
        root_logger.addHandler(logging.NullHandler())


def _add_handlers(logger: logging.Logger):
    """为日志记录器添加处理器"""
    # 创建日志目录
    if not os.path.exists(LOG_DIR):
        os.makedirs(LOG_DIR, exist_ok=True)
    
    # 创建格式化器
    formatter = logging.Formatter(LOG_FORMAT, datefmt=LOG_DATE_FORMAT)
    
    # 文件处理器（带轮转）
    log_path = os.path.join(LOG_DIR, LOG_FILE)
    file_handler = RotatingFileHandler(
        log_path,
        maxBytes=MAX_LOG_SIZE,
        backupCount=BACKUP_COUNT,
        encoding="utf-8"
    )
    file_handler.setLevel(logging.DEBUG)  # 文件记录所有级别
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    
    # 控制台处理器（简化输出）
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_formatter = logging.Formatter("%(levelname)-8s | %(message)s")
    console_handler.setFormatter(console_formatter)
    logger.addHandler(console_handler)


def setup_logging(level: str = DEFAULT_LOG_LEVEL, enabled: bool = DEFAULT_LOG_ENABLED) -> logging.Logger:
    """
    配置并返回根日志记录器
    
    Args:
        level: 日志级别 (DEBUG, INFO, WARNING, ERROR)
        enabled: 是否启用日志
    
    Returns:
        配置好的根日志记录器
    """
    global _log_enabled
    _log_enabled = enabled
    
    # 获取根日志记录器
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, level.upper(), logging.INFO))
    
    # 清除现有处理器（避免重复）
    root_logger.handlers.clear()
    
    if enabled:
        _add_handlers(root_logger)
    else:
        root_logger.addHandler(logging.NullHandler())
    
    return root_logger


def get_logger(name: str) -> logging.Logger:
    """
    获取指定名称的日志记录器
    
    Args:
        name: 日志记录器名称（通常使用模块名）
    
    Returns:
        日志记录器实例
    """
    return logging.getLogger(name)


# ================= 专用日志记录器 =================

class LLMLogger:
    """LLM 调用专用日志记录器"""
    
    def __init__(self):
        self.logger = get_logger("llm")
    
    def log_request(self, pool_name: str, provider_id: str, api_type: str, weight: int):
        """记录 LLM 请求"""
        self.logger.info(f"📡 [{pool_name}] 选中通道: {provider_id} (类型: {api_type}, 权重: {weight})")
    
    def log_success(self, provider_id: str, task: str):
        """记录成功"""
        self.logger.info(f"✅ [{provider_id}] {task} 成功")
    
    def log_retry(self, attempt: int, max_retries: int, new_provider: str, error: str):
        """记录重试"""
        self.logger.warning(f"🔄 [重试 {attempt}/{max_retries}] 切换到: {new_provider}")
        self.logger.debug(f"   失败原因: {error}")
    
    def log_failure(self, provider_id: str, error: str):
        """记录失败"""
        self.logger.error(f"❌ [{provider_id}] 失败: {error}")
    
    def log_exhausted(self):
        """记录所有通道耗尽"""
        self.logger.error("❌ 所有 LLM 通道已耗尽，无法继续重试")


class WorkflowLogger:
    """论文处理流程专用日志记录器"""
    
    def __init__(self):
        self.logger = get_logger("workflow")
    
    def log_start(self, filename: str):
        """记录开始处理"""
        self.logger.info(f"📄 开始处理: {filename}")
    
    def log_step(self, step: int, total: int, description: str):
        """记录处理步骤"""
        self.logger.info(f"[{step}/{total}] {description}")
    
    def log_complete(self, filename: str, title: str):
        """记录处理完成"""
        self.logger.info(f"🎉 处理完成: {title[:50]}...")
    
    def log_skip(self, filename: str, reason: str):
        """记录跳过"""
        self.logger.warning(f"⏭️ 跳过: {filename} - {reason}")
    
    def log_error(self, filename: str, error: str):
        """记录错误"""
        self.logger.error(f"❌ 处理失败: {filename} - {error}")


class DBLogger:
    """数据库操作专用日志记录器"""
    
    def __init__(self):
        self.logger = get_logger("database")
    
    def log_query(self, operation: str, table: str, details: str = ""):
        """记录查询操作"""
        msg = f"🔍 {operation} on {table}"
        if details:
            msg += f": {details}"
        self.logger.debug(msg)
    
    def log_write(self, operation: str, table: str, record_id: int = None):
        """记录写入操作"""
        msg = f"💾 {operation} on {table}"
        if record_id:
            msg += f" (id={record_id})"
        self.logger.debug(msg)
    
    def log_error(self, operation: str, error: str):
        """记录错误"""
        self.logger.error(f"❌ DB Error in {operation}: {error}")


class AuthLogger:
    """认证操作专用日志记录器"""
    
    def __init__(self):
        self.logger = get_logger("auth")
    
    def log_login(self, username: str, success: bool):
        """记录登录"""
        if success:
            self.logger.info(f"🔓 用户登录成功: {username}")
        else:
            self.logger.warning(f"🔒 登录失败: {username}")
    
    def log_register(self, username: str, success: bool):
        """记录注册"""
        if success:
            self.logger.info(f"✅ 用户注册成功: {username}")
        else:
            self.logger.warning(f"❌ 注册失败: {username}")
    
    def log_logout(self, username: str):
        """记录登出"""
        self.logger.info(f"👋 用户登出: {username}")


# ================= 全局日志实例 =================
# 在模块加载时初始化日志系统
setup_logging()

# 创建专用日志记录器实例
llm_logger = LLMLogger()
workflow_logger = WorkflowLogger()
db_logger = DBLogger()
auth_logger = AuthLogger()
