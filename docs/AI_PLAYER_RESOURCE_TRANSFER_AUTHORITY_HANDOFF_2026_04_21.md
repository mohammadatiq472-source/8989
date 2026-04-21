# AI 玩家资源输送 authority / UI 交接（2026-04-21）

## 1. 结论

- 用户已确认 v1 语义：
  - 只允许同总督转移。
  - 跨势力贸易延期。
  - 目标落点是“总督待领取收件箱”。
  - 资源来源是 AI 玩家独立资源子账户。
  - 全部 high-risk，强制审批。
- 已新增后端 authority：
  - `worldAction`: `transferFactionResourcesToGovernor`
  - `aiAction`: `resource_transfer_to_governor`
  - `recommendation`: `promoted`
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
- `shared/contracts/game/v2.ts` 中 `AIPlayerV2.resources` 存在，但这不是当前 AI 玩家治理正式写链的结算 authority。
- 当前没有做跨势力交易，也没有直接写真人玩家钱包。

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

## 3.1 需要用户确认的阻塞点

这些问题已同步写入 `shared/contracts/aiPlayerKnowledgeGraph.ts`，HTTP/MCP/Obsidian 读面都能读到。

| 阻塞点 | 需要确认的问题 | 建议默认口径 |
| --- | --- | --- |
| `target-wallet-semantics` | 真人收到资源后落在哪里：真人钱包、总督待领取收件箱、还是目标 faction resources？ | 已确认：v1 使用“总督待领取收件箱”。 |
| `source-account-semantics` | AI 的资源从哪里扣：AI 子账户、V2 `AIPlayerV2.resources`、还是源 faction resources？ | 已确认：v1 使用 AI 子账户。 |
| `transfer-scope` | 允许同总督、同盟内、还是跨势力转资源？ | 已确认：v1 只允许同总督；跨势力贸易延期。 |
| `approval-and-limits` | 是否强制真人审批、保留最低库存、单次/每日上限、冷却？ | 已确认：全部 high-risk，强制审批；保留 reserve floor 和 per-action cap。 |

建议 rules 层失败码：

- `unknown_source_faction`
- `missing_ai_resource_account`
- `governor_mismatch`
- `invalid_resource_amount`
- `insufficient_resources`
- `reserve_floor_violation`
- `transfer_limit_exceeded`
- `approval_required`

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
- 如果后端返回 `approval_required`、`governor_mismatch`、`missing_ai_resource_account`、`insufficient_resources` 或 `reserve_floor_violation`，UI 只展示失败原因和下一步，不做本地补偿。

## 6. 本轮没有触碰的边界

- 未修改 Godot 主壳布局。
- 未修改 AI 面板 presenter。
- 未修改按钮位置、SVG 图标、战报布局。
- 未新增任何 UI 资源转移交互。
