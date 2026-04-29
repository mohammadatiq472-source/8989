# World Strategic Node Asset Finalization（2026-04-28）

## 0. 文档状态

- 本文只收口世界战略节点成品包。
- 不扩大到 world-cell runtime 大重构、AI 玩家、后端玩法、UI 主壳、宏观地图、事件页。
- 当前执行依据仍以 `docs/WORLD_CELL_LAYERED_BASE_BINDING_EXECUTION_PLAN_2026_04_23.md`、`docs/WORLD_CELL_FOOTPRINT_PLACEMENT_CONTRACT_2026_04_23.md`、`docs/WORLD_CELL_PHASE2_RUNTIME_BUILDER_CONSOLIDATION_2026_04_25.md` 为准。

## 1. 成品包范围

正式战略节点包 id：

```text
world_strategic_node_asset_pack_v1
```

纳入本包的节点类目：

| 类目 | 正式 id / contract | 说明 |
| --- | --- | --- |
| 玩家主城 | `world_node_city_v1` + `player_city_3x3_initial` | 玩家大地图主城落点，固定 3x3。 |
| AI 主城 | `world_node_capital_v1` + `ai_city_3x3_initial` | AI / 敌方主城落点，固定 3x3。 |
| 系统城 | `world_node_system_city_{3x3,5x5,7x7,9x9}_v1` | 系统普通城池按等级使用奇数 footprint。 |
| 关口 | `world_node_pass_sw_v1` / `world_node_pass_se_v1` + `pass_1x1` | 正式命名用 `pass`。 |
| 要塞 | `world_node_fort_v1` + `fort_1x1` | 单格战略节点。 |
| 码头 | `world_node_dock_v1` + `dock_1x1` | 单格水域交通战略节点。 |
| 资源地 | `resource_1x1` + `resources/world_resource_assets_manifest_v1.json` | 资源图形独立 manifest，不复制到 `world_node_resource_*` composite。 |

## 2. 状态语义

状态分两层，不改变 anchor、footprint、fit_footprint 或 source_anchor：

| 状态 | 类型 | 语义 | 绘制口径 |
| --- | --- | --- | --- |
| `neutral` | ownership | 没有玩家或敌对归属断言。 | 使用基础 composite / resource 图。 |
| `own` | ownership | 本方或友方归属。 | runtime 在同一资产上方叠加友方标记或 tint。 |
| `enemy` | ownership | 敌方归属。 | runtime 在同一资产上方叠加敌方标记或 tint。 |
| `selectable` | interaction | 当前可选中、可查看或可作为目标。 | selection / hover overlay 在节点上方绘制，不替换主体资产。 |
| `disabled` | interaction | 节点存在但当前不可执行动作。 | runtime alpha / overlay 处理，不另开 footprint。 |

各类目默认状态：

| 类目 | 默认 ownership | 支持 ownership | 支持 interaction |
| --- | --- | --- | --- |
| `player_city` | `own` | `own` | `selectable`, `disabled` |
| `ai_city` | `enemy` | `enemy`, `neutral` | `selectable`, `disabled` |
| `system_city` | `neutral` | `neutral`, `own`, `enemy` | `selectable`, `disabled` |
| `pass` | `neutral` | `neutral`, `own`, `enemy` | `selectable`, `disabled` |
| `fort` | `neutral` | `neutral`, `own`, `enemy` | `selectable`, `disabled` |
| `dock` | `neutral` | `neutral`, `own`, `enemy` | `selectable`, `disabled` |
| `resource` | `neutral` | `neutral`, `own`, `enemy` | `selectable`, `disabled` |

## 3. pass / gate 命名口径

- manifest、runtime type、footprint、测试命令里一律使用 `pass`。
- `gate` 只允许作为“关口”的策划/显示别名，不新增 `world_node_gate_v1` 或 `gate_1x1`。
- `package.json` 里的 `gate:*` 是验证入口命名，和世界节点 `pass` 无关。
- 现有正式 id：
  - `pass_1x1`
  - `world_node_pass_sw_v1`
  - `world_node_pass_se_v1`
  - `pass_sw_base_v1.png`
  - `pass_se_base_v1.png`

## 4. 资源地归属

资源地继续独立走：

```text
godot-client/assets/themes/slgclient/current/world/resources/world_resource_assets_manifest_v1.json
```

理由：

1. 资源图形是 `grain / wood / stone / iron` 4 类，每类 `base + l01..l09`，共 40 张图。
2. 资源 manifest 的 anchor 是 `anchor_pixel=[192,310]`，不同于战略节点结构 anchor `[192,288]`。
3. 资源地仍通过 `resource_1x1` 进入统一 footprint contract，但图形本体不并入 `world_cell_assets_manifest_v1.json` 的 composite。

结论：

```text
资源地是战略节点成品包的一部分，但资产来源是独立 resource manifest，总包只引用。
```

## 5. 几何不变量

不得在状态变体里改变以下字段：

| 对象 | source canvas | fit / effective footprint | anchor |
| --- | --- | --- | --- |
| 战略节点 pass / fort / dock | `[384,384]` | `[320,160]` | `source_anchor=[192,288]` |
| 城池底盘与城墙 cell | `[384,384]` | `[320,160]` | `source_anchor=[192,288]` |
| 城池 payload 建筑 | `[384,384]` | 默认 `[240,120]` | 按 frame `source_anchor` |
| 资源地 | `[384,384]` | `[320,160]` | `anchor_pixel=[192,310]` |
| runtime tile | - | `[200,100]` | `bottom_center` 投影 |

## 6. 本轮落地文件

- `godot-client/assets/themes/slgclient/current/world/world_cell_assets_manifest_v1.json`
  - 增加 `strategic_node_package`。
  - 给 10 个 composite 增加 `package_id / strategic_category / state_semantics_ref / supported_*_states`。
- `godot-client/assets/themes/slgclient/current/world/world_cell_footprint_manifest_v1.json`
  - 增加 `strategic_node_footprint_contract`。
  - 给 `resource/city/pass/fort/dock` footprint 增加同包状态引用。
- `godot-client/tools/export_world_cell_assets.mjs`
  - 让导出器后续重跑时继续生成同一套战略节点包元数据。
- `godot-client/scripts/map/map_grid.gd`
  - 新增 `world_cell_state_overlay_enabled=true`。
  - 在现有 hover / selection overlay 上最小消费 `supported_ownership_states` 与 `supported_interaction_states`。
  - 不新增点击链，不新增 UI 主壳逻辑，不改变 anchor / footprint / fit_footprint。

## 7. 尚未收口的状态

本轮只做状态语义 contract 与最小 runtime overlay 消费，不做 runtime 大改：

1. `own/enemy` 已可在选中 / 悬停 overlay 上显示低透明状态色；最终旗标或更重的 faction marker 仍由 runtime / faction marker 层决定。
2. `selectable/disabled` 已作为 overlay 状态被消费，但不是独立 PNG 变体。
3. 后端真实 live 节点覆盖以正式 capture 命令为准；preview composite 不能冒充 live backend 玩法闭环。

## 8. 当前点击与 overlay 开关事实

- 左键点击现有入口：`_unhandled_input()` -> `_select_tile_at()` -> `_draw_selected_tile_overlay()`。
- 鼠标悬停现有入口：`_update_hover()` -> `_draw_hover_tile_overlay()`。
- hover / selection overlay 默认随选中或悬停绘制，没有额外总开关。
- `world_cell_interaction_grid_debug_enabled=false`：多格 footprint 调试网格默认关闭。
- `world_cell_state_overlay_enabled=true`：状态 overlay 默认开启，只叠加在现有 hover / selection overlay 上。

## 9. 正式验证入口

优先复用：

```powershell
npm run test:world:map-layout-strategic-nodes-contract
npm run godot:world-cell:live-nodes-capture:province
npm run godot:world-cell:live-nodes-capture:region
```

必要时再跑：

```powershell
npm run godot:world-cell:live-nodes-capture:viewport
npm run godot:world-cell:live-nodes-capture:full
```
