@tool
extends PanelContainer
class_name WarzoneRoutePanel

const UiThemeTokensScript = preload("res://scripts/ui/ui_theme_tokens.gd")

const SAMPLE_STATE: Dictionary = {
	"headline": "路线 / 关口",
	"subheadline": "走廊连续、卡口优先、主线方向。",
	"compactEmbed": true,
	"routeLines": [
		{
			"title": "主路",
			"detail": "洛阳→虎牢→冀州前门",
		},
		{
			"title": "关口",
			"detail": "虎牢·汜水·河桥",
		},
		{
			"title": "优先",
			"detail": "北压 > 中补 > 南侦",
		},
	],
}

var _theme_tokens: UiThemeTokens = UiThemeTokensScript.new()
var _content_margin: MarginContainer
var _route_title: Label
var _route_subtitle: Label
var _route_chip_row: HBoxContainer
var _route_accent_bar: ColorRect
var _route_rows: VBoxContainer
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

	_apply_panel_style(self, "panel", "hud_bottom_bar")

	_content_margin = _create_margin_container(self, "RouteMargin", 16, 14, 16, 14)
	_content_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var route_vbox := _create_vbox(_content_margin, "RouteVBox", 8)
	route_vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	_route_title = _create_label(route_vbox, "RouteTitle", "路线 / 关口", 17)
	_apply_compact_text_mode(_route_title)
	_route_title.modulate = Color(0.92, 0.96, 0.99, 0.96)
	_route_subtitle = _create_label(route_vbox, "RouteSubtitle", "走廊连续、卡口优先、主线方向。", 11)
	_apply_compact_text_mode(_route_subtitle)
	_route_subtitle.modulate = Color(0.88, 0.92, 0.96, 0.86)

	_route_accent_bar = ColorRect.new()
	_route_accent_bar.name = "RouteAccentBar"
	_route_accent_bar.color = Color(0.62, 0.82, 1.0, 0.90)
	_route_accent_bar.custom_minimum_size = Vector2(0.0, 4.0)
	route_vbox.add_child(_route_accent_bar)

	_route_chip_row = _create_hbox(route_vbox, "RouteChipRow", 6)
	_route_chip_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_route_chip_row.custom_minimum_size = Vector2(0.0, 26.0)

	_route_rows = _create_vbox(route_vbox, "RouteRows", 6)
	_route_rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_route_rows.size_flags_vertical = Control.SIZE_EXPAND_FILL


func _render_state() -> void:
	var accent := _read_color(_preview_state.get("accentColor", null), Color(0.56, 0.74, 0.98, 1.0))
	_route_title.text = str(_preview_state.get("headline", SAMPLE_STATE.get("headline", "路线 / 关口")))
	_route_subtitle.text = str(_preview_state.get("subheadline", SAMPLE_STATE.get("subheadline", "")))
	_route_title.modulate = accent.lightened(0.12)
	if _route_accent_bar != null and is_instance_valid(_route_accent_bar):
		_route_accent_bar.color = accent
	_render_route_chips(_route_chip_row, accent)
	_render_route_rows(_route_rows, _normalize_array(_preview_state.get("routeLines", [])), accent)


func _render_route_chips(parent: HBoxContainer, accent: Color) -> void:
	_clear_children(parent)
	parent.add_child(_create_chip("主路", accent.lightened(0.15), "hud_top_left", "RouteChipMain", 10))
	parent.add_child(_create_chip("关口", accent, "observability_panel", "RouteChipGate", 10))
	parent.add_child(_create_chip("优先", accent.lightened(0.06), "hud_bottom_bar", "RouteChipPriority", 10))


func _render_route_rows(parent: VBoxContainer, rows: Array, accent: Color) -> void:
	_clear_children(parent)
	var index := 0
	for row_variant in rows:
		if row_variant is not Dictionary:
			continue
		var row: Dictionary = row_variant as Dictionary
		var row_box := _create_hbox(parent, "RouteLine_%d" % index, 8 if _compact_embed else 10)
		row_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row_box.alignment = BoxContainer.ALIGNMENT_BEGIN
		var title_chip := _create_chip(str(row.get("title", "路线")), _route_color_for_index(index, accent), "hud_top_left", "RouteTitleChip_%d" % index, 10)
		row_box.add_child(title_chip)
		var divider := ColorRect.new()
		divider.name = "RouteDivider_%d" % index
		divider.color = Color(0.16, 0.22, 0.30, 0.80)
		divider.custom_minimum_size = Vector2(2.0, 0.0)
		row_box.add_child(divider)
		var detail_text := str(row.get("detail", "")).strip_edges()
		if detail_text == "":
			detail_text = "——"
		var value := _create_label(row_box, "RouteDetail_%d" % index, detail_text, _route_font_size(13))
		_apply_compact_text_mode(value)
		value.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		value.modulate = Color(0.92, 0.97, 1.0, 0.92)
		index += 1


func _apply_compact_layout() -> void:
	if _route_rows != null and is_instance_valid(_route_rows):
		_route_rows.add_theme_constant_override("separation", 4 if _compact_embed else 5)
	if _route_chip_row != null and is_instance_valid(_route_chip_row):
		_route_chip_row.add_theme_constant_override("separation", 5 if _compact_embed else 6)


func _apply_compact_text_mode(label: Label) -> void:
	if label == null:
		return
	if not _compact_embed:
		return
	label.autowrap_mode = TextServer.AUTOWRAP_OFF
	label.clip_text = true
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS


func _route_font_size(base_size: int) -> int:
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


func _route_color_for_index(index: int, accent: Color) -> Color:
	match index % 3:
		0:
			return accent.lightened(0.12)
		1:
			return accent
		_:
			return Color(0.92, 0.97, 1.0, 0.94)
