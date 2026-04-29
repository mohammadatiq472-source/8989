# AI 管理页专门布局 / 移动端适配新窗口任务包（2026-04-27）

## 顶层锁

本窗口只做 Godot AI 管理页专门布局和移动端适配，不做 provider pool 后端实现、不做 patrol scheduler ops gate、不做 WorldService/rules/action authority、不做 Web 正式客户端。

每轮先读：

1. `AGENTS.md`
2. `docs/AGENTS_EXECUTION_CURRENT_2026_04.md`
3. `CODEX.md`
4. `docs/AI_PLAYER_AUTOMATION_ROLLING_STATUS_2026_04_26.md`
5. `docs/AI_PLAYER_RUNTIME_MODEL_STRATEGY_2026_04_27.md`
6. `docs/AI_PLAYER_PROVIDER_POOL_AND_AI_PANEL_NEXT_WINDOW_PROMPT_2026_04_27.md`（只读边界，不执行后端任务）
7. 本文件

每轮先跑 `git status --short`。如果 provider/patrol 后端窗口正在修改 shared/server 合同，先停下回报，不要抢改后端文件。

## 当前基线

- AI 管理页已有头像选择入口。
- 主界面聊天气泡能使用 AI profile avatar。
- 当前 Godot AI 管理页优先复用 `SlgSnapshotPanel` 通用卡片，因此比浏览器原型更工程化。
- 浏览器原型只是形态验证；正式实现必须在 Godot。

## 目标

把 Godot 里的 AI 管理页做成正式游戏内管理台，尽量靠近浏览器原型的阅读体验，但只在 Godot 内完成。

必须完成：

1. AI 管理页专门布局：头像、AI 名称、模型名、模型来源、预算、资源子账户、候选动作、失败原因、下一步建议。
2. 移动端适配：竖屏可滚动、字体不小、按钮触控尺寸足够、卡片不拥挤、不遮挡。
3. 头像展示：使用正式 AI profile avatar，不再只是临时字母徽章。
4. 模型/预算/失败原因卡片要用玩家语言，不堆后端字段。
5. 保持通用收件箱在主界面，不塞回 AI 管理页。
6. 输出截图证据：桌面宽屏 + 移动竖屏或窄屏截图。

## 白名单文件

只允许优先改：

- `godot-client/scripts/ui/ai_panel.gd`
- `godot-client/scripts/ui/presenters/ai_panel_presenter.gd`
- `godot-client/scenes/ui/ai_panel.tscn`
- `godot-client/scripts/ui/slg_snapshot_section_page.gd`（仅当卡片渲染必须补 image/status 时）
- `godot-client/scripts/ui/child_page_block_factory.gd`（仅当复用卡片工厂必须补 image/status 时）
- `godot-client/tools/run_mainline_visual_smoke.py`（仅用于截图证据）
- `docs/AI_PLAYER_AUTOMATION_ROLLING_STATUS_2026_04_26.md`
- 本任务包文档
- `tmp/screenshots/` 下截图证据

禁止改：

- `shared/contracts/aiPlayer.ts`
- `shared/schemas/aiPlayer.ts`
- `server/src/application/ai/aiPlayerRuntimeModelTarget.ts`
- `server/src/application/ai/aiPlayerGovernanceRuntimeView.ts`
- `server/src/application/ai/AIPlayerGovernanceService.ts`
- `server/src/evals/*Ai*`
- `server/src/ops/*ai*`
- `server/tests/ai_player_*`
- WorldService / rules / world-cell 视觉 / 武将页 / native_slg_shell 大改 / Web 正式客户端

如果 UI 缺字段，只显示“后端未提供 / 等待 provider pool 字段”，不要自己改后端。

## 执行计划

### Step 1：现状截图与布局盘点

- 跑一次 AI 管理页 visual smoke。
- 截当前桌面宽屏图。
- 如工具支持，补窄屏或竖屏截图；如果不支持，只改 visual smoke 工具加 viewport 参数。
- 标出当前最不玩家可读的字段和卡片。

### Step 2：专门布局

- 在 Godot AI panel 内做专门的玩家可读结构。
- 卡片顺序建议：
  1. AI 身份：头像、名称、模型、接入状态。
  2. 当前预算：行动点、资源输送额度、资源子账户。
  3. 候选动作：最多 3 条，显示“能做什么 / 为什么 / 批准后结果”。
  4. 失败原因：最近失败、玩家下一步。
- 不堆后端字段名，不显示明文 key。

### Step 3：移动端适配

- 字号不要过小。
- 触控按钮最小高度不低于现有聊天 overlay 标准。
- 卡片可滚动，不横向溢出。
- 文本过长要换行或折叠，不遮挡。

### Step 4：截图和验证

必须跑：

- `npm run godot:headless:smoke`
- `npm run godot:mainline:visual-smoke -- --display-mode world --world-action open_hub_panel --panel-id ai_hub --evidence-dir tmp/screenshots/ai_panel_dedicated_layout_20260427`

如果改了 visual smoke 窄屏参数，也跑一条窄屏证据。

## 输出格式

最终按：

- 通过项：列 UI 完成项、截图、验证命令。
- 风险项：列移动端/字段缺失/视觉未完全还原问题。
- 阻塞项：列需要后端 provider pool 窗口补的字段。
- 下一步：列 1-3 项。

必须列出：

- 改动文件
- 验证命令
- 截图路径
- 是否更新 `docs/AI_PLAYER_AUTOMATION_ROLLING_STATUS_2026_04_26.md`
- UTF-8 回读和 secret 扫描结果

## 新窗口开场提示词

复制下面整段到新窗口：

```text
你接手 C:\Users\26739\Desktop\8989 的 Godot AI 管理页专门布局 + 移动端适配任务。先读 AGENTS.md、docs/AGENTS_EXECUTION_CURRENT_2026_04.md、CODEX.md、docs/AI_PLAYER_AUTOMATION_ROLLING_STATUS_2026_04_26.md、docs/AI_PLAYER_RUNTIME_MODEL_STRATEGY_2026_04_27.md、docs/AI_PLAYER_PROVIDER_POOL_AND_AI_PANEL_NEXT_WINDOW_PROMPT_2026_04_27.md、docs/AI_PLAYER_AI_PANEL_UI_NEXT_WINDOW_PROMPT_2026_04_27.md，然后 git status --short。本窗口只允许做 Godot AI 管理页专门布局、移动端适配、头像/模型/预算/失败原因玩家可读卡片和截图验证。不碰 provider pool 后端、不碰 patrol scheduler ops gate、不碰 shared/contracts、不碰 server/src/application/ai、不碰 server/tests、不碰 WorldService/rules/world-cell/武将页/native_slg_shell 大改/Web 正式客户端。若 UI 缺字段，只显示等待后端字段并回报，不抢改后端。必须跑 npm run godot:headless:smoke 和 godot:mainline:visual-smoke，输出桌面宽屏 + 移动/窄屏证据。涉及中文文件修改后 UTF-8 回读校验，扫描 touched files 不得包含任何 secret。最终按 通过项 / 风险项 / 阻塞项 / 下一步 输出，并列改动文件、验证命令、截图路径。
```
