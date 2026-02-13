"""
文件存储服务模块
负责 PDF 文件的持久化存储、读取、删除等操作
"""
import os
import re
import shutil
from datetime import datetime
from typing import Optional
from backend.core.log_service import get_logger
from backend.core.settings import settings

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
            root_dir = os.path.dirname(os.path.abspath(__file__))
            storage_root = settings.file_storage_path
            if not os.path.isabs(storage_root):
                storage_root = os.path.abspath(os.path.join(root_dir, storage_root))
            base_path = os.path.join(storage_root, "papers")

        self.base_path = os.path.abspath(base_path)
        self.temp_path = os.path.join(os.path.dirname(self.base_path), "temp")
        
        # 确保目录存在
        os.makedirs(self.base_path, exist_ok=True)
        os.makedirs(self.temp_path, exist_ok=True)
        
        logger.info(f"文件服务初始化完成，存储路径: {self.base_path}")

    def _is_valid_user_id(self, user_id: int) -> bool:
        """校验用户 ID 是否有效"""
        return isinstance(user_id, int) and user_id > 0

    def _is_valid_md5(self, md5_hash: str) -> bool:
        """校验 MD5 是否有效"""
        return isinstance(md5_hash, str) and re.fullmatch(r"[a-fA-F0-9]{32}", md5_hash) is not None

    def _sanitize_filename(self, filename: str, default: str = "file") -> str:
        """清理文件名，避免路径穿越与非法字符"""
        if not filename or not isinstance(filename, str):
            return default

        filename = os.path.basename(filename)
        filename = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", filename)
        filename = filename.strip(" .")
        if not filename:
            return default

        if len(filename) > 200:
            name, ext = os.path.splitext(filename)
            if ext and len(ext) < 20:
                filename = name[:200 - len(ext)] + ext
            else:
                filename = filename[:200]
        return filename

    def _normalize_relative_path(self, relative_path: str) -> Optional[str]:
        """归一化相对路径，拒绝驱动器标识与路径穿越"""
        if not relative_path or not isinstance(relative_path, str):
            return None
        if os.path.isabs(relative_path):
            return None
        drive, _ = os.path.splitdrive(relative_path)
        if drive:
            return None

        normalized = os.path.normpath(relative_path)
        normalized = normalized.replace("\\", "/")
        if normalized in (".", ""):
            return None
        if normalized == ".." or normalized.startswith("../"):
            return None
        return normalized

    def _is_path_within(self, base_path: str, target_path: str) -> bool:
        """判断目标路径是否在指定根目录内（防止软链接穿越）"""
        if not base_path or not target_path:
            return False
        try:
            base_real = os.path.realpath(base_path)
            target_real = os.path.realpath(target_path)
            return os.path.commonpath([base_real, target_real]) == base_real
        except ValueError:
            return False

    def _safe_join(self, base_path: str, *paths: str) -> Optional[str]:
        """安全拼接路径，确保结果仍在 base_path 内"""
        if not base_path:
            return None
        try:
            base_real = os.path.realpath(base_path)
            joined = os.path.realpath(os.path.join(base_real, *paths))
            if os.path.commonpath([base_real, joined]) != base_real:
                return None
            return joined
        except (TypeError, ValueError):
            return None

    def _get_user_dir_path(self, user_id: int) -> str:
        """获取用户目录路径（不创建）"""
        if not self._is_valid_user_id(user_id):
            raise ValueError("无效的用户 ID")
        return os.path.join(self.base_path, f"user_{user_id}")
    
    def _get_user_dir(self, user_id: int) -> str:
        """获取用户文件目录路径"""
        user_dir = self._get_user_dir_path(user_id)
        os.makedirs(user_dir, exist_ok=True)
        return user_dir
    
    def _get_file_path(self, user_id: int, md5_hash: str) -> str:
        """获取文件完整路径"""
        if not self._is_valid_md5(md5_hash):
            raise ValueError("无效的文件哈希")
        user_dir = self._get_user_dir(user_id)
        return os.path.join(user_dir, f"{md5_hash}.pdf")

    def _is_relative_path_for_user(self, relative_path: str, user_id: int) -> bool:
        """判断相对路径是否属于指定用户目录"""
        normalized = self._normalize_relative_path(relative_path)
        if not normalized:
            return False
        first_segment = normalized.split("/", 1)[0]
        return first_segment == f"user_{user_id}"

    def resolve_paper_file_path(
        self,
        relative_path: Optional[str],
        user_id: Optional[int],
        md5_hash: Optional[str]
    ) -> Optional[str]:
        """
        统一解析论文 PDF 文件路径（相对路径优先）
        """
        if relative_path:
            if user_id is not None:
                if not self._is_valid_user_id(user_id):
                    logger.warning("非法用户 ID，拒绝解析文件路径")
                    return None
                if not self._is_relative_path_for_user(relative_path, user_id):
                    logger.warning("相对路径与用户不匹配，拒绝解析")
                    return None
            return self.get_file_path_by_relative(relative_path)

        if user_id and md5_hash:
            return self.get_file_path(user_id, md5_hash)

        return None

    def get_safe_absolute_path(self, absolute_path: str) -> Optional[str]:
        """获取安全的绝对路径（限制在 base_path 内）"""
        if not absolute_path or not isinstance(absolute_path, str):
            return None
        if not os.path.isabs(absolute_path):
            return None
        if not self._is_path_within(self.base_path, absolute_path):
            return None
        if os.path.isfile(absolute_path):
            return absolute_path
        return None

    def get_user_scoped_absolute_path(self, user_id: Optional[int], absolute_path: str) -> Optional[str]:
        """获取限定在指定用户目录内的绝对路径"""
        safe_path = self.get_safe_absolute_path(absolute_path)
        if not safe_path:
            return None
        if user_id is None or not self._is_valid_user_id(user_id):
            return safe_path
        user_dir = self._get_user_dir_path(user_id)
        if not self._is_path_within(user_dir, safe_path):
            logger.warning("文件路径不在用户目录内，拒绝访问")
            return None
        return safe_path
    
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
        try:
            file_path = self._get_file_path(user_id, md5_hash)
        except ValueError as e:
            logger.warning(f"非法文件参数: {e}")
            return None
        if os.path.isfile(file_path):
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
        normalized = self._normalize_relative_path(relative_path)
        if not normalized:
            logger.warning("相对路径不合法，拒绝访问")
            return None
        file_path = self._safe_join(self.base_path, normalized)
        if not file_path:
            logger.warning("相对路径越界，拒绝访问")
            return None
        if os.path.isfile(file_path):
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
        try:
            file_path = self._get_file_path(user_id, md5_hash)
        except ValueError as e:
            logger.warning(f"非法文件参数: {e}")
            return False
        
        if os.path.isfile(file_path):
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
        normalized = self._normalize_relative_path(relative_path)
        if not normalized:
            logger.warning("相对路径不合法，拒绝删除")
            return False
        file_path = self._safe_join(self.base_path, normalized)
        if not file_path:
            logger.warning("相对路径越界，拒绝删除")
            return False

        if os.path.isfile(file_path):
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
        if not os.path.isabs(absolute_path):
            logger.warning(f"绝对路径不合法，拒绝删除: {absolute_path}")
            return False
        if not self._is_path_within(self.base_path, absolute_path):
            logger.warning(f"绝对路径不安全，拒绝删除: {absolute_path}")
            return False

        safe_path = os.path.realpath(absolute_path)

        if os.path.isfile(safe_path):
            try:
                os.remove(safe_path)
                logger.info(f"文件删除成功: {safe_path}")
                return True
            except Exception as e:
                logger.error(f"文件删除失败: {e}")
                return False
        else:
            logger.warning(f"文件不存在，无需删除: {safe_path}")
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
        try:
            file_path = self._get_file_path(user_id, md5_hash)
        except ValueError:
            return False
        return os.path.isfile(file_path)
    
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
        safe_name = self._sanitize_filename(filename, default="tempfile")
        safe_path = self._safe_join(self.temp_path, safe_name)
        return safe_path or os.path.join(self.temp_path, safe_name)
    
    def cleanup_temp(self, filename: str) -> bool:
        """
        清理临时文件
        
        Args:
            filename: 文件名
        
        Returns:
            bool: 清理是否成功
        """
        temp_file = self.get_temp_path(filename)
        if os.path.isfile(temp_file):
            try:
                os.remove(temp_file)
                return True
            except Exception as e:
                logger.error(f"临时文件清理失败: {e}")
                return False
        return True


# 全局文件服务实例
file_service = FileService()


