# Repository Guidelines

## Project Structure & Module Organization
- 根目录包含共享 Python 服务与脚本（如 `auth_service.py`、`translation_service.py`）。
- `backend/` 为 FastAPI API；路由在 `backend/routers/`。
- `frontend/` 为 Next.js App Router；页面在 `frontend/app/`，组件在 `frontend/components/`。
- 需要导航栏的页面放在 `frontend/app/(shell)/` 路由组下（papers、workspaces、admin），共享 `ShellLayout`（含固定 NavBar）。
- 登录页 `frontend/app/page.tsx` 在路由组外，不显示导航栏。
- `frontend/provider/auth.tsx`：全局 AuthProvider，NavBar 从中获取用户信息。
- `frontend/components/ShellLayout.tsx`：导航栏 + 内容区骨架，由 `(shell)/layout.tsx` 引用。
- `frontend/components/AppShell.tsx`：页面头部标题 + 内容区，不含 NavBar。
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

## Architecture Notes
- NavBar 固定在 `(shell)` 路由组 layout 中，页面切换时不会重新挂载或闪烁。
- AppShell 仅负责页面标题和内容区渲染，不再包含 NavBar。
- AuthProvider 在根 layout 全局注入，NavBar 和各页面通过 `useAuthContext` 获取用户状态。

## Testing Guidelines
- 当前仓库未发现 `tests/` 目录或已配置测试框架与覆盖率门槛。
- 若新增测试：后端建议 `tests/` + `test_*.py`，前端建议 `*.test.tsx`；并在文档中补充运行命令。

## Commit & Pull Request Guidelines
- 建议采用 `type: summary`（如 `feat: add translation queue`），保持一行概述并关联 Issue。
- PR 需包含：变更摘要、影响范围、测试步骤；前端改动附截图或录屏。

## Security & Configuration Tips
- 仅提交示例配置：从 `.env.example`、`llm_config.json.example` 复制生成本地文件。
- 不提交密钥与数据库凭证；`FILE_STORAGE_PATH` 默认为 `./uploads`。
