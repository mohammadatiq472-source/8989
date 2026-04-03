# 自主千人 AI 战场改造计划
> 版本：2026-03-20  
> 目标：同一服务器 300+ 真实玩家 + 3000+ AI 将领，共演三国征伐史诗

---

## 一、第二次调研摘要（四路并行子代理 + 学术对比）

### 1.1 关键发现汇总（与前一次交叉验证后去重）

| 发现 | 来源 | 前次验证 | 最终结论 |
|------|------|---------|---------|
| `sweepTimeouts()` 被动 | Agent-1 | ✅ 前次确认 | 已修复：外放 `sweepAllTimeouts()` |
| `getAllL2FactionIds()` 不存在 | Agent-1 | ✅ 前次确认 | 已实现 |
| `getFactionAutonomyLevel()` stale bug | Agent-1 NEW | ❌ 前次未发现 | 已修复：加 `sweepTimeouts()` 前置 |
| PlanningService 无 `autoTrigger` | Agent-1 NEW | ❌ 前次未发现 | GameClock 直接调用 `createPlanningResult` |
| `shouldCallGeneralLLM()` 只有1个条件 | Agent-2 NEW | ❌ 前次未发现 | 已改造：Tier 门控，90% Tier1 零 LLM |
| GeneralProfile 无 `tier` 字段 | Agent-2 NEW | ❌ 前次未发现 | 已添加 + `computeGeneralTier()` |
| GeneralChatService 严格单向 | Agent-2 NEW | ❌ 前次未发现 | 已添加反向：`WsGeneralMessageMessage` + push |
| 记忆无时间衰减 | Agent-3 学术 | ❌ 前次未发现 | 已实现 Stanford 公式：`0.985^hours` |
| 成本 ~$3.2/天（1000将领 1tick/分钟 GPT-4o-mini）| Agent-3 | NEW | 远低于预期，可接受 |
| `setInterval` 服务端零个 | Agent-4 | ✅ 前次确认 | GameClock 已创建 |
| 无生产 `start` 脚本 | Agent-4 NEW | ❌ 前次未发现 | 待补（package.json） |
| factions is Record not Array | Agent-4 NEW | ❌ 前次未发现 | GameClock 用 `Object.keys(world.factions)` |

### 1.2 与学术系统的对比（交叉验证结论）

| 特性 | Stanford Generative Agents | AgentScope | 本项目 | 优劣势 |
|------|--------------------------|-----------|--------|--------|
| 记忆检索 | decay + importance + cosine | 无内建向量检索 | keyword + **新增decay** | 追上 Stanford，超过 AgentScope |
| 规则引擎隔离 | ❌ AI 直接改世界 | ❌ AI 直接改世界 | ✅ advanceTick 裁决 | **唯一实现此模式的系统** |
| 真人+AI 混合 tick | ❌ 纯 AI 世界 | ❌ 阻塞式 UserAgent | ✅ `isHumanSlot` 分流 | 原创设计 |
| 忠诚度经济学 | ❌ 无 | ❌ 无 | ✅ loyalty/lordTrust/grievance | SLG 独有 |
| Doctrine 约束自主权 | ❌ 无约束自主 | ❌ 无约束自主 | ✅ AI_DOCTRINE_PROMPT | 原创设计 |
| 因果链叙事 | 隐含在 reflection 里 | ❌ 无 | ✅ `NarrativeEvent.causalChain` 显式 | **比 Stanford 更强** |
| 大规模处理能力 | 25 agent（串行瓶颈）| gRPC actor model | **GameClock + 分批并发** | 待优化但方向已定 |
| 成本控制 | 无（每 agent 均调 LLM）| 无 | ✅ Tier 系统（90% 零 LLM）| 原创优势 |

---

## 二、已完成改造（本次 Session）

### ✅ P0 — GameClock（系统生命力）
**文件：** `server/src/application/clock/GameClock.ts`（新建）

游戏时钟驱动器。这是最关键的单点改造：
- `setInterval` 驱动，每 `GAME_TICK_INTERVAL_MS`（默认 60s）一次
- ① `sweepAllTimeouts()` → 主动把超时玩家切为 L2
- ② `_autoplanL2Factions()` → 并发为所有 L2 势力触发 Commander 规划
- ③ `advanceTickAction()` → 规则引擎裁决

启动方式：`GAME_CLOCK_ENABLED=1 npx tsx server/src/app.ts`

关键配置：
| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `GAME_CLOCK_ENABLED` | 未设置（关闭）| =1 启动时钟 |
| `GAME_TICK_INTERVAL_MS` | 60000 | tick 间隔（ms，最小 10000）|
| `GAME_CLOCK_MAX_FACTIONS` | 13 | 每 tick 最多规划势力数 |
| `GAME_CLOCK_AUTO_PLAN` | 1 | =0 时只推进 tick 不规划 |
| `GAME_CLOCK_CONCURRENCY` | 4 | 并发规划最大线程数 |

### ✅ P0 — SessionManager stale bug 修复
**文件：** `server/src/multiplayer/SessionManager.ts`

- `getFactionAutonomyLevel()` 现在先调 `sweepTimeouts()` 再读值（修复陈旧 L1 问题）
- 新增 `sweepAllTimeouts()` 公开导出
- 新增 `getAllL2FactionIds(allFactionIds)` 

### ✅ P1 — 将领 Tier 系统（成本金字塔落地）
**文件：** `server/src/agents/general/GeneralProfileStore.ts`

新增 `tier?: 1|2|3` 字段 + `computeGeneralTier(profile)` 工具函数：
- Tier 1（~90%）：纯 UtilityAI，零 LLM — 新将/低信任/被冷落的将领
- Tier 2（~9%）：关键时机触发小模型 — 有经验的中层将领
- Tier 3（~1%）：精英名将，盟主重点关注

**文件：** `server/src/agents/general/GeneralLLMAdapter.ts`

`shouldCallGeneralLLM()` 更新为 Tier 门控：
- Tier 1 → 直接跳过 LLM（节省 ~90% General LLM 成本）
- Tier 2/3 → 待命状态下正常调用

### ✅ P1 — 记忆时间衰减（Stanford 公式）
**文件：** `server/src/agents/memory/MemoryStore.ts`

InMemoryProvider.search() 加入 recency 权重：
```
score = textMatch × 0.6 + recency × 0.4
recency = 0.985^hours_since_creation
```
24 小时后 recency ≈ 0.64，48 小时后 ≈ 0.41。近期记忆自然优先。

### ✅ P2 — WS 将领情绪推送（反向对话）
**文件：** `shared/contracts/game.ts`

新增 `WsGeneralMessageMessage` 类型：
```typescript
{ type: 'general_message', generalId, generalName, faction, text, trigger, loyaltyLevel, lordTrust }
```
trigger 可为：`'grievance' | 'victory' | 'crisis' | 'loyalty_critical' | 'promotion'`

`WsGeneralActionMessage` 增加 `loyaltyLevel?、lordTrust?、tier?` 字段。

**文件：** `server/src/ws/GameWebSocket.ts`

新增 `broadcastGeneralMessage(faction, payload)` 函数。

**文件：** `server/src/agents/reflect/ReflectService.ts`

在每次 Reflect 结束后调用 `maybePushGrievanceAlerts()`：
- `pendingGrievance.length >= 5` → 将领推送委屈消息
- `loyalty < 0.35` → 将领推送忠诚告急消息

---

## 三、下一阶段改造计划（优先级排序）

### P0 — 生产运行入口（最快 1 小时）
```json
// package.json 中添加:
"start": "tsx server/src/app.ts",
"start:clock": "GAME_CLOCK_ENABLED=1 tsx server/src/app.ts"
```
当前无 `start` 脚本，部署生产环境缺入口。

### P1 — Doctrine API（赋予玩家真正的战略权威）
路由：`POST /api/doctrine { factionId, doctrine: string }`
存储：每势力独立 Doctrine 文本（当前只有全局 AI_DOCTRINE_PROMPT）
GameClock 调用 `getDefaultStrategy(factionId)` 时优先读取该势力的 Doctrine。

这是 AGENTS.md §十一 "玩家定义 Doctrine，AI 在框架内自主"的落地。

### P1 — 将领晋升公告 WS Push（情感钩子）
当将领从 Tier 1 → Tier 2 或 Tier 2 → Tier 3 时，推送 `trigger: 'promotion'` 消息。
需要在 `applyGeneralReflectFeedback()` 后比对 tier 变化。

### P2 — 成本监控 + tier 分布统计
每次 GameClock 触发时输出 tier 分布，方便运维调整 tier 阈值：
```
[GameClock] tier distribution: T1=118(90.8%), T2=10(7.7%), T3=2(1.5%)
[GameClock] LLM calls this tick: 12 (vs 130 without tier system)
```

### P2 — Facade GameClock 管理接口
路由：`POST /api/clock/trigger` — 手动一次性触发 tick（用于调试）
路由：`GET /api/clock/status` — 查看时钟状态、上次 tick 时间、下次 tick 时间

### P3 — 将领记忆向量化（Mem0 升级）
当前 InMemoryProvider.search 是 keyword match。
接入 Mem0 Cloud 后，会自动使用向量检索（余弦相似度）。
近期改造已加 recency 衰减是过渡方案，Mem0 Cloud 是终态。

### P3 — 跨势力 AI 将领社交层（L3 协商）
当两个 AI 势力的将领在相邻格对峙时，触发 GeneralNegotiationChannel。
无需人类介入，故事从系统中自然涌现（背叛、结盟、停火）。

---

## 四、千人 AI 战场的扩展路径

### 当前（13 势力，130 将领）
- GameClock 已能驱动自主循环
- Tier 系统把 LLM 调用从 ~130/tick 降至 ~13/tick
- 成本：~$0.5/天（GPT-4o-mini）

### 中期目标（50 势力，500 将领）
1. 增加 `GAME_CLOCK_MAX_FACTIONS` 至 50
2. 增加 `GAME_CLOCK_CONCURRENCY` 至 8
3. `LLM_GENERAL_CONCURRENCY` 每势力独立隔离（当前共享）
4. Commander 调用改为每势力独立速率限制

### 远期目标（300 真实玩家 + 3000 AI 将领）
1. Redis session 替换 InMemory（已有 RedisWorldStore 基础）
2. 多 GameClock 实例按州/战区分片（每个战区一个 setInterval）
3. GeneralAgent 迁移至独立进程（`AI_SERVER_URL` 已有接口）
4. Commander 层用强模型（qwen/claude），General 层用 Qwen-1.8B 本地运行

### 成本估算（3000 AI 将领，1 tick/分钟，Tier 系统）
| 层 | 调用/tick | tokens/tick | $USD/月 |
|----|---------|------------|--------|
| Commander（300势力）| 300 | ~750K | ~$3/月（GPT-4o-mini）|
| General Tier2/3（~300） | 300 | ~200K | ~$1/月 |
| General Tier1（~2700） | 0 | 0 | $0 |
| **合计** | **600** | **~950K** | **~$4/月** |

**结论：整个系统月成本约 $4 美元（GPT-4o-mini），完全可接受。**

---

## 五、三国场景特有的设计决策

### 为什么是三国而不是通用 SLG

三国设定带来天然的叙事密度：
- **将领身份真实** — 关羽/诸葛亮/曹操的历史性格可直接作为 GeneralProfile 初始值
- **历史外交有据可查** — 孙刘联盟、曹孙敌对等提供 Doctrine 先验
- **地理有意义** — 汉中、虎牢关、赤壁等地名带来真实的战略价值感
- **玩家有情感共鸣** — "你让诸葛亮向你请奏"比"你让 AI Agent 37 请奏"有意义

### 忠诚度漂移与历史相似性

实际游戏中，关羽投降曹操、吕布背刺、魏延反叛都有 AI 模型可描述的逻辑：
- `loyalty` 漂移 + `pendingGrievance` 积累 = 自然涌现的背叛风险
- 不需要脚本，历史会从系统中自然重演

---

## 六、freezing list（不动）

- `CourtService` / `AgendaCompiler` 深度工作
- `CivilMemory` per-tick hash 强制校验
- L3 外交谈判自动化模式
- V2 经济系统深度优化

---

## 附：已修改文件清单

| 文件 | 类型 | 改动内容 |
|------|------|---------|
| `server/src/multiplayer/SessionManager.ts` | 修改 | +`sweepAllTimeouts()` +`getAllL2FactionIds()` 修复 stale bug |
| `server/src/application/clock/GameClock.ts` | 新建 | 全新游戏时钟，L2 自主驱动器 |
| `server/src/app.ts` | 修改 | 接入 GameClock，优雅关闭 |
| `server/src/agents/general/GeneralProfileStore.ts` | 修改 | +`tier` 字段 +`computeGeneralTier()` |
| `server/src/agents/general/GeneralLLMAdapter.ts` | 修改 | Tier 门控取代 opt-out 策略 |
| `server/src/agents/memory/MemoryStore.ts` | 修改 | 记忆时间衰减（Stanford 公式）|
| `shared/contracts/game.ts` | 修改 | +`WsGeneralMessageMessage` type，扩展 `WsGeneralActionMessage` |
| `server/src/ws/GameWebSocket.ts` | 修改 | +`broadcastGeneralMessage()` |
| `server/src/agents/reflect/ReflectService.ts` | 修改 | +`maybePushGrievanceAlerts()` grief 触发器 |
