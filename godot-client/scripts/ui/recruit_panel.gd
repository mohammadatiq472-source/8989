extends "res://scripts/ui/slg_snapshot_panel.gd"
class_name RecruitPanel

const BG_ROOT := Color(0.045, 0.041, 0.034, 0.98)
const BG_PANEL := Color(0.075, 0.066, 0.052, 0.92)
const BG_PANEL_ALT := Color(0.105, 0.088, 0.060, 0.88)
const BG_CARD := Color(0.038, 0.036, 0.031, 0.86)
const BG_CARD_ACTIVE := Color(0.16, 0.115, 0.060, 0.92)
const BORDER := Color(0.44, 0.34, 0.17, 0.56)
const BORDER_ACTIVE := Color(0.92, 0.68, 0.25, 0.92)
const TEXT_MAIN := Color(0.94, 0.91, 0.84, 1.0)
const TEXT_MUTED := Color(0.69, 0.66, 0.57, 1.0)
const TEXT_GOLD := Color(0.96, 0.73, 0.32, 1.0)
const TEXT_GREEN := Color(0.45, 0.72, 0.44, 1.0)
const TEXT_BLUE := Color(0.48, 0.61, 0.82, 1.0)
const TEXT_RED := Color(0.84, 0.34, 0.25, 1.0)

func _init() -> void:
	panel_title = "招募"
	panel_subtitle = "卡池 / 单招 / 五连 / 结果"
	panel_empty_state_text = "等待招募域数据。"

func set_recruit_snapshot(snapshot: Dictionary) -> void:
	set_snapshot(snapshot)

func _refresh_panel() -> void:
	if _panel_host == null or not is_instance_valid(_panel_host):
		return
	var tabs: Array = _snapshot.get("tabs", []) as Array
	if _active_page_id == "":
		_active_page_id = _resolve_default_page_id()
	_panel_host.call("set_panel_title", str(_snapshot.get("title", panel_title)))
	_panel_host.call("set_back_button_label", "返回主壳")
	_panel_host.call("set_close_button_label", "关闭")
	_panel_host.call("set_empty_state_text", str(_snapshot.get("empty_state_text", panel_empty_state_text)))
	_panel_host.call("set_tabs", tabs)
	if _panel_host.has_method("set_header_visible"):
		_panel_host.call("set_header_visible", true)
	if _panel_host.has_method("set_body_margins"):
		_panel_host.call("set_body_margins", 0, 0, 0, 0)
	if _panel_host.has_method("set_content_margins"):
		_panel_host.call("set_content_margins", 0, 0, 0, 0)
	if _panel_host.has_method("set_content_frame_transparent"):
		_panel_host.call("set_content_frame_transparent", true)
	if _active_page_id != "":
		_panel_host.call("set_active_tab", _active_page_id)
	var section := _resolve_active_section_payload()
	if section.is_empty():
		_panel_host.call("show_empty_state", str(_snapshot.get("empty_state_text", panel_empty_state_text)))
		return
	_panel_host.call("set_content_node", _build_recruit_page(section))

func _build_recruit_page(section: Dictionary) -> Control:
	var scroll := ScrollContainer.new()
	scroll.name = "RecruitFormalScroll"
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL

	var root_panel := _panel(BG_ROOT, Color(0.0, 0.0, 0.0, 0.0), 0)
	root_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(root_panel)

	var root_margin := _margin(18, 16, 18, 18)
	root_panel.add_child(root_margin)

	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 12)
	root_margin.add_child(column)

	column.add_child(_build_status_header(section))

	var body := HBoxContainer.new()
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 14)
	column.add_child(body)

	var rail := VBoxContainer.new()
	rail.custom_minimum_size = Vector2(360, 0)
	rail.size_flags_vertical = Control.SIZE_EXPAND_FILL
	rail.add_theme_constant_override("separation", 10)
	body.add_child(rail)
	rail.add_child(_build_page_summary_panel(section))
	rail.add_child(_build_item_list_panel(section))

	var content := VBoxContainer.new()
	content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	content.size_flags_vertical = Control.SIZE_EXPAND_FILL
	content.add_theme_constant_override("separation", 10)
	body.add_child(content)
	for block in _dictionary_array(section.get("content_blocks", [])):
		content.add_child(_build_content_block(block))
	return scroll

func _build_status_header(section: Dictionary) -> Control:
	var shared := _shared_state()
	var panel := _panel(BG_PANEL_ALT, BORDER_ACTIVE, 5)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(14, 12, 14, 12)
	panel.add_child(margin)
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 12)
	margin.add_child(row)

	var title_box := VBoxContainer.new()
	title_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_box.add_theme_constant_override("separation", 4)
	row.add_child(title_box)
	title_box.add_child(_label(str(section.get("summary_title", "招募")), 22, TEXT_GOLD))
	title_box.add_child(_label(_section_intro_line(section), 13, TEXT_MUTED))

	var status_grid := GridContainer.new()
	status_grid.columns = 4
	status_grid.custom_minimum_size = Vector2(620, 0)
	status_grid.add_theme_constant_override("h_separation", 8)
	status_grid.add_theme_constant_override("v_separation", 8)
	row.add_child(status_grid)
	status_grid.add_child(_status_chip("卡池", str(shared.get("selected_pool_label", "未选择")), TEXT_GOLD))
	status_grid.add_child(_status_chip("可抽", str(shared.get("available_draw_count", 0)), TEXT_GREEN))
	status_grid.add_child(_status_chip("结果", str(shared.get("latest_result_label", "暂无结果")), TEXT_BLUE))
	status_grid.add_child(_status_chip("边界", "preview-only", TEXT_MUTED))
	return panel

func _build_page_summary_panel(section: Dictionary) -> Control:
	var panel := _panel(BG_PANEL, BORDER, 5)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(12, 12, 12, 12)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 8)
	margin.add_child(column)
	column.add_child(_label(_page_label(_active_page_id), 18, TEXT_GOLD))
	for line in _string_array(section.get("summary_lines", [])):
		column.add_child(_label(line, 13, TEXT_MUTED))
	var shared := _shared_state()
	column.add_child(_thin_separator())
	column.add_child(_metric_row("当前卡池", str(shared.get("selected_pool_label", "未选择"))))
	column.add_child(_metric_row("可抽次数", str(shared.get("available_draw_count", 0))))
	column.add_child(_metric_row("概率摘要", str(shared.get("preview_probability_group_summary", "未读取"))))
	column.add_child(_metric_row("最近回执", str(shared.get("runtime_receipt_summary", "未记录"))))
	return panel

func _build_item_list_panel(section: Dictionary) -> Control:
	var panel := _panel(BG_PANEL, BORDER, 5)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var margin := _margin(12, 12, 12, 12)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 8)
	margin.add_child(column)
	column.add_child(_label(str(section.get("list_title", "列表")), 18, TEXT_GOLD))
	var cards := _dictionary_array(section.get("item_cards", []))
	if cards.is_empty():
		column.add_child(_empty_panel("暂无条目", "等待 presenter 提供招募状态。"))
	else:
		for card in cards:
			column.add_child(_build_list_card(card))
	return panel

func _build_content_block(block: Dictionary) -> Control:
	match str(block.get("kind", "")):
		"card_grid":
			return _build_card_grid_block(block)
		"text_block":
			return _build_text_block(block)
		"button_row":
			return _build_button_row_block(block)
		_:
			return _empty_panel(str(block.get("title", "未支持区块")), "该区块类型暂未接入正式招募页。")

func _build_card_grid_block(block: Dictionary) -> Control:
	var panel := _panel(BG_PANEL, BORDER, 5)
	panel.name = str(block.get("node_name", "RecruitCardGridBlock"))
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(12, 12, 12, 12)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 10)
	margin.add_child(column)
	column.add_child(_label(str(block.get("title", "卡片")), 18, TEXT_GOLD))
	var grid := GridContainer.new()
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.columns = clampi(int(block.get("columns", 2)), 1, 4)
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	column.add_child(grid)
	for card in _dictionary_array(block.get("cards", [])):
		grid.add_child(_build_data_card(card))
	return panel

func _build_text_block(block: Dictionary) -> Control:
	var panel := _panel(BG_PANEL, BORDER, 5)
	panel.name = str(block.get("node_name", "RecruitTextBlock"))
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(12, 12, 12, 12)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 7)
	margin.add_child(column)
	column.add_child(_label(str(block.get("title", "说明")), 18, TEXT_GOLD))
	for line in _string_array(block.get("lines", [])):
		column.add_child(_label(line, 13, TEXT_MUTED))
	return panel

func _build_button_row_block(block: Dictionary) -> Control:
	var panel := _panel(BG_PANEL, BORDER, 5)
	panel.name = str(block.get("node_name", "RecruitButtonRowBlock"))
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(12, 12, 12, 12)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 10)
	margin.add_child(column)
	column.add_child(_label(str(block.get("title", "动作")), 18, TEXT_GOLD))
	var row := HFlowContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("h_separation", 8)
	row.add_theme_constant_override("v_separation", 8)
	column.add_child(row)
	for action in _dictionary_array(block.get("actions", [])):
		var button := Button.new()
		var action_id := str(action.get("id", "")).strip_edges()
		button.name = "RecruitAction_%s" % action_id
		button.text = str(action.get("label", action_id))
		button.disabled = bool(action.get("disabled", false))
		button.custom_minimum_size = Vector2(132, 42)
		_apply_button_style(button, BG_CARD_ACTIVE if not button.disabled else BG_CARD, BORDER_ACTIVE if not button.disabled else BORDER, TEXT_GOLD if not button.disabled else TEXT_MUTED)
		button.pressed.connect(Callable(self, "_on_recruit_action_pressed").bind(action_id))
		row.add_child(button)
	return panel

func _build_list_card(card: Dictionary) -> Control:
	var panel := _panel(BG_CARD, BORDER, 4)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(10, 9, 10, 9)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 4)
	margin.add_child(column)
	column.add_child(_label(str(card.get("title", "")), 15, TEXT_MAIN))
	column.add_child(_label(str(card.get("value", "")), 13, TEXT_GOLD))
	column.add_child(_label(str(card.get("meta", "")), 12, TEXT_MUTED))
	column.add_child(_label(str(card.get("description", "")), 12, TEXT_MUTED))
	return panel

func _build_data_card(card: Dictionary) -> Control:
	var value := _resolve_card_value(card, "value", "value_key")
	var meta := _resolve_card_value(card, "meta", "meta_key")
	var description := _resolve_card_value(card, "description", "description_key")
	var tone_color := _tone_color(str(card.get("tone", "")))
	var panel := _panel(BG_CARD, Color(tone_color.r, tone_color.g, tone_color.b, 0.50), 4)
	panel.custom_minimum_size = Vector2(190, 108)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(10, 9, 10, 9)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 4)
	margin.add_child(column)
	column.add_child(_label(str(card.get("title", "")), 13, TEXT_MUTED))
	column.add_child(_label(value, 18, tone_color))
	if meta != "":
		column.add_child(_label(meta, 12, TEXT_MAIN))
	if description != "":
		column.add_child(_label(description, 12, TEXT_MUTED))
	return panel

func _status_chip(title: String, value: String, color: Color) -> Control:
	var panel := _panel(BG_CARD, Color(color.r, color.g, color.b, 0.50), 4)
	panel.custom_minimum_size = Vector2(144, 58)
	var margin := _margin(8, 6, 8, 6)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 2)
	margin.add_child(column)
	column.add_child(_label(title, 11, TEXT_MUTED, HORIZONTAL_ALIGNMENT_CENTER))
	column.add_child(_label(value, 15, color, HORIZONTAL_ALIGNMENT_CENTER))
	return panel

func _metric_row(title: String, value: String) -> Control:
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 8)
	row.add_child(_label(title, 12, TEXT_MUTED))
	var value_label := _label(value, 12, TEXT_MAIN, HORIZONTAL_ALIGNMENT_RIGHT)
	value_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(value_label)
	return row

func _thin_separator() -> Control:
	var line := ColorRect.new()
	line.custom_minimum_size = Vector2(0, 1)
	line.color = Color(BORDER.r, BORDER.g, BORDER.b, 0.50)
	return line

func _empty_panel(title: String, description: String) -> Control:
	var panel := _panel(BG_CARD, BORDER, 4)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(12, 12, 12, 12)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 6)
	margin.add_child(column)
	column.add_child(_label(title, 16, TEXT_GOLD))
	column.add_child(_label(description, 13, TEXT_MUTED))
	return panel

func _section_intro_line(section: Dictionary) -> String:
	var lines := _string_array(section.get("summary_lines", []))
	if lines.is_empty():
		return "招募池、概率、预览结果和边界状态集中展示。"
	return lines[0]

func _page_label(page_id: String) -> String:
	match page_id:
		"single":
			return "单抽预览"
		"multi":
			return "五连预览"
		"result":
			return "最近结果"
		"guide":
			return "规则说明"
		_:
			return "卡池总览"

func _resolve_card_value(card: Dictionary, literal_key: String, state_key: String) -> String:
	var literal := str(card.get(literal_key, "")).strip_edges()
	if literal != "":
		return literal
	var lookup := str(card.get(state_key, "")).strip_edges()
	if lookup == "":
		return ""
	return _resolve_shared_value(lookup)

func _resolve_shared_value(path: String) -> String:
	var current: Variant = _shared_state()
	for part in path.split(".", false):
		if not (current is Dictionary):
			return ""
		current = (current as Dictionary).get(part, "")
	return str(current)

func _shared_state() -> Dictionary:
	var raw: Variant = _snapshot.get("shared_state", {})
	return raw as Dictionary if raw is Dictionary else {}

func _dictionary_array(raw_value: Variant) -> Array:
	var result: Array = []
	if not (raw_value is Array):
		return result
	for item in raw_value as Array:
		if item is Dictionary:
			result.append((item as Dictionary).duplicate(true))
	return result

func _string_array(raw_value: Variant) -> Array[String]:
	var result: Array[String] = []
	if not (raw_value is Array):
		return result
	for item in raw_value as Array:
		var text := str(item).strip_edges()
		if text != "":
			result.append(text)
	return result

func _tone_color(tone: String) -> Color:
	match tone:
		"green":
			return TEXT_GREEN
		"blue":
			return TEXT_BLUE
		"red":
			return TEXT_RED
		"gold":
			return TEXT_GOLD
		_:
			return TEXT_MAIN

func _on_recruit_action_pressed(action_id: String) -> void:
	page_action_requested.emit(_active_page_id, action_id)

func _panel(bg: Color, border: Color, radius: int = 4) -> PanelContainer:
	var panel := PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = bg
	style.border_color = border
	style.set_border_width_all(1)
	style.corner_radius_top_left = radius
	style.corner_radius_top_right = radius
	style.corner_radius_bottom_left = radius
	style.corner_radius_bottom_right = radius
	panel.add_theme_stylebox_override("panel", style)
	return panel

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
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", color)
	label.horizontal_alignment = align
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return label

func _apply_button_style(button: Button, bg: Color, border: Color, font_color: Color) -> void:
	var normal := StyleBoxFlat.new()
	normal.bg_color = bg
	normal.border_color = border
	normal.set_border_width_all(1)
	normal.corner_radius_top_left = 4
	normal.corner_radius_top_right = 4
	normal.corner_radius_bottom_left = 4
	normal.corner_radius_bottom_right = 4
	button.add_theme_stylebox_override("normal", normal)
	button.add_theme_stylebox_override("hover", normal.duplicate())
	button.add_theme_stylebox_override("pressed", normal.duplicate())
	button.add_theme_stylebox_override("disabled", normal.duplicate())
	button.add_theme_color_override("font_color", font_color)
	button.add_theme_color_override("font_disabled_color", TEXT_MUTED)
