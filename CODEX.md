# Codex 主线记忆锚点

> 用途：给后续 Codex / AI 窗口一个最小、稳定、不会被 preview 旧链带偏的主线记忆入口。
> 当前默认工作目录：`C:\Users\26739\Desktop\8989`

## 1. 先读这两份

1. [正式主线文档](docs/NATIVE_SLG_MAINLINE_INDEX.md)
2. [正式组件文档](docs/NATIVE_SLG_COMPONENT_ARCHITECTURE.md)
3. [现行执行口径](docs/AGENTS_EXECUTION_CURRENT_2026_04.md)
4. [快速导航](docs/AI_QUICK_NAV_INDEX_2026_04_10.md)
5. [仓库入口](README.md)
6. [Godot 入口](godot-client/README.md)
7. [Godot 打开链路](docs/GODOT_EDITOR_OPEN_FLOW_2026_04_17.md)
8. [世界地图 world cell 正式执行计划](docs/WORLD_CELL_LAYERED_BASE_BINDING_EXECUTION_PLAN_2026_04_23.md)

## 1.2 世界地图 cell 当前正式路线

世界地图对象当前正式路线固定为：

- `方案 B = 底盘固定 + 建筑绑定 + 扩建后资源格转建筑格`

以下路线不再作为正式实现口径：

- `方案 A = 直接往格子上叠建筑 PNG / 沿用 resource overlay 链做非资源节点显示`

## 1.1 Godot 固定打开链路

1. Godot 项目根目录不是仓库根，而是 `C:\Users\26739\Desktop\8989\godot-client`
2. `Godot Engine` 是编辑器窗口
3. `SLG Commander Godot Client (DEBUG)` 是运行时窗口
4. 编辑器固定入口：`Start-Godot-Editor.cmd`
5. 主线运行固定入口：`Start-Godot-Mainline-Debug.cmd`

## 2. 当前主线一句话

当前目标不是做 preview sandbox，而是做一款**强参照国内原生 SLG 的手游客户端**，并把 `AI` 作为原生 SLG 里的玩家/托管/组织变量自然嵌入。

## 3. 当前已经确认的结构

1. 顶层叫：`世界主壳`
2. 第二层叫：`二级功能面板`
3. 第三层叫：`三级功能面板`

固定主入口二级功能面板：

1. `内政`
2. `招募`
3. `武将`
4. `同盟`
5. `AI`

对象直达型二级功能面板：

1. `部队面板`

## 4. 当前最重要的实现口径

1. 用 `共享组件底座 + 分域配置 + 分域 Presenter / Adapter`
2. 不做一个万能组件糊所有域
3. 不把 `主城建筑` 和 `地块/军备用建筑` 混成一棵树
4. `设施` 保留在 `部队面板` 里作为一条真实路径
5. 前端 `壳 + 子页 + 共享状态` 只是一层客户端组织口径，不能被误判成后端容量/高并发已解决
6. Godot UI 路由当前开始统一到 `page_id` 语义；`tab_id` 仍保留兼容，但新实现优先按 `壳 -> 子页` 理解
7. 新壳层当前优先发 `page_changed / page_action_requested`；旧 `top_tab_changed / action_requested` 只保兼容，后续不要再新增对旧命名的依赖
8. `招募 / 武将 / AI` snapshot 当前已显式带 `shared_state`；后续三级页和跨页共享先读这层，不要重新在 presenter 局部变量里拼第二套状态
9. 通用 child page 当前已经开始消费 `shared_state` 并渲染共享状态区；新页面优先扩这一层，不要再各自造本地共享条

## 5. 证据视频

当前结构判断直接参考以下视频：

1. `C:\Users\26739\Desktop\8989\5248c1d9640247e739d2d7f2addee905_raw.mp4`
2. `D:\wx\xwechat_files\wxid_qb4mrsthej6629_032e\msg\video\2026-04\a60de4784fcc191f7ea8a92e711e0f66.mp4`
3. `D:\wx\xwechat_files\wxid_qb4mrsthej6629_032e\msg\video\2026-04\fd6f2df7950e1578d286ca4d2ca50b71.mp4`
4. `D:\wx\xwechat_files\wxid_qb4mrsthej6629_032e\msg\video\2026-04\78c0e5feed94a5ff00525e8daa53e8ce.mp4`

## 6. 当前实现顺序

1. `FullScreenPanelHost`
2. `PanelTabStrip`
3. `AlliancePanel`
4. `TroopPanel`
5. `BuildingTreeView`
6. `BuildUpgradeSheet`
7. 把它们接入 `main.tscn / native_slg_shell / main.gd`

## 7. 当前已落地的组件

1. `FullScreenPanelHost`
2. `PanelTabStrip`
3. `AlliancePanel`
4. `TroopPanel`
5. `BuildingTreeView`
6. `BuildUpgradeSheet`

## 8. 当前实现状态

1. `main.tscn` 已正式挂入 `FullScreenPanelHost`
2. `main.gd` 已把 `同盟` 接成真实全屏面板，而不是继续内联文本占位
3. `TroopPanel / BuildingTreeView / BuildUpgradeSheet` 已完成正式组件底座，并且 `世界主壳 -> 5 个部队位 -> 部队面板 -> 设施 -> 建筑树 -> 升级单` 已接通
4. `内政 / 招募 / 武将 / 同盟 / AI` 都已经有正式二级功能面板入口，不再停留在 inline text placeholder
5. `招募` 已有最小真实动作链，`武将战法` 已接到 `previewGeneralDirectives / queueTacticalOverride`，`AI` 已接到 `session/autonomy / previewDomainAgenda / queryCivilMemory`
6. 后续优先级参见 [正式主线文档 14.7](docs/NATIVE_SLG_MAINLINE_INDEX.md#147-当前下一步)
