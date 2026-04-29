extends PanelContainer
class_name PanelTabStrip

signal tab_selected(tab_id: String)

@export var empty_state_text: String = "暂无标签"
@export var tab_button_min_width: float = 120.0
@export var tab_button_max_width: float = 260.0
@export var tab_button_text_size: int = 14

const COMPACT_TAB_BUTTON_MIN_WIDTH := 92.0
const COMPACT_TAB_BUTTON_TEXT_SIZE := 13

@onready var _tabs_margin: MarginContainer = $TabsMargin
@onready var _tabs_row: HBoxContainer = $TabsMargin/TabsRow
@onready var _empty_state_label: Label = $TabsMargin/EmptyHint

var _tab_specs: Array = []
var _tab_buttons: Dictionary = {}
var _active_tab_id: String = ""
var _button_group: ButtonGroup = ButtonGroup.new()
var _compact_layout := false

func _ready() -> void:
	_rebuild_tabs()
	_apply_layout_metrics()

func set_tab_settings(tab_settings: Array) -> void:
	_tab_specs = tab_settings.duplicate(true)
	if is_node_ready():
		_rebuild_tabs()

func set_tabs(tab_settings: Array) -> void:
	set_tab_settings(tab_settings)

func clear_tabs() -> void:
	_tab_specs = []
	_active_tab_id = ""
	if is_node_ready():
		_rebuild_tabs()

func get_active_tab_id() -> String:
	return _active_tab_id

func has_tabs() -> bool:
	return not _tab_buttons.is_empty()

func should_show_strip() -> bool:
	return has_tabs()

func set_compact_layout(value: bool) -> void:
	if _compact_layout == value:
		return
	_compact_layout = value
	if is_node_ready():
		_apply_layout_metrics()

func set_active_tab(tab_id: String) -> void:
	if tab_id.is_empty() or not _tab_buttons.has(tab_id):
		return
	_active_tab_id = tab_id
	for key in _tab_buttons.keys():
		var button := _tab_buttons[key] as Button
		if button == null:
			continue
		button.button_pressed = key == _active_tab_id

func _rebuild_tabs() -> void:
	_clear_tab_buttons()
	_button_group = ButtonGroup.new()
	var first_enabled_tab_id := ""
	for raw_spec in _tab_specs:
		var spec: Dictionary = raw_spec if raw_spec is Dictionary else {}
		var tab_id := str(spec.get("id", "")).strip_edges()
		if tab_id.is_empty():
			continue
		var button := _create_tab_button(spec)
		_tab_buttons[tab_id] = button
		_tabs_row.add_child(button)
		if first_enabled_tab_id.is_empty() and not button.disabled:
			first_enabled_tab_id = tab_id
	if _active_tab_id.is_empty() or not _tab_buttons.has(_active_tab_id):
		_active_tab_id = first_enabled_tab_id
	set_active_tab(_active_tab_id)
	_apply_layout_metrics()
	_refresh_empty_state()

func _create_tab_button(spec: Dictionary) -> Button:
	var tab_id := str(spec.get("id", "")).strip_edges()
	var tab_label := str(spec.get("label", tab_id))
	var tab_tooltip := str(spec.get("tooltip", ""))
	var enabled := bool(spec.get("enabled", true))
	var selected := bool(spec.get("selected", false))

	var button := Button.new()
	button.name = "Tab_%s" % tab_id
	button.text = tab_label
	button.tooltip_text = tab_tooltip
	button.toggle_mode = true
	button.button_group = _button_group
	button.button_pressed = selected
	button.disabled = not enabled
	button.custom_minimum_size = Vector2(_current_tab_button_min_width(), 0.0)
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.size_flags_stretch_ratio = 1.0
	button.focus_mode = Control.FOCUS_ALL
	button.add_theme_font_size_override("font_size", _current_tab_button_text_size())
	button.pressed.connect(func() -> void:
		_on_tab_pressed(tab_id)
	)
	if selected and enabled:
		_active_tab_id = tab_id
	return button

func _on_tab_pressed(tab_id: String) -> void:
	if tab_id.is_empty() or not _tab_buttons.has(tab_id):
		return
	_active_tab_id = tab_id
	set_active_tab(tab_id)
	tab_selected.emit(tab_id)

func _clear_tab_buttons() -> void:
	if _tabs_row == null:
		return
	for child in _tabs_row.get_children():
		child.queue_free()
	_tab_buttons.clear()

func _refresh_empty_state() -> void:
	if _empty_state_label == null or _tabs_row == null:
		return
	var tabs_present := has_tabs()
	_empty_state_label.visible = not tabs_present
	_tabs_row.visible = tabs_present
	_empty_state_label.text = empty_state_text

func _apply_layout_metrics() -> void:
	if _tabs_margin != null:
		var horizontal_margin := 6 if _compact_layout else 10
		_tabs_margin.add_theme_constant_override("margin_left", horizontal_margin)
		_tabs_margin.add_theme_constant_override("margin_right", horizontal_margin)
		_tabs_margin.add_theme_constant_override("margin_top", 8)
		_tabs_margin.add_theme_constant_override("margin_bottom", 8)
	if _tabs_row != null:
		_tabs_row.add_theme_constant_override("separation", 6 if _compact_layout else 8)
	for raw_button in _tab_buttons.values():
		var button := raw_button as Button
		if button == null:
			continue
		button.custom_minimum_size = Vector2(_current_tab_button_min_width(), 0.0)
		button.add_theme_font_size_override("font_size", _current_tab_button_text_size())

func _current_tab_button_min_width() -> float:
	return COMPACT_TAB_BUTTON_MIN_WIDTH if _compact_layout else tab_button_min_width

func _current_tab_button_text_size() -> int:
	return COMPACT_TAB_BUTTON_TEXT_SIZE if _compact_layout else tab_button_text_size
