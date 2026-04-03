# MOD-10 - AI Config and Model Gateway

## 1. Definition
- Owner: Backend Infra (E3)
- Backup owner: AI Systems (E2)
- Goal: Model discovery/config management and gateway protocol integration.

## 2. Functional Scope
- AI config read/write and model catalog cache.
- Planner target resolution and openai-compatible adapter.
- Retry/timeout/budget guard settings.
- AI server proxy support for general LLM calls.

## 3. Code Boundaries
- `server/src/routes/ai.ts`
- `server/src/application/ai/AiConfigService.ts`
- `server/src/config/modelGateway.ts`
- `server/src/infra/llm/*`
- `server/src/ai-server.ts`

## 4. Official Entrypoints
- GET|POST /api/ai/config
- GET /api/ai/models
- GET /api/ai/logs

## 5. Dependencies
- Modules: MOD-02, MOD-03, MOD-08, MOD-13

## 6. Risks
- Multi-key rotation and failure categorization complexity is high.
- Model discovery cache freshness tradeoff can confuse operators.

## 7. Next Actions
- Add model source signature and cache hit metrics.
- Unify model precedence policy across commander and general chains.

## 8. Related Docs
- `README.md`
- `docs/ROLE_BACKEND_ENGINEER.md`

## 9. Handoff Checklist
- [ ] Reproduce module baseline using official entrypoints.
- [ ] Confirm change impact scope (intra-module vs cross-module).
- [ ] Update this module card when behavior, interface, or ownership changes.
