# MOD-03 - General Execution Layer

## 1. Definition
- Owner: AI Systems (E2)
- Backup owner: Backend Core (E1)
- Goal: Convert commander plans into general-level orders with cost-tier routing (UtilityAI or LLM).

## 2. Functional Scope
- General dispatch and per-general execution routing.
- UtilityAI proposal/refinement and path reachability checks.
- General LLM adapter gating, timeout, parse, and fallback.
- General profile persistence and baseline personality state.

## 3. Code Boundaries
- `server/src/agents/general/GeneralAgent.ts`
- `server/src/agents/general/GeneralUtilityAI.ts`
- `server/src/agents/general/GeneralLLMAdapter.ts`
- `server/src/agents/general/GeneralProfileStore.ts`

## 4. Official Entrypoints
- POST /api/world/action (queuePlanExecution, previewGeneralDirectives)
- GET|POST /api/generals/*
- npm run sim:13factions

## 5. Dependencies
- Modules: MOD-01, MOD-04, MOD-06, MOD-10, MOD-13

## 6. Risks
- General profile <-> world unit consistency can drift at scale.
- LLM parse failures directly affect tactical quality if fallback is weak.

## 7. Next Actions
- Add LLM success/fallback ratio metrics per tier.
- Refactor GeneralAgent internals by decision stage to reduce merge conflicts.

## 8. Related Docs
- `docs/AI_LAYER_STATUS.md`
- `docs/ROLE_AI_ENGINEER.md`

## 9. Handoff Checklist
- [ ] Reproduce module baseline using official entrypoints.
- [ ] Confirm change impact scope (intra-module vs cross-module).
- [ ] Update this module card when behavior, interface, or ownership changes.
