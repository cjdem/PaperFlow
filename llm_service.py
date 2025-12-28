"""
LLM 服务模块 - 处理 LLM 提供商的 CRUD 操作
"""
import json
import os
from db_service import get_db_session, SessionLocal
from db_models import LLMProvider


# ================= CRUD 操作 =================

def get_all_providers(pool_type: str = None) -> list[dict]:
    """获取所有提供商，可按类型过滤"""
    with get_db_session() as session:
        query = session.query(LLMProvider).order_by(LLMProvider.weight.desc())
        if pool_type:
            query = query.filter(LLMProvider.pool_type == pool_type)
        providers = query.all()
        return [
            {
                "id": p.id,
                "name": p.name,
                "base_url": p.base_url,
                "api_key": p.api_key,
                "pool_type": p.pool_type,
                "api_type": getattr(p, 'api_type', 'openai'),
                "is_primary": p.is_primary,
                "weight": getattr(p, 'weight', 10),
                "models": p.models,
                "enabled": p.enabled,
                "created_at": p.created_at,
            }
            for p in providers
        ]


def get_enabled_providers(pool_type: str) -> list[dict]:
    """获取启用的提供商，按优先级排序 (priority 越小越优先)"""
    with get_db_session() as session:
        providers = (
            session.query(LLMProvider)
            .filter(LLMProvider.pool_type == pool_type, LLMProvider.enabled == True)
            .order_by(LLMProvider.priority.asc())
            .all()
        )
        return [
            {
                "id": p.id,
                "name": p.name,
                "base_url": p.base_url,
                "api_key": p.api_key,
                "api_type": getattr(p, 'api_type', 'openai'),
                "models": p.models,
                "is_primary": p.is_primary,
                "weight": getattr(p, 'weight', 10),
                "priority": getattr(p, 'priority', 1),
            }
            for p in providers
        ]


def add_provider(name: str, base_url: str, api_key: str, pool_type: str, 
                 models: str, is_primary: bool = False, weight: int = 10, api_type: str = "openai") -> int:
    """添加新的提供商"""
    with get_db_session() as session:
        # 如果设置为主模型，先取消其他主模型
        if is_primary:
            session.query(LLMProvider).filter(
                LLMProvider.pool_type == pool_type, LLMProvider.is_primary == True
            ).update({"is_primary": False})
        
        provider = LLMProvider(
            name=name,
            base_url=base_url,
            api_key=api_key,
            pool_type=pool_type,
            api_type=api_type,
            models=models,
            is_primary=is_primary,
            weight=weight,
            enabled=True,
        )
        session.add(provider)
        session.flush()
        return provider.id


def update_provider(provider_id: int, **kwargs) -> bool:
    """更新提供商信息"""
    with get_db_session() as session:
        provider = session.query(LLMProvider).get(provider_id)
        if not provider:
            return False
        
        # 如果设置为主模型，先取消其他主模型
        if kwargs.get("is_primary"):
            session.query(LLMProvider).filter(
                LLMProvider.pool_type == provider.pool_type,
                LLMProvider.is_primary == True,
                LLMProvider.id != provider_id
            ).update({"is_primary": False})
        
        for key, value in kwargs.items():
            if hasattr(provider, key):
                setattr(provider, key, value)
        return True


def delete_provider(provider_id: int) -> bool:
    """删除提供商"""
    with get_db_session() as session:
        provider = session.query(LLMProvider).get(provider_id)
        if provider:
            session.delete(provider)
            return True
        return False


def set_primary(provider_id: int) -> bool:
    """设置为主模型"""
    with get_db_session() as session:
        provider = session.query(LLMProvider).get(provider_id)
        if not provider:
            return False
        
        # 取消该类型的其他主模型
        session.query(LLMProvider).filter(
            LLMProvider.pool_type == provider.pool_type,
            LLMProvider.is_primary == True
        ).update({"is_primary": False})
        
        # 设置当前为主模型
        provider.is_primary = True
        return True


def toggle_enabled(provider_id: int) -> bool:
    """切换启用状态"""
    with get_db_session() as session:
        provider = session.query(LLMProvider).get(provider_id)
        if provider:
            provider.enabled = not provider.enabled
            return True
        return False


# ================= 初始化：从 JSON 导入 =================

def import_from_json(json_path: str = "llm_config.json") -> int:
    """从 JSON 文件导入配置（仅在数据库为空时执行）"""
    with get_db_session() as session:
        # 检查是否已有配置
        if session.query(LLMProvider).count() > 0:
            return 0
    
    if not os.path.exists(json_path):
        return 0
    
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            config = json.load(f)
    except Exception:
        return 0
    
    count = 0
    for pool_type, pool_name in [("metadata", "metadata_pool"), ("analysis", "analysis_pool")]:
        entries = config.get(pool_name, [])
        for i, entry in enumerate(entries):
            # 支持 model 和 models 两种字段名
            models = entry.get("model", entry.get("models", ""))
            add_provider(
                name=f"{pool_type.capitalize()} Provider {i+1}",
                base_url=entry.get("base_url", ""),
                api_key=entry.get("api_key", ""),
                pool_type=pool_type,
                models=models,
                is_primary=(i == 0),  # 第一个设为主模型
                weight=entry.get("weight", 10),  # 使用权重
                api_type=entry.get("api_type", "openai"),  # 读取 api_type，默认 openai
            )
            count += 1
    
    return count

