# AI Prompt Context Governance (2026-04-11)

## 0. Decision

Prompt docs are useful, but too many "always-read" prompt files create context pollution.

Policy:

1. Keep one active execution source of truth.
2. Keep one quick navigation index.
3. Keep lane-specific docs optional and on-demand.
4. Keep historical prompt docs as reference only.

## 1. Active minimal set (default read)

1. `AGENTS.md`
2. `docs/AGENTS_EXECUTION_CURRENT_2026_04.md`
3. `docs/AI_QUICK_NAV_INDEX_2026_04_10.md`
4. Current lane card / module card only

## 2. On-demand set (read only when needed)

1. `docs/AI_SUBAGENT_LAUNCH_PROMPTS_2026_03_26.md`
2. `docs/AI_ENGINEER_HUB_2026_03_25.md`
3. `docs/AI_ENGINEER_ORG_2026_03_25.md`
4. `docs/archive/prompts/*`（历史 prompt 原文）
5. Closeout history docs (`docs/CLOSEOUT_*`)
6. Legacy prompt stubs at original paths (for backlink compatibility only)
   - `docs/prompts/PLANNER_RAG_GRAPH_PROMPTS.md`
   - `docs/prompts/planner.prompt.md`
   - `docs/AI_PARALLEL_WEEKLY_PLAN_2026_03_25.md`
   - `docs/codex-multi-agent-audit-2026-03-20.md`

## 3. Archive/reference-only set

1. `docs/AGENTS_HISTORY_2026_03.md`
2. `docs/archive/**`
3. Legacy split plans/reports unless tracing regressions
4. Prompt archive originals:
   - `docs/archive/prompts/PLANNER_RAG_GRAPH_PROMPTS.md`
   - `docs/archive/prompts/planner.prompt.md`
   - `docs/archive/prompts/AI_PARALLEL_WEEKLY_PLAN_2026_03_25.md`
   - `docs/archive/prompts/codex-multi-agent-audit-2026-03-20.md`
5. Archive candidate ledger: `docs/PROMPT_ARCHIVE_CANDIDATES_2026_04_11.md`

## 4. Multi-window guardrails

1. One window == one worktree == one lane whitelist.
2. Do not ask each lane to read full prompt corpus.
3. Integrator window owns cross-lane gate/reconciliation only.

## 5. Practical anti-pollution rule

If a prompt file does not change immediate implementation or validation commands for current lane, skip it.


## 6. Archive/stub reverse index (B3-C19)

| Canonical archive path | Legacy stub path | 使用口径 |
| --- | --- | --- |
| `docs/archive/prompts/PLANNER_RAG_GRAPH_PROMPTS.md` | `docs/prompts/PLANNER_RAG_GRAPH_PROMPTS.md` | 新写链接统一使用 archive 主路径；stub 仅用于历史 backlink 兼容。 |
| `docs/archive/prompts/planner.prompt.md` | `docs/prompts/planner.prompt.md` | 新写链接统一使用 archive 主路径；stub 仅用于历史 backlink 兼容。 |
| `docs/archive/prompts/AI_PARALLEL_WEEKLY_PLAN_2026_03_25.md` | `docs/AI_PARALLEL_WEEKLY_PLAN_2026_03_25.md` | 新写链接统一使用 archive 主路径；stub 仅用于历史 backlink 兼容。 |
| `docs/archive/prompts/codex-multi-agent-audit-2026-03-20.md` | `docs/codex-multi-agent-audit-2026-03-20.md` | 新写链接统一使用 archive 主路径；stub 仅用于历史 backlink 兼容。 |
