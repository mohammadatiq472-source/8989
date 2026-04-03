# MOD-02 - Commander Planning Pipeline

## 1. Definition
- Owner: AI Systems (E2)
- Backup owner: Backend Core (E1)
- Goal: Turn strategic intent into executable StrategicPlan with lifecycle and guardrails.

## 2. Functional Scope
- PlanningService lifecycle state machine and stale timeout.
- Commander memory recall + tool context + guard filtering.
- Mock/local/gateway planner mode orchestration and fallback.
- Planner metrics output (latency/tokens/cost/failureCategory).

## 3. Code Boundaries
- `server/src/application/planning/PlanningService.ts`
- `server/src/application/planning/PlanningJobMachine.ts`
- `server/src/agents/commander/CommanderAgent.ts`
- `server/src/infra/llm/ModelGatewayAdapter.ts`

## 4. Official Entrypoints
- POST /api/planning/create
- POST /api/world/action (queuePlanExecution)
- npm run test:planner:prompt

## 5. Dependencies
- Modules: MOD-01, MOD-04, MOD-10, MOD-13

## 6. Risks
- Planner schema and shared contract drift remains a recurring risk.
- Fallback semantics under gateway failure must stay aligned with game expectations.

## 7. Next Actions
- Create golden input/output fixtures for planner chain.
- Emit structured guard reasons for analytics instead of free-form text only.

## 8. Related Docs
- `docs/AI_PLAYER_THINKING_CHAIN.md`
- `docs/audit-shared-contracts-schemas-2026-03-20.md`

## 9. Handoff Checklist
- [ ] Reproduce module baseline using official entrypoints.
- [ ] Confirm change impact scope (intra-module vs cross-module).
- [ ] Update this module card when behavior, interface, or ownership changes.
