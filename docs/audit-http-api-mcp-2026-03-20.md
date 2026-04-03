# Multi-Agent Audit Report (HTTP/API/MCP)

- Date: 2026-03-20
- Scope: server/src/routes/*, server/src/mcp/gameServer.ts, and related schema/service call paths
- Note: Findings only, no style feedback.

## Findings

### P1-01 Unauthenticated privileged write endpoints allow direct world mutation
- Evidence:
  - server/src/app.ts:128 (POST /api/world/action)
  - server/src/app.ts:142 (POST /api/planning/create)
  - server/src/app.ts:164 (POST /api/ai/config)
  - server/src/app.ts:201 (POST /api/nation/found)
  - server/src/app.ts:236 (POST /api/save-slots/save)
  - server/src/app.ts:241 (POST /api/save-slots/load)
- Trigger: Any local process or browser script can call these endpoints without token/session.
- Impact: Attackers can advance ticks, override plans, roll back to old saves, and modify configs.

### P1-02 Access-Control-Allow-Origin: * + no auth enables cross-site control of localhost backend
- Evidence: server/src/app.ts:296-299
- Trigger: User opens a malicious website; JavaScript sends cross-origin POST to http://127.0.0.1:8787/api/world/action.
- Impact: Browser can drive local game backend actions.

### P1-03 MCP dvance_tick contract mismatch makes the tool fail consistently
- Evidence:
  - MCP sends snake_case: server/src/mcp/gameServer.ts:107 ({ action: 'advance_tick' })
  - Server schema accepts camelCase: shared/schemas/worldAction.ts:73 (ction: 'advanceTick')
- Trigger: Call MCP tool dvance_tick.
- Impact: Core MCP action returns validation error (400), breaking automation.

### P1-04 SSE stream lacks connection-level controls and can be flood-DoS'd
- Evidence: server/src/routes/observability.ts:22-92 (per-connection setInterval, no auth, no connection cap, no rate guard)
- Trigger: Open many concurrent GET /api/events/stream connections.
- Impact: CPU/memory grows with connection count and can degrade service.

### P2-01 Session tokens exist but are not enforced by mutating routes
- Evidence:
  - Token issuance routes: server/src/routes/session.ts:23-60
  - Validation helper exists but is not integrated: server/src/multiplayer/SessionManager.ts:158
- Trigger: Call write endpoints without token; requests still succeed.
- Impact: Faction ownership controls do not protect execution paths.

### P2-02 MCP get_general_profiles promise does not match route behavior
- Evidence:
  - MCP claims faction-specific lookup: server/src/mcp/gameServer.ts:80-87
  - Route returns full general list without faction filtering: server/src/routes/generalChat.ts:64-72
- Trigger: Call MCP tool with different actionId values.
- Impact: Tool semantics are misleading and can leak cross-faction context.

### P2-03 Raw internal error messages are returned to clients
- Evidence:
  - Global fallback: server/src/app.ts:270
  - Examples: server/src/routes/world.ts:142, server/src/routes/planning.ts:31-33, server/src/routes/ai.ts:32-33
- Trigger: Force downstream failures or bad inputs.
- Impact: Internal implementation details can be exposed in API responses.

### P2-04 MCP backend calls have no timeout, so hangs can stall MCP tools
- Evidence: server/src/mcp/gameServer.ts:17-30
- Trigger: Backend endpoint hangs or half-open connection.
- Impact: MCP tools block indefinitely, hurting assistant reliability.

## Message For Copilot / Claude

The architecture foundation is solid, but the HTTP/MCP boundary is under-protected.
Prioritize these three fixes next:
1. Add a reusable auth guard for all mutating routes (token + faction binding), and replace wildcard CORS with an allowlist.
2. Fix MCP/schema contract drift (dvance_tick vs dvanceTick) and add contract tests for every MCP tool.
3. Add connection/rate/timeout controls for SSE and high-frequency write endpoints.

If these are delayed, iteration speed will drop later because security and reliability debt will compound.
