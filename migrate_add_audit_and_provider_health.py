"""
新增审计日志表与 LLM/用户新增列的轻量迁移脚本
仅在已有数据库中补充缺失列，不会破坏已有数据
"""
from sqlalchemy import inspect, text

from db_models import engine, AuditLog


def _add_column_if_missing(table: str, column: str, column_type: str):
    inspector = inspect(engine)
    columns = [c["name"] for c in inspector.get_columns(table)]
    if column in columns:
        return
    with engine.begin() as conn:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {column_type}"))


def run():
    # 创建审计日志表（若不存在）
    AuditLog.__table__.create(engine, checkfirst=True)

    # users 表新增 storage_quota_mb
    _add_column_if_missing("users", "storage_quota_mb", "INTEGER")

    # llm_providers 表新增健康字段
    _add_column_if_missing("llm_providers", "last_success_at", "VARCHAR(50)")
    _add_column_if_missing("llm_providers", "last_failure_at", "VARCHAR(50)")
    _add_column_if_missing("llm_providers", "last_error", "TEXT")
    _add_column_if_missing("llm_providers", "avg_latency_ms", "INTEGER")


if __name__ == "__main__":
    run()
