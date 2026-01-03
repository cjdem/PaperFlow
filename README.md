# 🧬 PaperFlow

AI 驱动的学术论文管理系统，支持 PDF 自动解析、智能摘要生成、PDF 全文翻译、多模型负载均衡。

## ✨ 核心功能

- **📄 PDF 智能解析**：自动提取论文元数据（标题、作者、期刊、年份）
- **🤖 AI 深度分析**：生成中英文摘要和详细解读
- **🌐 PDF 全文翻译**：
  - 基于 pdf2zh-next 的高质量 PDF 翻译
  - 支持中文版和双语对照版输出
  - 保留原始 PDF 格式和布局
  - 后台队列处理，实时进度显示
  - 支持多种翻译引擎（OpenAI、DeepSeek、Gemini 等）
- **💾 文件持久化存储**：
  - PDF 文件永久保存，支持下载和预览
  - 用户隔离存储，按用户目录管理
  - 智能去重（同一用户不重复存储相同文件）
  - 支持重新分析已存储的论文
- **🔍 高级搜索与筛选**：
  - 多字段搜索（标题、作者、摘要、期刊）
  - 年份范围筛选
  - 期刊多选筛选
- **🏷️ 分组管理**：灵活的标签分类系统
- **📦 批量操作**：批量删除、批量分组、批量导出（CSV/BibTeX/Markdown/JSON）
- **👥 团队空间**：创建团队、邀请成员、共享论文
- **🔐 多用户支持**：用户认证与权限管理
- **⚙️ LLM 配置管理**：可视化管理多个 AI 模型提供商
  - **🛡️ 严格隔离**：元数据提取与深度分析池配置互不干扰
  - **🔄 顺序故障转移**：按优先级顺序尝试模型
  - **🔁 智能重试**：可配置单模型重试次数，死磕到底
- **📊 存储统计**：管理员可查看各用户存储使用情况
- **🎨 现代 UI 设计**：
  - 基于 Fluent 2 设计系统的深色主题
  - 流畅的动画效果（卡片展开、模态框、Toast 通知）
  - 玻璃拟态（Glassmorphism）视觉效果
  - 响应式布局，支持移动端

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/cjdem/PaperFlow.git
cd PaperFlow
```

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

### 3. 配置环境变量

复制 `.env.example` 为 `.env` 并修改配置：

```bash
cp .env.example .env
# Windows (PowerShell):
# copy .env.example .env
```

或者手动创建：

```bash
DB_URL=sqlite:///papers.db
```

### 4. 配置 LLM 提供商（首次运行可选）

复制 `llm_config.json.example` 为 `llm_config.json` 并填入 API Key（首次启动会自动导入到数据库）：

```bash
cp llm_config.json.example llm_config.json
# Windows (PowerShell):
# copy llm_config.json.example llm_config.json
```

或者手动创建：

```json
{
  "metadata_pool": [
    {
      "base_url": "https://api.openai.com/v1",
      "api_key": "your-api-key",
      "model": "gpt-4o-mini",
      "priority": 1,
      "api_type": "openai"
    }
  ],
  "analysis_pool": [
    {
      "base_url": "https://api.openai.com/v1",
      "api_key": "your-api-key",
      "model": "gpt-4o",
      "priority": 1,
      "api_type": "openai"
    }
  ]
}
```

之后可在管理员面板的 "🤖 LLM 配置" 中可视化管理。

### 5. 运行应用

**启动后端 (Port 8000)**
```bash
cd backend
uvicorn main:app --reload
```

**启动前端 (Port 3000)**
```bash
cd frontend
npm install
npm run dev
```

访问 `http://localhost:3000`

首次使用需要注册账号。第一个注册的用户默认为管理员。

## 📁 项目结构

```
PaperFlow/
├── backend/               # FastAPI 后端
│   ├── routers/           # API 路由
│   │   ├── auth.py        # 用户认证
│   │   ├── papers.py      # 论文管理 + 高级搜索 + 下载/预览/重新分析
│   │   ├── groups.py      # 分组管理
│   │   ├── workspaces.py  # 团队空间
│   │   ├── export.py      # 批量导出
│   │   ├── translate.py   # PDF 翻译 API
│   │   └── admin.py       # 管理员功能 + 存储统计 + 翻译配置
│   ├── main.py            # 应用入口
│   ├── schemas.py         # Pydantic 模型
│   └── ...
├── frontend/              # Next.js 前端 (App Router)
│   ├── app/               # 页面组件
│   │   ├── papers/        # 论文列表页
│   │   ├── workspaces/    # 团队空间页
│   │   ├── admin/         # 管理员页（含存储统计、翻译配置）
│   │   └── globals.css    # Fluent 2 设计系统样式
│   ├── components/        # 可复用组件
│   │   ├── AdvancedSearch.tsx     # 高级搜索组件
│   │   ├── TranslationPanel.tsx   # 翻译面板组件
│   │   ├── TranslationMonitor.tsx # 翻译监控组件
│   │   ├── DownloadButtons.tsx    # 下载按钮组件
│   │   ├── MarkdownRenderer.tsx   # Markdown 渲染组件
│   │   ├── ui/                    # UI 基础组件
│   │   │   ├── Toast.tsx          # Toast 通知组件
│   │   │   └── DropdownMenu.tsx   # 下拉菜单组件
│   │   └── markdown/              # Markdown 渲染系统
│   │       ├── AcademicMarkdownRenderer.tsx  # 学术 Markdown 渲染器
│   │       └── renderers/         # 自定义渲染器（代码、数学公式等）
│   └── lib/api.ts         # API 客户端
├── uploads/               # 文件存储目录
│   └── papers/            # PDF 文件（按用户目录存储）
│       └── user_{id}/     # 用户文件目录
├── db_models.py           # 数据库模型 (Shared)
├── file_service.py        # 文件存储服务
├── translation_service.py # PDF 翻译服务
├── translation_queue.py   # 翻译队列管理
├── llm_pool.py            # LLM 核心逻辑
├── llm_service.py         # LLM CRUD
├── llm_config.json.example # 配置文件模版
└── requirements.txt       # 依赖列表
```

## 🔧 管理员功能

管理员登录后可访问 "🔧 系统管理"：

### 系统概览
- 查看用户统计
- 查看论文收录数量
- 查看分组标签

### 存储统计
- 查看总文件数和总存储空间
- 查看各用户存储使用详情
- 存储占比可视化展示

### LLM 配置
- **添加提供商**：配置 API 地址、密钥、支持的模型
- **优先级管理**：数字越小优先级越高 (1 = 最高)，系统将按优先级顺序尝试
- **启用/禁用**：灵活控制提供商状态
- **重试配置**：全局设置每个模型的最大重试次数

### 翻译配置
- **翻译提供商管理**：配置 PDF 翻译使用的 LLM 提供商
- **支持多种引擎**：OpenAI、DeepSeek、Gemini、Ollama、SiliconFlow 等
- **QPS 限制**：控制翻译请求频率
- **翻译队列监控**：查看翻译任务状态和进度

### 系统设置
- **日志开关**：可开启或关闭日志记录功能


## 🌐 部署

### 前后端分离部署

1. **后端 (FastAPI)**: 
   - 启动命令: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
   - 记得设置环境变量 (DB_URL, OPENAI_API_KEY 等)

2. **前端 (Next.js)**: 
   - Build Command: `npm run build`
   - Output Directory: `.next` (Vercel 会自动识别)
   - 环境变量: `NEXT_PUBLIC_API_URL` 指向后端地址

## 🛠️ 技术栈

- **前端**：Next.js 16.1 + React 19.2 + TailwindCSS 4
- **后端**：FastAPI + SQLAlchemy
- **数据库**：SQLite (Dev) / PostgreSQL (Prod)
- **AI 集成**：OpenAI SDK (支持 OpenAI, Gemini, Claude, DeepSeek 等兼容 API)
- **PDF 解析**：PyMuPDF (fitz)
- **PDF 翻译**：[pdf2zh-next](https://github.com/Byaidu/PDFMathTranslate) (AGPL-3.0)
- **Markdown 渲染**：react-markdown + KaTeX (数学公式) + highlight.js (代码高亮)

## 📝 使用流程

1. **注册登录** → 进入 Dashboard
2. **上传论文** → 点击 "上传新论文" 或拖拽 PDF（文件自动保存）
3. **AI 处理** → 自动流式生成元数据与分析报告
4. **PDF 翻译** → 点击翻译按钮，生成中文版/双语对照版 PDF
5. **管理/搜索** → 分组管理、高级搜索筛选、查看报告
6. **文件操作** → 下载原版/中文版/双语版 PDF、预览、重新分析
7. **批量操作** → 多选模式下批量删除、分组、导出
8. **团队协作** → 创建团队空间、邀请成员、共享论文
9. **系统配置** → 管理员面板配置 LLM 策略、翻译配置、查看存储统计

## 🔍 高级搜索功能

点击搜索框旁的 "高级搜索" 按钮展开筛选面板：

- **搜索范围**：选择在全部字段、标题、作者、摘要或期刊中搜索
- **年份范围**：设置起始年份和结束年份
- **期刊筛选**：多选期刊，显示每个期刊的论文数量

## 👥 团队空间功能

- **创建空间**：创建团队工作空间
- **邀请成员**：通过用户名邀请其他用户加入
- **角色管理**：所有者、管理员、成员三级权限
- **论文共享**：将个人论文分享到团队空间

## 💾 文件存储功能

### 存储结构
```
uploads/papers/user_{id}/
├── {md5_hash}.pdf           # 原始 PDF
├── {md5_hash}.zh.mono.pdf   # 中文翻译版
└── {md5_hash}.zh.dual.pdf   # 双语对照版
```

### 功能特性
- **自动保存**：上传的 PDF 自动保存到用户目录
- **智能去重**：同一用户上传相同文件（MD5 相同）自动跳过
- **用户隔离**：不同用户可上传相同文件，互不影响
- **下载功能**：下载时使用论文标题作为文件名
- **预览功能**：在新窗口中预览 PDF
- **重新分析**：使用已存储的 PDF 重新进行 AI 分析
- **同步删除**：删除论文时自动删除原始 PDF 和翻译版本

### 配置选项
在 `.env` 文件中可配置：
```env
FILE_STORAGE_PATH=./uploads    # 文件存储根路径
```

## 🌐 PDF 翻译功能

### 功能特性
- **高质量翻译**：基于 pdf2zh-next，保留原始 PDF 格式和布局
- **双版本输出**：同时生成中文版和双语对照版
- **后台处理**：翻译任务在后台队列中处理，不阻塞其他操作
- **实时进度**：翻译过程中实时显示进度和状态
- **多引擎支持**：支持 OpenAI、DeepSeek、Gemini、Ollama 等多种翻译引擎

### 使用方法
1. 在论文详情页点击 "翻译" 按钮
2. 等待翻译完成（可在翻译监控面板查看进度）
3. 翻译完成后可下载中文版或双语对照版 PDF

### 配置翻译提供商
在管理员面板的 "翻译配置" 中添加翻译提供商：
- 选择引擎类型（OpenAI、DeepSeek、Gemini 等）
- 配置 API 地址和密钥
- 设置 QPS 限制（建议 2-4）

## 🙏 致谢

本项目的 PDF 翻译功能基于以下优秀的开源项目：

- **[pdf2zh-next (PDFMathTranslate)](https://github.com/Byaidu/PDFMathTranslate)** - 高质量的 PDF 文档翻译工具，支持保留原始格式和数学公式。该项目采用 [AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html) 许可证。

感谢 [Byaidu](https://github.com/Byaidu) 及所有贡献者的辛勤工作！

## 📄 许可证

本项目采用 MIT License 许可证。

**注意**：本项目使用的 pdf2zh-next 库采用 AGPL-3.0 许可证。如果您修改了 pdf2zh-next 的代码并通过网络提供服务，您需要按照 AGPL-3.0 的要求公开您的修改。本项目仅通过 pip 安装并调用 pdf2zh-next 的公共 API，未对其进行修改。
