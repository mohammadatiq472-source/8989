# 后端 AI 逻辑深读（Batch2，2026-04-09）

## 0. 文档定位

这份文档用于接续 Week2 收尾，给后续子代理提供“函数级、可执行”的后端 AI 现状基线。  
目标不是复述旧提示词，而是明确：

1. 当前主链调用顺序（真实代码路径）。
2. 每个 AI 模块的边界、状态、风险。
3. 哪些点 AI 可以继续自动推进，哪些必须人工把关。

---

## 1. 本轮读取范围（代码为主）

### 1.1 核心入口

- `server/src/app.ts`
- `server/src/application/clock/GameClock.ts`
- `server/src/application/world/WorldService.ts`
- `server/src/application/planning/PlanningService.ts`

### 1.2 Agent 主链

- `server/src/agents/commander/CommanderAgent.ts`
- `server/src/agents/general/GeneralAgent.ts`
- `server/src/agents/general/GeneralUtilityAI.ts`
- `server/src/agents/general/GeneralLLMAdapter.ts`
- `server/src/agents/general/GeneralProfileStore.ts`
- `server/src/agents/general/GeneralNegotiationChannel.ts`
- `server/src/agents/reflect/ReflectService.ts`
- `server/src/agents/memory/MemoryStore.ts`
- `server/src/agents/memory/CivilMemoryStore.ts`

### 1.3 治理 / 通信 / 会话 / 同步

- `server/src/agents/commBus/DomainCommBus.ts`
- `server/src/agents/commBus/AgendaCompiler.ts`
- `server/src/agents/court/CourtService.ts`
- `server/src/multiplayer/SessionManager.ts`
- `server/src/ws/GameWebSocket.ts`
- `server/src/application/v2/V2GameService.ts`
- `server/src/routes/observability.ts`
- `server/src/routes/ai.ts`
- `server/src/mcp/gameServer.ts`
- `server/src/evals/runAiMainlineStabilityGate.ts`

---

## 2. 当前主链（函数级调用顺序）

## 2.1 自动时钟链（L2/L3 托管）

1. `GameClock._onTick()`
2. `sweepAllTimeouts()`（Session 超时退化）
3. `_autoplanL2Factions()`（仅自动势力）
4. `createPlanningResult()`（PlanningService）
5. `createCommanderPlan()`（Commander）
6. `queuePlanExecutionAction()`（WorldService）
7. `runGeneralDispatch()`（General）
8. `advanceTickAction()`（WorldService）

## 2.2 Tick 执行闭环（Authoritative）

1. `runDomainCommWindow()`（Domain 消息窗口）
2. `compileNationalAgendaForCurrentWorld()`（National Agenda）
3. `runCourtSession()`（Court 决议）
4. `advanceTick()`（`shared/domain/rules.ts` 规则裁决）
5. `syncV2StateWithWorld()` + `settleResourcesForAllPlayers()` + `syncWorldFactionResourcesFromV2()`
6. `reflectWorldTick()`（叙事 + 记忆 + 将领反馈）
7. `recordExecutionOutcomeMemory()`（Civil Memory）
8. `broadcastTickDelta()` + `broadcastBattleReport()`
9. `appendWorldEvent(action='advance_tick')`

结论：当前后端已经形成 **Planning -> Dispatch -> Rule Execute -> Reflect -> Observability** 的可运行闭环，不是概念原型。

## 2.3 本轮增量深读（函数级注意点）

1. `CommanderAgent.createCommanderPlan` 先 `memory.search` 再规划，再走 `guardPlan`，最后 `memory.add`，因此“记忆召回失败”不会阻塞规划主链，只会降级为无 recall（`safeRecall/safeRemember`）。
2. `GeneralAgent.runGeneralDispatch` 是“UtilityAI 主路径 + LLM 条件增强”：
   - Tier 门控在 `GeneralLLMAdapter.shouldCallGeneralLLM`。
   - 全局信号量 `LLM_GENERAL_CONCURRENCY` 防止将领 LLM 洪泛。
   - LLM 失败/超时后自动保留 UtilityAI 决策，不中断 dispatch。
3. `ReflectService.reflectWorldTick` 当前已做并发写记忆（`Promise.allSettled`），并将失败计入 `memoryWriteFailures`，不会因单条写失败卡住 tick。
4. `WorldService.queuePlanExecutionAction` 入口已统一套 world mutation lock，且失败分类会写进 `queuePlanFailureStats/queuePlanConflictStats`，对后续回放和告警有直接价值。
5. `WorldService.advanceTickAction` 把 `domain->agenda->court->rules->v2 sync->reflect->ws` 全链串在同一锁内，保证 authoritative 顺序，但也意味着慢点位会直接拉长 tick。
6. `MemoryStore` 的 Mem0 适配做了多签名兼容和超时保护；未配 `MEM0_API_KEY` 时明确退化为 in-memory，并通过 diagnostics 暴露降级状态。
7. `GameClock._planForFaction` 已有 enqueue busy 重试（指数退避），可减少自动 tick 与人工 API 并发时的丢单概率。

---

## 3. 模块现状总表（面向继续开发）

| 模块 | 关键文件 | 当前状态 | 主要风险 | 人工把关点 |
| --- | --- | --- | --- | --- |
| Commander Guard | `CommanderAgent.ts` | 已有 `guardPlan`、非法命令过滤、fallback recon | Guard 规则需随玩法变化同步，不然会“过度过滤” | Guard 策略变更需人工评审 |
| Planning 严格/回退 | `PlanningService.ts` | `PLANNER_GATEWAY_STRICT` 默认严格；失败可回退 mock（非 strict） | strict 打开时网关异常会直接中断规划 | 线上 strict 开关策略需人工定版 |
| General Dispatch | `GeneralAgent.ts` | UtilityAI 主导 + LLM 增强门控 + 并发信号量 | 大图下若误开高并发/高 refinement 可能放大成本 | 并发、LLM 开关与容量上限需人工压测 |
| General UtilityAI | `GeneralUtilityAI.ts` | 已有供给/兵力/风险/专长调制 + HPA* 可达性 | 策略偏置易造成“过保守/过激进” | 新行为上线前需人工抽样战报 |
| General LLM Adapter | `GeneralLLMAdapter.ts` | Tier 门控，8s 超时降级，JSON 强约束 | 模型响应漂移、供应商变化导致 parse 失败 | 提示词与 schema 变更需人工回归 |
| 将领档案漂移 | `GeneralProfileStore.ts` | 忠诚/信任/grievance 漂移 + 分势力文件持久化 | 参数过敏感会导致角色状态震荡 | 漂移权重需人工调参 |
| 战场协商链 | `GeneralNegotiationChannel.ts` | inbox 持久化 `tmp/general_negotiation_inbox.json` | 仍是单机文件态；多实例一致性不足 | 分布式前必须人工设计存储升级 |
| Reflect 闭环 | `ReflectService.ts` | battle/report/alliance 统一叙事，写 commander+general memory | 事件语义与玩法扩展耦合高 | 叙事分类和因果规则需人工审阅 |
| Memory Provider | `MemoryStore.ts` | Mem0 + 多签名兼容 + in-memory fallback + diagnostics | 未配 MEM0 时降级到 in-memory（重启不保） | 生产环境需人工确认 Mem0 可用性与配额 |
| Civil Memory Ledger | `CivilMemoryStore.ts` | 链式 hash 完整性校验 + 持久化 | 文件损坏/并发恢复策略仍偏单机 | 灾备与回滚需人工定义 |
| Session Autonomy | `SessionManager.ts` | L1/L2/L3 + `controlMode` 输出稳定 | token 会话模型偏轻量（非完整账号） | 上线前鉴权体系需人工补齐 |
| WS 可观测 | `GameWebSocket.ts` | `wsStats` + recentErrors + faction 订阅校验 | 高并发下仅内存统计；无外部聚合 | 线上监控接入需人工实现 |
| V2 同步层 | `V2GameService.ts` | world<->v2 资源/地块/同盟快照同步 + `tmp/v2_game_state.json` 持久化 | 仍是单机文件态，暂无多实例一致性 | 分布式场景需人工落库/锁策略 |
| Save Slot | `WorldService.ts` | `save/load slot` 已落盘并支持启动恢复 | 单机文件态，尚未做跨实例一致性 | 多实例部署前需人工定存储策略 |
| AI Observability API | `routes/ai.ts` | `/api/ai/logs` 已输出 strict/fallbackCause | fallbackCause 推断依赖文本规则 | 文本规范需人工维护 |
| MCP Server | `mcp/gameServer.ts` | 独立进程 HTTP 回源，工具输出截断防爆 | 依赖后端可用；无离线缓存 | 生产调用配额和安全边界需人工审定 |
| 持久化健康诊断 | `app.ts` + `*ConfigStore.ts` | `/api/health.persistence` + startup 分级告警已接入 | 目前告警口径偏运维，尚未接报警系统 | 需人工定义告警阈值与值班流程 |

---

## 4. 持久化/非持久化矩阵（当前真实情况）

| 领域 | 位置 | 持久化状态 | 说明 |
| --- | --- | --- | --- |
| 世界快照 | `tmp/world_snapshot.json` | 已持久化 | `worldPersistencePaths.ts` |
| 叙事事件 | `tmp/narrative_events.json` | 已持久化 | 反思产物可重启恢复 |
| 将领档案 | `tmp/general_profiles/*.json` | 已持久化 | 分势力写入 |
| 将领协商 inbox | `tmp/general_negotiation_inbox.json` | 已持久化 | debounce + 原子 rename |
| Court 会话 | `tmp/court_sessions.json` | 已持久化 | deadlock guard 依赖历史 |
| Civil Memory | `tmp/civil_memory_ledger.json` | 已持久化 | 带 integrity 链 |
| 将领聊天 | `tmp/general_chats/*.json` | 已持久化 | GeneralChatService |
| Session 在线态 | `tmp/session_state.json` | 已持久化（最小边界） | 支持重启恢复 `token/seat/autonomy`；仍为轻鉴权模型 |
| Doctrine/ModelConfig | `tmp/faction_configs.json` | 已持久化 | 支持 version/legacy 兼容、损坏隔离、BYOK apiKey 加密落盘 |
| AI Hub Config | `tmp/ai_hub_configs.json` | 已持久化 | 支持 version/legacy 兼容与损坏隔离 |
| V2 玩家/同盟 | `tmp/v2_game_state.json` | 已持久化 | 支持 version/legacy 兼容、结构清洗与损坏隔离 |
| Save Slots | `tmp/world_save_slots.json` | 已持久化 | 支持启动恢复、debounce 原子写入、损坏文件隔离；已纳入 runtime/nightly 体积阈值观测（soft/hard） |

---

## 5. 风险分级（面向下一批）

## 5.1 高风险（先处理）

1. Session 在线态已可恢复，但 token 仍是轻鉴权模型，跨端安全能力不足。
2. strict gateway 在网络不稳时会形成规划硬失败（需策略化开关）。
3. 多实例场景下的文件持久化一致性（config/v2/save-slot）仍未解决。

## 5.2 中风险

1. General LLM 门控阈值与 UtilityAI 权重可能造成策略偏置。
2. WS 统计为进程内快照，缺少多实例聚合指标。
3. 新增持久化告警已上线，且已补 runbook（`PERSISTENCE_ALERT_RUNBOOK_2026_04_09.md`），但尚未接自动告警平台（目前仍以人工巡检为主）。
4. Save Slot 的跨环境迁移/版本演进策略与健康纳管（B3-C03/C04）已补齐；当前剩余问题转为“大文件归档压缩与多实例一致性”。

## 5.3 低风险

1. MCP 文案层已清扫，不影响 tool API 行为。
2. World 主链已有 `worldMutationLock`，并发写冲突已可观测分类。
3. 配置层持久化（B2-C05~C07）与健康诊断（B2-C08~C09）已完成，短期内主要是运维化而非重构。

---

## 6. AI 可自动推进 vs 必须人工决策

## 6.1 AI 可自动推进（适合继续“只发继续”）

1. 文档治理：模块卡、脉络文档、验收台账持续回写。
2. 非语义破坏改造：可观测字段补充、日志结构化、门禁扩展。
3. Godot 客户端消费层：只读后端契约的 UI/HUD 接入。

## 6.2 必须人工拍板

1. 规则引擎行为改动（`shared/domain/rules.ts`）。
2. 模型策略切换（strict 默认、模型供应商、成本预算）。
3. 鉴权升级与持久化架构（Session/V2/Config 的落库方案）。
4. 将领人格漂移参数（直接影响玩法体验）。

---

## 7. Batch2 执行建议（从 Week2 平滑转入）

1. `B2-C12`：已完成 `/api/health.persistence.alerts` runbook（见 [PERSISTENCE_ALERT_RUNBOOK_2026_04_09.md](PERSISTENCE_ALERT_RUNBOOK_2026_04_09.md)）。
2. `B2-C13`：已完成 nightly 验收汇总入口（`npm run gate:ai:nightly:acceptance`）。
3. `B2-C14`：已完成 Godot 只读接入 `/api/events`、`/api/civil-memory`、`/api/session/runtime`（HUD 合并观测，不引入前端权威分支）。
4. `B2-C15`：已完成 Session 在线态最小持久化与重启恢复（`tmp/session_state.json` + health/nightly 观测接入）。
5. `B2-C17`：已完成 MCP + CLI 最小可执行控制面扩展（session/world action/headless 链路）。
6. `B2-C16`：已完成 Session 鉴权与 token 生命周期治理（tokenMaxAge + errorCode + tokenState + 401 语义）。
7. `B2-C18`：已完成 Session 安全边界 gate 固化，并并入 nightly 自动验收（`gate:session:security` + nightly `sessionSecurityGate`）。
8. `B2-C19`：已完成操作面模板化扩展（MCP/CLI 模板动作 + Godot runtime lastAction 对账）。

---

## 8. 复用正式入口（本批次）

- `obsidian files folder='docs' ext=md`
- `obsidian backlinks path='docs/AI_QUICK_NAV_INDEX_2026_04_10.md' total`
- `npm run build`
- `npm run test:session:manager`
- `npm run sim:13factions`
- `npm run gate:ai:mainline:stability`
- `npm run gate:phase5:hardening`
- `npm run gate:session:security`
- `npm run gate:godot:week1`

---

## 9. 本批次结论

后端 AI 主链已具备持续迭代基础，当前最务实的下一步不是“重写逻辑”，而是：

1. 把“已落地的配置持久化 + 告警分级”转成稳定运维流程（runbook + gate 汇总）。
2. 继续保持规则引擎 authoritative，不被前端/LLM 旁路。
3. Session 鉴权与 token 生命周期边界已固化进自动 gate + nightly，操作面模板层也已补齐，下一步应优先落“剧本化回放对账”。
