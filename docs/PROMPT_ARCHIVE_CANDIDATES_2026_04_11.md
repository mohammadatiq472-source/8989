# Prompt Archive Candidates (2026-04-11)

## 0. Scope

第二阶段精简仅处理 `docs` 低频历史 prompt/治理文档，不改业务代码。

## 1. Candidate Ledger

| 文档 | 当前标签 | 引用计数（docs/AGENTS/README） | 建议动作 | 备注 |
| --- | --- | --- | --- | --- |
| `docs/prompts/PLANNER_RAG_GRAPH_PROMPTS.md` | archived + stub | 0 | 已归档（B3-C18） | 原文迁移至 `docs/archive/prompts/PLANNER_RAG_GRAPH_PROMPTS.md`，原路径保留 stub |
| `docs/prompts/planner.prompt.md` | archived + stub | 1 | 已归档（B3-C18） | 原文迁移至 `docs/archive/prompts/planner.prompt.md`，原路径保留 stub |
| `docs/AI_PARALLEL_WEEKLY_PLAN_2026_03_25.md` | archived + stub | 2 | 已归档（B3-C18） | 原文迁移至 `docs/archive/prompts/AI_PARALLEL_WEEKLY_PLAN_2026_03_25.md`，原路径保留 stub |
| `docs/codex-multi-agent-audit-2026-03-20.md` | archived + stub | 1 | 已归档（B3-C18） | 原文迁移至 `docs/archive/prompts/codex-multi-agent-audit-2026-03-20.md`，原路径保留 stub |
| `docs/AGENTS_HISTORY_2026_03.md` | reference-only | 5 | 保留原位（历史主索引） | 有追溯价值，继续留在 docs 根目录 |
| `docs/AI_SUBAGENT_LAUNCH_PROMPTS_2026_03_26.md` | on-demand | 4 | 暂不归档 | 仍用于子代理启动模板，先保留 |

## 2. Archive Rule

1. 仅迁移 `reference-only` 且引用计数 <= 2 的文档。
2. 迁移前先更新 `docs/AI_PROMPT_CONTEXT_GOVERNANCE_2026_04_11.md` 与 `docs/AI_QUICK_NAV_INDEX_2026_04_10.md` 的链接。
3. 迁移后保留同名索引 stub（1 行说明 + 新路径），避免历史链接断裂。

## 3. Rollback

若迁移导致历史链接找不到，执行两步回滚：

1. 将文档移回原路径；
2. 恢复 quick-nav 与 governance 中的原始链接。

## 4. B3-C18 Execution Result (2026-04-12)

1. 已完成归档迁移：
   - `docs/prompts/PLANNER_RAG_GRAPH_PROMPTS.md` -> `docs/archive/prompts/PLANNER_RAG_GRAPH_PROMPTS.md`
   - `docs/prompts/planner.prompt.md` -> `docs/archive/prompts/planner.prompt.md`
   - `docs/AI_PARALLEL_WEEKLY_PLAN_2026_03_25.md` -> `docs/archive/prompts/AI_PARALLEL_WEEKLY_PLAN_2026_03_25.md`
   - `docs/codex-multi-agent-audit-2026-03-20.md` -> `docs/archive/prompts/codex-multi-agent-audit-2026-03-20.md`
2. 原路径均已补 stub（仅保留“已归档 + 新路径”说明），用于兼容历史链接。


## 5. B3-C19 Reverse Index（archive <-> stub）

| archive 原文路径 | stub 兼容路径 | 状态 |
| --- | --- | --- |
| `docs/archive/prompts/PLANNER_RAG_GRAPH_PROMPTS.md` | `docs/prompts/PLANNER_RAG_GRAPH_PROMPTS.md` | 已建立双向索引，后续新增链接统一写 archive 路径。 |
| `docs/archive/prompts/planner.prompt.md` | `docs/prompts/planner.prompt.md` | 已建立双向索引，后续新增链接统一写 archive 路径。 |
| `docs/archive/prompts/AI_PARALLEL_WEEKLY_PLAN_2026_03_25.md` | `docs/AI_PARALLEL_WEEKLY_PLAN_2026_03_25.md` | 已建立双向索引，后续新增链接统一写 archive 路径。 |
| `docs/archive/prompts/codex-multi-agent-audit-2026-03-20.md` | `docs/codex-multi-agent-audit-2026-03-20.md` | 已建立双向索引，后续新增链接统一写 archive 路径。 |

## 6. B3-C19 Rollback Drill Record（from latest nightly）

1. Report: `tmp/gates/ai-nightly-acceptance/ai_nightly_acceptance_latest.json`
2. Check: `save_slots_archive_restore_rollback_drill_passed = true`
3. executedAt: `2026-04-12T05:45:41.967Z`
4. archivePath: `tmp/world_save_slots_archive/world_save_slots.2026-04-11T09-34-13-073Z.json.gz`
5. backupPath: `tmp/gates/ai-nightly-acceptance/save-slots-rollback-drill/world_save_slots.rollback-drill.2026-04-12T05-45-43-878Z.json.restore.bak.1775972743878`
6. drillStorePath: `tmp/gates/ai-nightly-acceptance/save-slots-rollback-drill/world_save_slots.rollback-drill.2026-04-12T05-45-43-878Z.json`
7. rollbackVerified: `true`
