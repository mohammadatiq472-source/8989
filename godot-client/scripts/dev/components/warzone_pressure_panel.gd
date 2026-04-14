@tool
extends PanelContainer
class_name WarzonePressurePanel

const UiThemeTokensScript = preload("res://scripts/ui/ui_theme_tokens.gd")

const SAMPLE_STATE: Dictionary = {
	"headline": "热点压强",
	"subheadline": "先看热区，再看前线负载。",
	"compactEmbed": true,
	"pressureLines": [
		{
			"label": "洛阳主城",
			"pressure": 82,
			"value": "82 / 100",
			"note": "都城与仓储持续承压。",
		},
		{
			"label": "虎牢关口",
			"pressure": 66,
			"value": "66 / 100",
			"note": "门闸稳，盯外线推进。",
		},
		{
			"label": "汜水路线",
			"pressure": 53,
			"value": "53 / 100",
			"note": "补给线可用。",
		},
	],
}

var _theme_tokens: UiThemeTokens = UiThemeTokensScript.new()
var _content_margin: MarginContainer
var _pressure_title: Label
var _pressure_subtitle: Label
var _pressure_chip_row: HBoxContainer
var _pressure_accent_bar: ColorRect
var _pressure_rows: VBoxContainer
var _compact_embed: bool = true
var _preview_state: Dictionary = {}
var _ui_ready: bool = false


func _ready() -> void:
	_build_shell()
	if _preview_state.is_empty():
		apply_preview_state(SAMPLE_STATE)


func apply_preview_state(state: Dictionary) -> void:
	if not _ui_ready:
		_build_shell()
	_preview_state = _merge_preview_state(state)
	_compact_embed = bool(_preview_state.get("compactEmbed", true))
	_apply_compact_layout()
	_render_state()


func _build_shell() -> void:
	if _ui_ready:
		return
	_ui_ready = true

	_apply_panel_style(self, "panel", "observability_panel")

	_content_margin = _create_margin_container(self, "PressureMargin", 16, 14, 16, 14)
	_content_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var pressure_vbox := _create_vbox(_content_margin, "PressureVBox", 8)
	pressure_vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	_pressure_title = _create_label(pressure_vbox, "PressureTitle", "热点压强", 17)
	_apply_compact_text_mode(_pressure_title)
	_pressure_title.modulate = Color(0.98, 0.93, 0.82, 0.96)
	_pressure_subtitle = _create_label(pressure_vbox, "PressureSubtitle", "先看热区，再看前线负载。", 11)
	_apply_compact_text_mode(_pressure_subtitle)
	_pressure_subtitle.modulate = Color(0.94, 0.90, 0.84, 0.86)

	_pressure_accent_bar = ColorRect.new()
	_pressure_accent_bar.name = "PressureAccentBar"
	_pressure_accent_bar.color = Color(1.0, 0.60, 0.24, 0.95)
	_pressure_accent_bar.custom_minimum_size = Vector2(0.0, 4.0)
	pressure_vbox.add_child(_pressure_accent_bar)

	_pressure_chip_row = _create_hbox(pressure_vbox, "PressureChipRow", 6)
	_pressure_chip_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_pressure_chip_row.custom_minimum_size = Vector2(0.0, 26.0)

	_pressure_rows = _create_vbox(pressure_vbox, "PressureRows", 8)
	_pressure_rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_pressure_rows.size_flags_vertical = Control.SIZE_EXPAND_FILL


func _render_state() -> void:
	var accent := _read_color(_preview_state.get("accentColor", null), Color(0.62, 0.82, 1.0, 0.96))
	var pressure_lines := _normalize_array(_preview_state.get("pressureLines", []))
	var high_count := _count_pressure_bands(pressure_lines, 85)
	var mid_count := _count_pressure_bands(pressure_lines, 65, 84)
	var low_count := _count_pressure_bands(pressure_lines, 0, 64)
	_pressure_title.text = str(_preview_state.get("headline", SAMPLE_STATE.get("headline", "热点压强")))
	_pressure_subtitle.text = str(_preview_state.get("subheadline", SAMPLE_STATE.get("subheadline", "")))
	_pressure_title.modulate = accent.lightened(0.22)
	_pressure_subtitle.modulate = Color(0.95, 0.92, 0.86, 0.92)
	if _pressure_accent_bar != null and is_instance_valid(_pressure_accent_bar):
		var peak_pressure := 42
		if high_count > 0:
			peak_pressure = 88
		elif mid_count > 0:
			peak_pressure = 70
		_pressure_accent_bar.color = _pressure_color(peak_pressure, accent)
	_render_pressure_chips(_pressure_chip_row, high_count, mid_count, low_count, accent)
	_render_pressure_rows(_pressure_rows, pressure_lines, accent)


func _render_pressure_chips(parent: HBoxContainer, high_count: int, mid_count: int, low_count: int, accent: Color) -> void:
	_clear_children(parent)
	parent.add_child(_create_chip("红线 %d" % high_count, _pressure_color(88, accent), "hud_bottom_bar", "PressureChipHigh", 10))
	parent.add_child(_create_chip("高压 %d" % mid_count, _pressure_color(70, accent), "observability_panel", "PressureChipMid", 10))
	parent.add_child(_create_chip("稳态 %d" % low_count, accent.lightened(0.12), "hud_top_left", "PressureChipLow", 10))


func _render_pressure_rows(parent: VBoxContainer, rows: Array, accent: Color) -> void:
	_clear_children(parent)
	var index := 0
	for row_variant in rows:
		if row_variant is not Dictionary:
			continue
		var row: Dictionary = row_variant as Dictionary
		var card := PanelContainer.new()
		card.name = "PressureCard_%d" % index
		card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_apply_panel_style(card, "panel", "observability_panel")
		parent.add_child(card)

		var margin_left_right := 9 if _compact_embed else 11
		var margin_top_bottom := 7 if _compact_embed else 9
		var margin := _create_margin_container(card, "PressureCardMargin_%d" % index, margin_left_right, margin_top_bottom, margin_left_right, margin_top_bottom)
		margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		var vbox := _create_vbox(margin, "PressureCardVBox_%d" % index, 3 if _compact_embed else 4)
		vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

		var strip := ColorRect.new()
		strip.name = "PressureStripe_%d" % index
		strip.custom_minimum_size = Vector2(0.0, 3.0)
		strip.color = _pressure_color(int(row.get("pressure", 0)), accent)
		vbox.add_child(strip)

		var row_top := _create_hbox(vbox, "PressureRowTop_%d" % index, 6 if _compact_embed else 8)
		row_top.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var rank_chip := _create_chip("%d" % (index + 1), accent.lightened(0.15), "hud_top_left", "PressureRank_%d" % index, 10)
		row_top.add_child(rank_chip)
		var title := _create_label(row_top, "PressureRowTitle_%d" % index, str(row.get("label", "压力节点")), _pressure_font_size(14))
		_apply_compact_text_mode(title)
		title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		title.modulate = Color(0.98, 0.99, 1.0, 0.98)
		var value := _create_label(row_top, "PressureRowValue_%d" % index, str(row.get("value", "-")), _pressure_font_size(14))
		_apply_compact_text_mode(value)
		value.modulate = _pressure_color(int(row.get("pressure", 0)), accent)
		var status_chip := _create_chip(_pressure_band_text(int(row.get("pressure", 0))), _pressure_color(int(row.get("pressure", 0)), accent), "hud_bottom_bar", "PressureStatus_%d" % index, 10)
		row_top.add_child(status_chip)
		var spacer := Control.new()
		spacer.name = "PressureSpacer_%d" % index
		spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row_top.add_child(spacer)

		var bar := ProgressBar.new()
		bar.name = "PressureRowBar_%d" % index
		bar.min_value = 0
		bar.max_value = 100
		bar.value = clampi(int(row.get("pressure", 0)), 0, 100)
		bar.show_percentage = false
		bar.custom_minimum_size = Vector2(0.0, 10.0)
		bar.modulate = _pressure_color(int(row.get("pressure", 0)), accent)
		vbox.add_child(bar)

		var note := _create_label(vbox, "PressureRowNote_%d" % index, str(row.get("note", "")), _pressure_font_size(12))
		_apply_compact_text_mode(note)
		note.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		note.modulate = Color(0.90, 0.95, 1.0, 0.88)
		index += 1


func _apply_compact_layout() -> void:
	if _pressure_rows != null and is_instance_valid(_pressure_rows):
		_pressure_rows.add_theme_constant_override("separation", 5 if _compact_embed else 7)
	if _pressure_chip_row != null and is_instance_valid(_pressure_chip_row):
		_pressure_chip_row.add_theme_constant_override("separation", 5 if _compact_embed else 7)


func _apply_compact_text_mode(label: Label) -> void:
	if label == null:
		return
	if not _compact_embed:
		return
	label.autowrap_mode = TextServer.AUTOWRAP_OFF
	label.clip_text = true
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS


func _pressure_color(pressure: int, accent: Color) -> Color:
	var safe_pressure := clampi(pressure, 0, 100)
	if safe_pressure >= 85:
		return Color(1.0, 0.30, 0.26, 0.99)
	if safe_pressure >= 65:
		return Color(1.0, 0.60, 0.22, 0.98)
	if safe_pressure >= 45:
		return Color(1.0, 0.83, 0.26, 0.96)
	return accent.lightened(0.06)


func _pressure_band_text(pressure: int) -> String:
	var safe_pressure := clampi(pressure, 0, 100)
	if safe_pressure >= 85:
		return "红线"
	if safe_pressure >= 65:
		return "高压"
	if safe_pressure >= 45:
		return "中压"
	return "轻压"


func _count_pressure_bands(rows: Array, min_pressure: int, max_pressure: int = 100) -> int:
	var count := 0
	for row_variant in rows:
		if row_variant is not Dictionary:
			continue
		var pressure := int((row_variant as Dictionary).get("pressure", 0))
		if pressure >= min_pressure and pressure <= max_pressure:
			count += 1
	return count


func _create_chip(text: String, accent: Color, token_name: String = "hud_top_left", node_name: String = "", font_size: int = 10) -> PanelContainer:
	var chip := PanelContainer.new()
	chip.name = node_name if node_name != "" else "Chip_%s" % text.replace(" ", "_").replace("/", "_")
	chip.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	chip.custom_minimum_size = Vector2(0.0, 24.0)
	_apply_panel_style(chip, "panel", token_name)
	var margin := _create_margin_container(chip, "ChipMargin", 7, 1, 7, 1)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var label := _create_label(margin, "Text", text, font_size)
	_apply_compact_text_mode(label)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.modulate = accent
	return chip


func _pressure_font_size(base_size: int) -> int:
	return base_size - 1 if _compact_embed and base_size > 10 else base_size


func _clear_children(parent: Node) -> void:
	for child in parent.get_children():
		child.queue_free()


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


func _apply_panel_style(panel: PanelContainer, category: String, token_name: String) -> void:
	if panel == null:
		return
	_theme_tokens.apply_panel_style(panel, category, token_name)


func _merge_preview_state(state: Dictionary) -> Dictionary:
	var merged_state: Dictionary = SAMPLE_STATE.duplicate(true)
	if state.is_empty():
		return merged_state
	for key_variant in state.keys():
		var key := str(key_variant)
		var value: Variant = state.get(key_variant, null)
		if value is Dictionary:
			merged_state[key] = (value as Dictionary).duplicate(true)
		elif value is Array:
			merged_state[key] = _duplicate_array(value as Array)
		else:
			merged_state[key] = value
	return merged_state


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


func _normalize_array(raw_value: Variant) -> Array:
	if raw_value is Array:
		return _duplicate_array(raw_value as Array)
	return []


func _read_color(raw_color: Variant, fallback_color: Color) -> Color:
	if raw_color is Color:
		return raw_color as Color
	if raw_color is Dictionary:
		var color_dict: Dictionary = raw_color as Dictionary
		if color_dict.has("r") and color_dict.has("g") and color_dict.has("b"):
			var r: float = float(color_dict.get("r", fallback_color.r))
			var g: float = float(color_dict.get("g", fallback_color.g))
			var b: float = float(color_dict.get("b", fallback_color.b))
			var a: float = float(color_dict.get("a", fallback_color.a))
			return Color(r, g, b, a)
	return fallback_color
