# 统一大模型配置入口设计文档

## 实现状态

截至 2026-04-29，本设计已落地到代码库：

- 后端统一服务：`backend/core/llm_config_service.py`
- 后端统一接口：`/api/admin/model-configs`
- 前端统一入口：`frontend/components/admin/model-config/`
- 管理员页挂载：`frontend/app/admin/page.tsx`
- 翻译队列监控：`frontend/components/TranslationMonitor.tsx`
- 服务层测试：`test/test_llm_config_service.py`
- 前端旧接口回退映射测试：`test/test_model_config_fallback.mjs`

## 背景

PaperFlow 当前有三类需要配置大模型的功能：

- 元数据提取：使用 `llm_providers`，通过 `pool_type = metadata` 区分。
- 深度分析：使用 `llm_providers`，通过 `pool_type = analysis` 区分。
- PDF 翻译：使用 `translation_llm_providers`，由翻译队列和 `translation_service` 读取。

这三类配置在前端分散在两个入口：管理员页的 LLM 配置区域，以及 `TranslationMonitor` 内部的翻译提供商管理区域。后端也分别由 `/api/admin/llm-providers` 与 `/api/translate/providers` 管理，字段映射和测试逻辑重复。

目标不是立即合并数据库表，而是先提供一个统一添加和分配入口，让管理员可以一次录入模型基础信息，再分配到一个或多个功能场景。

## 目标

- 管理员通过一个统一入口添加大模型配置。
- 同一个模型可以分配到 `metadata`、`analysis`、`translation` 中的一个或多个目标。
- 保留现有运行链路：元数据/分析继续使用 `LLMManager`，翻译继续使用 `TranslationLLMProvider` 与 `translation_service`。
- 把字段转换、默认值、目标分配和测试入口收敛到统一服务层。
- 前端拆出独立模型配置组件，避免 `admin/page.tsx` 和 `TranslationMonitor.tsx` 继续膨胀。

## 非目标

- 不在第一阶段合并 `llm_providers` 与 `translation_llm_providers`。
- 不引入全局租户级模型凭据库。
- 不重写 `llm_pool.py` 或 PDF 翻译执行链路。
- 不改变现有翻译队列、论文上传、摘要生成的行为。

## 推荐方案

采用“统一入口 + 统一服务层 + 保留现有存储表”的渐进式方案。

前端提供一个统一的“模型配置”页面：

- 顶部展示三类目标的配置状态。
- “添加模型”弹窗收集通用字段。
- 表单内选择分配目标。
- 根据分配目标展示对应高级参数。
- 保存时调用统一后端接口，由后端负责写入对应表。

后端新增 `backend/core/llm_config_service.py`：

- 统一读取 `LLMProvider` 与 `TranslationLLMProvider`。
- 把两类 ORM 对象映射成统一响应结构。
- 按目标创建、更新、删除和测试配置。
- 复用 `llm_format.py` 的格式规范化逻辑。
- 元数据/分析变更后触发 `llm_manager.reload_config()`。

## 数据模型

不新增数据库表。统一接口使用传输层模型表达“目标分配”。

通用字段：

- `name`
- `request_format`
- `base_url`
- `api_key`
- `proxy`
- `model`
- `enabled`

目标字段：

- `target`: `metadata`、`analysis`、`translation`
- `priority`
- `weight`
- `is_primary`
- `qps`
- `pool_max_workers`
- `no_auto_extract_glossary`
- `disable_rich_text_translate`

映射规则：

- `metadata` / `analysis`
  - 写入 `LLMProvider`
  - `pool_type = target`
  - `models = model`
  - `api_type = format_to_legacy_api_type(request_format)`
  - 支持 `is_primary`、`weight`、`priority`
- `translation`
  - 写入 `TranslationLLMProvider`
  - `engine_type = request_format`
  - `model = model`
  - 支持 `qps`、`pool_max_workers`、翻译专属开关

## API 设计

新增管理员接口，前缀仍为 `/api/admin`。

- `GET /api/admin/model-configs`
  - 返回三类目标的统一配置列表。
- `POST /api/admin/model-configs`
  - 支持一次请求创建一个或多个目标配置。
- `PUT /api/admin/model-configs/{target}/{provider_id}`
  - 更新指定目标下的配置。
- `DELETE /api/admin/model-configs/{target}/{provider_id}`
  - 删除指定目标下的配置。
- `POST /api/admin/model-configs/{target}/{provider_id}/toggle`
  - 切换启用状态。
- `POST /api/admin/model-configs/{target}/{provider_id}/set-primary`
  - 仅用于 `metadata` 和 `analysis`。
- `POST /api/admin/model-configs/{target}/{provider_id}/test`
  - 测试指定目标配置。

保留旧接口：

- `/api/admin/llm-providers`
- `/api/translate/providers`

旧接口继续服务现有页面和外部调用，统一入口先以新增接口接入，降低回归风险。

## 前端设计

新增组件目录：

- `frontend/components/admin/model-config/types.ts`
- `frontend/components/admin/model-config/modelConfigApi.ts`
- `frontend/components/admin/model-config/modelConfigFallback.ts`
- `frontend/components/admin/model-config/ModelConfigPanel.tsx`
- `frontend/components/admin/model-config/ModelProviderForm.tsx`
- `frontend/components/admin/model-config/ModelTargetSection.tsx`

`frontend/app/admin/page.tsx` 只保留页面级状态、鉴权、统计和 Tab 容器。模型配置页签委托给 `ModelConfigPanel`。

`TranslationMonitor.tsx` 保留队列监控职责。翻译提供商管理区域从该组件中移除，改为在统一模型配置页中管理。

`modelConfigApi.list()` 在 `/api/admin/model-configs` 返回 `404` 时，会回退读取旧接口 `/api/admin/llm-providers` 和 `/api/translate/providers`，并映射为统一列表。这只用于兼容未重启或未部署新后端的环境；新增、编辑、删除、启用和测试仍以新统一接口为准。

## 错误处理

- 目标非法时返回 `400`。
- 配置不存在返回 `404`。
- API Key 或模型名为空时，测试接口返回 `400`。
- 测试连通性失败返回 `502`，响应中包含截断后的错误信息。
- 更新翻译配置时，如果 `api_key` 为空字符串，沿用现有密钥，避免编辑时误清空。

## 兼容策略

- 旧接口不删除。
- 旧数据不迁移。
- 统一接口读取现有两张表，返回统一视图。
- 前端列表读取遇到新接口 `404` 时回退到旧接口，避免管理员页直接运行时崩溃。
- `llm_config.json` 首次导入逻辑保持不变。
- 翻译提供商仍按 `priority` 排序，元数据/分析仍按 `is_primary` 和 `priority` 排序。

## 运行注意事项

后端需要从项目根目录启动：

```powershell
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

不要在 `backend/` 目录下执行 `uvicorn main:app`，因为项目内模块使用 `backend.*` 绝对导入。

如果管理员页报 `Not Found` 且堆栈指向 `ModelConfigPanel` 加载配置，优先确认：

- 后端是否已重启并加载最新代码。
- 前端是否连接到正确后端地址。
- `NEXT_PUBLIC_API_URL` 或 `PAPERFLOW_BACKEND_URL` 是否指向旧服务。
- 本机代理环境变量是否影响了本地 API 请求。

## 测试策略

后端优先测试服务层，不依赖真实外部模型：

- 字段映射测试。
- 创建多目标配置测试。
- 更新元数据/分析配置触发 reload 测试。
- 更新翻译配置空 API Key 不覆盖旧值测试。
- 非法目标和不存在配置测试。

前端优先运行静态检查：

- `cd frontend && npx eslint "components/admin/model-config/modelConfigApi.ts" "components/admin/model-config/modelConfigFallback.ts" "components/admin/model-config/ModelConfigPanel.tsx" "components/admin/model-config/ModelProviderForm.tsx" "components/admin/model-config/ModelTargetSection.tsx"`

新增轻量前端映射测试：

- `node --experimental-strip-types test/test_model_config_fallback.mjs`

如新增前端测试框架，再补充组件交互测试；当前仓库未配置前端测试框架，因此第一阶段不引入新依赖。

## 原则应用

- KISS：保留现有运行时表结构，先统一入口和服务层。
- YAGNI：不引入独立凭据库、租户级策略或复杂模型编排。
- DRY：配置 CRUD、字段映射、统一响应、测试入口集中到服务层。
- SOLID：前端拆分页面、表单、目标区块；后端路由只做鉴权和 HTTP 编排，业务规则进入服务。
