# AI 玩家后端交接文档（2026-04-20）

> 新增沉淀入口：
> `docs/AI_PLAYER_BACKEND_KNOWLEDGE_GRAPH_2026_04_20.md`
> `shared/contracts/aiPlayerKnowledgeGraph.ts`
> `server/src/application/ai/aiPlayerActionCatalog.ts`
> `server/src/application/ai/aiPlayerProposalExecution.ts`
> `server/src/application/ai/aiPlayerGovernanceState.ts`
> `server/src/application/ai/aiPlayerGovernancePersist.ts`
> `server/src/application/ai/aiPlayerGovernanceRuntimeView.ts`
> `server/src/application/ai/aiPlayerProposalLifecycle.ts`
> `server/src/application/ai/aiPlayerGovernanceEvents.ts`
> `GET /api/ai/knowledge-graph`
> MCP `get_ai_player_knowledge_graph`
> `server/src/mcp/registerAiPlayerTools.ts`
> `server/src/routes/aiPlayerKnowledgeGraphRoute.ts`
> `server/src/routes/aiPlayerProposalRoutes.ts`
> `server/src/routes/aiPlayerRuntimeRoutes.ts`
> 这份文档现在是 AI 玩家后端动作收口、authority 对照、验证入口、避免重做事项的最新口径。
> 本文里较早阶段的动作状态如与该文档冲突，以知识图谱文档为准。

## 1. 当前权威事实

- AI 玩家真正的权威写链仍是：
  `SessionManager -> WorldService -> shared/domain/rules.ts -> commitWorldState -> world events / civil memory / WebSocket`
- `autonomy/control` 的最终权威仍在 `SessionManager`。
- `agenda/execution/context` 的最终权威仍在 `WorldState.slgDomainState.aiStateByFaction`。
- `/api/events` 仍只是日志，不是主状态 selector。
- 当前真正的系统瓶颈仍是单进程 `world mutation lock + WorldService + SessionManager + GameWebSocket`，不是 UI。

## 2. 这条线已经做出的东西

### 2.1 权威合同与动作回执

- 已补齐 AI runtime 权威读口：`GET /api/observability/ai-runtime`
- 已补齐 `requestId / failureCode / execution` 等结构化动作回执
- 已补齐 `recentFailures / lockConflicts / advanceTickPerformance`
- 已补齐 MCP 读面：
  - `get_ai_runtime_observability`
  - `get_civil_memory_entries`
  - AI 玩家治理 MCP 工具
  - `get_ai_player_knowledge_graph`
    说明：
    - 支持 `json / obsidian` 双视图
    - `obsidian` 只是 Markdown 镜像导出，不是权威 source of truth

### 2.2 AI 玩家治理骨架

- 已新增正式共享合同：
  - `shared/contracts/aiPlayer.ts`
  - `shared/schemas/aiPlayer.ts`
- 已新增治理服务：
  - `server/src/application/ai/AIPlayerGovernanceService.ts`
    说明：
    - 现在是 facade，保留 routes/MCP/tests 依赖的公开 API
    - 不再承接 resolver、persist、runtime read-model 细节
  - `server/src/application/ai/aiPlayerProposalExecution.ts`
    说明：
    - resolver + world action execute 细节现在收口在这个模块
  - `server/src/application/ai/aiPlayerProposalLifecycle.ts`
    说明：
    - proposal create/list/get/approve/reject/execute 生命周期现在收口在这个模块
  - `server/src/application/ai/aiPlayerGovernancePersist.ts`
    说明：
    - persist/restore/receipt storage/health 现在收口在这个模块
  - `server/src/application/ai/aiPlayerGovernanceRuntimeView.ts`
    说明：
    - runtime detail / observability read-model 现在收口在这个模块
  - `server/src/application/ai/aiPlayerGovernanceState.ts`
    说明：
    - governed players / proposals / receipts 的共享 Map 和小工具在这里
  - `server/src/application/ai/aiPlayerGovernanceEvents.ts`
    说明：
    - governance event append wrapper 在这里
- 已新增 HTTP route：
  - `server/src/routes/aiPlayer.ts`
  - `GET /api/ai/knowledge-graph`
- 已新增 MCP 工具：
  - `list_ai_player_action_catalog`
  - `get_ai_player_knowledge_graph`
  - `list_governed_ai_players`
  - `register_governed_ai_player`
  - `get_ai_player_runtime`
  - `pause_ai_player`
  - `resume_ai_player`
  - `propose_ai_player_action`
  - `get_ai_player_proposals`
  - `approve_ai_player_proposal`
  - `execute_ai_player_proposal`
  - `get_ai_player_recent_receipts`

### 2.3 AI 玩家动作目录：当前已正式化到 v1 的动作

- 已打通成功链：
  - `city_upgrade -> upgradeCity`
  - `building_upgrade -> promoteCityBuilding`
  - `queue_fill_idle_slot -> enqueueAffair`
  - `research_start -> upgradeCityTech`
  - `troop_train -> deployReserveHero`
  - `troop_facility_upgrade -> promoteTroopFacilityBuilding`
  - `recruit_pool_select -> setRecruitSelectedPool`
  - `world_scout -> queuePlanExecution`
  - `march_move -> moveUnit`
  - `garrison_set -> queueTacticalOverride(template=garrison)`
  - `general_focus_set -> setGeneralActiveHero`
  - `formation_assign -> setGeneralTactic`
  - `threat_escape -> queueAiAgendaAction`
  - `alliance_help -> allianceHelp`
  - `reward_claim -> claimReward`
- `recruit_commander` 已不再只是 failure 样本：
  - `recruit_commander -> recruitProspectHero`
  说明：
  - 当前 baseline 已固定成“先 success、再保留结构化 failure”双样本
  - `recruit_commander` success 样本必须发生在任何 `advanceTick` 之前，否则 `prospectHeroIds` 会被自动消耗

### 2.4 proposal 参数治理

- `AiPlayerActionProposal.args` 已从自由对象收成 action-specific schema
- 当前已正式 action-specific 的 args：
  - `city_upgrade`
  - `building_upgrade`
  - `queue_fill_idle_slot`
  - `research_start`
  - `troop_train`
  - `troop_facility_upgrade`
  - `recruit_pool_select`
  - `recruit_commander`
  - `world_scout`
  - `march_move`
  - `garrison_set`
  - `general_focus_set`
  - `formation_assign`
  - `threat_escape`
  - `alliance_help`
  - `reward_claim`
- 坏参数现在在 proposal 创建期就会 `422`，而不是拖到执行期才炸

### 2.5 world-action template / template replay

- 已补模板：
  - `upgrade_first_city_tech`
  - `upgrade_first_city_building`
  - `enqueue_first_city_affair`
  - `recruit_first_commander`
- `runAiMainlineStabilityGate` 的 template replay 已覆盖：
  - `clear_plan_execution`
  - `preview_national_agenda`
  - `preview_court_session`
  - `move_first_unit`
  - `enqueue_first_city_affair`
  - `upgrade_first_city_building`
  - `advance_tick_recharge`
  - `upgrade_first_city_tech`
  - `tactical_override_first_unit`
  - `advance_tick`

## 3. 本轮关键修改文件

- `shared/contracts/aiPlayer.ts`
- `shared/schemas/aiPlayer.ts`
- `server/src/application/ai/AIPlayerGovernanceService.ts`
- `server/src/mcp/gameServer.ts`
- `server/src/evals/runAiMainlineStabilityGate.ts`
- `server/tests/ai_player_http_contract.test.ts`

## 4. 本轮正式验证结果

### 已通过

- `npm run gate:ai:preflight`
- `npm run build`
- `npm run test:ai:knowledge-graph`
- `npm run test:ai:knowledge-graph:http-contract`
- `npm run test:ai:knowledge-graph:mcp`
- `npm run test:ai:player-http-contract`
- `npm run gate:ai:runtime-capacity`
- 隔离环境下的 `npm run gate:ai:mainline:stability`

## 5. 新窗口必须知道的环境坑

### 5.1 mainline gate 容易吃到旧持久化大状态

- 如果直接跑 `gate:ai:mainline:stability`，可能读到上轮留下的大 world persist，触发：
  - `Data cannot be cloned, out of memory`
- 正式可复用做法：
  给 mainline gate 注入隔离环境变量后再跑：

```powershell
$ts=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$env:WORLD_PERSIST_ROOT="C:\Users\26739\Desktop\8989\tmp\gate_mainline_world_$ts"
$env:SESSION_STATE_PERSIST_PATH="C:\Users\26739\Desktop\8989\tmp\gate_mainline_session_$ts.json"
$env:NODE_OPTIONS='--max-old-space-size=4096'
npm run gate:ai:mainline:stability
```

### 5.2 `start:clock` 在这台机上有环境问题

- 直接跑 `npm run start:clock` 可能报：
  - `cross-env` not found
- 需要本地起后端给 `gate:godot:week1` 用时，优先改成：

```powershell
cmd /c "set GAME_CLOCK_ENABLED=1&& npx tsx server/src/app.ts"
```

### 5.3 重型验证要串行跑

- 不要并行跑：
  - `runtime-load`
  - `runtime-capacity`
  - `mainline-stability`
  - `godot:week1`
- 先跑一条，结束后再跑下一条

## 6. 当前未解决的问题

- 单进程 `WorldService + SessionManager + GameWebSocket` 仍是系统硬瓶颈
- `setAiContextFocus` 已经有显式 `defer` 结论；没有新的业务语义前，不要再重复把它包装成 AI 原子动作
- `transferFactionResourcesToGovernor` 已登记为资源输送 deferred candidate；当前不是已有 world action，不能直接新增 AI 玩家白名单动作
- 资源输送 UI 交接只看 `docs/AI_PLAYER_RESOURCE_TRANSFER_AUTHORITY_HANDOFF_2026_04_21.md`，不要先改 Godot UI 结算逻辑
- `godot:week1` 仍依赖外部后端进程，不是自举 gate
- `cross-env` 缺失仍未修

## 7. 新窗口建议继续推进的方向

### 第一优先级

- 先补正式验证：
  - `npm run gate:ai:preflight`
  - `npm run gate:ai:runtime-capacity`
  - 必要时再复跑隔离环境下的 `npm run gate:ai:mainline:stability`
  - 如需 Godot 复核，再手动起后端后跑 `npm run gate:godot:week1`

### 第二优先级

- 继续扩玩家原子动作，但只接已有权威 world action
- 优先做“知识沉淀/API/MCP 读面/守门增强”，不要为了凑动作数硬接语义发虚的 authority
- 原则：
  先找权威 world action 或明确后端落点，再补 AI 玩家合同

## 8. 严格不要做的事情

- 不要碰 `godot-client/scenes/ui/**`
- 不要改 battle report 布局
- 不要改主壳按钮样式
- 不要把前端展示状态当成 AI 玩家权威状态

## 9. 给新窗口的提示词

复制下面这段去新窗口：

```text
AI 玩家窗口提示词（2026-04-20 / 新窗口续作）

你现在是 8989 项目的 AI 玩家 / 后端系统专线 窗口。
你的目标不是做 UI 结构设计；你的目标是继续把 AI 玩家这条线的权威合同、玩家原子动作、执行链、预算、观察性、失败路径、共享状态收口清楚。

仓库根：C:\Users\26739\Desktop\8989
Godot 项目根：C:\Users\26739\Desktop\8989\godot-client

你必须严格遵守以下边界：
- 不要主动做主壳布局、战报布局、按钮位置、SVG 图标等 UI 设计
- 你优先修改：
  - server/src/**
  - shared/**
  - 必要时的 godot-client/scripts/app/adapters/**
  - 必要时的 godot-client/scripts/ui/presenters/ai_panel_presenter.gd
- 如果问题本质是 UI 结构问题，只记录，不顺手去做

开始工作前必须按这个顺序读取：
1. AGENTS.md
2. docs/AGENTS_EXECUTION_CURRENT_2026_04.md
3. CODEX.md
4. docs/NATIVE_SLG_MAINLINE_INDEX.md
5. docs/AI_QUICK_NAV_INDEX_2026_04_10.md
6. docs/AI_PLAYER_WINDOW_HANDOFF_2026_04_20.md

然后重点读：
- shared/contracts/aiPlayer.ts
- shared/schemas/aiPlayer.ts
- server/src/application/ai/AIPlayerGovernanceService.ts
- server/src/mcp/gameServer.ts
- server/src/evals/runAiMainlineStabilityGate.ts
- server/tests/ai_player_http_contract.test.ts
- server/src/application/world/WorldService.ts
- shared/contracts/game/world.ts
- shared/domain/rules.ts

你必须先确认这些代码事实：
- AI 玩家真正的权威写链仍是 SessionManager -> WorldService -> shared/domain/rules.ts -> commitWorldState
- 当前 v1 已正式化的玩家动作有：
  city_upgrade / building_upgrade / queue_fill_idle_slot / research_start / recruit_commander / march_move / garrison_set
- recruit_commander 当前在 baseline 世界里走的是结构化 failure 验证，不是 baseline success
- world-action template 已新增：
  upgrade_first_city_building / enqueue_first_city_affair / recruit_first_commander

你现在的第一优先级不是扩 UI，而是先补正式验证：
1. 串行跑 `npm run gate:ai:runtime-capacity`
2. 如需复跑 mainline，请用隔离环境，避免旧 persist 大状态导致：
   Data cannot be cloned, out of memory

mainline gate 的正式跑法：
$ts=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$env:WORLD_PERSIST_ROOT="C:\Users\26739\Desktop\8989\tmp\gate_mainline_world_$ts"
$env:SESSION_STATE_PERSIST_PATH="C:\Users\26739\Desktop\8989\tmp\gate_mainline_session_$ts.json"
$env:NODE_OPTIONS='--max-old-space-size=4096'
npm run gate:ai:mainline:stability

如果需要本地起后端给 Godot gate 用，不要用 start:clock，优先改成：
cmd /c "set GAME_CLOCK_ENABLED=1&& npx tsx server/src/app.ts"

当前继续推进方向：
- 先补完 runtime-capacity 的正式验证
- 再继续扩玩家原子动作，但只接已有权威 world action
- 建议优先调查：
  troop_train / world_scout / alliance_help / reward_claim
- 继续保持：
  proposal args 必须 action-specific
  proposal 创建期就校验
  executor 必须走 WorldService 权威写链
  receipt 必须带 worldAction / failureCode / execution

输出要求：
- 每轮输出必须包含：
  - 全文搜索后确认的后端事实
  - AI 玩家当前真正的阻塞点
  - 你改了哪些权威合同/动作链
  - 你没有碰哪些 UI 结构边界
  - 你跑了哪些正式验证

你现在开工时的第一句话应该是：
“我先按交接文档和代码复读当前 AI 玩家权威链与已落地动作，再补跑 runtime-capacity 正式门禁，然后继续扩玩家原子动作，不碰 UI。”
```
