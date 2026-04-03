# Web Retirement Gates And Deletion Order (2026-03-26)

## Scope
- "Web command surface" means `src/` React + Pixi + CopilotKit runtime chain.
- This plan does not remove authoritative backend (`server/`) or shared contracts (`shared/`).

## Retirement Gates (all required)
1. Unity coverage gate
- Unity client stably covers core endpoints:
  - `GET /api/world`
  - `POST /api/world/action`
  - `POST /api/planning/create`
- No P0/P1 blocker for 7 consecutive days.

2. Scale gate
- Official gates pass:
  - `npm run eval:orchestrator:stress`
  - `npm run gate:phase5:hardening`
- 3000 AI + hundreds of human players load test plan is implemented with reproducible reports.

3. Contract freeze gate
- `shared/contracts` and `shared/schemas` are version-frozen.
- Unity `BackendApi.cs` has no blocking contract drift.

4. Observability gate
- Alerting exists for tick latency, action queue depth, model gateway timeout, and world mutation busy.
- Replay/event chain can support incident forensics.

5. Rollback gate
- Keep rollback-ready tag for last known good Web build.
- Restore path to Web validation UI within 30 minutes.

## Deletion Order (run only after gates pass)
1. Phase A: Freeze (no deletion)
- Stop adding Web features, allow blocker fixes only.
- Update docs: Unity is primary client, Web is fallback validation surface.

2. Phase B: Remove Web AI interaction UI
- Remove in order:
  - `src/components/copilot/`
  - `server/src/routes/copilot.ts`
  - `/api/copilotkit` route dispatch in `server/src/app.ts`

3. Phase C: Remove Web shell
- Remove in order:
  - `src/main.tsx`
  - `src/App.tsx`
  - `src/components/` Web UI subtree
  - `src/api/` Web-only client wrappers
  - `Start-Frontend.cmd`
- Then clean `package.json` Web dependencies/scripts (React/Vite/Pixi/CopilotKit).

4. Phase D: Close docs and gates
- Update:
  - `README.md`
  - `docs/PROJECT_RUNTIME_BASELINE_2026_03_25.md`
  - `docs/modules_v2/M15.md`, `M16.md`, `M17.md`, `M18.md`
- Switch M18 acceptance focus to backend + Unity integration mainline.

## Hard Prohibitions
- Do not hard-delete `src/` before removing `/api/copilotkit` chain and dependencies.
- Do not retire Web before gates pass, to avoid losing emergency fallback visibility.
