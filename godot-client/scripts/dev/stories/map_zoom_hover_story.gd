@tool
extends "res://scripts/dev/stories/map_preview_story_base.gd"
class_name MapZoomHoverStory

const PAYLOAD_DEFAULT_PATH := "res://data/ui_preview/stories/map_zoom_hover_story.json"

var _focus_rows: VBoxContainer
var _legend_rows: VBoxContainer
var _hover_rows: VBoxContainer


func _resolve_default_payload_path() -> String:
	return PAYLOAD_DEFAULT_PATH


func _build_story_shell() -> void:
	var root := get_story_content_root()

	var focus_panel := _create_panel(root, "ZoomFocusPanel")
	focus_panel.anchor_left = 0.0
	focus_panel.anchor_top = 1.0
	focus_panel.anchor_right = 0.0
	focus_panel.anchor_bottom = 1.0
	focus_panel.offset_left = 26.0
	focus_panel.offset_top = -184.0
	focus_panel.offset_right = 336.0
	focus_panel.offset_bottom = -24.0
	_apply_panel_style(focus_panel, "panel", "observability_panel")
	var focus_margin := _create_margin_container(focus_panel, "FocusMargin", 16, 16, 16, 16)
	focus_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_focus_rows = _create_vbox(focus_margin, "FocusRows", 8)
	_focus_rows.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var legend_panel := _create_panel(root, "ZoomLegendPanel")
	legend_panel.anchor_left = 1.0
	legend_panel.anchor_top = 0.0
	legend_panel.anchor_right = 1.0
	legend_panel.anchor_bottom = 0.0
	legend_panel.offset_left = -356.0
	legend_panel.offset_top = 188.0
	legend_panel.offset_right = -26.0
	legend_panel.offset_bottom = 378.0
	_apply_panel_style(legend_panel, "panel", "hud_top_left")
	var legend_margin := _create_margin_container(legend_panel, "LegendMargin", 16, 16, 16, 16)
	legend_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_legend_rows = _create_vbox(legend_margin, "LegendRows", 8)
	_legend_rows.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var hover_callout := _create_panel(root, "HoverCallout")
	hover_callout.anchor_left = 0.5
	hover_callout.anchor_top = 1.0
	hover_callout.anchor_right = 0.5
	hover_callout.anchor_bottom = 1.0
	hover_callout.offset_left = -220.0
	hover_callout.offset_top = -116.0
	hover_callout.offset_right = 220.0
	hover_callout.offset_bottom = -24.0
	_apply_panel_style(hover_callout, "panel", "hud_bottom_bar")
	var hover_margin := _create_margin_container(hover_callout, "HoverMargin", 16, 14, 16, 14)
	hover_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_hover_rows = _create_vbox(hover_margin, "HoverRows", 6)
	_hover_rows.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)


func _build_story_fixture_bundle(state: Dictionary) -> Dictionary:
	var width := 9
	var height := 7
	var tile_index := _build_tile_index(width, height, "Luoyang Prefecture")
	_fill_rect(tile_index, 0, 0, 2, 6, {"district": "Province Ring"})
	_fill_rect(tile_index, 3, 0, 5, 6, {"district": "Warzone Ring"})
	_fill_rect(tile_index, 6, 0, 8, 6, {"district": "Tile Ring"})
	_fill_rect(tile_index, 1, 1, 1, 5, {"terrain": "mountain"})
	_fill_rect(tile_index, 4, 0, 4, 6, {"terrain": "river"})
	_set_tile(tile_index, 2, 3, {"id": "city_loyang", "type": "city", "owner": "player", "cityLevel": 6, "district": "Province Ring"})
	_set_tile(tile_index, 5, 3, {"id": "city_hulao", "type": "city", "owner": "ally_north", "cityLevel": 4, "district": "Warzone Ring"})
	_set_tile(tile_index, 7, 2, {"id": "res_iron_02", "type": "resource", "resourceKind": "iron", "resourceLevel": 4, "terrain": "hill", "district": "Tile Ring"})
	_set_tile(tile_index, 7, 5, {"id": "res_wood_02", "type": "resource", "resourceKind": "wood", "resourceLevel": 3, "terrain": "forest", "district": "Tile Ring"})
	var tiles := _finalize_tiles(tile_index)
	var factions := [
		{"id": "player", "name": "Han Vanguard", "homeTileId": "city_loyang", "heroCommand": {"homeTileId": "city_loyang"}},
		{"id": "ally_north", "name": "Northern Shield", "homeTileId": "city_hulao", "heroCommand": {"homeTileId": "city_hulao"}}
	]
	return {
		"mapLayout": _make_map_layout_payload(width, height, tiles, str(state.get("scope", "fixture-map-zoom-hover")), ["overview", "warzone", "tile"]),
		"world": _make_world_payload(width, height, tiles, factions, [], int(state.get("tick", 2048)), int(state.get("worldVersion", 64))),
		"focus": {
			"zoom": float(state.get("zoom", 0.34)),
			"hoverTileId": str(state.get("hoverTileId", "city_loyang")),
			"hoverX": int(state.get("hoverX", 2)),
			"hoverY": int(state.get("hoverY", 3))
		}
	}


func _apply_story_state(state: Dictionary) -> void:
	var accent := _read_color(state.get("accentColor", null), Color(0.74, 0.88, 1.0, 0.96))
	_rebuild_label_rows(_focus_rows, state.get("focusLines", []), 13, accent)
	_rebuild_label_rows(_legend_rows, state.get("legendLines", []), 13)
	_rebuild_label_rows(_hover_rows, state.get("hoverLines", []), 13, accent)
