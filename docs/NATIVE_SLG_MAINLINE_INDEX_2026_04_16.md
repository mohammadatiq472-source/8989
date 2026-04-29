# 原生 SLG 主线导航入口（2026-04-16）

> 状态：历史快照 / 导航草案。  
> 现行口径请改读：[NATIVE_SLG_MAINLINE_INDEX.md](NATIVE_SLG_MAINLINE_INDEX.md) 和 [NATIVE_SLG_COMPONENT_ARCHITECTURE.md](NATIVE_SLG_COMPONENT_ARCHITECTURE.md)

> 用途：从这一份文档开始，把当前主线固定为“原生 SLG 主壳 + AI 变量”，不再默认沿 `UI Preview Sandbox / map_surface / Card D` 方向展开。

## 1. 首读顺序

1. [原生 SLG 主线重置计划](NATIVE_SLG_RESET_PLAN_2026_04_16.md)
2. [原生 SLG 页面结构](NATIVE_SLG_PAGE_STRUCTURE_2026_04_16.md)
3. [AI 第一阶段插入点](AI_PHASE1_INSERTION_POINTS_2026_04_16.md)
4. [代码主线保留 / 冻结 / 桥接矩阵](CODE_MAINLINE_KEEP_FREEZE_BRIDGE_2026_04_16.md)

## 2. 代码切入顺序

1. `godot-client/scenes/app/main.tscn`
2. `godot-client/scripts/app/main.gd`
3. `godot-client/scenes/ui/native_slg_shell.tscn`
4. `godot-client/scripts/ui/native_slg_shell.gd`
5. `godot-client/scripts/map/**`

## 3. 当前正式入口判断

Godot 正式运行入口仍然是：

- `godot-client/project.godot`
- `run/main_scene="res://scenes/app/main.tscn"`

因此当前代码主线应围绕 `main.tscn / main.gd` 重建，不应继续把 `scenes/dev/ui_preview_sandbox.tscn` 当默认起点。

## 4. 侧线降级

以下文档和代码短期内降级为侧线参考：

- `GODOT_UI_PREVIEW_THREE_LINE_INDEX_2026_04_14.md`
- `GODOT_UI_PREVIEW_DOC_GOVERNANCE_2026_04_14.md`
- `TASK_2026_04_14_PRODUCT_FRONTEND_EXEC_CARDS.md`
- `godot-client/data/ui_preview/stories/**`
- `godot-client/scripts/dev/**`
- `godot-client/scenes/dev/**`

## 5. 当前一刀的目标

当前不是重做整套客户端，而是先完成：

1. 原生 SLG 主壳
2. 主城页默认驻留
3. `大地图` 作为唯一世界入口
4. `AI中枢` 固定在底栏中部

## 6. 形式化验证入口

- Godot 主入口烟测：
  - `D:\Apps\Godot\Godot_v4.6.2-stable_win64_console.exe --headless --path godot-client`

## 7. 一句话检查

如果某个改动不能直接增强 `main.tscn / main.gd` 这条生产入口，而只是继续让 preview story 更完整，那它就不该排在当前主线上。
