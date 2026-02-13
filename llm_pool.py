"""
LLM 池管理器 - 从数据库读取配置，支持动态刷新
支持:
  - 按权重负载均衡
  - 智能重试（排除失败的通道）
  - OpenAI 和 Gemini API 格式（含自定义地址）
  - 流式响应支持
"""
import random
import asyncio
import httpx
import time
from openai import AsyncOpenAI
from llm_service import get_enabled_providers, import_from_json, mark_provider_success, mark_provider_failure
from db_service import get_config
from log_service import llm_logger, get_logger
from settings import settings

logger = get_logger("llm_pool")


class GeminiClientWrapper:
    """
    Gemini API 客户端包装器
    支持自定义 base_url（如中转服务）
    """
    def __init__(self, api_key: str, base_url: str = None):
        self.api_key = api_key
        # 默认使用 Google 官方 API，也支持自定义地址
        self.base_url = base_url.rstrip("/") if base_url else "https://generativelanguage.googleapis.com/v1beta"
    
    async def create_chat_completion(self, model: str, messages: list, temperature: float = 0.7, **kwargs):
        """调用 Gemini API 并返回 OpenAI 兼容的响应格式"""
        # 将 OpenAI 消息格式转换为 Gemini 格式
        gemini_contents = []
        system_instruction = None
        
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            
            if role == "system":
                system_instruction = content
            elif role == "assistant":
                gemini_contents.append({"role": "model", "parts": [{"text": content}]})
            else:  # user
                gemini_contents.append({"role": "user", "parts": [{"text": content}]})
        
        # 构建请求体
        request_body = {
            "contents": gemini_contents,
            "generationConfig": {
                "temperature": temperature
            }
        }
        
        if system_instruction:
            request_body["systemInstruction"] = {"parts": [{"text": system_instruction}]}
        
        # 构建 URL
        url = f"{self.base_url}/models/{model}:generateContent?key={self.api_key}"
        
        # 发送请求 - 使用更细粒度的超时配置
        timeout = httpx.Timeout(300.0, connect=30.0)  # 总超时5分钟，连接超时30秒
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, json=request_body)
            response.raise_for_status()
            data = response.json()
        
        # 包装成 OpenAI 兼容的响应格式
        return GeminiResponseWrapper(data)


class GeminiResponseWrapper:
    """将 Gemini 响应包装成 OpenAI 兼容格式"""
    def __init__(self, gemini_response: dict):
        self.choices = [GeminiChoiceWrapper(gemini_response)]


class GeminiChoiceWrapper:
    """Gemini choice 包装器"""
    def __init__(self, gemini_response: dict):
        self.message = GeminiMessageWrapper(gemini_response)


class GeminiMessageWrapper:
    """Gemini message 包装器"""
    def __init__(self, gemini_response: dict):
        try:
            candidates = gemini_response.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                if parts:
                    self.content = parts[0].get("text", "")
                else:
                    self.content = ""
            else:
                self.content = ""
        except Exception:
            self.content = ""


class AnthropicClientWrapper:
    """
    Anthropic API 客户端包装器
    支持自定义 base_url（如中转服务）
    """
    def __init__(self, api_key: str, base_url: str = None):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/") if base_url else "https://api.anthropic.com"
    
    async def create_chat_completion(self, model: str, messages: list, temperature: float = 0.7, **kwargs):
        """调用 Anthropic API 并返回 OpenAI 兼容的响应格式"""
        # 将 OpenAI 消息格式转换为 Anthropic 格式
        anthropic_messages = []
        system_content = None
        
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            
            if role == "system":
                system_content = content
            else:
                anthropic_messages.append({"role": role, "content": content})
        
        # 构建请求体
        request_body = {
            "model": model,
            "max_tokens": kwargs.get("max_tokens", 8192),
            "messages": anthropic_messages,
            "temperature": temperature
        }
        
        if system_content:
            request_body["system"] = system_content
        
        # 构建 URL
        url = f"{self.base_url}/v1/messages"
        
        # 发送请求 - 使用更细粒度的超时配置
        headers = {
            "Content-Type": "application/json",
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01"
        }
        
        timeout = httpx.Timeout(300.0, connect=30.0)  # 总超时5分钟，连接超时30秒
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, json=request_body, headers=headers)
            response.raise_for_status()
            data = response.json()
        
        # 包装成 OpenAI 兼容的响应格式
        return AnthropicResponseWrapper(data)


class AnthropicResponseWrapper:
    """将 Anthropic 响应包装成 OpenAI 兼容格式"""
    def __init__(self, anthropic_response: dict):
        self.choices = [AnthropicChoiceWrapper(anthropic_response)]


class AnthropicChoiceWrapper:
    """Anthropic choice 包装器"""
    def __init__(self, anthropic_response: dict):
        self.message = AnthropicMessageWrapper(anthropic_response)


class AnthropicMessageWrapper:
    """Anthropic message 包装器"""
    def __init__(self, anthropic_response: dict):
        try:
            content_blocks = anthropic_response.get("content", [])
            if content_blocks:
                # Anthropic 返回 content 数组，取第一个 text 类型的内容
                for block in content_blocks:
                    if block.get("type") == "text":
                        self.content = block.get("text", "")
                        return
            self.content = ""
        except Exception:
            self.content = ""


class LLMManager:
    def __init__(self):
        # 首次启动时，尝试从 JSON 导入配置
        imported = import_from_json()
        if imported > 0:
            logger.info(f"✅ 已从 llm_config.json 导入 {imported} 个提供商配置")
        
        # 构建池子
        self.pools = {"metadata": [], "analysis": []}
        self.reload_config()

    def reload_config(self):
        """重新加载配置（从数据库）"""
        self.pools = {
            "metadata": self._build_pool("metadata"),
            "analysis": self._build_pool("analysis"),
        }
        logger.info("🔌 LLM 配置已加载")
        logger.info(f"   - Metadata 主力: {self._get_first_name('metadata')}")
        logger.info(f"   - Analysis 主力: {self._get_first_name('analysis')}")

    def _get_first_name(self, pool_name: str) -> str:
        """获取主力模型名称（is_primary 优先，然后按 priority 排序的第一个）"""
        pool = self.pools.get(pool_name, [])
        if not pool:
            return "无可用配置"
        node = pool[0]
        primary_tag = " ✓主" if node.get('is_primary') else ""
        return f"[{node['model']}] @ {node['provider']} ({node['api_type']}){primary_tag}"

    def _build_pool(self, pool_type: str) -> list:
        """从数据库构建客户端池"""
        providers = get_enabled_providers(pool_type)
        client_pool = []

        for entry in providers:
            base_url = entry.get("base_url", "").strip()
            keys = [k.strip() for k in entry.get("api_key", "").split(",") if k.strip()]
            models = [m.strip() for m in entry.get("models", "").split(",") if m.strip()]
            weight = entry.get("weight", 10)
            api_type = entry.get("api_type", "openai")

            for key in keys:
                # 根据 api_type 创建不同的客户端
                if api_type == "gemini":
                    client = GeminiClientWrapper(api_key=key, base_url=base_url or None)
                elif api_type == "anthropic":
                    client = AnthropicClientWrapper(api_key=key, base_url=base_url or None)
                else:  # 默认 openai - 添加超时配置
                    client = AsyncOpenAI(
                        api_key=key,
                        base_url=base_url,
                        timeout=httpx.Timeout(300.0, connect=30.0)  # 总超时5分钟，连接超时30秒
                    )
                
                for model_index, model in enumerate(models):
                    provider = base_url.split("//")[-1].split("/")[0] if base_url else "googleapis.com"
                    client_pool.append({
                        "client": client,
                        "model": model,
                        "provider": provider,
                        "api_type": api_type,
                        "is_primary": entry.get("is_primary", False),
                        "weight": weight,
                        "priority": entry.get("priority", 1),
                        "model_index": model_index,  # 模型在列表中的索引，用于保证同一提供商内的模型按顺序调用
                        "id": f"[{model}] @ {provider}",
                        "provider_db_id": entry.get("id"),
                    })

        # 按 is_primary DESC, priority ASC, model_index ASC 排序
        # 确保：1. 主模型优先 2. 优先级高的先调用 3. 同一提供商内按逗号顺序调用
        client_pool.sort(key=lambda x: (
            not x.get("is_primary", False),  # is_primary=True 排前面
            x.get("priority", 1),             # priority 小的排前面
            x.get("model_index", 0)           # model_index 小的排前面
        ))
        
        return client_pool

    def _select_provider(self, pool: list, exclude_ids: set) -> dict:
        """按权重随机选择一个提供商（排除已失败的）"""
        eligible = [p for p in pool if p["id"] not in exclude_ids]
        if not eligible:
            return None
        
        weights = [p["weight"] for p in eligible]
        selected = random.choices(eligible, weights=weights, k=1)[0]
        return selected

    def _get_max_retries(self) -> int:
        """获取最大重试次数配置"""
        try:
            val = get_config("llm_max_retries", str(settings.llm_max_retries))
            return int(val)
        except (ValueError, TypeError):
            return settings.llm_max_retries

    async def chat(self, pool_name: str, messages: list, response_format=None, 
                   temperature: float = 0.7, validator=None):
        """
        调用 LLM，支持:
          - 顺序故障转移 (按 priority 顺序)
          - 单点竭尽重试 (每个 Provider 重试 N 次后再切换)
          - OpenAI、Gemini 和 Anthropic API
        """
        target_pool = self.pools.get(pool_name, [])
        if not target_pool:
            raise ValueError(f"❌ 池子 {pool_name} 为空，请在管理面板配置 LLM 提供商")

        max_retries = self._get_max_retries()
        last_error = None

        # 按优先级顺序遍历每个 Provider
        for node in target_pool:
            provider_id = node['id']
            
            # 对当前 Provider 进行最多 max_retries 次尝试
            for attempt in range(max_retries):
                try:
                    if attempt == 0:
                        llm_logger.log_request(pool_name, provider_id, node['api_type'], node.get('priority', 1))
                    else:
                        llm_logger.log_retry(attempt, max_retries, provider_id, str(last_error))

                    start_time = time.monotonic()
                    # 根据 API 类型调用不同的方法
                    if node["api_type"] == "gemini":
                        response = await node["client"].create_chat_completion(
                            model=node["model"],
                            messages=messages,
                            temperature=temperature
                        )
                    elif node["api_type"] == "anthropic":
                        response = await node["client"].create_chat_completion(
                            model=node["model"],
                            messages=messages,
                            temperature=temperature
                        )
                    else:  # OpenAI
                        kwargs = {
                            "model": node["model"],
                            "messages": messages,
                            "temperature": temperature,
                        }
                        if response_format:
                            kwargs["response_format"] = response_format
                        response = await node["client"].chat.completions.create(**kwargs)

                    # 质检环节
                    if validator:
                        content = response.choices[0].message.content
                        if not validator(content):
                            raise ValueError(f"内容质检未通过: {content[:50]}...")

                    latency_ms = int((time.monotonic() - start_time) * 1000)
                    if node.get("provider_db_id"):
                        mark_provider_success(node["provider_db_id"], latency_ms)
                    return response

                except Exception as e:
                    if node.get("provider_db_id"):
                        mark_provider_failure(node["provider_db_id"], str(e))
                    llm_logger.log_failure(provider_id, str(e))
                    last_error = e
                    # 继续当前 Provider 的下一次重试
                    continue
            
            # 当前 Provider 已用尽所有重试次数，切换到下一个
            logger.warning(f"⚠️ Provider {provider_id} 已用尽 {max_retries} 次重试，切换到下一个")

        # 所有 Provider 均已尝试完毕
        llm_logger.log_exhausted()
        raise last_error or ValueError("所有 LLM 通道均不可用")

    async def chat_stream(self, pool_name: str, messages: list,
                          temperature: float = 0.7, on_chunk=None):
        """
        流式调用 LLM，支持:
          - 顺序故障转移 (按 priority 顺序)
          - 单点竭尽重试 (每个 Provider 重试 N 次后再切换)
          - 实时返回生成内容
        
        Args:
            pool_name: 池子名称 (metadata/analysis)
            messages: 消息列表
            temperature: 温度参数
            on_chunk: 可选的回调函数，每收到一个 chunk 时调用
        
        Yields:
            str: 每个生成的文本片段
        
        Returns:
            str: 完整的生成内容
        """
        target_pool = self.pools.get(pool_name, [])
        if not target_pool:
            raise ValueError(f"❌ 池子 {pool_name} 为空，请在管理面板配置 LLM 提供商")

        max_retries = self._get_max_retries()
        last_error = None

        # 按优先级顺序遍历每个 Provider
        for node in target_pool:
            provider_id = node['id']
            
            # 对当前 Provider 进行最多 max_retries 次尝试
            for attempt in range(max_retries):
                try:
                    if attempt == 0:
                        llm_logger.log_request(pool_name, provider_id, node['api_type'], node.get('priority', 1))
                    else:
                        llm_logger.log_retry(attempt, max_retries, provider_id, str(last_error))

                    start_time = time.monotonic()
                    # 目前只有 OpenAI 兼容 API 支持流式
                    if node["api_type"] not in ["openai"]:
                        # 对于不支持流式的 API，回退到普通调用
                        logger.info(f"⚠️ {node['api_type']} 不支持流式，使用普通调用")
                        if node["api_type"] == "gemini":
                            response = await node["client"].create_chat_completion(
                                model=node["model"],
                                messages=messages,
                                temperature=temperature
                            )
                        elif node["api_type"] == "anthropic":
                            response = await node["client"].create_chat_completion(
                                model=node["model"],
                                messages=messages,
                                temperature=temperature
                            )
                        content = response.choices[0].message.content
                        if on_chunk:
                            on_chunk(content)
                        latency_ms = int((time.monotonic() - start_time) * 1000)
                        if node.get("provider_db_id"):
                            mark_provider_success(node["provider_db_id"], latency_ms)
                        return content
                    
                    # OpenAI 流式调用
                    full_content = ""
                    stream = await node["client"].chat.completions.create(
                        model=node["model"],
                        messages=messages,
                        temperature=temperature,
                        stream=True
                    )
                    
                    async for chunk in stream:
                        if chunk.choices and chunk.choices[0].delta.content:
                            content_piece = chunk.choices[0].delta.content
                            full_content += content_piece
                            if on_chunk:
                                on_chunk(content_piece)

                    logger.info(f"✅ 流式响应完成，总长度: {len(full_content)}")
                    latency_ms = int((time.monotonic() - start_time) * 1000)
                    if node.get("provider_db_id"):
                        mark_provider_success(node["provider_db_id"], latency_ms)
                    return full_content

                except Exception as e:
                    if node.get("provider_db_id"):
                        mark_provider_failure(node["provider_db_id"], str(e))
                    llm_logger.log_failure(provider_id, str(e))
                    last_error = e
                    # 继续当前 Provider 的下一次重试
                    continue
            
            # 当前 Provider 已用尽所有重试次数，切换到下一个
            logger.warning(f"⚠️ Provider {provider_id} 已用尽 {max_retries} 次重试，切换到下一个")

        # 所有 Provider 均已尝试完毕
        llm_logger.log_exhausted()
        raise last_error or ValueError("所有 LLM 通道均不可用")


# 全局实例
llm_manager = LLMManager()
