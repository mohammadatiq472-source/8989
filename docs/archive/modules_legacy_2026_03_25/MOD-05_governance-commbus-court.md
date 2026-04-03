# MOD-05 - Governance Layer (CommBus/Court/Agenda)

## 1. Definition
- Owner: Backend Core (E1)
- Backup owner: AI Systems (E2)
- Goal: Aggregate multi-general signals into governance windows (domain agenda, national agenda, court session).

## 2. Functional Scope
- Domain communication window and conflict merge.
- National agenda compilation.
- Court proposal simulation and snapshot output.
- Governance memory ledger writes.

## 3. Code Boundaries
- `server/src/agents/commBus/DomainCommBus.ts`
- `server/src/agents/commBus/AgendaCompiler.ts`
- `server/src/agents/court/CourtService.ts`
- `server/src/agents/court/CourtStore.ts`

## 4. Official Entrypoints
- POST /api/world/action (previewDomainAgenda, previewNationalAgenda, previewCourtSession)
- GET /api/comm-bus/national-agenda
- GET /api/court/session/latest

## 5. Dependencies
- Modules: MOD-01, MOD-04, MOD-09, MOD-13

## 6. Risks
- Current CommBus spec references missing file CommBusStore.ts.
- Governance windows may accumulate under high tick frequency.

## 7. Next Actions
- Either implement CommBusStore or fix stale docs references.
- Add deterministic ordering and dedupe metrics for national agenda entries.

## 8. Related Docs
- `docs/AI_PLAYER_COMM_BUS_PHASE1_SPEC.md`
- `docs/AI_PLAYER_THINKING_CHAIN.md`

## 9. Handoff Checklist
- [ ] Reproduce module baseline using official entrypoints.
- [ ] Confirm change impact scope (intra-module vs cross-module).
- [ ] Update this module card when behavior, interface, or ownership changes.
