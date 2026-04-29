# AI 玩家原子动作清单 v1（账号级 / 受真人管辖）

## 1. 目标口径

本文讨论的不是“联盟统帅 AI”或“大战略 AI”，而是：

- `AI 玩家 = 账号级操作员`
- 能做真人玩家日常会做的动作
- 受真人玩家直接管辖
- 一个真人玩家可以同时管多个 AI 玩家
- 后续允许大语言模型参与决策，但不允许大语言模型直接绕过权威写链改世界

当前项目里已经确认的后端权威链是：

`SessionManager -> WorldService -> shared/domain/rules.ts -> commitWorldState -> world events / civil memory / WebSocket`

这条链决定了后续 AI 玩家必须长成“受控动作选择器 + 结构化原子动作执行器”，而不是“让模型直接写 world state”。

---

## 2. 语言选型

### 2.1 权威实现语言：TypeScript

AI 玩家原子动作、治理策略、Agent 读面、MCP 接口、CLI 工具，主实现语言统一建议使用 `TypeScript`。

原因：

1. 当前权威服务端主链就是 TypeScript。
   - `server/src/app.ts`
   - `server/src/application/world/WorldService.ts`
   - `shared/contracts/game/world.ts`
2. 共享合同已经在 `shared/**`，继续用 TypeScript 扩动作合同、回执、治理配置，最稳。
3. MCP 服务已经存在：
   - `server/src/mcp/gameServer.ts`
4. 现有 gate / eval / load test 主体也是 TypeScript：
   - `tsx server/src/evals/runAiRuntimeLoadGate.ts`
   - `tsx server/src/evals/runAiMainlineStabilityGate.ts`
5. 后面接 LLM 时，TypeScript 更适合把“模型输出 -> 结构化动作 proposal -> policy 检查 -> WorldService 执行”收成一条类型安全链。

### 2.2 Python 的位置

`Python` 只建议保留在以下场景：

- 临时研究脚本
- 离线数据清洗
- 一次性诊断工具
- 不进入正式权威链的实验验证

不建议把 AI 玩家主逻辑写成 Python，再跨语言回调 TypeScript 主链。那样会把：

- 合同维护
- 失败回执
- gate 复现
- 调试链路

全部变复杂。

### 2.3 GDScript 的位置

`GDScript` 只做消费层，不做 AI 玩家权威决策层。

Godot 侧可以读取：

- AI 运行态
- 执行回执
- 观测摘要
- 人类管理入口

但不要把 AI 玩家真正的动作选择和治理逻辑放到前端。

---

## 3. 设计原则

### 3.1 一个真人玩家可管多个 AI 玩家

建议正式口径按下面理解：

- `HumanGovernor`
  - 真人玩家
  - 拥有治理权限
  - 可以管理多个 AI 玩家
- `GovernedAiPlayer`
  - 一个具体 AI 账号代理
  - 只代表一个“玩家位”
  - 有独立预算、独立节流、独立动作白名单、独立暂停状态

这意味着系统最小治理单元不是 faction，而是：

- `governorPlayerId`
- `aiPlayerId`
- `controlledFactionId`
- `controlPolicy`

### 3.2 大模型不能直接写世界

大语言模型后续可以参与，但只能做到：

`观察 -> 提议动作 -> 通过治理策略 -> 调 WorldAction -> 收回执 -> 形成下一轮观察`

不能做到：

- 直接改 `worldState`
- 直接绕过 `WorldService`
- 直接拼一段自由文本命令让后端解释执行

否则后面做几千个 AI 玩家时，会同时失去：

- 权限边界
- 审计能力
- 可回放性
- 失败归因
- 节流控制

### 3.3 先做“原子动作目录”，再做“复杂行为包”

AI 玩家 v1 的核心不是先做一个很聪明的大模型，而是先把“真人玩家日常动作”收成正式目录。

没有原子动作目录，就无法稳定做：

- 白名单
- 限权
- 回放
- 预算控制
- 批量压测
- 人工接管

---

## 4. AI 玩家原子动作清单 v1

下面的动作目录以“真人玩家日常会做的事”为准，而不是联盟统帅或大战略层。

状态说明：

- `已有正式入口`：仓库里已有明确 world action 或正式运行态入口
- `已有底座待动作化`：权威链、回执、观测已有，但动作目录未正式收口
- `未正式化`：还没有收成正式玩家级动作

### 4.1 治理 / 会话控制

| 动作 | 说明 | 当前状态 |
|---|---|---|
| `ai_player_pause` | 暂停某个 AI 玩家 | 已有底座待动作化 |
| `ai_player_resume` | 恢复某个 AI 玩家 | 已有底座待动作化 |
| `ai_player_set_control_mode` | 切手动 / 托管 / 半托管 | 已有底座待动作化 |
| `ai_player_set_action_whitelist` | 配置允许动作集合 | 未正式化 |
| `ai_player_set_budget` | 配置预算、速率、并发上限 | 已有底座待动作化 |
| `ai_player_set_schedule_window` | 只在指定时窗运行 | 未正式化 |
| `ai_player_assign_governor` | 把 AI 玩家挂到真人管理者名下 | 未正式化 |
| `ai_player_transfer_governor` | 转移管理权 | 未正式化 |
| `ai_player_takeover` | 真人强制接管 | 已有底座待动作化 |
| `ai_player_release_takeover` | 结束接管，恢复 AI | 已有底座待动作化 |

### 4.2 城内经营动作

| 动作 | 说明 | 当前状态 |
|---|---|---|
| `city_upgrade` | 升级主城或核心建筑 | 已有正式入口 |
| `building_upgrade` | 升级指定建筑 | 已有底座待动作化 |
| `research_start` | 启动科技研究 | 已有底座待动作化 |
| `troop_train` | 训练兵种 | 已有底座待动作化 |
| `troop_heal` | 治疗伤兵 | 已有底座待动作化 |
| `queue_fill_idle_slot` | 发现空队列后自动补动作 | 未正式化 |
| `speedup_use` | 使用加速道具 | 未正式化 |
| `resource_item_use` | 开资源包 | 未正式化 |
| `boost_item_use` | 使用增益道具 | 未正式化 |
| `recruit_commander` | 招募或抽取将领 | 未正式化 |

### 4.3 地图原子动作

| 动作 | 说明 | 当前状态 |
|---|---|---|
| `world_scout` | 侦察目标点 | 已有底座待动作化 |
| `march_move` | 部队移动到目标点 | 已有底座待动作化 |
| `march_recall` | 撤回部队 | 已有底座待动作化 |
| `resource_gather` | 派采集队 | 已有底座待动作化 |
| `garrison_set` | 驻防 | 已有底座待动作化 |
| `tile_occupy` | 占点 / 进入目标格 | 已有底座待动作化 |
| `wild_attack` | 打野怪 / 野外目标 | 已有底座待动作化 |
| `teleport_use` | 迁城 / 传送 | 未正式化 |
| `formation_assign` | 指定队伍编组出征 | 未正式化 |
| `threat_escape` | 遇到高威胁时回撤 | 已有底座待动作化 |

### 4.4 联盟协作动作

| 动作 | 说明 | 当前状态 |
|---|---|---|
| `alliance_help` | 点帮助 | 未正式化 |
| `alliance_donate` | 捐献 | 未正式化 |
| `rally_join` | 跟集结 | 已有底座待动作化 |
| `rally_launch` | 发起集结 | 已有底座待动作化 |
| `alliance_relocate` | 迁到联盟附近 | 未正式化 |
| `alliance_task_execute` | 联盟任务 / 联盟活动动作 | 未正式化 |
| `alliance_mail_ack` | 确认联盟通知并执行 | 未正式化 |

### 4.5 活动 / 日常动作

| 动作 | 说明 | 当前状态 |
|---|---|---|
| `daily_task_execute` | 执行日常任务 | 未正式化 |
| `reward_claim` | 领取奖励 | 未正式化 |
| `event_task_execute` | 执行限时活动动作 | 未正式化 |
| `event_priority_sort` | 在收益冲突时排序事件 | 未正式化 |
| `stamina_spend` | 分配体力 / AP | 未正式化 |
| `activity_window_enter` | 进入某活动时窗并做动作 | 未正式化 |

### 4.6 情报 / 复盘动作

| 动作 | 说明 | 当前状态 |
|---|---|---|
| `battle_report_read` | 读取战报 | 已有底座待动作化 |
| `failure_reason_summarize` | 归纳失败原因 | 已有底座待动作化 |
| `enemy_pressure_estimate` | 估算敌情压力 | 已有底座待动作化 |
| `threat_alert_emit` | 向真人发风险提示 | 已有底座待动作化 |
| `next_step_propose` | 对下一步动作给出建议 | 已有底座待动作化 |
| `human_escalation_request` | 请求真人确认高风险动作 | 未正式化 |

---

## 5. v1 不是“动作都写完”，而是先收合同

当前仓库已经比较强的是：

- 运行态合同
- 失败回执
- 锁冲突和预算观测
- MCP 读面
- runtime 压测

还不够强的是：

- 玩家级原子动作目录
- 一个真人管理多个 AI 玩家的治理配置
- 玩家动作和 LLM proposal 的正式接口

所以 v1 最应该先做的是：

1. 把动作名收成正式枚举或判别联合
2. 给每个动作定义参数合同
3. 明确哪些动作要人工审批
4. 明确哪些动作允许 LLM 自动提议
5. 明确哪些动作只能 CLI / 运维工具触发

---

## 6. 建议的正式数据结构

建议后续新增一组共享合同，例如：

- `shared/contracts/aiPlayer.ts`
- `shared/schemas/aiPlayer.ts`

建议至少包含：

### 6.1 AI 玩家定义

```ts
type AiPlayerId = string

type GovernedAiPlayer = {
  aiPlayerId: AiPlayerId
  governorPlayerId: string
  factionId: string
  enabled: boolean
  paused: boolean
  controlMode: 'manual' | 'assisted' | 'auto'
  actionWhitelist: AiPlayerActionType[]
  approvalPolicy: AiPlayerApprovalPolicy
  budgetPolicy: AiPlayerBudgetPolicy
  runtimePolicy: AiPlayerRuntimePolicy
}
```

### 6.2 原子动作提议

```ts
type AiPlayerActionProposal = {
  proposalId: string
  aiPlayerId: AiPlayerId
  action: AiPlayerActionType
  args: Record<string, unknown>
  reason: string
  riskLevel: 'low' | 'medium' | 'high'
  requiresApproval: boolean
  source: 'llm' | 'rule' | 'human' | 'replay'
}
```

### 6.3 执行回执

```ts
type AiPlayerActionReceipt = {
  proposalId: string
  actionRequestId: string | null
  ok: boolean
  failureCode?: string | null
  execution?: unknown
  observedAt: string
}
```

这里的关键点是：

- LLM 不直接下 world action
- LLM 先生成 `AiPlayerActionProposal`
- 后端 policy 层再把 proposal 映射到 `WorldAction`
- 最终回执仍然复用现有 `WorldActionResponse`

---

## 7. 一个人类玩家管多个 AI 玩家时，要特别注意什么

### 7.1 不要把“一个 faction”误等于“一个 AI 玩家”

一个真人玩家后面可能挂多个 AI 玩家。

所以最小管辖对象应该是 `aiPlayerId`，不是单纯 `factionId`。

否则会出现：

- 一个真人想暂停 A，不小心把 B 也停了
- 一组预算被多个 AI 玩家抢占
- 某个 AI 的失败被错误归到整个 faction

### 7.2 预算和节流必须按 AI 玩家维度做

至少要有三层预算：

- `governor budget`
- `ai player budget`
- `world mutation / websocket / session runtime budget`

### 7.3 高风险动作必须可审批

后续如果要接 LLM，不能把所有动作都视为同级别。

建议：

- `low risk`：可自动执行
- `medium risk`：可自动执行但需记录 explanation
- `high risk`：必须真人确认

典型高风险动作：

- 传送
- 开大额资源包
- 发起集结
- 放弃驻防
- 切换 control mode

### 7.4 每个 AI 玩家都要能被人工接管

必须存在：

- 立即暂停
- 立即接管
- 查看最近动作
- 查看失败原因
- 查看下一步建议

---

## 8. 后续接入大语言模型时，推荐 MCP 还是 CLI

结论先说：

- `在线 Agent / 多 AI 玩家治理 / 长期运行`：优先 `MCP`
- `离线回放 / 批处理 / 压测 / CI / 运维手工诊断`：保留 `CLI`

不是二选一，而是：

- `MCP = 正式 Agent 读写接口`
- `CLI = 工程运维与离线验证接口`

### 8.1 为什么优先 MCP

MCP 更适合未来的 AI 玩家系统，因为它天然适合：

- 结构化工具调用
- 多工具编排
- 权限边界
- 受控参数
- Agent 解释与审计
- 多 AI 玩家并发治理

当前仓库已经有 MCP 基础能力：

- `get_ai_runtime_observability`
- `get_civil_memory_entries`

所以正确方向不是“让模型直接 SSH/CLI 硬敲命令”，而是逐步补：

- `list_governed_ai_players`
- `get_ai_player_runtime`
- `propose_ai_player_action`
- `approve_ai_player_action`
- `execute_ai_player_action`
- `pause_ai_player`
- `resume_ai_player`

### 8.2 CLI 该保留在哪

CLI 不应作为未来海量 AI 玩家的主接口，但很重要，建议保留在：

- gate
- replay
- load
- backfill
- 故障诊断
- 本地开发
- 无模型参与时的规则跑批

换句话说：

- `MCP` 给 Agent 用
- `CLI` 给工程师和 CI 用

### 8.3 LLM 最好读什么，不读什么

推荐给 LLM / Agent 的输入：

- `get_ai_runtime_observability view=summary`
- 某个 `aiPlayerId` 的最近执行回执
- 某个 `aiPlayerId` 的动作白名单
- 某个 `aiPlayerId` 的预算与审批策略
- 必要的简化情报摘要

不推荐直接给 LLM 的输入：

- 巨量原始 `/api/events`
- 未裁剪的全量 world state
- 没做权限隔离的 session 内部对象

---

## 9. 建议的正式接口分层

### 9.1 观察接口

- `get_ai_runtime_observability`
- `get_ai_player_runtime`
- `get_ai_player_recent_receipts`
- `get_ai_player_budget_status`

### 9.2 提议接口

- `propose_ai_player_action`
- `propose_ai_player_action_batch`

### 9.3 治理接口

- `pause_ai_player`
- `resume_ai_player`
- `approve_ai_player_action`
- `reject_ai_player_action`
- `set_ai_player_policy`

### 9.4 执行接口

- `execute_ai_player_action`
- `execute_ai_player_action_batch`

注意：

`execute_*` 必须仍然最终落回 `WorldService` 现有权威写链，而不是另起一套旁路。

---

## 10. 结合当前仓库，v1 推荐落地顺序

### 第一阶段：先收合同

1. 新增 `shared/contracts/aiPlayer.ts`
2. 新增 `shared/schemas/aiPlayer.ts`
3. 收口 `AiPlayerActionType`
4. 收口 `GovernedAiPlayer`
5. 收口 `AiPlayerActionProposal / Receipt`

### 第二阶段：把已存在 world action 包一层“玩家动作”

先从现有已存在或接近已存在的动作开始：

- `city_upgrade`
- `queue_ai_agenda_action`
- `queue_plan_execution`
- `clear_plan_execution`
- 若干地图相关动作

这一步的目标不是一次性补全所有真人动作，而是先证明：

- 玩家级动作提议
- policy 审批
- world action 映射
- receipt 回写

能跑通。

### 第三阶段：接 MCP，先不给模型完全放权

先做：

- 只读 runtime
- 只读 receipt
- 可提议动作
- 高风险动作仍需审批

不要第一版就让 LLM 直接自动开跑。

### 第四阶段：再扩动作目录

建议扩展顺序：

1. 城内经营
2. 地图行军 / 侦察 / 采集
3. 联盟协作
4. 活动与奖励
5. 更复杂的战斗响应

---

## 11. 当前代码事实与本文对齐点

当前仓库已经能支撑这条路线的后端底座包括：

- 运行态合同：
  - `GET /api/observability/ai-runtime`
- 共享 world AI 状态：
  - `shared/contracts/game/world.ts`
  - `SlgAiAgendaState`
  - `SlgAiExecutionState`
  - `SlgAiState`
  - `FactionState.aiPlayers`
  - `FactionState.aiQuota`
- 动作回执：
  - `WorldActionResponse`
- MCP 读面：
  - `get_ai_runtime_observability`
  - `get_civil_memory_entries`

所以当前最合理的路线不是重做一套 AI 后端，而是在现有底座上加：

- 玩家级动作目录
- 多 AI 玩家治理配置
- LLM proposal 层
- MCP 正式写接口

---

## 12. 结论

AI 玩家 v1 的关键不是“让模型更聪明”，而是：

1. 先把真人玩家动作收成正式原子目录
2. 先把一个真人管多个 AI 玩家的治理结构收清楚
3. 先把 MCP / CLI / LLM 的边界收清楚
4. 让所有执行最终回到已有 TypeScript 权威写链

当前建议的最终口径是：

- `TypeScript` 负责权威主链、共享合同、MCP、CLI、治理策略
- `MCP` 作为 Agent 正式接口
- `CLI` 作为工程 / gate / replay / 故障诊断接口
- `LLM` 只负责提议，不直接写世界

如果继续推进，下一步最值的是直接落：

- `shared/contracts/aiPlayer.ts`
- `shared/schemas/aiPlayer.ts`
- `server/src/mcp/gameServer.ts` 里的第一组玩家级 MCP 工具
- 一个最小闭环：
  - `propose_ai_player_action(city_upgrade)`
  - `approve`
  - `execute`
  - `receipt`
  - `observability`
