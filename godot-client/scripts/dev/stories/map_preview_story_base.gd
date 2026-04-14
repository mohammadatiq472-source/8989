@tool
extends "res://scripts/dev/stories/ui_preview_story_base.gd"
class_name MapPreviewStoryBase

const MAP_GRID_SCRIPT = preload("res://scripts/map/map_grid.gd")
const UNIT_VIEW_LAYER_SCRIPT = preload("res://scripts/map/unit_view_layer.gd")

const HOVER_LABEL_PATH := NodePath("../OverlayCanvas/OverlayRoot/TopLeftDock/InfoPanel/InfoMargin/InfoVBox/HoverInfo")
const EXPORT_BUTTON_PATH := NodePath("../OverlayCanvas/OverlayRoot/BottomRightDock/ControlsPanel/ControlsMargin/ControlsVBox/ControlButtons/ExportButton")
const EXPORT_STATUS_PATH := NodePath("../OverlayCanvas/OverlayRoot/TopLeftDock/InfoPanel/InfoMargin/InfoVBox/ExportStatus")

var _overlay_canvas: CanvasLayer
var _overlay_root: Control
var _story_content_root: Control
var _map_grid: Node2D
var _unit_view_layer: Node2D

var _hover_label: Label
var _perf_label: Label
var _export_status_label: Label
var _title_label: Label
var _description_label: Label
var _state_label: Label
var _meta_label: Label
var _refresh_button: Button
var _cycle_button: Button
var _export_button: Button
var _info_dock: Control
var _story_dock: Control
var _controls_dock: Control
var _presentation_capture_mode: bool = false


func _ready() -> void:
	_build_common_shell()
	_build_story_shell()
	if payload_path.strip_edges() == "":
		payload_path = _resolve_default_payload_path()
	boot_preview_story()


func _resolve_default_payload_path() -> String:
	return ""


func _build_story_shell() -> void:
	pass


func _apply_story_state(_state: Dictionary) -> void:
	pass


func _build_story_fixture_bundle(_state: Dictionary) -> Dictionary:
	return {}


func _story_uses_unit_layer(_state: Dictionary) -> bool:
	return false


func get_story_content_root() -> Control:
	return _story_content_root


func get_map_grid() -> Node2D:
	return _map_grid


func get_unit_view_layer() -> Node2D:
	return _unit_view_layer


func _apply_preview_payload() -> void:
	var source_meta := get_preview_data_source_meta()
	var effective_source_mode := str(source_meta.get("effectiveMode", "fixture")).strip_edges()
	var validation_meta := get_preview_validation()
	var expected_state_count := int(validation_meta.get("expectedStateCount", 0))
	_title_label.text = str(_active_state.get("headline", _preview_payload.get("title", story_title)))
	_description_label.text = str(_preview_payload.get("description", story_description))
	_state_label.text = "State: %s | source=%s" % [get_active_state_label(), effective_source_mode]
	_meta_label.text = "capture targets=%d | validation=%d states" % [capture_targets().size(), expected_state_count]
	_perf_label.text = str(_active_state.get("perfSummary", "Perf | stable preview summary for screenshot regression."))
	_export_status_label.text = str(_active_state.get("exportStatus", "Export | ready"))
	_set_unit_layer_enabled(_story_uses_unit_layer(_active_state))
	_apply_fixture_bundle(_build_story_fixture_bundle(_active_state))
	_apply_story_state(_active_state)


func _build_common_shell() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	_overlay_canvas = CanvasLayer.new()
	_overlay_canvas.name = "OverlayCanvas"
	_overlay_canvas.layer = 10
	add_child(_overlay_canvas)

	_overlay_root = Control.new()
	_overlay_root.name = "OverlayRoot"
	_overlay_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_overlay_canvas.add_child(_overlay_root)

	_story_content_root = Control.new()
	_story_content_root.name = "StoryContentRoot"
	_story_content_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_overlay_root.add_child(_story_content_root)

	_build_info_panel()
	_build_story_panel()
	_build_controls_panel()

	_map_grid = Node2D.new()
	_map_grid.name = "MapGrid"
	_map_grid.set_script(MAP_GRID_SCRIPT)
	_map_grid.set("hover_label_path", HOVER_LABEL_PATH)
	_map_grid.set("export_button_path", EXPORT_BUTTON_PATH)
	_map_grid.set("export_status_label_path", EXPORT_STATUS_PATH)
	add_child(_map_grid)

	_unit_view_layer = Node2D.new()
	_unit_view_layer.name = "UnitViewLayer"
	_unit_view_layer.set_script(UNIT_VIEW_LAYER_SCRIPT)
	_unit_view_layer.visible = false
	add_child(_unit_view_layer)
	_apply_presentation_capture_mode()


func _build_info_panel() -> void:
	var dock := Control.new()
	dock.name = "TopLeftDock"
	dock.anchor_left = 0.0
	dock.anchor_top = 0.0
	dock.anchor_right = 0.0
	dock.anchor_bottom = 0.0
	dock.offset_left = 20.0
	dock.offset_top = 20.0
	dock.offset_right = 360.0
	dock.offset_bottom = 210.0
	_overlay_root.add_child(dock)
	_info_dock = dock

	var panel := _create_panel(dock, "InfoPanel")
	panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_apply_panel_style(panel, "panel", "hud_top_left")
	var margin := _create_margin_container(panel, "InfoMargin", 16, 14, 16, 14)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var vbox := _create_vbox(margin, "InfoVBox", 8)
	vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var title := _create_label(vbox, "InfoTitle", "Map Telemetry", 16)
	title.modulate = Color(0.87, 0.94, 1.0, 0.96)
	_hover_label = _create_label(vbox, "HoverInfo", "Hover | waiting for fixture focus...", 13)
	_perf_label = _create_label(vbox, "PerfInfo", "Perf | waiting for map redraw stats...", 13)
	_export_status_label = _create_label(vbox, "ExportStatus", "Export | idle", 13)


func _build_story_panel() -> void:
	var dock := Control.new()
	dock.name = "TopCenterDock"
	dock.anchor_left = 0.5
	dock.anchor_top = 0.0
	dock.anchor_right = 0.5
	dock.anchor_bottom = 0.0
	dock.offset_left = -310.0
	dock.offset_top = 20.0
	dock.offset_right = 310.0
	dock.offset_bottom = 168.0
	_overlay_root.add_child(dock)
	_story_dock = dock

	var panel := _create_panel(dock, "StoryPanel")
	panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_apply_panel_style(panel, "panel", "hud_top_left")
	var margin := _create_margin_container(panel, "StoryMargin", 18, 16, 18, 16)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var vbox := _create_vbox(margin, "StoryVBox", 8)
	vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_title_label = _create_label(vbox, "Title", "Map Preview Story", 22)
	_description_label = _create_label(vbox, "Description", "Reusable sandbox story for map-first UI work.", 14)
	_state_label = _create_label(vbox, "StateLabel", "State: idle", 13)
	_meta_label = _create_label(vbox, "MetaLabel", "capture targets=0 | validation=0 states", 13)


func _build_controls_panel() -> void:
	var dock := Control.new()
	dock.name = "BottomRightDock"
	dock.anchor_left = 1.0
	dock.anchor_top = 1.0
	dock.anchor_right = 1.0
	dock.anchor_bottom = 1.0
	dock.offset_left = -420.0
	dock.offset_top = -142.0
	dock.offset_right = -20.0
	dock.offset_bottom = -20.0
	_overlay_root.add_child(dock)
	_controls_dock = dock

	var panel := _create_panel(dock, "ControlsPanel")
	panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_apply_panel_style(panel, "panel", "hud_bottom_bar")
	var margin := _create_margin_container(panel, "ControlsMargin", 16, 14, 16, 14)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var vbox := _create_vbox(margin, "ControlsVBox", 10)
	vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var title := _create_label(vbox, "ControlsTitle", "Story Controls", 16)
	title.modulate = Color(0.96, 0.98, 1.0, 0.96)
	var summary := _create_label(vbox, "ControlsSummary", "Refresh fixture, cycle state, or export the current perf baseline.", 13)
	summary.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	var button_row := _create_hbox(vbox, "ControlButtons", 10)
	_refresh_button = _create_button(button_row, "RefreshButton", "Refresh Fixture", 14, 120)
	_cycle_button = _create_button(button_row, "CycleButton", "Cycle State", 14, 110)
	_export_button = _create_button(button_row, "ExportButton", "Export Perf", 14, 120)
	_apply_button_style(_refresh_button, "refresh")
	_apply_button_style(_cycle_button, "advance_tick")
	_apply_button_style(_export_button, "export")
	_refresh_button.pressed.connect(_on_refresh_button_pressed)
	_cycle_button.pressed.connect(_on_cycle_button_pressed)


func _on_refresh_button_pressed() -> void:
	if not _preview_payload.is_empty():
		_apply_preview_payload()


func _on_cycle_button_pressed() -> void:
	cycle_preview_state()


func set_presentation_capture_mode(enabled: bool) -> void:
	_presentation_capture_mode = enabled
	_apply_presentation_capture_mode()


func is_presentation_capture_mode_enabled() -> bool:
	return _presentation_capture_mode


func _apply_presentation_capture_mode() -> void:
	var docks: Array = [_info_dock, _story_dock, _controls_dock]
	for dock in docks:
		if dock != null and is_instance_valid(dock):
			dock.visible = not _presentation_capture_mode


func _set_unit_layer_enabled(enabled: bool) -> void:
	if _unit_view_layer == null:
		return
	_unit_view_layer.visible = enabled
	_unit_view_layer.process_mode = Node.PROCESS_MODE_INHERIT if enabled else Node.PROCESS_MODE_DISABLED


func _apply_fixture_bundle(bundle: Dictionary) -> void:
	if bundle.is_empty():
		return
	var world_payload: Dictionary = bundle.get("world", {}) as Dictionary
	var map_layout_payload: Dictionary = bundle.get("mapLayout", {}) as Dictionary
	if not world_payload.is_empty():
		WorldStore.set_world(world_payload)
	if not map_layout_payload.is_empty():
		WorldStore.set_map_layout(map_layout_payload)
	var focus_payload: Dictionary = bundle.get("focus", {}) as Dictionary
	if not focus_payload.is_empty():
		call_deferred("_apply_focus_config", focus_payload.duplicate(true))


func _apply_focus_config(focus_payload: Dictionary) -> void:
	await get_tree().process_frame
	await get_tree().process_frame
	if _map_grid == null:
		return

	var target_zoom := float(focus_payload.get("zoom", 0.0))
	if target_zoom > 0.0:
		var current_zoom := float(_map_grid.get("_zoom"))
		if not is_equal_approx(current_zoom, target_zoom):
			var multiplier: float = target_zoom / max(current_zoom, 0.001)
			_map_grid.call("_apply_zoom", multiplier, get_viewport().get_visible_rect().size * 0.5)

	var hover_tile_id := str(focus_payload.get("hoverTileId", "")).strip_edges()
	var hover_x := int(focus_payload.get("hoverX", 0))
	var hover_y := int(focus_payload.get("hoverY", 0))
	if hover_tile_id != "":
		var hover_pos: Vector2 = _map_grid.call("tile_id_to_screen_position", hover_tile_id, hover_x, hover_y)
		_map_grid.call("_update_hover", hover_pos)
	elif focus_payload.has("hoverX") and focus_payload.has("hoverY"):
		var hover_coord_pos: Vector2 = _map_grid.call("tile_to_screen_position", hover_x, hover_y)
		_map_grid.call("_update_hover", hover_coord_pos)


func _build_tile_index(width: int, height: int, district_name: String = "Si Li") -> Dictionary:
	var tile_index: Dictionary = {}
	for y in range(height):
		for x in range(width):
			var tile_id := "tile_%02d_%02d" % [x, y]
			tile_index[_tile_key(x, y)] = {
				"id": tile_id,
				"x": x,
				"y": y,
				"type": "land",
				"terrain": "plain",
				"district": district_name,
			}
	return tile_index


func _set_tile(tile_index: Dictionary, x: int, y: int, overrides: Dictionary) -> void:
	var key := _tile_key(x, y)
	if not tile_index.has(key):
		return
	var tile_entry: Dictionary = (tile_index[key] as Dictionary).duplicate(true)
	for override_key_variant in overrides.keys():
		var override_key := str(override_key_variant)
		tile_entry[override_key] = overrides[override_key_variant]
	tile_index[key] = tile_entry


func _fill_rect(tile_index: Dictionary, from_x: int, from_y: int, to_x: int, to_y: int, overrides: Dictionary) -> void:
	for y in range(from_y, to_y + 1):
		for x in range(from_x, to_x + 1):
			_set_tile(tile_index, x, y, overrides)


func _finalize_tiles(tile_index: Dictionary) -> Array:
	var tiles: Array = tile_index.values()
	tiles.sort_custom(Callable(self, "_sort_tiles"))
	return tiles


func _sort_tiles(a: Dictionary, b: Dictionary) -> bool:
	var ay := int(a.get("y", 0))
	var by := int(b.get("y", 0))
	if ay == by:
		return int(a.get("x", 0)) < int(b.get("x", 0))
	return ay < by


func _make_map_layout_payload(width: int, height: int, tiles: Array, scope: String, loaded_province_ids: Array = []) -> Dictionary:
	return {
		"map": {
			"width": width,
			"height": height,
			"tileCount": tiles.size(),
			"tiles": tiles,
		},
		"chunk": {
			"scope": scope,
			"loadedProvinceIds": loaded_province_ids,
		},
	}


func _make_world_payload(width: int, height: int, tiles: Array, factions: Array, units: Array, tick: int, world_version: int, history_payload: Dictionary = {}) -> Dictionary:
	return {
		"tick": tick,
		"worldVersion": world_version,
		"map": {
			"width": width,
			"height": height,
			"tileCount": tiles.size(),
			"tiles": tiles,
		},
		"factions": factions,
		"units": units,
		"reports": [],
		"planQueue": [],
		"history": history_payload,
	}


func _clear_children(parent: Node) -> void:
	for child in parent.get_children():
		child.queue_free()


func _rebuild_label_rows(parent: Node, rows: Array, font_size: int = 13, accent: Color = Color(0.96, 0.98, 1.0, 0.92)) -> void:
	_clear_children(parent)
	var index := 0
	for row_variant in rows:
		var row_text := str(row_variant).strip_edges()
		if row_text == "":
			continue
		var label := _create_label(parent, "Row_%d" % index, row_text, font_size)
		label.modulate = accent
		index += 1


func _rebuild_button_row(parent: Node, labels: Array, token_name: String = "advance_tick", font_size: int = 13, min_width: int = 112) -> void:
	_clear_children(parent)
	var index := 0
	for label_variant in labels:
		var label_text := str(label_variant).strip_edges()
		if label_text == "":
			continue
		var button := _create_button(parent, "Button_%d" % index, label_text, font_size, min_width)
		_apply_button_style(button, token_name)
		index += 1


func _tile_key(x: int, y: int) -> String:
	return "%d:%d" % [x, y]
