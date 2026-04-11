# AI 快速导航索引（2026-04-10）

> 目标：让后续 AI 在 3-5 分钟内完成“项目定位 -> 改动定位 -> 验证入口定位”。

## 1) 30 秒项目定位

1. 项目方向：**AI 原生同盟战争（SLG + AI）**，真人定战略，AI 执行组织。
2. 当前阶段：整项目处于**完善开发阶段**；Godot 迁移是子范围收口，不是整项目回到 MVP。
3. 核心约束：后端规则引擎 authoritative；前端（Godot）只做状态消费与交互展示，不做裁决分支。

## 2) 首读顺序（最短路径）

1. [AGENTS.md](../AGENTS.md)
2. [AGENTS 现行执行版](AGENTS_EXECUTION_CURRENT_2026_04.md)
3. [项目发展脉络](PROJECT_EVOLUTION_NARRATIVE_2026_04_09.md)
4. [后端深读（Batch2）](AI_BACKEND_LOGIC_DEEP_READ_BATCH2_2026_04_09.md)
5. [Week2/Batch2 执行卡](TASK_2026_04_09_AI_WEEK2_AUTONOMOUS_EXEC_CARDS.md)
6. [Godot 迁移卡（Week1）](TASK_2026_04_05_GODOT_WEEK1_EXEC_CARDS.md)
7. [目标对齐审计（2026-04-10）](AI_NATIVE_SLG_ALIGNMENT_AUDIT_2026_04_10.md)
8. [Godot MCP/CLI 控制面](GODOT_MCP_CLI_CONTROL_SURFACE_2026_04_10.md)
9. [收尾总览（B2-C16 + B2-C17）](CLOSEOUT_B2_C16_C17_2026_04_10.md)
10. [收尾总览（B2-C18）](CLOSEOUT_B2_C18_2026_04_10.md)
11. [收尾总览（B2-C19）](CLOSEOUT_B2_C19_2026_04_10.md)
12. [收尾总览（B2-C20）](CLOSEOUT_B2_C20_2026_04_10.md)
13. [收尾总览（B2-C21）](CLOSEOUT_B2_C21_2026_04_10.md)
14. [收尾总览（B2-C22）](CLOSEOUT_B2_C22_2026_04_10.md)
15. [门禁三件套交接入口](GATE_TRIO_HANDOFF_2026_04_10.md)
16. [收尾总览（B2-C23）](CLOSEOUT_B2_C23_2026_04_10.md)
17. [Batch3 执行卡](TASK_2026_04_10_AI_BATCH3_EXEC_CARDS.md)
18. [收尾总览（B3-C01）](CLOSEOUT_B3_C01_2026_04_10.md)
19. [收尾总览（B3-C02）](CLOSEOUT_B3_C02_2026_04_10.md)
20. [收尾总览（B3-C03）](CLOSEOUT_B3_C03_2026_04_10.md)
21. [收尾总览（B3-C04）](CLOSEOUT_B3_C04_2026_04_10.md)
22. [收尾总览（B3-C05）](CLOSEOUT_B3_C05_2026_04_10.md)
23. [收尾总览（B3-C06）](CLOSEOUT_B3_C06_2026_04_10.md)
24. [收尾总览（B3-C07）](CLOSEOUT_B3_C07_2026_04_11.md)
25. [收尾总览（B3-C08）](CLOSEOUT_B3_C08_2026_04_11.md)
26. [收尾总览（B3-C09）](CLOSEOUT_B3_C09_2026_04_11.md)
27. [收尾总览（B3-C10）](CLOSEOUT_B3_C10_2026_04_11.md)
28. [收尾总览（B3-C11）](CLOSEOUT_B3_C11_2026_04_11.md)
29. [收尾总览（B3-C12）](CLOSEOUT_B3_C12_2026_04_11.md)
30. [收尾总览（B3-C13）](CLOSEOUT_B3_C13_2026_04_11.md)
31. [收尾总览（B3-C14）](CLOSEOUT_B3_C14_2026_04_11.md)
32. [收尾总览（B3-C15）](CLOSEOUT_B3_C15_2026_04_11.md)
33. [收尾总览（B3-C16）](CLOSEOUT_B3_C16_2026_04_11.md)
34. [Godot AI 玩家动画与原型兜底](GODOT_AI_PLAYER_ANIMATION_FALLBACK_2026_04_10.md)
35. [Godot 视觉替换执行文档（TMX + UnitView）](GODOT_VISUAL_REPLACEMENT_EXECUTION_2026_04_10.md)
36. [Godot 视觉替换上下文锚点](GODOT_VISUAL_CONTEXT_ANCHOR_2026_04_11.md)
37. [多工作树并行快速入口](../WORKTREE_PARALLEL_QUICKSTART_2026_04_11.md)
38. [提示词上下文治理](AI_PROMPT_CONTEXT_GOVERNANCE_2026_04_11.md)
39. [子代理资产审计](SUBAGENT_ASSET_AUDIT_2026_04_11.md)

## 3) 按“要改什么”快速定位

| 目标 | 先读文档 | 主要代码路径 | 正式验证入口 |
| --- | --- | --- | --- |
| Godot HUD/可观测（events/ws/runtime/civil-memory） | [M11](modules_v2/M11.md), [M05](modules_v2/M05.md), [M15](modules_v2/M15.md), [godot-client/README](../godot-client/README.md) | `godot-client/scripts/infra/observability/observability_bridge.gd` `godot-client/scripts/ui/observability_panel.gd` `godot-client/scripts/infra/http/backend_api_client.gd` | `D:\\Apps\\Godot\\Godot_v4.6.2-stable_win64_console.exe --headless --path godot-client --quit-after 1` + `npm run gate:godot:week1` |
| Godot 地图渲染/性能（MapGrid） | [M16](modules_v2/M16.md), [godot-client/README](../godot-client/README.md), [视觉上下文锚点](GODOT_VISUAL_CONTEXT_ANCHOR_2026_04_11.md) | `godot-client/scripts/map/map_grid.gd`（含 mountain bitmask + river/sand edge bitmask overlay + mountain_visual_profile 预设 + resource/home 参数化与 world-city 回退锚点） | `npm run gate:godot:week1` + baseline 导出 JSON |
| AI 玩家动画/表现（UnitView + replay engage） | [godot-client/README](../godot-client/README.md), [动画兜底文档](GODOT_AI_PLAYER_ANIMATION_FALLBACK_2026_04_10.md) | `godot-client/scripts/map/unit_view_layer.gd` `godot-client/scripts/map/unit_marker.gd` | 打开 Godot 编辑器观察 + `npm run gate:godot:week1` |
| Godot 视觉替换主链（TMX 静态底图 + 8 向单位 + overlay 贴图） | [视觉替换执行文档](GODOT_VISUAL_REPLACEMENT_EXECUTION_2026_04_10.md), [Godot 控制面](GODOT_MCP_CLI_CONTROL_SURFACE_2026_04_10.md) | `godot-client/assets/themes/slgclient/**` `godot-client/scripts/map/map_grid.gd` `godot-client/scripts/map/unit_marker.gd` `godot-client/scripts/map/unit_view_layer.gd` `godot-client/tools/validate_visual_mapping.py` | `py -3.11 godot-client/tools/import_slgclient_theme_assets.py` + `npm run gate:godot:week1`（strict） + `npm run godot:ops:cli -- --output tmp/gates/godot_ops_bootstrap_latest.json bootstrap-chain` + `npm run godot:ops:cli -- --timeout-sec 180 --output tmp/gates/ai_ops_template_replay_latest.json template-replay --scenario baseline_v1` + `npm run godot:ops:visual-validate` |
| slgclient 资产集中出口（供 Gemini/Banana 替换） | [视觉替换执行文档](GODOT_VISUAL_REPLACEMENT_EXECUTION_2026_04_10.md), [视觉上下文锚点](GODOT_VISUAL_CONTEXT_ANCHOR_2026_04_11.md) | `godot-client/assets/themes/slgclient/replacements/exchange_bundle/**` `godot-client/assets/themes/slgclient/manifests/overlay_frames_manifest.json` | `py -3.11 godot-client/tools/import_slgclient_theme_assets.py`（自动刷新 exchange bundle）+ 读取 `exchange_bundle_manifest.json` 校验文件数/体积 |
| Godot 上下文防漂移（首读锚点） | [视觉上下文锚点](GODOT_VISUAL_CONTEXT_ANCHOR_2026_04_11.md), [视觉替换执行文档](GODOT_VISUAL_REPLACEMENT_EXECUTION_2026_04_10.md) | `docs/GODOT_VISUAL_CONTEXT_ANCHOR_2026_04_11.md` | 新会话先读锚点，再执行 strict/ops 链；不要仅凭历史对话记忆推进 |
| Session/autonomy 控制链 | [M06](modules_v2/M06.md), [M07](modules_v2/M07.md), [M08](modules_v2/M08.md), [M14](modules_v2/M14.md) | `server/src/multiplayer/SessionManager.ts` `server/src/routes/session.ts` `shared/contracts/game/session.ts` | `npm run test:session:manager` + `npm run gate:session:security` + `GET /api/session/runtime` |
| Planning/Commander/General/Reflect 主链 | [M03](modules_v2/M03.md), [M04](modules_v2/M04.md), [M05](modules_v2/M05.md), [后端深读](AI_BACKEND_LOGIC_DEEP_READ_BATCH2_2026_04_09.md) | `server/src/application/world/WorldService.ts` `server/src/agents/commander/CommanderAgent.ts` `server/src/agents/general/*` `server/src/agents/reflect/*` | `npm run gate:ai:mainline:stability` |
| 持久化与告警（config/v2/save-slot/session） | [M01](modules_v2/M01.md), [M08](modules_v2/M08.md), [M09](modules_v2/M09.md), [M10](modules_v2/M10.md), [M13](modules_v2/M13.md), [M18](modules_v2/M18.md), [告警 runbook](PERSISTENCE_ALERT_RUNBOOK_2026_04_09.md) | `server/src/app.ts` `server/src/application/world/WorldService.ts` `server/src/multiplayer/SessionManager.ts` `server/src/application/faction/FactionConfigStore.ts` `server/src/application/ai/AiConfigService.ts` `server/src/application/v2/V2GameService.ts` `server/src/evals/runAiNightlyAcceptanceGate.ts` | `npm run gate:ai:nightly:acceptance` + `GET /api/health` |
| 主链门禁与回归 | [M18](modules_v2/M18.md), [门禁三件套交接入口](GATE_TRIO_HANDOFF_2026_04_10.md), [Godot 控制面](GODOT_MCP_CLI_CONTROL_SURFACE_2026_04_10.md) | `server/src/evals/*` `godot-client/tools/run_week1_gate.py` | `npm run build` `npm run gate:ai:trio` `npm run gate:ai:trio:summary` `npm run gate:godot:week1`（strict，CI/验收口径） |
| Godot Week1 gate 边界（strict/compat） | [godot-client/README](../godot-client/README.md), [Godot 控制面](GODOT_MCP_CLI_CONTROL_SURFACE_2026_04_10.md), [视觉替换执行文档](GODOT_VISUAL_REPLACEMENT_EXECUTION_2026_04_10.md) | `package.json` `godot-client/tools/run_week1_gate.py` | `npm run gate:godot:week1`（strict，默认且用于 CI/验收；唯一可写“通过结论”的口径）；`npm run gate:godot:week1:compat`（仅排障，不得作为验收证据/结案结论） |
| 模板动作执行与回放（B2-C19/B2-C20/B2-C21） | [M12](modules_v2/M12.md), [M15](modules_v2/M15.md), [M18](modules_v2/M18.md), [对齐审计](AI_NATIVE_SLG_ALIGNMENT_AUDIT_2026_04_10.md) | `server/src/mcp/gameServer.ts` `godot-client/tools/slg_ops_cli.py` `server/src/evals/runAiMainlineStabilityGate.ts` `server/src/routes/observability.ts` | `npm run godot:ops:cli -- world-action-templates` `npm run godot:ops:cli -- template-replay --scenario baseline_v1` `npm run gate:ai:mainline:stability` |

## 4) Obsidian CLI（宝石 CLI）快速命令

```powershell
obsidian files folder='docs' ext=md
obsidian backlinks path='docs/AI_QUICK_NAV_INDEX_2026_04_10.md' total
obsidian backlinks path='docs/AGENTS_EXECUTION_CURRENT_2026_04.md' total
obsidian backlinks path='docs/AI_BACKEND_LOGIC_DEEP_READ_BATCH2_2026_04_09.md' total
obsidian backlinks path='docs/GODOT_VISUAL_REPLACEMENT_EXECUTION_2026_04_10.md' total
obsidian backlinks path='docs/GODOT_VISUAL_CONTEXT_ANCHOR_2026_04_11.md' total
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

当前建议下一步：创建并执行 `B3-C18`（docs 第二阶段精简：低频历史 prompt 文档统一打 `reference-only` 标签，并完成可归档清单与收口）。
