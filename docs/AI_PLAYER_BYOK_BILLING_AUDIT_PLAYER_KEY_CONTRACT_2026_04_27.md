# AI 玩家 BYOK 分账 / 审计 / 玩家级密钥合同（2026-04-27）

## 边界

本合同只定义后端 provider pool / BYOK 的生产化边界，不处理 Godot AI 管理页布局、world-cell 视觉、武将页、native_slg_shell 或正式 Web 客户端扩展。

## 当前已落地

- `runtime.modelStatus.byokSource` 已从 `secretSource` 拆出，当前值域为 `none / faction_config / player_config`。
- `runtime.modelStatus.candidateTargets[].byokSource` 可按候选 target 显示 BYOK 来源。
- faction BYOK 通过 `/api/faction/:id/model-config` 进入 runtime proposal Authorization；read-model、proposal payload、chat payload、ops gate payload 都不得返回 key 明文或 `apiKeys`。
- provider fallback 执行层会返回安全失败码，不返回 provider 原始错误体、Authorization header 或 key。
- player-level BYOK 已通过 `/api/ai/provider/player-keys/:ownerPlayerId` 落地最小 CRUD；runtime target 顺序为 `player_config -> faction_config -> env -> default`。
- billing ledger 和 audit event store 已落地最小持久化合同，入口为 `/api/ai/provider/billing-ledger` 与 `/api/ai/provider/audit-events`。

## 分账合同

billing ledger 独立于 runtime read-model，不返回 prompt、completion、raw response 或 key：

- `billingAccountType`: `platform | faction_byok | player_byok`
- `billingAccountId`: platform 为空或固定平台账户；faction BYOK 使用 `factionId`；player BYOK 使用 `playerId`
- `providerSource`: `default | env | faction_config | player_config`
- `byokSource`: `none | faction_config | player_config`
- `aiPlayerId / factionId / governorPlayerId`
- `model / provider / budgetTier`
- `requestId / queueRunId / idempotencyKey`
- `usage`: 只保存 token/cost 数字，不保存 prompt、completion、key 或 raw response
- `createdAt`

## 外部 ledger/audit DB 网关

生产环境不直接把 provider 事件写散到路由里，统一从 provider account store 送出：

- `AI_PLAYER_PROVIDER_LEDGER_AUDIT_DB_URL`: 外部 ledger/audit ingest 网关；网关后面应接 Postgres 或同等级持久化 DB。
- `AI_PLAYER_PROVIDER_LEDGER_AUDIT_DB_HMAC_SECRET`: 可选 HMAC-SHA256 签名 secret；开启后请求带 `X-Idempotency-Key / X-Signature-Alg / X-Signature`。
- `AI_PLAYER_PROVIDER_LEDGER_AUDIT_DB_TIMEOUT_MS`: 外部写入超时。
- app 内部保留 durable outbox，未送达事件会随 provider account store 一起落盘，重启后继续重试。
- 外部网关必须按 `X-Idempotency-Key` 去重；不要把 prompt、completion、Authorization、apiKey 或 raw response 写入 ledger/audit。

### Postgres gateway v1

后端已提供可独立部署的 Postgres gateway，主 app 仍只通过 HTTP sink/gate 合同连接：

- 迁移：`npm run ai:provider-postgres-gateway:migrate`
- 服务：`npm run ai:provider-postgres-gateway:serve`
- DB URL：`AI_PLAYER_PROVIDER_POSTGRES_GATEWAY_DATABASE_URL`，也可回退读取 `DATABASE_URL`
- 监听：`AI_PLAYER_PROVIDER_POSTGRES_GATEWAY_HOST` / `AI_PLAYER_PROVIDER_POSTGRES_GATEWAY_PORT`
- 可选自动迁移：`AI_PLAYER_PROVIDER_POSTGRES_GATEWAY_AUTO_MIGRATE=1`
- ledger/audit 入口：`POST /ingest`
- budget gate 入口：`POST /budget-gate`
- 健康检查：`GET /health`，Postgres store 会检查 DB 连通性和 `ai_provider_gateway_schema_migrations` 中的 migration marker；DB 不可达返回 `ok=false / databaseReachable=false`，DB 可连但未迁移时返回 `ok=false / migrationApplied=false`。

主 app 接入 gateway 时：

- `AI_PLAYER_PROVIDER_LEDGER_AUDIT_DB_URL=http://<gateway>/ingest`
- `AI_PLAYER_PROVIDER_BUDGET_GATE_URL=http://<gateway>/budget-gate`
- `AI_PLAYER_PROVIDER_LEDGER_AUDIT_DB_HMAC_SECRET` 和 `AI_PLAYER_PROVIDER_BUDGET_GATE_HMAC_SECRET` 必须与 gateway 环境一致。

迁移表：

- `ai_provider_gateway_schema_migrations`
- `ai_provider_gateway_idempotency`
- `ai_provider_billing_ledger`
- `ai_provider_audit_events`
- `ai_provider_budget_windows`
- `ai_provider_budget_reservations`

gateway 会拒绝同一个 idempotency key 复用到不同 route 或不同 payload；若同 key 请求仍在处理中，返回 409，不返回假成功。预算 reserve 前会释放已过期 reservation，避免 crash 后 `reservedRuns` 永久占用；若 reservation id 冲突，返回 409 并回滚本次 reserve 事务。commit/release 遇到未知 reservation id 也返回 409，避免把错序或丢失的扣减请求误报为成功。

迁移会给核心表添加 DB 级 CHECK 约束，覆盖 idempotency 状态、provider/source/byok 枚举、budget tier、窗口时间、非负计数和 reservation 状态。约束使用 idempotent `DO $$ ... $$` 和 `NOT VALID`，便于已有环境先启用新写入保护，再由 DBA 选择窗口执行历史数据校验。

gateway 签名口径：配置 HMAC secret 后必须同时提供 `X-Signature-Alg: hmac-sha256` 和 `X-Signature`，否则返回 401。`X-Idempotency-Key` 上限为 160 字符，和 shared schema 保持一致；超过上限返回 400，DB 侧也有 CHECK 约束。错误码口径：签名失败返回 401；坏 JSON、schema/合同不匹配、缺必填字段返回 400；请求体超过 `maxBodyBytes` 返回 413；幂等冲突、处理中 replay、reservation 冲突或未知 reservation 返回 409；只有未分类运行时异常才返回 500。

### 本地 Postgres 验证口径

本地 Postgres 可以作为当前阶段的正式合同验证环境，用来证明 migration、`/ingest`、`/budget-gate`、HMAC、幂等、reservation lease/expiry、budget reserve/commit/release 均能在真实 Postgres 协议和事务上跑通。它不等同生产交付，不能替代托管数据库、备份、监控、连接池容量规划和 secret 注入/轮换。

本地验证建议使用独立数据库和用户，避免污染开发机已有库。最小环境变量：

- `AI_PLAYER_PROVIDER_POSTGRES_GATEWAY_DATABASE_URL=postgresql://<user>:<password>@127.0.0.1:<port>/<database>`
- `AI_PLAYER_PROVIDER_LEDGER_AUDIT_DB_HMAC_SECRET=<local-random-secret>`
- `AI_PLAYER_PROVIDER_BUDGET_GATE_HMAC_SECRET=<local-random-secret>`
- `AI_PLAYER_PROVIDER_LEDGER_AUDIT_DB_URL=http://127.0.0.1:8789/ingest`
- `AI_PLAYER_PROVIDER_BUDGET_GATE_URL=http://127.0.0.1:8789/budget-gate`

本地库启动后先跑：

- `npm run ai:provider-postgres-gateway:migrate`
- `npm run test:ai:provider-postgres-gateway-contract`
- `npm run test:ai:provider-external-db-budget-contract`
- `npm run gate:ai:preflight`

当前 Windows 本地验证机记录：

- PostgreSQL 版本/目录：`C:\Program Files\PostgreSQL\18`
- data dir：`C:\Program Files\PostgreSQL\18\data`
- service：`postgresql-x64-18`
- superuser：`postgres`
- port：`5432`
- command line tools：`C:\Program Files\PostgreSQL\18\bin`
- 未安装 Stack Builder 附加组件不影响 gateway 验证。

本地初始化入口：

- 脚本：`tmp/setup_ai_provider_postgres_local.ps1`
- 行为：提示输入本机 `postgres` 密码，创建或轮换 `ai_provider_gateway` role，创建 `ai_provider_gateway` database，写入 gitignored `tmp/ai_provider_gateway.env.ps1`，并尝试执行 `npm run ai:provider-postgres-gateway:migrate`。
- 密码策略：脚本生成本地 DB 用户密码、HMAC secret 和 `FACTION_APIKEY_ENCRYPTION_KEY`，只写入 `tmp/ai_provider_gateway.env.ps1`；不要提交，不要粘贴到聊天。
- 验证时先 dot-source env：`. .\tmp\ai_provider_gateway.env.ps1`。

2026-04-28 本机验证状态：

- `postgresql-x64-18` 服务运行中，`127.0.0.1:5432` 可连。
- 已创建本地 role/database：`ai_provider_gateway` / `ai_provider_gateway`。
- 已生成本地 env：`tmp/ai_provider_gateway.env.ps1`。该文件含本地 DB 密码和 HMAC/encryption secret，仅限本机验证，不提交。
- `npm run ai:provider-postgres-gateway:migrate` 已在本地 Postgres 上通过。
- `GET http://127.0.0.1:8789/health` 返回 `backend=postgres / databaseReachable=true / migrationApplied=true / migrationId=2026_04_28_ai_player_provider_gateway_v1`。
- 只读 SQL 校验：6 张 gateway 核心表存在，migration marker 为 `2026_04_28_ai_player_provider_gateway_v1`。
- 真实 HTTP smoke：本地 gateway 带 HMAC 调用 `/ingest` 和 `/budget-gate` 通过；DB 结果为 ledger=1、audit=1、reservation=`committed`、budget window `consumed_runs=1`。

生产化后续仍需替换为托管 Postgres 或同等级外部 DB，并补齐：迁移窗口、备份恢复演练、指标告警、连接池上限、网络 ACL、HMAC secret 轮换、`FACTION_APIKEY_ENCRYPTION_KEY` 持久保存策略。

## 审计合同

审计事件只记录可追踪元数据：

- `eventId`
- `eventType`: `provider_request_attempted | provider_request_succeeded | provider_request_failed | byok_key_configured | byok_key_revoked`
- `actorId`
- `aiPlayerId / factionId / governorPlayerId`
- `model / provider / source / byokSource`
- `failureCode`
- `queueRunId / idempotencyKey / leaseId`
- `createdAt`

禁止审计：

- raw key
- Authorization header
- `apiKeys`
- 完整 prompt / completion
- provider raw error body

## Provider Budget Gate

provider budget 已从记录型 ledger 推进到 reserve/commit 限流合同：

- 本地单进程可用 `AI_PLAYER_PROVIDER_BUDGET_MAX_RUNS_PER_WINDOW`、`AI_PLAYER_PROVIDER_BUDGET_MAX_TOTAL_TOKENS_PER_WINDOW` 等 env 做窗口扣减。
- 多实例生产环境应配置 `AI_PLAYER_PROVIDER_BUDGET_GATE_URL`，让外部预算 gate 在 DB 事务里完成 reserve/commit/release。
- `AI_PLAYER_PROVIDER_BUDGET_GATE_HMAC_SECRET` 开启后，预算 gate 请求同样带 HMAC 签名和 idempotency key。
- `AI_PLAYER_PROVIDER_BUDGET_GATE_FAIL_OPEN` 默认关闭；外部预算 gate 不可用时默认 fail-closed，返回 `provider_budget_gate_unavailable`，避免失控消耗。
- app 内部会持久化 reservation，并通过 `AI_PLAYER_PROVIDER_BUDGET_RESERVATION_TTL_MS` 释放超时预留，防止 crash 后永久占用本地 reservedRuns。

## 玩家级密钥管理合同

`player_config` 作为独立 CRUD 合同，不混入 faction config：

- `ownerPlayerId`
- `provider`
- `model`
- `baseUrl`
- `keyFingerprint`
- `encryptedSecretRef`
- `status`: `active | revoked`
- `createdAt / updatedAt / revokedAt`

玩家级 key 的 read-model 只能返回 `secretConfigured / secretSource / byokSource / keyFingerprint`，不能返回 key 明文。

当前正式入口：

- `POST /api/ai/provider/player-keys/:ownerPlayerId`：保存或更新玩家级 BYOK 配置；新建 active key 必须提供 `apiKey`。
- `GET /api/ai/provider/player-keys/:ownerPlayerId`：读取安全 read-model；返回 `keyFingerprint` 和 `secretConfigured`，不返回 key。
- `DELETE /api/ai/provider/player-keys/:ownerPlayerId?actorId=...`：撤销玩家级 key，清除运行时 secret，并写入审计事件。
- 加密口径沿用 `FACTION_APIKEY_ENCRYPTION_KEY`；无 key 且未显式打开 `FACTION_APIKEY_ALLOW_PLAINTEXT_PERSIST=1` 时，secret 只在内存可用、不明文落盘。

## 当前仍未落地

- provider pool 自动熔断、并发调度。
- Postgres gateway 已有迁移和 HTTP 服务入口；生产还需要托管数据库、备份、监控告警、连接池参数和 secret 注入策略。
- provider budget 仍是窗口级 reserve/commit 限流，未实现复杂 provider health scoring、跨 provider 权重调度或成本预测模型。
- player-level key CRUD 当前只提供后端 HTTP 合同，Godot/Web 保存 UI 仍由 UI 窗口后续消费。

## 正式验证口径

- provider fallback / BYOK 执行：`npm run test:ai:player-http-model-proposal-byok-contract`
- provider read-model：`npm run test:ai:provider-pool-read-model-contract`
- provider accounting / audit / player key CRUD：`npm run test:ai:provider-accounting-contract`
- 外部 ledger/audit DB 网关 + provider budget gate：`npm run test:ai:provider-external-db-budget-contract`
- Postgres gateway 迁移/HTTP/HMAC/幂等合同：`npm run test:ai:provider-postgres-gateway-contract`
- queue 幂等 / lease / backoff：`npm run test:ai:player-http-chat-patrol-tick-contract`
- ops gate：`npm run gate:ai:patrol-scheduler-ops`
- 聚合：`npm run gate:ai:preflight`
