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
    temp_dir = os.path.join(root_dir, "temp")
    os.makedirs(temp_dir, exist_ok=True)
    
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
            
            # 检查 MD5 是否已存在
            if db.query(Paper.id).filter(Paper.md5_hash == md5).first():
                results.append({
                    "filename": file.filename,
                    "success": False,
                    "message": "文件已存在"
                })
                continue
            
            # 保存临时文件
            temp_path = os.path.join(temp_dir, file.filename)
            with open(temp_path, "wb") as f:
                f.write(content)
            
            try:
                # 处理文件
                await process_workflow(temp_path, md5, current_user.id)
                results.append({
                    "filename": file.filename,
                    "success": True,
                    "message": "处理成功"
                })
            except FileExistsError as e:
                results.append({
                    "filename": file.filename,
                    "success": False,
                    "message": str(e)
                })
            except Exception as e:
                results.append({
                    "filename": file.filename,
                    "success": False,
                    "message": f"处理失败: {str(e)[:100]}"
                })
            finally:
                # 删除临时文件
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                    
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
