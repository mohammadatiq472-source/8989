# Docs 清理决策板（2026-04-09）

## 1. 目标

在不破坏项目上下文连续性的前提下，清理 docs 冗余文件。  
原则：先建立保留集合，再删除候选集合。

## 2. 数据来源

1. 图谱快照：`tmp/docs_graph_snapshot_2026_04_09_v2.json`
2. 后端全量读取：`tmp/backend_server_src_full_index_2026_04_09.json`
3. 项目脉络文档：`docs/PROJECT_EVOLUTION_NARRATIVE_2026_04_09.md`

快速跳转：

- [PROJECT_EVOLUTION_NARRATIVE_2026_04_09.md](PROJECT_EVOLUTION_NARRATIVE_2026_04_09.md)
- [AGENTS_EXECUTION_CURRENT_2026_04.md](AGENTS_EXECUTION_CURRENT_2026_04.md)
- [AGENTS_HISTORY_2026_03.md](AGENTS_HISTORY_2026_03.md)
- [DOCS_CLEANUP_BATCH1_REVIEW_2026_04_09.md](DOCS_CLEANUP_BATCH1_REVIEW_2026_04_09.md)

## 3. 当前保留集合（不可删）

### 3.1 执行主链（P0）

1. `docs/AGENTS_EXECUTION_CURRENT_2026_04.md`
2. `docs/PROJECT_EVOLUTION_NARRATIVE_2026_04_09.md`
3. `docs/TASK_2026_04_05_GODOT_WEEK1_EXEC_CARDS.md`
4. `docs/SEMANTIC_NEUTRALIZATION_GUIDE_2026_03_29.md`
5. `docs/00_ENGINEER_START_HERE_2026_03_29.md`

### 3.2 历史追溯（P1）

1. `docs/AGENTS_HISTORY_2026_03.md`
2. `docs/archive/HANDOFF_2026_03_17_EDITOR_SESSION.md`
3. `docs/archive/HANDOFF_2026_03_18.md`
4. `docs/archive/HANDOFF_2026_03_19.md`
5. `docs/archive/HANDOFF_STZB_REVERSE_COMPLETE.md`

### 3.3 核心架构证据（P1）

1. `docs/P0_PLAYABLE_ALPHA_EXECUTION_PLAN.md`
2. `docs/PROJECT_RUNTIME_BASELINE_2026_03_25.md`
3. `docs/CODE_SPLIT_PLAN_M01_M18_2026_03_26.md`
4. `docs/CODE_SPLIT_EXEC_ACCEPTANCE_M01_M18_2026_03_26.md`

## 4. 候选清理集合（先审后删）

候选条件：

1. 图谱孤立（backlinks=0 且 outlinks=0）
2. 不在“执行主链 / 历史追溯 / 架构证据”集合
3. 有明确替代文档或任务阶段已结束

候选样例（本轮仅标记，不删除）：

1. `docs/AI_PARALLEL_WEEKLY_PLAN_2026_03_25.md`
2. `docs/CROSS_AI_MESSAGE_BOARD.md`
3. `docs/DOCS_GRAPH_AUDIT_2026_04_09.md`（被 v2 快照替代）
4. `docs/HARNESS_PROJECT_ISOLATED_SETUP_2026_03_26.md`
5. `docs/archive/modules_legacy_2026_03_25/*`（需二次审计后处理）

## 5. 删除前检查清单（必须全满足）

1. 在 `docs/AGENTS_EXECUTION_CURRENT_2026_04.md`、`docs/PROJECT_EVOLUTION_NARRATIVE_2026_04_09.md`、`README.md` 中无引用。
2. `obsidian backlinks` 与 `obsidian links` 均为 0。
3. 能指出明确替代文档路径。
4. 删除后跑一次图谱快照，确认主链未断。

## 6. 下一步执行顺序

1. 先完成候选集合逐条审计（每条给“删/留”理由）。
2. 再按批次删除（每批 <= 10 文件），每批后刷新图谱快照。
3. 最后更新本决策板与 handoff 记录。
