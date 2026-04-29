# Godot Map Surface Source Audit

## Scope

This audit covers the new standalone top resource strip component for `map_surface` and its mapping back to the source `MapUILogic.ts` behavior.

## Source facts

Primary source:

- `tmp/third_party/slgclient/assets/scripts/map/ui/MapUILogic.ts`

Relevant source sections:

- `nameLabel` and `ridLabel` declarations at lines `130-133`
- `_resArray` and `_yieldArray` declarations at lines `135-136`
- resource and yield key setup at lines `140-149`
- resource refresh binding at line `157`
- initial refresh calls at lines `175-176`
- `updateRoleRes()` implementation at lines `369-398`
- `updateRole()` implementation at lines `544-547`

## Field mapping

| Source fact | Source shape | Godot replacement |
| --- | --- | --- |
| Role name | `nameLabel` plus `updateRole()` | `roleName` chip |
| RID | `ridLabel` plus `updateRole()` | `rid` chip |
| Token count | `roleRes["decree"]` in `updateRoleRes()` | `tokenCount` chip |
| Grain resource | `_resArray` key `grain`, label `谷:` | `resources[]` item with `key=grain`, `label=谷`, `capacity` shown as `value/capacity` |
| Wood resource | `_resArray` key `wood`, label `木:` | `resources[]` item with `key=wood`, `label=木`, `capacity` shown as `value/capacity` |
| Iron resource | `_resArray` key `iron`, label `铁:` | `resources[]` item with `key=iron`, `label=铁`, `capacity` shown as `value/capacity` |
| Stone resource | `_resArray` key `stone`, label `石:` | `resources[]` item with `key=stone`, `label=石`, `capacity` shown as `value/capacity` |
| Gold resource | `_resArray` key `gold`, label `钱:` | `resources[]` item with `key=gold`, `label=钱`, `value` only |
| Wood yield | `_yieldArray` key `wood_yield`, label `木+` | `yields[]` item with `key=wood_yield`, `label=木+` |
| Iron yield | `_yieldArray` key `iron_yield`, label `铁+` | `yields[]` item with `key=iron_yield`, `label=铁+` |
| Stone yield | `_yieldArray` key `stone_yield`, label `石+` | `yields[]` item with `key=stone_yield`, `label=石+` |
| Grain yield | `_yieldArray` key `grain_yield`, label `谷+` | `yields[]` item with `key=grain_yield`, `label=谷+` |

## Current Godot replacement strategy

The new component lives at:

- `godot-client/scenes/dev/components/map_surface_top_strip.tscn`
- `godot-client/scripts/dev/components/map_surface_top_strip.gd`

Behavior:

1. The component is a standalone `Control` scene and can be opened directly.
2. It uses the imported slgclient UI textures through `ui_theme_tokens.gd` so the strip is built from project textures, not default Godot gray panels.
3. `apply_preview_state(state: Dictionary) -> void` accepts the host-provided preview state.
4. Missing or partial fields fall back to the built-in sample state so the scene remains readable when opened alone.
5. The top strip renders:
   - `headline`
   - `roleName`
   - `rid`
   - `tokenCount`
   - `resources[]`
   - `yields[]`
   - `statusBadges[]`
6. Resource formatting follows the source rule:
   - `grain`, `wood`, `iron`, `stone` render as `value/capacity`
   - `gold` renders as `value` only
7. Yield formatting keeps the `+` labels from the source array and shows the numeric value beside each label.

## Remaining original-project content not migrated

This component intentionally does not reimplement the rest of `MapUILogic.ts`.

Not migrated here:

1. Event wiring from `EventMgr`.
2. Login, union, city, fortress, general, army, draw, chat, and setting overlay flows.
3. `LoginCommand` and `MapCommand` integration.
4. `Tools.numberToShow()` formatting behavior.
5. Live runtime refresh and node instantiation behavior for the full map UI.
6. The original scroll-layout based resource presentation.

Those behaviors remain in the original source and can be migrated later if the main thread needs them.

## Verification intent

This component is intended to be validated with the formal direct-open command:

```text
D:/Apps/Godot/Godot_v4.6.2-stable_win64_console.exe --headless --path C:/Users/Buffoon Queer/Desktop/8989/godot-client --scene res://scenes/dev/components/map_surface_top_strip.tscn --quit-after 1
```

