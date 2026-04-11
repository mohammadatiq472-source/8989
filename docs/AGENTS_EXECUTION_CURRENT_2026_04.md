# AGENTS 现行执行版（2026-04）

## 1. 这份文件的作用

这是当前唯一执行口径，用于覆盖 2026-03 历史提示词中已过时部分。  
当与历史文档冲突时，以本文件为准。

## 2. 项目初衷（不可丢）

我们做这个项目的根因不是“做一个普通策略游戏”，而是：

1. 让真人玩家负责战略意志与组织决策。
2. 让 AI 在同一 SLG 世界里像玩家一样执行、协作、博弈。
3. 把“同盟组织能力”结构化、工具化、可解释化，而不是靠 OCR/模拟点击外挂。

一句话：**AI 原生同盟战争（SLG + AI）**，核心是“人定战略，AI执行组织”。

## 3. 当前阶段判断（修正后）

1. 整项目阶段：**完善开发阶段**（不是整项目 MVP 阶段）。
2. Godot 重写：是迁移子项目，Week2 卡片已收尾，当前转入 Batch2 深读与稳态治理。
3. 后端规则引擎 + AI 闭环：是主资产，继续扩展，不重做。

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

## 5. 当前执行优先级（2026-04）

1. Week2 收尾台账优先：确保 W2-C01~W2-C13 在卡片、Hub、模块卡三处口径一致。
2. 转入后端深读批次：以 `AI_BACKEND_LOGIC_DEEP_READ_BATCH2_2026_04_09.md` 作为当前主读底稿。
3. 后端只做“稳态增强”，不破坏契约语义，不引入前端 authoritative 分支。
4. 文档治理先补脉络再清理：先保留证据链，再删孤立旧文档。
5. 多子代理协作继续执行，但严格白名单与验收回传格式。

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

## 8. 现行必读入口

1. [AI_QUICK_NAV_INDEX_2026_04_10.md](AI_QUICK_NAV_INDEX_2026_04_10.md)
2. [PROJECT_EVOLUTION_NARRATIVE_2026_04_09.md](PROJECT_EVOLUTION_NARRATIVE_2026_04_09.md)
3. [AI_BACKEND_LOGIC_DEEP_READ_BATCH2_2026_04_09.md](AI_BACKEND_LOGIC_DEEP_READ_BATCH2_2026_04_09.md)
4. [TASK_2026_04_09_AI_WEEK2_AUTONOMOUS_EXEC_CARDS.md](TASK_2026_04_09_AI_WEEK2_AUTONOMOUS_EXEC_CARDS.md)
5. [TASK_2026_04_05_GODOT_WEEK1_EXEC_CARDS.md](TASK_2026_04_05_GODOT_WEEK1_EXEC_CARDS.md)
6. [SEMANTIC_NEUTRALIZATION_GUIDE_2026_03_29.md](SEMANTIC_NEUTRALIZATION_GUIDE_2026_03_29.md)
7. [DOCS_CLEANUP_DECISION_BOARD_2026_04_09.md](DOCS_CLEANUP_DECISION_BOARD_2026_04_09.md)
8. [AI_LOGIC_ARCHITECTURE_STATE_2026_04_09.md](AI_LOGIC_ARCHITECTURE_STATE_2026_04_09.md)
9. [../README.md](../README.md)
10. [../godot-client/README.md](../godot-client/README.md)
11. [AGENTS_HISTORY_2026_03.md](AGENTS_HISTORY_2026_03.md)
