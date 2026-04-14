@tool
extends Control
class_name ProvinceLayerSummaryPanel

const UiThemeTokensScript = preload("res://scripts/ui/ui_theme_tokens.gd")

const SURFACE_SHELL_TEXTURE_PATH := "res://assets/themes/slgclient/current/ui/bg_window_6.png"
const SURFACE_TITLE_TEXTURE_PATH := "res://assets/themes/slgclient/current/ui/tipsbiaoti.png"
const SURFACE_SECTION_TEXTURE_PATH := "res://assets/themes/slgclient/current/ui/diban_1.png"
const SURFACE_CARD_TEXTURE_PATH := "res://assets/themes/slgclient/current/ui/diban1_23.png"
const SURFACE_BAND_TEXTURE_PATH := "res://assets/themes/slgclient/current/ui/toast_bg.png"

const SAMPLE_STATE: Dictionary = {
	"headline": "州层总览｜司隶为轴",
	"focusProvinceName": "Luoyang / Si Li",
	"focusGateName": "Hangu Gate",
	"zoom": 0.31,
	"hoverTileId": "city_luoyang",
	"accentColor": {"r": 0.68, "g": 0.84, "b": 1.0, "a": 1.0},
	"focusLines": [
		"总览态",
		"司隶是全图战略轴心，先看中枢感。",
		"十三州要读成一张板，不是散片。",
		"州界、州府、边界走廊要同时成立.",
	],
}

const PROVINCE_NAME_MAP := {
	"You": "幽州",
	"Ji": "冀州",
	"Qing": "青州",
	"Xu": "徐州",
	"Bing": "并州",
	"Si Li": "司隶",
	"Yu": "豫州",
	"Yan": "兖州",
	"Jing": "荆州",
	"Liang": "凉州",
	"Yang": "扬州",
	"Yi": "益州",
	"Jiao": "交州",
}
const CITY_NAME_MAP := {
	"Juyong": "居庸",
	"Jicheng": "蓟城",
	"Linzi": "临淄",
	"Pengcheng": "彭城",
	"Jinyang": "晋阳",
	"Luoyang": "洛阳",
	"Yingchuan": "颍川",
	"Chenliu": "陈留",
	"Xiangyang": "襄阳",
	"Tianshui": "天水",
	"Shouchun": "寿春",
	"Chengdu": "成都",
	"Panyu": "番禺",
}
const GATE_NAME_MAP := {
	"Juyong Pass": "居庸关",
	"Pingyuan Gate": "平原关",
	"Qi Gate": "齐关",
	"Si River Gate": "泗水关",
	"Taihang Pass": "太行关",
	"Hangu Gate": "函谷关",
	"Huai Gate": "淮关",
	"Yanling Pass": "兖陵关",
	"Xiangyang Gate": "襄阳关",
	"Tong Pass": "潼关",
	"Hefei Gate": "合肥关",
	"Jianmen Pass": "剑门关",
	"Nanhai Gate": "南海关",
}

var _ui_theme_tokens = UiThemeTokensScript.new()

var _shell_panel: PanelContainer
var _header_panel: PanelContainer
var _header_title: Label
var _header_subtitle: Label
var _header_chip_row: HFlowContainer
var _accent_bar: ColorRect
var _overview_grid: GridContainer
var _focus_chip_row: HFlowContainer
var _focus_rows: VBoxContainer
var _footer_label: Label
var _active_state: Dictionary = {}


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_build_shell()
	apply_preview_state(SAMPLE_STATE)


func apply_preview_state(state: Dictionary) -> void:
	if _shell_panel == null:
		_build_shell()
	_active_state = _merge_preview_state(state)
	_render_state()


func _build_shell() -> void:
	if _shell_panel != null:
		return

	_shell_panel = PanelContainer.new()
	_shell_panel.name = "SummaryShell"
	_shell_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(_shell_panel)
	_apply_surface_panel_style(_shell_panel, SURFACE_SHELL_TEXTURE_PATH, 16.0, "panel", "hud_top_left")

	var shell_margin := _create_margin_container(_shell_panel, "SummaryMargin", 14, 12, 14, 12)
	shell_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var shell_vbox := _create_vbox(shell_margin, "SummaryVBox", 8)
	shell_vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	_header_panel = _create_panel(shell_vbox, "HeaderPanel")
	_apply_surface_panel_style(_header_panel, SURFACE_TITLE_TEXTURE_PATH, 12.0, "panel", "hud_top_left")
	_header_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_header_panel.custom_minimum_size = Vector2(0.0, 74.0)
	var header_margin := _create_margin_container(_header_panel, "HeaderMargin", 12, 8, 12, 8)
	header_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var header_vbox := _create_vbox(header_margin, "HeaderVBox", 5)
	header_vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var title_row := _create_hbox(header_vbox, "TitleRow", 10)
	title_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var title_stack := _create_vbox(title_row, "TitleStack", 2)
	title_stack.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_header_title = _create_label(title_stack, "HeaderTitle", "州层总览", 19)
	_header_title.add_theme_font_size_override("font_size", 19)
	_header_title.modulate = Color(0.98, 0.99, 1.0, 0.98)
	_header_subtitle = _create_label(title_stack, "HeaderSubtitle", "十三州读板、州府焦点、关口压强和镜头读数同屏出现。", 10)
	_header_subtitle.add_theme_font_size_override("font_size", 10)
	_header_subtitle.modulate = Color(0.82, 0.90, 0.97, 0.88)

	var title_right := _create_vbox(title_row, "TitleRight", 4)
	title_right.size_flags_horizontal = Control.SIZE_SHRINK_END
	title_right.alignment = BoxContainer.ALIGNMENT_END
	var headline_chip := _create_chip(title_right, "州层读板", "hud_bottom_bar", 10, 92)
	headline_chip.modulate = Color(0.98, 0.98, 1.0, 0.96)
	_header_chip_row = HFlowContainer.new()
	_header_chip_row.name = "HeaderChipRow"
	_header_chip_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_header_chip_row.add_theme_constant_override("h_separation", 6)
	_header_chip_row.add_theme_constant_override("v_separation", 4)
	header_vbox.add_child(_header_chip_row)

	_accent_bar = _create_color_rect(header_vbox, "AccentBar", Color(0.28, 0.64, 0.84, 0.95), 1.5)

	var body_row := _create_hbox(shell_vbox, "BodyRow", 8)
	body_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body_row.size_flags_vertical = Control.SIZE_EXPAND_FILL

	var overview_panel := _create_panel(body_row, "OverviewPanel")
	_apply_surface_panel_style(overview_panel, SURFACE_SECTION_TEXTURE_PATH, 12.0, "panel", "hud_bottom_bar")
	overview_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	overview_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	overview_panel.custom_minimum_size = Vector2(0.0, 122.0)
	var overview_margin := _create_margin_container(overview_panel, "OverviewMargin", 10, 8, 10, 8)
	overview_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var overview_vbox := _create_vbox(overview_margin, "OverviewVBox", 6)
	overview_vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var overview_title := _create_label(overview_vbox, "OverviewTitle", "总览读板", 12)
	overview_title.modulate = Color(0.96, 0.98, 1.0, 0.96)
	overview_title.add_theme_font_size_override("font_size", 12)
	var overview_subtitle := _create_label(overview_vbox, "OverviewSubtitle", "态势、焦点、缩放、悬停与契约入口。", 9)
	overview_subtitle.modulate = Color(0.82, 0.89, 0.96, 0.82)
	overview_subtitle.add_theme_font_size_override("font_size", 9)
	_overview_grid = GridContainer.new()
	_overview_grid.name = "OverviewGrid"
	_overview_grid.columns = 2
	_overview_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_overview_grid.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_overview_grid.add_theme_constant_override("h_separation", 6)
	_overview_grid.add_theme_constant_override("v_separation", 6)
	overview_vbox.add_child(_overview_grid)

	var focus_panel := _create_panel(body_row, "FocusPanel")
	_apply_surface_panel_style(focus_panel, SURFACE_SECTION_TEXTURE_PATH, 12.0, "panel", "hud_bottom_bar")
	focus_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	focus_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	focus_panel.custom_minimum_size = Vector2(0.0, 122.0)
	var focus_margin := _create_margin_container(focus_panel, "FocusMargin", 10, 8, 10, 8)
	focus_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var focus_vbox := _create_vbox(focus_margin, "FocusVBox", 6)
	focus_vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var focus_title := _create_label(focus_vbox, "FocusTitle", "焦点与边界", 12)
	focus_title.modulate = Color(0.97, 0.98, 1.0, 0.96)
	focus_title.add_theme_font_size_override("font_size", 12)
	var focus_subtitle := _create_label(focus_vbox, "FocusSubtitle", "把州府、关口和镜头压力一起读出来。", 9)
	focus_subtitle.modulate = Color(0.82, 0.89, 0.96, 0.82)
	focus_subtitle.add_theme_font_size_override("font_size", 9)
	_focus_chip_row = HFlowContainer.new()
	_focus_chip_row.name = "FocusChipRow"
	_focus_chip_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_focus_chip_row.add_theme_constant_override("h_separation", 5)
	_focus_chip_row.add_theme_constant_override("v_separation", 4)
	focus_vbox.add_child(_focus_chip_row)
	_focus_rows = _create_vbox(focus_vbox, "FocusRows", 4)
	_focus_rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_focus_rows.size_flags_vertical = Control.SIZE_EXPAND_FILL

	_footer_label = _create_label(shell_vbox, "FooterLabel", "深色纹理读板 · 组件化州层预览", 9)
	_footer_label.modulate = Color(0.74, 0.82, 0.90, 0.70)
	_footer_label.add_theme_font_size_override("font_size", 9)


func _render_state() -> void:
	if _shell_panel == null:
		return

	var accent := _read_color(_active_state.get("accentColor", null), Color(0.76, 0.88, 1.0, 0.94))
	_header_title.text = str(_active_state.get("headline", SAMPLE_STATE.get("headline", "州层总览"))).strip_edges()
	_header_subtitle.text = _build_subtitle_text()
	_header_title.modulate = accent
	_accent_bar.color = accent

	_rebuild_header_chips(accent)
	_render_overview_metrics(accent)
	_render_focus_stack(accent)
	_footer_label.text = "读板：%s | %s | %s" % [
		_resolve_focus_province(_active_state.get("focusProvinceName", SAMPLE_STATE.get("focusProvinceName", ""))),
		_resolve_gate_name(str(_active_state.get("focusGateName", SAMPLE_STATE.get("focusGateName", ""))).strip_edges()),
		"scene + payload 直读",
	]


func _build_subtitle_text() -> String:
	var zoom := float(_active_state.get("zoom", SAMPLE_STATE.get("zoom", 0.31)))
	var hover_id := str(_active_state.get("hoverTileId", SAMPLE_STATE.get("hoverTileId", "city_luoyang"))).strip_edges()
	var focus_name := _resolve_focus_province(_active_state.get("focusProvinceName", SAMPLE_STATE.get("focusProvinceName", "")))
	return "焦点 %s · 缩放 %.2f · 悬停 %s" % [focus_name, zoom, hover_id]


func _rebuild_header_chips(accent: Color) -> void:
	_clear_children(_header_chip_row)
	var chips := [
		"13州",
		"13州府",
		"13关口",
		"州层轴心",
	]
	for index in range(chips.size()):
		var chip := _create_chip(_header_chip_row, str(chips[index]), "hud_bottom_bar", 9, 72 if index < 3 else 80)
		chip.modulate = accent if index == 0 else Color(0.94, 0.96, 0.99, 0.92)


func _render_overview_metrics(accent: Color) -> void:
	_clear_children(_overview_grid)
	var metric_specs := [
		{"label": "态势", "value": str(_active_state.get("headline", SAMPLE_STATE.get("headline", "总览"))).strip_edges()},
		{"label": "焦点州", "value": _resolve_focus_province(_active_state.get("focusProvinceName", SAMPLE_STATE.get("focusProvinceName", "")))},
		{"label": "焦点关", "value": _resolve_gate_name(str(_active_state.get("focusGateName", SAMPLE_STATE.get("focusGateName", ""))).strip_edges())},
		{"label": "缩放", "value": "%.2f" % float(_active_state.get("zoom", SAMPLE_STATE.get("zoom", 0.31)))},
		{"label": "悬停", "value": str(_active_state.get("hoverTileId", SAMPLE_STATE.get("hoverTileId", "city_luoyang"))).strip_edges()},
		{"label": "契约", "value": "scene + payload"},
	]
	for index in range(metric_specs.size()):
		var spec: Dictionary = metric_specs[index] as Dictionary
		var card := _create_metric_card("Metric_%d" % index, str(spec.get("label", "")), str(spec.get("value", "")), accent)
		_overview_grid.add_child(card)


func _render_focus_stack(accent: Color) -> void:
	_clear_children(_focus_chip_row)
	_clear_children(_focus_rows)

	var focus_chips := [
		"州界",
		"州府",
		"关口",
		"压强",
	]
	for chip_text in focus_chips:
		_create_chip(_focus_chip_row, chip_text, "hud_bottom_bar", 9, 54)

	var lines := _normalize_string_array(_active_state.get("focusLines", SAMPLE_STATE.get("focusLines", [])))
	if lines.is_empty():
		lines = [
			"总览态",
			"司隶是全图战略轴心，先看中枢感。",
			"十三州要读成一张板，不是散片。",
			"州界、州府、边界走廊要同时成立。",
		]

	for index in range(lines.size()):
		var line_text := str(lines[index]).strip_edges()
		if line_text == "":
			continue
		var label := _create_label(_focus_rows, "FocusRow_%d" % index, "• %s" % line_text, 10)
		label.modulate = accent if index == 0 else Color(0.88, 0.93, 0.98, 0.90)
		label.add_theme_font_size_override("font_size", 10)
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART


func _create_metric_card(name: String, label_text: String, value_text: String, accent: Color) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.name = name
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_apply_surface_panel_style(panel, SURFACE_CARD_TEXTURE_PATH, 10.0, "panel", "hud_bottom_bar")
	panel.custom_minimum_size = Vector2(0.0, 34.0)
	var margin := _create_margin_container(panel, "Margin", 6, 4, 6, 4)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var vbox := _create_vbox(margin, "VBox", 1)
	vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var label := _create_label(vbox, "Label", label_text, 8)
	label.modulate = Color(0.76, 0.84, 0.92, 0.72)
	label.add_theme_font_size_override("font_size", 8)
	var value := _create_label(vbox, "Value", value_text, 11)
	value.modulate = accent
	value.add_theme_font_size_override("font_size", 11)
	value.autowrap_mode = TextServer.AUTOWRAP_OFF
	value.clip_text = true
	value.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	return panel


func _create_chip(parent: Node, text: String, token_name: String, font_size: int, min_width: int) -> PanelContainer:
	var chip := _create_panel(parent, "%sChip" % text.replace(" ", "_"))
	_apply_surface_panel_style(chip, SURFACE_BAND_TEXTURE_PATH, 12.0, "panel", token_name)
	chip.custom_minimum_size = Vector2(min_width, 24.0)
	chip.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	var margin := _create_margin_container(chip, "Margin", 5, 1, 5, 1)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var label := _create_label(margin, "Text", text, font_size)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.autowrap_mode = TextServer.AUTOWRAP_OFF
	label.clip_text = true
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	label.modulate = Color(0.97, 0.99, 1.0, 0.96)
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


func _resolve_focus_province(value: Variant) -> String:
	var raw := str(value).strip_edges()
	if raw.find("/") == -1:
		return _resolve_province_name(raw)
	var parts := raw.split("/")
	if parts.size() < 2:
		return _resolve_province_name(raw)
	var city_name := _resolve_city_name(parts[0].strip_edges())
	var province_name := _resolve_province_name(parts[1].strip_edges())
	return "%s·%s" % [province_name, city_name]


func _resolve_province_name(name: String) -> String:
	return str(PROVINCE_NAME_MAP.get(name.strip_edges(), name.strip_edges()))


func _resolve_city_name(name: String) -> String:
	return str(CITY_NAME_MAP.get(name.strip_edges(), name.strip_edges()))


func _resolve_gate_name(name: String) -> String:
	return str(GATE_NAME_MAP.get(name.strip_edges(), name.strip_edges()))


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


func _create_panel(parent: Node, name: String) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.name = name
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	parent.add_child(panel)
	return panel


func _create_margin_container(parent: Node, name: String, left: int, top: int, right: int, bottom: int) -> MarginContainer:
	var margin := MarginContainer.new()
	margin.name = name
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", left)
	margin.add_theme_constant_override("margin_top", top)
	margin.add_theme_constant_override("margin_right", right)
	margin.add_theme_constant_override("margin_bottom", bottom)
	parent.add_child(margin)
	return margin


func _create_vbox(parent: Node, name: String, separation: int) -> VBoxContainer:
	var box := VBoxContainer.new()
	box.name = name
	box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	box.size_flags_vertical = Control.SIZE_EXPAND_FILL
	box.add_theme_constant_override("separation", separation)
	parent.add_child(box)
	return box


func _create_hbox(parent: Node, name: String, separation: int) -> HBoxContainer:
	var box := HBoxContainer.new()
	box.name = name
	box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	box.add_theme_constant_override("separation", separation)
	parent.add_child(box)
	return box


func _create_label(parent: Node, name: String, text: String, font_size: int) -> Label:
	var label := Label.new()
	label.name = name
	label.text = text
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_size_override("font_size", font_size)
	parent.add_child(label)
	return label


func _create_color_rect(parent: Node, name: String, color: Color, height: float = 4.0) -> ColorRect:
	var rect := ColorRect.new()
	rect.name = name
	rect.color = color
	rect.custom_minimum_size = Vector2(0.0, height)
	parent.add_child(rect)
	return rect


func _clear_children(parent: Node) -> void:
	for child in parent.get_children():
		child.queue_free()


func _normalize_string_array(raw_value: Variant) -> Array:
	var values: Array = []
	if raw_value is Array:
		for item in raw_value:
			var text := str(item).strip_edges()
			if text != "":
				values.append(text)
	return values


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


func _apply_surface_panel_style(panel: PanelContainer, texture_path: String, texture_margin: float, fallback_category: String = "", fallback_token: String = "") -> bool:
	if panel == null:
		return false
	var stylebox := _build_surface_stylebox(texture_path, texture_margin)
	if stylebox != null:
		panel.add_theme_stylebox_override("panel", stylebox)
		return true
	if fallback_category != "" and fallback_token != "":
		var fallback_style := _ui_theme_tokens.resolve_stylebox(fallback_category, fallback_token)
		if fallback_style != null:
			panel.add_theme_stylebox_override("panel", fallback_style)
			return true
	return false


func _build_surface_stylebox(texture_path: String, texture_margin: float) -> StyleBoxTexture:
	var texture := _load_surface_texture(texture_path)
	if texture == null:
		return null
	var stylebox := StyleBoxTexture.new()
	stylebox.texture = texture
	stylebox.texture_margin_left = texture_margin
	stylebox.texture_margin_top = texture_margin
	stylebox.texture_margin_right = texture_margin
	stylebox.texture_margin_bottom = texture_margin
	return stylebox


func _load_surface_texture(texture_path: String) -> Texture2D:
	var normalized_path := texture_path.strip_edges()
	if normalized_path == "":
		return null
	if not ResourceLoader.exists(normalized_path):
		return null
	var loaded_texture: Variant = load(normalized_path)
	if loaded_texture is Texture2D:
		return loaded_texture as Texture2D
	return null
