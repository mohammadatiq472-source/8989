# MOD-04 - Reflect and Memory Loop

## 1. Definition
- Owner: AI Systems (E2)
- Backup owner: Backend Infra (E3)
- Goal: Close POER loop per tick: narrative events, memory writes, and profile drift updates.

## 2. Functional Scope
- ReflectService draft generation and causal links.
- Mem0 provider abstraction with in-memory fallback.
- Civil memory ledger and integrity chain.
- General reflect feedback to loyalty/trust/grievance fields.

## 3. Code Boundaries
- `server/src/agents/reflect/ReflectService.ts`
- `server/src/agents/memory/MemoryStore.ts`
- `server/src/agents/memory/CivilMemoryService.ts`
- `server/src/agents/memory/CivilMemoryStore.ts`

## 4. Official Entrypoints
- Triggered automatically inside advanceTick flow.
- GET /api/narratives
- GET /api/civil-memory

## 5. Dependencies
- Modules: MOD-01, MOD-03, MOD-09, MOD-13

## 6. Risks
- Behavior can diverge when memory backend switches between Mem0 and in-memory.
- Narrative distortion risk if reflect source mapping is incomplete.

## 7. Next Actions
- Add consistency checks across battle/report/alliance sources.
- Move consequence backfill into explicit re-computable task flow.

## 8. Related Docs
- `docs/AI_PLAYER_THINKING_CHAIN.md`
- `docs/AI_LAYER_STATUS.md`

## 9. Handoff Checklist
- [ ] Reproduce module baseline using official entrypoints.
- [ ] Confirm change impact scope (intra-module vs cross-module).
- [ ] Update this module card when behavior, interface, or ownership changes.
