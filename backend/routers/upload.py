"""
上传路由 - PDF 文件上传和处理
"""
import os
import asyncio
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db_models import Paper, User
from utils import calculate_md5
from file_service import file_service

from deps import get_db, get_current_user

router = APIRouter(prefix="/api/upload", tags=["上传"])


@router.post("")
async def upload_papers(
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    上传 PDF 文件并处理
    注意：这是一个同步处理端点，会等待所有文件处理完成
    """
    # 导入处理函数 - 从根目录的 main.py 导入
    import importlib.util
    root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    spec = importlib.util.spec_from_file_location("paper_main", os.path.join(root_dir, "main.py"))
    paper_main = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(paper_main)
    process_workflow = paper_main.process_workflow
    
    results = []
    
    for file in files:
        if not file.filename.lower().endswith('.pdf'):
            results.append({
                "filename": file.filename,
                "success": False,
                "message": "不是 PDF 文件"
            })
            continue
        
        try:
            # 读取文件内容
            content = await file.read()
            md5 = calculate_md5(content)
            
            # 检查当前用户是否已有此 MD5 的文件（用户范围去重）
            existing = db.query(Paper.id).filter(
                Paper.md5_hash == md5,
                Paper.owner_id == current_user.id
            ).first()
            if existing:
                results.append({
                    "filename": file.filename,
                    "success": False,
                    "message": "文件已存在"
                })
                continue
            
            # 保存文件到用户目录（持久化存储）
            file_info = file_service.save_file(
                content=content,
                user_id=current_user.id,
                md5_hash=md5,
                original_filename=file.filename
            )
            
            # 保存临时文件用于 LLM 处理
            temp_path = file_service.get_temp_path(file.filename)
            with open(temp_path, "wb") as f:
                f.write(content)
            
            try:
                # 处理文件（LLM 分析）
                await process_workflow(
                    temp_path, md5, current_user.id,
                    file_info=file_info  # 传递文件信息
                )
                results.append({
                    "filename": file.filename,
                    "success": True,
                    "message": "处理成功"
                })
            except FileExistsError as e:
                # 语义重复，删除已保存的文件
                file_service.delete_file(current_user.id, md5)
                results.append({
                    "filename": file.filename,
                    "success": False,
                    "message": str(e)
                })
            except Exception as e:
                # 处理失败，删除已保存的文件
                file_service.delete_file(current_user.id, md5)
                results.append({
                    "filename": file.filename,
                    "success": False,
                    "message": f"处理失败: {str(e)[:100]}"
                })
            finally:
                # 删除临时文件
                file_service.cleanup_temp(file.filename)
                    
        except Exception as e:
            results.append({
                "filename": file.filename,
                "success": False,
                "message": f"上传失败: {str(e)[:100]}"
            })
    
    success_count = sum(1 for r in results if r["success"])
    return {
        "message": f"处理完成: {success_count}/{len(files)} 成功",
        "results": results
    }
