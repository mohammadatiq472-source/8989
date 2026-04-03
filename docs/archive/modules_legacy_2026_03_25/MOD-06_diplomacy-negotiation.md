# MOD-06 - Diplomacy and Negotiation

## 1. Definition
- Owner: AI Systems (E2)
- Backup owner: Backend Core (E1)
- Goal: Handle cross-faction proposals, responses, and negotiation outcomes.

## 2. Functional Scope
- Proposal creation/respond/list/detail APIs.
- Cross-faction identity checks and proposal validity.
- Negotiation channel integration groundwork.
- Diplomacy event broadcast to live stream.

## 3. Code Boundaries
- `server/src/routes/diplomacy.ts`
- `server/src/agents/general/DiplomacyAgent.ts`
- `server/src/agents/general/GeneralNegotiationChannel.ts`
- `server/src/ws/GameWebSocket.ts`

## 4. Official Entrypoints
- POST /api/diplomacy/propose
- POST /api/diplomacy/respond
- GET /api/diplomacy/proposals*

## 5. Dependencies
- Modules: MOD-03, MOD-07, MOD-09, MOD-13

## 6. Risks
- Proposal storage is in-memory and volatile.
- Rule-engine enforcement boundary for diplomacy outcomes still needs hard constraints.

## 7. Next Actions
- Add rules-side assertions for diplomacy effects.
- Add replay index for diplomacy timeline per tick.

## 8. Related Docs
- `docs/AI_PLAYER_AUDIT_REPORT.md`
- `docs/AUTONOMOUS_SCALE_PLAN.md`

## 9. Handoff Checklist
- [ ] Reproduce module baseline using official entrypoints.
- [ ] Confirm change impact scope (intra-module vs cross-module).
- [ ] Update this module card when behavior, interface, or ownership changes.
