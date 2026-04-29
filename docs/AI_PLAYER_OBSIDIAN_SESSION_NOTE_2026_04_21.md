---
kind: ai-player-backend-session-note
date: 2026-04-21
tags:
  - 8989/ai-player
  - backend-authority
  - world-action
  - obsidian-handoff
canonical_sources:
  - shared/contracts/aiPlayerKnowledgeGraph.ts
  - docs/AI_PLAYER_BACKEND_KNOWLEDGE_GRAPH_2026_04_20.md
  - docs/AI_PLAYER_RESOURCE_TRANSFER_AUTHORITY_HANDOFF_2026_04_21.md
  - docs/AI_PLAYER_WINDOW_HANDOFF_2026_04_20.md
commits:
  - 8296fa9 Add same-governor AI resource transfer
  - 8fa54ae Add AI resource gather and governor inbox claim
---

# AI 玩家后端 Authority 收口记录 2026-04-21

## 一句话结论

本轮把 AI 玩家经济链从“待确认资源输送”收口成了三段后端权威链：

- `resource_gather -> gatherAiResourceTile`
- `resource_transfer_to_governor -> transferFactionResourcesToGovernor`
- `claimGovernorResourceInbox`，这是总督/真人领取结算 authority，不是 AI 玩家动作

## 已确认的代码事实

- AI 玩家真正的权威写链仍是：
  `AI proposal -> WorldService -> shared/domain/rules.ts -> commitWorldState -> receipt`
- 当前没有真人个人钱包字段；v1 总督领取后结算到真实存在的 `FactionState.food/wood/stone/iron`。
- `FactionState.aiResourceAccounts` 是 AI 玩家独立资源子账户；不要把 `FactionState.aiPlayers` 的部队分组误当钱包。
- `FactionState.governorResourceInboxes` 是 AI 转给总督后的待领取收件箱；UI 不直接改资源。
- 跨势力贸易延期；v1 只允许同总督资源转移。
- `resource_transfer_to_governor` 是 high-risk，强制审批。
- `resource_gather` 是 AI 自己赚钱，不是 AI 给真人转资源。

## 已落地的 authority

### gatherAiResourceTile

- AI 动作：`resource_gather`
- 入账目标：`FactionState.aiResourceAccounts[aiPlayerId]`
- v1 条件：AI 指派单位必须驻扎在己方控制的 `resource` tile。
- 收益：按 `resourceKind` 和 `resourceLevel * 10` 一次性入账。
- 防重复：`FactionState.aiResourceGatherClaims[tileId]`
- 不做每日额度；后续如有滥用反馈再加。

### transferFactionResourcesToGovernor

- AI 动作：`resource_transfer_to_governor`
- 来源：AI 子账户。
- 目标：同总督 `governorResourceInboxes[governorPlayerId]`
- high-risk，必须 `approvedBy === governorPlayerId`。
- 现有约束：reserve floor、per-action cap。
- 不允许跨势力贸易。

### claimGovernorResourceInbox

- AI 动作：无。
- 这是真人/总督领取结算 authority。
- 领取后结算到 `FactionState.food/wood/stone/iron`。
- 支持按 `transferId` 领取，也支持领取整个 pending inbox。

## 正式验证已通过

- `npm run build`
- `npm run test:world:ai-resource-gather-http-contract`
- `npm run test:world:governor-resource-inbox-http-contract`
- `npm run test:world:resource-transfer-http-contract`
- `npm run test:ai:player-http-resource-gather-contract`
- `npm run test:ai:player-http-resource-transfer-contract`
- `npm run test:ai:player-http-contract`
- `npm run test:ai:governance-guard`
- `npm run gate:ai:preflight`
- `npm run gate:ai:runtime-capacity`

## 已提交

- `8296fa9 Add same-governor AI resource transfer`
- `8fa54ae Add AI resource gather and governor inbox claim`

## 不要重复做的事

- 不要再问“真人资源落哪里”：v1 已确认，总督领取后落 `FactionState.food/wood/stone/iron`。
- 不要再问“AI 资源从哪里扣”：v1 已确认，AI 子账户。
- 不要把 `claimGovernorResourceInbox` 包装成 AI 玩家动作；它是真人/总督 settlement authority。
- 不要把 `resource_item_use / alliance_donate` 误当成 AI 给真人转资源链。
- 不要碰 Godot UI 结构、主壳布局、按钮、SVG、战报布局。

## 当前剩余边界

- 跨势力贸易延期。
- 真人个人钱包延期；当前没有该字段。
- 每日额度/冷却延期；v1 仅保留 reserve floor 和 per-action cap。
- UI 只消费 proposal、receipt、world snapshot；不能做本地资源补偿。
