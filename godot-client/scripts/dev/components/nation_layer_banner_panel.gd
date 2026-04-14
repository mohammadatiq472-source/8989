@tool
extends Control
class_name NationLayerBannerPanel

const UiThemeTokensScript = preload("res://scripts/ui/ui_theme_tokens.gd")

const SAMPLE_STATE := {
	"headline": "国家层｜立国预览",
	"subtitle": "颜色块、国号、国力、首都、入口。",
	"terminalBadge": "宏观终点",
	"terminalNote": "国家层是流程收口页，只在此完成确认。",
	"nationName": "汉室",
	"nationCode": "HAN-01",
	"nationPower": "9860",
	"capitalName": "洛阳",
	"nationColor": {"r": 0.35, "g": 0.78, "b": 0.68, "a": 1.0},
	"overviewLines": [
		"国家层优先展示颜色块、国号、国力与首都。",
		"入口要一眼可读，避免细长竖排。"
	],
	"entryHint": "入口待确认",
	"nationPalette": [
		{
			"code": "HAN",
			"name": "汉室",
			"power": "9860",
			"capital": "洛阳",
			"selected": true,
			"color": {"r": 0.35, "g": 0.78, "b": 0.68, "a": 1.0}
		},
		{
			"code": "WEI",
			"name": "魏国",
			"power": "8420",
			"capital": "许昌",
			"selected": false,
			"color": {"r": 0.95, "g": 0.71, "b": 0.18, "a": 1.0}
		},
		{
			"code": "SHU",
			"name": "蜀国",
			"power": "7985",
			"capital": "成都",
			"selected": false,
			"color": {"r": 0.82, "g": 0.48, "b": 0.94, "a": 1.0}
		},
		{
			"code": "WU",
			"name": "吴国",
			"power": "7812",
			"capital": "建业",
			"selected": false,
			"color": {"r": 0.91, "g": 0.34, "b": 0.38, "a": 1.0}
		}
	]
}

var _ui_theme_tokens = UiThemeTokensScript.new()

var _frame_panel: PanelContainer
var _top_band: ColorRect
var _hero_panel: PanelContainer
var _title_label: Label
var _subtitle_label: Label
var _summary_label: Label
var _nation_code_label: Label
var _overview_label: Label
var _terminal_chip: PanelContainer
var _terminal_note_label: Label
var _nation_power_chip: PanelContainer
var _capital_chip: PanelContainer
var _entry_hint_chip: PanelContainer
var _seal_panel: PanelContainer
var _seal_title_label: Label
var _seal_code_label: Label
var _seal_capital_label: Label
var _seal_status_label: Label


func _ready() -> void:
	_build_shell()
	apply_preview_state({})


func apply_preview_state(state: Dictionary) -> void:
	_build_shell()
	var effective_state: Dictionary = _resolve_state(state)
	var headline: String = _resolve_string(effective_state.get("headline", SAMPLE_STATE.get("headline", "国家层｜立国预览")), "国家层｜立国预览")
	var subtitle: String = _resolve_string(effective_state.get("subtitle", SAMPLE_STATE.get("subtitle", "颜色块、国号、国力、首都、入口。")), "颜色块、国号、国力、首都、入口。")
	var nation_code: String = _resolve_string(effective_state.get("nationCode", SAMPLE_STATE.get("nationCode", "HAN-01")), "HAN-01")
	var nation_power: String = _resolve_string(effective_state.get("nationPower", SAMPLE_STATE.get("nationPower", "9860")), "9860")
	var capital_name: String = _resolve_string(effective_state.get("capitalName", SAMPLE_STATE.get("capitalName", "洛阳")), "洛阳")
	var nation_name: String = _resolve_string(effective_state.get("nationName", SAMPLE_STATE.get("nationName", "汉室")), "汉室")
	var nation_color: Color = _read_color(effective_state.get("nationColor", SAMPLE_STATE.get("nationColor", null)), Color(0.35, 0.78, 0.68, 1.0))
	var overview_lines: Array = _normalize_string_array(effective_state.get("overviewLines", SAMPLE_STATE.get("overviewLines", [])))
	var palette_entries: Array = _normalize_palette_entries(effective_state.get("nationPalette", SAMPLE_STATE.get("nationPalette", [])))
	var palette_count: int = max(1, palette_entries.size())
	var terminal_badge: String = _resolve_string(_read_string_field(effective_state, "macroFlow", "badge", SAMPLE_STATE.get("terminalBadge", "宏观终点")), "宏观终点")
	var terminal_note: String = _resolve_string(_read_string_field(effective_state, "macroFlow", "note", SAMPLE_STATE.get("terminalNote", "国家层是流程收口页，只在此完成确认。")), "国家层是流程收口页，只在此完成确认。")
	var entry_status: String = _resolve_string(effective_state.get("entryStatus", SAMPLE_STATE.get("entryHint", "入口待确认")), "入口待确认")

	_title_label.text = headline
	_subtitle_label.text = subtitle
	_summary_label.text = "%s｜国力 %s｜战区 %d｜色块 %d" % [terminal_badge, nation_power, palette_count, palette_count]
	_nation_code_label.text = "国号 %s" % nation_code
	_overview_label.text = _build_overview_text(overview_lines, nation_name, capital_name, terminal_note)
	_set_chip_text(_terminal_chip, terminal_badge)
	_set_chip_text(_nation_power_chip, "国力 %s" % nation_power)
	_set_chip_text(_capital_chip, "首都 %s" % capital_name)
	_set_chip_text(_entry_hint_chip, entry_status)
	_seal_title_label.text = "国家锚点"
	_seal_code_label.text = nation_code
	_seal_capital_label.text = capital_name
	_seal_status_label.text = "%s / %s" % [terminal_badge, entry_status]

	_title_label.modulate = nation_color
	_summary_label.modulate = Color(nation_color.r, nation_color.g, nation_color.b, 0.94)
	_nation_code_label.modulate = Color(0.92, 0.98, 0.84, 0.96)
	_subtitle_label.modulate = Color(0.84, 0.90, 0.97, 0.92)
	_overview_label.modulate = Color(0.89, 0.95, 1.0, 0.95)
	_terminal_chip.modulate = nation_color
	_terminal_note_label.text = terminal_note
	_terminal_note_label.modulate = Color(0.88, 0.94, 0.98, 0.94)
	_seal_title_label.modulate = nation_color
	_seal_code_label.modulate = Color(0.97, 0.99, 0.95, 0.98)
	_seal_capital_label.modulate = Color(0.88, 0.94, 0.98, 0.95)
	_seal_status_label.modulate = Color(0.92, 0.98, 0.84, 0.96)

	if not overview_lines.is_empty():
		_subtitle_label.text = overview_lines[0]


func _build_shell() -> void:
	if _frame_panel != null:
		return

	clip_contents = true

	_frame_panel = PanelContainer.new()
	_frame_panel.name = "Frame"
	_frame_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_apply_panel_style(_frame_panel, "panel", "observability_panel")
	add_child(_frame_panel)

	_top_band = ColorRect.new()
	_top_band.name = "TopBand"
	_top_band.color = Color(0.34, 0.78, 0.68, 0.28)
	_top_band.anchor_left = 0.0
	_top_band.anchor_top = 0.0
	_top_band.anchor_right = 1.0
	_top_band.anchor_bottom = 0.0
	_top_band.offset_left = 2.0
	_top_band.offset_top = 2.0
	_top_band.offset_right = -2.0
	_top_band.offset_bottom = 8.0
	_frame_panel.add_child(_top_band)

	var margin := _create_margin_container(_frame_panel, "Margin", 14, 12, 14, 12)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var body := _create_vbox(margin, "Body", 5)
	body.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	_hero_panel = _create_panel(body, "HeroPanel")
	_apply_panel_style(_hero_panel, "panel", "hud_top_left")
	_hero_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	var hero_margin := _create_margin_container(_hero_panel, "HeroMargin", 10, 8, 10, 8)
	hero_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var hero_vbox := _create_vbox(hero_margin, "HeroVBox", 3)
	hero_vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var top_row := _create_hbox(hero_vbox, "BannerTopRow", 5)
	top_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var title_col := _create_vbox(top_row, "TitleColumn", 0)
	title_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_title_label = _create_label(title_col, "Title", "国家层｜立国预览", 18)
	_apply_compact_label(_title_label)
	_title_label.modulate = Color(0.96, 0.99, 1.0, 0.98)
	_subtitle_label = _create_label(title_col, "Subtitle", "颜色块、国号、国力、首都、入口。", 9)
	_apply_compact_label(_subtitle_label)
	_subtitle_label.modulate = Color(0.84, 0.90, 0.97, 0.92)

	var title_spacer := Control.new()
	title_spacer.name = "BannerSpacer"
	title_spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top_row.add_child(title_spacer)

	_nation_code_label = _create_label(top_row, "NationCode", "国号 HAN-01", 10)
	_apply_compact_label(_nation_code_label)
	_nation_code_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_nation_code_label.size_flags_horizontal = Control.SIZE_SHRINK_END
	_nation_code_label.modulate = Color(0.92, 0.97, 0.84, 0.96)

	_summary_label = _create_label(hero_vbox, "Summary", "国力 9860｜战区 3｜色块 4", 10)
	_apply_compact_label(_summary_label)
	_summary_label.modulate = Color(0.78, 0.88, 0.96, 0.94)
	_overview_label = _create_label(hero_vbox, "Overview", "国家层优先展示颜色块、国号、国力与首都。", 9)
	_apply_compact_label(_overview_label)
	_overview_label.modulate = Color(0.89, 0.95, 1.0, 0.95)
	var terminal_row := _create_hbox(hero_vbox, "TerminalRow", 6)
	terminal_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_terminal_chip = _create_chip(terminal_row, "TerminalChip", "宏观终点", "hud_bottom_bar", 9)
	_terminal_chip.custom_minimum_size = Vector2(88.0, 24.0)
	_terminal_note_label = _create_label(terminal_row, "TerminalNote", "国家层是流程收口页，只在此完成确认。", 9)
	_apply_compact_label(_terminal_note_label)
	_terminal_note_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_terminal_note_label.modulate = Color(0.88, 0.94, 0.98, 0.94)

	var metrics_row := _create_hbox(body, "MetricsRow", 5)
	metrics_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_nation_power_chip = _create_chip(metrics_row, "PowerChip", "国力 9860", "hud_bottom_bar", 9)
	_nation_power_chip.custom_minimum_size = Vector2(88.0, 24.0)
	_capital_chip = _create_chip(metrics_row, "CapitalChip", "首都 洛阳", "hud_bottom_bar", 9)
	_capital_chip.custom_minimum_size = Vector2(96.0, 24.0)
	_entry_hint_chip = _create_chip(metrics_row, "EntryHintChip", "入口待确认", "hud_bottom_bar", 9)
	_entry_hint_chip.custom_minimum_size = Vector2(104.0, 24.0)
	_entry_hint_chip.modulate = Color(0.87, 0.92, 0.97, 0.96)
	var metrics_spacer := Control.new()
	metrics_spacer.name = "MetricsSpacer"
	metrics_spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	metrics_row.add_child(metrics_spacer)

	var seal_row := _create_hbox(body, "SealRow", 8)
	seal_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var seal_left := _create_panel(seal_row, "SealLeft")
	_apply_panel_style(seal_left, "panel", "hud_bottom_bar")
	seal_left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var seal_left_margin := _create_margin_container(seal_left, "Margin", 8, 6, 8, 6)
	seal_left_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var seal_left_vbox := _create_vbox(seal_left_margin, "SealLeftVBox", 1)
	seal_left_vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_seal_title_label = _create_label(seal_left_vbox, "SealTitle", "国家锚点", 10)
	_apply_compact_label(_seal_title_label)
	_seal_title_label.modulate = Color(0.96, 0.99, 1.0, 0.97)
	_seal_code_label = _create_label(seal_left_vbox, "SealCode", "HAN-01", 14)
	_apply_compact_label(_seal_code_label)
	_seal_code_label.modulate = Color(0.97, 0.99, 0.95, 0.98)
	_seal_capital_label = _create_label(seal_left_vbox, "SealCapital", "洛阳", 9)
	_apply_compact_label(_seal_capital_label)
	_seal_capital_label.modulate = Color(0.88, 0.94, 0.98, 0.95)
	var seal_right := _create_panel(seal_row, "SealRight")
	_apply_panel_style(seal_right, "panel", "hud_top_left")
	seal_right.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	var seal_right_margin := _create_margin_container(seal_right, "Margin", 8, 6, 8, 6)
	seal_right_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_seal_status_label = _create_label(seal_right_margin, "Tag", "宏观终点", 10)
	_apply_compact_label(_seal_status_label)
	_seal_status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_seal_status_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_seal_status_label.modulate = Color(0.92, 0.98, 0.84, 0.96)
	var seal_right_subtitle := _create_label(seal_right_margin, "Subtitle", "只在此完成确认", 8)
	_apply_compact_label(seal_right_subtitle)
	seal_right_subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	seal_right_subtitle.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	seal_right_subtitle.modulate = Color(0.83, 0.91, 0.98, 0.95)


func _resolve_state(state: Dictionary) -> Dictionary:
	var effective := SAMPLE_STATE.duplicate(true)
	for key_variant in state.keys():
		var key := str(key_variant)
		var value: Variant = state.get(key_variant, null)
		if value is Dictionary:
			effective[key] = (value as Dictionary).duplicate(true)
		elif value is Array:
			effective[key] = _duplicate_array(value as Array)
		else:
			effective[key] = value
	return effective


func _normalize_palette_entries(raw_palette: Variant) -> Array:
	var entries: Array = []
	if raw_palette is Array:
		for raw_item in raw_palette:
			if raw_item is Dictionary:
				entries.append((raw_item as Dictionary).duplicate(true))
	return entries


func _normalize_string_array(raw_values: Variant) -> Array:
	var values: Array = []
	if raw_values is Array:
		for item in raw_values:
			var text := str(item).strip_edges()
			if text != "":
				values.append(text)
	return values


func _duplicate_array(values: Array) -> Array:
	var copied: Array = []
	for item in values:
		if item is Dictionary:
			copied.append((item as Dictionary).duplicate(true))
		elif item is Array:
			copied.append(_duplicate_array(item as Array))
		else:
			copied.append(item)
	return copied


func _resolve_string(value: Variant, fallback: String) -> String:
	var resolved := str(value).strip_edges()
	if resolved == "":
		return fallback
	return resolved


func _set_chip_text(chip: PanelContainer, text: String) -> void:
	if chip == null:
		return
	var text_label := chip.get_node_or_null("Margin/Text")
	if text_label is Label:
		(text_label as Label).text = text
		_apply_compact_label(text_label as Label)


func _apply_compact_label(label: Label) -> void:
	if label == null:
		return
	label.autowrap_mode = TextServer.AUTOWRAP_OFF
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	label.clip_text = true


func _create_chip(parent: Node, node_name: String, text: String, token_name: String, font_size: int = 10) -> PanelContainer:
	var chip := _create_panel(parent, node_name)
	_apply_panel_style(chip, "panel", token_name)
	chip.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	chip.size_flags_vertical = Control.SIZE_SHRINK_CENTER

	var margin := _create_margin_container(chip, "Margin", 10, 4, 10, 4)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var label := _create_label(margin, "Text", text, font_size)
	_apply_compact_label(label)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	label.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	return chip


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


func _apply_panel_style(panel: PanelContainer, category: String, token_name: String) -> bool:
	return _ui_theme_tokens.apply_panel_style(panel, category, token_name)


func _read_color(raw_color: Variant, fallback_color: Color) -> Color:
	if raw_color is Color:
		return raw_color as Color
	if raw_color is Dictionary:
		var color_dict: Dictionary = raw_color as Dictionary
		if color_dict.has("r") and color_dict.has("g") and color_dict.has("b"):
			return Color(
				float(color_dict.get("r", fallback_color.r)),
				float(color_dict.get("g", fallback_color.g)),
				float(color_dict.get("b", fallback_color.b)),
				float(color_dict.get("a", fallback_color.a))
			)
	return fallback_color


func _build_overview_text(overview_lines: Array, nation_name: String, capital_name: String, terminal_note: String) -> String:
	var lines: Array = []
	if not overview_lines.is_empty():
		for line_variant in overview_lines:
			var line := str(line_variant).strip_edges()
			if line != "":
				lines.append(line)
	if lines.is_empty():
		lines.append("%s · 首都 %s" % [nation_name, capital_name])
	if terminal_note.strip_edges() != "":
		lines.append(terminal_note)
	return "\n".join(lines)


func _read_string_field(state: Dictionary, parent_key: String, child_key: String, fallback_value: String) -> String:
	var container: Variant = state.get(parent_key, {})
	if container is Dictionary:
		return str((container as Dictionary).get(child_key, fallback_value))
	return fallback_value
