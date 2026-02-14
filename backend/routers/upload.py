"""
上传路由 - PDF 文件上传和处理
"""
from fastapi import APIRouter, Depends, UploadFile, File
from sqlalchemy.orm import Session
from typing import List

from backend.core.db_models import Paper, User
from backend.core.utils import calculate_md5
from backend.core.file_service import file_service
from backend.core.audit_service import log_audit_event
from backend.core.storage_service import get_user_quota_bytes

from backend.deps import get_db, get_current_user

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
    # 延迟导入处理函数，避免启动阶段额外开销
    from backend.services.paper_pipeline import process_workflow
    
    results = []
    current_usage = file_service.get_user_storage_stats(current_user.id)["total_size"]
    quota_bytes = get_user_quota_bytes(db, current_user)
    
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
            file_size = len(content)

            if quota_bytes is not None and current_usage + file_size > quota_bytes:
                results.append({
                    "filename": file.filename,
                    "success": False,
                    "message": "超出存储配额"
                })
                continue
            
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
            current_usage += file_size
            
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
                log_audit_event(
                    action="upload_paper",
                    resource_type="paper",
                    resource_id=md5,
                    user_id=current_user.id,
                    details={"filename": file.filename, "file_size": file_size}
                )
            except FileExistsError as e:
                # 语义重复，删除已保存的文件
                file_service.delete_file(current_user.id, md5)
                current_usage = max(0, current_usage - file_size)
                results.append({
                    "filename": file.filename,
                    "success": False,
                    "message": str(e)
                })
            except Exception as e:
                # 处理失败：保留已上传文件，并写入占位记录，便于后续在列表中重新分析
                safe_error = (str(e) or "未知错误").replace("\r", " ").replace("\n", " ").strip()
                if len(safe_error) > 300:
                    safe_error = safe_error[:300] + "..."

                try:
                    existing_paper = db.query(Paper.id).filter(
                        Paper.md5_hash == md5,
                        Paper.owner_id == current_user.id
                    ).first()

                    if not existing_paper:
                        paper = Paper(
                            md5_hash=md5,
                            title=file.filename,
                            detailed_analysis=f"分析失败：{safe_error}",
                            owner_id=current_user.id,
                            # 文件存储信息
                            file_path=file_info.get('file_path') if file_info else None,
                            file_size=file_info.get('file_size') if file_info else None,
                            original_filename=file_info.get('original_filename') if file_info else file.filename,
                            uploaded_at=file_info.get('uploaded_at') if file_info else None
                        )
                        db.add(paper)
                        db.commit()

                    log_audit_event(
                        action="upload_paper",
                        resource_type="paper",
                        resource_id=md5,
                        user_id=current_user.id,
                        details={
                            "filename": file.filename,
                            "file_size": file_size,
                            "analysis_failed": True,
                            "error": safe_error[:120],
                        }
                    )

                    results.append({
                        "filename": file.filename,
                        "success": True,
                        "message": f"上传成功，但分析失败（可在列表中点击重新分析）：{safe_error[:120]}"
                    })
                except Exception as db_error:
                    db.rollback()
                    # 连占位记录都写不进去时，为避免产生无法管理的孤儿文件，回滚并删除物理文件
                    file_service.delete_file(current_user.id, md5)
                    current_usage = max(0, current_usage - file_size)
                    results.append({
                        "filename": file.filename,
                        "success": False,
                        "message": f"处理失败: {str(db_error)[:100]}"
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

