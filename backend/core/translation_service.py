"""
翻译服务封装模块
封装 pdf2zh-next 的翻译功能，提供统一的翻译接口
"""

import os
import asyncio
import time
import contextlib
from pathlib import Path
from typing import Optional, AsyncGenerator, Dict, Any
from datetime import datetime

from backend.core.log_service import get_logger, write_translation_log
from backend.core.db_models import Session, Paper, TranslationLLMProvider
from backend.core.settings import settings
from backend.core.llm_format import normalize_translation_request_format

logger = get_logger("translation_service")
_pdf2zh_openai_ua_patched = False


@contextlib.contextmanager
def _patch_deepl_server_url(server_url: Optional[str]):
    """
    临时 patch DeepLTranslator.__init__ 以支持自定义 server_url（DeepLX）。
    pdf2zh-next 的 DeepLSettings/DeepLTranslator 不支持 server_url，
    但底层 deepl.Translator 支持。此 patch 在 __init__ 中注入 server_url。
    """
    if not server_url:
        yield
        return

    from pdf2zh_next.translator.translator_impl.deepl import DeepLTranslator

    _original_init = DeepLTranslator.__init__

    def _patched_init(self_tr, settings_model, rate_limiter):
        _original_init(self_tr, settings_model, rate_limiter)
        import deepl as _deepl
        auth_key = settings_model.translate_engine_settings.deepl_auth_key
        self_tr.client = _deepl.Translator(auth_key, server_url=server_url)

    DeepLTranslator.__init__ = _patched_init
    try:
        yield
    finally:
        DeepLTranslator.__init__ = _original_init


def _ensure_pdf2zh_openai_user_agent():
    """
    兼容部分 OpenAI 兼容网关的 WAF 规则：
    对 pdf2zh-next 内部 OpenAI SDK 注入自定义 User-Agent。
    """
    global _pdf2zh_openai_ua_patched
    if _pdf2zh_openai_ua_patched:
        return

    try:
        from pdf2zh_next.translator.translator_impl import openai as openai_impl  # type: ignore
    except Exception as e:
        logger.debug(f"加载 pdf2zh OpenAI 翻译器模块失败，跳过 UA 补丁: {e}")
        return

    original_openai_cls = openai_impl.openai.OpenAI
    if getattr(original_openai_cls, "_paperflow_ua_patched", False):
        _pdf2zh_openai_ua_patched = True
        return

    class OpenAIWithPaperFlowUA(original_openai_cls):
        def __init__(self, *args, **kwargs):
            headers = dict(kwargs.get("default_headers") or {})
            headers.setdefault("User-Agent", "PaperFlow/1.0")
            kwargs["default_headers"] = headers
            super().__init__(*args, **kwargs)

    OpenAIWithPaperFlowUA._paperflow_ua_patched = True  # type: ignore[attr-defined]
    openai_impl.openai.OpenAI = OpenAIWithPaperFlowUA
    _pdf2zh_openai_ua_patched = True
    logger.info("已应用 pdf2zh OpenAI User-Agent 兼容补丁")


class TranslationService:
    """PDF 翻译服务"""
    
    def __init__(self):
        self._load_config()
    
    def _load_config(self):
        """加载翻译配置"""
        # 翻译参数配置
        self.max_pages_per_part = settings.translation_max_pages_per_part
        self.qps = settings.translation_qps
        self.lang_in = settings.translation_lang_in
        self.lang_out = settings.translation_lang_out
        
        # 重试配置
        self.retry_max = settings.translation_retry_max
        self.retry_delay = settings.translation_retry_delay
        self.retry_backoff = settings.translation_retry_backoff
        self.task_timeout = settings.translation_task_timeout
    
    def _build_settings(self, provider: TranslationLLMProvider, output_dir: str) -> "SettingsModel":
        """
        根据提供商配置构建 pdf2zh-next 的 SettingsModel
        
        Args:
            provider: 翻译 LLM 提供商配置
            output_dir: 输出目录
            
        Returns:
            SettingsModel 配置对象
        """
        from pdf2zh_next.config.model import SettingsModel, TranslationSettings, PDFSettings
        from pdf2zh_next.config.translate_engine_model import (
            OpenAISettings, DeepSeekSettings, OllamaSettings, GeminiSettings,
            GoogleSettings, DeepLSettings, AzureSettings, OpenAICompatibleSettings,
            SiliconFlowSettings, ZhipuSettings, GroqSettings, AliyunDashScopeSettings
        )
        
        # 构建翻译引擎设置
        engine_type = (provider.engine_type or "").lower()
        request_format = normalize_translation_request_format(
            getattr(provider, "request_format", None),
            engine_type=engine_type,
        )
        has_explicit_request_format = bool((getattr(provider, "request_format", None) or "").strip())
        legacy_engine_types = {
            "deepseek", "google", "deepl", "ollama", "azure",
            "siliconflow", "zhipu", "groq", "aliyundashscope", "openaicompatible"
        }
        use_legacy_engine = engine_type in legacy_engine_types
        translate_engine_settings = None

        # 新标准格式优先；若旧数据未配置 request_format，则保持原 engine_type 行为
        if has_explicit_request_format and not use_legacy_engine:
            if request_format == "gemini":
                translate_engine_settings = OpenAICompatibleSettings(
                    openai_compatible_api_key=provider.api_key,
                    openai_compatible_base_url=provider.base_url or "https://generativelanguage.googleapis.com/v1beta/openai",
                    openai_compatible_model=provider.model or "gemini-2.0-flash",
                )
            elif request_format == "anthropic":
                translate_engine_settings = OpenAICompatibleSettings(
                    openai_compatible_api_key=provider.api_key,
                    openai_compatible_base_url=provider.base_url or "https://api.anthropic.com/v1",
                    openai_compatible_model=provider.model or "claude-3-5-sonnet-20241022",
                )
            elif request_format == "openai_response":
                # 当前翻译底层为 chat completions，先兼容降级到 OpenAI 兼容调用
                translate_engine_settings = OpenAICompatibleSettings(
                    openai_compatible_api_key=provider.api_key,
                    openai_compatible_base_url=provider.base_url or "https://api.openai.com/v1",
                    openai_compatible_model=provider.model or "gpt-4o-mini",
                )
            else:
                translate_engine_settings = OpenAISettings(
                    openai_api_key=provider.api_key,
                    openai_base_url=provider.base_url or "https://api.openai.com/v1",
                    openai_model=provider.model or "gpt-4o-mini",
                )
        elif engine_type == "openai":
            translate_engine_settings = OpenAISettings(
                openai_api_key=provider.api_key,
                openai_base_url=provider.base_url or "https://api.openai.com/v1",
                openai_model=provider.model or "gpt-4o-mini",
            )
        elif engine_type == "deepseek":
            translate_engine_settings = DeepSeekSettings(
                deepseek_api_key=provider.api_key,
                deepseek_model=provider.model or "deepseek-chat",
            )
        elif engine_type == "google":
            translate_engine_settings = GoogleSettings()
        elif engine_type == "deepl":
            translate_engine_settings = DeepLSettings(
                deepl_auth_key=provider.api_key,
            )
        elif engine_type == "ollama":
            translate_engine_settings = OllamaSettings(
                ollama_host=provider.base_url or "http://localhost:11434",
                ollama_model=provider.model or "gemma2",
            )
        elif engine_type == "gemini":
            translate_engine_settings = GeminiSettings(
                gemini_api_key=provider.api_key,
                gemini_model=provider.model or "gemini-1.5-flash",
            )
        elif engine_type == "azure":
            translate_engine_settings = AzureSettings(
                azure_api_key=provider.api_key,
                azure_endpoint=provider.base_url,
            )
        elif engine_type == "siliconflow":
            translate_engine_settings = SiliconFlowSettings(
                siliconflow_api_key=provider.api_key,
                siliconflow_base_url=provider.base_url or "https://api.siliconflow.cn/v1",
                siliconflow_model=provider.model or "Qwen/Qwen2.5-7B-Instruct",
            )
        elif engine_type == "zhipu":
            translate_engine_settings = ZhipuSettings(
                zhipu_api_key=provider.api_key,
                zhipu_model=provider.model or "glm-4-flash",
            )
        elif engine_type == "groq":
            translate_engine_settings = GroqSettings(
                groq_api_key=provider.api_key,
                groq_model=provider.model or "llama-3-3-70b-versatile",
            )
        elif engine_type == "aliyundashscope":
            translate_engine_settings = AliyunDashScopeSettings(
                aliyun_dashscope_api_key=provider.api_key,
                aliyun_dashscope_base_url=provider.base_url or "https://dashscope.aliyuncs.com/compatible-mode/v1",
                aliyun_dashscope_model=provider.model or "qwen-plus-latest",
            )
        elif engine_type == "openaicompatible":
            translate_engine_settings = OpenAICompatibleSettings(
                openai_compatible_api_key=provider.api_key,
                openai_compatible_base_url=provider.base_url,
                openai_compatible_model=provider.model or "gpt-4o-mini",
            )
        else:
            # 默认使用 OpenAI 兼容模式
            translate_engine_settings = OpenAICompatibleSettings(
                openai_compatible_api_key=provider.api_key,
                openai_compatible_base_url=provider.base_url or "https://api.openai.com/v1",
                openai_compatible_model=provider.model or "gpt-4o-mini",
            )
        
        # 计算 pool_max_workers（如果未设置，默认为 qps * 10，但不超过 1000）
        qps_value = provider.qps if provider.qps else self.qps
        pool_workers = provider.pool_max_workers
        if not pool_workers:
            pool_workers = min(qps_value * 10, 1000)
        
        # 构建完整的 SettingsModel
        settings = SettingsModel(
            translation=TranslationSettings(
                lang_in=self.lang_in,
                lang_out=self.lang_out,
                output=output_dir,
                qps=qps_value,
                pool_max_workers=pool_workers,
                no_auto_extract_glossary=provider.no_auto_extract_glossary if provider.no_auto_extract_glossary else False,
            ),
            pdf=PDFSettings(
                max_pages_per_part=self.max_pages_per_part,
                disable_rich_text_translate=provider.disable_rich_text_translate if provider.disable_rich_text_translate else False,
            ),
            translate_engine_settings=translate_engine_settings,
        )
        
        return settings

    async def _translate_stream_main_process(
        self,
        settings_model: "SettingsModel",
        pdf_path: str,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        在主进程直接执行 babeldoc 翻译，避免子进程中的网关策略拦截。
        同时显式关闭 debug，避免在输出 PDF 中写入调试框。
        """
        from pathlib import Path as _Path
        from pdf2zh_next.high_level import create_babeldoc_config
        from babeldoc.format.pdf.high_level import async_translate as babeldoc_translate

        config = create_babeldoc_config(settings_model, _Path(pdf_path))
        config.debug = False
        config.show_char_box = False

        async for event in babeldoc_translate(translation_config=config):
            yield event

    @contextlib.contextmanager
    def _temporary_proxy_env(self, proxy: Optional[str]):
        """
        翻译链路代理兼容：通过环境变量注入给底层 SDK/httpx。
        """
        proxy_value = (proxy or "").strip()
        if not proxy_value:
            yield
            return

        keys = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]
        original = {key: os.environ.get(key) for key in keys}
        try:
            for key in keys:
                os.environ[key] = proxy_value
            yield
        finally:
            for key, value in original.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value
    
    def _log_to_db(
        self, 
        level: str, 
        message: str, 
        task_id: Optional[int] = None, 
        paper_id: Optional[int] = None,
        details: Optional[Dict] = None
    ):
        """记录日志到数据库"""
        write_translation_log(
            level=level,
            message=message,
            task_id=task_id,
            paper_id=paper_id,
            details=details,
        )

    async def test_provider_connectivity(self, provider: TranslationLLMProvider) -> Dict[str, Any]:
        """
        测试翻译提供商连通性

        Args:
            provider: 翻译 LLM 提供商

        Returns:
            测试结果字典
        """
        output_dir = str(Path(settings.file_storage_path).resolve())
        os.makedirs(output_dir, exist_ok=True)

        sample_text = "Hello"
        start_time = time.monotonic()
        request_format = normalize_translation_request_format(
            getattr(provider, "request_format", None),
            engine_type=getattr(provider, "engine_type", None),
        )

        deepl_url = provider.base_url if provider.engine_type and provider.engine_type.lower() == "deepl" else None

        def _run_test() -> str:
            _ensure_pdf2zh_openai_user_agent()
            settings_model = self._build_settings(provider, output_dir)
            from pdf2zh_next.translator import get_translator
            with self._temporary_proxy_env(getattr(provider, "proxy", None)):
                with _patch_deepl_server_url(deepl_url):
                    translator = get_translator(settings_model)
                    return translator.translate(sample_text, ignore_cache=True)

        result = await asyncio.to_thread(_run_test)
        latency_ms = int((time.monotonic() - start_time) * 1000)
        sample = ""
        if result is not None:
            try:
                sample = str(result)
            except Exception:
                sample = ""

        message = "联通成功"
        if request_format == "openai_response":
            message = "联通成功（翻译链路已按 Chat Completions 兼容模式测试）"

        return {
            "success": True,
            "message": message,
            "latency_ms": latency_ms,
            "engine_type": provider.engine_type,
            "request_format": request_format,
            "model": provider.model,
            "sample": sample[:200]
        }
    
    def get_provider(self, provider_id: Optional[int] = None) -> Optional[TranslationLLMProvider]:
        """
        获取翻译提供商
        
        Args:
            provider_id: 指定的提供商 ID，如果为 None 则获取优先级最高的启用提供商
            
        Returns:
            TranslationLLMProvider 或 None
        """
        session = Session()
        try:
            if provider_id:
                provider = session.query(TranslationLLMProvider).filter(
                    TranslationLLMProvider.id == provider_id,
                    TranslationLLMProvider.enabled == True
                ).first()
            else:
                provider = session.query(TranslationLLMProvider).filter(
                    TranslationLLMProvider.enabled == True
                ).order_by(TranslationLLMProvider.priority).first()
            
            if provider:
                # 分离对象以便在 session 关闭后使用
                session.expunge(provider)
            return provider
        finally:
            session.close()
    
    def get_paper_pdf_path(self, paper: Paper) -> Optional[str]:
        """获取论文的 PDF 文件路径"""
        from backend.core.file_service import file_service
        
        return file_service.resolve_paper_file_path(
            paper.file_path,
            paper.owner_id,
            paper.md5_hash
        )
    
    def get_output_paths(self, input_path: str) -> Dict[str, str]:
        """
        根据输入路径生成输出文件路径
        
        pdf2zh-next 生成的文件名格式：
        - 中文版: {base_name}.zh.mono.pdf
        - 双语版: {base_name}.zh.dual.pdf
        - 词汇表: {base_name}.zh.glossary.csv (需要删除)
        
        Args:
            input_path: 原始 PDF 路径
            
        Returns:
            包含 mono_path 和 dual_path 的字典
        """
        input_path = Path(input_path)
        base_name = input_path.stem
        output_dir = input_path.parent
        
        return {
            "mono_path": str(output_dir / f"{base_name}.zh.mono.pdf"),
            "dual_path": str(output_dir / f"{base_name}.zh.dual.pdf"),
            "glossary_path": str(output_dir / f"{base_name}.zh.glossary.csv"),
        }
    
    def cleanup_glossary_file(self, input_path: str):
        """
        删除翻译生成的词汇表文件
        
        Args:
            input_path: 原始 PDF 路径
        """
        output_paths = self.get_output_paths(input_path)
        glossary_path = output_paths.get("glossary_path")
        if glossary_path and os.path.exists(glossary_path):
            try:
                os.remove(glossary_path)
                logger.info(f"已删除词汇表文件: {glossary_path}")
            except Exception as e:
                logger.warning(f"删除词汇表文件失败: {e}")
    
    async def translate_pdf(
        self,
        paper_id: int,
        provider_id: Optional[int] = None,
        task_id: Optional[int] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        翻译 PDF 文件（异步生成器）
        
        Args:
            paper_id: 论文 ID
            provider_id: 翻译提供商 ID（可选）
            task_id: 翻译任务 ID（可选，用于日志记录）
            
        Yields:
            翻译进度事件字典
        """
        session = Session()
        try:
            # 获取论文信息
            paper = session.query(Paper).filter(Paper.id == paper_id).first()
            if not paper:
                yield {"type": "error", "error": "论文不存在"}
                return
            
            # 获取 PDF 路径
            pdf_path = self.get_paper_pdf_path(paper)
            if not pdf_path or not os.path.exists(pdf_path):
                yield {"type": "error", "error": "PDF 文件不存在"}
                return
            
            # 获取翻译提供商
            provider = self.get_provider(provider_id)
            if not provider:
                yield {"type": "error", "error": "没有可用的翻译提供商"}
                return
            
            # 记录开始日志
            self._log_to_db(
                "INFO", 
                f"开始翻译论文: {paper.title or paper_id}",
                task_id=task_id,
                paper_id=paper_id,
                details={
                    "provider": provider.name,
                    "engine": provider.engine_type,
                    "request_format": normalize_translation_request_format(
                        getattr(provider, "request_format", None),
                        engine_type=getattr(provider, "engine_type", None),
                    ),
                }
            )
            logger.info(f"[task_{task_id}] 开始翻译论文: {paper_id}, 使用提供商: {provider.name}")

            # 设置任务级代理环境（若配置了 proxy）
            proxy_env_keys = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]
            proxy_backup: dict[str, str | None] = {}
            proxy_value = (getattr(provider, "proxy", None) or "").strip()
            if proxy_value:
                proxy_backup = {key: os.environ.get(key) for key in proxy_env_keys}
                for key in proxy_env_keys:
                    os.environ[key] = proxy_value
            
            # 构建配置
            output_dir = str(Path(pdf_path).parent)
            settings = self._build_settings(provider, output_dir)
            _ensure_pdf2zh_openai_user_agent()
            
            output_paths = self.get_output_paths(pdf_path)
            
            deepl_url = provider.base_url if provider.engine_type and provider.engine_type.lower() == "deepl" else None
            with _patch_deepl_server_url(deepl_url):
                async for event in self._translate_stream_main_process(settings, pdf_path):
                    event_type = event.get("type", "")
                    
                    if event_type == "stage_summary":
                        yield {
                            "type": "stage",
                            "stage": event.get("stage", ""),
                            "message": event.get("message", "")
                        }
                        self._log_to_db(
                            "DEBUG",
                            f"翻译阶段: {event.get('stage', '')}",
                            task_id=task_id,
                            paper_id=paper_id
                        )
                    
                    elif event_type == "progress_start":
                        yield {
                            "type": "progress_start",
                            "stage": event.get("stage", ""),
                            "total": event.get("total", 0)
                        }
                    
                    elif event_type == "progress_update":
                        progress = event.get("progress", 0)
                        total = event.get("total", 1)
                        overall_progress = int((progress / total) * 100) if total > 0 else 0
                        
                        yield {
                            "type": "progress",
                            "progress": progress,
                            "total": total,
                            "overall_progress": overall_progress,
                            "stage": event.get("stage", ""),
                            "part_index": event.get("part_index", 0),
                            "total_parts": event.get("total_parts", 1)
                        }
                    
                    elif event_type == "progress_end":
                        yield {
                            "type": "progress_end",
                            "stage": event.get("stage", "")
                        }
                    
                    elif event_type == "finish":
                        mono_path = event.get("translate_path", output_paths["mono_path"])
                        dual_path = event.get("translate_dual_path", output_paths["dual_path"])
                        
                        self.cleanup_glossary_file(pdf_path)
                        
                        paper.translation_status = "completed"
                        paper.translation_progress = 100
                        paper.translated_file_path = mono_path
                        paper.translated_dual_path = dual_path
                        paper.translated_at = datetime.now().isoformat()
                        paper.translation_error = None
                        session.commit()
                        
                        self._log_to_db(
                            "INFO",
                            f"翻译完成: {paper.title or paper_id}",
                            task_id=task_id,
                            paper_id=paper_id,
                            details={"mono_path": mono_path, "dual_path": dual_path}
                        )
                        logger.info(f"[task_{task_id}] 翻译完成: {paper_id}")
                        
                        yield {
                            "type": "finish",
                            "mono_path": mono_path,
                            "dual_path": dual_path
                        }
                    
                    elif event_type == "error":
                        error_msg = event.get("error", "翻译失败")
                        
                        paper.translation_status = "failed"
                        paper.translation_error = error_msg
                        session.commit()
                        
                        self._log_to_db(
                            "ERROR",
                            f"翻译失败: {error_msg}",
                            task_id=task_id,
                            paper_id=paper_id
                        )
                        logger.error(f"[task_{task_id}] 翻译失败: {paper_id}, 错误: {error_msg}")
                        
                        yield {"type": "error", "error": error_msg}
        
        except Exception as e:
            import traceback
            error_msg = str(e)
            stack_trace = traceback.format_exc()
            self._log_to_db(
                "ERROR",
                f"翻译异常: {error_msg}",
                task_id=task_id,
                paper_id=paper_id,
                details={"stack_trace": stack_trace}
            )
            logger.error(f"[task_{task_id}] 翻译异常: {paper_id}, 错误: {error_msg}\n{stack_trace}")
            yield {"type": "error", "error": error_msg}
        
        finally:
            # 恢复代理环境变量
            try:
                if "proxy_backup" in locals():
                    for key, value in proxy_backup.items():
                        if value is None:
                            os.environ.pop(key, None)
                        else:
                            os.environ[key] = value
            except Exception:
                pass
            session.close()


# 全局翻译服务实例
translation_service = TranslationService()


