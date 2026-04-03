# Unity 总对接清单

本页是 Unity 侧接入后端的总入口清单。目标是让 Unity 只依赖正式 HTTP 入口和稳定 DTO，不依赖临时脚本、手工改包或非 authoritative 分支。

## 0. 适用范围

- Unity 负责 UI、输入、状态展示、联机连通性和自动化控制开关。
- 后端负责权威世界状态、会话自治、Tick 推进、AI 配置和规则裁决。
- Unity 不直接改世界状态，只通过正式入口提交请求。

## 1. 后端正式入口列表

### 1.1 会话与自治

| 入口 | 方法 | 用途 | Unity 侧建议 |
|---|---|---|---|
| `/api/session/join` | POST | 玩家接入、获取 session token | 首次进入或 token 失效后调用 |
| `/api/session/heartbeat` | POST | 心跳保活、维持 L1_assigned | 常规运行期间固定发送 |
| `/api/session/leave` | POST | 主动离开、释放控制权 | 退出战局、切后台前调用 |
| `/api/session/status` | GET | 查看玩家在线与 AI 代管状态 | 用于 UI 状态栏和重连提示 |
| `/api/session/runtime` | GET | 读取 tick、worldVersion、自治模式、doctrine 预览、模型配置 | 作为 Unity 启动后的第一份运行时快照 |
| `/api/session/metrics` | GET | 读取会话阈值与容量信息 | 用于调试面板与告警显示 |
| `/api/session/autonomy` | POST | 手动切换 L1/L2/L3 | 仅在产品明确允许时暴露高级入口 |

### 1.2 世界与 Tick

| 入口 | 方法 | 用途 | Unity 侧建议 |
|---|---|---|---|
| `/api/world` | GET | 读取权威世界摘要、version、tick、战报 | 每次提交计划前和每次 Tick 后刷新 |
| `/api/world/map-layout` | GET | 读取地图布局 | 大地图初次加载时使用 |
| `/api/world/action` | POST | 提交 `queuePlanExecution`、`advanceTick`、`clearPlanExecution`、`moveUnit` 等动作 | 作为世界交互主入口 |

### 1.3 AI 配置与模型

| 入口 | 方法 | 用途 | Unity 侧建议 |
|---|---|---|---|
| `/api/ai/config?factionId=player` | GET | 读取 player 势力 AI 配置 | 指挥台配置页初始化时读取 |
| `/api/ai/config` | POST | 保存 player 势力 doctrine / model 配置 | 配置页保存时提交 |
| `/api/ai/models` | GET | 拉取可选模型列表 | 模型下拉框初始化 |

### 1.4 叙事与观测

| 入口 | 方法 | 用途 | Unity 侧建议 |
|---|---|---|---|
| `/api/replay/archive` | GET | 拉取回放归档 | 战报回看面板 |
| `/api/events` | GET | 拉取事件列表 | 调试或高级叙事面板 |
| `/api/narratives` | GET | 拉取叙事事件 | 史诗流 / 战报流展示 |

### 1.5 启动与验证命令

| 命令 | 用途 |
|---|---|
| `npm run start` | 启动 HTTP 后端 |
| `npm run start:clock` | 启动带 GameClock 的正式节拍链路 |
| `npm run test:session:manager` | 验证会话自治、心跳、失效和恢复 |

## 2. C# DTO 文件映射

### 2.1 会话层

| Backend 入口 | Unity C# 文件 | 主要类型 | 说明 |
|---|---|---|---|
| `/api/session/join` | `docs/unity/08-csharp-dto-session.cs` | `SessionJoinRequestDto` / `SessionJoinResponseDto` | 建议以 `player` 为正式人类势力 |
| `/api/session/heartbeat` | `docs/unity/08-csharp-dto-session.cs` | `SessionHeartbeatRequestDto` / `SessionHeartbeatResponseDto` | 心跳只传 token |
| `/api/session/leave` | `docs/unity/08-csharp-dto-session.cs` | `SessionLeaveRequestDto` / `SessionLeaveResponseDto` | 主动释放控制 |
| `/api/session/status` | `docs/unity/08-csharp-dto-session.cs` | `SessionStatusResponseDto`、`SessionStatusPlayerDto` | 读取在线/离线和 AI 代管列表 |
| `/api/session/runtime` | `docs/unity/08-csharp-dto-session.cs` | `SessionRuntimeResponseDto`、`SessionRuntimeFactionDto` | 作为 UI 运行态总快照 |
| `/api/session/metrics` | `docs/unity/08-csharp-dto-session.cs` | `SessionMetricsResponseDto` | 展示 `heartbeatTimeoutMs`、`staleSessionTtlMs`、容量 |
| `/api/session/autonomy` | `docs/unity/08-csharp-dto-session.cs` | `SessionAutonomyRequestDto` / `SessionAutonomyResponseDto` | 仅高级入口使用 |

### 2.2 世界层

| Backend 入口 | Unity C# 文件 | 主要类型 | 说明 |
|---|---|---|---|
| `/api/world/action` | `docs/unity/06-csharp-dto-world.cs` | `WorldActionType`、`WorldActionRequestDto<TPayload>`、`WorldActionResponseDto` | 世界动作总入口 |
| `queuePlanExecution` | `docs/unity/06-csharp-dto-world.cs` | `WorldQueuePlanExecutionRequestDto`、`WorldQueuePlanExecutionPayloadDto` | 提交战略计划 |
| `advanceTick` | `docs/unity/06-csharp-dto-world.cs` | `WorldAdvanceTickRequestDto` | 让规则引擎推进一 Tick |
| `clearPlanExecution` | `docs/unity/06-csharp-dto-world.cs` | `WorldClearPlanExecutionRequestDto` | 清除过期计划 |
| `moveUnit` | `docs/unity/06-csharp-dto-world.cs` | `WorldMoveUnitRequestDto` | 单位直接移动 |
| `previewGeneralDirectives` | `docs/unity/06-csharp-dto-world.cs` | `WorldPreviewGeneralDirectivesRequestDto` | 预览将领指令分发 |
| `previewDomainAgenda` | `docs/unity/06-csharp-dto-world.cs` | `WorldPreviewDomainAgendaRequestDto` | 预览域级议程 |
| `previewNationalAgenda` | `docs/unity/06-csharp-dto-world.cs` | `WorldPreviewNationalAgendaRequestDto` | 预览国级议程 |
| `previewCourtSession` | `docs/unity/06-csharp-dto-world.cs` | `WorldPreviewCourtSessionRequestDto` | 预览庭议流程 |
| `queryCivilMemory` | `docs/unity/06-csharp-dto-world.cs` | `WorldQueryCivilMemoryRequestDto` | 查询文明记忆 |
| `deployReserveHero` / `upgradeCity` / `upgradeCityTech` / `queueTacticalOverride` / `updateAllianceDirective` | `docs/unity/06-csharp-dto-world.cs` | 对应 RequestDto / PayloadDto | 后续功能按需接入 |
| `/api/world` | `docs/unity/06-csharp-dto-world.cs` 或项目自定义 world DTO | `WorldState` / `WorldSummaryResponse` | 读取权威世界快照 |

### 2.3 AI 配置层

| Backend 入口 | Unity C# 文件 | 主要类型 | 说明 |
|---|---|---|---|
| `/api/ai/config` | `docs/unity/09-csharp-dto-ai-config.cs` | `AiConfigResponseDto`、`AiConfigUpdateRequestDto` | 保存/读取 doctrine 和模型配置 |
| `/api/ai/models` | 暂无独立 C# DTO 文件；可先用 `JsonElement` 或按 `shared/contracts/game/ai.ts` 补齐 Unity 侧列表 DTO | `AiModelsResponse`、`AiModelDescriptor`（项目共享契约） | 模型选择列表 |

### 2.4 客户端壳

| 文件 | 作用 |
|---|---|
| `docs/unity/07-csharp-client-skeleton.cs` | UnityWebRequest 传输层，封装 join / heartbeat / runtime / autonomy / world action |

## 3. 调用顺序

### 3.1 初始化

1. 启动后端：`npm run start`。
2. 如果 Unity 需要正式节拍推进，再启动：`npm run start:clock`。
3. Unity 首屏先请求 `GET /api/session/runtime`，确认当前 `tick`、`worldVersion`、`autonomyLevel` 和 `controlMode`。
4. Unity 读取 `GET /api/ai/config?factionId=player` 和 `GET /api/ai/models`，初始化指挥台 AI 配置。
5. Unity 读取 `GET /api/world` 和必要时的 `GET /api/world/map-layout`，完成地图和战报初始渲染。
6. 如果玩家尚未接入，调用 `POST /api/session/join` 获取 token。

### 3.2 常规 Tick

1. Unity 每个 UI 刷新周期或固定节拍发送 `POST /api/session/heartbeat`。
2. Unity 依据 `worldVersion` 判断是否需要重新拉取 `GET /api/world`。
3. 玩家提交战略意图时，先调用 `POST /api/world/action` 的 `queuePlanExecution`。
4. 若需要规则引擎推进，则调用 `POST /api/world/action` 的 `advanceTick`。
5. Tick 完成后，刷新 `GET /api/session/runtime`、`GET /api/session/status` 和 `GET /api/world`。

### 3.3 玩家离线托管

1. Unity 停止收到心跳 ACK 或用户显式退出前，服务器保留最后一次有效心跳。
2. 超过 `heartbeatTimeoutMs` 后，后端会把会话从 `L1_assigned` 切到 `L2_delegated`。
3. Unity 侧展示“AI 代管中”，并继续允许只读刷新 `GET /api/session/runtime` / `GET /api/session/status`。
4. 若产品允许自动托管，Unity 可以继续提交 `queuePlanExecution`，但不要让前端直接裁决世界状态。

### 3.4 恢复接管

1. 玩家重新连线后，先恢复 `POST /api/session/heartbeat`。
2. 服务器若仍在可恢复窗口内，会把会话切回 `L1_assigned`。
3. Unity 立即刷新 `GET /api/session/runtime`，确认 `controlMode = human_assigned`。
4. 若已超过 `staleSessionTtlMs`，token 失效，需要重新 `POST /api/session/join`。
5. 若之前处于手动 `L3_negotiated`，要明确该状态是否允许被下一次 heartbeat 覆盖，当前实现里需要按后端实际规则显示。

## 4. 心跳频率与超时阈值

### 4.1 推荐值

- 心跳发送频率：`10s` 一次。
- 客户端告警阈值：`20s` 无确认进入降级提示。
- 服务器自治切换阈值：`30s` 无心跳触发 `L1_assigned -> L2_delegated`。
- stale 清理阈值：默认 `10m`。

### 4.2 说明

- `SessionManager` 通过 `heartbeatTimeoutMs` 和 `staleSessionTtlMs` 控制自治切换与清理。
- `npm run test:session:manager` 中使用更短的测试阈值做可复现验证，不代表生产推荐值。
- Unity 不要依赖固定常量写死所有阈值，优先从 `GET /api/session/metrics` 读取后端当前值。

## 5. 验收步骤

### 5.1 最小验证链

1. 启动后端：

```powershell
npm run start:clock
```

2. 验证会话自治和恢复的正式测试：

```powershell
npm run test:session:manager
```

3. 进行 live 验证：

```powershell
$base = 'http://127.0.0.1:8787'
$join = @{ factionId = 'player'; playerName = 'UnityQA' } | ConvertTo-Json -Depth 4
$session = Invoke-RestMethod -Method Post -Uri "$base/api/session/join" -ContentType 'application/json' -Body $join
Invoke-RestMethod -Method Post -Uri "$base/api/session/heartbeat" -ContentType 'application/json' -Body (@{ token = $session.token } | ConvertTo-Json -Depth 4)
Invoke-RestMethod -Uri "$base/api/session/status"
Invoke-RestMethod -Uri "$base/api/session/runtime"
Invoke-RestMethod -Uri "$base/api/world"
```

### 5.2 验收判定

- `join` 返回 `sessionId` 和 `token`。
- `heartbeat` 返回 `ok: true`。
- `runtime` 能看到 `tick`、`worldVersion`、`autonomyLevel`、`controlMode` 和 `doctrinePreview`。
- `status` 能显示 player 在线态和 AI 代管列表。
- `world` 能返回权威世界摘要，Unity 不需要自行拼 world。
- `npm run test:session:manager` 通过，证明 L1/L2/L3 和过期路径都可复现。

## 6. 交付结论

Unity 对接顺序应固定为：

1. 会话/runtime 首读。
2. AI 配置首读。
3. world/map 首读。
4. 定时 heartbeat。
5. plan queue -> advanceTick。
6. 离线切 L2，恢复后回 L1。

任何时候都不要让 Unity 绕过 `advanceTick` 和 session 自治边界直接改世界。
