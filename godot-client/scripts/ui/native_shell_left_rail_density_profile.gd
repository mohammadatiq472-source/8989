extends Resource
class_name NativeShellLeftRailDensityProfile

@export var outer_margin: int = 6
@export var section_gap: int = 1
@export var task_header_gap: int = 1
@export var card_list_gap: int = 1
@export var quick_link_gap: int = 1
@export var task_icon_min_size: Vector2 = Vector2(14, 14)
@export var task_title_font_size: int = 11
@export var task_body_min_height: int = 18
@export var primary_token_font_size: int = 8
@export var section_label_min_height: int = 12
@export var section_title_font_size: int = 7
@export var summary_row_min_height: int = 13
@export var secondary_token_font_size: int = 6
@export var quick_link_min_height: int = 18
@export var quick_link_font_size: int = 7
@export var title_color: Color = Color(0.89, 0.84, 0.73, 0.96)
@export var token_color: Color = Color(0.92, 0.90, 0.84, 0.98)
@export var secondary_color: Color = Color(0.74, 0.73, 0.69, 0.94)

func to_dictionary() -> Dictionary:
	return {
		"outer_margin": outer_margin,
		"section_gap": section_gap,
		"task_header_gap": task_header_gap,
		"card_list_gap": card_list_gap,
		"quick_link_gap": quick_link_gap,
		"task_icon_min_size": task_icon_min_size,
		"task_title_font_size": task_title_font_size,
		"task_body_min_height": task_body_min_height,
		"primary_token_font_size": primary_token_font_size,
		"section_label_min_height": section_label_min_height,
		"section_title_font_size": section_title_font_size,
		"summary_row_min_height": summary_row_min_height,
		"secondary_token_font_size": secondary_token_font_size,
		"quick_link_min_height": quick_link_min_height,
		"quick_link_font_size": quick_link_font_size,
		"title_color": title_color,
		"token_color": token_color,
		"secondary_color": secondary_color,
	}
