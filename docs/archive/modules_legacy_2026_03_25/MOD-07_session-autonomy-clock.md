# MOD-07 - Session, Autonomy, and GameClock

## 1. Definition
- Owner: Backend Infra (E3)
- Backup owner: Backend Core (E1)
- Goal: Manage player sessions, L1/L2 autonomy switching, and autonomous tick loop.

## 2. Functional Scope
- Session join/heartbeat/leave/status.
- Autonomy level transitions (L1 assigned / L2 delegated).
- GameClock auto-planning and tick advancement.
- Concurrency and per-tick faction budget controls.

## 3. Code Boundaries
- `server/src/multiplayer/SessionManager.ts`
- `server/src/application/clock/GameClock.ts`
- `server/src/routes/session.ts`

## 4. Official Entrypoints
- POST /api/session/join|heartbeat|leave
- GET /api/session/status
- npm run start:clock

## 5. Dependencies
- Modules: MOD-01, MOD-02, MOD-12

## 6. Risks
- Session tokens are in-memory only and reset on restart.
- Auto-plan + tick in same window can create load spikes.

## 7. Next Actions
- Move session store behind pluggable persistence (Redis).
- Add overload circuit-breaker and heartbeat health metrics.

## 8. Related Docs
- `docs/AUTONOMOUS_SCALE_PLAN.md`
- `docs/ARCHITECTURE_V2_MULTIPLAYER.md`

## 9. Handoff Checklist
- [ ] Reproduce module baseline using official entrypoints.
- [ ] Confirm change impact scope (intra-module vs cross-module).
- [ ] Update this module card when behavior, interface, or ownership changes.
