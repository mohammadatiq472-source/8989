# World Cell Phase 2 Runtime Builder 收束整理

日期：2026-04-25

## 1. 本文用途

本文用于收束 2026-04-24 至 2026-04-25 自动化连续推进后的 Godot world-cell Phase 2 状态，避免后续窗口继续混淆：

- `nodes_formal` 是 preview/runtime contract 图，不是 live backend 回归图。
- `live_pass` 才是当前非 preview、真实 backend world 数据回归图。
- 当前后端真实 strategic node 数据只有 `pass`，没有 `fort/dock`。
- `placement_policy` 已经开始被 runtime 统一消费，但 movement/collision 还没有接真实移动链。

本文只记录 world-cell / city / strategic node runtime builder 相关事实，不扩展到资源 authority、资源生成、后端资源逻辑、AI 玩家、主壳 UI 或 Web 原型。

## 2. 固定执行口径

- 世界地图 tile/cell 是 SLG 操作单位、移动单位、占领单位、交互选择单位。
- 正式路线仍是方案 B：底盘固定 + 建筑绑定 + 扩建后资源格转建筑格。
- 不再把“往格子上叠一个建筑 PNG”的方案 A 当正式路线。
- 运行态投影口径仍是：
  - source footprint：`320x160`
  - TMX tile：`200x100`
  - anchor：bottom-center
- `hover / selection` 必须始终在最上层。
- 城池默认态只保留外围边界/城墙感，内部格线只在 hover、selection、debug、编辑态出现。
- 资源链仍不动：`resource_1x1`、`resourceKind/resourceLevel`、资源生成、后端 authority 都不属于本文工作范围。

## 3. 当前代码状态

当前核心改动集中在：

- `C:\Users\26739\Desktop\8989\godot-client\scripts\map\map_grid.gd`

复核时 `git diff --stat` 显示：

```text
godot-client/scripts/map/map_grid.gd | 5645 ++++++++++++++++++++++++++++++----
1 file changed, 5121 insertions(+), 524 deletions(-)
```

这说明当前 diff 已经很大。后续不要继续靠聊天记忆判断，应优先按下面几块审查：

- generic node runtime builder
- city strategy 表
- node dispatch 表
- placement_policy context 分发表
- live_pass capture metadata / audit
- preview/runtime 截图输出链

当前白名单文件状态复核到：

```text
 M godot-client/scripts/map/map_grid.gd
?? godot-client/assets/themes/slgclient/current/world/world_cell_assets_manifest_v1.json
?? godot-client/assets/themes/slgclient/current/world/world_cell_footprint_manifest_v1.json
?? godot-client/tools/export_world_cell_assets.mjs
```

注意：两个 manifest 和 exporter 在当前 git 视角是 untracked，但 runtime 能读取它们。提交前必须确认这些文件是否应纳入版本控制，不要误以为它们已经是 tracked 合同文件。

## 4. manifest 当前事实

复核读取到：

- `world_cell_assets_manifest_v1.json`
  - `composites` 是字典结构，不是数组。
  - composite 数量：`10`
  - 包含：
    - `world_node_city_v1`
    - `world_node_capital_v1`
    - `world_node_system_city_3x3_v1`
    - `world_node_system_city_5x5_v1`
    - `world_node_system_city_7x7_v1`
    - `world_node_system_city_9x9_v1`
    - `world_node_pass_sw_v1`
    - `world_node_pass_se_v1`
    - `world_node_fort_v1`
    - `world_node_dock_v1`
- `world_cell_footprint_manifest_v1.json`
  - `footprints` 是字典结构，不是数组。
  - footprint 数量：`12`
  - 包含：
    - `resource_1x1`
    - `player_city_3x3_initial`
    - `ai_city_3x3_initial`
    - `system_city_l03_l04_3x3`
    - `system_city_l05_l06_5x5`
    - `system_city_l07_l08_7x7`
    - `system_city_l09_9x9`
    - `pass_1x1`
    - `fort_1x1`
    - `dock_1x1`
    - `mountain_barrier_1x1`
    - `river_corridor_1x1`

复核提醒：不要用数组读取方式判断 id 是否存在，否则会误报 `pass/fort/dock` 缺失。

## 5. 已收敛的 runtime builder 方向

当前 `map_grid.gd` 已经开始从 city 专用逻辑转向 generic node runtime builder：

- `WORLD_CELL_RUNTIME_STRATEGY_RULES`：runtime strategy 入口。
- `WORLD_CELL_CITY_STRATEGY_RULES`：city 历史特判隔离到策略表。
- `WORLD_CELL_NODE_DISPATCH_RULES`：`pass/fort/dock` dispatch 入口。
- `WORLD_CELL_PLACEMENT_CONTEXT_RULE_MAP`：placement context 统一规则分发表。
- `captureNodeBuilderAuditStatus`：capture-node 级 builder 样本覆盖审计。
- `captureNodeReasonAuditStatus`：capture-node 级 conflict/duplicate reason 审计。

已收束的命名点：

- placement context 相关内部 builder 已从 `live_pass` 命名迁到 `capture_node` 命名。
- JSON 对外字段仍保留稳定字段名，例如 `placementContextAudit`、`placementContextStatus`、`livePassAuditStatus`，避免破坏自动化读取。

仍保留的命名边界：

- `live_pass` 仍是当前 capture mode 名，因为真实后端目前只有 pass 数据。
- `livePassAuditStatus` 仍保留，以兼容现有自动化和回归读取。
- 未来等 `fort/dock` 真实后端数据出现，再考虑迁到更通用的 `liveNodeAuditStatus`，但需要兼容旧字段。

## 6. placement_policy 当前状态

当前 placement_policy 已不只是 manifest 文本，已被 runtime 统一消费。

已统一审计的 context：

- `empty_resource_fill`
- `free_cell_base`
- `resource_overlay`
- `preview_node_placement`
- `movement`

当前 live_pass JSON 复核结果：

```json
{
  "allReservedPlacementContextsBlocked": true,
  "allDeferredMovementContextsUnblocked": true,
  "blockedCountsByContext": {
    "empty_resource_fill": 3,
    "free_cell_base": 3,
    "preview_node_placement": 3,
    "resource_overlay": 3,
    "total": 12
  },
  "unblockedCountsByContext": {
    "movement": 3,
    "total": 3
  }
}
```

解释：

- reserved footprint 当前会阻止 free cell base。
- reserved footprint 当前会阻止 empty resource fill。
- reserved footprint 当前会阻止 resource overlay。
- movement 仍然 deferred，不在本轮强行闭环；等真实移动链/collision 接入后再收。

## 7. live backend pass 回归事实

当前真实后端 world 数据只吐出 `pass`：

```json
{
  "observedRawBackendCounts": {
    "dock": 0,
    "fort": 0,
    "pass": 378
  },
  "observedRegisteredAnchorCounts": {
    "dock": 0,
    "fort": 0,
    "pass": 373
  },
  "liveAvailableTypes": ["pass"],
  "liveRegressionCoveredTypes": ["pass"],
  "liveRegressionMissingTypes": ["fort", "dock"],
  "passOnlyCurrentBackend": true
}
```

当前 `nodeTypeStats`：

```json
{
  "nodeType": "pass",
  "rawBackendNodeCount": 378,
  "registeredAnchorCount": 373,
  "duplicateAnchorCount": 5,
  "skippedConflictCount": 5,
  "skippedInvalidCount": 0
}
```

当前 conflict / duplicate 审计：

```json
{
  "captureNodeBuilderAuditStatus": {
    "captureNodeType": "pass",
    "conflictSamplesComplete": true,
    "duplicateSamplesComplete": true
  },
  "captureNodeReasonAuditStatus": {
    "captureNodeType": "pass",
    "conflictReasonCounts": {
      "city_pass_overlap": 5,
      "total": 5
    },
    "duplicateReasonCounts": {
      "same_anchor": 5,
      "total": 5
    },
    "conflictReasonTotalMatchesSkippedCount": true,
    "duplicateReasonTotalMatchesDuplicateCount": true
  }
}
```

解释：

- 后端原始 pass 数：`378`
- 注册 anchor 数：`373`
- 重复 anchor：`5`
- city/pass 投影冲突：`5`
- invalid：`0`
- 当前策略是 `duplicateAnchorPolicy=last_write_wins`

## 8. hit / reserved-hit 当前状态

当前 live_pass sample hit 回归：

```json
{
  "sampleCount": 3,
  "allHitOk": true,
  "allScreenRoundtripOk": true,
  "allReservedProxyOk": true,
  "failedSampleIds": []
}
```

reserved footprint 覆盖：

```json
{
  "coverageMode": "anchor_only",
  "footprintCellHitCount": 3,
  "anchorCellHitCount": 3,
  "nonAnchorCellHitCount": 0,
  "nonAnchorCoverageAvailable": false
}
```

解释：

- 当前真实 backend pass 是 `1x1`，所以没有非 anchor 格可验。
- reserved-hit 在 anchor cell 上通过。
- 多格 strategic node 或非 anchor reserved-hit 映射要等真实多格数据/多格 footprint 出现后再验。

## 9. 图片口径，避免再次混淆

当前图片必须按以下口径使用：

### city formal

路径：

```text
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_formal_crop.png
```

用途：

- city formal 默认态图。
- 可用于确认 city 底盘、payload、外围边界视觉。
- 不是 strategic node live backend 回归图。

### city stages

路径：

```text
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_stages_crop.png
```

用途：

- city stages 连续态图。
- 可用于确认 stage 0 到 stage 4 的分层表达。
- 不是 strategic node live backend 回归图。

### nodes_formal

路径：

```text
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_nodes_formal_crop.png
```

用途：

- `pass/fort/dock` preview/runtime contract 图。
- 只能证明 preview contract、composite/footprint/runtime placement 表达。
- 不允许再冒充 live backend 回归图。
- 如果用户人工指出此图不通过，应按 preview contract 图处理，不要把它和 live_pass 混在一起。

### live_pass

路径：

```text
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_pass_crop.png
```

用途：

- 当前唯一的非 preview、真实 backend strategic node runtime 回归图。
- 当前只覆盖 pass，因为后端真实数据只有 pass。
- 不能用于证明 fort/dock live 回归。

## 10. 最近验证事实

最近复核到：

- `tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_pass.json`
  - 更新时间：2026-04-25 14:15 左右
  - `livePassAuditStatus.ok=true`
  - `failedChecks=[]`
- `tmp\gates\godot_week1_gate_latest.json`
  - `ok=true`
  - `card=W1-C13`
  - `startedAt=2026-04-25T14:16:29`
  - `endedAt=2026-04-25T14:16:32`
  - `step_count=15`
  - `failed_steps=[]`
- 复核时后端已停止：
  - `/api/health=000`
  - 无相关 Godot/backend 残留进程

自动化回合曾跑过的正式入口：

```text
npm run godot:headless:smoke -- --scene res://scenes/app/main.tscn
npm run godot:mainline:runtime -- --quit-after 2
npm run gate:godot:week1
npm run gate:godot:week1:compat:debug-only
```

后续如果要重新验证，应继续使用这些正式入口，不要用 debug 图冒充正式结果。

## 11. 当前风险

- `map_grid.gd` 当前 diff 很大，下一步必须分块审查，不要继续盲目追加代码。
- `docs/` 下已有大量历史 dirty/untracked 文件，新增或修改文档前要确认归属。
- 两个 world-cell manifest 和 exporter 当前是 untracked，提交前必须确认是否应纳入版本控制。
- `nodes_formal` 和 `live_pass` 曾经在沟通中混淆过，后续必须先看 `captureMode` 和文件名。
- `fort/dock` 只有 contract/preview 能力，没有真实 backend live 回归。
- movement/collision 还没闭环。

## 12. 当前阻塞

- 后端真实 world 数据尚未吐出 `fort/dock`。
- 当前 pass 是 `1x1`，没有真实非 anchor reserved-hit 回归样本。
- movement/collision 未接真实移动链。

## 13. 下一步建议

优先顺序：

1. 审查 `map_grid.gd` 大 diff，把 builder / placement_policy / capture metadata / screenshot pipeline 分块。
2. 确认两个 world-cell manifest 和 exporter 是否应该进入版本控制。
3. 保持 `live_pass` 回归作为真实 backend pass 证据，不再用 `nodes_formal` 代替。
4. 等后端真实吐出 `fort/dock` 后，补非 preview 的 `fort/dock` runtime 截图和 hit 回归。
5. 等 movement/collision 接入真实移动链后，再把 placement_policy 的 movement context 从 deferred 改为闭环验证。

## 14. 新窗口最小入口

新窗口如果继续本任务，先读：

1. `C:\Users\26739\Desktop\8989\AGENTS.md`
2. `C:\Users\26739\Desktop\8989\docs\AGENTS_EXECUTION_CURRENT_2026_04.md`
3. `C:\Users\26739\Desktop\8989\docs\WORLD_CELL_LAYERED_BASE_BINDING_EXECUTION_PLAN_2026_04_23.md`
4. `C:\Users\26739\Desktop\8989\docs\WORLD_CELL_FOOTPRINT_PLACEMENT_CONTRACT_2026_04_23.md`
5. 本文档
6. `C:\Users\26739\Desktop\8989\godot-client\scripts\map\map_grid.gd`
7. 两个 world-cell manifest
8. `live_pass` JSON 和截图

新窗口第一句话应明确：

```text
继续 Godot world-cell Phase 2，只审查/收敛 map_grid.gd 的 generic node runtime builder、placement_policy 分发表和 live_pass metadata。不要碰资源 authority、resource generation、server/src、shared、AI 玩家、主壳 UI、Web 原型。nodes_formal 只作为 preview/runtime contract 图，live_pass 才是当前真实 backend pass 回归图。
```

