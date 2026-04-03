# Unity World Action Calls

## Scope

This note documents the Unity-side request/response contract for `POST /api/world/action`.
It is based on the current server implementation in:
- `shared/schemas/worldAction.ts`
- `server/src/routes/world.ts`
- `server/src/application/world/WorldService.ts`

## Transport

- Method: `POST`
- URL: `/api/world/action`
- Optional query: `includeWorld=1|true|yes`
- Default behavior: if `includeWorld` is omitted or any non-truthy value is used, the response does **not** include the full `world` snapshot.

Use `includeWorld=1` only when Unity needs a fresh world payload immediately after the mutation. For high-frequency calls, keep it off to reduce payload size.

## Common Response Shape

All world actions return the shared `WorldActionResponse` envelope:

```ts
{
  ok: boolean
  worldVersion: number
  tick: number
  world?: WorldState
  message?: string
  unitId?: string
  domainAgenda?: DomainAgenda
  domainCommMetrics?: DomainCommMetricsSnapshot
  domainMessages?: BusMessage[]
  nationalAgenda?: NationalAgendaWindow
  courtSession?: CourtSession
  civilMemoryEntries?: CivilMemoryEntry[]
}
```

Practical meaning:
- `ok`: whether the mutation succeeded.
- `worldVersion` / `tick`: authoritative state after the call finishes.
- `world`: present only when `includeWorld` is truthy.
- `message`: human-readable success or failure note.
- `unitId`: echoed by some unit actions on success.
- `advanceTick` adds `nationalAgenda` and `courtSession`.

## Action Contracts

### 1) `queuePlanExecution`

Request body:

```json
{
  "action": "queuePlanExecution",
  "payload": {
    "plan": {},
    "source": "...",
    "strategicCommand": "...",
    "requestId": "unique-request-id",
    "basedOnWorldVersion": 123,
    "factionId": "player",
    "plannerNote": "optional",
    "plannerExplanation": "optional",
    "planningRationale": ["optional"],
    "dispatchGenerals": true,
    "generalConcurrency": 4,
    "generalSide": "player",
    "generalDirectives": [
      {
        "generalId": "g-1",
        "instruction": "Hold the eastern line",
        "targetTileId": "tile_12",
        "action": "moveUnit"
      }
    ],
    "executionMode": "replace",
    "expectedExecutionRequestId": "optional-id"
  }
}
```

Field notes:
- `plan`, `source`, `strategicCommand`, `requestId`, `basedOnWorldVersion` are required.
- `factionId` defaults to `player` on the server if omitted.
- `executionMode` accepts `replace`, `append`, or `reject_if_active`.
- `generalDirectives` is optional and capped by schema validation.

Response:
- Base `WorldActionResponse` only.
- No extra action-specific fields are added.
- On success, the world execution queue for the target faction is updated.

### 2) `advanceTick`

Request body:

```json
{
  "action": "advanceTick"
}
```

Response:
- Base `WorldActionResponse`
- Extra fields:
  - `nationalAgenda`
  - `courtSession`

Use this after `queuePlanExecution` when you want the authoritative rules engine to consume the queued plan and resolve the world step.

### 3) `clearPlanExecution`

Request body:

```json
{
  "action": "clearPlanExecution",
  "payload": {
    "factionId": "player"
  }
}
```

Field notes:
- `payload` is optional.
- `payload.factionId` is optional.
- If omitted, the server clears the `player` faction execution slot.

Response:
- Base `WorldActionResponse` only.
- No extra action-specific fields are added.

Use this to cancel stale plans before re-queuing or when abandoning the current execution.

### 4) `moveUnit`

Request body:

```json
{
  "action": "moveUnit",
  "payload": {
    "unitId": "unit_001",
    "targetTileId": "tile_024"
  }
}
```

Field notes:
- Both `unitId` and `targetTileId` are required.
- This is a direct authoritative world mutation, not a planning wrapper.

Response:
- Base `WorldActionResponse`
- Success additionally echoes `unitId`

Failure handling:
- `ok: false` with `message` explains the rule failure.
- `world` is still returned if `includeWorld` is truthy, even on failure.

## Minimal Call Sequence

### A. Plan-driven loop

1. `GET /api/world` to read the current `worldVersion` and the latest visible world state.
2. `POST /api/world/action?action=queuePlanExecution` with `basedOnWorldVersion` set to the version from step 1.
3. `POST /api/world/action?action=advanceTick` to let the rule engine execute the queued plan.
4. Optional: read the returned `worldVersion`, `tick`, `nationalAgenda`, and `courtSession` for UI refresh.

### B. Cancel and re-plan

1. `POST /api/world/action?action=clearPlanExecution` when the current plan is stale or should be abandoned.
2. `POST /api/world/action?action=queuePlanExecution` with the replacement plan.
3. `POST /api/world/action?action=advanceTick`.

### C. Direct unit move

1. `POST /api/world/action?action=moveUnit` with `unitId` and `targetTileId`.
2. If you want the rest of the simulation to advance, call `advanceTick` separately.

## Unity Recommendation

For most UI flows:
- Use `includeWorld=0` for high-frequency actions.
- Only request `includeWorld=1` when the UI must rehydrate immediately after a mutation.
- Always keep `requestId` unique for each queued plan.
- Treat `worldVersion` as the optimistic concurrency marker for plan submission.
