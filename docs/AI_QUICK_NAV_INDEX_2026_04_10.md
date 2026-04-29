# AI 快速导航索引（2026-04-10）

> 目标：让后续 AI 在 3-5 分钟内完成“项目定位 -> 改动定位 -> 验证入口定位”。

## 0) 2026-04-16 主线改道说明

如果当前目标是“原生 SLG 主壳 + AI 变量”，不要再默认从 UI Preview 线开始。

先读：

1. [AGENTS.md](../AGENTS.md)
2. [AGENTS 现行执行版](AGENTS_EXECUTION_CURRENT_2026_04.md)
3. [仓库主入口 README](../README.md)
4. [原生 SLG正式主线文档](NATIVE_SLG_MAINLINE_INDEX.md)
5. [原生 SLG正式组件文档](NATIVE_SLG_COMPONENT_ARCHITECTURE.md)
6. [Godot 原生 SLG 主壳布局对齐（2026-04-18）](GODOT_NATIVE_SHELL_LAYOUT_ALIGNMENT_2026_04_18.md)
7. [Godot SVG 图标源资产包（2026-04-18）](GODOT_SVG_ICON_SOURCE_PACK_2026_04_18.md)
8. [Godot 战报面板骨架（2026-04-18）](GODOT_BATTLE_REPORT_PANEL_SKELETON_2026_04_18.md)
9. [USB 迁移审计（5GB U 盘约束）](USB_MIGRATION_AUDIT_2026_04_17.md)
10. [USB 迁移执行说明（E 盘 / 4060 机器）](USB_MIGRATION_EXECUTION_2026_04_17.md)
11. [USB 迁移后路径重写说明](USB_MIGRATION_PATH_REWRITE_2026_04_17.md)
12. [Codex 主线记忆锚点](../CODEX.md)
13. [World Cell 分层底盘 / 建筑绑定正式执行计划](WORLD_CELL_LAYERED_BASE_BINDING_EXECUTION_PLAN_2026_04_23.md)

## 1) 30 秒项目定位

1. 项目方向：**AI 原生同盟战争（SLG + AI）**，真人定战略，AI 执行组织。
2. 当前阶段：整项目处于**完善开发阶段**；Godot 迁移是子范围收口，不是整项目回到 MVP。
3. 核心约束：后端规则引擎 authoritative；前端（Godot）只做状态消费与交互展示，不做裁决分支。
4. 容量警戒：前端继续统一成 `壳 + 子页 + 共享状态`，不等于后端已经证明能稳扛几千真人 + AI；后续若谈可扩展性，必须回到 `WorldService / SessionManager / WebSocket / tmp` 持久化与压测证据。

## 2) 首读顺序（最短路径）

1. [AGENTS.md](../AGENTS.md)
2. [AGENTS 现行执行版](AGENTS_EXECUTION_CURRENT_2026_04.md)
3. [仓库主入口 README](../README.md)
4. [原生 SLG正式主线文档](NATIVE_SLG_MAINLINE_INDEX.md)
5. [原生 SLG正式组件文档](NATIVE_SLG_COMPONENT_ARCHITECTURE.md)
6. [Godot 原生 SLG 主壳布局对齐（2026-04-18）](GODOT_NATIVE_SHELL_LAYOUT_ALIGNMENT_2026_04_18.md)
7. [Godot SVG 图标源资产包（2026-04-18）](GODOT_SVG_ICON_SOURCE_PACK_2026_04_18.md)
8. [Godot 战报面板骨架（2026-04-18）](GODOT_BATTLE_REPORT_PANEL_SKELETON_2026_04_18.md)
9. [USB 迁移审计（5GB U 盘约束）](USB_MIGRATION_AUDIT_2026_04_17.md)
10. [USB 迁移执行说明（E 盘 / 4060 机器）](USB_MIGRATION_EXECUTION_2026_04_17.md)
11. [USB 迁移后路径重写说明](USB_MIGRATION_PATH_REWRITE_2026_04_17.md)
12. [Codex 主线记忆锚点](../CODEX.md)
13. [World Cell 分层底盘 / 建筑绑定正式执行计划](WORLD_CELL_LAYERED_BASE_BINDING_EXECUTION_PLAN_2026_04_23.md)
13. [原生 SLG 主线导航入口（历史快照）](NATIVE_SLG_MAINLINE_INDEX_2026_04_16.md)
14. [原生 SLG 主线重置计划（历史快照）](NATIVE_SLG_RESET_PLAN_2026_04_16.md)
15. [原生 SLG 页面结构（附录快照）](NATIVE_SLG_PAGE_STRUCTURE_2026_04_16.md)
16. [AI 第一阶段插入点（附录快照）](AI_PHASE1_INSERTION_POINTS_2026_04_16.md)
17. [代码主线保留 / 冻结 / 桥接矩阵（附录快照）](CODE_MAINLINE_KEEP_FREEZE_BRIDGE_2026_04_16.md)

如果任务涉及世界地图格子占地、资源地、城池、关口、要塞、码头、山脉、河流或 anchor / footprint / placement，必须继续补读：

1. [World Cell 分层底盘 / 建筑绑定正式执行计划](WORLD_CELL_LAYERED_BASE_BINDING_EXECUTION_PLAN_2026_04_23.md)
2. [World Cell Footprint / Placement Contract](WORLD_CELL_FOOTPRINT_PLACEMENT_CONTRACT_2026_04_23.md)

不要把 A1-A5 的 PNG 导出、preview 摆图或历史叠图验证误读为当前正式地图放置方案。

下面这些只作为补充或历史，不作为默认主线入口：

15. [项目发展脉络](PROJECT_EVOLUTION_NARRATIVE_2026_04_09.md)
16. [目标对齐审计（2026-04-10）](AI_NATIVE_SLG_ALIGNMENT_AUDIT_2026_04_10.md)
17. [后端深读（Batch2）](AI_BACKEND_LOGIC_DEEP_READ_BATCH2_2026_04_09.md)
18. [Godot 迁移卡（Week1）](TASK_2026_04_05_GODOT_WEEK1_EXEC_CARDS.md)
19. [Week2/Batch2 执行卡](TASK_2026_04_09_AI_WEEK2_AUTONOMOUS_EXEC_CARDS.md)
20. [Godot MCP/CLI 控制面](GODOT_MCP_CLI_CONTROL_SURFACE_2026_04_10.md)
21. [门禁三件套交接入口](GATE_TRIO_HANDOFF_2026_04_10.md)
22. [多工作树并行快速入口](../WORKTREE_PARALLEL_QUICKSTART_2026_04_11.md)
23. [提示词上下文治理](AI_PROMPT_CONTEXT_GOVERNANCE_2026_04_11.md)
24. [Prompt 归档候选清单](PROMPT_ARCHIVE_CANDIDATES_2026_04_11.md)
25. [子代理资产审计](SUBAGENT_ASSET_AUDIT_2026_04_11.md)
26. [Godot AI 管理页横屏移动端验收记录（2026-04-28）](GODOT_AI_PANEL_MOBILE_LANDSCAPE_ACCEPTANCE_2026_04_28.md)

## 2.1) Preview / Sandbox 只在需要时再读

下面这些文档仍然保留，但默认只作为桥接参考、截图验证链和历史收口资料：

1. [Godot UI Preview 三线索引（Sandbox / 插件 / MCP CLI）](GODOT_UI_PREVIEW_THREE_LINE_INDEX_2026_04_14.md)
2. [Godot UI Preview 文档治理（第二轮）](GODOT_UI_PREVIEW_DOC_GOVERNANCE_2026_04_14.md)
3. [产品前台四卡执行文档](TASK_2026_04_14_PRODUCT_FRONTEND_EXEC_CARDS.md)
4. [Godot UI Preview Handoff](GODOT_UI_PREVIEW_HANDOFF_2026_04_13.md)

## 3) 按“要改什么”快速定位

| 目标 | 先读文档 | 主要代码路径 | 正式验证入口 |
| --- | --- | --- | --- |
| Godot 主壳布局/入口收口 | [原生 SLG正式主线文档](NATIVE_SLG_MAINLINE_INDEX.md), [主壳布局对齐文档](GODOT_NATIVE_SHELL_LAYOUT_ALIGNMENT_2026_04_18.md), [率土之滨逆向研究 → 项目设计洞察](STZB_REVERSE_DESIGN_INSIGHTS.md) | `godot-client/scenes/ui/native_slg_shell.tscn` `godot-client/scripts/ui/native_slg_shell.gd` `godot-client/scripts/ui/presenters/native_shell_presenter.gd` `godot-client/scripts/app/main.gd` | `npm run godot:headless:smoke` + `npm run godot:mainline:runtime -- --quit-after 1` + `npm run gate:godot:week1` |
| Godot 战报面板骨架/截图反推 | [战报骨架文档](GODOT_BATTLE_REPORT_PANEL_SKELETON_2026_04_18.md), [主壳布局对齐文档](GODOT_NATIVE_SHELL_LAYOUT_ALIGNMENT_2026_04_18.md), [SVG 图标源资产包](GODOT_SVG_ICON_SOURCE_PACK_2026_04_18.md) | `godot-client/scenes/ui/battle_report_panel.tscn` `godot-client/scenes/ui/battle_report_list_page.tscn` `godot-client/scenes/ui/battle_report_detail_page.tscn` `godot-client/scripts/ui/battle_report_panel.gd` `godot-client/scripts/ui/battle_report_list_page.gd` `godot-client/scripts/ui/battle_report_detail_page.gd` `godot-client/scripts/ui/presenters/battle_report_presenter.gd` `godot-client/scripts/app/main.gd` `godot-client/scripts/app/overlay_runtime_helper.gd` | `npm run godot:headless:smoke -- --scene res://scenes/ui/battle_report_panel.tscn` + `npm run godot:mainline:runtime -- --quit-after 1` + `npm run gate:godot:week1` |
| Godot AI 管理页横屏验收 / 聊天记忆 / 打开聊天频道 | [Godot AI 管理页横屏移动端验收记录](GODOT_AI_PANEL_MOBILE_LANDSCAPE_ACCEPTANCE_2026_04_28.md), [原生 SLG正式主线文档](NATIVE_SLG_MAINLINE_INDEX.md) | `godot-client/scripts/ui/presenters/ai_panel_presenter.gd` `godot-client/scripts/ui/ai_panel.gd` `godot-client/scripts/ui/slg_snapshot_section_page.gd` `godot-client/scripts/ui/main_chat_overlay.gd` `godot-client/tools/run_mainline_visual_smoke.py` `godot-client/scripts/app/main.gd` | `npm run godot:mainline:visual-smoke -- --display-mode world --world-action open_hub_panel --panel-id ai_hub --click-action ai_panel_open_chat_channel --window-width 1600 --window-height 900` + `npm run godot:mainline:visual-smoke -- --display-mode world --world-action open_hub_panel --panel-id ai_hub --click-action ai_panel_open_chat_channel --window-width 2388 --window-height 1080` + `npm run godot:headless:smoke` |
| Godot 二级功能面板通用壳/子页 | [原生 SLG正式主线文档](NATIVE_SLG_MAINLINE_INDEX.md), [Codex 主线记忆锚点](../CODEX.md) | `godot-client/scripts/ui/slg_snapshot_panel.gd` `godot-client/scenes/ui/slg_snapshot_section_page.tscn` `godot-client/scripts/ui/slg_snapshot_section_page.gd` `godot-client/scripts/app/overlay_runtime_helper.gd` `godot-client/scripts/ui/recruit_panel.gd` `godot-client/scripts/ui/general_panel.gd` `godot-client/scripts/ui/ai_panel.gd` `godot-client/scripts/app/main.gd` | `npm run godot:headless:smoke -- --scene res://scenes/ui/recruit_panel.tscn` + `npm run godot:headless:smoke -- --scene res://scenes/ui/general_panel.tscn` + `npm run godot:headless:smoke -- --scene res://scenes/ui/ai_panel.tscn` + `npm run gate:godot:week1` |
| 新窗口提示词（UI / AI 玩家） | [UI 设计窗口提示词](UI_DESIGN_WINDOW_PROMPT_2026_04_18.md), [AI 玩家窗口提示词](AI_PLAYER_WINDOW_PROMPT_2026_04_18.md), [Codex 主线记忆锚点](../CODEX.md) | `docs/UI_DESIGN_WINDOW_PROMPT_2026_04_18.md` `docs/AI_PLAYER_WINDOW_PROMPT_2026_04_18.md` | 新窗口首轮必须先全文档搜索，再开始做分域工作 |
| Godot HUD/可观测（events/ws/runtime/civil-memory） | [M11](modules_v2/M11.md), [M05](modules_v2/M05.md), [M15](modules_v2/M15.md), [godot-client/README](../godot-client/README.md) | `godot-client/scripts/infra/observability/observability_bridge.gd` `godot-client/scripts/ui/observability_panel.gd` `godot-client/scripts/infra/http/backend_api_client.gd` | `D:\\Apps\\Godot\\Godot_v4.6.2-stable_win64_console.exe --headless --path godot-client --quit-after 1` + `npm run gate:godot:week1` |
| Godot 地图渲染/性能（MapGrid） | [M16](modules_v2/M16.md), [godot-client/README](../godot-client/README.md), [视觉上下文锚点](GODOT_VISUAL_CONTEXT_ANCHOR_2026_04_11.md) | `godot-client/scripts/map/map_grid.gd`（含 mountain bitmask + river/sand edge bitmask overlay + mountain_visual_profile 预设 + resource/home 参数化与 world-city 回退锚点） | `npm run gate:godot:week1` + baseline 导出 JSON |
| AI 玩家动画/表现（UnitView + replay engage） | [godot-client/README](../godot-client/README.md), [动画兜底文档](GODOT_AI_PLAYER_ANIMATION_FALLBACK_2026_04_10.md) | `godot-client/scripts/map/unit_view_layer.gd` `godot-client/scripts/map/unit_marker.gd` | 打开 Godot 编辑器观察 + `npm run gate:godot:week1` |
| Godot 视觉替换主链（TMX 静态底图 + 8 向单位 + overlay 贴图） | [视觉替换执行文档](GODOT_VISUAL_REPLACEMENT_EXECUTION_2026_04_10.md), [Godot 控制面](GODOT_MCP_CLI_CONTROL_SURFACE_2026_04_10.md) | `godot-client/assets/themes/slgclient/**` `godot-client/scripts/map/map_grid.gd` `godot-client/scripts/map/unit_marker.gd` `godot-client/scripts/map/unit_view_layer.gd` `godot-client/tools/validate_visual_mapping.py` | `py -3.11 godot-client/tools/import_slgclient_theme_assets.py` + `npm run gate:godot:week1`（strict） + `npm run godot:ops:cli -- --output tmp/gates/godot_ops_bootstrap_latest.json bootstrap-chain` + `npm run godot:ops:cli -- --timeout-sec 180 --output tmp/gates/ai_ops_template_replay_latest.json template-replay --scenario baseline_v1` + `npm run godot:ops:visual-validate` |
| UI Preview Sandbox / 编辑器插件 / MCP CLI 三线索引 | [Godot UI Preview 三线索引](GODOT_UI_PREVIEW_THREE_LINE_INDEX_2026_04_14.md), [Godot 控制面](GODOT_MCP_CLI_CONTROL_SURFACE_2026_04_10.md), [Godot UI Preview Handoff](GODOT_UI_PREVIEW_HANDOFF_2026_04_13.md) | `godot-client/data/ui_preview/stories/stories_manifest.json` `godot-client/addons/ui_preview_sandbox/**` `server/src/mcp/gameServer.ts` `godot-client/tools/slg_ops_cli.py` | `py -3.11 godot-client/tools/run_ui_preview_sandbox.py` + `py -3.11 godot-client/tools/validate_ui_preview_sandbox.py --presentation-capture --report-path tmp/screenshots/ui_preview_sandbox/preview_validation_report.json --screenshot-dir tmp/screenshots/ui_preview_sandbox` + `npm run godot:ui:preview:regress` + `npm run godot:ops:cli -- bootstrap-chain --output tmp/gates/godot_ops_bootstrap_latest.json` |
| UI Preview Sandbox 文档分层治理 | [UI Preview 文档治理](GODOT_UI_PREVIEW_DOC_GOVERNANCE_2026_04_14.md), [Godot UI Preview 三线索引](GODOT_UI_PREVIEW_THREE_LINE_INDEX_2026_04_14.md), [Godot UI Preview Handoff](GODOT_UI_PREVIEW_HANDOFF_2026_04_13.md) | `docs/GODOT_UI_PREVIEW_DOC_GOVERNANCE_2026_04_14.md` `docs/GODOT_UI_PREVIEW_*` `docs/GODOT_MAP_*` | `py -3.11 -c "from pathlib import Path; p=Path(r'C:/Users/26739/Desktop/8989/docs/GODOT_UI_PREVIEW_DOC_GOVERNANCE_2026_04_14.md'); print('ok' if p.read_text(encoding='utf-8') else 'empty')"` |
| 产品前台四卡（A/B/C/D） | [产品前台四卡执行文档](TASK_2026_04_14_PRODUCT_FRONTEND_EXEC_CARDS.md), [Godot UI Preview 文档治理](GODOT_UI_PREVIEW_DOC_GOVERNANCE_2026_04_14.md), [Godot UI Preview 三线索引](GODOT_UI_PREVIEW_THREE_LINE_INDEX_2026_04_14.md) | `godot-client/scenes/dev/**` `godot-client/scripts/dev/**` `godot-client/data/ui_preview/stories/**` | `py -3.11 godot-client/tools/run_ui_preview_sandbox.py` + `py -3.11 godot-client/tools/validate_ui_preview_sandbox.py --presentation-capture --report-path tmp/screenshots/ui_preview_sandbox/preview_validation_report.json --screenshot-dir tmp/screenshots/ui_preview_sandbox` |
| 四卡状态图谱（落盘锚点） | [产品前台四卡执行文档](TASK_2026_04_14_PRODUCT_FRONTEND_EXEC_CARDS.md), [Godot UI Preview Handoff](GODOT_UI_PREVIEW_HANDOFF_2026_04_13.md) | `docs/TASK_2026_04_14_PRODUCT_FRONTEND_EXEC_CARDS.md` `docs/GODOT_UI_PREVIEW_HANDOFF_2026_04_13.md` | `obsidian files folder='docs' ext=md` + `obsidian backlinks path='docs/TASK_2026_04_14_PRODUCT_FRONTEND_EXEC_CARDS.md' total` + `obsidian backlinks path='docs/GODOT_UI_PREVIEW_HANDOFF_2026_04_13.md' total` |
| slgclient 资产集中出口（供外部替换/索引工具消费） | [视觉替换执行文档](GODOT_VISUAL_REPLACEMENT_EXECUTION_2026_04_10.md), [视觉上下文锚点](GODOT_VISUAL_CONTEXT_ANCHOR_2026_04_11.md) | `godot-client/assets/themes/slgclient/replacements/exchange_bundle/**` `godot-client/assets/themes/slgclient/manifests/overlay_frames_manifest.json` | `py -3.11 godot-client/tools/import_slgclient_theme_assets.py`（自动刷新 exchange bundle）+ 读取 `exchange_bundle_manifest.json` 校验文件数/体积 |
| Godot 上下文防漂移（首读锚点） | [视觉上下文锚点](GODOT_VISUAL_CONTEXT_ANCHOR_2026_04_11.md), [视觉替换执行文档](GODOT_VISUAL_REPLACEMENT_EXECUTION_2026_04_10.md) | `docs/GODOT_VISUAL_CONTEXT_ANCHOR_2026_04_11.md` | 新会话先读锚点，再执行 strict/ops 链；不要仅凭历史对话记忆推进 |
| Session/autonomy 控制链 | [M06](modules_v2/M06.md), [M07](modules_v2/M07.md), [M08](modules_v2/M08.md), [M14](modules_v2/M14.md) | `server/src/multiplayer/SessionManager.ts` `server/src/routes/session.ts` `shared/contracts/game/session.ts` | `npm run test:session:manager` + `npm run gate:session:security` + `GET /api/session/runtime` |
| Planning/Commander/General/Reflect 主链 | [M03](modules_v2/M03.md), [M04](modules_v2/M04.md), [M05](modules_v2/M05.md), [后端深读](AI_BACKEND_LOGIC_DEEP_READ_BATCH2_2026_04_09.md) | `server/src/application/world/WorldService.ts` `server/src/agents/commander/CommanderAgent.ts` `server/src/agents/general/*` `server/src/agents/reflect/*` | `npm run gate:ai:mainline:stability` |
| 持久化与告警（config/v2/save-slot/session） | [M01](modules_v2/M01.md), [M08](modules_v2/M08.md), [M09](modules_v2/M09.md), [M10](modules_v2/M10.md), [M13](modules_v2/M13.md), [M18](modules_v2/M18.md), [告警 runbook](PERSISTENCE_ALERT_RUNBOOK_2026_04_09.md) | `server/src/app.ts` `server/src/application/world/WorldService.ts` `server/src/multiplayer/SessionManager.ts` `server/src/application/faction/FactionConfigStore.ts` `server/src/application/ai/AiConfigService.ts` `server/src/application/v2/V2GameService.ts` `server/src/evals/runAiNightlyAcceptanceGate.ts` | `npm run gate:ai:nightly:acceptance` + `GET /api/health` |
| 主链门禁与回归 | [M18](modules_v2/M18.md), [门禁三件套交接入口](GATE_TRIO_HANDOFF_2026_04_10.md), [Godot 控制面](GODOT_MCP_CLI_CONTROL_SURFACE_2026_04_10.md) | `server/src/evals/*` `godot-client/tools/run_week1_gate.py` | `npm run gate:ai:preflight` `npm run gate:ai:trio` `npm run gate:ai:trio:summary` `npm run gate:godot:week1`（strict，CI/验收口径） |
| AI 玩家后端知识图谱读面 | [AI 玩家后端交接文档](AI_PLAYER_WINDOW_HANDOFF_2026_04_20.md), [AI 玩家后端知识图谱](AI_PLAYER_BACKEND_KNOWLEDGE_GRAPH_2026_04_20.md) | `shared/contracts/aiPlayerKnowledgeGraph.ts` `server/src/application/ai/AiPlayerKnowledgeGraphService.ts` `server/src/application/ai/AIPlayerGovernanceService.ts` `server/src/application/ai/aiPlayerGovernanceState.ts` `server/src/application/ai/aiPlayerGovernancePersist.ts` `server/src/application/ai/aiPlayerGovernanceRuntimeView.ts` `server/src/application/ai/aiPlayerProposalLifecycle.ts` `server/src/application/ai/aiPlayerProposalExecution.ts` `server/src/routes/aiPlayerKnowledgeGraphRoute.ts` `server/src/routes/aiPlayerProposalRoutes.ts` `server/src/routes/aiPlayerRuntimeRoutes.ts` `server/src/mcp/registerAiPlayerTools.ts` | `GET /api/ai/knowledge-graph` `GET /api/ai/knowledge-graph?format=obsidian` `npm run test:ai:knowledge-graph:http-contract` `npm run test:ai:knowledge-graph:mcp` |
| Godot Week1 gate 边界（strict/compat） | [godot-client/README](../godot-client/README.md), [Godot 控制面](GODOT_MCP_CLI_CONTROL_SURFACE_2026_04_10.md), [视觉替换执行文档](GODOT_VISUAL_REPLACEMENT_EXECUTION_2026_04_10.md) | `package.json` `godot-client/tools/run_week1_gate.py` | `npm run gate:godot:week1`（strict，默认且用于 CI/验收；唯一可写“通过结论”的口径）；`npm run gate:godot:week1:compat`（仅排障，不得作为验收证据/结案结论） |
| 模板动作执行与回放（B2-C19/B2-C20/B2-C21） | [M12](modules_v2/M12.md), [M15](modules_v2/M15.md), [M18](modules_v2/M18.md), [对齐审计](AI_NATIVE_SLG_ALIGNMENT_AUDIT_2026_04_10.md) | `server/src/mcp/gameServer.ts` `godot-client/tools/slg_ops_cli.py` `server/src/evals/runAiMainlineStabilityGate.ts` `server/src/routes/observability.ts` | `npm run godot:ops:cli -- world-action-templates` `npm run godot:ops:cli -- template-replay --scenario baseline_v1` `npm run gate:ai:mainline:stability` |

## 4) Obsidian CLI（宝石 CLI）快速命令

```powershell
obsidian files folder='docs' ext=md
obsidian backlinks path='docs/AI_PLAYER_BACKEND_KNOWLEDGE_GRAPH_2026_04_20.md' total
obsidian backlinks path='docs/AI_QUICK_NAV_INDEX_2026_04_10.md' total
obsidian backlinks path='docs/AGENTS_EXECUTION_CURRENT_2026_04.md' total
obsidian backlinks path='docs/TASK_2026_04_14_PRODUCT_FRONTEND_EXEC_CARDS.md' total
obsidian backlinks path='docs/GODOT_UI_PREVIEW_HANDOFF_2026_04_13.md' total
obsidian backlinks path='docs/AI_BACKEND_LOGIC_DEEP_READ_BATCH2_2026_04_09.md' total
obsidian backlinks path='docs/GODOT_VISUAL_REPLACEMENT_EXECUTION_2026_04_10.md' total
obsidian backlinks path='docs/GODOT_VISUAL_CONTEXT_ANCHOR_2026_04_11.md' total
obsidian backlinks path='docs/GODOT_NATIVE_SHELL_LAYOUT_ALIGNMENT_2026_04_18.md' total
obsidian backlinks path='docs/GODOT_BATTLE_REPORT_PANEL_SKELETON_2026_04_18.md' total
obsidian backlinks path='docs/GODOT_AI_PANEL_MOBILE_LANDSCAPE_ACCEPTANCE_2026_04_28.md' total
obsidian links path='docs/GODOT_NATIVE_SHELL_LAYOUT_ALIGNMENT_2026_04_18.md' total
obsidian links path='docs/GODOT_BATTLE_REPORT_PANEL_SKELETON_2026_04_18.md' total
obsidian links path='docs/GODOT_AI_PANEL_MOBILE_LANDSCAPE_ACCEPTANCE_2026_04_28.md' total
```

用途：

1. `files`：确认文档是否存在与命名是否正确。
2. `backlinks`：确认主链文档互相连通，避免“孤立文档”。

## 5) 防偏离检查清单（改动前后都执行）

1. 是否改变了“后端 authoritative、前端只读消费”的边界？
2. 是否新增了 undocumented 字段但未同步模块卡/契约文档？
3. 是否给出正式验证链（不是仅临时脚本）？
4. 中文文件改动后是否做 UTF-8 回读校验？

## 6) 下一默认推进卡

当前建议下一步：`P5` 已完成（docs 包 PR 收口已形成可审阅变更包）；等待用户下发下一优先级卡。
