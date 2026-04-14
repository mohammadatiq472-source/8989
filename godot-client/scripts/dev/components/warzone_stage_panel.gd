@tool
extends PanelContainer
class_name WarzoneStagePanel

const UiThemeTokensScript = preload("res://scripts/ui/ui_theme_tokens.gd")

const SAMPLE_STATE: Dictionary = {
	"headline": "战区层｜多战区总览",
	"subheadline": "同屏读关口、路线与压强，不下钻地块。",
	"overviewPill": "司隶总览",
	"provinceSummary": "州内总览｜战区 0｜热点 0｜关口 0",
	"accentColor": {
		"r": 0.62,
		"g": 0.82,
		"b": 1.0,
		"a": 0.96,
	},
	"compactEmbed": true,
	"warzones": [
		{
			"name": "洛阳中枢",
			"pressure": 82,
			"hotspot": "都城压强",
			"gate": "虎牢关",
			"route": "北线主路",
			"anchor": "洛阳",
			"detail": "都城与仓储同屏，读整体压强。",
		},
		{
			"name": "虎牢前线",
			"pressure": 66,
			"hotspot": "关口",
			"gate": "汜水",
			"route": "北门通道",
			"anchor": "虎牢",
			"detail": "关口门闸可见，先看敌我拉扯。",
		},
		{
			"name": "汜水走廊",
			"pressure": 53,
			"hotspot": "补给",
			"gate": "河桥",
			"route": "东南补线",
			"anchor": "汜水",
			"detail": "补给线完整，主要看是否被切断。",
		},
		{
			"name": "关东外缘",
			"pressure": 38,
			"hotspot": "侦察",
			"gate": "侧翼口",
			"route": "外围游走",
			"anchor": "外缘",
			"detail": "外围负责侦察与侧翼预警。",
		},
	],
}

var _theme_tokens: UiThemeTokens = UiThemeTokensScript.new()
var _content_margin: MarginContainer
var _hero_title: Label
var _hero_subtitle: Label
var _hero_meta: Label
var _hero_badge_row: HBoxContainer
var _hero_focus_label: Label
var _accent_bar: ColorRect
var _warzone_grid: GridContainer
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

	_apply_panel_style(self, "panel", "hud_top_left")

	_content_margin = _create_margin_container(self, "StageMargin", 18, 16, 18, 16)
	_content_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var stage_vbox := _create_vbox(_content_margin, "StageVBox", 10)
	stage_vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	_hero_title = _create_label(stage_vbox, "StageTitle", "战区层｜多战区总览", 21)
	_apply_compact_text_mode(_hero_title)
	_hero_title.modulate = Color(0.94, 0.98, 1.0, 0.98)
	_hero_subtitle = _create_label(stage_vbox, "StageSubtitle", "同屏读关口、路线与压强，不下钻地块。", 13)
	_apply_compact_text_mode(_hero_subtitle)
	_hero_subtitle.modulate = Color(0.78, 0.88, 0.97, 0.92)
	_hero_meta = _create_label(stage_vbox, "StageMeta", "州内总览｜战区 0｜热点 0｜关口 0", 12)
	_apply_compact_text_mode(_hero_meta)
	_hero_meta.modulate = Color(0.92, 0.94, 0.98, 0.88)

	_accent_bar = ColorRect.new()
	_accent_bar.name = "StageAccentBar"
	_accent_bar.color = Color(0.62, 0.82, 1.0, 0.92)
	_accent_bar.custom_minimum_size = Vector2(0.0, 4.0)
	stage_vbox.add_child(_accent_bar)

	_hero_badge_row = _create_hbox(stage_vbox, "StageBadgeRow", 8)
	_hero_badge_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_hero_badge_row.custom_minimum_size = Vector2(0.0, 28.0)
	_hero_focus_label = _create_label(stage_vbox, "StageFocus", "读板聚焦：等待战区摘要刷新", 12)
	_apply_compact_text_mode(_hero_focus_label)
	_hero_focus_label.modulate = Color(0.80, 0.90, 0.99, 0.84)

	var header_divider := ColorRect.new()
	header_divider.name = "StageDivider"
	header_divider.color = Color(0.20, 0.26, 0.34, 0.8)
	header_divider.custom_minimum_size = Vector2(0.0, 2.0)
	stage_vbox.add_child(header_divider)

	var grid_scroll := ScrollContainer.new()
	grid_scroll.name = "StageScroll"
	grid_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	grid_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	stage_vbox.add_child(grid_scroll)

	_warzone_grid = GridContainer.new()
	_warzone_grid.name = "WarzoneGrid"
	_warzone_grid.columns = 2
	_warzone_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_warzone_grid.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_warzone_grid.add_theme_constant_override("h_separation", 12)
	_warzone_grid.add_theme_constant_override("v_separation", 12)
	grid_scroll.add_child(_warzone_grid)


func _render_state() -> void:
	var accent := _read_color(_preview_state.get("accentColor", null), Color(0.62, 0.82, 1.0, 0.96))
	var overview_pill := str(_preview_state.get("overviewPill", "司隶总览")).strip_edges()
	var province_summary := str(_preview_state.get("provinceSummary", "州内总览｜战区 0｜热点 0｜关口 0")).strip_edges()
	var warzones := _normalize_array(_preview_state.get("warzones", []))
	var zone_count := warzones.size()
	var pressure_summary := _summarize_pressure_bands(warzones)
	var focus_line := _resolve_focus_line(warzones)

	_hero_title.text = str(_preview_state.get("headline", SAMPLE_STATE.get("headline", "战区层｜多战区总览")))
	_hero_subtitle.text = str(_preview_state.get("subheadline", SAMPLE_STATE.get("subheadline", "")))
	_hero_meta.text = "%s · %s" % [province_summary, pressure_summary]
	_rebuild_badge_row(_hero_badge_row, [
		overview_pill,
		"战区 %d" % zone_count,
		"高压 %d" % _count_high_pressure(warzones),
		"关口 %d" % _count_non_empty_tags(warzones, "gate"),
	], accent)
	_hero_focus_label.text = focus_line
	if _accent_bar != null and is_instance_valid(_accent_bar):
		_accent_bar.color = accent
	_render_warzone_cards(_warzone_grid, warzones, accent)


func _render_warzone_cards(parent: GridContainer, zones: Array, accent: Color) -> void:
	_clear_children(parent)
	var index := 0
	for zone_variant in zones:
		if zone_variant is not Dictionary:
			continue
		var zone: Dictionary = zone_variant as Dictionary
		var card := PanelContainer.new()
		card.name = "WarzoneCard_%d" % index
		card.custom_minimum_size = Vector2(520.0 if _compact_embed else 460.0, 108.0)
		_apply_panel_style(card, "panel", "hud_top_left" if index % 2 == 0 else "observability_panel")
		parent.add_child(card)

		var margin_left_right := 9 if _compact_embed else 13
		var margin_top_bottom := 7 if _compact_embed else 11
		var margin := _create_margin_container(card, "CardMargin_%d" % index, margin_left_right, margin_top_bottom, margin_left_right, margin_top_bottom)
		margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		var vbox := _create_vbox(margin, "CardVBox_%d" % index, 4 if _compact_embed else 5)
		vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

		var top_strip := ColorRect.new()
		top_strip.name = "WarzoneStripe_%d" % index
		top_strip.custom_minimum_size = Vector2(0.0, 3.0)
		top_strip.color = _pressure_color(int(zone.get("pressure", 0)), accent)
		vbox.add_child(top_strip)

		var header_row := _create_hbox(vbox, "WarzoneHeader_%d" % index, 8 if _compact_embed else 10)
		header_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		header_row.alignment = BoxContainer.ALIGNMENT_BEGIN

		var name := _create_label(header_row, "WarzoneName_%d" % index, str(zone.get("name", "战区")), _warzone_font_size(17))
		_apply_compact_text_mode(name)
		name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		name.modulate = Color(0.98, 0.99, 1.0, 0.98)

		var pressure_chip := _create_chip(_pressure_label(int(zone.get("pressure", 0))), _pressure_color(int(zone.get("pressure", 0)), accent), "hud_bottom_bar", "PressureChip_%d" % index, 11)
		header_row.add_child(pressure_chip)
		var gate_chip := _create_chip(str(zone.get("gate", "关口")), Color(0.92, 0.97, 1.0, 0.98), "observability_panel", "GateChip_%d" % index, 10)
		header_row.add_child(gate_chip)

		var tag_row := _create_hbox(vbox, "WarzoneTags_%d" % index, 6)
		tag_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_render_tag_row(tag_row, zone, accent)

		var top_line := str(zone.get("topLine", ""))
		if top_line == "":
			top_line = "热点 %s · 关口 %s · 路线 %s" % [str(zone.get("hotspot", "-")), str(zone.get("gate", "-")), str(zone.get("route", "-"))]
		var detail := _create_label(vbox, "WarzoneTopLine_%d" % index, top_line, _warzone_font_size(11))
		_apply_compact_text_mode(detail)
		detail.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		detail.modulate = Color(0.84, 0.92, 1.0, 0.95)

		var pressure := int(zone.get("pressure", 0))
		var pressure_bar := ProgressBar.new()
		pressure_bar.name = "WarzonePressure_%d" % index
		pressure_bar.min_value = 0
		pressure_bar.max_value = 100
		pressure_bar.value = clampi(pressure, 0, 100)
		pressure_bar.show_percentage = false
		pressure_bar.custom_minimum_size = Vector2(0.0, 12.0)
		pressure_bar.modulate = _pressure_color(pressure, accent)
		vbox.add_child(pressure_bar)

		var footer := str(zone.get("detail", "")).strip_edges()
		if footer == "":
			footer = "驻点 %s · 路线 %s" % [str(zone.get("anchor", "-")), str(zone.get("route", "-"))]
		var footer_label := _create_label(vbox, "WarzoneFooter_%d" % index, footer, _warzone_font_size(11))
		_apply_compact_text_mode(footer_label)
		footer_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		footer_label.modulate = Color(0.89, 0.95, 0.99, 0.84)
		index += 1


func _rebuild_badge_row(parent: HBoxContainer, labels: Array, accent: Color) -> void:
	_clear_children(parent)
	for label_variant in labels:
		var label_text := str(label_variant).strip_edges()
		if label_text == "":
			continue
		parent.add_child(_create_chip(label_text, accent, "hud_top_left", "HeroChip_%s" % label_text.replace(" ", "_"), 11))


func _create_chip(text: String, accent: Color, token_name: String = "hud_top_left", node_name: String = "", font_size: int = 11) -> PanelContainer:
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


func _apply_compact_layout() -> void:
	if _warzone_grid != null and is_instance_valid(_warzone_grid):
		_warzone_grid.columns = 1 if _compact_embed else 2
		_warzone_grid.add_theme_constant_override("h_separation", 7 if _compact_embed else 10)
		_warzone_grid.add_theme_constant_override("v_separation", 7 if _compact_embed else 10)
	if _hero_badge_row != null and is_instance_valid(_hero_badge_row):
		_hero_badge_row.add_theme_constant_override("separation", 5 if _compact_embed else 7)
	if _hero_focus_label != null and is_instance_valid(_hero_focus_label):
		_hero_focus_label.add_theme_font_size_override("font_size", 11 if _compact_embed else 12)


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


func _pressure_label(pressure: int) -> String:
	var safe_pressure := clampi(pressure, 0, 100)
	if safe_pressure >= 85:
		return "红线 %d" % safe_pressure
	if safe_pressure >= 65:
		return "高压 %d" % safe_pressure
	if safe_pressure >= 45:
		return "中压 %d" % safe_pressure
	return "轻压 %d" % safe_pressure


func _render_tag_row(parent: HBoxContainer, zone: Dictionary, accent: Color) -> void:
	var tags := [
		str(zone.get("hotspot", "")).strip_edges(),
		str(zone.get("anchor", "")).strip_edges(),
		str(zone.get("route", "")).strip_edges(),
	]
	for tag_text in tags:
		if tag_text == "":
			continue
		parent.add_child(_create_chip(tag_text, accent.lightened(0.12), "observability_panel", "Tag_%s" % tag_text.replace(" ", "_").replace("/", "_"), 10))


func _count_high_pressure(warzones: Array) -> int:
	var count := 0
	for zone_variant in warzones:
		if zone_variant is Dictionary and int((zone_variant as Dictionary).get("pressure", 0)) >= 65:
			count += 1
	return count


func _count_non_empty_tags(warzones: Array, key_name: String) -> int:
	var count := 0
	for zone_variant in warzones:
		if zone_variant is not Dictionary:
			continue
		var value := str((zone_variant as Dictionary).get(key_name, "")).strip_edges()
		if value != "":
			count += 1
	return count


func _summarize_pressure_bands(warzones: Array) -> String:
	var high_count := 0
	var mid_count := 0
	for zone_variant in warzones:
		if zone_variant is not Dictionary:
			continue
		var pressure := int((zone_variant as Dictionary).get("pressure", 0))
		if pressure >= 85:
			high_count += 1
		elif pressure >= 65:
			mid_count += 1
	if high_count > 0:
		return "红线 %d · 高压 %d" % [high_count, mid_count]
	if mid_count > 0:
		return "高压 %d · 读板稳定" % mid_count
	return "压强平稳"


func _resolve_focus_line(warzones: Array) -> String:
	if warzones.is_empty():
		return "读板聚焦：等待战区摘要刷新"
	var top_zone: Dictionary = {}
	var top_pressure := -1
	for zone_variant in warzones:
		if zone_variant is not Dictionary:
			continue
		var zone := zone_variant as Dictionary
		var pressure := int(zone.get("pressure", 0))
		if pressure > top_pressure:
			top_pressure = pressure
			top_zone = zone
	if top_zone.is_empty():
		return "读板聚焦：等待战区摘要刷新"
	var zone_name := str(top_zone.get("name", "战区")).strip_edges()
	var gate := str(top_zone.get("gate", "关口")).strip_edges()
	var route := str(top_zone.get("route", "路线")).strip_edges()
	return "读板聚焦：%s · %s · %s" % [zone_name, gate, route]


func _warzone_font_size(base_size: int) -> int:
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
