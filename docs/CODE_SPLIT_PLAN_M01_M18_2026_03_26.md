# M01-M18 Code Split Plan (Parallel 13-Engineer Mode) - 2026-03-26

## Scope and Commitments
- Scope: first-pass split planning for `M01 ~ M18` (no source-code refactor in this change).
- Reused official entrypoints only: module entrypoints from `module_manifest_2026_03_25.json` + global gates (`npm run lint`, `npm run build`, `npm run eval:planning:offline`, `npm run eval:orchestrator:stress`, `npm run gate:phase5:hardening`).
- Commitment: this planning task does **not** create any new validation script as formal proof.
- Encoding safety: document generated via `py -3.11` and `encoding='utf-8'`.

## 12 Sub-Agent Lanes + 1 QA Gate
- Parallel structure is organized by the fixed 13-lane topology (12 owner lanes + AI-QA-Gates).
- Each lane receives non-overlapping primary write paths; cross-lane touch requires co-review by owner lane and M18 gate.

## Cross-Module Split Rules (Anti-Chaos)
1. Keep old module facade files as compatibility re-export for at least one cycle.
2. Never change API contract and route path while doing first-wave split.
3. Split by responsibility first, not by arbitrary line count.
4. Every lane ships in small slices (<= 3 files per PR when touching hot modules).
5. M14 (shared contracts/schema/domain ABI) is the compatibility arbiter for cross-module types.
6. M18 runs formal entrypoint verification before merge verdict.

## AI-BE-EntryRuntime
- Owned modules: M01
### M01 - Runtime Gateway
- Top large files (approx LOC):
  - `server/src/app.ts` (~339 LOC)
  - `server/src/bootstrap/loadEnv.ts` (~81 LOC)
  - `server/src/routes/http.ts` (~37 LOC)
- Proposed split architecture:
  - server/src/runtime/serverFactory.ts: createServer + middleware bootstrap
  - server/src/runtime/routeDispatcher.ts: pathname/method dispatch table
  - server/src/runtime/lifecycle.ts: graceful shutdown + flush hooks
  - server/src/routes/http/body.ts + server/src/routes/http/response.ts: request body & JSON writer separation
- Stable interfaces/contracts:
  - Keep app entry import path `server/src/app.ts` as facade only
  - Route handlers remain in existing route modules; dispatcher only calls handler signatures `(req,res,...)`
  - No change to `/api/health` response contract
- Parallel workstreams (2-4):
  - WS1: Runtime bootstrap extraction (no behavior change)
  - WS2: Route dispatch table migration
  - WS3: Lifecycle/shutdown hook extraction + smoke run `npm run server:dev`
- Formal acceptance entrypoints:
  - `npm run server:dev`
  - `GET /api/health`
- Risks and rollback points:
  - Risk: startup ordering regression; rollback: keep `app.ts` legacy dispatcher behind one switch for 1 release cycle

## AI-BE-RuleState
- Owned modules: M02
### M02 - World Rule Kernel
- Top large files (approx LOC):
  - `server/src/application/world/WorldService.ts` (~2803 LOC)
  - `server/src/routes/world.ts` (~158 LOC)
- Proposed split architecture:
  - server/src/application/world/query/WorldReadService.ts: snapshot/summary/layout reads
  - server/src/application/world/command/WorldCommandService.ts: move/upgrade/deploy/queue actions
  - server/src/application/world/directive/GeneralDirectiveService.ts: directive parsing/matching
  - server/src/application/world/tick/AdvanceTickService.ts: tick orchestration
  - server/src/application/world/persistence/WorldPersistence.ts + NarrativePersistence.ts
  - server/src/application/world/events/WorldEventLog.ts + ReplayArchive.ts
- Stable interfaces/contracts:
  - Keep exported facade names in `WorldService.ts` (re-export wrappers)
  - `server/src/routes/world.ts` signatures unchanged
  - Mutation remains authoritative through shared domain rules, no front-end bypass
- Parallel workstreams (2-4):
  - WS1: Read-model split (query/layout/summary)
  - WS2: Command + directive split
  - WS3: Persistence/event/history split with replay invariants
- Formal acceptance entrypoints:
  - `POST /api/world/action`
  - `GET /api/world`
- Risks and rollback points:
  - Risk: hidden shared mutable state; rollback: retain single-state container module and incremental move by function groups

## AI-Agent-Commander
- Owned modules: M03
### M03 - Planning and Commander
- Top large files (approx LOC):
  - `server/src/agents/tools/CommanderTools.ts` (~679 LOC)
  - `server/src/infra/llm/plannerProtocol.ts` (~440 LOC)
  - `server/src/infra/llm/OpenAICompatPlannerAdapter.ts` (~436 LOC)
  - `server/src/fallback/mockPlanner.ts` (~387 LOC)
  - `server/src/agents/commander/CommanderAgent.ts` (~220 LOC)
- Proposed split architecture:
  - server/src/agents/tools/commander/context/*: doctrine/memory/narrative collectors
  - server/src/agents/tools/commander/analysis/*: risk/frontline/opportunity derivation
  - server/src/infra/llm/protocol/{messages,normalizer,parser}.ts
  - server/src/infra/llm/adapter/{request,retry,cost,env}.ts
  - server/src/application/planning/PlanningFacade.ts as stable orchestration surface
- Stable interfaces/contracts:
  - `POST /api/planning/create` payload and response schema unchanged
  - `ModelGatewayAdapter` interface unchanged; only internals split
  - Planner fallback/mock entry remains callable by existing tests
- Parallel workstreams (2-4):
  - WS1: CommanderTools decomposition
  - WS2: plannerProtocol decomposition
  - WS3: OpenAI adapter decomposition + regression via prompt test
- Formal acceptance entrypoints:
  - `POST /api/planning/create`
  - `npm run test:planner:prompt`
- Risks and rollback points:
  - Risk: normalization drift; rollback: keep golden parser fixtures and fallback to legacy parser path

## AI-Agent-General
- Owned modules: M04
### M04 - General Operations and Chat
- Top large files (approx LOC):
  - `server/src/agents/general/GeneralChatService.ts` (~542 LOC)
  - `server/src/agents/general/GeneralAgent.ts` (~406 LOC)
  - `server/src/agents/general/GeneralProfileStore.ts` (~346 LOC)
  - `server/src/agents/general/GeneralUtilityAI.ts` (~323 LOC)
  - `server/src/agents/general/GeneralLLMAdapter.ts` (~277 LOC)
- Proposed split architecture:
  - server/src/agents/general/dispatch/{taskBuilder,orderResolver,executor}.ts
  - server/src/agents/general/chat/{sessionStore,modeDetector,promptBuilder,commandParser}.ts
  - server/src/agents/general/profile/{store,persistence,personality,reflectFeedback}.ts
  - server/src/agents/general/utility/{candidateBuilder,scoring,selector}.ts
- Stable interfaces/contracts:
  - `runGeneralDispatch` and chat route signatures stable
  - General profile persisted JSON schema backward compatible
  - No cross-module writes outside defined store APIs
- Parallel workstreams (2-4):
  - WS1: General dispatch pipeline split
  - WS2: GeneralChatService split
  - WS3: Profile+Utility split with unit-level smoke checks
- Formal acceptance entrypoints:
  - `GET /api/generals`
  - `POST /api/generals/:id/chat`
- Risks and rollback points:
  - Risk: chat/session persistence race; rollback: keep old session flush path selectable by env flag

## AI-Agent-ReflectMemory
- Owned modules: M05
### M05 - Reflect Memory and Tactical Skills
- Top large files (approx LOC):
  - `server/src/agents/reflect/ReflectService.ts` (~751 LOC)
  - `server/src/agents/memory/MemoryStore.ts` (~292 LOC)
  - `server/src/agents/memory/CivilMemoryStore.ts` (~273 LOC)
  - `server/src/agents/tools/TacticalSkillLibrary.ts` (~209 LOC)
  - `server/src/agents/memory/CivilMemoryService.ts` (~126 LOC)
- Proposed split architecture:
  - server/src/agents/reflect/context/ReflectContextBuilder.ts
  - server/src/agents/reflect/drafts/{battle,alliance,report}.ts
  - server/src/agents/reflect/consequence/{causalChain,generalOutcome}.ts
  - server/src/agents/reflect/persistence/{NarrativeSink,MemorySink}.ts
  - server/src/agents/memory/providers/{InMemoryProvider,Mem0Provider}.ts
- Stable interfaces/contracts:
  - Keep `reflectWorldTick` facade and return type stable
  - Keep `memory.add/search` semantic contract and agent_id scope invariant
  - `GET /api/narratives` + `GET /api/civil-memory` payload shape unchanged
- Parallel workstreams (2-4):
  - WS1: Reflect context/draft split
  - WS2: Consequence+grievance split
  - WS3: Memory provider split with fallback invariants
- Formal acceptance entrypoints:
  - `advanceTick post-hook`
  - `GET /api/narratives`
  - `GET /api/civil-memory`
- Risks and rollback points:
  - Risk: duplicate narrative writes; rollback: idempotency key by tick+event hash and old sink fallback

## AI-Agent-GovDiplo
- Owned modules: M06, M07, M08
### M06 - Governance (CommBus Court Agenda)
- Top large files (approx LOC):
  - `server/src/agents/commBus/DomainCommBus.ts` (~485 LOC)
  - `server/src/agents/court/CourtService.ts` (~317 LOC)
  - `server/src/agents/commBus/AgendaCompiler.ts` (~199 LOC)
  - `server/src/agents/court/CourtStore.ts` (~78 LOC)
- Proposed split architecture:
  - server/src/agents/commBus/runtime/{actorInference,messageRouting,quota}.ts
  - server/src/agents/commBus/agenda/{intentBuckets,compiler,preview}.ts
  - server/src/agents/court/{seatBuilder,votePolicy,deadlockGuard,sessionRunner}.ts
- Stable interfaces/contracts:
  - `previewDomainAgenda`/`previewNationalAgenda`/`previewCourtSession` action contracts unchanged
  - Agenda output schema remains in shared contracts (M14-owned)
  - No direct mutation outside world action pipeline
- Parallel workstreams (2-4):
  - WS1: CommBus runtime split
  - WS2: Agenda compiler split
  - WS3: Court decision pipeline split
- Formal acceptance entrypoints:
  - `POST /api/world/action (previewDomainAgenda/previewNationalAgenda/previewCourtSession)`
  - `GET /api/comm-bus/national-agenda`
  - `GET /api/court/session/latest`
- Risks and rollback points:
  - Risk: agenda ranking drift; rollback: preserve current scoring function as default strategy plugin

### M07 - Diplomacy and Negotiation
- Top large files (approx LOC):
  - `server/src/agents/general/DiplomacyAgent.ts` (~592 LOC)
  - `server/src/agents/general/GeneralNegotiationChannel.ts` (~221 LOC)
  - `server/src/routes/diplomacy.ts` (~172 LOC)
- Proposed split architecture:
  - server/src/agents/general/diplomacy/{proposalStore,prompting,evaluation,worldChange}.ts
  - server/src/routes/diplomacy/{validators,handlers}.ts
  - server/src/agents/general/negotiation/{channelRuntime,messageCodec}.ts
- Stable interfaces/contracts:
  - Proposal lifecycle statuses remain backward compatible
  - Route request/response contract unchanged
  - Negotiation channel remains stateless API to world layer
- Parallel workstreams (2-4):
  - WS1: Proposal persistence split
  - WS2: LLM prompting/eval split
  - WS3: Route/controller split
- Formal acceptance entrypoints:
  - `POST /api/diplomacy/propose`
  - `POST /api/diplomacy/respond`
  - `GET /api/diplomacy/proposals`
- Risks and rollback points:
  - Risk: persisted proposal schema migration errors; rollback: keep loader tolerant and auto-normalize legacy records

### M08 - Session Autonomy Doctrine
- Top large files (approx LOC):
  - `server/src/application/clock/GameClock.ts` (~235 LOC)
  - `server/src/multiplayer/SessionManager.ts` (~206 LOC)
  - `server/src/routes/factionConfigRoutes.ts` (~131 LOC)
  - `server/src/application/faction/FactionConfigStore.ts` (~93 LOC)
  - `server/src/routes/session.ts` (~65 LOC)
- Proposed split architecture:
  - server/src/application/clock/{scheduler,tickPlanner,autonomySwitch}.ts
  - server/src/multiplayer/session/{lifecycle,heartbeat,autonomyProjection,token}.ts
  - server/src/routes/session/{join,heartbeat,leave,status}.ts
  - server/src/routes/faction-config/{validators,handlers}.ts
- Stable interfaces/contracts:
  - `gameClock` public API stable
  - Session endpoints path and payload unchanged
  - Doctrine/autonomy enums remain single source from shared contracts
- Parallel workstreams (2-4):
  - WS1: Clock scheduler split
  - WS2: Session manager split
  - WS3: Route surface split
- Formal acceptance entrypoints:
  - `npm run start:clock`
  - `POST /api/session/join|heartbeat|leave`
  - `GET /api/session/status`
- Risks and rollback points:
  - Risk: heartbeat timeout behavior drift; rollback: dual-run old/new timeout calculation in logs before cutover

## AI-BE-WorldMeta
- Owned modules: M09, M13
### M09 - Nation and Map Meta Services
- Top large files (approx LOC):
  - `server/src/application/map/MapOverviewService.ts` (~237 LOC)
  - `server/src/application/nation/NationService.ts` (~148 LOC)
  - `server/src/routes/nation.ts` (~32 LOC)
  - `server/src/routes/map.ts` (~8 LOC)
- Proposed split architecture:
  - server/src/application/map/overview/{projection,filters,serializers}.ts
  - server/src/application/nation/{profiles,founding,state}.ts
  - route files stay thin controllers
- Stable interfaces/contracts:
  - Map overview and nation profile response contracts unchanged
  - Nation founding side effects remain routed through authoritative world services
  - No new direct store access from routes
- Parallel workstreams (2-4):
  - WS1: Map overview split
  - WS2: Nation service split
  - WS3: Route/controller hardening
- Formal acceptance entrypoints:
  - `GET /api/map/overview`
  - `GET /api/nation/profiles`
  - `POST /api/nation/found`
- Risks and rollback points:
  - Risk: inconsistent map projection fields; rollback: snapshot compare old/new outputs for sampled worlds

### M13 - V2 Growth Gameplay
- Top large files (approx LOC):
  - `server/src/application/v2/V2GameService.ts` (~453 LOC)
  - `server/src/routes/v2game.ts` (~224 LOC)
- Proposed split architecture:
  - server/src/application/v2/player/{aiPlayer,humanPlayer}.ts
  - server/src/application/v2/progression/{recruit,starUpgrade,attribute}.ts
  - server/src/application/v2/army/{compose,create}.ts
  - server/src/application/v2/alliance/{create,join,role}.ts
  - server/src/routes/v2game/{state,recruit,upgrade,army}.ts
- Stable interfaces/contracts:
  - `GET /api/v2/state` and action endpoints remain unchanged
  - State projection object keys unchanged for FE compatibility
  - Resource settlement logic remains deterministic
- Parallel workstreams (2-4):
  - WS1: Player/progression split
  - WS2: Army/alliance split
  - WS3: Route dispatcher split
- Formal acceptance entrypoints:
  - `GET /api/v2/state`
  - `POST /api/v2/recruit|star-upgrade|army/*`
- Risks and rollback points:
  - Risk: state mutation order change; rollback: scenario replay compare before merge

## AI-Platform-ModelGateway
- Owned modules: M10, M12
### M10 - AI Runtime Config and Copilot
- Top large files (approx LOC):
  - `server/src/routes/ai.ts` (~291 LOC)
  - `server/src/ai-server.ts` (~156 LOC)
  - `server/src/routes/copilot.ts` (~108 LOC)
  - `server/src/application/ai/AiConfigService.ts` (~33 LOC)
- Proposed split architecture:
  - server/src/routes/ai/{configHandler,modelsHandler,logsHandler}.ts
  - server/src/application/ai/models/{relayClient,cache,normalizer}.ts
  - server/src/ai-runtime/{concurrency,requestParser,chatProxy}.ts
- Stable interfaces/contracts:
  - `/api/ai/config`, `/api/ai/models`, `/api/copilotkit` contracts unchanged
  - Model list normalization output fields stable
  - Fallback model selection behavior preserved
- Parallel workstreams (2-4):
  - WS1: AI route split
  - WS2: Relay models service split
  - WS3: ai-server runtime split
- Formal acceptance entrypoints:
  - `GET|POST /api/ai/config`
  - `GET /api/ai/models`
  - `POST /api/copilotkit`
- Risks and rollback points:
  - Risk: cache TTL regression; rollback: keep old cache path toggled by env

### M12 - MCP Integration
- Top large files (approx LOC):
  - `server/src/mcp/gameServer.ts` (~420 LOC)
- Proposed split architecture:
  - server/src/mcp/runtime/{toolRegistry,backendClient,outputFormatter}.ts
  - server/src/mcp/tools/{worldSummary,worldSnapshot,generalProfiles,advanceTick,health}.ts
- Stable interfaces/contracts:
  - MCP tool names and parameter schema unchanged
  - Tool output truncation/safe serialization behavior preserved
  - Backend URL/env resolution stable
- Parallel workstreams (2-4):
  - WS1: Tool registry extraction
  - WS2: Per-tool handlers split
  - WS3: Output shaping hardening
- Formal acceptance entrypoints:
  - `npx tsx server/src/mcp/gameServer.ts`
- Risks and rollback points:
  - Risk: tool name mismatch; rollback: compatibility registry aliases old names to new handlers

## AI-Platform-Observability
- Owned modules: M11
### M11 - Observability Replay Streaming
- Top large files (approx LOC):
  - `server/src/infra/rag/retrieveReplays.ts` (~737 LOC)
  - `server/src/ws/GameWebSocket.ts` (~312 LOC)
  - `server/src/config/replayRag.ts` (~179 LOC)
  - `server/src/routes/observability.ts` (~175 LOC)
  - `server/src/routes/replay.ts` (~32 LOC)
- Proposed split architecture:
  - server/src/infra/rag/replay/{indexBuilder,cacheStore,embedder,retriever}.ts
  - server/src/ws/{sessionRegistry,messageHandlers,broadcaster}.ts
  - server/src/routes/observability/{events,slots,narrative}.ts
- Stable interfaces/contracts:
  - SSE/WS endpoint contracts unchanged
  - Replay archive/rag stats schema unchanged
  - Backpressure and output limits preserved
- Parallel workstreams (2-4):
  - WS1: RAG retrieval pipeline split
  - WS2: WebSocket runtime split
  - WS3: Observability routes split
- Formal acceptance entrypoints:
  - `GET /api/events`
  - `GET /api/events/stream`
  - `GET /api/replay/archive`
  - `WS /ws`
- Risks and rollback points:
  - Risk: retrieval scoring drift; rollback: keep old scorer and compare top-k overlap metric

## AI-Shared-Contracts
- Owned modules: M14
### M14 - Shared Contracts Schemas Domain
- Top large files (approx LOC):
  - `shared/domain/rules.ts` (~3248 LOC)
  - `shared/domain/scenario.ts` (~2033 LOC)
  - `shared/contracts/game.ts` (~1317 LOC)
  - `shared/domain/hpaStar.ts` (~453 LOC)
  - `shared/domain/worldHierarchy.ts` (~445 LOC)
- Proposed split architecture:
  - shared/contracts/game/{core,map,unit,planning,diplomacy,governance,v2}.ts + index.ts
  - shared/domain/rules/{tick,movement,combat,economy,city,tech,reserve,directive,replay}.ts + facade
  - shared/domain/scenario/{worldSetup,unitDrafts,heroPools,factories}.ts + index.ts
- Stable interfaces/contracts:
  - Keep current top-level import paths (`shared/contracts/game`, `shared/domain/rules`, `shared/domain/scenario`) as re-export facades
  - Any contract evolution must be additive or version-gated
  - Shared schemas stay authoritative for API validation
- Parallel workstreams (2-4):
  - WS1: Contracts partition + re-export
  - WS2: Rules engine partition by subdomain
  - WS3: Scenario data/factory partition
- Formal acceptance entrypoints:
  - `npm run lint`
  - `npm run build`
- Risks and rollback points:
  - Risk: circular imports across domain files; rollback: dependency graph check + enforce inward-only imports

## AI-FE-CommandSurface
- Owned modules: M15, M17
### M15 - Frontend Command Workspace
- Top large files (approx LOC):
  - `src/App.tsx` (~3547 LOC)
  - `src/api/worldClient.ts` (~888 LOC)
  - `src/components/panels/AiHubPanel.tsx` (~643 LOC)
  - `src/components/screens/GeneralChatPanel.tsx` (~530 LOC)
  - `src/components/panels/HistoryContent.tsx` (~235 LOC)
- Proposed split architecture:
  - src/app-shell/AppShell.tsx: shell composition only
  - src/features/command/hooks/{useWorldSync,usePlanningOps,useHudState}.ts
  - src/features/command/panels/{operations,history,command,alliance,settings}.tsx
  - src/features/command/selectors/{tacticalCandidates,labels}.ts
  - src/api/world-client/{queries,actions,layout-cache,sse,recovery}.ts
- Stable interfaces/contracts:
  - `src/App.tsx` kept as thin compatibility entry
  - Panel prop contracts stable; no direct world mutation from view components
  - worldClient public function names preserved via barrel exports
- Parallel workstreams (2-4):
  - WS1: App shell + hook extraction
  - WS2: Panel/overlay extraction
  - WS3: worldClient decomposition
- Formal acceptance entrypoints:
  - `npm run dev`
- Risks and rollback points:
  - Risk: UI state regression from hook move; rollback: keep snapshot test harness and temporary dual wiring

### M17 - Frontend Domain Mirror
- Top large files (approx LOC):
  - `src/game/ai/mockPlanner.ts` (~158 LOC)
  - `src/game/ai/localPlanner.ts` (~84 LOC)
  - `src/game/ai/planner.ts` (~24 LOC)
  - `src/game/utils/labels.ts` (~5 LOC)
  - `src/game/types.ts` (~2 LOC)
- Proposed split architecture:
  - src/game/ai/{planner,local,mock}.ts kept; add `src/game/domain/index.ts` for typed mirror exports
  - move helpers to `src/game/selectors/` and `src/game/utils/` with strict no-API-call rule
- Stable interfaces/contracts:
  - FE domain mirror remains read-only and ABI-aligned to M14
  - No authoritative rule divergence in frontend mirror
  - Imports from `src/game/index.ts` barrel to reduce conflict
- Parallel workstreams (2-4):
  - WS1: Mirror barrel setup
  - WS2: Selector extraction
  - WS3: Type alignment pass with M14
- Formal acceptance entrypoints:
  - `npm run dev`
  - `npm run build`
- Risks and rollback points:
  - Risk: divergence from shared contracts; rollback: generate/check type alias map in CI

## AI-FE-MapSurface
- Owned modules: M16
### M16 - Frontend Map Rendering
- Top large files (approx LOC):
  - `src/components/pixi/PixiMapBoard.tsx` (~2341 LOC)
  - `src/components/MapBoard.tsx` (~395 LOC)
  - `src/components/pixi/MarchAnimator.ts` (~180 LOC)
  - `src/components/mapViewport.ts` (~93 LOC)
- Proposed split architecture:
  - src/components/pixi/scene/{PixiScene,viewport}.ts
  - src/components/pixi/layers/{terrain,road,unit,overlay,fog}.ts
  - src/components/pixi/interaction/{pointer,selection,tooltip}.ts
  - src/components/pixi/textures/{atlas,preload,lod}.ts
  - retain `PixiMapBoard.tsx` as composition facade
- Stable interfaces/contracts:
  - `PixiMapBoard` props unchanged
  - Map tile render order and z-layer invariants fixed by constants module
  - Animation API remains via `MarchAnimator` adapter
- Parallel workstreams (2-4):
  - WS1: Scene/layer extraction
  - WS2: Interaction extraction
  - WS3: Texture + LOD extraction
- Formal acceptance entrypoints:
  - `npm run dev`
- Risks and rollback points:
  - Risk: render ordering bugs; rollback: visual parity snapshots per zoom tier

## AI-QA-Gates
- Owned modules: M18
### M18 - Evals Tests and Batch Orchestrator
- Top large files (approx LOC):
  - `server/src/evals/tmp/general_profiles.json` (~3570 LOC)
  - `server/src/evals/tmp/replay_rag_index_cache.json` (~1654 LOC)
  - `server/src/evals/runMultiFactionSimulation.ts` (~1495 LOC)
  - `server/src/evals/runDualPlayerSimulation.ts` (~731 LOC)
  - `server/src/evals/tmp/sim_13factions.json` (~420 LOC)
- Proposed split architecture:
  - server/src/evals/sim13/{args,worldFactory,diplomacy,chronicle,runner,report}.ts
  - server/src/evals/dual/{phases,snapshot,gapAnalysis,runner}.ts
  - server/src/evals/common/{io,metrics,assertions}.ts
  - server/src/agents/orchestrator/gates/{planning,stress,hardening}.ts
  - move generated eval artifacts from `server/src/evals/tmp` to `tmp/evals/` (non-source)
- Stable interfaces/contracts:
  - NPM script entrypoints unchanged (`eval:planning:offline`, `eval:orchestrator:stress`, `gate:phase5:hardening`, `sim:13factions`)
  - Gate output summary schema stable for CI
  - Formal verdict remains PASS/FAIL with evidence
- Parallel workstreams (2-4):
  - WS1: Simulation core split
  - WS2: Dual-player eval split
  - WS3: Gate orchestrator + artifact path cleanup
- Formal acceptance entrypoints:
  - `npm run eval:planning:offline`
  - `npm run eval:orchestrator:stress`
  - `npm run gate:phase5:hardening`
  - `npm run sim:13factions`
- Risks and rollback points:
  - Risk: CI path assumptions on tmp artifacts; rollback: keep compatibility read path for one cycle

## Global Verification Order (M18 Gate)
1. Run module entrypoints for changed modules (owner lane evidence).
2. Run global gates in order: `npm run lint` -> `npm run build` -> `npm run eval:planning:offline` -> `npm run eval:orchestrator:stress` -> `npm run gate:phase5:hardening`.
3. If contracts change: enforce M14 co-review before M18 verdict.
4. Verdict output format: `PASS/FAIL`, failed entrypoints, risk level, evidence, required fix owner.

## Phase Plan (Fast Iteration)
- Phase A (Backend hot monoliths): M02, M03, M05, M06, M07.
- Phase B (Shared ABI + FE monoliths): M14, M15, M16.
- Phase C (Platform and runtime cleanup): M01, M08, M10, M11, M12, M13, M17.
- Phase D (QA pipeline split + stabilization): M18 and cross-module hardening.

## Deliverable Standard Per Lane
- Result (EN): one-line technical outcome.
- ??????: ????????
- Validation: official entrypoint commands and pass/fail evidence only.
