# Prompt Archive Candidates (2026-04-11)

## 0. Scope

第二阶段精简仅处理 `docs` 低频历史 prompt/治理文档，不改业务代码。

## 1. Candidate Ledger

| 文档 | 当前标签 | 引用计数（docs/AGENTS/README） | 建议动作 | 备注 |
| --- | --- | --- | --- | --- |
| `docs/prompts/PLANNER_RAG_GRAPH_PROMPTS.md` | reference-only | 0 | 可归档（优先） | 纯历史方案草案，当前主链未直接引用 |
| `docs/prompts/planner.prompt.md` | reference-only | 1 | 可归档（次优先） | 保留一份快照后可迁入 `docs/archive/prompts/` |
| `docs/AI_PARALLEL_WEEKLY_PLAN_2026_03_25.md` | reference-only | 2 | 可归档 | 历史周计划，执行口径已由 2026-04 文档替代 |
| `docs/codex-multi-agent-audit-2026-03-20.md` | reference-only | 1 | 可归档（审计快照） | 建议仅保留链接索引，不作为默认上下文 |
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
