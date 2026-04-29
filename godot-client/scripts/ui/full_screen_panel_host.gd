extends PanelContainer
class_name FullScreenPanelHost

signal back_requested
signal close_requested
signal tab_selected(tab_id: String)

@export var panel_title: String = "功能面板"
@export var back_button_label: String = "返回"
@export var close_button_label: String = "关闭"
@export_multiline var empty_state_text: String = "请选择一个功能入口。"
@export var empty_state_font_size: int = 15
@export var title_font_size: int = 24

const HEADER_BACK_BUTTON_SIZE := Vector2(172, 72)
const HEADER_CLOSE_BUTTON_SIZE := Vector2(112, 52)
const HEADER_BUTTON_FONT_SIZE := 24
const HEADER_CLOSE_BUTTON_FONT_SIZE := 22
const COMPACT_HEADER_WIDTH_BREAKPOINT := 760.0

@onready var _body_margin: MarginContainer = $BodyMargin
@onready var _header_row: HBoxContainer = $BodyMargin/BodyVBox/HeaderRow
@onready var _title_label: Label = $BodyMargin/BodyVBox/HeaderRow/TitleLabel
@onready var _back_button: Button = $BodyMargin/BodyVBox/HeaderRow/BackButton
@onready var _close_button: Button = $BodyMargin/BodyVBox/HeaderRow/CloseButton
@onready var _tab_strip: Control = $BodyMargin/BodyVBox/TabStrip
@onready var _content_frame: PanelContainer = $BodyMargin/BodyVBox/ContentFrame
@onready var _content_margin: MarginContainer = $BodyMargin/BodyVBox/ContentFrame/ContentMargin
@onready var _empty_state_label: Label = $BodyMargin/BodyVBox/ContentFrame/ContentMargin/ContentVBox/PlaceholderLabel
@onready var _content_host: Control = $BodyMargin/BodyVBox/ContentFrame/ContentMargin/ContentVBox/ContentHost

var _content_node: Node = null

func _ready() -> void:
	_back_button.pressed.connect(_on_back_pressed)
	_close_button.pressed.connect(_on_close_pressed)
	if _tab_strip != null and _tab_strip.has_signal("tab_selected"):
		var tab_callback := Callable(self, "_on_tab_selected")
		if not _tab_strip.is_connected("tab_selected", tab_callback):
			_tab_strip.connect("tab_selected", tab_callback)
	var viewport := get_viewport()
	if viewport != null:
		var resize_callback := Callable(self, "_on_viewport_size_changed")
		if not viewport.size_changed.is_connected(resize_callback):
			viewport.size_changed.connect(resize_callback)
	_refresh_view()

func set_panel_title(value: String) -> void:
	panel_title = value
	_refresh_view()

func set_back_button_label(value: String) -> void:
	back_button_label = value
	_refresh_view()

func set_close_button_label(value: String) -> void:
	close_button_label = value
	_refresh_view()

func set_empty_state_text(value: String) -> void:
	empty_state_text = value
	_refresh_empty_state()

func set_title_font_size(value: int) -> void:
	title_font_size = value
	_refresh_view()

func set_empty_state_font_size(value: int) -> void:
	empty_state_font_size = value
	_refresh_empty_state()

func set_header_visible(value: bool) -> void:
	if _header_row != null:
		_header_row.visible = value

func set_body_margins(left: int, top: int, right: int, bottom: int) -> void:
	if _body_margin == null:
		return
	_body_margin.add_theme_constant_override("margin_left", left)
	_body_margin.add_theme_constant_override("margin_top", top)
	_body_margin.add_theme_constant_override("margin_right", right)
	_body_margin.add_theme_constant_override("margin_bottom", bottom)

func set_content_margins(left: int, top: int, right: int, bottom: int) -> void:
	if _content_margin == null:
		return
	_content_margin.add_theme_constant_override("margin_left", left)
	_content_margin.add_theme_constant_override("margin_top", top)
	_content_margin.add_theme_constant_override("margin_right", right)
	_content_margin.add_theme_constant_override("margin_bottom", bottom)

func set_content_frame_transparent(value: bool) -> void:
	if _content_frame == null:
		return
	if value:
		var style := StyleBoxFlat.new()
		style.bg_color = Color(0.0, 0.0, 0.0, 0.0)
		style.border_color = Color(0.0, 0.0, 0.0, 0.0)
		_content_frame.add_theme_stylebox_override("panel", style)
	else:
		_content_frame.remove_theme_stylebox_override("panel")

func set_tab_settings(tab_settings: Array) -> void:
	if _tab_strip == null:
		return
	_tab_strip.call("set_tab_settings", tab_settings)
	_tab_strip.visible = bool(_tab_strip.call("should_show_strip"))

func set_tabs(tab_settings: Array) -> void:
	set_tab_settings(tab_settings)

func set_active_tab(tab_id: String) -> void:
	if _tab_strip != null:
		_tab_strip.call("set_active_tab", tab_id)

func get_active_tab_id() -> String:
	if _tab_strip == null:
		return ""
	return str(_tab_strip.call("get_active_tab_id"))

func set_content_node(node: Node) -> void:
	_clear_content_node()
	_content_node = node
	if _content_node == null:
		_refresh_empty_state()
		return
	var parent := _content_node.get_parent()
	if parent != null:
		parent.remove_child(_content_node)
	_content_host.add_child(_content_node)
	if _content_node is Control:
		var control := _content_node as Control
		control.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		control.size_flags_vertical = Control.SIZE_EXPAND_FILL
		control.set_anchors_preset(Control.PRESET_FULL_RECT)
		control.offset_left = 0.0
		control.offset_top = 0.0
		control.offset_right = 0.0
		control.offset_bottom = 0.0
		_content_host.visible = true
	_empty_state_label.visible = false

func clear_content() -> void:
	_clear_content_node()
	_content_node = null
	_refresh_empty_state()

func show_empty_state(value: String = "") -> void:
	if value.strip_edges() != "":
		empty_state_text = value
	_clear_content_node()
	_content_node = null
	_refresh_empty_state()

func focus_first_action() -> void:
	if _back_button != null and not _back_button.disabled:
		_back_button.grab_focus()
		return
	if _tab_strip != null and _tab_strip.visible and _tab_strip.get_active_tab_id() != "":
		_tab_strip.grab_focus()
		return
	if _close_button != null and not _close_button.disabled:
		_close_button.grab_focus()

func _refresh_view() -> void:
	_title_label.text = panel_title
	_title_label.add_theme_font_size_override("font_size", title_font_size)
	_title_label.add_theme_color_override("font_color", Color(0.96, 0.92, 0.80, 1.0))
	_title_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_title_label.custom_minimum_size = Vector2.ZERO
	_back_button.text = back_button_label
	_close_button.text = close_button_label
	_apply_panel_surface_style()
	_apply_header_button_layout()
	_refresh_empty_state()

func _apply_panel_surface_style() -> void:
	add_theme_stylebox_override(
		"panel",
		_make_surface_panel_style(Color(0.058, 0.048, 0.040, 0.94), Color(0.0, 0.0, 0.0, 0.0), 0, 0)
	)
	if _content_frame != null:
		_content_frame.add_theme_stylebox_override(
			"panel",
			_make_surface_panel_style(Color(0.092, 0.078, 0.064, 0.92), Color(0.50, 0.42, 0.28, 0.38), 1, 6)
		)

func _apply_header_button_layout() -> void:
	var compact_layout := _uses_compact_header_layout()
	if _header_row != null:
		_header_row.add_theme_constant_override("separation", 8 if compact_layout else 14)
	if _title_label != null:
		_title_label.visible = not compact_layout
	if _tab_strip != null and _tab_strip.has_method("set_compact_layout"):
		_tab_strip.call("set_compact_layout", compact_layout)
	if _back_button != null:
		_back_button.custom_minimum_size = HEADER_BACK_BUTTON_SIZE
		_back_button.focus_mode = Control.FOCUS_NONE
		_back_button.add_theme_font_size_override("font_size", HEADER_BUTTON_FONT_SIZE)
		_back_button.add_theme_stylebox_override("normal", _make_header_button_style(Color(0.09, 0.08, 0.06, 0.92), Color(0.78, 0.62, 0.30, 0.74), 1))
		_back_button.add_theme_stylebox_override("hover", _make_header_button_style(Color(0.15, 0.12, 0.08, 0.96), Color(0.88, 0.70, 0.34, 0.92), 1))
		_back_button.add_theme_stylebox_override("pressed", _make_header_button_style(Color(0.18, 0.14, 0.08, 0.98), Color(0.95, 0.76, 0.36, 1.0), 2))
		_back_button.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
		_back_button.add_theme_color_override("font_color", Color(0.98, 0.94, 0.82, 1.0))
		_back_button.add_theme_color_override("font_hover_color", Color(1.0, 0.96, 0.84, 1.0))
	if _close_button != null:
		_close_button.custom_minimum_size = HEADER_CLOSE_BUTTON_SIZE
		_close_button.focus_mode = Control.FOCUS_NONE
		_close_button.add_theme_font_size_override("font_size", HEADER_CLOSE_BUTTON_FONT_SIZE)
		_close_button.add_theme_stylebox_override("normal", _make_header_button_style(Color(0.22, 0.06, 0.05, 0.94), Color(0.86, 0.22, 0.16, 0.86), 1))
		_close_button.add_theme_stylebox_override("hover", _make_header_button_style(Color(0.30, 0.07, 0.05, 0.98), Color(1.0, 0.30, 0.22, 1.0), 1))
		_close_button.add_theme_stylebox_override("pressed", _make_header_button_style(Color(0.16, 0.04, 0.03, 0.98), Color(1.0, 0.36, 0.26, 1.0), 2))
		_close_button.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
		_close_button.add_theme_color_override("font_color", Color(1.0, 0.86, 0.80, 1.0))
		_close_button.add_theme_color_override("font_hover_color", Color(1.0, 0.92, 0.86, 1.0))

func _uses_compact_header_layout() -> bool:
	var viewport := get_viewport()
	if viewport == null:
		return false
	return viewport.get_visible_rect().size.x <= COMPACT_HEADER_WIDTH_BREAKPOINT

func _on_viewport_size_changed() -> void:
	_apply_header_button_layout()

func _make_header_button_style(bg_color: Color, border_color: Color, border_width: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = bg_color
	style.border_color = border_color
	style.set_border_width_all(border_width)
	style.set_corner_radius_all(6)
	style.content_margin_left = 16
	style.content_margin_top = 10
	style.content_margin_right = 16
	style.content_margin_bottom = 10
	return style

func _make_surface_panel_style(bg_color: Color, border_color: Color, border_width: int, corner_radius: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = bg_color
	style.border_color = border_color
	style.set_border_width_all(border_width)
	style.set_corner_radius_all(corner_radius)
	return style

func _refresh_empty_state() -> void:
	_empty_state_label.text = empty_state_text
	_empty_state_label.add_theme_font_size_override("font_size", empty_state_font_size)
	var has_content := _content_node != null
	_empty_state_label.visible = not has_content
	_content_host.visible = has_content
	if _tab_strip != null:
		_tab_strip.visible = bool(_tab_strip.call("should_show_strip"))

func _clear_content_node() -> void:
	if _content_node == null:
		return
	if _content_node.get_parent() == _content_host:
		_content_host.remove_child(_content_node)
	_content_node = null

func _on_back_pressed() -> void:
	back_requested.emit()

func _on_close_pressed() -> void:
	close_requested.emit()

func _on_tab_selected(tab_id: String) -> void:
	tab_selected.emit(tab_id)
