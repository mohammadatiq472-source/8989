# MOD-14 - Frontend Command Center Orchestration

## 1. Definition
- Owner: Frontend App (E4)
- Backup owner: Frontend Map (E5)
- Goal: Main app orchestration for state sync, command actions, panel composition, and UX flow.

## 2. Functional Scope
- World snapshot polling and SSE subscription.
- Planning/world actions and UI state reconciliation.
- Panel orchestration (briefing/command/tactical/reserve/macro).
- Primary interaction state (selection, feed, hints, modal flows).

## 3. Code Boundaries
- `src/App.tsx`
- `src/components/layout/AppShell.tsx`
- `src/components/panels/*.tsx`
- `src/api/*.ts`

## 4. Official Entrypoints
- npm run dev
- src/main.tsx
- GET /api/world + POST /api/world/action

## 5. Dependencies
- Modules: MOD-08, MOD-09, MOD-13, MOD-15, MOD-16

## 6. Risks
- App.tsx is very large and hard for multi-engineer parallel edits.
- UI timing race with authoritative backend state is still possible.

## 7. Next Actions
- Split App.tsx by domain (world sync / command / narration).
- Add optimistic UI rollback for key world actions.

## 8. Related Docs
- `docs/ROLE_FRONTEND_ENGINEER.md`
- `docs/UI_MAP_INTEGRATED_WIREFRAME_V1.md`

## 9. Handoff Checklist
- [ ] Reproduce module baseline using official entrypoints.
- [ ] Confirm change impact scope (intra-module vs cross-module).
- [ ] Update this module card when behavior, interface, or ownership changes.
