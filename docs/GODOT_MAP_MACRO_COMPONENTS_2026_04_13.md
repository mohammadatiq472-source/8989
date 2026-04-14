# Godot 地图宏组件映射（2026-04-13）

这是一页对照表，用来把 `tmp/third_party/slgclient` 的 prefab / 逻辑脚本语义，映射到 Godot 版新的 macro story 组件。

## 1. 统一导航约定

- 通用故事请求信号：`story_navigation_requested(target_story_id, source_story_id, reason, request_payload)`
- sandbox 负责接收并切换 story
- story 侧只负责发起请求，不直接操作 sandbox 内部实现

## 2. prefab / 脚本 -> macro 组件映射

| slgclient 资产 | 关键语义 | Godot macro 组件 | 对应 story |
|---|---|---|---|
| `MapClickUI.prefab` | 地图主界面壳、进入按钮、信息面板、行动按钮 | `MacroMapSurfaceShell`、`MacroProvinceEntryPanel`、`MacroActionRail` | `map_surface` |
| `MapUILogic.ts` | 地图 UI 编排、中枢弹层、城池/关口/战报入口、滚动到地图 | `MacroUICommandHub`、`MacroCityContextPanel`、`MacroFortressContextPanel`、`MacroScrollBridge` | `province_layer` / `warzone_layer` / `nation_layer` |
| `SmallMapLogic.ts` | 小地图坐标跳转、中心点更新 | `MacroLocatorBar`、`MacroJumpChip`、`MacroCenterReadout` | `province_layer` |
| `WarButtonLogic.ts` | 战报红点、战争通知入口 | `MacroWarAlertBadge`、`MacroWarReportTrigger` | `warzone_layer` |

## 3. generalpic 思路 -> 视觉组件

| generalpic / 视觉思路 | 组件化落点 |
|---|---|
| 顶部资源条、状态胶囊、国号条 | `MacroTopStatusStrip`、`MacroNationCodeChip` |
| 州界 / 战区 / 关口的层级视觉 | `MacroProvinceCard`、`MacroWarzoneCard`、`MacroGateChip` |
| 热点压强、补给压力、路线可达性 | `MacroPressureBar`、`MacroRouteRail`、`MacroSupplyBadge` |
| 立国颜色块、首都、势力值 | `MacroNationBanner`、`MacroNationSwatchGrid`、`MacroCapitalChip` |
| 地图主界面底栏操作 | `MacroBottomActionDock`、`MacroStoryEntryButton` |

## 4. 新 macro story 的拆分口径

- `map_surface`：壳层 + 顶条 + 左 rail + 右信息 + 底 action + 州层入口
- `province_layer`：十三州总览、州府、关口、州层焦点
- `warzone_layer`：州内多战区、热点压强、路线 / 关口、战区摘要
- `nation_layer`：国家颜色块、国号、国力、首都、立国入口

## 5. 这次已落地的连接

- `map_surface` 已挂出 `province_layer` 的导航入口
- sandbox 已具备通用故事请求处理
- `province_layer` 已挂出 `warzone_layer` 的导航入口
- `warzone_layer` 已挂出 `nation_layer` 的导航入口
- 正式验证链已覆盖整条路径：`map_surface -> province_layer -> warzone_layer -> nation_layer`
