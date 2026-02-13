# 依赖管理策略

## 目标
- 锁定关键依赖的主版本范围，避免破坏性升级。
- 在需要时生成可复现的锁定文件。

## Python
- 运行时依赖写在 `requirements.txt` 与 `backend/requirements.txt`。
- 已为关键依赖设置上界，例如 `fastapi>=0.109.0,<0.110.0`、`sqlalchemy>=2.0.0,<3.0.0`。
- 如需严格锁定，请使用 `pip-tools` 生成锁定文件：

```bash
pip install pip-tools
pip-compile requirements.txt -o requirements.lock
pip-compile backend/requirements.txt -o backend/requirements.lock
```

## Node.js
- 前端使用 `frontend/package-lock.json` 作为锁定文件。
- 变更依赖后应提交 `package-lock.json`。

## 更新流程（建议）
1. 升级依赖时，先修改版本范围。
2. 运行本地测试与基础功能回归。
3. 生成并提交锁定文件。
