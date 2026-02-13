"""
翻译队列管理模块
管理翻译任务的队列、调度和执行
"""

import asyncio
from typing import Optional, Dict, List, Any
from datetime import datetime

from log_service import get_logger
from db_models import Session, Paper, TranslationQueue, TranslationLLMProvider, TranslationLog
from settings import settings

logger = get_logger("translation_queue")


class TranslationQueueManager:
    """翻译队列管理器"""
    
    def __init__(self):
        self._is_running = False
        self._current_task_id = None
        self._load_config()
    
    def _load_config(self):
        """加载配置"""
        self.max_concurrent = settings.translation_max_concurrent
        self.retry_max = settings.translation_retry_max
        self.retry_delay = settings.translation_retry_delay
        self.retry_backoff = settings.translation_retry_backoff
        self.task_timeout = settings.translation_task_timeout
    
    @property
    def is_running(self) -> bool:
        """检查工作线程是否运行中"""
        return self._is_running
    
    def _log_to_db(
        self, 
        level: str, 
        message: str, 
        task_id: Optional[int] = None, 
        paper_id: Optional[int] = None,
        details: Optional[Dict] = None
    ):
        """记录日志到数据库"""
        session = Session()
        try:
            log_entry = TranslationLog(
                task_id=task_id,
                paper_id=paper_id,
                level=level,
                message=message,
                details=details,
                created_at=datetime.now().isoformat()
            )
            session.add(log_entry)
            session.commit()
        except Exception as e:
            logger.error(f"写入翻译日志失败: {e}")
        finally:
            session.close()

    def _cleanup_previous_translation_outputs(self, paper: Paper) -> Dict[str, Any]:
        """
        清理论文历史翻译产物，避免重新翻译后仍下载到旧文件。
        """
        from file_service import file_service

        removed = {"mono": False, "dual": False}

        if paper.translated_file_path:
            safe_mono_path = file_service.get_user_scoped_absolute_path(
                paper.owner_id, paper.translated_file_path
            )
            if safe_mono_path:
                removed["mono"] = file_service.delete_file_by_absolute_path(safe_mono_path)
            else:
                logger.warning(
                    f"历史中文翻译路径不安全或不存在，跳过删除: paper_id={paper.id}, path={paper.translated_file_path}"
                )

        if paper.translated_dual_path:
            safe_dual_path = file_service.get_user_scoped_absolute_path(
                paper.owner_id, paper.translated_dual_path
            )
            if safe_dual_path:
                removed["dual"] = file_service.delete_file_by_absolute_path(safe_dual_path)
            else:
                logger.warning(
                    f"历史双语翻译路径不安全或不存在，跳过删除: paper_id={paper.id}, path={paper.translated_dual_path}"
                )

        # 无论文件是否存在，都清理数据库引用，避免前端拿到旧下载链接
        paper.translated_file_path = None
        paper.translated_dual_path = None
        paper.translated_at = None

        return removed
    
    def add_to_queue(
        self,
        paper_id: int,
        user_id: int,
        provider_id: Optional[int] = None,
        priority: int = 100
    ) -> TranslationQueue:
        """
        添加翻译任务到队列
        
        Args:
            paper_id: 论文 ID
            user_id: 用户 ID
            provider_id: 翻译提供商 ID（可选）
            priority: 任务优先级
            
        Returns:
            创建的 TranslationQueue 对象
            
        Raises:
            ValueError: 如果论文不存在或已在队列中
        """
        session = Session()
        try:
            # 检查论文是否存在
            paper = session.query(Paper).filter(Paper.id == paper_id).first()
            if not paper:
                raise ValueError("论文不存在")
            
            # 检查是否已在队列中（pending 或 processing 状态）
            existing = session.query(TranslationQueue).filter(
                TranslationQueue.paper_id == paper_id,
                TranslationQueue.status.in_(["pending", "processing"])
            ).first()
            
            if existing:
                raise ValueError("论文已在翻译队列中")
            
            # 创建任务
            task = TranslationQueue(
                paper_id=paper_id,
                user_id=user_id,
                provider_id=provider_id,
                status="pending",
                progress=0,
                priority=priority,
                created_at=datetime.now().isoformat()
            )
            session.add(task)

            cleanup_result = self._cleanup_previous_translation_outputs(paper)
            
            # 更新论文状态
            paper.translation_status = "pending"
            paper.translation_progress = 0
            paper.translation_error = None
            
            session.commit()
            
            self._log_to_db(
                "INFO",
                f"添加翻译任务: paper_id={paper_id}",
                task_id=task.id,
                paper_id=paper_id,
                details={
                    "cleanup_previous_translation_outputs": cleanup_result
                }
            )
            logger.info(f"添加翻译任务: task_id={task.id}, paper_id={paper_id}")
            
            # 分离对象
            session.expunge(task)
            return task
            
        finally:
            session.close()
    
    def batch_add_to_queue(
        self,
        paper_ids: List[int],
        user_id: int,
        provider_id: Optional[int] = None,
        priority: int = 100
    ) -> Dict[str, Any]:
        """
        批量添加翻译任务
        
        Args:
            paper_ids: 论文 ID 列表
            user_id: 用户 ID
            provider_id: 翻译提供商 ID
            priority: 任务优先级
            
        Returns:
            包含 added 和 skipped 数量的字典
        """
        added = 0
        skipped = 0
        errors = []
        
        for paper_id in paper_ids:
            try:
                self.add_to_queue(paper_id, user_id, provider_id, priority)
                added += 1
            except ValueError as e:
                skipped += 1
                errors.append({"paper_id": paper_id, "error": str(e)})
        
        return {
            "added": added,
            "skipped": skipped,
            "errors": errors
        }
    
    def cancel_task(self, task_id: int) -> bool:
        """
        取消翻译任务
        
        Args:
            task_id: 任务 ID
            
        Returns:
            是否成功取消
        """
        session = Session()
        try:
            task = session.query(TranslationQueue).filter(
                TranslationQueue.id == task_id
            ).first()
            
            if not task:
                return False
            
            if task.status not in ["pending"]:
                return False
            
            # 更新任务状态
            task.status = "cancelled"
            
            # 更新论文状态
            paper = session.query(Paper).filter(Paper.id == task.paper_id).first()
            if paper:
                paper.translation_status = None
                paper.translation_progress = 0
            
            session.commit()
            
            self._log_to_db(
                "INFO",
                f"取消翻译任务: task_id={task_id}",
                task_id=task_id,
                paper_id=task.paper_id
            )
            logger.info(f"取消翻译任务: task_id={task_id}")
            
            return True
            
        finally:
            session.close()

    def recover_incomplete_tasks_on_startup(self) -> Dict[str, int]:
        """
        启动时恢复异常中断的任务。

        仅处理遗留 processing 任务：
        - 未超过重试上限：重置为 pending，等待自动继续
        - 超过重试上限：标记 failed，避免无限循环
        """
        session = Session()
        recovered = 0
        marked_failed = 0
        orphaned_processing_papers = 0
        try:
            stuck_tasks = session.query(TranslationQueue).filter(
                TranslationQueue.status == "processing"
            ).all()

            for task in stuck_tasks:
                paper = session.query(Paper).filter(Paper.id == task.paper_id).first()
                if task.retry_count < self.retry_max:
                    task.retry_count += 1
                    task.status = "pending"
                    task.started_at = None
                    task.completed_at = None
                    task.current_stage = "recovered_after_restart"
                    task.error_message = f"服务重启后自动恢复，重试 {task.retry_count}/{self.retry_max}"
                    if paper:
                        paper.translation_status = "pending"
                        paper.translation_progress = task.progress or 0
                        paper.translation_error = None
                    recovered += 1
                else:
                    task.status = "failed"
                    task.completed_at = datetime.now().isoformat()
                    task.error_message = "服务重启后恢复失败：超过最大重试次数"
                    if paper:
                        paper.translation_status = "failed"
                        paper.translation_error = task.error_message
                    marked_failed += 1

            # 兜底修正：Paper 显示 processing 但队列没有活动任务时，置为 failed 便于用户重试
            papers_processing = session.query(Paper).filter(
                Paper.translation_status == "processing"
            ).all()
            for paper in papers_processing:
                active_task = session.query(TranslationQueue).filter(
                    TranslationQueue.paper_id == paper.id,
                    TranslationQueue.status.in_(["pending", "processing"])
                ).first()
                if not active_task:
                    paper.translation_status = "failed"
                    if not paper.translation_error:
                        paper.translation_error = "检测到翻译任务中断，请重试"
                    orphaned_processing_papers += 1

            session.commit()

            if recovered or marked_failed or orphaned_processing_papers:
                summary = (
                    f"翻译任务恢复完成: recovered={recovered}, "
                    f"failed={marked_failed}, orphaned_papers={orphaned_processing_papers}"
                )
                self._log_to_db("INFO", summary)
                logger.info(summary)

            return {
                "recovered": recovered,
                "failed": marked_failed,
                "orphaned_papers": orphaned_processing_papers,
            }
        finally:
            session.close()

    def retry_task(self, task_id: int, force: bool = False) -> Dict[str, Any]:
        """
        手动重试任务。

        支持重试 failed/cancelled 任务；processing 任务需 force=true 且不能是当前正在执行的任务。
        """
        session = Session()
        try:
            task = session.query(TranslationQueue).filter(
                TranslationQueue.id == task_id
            ).first()
            if not task:
                return {"success": False, "status_code": 404, "message": "任务不存在"}

            original_status = task.status or ""
            if original_status == "pending":
                return {"success": False, "status_code": 400, "message": "任务已在队列中，无需重试"}

            if original_status == "processing":
                if not force:
                    return {
                        "success": False,
                        "status_code": 400,
                        "message": "任务正在处理中，如需重试请使用 force=true"
                    }
                if self._is_running and self._current_task_id == task_id:
                    return {
                        "success": False,
                        "status_code": 400,
                        "message": "任务正在执行中，暂不支持强制重试当前任务"
                    }

            if original_status not in ["failed", "cancelled", "processing"]:
                return {
                    "success": False,
                    "status_code": 400,
                    "message": f"当前状态不支持重试: {original_status}"
                }

            duplicated_active = session.query(TranslationQueue).filter(
                TranslationQueue.paper_id == task.paper_id,
                TranslationQueue.id != task.id,
                TranslationQueue.status.in_(["pending", "processing"])
            ).first()
            if duplicated_active:
                return {
                    "success": False,
                    "status_code": 400,
                    "message": "该论文已有运行中的翻译任务，无法重试"
                }

            task.status = "pending"
            task.progress = 0
            task.current_stage = None
            task.current_part = 0
            task.total_parts = 1
            task.error_message = None
            task.retry_count = 0
            task.started_at = None
            task.completed_at = None

            paper = session.query(Paper).filter(Paper.id == task.paper_id).first()
            if paper:
                cleanup_result = self._cleanup_previous_translation_outputs(paper)
                paper.translation_status = "pending"
                paper.translation_progress = 0
                paper.translation_error = None
            else:
                cleanup_result = {"mono": False, "dual": False}

            session.commit()

            action = "强制重试" if force and original_status == "processing" else "手动重试"
            self._log_to_db(
                "INFO",
                f"{action}翻译任务: task_id={task.id}, from={original_status}",
                task_id=task.id,
                paper_id=task.paper_id,
                details={
                    "cleanup_previous_translation_outputs": cleanup_result
                }
            )
            logger.info(f"{action}翻译任务: task_id={task.id}, from={original_status}")

            return {
                "success": True,
                "status_code": 200,
                "message": "任务已重新加入队列",
                "task_id": task.id,
                "paper_id": task.paper_id,
            }
        finally:
            session.close()
    
    def get_queue_stats(self) -> Dict[str, Any]:
        """
        获取队列统计信息
        
        Returns:
            包含各状态任务数量的字典
        """
        session = Session()
        try:
            pending = session.query(TranslationQueue).filter(
                TranslationQueue.status == "pending"
            ).count()
            
            processing = session.query(TranslationQueue).filter(
                TranslationQueue.status == "processing"
            ).count()
            
            completed = session.query(TranslationQueue).filter(
                TranslationQueue.status == "completed"
            ).count()
            
            failed = session.query(TranslationQueue).filter(
                TranslationQueue.status == "failed"
            ).count()
            
            # 统计未翻译的论文数量
            untranslated = session.query(Paper).filter(
                Paper.translation_status.is_(None) | 
                (Paper.translation_status == "") |
                (Paper.translation_status == "failed")
            ).filter(
                Paper.file_path.isnot(None)  # 只统计有 PDF 文件的论文
            ).count()
            
            return {
                "pending": pending,
                "processing": processing,
                "completed": completed,
                "failed": failed,
                "untranslated_papers": untranslated,
                "is_running": self._is_running
            }
            
        finally:
            session.close()
    
    def get_tasks(
        self,
        status: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        获取任务列表
        
        Args:
            status: 筛选状态
            limit: 返回数量限制
            
        Returns:
            任务列表
        """
        session = Session()
        try:
            query = session.query(TranslationQueue).order_by(
                TranslationQueue.created_at.desc()
            )
            
            if status:
                query = query.filter(TranslationQueue.status == status)
            
            tasks = query.limit(limit).all()
            
            result = []
            for task in tasks:
                paper = session.query(Paper).filter(Paper.id == task.paper_id).first()
                result.append({
                    "id": task.id,
                    "paper_id": task.paper_id,
                    "paper_title": paper.title if paper else None,
                    "user_id": task.user_id,
                    "status": task.status,
                    "progress": task.progress,
                    "current_stage": task.current_stage,
                    "error_message": task.error_message,
                    "retry_count": task.retry_count,
                    "created_at": task.created_at,
                    "started_at": task.started_at,
                    "completed_at": task.completed_at
                })
            
            return result
            
        finally:
            session.close()
    
    async def start_worker(self):
        """启动翻译工作线程"""
        if self._is_running:
            logger.warning("翻译工作线程已在运行")
            return
        
        self._is_running = True
        self._log_to_db("INFO", "翻译工作线程已启动")
        logger.info("翻译工作线程已启动")
        
        while self._is_running:
            try:
                await self._process_next_task()
            except Exception as e:
                logger.error(f"处理翻译任务时出错: {e}")
                self._log_to_db("ERROR", f"处理翻译任务时出错: {e}")
            
            # 每秒检查一次队列
            await asyncio.sleep(1)
        
        self._log_to_db("INFO", "翻译工作线程已停止")
        logger.info("翻译工作线程已停止")
    
    def stop_worker(self):
        """停止翻译工作线程"""
        self._is_running = False
        logger.info("正在停止翻译工作线程...")
    
    async def _process_next_task(self):
        """处理下一个翻译任务"""
        session = Session()
        try:
            # 获取下一个待处理任务
            task = session.query(TranslationQueue).filter(
                TranslationQueue.status == "pending"
            ).order_by(
                TranslationQueue.priority,
                TranslationQueue.created_at
            ).first()
            
            if not task:
                return
            
            # 更新任务状态
            task.status = "processing"
            task.started_at = datetime.now().isoformat()
            self._current_task_id = task.id
            
            # 更新论文状态
            paper = session.query(Paper).filter(Paper.id == task.paper_id).first()
            if paper:
                paper.translation_status = "processing"
            
            session.commit()
            
            self._log_to_db(
                "INFO",
                f"开始处理翻译任务: task_id={task.id}",
                task_id=task.id,
                paper_id=task.paper_id
            )
            logger.info(f"开始处理翻译任务: task_id={task.id}, paper_id={task.paper_id}")
            
            # 执行翻译
            from translation_service import translation_service
            
            try:
                async for event in translation_service.translate_pdf(
                    paper_id=task.paper_id,
                    provider_id=task.provider_id,
                    task_id=task.id
                ):
                    event_type = event.get("type")
                    
                    # 重新获取 session 和 task（避免 session 过期）
                    session = Session()
                    task = session.query(TranslationQueue).filter(
                        TranslationQueue.id == self._current_task_id
                    ).first()
                    
                    if not task:
                        session.close()
                        break
                    
                    if event_type == "progress":
                        task.progress = event.get("overall_progress", 0)
                        task.current_stage = event.get("stage", "")
                        task.current_part = event.get("part_index", 0)
                        task.total_parts = event.get("total_parts", 1)
                        session.commit()
                    
                    elif event_type == "finish":
                        task.status = "completed"
                        task.progress = 100
                        task.completed_at = datetime.now().isoformat()
                        session.commit()
                        
                        self._log_to_db(
                            "INFO",
                            f"翻译任务完成: task_id={task.id}",
                            task_id=task.id,
                            paper_id=task.paper_id
                        )
                        logger.info(f"翻译任务完成: task_id={task.id}")
                    
                    elif event_type == "error":
                        error_msg = event.get("error", "翻译失败")
                        
                        # 检查是否需要重试
                        if task.retry_count < self.retry_max:
                            task.retry_count += 1
                            task.status = "pending"
                            task.error_message = f"重试 {task.retry_count}/{self.retry_max}: {error_msg}"
                            
                            self._log_to_db(
                                "WARNING",
                                f"翻译失败，准备重试: {error_msg}",
                                task_id=task.id,
                                paper_id=task.paper_id,
                                details={"retry_count": task.retry_count, "error": error_msg}
                            )
                            logger.warning(f"翻译任务失败，准备重试: task_id={task.id}, retry={task.retry_count}, error={error_msg}")
                            
                            # 计算重试延迟
                            delay = self.retry_delay * (self.retry_backoff ** (task.retry_count - 1))
                            await asyncio.sleep(delay)
                        else:
                            task.status = "failed"
                            task.error_message = error_msg
                            
                            # 更新论文状态
                            paper = session.query(Paper).filter(Paper.id == task.paper_id).first()
                            if paper:
                                paper.translation_status = "failed"
                                paper.translation_error = error_msg
                            
                            self._log_to_db(
                                "ERROR",
                                f"翻译任务最终失败: {error_msg}",
                                task_id=task.id,
                                paper_id=task.paper_id
                            )
                            logger.error(f"翻译任务最终失败: task_id={task.id}, error={error_msg}")
                        
                        session.commit()
                    
                    session.close()
            
            except Exception as e:
                error_msg = str(e)
                session = Session()
                task = session.query(TranslationQueue).filter(
                    TranslationQueue.id == self._current_task_id
                ).first()
                
                if task:
                    task.status = "failed"
                    task.error_message = error_msg
                    
                    paper = session.query(Paper).filter(Paper.id == task.paper_id).first()
                    if paper:
                        paper.translation_status = "failed"
                        paper.translation_error = error_msg
                    
                    session.commit()
                
                self._log_to_db(
                    "ERROR",
                    f"翻译任务异常: {error_msg}",
                    task_id=self._current_task_id
                )
                logger.error(f"翻译任务异常: task_id={self._current_task_id}, error={error_msg}")
                session.close()
            
            finally:
                self._current_task_id = None
        
        except Exception as e:
            logger.error(f"处理任务时出错: {e}")
        finally:
            try:
                session.close()
            except:
                pass


# 全局翻译队列管理器实例
translation_queue_manager = TranslationQueueManager()
