# AI 玩家思考链全景图（修订稿）

> 版本：2026-03-21 Rev.4（+ BYOK 全链路统一、5 项规则引擎 / 将领调度 bug 修复）  
> 适用对象：AI 工程师、后端工程师、前端工程师

---

## 状态标记说明

- `[已实现]`：仓库已有可运行实现
- `[部分实现]`：有实现但链路未全闭环，或仅在特定入口生效
- `[目标态]`：设计目标，尚未完全落地

---

## 一、一句话定义

> **AI 玩家是有状态的战略角色。**  
> 它在规则引擎约束下完成 POER（感知→规划→执行→复盘），并持续积累记忆与组织能力。

状态：`[已实现]`

---

## 二、分层与时序（真实代码口径）

```text
[驱动层：GameClock，setInterval 60s（GAME_CLOCK_ENABLED=1 时）]
① sweepAllTimeouts()          ← 超时玩家 L1 → L2 切换
② _autoplanL2Factions()       ← 并发为 L2 势力触发 Commander
③ advanceTickAction()         ← 规则引擎执行

[规划阶段：通常在 advanceTick 前完成]
人类玩家意图（L1）/ GameClock 自动触发（L2）
  -> CommanderAgent（规划）
  -> queuePlanExecution
  -> GeneralAgent（分派/细化，Tier2/3 将领可触发 LLM）
  -> queuePlanExecution('replace')

[执行阶段：advanceTickAction 内]
DomainCommBus + AgendaCompiler + CourtService
  -> advanceTick（规则引擎）
  -> ReflectService → maybePushGrievanceAlerts()
  -> CivilMemory 记录执行结果
  -> broadcastTickDelta / broadcastGeneralMessage（WS 推送）
```

关键事实：

1. `WorldService.advanceTickAction` 内没有 Commander/General 调用，只负责治理管线 + 规则执行 + Reflect。`[已实现]`
2. General LLM 不是“全局恒关闭”：
   - 13 势力仿真脚本中显式 `skipLLM: true`（性能策略）。`[已实现]`
   - 双边仿真与服务主链并非恒关，仍受 shouldCall + timeout + 并发门控。`[已实现]`
3. 玩家会话层自治等级在 `SessionManager`（L1/L2/L3）；将领执行层自治源在 `GeneralAgent`（assigned/delegated/negotiated/idle）。`[已实现]`

> **注意**：`L3_negotiated` 类型存在于代码中，但目前永不被赋值（`SessionManager` 只在 L1/L2 间切换）。`GeneralNegotiationChannel` 运行于 `runGeneralDispatch` 内作为侧效果，与 `SessionManager` 自治等级无连接。此为已知架构债，不影响现有功能。`[部分实现]`

---

## 三、POER 四步（修正后）

### P — Perceive（感知）

Commander 感知来自 `buildCommanderToolContextForFaction`，核心字段：

- `worldSnapshot.localLayer.tiles`
- `frontlineRisk`
- `availableUnits`
- `recentReplays`
- `recentNarratives`
- `doctrineSnippets`
- `passControlStatus`
- `pveOpportunities`
- `memoryRecall`（由 CommanderAgent 注入，top=4）

状态：`[已实现]`

---

### O — Order（规划）

#### CommanderAgent 链路

1. `safeRecall(agentId, query, 4)`
2. 构建裁剪上下文
3. 走网关模型（OpenAI 兼容）
4. `parsePlannerResult`（Zod）
5. `guardPlan`（动作/单位/目标/重复门禁）
6. `safeRemember`

状态：`[已实现]`

默认超时与重试参数（可配置）：

- `PLANNER_REQUEST_TIMEOUT_MS` 默认 `45000ms`
- `PLANNER_REQUEST_MAX_ELAPSED_MS` 默认 `>=65000ms`
- `PLANNER_REQUEST_MAX_ATTEMPTS` 默认 `3`

状态：`[已实现]`

#### GeneralAgent 链路

1. 按 `unitId` 分配任务
2. `UtilityAI` 细化/自主提案
3. `GeneralLLM`（8s 超时，失败降级 UtilityAI）
4. 战场协商消息（`threat/challenge/ceasefire_offer/intelligence/alliance_offer`）
5. 每将领记忆召回与写入

状态：`[已实现]`

---

### E — Execute（执行）

规则引擎独占执行：`advanceTick`（`shared/domain/rules.ts`）。**AI 不能直接改世界。**

`advanceTick` 内部按顺序执行以下子阶段（全部活跃，无可选项）：

| 顺序 | 子阶段函数 | 说明 |
|------|-----------|------|
| 1 | `processRecruitment` | 每 4 tick、food≥25 时自动生成新单位（骑/步/重甲原型池轮换） |
| 2 | `processAutoLevelUp` | 每势力最低等级武将 +5 级，消耗 5 食物 |
| 3 | `processDiplomacyAgreements` | 外交协议 duration 倒计时，到期自动删除 |
| 4 | 执行 `ExecutableOrder`（行军/战斗/占领） | 核心单位行动结算，含兵种速度/地形阻断/外交约束 |
| 5 | `runAllianceDirector` | 同盟位 AI 独立策略行动 |
| 6 | `runEnemyDirector` | 敌方中立 AI 行动 |
| 7 | `processProvincePve` | 驻扎格自动触发 PvE 结算（strength ≥ guardStrength×0.8 则清剿成功、获奖励） |
| 8 | `updateLuoyangHoldCounters` | 洛阳围攻计数（`LUOYANG_SIEGE_TICKS_REQUIRED=3`，需连续 capture tick 才能占领，`processSiegeDecay` 会重置计数） |

此后 `WorldService.advanceTickAction` 追加：资源结算 → `ReflectService` → `CivilMemory` 写入 → WebSocket 增量推送。

状态：`[已实现]`

---

### R — Reflect（复盘）

`ReflectService.reflectWorldTick({ before, after, commanderId })`：

1. 生成 Narrative 草稿
2. 建因果链与后果链
3. 并行写 Commander/General 记忆
4. 更新 GeneralProfile（忠诚、信任、忽视计数、委屈）
5. 写 TacticalSkillLibrary

状态：`[已实现]`

---

## 四、将领档案（GeneralProfile）

### 初始与上限（代码口径）

- 初始 `loyalty = 0.72`
- 初始 `lordTrust = 0.68`
- `shortTerm` 上限 20
- `longTermSummary` 上限 360 字符
- `pendingGrievance` 上限 12 条

状态：`[已实现]`

### 新增字段（Rev.3）

- `tier?: 1 | 2 | 3` — 运行时计算，不持久化；由 `computeGeneralTier(profile)` 派生：
  - **Tier 1（~90%）**：新将/低信任/被冷落的将领 → 纯 UtilityAI，零 LLM 成本
  - **Tier 2（~9%）**：中层将领（`totalBattles≥4, lordTrust≥0.65, loyalty≥0.50`）→ 待命时触发 GeneralLLM
  - **Tier 3（~1%）**：精英名将（`totalBattles≥10, lordTrust≥0.80, loyalty≥0.75`）→ 最高决策质量
  - **强制降级**：`loyalty < 0.35` 或 `recentIgnored ≥ 6` → 强制 Tier 1（已叛心或被遗忘的将领不值得 LLM 投入）

状态：`[已实现]`

### 漂移参数（Reflect）

- 成功：`lordTrust += 0.025 * weight`，`loyalty += 0.02 * weight`
- 失败：`lordTrust -= 0.03 * weight`，`loyalty -= 0.024 * weight`
- `recentIgnored` 成功减、失败增（封顶 8）

状态：`[已实现]`

---

## 五、边界与门禁（修正后）

### 5.1 CommanderGuard

- 非法 action 丢弃
- 不可用 unit 丢弃
- 目标非法丢弃（`march` 允许远端格子格式）
- 同 unit 重复命令丢弃
- 全丢后 fallback 到 recon

状态：`[已实现]`

### 5.2 UtilityAI 风险降级（精确阈值）

- `aggression < 0.35` 且目标压力高时，进攻降级侦察
- `supply < 2` 时，capture/march 直接降级为守/侦
- `supply < 3` 仍有评分惩罚（不一定硬降级）

状态：`[已实现]`

### 5.3 GeneralLLM 门控（Tier 版）

| 检查顺序 | 条件 | 结果 |
|---------|------|------|
| 1 | `computeGeneralTier(profile) === 1` | **跳过 LLM**（~90% 将领） |
| 2 | `unit.status !== '待命'` | 跳过 LLM |
| 3 | 并发信号量已满（默认 8） | 跳过 LLM |
| 4 | 通过所有检查 | 调用 GeneralLLM（8s 超时，失败降级 UtilityAI）|

**成本效益**：13 势力 130 将领，每 tick LLM 调用量从 ~130 降至 ~13（节省 ~90%）。

状态：`[已实现]`

### 5.4 外交边界（修正）

- LLM 不直接改 `WorldState`。`[已实现]`
- `requestedWorldChanges` 是结构化提案；是否落地到规则层要走显式应用链路。`[部分实现]`
- `respondToDiplomacyProposal` 会直接更新 GeneralProfile 漂移（不是全部延后到规则引擎）。`[已实现]`
- `betrayal` 含 `delayTicks`（默认 1）。`[已实现]`

### 5.5 朝堂（Court）

- `war` 阈值 60%
- `constitutional` 阈值 67%
- human seat 权重 1.25，AI seat 1.0
- deadlock guard：连续 deferred 达阈值后 `expire:*:deferred_timeout`
- vote identity audit：seat/proposal/重复票/票数完整性

状态：`[已实现]`

### 5.6 最高原则

- AI 不可直接 mutate WorldState
- 规则引擎 authoritative
- LLM 输出需过 schema + guard

状态：`[已实现]`

---

## 六、治理流水线（阶段映射）

### 第 1 阶段：AI 玩家通信（Domain 内）

`DomainCommBus` 负责消息路由、优先级与配额。  
状态：`[已实现]`

### 第 2 阶段：议程压缩链（10→1→9）

- 域内候选压缩
- 跨域聚合到 National Agenda（最多 9 项）

状态：`[已实现]`

### 第 3 阶段：朝堂席位与表决

`CourtService` 产出 seats/proposals/votes/resolutions，并落盘。  
状态：`[已实现]`

### 第 4 阶段：文明长期记忆

`CivilMemoryService/Store` 记录议程、裁决、执行结果，并带 hash 链。  
状态：`[已实现]`

说明：当前是“防篡改可校验（tamper-evident）”，主链未默认强制每 tick 校验。  
状态：`[部分实现]`

### 第 5 阶段：硬化门禁（P0/P1 风险）

- deadlock gate
- vote identity gate
- anti-tamper chain gate
- CI workflow 执行 `build + gate:phase5:hardening`

状态：`[已实现]`

---

## 七、外交先验概率（代码口径）

先验逻辑来自 `computeAcceptancePrior`（最终 clamp 到 `[0.05, 0.95]`）：

- ceasefire：`0.5 + pressure*0.08 + (1-aggression)*0.2`
- alliance：`0.5 - loyalty*0.3 + riskTolerance*0.1`
- betrayal：`(1-loyalty)*0.6 + grievance*0.05 + recentIgnored*0.04`
- intelligence：`0.5 + reconBonus(0.2) + (1-loyalty)*0.15`
- territory_trade：`0.5 + (1-riskTolerance)*0.15`

状态：`[已实现]`

---

## 八、13 势力大规模测试入口（你关心的“大脚本”）

有，且是正式脚本入口：

- `npm run sim:13factions`
- `npm run sim:13factions:gateway`
- `npm run sim:13factions:gateway:50`

对应文件：

- `server/src/evals/runMultiFactionSimulation.ts`

状态：`[已实现]`

---

## 九、阶段 1-5 变更点是否已覆盖（回答你的问题）

有，当前文档已明确覆盖：

1. AI 玩家通信（Phase 1）
2. 议程压缩（Phase 2）
3. 朝堂席位与表决（Phase 3）
4. 文明长期记忆（Phase 4）
5. 风险门禁与 CI（Phase 5）

并用 `[已实现]/[部分实现]/[目标态]` 标注状态。

---

## 十、仍在目标态的关键缺口

1. CourtResolution 还未直接注入 Commander 上下文形成 Doctrine 强约束。`[部分实现]`
2. CivilMemory 完整性尚未在主链每 tick 强制校验。`[部分实现]`
3. 外交提案到世界变更的“自动规则化落地”仍有入口差异（服务主链 vs 仿真链）。`[部分实现]`

---

## 十一、战斗与兵种体系（规则引擎数值口径）

### 11.1 武将原型（HeroArchetype）

7 种原型，影响 Doctrine 偏好、UtilityAI 行为、小队组成：

| 原型 | troopType | 行军速度（步/tick） | UtilityAI 特殊行为 |
|------|-----------|-----------------|-------------------|
| `assault` | infantry | **100** | 主力进攻 |
| `recon` | infantry | 100 | 侦察优先 |
| `guard` | shield | **70** | 防守/驻扎，低自主进攻倾向 |
| `mobile` | cavalry | **150** | 最快机动，高风险冲锋 |
| `heavy` | infantry | 100 | 厚甲，高食物消耗 |
| `logistics` | supply | **60** | 遇 capture 命令自动改为 support |
| `reserve` | infantry | 100 | 预备队，优先编组 corps |

状态：`[已实现]`

### 11.2 地形阻断规则

- `mountain`：除 `recon` 外所有行动被阻断——**除非** tile `type === 'pass'`
- `riverland`：跨河需 `type === 'pass'` 或 `type === 'city'`
- 通过关口/城池仍额外消耗 +1 actionPoints + 1 food
- 跨州推进必须先控制对应 pass 型地块（`resolvePassControlBlockReason`）

状态：`[已实现]`

### 11.3 外交约束在规则层的执行

`hasCeasefireOrAlliance(world, factionA, factionB)` 检查 `world.feedback.diplomacyAgreements`，在两处强制生效：

1. 行军/占领命令入口 — 进入停战方领地直接 block
2. 战斗判定过滤 — 同盟/停战方跳过 `resolveBattleAtTile`

状态：`[已实现]`

---

## 十二、实时通信层（WebSocket）

端点：`ws://host:8787/ws`（`server/src/ws/GameWebSocket.ts`，已注册在 `app.ts`）

### 12.1 协议消息类型

**客户端 → 服务端：**
- `subscribe { factionId, token? }` — 订阅指定势力推送
- `ping` — 心跳保活

**服务端 → 客户端：**

| 消息类型 | 触发时机 | 关键字段 |
|---------|---------|--------|
| `tick_delta` | 每 tick 结束 | `unitChanges / tileChanges / factionStats / events` |
| `battle_report` | 有战斗发生时 | 战斗摘要 |
| `diplomacy_event` | 外交协议变更时 | 协议类型 / 涉及势力 |
| `general_action` | 将领行动完成时 | `autonomySource`（L1/L2/L3）、`loyaltyLevel?`、`lordTrust?`、`tier?` |
| `general_message` | 将领主动「请奏」时 | `generalId / generalName / text / trigger / loyaltyLevel / lordTrust` |

`general_message.trigger` 取值：
- `grievance`：`pendingGrievance.length >= 5`（将领积怨爆发，"末将有苦难言…"）
- `loyalty_critical`：`loyalty < 0.35`（忠诚告急，叛变前兆）
- `victory`：重大战役胜利
- `crisis`：危急局势预警
- `promotion`：Tier 晋升通知（Tier1→2 或 Tier2→3）

### 12.2 战争迷雾与增量策略

- 按 `factionId` 过滤：只推送己方单位变化 + 涉己事件（非全量广播）
- **增量 delta**：只推 `strength/supply/tileId/status` 发生变化的单位；只推 `owner/enemyPressure` 变化的 tile
- `broadcastTickDelta` / `broadcastBattleReport` 由 `WorldService.advanceTickAction` 在每 tick 末尾串行调用

状态：`[已实现]`

---

## 十三、规划任务生命周期（PlanningJobMachine）

每次 Commander 规划请求创建一个 XState 状态机实例（`server/src/application/planning/PlanningJobMachine.ts`），由 `PlanningService` 管理。

```
queued ──START──> running ──SUCCEED──> succeeded
   │                  └──FAIL──> failed
   └──FAIL/STALE──> failed / stale
```

| 状态 | 含义 |
|------|------|
| `queued` | 已入队，等待执行 |
| `running` | LLM 调用进行中 |
| `succeeded` | 计划已生成并通过 Guard |
| `failed` | LLM 调用失败或 Guard 全量拒绝 |
| `stale` | 世界状态已变更，计划过期作废 |

接口：`createPlanningJobLifecycle()` 返回 `{ getStatus(), send(eventType) }`

状态：`[已实现]`

---

## 十四、模型调用基础设施

入口：`server/src/infra/llm/OpenAICompatPlannerAdapter.ts`

### 14.1 API Key 轮换

模块级计数器，每次调用 `rotateApiKeys()` 将 key 数组重排以分散负载，支持配置多个 key（防 429）。

### 14.2 重试 + 指数退避公式

```
delay  = min(maxMs, baseMs × 2^attempt)
jitter = random × max(40, floor(delay × 0.2))
wait   = min(delay + jitter, remainingBudget)
```

默认：`baseMs=600ms`、`maxMs=4000ms`、`maxAttempts=3`。HTTP 408/429/5xx 触发重试；401-403 在有备用 key 时触发轮换重试。

### 14.3 推理模型 Fallback

```typescript
const rawText = (msg?.content ?? msg?.reasoning)?.trim()
```

部分模型（如 nemotron）将结果放在 `reasoning` 字段，`content` 为 null，此行自动兜底。

### 14.4 Commander vs General 模型分离

| 层级 | Env Var | 输入上限 | 输出上限 |
|------|---------|---------|---------|
| Commander | `LLM_RELAY_MODEL` | ~2.5K tokens（compact 上下文） | 无硬限 |
| General | `LLM_GENERAL_MODEL` | < 400 tokens | **256 tokens** |

### 14.5 AI_SERVER_URL 代理

设置 `AI_SERVER_URL` 后，Commander 的 LLM 调用透传到独立 AI 服务进程，主后端与 AI 进程解耦，支持独立扩缩容。

状态：`[已实现]`

---

## 十五、V2 经济与武将系统

`server/src/application/v2/V2GameService.ts` — 独立于主 `WorldState` 的玩家经济层。

已接入主流程：`WorldService` 每 tick 调用 `settleResourcesForAllPlayers`，`/api/v2/*` 路由已挂载。

| 能力 | 说明 |
|------|------|
| `AIPlayerV2.PlayerResources` | gold / food / wood / iron 四维资源 |
| 武将招募/升星/组建部队 | AI 玩家主动消耗资源建 Roster |
| `computeResourceIncome/Upkeep` | 每 tick 收支结算，驱动 UtilityAI 的补给评分 |

与 `WorldState` 的关系：`WorldState` 管地图 + 单位行动；V2 层管武将经营。通过 `settleResourcesForAllPlayers` 每 tick 同步。

状态：`[已实现]`

---

## 十六、将领实时对话（GeneralChatService）

`server/src/agents/general/GeneralChatService.ts` — 人类玩家与单个 AI 将领直接对话，路由已挂载（`/api/general-chat/*`）。

- 将领基于 `GeneralProfile`（性格/忠诚度/记忆）生成角色化回复
- LLM 调用使用 `LLM_GENERAL_MODEL`，注入该将领的 `shortTerm` 记忆上下文
- 对话内容写入 `shortTerm`（上限 20 条），影响后续 UtilityAI 决策
- **BYOK 已统一（Rev.4 新增）**：`callChatLLM` 现读取 `FactionConfigStore.getFactionModelConfig(factionId)`，玩家通过 `POST /api/faction/:id/model-config` 设置一次 key，即同时覆盖 Commander 规划、General 决策、将领对话三层 LLM 调用
- 是验证"将领是有状态角色"最直观的入口

状态：`[已实现]`

---

## 十七、GameClock（游戏主时钟）

**文件：** `server/src/application/clock/GameClock.ts`（Rev.3 新建）

GameClock 是 L2 代理模式的**核心驱动器**。玩家离线后，整个系统仍能按固定间隔完整执行 POER 循环，无需人类手动 tick。

### 激活

```bash
GAME_CLOCK_ENABLED=1 npx tsx server/src/app.ts
# 或
npm run start:clock
```

### 每 tick 执行顺序

```
① sweepAllTimeouts()           → 检测超时玩家 → L1 自动降为 L2
② _autoplanL2Factions()        → 并发为所有非在线势力触发 CommanderAgent
③ advanceTickAction(false)     → 规则引擎执行 + Reflect + WS 推送
```

### 并发保护机制

- `tickRunning` 标志：前一 tick 未完成时跳过新触发（防雪崩）
- `WorldService.isTickAdvancing` mutex：防止 HTTP 请求与时钟并发
- `batchedSettled(tasks, CONCURRENCY)`：Commander 并发上限为 `GAME_CLOCK_CONCURRENCY`（默认 4）

### 环境变量

| 变量 | 默认值 | 说明 |
|-----|--------|------|
| `GAME_CLOCK_ENABLED` | 未设置（关闭）| `=1` 启动时钟 |
| `GAME_TICK_INTERVAL_MS` | 60000 | tick 间隔（ms），最小 10000 |
| `GAME_CLOCK_MAX_FACTIONS` | 13 | 每 tick 最多规划势力数 |
| `GAME_CLOCK_AUTO_PLAN` | 1 | `=0` 只推进 tick，不触发 Commander |
| `GAME_CLOCK_CONCURRENCY` | 4 | 并发 Commander 规划线程数 |

### 成本估算（1 tick/min，GPT-4o-mini 价格）

| 规模 | Commander/tick | General LLM/tick（含 Tier）| $/月 |
|-----|---------------|--------------------------|------|
| 13 势力，130 将领 | 13 | ~13 | ~$3 |
| 300 势力，3000 将领 | 300 | ~300 | ~$70 |

**结论：300 势力 3000 将领，月成本 ~$70（完全可接受）。**

状态：`[已实现]`

---

## 十八、BYOK 架构（Rev.4）

玩家通过一个 API 接口统一配置自己的模型 key：

```
POST /api/faction/:id/model-config
{ "model": "...", "apiKey": "sk-...", "baseUrl": "https://openrouter.ai/api/v1" }
```

这一个 key 覆盖该势力的**全部三层** LLM 调用：

| 层 | 文件 | 优先级 |
|---|---|---|
| Commander 规划 | `GameClock.ts → modelGateway.ts` | BYOK apiKey > env LLM_RELAY_URL |
| General 决策 | `GeneralLLMAdapter.ts` | BYOK > env LLM_GENERAL_MODEL |
| 将领对话 | `GeneralChatService.ts` | BYOK > env LLM_CHAT_MODEL |

未设置 BYOK 的势力自动回落到服务器提供的免费模型（OpenRouter 免费 key 池）。

玩家购买付费套餐后获得限额更高的 apiKey，体验显著提升（尤其是将领对话角色扮演一致性）。

状态：`[已实现]`

---

## 十九、已修复 Bug 记录（Rev.4，2026-03-21）

| # | 严重度 | 文件 | 问题 | 修复 |
|---|--------|------|------|------|
| 1 | 高 | `shared/domain/rules.ts` | `resolveBattleAtTile` 用 `defenders`（含停战方）计算战力和分配伤害，停战单位被误伤、战斗结果错误 | `defenderPower` 与伤害循环改用 `hostileDefenders` |
| 2 | 高 | `GeneralUtilityAI.ts` | 极低供给降级为 `garrison` 时仍保留原始敌方目标，单位会跋涉到敌地驻扎 | `target` 改为 `unit.tileId`（原地驻扎） |
| 3 | 中 | `GeneralChatService.ts` | `callChatLLM` 硬编码 `process.env`，玩家设置 BYOK 后对话仍走服务器 key | 添加 `factionId` 参数，优先读 `FactionConfigStore` |
| 4 | 中 | `GeneralLLMAdapter.ts` | `buildSituationPayload` 缺少 `general.faction`，LLM 不知道自己是哪方 | 在 `general` 对象中加入 `faction` 字段 |
| 5 | 中 | `GeneralAgent.ts` | `buildGeneralTasks` 对找不到归属将领的命令回退到 `generals[0]`，导致无关命令堆积在第一位将领 | 改为 `continue`（跳过无效命令） |

---

## 一句话给新成员

> AI 玩家已具备完整 POER 主链、**GameClock 驱动的 L2 全自主模式**、三级将领 Tier 成本金字塔、Stanford 记忆时间衰减（0.985^hours）、将领情绪 WS 反向推送，BYOK 全链路统一（Commander + General + 将领对话），以及完整治理基础设施；当前重点是 FactionConfigStore 持久化（服务器重启后玩家不丢配置）和文明账本完整性强制执行。
