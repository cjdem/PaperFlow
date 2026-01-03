"""
数据库迁移脚本：为 translation_llm_providers 表添加性能优化相关列

运行方式：
cd paper_workflow
python migrate_add_translation_columns.py
"""

import sqlite3
import os
from dotenv import load_dotenv

load_dotenv()

def get_db_path():
    """获取数据库路径"""
    db_url = os.getenv("DB_URL", "sqlite:///papers.db")
    if db_url.startswith("sqlite:///"):
        return db_url.replace("sqlite:///", "")
    return "papers.db"

def migrate():
    """执行迁移"""
    db_path = get_db_path()
    print(f"数据库路径: {db_path}")
    
    if not os.path.exists(db_path):
        print(f"数据库文件不存在: {db_path}")
        print("请先运行应用程序创建数据库")
        return
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # 检查表是否存在
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='translation_llm_providers'")
    if not cursor.fetchone():
        print("表 translation_llm_providers 不存在，跳过迁移")
        conn.close()
        return
    
    # 获取现有列
    cursor.execute("PRAGMA table_info(translation_llm_providers)")
    existing_columns = {row[1] for row in cursor.fetchall()}
    print(f"现有列: {existing_columns}")
    
    # 需要添加的列
    columns_to_add = [
        ("pool_max_workers", "INTEGER", None),
        ("no_auto_extract_glossary", "BOOLEAN", "0"),
        ("disable_rich_text_translate", "BOOLEAN", "0"),
    ]
    
    for column_name, column_type, default_value in columns_to_add:
        if column_name not in existing_columns:
            if default_value is not None:
                sql = f"ALTER TABLE translation_llm_providers ADD COLUMN {column_name} {column_type} DEFAULT {default_value}"
            else:
                sql = f"ALTER TABLE translation_llm_providers ADD COLUMN {column_name} {column_type}"
            
            print(f"添加列: {column_name}")
            try:
                cursor.execute(sql)
                print(f"  ✅ 成功添加列 {column_name}")
            except sqlite3.OperationalError as e:
                print(f"  ❌ 添加列 {column_name} 失败: {e}")
        else:
            print(f"  ⏭️ 列 {column_name} 已存在，跳过")
    
    conn.commit()
    conn.close()
    print("\n迁移完成！")

if __name__ == "__main__":
    migrate()
