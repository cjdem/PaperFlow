"""
兼容层：保留根目录 main.py 导出，实际实现迁移到 backend.services.paper_pipeline。
"""

from backend.services.paper_pipeline import (
    _get_analysis_prompts,
    _validate_analysis,
    extract_pdf_content,
    normalize_title,
    process_workflow,
    reanalyze_paper,
    sanitize_text_for_llm,
    task_analyze_paper,
    task_extract_metadata,
)

__all__ = [
    "normalize_title",
    "sanitize_text_for_llm",
    "extract_pdf_content",
    "task_extract_metadata",
    "task_analyze_paper",
    "process_workflow",
    "reanalyze_paper",
    "_get_analysis_prompts",
    "_validate_analysis",
]
