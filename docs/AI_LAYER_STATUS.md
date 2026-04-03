# AI 层现状盘点 · 2026-03-19

> 本文档基于代码审计 + 多轮仿真测试生成，供产品决策参考。  
> 覆盖：已实现什么、测试证明了什么、真人玩家复用路径、以及当前偏离方向及选项。

---

## 一、你可能不清楚的关键事实

### 1. 「AI 玩家」和「武将」是同一个东西

你大概以为：**AI 玩家** → 招募 **武将** → 用武将打仗。

实际实现是：**将领（GeneralAgent）就是 AI 将领**，没有单独的 AI 玩家层。

- 每个势力有 **10 个单位**（`UNITS_PER_FACTION = 10`），对应 10 个 AI 将领。
- 每个单位内嵌了一名英雄（武将）：攻城/统率/智力/魅力/速度/traits/招牌技能，这套属性驱动战斗结算。
- GeneralProfileStore 中每个将领有独立「灵魂档案」：个性、忠诚度、历史、记忆、与主公的关系张力。
- **武将不是招募来的，是在建立势力时预分配的**——共 305 个将领档案，13 AI 势力各 22 个，玩家势力 10 个。

### 2. 现在的系统已经跑起来了什么规模

最新 5-tick mock 仿真结果：
```
13 势力 × 10 将领 = 130 个 AI 将领并行运作
65 次战略规划（每 tick 每势力一次 CommanderAgent），0 次失败
8 场势力间真实战斗（规则引擎裁决）
外交事件触发 2 次（停战协议自动生成）
全部将领的忠诚度/战斗记忆实时漂移
```

50-tick 完整仿真（之前测试）：
```
650 次规划，所有势力正常存活至 T50
T7 全 13 势力触达 500 格，自动"立国"
31 次 AI-to-AI 外交触发
```

### 3. Reflect（复盘）是真的在跑的

每个 Tick 结束后，ReflectService：
1. 生成语义化叙事事件（NarrativeEvent：battle / diplomacy / betrayal / achievement / failure）
2. 涉事将领档案立即更新（lodTrust/loyalty/pendingGrievance）
3. 有意义的战役写入 TacticalSkillLibrary（Voyager 模式技能积累，供下次 LLM 规划召回）
4. 并行写入 Mem0 记忆（当前无 API key 时降级为 InMemory 关键词匹配，重启后丢失）

### 4. 真人已有接入框架

`/api/session/join` 可以让真人占据一个势力槽，其余 AI 代管。  
`/api/generals/:id/chat` 已实现——真人可以直接和任意将领对话，双模：
- `mode: 'chat'`：自由对话，将领 in-character 回答
- `mode: 'order'`：自然语言下令，系统自动解析为结构化 ExecutableOrder

---

## 二、AI 层完整实现地图

### 已完整实现（方案扎实，可直接拿来用）

| 模块 | 核心能力 | 文件位置 |
|------|----------|---------|
| **CommanderAgent** | LLM 战略规划；双层 Zod 校验；Guard 过滤；接入 nemotron-120B；失败自动降级 mock | `server/src/agents/commander/` |
| **GeneralAgent UtilityAI** | 效用函数决策；4 种兵种原型；个性调制（aggression/risk/loyalty/speciality）；HPA* 可达性校验 | `server/src/agents/general/GeneralUtilityAI.ts` |
| **GeneralAgent LLM 增强** | 接入 LLM 网关；8s 超时自动降级；mock 模式下 skipLLM | `server/src/agents/general/GeneralLLMAdapter.ts` |
| **GeneralProfileStore** | 305 将领档案持久化（JSON 分文件）；Reflect 反馈触发 loyalty/lordTrust 漂移；MAX 20 条短期记忆 | `server/src/agents/general/GeneralProfileStore.ts` |
| **ReflectService** | POER 完整闭环；生成 NarrativeEvent causalChain；并行写 Mem0；Voyager 技能积累 | `server/src/agents/reflect/ReflectService.ts` |
| **DiplomacyAgent** | AI-to-AI 外交提案；LLM 生成 in-character 文本；规则引擎裁决世界变更；停战 duration/guard 保护 | `server/src/agents/general/DiplomacyAgent.ts` |
| **GeneralNegotiationChannel** | 距离 ≤ 5 格触发谈判窗口；TTL = 3 tick 自动过期 | `server/src/agents/general/GeneralNegotiationChannel.ts` |
| **GeneralChatService** | 双模（chat/order）；历史持久化；玩家直接下令 | `server/src/agents/general/GeneralChatService.ts` |
| **规则引擎** | advanceTick 裁决一切，AI 只能提案 | `shared/domain/rules.ts` |
| **PlanningJobMachine** | XState 生命周期（queued/running/succeeded/failed/stale） | `server/src/application/planning/` |
| **mockPlanner（增强版）** | Doctrine 关键词解析；4 种兵种原型；停战感知；敌军威胁扫描 | `server/src/fallback/mockPlanner.ts` |

### 框架实现（结构对，但有明显缺口）

| 模块 | 现状 | 缺什么 |
|------|------|--------|
| **Mem0 记忆层** | 接口完整，有召回/写入代码 | 无 `MEM0_API_KEY` 时退化为 InMemory 关键词匹配，进程重启后记忆全丢 |
| **三级自主权（L1/L2/L3）** | 枚举定义、autonomySource 字段存在 | 玩家实际上下线触发 L1→L2 切换的代码未打通 |
| **SessionManager（真人接入）** | join/heartbeat/leave 路由存在 | token 无签名验证，无账号持久化，多人同时在线未测试 |
| **前端指挥台** | React + CopilotKit 框架对接 | 地图显示和实际 AI 数据流的完整联动未验证 |

### 完全缺失（代码中找不到实现）

| 功能 | 影响 |
|------|------|
| **武将招募 API** | 玩家无法从将领池中主动招募特定武将组建阵容 |
| **玩家账号 + 鉴权系统** | token 无签名，无玩家持久化档案，换浏览器就失效 |
| **科技 / 升级系统** | `tech_levels` 字段在类型里存在，但无路由无逻辑 |
| **将领"5人小队"数据结构** | 每势力 10 单位是整体的，没有"玩家只管辖其中 5 个"的分组 |
| **NPC/野怪掉落 → 将领成长** | PVE 节点清除有战报，但无成长/宝物/技能解锁 |

---

## 三、测试说明了什么

### 这轮测试验证的核心命题

| 命题 | 结论 |
|------|------|
| 13 路 AI 并行，会死锁/崩溃吗？ | **不会**。650 次规划 0 次失败，Promise 并发控制稳定 |
| AI 势力会打仗吗？（B2 修复前） | **不会**。停战协议被重复生成导致永久和平 |
| AI 势力会打仗吗？（修复后） | **会**。5 tick 产生 8 场战斗，T25 左右势力接触频次显著增加 |
| 将领忠诚度/记忆会积累吗？ | **会**。每 tick 反馈写入，battlesWon/keyDecisions 随时间增加 |
| 单势力领土会有差异吗？ | **T5 前无差异**（地图太大，初始扩张均匀）；**T10 后开始分化**，优势势力 1.3x，T30 达最高 1.5-2x |
| AI 外交会主动发起吗？ | **会**。DiplomacyAgent 每 3 tick 约 2 对主动发起停战/联盟 |

### 测试暴露的结构问题（已修复的 B1-B5 + 本次发现）

- 停战协议之前会无限续约 → 势力接触后再也不打仗（**已修复**）
- CommanderAgent 的 commanderId 指向单位 ID 而非指挥官 ID → Reflect 记忆写入错误势力（**已修复**）
- 4 种兵种原型之前不存在 → 所有 130 个将领行为完全同质化（**已修复**）
- 领土比率 T30 仍然偏低（max/min ≈ 1.5-2x）→ 地图 320×320 对 13 势力来说太大，扩张期过长，战争期迟到

---

## 四、为真人玩家接管准备好了什么

### 可以直接复用的「管道」

真人玩家统领自己的 N 个 AI 将领，本质上是：**把 CommanderAgent 的职责交给真人**。

```
【现在】
AI CommanderAgent（LLM 规划）→ GeneralAgent 分发 → 规则引擎执行

【复用后】
真人玩家（对话/命令） → 同一套 GeneralAgent 分发 → 规则引擎执行（不变）
```

可直接复用的接口：

| 接口 | 真人怎么用 |
|------|---------|
| `POST /api/planning/create` | 真人输入一句话战略意图，CommanderAgent 自动分解为 N 个将领的命令 |
| `POST /api/generals/:id/chat` | 真人直接找某将领说话，将领用 in-character 语言回应，也可接受中文下令 |
| `GET /api/narratives` | 真人读取战报流，了解将领们在做什么 |
| `GET /api/generals/profiles` | 查看自己麾下将领的忠诚度、个性、最近决策 |
| `GET /api/events/stream` | SSE 实时推送，前端地图自动刷新 |
| CopilotKit Sidebar | 真人通过 AI 对话界面实时规划，AG-UI 协议流式渲染将领行动 |

### 将领会「记住」真人玩家做过的事

因为 ReflectService + GeneralProfileStore 已经跑通，所以：
- 真人赏罚将领 → lordTrust 漂移
- 忽视某将领 N 次 → recentIgnored 增加，触发 pendingGrievance（将领心理积怨）
- 真人赢得重要战役 → Voyager TacticalSkillLibrary 写入此战术，下次 LLM 规划时自动召回

---

## 五、偏离方向的问题 & 选项（需要你来选择）

---

### 问题 A：武将招募——现在根本没有

**你以为**：每个 AI 玩家可以去招募武将。  
**实际**：将领在建立势力时预分配，没有招募接口。

**选项 A1（轻量）**：不做招募，保留预分配，但开放「换将」接口——玩家可以把麾下某将领替换成将领池中的另一个，代价消耗（粮草/时间/忠诚损失）。  
**选项 A2（完整）**：实现招募市场——每隔 N tick 刷新 3-5 名可招募武将（从 305 档案 pool 里随机抽），玩家花费资源招募，加入自己麾下。需要新建 `/api/recruit` 路由和前端市场 UI。  
**选项 A3（不做）**：这个阶段不做招募，专注核心战争体验，后续迭代补充。

---

### 问题 B：真人管 5 个将领 vs 管 10 个将领

**当前**：每势力固定 10 个将领，无分组，真人接入后管全部 10 个。  
**你的愿景**：每个真人玩家管 5 个 AI 将领，一个势力可以有多个真人玩家协作。

**选项 B1（简单）**：一个玩家 = 一个势力，管理全部 10 个将领（现在就能做）。  
**选项 B2（分组，中等工作量）**：新增「分队」概念——1 个势力 = 2 支队伍各 5 将，每支队伍可分配给 1 名玩家；玩家只对自己队伍的将领下命令，系统合并规划后送规则引擎。  
**选项 B3（全拆）**：把现在 10 单位势力拆成「同盟」——多个玩家各自建立独立的小势力（5 单位），联盟体系共享外交协议。这是架构级改动，工作量最大。

---

### 问题 C：记忆是假的（Mem0 无 API Key）

**当前**：将领的长期记忆用关键词匹配，进程一重启全丢。  
**影响**：将领无法真正「记住」玩家 3 天前说的话，Voyager 技能在重启后失效。

**选项 C1（立即可做）**：用 Mem0 提供的免费 tier（需注册账号，配 `MEM0_API_KEY` 环境变量），接入真实语义检索。预计 1 小时配置完成。  
**选项 C2（离线）**：换用本地 embedding（llama.cpp + embedding 模型），无网络依赖，但安装复杂。  
**选项 C3（先跳过）**：记忆降级可接受，等 MVP 稳定后再做记忆升级。

---

### 问题 D：玩家账号系统缺失

**当前**：`/api/session/join` 返回一个无签名 token，换浏览器就失效，无玩家档案持久化。  
**影响**：多人同时在线时无法区分不同玩家；真人玩家的「威望/历史」无法跨 session 保存。

**选项 D1（轻量，1-2天）**：用 JWT 给 session token 签名，localStorage 持久化，服务端验证；不建数据库，用 JSON 文件存玩家档案。  
**选项 D2（完整）**：引入 SQLite/PostgreSQL 存储玩家账号，对接社交登录（至少 GitHub OAuth）。  
**选项 D3（MVP 跳过）**：先单人测试，账号系统在正式玩测前再补。

---

### 问题 E：地图太大，战争来得太晚

**当前**：320×320 地图，13 势力初始各 195 格，T5 才第一次接触（8 场战斗），T25 以后才进入密集战争期。  
**感受**：前 20 tick 像开地，战略博弈迟到，不「紧张」。

**选项 E1（调参，立即可做）**：把 `UNITS_PER_FACTION` 从 10 → 6，初始领土缩减（195 → 80 格），让势力从 T3 就开始接触。  
**选项 E2（缩地图）**：把模拟地图从 320×320 缩到 180×180（牺牲部分真实中国地图精度）。  
**选项 E3（加中立怪）**：在势力间路上放置 PVE 节点，减缓扩张速度，人为制造接触摩擦。  
**选项 E4（保持现状）**：不改，等 50-tick 自然进入战争期，地图比例对应「真实十三州面积感」。

---

## 六、一句话总结现状

> 技术底层（AI 决策链）已经完整且可验证；  
> 游戏层（武将招募、玩家账号、分队管理）完全空白；  
> 真人接管路径清晰，核心管道（CommanderAgent → GeneralAgent → 规则引擎）真人可以直入角色，5个AI将领的绑定只差分组数据结构。

---

*最后更新：2026-03-19 | 生成自 AI 代码审计 + tmp/test_fixes.json 仿真数据*
