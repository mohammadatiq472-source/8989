extends Resource
class_name NativeShellCityGridProfile

@export var schema_version: int = 1
@export var layout_id: String = "main_city_5x5_visual_3x3_active"
@export var readable_name: String = "main city 5x5 visual shell / 3x3 active core"
@export var visual_grid: Dictionary = {
	"columns": 5,
	"rows": 5,
	"cell_size": Vector2(42, 24),
	"preview_size": Vector2(300, 180),
	"meaning": "visual_shell",
}
@export var city_grid_projection: Dictionary = {
	"type": "isometric_2_to_1",
	"tile_width": 60.0,
	"tile_height": 30.0,
	"origin": Vector2(150, 36),
	"elevation_scale": 1.0,
	"anchor_rule": "center",
	"z_sort_rule": {
		"type": "grid_sum_then_x",
		"base_z_index": 10,
		"sort_step": 10,
		"x_step": 1,
		"flat_layers": ["foundation", "continuous_city_wall_ring"],
		"layer_offsets": {
			"foundation": -10,
			"continuous_city_wall_ring": -8,
			"breathing": 0,
			"reserved_plot": 10,
			"city_gate": 18,
			"corner_tower": 18,
			"active_building": 20,
		},
	},
}
@export var active_grid: Dictionary = {
	"columns": 3,
	"rows": 3,
	"origin_slot": Vector2i(1, 1),
	"meaning": "active_core",
}
@export var asset_contract: Dictionary = {
	"tile_footprint_px": Vector2i(240, 240),
	"asset_canvas_px": Vector2i(384, 384),
	"asset_anchor": "bottom-center footprint center",
}
@export var debug_labels_enabled_by_default: bool = false
@export var asset_slots: Dictionary = {}
@export var active_core_slots: Array = []
@export var visual_shell: Dictionary = {}
@export var excluded_from_first_phase_core: Array = []

func to_dictionary() -> Dictionary:
	return {
		"schema_version": schema_version,
		"layout_id": layout_id,
		"readable_name": readable_name,
		"visual_grid": visual_grid.duplicate(true),
		"city_grid_projection": city_grid_projection.duplicate(true),
		"active_grid": active_grid.duplicate(true),
		"asset_contract": asset_contract.duplicate(true),
		"debug_labels_enabled_by_default": debug_labels_enabled_by_default,
		"asset_slots": asset_slots.duplicate(true),
		"active_core_slots": active_core_slots.duplicate(true),
		"visual_shell": visual_shell.duplicate(true),
		"excluded_from_first_phase_core": excluded_from_first_phase_core.duplicate(true),
	}

func get_active_core_slots() -> Array:
	return active_core_slots.duplicate(true)

func get_center_slot() -> Dictionary:
	for slot_variant in active_core_slots:
		if slot_variant is Dictionary:
			var slot := slot_variant as Dictionary
			if slot.get("slot_id", "") == "core_center":
				return slot.duplicate(true)
	return {}

func get_visual_shell() -> Dictionary:
	return visual_shell.duplicate(true)

func get_asset_slots() -> Dictionary:
	return asset_slots.duplicate(true)
