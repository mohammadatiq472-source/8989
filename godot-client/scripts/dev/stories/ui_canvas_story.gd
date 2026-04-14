@tool
extends "res://scripts/dev/stories/ui_preview_story_base.gd"
class_name UICanvasStory

const PROVINCE_SUMMARY_SCENE := preload("res://scenes/dev/components/province_layer_summary_panel.tscn")
const PROVINCE_ROSTER_SCENE := preload("res://scenes/dev/components/province_layer_roster_panel.tscn")
const PROVINCE_FOCUS_SCENE := preload("res://scenes/dev/components/province_layer_focus_panel.tscn")

const COMPONENT_ORDER := [
	"province_summary",
	"province_roster",
	"province_focus",
]

const COMPONENT_LIBRARY := {
	"province_summary": {
		"label": "Province Summary",
		"scene": PROVINCE_SUMMARY_SCENE,
		"size": Vector2(398.0, 262.0),
	},
	"province_roster": {
		"label": "Province Roster",
		"scene": PROVINCE_ROSTER_SCENE,
		"size": Vector2(398.0, 262.0),
	},
	"province_focus": {
		"label": "Province Focus",
		"scene": PROVINCE_FOCUS_SCENE,
		"size": Vector2(620.0, 342.0),
	},
}

const LAYOUT_STORAGE_PATH := "user://ui_canvas_layout.json"
const LAYOUT_SCHEMA_VERSION := 1
const GRID_SIZE_MIN := 8
const GRID_SIZE_MAX := 96
const ALIGNMENT_SNAP_THRESHOLD_MIN := 4.0
const ALIGNMENT_SNAP_THRESHOLD_MAX := 48.0
const ALIGNMENT_SNAP_THRESHOLD_STEP := 1.0
const ALIGNMENT_SNAP_THRESHOLD := 12.0
const ZOOM_MIN := 0.60
const ZOOM_MAX := 1.80
const ZOOM_STEP := 0.10

var _shell: PanelContainer
var _title_label: Label
var _description_label: Label
var _state_label: Label

var _canvas_surface: Control
var _canvas_content: Control
var _canvas_feedback_label: Label
var _guide_vertical_line: ColorRect
var _guide_horizontal_line: ColorRect
var _component_list: VBoxContainer
var _selected_type_value: Label
var _selected_position_value: Label
var _delete_selected_button: Button
var _save_layout_button: Button
var _load_layout_button: Button
var _snap_toggle_button: Button
var _snap_threshold_minus_button: Button
var _snap_threshold_plus_button: Button
var _snap_threshold_value_label: Label
var _grid_minus_button: Button
var _grid_plus_button: Button
var _layer_forward_button: Button
var _layer_backward_button: Button
var _layer_front_button: Button
var _layer_back_button: Button
var _zoom_minus_button: Button
var _zoom_plus_button: Button
var _zoom_reset_button: Button
var _zoom_value_label: Label

var _canvas_items: Dictionary = {}
var _selected_item_id: String = ""
var _drag_item_id: String = ""
var _drag_offset: Vector2 = Vector2.ZERO
var _spawn_cursor: int = 0
var _item_seed: int = 1
var _grid_snap_enabled: bool = true
var _grid_size: int = 16
var _canvas_zoom: float = 1.0
var _status_note: String = ""

var _item_normal_style: StyleBoxFlat
var _item_selected_style: StyleBoxFlat
@export_range(ALIGNMENT_SNAP_THRESHOLD_MIN, ALIGNMENT_SNAP_THRESHOLD_MAX, ALIGNMENT_SNAP_THRESHOLD_STEP, "or_greater", "or_less") var alignment_snap_threshold: float = ALIGNMENT_SNAP_THRESHOLD


func _ready() -> void:
	_build_ui()
	_configure_item_styles()
	boot_preview_story()
	if _preview_payload.is_empty():
		_apply_preview_payload()


func capture_targets() -> Array:
	var targets: Array = super.capture_targets()
	if targets.is_empty():
		targets = [
			"Shell",
			"Shell/ShellMargin/RootVBox/MainRow/CanvasPanel/CanvasMargin/CanvasVBox/CanvasSurface",
			"Shell/ShellMargin/RootVBox/MainRow/LibraryPanel",
			"Shell/ShellMargin/RootVBox/MainRow/InspectorPanel",
		]
	return targets


func _build_ui() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	_shell = _create_panel(self, "Shell")
	_shell.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_apply_panel_style(_shell, "panel", "hud_bottom_bar")

	var shell_margin := _create_margin_container(_shell, "ShellMargin", 18, 18, 18, 18)
	shell_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var root_vbox := _create_vbox(shell_margin, "RootVBox", 12)
	root_vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	_title_label = _create_label(root_vbox, "Title", "UI Canvas Story", 22)
	_description_label = _create_label(
		root_vbox,
		"Description",
		"Build UI blocks by placing and dragging reusable components on the canvas.",
		14
	)
	_state_label = _create_label(root_vbox, "StateLabel", "components=0 | source=fixture", 13)

	var main_row := _create_hbox(root_vbox, "MainRow", 12)
	main_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	main_row.size_flags_vertical = Control.SIZE_EXPAND_FILL

	_build_library_panel(main_row)
	_build_canvas_panel(main_row)
	_build_inspector_panel(main_row)

	_apply_canvas_zoom()
	_set_snap_feedback("")
	_refresh_inspector()


func _build_library_panel(parent: Control) -> void:
	var library_panel := _create_panel(parent, "LibraryPanel")
	library_panel.custom_minimum_size = Vector2(238.0, 0.0)
	library_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_apply_panel_style(library_panel, "panel", "hud_top_left")

	var library_margin := _create_margin_container(library_panel, "LibraryMargin", 14, 14, 14, 14)
	library_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var library_vbox := _create_vbox(library_margin, "LibraryVBox", 10)
	library_vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var title := _create_label(library_vbox, "LibraryTitle", "Component Library", 16)
	title.modulate = Color(0.88, 0.95, 1.0, 0.96)
	var hint := _create_label(library_vbox, "LibraryHint", "Click a button to place a component in the canvas.", 12)
	hint.modulate = Color(0.78, 0.86, 0.96, 0.90)

	_component_list = _create_vbox(library_vbox, "ComponentList", 8)
	_component_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_component_list.size_flags_vertical = Control.SIZE_EXPAND_FILL

	for component_id_variant in COMPONENT_ORDER:
		var component_id := str(component_id_variant)
		var definition := _component_definition(component_id)
		if definition.is_empty():
			continue
		var button_name := "Button_%s" % component_id
		var button_label := str(definition.get("label", component_id))
		var add_button := _create_button(_component_list, button_name, button_label, 13, 0.0)
		add_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_apply_button_style(add_button, "advance_tick")
		add_button.pressed.connect(Callable(self, "_on_library_button_pressed").bind(component_id))


func _build_canvas_panel(parent: Control) -> void:
	var canvas_panel := _create_panel(parent, "CanvasPanel")
	canvas_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	canvas_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_apply_panel_style(canvas_panel, "panel", "hud_top_left")

	var canvas_margin := _create_margin_container(canvas_panel, "CanvasMargin", 14, 14, 14, 14)
	canvas_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var canvas_vbox := _create_vbox(canvas_margin, "CanvasVBox", 8)
	canvas_vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var canvas_title := _create_label(canvas_vbox, "CanvasTitle", "Canvas", 16)
	canvas_title.modulate = Color(0.90, 0.96, 1.0, 0.98)
	var canvas_hint := _create_label(canvas_vbox, "CanvasHint", "Drag components; alignment guides and snap hints show while dragging.", 12)
	canvas_hint.modulate = Color(0.78, 0.86, 0.96, 0.90)
	_canvas_feedback_label = _create_label(canvas_vbox, "CanvasFeedback", "Snap hint: -", 11)
	_canvas_feedback_label.modulate = Color(0.98, 0.88, 0.58, 0.96)

	_canvas_surface = Control.new()
	_canvas_surface.name = "CanvasSurface"
	_canvas_surface.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_canvas_surface.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_canvas_surface.custom_minimum_size = Vector2(780.0, 520.0)
	_canvas_surface.clip_contents = true
	canvas_vbox.add_child(_canvas_surface)

	var canvas_bg := ColorRect.new()
	canvas_bg.name = "CanvasBackground"
	canvas_bg.color = Color(0.08, 0.12, 0.18, 0.96)
	canvas_bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	canvas_bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_canvas_surface.add_child(canvas_bg)

	_canvas_content = Control.new()
	_canvas_content.name = "CanvasContent"
	_canvas_content.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_canvas_content.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_canvas_surface.add_child(_canvas_content)

	_guide_vertical_line = ColorRect.new()
	_guide_vertical_line.name = "GuideVertical"
	_guide_vertical_line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_guide_vertical_line.color = Color(0.96, 0.82, 0.34, 0.92)
	_guide_vertical_line.visible = false
	_canvas_surface.add_child(_guide_vertical_line)

	_guide_horizontal_line = ColorRect.new()
	_guide_horizontal_line.name = "GuideHorizontal"
	_guide_horizontal_line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_guide_horizontal_line.color = Color(0.96, 0.82, 0.34, 0.92)
	_guide_horizontal_line.visible = false
	_canvas_surface.add_child(_guide_horizontal_line)


func _build_inspector_panel(parent: Control) -> void:
	var inspector_panel := _create_panel(parent, "InspectorPanel")
	inspector_panel.custom_minimum_size = Vector2(268.0, 0.0)
	inspector_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_apply_panel_style(inspector_panel, "panel", "hud_top_left")

	var inspector_margin := _create_margin_container(inspector_panel, "InspectorMargin", 14, 14, 14, 14)
	inspector_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var inspector_vbox := _create_vbox(inspector_margin, "InspectorVBox", 10)
	inspector_vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var title := _create_label(inspector_vbox, "InspectorTitle", "Selection", 16)
	title.modulate = Color(0.90, 0.96, 1.0, 0.98)
	var hint := _create_label(inspector_vbox, "InspectorHint", "Select a component to inspect or remove it.", 12)
	hint.modulate = Color(0.78, 0.86, 0.96, 0.90)

	var type_key := _create_label(inspector_vbox, "TypeKey", "Type", 12)
	type_key.modulate = Color(0.74, 0.84, 0.95, 0.88)
	_selected_type_value = _create_label(inspector_vbox, "TypeValue", "None", 14)

	var position_key := _create_label(inspector_vbox, "PositionKey", "Position", 12)
	position_key.modulate = Color(0.74, 0.84, 0.95, 0.88)
	_selected_position_value = _create_label(inspector_vbox, "PositionValue", "-", 14)

	var canvas_ops_key := _create_label(inspector_vbox, "CanvasOpsKey", "Canvas Ops", 12)
	canvas_ops_key.modulate = Color(0.74, 0.84, 0.95, 0.88)
	var canvas_ops_row := _create_hbox(inspector_vbox, "CanvasOpsRow", 6)
	canvas_ops_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_save_layout_button = _create_button(canvas_ops_row, "SaveLayoutButton", "Save", 12, 0.0)
	_save_layout_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_apply_button_style(_save_layout_button, "refresh")
	_save_layout_button.pressed.connect(_on_save_layout_pressed)
	_load_layout_button = _create_button(canvas_ops_row, "LoadLayoutButton", "Load", 12, 0.0)
	_load_layout_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_apply_button_style(_load_layout_button, "refresh")
	_load_layout_button.pressed.connect(_on_load_layout_pressed)

	var grid_ops_key := _create_label(inspector_vbox, "GridOpsKey", "Grid Snap", 12)
	grid_ops_key.modulate = Color(0.74, 0.84, 0.95, 0.88)
	var grid_ops_row := _create_hbox(inspector_vbox, "GridOpsRow", 6)
	grid_ops_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_snap_toggle_button = _create_button(grid_ops_row, "SnapToggleButton", "Snap: On", 12, 0.0)
	_snap_toggle_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_apply_button_style(_snap_toggle_button, "advance_tick")
	_snap_toggle_button.pressed.connect(_on_snap_toggle_pressed)
	_grid_minus_button = _create_button(grid_ops_row, "GridMinusButton", "-", 12, 0.0)
	_grid_minus_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_apply_button_style(_grid_minus_button, "export")
	_grid_minus_button.pressed.connect(Callable(self, "_on_grid_step_pressed").bind(-4))
	_grid_plus_button = _create_button(grid_ops_row, "GridPlusButton", "+", 12, 0.0)
	_grid_plus_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_apply_button_style(_grid_plus_button, "export")
	_grid_plus_button.pressed.connect(Callable(self, "_on_grid_step_pressed").bind(4))

	var snap_ops_key := _create_label(inspector_vbox, "SnapOpsKey", "Alignment Snap Threshold", 12)
	snap_ops_key.modulate = Color(0.74, 0.84, 0.95, 0.88)
	var snap_ops_row := _create_hbox(inspector_vbox, "SnapOpsRow", 6)
	snap_ops_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_snap_threshold_value_label = _create_label(snap_ops_row, "SnapThresholdValue", "12", 12)
	_snap_threshold_value_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_snap_threshold_minus_button = _create_button(snap_ops_row, "SnapThresholdMinusButton", "-1", 12, 0.0)
	_snap_threshold_minus_button.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_apply_button_style(_snap_threshold_minus_button, "export")
	_snap_threshold_minus_button.pressed.connect(Callable(self, "_on_snap_threshold_step_pressed").bind(-1.0))
	_snap_threshold_plus_button = _create_button(snap_ops_row, "SnapThresholdPlusButton", "+1", 12, 0.0)
	_snap_threshold_plus_button.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_apply_button_style(_snap_threshold_plus_button, "advance_tick")
	_snap_threshold_plus_button.pressed.connect(Callable(self, "_on_snap_threshold_step_pressed").bind(1.0))

	var zoom_ops_key := _create_label(inspector_vbox, "ZoomOpsKey", "Canvas Zoom", 12)
	zoom_ops_key.modulate = Color(0.74, 0.84, 0.95, 0.88)
	var zoom_ops_row := _create_hbox(inspector_vbox, "ZoomOpsRow", 6)
	zoom_ops_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_zoom_minus_button = _create_button(zoom_ops_row, "ZoomMinusButton", "-", 12, 0.0)
	_zoom_minus_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_apply_button_style(_zoom_minus_button, "export")
	_zoom_minus_button.pressed.connect(Callable(self, "_on_zoom_step_pressed").bind(-ZOOM_STEP))
	_zoom_plus_button = _create_button(zoom_ops_row, "ZoomPlusButton", "+", 12, 0.0)
	_zoom_plus_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_apply_button_style(_zoom_plus_button, "advance_tick")
	_zoom_plus_button.pressed.connect(Callable(self, "_on_zoom_step_pressed").bind(ZOOM_STEP))
	_zoom_reset_button = _create_button(zoom_ops_row, "ZoomResetButton", "100%", 12, 0.0)
	_zoom_reset_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_apply_button_style(_zoom_reset_button, "refresh")
	_zoom_reset_button.pressed.connect(_on_zoom_reset_pressed)
	_zoom_value_label = _create_label(inspector_vbox, "ZoomValueLabel", "Zoom: 100%", 12)
	_zoom_value_label.modulate = Color(0.82, 0.90, 0.98, 0.94)

	var layer_ops_key := _create_label(inspector_vbox, "LayerOpsKey", "Layer Order", 12)
	layer_ops_key.modulate = Color(0.74, 0.84, 0.95, 0.88)
	var layer_ops_row_a := _create_hbox(inspector_vbox, "LayerOpsRowA", 6)
	layer_ops_row_a.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_layer_backward_button = _create_button(layer_ops_row_a, "LayerBackwardButton", "Back", 12, 0.0)
	_layer_backward_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_apply_button_style(_layer_backward_button, "export")
	_layer_backward_button.pressed.connect(Callable(self, "_on_layer_move_pressed").bind(-1, false))
	_layer_forward_button = _create_button(layer_ops_row_a, "LayerForwardButton", "Forward", 12, 0.0)
	_layer_forward_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_apply_button_style(_layer_forward_button, "advance_tick")
	_layer_forward_button.pressed.connect(Callable(self, "_on_layer_move_pressed").bind(1, false))
	var layer_ops_row_b := _create_hbox(inspector_vbox, "LayerOpsRowB", 6)
	layer_ops_row_b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_layer_back_button = _create_button(layer_ops_row_b, "LayerBackButton", "To Back", 12, 0.0)
	_layer_back_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_apply_button_style(_layer_back_button, "export")
	_layer_back_button.pressed.connect(Callable(self, "_on_layer_move_pressed").bind(0, false))
	_layer_front_button = _create_button(layer_ops_row_b, "LayerFrontButton", "To Front", 12, 0.0)
	_layer_front_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_apply_button_style(_layer_front_button, "advance_tick")
	_layer_front_button.pressed.connect(Callable(self, "_on_layer_move_pressed").bind(0, true))

	var shortcut_hint := _create_label(
		inspector_vbox,
		"ShortcutHint",
		"Hotkeys: Ctrl+S/L save/load | G toggle snap | [ ] grid | ,/. alignment snap | PgUp/PgDn/Home/End reorder",
		10
	)
	shortcut_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	shortcut_hint.modulate = Color(0.72, 0.82, 0.93, 0.86)

	var spacer := Control.new()
	spacer.name = "InspectorSpacer"
	spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	inspector_vbox.add_child(spacer)

	_delete_selected_button = _create_button(inspector_vbox, "DeleteSelectedButton", "Delete Selected", 14, 0.0)
	_delete_selected_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_delete_selected_button.disabled = true
	_apply_button_style(_delete_selected_button, "export")
	_delete_selected_button.pressed.connect(_on_delete_selected_pressed)
	_refresh_canvas_controls()


func _configure_item_styles() -> void:
	_item_normal_style = StyleBoxFlat.new()
	_item_normal_style.bg_color = Color(0.07, 0.10, 0.16, 0.96)
	_item_normal_style.border_color = Color(0.40, 0.52, 0.64, 0.72)
	_item_normal_style.set_border_width_all(1)
	_item_normal_style.corner_radius_top_left = 6
	_item_normal_style.corner_radius_top_right = 6
	_item_normal_style.corner_radius_bottom_right = 6
	_item_normal_style.corner_radius_bottom_left = 6

	_item_selected_style = StyleBoxFlat.new()
	_item_selected_style.bg_color = Color(0.09, 0.13, 0.20, 0.98)
	_item_selected_style.border_color = Color(0.94, 0.74, 0.40, 0.94)
	_item_selected_style.set_border_width_all(3)
	_item_selected_style.corner_radius_top_left = 6
	_item_selected_style.corner_radius_top_right = 6
	_item_selected_style.corner_radius_bottom_right = 6
	_item_selected_style.corner_radius_bottom_left = 6


func _apply_preview_payload() -> void:
	_title_label.text = str(_preview_payload.get("title", story_title if story_title.strip_edges() != "" else "UI Canvas Story"))
	_description_label.text = str(_preview_payload.get("description", story_description if story_description.strip_edges() != "" else "Drag and place UI components on a free canvas."))
	_refresh_state_label()
	_refresh_inspector()


func _input(event: InputEvent) -> void:
	if event is InputEventKey:
		var key_event := event as InputEventKey
		if _handle_canvas_shortcut(key_event):
			accept_event()
			return
	if _drag_item_id == "":
		return
	if event is InputEventMouseMotion:
		var viewport_mouse := get_viewport().get_mouse_position()
		_move_drag_item(viewport_mouse)
		_refresh_inspector()
	elif event is InputEventMouseButton:
		var mouse_button := event as InputEventMouseButton
		if mouse_button.button_index == MOUSE_BUTTON_LEFT and not mouse_button.pressed:
			_drag_item_id = ""
			_set_snap_feedback("")
			_set_guide_lines_visible(false, 0.0, false, 0.0)


func _on_library_button_pressed(component_id: String) -> void:
	var item_id := _spawn_canvas_item(component_id, Vector2(-1.0, -1.0), Vector2.ZERO)
	if item_id == "":
		return
	_select_item(item_id)
	_clear_status_note()
	_refresh_state_label()


func _on_canvas_item_gui_input(event: InputEvent, item_id: String) -> void:
	if event is not InputEventMouseButton:
		return
	var mouse_button := event as InputEventMouseButton
	if mouse_button.button_index != MOUSE_BUTTON_LEFT:
		return

	if mouse_button.pressed:
		_select_item(item_id)
		_drag_item_id = item_id
		var item_data: Dictionary = _canvas_items.get(item_id, {}) as Dictionary
		var wrapper := item_data.get("wrapper") as Control
		if wrapper != null and is_instance_valid(wrapper):
			var cursor_in_canvas := _to_canvas_space(get_viewport().get_mouse_position())
			_drag_offset = cursor_in_canvas - wrapper.position
	else:
		if _drag_item_id == item_id:
			_drag_item_id = ""
			_set_snap_feedback("")
			_set_guide_lines_visible(false, 0.0, false, 0.0)
	accept_event()


func _on_delete_selected_pressed() -> void:
	if _selected_item_id == "":
		return
	var item_data: Dictionary = _canvas_items.get(_selected_item_id, {}) as Dictionary
	var wrapper := item_data.get("wrapper") as Control
	if wrapper != null and is_instance_valid(wrapper):
		wrapper.queue_free()
	_canvas_items.erase(_selected_item_id)
	if _drag_item_id == _selected_item_id:
		_drag_item_id = ""
	_selected_item_id = ""
	_refresh_item_styles()
	_refresh_inspector()
	_refresh_state_label()


func _move_drag_item(viewport_mouse: Vector2) -> void:
	var item_data: Dictionary = _canvas_items.get(_drag_item_id, {}) as Dictionary
	if item_data.is_empty():
		_drag_item_id = ""
		_set_snap_feedback("")
		_set_guide_lines_visible(false, 0.0, false, 0.0)
		return
	var wrapper := item_data.get("wrapper") as Control
	if wrapper == null or not is_instance_valid(wrapper) or _canvas_surface == null or _canvas_content == null:
		_drag_item_id = ""
		_set_snap_feedback("")
		_set_guide_lines_visible(false, 0.0, false, 0.0)
		return

	var canvas_mouse := _to_canvas_space(viewport_mouse)
	var target_position := canvas_mouse - _drag_offset
	var snap_result := _resolve_alignment_snap(_drag_item_id, target_position, wrapper.size)
	target_position = snap_result.get("position", target_position)
	if _grid_snap_enabled:
		var before_grid := target_position
		target_position = _snap_position_to_grid(target_position)
		if before_grid.distance_to(target_position) >= 0.01:
			var grid_note := "grid(%d)" % _grid_size
			var existing_note := str(snap_result.get("hint", "")).strip_edges()
			snap_result["hint"] = grid_note if existing_note == "" else "%s + %s" % [existing_note, grid_note]
	wrapper.position = _clamp_to_canvas(target_position, wrapper.size)

	var show_vertical := bool(snap_result.get("showVertical", false))
	var show_horizontal := bool(snap_result.get("showHorizontal", false))
	var vertical_x := float(snap_result.get("verticalX", 0.0))
	var horizontal_y := float(snap_result.get("horizontalY", 0.0))
	_set_guide_lines_visible(show_vertical, vertical_x, show_horizontal, horizontal_y)
	_set_snap_feedback(str(snap_result.get("hint", "")))


func _select_item(item_id: String) -> void:
	var normalized_item_id := item_id.strip_edges()
	if normalized_item_id != "" and not _canvas_items.has(normalized_item_id):
		normalized_item_id = ""
	_selected_item_id = normalized_item_id
	_refresh_item_styles()
	_refresh_inspector()


func _refresh_item_styles() -> void:
	for item_data_variant in _canvas_items.values():
		if item_data_variant is not Dictionary:
			continue
		var item_data: Dictionary = item_data_variant as Dictionary
		var wrapper := item_data.get("wrapper") as PanelContainer
		if wrapper == null or not is_instance_valid(wrapper):
			continue
		var is_selected := str(item_data.get("id", "")) == _selected_item_id
		wrapper.add_theme_stylebox_override("panel", _item_selected_style if is_selected else _item_normal_style)


func _refresh_inspector() -> void:
	if _selected_type_value == null or _selected_position_value == null or _delete_selected_button == null:
		return
	if _selected_item_id == "" or not _canvas_items.has(_selected_item_id):
		_selected_type_value.text = "None"
		_selected_position_value.text = "-"
		_delete_selected_button.disabled = true
		_refresh_canvas_controls()
		return

	var item_data: Dictionary = _canvas_items.get(_selected_item_id, {}) as Dictionary
	var wrapper := item_data.get("wrapper") as Control
	if wrapper == null or not is_instance_valid(wrapper):
		_selected_type_value.text = "None"
		_selected_position_value.text = "-"
		_delete_selected_button.disabled = true
		_refresh_canvas_controls()
		return

	_selected_type_value.text = str(item_data.get("label", "Unknown"))
	_selected_position_value.text = "x=%d, y=%d" % [int(round(wrapper.position.x)), int(round(wrapper.position.y))]
	_delete_selected_button.disabled = false
	_refresh_canvas_controls()


func _refresh_state_label() -> void:
	if _state_label == null:
		return
	var source_meta := get_preview_data_source_meta()
	var source_mode := str(source_meta.get("effectiveMode", "fixture")).strip_edges()
	if source_mode == "":
		source_mode = "fixture"
	var base_text := "components=%d | source=%s" % [_canvas_items.size(), source_mode]
	if _status_note.strip_edges() == "":
		_state_label.text = base_text
	else:
		_state_label.text = "%s | %s" % [base_text, _status_note]


func _handle_canvas_shortcut(event: InputEventKey) -> bool:
	if not event.pressed or event.echo:
		return false
	if event.ctrl_pressed and event.keycode == KEY_S:
		_save_layout_to_storage()
		_refresh_canvas_controls()
		return true
	if event.ctrl_pressed and event.keycode == KEY_L:
		_load_layout_from_storage()
		_refresh_canvas_controls()
		return true
	if event.keycode == KEY_G:
		_grid_snap_enabled = not _grid_snap_enabled
		_set_status_note("grid=%s size=%d" % ["on" if _grid_snap_enabled else "off", _grid_size])
		_refresh_canvas_controls()
		return true
	if event.keycode == KEY_BRACKETRIGHT or event.keycode == KEY_EQUAL:
		_grid_size = clampi(_grid_size + 4, GRID_SIZE_MIN, GRID_SIZE_MAX)
		_set_status_note("grid=%s size=%d" % ["on" if _grid_snap_enabled else "off", _grid_size])
		_refresh_canvas_controls()
		return true
	if event.keycode == KEY_BRACKETLEFT or event.keycode == KEY_MINUS:
		_grid_size = clampi(_grid_size - 4, GRID_SIZE_MIN, GRID_SIZE_MAX)
		_set_status_note("grid=%s size=%d" % ["on" if _grid_snap_enabled else "off", _grid_size])
		_refresh_canvas_controls()
		return true
	if event.keycode == KEY_COMMA:
		_set_snap_threshold(_clamp_snap_threshold(alignment_snap_threshold - ALIGNMENT_SNAP_THRESHOLD_STEP))
		return true
	if event.keycode == KEY_PERIOD:
		_set_snap_threshold(_clamp_snap_threshold(alignment_snap_threshold + ALIGNMENT_SNAP_THRESHOLD_STEP))
		return true
	if event.keycode == KEY_DELETE:
		_on_delete_selected_pressed()
		return true
	if _selected_item_id == "":
		return false
	match event.keycode:
		KEY_PAGEUP:
			_move_selected_layer_by(1)
			return true
		KEY_PAGEDOWN:
			_move_selected_layer_by(-1)
			return true
		KEY_HOME:
			_move_selected_to_absolute_layer(true)
			return true
		KEY_END:
			_move_selected_to_absolute_layer(false)
			return true
		_:
			return false


func _spawn_canvas_item(component_id: String, requested_position: Vector2, requested_size: Vector2, item_id_override: String = "") -> String:
	if _canvas_content == null:
		return ""
	var definition := _component_definition(component_id)
	if definition.is_empty():
		return ""

	var item_id := item_id_override.strip_edges()
	if item_id == "" or _canvas_items.has(item_id):
		item_id = "canvas_item_%03d" % _item_seed
		_item_seed += 1

	var wrapper := PanelContainer.new()
	wrapper.name = item_id
	wrapper.set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT)
	wrapper.mouse_filter = Control.MOUSE_FILTER_STOP
	wrapper.focus_mode = Control.FOCUS_NONE
	wrapper.clip_contents = true
	wrapper.add_theme_stylebox_override("panel", _item_normal_style)
	wrapper.gui_input.connect(Callable(self, "_on_canvas_item_gui_input").bind(item_id))
	_canvas_content.add_child(wrapper)

	var preferred_size := requested_size
	if preferred_size.x <= 1.0 or preferred_size.y <= 1.0:
		preferred_size = definition.get("size", Vector2(320.0, 220.0))
	_set_wrapper_size(wrapper, preferred_size)

	var scene := definition.get("scene") as PackedScene
	if scene != null:
		var instance := scene.instantiate()
		if instance is Control:
			var control := instance as Control
			control.name = "Component"
			control.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
			wrapper.add_child(control)
			_set_mouse_filter_recursive(control, Control.MOUSE_FILTER_IGNORE)
			if control.has_method("apply_preview_state"):
				control.call("apply_preview_state", _default_component_state(component_id))

	var placement := requested_position
	if placement.x < 0.0 or placement.y < 0.0:
		placement = _next_spawn_position(wrapper.size)
	if _grid_snap_enabled:
		placement = _snap_position_to_grid(placement)
	wrapper.position = _clamp_to_canvas(placement, wrapper.size)

	_canvas_items[item_id] = {
		"id": item_id,
		"componentId": component_id,
		"label": str(definition.get("label", component_id)),
		"wrapper": wrapper,
	}
	return item_id


func _set_wrapper_size(wrapper: Control, requested_size: Vector2) -> void:
	var safe_size := requested_size
	safe_size.x = maxf(120.0, safe_size.x)
	safe_size.y = maxf(80.0, safe_size.y)
	wrapper.size = safe_size
	wrapper.custom_minimum_size = safe_size


func _refresh_canvas_controls() -> void:
	if _snap_toggle_button != null and is_instance_valid(_snap_toggle_button):
		_snap_toggle_button.text = "Snap: %s" % ("On" if _grid_snap_enabled else "Off")
	if _grid_minus_button != null and is_instance_valid(_grid_minus_button):
		_grid_minus_button.disabled = _grid_size <= GRID_SIZE_MIN
		_grid_minus_button.text = "-%d" % 4
	if _grid_plus_button != null and is_instance_valid(_grid_plus_button):
		_grid_plus_button.disabled = _grid_size >= GRID_SIZE_MAX
		_grid_plus_button.text = "+%d" % 4
	if _snap_threshold_minus_button != null and is_instance_valid(_snap_threshold_minus_button):
		_snap_threshold_minus_button.disabled = alignment_snap_threshold <= ALIGNMENT_SNAP_THRESHOLD_MIN
	if _snap_threshold_plus_button != null and is_instance_valid(_snap_threshold_plus_button):
		_snap_threshold_plus_button.disabled = alignment_snap_threshold >= ALIGNMENT_SNAP_THRESHOLD_MAX
	if _snap_threshold_value_label != null and is_instance_valid(_snap_threshold_value_label):
		_snap_threshold_value_label.text = "snap=%d" % int(round(alignment_snap_threshold))
	if _zoom_value_label != null and is_instance_valid(_zoom_value_label):
		_zoom_value_label.text = "Zoom: %d%%" % int(round(_canvas_zoom * 100.0))
	if _zoom_minus_button != null and is_instance_valid(_zoom_minus_button):
		_zoom_minus_button.disabled = _canvas_zoom <= ZOOM_MIN + 0.001
		_zoom_minus_button.text = "-%d%%" % int(round(ZOOM_STEP * 100.0))
	if _zoom_plus_button != null and is_instance_valid(_zoom_plus_button):
		_zoom_plus_button.disabled = _canvas_zoom >= ZOOM_MAX - 0.001
		_zoom_plus_button.text = "+%d%%" % int(round(ZOOM_STEP * 100.0))
	if _zoom_reset_button != null and is_instance_valid(_zoom_reset_button):
		_zoom_reset_button.disabled = absf(_canvas_zoom - 1.0) <= 0.001
	var has_selection := _selected_wrapper() != null
	if _layer_forward_button != null and is_instance_valid(_layer_forward_button):
		_layer_forward_button.disabled = not has_selection
	if _layer_backward_button != null and is_instance_valid(_layer_backward_button):
		_layer_backward_button.disabled = not has_selection
	if _layer_front_button != null and is_instance_valid(_layer_front_button):
		_layer_front_button.disabled = not has_selection
	if _layer_back_button != null and is_instance_valid(_layer_back_button):
		_layer_back_button.disabled = not has_selection


func _on_save_layout_pressed() -> void:
	_save_layout_to_storage()
	_refresh_canvas_controls()


func _on_load_layout_pressed() -> void:
	_load_layout_from_storage()
	_refresh_canvas_controls()


func _on_snap_toggle_pressed() -> void:
	_grid_snap_enabled = not _grid_snap_enabled
	_set_status_note("grid=%s size=%d" % ["on" if _grid_snap_enabled else "off", _grid_size])
	_refresh_canvas_controls()


func _on_grid_step_pressed(delta: int) -> void:
	_grid_size = clampi(_grid_size + delta, GRID_SIZE_MIN, GRID_SIZE_MAX)
	_set_status_note("grid=%s size=%d" % ["on" if _grid_snap_enabled else "off", _grid_size])
	_refresh_canvas_controls()


func _on_snap_threshold_step_pressed(delta: float) -> void:
	_set_snap_threshold(_clamp_snap_threshold(alignment_snap_threshold + delta))


func _set_snap_threshold(value: float) -> void:
	var clamped := _clamp_snap_threshold(value)
	if is_equal_approx(alignment_snap_threshold, clamped):
		return
	alignment_snap_threshold = clamped
	_set_status_note("snap=%d" % int(round(alignment_snap_threshold)))
	_refresh_canvas_controls()


func _on_zoom_step_pressed(delta: float) -> void:
	_canvas_zoom = clampf(_canvas_zoom + delta, ZOOM_MIN, ZOOM_MAX)
	_apply_canvas_zoom()
	_set_status_note("zoom=%d%%" % int(round(_canvas_zoom * 100.0)))
	_refresh_canvas_controls()


func _on_zoom_reset_pressed() -> void:
	_canvas_zoom = 1.0
	_apply_canvas_zoom()
	_set_status_note("zoom=100%")
	_refresh_canvas_controls()


func _on_layer_move_pressed(delta: int, to_front: bool) -> void:
	if to_front:
		_move_selected_to_absolute_layer(true)
		return
	if delta == 0:
		_move_selected_to_absolute_layer(false)
		return
	_move_selected_layer_by(delta)


func _selected_wrapper() -> Control:
	if _selected_item_id == "":
		return null
	var item_data: Dictionary = _canvas_items.get(_selected_item_id, {}) as Dictionary
	var wrapper := item_data.get("wrapper") as Control
	if wrapper == null or not is_instance_valid(wrapper):
		return null
	return wrapper


func _move_selected_layer_by(delta: int) -> void:
	if _canvas_content == null:
		return
	var wrapper := _selected_wrapper()
	if wrapper == null:
		return
	var min_index := 0
	var max_index := _canvas_content.get_child_count() - 1
	var target_index := clampi(wrapper.get_index() + delta, min_index, max_index)
	if target_index == wrapper.get_index():
		return
	_canvas_content.move_child(wrapper, target_index)
	_set_status_note("layer=%d" % target_index)
	_refresh_inspector()
	_refresh_canvas_controls()


func _move_selected_to_absolute_layer(to_top: bool) -> void:
	if _canvas_content == null:
		return
	var wrapper := _selected_wrapper()
	if wrapper == null:
		return
	var target_index := _canvas_content.get_child_count() - 1 if to_top else 0
	if target_index == wrapper.get_index():
		return
	_canvas_content.move_child(wrapper, target_index)
	_set_status_note("layer=%d" % target_index)
	_refresh_inspector()
	_refresh_canvas_controls()


func _save_layout_to_storage() -> void:
	if _canvas_content == null:
		return
	var entries: Array = []
	for item_data_variant in _canvas_items.values():
		if item_data_variant is not Dictionary:
			continue
		var item_data := item_data_variant as Dictionary
		var wrapper := item_data.get("wrapper") as Control
		if wrapper == null or not is_instance_valid(wrapper):
			continue
		entries.append({
			"componentId": str(item_data.get("componentId", "")),
			"position": [wrapper.position.x, wrapper.position.y],
			"size": [wrapper.size.x, wrapper.size.y],
			"zIndex": wrapper.get_index(),
		})
	entries.sort_custom(func(a, b) -> bool:
		return int(a.get("zIndex", 0)) < int(b.get("zIndex", 0))
	)
	var payload := {
		"schemaVersion": LAYOUT_SCHEMA_VERSION,
		"gridSnapEnabled": _grid_snap_enabled,
		"gridSize": _grid_size,
		"alignmentSnapThreshold": alignment_snap_threshold,
		"canvasZoom": _canvas_zoom,
		"items": entries,
	}
	var file := FileAccess.open(LAYOUT_STORAGE_PATH, FileAccess.WRITE)
	if file == null:
		_set_status_note("save_failed")
		return
	file.store_string(JSON.stringify(payload, "\t"))
	file.flush()
	file.close()
	_set_status_note("saved=%d" % entries.size())
	_refresh_canvas_controls()


func _load_layout_from_storage() -> void:
	if not FileAccess.file_exists(LAYOUT_STORAGE_PATH):
		_set_status_note("layout_missing")
		return
	var file := FileAccess.open(LAYOUT_STORAGE_PATH, FileAccess.READ)
	if file == null:
		_set_status_note("load_failed")
		return
	var raw_text := file.get_as_text()
	file.close()
	var parsed: Variant = JSON.parse_string(raw_text)
	if parsed is not Dictionary:
		_set_status_note("layout_invalid")
		return
	var payload := parsed as Dictionary
	var items_variant: Variant = payload.get("items", [])
	if items_variant is not Array:
		_set_status_note("layout_invalid")
		return
	var saved_items := items_variant as Array
	saved_items.sort_custom(func(a, b) -> bool:
		return int(a.get("zIndex", 0)) < int(b.get("zIndex", 0))
	)

	_grid_snap_enabled = bool(payload.get("gridSnapEnabled", _grid_snap_enabled))
	_grid_size = clampi(int(payload.get("gridSize", _grid_size)), GRID_SIZE_MIN, GRID_SIZE_MAX)
	alignment_snap_threshold = _clamp_snap_threshold(float(payload.get("alignmentSnapThreshold", alignment_snap_threshold)))
	_canvas_zoom = clampf(float(payload.get("canvasZoom", _canvas_zoom)), ZOOM_MIN, ZOOM_MAX)
	_apply_canvas_zoom()
	_clear_all_canvas_items()

	var last_item_id := ""
	for item_variant in saved_items:
		if item_variant is not Dictionary:
			continue
		var item_data := item_variant as Dictionary
		var component_id := str(item_data.get("componentId", "")).strip_edges()
		if component_id == "":
			continue
		var saved_position := _vector2_from_array(item_data.get("position", []), Vector2(24.0, 24.0))
		var saved_size := _vector2_from_array(item_data.get("size", []), Vector2(320.0, 220.0))
		var spawned_item_id := _spawn_canvas_item(component_id, saved_position, saved_size)
		if spawned_item_id != "":
			last_item_id = spawned_item_id

	if last_item_id != "":
		_select_item(last_item_id)
	else:
		_select_item("")
	_set_status_note("loaded=%d" % _canvas_items.size())
	_refresh_state_label()
	_refresh_canvas_controls()


func _clear_all_canvas_items() -> void:
	for item_data_variant in _canvas_items.values():
		if item_data_variant is not Dictionary:
			continue
		var item_data := item_data_variant as Dictionary
		var wrapper := item_data.get("wrapper") as Control
		if wrapper != null and is_instance_valid(wrapper):
			wrapper.queue_free()
	_canvas_items.clear()
	_selected_item_id = ""
	_drag_item_id = ""
	_set_snap_feedback("")
	_set_guide_lines_visible(false, 0.0, false, 0.0)
	_refresh_item_styles()
	_refresh_inspector()


func _vector2_from_array(value: Variant, fallback: Vector2) -> Vector2:
	if value is Array:
		var array_value := value as Array
		if array_value.size() >= 2:
			return Vector2(float(array_value[0]), float(array_value[1]))
	return fallback


func _snap_position_to_grid(position_value: Vector2) -> Vector2:
	var step := float(maxi(1, _grid_size))
	return position_value.snapped(Vector2(step, step))


func _clamp_snap_threshold(value: float) -> float:
	return clampf(value, ALIGNMENT_SNAP_THRESHOLD_MIN, ALIGNMENT_SNAP_THRESHOLD_MAX)


func _canvas_logical_size() -> Vector2:
	if _canvas_surface == null:
		return Vector2(1.0, 1.0)
	var zoom_safe := maxf(0.001, _canvas_zoom)
	return Vector2(
		maxf(1.0, _canvas_surface.size.x / zoom_safe),
		maxf(1.0, _canvas_surface.size.y / zoom_safe)
	)


func _to_canvas_space(viewport_position: Vector2) -> Vector2:
	if _canvas_content == null or not is_instance_valid(_canvas_content):
		return viewport_position
	return _canvas_content.get_global_transform_with_canvas().affine_inverse() * viewport_position


func _apply_canvas_zoom() -> void:
	_canvas_zoom = clampf(_canvas_zoom, ZOOM_MIN, ZOOM_MAX)
	if _canvas_content != null and is_instance_valid(_canvas_content):
		_canvas_content.scale = Vector2(_canvas_zoom, _canvas_zoom)
	_set_guide_lines_visible(false, 0.0, false, 0.0)
	_refresh_canvas_controls()


func _resolve_alignment_snap(item_id: String, target_position: Vector2, item_size: Vector2) -> Dictionary:
	var resolved := target_position
	var canvas_size := _canvas_logical_size()

	var source_x: Array = [
		{"id": "left", "value": target_position.x, "offset": 0.0},
		{"id": "center", "value": target_position.x + item_size.x * 0.5, "offset": item_size.x * 0.5},
		{"id": "right", "value": target_position.x + item_size.x, "offset": item_size.x},
	]
	var source_y: Array = [
		{"id": "top", "value": target_position.y, "offset": 0.0},
		{"id": "center", "value": target_position.y + item_size.y * 0.5, "offset": item_size.y * 0.5},
		{"id": "bottom", "value": target_position.y + item_size.y, "offset": item_size.y},
	]
	var targets_x: Array = [
		{"id": "canvas_left", "value": 0.0},
		{"id": "canvas_center", "value": canvas_size.x * 0.5},
		{"id": "canvas_right", "value": canvas_size.x},
	]
	var targets_y: Array = [
		{"id": "canvas_top", "value": 0.0},
		{"id": "canvas_center", "value": canvas_size.y * 0.5},
		{"id": "canvas_bottom", "value": canvas_size.y},
	]

	for item_data_variant in _canvas_items.values():
		if item_data_variant is not Dictionary:
			continue
		var item_data := item_data_variant as Dictionary
		var other_id := str(item_data.get("id", ""))
		if other_id == item_id:
			continue
		var other_wrapper := item_data.get("wrapper") as Control
		if other_wrapper == null or not is_instance_valid(other_wrapper):
			continue
		var other_pos := other_wrapper.position
		var other_size := other_wrapper.size
		targets_x.append({"id": "item_left", "value": other_pos.x})
		targets_x.append({"id": "item_center", "value": other_pos.x + other_size.x * 0.5})
		targets_x.append({"id": "item_right", "value": other_pos.x + other_size.x})
		targets_y.append({"id": "item_top", "value": other_pos.y})
		targets_y.append({"id": "item_center", "value": other_pos.y + other_size.y * 0.5})
		targets_y.append({"id": "item_bottom", "value": other_pos.y + other_size.y})

	var x_snap := _find_best_alignment(source_x, targets_x)
	var y_snap := _find_best_alignment(source_y, targets_y)
	var hint_parts: Array[String] = []

	if bool(x_snap.get("matched", false)):
		var x_line := float(x_snap.get("lineValue", resolved.x))
		var x_offset := float(x_snap.get("offset", 0.0))
		resolved.x = x_line - x_offset
		hint_parts.append(str(x_snap.get("hint", "x")))
	if bool(y_snap.get("matched", false)):
		var y_line := float(y_snap.get("lineValue", resolved.y))
		var y_offset := float(y_snap.get("offset", 0.0))
		resolved.y = y_line - y_offset
		hint_parts.append(str(y_snap.get("hint", "y")))

	resolved = _clamp_to_canvas(resolved, item_size)

	var result := {
		"position": resolved,
		"showVertical": bool(x_snap.get("matched", false)),
		"verticalX": float(x_snap.get("lineValue", 0.0)) * _canvas_zoom,
		"showHorizontal": bool(y_snap.get("matched", false)),
		"horizontalY": float(y_snap.get("lineValue", 0.0)) * _canvas_zoom,
	}
	if hint_parts.is_empty():
		result["hint"] = ""
	else:
		result["hint"] = "snap(%s)" % ", ".join(hint_parts)
	return result


func _find_best_alignment(source_anchors: Array, target_anchors: Array) -> Dictionary:
	var threshold := _clamp_snap_threshold(alignment_snap_threshold)
	var best_distance := threshold + 1.0
	var best_source_offset := 0.0
	var best_source_id := ""
	var best_target_id := ""
	var best_target_value := 0.0

	for source_anchor_variant in source_anchors:
		if source_anchor_variant is not Dictionary:
			continue
		var source_anchor := source_anchor_variant as Dictionary
		var source_value := float(source_anchor.get("value", 0.0))
		var source_offset := float(source_anchor.get("offset", 0.0))
		var source_id := str(source_anchor.get("id", "anchor"))
		for target_anchor_variant in target_anchors:
			if target_anchor_variant is not Dictionary:
				continue
			var target_anchor := target_anchor_variant as Dictionary
			var target_value := float(target_anchor.get("value", 0.0))
			var target_id := str(target_anchor.get("id", "target"))
			var distance := absf(target_value - source_value)
			if distance < best_distance:
				best_distance = distance
				best_source_offset = source_offset
				best_source_id = source_id
				best_target_id = target_id
				best_target_value = target_value

	if best_distance <= threshold:
		return {
			"matched": true,
			"offset": best_source_offset,
			"lineValue": best_target_value,
			"hint": "%s→%s" % [best_source_id, best_target_id],
		}
	return {"matched": false}


func _set_guide_lines_visible(show_vertical: bool, vertical_x: float, show_horizontal: bool, horizontal_y: float) -> void:
	if _canvas_surface == null:
		return
	if _guide_vertical_line != null and is_instance_valid(_guide_vertical_line):
		_guide_vertical_line.visible = show_vertical
		if show_vertical:
			var x := clampf(vertical_x - 1.0, 0.0, maxf(0.0, _canvas_surface.size.x - 2.0))
			_guide_vertical_line.position = Vector2(x, 0.0)
			_guide_vertical_line.size = Vector2(2.0, _canvas_surface.size.y)
	if _guide_horizontal_line != null and is_instance_valid(_guide_horizontal_line):
		_guide_horizontal_line.visible = show_horizontal
		if show_horizontal:
			var y := clampf(horizontal_y - 1.0, 0.0, maxf(0.0, _canvas_surface.size.y - 2.0))
			_guide_horizontal_line.position = Vector2(0.0, y)
			_guide_horizontal_line.size = Vector2(_canvas_surface.size.x, 2.0)


func _set_snap_feedback(note: String) -> void:
	if _canvas_feedback_label == null or not is_instance_valid(_canvas_feedback_label):
		return
	var normalized_note := note.strip_edges()
	if normalized_note == "":
		_canvas_feedback_label.text = "Snap hint: -"
		_canvas_feedback_label.modulate = Color(0.78, 0.86, 0.96, 0.90)
		return
	_canvas_feedback_label.text = "Snap hint: %s" % normalized_note
	_canvas_feedback_label.modulate = Color(0.98, 0.88, 0.58, 0.96)


func _set_status_note(note: String) -> void:
	_status_note = note.strip_edges()
	_refresh_state_label()


func _clear_status_note() -> void:
	if _status_note == "":
		return
	_status_note = ""
	_refresh_state_label()


func save_layout() -> void:
	_save_layout_to_storage()


func load_layout() -> void:
	_load_layout_from_storage()


func _component_definition(component_id: String) -> Dictionary:
	if COMPONENT_LIBRARY.has(component_id):
		return COMPONENT_LIBRARY[component_id] as Dictionary
	return {}


func _default_component_state(component_id: String) -> Dictionary:
	match component_id:
		"province_summary":
			return {
				"headline": "Province Summary",
				"summaryLine": "Canvas sample: summary component",
			}
		"province_roster":
			return {
				"headline": "Province Roster",
				"summaryLine": "Canvas sample: roster component",
			}
		"province_focus":
			return {
				"headline": "Province Focus",
				"cameraStateText": "Canvas sample mode",
				"storyNavigation": {
					"targetStoryId": "",
					"buttonLabel": "Navigation disabled",
					"buttonHint": "Canvas story local interaction.",
				},
			}
		_:
			return {}


func _next_spawn_position(item_size: Vector2) -> Vector2:
	var column := _spawn_cursor % 3
	var row := int(_spawn_cursor / 3)
	_spawn_cursor += 1
	var candidate := Vector2(24.0 + float(column) * 34.0, 24.0 + float(row) * 28.0)
	return _clamp_to_canvas(candidate, item_size)


func _clamp_to_canvas(position_value: Vector2, item_size: Vector2) -> Vector2:
	if _canvas_surface == null:
		return position_value
	var canvas_size := _canvas_logical_size()
	var max_x: float = maxf(0.0, canvas_size.x - item_size.x)
	var max_y: float = maxf(0.0, canvas_size.y - item_size.y)
	return Vector2(clamp(position_value.x, 0.0, max_x), clamp(position_value.y, 0.0, max_y))


func _set_mouse_filter_recursive(node: Node, mouse_filter_value: int) -> void:
	if node is Control:
		var control := node as Control
		control.mouse_filter = mouse_filter_value
	for child in node.get_children():
		_set_mouse_filter_recursive(child, mouse_filter_value)
