@tool
extends "res://scripts/dev/stories/map_preview_story_base.gd"
class_name WarzoneLayerStory

const PAYLOAD_DEFAULT_PATH := "res://data/ui_preview/stories/warzone_layer_story.json"
const STAGE_PANEL_SCENE := preload("res://scenes/dev/components/warzone_stage_panel.tscn")
const PRESSURE_PANEL_SCENE := preload("res://scenes/dev/components/warzone_pressure_panel.tscn")
const ROUTE_PANEL_SCENE := preload("res://scenes/dev/components/warzone_route_panel.tscn")
const SUMMARY_PANEL_SCENE := preload("res://scenes/dev/components/warzone_summary_panel.tscn")
const DEFAULT_INTERACTION_ACTIONS := [
	{"id": "locate_luoyang", "label": "定位洛阳"},
	{"id": "locate_hulao", "label": "定位虎牢"},
	{"id": "prioritize_main_route", "label": "主路优先"},
	{"id": "prioritize_side_route", "label": "支路优先"},
	{"id": "audit_gate", "label": "关口复核"},
	{"id": "set_pressure_threshold", "label": "压强阈值"},
	{"id": "supply_alert", "label": "补给告警"},
	{"id": "refresh_recon", "label": "侦察刷新"},
	{"id": "open_battle_log", "label": "战区日志"},
	{"id": "sync_route", "label": "路线同步"},
	{"id": "reset_summary", "label": "重置摘要"},
	{"id": "go_nation", "label": "进入国家层"},
]

var _stage_panel: Control
var _pressure_panel: Control
var _route_panel: Control
var _summary_panel: Control
var _interaction_board: PanelContainer
var _interaction_state_label: Label
var _interaction_counter_label: Label
var _interaction_last_label: Label
var _interaction_grid: GridContainer
var _interaction_count: int = 0


func _resolve_default_payload_path() -> String:
	return PAYLOAD_DEFAULT_PATH


func _build_story_shell() -> void:
	var root := get_story_content_root()

	var backdrop := ColorRect.new()
	backdrop.name = "WarzoneBackdrop"
	backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	backdrop.color = Color(0.03, 0.05, 0.08, 0.98)
	root.add_child(backdrop)

	_stage_panel = _mount_component(root, STAGE_PANEL_SCENE, "WarzoneStagePanel")
	_configure_rect(_stage_panel, 0.0, 0.0, 0.63, 0.72, 24.0, 20.0, -18.0, -18.0)

	_pressure_panel = _mount_component(root, PRESSURE_PANEL_SCENE, "HotspotPressurePanel")
	_configure_rect(_pressure_panel, 0.65, 0.0, 1.0, 0.35, 0.0, 20.0, -24.0, -14.0)

	_route_panel = _mount_component(root, ROUTE_PANEL_SCENE, "RouteGatePanel")
	_configure_rect(_route_panel, 0.65, 0.36, 1.0, 0.60, 0.0, 6.0, -24.0, -10.0)

	_summary_panel = _mount_component(root, SUMMARY_PANEL_SCENE, "WarzoneSummaryPanel")
	_configure_rect(_summary_panel, 0.0, 0.79, 1.0, 1.0, 24.0, 0.0, -24.0, -20.0)
	_connect_summary_signal()
	_build_interaction_board(root)

	set_presentation_capture_mode(true)


func _build_story_fixture_bundle(state: Dictionary) -> Dictionary:
	var width := 14
	var height := 9
	var tile_index := _build_tile_index(width, height, "Si Li")
	_fill_rect(tile_index, 0, 0, 3, 8, {"district": "Luoyang Basin"})
	_fill_rect(tile_index, 4, 0, 8, 8, {"district": "Hulao Corridor"})
	_fill_rect(tile_index, 9, 0, 13, 8, {"district": "Eastern Front"})
	_fill_rect(tile_index, 5, 0, 5, 8, {"terrain": "riverland"})
	_fill_rect(tile_index, 1, 1, 2, 2, {"terrain": "mountain"})
	_fill_rect(tile_index, 10, 6, 12, 7, {"terrain": "wasteland"})
	_set_tile(tile_index, 2, 4, {"id": "city_luoyang", "type": "city", "owner": "player", "cityLevel": 6, "district": "Luoyang Basin"})
	_set_tile(tile_index, 6, 3, {"id": "city_hulao", "type": "city", "owner": "ally_north", "cityLevel": 5, "district": "Hulao Corridor"})
	_set_tile(tile_index, 9, 5, {"id": "city_fusui", "type": "city", "owner": "ally_south", "cityLevel": 4, "district": "Eastern Front"})
	_set_tile(tile_index, 12, 2, {"id": "city_yongmen", "type": "city", "owner": "enemy_east", "cityLevel": 3, "district": "Eastern Front"})
	_set_tile(tile_index, 7, 6, {"id": "res_iron_gate", "type": "resource", "resourceKind": "iron", "resourceLevel": 4, "terrain": "hill", "district": "Hulao Corridor"})
	_set_tile(tile_index, 11, 4, {"id": "res_wood_front", "type": "resource", "resourceKind": "wood", "resourceLevel": 3, "terrain": "forest", "district": "Eastern Front"})
	var tiles := _finalize_tiles(tile_index)
	var factions := [
		{"id": "player", "name": "Han Vanguard", "homeTileId": "city_luoyang", "heroCommand": {"homeTileId": "city_luoyang"}},
		{"id": "ally_north", "name": "Northern Shield", "homeTileId": "city_hulao", "heroCommand": {"homeTileId": "city_hulao"}},
		{"id": "ally_south", "name": "South Wall", "homeTileId": "city_fusui", "heroCommand": {"homeTileId": "city_fusui"}},
		{"id": "enemy_east", "name": "Eastern Pressure", "homeTileId": "city_yongmen", "heroCommand": {"homeTileId": "city_yongmen"}}
	]
	return {
		"mapLayout": _make_map_layout_payload(width, height, tiles, str(state.get("scope", "fixture-warzone-layer")), ["si_li", "ji", "yu"]),
		"world": _make_world_payload(width, height, tiles, factions, [], int(state.get("tick", 4096)), int(state.get("worldVersion", 88))),
		"focus": {
			"zoom": float(state.get("zoom", 0.48)),
			"hoverTileId": str(state.get("hoverTileId", "city_hulao")),
			"hoverX": int(state.get("hoverX", 6)),
			"hoverY": int(state.get("hoverY", 3))
		}
	}


func _apply_story_state(state: Dictionary) -> void:
	var component_state := _build_component_state(state)
	_apply_component_state(_stage_panel, component_state)
	_apply_component_state(_pressure_panel, component_state)
	_apply_component_state(_route_panel, component_state)
	_apply_component_state(_summary_panel, component_state)
	_sync_interaction_board(state)


func _mount_component(parent: Node, packed_scene: PackedScene, node_name: String) -> Control:
	if packed_scene == null:
		push_warning("[warzone-layer-story] missing component scene: %s" % node_name)
		return null
	var instance := packed_scene.instantiate() as Control
	if instance == null:
		push_warning("[warzone-layer-story] failed to instantiate component: %s" % node_name)
		return null
	instance.name = node_name
	parent.add_child(instance)
	return instance


func _configure_rect(component: Control, anchor_left: float, anchor_top: float, anchor_right: float, anchor_bottom: float, offset_left: float, offset_top: float, offset_right: float, offset_bottom: float) -> void:
	if component == null:
		return
	component.anchor_left = anchor_left
	component.anchor_top = anchor_top
	component.anchor_right = anchor_right
	component.anchor_bottom = anchor_bottom
	component.offset_left = offset_left
	component.offset_top = offset_top
	component.offset_right = offset_right
	component.offset_bottom = offset_bottom


func _apply_component_state(component: Control, state: Dictionary) -> void:
	if component != null and component.has_method("apply_preview_state"):
		component.call("apply_preview_state", state)


func _build_interaction_board(root: Control) -> void:
	if _interaction_board != null and is_instance_valid(_interaction_board):
		return
	_interaction_board = PanelContainer.new()
	_interaction_board.name = "WarzoneInteractionBoard"
	_interaction_board.anchor_left = 0.0
	_interaction_board.anchor_top = 0.62
	_interaction_board.anchor_right = 0.63
	_interaction_board.anchor_bottom = 0.79
	_interaction_board.offset_left = 24.0
	_interaction_board.offset_top = 10.0
	_interaction_board.offset_right = -18.0
	_interaction_board.offset_bottom = -8.0
	_apply_panel_style(_interaction_board, "panel", "hud_bottom_bar")
	root.add_child(_interaction_board)

	var margin := _create_margin_container(_interaction_board, "InteractionMargin", 12, 10, 12, 10)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var vbox := _create_vbox(margin, "InteractionVBox", 6)
	vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var title := _create_label(vbox, "InteractionTitle", "交互覆盖板｜Warzone", 12)
	title.modulate = Color(0.95, 0.98, 1.0, 0.98)
	_interaction_state_label = _create_label(vbox, "InteractionState", "状态: -- | 可交互点: 0", 10)
	_interaction_counter_label = _create_label(vbox, "InteractionCounter", "交互计数: 0", 10)
	_interaction_last_label = _create_label(vbox, "InteractionLast", "最近操作: 待触发", 10)
	_interaction_grid = GridContainer.new()
	_interaction_grid.name = "InteractionGrid"
	_interaction_grid.columns = 4
	_interaction_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_interaction_grid.add_theme_constant_override("h_separation", 6)
	_interaction_grid.add_theme_constant_override("v_separation", 6)
	vbox.add_child(_interaction_grid)


func _sync_interaction_board(state: Dictionary) -> void:
	if _interaction_board == null or not is_instance_valid(_interaction_board):
		return
	var actions := _resolve_interaction_actions(state)
	_interaction_count = 0
	_interaction_state_label.text = "状态: %s | 可交互点: %d" % [str(state.get("label", get_active_state_label())), actions.size()]
	_interaction_counter_label.text = "交互计数: 0"
	_interaction_last_label.text = "最近操作: 待触发"
	_rebuild_interaction_buttons(actions)


func _resolve_interaction_actions(state: Dictionary) -> Array:
	var raw_actions: Variant = state.get("interactionActions", [])
	var actions: Array = []
	if raw_actions is Array:
		for action_variant in raw_actions:
			if action_variant is not Dictionary:
				continue
			var action_dict := action_variant as Dictionary
			var action_id := str(action_dict.get("id", "")).strip_edges()
			var action_label := str(action_dict.get("label", "")).strip_edges()
			if action_id == "" or action_label == "":
				continue
			actions.append({"id": action_id, "label": action_label})
	if actions.is_empty():
		return DEFAULT_INTERACTION_ACTIONS.duplicate(true)
	return actions


func _rebuild_interaction_buttons(actions: Array) -> void:
	if _interaction_grid == null or not is_instance_valid(_interaction_grid):
		return
	_clear_children(_interaction_grid)
	var index := 0
	for action_variant in actions:
		if action_variant is not Dictionary:
			continue
		var action_dict := action_variant as Dictionary
		var action_id := str(action_dict.get("id", "")).strip_edges()
		var action_label := str(action_dict.get("label", "")).strip_edges()
		if action_id == "" or action_label == "":
			continue
		var button := _create_button(_interaction_grid, "Interaction_%s" % action_id, action_label, 10, 0.0)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.custom_minimum_size = Vector2(0.0, 28.0)
		_apply_button_style(button, "refresh" if index % 2 == 0 else "advance_tick")
		button.pressed.connect(_on_interaction_button_pressed.bind(action_id, action_label))
		index += 1


func _on_interaction_button_pressed(action_id: String, action_label: String) -> void:
	if action_id == "go_nation":
		trigger_navigation_entry()
	_record_interaction(action_label)


func _record_interaction(action_label: String) -> void:
	_interaction_count += 1
	_interaction_counter_label.text = "交互计数: %d" % _interaction_count
	_interaction_last_label.text = "最近操作: %s" % action_label


func _clear_children(parent: Node) -> void:
	for child in parent.get_children():
		child.queue_free()


func _build_component_state(state: Dictionary) -> Dictionary:
	var component_state := state.duplicate(true)
	var story_navigation := _normalize_dictionary(component_state.get("storyNavigation", {}))
	if story_navigation.is_empty():
		story_navigation = _normalize_dictionary(_preview_payload.get("storyNavigation", {}))
	if not story_navigation.is_empty():
		component_state["storyNavigation"] = story_navigation
	var navigation_context := _normalize_dictionary(component_state.get("navigationContext", {}))
	if navigation_context.is_empty():
		navigation_context = _normalize_dictionary(_preview_payload.get("navigationContext", {}))
	if not navigation_context.is_empty():
		component_state["navigationContext"] = navigation_context
	var entry_context := _build_entry_context(component_state)
	if not entry_context.is_empty():
		component_state["entryContext"] = entry_context
	return component_state


func _connect_summary_signal() -> void:
	if _summary_panel == null:
		return
	if not _summary_panel.has_signal("entry_requested"):
		return
	var callback := Callable(self, "_on_summary_entry_requested")
	if _summary_panel.is_connected("entry_requested", callback):
		return
	_summary_panel.connect("entry_requested", callback)


func _on_summary_entry_requested(target_story_id: String, reason: String, request_payload: Dictionary) -> void:
	request_story_navigation(target_story_id, reason, request_payload)


func trigger_navigation_entry() -> void:
	var navigation_meta := _normalize_dictionary(_active_state.get("storyNavigation", {}))
	if navigation_meta.is_empty():
		navigation_meta = _normalize_dictionary(_preview_payload.get("storyNavigation", {}))
	var target_story_id := str(navigation_meta.get("targetStoryId", "")).strip_edges()
	if target_story_id == "":
		return
	var reason := str(navigation_meta.get("reason", "warzone_to_nation")).strip_edges()
	var request_payload := _build_navigation_request_payload(navigation_meta)
	request_story_navigation(target_story_id, reason, request_payload)


func _build_navigation_request_payload(navigation_meta: Dictionary) -> Dictionary:
	var request_payload: Dictionary = _normalize_dictionary(navigation_meta.get("requestPayload", {}))
	var entry_context := _build_entry_context(_active_state)
	for key_variant in entry_context.keys():
		var key := str(key_variant)
		if not request_payload.has(key):
			request_payload[key] = entry_context.get(key_variant)
	var target_story_id := str(navigation_meta.get("targetStoryId", "")).strip_edges()
	var target_state_id := str(navigation_meta.get("targetStateId", "")).strip_edges()
	var navigation_title := str(navigation_meta.get("title", "")).strip_edges()
	var button_label := str(navigation_meta.get("buttonLabel", "")).strip_edges()
	var button_hint := str(navigation_meta.get("buttonHint", "")).strip_edges()
	request_payload["entry"] = "warzone_layer_product_entry"
	request_payload["entryMode"] = "product_entry"
	request_payload["sourceStateId"] = str(_active_state.get("id", get_active_state_id())).strip_edges()
	request_payload["sourceLayer"] = "warzone"
	request_payload["sourceScreen"] = "warzone_layer_story"
	if target_story_id != "":
		request_payload["destinationStoryId"] = target_story_id
	request_payload["destinationLayer"] = "nation"
	request_payload["destinationScreen"] = "nation_layer_story"
	if target_state_id != "":
		request_payload["destinationStateId"] = target_state_id
	if navigation_title != "":
		request_payload["navigationTitle"] = navigation_title
	if button_label != "":
		request_payload["entryLabel"] = button_label
	if button_hint != "":
		request_payload["entryHint"] = button_hint
	request_payload["entrySource"] = "warzone_summary_panel"
	request_payload["flowStage"] = str(_active_state.get("id", "province_overview")).strip_edges()
	request_payload["flowRoute"] = "%s -> %s" % [
		str(_active_state.get("headline", "战区产品入口")).strip_edges(),
		navigation_title if navigation_title != "" else "国家层入口",
	]
	return request_payload


func _build_entry_context(state: Dictionary) -> Dictionary:
	var source_state := state if not state.is_empty() else {}
	var warzone_context := _normalize_dictionary(source_state.get("warzoneContext", {}))
	var context: Dictionary = {
		"layer": "warzone",
		"screen": "warzone_layer_story",
		"headline": str(source_state.get("headline", "")).strip_edges(),
		"entryStatus": str(source_state.get("entryStatus", "")).strip_edges(),
		"provinceSummary": str(source_state.get("provinceSummary", "")).strip_edges(),
	}
	for key_variant in warzone_context.keys():
		var key := str(key_variant)
		context[key] = warzone_context.get(key_variant)
	var navigation_meta := _normalize_dictionary(source_state.get("storyNavigation", {}))
	if not navigation_meta.is_empty():
		context["destinationStoryId"] = str(navigation_meta.get("targetStoryId", "")).strip_edges()
		context["destinationStateId"] = str(navigation_meta.get("targetStateId", "")).strip_edges()
		context["navigationTitle"] = str(navigation_meta.get("title", "")).strip_edges()
	return context
