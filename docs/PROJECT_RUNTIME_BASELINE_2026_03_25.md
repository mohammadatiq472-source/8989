# Project Runtime Baseline - 2026-03-25

This file exists to prevent project-understanding drift across AI engineers.

## What this project is
- AI-native alliance-war/SLG command system.
- Human defines strategy and doctrine; AI decomposes and executes operations.
- Rule engine remains authoritative for all world mutation.

## Methodology (non-negotiable)
- Human strategy -> Commander planning -> General decomposition -> rule-engine execution -> Reflect writeback.
- POER loop is required: Perceive, Order, Execute, Reflect.
- Structured state/tool calls first; no screenshot/OCR-click based external game automation path.

## Model and gateway baseline
- Backend runtime: Node.js + TypeScript.
- HTTP stack: native `node:http` routes in `server/src/routes/`.
- Model transport: OpenAI-compatible gateway adapter (`server/src/infra/llm/ModelGatewayAdapter.ts`).
- Default local model service endpoint: `127.0.0.1:8080` (Qwen-compatible service).
- Backend app default port: `8787`.
- Memory policy: Mem0 when configured; automatic in-memory fallback when key missing.

## Official development entrypoints
- Dev server: `npm run server:dev`
- Fullstack dev: `npm run dev:all`
- Lint: `npm run lint`
- Build: `npm run build`
- Planning eval: `npm run eval:planning:offline`
- Orchestrator stress eval: `npm run eval:orchestrator:stress`
- Hardening gate: `npm run gate:phase5:hardening`

## API ingress points (high-value)
- `/api/health`
- `/api/world`
- `/api/planning/create`
- `/api/replay`
- `/api/copilotkit`

## Guardrails
- AI proposes; rule engine decides.
- No frontend-authoritative branch for world mutation.
- No direct browser-to-model endpoint as production authority path.
- Any architectural claim must be reproducible from official entrypoints.
