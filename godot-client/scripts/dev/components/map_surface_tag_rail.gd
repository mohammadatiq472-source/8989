@tool
extends Control
class_name MapSurfaceTagRail

const UiThemeTokensScript = preload("res://scripts/ui/ui_theme_tokens.gd")

const SAMPLE_STATE: Dictionary = {
	"railTitle": "标记情报",
	"railSubtitle": "战区标记 / 共享提示 / 轻量摘要",
	"summaryLine": "当前 3 条 | 可处理 2 条",
	"railTone": "danger",
	"tagItems": [
		{
			"title": "前线压力",
			"subtitle": "东侧敌军正在集结。",
			"status": "警报",
			"statusTone": "danger",
			"group": "战斗",
			"owner": "指挥部",
			"priority": "高",
			"signals": "信号 6",
			"chips": ["18 格范围", "升级中"],
			"footer": "用于指挥关注与动作分发。"
		},
		{
			"title": "补给走廊",
			"subtitle": "粮线稳定，仍有一段待维护。",
			"status": "稳定",
			"statusTone": "success",
			"group": "后勤",
			"owner": "军需官",
			"priority": "中",
			"signals": "信号 2",
			"chips": ["覆盖 91%", "维护"],
			"footer": "与城池 rail 联动展示补给状态。"
		},
		{
			"title": "联盟烽火",
			"subtitle": "共享标记点，供盟友协同调度。",
			"status": "已标记",
			"statusTone": "warning",
			"group": "外交",
			"owner": "联盟",
			"priority": "低",
			"signals": "信号 1",
			"chips": ["共享", "协同"],
			"footer": "标记点会持续存在于右侧 rail。"
		}
	]
}

var _ui_theme_tokens = UiThemeTokensScript.new()
var _preview_state: Dictionary = {}
var _compact_embed: bool = false

var _frame_panel: PanelContainer
var _frame_margin: MarginContainer
var _body_container: VBoxContainer
var _header_panel: PanelContainer
var _header_margin: MarginContainer
var _header_title_label: Label
var _header_subtitle_label: Label
var _summary_label: Label
var _content_panel: PanelContainer
var _content_margin: MarginContainer
var _content_scroll: ScrollContainer
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

	_frame_margin = _create_margin_container(_frame_panel, "Margin", 16, 16, 16, 16)
	_frame_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_body_container = _create_vbox(_frame_margin, "Body", 10)
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
	_header_title_label = _create_label(title_row, "Title", "标记情报", 21)
	_header_title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_header_title_label.modulate = Color(0.97, 0.99, 1.0, 0.98)
	_create_chip(title_row, "ToneChip", "战区提示", "hud_bottom_bar", 11)
	_header_subtitle_label = _create_label(header_vbox, "Subtitle", "标签、归属与优先级的紧凑情报栏。", 13)
	_header_subtitle_label.modulate = Color(0.83, 0.90, 0.97, 0.94)
	_summary_label = _create_label(header_vbox, "Summary", "当前 3 条 | 可处理 2 条", 12)
	_summary_label.modulate = Color(0.76, 0.86, 0.96, 0.92)

	_content_panel = _create_panel(_body_container, "ContentPanel")
	_content_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_content_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_apply_panel_style(_content_panel, "panel", "hud_bottom_bar")
	_content_margin = _create_margin_container(_content_panel, "ContentMargin", 12, 12, 12, 12)
	_content_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_content_scroll = ScrollContainer.new()
	_content_scroll.name = "RailScroll"
	_content_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_content_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_content_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_content_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	_content_margin.add_child(_content_scroll)

	_rail_list = _create_vbox(_content_scroll, "RailList", 10)
	_rail_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_rail_list.size_flags_vertical = Control.SIZE_SHRINK_BEGIN


func _resolve_effective_state(raw_state: Dictionary) -> Dictionary:
	var effective := SAMPLE_STATE.duplicate(true)
	if raw_state.is_empty():
		return effective

	effective["railTitle"] = _resolve_string(raw_state.get("railTitle", effective.get("railTitle", "Tag Rail")), str(effective.get("railTitle", "Tag Rail")))
	effective["railSubtitle"] = _resolve_string(raw_state.get("railSubtitle", effective.get("railSubtitle", "")), str(effective.get("railSubtitle", "")))
	effective["summaryLine"] = _resolve_string(raw_state.get("summaryLine", effective.get("summaryLine", "")), str(effective.get("summaryLine", "")))
	effective["railTone"] = _resolve_string(raw_state.get("railTone", effective.get("railTone", "info")), str(effective.get("railTone", "info")))
	effective["compactEmbed"] = bool(raw_state.get("compactEmbed", effective.get("compactEmbed", false)))
	effective["showRailHeader"] = bool(raw_state.get("showRailHeader", effective.get("showRailHeader", true)))

	var raw_items: Variant = raw_state.get("tagItems", null)
	if raw_items is Array and not (raw_items as Array).is_empty():
		effective["tagItems"] = _normalize_item_list(raw_items as Array)

	return effective


func _render_header(state: Dictionary) -> void:
	_header_title_label.text = str(state.get("railTitle", SAMPLE_STATE.get("railTitle", "Tag Rail"))).strip_edges()
	_header_subtitle_label.text = str(state.get("railSubtitle", SAMPLE_STATE.get("railSubtitle", ""))).strip_edges()
	_summary_label.text = str(state.get("summaryLine", SAMPLE_STATE.get("summaryLine", ""))).strip_edges()
	_header_title_label.modulate = _tone_to_color(str(state.get("railTone", "info")))
	var title_font_size := 20 if _compact_embed else 21
	var subtitle_font_size := 12 if _compact_embed else 13
	var summary_font_size := 11 if _compact_embed else 12
	_header_title_label.add_theme_font_size_override("font_size", _font_size(title_font_size))
	_header_subtitle_label.add_theme_font_size_override("font_size", _font_size(subtitle_font_size))
	_summary_label.add_theme_font_size_override("font_size", _font_size(summary_font_size))


func _apply_shell_mode() -> void:
	if _frame_margin != null:
		var frame_pad := 4 if _compact_embed else 16
		_frame_margin.add_theme_constant_override("margin_left", frame_pad)
		_frame_margin.add_theme_constant_override("margin_top", frame_pad)
		_frame_margin.add_theme_constant_override("margin_right", frame_pad)
		_frame_margin.add_theme_constant_override("margin_bottom", frame_pad)

	if _body_container != null:
		_body_container.add_theme_constant_override("separation", 6 if _compact_embed else 10)

	if _header_margin != null:
		var header_left := 8 if _compact_embed else 14
		var header_top := 6 if _compact_embed else 12
		_header_margin.add_theme_constant_override("margin_left", header_left)
		_header_margin.add_theme_constant_override("margin_top", header_top)
		_header_margin.add_theme_constant_override("margin_right", header_left)
		_header_margin.add_theme_constant_override("margin_bottom", header_top)

	if _content_margin != null:
		var content_pad := 2 if _compact_embed else 12
		_content_margin.add_theme_constant_override("margin_left", content_pad)
		_content_margin.add_theme_constant_override("margin_top", content_pad)
		_content_margin.add_theme_constant_override("margin_right", content_pad)
		_content_margin.add_theme_constant_override("margin_bottom", content_pad)

	if _frame_panel != null:
		if _compact_embed:
			var empty_panel := StyleBoxEmpty.new()
			_frame_panel.add_theme_stylebox_override("panel", empty_panel)
		else:
			_apply_panel_style(_frame_panel, "panel", "observability_panel")

	if _header_panel != null:
		if _compact_embed:
			_apply_panel_style(_header_panel, "panel", "hud_top_left")
		else:
			_apply_panel_style(_header_panel, "panel", "hud_top_left")

	if _content_panel != null:
		if _compact_embed:
			var empty_content := StyleBoxEmpty.new()
			_content_panel.add_theme_stylebox_override("panel", empty_content)
		else:
			_apply_panel_style(_content_panel, "panel", "hud_bottom_bar")


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
	var items: Array = state.get("tagItems", []) as Array
	if items.is_empty():
		_rail_list.add_child(_create_empty_state("tag"))
		return

	for index in range(items.size()):
		var item_data: Dictionary = items[index] as Dictionary
		_rail_list.add_child(_create_tag_item(item_data, index))


func _create_empty_state(label_key: String) -> PanelContainer:
	var card := PanelContainer.new()
	card.name = "EmptyStateCard"
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_apply_panel_style(card, "panel", "hud_top_left")
	var margin := _create_margin_container(card, "Margin", 12, 10, 12, 10)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var vbox := _create_vbox(margin, "VBox", 4)
	vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var title_text := "暂无%s" % label_key if _compact_embed else "No %s items available" % label_key
	var subtitle_text := "当前仅显示紧凑态标记摘要。" if _compact_embed else "The rail falls back to the embedded sample state when content is missing."
	var title := _create_label(vbox, "Title", title_text, _font_size(15))
	title.modulate = Color(0.93, 0.97, 1.0, 0.97)
	_create_label(vbox, "Subtitle", subtitle_text, _font_size(13))
	return card


func _create_tag_item(item_data: Dictionary, index: int) -> PanelContainer:
	var card := PanelContainer.new()
	card.name = "TagItem_%d" % index
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	card.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	_apply_panel_style(card, "panel", "hud_top_left")

	var margin := _create_margin_container(card, "Margin", _compact_value(8, 6), _compact_value(8, 6), _compact_value(8, 6), _compact_value(8, 6))
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var row := _create_hbox(margin, "Row", _compact_value(12, 6))
	row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	var rail_mark := _create_mark_block(row, item_data)
	rail_mark.custom_minimum_size = Vector2(_compact_value(92.0, 70.0), _compact_value(86.0, 66.0))
	rail_mark.size_flags_vertical = Control.SIZE_SHRINK_BEGIN

	var body := _create_vbox(row, "Body", _compact_value(6, 3))
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.size_flags_vertical = Control.SIZE_SHRINK_BEGIN

	var title_row := _create_hbox(body, "TitleRow", _compact_value(8, 5))
	title_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var title_font_size := 16 if _compact_embed else 17
	var title := _create_label(title_row, "Title", _resolve_item_title(item_data, index), _font_size(title_font_size))
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.modulate = Color(0.97, 0.99, 1.0, 0.98)
	var status_block := _create_status_block(title_row, _resolve_string(item_data.get("status", ""), "Tagged"), _resolve_string(item_data.get("statusTone", ""), "info"))
	status_block.size_flags_horizontal = Control.SIZE_SHRINK_END

	var subtitle_font_size := 12 if _compact_embed else 13
	_create_label(body, "Subtitle", _resolve_item_subtitle(item_data), _font_size(subtitle_font_size)).modulate = Color(0.84, 0.90, 0.97, 0.94)
	if not _compact_embed:
		_create_label(body, "Detail", _resolve_tag_detail(item_data), _font_size(12)).modulate = Color(0.79, 0.87, 0.94, 0.92)

	if _compact_embed:
		var compact_meta := _create_vbox(body, "CompactMeta", 2)
		compact_meta.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var meta_row_a := _create_hbox(compact_meta, "MetaRowA", 3)
		meta_row_a.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var group_chip := _create_chip(meta_row_a, "GroupChip", _resolve_group_label(item_data), "hud_bottom_bar", _font_size(10))
		group_chip.modulate = Color(0.93, 0.98, 0.95, 0.96)
		var owner_chip := _create_chip(meta_row_a, "OwnerChip", _resolve_owner_label(item_data), "hud_bottom_bar", _font_size(10))
		owner_chip.modulate = Color(0.93, 0.98, 0.95, 0.96)

		var meta_row_b := _create_hbox(compact_meta, "MetaRowB", 3)
		meta_row_b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var priority_chip := _create_chip(meta_row_b, "PriorityChip", _resolve_priority_label(item_data), "hud_bottom_bar", _font_size(10))
		priority_chip.modulate = Color(0.93, 0.98, 0.95, 0.96)
		var signals := _resolve_string(item_data.get("signals", ""), "")
		if signals != "":
			var signals_chip := _create_chip(meta_row_b, "SignalsChip", signals, "hud_bottom_bar", _font_size(10))
			signals_chip.modulate = Color(0.93, 0.98, 0.95, 0.96)

		var chips := _normalize_string_array(item_data.get("chips", []))
		if not chips.is_empty():
			var chip_row := _create_hbox(compact_meta, "ChipRow", 3)
			chip_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			var max_chip_count: int = min(chips.size(), 1)
			for chip_index in range(max_chip_count):
				_create_chip(chip_row, "Chip", chips[chip_index], "hud_bottom_bar", _font_size(10))
			if chips.size() > max_chip_count:
				_create_chip(chip_row, "MoreChip", "+%d" % [chips.size() - max_chip_count], "hud_bottom_bar", _font_size(10))

		var footer := _resolve_string(item_data.get("footer", ""), "")
		if footer != "":
			_create_label(body, "Footer", footer, _font_size(11)).modulate = Color(0.74, 0.82, 0.91, 0.90)
	else:
		var metadata_row := _create_hbox(body, "MetadataRow", _compact_value(6, 4))
		metadata_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var group_chip := _create_chip(metadata_row, "GroupChip", _resolve_group_label(item_data), "hud_bottom_bar", _font_size(11))
		group_chip.modulate = Color(0.93, 0.98, 0.95, 0.96)
		var owner_chip := _create_chip(metadata_row, "OwnerChip", _resolve_owner_label(item_data), "hud_bottom_bar", _font_size(11))
		owner_chip.modulate = Color(0.93, 0.98, 0.95, 0.96)
		var priority_chip := _create_chip(metadata_row, "PriorityChip", _resolve_priority_label(item_data), "hud_bottom_bar", _font_size(11))
		priority_chip.modulate = Color(0.93, 0.98, 0.95, 0.96)
		_create_spacer(metadata_row, "MetadataSpacer")

		var chips := _normalize_string_array(item_data.get("chips", []))
		if not chips.is_empty():
			var chip_row := _create_hbox(body, "ChipRow", _compact_value(6, 4))
			chip_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			for chip_text in chips:
				_create_chip(chip_row, "Chip", chip_text, "hud_bottom_bar", _font_size(11))

		var signals := _resolve_string(item_data.get("signals", ""), "")
		if signals != "":
			var signal_block := _create_status_block(body, signals, _resolve_string(item_data.get("statusTone", ""), "info"))
			signal_block.size_flags_horizontal = Control.SIZE_SHRINK_END

		var footer := _resolve_string(item_data.get("footer", ""), "")
		if footer != "":
			_create_label(body, "Footer", footer, _font_size(12)).modulate = Color(0.75, 0.83, 0.92, 0.90)

	return card


func _create_mark_block(parent: Node, item_data: Dictionary) -> PanelContainer:
	var block := PanelContainer.new()
	block.name = "MarkBlock"
	_apply_panel_style(block, "panel", "hud_bottom_bar")
	parent.add_child(block)

	var margin := _create_margin_container(block, "Margin", 8, 5, 8, 5)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var vbox := _create_vbox(margin, "VBox", 2)
	vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var badge_text := "标记" if _compact_embed else "TAG"
	var badge := _create_label(vbox, "Badge", badge_text, _font_size(11))
	badge.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	badge.modulate = Color(0.82, 0.90, 0.97, 0.94)
	var focus_font_size := 13 if _compact_embed else 14
	var focus := _create_label(vbox, "Focus", _resolve_group_label(item_data), _font_size(focus_font_size))
	focus.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	focus.modulate = Color(0.97, 0.98, 1.0, 0.98)
	var priority_font_size := 11 if _compact_embed else 12
	var priority := _create_label(vbox, "Priority", _resolve_priority_label(item_data), _font_size(priority_font_size))
	priority.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	priority.modulate = Color(0.75, 0.84, 0.93, 0.90)
	return block


func _create_status_block(parent: Node, status_text: String, tone: String) -> PanelContainer:
	var block := PanelContainer.new()
	block.name = "StatusBlock"
	_apply_panel_style(block, "panel", "hud_bottom_bar")
	parent.add_child(block)
	var margin := _create_margin_container(block, "Margin", 8, 4, 8, 4)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var label := _create_label(margin, "Label", status_text, _font_size(12))
	label.modulate = _tone_to_color(tone)
	return block


func _resolve_item_title(item_data: Dictionary, index: int) -> String:
	var title := _resolve_string(item_data.get("title", ""), "")
	if title != "":
		return title
	return "标记 %d" % [index + 1]


func _resolve_item_subtitle(item_data: Dictionary) -> String:
	var subtitle := _resolve_string(item_data.get("subtitle", ""), "")
	if subtitle != "":
		return subtitle
	var description := _resolve_string(item_data.get("description", ""), "")
	if description != "":
		return description
	return "战区提示"


func _resolve_tag_detail(item_data: Dictionary) -> String:
	var detail := _resolve_string(item_data.get("detail", ""), "")
	if detail != "":
		return detail
	return _resolve_string(item_data.get("footer", ""), "")


func _resolve_group_label(item_data: Dictionary) -> String:
	var group := _resolve_string(item_data.get("group", ""), "")
	if group != "":
		return group if _compact_embed else "组 %s" % group
	return "未分组" if _compact_embed else "组 未知"


func _resolve_owner_label(item_data: Dictionary) -> String:
	var owner := _resolve_string(item_data.get("owner", ""), "")
	if owner != "":
		return owner if _compact_embed else "归属 %s" % owner
	return "未归属" if _compact_embed else "归属 未设"


func _resolve_priority_label(item_data: Dictionary) -> String:
	var priority := _resolve_string(item_data.get("priority", ""), "")
	if priority != "":
		return priority if _compact_embed else "优先 %s" % priority
	return "普通" if _compact_embed else "优先 普通"


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
					"status": "Tagged",
					"statusTone": "info",
					"group": "",
					"owner": "",
					"priority": "Normal",
					"signals": "",
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
	return base_size - 1 if _compact_embed else base_size


func _compact_value(default_value: float, compact_value: float) -> float:
	return compact_value if _compact_embed else default_value


func _list_separation() -> int:
	return 6 if _compact_embed else 10
