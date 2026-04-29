# AGENTS 现行执行版（2026-04）

## 1. 这份文件的作用

这是当前唯一执行口径，用于覆盖 2026-03 历史提示词中已过时部分。  
当与历史文档冲突时，以本文件为准。

当前原生 SLG 主线默认入口：

- [Codex 主线记忆锚点](../CODEX.md)
- [原生 SLG正式主线文档](NATIVE_SLG_MAINLINE_INDEX.md)
- [原生 SLG正式组件文档](NATIVE_SLG_COMPONENT_ARCHITECTURE.md)

涉及世界地图 `world cell / footprint / placement / city-resource overlap / 资源地与城池占地关系` 的任务，必须补读：

- [World Cell 分层底盘 / 建筑绑定正式执行计划](WORLD_CELL_LAYERED_BASE_BINDING_EXECUTION_PLAN_2026_04_23.md)
- [World Cell Footprint / Placement Contract](WORLD_CELL_FOOTPRINT_PLACEMENT_CONTRACT_2026_04_23.md)

## 2. 项目初衷（不可丢）

我们做这个项目的根因不是“做一个普通策略游戏”，而是：

1. 让真人玩家负责战略意志与组织决策。
2. 让 AI 在同一 SLG 世界里像玩家一样执行、协作、博弈。
3. 把“同盟组织能力”结构化、工具化、可解释化，而不是靠 OCR/模拟点击外挂。

一句话：**AI 原生同盟战争（SLG + AI）**，核心是“人定战略，AI执行组织”。

## 3. 当前阶段判断（修正后）

1. 整项目阶段：**完善开发阶段**（不是整项目 MVP 阶段）。
2. 当前前端主线：**原生 SLG 主壳 / 主城页 / 大地图入口**，先做原生结构，再接 AI 变量。
3. 后端规则引擎 + AI 闭环：是主资产，继续扩展，不重做。
4. `UI Preview Sandbox`：降级为桥接参考与验证工具，不再作为默认产品入口。

## 4. 后端当前真实逻辑（基于全量读取）

本轮已做程序化全量读取：

- `server/src`：74 个 `.ts` 文件
- `shared`：39 个 `.ts` 文件
- 快照：`tmp/backend_server_src_full_index_2026_04_09.json`
- 快照：`tmp/backend_shared_full_index_2026_04_09.json`
- 路由清单：`tmp/backend_routes_inventory_2026_04_09.json`

主干能力确认：

1. Authoritative World Loop：`WorldService` 持有世界推进、命令执行、地图布局、存档与回放链。
2. Planning 链：`PlanningService` + `CommanderAgent` + `PlanningJobMachine` 已接入真实规划与守卫。
3. General/Reflect/Memory：`GeneralAgent`、`GeneralProfileStore`、`ReflectService` 形成执行后复盘与记忆写回。
4. Session Autonomy：`SessionManager` + `/api/session/*` 支持 L1/L2/L3 状态与心跳退化。
5. Doctrine 配置：`FactionConfigStore` + `/api/faction/:id/*` 可配置 doctrine/model。
6. 实时可观测：`/ws` + `/api/events` + `/api/narratives` 可供 Godot HUD 观测。
7. V2 玩法链：`/api/v2/*` 包含招募、升星、编组、同盟与状态快照。
8. MCP 工具：`server/src/mcp/gameServer.ts` 通过 HTTP 回调后端 API。

## 4.1 后端容量/并发警戒（必须保留）

1. `Godot UI` 继续收口成 `壳 + 子页 + 共享状态`，只代表前端组织方式更稳，不代表服务器已经证明可承压几千真人 + AI。
2. 当前代码事实仍然是：`WorldService` 单进程 authoritative 写链 + `world mutation lock`，`SessionManager` 以内存 `Map` 为主并落盘到 `tmp/session_state.json`，`/ws` 广播基于单机内存客户端集合遍历。
3. 本轮未看到通用 HTTP 限流/节流中间层；`tmp/world_save_slots.json`、`tmp/world_snapshot.json` 已经是大体量持久化文件。
4. 后续 AI 禁止写出“现在不用担心高并发 / 限速限流 / 性能 / 服务器爆炸”之类结论；除非先补正式压测、广播预算、AI 配额、限流策略，并给出可复现验证结果。

## 5. 当前执行优先级（2026-04）

1. 默认先读原生 SLG 主线文档包：明确页面结构、AI 插入点、保留/冻结边界。
2. Godot 正式入口优先：`project.godot -> scenes/app/main.tscn -> scripts/app/main.gd`。
3. 第一阶段代码目标：主城常驻壳层、大地图入口、观测面板、主城业务态最小闭环。
4. 后端与共享契约只做稳态增强，不重写 authoritative 主干。
5. `UI Preview Sandbox` 只作为桥接验证链，不再牵引产品默认路线。

## 6. 工期口径（修正）

1. 默认按“半天 ~ 1 天/卡”拆分。
2. 仅跨模块联调与回归门禁，才使用多日批次估算。
3. 没有正式入口命令与验证结果的项，不算完成。

## 6.1 “继续”离线续跑协议（自动执行）

当用户只下达“继续”时，按以下默认策略执行，不等待额外指令：

1. 继承上一轮已确认目标与约束（优先处理未完成项）。
2. 从“当前主链收益最高 + 风险最低”的下一卡开始推进。
3. 若存在并行候选，优先选择：
   - 能产生可复现验证结果的项
   - 能减少后续返工的项（契约稳定、文档口径统一、门禁修复）
4. 每轮至少输出一条“通过项/风险项/阻塞项/下一步”闭环。
5. 只有在无法安全推断目标时，才回问用户。

## 7. 固定交付约束

每次交付必须包含：

1. 读取的文档路径
2. 修改文件清单
3. 复用的正式入口命令
4. 验证结果与结论

禁止只给计划不落地，至少要有一条可复现验证链。


## 7.1 单窗口多子代理固定规则（防重复/防混乱）

### 9.1 触发条件（何时必须开子代理）

坚持“单窗口主线程 + 多子代理并行”，避免多 AI 窗口重复施工。

满足任一条件时，主代理应创建子代理并行执行：

1. 任务可拆为 2 个及以上互不阻塞子任务（如：代码实现 + 文档同步 + 门禁验证）。
2. 存在明确模块边界，且每个子任务可绑定独立文件白名单。
3. 需要同时进行多源事实收集（代码检索、日志核对、资产盘点）且互不改写同一文件。
4. 主链目标是“当轮可交付”，并行可显著缩短关键路径。

以下场景不建议开子代理：

1. 仅 1 个小文件快速修订。
2. 强顺序依赖任务（后一步完全依赖前一步产物）。
3. 文件写入边界无法定义，容易出现交叉覆盖。

### 9.2 子代理白名单（必须先声明后动手）

每个子代理开工前必须提交并锁定以下信息：

1. `module_id`：所属模块（如 `M18`、`M16`）。
2. `docs_read_list`：本子任务先读文档路径（未读取不得修改）。
3. `file_whitelist`：允许改动的文件清单（仅可改白名单内文件）。
4. `official_entrypoints`：复用的正式入口命令（如 `npm run build`、`npm run gate:ai:trio`）。

白名单边界建议：

1. Docs 子代理：仅 `docs/**`（必要时包含 `README.md`）。
2. Godot 子代理：仅 `godot-client/**` 与其对应文档。
3. Backend 子代理：仅 `server/**`、`shared/**` 与其对应文档。
4. Gate 子代理：仅 `server/src/evals/**`、workflow 与门禁文档。

跨模块改动必须回报主代理审批后再执行。

### 9.3 统一验收模板（每个子代理必须按此交付）

每个子代理完成后，必须按以下模板回传：

1. 读取的文档路径：
2. 修改文件清单：
3. 复用的正式入口命令：
4. 验证结果与结论：

并附至少 1 条可复现验证链；禁止“只给计划不落地”。

主代理汇总时统一使用：

1. 通过项
2. 风险项
3. 阻塞项
4. 下一步

### 9.4 冲突处理（并行写入冲突的唯一口径）

1. 子代理之间发生同文件冲突时，主代理拥有最终仲裁权。
2. 优先级顺序：契约/Schema（M14） > 规则引擎约束（M02） > 业务实现 > 文档表述。
3. 若文档口径与代码事实冲突，以“可验证代码事实 + 正式入口验证结果”为准。
4. 若正式链不可用，方可在 `tmp/` 放置临时验证脚本，并标注“临时验证、不可作为正式交付入口”与清理计划。
5. 未通过统一验收模板的子代理结果，不得合并入主交付。


## 8. 现行必读入口

1. [NATIVE_SLG_MAINLINE_INDEX.md](NATIVE_SLG_MAINLINE_INDEX.md)
2. [NATIVE_SLG_COMPONENT_ARCHITECTURE.md](NATIVE_SLG_COMPONENT_ARCHITECTURE.md)
3. [../CODEX.md](../CODEX.md)
4. [AI_QUICK_NAV_INDEX_2026_04_10.md](AI_QUICK_NAV_INDEX_2026_04_10.md)
5. [../README.md](../README.md)
6. [../godot-client/README.md](../godot-client/README.md)
7. [NATIVE_SLG_MAINLINE_INDEX_2026_04_16.md](NATIVE_SLG_MAINLINE_INDEX_2026_04_16.md)
8. [NATIVE_SLG_RESET_PLAN_2026_04_16.md](NATIVE_SLG_RESET_PLAN_2026_04_16.md)
9. [NATIVE_SLG_PAGE_STRUCTURE_2026_04_16.md](NATIVE_SLG_PAGE_STRUCTURE_2026_04_16.md)
10. [AI_PHASE1_INSERTION_POINTS_2026_04_16.md](AI_PHASE1_INSERTION_POINTS_2026_04_16.md)
11. [CODE_MAINLINE_KEEP_FREEZE_BRIDGE_2026_04_16.md](CODE_MAINLINE_KEEP_FREEZE_BRIDGE_2026_04_16.md)
12. [PROJECT_EVOLUTION_NARRATIVE_2026_04_09.md](PROJECT_EVOLUTION_NARRATIVE_2026_04_09.md)
13. [AI_NATIVE_SLG_ALIGNMENT_AUDIT_2026_04_10.md](AI_NATIVE_SLG_ALIGNMENT_AUDIT_2026_04_10.md)
14. [AI_BACKEND_LOGIC_DEEP_READ_BATCH2_2026_04_09.md](AI_BACKEND_LOGIC_DEEP_READ_BATCH2_2026_04_09.md)
15. [TASK_2026_04_05_GODOT_WEEK1_EXEC_CARDS.md](TASK_2026_04_05_GODOT_WEEK1_EXEC_CARDS.md)
16. [TASK_2026_04_09_AI_WEEK2_AUTONOMOUS_EXEC_CARDS.md](TASK_2026_04_09_AI_WEEK2_AUTONOMOUS_EXEC_CARDS.md)
17. [SEMANTIC_NEUTRALIZATION_GUIDE_2026_03_29.md](SEMANTIC_NEUTRALIZATION_GUIDE_2026_03_29.md)
18. [DOCS_CLEANUP_DECISION_BOARD_2026_04_09.md](DOCS_CLEANUP_DECISION_BOARD_2026_04_09.md)
19. [AI_LOGIC_ARCHITECTURE_STATE_2026_04_09.md](AI_LOGIC_ARCHITECTURE_STATE_2026_04_09.md)
20. [AGENTS_HISTORY_2026_03.md](AGENTS_HISTORY_2026_03.md)
