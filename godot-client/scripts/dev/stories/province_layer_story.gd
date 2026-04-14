@tool
extends "res://scripts/dev/stories/map_preview_story_base.gd"
class_name ProvinceLayerStory

const PAYLOAD_DEFAULT_PATH := "res://data/ui_preview/stories/province_layer_story.json"
const SUMMARY_PANEL_SCENE := preload("res://scenes/dev/components/province_layer_summary_panel.tscn")
const ROSTER_PANEL_SCENE := preload("res://scenes/dev/components/province_layer_roster_panel.tscn")
const FOCUS_PANEL_SCENE := preload("res://scenes/dev/components/province_layer_focus_panel.tscn")
const PROVINCE_NAME_MAP := {
	"You": "幽州",
	"Ji": "冀州",
	"Qing": "青州",
	"Xu": "徐州",
	"Bing": "并州",
	"Si Li": "司隶",
	"Yu": "豫州",
	"Yan": "兖州",
	"Jing": "荆州",
	"Liang": "凉州",
	"Yang": "扬州",
	"Yi": "益州",
	"Jiao": "交州",
}
const CITY_NAME_MAP := {
	"Juyong": "居庸",
	"Jicheng": "蓟城",
	"Linzi": "临淄",
	"Pengcheng": "彭城",
	"Jinyang": "晋阳",
	"Luoyang": "洛阳",
	"Yingchuan": "颍川",
	"Chenliu": "陈留",
	"Xiangyang": "襄阳",
	"Tianshui": "天水",
	"Shouchun": "寿春",
	"Chengdu": "成都",
	"Panyu": "番禺",
}
const GATE_NAME_MAP := {
	"Juyong Pass": "居庸关",
	"Pingyuan Gate": "平原关",
	"Qi Gate": "齐关",
	"Si River Gate": "泗水关",
	"Taihang Pass": "太行关",
	"Hangu Gate": "函谷关",
	"Huai Gate": "淮关",
	"Yanling Pass": "兖陵关",
	"Xiangyang Gate": "襄阳关",
	"Tong Pass": "潼关",
	"Hefei Gate": "合肥关",
	"Jianmen Pass": "剑门关",
	"Nanhai Gate": "南海关",
}
const DEFAULT_INTERACTION_ACTIONS := [
	{"id": "focus_city", "label": "聚焦州府"},
	{"id": "focus_gate", "label": "聚焦关口"},
	{"id": "read_roster", "label": "州府名册"},
	{"id": "read_garrison", "label": "驻军读板"},
	{"id": "read_yield", "label": "产出读板"},
	{"id": "read_durable", "label": "耐久读板"},
	{"id": "monitor_border", "label": "边界压强"},
	{"id": "monitor_supply", "label": "补给观察"},
	{"id": "preview_route", "label": "路径预览"},
	{"id": "risk_scan", "label": "风险巡检"},
	{"id": "sync_command", "label": "指令同步"},
	{"id": "go_warzone", "label": "进入战区"},
]
const INTERACTION_ACCENT_COLOR := Color(0.92, 0.74, 0.44, 0.96)
const INTERACTION_TITLE_COLOR := Color(0.96, 0.98, 1.0, 0.98)
const INTERACTION_META_COLOR := Color(0.88, 0.93, 0.99, 0.95)
const INTERACTION_HINT_COLOR := Color(0.82, 0.89, 0.96, 0.93)

var _summary_host: Control
var _roster_host: Control
var _focus_host: Control

var _summary_panel: Control
var _roster_panel: Control
var _focus_panel: Control
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

	_summary_host = _create_host(root, "ProvinceSummaryPanel")
	_summary_host.anchor_left = 0.0
	_summary_host.anchor_top = 0.0
	_summary_host.anchor_right = 0.0
	_summary_host.anchor_bottom = 0.0
	_summary_host.offset_left = 22.0
	_summary_host.offset_top = 20.0
	_summary_host.offset_right = 398.0
	_summary_host.offset_bottom = 300.0
	_summary_panel = _mount_component(_summary_host, SUMMARY_PANEL_SCENE, "ProvinceLayerSummaryPanel")

	_roster_host = _create_host(root, "ProvinceRosterPanel")
	_roster_host.anchor_left = 1.0
	_roster_host.anchor_top = 0.0
	_roster_host.anchor_right = 1.0
	_roster_host.anchor_bottom = 0.0
	_roster_host.offset_left = -418.0
	_roster_host.offset_top = 20.0
	_roster_host.offset_right = -22.0
	_roster_host.offset_bottom = 300.0
	_roster_panel = _mount_component(_roster_host, ROSTER_PANEL_SCENE, "ProvinceLayerRosterPanel")

	_focus_host = _create_host(root, "ProvinceFocusPanel")
	_focus_host.anchor_left = 0.5
	_focus_host.anchor_top = 1.0
	_focus_host.anchor_right = 0.5
	_focus_host.anchor_bottom = 1.0
	_focus_host.offset_left = -476.0
	_focus_host.offset_top = -424.0
	_focus_host.offset_right = 476.0
	_focus_host.offset_bottom = -24.0
	_focus_panel = _mount_component(_focus_host, FOCUS_PANEL_SCENE, "ProvinceLayerFocusPanel")
	_connect_focus_signal()
	_build_interaction_board(root)

	set_presentation_capture_mode(true)


func _build_story_fixture_bundle(state: Dictionary) -> Dictionary:
	var width := 50
	var height := 24
	var tile_index := _build_tile_index(width, height, "Thirteen Province Layer")
	var province_specs := _get_province_specs()
	var loaded_province_ids: Array = []
	var factions: Array = []

	for province_variant in province_specs:
		if not (province_variant is Dictionary):
			continue
		var province: Dictionary = province_variant as Dictionary
		loaded_province_ids.append(str(province.get("id", "")))
		_paint_province(tile_index, province)
		var city_id := str(province.get("cityId", "")).strip_edges()
		var faction_id := str(province.get("factionId", "")).strip_edges()
		factions.append(
			{
				"id": faction_id,
				"name": str(province.get("factionName", province.get("name", faction_id))),
				"homeTileId": city_id,
				"heroCommand": {
					"homeTileId": city_id
				}
			}
		)

	var tiles := _finalize_tiles(tile_index)
	return {
		"mapLayout": _make_map_layout_payload(width, height, tiles, str(state.get("scope", "fixture-province-layer")), loaded_province_ids),
		"world": _make_world_payload(width, height, tiles, factions, [], int(state.get("tick", 4096)), int(state.get("worldVersion", 96))),
		"focus": {
			"zoom": float(state.get("zoom", 0.36)),
			"hoverTileId": str(state.get("hoverTileId", "city_luoyang")),
			"hoverX": int(state.get("hoverX", 12)),
			"hoverY": int(state.get("hoverY", 10))
		}
	}


func _apply_story_state(state: Dictionary) -> void:
	var component_state := _build_component_state(state)
	_apply_component_state(_summary_panel, component_state)
	_apply_component_state(_roster_panel, component_state)
	_apply_component_state(_focus_panel, component_state)
	_sync_interaction_board(state)


func _create_host(parent: Node, node_name: String) -> Control:
	var host := Control.new()
	host.name = node_name
	host.clip_contents = false
	parent.add_child(host)
	return host


func _mount_component(host: Control, packed_scene: PackedScene, child_name: String) -> Control:
	var instance := packed_scene.instantiate() as Control
	instance.name = child_name
	instance.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	host.add_child(instance)
	return instance


func _apply_component_state(component: Control, state: Dictionary) -> void:
	if component != null and component.has_method("apply_preview_state"):
		component.call("apply_preview_state", state)


func _build_interaction_board(root: Control) -> void:
	if _interaction_board != null and is_instance_valid(_interaction_board):
		return
	_interaction_board = PanelContainer.new()
	_interaction_board.name = "ProvinceInteractionBoard"
	_interaction_board.anchor_left = 0.0
	_interaction_board.anchor_top = 1.0
	_interaction_board.anchor_right = 0.0
	_interaction_board.anchor_bottom = 1.0
	_interaction_board.offset_left = 22.0
	_interaction_board.offset_top = -224.0
	_interaction_board.offset_right = 548.0
	_interaction_board.offset_bottom = -24.0
	_apply_panel_style(_interaction_board, "panel", "hud_bottom_bar")
	root.add_child(_interaction_board)

	var margin := _create_margin_container(_interaction_board, "InteractionMargin", 14, 12, 14, 12)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var vbox := _create_vbox(margin, "InteractionVBox", 8)
	vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var title := _create_label(vbox, "InteractionTitle", "交互覆盖板｜Province", 13)
	title.modulate = INTERACTION_TITLE_COLOR
	var accent_bar := ColorRect.new()
	accent_bar.name = "InteractionAccentBar"
	accent_bar.custom_minimum_size = Vector2(0.0, 3.0)
	accent_bar.color = INTERACTION_ACCENT_COLOR
	vbox.add_child(accent_bar)
	_interaction_state_label = _create_label(vbox, "InteractionState", "状态: -- | 可交互点: 0", 11)
	_interaction_state_label.modulate = INTERACTION_META_COLOR
	_interaction_counter_label = _create_label(vbox, "InteractionCounter", "交互计数: 0", 11)
	_interaction_counter_label.modulate = INTERACTION_META_COLOR
	_interaction_last_label = _create_label(vbox, "InteractionLast", "最近操作: 待触发", 11)
	_interaction_last_label.modulate = INTERACTION_HINT_COLOR
	_interaction_grid = GridContainer.new()
	_interaction_grid.name = "InteractionGrid"
	_interaction_grid.columns = 4
	_interaction_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_interaction_grid.add_theme_constant_override("h_separation", 8)
	_interaction_grid.add_theme_constant_override("v_separation", 8)
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
		var button := _create_button(_interaction_grid, "Interaction_%s" % action_id, action_label, 11, 0.0)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.custom_minimum_size = Vector2(0.0, 30.0)
		_apply_button_style(button, "refresh" if index % 2 == 0 else "advance_tick")
		button.modulate = INTERACTION_ACCENT_COLOR.lightened(0.08 if index % 2 == 0 else 0.02)
		button.pressed.connect(_on_interaction_button_pressed.bind(action_id, action_label))
		index += 1


func _on_interaction_button_pressed(action_id: String, action_label: String) -> void:
	if action_id == "go_warzone":
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


func _connect_focus_signal() -> void:
	if _focus_panel == null:
		return
	if not _focus_panel.has_signal("entry_requested"):
		return
	var callback := Callable(self, "_on_focus_entry_requested")
	if _focus_panel.is_connected("entry_requested", callback):
		return
	_focus_panel.connect("entry_requested", callback)


func _on_focus_entry_requested(target_story_id: String, reason: String, request_payload: Dictionary) -> void:
	request_story_navigation(target_story_id, reason, request_payload)


func trigger_navigation_entry() -> void:
	var navigation_meta := _normalize_dictionary(_active_state.get("storyNavigation", {}))
	if navigation_meta.is_empty():
		navigation_meta = _normalize_dictionary(_preview_payload.get("storyNavigation", {}))
	var target_story_id := str(navigation_meta.get("targetStoryId", "")).strip_edges()
	if target_story_id == "":
		return
	var reason := str(navigation_meta.get("reason", "province_to_warzone")).strip_edges()
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
	var focus_name := _resolve_focus_province(_active_state.get("focusProvinceName", ""))
	var focus_gate := _resolve_gate_name(str(_active_state.get("focusGateName", "")).strip_edges())
	var zoom := float(_active_state.get("zoom", 0.0))
	var hover_tile_id := str(_active_state.get("hoverTileId", "")).strip_edges()
	request_payload["entry"] = "province_layer_product_entry"
	request_payload["entryMode"] = "product_entry"
	request_payload["sourceStateId"] = str(_active_state.get("id", ""))
	request_payload["sourceLayer"] = "province"
	request_payload["sourceScreen"] = "province_layer_story"
	request_payload["sourceProvinceName"] = focus_name
	request_payload["sourceGateName"] = focus_gate
	request_payload["sourceZoom"] = zoom
	request_payload["sourceHoverTileId"] = hover_tile_id
	if target_story_id != "":
		request_payload["destinationStoryId"] = target_story_id
	request_payload["destinationLayer"] = "warzone"
	request_payload["destinationScreen"] = "warzone_layer_story"
	if target_state_id != "":
		request_payload["destinationStateId"] = target_state_id
	if navigation_title != "":
		request_payload["navigationTitle"] = navigation_title
	if button_label != "":
		request_payload["entryLabel"] = button_label
	if button_hint != "":
		request_payload["entryHint"] = button_hint
	request_payload["entrySource"] = "province_focus_panel"
	request_payload["flowStage"] = str(_active_state.get("id", "overview"))
	request_payload["flowRoute"] = "%s → %s" % [focus_name, navigation_title if navigation_title != "" else "战区摘要"]
	return request_payload


func _build_entry_context(state: Dictionary) -> Dictionary:
	var source_state := state
	if source_state.is_empty():
		source_state = {}
	var province_context := _normalize_dictionary(source_state.get("provinceContext", {}))
	var focus_name := _resolve_focus_province(source_state.get("focusProvinceName", ""))
	var focus_gate := _resolve_gate_name(str(source_state.get("focusGateName", "")).strip_edges())
	var hover_tile_id := str(source_state.get("hoverTileId", "")).strip_edges()
	var zoom := float(source_state.get("zoom", 0.0))
	var context: Dictionary = {
		"layer": "province",
		"screen": "province_layer_story",
		"focusProvinceName": focus_name,
		"focusGateName": focus_gate,
		"hoverTileId": hover_tile_id,
		"zoom": zoom,
		"headline": str(source_state.get("headline", "")).strip_edges(),
	}
	for key_variant in province_context.keys():
		var key := str(key_variant)
		context[key] = province_context.get(key_variant)
	var navigation_meta := _normalize_dictionary(source_state.get("storyNavigation", {}))
	if not navigation_meta.is_empty():
		context["destinationStoryId"] = str(navigation_meta.get("targetStoryId", "")).strip_edges()
		context["destinationStateId"] = str(navigation_meta.get("targetStateId", "")).strip_edges()
		context["navigationTitle"] = str(navigation_meta.get("title", "")).strip_edges()
	return context


func _resolve_focus_province(value: Variant) -> String:
	var raw := str(value).strip_edges()
	if raw.find("/") == -1:
		return _resolve_province_name(raw)
	var parts := raw.split("/")
	if parts.size() < 2:
		return _resolve_province_name(raw)
	var city_name := _resolve_city_name(parts[0].strip_edges())
	var province_name := _resolve_province_name(parts[1].strip_edges())
	return "%s·%s" % [province_name, city_name]


func _resolve_province_name(name: String) -> String:
	return str(PROVINCE_NAME_MAP.get(name.strip_edges(), name.strip_edges()))


func _resolve_city_name(name: String) -> String:
	return str(CITY_NAME_MAP.get(name.strip_edges(), name.strip_edges()))


func _resolve_gate_name(name: String) -> String:
	return str(GATE_NAME_MAP.get(name.strip_edges(), name.strip_edges()))


func _get_province_specs() -> Array:
	return [
		{
			"id": "you_zhou",
			"name": "You",
			"capital": "Juyong",
			"gate": "Juyong Pass",
			"factionId": "faction_you",
			"factionName": "You Province Watch",
			"cityId": "city_you",
			"cityLevel": 4,
			"district": "You Province",
			"region": Rect2i(0, 0, 9, 6),
			"city": Vector2i(4, 2),
			"gatePoint": Vector2i(8, 3),
		},
		{
			"id": "ji_zhou",
			"name": "Ji",
			"capital": "Jicheng",
			"gate": "Pingyuan Gate",
			"factionId": "faction_ji",
			"factionName": "Ji Province Watch",
			"cityId": "city_ji",
			"cityLevel": 5,
			"district": "Ji Province",
			"region": Rect2i(11, 0, 9, 6),
			"city": Vector2i(15, 2),
			"gatePoint": Vector2i(11, 3),
		},
		{
			"id": "qing_zhou",
			"name": "Qing",
			"capital": "Linzi",
			"gate": "Qi Gate",
			"factionId": "faction_qing",
			"factionName": "Qing Province Watch",
			"cityId": "city_qing",
			"cityLevel": 4,
			"district": "Qing Province",
			"region": Rect2i(22, 0, 9, 6),
			"city": Vector2i(26, 2),
			"gatePoint": Vector2i(22, 3),
		},
		{
			"id": "xu_zhou",
			"name": "Xu",
			"capital": "Pengcheng",
			"gate": "Si River Gate",
			"factionId": "faction_xu",
			"factionName": "Xu Province Watch",
			"cityId": "city_xu",
			"cityLevel": 5,
			"district": "Xu Province",
			"region": Rect2i(33, 0, 9, 6),
			"city": Vector2i(37, 2),
			"gatePoint": Vector2i(33, 3),
		},
		{
			"id": "bing_zhou",
			"name": "Bing",
			"capital": "Jinyang",
			"gate": "Taihang Pass",
			"factionId": "faction_bing",
			"factionName": "Bing Province Watch",
			"cityId": "city_bing",
			"cityLevel": 5,
			"district": "Bing Province",
			"region": Rect2i(0, 9, 9, 6),
			"city": Vector2i(4, 11),
			"gatePoint": Vector2i(8, 9),
		},
		{
			"id": "si_li",
			"name": "Si Li",
			"capital": "Luoyang",
			"gate": "Hangu Gate",
			"factionId": "player",
			"factionName": "Han Core",
			"cityId": "city_luoyang",
			"cityLevel": 6,
			"district": "Si Li Center",
			"region": Rect2i(11, 8, 9, 8),
			"city": Vector2i(15, 11),
			"gatePoint": Vector2i(20, 10),
		},
		{
			"id": "yu_zhou",
			"name": "Yu",
			"capital": "Yingchuan",
			"gate": "Huai Gate",
			"factionId": "faction_yu",
			"factionName": "Yu Province Watch",
			"cityId": "city_yu",
			"cityLevel": 4,
			"district": "Yu Province",
			"region": Rect2i(22, 8, 9, 8),
			"city": Vector2i(26, 11),
			"gatePoint": Vector2i(22, 10),
		},
		{
			"id": "yan_zhou",
			"name": "Yan",
			"capital": "Chenliu",
			"gate": "Yanling Pass",
			"factionId": "faction_yan",
			"factionName": "Yan Province Watch",
			"cityId": "city_yan",
			"cityLevel": 4,
			"district": "Yan Province",
			"region": Rect2i(33, 8, 9, 8),
			"city": Vector2i(37, 11),
			"gatePoint": Vector2i(33, 10),
		},
		{
			"id": "jing_zhou",
			"name": "Jing",
			"capital": "Xiangyang",
			"gate": "Xiangyang Gate",
			"factionId": "faction_jing",
			"factionName": "Jing Province Watch",
			"cityId": "city_jing",
			"cityLevel": 5,
			"district": "Jing Province",
			"region": Rect2i(44, 8, 6, 8),
			"city": Vector2i(46, 11),
			"gatePoint": Vector2i(44, 10),
		},
		{
			"id": "liang_zhou",
			"name": "Liang",
			"capital": "Tianshui",
			"gate": "Tong Pass",
			"factionId": "faction_liang",
			"factionName": "Liang Province Watch",
			"cityId": "city_liang",
			"cityLevel": 5,
			"district": "Liang Province",
			"region": Rect2i(0, 17, 11, 6),
			"city": Vector2i(4, 19),
			"gatePoint": Vector2i(10, 17),
		},
		{
			"id": "yang_zhou",
			"name": "Yang",
			"capital": "Shouchun",
			"gate": "Hefei Gate",
			"factionId": "faction_yang",
			"factionName": "Yang Province Watch",
			"cityId": "city_yang",
			"cityLevel": 4,
			"district": "Yang Province",
			"region": Rect2i(13, 17, 10, 6),
			"city": Vector2i(17, 19),
			"gatePoint": Vector2i(22, 17),
		},
		{
			"id": "yi_zhou",
			"name": "Yi",
			"capital": "Chengdu",
			"gate": "Jianmen Pass",
			"factionId": "faction_yi",
			"factionName": "Yi Province Watch",
			"cityId": "city_yi",
			"cityLevel": 5,
			"district": "Yi Province",
			"region": Rect2i(25, 17, 10, 6),
			"city": Vector2i(29, 19),
			"gatePoint": Vector2i(25, 17),
		},
		{
			"id": "jiao_zhou",
			"name": "Jiao",
			"capital": "Panyu",
			"gate": "Nanhai Gate",
			"factionId": "faction_jiao",
			"factionName": "Jiao Province Watch",
			"cityId": "city_jiao",
			"cityLevel": 4,
			"district": "Jiao Province",
			"region": Rect2i(37, 17, 13, 6),
			"city": Vector2i(43, 19),
			"gatePoint": Vector2i(37, 17),
		},
	]


func _paint_province(tile_index: Dictionary, province: Dictionary) -> void:
	var province_name := str(province.get("name", "")).strip_edges()
	var district := str(province.get("district", province_name)).strip_edges()
	var region: Rect2i = province.get("region", Rect2i()) as Rect2i
	var interior_terrain := _province_terrain_for(province_name)
	var border_terrain := _province_border_terrain_for(province_name)
	var gate_point: Vector2i = province.get("gatePoint", Vector2i(-1, -1)) as Vector2i
	var city_point: Vector2i = province.get("city", Vector2i(-1, -1)) as Vector2i
	var city_id := str(province.get("cityId", "")).strip_edges()
	var faction_id := str(province.get("factionId", "")).strip_edges()
	var city_level := int(province.get("cityLevel", 4))

	if region.size.x > 2 and region.size.y > 2:
		_fill_rect(tile_index, region.position.x + 1, region.position.y + 1, region.position.x + region.size.x - 2, region.position.y + region.size.y - 2, {"terrain": interior_terrain, "district": district})
		_fill_rect(tile_index, region.position.x, region.position.y, region.position.x + region.size.x - 1, region.position.y, {"terrain": border_terrain, "district": district})
		_fill_rect(tile_index, region.position.x, region.position.y + region.size.y - 1, region.position.x + region.size.x - 1, region.position.y + region.size.y - 1, {"terrain": border_terrain, "district": district})
		_fill_rect(tile_index, region.position.x, region.position.y, region.position.x, region.position.y + region.size.y - 1, {"terrain": border_terrain, "district": district})
		_fill_rect(tile_index, region.position.x + region.size.x - 1, region.position.y, region.position.x + region.size.x - 1, region.position.y + region.size.y - 1, {"terrain": border_terrain, "district": district})
	else:
		_fill_rect(tile_index, region.position.x, region.position.y, region.position.x + region.size.x - 1, region.position.y + region.size.y - 1, {"terrain": interior_terrain, "district": district})

	if gate_point.x >= 0 and gate_point.y >= 0:
		_set_tile(tile_index, gate_point.x, gate_point.y, {
			"id": "gate_%s" % str(province.get("id", district)).strip_edges(),
			"type": "land",
			"terrain": border_terrain,
			"district": "%s Gate" % district,
			"provinceId": str(province.get("id", "")),
			"gateName": str(province.get("gate", "")),
		})

	if city_point.x >= 0 and city_point.y >= 0 and city_id != "":
		_set_tile(tile_index, city_point.x, city_point.y, {
			"id": city_id,
			"type": "city",
			"owner": faction_id,
			"cityLevel": city_level,
			"district": district,
			"provinceId": str(province.get("id", "")),
			"capitalName": str(province.get("capital", "")),
		})


func _province_terrain_for(province_name: String) -> String:
	match province_name:
		"Si Li":
			return "plain"
		"Ji":
			return "grassland"
		"Qing":
			return "riverland"
		"Xu":
			return "plain"
		"Bing":
			return "mountain"
		"Yu":
			return "riverland"
		"Yan":
			return "forest"
		"Jing":
			return "mountain"
		"Liang":
			return "mountain"
		"Yang":
			return "grassland"
		"Yi":
			return "forest"
		"Jiao":
			return "sand"
		"You":
			return "forest"
		_:
			return "plain"


func _province_border_terrain_for(province_name: String) -> String:
	match province_name:
		"Si Li":
			return "riverland"
		"Ji":
			return "mountain"
		"Qing":
			return "riverland"
		"Xu":
			return "mountain"
		"Bing":
			return "mountain"
		"Yu":
			return "riverland"
		"Yan":
			return "mountain"
		"Jing":
			return "mountain"
		"Liang":
			return "mountain"
		"Yang":
			return "riverland"
		"Yi":
			return "mountain"
		"Jiao":
			return "sand"
		"You":
			return "mountain"
		_:
			return "plain"
