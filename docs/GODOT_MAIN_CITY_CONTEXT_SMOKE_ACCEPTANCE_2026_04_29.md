# Godot 主城节点上下文 smoke 验收交接（2026-04-29）

本文档给指定验收窗口使用。目标是独立确认本轮 `世界地图主城节点 -> MainCityHubOverlay -> 内政/建筑升级模板/部队 -> 返回地图` 链路没有破坏主线默认入口。

## 0. 结论先验

本轮实现与验证是在主工作目录直接完成的：

`C:\Users\26739\Desktop\8989`

没有另开 isolated worktree，没有复制项目到其它文件夹。如果验收窗口也在这个目录执行，不需要额外集成目录。如果验收窗口在其它 worktree 或其它机器，必须先由集成窗口把相关文件同步过去，再验收。

## 1. 验收窗口身份与边界

你是指定验收窗口，只做验收，不做重构。

必须遵守：

1. 先执行 `git status --short`。
2. 只读以下锚点文档：
   - `AGENTS.md`
   - `docs/AGENTS_EXECUTION_CURRENT_2026_04.md`
   - `CODEX.md`
   - `docs/NATIVE_SLG_MAINLINE_INDEX.md`
   - `docs/NATIVE_SLG_PAGE_STRUCTURE_2026_04_16.md`
   - `docs/NATIVE_SLG_COMPONENT_ARCHITECTURE.md`
3. 不要回退、清理、覆盖跨窗口 dirty/untracked 文件。
4. 默认只读验收；除非主窗口明确要求修复，否则不要 patch。
5. 严禁修改：
   - `server/**`
   - `shared/**`
   - `godot-client/assets/**`
   - `godot-client/tools/import_slgclient_theme_assets.py`
   - 旧 UI / `hud_v1`
   - 真实建筑升级 authority、资源扣减、战斗、AI 后端规则
6. 默认禁止修改 `godot-client/scripts/map/map_grid.gd`。如果 map 主城点击 signal 不发，记录阻塞项交给 map owner，不要在 UI 侧推断主城。

当前已知工作树很脏，验收时不要把全仓 dirty 当成本链路失败；只关注下面列出的主线 UI smoke 目标。

## 2. 需要确认的文件/组件

验收时重点看这些已有组件是否被正确复用：

1. 地图最小 hook：
   - `godot-client/scripts/map/map_grid.gd`
   - 应存在 signal：`player_home_city_node_clicked(context: Dictionary)`
   - 该文件由 map owner 负责，本窗口不修改。
2. 主城 hub：
   - `godot-client/scripts/ui/main_city_hub_overlay.gd`
   - 复用 `hub_entry_requested(action_id)`
   - 入口应包含 `interior / troop`，其它旧入口不得被破坏。
3. 主线接线：
   - `godot-client/scripts/app/main.gd`
   - 应连接 `MapGrid.player_home_city_node_clicked` 到 `MainCityHubOverlay`。
4. 可复用面板：
   - `godot-client/scenes/ui/interior_panel.tscn`
   - `godot-client/scripts/ui/interior_panel.gd`
   - `godot-client/scenes/ui/building_tree_view.tscn`
   - `godot-client/scripts/ui/building_tree_view.gd`
   - `godot-client/scenes/ui/build_upgrade_sheet.tscn`
   - `godot-client/scripts/ui/build_upgrade_sheet.gd`
   - `godot-client/scenes/ui/troop_panel.tscn`
   - `godot-client/scripts/ui/troop_panel.gd`
5. smoke runner：
   - `godot-client/tools/run_mainline_visual_smoke.py`
   - 必须保留 `world_click_main_city_node`，并保留下面列出的专项 action。
6. evidence 文档：
   - `docs/NATIVE_SLG_MAINLINE_INDEX.md`
   - 应包含 `14.5.1 主城节点上下文 visual smoke 封板（2026-04-29）`。

## 3. 必须验收的 action id

这些 action id 是本轮固定保留的主城节点上下文 smoke：

1. `world_click_main_city_node`
2. `world_click_main_city_node_interior`
3. `world_click_main_city_node_building_upgrade`
4. `world_click_main_city_node_troop`
5. `world_click_main_city_node_interior_close`
6. `world_click_main_city_node_troop_close`

新增 panel id：无。复用既有 panel：`interior`、`troop`。

## 4. 正式验收命令

在 `C:\Users\26739\Desktop\8989` 执行。

### 4.1 封板回归，必须跑

```powershell
npm run godot:headless:smoke
```

预期：命令退出码为 0。允许 Godot 退出时出现既有 `ObjectDB instances leaked` warning；只要命令成功，不作为本链路失败。

```powershell
npm run godot:mainline:visual-smoke -- --server-script start --timeout-sec 90 --backend-timeout-sec 120
```

预期：

- 顶层 `ok=true`
- `godotReport.ok=true`
- `displayMode=world`
- `mapVisible=true`
- `mainCityHub.visible=true`
- `shellNavLayout.ok=true`
- 默认入口截图不是空白

```powershell
npm run godot:mainline:visual-smoke -- --server-script start --timeout-sec 90 --backend-timeout-sec 120 --click-action world_click_main_city_node
```

预期：

- 顶层 `ok=true`
- `clickActionRequirementOk=true`
- `clickActionResult.ok=true`
- `clickActionResult.clicked=true`
- `clickActionResult.reason="main_city_map_node_clicked"`
- `clickActionResult.mapNodeClickContext` 存在
- `clickActionResult.mainCityHub.lastMapNodeClick` 存在
- `clickActionResult.mainCityHub.expanded=true`

### 4.2 完整专项验收，建议全部跑

```powershell
npm run godot:mainline:visual-smoke -- --server-script start --timeout-sec 90 --backend-timeout-sec 120 --click-action world_click_main_city_node_interior
```

预期：

- `clickActionResult.mapNodeClickContext` 存在
- `interiorPanel.hasBuildingTree=true`
- `interiorPanel.hasUpgradeSheet=true`
- 能打开 `InteriorPanel`

```powershell
npm run godot:mainline:visual-smoke -- --server-script start --timeout-sec 90 --backend-timeout-sec 120 --click-action world_click_main_city_node_building_upgrade
```

预期：

- `clickActionResult.mapNodeClickContext` 存在
- `clickActionResult.mapClickResult.mainCityHub.lastMapNodeClick` 存在
- `clickActionResult.buildingChain.templateOnly=true`
- `clickActionResult.buildingChain.authorityTriggered=false`
- `clickActionResult.buildingChain.templateFeedbackVisible=true`
- 不应触发真实建筑升级 authority，不应扣资源，不应调用后端规则结算。

```powershell
npm run godot:mainline:visual-smoke -- --server-script start --timeout-sec 90 --backend-timeout-sec 120 --click-action world_click_main_city_node_troop
```

预期：

- `clickActionResult.mapNodeClickContext` 存在
- `clickActionResult.troopPanel.hasTroopPanel=true`
- `clickActionResult.troopPanel.hasTroopOverview=true`
- `clickActionResult.troopPanel.hasBuildingTree=true`
- `clickActionResult.troopPanel.hasUpgradeSheet=true`

```powershell
npm run godot:mainline:visual-smoke -- --server-script start --timeout-sec 90 --backend-timeout-sec 120 --click-action world_click_main_city_node_interior_close
```

预期：

- `clickActionResult.returnedToMap=true`
- `clickActionResult.mapVisible=true`
- `clickActionResult.activePanelId=""`

```powershell
npm run godot:mainline:visual-smoke -- --server-script start --timeout-sec 90 --backend-timeout-sec 120 --click-action world_click_main_city_node_troop_close
```

预期：

- `clickActionResult.returnedToMap=true`
- `clickActionResult.mapVisible=true`
- `clickActionResult.activePanelId=""`

## 5. 已有参考 evidence

这些是本窗口已经跑通过的参考证据。验收窗口重新跑时会生成新的时间戳目录，不要求目录名完全一致；但字段和截图状态应一致。

| 验收项 | 已有 evidenceDir |
| --- | --- |
| 默认 visual smoke | `C:\Users\26739\Desktop\8989\tmp\screenshots\mainline_visual_smoke_20260429_112255` |
| `world_click_main_city_node` | `C:\Users\26739\Desktop\8989\tmp\screenshots\mainline_visual_smoke_20260429_112314` |
| `world_click_main_city_node_interior` | `C:\Users\26739\Desktop\8989\tmp\screenshots\mainline_visual_smoke_20260429_010007` |
| `world_click_main_city_node_building_upgrade` | `C:\Users\26739\Desktop\8989\tmp\screenshots\mainline_visual_smoke_20260429_030229` |
| `world_click_main_city_node_troop` | `C:\Users\26739\Desktop\8989\tmp\screenshots\mainline_visual_smoke_20260429_012354` |
| `world_click_main_city_node_interior_close` | `C:\Users\26739\Desktop\8989\tmp\screenshots\mainline_visual_smoke_20260429_015734` |
| `world_click_main_city_node_troop_close` | `C:\Users\26739\Desktop\8989\tmp\screenshots\mainline_visual_smoke_20260429_033855` |

关键截图：

- 默认地图：`C:\Users\26739\Desktop\8989\tmp\screenshots\mainline_visual_smoke_20260429_112255\01_ready_world_map.png`
- 主城节点点击：`C:\Users\26739\Desktop\8989\tmp\screenshots\mainline_visual_smoke_20260429_112314\01_after_world_click_main_city_node.png`
- 建筑升级模板反馈：`C:\Users\26739\Desktop\8989\tmp\screenshots\mainline_visual_smoke_20260429_030229\01_after_world_click_main_city_node_building_upgrade.png`
- 部队关闭返回地图：`C:\Users\26739\Desktop\8989\tmp\screenshots\mainline_visual_smoke_20260429_033855\01_after_world_click_main_city_node_troop_close.png`

## 6. 通过标准

验收通过需要同时满足：

1. `godot:headless:smoke` 通过。
2. 默认 `godot:mainline:visual-smoke` 通过，世界地图入口、主壳底部按钮、主城 hub 可见。
3. `world_click_main_city_node` 通过，真实地图节点点击后能展开 hub，并报告 `mapNodeClickContext`。
4. `world_click_main_city_node_interior` 通过，能从 hub 打开 `InteriorPanel`，并看到建筑树与升级 sheet。
5. `world_click_main_city_node_building_upgrade` 通过，升级按钮只产生模板反馈：
   - `templateOnly=true`
   - `authorityTriggered=false`
   - `templateFeedbackVisible=true`
6. `world_click_main_city_node_troop` 通过，能从 hub 打开 `TroopPanel`。
7. `world_click_main_city_node_interior_close` 与 `world_click_main_city_node_troop_close` 至少各通过一次，关闭后返回地图：
   - `returnedToMap=true`
   - `mapVisible=true`
   - `activePanelId=""`
8. 不破坏底部按钮：`武将 / 内政 / 同盟 / AI / 聊天 / 招募` 仍存在且 `shellNavLayout.ok=true`。
9. 不触碰或扩展后端 authority、资源扣减、战斗、AI。

## 7. 已知风险，不算本链路失败

1. 当前工作树大量 dirty/untracked/deleted 项，来自多窗口并行；验收窗口不要擅自清理。
2. backend health 可能出现 BYOK 或 save-slot 体积告警；只要 visual smoke 顶层 `ok=true`，这些不是本链路失败。
3. 如果上游没有 `homeTileId` 或没有 home city overlay entry，`MapGrid` 不会发 `player_home_city_node_clicked`。这是 map owner 既有字段边界，不应由 UI 侧推断修补。

## 8. 验收失败时怎么回报

如果失败，不要直接大改。按下面格式回报给主窗口：

```text
验收结论：不通过
失败命令：
失败 action id：
失败 evidenceDir：
失败截图：
关键 report 字段：
期望字段：
实际字段：
是否触碰 map_grid.gd：否/是
是否触碰 server/shared：否/是
判断阻塞归属：UI glue / smoke runner / map owner hook / backend health / 工作树缺文件 / 其它
建议下一步：
```

如果通过，按下面格式回报：

```text
验收结论：通过
通过命令：
新 evidenceDir：
关键字段已确认：
- mapNodeClickContext：
- mainCityHub.lastMapNodeClick：
- buildingChain.templateOnly：
- buildingChain.authorityTriggered：
- buildingChain.templateFeedbackVisible：
- returnedToMap：
- mapVisible：
- activePanelId：
未触碰 map_grid.gd/server/shared：
剩余风险：
```

## 9. 可直接粘贴给验收窗口的短提示词

```text
工作目录：C:\Users\26739\Desktop\8989

你是 Godot 主城节点上下文 smoke 验收窗口，只做验收，不做重构。先执行 git status --short，并只读 AGENTS.md、docs/AGENTS_EXECUTION_CURRENT_2026_04.md、CODEX.md、docs/NATIVE_SLG_MAINLINE_INDEX.md、docs/NATIVE_SLG_PAGE_STRUCTURE_2026_04_16.md、docs/NATIVE_SLG_COMPONENT_ARCHITECTURE.md。当前工作树很脏，不要回退或清理跨窗口文件。

验收目标：确认世界地图主城节点点击 -> MainCityHubOverlay -> InteriorPanel / BuildUpgradeSheet / TroopPanel -> close 返回地图这条 UI smoke 链路在正式入口可复现，并且没有破坏默认世界地图入口。禁止修改 server/**、shared/**、godot-client/assets/**、旧 UI/hud_v1、真实建筑升级 authority、资源扣减、战斗、AI。默认不要修改 godot-client/scripts/map/map_grid.gd；如果主城点击 signal 不发，记录阻塞项交给 map owner。

必须跑：
1. npm run godot:headless:smoke
2. npm run godot:mainline:visual-smoke -- --server-script start --timeout-sec 90 --backend-timeout-sec 120
3. npm run godot:mainline:visual-smoke -- --server-script start --timeout-sec 90 --backend-timeout-sec 120 --click-action world_click_main_city_node

建议完整验收再跑：
4. npm run godot:mainline:visual-smoke -- --server-script start --timeout-sec 90 --backend-timeout-sec 120 --click-action world_click_main_city_node_interior
5. npm run godot:mainline:visual-smoke -- --server-script start --timeout-sec 90 --backend-timeout-sec 120 --click-action world_click_main_city_node_building_upgrade
6. npm run godot:mainline:visual-smoke -- --server-script start --timeout-sec 90 --backend-timeout-sec 120 --click-action world_click_main_city_node_troop
7. npm run godot:mainline:visual-smoke -- --server-script start --timeout-sec 90 --backend-timeout-sec 120 --click-action world_click_main_city_node_interior_close
8. npm run godot:mainline:visual-smoke -- --server-script start --timeout-sec 90 --backend-timeout-sec 120 --click-action world_click_main_city_node_troop_close

通过标准：默认 visual smoke ok；world_click_main_city_node 有 clickActionResult.mapNodeClickContext 和 mainCityHub.lastMapNodeClick；building_upgrade 有 buildingChain.templateOnly=true、authorityTriggered=false、templateFeedbackVisible=true；interior/troop close 有 returnedToMap=true、mapVisible=true、activePanelId=""；shellNavLayout.ok=true；未触发真实升级 authority、资源扣减、战斗、AI。

交付格式：通过项 / 风险项 / 阻塞项 / 下一步。必须列出验证命令结果、evidenceDir、关键字段、是否触碰 main.gd/main.tscn/map_grid.gd/server/shared、是否只走 fixture/template。
```
