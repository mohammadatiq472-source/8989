# Nightly Acceptance Snapshot (2026-03-27 01:05 CST)

## Goal
- Continue production-hardening for `3000 AI + hundreds human players` under strict module boundaries.
- Add multiplayer session boundary constraints and official acceptance tests without introducing temporary validation chains.

## Reused Official Entrypoints
- `npm run test:session:manager`
- `npm run test:world:mutation-lock`
- `npm run lint`
- `npm run build`
- `npm run eval:planning:offline`
- `npm run eval:orchestrator:stress`
- `npm run gate:phase5:hardening`
- `npm run gate:scale:3000:mock`
- `npm run gate:gateway:preflight`

## Changes in This Round
1. Session boundary hardening (`server/src/multiplayer/SessionManager.ts`)
- Added runtime guardrails: heartbeat timeout, stale-session TTL, max active sessions, max player-name length.
- Added stale-session pruning and deterministic autonomy transition sweep.
- Added token format guard (`48` hex chars) and strict join validation.
- Added observability payload: `getSessionMetrics()`.
- Added test-only controls for deterministic validation: runtime-config/clock reset + override hooks.

2. Session route/body hardening
- `server/src/routes/sessionBody.ts`
  - Enforced token pattern validation in request body checks.
  - Added player-name max-length guard.
- `server/src/routes/session.ts`
  - Added `GET /api/session/metrics` for runtime diagnostics.
  - Upgraded error semantics for invalid token body (`valid token required`).

3. New official test entrypoint
- Added `server/tests/session_manager.test.ts`.
- Added npm script `test:session:manager` in `package.json`.
- Test coverage:
  - L1->L2 timeout transition and heartbeat recovery.
  - stale-session prune and faction reclaim.
  - capacity guard + token validation failures.
  - metrics correctness + name normalization/limits.

4. Runtime config documentation
- `.env.example` updated with session boundary envs:
  - `SESSION_HEARTBEAT_TIMEOUT_MS`
  - `SESSION_STALE_TTL_MS`
  - `SESSION_MAX_ACTIVE`
  - `SESSION_MAX_PLAYER_NAME_LENGTH`

## Acceptance Results
1. `npm run test:session:manager`: `PASS`
2. `npm run test:world:mutation-lock`: `PASS`
3. `npm run lint`: `PASS`
4. `npm run build`: `PASS`
5. `npm run eval:planning:offline`: `PASS` (`fullPassRate=0.8`)
6. `npm run eval:orchestrator:stress`: `PASS` (`successRate=1`, `p95LatencyMs=4434`)
7. `npm run gate:phase5:hardening`: `PASS`
8. `npm run gate:scale:3000:mock`: `PASS`
   - `runId`: `fcdc19d4-c48f-44ad-bd9a-c39bd0e5f91d`
   - `totalAgents`: `3000`
   - `successRate`: `1`
   - `fallbackRate`: `0`
   - `failureCount`: `0`
   - `p95LatencyMs`: `156373`
9. `npm run gate:gateway:preflight`: `FAIL` (expected in current env)
   - blocker: `LLM_RELAY_URL` unset
   - blocker: key chain unset (`LLM_RELAY_API_KEY / LLM_RELAY_API_KEYS / LLM_RELAY_API_KEYS_FILE`)

## Risk/Blocker Status
- Gateway mainline acceptance remains blocked by missing runtime env.
- Mock path and world-write-lock path remain stable after session hardening.

## Next Direct Action
1. Configure relay env (`LLM_RELAY_URL` + key chain).
2. Run `npm run gate:scale:3000:gateway:ready`.
3. If passed, mark gateway path as primary acceptance chain in M18 snapshot.
