"""
LLM 池管理器 - 从数据库读取配置，支持动态刷新
"""
from openai import AsyncOpenAI
from llm_service import get_enabled_providers, import_from_json


class LLMManager:
    def __init__(self):
        # 首次启动时，尝试从 JSON 导入配置
        imported = import_from_json()
        if imported > 0:
            print(f"✅ 已从 llm_config.json 导入 {imported} 个提供商配置")
        
        # 构建池子
        self.pools = {"metadata": [], "analysis": []}
        self.reload_config()

    def reload_config(self):
        """重新加载配置（从数据库）"""
        self.pools = {
            "metadata": self._build_pool("metadata"),
            "analysis": self._build_pool("analysis"),
        }
        print("=" * 40)
        print("🔌 LLM 配置已加载")
        print(f"   - Metadata 主力: {self._get_first_name('metadata')}")
        print(f"   - Analysis 主力: {self._get_first_name('analysis')}")
        print("=" * 40)

    def _get_first_name(self, pool_name: str) -> str:
        pool = self.pools.get(pool_name, [])
        if not pool:
            return "无可用配置"
        node = pool[0]
        return f"[{node['model']}] @ {node['provider']}"

    def _build_pool(self, pool_type: str) -> list:
        """从数据库构建客户端池"""
        providers = get_enabled_providers(pool_type)
        client_pool = []

        for entry in providers:
            base_url = entry.get("base_url", "").strip()
            keys = [k.strip() for k in entry.get("api_key", "").split(",") if k.strip()]
            models = [m.strip() for m in entry.get("models", "").split(",") if m.strip()]

            for key in keys:
                client = AsyncOpenAI(api_key=key, base_url=base_url)
                for model in models:
                    provider = base_url.split("//")[-1].split("/")[0]
                    client_pool.append({
                        "client": client,
                        "model": model,
                        "provider": provider,
                        "is_primary": entry.get("is_primary", False),
                        "id": f"[{model}] @ {provider}",
                    })

        return client_pool

    async def chat(self, pool_name: str, messages: list, response_format=None, 
                   temperature: float = 0.7, validator=None):
        """调用 LLM，主备模式自动切换"""
        target_pool = self.pools.get(pool_name, [])
        if not target_pool:
            raise ValueError(f"❌ 池子 {pool_name} 为空，请在管理面板配置 LLM 提供商")

        last_error = None

        for i, node in enumerate(target_pool):
            try:
                if i > 0:
                    print(f"   ⚠️ [主力挂了] 切换备用线路 {i}: {node['id']}")

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

                return response

            except Exception as e:
                print(f"   ⚠️ 通道无效 [{node['id']}]: {e}")
                last_error = e
                continue

        raise last_error


# 全局实例
llm_manager = LLMManager()
