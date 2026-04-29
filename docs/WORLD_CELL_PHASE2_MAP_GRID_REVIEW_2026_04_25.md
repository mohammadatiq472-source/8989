# World Cell Phase 2 map_grid.gd 分块审查

日期：2026-04-25

## 1. 审查目标

本次审查只围绕：

- `C:\Users\26739\Desktop\8989\godot-client\scripts\map\map_grid.gd`
- generic node runtime builder
- placement_policy runtime 分发表
- live_pass metadata 审计语义

本文先用于分块审查 28 轮自动化后形成的大 diff；2026-04-25 本轮已经按审查风险项完成第一批收束改动。目的不是继续堆视觉逻辑，而是把 generic node builder、placement_policy 分发表、metadata 审计语义收紧到可验证状态。

## 2. 读取依据

已回读：

- `AGENTS.md`
- `docs/AGENTS_EXECUTION_CURRENT_2026_04.md`
- `docs/WORLD_CELL_LAYERED_BASE_BINDING_EXECUTION_PLAN_2026_04_23.md`
- `docs/WORLD_CELL_FOOTPRINT_PLACEMENT_CONTRACT_2026_04_23.md`
- `docs/WORLD_CELL_PHASE2_RUNTIME_BUILDER_CONSOLIDATION_2026_04_25.md`
- `godot-client/scripts/map/map_grid.gd`
- `world_cell_assets_manifest_v1.json`
- `world_cell_footprint_manifest_v1.json`
- `tmp/screenshots/world_resource_alignment/world_cell_runtime_preview_capture_live_pass.json`

边界仍然不变：

- 不碰 `server/src/**`
- 不碰 `shared/**`
- 不碰资源 authority
- 不碰 resource generation
- 不碰 AI 玩家系统
- 不碰主壳 UI / Web 原型

## 3. 当前总体判断

`map_grid.gd` 当前已经从 city 专用 builder 过渡到了 generic runtime builder 主链。

旧口径里关注的 city 专用入口，例如 `_rebuild_world_cell_city_entries()`、`_build_world_cell_city_anchor_visual_entry()`、`_populate_world_cell_city_base_entries()`，当前已经不再作为独立函数存在。对应能力已经收进下面这条链：

```text
_rebuild_backend_tile_index()
  -> collect city entries / node dispatch entries
  -> _rebuild_world_cell_runtime_entries()
  -> _register_world_cell_runtime_group()
  -> _build_world_cell_runtime_group()
  -> _build_world_cell_anchor_visual_entry()
  -> _populate_world_cell_base_entries()
  -> _reserve_world_cell_footprint_at()
```

这条链现在同时覆盖：

- city / player_city / ai_city / system_city
- pass / fort / dock 的 node dispatch 合同
- payload_slots / layered_city / payload_node 消费
- reserved footprint
- reserved-hit proxy
- placement_policy context 分发表

因此，继续方向是“分块审查并收紧命名/审计语义”，不是再另起一套 pass/fort/dock 特殊绘制链。

## 4. generic node runtime builder 结构

### 4.1 策略表

当前 strategy 入口：

- `WORLD_CELL_RUNTIME_STRATEGY_ORDER`
- `WORLD_CELL_RUNTIME_STRATEGY_RULES`
- `WORLD_CELL_CITY_STRATEGY_RULES`
- `WORLD_CELL_NODE_DISPATCH_RULES`

当前策略含义：

- city strategy priority：`10`
- node dispatch priority：`30`
- node dispatch fallback priority：`90`

city 被独立到 `WORLD_CELL_CITY_STRATEGY_RULES`：

- legacy player city landmark
- legacy AI city landmark
- owned small city
- large system city
- system city default

pass/fort/dock 被独立到 `WORLD_CELL_NODE_DISPATCH_RULES`：

- `pass -> pass_1x1 -> world_node_pass_sw_v1 / world_node_pass_se_v1`
- `fort -> fort_1x1 -> world_node_fort_v1`
- `dock -> dock_1x1 -> world_node_dock_v1`

结论：

- city 历史特判已经从主 builder 链抽到策略表。
- pass/fort/dock 不再需要走独立绘制模型，已经可以走 node dispatch + payload_node 模型。

### 4.2 后端数据进入 builder 的路径

入口在 `_rebuild_backend_tile_index()`。

当前处理顺序：

1. 清空 tile、resource、world-cell、preview、live capture 缓存。
2. `_reset_world_cell_runtime_builder_stats()`。
3. 遍历 `_tiles`，建立 backend tile -> tmx 映射。
4. resource tile 仍然进入 `_resource_overlay_entries` 和 `_resource_overlay_by_tmx_key`。
5. city tile 转成 city entry，并加入 `world_cell_backend_entries`。
6. pass/fort/dock 通过 `_is_supported_world_cell_node_tile_type()` 和 `_build_world_cell_backend_node_entry()` 转成 node entry。
7. 调用 `_rebuild_world_cell_runtime_entries(world_cell_backend_entries)`。
8. 调用 `_rebuild_world_cell_live_capture_samples()`。
9. 调用 `_rebuild_world_cell_preview_entries()`。

结论：

- resource 链没有被接进 generic node builder。
- city 和 strategic node 已经进入同一 runtime builder。
- `rawBackendNodeCounts` 只对 supported strategic node 计数，目前 live 后端只产生 pass。

### 4.3 runtime group 注册

核心函数：

- `_rebuild_world_cell_runtime_entries()`
- `_register_world_cell_runtime_group()`
- `_build_world_cell_runtime_group()`
- `_pick_world_cell_runtime_anchor_entry()`
- `_resolve_world_cell_runtime_footprint_id()`
- `_resolve_world_cell_runtime_composite_id()`
- `_resolve_world_cell_runtime_footprint_center_tmx()`
- `_build_world_cell_anchor_visual_entry()`

当前行为：

- 按 `groupKey` 聚合 backend entries。
- 按 strategy priority 排序，city 先于 node dispatch。
- 选 group anchor。
- 解析 footprint。
- 解析 composite。
- 解析 footprint center。
- 构造 anchor visual entry。
- 检查 reserved footprint conflict。
- 记录 duplicate anchor。
- 写入 `_world_cell_node_anchor_by_tmx_key`。
- 写入 `_world_cell_node_base_by_tmx_key`。
- 写入 reserved footprint 映射。

结论：

- builder 已经是 generic。
- conflict 和 duplicate 都有 audit。
- base cells 和 reserved footprint 都是 runtime builder 产物，不是单独 preview 逻辑。

### 4.4 payload_node 消费

核心函数：

- `_should_world_cell_runtime_consume_payload_slots()`
- `_resolve_world_cell_anchor_layers()`
- `_resolve_world_cell_payload_slots()`
- `_draw_world_cell_node()`
- `_draw_world_cell_payload_slots()`
- `_draw_world_cell_frame()`

当前规则：

- `layered_city`
- `layered_node`
- `payload_node`
- 或 composite 带 `payload_slots`

都会走 payload slot 消费。

manifest 当前事实：

- `pass/fort/dock` footprint 都是 `1x1`。
- `pass/fort/dock` composite 都是 `payload_node`。
- `pass/fort/dock` composite 都有一个 `payload_slots[0].cell_offset=[0,0]`。
- `pass/fort/dock` frame 均有 `fit_footprint=[320,160]`、`visual_fit_scale=1`、`anchor_rule=bottom_center`。

结论：

- pass/fort/dock 已经不是 single composite 直摆模型。
- 当前模型是 1x1 payload-node 特例，后续可以扩到多格 payload-node。

## 5. builder 缓存与 metadata 语义

### 5.1 关键缓存

当前关键缓存：

- `_world_cell_node_base_by_tmx_key`
- `_world_cell_node_anchor_by_tmx_key`
- `_world_cell_reserved_footprint_tmx_keys`
- `_world_cell_reserved_anchor_by_tmx_key`
- `_world_cell_reserved_center_by_tmx_key`
- `_world_cell_runtime_builder_stats`

用途：

- base cache：绘制底盘和 cell state。
- anchor cache：绘制建筑、hit 代理、live capture 采样。
- reserved footprint cache：阻挡 resource fill/free base/resource overlay，支持 reserved-hit proxy。
- builder stats：审计 raw / registered / duplicate / conflict / invalid。

### 5.2 live_pass 当前统计

当前 live JSON：

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

reserved footprint audit 中的 active unique anchor：

```json
{
  "activeAnchorCountsByType": {
    "city": 90,
    "pass": 368,
    "total": 458
  }
}
```

重要解释：

- `registeredAnchorCount=373` 不是唯一 active anchor 数。
- 它表示 conflict/invalid 之后被接受注册的次数，其中包含 duplicate anchor 覆盖。
- 当前唯一 active pass anchor 是 `368`。
- 关系是：`raw 378 - skippedConflict 5 = accepted registration attempts 373`。
- 再扣掉 duplicate overwrite 5，得到 active unique pass anchors 368。

风险：

- `registeredAnchorCount` 字段名容易被误读成“唯一注册 anchor 数”。

建议：

- 后续 metadata 增加 `activeUniqueAnchorCount` 或把当前字段说明写进 JSON。
- 保留旧字段兼容自动化。

### 5.3 builderAuditSummary 采样语义

当前 conflict：

```json
{
  "skippedConflictCounts": {
    "city": 77,
    "pass": 5,
    "total": 82
  },
  "conflictSampleCoverageByType": {
    "city": {
      "complete": false,
      "count": 77,
      "sampleCount": 12,
      "sampleLimit": 12,
      "truncated": true
    },
    "pass": {
      "complete": true,
      "count": 5,
      "sampleCount": 5,
      "sampleLimit": 12,
      "truncated": false
    }
  }
}
```

当前 reason counts：

```json
{
  "conflictReasonCountsByType": {
    "city": {
      "reserved_footprint": 12,
      "total": 12
    },
    "pass": {
      "city_pass_overlap": 5,
      "total": 5
    }
  }
}
```

重要解释：

- pass conflict sample coverage 是 complete，所以 pass reason count 等于真实 pass conflict count。
- city conflict sample coverage 是 truncated，所以 city reason count 只是样本 reason count，不是全量 77 的分类统计。

风险：

- `conflictReasonCountsByType.city.total=12` 容易被误读成 city 只有 12 个 conflict。

建议：

- 后续把字段改成 `sampledConflictReasonCountsByType`，或新增全量 reason counter。
- 不要改旧字段含义时破坏自动化；可以新增字段并保留旧字段。

## 6. placement_policy 分发表结构

### 6.1 action map

当前 action map：

- `reserve_cells`
- `block_resource_fill`
- `block_free_cell_base`
- `block_resource_overlay`
- `block_movement`

`block_resource_overlay` 支持 fallback：

```gdscript
"fallback_fields": ["block_resource_generation"]
```

用途：

- 兼容早期 placement policy 里可能只有 `block_resource_generation` 的字段。

风险：

- 对未来 footprint 来说，如果缺少 `block_resource_overlay` 和 fallback 字段，会回到 action default。
- 当前 default 对 `block_resource_overlay` 是 true，所以新 footprint 如果没有显式 policy，可能默认阻挡 resource overlay。

建议：

- 对所有 world-cell footprint 保持显式 placement_policy，不依赖默认值。
- 新增 footprint 时必须跑 placementPolicyAudit。

### 6.2 context rule map

当前 context map：

- `empty_resource_fill -> block_resource_fill`
- `free_cell_base -> block_free_cell_base`
- `resource_overlay -> block_resource_overlay`
- `movement -> block_movement`
- `preview_node_placement -> block_rules`

当前 `preview_node_placement` 的 block rules：

- reserved footprint
- preview tile
- resource overlay
- backend type resource
- backend terrain mountain / riverland
- nested policy context empty_resource_fill

结论：

- placement_policy 已经不是 manifest 文本，已经进入统一 runtime 消费。
- 绘制链不再散落大量独立 if/else；核心阻挡通过 context resolver 收口。

### 6.3 当前消费点

当前 runtime 消费点：

- `_draw_tmx_cell()`
  - `_should_world_cell_block_free_cell_base()`
  - `_should_fill_empty_cell_with_resource()`
- `_should_fill_empty_cell_with_resource()`
  - `_should_world_cell_block_empty_resource_fill()`
- `_draw_resource_level_overlays()`
  - `_should_world_cell_block_resource_overlay()`
- `_build_world_cell_placement_context_matches_at_tmx_key()`
  - live/debug/metadata 审计
- `_resolve_world_cell_preview_placement_match()`
  - preview eligibility

当前 live_pass JSON 已验证：

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

- reserved footprint 已阻止 empty resource fill。
- reserved footprint 已阻止 free cell base。
- reserved footprint 已阻止 resource overlay。
- movement 当前保持 deferred/unblocked，等待真实 movement/collision 链。

### 6.4 placement source order

当前 source order：

```gdscript
reserved_footprint -> backend_tile
```

含义：

- reserved footprint 优先级高于 backend raw tile。
- 对 city 多格 footprint 来说，非 anchor cell 通过 reserved footprint 获得 policy。
- 对 conflict/duplicate 后的 anchor，当前以最终 reserved cache 为准。

风险：

- backend tile source 对 resource tile 不等价于 resource authority。
- resource tile 仍主要由 `_resource_overlay_by_tmx_key` 和 resource overlay 链处理。
- 这符合“不动资源 authority”的边界，但不能说 resource placement policy 已全链闭环。

## 7. hit / hover / selection 覆盖关系

当前绘制顺序：

```text
_draw_resource_level_overlays()
_draw_world_cell_nodes()
_draw_resource_cell_debug_overlay()
_draw_home_city_overlays()
_draw_world_cell_interaction_grids()
_draw_selected_tile_overlay()
_draw_hover_tile_overlay()
```

结论：

- hover / selection 仍在最上层。
- `world_cell_interaction_grid_debug_enabled=false` 时，内部 footprint grid 默认不显示。
- selection frame 可通过 reserved footprint 判断是否应该画 node frame。

reserved-hit proxy：

- `_screen_to_backend_tile_data()` 会先查 preview tile。
- 再算 direct backend tile。
- 再调用 `_build_reserved_world_cell_hit_tile()`。
- 如果命中 reserved footprint，会返回 anchor entity 信息。
- `resource_1x1` 被 `_should_world_cell_reserved_hit_proxy_apply()` 排除。

结论：

- reserved-hit proxy 已覆盖 world-cell node。
- resource_1x1 没有被代理成 world-cell hit，资源链边界保留。

当前限制：

- live backend pass 是 1x1，只验证了 anchor cell。
- 非 anchor reserved-hit 需要多格真实 node 或多格 strategic node 样本。

## 8. 已通过结构

以下结构可以继续沿用：

- city 和 pass/fort/dock 共用 runtime builder。
- city 历史特判已进入 `WORLD_CELL_CITY_STRATEGY_RULES`。
- pass/fort/dock 已进入 `WORLD_CELL_NODE_DISPATCH_RULES`。
- pass/fort/dock 是 1x1 payload-node 特例，不再是单独一张 PNG 直摆。
- placement_policy 已经通过 action map + context map 被 runtime 消费。
- hover/selection 覆盖顺序正确。
- resource authority 没有被本链改造。
- live_pass metadata 能审计 raw/backend/registered/conflict/duplicate/hit/placement context。

## 9. 审查发现

### P1：metadata 的 registeredAnchorCount 命名容易误导

现状：

- `registeredAnchorCount=373`
- `duplicateAnchorCount=5`
- active unique pass anchor 是 `368`

原因：

- 当前 registeredAnchorCount 表示 accepted registration attempts，不是唯一 active anchors。

风险：

- 后续自动化或人工可能把 373 当成地图上实际存在的 pass anchor 数。

建议：

- 新增 `activeUniqueAnchorCount`。
- 或在 `nodeTypeStats` 下新增 `registeredAttemptCount`，旧字段保留兼容。

### P1：builderAuditSummary 的 reason count 对 city 是样本统计

现状：

- city skipped conflict count 是 77。
- city conflict sample count 只有 12。
- `conflictReasonCountsByType.city.total=12`。

风险：

- 容易误读成 city 只有 12 个 conflict。

建议：

- 新增 `sampledConflictReasonCountsByType` 或 `fullConflictReasonCountsByType`。
- 对 sample-limited 字段加 `isSampled=true`。

### P2：builder stats 生命周期依赖 `_rebuild_backend_tile_index()`

现状：

- `_reset_world_cell_runtime_builder_stats()` 在 `_rebuild_backend_tile_index()` 里调用。
- `_rebuild_world_cell_runtime_entries()` 自身只 `_ensure_world_cell_runtime_builder_stats()`，不会重置。
- rawBackendNodeCounts 也是在 `_rebuild_backend_tile_index()` 收集 supported node 时写入。

风险：

- 如果未来从别的入口直接调用 `_rebuild_world_cell_runtime_entries()`，builder stats 可能残留或缺 raw count。

建议：

- 后续抽一个显式 build session API，例如 `_begin_world_cell_runtime_build()`。
- 不建议简单把 reset 移进 `_rebuild_world_cell_runtime_entries()`，否则会丢掉入口前累计的 rawBackendNodeCounts。

### P2：node dispatch 表混合 runtime 规则和 preview 样例

现状：

- `WORLD_CELL_NODE_DISPATCH_RULES` 同时包含：
  - backend/runtime footprint/composite 配置
  - preview_spec_samples
  - preview_formal_samples

风险：

- preview contract 和 runtime contract 容易再次混淆，尤其是 `nodes_formal` 曾被误认为 live backend 图。

建议：

- 后续拆成：
  - `WORLD_CELL_NODE_RUNTIME_DISPATCH_RULES`
  - `WORLD_CELL_NODE_PREVIEW_SAMPLE_RULES`
- 或至少在 JSON/capture metadata 中继续明确 `captureMode`。

### P2：preview_node_placement 的 terrain block 不是 node-type aware

现状：

`preview_node_placement` 当前全局阻挡：

```text
backend terrain mountain / riverland
```

风险：

- 后续如果 dock 应该靠 riverland，pass 应该靠山脉/关口地形，全局 terrain block 会阻止合法 placement preview。
- 当前这不影响 live_pass builder，因为 live builder 不靠 preview eligibility 放置真实 pass。

建议：

- 后续把 preview eligibility 扩展成 node-type aware context。
- 例如 `preview_node_placement` 接受 node_type 参数，再由 pass/fort/dock 各自规则判断 terrain。

### P2：动态 handler 名称缺少启动期校验

现状：

strategy handler 通过字符串名 `callv()` 调用，例如：

- `_resolve_world_cell_city_strategy_footprint_id`
- `_resolve_world_cell_city_strategy_composite_id`
- `_resolve_world_cell_city_strategy_payload_stage`

风险：

- handler 名拼错时会返回 null/空，可能变成 fallback，而不是立刻失败。

建议：

- 增加 runtime strategy audit：启动时检查 handler 是否存在。
- 不建议现在马上改，先作为审查项记录。

### P3：live_pass hardcoded 命名仍存在，但当前可以接受

现状：

- `live_pass` capture mode 仍有专用函数和 `livePassAuditStatus`。
- 同时已有 `captureNodeBuilderAuditStatus` / `captureNodeReasonAuditStatus` 作为 generic 审计字段。
- 2026-04-25 后端开始真实输出 pass / fort / dock 后，已新增 `live_nodes` capture mode；`live_pass` 仅保留为旧自动化兼容入口。

判断：

- `live_nodes` 才能作为 pass / fort / dock 的 live backend 回归证据。
- `nodes_formal` 仍只能作为 preview/formal 截图，不可冒充 live backend。

建议：

- 后续 live backend 截图优先使用 `SLG_WORLD_CELL_CAPTURE_MODE=live_nodes`。
- 保留 `livePassAuditStatus` 兼容旧自动化。

## 10. 不建议现在做的事

- 不要为了审查文档去重写 `map_grid.gd`。
- 不要把 placement_policy 接到 movement/collision，除非真实移动链入口明确。
- 不要改 resource authority 或 resource generation。
- 不要把 `nodes_formal` 当 live 回归继续修。
- 不要为 fort/dock 伪造 live backend 数据。
- 不要在当前大 diff 上继续追加大块视觉微调。

## 11. 下一步拆分建议

建议按这个顺序处理：

1. metadata 语义修正
   - 增加 `activeUniqueAnchorCount`
   - 标注 reason count 是否 sampled
2. builder stats 生命周期收口
   - 抽 build session lifecycle
   - 明确 raw count、registered attempt、active unique 的关系
3. dispatch 表拆分
   - runtime dispatch 和 preview samples 分离
4. preview eligibility node-type aware
   - pass/fort/dock 分别处理地形合法性
5. 等 live backend fort/dock 出现
   - 补非 preview runtime 截图
   - 补 hover/selection/hit 回归
6. movement/collision 接入后
   - 再关闭 movement context 的 deferred 状态

## 12. 2026-04-25 风险项收口结果

本轮已把前述 P1/P2 风险项先收掉一层，改动范围只在 `godot-client/scripts/map/map_grid.gd` 和本文档。

已完成：

- metadata 语义修正：`liveBackend.nodeTypeStats` 新增 `registeredAttemptCount`、`registeredAnchorCountSemantics`、`activeUniqueAnchorCount`。
- active unique anchor 审计：`liveBackend` 新增 `activeUniqueAnchorCountsByType`、`activeUniqueAnchorCountsByFootprint`。
- builder reason count 语义：`builderAuditSummary` 新增 `conflictReasonCountMode`、`duplicateReasonCountMode`、`conflictReasonCountSemanticsByType`、`duplicateReasonCountSemanticsByType`。
- dispatch 表拆分：`WORLD_CELL_NODE_DISPATCH_RULES` 只保留 runtime dispatch；新增 `WORLD_CELL_NODE_PREVIEW_SAMPLE_RULES` 存放 preview/formal samples 和 placeholder sample。
- preview eligibility node-type aware：`preview_node_placement` 的 backend terrain block 增加 `allow_by_node_type`，并把 `nodeType` 从 preview sample 传入 placement context。
- live audit 对齐：`livePassAuditStatus.checks` 新增 `registeredAttemptPlusSkippedMatchesRaw` 与 `activeUniquePlusDuplicatePlusSkippedMatchesRaw`。
- builder lifecycle 收束：新增 `registeredAttemptCounts`，并把 raw、registered attempt、skipped invalid、skipped conflict、duplicate last-write 的写入收进独立 helper。
- lifecycle metadata：`liveBackend.builderLifecycleSummary` 显式写出各计数字段语义、按类型计数和 total 计数。
- strategy handler 校验：新增 `runtimeStrategyHandlerAudit`，启动期检查 strategy 表里已配置的 handler 是否真实存在，并接入 `livePassAuditStatus.checks.runtimeStrategyHandlersOk`。

当前 live_pass 关键结果：

```text
rawBackendNodeCount=378
registeredAttemptCount=373
registeredAnchorCount=373
registeredAnchorCountSemantics=registered_attempts_before_duplicate_last_write
activeUniqueAnchorCount=368
duplicateAnchorCount=5
skippedConflictCount=5
skippedInvalidCount=0
activeUniquePlusDuplicatePlusSkippedMatchesRaw=true
registeredAttemptPlusSkippedMatchesRaw=true
runtimeStrategyHandlersOk=true
metadataBuilder=capture_node_backend_v1
```

builder reason count 当前语义：

```text
conflictReasonCountMode=mixed
conflictReasonCountSemanticsByType.city.mode=sampled
conflictReasonCountSemanticsByType.pass.mode=full
duplicateReasonCountMode=full
duplicateReasonCountSemanticsByType.pass.mode=full
```

builder lifecycle 当前语义：

```text
rawBackendNodeCounts=原始 supported backend strategic node 记录
registeredAttemptCounts=通过 conflict/invalid 检查、准备注册 anchor 的次数
registeredAnchorCounts=registeredAttemptCounts 的兼容别名
activeUniqueAnchorCountsByType=duplicate last-write 后实际存活的唯一 anchor 数
duplicateAnchorCounts=同 anchorKey 下被 last_write_wins 覆盖的次数
skippedConflictCounts=注册前因 reserved footprint 冲突跳过的次数
skippedInvalidCounts=注册前因 anchor/footprint/visual 数据无效跳过的次数
```

runtime strategy handler 当前校验：

```text
runtimeStrategyHandlerAudit.ok=true
city.footprint_resolver.exists=true
city.composite_resolver.exists=true
city.payload_stage_resolver.exists=true
node_dispatch 当前没有配置 handler，走默认 dispatch resolver，不视为缺失
```

capture-node metadata builder 当前结构：

```text
_build_world_cell_capture_node_backend_metadata(capture_node_type)
  -> 组装 raw / registered attempt / active unique / duplicate / skipped / placement_policy / strategy handler audit
_build_world_cell_live_pass_backend_metadata()
  -> pass-only wrapper，保留 totalPassAnchors 和 live_pass 兼容语义
_finalize_world_cell_capture_node_backend_metadata(live_backend, samples)
  -> 补 sampleHitStats / reservedHitCoverageAudit / placementContextAudit / runtimeStrategyAudit / reservedFootprintAudit
livePassAuditStatus
  -> 仍作为当前 pass-only live 回归状态保留
```

preview contract 当前结果：

```text
nodes_formal samples=3
preview_pass_formal ok=true nodeType=pass
preview_fort_formal ok=true nodeType=fort
preview_dock_formal ok=true nodeType=dock
```

## 13. 当前验收状态

本轮已重新跑正式入口：

```text
npm run godot:headless:smoke -- --scene res://scenes/app/main.tscn
SLG_EXPORT_WORLD_CELL_PREVIEW_CAPTURE=1 SLG_WORLD_CELL_PREVIEW_MODE=nodes SLG_WORLD_CELL_PREVIEW_VARIANT=formal npm run godot:mainline:runtime -- --quit-after 2
SLG_EXPORT_WORLD_CELL_PREVIEW_CAPTURE=1 SLG_WORLD_CELL_CAPTURE_MODE=live_pass npm run godot:mainline:runtime -- --quit-after 2
npm run gate:godot:week1
npm run gate:godot:week1:compat:debug-only
```

结果：

- smoke：通过。
- nodes_formal：已刷新。
- live_pass：`metadataBuilder=capture_node_backend_v1`，`livePassAuditStatus.ok=true`，`failedChecks=[]`，`runtimeStrategyHandlersOk=true`。
- week1：第一次因后端未启动出现 `/api status=-1`；临时启动 `npm run start` 后重跑通过，`ok=true`。
- 本轮 lifecycle/handler audit 改动后，week1 再次串行重跑通过，`ok=true`。
- 本轮 capture-node metadata builder 拆分后，week1 再次串行重跑通过，`ok=true`。
- compat：在 week1 之后串行通过，`ok=true`。
- 后端验证后已停止，`/api/health` 回到不可达。

当前关键产物：

```text
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_nodes_formal.json
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_nodes_formal_crop.png
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_pass.json
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_pass_crop.png
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes.json
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes.png
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_crop.png
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_bootstrap.json
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_bootstrap.png
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_bootstrap_crop.png
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_full.json
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_full.png
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_full_crop.png
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_province_yanzhou.json
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_province_yanzhou.png
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_province_yanzhou_crop.png
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_region_central_plains.json
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_region_central_plains.png
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_region_central_plains_crop.png
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_viewport_region_224_152.json
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_viewport_region_224_152.png
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_viewport_region_224_152_crop.png
C:\Users\26739\Desktop\8989\tmp\gates\godot_week1_gate_latest.json
```

## 14. 后端真实 fort/dock 输出判断

当前 Godot 侧已经能消费 live backend strategic node，但真实 world 数据来自 `/api/world/map-layout`。

2026-04-25 后端/world-layout 窗口补齐后，bootstrap 真实输出已验证为：

```text
pass=378
fort=6
dock=4
```

full scope 在受控 debug 开关下也已验证：

```text
ENABLE_FULL_MAP_LAYOUT=1
pass=708
fort=12
dock=10
```

更细 scope 已完成首轮 live backend 回归：

```text
province yanzhou: pass=9 / fort=2 / dock=1
region central_plains: pass=35 / fort=2 / dock=1
viewport layer=region center=(224,152): pass=35 / fort=2 / dock=1
```

因此：

- Godot 侧不再只能跑 `live_pass`，本轮已新增并验证 `live_nodes` live backend capture。
- `world_cell_runtime_preview_capture_live_nodes.json` 的 `observedRawBackendCounts` 为 `pass=378 / fort=6 / dock=4`。
- `world_cell_runtime_preview_capture_live_nodes_full.json` 的 `observedRawBackendCounts` 为 `pass=708 / fort=12 / dock=10`。
- `world_cell_runtime_preview_capture_live_nodes_province_yanzhou.json` 的 `observedRawBackendCounts` 为 `pass=9 / fort=2 / dock=1`。
- `world_cell_runtime_preview_capture_live_nodes_region_central_plains.json` 的 `observedRawBackendCounts` 为 `pass=35 / fort=2 / dock=1`。
- `world_cell_runtime_preview_capture_live_nodes_viewport_region_224_152.json` 的 `observedRawBackendCounts` 为 `pass=35 / fort=2 / dock=1`。
- `liveNodeCaptureStatus.ok=true`，`failedChecks=[]`，样本覆盖 pass / fort / dock，且 hit / hover / selection / reserved proxy metadata 均通过。
- `nodes_formal` 仍不能作为 live backend 回归证据。

本轮可复现 capture 命令要点：

```text
npm run start
npm run godot:world-cell:live-nodes-capture
npm run godot:world-cell:live-nodes-capture:province
npm run godot:world-cell:live-nodes-capture:region
npm run godot:world-cell:live-nodes-capture:viewport

npm run start:world-layout:full
npm run godot:world-cell:live-nodes-capture:full
npm run test:world:map-layout-strategic-nodes-contract
```

注意：

- 默认 `npm run start` 保持 full scope 保护；`scope=full` 需要 `ENABLE_FULL_MAP_LAYOUT=1`，本轮通过 `npm run start:world-layout:full` 提供受控入口。
- `npm run godot:world-cell:live-nodes-capture` 会显式设置 live capture 环境、等待 JSON、校验 `observedRawBackendCounts=pass=378 / fort=6 / dock=4`，并在 capture 后停止 Godot 进程。
- `npm run godot:world-cell:live-nodes-capture:full` 校验 full scope 的 `observedRawBackendCounts=pass=708 / fort=12 / dock=10`。
- `npm run godot:world-cell:live-nodes-capture:province|region|viewport` 校验更细 scope 的真实后端 strategic node 计数，查询参数来自 `SLG_MAP_PROVINCE_ID / SLG_MAP_REGION_ID / SLG_MAP_CENTER_X / SLG_MAP_CENTER_Y / SLG_MAP_LAYER`。
- `test:world:map-layout-strategic-nodes-contract` 已补 province / region / viewport 断言：期望值从 full layout 的对应 tile 集合计算，不硬编码当前世界数量。
- wrapper 会把 Godot 原始输出复制为 scope 后缀产物，避免 bootstrap 和 full 互相覆盖证据。
- `npm run godot:mainline:runtime -- --quit-after 2` 当前 wrapper 不适合自动 capture：`--quit-after` 不会作为 Godot runtime 参数生效，且过早退出会抢在 map refresh/capture 之前。

## 15. Scoped 边界合同回归补充

2026-04-25 自动化第 2 轮补了 `/api/world/map-layout` 的边界合同，不涉及 resource authority、resource generation、AI 玩家或其他 UI 页面。

正式验证：

```text
npm run test:world:map-layout-strategic-nodes-contract
```

验证结果：通过。

新增/确认的合同点：

- `scope=province` 缺少 `provinceId` 时回退 `bootstrap`，不能绕过 full-map guard。
- `scope=region` 缺少 `regionId` 时回退 `bootstrap`，不能绕过 full-map guard。
- 默认后端未设置 `ENABLE_FULL_MAP_LAYOUT=1` 时，`scope=full` 仍返回 `403`。
- `viewport layer=region` 以中心格所在 region 输出 chunk；`viewport layer=province` 以中心格所在 province 输出 chunk。
- 合同测试会动态寻找一个“有 pass 但没有 fort/dock”的 province，确认 scoped 输出允许局部缺失 fort/dock，同时仍与 full layout 中对应 tile 集合一致。

本轮修正点：

```text
server/src/application/world/WorldService.ts
server/tests/world_map_layout_strategic_nodes_contract.test.ts
```

本轮没有新增 Godot capture，因为改动只影响后端缺参 scoped guard；既有 live_nodes 证据仍为：

```text
bootstrap: pass=378 / fort=6 / dock=4
full: pass=708 / fort=12 / dock=10
province yanzhou: pass=9 / fort=2 / dock=1
region central_plains: pass=35 / fort=2 / dock=1
viewport layer=region center=(224,152): pass=35 / fort=2 / dock=1
```

2026-04-25 自动化第 3 轮继续补了 invalid scoped query 合同：

```text
npm run test:world:map-layout-strategic-nodes-contract
```

验证结果：通过。

新增确认：

- `scope=province&provinceId=__missing_province_for_map_layout_contract__` 返回空 province chunk，`pass=0 / fort=0 / dock=0`，不回退 full。
- `scope=region&regionId=__missing_region_for_map_layout_contract__` 返回 bootstrap chunk，计数等同 bootstrap，`pass=378 / fort=6 / dock=4`，不回退 full。
- 默认后端未设置 `ENABLE_FULL_MAP_LAYOUT=1` 时，invalid province/region scoped 请求也不会绕过 full-map guard。

## 16. 其他 UI 方向窗口建议

武将列表页、武将详情页、战法/技能页、部队页、背包/道具页、联盟页等属于另一条 Godot UI 产品线，不建议混在本窗口继续做。

建议开新窗口，单独限定为：

```text
Godot SLG 手游 UI 页面推进：只做 native Godot UI，不碰 world-cell/map_grid，不碰后端 authority，不碰 AI 玩家。优先围绕武将列表页 + 武将详情页，用用户提供截图/参考图做结构、布局、状态、数据占位和截图验收。
```

执行建议：

- 第一批只选一个 UI 垂直切片：武将列表页 + 武将详情页。
- 先收集参考截图，再做 Godot 场景/脚本/样式收束。
- 不要同时开“很多很多 UI 类别”，否则上下文会快速污染，且验收会变成主观堆图。
- 本 world-cell 窗口继续保留给地图 cell、node、placement、hit、hover/selection、runtime capture。

## 17. 给下一轮的直接任务

下一轮如果继续，建议直接做：

```text
live_nodes bootstrap/full/province/region/viewport capture wrapper 均已落地，缺参 scoped guard、invalid scoped query、viewport province/region 分层、以及局部缺 fort/dock 的 province 合同已补。下一轮如继续，应做收口验证：重新跑 bootstrap/full/province/region/viewport live_nodes capture 与 map-layout 合同测试，确认 artifact 列表、JSON counts、后端/Godot 停止状态完整；仍不要顺手改资源 authority、resource generation、AI 玩家或其他 UI 页面。
```

## 18. Live backend 收口验证

2026-04-25 自动化第 4 轮完成收口验证，仍限定在 `/api/world/map-layout`、strategic node 输出和 Godot `live_nodes` capture。

本轮先发现 `npm run start:world-layout:full` 使用了未安装的 `cross-env`，导致 full 后端无法用正式入口启动。已将该 world-layout 专用入口改为 Windows 可复现写法：

```text
set ENABLE_FULL_MAP_LAYOUT=1&& tsx server/src/app.ts
```

本轮验证命令：

```text
npm run start
npm run godot:world-cell:live-nodes-capture
npm run godot:world-cell:live-nodes-capture:province
npm run godot:world-cell:live-nodes-capture:region
npm run godot:world-cell:live-nodes-capture:viewport

npm run start:world-layout:full
npm run godot:world-cell:live-nodes-capture:full

npm run test:world:map-layout-strategic-nodes-contract
npm run godot:headless:smoke
```

验证结果：全部通过；每次 Godot capture wrapper 均停止 Godot 进程，full capture 后已停止后端。`godot:headless:smoke` 通过，输出仍有既有 Godot `ObjectDB instances leaked at exit` warning，本轮未展开到无关 UI 清理。

本轮 live JSON 统计：

```text
bootstrap: pass=378 / fort=6 / dock=4 / samples=pass2+fort2+dock2 / hit-hover-selection-reserved-screen=ok
full: pass=708 / fort=12 / dock=10 / samples=pass2+fort2+dock2 / hit-hover-selection-reserved-screen=ok
province yanzhou: pass=9 / fort=2 / dock=1 / samples=pass2+fort2+dock1 / hit-hover-selection-reserved-screen=ok
region central_plains: pass=35 / fort=2 / dock=1 / samples=pass2+fort2+dock1 / hit-hover-selection-reserved-screen=ok
viewport layer=region center=(224,152): pass=35 / fort=2 / dock=1 / samples=pass2+fort2+dock1 / hit-hover-selection-reserved-screen=ok
```

本轮更新产物：

```text
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_bootstrap.json
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_bootstrap.png
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_bootstrap_crop.png
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_full.json
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_full.png
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_full_crop.png
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_province_yanzhou.json
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_province_yanzhou.png
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_province_yanzhou_crop.png
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_region_central_plains.json
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_region_central_plains.png
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_region_central_plains_crop.png
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_viewport_region_224_152.json
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_viewport_region_224_152.png
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_viewport_region_224_152_crop.png
```

下一轮若继续，应优先做最终整理：输出给 Godot world-cell 窗口的接续提示，要求只补 live runtime 截图/hit 回归复核，不要把 `nodes_formal` preview 当 live backend 证据。

## 19. Godot world-cell 接续提示

以下提示只用于 Godot world-cell 窗口接续 live runtime 截图和 hit 回归复核，不要转给武将页、native_slg_shell、AI 玩家或资源 authority 窗口。

```text
你现在接手 Godot world-cell live backend 截图/hit 复核。后端 backend/world-layout 窗口已经完成真实 `/api/world/map-layout` strategic node 输出和 Godot `live_nodes` capture 收口。

禁止范围：
- 不要做武将列表页/详情页。
- 不要大改 native_slg_shell。
- 不要碰资源 authority/resource generation。
- 不要碰 AI 玩家系统。
- 不要把 nodes_formal preview 当 live backend 回归证据。

必须使用 live backend 证据：
- bootstrap: pass=378 / fort=6 / dock=4
- full: pass=708 / fort=12 / dock=10
- province yanzhou: pass=9 / fort=2 / dock=1
- region central_plains: pass=35 / fort=2 / dock=1
- viewport layer=region center=(224,152): pass=35 / fort=2 / dock=1

已更新的截图/JSON 证据路径：
- C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_bootstrap.json
- C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_bootstrap.png
- C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_bootstrap_crop.png
- C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_full.json
- C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_full.png
- C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_full_crop.png
- C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_province_yanzhou.json
- C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_province_yanzhou.png
- C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_province_yanzhou_crop.png
- C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_region_central_plains.json
- C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_region_central_plains.png
- C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_region_central_plains_crop.png
- C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_viewport_region_224_152.json
- C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_viewport_region_224_152.png
- C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_viewport_region_224_152_crop.png

后端窗口已验证命令：
- npm run godot:world-cell:live-nodes-capture
- npm run godot:world-cell:live-nodes-capture:province
- npm run godot:world-cell:live-nodes-capture:region
- npm run godot:world-cell:live-nodes-capture:viewport
- npm run start:world-layout:full
- npm run godot:world-cell:live-nodes-capture:full
- npm run test:world:map-layout-strategic-nodes-contract
- npm run godot:headless:smoke

你的任务：
1. 只复核这些 live_nodes JSON 和截图是否足以作为 Godot live runtime 证据。
2. 必要时补一轮 live runtime 截图或 hit 回归，但必须继续使用 live backend。
3. metadata 必须检查 observedRawBackendCounts、sampleCountsByType、sampleHitStats、reservedHitCoverage、hit/hover/selection/reserved proxy/screen roundtrip。
4. 输出结论时明确截图路径、JSON 统计、验证命令和是否还需要 backend/world-layout 窗口介入。
```

## 20. Live runtime 截图/hit 复核

2026-04-25 用户回来后，本窗口直接完成 Godot world-cell live runtime 截图/hit 复核。复核仍只使用 live backend，不使用 `nodes_formal` preview。

复核命令：

```text
npm run start
npm run godot:world-cell:live-nodes-capture
npm run godot:world-cell:live-nodes-capture:province
npm run godot:world-cell:live-nodes-capture:region
npm run godot:world-cell:live-nodes-capture:viewport

npm run start:world-layout:full
npm run godot:world-cell:live-nodes-capture:full
```

复核结论：通过。

JSON metadata 复核：

```text
bootstrap: captureMode=live_nodes / mode=live_backend_nodes / observedRawBackendCounts=pass=378,fort=6,dock=4 / samples=pass2,fort2,dock2 / hit-hover-selection-reserved-screen=ok
full: captureMode=live_nodes / mode=live_backend_nodes / observedRawBackendCounts=pass=708,fort=12,dock=10 / samples=pass2,fort2,dock2 / hit-hover-selection-reserved-screen=ok
province yanzhou: captureMode=live_nodes / mode=live_backend_nodes / observedRawBackendCounts=pass=9,fort=2,dock=1 / samples=pass2,fort2,dock1 / hit-hover-selection-reserved-screen=ok
region central_plains: captureMode=live_nodes / mode=live_backend_nodes / observedRawBackendCounts=pass=35,fort=2,dock=1 / samples=pass2,fort2,dock1 / hit-hover-selection-reserved-screen=ok
viewport layer=region center=(224,152): captureMode=live_nodes / mode=live_backend_nodes / observedRawBackendCounts=pass=35,fort=2,dock=1 / samples=pass2,fort2,dock1 / hit-hover-selection-reserved-screen=ok
```

PNG 复核：

```text
全部 full/crop PNG 均为 1600x900，文件大小约 0.99MB-1.96MB，byte diversity=256，非空、非纯色。
```

人工视觉复核：

```text
bootstrap：可见完整等距地图、资源地、城池/战略节点建筑，非空帧。
full：可见完整等距地图、资源地、城池/战略节点建筑，非空帧。
province yanzhou：可见 scoped province 视野与战略节点建筑，非空帧。
region central_plains：可见 scoped region 视野、城池与 dock/战略节点占位，非空帧。
viewport layer=region center=(224,152)：画面与 central_plains region 样本一致，符合同一 region viewport 选择，非空帧。
```

人工视觉复核只作为截图可视性确认；hit/hover/selection/reserved proxy/screen roundtrip 仍以 `liveBackend.liveNodeCaptureStatus.sampleHitStats` 和 `reservedHitCoverageAuditSummary` 为准。

最新截图/JSON：

```text
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_bootstrap.json
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_bootstrap.png
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_bootstrap_crop.png
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_full.json
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_full.png
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_full_crop.png
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_province_yanzhou.json
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_province_yanzhou.png
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_province_yanzhou_crop.png
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_region_central_plains.json
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_region_central_plains.png
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_region_central_plains_crop.png
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_viewport_region_224_152.json
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_viewport_region_224_152.png
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\world_cell_runtime_preview_capture_live_nodes_viewport_region_224_152_crop.png
```

进程收尾：default backend 与 full backend 均已停止；Godot capture wrapper 每轮均停止 Godot 进程。

## 21. Live backend 证据归档

2026-04-25 已将 live runtime 截图/hit 复核证据归档为独立目录，避免依赖滚动覆盖的 capture 文件名。

归档目录：

```text
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\archive\live_backend_world_layout_2026_04_25
```

归档压缩包：

```text
C:\Users\26739\Desktop\8989\tmp\screenshots\world_resource_alignment\archive\live_backend_world_layout_2026_04_25.zip
```

归档文件：

```text
README.md
manifest.json
world_cell_runtime_preview_capture_live_nodes_bootstrap.json/png/_crop.png
world_cell_runtime_preview_capture_live_nodes_full.json/png/_crop.png
world_cell_runtime_preview_capture_live_nodes_province_yanzhou.json/png/_crop.png
world_cell_runtime_preview_capture_live_nodes_region_central_plains.json/png/_crop.png
world_cell_runtime_preview_capture_live_nodes_viewport_region_224_152.json/png/_crop.png
```

风险处理结论：

- `region_central_plains` 与 `viewport_region_224_152` 截图 SHA256 相同是预期行为：`viewport layer=region center=(224,152)` 解析到 `central_plains`，所以渲染画面与 region scope 一致；两者 metadata 均为 `live_nodes/live_backend_nodes`，且 observed counts 均为 `pass=35 / fort=2 / dock=1`。
- dirty worktree 不通过回退解决；本轮通过独立归档目录、manifest hash、README 说明来固定证据，避免后续 capture 覆盖或其他窗口改动影响证据可追溯性。

归档 manifest 校验：通过，`ok=true`，`errors=[]`。
