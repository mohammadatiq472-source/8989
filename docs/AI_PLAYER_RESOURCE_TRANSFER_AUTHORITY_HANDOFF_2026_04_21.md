# AI 玩家资源输送 authority / UI 交接（2026-04-21）

## 1. 结论

- 当前不能直接新增 AI 玩家白名单动作。
- 原因不是 UI，而是后端 authority 不完整：仓库里没有 `WorldActionRequest -> routes/world.ts -> WorldService -> shared/domain/rules.ts -> commitWorldState` 的“AI 势力向真人/总督输送资源”结算链。
- 已在机器可读知识图谱登记 deferred candidate：
  - `worldAction`: `transferFactionResourcesToGovernor`
  - `recommendation`: `defer`
  - `suggestedAiAction`: `null`

## 2. 已确认的代码事实

- AI 玩家治理链只应该产生 proposal，真正写世界仍必须走：
  `AI proposal -> governance executor -> WorldService -> shared/domain/rules.ts -> commitWorldState -> receipt`
- `shared/contracts/aiPlayer.ts` 里已有候选动作：
  - `resource_item_use`
  - `resource_gather`
  - `alliance_donate`
- 这些候选动作当前在 catalog 中不是可执行 v1；它们不是“把 AI 资源送给真人”的 authority。
- `shared/contracts/game/world.ts` 中的 `FactionState` 资源是势力级字段：
  - `food`
  - `wood`
  - `stone`
  - `iron`
- `FactionState.aiPlayers` 里的 `AIPlayer` 当前是势力内部的部队分组/指挥官角色，不是独立资源钱包。
- `shared/contracts/game/v2.ts` 中 `AIPlayerV2.resources` 存在，但这不是当前 AI 玩家治理正式写链的结算 authority。
- 当前没有明确的真人玩家资源钱包、总督资源收件箱或跨势力转账落点。

## 3. 后端 authority 语义建议

如果后续要做，先补后端 authority，不要先补 AI 白名单。

建议 authority 名称先用：

- `transferFactionResourcesToGovernor`

建议最小 payload：

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

必须先明确的问题：

- 真人玩家资源落点是“玩家钱包”、"总督收件箱"、还是“真人控制势力的 faction resources”。
- AI 玩家自身资源是从 `FactionState` 扣，还是先引入 AI 子账户。
- 同势力内部转移是否只是预算授权，不应真实增减资源。
- 跨势力输送是否允许；如果允许，是否需要同盟关系、冷却、税损或交易限制。

建议 rules 层失败码：

- `unknown_source_faction`
- `unknown_governor`
- `invalid_resource_amount`
- `insufficient_resources`
- `reserve_floor_violation`
- `transfer_limit_exceeded`
- `approval_required`
- `target_wallet_unresolved`

## 4. AI 玩家合同接入条件

只有当以下链路都存在并通过正式测试后，才允许新增 AI 玩家动作：

- `shared/contracts/game/world.ts` 新增 world action request 类型。
- `shared/schemas/worldAction.ts` 新增创建期 schema。
- `shared/domain/rules.ts` 新增纯规则结算函数。
- `server/src/application/world/WorldService.ts` 新增带 mutation lock 的 action wrapper。
- `server/src/routes/world.ts` 接入 `/api/world/action` switch。
- `server/tests/**` 有 world authority HTTP 合同测试。

之后才考虑 AI 玩家层：

- `shared/contracts/aiPlayer.ts` 新增 action-specific args。
- `shared/schemas/aiPlayer.ts` 新增 proposal 创建期校验。
- `server/src/application/ai/aiPlayerActionCatalog.ts` 标为 executable v1。
- `server/src/application/ai/aiPlayerProposalExecution.ts` 只调用 WorldService，不直接改世界。
- receipt 必须带 `worldAction / worldActionPayload / failureCode / execution`。

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
- 如果后端返回 `approval_required`、`reserve_floor_violation`、`target_wallet_unresolved`，UI 只展示失败原因和下一步，不做本地补偿。

## 6. 本轮没有触碰的边界

- 未修改 Godot 主壳布局。
- 未修改 AI 面板 presenter。
- 未修改按钮位置、SVG 图标、战报布局。
- 未新增任何 UI 资源转移交互。
