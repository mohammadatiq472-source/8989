@tool
extends "res://scripts/dev/stories/map_preview_story_base.gd"
class_name NationLayerStory

const PAYLOAD_DEFAULT_PATH := "res://data/ui_preview/stories/nation_layer_story.json"
const NATION_LAYER_BANNER_SCENE := preload("res://scenes/dev/components/nation_layer_banner_panel.tscn")
const NATION_LAYER_PALETTE_SCENE := preload("res://scenes/dev/components/nation_layer_palette_panel.tscn")
const NATION_LAYER_ENTRY_SCENE := preload("res://scenes/dev/components/nation_layer_entry_panel.tscn")

var _banner_panel: Control
var _palette_panel: Control
var _entry_panel: Control


func _resolve_default_payload_path() -> String:
	return PAYLOAD_DEFAULT_PATH


func _build_story_shell() -> void:
	var root := get_story_content_root()
	_banner_panel = _attach_component(root, NATION_LAYER_BANNER_SCENE, "NationBannerPanel")
	_configure_banner_panel(_banner_panel)
	_palette_panel = _attach_component(root, NATION_LAYER_PALETTE_SCENE, "NationPalettePanel")
	_configure_palette_panel(_palette_panel)
	_entry_panel = _attach_component(root, NATION_LAYER_ENTRY_SCENE, "NationEntryPanel")
	_configure_entry_panel(_entry_panel)
	_connect_entry_signal()
	set_presentation_capture_mode(true)


func _apply_story_state(state: Dictionary) -> void:
	var component_state := _build_component_state(state)
	_apply_component_state(_banner_panel, component_state)
	_apply_component_state(_palette_panel, component_state)
	_apply_component_state(_entry_panel, component_state)


func _build_component_state(state: Dictionary) -> Dictionary:
	var component_state := state.duplicate(true)
	var macro_flow := _normalize_dictionary(_preview_payload.get("macroFlow", {}))
	if not macro_flow.is_empty():
		component_state["macroFlow"] = macro_flow
	return component_state


func _build_story_fixture_bundle(state: Dictionary) -> Dictionary:
	var width := 12
	var height := 8
	var tile_index := _build_tile_index(width, height, "Nation Layer")
	_fill_rect(tile_index, 0, 0, 3, 7, {"district": "Han Core", "owner": "han"})
	_fill_rect(tile_index, 4, 0, 7, 7, {"district": "Wei Core", "owner": "wei"})
	_fill_rect(tile_index, 8, 0, 11, 7, {"district": "Wu Core", "owner": "wu"})
	_fill_rect(tile_index, 3, 2, 8, 4, {"terrain": "river"})
	_set_tile(tile_index, 2, 3, {"id": "city_luoyang", "type": "city", "owner": "han", "cityLevel": 6, "district": "Han Core"})
	_set_tile(tile_index, 6, 3, {"id": "city_xuchang", "type": "city", "owner": "wei", "cityLevel": 5, "district": "Wei Core"})
	_set_tile(tile_index, 9, 2, {"id": "city_jianye", "type": "city", "owner": "wu", "cityLevel": 5, "district": "Wu Core"})
	_set_tile(tile_index, 1, 6, {"id": "res_grain_03", "type": "resource", "owner": "han", "terrain": "grassland", "resourceKind": "grain", "resourceLevel": 3})
	_set_tile(tile_index, 10, 6, {"id": "res_wood_03", "type": "resource", "owner": "wu", "terrain": "forest", "resourceKind": "wood", "resourceLevel": 3})
	var tiles := _finalize_tiles(tile_index)
	var factions := [
		{"id": "han", "name": "汉室", "homeTileId": "city_luoyang", "heroCommand": {"homeTileId": "city_luoyang"}},
		{"id": "wei", "name": "魏国", "homeTileId": "city_xuchang", "heroCommand": {"homeTileId": "city_xuchang"}},
		{"id": "wu", "name": "吴国", "homeTileId": "city_jianye", "heroCommand": {"homeTileId": "city_jianye"}}
	]
	return {
		"mapLayout": _make_map_layout_payload(width, height, tiles, str(state.get("scope", "fixture-nation-layer")), ["nation", "capital", "founding"]),
		"world": _make_world_payload(width, height, tiles, factions, [], int(state.get("tick", 4096)), int(state.get("worldVersion", 72))),
		"focus": {
			"zoom": float(state.get("zoom", 0.28)),
			"hoverTileId": str(state.get("hoverTileId", "city_luoyang")),
			"hoverX": int(state.get("hoverX", 2)),
			"hoverY": int(state.get("hoverY", 3))
		}
	}


func _attach_component(parent: Control, scene: PackedScene, node_name: String) -> Control:
	var instance := scene.instantiate()
	if instance is not Control:
		return null
	var control := instance as Control
	control.name = node_name
	parent.add_child(control)
	return control


func _configure_banner_panel(panel: Control) -> void:
	if panel == null:
		return
	panel.anchor_left = 0.5
	panel.anchor_top = 0.0
	panel.anchor_right = 0.5
	panel.anchor_bottom = 0.0
	panel.offset_left = -380.0
	panel.offset_top = 20.0
	panel.offset_right = 380.0
	panel.offset_bottom = 154.0


func _configure_palette_panel(panel: Control) -> void:
	if panel == null:
		return
	panel.anchor_left = 0.0
	panel.anchor_top = 0.0
	panel.anchor_right = 0.0
	panel.anchor_bottom = 0.0
	panel.offset_left = 24.0
	panel.offset_top = 184.0
	panel.offset_right = 440.0
	panel.offset_bottom = 438.0


func _configure_entry_panel(panel: Control) -> void:
	if panel == null:
		return
	panel.anchor_left = 1.0
	panel.anchor_top = 1.0
	panel.anchor_right = 1.0
	panel.anchor_bottom = 1.0
	panel.offset_left = -444.0
	panel.offset_top = -204.0
	panel.offset_right = -24.0
	panel.offset_bottom = -24.0


func _connect_entry_signal() -> void:
	if _entry_panel == null:
		return
	if not _entry_panel.has_signal("entry_requested"):
		return
	var callback := Callable(self, "_on_entry_requested")
	if _entry_panel.is_connected("entry_requested", callback):
		return
	_entry_panel.connect("entry_requested", callback)


func _on_entry_requested() -> void:
	cycle_preview_state()


func _apply_component_state(component: Control, state: Dictionary) -> void:
	if component == null:
		return
	if component.has_method("apply_preview_state"):
		component.call("apply_preview_state", state)
