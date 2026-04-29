# Godot Client (Week 1 Bootstrap)

This folder hosts the Godot rewrite client.

## Prerequisites

- Godot: `D:\Apps\Godot\Godot_v4.6.2-stable_win64_console.exe`
- Backend running at `http://127.0.0.1:8787`

## Current Mainline

Current production mainline is no longer `UI Preview Sandbox` first.

- Formal Godot runtime entry remains `godot-client/project.godot -> run/main_scene="res://scenes/app/main.tscn"`.
- Current first-cut objective is `原生 SLG 主壳 / 主城页 / 大地图入口`.
- `UI Preview Sandbox` now serves as side-line reference and validation tooling, not the default product entry.
- If the task is product-facing, prefer `main.tscn` and only read preview docs/tools when you explicitly need bridge references or screenshot regression.

## First Read

- [../README.md](../README.md)
- [../docs/AGENTS_EXECUTION_CURRENT_2026_04.md](../docs/AGENTS_EXECUTION_CURRENT_2026_04.md)
- [../docs/NATIVE_SLG_MAINLINE_INDEX.md](../docs/NATIVE_SLG_MAINLINE_INDEX.md)
- [../docs/NATIVE_SLG_COMPONENT_ARCHITECTURE.md](../docs/NATIVE_SLG_COMPONENT_ARCHITECTURE.md)
- [../docs/AI_QUICK_NAV_INDEX_2026_04_10.md](../docs/AI_QUICK_NAV_INDEX_2026_04_10.md)
- [../CODEX.md](../CODEX.md)

## Week 1 Entry Commands

- Editor vs runtime:
  - `Godot Engine` window = editor
  - `SLG Commander Godot Client (DEBUG)` window = running client
  - repository root is `8989/`, but the Godot project root is `8989/godot-client/`
- Open editor:
  - `Start-Godot-Editor.cmd`
  - `npm run godot:editor`
- Run the mainline client window:
  - `Start-Godot-Mainline-Debug.cmd`
  - `npm run godot:mainline:runtime`
- Headless smoke:
  - `Start-Godot-Headless-Smoke.cmd`
  - `npm run godot:headless:smoke`
- If Godot auto-detection fails:
  - set `GODOT_EDITOR_EXE` or `GODOT_CONSOLE_EXE` and rerun the launcher
- Week 1 gate (W1-C13):
  - `npm run gate:godot:week1`
  - strict default (CI/验收口径): `--no-allow-stale-runtime-schema`
  - troubleshooting only: `npm run gate:godot:week1:compat` (or `gate:godot:week1:compat:debug-only`)
  - do not use compat gate as release/CI acceptance evidence
  - output: `tmp/gates/godot_week1_gate_latest.json` and timestamped copy in `tmp/gates/`
- AI ops CLI (Godot + backend control surface):
  - `npm run godot:ops:cli -- health`
  - `npm run godot:ops:cli -- runtime`
  - `npm run godot:ops:cli -- join --faction-id player --player-name ai_cli`
  - `npm run godot:ops:cli -- advance-tick`
  - `npm run godot:ops:cli -- world-action-templates`
  - `npm run godot:ops:cli -- world-action-template --template move_first_unit --faction-id player`
  - `npm run godot:ops:cli -- template-replay --scenario baseline_v1 --report-path tmp/gates/ai_ops_template_replay_latest.json`
  - `npm run godot:ops:cli -- world-action --action queuePlanExecution --payload-json "{\"factionId\":\"player\"}"`
  - `npm run godot:ops:cli -- bootstrap-chain --output tmp/gates/godot_ops_bootstrap_latest.json`

## UI Preview Sandbox

This section is bridge-only. Do not treat it as the canonical product entry.

Purpose:

1. Provide a reusable, click-first sandbox for UI iteration without touching `main.tscn` or `main.gd`.
2. Keep preview stories visible to both humans and AI windows through a single formal scene entry.
3. Produce reproducible screenshot evidence under `tmp/screenshots/ui_preview_sandbox/`.

Formal entry commands:

- Launch sandbox:
  - `scripts\run_python.cmd godot-client\tools\run_ui_preview_sandbox.py`
- Validate sandbox and capture story screenshots:
  - `scripts\run_python.cmd godot-client\tools\validate_ui_preview_sandbox.py`
- Run screenshot regression against the embedded baseline hashes:
  - `npm run godot:ui:preview:regress`
- Direct Godot launch:
  - `scripts\run_python.cmd scripts\launch_godot.py --mode runtime --scene res://scenes/dev/ui_preview_sandbox.tscn`

Capture mode:

- The formal validation/regression chain now enables `presentation capture mode` automatically.
- In this mode the sandbox sidebar stays hidden, and map preview stories hide the Info, Story, and Controls docks so screenshots contain product UI only.
- Manual preview entrypoints keep the developer UI visible unless you invoke the validation/regression chain.

Editor workflow:

- Godot editor now loads a right-side `UI Preview` dock from `res://addons/ui_preview_sandbox/plugin.cfg`.
- Use `Open Sandbox Scene` to jump to the canonical preview scene.
- Use `Play Selected Story` to run the selected story without touching `main.tscn`.
- Inside the sandbox, switch `Fixture` / `Backend` data sources per story from the sidebar.
- For live backend preview, start `npm run start` first and then switch the story source to `Backend`.

Story addition rules:

1. Keep `res://scenes/dev/ui_preview_sandbox.tscn` as the canonical preview entry and keep story selection driven by `godot-client/data/ui_preview/stories/stories_manifest.json`.
2. Add a new story by creating its preview scene and payload under `godot-client/scenes/dev/stories/` and `godot-client/data/ui_preview/stories/`, then register it in `stories_manifest.json`.
3. Register `defaultSourceMode` and `dataSources` in `stories_manifest.json` so the story can be switched between `fixture` and any supported live adapter modes.
4. The validator now captures stories in manifest order, so a registered story is automatically exercised and screenshot-tested from the same formal entry.
5. Keep payload-level `dataSource` metadata aligned with the manifest contract so both humans and AI windows can see which source is active.
6. Keep story/capture outputs under `tmp/screenshots/ui_preview_sandbox/` so humans and agents can diff the same evidence.
7. Do not route sandbox preview flows through `main.tscn`, `main.gd`, or server bootstrapping.

Current story packs:

- Core UI: `hud_token`, `observability`, `panel_stack`
- Map Preview Pack: `map_surface`, `map_zoom_hover`, `map_overlay`, `map_units`
- Map Macro Pack: `province_layer`, `warzone_layer`, `nation_layer`
- Macro navigation chain: `map_surface -> province_layer -> warzone_layer -> nation_layer`

Generalpic quick lookup:

- Pack root: `godot-client/assets/themes/slgclient/current/generalpic/`
- AI index: `godot-client/assets/themes/slgclient/manifests/generalpic_index.json`
- Full pack manifest: `godot-client/assets/themes/slgclient/manifests/generalpic_manifest.json`

`map_surface` now assembles reusable component scenes under `godot-client/scenes/dev/components/`:

- `map_surface_top_strip.tscn`
- `map_surface_command_dock.tscn`
- `map_surface_right_info_stack.tscn`
- `map_surface_action_dock.tscn`

Screenshot validation output:

- `tmp/screenshots/ui_preview_sandbox/preview_validation_report.json`
- `tmp/screenshots/ui_preview_sandbox/01_hud_token_story.png`
- `tmp/screenshots/ui_preview_sandbox/02_observability_story.png`
- `tmp/screenshots/ui_preview_sandbox/03_panel_stack_story.png`
- `tmp/screenshots/ui_preview_sandbox/04_map_surface_story.png`
- `tmp/screenshots/ui_preview_sandbox/05_map_zoom_hover_story.png`
- `tmp/screenshots/ui_preview_sandbox/06_map_overlay_story.png`
- `tmp/screenshots/ui_preview_sandbox/07_map_units_story.png`
- `tmp/screenshots/ui_preview_sandbox/08_province_layer_story.png`
- `tmp/screenshots/ui_preview_sandbox/09_warzone_layer_story.png`
- `tmp/screenshots/ui_preview_sandbox/10_nation_layer_story.png`
- `tmp/screenshots/ui_preview_sandbox/driver_report.json`
- `tmp/screenshots/ui_preview_sandbox/ui_preview_sandbox_regression_report.json`

Regression report shape:

- `command`: wrapper command identifier
- `validationCommand`: exact validator invocation used for the capture run
- `comparison`: hash comparison summary with `missing`, `unexpected`, `hashMismatches`, and `orderMismatch`
- `steps.navigation_chain`: formal smoke result for the macro flow `map_surface -> province_layer -> warzone_layer -> nation_layer`
- `artifacts`: validation report path, regression report path, and screenshot manifest
- `conclusion`: `PASS` or `FAIL`

## AI CLI Control Surface (Week2+)

Purpose:

1. Give AI a reproducible CLI entry for backend authoritative actions (`/api/session/*`, `/api/world/action`, `/api/world/map-layout`).
2. Keep Godot engine bootstrap in the same automation chain (`headless` step).
3. Provide machine-readable JSON outputs for gate/agent evidence.

Script:

- `godot-client/tools/slg_ops_cli.py`

Subcommands:

- `health`
- `runtime`
- `join`
- `heartbeat`
- `autonomy`
- `leave`
- `world`
- `map-layout`
- `world-action`
- `world-action-templates`
- `world-action-template`
- `template-replay`
- `advance-tick`
- `headless`
- `bootstrap-chain`

Notes:

- `bootstrap-chain` runs one-shot chain: `health -> runtime -> join -> world -> map-layout -> headless -> leave`.
- For CI/agent usage, prefer `--output <path.json>` to persist evidence payloads.
- `world-action` defaults to a concise action summary payload; use `world-action --raw` for full response.
- `world-action-template` provides reusable templates (`advance_tick`/`move_first_unit`/`upgrade_first_city`/`tactical_override_first_unit` etc.) with optional auto-resolved payload.
- `template-replay` runs a scripted template scenario and reconciles `/api/events` + `/api/narratives` into a JSON report (default `tmp/gates/ai_ops_template_replay_latest.json`).
- `template-replay` defaults to deterministic fixture bootstrap (`backup -> prime initial_world_v1 -> load fixture -> replay -> restore`) and supports `--fixture-slot-id/--backup-slot-id/--fixture-source/--restore-world`.
- `template-replay` enforces all scripted steps as required and applies a minimum replay timeout floor of `60s` for long `advance_tick` calls.
- `map-layout` and `bootstrap-chain` default to summarized map payloads to avoid giant console output.
- Use `map-layout --raw` or `bootstrap-chain --raw-map-layout` only when deep debugging raw tiles/chunks.

## AI Player Animation Notes

- Current AI player visual is `UnitViewLayer + UnitMarker` minimal skeleton (move + engage intensity/direction).
- Fallback/prototype assessment doc:
  - `docs/GODOT_AI_PLAYER_ANIMATION_FALLBACK_2026_04_10.md`

## Runtime Chain (MVP)

On startup, `main.gd` executes:

1. `GET /api/session/runtime`
2. `POST /api/session/join` (only if target faction has no online seat)
3. `GET /api/world?intelMode=sparse`
4. `GET /api/world/map-layout?scope=full` (fallback to `scope=bootstrap` on `403`)
5. `MapGrid` listens to `WorldStore.map_layout_updated` and draws base tiles from `map_layout.map.tiles`
6. `MapGrid` uses viewport culling (draw only visible tile window) for large-map performance

Controls:

- Mouse wheel: zoom in/out
- Mouse middle/right drag: pan viewport
- Mouse hover: show tile basic info (id/coord/type/terrain/district/cityLevel)
- Click `Export Baseline (F8)` button or press `F8` to export current baseline JSON
- Click `Refresh World` to pull latest `/api/world` snapshot
- Click `Advance Tick` to call `/api/world/action` with `advanceTick` (includeWorld=true)
- `Ctrl+R`: refresh world snapshot
- `Ctrl+T`: advance tick
- `Ctrl+1`: run world-action template `clear_plan_execution`
- `Ctrl+2`: run world-action template `preview_national_agenda`
- `Ctrl+3`: run world-action template `preview_court_session`

HUD metrics (window mode baseline):

- `PerfInfo` label shows 5-second rolling average FPS/frame time
- format: `avgFPS`, `avgFrameMs`, `instFPS`, `instFrameMs`, `visibleDrawn`, `visibleCandidates`, `sampleStep`
- `ExportStatus` label shows latest export result/path
- `RuntimeInfo` label shows standardized runtime/session/autonomy state (`status/faction/controlMode/autonomy/tick/worldVersion/mapScope/seats/session/sessionMode`)
- `ObservabilityPanel` 独立面板 shows minimal observability snapshot:
  - `WS` 子区块：status/subscription/message counters (`tick_delta`/`general_message`/errors)
  - `WS` 子区块含状态色：`green=connected`、`yellow=connecting/transition`、`red=disconnected/error`
  - `Events` 子区块：`/api/events` poll success/fail counters + latest event summary
  - `Runtime` 子区块：`faction/controlMode/autonomyLevel/seat online/sessionId/seatId/sessionMode/playerNames` + `/api/session/runtime` poll counters + `lastAction/status/tick`
  - `CivilMemory` 子区块：`/api/civil-memory` poll counters + memory provider diagnostics (`requested/active/lifecycle/downgraded/reason`) + latest ledger summary

## W1-C09 (events/ws)

- Added `ObservabilityBridge` (`scripts/infra/observability/observability_bridge.gd`)
- Data sources:
  - `GET /api/events?limit=<n>` polling
  - `GET /api/session/runtime` polling (readonly runtime mirror)
  - `GET /api/civil-memory?limit=<n>` polling (readonly memory-provider observability)
  - `WS /ws` subscribe (`{type:"subscribe", factionId, token?}`)
- Integration:
  - `main.gd` wires bridge to `ObservabilityPanel` scene instance
  - `scenes/ui/observability_panel.tscn` + `scripts/ui/observability_panel.gd` render independent panel

Optional env overrides:

- `SLG_BACKEND_URL`
- `SLG_PLAYER_NAME`
- `SLG_FACTION_ID`
- `SLG_MAP_SCOPE`
- `SLG_BOOTSTRAP_QUIT` (`1/true/yes` to force quit after bootstrap; useful in CI/headless checks)
- `SLG_EXPORT_BASELINE_ON_START` (`1/true/yes` to auto-export one baseline on startup; default off)
- `SLG_AUTO_ADVANCE_TICK_ON_BOOT` (`1/true/yes` to auto-call `advanceTick` once after bootstrap; for headless validation)

## Directory Notes

- `autoload/`: global stores (`world_store`, `session_store`, etc.)
- `scenes/`: scene graph
- `scripts/`: logic scripts
- `data/bootstrap/`: static bootstrap json
- `tests/`: smoke/integration scripts
