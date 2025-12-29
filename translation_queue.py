"""
翻译队列管理模块
管理翻译任务的队列、调度和执行
"""

import os
import asyncio
from typing import Optional, Dict, List, Any
from datetime import datetime

from log_service import get_logger
from db_models import Session, Paper, TranslationQueue, TranslationLLMProvider, TranslationLog

logger = get_logger("translation_queue")


class TranslationQueueManager:
    """翻译队列管理器"""
    
    def __init__(self):
        self._is_running = False
        self._current_task_id = None
        self._load_config()
    
    def _load_config(self):
        """加载配置"""
        from dotenv import load_dotenv
        load_dotenv()
        
        self.max_concurrent = int(os.getenv("TRANSLATION_MAX_CONCURRENT", "2"))
        self.retry_max = int(os.getenv("TRANSLATION_RETRY_MAX", "3"))
        self.retry_delay = int(os.getenv("TRANSLATION_RETRY_DELAY", "60"))
        self.retry_backoff = float(os.getenv("TRANSLATION_RETRY_BACKOFF", "2.0"))
        self.task_timeout = int(os.getenv("TRANSLATION_TASK_TIMEOUT", "30"))
    
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
            
            # 更新论文状态
            paper.translation_status = "pending"
            paper.translation_progress = 0
            paper.translation_error = None
            
            session.commit()
            
            self._log_to_db(
                "INFO",
                f"添加翻译任务: paper_id={paper_id}",
                task_id=task.id,
                paper_id=paper_id
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