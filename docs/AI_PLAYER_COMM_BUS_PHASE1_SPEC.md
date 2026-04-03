# AI Player Communication Bus - Phase 1 Spec (Single Human Domain)

Version: v0.2-draft
Date: 2026-03-20
Status: Draft (implementation-ready)

---

## 1. Goal

Build an intra-domain communication bus for one human owner and up to 10 AI players.

Phase-1 outcomes:
1. AI players can exchange structured requests (intel/support/path/risk/status).
2. Domain-level agenda compression is available (10 AI proposals -> 1 owner-facing agenda).
3. Existing authoritative rule-engine path remains unchanged.

---

## 2. Scope and Non-Goals

### In Scope
1. In-memory intra-domain message bus.
2. Typed message contract + schema validation.
3. Message lifecycle (publish, route, consume, expire, ack/reject).
4. Domain agenda compiler (candidate merge and ranking).
5. Basic metrics and traceability.

### Out of Scope
1. Cross-owner communication.
2. National court (chao-tang) voting and seat governance.
3. External MQ (Kafka / Redis Streams).
4. Full auth/account redesign.

---

## 3. Terms

1. `HumanDomain`: one real player and their managed AI players.
2. `AIPlayer`: independent decision unit in a domain.
3. `BusMessage`: machine-readable communication payload.
4. `DomainAgenda`: compressed owner-facing agenda for current tick window.
5. `TickWindow`: communication processing window per tick.

---

## 4. Design Principles

1. Rule engine remains authoritative; bus never mutates world directly.
2. Structured-first protocol; no free-form raw text on the bus.
3. Throughput safety over completeness (rate limits first).
4. Full traceability (sender, evidence, decision result).
5. Deterministic fallback when LLM path is unavailable.

---

## 5. Topology (Single Domain)

- owner: `H1`
- ai players: `A1..A10`

Modes:
1. Unicast: `A1 -> A3`
2. Multicast: `A2 -> [A4,A5,A6]`
3. Broadcast: `A7 -> domain_all`

---

## 6. Message Contract (AI-first)

```ts
export type CommTopic =
  | 'intel_report'
  | 'intel_request'
  | 'support_request'
  | 'path_coordination'
  | 'target_proposal'
  | 'resource_alert'
  | 'risk_alert'
  | 'status_update'
  | 'agenda_candidate'
  | 'ack'
  | 'reject'

export type CommPriority = 'P0' | 'P1' | 'P2'

export type BusMessage = {
  id: string
  tick: number
  domainId: string
  senderAiPlayerId: string
  receiverAiPlayerIds: string[] // ['domain_all'] for broadcast
  topic: CommTopic
  priority: CommPriority
  ttlTicks: number              // default 2, max 6
  confidence: number            // 0..1
  intent: string                // e.g. reinforce_east_gate
  payload: Record<string, unknown>
  evidenceRefs: string[]
  conflictKey?: string
  dedupeKey?: string
  createdAt: number
}
```

Payload example:

```json
{
  "topic": "support_request",
  "intent": "reinforce_east_gate",
  "payload": {
    "targetTileId": "tile_3210",
    "requiredTroop": 180,
    "deadlineTick": 142,
    "reason": "enemy_pressure_spike"
  }
}
```

---

## 7. Anti-Chaos Controls

### Send Quota
1. Max 3 business messages per AI per tick (`ack/reject` excluded).
2. One extra slot for `P0` message.
3. Overflow goes to deferred queue.

### Receive Quota
1. Max 12 inbound messages consumed per AI per tick.
2. Truncate by `priority > confidence > createdAt`.

### Dedupe and Merge
1. Same `dedupeKey` in same tick keeps highest confidence only.
2. Same `conflictKey` forms one conflict bucket.

### Agenda Compression
1. Each AI can submit at most 1 `agenda_candidate` per tick.
2. DomainAgenda keeps top 5 candidates.
3. Overflow candidates stay as archived notes only.

---

## 8. Conflict Resolution Order

1. Owner explicit directive.
2. Faction doctrine constraints.
3. P0 irreversible risk alerts.
4. Shared support count for same intent.
5. Local utility score.

Every resolution writes `decisionTrace`.

---

## 9. Tick-Time Runtime Sequence

```text
Tick T:
1) Perceive: build per-AI trimmed battlefield summary
2) Publish: AI sends BusMessage (LLM or rule template)
3) Route: bus applies quota/dedupe/conflict merge/ttl
4) Consume: AI consumes inbox and updates local intent
5) Compile: AgendaCompiler outputs DomainAgenda (10->1)
6) Execute: enter existing Commander/General/queuePlanExecution chain
7) Reflect: write communication impact into narrative/memory
```

---

## 10. Integration Points (Current Codebase)

### New Modules
1. `shared/contracts/commBus.ts`
2. `shared/schemas/commBus.ts`
3. `server/src/agents/commBus/DomainCommBus.ts`
4. `server/src/agents/commBus/AgendaCompiler.ts`
5. `server/src/agents/commBus/CommBusStore.ts` (in-memory for phase 1)

### Existing Hook Points
1. `server/src/application/world/WorldService.ts`
- add `runDomainCommWindow(world)` before `advanceTick`.
- treat `DomainAgenda` as upstream planning input, not forced replacement.

2. `server/src/routes/world.ts`
- keep `queuePlanExecution` and `advanceTick` unchanged.
- optional dev-only action: `previewDomainAgenda`.

3. `server/src/multiplayer/SessionManager.ts`
- provide `humanId -> aiPlayerIds` mapping to define domain boundary.

---

## 11. Optional Read APIs

1. `GET /api/comm-bus/domain/:domainId/inbox?aiPlayerId=A3`
2. `GET /api/comm-bus/domain/:domainId/agenda/latest`
3. `GET /api/comm-bus/domain/:domainId/metrics`

Phase 1 can keep publish path internal only.

---

## 12. Metrics

1. `messages_published_per_tick`
2. `messages_delivered_per_tick`
3. `dedupe_drop_count`
4. `conflict_bucket_count`
5. `agenda_candidates_in` / `agenda_candidates_out`
6. `avg_message_latency_ms`
7. `domain_agenda_adoption_rate`

---

## 13. Acceptance Criteria

1. Single domain (1 human + 10 AI) runs for 200 ticks without deadlock/message explosion.
2. DomainAgenda exists every tick (empty agenda must include reason code).
3. Every dropped message has reason code (`quota`, `ttl`, `dedupe`, `conflict`).
4. Consistent structural behavior across mock/local/gateway modes.
5. No breakage to authoritative world mutation path.

---

## 14. Parallel Implementation Tracks

### Track A - Contracts & Validation
1. Create contracts.
2. Create schemas.
3. Add minimal tests via existing official test entrypoints.

### Track B - Bus Core
1. In-memory store.
2. publish/route/consume pipeline.
3. quota + dedupe + conflict bucket.

### Track C - Agenda Compiler
1. 10->1 compression.
2. conflict explainability + decision trace.
3. connect to planning/world service.

### Track D - Observability
1. metrics instrumentation.
2. debug route.
3. read-only AI Hub panel (later).

---

## 15. Risks and Rollback

1. Overly loose payload schema can pollute prompts.
- Mitigation: topic-specific payload schema, no arbitrary keys.

2. Bus overhead can increase token/latency costs.
- Mitigation: default to rule templates; use LLM only for high-value topics.

3. Bus output may conflict with existing planning pipeline.
- Mitigation: bus provides suggestions only.

4. Higher debugging complexity.
- Mitigation: strict reason codes and `decisionTrace`.

---

## 16. Phase 2+ Reserved Extensions

1. Cross-owner communication.
2. Court-seat governance (human + AI seats).
3. National agenda clustering (N owner agendas -> 5~9 national options).
4. Governance vote and execution accountability.

Conclusion: Phase 1 is about ordering one domain first. If 10-AI intra-domain coordination does not converge, alliance/court scale will collapse.
