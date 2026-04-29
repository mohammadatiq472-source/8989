# AI Backend Runtime Contract（2026-04-19）

本文档只定义 AI 玩家后端主线的数据、合同、字段说明和 UI 消费边界。
不讨论场景布局、按钮排版、面板结构、动画样式。

## 1. 当前权威口径

### 1.1 权威写链

AI 玩家真正的权威写链仍然是：

1. `SessionManager` 决定 faction 当前 `autonomyLevel`
2. `resolveSessionControlMode()` 派生 `controlMode`
3. `queuePlanExecutionAction()` / `queueAiAgendaActionAction()` / `setAiContextFocusAction()` 进入 `WorldService`
4. `shared/domain/rules.ts` 真正改写 `WorldState`
5. `commitWorldState()` 同步 `slgDomainState.aiStateByFaction.*`
6. `appendWorldEvent()` / `CivilMemory` / `WebSocket tick_delta` 作为观测和广播副产物

### 1.2 权威读链

AI 窗口后续不要自己重新拼 `SessionStore + runtime_context + world`。
后端已经给出推荐读链：

1. `GET /api/observability/ai-runtime`
   作为 AI 运行态总览的主读取口
2. `GET /api/civil-memory`
   作为上下文记忆明细读取口
3. `POST /api/world/action`
   作为动作回执读取口
4. `GET /api/events`
   仅作原始事件日志回放，不应再作为 AI 主状态 selector

## 2. 新增 / 收口的后端合同

### 2.1 `GET /api/observability/ai-runtime`

用途：

- 给 AI 窗口或 observability 窗口提供单一 runtime 快照
- 避免客户端继续抓 generic `/api/events` 自己猜 `failureCode`、预算和锁冲突

查询参数：

- `factionId?: string`
  只看单个 faction
- `eventLimit?: number`
  返回最近 AI 相关事件条数，服务端会做上限裁剪

返回合同：

- `tick: number`
  当前世界 tick
- `worldVersion: number`
  当前权威世界版本
- `generatedAt: string`
  本次观测快照生成时间
- `factionFilter?: string`
  实际应用的 faction 过滤器
- `runtime.lock.busy: boolean`
  `world mutation lock` 当前是否占用
- `runtime.lock.holder: string | null`
  当前锁持有者，例如 `advance_tick`、`queue_plan_execution`
- `runtime.queuePlanFailureStats`
  `queuePlanExecutionAction` 的失败累计统计
- `runtime.queuePlanConflictStats`
  写链冲突累计统计，重点看 `mutation_lock_busy` / `stale_world_version` / `execution_chain_*`
- `runtime.advanceTickFailureStats`
  `advanceTickAction` 的失败累计统计
- `runtime.advanceTickPerformance`
  `advanceTickAction` 的阶段级耗时观测，给出最近运行样本和按阶段聚合结果
- `runtime.recentFailures`
  最近失败聚合，直接给出 `byAction / byFailureCode / byFaction / samples`
- `runtime.lockConflicts`
  最近锁冲突聚合，直接给出 `byAction / byHolder / samples`
- `runtime.sessionMetrics`
  `SessionManager` 的容量/回收指标
- `runtime.wsStats`
  `GameWebSocket` 的连接、订阅、拒绝、裁剪指标
- `factions[]`
  每个势力的 AI 权威运行态
- `recentEvents[]`
  最近 AI 相关事件；仅作观测，不作为主状态源

### 2.2 `factions[]` 字段说明

每个 faction 项包含：

- `factionId`
  势力 ID
- `autonomyLevel`
  权威来源是 `SessionManager`
- `controlMode`
  由 `autonomyLevel` 派生，不允许客户端自己重复推导
- `playerNames`
  当前 seat 玩家名列表
- `online`
  当前 faction 是否在线
- `seatCount`
  faction 总 seat 数
- `onlineSeatCount`
  faction 在线 seat 数
- `contextFocusId`
  当前 AI 上下文焦点
- `contextMemorySummary`
  焦点相关记忆摘要；如果要看明细，继续查 `/api/civil-memory`
- `agenda`
  当前 AI 议程权威快照
- `execution`
  当前 AI 执行链权威快照，复用 `SlgAiExecutionState`
- `budget`
  AI 预算快照
- `lastAgendaActionId`
  最近一次 agenda action id
- `updatedTick`
  该 faction AI 状态最后更新时间
- `updatedWorldVersion`
  该 faction AI 状态最后写入时的 world version
- `lastFailure`
  最近一次失败摘要，避免 UI 必须去扫事件流

### 2.3 `budget` 字段说明

- `actionPointsRemaining`
  当前行动点余额
- `foodRemaining`
  当前粮草余额
- `aiQuota`
  AI 配额状态，复用 `FactionAiQuota`

`aiQuota` 内部字段：

- `initialQuota`
  初始配额
- `currentQuota`
  当前可用配额
- `maxQuota`
  最大上限
- `growthScore`
  当前成长分
- `tugIntensity`
  拉扯强度
- `nextUnlockScore`
  下一档解锁阈值
- `lastGrowthTick?`
  最近一次成长写入 tick

### 2.4 `lastFailure` 字段说明

- `category`
  事件分类，例如 `planning`
- `action`
  失败动作，例如 `queue_plan_execution`
- `tick`
  失败发生时 tick
- `worldVersion`
  失败发生时版本
- `createdAt`
  失败事件时间
- `requestId?`
  关联请求 ID
- `message?`
  失败消息
- `failureCode?`
  结构化失败码

### 2.5 `runtime.recentFailures` 字段说明

- `totalRecentFailures`
  当前观测窗口里的失败总数
- `byAction`
  按动作名聚合，例如 `queue_plan_execution`、`queue_ai_agenda_action`
- `byFailureCode`
  按失败码聚合，例如 `world_mutation_busy`
- `byFaction`
  按 faction 聚合；没有 faction 的全局失败会记为 `global`
- `samples`
  最近失败样本，已包含 `factionId / failureCode / conflictCategory / holder`

### 2.6 `runtime.lockConflicts` 字段说明

- `totalRecentConflicts`
  当前观测窗口里的锁冲突总数
- `byAction`
  哪些动作最常撞锁
- `byHolder`
  哪个 holder 最常占住写链
- `samples`
  最近锁冲突样本；UI 或 agent 不需要再从 `message` 里自己拆 holder

### 2.7 `runtime.advanceTickPerformance` 字段说明

- `totalRuns`
  当前进程内已记录的 `advanceTick` 样本数
- `successfulRuns`
  成功样本数
- `failedRuns`
  运行时失败样本数；不含 `mutation_lock_busy`
- `lastOutcome`
  最近一次 `advanceTick` 的结果，当前取值为 `success | runtime_error | null`
- `lastCompletedAt`
  最近一次样本完成时间
- `lastTotalDurationMs`
  最近一次 `advanceTick` 总耗时
- `avgTotalDurationMs`
  当前样本窗口的平均总耗时
- `maxTotalDurationMs`
  当前样本窗口的最大总耗时
- `phaseStats`
  按阶段聚合的耗时统计，避免客户端自己扫 `recentRuns`
  其中每个阶段现在还带 `subphaseStats`
- `recentRuns`
  最近若干次 `advanceTick` 的完整阶段样本

`recentRuns[]` 内部字段：

- `outcome`
  本次样本结果
- `startedAt / completedAt`
  样本起止时间
- `tickBefore / tickAfter`
  样本前后 tick
- `worldVersionBefore / worldVersionAfter`
  样本前后 world version
- `totalDurationMs`
  本次总耗时
- `slowestPhase`
  本次最慢阶段名
- `slowestPhaseDurationMs`
  本次最慢阶段耗时
- `phases[]`
  分阶段耗时列表
  其中 `advance_world_state / reflect_world_tick / broadcast_runtime` 现在都带 `subphases[]`
- `narrativeEvents / memoryWrites / memoryWriteFailures / battleReportsBroadcast`
  便于判断慢点位后面的副产物规模
- `errorName? / errorMessage?`
  运行时失败时的错误摘要

当前阶段名口径：

- `compile_advisory`
- `record_pre_tick_memory`
- `append_pre_tick_events`
- `advance_world_state`
- `sync_v2_resources`
- `reflect_world_tick`
- `record_post_tick_memory`
- `broadcast_runtime`
- `finalize_response`

当前二级阶段口径：

- `advance_world_state.*`
  当前至少包含 `precompute_shared_index / snapshot_previous_world / economy_upkeep / faction_growth_quota / ai_quota_sync / territory_recruit_levelup / execution_and_orders / directors_and_theater / endgame_and_decay / replay_sync / commit_world_state`
- `advance_world_state.snapshot_previous_world.*`
  当前至少包含 `clone_factions / clone_map_tiles / clone_units / clone_reports / clone_feedback`
- `advance_world_state.directors_and_theater.*`
  当前至少包含 `alliance_director / alliance_report_and_highlight / opposing_director / opposing_report_and_highlight / theater_snapshot / summary_report_and_highlight`
- `advance_world_state.commit_world_state.*`
  当前至少包含 `sync_authoritative_ai_state / sync_ai_quota / swap_authoritative_world / sync_world_map_layout / record_tile_state_diff / record_intel_diff / schedule_world_persist`
- `sync_v2_resources.*`
  当前至少包含 `build_tile_info_index / sync_v2_state / settle_resources / mirror_world_faction_resources`
- `reflect_world_tick.*`
  当前至少包含 `collect_context / prepare_memory_and_generals / write_memory_and_feedback / apply_passive_general_feedback / post_tick_side_effects`
- `broadcast_runtime.*`
  当前至少包含 `compute_delta / tick_delta_fanout / battle_report_fanout`

推荐读取顺序：

1. 先看 `recentRuns[0].slowestPhase`
2. 再看 `phaseStats[slowestPhase]`
3. 如果该阶段存在 `subphaseStats`，优先看 `maxDurationMs / avgDurationMs / lastDurationMs`

当前后端证据表明，真正应该先盯的不是 UI，而是：

- `advance_world_state`
- `advance_world_state.directors_and_theater.alliance_director`
- `advance_world_state.directors_and_theater.alliance_director.build_theater_snapshot`
- `advance_world_state.commit_world_state.record_intel_diff`
- `advance_world_state.commit_world_state.record_intel_diff.scan_next_intel`
- `sync_v2_resources.sync_v2_state`
- `reflect_world_tick`
- `reflect_world_tick.collect_context.build_drafts`
- `broadcast_runtime`

也就是 `advanceTick` 主链里的世界推进、V2 资源同步、reflect 反馈和 delta fanout。

## 3. 动作回执合同

### 3.1 `WorldActionResponse`

以下动作现在都应该优先消费 `WorldActionResponse`，而不是自己从日志回推：

- `queuePlanExecution`
- `queueAiAgendaAction`
- `setAiContextFocus`

关键字段：

- `ok`
  是否成功
- `message?`
  可显示给操作者的回执文案
- `failureCode?`
  结构化失败码；失败态必须优先看它，不要只看 message
- `requestId?`
  请求链标识；`queuePlanExecution` 成功与 busy/fail 都会带回
- `execution?`
  当前执行态快照；用于展示预算、执行链状态和 requestId
- `contextFocusId?`
  焦点类动作返回当前焦点
- `relatedId?`
  焦点关联对象 ID，可继续用于 `/api/civil-memory?relatedId=...`
- `civilMemoryEntries?`
  焦点动作可直接附带一小批记忆结果

### 3.2 `queuePlanExecution` 现在的即时回执保证

- 成功：返回 `requestId + execution`
- 失败：返回 `failureCode + requestId + execution`
- `world mutation busy`：返回 `failureCode=world_mutation_busy + requestId + execution`

这意味着 UI 或观测端不需要再等事件流，提交后即可得到预算、执行链状态和失败码。

## 4. `GET /api/civil-memory` 查询口径

当前 route 已透传以下参数：

- `limit`
- `type`
- `tickFrom`
- `tickTo`
- `factionId`
- `relatedId`

推荐用法：

1. 先从 `ai-runtime.factions[].contextMemorySummary.relatedId` 取得 `relatedId`
2. 再查 `/api/civil-memory?factionId=<faction>&relatedId=<id>`
3. 如果需要按事件类型收窄，再加 `type=execution_outcome` 或其他类型

## 5. UI 消费边界

专门做 UI 的窗口请遵守：

- 不要把 `/api/events` 当成 AI 主状态 selector
- 不要自己从 `runtime_context` 推 `controlMode`
- 不要把 `SessionStore` 和 world 内的旧镜像字段并列当双权威
- 优先消费 `WorldActionResponse`
- 主运行态优先消费 `/api/observability/ai-runtime`
- 记忆明细优先消费 `/api/civil-memory`

## 6. 需要 UI 窗口继续完成，但本轮后端不做的事项

以下事项留给专门的 UI AI：

1. 把 `runtime.lock`、`queuePlanConflictStats`、`wsStats` 做成可读的运行态条目或告警视图
2. 把 `execution.requestId`、`failureCode`、`lastFailure` 做成动作回执区
3. 把 `budget.aiQuota`、`actionPointsRemaining`、`foodRemaining` 做成预算区
4. 把 `contextMemorySummary` 与 `/api/civil-memory` 的明细联动做成 drill-down 交互
5. 把 `recentEvents` 做成仅观测用途的日志列表，不参与主状态选择
6. 如果要做性能诊断窗口，直接消费 `runtime.advanceTickPerformance`，不要自己重新统计 `recentEvents.metadata`

以上 UI 事项只讨论“消费哪些字段”，不要求任何具体布局。

## 7. 反模式

以下做法应视为回退：

- 用 `/api/events` 重新拼 `autonomyLevel/controlMode`
- 用 `runtime_context` 覆盖 `WorldActionResponse.execution`
- 用 presenter 层临时变量代替 `/api/observability/ai-runtime`
- 把 budget / failureCode / lock 只放在日志里，不放进共享状态

## 8. MCP / Agent 读面

当前给运维代理或 MCP 的推荐读取工具：

1. `get_ai_runtime_observability`
   读取 `/api/observability/ai-runtime`
   并支持 `view=summary` + `sampleLimit`，给 agent 返回压缩后的锁状态、失败聚合、冲突样本、`advanceTick` 阶段耗时、二级子阶段热点、session/ws 指标与 faction 摘要
2. `get_civil_memory_entries`
   直接暴露 `type / factionId / relatedId / tickFrom / tickTo`
3. `get_session_runtime`
   只用于 session 控制面，不替代 AI runtime 总览

其中 `get_ai_runtime_observability view=summary` 当前应直接消费：

- `advanceTickPerformance.topPhasesByLast`
- `advanceTickPerformance.topPhasesByAverage`
- `advanceTickPerformance.topSubphasesByLast`
- `advanceTickPerformance.topSubphasesByAverage`
- `advanceTickPerformance.recentRuns`

反模式：

- 让代理继续通过 `get_recent_events` 自己聚合失败码、锁冲突和预算
- 让代理先拿 session runtime，再自己拼 world/action/event 三路状态

## 9. 正式压测入口

本轮新增的正式入口：

1. `npm run test:world:mutation-load`
   直接打 `WorldService` 权威写链，验证 `advanceTick` 持锁期间的 busy 回执、`requestId` 回传、失败聚合与恢复成功路径
2. `npm run test:session:load`
   真实 HTTP 并发压测 `/api/session/join`、`/api/session/heartbeat`、`/api/session/leave`
3. `npm run test:websocket:load`
   真实 `/ws` upgrade + subscribe + `tick_delta` fanout 压测
4. `npm run gate:ai:runtime-load`
   现在是稀疏矩阵门禁，不只跑 baseline，还会额外抬高 `tick pressure / session seats / ws fanout` 三个轴，并补组合档，产出 `tmp/gates/ai_runtime_load_gate_latest.json`
   最新 gate 产物现在还会带 `generatedAt` 和每个 cell 的结构化 `result`，不再只剩截断摘要字符串
5. `npm run gate:ai:runtime-capacity`
   现在除了回归测试，也会复用 `gate:ai:runtime-load`

当前高档 sparse matrix 口径：

- `tick_pressure_high`
  `WORLD_MUTATION_LOAD_CONTENDING_REQUESTS=32`
  `WORLD_MUTATION_LOAD_PRESSURE_WAVES=3`
  `WORLD_MUTATION_LOAD_WAVE_DELAY_MS=120`
- `session_seat_xhigh`
  `SESSION_LOAD_SESSION_COUNT=96`
  `SESSION_LOAD_PRIMARY_SEAT_COUNT=64`
  `SESSION_LOAD_SECONDARY_SEAT_COUNT=32`
  `SESSION_LOAD_HEARTBEAT_ROUNDS=3`
- `tick_pressure_xhigh_plus`
  `WORLD_MUTATION_LOAD_CONTENDING_REQUESTS=48`
  `WORLD_MUTATION_LOAD_PRESSURE_WAVES=4`
  `WORLD_MUTATION_LOAD_WAVE_DELAY_MS=80`
- `session_seat_xhigh_plus`
  `SESSION_LOAD_SESSION_COUNT=128`
  `SESSION_LOAD_PRIMARY_SEAT_COUNT=64`
  `SESSION_LOAD_SECONDARY_SEAT_COUNT=64`
  `SESSION_LOAD_HEARTBEAT_ROUNDS=4`
- `ws_fanout_xhigh`
  `WEBSOCKET_LOAD_CLIENT_COUNT=48`
  `WEBSOCKET_LOAD_FANOUT_BURSTS=4`
  `WEBSOCKET_LOAD_FANOUT_BURST_DELAY_MS=120`
- `ws_fanout_xhigh_plus`
  `WEBSOCKET_LOAD_CLIENT_COUNT=64`
  `WEBSOCKET_LOAD_FANOUT_BURSTS=5`
  `WEBSOCKET_LOAD_FANOUT_BURST_DELAY_MS=80`
- `runtime_combo_xhigh`
  `RUNTIME_COMBO_SESSION_COUNT=48`
  `RUNTIME_COMBO_CLIENT_COUNT=32`
  `RUNTIME_COMBO_HEARTBEAT_ROUNDS=1`
  `RUNTIME_COMBO_FANOUT_BURSTS=2`
  `RUNTIME_COMBO_FANOUT_BURST_DELAY_MS=120`
- `runtime_combo_xhigh_plus`
  `RUNTIME_COMBO_SESSION_COUNT=64`
  `RUNTIME_COMBO_CLIENT_COUNT=48`
  `RUNTIME_COMBO_HEARTBEAT_ROUNDS=2`
  `RUNTIME_COMBO_FANOUT_BURSTS=3`
  `RUNTIME_COMBO_FANOUT_BURST_DELAY_MS=80`

当前最新正式 gate 证据：

- baseline `world_mutation_load`
  `advance_world_state` 已经压过 `reflect_world_tick / sync_v2_resources`
  最近热点子阶段包含 `directors_and_theater.alliance_director / commit_world_state.record_intel_diff / reflect_world_tick.collect_context.build_drafts`
- baseline `world_mutation_load`
  `snapshot_previous_world.clone_map_tiles` 已经被降到第二梯队，不再是当前最前排热点
- `session_seat_xhigh`
  当前正式 gate 产物记录的是双 faction split 的 96 总席位，不是“单 faction 96 席位”
- `session_seat_xhigh_plus`
  当前正式 gate 产物记录的是双 faction split 的 128 总席位，拆分为 `64 + 64`
- `session capacity`
  单 faction seat cap 目前仍然是 `64`；继续抬 session 压力必须走多 faction 分摊
- `ws_fanout_xhigh`
  当前正式 gate 产物已记录 `48 clients / 4 bursts`
- `ws_fanout_xhigh_plus`
  当前正式 gate 产物已记录 `64 clients / 5 bursts`
- `runtime_combo_xhigh`
  当前正式 gate 产物已记录 `48 sessions / 32 ws clients / 2 bursts`
- `runtime_combo_xhigh_plus`
  当前正式 gate 产物已记录 `64 sessions / 48 ws clients / 2 heartbeat rounds / 3 bursts`

这组矩阵的目的不是证明“容量问题已解决”，而是持续复现下面几类事实：

- `world mutation busy` 回执是否仍然快速且带结构化 `requestId / failureCode`
- `advanceTick` 慢点位是否已经能落到阶段级以及更深一层的子阶段
- `SessionManager` 和 `WebSocket` 是否已经有独立的高档门禁，而不是只靠 UI 体感

注意：

- 这些入口是“正式压测 / 负载门禁”，不是 UI 演示脚本
- 即便这些 gate 通过，也不代表单进程 `WorldService + SessionManager + WebSocket` 的容量问题已经解决，只代表当前主链有了可复现的负载证据
## 2026-04-19 继续下钻补充

本轮继续往 `reflect / commit / opposing_director / runtime-load` 这几条后端主线下钻，没有进入任何 UI 结构改动。

新增更深子阶段：
- `advance_world_state.directors_and_theater.opposing_director.build_theater_snapshot`
- `advance_world_state.directors_and_theater.opposing_director.build_region_summary_index`
- `advance_world_state.directors_and_theater.opposing_director.build_tile_index`
- `advance_world_state.directors_and_theater.opposing_director.build_unit_index`
- `advance_world_state.directors_and_theater.opposing_director.build_target_occupied_tile_set`
- `advance_world_state.directors_and_theater.opposing_director.build_unhandled_unit_list`
- `advance_world_state.commit_world_state.record_intel_diff.scan_next_intel.compare_entries`
- `advance_world_state.commit_world_state.record_intel_diff.scan_next_intel.encode_sparse_updates`
- `reflect_world_tick.collect_context.build_search_indexes`
- `reflect_world_tick.collect_context.build_drafts.build_report_drafts.prepare_report_text`
- `reflect_world_tick.collect_context.build_drafts.build_report_drafts.match_units`
- `reflect_world_tick.collect_context.build_drafts.build_report_drafts.match_tiles`
- `reflect_world_tick.collect_context.build_drafts.build_report_drafts.assemble_report_events`

本轮顺手做的低风险优化：
- `record_intel_diff.scan_next_intel.compare_entries` 从 `Object.entries()` 改成 `for ... in`，减少热路径分配。
- `enemyDirector` 增加 `tileById / unitById / targetOccupiedTileIds` 索引，避免重复 `find()` 和 `some()`。
- `ReflectService` 先建 `unitSearchEntries / tileSearchEntries`，避免每条 report 重复对单位名和地块名做 `toLowerCase()` 扫描。

新的正式 load matrix：
- `tick_pressure_ultra`
  `WORLD_MUTATION_LOAD_CONTENDING_REQUESTS=64`
  `WORLD_MUTATION_LOAD_PRESSURE_WAVES=5`
  `WORLD_MUTATION_LOAD_WAVE_DELAY_MS=60`
- `session_seat_cap_plus`
  `SESSION_LOAD_SESSION_COUNT=128`
  `SESSION_LOAD_PRIMARY_SEAT_COUNT=64`
  `SESSION_LOAD_SECONDARY_SEAT_COUNT=64`
  `SESSION_LOAD_HEARTBEAT_ROUNDS=8`
- `ws_fanout_dual_faction_ultra`
  `WEBSOCKET_LOAD_CLIENT_COUNT=128`
  `WEBSOCKET_LOAD_PRIMARY_CLIENT_COUNT=64`
  `WEBSOCKET_LOAD_SECONDARY_CLIENT_COUNT=64`
  `WEBSOCKET_LOAD_FANOUT_BURSTS=6`
  `WEBSOCKET_LOAD_FANOUT_BURST_DELAY_MS=60`
- `runtime_combo_dual_faction_ultra`
  `RUNTIME_COMBO_SESSION_COUNT=128`
  `RUNTIME_COMBO_PRIMARY_SESSION_COUNT=64`
  `RUNTIME_COMBO_SECONDARY_SESSION_COUNT=64`
  `RUNTIME_COMBO_CLIENT_COUNT=128`
  `RUNTIME_COMBO_PRIMARY_CLIENT_COUNT=64`
  `RUNTIME_COMBO_SECONDARY_CLIENT_COUNT=64`
  `RUNTIME_COMBO_HEARTBEAT_ROUNDS=3`
  `RUNTIME_COMBO_FANOUT_BURSTS=4`
  `RUNTIME_COMBO_FANOUT_BURST_DELAY_MS=60`

本轮最新 gate 证据：
- baseline `world_mutation_load`
  `advanceLatencyMs=1329.6`
  top phases 仍然是 `advance_world_state > reflect_world_tick > sync_v2_resources`
  top subphases 已收口到 `directors_and_theater / collect_context / commit_world_state / alliance_director / opposing_director`
- `tick_pressure_ultra`
  `totalContendingRequests=320`
  `busyP95Ms=1.26`
  `advanceLatencyMs=1241.4`
- `session_seat_cap_plus`
  `sessionCount=128`
  `joinP95Ms=48.72`
  `heartbeatP95Ms=49.83`
  `leaveP95Ms=30.04`
- `ws_fanout_dual_faction_ultra`
  `clientCount=128`
  `subscribeP95Ms=72.37`
  `fanoutP95Ms=58.94`
- `runtime_combo_dual_faction_ultra`
  `sessionCount=128`
  `clientCount=128`
  `joinP95Ms=48.17`
  `heartbeatP95Ms=44.91`
  `subscribeP95Ms=74.46`
  `fanoutP95Ms=64.74`
  `advanceP95Ms=1005.79`

本轮对正式入口的修正：
- `server/tests/helpers/backendHarness.ts::waitForHealth` 默认启动等待窗口从 `35s` 提到 `90s`。
- 这不是业务容量优化，而是修正 server-backed load 脚本的正式 gate 失真；修完后 `session_load / websocket_load / runtime_combo_load / gate:ai:runtime-load` 才恢复到可复现状态。

关于 `godot:week1`：
- 这条 gate 依赖 `http://127.0.0.1:8787` 上存在可用后端。
- 如果本地没有后端进程，`godot_week1_gate_latest.json` 会表现成 `health/runtime/world/join` 全部 `status=-1`。
- 按正式方式先起本地后端再跑，当前最新产物已恢复 `W1-C13 ok=true`。

## 2026-04-19 持续压测补充

本轮继续只做后端主线压测和观测修正，没有进入任何 UI 结构修改。

### 1. extreme tick pressure 的真实根因

在 `tick_pressure_extreme` 档位下，正式入口会产生：

- `96` 条 `world_mutation_busy`
- `480` 条 `stale_world_version`

本轮先前出现的现象不是“busy 事件没写进去”，而是 `/api/observability/ai-runtime` 的读取窗口仍被 `getWorldEvents()` 硬截到 `500`。

这会导致：

- `recentFailures` 和 `lockConflicts` 只能看到最近 `500` 条 world events
- 在 `480 stale + 96 busy` 的顺序下，较早的 `80` 条 busy 会被窗口裁掉
- 最终就会出现“HTTP / action response 看到 `96 busy`，但 observability 聚合只剩 `16`”的假象

本轮已修正：

- `server/src/application/world/WorldService.ts::getWorldEvents(limit)` 不再硬编码 `500`
- 现在会按 `MAX_WORLD_EVENTS` 返回
- 当前 `MAX_WORLD_EVENTS=1000`，足以覆盖这轮 extreme sparse matrix 的 busy + stale 事件总量

这次修正的意义是：

- 修的是后端观测读链，不是 UI
- 修的是“聚合窗口低估冲突样本”的问题，不是“业务锁失败回执太慢”
- 修完后，`world_mutation_load` 正式测试再次确认 `recentFailures / lockConflicts` 能覆盖全部 `96` 条 busy
- 同轮顺手补齐了 `clear_plan_execution` 的 busy world event；它之前会返回 `world_mutation_busy`，但不会写失败事件，现在已经接回统一 world event 读链

### 2. 新增 extreme sparse matrix

在既有 `ultra / cap_plus / dual_faction_ultra / dual_faction_extreme` 之上，本轮正式保留并复跑下面这组更高档矩阵：

- `tick_pressure_extreme`
  - `WORLD_MUTATION_LOAD_CONTENDING_REQUESTS=96`
  - `WORLD_MUTATION_LOAD_PRESSURE_WAVES=6`
  - `WORLD_MUTATION_LOAD_WAVE_DELAY_MS=40`
- `session_endurance_cap_plus`
  - `SESSION_LOAD_SESSION_COUNT=128`
  - `SESSION_LOAD_PRIMARY_SEAT_COUNT=64`
  - `SESSION_LOAD_SECONDARY_SEAT_COUNT=64`
  - `SESSION_LOAD_HEARTBEAT_ROUNDS=16`
- `ws_fanout_dual_faction_extreme`
  - `WEBSOCKET_LOAD_CLIENT_COUNT=128`
  - `WEBSOCKET_LOAD_PRIMARY_CLIENT_COUNT=64`
  - `WEBSOCKET_LOAD_SECONDARY_CLIENT_COUNT=64`
  - `WEBSOCKET_LOAD_FANOUT_BURSTS=10`
  - `WEBSOCKET_LOAD_FANOUT_BURST_DELAY_MS=40`
- `runtime_combo_dual_faction_extreme`
  - `RUNTIME_COMBO_SESSION_COUNT=128`
  - `RUNTIME_COMBO_PRIMARY_SESSION_COUNT=64`
  - `RUNTIME_COMBO_SECONDARY_SESSION_COUNT=64`
  - `RUNTIME_COMBO_CLIENT_COUNT=128`
  - `RUNTIME_COMBO_PRIMARY_CLIENT_COUNT=64`
  - `RUNTIME_COMBO_SECONDARY_CLIENT_COUNT=64`
  - `RUNTIME_COMBO_HEARTBEAT_ROUNDS=6`
  - `RUNTIME_COMBO_FANOUT_BURSTS=8`
  - `RUNTIME_COMBO_FANOUT_BURST_DELAY_MS=40`

### 3. 本轮最新正式证据

- `tick_pressure_extreme`
  - `totalContendingRequests=576`
  - `busyCount=96`
  - `staleCount=480`
  - `busyP95Ms=7.77`
  - `advanceLatencyMs=1430.07`
  - top phases 仍然是 `advance_world_state > reflect_world_tick > compile_advisory > sync_v2_resources`
  - top subphases 已收口到 `directors_and_theater / collect_context / commit_world_state / ai_quota_sync`
- `session_endurance_cap_plus`
  - `sessionCount=128`
  - `heartbeatRounds=16`
  - `joinP95Ms=54.51`
  - `heartbeatP95Ms=68.56`
  - `leaveP95Ms=38.09`
- `ws_fanout_dual_faction_extreme`
  - `clientCount=128`
  - `fanoutBursts=10`
  - `subscribeP95Ms=93.08`
  - `fanoutP95Ms=74.51`
- `runtime_combo_dual_faction_extreme`
  - `sessionCount=128`
  - `clientCount=128`
  - `heartbeatRounds=6`
  - `fanoutBursts=8`
  - `joinP95Ms=63.64`
  - `subscribeP95Ms=109.24`
  - `heartbeatP95Ms=68.97`
  - `fanoutP95Ms=74.71`
  - `advanceP95Ms=1307.97`

### 4. 当前仍然成立的结论

- 这轮修复后，`world_mutation_busy` 的回执和 observability 统计口径重新一致了
- 但真正的系统瓶颈仍然不是 UI，也不是锁失败路径本身
- 目前主热点仍然在 `advance_world_state`、`reflect_world_tick.collect_context`、`commit_world_state`
- 这些 gate 通过，证明的是“后端有持续可复现的负载证据和观测口径”，不是“单进程容量问题已经解决”

### 5. 继续下钻补充

本轮继续只做后端热点细分，没有进入任何 UI 结构修改。

这轮主要补了三类更深 timing：

- `advance_world_state.directors_and_theater`
  - `buildTheaterSnapshot(...)` 现在不再把所有内部 timing 都记到 `alliance_director.*`
  - 现在会按调用方分别落到：
    - `advance_world_state.directors_and_theater.alliance_director.build_theater_snapshot.*`
    - `advance_world_state.directors_and_theater.opposing_director.build_theater_snapshot.*`
    - `advance_world_state.directors_and_theater.theater_snapshot.*`
  - `summarize_macro_regions` 继续下钻到了：
    - `resolve_tiles`
    - `scan_tiles`
    - `count_units`
    - `resolve_control`
    - `resolve_directive`
    - `compute_recent_battle_pressure`
    - `build_summary`
- `reflect_world_tick.collect_context`
  - `build_search_indexes` 继续下钻到了：
    - `normalize_unit_entries`
    - `normalize_tile_entries`
  - `collect_owner_changes` 继续下钻到了：
    - `build_before_owner_index`
    - `scan_after_tiles`
  - `collect_unit_deltas` 继续下钻到了：
    - `build_before_unit_index`
    - `scan_after_units`
  - `collect_order_outcomes` 继续下钻到了：
    - `collect_execution_orders`
    - `scan_resolved_orders`
  - `build_tile_to_region_map` 继续下钻到了：
    - `scan_regions`
- `advance_world_state.commit_world_state.record_intel_diff`
  - `scan_next_intel.compare_entries` 继续下钻到了：
    - `iterate_next_entries`
  - `scan_removed_intel` 继续下钻到了：
    - `iterate_previous_entries`
  - `persist_diff` 继续下钻到了：
    - `store_version_entry`
    - `trim_history`

这轮顺手做的低风险调整：

- `scan_removed_intel` 从 `Object.keys(previousIntelByTileId)` 改成直接遍历，减少额外数组分配。
- `buildTheaterSnapshot` 复用时的内部 timing 前缀现在与真实调用方一致，避免 opposing / summary 的深层 timing 被错误记到 alliance 路径。

本轮最新 gate 证据里，热点判断仍然没有变：

- baseline `world_mutation_load`
  - `advanceLatencyMs=1572.66`
  - top subphases by last 已经细到：
    - `advance_world_state.directors_and_theater=356.52`
    - `advance_world_state.commit_world_state=208.51`
    - `reflect_world_tick.collect_context=187.71`
    - `advance_world_state.directors_and_theater.alliance_director=133.25`
    - `advance_world_state.directors_and_theater.opposing_director=121.21`
    - `advance_world_state.directors_and_theater.alliance_director.build_theater_snapshot=106.56`
- `tick_pressure_extreme`
  - `advanceLatencyMs=1799.88`
  - top subphases 仍然是 `directors_and_theater / collect_context / commit_world_state`，只是现在能更清楚分到 alliance/opposing/build_theater_snapshot 这一层
- `runtime_combo_dual_faction_extreme`
  - `advanceP95Ms=1331.23`
  - top subphases 仍然是 `directors_and_theater / commit_world_state / collect_context`

这轮结论仍然很明确：

- 真正的主热点还在 `advance_world_state.directors_and_theater`、`reflect_world_tick.collect_context`、`commit_world_state.record_intel_diff`
- 只是现在已经能从“知道哪一大段慢”，推进到“知道是 `summarize_macro_regions.count_units`、`normalize_unit_entries`、`scan_after_units`、`iterate_previous_entries` 这一层”

### 6. 继续下钻：director handler 与 report matcher helper

本轮继续只做后端热点下钻，没有进入任何 UI 结构修改。

这轮的主改动有三块：

- `allianceDirector`
  - 维持原有 `apply_stance_hold / support / harass / expand` timing 名称不变
  - 但内部已经拆成独立 handler，并补了更深子阶段：
    - `apply_stance_hold.decrease_enemy_pressure`
    - `apply_stance_hold.append_action`
    - `apply_stance_support.build_region_tile_set`
    - `apply_stance_support.boost_regional_supply`
    - `apply_stance_support.append_action`
    - `apply_stance_harass.refresh_intel`
    - `apply_stance_harass.append_action`
    - `apply_stance_expand.claim_neutral_resource`
    - `apply_stance_expand.append_action`
- `opposingDirector`
  - 维持原有 `build_region_summary_index / build_tile_index / build_unit_index / build_target_occupied_tile_set / build_unhandled_unit_list` timing 不变
  - 但把固定剧本段和 generic fallback unit 段拆成独立 handler，并补了更深子阶段：
    - `apply_scout_reposition`
    - `apply_west_front_pressure`
    - `apply_reserve_anchor`
    - `apply_mid_supply_probe`
    - `apply_fortress_hold`
    - `apply_eastern_guard_hold`
    - `apply_east_expansion_pressure`
    - `process_unhandled_units`
    - `process_unhandled_units.collect_neighbor_tiles`
    - `process_unhandled_units.select_move_target`
    - `process_unhandled_units.apply_move`
- `reflect_world_tick.collect_context`
  - report matcher 链已经抽成独立 helper：
    - `prepareReportDrafts(...)`
    - `matchPreparedReportDraftUnits(...)`
    - `matchPreparedReportDraftTiles(...)`
    - `appendReportDrafts(...)`
  - 但保留了原有观测口径，不改这些 subphase 名字：
    - `build_report_drafts`
    - `prepare_report_text`
    - `match_units`
    - `match_tiles`
    - `assemble_report_events`

这轮最新正式证据：

- baseline `world_mutation_load`
  - `advanceLatencyMs=2096.4`
  - top phases 仍然是 `advance_world_state > reflect_world_tick > compile_advisory > sync_v2_resources`
  - top subphases by last 已经落到：
    - `advance_world_state.directors_and_theater=473.87`
    - `reflect_world_tick.collect_context=320.03`
    - `advance_world_state.commit_world_state=261.51`
    - `reflect_world_tick.collect_context.build_context=178.99`
    - `advance_world_state.directors_and_theater.alliance_director=173.22`
    - `advance_world_state.directors_and_theater.opposing_director=172.95`
- `tick_pressure_extreme`
  - `advanceLatencyMs=1943.65`
  - `busyCount=96`
  - `staleCount=480`
  - top subphases 仍然以 `directors_and_theater / collect_context / commit_world_state` 为主，但现在能继续落到 alliance/opposing handler 级
- `runtime_combo_dual_faction_extreme`
  - `advanceP95Ms=1906.92`
  - top subphases by last 已经能直接看到：
    - `advance_world_state.directors_and_theater=313.86`
    - `advance_world_state.commit_world_state=206.35`
    - `reflect_world_tick.collect_context=128.3`
    - `advance_world_state.directors_and_theater.alliance_director=115.29`
    - `advance_world_state.commit_world_state.record_intel_diff=109.41`
    - `advance_world_state.directors_and_theater.theater_snapshot=102.34`
    - `advance_world_state.directors_and_theater.opposing_director=96.1`

这轮之后，热点判断更明确：

- `advance_world_state.directors_and_theater` 里最该继续下钻的是 alliance/opposing handler 本身，而不是外层编排壳
- `reflect_world_tick.collect_context` 里 report matcher 已经从主流程抽开，下一轮如果还慢，就该看 matcher 本身而不是再回头猜 build_drafts 大块
- `commit_world_state.record_intel_diff` 仍然值得继续做 compare/encode 合并，但前提是不能破坏版本连续 diff 语义

### 7. 重启后串行复核与安全执行结论

本轮在 Windows 重启后重新按串行策略复跑正式链，目的是把“代码回归失败”和“本机内存/残留进程污染”分开。

重启后重新通过的正式入口：

- `npm run build`
- `npm run test:ai:runtime-observability`
- `npm run test:ai:runtime-http-contract`
- `npm run test:world:mutation-load`
- `npm run test:runtime:combo-load`
- `npm run gate:ai:runtime-load`
- `npm run gate:ai:runtime-capacity`
- `NODE_OPTIONS=--max-old-space-size=4096 npm run gate:ai:mainline:stability`
- `npm run gate:godot:week1`

这轮重新复核后确认的事实：

- 当前热点没有变，仍然是：
  - `advance_world_state.directors_and_theater`
  - `reflect_world_tick.collect_context`
  - `advance_world_state.commit_world_state`
- 在重启后的 baseline `world_mutation_load` 里，`reflect_world_tick.collect_context.build_drafts.build_report_drafts.match_tiles` 再次回到前排，说明 tile report matcher 仍是下一轮最值得继续下钻的叶子热点。
- `mainline` 之前出现的 `JavaScript heap out of memory` 先被确认为 gate 进程堆限制问题；在提高 `NODE_OPTIONS` 后，正式结果通过，不能把那次 OOM 直接当成后端合同回归。
- `godot:week1` 这轮第一次失败不是 UI 问题，也不是 schema 回归，而是 `127.0.0.1:8787` 上没有后端进程；按正式方式起本地后端后，`W1-C13` 恢复 `ok=True`。

本轮新增并确认纳入正式观测的深层 timing：

- `advance_world_state.directors_and_theater.*.build_theater_snapshot.summarize_macro_regions.build_region_unit_count_index.*`
- `advance_world_state.directors_and_theater.alliance_director.pick_target_tile.collect_region_tiles`
- `advance_world_state.directors_and_theater.alliance_director.pick_anchor_unit.scan_units`
- `reflect_world_tick.collect_context.select_tick_artifacts.scan_reports`
- `reflect_world_tick.collect_context.collect_order_outcomes.collect_execution_orders.flatten_execution_buckets`

安全清场与串行 gate 纪律已经独立落盘到：

- `docs/AI_BACKEND_RUNTIME_EXEC_PLAN_2026_04_19.md`

### 8. 继续下钻：match_tiles 低风险优化结果

在第 7 节确认 `match_tiles` 再次回到前排之后，本轮继续只做后端叶子热点优化，不改合同、不改 UI。

本轮对 `reflect_world_tick.collect_context.build_drafts.build_report_drafts.match_tiles` 做的处理：

- 保持 `findSearchEntryMatch(...)` 的最终匹配语义不变，仍然按既有 entry 顺序做 `combined.includes(...)` 判断。
- 但在进入 `includes()` 之前，给 `SearchEntry` 增加了：
  - `idLength / nameLength`
  - `idLeadChar / nameLeadChar`
- 给 `PreparedReportDraft` 增加了：
  - `combinedLength`
  - `combinedCharIndex`
- 这样 `match_tiles / match_units` 会先跳过“长度不可能命中”或“首字符根本不在文本里”的 entry，再进入真正的 `includes()`。

这一步的目标是：

- 不改 route / schema / MCP 合同
- 不改最终匹配口径
- 只降低 report matcher 的无效扫描成本

本轮重新复核后的正式结果：

- `npm run test:world:mutation-load`
  - baseline `advanceLatencyMs` 从上一轮重启后复核的 `2383.33` 降到 `1425.21`
  - `match_tiles` 已经掉出 top8
- `npm run gate:ai:runtime-load`
  - 最新 baseline `advanceLatencyMs=1358.24`
  - top subphases by last 变为：
    - `advance_world_state.directors_and_theater=319.64`
    - `reflect_world_tick.collect_context=188.54`
    - `advance_world_state.commit_world_state=170.85`
    - `advance_world_state.ai_quota_sync=147.4`
    - `advance_world_state.directors_and_theater.alliance_director=117.23`
    - `advance_world_state.directors_and_theater.opposing_director=116.14`
    - `advance_world_state.directors_and_theater.alliance_director.build_theater_snapshot=96.19`
    - `reflect_world_tick.collect_context.build_drafts=95.2`

这说明：

- `match_tiles` 仍然是值得继续跟进的热点族，但这一轮低风险过滤已经把它从 baseline 前排明显压下去了。
- 当前新的前排重心重新落回：
  - `directors_and_theater`
  - `collect_context` 总体
  - `commit_world_state`
