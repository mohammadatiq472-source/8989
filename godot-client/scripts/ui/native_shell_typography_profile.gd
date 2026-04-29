extends Resource
class_name NativeShellTypographyProfile

@export var profile_badge_font_size: int = 13
@export var resource_strip_font_size: int = 10
@export var currency_badge_font_size: int = 9
@export var right_context_title_font_size: int = 18
@export var right_context_body_font_size: int = 14
@export var right_context_slot_font_size: int = 10
@export var center_mode_badge_font_size: int = 10
@export var center_stage_title_font_size: int = 16
@export var center_stage_body_font_size: int = 10
@export var center_city_focus_font_size: int = 8
@export var center_entry_button_font_size: int = 9
@export var center_entry_status_font_size: int = 8
@export var center_mode_hint_font_size: int = 13
@export var utility_button_font_size: int = 10
@export var main_nav_button_font_size: int = 11
@export var world_entry_hint_font_size: int = 9

func to_dictionary() -> Dictionary:
	return {
		"profile_badge_font_size": profile_badge_font_size,
		"resource_strip_font_size": resource_strip_font_size,
		"currency_badge_font_size": currency_badge_font_size,
		"right_context_title_font_size": right_context_title_font_size,
		"right_context_body_font_size": right_context_body_font_size,
		"right_context_slot_font_size": right_context_slot_font_size,
		"center_mode_badge_font_size": center_mode_badge_font_size,
		"center_stage_title_font_size": center_stage_title_font_size,
		"center_stage_body_font_size": center_stage_body_font_size,
		"center_city_focus_font_size": center_city_focus_font_size,
		"center_entry_button_font_size": center_entry_button_font_size,
		"center_entry_status_font_size": center_entry_status_font_size,
		"center_mode_hint_font_size": center_mode_hint_font_size,
		"utility_button_font_size": utility_button_font_size,
		"main_nav_button_font_size": main_nav_button_font_size,
		"world_entry_hint_font_size": world_entry_hint_font_size,
	}
