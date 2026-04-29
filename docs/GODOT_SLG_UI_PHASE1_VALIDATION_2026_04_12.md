# SLG UI 成品化第一期验证说明

## 目标

这份验证链只负责客户端 UI 的可复现验收，不改 `server/**` 业务逻辑，也不改 Godot 场景/脚本的 UI 逻辑文件。

覆盖范围：

1. 启动后端并确认健康状态。
2. 运行 Godot headless smoke。
3. 启动可视化 Godot 窗口，完成一次二级面板检查、一次返回/回到主视图检查、一次缩放后悬停检查。
4. 将截图和机器可读报告落到 `tmp/screenshots/SLG-UI-P1-D/`。

## 已读文档路径

1. `C:/Users/Buffoon Queer/Desktop/8989/AGENTS.md`
2. `C:/Users/Buffoon Queer/Desktop/8989/docs/AGENTS_EXECUTION_CURRENT_2026_04.md`
3. `C:/Users/Buffoon Queer/Desktop/8989/godot-client/README.md`
4. `C:/Users/Buffoon Queer/Desktop/8989/godot-client/scenes/app/main.tscn`
5. `C:/Users/Buffoon Queer/Desktop/8989/godot-client/scenes/ui/observability_panel.tscn`

## 可复现入口

优先复用这些正式入口：

1. `npm run start`
2. `D:\Apps\Godot\Godot_v4.6.2-stable_win64_console.exe --headless --path godot-client --quit-after 1`
3. `npm run godot:ops:visual-validate`

新增的 D 组验证入口：

```bash
py -3.11 godot-client/tools/run_slg_ui_phase1_validation.py
```

## 脚本职责

`godot-client/tools/run_slg_ui_phase1_validation.py` 会自动：

1. 检查后端健康状态。
2. 必要时启动 `npm run start`。
3. 运行 `npm run godot:ops:visual-validate -- --output <report>`。
4. 运行 Godot headless smoke。
5. 启动 Godot 可视化窗口并抓取三张证据图。
6. 退出时清理它启动的进程。

## 截图路径

默认输出目录：

`C:/Users/Buffoon Queer/Desktop/8989/tmp/screenshots/SLG-UI-P1-D/`

固定文件：

1. `01_baseline.png`
2. `02_secondary_panel_checkpoint.png`
3. `03_zoom_hover.png`
4. `phase1_validation_report.json`
5. `visual_mapping_report.json`

## 验证步骤

1. 运行 `npm run start`，或直接运行脚本让它在后端未健康时自动拉起。
2. 运行 `D:\Apps\Godot\Godot_v4.6.2-stable_win64_console.exe --headless --path godot-client --quit-after 1`。
3. 启动验证脚本。
4. 脚本会在窗口内执行以下动作：
   1. baseline 聚焦并截图。
   2. 进行一次二级面板检查并截图。
   3. 进行一次缩放后悬停并截图。

当前截图里已经能看到 `MainHUD -> L2 -> L3 -> L4 Popup` 的叠层，以及右侧 `Observability` 面板。

## 失败重试策略

1. 如果后端未健康，先确认 `npm run start` 是否被别的进程占用。
2. 如果 Godot 窗口找不到，确认 `D:\Apps\Godot\Godot_v4.6.2-stable_win64_console.exe` 和 `godot-client/project.godot` 是否存在。
3. 如果截图是空白或窗口错位，重新运行脚本并保持桌面解锁，避免系统切换焦点。
4. 如果截图与日志不一致，先判断是窗口抓图链问题还是 UI 本身变化，再决定是否重跑。
5. 这次 headless 日志仍会报 `res://scripts/ui/slg_panel_stack.gd` 的 parse error；它目前是独立 hygiene 风险，不等同于截图失败。

## UTF-8 回读校验

本文件已按 UTF-8 写入；修改后应使用 `py -3.11` 再读回确认无乱码。

## 结论口径

当前 D 组交付以“可复现验证链 + 截图证据 + 失败重试说明”为准。
