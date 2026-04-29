extends RefCounted
class_name FormalPackCloseButton

const CLOSE_BUTTON_SIZE := Vector2(112, 52)
const CLOSE_BUTTON_FONT_SIZE := 22

static func build(label: String = "关闭", pressed_callback: Callable = Callable()) -> Button:
	var button := Button.new()
	button.name = "CloseButton"
	button.text = label
	button.custom_minimum_size = CLOSE_BUTTON_SIZE
	button.focus_mode = Control.FOCUS_NONE
	button.add_theme_font_size_override("font_size", CLOSE_BUTTON_FONT_SIZE)
	button.add_theme_stylebox_override("normal", _style(Color(0.22, 0.06, 0.05, 0.94), Color(0.86, 0.22, 0.16, 0.86), 1))
	button.add_theme_stylebox_override("hover", _style(Color(0.30, 0.07, 0.05, 0.98), Color(1.0, 0.30, 0.22, 1.0), 1))
	button.add_theme_stylebox_override("pressed", _style(Color(0.16, 0.04, 0.03, 0.98), Color(1.0, 0.36, 0.26, 1.0), 2))
	button.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	button.add_theme_color_override("font_color", Color(1.0, 0.86, 0.80, 1.0))
	button.add_theme_color_override("font_hover_color", Color(1.0, 0.92, 0.86, 1.0))
	if pressed_callback.is_valid():
		button.pressed.connect(pressed_callback)
	return button

static func _style(bg_color: Color, border_color: Color, border_width: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = bg_color
	style.border_color = border_color
	style.border_width_left = border_width
	style.border_width_top = border_width
	style.border_width_right = border_width
	style.border_width_bottom = border_width
	style.corner_radius_top_left = 6
	style.corner_radius_top_right = 6
	style.corner_radius_bottom_right = 6
	style.corner_radius_bottom_left = 6
	style.content_margin_left = 16
	style.content_margin_top = 10
	style.content_margin_right = 16
	style.content_margin_bottom = 10
	return style
