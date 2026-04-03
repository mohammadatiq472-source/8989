# 10. Heartbeat / Failover Sequence

本文记录 Unity-first 会话层的心跳、离线托管、L1/L2/L3 切换和上线恢复时序。目标是把“谁在控制这个势力、何时切到 AI、何时恢复给玩家”写成可执行的接口级流程。

## 1. 状态定义

### 1.1 会话核心字段

`SessionManager` 当前真正驱动状态变化的字段只有两个：

- `lastHeartbeat`：最近一次有效心跳时间戳
- `autonomyLevel`：`L1_assigned | L2_delegated | L3_negotiated`

辅助索引：

- `factionOwner`：`factionId -> token` 的占用关系
- `sessions`：`token -> PlayerSession`

### 1.2 对外可见控制模式

`/api/session/runtime` 会把自治层级映射成控制模式：

- `L1_assigned` -> `human_assigned`
- `L2_delegated` -> `ai_delegated`
- `L3_negotiated` -> `ai_negotiated`

这只是展示层语义，真正的状态仍然以 `autonomyLevel` 为准。

## 2. 接口入口

### 2.1 Unity-first 入口

前端 Unity 侧实际调用的是这些别名接口：

- `POST /api/unity/join`
- `GET /api/unity/runtime`
- `POST /api/unity/heartbeat`
- `POST /api/unity/autonomy`
- `POST /api/unity/leave`

它们在 `server/src/app.ts` 内部转发到 `/api/session/*`。

### 2.2 Session 真实路由

- `POST /api/session/join`
- `POST /api/session/heartbeat`
- `GET /api/session/status`
- `GET /api/session/metrics`
- `GET /api/session/runtime`
- `POST /api/session/autonomy`
- `POST /api/session/leave`

## 3. 时序步骤

### 步骤 1：玩家加入，建立 L1 执行态

1. 玩家调用 `POST /api/unity/join`，实际进入 `POST /api/session/join`。
2. `joinSession(factionId, playerName, validFactions)` 创建新会话。
3. 初始状态固定为：
   - `autonomyLevel = 'L1_assigned'`
   - `lastHeartbeat = now`
   - `factionOwner[factionId] = token`
4. `runtime` / `status` / `metrics` 里都会把该势力视为在线且有人类接管。

### 步骤 2：在线期间心跳续租

1. 客户端周期性调用 `POST /api/unity/heartbeat`。
2. `heartbeat(token)` 做三件事：
   - 校验 token 格式
   - 更新 `lastHeartbeat = now`
   - 如果当前不是 `L1_assigned`，强制回拉到 `L1_assigned`
3. 结果：
   - 会话继续被视为在线
   - 控制权回到玩家
   - 任何托管态都会被覆盖为 L1

### 步骤 3：玩家离线，进入自动托管窗口

1. 玩家停止发送 heartbeat。
2. `sweepTimeoutsAndPruneStaleSessions()` 在以下入口被触发时扫描超时：
   - `getSessionStatus`
   - `getSessionMetrics`
   - `getFactionAutonomyLevel`
   - `getFactionSessionSnapshot`
   - `getAllAutonomousFactionIds`
   - `validateToken`
   - `heartbeat`
   - `setSessionAutonomyLevel`
   - `sweepAllTimeouts`
3. 当 `now - lastHeartbeat >= heartbeatTimeoutMs` 且当前为 `L1_assigned` 时：
   - `autonomyLevel` 自动切换为 `L2_delegated`
4. 这一步表示：
   - 玩家离线
   - 该势力进入 AI 代理模式
   - `getAllAutonomousFactionIds(allFactionIds)` 会把它纳入自动规划集合

### 步骤 4：L2 托管驱动自动规划

1. `GameClock._onTick()` 每个 tick 先调用 `sweepAllTimeouts()`。
2. 然后调用 `_autoplanL2Factions()`。
3. `_autoplanL2Factions()` 通过 `getAllAutonomousFactionIds(allFactionIds)` 找到当前可自动驾驶势力。
4. 对这些势力调用 `createPlanningResult(...)`，再通过 `queuePlanExecutionAction(...)` 进入规则引擎。
5. 结果是：
   - AI 可在玩家离线时继续产出战略计划
   - 真正的世界变更仍由 `advanceTick` / 规则引擎裁决

### 步骤 5：玩家显式切到 L3 协商态

1. 玩家或系统调用 `POST /api/unity/autonomy`，实际进入 `POST /api/session/autonomy`。
2. Body 提供：
   - `token`
   - `level = 'L3_negotiated'`
3. `setSessionAutonomyLevel(token, level)` 直接写入：
   - `session.autonomyLevel = 'L3_negotiated'`
   - `session.lastHeartbeat = now`
4. `/api/session/runtime` 会把它显示为：
   - `autonomyLevel: L3_negotiated`
   - `controlMode: ai_negotiated`

### 步骤 6：L3 与 L2 的实际差异

1. `L2_delegated`：表示离线托管，系统默认 AI 自主接管。
2. `L3_negotiated`：表示协商态，语义上更偏外交 / 谈判 / 跨势力互动。
3. 在会话扫描层面，`getAllAutonomousFactionIds()` 会把非在线的 `L1` 和所有非 `L1` 势力都纳入自动集合。
4. 所以：
   - `L3` 不会阻止自动规划
   - `L3` 主要用于区分控制语义和 UI 展示

### 步骤 7：玩家上线恢复，自动回到 L1

1. 玩家重新连上后继续调用 `POST /api/unity/heartbeat`。
2. `heartbeat(token)` 会：
   - 更新 `lastHeartbeat`
   - 把 `autonomyLevel` 强制改回 `L1_assigned`
3. 结果：
   - `runtime` 重新显示 `human_assigned`
   - 该势力退出 AI 托管
   - 后续 tick 不再把它当作自动驾驶势力

### 步骤 8：长期离线，进入 stale prune

1. 如果 `now - lastHeartbeat >= staleSessionTtlMs`，`sweepTimeoutsAndPruneStaleSessions()` 会直接删除会话。
2. 删除后：
   - `sessions.delete(token)`
   - `factionOwner.delete(factionId)`（仅当 owner 还是该 token）
3. 结果：
   - 该势力被释放
   - 后续可以重新 `join`
   - `status` 里不会再看到该玩家会话

### 步骤 9：主动离开

1. 玩家调用 `POST /api/unity/leave`。
2. `leaveSession(token)` 直接删除会话，不走超时等待。
3. 这是显式退出，不是 failover。

## 4. 状态迁移表

| 触发 | 入口 | 状态变化 | 结果 |
|---|---|---|---|
| 加入 | `POST /api/unity/join` | 无会话 -> `L1_assigned` | 玩家占用势力 |
| 心跳 | `POST /api/unity/heartbeat` | `L2/L3/L1 -> L1_assigned` | 恢复人类控制 |
| 超时 | `sweepAllTimeouts()` / 任意读接口触发扫描 | `L1_assigned -> L2_delegated` | 自动托管开始 |
| 显式协商 | `POST /api/unity/autonomy` | 任意 -> `L3_negotiated` | 协商语义生效 |
| 长期静默 | 扫描命中 `staleSessionTtlMs` | 会话删除 | 势力释放，可重占 |
| 主动离开 | `POST /api/unity/leave` | 会话删除 | 立即退出 |

## 5. 建议的阅读顺序

1. 先看 `server/src/routes/session.ts` 的接口入口。
2. 再看 `server/src/multiplayer/SessionManager.ts` 的状态迁移。
3. 最后看 `server/src/application/clock/GameClock.ts` 的 L2 自动规划。

## 6. 可复现验证链

正式入口：

```bash
npm run test:session:manager
```

验证重点：

- `heartbeatTimeoutMs` 到期后，`L1_assigned` 会切到 `L2_delegated`
- `heartbeat(token)` 会把会话拉回 `L1_assigned`
- `setSessionAutonomyLevel(token, 'L3_negotiated')` 后，runtime 会显示 `ai_negotiated`
- stale 会话会被 prune，势力可重新 reclaim

