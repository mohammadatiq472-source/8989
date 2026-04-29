# USB 迁移执行说明（E 盘 / 4060 机器）

> 当前工作目录：`C:\Users\26739\Desktop\8989`  
> 对应审计文档：[USB_MIGRATION_AUDIT_2026_04_17.md](USB_MIGRATION_AUDIT_2026_04_17.md)

关联入口：

1. [原生 SLG 正式主线文档](NATIVE_SLG_MAINLINE_INDEX.md)
2. [原生 SLG 正式组件文档](NATIVE_SLG_COMPONENT_ARCHITECTURE.md)
3. [AI 快速导航索引](AI_QUICK_NAV_INDEX_2026_04_10.md)
4. [仓库主入口 README](../README.md)
5. [Codex 主线记忆锚点](../CODEX.md)

## 1. 这次执行的目标

不是把整个 `8989` 原样塞进 `E:`。  
而是按已经审计过的 `5GB U 盘` 约束，生成一个可继续联调的迁移包。

当前默认使用：

1. `E:` 作为 U 盘盘符
2. `recommended` 作为迁移 profile
3. 新机器继续使用文件夹名 `8989`

## 2. 新机器路径怎么理解

你问“到时候是否可以直接复制粘贴到新机器桌面上，还是 `8989` 文件夹”。

答案是：

1. **可以直接复制到新机器桌面，并保持文件夹名仍然叫 `8989`。**
2. 这对代码和 Godot 工程本身没有问题。
3. 但主线文档里有不少**绝对路径证据链接**，例如：
   - `C:\Users\26739\Desktop\8989\tmp\...`
4. 如果新机器的 Windows 用户名不同，那么即使桌面上也叫 `8989`，绝对路径仍然会变化。
5. 这时：
   - 代码能继续跑
   - Godot 工程能继续开
   - 但文档里的绝对证据链接会失效
6. 所以最稳的做法有两种：
   - 方案 A：新机器也尽量落到同样路径
   - 方案 B：先正常迁移，后续我再统一帮你重写绝对证据链接

## 3. 正式执行脚本

正式脚本：

- [prepare_usb_migration_package.ps1](../scripts/prepare_usb_migration_package.ps1)

参数说明：

1. `-UsbDrive E:`：U 盘盘符
2. `-Profile recommended`：默认推荐开发迁移包
3. `-Profile minimal`：只做最小可运行迁移包
4. `-IncludeSlgclientSource`：额外带 `tmp/third_party/slgclient`
5. `-IncludeSourceAssets`：额外带素材源目录
6. `-DryRun`：只打印和估算，不真正复制

## 4. 推荐执行顺序

### 4.1 先看 DryRun

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\prepare_usb_migration_package.ps1 -UsbDrive E: -Profile recommended -DryRun
```

### 4.2 真正复制

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\prepare_usb_migration_package.ps1 -UsbDrive E: -Profile recommended
```

### 4.3 如果你还要保留 slgclient 素材源

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\prepare_usb_migration_package.ps1 -UsbDrive E: -Profile recommended -IncludeSlgclientSource
```

### 4.4 如果你还要顺便把素材源目录也带走

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\prepare_usb_migration_package.ps1 -UsbDrive E: -Profile recommended -IncludeSlgclientSource -IncludeSourceAssets
```

## 5. 脚本实际会带什么

默认 `recommended` 会带：

1. `.git`
2. `.github`
3. `.vscode`
4. `docs`
5. `scripts`
6. `server`
7. `shared`
8. `godot-client`
9. 根目录关键配置、说明和基线启动文件（含 `.gitignore`、`Start-Codex-Harness-Isolated.cmd`）
10. 顶层 4 个 mp4 证据视频
11. `.obsidian` 的工作流配置子集
12. 当前运行态连续性文件：
   - `tmp/world_snapshot.json`
   - `tmp/world_save_slots.json`
   - `tmp/narrative_events.json`
   - `tmp/civil_memory_ledger.json`
   - `tmp/court_sessions.json`
   - `tmp/session_state.json`
   - `tmp/v2_game_state.json`
   - `tmp/general_negotiation_inbox.json`
   - `tmp/general_profiles/`
13. 关键帧证据目录：
   - `tmp/video_frames_ltzb_focus_20260416`
   - `tmp/video_frames_more_targets_20260416`
   - `tmp/video_frames_alliance_20260416`
   - `tmp/video_frames_field_buildings_20260416`
14. 正式截图证据：
   - `tmp/screenshots/generalpic_contact_01.png`
   - `tmp/screenshots/hud_stage1_after_restart.png`
   - `tmp/screenshots/hud_stage2_flags_mapping.png`
   - `tmp/screenshots/ui_asset_contact_01.png`
   - `tmp/screenshots/SLG-UI-P1-D/`

## 6. 默认不会带什么

1. `tmp/gates`
2. `tmp/world_save_slots_archive`
3. `tmp/b3c08_*`
4. `node_modules`
5. `dist`
6. `.vs`
7. `godot-client/.godot`
8. `godot-client/Godot/app_userdata`
9. `tmp/docs_index_for_timeline_*`
10. `tmp/timeline_*`
11. `.obsidian/plugins/obsidian-local-rest-api/data.json`

## 7. 迁到 4060 机器后的第一轮验证

先进入新机器上的 `8989` 根目录，再跑：

```powershell
npm install
npm run build
npm run test:world:mutation-lock
D:\Apps\Godot\Godot_v4.6.2-stable_win64_console.exe --headless --quit --path godot-client
D:\Apps\Godot\Godot_v4.6.2-stable_win64_console.exe --headless --quit --path godot-client --scene res://scenes/ui/interior_panel.tscn
D:\Apps\Godot\Godot_v4.6.2-stable_win64_console.exe --headless --quit --path godot-client --scene res://scenes/ui/troop_panel.tscn
D:\Apps\Godot\Godot_v4.6.2-stable_win64_console.exe --headless --quit --path godot-client --scene res://scenes/ui/general_panel.tscn
D:\Apps\Godot\Godot_v4.6.2-stable_win64_console.exe --headless --quit --path godot-client --scene res://scenes/ui/ai_panel.tscn
```

## 8. 当前建议

当前建议你下一步直接做：

1. 先跑一次 `DryRun`
2. 确认体积和带走范围没问题
3. 再正式复制到 `E:\8989`
4. 然后把 `E:\8989` 整体复制到 4060 机器桌面
