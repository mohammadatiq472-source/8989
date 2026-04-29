@tool
extends "res://scripts/dev/stories/map_preview_story_base.gd"
class_name MapUnitsStory

const PAYLOAD_DEFAULT_PATH := "res://data/ui_preview/stories/map_units_story.json"

var _roster_rows: VBoxContainer
var _action_rows: VBoxContainer


func _resolve_default_payload_path() -> String:
	return PAYLOAD_DEFAULT_PATH


func _build_story_shell() -> void:
	var root := get_story_content_root()

	var roster_panel := _create_panel(root, "UnitsRosterPanel")
	roster_panel.anchor_left = 0.0
	roster_panel.anchor_top = 0.0
	roster_panel.anchor_right = 0.0
	roster_panel.anchor_bottom = 1.0
	roster_panel.offset_left = 26.0
	roster_panel.offset_top = 214.0
	roster_panel.offset_right = 312.0
	roster_panel.offset_bottom = -24.0
	_apply_panel_style(roster_panel, "panel", "observability_panel")
	var roster_margin := _create_margin_container(roster_panel, "RosterMargin", 16, 16, 16, 16)
	roster_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_roster_rows = _create_vbox(roster_margin, "RosterRows", 8)
	_roster_rows.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var action_panel := _create_panel(root, "UnitActionPanel")
	action_panel.anchor_left = 1.0
	action_panel.anchor_top = 1.0
	action_panel.anchor_right = 1.0
	action_panel.anchor_bottom = 1.0
	action_panel.offset_left = -386.0
	action_panel.offset_top = -220.0
	action_panel.offset_right = -26.0
	action_panel.offset_bottom = -24.0
	_apply_panel_style(action_panel, "panel", "hud_bottom_bar")
	var action_margin := _create_margin_container(action_panel, "ActionMargin", 16, 16, 16, 16)
	action_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_action_rows = _create_vbox(action_margin, "ActionRows", 8)
	_action_rows.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)


func _story_uses_unit_layer(_state: Dictionary) -> bool:
	return true


func _build_story_fixture_bundle(state: Dictionary) -> Dictionary:
	var width := 8
	var height := 8
	var tile_index := _build_tile_index(width, height, "Central Plains")
	_fill_rect(tile_index, 0, 2, 7, 2, {"terrain": "river"})
	_fill_rect(tile_index, 3, 4, 4, 7, {"terrain": "mountain"})
	_set_tile(tile_index, 1, 5, {"id": "city_player_base", "type": "city", "owner": "player", "cityLevel": 6, "district": "Central Plains"})
	_set_tile(tile_index, 6, 1, {"id": "city_enemy_base", "type": "city", "owner": "enemy_west", "cityLevel": 5, "district": "Central Plains"})
	_set_tile(tile_index, 5, 5, {"id": "res_iron_units", "type": "resource", "resourceKind": "iron", "resourceLevel": 4, "terrain": "hill"})
	var tiles := _finalize_tiles(tile_index)
	var factions := [
		{"id": "player", "name": "Han Vanguard", "homeTileId": "city_player_base", "heroCommand": {"homeTileId": "city_player_base"}},
		{"id": "enemy_west", "name": "Western Banner", "homeTileId": "city_enemy_base", "heroCommand": {"homeTileId": "city_enemy_base"}}
	]
	var history_payload: Dictionary = state.get("history", {}) as Dictionary
	return {
		"mapLayout": _make_map_layout_payload(width, height, tiles, str(state.get("scope", "preview_units")), ["unit_ops"]),
		"world": _make_world_payload(width, height, tiles, factions, state.get("units", []), int(state.get("tick", 4096)), int(state.get("worldVersion", 96)), history_payload),
		"focus": {
			"zoom": float(state.get("zoom", 0.58)),
			"hoverTileId": str(state.get("hoverTileId", "city_player_base")),
			"hoverX": int(state.get("hoverX", 1)),
			"hoverY": int(state.get("hoverY", 5))
		}
	}


func _apply_story_state(state: Dictionary) -> void:
	var accent := _read_color(state.get("accentColor", null), Color(0.92, 0.54, 0.42, 0.98))
	_rebuild_label_rows(_roster_rows, state.get("rosterLines", []), 13, accent)
	_rebuild_label_rows(_action_rows, state.get("actionLines", []), 13)
