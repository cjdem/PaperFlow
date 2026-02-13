"""
通用工具函数模块
"""
import hashlib


def calculate_md5(file_bytes: bytes) -> str:
    """计算文件的MD5哈希值"""
    return hashlib.md5(file_bytes).hexdigest()


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
