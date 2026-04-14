@tool
extends Control
class_name NationLayerEntryPanel

signal entry_requested

const UiThemeTokensScript = preload("res://scripts/ui/ui_theme_tokens.gd")

const SAMPLE_STATE := {
	"title": "立国入口",
	"body": "确认国号、颜色与首都后进入。",
	"status": "待定",
	"entryButtonLabel": "进入立国",
	"entrySteps": [
		"确认中心城池",
		"选择国家颜色",
		"锁定首都"
	]
}

var _ui_theme_tokens = UiThemeTokensScript.new()

var _frame_panel: PanelContainer
var _top_band: ColorRect
var _title_label: Label
var _body_label: Label
var _status_label: Label
var _step_title_label: Label
var _entry_steps_rows: VBoxContainer
var _entry_button: Button
var _action_hint_label: Label


func _ready() -> void:
	_build_shell()
	apply_preview_state({})


func apply_preview_state(state: Dictionary) -> void:
	_build_shell()
	var effective_state := _resolve_state(state)
	var title := _resolve_string(effective_state.get("entryTitle", SAMPLE_STATE.get("title", "立国入口")), "立国入口")
	var body := _resolve_string(effective_state.get("entryPrompt", SAMPLE_STATE.get("body", "确认国号、颜色与首都后进入。")), "确认国号、颜色与首都后进入。")
	var status := _resolve_string(effective_state.get("entryStatus", SAMPLE_STATE.get("status", "待定")), "待定")
	var button_label := _resolve_string(effective_state.get("entryButtonLabel", SAMPLE_STATE.get("entryButtonLabel", "进入立国")), "进入立国")
	var steps := _normalize_string_array(effective_state.get("entrySteps", SAMPLE_STATE.get("entrySteps", [])))
	var accent := _read_color(effective_state.get("nationColor", null), Color(0.35, 0.78, 0.68, 1.0))

	_title_label.text = title
	_body_label.text = body
	_status_label.text = "状态 %s" % status
	_entry_button.text = button_label
	_title_label.modulate = accent
	_body_label.modulate = Color(0.85, 0.91, 0.97, 0.92)
	_status_label.modulate = Color(0.83, 0.89, 0.95, 0.9)
	_step_title_label.text = "步骤 1 / %d" % max(1, steps.size())
	_action_hint_label.text = "立国提交"
	_rebuild_label_rows(_entry_steps_rows, steps, 11, accent)


func _build_shell() -> void:
	if _frame_panel != null:
		return

	clip_contents = true

	_frame_panel = PanelContainer.new()
	_frame_panel.name = "Frame"
	_frame_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_apply_panel_style(_frame_panel, "panel", "hud_bottom_bar")
	add_child(_frame_panel)

	_top_band = ColorRect.new()
	_top_band.name = "TopBand"
	_top_band.color = Color(0.35, 0.78, 0.68, 0.24)
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

	var title_row := _create_hbox(body, "TitleRow", 6)
	title_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var title_col := _create_vbox(title_row, "TitleColumn", 0)
	title_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_title_label = _create_label(title_col, "Title", "立国入口", 15)
	_apply_compact_label(_title_label)
	_title_label.modulate = Color(0.96, 0.98, 1.0, 0.98)
	_body_label = _create_label(title_col, "Body", "确认国号、颜色与首都后进入。", 10)
	_apply_compact_label(_body_label)
	_body_label.modulate = Color(0.85, 0.91, 0.97, 0.92)
	var title_spacer := Control.new()
	title_spacer.name = "TitleSpacer"
	title_spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_row.add_child(title_spacer)
	_status_label = _create_label(title_row, "Status", "状态 待定", 9)
	_apply_compact_label(_status_label)
	_status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_status_label.size_flags_horizontal = Control.SIZE_SHRINK_END
	_status_label.modulate = Color(0.83, 0.89, 0.95, 0.9)

	var step_panel := _create_panel(body, "StepPanel")
	_apply_panel_style(step_panel, "panel", "hud_top_left")
	step_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var step_margin := _create_margin_container(step_panel, "Margin", 8, 6, 8, 6)
	step_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var step_vbox := _create_vbox(step_margin, "StepVBox", 3)
	step_vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_step_title_label = _create_label(step_vbox, "StepTitle", "步骤 1 / 3", 10)
	_apply_compact_label(_step_title_label)
	_step_title_label.modulate = Color(0.94, 0.98, 1.0, 0.97)
	_entry_steps_rows = _create_vbox(step_vbox, "EntrySteps", 2)
	_entry_steps_rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	var action_panel := _create_panel(body, "ActionPanel")
	_apply_panel_style(action_panel, "panel", "hud_bottom_bar")
	action_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var action_margin := _create_margin_container(action_panel, "Margin", 10, 8, 10, 8)
	action_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var action_row := _create_hbox(action_margin, "ActionRow", 6)
	action_row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_entry_button = _create_button(action_row, "EntryButton", "进入立国", 13, 130)
	_apply_button_style(_entry_button, "advance_tick")
	_entry_button.pressed.connect(_on_entry_button_pressed)
	var action_col := _create_vbox(action_row, "ActionColumn", 1)
	action_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_action_hint_label = _create_label(action_col, "Hint", "立国提交", 9)
	_apply_compact_label(_action_hint_label)
	_action_hint_label.modulate = Color(0.77, 0.85, 0.93, 0.88)
	var button_hint := _create_label(action_col, "SubHint", "国家层入口 / 纹理化动作区", 8)
	_apply_compact_label(button_hint)
	button_hint.modulate = Color(0.85, 0.91, 0.97, 0.84)
	var button_spacer := Control.new()
	button_spacer.name = "ButtonSpacer"
	button_spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	action_row.add_child(button_spacer)


func _on_entry_button_pressed() -> void:
	emit_signal("entry_requested")


func _rebuild_label_rows(parent: VBoxContainer, rows: Array, font_size: int, accent: Color) -> void:
	_clear_children(parent)
	for index in range(rows.size()):
		var text := str(rows[index]).strip_edges()
		if text == "":
			continue
		var row := _create_hbox(parent, "Step_%d" % index, 6)
		row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var bullet := _create_label(row, "Bullet", "%d" % (index + 1), 9)
		_apply_compact_label(bullet)
		bullet.custom_minimum_size = Vector2(18.0, 0.0)
		bullet.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		bullet.modulate = accent
		var bar := _create_color_rect(row, "Bar", Color(accent.r, accent.g, accent.b, 0.62), 2.0)
		bar.custom_minimum_size = Vector2(8.0, 2.0)
		var label := _create_label(row, "Text", text, font_size)
		_apply_compact_label(label)
		label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		label.modulate = Color(0.92, 0.98, 0.95, 0.96)


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


func _clear_children(parent: Node) -> void:
	for child in parent.get_children():
		child.queue_free()


func _apply_panel_style(panel: PanelContainer, category: String, token_name: String) -> bool:
	return _ui_theme_tokens.apply_panel_style(panel, category, token_name)


func _apply_button_style(button: Button, token_name: String) -> bool:
	return _ui_theme_tokens.apply_button_style(button, token_name)


func _apply_compact_label(label: Label) -> void:
	if label == null:
		return
	label.autowrap_mode = TextServer.AUTOWRAP_OFF
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	label.clip_text = true


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


func _create_button(parent: Node, node_name: String, text: String = "", font_size: int = 14, minimum_width: float = 0.0) -> Button:
	var button := Button.new()
	button.name = node_name
	button.text = text
	button.add_theme_font_size_override("font_size", font_size)
	if minimum_width > 0.0:
		button.custom_minimum_size = Vector2(minimum_width, 0.0)
	parent.add_child(button)
	return button


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


func _create_color_rect(parent: Node, node_name: String, color: Color, height: float = 4.0) -> ColorRect:
	var rect := ColorRect.new()
	rect.name = node_name
	rect.color = color
	rect.custom_minimum_size = Vector2(0.0, height)
	parent.add_child(rect)
	return rect
