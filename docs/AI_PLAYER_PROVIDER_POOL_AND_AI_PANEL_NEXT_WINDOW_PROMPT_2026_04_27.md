# AI 玩家 Provider Pool / Patrol Ops 新窗口任务包（2026-04-27）

## 顶层锁

本窗口只做 AI 玩家 provider pool / read-model 和 patrol scheduler 外部调度 gate，不处理 Godot AI 管理页专门布局、world-cell 视觉、武将列表/详情页、native_slg_shell 大改、正式 Web 客户端扩展、无关活动页/国战页。

每轮先读：

1. `AGENTS.md`
2. `docs/AGENTS_EXECUTION_CURRENT_2026_04.md`
3. `CODEX.md`
4. `docs/AI_PLAYER_AUTOMATION_ROLLING_STATUS_2026_04_26.md`
5. `docs/AI_PLAYER_RUNTIME_MODEL_STRATEGY_2026_04_27.md`
6. 本文件
7. 若同时开 UI 窗口，只把 `docs/AI_PLAYER_AI_PANEL_UI_NEXT_WINDOW_PROMPT_2026_04_27.md` 当作边界参考，不执行其中 UI 任务。

每轮先跑 `git status --short`，保护其他窗口和用户改动。只允许改本任务白名单文件；碰到白名单外热文件冲突，停下回报。

## 当前基线

- AI runtime 默认模型已定为 `claude-sonnet-4-6`，用于正式会改世界的 JSON proposal。
- `claude-haiku-4-5-20251001` 保留为低成本候选，但当前不满足 strict raw JSON-only gate。
- 真实 relay live gate 已通过：`npm run gate:ai:live-model-proposal`，`strictRawJsonOnly=true`。
- AI 管理页已有头像选择入口，主界面聊天气泡能使用 profile avatar；后续专门布局由 UI 窗口负责。
- patrol scheduler 已有 `POST /api/ai/chat/patrol-scheduler/run` 和 app 内 optional timer；app 内 timer 当前必须默认关闭。

## 目标

完成两项，并把风险项收敛成可验收状态：

1. 最小 provider pool/read-model：每个 AI 显示当前模型来源、预算、fallback 状态。
2. patrol scheduler 外部调度说明或 ops gate：正式环境不默认打开 app 内 timer。

明确不做：

- 不改 Godot AI 管理页专门布局。
- 不改 `godot-client/scripts/ui/ai_panel.gd`、`godot-client/scripts/ui/presenters/ai_panel_presenter.gd`、`godot-client/scenes/ui/ai_panel.tscn`。
- 只输出 backend/shared contract 字段，供 UI 窗口读取。

## 白名单文件

优先只改：

- `shared/contracts/aiPlayer.ts`
- `shared/schemas/aiPlayer.ts`
- `server/src/application/ai/aiPlayerRuntimeModelTarget.ts`
- `server/src/application/ai/aiPlayerGovernanceRuntimeView.ts`
- `server/src/application/ai/AIPlayerGovernanceService.ts`
- `server/src/ops/*ai*`
- `server/src/evals/*Ai*`
- `server/tests/ai_player_*`
- `docs/AI_PLAYER_AUTOMATION_ROLLING_STATUS_2026_04_26.md`
- `docs/AI_PLAYER_RUNTIME_MODEL_STRATEGY_2026_04_27.md`
- 本任务包文档

不要碰：

- world-cell 视觉与截图链
- 武将列表/详情页
- `native_slg_shell` 大布局
- Web 正式客户端
- 其他活动、国战页面
- Godot AI 管理页布局与移动端适配；这部分归 `docs/AI_PLAYER_AI_PANEL_UI_NEXT_WINDOW_PROMPT_2026_04_27.md`

## 执行计划

### Step 1：Provider Pool / Read Model

做最小后端 read-model，不先做复杂调度器。

合同建议：

- 在 AI runtime/list/detail 返回 `modelRouting` 或 `modelStatus`：
  - `activeModel`
  - `activeProvider`
  - `source`: `default | env | faction_config | player_config | fallback`
  - `strictJsonOnlyCapable`
  - `budgetTier`: `strict_action | economy_chat | disabled`
  - `fallbackEnabled`
  - `fallbackModel`
  - `lastFallbackReason`
  - `secretConfigured`: boolean
  - `secretSource`: 只能是 env 名称或 masked source，不显示 secret
- provider pool v1 只做 read-model + env/default 解析，不要立即做真正多供应商并发执行。
- 新增测试覆盖默认 Sonnet、env override、fallback 字段、无 secret 泄露。

验收：

- `npm run build`
- `npm run test:ai:runtime-model-target-contract`
- `npm run test:ai:player-http-core-contract`
- 必要时新增 `npx tsx server/tests/ai_player_provider_pool_read_model_contract.test.ts`

### Step 2：Patrol Scheduler 外部调度说明 / Ops Gate

正式口径：

- app 内 timer 默认关闭。
- 正式环境使用外部 scheduler/队列分片调用 `POST /api/ai/chat/patrol-scheduler/run`。
- ops gate 只验证：
  - 默认环境不会启动后台 timer。
  - HTTP runner 可按 `limit / factionId / aiPlayerIds / cooldownTicks / force=false` 运行。
  - cooldown 中的 AI 计入 skipped，不刷屏。
  - 输出不含 secret。

可新增：

- `server/src/evals/runAiPlayerPatrolSchedulerOpsGate.ts`
- package script：`gate:ai:patrol-scheduler-ops`
- docs 补一段生产部署建议：外部 cron/queue 每批 limit，按 faction/AI 分片，模型池限流。

验收：

- `npx tsx server/tests/ai_player_http_chat_patrol_tick_contract.test.ts`
- `npm run gate:ai:patrol-scheduler-ops`
- `npm run gate:ai:preflight`

### Step 3：输出给 UI 窗口的合同边界

不在本窗口改 UI，只确保 read-model 返回的字段足够 UI 窗口使用。

输出字段应覆盖：

- 模型：当前模型名、来源、是否 strict JSON action 模型、是否可 fallback。
- 预算：行动点、资源输送额度、模型预算档位或“未配置玩家自带 key”。
- 失败原因：最近失败原因 + 下一步建议，避免后端字段堆砌。

验收：

- HTTP/runtime/list/detail payload 有字段。
- contract test 覆盖字段和无 secret 泄露。
- 不需要 Godot 截图；截图归 UI 窗口。

### Step 4：风险项收敛

必须明确关闭或降级：

- 多模型高并发：本轮只做 provider pool read-model，不承诺生产级并发调度。
- secret：不写入仓库、日志、截图说明；只显示 configured/unconfigured。
- patrol：生产默认不启 app 内 timer，只保留外部 scheduler HTTP runner。
- UI：本窗口不改 AI 管理页，只提供字段；AI 管理页视觉归 UI 窗口。

## 最终输出格式

按以下四段输出：

- 通过项：列正式链和验证命令。
- 风险项：列还未生产化的多模型/调度/密钥/UI 风险。
- 阻塞项：列必须后续补的 provider pool 执行层、BYOK 分账、移动端 UI polish。
- 下一步：列 1-3 项。

必须列出：

- 改动文件
- 验证命令
- 是否更新 `docs/AI_PLAYER_AUTOMATION_ROLLING_STATUS_2026_04_26.md`
- secret 扫描结果

## 2026-04-27 后端窗口执行记录

- 已完成 provider pool/read-model v1：runtime list/detail 返回 `modelStatus`，不暴露 secret 或 `apiKeys`。
- 已完成 patrol scheduler 外部调度 gate：`npm run gate:ai:patrol-scheduler-ops`。
- 已更新 `docs/AI_PLAYER_AUTOMATION_ROLLING_STATUS_2026_04_26.md` 与 `docs/AI_PLAYER_RUNTIME_MODEL_STRATEGY_2026_04_27.md`。
- 正式验证已跑：`npm run build`、`npm run test:ai:runtime-model-target-contract`、`npm run test:ai:provider-pool-read-model-contract`、`npm run test:ai:player-http-chat-patrol-tick-contract`、`npm run gate:ai:patrol-scheduler-ops`、`npm run test:ai:player-http-core-contract`、`npm run gate:ai:preflight`。
- 本窗口未改 Godot AI 管理页布局、world-cell 视觉、武将页、native_slg_shell、Web 正式客户端或无关活动/国战页面。

## 2026-04-27 追加执行记录：Provider Execution / Patrol Queue

- 已接入 faction BYOK/model config 到 AI runtime proposal 执行层；优先级为 `faction_config -> env -> default`。
- 新增 `server/tests/ai_player_http_model_proposal_byok_contract.test.ts`，证明 `/model-proposals` 会实际请求 faction BYOK relay，且不泄露 key。
- patrol scheduler 合同增加 `shardIndex / shardCount / providerBudgetTier / providerBudgetMaxRuns`，response 返回 `shard / providerBudget`。
- `gate:ai:patrol-scheduler-ops` 已覆盖静态分片、provider budget disabled safe skip 和 cooldown safe skip。
- 仍不处理 Godot AI 管理页布局、world-cell 视觉、武将页、native_slg_shell、Web 客户端或无关活动/国战页。

## 2026-04-27 追加执行记录：runtime.modelStatus 真实字段

- `runtime.modelStatus` 已补齐 `byokSource / targetCount / candidateTargets`。
- `candidateTargets[]` 只返回安全元数据：`model / provider / source / byokSource / priority / isActive / fallbackCandidate / strictJsonOnlyCapable / budgetTier / lastFailureReason / secretConfigured / secretSource`，不返回 `apiKeys` 或 key 明文。
- provider target resolver 已按 `faction_config -> primary env -> optional LLM relay env -> default` 输出候选序列，`fallbackEnabled / fallbackModel` 不再硬编码。
- 模型 proposal 失败码会记录到 faction 级 `lastFallbackReason`，供 runtime list/detail read-model 消费。
- BYOK 分账、审计事件和玩家级 `player_config` 密钥管理仍是后续合同，不在 UI/Godot 窗口实现。
- 已验证：`npm run build`、`npm run test:ai:runtime-model-target-contract`、`npm run test:ai:provider-pool-read-model-contract`、`npm run test:ai:player-http-model-proposal-byok-contract`、`npm run test:ai:player-http-model-proposal-contract`。

## 2026-04-27 追加执行记录：Provider fallback / Queue v2 / BYOK split

- provider proposal 执行层已按候选 target 顺序 fallback；响应返回 `providerFallback.selectedProvider / failures`。
- BYOK fallback 合同已覆盖：faction BYOK target 返回 401 时，env candidate 接管成功；响应和 runtime read-model 均不泄露 key。
- patrol scheduler 外部 queue 已补 `queueRunId / idempotencyKey / leaseId / leaseTtlMs / backoffMs / retryAfterMs`。
- 同一 `idempotencyKey` replay 返回缓存结果，`queue.deduped=true`，不重复写巡查消息。
- BYOK billing / audit / player-level key management 已拆到 `docs/AI_PLAYER_BYOK_BILLING_AUDIT_PLAYER_KEY_CONTRACT_2026_04_27.md`；后续实现不要混入 Godot/UI 窗口。
- 已验证：`npm run build`、`npm run test:ai:player-http-model-proposal-byok-contract`、`npm run test:ai:player-http-model-proposal-contract`、`npm run test:ai:player-http-chat-patrol-tick-contract`、`npm run gate:ai:patrol-scheduler-ops`。

## 2026-04-27 追加执行记录：Provider accounting / Player BYOK CRUD

- `/api/ai/provider/player-keys/:ownerPlayerId` 已提供玩家级 key 的 `GET / POST / DELETE` 后端合同。
- 玩家级 key 持久化沿用 `FACTION_APIKEY_ENCRYPTION_KEY`，read-model 只返回 `keyFingerprint / secretConfigured / secretSource`，不返回 key 明文或 `apiKeys`。
- runtime target resolver 已接入 `player_config -> faction_config -> env -> default`；玩家级 key 优先于势力级 key。
- provider 请求成功会写 billing ledger；fallback/失败会写 audit event；查询入口为 `/api/ai/provider/billing-ledger` 与 `/api/ai/provider/audit-events`。
- 新增正式验证：`npm run test:ai:provider-accounting-contract`；并已纳入 `npm run gate:ai:preflight`。
- 本窗口仍未改 Godot AI 管理页布局、world-cell 视觉、武将页、native_slg_shell、正式 Web 客户端或活动/国战页。

## 新窗口开场提示词

复制下面整段到新窗口：

```text
你接手 C:\Users\26739\Desktop\8989 的 AI 玩家 provider pool / patrol ops 任务。先读 AGENTS.md、docs/AGENTS_EXECUTION_CURRENT_2026_04.md、CODEX.md、docs/AI_PLAYER_AUTOMATION_ROLLING_STATUS_2026_04_26.md、docs/AI_PLAYER_RUNTIME_MODEL_STRATEGY_2026_04_27.md、docs/AI_PLAYER_PROVIDER_POOL_AND_AI_PANEL_NEXT_WINDOW_PROMPT_2026_04_27.md，然后 git status --short。只允许做 AI provider pool/read-model、patrol scheduler 外部调度 gate、backend/shared contract 和正式验证。不碰 Godot AI 管理页布局、不碰 godot-client/scripts/ui/ai_panel.gd、不碰 godot-client/scripts/ui/presenters/ai_panel_presenter.gd、不碰 godot-client/scenes/ui/ai_panel.tscn，不碰 world-cell 视觉、武将页、native_slg_shell 大改、Web 正式客户端、无关活动/国战。每轮保护其他窗口改动，不回退无关文件。目标是完成：1）每个 AI 显示当前模型来源、预算、fallback 状态；2）patrol scheduler 补外部调度说明或 ops gate，app 内 timer 默认关闭；3）向 UI 窗口提供模型/预算/失败原因 read-model 字段，不做 UI。必须跑 npm run build、相关 npx tsx contract、npm run gate:ai:preflight。涉及中文文件修改后 UTF-8 回读校验，扫描 touched files 不得包含任何 secret。最终按 通过项 / 风险项 / 阻塞项 / 下一步 输出，并列改动文件、验证命令。
```
