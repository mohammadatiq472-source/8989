# MOD-17 - Evals and Tooling

## 1. Definition
- Owner: Validation Engineer (E7)
- Backup owner: Backend Infra (E3)
- Goal: Official validation entrypoints for simulation, stress, offline eval, and map tooling.

## 2. Functional Scope
- Offline planning eval and orchestrator stress scripts.
- Dual-player and 13-faction simulation chains.
- Map generation Python scripts and replay indexing.
- Planner prompt test and baseline output management.

## 3. Code Boundaries
- `server/src/evals/*.ts`
- `server/evals/*.json`
- `server/tests/planner_prompt.test.ts`
- `scripts/*.py`
- `scripts/index_replays.ts`

## 4. Official Entrypoints
- npm run eval:planning:offline
- npm run eval:orchestrator:stress
- npm run gate:phase5:hardening
- npm run sim:13factions

## 5. Dependencies
- Modules: MOD-01, MOD-02, MOD-03, MOD-09, MOD-15

## 6. Risks
- Some eval scripts can drift away from production config defaults.
- tmp artifacts can hide regression signal if not cleaned and versioned clearly.

## 7. Next Actions
- Define expected baselines and thresholds for each eval chain.
- Document artifact retention and cleanup policy for reproducibility.

## 8. Related Docs
- `docs/P0_PLAYABLE_ALPHA_EXECUTION_PLAN.md`
- `docs/AUTONOMOUS_SCALE_PLAN.md`

## 9. Handoff Checklist
- [ ] Reproduce module baseline using official entrypoints.
- [ ] Confirm change impact scope (intra-module vs cross-module).
- [ ] Update this module card when behavior, interface, or ownership changes.
