# TASK 003 - AI 主链 Week2 自主续跑执行卡（2026-04-09）

## 0. 目标与使用方式

这份卡用于解决“离线只下达`继续`”时的执行歧义。

执行策略：

1. 主代理按本卡优先级自动分配下一步。
2. 子代理严格按 lane 白名单改动，禁止跨模块串改。
3. 每卡必须有正式入口验证，不接受“只给计划”。

## 1. 必读顺序（开工前）

1. `AGENTS.md`
2. `docs/AGENTS_EXECUTION_CURRENT_2026_04.md`
3. `docs/AI_LOGIC_ARCHITECTURE_STATE_2026_04_09.md`
4. `docs/AI_ENGINEER_ORG_2026_03_25.md`
5. `docs/MODULE_INDEX_2026_03_25_V2.md`
6. 对应 `docs/modules_v2/Mxx.md`

## 2. 主代理统一硬约束（验收口径）

1. 每卡产出必须包含：
   - 读取的文档路径
   - 修改文件清单
   - 复用的正式入口命令
   - 验证结果与结论
2. 正式链不可用才允许 `tmp/` 临时验证，且必须注明“临时验证、不可作为正式交付入口”。
3. 主代理每轮汇总固定四段：
   - 通过项
   - 风险项
   - 阻塞项
   - 下一步

## 3. Week2 优先级队列（主链导向）

## 3.1 P0（先做，直接降返工）

| Card ID | Lane | 模块 | 目标 | 白名单路径 | 正式验证入口 |
| --- | --- | --- | --- | --- | --- |
| W2-C01 | AI-Agent-ReflectMemory | M05 | 把长期记忆降级状态显式暴露到 observability（区分 Mem0 / InMemory） | `server/src/agents/memory/**`, `server/src/agents/reflect/**`, `server/src/routes/observability.ts`, `shared/contracts/game/**`, `shared/schemas/**`, `docs/modules_v2/M05.md` | `npm run start`, `curl /api/civil-memory`, `curl /api/events?limit=20` |
| W2-C02 | AI-Platform-ModelGateway | M10/M12 | 梳理网关严格模式与回退策略，补充可观测字段（strict/fallback cause） | `server/src/application/planning/**`, `server/src/infra/llm/**`, `server/src/routes/ai.ts`, `server/src/mcp/gameServer.ts`, `docs/modules_v2/M10.md`, `docs/modules_v2/M12.md` | `npm run start`, `curl /api/ai/logs?limit=20`, `npm run sim:quick` |
| W2-C03 | AI-BE-RuleState | M02/M19 | 对 `queuePlanExecutionAction` 与 `advanceTickAction` 增加冲突与失败分类统计字段，保证回放可追责 | `server/src/application/world/**`, `shared/domain/rules.ts`, `server/src/routes/world.ts`, `docs/modules_v2/M02.md`, `docs/modules_v2/M19.md` | `npm run test:world:mutation-lock`, `npm run sim:13factions` |
| W2-C04 | AI-Platform-Observability | M11 | 扩展 WS/Events 指标（连接数、订阅数、按势力分布、最近错误）并保持 Godot HUD 可消费 | `server/src/ws/**`, `server/src/routes/observability.ts`, `godot-client/scripts/infra/observability/**`, `godot-client/scripts/ui/**`, `docs/modules_v2/M11.md` | `npm run start`, `curl /api/events`, `npm run gate:godot:week1` |

## 3.2 P1（紧接 P0）

| Card ID | Lane | 模块 | 目标 | 白名单路径 | 正式验证入口 |
| --- | --- | --- | --- | --- | --- |
| W2-C05 | AI-Agent-General | M04 | 将领协商链（Negotiation inbox）最小持久化或恢复策略，避免服务重启即丢 | `server/src/agents/general/**`, `docs/modules_v2/M04.md` | `npm run start:clock`, `curl /api/generals`, `curl /api/events?limit=50` |
| W2-C06 | AI-Agent-GovDiplo | M06/M07/M08 | Session + Diplomacy 与 autonomy 状态的可解释回传（事件中附 controlMode） | `server/src/multiplayer/**`, `server/src/routes/session.ts`, `server/src/routes/diplomacy.ts`, `server/src/agents/commBus/**`, `server/src/agents/court/**`, `docs/modules_v2/M06.md`, `docs/modules_v2/M07.md`, `docs/modules_v2/M08.md` | `npm run test:session:manager`, `curl /api/session/runtime`, `curl /api/diplomacy/proposals` |
| W2-C07 | AI-Shared-Contracts | M14 | 收敛 AI 主链契约：为新增观测字段补齐 contract/schema + 兼容说明 | `shared/contracts/**`, `shared/schemas/**`, `docs/modules_v2/M14.md` | `npm run lint`, `npm run build` |
| W2-C08 | AI-QA-Gates | M18 | 新增一条“AI 主链稳定性门禁”（tick->plan->dispatch->reflect->events） | `server/src/evals/**`, `server/tests/**`, `package.json`, `docs/modules_v2/M18.md` | `npm run gate:phase5:hardening`, `npm run sim:13factions` |

## 3.3 P2（并行补强）

| Card ID | Lane | 模块 | 目标 | 白名单路径 | 正式验证入口 |
| --- | --- | --- | --- | --- | --- |
| W2-C09 | AI-BE-EntryRuntime | M01 | 统一路由返回错误码语义（400/409/500），减少客户端歧义 | `server/src/app.ts`, `server/src/routes/http.ts`, `server/src/routes/*.ts`, `docs/modules_v2/M01.md` | `npm run start`, `curl /api/health`, 核心路由错误分支手测 |
| W2-C10 | AI-BE-WorldMeta | M09/M13 | 校验 V2 与主世界链路的同步口径（资源结算、同盟状态快照） | `server/src/application/v2/**`, `server/src/application/world/**`, `server/src/routes/v2game.ts`, `docs/modules_v2/M09.md`, `docs/modules_v2/M13.md` | `npm run start`, `curl /api/v2/state`, `npm run sim:quick` |
| W2-C11 | AI-FE-CommandSurface | M15/M17 | Godot 侧把 runtime/session/autonomy 信息展示标准化（仅消费后端，不做前端权威分支） | `godot-client/scenes/app/**`, `godot-client/scenes/ui/**`, `godot-client/scripts/app/**`, `godot-client/scripts/ui/**`, `docs/modules_v2/M15.md`, `docs/modules_v2/M17.md` | `D:\\Apps\\Godot\\Godot_v4.6.2-stable_win64_console.exe --headless --path godot-client --quit-after 1`, `npm run gate:godot:week1` |
| W2-C12 | AI-FE-MapSurface | M16 | 在不改语义前提下继续优化 MapGrid 大图渲染（可见区域、采样、统计） | `godot-client/scripts/map/**`, `godot-client/scenes/map/**`, `docs/modules_v2/M16.md` | `npm run gate:godot:week1`, baseline JSON 导出对比 |
| W2-C13 | AI-Platform-ModelGateway | M12 | MCP 工具文案/注释编码清扫（仅文案层，不改 tool API 行为） | `server/src/mcp/gameServer.ts`, `docs/modules_v2/M12.md` | `npm run start`, MCP 工具 smoke（`health_check` / `get_world_summary`） |

## 4. 主代理自动续跑规则（针对“继续”）

当用户仅发送“继续”时，主代理按以下顺序执行：

1. 优先推进未完成的最低编号 P0 卡。
2. 若当前卡被阻塞，则切到同优先级下一卡并记录阻塞原因。
3. 每轮至少完成一个“可验证交付”（代码或文档，但必须有正式验证）。
4. 完成后回写：
   - `docs/AI_ENGINEER_HUB_2026_03_25.md` Work Log
   - 对应 `docs/modules_v2/Mxx.md` 验证摘要

## 5. 统一回传模板（复制即用）

```text
[Card] W2-Cxx
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

## 6. Week2 收尾台账（2026-04-09）

### 6.1 执行结果总览

| Card ID | 模块 | 状态 | 关键产出 | 验证摘要 |
| --- | --- | --- | --- | --- |
| W2-C01 | M05 | done | `/api/civil-memory` 暴露 Mem0/InMemory 降级诊断 | `npm run build` PASS；`/api/civil-memory` PASS；`/api/events` PASS |
| W2-C02 | M10/M12 | done | AI logs 增加 strict/fallback 字段并同步 MCP | `npm run build` PASS；`/api/ai/logs` PASS |
| W2-C03 | M02/M19 | done | queue/advance 失败与冲突分类统计写入事件元数据 | `npm run test:world:mutation-lock` PASS；`npm run sim:13factions` PASS |
| W2-C04 | M11 | done | WS 连接/订阅/势力分布/最近错误入 `/api/events` 并接 Godot HUD | `npm run build` PASS；`npm run gate:godot:week1` PASS |
| W2-C05 | M04 | done | Negotiation inbox 最小持久化与重启恢复 | `npm run build` PASS；`clock + /api/generals + /api/events` PASS |
| W2-C06 | M06/M07/M08 | done | Session + Diplomacy + 事件流统一 `controlMode` | `npm run test:session:manager` PASS；相关 route smoke PASS |
| W2-C07 | M14 | done | wsStats/session control-mode 契约与 schema 收敛 | `npm run build` PASS；session/events parse PASS |
| W2-C08 | M18 | done | 新增 AI 主链稳定性门禁（tick->dispatch->reflect->events） | `npm run gate:ai:mainline:stability` PASS |
| W2-C09 | M01 | done | 统一运行时错误码语义（400/409/500） | `npm run build` PASS；核心错误分支 smoke PASS |
| W2-C10 | M09/M13 | done | world <-> v2 同步链与 `/api/v2/state.sync` 快照 | `npm run build` PASS；`/api/v2/state` PASS |
| W2-C11 | M15/M17 | done | Godot runtime/session/autonomy 展示标准化 | Godot headless PASS；`npm run gate:godot:week1` PASS |
| W2-C12 | M16 | done | MapGrid 自适应采样 + 导出指标扩展 | Godot headless PASS；`npm run gate:godot:week1` PASS |
| W2-C13 | M12 | done | MCP 文案/注释编码清扫（不改 API 行为） | `npm run build` PASS；MCP stdio smoke PASS |

### 6.2 回写证据位置

1. `docs/AI_ENGINEER_HUB_2026_03_25.md` 已回写 W2-C01~W2-C13 工作日志。
2. `docs/modules_v2/M01~M19.md` 对应模块卡已补 Validation Update（按触达模块）。

### 6.3 Week2 收尾结论

1. Week2 13 张卡已完成，主链进入“稳态增强后”的文档重构与后端深读批次。
2. 已知非阻塞风险：
   - `npm run sim:quick` 在仓库既有 critical-gap 场景仍可能返回非零（不影响已验收卡的结论）。
   - `npm run lint` 受 `.obsidian/plugins/claudian/main.js` 外部脚本规则影响（已在 Work Log 标注）。

## 7. 转入下一批（后端 AI 逻辑深读 + 脉络文档重构）

| Batch2 Card | 目标 | 白名单路径 | 验证入口 |
| --- | --- | --- | --- |
| B2-C01 | 后端 AI 主链函数级深读（World/Planning/Commander/General/Reflect/Session/WS） | `server/src/**`, `shared/**`, `docs/AI_BACKEND_LOGIC_DEEP_READ_BATCH2_2026_04_09.md` | `rg` 代码索引 + 文档落地 |
| B2-C02 | 将 Week2 收尾事实回写到发展脉络文档（时间线与阶段判断） | `docs/PROJECT_EVOLUTION_NARRATIVE_2026_04_09.md` | 文档 UTF-8 回读校验 |
| B2-C03 | 更新现行执行入口，避免后续子代理继续依赖旧口径 | `docs/AGENTS_EXECUTION_CURRENT_2026_04.md` | Obsidian backlinks / docs files |
| B2-C04 | 回写 Hub 工作日志，形成“卡片 -> 深读 -> 脉络”闭环 | `docs/AI_ENGINEER_HUB_2026_03_25.md` | Work Log 条目可检索 |
| B2-C05 | 配置层持久化最小方案（doctrine/model + v2 基础状态）并接入关停 flush | `server/src/application/faction/FactionConfigStore.ts`, `server/src/application/ai/AiConfigService.ts`, `server/src/application/v2/V2GameService.ts`, `server/src/app.ts`, `docs/modules_v2/M08.md`, `docs/modules_v2/M09.md`, `docs/modules_v2/M10.md`, `docs/modules_v2/M13.md` | `npm run build`；`npm run start` + config/v2 持久化重启 smoke |
| B2-C06 | 持久化鲁棒性补强（version + legacy 兼容 + 损坏文件隔离恢复） | `server/src/application/faction/FactionConfigStore.ts`, `server/src/application/ai/AiConfigService.ts`, `server/src/application/v2/V2GameService.ts`, `docs/modules_v2/M08.md`, `docs/modules_v2/M09.md`, `docs/modules_v2/M10.md`, `docs/modules_v2/M13.md`, `docs/AI_ENGINEER_HUB_2026_03_25.md` | `npm run build`；legacy 格式加载 smoke；corrupt 文件隔离 smoke |
| B2-C07 | BYOK 持久化安全化（apiKey 加密落盘 + 明文禁落盘默认） | `server/src/application/faction/FactionConfigStore.ts`, `docs/modules_v2/M08.md`, `docs/modules_v2/M10.md`, `docs/AI_ENGINEER_HUB_2026_03_25.md` | `npm run build`；加密落盘 smoke；重启解密 smoke；错误密钥回退 smoke |
| B2-C08 | 持久化健康诊断输出（`/api/health.persistence`） | `server/src/app.ts`, `server/src/application/faction/FactionConfigStore.ts`, `server/src/application/ai/AiConfigService.ts`, `server/src/application/v2/V2GameService.ts`, `docs/modules_v2/M01.md`, `docs/modules_v2/M08.md`, `docs/modules_v2/M09.md`, `docs/modules_v2/M10.md`, `docs/modules_v2/M13.md`, `docs/AI_ENGINEER_HUB_2026_03_25.md` | `npm run build`；`npm run start` + `GET /api/health` 字段 smoke |
| B2-C09 | 启动自检 + 持久化分级告警（`/api/health.persistence.alerts` + startup 日志） | `server/src/app.ts`, `docs/modules_v2/M01.md`, `docs/modules_v2/M08.md`, `docs/modules_v2/M09.md`, `docs/modules_v2/M10.md`, `docs/modules_v2/M13.md`, `docs/AI_ENGINEER_HUB_2026_03_25.md` | `npm run build`；`PORT=8788 npm run start` + `GET /api/health` 告警字段 smoke；启动日志分级告警检查 |
| B2-C10 | 后端 AI 深读文档增量重构（函数级注意点 + 风险重排 + 脉络同步） | `docs/AI_BACKEND_LOGIC_DEEP_READ_BATCH2_2026_04_09.md`, `docs/PROJECT_EVOLUTION_NARRATIVE_2026_04_09.md`, `docs/AI_ENGINEER_HUB_2026_03_25.md` | `obsidian files folder='docs' ext=md`；`obsidian backlinks path='docs/AI_BACKEND_LOGIC_DEEP_READ_BATCH2_2026_04_09.md' total`；文档 UTF-8 回读校验 |
| B2-C11 | Save Slot 最小持久化（磁盘恢复 + 关停 flush） | `server/src/application/world/WorldService.ts`, `server/src/app.ts`, `docs/modules_v2/M01.md`, `docs/TASK_2026_04_09_AI_WEEK2_AUTONOMOUS_EXEC_CARDS.md`, `docs/AI_ENGINEER_HUB_2026_03_25.md`, `docs/AI_BACKEND_LOGIC_DEEP_READ_BATCH2_2026_04_09.md`, `docs/PROJECT_EVOLUTION_NARRATIVE_2026_04_09.md` | `npm run build`；`POST /api/save-slots/save` + 重启后 `GET /api/save-slots` 恢复 smoke；文档 UTF-8 回读校验 |
| B2-C12 | 持久化告警 Runbook（阈值 + 处置动作 + 值班口径）落地 | `docs/PERSISTENCE_ALERT_RUNBOOK_2026_04_09.md`, `docs/modules_v2/M01.md`, `docs/AI_BACKEND_LOGIC_DEEP_READ_BATCH2_2026_04_09.md`, `docs/PROJECT_EVOLUTION_NARRATIVE_2026_04_09.md`, `docs/AI_ENGINEER_HUB_2026_03_25.md` | `obsidian files folder='docs' ext=md`；`GET /api/health` 告警字段抽样核对；文档 UTF-8 回读校验 |
| B2-C13 | Nightly 汇总 gate（主链稳定性 + 持久化健康快照） | `server/src/evals/runAiNightlyAcceptanceGate.ts`, `package.json`, `docs/modules_v2/M18.md`, `docs/TASK_2026_04_09_AI_WEEK2_AUTONOMOUS_EXEC_CARDS.md`, `docs/AI_BACKEND_LOGIC_DEEP_READ_BATCH2_2026_04_09.md`, `docs/PROJECT_EVOLUTION_NARRATIVE_2026_04_09.md`, `docs/AI_ENGINEER_HUB_2026_03_25.md` | `npm run build`；`npm run gate:ai:nightly:acceptance`；检查 `tmp/gates/ai-nightly-acceptance/ai_nightly_acceptance_latest.json` |
| B2-C14 | Godot 只读接入补齐（`/api/events` + `/api/civil-memory` + `/api/session/runtime` HUD 合并观测，不引入前端权威分支） | `godot-client/scripts/infra/http/backend_api_client.gd`, `godot-client/scripts/infra/observability/observability_bridge.gd`, `godot-client/scripts/ui/observability_panel.gd`, `godot-client/scenes/ui/observability_panel.tscn`, `godot-client/scripts/app/main.gd`, `godot-client/README.md`, `docs/modules_v2/M05.md`, `docs/modules_v2/M11.md`, `docs/modules_v2/M15.md`, `docs/AI_BACKEND_LOGIC_DEEP_READ_BATCH2_2026_04_09.md`, `docs/PROJECT_EVOLUTION_NARRATIVE_2026_04_09.md`, `docs/AI_ENGINEER_HUB_2026_03_25.md` | `npm run build`；`D:\\Apps\\Godot\\Godot_v4.6.2-stable_win64_console.exe --headless --path godot-client --quit-after 1`；`npm run gate:godot:week1`；`GET /api/events|/api/civil-memory|/api/session/runtime` 抽样 smoke |
| B2-C15 | Session 在线态最小持久化/可靠恢复策略定义与实现（先边界后落地，已完成） | `server/src/multiplayer/SessionManager.ts`, `server/src/routes/session.ts`, `server/src/app.ts`, `docs/modules_v2/M08.md`, `docs/modules_v2/M01.md`, `docs/AI_BACKEND_LOGIC_DEEP_READ_BATCH2_2026_04_09.md`, `docs/PROJECT_EVOLUTION_NARRATIVE_2026_04_09.md`, `docs/AI_ENGINEER_HUB_2026_03_25.md` | `npm run build`；`npm run test:session:manager`；`PORT=879x npm run start + join/heartbeat/leave + 重启恢复 smoke` |
| B2-C16 | Session 鉴权与 token 生命周期治理（在已持久化基础上补安全边界，已完成） | `server/src/multiplayer/SessionManager.ts`, `server/src/routes/session.ts`, `server/src/routes/http.ts`, `shared/contracts/game/session.ts`, `shared/schemas/session.ts`, `server/tests/session_manager.test.ts`, `docs/modules_v2/M08.md`, `docs/modules_v2/M14.md`, `docs/AI_BACKEND_LOGIC_DEEP_READ_BATCH2_2026_04_09.md`, `docs/PROJECT_EVOLUTION_NARRATIVE_2026_04_09.md`, `docs/AI_ENGINEER_HUB_2026_03_25.md` | `npm run build`；`npm run test:session:manager`；`PORT=8796 SESSION_TOKEN_MAX_AGE_MS=60000 npm run start + join/heartbeat/runtime/autonomy` 安全边界 smoke |
| B2-C17 | AI 操作面纠偏：MCP + CLI 控制面扩展（从“读链”补到“可执行链”） | `server/src/mcp/gameServer.ts`, `godot-client/tools/slg_ops_cli.py`, `godot-client/README.md`, `docs/modules_v2/M12.md`, `docs/modules_v2/M15.md`, `docs/AI_NATIVE_SLG_ALIGNMENT_AUDIT_2026_04_10.md`, `docs/GODOT_MCP_CLI_CONTROL_SURFACE_2026_04_10.md`, `docs/AI_ENGINEER_HUB_2026_03_25.md` | `npm run build`；`npm run godot:ops:cli -- health/runtime/bootstrap-chain`；`D:\\Apps\\Godot\\Godot_v4.6.2-stable_win64_console.exe --headless --path godot-client --quit-after 1` |
| B2-C18 | Session 安全边界 gate 固化（独立 gate + nightly 并入） | `server/src/evals/runSessionSecurityGate.ts`, `server/src/evals/runAiNightlyAcceptanceGate.ts`, `package.json`, `docs/modules_v2/M18.md`, `docs/TASK_2026_04_09_AI_WEEK2_AUTONOMOUS_EXEC_CARDS.md`, `docs/AI_BACKEND_LOGIC_DEEP_READ_BATCH2_2026_04_09.md`, `docs/PROJECT_EVOLUTION_NARRATIVE_2026_04_09.md`, `docs/AI_ENGINEER_HUB_2026_03_25.md`, `docs/AI_QUICK_NAV_INDEX_2026_04_10.md` | `npm run build`；`npm run test:session:manager`；`npm run gate:session:security`；`npm run gate:ai:nightly:acceptance`；检查 `tmp/gates/session-security-gate/session_security_gate_latest.json` 与 nightly 报告 |
| B2-C19 | 操作面扩展最小卡（从“可执行链”补到“常用动作模板链”） | `server/src/mcp/gameServer.ts`, `godot-client/tools/slg_ops_cli.py`, `godot-client/scripts/app/main.gd`, `godot-client/scripts/ui/observability_panel.gd`, `docs/modules_v2/M12.md`, `docs/modules_v2/M15.md`, `docs/AI_NATIVE_SLG_ALIGNMENT_AUDIT_2026_04_10.md` | `npm run build`；`npm run godot:ops:cli -- world-action --action advanceTick`；`npm run gate:godot:week1`；动作事件回放核对 |
| B2-C20 | AI 执行回归脚本卡（模板动作剧本 + events/narratives 对账 + JSON 报告，已完成） | `godot-client/tools/slg_ops_cli.py`, `server/src/evals/runAiMainlineStabilityGate.ts`, `docs/modules_v2/M12.md`, `docs/modules_v2/M15.md`, `docs/AI_NATIVE_SLG_ALIGNMENT_AUDIT_2026_04_10.md`, `docs/AI_ENGINEER_HUB_2026_03_25.md` | `npm run build`；`npm run godot:ops:cli -- world-action-template --template advance_tick`；`npm run godot:ops:cli -- template-replay --scenario baseline_v1`；`GET /api/events?limit=30 + /api/narratives?limit=20` 对账；输出 `tmp/gates/ai_ops_template_replay_latest.json` |
| B2-C21 | 固定初始态回放夹具卡（收紧模板回放：全必选步骤 + fixture 预置 + 恢复链） | `server/src/application/world/WorldService.ts`, `server/src/routes/observability.ts`, `server/src/app.ts`, `server/src/evals/runAiMainlineStabilityGate.ts`, `godot-client/tools/slg_ops_cli.py`, `docs/modules_v2/M12.md`, `docs/modules_v2/M15.md`, `docs/modules_v2/M18.md` | `npm run build`；`npm run gate:ai:mainline:stability`；`npm run godot:ops:cli -- --base-url http://127.0.0.1:8799 template-replay --scenario baseline_v1`；检查 `fixture_slot_primed/loaded/restored` 全通过 |
| B2-C22 | nightly 汇总并入 fixture 回放显式断言卡（不再仅看 mainline exit） | `server/src/evals/runAiNightlyAcceptanceGate.ts`, `docs/modules_v2/M18.md`, `docs/TASK_2026_04_09_AI_WEEK2_AUTONOMOUS_EXEC_CARDS.md`, `docs/AI_ENGINEER_HUB_2026_03_25.md` | `npm run build`；`npm run gate:ai:nightly:acceptance`；检查报告 `templateReplayGate.fixtureChecksPassed=true`、`allStepsRequired=true` |
| B2-C23 | Batch2 最终归档卡（门禁三件套单入口 + 报告路径 + 排障入口单文档） | `package.json`, `docs/GATE_TRIO_HANDOFF_2026_04_10.md`, `docs/CLOSEOUT_B2_C23_2026_04_10.md`, `docs/modules_v2/M18.md`, `docs/TASK_2026_04_09_AI_WEEK2_AUTONOMOUS_EXEC_CARDS.md`, `docs/AI_QUICK_NAV_INDEX_2026_04_10.md`, `docs/AI_ENGINEER_HUB_2026_03_25.md` | `npm run build`；`npm run gate:ai:trio`；检查 nightly latest 中 `template_replay_*` 4 项为 true |

## 8. Batch2 执行进展快照（2026-04-10）

| Batch2 Card | 状态 | 关键结论 |
| --- | --- | --- |
| B2-C12 | done | 告警 runbook 已固化，值班处置口径可执行。 |
| B2-C13 | done | nightly 汇总门禁已并入主链稳定性与持久化快照。 |
| B2-C14 | done | Godot HUD 已读入 events/civil-memory/session runtime 最小观测链。 |
| B2-C15 | done | Session 在线态最小持久化已落地，重启恢复链可验证。 |
| B2-C16 | done | Session token 生命周期与鉴权边界已落地：`errorCode` + `tokenState` + `401` 语义 + 过期剔除。 |
| B2-C17 | done | MCP 与 CLI 控制面已扩展到 session/world action，可复现执行链已形成。 |
| B2-C18 | done | Session 安全边界已固化为独立 gate，并并入 nightly 自动验收；报告可机器读取。 |
| B2-C19 | done | 操作面已扩展为“模板执行层”：MCP/CLI 支持 move/upgrade/override 等模板动作，Godot Runtime 面板新增 lastAction 对账。 |
| B2-C20 | done | 模板动作剧本回归已固化：CLI `template-replay` + mainline gate 自动对账，并产出 `tmp/gates/ai_ops_template_replay_latest.json`。 |
| B2-C21 | done | 回放链已收紧为“固定初始态夹具 + 全必选步骤 + 默认 60s 回放超时下限”，并补齐 `/api/save-slots/fixture/prime` 正式入口。 |
| B2-C22 | done | nightly 已并入 fixture 回放显式断言：解析 `ai_ops_template_replay_latest.json` 并校验夹具三项 + 全必选步骤。 |
| B2-C23 | done | 已形成三件套门禁单入口 `gate:ai:trio`，并落地单文档交接入口 `GATE_TRIO_HANDOFF_2026_04_10.md`。 |

下一默认推进：已转入 `TASK_2026_04_10_AI_BATCH3_EXEC_CARDS.md`，当前默认执行 `B3-C02`。
