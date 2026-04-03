# 12 - Unity Integration Acceptance

本页是 Unity 集成的统一验收页。它把 01-11 的文档链路收束为可验收条目，并用正式入口命令对关键运行链路做复核。

## 通过项

### 01. Session / Auth / Runtime
- 读取文档：`docs/unity/01-session-and-runtime.md`
- 相关正式入口：`POST /api/session/join`、`POST /api/session/heartbeat`、`POST /api/session/leave`、`GET /api/session/status`、`GET /api/session/metrics`、`GET /api/session/runtime`、`POST /api/session/autonomy`
- 验收结论：通过
- 说明：Unity-first 会话、token、自治等级、runtime 视图的链路已经形成统一入口，适合作为前台接入基线。

### 02. World Action Calls
- 读取文档：`docs/unity/02-world-actions.md`
- 相关正式入口：`POST /api/world/action`、`GET /api/world`
- 验收结论：通过
- 说明：`queuePlanExecution`、`advanceTick`、`clearPlanExecution`、`moveUnit` 的契约清晰，满足 Unity 侧调用与规则引擎裁决分离的要求。

### 03. AI Config and Doctrine
- 读取文档：`docs/unity/03-ai-config-and-doctrine.md`
- 相关正式入口：`GET /api/ai/config?factionId=player`、`POST /api/ai/config`、`GET /api/ai/models`、`GET /api/session/runtime`
- 验收结论：通过
- 说明：Doctrine 与模型配置同步写入的链路明确，且当前 Unity 正式路径只面向 `player` 势力。

### 04. Heartbeat and Failover
- 读取文档：`docs/unity/04-heartbeat-and-failover.md`
- 相关正式入口：`npm run test:session:manager`、`npm run start:clock`
- 验收结论：通过
- 说明：L1 / L2 / L3 自治状态机、超时降级、恢复与 stale prune 的行为边界明确。

### 05. Governance Layer (CommBus / Court / Agenda)
- 读取文档：`docs/archive/modules_legacy_2026_03_25/MOD-05_governance-commbus-court.md`
- 相关正式入口：`POST /api/world/action`（previewDomainAgenda / previewNationalAgenda / previewCourtSession）、`GET /api/comm-bus/national-agenda`、`GET /api/court/session/latest`
- 验收结论：通过
- 说明：虽然不在 Unity 前台文档目录里，但它是治理层与战报/议程展示的关键后端支撑。

### 06. C# DTO World
- 读取文档：`docs/unity/06-csharp-dto-world.cs`
- 相关正式入口：`POST /api/world/action`
- 验收结论：通过
- 说明：Unity 侧 DTO 枚举、请求体、计划结构与后端 action 名称对齐，适合作为客户端类型契约基线。

### 07. C# Client Skeleton
- 读取文档：`docs/unity/07-csharp-client-skeleton.cs`
- 相关正式入口：`POST /api/session/join`、`POST /api/session/heartbeat`、`GET /api/session/runtime`、`POST /api/session/autonomy`、`POST /api/world/action`
- 验收结论：通过
- 说明：UnityWebRequest 客户端骨架已经覆盖会话、自治和世界动作的主要调用路径。

### 08. HTTP API Gateway and Route Dispatch
- 读取文档：`docs/archive/modules_legacy_2026_03_25/MOD-08_http-api-gateway.md`
- 相关正式入口：`npm run server:dev`、`GET /api/health`、`POST /api/world/action`
- 验收结论：通过
- 说明：HTTP 路由分发和统一 action 入口是 Unity 集成的总闸门，当前约定清晰。

### 09. Observability, Replay, and Live Streams
- 读取文档：`docs/archive/modules_legacy_2026_03_25/MOD-09_observability-replay-streaming.md`
- 相关正式入口：`GET /api/events`、`GET /api/events/stream`、`GET /api/narratives`、`GET /api/replay/archive`、`GET /api/replay/:id`、`GET /api/replay/rag-cache`、`WS /ws`
- 验收结论：通过
- 说明：战报、叙事、回放和流式调试能力已纳入统一验收范围，适合后续 UI 和 AI 回读。

### 10. AI Config and Model Gateway
- 读取文档：`docs/archive/modules_legacy_2026_03_25/MOD-10_ai-config-model-gateway.md`
- 相关正式入口：`GET /api/ai/config`、`POST /api/ai/config`、`GET /api/ai/models`、`GET /api/ai/logs`
- 验收结论：通过
- 说明：模型发现、配置保存、gateway 优先级与重试/超时策略已经构成可验收后端能力。

### 11. MCP Server Integration
- 读取文档：`docs/archive/modules_legacy_2026_03_25/MOD-11_mcp-server-integration.md`
- 相关正式入口：`npx tsx server/src/mcp/gameServer.ts`
- 验收结论：通过
- 说明：MCP 工具暴露与编程助手对接链路已纳入正式入口，适合做 AI 编程助手联调与状态查询。

### 正式验证记录
- 验证命令：`npm run test:session:manager`
- 结果：通过
- 覆盖范围：L1 -> L2 超时切换、心跳恢复、L3 手动切换、stale session 清理、token 校验、metrics 统计
- 结论：会话与自治主链路满足 Unity 集成验收的最低正式标准。

### 正式回归基线（AI Quota Realtime E2E）
- Unity 菜单入口：`SLG/Validate/AI Quota Realtime E2E Screenshot`
- Batch 入口（CI / 命令行）：`Unity.exe -batchmode -projectPath "<repo>/My project" -executeMethod "SLGCommander.EditorDiagnostics.AiQuotaRealtimeHudE2EValidator.RunBatch"`
- 通过日志关键字（PASS）：`[AiQuotaRealtimeHudE2EValidator] PASS end-to-end: subscribed -> diagnostic emitted -> HUD updated -> screenshot captured`
- 产物路径基线：`tmp/unity/youzhou-map-*.png`
- 验收结论：通过日志关键字 + 产物落地两者同时满足，判定本条 E2E 回归通过。

### CI 前置清理建议（避免 Scene Backup 阻塞 Batch）
- 背景：Unity 在异常退出后可能留下 Scene Backup，并在下次 `-batchmode` 启动时触发恢复流程，阻塞 `-executeMethod`。
- 建议在 CI 跑 `RunBatch` 前先清理以下目录（存在才删）：
  - `My project/Temp/__Backupscenes`
  - `My project/Assets/_Recovery`
- PowerShell 示例（CI 前置步骤）：
  - `if (Test-Path "My project/Temp/__Backupscenes") { Remove-Item -Recurse -Force "My project/Temp/__Backupscenes" }`
  - `if (Test-Path "My project/Assets/_Recovery") { Remove-Item -Recurse -Force "My project/Assets/_Recovery" }`
- 建议执行顺序：前置清理 -> `RunBatch` -> 读取 PASS 关键字与 `tmp/unity/youzhou-map-*.png` 产物。

### 分支保护建议（Required Check）
- 建议将该 E2E 检查设为受保护分支的 Required status check。
- 推荐 check 名称：Phase 5 Hardening Gate / unity-quota-e2e-baseline（以仓库实际显示名称为准）。
- 合并门槛建议：该 check 必须为 success 才允许合并到主分支。

## 风险项

- `05 / 08 / 09 / 10 / 11` 依赖的是后端基础设施与旧版归档文档，若路由名、契约或入口命令后续调整，需要同步回收本页的验收描述。
- `06 / 07` 属于 Unity C# 侧契约样例，若后端 `WorldActionType`、会话返回结构或自治字段漂移，客户端骨架会优先失配。
- `09` 的 replay / stream 能力对连接稳定性和限流要求更高，适合集成验收但不适合在高频写入路径上放大响应体。
- `10` 的模型发现与优先级策略如果继续扩展，需要避免 Commander / General 两条链路出现不一致的默认模型。

## 阻塞项

- 当前无阻塞项。
- 说明：现阶段已经有可复用的正式命令验证会话与自治链路，Unity 集成页可以继续作为单页验收入口，不需要额外拆分临时脚本。

## 下一步

1. 将本页作为 Unity 集成变更的唯一验收门槛。
2. 任何涉及 session、world action、AI config、replay、MCP 的改动，都先回看对应编号条目，再更新本页。
3. 每次修改后优先复跑 `npm run test:session:manager`；如果改到 HTTP 网关或模型链路，再补跑对应正式入口。
4. 如果后续需要扩展 Unity 前台，把新增入口继续按 `12` 页的结构追加，不要另起分散的验收说明。


## 13. Contract Sync Gate (Mandatory)

- Required local command before merge: `npm run gate:contracts:unity`
- Scope:
  - TS contract sources: `shared/contracts/game/world.ts`, `shared/contracts/game/ws.ts`
  - Unity DTO source: `My project/Assets/Scripts/Data/GameModels.cs`
- Validation mode: nested + fail-fast
  - Includes nested paths such as `Unit.hero`, `Unit.hero.signatureSkill`, `WsTickDeltaMessage.unitChanges[].data`.
  - WorldState checks are key-block whitelist based (not full hard-lock), covering:
    - `WorldState` root key fields
    - `WorldState.map`, `WorldState.map.tiles[]`, `WorldState.map.regions[]`
    - `WorldState.factions{}`, `WorldState.units[]`
  - Stops at first mismatch and exits non-zero.
- CI enforcement:
  - Workflow step in `.github/workflows/phase5-hardening-gate.yml` runs `npm run gate:contracts:unity`.
- Team rule:
  - Any TS contract field change that impacts Unity DTO must include one successful gate run result in the task delivery note.

## 14. Render Profile + RenderGate (Mandatory For Isometric Rendering)

- Profile switch entry:
  - `YouZhou/Profiles/Apply Medieval Pack Profile (90x52, 0.51966)`
  - `YouZhou/Profiles/Apply Nature Profile (292/122 -> 0.418)`
- RenderGate entry:
  - `YouZhou/RenderGate/Run`
  - `YouZhou/RenderGate/Set Baseline`
  - `YouZhou/RenderGate/Open Output Folder`
- RenderGate artifacts:
  - `tmp/rendergate/latest.png`
  - `tmp/rendergate/baseline.png`
  - `tmp/rendergate/diff.png`
  - `tmp/rendergate/report.json`
- Acceptance rule:
  - For visual-layer changes, include one RenderGate report (`status`, `mae`, `changedRatio`) in delivery notes.
