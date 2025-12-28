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

```bash
uivorn main:app
```

### 6. 注册账号

首次使用需要注册账号。第一个注册的用户默认为管理员。

## 📁 项目结构

```
PaperFlow/
├── backend/               # 后端代码
│   ├── routers/           # API 路由
│   ├── main.py            # FastAPI 入口
│   └── ...
├── frontend/              # 前端代码 (Next.js)
├── db_models.py           # 数据库模型
├── db_service.py          # 数据库服务
├── auth_service.py        # 认证服务
├── llm_pool.py            # LLM 池管理 (顺序故障转移)
├── llm_service.py         # LLM CRUD 操作
├── log_service.py         # 日志服务
├── utils.py               # 工具函数
├── llm_config.json.example # LLM 配置文件模版
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

### Streamlit Community Cloud（推荐）

1. Fork 本仓库到你的 GitHub
2. 访问 [Streamlit Cloud](https://streamlit.io/cloud)
3. 登录并连接 GitHub 仓库
4. 在 Secrets 中添加环境变量（可选）
5. 点击 Deploy

### Render / Railway

1. 新建 Web Service
2. 连接 GitHub 仓库
3. 设置启动命令：
   ```bash
   streamlit run app.py --server.port $PORT --server.headless true
   ```
4. 添加环境变量
5. 部署

## 🛠️ 技术栈

- **前端框架**：Streamlit
- **数据库**：SQLAlchemy + SQLite
- **AI 集成**：OpenAI SDK（兼容多种 LLM）
- **PDF 解析**：PyMuPDF (fitz)

## 📝 使用流程

1. **登录/注册** → 进入主界面
2. **上传 PDF** → 左侧栏 "📤 上传新论文"
3. **AI 处理** → 自动提取元数据 + 生成摘要分析
4. **管理论文** → 添加标签、查看报告、搜索筛选
5. **管理员配置** → 调整 LLM 提供商设置


## 📄 许可证

MIT License
