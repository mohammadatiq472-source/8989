# MOD-08 - HTTP API Gateway and Route Dispatch

## 1. Definition
- Owner: Backend Core (E1)
- Backup owner: Backend Infra (E3)
- Goal: Node HTTP entrypoint, route dispatch, payload parsing, and world action gateway.

## 2. Functional Scope
- Main route dispatch in app.ts.
- Common HTTP helpers readJsonBody/writeJson.
- Routing for world, planning, AI, replay, map, nation, session, v2.
- Unified worldAction parse and error handling.

## 3. Code Boundaries
- `server/src/app.ts`
- `server/src/routes/http.ts`
- `server/src/routes/world.ts`
- `server/src/routes/*.ts`

## 4. Official Entrypoints
- npm run server:dev
- GET /api/health
- POST /api/world/action

## 5. Dependencies
- Modules: MOD-01, MOD-02, MOD-09, MOD-10, MOD-13

## 6. Risks
- Mutating endpoints auth boundary still weak (known audit item).
- app.ts is too centralized and causes frequent merge collisions.

## 7. Next Actions
- Introduce modular route registration and auth middleware layer.
- Enforce token checks for privileged world mutations.

## 8. Related Docs
- `docs/audit-http-api-mcp-2026-03-20.md`
- `docs/codex-multi-agent-audit-2026-03-20.md`

## 9. Handoff Checklist
- [ ] Reproduce module baseline using official entrypoints.
- [ ] Confirm change impact scope (intra-module vs cross-module).
- [ ] Update this module card when behavior, interface, or ownership changes.
