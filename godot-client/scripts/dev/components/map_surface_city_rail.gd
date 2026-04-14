@tool
extends Control
class_name MapSurfaceCityRail

const UiThemeTokensScript = preload("res://scripts/ui/ui_theme_tokens.gd")

const SAMPLE_STATE: Dictionary = {
	"railTitle": "城池右栏",
	"railSubtitle": "右侧滚动情报条，按城池节点、态势与补给密度浏览。",
	"summaryLine": "城池 3 | 前线 1 | 后勤 1 | 当前: 洛阳",
	"railTone": "warning",
	"cityItems": [
		{
			"title": "洛阳",
			"subtitle": "都城节点，征兵与仓储持续运转。",
			"status": "核心",
			"statusTone": "success",
			"detail": "都城产能与同盟协同都集中在这里。",
			"location": "(24, 16)",
			"stateBlock": ["等级 6", "粮 23.0K", "队列 4"],
			"chips": ["征兵", "仓储", "统帅"],
			"footer": "高价值主城节点。"
		},
		{
			"title": "虎牢关",
			"subtitle": "北线前沿关口。",
			"status": "前线",
			"statusTone": "info",
			"detail": "关口控制需要持续补防与可视更新。",
			"location": "(11, 05)",
			"stateBlock": ["等级 4", "驻防 7.2K", "威胁 中"],
			"chips": ["防守", "路线巡查"],
			"footer": "前线拦截与筛查点。"
		},
		{
			"title": "许昌",
			"subtitle": "后勤节点，补给线路稳定。",
			"status": "后勤",
			"statusTone": "warning",
			"detail": "维持前线与仓储之间的长线补给。",
			"location": "(41, 12)",
			"stateBlock": ["等级 5", "补给 91%", "贸易 3"],
			"chips": ["后勤", "均衡"],
			"footer": "东线补给缓冲区。"
		}
	]
}

var _ui_theme_tokens = UiThemeTokensScript.new()
var _preview_state: Dictionary = {}
var _compact_embed: bool = false

var _frame_panel: PanelContainer
var _shell_margin: MarginContainer
var _body_container: VBoxContainer
var _header_panel: PanelContainer
var _header_margin: MarginContainer
var _header_title_label: Label
var _header_subtitle_label: Label
var _summary_label: Label
var _content_panel: PanelContainer
var _content_margin: MarginContainer
var _rail_scroll: ScrollContainer
var _rail_list: VBoxContainer


func _ready() -> void:
	_build_shell()
	apply_preview_state({})


func apply_preview_state(state: Dictionary) -> void:
	_build_shell()
	_preview_state = _resolve_effective_state(state)
	_compact_embed = bool(_preview_state.get("compactEmbed", false))
	_apply_shell_mode()
	_apply_header_visibility(_preview_state)
	_render_header(_preview_state)
	_render_items(_preview_state)


func _build_shell() -> void:
	if _frame_panel != null:
		return

	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	clip_contents = true

	_frame_panel = PanelContainer.new()
	_frame_panel.name = "Frame"
	_frame_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_frame_panel.clip_contents = true
	_apply_panel_style(_frame_panel, "panel", "observability_panel")
	add_child(_frame_panel)

	_shell_margin = _create_margin_container(_frame_panel, "Margin", 16, 16, 16, 16)
	_shell_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_body_container = _create_vbox(_shell_margin, "Body", 10)
	_body_container.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_body_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_body_container.size_flags_vertical = Control.SIZE_EXPAND_FILL

	_header_panel = _create_panel(_body_container, "HeaderPanel")
	_header_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_apply_panel_style(_header_panel, "panel", "hud_top_left")
	_header_margin = _create_margin_container(_header_panel, "HeaderMargin", 14, 12, 14, 12)
	_header_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var header_vbox := _create_vbox(_header_margin, "HeaderVBox", 4)
	header_vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var title_row := _create_hbox(header_vbox, "TitleRow", 10)
	title_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_header_title_label = _create_label(title_row, "Title", "城池右栏", 21)
	_header_title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_header_title_label.modulate = Color(0.97, 0.99, 1.0, 0.98)
	_create_chip(title_row, "ToneChip", "右栏", "hud_bottom_bar", 11)
	_header_subtitle_label = _create_label(header_vbox, "Subtitle", "城池态势 / 驻防 / 补给 / 路线", 13)
	_header_subtitle_label.modulate = Color(0.83, 0.90, 0.97, 0.94)
	_summary_label = _create_label(header_vbox, "Summary", "右侧滚动情报，适配嵌入式预览。", 12)
	_summary_label.modulate = Color(0.76, 0.86, 0.96, 0.92)

	_content_panel = _create_panel(_body_container, "ContentPanel")
	_content_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_content_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_apply_panel_style(_content_panel, "panel", "hud_bottom_bar")
	_content_margin = _create_margin_container(_content_panel, "ContentMargin", 12, 12, 12, 12)
	_content_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_rail_scroll = ScrollContainer.new()
	_rail_scroll.name = "RailScroll"
	_rail_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_rail_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_rail_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_rail_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	_content_margin.add_child(_rail_scroll)

	_rail_list = _create_vbox(_rail_scroll, "RailList", int(_compact_value(10.0, 5.0)))
	_rail_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_rail_list.size_flags_vertical = Control.SIZE_SHRINK_BEGIN


func _resolve_effective_state(raw_state: Dictionary) -> Dictionary:
	var effective := SAMPLE_STATE.duplicate(true)
	if raw_state.is_empty():
		return effective

	effective["railTitle"] = _resolve_string(raw_state.get("railTitle", effective.get("railTitle", "城池右栏")), str(effective.get("railTitle", "城池右栏")))
	effective["railSubtitle"] = _resolve_string(raw_state.get("railSubtitle", effective.get("railSubtitle", "")), str(effective.get("railSubtitle", "")))
	effective["summaryLine"] = _resolve_string(raw_state.get("summaryLine", effective.get("summaryLine", "")), str(effective.get("summaryLine", "")))
	effective["railTone"] = _resolve_string(raw_state.get("railTone", effective.get("railTone", "info")), str(effective.get("railTone", "info")))
	effective["compactEmbed"] = bool(raw_state.get("compactEmbed", effective.get("compactEmbed", false)))
	effective["showRailHeader"] = bool(raw_state.get("showRailHeader", effective.get("showRailHeader", true)))

	var raw_items: Variant = raw_state.get("cityItems", null)
	if raw_items is Array and not (raw_items as Array).is_empty():
		effective["cityItems"] = _normalize_item_list(raw_items as Array)

	return effective


func _render_header(state: Dictionary) -> void:
	_header_title_label.text = str(state.get("railTitle", SAMPLE_STATE.get("railTitle", "城池右栏"))).strip_edges()
	_header_subtitle_label.text = str(state.get("railSubtitle", SAMPLE_STATE.get("railSubtitle", ""))).strip_edges()
	_summary_label.text = str(state.get("summaryLine", SAMPLE_STATE.get("summaryLine", ""))).strip_edges()
	_header_title_label.modulate = _tone_to_color(str(state.get("railTone", "info")))
	_header_title_label.add_theme_font_size_override("font_size", _font_size(21))
	_header_subtitle_label.add_theme_font_size_override("font_size", _font_size(13))
	_summary_label.add_theme_font_size_override("font_size", _font_size(12))


func _apply_header_visibility(state: Dictionary) -> void:
	if _header_panel == null:
		return
	var raw_visible: Variant = state.get("showRailHeader", true)
	var show_header := true
	if raw_visible is bool:
		show_header = raw_visible
	_header_panel.visible = show_header
	if _body_container != null and _content_panel != null:
		if show_header:
			_body_container.move_child(_header_panel, 0)
			_body_container.move_child(_content_panel, 1)
		else:
			_body_container.move_child(_content_panel, 0)
			_body_container.move_child(_header_panel, 1)


func _apply_shell_mode() -> void:
	if _frame_panel == null or _content_panel == null or _header_panel == null:
		return

	if _compact_embed:
		var empty_style := StyleBoxEmpty.new()
		_frame_panel.add_theme_stylebox_override("panel", empty_style)
		_content_panel.add_theme_stylebox_override("panel", empty_style)
		_body_container.add_theme_constant_override("separation", 4)
		_shell_margin.add_theme_constant_override("margin_left", 6)
		_shell_margin.add_theme_constant_override("margin_top", 6)
		_shell_margin.add_theme_constant_override("margin_right", 6)
		_shell_margin.add_theme_constant_override("margin_bottom", 6)
		_header_margin.add_theme_constant_override("margin_left", 8)
		_header_margin.add_theme_constant_override("margin_top", 6)
		_header_margin.add_theme_constant_override("margin_right", 8)
		_header_margin.add_theme_constant_override("margin_bottom", 4)
		_content_margin.add_theme_constant_override("margin_left", 6)
		_content_margin.add_theme_constant_override("margin_top", 4)
		_content_margin.add_theme_constant_override("margin_right", 6)
		_content_margin.add_theme_constant_override("margin_bottom", 6)
		if _rail_scroll != null:
			_rail_scroll.add_theme_constant_override("h_scroll_bar_width", 0)
	else:
		_apply_panel_style(_frame_panel, "panel", "observability_panel")
		_apply_panel_style(_content_panel, "panel", "hud_bottom_bar")
		_body_container.add_theme_constant_override("separation", 10)
		_shell_margin.add_theme_constant_override("margin_left", 16)
		_shell_margin.add_theme_constant_override("margin_top", 16)
		_shell_margin.add_theme_constant_override("margin_right", 16)
		_shell_margin.add_theme_constant_override("margin_bottom", 16)
		_header_margin.add_theme_constant_override("margin_left", 14)
		_header_margin.add_theme_constant_override("margin_top", 12)
		_header_margin.add_theme_constant_override("margin_right", 14)
		_header_margin.add_theme_constant_override("margin_bottom", 12)
		_content_margin.add_theme_constant_override("margin_left", 12)
		_content_margin.add_theme_constant_override("margin_top", 12)
		_content_margin.add_theme_constant_override("margin_right", 12)
		_content_margin.add_theme_constant_override("margin_bottom", 12)


func _render_items(state: Dictionary) -> void:
	_clear_children(_rail_list)
	_rail_list.add_theme_constant_override("separation", _list_separation())
	var items: Array = state.get("cityItems", []) as Array
	if items.is_empty():
		_rail_list.add_child(_create_empty_state("city"))
		return

	for index in range(items.size()):
		var item_data: Dictionary = items[index] as Dictionary
		_rail_list.add_child(_create_city_item(item_data, index))


func _create_empty_state(label_key: String) -> PanelContainer:
	var card := PanelContainer.new()
	card.name = "EmptyStateCard"
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_apply_panel_style(card, "panel", "hud_top_left")
	var margin := _create_margin_container(card, "Margin", 12, 10, 12, 10)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var vbox := _create_vbox(margin, "VBox", 4)
	vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var title := _create_label(vbox, "Title", "暂无%s情报" % label_key, _font_size(15))
	title.modulate = Color(0.93, 0.97, 1.0, 0.97)
	_create_label(vbox, "Subtitle", "当内容缺失时回退到内置样例态。", _font_size(13))
	return card


func _create_city_item(item_data: Dictionary, index: int) -> PanelContainer:
	var card := PanelContainer.new()
	card.name = "CityItem_%d" % index
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_apply_panel_style(card, "panel", "hud_top_left")

	var margin := _create_margin_container(card, "Margin", 0, 0, 0, 0)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var row := _create_hbox(margin, "Row", int(_compact_value(12.0, 6.0)))
	row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	var anchor_block := _create_anchor_block(row, item_data)
	anchor_block.custom_minimum_size = Vector2(_compact_value(96.0, 62.0), _compact_value(88.0, 56.0))
	anchor_block.size_flags_vertical = Control.SIZE_SHRINK_BEGIN if _compact_embed else Control.SIZE_EXPAND_FILL

	var body := _create_vbox(row, "Body", int(_compact_value(6.0, 4.0)))
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.size_flags_vertical = Control.SIZE_SHRINK_BEGIN if _compact_embed else Control.SIZE_EXPAND_FILL

	var title_row := _create_hbox(body, "TitleRow", int(_compact_value(6.0, 4.0)))
	title_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var title := _create_label(title_row, "Title", _resolve_item_title(item_data, index), _font_size(16))
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.modulate = Color(0.97, 0.99, 1.0, 0.98)
	var status_block := _create_status_block(title_row, _resolve_string(item_data.get("status", ""), "就绪"), _resolve_string(item_data.get("statusTone", ""), "info"))
	status_block.size_flags_horizontal = Control.SIZE_SHRINK_END

	var state_block: Array = _normalize_string_array(item_data.get("stateBlock", []))
	_create_label(body, "Subtitle", _resolve_item_subtitle(item_data), _font_size(11)).modulate = Color(0.84, 0.90, 0.97, 0.94)
	if not _compact_embed:
		_create_label(body, "Detail", _resolve_string(item_data.get("detail", ""), ""), _font_size(10)).modulate = Color(0.79, 0.87, 0.94, 0.92)

	var state_container: Node
	if _compact_embed:
		state_container = _create_grid(body, "StateGrid", 2, int(_compact_value(4.0, 2.0)), int(_compact_value(3.0, 2.0)))
	else:
		state_container = _create_hbox(body, "StateRow", int(_compact_value(6.0, 4.0)))
		state_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for block_text in state_block:
		if state_container is GridContainer:
			(state_container as GridContainer).add_child(_create_metric_chip(block_text, _resolve_string(item_data.get("statusTone", ""), "info")))
		else:
			(state_container as HBoxContainer).add_child(_create_metric_chip(block_text, _resolve_string(item_data.get("statusTone", ""), "info")))

	var meta_row: Node
	if _compact_embed:
		meta_row = _create_vbox(body, "MetaStack", 1)
	else:
		meta_row = _create_hbox(body, "MetaRow", int(_compact_value(10.0, 6.0)))
		meta_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_create_spacer(meta_row, "MetaSpacer")
	var location_text := "坐标 %s" % _resolve_string(item_data.get("location", ""), "--")
	if _compact_embed:
		location_text = _shorten_location(location_text)
	_create_label(meta_row, "Location", location_text, _font_size(10)).modulate = Color(0.77, 0.85, 0.93, 0.92)

	var chips := _normalize_string_array(item_data.get("chips", []))
	if not chips.is_empty():
		var chip_row: Node
		if _compact_embed:
			chip_row = _create_grid(body, "ChipGrid", 2, int(_compact_value(4.0, 2.0)), int(_compact_value(4.0, 2.0)))
		else:
			chip_row = _create_hbox(body, "ChipRow", int(_compact_value(6.0, 4.0)))
			chip_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var chip_limit := 2 if _compact_embed else chips.size()
		for chip_index in range(min(chips.size(), chip_limit)):
			_create_chip(chip_row, "Chip", chips[chip_index], "hud_bottom_bar", _font_size(11))

	var footer := _resolve_string(item_data.get("footer", ""), "")
	if footer != "" and not _compact_embed:
		_create_label(body, "Footer", footer, _font_size(10)).modulate = Color(0.75, 0.83, 0.92, 0.90)

	return card


func _create_anchor_block(parent: Node, item_data: Dictionary) -> PanelContainer:
	var block := PanelContainer.new()
	block.name = "AnchorBlock"
	_apply_panel_style(block, "panel", "hud_bottom_bar")
	parent.add_child(block)

	var margin := _create_margin_container(block, "Margin", 8, 8, 8, 8)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var vbox := _create_vbox(margin, "VBox", 4)
	vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var badge := _create_label(vbox, "Badge", "城池节点", _font_size(10))
	badge.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	badge.modulate = Color(0.82, 0.90, 0.97, 0.94)
	var focus := _create_label(vbox, "Focus", _resolve_city_focus(item_data), _font_size(13))
	focus.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	focus.modulate = Color(0.97, 0.98, 1.0, 0.98)
	var location := _create_label(vbox, "Location", _resolve_string(item_data.get("location", ""), "坐标 --"), _font_size(11))
	location.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	location.modulate = Color(0.75, 0.84, 0.93, 0.90)
	return block


func _create_status_block(parent: Node, status_text: String, tone: String) -> PanelContainer:
	var block := PanelContainer.new()
	block.name = "StatusBlock"
	_apply_panel_style(block, "panel", "hud_bottom_bar")
	parent.add_child(block)
	var margin := _create_margin_container(block, "Margin", 8, 4, 8, 4)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var label := _create_label(margin, "Label", status_text, _font_size(9))
	label.modulate = _tone_to_color(tone)
	return block


func _create_metric_chip(text: String, tone: String) -> PanelContainer:
	var chip := PanelContainer.new()
	chip.name = "MetricChip"
	chip.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_apply_panel_style(chip, "panel", "hud_bottom_bar")
	var margin := _create_margin_container(chip, "Margin", 7, 3, 7, 3)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var label := _create_label(margin, "Label", text, 10 if _compact_embed else 11)
	label.modulate = _tone_to_color(tone)
	return chip


func _resolve_item_title(item_data: Dictionary, index: int) -> String:
	var title := _resolve_string(item_data.get("title", ""), "")
	if title != "":
		return title
	return "城池 %d" % [index + 1]


func _resolve_item_subtitle(item_data: Dictionary) -> String:
	var subtitle := _resolve_string(item_data.get("subtitle", ""), "")
	if subtitle != "":
		return subtitle
	return _resolve_string(item_data.get("description", ""), "")


func _resolve_city_focus(item_data: Dictionary) -> String:
	var detail := _resolve_string(item_data.get("detail", ""), "")
	if detail != "":
		return detail
	return _resolve_string(item_data.get("status", ""), "City node")


func _normalize_item_list(raw_items: Array) -> Array:
	var items: Array = []
	for raw_item in raw_items:
		if raw_item is Dictionary:
			items.append((raw_item as Dictionary).duplicate(true))
		elif raw_item is String:
			var text := str(raw_item).strip_edges()
			if text != "":
				items.append({
					"title": text,
					"subtitle": "",
					"status": "就绪",
					"statusTone": "info",
					"detail": "",
					"location": "",
					"stateBlock": [],
					"chips": [],
					"footer": ""
				})
	return items


func _resolve_string(raw_value: Variant, fallback: String) -> String:
	var value := str(raw_value).strip_edges()
	if value == "":
		return fallback
	return value


func _normalize_string_array(raw_values: Variant) -> Array:
	var values: Array = []
	if raw_values is Array:
		for item in raw_values:
			var value := str(item).strip_edges()
			if value != "":
				values.append(value)
	return values


func _tone_to_color(tone: String) -> Color:
	match tone.strip_edges().to_lower():
		"success":
			return Color(0.34, 0.81, 0.68, 1.0)
		"warning":
			return Color(0.95, 0.72, 0.20, 1.0)
		"danger":
			return Color(0.90, 0.36, 0.40, 1.0)
		"info":
			return Color(0.84, 0.90, 0.97, 1.0)
		_:
			return Color(0.84, 0.90, 0.97, 1.0)


func _create_chip(parent: Node, node_name: String, text: String, token_name: String = "hud_bottom_bar", font_size: int = 11) -> PanelContainer:
	var chip := PanelContainer.new()
	chip.name = node_name
	_apply_panel_style(chip, "panel", token_name)
	parent.add_child(chip)
	var margin := _create_margin_container(chip, "Margin", 5, 2, 5, 2)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_create_label(margin, "Label", text, font_size).modulate = Color(0.92, 0.98, 0.93, 0.95)
	return chip


func _clear_children(parent: Node) -> void:
	for child in parent.get_children():
		child.queue_free()


func _apply_panel_style(panel: PanelContainer, category: String, token_name: String) -> bool:
	return _ui_theme_tokens.apply_panel_style(panel, category, token_name)


func _create_panel(parent: Node, node_name: String) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.name = node_name
	parent.add_child(panel)
	return panel


func _create_margin_container(parent: Node, node_name: String, left_margin: int = 0, top_margin: int = 0, right_margin: int = 0, bottom_margin: int = 0) -> MarginContainer:
	var margin := MarginContainer.new()
	margin.name = node_name
	margin.add_theme_constant_override("margin_left", left_margin)
	margin.add_theme_constant_override("margin_top", top_margin)
	margin.add_theme_constant_override("margin_right", right_margin)
	margin.add_theme_constant_override("margin_bottom", bottom_margin)
	parent.add_child(margin)
	return margin


func _create_vbox(parent: Node, node_name: String, separation: int = 0) -> VBoxContainer:
	var container := VBoxContainer.new()
	container.name = node_name
	container.add_theme_constant_override("separation", separation)
	parent.add_child(container)
	return container


func _create_grid(parent: Node, node_name: String, columns: int, h_separation: int = 0, v_separation: int = 0) -> GridContainer:
	var container := GridContainer.new()
	container.name = node_name
	container.columns = max(columns, 1)
	container.add_theme_constant_override("h_separation", h_separation)
	container.add_theme_constant_override("v_separation", v_separation)
	container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	container.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	parent.add_child(container)
	return container


func _create_hbox(parent: Node, node_name: String, separation: int = 0) -> HBoxContainer:
	var container := HBoxContainer.new()
	container.name = node_name
	container.add_theme_constant_override("separation", separation)
	parent.add_child(container)
	return container


func _create_label(parent: Node, node_name: String, text: String = "", font_size: int = 13) -> Label:
	var label := Label.new()
	label.name = node_name
	label.text = text
	label.add_theme_font_size_override("font_size", font_size)
	label.autowrap_mode = TextServer.AUTOWRAP_OFF if _compact_embed else TextServer.AUTOWRAP_WORD_SMART
	label.clip_text = _compact_embed
	parent.add_child(label)
	return label


func _create_spacer(parent: Node, node_name: String) -> Control:
	var spacer := Control.new()
	spacer.name = node_name
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(spacer)
	return spacer


func _font_size(base_size: int) -> int:
	return base_size - 1 if _compact_embed else base_size


func _compact_value(default_value: float, compact_value: float) -> float:
	return compact_value if _compact_embed else default_value


func _list_separation() -> int:
	return 6 if _compact_embed else 10


func _shorten_location(location_text: String) -> String:
	var text := location_text.strip_edges()
	if text == "":
		return "坐标 --"
	if text.contains("(") and text.contains(")"):
		return text
	return text.replace("坐标", "坐标·")
