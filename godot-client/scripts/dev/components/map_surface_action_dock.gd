@tool
extends Control
class_name MapSurfaceActionDock

signal action_requested(action_id: String, action_label: String, action_group: String)

const UI_THEME_TOKENS_SCRIPT = preload("res://scripts/ui/ui_theme_tokens.gd")

const SURFACE_SHELL_TEXTURE_PATH := "res://assets/themes/slgclient/current/ui/bg_window_6.png"
const SURFACE_TITLE_TEXTURE_PATH := "res://assets/themes/slgclient/current/ui/tipsbiaoti.png"
const SURFACE_SECTION_TEXTURE_PATH := "res://assets/themes/slgclient/current/ui/diban_1.png"
const SURFACE_CARD_TEXTURE_PATH := "res://assets/themes/slgclient/current/ui/diban1_23.png"
const SURFACE_BAND_TEXTURE_PATH := "res://assets/themes/slgclient/current/ui/toast_bg.png"

const SAMPLE_STATE: Dictionary = {
	"contextTitle": "地块动作带",
	"contextSubtitle": "围绕当前焦点地块的出征、驻守与标记操作。",
	"primaryActions": ["Move", "Occupy", "Build"],
	"secondaryActions": ["Reclaim", "Enter", "Tag"],
	"shortcutActions": ["Shift+M", "Shift+O", "T"],
	"coordinateLabel": "Coord | X: 05, Y: 03",
	"zoomLabel": "Zoom | 0.58x",
}

var _theme_tokens = UI_THEME_TOKENS_SCRIPT.new()

var _content_root: Control
var _dock_panel: PanelContainer
var _action_panel: PanelContainer
var _title_label: Label
var _subtitle_label: Label
var _coord_label: Label
var _zoom_label: Label
var _action_grid: VBoxContainer
var _action_subtitle_label: Label
var _overflow_panel: PanelContainer
var _overflow_list: VBoxContainer
var _active_state: Dictionary = {}
var _ui_ready: bool = false
var _overflow_open: bool = false
var _overflow_actions: Array = []
var _last_action_label: String = ""


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_ensure_ui()
	if _active_state.is_empty():
		apply_preview_state(SAMPLE_STATE)
	else:
		_render_state()


func apply_preview_state(state: Dictionary) -> void:
	_active_state = SAMPLE_STATE.duplicate(true)
	if state is Dictionary:
		for key_variant in state.keys():
			_active_state[str(key_variant)] = state[key_variant]
	_ensure_ui()
	_render_state()


func _ensure_ui() -> void:
	if _ui_ready:
		return
	_ui_ready = true

	_content_root = Control.new()
	_content_root.name = "ActionDockRoot"
	_content_root.anchor_left = 0.0
	_content_root.anchor_top = 0.0
	_content_root.anchor_right = 1.0
	_content_root.anchor_bottom = 1.0
	_content_root.offset_left = 0.0
	_content_root.offset_top = 0.0
	_content_root.offset_right = 0.0
	_content_root.offset_bottom = 0.0
	_content_root.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_content_root)

	_dock_panel = PanelContainer.new()
	_dock_panel.name = "DockPanel"
	_dock_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_dock_panel.offset_left = 28.0
	_dock_panel.offset_top = 12.0
	_dock_panel.offset_right = -28.0
	_dock_panel.offset_bottom = -6.0
	_content_root.add_child(_dock_panel)
	_apply_panel_style(_dock_panel, "panel", "hud_bottom_bar")
	_apply_surface_panel_style(_dock_panel, SURFACE_SHELL_TEXTURE_PATH, 16.0, "panel", "hud_bottom_bar")

	var dock_margin := MarginContainer.new()
	dock_margin.name = "DockMargin"
	dock_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dock_margin.add_theme_constant_override("margin_left", 8)
	dock_margin.add_theme_constant_override("margin_top", 5)
	dock_margin.add_theme_constant_override("margin_right", 8)
	dock_margin.add_theme_constant_override("margin_bottom", 5)
	_dock_panel.add_child(dock_margin)

	var dock_stack := _create_vbox(dock_margin, "DockStack", 2)
	dock_stack.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var header_panel := _create_section_panel(dock_stack, "HeaderSection")
	_apply_surface_panel_style(header_panel, SURFACE_TITLE_TEXTURE_PATH, 11.0, "panel", "hud_top_left")
	header_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header_panel.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	header_panel.custom_minimum_size = Vector2(0.0, 24.0)
	var header_margin := _create_margin_container(header_panel, "HeaderMargin", 8, 2, 8, 2)
	var header_row := _create_hbox(header_margin, "HeaderRow", 6)
	header_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	var header_block := _create_hbox(header_row, "HeaderBlock", 4)
	header_block.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header_block.alignment = BoxContainer.ALIGNMENT_BEGIN

	_title_label = _create_label(header_block, "ContextTitle", SAMPLE_STATE.get("contextTitle", ""), 11)
	_title_label.modulate = Color(0.96, 0.98, 1.0, 0.98)
	_subtitle_label = _create_label(header_block, "ContextSubtitle", SAMPLE_STATE.get("contextSubtitle", ""), 9)
	_subtitle_label.modulate = Color(0.89, 0.95, 1.0, 0.76)
	_subtitle_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	_subtitle_label.clip_text = true
	_subtitle_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_subtitle_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_subtitle_label.visible = true

	var meta_block := _create_hbox(header_row, "MetaBlock", 4)
	meta_block.size_flags_horizontal = Control.SIZE_SHRINK_END
	meta_block.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	meta_block.alignment = BoxContainer.ALIGNMENT_END
	meta_block.custom_minimum_size = Vector2(138.0, 0.0)

	_coord_label = _create_meta_chip(meta_block, "CoordinateChip", str(SAMPLE_STATE.get("coordinateLabel", "")))
	_zoom_label = _create_meta_chip(meta_block, "ZoomChip", str(SAMPLE_STATE.get("zoomLabel", "")))

	_action_panel = _create_section_panel(dock_stack, "ActionMatrixSection")
	_apply_surface_panel_style(_action_panel, SURFACE_BAND_TEXTURE_PATH, 14.0, "frame", "observability_section")
	_action_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_action_panel.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	_action_panel.custom_minimum_size = Vector2(0.0, 62.0)
	var action_margin := _create_margin_container(_action_panel, "ActionMatrixMargin", 8, 4, 8, 4)
	var action_stack := _create_vbox(action_margin, "ActionMatrixStack", 2)
	action_stack.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	action_stack.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	action_stack.alignment = BoxContainer.ALIGNMENT_BEGIN

	var action_header := _create_hbox(action_stack, "ActionHeader", 6)
	action_header.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var action_title := _create_label(action_header, "ActionTitle", "半悬浮动作栏", 9)
	action_title.modulate = Color(0.98, 0.99, 1.0, 0.96)
	_action_subtitle_label = _create_label(action_header, "ActionSubtitle", "3 主按钮 + 更多", 8)
	_action_subtitle_label.modulate = Color(0.86, 0.92, 0.99, 0.72)
	_action_subtitle_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	_action_subtitle_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_action_subtitle_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_action_subtitle_label.visible = true

	_action_grid = VBoxContainer.new()
	_action_grid.name = "ActionGrid"
	_action_grid.add_theme_constant_override("separation", 3)
	_action_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_action_grid.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	action_stack.add_child(_action_grid)

	_overflow_panel = _create_section_panel(action_stack, "OverflowPanel")
	_apply_surface_panel_style(_overflow_panel, SURFACE_CARD_TEXTURE_PATH, 10.0, "frame", "observability_section")
	_overflow_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_overflow_panel.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	_overflow_panel.visible = false
	var overflow_margin := _create_margin_container(_overflow_panel, "OverflowMargin", 6, 4, 6, 4)
	_overflow_list = _create_vbox(overflow_margin, "OverflowList", 3)
	_overflow_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_overflow_list.size_flags_vertical = Control.SIZE_SHRINK_BEGIN


func _render_state() -> void:
	if not _ui_ready:
		return

	var title_text := _fallback_text(_active_state.get("contextTitle", null), SAMPLE_STATE.get("contextTitle", ""))
	var subtitle_text := _fallback_text(_active_state.get("contextSubtitle", null), SAMPLE_STATE.get("contextSubtitle", ""))
	var coordinate_text := _fallback_text(_active_state.get("coordinateLabel", null), SAMPLE_STATE.get("coordinateLabel", ""))
	var zoom_text := _fallback_text(_active_state.get("zoomLabel", null), SAMPLE_STATE.get("zoomLabel", ""))

	_title_label.text = title_text
	_subtitle_label.text = subtitle_text
	_subtitle_label.visible = false
	_coord_label.text = coordinate_text
	_zoom_label.text = zoom_text
	if _action_subtitle_label != null:
		_action_subtitle_label.visible = true
		_action_subtitle_label.text = "3 主动作 + 补充"
	_set_overflow_open(false, [])
	_last_action_label = ""

	_rebuild_action_grid(
		_action_grid,
		_string_array_or_fallback(_active_state.get("primaryActions", null), SAMPLE_STATE.get("primaryActions", [])),
		_string_array_or_fallback(_active_state.get("secondaryActions", null), SAMPLE_STATE.get("secondaryActions", [])),
		_string_array_or_fallback(_active_state.get("shortcutActions", null), SAMPLE_STATE.get("shortcutActions", []))
	)


func _create_section_panel(parent: Node, name: String) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.name = name
	parent.add_child(panel)
	_apply_panel_style(panel, "frame", "observability_section")
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


func _create_section_box(parent: Node, name: String) -> VBoxContainer:
	var margin := MarginContainer.new()
	margin.name = name + "Margin"
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 12)
	margin.add_theme_constant_override("margin_top", 10)
	margin.add_theme_constant_override("margin_right", 12)
	margin.add_theme_constant_override("margin_bottom", 10)
	parent.add_child(margin)
	var box := _create_vbox(margin, name, 8)
	box.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	return box


func _create_section_title(parent: Node, title_text: String, subtitle_text: String) -> void:
	var title := _create_label(parent, "SectionTitle", title_text, 15)
	title.modulate = Color(0.95, 0.98, 1.0, 0.96)
	var subtitle := _create_label(parent, "SectionSubtitle", subtitle_text, 12)
	subtitle.modulate = Color(0.86, 0.92, 0.99, 0.84)
	subtitle.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART


func _create_meta_chip(parent: Node, name: String, text: String) -> Label:
	var chip_panel := PanelContainer.new()
	chip_panel.name = name + "Panel"
	chip_panel.custom_minimum_size = Vector2(96.0, 26.0)
	_apply_panel_style(chip_panel, "frame", "observability_section")
	_apply_surface_panel_style(chip_panel, SURFACE_BAND_TEXTURE_PATH, 14.0, "frame", "observability_section")
	parent.add_child(chip_panel)

	var chip_margin := MarginContainer.new()
	chip_margin.name = name + "Margin"
	chip_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	chip_margin.add_theme_constant_override("margin_left", 6)
	chip_margin.add_theme_constant_override("margin_top", 2)
	chip_margin.add_theme_constant_override("margin_right", 6)
	chip_margin.add_theme_constant_override("margin_bottom", 2)
	chip_panel.add_child(chip_margin)

	var chip_label := _create_label(chip_margin, name, text, 10)
	chip_label.modulate = Color(0.96, 0.99, 1.0, 0.95)
	chip_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	return chip_label


func _rebuild_action_grid(grid: VBoxContainer, primary_actions: Array, secondary_actions: Array, shortcut_actions: Array) -> void:
	_clear_children(grid)
	var row_hbox := _create_hbox(grid, "PrimaryActionRow", 4)
	row_hbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row_hbox.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	row_hbox.alignment = BoxContainer.ALIGNMENT_BEGIN

	_create_action_row_chip(row_hbox, "主", "advance_tick", Color(0.99, 0.95, 0.88, 0.99))

	var buttons_hbox := _create_hbox(row_hbox, "PrimaryButtons", 4)
	buttons_hbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	buttons_hbox.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	buttons_hbox.alignment = BoxContainer.ALIGNMENT_BEGIN

	var main_actions: Array = []
	for action in primary_actions:
		if main_actions.size() >= 3:
			break
		main_actions.append(str(action))

	var overflow_actions: Array = []
	for index in range(3, primary_actions.size()):
		overflow_actions.append(str(primary_actions[index]))
	for action in secondary_actions:
		overflow_actions.append(str(action))
	for action in shortcut_actions:
		overflow_actions.append(str(action))
	_overflow_actions = overflow_actions.duplicate()

	if main_actions.is_empty():
		var empty_button := _create_action_button(buttons_hbox, "EmptyPrimaryState", "No actions", "advance_tick", 0.0)
		empty_button.add_theme_color_override("font_color", Color(0.84, 0.88, 0.92, 0.72))
		empty_button.add_theme_color_override("font_hover_color", Color(0.94, 0.96, 0.98, 0.84))
		empty_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		empty_button.custom_minimum_size = Vector2(0.0, 22.0)
	else:
		for index in range(main_actions.size()):
			var action_text := _display_action_text(main_actions[index])
			var button := _create_action_button(buttons_hbox, "PrimaryAction_%d" % index, action_text, "advance_tick", 0.0)
			button.add_theme_color_override("font_color", Color(0.99, 0.95, 0.88, 0.99))
			button.add_theme_color_override("font_hover_color", Color(1.0, 1.0, 1.0, 1.0))
			button.add_theme_color_override("font_pressed_color", Color(1.0, 1.0, 1.0, 1.0))
			button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			button.custom_minimum_size = Vector2(0.0, 22.0)
			button.pressed.connect(_on_action_button_pressed.bind(main_actions[index], action_text, "primary"))

	if not overflow_actions.is_empty():
		var more_button := _create_action_button(buttons_hbox, "OverflowAction", "补充 %d" % overflow_actions.size(), "refresh", 0.0)
		more_button.toggle_mode = true
		more_button.add_theme_color_override("font_color", Color(0.99, 0.98, 0.88, 0.96))
		more_button.add_theme_color_override("font_hover_color", Color(1.0, 1.0, 1.0, 1.0))
		more_button.add_theme_color_override("font_pressed_color", Color(1.0, 1.0, 1.0, 1.0))
		more_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		more_button.custom_minimum_size = Vector2(0.0, 22.0)
		more_button.pressed.connect(_on_overflow_button_pressed.bind(more_button))
	if _action_subtitle_label != null:
		_action_subtitle_label.text = "3 主动作 + 补充 %d" % overflow_actions.size() if not overflow_actions.is_empty() else "3 主动作"


func _on_overflow_button_pressed(button: Button) -> void:
	if button == null:
		return
	var next_open := button.button_pressed
	_set_overflow_open(next_open, _overflow_actions)
	if not next_open:
		button.button_pressed = false


func _set_overflow_open(opened: bool, actions: Array) -> void:
	_overflow_open = opened and not actions.is_empty()
	if _overflow_panel != null:
		_overflow_panel.visible = _overflow_open
	if _overflow_open:
		_rebuild_overflow_list(actions)
	else:
		_rebuild_overflow_list([])


func _rebuild_overflow_list(actions: Array) -> void:
	if _overflow_list == null:
		return
	_clear_children(_overflow_list)
	if actions.is_empty():
		return
	var title_row := _create_hbox(_overflow_list, "OverflowHeader", 4)
	title_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var title := _create_label(title_row, "OverflowTitle", "补充动作", 8)
	title.modulate = Color(0.98, 0.99, 1.0, 0.96)
	var count := _create_label(title_row, "OverflowCount", "%d 项" % actions.size(), 8)
	count.modulate = Color(0.84, 0.92, 0.99, 0.82)
	count.size_flags_horizontal = Control.SIZE_SHRINK_END
	for index in range(actions.size()):
		var button := _create_action_button(_overflow_list, "OverflowItem_%d" % index, _display_action_text(str(actions[index])), "refresh", 0.0)
		button.add_theme_color_override("font_color", Color(0.94, 0.97, 1.0, 0.96))
		button.add_theme_color_override("font_hover_color", Color(1.0, 1.0, 1.0, 1.0))
		button.add_theme_color_override("font_pressed_color", Color(1.0, 1.0, 1.0, 1.0))
		button.pressed.connect(_on_action_button_pressed.bind(str(actions[index]), _display_action_text(str(actions[index])), "overflow"))


func _on_action_button_pressed(action_id: String, action_label: String, action_group: String) -> void:
	_last_action_label = action_label
	if _action_subtitle_label != null:
		_action_subtitle_label.text = "已选择 %s · %s" % [action_label, "主动作" if action_group == "primary" else "补充动作"]
	action_requested.emit(action_id.strip_edges().to_lower(), action_label, action_group)


func _create_action_button(parent: Node, name: String, text: String, token_name: String, min_width: float) -> Button:
	var button := Button.new()
	button.name = name
	button.text = text
	button.clip_text = true
	button.focus_mode = Control.FOCUS_NONE
	button.custom_minimum_size = Vector2(min_width, 22.0)
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	button.add_theme_font_size_override("font_size", 8)
	parent.add_child(button)
	_apply_button_style(button, token_name)
	return button


func _create_action_row_chip(parent: Node, text: String, token_name: String, font_color: Color) -> Control:
	var chip_panel := PanelContainer.new()
	chip_panel.name = text + "Chip"
	chip_panel.custom_minimum_size = Vector2(36.0, 20.0)
	_apply_panel_style(chip_panel, "frame", "observability_section")
	_apply_surface_panel_style(chip_panel, SURFACE_BAND_TEXTURE_PATH, 12.0, "frame", "observability_section")
	parent.add_child(chip_panel)

	var chip_margin := MarginContainer.new()
	chip_margin.name = text + "ChipMargin"
	chip_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	chip_margin.add_theme_constant_override("margin_left", 4)
	chip_margin.add_theme_constant_override("margin_top", 1)
	chip_margin.add_theme_constant_override("margin_right", 4)
	chip_margin.add_theme_constant_override("margin_bottom", 1)
	chip_panel.add_child(chip_margin)

	var chip_label := _create_label(chip_margin, text + "ChipLabel", text, 8)
	chip_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	chip_label.modulate = font_color
	return chip_panel


func _apply_panel_style(panel: PanelContainer, category: String, token_name: String) -> void:
	if panel == null:
		return
	var stylebox := _theme_tokens.resolve_stylebox(category, token_name)
	if stylebox != null:
		panel.add_theme_stylebox_override("panel", stylebox)


func _apply_surface_panel_style(panel: PanelContainer, texture_path: String, texture_margin: float, fallback_category: String = "", fallback_token: String = "") -> bool:
	if panel == null:
		return false
	var stylebox := _build_surface_stylebox(texture_path, texture_margin)
	if stylebox != null:
		panel.add_theme_stylebox_override("panel", stylebox)
		return true
	if fallback_category != "" and fallback_token != "":
		var fallback_style := _theme_tokens.resolve_stylebox(fallback_category, fallback_token)
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


func _apply_button_style(button: Button, token_name: String) -> void:
	if button == null:
		return
	var stylebox := _theme_tokens.resolve_stylebox("button", token_name)
	if stylebox != null:
		button.add_theme_stylebox_override("normal", stylebox)
		button.add_theme_stylebox_override("hover", stylebox)
		button.add_theme_stylebox_override("pressed", stylebox)
		button.add_theme_stylebox_override("disabled", stylebox)
		button.add_theme_stylebox_override("focus", stylebox)


func _create_vbox(parent: Node, name: String, separation: int) -> VBoxContainer:
	var box := VBoxContainer.new()
	box.name = name
	box.add_theme_constant_override("separation", separation)
	parent.add_child(box)
	return box


func _create_hbox(parent: Node, name: String, separation: int) -> HBoxContainer:
	var box := HBoxContainer.new()
	box.name = name
	box.add_theme_constant_override("separation", separation)
	parent.add_child(box)
	return box


func _create_label(parent: Node, name: String, text: String, font_size: int) -> Label:
	var label := Label.new()
	label.name = name
	label.text = text
	label.autowrap_mode = TextServer.AUTOWRAP_OFF
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", font_size)
	parent.add_child(label)
	return label


func _clear_children(parent: Node) -> void:
	for child in parent.get_children():
		child.queue_free()


func _fallback_text(raw_value: Variant, fallback_text: String) -> String:
	var text := str(raw_value).strip_edges()
	if text == "" or text == "Null":
		return fallback_text
	return text


func _string_array_or_fallback(raw_value: Variant, fallback_values: Array) -> Array:
	var values := _normalize_string_array(raw_value)
	if values.is_empty():
		values = _normalize_string_array(fallback_values)
	return values


func _normalize_string_array(raw_value: Variant) -> Array:
	var values: Array = []
	if raw_value is Array:
		for item in raw_value:
			var text := str(item).strip_edges()
			if text != "":
				values.append(text)
	return values


func _display_action_text(raw_text: String) -> String:
	var text := raw_text.strip_edges()
	if text == "":
		return "Action"
	if text.contains("_") or text.contains("-"):
		var pieces := text.replace("-", "_").split("_", false)
		var display_parts: Array[String] = []
		for piece_variant in pieces:
			var piece := str(piece_variant).strip_edges()
			if piece == "":
				continue
			display_parts.append(piece.substr(0, 1).to_upper() + piece.substr(1).to_lower())
		if not display_parts.is_empty():
			return " ".join(display_parts)
	return text
