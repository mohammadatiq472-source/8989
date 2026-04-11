# AI 逻辑现状总览（现行代码口径，2026-04-09）

## 0. 文档定位

这份文档用于替代“只靠旧提示词理解 AI 架构”的方式，直接基于当前仓库代码给出：

1. AI 主链路现在如何运行。
2. 每个 AI 模块在做什么。
3. 哪些点最容易踩坑（迁移、扩展、自动化接入时）。
4. 子代理应该按什么顺序读代码。

> 口径说明：以当前代码为准；历史文档（如 `AI_LAYER_STATUS.md`）可作背景，但不作为最终事实来源。

## 1. 本轮读取范围（已完成）

### 1.1 程序化全量读取

- AI 相关 TS 文件范围：`tmp/ai_logic_scope_files_2026_04_09.txt`（81 个文件）
- 深扫索引：`tmp/ai_logic_deep_scan_2026_04_09.json`
- 签名索引：`tmp/ai_logic_signature_index_2026_04_09.json`
- 关键片段快照：`tmp/ai_logic_key_snippets_2026_04_09.txt`
- 既有后端索引：
  - `tmp/backend_server_src_full_index_2026_04_09.json`
  - `tmp/backend_shared_full_index_2026_04_09.json`
  - `tmp/backend_routes_inventory_2026_04_09.json`

### 1.2 关键代码入口（已逐个读取）

- `server/src/app.ts`
- `server/src/application/world/WorldService.ts`
- `server/src/application/clock/GameClock.ts`
- `server/src/application/planning/PlanningService.ts`
- `server/src/agents/commander/CommanderAgent.ts`
- `server/src/agents/general/*`
- `server/src/agents/reflect/ReflectService.ts`
- `server/src/agents/memory/*`
- `server/src/multiplayer/SessionManager.ts`
- `server/src/ws/GameWebSocket.ts`
- `shared/domain/rules.ts`
- `shared/contracts/game/*`
- `shared/schemas/*`
- `server/src/mcp/gameServer.ts`

## 2. 一句话现状结论

当前 AI 主链已经是“可运行的分层系统”，而不是概念样机：

- **规划层**：Commander（LLM/Mock）+ Planner 校验/守卫
- **执行层**：General UtilityAI + 受控 LLM 增强 + 规则引擎 authoritative
- **复盘层**：Reflect 叙事 + 记忆写回 + 将领状态漂移
- **会话层**：L1/L2/L3 自主权切换 + WS 观测推送

但仍有明确工程注意点：**记忆/配置多为内存降级与非持久化、严格模式默认值、编码污染痕迹、部分协商链路未持久化**。

## 3. 运行主链（按真实调用顺序）

## 3.1 服务入口

`app.ts` 统一分发路由与运行时：

- HTTP：`/api/world/*`、`/api/planning/create`、`/api/session/*`、`/api/generals/*`、`/api/diplomacy/*`、`/api/events*`、`/api/narratives`、`/api/v2/*`
- WS：`attachWebSocket(server)` 挂载 `/ws`
- 时钟：`GAME_CLOCK_ENABLED=1` 时启用 `gameClock.start()`

## 3.2 Tick 主循环（L2 自动托管）

`GameClock._onTick()`：

1. `sweepAllTimeouts()`：会话超时玩家从 `L1_assigned` 退回 `L2_delegated`
2. `_autoplanL2Factions()`：仅对自动托管势力做规划
3. `advanceTickAction(false)`：推进规则引擎 Tick

## 3.3 规划链

`createPlanningResult()`：

1. 调 `createCommanderPlan()`（Commander）
2. `parsePlannerResult` + 指标合并 + 状态机（XState）
3. 出错时：
   - 若 `mode=gateway` 且 `PLANNER_GATEWAY_STRICT` 生效，直接抛错
   - 否则降级 `createMockPlan()`

## 3.4 Commander 链

`createCommanderPlan()`：

1. 读取 commander 记忆（`safeRecall`）
2. 组装 `CommanderToolContext`（世界快照/可用单位/风险/doctrine/replay/叙事/PVE/终局上下文）
3. 网关调用或 mock
4. `guardPlan()` 过滤非法命令、去重、约束
5. 若全被过滤，注入 `guard_fallback_recon`
6. `safeRemember` 写回 commander 记忆

## 3.5 执行链（World + General + Rules）

`queuePlanExecutionAction()`：

1. `worldMutationLock` 防并发写冲突
2. 可选 `generalDirectives` 合并
3. 可选 `runGeneralDispatch()`（General 再裁剪/增强计划）
4. 调 `rules.queuePlanExecution()` 入 authoritative 执行链

`advanceTickAction()`：

1. 先做 commBus/agenda/court 侧流程
2. 调 `rules.advanceTick()`（最终世界变更）
3. 调 `reflectWorldTick()`（叙事+记忆+将领反馈）
4. 记录 civil memory 执行结果
5. `broadcastTickDelta()` + 战报推送

## 3.6 WS 可观测链

`GameWebSocket` 广播：

- `tick_delta`
- `battle_report`
- `diplomacy_event`
- `general_action`
- `general_message`

人控势力（`L1_assigned`）订阅必须带合法 session token。

## 4. 模块现状表（可直接给子代理分工）

| 模块 | 关键文件 | 当前状态 | 注意点 |
| --- | --- | --- | --- |
| Commander 规划 | `server/src/agents/commander/CommanderAgent.ts` | 已接记忆召回、tool context、plan guard、fallback recon | guard 通过后仍依赖下游规则引擎二次兜底 |
| Planner 服务 | `server/src/application/planning/PlanningService.ts` | XState 生命周期 + 指标 + fallback/mock | `PLANNER_GATEWAY_STRICT` 默认倾向严格，网关不稳时会直接失败 |
| 模型网关 | `server/src/infra/llm/OpenAICompatPlannerAdapter.ts` | timeout/retry/budget-cap/成本估算 | 强依赖 relay/baseUrl/apiKey 配置正确性 |
| General 分发 | `server/src/agents/general/GeneralAgent.ts` | Utility 主导，LLM 按门控触发，带并发信号量 | `skipLLM/skipRefinement` 在 mock 模式影响行为深度 |
| General LLM 适配 | `server/src/agents/general/GeneralLLMAdapter.ts` | tier 门控 + 8s 超时 + JSON 强约束 | 注释存在编码污染痕迹；模型调用失败会静默降级 |
| 战术效用 AI | `server/src/agents/general/GeneralUtilityAI.ts` | 规则化评分 + HPA* +人格调制 | 大图场景下通过 `skipRefinement` 避免 OOM，需关注策略覆盖 |
| 战场协商 | `server/src/agents/general/GeneralNegotiationChannel.ts` | 距离触发、TTL inbox、回合注入 | inbox 为进程内 Map，服务重启即清空 |
| 将领对话 | `server/src/agents/general/GeneralChatService.ts` | chat/order/auto 三模 + 历史持久化到 `tmp/general_chats` | 依赖文件系统；聊天语义需与规则动作保持一致 |
| 外交代理 | `server/src/agents/general/DiplomacyAgent.ts` | 提案/响应/后果映射 + profile 漂移 | 世界变更应用需严格审查（避免外交文本直接改规则） |
| Reflect 复盘 | `server/src/agents/reflect/ReflectService.ts` | Narrative 生成、memory 并写、grievance 推送、技能沉淀 | 是 POER 闭环关键点，不能被前端短路替代 |
| 记忆层 | `server/src/agents/memory/MemoryStore.ts` | Mem0 + 多签名兼容 + in-memory fallback | 无 `MEM0_API_KEY` 时退化内存，重启丢长期记忆 |
| 会话自主权 | `server/src/multiplayer/SessionManager.ts` | L1/L2/L3 切换、seat 管理、心跳退化 | token 为随机串会话态，不是完整账号体系 |
| 权威规则引擎 | `shared/domain/rules.ts` | `queuePlanExecution` + `advanceTick` authoritative | 迁移/重构时必须保持该层为唯一世界裁决 |
| CommBus/Court/CivilMemory | `server/src/agents/commBus/*` `server/src/agents/court/*` `server/src/agents/memory/CivilMemory*` | 议程窗口、投票裁决、链式记忆完整性校验 | 属于治理层 AI，调优需防止提案爆炸和链一致性破坏 |
| MCP 观测入口 | `server/src/mcp/gameServer.ts` | 已暴露 world/general/advanceTick/events/ai_logs 等工具 | 文件内存在注释编码乱码，建议后续单独修复编码 |

## 5. 高价值注意点（优先级排序）

## 5.1 高优先级

1. **长期记忆真实性风险**
   - 条件：未配置 `MEM0_API_KEY`
   - 结果：退化 `InMemoryProvider`，重启丢失长期记忆
2. **配置持久化不足**
   - `FactionConfigStore` / `AiConfigService` 主要是内存 Map
   - 重启后 doctrine/model 配置可回落默认值
3. **编码污染痕迹**
   - 多文件注释已出现乱码（如 `GameClock.ts`、`GeneralLLMAdapter.ts`、`mcp/gameServer.ts`）
   - 逻辑不一定坏，但维护成本和 AI 阅读稳定性变差

## 5.2 中优先级

1. **严格模式导致可用性波动**
   - `PLANNER_GATEWAY_STRICT` 默认严格，网关失败可能直接阻断而非容错
2. **自动规划入队冲突**
   - `GameClock` 入队遇 `world mutation busy` 走重试，超限会丢计划
3. **协商通道为进程内态**
   - `GeneralNegotiationChannel` 的 inbox/outbox 非持久，跨进程不共享

## 5.3 低优先级

1. **Session token 安全模型偏轻**
   - 当前适合开发阶段，不是完整账号鉴权体系
2. **MCP 工具文本质量问题**
   - 功能可用，但工具注释与部分文案有编码污染

## 6. 给子代理的推荐读取顺序（模块化）

1. `server/src/app.ts`（全局入口）
2. `server/src/application/world/WorldService.ts`（总调度）
3. `shared/domain/rules.ts`（authoritative 内核）
4. `server/src/application/planning/PlanningService.ts` + `server/src/agents/commander/CommanderAgent.ts`
5. `server/src/agents/general/*`
6. `server/src/agents/reflect/ReflectService.ts`
7. `server/src/agents/memory/*`
8. `server/src/multiplayer/SessionManager.ts` + `server/src/ws/GameWebSocket.ts`
9. `server/src/agents/commBus/*` + `server/src/agents/court/*` + `server/src/agents/memory/CivilMemory*`
10. `server/src/mcp/gameServer.ts`

## 7. 复用的正式验证入口（不新增脚本）

- 启动后端：`npm run start`
- 启动自动时钟：`npm run start:clock`
- 快速双势力仿真：`npm run sim:quick`
- 多势力仿真：`npm run sim:13factions`
- Session 管理测试：`npm run test:session:manager`
- 硬化门禁：`npm run gate:phase5:hardening`
- Godot Week1 门禁：`npm run gate:godot:week1`

## 8. 结论（供当前阶段直接使用）

当前 AI 架构已经具备“模块化、可观测、可自动运行”的工程骨架，下一步不应推倒重来，而应集中做三件事：

1. 把记忆与配置持久化从“可降级”提升为“默认可靠”。
2. 清理编码污染，保证文档和代码可读性（尤其给多子代理和 AI 自动化）。
3. 在不破坏 `rules.advanceTick` authoritative 原则下继续扩展 Godot 客户端能力。

