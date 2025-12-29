"""
PaperFlow Pro - FastAPI 后端入口
"""
import os
import sys

# 添加父目录到路径，以便导入共享模块
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from backend.routers import auth, papers, groups, upload, admin, upload_stream, export, workspaces, translate

load_dotenv()

# ================= 应用配置 =================
app = FastAPI(
    title="PaperFlow Pro API",
    description="论文管理系统 API",
    version="2.0.0"
)

# ================= CORS 配置 =================
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Next.js 开发服务器
        "http://127.0.0.1:3000",
        "http://localhost:5173",  # Vite 开发服务器
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ================= 注册路由 =================
app.include_router(auth.router)
app.include_router(papers.router)
app.include_router(groups.router)
app.include_router(upload.router)
app.include_router(upload_stream.router)
app.include_router(admin.router)
app.include_router(export.router)
app.include_router(workspaces.router)
app.include_router(translate.router)


# ================= 根路由 =================
@app.get("/")
async def root():
    return {
        "message": "PaperFlow Pro API",
        "version": "2.0.0",
        "docs": "/docs"
    }


@app.get("/health")
async def health():
    return {"status": "ok"}


# ================= 启动时初始化 =================
@app.on_event("startup")
async def startup_event():
    """应用启动时执行"""
    # 从 JSON 导入 LLM 配置（如果数据库为空）
    from llm_service import import_from_json
    count = import_from_json()
    if count > 0:
        print(f"从 llm_config.json 导入了 {count} 个 LLM 提供商")
