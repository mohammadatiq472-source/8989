extends Control
class_name MainCityHubOverlay

signal hub_entry_requested(action_id: String)

const DISPLAY_MODE_WORLD := "world"
const HUB_SIZE := Vector2(156.0, 72.0)
const ENTRY_SIZE := Vector2(58.0, 28.0)
const ENTRY_GAP := 6
const HUB_OFFSET := Vector2(0.0, -86.0)
const FALLBACK_SCREEN_POSITION := Vector2(760.0, 470.0)
const CONTEXT_PANEL_SIZE := Vector2(1180.0, 640.0)
const CONTEXT_PANEL_BOTTOM_MARGIN := 104.0
const CONTEXT_TABS := [
	{"id": "overview", "label": "总览"},
	{"id": "troop", "label": "部队"},
	{"id": "facility", "label": "设施"},
	{"id": "building_tree", "label": "建筑树"},
]
const ACTIONS := [
	{"id": "interior", "label": "内政"},
	{"id": "recruit", "label": "招募"},
	{"id": "generals", "label": "武将"},
	{"id": "alliance", "label": "同盟"},
	{"id": "ai_hub", "label": "AI"},
	{"id": "troop", "label": "部队"},
]
const PREVIEW_GENERALS := [
	{"id": "general_yue", "name": "岳平", "role": "前锋", "meta": "骑兵 / 突击"},
	{"id": "general_lu", "name": "陆昭", "role": "中军", "meta": "弓兵 / 指挥"},
	{"id": "general_qin", "name": "秦让", "role": "大营", "meta": "步兵 / 防御"},
	{"id": "general_shen", "name": "沈陵", "role": "中军", "meta": "谋略 / 辅助"},
]
const PREVIEW_BUILDINGS := [
	{"id": "drill_ground", "label": "校场", "level": "Lv.4 -> Lv.5", "status": "可升级", "body": "提升部队操练效率和编组稳定度。", "cost": "木 180 | 石 120 | 令 1", "effect": "操练效率 +1 | 编组稳定 +1"},
	{"id": "barracks", "label": "募兵所", "level": "Lv.4 -> Lv.5", "status": "待补给", "body": "承接征兵入口与预备兵状态。", "cost": "粮 260 | 木 140 | 令 1", "effect": "征兵队列 +1"},
	{"id": "command_hall", "label": "统帅厅", "level": "Lv.3 -> Lv.4", "status": "条件不足", "body": "强化统帅位与部队上限。", "cost": "木 220 | 石 220 | 令 1", "effect": "统帅上限 +1"},
	{"id": "market_plaza", "label": "市井", "level": "Lv.5 -> Lv.6", "status": "经营中", "body": "主城经营、交易入口和基础收益锚点。", "cost": "木 220 | 石 140 | 令 1", "effect": "经营收益 +1"},
]
const BUILDING_TREE_VIEW_SCENE := preload("res://scenes/ui/building_tree_view.tscn")
const BUILD_UPGRADE_SHEET_SCENE := preload("res://scenes/ui/build_upgrade_sheet.tscn")

var _map_grid: Node = null
var _display_mode: String = ""
var _context: Dictionary = {}
var _expanded: bool = false
var _active_context_tab: String = "overview"
var _active_slot_id: String = "camp"
var _active_building_id: String = "drill_ground"
var _formation_slots := {
	"camp": "",
	"mid": "",
	"front": "",
}
var _hub_panel: PanelContainer
var _title_label: Label
var _subtitle_label: Label
var _hub_button: Button
var _entry_panel: PanelContainer
var _entry_grid: GridContainer
var _context_backdrop: ColorRect
var _context_panel: PanelContainer
var _context_title_label: Label
var _context_subtitle_label: Label
var _context_tab_row: HBoxContainer
var _context_content_host: VBoxContainer
var _context_tab_buttons: Dictionary = {}
var _building_tree: Node = null
var _upgrade_sheet: Node = null


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	z_index = 120
	_build_view()
	set_display_mode("")


func configure(map_grid: Node) -> void:
	if _map_grid != null and _map_grid.has_signal("view_transform_changed"):
		var old_callback := Callable(self, "_on_map_view_transform_changed")
		if _map_grid.is_connected("view_transform_changed", old_callback):
			_map_grid.disconnect("view_transform_changed", old_callback)
	_map_grid = map_grid
	if _map_grid != null and _map_grid.has_signal("view_transform_changed"):
		var callback := Callable(self, "_on_map_view_transform_changed")
		if not _map_grid.is_connected("view_transform_changed", callback):
			_map_grid.connect("view_transform_changed", callback)
	_update_position()


func set_display_mode(next_mode: String) -> void:
	_display_mode = next_mode.strip_edges().to_lower()
	visible = _display_mode == DISPLAY_MODE_WORLD
	if not visible:
		set_expanded(false)
		return
	_update_position()


func set_context(next_context: Dictionary) -> void:
	_context = next_context.duplicate(true)
	var title := str(_context.get("title", "主城中枢")).strip_edges()
	if title == "":
		title = "主城中枢"
	var subtitle := str(_context.get("subtitle", "")).strip_edges()
	if subtitle == "":
		subtitle = "内政 / 招募 / 武将 / 同盟 / AI / 部队"
	_title_label.text = title
	_subtitle_label.text = subtitle
	if _context_title_label != null:
		_context_title_label.text = title
	if _context_subtitle_label != null:
		_context_subtitle_label.text = subtitle
	_hub_button.tooltip_text = _build_tooltip()
	_update_position()


func set_expanded(next_expanded: bool) -> void:
	_expanded = next_expanded
	if _hub_panel != null:
		_hub_panel.visible = not _expanded
	if _entry_panel != null:
		_entry_panel.visible = false
	if _context_backdrop != null:
		_context_backdrop.visible = _expanded
	if _context_panel != null:
		_context_panel.visible = _expanded
		if _expanded:
			_select_context_tab(_active_context_tab)
			_play_context_panel_intro()


func is_expanded() -> bool:
	return _expanded


func is_hub_visible() -> bool:
	var compact_visible := _hub_panel != null and _hub_panel.visible
	var context_visible := _context_panel != null and _context_panel.visible
	return visible and (compact_visible or context_visible)


func get_context_summary() -> Dictionary:
	return {
		"visible": is_hub_visible(),
		"expanded": _expanded,
		"contextPanelVisible": _context_panel != null and _context_panel.visible,
		"activeContextTab": _active_context_tab,
		"templateAssignmentCount": _template_assignment_count(),
		"formationSlots": _formation_slots.duplicate(true),
		"hasFacilityTree": _building_tree != null and is_instance_valid(_building_tree),
		"hasUpgradeSheet": _upgrade_sheet != null and is_instance_valid(_upgrade_sheet),
		"tileId": str(_context.get("tileId", "")),
		"tileX": int(_context.get("tileX", -1)),
		"tileY": int(_context.get("tileY", -1)),
		"title": str(_context.get("title", "")),
	}


func request_entry(action_id: String) -> void:
	var normalized := action_id.strip_edges()
	if normalized == "":
		return
	set_expanded(false)
	hub_entry_requested.emit(normalized)


func select_context_tab(tab_id: String) -> void:
	var normalized := tab_id.strip_edges()
	if normalized == "":
		normalized = "overview"
	if not _expanded:
		set_expanded(true)
	_select_context_tab(normalized)


func assign_preview_general(general_id: String = "") -> bool:
	var resolved_general_id := general_id.strip_edges()
	if resolved_general_id == "":
		resolved_general_id = str(PREVIEW_GENERALS[0].get("id", ""))
	var general := _find_preview_general(resolved_general_id)
	if general.is_empty():
		return false
	_assign_preview_general_to_slot(resolved_general_id)
	_select_context_tab("troop")
	return true


func _build_view() -> void:
	_hub_panel = PanelContainer.new()
	_hub_panel.name = "MainCityHubPanel"
	_hub_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hub_panel.custom_minimum_size = HUB_SIZE
	_hub_panel.size = HUB_SIZE
	_hub_panel.add_theme_stylebox_override("panel", _make_panel_style(Color(0.05, 0.07, 0.07, 0.82), Color(0.87, 0.69, 0.28, 0.78), 2))
	add_child(_hub_panel)

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 10)
	margin.add_theme_constant_override("margin_right", 10)
	margin.add_theme_constant_override("margin_top", 8)
	margin.add_theme_constant_override("margin_bottom", 8)
	_hub_panel.add_child(margin)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 4)
	margin.add_child(column)

	_title_label = Label.new()
	_title_label.text = "主城中枢"
	_title_label.add_theme_font_size_override("font_size", 16)
	_title_label.add_theme_color_override("font_color", Color(1.0, 0.88, 0.54, 1.0))
	column.add_child(_title_label)

	_subtitle_label = Label.new()
	_subtitle_label.text = "内政 / 招募 / 武将 / 同盟 / AI / 部队"
	_subtitle_label.add_theme_font_size_override("font_size", 10)
	_subtitle_label.add_theme_color_override("font_color", Color(0.86, 0.89, 0.83, 0.95))
	_subtitle_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(_subtitle_label)

	_hub_button = Button.new()
	_hub_button.name = "MainCityHubButton"
	_hub_button.text = "展开"
	_hub_button.focus_mode = Control.FOCUS_NONE
	_hub_button.mouse_filter = Control.MOUSE_FILTER_STOP
	_hub_button.custom_minimum_size = Vector2(72.0, 24.0)
	_hub_button.pressed.connect(_on_hub_button_pressed)
	column.add_child(_hub_button)

	_entry_panel = PanelContainer.new()
	_entry_panel.name = "MainCityHubEntryPanel"
	_entry_panel.visible = false
	_entry_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	_entry_panel.custom_minimum_size = Vector2(206.0, 76.0)
	_entry_panel.size = Vector2(206.0, 76.0)
	_entry_panel.add_theme_stylebox_override("panel", _make_panel_style(Color(0.02, 0.03, 0.04, 0.88), Color(0.68, 0.86, 0.62, 0.72), 1))
	add_child(_entry_panel)

	var entry_margin := MarginContainer.new()
	entry_margin.add_theme_constant_override("margin_left", 8)
	entry_margin.add_theme_constant_override("margin_right", 8)
	entry_margin.add_theme_constant_override("margin_top", 8)
	entry_margin.add_theme_constant_override("margin_bottom", 8)
	_entry_panel.add_child(entry_margin)

	_entry_grid = GridContainer.new()
	_entry_grid.columns = 3
	_entry_grid.add_theme_constant_override("h_separation", ENTRY_GAP)
	_entry_grid.add_theme_constant_override("v_separation", ENTRY_GAP)
	entry_margin.add_child(_entry_grid)

	for action in ACTIONS:
		var button := Button.new()
		button.text = str(action.get("label", "入口"))
		button.focus_mode = Control.FOCUS_NONE
		button.custom_minimum_size = ENTRY_SIZE
		button.mouse_filter = Control.MOUSE_FILTER_STOP
		button.tooltip_text = "%s入口" % str(action.get("label", "功能"))
		var action_id := str(action.get("id", ""))
		button.pressed.connect(Callable(self, "request_entry").bind(action_id))
		_entry_grid.add_child(button)

	_build_context_panel()


func _build_context_panel() -> void:
	_context_backdrop = ColorRect.new()
	_context_backdrop.name = "MainCityContextBackdrop"
	_context_backdrop.set_anchors_preset(Control.PRESET_FULL_RECT)
	_context_backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_context_backdrop.visible = false
	_context_backdrop.color = Color(0.0, 0.0, 0.0, 0.0)
	add_child(_context_backdrop)

	_context_panel = PanelContainer.new()
	_context_panel.name = "MainCityContextPanel"
	_context_panel.visible = false
	_context_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	_context_panel.custom_minimum_size = CONTEXT_PANEL_SIZE
	_context_panel.size = CONTEXT_PANEL_SIZE
	_context_panel.add_theme_stylebox_override("panel", _make_panel_style(Color(0.060, 0.052, 0.042, 0.92), Color(0.84, 0.65, 0.32, 0.86), 2))
	add_child(_context_panel)

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 18)
	margin.add_theme_constant_override("margin_top", 16)
	margin.add_theme_constant_override("margin_right", 18)
	margin.add_theme_constant_override("margin_bottom", 16)
	_context_panel.add_child(margin)

	var root := VBoxContainer.new()
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_theme_constant_override("separation", 10)
	margin.add_child(root)

	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 12)
	root.add_child(header)

	var title_box := VBoxContainer.new()
	title_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_box.add_theme_constant_override("separation", 2)
	header.add_child(title_box)

	_context_title_label = Label.new()
	_context_title_label.text = str(_context.get("title", "主城中枢"))
	_context_title_label.add_theme_font_size_override("font_size", 28)
	_context_title_label.add_theme_color_override("font_color", Color(1.0, 0.84, 0.42, 1.0))
	title_box.add_child(_context_title_label)

	_context_subtitle_label = Label.new()
	_context_subtitle_label.text = str(_context.get("subtitle", "部队 / 设施 / 建筑树"))
	_context_subtitle_label.add_theme_font_size_override("font_size", 13)
	_context_subtitle_label.add_theme_color_override("font_color", Color(0.92, 0.88, 0.74, 0.96))
	_context_subtitle_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	title_box.add_child(_context_subtitle_label)

	var interior_button := _make_context_action_button("内政全屏")
	interior_button.pressed.connect(Callable(self, "request_entry").bind("interior"))
	header.add_child(interior_button)

	var close_button := _make_context_action_button("返回地图")
	close_button.pressed.connect(func() -> void:
		set_expanded(false)
	)
	header.add_child(close_button)

	_context_tab_row = HBoxContainer.new()
	_context_tab_row.add_theme_constant_override("separation", 8)
	root.add_child(_context_tab_row)
	for tab in CONTEXT_TABS:
		var tab_id := str(tab.get("id", ""))
		var button := _make_context_tab_button(str(tab.get("label", tab_id)))
		button.pressed.connect(func() -> void:
			_select_context_tab(tab_id)
		)
		_context_tab_buttons[tab_id] = button
		_context_tab_row.add_child(button)

	_context_content_host = VBoxContainer.new()
	_context_content_host.name = "ContextContentHost"
	_context_content_host.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_context_content_host.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_context_content_host.add_theme_constant_override("separation", 10)
	root.add_child(_context_content_host)


func _make_panel_style(bg: Color, border: Color, border_width: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = bg
	style.border_color = border
	style.border_width_left = border_width
	style.border_width_right = border_width
	style.border_width_top = border_width
	style.border_width_bottom = border_width
	style.corner_radius_top_left = 6
	style.corner_radius_top_right = 6
	style.corner_radius_bottom_left = 6
	style.corner_radius_bottom_right = 6
	return style


func _make_panel_style_with_margins(bg: Color, border: Color, border_width: int, content_margin: int = 10) -> StyleBoxFlat:
	var style := _make_panel_style(bg, border, border_width)
	style.content_margin_left = content_margin
	style.content_margin_right = content_margin
	style.content_margin_top = content_margin
	style.content_margin_bottom = content_margin
	return style


func _make_context_action_button(label: String) -> Button:
	var button := Button.new()
	button.text = label
	button.focus_mode = Control.FOCUS_NONE
	button.custom_minimum_size = Vector2(108.0, 38.0)
	button.add_theme_font_size_override("font_size", 14)
	button.add_theme_color_override("font_disabled_color", Color(0.78, 0.74, 0.64, 0.96))
	button.add_theme_stylebox_override("disabled", _make_panel_style(Color(0.15, 0.125, 0.090, 0.92), Color(0.55, 0.42, 0.24, 0.68), 1))
	return button


func _make_context_tab_button(label: String) -> Button:
	var button := Button.new()
	button.text = label
	button.toggle_mode = true
	button.focus_mode = Control.FOCUS_NONE
	button.custom_minimum_size = Vector2(118.0, 36.0)
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.add_theme_font_size_override("font_size", 14)
	button.add_theme_stylebox_override("normal", _make_panel_style(Color(0.12, 0.11, 0.09, 0.90), Color(0.36, 0.30, 0.18, 0.78), 1))
	button.add_theme_stylebox_override("hover", _make_panel_style(Color(0.18, 0.15, 0.10, 0.96), Color(0.72, 0.54, 0.24, 0.88), 1))
	button.add_theme_stylebox_override("pressed", _make_panel_style(Color(0.34, 0.22, 0.09, 0.98), Color(0.98, 0.76, 0.32, 0.96), 1))
	return button


func _make_context_label(text: String, font_size: int = 14, wrap: bool = false) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", Color(0.90, 0.90, 0.86, 0.98))
	if wrap:
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	return label


func _make_context_panel(bg: Color = Color(0.05, 0.052, 0.058, 0.92), border: Color = Color(0.38, 0.34, 0.24, 0.62)) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override("panel", _make_panel_style(bg, border, 1))
	return panel


func _select_context_tab(tab_id: String) -> void:
	var normalized := tab_id.strip_edges()
	if normalized == "":
		normalized = "overview"
	if not ["overview", "troop", "facility", "building_tree"].has(normalized):
		normalized = "overview"
	_active_context_tab = normalized
	_clear_context_content()
	_update_context_tab_buttons()
	match _active_context_tab:
		"troop":
			_context_content_host.add_child(_build_context_troop_view())
		"facility":
			_context_content_host.add_child(_build_context_facility_view())
		"building_tree":
			_context_content_host.add_child(_build_context_building_tree_view())
		_:
			_context_content_host.add_child(_build_context_overview())


func _clear_context_content() -> void:
	_building_tree = null
	_upgrade_sheet = null
	if _context_content_host == null:
		return
	for child in _context_content_host.get_children():
		child.queue_free()


func _update_context_tab_buttons() -> void:
	for tab_id_variant in _context_tab_buttons.keys():
		var tab_id := str(tab_id_variant)
		var button := _context_tab_buttons.get(tab_id_variant) as Button
		if button != null:
			button.button_pressed = tab_id == _active_context_tab


func _build_context_overview() -> Control:
	var split := HBoxContainer.new()
	split.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	split.size_flags_vertical = Control.SIZE_EXPAND_FILL
	split.add_theme_constant_override("separation", 12)

	var city_scene := _make_context_panel(Color(0.11, 0.12, 0.095, 0.88), Color(0.70, 0.54, 0.28, 0.68))
	city_scene.custom_minimum_size = Vector2(520.0, 0.0)
	split.add_child(city_scene)
	var city_margin := MarginContainer.new()
	city_margin.add_theme_constant_override("margin_left", 16)
	city_margin.add_theme_constant_override("margin_top", 14)
	city_margin.add_theme_constant_override("margin_right", 16)
	city_margin.add_theme_constant_override("margin_bottom", 14)
	city_scene.add_child(city_margin)
	var city_col := VBoxContainer.new()
	city_col.add_theme_constant_override("separation", 12)
	city_margin.add_child(city_col)
	city_col.add_child(_make_context_label("青石城 · 主城舞台", 19))
	city_col.add_child(_make_context_label("地图节点进入后保留世界背景，主城区域在前景聚焦；部队、设施、建筑树都从同一主城上下文承接。", 13, true))
	city_col.add_child(_build_city_stage())
	city_col.add_child(_build_city_object_action_strip())
	city_col.add_child(_build_city_status_row())

	var right := VBoxContainer.new()
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right.size_flags_vertical = Control.SIZE_EXPAND_FILL
	right.add_theme_constant_override("separation", 10)
	split.add_child(right)
	right.add_child(_build_context_resource_strip())
	right.add_child(_build_context_object_feedback())
	right.add_child(_build_context_general_strip())
	return split


func _build_context_resource_strip() -> Control:
	var panel := _make_context_panel(Color(0.12, 0.10, 0.075, 0.90), Color(0.64, 0.47, 0.24, 0.74))
	panel.custom_minimum_size = Vector2(0.0, 96.0)
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 14)
	margin.add_theme_constant_override("margin_top", 10)
	margin.add_theme_constant_override("margin_right", 14)
	margin.add_theme_constant_override("margin_bottom", 10)
	panel.add_child(margin)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	margin.add_child(col)
	col.add_child(_make_context_label("资源与状态", 15))
	var resource_row := HBoxContainer.new()
	resource_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	resource_row.add_theme_constant_override("separation", 8)
	col.add_child(resource_row)
	for item in [
		{"label": "木", "value": "192748"},
		{"label": "铁", "value": "134627"},
		{"label": "石", "value": "174933"},
		{"label": "粮", "value": "222874"},
	]:
		var chip := _make_context_panel(Color(0.20, 0.16, 0.10, 0.92), Color(0.62, 0.48, 0.26, 0.72))
		chip.custom_minimum_size = Vector2(112.0, 38.0)
		chip.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var chip_label := _make_context_label("%s  %s" % [str(item.get("label", "")), str(item.get("value", ""))], 13)
		chip_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		chip_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		chip.add_child(chip_label)
		resource_row.add_child(chip)
	return panel


func _build_context_entry_cards() -> Control:
	var grid := GridContainer.new()
	grid.columns = 2
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.size_flags_vertical = Control.SIZE_EXPAND_FILL
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 10)
	var entries := [
		{"title": "部队", "body": "五队总览与大营 / 中军 / 前锋编排", "tab": "troop"},
		{"title": "设施", "body": "校场、募兵所、统帅厅和市井入口", "tab": "facility"},
		{"title": "建筑树", "body": "设施节点、升级单和模板反馈", "tab": "building_tree"},
		{"title": "内政", "body": "进入现有正式内政全屏面板", "entry": "interior"},
	]
	for entry in entries:
		var card := _make_context_panel(Color(0.105, 0.092, 0.075, 0.90), Color(0.53, 0.42, 0.24, 0.70))
		card.custom_minimum_size = Vector2(0.0, 106.0)
		var margin := MarginContainer.new()
		margin.add_theme_constant_override("margin_left", 14)
		margin.add_theme_constant_override("margin_top", 12)
		margin.add_theme_constant_override("margin_right", 14)
		margin.add_theme_constant_override("margin_bottom", 12)
		card.add_child(margin)
		var col := VBoxContainer.new()
		col.add_theme_constant_override("separation", 6)
		margin.add_child(col)
		col.add_child(_make_context_label(str(entry.get("title", "")), 18))
		col.add_child(_make_context_label(str(entry.get("body", "")), 12, true))
		var button := _make_context_action_button("进入")
		if str(entry.get("entry", "")) != "":
			button.pressed.connect(Callable(self, "request_entry").bind(str(entry.get("entry", ""))))
		else:
			var tab_id := str(entry.get("tab", "overview"))
			button.pressed.connect(func() -> void:
				_select_context_tab(tab_id)
			)
		col.add_child(button)
		grid.add_child(card)
	return grid


func _build_context_object_feedback() -> Control:
	var panel := _make_context_panel(Color(0.095, 0.082, 0.066, 0.90), Color(0.58, 0.44, 0.24, 0.70))
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 14)
	margin.add_theme_constant_override("margin_top", 12)
	margin.add_theme_constant_override("margin_right", 14)
	margin.add_theme_constant_override("margin_bottom", 12)
	panel.add_child(margin)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	margin.add_child(col)
	col.add_child(_make_context_label("主府已选中 · 近场反馈", 18))
	col.add_child(_make_context_label("左侧主城舞台高亮主府，右侧只呈现和该对象相关的钻取动作；资源、武将和模板状态仍留在同一主城上下文。", 12, true))

	var focus_row := HBoxContainer.new()
	focus_row.add_theme_constant_override("separation", 10)
	col.add_child(focus_row)
	for item in [
		{"title": "城务", "body": "内政全屏"},
		{"title": "军务", "body": "部队编排"},
		{"title": "营建", "body": "设施 / 建筑树"},
	]:
		var tile := _make_context_panel(Color(0.14, 0.115, 0.085, 0.92), Color(0.60, 0.46, 0.26, 0.72))
		tile.custom_minimum_size = Vector2(0.0, 74.0)
		tile.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var tile_col := VBoxContainer.new()
		tile_col.alignment = BoxContainer.ALIGNMENT_CENTER
		tile.add_child(tile_col)
		var title := _make_context_label(str(item.get("title", "")), 16)
		title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		tile_col.add_child(title)
		var body := _make_context_label(str(item.get("body", "")), 11, true)
		body.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		tile_col.add_child(body)
		focus_row.add_child(tile)

	var action_row := HBoxContainer.new()
	action_row.add_theme_constant_override("separation", 8)
	col.add_child(action_row)
	for action in [
		{"label": "部队编排", "tab": "troop"},
		{"label": "设施组成", "tab": "facility"},
		{"label": "建筑树", "tab": "building_tree"},
		{"label": "内政全屏", "entry": "interior"},
	]:
		var button := _make_context_action_button(str(action.get("label", "")))
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		if str(action.get("entry", "")) != "":
			button.pressed.connect(Callable(self, "request_entry").bind(str(action.get("entry", ""))))
		else:
			var tab_id := str(action.get("tab", "overview"))
			button.pressed.connect(func() -> void:
				_select_context_tab(tab_id)
			)
		action_row.add_child(button)

	var route := _make_context_panel(Color(0.105, 0.095, 0.078, 0.82), Color(0.48, 0.37, 0.22, 0.64))
	route.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_child(route)
	var route_margin := MarginContainer.new()
	route_margin.add_theme_constant_override("margin_left", 12)
	route_margin.add_theme_constant_override("margin_top", 10)
	route_margin.add_theme_constant_override("margin_right", 12)
	route_margin.add_theme_constant_override("margin_bottom", 10)
	route.add_child(route_margin)
	var route_col := VBoxContainer.new()
	route_col.add_theme_constant_override("separation", 8)
	route_margin.add_child(route_col)
	route_col.add_child(_make_context_label("承接路径", 15))
	var route_row := HBoxContainer.new()
	route_row.add_theme_constant_override("separation", 6)
	route_col.add_child(route_row)
	for line in ["地图节点", "对象组成", "焦点动作", "模板反馈"]:
		var chip := _make_context_action_button(line)
		chip.disabled = true
		chip.custom_minimum_size = Vector2(0.0, 40.0)
		chip.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		route_row.add_child(chip)
	return panel


func _build_context_general_strip() -> Control:
	var panel := _make_context_panel(Color(0.085, 0.080, 0.070, 0.88), Color(0.56, 0.43, 0.25, 0.68))
	panel.custom_minimum_size = Vector2(0.0, 116.0)
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 14)
	margin.add_theme_constant_override("margin_top", 10)
	margin.add_theme_constant_override("margin_right", 14)
	margin.add_theme_constant_override("margin_bottom", 10)
	panel.add_child(margin)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	margin.add_child(row)
	for general in PREVIEW_GENERALS:
		var card := _make_context_panel(Color(0.16, 0.125, 0.085, 0.94), Color(0.66, 0.50, 0.27, 0.72))
		card.custom_minimum_size = Vector2(128.0, 92.0)
		var col := VBoxContainer.new()
		col.add_theme_constant_override("separation", 3)
		card.add_child(col)
		var name_label := _make_context_label(str(general.get("name", "")), 15)
		name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		col.add_child(name_label)
		var role_label := _make_context_label(str(general.get("role", "")), 12)
		role_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		col.add_child(role_label)
		var meta_label := _make_context_label(str(general.get("meta", "")), 11, true)
		meta_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		col.add_child(meta_label)
		row.add_child(card)
	return panel


func _build_context_troop_view() -> Control:
	var split := HBoxContainer.new()
	split.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	split.size_flags_vertical = Control.SIZE_EXPAND_FILL
	split.add_theme_constant_override("separation", 12)

	var left_panel := _make_context_panel(Color(0.105, 0.100, 0.082, 0.90), Color(0.64, 0.48, 0.25, 0.70))
	left_panel.custom_minimum_size = Vector2(500.0, 0.0)
	split.add_child(left_panel)
	var left_margin := MarginContainer.new()
	left_margin.add_theme_constant_override("margin_left", 16)
	left_margin.add_theme_constant_override("margin_top", 14)
	left_margin.add_theme_constant_override("margin_right", 16)
	left_margin.add_theme_constant_override("margin_bottom", 14)
	left_panel.add_child(left_margin)
	var left := VBoxContainer.new()
	left.add_theme_constant_override("separation", 10)
	left_margin.add_child(left)
	left.add_child(_make_context_label("第一队 · 城门前编排", 19))
	left.add_child(_make_context_label("点击槽位后选择武将。这里只写入 UI 模板态，不触发真实上阵。", 12, true))
	for slot in [
		{"id": "camp", "label": "大营"},
		{"id": "mid", "label": "中军"},
		{"id": "front", "label": "前锋"},
	]:
		left.add_child(_build_slot_button(str(slot.get("id", "")), str(slot.get("label", ""))))
	var troop_button := _make_context_action_button("打开部队面板")
	troop_button.pressed.connect(Callable(self, "request_entry").bind("troop"))
	left.add_child(troop_button)

	var right := VBoxContainer.new()
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right.size_flags_vertical = Control.SIZE_EXPAND_FILL
	right.add_theme_constant_override("separation", 10)
	split.add_child(right)
	right.add_child(_make_context_label("可编入武将", 18))
	var hero_grid := GridContainer.new()
	hero_grid.columns = 2
	hero_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hero_grid.add_theme_constant_override("h_separation", 10)
	hero_grid.add_theme_constant_override("v_separation", 10)
	right.add_child(hero_grid)
	for general in PREVIEW_GENERALS:
		var general_id := str(general.get("id", ""))
		var button := Button.new()
		button.text = "%s\n%s" % [str(general.get("name", "")), str(general.get("meta", ""))]
		button.custom_minimum_size = Vector2(0.0, 76.0)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.add_theme_font_size_override("font_size", 14)
		button.pressed.connect(func() -> void:
			_assign_preview_general_to_slot(general_id)
			_select_context_tab("troop")
		)
		hero_grid.add_child(button)
	right.add_child(_build_troop_lane_preview())
	return split


func _build_slot_button(slot_id: String, label: String) -> Button:
	var button := Button.new()
	button.toggle_mode = true
	button.button_pressed = _active_slot_id == slot_id
	button.custom_minimum_size = Vector2(0.0, 82.0)
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var assigned_id := str(_formation_slots.get(slot_id, ""))
	var assigned := _find_preview_general(assigned_id)
	var assigned_text := "待编入"
	if not assigned.is_empty():
		assigned_text = "%s | %s" % [str(assigned.get("name", "")), str(assigned.get("meta", ""))]
	button.text = "%s\n%s" % [label, assigned_text]
	button.add_theme_font_size_override("font_size", 15)
	button.add_theme_stylebox_override("normal", _make_panel_style(Color(0.15, 0.13, 0.10, 0.96), Color(0.48, 0.38, 0.22, 0.82), 1))
	button.add_theme_stylebox_override("hover", _make_panel_style(Color(0.22, 0.17, 0.10, 0.98), Color(0.82, 0.62, 0.28, 0.92), 1))
	button.add_theme_stylebox_override("pressed", _make_panel_style(Color(0.32, 0.22, 0.11, 0.98), Color(1.00, 0.74, 0.32, 0.96), 2))
	button.pressed.connect(func() -> void:
		_active_slot_id = slot_id
		_select_context_tab("troop")
	)
	return button


func _build_context_facility_view() -> Control:
	var split := HBoxContainer.new()
	split.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	split.size_flags_vertical = Control.SIZE_EXPAND_FILL
	split.add_theme_constant_override("separation", 12)
	split.add_child(_build_facility_context_stage())
	var note := _make_context_panel(Color(0.090, 0.080, 0.066, 0.90), Color(0.56, 0.43, 0.24, 0.70))
	note.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	split.add_child(note)
	var note_margin := MarginContainer.new()
	note_margin.add_theme_constant_override("margin_left", 16)
	note_margin.add_theme_constant_override("margin_top", 14)
	note_margin.add_theme_constant_override("margin_right", 16)
	note_margin.add_theme_constant_override("margin_bottom", 14)
	note.add_child(note_margin)
	var note_col := VBoxContainer.new()
	note_col.add_theme_constant_override("separation", 10)
	note_margin.add_child(note_col)
	note_col.add_child(_make_context_label("设施说明", 18))
	note_col.add_child(_make_context_label("设施页现在先呈现主城内的设施组成，再从具体设施节点进入建筑树与升级模板反馈。当前只做 UI 模板链，不执行真实升级或征兵。", 13, true))
	note_col.add_child(_build_facility_status_cards())
	note_col.add_child(_build_facility_route_preview())
	var interior_button := _make_context_action_button("打开内政面板")
	interior_button.pressed.connect(Callable(self, "request_entry").bind("interior"))
	note_col.add_child(interior_button)
	return split


func _build_facility_context_stage() -> Control:
	var panel := _make_context_panel(Color(0.105, 0.115, 0.092, 0.91), Color(0.66, 0.50, 0.27, 0.76))
	panel.custom_minimum_size = Vector2(560.0, 0.0)
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 16)
	margin.add_theme_constant_override("margin_top", 14)
	margin.add_theme_constant_override("margin_right", 16)
	margin.add_theme_constant_override("margin_bottom", 14)
	panel.add_child(margin)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	margin.add_child(col)
	col.add_child(_make_context_label("主城设施组成 · %s已选中" % _active_facility_label(), 19))
	col.add_child(_make_context_label("先在城内选中设施对象，再进入建筑树和升级模板反馈；左侧节点与右侧模板单保持同一选中对象。", 12, true))
	col.add_child(_build_facility_city_core())

	var grid := GridContainer.new()
	grid.columns = 2
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 10)
	col.add_child(grid)
	for building in PREVIEW_BUILDINGS:
		var building_id := str(building.get("id", ""))
		var selected := building_id == _active_building_id
		var border := Color(0.62, 0.48, 0.27, 0.74)
		var border_width := 1
		if selected:
			border = Color(1.00, 0.74, 0.28, 0.98)
			border_width = 2
		var card := _make_context_panel(_facility_node_color(building_id), border)
		card.add_theme_stylebox_override("panel", _make_panel_style(_facility_node_color(building_id), border, border_width))
		card.custom_minimum_size = Vector2(0.0, 82.0)
		var card_margin := MarginContainer.new()
		card_margin.add_theme_constant_override("margin_left", 12)
		card_margin.add_theme_constant_override("margin_top", 10)
		card_margin.add_theme_constant_override("margin_right", 12)
		card_margin.add_theme_constant_override("margin_bottom", 10)
		card.add_child(card_margin)
		var card_col := VBoxContainer.new()
		card_col.add_theme_constant_override("separation", 4)
		card_margin.add_child(card_col)
		var selected_suffix := " · 选中" if selected else ""
		card_col.add_child(_make_context_label("%s · %s%s" % [str(building.get("label", "")), str(building.get("status", "")), selected_suffix], 15, true))
		card_col.add_child(_make_context_label(str(building.get("body", "")), 11, true))
		var button := _make_context_action_button("进入节点" if not selected else "查看模板反馈")
		button.pressed.connect(Callable(self, "_open_context_building_tree_for").bind(building_id))
		card_col.add_child(button)
		grid.add_child(card)
	return panel


func _build_facility_status_cards() -> Control:
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	for building in PREVIEW_BUILDINGS:
		var chip := _make_context_panel(Color(0.14, 0.12, 0.09, 0.90), Color(0.56, 0.43, 0.24, 0.68))
		chip.custom_minimum_size = Vector2(0.0, 42.0)
		var label := _make_context_label("%s  %s" % [str(building.get("label", "")), str(building.get("level", ""))], 11, true)
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		chip.add_child(label)
		grid.add_child(chip)
	return grid


func _open_context_building_tree_for(building_id: String) -> void:
	if not _find_preview_building(building_id).is_empty():
		_active_building_id = building_id
	_select_context_tab("building_tree")


func _build_context_building_tree_view() -> Control:
	var split := HBoxContainer.new()
	split.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	split.size_flags_vertical = Control.SIZE_EXPAND_FILL
	split.add_theme_constant_override("separation", 12)
	_building_tree = BUILDING_TREE_VIEW_SCENE.instantiate()
	_upgrade_sheet = BUILD_UPGRADE_SHEET_SCENE.instantiate()
	if _building_tree is Control:
		var tree_control := _building_tree as Control
		tree_control.custom_minimum_size = Vector2(330.0, 0.0)
		tree_control.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		tree_control.size_flags_vertical = Control.SIZE_EXPAND_FILL
	if _upgrade_sheet is Control:
		var sheet_control := _upgrade_sheet as Control
		sheet_control.custom_minimum_size = Vector2(350.0, 0.0)
		sheet_control.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		sheet_control.size_flags_vertical = Control.SIZE_EXPAND_FILL
	split.add_child(_build_facility_composition_stage())
	split.add_child(_building_tree)
	split.add_child(_upgrade_sheet)
	if _building_tree != null and _building_tree.has_method("set_tree_contract"):
		_building_tree.call("set_tree_contract", _build_context_tree_contract())
	if _upgrade_sheet != null and _upgrade_sheet.has_method("set_sheet_contract"):
		var initial_building := _find_preview_building(_active_building_id)
		if initial_building.is_empty():
			initial_building = PREVIEW_BUILDINGS[0]
			_active_building_id = str(initial_building.get("id", ""))
		_upgrade_sheet.call("set_sheet_contract", _build_context_sheet_contract(initial_building))
	if _building_tree != null and _building_tree.has_signal("building_selected"):
		var callback := func(building_id: String) -> void:
			_select_context_building_template(building_id)
		_building_tree.connect("building_selected", callback)
	return split


func _build_facility_composition_stage() -> Control:
	var stage := _make_context_panel(Color(0.13, 0.12, 0.09, 0.90), Color(0.72, 0.54, 0.28, 0.78))
	stage.custom_minimum_size = Vector2(380.0, 0.0)
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 14)
	margin.add_theme_constant_override("margin_top", 12)
	margin.add_theme_constant_override("margin_right", 14)
	margin.add_theme_constant_override("margin_bottom", 12)
	stage.add_child(margin)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	margin.add_child(col)
	col.add_child(_make_context_label("主城设施组成 · %s已选中" % _active_facility_label(), 18))
	col.add_child(_make_context_label("先看城内设施节点，再点选节点进入建筑树与升级模板反馈。当前选中对象会同步到左侧设施舞台、建筑树和右侧模板单。", 12, true))
	col.add_child(_build_facility_city_core())
	var node_grid := GridContainer.new()
	node_grid.columns = 2
	node_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	node_grid.add_theme_constant_override("h_separation", 8)
	node_grid.add_theme_constant_override("v_separation", 8)
	col.add_child(node_grid)
	for building in PREVIEW_BUILDINGS:
		var building_id := str(building.get("id", ""))
		var selected := building_id == _active_building_id
		var button := Button.new()
		button.focus_mode = Control.FOCUS_NONE
		button.custom_minimum_size = Vector2(0.0, 58.0)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.text = "%s\n%s%s" % [str(building.get("label", "")), str(building.get("status", "")), "\n选中" if selected else ""]
		button.add_theme_font_size_override("font_size", 13)
		var normal_border := Color(0.58, 0.44, 0.24, 0.72)
		var normal_width := 1
		if selected:
			normal_border = Color(1.00, 0.74, 0.28, 0.98)
			normal_width = 2
		button.add_theme_stylebox_override("normal", _make_panel_style(_facility_node_color(building_id), normal_border, normal_width))
		button.add_theme_stylebox_override("hover", _make_panel_style(Color(0.24, 0.17, 0.09, 0.98), Color(0.90, 0.66, 0.30, 0.96), 1))
		button.add_theme_stylebox_override("pressed", _make_panel_style(Color(0.34, 0.22, 0.10, 0.98), Color(1.00, 0.76, 0.32, 0.96), 2))
		button.pressed.connect(Callable(self, "_select_context_building_template").bind(building_id))
		node_grid.add_child(button)
	col.add_child(_build_facility_stage_footer())
	return stage


func _build_facility_city_core() -> Control:
	var core := _make_context_panel(Color(0.20, 0.19, 0.13, 0.92), Color(0.70, 0.54, 0.28, 0.76))
	core.custom_minimum_size = Vector2(0.0, 138.0)
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 12)
	margin.add_theme_constant_override("margin_top", 10)
	margin.add_theme_constant_override("margin_right", 12)
	margin.add_theme_constant_override("margin_bottom", 10)
	core.add_child(margin)
	var rows := VBoxContainer.new()
	rows.add_theme_constant_override("separation", 6)
	margin.add_child(rows)
	rows.add_child(_build_facility_stage_row(["城门", "校场", "募兵所"]))
	rows.add_child(_build_facility_stage_row(["市井", "主府", "统帅厅"]))
	rows.add_child(_build_facility_stage_row(["仓廪", "道路", "巡防"]))
	return core


func _build_facility_stage_row(labels: Array) -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	for label_variant in labels:
		var label_text := str(label_variant)
		var building_id := _facility_label_to_building_id(label_text)
		var selected := building_id != "" and building_id == _active_building_id
		var tile_color := _facility_node_color(building_id) if building_id != "" else _city_tile_color(label_text)
		var border := Color(0.64, 0.49, 0.27, 0.72)
		var border_width := 1
		if selected:
			border = Color(1.00, 0.74, 0.28, 0.98)
			border_width = 2
		var tile := _make_context_panel(tile_color, border)
		tile.add_theme_stylebox_override("panel", _make_panel_style(tile_color, border, border_width))
		tile.custom_minimum_size = Vector2(0.0, 34.0)
		tile.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var label := _make_context_label(label_text if not selected else "%s\n选中" % label_text, 12)
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		tile.add_child(label)
		row.add_child(tile)
	return row


func _build_facility_stage_footer() -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	for item in ["%s节点" % _active_facility_label(), "建筑树", "模板反馈"]:
		var chip := _make_context_panel(Color(0.16, 0.13, 0.09, 0.92), Color(0.58, 0.44, 0.24, 0.72))
		chip.custom_minimum_size = Vector2(0.0, 30.0)
		chip.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var label := _make_context_label(item, 12)
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		chip.add_child(label)
		row.add_child(chip)
	return row


func _facility_node_color(building_id: String) -> Color:
	if building_id == _active_building_id:
		return Color(0.30, 0.20, 0.09, 0.98)
	if building_id == "drill_ground":
		return Color(0.18, 0.22, 0.14, 0.94)
	if building_id == "barracks":
		return Color(0.23, 0.16, 0.10, 0.94)
	if building_id == "command_hall":
		return Color(0.18, 0.16, 0.12, 0.94)
	return Color(0.20, 0.17, 0.10, 0.94)


func _facility_label_to_building_id(label: String) -> String:
	match label:
		"校场":
			return "drill_ground"
		"募兵所":
			return "barracks"
		"统帅厅":
			return "command_hall"
		"市井":
			return "market_plaza"
		_:
			return ""


func _active_facility_label() -> String:
	var selected := _find_preview_building(_active_building_id)
	if selected.is_empty():
		return "设施"
	return str(selected.get("label", "设施"))


func _build_city_stage() -> Control:
	var stage := _make_context_panel(Color(0.20, 0.22, 0.16, 0.74), Color(0.70, 0.55, 0.30, 0.74))
	stage.custom_minimum_size = Vector2(0.0, 270.0)
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 14)
	margin.add_theme_constant_override("margin_top", 12)
	margin.add_theme_constant_override("margin_right", 14)
	margin.add_theme_constant_override("margin_bottom", 12)
	stage.add_child(margin)
	var rows := VBoxContainer.new()
	rows.add_theme_constant_override("separation", 8)
	margin.add_child(rows)
	rows.add_child(_build_city_wall_row(["城门", "城墙", "府署", "城墙", "烽台"]))
	rows.add_child(_build_city_wall_row(["市井", "校场", "主府", "募兵所", "仓廪"]))
	rows.add_child(_build_city_wall_row(["民居", "练武场", "道路", "统帅厅", "工坊"]))
	rows.add_child(_build_city_wall_row(["农田", "驿道", "巡防", "木场", "石仓"]))
	return stage


func _build_city_wall_row(labels: Array) -> Control:
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 8)
	for label_variant in labels:
		var label := str(label_variant)
		var selected := label == "主府"
		var border := Color(0.68, 0.53, 0.30, 0.68)
		var border_width := 1
		if selected:
			border = Color(1.0, 0.74, 0.28, 0.98)
			border_width = 2
		var tile := _make_context_panel(_city_tile_color(label), border)
		tile.add_theme_stylebox_override("panel", _make_panel_style(_city_tile_color(label), border, border_width))
		tile.custom_minimum_size = Vector2(0.0, 48.0)
		tile.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var tile_label := _make_context_label(label if not selected else "主府\n选中", 15)
		tile_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		tile_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		tile.add_child(tile_label)
		row.add_child(tile)
	return row


func _city_tile_color(label: String) -> Color:
	if label == "主府":
		return Color(0.44, 0.27, 0.09, 0.98)
	if ["主府", "府署", "统帅厅"].has(label):
		return Color(0.34, 0.22, 0.11, 0.94)
	if ["校场", "募兵所", "练武场", "巡防"].has(label):
		return Color(0.16, 0.22, 0.15, 0.92)
	if ["市井", "仓廪", "工坊", "驿道"].has(label):
		return Color(0.25, 0.18, 0.10, 0.92)
	return Color(0.18, 0.19, 0.14, 0.90)


func _build_city_status_row() -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	for item in ["城防 82", "队列 3/5", "设施 4", "模板态"]:
		var chip := _make_context_panel(Color(0.14, 0.12, 0.09, 0.90), Color(0.58, 0.44, 0.24, 0.70))
		chip.custom_minimum_size = Vector2(0.0, 34.0)
		chip.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var label := _make_context_label(item, 12)
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		chip.add_child(label)
		row.add_child(chip)
	return row


func _build_city_object_action_strip() -> Control:
	var panel := _make_context_panel(Color(0.13, 0.105, 0.075, 0.92), Color(0.66, 0.50, 0.27, 0.76))
	panel.custom_minimum_size = Vector2(0.0, 92.0)
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 12)
	margin.add_theme_constant_override("margin_top", 10)
	margin.add_theme_constant_override("margin_right", 12)
	margin.add_theme_constant_override("margin_bottom", 10)
	panel.add_child(margin)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	margin.add_child(row)

	var focus := _make_context_action_button("当前焦点\n主府 · 城内中轴")
	focus.disabled = true
	focus.custom_minimum_size = Vector2(172.0, 70.0)
	row.add_child(focus)

	var actions := GridContainer.new()
	actions.columns = 4
	actions.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	actions.add_theme_constant_override("h_separation", 8)
	actions.add_theme_constant_override("v_separation", 8)
	row.add_child(actions)
	var entries := [
		{"label": "校场", "building": "drill_ground"},
		{"label": "募兵所", "building": "barracks"},
		{"label": "统帅厅", "building": "command_hall"},
		{"label": "市井", "building": "market_plaza"},
		{"label": "部队编排", "tab": "troop"},
		{"label": "设施总览", "tab": "facility"},
		{"label": "建筑树", "tab": "building_tree"},
		{"label": "内政", "entry": "interior"},
	]
	for entry in entries:
		var button := _make_context_action_button(str(entry.get("label", "")))
		button.custom_minimum_size = Vector2(0.0, 28.0)
		if str(entry.get("building", "")) != "":
			button.pressed.connect(Callable(self, "_open_context_building_tree_for").bind(str(entry.get("building", ""))))
		elif str(entry.get("entry", "")) != "":
			button.pressed.connect(Callable(self, "request_entry").bind(str(entry.get("entry", ""))))
		else:
			var tab_id := str(entry.get("tab", "overview"))
			button.pressed.connect(func() -> void:
				_select_context_tab(tab_id)
			)
		actions.add_child(button)
	return panel


func _build_troop_lane_preview() -> Control:
	var panel := _make_context_panel(Color(0.105, 0.095, 0.078, 0.90), Color(0.58, 0.44, 0.25, 0.70))
	panel.custom_minimum_size = Vector2(0.0, 144.0)
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 14)
	margin.add_theme_constant_override("margin_top", 10)
	margin.add_theme_constant_override("margin_right", 14)
	margin.add_theme_constant_override("margin_bottom", 10)
	panel.add_child(margin)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	margin.add_child(col)
	col.add_child(_make_context_label("城门集结线", 15))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	col.add_child(row)
	for item in ["前锋", "中军", "大营", "预备"]:
		var lane := _make_context_panel(Color(0.16, 0.14, 0.10, 0.92), Color(0.62, 0.48, 0.27, 0.72))
		lane.custom_minimum_size = Vector2(0.0, 58.0)
		lane.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var label := _make_context_label(item, 13)
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		lane.add_child(label)
		row.add_child(lane)
	return panel


func _build_facility_route_preview() -> Control:
	var panel := _make_context_panel(Color(0.14, 0.12, 0.09, 0.88), Color(0.60, 0.46, 0.25, 0.70))
	panel.custom_minimum_size = Vector2(0.0, 170.0)
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 14)
	margin.add_theme_constant_override("margin_top", 12)
	margin.add_theme_constant_override("margin_right", 14)
	margin.add_theme_constant_override("margin_bottom", 12)
	panel.add_child(margin)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	margin.add_child(col)
	for item in ["主城节点", "设施入口", "建筑树", "升级模板反馈"]:
		var row := _make_context_panel(Color(0.19, 0.15, 0.10, 0.92), Color(0.66, 0.50, 0.27, 0.72))
		row.custom_minimum_size = Vector2(0.0, 30.0)
		var label := _make_context_label(item, 12)
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		row.add_child(label)
		col.add_child(row)
	return panel


func _build_context_tree_contract() -> Dictionary:
	var items: Array = []
	for building in PREVIEW_BUILDINGS:
		items.append({
			"id": str(building.get("id", "")),
			"label": str(building.get("label", "")),
			"meta": str(building.get("level", "")),
			"statusText": str(building.get("status", "")),
			"body": str(building.get("body", "")),
			"cost": str(building.get("cost", "")),
			"effect": str(building.get("effect", "")),
		})
	return {
		"title": "主城设施建筑树",
		"state_badge": "模板态",
		"tree_items": items,
		"selected_building_id": str(PREVIEW_BUILDINGS[0].get("id", "")),
		"empty_state_text": "等待设施建筑树数据。",
	}


func _build_context_sheet_contract(building: Dictionary) -> Dictionary:
	return {
		"title": "%s升级单" % str(building.get("label", "设施")),
		"subtitle": "来自主城设施节点的模板反馈，不请求后端。",
		"body": "%s\n\n对象链：主城设施组成 -> %s节点 -> 建筑树 -> 模板/排队态反馈。\n点击确认只显示反馈，不请求后端，不扣资源。" % [str(building.get("body", "")), str(building.get("label", "设施"))],
		"cost_summary": str(building.get("cost", "消耗：--")),
		"effect_summary": str(building.get("effect", "效果：--")),
		"primary_action_label": "加入模板队列",
		"secondary_action_label": "稍后处理",
		"close_button_label": "关闭",
		"has_payload": true,
	}


func _find_preview_general(general_id: String) -> Dictionary:
	for item in PREVIEW_GENERALS:
		var general: Dictionary = item as Dictionary
		if str(general.get("id", "")) == general_id:
			return general
	return {}


func _find_preview_building(building_id: String) -> Dictionary:
	for item in PREVIEW_BUILDINGS:
		var building: Dictionary = item as Dictionary
		if str(building.get("id", "")) == building_id:
			return building
	return {}


func _select_context_building_template(building_id: String) -> void:
	var selected := _find_preview_building(building_id)
	if selected.is_empty():
		return
	_active_building_id = building_id
	if _active_context_tab == "building_tree" and _context_content_host != null:
		_select_context_tab("building_tree")
	elif _upgrade_sheet != null and _upgrade_sheet.has_method("set_sheet_contract"):
		_upgrade_sheet.call("set_sheet_contract", _build_context_sheet_contract(selected))


func _assign_preview_general_to_slot(general_id: String) -> void:
	var target_slot := _active_slot_id
	if str(_formation_slots.get(target_slot, "")) != "":
		for slot_id in ["camp", "mid", "front"]:
			if str(_formation_slots.get(slot_id, "")) == "":
				target_slot = slot_id
				break
	_formation_slots[target_slot] = general_id
	_active_slot_id = target_slot


func _template_assignment_count() -> int:
	var count := 0
	for slot_id in _formation_slots.keys():
		if str(_formation_slots.get(slot_id, "")) != "":
			count += 1
	return count


func _play_context_panel_intro() -> void:
	if _context_panel == null:
		return
	_context_panel.pivot_offset = CONTEXT_PANEL_SIZE * 0.5
	_context_panel.modulate = Color(1.0, 1.0, 1.0, 0.0)
	_context_panel.scale = Vector2(0.965, 0.965)
	var tween := create_tween()
	tween.set_parallel(true)
	tween.tween_property(_context_panel, "modulate:a", 1.0, 0.18).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(_context_panel, "scale", Vector2.ONE, 0.20).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)


func _on_hub_button_pressed() -> void:
	set_expanded(not _expanded)


func _on_map_view_transform_changed(_view_state: Dictionary) -> void:
	_update_position()


func _update_position() -> void:
	if _hub_panel == null:
		return
	var anchor_position := _resolve_anchor_position()
	var hub_position := anchor_position + HUB_OFFSET - HUB_SIZE * 0.5
	_hub_panel.position = _clamp_panel_position(hub_position, HUB_SIZE)
	if _entry_panel != null:
		var entry_position := _hub_panel.position + Vector2(-24.0, HUB_SIZE.y + 8.0)
		_entry_panel.position = _clamp_panel_position(entry_position, _entry_panel.custom_minimum_size)
	if _context_panel != null:
		var viewport_size := get_viewport_rect().size
		var context_size := _context_panel.custom_minimum_size
		_context_panel.position = Vector2(
			max(18.0, (viewport_size.x - context_size.x) * 0.5),
			max(76.0, viewport_size.y - context_size.y - CONTEXT_PANEL_BOTTOM_MARGIN)
		)


func _resolve_anchor_position() -> Vector2:
	if _map_grid == null or not is_instance_valid(_map_grid):
		return FALLBACK_SCREEN_POSITION
	var tile_id := str(_context.get("tileId", "")).strip_edges()
	var tile_x := int(_context.get("tileX", -1))
	var tile_y := int(_context.get("tileY", -1))
	if tile_id != "" and _map_grid.has_method("tile_id_to_screen_position"):
		return _map_grid.call("tile_id_to_screen_position", tile_id, maxi(tile_x, 0), maxi(tile_y, 0))
	if tile_x >= 0 and tile_y >= 0 and _map_grid.has_method("tile_to_screen_position"):
		return _map_grid.call("tile_to_screen_position", tile_x, tile_y)
	return FALLBACK_SCREEN_POSITION


func _clamp_panel_position(panel_position: Vector2, panel_size: Vector2) -> Vector2:
	var viewport_size := get_viewport_rect().size
	var margin := 12.0
	return Vector2(
		clampf(panel_position.x, margin, max(margin, viewport_size.x - panel_size.x - margin)),
		clampf(panel_position.y, margin, max(margin, viewport_size.y - panel_size.y - margin))
	)


func _build_tooltip() -> String:
	var title := str(_context.get("title", "主城中枢")).strip_edges()
	var tile_id := str(_context.get("tileId", "")).strip_edges()
	var status := str(_context.get("status", "")).strip_edges()
	var parts: Array[String] = [title]
	if tile_id != "":
		parts.append("地块 %s" % tile_id)
	if status != "":
		parts.append(status)
	return " | ".join(parts)
