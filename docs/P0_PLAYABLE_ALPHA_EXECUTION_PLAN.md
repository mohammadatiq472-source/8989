# P0 Execution Master Plan (Playable Alpha)

- Version: v1
- Date: 2026-03-15
- Scope: Single-server playable Alpha (1-5 players + 20-100 AI)
- Role: Single source of truth for P0 execution and progress tracking

## 1. North-Star Outcome

Deliver a playable single-server Alpha without breaking the authoritative rule engine:

1. Support 1-5 real players in one world session.
2. Support 20-100 AI executors (general/unit-level actors) in continuous operation.
3. AI can execute land development, scouting, growth, push, garrison, support, and combat loops under human strategic intent.
4. Players can understand why AI made decisions (explanation, report, replay, narrative events).
5. If model calls fail, the world still advances via controlled fallback.

## 2. Non-Goals for P0

1. No multi-server federation or cross-server sync.
2. No full MMO social stack.
3. No deep economy or full hero progression system.
4. No full Unreal migration.
5. No uncontrolled swarm-style autonomous demos.

## 3. Current Mainline Facts (Code Reality)

1. Authoritative world and rules are already on backend/shared mainline.
2. Commander planning has schema validation, guard, and fallback.
3. GeneralProfile, GeneralDispatch, Reflect, and NarrativeEvent baseline exists.
4. Replay-RAG pipeline exists (default is hash embedding).
5. Persistence is still primarily in-memory (world/events/replay/save-slot).

## 4. Mandatory P0 Deliverables

### 4.1 Command-Execution Loop

1. Lock in `Perceive -> Order -> Execute -> Reflect` as the default runtime path.
2. Keep `queuePlanExecution` general dispatch enabled by default with concurrency control.
3. Ensure general-level persistent context (short memory + long-term summary path).
4. After every tick, produce execution outcomes, battle/report summary, narrative events, and memory writes.

### 4.2 Multi-AI Runtime (20-100)

1. Expose runtime controls for AI concurrency, batching, and rate limits.
2. Validate load tiers at 20 / 50 / 100 AI via official eval entrypoints.
3. Track throughput, P50/P95 latency, fallback ratio, and failure categories.

### 4.3 Real Model Availability

1. Stabilize at least one real model path (`local` or `gateway`) with non-total fallback.
2. Failures must be attributable (network/http/timeout/quota/validation).
3. Keep mock planner as reliability baseline and demo fallback.

### 4.4 Narrative and Explainability

1. Narrative event stream is queryable and replay-linked.
2. `explanation` and `planningRationale` are visible in frontend command workflow.
3. Players can trace actor -> decision -> consequence.

### 4.5 Minimal Persistence Landing

1. Move world snapshot/events/replay/save-slot from pure in-memory to a formal persistence path.
2. Provide minimum restart recovery for key runtime state.

### 4.6 Observability and Evaluation

1. Keep offline eval in CI-like gate flow with explicit thresholds.
2. Stress outputs are JSON-serializable and comparable between builds.
3. Every planning call has trace id, model id, latency, cost, and failure classification.

## 5. Parallel Work Tracks

### Track A: AI Mainline Stability

1. Harden Commander -> General -> Reflect path and error handling.
2. Upgrade generals from record-only behavior to executable strategy behavior.
3. Keep memory recall quality stable under prompt size constraints.

### Track B: World and Persistence

1. Introduce persistent schema for snapshots/events/replays/save-slots.
2. Implement restart recovery and minimal migration strategy.
3. Keep all world mutation authoritative in rules/backend only.

### Track C: Throughput and Concurrency

1. Run official stress entrypoint for 20/50/100 AI tiers.
2. Tune concurrency, batch size, timeout, and fallback policy to stabilize P95.
3. Maintain a living performance baseline section in this document.

### Track D: Frontend Command UX Closure

1. Connect plan explanation, reports, narratives, and replay views.
2. Align AI Hub settings with backend scheduling behavior.
3. Surface key status clearly: active plan, risk, coordination, fallback state.

## 6. Definition of Done (P0)

P0 is complete only when all conditions are met:

1. Single-server runtime supports 1-5 players + 20-100 AI for at least 30 minutes continuous play.
2. At least one real model path is stable (fallback is controlled, not 100%).
3. Human strategic command leads to continuous structured plans and executable world updates.
4. Each cycle emits explainable outputs (explanation/report/replay/narrative).
5. Service restart can recover key state (not a one-shot in-memory world).
6. Offline eval and stress runs are reproducible and archived.

## 7. Official Verification Entrypoints

Use only these as final proof:

1. `npm run build`
2. `npm run lint`
3. `npm run eval:planning:offline`
4. `npm run eval:orchestrator:stress -- --player-agents <N> --enemy-agents <M> --mode <mock|local|gateway> ...`
5. `npm run server:dev` + API smoke (`/api/world`, `/api/planning/create`, `/api/world/action`, `/api/narratives`)

## 8. Mandatory Pre-Coding Context Check

Before any code change, read:

1. `AGENTS.md`
2. `DOCS/PROJECT_DELIVERY_PLAN.md`
3. `DOCS/P0_PLAYABLE_ALPHA_EXECUTION_PLAN.md` (this file)
4. Actual target source files for this change

And explicitly state in work updates:

1. Reused official entrypoints
2. Promise not to create new test scripts
3. If a temporary script is unavoidable, put it under `tmp/` and declare cleanup plan

## 9. Change Control Rules

1. Small scoped changes first; verify first, then expand.
2. All AI output changes must pass schema + guard.
3. Any world mutation path must pass rules layer.
4. If docs and code disagree, update docs to code reality immediately.

## 10. Milestones and Status

### 10.1 Milestones

- M1: Stable single planning path (mock/local/gateway at least one stable)
- M2: Stable 20-50 AI runtime
- M3: Runnable and explainable 100 AI runtime
- M4: Minimal persistence + recovery closed loop
- M5: P0 acceptance pass

### 10.2 Status (Initialization)

1. M1: In progress
2. M2: Not done
3. M3: Not done
4. M4: Not done
5. M5: Not done

### 10.3 Risk Register (Initialization)

1. Real model availability is unstable, causing high fallback.
2. General layer remains shallow for autonomous strategy.
3. Persistence and restart recovery are not landed.
4. Narrative causality depth is still basic.

## 11. Mandatory Iteration Log Template

```md
### [YYYY-MM-DD HH:mm] Iteration Log
- Scope:
- Files changed:
- Official verification and result:
- Performance/stability data:
- Risk delta:
- Next step:
```

### [2026-03-15 01:55] Iteration Log
- Scope:
  - Track A first landing: wired AI Hub `automationEnabled` and `plannerFrequency` into runtime scheduling mainline.
  - Unified manual and automation planning flow via shared planning pipeline.
  - Added guarded automation loop to avoid overlap with active planning requests.
- Files changed:
  - `src/App.tsx`
- Official verification and result:
  - `npm run lint` -> pass
  - `npm run build` -> pass
  - `npm run eval:planning:offline` -> pass (fullPassRate = 1)
- Performance/stability data:
  - Added automation loop cadence: `1400ms` runtime cycle.
  - Planner cadence now follows AI Hub config: `plannerFrequency` (tick-based interval).
  - Automation loop skips when planning is already running and serializes steps with a busy guard.
- Risk delta:
  - Reduced: AI Hub control values now affect actual runtime behavior instead of config-only storage.
  - Remaining: real model path stability, persistence landing, deeper general autonomy.
- Next step:
  - Track A.2: deepen General execution behavior from record-level dispatch toward autonomous tactical allocation under commander intent.



### [2026-03-15 02:12] Iteration Log
- Scope:
  - Track A.2 first landing: moved general dispatch before queue execution so delegated orders become authoritative inputs.
  - Upgraded GeneralAgent from record-only dispatch to mixed assigned/autonomous tactical behavior.
  - Added autonomous order synthesis (`recon` / `support` / `march|capture`) and conservative adjustment for high-risk assigned orders.
- Files changed:
  - `server/src/agents/general/GeneralAgent.ts`
  - `server/src/application/world/WorldService.ts`
- Official verification and result:
  - `npm run lint` -> pass
  - `npm run build` -> pass
  - `npm run eval:planning:offline` -> pass (fullPassRate = 1)
- Performance/stability data:
  - General dispatch now emits `delegatedPlan` with capped order volume (`<= 8`) and unit-level dedupe.
  - Queue execution now uses delegated plan when general dispatch is enabled, keeping rule-engine authority unchanged.
- Risk delta:
  - Reduced: generals no longer stay at pure record layer; tactical execution autonomy is now wired into mainline.
  - Remaining: Reflect depth, persistent memory quality, and 20/50/100 AI stress stability still need verification.
- Next step:
  - Track A.3: close Reflect feedback quality loop (narrative consequences + memory write quality + profile drift signals).

#### 中文镜像（Track A.2）
- 范围：
  - 完成 Track A.2 第一落点：将 `GeneralDispatch` 前置到 `queuePlanExecution` 之前，让将领委派结果真正进入执行主链。
  - 将 `GeneralAgent` 从“仅记录分发”升级为“指令执行 + 自主补位”的混合策略。
  - 新增将领自主出令（`recon` / `support` / `march|capture`）与高风险指令的保守化修正逻辑。
- 变更文件：
  - `server/src/agents/general/GeneralAgent.ts`
  - `server/src/application/world/WorldService.ts`
- 官方验证结果：
  - `npm run lint`：通过
  - `npm run build`：通过
  - `npm run eval:planning:offline`：通过（`fullPassRate = 1`）
- 稳定性数据：
  - 将领分发阶段现在输出 `delegatedPlan`，并带有订单上限（`<= 8`）与单位去重控制。
  - 当开启将领分发时，执行队列会优先使用委派计划，同时保持规则引擎权威裁决不变。
- 风险变化：
  - 已降低：将领层从“仅记录”提升为“可执行自治”，主链闭环更完整。
  - 仍存在：Reflect 深度、记忆持久化质量、以及 20/50/100 AI 压测稳定性尚需继续验证。
- 下一步：
  - 进入 Track A.3，补强 Reflect 复盘质量（后果链补全、记忆写入质量、将领画像漂移信号）。


### [2026-03-15 02:22] Iteration Log
- Scope:
  - Track A.3 landing: upgraded Reflect loop with causal/consequence linking and structured memory entries.
  - Added profile drift updates (loyalty/trust/ignored/grievance/history/long-term summary) as first-class Reflect outputs.
  - Exposed new reflect observability fields in world events metadata.
- Files changed:
  - `server/src/agents/reflect/ReflectService.ts`
  - `server/src/agents/general/GeneralProfileStore.ts`
  - `server/src/application/world/WorldService.ts`
- Official verification and result:
  - `npm run lint` -> pass
  - `npm run build` -> pass
  - `npm run eval:planning:offline` -> pass (fullPassRate = 1)
  - `npm run eval:orchestrator:stress -- --player-agents 20 --enemy-agents 20 --concurrency 6 --batch-size 6 --mode mock --general-dispatch --general-concurrency 6` -> pass
- Performance/stability data:
  - Reflect now returns `memoryWriteFailures`, `profileUpdates`, `causalLinks`, `consequenceLinks`.
  - Narrative drafts now bind alliance/report/battle events into causal chains and inferred consequences.
  - General profile drift now updates from event outcome + per-unit order outcomes resolved in current tick.
  - Stress baseline (40 agents, mock + general dispatch): `durationMs=51709`, `p50=36882ms`, `p95=36884ms`, `fallbackRate=0`, `generalDispatchP95=118ms`.
- Risk delta:
  - Reduced: Reflect is no longer summary-only; it now emits decision-relevant causality and profile drift signals.
  - Remaining: stress validation for 20/50/100 AI under real model path and persistence durability are still pending.
- Next step:
  - Start Track C baseline stress sweep and compare p50/p95 + fallback ratio under general dispatch enabled.

#### 中文镜像（Track A.3）
- 范围：
  - 完成 Track A.3 落地：升级 Reflect 复盘环，新增因果链 / 后果链连接与结构化记忆写入。
  - 新增将领画像漂移更新（loyalty / lordTrust / recentIgnored / grievance / history / longTermSummary）。
  - 在 world event metadata 暴露 Reflect 新观测字段，便于后续压测和诊断。
- 变更文件：
  - `server/src/agents/reflect/ReflectService.ts`
  - `server/src/agents/general/GeneralProfileStore.ts`
  - `server/src/application/world/WorldService.ts`
- 官方验证结果：
  - `npm run lint`：通过
  - `npm run build`：通过
  - `npm run eval:planning:offline`：通过（`fullPassRate = 1`）
  - `npm run eval:orchestrator:stress -- --player-agents 20 --enemy-agents 20 --concurrency 6 --batch-size 6 --mode mock --general-dispatch --general-concurrency 6`：通过
- 稳定性数据：
  - Reflect 新增输出：`memoryWriteFailures`、`profileUpdates`、`causalLinks`、`consequenceLinks`。
  - 叙事事件现在会将 alliance/report/battle 三类源事件绑定为因果关系。
  - 将领漂移信号现在可从事件结果 + 当 Tick 执行单结果联合更新。
  - 压测基线（40 agents，mock + general dispatch）：`durationMs=51709`、`p50=36882ms`、`p95=36884ms`、`fallbackRate=0`、`generalDispatchP95=118ms`。
- 风险变化：
  - 已降低：Reflect 从“摘要级”提升为“可决策因果级”输出。
  - 仍存在：20/50/100 AI 压测与真实模型路径稳定性、以及持久化耐久性验证尚未完成。
- 下一步：
  - 进入 Track C 基线压测，对比 general dispatch 开启状态下的 p50/p95 与 fallback ratio。


### [2026-03-15 03:02] Iteration Log
- Scope:
  - Track C.1 landing: optimized orchestrator throughput path for 50/100 AI stress tier.
  - Added faction-aware planning chain so `createPlanningResultForFaction` no longer ignores `side`.
  - Added commander tool-context promise cache keyed by `worldVersion + faction + command` to dedupe expensive context assembly.
- Files changed:
  - `server/src/agents/tools/CommanderTools.ts`
  - `server/src/agents/commander/CommanderAgent.ts`
  - `server/src/application/planning/PlanningService.ts`
- Official verification and result:
  - `npm run lint` (with `NODE_OPTIONS=--max-old-space-size=4096`) -> pass
  - `npm run build` -> pass
  - `npm run eval:planning:offline` -> pass (`fullPassRate = 1`)
  - `npm run eval:orchestrator:stress -- --player-agents 25 --enemy-agents 25 --concurrency 8 --batch-size 8 --mode mock --general-dispatch --general-concurrency 8` -> pass
  - `npm run eval:orchestrator:stress -- --player-agents 50 --enemy-agents 50 --concurrency 12 --batch-size 12 --mode mock --general-dispatch --general-concurrency 12` -> pass
- Performance/stability data:
  - 50 AI tier: `durationMs 43071 -> 23299` (`-45.9%`), `p95 43058ms -> 23285ms`.
  - 100 AI tier: `durationMs 86299 -> 24998` (`-71.0%`), `p95 86289ms -> 24972ms`, `qps 1.159 -> 4.000`.
  - General dispatch remains stable: `p95 ~= 116-125ms`.
- Risk delta:
  - Reduced: cross-faction context contamination risk is lowered with side-aware planning.
  - Remaining: planner context build still has a ~25s plateau under current mock stress; replay retrieval/index path needs deeper optimization.
- Next step:
  - Track C.2: optimize replay retrieval path and add cache hit/miss observability for context assembly.

#### 中文镜像（Track C.1）
- 范围：
  - 完成 Track C.1 落地：针对 50/100 AI 压测档位优化 orchestrator 吞吐路径。
  - 补上 faction 感知规划链路，`createPlanningResultForFaction` 不再忽略 `side`。
  - 新增 commander 工具上下文 Promise 缓存（key: `worldVersion + faction + command`），去重高成本上下文构建。
- 变更文件：
  - `server/src/agents/tools/CommanderTools.ts`
  - `server/src/agents/commander/CommanderAgent.ts`
  - `server/src/application/planning/PlanningService.ts`
- 官方验证结果：
  - `npm run lint`（`NODE_OPTIONS=--max-old-space-size=4096`）：通过
  - `npm run build`：通过
  - `npm run eval:planning:offline`：通过（`fullPassRate = 1`）
  - `npm run eval:orchestrator:stress -- --player-agents 25 --enemy-agents 25 --concurrency 8 --batch-size 8 --mode mock --general-dispatch --general-concurrency 8`：通过
  - `npm run eval:orchestrator:stress -- --player-agents 50 --enemy-agents 50 --concurrency 12 --batch-size 12 --mode mock --general-dispatch --general-concurrency 12`：通过
- 稳定性数据：
  - 50 AI 档：`durationMs 43071 -> 23299`（`-45.9%`），`p95 43058ms -> 23285ms`。
  - 100 AI 档：`durationMs 86299 -> 24998`（`-71.0%`），`p95 86289ms -> 24972ms`，`qps 1.159 -> 4.000`。
  - General dispatch 保持稳定：`p95 ~= 116-125ms`。
- 风险变化：
  - 已降低：分阵营上下文混用风险因 side-aware planning 得到收敛。
  - 仍存在：在当前 mock 压测下，planner context build 仍有 ~25s 平台耗时，需要继续优化 replay retrieval/index 路径。
- 下一步：
  - 进入 Track C.2：优化 replay retrieval 路径，并增加 context assembly 缓存命中/未命中观测指标。


### [2026-03-15 03:10] Iteration Log
- Scope:
  - Track C baseline stress sweep for 50/100 AI tiers with general dispatch enabled.
  - Performed parameter convergence over `concurrency x batch-size` matrix and rechecked top candidates.
  - Fixed stress output serialization tail marker (`
` -> newline) to keep output JSON machine-parseable.
- Files changed:
  - `server/src/evals/runOrchestratorStress.ts`
  - `docs/P0_PLAYABLE_ALPHA_EXECUTION_PLAN.md`
- Official verification and result:
  - `npm run eval:orchestrator:stress -- --player-agents 25 --enemy-agents 25 --concurrency 12 --batch-size 12 --mode mock --general-dispatch --general-concurrency 12` -> pass
  - `npm run eval:orchestrator:stress -- --player-agents 50 --enemy-agents 50 --concurrency 12 --batch-size 12 --mode mock --general-dispatch --general-concurrency 12` -> pass
  - Matrix sweep (18 runs, official stress entrypoint only) -> all pass, successRate=1, fallbackRate=0.
- Performance/stability data:
  - Artifacts: `tmp/track_c_stress_20260315/` (`matrix_summary.json`, `matrix_summary.csv`, `matrix_aggregate_with_recheck.json`).
  - 50-tier converged winner: `c12/b4/g12` -> `durationMs=5882`, `p95=5517ms`, `qps=8.501`.
  - 100-tier converged winner: `c8/b8/g8` -> `durationMs=12029`, `p95=7783ms`, `qps=8.313`.
  - Recheck (3-run average):
    - 50-tier `c12/b4/g12`: `avgDurationMs=5905`, `avgP95=5615.67ms`, `avgQps=8.470`.
    - 100-tier `c8/b8/g8`: `avgDurationMs=12382.67`, `avgP95=8026.33ms`, `avgQps=8.088`.
  - Versus prior Track C.1 recorded baseline:
    - 50-tier duration `23299 -> 5882` (`-74.8%`).
    - 100-tier duration `24998 -> 12029` (`-51.9%`).
- Risk delta:
  - Reduced: 50/100 AI stress baseline is now reproducible with converged parameters and zero fallback under mock path.
  - Remaining: real-model (`local/gateway`) stability and timeout/fallback policy tuning still pending in same matrix method.
- Next step:
  - Run the same convergence matrix on `--mode local` then `--mode gateway`, and introduce tier-aware runtime defaults (`50 -> c12/b4`, `100 -> c8/b8`).


### [2026-03-15 04:07] Iteration Log
- Scope:
  - Continued Track C on real model path (`local` / `gateway`) after baseline mock convergence.
  - Landed planner output normalization hardening to reduce schema-caused hard failures under gateway strict mode.
  - Re-ran 50/100 stress tiers and converged real-path parameters with rechecks.
- Files changed:
  - `server/src/infra/llm/plannerProtocol.ts`
  - `docs/P0_PLAYABLE_ALPHA_EXECUTION_PLAN.md`
- Official verification and result:
  - `npm run lint` -> pass
  - `npm run build` -> pass
  - `npm run eval:planning:offline` -> pass (`fullPassRate = 1`)
  - `npm run eval:orchestrator:stress -- --player-agents 25 --enemy-agents 25 --concurrency 12 --batch-size 4 --mode local --general-dispatch --general-concurrency 12` -> pass (fallback path)
  - `npm run eval:orchestrator:stress -- --player-agents 50 --enemy-agents 50 --concurrency 8 --batch-size 8 --mode local --general-dispatch --general-concurrency 8` -> pass (fallback path)
  - `npm run eval:orchestrator:stress -- --player-agents 25 --enemy-agents 25 --concurrency 16 --batch-size 4 --mode gateway --model openrouter/healer-alpha --general-dispatch --general-concurrency 16` -> pass
  - `npm run eval:orchestrator:stress -- --player-agents 50 --enemy-agents 50 --concurrency 8 --batch-size 8 --mode gateway --model openrouter/healer-alpha --general-dispatch --general-concurrency 8` -> pass
- Performance/stability data:
  - Local path status: `LOCAL_MODEL_ENDPOINT` unreachable, so both local stress runs are fallback-only (`successRate=1`, `fallbackRate=1`).
  - Gateway strict mode uses `PLANNER_GATEWAY_STRICT=true`; initial failures were dominated by schema mismatch / empty completion.
  - Planner normalization improvements in `plannerProtocol.ts`:
    - tolerate root-vs-plan nested field layouts;
    - normalize action/priority/reviewAfterTicks/order aliases;
    - conservative priority default (`medium`) for malformed values;
    - clamp long text fields to schema limits.
  - Gateway 20-agent validation (10+10, `c8/b8`, `healer-alpha`, historical capped run `PLANNER_MAX_TOKENS=800`, current default uncapped):
    - before normalization hardening: `successRate=0.55`, `fallbackRate=0.45`
    - after normalization hardening: `successRate=0.95`, `fallbackRate=0.05`
  - Converged gateway parameters (with recheck):
    - 50-tier recommended: `c16/b4/g16`
      - run1: `durationMs=58880`, `p95=53433ms`, `successRate=1.00`, `fallbackRate=0.00`
      - recheck: `durationMs=60819`, `p95=51490ms`, `successRate=0.98`, `fallbackRate=0.02`
      - avg: `durationMs=59849.5`, `p95=52461.5ms`, `successRate=0.99`, `fallbackRate=0.01`
    - 100-tier recommended: `c8/b8/g8`
      - run1: `durationMs=94063`, `p95=48218ms`, `successRate=0.99`, `fallbackRate=0.01`
      - recheck: `durationMs=108332`, `p95=52744ms`, `successRate=1.00`, `fallbackRate=0.00`
      - avg: `durationMs=101197.5`, `p95=50481ms`, `successRate=0.995`, `fallbackRate=0.005`
  - Artifacts:
    - `tmp/track_c_stress_20260315/gateway_matrix_summary.json`
    - `tmp/track_c_stress_20260315/gateway_healer_afterfix_tier_summary.json`
    - `tmp/track_c_stress_20260315/gateway_healer_failure_breakdown_20_after_priority_default_fix.json`
- Risk delta:
  - Reduced: gateway strict mode is now operational for stress tiers with near-zero fallback under converged settings.
  - Remaining: long-tail latency jitter still appears in occasional 100-tier runs; local model path remains blocked until local endpoint is started.
- Next step:
  - Start local model service and rerun same 50/100 matrix for true local-path convergence.
  - Add planner request timeout/abort controls per call to cap long-tail gateway outliers.

### [2026-03-15 05:36] Iteration Log
- Scope:
  - Completed Track C local true-path convergence for 50/100 tiers using official stress entrypoint.
  - Added gateway long-tail control on top of per-call timeout/abort + retry via total retry budget (PLANNER_REQUEST_MAX_ELAPSED_MS).
  - Synced gateway default model and README examples to openrouter/healer-alpha; verified relay model list from http://216.40.86.55:3100/v1/models.
- Files changed:
  - server/src/infra/llm/OpenAICompatPlannerAdapter.ts
  - .env.example
  - README.md
  - docs/P0_PLAYABLE_ALPHA_EXECUTION_PLAN.md
- Official verification and result:
  - npm run lint -> pass
  - npm run build -> pass
  - npm run eval:orchestrator:stress -- --player-agents 25 --enemy-agents 25 --concurrency 1 --batch-size 1 --mode local --general-dispatch --general-concurrency 1 -> pass
  - npm run eval:orchestrator:stress -- --player-agents 50 --enemy-agents 50 --concurrency 1 --batch-size 1 --mode local --general-dispatch --general-concurrency 1 -> pass
  - npm run eval:orchestrator:stress -- --player-agents 25 --enemy-agents 25 --concurrency 12 --batch-size 4 --mode gateway --general-dispatch --general-concurrency 12 -> pass
  - npm run eval:orchestrator:stress -- --player-agents 50 --enemy-agents 50 --concurrency 8 --batch-size 8 --mode gateway --general-dispatch --general-concurrency 8 -> pass
- Performance/stability data:
  - Local convergence (true path, qwen3.5-0.8b-q4_k_m):
    - 50-tier c1/b1/g1: successRate=1.00, fallbackRate=0.04, p95=48215ms, durationMs=1501617.
    - 100-tier c1/b1/g1: successRate=1.00, fallbackRate=0.10, p95=56937ms, durationMs=3299399.
  - Gateway (openrouter/healer-alpha) without total-budget cap (timeout=45s, attempts=3):
    - 50-tier c12/b4/g12: successRate=1.00, fallbackRate=0.00, p95=61922ms.
    - 100-tier c8/b8/g8: successRate=1.00, fallbackRate=0.00, p95=83084ms.
  - Gateway with total-budget cap (PLANNER_REQUEST_MAX_ELAPSED_MS=65000):
    - 50-tier: successRate=0.94, fallbackRate=0.06, p95=65367ms.
    - 100-tier: successRate=0.93, fallbackRate=0.07, p95=65353ms.
  - Gateway with total-budget cap (PLANNER_REQUEST_MAX_ELAPSED_MS=75000):
    - 100-tier: successRate=0.93, fallbackRate=0.07, p95=75345ms (worse tail, no reliability gain).
  - Consolidated artifacts:
    - tmp/track_c_stress_20260315/track_c_local_gateway_timeout_control_summary.json
    - tmp/track_c_stress_20260315/track_c_local_gateway_timeout_control_summary.csv
- Risk delta:
  - Reduced: local true model path for 50/100 is now reproducible with explicit converged params (c1/b1/g1).
  - Reduced: gateway retries are now bounded by explicit total elapsed budget.
  - Remaining: hard tail cap introduces fallback tradeoff under current gateway load (about 6%~7% in this run set).
- Next step:
  - Adopt dual profile in runtime/env:
    - Reliability profile: keep PLANNER_REQUEST_MAX_ELAPSED_MS unset (or large) for near-zero fallback.
    - Tail-bound profile: PLANNER_REQUEST_MAX_ELAPSED_MS=65000 for bounded long tail.
  - If both low tail and low fallback are required simultaneously, add provider-level hedging/replica strategy instead of only retry budget tuning.
