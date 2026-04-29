# World Event Activity Entry Integration Notes (2026-04-29)

## Purpose

Window 4's four formal secondary pages now use the same template renderer, but they should be treated as four independent entry pages in mainline:

- `activity` -> `精彩活动`
- `world_affairs` / `event` / `world_event` -> `天下大势`
- `tasks` -> `任务`
- `faction_status` -> `势力状态`

The goal is to keep one reusable template stack while making later real-entry wiring and asset upload replacement explicit.

## Current implementation

Mainline already passes `default_page_id` into `WorldEventActivityPanel`.

The panel now normalizes incoming snapshots into focused entry mode:

- keep only the requested page section
- hide the shared tab strip for integrated entry panels
- preserve the standalone scene preview mode for local template inspection

This means:

- `panel-id activity` opens only `精彩活动`
- `panel-id world_affairs` opens only `天下大势`
- `panel-id tasks` opens only `任务`
- `panel-id faction_status` opens only `势力状态`

## Data source

The authoritative template fixture is:

- `godot-client/data/ui/world_event_activity_template_fixture.json`

It now contains top-level `entry_configs` so later AI or human integration work can read the mapping directly instead of inferring it from screenshots or chat memory.

## Entry configs

### 1. 精彩活动

- page id: `activities`
- panel ids: `activity`
- hide tabs: `true`
- asset slots:
  - `activity_login_reward`
  - `activity_inherit`
  - `activity_shop`

Current direction:

- keep the three formal cards
- do not ship ugly temporary art
- allow later uploaded assets to replace blank cover areas directly in data

### 2. 天下大势

- page id: `world_affairs`
- panel ids:
  - `event`
  - `world_event`
  - `world_affairs`
- hide tabs: `true`
- asset slots:
  - `world_affairs_scene`

Current direction:

- keep the current battlefield-style scene
- this is a season-goal / situation-progress template, not a real nation-war rules page
- each bottom node should later receive its own dedicated asset while keeping the shared `world_affairs` page id stable
- declared asset slots:
  - `world_affairs_scene`
  - `world_affairs_node_01`
  - `world_affairs_node_02`
  - `world_affairs_node_03`
  - `world_affairs_node_04`
  - `world_affairs_node_05`
  - `world_affairs_node_06`
  - `world_affairs_node_07`
  - `world_affairs_node_08`
  - `world_affairs_node_09`
  - `world_affairs_node_10`

### 3. 任务

- page id: `tasks`
- panel ids: `tasks`
- hide tabs: `true`
- asset slots:
  - `task_chapter_scene`

Current direction:

- left chapter scene is still template art
- right task bars stay template-only until real task authority exists

### 4. 势力状态

- page id: `faction_status`
- panel ids: `faction_status`
- hide tabs: `true`
- asset slots:
  - `faction_status_map_preview`

Current direction:

- left territory list is display-only
- right map is a state-page placeholder, not a real macro map component

## Pending real integration checklist

These items are intentionally not connected yet:

- real reward grant
- inventory write
- task settlement
- map jump
- backend authority

When another window connects real entrances, the expected order is:

1. keep `panel-id -> page-id` mapping stable
2. replace blank/template assets by writing actual paths into the declared `asset_slot` targets
3. wire page-specific real actions one page at a time
4. do not collapse the four pages back into one shared multi-tab product page

## Asset upload replacement rule

If later AI replaces visuals, prefer editing data first:

- update `image_path` or `scene_image_path`
- keep `asset_slot` unchanged as the stable contract name
- keep `cover_mode = blank_upload_slot` for activity cards until a real image path is present

Do not treat generated placeholder art as final production asset.

## Boundary

This template package is still UI/template-only.

It does not authorize edits to:

- `server/**`
- `shared/**`
- `godot-client/scripts/map/**`
- `main.gd`
- `native_slg_shell`

unless a later task explicitly reopens those boundaries.
