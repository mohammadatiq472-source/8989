@tool
extends Control
class_name ProvinceLayerRosterPanel

const UiThemeTokensScript = preload("res://scripts/ui/ui_theme_tokens.gd")

const SURFACE_SHELL_TEXTURE_PATH := "res://assets/themes/slgclient/current/ui/bg_window_6.png"
const SURFACE_TITLE_TEXTURE_PATH := "res://assets/themes/slgclient/current/ui/tipsbiaoti.png"
const SURFACE_SECTION_TEXTURE_PATH := "res://assets/themes/slgclient/current/ui/diban_1.png"
const SURFACE_CARD_TEXTURE_PATH := "res://assets/themes/slgclient/current/ui/diban1_23.png"
const SURFACE_BAND_TEXTURE_PATH := "res://assets/themes/slgclient/current/ui/toast_bg.png"

const SAMPLE_STATE: Dictionary = {
	"headline": "州府名册｜十三州同屏",
	"focusProvinceId": "si_li",
	"focusProvinceName": "Luoyang / Si Li",
	"focusGateName": "Hangu Gate",
	"summaryLine": "13 州 / 13 州府 / 13 关口 / 当前焦点: 司隶",
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
const PROVINCE_SPECS := [
	{"id": "you_zhou", "name": "You", "capital": "Juyong", "gate": "Juyong Pass", "factionId": "faction_you", "factionName": "You Province Watch"},
	{"id": "ji_zhou", "name": "Ji", "capital": "Jicheng", "gate": "Pingyuan Gate", "factionId": "faction_ji", "factionName": "Ji Province Watch"},
	{"id": "qing_zhou", "name": "Qing", "capital": "Linzi", "gate": "Qi Gate", "factionId": "faction_qing", "factionName": "Qing Province Watch"},
	{"id": "xu_zhou", "name": "Xu", "capital": "Pengcheng", "gate": "Si River Gate", "factionId": "faction_xu", "factionName": "Xu Province Watch"},
	{"id": "bing_zhou", "name": "Bing", "capital": "Jinyang", "gate": "Taihang Pass", "factionId": "faction_bing", "factionName": "Bing Province Watch"},
	{"id": "si_li", "name": "Si Li", "capital": "Luoyang", "gate": "Hangu Gate", "factionId": "player", "factionName": "Han Core"},
	{"id": "yu_zhou", "name": "Yu", "capital": "Yingchuan", "gate": "Huai Gate", "factionId": "faction_yu", "factionName": "Yu Province Watch"},
	{"id": "yan_zhou", "name": "Yan", "capital": "Chenliu", "gate": "Yanling Pass", "factionId": "faction_yan", "factionName": "Yan Province Watch"},
	{"id": "jing_zhou", "name": "Jing", "capital": "Xiangyang", "gate": "Xiangyang Gate", "factionId": "faction_jing", "factionName": "Jing Province Watch"},
	{"id": "liang_zhou", "name": "Liang", "capital": "Tianshui", "gate": "Tong Pass", "factionId": "faction_liang", "factionName": "Liang Province Watch"},
	{"id": "yang_zhou", "name": "Yang", "capital": "Shouchun", "gate": "Hefei Gate", "factionId": "faction_yang", "factionName": "Yang Province Watch"},
	{"id": "yi_zhou", "name": "Yi", "capital": "Chengdu", "gate": "Jianmen Pass", "factionId": "faction_yi", "factionName": "Yi Province Watch"},
	{"id": "jiao_zhou", "name": "Jiao", "capital": "Panyu", "gate": "Nanhai Gate", "factionId": "faction_jiao", "factionName": "Jiao Province Watch"},
]

var _ui_theme_tokens = UiThemeTokensScript.new()

var _shell_panel: PanelContainer
var _header_panel: PanelContainer
var _header_title: Label
var _header_subtitle: Label
var _header_chip_row: HFlowContainer
var _accent_bar: ColorRect
var _grid_scroll: ScrollContainer
var _province_grid: GridContainer
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
	_shell_panel.name = "RosterShell"
	_shell_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(_shell_panel)
	_apply_surface_panel_style(_shell_panel, SURFACE_SHELL_TEXTURE_PATH, 16.0, "panel", "observability_panel")

	var shell_margin := _create_margin_container(_shell_panel, "RosterMargin", 14, 12, 14, 12)
	shell_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var shell_vbox := _create_vbox(shell_margin, "RosterVBox", 8)
	shell_vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	_header_panel = _create_panel(shell_vbox, "HeaderPanel")
	_apply_surface_panel_style(_header_panel, SURFACE_TITLE_TEXTURE_PATH, 12.0, "panel", "hud_top_left")
	_header_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_header_panel.custom_minimum_size = Vector2(0.0, 70.0)
	var header_margin := _create_margin_container(_header_panel, "HeaderMargin", 12, 8, 12, 8)
	header_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var header_vbox := _create_vbox(header_margin, "HeaderVBox", 4)
	header_vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var title_row := _create_hbox(header_vbox, "TitleRow", 10)
	title_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var title_stack := _create_vbox(title_row, "TitleStack", 1)
	title_stack.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_header_title = _create_label(title_stack, "HeaderTitle", "州府名册", 18)
	_header_title.modulate = Color(0.98, 0.99, 1.0, 0.98)
	_header_subtitle = _create_label(title_stack, "HeaderSubtitle", "把十三州、州府、关口和焦点压成一张可扫读的卡表。", 10)
	_header_subtitle.modulate = Color(0.82, 0.89, 0.96, 0.88)

	_header_chip_row = HFlowContainer.new()
	_header_chip_row.name = "HeaderChipRow"
	_header_chip_row.size_flags_horizontal = Control.SIZE_SHRINK_END
	_header_chip_row.add_theme_constant_override("h_separation", 6)
	_header_chip_row.add_theme_constant_override("v_separation", 4)
	title_row.add_child(_header_chip_row)

	_accent_bar = _create_color_rect(header_vbox, "AccentBar", Color(0.72, 0.56, 0.30, 0.95), 1.5)

	_grid_scroll = ScrollContainer.new()
	_grid_scroll.name = "ProvinceScroll"
	_grid_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_grid_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_grid_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	shell_vbox.add_child(_grid_scroll)

	var grid_panel := _create_panel(_grid_scroll, "GridPanel")
	grid_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_apply_surface_panel_style(grid_panel, SURFACE_SECTION_TEXTURE_PATH, 12.0, "panel", "hud_bottom_bar")
	grid_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var grid_margin := _create_margin_container(grid_panel, "GridMargin", 10, 8, 10, 8)
	grid_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_province_grid = GridContainer.new()
	_province_grid.name = "ProvinceGrid"
	_province_grid.columns = 3
	_province_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_province_grid.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_province_grid.add_theme_constant_override("h_separation", 8)
	_province_grid.add_theme_constant_override("v_separation", 8)
	grid_margin.add_child(_province_grid)

	_footer_label = _create_label(shell_vbox, "FooterLabel", "州府卡表 · 深色纹理读板 · 组件化名册", 9)
	_footer_label.modulate = Color(0.74, 0.82, 0.90, 0.68)


func _render_state() -> void:
	if _shell_panel == null:
		return

	var accent := _read_color(_active_state.get("accentColor", null), Color(0.79, 0.84, 0.92, 0.94))
	_header_title.text = str(_active_state.get("headline", SAMPLE_STATE.get("headline", "州府名册"))).strip_edges()
	_header_subtitle.text = _build_subtitle_text()
	_header_title.modulate = accent
	_accent_bar.color = accent

	_rebuild_header_chips(accent)
	_render_grid(accent)
	_footer_label.text = str(_active_state.get("summaryLine", SAMPLE_STATE.get("summaryLine", "13 州 / 13 州府 / 13 关口"))).strip_edges()


func _build_subtitle_text() -> String:
	var focus_name := _resolve_focus_province(_active_state.get("focusProvinceName", SAMPLE_STATE.get("focusProvinceName", "")))
	var focus_gate := _resolve_gate_name(str(_active_state.get("focusGateName", SAMPLE_STATE.get("focusGateName", ""))).strip_edges())
	return "焦点 %s · 关口 %s · 3 列卡表" % [focus_name, focus_gate]


func _rebuild_header_chips(accent: Color) -> void:
	_clear_children(_header_chip_row)
	var chips := [
		"13州",
		"13州府",
		"13关口",
		"焦点州",
	]
	for index in range(chips.size()):
		var chip := _create_chip(_header_chip_row, str(chips[index]), "hud_bottom_bar", 9, 66 if index < 3 else 72)
		chip.modulate = accent if index == 0 else Color(0.94, 0.96, 0.99, 0.92)


func _render_grid(accent: Color) -> void:
	_clear_children(_province_grid)
	for province_variant in PROVINCE_SPECS:
		if not (province_variant is Dictionary):
			continue
		var province: Dictionary = province_variant as Dictionary
		var card := _create_province_card(province, accent)
		_province_grid.add_child(card)


func _create_province_card(province: Dictionary, accent: Color) -> PanelContainer:
	var province_name := str(province.get("name", "")).strip_edges()
	var province_id := str(province.get("id", "")).strip_edges()
	var capital_name := _resolve_city_name(str(province.get("capital", "")).strip_edges())
	var gate_name := _resolve_gate_name(str(province.get("gate", "")).strip_edges())
	var is_focus := province_id == str(_active_state.get("focusProvinceId", SAMPLE_STATE.get("focusProvinceId", ""))).strip_edges()

	var card := PanelContainer.new()
	card.name = "%sCard" % province_id
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	card.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_apply_surface_panel_style(card, SURFACE_CARD_TEXTURE_PATH, 10.0, "panel", "hud_bottom_bar")
	card.custom_minimum_size = Vector2(0.0, 42.0)
	if is_focus:
		card.modulate = Color(1.0, 1.0, 1.0, 1.0)

	var margin := _create_margin_container(card, "Margin", 7, 5, 7, 5)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var vbox := _create_vbox(margin, "VBox", 1)
	vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var top_row := _create_hbox(vbox, "TopRow", 6)
	top_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var title := _create_label(top_row, "ProvinceTitle", _resolve_province_name(province_name), 11)
	title.modulate = accent if is_focus else Color(0.96, 0.98, 1.0, 0.96)
	var focus_chip_text := "焦点" if is_focus else "州府"
	var chip := _create_chip(top_row, focus_chip_text, "hud_bottom_bar", 8, 38)
	chip.modulate = accent if is_focus else Color(0.90, 0.93, 0.97, 0.78)

	var meta := _create_label(vbox, "ProvinceMeta", "州府 %s · 关口 %s" % [capital_name, gate_name], 9)
	meta.modulate = Color(0.84, 0.90, 0.96, 0.86 if is_focus else 0.80)
	meta.autowrap_mode = TextServer.AUTOWRAP_OFF
	meta.clip_text = true
	meta.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS

	return card


func _create_chip(parent: Node, text: String, token_name: String, font_size: int, min_width: int) -> PanelContainer:
	var chip := _create_panel(parent, "%sChip" % text.replace(" ", "_"))
	_apply_surface_panel_style(chip, SURFACE_BAND_TEXTURE_PATH, 12.0, "panel", token_name)
	chip.custom_minimum_size = Vector2(min_width, 23.0)
	chip.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	var margin := _create_margin_container(chip, "Margin", 4, 1, 4, 1)
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
