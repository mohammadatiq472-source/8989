# AI Native Alliance War Backend (Godot First)

This repository uses a Node.js authoritative backend + Godot client.
Legacy compatibility routes and legacy client artifacts have been removed.

## Runtime Commands

- Start backend: `npm run start`
- Start backend with auto game clock: `npm run start:clock`
- Dev watch mode: `npm run server:dev`
- Lint: `npm run lint`
- Type-check build: `npm run build`
- Session manager test: `npm run test:session:manager`
- World mutation lock test: `npm run test:world:mutation-lock`

## Primary API Surface

Short-term control policy:

- Only faction `player` can be human-controlled.
- All other factions are AI-controlled.

## Key Integration Docs

- AI quick navigation index: `docs/AI_QUICK_NAV_INDEX_2026_04_10.md`
- Current execution baseline: `docs/AGENTS_EXECUTION_CURRENT_2026_04.md`
- Godot client runtime chain: `godot-client/README.md`
- Backend runtime routes: `server/src/app.ts`

## GitHub Auth Hardening (A/B Machines)

- Run posture check: `npm run security:auth:validate`
- Apply repo hardening: `npm run security:auth:harden`
- Configure branch protection: `npm run security:branch:protect`
- Dual-maintainer gate accounts: `mohammadatiq472-source` (A), `rltsgxol4437` (B)
- Full guide: `docs/GITHUB_AUTH_DUAL_MACHINE_2026_04_04.md`
