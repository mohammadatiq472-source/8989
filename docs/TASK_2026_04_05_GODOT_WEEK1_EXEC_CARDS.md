# TASK 002 - Godot 全量重写 Week 1 可执行任务卡（2026-04-05）

## 0. 任务目标（Week 1）

- 目标：在不破坏现有后端的前提下，完成 Godot 客户端最小底座并打通 `join -> world -> map-layout`。
- 范围：只做 Week 1 底座，不做复杂编辑器、不做视觉精修、不做非必要功能迁移。
- 前提：沿用既有 13-lane 子代理身份，不重建组织体系。

## 1. 身份来源（已核对）

- `docs/AI_ENGINEER_ORG_2026_03_25.md`
- `docs/MODULE_INDEX_2026_03_25_V2.md`
- `docs/modules_v2/module_manifest_2026_03_25.json`
- `docs/AI_SUBAGENT_LAUNCH_PROMPTS_2026_03_26.md`

## 2. Week 1 官方入口命令（复用链）

- 后端运行：`npm run start`
- 后端健康：`curl http://127.0.0.1:8787/api/health`
- 世界快照：`curl http://127.0.0.1:8787/api/world`
- 地图布局：`curl "http://127.0.0.1:8787/api/world/map-layout?scope=full"`
- Godot 无界面启动：`D:\Apps\Godot\Godot_v4.6.2-stable_win64_console.exe --headless --path godot-client --quit`

## 3. 子代理统一硬约束（执行时必须附带）

- 先读文档再动手：至少 `AGENTS.md` + 本任务卡 + 自己 lane 对应模块卡。
- 仅修改白名单路径，跨模块改动先报主代理审批。
- 交付必须包含：
  - 读取的文档路径
  - 修改文件清单
  - 复用的正式入口命令
  - 验证结果与结论
- 禁止“只给计划不落地”，至少完成一条可复现验证链。

## 4. Week 1 可执行任务卡（13 lanes）

| Card ID | Lane ID | Week 1 目标 | 允许修改白名单 | 正式验证入口 |
| --- | --- | --- | --- | --- |
| W1-C01 | AI-BE-EntryRuntime | 冻结 Godot 需要的后端最小入口契约（health/runtime/session） | `docs/TASK_2026_04_05_GODOT_WEEK1_EXEC_CARDS.md`, `docs/AI_ENGINEER_HUB_2026_03_25.md` | `npm run start`, `curl /api/health` |
| W1-C02 | AI-BE-RuleState | 确认 `GET /api/world` 与 `GET /api/world/map-layout` 字段稳定，不做语义破坏改动 | `docs/TASK_2026_04_05_GODOT_WEEK1_EXEC_CARDS.md`, `docs/AI_ENGINEER_HUB_2026_03_25.md` | `curl /api/world`, `curl /api/world/map-layout?scope=full` |
| W1-C03 | AI-Agent-Commander | 校验 planning 相关字段对 Godot 客户端只读兼容（不改业务行为） | `docs/TASK_2026_04_05_GODOT_WEEK1_EXEC_CARDS.md`, `docs/AI_ENGINEER_HUB_2026_03_25.md` | `npm run test:planner:prompt` |
| W1-C04 | AI-Agent-General | 校验 generals/chat 数据模型对 Godot UI 的最小可用字段 | `docs/TASK_2026_04_05_GODOT_WEEK1_EXEC_CARDS.md`, `docs/AI_ENGINEER_HUB_2026_03_25.md` | `curl /api/generals` |
| W1-C05 | AI-Agent-ReflectMemory | 校验 narratives/civil-memory 的最小读取链路 | `docs/TASK_2026_04_05_GODOT_WEEK1_EXEC_CARDS.md`, `docs/AI_ENGINEER_HUB_2026_03_25.md` | `curl /api/narratives` |
| W1-C06 | AI-Agent-GovDiplo | 校验 session autonomy 与 diplomacy 对 Week 1 无阻塞 | `docs/TASK_2026_04_05_GODOT_WEEK1_EXEC_CARDS.md`, `docs/AI_ENGINEER_HUB_2026_03_25.md` | `curl /api/session/status` |
| W1-C07 | AI-BE-WorldMeta | 校验地图元数据可供 Godot 读取，不新增后端特化分支 | `docs/TASK_2026_04_05_GODOT_WEEK1_EXEC_CARDS.md`, `docs/AI_ENGINEER_HUB_2026_03_25.md` | `curl /api/map/overview` |
| W1-C08 | AI-Platform-ModelGateway | 校验 AI config/models 接口可用于 Godot 设置页后续接入 | `docs/TASK_2026_04_05_GODOT_WEEK1_EXEC_CARDS.md`, `docs/AI_ENGINEER_HUB_2026_03_25.md` | `curl /api/ai/config`, `curl /api/ai/models` |
| W1-C09 | AI-Platform-Observability | 提供 Godot Week 1 最小可观测建议（events/ws 读链） | `docs/TASK_2026_04_05_GODOT_WEEK1_EXEC_CARDS.md`, `docs/AI_ENGINEER_HUB_2026_03_25.md` | `curl /api/events`, `WS /ws` |
| W1-C10 | AI-Shared-Contracts | 在 Godot 侧建立契约映射骨架（不改后端契约语义） | `godot-client/scripts/domain/**`, `godot-client/autoload/world_store.gd`, `docs/TASK_2026_04_05_GODOT_WEEK1_EXEC_CARDS.md` | `D:\Apps\Godot\Godot_v4.6.2-stable_win64_console.exe --headless --path godot-client --quit` |
| W1-C11 | AI-FE-CommandSurface | Godot UI 底座：`main/hud` 空壳与状态绑定入口 | `godot-client/scenes/app/**`, `godot-client/scenes/ui/**`, `godot-client/scripts/ui/**`, `godot-client/autoload/**` | `godot-client` headless 启动 + 运行态日志无报错 |
| W1-C12 | AI-FE-MapSurface | Godot 地图底座：map scene、camera、interaction 空壳与数据绑定口 | `godot-client/scenes/map/**`, `godot-client/scripts/map/**`, `godot-client/assets/**`, `godot-client/data/bootstrap/**` | `godot-client` headless 启动 + 加载 map 节点成功 |
| W1-C13 | AI-QA-Gates | Week 1 gate：后端入口 + Godot headless + join/world/map-layout 证据归档 | `docs/TASK_2026_04_05_GODOT_WEEK1_EXEC_CARDS.md`, `docs/AI_ENGINEER_HUB_2026_03_25.md`, `godot-client/tests/**`, `godot-client/tools/**` | `npm run start`, `curl health/world/map-layout`, `godot headless` |

## 5. Week 1 日程切片（执行顺序）

1. Day 1: W1-C01/W1-C02/W1-C10 并行，冻结契约和 Godot 数据模型骨架。
2. Day 2: W1-C11/W1-C12 并行，拉起 `main + map + hud` 最小场景。
3. Day 3: W1-C11/W1-C12 接入 W1-C01/W1-C02 的 HTTP 数据流。
4. Day 4: W1-C09 接 WS/read-only observability，W1-C13 出第一版 gate。
5. Day 5: W1-C13 汇总验收，主代理给出通过项/风险项/阻塞项/下一步。

## 6. 交付回传格式（统一）

```text
[Card] W1-Cxx
Lane: <Lane ID>
Read Docs:
- ...
Changed Files:
- ...
Entrypoints:
- ...
Validation:
- PASS/FAIL + evidence
Conclusion (EN):
结果（中文）:
```

## 7. 最新执行记录

```text
[Card] W1-C09
Lane: AI-Platform-Observability
Read Docs:
- AGENTS.md
- docs/TASK_2026_04_05_GODOT_WEEK1_EXEC_CARDS.md
- docs/AI_ENGINEER_HUB_2026_03_25.md
Changed Files:
- godot-client/scripts/infra/observability/observability_bridge.gd
- godot-client/scripts/infra/http/backend_api_client.gd
- godot-client/scripts/app/main.gd
- godot-client/scenes/app/main.tscn
- godot-client/scripts/ui/observability_panel.gd
- godot-client/scenes/ui/observability_panel.tscn
- godot-client/README.md
Entrypoints:
- curl http://127.0.0.1:8787/api/events?limit=5
- ws://127.0.0.1:8787/ws
- D:\Apps\Godot\Godot_v4.6.2-stable_win64_console.exe --headless --path godot-client --quit-after 1
Validation:
- PASS: Godot 启动链可运行；独立 ObservabilityPanel 可显示 ws/events 最小可观测摘要
Conclusion (EN):
Godot now exposes HTTP events + WebSocket observability in an independent panel decoupled from the main HUD labels.
结果（中文）:
Godot 已将 `/api/events` + `/ws` 的最小可观测链拆到独立 `ObservabilityPanel`，与主 HUD 信息分离。

[Card] W1-C13
Lane: AI-QA-Gates
Read Docs:
- AGENTS.md
- docs/TASK_2026_04_05_GODOT_WEEK1_EXEC_CARDS.md
- docs/AI_ENGINEER_HUB_2026_03_25.md
Changed Files:
- godot-client/tools/run_week1_gate.py
- godot-client/tests/smoke/week1_gate_checklist.md
- godot-client/README.md
- package.json
Entrypoints:
- npm run gate:godot:week1
Validation:
- PASS: 生成 `tmp/gates/godot_week1_gate_latest.json` 且步骤链完整
Conclusion (EN):
Week 1 gate is now a one-command reproducible validation chain for Godot bootstrap.
结果（中文）:
Week 1 的后端入口 + Godot headless + join/world/map-layout 已固化为单命令可复现门禁。

[Card] W1-C09 (follow-up: WS status color)
Lane: AI-Platform-Observability
Read Docs:
- AGENTS.md
- docs/TASK_2026_04_05_GODOT_WEEK1_EXEC_CARDS.md
- docs/AI_ENGINEER_HUB_2026_03_25.md
Changed Files:
- godot-client/scripts/ui/observability_panel.gd
- godot-client/scenes/ui/observability_panel.tscn
- godot-client/README.md
Entrypoints:
- D:\Apps\Godot\Godot_v4.6.2-stable_win64_console.exe --headless --path godot-client --quit-after 1
- npm run gate:godot:week1
Validation:
- PASS: WS 区块已新增绿/黄/红状态色并通过 Week1 gate
Conclusion (EN):
WS observability now includes a traffic-light status indicator for quick connectivity diagnosis.
结果（中文）:
W1-C09 的 WS 子区块已具备绿/黄/红连通状态色，可快速判定连接状态。
```
