# AI Native Alliance War Backend (Unity First)

This repository is now backend-only. The React/Vite web client has been removed.
Unity is the primary front-end target.

## Runtime Commands

- Start backend: `npm run start`
- Start backend with auto game clock: `npm run start:clock`
- Dev watch mode: `npm run server:dev`
- Lint: `npm run lint`
- Type-check build: `npm run build`
- Session manager test: `npm run test:session:manager`
- World mutation lock test: `npm run test:world:mutation-lock`

## Unity-First API Aliases

The backend keeps `/api/session/*` and also exposes Unity-friendly aliases:

- `GET /api/unity/runtime`
- `POST /api/unity/join`
- `POST /api/unity/heartbeat`
- `POST /api/unity/leave`
- `POST /api/unity/autonomy`

Short-term control policy:

- Only faction `player` can be human-controlled.
- All other factions are AI-controlled.

## Key Integration Docs

See `docs/unity/` for endpoint contracts, C# DTO/client skeletons, and call-order checklist.

## GitHub Auth Hardening (A/B Machines)

- Run posture check: `npm run security:auth:validate`
- Apply repo hardening: `npm run security:auth:harden`
- Configure branch protection: `npm run security:branch:protect`
- Full guide: `docs/GITHUB_AUTH_DUAL_MACHINE_2026_04_04.md`
