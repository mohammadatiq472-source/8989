@tool
extends "res://scripts/dev/stories/map_preview_story_base.gd"
class_name MapSurfaceStory

const PAYLOAD_DEFAULT_PATH := "res://data/ui_preview/stories/map_surface_story.json"
const TOP_STRIP_SCENE := preload("res://scenes/dev/components/map_surface_top_strip.tscn")
const COMMAND_DOCK_SCENE := preload("res://scenes/dev/components/map_surface_command_dock.tscn")
const RIGHT_INFO_STACK_SCENE := preload("res://scenes/dev/components/map_surface_right_info_stack.tscn")
const ACTION_DOCK_SCENE := preload("res://scenes/dev/components/map_surface_action_dock.tscn")

var _top_strip_host: Control
var _command_dock_host: Control
var _right_info_host: Control
var _action_dock_host: Control
var _province_entry_host: Control
var _ai_player_panel_host: Control
var _mini_map_panel_host: Control
var _feedback_host: Control

var _top_strip: Control
var _command_dock: Control
var _right_info_stack: Control
var _action_dock: Control
var _province_entry_panel: PanelContainer
var _province_entry_title: Label
var _province_entry_hint: Label
var _province_entry_meta: Label
var _province_entry_button: Button
var _ai_player_panel: PanelContainer
var _ai_panel_title: Label
var _ai_panel_status_chip: Label
var _ai_panel_name: Label
var _ai_panel_summary: Label
var _ai_panel_strategy: Label
var _ai_panel_status: Label
var _ai_panel_target: Label
var _ai_panel_recent: Label
var _ai_panel_footer: Label
var _ai_panel_actions_row: HBoxContainer
var _ai_panel_back_button: Button
var _ai_panel_close_button: Button
var _mini_map_panel: PanelContainer
var _mini_map_title: Label
var _mini_map_scope: Label
var _mini_map_focus: Label
var _mini_map_zoom: Label
var _mini_map_hint: Label
var _mini_map_back_button: Button
var _mini_map_close_button: Button
var _mini_map_province_button: Button
var _feedback_panel: PanelContainer
var _feedback_label: Label
var _feedback_close_button: Button
var _ai_player_panel_open: bool = false
var _ai_player_panel_state: Dictionary = {}
var _ai_command_feedback_active: bool = false
var _mini_map_panel_open: bool = false
var _hover_focus_tile_key: String = ""
var _hover_focus_tile: Dictionary = {}


func _resolve_default_payload_path() -> String:
	return PAYLOAD_DEFAULT_PATH


func _build_story_shell() -> void:
	var root := get_story_content_root()
	var viewport := get_viewport()
	if viewport != null:
		var resize_callback := Callable(self, "_layout_surface_hosts")
		if not viewport.size_changed.is_connected(resize_callback):
			viewport.size_changed.connect(resize_callback)

	_top_strip_host = _create_host(root, "SurfaceTopBar")
	_top_strip = _mount_component(_top_strip_host, TOP_STRIP_SCENE, "TopStripComponent")

	_command_dock_host = _create_host(root, "SurfaceLeftRail")
	_command_dock = _mount_component(_command_dock_host, COMMAND_DOCK_SCENE, "CommandDockComponent")
	if _command_dock != null and _command_dock.has_signal("command_navigation_requested"):
		var command_nav_callback := Callable(self, "_on_command_dock_navigation_requested")
		if not _command_dock.is_connected("command_navigation_requested", command_nav_callback):
			_command_dock.connect("command_navigation_requested", command_nav_callback)

	_right_info_host = _create_host(root, "SurfaceRightActionPanel")
	_right_info_stack = _mount_component(_right_info_host, RIGHT_INFO_STACK_SCENE, "RightInfoStackComponent")
	if _right_info_stack != null and _right_info_stack.has_signal("ai_player_panel_requested"):
		var ai_panel_callback := Callable(self, "_on_ai_player_panel_requested")
		if not _right_info_stack.is_connected("ai_player_panel_requested", ai_panel_callback):
			_right_info_stack.connect("ai_player_panel_requested", ai_panel_callback)
	if _right_info_stack != null and _right_info_stack.has_signal("ai_player_panel_changed"):
		var ai_changed_callback := Callable(self, "_on_ai_player_panel_changed")
		if not _right_info_stack.is_connected("ai_player_panel_changed", ai_changed_callback):
			_right_info_stack.connect("ai_player_panel_changed", ai_changed_callback)

	_action_dock_host = _create_host(root, "SurfaceBottomBar")
	_action_dock = _mount_component(_action_dock_host, ACTION_DOCK_SCENE, "ActionDockComponent")
	if _action_dock != null and _action_dock.has_signal("action_requested"):
		var action_callback := Callable(self, "_on_action_dock_action_requested")
		if not _action_dock.is_connected("action_requested", action_callback):
			_action_dock.connect("action_requested", action_callback)
	_build_province_entry_panel(root)
	_build_ai_player_panel(root)
	_build_mini_map_panel(root)
	_build_feedback_panel(root)
	_layout_surface_hosts()
	set_presentation_capture_mode(true)
	set_process(true)


func _build_story_fixture_bundle(state: Dictionary) -> Dictionary:
	var width := 12
	var height := 8
	var tile_index := _build_tile_index(width, height, str(state.get("districtName", "Si Li")))
	_fill_rect(tile_index, 0, 5, 11, 7, {"terrain": "grassland"})
	_fill_rect(tile_index, 3, 0, 4, 7, {"terrain": "mountain"})
	_fill_rect(tile_index, 8, 1, 9, 6, {"terrain": "river"})
	_set_tile(tile_index, 5, 3, {"id": "city_luoyang", "type": "city", "owner": "player", "cityLevel": 6, "district": "Luoyang"})
	_set_tile(tile_index, 7, 2, {"id": "city_hulao", "type": "city", "owner": "ally_north", "cityLevel": 4, "district": "Hulao"})
	_set_tile(tile_index, 2, 6, {"id": "res_wood_01", "type": "resource", "terrain": "forest", "resourceKind": "wood", "resourceLevel": 4})
	_set_tile(tile_index, 10, 5, {"id": "res_iron_01", "type": "resource", "terrain": "hill", "resourceKind": "iron", "resourceLevel": 3})
	_set_tile(tile_index, 1, 2, {"id": "res_stone_01", "type": "resource", "terrain": "sand", "resourceKind": "stone", "resourceLevel": 2})
	_set_tile(tile_index, 6, 6, {"id": "res_grain_01", "type": "resource", "terrain": "grassland", "resourceKind": "grain", "resourceLevel": 5})
	var tiles := _finalize_tiles(tile_index)
	var factions := [
		{"id": "player", "name": "Han Vanguard", "homeTileId": "city_luoyang", "heroCommand": {"homeTileId": "city_luoyang"}},
		{"id": "ally_north", "name": "Northern Shield", "homeTileId": "city_hulao", "heroCommand": {"homeTileId": "city_hulao"}}
	]
	return {
		"mapLayout": _make_map_layout_payload(width, height, tiles, str(state.get("scope", "preview_surface")), ["si_li"]),
		"world": _make_world_payload(width, height, tiles, factions, [], int(state.get("tick", 1024)), int(state.get("worldVersion", 48))),
		"focus": {
			"zoom": float(state.get("zoom", 0.44)),
			"hoverTileId": str(state.get("hoverTileId", "city_luoyang")),
			"hoverX": int(state.get("hoverX", 5)),
			"hoverY": int(state.get("hoverY", 3))
		}
	}


func _apply_story_state(state: Dictionary) -> void:
	_apply_component_state(_top_strip, state)
	_apply_component_state(_command_dock, state)
	_apply_component_state(_right_info_stack, state)
	_apply_component_state(_action_dock, state)
	_sync_hover_focus_from_grid()
	_sync_province_entry_panel(state)
	_sync_ai_player_panel(state)
	_sync_mini_map_panel(state)


func set_presentation_capture_mode(enabled: bool) -> void:
	super.set_presentation_capture_mode(enabled)
	_sync_province_entry_visibility()


func _layout_surface_hosts() -> void:
	var viewport: Viewport = get_viewport()
	if viewport == null:
		return
	var size: Vector2 = viewport.get_visible_rect().size
	var side_margin: float = 18.0
	var top_width: float = clamp(size.x * 0.58, 640.0, 980.0)
	var command_width: float = clamp(size.x * 0.21, 224.0, 272.0)
	var command_height: float = clamp(size.y * 0.56, 338.0, 452.0)
	var right_width: float = clamp(size.x * 0.22, 236.0, 296.0)
	var right_height: float = clamp(size.y * 0.40, 286.0, 374.0)
	var action_width: float = clamp(size.x * 0.44, 420.0, 620.0)
	var province_width: float = clamp(size.x * 0.22, 248.0, 286.0)
	var overlay_width: float = clamp(size.x * 0.28, 300.0, 364.0)
	var overlay_height: float = clamp(size.y * 0.30, 214.0, 248.0)
	if _top_strip_host != null:
		_top_strip_host.anchor_left = 0.5
		_top_strip_host.anchor_top = 0.0
		_top_strip_host.anchor_right = 0.5
		_top_strip_host.anchor_bottom = 0.0
		_top_strip_host.offset_left = -top_width * 0.5
		_top_strip_host.offset_top = 10.0
		_top_strip_host.offset_right = top_width * 0.5
		_top_strip_host.offset_bottom = 86.0
	if _command_dock_host != null:
		_command_dock_host.anchor_left = 0.0
		_command_dock_host.anchor_top = 0.0
		_command_dock_host.anchor_right = 0.0
		_command_dock_host.anchor_bottom = 0.0
		_command_dock_host.offset_left = side_margin
		_command_dock_host.offset_top = 96.0
		_command_dock_host.offset_right = side_margin + command_width
		_command_dock_host.offset_bottom = 96.0 + command_height
	if _right_info_host != null:
		_right_info_host.anchor_left = 1.0
		_right_info_host.anchor_top = 0.0
		_right_info_host.anchor_right = 1.0
		_right_info_host.anchor_bottom = 0.0
		_right_info_host.offset_left = -(right_width + side_margin)
		_right_info_host.offset_top = 120.0
		_right_info_host.offset_right = -side_margin
		_right_info_host.offset_bottom = 120.0 + right_height
	if _action_dock_host != null:
		_action_dock_host.anchor_left = 0.5
		_action_dock_host.anchor_top = 1.0
		_action_dock_host.anchor_right = 0.5
		_action_dock_host.anchor_bottom = 1.0
		_action_dock_host.offset_left = -action_width * 0.5
		_action_dock_host.offset_top = -106.0
		_action_dock_host.offset_right = action_width * 0.5
		_action_dock_host.offset_bottom = -16.0
	if _province_entry_host != null:
		_province_entry_host.anchor_left = 0.5
		_province_entry_host.anchor_top = 1.0
		_province_entry_host.anchor_right = 0.5
		_province_entry_host.anchor_bottom = 1.0
		_province_entry_host.offset_left = -(action_width * 0.5) - province_width - 18.0
		_province_entry_host.offset_top = -120.0
		_province_entry_host.offset_right = -(action_width * 0.5) - 18.0
		_province_entry_host.offset_bottom = -18.0
	if _ai_player_panel_host != null:
		_ai_player_panel_host.anchor_left = 0.5
		_ai_player_panel_host.anchor_top = 0.5
		_ai_player_panel_host.anchor_right = 0.5
		_ai_player_panel_host.anchor_bottom = 0.5
		_ai_player_panel_host.offset_left = -overlay_width * 0.5
		_ai_player_panel_host.offset_top = -overlay_height * 0.60
		_ai_player_panel_host.offset_right = overlay_width * 0.5
		_ai_player_panel_host.offset_bottom = overlay_height * 0.40
	if _mini_map_panel_host != null:
		_mini_map_panel_host.anchor_left = 0.5
		_mini_map_panel_host.anchor_top = 0.5
		_mini_map_panel_host.anchor_right = 0.5
		_mini_map_panel_host.anchor_bottom = 0.5
		_mini_map_panel_host.offset_left = -overlay_width * 0.5
		_mini_map_panel_host.offset_top = -overlay_height * 0.55
		_mini_map_panel_host.offset_right = overlay_width * 0.5
		_mini_map_panel_host.offset_bottom = overlay_height * 0.45
	if _feedback_host != null:
		_feedback_host.anchor_left = 0.5
		_feedback_host.anchor_top = 1.0
		_feedback_host.anchor_right = 0.5
		_feedback_host.anchor_bottom = 1.0
		_feedback_host.offset_left = -240.0
		_feedback_host.offset_top = -156.0
		_feedback_host.offset_right = 240.0
		_feedback_host.offset_bottom = -114.0


func _build_ai_player_panel(parent: Control) -> void:
	_ai_player_panel_host = _create_host(parent, "AiPlayerPanelHost")
	_ai_player_panel_host.visible = false

	_ai_player_panel = _create_panel(_ai_player_panel_host, "AiPlayerPanel")
	_ai_player_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_apply_panel_style(_ai_player_panel, "panel", "hud_top_left")
	var panel_margin := _create_margin_container(_ai_player_panel, "AiPlayerPanelMargin", 16, 14, 16, 14)
	panel_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var panel_vbox := _create_vbox(panel_margin, "AiPlayerPanelVBox", 8)
	panel_vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var header_row := _create_hbox(panel_vbox, "AiHeaderRow", 8)
	header_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_ai_panel_title = _create_label(header_row, "AiPanelTitle", "AI 玩家位", 16)
	_ai_panel_title.modulate = Color(0.98, 0.99, 1.0, 0.98)
	_ai_panel_back_button = _create_button(header_row, "AiPanelBackButton", "返回地图", 10, 88)
	_apply_button_style(_ai_panel_back_button, "export")
	_ai_panel_back_button.pressed.connect(_close_ai_player_panel)
	var status_chip_panel := _create_panel(header_row, "AiPanelStatusChip")
	_apply_panel_style(status_chip_panel, "panel", "hud_bottom_bar")
	var status_chip_margin := _create_margin_container(status_chip_panel, "AiPanelStatusChipMargin", 8, 3, 8, 3)
	_ai_panel_status_chip = _create_label(status_chip_margin, "AiPanelStatusChipLabel", "AI托管", 8)
	_ai_panel_status_chip.modulate = Color(0.99, 0.98, 0.92, 0.98)
	var header_spacer := Control.new()
	header_spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header_row.add_child(header_spacer)
	_ai_panel_close_button = _create_button(header_row, "AiPanelCloseButton", "收起", 10, 78)
	_apply_button_style(_ai_panel_close_button, "refresh")
	_ai_panel_close_button.pressed.connect(_close_ai_player_panel)

	_ai_panel_name = _create_label(panel_vbox, "AiPanelName", "青州锋线营", 18)
	_ai_panel_name.modulate = Color(0.98, 0.99, 1.0, 0.98)
	_ai_panel_summary = _create_label(panel_vbox, "AiPanelSummary", "身份：汉室前锋 · 洛阳主城", 11)
	_ai_panel_summary.modulate = Color(0.84, 0.91, 0.97, 0.94)
	_ai_panel_strategy = _create_label(panel_vbox, "AiPanelStrategy", "人设：稳健推进，先补线再压进。", 11)
	_ai_panel_strategy.modulate = Color(0.95, 0.97, 1.0, 0.96)
	_ai_panel_status = _create_label(panel_vbox, "AiPanelStatus", "接令反馈：执行中 · 正在向虎牢方向铺路。", 11)
	_ai_panel_status.modulate = Color(0.86, 0.94, 0.99, 0.94)
	_ai_panel_target = _create_label(panel_vbox, "AiPanelTarget", "当前任务：虎牢方向铺路与北门换防", 11)
	_ai_panel_target.modulate = Color(0.90, 0.95, 1.0, 0.94)
	_ai_panel_recent = _create_label(panel_vbox, "AiPanelRecent", "最近记忆：两支队伍已出城，一支留守补位。", 10)
	_ai_panel_recent.modulate = Color(0.82, 0.89, 0.96, 0.90)
	_ai_panel_recent.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART

	_ai_panel_actions_row = _create_hbox(panel_vbox, "AiPanelActionsRow", 6)
	_ai_panel_actions_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_ai_panel_footer = _create_label(panel_vbox, "AiPanelFooter", "忠诚 / 风格：汉室优先 · 稳推型前线玩家。", 10)
	_ai_panel_footer.modulate = Color(0.80, 0.88, 0.96, 0.88)


func _build_mini_map_panel(parent: Control) -> void:
	_mini_map_panel_host = _create_host(parent, "MiniMapPanelHost")
	_mini_map_panel_host.visible = false
	_mini_map_panel = _create_panel(_mini_map_panel_host, "MiniMapPanel")
	_mini_map_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_apply_panel_style(_mini_map_panel, "panel", "hud_top_left")
	var panel_margin := _create_margin_container(_mini_map_panel, "MiniMapPanelMargin", 16, 14, 16, 14)
	panel_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var panel_vbox := _create_vbox(panel_margin, "MiniMapPanelVBox", 8)
	panel_vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var header_row := _create_hbox(panel_vbox, "MiniMapHeaderRow", 8)
	header_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_mini_map_title = _create_label(header_row, "MiniMapTitle", "小地图", 16)
	_mini_map_title.modulate = Color(0.98, 0.99, 1.0, 0.98)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header_row.add_child(spacer)
	_mini_map_close_button = _create_button(header_row, "MiniMapCloseButton", "关闭", 10, 74)
	_apply_button_style(_mini_map_close_button, "refresh")
	_mini_map_close_button.pressed.connect(_close_mini_map_panel)
	_mini_map_scope = _create_label(panel_vbox, "MiniMapScope", "范围：", 11)
	_mini_map_focus = _create_label(panel_vbox, "MiniMapFocus", "焦点：", 11)
	_mini_map_zoom = _create_label(panel_vbox, "MiniMapZoom", "缩放：", 11)
	_mini_map_hint = _create_label(panel_vbox, "MiniMapHint", "这里只保留可返回的小地图摘要，不再塞更深层抽屉。", 10)
	_mini_map_hint.modulate = Color(0.83, 0.90, 0.97, 0.90)
	var button_row := _create_hbox(panel_vbox, "MiniMapButtonRow", 6)
	button_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_mini_map_back_button = _create_button(button_row, "MiniMapBackButton", "返回地图", 10, 92)
	_apply_button_style(_mini_map_back_button, "export")
	_mini_map_back_button.pressed.connect(_close_mini_map_panel)
	_mini_map_province_button = _create_button(button_row, "MiniMapProvinceButton", "进入州层", 10, 92)
	_apply_button_style(_mini_map_province_button, "advance_tick")
	_mini_map_province_button.pressed.connect(_on_province_entry_pressed)


func _build_feedback_panel(parent: Control) -> void:
	_feedback_host = _create_host(parent, "SurfaceFeedbackHost")
	_feedback_host.visible = false
	_feedback_panel = _create_panel(_feedback_host, "SurfaceFeedbackPanel")
	_feedback_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_apply_panel_style(_feedback_panel, "panel", "hud_bottom_bar")
	var feedback_margin := _create_margin_container(_feedback_panel, "SurfaceFeedbackMargin", 12, 8, 12, 8)
	feedback_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var feedback_row := _create_hbox(feedback_margin, "SurfaceFeedbackRow", 8)
	feedback_row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_feedback_label = _create_label(feedback_row, "SurfaceFeedbackLabel", "交互反馈", 11)
	_feedback_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_feedback_label.modulate = Color(0.96, 0.99, 1.0, 0.96)
	_feedback_close_button = _create_button(feedback_row, "SurfaceFeedbackClose", "收起", 10, 72)
	_apply_button_style(_feedback_close_button, "refresh")
	_feedback_close_button.pressed.connect(_hide_feedback)


func _build_province_entry_panel(parent: Control) -> void:
	_province_entry_host = _create_host(parent, "ProvinceEntryPanel")
	_province_entry_host.anchor_left = 0.0
	_province_entry_host.anchor_top = 1.0
	_province_entry_host.anchor_right = 0.0
	_province_entry_host.anchor_bottom = 1.0
	_province_entry_host.offset_left = 262.0
	_province_entry_host.offset_top = -188.0
	_province_entry_host.offset_right = 534.0
	_province_entry_host.offset_bottom = -42.0

	_province_entry_panel = _create_panel(_province_entry_host, "ProvinceEntryCard")
	_province_entry_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_apply_panel_style(_province_entry_panel, "panel", "hud_bottom_bar")
	_province_entry_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	_province_entry_panel.gui_input.connect(_on_province_entry_panel_gui_input)
	var entry_margin := _create_margin_container(_province_entry_panel, "EntryMargin", 8, 4, 8, 4)
	entry_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var entry_vbox := _create_vbox(entry_margin, "EntryVBox", 2)
	entry_vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_province_entry_title = _create_label(entry_vbox, "EntryTitle", "焦点地块", 13)
	_province_entry_title.modulate = Color(0.96, 0.99, 1.0, 0.98)
	_province_entry_hint = _create_label(entry_vbox, "EntryHint", "先读焦点，再决定是否进入州层。", 10)
	_province_entry_hint.modulate = Color(0.86, 0.92, 0.98, 0.92)
	_province_entry_hint.visible = false
	_province_entry_meta = _create_label(entry_vbox, "EntryMeta", "坐标 | 情报 | 入口", 10)
	_province_entry_meta.modulate = Color(0.75, 0.85, 0.95, 0.88)
	_province_entry_button = _create_button(entry_vbox, "EntryButton", "进入州层", 8, 0)
	_apply_button_style(_province_entry_button, "advance_tick")
	_province_entry_button.add_theme_color_override("font_color", Color(0.99, 0.95, 0.88, 0.99))
	_province_entry_button.add_theme_color_override("font_hover_color", Color(1.0, 1.0, 1.0, 1.0))
	_province_entry_button.add_theme_color_override("font_pressed_color", Color(1.0, 1.0, 1.0, 1.0))
	_province_entry_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_province_entry_button.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_province_entry_button.custom_minimum_size = Vector2(0.0, 22.0)
	_province_entry_button.pressed.connect(_on_province_entry_pressed)


func _sync_province_entry_panel(state: Dictionary) -> void:
	var navigation_meta := _resolve_story_navigation_meta(state)
	var focus_tile := _resolve_focus_tile(state)
	var target_story_id := str(navigation_meta.get("targetStoryId", "")).strip_edges()
	var button_label := str(navigation_meta.get("buttonLabel", "宏观旧线已退役")).strip_edges()
	var reason := str(navigation_meta.get("reason", "macro_preview_retired")).strip_edges()
	if _province_entry_title != null:
		_province_entry_title.text = _build_focus_title(focus_tile, navigation_meta)
	if _province_entry_meta != null:
		_province_entry_meta.text = _build_focus_meta(focus_tile)
	if _province_entry_button != null:
		_province_entry_button.text = button_label if target_story_id != "" else "无入口"
		_province_entry_button.disabled = target_story_id == ""
		_province_entry_button.tooltip_text = "story=%s reason=%s" % [target_story_id, reason]
	_sync_province_entry_visibility()


func _sync_province_entry_visibility() -> void:
	if _province_entry_host == null or not is_instance_valid(_province_entry_host):
		return
	_province_entry_host.visible = true


func _sync_ai_player_panel(state: Dictionary) -> void:
	var open_requested := bool(state.get("aiPlayerPanelOpen", false))
	if open_requested:
		var panel_state: Dictionary = {}
		if _right_info_stack != null and _right_info_stack.has_method("get_ai_player_panel_state"):
			panel_state = _right_info_stack.call("get_ai_player_panel_state")
		_show_ai_player_panel(panel_state)
	else:
		_close_ai_player_panel()


func _sync_mini_map_panel(state: Dictionary) -> void:
	if _mini_map_title != null:
		_mini_map_title.text = "小地图"
	var mini_map: Dictionary = _normalize_dictionary(state.get("miniMap", {}))
	if _mini_map_scope != null:
		_mini_map_scope.text = str(mini_map.get("scopeLabel", "范围：当前战区"))
	if _mini_map_focus != null:
		_mini_map_focus.text = str(mini_map.get("focusLabel", "焦点：当前地块"))
	if _mini_map_zoom != null:
		_mini_map_zoom.text = str(mini_map.get("zoomLabel", "缩放：当前镜头"))
	if _mini_map_hint != null:
		_mini_map_hint.text = "先用这里确认范围与焦点，再决定是否进入州层。"


func _on_province_entry_pressed() -> void:
	var navigation_meta := _resolve_story_navigation_meta(_active_state)
	var target_story_id := str(navigation_meta.get("targetStoryId", "")).strip_edges()
	var reason := str(navigation_meta.get("reason", "macro_preview_retired")).strip_edges()
	if target_story_id == "":
		return
	request_story_navigation(target_story_id, reason, {
		"sourceStoryId": str(_preview_payload.get("storyId", story_id)),
		"sourceStateId": get_active_state_id(),
		"entry": "map_surface_province_entry",
	})


func _on_province_entry_panel_gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mouse_event := event as InputEventMouseButton
		if mouse_event.button_index == MOUSE_BUTTON_LEFT and mouse_event.pressed:
			accept_event()
			_on_province_entry_pressed()


func _on_command_dock_navigation_requested(command_id: String, command_label: String) -> void:
	var normalized_command_id := command_id.strip_edges()
	if normalized_command_id == "":
		return
	match normalized_command_id:
		"mini_map":
			_show_mini_map_panel(_active_state)
		"ai_player":
			var panel_state: Dictionary = {}
			if _right_info_stack != null and _right_info_stack.has_method("get_ai_player_panel_state"):
				panel_state = _right_info_stack.call("get_ai_player_panel_state")
			_show_ai_player_panel(panel_state)
		_:
			_show_feedback("已选中 %s，目前一级面板只保留摘要，不再误导进入假页。" % command_label)


func _on_ai_player_panel_requested(panel_state: Dictionary) -> void:
	_show_ai_player_panel(panel_state)


func _on_ai_player_panel_changed(panel_state: Dictionary) -> void:
	if not _ai_player_panel_open:
		return
	_show_ai_player_panel(panel_state)


func trigger_navigation_entry() -> void:
	_on_province_entry_pressed()


func trigger_ai_player_entry() -> void:
	var panel_state: Dictionary = {}
	if _right_info_stack != null and _right_info_stack.has_method("get_ai_player_panel_state"):
		panel_state = _right_info_stack.call("get_ai_player_panel_state")
	_show_ai_player_panel(panel_state)


func trigger_mini_map_entry() -> void:
	_show_mini_map_panel(_active_state)


func trigger_ai_command_feedback_entry() -> void:
	var panel_state: Dictionary = {}
	if _right_info_stack != null and _right_info_stack.has_method("get_ai_player_panel_state"):
		panel_state = _right_info_stack.call("get_ai_player_panel_state")
	_show_ai_player_panel(panel_state)
	_on_action_dock_action_requested("行军", "行军", "primary")


func close_surface_overlays() -> void:
	var was_ai_open := _ai_player_panel_open
	var was_mini_map_open := _mini_map_panel_open
	_ai_player_panel_open = false
	_ai_player_panel_state = {}
	_ai_command_feedback_active = false
	_mini_map_panel_open = false
	if _ai_player_panel_host != null:
		_ai_player_panel_host.visible = false
	if _mini_map_panel_host != null:
		_mini_map_panel_host.visible = false
	if (was_ai_open or was_mini_map_open) and _feedback_host != null:
		_show_feedback("已返回主地图。")


func is_ai_player_panel_open() -> bool:
	return _ai_player_panel_open and _ai_player_panel_host != null and _ai_player_panel_host.visible


func is_mini_map_panel_open() -> bool:
	return _mini_map_panel_open and _mini_map_panel_host != null and _mini_map_panel_host.visible


func is_ai_command_feedback_ready() -> bool:
	return is_ai_player_panel_open() and _ai_command_feedback_active


func _show_ai_player_panel(panel_state: Dictionary) -> void:
	_close_mini_map_panel()
	_ai_player_panel_state = panel_state.duplicate(true)
	_ai_player_panel_open = true
	if _ai_player_panel_host != null:
		_ai_player_panel_host.visible = true
	_render_ai_player_panel()
	_show_feedback("已打开 AI 玩家位，返回链保持在当前主地图。")


func _close_ai_player_panel() -> void:
	var was_open := _ai_player_panel_open
	_ai_player_panel_open = false
	_ai_player_panel_state = {}
	_ai_command_feedback_active = false
	if _ai_player_panel_host != null:
		_ai_player_panel_host.visible = false
	if was_open:
		_show_feedback("已返回主地图。")


func _render_ai_player_panel() -> void:
	if _ai_player_panel_host == null or _ai_player_panel == null:
		return
	var state := _ai_player_panel_state.duplicate(true)
	if state.is_empty():
		return
	var title_text := str(state.get("title", "AI 玩家位")).strip_edges()
	var control_label := str(state.get("controlLabel", "AI托管")).strip_edges()
	var persona_label := str(state.get("personaLabel", "稳健推进，先补线再压进。")).strip_edges()
	var current_task_label := str(state.get("currentTaskLabel", state.get("currentTarget", "虎牢方向铺路与北门换防"))).strip_edges()
	var memory_summary := str(state.get("memorySummary", state.get("recentAction", "两支队伍已出城，一支留守补位。"))).strip_edges()
	var loyalty_style_label := str(state.get("loyaltyStyleLabel", "汉室优先 · 稳推型前线玩家")).strip_edges()
	if _ai_panel_title != null:
		_ai_panel_title.text = title_text if title_text != "" else "AI 玩家位"
	if _ai_panel_status_chip != null:
		_ai_panel_status_chip.text = control_label if control_label != "" else "AI托管"
	if _ai_panel_name != null:
		_ai_panel_name.text = str(state.get("playerName", "AI 玩家位")).strip_edges()
	if _ai_panel_summary != null:
		_ai_panel_summary.text = "身份：%s · %s主城" % [
			str(state.get("allianceName", "未入盟")).strip_edges(),
			str(state.get("cityName", "未定城")).strip_edges()
		]
	if _ai_panel_strategy != null:
		_ai_panel_strategy.text = "人设：%s" % persona_label
	if _ai_panel_status != null:
		_ai_panel_status.text = "接令反馈：%s · %s" % [
			str(state.get("statusLabel", "执行中")).strip_edges(),
			str(state.get("statusSummary", "等待本轮状态。")).strip_edges()
		]
	if _ai_panel_target != null:
		_ai_panel_target.text = "当前任务：%s" % current_task_label
	if _ai_panel_recent != null:
		_ai_panel_recent.text = "最近记忆：%s" % memory_summary
	if _ai_panel_footer != null:
		_ai_panel_footer.text = "忠诚 / 风格：%s" % loyalty_style_label
	if _ai_panel_actions_row != null:
		_clear_children(_ai_panel_actions_row)
		var back_button := _create_button(_ai_panel_actions_row, "AiPanelActionBack", "返回地图", 10, 96)
		back_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_apply_button_style(back_button, "export")
		back_button.pressed.connect(_close_ai_player_panel)
		var province_button := _create_button(_ai_panel_actions_row, "AiPanelActionProvince", "进入州层", 10, 96)
		province_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_apply_button_style(province_button, "advance_tick")
		province_button.pressed.connect(_on_province_entry_pressed)


func _show_mini_map_panel(state: Dictionary) -> void:
	_close_ai_player_panel()
	_sync_mini_map_panel(state)
	_mini_map_panel_open = true
	if _mini_map_panel_host != null:
		_mini_map_panel_host.visible = true
	_show_feedback("已打开小地图摘要，可关闭，也可直接返回主地图。")


func _close_mini_map_panel() -> void:
	var was_open := _mini_map_panel_open
	_mini_map_panel_open = false
	if _mini_map_panel_host != null:
		_mini_map_panel_host.visible = false
	if was_open:
		_show_feedback("已关闭小地图，返回主地图。")


func _show_feedback(message: String) -> void:
	var text := message.strip_edges()
	if text == "" or _feedback_host == null or _feedback_label == null:
		return
	if is_presentation_capture_mode_enabled():
		_feedback_host.visible = false
		return
	_feedback_host.visible = true
	_feedback_label.text = text


func _hide_feedback() -> void:
	if _feedback_host != null:
		_feedback_host.visible = false


func _on_action_dock_action_requested(action_id: String, action_label: String, action_group: String) -> void:
	var normalized_label := action_label.strip_edges()
	if normalized_label == "":
		normalized_label = action_id.strip_edges()
	_apply_ai_command_feedback(action_id, normalized_label, action_group)
	_show_feedback("动作已确认：%s（%s）" % [normalized_label, "主动作" if action_group == "primary" else "补充动作"])


func _apply_ai_command_feedback(action_id: String, action_label: String, action_group: String) -> void:
	if _active_state.is_empty():
		return
	var feedback_state := _build_ai_command_feedback_state(action_id, action_label, action_group)
	if feedback_state.is_empty():
		return
	var next_state := _active_state.duplicate(true)
	var ai_player_card := _normalize_dictionary(next_state.get("aiPlayerCard", {}))
	var ai_player_panel := _normalize_dictionary(next_state.get("aiPlayerPanel", {}))
	var status_id := str(feedback_state.get("statusId", "executing")).strip_edges()
	next_state["activeAiStatusId"] = status_id
	var status_options: Variant = next_state.get("aiStatusOptions", [])
	if status_options is Array:
		var updated_options: Array = []
		for option_variant in status_options:
			if option_variant is Dictionary:
				var option := (option_variant as Dictionary).duplicate(true)
				if str(option.get("id", "")).strip_edges() == status_id:
					option["summary"] = str(feedback_state.get("statusSummary", option.get("summary", ""))).strip_edges()
				updated_options.append(option)
		next_state["aiStatusOptions"] = updated_options
	ai_player_card["currentTaskLabel"] = str(feedback_state.get("currentTaskLabel", ai_player_card.get("currentTaskLabel", ""))).strip_edges()
	ai_player_card["memorySummary"] = str(feedback_state.get("memorySummary", ai_player_card.get("memorySummary", ""))).strip_edges()
	ai_player_panel["currentTaskLabel"] = str(feedback_state.get("currentTaskLabel", ai_player_panel.get("currentTaskLabel", ai_player_panel.get("currentTarget", "")))).strip_edges()
	ai_player_panel["currentTarget"] = ai_player_panel["currentTaskLabel"]
	ai_player_panel["memorySummary"] = str(feedback_state.get("memorySummary", ai_player_panel.get("memorySummary", ai_player_panel.get("recentAction", "")))).strip_edges()
	ai_player_panel["recentAction"] = str(feedback_state.get("recentAction", ai_player_panel.get("recentAction", ""))).strip_edges()
	ai_player_panel["detailSummary"] = str(feedback_state.get("detailSummary", ai_player_panel.get("detailSummary", ""))).strip_edges()
	next_state["aiPlayerCard"] = ai_player_card
	next_state["aiPlayerPanel"] = ai_player_panel
	_active_state = next_state
	_ai_command_feedback_active = true
	_apply_component_state(_right_info_stack, _active_state)
	if _ai_player_panel_open and _right_info_stack != null and _right_info_stack.has_method("get_ai_player_panel_state"):
		_ai_player_panel_state = _right_info_stack.call("get_ai_player_panel_state")
		_render_ai_player_panel()


func _build_ai_command_feedback_state(action_id: String, action_label: String, action_group: String) -> Dictionary:
	var normalized_id := action_id.strip_edges()
	var normalized_label := action_label.strip_edges()
	if normalized_label == "":
		normalized_label = normalized_id
	var feedback := {
		"statusId": "executing",
		"statusSummary": "已接令 %s，先按当前节奏稳步推进。" % normalized_label,
		"currentTaskLabel": "优先处理 %s，并保持当前战区节奏。" % normalized_label,
		"memorySummary": "主公刚下达 %s，当前优先维持稳推与补线顺序。" % normalized_label,
		"recentAction": "已接令：%s，并开始同步前线队列。" % normalized_label,
		"detailSummary": "已按当前节奏接令，不再把反馈藏在日志里。",
	}
	if normalized_id in ["驻守", "占领", "进入"]:
		feedback["statusId"] = "pending"
		feedback["statusSummary"] = "可以执行 %s，但需要先确认落点与驻守顺序。" % normalized_label
		feedback["currentTaskLabel"] = "先确认 %s 的落点，再决定是否推进。" % normalized_label
		feedback["memorySummary"] = "上一次急切执行 %s 压缩了补给线，这次先做确认。" % normalized_label
		feedback["recentAction"] = "已收到 %s，但仍在核对落点与补给。" % normalized_label
		feedback["detailSummary"] = "这类命令先给确认反馈，避免 AI 像假交互一样直接吞命令。"
	elif normalized_id in ["换防", "补给", "扫荡"] or action_group == "overflow":
		feedback["statusId"] = "adjust"
		feedback["statusSummary"] = "建议先补齐前置条件，再执行 %s。" % normalized_label
		feedback["currentTaskLabel"] = "先补前置条件，再执行 %s。" % normalized_label
		feedback["memorySummary"] = "最近一次直接推进 %s 拉长了战线，这次先给出调整建议。" % normalized_label
		feedback["recentAction"] = "已收到 %s，先给出调整建议后再执行。" % normalized_label
		feedback["detailSummary"] = "AI 先回建议，不再只给一条空泛状态。"
	elif normalized_id in ["侦查", "标记", "撤离"]:
		feedback["statusId"] = "report"
		feedback["statusSummary"] = "关于 %s 的回报已生成，可直接据此继续决策。" % normalized_label
		feedback["currentTaskLabel"] = "先回传 %s 的结果，再决定下一步。" % normalized_label
		feedback["memorySummary"] = "最近一次 %s 已经回传，当前重点是缩短等待时间。" % normalized_label
		feedback["recentAction"] = "已回传 %s 的最新结果。" % normalized_label
		feedback["detailSummary"] = "这类命令优先给回报，让玩家能继续决策。"
	return feedback


func _resolve_story_navigation_meta(state: Dictionary) -> Dictionary:
	var state_navigation: Dictionary = _normalize_dictionary(state.get("storyNavigation", {}))
	if not state_navigation.is_empty():
		return state_navigation
	return _normalize_dictionary(_preview_payload.get("storyNavigation", {}))


func _process(_delta: float) -> void:
	_sync_hover_focus_from_grid()


func _sync_hover_focus_from_grid() -> void:
	var map_grid := get_map_grid()
	if map_grid == null:
		return
	var hover_tile: Variant = map_grid.get("_hover_tile")
	if not (hover_tile is Dictionary):
		return
	var hover_dict := hover_tile as Dictionary
	var hover_key := _focus_tile_key(hover_dict)
	if hover_key == _hover_focus_tile_key:
		return
	_hover_focus_tile = hover_dict.duplicate(true)
	_hover_focus_tile_key = hover_key
	if not _active_state.is_empty():
		_sync_province_entry_panel(_active_state)


func _resolve_focus_tile(state: Dictionary) -> Dictionary:
	if not _hover_focus_tile.is_empty():
		return _hover_focus_tile
	var map_grid := get_map_grid()
	if map_grid != null:
		var hover_tile: Variant = map_grid.get("_hover_tile")
		if hover_tile is Dictionary and not (hover_tile as Dictionary).is_empty():
			return (hover_tile as Dictionary).duplicate(true)
	var tile_type := "land"
	var hover_tile_id := str(state.get("hoverTileId", "")).strip_edges()
	if hover_tile_id.begins_with("city_"):
		tile_type = "city"
	elif hover_tile_id.begins_with("res_"):
		tile_type = "resource"
	return {
		"id": hover_tile_id,
		"x": int(state.get("hoverX", 0)),
		"y": int(state.get("hoverY", 0)),
		"type": tile_type,
		"terrain": str(state.get("districtName", "plain")),
		"district": str(state.get("districtName", "unknown")),
	}


func _focus_tile_key(tile: Dictionary) -> String:
	if tile.is_empty():
		return ""
	var tile_id := str(tile.get("id", "")).strip_edges()
	if tile_id != "":
		return tile_id
	return "%d:%d" % [int(tile.get("x", 0)), int(tile.get("y", 0))]


func _build_focus_title(tile: Dictionary, navigation_meta: Dictionary) -> String:
	if tile.is_empty():
		return str(navigation_meta.get("title", "州层入口"))
	var tile_name := _friendly_tile_name(tile)
	var tile_type := _friendly_tile_type(str(tile.get("type", "land")))
	return "%s · %s" % [tile_name, tile_type]


func _build_focus_hint(tile: Dictionary, navigation_meta: Dictionary) -> String:
	if tile.is_empty():
		return str(navigation_meta.get("buttonHint", "province / warzone / nation preview 旧线已退役。"))
	var district := str(tile.get("district", "")).strip_edges()
	var terrain := str(tile.get("terrain", "")).strip_edges()
	var parts: Array[String] = []
	if district != "":
		parts.append(district)
	if terrain != "" and terrain != district:
		parts.append(terrain)
	return "当前聚焦 %s，先读小卡；宏观旧线入口已退役。" % " / ".join(parts)


func _build_focus_meta(tile: Dictionary) -> String:
	if tile.is_empty():
		return "坐标 00,00"
	return "坐标 %02d,%02d" % [int(tile.get("x", 0)), int(tile.get("y", 0))]


func _friendly_tile_name(tile: Dictionary) -> String:
	var raw_id := str(tile.get("id", "")).strip_edges()
	if raw_id == "":
		return "当前地块"
	var normalized := raw_id.replace("city_", "").replace("res_", "")
	var parts := normalized.split("_", false)
	var cleaned: Array[String] = []
	for part in parts:
		if part.is_valid_int():
			continue
		if part.length() > 0:
			cleaned.append(part.capitalize())
	if cleaned.is_empty():
		return raw_id
	return " ".join(cleaned)


func _friendly_tile_type(tile_type: String) -> String:
	match tile_type.strip_edges().to_lower():
		"city":
			return "城池"
		"resource":
			return "资源地"
		"land":
			return "土地"
		_:
			return tile_type.strip_edges()


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


func _clear_children(parent: Node) -> void:
	for child in parent.get_children():
		child.queue_free()
