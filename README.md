# 🧬 PaperFlow

AI 驱动的学术论文管理系统，支持 PDF 自动解析、智能摘要生成、多模型负载均衡。

## ✨ 核心功能

- **📄 PDF 智能解析**：自动提取论文元数据（标题、作者、期刊、年份）
- **🤖 AI 深度分析**：生成中英文摘要和详细解读
- **🏷️ 分组管理**：灵活的标签分类系统
- **🔐 多用户支持**：用户认证与权限管理
- **⚙️ LLM 配置管理**：可视化管理多个 AI 模型提供商
  - **🛡️ 严格隔离**：元数据提取与深度分析池配置互不干扰
  - **🔄 顺序故障转移**：按优先级顺序尝试模型
  - **🔁 智能重试**：可配置单模型重试次数，死磕到底
- **🎨 现代 UI 设计**：基于 TailwindCSS 的响应式深色界面

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
│   ├── routers/           # API 路由 (auth, papers, admin等)
│   ├── main.py            # 应用入口
│   ├── schemas.py         # Pydantic 模型
│   └── ...
├── frontend/              # Next.js 前端 (App Router)
│   ├── app/               # 页面组件
│   └── ...
├── db_models.py           # 数据库模型 (Shared)
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

### LLM 配置
- **添加提供商**：配置 API 地址、密钥、支持的模型
- **优先级管理**：数字越小优先级越高 (1 = 最高)，系统将按优先级顺序尝试
- **启用/禁用**：灵活控制提供商状态
- **重试配置**：全局设置每个模型的最大重试次数

### 系统设置
- **日志开关**：可开启或关闭日志记录功能


## 🌐 部署

### 前后端分离部署

1. **后端 (FastAPI)**: 推荐部署到 Render / Railway / AWS EC2
   - 启动命令: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
   - 记得设置环境变量 (DB_URL, OPENAI_API_KEY 等)

2. **前端 (Next.js)**: 推荐部署到 Vercel / Netlify
   - Build Command: `npm run build`
   - Output Directory: `.next` (Vercel 会自动识别)
   - 环境变量: `NEXT_PUBLIC_API_URL` 指向后端地址

## 🛠️ 技术栈

- **前端**：Next.js 16 + React 19 + TailwindCSS 4
- **后端**：FastAPI + SQLModel/SQLAlchemy
- **数据库**：SQLite (Dev) / PostgreSQL (Prod)
- **AI 集成**：OpenAI SDK (支持 OpenAI, Gemini, Claude, DeepSeek 等)
- **PDF 解析**：PyMuPDF (fitz)

## 📝 使用流程

1. **注册登录** → 进入 Dashboard
2. **上传论文** → 点击 "上传新论文" 或拖拽 PDF
3. **AI 处理** → 自动流式生成元数据与分析报告
4. **管理/搜索** → 分组管理、全文检索、查看报告
5. **系统配置** → 管理员面板配置 LLM 策略


## 📄 许可证

MIT License
