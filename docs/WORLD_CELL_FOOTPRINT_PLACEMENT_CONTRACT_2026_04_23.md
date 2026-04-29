# World Cell Footprint / Placement Contract（2026-04-23）

## 0. 权威说明

- 本文档负责 world cell 的 footprint / placement contract。
- 自 2026-04-23 起，世界地图对象的正式执行路线以 `docs/WORLD_CELL_LAYERED_BASE_BINDING_EXECUTION_PLAN_2026_04_23.md` 为准。
- `方案 A = 直接往格子上叠建筑 PNG / 沿用 resource overlay 链做非资源节点显示` 现在只保留为历史验证路线，不再是正式实现口径。

## 1. 目的

世界地图的 tile/cell 是 SLG 操作单位、移动单位、占领单位、交互选择单位。资源地、城池、关口、要塞、码头、山脉、河流都必须先声明自己的 cell 占地，再进入生成和显示链路。

这份 contract 解决三个问题：

1. 资源 PNG、城池 PNG、未来地形/战略节点不能互相叠在同一个资源格上。
2. Godot 运行态和后端/共享 domain 对“占几个格、以哪个格为锚点、是否阻挡资源生成”使用同一套语义。
3. hover / selection 永远在地图对象上层，不能被资源地或城池底盘压住。

## 2. 正式文件

- 共享 TypeScript contract：`shared/contracts/game/worldCellFootprint.ts`
- Godot runtime manifest：`godot-client/assets/themes/slgclient/current/world/world_cell_footprint_manifest_v1.json`
- Godot 读取入口：`godot-client/scripts/map/map_grid.gd`

## 3. 投影口径

- 世界地图投影：`isometric_2_to_1`
- 运行态 TMX tile：`200x100`
- 资产源画布：`384x384`
- 资产源 footprint：`320x160`
- 锚点语义：`bottom_center`
- cell offset 公式：
  - `screen_x = (cell_x - cell_y) * 100`
  - `screen_y = (cell_x + cell_y) * 50`

## 4. 首批 footprint

| id | 类型 | 占地 | 锚点 | 生成/填充关系 |
| --- | --- | --- | --- | --- |
| `resource_1x1` | 粮/木/石/铁资源地 | `1x1` | 中心 cell | 只允许资源自身占用；阻止 free filler 再盖一层 |
| `player_city_3x3_initial` | 真人玩家主城 | `3x3` | 中心 cell | 固定 3x3，不跟随等级扩 footprint；阻止资源生成、资源补空、free base |
| `ai_city_3x3_initial` | AI 玩家主城 | `3x3` | 中心 cell | 固定 3x3，不跟随等级扩 footprint；阻止资源生成、资源补空、free base |
| `system_city_l03_l04_3x3` | 系统普通城池 L03-L04 | `3x3` | 中心 cell | 系统城池最低等级规格，中心 cell 放城主府 |
| `system_city_l05_l06_5x5` | 系统普通城池 L05-L06 | `5x5` | 中心 cell | 奇数 footprint，保证单一中心 cell |
| `system_city_l07_l08_7x7` | 系统普通城池 L07-L08 | `7x7` | 中心 cell | 奇数 footprint，保证单一中心 cell |
| `system_city_l09_9x9` | 系统普通城池 L09 | `9x9` | 中心 cell | 系统普通城池最高等级规格 |
| `pass_1x1` | 关口 | `1x1` | 中心 cell | 预留战略节点格，不允许资源叠底 |
| `fort_1x1` | 要塞/营寨 | `1x1` | 中心 cell | 预留战略节点格，不允许资源叠底 |
| `dock_1x1` | 码头/渡口 | `1x1` | 中心 cell | 预留战略节点格，不允许资源叠底 |
| `mountain_barrier_1x1` | 山脉阻隔 cell | `1x1` 连续路径 | path cells | 阻止资源生成、阻止移动 |
| `river_corridor_1x1` | 河流/水道 cell | `1x1` 连续路径 | path cells | 阻止资源生成，后续由渡口/码头定义通行点 |

## 5. 城池初始态规则

城池不是把建筑叠在资源地上。城池落点先预留 footprint，再由底盘与建筑绑定进入统一 world cell contract：

1. 真人玩家和 AI 玩家主城固定 `3x3`。
2. 系统普通城池按等级只使用奇数 footprint：L03-L04=`3x3`，L05-L06=`5x5`，L07-L08=`7x7`，L09=`9x9`。
3. footprint 内所有 cell 使用同色城池底盘。
4. 默认只画外围城墙线，内部格线不常显；内部格线只在点击、hover、selection、debug 或编辑态出现。
5. 初始只在中心 cell 放城主府。
6. 任何资源 PNG、随机填空资源、free base 都不能画到城池 footprint 下方。

## 6. 绘制顺序

Godot 当前绘制顺序固定为：

1. `cell_base`
2. `resource_cell`
3. `world_node`
4. `debug_overlay`
5. `selection_overlay`
6. `hover_overlay`

selection / hover 必须保持在最上层，用于保证点选、选中框、调试 overlay 的阅读性。

## 7. 后续生成侧约束

后续接入后端生成算法时，生成器应先构建 footprint reservation map，再按优先级放置对象：

1. 山脉/河流等地形阻隔或水道。
2. 真人玩家主城、AI 玩家主城、系统普通城池、关口、要塞、码头等战略节点。
3. 粮/木/石/铁资源地。
4. 普通空地或未来可开发空地。

资源生成仍以 `WORLD_RESOURCE_GENERATION_AUTHORITY_HANDOFF_2026_04_22.md` 为准：客户端不生成资源分布，Godot 只读取 `/api/world/map-layout` 或 `/api/world` 的 `resourceKind/resourceLevel`。

## 8. 当前落地范围

本轮只落地 contract / manifest 与 Godot 读取准备：

1. 资源 `1x1` 语义进入统一 footprint manifest。
2. 城池 `3x3` 语义进入统一 footprint manifest。
3. `map_grid.gd` 使用 manifest 规则预留城池 cell。
4. 后端初始世界生成先构建 resource-blocked footprint set，再生成资源地。
