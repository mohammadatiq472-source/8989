# Engineer Start Here (2026-03-29)

## Read These First

1. [AI_QUICK_NAV_INDEX_2026_04_10.md](AI_QUICK_NAV_INDEX_2026_04_10.md)（3-5 分钟定位入口）
2. `docs/SEMANTIC_NEUTRALIZATION_GUIDE_2026_03_29.md`
3. `docs/CHANGELOG_SEMANTIC_NEUTRALIZATION.md`
4. `godot-client/README.md`
5. [PROJECT_EVOLUTION_NARRATIVE_2026_04_09.md](PROJECT_EVOLUTION_NARRATIVE_2026_04_09.md)（先读项目发展脉络，避免重复返工）
6. [AGENTS_EXECUTION_CURRENT_2026_04.md](AGENTS_EXECUTION_CURRENT_2026_04.md)（当前执行口径）
7. [DOCS_CLEANUP_DECISION_BOARD_2026_04_09.md](DOCS_CLEANUP_DECISION_BOARD_2026_04_09.md)（清理决策基线）
8. [DOCS_CLEANUP_BATCH1_REVIEW_2026_04_09.md](DOCS_CLEANUP_BATCH1_REVIEW_2026_04_09.md)（首批审计清单）

## Hard Rules For This Migration

- Do not introduce new `player/enemy` semantic coupling in newly changed code.
- Prefer neutral terms: `faction`, `targetFaction`, `humanFactionId`, `aiFactionId`.
- Compatibility aliases are allowed temporarily, but mark them as deprecated.

## Before You Commit

- If you changed names (fields/functions/contracts), update both docs:
  - `docs/SEMANTIC_NEUTRALIZATION_GUIDE_2026_03_29.md` (what changed, why, compatibility)
  - `docs/CHANGELOG_SEMANTIC_NEUTRALIZATION.md` (append one single-line entry)
- If Godot/HUD consumer fields changed, include one verification conclusion.

## Contract Sync Gate (Current)

- Legacy contract sync gate has been removed.
- Current required checks:
  - `npm run build`
  - `npm run test:session:manager`
  - `npm run test:world:mutation-lock`

## Godot Render Baseline (Mandatory For Isometric Visual Work)

- Run Godot baseline export using HUD button or `F8`.
- Output artifact path:
  - `tmp/godot_perf_baseline_*.json`
- Team rule:
  - Any map/render/perf-affecting change must include one baseline export result in delivery notes.

## One-Line Entry Template

`YYYY-MM-DD | scope | change | compatibility | refs`

Example:

`2026-03-29 | contracts.meta | rename playerPower/enemyPower -> primaryFactionPower/opposingFactionPower | dual-read | shared/contracts/meta.ts`
