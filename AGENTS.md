# Repository Guidelines

## Project Structure & Module Organization
- 根目录包含共享 Python 服务与脚本（如 `auth_service.py`、`translation_service.py`）。
- `backend/` 为 FastAPI API；路由在 `backend/routers/`。
- `frontend/` 为 Next.js App Router；页面在 `frontend/app/`，组件在 `frontend/components/`。
- 静态资源在 `frontend/public/`；运行期文件默认写入 `uploads/`。
- 配置样例：`.env.example`、`llm_config.json.example`。

## Build, Test, and Development Commands
- `pip install -r requirements.txt` 安装根目录依赖（共享服务、翻译工具）。
- `cd backend` + `pip install -r requirements.txt` 安装后端依赖。
- `cd backend` + `uvicorn main:app --reload` 启动后端（默认 8000）。
- `cd frontend` + `npm install` + `npm run dev` 启动前端（默认 3000）。
- `cd frontend` + `npm run build` / `npm run start` 生产构建与本地启动。
- `cd frontend` + `npm run lint` 运行 ESLint。

## Coding Style & Naming Conventions
- Python：4 空格缩进，模块/函数使用 `snake_case`，类使用 `PascalCase`。
- TypeScript/React：2 空格缩进，组件 `PascalCase`（如 `TranslationPanel.tsx`），Hooks 使用 `useX`。
- Lint/类型检查：`frontend/eslint.config.mjs` 与 `frontend/tsconfig.json`（`strict: true`）。
- CSS 主要集中在 `frontend/app/globals.css`，避免散落重复样式。

## Testing Guidelines
- 当前仓库未发现 `tests/` 目录或已配置测试框架与覆盖率门槛。
- 若新增测试：后端建议 `tests/` + `test_*.py`，前端建议 `*.test.tsx`；并在文档中补充运行命令。

## Commit & Pull Request Guidelines
- 当前目录未初始化 Git（无 `.git`），无法总结历史提交规范。
- 建议采用 `type: summary`（如 `feat: add translation queue`），保持一行概述并关联 Issue。
- PR 需包含：变更摘要、影响范围、测试步骤；前端改动附截图或录屏。

## Security & Configuration Tips
- 仅提交示例配置：从 `.env.example`、`llm_config.json.example` 复制生成本地文件。
- 不提交密钥与数据库凭证；`FILE_STORAGE_PATH` 默认为 `./uploads`。
