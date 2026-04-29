extends "res://scripts/ui/slg_snapshot_panel.gd"
class_name GeneralPanel

const BG_PANEL := Color(0.055, 0.052, 0.047, 0.62)
const BG_PANEL_ALT := Color(0.080, 0.072, 0.060, 0.58)
const BG_DATA := Color(0.025, 0.024, 0.021, 0.56)
const BG_ROW := Color(0.090, 0.083, 0.072, 0.58)
const BG_ROW_ACTIVE := Color(0.16, 0.115, 0.065, 0.72)
const BORDER := Color(0.42, 0.34, 0.18, 0.52)
const BORDER_ACTIVE := Color(0.92, 0.67, 0.24, 0.92)
const BORDER_DATA := Color(0.36, 0.29, 0.15, 0.28)
const TEXT_MAIN := Color(0.94, 0.91, 0.84, 1.0)
const TEXT_MUTED := Color(0.70, 0.67, 0.58, 1.0)
const TEXT_GOLD := Color(0.95, 0.72, 0.32, 1.0)
const TEXT_RED := Color(0.83, 0.30, 0.22, 1.0)
const TEXT_GREEN := Color(0.42, 0.72, 0.42, 1.0)
const TEXT_BLUE := Color(0.42, 0.58, 0.78, 1.0)
const MOBILE_BACK_BUTTON_SIZE := Vector2(172, 72)
const MOBILE_CLOSE_BUTTON_SIZE := Vector2(112, 52)
const MOBILE_HEADER_BUTTON_FONT_SIZE := 24
const MOBILE_CLOSE_BUTTON_FONT_SIZE := 22
const MOBILE_PROFILE_TAB_FONT_SIZE := 20
const TROOP_SCENE_INFANTRY := "res://assets/themes/slgclient/current/units/generated_troops/models/infantry_troop.glb"
const TROOP_SCENE_ARCHER := "res://assets/themes/slgclient/current/units/generated_troops/models/archer_troop.glb"
const TROOP_SCENE_CAVALRY := "res://assets/themes/slgclient/current/units/generated_troops/models/cavalry_troop.glb"
const TROOP_MODEL_INFANTRY := "res://assets/themes/slgclient/current/units/generated_troops/renders/ui/infantry_troop_ui.png"
const TROOP_MODEL_ARCHER := "res://assets/themes/slgclient/current/units/generated_troops/renders/ui/archer_troop_ui.png"
const TROOP_MODEL_CAVALRY := "res://assets/themes/slgclient/current/units/generated_troops/renders/ui/cavalry_troop_ui.png"
const TROOP_ILLUSTRATION_INFANTRY := "res://assets/themes/slgclient/current/units/generated_troops/illustrations/foreground/infantry_unit_fg.png"
const TROOP_ILLUSTRATION_ARCHER := "res://assets/themes/slgclient/current/units/generated_troops/illustrations/foreground/archer_unit_fg.png"
const TROOP_ILLUSTRATION_CAVALRY := "res://assets/themes/slgclient/current/units/generated_troops/illustrations/foreground/cavalry_unit_fg.png"
const TROOP_ILLUSTRATION_TRAP_CAMP := "res://assets/themes/slgclient/current/units/generated_troops/illustrations/foreground/xianzhenying_unit_fg.png"
const TROOP_ILLUSTRATION_REPEATING_CROSSBOW := "res://assets/themes/slgclient/current/units/generated_troops/illustrations/foreground/zhuge_repeating_crossbow_fg.png"
const TROOP_ILLUSTRATION_TIGER_LEOPARD := "res://assets/themes/slgclient/current/units/generated_troops/illustrations/foreground/tiger_leopard_cavalry_fg.png"
const TROOP_ILLUSTRATION_WHITE_HORSE := "res://assets/themes/slgclient/current/units/generated_troops/illustrations/foreground/white_horse_cavalry_fg.png"
const SKILL_TYPE_ICON_COMMAND := "res://assets/themes/slgclient/current/ui/skill/skill_type_command.svg"
const SKILL_TYPE_ICON_PASSIVE := "res://assets/themes/slgclient/current/ui/skill/skill_type_passive.svg"
const SKILL_TYPE_ICON_ACTIVE := "res://assets/themes/slgclient/current/ui/skill/skill_type_active.svg"
const SKILL_TYPE_ICON_CHASE := "res://assets/themes/slgclient/current/ui/skill/skill_type_chase.svg"

var _skill_detail_dialog: PanelContainer = null
var _skill_library_grade_filter := "全部"
var _skill_library_type_filter := "全部"
var _skill_library_troop_filter := "全部"
var _skill_library_tag_filter := "全部"
var _skill_library_source_filter := "全部"
var _skill_library_search_text := ""
var _skill_library_sort_mode := "品质"
var _skill_library_source_filter_expanded := false
var _skill_library_tag_filter_expanded := false
var _troop_preview_variant_index := 0
var _troop_preview_slide_direction := 0

func _init() -> void:
	panel_title = "武将"
	panel_subtitle = "总览 / 详情 / 配点 / 战法库 / 兵种"
	panel_empty_state_text = "等待武将域数据。"

func set_general_snapshot(snapshot: Dictionary) -> void:
	_snapshot = snapshot.duplicate(true)
	_load_skill_library_ui_state()
	if _active_page_id == "" or not _snapshot_has_page(_active_page_id):
		_active_page_id = _resolve_default_page_id()
	_refresh_panel()

func _refresh_panel() -> void:
	if _panel_host == null or not is_instance_valid(_panel_host):
		return
	if _active_page_id == "":
		_active_page_id = _resolve_default_page_id()
	_panel_host.call("set_panel_title", str(_snapshot.get("title", panel_title)))
	_panel_host.call("set_back_button_label", "返回主壳")
	_panel_host.call("set_close_button_label", "关闭")
	_panel_host.call("set_empty_state_text", str(_snapshot.get("empty_state_text", panel_empty_state_text)))
	_panel_host.call("set_tabs", [])
	if _panel_host.has_method("set_header_visible"):
		_panel_host.call("set_header_visible", false)
	if _panel_host.has_method("set_body_margins"):
		_panel_host.call("set_body_margins", 0, 0, 0, 0)
	if _panel_host.has_method("set_content_margins"):
		_panel_host.call("set_content_margins", 0, 0, 0, 0)
	if _panel_host.has_method("set_content_frame_transparent"):
		_panel_host.call("set_content_frame_transparent", true)
	if _active_page_id != "":
		_panel_host.call("set_active_tab", _active_page_id)
	if _active_page_id == "roster":
		_panel_host.call("set_content_node", _build_roster_page())
		return
	if _active_page_id == "profile" or _active_page_id == "tactics" or _active_page_id == "library" or _active_page_id == "growth":
		_panel_host.call("set_content_node", _build_profile_page(_active_page_id))
		return
	super._refresh_panel()

func _build_roster_page() -> Control:
	var scroll := ScrollContainer.new()
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var root := MarginContainer.new()
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_theme_constant_override("margin_left", 24)
	root.add_theme_constant_override("margin_top", 18)
	root.add_theme_constant_override("margin_right", 24)
	root.add_theme_constant_override("margin_bottom", 18)
	scroll.add_child(root)

	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 10)
	root.add_child(column)

	column.add_child(_build_profile_tab_strip("roster"))
	column.add_child(_build_filter_bar())

	var body := HBoxContainer.new()
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 18)
	column.add_child(body)
	body.add_child(_build_roster_list_panel())
	body.add_child(_build_roster_preview_panel())
	return scroll

func _build_profile_page(page_id: String = "profile") -> Control:
	var root := Control.new()
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var entry := _active_entry()

	var stage := _build_profile_hero_stage(entry)
	stage.set_anchors_preset(Control.PRESET_FULL_RECT)
	stage.offset_left = 0.0
	stage.offset_top = 0.0
	stage.offset_right = 0.0
	stage.offset_bottom = 0.0
	root.add_child(stage)

	var shade := ColorRect.new()
	shade.color = Color(0.0, 0.0, 0.0, 0.05)
	shade.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_child(shade)
	root.add_child(_build_stage_to_panel_gradient())

	var detail_stack := _build_profile_detail_stack(entry, page_id)
	detail_stack.anchor_left = 0.50
	detail_stack.anchor_top = 0.025
	detail_stack.anchor_right = 1.0
	detail_stack.anchor_bottom = 1.0
	detail_stack.offset_left = 0.0
	detail_stack.offset_top = 0.0
	detail_stack.offset_right = -12.0
	detail_stack.offset_bottom = -8.0
	root.add_child(detail_stack)

	var overlay_controls := _build_profile_overlay_controls()
	overlay_controls.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_child(overlay_controls)
	return root

func _build_stage_to_panel_gradient() -> Control:
	var texture := GradientTexture1D.new()
	texture.width = 1024
	var gradient := Gradient.new()
	gradient.offsets = PackedFloat32Array([0.0, 0.38, 0.76, 1.0])
	gradient.colors = PackedColorArray([
		Color(0.0, 0.0, 0.0, 0.0),
		Color(0.0, 0.0, 0.0, 0.10),
		Color(0.0, 0.0, 0.0, 0.42),
		Color(0.0, 0.0, 0.0, 0.68),
	])
	texture.gradient = gradient
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	var rect := TextureRect.new()
	rect.texture = texture
	rect.stretch_mode = TextureRect.STRETCH_SCALE
	rect.anchor_left = 0.26
	rect.anchor_top = 0.0
	rect.anchor_right = 0.60
	rect.anchor_bottom = 1.0
	rect.offset_left = 0.0
	rect.offset_top = 0.0
	rect.offset_right = 0.0
	rect.offset_bottom = 0.0
	root.add_child(rect)
	var right_backdrop := ColorRect.new()
	right_backdrop.color = Color(0.0, 0.0, 0.0, 0.66)
	right_backdrop.anchor_left = 0.60
	right_backdrop.anchor_top = 0.0
	right_backdrop.anchor_right = 1.0
	right_backdrop.anchor_bottom = 1.0
	root.add_child(right_backdrop)
	return root

func _build_profile_overlay_controls() -> Control:
	var root := Control.new()
	var back_button := Button.new()
	back_button.name = "BackButton"
	back_button.text = "返回"
	back_button.custom_minimum_size = MOBILE_BACK_BUTTON_SIZE
	back_button.position = Vector2(16, 12)
	back_button.add_theme_font_size_override("font_size", MOBILE_HEADER_BUTTON_FONT_SIZE)
	_apply_button_style(back_button, Color(0.0, 0.0, 0.0, 0.34), Color(TEXT_GOLD.r, TEXT_GOLD.g, TEXT_GOLD.b, 0.48), TEXT_MAIN)
	back_button.pressed.connect(func() -> void:
		back_requested.emit()
	)
	root.add_child(back_button)
	return root

func _build_profile_chrome_bar() -> Control:
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 10)
	var back_button := Button.new()
	back_button.name = "BackButton"
	back_button.text = "返回"
	back_button.custom_minimum_size = MOBILE_BACK_BUTTON_SIZE
	back_button.add_theme_font_size_override("font_size", MOBILE_HEADER_BUTTON_FONT_SIZE)
	_apply_button_style(back_button, BG_PANEL, BORDER, TEXT_MAIN)
	back_button.pressed.connect(func() -> void:
		back_requested.emit()
	)
	row.add_child(back_button)
	var title := _label("武将详情", 21, TEXT_GOLD)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(title)
	var protect_label := _label("未保护", 16, TEXT_MUTED, HORIZONTAL_ALIGNMENT_RIGHT)
	protect_label.custom_minimum_size = Vector2(120, 0)
	row.add_child(protect_label)
	var close_button := Button.new()
	close_button.name = "CloseButton"
	close_button.text = "关闭"
	close_button.custom_minimum_size = MOBILE_CLOSE_BUTTON_SIZE
	close_button.add_theme_font_size_override("font_size", MOBILE_CLOSE_BUTTON_FONT_SIZE)
	_apply_button_style(close_button, Color(0.18, 0.08, 0.08, 0.78), Color(0.36, 0.12, 0.12, 0.9), TEXT_RED)
	close_button.pressed.connect(func() -> void:
		close_requested.emit()
	)
	row.add_child(close_button)
	return row

func _build_filter_bar() -> Control:
	var filters: Dictionary = _shared_state().get("roster_filter_summary", {}) as Dictionary
	var panel := _panel(BG_PANEL, BORDER, 5)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(10, 8, 10, 8)
	panel.add_child(margin)
	var row := HFlowContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("h_separation", 8)
	row.add_theme_constant_override("v_separation", 6)
	margin.add_child(row)
	row.add_child(_chip("全部 %s" % str(filters.get("total", 0)), TEXT_GOLD))
	row.add_child(_chip("已编 %s" % str(filters.get("deployed", 0)), TEXT_GREEN))
	row.add_child(_chip("预备 %s" % str(filters.get("reserve", 0)), TEXT_BLUE))
	row.add_child(_chip("骑 %s" % str(filters.get("cavalry", 0)), Color(0.72, 0.48, 0.26, 1.0)))
	row.add_child(_chip("步 %s" % str(filters.get("infantry", 0)), Color(0.62, 0.64, 0.45, 1.0)))
	row.add_child(_chip("弓 %s" % str(filters.get("ranged", 0)), Color(0.46, 0.62, 0.66, 1.0)))
	row.add_child(_chip("最高战力 %s" % str(filters.get("max_power", 0)), TEXT_RED))
	return panel

func _build_roster_selector(active_entry: Dictionary) -> Control:
	var panel := _panel(BG_PANEL, BORDER, 5)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(10, 8, 10, 8)
	panel.add_child(margin)
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 8)
	margin.add_child(row)
	row.add_child(_action_button("上一位", "hero_prev"))
	var flow := HFlowContainer.new()
	flow.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	flow.add_theme_constant_override("h_separation", 6)
	flow.add_theme_constant_override("v_separation", 4)
	row.add_child(flow)
	var entries := _roster_entries()
	if entries.is_empty():
		flow.add_child(_mini_chip("暂无武将"))
	else:
		for entry_variant in entries:
			if entry_variant is Dictionary:
				flow.add_child(_build_roster_selector_button(entry_variant as Dictionary))
	row.add_child(_action_button("下一位", "hero_next"))
	var current_line := "%s  %s  Lv.%s" % [
		str(active_entry.get("display_name", "待补位")),
		str(active_entry.get("star_text", "")),
		str(active_entry.get("level", 1)),
	]
	var current_label := _label(current_line, 13, TEXT_GOLD, HORIZONTAL_ALIGNMENT_RIGHT)
	current_label.custom_minimum_size = Vector2(220, 0)
	row.add_child(current_label)
	return panel

func _build_roster_selector_button(entry: Dictionary) -> Button:
	var button := Button.new()
	var name_text := str(entry.get("display_name", "待补位"))
	var is_active := bool(entry.get("is_active", false))
	button.text = "%s  Lv.%s" % [name_text, str(entry.get("level", 1))]
	button.custom_minimum_size = Vector2(116, 34)
	button.disabled = is_active
	_apply_button_style(button, BG_ROW_ACTIVE if is_active else BG_ROW, BORDER_ACTIVE if is_active else BORDER, TEXT_GOLD if is_active else TEXT_MAIN)
	button.pressed.connect(Callable(self, "_on_general_action_pressed").bind(str(entry.get("action_id", ""))))
	return button

func _build_roster_list_panel() -> Control:
	var panel := _panel(BG_PANEL, BORDER, 5)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	panel.custom_minimum_size = Vector2(760, 540)
	var margin := _margin(12, 12, 12, 12)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 8)
	margin.add_child(column)
	column.add_child(_label("武将列表", 18, TEXT_GOLD))
	column.add_child(_label("头像 / 品质 / 等级 / 兵种 / 战力 / 状态", 12, TEXT_MUTED))
	var list := VBoxContainer.new()
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list.add_theme_constant_override("separation", 8)
	column.add_child(list)
	var entries := _roster_entries()
	if entries.is_empty():
		list.add_child(_empty_panel("暂无武将", "等待招募结果写入 roster。"))
		return panel
	for entry_variant in entries:
		if entry_variant is Dictionary:
			list.add_child(_build_roster_row(entry_variant as Dictionary))
	return panel

func _build_roster_row(entry: Dictionary) -> Control:
	var active := bool(entry.get("is_active", false))
	var panel := _panel(BG_ROW_ACTIVE if active else BG_ROW, BORDER_ACTIVE if active else BORDER, 4)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.custom_minimum_size = Vector2(0, 104)
	var margin := _margin(8, 8, 8, 8)
	panel.add_child(margin)
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 10)
	margin.add_child(row)
	row.add_child(_build_portrait_frame(entry, Vector2(72, 88)))

	var identity := VBoxContainer.new()
	identity.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	identity.add_theme_constant_override("separation", 4)
	row.add_child(identity)
	var name_row := HBoxContainer.new()
	name_row.add_theme_constant_override("separation", 6)
	identity.add_child(name_row)
	name_row.add_child(_label(str(entry.get("display_name", "待补位")), 18, TEXT_MAIN))
	name_row.add_child(_label(str(entry.get("rarity_label", "N")), 13, TEXT_GOLD))
	name_row.add_child(_label("Lv.%s" % str(entry.get("level", 1)), 13, TEXT_MUTED))
	identity.add_child(_label(str(entry.get("title", "")), 12, TEXT_MUTED))
	var tag_row := HFlowContainer.new()
	tag_row.add_theme_constant_override("h_separation", 5)
	tag_row.add_theme_constant_override("v_separation", 4)
	identity.add_child(tag_row)
	for tag in _string_array(entry.get("traits", [])).slice(0, 3):
		tag_row.add_child(_mini_chip(str(tag)))

	row.add_child(_build_roster_stat_strip(entry))

	var status_col := VBoxContainer.new()
	status_col.custom_minimum_size = Vector2(150, 0)
	status_col.add_theme_constant_override("separation", 4)
	row.add_child(status_col)
	status_col.add_child(_label("战力 %s" % str(entry.get("power", 0)), 17, TEXT_GOLD))
	status_col.add_child(_label(str(entry.get("status_label", "待命")), 12, TEXT_GREEN if bool(entry.get("deployed", false)) else TEXT_BLUE))
	status_col.add_child(_label(str(entry.get("troop_type_label", "待定")), 12, TEXT_MUTED))

	var button := Button.new()
	button.name = "OpenHeroProfileButton_%s" % str(entry.get("id", ""))
	button.text = "详情"
	button.custom_minimum_size = Vector2(72, 38)
	button.pressed.connect(Callable(self, "_on_general_action_pressed").bind("open_hero_profile:%s" % str(entry.get("id", ""))))
	row.add_child(button)
	return panel

func _build_roster_stat_strip(entry: Dictionary) -> Control:
	var grid := GridContainer.new()
	grid.columns = 4
	grid.custom_minimum_size = Vector2(216, 0)
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 3)
	var stats := [
		["武", "force", TEXT_RED],
		["统", "command", TEXT_GOLD],
		["智", "intelligence", TEXT_BLUE],
		["速", "speed", TEXT_GREEN],
	]
	for spec in stats:
		var column := VBoxContainer.new()
		column.add_theme_constant_override("separation", 1)
		column.add_child(_label(str(spec[0]), 11, TEXT_MUTED, HORIZONTAL_ALIGNMENT_CENTER))
		column.add_child(_label(str(entry.get(str(spec[1]), 0)), 15, spec[2], HORIZONTAL_ALIGNMENT_CENTER))
		grid.add_child(column)
	return grid

func _build_roster_preview_panel() -> Control:
	var entry := _active_entry()
	var panel := _panel(BG_PANEL_ALT, BORDER, 5)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	panel.custom_minimum_size = Vector2(430, 540)
	var margin := _margin(14, 14, 14, 14)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 10)
	margin.add_child(column)
	column.add_child(_build_detail_header(entry, false))
	column.add_child(_build_compact_stat_grid(entry))
	column.add_child(_build_skill_block(entry))
	column.add_child(_build_troop_block(entry))
	column.add_child(_build_action_row(entry))
	return panel

func _build_profile_hero_stage(entry: Dictionary) -> Control:
	var stage := Control.new()
	stage.custom_minimum_size = Vector2(0, 0)
	stage.size_flags_vertical = Control.SIZE_EXPAND_FILL
	stage.clip_contents = true

	var frame := _panel(Color(0.045, 0.042, 0.036, 0.94), Color(0.0, 0.0, 0.0, 0.0), 0)
	frame.set_anchors_preset(Control.PRESET_FULL_RECT)
	stage.add_child(frame)

	var texture := _load_portrait_texture(str(entry.get("portrait_path", "")))
	if texture != null:
		var image := TextureRect.new()
		image.texture = texture
		# 画像多为 1122x1402 的偏竖构图；这里优先保住衣冠、手臂等边缘细节，不做 cover 裁切。
		image.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		image.anchor_left = 0.0
		image.anchor_top = 0.0
		image.anchor_right = 0.50
		image.anchor_bottom = 1.0
		image.offset_left = 92.0
		image.offset_top = -2.0
		image.offset_right = 0.0
		image.offset_bottom = 0.0
		stage.add_child(image)
	else:
		var fallback := _panel(BG_PANEL, BORDER, 4)
		fallback.anchor_left = 0.0
		fallback.anchor_top = 0.0
		fallback.anchor_right = 0.50
		fallback.anchor_bottom = 1.0
		fallback.offset_left = 92.0
		fallback.offset_top = -2.0
		fallback.offset_right = 0.0
		fallback.offset_bottom = 0.0
		stage.add_child(fallback)
		fallback.add_child(_label("%s\n画像未接入" % str(entry.get("display_name", "将")).left(2), 18, TEXT_GOLD, HORIZONTAL_ALIGNMENT_CENTER))

	var shade := ColorRect.new()
	shade.color = Color(0.0, 0.0, 0.0, 0.10)
	shade.set_anchors_preset(Control.PRESET_FULL_RECT)
	stage.add_child(shade)

	var section_rail := _build_stage_section_rail()
	section_rail.position = Vector2(16, 188)
	stage.add_child(section_rail)

	var banner := _build_faction_banner(entry)
	banner.position = Vector2(98, 88)
	stage.add_child(banner)

	var stars := _build_stage_star_column(entry)
	stars.position = Vector2(120, 370)
	stage.add_child(stars)

	var operations := _build_stage_operation_strip()
	operations.anchor_left = 0.0
	operations.anchor_top = 1.0
	operations.anchor_right = 0.49
	operations.anchor_bottom = 1.0
	operations.offset_left = 92.0
	operations.offset_right = -14.0
	operations.offset_top = -60.0
	operations.offset_bottom = -14.0
	stage.add_child(operations)
	return stage

func _build_profile_detail_stack(entry: Dictionary, page_id: String) -> Control:
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 9)
	column.add_child(_build_profile_tab_strip(page_id))
	column.add_child(_build_detail_header(entry, true))
	if page_id == "tactics":
		column.add_child(_build_point_panel(entry))
	elif page_id == "library":
		var browser := _build_skill_library_browser()
		browser.size_flags_vertical = Control.SIZE_EXPAND_FILL
		column.add_child(browser)
	elif page_id == "growth":
		var troop_block := _build_troop_block(entry)
		troop_block.size_flags_vertical = Control.SIZE_EXPAND_FILL
		column.add_child(troop_block)
	else:
		column.add_child(_build_attribute_overview_panel(entry))
		column.add_child(_build_skill_block(entry))
	return column

func _build_faction_banner(entry: Dictionary) -> Control:
	var faction_label := _faction_label(entry)
	var faction_color := _faction_color(faction_label)
	var root := Control.new()
	root.custom_minimum_size = Vector2(124, 306)
	var name_ribbon := _hero_name_ribbon(str(entry.get("display_name", "待补位")), faction_color)
	name_ribbon.position = Vector2(24, 62)
	root.add_child(name_ribbon)
	var diamond := _faction_diamond_badge(faction_label, faction_color)
	diamond.position = Vector2(0, 0)
	root.add_child(diamond)
	return root

func _faction_diamond_badge(faction_label: String, faction_color: Color) -> Control:
	var badge := Control.new()
	badge.custom_minimum_size = Vector2(124, 72)
	var shadow := Polygon2D.new()
	shadow.polygon = PackedVector2Array([
		Vector2(62, 2),
		Vector2(120, 34),
		Vector2(96, 68),
		Vector2(28, 68),
		Vector2(4, 34),
	])
	shadow.color = Color(0.0, 0.0, 0.0, 0.66)
	badge.add_child(shadow)
	var plate := Polygon2D.new()
	plate.polygon = PackedVector2Array([
		Vector2(62, 8),
		Vector2(110, 34),
		Vector2(92, 60),
		Vector2(32, 60),
		Vector2(14, 34),
	])
	plate.color = Color(faction_color.r, faction_color.g, faction_color.b, 0.86)
	badge.add_child(plate)
	var label := _nowrap_label(faction_label, 23, TEXT_MAIN, HORIZONTAL_ALIGNMENT_CENTER)
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.position = Vector2(24, 20)
	label.size = Vector2(76, 30)
	label.custom_minimum_size = Vector2(76, 30)
	badge.add_child(label)
	return badge

func _hero_name_ribbon(hero_name: String, faction_color: Color) -> Control:
	var strip := _panel(Color(0.018, 0.020, 0.024, 0.60), Color(faction_color.r, faction_color.g, faction_color.b, 0.24), 1)
	strip.custom_minimum_size = Vector2(76, 210)
	strip.size = Vector2(76, 210)
	_add_faction_ribbon_gradient(strip, faction_color)
	var margin := _margin(12, 24, 12, 14)
	strip.add_child(margin)
	var label := _label(_vertical_text(hero_name.left(3)), 28, TEXT_MAIN, HORIZONTAL_ALIGNMENT_CENTER)
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	margin.add_child(label)
	return strip

func _add_faction_ribbon_gradient(root: Control, faction_color: Color) -> void:
	var segment_count := 10
	var segment_height := 21.0
	for index in range(segment_count):
		var segment := ColorRect.new()
		var fade := 1.0 - (float(index) / float(segment_count - 1))
		var alpha := 0.18 * fade * fade
		segment.color = Color(faction_color.r, faction_color.g, faction_color.b, alpha)
		segment.position = Vector2(0, float(index) * segment_height)
		segment.size = Vector2(76, segment_height + 1.0)
		segment.mouse_filter = Control.MOUSE_FILTER_IGNORE
		root.add_child(segment)

func _build_stage_section_rail() -> Control:
	var panel := _panel(Color(0.010, 0.012, 0.014, 0.52), Color(TEXT_BLUE.r, TEXT_BLUE.g, TEXT_BLUE.b, 0.42), 2)
	panel.custom_minimum_size = Vector2(82, 276)
	var margin := _margin(8, 16, 8, 16)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	column.add_theme_constant_override("separation", 16)
	margin.add_child(column)
	column.add_child(_rail_item("领\n兵", TEXT_MAIN, true))
	column.add_child(_rail_item("列\n传", TEXT_MUTED, false))
	return panel

func _rail_item(text: String, color: Color, active: bool) -> Control:
	var panel := _panel(Color(0.0, 0.0, 0.0, 0.42) if active else Color(0.0, 0.0, 0.0, 0.16), Color(color.r, color.g, color.b, 0.55) if active else Color(0.0, 0.0, 0.0, 0.0), 2)
	panel.custom_minimum_size = Vector2(58, 116 if text.length() > 3 else 88)
	var margin := _margin(6, 8, 6, 8)
	panel.add_child(margin)
	var label := _label(text, 21, color, HORIZONTAL_ALIGNMENT_CENTER)
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	margin.add_child(label)
	return panel

func _faction_label(entry: Dictionary) -> String:
	var raw := str(entry.get("faction", "未知")).strip_edges()
	match raw:
		"魏", "曹魏":
			return "曹魏"
		"蜀", "汉", "季汉", "纪汉":
			return "季汉"
		"吴", "东吴", "孙吴":
			return "东吴"
		"群", "群雄":
			return "群雄"
		_:
			return raw if raw != "" else "未知"

func _faction_color(faction_label: String) -> Color:
	match faction_label:
		"曹魏":
			return Color(0.36, 0.62, 0.96, 1.0)
		"季汉":
			return Color(0.34, 0.76, 0.43, 1.0)
		"东吴":
			return Color(0.86, 0.28, 0.22, 1.0)
		"群雄":
			return Color(0.93, 0.72, 0.24, 1.0)
		_:
			return TEXT_MUTED

func _faction_panel_color(faction_color: Color) -> Color:
	return Color(faction_color.r * 0.10, faction_color.g * 0.10, faction_color.b * 0.10, 0.92)

func _vertical_text(text: String) -> String:
	var result: Array[String] = []
	for index in range(text.length()):
		result.append(text.substr(index, 1))
	return "\n".join(result)

func _build_stage_star_column(entry: Dictionary) -> Control:
	var column := VBoxContainer.new()
	column.custom_minimum_size = Vector2(68, 286)
	column.add_theme_constant_override("separation", 7)
	var red_stars: int = int(entry.get("red_stars", 0))
	var stars: int = maxi(1, int(entry.get("stars", 5)))
	for index in range(stars):
		var color: Color = TEXT_RED if index < red_stars else TEXT_GOLD
		var star := _nowrap_label("★", 56, color, HORIZONTAL_ALIGNMENT_CENTER)
		star.custom_minimum_size = Vector2(68, 50)
		star.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		column.add_child(star)
	return column

func _entry_star_text(entry: Dictionary) -> String:
	var existing := str(entry.get("star_text", "")).strip_edges()
	if existing != "":
		return existing
	var red_stars: int = maxi(0, int(entry.get("red_stars", 0)))
	var stars: int = maxi(1, int(entry.get("stars", 5)))
	var gold_stars: int = maxi(0, stars - red_stars)
	return "%s%s" % ["★".repeat(red_stars), "★".repeat(gold_stars)]

func _build_stage_identity_panel(entry: Dictionary) -> Control:
	var panel := _panel(Color(0.0, 0.0, 0.0, 0.44), Color(0.0, 0.0, 0.0, 0.0), 0)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(16, 10, 16, 10)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 3)
	margin.add_child(column)
	column.add_child(_label(str(entry.get("display_name", "待补位")), 26, TEXT_MAIN, HORIZONTAL_ALIGNMENT_CENTER))
	column.add_child(_label("%s  %s  Cost %s" % [str(entry.get("title", "")), str(entry.get("quality", "")), str(entry.get("cost_label", "-"))], 13, TEXT_GOLD, HORIZONTAL_ALIGNMENT_CENTER))
	var faction_label := _faction_label(entry)
	column.add_child(_label("%s · %s · %s" % [faction_label, str(entry.get("troop_type_label", "")), str(entry.get("status_label", ""))], 13, _faction_color(faction_label), HORIZONTAL_ALIGNMENT_CENTER))
	return panel

func _build_stage_operation_strip() -> Control:
	var panel := _panel(Color(0.0, 0.0, 0.0, 0.50), Color(0.0, 0.0, 0.0, 0.0), 0)
	var margin := _margin(10, 6, 10, 6)
	panel.add_child(margin)
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 10)
	margin.add_child(row)
	for spec in [
		["重置", "general_reset"],
		["攻略", "general_guide"],
		["分享", "general_share"],
		["传承", "general_inherit"],
	]:
		row.add_child(_stage_action_button(str(spec[0]), str(spec[1])))
	return panel

func _build_profile_tab_strip(active_page_id: String) -> Control:
	var panel := _panel(BG_ROW, BORDER, 4)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(8, 8, 8, 8)
	panel.add_child(margin)
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 6)
	margin.add_child(row)
	for spec in [["roster", "总览"], ["profile", "详情"], ["tactics", "配点"], ["library", "战法库"], ["growth", "兵种"]]:
		row.add_child(_build_profile_tab_button(str(spec[0]), str(spec[1]), active_page_id == str(spec[0])))
	var protect_label := _nowrap_label("未保护", 17, TEXT_MUTED, HORIZONTAL_ALIGNMENT_RIGHT)
	protect_label.custom_minimum_size = Vector2(98, 0)
	row.add_child(protect_label)
	var close_button := Button.new()
	close_button.name = "CloseButton"
	close_button.text = "关闭"
	close_button.custom_minimum_size = MOBILE_CLOSE_BUTTON_SIZE
	close_button.add_theme_font_size_override("font_size", MOBILE_CLOSE_BUTTON_FONT_SIZE)
	_apply_button_style(close_button, Color(0.18, 0.08, 0.08, 0.70), Color(0.36, 0.12, 0.12, 0.86), TEXT_RED)
	close_button.pressed.connect(func() -> void:
		close_requested.emit()
	)
	row.add_child(close_button)
	return panel

func _build_profile_tab_button(page_id: String, text: String, active: bool) -> Button:
	var button := Button.new()
	button.text = text
	button.disabled = active
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.custom_minimum_size = Vector2(0, 46)
	button.add_theme_font_size_override("font_size", MOBILE_PROFILE_TAB_FONT_SIZE)
	_apply_button_style(button, BG_ROW_ACTIVE if active else BG_PANEL, BORDER_ACTIVE if active else BORDER, TEXT_GOLD if active else TEXT_MUTED)
	button.pressed.connect(Callable(self, "_on_profile_page_button_pressed").bind(page_id))
	return button

func _build_detail_header(entry: Dictionary, expanded: bool) -> Control:
	var panel := _panel(BG_ROW, BORDER, 4)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.custom_minimum_size = Vector2(0, 54)
	var margin := _margin(12, 9, 12, 9)
	panel.add_child(margin)
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 10)
	margin.add_child(row)
	row.add_child(_nowrap_label("◆", 20, TEXT_GOLD, HORIZONTAL_ALIGNMENT_CENTER))
	row.add_child(_meta_label(_entry_name_variant_line(entry), TEXT_GOLD, 138))
	row.add_child(_vertical_rule())
	row.add_child(_meta_label(str(entry.get("troop_type_label", "待定")), TEXT_MAIN, 70))
	row.add_child(_vertical_rule())
	row.add_child(_meta_label("攻击距离 %s" % _compact_number_label(entry.get("attack_range_label", entry.get("attack_range", "2"))), TEXT_MAIN, 118))
	row.add_child(_vertical_rule())
	row.add_child(_meta_label("COST %s" % _compact_number_label(entry.get("cost_label", entry.get("cost", "-"))), TEXT_MAIN, 92))
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(spacer)
	var location_label := _nowrap_label(_entry_location_line(entry), 14, TEXT_MUTED, HORIZONTAL_ALIGNMENT_RIGHT)
	location_label.custom_minimum_size = Vector2(150, 0)
	row.add_child(location_label)
	return panel

func _build_status_bar_panel(entry: Dictionary) -> Control:
	var panel := _panel(BG_DATA, BORDER_DATA, 4)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(12, 10, 12, 10)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 7)
	margin.add_child(column)
	column.add_child(_label("状态", 17, TEXT_GOLD))
	column.add_child(_progress_line("Lv.%s" % _compact_number_label(entry.get("level", 1)), int(entry.get("exp_current", 0)), int(entry.get("exp_max", 1)), TEXT_GOLD))
	column.add_child(_progress_line("兵力", int(entry.get("soldier_current", 0)), int(entry.get("soldier_max", 1)), TEXT_BLUE))
	column.add_child(_progress_line("体力", int(entry.get("stamina_current", 0)), int(entry.get("stamina_max", 1)), TEXT_GREEN))
	return panel

func _build_attribute_overview_panel(entry: Dictionary) -> Control:
	var panel := _panel(BG_DATA, BORDER_DATA, 4)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(16, 13, 16, 13)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 12)
	margin.add_child(column)
	column.add_child(_label("属性", 20, TEXT_GOLD))
	column.add_child(_progress_line("Lv.%s" % _compact_number_label(entry.get("level", 1)), int(entry.get("exp_current", 0)), int(entry.get("exp_max", 1)), TEXT_GOLD))
	column.add_child(_progress_line("兵力", int(entry.get("soldier_current", 0)), int(entry.get("soldier_max", 1)), TEXT_BLUE))
	column.add_child(_progress_line("体力", int(entry.get("stamina_current", 0)), int(entry.get("stamina_max", 1)), TEXT_GREEN))
	column.add_child(_build_attribute_chip_grid(entry))
	return panel

func _build_attribute_chip_grid(entry: Dictionary) -> Control:
	var grid := GridContainer.new()
	grid.columns = 2
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.add_theme_constant_override("h_separation", 16)
	grid.add_theme_constant_override("v_separation", 12)
	for spec in _attribute_specs():
		grid.add_child(_attribute_chip(entry, spec))
	return grid

func _attribute_specs() -> Array[Dictionary]:
	return [
		{"label": "攻击", "key": "force", "icon": "◆", "color": TEXT_RED},
		{"label": "攻城", "key": "charisma", "icon": "▣", "color": TEXT_GOLD},
		{"label": "防御", "key": "command", "icon": "⬟", "color": TEXT_GOLD},
		{"label": "速度", "key": "speed", "icon": "◢", "color": TEXT_GREEN},
		{"label": "谋略", "key": "intelligence", "icon": "✦", "color": TEXT_BLUE},
	]

func _attribute_chip(entry: Dictionary, spec: Dictionary) -> Control:
	var color: Color = spec.get("color", TEXT_GOLD) as Color
	var panel := _panel(Color(color.r * 0.06, color.g * 0.06, color.b * 0.06, 0.42), Color(color.r, color.g, color.b, 0.26), 2)
	panel.custom_minimum_size = Vector2(0, 56)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(11, 8, 11, 8)
	panel.add_child(margin)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	margin.add_child(row)
	row.add_child(_attribute_icon(str(spec.get("icon", "◆")), color))
	var label := _nowrap_label("%s %s" % [str(spec.get("label", "")), _compact_number_label(entry.get(str(spec.get("key", "")), 0))], 24, TEXT_MAIN)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(label)
	var growth_value: Variant = entry.get("%s_growth" % str(spec.get("key", "")), "")
	var growth := _nowrap_label("(+%s)" % _compact_number_label(growth_value), 21, Color(0.22, 0.86, 0.58, 1.0), HORIZONTAL_ALIGNMENT_RIGHT)
	growth.custom_minimum_size = Vector2(98, 0)
	row.add_child(growth)
	return panel

func _attribute_icon(text: String, color: Color) -> Control:
	var frame := _panel(Color(0.0, 0.0, 0.0, 0.82), Color(color.r, color.g, color.b, 0.36), 2)
	frame.custom_minimum_size = Vector2(34, 34)
	var margin := _margin(2, 1, 2, 1)
	frame.add_child(margin)
	margin.add_child(_nowrap_label(text, 23, color, HORIZONTAL_ALIGNMENT_CENTER))
	return frame

func _build_point_panel(entry: Dictionary) -> Control:
	var panel := _panel(BG_DATA, BORDER_DATA, 4)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(12, 12, 12, 12)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 10)
	margin.add_child(column)
	column.add_child(_label("配点", 17, TEXT_GOLD))
	var allocation: Dictionary = entry.get("allocation", {}) as Dictionary
	var summary := HBoxContainer.new()
	summary.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	summary.add_theme_constant_override("separation", 8)
	column.add_child(summary)
	summary.add_child(_point_summary_card("稀有度", _entry_star_text(entry), "红星 %s" % str(entry.get("red_stars", 0)), TEXT_GOLD))
	summary.add_child(_point_summary_card("剩余点数", str(allocation.get("free_points", 0)), "可用点数", TEXT_GREEN if int(allocation.get("free_points", 0)) > 0 else TEXT_MUTED))
	summary.add_child(_point_summary_card("当前方案", str(allocation.get("active_scheme", "方案一")), "当前生效", TEXT_BLUE))
	column.add_child(_point_scheme_tabs(str(allocation.get("active_scheme", "方案一"))))
	for spec in _point_allocate_specs():
		column.add_child(_point_allocate_row(entry, spec))
	var action_row := HBoxContainer.new()
	action_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	action_row.add_theme_constant_override("separation", 10)
	column.add_child(action_row)
	action_row.add_child(_preview_action_chip("洗点"))
	action_row.add_child(_preview_action_chip("确定"))
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	action_row.add_child(spacer)
	return panel

func _point_scheme_tabs(active_scheme: String = "方案一") -> Control:
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 6)
	for label_variant in ["方案一", "方案二", "方案三"]:
		var label := str(label_variant)
		var active := label == active_scheme
		if active_scheme == "" and label == "方案一":
			active = true
		var chip := _panel(BG_ROW_ACTIVE if active else BG_ROW, BORDER_ACTIVE if active else BORDER_DATA, 2)
		chip.custom_minimum_size = Vector2(0, 34)
		chip.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var margin := _margin(8, 5, 8, 5)
		chip.add_child(margin)
		margin.add_child(_nowrap_label(("✓ " if active else "") + label, 14, TEXT_GOLD if active else TEXT_MUTED, HORIZONTAL_ALIGNMENT_CENTER))
		row.add_child(chip)
	return row

func _point_allocate_row(entry: Dictionary, spec: Dictionary) -> Control:
	var color: Color = spec.get("color", TEXT_GOLD) as Color
	var stat_key := str(spec.get("stat_key", ""))
	var growth_key := str(spec.get("growth_key", ""))
	var current_value := float(entry.get(stat_key, 0))
	var growth_value := str(entry.get(growth_key, "0.00"))
	var panel := _panel(Color(0.0, 0.0, 0.0, 0.28), BORDER_DATA, 3)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(10, 7, 10, 7)
	panel.add_child(margin)
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 10)
	margin.add_child(row)
	row.add_child(_small_tag(str(spec.get("label", "")), 64, color))
	var value := _nowrap_label("%s +0" % str(spec.get("label", "")), 16, TEXT_MAIN)
	value.custom_minimum_size = Vector2(132, 0)
	row.add_child(value)
	var before_after := _nowrap_label("%.2f  »  %.2f" % [current_value, current_value], 18, TEXT_MUTED)
	before_after.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(before_after)
	row.add_child(_point_step_button("−"))
	row.add_child(_point_step_button("+"))
	row.add_child(_point_step_button("最大"))
	var growth := _nowrap_label("+%s / Lv" % growth_value, 12, TEXT_MUTED, HORIZONTAL_ALIGNMENT_RIGHT)
	growth.custom_minimum_size = Vector2(86, 0)
	row.add_child(growth)
	return panel

func _point_step_button(text: String) -> Control:
	var button := _panel(BG_ROW, BORDER_DATA, 2)
	button.custom_minimum_size = Vector2(46 if text != "最大" else 66, 32)
	var margin := _margin(4, 4, 4, 4)
	button.add_child(margin)
	margin.add_child(_nowrap_label(text, 15, TEXT_MUTED, HORIZONTAL_ALIGNMENT_CENTER))
	return button

func _point_summary_card(title: String, value: String, meta: String, color: Color) -> Control:
	var panel := _panel(Color(color.r * 0.10, color.g * 0.10, color.b * 0.10, 0.70), Color(color.r, color.g, color.b, 0.62), 4)
	panel.custom_minimum_size = Vector2(0, 66)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(8, 7, 8, 7)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 2)
	margin.add_child(column)
	column.add_child(_label(title, 12, TEXT_MUTED, HORIZONTAL_ALIGNMENT_CENTER))
	column.add_child(_nowrap_label(value, 15, color, HORIZONTAL_ALIGNMENT_CENTER))
	column.add_child(_nowrap_label(meta, 11, TEXT_MUTED, HORIZONTAL_ALIGNMENT_CENTER))
	return panel

func _point_stat_card(label_text: String, current_value: String, growth_value: String, color: Color) -> Control:
	var panel := _panel(Color(color.r * 0.08, color.g * 0.08, color.b * 0.08, 0.68), Color(color.r, color.g, color.b, 0.54), 4)
	panel.custom_minimum_size = Vector2(0, 76)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(7, 7, 7, 7)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 2)
	margin.add_child(column)
	column.add_child(_label(label_text, 12, TEXT_MUTED, HORIZONTAL_ALIGNMENT_CENTER))
	column.add_child(_nowrap_label(current_value, 17, color, HORIZONTAL_ALIGNMENT_CENTER))
	column.add_child(_nowrap_label("+%s / Lv" % growth_value, 11, TEXT_MUTED, HORIZONTAL_ALIGNMENT_CENTER))
	return panel

func _resolve_primary_growth(entry: Dictionary) -> Dictionary:
	var best: Dictionary = {}
	for spec in _point_stat_specs():
		var value := float(entry.get(str(spec.get("growth_key", "")), 0.0))
		if best.is_empty() or value > float(best.get("value", -1.0)):
			best = {
				"label": spec.get("label", ""),
				"growth": entry.get(str(spec.get("growth_key", "")), "0.00"),
				"color": spec.get("color", TEXT_GOLD),
				"value": value,
			}
	return best

func _point_stat_specs() -> Array[Dictionary]:
	return [
		{"label": "攻击", "stat_key": "force", "growth_key": "force_growth", "color": TEXT_RED},
		{"label": "防御", "stat_key": "command", "growth_key": "command_growth", "color": TEXT_GOLD},
		{"label": "谋略", "stat_key": "intelligence", "growth_key": "intelligence_growth", "color": TEXT_BLUE},
		{"label": "攻城", "stat_key": "charisma", "growth_key": "charisma_growth", "color": TEXT_GOLD},
		{"label": "速度", "stat_key": "speed", "growth_key": "speed_growth", "color": TEXT_GREEN},
	]

func _point_allocate_specs() -> Array[Dictionary]:
	return [
		{"label": "攻击", "stat_key": "force", "growth_key": "force_growth", "color": TEXT_RED},
		{"label": "防御", "stat_key": "command", "growth_key": "command_growth", "color": TEXT_GOLD},
		{"label": "谋略", "stat_key": "intelligence", "growth_key": "intelligence_growth", "color": TEXT_BLUE},
		{"label": "速度", "stat_key": "speed", "growth_key": "speed_growth", "color": TEXT_GREEN},
	]

func _build_compact_stat_grid(entry: Dictionary) -> Control:
	var grid := GridContainer.new()
	grid.columns = 5
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	for spec in [["武力", "force"], ["统率", "command"], ["智谋", "intelligence"], ["魅力", "charisma"], ["速度", "speed"]]:
		grid.add_child(_stat_badge(str(spec[0]), str(entry.get(str(spec[1]), 0))))
	return grid

func _build_attribute_panel(entry: Dictionary) -> Control:
	var panel := _panel(BG_DATA, BORDER_DATA, 4)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(14, 12, 14, 12)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 7)
	margin.add_child(column)
	column.add_child(_label("属性", 17, TEXT_GOLD))
	for spec in [["攻击", "force", TEXT_RED], ["防御", "command", TEXT_GOLD], ["谋略", "intelligence", TEXT_BLUE], ["攻城", "charisma", TEXT_GOLD], ["速度", "speed", TEXT_GREEN]]:
		column.add_child(_stat_bar(str(spec[0]), int(entry.get(str(spec[1]), 0)), spec[2]))
	return panel

func _build_skill_block(entry: Dictionary) -> Control:
	var panel := _panel(BG_DATA, BORDER_DATA, 4)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(12, 10, 12, 10)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 11)
	margin.add_child(column)
	column.add_child(_label("战法", 20, TEXT_GOLD))
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 16)
	column.add_child(row)
	var skills := _dictionary_array(entry.get("skills", []))
	var learnable_slots := maxi(0, int(entry.get("learnable_skill_slots", 2)))
	var visible_slot_count := clampi(maxi(skills.size() + learnable_slots, 3), 1, 5)
	for index in range(visible_slot_count):
		var skill: Dictionary = skills[index] if index < skills.size() and skills[index] is Dictionary else {}
		row.add_child(_build_skill_button(skill, index, str(entry.get("skill_name", "待配置") if index == 0 else "待配置")))
	column.add_child(_build_skill_library_hint())
	return panel

func _build_skill_button(skill: Dictionary, index: int, fallback_name: String) -> Button:
	if skill.is_empty():
		var empty_button := Button.new()
		empty_button.text = "空槽\n可装配战法\n待获取"
		empty_button.custom_minimum_size = Vector2(0, 124)
		empty_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		empty_button.disabled = true
		empty_button.add_theme_font_size_override("font_size", 18)
		_apply_button_style(empty_button, Color(0.035, 0.033, 0.030, 0.54), Color(TEXT_MUTED.r, TEXT_MUTED.g, TEXT_MUTED.b, 0.30), TEXT_MUTED)
		return empty_button
	var grade := _skill_grade_label(skill)
	var level_text := "Lv.%s" % _compact_number_label(skill.get("level", 10))
	var type_text := _skill_type_label(skill)
	var title := str(skill.get("name", fallback_name))
	var color := _skill_grade_color(grade)
	var button := Button.new()
	button.text = "%s   %s\n%s\n%s" % [grade, level_text, title, type_text]
	button.custom_minimum_size = Vector2(0, 124)
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.clip_text = true
	button.tooltip_text = "点击查看战法详情"
	button.add_theme_font_size_override("font_size", 19)
	_apply_button_style(button, Color(color.r * 0.08, color.g * 0.08, color.b * 0.08, 0.56), Color(color.r, color.g, color.b, 0.50), TEXT_MAIN)
	button.pressed.connect(Callable(self, "_on_general_action_pressed").bind("skill_detail:%s" % str(index)))
	return button

func _build_skill_library_hint() -> Control:
	var raw_summary: Variant = _shared_state().get("equipable_skill_library_summary", {})
	var summary: Dictionary = {}
	if raw_summary is Dictionary:
		summary = raw_summary as Dictionary
	var raw_grade_counts: Variant = summary.get("grade_counts", {})
	var grade_counts: Dictionary = {}
	if raw_grade_counts is Dictionary:
		grade_counts = raw_grade_counts as Dictionary
	var raw_type_counts: Variant = summary.get("type_counts", {})
	var type_counts: Dictionary = {}
	if raw_type_counts is Dictionary:
		type_counts = raw_type_counts as Dictionary
	var raw_troop_counts: Variant = summary.get("troop_counts", {})
	var troop_counts: Dictionary = {}
	if raw_troop_counts is Dictionary:
		troop_counts = raw_troop_counts as Dictionary
	var top_tag_labels := _string_array(summary.get("top_tag_labels", []))
	var tag_line := ""
	if not top_tag_labels.is_empty():
		tag_line = "；高频标签=%s" % " / ".join(top_tag_labels)
	if summary.is_empty():
		return _label("通用战法库：待加载；武将主战法仍固定在第1槽。", 14, TEXT_MUTED)
	return _label("通用战法库：%s 个；S/A/B=%s/%s/%s；指挥/主动/被动/追击=%s/%s/%s/%s；兵种覆盖 骑/步/弓=%s/%s/%s；装配位=任意%s；主战法仍固定在第1槽。" % [
		str(summary.get("skill_count", 0)),
		str(grade_counts.get("S", 0)),
		str(grade_counts.get("A", 0)),
		str(grade_counts.get("B", 0)),
		str(type_counts.get("指挥", 0)),
		str(type_counts.get("主动", 0)),
		str(type_counts.get("被动", 0)),
		str(type_counts.get("追击", 0)),
		str(troop_counts.get("骑兵", 0)),
		str(troop_counts.get("步兵", 0)),
		str(troop_counts.get("弓兵", 0)),
		tag_line,
	], 14, TEXT_MUTED)

func _build_skill_library_browser() -> Control:
	var panel := _panel(BG_DATA, BORDER_DATA, 4)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var margin := _margin(12, 10, 12, 10)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 9)
	margin.add_child(column)
	var title_row := HBoxContainer.new()
	title_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_row.add_theme_constant_override("separation", 8)
	column.add_child(title_row)
	title_row.add_child(_label("通用战法库", 19, TEXT_GOLD))
	var reset_button := _filter_button("重置", _skill_library_has_active_filter(), "skill_library_filter:reset:全部")
	reset_button.custom_minimum_size = Vector2(70, 30)
	title_row.add_child(reset_button)
	column.add_child(_label("只读浏览；不做站位推荐，不做武将名推荐。", 13, TEXT_MUTED))
	column.add_child(_build_skill_library_search_row())
	column.add_child(_build_skill_library_filter_row("排序", "sort", ["品质", "名称", "类型", "来源"], _skill_library_sort_mode))
	column.add_child(_build_skill_library_filter_row("品质", "grade", ["全部", "S", "A", "B"], _skill_library_grade_filter))
	column.add_child(_build_skill_library_filter_row("类型", "type", ["全部", "指挥", "主动", "被动", "追击"], _skill_library_type_filter))
	column.add_child(_build_skill_library_filter_row("兵种", "troop", ["全部", "骑兵", "步兵", "弓兵"], _skill_library_troop_filter))
	column.add_child(_build_skill_library_source_filter_row())
	column.add_child(_build_skill_library_tag_filter_row())
	var filtered := _filtered_skill_library_entries()
	column.add_child(_build_skill_library_result_summary(filtered))
	var search_note := ""
	if _skill_library_search_text.strip_edges() != "":
		search_note = "；搜索=%s" % _skill_library_search_text.strip_edges().left(16)
	column.add_child(_label("筛选结果：%s / %s%s" % [str(filtered.size()), str(_skill_library_entries().size()), search_note], 13, TEXT_MUTED))
	var list_scroll := ScrollContainer.new()
	list_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	list_scroll.custom_minimum_size = Vector2(0, 260)
	column.add_child(list_scroll)
	var list := VBoxContainer.new()
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list.add_theme_constant_override("separation", 7)
	list_scroll.add_child(list)
	if filtered.is_empty():
		list.add_child(_label("没有符合当前筛选的通用战法。", 14, TEXT_MUTED))
	else:
		for skill_variant in filtered:
			if skill_variant is Dictionary:
				list.add_child(_build_skill_library_result_row(skill_variant as Dictionary))
	return panel

func _build_skill_library_filter_row(title: String, field: String, options: Array, active_value: String) -> Control:
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 6)
	row.add_child(_meta_label(title, TEXT_GOLD, 42))
	for option in options:
		var value := str(option)
		row.add_child(_filter_button(value, value == active_value, "skill_library_filter:%s:%s" % [field, value]))
	return row

func _build_skill_library_search_row() -> Control:
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 6)
	row.add_child(_meta_label("搜索", TEXT_GOLD, 42))
	var input := LineEdit.new()
	input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	input.custom_minimum_size = Vector2(180, 30)
	input.text = _skill_library_search_text
	input.placeholder_text = "名称 / 描述 / 效果 / 来源 / 标签"
	input.clear_button_enabled = true
	input.add_theme_font_size_override("font_size", 13)
	input.text_changed.connect(Callable(self, "_on_skill_library_search_changed"))
	input.text_submitted.connect(Callable(self, "_on_skill_library_search_submitted"))
	row.add_child(input)
	row.add_child(_filter_button("搜索", false, "skill_library_filter:search_apply:全部"))
	row.add_child(_filter_button("清空", _skill_library_search_text.strip_edges() != "", "skill_library_filter:search_clear:全部"))
	return row

func _build_skill_library_tag_filter_row() -> Control:
	var panel := _panel(Color(0.0, 0.0, 0.0, 0.16), Color(0.0, 0.0, 0.0, 0.0), 0)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(0, 0, 0, 0)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 5)
	margin.add_child(column)
	var header := HBoxContainer.new()
	header.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_theme_constant_override("separation", 6)
	column.add_child(header)
	header.add_child(_meta_label("标签", TEXT_GOLD, 42))
	var scoped_entries := _skill_library_entries_for_tag_scope()
	var options := _skill_library_tag_options(scoped_entries)
	var summary := _label("当前 %s；Top %s" % [_skill_library_tag_filter, _skill_library_option_summary(options, "tag", 4)], 12, TEXT_MUTED)
	summary.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(summary)
	header.add_child(_filter_button("收起" if _skill_library_tag_filter_expanded else "展开", _skill_library_tag_filter_expanded, "skill_library_filter:toggle_tag:全部"))
	if not _skill_library_tag_filter_expanded:
		return panel
	var scroll := ScrollContainer.new()
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.custom_minimum_size = Vector2(0, 76)
	column.add_child(scroll)
	var tags := HFlowContainer.new()
	tags.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tags.add_theme_constant_override("h_separation", 5)
	tags.add_theme_constant_override("v_separation", 5)
	scroll.add_child(tags)
	tags.add_child(_filter_button("全部×%s" % str(scoped_entries.size()), _skill_library_tag_filter == "全部", "skill_library_filter:tag:全部"))
	for option_variant in options:
		if not (option_variant is Dictionary):
			continue
		var option := option_variant as Dictionary
		var tag := str(option.get("tag", ""))
		if tag == "":
			continue
		var count := int(option.get("count", 0))
		tags.add_child(_filter_button("%s×%s" % [tag, str(count)], tag == _skill_library_tag_filter, "skill_library_filter:tag:%s" % tag))
	return panel

func _build_skill_library_source_filter_row() -> Control:
	var panel := _panel(Color(0.0, 0.0, 0.0, 0.16), Color(0.0, 0.0, 0.0, 0.0), 0)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(0, 0, 0, 0)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 5)
	margin.add_child(column)
	var header := HBoxContainer.new()
	header.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_theme_constant_override("separation", 6)
	column.add_child(header)
	header.add_child(_meta_label("来源", TEXT_GOLD, 42))
	var scoped_entries := _skill_library_entries_for_source_scope()
	var options := _skill_library_source_options(scoped_entries)
	var summary := _label("当前 %s；Top %s" % [_skill_library_source_filter, _skill_library_option_summary(options, "source", 4)], 12, TEXT_MUTED)
	summary.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(summary)
	header.add_child(_filter_button("收起" if _skill_library_source_filter_expanded else "展开", _skill_library_source_filter_expanded, "skill_library_filter:toggle_source:全部"))
	if not _skill_library_source_filter_expanded:
		return panel
	var sources := HFlowContainer.new()
	sources.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sources.add_theme_constant_override("h_separation", 5)
	sources.add_theme_constant_override("v_separation", 5)
	column.add_child(sources)
	sources.add_child(_filter_button("全部×%s" % str(scoped_entries.size()), _skill_library_source_filter == "全部", "skill_library_filter:source:全部"))
	for option_variant in options:
		if not (option_variant is Dictionary):
			continue
		var option := option_variant as Dictionary
		var source := str(option.get("source", ""))
		if source == "":
			continue
		var count := int(option.get("count", 0))
		sources.add_child(_filter_button("%s×%s" % [source, str(count)], source == _skill_library_source_filter, "skill_library_filter:source:%s" % source))
	return panel

func _filter_button(text: String, active: bool, action_id: String) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(maxf(50.0, float(text.length() * 12 + 18)), 28)
	button.clip_text = true
	button.add_theme_font_size_override("font_size", 12)
	_apply_button_style(button, BG_ROW_ACTIVE if active else BG_PANEL, BORDER_ACTIVE if active else BORDER_DATA, TEXT_GOLD if active else TEXT_MUTED)
	button.pressed.connect(Callable(self, "_on_general_action_pressed").bind(action_id))
	return button

func _build_skill_library_result_row(skill: Dictionary) -> Control:
	var grade := _skill_grade_label(skill)
	var grade_color := _skill_grade_color(grade)
	var panel := _panel(Color(grade_color.r * 0.055, grade_color.g * 0.045, grade_color.b * 0.035, 0.72), Color(grade_color.r, grade_color.g, grade_color.b, 0.38), 4)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.custom_minimum_size = Vector2(0, 104 if _skill_library_search_text.strip_edges() != "" else 88)
	var margin := _margin(9, 7, 9, 7)
	panel.add_child(margin)
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 9)
	margin.add_child(row)
	var badge := _label("%s\n%s" % [grade, _skill_type_label(skill)], 14, grade_color, HORIZONTAL_ALIGNMENT_CENTER)
	badge.custom_minimum_size = Vector2(52, 0)
	row.add_child(badge)
	var detail := VBoxContainer.new()
	detail.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	detail.add_theme_constant_override("separation", 3)
	row.add_child(detail)
	detail.add_child(_nowrap_label(str(skill.get("name", "战法")), 17, TEXT_MAIN))
	detail.add_child(_label(str(skill.get("description", "")), 13, TEXT_MUTED))
	var meta := "兵种 %s · 定位 %s · 标签 %s" % [
		" / ".join(_string_array(skill.get("compatible_troops", []))),
		str(skill.get("combat_role", "通用")),
		" / ".join(_string_array(skill.get("tags", []))).left(46),
	]
	detail.add_child(_label(meta, 12, TEXT_MUTED))
	var match_line := _skill_library_search_match_line(skill)
	if match_line != "":
		detail.add_child(_label(match_line, 12, TEXT_GOLD))
	var button := _action_button("查看", "library_skill_detail:%s" % str(skill.get("id", "")))
	button.custom_minimum_size = Vector2(64, 34)
	row.add_child(button)
	return panel

func _build_skill_library_result_summary(filtered_entries: Array) -> Control:
	var panel := _panel(Color(0.0, 0.0, 0.0, 0.18), Color(BORDER_DATA.r, BORDER_DATA.g, BORDER_DATA.b, 0.32), 3)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(9, 6, 9, 6)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 3)
	margin.add_child(column)
	column.add_child(_label("当前条件：%s" % _skill_library_active_filter_line(), 12, TEXT_MUTED))
	column.add_child(_label("来源命中：%s" % _skill_library_option_summary(_skill_library_source_options(filtered_entries), "source", 4), 12, TEXT_MUTED))
	column.add_child(_label("标签命中：%s" % _skill_library_option_summary(_skill_library_tag_options(filtered_entries), "tag", 6), 12, TEXT_MUTED))
	if _skill_library_search_text.strip_edges() != "":
		column.add_child(_label("搜索命中：%s" % _skill_library_search_summary(filtered_entries), 12, TEXT_GOLD))
	return panel

func _skill_library_active_filter_line() -> String:
	var parts: Array[String] = []
	if _skill_library_grade_filter != "全部":
		parts.append("品质=" + _skill_library_grade_filter)
	if _skill_library_type_filter != "全部":
		parts.append("类型=" + _skill_library_type_filter)
	if _skill_library_troop_filter != "全部":
		parts.append("兵种=" + _skill_library_troop_filter)
	if _skill_library_source_filter != "全部":
		parts.append("来源=" + _skill_library_source_filter)
	if _skill_library_tag_filter != "全部":
		parts.append("标签=" + _skill_library_tag_filter)
	if _skill_library_search_text.strip_edges() != "":
		parts.append("搜索=" + _skill_library_search_text.strip_edges().left(16))
	if parts.is_empty():
		return "全部通用战法"
	return " / ".join(parts)

func _skill_library_option_summary(options: Array, label_key: String, limit: int) -> String:
	var parts: Array[String] = []
	for option_variant in options:
		if not (option_variant is Dictionary):
			continue
		var option := option_variant as Dictionary
		var label := str(option.get(label_key, ""))
		var count := int(option.get("count", 0))
		if label == "" or count <= 0:
			continue
		parts.append("%s×%s" % [label, str(count)])
		if parts.size() >= limit:
			break
	if parts.is_empty():
		return "无"
	return " / ".join(parts)

func _skill_library_search_summary(filtered_entries: Array) -> String:
	var counts := {}
	for skill_variant in filtered_entries:
		if not (skill_variant is Dictionary):
			continue
		for label in _skill_library_search_match_labels(skill_variant as Dictionary):
			counts[label] = int(counts.get(label, 0)) + 1
	var order := ["名称", "描述", "效果", "来源", "兵种", "标签", "解锁", "定位", "ID"]
	var parts: Array[String] = []
	for label in order:
		var count := int(counts.get(label, 0))
		if count > 0:
			parts.append("%s×%s" % [label, str(count)])
	if parts.is_empty():
		return "无"
	return " / ".join(parts)

func _skill_library_search_match_line(skill: Dictionary) -> String:
	var labels := _skill_library_search_match_labels(skill)
	if labels.is_empty():
		return ""
	return "搜索命中：" + " / ".join(labels)

func _skill_library_has_active_filter() -> bool:
	return _skill_library_grade_filter != "全部" or _skill_library_type_filter != "全部" or _skill_library_troop_filter != "全部" or _skill_library_tag_filter != "全部" or _skill_library_source_filter != "全部" or _skill_library_search_text.strip_edges() != ""

func _skill_library_entries() -> Array:
	var raw_library: Variant = _shared_state().get("equipable_skill_library", {})
	if not (raw_library is Dictionary):
		return []
	var raw_skills: Variant = (raw_library as Dictionary).get("skills", [])
	return _dictionary_array(raw_skills)

func _skill_library_supported_tags() -> Array:
	var raw_library: Variant = _shared_state().get("equipable_skill_library", {})
	var tags: Array = []
	if raw_library is Dictionary:
		tags = _string_array((raw_library as Dictionary).get("supported_tags", []))
	if not tags.is_empty():
		return tags
	var seen := {}
	for skill_variant in _skill_library_entries():
		if not (skill_variant is Dictionary):
			continue
		var skill := skill_variant as Dictionary
		for tag in _string_array(skill.get("tags", [])):
			if tag != "" and not seen.has(tag):
				seen[tag] = true
				tags.append(tag)
	return tags

func _skill_library_entries_for_tag_scope() -> Array:
	var result: Array = []
	for skill_variant in _skill_library_entries():
		if not (skill_variant is Dictionary):
			continue
		var skill := skill_variant as Dictionary
		if _skill_library_matches_filters(skill, false, true):
			result.append(skill)
	return result

func _skill_library_entries_for_source_scope() -> Array:
	var result: Array = []
	for skill_variant in _skill_library_entries():
		if not (skill_variant is Dictionary):
			continue
		var skill := skill_variant as Dictionary
		if _skill_library_matches_filters(skill, true, false):
			result.append(skill)
	return result

func _skill_library_tag_options(scoped_entries: Array) -> Array:
	var counts := {}
	for tag in _skill_library_supported_tags():
		if tag != "":
			counts[tag] = 0
	for skill_variant in scoped_entries:
		if not (skill_variant is Dictionary):
			continue
		var skill := skill_variant as Dictionary
		for tag in _string_array(skill.get("tags", [])):
			if tag == "":
				continue
			counts[tag] = int(counts.get(tag, 0)) + 1
	var options: Array = []
	for tag in counts.keys():
		var count := int(counts.get(tag, 0))
		if count <= 0:
			continue
		options.append({"tag": str(tag), "count": count})
	_sort_skill_library_tag_options(options)
	return options

func _skill_library_source_options(scoped_entries: Array) -> Array:
	var counts := {}
	for skill_variant in scoped_entries:
		if not (skill_variant is Dictionary):
			continue
		var source := _skill_library_source_label(skill_variant as Dictionary)
		if source == "":
			continue
		counts[source] = int(counts.get(source, 0)) + 1
	var options: Array = []
	for source in counts.keys():
		options.append({"source": str(source), "count": int(counts.get(source, 0))})
	_sort_skill_library_source_options(options)
	return options

func _sort_skill_library_tag_options(options: Array) -> void:
	var item_count := options.size()
	for index in range(1, item_count):
		var current: Variant = options[index]
		var cursor := index - 1
		while cursor >= 0 and _skill_library_tag_option_before(current, options[cursor]):
			options[cursor + 1] = options[cursor]
			cursor -= 1
		options[cursor + 1] = current

func _sort_skill_library_source_options(options: Array) -> void:
	var item_count := options.size()
	for index in range(1, item_count):
		var current: Variant = options[index]
		var cursor := index - 1
		while cursor >= 0 and _skill_library_source_option_before(current, options[cursor]):
			options[cursor + 1] = options[cursor]
			cursor -= 1
		options[cursor + 1] = current

func _skill_library_tag_option_before(left_variant: Variant, right_variant: Variant) -> bool:
	if not (left_variant is Dictionary) or not (right_variant is Dictionary):
		return false
	var left := left_variant as Dictionary
	var right := right_variant as Dictionary
	var left_count := int(left.get("count", 0))
	var right_count := int(right.get("count", 0))
	if left_count == right_count:
		return str(left.get("tag", "")) < str(right.get("tag", ""))
	return left_count > right_count

func _skill_library_source_option_before(left_variant: Variant, right_variant: Variant) -> bool:
	if not (left_variant is Dictionary) or not (right_variant is Dictionary):
		return false
	var left := left_variant as Dictionary
	var right := right_variant as Dictionary
	var left_count := int(left.get("count", 0))
	var right_count := int(right.get("count", 0))
	if left_count == right_count:
		return str(left.get("source", "")) < str(right.get("source", ""))
	return left_count > right_count

func _filtered_skill_library_entries() -> Array:
	var result: Array = []
	for skill_variant in _skill_library_entries():
		if not (skill_variant is Dictionary):
			continue
		var skill := skill_variant as Dictionary
		if _skill_library_matches_filters(skill, true, true):
			result.append(skill)
	_sort_skill_library_results(result)
	return result

func _sort_skill_library_results(entries: Array) -> void:
	var item_count := entries.size()
	for index in range(1, item_count):
		var current: Variant = entries[index]
		var cursor := index - 1
		while cursor >= 0 and _skill_library_result_before(current, entries[cursor]):
			entries[cursor + 1] = entries[cursor]
			cursor -= 1
		entries[cursor + 1] = current

func _skill_library_result_before(left_variant: Variant, right_variant: Variant) -> bool:
	if not (left_variant is Dictionary) or not (right_variant is Dictionary):
		return false
	var left := left_variant as Dictionary
	var right := right_variant as Dictionary
	match _skill_library_sort_mode:
		"名称":
			return _skill_library_compare_strings(str(left.get("name", "")), str(right.get("name", ""))) < 0
		"类型":
			var left_type := _skill_library_type_rank(_skill_type_label(left))
			var right_type := _skill_library_type_rank(_skill_type_label(right))
			if left_type != right_type:
				return left_type < right_type
		"来源":
			var source_compare := _skill_library_compare_strings(_skill_library_source_label(left), _skill_library_source_label(right))
			if source_compare != 0:
				return source_compare < 0
		_:
			pass
	var left_grade := _skill_library_grade_rank(_skill_grade_label(left))
	var right_grade := _skill_library_grade_rank(_skill_grade_label(right))
	if left_grade != right_grade:
		return left_grade < right_grade
	var left_type_rank := _skill_library_type_rank(_skill_type_label(left))
	var right_type_rank := _skill_library_type_rank(_skill_type_label(right))
	if left_type_rank != right_type_rank:
		return left_type_rank < right_type_rank
	return _skill_library_compare_strings(str(left.get("name", "")), str(right.get("name", ""))) < 0

func _skill_library_grade_rank(grade: String) -> int:
	match grade:
		"S":
			return 0
		"A":
			return 1
		_:
			return 2

func _skill_library_type_rank(type_label: String) -> int:
	match type_label:
		"指挥":
			return 0
		"主动":
			return 1
		"被动":
			return 2
		"追击":
			return 3
		_:
			return 4

func _skill_library_compare_strings(left: String, right: String) -> int:
	var normalized_left := left.strip_edges()
	var normalized_right := right.strip_edges()
	if normalized_left == normalized_right:
		return 0
	return -1 if normalized_left < normalized_right else 1

func _skill_library_matches_filters(skill: Dictionary, include_tag_filter: bool, include_source_filter: bool) -> bool:
	if _skill_library_grade_filter != "全部" and _skill_grade_label(skill) != _skill_library_grade_filter:
		return false
	if _skill_library_type_filter != "全部" and _skill_type_label(skill) != _skill_library_type_filter:
		return false
	if _skill_library_troop_filter != "全部" and not _string_array(skill.get("compatible_troops", [])).has(_skill_library_troop_filter):
		return false
	if include_source_filter and _skill_library_source_filter != "全部" and _skill_library_source_label(skill) != _skill_library_source_filter:
		return false
	if include_tag_filter and _skill_library_tag_filter != "全部" and not _string_array(skill.get("tags", [])).has(_skill_library_tag_filter):
		return false
	if not _skill_library_matches_search(skill):
		return false
	return true

func _skill_library_source_label(skill: Dictionary) -> String:
	var raw_source: Variant = skill.get("source", {})
	if raw_source is Dictionary:
		return str((raw_source as Dictionary).get("pool", "")).strip_edges()
	return str(raw_source).strip_edges()

func _skill_library_matches_search(skill: Dictionary) -> bool:
	if _skill_library_search_text.strip_edges() == "":
		return true
	return not _skill_library_search_match_labels(skill).is_empty()

func _skill_library_search_match_labels(skill: Dictionary) -> Array[String]:
	var needle := _skill_library_search_text.strip_edges().to_lower()
	var labels: Array[String] = []
	if needle == "":
		return labels
	if _skill_library_text_matches(str(skill.get("name", "")), needle):
		labels.append("名称")
	if _skill_library_text_matches(str(skill.get("description", "")), needle):
		labels.append("描述")
	var effect_text := " ".join([
		str(skill.get("trigger", "")),
		str(skill.get("target", "")),
		str(skill.get("effect", "")),
		_format_skill_attribute_effects(skill.get("attribute_effects", {})),
	])
	if _skill_library_text_matches(effect_text, needle):
		labels.append("效果")
	if _skill_library_text_matches(_skill_library_source_search_text(skill), needle):
		labels.append("来源")
	if _skill_library_text_matches(" ".join(_string_array(skill.get("compatible_troops", []))), needle):
		labels.append("兵种")
	if _skill_library_text_matches(" ".join(_string_array(skill.get("tags", []))), needle):
		labels.append("标签")
	if _skill_library_text_matches(str(skill.get("unlock_hint", "")), needle):
		labels.append("解锁")
	if _skill_library_text_matches(str(skill.get("combat_role", "")), needle):
		labels.append("定位")
	if _skill_library_text_matches(str(skill.get("id", "")), needle):
		labels.append("ID")
	return labels

func _skill_library_text_matches(text: String, needle: String) -> bool:
	return text.to_lower().find(needle) >= 0

func _skill_library_source_search_text(skill: Dictionary) -> String:
	var raw_source: Variant = skill.get("source", {})
	if raw_source is Dictionary:
		var source_parts: Array[String] = []
		for key in (raw_source as Dictionary).keys():
			source_parts.append(str(key))
			source_parts.append(str((raw_source as Dictionary).get(key, "")))
		return " ".join(source_parts)
	return str(raw_source)

func _skill_effect_line(skill: Dictionary) -> String:
	var name := str(skill.get("name", "战法")).strip_edges()
	var parts: Array[String] = []
	var trigger := str(skill.get("trigger", "")).strip_edges()
	var target := str(skill.get("target", "")).strip_edges()
	var effect := str(skill.get("effect", "")).strip_edges()
	var description := str(skill.get("description", "")).strip_edges()
	var attribute_effects := _format_skill_attribute_effects(skill.get("attribute_effects", {}))
	if trigger != "":
		parts.append("触发：" + trigger)
	if target != "":
		parts.append("目标：" + target)
	if effect != "":
		parts.append("效果：" + effect)
	elif description != "":
		parts.append(description)
	if attribute_effects != "":
		parts.append("属性：" + attribute_effects)
	if parts.is_empty():
		return ""
	return "%s：%s" % [name, "；".join(parts)]

func _format_skill_attribute_effects(raw_value: Variant) -> String:
	if not (raw_value is Dictionary):
		return ""
	var effects := raw_value as Dictionary
	var labels := {
		"attack": "攻击",
		"force": "攻击",
		"defense": "防御",
		"command": "防御",
		"strategy": "谋略",
		"intelligence": "谋略",
		"siege": "攻城",
		"charisma": "攻城",
		"speed": "速度",
	}
	var parts: Array[String] = []
	for key in effects.keys():
		var value := str(effects.get(key, "")).strip_edges()
		if value == "":
			continue
		var label := str(labels.get(str(key), str(key)))
		parts.append("%s%s" % [label, value])
	return " / ".join(parts)

func _build_troop_block(entry: Dictionary) -> Control:
	var panel := _panel(BG_DATA, BORDER_DATA, 4)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var margin := _margin(12, 12, 12, 12)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 10)
	margin.add_child(column)
	var heading := HBoxContainer.new()
	heading.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	heading.add_theme_constant_override("separation", 8)
	column.add_child(heading)
	heading.add_child(_label("兵种", 17, TEXT_GOLD))
	var meta := _nowrap_label("%s · 攻击距离 %s · COST %s" % [str(entry.get("troop_type_label", "待定")), _compact_number_label(entry.get("attack_range_label", entry.get("attack_range", "2"))), _compact_number_label(entry.get("cost_label", entry.get("cost", "-")))], 13, TEXT_MUTED, HORIZONTAL_ALIGNMENT_RIGHT)
	meta.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	heading.add_child(meta)
	var cards := HBoxContainer.new()
	cards.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cards.size_flags_vertical = Control.SIZE_EXPAND_FILL
	cards.add_theme_constant_override("separation", 10)
	column.add_child(cards)
	var variants := _troop_variant_specs(entry)
	if variants.is_empty():
		cards.add_child(_empty_panel("兵种预览待补", "等待兵种插画资源接入。"))
	else:
		var active_index := _active_troop_variant_index(variants.size())
		cards.add_child(_build_troop_illustration_card(variants[active_index] as Dictionary, active_index, variants.size()))
	return panel

func _troop_variant_specs(entry: Dictionary) -> Array[Dictionary]:
	var primary := str(entry.get("troop_type_label", "骑兵")).strip_edges()
	if primary == "":
		primary = "骑兵"
	var image_path := _troop_illustration_for_label(primary)
	var variants: Array[Dictionary] = [
		{"name": primary, "kind": "普通兵种", "image": image_path, "features": ["固定兵种"], "description": "%s为该武将固定兵种。" % primary},
	]
	for special in _special_troop_specs_for_label(primary):
		variants.append(special)
	return variants

func _active_troop_variant_index(variant_count: int) -> int:
	if variant_count <= 0:
		_troop_preview_variant_index = 0
		return 0
	_troop_preview_variant_index = clampi(_troop_preview_variant_index, 0, variant_count - 1)
	return _troop_preview_variant_index

func _special_troop_specs_for_label(troop_label: String) -> Array[Dictionary]:
	match troop_label:
		"骑兵":
			return [
				{"name": "虎豹骑", "kind": "特色兵种", "image": TROOP_ILLUSTRATION_TIGER_LEOPARD, "features": ["精锐重骑"], "description": "虎豹骑为曹魏精锐骑兵预览。"},
				{"name": "白马义从", "kind": "特色兵种", "image": TROOP_ILLUSTRATION_WHITE_HORSE, "features": ["轻骑突击"], "description": "白马义从为北地精骑预览。"},
			]
		"弓兵":
			return [
				{"name": "诸葛连弩兵", "kind": "特色兵种", "image": TROOP_ILLUSTRATION_REPEATING_CROSSBOW, "features": ["连弩"], "description": "诸葛连弩兵为特色弩兵预览。"},
			]
		_:
			return [
				{"name": "陷阵营", "kind": "特色兵种", "image": TROOP_ILLUSTRATION_TRAP_CAMP, "features": ["重甲破阵"], "description": "陷阵营为精锐重步兵预览。"},
			]

func _troop_illustration_for_label(troop_label: String) -> String:
	match troop_label:
		"骑兵":
			return TROOP_ILLUSTRATION_CAVALRY
		"弓兵":
			return TROOP_ILLUSTRATION_ARCHER
		"虎豹骑":
			return TROOP_ILLUSTRATION_TIGER_LEOPARD
		"白马义从":
			return TROOP_ILLUSTRATION_WHITE_HORSE
		"诸葛连弩兵":
			return TROOP_ILLUSTRATION_REPEATING_CROSSBOW
		"陷阵营":
			return TROOP_ILLUSTRATION_TRAP_CAMP
		_:
			return TROOP_ILLUSTRATION_INFANTRY

func _build_troop_illustration_card(spec: Dictionary, active_index: int, variant_count: int) -> Control:
	var panel := _panel(Color(0.070, 0.064, 0.056, 0.78), BORDER_ACTIVE, 3)
	panel.custom_minimum_size = Vector2(0, 600)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var margin := _margin(10, 10, 10, 10)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 8)
	margin.add_child(column)

	var top := HBoxContainer.new()
	top.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_theme_constant_override("separation", 8)
	column.add_child(top)
	var kind := str(spec.get("kind", "普通兵种"))
	top.add_child(_chip(kind, TEXT_GREEN if kind == "普通兵种" else TEXT_GOLD))
	var title := _nowrap_label(str(spec.get("name", "兵种")), 18, TEXT_GOLD, HORIZONTAL_ALIGNMENT_CENTER)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(title)
	top.add_child(_nowrap_label("%s/%s" % [str(active_index + 1), str(variant_count)], 13, TEXT_MUTED, HORIZONTAL_ALIGNMENT_RIGHT))

	var carousel := HBoxContainer.new()
	carousel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	carousel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	carousel.add_theme_constant_override("separation", 8)
	column.add_child(carousel)
	carousel.add_child(_troop_arrow_button("<", "troop_preview_prev", variant_count <= 1))
	carousel.add_child(_troop_illustration_box(str(spec.get("image", "")), str(spec.get("name", "兵种"))))
	carousel.add_child(_troop_arrow_button(">", "troop_preview_next", variant_count <= 1))

	var features := HBoxContainer.new()
	features.alignment = BoxContainer.ALIGNMENT_CENTER
	features.add_theme_constant_override("separation", 8)
	column.add_child(features)
	for feature in _string_array(spec.get("features", [])):
		features.add_child(_chip(feature, TEXT_GREEN if feature == "固定兵种" else TEXT_GOLD))
	column.add_child(_label(str(spec.get("description", "")), 14, TEXT_MAIN, HORIZONTAL_ALIGNMENT_CENTER))
	return panel

func _troop_arrow_button(text: String, action_id: String, disabled: bool = false) -> Button:
	var button := Button.new()
	button.text = text
	button.disabled = disabled
	button.custom_minimum_size = Vector2(38, 143)
	button.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	button.add_theme_font_size_override("font_size", 22)
	_apply_button_style(button, Color(0.020, 0.018, 0.015, 0.68), Color(BORDER_ACTIVE.r, BORDER_ACTIVE.g, BORDER_ACTIVE.b, 0.42), TEXT_GOLD)
	button.pressed.connect(Callable(self, "_on_general_action_pressed").bind(action_id))
	return button

func _troop_illustration_box(image_path: String, troop_label: String) -> Control:
	var panel := _panel(Color(0.0, 0.0, 0.0, 0.20), Color(0.0, 0.0, 0.0, 0.0), 0)
	panel.custom_minimum_size = Vector2(0, 430)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	panel.clip_contents = true
	var backdrop := ColorRect.new()
	backdrop.color = Color(0.015, 0.014, 0.012, 0.24)
	backdrop.set_anchors_preset(Control.PRESET_FULL_RECT)
	panel.add_child(backdrop)
	var texture := _load_portrait_texture(image_path)
	if texture != null:
		var image := TextureRect.new()
		image.name = "TroopIllustrationForeground"
		image.texture = texture
		image.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		image.set_anchors_preset(Control.PRESET_FULL_RECT)
		image.offset_left = 8.0
		image.offset_top = 0.0
		image.offset_right = -8.0
		image.offset_bottom = 0.0
		image.mouse_filter = Control.MOUSE_FILTER_IGNORE
		panel.add_child(image)
		_prepare_troop_illustration_transition(image)
	else:
		var fallback := _label("%s\n兵种插画待补" % troop_label, 14, TEXT_MUTED, HORIZONTAL_ALIGNMENT_CENTER)
		fallback.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		fallback.set_anchors_preset(Control.PRESET_FULL_RECT)
		panel.add_child(fallback)
	return panel

func _prepare_troop_illustration_transition(image: TextureRect) -> void:
	var direction := _troop_preview_slide_direction
	if direction == 0:
		image.modulate = Color(1.0, 1.0, 1.0, 1.0)
		return
	var shift := float(direction) * 18.0
	image.modulate = Color(1.0, 1.0, 1.0, 0.0)
	image.offset_left += shift
	image.offset_right += shift
	call_deferred("_run_troop_illustration_transition", image, shift)
	_troop_preview_slide_direction = 0

func _run_troop_illustration_transition(image: TextureRect, shift: float) -> void:
	if image == null or not is_instance_valid(image):
		return
	var target_left := image.offset_left - shift
	var target_right := image.offset_right - shift
	var tween := image.create_tween()
	tween.set_trans(Tween.TRANS_SINE)
	tween.set_ease(Tween.EASE_OUT)
	tween.tween_property(image, "modulate", Color(1.0, 1.0, 1.0, 1.0), 0.14)
	tween.parallel().tween_property(image, "offset_left", target_left, 0.14)
	tween.parallel().tween_property(image, "offset_right", target_right, 0.14)

func _troop_model_scene_for_label(troop_label: String) -> String:
	return ""

func _troop_model_image_for_label(troop_label: String) -> String:
	return _troop_illustration_for_label(troop_label)

func _build_troop_model_card(spec: Dictionary) -> Control:
	var normalized := spec.duplicate(true)
	if str(normalized.get("image", "")).strip_edges() == "":
		normalized["image"] = _troop_illustration_for_label(str(normalized.get("name", "")))
	if str(normalized.get("kind", "")).strip_edges() == "":
		normalized["kind"] = "普通兵种"
	return _build_troop_illustration_card(normalized, 0, 1)

func _build_legacy_troop_model_card(spec: Dictionary) -> Control:
	var selected := bool(spec.get("selected", false))
	var border := BORDER_ACTIVE if selected else BORDER_DATA
	var bg := Color(0.070, 0.064, 0.056, 0.78) if selected else Color(0.045, 0.043, 0.040, 0.64)
	var panel := _panel(bg, border, 3)
	panel.custom_minimum_size = Vector2(0, 600)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var margin := _margin(10, 10, 10, 10)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 8)
	margin.add_child(column)
	var top := HBoxContainer.new()
	top.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_child(top)
	top.add_child(_nowrap_label("✓" if selected else "", 24, TEXT_GOLD, HORIZONTAL_ALIGNMENT_LEFT))
	var percent_text := str(spec.get("percent", ""))
	var pick_label := str(spec.get("pick_label", ""))
	var pick := _nowrap_label("%s\n%s" % [percent_text, pick_label], 13, TEXT_GREEN if selected else TEXT_MUTED, HORIZONTAL_ALIGNMENT_RIGHT)
	pick.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(pick)
	var model_box := _troop_model_box(str(spec.get("scene", "")), str(spec.get("image", "")), str(spec.get("name", "")), selected)
	column.add_child(model_box)
	var features := HBoxContainer.new()
	features.alignment = BoxContainer.ALIGNMENT_CENTER
	features.add_theme_constant_override("separation", 8)
	column.add_child(features)
	for feature in _string_array(spec.get("features", [])):
		features.add_child(_chip(feature, TEXT_GREEN if feature == "可学习" else TEXT_GOLD))
	column.add_child(_nowrap_label(str(spec.get("name", "兵种")), 18, TEXT_GOLD, HORIZONTAL_ALIGNMENT_CENTER))
	column.add_child(_label(str(spec.get("description", "")), 14, TEXT_MAIN, HORIZONTAL_ALIGNMENT_CENTER))
	return panel

func _troop_model_box(scene_path: String, image_path: String, troop_label: String, selected: bool) -> Control:
	var panel := _panel(Color(0.0, 0.0, 0.0, 0.20), Color(0.0, 0.0, 0.0, 0.0), 0)
	panel.custom_minimum_size = Vector2(0, 430)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var preview := _build_troop_scene_preview(scene_path, image_path, troop_label)
	if preview != null:
		panel.add_child(preview)
	else:
		var texture := _load_troop_model_texture(image_path)
		if texture != null:
			var image := TextureRect.new()
			image.texture = texture
			image.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
			image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
			image.set_anchors_preset(Control.PRESET_FULL_RECT)
			panel.add_child(image)
		else:
			panel.add_child(_label("兵种模型待补", 14, TEXT_MUTED, HORIZONTAL_ALIGNMENT_CENTER))
	if selected:
		var glow := ColorRect.new()
		glow.color = Color(TEXT_GOLD.r, TEXT_GOLD.g, TEXT_GOLD.b, 0.05)
		glow.set_anchors_preset(Control.PRESET_FULL_RECT)
		glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
		panel.add_child(glow)
	return panel

func _build_troop_scene_preview(scene_path: String, image_path: String, troop_label: String) -> Control:
	var scene := _load_troop_scene(scene_path)
	if scene == null:
		return null
	var container := SubViewportContainer.new()
	container.custom_minimum_size = Vector2(0, 430)
	container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	container.size_flags_vertical = Control.SIZE_EXPAND_FILL
	container.stretch = true
	container.mouse_filter = Control.MOUSE_FILTER_STOP
	var viewport := SubViewport.new()
	viewport.size = Vector2i(980, 560)
	viewport.transparent_bg = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	container.add_child(viewport)

	var world := Node3D.new()
	viewport.add_child(world)
	var pivot := Node3D.new()
	pivot.name = "TroopPreviewPivot"
	pivot.rotation_degrees = Vector3(-5.0, _troop_preview_yaw(troop_label), 0.0)
	pivot.scale = Vector3.ONE * _troop_preview_scale(troop_label)
	world.add_child(pivot)
	var instance := scene.instantiate()
	if instance is Node3D:
		pivot.add_child(instance)
	else:
		return null

	var floor := MeshInstance3D.new()
	var floor_mesh := CylinderMesh.new()
	floor_mesh.top_radius = 1.25
	floor_mesh.bottom_radius = 1.25
	floor_mesh.height = 0.025
	floor_mesh.radial_segments = 96
	floor.mesh = floor_mesh
	floor.position = Vector3(0.0, -0.015, 0.0)
	floor.material_override = _troop_preview_material(Color(0.095, 0.095, 0.085, 0.92), 0.9, 0.0)
	pivot.add_child(floor)

	var key := DirectionalLight3D.new()
	key.light_energy = 1.7
	key.rotation_degrees = Vector3(-48.0, -36.0, 0.0)
	world.add_child(key)
	var fill := OmniLight3D.new()
	fill.position = Vector3(-1.8, 1.6, 2.3)
	fill.light_energy = 0.55
	fill.omni_range = 5.0
	world.add_child(fill)
	var rim := OmniLight3D.new()
	rim.position = Vector3(1.9, 2.0, 2.4)
	rim.light_color = Color(1.0, 0.74, 0.34, 1.0)
	rim.light_energy = 0.42
	rim.omni_range = 4.0
	world.add_child(rim)

	var camera := Camera3D.new()
	camera.position = _troop_camera_position(troop_label)
	camera.fov = 24.0
	camera.current = true
	world.add_child(camera)
	camera.look_at(_troop_camera_target(troop_label), Vector3.UP)

	var hint := _nowrap_label("拖拽旋转", 12, TEXT_MUTED, HORIZONTAL_ALIGNMENT_RIGHT)
	hint.anchor_left = 1.0
	hint.anchor_top = 1.0
	hint.anchor_right = 1.0
	hint.anchor_bottom = 1.0
	hint.offset_left = -120.0
	hint.offset_top = -28.0
	hint.offset_right = -10.0
	hint.offset_bottom = -6.0
	hint.mouse_filter = Control.MOUSE_FILTER_IGNORE
	container.add_child(hint)
	container.gui_input.connect(Callable(self, "_on_troop_preview_gui_input").bind(pivot))
	return container

func _load_troop_scene(scene_path: String) -> PackedScene:
	var resolved := scene_path.strip_edges()
	if resolved == "" or not ResourceLoader.exists(resolved):
		return null
	var resource := load(resolved)
	if resource is PackedScene:
		return resource as PackedScene
	return null

func _troop_preview_material(color: Color, roughness: float, metallic: float) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = roughness
	material.metallic = metallic
	return material

func _troop_preview_yaw(troop_label: String) -> float:
	match troop_label:
		"骑兵":
			return -12.0
		"弓兵":
			return 22.0
		_:
			return 18.0

func _troop_preview_scale(troop_label: String) -> float:
	match troop_label:
		"骑兵":
			return 1.30
		"弓兵":
			return 1.34
		_:
			return 1.34

func _troop_camera_position(troop_label: String) -> Vector3:
	match troop_label:
		"骑兵":
			return Vector3(0.0, 2.75, 1.45)
		"弓兵":
			return Vector3(0.0, 2.48, 1.55)
		_:
			return Vector3(0.0, 2.45, 1.58)

func _troop_camera_target(troop_label: String) -> Vector3:
	match troop_label:
		"骑兵":
			return Vector3(0.02, 0.0, 0.78)
		_:
			return Vector3(0.0, 0.0, 0.95)

func _on_troop_preview_gui_input(event: InputEvent, pivot: Node3D) -> void:
	if pivot == null or not is_instance_valid(pivot):
		return
	if event is InputEventMouseButton:
		var button_event := event as InputEventMouseButton
		if button_event.button_index == MOUSE_BUTTON_LEFT:
			pivot.set_meta("dragging", button_event.pressed)
			get_viewport().set_input_as_handled()
			return
	if event is InputEventMouseMotion and bool(pivot.get_meta("dragging", false)):
		var motion := event as InputEventMouseMotion
		pivot.rotation_degrees.y += motion.relative.x * 0.45
		pivot.rotation_degrees.x = clampf(pivot.rotation_degrees.x + motion.relative.y * 0.18, -16.0, 16.0)
		get_viewport().set_input_as_handled()
		return

func _load_troop_model_texture(image_path: String) -> Texture2D:
	var base := _load_portrait_texture(image_path)
	if base == null:
		return null
	if image_path.contains("/generated_troops/"):
		return base
	var atlas := AtlasTexture.new()
	atlas.atlas = base
	atlas.region = _troop_model_region(image_path)
	return atlas

func _troop_model_region(image_path: String) -> Rect2:
	if image_path.contains("/ld_"):
		return Rect2(34, 28, 92, 70)
	if image_path.contains("/rd_"):
		return Rect2(32, 29, 80, 72)
	if image_path.contains("/l_"):
		return Rect2(36, 22, 108, 76)
	return Rect2(52, 20, 78, 50)

func _build_growth_panel(entry: Dictionary) -> Control:
	var panel := _panel(BG_DATA, BORDER_DATA, 4)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(12, 12, 12, 12)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 10)
	margin.add_child(column)
	column.add_child(_label("养成入口", 17, TEXT_GOLD))
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 8)
	column.add_child(row)
	row.add_child(_growth_entry_card("等级", "Lv.%s" % str(entry.get("level", 1)), "%s / %s" % [str(entry.get("exp_current", 0)), str(entry.get("exp_max", 0))], TEXT_GOLD))
	row.add_child(_growth_entry_card("星级", _entry_star_text(entry), "红星 %s" % str(entry.get("red_stars", 0)), TEXT_GOLD))
	row.add_child(_growth_entry_card("兵力", "%s / %s" % [str(entry.get("soldier_current", 0)), str(entry.get("soldier_max", 10000))], "单将上限 10000", TEXT_BLUE))
	row.add_child(_growth_entry_card("体力", "%s / %s" % [str(entry.get("stamina_current", 0)), str(entry.get("stamina_max", 150))], "预览上限 150", TEXT_GREEN))
	column.add_child(_label("当前先收束展示结构，养成消耗、升星和战法升级动作保留为后续正式链。", 13, TEXT_MUTED))
	return panel

func _troop_summary_card(title: String, value: String, color: Color) -> Control:
	var panel := _panel(Color(color.r * 0.13, color.g * 0.13, color.b * 0.13, 0.78), Color(color.r, color.g, color.b, 0.70), 4)
	panel.custom_minimum_size = Vector2(0, 58)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(10, 7, 10, 7)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 2)
	margin.add_child(column)
	column.add_child(_label(title, 12, TEXT_MUTED, HORIZONTAL_ALIGNMENT_CENTER))
	column.add_child(_nowrap_label(value, 18, color, HORIZONTAL_ALIGNMENT_CENTER))
	return panel

func _growth_entry_card(title: String, value: String, meta: String, color: Color) -> Control:
	var panel := _panel(Color(color.r * 0.10, color.g * 0.10, color.b * 0.10, 0.70), Color(color.r, color.g, color.b, 0.62), 4)
	panel.custom_minimum_size = Vector2(0, 66)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(8, 7, 8, 7)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 2)
	margin.add_child(column)
	column.add_child(_label(title, 12, TEXT_MUTED, HORIZONTAL_ALIGNMENT_CENTER))
	column.add_child(_nowrap_label(value, 15, color, HORIZONTAL_ALIGNMENT_CENTER))
	column.add_child(_nowrap_label(meta, 11, TEXT_MUTED, HORIZONTAL_ALIGNMENT_CENTER))
	return panel

func _build_action_row(entry: Dictionary) -> Control:
	var panel := _panel(BG_ROW, BORDER, 4)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(10, 8, 10, 8)
	panel.add_child(margin)
	var row := HFlowContainer.new()
	row.add_theme_constant_override("h_separation", 8)
	row.add_theme_constant_override("v_separation", 8)
	margin.add_child(row)
	row.add_child(_action_button("进入详情", "open_hero_profile:%s" % str(entry.get("id", ""))))
	row.add_child(_action_button("上一位", "hero_prev"))
	row.add_child(_action_button("下一位", "hero_next"))
	row.add_child(_preview_action_chip("重置"))
	row.add_child(_preview_action_chip("攻略"))
	row.add_child(_preview_action_chip("分享"))
	row.add_child(_preview_action_chip("传承"))
	return panel

func _preview_action_chip(text: String) -> Control:
	var panel := _panel(BG_PANEL, BORDER, 3)
	panel.custom_minimum_size = Vector2(86, 34)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(8, 5, 8, 5)
	panel.add_child(margin)
	var label := _label(text, 15, TEXT_MUTED, HORIZONTAL_ALIGNMENT_CENTER)
	margin.add_child(label)
	return panel

func _stage_action_button(text: String, action_id: String) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(0, 34)
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.add_theme_font_size_override("font_size", 16)
	_apply_button_style(button, Color(0.020, 0.018, 0.015, 0.58), Color(BORDER_ACTIVE.r, BORDER_ACTIVE.g, BORDER_ACTIVE.b, 0.46), TEXT_MAIN)
	button.pressed.connect(Callable(self, "_on_general_action_pressed").bind(action_id))
	return button

func _build_portrait_frame(entry: Dictionary, size: Vector2) -> Control:
	var panel := _panel(Color(0.055, 0.052, 0.047, 1.0), BORDER_ACTIVE if bool(entry.get("is_active", false)) else BORDER, 4)
	panel.custom_minimum_size = size
	panel.clip_contents = true
	var texture := _load_portrait_texture(str(entry.get("portrait_path", "")))
	if texture != null:
		var image := TextureRect.new()
		image.texture = texture
		image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		image.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
		image.custom_minimum_size = size
		image.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		image.size_flags_vertical = Control.SIZE_EXPAND_FILL
		panel.add_child(image)
		return panel
	var fallback := _label("%s\n画像未接入" % str(entry.get("display_name", "将")).left(2), 18, TEXT_GOLD, HORIZONTAL_ALIGNMENT_CENTER)
	fallback.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	fallback.custom_minimum_size = size
	panel.add_child(fallback)
	return panel

func _load_portrait_texture(path: String) -> Texture2D:
	var resolved := path.strip_edges()
	if resolved == "":
		return null
	if ResourceLoader.exists(resolved):
		var resource := load(resolved)
		if resource is Texture2D:
			return resource as Texture2D
	var image := Image.new()
	var load_path := resolved
	if resolved.begins_with("res://"):
		load_path = ProjectSettings.globalize_path(resolved)
	var error := image.load(load_path)
	if error == OK:
		return ImageTexture.create_from_image(image)
	return null

func _action_button(text: String, action_id: String, disabled: bool = false) -> Button:
	var button := Button.new()
	button.text = text
	button.disabled = disabled
	button.custom_minimum_size = Vector2(82, 34)
	_apply_button_style(button, BG_PANEL, BORDER, TEXT_MAIN)
	button.pressed.connect(Callable(self, "_on_general_action_pressed").bind(action_id))
	return button

func _on_profile_page_button_pressed(page_id: String) -> void:
	var resolved := page_id.strip_edges()
	if resolved == "":
		return
	_active_page_id = resolved
	page_changed.emit(resolved)
	_refresh_panel()

func _on_general_action_pressed(action_id: String) -> void:
	var resolved := action_id.strip_edges()
	if resolved == "":
		return
	if resolved == "hero_prev":
		_switch_active_hero(-1)
		page_action_requested.emit(_active_page_id, resolved)
		return
	if resolved == "hero_next":
		_switch_active_hero(1)
		page_action_requested.emit(_active_page_id, resolved)
		return
	if resolved == "troop_preview_prev":
		_switch_troop_preview_variant(-1)
		page_action_requested.emit(_active_page_id, resolved)
		return
	if resolved == "troop_preview_next":
		_switch_troop_preview_variant(1)
		page_action_requested.emit(_active_page_id, resolved)
		return
	if resolved.begins_with("focus_hero:"):
		_focus_hero_by_id(resolved.trim_prefix("focus_hero:"))
		page_action_requested.emit(_active_page_id, resolved)
		return
	if resolved.begins_with("open_hero_profile:"):
		_focus_hero_by_id(resolved.trim_prefix("open_hero_profile:"))
		_active_page_id = "profile"
		page_changed.emit(_active_page_id)
		_refresh_panel()
		page_action_requested.emit(_active_page_id, resolved)
		return
	if resolved.begins_with("skill_detail:"):
		_show_skill_detail_popup(int(resolved.trim_prefix("skill_detail:")))
		page_action_requested.emit(_active_page_id, resolved)
		return
	if resolved.begins_with("library_skill_detail:"):
		_show_library_skill_detail_popup(resolved.trim_prefix("library_skill_detail:"))
		page_action_requested.emit(_active_page_id, resolved)
		return
	if resolved.begins_with("skill_library_filter:"):
		_apply_skill_library_filter(resolved.trim_prefix("skill_library_filter:"))
		page_action_requested.emit(_active_page_id, resolved)
		return
	page_action_requested.emit(_active_page_id, resolved)

func _switch_troop_preview_variant(delta: int) -> void:
	var variants := _troop_variant_specs(_active_entry())
	var count := variants.size()
	if count <= 1:
		return
	var next_index := _troop_preview_variant_index + delta
	if next_index < 0:
		next_index = count - 1
	elif next_index >= count:
		next_index = 0
	_troop_preview_variant_index = next_index
	_troop_preview_slide_direction = 1 if delta > 0 else -1
	_refresh_panel()

func _apply_skill_library_filter(payload: String) -> void:
	var parts := payload.split(":", false, 1)
	if parts.size() < 2:
		return
	var field := str(parts[0])
	var value := str(parts[1])
	if field == "reset":
		_skill_library_grade_filter = "全部"
		_skill_library_type_filter = "全部"
		_skill_library_troop_filter = "全部"
		_skill_library_tag_filter = "全部"
		_skill_library_source_filter = "全部"
		_skill_library_search_text = ""
		_skill_library_sort_mode = "品质"
	elif field == "grade":
		_skill_library_grade_filter = value
	elif field == "type":
		_skill_library_type_filter = value
	elif field == "troop":
		_skill_library_troop_filter = value
	elif field == "tag":
		_skill_library_tag_filter = value
	elif field == "source":
		_skill_library_source_filter = value
	elif field == "sort":
		_skill_library_sort_mode = value
	elif field == "toggle_tag":
		_skill_library_tag_filter_expanded = not _skill_library_tag_filter_expanded
	elif field == "toggle_source":
		_skill_library_source_filter_expanded = not _skill_library_source_filter_expanded
	elif field == "search_apply":
		_skill_library_search_text = _skill_library_search_text.strip_edges()
	elif field == "search_clear":
		_skill_library_search_text = ""
	_save_skill_library_ui_state()
	_refresh_panel()

func _on_skill_library_search_changed(value: String) -> void:
	_skill_library_search_text = value.strip_edges()
	_save_skill_library_ui_state()

func _on_skill_library_search_submitted(value: String) -> void:
	_skill_library_search_text = value.strip_edges()
	_save_skill_library_ui_state()
	_refresh_panel()

func _show_skill_detail_popup(skill_index: int) -> void:
	var skills := _dictionary_array(_active_entry().get("skills", []))
	if skill_index < 0 or skill_index >= skills.size() or not (skills[skill_index] is Dictionary):
		return
	var skill := skills[skill_index] as Dictionary
	_show_skill_detail_popup_for_skill(skill)

func _show_library_skill_detail_popup(skill_id: String) -> void:
	var normalized := skill_id.strip_edges()
	if normalized == "":
		return
	for skill_variant in _skill_library_entries():
		if not (skill_variant is Dictionary):
			continue
		var skill := skill_variant as Dictionary
		if str(skill.get("id", "")).strip_edges() == normalized:
			_show_skill_detail_popup_for_skill(skill)
			return

func _show_skill_detail_popup_for_skill(skill: Dictionary) -> void:
	if _skill_detail_dialog != null and is_instance_valid(_skill_detail_dialog):
		_skill_detail_dialog.queue_free()
	var popup_size := Vector2i(620, 430)
	var viewport_size := get_viewport_rect().size
	var popup_position := Vector2(
		clampf(viewport_size.x - float(popup_size.x) - 38.0, viewport_size.x * 0.54, viewport_size.x - float(popup_size.x) - 20.0),
		maxf(78.0, viewport_size.y * 0.17)
	)
	var grade_color := _skill_grade_color(_skill_grade_label(skill))
	var dialog := _panel(Color(grade_color.r * 0.055, grade_color.g * 0.045, grade_color.b * 0.035, 0.94), Color(grade_color.r, grade_color.g, grade_color.b, 0.94), 5)
	_skill_detail_dialog = dialog
	dialog.custom_minimum_size = Vector2(float(popup_size.x), float(popup_size.y))
	dialog.size = Vector2(float(popup_size.x), float(popup_size.y))
	dialog.position = popup_position
	dialog.z_index = 80
	dialog.mouse_filter = Control.MOUSE_FILTER_STOP
	dialog.add_child(_build_skill_popup_content(skill, popup_size))
	add_child(dialog)

func _build_skill_popup_content(skill: Dictionary, popup_size: Vector2i) -> Control:
	var grade := _skill_grade_label(skill)
	var type_label := _skill_type_label(skill)
	var grade_color := _skill_grade_color(grade)
	var margin := _margin(18, 12, 18, 14)
	margin.custom_minimum_size = Vector2(float(popup_size.x), float(popup_size.y))
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 9)
	margin.add_child(column)
	var top_bar := HBoxContainer.new()
	top_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_child(top_bar)
	var grade_badge := _nowrap_label(grade, 18, grade_color, HORIZONTAL_ALIGNMENT_LEFT)
	grade_badge.custom_minimum_size = Vector2(42, 0)
	top_bar.add_child(grade_badge)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top_bar.add_child(spacer)
	var close_button := Button.new()
	close_button.text = "×"
	close_button.custom_minimum_size = Vector2(36, 32)
	close_button.add_theme_font_size_override("font_size", 18)
	_apply_button_style(close_button, Color(0.18, 0.07, 0.055, 0.86), Color(TEXT_RED.r, TEXT_RED.g, TEXT_RED.b, 0.70), TEXT_MAIN)
	close_button.pressed.connect(Callable(self, "_close_skill_detail_popup"))
	top_bar.add_child(close_button)

	var emblem_row := HBoxContainer.new()
	emblem_row.alignment = BoxContainer.ALIGNMENT_CENTER
	column.add_child(emblem_row)
	emblem_row.add_child(_skill_popup_emblem(skill, grade_color, type_label))
	column.add_child(_nowrap_label("Lv.%s" % _compact_number_label(skill.get("level", 10)), 24, grade_color, HORIZONTAL_ALIGNMENT_CENTER))
	var detail_panel := _panel(Color(0.0, 0.0, 0.0, 0.20), Color(0.0, 0.0, 0.0, 0.0), 0)
	detail_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var detail_margin := _margin(10, 6, 10, 6)
	detail_panel.add_child(detail_margin)
	var detail_row := HBoxContainer.new()
	detail_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	detail_row.add_theme_constant_override("separation", 12)
	detail_margin.add_child(detail_row)
	detail_row.add_child(_nowrap_label("战法", 17, TEXT_GOLD, HORIZONTAL_ALIGNMENT_CENTER))
	var description := _label(_skill_popup_description(skill), 16, TEXT_MAIN)
	description.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	detail_row.add_child(description)
	column.add_child(detail_panel)
	return margin

func _skill_popup_emblem(skill: Dictionary, grade_color: Color, type_label: String) -> Control:
	var frame := _panel(Color(0.0, 0.0, 0.0, 0.42), Color(grade_color.r, grade_color.g, grade_color.b, 0.92), 70)
	frame.custom_minimum_size = Vector2(142, 142)
	var margin := _margin(14, 12, 14, 12)
	frame.add_child(margin)
	var column := VBoxContainer.new()
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	column.add_theme_constant_override("separation", 4)
	margin.add_child(column)
	var icon := TextureRect.new()
	icon.texture = _load_skill_type_icon(type_label)
	icon.custom_minimum_size = Vector2(48, 48)
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.modulate = grade_color
	column.add_child(icon)
	column.add_child(_nowrap_label(str(skill.get("name", "战法")), 18, TEXT_MAIN, HORIZONTAL_ALIGNMENT_CENTER))
	return frame

func _skill_popup_description(skill: Dictionary) -> String:
	var lines: Array[String] = []
	for key in ["description", "trigger", "target", "effect"]:
		var value := str(skill.get(key, "")).strip_edges()
		if value != "":
			lines.append(value)
	var recommended_slot := str(skill.get("recommended_slot", "")).strip_edges()
	var combat_role := str(skill.get("combat_role", "")).strip_edges()
	if recommended_slot != "" or combat_role != "":
		var profile_parts: Array[String] = []
		if recommended_slot != "" and recommended_slot != "任意":
			profile_parts.append("建议位：" + recommended_slot)
		if combat_role != "":
			profile_parts.append("定位：" + combat_role)
		lines.append(" / ".join(profile_parts))
	var attribute_effects := _format_skill_attribute_effects(skill.get("attribute_effects", {}))
	if attribute_effects != "":
		lines.append(attribute_effects)
	if lines.is_empty():
		return "待配置战法描述。"
	return "\n".join(lines)

func _skill_popup_line(label_text: String, value_text: String, value_color: Color) -> Control:
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 10)
	var label := _nowrap_label(label_text, 15, TEXT_GOLD, HORIZONTAL_ALIGNMENT_CENTER)
	label.custom_minimum_size = Vector2(42, 0)
	row.add_child(label)
	var value := _label(value_text if value_text != "" else "待配置", 15, value_color)
	value.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(value)
	return row

func _skill_grade_label(skill: Dictionary) -> String:
	var grade := str(skill.get("grade", "S")).strip_edges().to_upper()
	return grade if ["S", "A", "B"].has(grade) else "B"

func _skill_grade_color(grade: String) -> Color:
	match grade.to_upper():
		"S":
			return TEXT_GOLD
		"A":
			return Color(0.74, 0.42, 0.94, 1.0)
		"B":
			return TEXT_BLUE
		_:
			return TEXT_BLUE

func _skill_type_label(skill: Dictionary) -> String:
	var raw := str(skill.get("type", "主动")).strip_edges()
	match raw:
		"指挥":
			return "指挥"
		"被动":
			return "被动"
		"追击", "突击":
			return "追击"
		"主动", "恢复":
			return "主动"
		_:
			return "主动"

func _load_skill_type_icon(type_label: String) -> Texture2D:
	var icon_path := SKILL_TYPE_ICON_ACTIVE
	if type_label == "指挥":
		icon_path = SKILL_TYPE_ICON_COMMAND
	elif type_label == "被动":
		icon_path = SKILL_TYPE_ICON_PASSIVE
	elif type_label == "追击":
		icon_path = SKILL_TYPE_ICON_CHASE
	return _load_portrait_texture(icon_path)

func _close_skill_detail_popup() -> void:
	if _skill_detail_dialog != null and is_instance_valid(_skill_detail_dialog):
		_skill_detail_dialog.queue_free()
	_skill_detail_dialog = null

func _skill_popup_row(label_text: String, value_text: String, value_color: Color) -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	var label := _nowrap_label(label_text, 15, TEXT_GOLD, HORIZONTAL_ALIGNMENT_CENTER)
	label.custom_minimum_size = Vector2(42, 0)
	row.add_child(label)
	var value := _label(value_text if value_text != "" else "待配置", 15, value_color)
	value.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(value)
	return row

func _skill_popup_text(skill: Dictionary) -> String:
	var lines: Array[String] = []
	lines.append("品质：%s    等级：Lv.%s    类型：%s" % [str(skill.get("grade", "S")), _compact_number_label(skill.get("level", 10)), str(skill.get("type", "战法"))])
	var description := str(skill.get("description", "")).strip_edges()
	if description != "":
		lines.append("")
		lines.append("说明：" + description)
	var trigger := str(skill.get("trigger", "")).strip_edges()
	if trigger != "":
		lines.append("触发：" + trigger)
	var target := str(skill.get("target", "")).strip_edges()
	if target != "":
		lines.append("目标：" + target)
	var effect := str(skill.get("effect", "")).strip_edges()
	if effect != "":
		lines.append("效果：" + effect)
	var attribute_effects := _format_skill_attribute_effects(skill.get("attribute_effects", {}))
	if attribute_effects != "":
		lines.append("属性：" + attribute_effects)
	return "\n".join(lines)

func _switch_active_hero(delta: int) -> bool:
	var entries := _roster_entries()
	if entries.is_empty():
		return false
	var active_id := str(_shared_state().get("active_hero_id", _active_entry().get("id", ""))).strip_edges()
	var active_index := 0
	for index in range(entries.size()):
		if entries[index] is Dictionary and str((entries[index] as Dictionary).get("id", "")).strip_edges() == active_id:
			active_index = index
			break
	var next_index := (active_index + delta + entries.size()) % entries.size()
	return _apply_active_roster_index(next_index)

func _focus_hero_by_id(hero_id: String) -> bool:
	var resolved := hero_id.strip_edges()
	if resolved == "":
		return false
	var entries := _roster_entries()
	for index in range(entries.size()):
		if entries[index] is Dictionary and str((entries[index] as Dictionary).get("id", "")).strip_edges() == resolved:
			return _apply_active_roster_index(index)
	return false

func _apply_active_roster_index(active_index: int) -> bool:
	var shared: Dictionary = _shared_state().duplicate(true)
	var entries := _roster_entries()
	if entries.is_empty() or active_index < 0 or active_index >= entries.size():
		return false
	var updated_entries: Array = []
	var active_entry: Dictionary = {}
	for index in range(entries.size()):
		if not (entries[index] is Dictionary):
			continue
		var entry := (entries[index] as Dictionary).duplicate(true)
		entry["is_active"] = index == active_index
		if index == active_index:
			active_entry = entry.duplicate(true)
		updated_entries.append(entry)
	if active_entry.is_empty():
		return false
	shared["roster_entries"] = updated_entries
	shared["active_hero_profile"] = active_entry
	shared["active_hero_id"] = str(active_entry.get("id", ""))
	_snapshot["shared_state"] = shared
	_refresh_panel()
	return true

func _entry_location_line(entry: Dictionary) -> String:
	var unit_id := str(entry.get("unit_id", "")).strip_edges()
	var corps_name := str(entry.get("corps_name", "")).strip_edges()
	if unit_id == "":
		return "当前未编入部队"
	var parts: Array[String] = []
	var readiness := int(entry.get("readiness", 0))
	if readiness > 0:
		parts.append("战备 %s" % str(readiness))
	var role_label := str(entry.get("role_label", "")).strip_edges()
	if role_label != "" and role_label != "reserve":
		parts.append(role_label)
	if corps_name != "":
		parts.append(corps_name)
	var current_task := str(entry.get("current_task", "")).strip_edges()
	if current_task != "" and corps_name == "":
		parts.append(current_task)
	if parts.is_empty():
		parts.append("已编入部队")
	return " · ".join(parts)

func _entry_name_variant_line(entry: Dictionary) -> String:
	var name := str(entry.get("display_name", "待补位")).strip_edges()
	var variant_tag := str(entry.get("variant_tag", "")).strip_edges()
	if variant_tag == "":
		var quality := str(entry.get("quality", "")).strip_edges()
		if quality.contains("-"):
			variant_tag = quality.get_slice("-", 1).strip_edges()
	var faction := _faction_label(entry)
	if variant_tag != "":
		return "%s  %s · %s" % [name, variant_tag, faction]
	return "%s · %s" % [name, faction]

func _stat_badge(title: String, value: String) -> Control:
	var panel := _panel(BG_ROW, BORDER, 4)
	panel.custom_minimum_size = Vector2(72, 62)
	var margin := _margin(8, 6, 8, 6)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 2)
	margin.add_child(column)
	column.add_child(_label(title, 11, TEXT_MUTED, HORIZONTAL_ALIGNMENT_CENTER))
	column.add_child(_label(value, 19, TEXT_GOLD, HORIZONTAL_ALIGNMENT_CENTER))
	return panel

func _stat_bar(title: String, value: int, color: Color) -> Control:
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 8)
	row.add_child(_small_tag(title, 48, TEXT_MAIN))
	var bar := ProgressBar.new()
	bar.min_value = 0
	bar.max_value = 260
	bar.value = clamp(value, 0, 260)
	bar.show_percentage = false
	bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var background_style := StyleBoxFlat.new()
	background_style.bg_color = Color(0.06, 0.06, 0.055, 0.86)
	bar.add_theme_stylebox_override("background", background_style)
	var fill_style := StyleBoxFlat.new()
	fill_style.bg_color = color
	bar.add_theme_stylebox_override("fill", fill_style)
	row.add_child(bar)
	var value_label := _label(str(value), 13, color, HORIZONTAL_ALIGNMENT_RIGHT)
	value_label.custom_minimum_size = Vector2(36, 0)
	row.add_child(value_label)
	return row

func _progress_line(title: String, current_value: int, max_value: int, color: Color) -> Control:
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 8)
	row.add_child(_small_tag(title, 64, TEXT_MAIN))
	var bar := ProgressBar.new()
	bar.custom_minimum_size = Vector2(0, 20)
	bar.min_value = 0
	bar.max_value = float(maxi(max_value, 1))
	bar.value = float(clampi(current_value, 0, int(bar.max_value)))
	bar.show_percentage = false
	bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var background_style := StyleBoxFlat.new()
	background_style.bg_color = Color(0.06, 0.06, 0.055, 0.92)
	bar.add_theme_stylebox_override("background", background_style)
	var fill_style := StyleBoxFlat.new()
	fill_style.bg_color = color
	bar.add_theme_stylebox_override("fill", fill_style)
	row.add_child(bar)
	var value_label := _label("%s / %s" % [str(current_value), str(max_value)], 19, TEXT_MUTED, HORIZONTAL_ALIGNMENT_RIGHT)
	value_label.custom_minimum_size = Vector2(150, 0)
	row.add_child(value_label)
	return row

func _small_tag(text: String, min_width: int, color: Color) -> Control:
	var panel := _panel(Color(0.0, 0.0, 0.0, 0.82), Color(0.0, 0.0, 0.0, 0.0), 1)
	panel.custom_minimum_size = Vector2(min_width, 32)
	var margin := _margin(5, 2, 5, 2)
	panel.add_child(margin)
	var label := _nowrap_label(text, 17, color, HORIZONTAL_ALIGNMENT_CENTER)
	margin.add_child(label)
	return panel

func _build_skill_orb(title: String, grade: String, level_text: String, type_text: String, color: Color) -> Control:
	var panel := _panel(Color(color.r * 0.08, color.g * 0.08, color.b * 0.08, 0.72), Color(color.r, color.g, color.b, 0.52), 4)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.custom_minimum_size = Vector2(0, 124)
	var margin := _margin(8, 8, 8, 8)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 5)
	margin.add_child(column)
	var icon_row := HBoxContainer.new()
	icon_row.alignment = BoxContainer.ALIGNMENT_CENTER
	column.add_child(icon_row)
	icon_row.add_child(_skill_circle(grade, level_text, color))
	column.add_child(_nowrap_label(title, 14, TEXT_MAIN, HORIZONTAL_ALIGNMENT_CENTER))
	column.add_child(_nowrap_label(type_text, 11, TEXT_MUTED, HORIZONTAL_ALIGNMENT_CENTER))
	return panel

func _skill_circle(grade: String, level_text: String, color: Color) -> Control:
	var frame := _panel(Color(0.03, 0.03, 0.03, 0.90), Color(color.r, color.g, color.b, 0.92), 36)
	frame.custom_minimum_size = Vector2(72, 72)
	var margin := _margin(6, 6, 6, 6)
	frame.add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 0)
	margin.add_child(column)
	column.add_child(_nowrap_label(grade, 21, color, HORIZONTAL_ALIGNMENT_CENTER))
	column.add_child(_nowrap_label(level_text, 11, TEXT_MUTED, HORIZONTAL_ALIGNMENT_CENTER))
	return frame

func _skill_description_panel(details: Array[String], fallback: String) -> Control:
	var panel := _panel(Color(0.0, 0.0, 0.0, 0.30), Color(0.0, 0.0, 0.0, 0.0), 0)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(8, 6, 8, 6)
	panel.add_child(margin)
	var text := "\n".join(details) if not details.is_empty() else fallback
	margin.add_child(_label(text, 13, TEXT_MUTED))
	return panel

func _panel(bg: Color, border: Color, radius: int = 4) -> PanelContainer:
	var panel := PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = bg
	style.border_color = border
	style.set_border_width_all(1)
	style.set_corner_radius_all(radius)
	panel.add_theme_stylebox_override("panel", style)
	return panel

func _apply_button_style(button: Button, bg: Color, border: Color, font_color: Color) -> void:
	var normal_style := StyleBoxFlat.new()
	normal_style.bg_color = bg
	normal_style.border_color = border
	normal_style.set_border_width_all(1)
	normal_style.set_corner_radius_all(4)
	button.add_theme_stylebox_override("normal", normal_style)
	var hover_style: StyleBoxFlat = normal_style.duplicate()
	hover_style.bg_color = bg.lightened(0.06)
	button.add_theme_stylebox_override("hover", hover_style)
	var pressed_style: StyleBoxFlat = normal_style.duplicate()
	pressed_style.bg_color = bg.darkened(0.06)
	button.add_theme_stylebox_override("pressed", pressed_style)
	button.add_theme_stylebox_override("disabled", normal_style)
	button.add_theme_color_override("font_color", font_color)
	button.add_theme_color_override("font_hover_color", font_color)
	button.add_theme_color_override("font_pressed_color", font_color)
	button.add_theme_color_override("font_disabled_color", font_color)

func _margin(left: int, top: int, right: int, bottom: int) -> MarginContainer:
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", left)
	margin.add_theme_constant_override("margin_top", top)
	margin.add_theme_constant_override("margin_right", right)
	margin.add_theme_constant_override("margin_bottom", bottom)
	return margin

func _label(text: String, size: int, color: Color, align: HorizontalAlignment = HORIZONTAL_ALIGNMENT_LEFT) -> Label:
	var label := Label.new()
	label.text = text
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.horizontal_alignment = align
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", color)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return label

func _nowrap_label(text: String, size: int, color: Color, align: HorizontalAlignment = HORIZONTAL_ALIGNMENT_LEFT) -> Label:
	var label := _label(text, size, color, align)
	label.autowrap_mode = TextServer.AUTOWRAP_OFF
	label.clip_text = true
	return label

func _meta_label(text: String, color: Color, min_width: int) -> Label:
	var label := _nowrap_label(text, 17, color, HORIZONTAL_ALIGNMENT_CENTER)
	label.custom_minimum_size = Vector2(min_width, 0)
	label.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	return label

func _compact_number_label(raw_value: Variant) -> String:
	var text := str(raw_value).strip_edges()
	if text == "":
		return "-"
	if text.ends_with(".0"):
		return text.left(text.length() - 2)
	return text

func _vertical_rule() -> ColorRect:
	var rule := ColorRect.new()
	rule.color = Color(BORDER_ACTIVE.r, BORDER_ACTIVE.g, BORDER_ACTIVE.b, 0.42)
	rule.custom_minimum_size = Vector2(1, 24)
	rule.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	return rule

func _chip(text: String, color: Color) -> Control:
	var panel := _panel(Color(color.r * 0.25, color.g * 0.25, color.b * 0.25, 0.88), Color(color.r, color.g, color.b, 0.88), 4)
	panel.custom_minimum_size = Vector2(maxi(58, text.length() * 13 + 18), 30)
	var margin := _margin(8, 5, 8, 5)
	panel.add_child(margin)
	var label := _nowrap_label(text, 12, color)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	margin.add_child(label)
	return panel

func _mini_chip(text: String) -> Control:
	return _chip(text, TEXT_MUTED)

func _empty_panel(title: String, body: String) -> Control:
	var panel := _panel(BG_ROW, BORDER, 4)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(12, 12, 12, 12)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 6)
	margin.add_child(column)
	column.add_child(_label(title, 16, TEXT_GOLD))
	column.add_child(_label(body, 13, TEXT_MUTED))
	return panel

func _shared_state() -> Dictionary:
	return _snapshot.get("shared_state", {}) as Dictionary

func _load_skill_library_ui_state() -> void:
	var raw_state: Variant = _shared_state().get("skill_library_ui_state", {})
	if not (raw_state is Dictionary):
		return
	var state := raw_state as Dictionary
	_skill_library_grade_filter = str(state.get("grade", _skill_library_grade_filter))
	_skill_library_type_filter = str(state.get("type", _skill_library_type_filter))
	_skill_library_troop_filter = str(state.get("troop", _skill_library_troop_filter))
	_skill_library_tag_filter = str(state.get("tag", _skill_library_tag_filter))
	_skill_library_source_filter = str(state.get("source", _skill_library_source_filter))
	_skill_library_search_text = str(state.get("search", _skill_library_search_text)).strip_edges()
	_skill_library_sort_mode = str(state.get("sort", _skill_library_sort_mode))
	_skill_library_source_filter_expanded = bool(state.get("source_expanded", _skill_library_source_filter_expanded))
	_skill_library_tag_filter_expanded = bool(state.get("tag_expanded", _skill_library_tag_filter_expanded))

func _save_skill_library_ui_state() -> void:
	var shared := _shared_state().duplicate(true)
	shared["skill_library_ui_state"] = {
		"grade": _skill_library_grade_filter,
		"type": _skill_library_type_filter,
		"troop": _skill_library_troop_filter,
		"tag": _skill_library_tag_filter,
		"source": _skill_library_source_filter,
		"search": _skill_library_search_text,
		"sort": _skill_library_sort_mode,
		"source_expanded": _skill_library_source_filter_expanded,
		"tag_expanded": _skill_library_tag_filter_expanded,
	}
	_snapshot["shared_state"] = shared

func _roster_entries() -> Array:
	var entries: Variant = _shared_state().get("roster_entries", [])
	return entries as Array if entries is Array else []

func _active_entry() -> Dictionary:
	var active: Variant = _shared_state().get("active_hero_profile", {})
	if active is Dictionary and not (active as Dictionary).is_empty():
		return active as Dictionary
	var entries := _roster_entries()
	if not entries.is_empty() and entries[0] is Dictionary:
		return entries[0] as Dictionary
	return {}

func _string_array(raw_value: Variant) -> Array:
	var result: Array = []
	if not (raw_value is Array):
		return result
	for item in raw_value as Array:
		var text := str(item).strip_edges()
		if text != "":
			result.append(text)
	return result

func _dictionary_array(raw_value: Variant) -> Array:
	var result: Array = []
	if not (raw_value is Array):
		return result
	for item in raw_value as Array:
		if item is Dictionary:
			result.append(item as Dictionary)
	return result
