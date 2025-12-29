"""
文件存储服务模块
负责 PDF 文件的持久化存储、读取、删除等操作
"""
import os
import shutil
from datetime import datetime
from typing import Optional
from log_service import get_logger

logger = get_logger("file_service")


class FileService:
    """文件存储服务"""
    
    def __init__(self, base_path: str = None):
        """
        初始化文件服务
        
        Args:
            base_path: 文件存储根路径，默认为 uploads/papers
        """
        if base_path is None:
            # 默认存储在 paper_workflow/uploads/papers
            root_dir = os.path.dirname(os.path.abspath(__file__))
            base_path = os.path.join(root_dir, "uploads", "papers")
        
        self.base_path = base_path
        self.temp_path = os.path.join(os.path.dirname(base_path), "temp")
        
        # 确保目录存在
        os.makedirs(self.base_path, exist_ok=True)
        os.makedirs(self.temp_path, exist_ok=True)
        
        logger.info(f"文件服务初始化完成，存储路径: {self.base_path}")
    
    def _get_user_dir(self, user_id: int) -> str:
        """获取用户文件目录路径"""
        user_dir = os.path.join(self.base_path, f"user_{user_id}")
        os.makedirs(user_dir, exist_ok=True)
        return user_dir
    
    def _get_file_path(self, user_id: int, md5_hash: str) -> str:
        """获取文件完整路径"""
        user_dir = self._get_user_dir(user_id)
        return os.path.join(user_dir, f"{md5_hash}.pdf")
    
    def save_file(self, content: bytes, user_id: int, md5_hash: str, 
                  original_filename: str) -> dict:
        """
        保存文件到用户目录
        
        Args:
            content: 文件内容（字节）
            user_id: 用户 ID
            md5_hash: 文件 MD5 哈希值
            original_filename: 原始文件名
        
        Returns:
            dict: 文件信息，包含 file_path, file_size, original_filename, uploaded_at
        """
        file_path = self._get_file_path(user_id, md5_hash)
        
        # 写入文件
        with open(file_path, "wb") as f:
            f.write(content)
        
        file_size = len(content)
        uploaded_at = datetime.now().isoformat()
        
        # 返回相对路径（相对于 base_path）
        relative_path = os.path.relpath(file_path, self.base_path)
        
        logger.info(f"文件保存成功: user_{user_id}/{md5_hash}.pdf, 大小: {file_size} 字节")
        
        return {
            "file_path": relative_path,
            "file_size": file_size,
            "original_filename": original_filename,
            "uploaded_at": uploaded_at
        }
    
    def get_file_path(self, user_id: int, md5_hash: str) -> Optional[str]:
        """
        根据用户ID和MD5获取文件完整路径
        
        Args:
            user_id: 用户 ID
            md5_hash: 文件 MD5 哈希值
        
        Returns:
            str | None: 文件完整路径，不存在则返回 None
        """
        file_path = self._get_file_path(user_id, md5_hash)
        if os.path.exists(file_path):
            return file_path
        return None
    
    def get_file_path_by_relative(self, relative_path: str) -> Optional[str]:
        """
        根据相对路径获取文件完整路径
        
        Args:
            relative_path: 相对于 base_path 的路径
        
        Returns:
            str | None: 文件完整路径，不存在则返回 None
        """
        file_path = os.path.join(self.base_path, relative_path)
        if os.path.exists(file_path):
            return file_path
        return None
    
    def delete_file(self, user_id: int, md5_hash: str) -> bool:
        """
        删除用户的文件
        
        Args:
            user_id: 用户 ID
            md5_hash: 文件 MD5 哈希值
        
        Returns:
            bool: 删除是否成功
        """
        file_path = self._get_file_path(user_id, md5_hash)
        
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
                logger.info(f"文件删除成功: user_{user_id}/{md5_hash}.pdf")
                return True
            except Exception as e:
                logger.error(f"文件删除失败: {e}")
                return False
        else:
            logger.warning(f"文件不存在，无需删除: user_{user_id}/{md5_hash}.pdf")
            return True  # 文件不存在也视为删除成功
    
    def delete_file_by_path(self, relative_path: str) -> bool:
        """
        根据相对路径删除文件
        
        Args:
            relative_path: 相对于 base_path 的路径
        
        Returns:
            bool: 删除是否成功
        """
        file_path = os.path.join(self.base_path, relative_path)
        
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
                logger.info(f"文件删除成功: {relative_path}")
                return True
            except Exception as e:
                logger.error(f"文件删除失败: {e}")
                return False
        else:
            logger.warning(f"文件不存在，无需删除: {relative_path}")
            return True
    
    def delete_file_by_absolute_path(self, absolute_path: str) -> bool:
        """
        根据绝对路径删除文件
        
        Args:
            absolute_path: 文件的绝对路径
        
        Returns:
            bool: 删除是否成功
        """
        if not absolute_path:
            return True
        
        if os.path.exists(absolute_path):
            try:
                os.remove(absolute_path)
                logger.info(f"文件删除成功: {absolute_path}")
                return True
            except Exception as e:
                logger.error(f"文件删除失败: {e}")
                return False
        else:
            logger.warning(f"文件不存在，无需删除: {absolute_path}")
            return True
    
    def file_exists(self, user_id: int, md5_hash: str) -> bool:
        """
        检查用户的文件是否存在
        
        Args:
            user_id: 用户 ID
            md5_hash: 文件 MD5 哈希值
        
        Returns:
            bool: 文件是否存在
        """
        file_path = self._get_file_path(user_id, md5_hash)
        return os.path.exists(file_path)
    
    def get_user_storage_stats(self, user_id: int) -> dict:
        """
        获取用户存储统计
        
        Args:
            user_id: 用户 ID
        
        Returns:
            dict: 包含 file_count 和 total_size
        """
        user_dir = os.path.join(self.base_path, f"user_{user_id}")
        
        if not os.path.exists(user_dir):
            return {"file_count": 0, "total_size": 0}
        
        file_count = 0
        total_size = 0
        
        for filename in os.listdir(user_dir):
            if filename.endswith(".pdf"):
                file_path = os.path.join(user_dir, filename)
                file_count += 1
                total_size += os.path.getsize(file_path)
        
        return {
            "file_count": file_count,
            "total_size": total_size
        }
    
    def get_all_storage_stats(self) -> dict:
        """
        获取所有用户存储统计（管理员用）
        
        Returns:
            dict: 包含 total_size, total_files, users 列表
        """
        total_size = 0
        total_files = 0
        users = []
        
        if not os.path.exists(self.base_path):
            return {
                "total_size": 0,
                "total_files": 0,
                "users": []
            }
        
        for dirname in os.listdir(self.base_path):
            if dirname.startswith("user_"):
                try:
                    user_id = int(dirname.replace("user_", ""))
                except ValueError:
                    continue
                
                user_dir = os.path.join(self.base_path, dirname)
                if os.path.isdir(user_dir):
                    stats = self.get_user_storage_stats(user_id)
                    total_size += stats["total_size"]
                    total_files += stats["file_count"]
                    users.append({
                        "user_id": user_id,
                        "file_count": stats["file_count"],
                        "total_size": stats["total_size"]
                    })
        
        return {
            "total_size": total_size,
            "total_files": total_files,
            "users": users
        }
    
    def get_temp_path(self, filename: str) -> str:
        """
        获取临时文件路径
        
        Args:
            filename: 文件名
        
        Returns:
            str: 临时文件完整路径
        """
        return os.path.join(self.temp_path, filename)
    
    def cleanup_temp(self, filename: str) -> bool:
        """
        清理临时文件
        
        Args:
            filename: 文件名
        
        Returns:
            bool: 清理是否成功
        """
        temp_file = os.path.join(self.temp_path, filename)
        if os.path.exists(temp_file):
            try:
                os.remove(temp_file)
                return True
            except Exception as e:
                logger.error(f"临时文件清理失败: {e}")
                return False
        return True


# 全局文件服务实例
file_service = FileService()