# MOD-09 - Observability, Replay, and Live Streams

## 1. Definition
- Owner: Backend Infra (E3)
- Backup owner: Frontend App (E4)
- Goal: Provide events, narratives, replay, SSE/WS streams, and save slots for debugging and storytelling.

## 2. Functional Scope
- World events and narrative events APIs.
- SSE event stream and incremental fetch semantics.
- Replay archive and RAG cache stats.
- WebSocket tick delta, battle reports, diplomacy events.
- Save slot read/write operations.

## 3. Code Boundaries
- `server/src/routes/observability.ts`
- `server/src/routes/replay.ts`
- `server/src/ws/GameWebSocket.ts`
- `server/src/infra/rag/retrieveReplays.ts`

## 4. Official Entrypoints
- GET /api/events|/api/events/stream|/api/narratives
- GET /api/replay/archive|/api/replay/:id|/api/replay/rag-cache
- WS /ws

## 5. Dependencies
- Modules: MOD-01, MOD-04, MOD-08, MOD-13

## 6. Risks
- SSE/WS without strong connection throttling can be abused.
- Replay consistency against authoritative world snapshots is under-verified.

## 7. Next Actions
- Add connection rate guards and stream quotas.
- Add replay integrity verification into official eval chain.

## 8. Related Docs
- `docs/audit-http-api-mcp-2026-03-20.md`
- `docs/P0_PLAYABLE_ALPHA_EXECUTION_PLAN.md`

## 9. Handoff Checklist
- [ ] Reproduce module baseline using official entrypoints.
- [ ] Confirm change impact scope (intra-module vs cross-module).
- [ ] Update this module card when behavior, interface, or ownership changes.
