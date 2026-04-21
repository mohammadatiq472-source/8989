# AI 玩家后端新窗口提示词 2026-04-21

你现在是 8989 项目的 AI 玩家 / 后端系统专线窗口。  
目标不是 UI 结构设计；目标是继续把 AI 玩家权威合同、玩家原子动作、执行链、预算、观察性、失败路径、共享状态收口清楚。

仓库根：`C:\Users\26739\Desktop\8989`  
Godot 项目根：`C:\Users\26739\Desktop\8989\godot-client`

## 必须遵守的边界

- 不要主动做主壳布局、战报布局、按钮位置、SVG 图标等 UI 设计。
- 优先修改：
  - `server/src/**`
  - `shared/**`
  - `server/tests/**`
  - 必要时只改后端交接文档。
- 如果问题本质是 UI 结构问题，只记录交接项，不顺手去做。
- 当前仓库有大量既有无关脏改；不要 revert，不要 stage，不要误纳入提交。

## 开工前读取顺序

1. `AGENTS.md`
2. `docs/AGENTS_EXECUTION_CURRENT_2026_04.md`
3. `CODEX.md`
4. `docs/NATIVE_SLG_MAINLINE_INDEX.md`
5. `docs/AI_QUICK_NAV_INDEX_2026_04_10.md`
6. `docs/AI_PLAYER_WINDOW_HANDOFF_2026_04_20.md`
7. `docs/AI_PLAYER_OBSIDIAN_SESSION_NOTE_2026_04_21.md`
8. `docs/AI_PLAYER_BACKEND_KNOWLEDGE_GRAPH_2026_04_20.md`
9. `docs/AI_PLAYER_RESOURCE_TRANSFER_AUTHORITY_HANDOFF_2026_04_21.md`

## 当前必须先确认的后端事实

- AI 玩家真正的权威写链仍是：
  `AI proposal -> WorldService -> shared/domain/rules.ts -> commitWorldState -> receipt`
- 当前 v1 已正式化动作包括：
  `city_upgrade / building_upgrade / queue_fill_idle_slot / research_start / troop_train / troop_facility_upgrade / recruit_pool_select / recruit_commander / world_scout / march_move / garrison_set / general_focus_set / formation_assign / threat_escape / alliance_help / resource_gather / resource_transfer_to_governor / reward_claim`
- `resource_gather -> gatherAiResourceTile`
  - AI 指派单位必须驻扎在己方控制的 `resource` tile。
  - 收益按 `resourceKind` 和 `resourceLevel * 10` 一次性入账 `FactionState.aiResourceAccounts`。
  - 用 `FactionState.aiResourceGatherClaims[tileId]` 防重复。
- `resource_transfer_to_governor -> transferFactionResourcesToGovernor`
  - 同总督限定。
  - AI 子账户扣款。
  - 写入 `FactionState.governorResourceInboxes`。
  - high-risk，强制审批。
  - 跨势力贸易延期。
- `claimGovernorResourceInbox`
  - 这是总督/真人领取结算 authority，不是 AI 玩家动作。
  - 领取后落到 `FactionState.food/wood/stone/iron`。
- 当前没有真人个人钱包字段；不要创造 UI-local 钱包。

## 最近已提交

- `8296fa9 Add same-governor AI resource transfer`
- `8fa54ae Add AI resource gather and governor inbox claim`

## 正式验证入口

常规先跑：

```powershell
npm run gate:ai:preflight
npm run gate:ai:runtime-capacity
```

资源经济相关单测：

```powershell
npm run test:world:ai-resource-gather-http-contract
npm run test:world:governor-resource-inbox-http-contract
npm run test:world:resource-transfer-http-contract
npm run test:ai:player-http-resource-gather-contract
npm run test:ai:player-http-resource-transfer-contract
npm run test:ai:player-http-contract
```

如需复跑 mainline，必须用隔离环境，避免旧 persist 大状态导致 `Data cannot be cloned, out of memory`：

```powershell
$ts=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$env:WORLD_PERSIST_ROOT="C:\Users\26739\Desktop\8989\tmp\gate_mainline_world_$ts"
$env:SESSION_STATE_PERSIST_PATH="C:\Users\26739\Desktop\8989\tmp\gate_mainline_session_$ts.json"
$env:NODE_OPTIONS='--max-old-space-size=4096'
npm run gate:ai:mainline:stability
```

## 下一步建议

- 优先做后端治理降噪和验证稳定性，不要为了凑动作数硬接语义发虚的 authority。
- 可以继续找“已有 authority 可接”的 AI 玩家动作，但必须保持：
  - proposal args action-specific
  - proposal 创建期校验
  - executor 只走 WorldService
  - receipt 带 `worldAction / worldActionPayload / failureCode / execution`
- 剩余延期项：
  - 跨势力贸易
  - 真人个人钱包
  - 每日额度/冷却
  - UI 卡片呈现和审批交互

## 每轮输出必须包含

- 全文搜索后确认的后端事实。
- AI 玩家当前真正阻塞点。
- 改了哪些权威合同/动作链。
- 没有碰哪些 UI 结构边界。
- 跑了哪些正式验证。

