# AI 玩家资源输送 authority / UI 交接（2026-04-21）

## 1. 结论

- 用户已确认 v1 语义：
  - 只允许同总督转移。
  - 不做跨势力贸易。
  - 目标落点是“总督待领取收件箱”。
  - 资源来源是 AI 玩家独立资源子账户。
  - 全部 high-risk，强制审批。
  - 每日额度/冷却由后端 rules authority 结算，UI 不做本地兜底。
- 已新增后端 authority：
  - `worldAction`: `transferFactionResourcesToGovernor`
  - `aiAction`: `resource_transfer_to_governor`
  - `recommendation`: `promoted`
- 已新增配置 authority：
  - `worldAction`: `setAiResourceTransferPolicy`
  - 语义：配置每日额度、窗口 tick、冷却 tick；不是 AI 玩家动作
- 已新增配套 authority：
  - `worldAction`: `claimGovernorResourceInbox`
  - 语义：总督领取 pending transfer 后，资源结算到总督所属 `FactionState.food/wood/stone/iron`
- 已新增 AI 资源来源 authority：
  - `worldAction`: `gatherAiResourceTile`
  - `aiAction`: `resource_gather`
  - 语义：AI 指派单位驻扎己方资源地后，按 `resourceKind/resourceLevel` 一次性入账 AI 子账户
- 这条链只写后端世界状态，不做 UI 本地结算。

## 2. 已确认的代码事实

- AI 玩家治理链只应该产生 proposal，真正写世界仍必须走：
  `AI proposal -> governance executor -> WorldService -> shared/domain/rules.ts -> commitWorldState -> receipt`
- `resource_item_use / resource_gather / alliance_donate` 仍不是“AI 给总督转资源”的 authority。
- `shared/contracts/game/world.ts` 中的 `FactionState` 资源是势力级字段：
  - `food`
  - `wood`
  - `stone`
  - `iron`
- `FactionState.aiPlayers` 里的 `AIPlayer` 当前是势力内部的部队分组/指挥官角色，不是资源钱包。
- 新增资源子账户落点：
  - `FactionState.aiResourceAccounts[aiPlayerId]`
- 新增总督待领取收件箱落点：
  - `FactionState.governorResourceInboxes[governorPlayerId]`
- 新增一次性资源地采集记录：
  - `FactionState.aiResourceGatherClaims[tileId]`
- 新增 AI 资源输送额度/冷却状态：
  - `FactionState.aiResourceTransferQuotaByAiPlayer[aiPlayerId]`
- AI runtime/read model 已暴露 UI 便捷字段：
  - `GovernedAiPlayerRuntime.resourceTransfer`
  - 包含 `configuredPolicy / effectivePolicy / quota / remainingQuotaTotal / cooldownRemainingTicks / windowRemainingTicks / canTransferNow / blockedBy`
- `shared/contracts/game/v2.ts` 中 `AIPlayerV2.resources` 存在，但这不是当前 AI 玩家治理正式写链的结算 authority。
- 当前没有做跨势力交易，也没有直接写真人玩家钱包。
- 真人侧已有货币单位“玉符 / 铜钱”，但它们不是本链 `food/wood/stone/iron` 资源输送的结算落点；UI 不要把资源转移临时映射到玉符/铜钱钱包。

## 3. 后端 authority 语义建议

后端 authority 已按用户确认语义落地。

建议 authority 名称先用：

- `transferFactionResourcesToGovernor`

当前 payload：

```ts
{
  sourceFactionId: string
  governorPlayerId: string
  resources: {
    food?: number
    wood?: number
    stone?: number
    iron?: number
  }
  reason: string
  approvedBy: string
}
```

当前规则：

- `approvedBy` 必须等于 `governorPlayerId`。
- `sourceAiPlayerId` 必须存在于 `FactionState.aiResourceAccounts`。
- AI 子账户 `governorPlayerId` 必须匹配目标总督。
- 扣 AI 子账户资源，写入 `governorResourceInboxes` pending transfer。
- 保留 reserve floor 和单次总量 cap。
- 每日额度/冷却走 rules 层与 WorldService authority；默认同一窗口总量上限为 100、窗口 24 tick、成功转移后冷却 3 tick，但可由 `FactionState.aiResourceTransferPolicy` 配置。
- 配置入口走 `setAiResourceTransferPolicy`，UI/配置面如需调整额度只调用后端 authority，不直接改本地状态。
- 总督领取时走 `claimGovernorResourceInbox`，把 pending transfer 结算到当前代码真实存在的 faction resources。
- AI 自己赚钱走 `gatherAiResourceTile`，要求 AI 指派单位驻扎在己方资源地，收益为 `resourceLevel * 10`，一次性入账 AI 子账户，不加每日额度。

## 3.1 需要用户确认的阻塞点

这些问题已同步写入 `shared/contracts/aiPlayerKnowledgeGraph.ts`，HTTP/MCP/Obsidian 读面都能读到。

| 阻塞点 | 需要确认的问题 | 建议默认口径 |
| --- | --- | --- |
| `target-wallet-semantics` | 真人收到资源后落在哪里：真人钱包、总督待领取收件箱、还是目标 faction resources？ | 已确认：v1 使用“总督待领取收件箱”。 |
| `source-account-semantics` | AI 的资源从哪里扣：AI 子账户、V2 `AIPlayerV2.resources`、还是源 faction resources？ | 已确认：v1 使用 AI 子账户。 |
| `transfer-scope` | 允许同总督、同盟内、还是跨势力转资源？ | 已确认：v1 只允许同总督；不做跨势力贸易。 |
| `approval-and-limits` | 是否强制真人审批、保留最低库存、单次/每日上限、冷却？ | 已确认：全部 high-risk，强制审批；保留 reserve floor 和 per-action cap。 |
| `daily-quota-cooldown` | 是否需要每日额度与冷却？ | 已确认并已后端落地：rules 层维护 AI 资源输送额度/冷却状态，UI 只消费后端 failureCode/receipt。 |

资源转移 rules 层失败码：

- `unknown_source_faction`
- `missing_ai_resource_account`
- `governor_mismatch`
- `invalid_resource_amount`
- `insufficient_resources`
- `reserve_floor_violation`
- `transfer_limit_exceeded`
- `daily_quota_exceeded`
- `transfer_cooldown_active`
- `approval_required`

总督领取 rules 层失败码：

- `unknown_faction`
- `missing_governor_inbox`
- `missing_governor_transfer`

AI 资源地采集 rules 层失败码：

- `unknown_faction`
- `missing_ai_resource_account`
- `governor_mismatch`
- `unknown_unit`
- `unit_faction_mismatch`
- `unit_not_assigned_to_ai_player`
- `unknown_resource_tile`
- `tile_not_resource`
- `tile_not_controlled`
- `unit_not_on_tile`
- `resource_tile_already_gathered`

## 4. AI 玩家合同接入条件

当前已完成：

- `shared/contracts/game/world.ts` 新增 world action request 类型。
- `shared/schemas/worldAction.ts` 新增创建期 schema。
- `shared/domain/rules.ts` 新增纯规则结算函数。
- `server/src/application/world/WorldService.ts` 新增带 mutation lock 的 action wrapper。
- `server/src/routes/world.ts` 接入 `/api/world/action` switch。
- `server/tests/**` 有 world authority HTTP 合同测试。
- `shared/contracts/aiPlayer.ts` 新增 action-specific args。
- `shared/schemas/aiPlayer.ts` 新增 proposal 创建期校验。
- `server/src/application/ai/aiPlayerActionCatalog.ts` 标为 executable v1。
- `server/src/application/ai/aiPlayerProposalExecution.ts` 只调用 WorldService，不直接改世界。
- receipt 必须带 `worldAction / worldActionPayload / failureCode / execution`。

正式验证入口：

- `npm run test:world:resource-transfer-http-contract`
- `npm run test:world:governor-resource-inbox-http-contract`
- `npm run test:world:ai-resource-gather-http-contract`
- `npm run test:ai:player-http-resource-gather-contract`
- `npm run test:ai:player-http-resource-transfer-contract`
- `npm run test:ai:player-http-contract`
- `npm run gate:ai:preflight`

## 5. 给 UI / AI 窗口侧的交接项

UI 侧不要先做结算逻辑，只需要为后端 authority 预留消费面。

需要 UI 侧后续整理的问题：

- AI 对话里真人下达“给我/给某势力转资源”时，是否生成 proposal 卡片，而不是立即执行。
- proposal 卡片展示：
  - 来源 AI 玩家/势力
  - 目标真人/总督
  - 资源类型与数量
  - 原因
  - 风险/预算提示
  - 后端返回的 failureCode
- 审批按钮只调用治理 proposal approve/execute 路由，不绕过后端 world action。
- UI 不直接改资源显示；结算后只消费 world snapshot/runtime receipt。
- 如果后端返回 `approval_required`、`governor_mismatch`、`missing_ai_resource_account`、`insufficient_resources`、`reserve_floor_violation`、`daily_quota_exceeded` 或 `transfer_cooldown_active`，UI 只展示失败原因和下一步，不做本地补偿。
- UI 不要做跨势力贸易入口；当前产品口径是不做跨势力贸易。
- UI 不要把本资源输送链接到真人“玉符 / 铜钱”钱包；这条链只展示 `food/wood/stone/iron` 和总督 inbox/faction resource 结算。
- UI 需要展示每日额度/冷却提示，但额度/冷却判定必须消费后端返回的 receipt、failureCode 或 quota 字段，不做本地强判。
- UI 可优先从 `/api/ai/players/:aiPlayerId` 或 AI 玩家列表读取 `resourceTransfer`，展示 policy、剩余额度和冷却；不必为了额度展示拉完整 world snapshot。

## 5.1 给 UI 窗口的明确交接清单

### 5.1.1 数据读取入口

- AI 玩家资源输送展示优先读取：
  - `GET /api/ai/players/:aiPlayerId`
  - `GET /api/ai/players`
- 重点读取字段：
  - `resourceTransfer.configuredPolicy`
  - `resourceTransfer.effectivePolicy`
  - `resourceTransfer.quota`
  - `resourceTransfer.remainingQuotaTotal`
  - `resourceTransfer.cooldownRemainingTicks`
  - `resourceTransfer.windowRemainingTicks`
  - `resourceTransfer.canTransferNow`
  - `resourceTransfer.blockedBy`
- UI 不需要为了展示额度/冷却去拉完整 world snapshot。
- 如果需要展示总督 inbox pending transfer 列表，再读 world snapshot 或后续专门 inbox read API；不要在 UI 本地推导 pending transfer。

### 5.1.2 资源转移 proposal 卡片

- 资源转移 proposal 卡片：
  - 展示来源 AI 玩家、来源势力、目标总督、资源类型与数量、reason、riskLevel。
  - `resource_transfer_to_governor` 必须展示 high-risk 与“需要总督审批”。
  - 展示 `resourceTransfer.remainingQuotaTotal`、`resourceTransfer.cooldownRemainingTicks`、`resourceTransfer.blockedBy`。
  - approve/execute 只调用 AI player proposal 路由，不直接调用 world action。

### 5.1.3 资源转移 receipt 卡片

- 资源转移 receipt 卡片：
  - 展示 `worldAction`、`worldActionPayload`、`failureCode`、`execution`。
  - `approval_required` 要提示“必须由目标总督审批”。
  - `insufficient_resources`、`reserve_floor_violation`、`transfer_limit_exceeded`、`daily_quota_exceeded`、`transfer_cooldown_active` 要提示资源、额度或冷却不足，不做本地补偿。

### 5.1.4 总督 inbox 展示

- 总督 inbox 展示：
  - 展示 pending transfer 列表与 `totalPendingResources`。
  - 领取按钮调用 `claimGovernorResourceInbox` 对应后端 authority。
  - 领取成功后只刷新 world snapshot，不在 UI 本地加资源。

### 5.1.5 资源输送 policy 配置 UI

- 如果 UI 要做总督/管理侧配置面，调用：
  - `/api/world/action`
  - `action: "setAiResourceTransferPolicy"`
- payload：

```json
{
  "action": "setAiResourceTransferPolicy",
  "payload": {
    "factionId": "player",
    "dailyQuotaTotal": 100,
    "dailyWindowTicks": 24,
    "cooldownTicks": 3
  }
}
```

- 三个 policy 字段都可配置：
  - `dailyQuotaTotal`：同一额度窗口内允许 AI 转出的资源总量。
  - `dailyWindowTicks`：额度窗口长度，单位是 world tick，不是自然日。
  - `cooldownTicks`：成功转移后的冷却 tick。
- 至少提交一个 policy 字段；否则后端 schema 会拒绝。
- 配置成功后 UI 重新读取 `/api/ai/players/:aiPlayerId` 的 `resourceTransfer` 字段刷新展示。
- `setAiResourceTransferPolicy` 不是 AI 玩家动作，不要做成 AI proposal 卡片。

### 5.1.6 UI 禁止事项

- 不要做跨势力贸易入口。
- 不要把本链资源输送映射到真人“玉符 / 铜钱”。
- 不要在 UI 本地扣 AI 子账户资源。
- 不要在 UI 本地给 faction 加 `food/wood/stone/iron`。
- 不要在 UI 本地计算最终是否能转；最终结果以后端 receipt / failureCode 为准。
- 不要绕过 AI player proposal approve/execute 路由直接执行 `transferFactionResourcesToGovernor`。
- 不要把 `claimGovernorResourceInbox`、`setAiResourceTransferPolicy` 包装成 AI 玩家原子动作。

## 6. 本轮没有触碰的边界

- 未修改 Godot 主壳布局。
- 未修改 AI 面板 presenter。
- 未修改按钮位置、SVG 图标、战报布局。
- 未新增任何 UI 资源转移交互。
