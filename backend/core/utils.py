"""
通用工具函数模块
"""
import hashlib
import re

_INVALID_FILENAME_CHARS_RE = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def calculate_md5(file_bytes: bytes) -> str:
    """计算文件的MD5哈希值"""
    return hashlib.md5(file_bytes).hexdigest()


def make_password_hash(password: str) -> str:
    """统一的密码哈希函数"""
    return hashlib.sha256(password.encode()).hexdigest()


def sanitize_filename(filename: str, fallback: str = "paper", max_length: int = 200) -> str:
    """清理文件名，移除不安全字符并保证可用"""
    cleaned = _INVALID_FILENAME_CHARS_RE.sub("", filename or "")
    cleaned = cleaned.strip(" .")
    if max_length > 0:
        cleaned = cleaned[:max_length]
    return cleaned or fallback


def clean_markdown_math(text: str) -> str:
    """清理Markdown中的数学公式格式"""
    if not text:
        return ""
    replacements = {
        r"\\\\[": "$$", r"\\\\]": "$$",
        r"\\[": "$$", r"\\]": "$$",
        r"\\\\(": "$", r"\\\\)": "$",
        r"\\(": "$", r"\\)": "$",
        r"\\_": "_"
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    return text


