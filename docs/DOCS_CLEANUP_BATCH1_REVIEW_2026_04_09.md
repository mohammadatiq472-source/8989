# Docs 清理批次审计 Batch1（2026-04-09）

## 1. 范围

基于 `tmp/docs_graph_snapshot_2026_04_09_v2.json` 的孤立文档集合，先做首批审计（不直接删除）。

快速跳转：

- [DOCS_CLEANUP_DECISION_BOARD_2026_04_09.md](DOCS_CLEANUP_DECISION_BOARD_2026_04_09.md)
- [PROJECT_EVOLUTION_NARRATIVE_2026_04_09.md](PROJECT_EVOLUTION_NARRATIVE_2026_04_09.md)
- [AGENTS_EXECUTION_CURRENT_2026_04.md](AGENTS_EXECUTION_CURRENT_2026_04.md)

## 2. 审计规则

1. 若文档属于执行主链/历史证据链，标记“保留”。
2. 若文档被新文档明确替代，标记“候选删除”。
3. 若语义仍有参考价值但当前不用，标记“归档保留”。

## 3. Batch1 清单（首批 15）

| 文档 | 图谱状态 | 结论 | 理由 |
| --- | --- | --- | --- |
| `docs/AI_ENGINEER_ORG_2026_03_25.md` | 孤立 | 保留 | 多 lane 组织结构仍在使用 |
| `docs/AI_ENGINEER_HUB_2026_03_25.md` | 孤立 | 保留 | 任务回传与工作日志主板仍有价值 |
| `docs/ARCHITECTURE_V2_MULTIPLAYER.md` | 孤立 | 保留 | 架构与机制设计说明，仍可追溯 |
| `docs/PROJECT_RUNTIME_BASELINE_2026_03_25.md` | 非孤立 | 保留 | 运行基线核心文档 |
| `docs/CODE_SPLIT_PLAN_M01_M18_2026_03_26.md` | 孤立 | 归档保留 | 工程分拆历史证据 |
| `docs/CODE_SPLIT_EXEC_ACCEPTANCE_M01_M18_2026_03_26.md` | 孤立 | 归档保留 | 验收历史证据 |
| `docs/ACCEPTANCE_NIGHTLY_2026_03_27_0030.md` | 孤立 | 归档保留 | gate 历史快照 |
| `docs/ACCEPTANCE_NIGHTLY_2026_03_27_0105.md` | 孤立 | 归档保留 | gate 历史快照 |
| `docs/AI_PARALLEL_WEEKLY_PLAN_2026_03_25.md` | 孤立 | 候选删除 | 周计划已过期，且无主链引用 |
| `docs/CROSS_AI_MESSAGE_BOARD.md` | 孤立 | 候选删除 | 旧协作文档，已被 Hub/Task 流程替代 |
| `docs/DOCS_GRAPH_AUDIT_2026_04_09.md` | 孤立 | 候选删除 | 已被 `v2` 图谱快照与决策板替代 |
| `docs/HARNESS_PROJECT_ISOLATED_SETUP_2026_03_26.md` | 孤立 | 归档保留 | 历史环境隔离策略，仍可排障参考 |
| `docs/ENGINE_DIRECTION_OPEN_SOURCE_AI.md` | 孤立 | 归档保留 | 引擎方向决策历史依据 |
| `docs/AI_PLAYER_AUDIT_REPORT.md` | 孤立 | 归档保留 | AI 层历史审计，仍有参考价值 |
| `docs/AI_PLAYER_THINKING_CHAIN.md` | 孤立 | 归档保留 | 设计语义参考，暂不删 |

## 4. 下一步执行建议

1. 对“候选删除”先做二次引用核验（README/现行执行版/脉络文档/任务卡）。
2. 若仍无引用，按每批 <= 10 文件执行删除并刷新图谱。
3. 每批删除后更新：
   - `docs/DOCS_CLEANUP_DECISION_BOARD_2026_04_09.md`
   - handoff 日志
