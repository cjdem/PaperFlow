"""
PaperFlow Pro - FastAPI 后端入口
"""
import asyncio
import os
import sys
import logging

# 添加父目录到路径，以便导入共享模块
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from backend.routers import auth, papers, groups, upload, admin, upload_stream, export, workspaces, translate

# ================= 应用配置 =================
app = FastAPI(
    title="PaperFlow Pro API",
    description="论文管理系统 API",
    version="2.0.0"
)
logger = logging.getLogger("backend")

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


# ================= 统一异常处理 =================
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "code": "http_error"}
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("未处理的异常", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "服务器内部错误", "code": "internal_error"}
    )


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
    from backend.core.llm_service import import_from_json
    count = import_from_json()
    if count > 0:
        print(f"从 llm_config.json 导入了 {count} 个 LLM 提供商")

    # 恢复中断的翻译任务并自动启动翻译 worker
    from backend.core.translation_queue import translation_queue_manager
    recovery = translation_queue_manager.recover_incomplete_tasks_on_startup()
    logger.info(
        "翻译任务恢复结果: recovered=%s, failed=%s, orphaned_papers=%s",
        recovery.get("recovered", 0),
        recovery.get("failed", 0),
        recovery.get("orphaned_papers", 0),
    )
    if not translation_queue_manager.is_running:
        asyncio.create_task(translation_queue_manager.start_worker())

