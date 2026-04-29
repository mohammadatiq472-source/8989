# AI 玩家 runtime 默认模型策略（2026-04-27）

## 结论

- 正式会改世界的 AI action proposal，默认使用 `claude-sonnet-4-6`。
- `claude-haiku-4-5-20251001` 仍可通过 `AI_PLAYER_RUNTIME_MODEL` 或 `LLM_RELAY_MODEL` 手动指定，但当前只适合作为低成本候选；它在 live gate 中会把 JSON 包进 markdown fence，不满足 strict raw JSON-only。
- 后端仍然是唯一权威：模型只输出 JSON proposal；schema 校验、动作白名单、审批、WorldService/rules、commitWorldState、receipt 全部继续由后端执行。

## 多模型方向

当前 runtime 节点仍是“单次请求选择一个 active model”的最短闭环，入口优先级是：

1. `AI_PLAYER_RUNTIME_MODEL` / `AI_PLAYER_RUNTIME_MODEL_BASE_URL`
2. `LLM_RELAY_MODEL` / `LLM_RELAY_URL`
3. 默认 `claude-sonnet-4-6` / `https://xiamiapi.xyz`

后续多供应商和高并发阶段不应把单模型写死到 AI 玩家本体里，而应新增模型路由层：

- 每个 AI / 势力可绑定模型偏好和预算。
- provider pool 负责并发、限流、熔断和 fallback。
- 会改世界的 proposal 走 strict JSON-only 能力池。
- 巡查摘要、聊天润色、低风险解释可走低成本模型池。

## Provider Pool Read Model v2

- 现阶段仍不做多供应商并发执行层，但 provider pool 的候选 target 列表已经进入 read-model。
- `/api/ai/players` 和 `/api/ai/players/:id` 返回 `modelStatus`，字段包括 `activeModel / activeProvider / source / strictJsonOnlyCapable / budgetTier / fallbackEnabled / fallbackModel / lastFallbackReason / secretConfigured / secretSource / byokSource / targetCount / candidateTargets`。
- `candidateTargets[]` 只暴露安全元数据：`model / provider / source / byokSource / priority / isActive / fallbackCandidate / strictJsonOnlyCapable / budgetTier / lastFailureReason / secretConfigured / secretSource`；不得返回 `apiKeys` 或 key 明文。
- `modelName / modelSource` 保留兼容；新 UI 应优先读取 `modelStatus`。
- `source` 当前实际会落在 `faction_config | env | default`；`player_config / fallback` 仍作为后续玩家级 key 和执行层故障切换合同占位。
- `byokSource` 当前会落在 `none | faction_config`；`player_config` 预留给后续玩家级密钥管理。
- `secretConfigured` 只表示运行环境存在可用 secret；`secretSource` 只显示 env 名称，绝不返回 key 明文或 `apiKeys`。
- `fallbackEnabled` 由候选 target 数量和 `allowLlmProposals` 真实计算；`fallbackModel` 指向下一候选 target，不再是固定默认模型占位。
- `lastFallbackReason` / `candidateTargets[].lastFailureReason` 记录最近一次模型 proposal 路径的安全失败码，例如 `missing_model_api_key` / `model_request_failed_*` / `model_response_*`，成功 proposal 会清空该字段；不记录原始 key、payload 或长错误堆栈。
- `claude-sonnet-4-6` 作为 strict action 默认模型；`claude-haiku-4-5-20251001` 等不满足 strict raw JSON-only 的模型在 read-model 中显示为 `economy_chat`。

## Provider Pool Execution v1 / BYOK 来源

- AI runtime proposal 执行层现在按 `player_config -> faction_config -> primary env -> optional LLM relay env -> default` 解析模型目标；read-model 会显示完整候选序列。
- `player_config` 来自 `/api/ai/provider/player-keys/:ownerPlayerId`，按 governor/player 维度保存模型、baseUrl 和 BYOK key；运行时只返回 `keyFingerprint / secretConfigured / secretSource`，不返回 key。
- `faction_config` 来自 `/api/faction/:id/model-config`，可配置 `model / commanderModel / baseUrl / apiKey`；AI action proposal 优先使用 `commanderModel`，再回退到 `model`。
- faction BYOK 只作为运行时 secret 进入模型请求 Authorization，不进入 runtime/list/detail 响应，不写入 proposal payload。
- faction/player BYOK 持久化均沿用 `FACTION_APIKEY_ENCRYPTION_KEY` 的安全口径：有 key 时加密落盘；无加密 key 时默认不持久化明文 key。
- provider fallback 执行层会按候选 target 顺序尝试，成功时返回 `providerFallback.selectedProvider` 和安全失败列表；失败原因会回写到后续 `runtime.modelStatus`。
- billing ledger / audit event store 已记录 provider 请求成功、失败和 fallback 失败原因；查询入口为 `/api/ai/provider/billing-ledger` 与 `/api/ai/provider/audit-events`。
- provider budget 已进入 reserve/commit 限流链；本地单进程用窗口计数，多实例生产应配置 `AI_PLAYER_PROVIDER_BUDGET_GATE_URL` 让外部 DB gate 原子扣减。
- ledger/audit 外部化通过 `AI_PLAYER_PROVIDER_LEDGER_AUDIT_DB_URL` 送 durable outbox；开启 HMAC 后外部网关可按 idempotency key 去重。
- Postgres gateway v1 已提供独立迁移和 HTTP 服务：`npm run ai:provider-postgres-gateway:migrate` / `npm run ai:provider-postgres-gateway:serve`，主 app 通过 `/ingest` 与 `/budget-gate` 接入。
- gateway 的幂等合同会拒绝同 key 不同 route/payload；预算 reserve 前释放过期 reservation，降低多实例 crash 后额度泄漏风险。
- 当前仍不是完整 provider pool：没有多供应商并发、熔断或复杂 provider health scoring。

## Patrol Scheduler 口径

- 保留 `POST /api/ai/chat/patrol-scheduler/run` 作为正式手动/外部 scheduler 入口。
- app 内后台定时器默认关闭，只允许通过 `AI_PLAYER_CHAT_PATROL_SCHEDULER_ENABLED=1` 显式开启。
- 正式环境暂不默认开启 app 内定时器；几千 AI 玩家规模下，应由外部队列或 scheduler 分片调用 HTTP 入口，配合 cooldown、limit、faction/AI 过滤和模型池限流。
- 外部调度建议：按 `factionId` 或 `aiPlayerIds` 分片，每批设置 `limit`，常规调用保持 `force=false`，让冷却中的 AI 计入 `skippedCount`，不要在 app 进程内默认启动全局 timer。
- 外部 queue v1 可传 `shardIndex / shardCount` 做静态分片；响应返回 `shard.selectedCount` 便于审计本批命中量。
- provider 预算 v1 可传 `providerBudgetTier / providerBudgetMaxRuns`；预算关闭或耗尽会返回 safe skip，不写聊天消息，不计入 failed。
- 外部 queue v2 可传 `queueRunId / idempotencyKey / leaseId / leaseTtlMs / backoffMs / retryAfterMs`；响应返回 `queue`，同一 `idempotencyKey` 会返回缓存结果并标记 `deduped=true`，不重复写巡查消息。
- `leaseId / leaseTtlMs / backoffMs / retryAfterMs` 当前是外部队列可审计合同，不是 app 内分布式锁；真正跨进程 lease ownership 仍应由外部队列系统负责。

## 当前验证口径

- strict live gate：默认模型应通过 `npm run gate:ai:live-model-proposal`。
- relay key 只能从临时环境变量读取：`AI_PLAYER_RUNTIME_MODEL_API_KEY` 或 `LLM_RELAY_API_KEY`。
- 不允许把 relay key、玩家自带 key 或任何 secret 明文写入仓库、日志或截图说明。
- provider read-model：`npm run test:ai:provider-pool-read-model-contract`。
- provider BYOK execution：`npm run test:ai:player-http-model-proposal-byok-contract`。
- provider accounting / audit / player key CRUD：`npm run test:ai:provider-accounting-contract`。
- provider Postgres gateway 合同：`npm run test:ai:provider-postgres-gateway-contract`。
- provider target contract：`npm run test:ai:runtime-model-target-contract`。
- patrol ops gate：`npm run gate:ai:patrol-scheduler-ops`。
