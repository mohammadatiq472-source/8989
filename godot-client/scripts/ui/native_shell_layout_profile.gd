extends Resource
class_name NativeShellLayoutProfile

@export var top_strip_offset_left: float = 16.0
@export var top_strip_offset_top: float = 8.0
@export var top_strip_offset_right: float = -16.0
@export var top_strip_offset_bottom: float = 58.0
@export var top_margin_left: int = 8
@export var top_margin_top: int = 4
@export var top_margin_right: int = 8
@export var top_margin_bottom: int = 4
@export var top_row_separation: int = 5
@export var top_actions_separation: int = 4
@export var premium_currency_row_separation: int = 4

@export var left_rail_offset_left: float = 16.0
@export var left_rail_offset_top: float = 82.0
@export var left_rail_offset_right: float = 206.0
@export var left_rail_offset_bottom: float = 494.0
@export var troop_slot_scroll_min_height: int = 156

@export var right_context_offset_left: float = -334.0
@export var right_context_offset_top: float = 102.0
@export var right_context_offset_right: float = -18.0
@export var right_context_offset_bottom: float = 584.0
@export var right_margin_left: int = 12
@export var right_margin_top: int = 12
@export var right_margin_right: int = 12
@export var right_margin_bottom: int = 12
@export var right_column_separation: int = 10
@export var right_context_slot_list_separation: int = 6
@export var context_body_min_height: int = 88
@export var context_slot_min_height: int = 28

@export var center_stage_offset_left: float = -168.0
@export var center_stage_offset_top: float = -36.0
@export var center_stage_offset_right: float = 168.0
@export var center_stage_offset_bottom: float = 40.0
@export var stage_margin_left: int = 5
@export var stage_margin_top: int = 3
@export var stage_margin_right: int = 5
@export var stage_margin_bottom: int = 3
@export var stage_column_separation: int = 2
@export var city_entry_grid_h_separation: int = 3
@export var city_entry_grid_v_separation: int = 3

@export var bottom_nav_offset_left: float = 16.0
@export var bottom_nav_offset_top: float = -108.0
@export var bottom_nav_offset_right: float = 578.0
@export var bottom_nav_offset_bottom: float = -16.0
@export var bottom_margin_left: int = 10
@export var bottom_margin_top: int = 8
@export var bottom_margin_right: int = 10
@export var bottom_margin_bottom: int = 8
@export var bottom_row_separation: int = 6
@export var main_nav_separation: int = 4
@export var utility_row_separation: int = 3
@export var nav_buttons_separation: int = 4

@export var premium_currency_row_min_size: Vector2 = Vector2(146, 0)
@export var jade_currency_badge_min_size: Vector2 = Vector2(58, 0)
@export var copper_currency_badge_min_size: Vector2 = Vector2(70, 0)
@export var mode_toggle_button_min_size: Vector2 = Vector2(78, 0)
@export var city_entry_button_min_size: Vector2 = Vector2(56, 26)
@export var utility_mail_button_min_size: Vector2 = Vector2(64, 0)
@export var utility_activity_button_min_size: Vector2 = Vector2(64, 0)
@export var utility_help_button_min_size: Vector2 = Vector2(56, 0)
@export var main_nav_button_min_size: Vector2 = Vector2(76, 42)
@export var under_construction_button_min_size: Vector2 = Vector2(110, 0)

func to_dictionary() -> Dictionary:
	return {
		"top_strip_offset_left": top_strip_offset_left,
		"top_strip_offset_top": top_strip_offset_top,
		"top_strip_offset_right": top_strip_offset_right,
		"top_strip_offset_bottom": top_strip_offset_bottom,
		"top_margin_left": top_margin_left,
		"top_margin_top": top_margin_top,
		"top_margin_right": top_margin_right,
		"top_margin_bottom": top_margin_bottom,
		"top_row_separation": top_row_separation,
		"top_actions_separation": top_actions_separation,
		"premium_currency_row_separation": premium_currency_row_separation,
		"left_rail_offset_left": left_rail_offset_left,
		"left_rail_offset_top": left_rail_offset_top,
		"left_rail_offset_right": left_rail_offset_right,
		"left_rail_offset_bottom": left_rail_offset_bottom,
		"troop_slot_scroll_min_height": troop_slot_scroll_min_height,
		"right_context_offset_left": right_context_offset_left,
		"right_context_offset_top": right_context_offset_top,
		"right_context_offset_right": right_context_offset_right,
		"right_context_offset_bottom": right_context_offset_bottom,
		"right_margin_left": right_margin_left,
		"right_margin_top": right_margin_top,
		"right_margin_right": right_margin_right,
		"right_margin_bottom": right_margin_bottom,
		"right_column_separation": right_column_separation,
		"right_context_slot_list_separation": right_context_slot_list_separation,
		"context_body_min_height": context_body_min_height,
		"context_slot_min_height": context_slot_min_height,
		"center_stage_offset_left": center_stage_offset_left,
		"center_stage_offset_top": center_stage_offset_top,
		"center_stage_offset_right": center_stage_offset_right,
		"center_stage_offset_bottom": center_stage_offset_bottom,
		"stage_margin_left": stage_margin_left,
		"stage_margin_top": stage_margin_top,
		"stage_margin_right": stage_margin_right,
		"stage_margin_bottom": stage_margin_bottom,
		"stage_column_separation": stage_column_separation,
		"city_entry_grid_h_separation": city_entry_grid_h_separation,
		"city_entry_grid_v_separation": city_entry_grid_v_separation,
		"bottom_nav_offset_left": bottom_nav_offset_left,
		"bottom_nav_offset_top": bottom_nav_offset_top,
		"bottom_nav_offset_right": bottom_nav_offset_right,
		"bottom_nav_offset_bottom": bottom_nav_offset_bottom,
		"bottom_margin_left": bottom_margin_left,
		"bottom_margin_top": bottom_margin_top,
		"bottom_margin_right": bottom_margin_right,
		"bottom_margin_bottom": bottom_margin_bottom,
		"bottom_row_separation": bottom_row_separation,
		"main_nav_separation": main_nav_separation,
		"utility_row_separation": utility_row_separation,
		"nav_buttons_separation": nav_buttons_separation,
		"premium_currency_row_min_size": premium_currency_row_min_size,
		"jade_currency_badge_min_size": jade_currency_badge_min_size,
		"copper_currency_badge_min_size": copper_currency_badge_min_size,
		"mode_toggle_button_min_size": mode_toggle_button_min_size,
		"city_entry_button_min_size": city_entry_button_min_size,
		"utility_mail_button_min_size": utility_mail_button_min_size,
		"utility_activity_button_min_size": utility_activity_button_min_size,
		"utility_help_button_min_size": utility_help_button_min_size,
		"main_nav_button_min_size": main_nav_button_min_size,
		"under_construction_button_min_size": under_construction_button_min_size,
	}
