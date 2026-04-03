# MOD-12 - V2 Growth System (Recruit/Star/Army/Alliance)

## 1. Definition
- Owner: Backend Core (E1)
- Backup owner: Gameplay Engineer (E7)
- Goal: Gameplay progression module for recruit, upgrade, army composition, and alliance operations.

## 2. Functional Scope
- Recruit and pity mechanics.
- Star upgrade and attribute allocation.
- Army create/compose and slot limits.
- Alliance create/join/list.
- AIPlayerV2 resource income and upkeep settlement.

## 3. Code Boundaries
- `server/src/routes/v2game.ts`
- `server/src/application/v2/V2GameService.ts`
- `shared/domain/recruitment.ts`
- `shared/domain/resources.ts`
- `shared/schemas/recruit.ts`

## 4. Official Entrypoints
- POST /api/v2/recruit|star-upgrade|star-allocate|army/*
- GET /api/v2/player/:id|players|alliances|state
- POST /api/v2/alliance|alliance/join

## 5. Dependencies
- Modules: MOD-07, MOD-13, MOD-14

## 6. Risks
- /api/v2/army/create still uses local manual validation path.
- In-memory state causes restart data loss.

## 7. Next Actions
- Align army/create with shared schema.
- Add persistence and replay hooks for V2 state changes.

## 8. Related Docs
- `docs/ARCHITECTURE_V2_MULTIPLAYER.md`
- `docs/audit-shared-contracts-schemas-2026-03-20.md`

## 9. Handoff Checklist
- [ ] Reproduce module baseline using official entrypoints.
- [ ] Confirm change impact scope (intra-module vs cross-module).
- [ ] Update this module card when behavior, interface, or ownership changes.
