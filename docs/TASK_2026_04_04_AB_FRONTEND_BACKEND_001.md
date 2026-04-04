# TASK 001 - A/B 前后端并行（2026-04-04）

## 任务目标

建立一条可复用的 A/B 并行开发链路，并落地首个真实任务：

1. 后端增强运行态健康信息，便于双机联调与排障。
2. Unity 客户端支持可配置后端地址，避免硬编码 localhost。

## 模块映射

- A（后端）：`M01 Runtime Gateway` + `M03 Planning and Commander`
- B（前端/Unity）：`M15 Frontend Command Workspace` + `M16 Frontend Map Rendering`

## A 分支（后端）

- 分支：`codex/ab-task1-backend-health-and-templates`
- 路径白名单：
  - `.github/pull_request_template.md`
  - `docs/templates/ab-game-task-split-template.md`
  - `docs/TASK_2026_04_04_AB_FRONTEND_BACKEND_001.md`
  - `server/src/app.ts`
- 验证：
  - `npm run lint`
  - `npm run test:planner:prompt`

## B 分支（前端/Unity）

- 分支：`codex/ab-task1-unity-backend-endpoint`
- 路径白名单：
  - `My project/Assets/Scripts/Network/BackendApi.cs`
  - `My project/Assets/Scripts/Game/GameManager.cs`
  - `docs/unity/01-session-and-runtime.md`
- 验证：
  - `npm run gate:contracts:unity`
  - Unity PlayMode smoke（人工）

## 企业微信群同步口径

- A 报告：后端 `/api/health` 现在返回可读运行态（tick/worldVersion/factionCount/unitCount）。
- B 报告：Unity 可在 Inspector 配置后端 HTTP 地址，支持非本机联调。
- 合并策略：A/B 分支分别 PR，互审后合并。
