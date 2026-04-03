# Shared Contracts and Schemas Audit (multi-agent parallel review)

## Scope
- `shared/contracts/*`
- `shared/schemas/*`
- `server/src/routes/*`
- `server/src/application/world/*`
- `src/api/*`

## Repro via official entrypoints
- `npm run build`: PASS
- `npm run test:planner:prompt`: FAIL (not caused by the schema drift items below, but test chain is currently not green)

## Findings

### P0 - `appendPlanningJobHistory` schema is incompatible with contract, can persist malformed history entries
- Contract expects `PlanningJobHistoryEntry` fields like `id/sourceMode/requestedTick/requestedWorldVersion/message`.
  - `C:/Users/Buffoon Queer/Desktop/8989/shared/contracts/game.ts:440`
  - `C:/Users/Buffoon Queer/Desktop/8989/shared/contracts/game.ts:450`
  - `C:/Users/Buffoon Queer/Desktop/8989/shared/contracts/game.ts:851`
- Schema validates a different shape: `requestId/source/tick/worldVersion/createdAt/note/error`.
  - `C:/Users/Buffoon Queer/Desktop/8989/shared/schemas/worldAction.ts:23`
- Route and service consume contract fields (`entry.message`, `entry.id`, `entry.sourceMode`), so schema-valid payloads can still write malformed records at runtime.
  - `C:/Users/Buffoon Queer/Desktop/8989/server/src/routes/world.ts:71`
  - `C:/Users/Buffoon Queer/Desktop/8989/server/src/application/world/WorldService.ts:373`
  - `C:/Users/Buffoon Queer/Desktop/8989/shared/domain/rules.ts:2833`
- Impact: dedupe key can fail (`id` missing), AI logs may show undefined fields, replay/trace auditability degrades.

### P1 - `clearPlanExecution` drift across schema, route, and contract
- Schema allows `payload.factionId`.
  - `C:/Users/Buffoon Queer/Desktop/8989/shared/schemas/worldAction.ts:74`
- Service supports `factionId` parameter.
  - `C:/Users/Buffoon Queer/Desktop/8989/server/src/application/world/WorldService.ts:1363`
- Route drops payload and always clears default `player` execution.
  - `C:/Users/Buffoon Queer/Desktop/8989/server/src/routes/world.ts:85`
- Shared contract does not declare this payload.
  - `C:/Users/Buffoon Queer/Desktop/8989/shared/contracts/game.ts:897`
- Impact: callers cannot clear execution for a specific faction even though parts of the stack imply support.

### P1 - `StrategicPlan.orders` constraints conflict between type and schema
- Type has no minimum cardinality: `orders: StructuredOrder[]`.
  - `C:/Users/Buffoon Queer/Desktop/8989/shared/contracts/game.ts:398`
- Schema requires `orders.min(1)`.
  - `C:/Users/Buffoon Queer/Desktop/8989/shared/schemas/planning.ts:27`
- Service contains explicit empty-plan fallback (`orders: []`).
  - `C:/Users/Buffoon Queer/Desktop/8989/server/src/application/world/WorldService.ts:673`
- Impact: type-valid inputs can still fail with runtime 400.

### P2 - `queuePlanExecution.factionId` exists in schema and frontend, but not in shared contract
- Schema includes optional `factionId`.
  - `C:/Users/Buffoon Queer/Desktop/8989/shared/schemas/worldAction.ts:45`
- Frontend request shape includes `factionId`.
  - `C:/Users/Buffoon Queer/Desktop/8989/src/api/worldClient.ts:189`
- Shared contract payload does not include `factionId`.
  - `C:/Users/Buffoon Queer/Desktop/8989/shared/contracts/game.ts:860`
- Impact: shared contract is no longer the single source of truth for this endpoint.

### P2 - `/api/v2/army/create` bypasses shared schema
- This route parses payload manually and has no shared schema/contract entry.
  - `C:/Users/Buffoon Queer/Desktop/8989/server/src/routes/v2game.ts:132`
- Impact: higher drift risk versus other V2 routes that use zod safeParse.

## Message for Copilot and Claude
1. Align `appendPlanningJobHistory` fields across contract, zod schema, and service in one change.
2. Decide and document whether `clearPlanExecution` supports faction-specific clear; update contract, route, and frontend together.
3. Choose one source of truth for `StrategicPlan.orders` minimum size, then enforce it consistently.
4. Generate zod action schemas from shared contract definitions (or from one canonical source) to prevent future three-way drift.
