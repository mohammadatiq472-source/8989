# MOD-01 - World Rule Engine and Tick Execution

## 1. Definition
- Owner: Backend Core (E1)
- Backup owner: AI Systems (E2)
- Goal: Authoritative world state and all world mutations through rules only.

## 2. Functional Scope
- World state lifecycle and snapshot restore.
- advanceTick, queuePlanExecution, clearPlanExecution execution flow.
- Tile ownership, intel diff, and map layout indexes.
- Main chain integration with General dispatch, Reflect, and WebSocket delta broadcast.

## 3. Code Boundaries
- `server/src/application/world/WorldService.ts`
- `shared/domain/rules.ts`
- `shared/domain/scenario.ts`
- `shared/domain/worldIndex.ts`

## 4. Official Entrypoints
- POST /api/world/action (advanceTick, queuePlanExecution, moveUnit, ...)
- GET /api/world
- npm run server:dev

## 5. Dependencies
- Modules: MOD-02, MOD-03, MOD-04, MOD-09, MOD-13

## 6. Risks
- WorldService is oversized and keeps growing.
- Tick concurrency and state tearing still require strict guard coverage.

## 7. Next Actions
- Split WorldService into action handlers + read models.
- Add regression coverage for cross-faction order safety and execution chain integrity.

## 8. Related Docs
- `docs/AI_LAYER_STATUS.md`
- `docs/AI_PLAYER_THINKING_CHAIN.md`

## 9. Handoff Checklist
- [ ] Reproduce module baseline using official entrypoints.
- [ ] Confirm change impact scope (intra-module vs cross-module).
- [ ] Update this module card when behavior, interface, or ownership changes.
