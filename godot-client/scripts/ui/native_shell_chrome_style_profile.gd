extends Resource
class_name NativeShellChromeStyleProfile

@export var bg_color: Color = Color(0.0, 0.0, 0.0, 0.0)
@export var border_color: Color = Color(0.0, 0.0, 0.0, 0.0)
@export var radius: int = 0
@export var border_width: int = 0
@export var margin_left: int = 0
@export var margin_right: int = 0
@export var margin_top: int = 0
@export var margin_bottom: int = 0
@export var hover_lighten: float = 0.05
@export var pressed_darken: float = 0.05
@export var font_color: Color = Color(1.0, 1.0, 1.0, 1.0)
@export var font_hover_color: Color = Color(1.0, 1.0, 1.0, 1.0)
@export var font_pressed_color: Color = Color(1.0, 1.0, 1.0, 1.0)
@export var font_disabled_color: Color = Color(1.0, 1.0, 1.0, 0.7)
@export var alignment: int = HORIZONTAL_ALIGNMENT_CENTER
@export var use_hover_bg_color: bool = false
@export var hover_bg_color: Color = Color(0.0, 0.0, 0.0, 0.0)
@export var use_pressed_bg_color: bool = false
@export var pressed_bg_color: Color = Color(0.0, 0.0, 0.0, 0.0)
@export var use_font_size: bool = false
@export var font_size: int = 0
@export var use_min_size: bool = false
@export var min_size: Vector2 = Vector2.ZERO
@export var use_modulate: bool = false
@export var modulate_color: Color = Color(1.0, 1.0, 1.0, 1.0)
@export var use_flat: bool = false
@export var flat: bool = false

func to_dictionary() -> Dictionary:
	var profile := {
		"bg_color": bg_color,
		"border_color": border_color,
		"radius": radius,
		"border_width": border_width,
		"margin_left": margin_left,
		"margin_right": margin_right,
		"margin_top": margin_top,
		"margin_bottom": margin_bottom,
		"hover_lighten": hover_lighten,
		"pressed_darken": pressed_darken,
		"font_color": font_color,
		"font_hover_color": font_hover_color,
		"font_pressed_color": font_pressed_color,
		"font_disabled_color": font_disabled_color,
		"alignment": alignment,
	}
	if use_hover_bg_color:
		profile["hover_bg_color"] = hover_bg_color
	if use_pressed_bg_color:
		profile["pressed_bg_color"] = pressed_bg_color
	if use_font_size:
		profile["font_size"] = font_size
	if use_min_size:
		profile["min_size"] = min_size
	if use_modulate:
		profile["modulate"] = modulate_color
	if use_flat:
		profile["flat"] = flat
	return profile
