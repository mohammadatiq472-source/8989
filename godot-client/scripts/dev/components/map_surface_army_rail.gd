@tool
extends Control
class_name MapSurfaceArmyRail

const UiThemeTokensScript = preload("res://scripts/ui/ui_theme_tokens.gd")
const GENERALPIC_ROOT := "res://assets/themes/slgclient/current/generalpic"
const HEAD_WRAP_TEXTURE_PATH := GENERALPIC_ROOT + "/head_wrap.png"

const SAMPLE_STATE: Dictionary = {
	"railTitle": "部队情报",
	"railSubtitle": "编组、位置、状态与命令摘要。",
	"summaryLine": "样例态 | 直接打开可读",
	"railTone": "success",
	"armyItems": [
		{
			"title": "先登营",
			"subtitle": "洛阳外线前推编组。",
			"status": "行军",
			"statusTone": "success",
			"portraitId": "100001",
			"portraitPath": "",
			"location": "(32, 19)",
			"metrics": ["兵力 18.4K", "士气 87", "ETA 02:14"],
			"chips": ["编组稳定", "前压"],
			"footer": "前压节奏稳定，命令链正常。"
		},
		{
			"title": "河防军",
			"subtitle": "护粮与渡口巡防。",
			"status": "待命",
			"statusTone": "info",
			"portraitPath": "",
			"portraitId": "100003",
			"location": "(18, 27)",
			"metrics": ["兵力 12.1K", "补给 94%", "巡逻 3 线"],
			"chips": ["护粮", "路线安全"],
			"footer": "黄昏前需要补一次巡逻。"
		},
		{
			"title": "预备矛阵",
			"subtitle": "机动增援与反打编组。",
			"status": "警戒",
			"statusTone": "warning",
			"portraitId": "100007",
			"portraitPath": "",
			"location": "(07, 09)",
			"metrics": ["兵力 9.8K", "战备 高", "命令 2"],
			"chips": ["机动", "待机"],
			"footer": "保持机动，等待下一轮指令。"
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
var _rail_list: VBoxContainer
var _head_wrap_texture: Texture2D


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
	_header_margin = _create_margin_container(_header_panel, "HeaderMargin", 12, 10, 12, 10)
	_header_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var header_vbox := _create_vbox(_header_margin, "HeaderVBox", 3)
	header_vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var title_row := _create_hbox(header_vbox, "TitleRow", 8)
	title_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_header_title_label = _create_label(title_row, "Title", "部队情报", 19)
	_header_title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_header_title_label.modulate = Color(0.95, 0.98, 1.0, 0.98)
	var tone_chip := _create_chip(title_row, "ToneChip", "SLG 情报", "hud_bottom_bar", 10)
	tone_chip.modulate = Color(0.92, 0.98, 0.93, 0.98)
	_header_subtitle_label = _create_label(header_vbox, "Subtitle", "编组、位置、状态与命令摘要。", 12)
	_header_subtitle_label.modulate = Color(0.83, 0.90, 0.97, 0.94)
	_summary_label = _create_label(header_vbox, "Summary", "样例态 | 直接打开可读", 11)
	_summary_label.modulate = Color(0.76, 0.86, 0.96, 0.92)

	_content_panel = _create_panel(_body_container, "ContentPanel")
	_content_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_content_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_apply_panel_style(_content_panel, "panel", "hud_bottom_bar")
	_content_margin = _create_margin_container(_content_panel, "ContentMargin", 12, 12, 12, 12)
	_content_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var scroll := ScrollContainer.new()
	scroll.name = "RailScroll"
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	_content_margin.add_child(scroll)

	_rail_list = _create_vbox(scroll, "RailList", int(_compact_value(10.0, 6.0)))
	_rail_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_rail_list.size_flags_vertical = Control.SIZE_SHRINK_BEGIN


func _apply_shell_mode() -> void:
	if _shell_margin != null:
		var shell_pad := 16
		var body_gap := 10
		var content_gap := 10
		if _compact_embed:
			shell_pad = 6
			body_gap = 4
			content_gap = 4
		_shell_margin.add_theme_constant_override("margin_left", shell_pad)
		_shell_margin.add_theme_constant_override("margin_top", shell_pad)
		_shell_margin.add_theme_constant_override("margin_right", shell_pad)
		_shell_margin.add_theme_constant_override("margin_bottom", shell_pad)
		if _body_container != null:
			_body_container.add_theme_constant_override("separation", body_gap)
		if _rail_list != null:
			_rail_list.add_theme_constant_override("separation", content_gap)
	if _header_margin != null:
		var header_pad := 10
		if _compact_embed:
			header_pad = 4
		_header_margin.add_theme_constant_override("margin_left", header_pad)
		_header_margin.add_theme_constant_override("margin_top", header_pad)
		_header_margin.add_theme_constant_override("margin_right", header_pad)
		_header_margin.add_theme_constant_override("margin_bottom", header_pad)
	if _content_margin != null:
		var content_pad := 12
		if _compact_embed:
			content_pad = 2
		_content_margin.add_theme_constant_override("margin_left", content_pad)
		_content_margin.add_theme_constant_override("margin_top", content_pad)
		_content_margin.add_theme_constant_override("margin_right", content_pad)
		_content_margin.add_theme_constant_override("margin_bottom", content_pad)
	if _frame_panel != null and _header_panel != null and _content_panel != null:
		if _compact_embed:
			_apply_transparent_panel_style(_frame_panel)
			_apply_transparent_panel_style(_content_panel)
			_apply_panel_style(_header_panel, "panel", "hud_bottom_bar")
		else:
			_apply_panel_style(_frame_panel, "panel", "observability_panel")
			_apply_panel_style(_content_panel, "panel", "hud_bottom_bar")
			_apply_panel_style(_header_panel, "panel", "hud_top_left")


func _resolve_effective_state(raw_state: Dictionary) -> Dictionary:
	var effective := SAMPLE_STATE.duplicate(true)
	if raw_state.is_empty():
		return effective

	effective["railTitle"] = _resolve_string(raw_state.get("railTitle", effective.get("railTitle", "部队情报")), str(effective.get("railTitle", "部队情报")))
	effective["railSubtitle"] = _resolve_string(raw_state.get("railSubtitle", effective.get("railSubtitle", "")), str(effective.get("railSubtitle", "")))
	effective["summaryLine"] = _resolve_string(raw_state.get("summaryLine", effective.get("summaryLine", "")), str(effective.get("summaryLine", "")))
	effective["railTone"] = _resolve_string(raw_state.get("railTone", effective.get("railTone", "info")), str(effective.get("railTone", "info")))
	effective["compactEmbed"] = bool(raw_state.get("compactEmbed", effective.get("compactEmbed", false)))
	effective["showRailHeader"] = bool(raw_state.get("showRailHeader", effective.get("showRailHeader", true)))

	var raw_items: Variant = raw_state.get("armyItems", null)
	if raw_items is Array and not (raw_items as Array).is_empty():
		effective["armyItems"] = _normalize_item_list(raw_items as Array)

	return effective


func _render_header(state: Dictionary) -> void:
	_header_title_label.text = str(state.get("railTitle", SAMPLE_STATE.get("railTitle", "部队情报"))).strip_edges()
	_header_subtitle_label.text = str(state.get("railSubtitle", SAMPLE_STATE.get("railSubtitle", ""))).strip_edges()
	_summary_label.text = str(state.get("summaryLine", SAMPLE_STATE.get("summaryLine", ""))).strip_edges()
	_header_title_label.modulate = _tone_to_color(str(state.get("railTone", "info")))
	_header_title_label.add_theme_font_size_override("font_size", _font_size(19))
	_header_subtitle_label.add_theme_font_size_override("font_size", _font_size(12))
	_summary_label.add_theme_font_size_override("font_size", _font_size(11))


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


func _render_items(state: Dictionary) -> void:
	_clear_children(_rail_list)
	_rail_list.add_theme_constant_override("separation", _list_separation())
	var items: Array = state.get("armyItems", []) as Array
	if items.is_empty():
		_rail_list.add_child(_create_empty_state("army"))
		return

	var item_limit := items.size()
	if _compact_embed:
		item_limit = min(items.size(), 2)
	for index in range(item_limit):
		var item_data: Dictionary = items[index] as Dictionary
		_rail_list.add_child(_create_army_item(item_data, index))


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
	_create_label(vbox, "Subtitle", "当前缺少内容时，会回退到内置样例态。", _font_size(13))
	return card


func _create_army_item(item_data: Dictionary, index: int) -> PanelContainer:
	if _compact_embed:
		return _create_compact_army_item(item_data, index)

	var card := PanelContainer.new()
	card.name = "ArmyItem_%d" % index
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	card.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	card.custom_minimum_size = Vector2(0.0, _compact_value(118.0, 84.0))
	_apply_panel_style(card, "panel", "hud_top_left")

	var margin := _create_margin_container(card, "Margin", _compact_value(7, 4), _compact_value(7, 4), _compact_value(7, 4), _compact_value(7, 4))
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var row := _create_hbox(margin, "Row", _compact_value(10, 5))
	row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	var portrait_block := _create_portrait_block(row, item_data)
	portrait_block.custom_minimum_size = Vector2(_compact_value(84.0, 58.0), _compact_value(88.0, 62.0))
	portrait_block.size_flags_vertical = Control.SIZE_SHRINK_BEGIN if _compact_embed else Control.SIZE_EXPAND_FILL

	var body := _create_vbox(row, "Body", _compact_value(6, 2))
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.size_flags_vertical = Control.SIZE_SHRINK_BEGIN if _compact_embed else Control.SIZE_EXPAND_FILL

	var title_row := _create_hbox(body, "TitleRow", _compact_value(7, 4))
	title_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var title := _create_label(title_row, "Title", _resolve_item_title(item_data, index), _font_size(15 if _compact_embed else 16))
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.modulate = Color(0.97, 0.99, 1.0, 0.98)
	if _compact_embed:
		title.autowrap_mode = TextServer.AUTOWRAP_OFF
		title.clip_text = true
		title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	var status_block := _create_status_block(title_row, _resolve_string(item_data.get("status", ""), "待命"), _resolve_string(item_data.get("statusTone", ""), "info"))
	status_block.size_flags_horizontal = Control.SIZE_SHRINK_END

	var subtitle := _resolve_item_subtitle(item_data)
	if subtitle != "" and not _compact_embed:
		_create_label(body, "Subtitle", subtitle, _font_size(11)).modulate = Color(0.84, 0.90, 0.97, 0.94)

	var meta_row := _create_hbox(body, "MetaRow", _compact_value(8, 4))
	meta_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var location_label := _create_label(meta_row, "Location", "坐标 %s" % _resolve_string(item_data.get("location", ""), "--"), _font_size(10))
	location_label.modulate = Color(0.77, 0.85, 0.93, 0.92)
	if _compact_embed:
		location_label.autowrap_mode = TextServer.AUTOWRAP_OFF
		location_label.clip_text = true
		location_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	var portrait_meta := _resolve_portrait_meta(item_data)
	if portrait_meta != "" and not _compact_embed:
		_create_label(meta_row, "PortraitMeta", portrait_meta, _font_size(10)).modulate = Color(0.73, 0.82, 0.92, 0.90)
	_create_spacer(meta_row, "MetaSpacer")

	var chips := _normalize_string_array(item_data.get("chips", []))
	if not chips.is_empty():
		var chip_row := _create_hbox(body, "ChipRow", _compact_value(5, 3))
		chip_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var chip_limit := chips.size()
		if _compact_embed:
			chip_limit = min(chips.size(), 1)
		for chip_index in range(chip_limit):
			_create_chip(chip_row, "Chip", chips[chip_index], "hud_bottom_bar", _font_size(10))

	var metrics := _normalize_string_array(item_data.get("metrics", []))
	if not metrics.is_empty():
		var metrics_row := _create_hbox(body, "MetricsRow", _compact_value(5, 3))
		metrics_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		if _compact_embed:
			metrics_row.add_child(_create_metric_chip(_combine_compact_metrics(item_data), _resolve_string(item_data.get("statusTone", ""), "info")))
		else:
			for metric in metrics:
				metrics_row.add_child(_create_metric_chip(metric, _resolve_string(item_data.get("statusTone", ""), "info")))

	if not _compact_embed:
		var footer := _resolve_string(item_data.get("footer", ""), "")
		if footer != "":
			_create_label(body, "Footer", footer, _font_size(10)).modulate = Color(0.75, 0.83, 0.92, 0.90)

	return card


func _create_compact_army_item(item_data: Dictionary, index: int) -> PanelContainer:
	var card := PanelContainer.new()
	card.name = "ArmyItem_%d" % index
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	card.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	card.custom_minimum_size = Vector2(0.0, 74.0)
	_apply_panel_style(card, "panel", "hud_top_left")

	var margin := _create_margin_container(card, "Margin", 4, 4, 4, 4)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var row := _create_hbox(margin, "Row", 5)
	row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	var portrait_block := _create_portrait_block(row, item_data)
	portrait_block.custom_minimum_size = Vector2(46.0, 52.0)
	portrait_block.size_flags_vertical = Control.SIZE_SHRINK_BEGIN

	var body := _create_vbox(row, "Body", 2)
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.size_flags_vertical = Control.SIZE_SHRINK_BEGIN

	var title_row := _create_hbox(body, "TitleRow", 4)
	title_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var title := _create_label(title_row, "Title", _resolve_item_title(item_data, index), _font_size(14))
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.modulate = Color(0.97, 0.99, 1.0, 0.98)
	title.autowrap_mode = TextServer.AUTOWRAP_OFF
	title.clip_text = true
	title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	var status_block := _create_status_block(title_row, _resolve_string(item_data.get("status", ""), "待命"), _resolve_string(item_data.get("statusTone", ""), "info"))
	status_block.size_flags_horizontal = Control.SIZE_SHRINK_END

	var summary := _create_label(body, "Summary", _resolve_compact_summary_line(item_data), _font_size(9))
	summary.modulate = Color(0.84, 0.90, 0.97, 0.94)
	summary.autowrap_mode = TextServer.AUTOWRAP_OFF
	summary.clip_text = true
	summary.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS

	var meta_row := _create_hbox(body, "MetaRow", 4)
	meta_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var location_label := _create_label(meta_row, "Location", "坐标 %s" % _resolve_string(item_data.get("location", ""), "--"), _font_size(9))
	location_label.modulate = Color(0.77, 0.85, 0.93, 0.92)
	location_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	location_label.clip_text = true
	location_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	var primary_chip := _resolve_compact_primary_chip(item_data)
	if primary_chip != "":
		var chip := _create_chip(meta_row, "PrimaryChip", primary_chip, "hud_bottom_bar", _font_size(9))
		chip.modulate = Color(0.92, 0.98, 0.93, 0.95)
	_create_spacer(meta_row, "MetaSpacer")

	return card


func _create_portrait_block(parent: Node, item_data: Dictionary) -> PanelContainer:
	var block := PanelContainer.new()
	block.name = "PortraitBlock"
	_apply_panel_style(block, "panel", "hud_bottom_bar")
	parent.add_child(block)

	var margin := _create_margin_container(block, "Margin", 6, 6, 6, 6)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var vbox := _create_vbox(margin, "VBox", 3)
	vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var portrait_canvas := Control.new()
	portrait_canvas.name = "PortraitCanvas"
	portrait_canvas.custom_minimum_size = Vector2(_compact_value(62.0, 50.0), _compact_value(52.0, 42.0))
	portrait_canvas.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	portrait_canvas.size_flags_vertical = Control.SIZE_EXPAND_FILL
	vbox.add_child(portrait_canvas)
	var portrait_texture := _resolve_portrait_texture(item_data)
	if portrait_texture != null:
		var portrait := TextureRect.new()
		portrait.name = "Portrait"
		portrait.texture = portrait_texture
		portrait.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
		portrait_canvas.add_child(portrait)
	else:
		var portrait_fallback := _create_panel(portrait_canvas, "PortraitFallback")
		portrait_fallback.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		portrait_fallback.custom_minimum_size = Vector2(_compact_value(62.0, 50.0), _compact_value(52.0, 42.0))
		_apply_panel_style(portrait_fallback, "panel", "hud_top_left")
		if not _compact_embed:
			var fallback_margin := _create_margin_container(portrait_fallback, "FallbackMargin", 5, 5, 5, 5)
			fallback_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
			var fallback_label := _create_label(fallback_margin, "Label", _resolve_portrait_meta(item_data), _font_size(10))
			fallback_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			fallback_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
			fallback_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	var head_wrap_texture := _resolve_head_wrap_texture()
	if head_wrap_texture != null:
		var head_wrap := TextureRect.new()
		head_wrap.name = "HeadWrap"
		head_wrap.texture = head_wrap_texture
		head_wrap.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		head_wrap.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		head_wrap.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		head_wrap.mouse_filter = Control.MOUSE_FILTER_IGNORE
		portrait_canvas.add_child(head_wrap)

	var slot_label := _create_label(vbox, "SlotLabel", "头像位", _font_size(10))
	slot_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	slot_label.modulate = Color(0.77, 0.86, 0.94, 0.92)
	if _compact_embed:
		slot_label.visible = false
	return block


func _create_status_block(parent: Node, status_text: String, tone: String) -> PanelContainer:
	var block := PanelContainer.new()
	block.name = "StatusBlock"
	_apply_panel_style(block, "panel", "hud_bottom_bar")
	parent.add_child(block)
	var margin := _create_margin_container(block, "Margin", 7 if _compact_embed else 8, 3 if _compact_embed else 4, 7 if _compact_embed else 8, 3 if _compact_embed else 4)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var label := _create_label(margin, "Label", status_text, _font_size(10 if _compact_embed else 11))
	label.modulate = _tone_to_color(tone)
	if _compact_embed:
		label.autowrap_mode = TextServer.AUTOWRAP_OFF
	return block


func _create_metric_chip(text: String, tone: String) -> PanelContainer:
	var chip := PanelContainer.new()
	chip.name = "MetricChip"
	chip.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_apply_panel_style(chip, "panel", "hud_bottom_bar")
	var margin := _create_margin_container(chip, "Margin", 6, 2, 6, 2)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var label := _create_label(margin, "Label", text, _font_size(9 if _compact_embed else 10))
	label.autowrap_mode = TextServer.AUTOWRAP_OFF
	label.clip_text = true
	label.modulate = _tone_to_color(tone)
	return chip


func _combine_compact_metrics(item_data: Dictionary) -> String:
	var metrics := _normalize_string_array(item_data.get("metrics", []))
	if metrics.is_empty():
		return ""
	if metrics.size() == 1:
		return metrics[0]
	if metrics.size() == 2:
		return "%s · %s" % [metrics[0], metrics[1]]
	return "%s · %s" % [metrics[0], metrics[1]]


func _resolve_compact_summary_line(item_data: Dictionary) -> String:
	var summary_parts: Array[String] = []
	var metrics := _normalize_string_array(item_data.get("metrics", []))
	for metric in metrics.slice(0, min(metrics.size(), 2)):
		summary_parts.append(str(metric))
	if summary_parts.is_empty():
		var subtitle := _resolve_item_subtitle(item_data)
		if subtitle != "":
			summary_parts.append(subtitle)
	return " · ".join(summary_parts)


func _resolve_compact_primary_chip(item_data: Dictionary) -> String:
	var chips := _normalize_string_array(item_data.get("chips", []))
	if not chips.is_empty():
		return str(chips[0])
	return ""


func _resolve_item_title(item_data: Dictionary, index: int) -> String:
	var title := _resolve_string(item_data.get("title", ""), "")
	if title != "":
		return title
	return "部队 %d" % [index + 1]


func _resolve_item_subtitle(item_data: Dictionary) -> String:
	var subtitle := _resolve_string(item_data.get("subtitle", ""), "")
	if subtitle != "":
		return subtitle
	return _resolve_string(item_data.get("description", ""), "")


func _resolve_portrait_meta(item_data: Dictionary) -> String:
	var portrait_path := _resolve_string(item_data.get("portraitPath", ""), "")
	var portrait_id := _resolve_string(item_data.get("portraitId", ""), "")
	if portrait_path != "":
		return "头像路径"
	if portrait_id != "":
		var resolved_path := _resolve_portrait_path_from_id(portrait_id)
		if resolved_path != "":
			return "头像 %s" % portrait_id
		return "头像 ID %s" % portrait_id
	return "头像样例"


func _resolve_portrait_texture(item_data: Dictionary) -> Texture2D:
	var portrait_path := _resolve_string(item_data.get("portraitPath", ""), "")
	if portrait_path == "":
		portrait_path = _resolve_portrait_path_from_id(_resolve_string(item_data.get("portraitId", ""), ""))
	if portrait_path == "" or not ResourceLoader.exists(portrait_path):
		return null
	var resource := load(portrait_path)
	if resource is Texture2D:
		return resource as Texture2D
	return null


func _resolve_portrait_path_from_id(raw_portrait_id: String) -> String:
	var portrait_id := raw_portrait_id.strip_edges()
	if portrait_id == "":
		return ""
	var numeric_id := _extract_numeric_token(portrait_id)
	if numeric_id == "":
		return ""
	var candidate_path := "%s/card_%s.png" % [GENERALPIC_ROOT, numeric_id]
	if ResourceLoader.exists(candidate_path):
		return candidate_path
	return ""


func _extract_numeric_token(raw_value: String) -> String:
	var buffer := ""
	for index in range(raw_value.length()):
		var ch := raw_value.substr(index, 1)
		if ch >= "0" and ch <= "9":
			buffer += ch
	return buffer


func _resolve_head_wrap_texture() -> Texture2D:
	if _head_wrap_texture != null:
		return _head_wrap_texture
	if not ResourceLoader.exists(HEAD_WRAP_TEXTURE_PATH):
		return null
	var resource := load(HEAD_WRAP_TEXTURE_PATH)
	if resource is Texture2D:
		_head_wrap_texture = resource as Texture2D
	return _head_wrap_texture


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
					"status": "Ready",
					"statusTone": "info",
					"portraitId": "",
					"portraitPath": "",
					"location": "",
					"metrics": [],
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
	var margin := _create_margin_container(chip, "Margin", 7, 3, 7, 3)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_create_label(margin, "Label", text, font_size).modulate = Color(0.92, 0.98, 0.93, 0.95)
	return chip


func _clear_children(parent: Node) -> void:
	for child in parent.get_children():
		child.queue_free()


func _apply_panel_style(panel: PanelContainer, category: String, token_name: String) -> bool:
	return _ui_theme_tokens.apply_panel_style(panel, category, token_name)


func _apply_transparent_panel_style(panel: PanelContainer) -> void:
	if panel == null:
		return
	panel.add_theme_stylebox_override("panel", StyleBoxEmpty.new())


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
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	parent.add_child(label)
	return label


func _create_spacer(parent: Node, node_name: String) -> Control:
	var spacer := Control.new()
	spacer.name = node_name
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(spacer)
	return spacer


func _font_size(base_size: int) -> int:
	return base_size - 2 if _compact_embed else base_size


func _compact_value(default_value: float, compact_value: float) -> float:
	return compact_value if _compact_embed else default_value


func _list_separation() -> int:
	return 4 if _compact_embed else 10
