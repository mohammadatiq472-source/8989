# AI Native Alliance War Mainline

This repository uses a Node.js authoritative backend + Godot client.
Legacy compatibility routes and legacy client artifacts have been removed.

## Current Mainline

This repository now defaults to the `原生 SLG 主壳 + AI 变量` mainline.

- Formal frontend entry: `godot-client/project.godot -> scenes/app/main.tscn`
- Current first-cut target: `主城常驻壳层 / 大地图入口 / AI中枢 / Observability`
- `UI Preview Sandbox` remains available as a bridge/reference lane, but it is not the default product path

## Key Integration Docs

- Current execution baseline: [docs/AGENTS_EXECUTION_CURRENT_2026_04.md](docs/AGENTS_EXECUTION_CURRENT_2026_04.md)
- Native SLG formal mainline: [docs/NATIVE_SLG_MAINLINE_INDEX.md](docs/NATIVE_SLG_MAINLINE_INDEX.md)
- Native SLG formal component architecture: [docs/NATIVE_SLG_COMPONENT_ARCHITECTURE.md](docs/NATIVE_SLG_COMPONENT_ARCHITECTURE.md)
- USB migration audit: [docs/USB_MIGRATION_AUDIT_2026_04_17.md](docs/USB_MIGRATION_AUDIT_2026_04_17.md)
- USB migration execution: [docs/USB_MIGRATION_EXECUTION_2026_04_17.md](docs/USB_MIGRATION_EXECUTION_2026_04_17.md)
- USB migration path rewrite notes: [docs/USB_MIGRATION_PATH_REWRITE_2026_04_17.md](docs/USB_MIGRATION_PATH_REWRITE_2026_04_17.md)
- AI quick navigation index: [docs/AI_QUICK_NAV_INDEX_2026_04_10.md](docs/AI_QUICK_NAV_INDEX_2026_04_10.md)
- Godot client runtime chain: [godot-client/README.md](godot-client/README.md)
- Codex memory anchor: [CODEX.md](CODEX.md)
- Historical appendices stay in [docs/NATIVE_SLG_MAINLINE_INDEX_2026_04_16.md](docs/NATIVE_SLG_MAINLINE_INDEX_2026_04_16.md), [docs/NATIVE_SLG_RESET_PLAN_2026_04_16.md](docs/NATIVE_SLG_RESET_PLAN_2026_04_16.md), [docs/NATIVE_SLG_PAGE_STRUCTURE_2026_04_16.md](docs/NATIVE_SLG_PAGE_STRUCTURE_2026_04_16.md), [docs/AI_PHASE1_INSERTION_POINTS_2026_04_16.md](docs/AI_PHASE1_INSERTION_POINTS_2026_04_16.md), [docs/CODE_MAINLINE_KEEP_FREEZE_BRIDGE_2026_04_16.md](docs/CODE_MAINLINE_KEEP_FREEZE_BRIDGE_2026_04_16.md) and should not replace the formal docs above
- Backend runtime routes: [server/src/app.ts](server/src/app.ts)

## Runtime Commands

- Start backend: `npm run start`
- Start backend with auto game clock: `npm run start:clock`
- Dev watch mode: `npm run server:dev`
- Open Godot editor for this repo: `npm run godot:editor`
- Run the Godot mainline client window: `npm run godot:mainline:runtime`
- Run Godot headless smoke: `npm run godot:headless:smoke`
- Lint: `npm run lint`
- Type-check build: `npm run build`
- Session manager test: `npm run test:session:manager`
- World mutation lock test: `npm run test:world:mutation-lock`

Godot usage rule:

- Repository root is `8989/`, but the actual Godot project root is `8989/godot-client/`.
- If you see `SLG Commander Godot Client (DEBUG)`, that is the runtime window, not the editor.
- Fixed Godot open/run flow: [docs/GODOT_EDITOR_OPEN_FLOW_2026_04_17.md](docs/GODOT_EDITOR_OPEN_FLOW_2026_04_17.md)

## Primary API Surface

Short-term control policy:

- Only faction `player` can be human-controlled.
- All other factions are AI-controlled.

## GitHub Auth Hardening (A/B Machines)

- Run posture check: `npm run security:auth:validate`
- Apply repo hardening: `npm run security:auth:harden`
- Configure branch protection: `npm run security:branch:protect`
- Dual-maintainer gate accounts: `mohammadatiq472-source` (A), `rltsgxol4437` (B)
- Full guide: `docs/GITHUB_AUTH_DUAL_MACHINE_2026_04_04.md`
