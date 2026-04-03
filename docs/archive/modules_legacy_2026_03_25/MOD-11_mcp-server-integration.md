# MOD-11 - MCP Server Integration

## 1. Definition
- Owner: Backend Infra (E3)
- Backup owner: AI Systems (E2)
- Goal: Expose runtime game state/tools to coding assistants through MCP.

## 2. Functional Scope
- MCP tool definitions and output truncation safety.
- Backend proxy calls to HTTP API.
- VS Code MCP config integration.
- Tool error handling and payload shaping.

## 3. Code Boundaries
- `server/src/mcp/gameServer.ts`
- `.vscode/mcp.json`
- `start-mcp-unity.cmd`

## 4. Official Entrypoints
- npx tsx server/src/mcp/gameServer.ts
- Tools: get_world_summary/get_world_snapshot/get_general_profiles/advance_tick/health_check

## 5. Dependencies
- Modules: MOD-08, MOD-09, MOD-13

## 6. Risks
- Tool/API contract mismatch can break MCP runtime immediately.
- Missing backend timeout can stall MCP thread.

## 7. Next Actions
- Add hard timeout/retry policy in backendFetch.
- Create MCP contract tests tied to API PR changes.

## 8. Related Docs
- `docs/audit-http-api-mcp-2026-03-20.md`

## 9. Handoff Checklist
- [ ] Reproduce module baseline using official entrypoints.
- [ ] Confirm change impact scope (intra-module vs cross-module).
- [ ] Update this module card when behavior, interface, or ownership changes.
