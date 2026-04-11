# 项目发展脉络说明（2026-04-09）

## 0. 文档目标（给人和 AI 共读）

这份文档不是功能清单，而是回答四个核心问题：

1. 项目一开始到底在做什么。
2. 中间为什么发生方向变化（尤其是 Unity -> Godot）。
3. 现在代码主链到底是什么状态。
4. 下一步该怎么推进，避免重复返工。

> 口径约束：本说明以仓库内“文档证据 + 代码证据”为准，不凭口述猜测。

---

## 1. 一句话结论（先给结论）

这个项目的真实演化路径是：

**先以“真人定战略、AI 组织执行”的 AI 原生 SLG 愿景立项，随后在 Unity 地图链路经历高频返工并倒逼架构重心后移到“后端规则引擎 + AI 闭环”，再于 2026-03-29 明确 Godot 主链；当前（2026-04-09）整项目处于完善开发阶段，Godot 迁移子项目已完成 Week2 收尾并转入“后端 AI 逻辑深读 + 脉络重构”批次。**

## 1.1 项目初衷与构思（补齐）

项目初衷不是“给普通 SLG 加 AI 辅助”，而是构思一种新系统：

1. 真人玩家负责战略意志、组织管理和优先级。
2. AI 像玩家一样在同一 SLG 世界里执行侦察、行军、驻防、协同、博弈。
3. 后端规则引擎负责最终裁决，AI 决策必须可追溯、可解释、可复盘。

这决定了项目根方向是 **AI 原生同盟战争（SLG + AI）**，不是外挂式代操作路线。

---

## 2. 证据读取范围（本轮已读）

### 2.1 历史/治理文档

- `docs/archive/HANDOFF_2026_03_17_EDITOR_SESSION.md`
- `docs/archive/HANDOFF_2026_03_18.md`
- `docs/archive/HANDOFF_2026_03_19.md`
- `docs/archive/HANDOFF_STZB_REVERSE_COMPLETE.md`
- `docs/P0_PLAYABLE_ALPHA_EXECUTION_PLAN.md`
- `docs/CODE_SPLIT_PLAN_M01_M18_2026_03_26.md`
- `docs/CODE_SPLIT_EXEC_ACCEPTANCE_M01_M18_2026_03_26.md`
- `docs/ACCEPTANCE_NIGHTLY_2026_03_27_0030.md`
- `docs/ACCEPTANCE_NIGHTLY_2026_03_27_0105.md`
- `docs/SEMANTIC_NEUTRALIZATION_GUIDE_2026_03_29.md`
- `docs/CHANGELOG_SEMANTIC_NEUTRALIZATION.md`
- `docs/00_ENGINEER_START_HERE_2026_03_29.md`
- `docs/TASK_2026_04_04_AB_FRONTEND_BACKEND_001.md`
- `docs/TASK_2026_04_05_GODOT_WEEK1_EXEC_CARDS.md`
- `docs/PROJECT_RUNTIME_BASELINE_2026_03_25.md`
- `docs/AI_ENGINEER_HUB_2026_03_25.md`
- `AGENTS.md`
- `README.md`
- `godot-client/README.md`

### 2.2 代码证据（当前主链）

- `server/src/app.ts`
- `server/src/application/world/WorldService.ts`
- `server/src/application/planning/PlanningService.ts`
- `server/src/agents/commander/CommanderAgent.ts`
- `server/src/agents/general/GeneralAgent.ts`
- `server/src/agents/general/GeneralProfileStore.ts`
- `server/src/agents/reflect/ReflectService.ts`
- `server/src/ws/GameWebSocket.ts`
- `server/src/mcp/gameServer.ts`
- `shared/domain/rules.ts`
- `shared/schemas/planning.ts`
- `godot-client/scripts/app/main.gd`
- `godot-client/scripts/map/map_grid.gd`
- `godot-client/scripts/infra/observability/observability_bridge.gd`
- `godot-client/scripts/ui/observability_panel.gd`

### 2.3 快速跳转（关系图友好）

- [AGENTS.md](../AGENTS.md)
- [README.md](../README.md)
- [Godot Client README](../godot-client/README.md)
- [P0_PLAN](P0_PLAYABLE_ALPHA_EXECUTION_PLAN.md)
- [Semantic Neutralization Guide](SEMANTIC_NEUTRALIZATION_GUIDE_2026_03_29.md)
- [Task Week1 Cards](TASK_2026_04_05_GODOT_WEEK1_EXEC_CARDS.md)
- [AGENTS Current (2026-04)](AGENTS_EXECUTION_CURRENT_2026_04.md)
- [AGENTS History (2026-03)](AGENTS_HISTORY_2026_03.md)
- [Docs Cleanup Decision Board](DOCS_CLEANUP_DECISION_BOARD_2026_04_09.md)
- [Handoff 2026-03-17](archive/HANDOFF_2026_03_17_EDITOR_SESSION.md)
- [Handoff 2026-03-18](archive/HANDOFF_2026_03_18.md)
- [Handoff 2026-03-19](archive/HANDOFF_2026_03_19.md)

### 2.4 后端全量读取（本轮新增）

为避免“只看旧文档”导致误判，本轮新增了程序化全量读取：

1. `server/src` 全部 `.ts`：74 个文件
2. `shared` 全部 `.ts`：39 个文件
3. `/api/*` 与 `/ws` 路由清单：自动抽取并核对

索引快照：

- `tmp/backend_server_src_full_index_2026_04_09.json`
- `tmp/backend_shared_full_index_2026_04_09.json`
- `tmp/backend_routes_inventory_2026_04_09.json`
- `tmp/backend_logic_tagmap_2026_04_09.json`
- `tmp/backend_shared_tagmap_2026_04_09.json`

---

## 3. 时间线（起点 -> 转折 -> 当前）

| 时间 | 阶段 | 当时目标 | 发生了什么（落地） | 后续影响 |
| --- | --- | --- | --- | --- |
| 2026-03 上旬 | 立项目标定义期 | 定义 AI 原生同盟战争方向（真人战略 + AI 执行） | 形成项目问题定义、核心特色、分层自主权思路与规则引擎权威原则 | 决定项目不是“AI 代点操作”，而是“组织能力系统化” |
| 2026-03-17 | Unity 地图编辑器修复期 | 把地图编辑和渲染链路先跑起来 | 对 `MapEditorWindow` 进行缩放/平移/懒渲染/撤销等修复；地图从 106x106 提升到 380x270；暴露出 Unity 编辑器卡顿与重建代价高问题 | 明确“地图渲染链路是高返工点”，后续迁移动机增强 |
| 2026-03-18 | AI 主干闭环确认期 | 从“能画图”转向“能打仗、能复盘” | 文档明确 Commander/General/Reflect/Mem0/ModelGateway/MCP 主干已具备；指出若干未真正接入主流程的问题（状态机、外交约束、记忆隔离等） | 项目核心从编辑器体验转向后端规则与 AI 可解释闭环 |
| 2026-03-19 | 战斗与地图考古并行期 | 提升玩法可信度并整理遗留 | 战斗公式、武将属性、寻路、面板拆分推进；同步完成 Unity 地图系统“全量考古”文档化 | 团队开始把“历史资产”与“主链代码”分离管理 |
| 2026-03-25 ~ 2026-03-27 | 模块化与门禁期（M01-M19） | 让多人/多 AI 并行开发可控 | 建立 13 lane 协作模型、M01-M19 模块卡、统一 gate/验收入口，夜间验收文档持续沉淀 | 形成“正式入口 + 门禁证据”工程文化 |
| 2026-03-29 | 语义中立化与 Godot 主链切换 | 停止 Unity 术语和链路干扰 | `Semantic Neutralization` 明确 Godot 为主客户端；保留后端规则引擎与契约；移除一批旧 Unity 专用脚本/门禁口径 | 迁移策略从“引擎共存”转为“Godot First” |
| 2026-04-04 ~ 2026-04-09 | Godot Week 1 执行期（迁移子项目） | 打通 Godot 客户端最小闭环并建立性能/可观测基线 | AB 并行任务 + Week1 卡片落地；Godot 侧完成 join/world/map-layout、MapGrid 基础渲染、可见区域裁剪、hover、缩放拖拽、5秒性能基线与一键导出、WS/events 可观测接入 | 进入“完善开发 + 迁移收口并行”阶段 |
| 2026-04-09（同日） | Week2 主链收尾 + 深读切换 | 收拢 AI 主链稳定性与契约口径，避免“继续”执行漂移 | W2-C01~W2-C13 全部闭环：memory/provider 诊断、strict/fallback 可观测、queue/advance 分类统计、session/diplomacy controlMode、一体化 gate、v2 sync、Godot 标准化展示、MCP 文案清扫 | 迁移子项目从“功能补点”切换到“后端逻辑深读 + 文档治理” |
| 2026-04-10 | Batch3 稳定化起步（B3-C01~C06） | 缩短三件套执行时间并补齐 Save Slot 演进/健康/体积/一致性治理口径 | 完成 nightly 复用模式、三件套单摘要 JSON、Save Slot 版本演进/迁移策略（文档化）、runtime/nightly 健康纳管、soft/hard 体积门禁、soft 超限自动归档与锁治理门禁 | 形成“可快速巡检 + 可控迁移 + 最小一致性保障”的持续交付底盘 |

---

## 4. 各阶段细化说明（给新 AI 的背景语义）

### 4.1 起点并不是“做新引擎”，而是先救 Unity 地图链

早期核心矛盾是地图编辑与渲染性能。`HANDOFF_2026_03_17` 里大量工作都围绕：

- 大地图尺寸扩展后的渲染卡死。
- 重建 Tilemap 的高成本。
- 编辑器 GUI 状态异常导致的稳定性问题。

这解释了为什么后续你强调“地图反复返工、编辑器反复渲染、没有写好”。

### 4.2 中期主线转向“规则引擎 + AI 闭环”

`HANDOFF_2026_03_18` 与 `P0_PLAYABLE_ALPHA_EXECUTION_PLAN` 的共同点是：

- 把 `Perceive -> Order -> Execute -> Reflect` 作为主循环。
- 强调可解释性（战报/叙事/回放）与正式验证入口。
- 强调规则引擎是 authoritative，AI 不能直接改世界。

这一步决定了：未来换前端引擎是可行的，因为核心玩法语义已经在后端固化。

### 4.3 工程化阶段解决的是“多人并行不失控”

`CODE_SPLIT_PLAN/EXEC_ACCEPTANCE` + `AI_ENGINEER_ORG/HUB` 形成了统一协作协议：

- 13 lane 责任域。
- 模块白名单与验收入口。
- 交付必须可复现（不是只给计划）。

这也是你现在要求“十几个子代理身份、按卡推进”的来源。

### 4.4 Godot 切换不是情绪决策，是治理决策

`SEMANTIC_NEUTRALIZATION_GUIDE_2026_03_29` 明确了三件事：

1. 主客户端唯一有效链路切到 `godot-client/`。
2. 保留后端规则引擎和共享契约，不做玩法重写。
3. 历史 Unity 内容降级为归档语义，不再作为主链约束。

### 4.5 当前阶段是“整项目完善开发 + Godot 迁移收口”

`TASK_2026_04_05_GODOT_WEEK1_EXEC_CARDS` + `godot-client/README.md` 显示：

- 当前目标是稳定最小链路和可观测性。
- 重点是 join/world/map-layout + MapGrid + WS/events + 性能基线导出。
- 暂不扩张到复杂编辑器和非必要系统。
- 注意口径：这里的“最小链路”是 **Godot 迁移子范围最小化**，不是把整项目判定为 MVP 阶段。

---

## 5. 当前主链现状（代码证据口径）

### 5.1 后端（仍是价值核心）

| 能力 | 当前状态 | 代码证据 |
| --- | --- | --- |
| Authoritative world loop | 已在 `WorldService` 中统一处理世界推进与动作执行 | `server/src/application/world/WorldService.ts` |
| Tick 推进 + Reflect 回写 | `advanceTickAction` 后触发 reflect，写叙事与记忆统计 | `server/src/application/world/WorldService.ts`, `server/src/agents/reflect/ReflectService.ts` |
| 计划与守卫链 | Commander 侧有 guard/规范化链路，PlanningService 存在 | `server/src/agents/commander/CommanderAgent.ts`, `server/src/application/planning/PlanningService.ts` |
| 配置层可恢复 | doctrine/model、ai config、v2 基础状态已落盘并兼容 legacy/corrupt 恢复 | `server/src/application/faction/FactionConfigStore.ts`, `server/src/application/ai/AiConfigService.ts`, `server/src/application/v2/V2GameService.ts` |
| 启动自检告警 | `/api/health.persistence.alerts` + startup 分级日志已接入 | `server/src/app.ts` |
| 告警处置口径 | 持久化告警 runbook 已固化（阈值/处置/SLA） | `docs/PERSISTENCE_ALERT_RUNBOOK_2026_04_09.md` |
| Save Slot 恢复链 | `save/load slot` 已支持磁盘恢复与关停 flush，补齐 v1 envelope + legacy 兼容 + 跨环境迁移最小策略，并纳入 `health.persistence` 与 nightly 快照 | `server/src/application/world/WorldService.ts`, `server/src/app.ts`, `server/src/evals/runAiNightlyAcceptanceGate.ts`, `docs/modules_v2/M01.md`, `docs/PERSISTENCE_ALERT_RUNBOOK_2026_04_09.md` |
| Session 在线态恢复链 | Session 状态已最小落盘并可重启恢复（含 `/api/health.persistence.session` + nightly snapshot） | `server/src/multiplayer/SessionManager.ts`, `server/src/app.ts`, `server/src/evals/runAiNightlyAcceptanceGate.ts` |
| Nightly 验收汇总 | 已有统一 nightly gate 汇总主链稳定性 + 持久化健康 | `server/src/evals/runAiNightlyAcceptanceGate.ts`, `package.json` |
| Session 安全门禁 | `session_security_gate` 已独立成正式入口并并入 nightly（invalid/expired token 语义自动回归） | `server/src/evals/runSessionSecurityGate.ts`, `server/src/evals/runAiNightlyAcceptanceGate.ts` |
| HTTP API 面 | `/api/world` `/api/world/map-layout` `/api/events` `/api/narratives` `/api/session/*` `/api/ai/*` 等入口齐全 | `server/src/app.ts` |
| WS 增量推送 | `/ws` 支持订阅、tick_delta、battle_report、diplomacy_event、general_action | `server/src/ws/GameWebSocket.ts` |
| MCP 查询 | game MCP 服务存在并暴露多工具 | `server/src/mcp/gameServer.ts` |

后端主模块体量（按代码行统计）：

| 模块目录 | 文件数 | 代码行 | 说明 |
| --- | --- | --- | --- |
| `server/src/application/world` | 5 | 3150 | world loop、地图布局、动作执行、存档/回放 |
| `server/src/agents/general` | 8 | 2741 | general dispatch、聊天、档案与记忆接入 |
| `server/src/agents/reflect` | 2 | 786 | tick 后叙事生成、记忆写回、反馈更新 |
| `server/src/multiplayer` | 1 | 589 | session autonomy（L1/L2/L3）与心跳退化 |
| `server/src/ws` | 1 | 396 | `/ws` 订阅、delta 推送、战争迷雾过滤 |

后端 API 主入口（节选）：

| 分组 | 端点（节选） | 说明 |
| --- | --- | --- |
| World | `/api/world`, `/api/world/map-layout`, `/api/world/action` | 世界读取、地图布局、动作推进 |
| Planning | `/api/planning/create` | 规划入口 |
| Observability | `/api/events`, `/api/events/stream`, `/api/narratives` | 事件与叙事读链 |
| Session | `/api/session/join`, `/api/session/heartbeat`, `/api/session/runtime` | 人机控制边界与自主权状态 |
| AI/Faction | `/api/ai/config`, `/api/ai/models`, `/api/faction/:id/doctrine` | 模型与 doctrine 配置 |
| V2 | `/api/v2/recruit`, `/api/v2/alliance`, `/api/v2/state` | 招募、同盟、扩展玩法状态 |
| WS | `/ws` | `tick_delta` / `battle_report` / `diplomacy_event` / `general_action` |

### 5.2 Godot 客户端（Week 1 迁移子范围）

| 能力 | 当前状态 | 代码证据 |
| --- | --- | --- |
| 最小启动链 | 已有 main 场景和 runtime 标签链路 | `godot-client/scenes/app/main.tscn`, `godot-client/scripts/app/main.gd` |
| 地图基础渲染 | MapGrid 读取 `WorldStore.map_layout` 并绘制基础 tile | `godot-client/scripts/map/map_grid.gd` |
| 视口裁剪 | 绘制按可见区域裁剪，非全量暴力画图 | `godot-client/scripts/map/map_grid.gd` |
| 交互基础 | 缩放、拖拽、hover 信息可用 | `godot-client/scripts/map/map_grid.gd` |
| 性能基线 | 5秒平均 FPS/FrameMs HUD 显示 + F8/按钮导出 JSON 到 `tmp/` | `godot-client/scripts/map/map_grid.gd` |
| 可观测面板 | ObservabilityPanel 已覆盖 WS/Events/Runtime/CivilMemory 四个只读子区块；WS 有绿黄红状态色，Runtime/CivilMemory 持续轮询后端观测链 | `godot-client/scripts/infra/observability/observability_bridge.gd`, `godot-client/scripts/ui/observability_panel.gd`, `godot-client/scenes/ui/observability_panel.tscn` |

---

## 6. 目前正在经历什么（阶段判断）

当前不是“做更多新功能”，而是：

1. **迁移主干稳定化**：把 Unity 时代“最容易返工”的地图/观测链在 Godot 上先收口。
2. **证据化验收**：所有卡片交付都要求正式入口验证（headless/gate/curl/WS）。
3. **文档治理窗口期**：在确认发展脉络后，再决定 archive/root 的保留与清理边界。
4. **后端深化并行**：session/doctrine/v2/diplomacy 仍在持续完善，不是“只剩前端迁移”。
5. **Week2 已收尾**：当前重心转向“后端 AI 逻辑深读 + 演化脉络文档重构”，为后续自动续跑降歧义。
6. **Batch2 稳态增强已推进到 B2-C19**：配置层持久化、鲁棒性、安全化、健康诊断、启动分级告警、Save Slot 恢复、Session 在线态恢复、Session 安全门禁化、MCP/CLI 控制面模板化（含 move/upgrade/override）、告警 runbook 与 nightly 验收汇总已形成闭环。
7. **Batch3 已起步并完成 C01~C06**：三件套复用提速、聚合摘要、Save Slot 迁移策略、健康纳管、体积门禁、自动归档与锁治理已落地，后续执行可直接复用单入口与单摘要报告。

## 6.1 为什么现在不能再称为“整项目 MVP”

从代码与接口规模看，系统已经超出“最小可行验证”：

1. 后端存在多子域并行：world/planning/general/reflect/session/v2/diplomacy/mcp/ws。
2. API 已覆盖运行、配置、观测、会话、自主权、扩展玩法等多链路（不仅是 demo 接口）。
3. Session autonomy（L1/L2/L3）+ doctrine/faction 配置已经形成可运营逻辑，不是单次原型。
4. Godot 迁移当前采取“子范围最小化”是为了降风险，不代表整项目回到 MVP。

---

## 7. 未来推进建议（按务实优先级）

### 7.1 近期（按卡片：0.5 天 ~ 1 天/卡）

1. 固化 Week2 收尾事实：`TASK_2026_04_09_AI_WEEK2_AUTONOMOUS_EXEC_CARDS.md` + `AI_ENGINEER_HUB` 双回写。
2. 深读后端 AI 主链并维持函数级文档：`AI_BACKEND_LOGIC_DEEP_READ_BATCH2_2026_04_09.md`。
3. 保持“前端迁移不改后端语义”：避免在 Godot 侧引入 authoritative 分支。
4. 完成文档治理分层：主链文档 / 历史归档 / 待删除候选三层。

### 7.2 中期（按批次：2-5 天/批）

1. 在 Week2 已闭环基础上，进入 Batch2/Batch3 卡片化推进（仍保持白名单机制）。
2. 继续补齐可观测闭环：WS 断线恢复指标、事件对账、关键路径时延。
3. “内存态配置 + Save Slot + Session 在线态恢复 + Session 鉴权/token 生命周期 + Session 安全 gate + 操作面模板层”主项已完成；Save Slot 现已进入 health/gate + 自动归档 + 锁治理阶段，中期优先补“归档恢复演练 SOP”，再扩张新玩法。

### 7.3 远期（按里程碑，不强绑周数）

1. 将 Doctrine、General 身份演化、外交层推进到可玩深度。
2. 基于当前后端契约推进多人协作与 AI 自主层级，不回退到“截图/OCR/点击器”路线。

---

## 8. 给后续 AI 的推荐阅读顺序（最短上手路径）

1. `docs/AI_QUICK_NAV_INDEX_2026_04_10.md`（3-5 分钟快速定位）
2. `AGENTS.md`（硬规则与文档导航）
3. `docs/AGENTS_EXECUTION_CURRENT_2026_04.md`（当前执行口径）
4. `docs/AI_BACKEND_LOGIC_DEEP_READ_BATCH2_2026_04_09.md`（后端函数级深读）
5. `docs/PROJECT_RUNTIME_BASELINE_2026_03_25.md`（运行基线）
6. `docs/SEMANTIC_NEUTRALIZATION_GUIDE_2026_03_29.md`（Godot 主链口径）
7. `docs/TASK_2026_04_05_GODOT_WEEK1_EXEC_CARDS.md` + `docs/TASK_2026_04_09_AI_WEEK2_AUTONOMOUS_EXEC_CARDS.md`（执行面）
8. `README.md` + `godot-client/README.md`（入口命令）
9. `server/src/app.ts` + `server/src/application/world/WorldService.ts`（后端主流程）
10. `godot-client/scripts/app/main.gd` + `godot-client/scripts/map/map_grid.gd`（客户端主流程）
11. 需要追溯历史再读：`docs/AGENTS_HISTORY_2026_03.md` + `docs/archive/HANDOFF_2026_03_17~03_19*.md`

---

## 9. 清理 docs 前置规则（先立规，再动刀）

在这份脉络文档形成之前，不应先删除 archive/root 的孤立文档。  
后续清理建议按以下顺序执行：

1. 先标注“主链必读集合”（keep）。
2. 再标注“历史证据集合”（archive keep）。
3. 最后只删除“无引用、无历史价值、与当前主链语义冲突且已有替代”的文档。

> 当前结论：**先完成脉络说明，再执行清理**，这是为了避免把关键历史上下文误删。

## 9.1 图谱现状快照（2026-04-09 v2）

1. docs markdown 总数：69
2. 图谱孤立文档：57
3. 已形成连接核心：
   - `PROJECT_EVOLUTION_NARRATIVE_2026_04_09.md`
   - `AGENTS_EXECUTION_CURRENT_2026_04.md`
   - `AGENTS_HISTORY_2026_03.md`

说明：

- 现阶段先做“主链文档互链补齐”，再做批量删除更稳妥。
- 图谱数据见 `tmp/docs_graph_snapshot_2026_04_09_v2.json`。

---

## 10. 附录：本次分析产出的索引快照

- `tmp/timeline_keydocs_snapshot_2026_04_09.json`
- `tmp/code_capabilities_snapshot_2026_04_09.json`
- `tmp/timeline_evidence_lines_2026_04_09.json`
- `tmp/timeline_evidence_preview_2026_04_09.txt`
- `tmp/backend_server_src_full_index_2026_04_09.json`
- `tmp/backend_shared_full_index_2026_04_09.json`
- `tmp/backend_routes_inventory_2026_04_09.json`
- `tmp/backend_logic_tagmap_2026_04_09.json`
- `tmp/backend_shared_tagmap_2026_04_09.json`
- `tmp/docs_graph_snapshot_2026_04_09_v2.json`
- `docs/AI_BACKEND_LOGIC_DEEP_READ_BATCH2_2026_04_09.md`
