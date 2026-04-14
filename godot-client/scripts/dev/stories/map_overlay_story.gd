@tool
extends "res://scripts/dev/stories/map_preview_story_base.gd"
class_name MapOverlayStory

const PAYLOAD_DEFAULT_PATH := "res://data/ui_preview/stories/map_overlay_story.json"

var _legend_rows: VBoxContainer
var _summary_rows: VBoxContainer


func _resolve_default_payload_path() -> String:
	return PAYLOAD_DEFAULT_PATH


func _build_story_shell() -> void:
	var root := get_story_content_root()

	var legend_panel := _create_panel(root, "OverlayLegendPanel")
	legend_panel.anchor_left = 0.0
	legend_panel.anchor_top = 1.0
	legend_panel.anchor_right = 0.0
	legend_panel.anchor_bottom = 1.0
	legend_panel.offset_left = 26.0
	legend_panel.offset_top = -220.0
	legend_panel.offset_right = 348.0
	legend_panel.offset_bottom = -24.0
	_apply_panel_style(legend_panel, "panel", "observability_panel")
	var legend_margin := _create_margin_container(legend_panel, "LegendMargin", 16, 16, 16, 16)
	legend_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_legend_rows = _create_vbox(legend_margin, "LegendRows", 8)
	_legend_rows.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var summary_panel := _create_panel(root, "OverlaySummaryPanel")
	summary_panel.anchor_left = 1.0
	summary_panel.anchor_top = 1.0
	summary_panel.anchor_right = 1.0
	summary_panel.anchor_bottom = 1.0
	summary_panel.offset_left = -386.0
	summary_panel.offset_top = -260.0
	summary_panel.offset_right = -26.0
	summary_panel.offset_bottom = -24.0
	_apply_panel_style(summary_panel, "panel", "hud_bottom_bar")
	var summary_margin := _create_margin_container(summary_panel, "SummaryMargin", 16, 16, 16, 16)
	summary_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_summary_rows = _create_vbox(summary_margin, "SummaryRows", 8)
	_summary_rows.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)


func _build_story_fixture_bundle(state: Dictionary) -> Dictionary:
	var width := 10
	var height := 7
	var tile_index := _build_tile_index(width, height, "Overlay Frontier")
	_fill_rect(tile_index, 0, 0, 9, 1, {"terrain": "mountain"})
	_fill_rect(tile_index, 0, 5, 9, 6, {"terrain": "sand"})
	_fill_rect(tile_index, 4, 0, 5, 6, {"terrain": "river"})
	_set_tile(tile_index, 2, 3, {"id": "city_home", "type": "city", "owner": "player", "cityLevel": 6, "district": "Capital Ridge"})
	_set_tile(tile_index, 7, 3, {"id": "city_enemy", "type": "city", "owner": "enemy_west", "cityLevel": 5, "district": "Border Watch"})
	_set_tile(tile_index, 1, 4, {"id": "res_wood_overlay", "type": "resource", "resourceKind": "wood", "resourceLevel": 4, "terrain": "forest"})
	_set_tile(tile_index, 3, 5, {"id": "res_stone_overlay", "type": "resource", "resourceKind": "stone", "resourceLevel": 3, "terrain": "hill"})
	_set_tile(tile_index, 6, 2, {"id": "res_iron_overlay", "type": "resource", "resourceKind": "iron", "resourceLevel": 4, "terrain": "hill"})
	_set_tile(tile_index, 8, 4, {"id": "res_grain_overlay", "type": "resource", "resourceKind": "grain", "resourceLevel": 2, "terrain": "grassland"})
	var tiles := _finalize_tiles(tile_index)
	var factions := [
		{"id": "player", "name": "Han Vanguard", "homeTileId": "city_home", "heroCommand": {"homeTileId": "city_home"}},
		{"id": "enemy_west", "name": "Western Banner", "homeTileId": "city_enemy", "heroCommand": {"homeTileId": "city_enemy"}}
	]
	return {
		"mapLayout": _make_map_layout_payload(width, height, tiles, str(state.get("scope", "preview_overlay")), ["overlay_frontier"]),
		"world": _make_world_payload(width, height, tiles, factions, [], int(state.get("tick", 3072)), int(state.get("worldVersion", 72))),
		"focus": {
			"zoom": float(state.get("zoom", 0.54)),
			"hoverTileId": str(state.get("hoverTileId", "city_home")),
			"hoverX": int(state.get("hoverX", 2)),
			"hoverY": int(state.get("hoverY", 3))
		}
	}


func _apply_story_state(state: Dictionary) -> void:
	var accent := _read_color(state.get("accentColor", null), Color(0.91, 0.83, 0.52, 0.98))
	_rebuild_label_rows(_legend_rows, state.get("legendLines", []), 13, accent)
	_rebuild_label_rows(_summary_rows, state.get("summaryLines", []), 13)
