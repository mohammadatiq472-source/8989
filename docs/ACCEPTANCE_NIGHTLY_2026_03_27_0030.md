# Nightly Acceptance Snapshot (2026-03-27 00:30 CST)

## Goal
- Continue hardening for `3000 AI + hundreds human players` with stricter, reproducible quality gates.
- Enforce open-source harness isolation constraints as a formal acceptance gate.

## Reused Official Entrypoints
- `npm run gate:harness:isolation`
- `npm run gate:gateway:preflight`
- `npm run lint`
- `npm run build`
- `npm run eval:planning:offline`
- `npm run eval:orchestrator:stress`
- `npm run gate:phase5:hardening`
- `npm run gate:scale:3000:mock`

## Results
1. Harness isolation gate
- Command: `npm run gate:harness:isolation`
- Status: `PASS`
- Marker isolation: `project-local-only`
- Marker global touch: `False`
- Report: `tmp/gates/harness_isolation/latest.json`

2. Global quality gates
- `npm run lint`: `PASS`
- `npm run build`: `PASS`
- `npm run eval:planning:offline`: `PASS` (`fullPassRate=0.8`)
- `npm run eval:orchestrator:stress`: `PASS` (`successRate=1.0`, `p95LatencyMs=4089`)
- `npm run gate:phase5:hardening`: `PASS`

3. 3000-scale mock gate
- Command: `npm run gate:scale:3000:mock`
- Status: `PASS`
- RunId: `695d93b1-dc11-4c4f-a097-6f5dd7ac7652`
- DurationMs: `457894`
- SuccessRate: `1`
- FallbackRate: `0`
- FailureCount: `0`
- p95LatencyMs: `156908`
- Gate thresholds: `{"minSuccessRate": 0.99, "maxP95LatencyMs": 200000, "maxFallbackRate": 0.02, "maxFailureCount": 10}`
- Report: `tmp/gates/scale_3000_mock.json`

4. Gateway smoke gate (real model path precheck)
- Command: `npx tsx server/src/evals/runOrchestratorStress.ts --player-agents 12 --enemy-agents 12 --concurrency 8 --batch-size 8 --mode gateway --output tmp/gates/scale_gateway_smoke_24.json --min-success-rate 0.8 --max-fallback-rate 0.2 --max-failure-count 5`
- Status: `FAIL`
- SuccessRate: `0`
- FallbackRate: `1`
- FailureCount: `24`
- Primary blocker: `缺少环境变量 LLM_RELAY_URL。`
- Reports:
  - `tmp/gates/scale_gateway_smoke_24.json`
  - `tmp/gates/scale_gateway_smoke_12_verbose.json`

## Constraint Hardening Added in This Round
- Added gateway preflight gate script:
  - `scripts/run_gateway_preflight_gate.py`
- Added preflight + execution chain:
  - `gate:gateway:preflight`
  - `gate:scale:3000:gateway:ready`
- Added formal gate script:
  - `scripts/run_harness_isolation_gate.py`
- Added npm entrypoint:
  - `gate:harness:isolation`
- Upgraded scale gate constraints:
  - `gate:scale:3000:mock` now includes `--max-p95-ms 200000`
- Added trace noise switch for long-scale runs:
  - `TRACE_ENABLED=0` disables planning trace logs.

## Files Changed
- `scripts/run_harness_isolation_gate.py`
- `server/src/infra/observability/trace.ts`
- `package.json`
- `.env.example`
- `docs/modules_v2/M18.md`
- `docs/HARNESS_PROJECT_ISOLATED_SETUP_2026_03_26.md`
- `docs/ACCEPTANCE_NIGHTLY_2026_03_27_0030.md`

## Current Blockers / Next Focus
- Gateway-scale mainline blocked by gateway preflight (`LLM_RELAY_URL` and key chain must be configured).
- Next direct action:
  1. Configure `LLM_RELAY_URL` (and key set if needed), then rerun `gate:scale:3000:gateway`.
  2. Add strict gateway SLO thresholds (`successRate`, `fallbackRate`, `max-p95-ms`, timeout rate).
  3. Keep Unity contract conformance gate as next cross-client blocker.

## Generated At
- `2026-03-27 00:37:54` local process time.
