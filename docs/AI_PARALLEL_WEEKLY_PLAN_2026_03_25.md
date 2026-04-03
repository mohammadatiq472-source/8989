# ? AI ?????????? - 2026-03-25

This schedule follows the 13-lane ownership in `docs/AI_ENGINEER_ORG_2026_03_25.md`.

## Parallel Squads (coherent with active lanes)
- Squad A (Core Backend): AI-BE-EntryRuntime, AI-BE-RuleState, AI-Shared-Contracts
- Squad B (Agent Decision): AI-Agent-Commander, AI-Agent-General, AI-Agent-ReflectMemory, AI-Agent-GovDiplo
- Squad C (World Expansion): AI-BE-WorldMeta, AI-Platform-ModelGateway, AI-Platform-Observability
- Squad D (Frontend Surface): AI-FE-CommandSurface, AI-FE-MapSurface
- Squad E (Quality Gates): AI-QA-Gates

## Week 1 - Baseline Convergence
- Goal: clear formal-entry blockers and restore a reliable green path.
- Squad A: reduce module-owned lint debt in M14/M19 and verify state consistency.
- Squad B: fix M10/M18 lint hits and protect POER loop regressions.
- Squad D: resolve M15/M16 lint warnings without interaction regressions.
- Squad E: standardize weekly validation backfill format for module cards.
- Gate: `npm run lint`, `npm run build`, `npm run eval:planning:offline`.

## Week 2 - POER Hardening
- Goal: improve tactical quality and traceability.
- Squad B: tighten Commander/General/Reflect contracts (M03/M04/M05/M06/M07/M08).
- Squad C: strengthen replay/observability for planning and reflect phases (M10/M11/M12).
- Squad E: compare eval deltas and classify regressions by module owner.
- Gate: `npm run eval:orchestrator:stress`, `npm run gate:phase5:hardening`.

## Week 3 - Delegated Autonomy and Multi-Faction Load
- Goal: stabilize L2 delegated mode at higher concurrent load.
- Squad B: autonomy-policy tuning for delegated mode and diplomacy constraints.
- Squad C: world-meta and V2 gameplay pressure checks (M09/M13) under stress.
- Squad E: run 13-faction simulations and capture failure taxonomy.
- Gate: `npm run sim:13factions` (or gateway variant) + `npm run build`.

## Week 4 - Fullstack Integration
- Goal: align command desk UI with backend decision traces.
- Squad D: integrate command/map UX and validate Chinese UI copy stability.
- Squad C: complete copilot runtime and replay observability loop closure.
- Squad E: run cross-module matrix (M03-M05-M15-M16) and publish findings.
- Gate: `npm run lint`, `npm run build`, `npm run eval:planning:offline`.

## Week 5 - Release Candidate
- Goal: freeze interfaces and converge defects/performance.
- All squads: bugfix and performance only, no scope expansion.
- Squad E: final hardening/stress/offline-planning gate review.
- Release condition: `lint/build/eval/gate` all green.

## Backfill Rules
- Every Friday, owners must update `Validation Snapshot` in touched module cards.
- Every issue must map to exactly one module ID and one owner lane.
- Temporary scripts are allowed only in `tmp/` and cannot be used as final proof.
