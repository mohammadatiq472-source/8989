# Codex Multi-Agent Audit (2026-03-20)

## Scope
- `server/src` (routes, world pipeline, agent chain, gateway)
- `shared/contracts` + `shared/schemas` + `shared/domain`
- `src` (frontend integration hotspots)
- Validation entrypoints used:
  - `npm run lint`
  - `npx eslint server/src shared src --max-warnings=0`

## Highest-Risk Findings

### P0-1 Cross-faction unit control is possible through execution orders
- Evidence:
  - `shared/domain/rules.ts:770`
  - `shared/domain/rules.ts:1950`
  - `server/src/agents/general/GeneralLLMAdapter.ts:251`
- Trigger: Submit/produce an order with a valid enemy `unitId` and legal `action/target`.
- Impact: One faction can execute actions on enemy units; authoritative boundary is broken.

### P0-2 Ghost execution chains can be created and never drained
- Evidence:
  - `shared/domain/rules.ts:783`
  - `shared/domain/rules.ts:1323`
  - `shared/domain/rules.ts:214`
- Trigger: Queue a plan with non-existent `factionId` (e.g. `ghost_faction`).
- Impact: Active orders remain globally true while tick processor ignores that faction; system can appear permanently busy.

### P0-3 clearPlanExecution ignores caller faction payload
- Evidence:
  - `server/src/routes/world.ts:85`
  - `server/src/routes/world.ts:86`
  - `server/src/application/world/WorldService.ts:1363`
  - `shared/schemas/worldAction.ts:74`
- Trigger: Call `clearPlanExecution` with `payload.factionId`.
- Impact: Route always clears default `player` chain, making non-player or ghost chains hard/impossible to recover.

## P1 Findings

### P1-1 High-privilege write APIs are unauthenticated
- Evidence: `server/src/app.ts:128`, `:142`, `:164`, `:201`, `:236`, `:241`.
- Impact: Any local process/page can mutate world/config/save state.

### P1-2 `CORS: *` combined with no auth enables cross-site localhost control
- Evidence: `server/src/app.ts:296`.
- Impact: Malicious site can drive `127.0.0.1:8787` from victim browser.

### P1-3 MCP `advance_tick` action name is wrong
- Evidence:
  - `server/src/mcp/gameServer.ts:107` sends `advance_tick`
  - `shared/schemas/worldAction.ts:73` requires `advanceTick`
- Impact: MCP advance tool consistently fails.

### P1-4 Multi-step march can leave orders permanently running
- Evidence:
  - `shared/domain/rules.ts:2024`
  - `shared/domain/rules.ts:2027`
- Trigger: Path node missing or blocked reason in fast-march branch.
- Impact: Early `return` without fail/complete status; chain stalls.

### P1-5 Ceasefire/alliance filtering is bypassed in defender resolution
- Evidence:
  - Hostile filter: `shared/domain/rules.ts:2422`
  - Actual damage loop uses full defenders: `shared/domain/rules.ts:2446`, `:2479`
- Impact: Non-hostile defenders can still be damaged/retreated.

### P1-6 Gateway retry budget can exceed explicit max attempts
- Evidence: `server/src/infra/llm/OpenAICompatPlannerAdapter.ts:59`.
- Impact: Actual retries can be higher than configured value when multiple API keys exist.

### P1-7 Planner lifecycle stale/success semantics can conflict
- Evidence:
  - stale timer: `server/src/application/planning/PlanningService.ts:30`
  - success send after await: `server/src/application/planning/PlanningService.ts:59`
  - stale is final: `server/src/application/planning/PlanningJobMachine.ts:26`
- Impact: Observability can report stale state while request returns success payload.

## Shared Contract Drift (P1/P2)

### D1 Planning history field mismatch (`id` vs `requestId`)
- Evidence:
  - `shared/contracts/game.ts:447`
  - `shared/schemas/worldAction.ts:23`
  - `shared/domain/rules.ts:2833`
- Impact: Upsert/dup filtering can fail.

### D2 `sourceMode` vs `source` mismatch
- Evidence:
  - `shared/contracts/game.ts:450`
  - `shared/schemas/worldAction.ts:24`
  - `server/src/application/world/WorldService.ts:386`
- Impact: Audit metadata is dropped/undefined.

### D3 `requestedTick/requestedWorldVersion` vs `tick/worldVersion` mismatch
- Evidence:
  - `shared/contracts/game.ts:452`
  - `shared/schemas/worldAction.ts:27`
- Impact: Logs read through typed contract can be blank/wrong.

### D4 `message` required in contract but schema emphasizes `note`
- Evidence:
  - `shared/contracts/game.ts:454`
  - `shared/schemas/worldAction.ts:30`
- Impact: UI and audit copy can degrade or go empty.

## Frontend/Dev Findings

### F1 Hook dependency warnings indicate stale-closure risk in map interaction
- Evidence: `src/App.tsx:2323`, `src/components/pixi/PixiMapBoard.tsx:509`.
- Impact: Under rapid state updates, interactions/animations may run on stale references.

### F2 Lint baseline currently red in project paths used for delivery
- Evidence from entrypoint run:
  - `server/src/ai-server.ts:130`
  - `server/src/evals/runDualPlayerSimulation.ts:209`
  - `server/src/evals/runMultiFactionSimulation.ts:160`
  - `shared/domain/rules.ts:1027`
  - `src/components/panels/SettingsPanel.tsx:4`
- Impact: Raises regression risk and slows CI hardening.

## Message To Copilot / Claude
- ????????????????????????????????
- ?????????????? + ???? + ??????????????????????
- ????????
  1. ? `queuePlanExecution` ? `executeOrderStep` ???? `unit.faction === execution faction`?
  2. ?? `shared/contracts` ? `shared/schemas`??? planning history / clearPlanExecution??
  3. ????????????????? CORS ? allowlist?

## Suggested Skills For Collaboration
- `gh-address-comments`: ????????? PR review ????????
- `notion-knowledge-capture`: ????????????????
- `skill-creator`: ???????????????? Skill??


## Supplemental Findings (Restarted Agent)

### R1 InMemory memory IDs can repeat after cap
- Evidence: `server/src/agents/memory/MemoryStore.ts:37`, `server/src/agents/memory/MemoryStore.ts:43`
- Impact: record IDs become unstable for the same agent once history exceeds 200 entries.

### R2 General profile persistence lacks shutdown flush
- Evidence: `server/src/agents/general/GeneralProfileStore.ts:57`, `server/src/agents/general/GeneralProfileStore.ts:104`, `server/src/app.ts:307`
- Impact: latest profile/memory updates can be lost on abrupt exit during debounce window.

### R3 Reflect dominant faction inference is polluted by mixed actor IDs
- Evidence: `server/src/agents/reflect/ReflectService.ts:314`, `server/src/agents/reflect/ReflectService.ts:620`
- Impact: tactical skills may be attributed to wrong faction.
