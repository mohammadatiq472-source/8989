# AI 原生 SLG — 升级路线图 V1

> 基于对当前代码库的深度审计 + 前沿开源项目/论文的系统调研

---

## 零、参考项目：desplega-ai/agent-swarm 架构解读

> https://github.com/desplega-ai/agent-swarm

这是一个生产级多 Agent 编排框架（260 stars，4 contributors，MIT）。核心架构和我们的 SLG 指挥系统高度同构：

| agent-swarm 概念 | 我们的 SLG 对应实体 | 文件位置 |
|-----------------|-------------------|----------|
| Lead Agent | CommanderAgent | `server/src/agents/commander/` |
| Worker Agent | GeneralAgent | `server/src/agents/general/` |
| SOUL.md（不变人格内核） | `general.personality.*` | `GeneralProfileStore.ts` |
| IDENTITY.md（履历+当前认知） | `general.history.*` | `GeneralProfileStore.ts` |
| TOOLS.md（战场环境知识） | `CommanderToolContext` | `CommanderTools.ts` |
| CLAUDE.md / notes（短期记忆） | `general.memory.shortTerm` | `GeneralProfileStore.ts` |
| Compounding memory（搜索式长记忆） | Mem0 / Letta | `MemoryStore.ts` |
| Session hooks (PreToolUse/PostToolUse) | POER Reflect 层 | `ReflectService.ts` |
| Session summarization via Haiku | `recordTickSkills()` | `TacticalSkillLibrary.ts` |
| Task lifecycle (queued/running/done) | `PlanningJobMachine` | XState 状态机 |
| Worker Docker isolation | (未来：沙盒执行环境) | 远期目标 |

**关键发现**：agent-swarm 用 4 个持久化文件（SOUL/IDENTITY/TOOLS/CLAUDE.md）给每个 worker 建立跨会话身份。我们的 `GeneralProfile` 已有相同结构但字段覆盖不完整。Phase 2 的将领灵魂层将补齐这 4 层的完整对应。

**成本策略**：agent-swarm 的 memory 用 `text-embedding-3-small`；我们用 Mem0 InMemory（零成本）+ 中转站路由（免费模型覆盖）。不用担心成本——只要有免费 LLM 可路由，所有层级都能运转。

---

## 一、当前系统定位：你在哪

### 已经建成的东西（基础款）

| 模块 | 状态 | 核心价值 |
|------|------|----------|
| 规则引擎 (advanceTick) | ✅ 已稳定 | 世界权威裁决者，AI 只能提案不能篡改 |
| CommanderAgent → LLM → StrategicPlan | ✅ 已闭环 | 双层 Zod 校验 + Guard 守卫 |
| GeneralAgent (纯规则层) | ✅ 工作中 | 将命令分发到具体单位 |
| PlanningJobMachine (XState) | ✅ 稳定 | 生命周期状态管理 |
| Reflect 层 (POER) | ✅ 已补全 | 战后复盘 → 记忆写入 → 叙事事件 |
| TacticalSkillLibrary (Voyager) | ✅ 刚建成 | 战术模板积累 + 复用 |
| Mem0 记忆层 | ✅ InMemory | 将领独立记忆空间 |
| PVE 自动清剿 | ✅ 验证通过 | 52 节点，可清剿 |
| 前端 CopilotKit | ✅ 已接入 | AG-UI 实时流式渲染 |
| 地图 320×320 (102K tiles) | ✅ 可用 | Pixi.js 渲染 |

### 当前最大的结构性限制

1. **没有空间索引** — `getTileById()` 是 O(n) 线性扫描，102K 尚可，1M 必崩
2. **Theater 快照每 Tick 做 5-6 次全表扫描** — 最大性能杀手
3. **将领还没有真正的 "灵魂"** — GeneralAgent 是纯规则分发，没有 LLM 推理、没有个性化决策
4. **AI 之间没有社交层** — 外交、谈判、背叛、结盟全部缺失
5. **前端只有最基础的地图 + 面板** — 没有指挥台沉浸感
6. **单服务器单线程** — 无法支撑大规模并发

---

## 二、前沿技术研判：什么是真的，什么是泡沫

### 确信可用的（已有大量开源验证）

| 技术 | 代表项目 | 成熟度 | 对本项目的价值 |
|------|----------|--------|---------------|
| 记忆流 + 反思 + 规划 | [Generative Agents](https://github.com/joonspk-research/generative_agents) (Stanford) | ⭐⭐⭐⭐⭐ 学术+工程均验证 | **将领灵魂层的蓝图**。三维记忆权重(recency/importance/relevance)、递归计划分解、反思产生高层洞察 |
| 技能库积累 (Voyager) | [MineDojo/Voyager](https://github.com/MineDojo/Voyager) | ⭐⭐⭐⭐ | **你已实现 TacticalSkillLibrary**，方向正确。Voyager 还有自动课程机制可借鉴 |
| 分层 Agent 编排 (SOP) | [MetaGPT](https://github.com/geekan/MetaGPT), [CrewAI](https://github.com/crewAIInc/crewAI) | ⭐⭐⭐⭐ 工程成熟 | SOP 黑板模式直接映射军事指挥流程。MetaGPT 的共享消息池 = 战场态势板 |
| 长期记忆管理 | [Letta/MemGPT](https://github.com/letta-ai/letta), [Mem0](https://github.com/mem0ai/mem0), [LangMem](https://github.com/langchain-ai/langmem) | ⭐⭐⭐⭐ | Letta 的 core/archival/recall 三层记忆直接映射将领的性格/战史/对话 |
| GOAP/HTN/Utility AI | [crashkonijn/GOAP](https://github.com/crashkonijn/GOAP), GDC 系列论文 | ⭐⭐⭐⭐⭐ 经典成熟 | **GeneralAgent 降级策略的最佳选择**。LLM 调用失败/不值得时，Utility AI 作为零成本后备 |
| 空间索引 (rbush/quadtree) | [mourner/rbush](https://github.com/mourner/rbush), [timohausmann/quadtree-ts](https://github.com/timohausmann/quadtree-ts) | ⭐⭐⭐⭐⭐ 工业级 | 1M 格子地图的**必备基础设施** |
| LangGraph 状态图编排 | [langchain-ai/langgraphjs](https://github.com/langchain-ai/langgraphjs) | ⭐⭐⭐⭐ | 可能替代手写 POER 循环；内建检查点 + 人类审批中断点 |
| 语义缓存 | [zilliztech/GPTCache](https://github.com/zilliztech/GPTCache) | ⭐⭐⭐ | 类似态势下缓存 LLM 输出，节省 50-80% 调用 |
| Prompt 压缩 | [microsoft/LLMLingua](https://github.com/microsoft/LLMLingua) | ⭐⭐⭐ | 压缩态势描述 2-5x，保持 >95% 质量 |

### 部分可用但需适配的

| 技术 | 代表项目 | 状态 | 限制 |
|------|----------|------|------|
| 角色扮演对话 | [SillyTavern](https://github.com/SillyTavern/SillyTavern) | ⭐⭐⭐⭐ 社区极活跃 | 非游戏引擎，但 character card / lorebook 格式可直接复用于将领人设 |
| OpenAI Agents SDK | [openai/openai-agents-js](https://github.com/openai/openai-agents-js) | ⭐⭐⭐ 2025.3 发布 | 极简（Agent + Tool + Handoff + Guardrail），Handoff 映射指挥链，但太新 |
| 多 Agent 对话 | [microsoft/autogen](https://github.com/microsoft/autogen), [OpenBMB/AgentVerse](https://github.com/OpenBMB/AgentVerse) | ⭐⭐⭐ | AutoGen GroupChat 可做战时会议，但延迟和成本未优化 |
| RTS AI 竞赛框架 | [Lux AI](https://github.com/Lux-AI-Challenge/Lux-Design-S3), [MicroRTS](https://github.com/santiontanon/microrts) | ⭐⭐⭐ | 最接近 SLG 的 AI 竞赛平台，获胜方案 = 规则 + 搜索 + RL 混合 |

### 远期可关注但现在不该投入的

| 技术 | 为什么不是现在 |
|------|----------------|
| AlphaStar 式端到端 RL | 训练成本极高（TPU 集群），你没有那个算力预算 |
| 完全自主 Agent Swarm | 25 个 agent 就能让 GPT-4 成本爆炸，数百将领需要先解决成本金字塔 |
| LLM 直接做决策系统 | 幻觉风险太大，你的"翻译层"架构是正确的 |
| 联邦学习 / 多服务器状态同步 | 单服务器还没跑满，过早 |

---

## 三、代码库深度审计：性能瓶颈地图

### 🔴 CRITICAL — 堵塞 1M 扩容的红线

| 问题 | 位置 | 当前 102K | 到 1M 时 | 修复思路 |
|------|------|-----------|----------|----------|
| `getTileById()` O(n) 线性扫描 | rules.ts L107-112 | ~1.5M 字符串比较/tick | **15M/tick** | 加 `Map<string, Tile>` 缓存 |
| `buildTheaterSnapshot()` 5-6 次全表扫描 | theater.ts L19-73 | ~15ms/tick | **150ms/tick** | 合并扫描 + 增量更新 + 缓存 |
| `buildPveOpportunities()` 三重嵌套循环 | CommanderTools L489-540 | 可接受 | **100x+ 退化** | K-D 树空间索引 |
| `calculateFactionFoodIncome()` 全表 reduce | rules.ts L227-240 | 200K/tick | **2M/tick** | `tilesByOwner` 预分区 |

### 🟠 MAJOR — 不修会持续拖慢体验

| 问题 | 位置 | 修复思路 |
|------|------|----------|
| `selectPlannerLocalTiles()` O(n log n) 排序 | theater.ts L154-228 | Quadtree 范围查询 |
| `buildPassControlStatus()` 嵌套 find() | CommanderTools L424-467 | 用 tileById Map |
| `advanceTick()` 资源循环 O(f×u) | rules.ts L929-1050 | `unitsByFaction` Map |
| `summarizeRegion()` includes() 匹配 | theater.ts L82-127 | Set + 空间分区 |
| `nearestPveNode()` O(units × pve) | mockPlanner L27-38 | K-D 树 |

### 修复优先级建议

```
Phase 1（紧急，2-3h）: tileById Map + unitsByFaction Map → 立刻 30-40% 加速
Phase 2（核心，4-6h）: Theater 快照合并+缓存 + tilesByOwner 预分区 → 累计 50-60%
Phase 3（空间，6-8h）: rbush/quadtree + K-D 树 → 支撑 1M 格子
Phase 4（打磨，2-3h）: 增量更新 + 请求批处理 → 回到 LLM 调用主导
```

---

## 四、升级路线图：三个阶段

---

### 第一阶段：「基础强化」— 让当前系统达到生产质量

**主题**：修性能瓶颈 + 将领灵魂层 + 真正的 LLM 将领

#### 4.1 性能基础设施

| 项目 | 使用技术 | 效果 |
|------|----------|------|
| 全局 tileById Map | 原生 Map | getTileById O(1) |
| unitsByFaction / tilesByOwner 索引 | 原生 Map | 消除嵌套线性过滤 |
| Theater 快照增量缓存 | 脏标记 + 版本号 | 避免每 tick 全量重建 |
| rbush 空间索引 | `mourner/rbush` (npm) | 范围查询 O(log n) |

#### 4.2 将领灵魂层（Generative Agents 架构落地）

**核心思路**：把 Stanford Generative Agents 的三层架构（记忆流 + 反思 + 规划）嫁接到你的 GeneralAgent 上。

```
记忆流 (Memory Stream)
├── 每条记忆 = { content, importance, recency, embedding }
├── importance 打分：LLM 0-10 打分，或基于事件类型预设权重
├── 检索：recency × importance × relevance 加权排序
└── 当前 Mem0 已提供基础能力，需要加 importance 维度

反思 (Reflection)
├── 每 N Ticks 或累积 importance 超过阈值时触发
├── LLM 读最近 K 条记忆 → 产出 1-3 条高层洞察
├── 洞察写回记忆流（更高 importance 权重）
└── 例："东线连续三次进攻失败 → 洞察：敌方东线可能有隐藏防线"

规划 (Planning)
├── Commander 发战略意图
├── General 读意图 + 自身记忆 + 战区态势 → 分解为子任务
├── 子任务受个性参数调制（aggression=0.8 的将领偏好进攻方案）
└── 失败后自动修正（Voyager 迭代 prompting）
```

**关键决策**：GeneralAgent 什么时候调 LLM，什么时候用规则/Utility AI？

| 场景 | 用 LLM | 用 Utility AI | 理由 |
|------|--------|---------------|------|
| 收到新战略意图 | ✅ | | 需要理解自然语言意图 |
| 常规推进（巡逻、驻防） | | ✅ | 低价值重复决策 |
| 局势突变（遭遇敌主力） | ✅ | | 需要创造性应对 |
| 外交接触 | ✅ | | 谈判需要语义理解 |
| 资源分配 | | ✅ | 数值优化，规则更可靠 |

**Utility AI 作为降级层的参考实现**：

```typescript
// 将领 Utility AI 评估器
interface UtilityOption {
  action: string        // 'advance' | 'defend' | 'recon' | 'retreat'
  score: number         // 0-1 综合效用
  factors: {
    threat: number      // 威胁程度 → 防守权重
    opportunity: number // 进攻机会 → 进攻权重
    supply: number      // 补给充足度 → 持续作战权重
    fatigue: number     // 疲劳度 → 休整权重
    lordDirective: number // 盟主指令强度 → 服从权重
  }
}

// 效用函数：每个 factor 乘以将领个性系数
function evaluateUtility(general: GeneralProfile, option: UtilityOption): number {
  return option.factors.threat * (1 - general.personality.riskTolerance) * 0.3
       + option.factors.opportunity * general.personality.aggression * 0.3
       + option.factors.supply * 0.2
       + option.factors.lordDirective * general.personality.loyalty * 0.2
}
```

#### 4.3 Mem0 → Letta/MemGPT 升级路线

当前 Mem0 InMemory 模式足够 MVP。升级路线：

```
阶段 1（当前）: Mem0 InMemory → 验证记忆读写闭环
阶段 2: Mem0 + Qdrant (向量库) → 持久化 + 语义检索
阶段 3: 迁移到 Letta (MemGPT) → core/archival/recall 三层记忆
  - core memory = 将领性格 + 当前任务 + 对盟主态度（常驻 context）
  - archival memory = 历史战役记录（按需换入）
  - recall memory = 最近对话摘要
```

---

### 第二阶段：「将领社交 + 玩家对话」— 让 AI 有灵魂

**主题**：将领双模(聊天+战术) + 跨势力外交 + 玩家陪伴

#### 4.4 将领双模 Agent：聊天 + 工具调用

**核心架构**（参考 SillyTavern Character Card + OpenAI function calling）：

```
玩家消息 → 意图路由器 (轻量分类器)
            ├── "聊天模式" → 加载 character card + 记忆 → 角色化回复
            │   ├── 人设 prompt (性格、口头禅、历史)
            │   ├── lorebook (世界观知识库，按关键词触发注入)
            │   └── 近期记忆 (最近 20 条事件/对话)
            │
            └── "命令模式" → 加载战术 context + tools → structured output
                ├── 当前战区态势
                ├── 可用单位列表
                └── Zod schema 约束输出
```

**双模共享记忆**是灵魂的关键：

- 聊天中将领说"我不信任东线的情报" → 写入记忆 → 下次战术规划自动增加东线侦察权重
- 战术层将领执行了一次大败 → 聊天中会主动提及"上次在东线的失败让我至今心有余悸"
- 玩家经常批评将领的冒进 → `aggression` 参数漂移下降 → 后续决策更保守

**Character Card 格式**（借鉴 SillyTavern W++ 格式）：

```json
{
  "name": "赵云",
  "description": "常山赵子龙，忠义之将",
  "personality": "沉稳、忠诚、在关键时刻极度果断",
  "scenario": "你是盟主帐下最信任的先锋将领，负责东线战区",
  "first_mes": "主公，赵云在此。东线敌情复杂，请示今日方略。",
  "mes_example": [
    "{{user}}: 东线情况如何？",
    "{{char}}: 回禀主公，东线敌军在渡口集结约三千人，斥候报告其后方仍有援军调动。我建议先派侦骑确认敌军总数，再决定是否出击。冒然进攻恐中埋伏。"
  ],
  "system_prompt": "You are 赵云, a general in the player's alliance. Respond in character. When the player gives tactical orders, acknowledge and translate them into your understanding. When chatting casually, show your personality and reference your battle history."
}
```

#### 4.5 跨势力外交层

**架构**（参考 CAMEL 角色扮演 + AutoGen GroupChat）：

```
外交频道 = 两个势力将领的对话空间

将领 A (我方) ←→ 外交频道 ←→ 将领 B (敌方/中立)

每轮博弈：
1. A 读取态势 + 己方 doctrine + 盟主外交指令
2. A 提出提案（结盟、停火、领土交换）
3. B 读取态势 + 己方 doctrine
4. B 接受/拒绝/反提案
5. 结果写入双方记忆 + NarrativeEvent

约束：
- 所有协议提案经规则引擎校验（不能承诺自己给不了的东西）
- 盟主可设置外交底线（"绝不割让洛阳以东"）
- 将领可能违抗盟主外交指令（忠诚度低时）
- 欺骗是允许的（承诺停火然后偷袭），但会产生信任值后果
```

#### 4.6 玩家 AI 伴侣系统

**定位**：不是通用聊天机器人，而是"了解你的战争的参谋长"。

| 功能 | 技术实现 | 参考 |
|------|----------|------|
| 战略建议 | LLM 读态势摘要 → 给出 2-3 个可选方案 | Voyager 自动课程 |
| 战报解读 | LLM 读 NarrativeEvent → 用人话讲战果 | Generative Agents 反思 |
| 将领推荐 | 匹配任务需求 + 将领特长 + 忠诚度 | Utility AI 评分 |
| 闲聊 | Character card 模式，扮演"首席参谋" | SillyTavern 技术 |
| 回顾历史 | 从 NarrativeEvent 链生成战争编年史 | 因果链追溯 |

---

### 第三阶段：「百万格子 + 多服务器」— 让系统能承载大世界

#### 4.7 地图架构升级

**当前**：320×320 扁平数组，102K 格子

**目标**：东汉十三州，每州有详细地形（山脉、河流、城池、关隘），约 1M 格子

**架构方案**：

```
Layer 0: 宏观图 (Province Graph)
├── 13 个州 = 图节点
├── 州之间的连接 = 图边（关隘、渡口）
└── AI Commander 在这一层做战略决策 "先取荆州再图益州"

Layer 1: 战区图 (Sector Grid)  
├── 每州细分为 4-8 个战区（共 60-100 个）
├── 每战区约 10K-15K 格子
├── AI General 在这一层做战术决策
└── 用 rbush 做空间索引

Layer 2: 战术格 (Tile Grid)
├── 实际的百万格子
├── 单位行军、战斗、驻扎发生在这一层
├── 前端只渲染当前视口的格子（LOD）
└── 空间哈希 (Spatial Hashing) 做邻居查询

路径规划：
├── 跨州路径: HPA* (Hierarchical Pathfinding A*)
│   └── 先在 Province Graph 找粗路径，再在每个 Sector 内细化
├── 战区内路径: JPS (Jump Point Search)
│   └── 比 A* 快 5-10x，适合均匀网格
└── 参考库: PathFinding.js (qiao/PathFinding.js)
```

**关键技术选型**：

| 需求 | 技术 | 库 | 理由 |
|------|------|----|----|
| 空间范围查询 | R-tree | `mourner/rbush` | 矩形查询 O(log n)，纯 JS，无依赖 |
| 邻居查询 | Spatial Hashing | 手写 50 行 | 均匀网格下 O(1) |
| 跨区域路径 | HPA* | 手写基于 sector graph | 省级战略路径 |
| 区域内路径 | JPS | `qiao/PathFinding.js` | 战术级移动 |
| 前端渲染 | Pixi.js + LOD | 已有 Pixi.js | 只渲染视口 ± buffer |

#### 4.8 东汉十三州地形系统

```
幽州：北方苦寒，地形以平原+山脉为主，长城
冀州：华北平原核心，高产粮区，黄河渡口
并州：太行山脉，多关隘，易守难攻
青州：东部沿海，渔盐之利
兖州：中原腹地，四战之地，无天险
徐州：东南沿海到内陆，连接南北
豫州：汝颍之地，人才济济
荆州：长江中游，南船北马交汇
扬州：长江下游，鱼米之乡，水网密集
益州：蜀道难，天险极多，入蜀出蜀路线有限
凉州：西北边陲，骑兵优势，丝绸之路
司隶：洛阳所在，政治中心，交通枢纽
交州：南方偏远，开发度低，热带地形
```

**地形对 AI 决策的影响**：

```typescript
interface TerrainEffect {
  movementCost: number       // 行军消耗
  defensiveBonus: number     // 防守加成
  supplyDecay: number        // 补给衰减
  reconDifficulty: number    // 侦察难度
  siegeModifier: number      // 攻城修正
  ambushRisk: number         // 伏击风险
}

// AI 将领需要理解地形
// "益州蜀道难行，补给衰减极快，只宜据守不宜远征"
// 这种知识从地形数据中自动生成，不需要硬编码在 prompt 里
```

---

## 五、技术架构演进

### 当前架构

```
React + Pixi.js ──── HTTP ──── Node.js 单线程服务器
    │                              │
    └── CopilotKit ────────────── POER Engine (手写)
                                   │
                                   ├── CommanderAgent (LLM)
                                   ├── GeneralAgent (规则)
                                   ├── ReflectService (LLM)
                                   └── Mem0 (InMemory)
                                   │
                                   └── ModelGateway → 中转站/本地 Qwen
```

### 目标架构（第二阶段结束时）

```
React + Pixi.js + LOD ──── HTTP/WS ──── Node.js 服务器
    │                                        │
    ├── CopilotKit (AG-UI) ─────────────── POER Engine
    │                                        │
    ├── 将领聊天 UI ────────────────────── 双模 Agent Router
    │   (Character Card + lorebook)          │
    │                                        ├── CommanderAgent (LLM, 强模型)
    └── 指挥台仪表盘 ──────────────────── │
                                             ├── GeneralAgent (LLM, 中等模型 + Utility AI 降级)
                                             ├── UnitAgent (规则 / 小模型)
                                             ├── ReflectService (LLM)
                                             ├── DiplomacyAgent (LLM, 跨势力)
                                             └── NarratorAgent (LLM, 叙事生成)
                                             │
                                             ├── Letta/MemGPT (将领记忆)
                                             ├── GPTCache (语义缓存)
                                             ├── rbush (空间索引)
                                             └── ModelGateway (分层调度)
                                                  ├── 强模型: GPT-4o/Claude → Commander
                                                  ├── 中模型: GPT-4o-mini/Qwen-14B → General
                                                  └── 小模型: Qwen-2B (本地) → Unit/分类
```

---

## 六、成本模型预估

### 单玩家每日 LLM 调用预算

假设每天游戏 30 Tick（约 1-2 小时）：

| Agent 层 | 模型 | 调用次数/天 | 每次 token | 单价 (中转站) | 日成本 |
|----------|------|------------|-----------|-------------|--------|
| Commander | GPT-4o | 30 | ~2000 in + 500 out | ~$0.005/call | $0.15 |
| General ×5 | GPT-4o-mini | 150 | ~1000 in + 300 out | ~$0.0003/call | $0.045 |
| Reflect | GPT-4o-mini | 30 | ~1500 in + 300 out | ~$0.0003/call | $0.009 |
| 将领聊天 ×20 | GPT-4o-mini | 20 | ~800 in + 200 out | ~$0.0003/call | $0.006 |
| Unit (规则) | 无 | 300 | 0 | $0 | $0 |
| **合计** | | | | | **~$0.21/天/玩家** |

### 成本控制手段

| 手段 | 预期节省 | 实现难度 |
|------|----------|----------|
| 语义缓存 (GPTCache) | 30-50% 重复态势 | 中等 |
| Prompt 压缩 (LLMLingua) | 20-40% token | 中等 |
| Utility AI 降级 | 50-70% General 调用 | 低（已有框架） |
| 本地 Qwen 处理 Unit 层 | 100% Unit 层零 API 成本 | 已有 |
| KV Cache 复用 (vLLM) | 30-60% 共享前缀 | 高（需要自部署） |

**乐观预估**：应用全部手段后，每玩家日成本可降至 **$0.05-0.10**。

---

## 七、诚实评估：什么是未解决的难题

### 难题 1：LLM 空间推理能力弱

LLM 不擅长处理坐标、距离、方向。当前的解决方案是把空间信息翻译成语义描述（"A 点在 B 点东北方向，距离 8 格"），但这有上限——复杂的包抄机动、多路合围等战术，LLM 很难正确规划。

**现实方案**：空间推理交给规则引擎/搜索算法，LLM 只负责决定"做什么"（进攻/防守/包抄），不负责"怎么走"。

### 难题 2：多 Agent 对话的成本和延迟

让 5 个将领在开战前"开会讨论"是一个有吸引力的设计，但每轮对话需要 1 次 LLM 调用 × 5 个 agent × 3-5 轮 = 15-25 次 LLM 调用。在实时游戏中这是不可接受的。

**现实方案**：绝大多数协调通过结构化消息（命令 + 状态回报），只在关键节点（大战前、外交谈判）触发真正的 LLM 对话。

### 难题 3：将领个性的一致性

让 LLM 长期保持一个角色的一致性格是已知难题。将领在第 50 Tick 的决策风格可能和第 1 Tick 完全不同，即使性格参数没变。

**现实方案**：
- 每次调用在 system prompt 中注入完整人设 + 最近行为摘要
- 用 Letta/MemGPT 的 core memory 保持关键人设"钉"在上下文中
- 定期用评估器检测个性漂移并校正

### 难题 4：涌现性 vs 可控性

我们想让将领之间涌现出背叛、结盟等有趣行为，但又不能让系统完全失控（比如所有将领同时叛变导致游戏崩溃）。

**现实方案**：
- 规则引擎设置硬约束（忠诚度 > 0.3 才能叛变，叛变有冷却期）
- AI 在约束内自由发挥
- 类似 AlphaGo 的 MCTS：探索空间很大，但被规则限定了合法着法

### 难题 5：Android 打包 + 本地推理

用户提到未来要打包成单文件 exe / Android APK。Node.js 后端 + React 前端 + 本地 LLM 在移动端是严峻挑战。

**现实方案**：
- 桌面端：Electron / Tauri 打包 → 可行，Tauri 更轻量
- 移动端：所有 LLM 推理走云端中转站，客户端只做渲染和输入
- 本地推理（移动端）：ONNX Runtime Mobile + 量化小模型（< 2B），但只能做 Unit 层级的简单判断

---

## 八、下一步行动建议

### 立刻可以做的（0-2 周）

1. **Phase 1 性能修复**：加 tileById Map + unitsByFaction Map → 立刻 30-40% 加速
2. **GeneralAgent 接入 LLM**：用中转站的 GPT-4o-mini，让第一个将领有"思考"能力
3. **Utility AI 降级层**：当 LLM 超时/超预算时，GeneralAgent 自动切到效用函数

### 接下来应该做的（2-6 周）

4. **将领 Character Card 系统**：定义人设格式 + lorebook + 聊天 API
5. **Theater 快照增量缓存**：消除最大性能瓶颈
6. **rbush 空间索引**：为 1M 格子做准备
7. **Mem0 → Letta 迁移评估**：先在一个将领上试 Letta，对比 Mem0

### 远期规划（6-12 周）

8. **东汉十三州地形生成**：Layer 0/1/2 三层地图架构
9. **HPA* 跨区域路径规划**
10. **外交层 MVP**：两个 AI 将领的谈判系统
11. **语义缓存**：GPTCache 接入降本
12. **Tauri 桌面打包**

---

## 九、推荐阅读优先级

| 优先级 | 资源 | 你会从中获得什么 |
|--------|------|-----------------|
| 🔴 P0 | Generative Agents 论文 | 将领灵魂层的完整蓝图 |
| 🔴 P0 | Letta (MemGPT) GitHub + 文档 | 三层记忆架构的工程实现 |
| 🔴 P0 | `mourner/rbush` README | 10 分钟理解空间索引 |
| 🟡 P1 | MetaGPT 源码（SOP + 黑板部分） | 多 Agent SOP 编排参考 |
| 🟡 P1 | SillyTavern Character Card 规范 | 将领人设格式标准 |
| 🟡 P1 | Dave Mark 的 GDC Utility AI 演讲 | 零成本降级决策方案 |
| 🟢 P2 | LangGraphJS 教程 | 可能的 POER 编排替代 |
| 🟢 P2 | Lux AI S3 获胜方案分析 | 规则+搜索+RL 混合参考 |
