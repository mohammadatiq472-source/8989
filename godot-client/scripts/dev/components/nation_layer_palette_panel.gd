@tool
extends Control
class_name NationLayerPalettePanel

const UiThemeTokensScript = preload("res://scripts/ui/ui_theme_tokens.gd")

const SAMPLE_STATE := {
	"title": "国家颜色块",
	"subtitle": "颜色块、国号、首都、势力。",
	"terminalBadge": "宏观终点",
	"terminalNote": "国家层配色只做终点核对。",
	"nationName": "汉室",
	"nationCode": "HAN-01",
	"capitalName": "洛阳",
	"nationColor": {"r": 0.35, "g": 0.78, "b": 0.68, "a": 1.0},
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
var _title_label: Label
var _subtitle_label: Label
var _rail_title_label: Label
var _rail_flow: HFlowContainer
var _rail_hint_label: Label
var _rail_status_label: Label
var _palette_grid: GridContainer
var _footer_label: Label


func _ready() -> void:
	_build_shell()
	apply_preview_state({})


func apply_preview_state(state: Dictionary) -> void:
	_build_shell()
	var effective_state := _resolve_state(state)
	var title := _resolve_string(effective_state.get("paletteTitle", SAMPLE_STATE.get("title", "国家颜色块")), "国家颜色块")
	var subtitle := _resolve_string(effective_state.get("paletteSubtitle", SAMPLE_STATE.get("subtitle", "颜色块、国号、首都、势力。")), "颜色块、国号、首都、势力。")
	var nation_name := _resolve_string(effective_state.get("nationName", SAMPLE_STATE.get("nationName", "汉室")), "汉室")
	var nation_code := _resolve_string(effective_state.get("nationCode", SAMPLE_STATE.get("nationCode", "HAN-01")), "HAN-01")
	var capital_name := _resolve_string(effective_state.get("capitalName", SAMPLE_STATE.get("capitalName", "洛阳")), "洛阳")
	var nation_color := _read_color(effective_state.get("nationColor", SAMPLE_STATE.get("nationColor", null)), Color(0.35, 0.78, 0.68, 1.0))
	var palette_entries := _normalize_palette_entries(effective_state.get("nationPalette", SAMPLE_STATE.get("nationPalette", [])))
	var terminal_badge := _resolve_string(_read_string_field(effective_state, "macroFlow", "badge", SAMPLE_STATE.get("terminalBadge", "宏观终点")), "宏观终点")
	var terminal_note := _resolve_string(_read_string_field(effective_state, "macroFlow", "note", SAMPLE_STATE.get("terminalNote", "国家层配色只做终点核对。")), "国家层配色只做终点核对。")
	var entry_status := _resolve_string(effective_state.get("entryStatus", "完成态"), "完成态")
	if palette_entries.is_empty():
		palette_entries = _default_palette_entries(nation_name, nation_code, capital_name, nation_color)

	_title_label.text = title
	_subtitle_label.text = subtitle
	_title_label.modulate = nation_color
	_subtitle_label.modulate = Color(0.84, 0.90, 0.97, 0.92)
	_rail_title_label.text = "%s · %s" % [nation_name, nation_code]
	_rail_hint_label.text = terminal_badge
	_rail_status_label.text = entry_status
	_footer_label.text = "%s / %s" % [terminal_note, "国家配色 / 首都标记 / 势力强弱"]
	_footer_label.modulate = Color(0.82, 0.90, 0.96, 0.92)
	_render_palette(palette_entries, nation_name, nation_code, capital_name, nation_color)


func _build_shell() -> void:
	if _frame_panel != null:
		return

	clip_contents = true

	_frame_panel = PanelContainer.new()
	_frame_panel.name = "Frame"
	_frame_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_apply_panel_style(_frame_panel, "panel", "hud_top_left")
	add_child(_frame_panel)

	_top_band = ColorRect.new()
	_top_band.name = "TopBand"
	_top_band.color = Color(0.95, 0.79, 0.34, 0.22)
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

	_title_label = _create_label(body, "Title", "国家颜色块", 15)
	_apply_compact_label(_title_label)
	_title_label.modulate = Color(0.96, 0.98, 1.0, 0.98)
	_subtitle_label = _create_label(body, "Subtitle", "颜色块、国号、首都、势力。", 9)
	_apply_compact_label(_subtitle_label)
	_subtitle_label.modulate = Color(0.84, 0.90, 0.97, 0.92)

	var rail_panel := _create_panel(body, "RailPanel")
	_apply_panel_style(rail_panel, "panel", "observability_panel")
	rail_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var rail_margin := _create_margin_container(rail_panel, "Margin", 8, 6, 8, 6)
	rail_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var rail_vbox := _create_vbox(rail_margin, "RailVBox", 3)
	rail_vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var rail_top_row := _create_hbox(rail_vbox, "RailTopRow", 6)
	rail_top_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_rail_title_label = _create_label(rail_top_row, "RailTitle", "汉室 · HAN-01", 12)
	_apply_compact_label(_rail_title_label)
	_rail_title_label.modulate = Color(0.97, 0.99, 0.96, 0.98)
	_rail_hint_label = _create_label(rail_top_row, "RailHint", "色板行", 9)
	_apply_compact_label(_rail_hint_label)
	_rail_hint_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_rail_hint_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_rail_hint_label.modulate = Color(0.83, 0.91, 0.98, 0.92)
	var rail_status_row := _create_hbox(rail_vbox, "RailStatusRow", 6)
	rail_status_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_rail_status_label = _create_label(rail_status_row, "RailStatus", "完成态", 9)
	_apply_compact_label(_rail_status_label)
	_rail_status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_rail_status_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_rail_status_label.modulate = Color(0.92, 0.98, 0.84, 0.96)
	_rail_flow = HFlowContainer.new()
	_rail_flow.name = "RailFlow"
	_rail_flow.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_rail_flow.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_rail_flow.add_theme_constant_override("h_separation", 6)
	_rail_flow.add_theme_constant_override("v_separation", 4)
	rail_vbox.add_child(_rail_flow)

	_palette_grid = GridContainer.new()
	_palette_grid.name = "NationPaletteGrid"
	_palette_grid.columns = 2
	_palette_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_palette_grid.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_palette_grid.add_theme_constant_override("h_separation", 6)
	_palette_grid.add_theme_constant_override("v_separation", 6)
	body.add_child(_palette_grid)

	_footer_label = _create_label(body, "Footer", "国家配色 / 首都标记 / 势力强弱", 9)
	_apply_compact_label(_footer_label)
	_footer_label.modulate = Color(0.82, 0.90, 0.96, 0.92)


func _render_palette(raw_palette: Array, selected_name: String, selected_code: String, capital_name: String, accent: Color) -> void:
	_clear_children(_palette_grid)
	_clear_children(_rail_flow)
	var palette := _normalize_palette_entries(raw_palette)
	if palette.is_empty():
		palette = _default_palette_entries(selected_name, selected_code, capital_name, accent)

	for index in range(palette.size()):
		var item: Dictionary = palette[index] as Dictionary
		var is_selected := bool(item.get("selected", false))
		_add_rail_item(item, selected_name, capital_name, accent, index, is_selected)
		var panel := _create_panel(_palette_grid, "Swatch_%d" % index)
		panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
		panel.custom_minimum_size = Vector2(0.0, 100.0)
		_apply_panel_style(panel, "panel", "hud_bottom_bar" if is_selected else "hud_top_left")

		var margin := _create_margin_container(panel, "Margin", 6, 6, 6, 6)
		margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		var vbox := _create_vbox(margin, "VBox", 3)
		vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		var header_row := _create_hbox(vbox, "HeaderRow", 5)
		header_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var code := _create_label(header_row, "Code", _resolve_string(item.get("code", ""), "NATION"), 11)
		_apply_compact_label(code)
		code.modulate = Color(0.96, 0.99, 0.95, 0.98)
		var select_chip := _create_chip(header_row, "SelectChip", "已选" if is_selected else "候选", "hud_bottom_bar", 8)
		select_chip.modulate = accent if is_selected else Color(0.82, 0.88, 0.95, 0.9)

		var color_rect := _create_color_rect(vbox, "ColorBlock", _read_color(item.get("color", null), accent), 28)
		color_rect.custom_minimum_size = Vector2(0.0, 28.0)

		var name := _create_label(vbox, "Name", _resolve_string(item.get("name", ""), "国家"), 12)
		_apply_compact_label(name)
		name.modulate = Color(0.98, 0.99, 0.95, 0.98)
		var details := _resolve_string(item.get("power", ""), "")
		var capital := _resolve_string(item.get("capital", ""), "")
		var detail_line := "%s · %s" % [details if details != "" else "国力未知", capital if capital != "" else capital_name]
		var detail := _create_label(vbox, "Detail", detail_line, 9)
		_apply_compact_label(detail)
		detail.modulate = Color(0.83, 0.89, 0.95, 0.92)

	if _rail_flow.get_child_count() == 0:
		_add_rail_item({"code": selected_code, "name": selected_name, "capital": capital_name, "power": "9860", "color": accent, "selected": true}, selected_name, capital_name, accent, 0, true)


func _add_rail_item(item: Dictionary, selected_name: String, capital_name: String, accent: Color, index: int, is_selected: bool) -> void:
	if _rail_flow == null:
		return
	var chip := _create_panel(_rail_flow, "RailChip_%d" % index)
	_apply_panel_style(chip, "panel", "hud_bottom_bar" if is_selected else "hud_top_left")
	chip.custom_minimum_size = Vector2(0.0, 64.0)
	chip.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _create_margin_container(chip, "Margin", 6, 5, 6, 5)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var vbox := _create_vbox(margin, "VBox", 2)
	vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var top_row := _create_hbox(vbox, "TopRow", 4)
	top_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var code := _create_label(top_row, "Code", _resolve_string(item.get("code", ""), "NATION"), 10)
	_apply_compact_label(code)
	code.modulate = Color(0.97, 0.99, 0.96, 0.98)
	var state_chip := _create_chip(top_row, "StateChip", "主" if is_selected else "备", "hud_bottom_bar", 8)
	state_chip.modulate = accent if is_selected else Color(0.82, 0.88, 0.95, 0.92)
	var color_rect := _create_color_rect(vbox, "ColorBlock", _read_color(item.get("color", null), accent), 16)
	color_rect.custom_minimum_size = Vector2(0.0, 16.0)
	var name := _create_label(vbox, "Name", _resolve_string(item.get("name", ""), selected_name), 10)
	_apply_compact_label(name)
	name.modulate = Color(0.96, 0.99, 0.95, 0.98)
	var capital := _create_label(vbox, "Capital", _resolve_string(item.get("capital", ""), capital_name), 8)
	_apply_compact_label(capital)
	capital.modulate = Color(0.82, 0.90, 0.96, 0.9)


func _normalize_palette_entries(raw_palette: Variant) -> Array:
	var entries: Array = []
	if raw_palette is Array:
		for raw_item in raw_palette:
			if raw_item is Dictionary:
				entries.append((raw_item as Dictionary).duplicate(true))
	return entries


func _read_string_field(state: Dictionary, parent_key: String, child_key: String, fallback_value: String) -> String:
	var container: Variant = state.get(parent_key, {})
	if container is Dictionary:
		return str((container as Dictionary).get(child_key, fallback_value))
	return fallback_value


func _default_palette_entries(selected_name: String, selected_code: String, capital_name: String, accent: Color) -> Array:
	return [
		{
			"code": selected_code,
			"name": selected_name,
			"power": "9860",
			"capital": capital_name,
			"selected": true,
			"color": accent
		},
		{
			"code": "WEI",
			"name": "魏国",
			"power": "8420",
			"capital": "许昌",
			"selected": false,
			"color": Color(0.95, 0.71, 0.18, 1.0)
		},
		{
			"code": "SHU",
			"name": "蜀国",
			"power": "7985",
			"capital": "成都",
			"selected": false,
			"color": Color(0.82, 0.48, 0.94, 1.0)
		},
		{
			"code": "WU",
			"name": "吴国",
			"power": "7812",
			"capital": "建业",
			"selected": false,
			"color": Color(0.91, 0.34, 0.38, 1.0)
		}
	]


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


func _clear_children(parent: Node) -> void:
	for child in parent.get_children():
		child.queue_free()


func _create_chip(parent: Node, node_name: String, text: String, token_name: String, font_size: int) -> PanelContainer:
	var chip := _create_panel(parent, node_name)
	_apply_panel_style(chip, "panel", token_name)
	chip.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	var margin := _create_margin_container(chip, "Margin", 8, 4, 8, 4)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var label := _create_label(margin, "Label", text, font_size)
	label.modulate = Color(0.92, 0.98, 0.93, 0.95)
	return chip


func _create_color_rect(parent: Node, node_name: String, color: Color, height: float = 4.0) -> ColorRect:
	var rect := ColorRect.new()
	rect.name = node_name
	rect.color = color
	rect.custom_minimum_size = Vector2(0.0, height)
	parent.add_child(rect)
	return rect


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


func _apply_compact_label(label: Label) -> void:
	if label == null:
		return
	label.autowrap_mode = TextServer.AUTOWRAP_OFF
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	label.clip_text = true


func _resolve_string(value: Variant, fallback: String) -> String:
	var resolved := str(value).strip_edges()
	if resolved == "":
		return fallback
	return resolved


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
