# M01-M18 Split Execution And Gate Acceptance (2026-03-26)

## 0. Encoding And Entry Declarations
- Reused formal entrypoints: `npm run lint`, `npm run build`, `npm run test:planner:prompt`, `npm run eval:planning:offline`, `npm run eval:orchestrator:stress`, `npm run gate:phase5:hardening`, `npm run sim:13factions`.
- No one-off validation script was created in this round.
- This report is written with UTF-8.

## 1. 12 Engineer Lanes: Implemented Splits

### Batch A (M01-M08)
1. M01 `AI-BE-EntryRuntime`
   - Added: `server/src/runtime/runtimeConfig.ts`
   - Updated: `server/src/app.ts`
2. M02/M19 `AI-BE-RuleState`
   - Added: `server/src/application/world/persistence/worldPersistencePaths.ts`
   - Updated: `server/src/application/world/WorldService.ts`
3. M03 `AI-Agent-Commander`
   - Added: `server/src/infra/llm/plannerPrompt.ts`
   - Updated: `server/src/infra/llm/plannerProtocol.ts`
4. M04 `AI-Agent-General`
   - Added: `server/src/agents/general/chatMode.ts`
   - Updated: `server/src/agents/general/GeneralChatService.ts`
5. M05 `AI-Agent-ReflectMemory`
   - Added: `server/src/agents/reflect/reflectMemoryMeta.ts`
   - Updated: `server/src/agents/reflect/ReflectService.ts`
6. M06/M07/M08 `AI-Agent-GovDiplo`
   - Added: `server/src/routes/sessionBody.ts`
   - Updated: `server/src/routes/session.ts`

### Batch B (M09-M17)
7. M09/M13 `AI-BE-WorldMeta`
   - Added: `server/src/routes/v2RequestBody.ts`
   - Updated: `server/src/routes/v2game.ts`
8. M10/M12 `AI-Platform-ModelGateway`
   - Added: `server/src/application/ai/aiRouteBody.ts`
   - Updated: `server/src/routes/ai.ts`
9. M11 `AI-Platform-Observability`
   - Added: `server/src/infra/rag/replayRagCache.ts`
   - Updated: `server/src/infra/rag/retrieveReplays.ts`
10. M14 `AI-Shared-Contracts`
    - Added: `shared/domain/pathHeuristic.ts`
    - Updated: `shared/domain/hpaStar.ts`
11. M15/M17 `AI-FE-CommandSurface`
    - Added: `src/game/selectors/appDerived.ts`
    - Updated: `src/App.tsx`
12. M16 `AI-FE-MapSurface`
    - Added: `src/components/pixi/tileId.ts`
    - Updated: `src/components/pixi/PixiMapBoard.tsx`, `src/components/pixi/MarchAnimator.ts`
13. M02 `AI-BE-RuleState` (wave-2 extraction in this round)
    - Added: `server/src/application/world/layout/worldMapLayoutChunkBuilder.ts`
    - Updated: `server/src/application/world/WorldService.ts`
    - Extracted map-chunk building helpers out of `WorldService.ts` to enable deeper parallel splitting.
14. M02 `AI-BE-RuleState` (wave-3 lock extraction in this round)
    - Added: `server/src/application/world/runtime/worldMutationLock.ts`
    - Updated: `server/src/application/world/WorldService.ts`
    - Added unified mutation lock across tick/plan/manual actions to prevent async write interleaving.
15. M14 `AI-Shared-Contracts` (rule helper split in this round)
    - Added: `shared/domain/ruleLabels.ts`
    - Updated: `shared/domain/rules.ts`
    - Extracted semantic label helpers with backward-compatible `actionLabel` re-export.
16. M16 `AI-FE-MapSurface` (palette split in this round)
    - Added: `src/components/pixi/palette.ts`
    - Updated: `src/components/pixi/PixiMapBoard.tsx`
    - Extracted palette/label helpers to reduce render file size and enable parallel layer work.
17. M14 `AI-Shared-Contracts` (domain split in this round)
    - Added: `shared/contracts/game/ws.ts`, `shared/contracts/game/v2.ts`
    - Updated: `shared/contracts/game.ts`
    - Split WebSocket/V2 contracts into domain files and kept facade re-export from `game.ts`.
18. M15/M17 `AI-FE-CommandSurface` (hooks/panels/flows split in this round)
    - Added: `src/app/hooks/useCommandSurface.ts`, `src/app/flows/tacticalCandidates.ts`, `src/app/panels/overlayRegistry.ts`
    - Updated: `src/App.tsx`
    - Extracted planning-note hook, tactical candidate flow, and HUD overlay panel registry.
19. M18 `AI-QA-Gates` (formal lock test entrypoint)
    - Added: `server/tests/world_mutation_lock.test.ts`
    - Updated: `package.json`
    - Added native test entry `npm run test:world:mutation-lock` for world mutation lock contention/release checks.

## 2. Additional Quality Fixes In This Round
1. Fixed `planner_prompt` failing test
   - Updated: `server/src/fallback/mockPlanner.ts`
   - Added conservative/intel constraints output such as `intel_first_no_blind_push`.
2. Cleared lint issues
   - Updated: `server/src/infra/store/RedisWorldStore.ts`
   - Updated: `src/App.tsx`
   - Updated: `src/components/pixi/PixiMapBoard.tsx`
3. Hardened request body validation and status mapping
   - Updated: `server/src/routes/http.ts`, `server/src/app.ts`, `server/src/routes/planning.ts`, `server/src/routes/world.ts`, `server/src/routes/ai.ts`, `server/src/routes/nation.ts`
   - Added explicit 400/413 handling (`HttpBodyError`) to avoid generic 500 for malformed/oversized JSON.
4. Hardened nation founding input safety
   - Updated: `server/src/application/nation/NationService.ts`
   - Added explicit unsupported-faction guard (`Unsupported factionId: ...`) to avoid runtime crashes.
5. Improved observability cache write reliability
   - Updated: `server/src/infra/rag/replayRagCache.ts`
   - Switched to temp-file + rename atomic persistence strategy.
6. Reduced WebSocket battle-report duplication risk
   - Updated: `server/src/application/world/WorldService.ts`
   - Broadcast now sends only newly-added battle records per tick.
7. Hardened WebSocket subscribe authorization
   - Updated: `server/src/ws/GameWebSocket.ts`
   - Player-controlled faction subscriptions now require token and enforce token-faction match.
8. Added world mutation serialization guard
   - Added: `server/src/application/world/runtime/worldMutationLock.ts`
   - Updated: `server/src/application/world/WorldService.ts`
   - All major world write actions now use a unified lock and return `world mutation busy` when contested.
9. Added formal lock regression test
   - Added: `server/tests/world_mutation_lock.test.ts`
   - Updated: `package.json`
   - Verifies lock primitive lifecycle + contested world write rejection during `advanceTickAction`.
10. Completed App split seed for parallel lanes
   - Added: `src/app/hooks/useCommandSurface.ts`, `src/app/flows/tacticalCandidates.ts`, `src/app/panels/overlayRegistry.ts`
   - Updated: `src/App.tsx`
   - Moves note classification, overlay registry, and tactical candidate flow out of mega file.
11. Installed one performance-oriented skill only
   - Installed: `develop-web-game` (from curated skills)
   - Scope: targeted capability expansion for web game performance/design iteration, avoiding unrelated skill sprawl.

## 3. Acceptance Results (Formal Entrypoints)
1. `npm run lint`: PASS (0 error, 0 warning)
2. `npm run build`: PASS
3. `npm run test:planner:prompt`: PASS
4. `npm run eval:planning:offline`: PASS (`fullPassRate=0.8`, case-003 still has tactical-quality gap)
5. `npm run eval:orchestrator:stress`: PASS (`successRate=1`)
6. `npm run gate:phase5:hardening`: PASS (`passed=true`)
7. `npm run sim:13factions`: PASS (20 ticks / 13 factions / 260 planning calls / 0 planning failures; full run requires ~12 min)
8. `npx tsx server/src/evals/runMultiFactionSimulation.ts --mode mock --ticks 5 --output tmp/sim_13f_smoke.json`: PASS (smoke rerun after latest fixes)
9. `npm run test:world:mutation-lock`: PASS

## 4. Debris Cleanup
- Removed 130 obsolete temp scripts and historical temp test artifacts under `tmp/`.
- Removed an additional 274 root temp files and 10 obsolete temp directories under `tmp/`.
- Kept latest reproducible artifacts and runtime data:
  - `tmp/sim_13f_latest.json`
  - `tmp/sim_13f_latest_chronicle.md`
  - `tmp/world_snapshot.json`
  - `tmp/narrative_events.json`
  - `tmp/civil_memory_ledger.json`
  - `tmp/court_sessions.json`
  - `tmp/replay_rag_index_cache.json`
  - Runtime dirs: `tmp/general_profiles`, `tmp/general_chats`, `tmp/diplomacy`, `tmp/gates`

## 5. Next Split Wave
1. `server/src/application/world/WorldService.ts`
   - Split into `tick/`, `layout/`, `intel/`, `persistence/` services.
2. `src/App.tsx`
   - Split into `hooks/` (state + commands), `panels/` containers, `flows/` interactions.
3. `src/components/pixi/PixiMapBoard.tsx`
   - Split into `layers/`, `viewport/`, `interaction/`, `animation/`.

---

Conclusion: M01-M18 wave-1 has moved from planning into real split implementation, gate-verifiable acceptance, and maintainability cleanup.

## 6. Round-2 Sub-Agent Outputs (1~2 Concurrency)
1. Backend planning/risk audit (Ptolemy)
   - Scope: M01/M02/M03/M09/M10/M11/M14 docs + codebase read-only audit.
   - Delivered: P0/P1 split backlog with acceptance gates, and prioritized risk list (world mutation serialization, ws subscribe auth, nation faction validation, cache atomicity, battle report delta strategy).
2. Frontend/UE planning audit (Sartre)
   - Scope: M15/M16/M17 docs + current FE code read-only audit.
   - Delivered: App/Pixi split architecture, UE thin-client integration path (reuse existing HTTP/WS contracts), and 5 concrete FE performance/bug risks with acceptance checks.

## 7. Next Execution Queue (Derived From Sub-Agent Proposals)
1. P0: Continue splitting `server/src/application/world/WorldService.ts` into command/query/tick/persistence modules (facade preserved).
2. P0: Split `shared/domain/rules.ts` and `shared/contracts/game.ts` with backward-compatible re-exports.
3. P0: Split FE `src/App.tsx` into hooks + panels; split `src/components/pixi/PixiMapBoard.tsx` into layers/interaction modules.
4. P1: Continue `shared/contracts/game.ts` modular split (facade + re-exports, no API break).


## 8. Wave-2 Execution Update (2026-03-26 Late Night)
1. M15/M17 `AI-FE-CommandSurface`
   - Added: `src/app/flows/tileActionPreview.ts`
   - Updated: `src/App.tsx`
   - Outcome: extracted tile action preview/path estimation flow with no API break.
2. M16 `AI-FE-MapSurface`
   - Added: `src/components/pixi/PixiMapBoardLayers.ts`, `src/components/pixi/PixiMapBoardViewport.ts`, `src/components/pixi/PixiMapBoardInteraction.ts`, `src/components/pixi/PixiMapBoardAnimation.ts`
   - Updated: `src/components/pixi/PixiMapBoard.tsx`
   - Outcome: split Pixi board into rendering/viewport/interaction/animation modules; entrypoint preserved.
3. M02/M19 `AI-BE-RuleState`
   - Added: `server/src/application/world/persistence/worldPersistence.ts`
   - Updated: `server/src/application/world/WorldService.ts`
   - Outcome: extracted world + narrative persistence from `WorldService` with facade preserved.
4. M14 `AI-Shared-Contracts`
   - Updated: `shared/contracts/game.ts`
   - Added: `shared/contracts/game/common.ts`, `shared/contracts/game/planning.ts`, `shared/contracts/game/history.ts`, `shared/contracts/game/ai.ts`, `shared/contracts/game/meta.ts`, `shared/contracts/game/world.ts`
   - Outcome: domain-based contracts split + facade re-export, no API break.

Wave-2 gate evidence (official entrypoints):
- `npm run lint`: PASS
- `npm run build`: PASS
- `npm run test:world:mutation-lock`: PASS
- `npm run eval:planning:offline`: PASS
- `npm run eval:orchestrator:stress`: PASS
- `npm run gate:phase5:hardening`: PASS
