[Memory Document Rule / Must Follow]

If a user message includes a memory reference starting with `codex://threads/`, do not assume it is stored in the repo.
Always search C drive first.

Primary lookup paths:
- `C:\Users\Buffoon Queer\.codex\sessions\YYYY\MM\DD\rollout-*-<thread_id>.jsonl`
- `C:\Users\Buffoon Queer\.codex\.codex-global-state.json` (for thread context lookup)

Required read order:
1. Read the top section of the session file as the summary source.
2. Then read the latest relevant conversation blocks in the same file.
3. Do not conclude "no memory found" before finishing C-drive lookup.

---

## 【最高优先级：中文编码安全规则 — 必须先读并遵守】

本仓库包含大量中文注释、中文前端文案、中文业务内容。
使用不安全的文件读写方式极易造成中文乱码，引发灾难性仓库污染。

### 编码强制规则（适用于 Copilot / Claude / 任何 AI 助手）

1. **禁止直接用 `node -e`、`Get-Content`、shell 重定向等方式输出中文内容到终端**  
   — Windows PowerShell 默认编码为 GBK/CP1252，Node.js 输出 UTF-8，两者不匹配必然乱码。

2. **所有涉及中文内容的终端读写，一律优先用 `py -3.11` 脚本执行**，并显式指定 `encoding='utf-8'`：
   ```python
   with open('file.json', 'r', encoding='utf-8') as f:
       content = f.read()
   ```

3. **需要在终端输出中文内容时（如查看 JSON 报告、模拟结果等），必须先执行**：
   ```powershell
   chcp 65001
   $env:PYTHONIOENCODING = 'utf-8'
   ```
   或者改用 Python 脚本输出，绕过 PowerShell 编码问题。

4. **文件写入时同样必须用 Python + UTF-8**，禁止用 PowerShell `Out-File` 或 shell 重定向写中文内容。

5. **修改中文内容（注释、文案、变量名）后，必须用 Python 脚本验证文件编码未损坏**：
   ```python
   with open('file.ts', 'r', encoding='utf-8') as f:
       print(f.read()[:500])  # 验证中文字符正常
   ```

6. **使用 read_file 工具直接读取文件内容是安全的**（工具内部处理编码），不会乱码。  
   **使用 grep_search、file_search 工具也是安全的**。  
   **不安全的是：在 PowerShell/cmd 终端中直接 cat/type/node 输出含中文的文件内容**。

7. **快速验证终端是否支持 UTF-8**（每次开始新终端会话时检查一次）：
   ```powershell
   [Console]::OutputEncoding.WebName  # 应该输出 utf-8
   ```
   如果不是 utf-8，先执行 `chcp 65001`。

### 乱码的根源（技术说明）

Windows PowerShell 终端默认使用系统区域编码（通常是 GBK 936 或 CP1252）。
Node.js、tsx、npx 等工具输出 UTF-8 编码的中文字符串时，
终端用错误的编码解读字节流，导致 `洛阳` 变成 `娲涢槼`，`领土` 变成 `棰嗗湡` 等乱码。
这不影响文件本身（文件内容正确），只影响终端显示和通过 shell 管道传递的数据。

### 开发提速规则（快速迭代原则）

- 能并行就并行：多个独立任务同时调用工具，不串行等待
- 先找现有正式入口，再考虑新建脚本
- 禁止在 `tmp/` 以外新建一次性验证脚本作为正式交付
- 临时脚本必须标注"临时验证、不可作为正式交付入口"
- 最终结论必须基于正式入口或仓库原生脚本复现
- 每次编码前先输出：复用入口清单、不新建脚本的承诺

---

1. Read the top section of the session file as the summary source.
2. Then read the latest relevant conversation blocks in the same file.
3. Do not conclude "no memory found" before finishing C-drive lookup.

---



【我们现在正在做的项目】

我们正在构思并推进一个“AI 原生同盟战争 / SLG 指挥系统”方向的项目。

这个项目不是传统的挂机手游，不是普通聊天机器人，也不是那种依附在闭源手游上的第三方外挂式 AI 代理。

我们真正想做的是一种新的系统：
让真人玩家扮演盟主、指挥官、管理层，
让 AI 扮演盟员、官员、执行者。

也就是说，玩家主要负责：
- 制定战略目标
- 决定优先级
- 判断打哪、守哪、什么时候进攻、什么时候保守
- 处理大战略和组织方向

而 AI 主要负责：
- 理解当前局势
- 把玩家的战略拆成可执行任务
- 分配不同单位去执行行动
- 在地图上完成侦察、行军、驻防、支援、占点等行为
- 在局势变化后重新规划
- 输出战报、局势摘要和建议

【我们要解决的问题】

传统 SLG / 同盟战争游戏里面，最难、最稀缺的其实不是点操作，而是“组织能力”。

主要问题包括：
1. 大量真人协作成本太高
2. 管理层长期指挥非常累
3. 普通玩家很难真正体验到盟主和指挥官的快感
4. 同盟执行力高度依赖大量真人在线、纪律、重复劳动
5. 如果继续走闭源手游第三方 AI 代理路线，会遇到很多问题：
   - 要靠截图、OCR、模拟点击
   - 很脏很累
   - 适配困难
   - 容易被封
   - 有法务风险
   - 永远受制于别人的系统

所以我们想跳出这条路线，直接做一个“天生适合 AI 参与”的原生系统。

【这个项目的核心特色】

这个项目的核心特点包括：

1. 真人定战略，AI 组织执行
2. 游戏世界从设计开始就适合 AI 理解
3. 所有状态、资源、目标、行动尽可能结构化
4. 尽量 API 化 / JSON 化 / 工具化
5. AI 主要通过结构化状态和工具调用来行动，而不是靠看图乱点
6. 项目的乐趣核心不是代练，而是“管理感、指挥感、组织感”
7. 未来可能形成“少量真人高层 + 大量 AI 盟员”的大型战争组织体验
8. 商业上未来不一定只是卖游戏本体，也可能包括 AI 官员、联盟工具、战术模板、剧本、创作者生态等
9. 技术上未来不一定只是接入 LLM，也可能包括强化学习、模仿学习、专用规划算法等
10. 这个项目的目标用户可能是喜欢 SLG / 同盟战争的玩家，但更喜欢战略和指挥，而不是点操作；也可能是对 AI 代理感兴趣的玩家，想体验让 AI 帮自己打游戏的感觉；还可能是对大型多人在线协作感兴趣的玩家，想体验和 AI 一起组织大规模战争的感觉。
11. 这个项目的核心挑战可能包括：如何设计一个既适合 AI 理解又有趣的游戏世界；如何让 AI 能够有效地理解玩家的战略意图并转化为具体行动；如何处理大量 AI 盟员的行为协调和资源分配；如何让玩家能够清晰地看到 AI 的决策过程和战报；如何保持系统的稳定性和可扩展性。
12. 这个项目的核心价值在于：为玩家提供一种全新的 SLG / 同盟战争体验，让他们能够真正感受到指挥官的快感；同时也为 AI 代理技术提供一个有趣的应用场景，推动 AI 在游戏领域的发展。
13. 这个项目的核心风险可能包括：AI 理解和执行能力不足，导致玩家体验不佳；系统复杂度过高，导致开发和维护困难；玩家对 AI 的接受度不高，导致市场反响平淡；以及可能的技术挑战，如如何实现高效的规划算法和稳定的系统架构。
14. 为了降低风险，我们计划采用迭代开发的方式，先实现一个最小可行产品（MVP），验证核心玩法和 AI 交互的可行性，然后逐步增加功能和复杂度。同时，我们也会积极收集玩家反馈，调整设计和开发方向，以确保最终产品能够满足玩家的需求和期望。
15. 从技术实现的角度，我们可能会采用一些现有的 AI 技术和工具，如强化学习算法、模仿学习算法、自然语言处理技术等，同时也可能需要开发一些定制的算法和工具，以满足我们特定的游戏设计需求。
16. 从商业模式的角度，我们可能会采用免费游戏加内购的模式，玩家可以免费下载和试玩游戏，但需要购买一些高级功能、AI 官员、更强的大语言模型、爆率更高的武将等来获得更好的体验。同时，我们也可能会考虑订阅模式，提供持续的内容更新和服务支持。
17. 最终，我们希望这个项目能够成为一个成功的游戏产品，吸引大量玩家，并且在 AI 代理技术的发展中占有一席之地。我们也希望通过这个项目，能够探索出一些新的游戏设计和 AI 应用的可能性，为未来的游戏和 AI 发展提供一些有价值的经验和启示。
18. 这个项目的开发周期可能会比较长，因为我们需要从零开始设计和实现一个全新的系统，同时还需要不断地测试和调整 AI 的行为和玩家的体验。我们计划分阶段进行开发，每个阶段都有明确的目标和里程碑，以确保项目能够按计划推进。
19. 在项目的早期阶段，我们可能会先实现一些基本的功能，如玩家制定战略目标、AI 理解当前局势并生成简单的行动计划等，以验证核心玩法的可行性。然后，我们会逐步增加更多的功能和复杂度，如更复杂的战略目标、更智能的 AI 行为、更丰富的游戏世界等。
20. 在项目的后期阶段，我们可能会重点优化 AI 的行为和玩家的体验，确保系统的稳定性和可扩展性，并且准备好进行市场推广和商业化运营。

## 实施计划
1.打算走多子代理开发。不要让一个工程师完成全部的任务，并且前后端分离，
# 项目主上下文提示词
# 发给 Claude / Codex / Copilot 时直接粘贴此文件内容

---

## 一、你在帮我做什么

你在帮我开发一款 **AI 原生 SLG 手游**，它的本质不是"加了 AI 辅助的策略游戏"，而是一种全新的媒介形式：

> **"让人类第一次有机会，在一个由 AI 构成的文明里，体验真正的权力、信任、仇恨和史诗。"**
>
> **"一个多人驱动的、以 AI 为一等公民的文明模拟器——人类作为意志的注入者，AI 作为这个意志的文明执行者。"**

这不是口号，这是每一个工程决策的判断标准。

---

## 二、游戏框架（核心范式）

### 指挥层级

```
人类玩家（盟主）         ← 意志注入者，可微操，可对话调教任意 AI
    ↓ 战略意图
CommanderAgent           ← 强模型，每 Tick 调用一次，产出战区级计划
    ↓ 战区指令
GeneralAgent × N         ← 中等模型，每位将领负责一个战线或职能
    ↓ 单位指令
UnitAgent / 规则执行       ← 小模型或纯规则，数百个，近零成本
    ↓
规则引擎（authoritative） ← 永远是世界的最终裁决者，AI 只能提案
```

### 核心原则

- **AI 只能提案，不能直接改世界。** 所有 world mutation 必须经过规则引擎。
- **人类的真正技能是塑造 Doctrine（治国方略）**，不是微操。你经常惩罚冒进，文明就演化出保守风格；你奖励情报优先，将领们就主动请求更多侦察资源。
- **将领是真实角色，不是工具。** 每位 GeneralAgent 有持久身份档案：历史战役、决策记录、与盟主的关系张力、忠诚度变量。长期被忽视的将领会产生消极怠工；重大功勋被无视会触发忠诚漂移。
- **AI 与 AI 之间存在真实的社会层。** 跨联盟的将领们在外交频道相遇时发生真实博弈——谈判、欺骗、结盟、背叛——没有人写剧本，这些故事从系统中自然涌现。
- **每一场战争都能生成可追溯的史诗。** 因为系统是结构化的、可记录的，每个决策都有来源，每段历史都可以被还原成有因果、有张力的战争叙事。

### 规模目标

- 初期地图：约 1 万格子
- 后期地图：约 100 万格子
- 每位玩家：数十到数百人AI 将领
- 全服玩家：数人到数百人，形成涌现性的文明生态

---

## 三、当前已有的系统基础（不要推翻）

当前仓库已有：

- `WorldState` — 世界状态权威定义
- `StrategicPlan` / `ExecutableOrder` — 计划结构
- `queuePlanExecution` / `advanceTick` — Tick 推进与规则执行
- 战报、情报、任务状态回写
- `shared/contracts` — 前后端共享类型契约
- `shared/schemas` — Zod schema 校验
- `server/` — Node.js 原生 HTTP 后端（非 Fastify），已有 `/api/planning/create`、`/api/world`、`/api/replay`
- `CommanderAgent` 已接入 `PlanningService`，完整 LLM 调用链 + 双层 Zod 校验 + Guard 守卫
- `GeneralAgent` 已实现（当前为纯规则层，未来将接入中等模型 LLM）
- `GeneralProfileStore` — 将领持久身份档案（已落盘 JSON 序列化）
- `ReflectService` — POER Reflect 层，每 tick 后生成 NarrativeEvent + 记忆写入
- `PlanningJobMachine` — XState 生命周期状态机（queued/running/succeeded/failed/stale）
- `ModelGatewayAdapter` — 模型网关抽象，已接 OpenAI 兼容协议，含 retry/timeout/budget-cap
- 本地 Qwen 模型服务默认端口 `127.0.0.1:8080`（后端自身运行在 `:8787`）
- 自定义 tracing（console/内存），Langfuse 尚未接入

**规则引擎是最有价值的部分，任何时候都不能被 AI 替换，只能被 AI 驱动。**

---

## 四、当前最缺的三个模块（你需要帮我建的）

### 模块 1：将领灵魂层（GeneralAgent 持久身份）

每位将领需要一个活的档案，包含：

```typescript
interface GeneralProfile {
  id: string                    // 唯一 agent_id
  name: string                  // 将领名号
  personality: {
    aggression: number          // 0-1，激进程度
    loyalty: number             // 0-1，当前忠诚度（可漂移）
    riskTolerance: number       // 0-1，风险偏好
    speciality: string          // 'flanking' | 'siege' | 'diplomacy' | 'recon'
  }
  history: {
    battlesWon: number
    battlesLost: number
    keyDecisions: string[]      // 语义化的关键决策记录
    diplomaticContacts: string[] // 接触过的其他势力将领 id
  }
  relationship: {
    lordTrust: number           // 对盟主的信任度
    recentIgnored: number       // 连续被忽视的次数（触发漂移阈值）
    pendingGrievance: string[]  // 未被响应的异议记录
  }
  memory: {
    shortTerm: string[]         // 最近 20 条行动和对话
    longTermSummary: string     // 由 Mem0 管理的长期压缩记忆
  }
}
```

**使用 Mem0 实现记忆层**：
- `memory.add(battleReport, agentId)` — 每次 Tick 结束后写入
- `memory.search(currentSituation, agentId)` — 每次规划前召回相关记忆
- `agent_id = general.id`，每位将领独立记忆空间

### 模块 2：世界叙事流（因果链事件记录）

不是原始 event log，而是语义化的叙事片段：

```typescript
interface NarrativeEvent {
  tick: number
  type: 'battle' | 'diplomacy' | 'betrayal' | 'achievement' | 'failure'
  actors: string[]              // 涉及的将领/势力 id
  summary: string               // 一句话叙事描述
  causalChain: string[]         // 导致此事件的前置事件 id 列表
  consequences: string[]        // 此事件导致的后续影响（可在后续 tick 填入）
  significance: 'minor' | 'major' | 'epic'
}
```

这个流是未来自动生成战争史诗的原材料，也是 AI 做决策时的历史上下文。

### 模块 3：POER 闭环（感知-决策-执行-复盘）

```
Perceive  → 语义化世界摘要（不是原始 WorldState，是裁剪后的叙事摘要）
Order     → CommanderAgent → GeneralAgent 分发 → 结构化 StrategicPlan
Execute   → 规则引擎 Tick 推进（已有，不动）
Reflect   → 执行结束后 AI 读取战报，对比预期，写入 Mem0，更新 NarrativeEvent
```

Reflect 层目前完全缺失，是最优先要补的环节。

---

## 五、技术栈选型（已锁定，不要换）

### 后端

- Runtime: Node.js + TypeScript
- HTTP: Node.js 原生 `node:http`（当前实现；未来可迁移至 Fastify）
- Schema: Zod
- State machine: XState
- Agent framework: 手写 TypeScript Agent（CommanderAgent/GeneralAgent/ReflectService）；openai-agents-js 为远期目标
- Memory: **Mem0**（将领记忆，`npm install mem0ai`；未配 API key 时自动降级为 InMemory）
- Tracing: 自定义 console/内存 tracing（Langfuse 为远期目标）
- Model gateway: OpenAI 兼容协议（本地 Qwen / new-api / one-api）

### 前端

- Framework: **React + TypeScript + Tailwind CSS**
- 2D 渲染: **Pixi.js**（已有，保留）
- UI 生成: **Vercel v0**（从描述生成 React 页面草稿）
- Agent 前端通信: **CopilotKit**（AG-UI 协议，将领规划过程实时流式渲染）
- 素材: craftpix.net 现成 SLG 资产包 + Midjourney 风格锚定 + ComfyUI 批量生成

### AI 开发工作流

---

## 六、AI 设计哲学（每次写代码都要遵守）

### AI-First API Design

在设计每一个接口时，第一个问题不是"前端需要什么字段"，而是"如果一个 LLM 要基于这个响应做决策，它需要什么信息，以什么格式表达最不容易误解"。

- 字段命名要语义化
- 枚举值要有明确含义
- 返回的每个状态最好带有推荐行动暗示

例：
```typescript
// 差的设计（对 AI 不友好）
{ risk_score: 0.87 }

// 好的设计（AI-First）
{
  pressure: "high",
  recommended_action: "reinforce_or_recon",
  reason: "Eastern flank has 2 under-strength units, enemy concentrated north last tick"
}
```

### 低幻觉原则

- AI 只能提案，不能裁决
- 不允许 AI 直接吞完整 WorldState，只接受裁剪后的语义摘要
- 输出必须通过 Zod schema 校验，不合规的 order 在 CommanderAgent 内部被过滤掉
- 缺情报时优先侦察，不许强编不存在的机会

### 成本金字塔原则

- CommanderAgent：强模型，每 Tick 一次调用
- GeneralAgent：中等模型，数次调用
- UnitAgent：小模型或规则，数百次调用但近零成本
- **决策重要性决定模型成本，不是调用频率决定成本**

---

## 七、非目标（永远不要做的事）

- 不做完整 MMO 或正式多人联机（当前阶段）
- 不做大规模自治 swarm 表演
- 不把 AI 写成"什么都能做的总管"——单 agent 先做稳再扩展
- 不把规则引擎的逻辑挪进 AI prompt 里
- 不在前端保留 authoritative 规则分支
- 不直接从浏览器请求模型 endpoint
- 不做 mock UI 当正式交付

---

## 八、当前最优先要做的事（按顺序）

- [x] 第一件事：把 **Mem0 接进 CommanderAgent**，让第一个将领的 `agent_id` 被写入记忆并在后续规划时召回。（已完成）

- [x] 第二件事：补全 **Reflect 层**，在每次 `advanceTick` 结束后触发战报语义化与记忆写入，闭合 POER。（已完成）

- [x] 第三件事：用 **Vercel v0** 生成指挥台首版（大地图 + 将领列表 + 战报流），并用 **CopilotKit** 接入实时 Agent 规划流。（已完成：已接入 CopilotKit Provider + Sidebar + useCopilotReadable/useCopilotAction + /api/copilotkit runtime）

---

## 九、视觉风格锚点（告诉 v0 和 Claude 往哪个方向生成）

目标视觉语言：**暗金属战争沙盘**。

具体特征：深色背景（近黑的深灰或深蓝灰），金色和铜色作为主强调色，地图格子有轻微光泽感，面板有金属边框质感，字体偏向古典军事风格（衬线或刻碑感），战报区域有羊皮纸或墨迹纹理感，将领头像有水墨晕染风格。

整体感觉参考：《率土之滨》的地图层次感 + 《文明 6》的信息密度 + 《三国志》系列的将领卡片质感。

---

## 十、一句话给 Claude 的工作定义

你在帮我建造一个系统，让玩家第一次有机会，在一个由 AI 构成的文明里，体验真正的权力、信任、仇恨和史诗。技术上的每一个决策，都应该服务于这个目标。

---

## 十一、AI 自主性分级策略（架构决策）

### 核心原则

1. **所有行动最终经由 `advanceTick` 规则引擎裁决** — 这是物理定律级别的基线，任何层级的 AI 都不能绕过。
2. **AI 拥有真实的决策权，不仅仅是提案权** — 当玩家离线时，AI 必须能独立完成战略制定、战术执行、外交谈判的完整闭环，而不是暂停等待人类审批。

### 三级自主权模型

| 等级 | autonomySource | 触发条件 | AI 权限范围 | 实现层 |
|------|---------------|----------|------------|--------|
| L1 执行模式 | `assigned` | 玩家在线并下达指令 | 忠实执行玩家的战略计划，将领可提出风险报告 | CommanderAgent 接收玩家意图 → GeneralAgent 分发 |
| L2 代理模式 | `delegated` | 玩家离线或授权托管 | AI 拥有完整决策权：自动制定战略、分配资源、发起进攻/防御、签署外交协议 | CommanderAgent 自主规划 → GeneralAgent 全权执行 |
| L3 协商模式 | `negotiated` | 多势力 AI 近距离接触 | 跨势力将领自主谈判——结盟、停火、欺骗、背叛——无需人类介入 | GeneralNegotiationChannel + DiplomacyAgent |

### 为什么不是"提案制"

真实的 SLG 玩家不可能 24 小时在线。如果 AI 只能提案等人类批准，那么：
- 玩家睡觉时联盟完全瘫痪，敌方可以零成本推进
- 大量将领空转无所事事，浪费算力也破坏沉浸感
- 系统退化为"闹钟式游戏"——必须按时上线审批，否则吃亏

正确的设计是：**玩家定义治国方略（Doctrine），AI 在方略框架内拥有完整自主权。** 玩家上线后可以复盘、调整方略、奖惩将领，但不需要逐条审批每个行动。

### L2 代理模式的约束机制

AI 拥有完整决策权，不代表没有约束：

1. **Doctrine 框架约束** — 玩家预设的战略偏好（激进/保守、优先防御/扩张、外交红线）作为 AI 决策的硬约束
2. **规则引擎兜底** — 所有行动仍必须通过 `advanceTick`，违反游戏规则的行动被拒绝
3. **战报与问责** — AI 的每个重大决策都记录在案，玩家上线后可追溯、评估、调整
4. **忠诚度漂移** — 长期不被关注的将领忠诚度下降，可能产生消极行为甚至叛变，这本身就是游戏性的一部分

### 演化路径

近期（当前实现）：
- CommanderAgent 在玩家离线时自动接管战略规划
- GeneralAgent 凭 UtilityAI 在无命令时自主行动（侦察、防守、支援）
- 将领之间的战场谈判（GeneralNegotiationChannel）

中期：
- 将领评估命令风险并上报（"此路线有伏兵可能，建议改道"）
- 将领协调请求（"我兵力不足，请求邻近将领支援"）
- Doctrine 系统（玩家预设战略偏好，AI 在框架内自主决策）

远期：
- 跨势力将领外交博弈（谈判、欺骗、结盟、背叛）——故事从系统中自然涌现
- 将领基于性格差异产生的策略分歧与内部政治
- 将领记忆驱动的经验式决策（Voyager 技能系统）

---

## 十二、MCP Server（AI 编程助手实时查询游戏状态）

已实现 `server/src/mcp/gameServer.ts`，通过 MCP 协议将游戏后端 API 暴露给 VS Code 内的 AI 编程助手。

### 可用工具

| Tool | 描述 |
|------|------|
| `get_world_summary` | 获取世界状态摘要（tick、势力、战报） |
| `get_world_snapshot` | 获取完整世界快照概览（含单位/地块统计） |
| `get_general_profiles` | 查询某势力的将领档案（个性、忠诚度、历史） |
| `advance_tick` | 推进一个 Tick（执行所有排队计划） |
| `health_check` | 检查后端是否运行 |

### 配置

在 `.vscode/mcp.json` 中已配置 `slg-game` 服务器，AI 编程助手可在写代码时直接调用这些工具查询实时游戏状态。
