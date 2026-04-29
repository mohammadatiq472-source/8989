# 8989 仓库迁移审计（U 盘 5GB 约束）

> 审计日期：2026-04-17  
> 当前工作目录：`C:\Users\26739\Desktop\8989`  
> 用途：在迁移到另一台 `RTX 4060 / 已装 Godot` 的机器前，明确哪些内容必须带走，哪些可选带走，哪些不要带走。

关联入口：

1. [原生 SLG 正式主线文档](NATIVE_SLG_MAINLINE_INDEX.md)
2. [原生 SLG 正式组件文档](NATIVE_SLG_COMPONENT_ARCHITECTURE.md)
3. [AI 快速导航索引](AI_QUICK_NAV_INDEX_2026_04_10.md)
4. [仓库主入口 README](../README.md)
5. [Codex 主线记忆锚点](../CODEX.md)

## 1. 结论先行

当前不建议把整个 `8989` 目录原样搬到 U 盘。  
主要原因不是代码，而是 `tmp/` 体积过大。

本轮审计结果：

1. `tmp/` 约 `15.28 GB`，单它就超过 `5 GB` U 盘容量。
2. 当前适合迁移的“核心开发集”约 `1.10 GB`，可以装进 `5 GB` U 盘。
3. 如果额外带上“运行态连续性 + 证据 + 素材源”，推荐迁移集约 `1.6 ~ 2.1 GB`，仍然装得下。
4. 不建议把 `tmp/gates`、`tmp/world_save_slots_archive`、`tmp/b3c08_*` 这类历史验证产物整包带走。

## 2. 目录体积快照

### 2.1 顶层大项

1. `tmp`：`15,282,349,261`
2. `.git`：`478,562,026`
3. `godot-client`：`359,816,870`
4. `node_modules`：`286,628,960`
5. `dist`：`48,020,790`
6. `Isometric Nature Pack 2.0`：`43,378,928`
7. `234`：`30,464,477`
8. `Isometric Medieval Pack (1)`：`17,235,241`
9. `.obsidian`：`6,066,360`
10. `.vs`：`4,300,238`

### 2.2 `tmp/` 主要体积来源

1. `tmp/gates`：`6,681,038,749`
2. `tmp/world_save_slots_archive`：`1,577,672,874`
3. `tmp/b3c08_direct_verify`：`1,037,046,398`
4. `tmp/b3c08_ps_smoke`：`623,480,793`
5. `tmp/b3c08_ps_smoke2`：`623,479,154`
6. `tmp/b3c08_http_smoke`：`623,479,098`
7. `tmp/b3c08_ps_dbg3`：`623,479,098`
8. `tmp/b3c08_smoke_28024`：`623,478,351`
9. `tmp/b3c08_smoke`：`623,478,350`
10. `tmp/b3c08_dbg_29718`：`623,478,295`

### 2.3 当前运行态连续性相关文件

这些不是“最大”，但如果你想在新机器继续当前世界态，它们有价值：

1. `tmp/world_snapshot.json`：`44,581,555`
2. `tmp/world_save_slots.json`：`165,407,927`
3. `tmp/narrative_events.json`：`84,826`
4. `tmp/civil_memory_ledger.json`：`323,836`
5. `tmp/court_sessions.json`：`299,787`
6. `tmp/session_state.json`：`77`
7. `tmp/v2_game_state.json`：`1,555,370`
8. `tmp/general_profiles/`：`84,036`
9. `tmp/general_negotiation_inbox.json`：`2`

## 3. 迁移分层建议

### 3.1 必须迁移

这些内容属于“新机器继续当前主线开发”的最低要求：

1. `.git`
原因：保留当前未提交工作区状态、索引、历史、分支与删除记录。

2. `godot-client`
原因：Godot 正式入口、场景、脚本、导入后的运行资产都在这里。

3. `server`
原因：正式后端与 world action、保存恢复、AI / agenda / general authority 主链都在这里。

4. `shared`
原因：权威契约与规则引擎都在这里。

5. `docs`
原因：主计划、组件文档、迁移文档、协作记录都在这里。

6. `scripts`
原因：部分正式验证与辅助入口在这里。

7. 根目录关键文件：
   - `AGENTS.md`
   - `.gitignore`
   - `README.md`
   - `CODEX.md`
   - `package.json`
   - `package-lock.json`
   - `tsconfig.json`
   - `tsconfig.server.json`
   - `CLAUDE.md`
   - `Start-Codex-Harness-Isolated.cmd`
   - `WORKTREE_PARALLEL_QUICKSTART_2026_04_11.md`

8. 环境文件：
   - `.env`
   - `.env.local`
   - `.env.example`
原因：不带的话，新机器需要重新补运行环境。
注意：这类文件含本地配置，迁移时要确保 U 盘只在你自己的机器之间流转。

### 3.2 推荐一起迁移

这些不是“绝对最小集”，但对继续最后联调很有帮助，而且仍在 `5 GB` 容量内。

1. 顶层 4 个视频证据：
   - `5248c1d9640247e739d2d7f2addee905_raw.mp4`
   - `78c0e5feed94a5ff00525e8daa53e8ce.mp4`
   - `a60de4784fcc191f7ea8a92e711e0f66.mp4`
   - `fd6f2df7950e1578d286ca4d2ca50b71.mp4`
原因：`CODEX.md` 与主线文档都引用了这些视频。

2. `.obsidian`
原因：你已经在用 Obsidian 图谱继续承接主线，迁过去后关系图谱能直接续上。
注意：`.obsidian/plugins/obsidian-local-rest-api/data.json` 含本机 REST API 密钥和证书材料，不建议原样迁移；更适合迁移的是 `workspace.json / graph.json / core-plugins.json / community-plugins.json / plugins/claudian/data.json` 这类工作流配置。

3. `tmp/world_snapshot.json`
4. `tmp/world_save_slots.json`
5. `tmp/narrative_events.json`
6. `tmp/civil_memory_ledger.json`
7. `tmp/court_sessions.json`
8. `tmp/session_state.json`
9. `tmp/v2_game_state.json`
10. `tmp/general_profiles/`
11. `tmp/general_chats/`（如果目录存在）
12. `tmp/general_negotiation_inbox.json`

原因：这些文件决定你是否能在新机器“延续当前运行态”，而不是只迁代码骨架。

13. 关键帧证据目录：
    - `tmp/video_frames_ltzb_focus_20260416`
    - `tmp/video_frames_more_targets_20260416`
    - `tmp/video_frames_alliance_20260416`
    - `tmp/video_frames_field_buildings_20260416`
原因：这些目录直接支撑主线文档对 `部队 / 同盟 / 地块军备用建筑` 的结构判断；如果不迁，后续只能重新抽帧取证。

14. 正式截图证据：
    - `tmp/screenshots/generalpic_contact_01.png`
    - `tmp/screenshots/hud_stage1_after_restart.png`
    - `tmp/screenshots/hud_stage2_flags_mapping.png`
    - `tmp/screenshots/ui_asset_contact_01.png`
    - `tmp/screenshots/SLG-UI-P1-D/`
原因：这些图是正式 UI 证据，不是一次性缓存。

### 3.3 条件迁移

这些取决于你是否还要继续做资产再导入、证据回看或素材回溯。

1. `tmp/third_party/slgclient`
大小：约 `366,854,087`
原因：`godot-client/assets/themes/slgclient/manifests/*.json` 中仍记录了大量 `tmp/third_party/slgclient/...` 的 `sourcePath`。
建议：
   - 如果后续只做代码联调和已有导入资产的 Godot 预览：可以不带。
   - 如果后续还想重新导入、重建、替换 slgclient 素材源：建议一起带。

2. `tmp/video_frames_alliance_20260416`
3. `tmp/video_frames_field_buildings_20260416`
4. `tmp/video_frames_more_targets_20260416`
原因：这些是视频抽帧证据，文档会引用。
建议：
   - 如果只是继续改代码：可不带。
   - 如果还要继续基于证据校对结构和命名：建议带。

5. 顶层素材包目录：
   - `Isometric Nature Pack 2.0`
   - `Isometric Medieval Pack (1)`
   - `234`
   - `00-OpenClaw-Hub`
原因：它们更像原始素材源，不是当前主线运行必需。
建议：
   - 如果只是继续当前 Godot 主线：可后移。
   - 如果很快会进入美术替换和素材再选型：建议带。

### 3.4 默认不要迁移

这些内容会占大量空间，但对继续当前主线开发价值很低，或者可再生。

1. `tmp/gates`
原因：历史门禁产物，可重新跑。

2. `tmp/world_save_slots_archive`
原因：历史归档，不是当前继续开发的必要入口。

3. `tmp/b3c08_*`
原因：历史 smoke/debug/restore 验证工作区，不是正式主线资产。

4. `node_modules`
原因：可在新机器 `npm install` 重建。

5. `dist`
原因：可重新 `npm run build` 生成。

6. `.vs`
原因：Visual Studio 本地缓存。

7. `%SystemDrive%`
原因：显然不是项目主线资产。

8. `tmp/screenshots/ui_preview_sandbox`
原因：当前已明确不再走 preview 主线，历史截图无需默认迁移。

9. `tmp/docs_index_for_timeline_2026_04_09.json`
10. `tmp/timeline_keydocs_snapshot_2026_04_09.json`
11. `tmp/timeline_evidence_preview_2026_04_09.txt`
12. `tmp/timeline_evidence_lines_2026_04_09.json`
原因：这些属于派生索引/线表，可重建，不是继续最后联调的必须件。

13. `.obsidian/plugins/obsidian-local-rest-api/data.json`
原因：包含本机 REST API 密钥和证书材料，不应通过 U 盘原样迁走。

## 4. 5GB U 盘下的推荐方案

### 方案 A：最小可运行迁移包

适用：先把仓库搬过去继续代码、后端、Godot 正式主线联调。

包含：

1. `.git`
2. `godot-client`
3. `server`
4. `shared`
5. `docs`
6. `scripts`
7. 根目录关键配置与说明文件
8. `.env / .env.local / .env.example`
9. 4 个顶层视频证据
10. `.obsidian`

预计体积：约 `1.1 ~ 1.3 GB`

### 方案 B：推荐开发迁移包

适用：迁过去后不仅继续代码，还希望保留当前世界态和部分证据。

在方案 A 基础上再加：

1. `tmp/world_snapshot.json`
2. `tmp/world_save_slots.json`
3. `tmp/narrative_events.json`
4. `tmp/civil_memory_ledger.json`
5. `tmp/court_sessions.json`
6. `tmp/session_state.json`
7. `tmp/v2_game_state.json`
8. `tmp/general_profiles/`
9. 需要的话再加 3 组 `tmp/video_frames_*`
10. 如果要继续素材源回溯，再加 `tmp/third_party/slgclient`

预计体积：

1. 不带 `tmp/third_party/slgclient`：约 `1.4 ~ 1.7 GB`
2. 带 `tmp/third_party/slgclient`：约 `1.8 ~ 2.1 GB`

### 方案 C：全量仓库原样搬运

不推荐。

原因：

1. `tmp/` 就超 `15 GB`
2. U 盘只有 `5 GB`
3. 绝大多数 `tmp/gates / archive / smoke workspace` 都是可再生历史产物

## 5. 当前建议

当前最合理的是直接采用 **方案 B**。

原因：

1. 它能保住当前主线代码与文档。
2. 它能保住当前世界态连续性。
3. 它能保住你后续还要回看的视频证据。
4. 总体仍明显低于 `5 GB`。

## 6. 路径与证据风险

1. 当前主线文档里大量证据链接使用的是绝对路径，例如：
   - `C:\Users\26739\Desktop\8989\tmp\...`
2. 如果迁到另一台机器后不保留同一路径，Obsidian 和桌面端里的证据链接会失效。
3. 最稳的做法是新机器也继续使用：
   - `C:\Users\26739\Desktop\8989`
4. 如果新机器必须使用别的路径，那后续要补一轮“证据绝对路径重写”，不能假设这些链接仍有效。

## 7. 迁移前检查清单

在真正复制到 U 盘前，建议先确认这几件事：

1. U 盘可用剩余空间至少 `2.5 GB`
2. 新机器已有：
   - Godot
   - Node.js / npm
   - Python 3.11
3. 你是否要保留当前运行态：
   - 如果要，带上第 3.2 节里的 `tmp/*.json`
   - 如果不要，可以只搬代码主线
4. 你是否要继续素材源回溯：
   - 如果要，带上 `tmp/third_party/slgclient`
   - 如果不要，可以不带

## 8. 迁移后第一轮验证

迁过去后，建议先跑这几条正式入口：

1. `npm run build`
2. `npm run test:world:mutation-lock`
3. `D:\Apps\Godot\Godot_v4.6.2-stable_win64_console.exe --headless --quit --path godot-client`
4. `D:\Apps\Godot\Godot_v4.6.2-stable_win64_console.exe --headless --quit --path godot-client --scene res://scenes/ui/interior_panel.tscn`
5. `D:\Apps\Godot\Godot_v4.6.2-stable_win64_console.exe --headless --quit --path godot-client --scene res://scenes/ui/troop_panel.tscn`
6. `D:\Apps\Godot\Godot_v4.6.2-stable_win64_console.exe --headless --quit --path godot-client --scene res://scenes/ui/general_panel.tscn`
7. `D:\Apps\Godot\Godot_v4.6.2-stable_win64_console.exe --headless --quit --path godot-client --scene res://scenes/ui/ai_panel.tscn`

## 9. 当前状态判断

迁移审计已经足够支撑下一步进入“实际打包/复制”阶段。  
也就是说，下一步不该继续泛泛讨论“要不要迁”，而是应该直接做：

1. 生成 U 盘迁移清单
2. 生成不迁移清单
3. 在知道 U 盘盘符后，生成可直接执行的复制命令
