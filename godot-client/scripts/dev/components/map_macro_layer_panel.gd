@tool
extends Control
class_name MapMacroLayerPanel

const UiThemeTokensScript = preload("res://scripts/ui/ui_theme_tokens.gd")

const SAMPLE_STATE := {
	"title": "州层总览",
	"subtitle": "十三州边界、州府与关口概览。",
	"stats": ["十三州", "州府 13", "关口 28"],
	"legendTitle": "图例",
	"legendLines": ["青绿: 州域稳定", "金色: 州府锚点", "朱红: 州际关口"],
	"focusTitle": "当前焦点",
	"focusLines": ["焦点州: 司隶", "中心城: 洛阳", "威压: 关东三州交界"],
	"actions": ["定位州层", "进入大地图"],
	"tone": "province",
}

var _ui_theme_tokens = UiThemeTokensScript.new()

var _frame_panel: PanelContainer
var _title_label: Label
var _subtitle_label: Label
var _stats_row: HBoxContainer
var _legend_title_label: Label
var _legend_rows: VBoxContainer
var _focus_title_label: Label
var _focus_rows: VBoxContainer
var _actions_row: HBoxContainer


func _ready() -> void:
	_build_shell()
	apply_preview_state({})


func apply_preview_state(state: Dictionary) -> void:
	_build_shell()
	var effective := _resolve_state(state)
	_title_label.text = str(effective.get("title", SAMPLE_STATE.title))
	_subtitle_label.text = str(effective.get("subtitle", SAMPLE_STATE.subtitle))
	_legend_title_label.text = str(effective.get("legendTitle", SAMPLE_STATE.legendTitle))
	_focus_title_label.text = str(effective.get("focusTitle", SAMPLE_STATE.focusTitle))
	_render_stats(_normalize_string_array(effective.get("stats", SAMPLE_STATE.stats)))
	_render_rows(_legend_rows, _normalize_string_array(effective.get("legendLines", SAMPLE_STATE.legendLines)), _tone_color(str(effective.get("tone", "province"))))
	_render_rows(_focus_rows, _normalize_string_array(effective.get("focusLines", SAMPLE_STATE.focusLines)), Color(0.92, 0.97, 1.0, 0.96))
	_render_actions(_normalize_string_array(effective.get("actions", SAMPLE_STATE.actions)))


func _build_shell() -> void:
	if _frame_panel != null:
		return

	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	clip_contents = true

	_frame_panel = PanelContainer.new()
	_frame_panel.name = "Frame"
	_frame_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_apply_panel_style(_frame_panel, "panel", "observability_panel")
	add_child(_frame_panel)

	var margin := _create_margin_container(_frame_panel, "Margin", 14, 14, 14, 14)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var body := _create_vbox(margin, "Body", 8)
	body.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	_title_label = _create_label(body, "Title", "州层总览", 20)
	_title_label.modulate = Color(0.95, 0.98, 1.0, 0.98)
	_subtitle_label = _create_label(body, "Subtitle", "十三州边界、州府与关口概览。", 12)
	_subtitle_label.modulate = Color(0.83, 0.90, 0.97, 0.94)

	_stats_row = _create_hbox(body, "StatsRow", 6)
	_stats_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	var split := HSplitContainer.new()
	split.name = "Split"
	split.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	split.size_flags_vertical = Control.SIZE_EXPAND_FILL
	split.split_offset = 220
	body.add_child(split)

	var legend_panel := _create_panel(split, "LegendPanel")
	_apply_panel_style(legend_panel, "panel", "hud_top_left")
	var legend_margin := _create_margin_container(legend_panel, "LegendMargin", 10, 10, 10, 10)
	legend_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var legend_vbox := _create_vbox(legend_margin, "LegendVBox", 6)
	legend_vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_legend_title_label = _create_label(legend_vbox, "LegendTitle", "图例", 15)
	_legend_title_label.modulate = Color(0.98, 0.99, 1.0, 0.98)
	_legend_rows = _create_vbox(legend_vbox, "LegendRows", 4)
	_legend_rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	var focus_panel := _create_panel(split, "FocusPanel")
	_apply_panel_style(focus_panel, "panel", "hud_bottom_bar")
	var focus_margin := _create_margin_container(focus_panel, "FocusMargin", 10, 10, 10, 10)
	focus_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var focus_vbox := _create_vbox(focus_margin, "FocusVBox", 6)
	focus_vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_focus_title_label = _create_label(focus_vbox, "FocusTitle", "当前焦点", 15)
	_focus_title_label.modulate = Color(0.98, 0.99, 1.0, 0.98)
	_focus_rows = _create_vbox(focus_vbox, "FocusRows", 4)
	_focus_rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	_actions_row = _create_hbox(body, "ActionsRow", 8)
	_actions_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL


func _resolve_state(state: Dictionary) -> Dictionary:
	var effective := SAMPLE_STATE.duplicate(true)
	for key in state.keys():
		effective[key] = state.get(key)
	return effective


func _render_stats(stats: Array) -> void:
	_clear_children(_stats_row)
	for stat in stats:
		var chip := _create_chip(_stats_row, "StatChip", str(stat), "hud_bottom_bar", 11)
		chip.modulate = Color(0.92, 0.98, 0.95, 0.96)


func _render_rows(parent: VBoxContainer, rows: Array, accent: Color) -> void:
	_clear_children(parent)
	for row_text in rows:
		var label := _create_label(parent, "Row", str(row_text), 12)
		label.modulate = accent


func _render_actions(actions: Array) -> void:
	_clear_children(_actions_row)
	var styles := ["advance_tick", "export"]
	for index in range(actions.size()):
		var button := Button.new()
		button.name = "Action_%d" % index
		button.text = str(actions[index])
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.focus_mode = Control.FOCUS_NONE
		button.add_theme_font_size_override("font_size", 13)
		_actions_row.add_child(button)
		_apply_button_style(button, styles[index % styles.size()])


func _tone_color(tone: String) -> Color:
	match tone.strip_edges().to_lower():
		"nation":
			return Color(0.95, 0.79, 0.34, 0.98)
		"warzone":
			return Color(0.93, 0.62, 0.31, 0.98)
		_:
			return Color(0.54, 0.88, 0.95, 0.98)


func _normalize_string_array(raw_values: Variant) -> Array:
	var normalized: Array = []
	if raw_values is Array:
		for item in raw_values:
			var text := str(item).strip_edges()
			if text != "":
				normalized.append(text)
	return normalized


func _clear_children(parent: Node) -> void:
	for child in parent.get_children():
		child.queue_free()


func _apply_panel_style(panel: PanelContainer, category: String, token_name: String) -> bool:
	return _ui_theme_tokens.apply_panel_style(panel, category, token_name)


func _apply_button_style(button: Button, token_name: String) -> bool:
	return _ui_theme_tokens.apply_button_style(button, "button", token_name)


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


func _create_chip(parent: Node, node_name: String, text: String, token_name: String, font_size: int) -> PanelContainer:
	var chip := PanelContainer.new()
	chip.name = node_name
	chip.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_apply_panel_style(chip, "panel", token_name)
	var margin := _create_margin_container(chip, "Margin", 8, 4, 8, 4)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var label := _create_label(margin, "Label", text, font_size)
	label.modulate = Color(0.92, 0.98, 0.93, 0.95)
	return chip
