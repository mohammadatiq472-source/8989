extends Node2D

const FactionVisualsScript = preload("res://scripts/map/faction_visuals.gd")
const MAX_VISIBLE_TILE_DRAW_COUNT: int = 20000
const THEME_MAP_TMX_PATH: String = "res://assets/themes/slgclient/current/world/map.tmx"
const THEME_WORLD_ROOT: String = "res://assets/themes/slgclient/current/world"
const THEME_OVERLAY_MANIFEST_PATH: String = "res://assets/themes/slgclient/manifests/overlay_frames_manifest.json"
const THEME_WORLD_RESOURCE_ASSET_MANIFEST_PATH: String = "res://assets/themes/slgclient/current/world/resources/world_resource_assets_manifest_v1.json"
const THEME_WORLD_CELL_ASSET_MANIFEST_PATH: String = "res://assets/themes/slgclient/current/world/world_cell_assets_manifest_v1.json"
const THEME_WORLD_CELL_FOOTPRINT_MANIFEST_PATH: String = "res://assets/themes/slgclient/current/world/world_cell_footprint_manifest_v1.json"
const HUMAN_HOME_LABEL: String = "P"
const AI_HOME_LABEL: String = "AI"
const WORLD_CELL_FOOTPRINT_RESOURCE_1X1: String = "resource_1x1"
const WORLD_CELL_FOOTPRINT_PLAYER_CITY_3X3_INITIAL: String = "player_city_3x3_initial"
const WORLD_CELL_FOOTPRINT_AI_CITY_3X3_INITIAL: String = "ai_city_3x3_initial"
const WORLD_CELL_FOOTPRINT_SYSTEM_CITY_L03_L04_3X3: String = "system_city_l03_l04_3x3"
const WORLD_CELL_FOOTPRINT_SYSTEM_CITY_L05_L06_5X5: String = "system_city_l05_l06_5x5"
const WORLD_CELL_FOOTPRINT_SYSTEM_CITY_L07_L08_7X7: String = "system_city_l07_l08_7x7"
const WORLD_CELL_FOOTPRINT_SYSTEM_CITY_L09_9X9: String = "system_city_l09_9x9"
const WORLD_CELL_FOOTPRINT_PASS_1X1: String = "pass_1x1"
const WORLD_CELL_FOOTPRINT_FORT_1X1: String = "fort_1x1"
const WORLD_CELL_FOOTPRINT_DOCK_1X1: String = "dock_1x1"
const WORLD_CELL_FOOTPRINT_MOUNTAIN_BARRIER_1X1: String = "mountain_barrier_1x1"
const WORLD_CELL_FOOTPRINT_RIVER_CORRIDOR_1X1: String = "river_corridor_1x1"
const WORLD_CELL_RUNTIME_STRATEGY_CITY: String = "city"
const WORLD_CELL_RUNTIME_STRATEGY_NODE_DISPATCH: String = "node_dispatch"
const WORLD_CELL_PLACEMENT_ACTION_RESERVE_CELLS: String = "reserve_cells"
const WORLD_CELL_PLACEMENT_ACTION_BLOCK_RESOURCE_FILL: String = "block_resource_fill"
const WORLD_CELL_PLACEMENT_ACTION_BLOCK_FREE_CELL_BASE: String = "block_free_cell_base"
const WORLD_CELL_PLACEMENT_ACTION_BLOCK_RESOURCE_OVERLAY: String = "block_resource_overlay"
const WORLD_CELL_PLACEMENT_ACTION_BLOCK_MOVEMENT: String = "block_movement"
const WORLD_CELL_PLACEMENT_CONTEXT_EMPTY_RESOURCE_FILL: String = "empty_resource_fill"
const WORLD_CELL_PLACEMENT_CONTEXT_FREE_CELL_BASE: String = "free_cell_base"
const WORLD_CELL_PLACEMENT_CONTEXT_RESOURCE_OVERLAY: String = "resource_overlay"
const WORLD_CELL_PLACEMENT_CONTEXT_MOVEMENT: String = "movement"
const WORLD_CELL_PLACEMENT_CONTEXT_PREVIEW_NODE_PLACEMENT: String = "preview_node_placement"
const WORLD_CELL_PLACEMENT_POLICY_SOURCE_RESERVED_FOOTPRINT: String = "reserved_footprint"
const WORLD_CELL_PLACEMENT_POLICY_SOURCE_BACKEND_TILE: String = "backend_tile"
const WORLD_CELL_PLACEMENT_BLOCK_RULE_RESERVED_FOOTPRINT: String = "reserved_footprint"
const WORLD_CELL_PLACEMENT_BLOCK_RULE_PREVIEW_TILE: String = "preview_tile"
const WORLD_CELL_PLACEMENT_BLOCK_RULE_RESOURCE_OVERLAY: String = "resource_overlay"
const WORLD_CELL_PLACEMENT_BLOCK_RULE_BACKEND_TYPE: String = "backend_type"
const WORLD_CELL_PLACEMENT_BLOCK_RULE_BACKEND_TERRAIN: String = "backend_terrain"
const WORLD_CELL_PLACEMENT_BLOCK_RULE_POLICY_CONTEXT: String = "policy_context"
const WORLD_CELL_CAPTURE_MODE_PREVIEW: String = "preview"
const WORLD_CELL_CAPTURE_MODE_LIVE_PASS: String = "live_pass"
const WORLD_CELL_CAPTURE_MODE_LIVE_NODES: String = "live_nodes"
const WORLD_CELL_DUPLICATE_ANCHOR_POLICY: String = "last_write_wins"
const WORLD_CELL_RUNTIME_AUDIT_SAMPLE_LIMIT: int = 12
const WORLD_CELL_PLACEMENT_POLICY_ACTION_MAP := {
	WORLD_CELL_PLACEMENT_ACTION_RESERVE_CELLS: {
		"field": "reserve_cells",
		"default": true,
	},
	WORLD_CELL_PLACEMENT_ACTION_BLOCK_RESOURCE_FILL: {
		"field": "block_resource_fill",
		"default": true,
	},
	WORLD_CELL_PLACEMENT_ACTION_BLOCK_FREE_CELL_BASE: {
		"field": "block_free_cell_base",
		"default": true,
	},
	WORLD_CELL_PLACEMENT_ACTION_BLOCK_RESOURCE_OVERLAY: {
		"field": "block_resource_overlay",
		"fallback_fields": ["block_resource_generation"],
		"default": true,
	},
	WORLD_CELL_PLACEMENT_ACTION_BLOCK_MOVEMENT: {
		"field": "block_movement",
		"default": false,
	},
}
const WORLD_CELL_PLACEMENT_CONTEXT_RULE_MAP := {
	WORLD_CELL_PLACEMENT_CONTEXT_EMPTY_RESOURCE_FILL: {
		"policy_action": WORLD_CELL_PLACEMENT_ACTION_BLOCK_RESOURCE_FILL,
	},
	WORLD_CELL_PLACEMENT_CONTEXT_FREE_CELL_BASE: {
		"policy_action": WORLD_CELL_PLACEMENT_ACTION_BLOCK_FREE_CELL_BASE,
	},
	WORLD_CELL_PLACEMENT_CONTEXT_RESOURCE_OVERLAY: {
		"policy_action": WORLD_CELL_PLACEMENT_ACTION_BLOCK_RESOURCE_OVERLAY,
	},
	WORLD_CELL_PLACEMENT_CONTEXT_MOVEMENT: {
		"policy_action": WORLD_CELL_PLACEMENT_ACTION_BLOCK_MOVEMENT,
	},
	WORLD_CELL_PLACEMENT_CONTEXT_PREVIEW_NODE_PLACEMENT: {
		"block_rules": [
			{"kind": WORLD_CELL_PLACEMENT_BLOCK_RULE_RESERVED_FOOTPRINT},
			{"kind": WORLD_CELL_PLACEMENT_BLOCK_RULE_PREVIEW_TILE},
			{"kind": WORLD_CELL_PLACEMENT_BLOCK_RULE_RESOURCE_OVERLAY},
			{"kind": WORLD_CELL_PLACEMENT_BLOCK_RULE_BACKEND_TYPE, "values": ["resource"]},
			{
				"kind": WORLD_CELL_PLACEMENT_BLOCK_RULE_BACKEND_TERRAIN,
				"values": ["mountain", "riverland"],
				"allow_by_node_type": {
					"pass": ["mountain"],
					"dock": ["riverland"],
				},
			},
			{"kind": WORLD_CELL_PLACEMENT_BLOCK_RULE_POLICY_CONTEXT, "context": WORLD_CELL_PLACEMENT_CONTEXT_EMPTY_RESOURCE_FILL},
		],
	},
}
const WORLD_CELL_PLACEMENT_POLICY_SOURCE_ORDER := [
	WORLD_CELL_PLACEMENT_POLICY_SOURCE_RESERVED_FOOTPRINT,
	WORLD_CELL_PLACEMENT_POLICY_SOURCE_BACKEND_TILE,
]
const WORLD_CELL_LIVE_STRATEGIC_NODE_TYPES := ["pass", "fort", "dock"]
const WORLD_CELL_NODE_PREVIEW_TYPES := ["pass", "fort", "dock"]
const WORLD_CELL_NODE_PREVIEW_PLACEHOLDER_TYPES := ["mountain_barrier", "river_corridor"]
const WORLD_CELL_DIRECT_SELECTION_FRAME_TYPES := ["resource", "city", "player_city", "ai_city", "system_city"]
const WORLD_CELL_CITY_RUNTIME_TYPES := ["city", "player_city", "ai_city", "system_city"]
const WORLD_CELL_RUNTIME_STRATEGY_ORDER := [
	WORLD_CELL_RUNTIME_STRATEGY_CITY,
	WORLD_CELL_RUNTIME_STRATEGY_NODE_DISPATCH,
]
const WORLD_CELL_RUNTIME_STRATEGY_HANDLER_KEYS := [
	"footprint_resolver",
	"composite_resolver",
	"payload_stage_resolver",
]
const WORLD_CELL_RUNTIME_STRATEGY_RULES := {
	WORLD_CELL_RUNTIME_STRATEGY_CITY: {
		"tile_types": WORLD_CELL_CITY_RUNTIME_TYPES,
		"priority": 10,
		"footprint_resolver": "_resolve_world_cell_city_strategy_footprint_id",
		"composite_resolver": "_resolve_world_cell_city_strategy_composite_id",
		"payload_stage_resolver": "_resolve_world_cell_city_strategy_payload_stage",
	},
	WORLD_CELL_RUNTIME_STRATEGY_NODE_DISPATCH: {
		"priority": 30,
		"fallback_priority": 90,
	},
}
const WORLD_CELL_NODE_DISPATCH_RULES := {
	"pass": {
		"backend_enabled": true,
		"footprint_id": WORLD_CELL_FOOTPRINT_PASS_1X1,
		"default_terrain": "passland",
		"default_composite_id": "world_node_pass_sw_v1",
		"orientation_composites": {
			"se": "world_node_pass_se_v1",
			"southeast": "world_node_pass_se_v1",
			"south_east": "world_node_pass_se_v1",
			"right": "world_node_pass_se_v1",
			"sw": "world_node_pass_sw_v1",
			"southwest": "world_node_pass_sw_v1",
			"south_west": "world_node_pass_sw_v1",
			"left": "world_node_pass_sw_v1",
		},
	},
	"fort": {
		"backend_enabled": true,
		"footprint_id": WORLD_CELL_FOOTPRINT_FORT_1X1,
		"default_terrain": "fortland",
		"default_composite_id": "world_node_fort_v1",
	},
	"dock": {
		"backend_enabled": true,
		"footprint_id": WORLD_CELL_FOOTPRINT_DOCK_1X1,
		"default_terrain": "riverland",
		"default_composite_id": "world_node_dock_v1",
	},
}
const WORLD_CELL_NODE_PREVIEW_SAMPLE_RULES := {
	"pass": {
		"preview_spec_samples": [
			{
				"id": "preview_pass_sw",
				"label": "Pass SW composite",
				"preferred_offset": [-1, 4],
				"compositeId": "world_node_pass_sw_v1",
				"stateTag": "node_composite",
				"focus": "hover",
			},
			{
				"id": "preview_pass_se",
				"label": "Pass SE composite",
				"preferred_offset": [1, 3],
				"compositeId": "world_node_pass_se_v1",
				"stateTag": "node_composite",
			},
		],
		"preview_formal_samples": [
			{
				"id": "preview_pass_formal",
				"label": "Pass formal",
				"preferred_offset": [1, 2],
				"compositeId": "world_node_pass_sw_v1",
				"district": "preview_formal",
				"stateTag": "formal_node",
			},
		],
	},
	"fort": {
		"preview_spec_samples": [
			{
				"id": "preview_fort",
				"label": "Fort composite",
				"preferred_offset": [4, 5],
				"stateTag": "node_composite",
				"focus": "selected",
			},
		],
		"preview_formal_samples": [
			{
				"id": "preview_fort_formal",
				"label": "Fort formal",
				"preferred_offset": [5, 3],
				"district": "preview_formal",
				"stateTag": "formal_node",
			},
		],
	},
	"dock": {
		"preview_spec_samples": [
			{
				"id": "preview_dock",
				"label": "Dock composite",
				"preferred_offset": [8, 6],
				"stateTag": "node_composite",
			},
		],
		"preview_formal_samples": [
			{
				"id": "preview_dock_formal",
				"label": "Dock formal",
				"preferred_offset": [9, 4],
				"district": "preview_formal",
				"stateTag": "formal_node",
			},
		],
	},
	"mountain_barrier": {
		"footprint_id": WORLD_CELL_FOOTPRINT_MOUNTAIN_BARRIER_1X1,
		"default_terrain": "mountain",
		"preview_spec_samples": [
			{
				"id": "preview_mountain_barrier_a",
				"preferred_offset": [0, 8],
				"placeholderRole": "mountain_barrier",
			},
			{
				"id": "preview_mountain_barrier_b",
				"preferred_offset": [1, 7],
				"placeholderRole": "mountain_barrier",
			},
		],
	},
	"river_corridor": {
		"footprint_id": WORLD_CELL_FOOTPRINT_RIVER_CORRIDOR_1X1,
		"default_terrain": "riverland",
		"preview_spec_samples": [
			{
				"id": "preview_river_corridor_a",
				"preferred_offset": [4, 9],
				"placeholderRole": "river_corridor",
			},
			{
				"id": "preview_river_corridor_b",
				"preferred_offset": [5, 9],
				"placeholderRole": "river_corridor",
			},
			{
				"id": "preview_river_corridor_c",
				"preferred_offset": [6, 9],
				"placeholderRole": "river_corridor",
			},
		],
	},
}
const WORLD_CELL_CITY_STRATEGY_RULES := [
	{
		"id": "player_city_legacy_landmark",
		"any_of": [
			{"tile_ids": ["tile_08"]},
			{"landmark_ids": ["qingshi"]},
		],
		"footprint_id": WORLD_CELL_FOOTPRINT_PLAYER_CITY_3X3_INITIAL,
		"composite_fallback": "world_node_city_v1",
	},
	{
		"id": "ai_city_legacy_landmark",
		"any_of": [
			{"tile_ids": ["tile_10"]},
			{"landmark_ids": ["chilei"]},
		],
		"footprint_id": WORLD_CELL_FOOTPRINT_AI_CITY_3X3_INITIAL,
		"composite_fallback": "world_node_capital_v1",
	},
	{
		"id": "owned_small_city",
		"owner_required": true,
		"owner_excludes": ["", "neutral"],
		"max_group_size": 9,
		"footprint_id": WORLD_CELL_FOOTPRINT_AI_CITY_3X3_INITIAL,
		"composite_fallback": "world_node_capital_v1",
	},
	{
		"id": "large_system_city",
		"any_of": [
			{"min_group_size": 25},
			{"min_city_level": 7},
		],
		"composite_fallback": "world_node_capital_v1",
	},
	{
		"id": "system_city_default",
		"composite_fallback": "world_node_city_v1",
	},
]
const WORLD_RESOURCE_DEFAULT_EFFECTIVE_FOOTPRINT := Vector2(320.0, 160.0)
const WORLD_RESOURCE_DEFAULT_FIT_FOOTPRINT := Vector2(320.0, 160.0)
const WORLD_RESOURCE_DEFAULT_SOURCE_ANCHOR := Vector2(192.0, 310.0)
const WORLD_CELL_DEFAULT_FIT_FOOTPRINT := Vector2(240.0, 120.0)
const WORLD_CELL_DEFAULT_SOURCE_ANCHOR := Vector2(192.0, 300.0)
const MOUNTAIN_MASK_N: int = 1
const MOUNTAIN_MASK_E: int = 2
const MOUNTAIN_MASK_S: int = 4
const MOUNTAIN_MASK_W: int = 8
const MOUNTAIN_MASK_NE: int = 16
const MOUNTAIN_MASK_SE: int = 32
const MOUNTAIN_MASK_SW: int = 64
const MOUNTAIN_MASK_NW: int = 128
const EDGE_VARIANTS_ISOLATED := ["11", "12"]
const EDGE_VARIANTS_SINGLE := ["21", "22"]
const EDGE_VARIANTS_STRAIGHT := ["31", "32"]
const EDGE_VARIANTS_CORNER := ["41", "42"]
const EDGE_VARIANTS_TEE := ["51", "52", "53"]
const EDGE_VARIANTS_FULL := ["61", "62", "63"]

signal view_transform_changed(view_state: Dictionary)
signal hud_snapshot_changed(snapshot: Dictionary)
signal player_home_city_node_clicked(context: Dictionary)

@export var tile_size: float = 12.0
@export var tile_gap: float = 1.0
@export var min_zoom: float = 0.25
@export var max_zoom: float = 2.25
@export var zoom_step: float = 1.12
@export_range(0.20, 1.20, 0.01) var cell_layer_min_zoom: float = 0.42
@export var free_cell_base_enabled: bool = true
@export_range(0.00, 0.55, 0.01) var free_cell_base_alpha: float = 0.34
@export var empty_cell_resource_fill_enabled: bool = true
@export_range(0.20, 1.00, 0.01) var empty_cell_resource_fill_alpha: float = 0.82
@export var empty_cell_resource_fill_base_frames_enabled: bool = true
@export_range(1, 9, 1) var empty_cell_resource_fill_max_level: int = 9
@export var hover_label_path: NodePath = NodePath("../HoverLayer/HoverInfo")
@export var perf_label_path: NodePath = NodePath("../HoverLayer/PerfInfo")
@export var export_button_path: NodePath = NodePath("../HoverLayer/ExportPerfButton")
@export var export_status_label_path: NodePath = NodePath("../HoverLayer/ExportStatus")
@export var perf_window_seconds: float = 5.0
@export var perf_hud_update_interval: float = 0.25
@export var export_hotkey: Key = KEY_F8
@export var mountain_overlay_enabled: bool = true
@export var mountain_bitmask_enabled: bool = true
@export var mountain_rotation_enabled: bool = true
@export_enum("custom", "smooth", "sharp", "low_noise") var mountain_visual_profile: String = "custom"
@export_range(32.0, 160.0, 1.0) var mountain_overlay_base_height: float = 92.0
@export_range(0.10, 0.95, 0.01) var mountain_overlay_alpha_min: float = 0.24
@export_range(0.10, 0.95, 0.01) var mountain_overlay_alpha_max: float = 0.56
@export var mountain_edge_denoise_enabled: bool = true
@export_range(0.00, 1.00, 0.01) var mountain_edge_noise_alpha_threshold: float = 0.20
@export var mountain_ridge_bias_enabled: bool = true
@export_range(0.00, 0.40, 0.01) var mountain_ridge_bias_strength: float = 0.10
@export var terrain_edge_overlay_enabled: bool = true
@export var terrain_edge_bitmask_enabled: bool = true
@export var terrain_edge_rotation_enabled: bool = true
@export var river_edge_enabled: bool = true
@export var terrain_edge_enabled: bool = true
@export_range(24.0, 140.0, 1.0) var terrain_edge_overlay_base_height: float = 86.0
@export_range(0.05, 0.90, 0.01) var terrain_edge_alpha_min: float = 0.20
@export_range(0.05, 0.95, 0.01) var terrain_edge_alpha_max: float = 0.50
@export var resource_overlay_enabled: bool = true
@export var resource_overlay_text_enabled: bool = false
@export_range(20.0, 120.0, 1.0) var resource_overlay_base_height: float = 62.0
@export_range(0.20, 1.00, 0.01) var resource_overlay_alpha: float = 1.0
@export_range(0.20, 2.00, 0.01) var resource_overlay_full_zoom: float = 0.72
@export_range(0.10, 1.60, 0.01) var resource_overlay_mid_zoom: float = 0.42
@export_range(0.05, 1.00, 0.01) var resource_overlay_far_alpha: float = 0.54
@export_range(0.10, 1.00, 0.01) var resource_overlay_mid_alpha: float = 0.78
@export var resource_cell_debug_overlay_enabled: bool = false
@export_range(0.10, 1.00, 0.01) var resource_cell_debug_overlay_alpha: float = 0.86
@export var resource_cell_debug_non_resource_enabled: bool = false
@export_range(0.05, 0.70, 0.01) var resource_cell_debug_non_resource_alpha: float = 0.42
@export var world_cell_node_visuals_enabled: bool = true
@export_range(0.20, 1.00, 0.01) var world_cell_node_visual_alpha: float = 0.96
@export var world_cell_preview_nodes_enabled: bool = true
@export var world_cell_preview_placeholders_enabled: bool = true
@export var world_cell_interaction_grid_debug_enabled: bool = false
@export var world_cell_state_overlay_enabled: bool = true
@export_range(0.20, 1.80, 0.01) var home_city_overlay_scale: float = 1.0
@export var home_city_badge_enabled: bool = true

var _tiles: Array = []
var _tile_by_coord: Dictionary = {}
var _backend_tile_by_tmx_key: Dictionary = {}
var _tmx_cell_by_tile_id: Dictionary = {}
var _tmx_cell_by_coord_key: Dictionary = {}
var _mountain_coord_set: Dictionary = {}
var _mountain_overlay_entries: Array = []
var _terrain_edge_overlay_entries: Array = []
var _resource_overlay_entries: Array = []
var _resource_overlay_by_tmx_key: Dictionary = {}
var _resource_debug_png_drawn_tmx_keys: Dictionary = {}
var _resource_debug_non_resource_entries: Array = []
# Home overlay read-model caches, not generic world-cell builder caches.
var _city_overlay_by_tile_id: Dictionary = {}
var _world_city_overlay_by_tile_id: Dictionary = {}
var _world_cell_node_base_by_tmx_key: Dictionary = {}
var _world_cell_node_anchor_by_tmx_key: Dictionary = {}
var _world_cell_footprint_rule_by_id: Dictionary = {}
var _world_cell_reserved_footprint_tmx_keys: Dictionary = {}
var _world_cell_reserved_anchor_by_tmx_key: Dictionary = {}
var _world_cell_reserved_center_by_tmx_key: Dictionary = {}
var _world_cell_preview_tile_by_tmx_key: Dictionary = {}
var _world_cell_preview_focus_tiles: Dictionary = {}
var _world_cell_preview_sample_by_id: Dictionary = {}
var _world_cell_preview_sample_order: Array = []
var _world_cell_preview_placement_audit_by_sample_id: Dictionary = {}
var _world_cell_live_capture_sample_by_id: Dictionary = {}
var _world_cell_live_capture_sample_order: Array = []
var _world_cell_runtime_builder_stats: Dictionary = {}
var _world_cell_runtime_strategy_handler_audit: Dictionary = {}
var _home_city_overlay_entries: Array = []
var _map_width: int = 0
var _map_height: int = 0
var _backend_x_min: int = 0
var _backend_x_max: int = 0
var _backend_y_min: int = 0
var _backend_y_max: int = 0
var _chunk_scope: String = "unknown"
var _loaded_province_ids: Array = []

var _draw_origin: Vector2 = Vector2(880.0, 60.0)
var _pan_offset: Vector2 = Vector2.ZERO
var _zoom: float = 0.42
var _is_dragging: bool = false
var _drag_last_mouse: Vector2 = Vector2.ZERO

var _hover_tile: Dictionary = {}
var _hover_tile_key: String = ""
var _selected_tile: Dictionary = {}
var _selected_tile_key: String = ""
var _hover_label: Label
var _perf_label: Label
var _export_button: Button
var _export_status_label: Label

var _last_visible_draw_count: int = 0
var _last_visible_candidate_count: int = 0
var _last_sampling_step: int = 1
var _last_resource_debug_visible_count: int = 0
var _last_resource_debug_png_drawn_count: int = 0
var _last_resource_debug_missing_png_count: int = 0
var _last_resource_debug_non_resource_visible_count: int = 0
var _perf_elapsed: float = 0.0
var _frame_timestamps: Array = []
var _frame_deltas: Array = []
var _frame_delta_sum: float = 0.0
var _avg_fps_5s: float = 0.0
var _avg_frame_ms_5s: float = 0.0
var _auto_export_requested: bool = false
var _auto_export_done: bool = false
var _runtime_preview_capture_requested: bool = false
var _runtime_preview_capture_done: bool = false

var _tmx_loaded: bool = false
var _tmx_map_width: int = 0
var _tmx_map_height: int = 0
var _tmx_tile_width: float = 200.0
var _tmx_tile_height: float = 100.0
var _tmx_layers: Array = []
var _tmx_tilesets: Array = []
var _overlay_manifest: Dictionary = {}
var _overlay_texture_by_frame: Dictionary = {}
var _world_resource_frame_meta_by_frame: Dictionary = {}
var _world_cell_frame_meta_by_frame: Dictionary = {}
var _world_cell_composite_by_id: Dictionary = {}
var _applied_mountain_visual_profile: String = ""


func _ready() -> void:
	set_process(true)
	set_process_unhandled_input(true)
	_hover_label = get_node_or_null(hover_label_path) as Label
	_perf_label = get_node_or_null(perf_label_path) as Label
	_export_button = get_node_or_null(export_button_path) as Button
	_export_status_label = get_node_or_null(export_status_label_path) as Label
	_auto_export_requested = _is_truthy_env("SLG_EXPORT_BASELINE_ON_START")
	_runtime_preview_capture_requested = _is_truthy_env("SLG_EXPORT_WORLD_CELL_PREVIEW_CAPTURE")
	if _resolve_world_cell_preview_variant() == "stages" and _zoom > 0.32:
		_zoom = 0.32

	var export_callback := Callable(self, "_on_export_button_pressed")
	if _export_button != null and not _export_button.pressed.is_connected(export_callback):
		_export_button.pressed.connect(export_callback)

	_tmx_loaded = _load_theme_tmx()
	_load_overlay_manifest()
	_load_world_resource_asset_manifest()
	_load_world_cell_asset_manifest()
	_load_world_cell_footprint_manifest()
	_sync_mountain_visual_profile(true)
	_validate_world_cell_runtime_strategy_handlers()
	if WorldStore.has_signal("map_layout_updated"):
		WorldStore.map_layout_updated.connect(_on_map_layout_updated)
	if WorldStore.has_signal("world_updated"):
		WorldStore.world_updated.connect(_on_world_updated)
	_apply_map_layout(WorldStore.map_layout)
	_apply_world(WorldStore.world)
	_update_hover_label()
	_update_perf_label()
	if _tmx_loaded:
		_update_export_status("SLG theme loaded | export via button/F8")
	else:
		_update_export_status("SLG theme load failed | check world assets")
	_emit_hud_snapshot_changed()
	_emit_view_transform_changed()


func _on_map_layout_updated(next_map_layout: Dictionary) -> void:
	_apply_map_layout(next_map_layout)


func _on_world_updated(next_world: Dictionary) -> void:
	_apply_world(next_world)


func _sync_mountain_visual_profile(force: bool = false) -> bool:
	var normalized_profile: String = mountain_visual_profile.strip_edges().to_lower()
	if normalized_profile == "":
		normalized_profile = "custom"
	if not force and normalized_profile == _applied_mountain_visual_profile:
		return false
	_applied_mountain_visual_profile = normalized_profile
	_apply_mountain_visual_profile(normalized_profile)
	return true


func _apply_mountain_visual_profile(profile: String) -> void:
	match profile:
		"smooth":
			mountain_edge_denoise_enabled = true
			mountain_edge_noise_alpha_threshold = 0.28
			mountain_ridge_bias_enabled = true
			mountain_ridge_bias_strength = 0.14
			mountain_overlay_base_height = 98.0
			mountain_overlay_alpha_min = 0.26
			mountain_overlay_alpha_max = 0.60
		"sharp":
			mountain_edge_denoise_enabled = true
			mountain_edge_noise_alpha_threshold = 0.12
			mountain_ridge_bias_enabled = true
			mountain_ridge_bias_strength = 0.22
			mountain_overlay_base_height = 94.0
			mountain_overlay_alpha_min = 0.22
			mountain_overlay_alpha_max = 0.66
		"low_noise":
			mountain_edge_denoise_enabled = true
			mountain_edge_noise_alpha_threshold = 0.34
			mountain_ridge_bias_enabled = false
			mountain_ridge_bias_strength = 0.0
			mountain_overlay_base_height = 90.0
			mountain_overlay_alpha_min = 0.22
			mountain_overlay_alpha_max = 0.50
		_:
			# custom profile leaves current params untouched for manual tuning.
			pass


func _process(delta: float) -> void:
	if _sync_mountain_visual_profile(false):
		if not _tiles.is_empty():
			_rebuild_backend_tile_index()
			_refresh_home_city_overlay_entries(WorldStore.world)
		queue_redraw()
	_record_frame_sample(delta)
	_refresh_perf_metrics()
	_perf_elapsed += delta
	if _perf_elapsed >= perf_hud_update_interval:
		_perf_elapsed = 0.0
		_update_perf_label()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey:
		var key_event: InputEventKey = event as InputEventKey
		if key_event.pressed and not key_event.echo and key_event.keycode == export_hotkey:
			_export_perf_baseline("hotkey")
		return

	if event is InputEventMouseButton:
		var mouse_button: InputEventMouseButton = event as InputEventMouseButton
		if mouse_button.button_index == MOUSE_BUTTON_WHEEL_UP and mouse_button.pressed:
			_apply_zoom(zoom_step, mouse_button.position)
		elif mouse_button.button_index == MOUSE_BUTTON_WHEEL_DOWN and mouse_button.pressed:
			_apply_zoom(1.0 / zoom_step, mouse_button.position)
		elif mouse_button.button_index == MOUSE_BUTTON_LEFT and mouse_button.pressed:
			_select_tile_at(mouse_button.position)
		elif _is_pan_button(mouse_button.button_index):
			_is_dragging = mouse_button.pressed
			_drag_last_mouse = mouse_button.position

		_update_hover(mouse_button.position)
		return

	if event is InputEventMouseMotion:
		var motion: InputEventMouseMotion = event as InputEventMouseMotion
		if _is_dragging:
			_pan_offset += motion.position - _drag_last_mouse
			_drag_last_mouse = motion.position
			queue_redraw()
			_emit_view_transform_changed()
		_update_hover(motion.position)


func _apply_map_layout(next_map_layout: Dictionary) -> void:
	var map_payload: Dictionary = next_map_layout.get("map", {}) as Dictionary
	var chunk_payload: Dictionary = next_map_layout.get("chunk", {}) as Dictionary

	var raw_tiles: Variant = map_payload.get("tiles", [])
	_tiles = raw_tiles if raw_tiles is Array else []
	_map_width = int(map_payload.get("width", 0))
	_map_height = int(map_payload.get("height", 0))

	var raw_loaded_province_ids: Variant = chunk_payload.get("loadedProvinceIds", [])
	_loaded_province_ids = raw_loaded_province_ids if raw_loaded_province_ids is Array else []
	_chunk_scope = str(chunk_payload.get("scope", "unknown"))

	_rebuild_backend_tile_index()
	_ingest_world_city_overlays(WorldStore.world)
	_refresh_home_city_overlay_entries(WorldStore.world)
	_update_hover(get_viewport().get_mouse_position())
	queue_redraw()
	_emit_view_transform_changed()
	if _runtime_preview_capture_requested and not _runtime_preview_capture_done:
		if _should_schedule_runtime_capture_now():
			_schedule_runtime_preview_capture()

	if _auto_export_requested and not _auto_export_done and _tiles.size() > 0:
		_auto_export_done = true
		_export_perf_baseline("auto")

	print("[map-grid-theme] scope=%s backendTiles=%d tmxLoaded=%s" % [_chunk_scope, _tiles.size(), str(_tmx_loaded)])


func _apply_world(next_world: Dictionary) -> void:
	_ingest_world_city_overlays(next_world)
	_refresh_home_city_overlay_entries(next_world)
	queue_redraw()


func _rebuild_backend_tile_index() -> void:
	_tile_by_coord = {}
	_backend_tile_by_tmx_key = {}
	_tmx_cell_by_tile_id = {}
	_tmx_cell_by_coord_key = {}
	_mountain_coord_set = {}
	_mountain_overlay_entries = []
	_terrain_edge_overlay_entries = []
	_resource_overlay_entries = []
	_resource_overlay_by_tmx_key = {}
	_resource_debug_non_resource_entries = []
	_city_overlay_by_tile_id = {}
	_world_cell_node_base_by_tmx_key = {}
	_world_cell_node_anchor_by_tmx_key = {}
	_world_cell_reserved_footprint_tmx_keys = {}
	_world_cell_reserved_anchor_by_tmx_key = {}
	_world_cell_reserved_center_by_tmx_key = {}
	_world_cell_preview_tile_by_tmx_key = {}
	_world_cell_preview_focus_tiles = {}
	_world_cell_preview_sample_by_id = {}
	_world_cell_preview_sample_order = []
	_world_cell_live_capture_sample_by_id = {}
	_world_cell_live_capture_sample_order = []
	_reset_world_cell_runtime_builder_stats()
	var has_bounds: bool = false
	var mountain_backend_entries: Array = []
	var river_coord_set: Dictionary = {}
	var river_backend_entries: Array = []
	var sand_coord_set: Dictionary = {}
	var sand_backend_entries: Array = []
	var world_cell_backend_entries: Array = []

	for tile_variant in _tiles:
		if not (tile_variant is Dictionary):
			continue
		var tile_data: Dictionary = tile_variant as Dictionary
		var tile_x: int = int(tile_data.get("x", 0))
		var tile_y: int = int(tile_data.get("y", 0))
		_tile_by_coord[_coord_key(tile_x, tile_y)] = tile_data
		if not has_bounds:
			_backend_x_min = tile_x
			_backend_x_max = tile_x
			_backend_y_min = tile_y
			_backend_y_max = tile_y
			has_bounds = true
		else:
			_backend_x_min = min(_backend_x_min, tile_x)
			_backend_x_max = max(_backend_x_max, tile_x)
			_backend_y_min = min(_backend_y_min, tile_y)
			_backend_y_max = max(_backend_y_max, tile_y)

	if not has_bounds:
		_backend_x_min = 0
		_backend_x_max = 0
		_backend_y_min = 0
		_backend_y_max = 0
		_rebuild_world_cell_preview_entries()
		return

	for tile_variant in _tiles:
		if not (tile_variant is Dictionary):
			continue
		var tile_data: Dictionary = tile_variant as Dictionary
		var tile_x: int = int(tile_data.get("x", 0))
		var tile_y: int = int(tile_data.get("y", 0))
		var mapped_x: int = _map_backend_to_tmx_axis(tile_x, _backend_x_min, _backend_x_max, _tmx_map_width)
		var mapped_y: int = _map_backend_to_tmx_axis(tile_y, _backend_y_min, _backend_y_max, _tmx_map_height)
		var mapped_cell := Vector2i(mapped_x, mapped_y)
		_backend_tile_by_tmx_key[_coord_key(mapped_x, mapped_y)] = tile_data
		_tmx_cell_by_coord_key[_coord_key(tile_x, tile_y)] = mapped_cell
		var tile_id: String = str(tile_data.get("id", "")).strip_edges()
		if tile_id != "":
			_tmx_cell_by_tile_id[tile_id] = mapped_cell

		var tile_type: String = str(tile_data.get("type", "")).strip_edges().to_lower()
		if tile_type == "resource":
			var resource_level: int = clampi(maxi(1, int(tile_data.get("resourceLevel", 1))), 1, 9)
			var resource_kind: String = str(tile_data.get("resourceKind", "")).strip_edges().to_lower()
			var resource_entry := {
				"tileId": tile_id,
				"tmxX": mapped_x,
				"tmxY": mapped_y,
				"resourceLevel": resource_level,
				"resourceKind": resource_kind,
				"overlayFrame": _resolve_resource_overlay_frame(resource_kind, resource_level),
			}
			_resource_overlay_entries.append(resource_entry)
			_resource_overlay_by_tmx_key[_coord_key(mapped_x, mapped_y)] = resource_entry
		else:
			_resource_debug_non_resource_entries.append(
				{
					"tileId": tile_id,
					"tmxX": mapped_x,
					"tmxY": mapped_y,
					"tileType": tile_type,
					"terrain": str(tile_data.get("terrain", "")).strip_edges().to_lower(),
				}
			)
		if tile_type == "city" and tile_id != "":
			var city_owner: String = str(tile_data.get("owner", "")).strip_edges().to_lower()
			var city_entry := {
				"id": tile_id,
				"tileId": tile_id,
				"type": "city",
				"title": str(tile_data.get("title", tile_data.get("name", tile_id))).strip_edges(),
				"x": tile_x,
				"y": tile_y,
				"backendX": tile_x,
				"backendY": tile_y,
				"tmxX": mapped_x,
				"tmxY": mapped_y,
				"terrain": str(tile_data.get("terrain", "cityland")).strip_edges().to_lower(),
				"district": str(tile_data.get("district", "world")).strip_edges(),
				"cityLevel": maxi(1, int(tile_data.get("cityLevel", 1))),
				"owner": city_owner,
				"landmarkId": str(tile_data.get("landmarkId", "")).strip_edges(),
				"compositeId": str(tile_data.get("compositeId", "")).strip_edges(),
				"groupKey": _resolve_city_group_key(tile_id),
			}
			_city_overlay_by_tile_id[tile_id] = city_entry
			world_cell_backend_entries.append(city_entry)
		elif _is_supported_world_cell_node_tile_type(tile_type):
			_record_world_cell_runtime_raw_backend_node(tile_type)
			var node_entry: Dictionary = _build_world_cell_backend_node_entry(tile_data, tile_id, tile_x, tile_y, mapped_x, mapped_y)
			if not node_entry.is_empty():
				world_cell_backend_entries.append(node_entry)

		if tile_type == "resource":
			continue

		var terrain: String = str(tile_data.get("terrain", "")).strip_edges().to_lower()
		if terrain == "mountain":
			_mountain_coord_set[_coord_key(tile_x, tile_y)] = true
			mountain_backend_entries.append(
				{
					"x": tile_x,
					"y": tile_y,
					"tmxX": mapped_x,
					"tmxY": mapped_y,
				}
			)
		elif terrain == "riverland":
			river_coord_set[_coord_key(tile_x, tile_y)] = true
			river_backend_entries.append(
				{
					"x": tile_x,
					"y": tile_y,
					"tmxX": mapped_x,
					"tmxY": mapped_y,
				}
			)
		elif terrain == "wasteland":
			sand_coord_set[_coord_key(tile_x, tile_y)] = true
			sand_backend_entries.append(
				{
					"x": tile_x,
					"y": tile_y,
					"tmxX": mapped_x,
					"tmxY": mapped_y,
				}
			)

	_rebuild_mountain_overlay_entries(mountain_backend_entries)
	_rebuild_terrain_edge_overlay_entries(
		river_backend_entries,
		river_coord_set,
		sand_backend_entries,
		sand_coord_set
	)
	_rebuild_world_cell_runtime_entries(world_cell_backend_entries)
	_rebuild_world_cell_live_capture_samples()
	_rebuild_world_cell_preview_entries()


func _draw() -> void:
	if not _tmx_loaded:
		_last_visible_draw_count = 0
		if _hover_tile_key == "":
			_update_hover_label()
		return

	var visible_bounds: Dictionary = _compute_visible_tmx_bounds()
	if not bool(visible_bounds.get("valid", false)):
		_last_visible_draw_count = 0
		return

	var start_x: int = int(visible_bounds.get("startX", 0))
	var end_x: int = int(visible_bounds.get("endX", -1))
	var start_y: int = int(visible_bounds.get("startY", 0))
	var end_y: int = int(visible_bounds.get("endY", -1))
	var visible_width: int = max(0, end_x - start_x + 1)
	var visible_height: int = max(0, end_y - start_y + 1)
	var candidate_count: int = visible_width * visible_height
	var sampling_step: int = _resolve_sampling_step(candidate_count)
	var draw_count: int = 0

	for tile_y in range(start_y, end_y + 1, sampling_step):
		for tile_x in range(start_x, end_x + 1, sampling_step):
			if draw_count >= MAX_VISIBLE_TILE_DRAW_COUNT:
				break
			_draw_tmx_cell(tile_x, tile_y)
			draw_count += 1
		if draw_count >= MAX_VISIBLE_TILE_DRAW_COUNT:
			break

	if _last_visible_candidate_count != candidate_count:
		_last_visible_candidate_count = candidate_count
	if _last_sampling_step != sampling_step:
		_last_sampling_step = sampling_step
	if _last_visible_draw_count != draw_count:
		_last_visible_draw_count = draw_count
		if _hover_tile_key == "":
			_update_hover_label()

	_reset_resource_cell_debug_overlay_frame()
	_draw_resource_level_overlays(visible_bounds)
	_draw_world_cell_nodes(visible_bounds)
	_draw_resource_cell_debug_overlay(visible_bounds)
	_draw_home_city_overlays(visible_bounds)
	_draw_world_cell_interaction_grids()

	if _selected_tile_key != "":
		_draw_selected_tile_overlay()

	if _hover_tile_key != "":
		_draw_hover_tile_overlay()


func _draw_tmx_cell(tmx_x: int, tmx_y: int) -> void:
	if _tmx_map_width <= 0 or _tmx_map_height <= 0:
		return
	var tmx_key: String = _coord_key(tmx_x, tmx_y)
	if _resource_overlay_by_tmx_key.has(tmx_key):
		return
	if empty_cell_resource_fill_enabled and _should_fill_empty_cell_with_resource(tmx_x, tmx_y):
		var filler_frame: String = _resolve_empty_cell_resource_fill_frame(tmx_x, tmx_y)
		if _draw_world_resource_frame(filler_frame, _tmx_to_screen(tmx_x, tmx_y), empty_cell_resource_fill_alpha):
			return
	if _should_world_cell_block_free_cell_base(tmx_key):
		return
	if not free_cell_base_enabled:
		return
	_draw_free_cell_base(tmx_x, tmx_y)


func _should_fill_empty_cell_with_resource(tmx_x: int, tmx_y: int) -> bool:
	var tmx_key: String = _coord_key(tmx_x, tmx_y)
	if _should_world_cell_block_empty_resource_fill(tmx_key):
		return false
	if _resource_overlay_by_tmx_key.has(tmx_key):
		return false
	return true


func _resolve_empty_cell_resource_fill_frame(tmx_x: int, tmx_y: int) -> String:
	var hash_value: int = int(abs((tmx_x * 83492791) ^ (tmx_y * 2971215073)))
	var kind_index: int = posmod(hash_value, 4)
	var kind: String = "grain"
	match kind_index:
		1:
			kind = "wood"
		2:
			kind = "stone"
		3:
			kind = "iron"
	if empty_cell_resource_fill_base_frames_enabled and posmod(int(hash_value / 11), 10) == 0:
		return "world_resource_%s_base_v1.png" % kind
	var level_max: int = clampi(empty_cell_resource_fill_max_level, 1, 9)
	var level: int = 1 + posmod(int(hash_value / 7), level_max)
	return "world_resource_%s_l%02d_v1.png" % [kind, level]


func _draw_world_cell_nodes(visible_bounds: Dictionary) -> void:
	if not world_cell_node_visuals_enabled:
		return
	_draw_world_cell_base_nodes(visible_bounds)
	if _world_cell_node_anchor_by_tmx_key.is_empty():
		return
	for anchor_variant in _world_cell_node_anchor_by_tmx_key.values():
		if not (anchor_variant is Dictionary):
			continue
		var anchor_entry: Dictionary = anchor_variant as Dictionary
		var tmx_x: int = int(anchor_entry.get("tmxX", -1))
		var tmx_y: int = int(anchor_entry.get("tmxY", -1))
		if tmx_x < 0 or tmx_y < 0:
			continue
		if not _is_tmx_cell_visible(tmx_x, tmx_y, visible_bounds, _resolve_world_cell_anchor_visibility_margin(anchor_entry)):
			continue
		_draw_world_cell_node(tmx_x, tmx_y, anchor_entry)


func _draw_world_cell_base_nodes(visible_bounds: Dictionary) -> void:
	if _world_cell_node_base_by_tmx_key.is_empty():
		return
	for base_variant in _world_cell_node_base_by_tmx_key.values():
		if not (base_variant is Dictionary):
			continue
		var base_entry: Dictionary = base_variant as Dictionary
		var tmx_x: int = int(base_entry.get("tmxX", -1))
		var tmx_y: int = int(base_entry.get("tmxY", -1))
		if tmx_x < 0 or tmx_y < 0:
			continue
		if not _is_tmx_cell_visible(tmx_x, tmx_y, visible_bounds, 1):
			continue
		var cell_center: Vector2 = _tmx_to_screen(tmx_x, tmx_y)
		var base_mode: String = str(base_entry.get("baseMode", "frame")).strip_edges().to_lower()
		if base_mode == "free_cell_base":
			_draw_free_cell_base(tmx_x, tmx_y)
		else:
			var frame_offset: Vector2 = _vector2_from_json_array(base_entry.get("offset", []), Vector2.ZERO) * _zoom
			_draw_world_cell_frame(
				str(base_entry.get("frame", "world_cell_city_ground_base_v1.png")),
				cell_center + frame_offset,
				world_cell_node_visual_alpha * float(base_entry.get("alpha", 0.96)),
				float(base_entry.get("scale", 1.0))
			)
		_draw_world_cell_base_state_overlay(cell_center, base_entry)


func _resolve_world_cell_anchor_visibility_margin(anchor_entry: Dictionary) -> int:
	var footprint_tiles: Array = _resolve_world_cell_footprint_tiles(str(anchor_entry.get("footprintId", "")), [3, 3])
	if footprint_tiles.size() < 2:
		return 3
	var side_length: int = maxi(int(footprint_tiles[0]), int(footprint_tiles[1]))
	return maxi(3, int(ceil(float(side_length) * 0.5)) + 2)


func _draw_world_cell_node(tmx_x: int, tmx_y: int, anchor_entry: Dictionary) -> bool:
	var cell_center: Vector2 = _tmx_to_screen(tmx_x, tmx_y)
	var drawn: bool = false
	if anchor_entry.is_empty():
		return false
	var frame_name: String = str(anchor_entry.get("frame", "")).strip_edges()
	if frame_name != "":
		var frame_offset: Vector2 = _vector2_from_json_array(anchor_entry.get("offset", []), Vector2.ZERO) * _zoom
		drawn = _draw_world_cell_frame(
			frame_name,
			cell_center + frame_offset,
			world_cell_node_visual_alpha * float(anchor_entry.get("alpha", 0.86)),
			float(anchor_entry.get("scale", 0.36))
		) or drawn
	else:
		var composite_offset: Vector2 = _vector2_from_json_array(anchor_entry.get("offset", []), Vector2.ZERO) * _zoom
		var layered_layers_variant: Variant = anchor_entry.get("layeredLayers", [])
		if layered_layers_variant is Array and not (layered_layers_variant as Array).is_empty():
			drawn = _draw_world_cell_layers(
				layered_layers_variant as Array,
				cell_center + composite_offset,
				world_cell_node_visual_alpha * float(anchor_entry.get("alpha", 1.0))
			) or drawn
		var payload_slots_variant: Variant = anchor_entry.get("payloadSlots", [])
		if payload_slots_variant is Array and not (payload_slots_variant as Array).is_empty():
			drawn = _draw_world_cell_payload_slots(
				payload_slots_variant as Array,
				cell_center + composite_offset,
				world_cell_node_visual_alpha * float(anchor_entry.get("alpha", 1.0))
			) or drawn
		else:
			var composite_id: String = str(anchor_entry.get("compositeId", "")).strip_edges()
			if composite_id != "":
				drawn = _draw_world_cell_composite(
					composite_id,
					cell_center + composite_offset,
					world_cell_node_visual_alpha * float(anchor_entry.get("alpha", 1.0))
				) or drawn
			else:
				drawn = _draw_world_cell_placeholder(anchor_entry, cell_center + composite_offset) or drawn
	return drawn


func _draw_free_cell_base(tmx_x: int, tmx_y: int) -> void:
	var center: Vector2 = _tmx_to_screen(tmx_x, tmx_y)
	var half_w: float = _tmx_tile_width * 0.5 * _zoom
	var half_h: float = _tmx_tile_height * 0.5 * _zoom
	var points := PackedVector2Array(
		[
			Vector2(center.x, center.y - half_h),
			Vector2(center.x + half_w, center.y),
			Vector2(center.x, center.y + half_h),
			Vector2(center.x - half_w, center.y),
		]
	)
	var variation: float = float(posmod((tmx_x * 1103515245 + tmx_y * 12345), 7)) / 6.0
	var alpha: float = clampf(free_cell_base_alpha, 0.0, 0.55)
	var fill := Color(
		lerpf(0.29, 0.34, variation),
		lerpf(0.35, 0.40, variation),
		lerpf(0.31, 0.35, variation),
		alpha
	)
	var outline := Color(0.54, 0.58, 0.48, alpha * 0.58)
	draw_colored_polygon(points, fill)
	var outline_points := PackedVector2Array(points)
	outline_points.append(points[0])
	draw_polyline(outline_points, outline, max(0.6, _zoom * 0.65))
	return


func _draw_resource_level_overlays(visible_bounds: Dictionary) -> void:
	if not resource_overlay_enabled:
		return
	if _resource_overlay_entries.is_empty():
		return

	var font: Font = ThemeDB.fallback_font
	var zoom_alpha: float = _resource_overlay_alpha_for_zoom()
	for entry_variant in _resource_overlay_entries:
		if not (entry_variant is Dictionary):
			continue
		var entry: Dictionary = entry_variant as Dictionary
		var tmx_x: int = int(entry.get("tmxX", -1))
		var tmx_y: int = int(entry.get("tmxY", -1))
		if not _is_tmx_cell_visible(tmx_x, tmx_y, visible_bounds, 1):
			continue
		var resource_cell_key: String = _coord_key(tmx_x, tmx_y)
		if _should_world_cell_block_resource_overlay(resource_cell_key):
			continue
		var level: int = clampi(maxi(1, int(entry.get("resourceLevel", 1))), 1, 9)
		var cell_center: Vector2 = _tmx_to_screen(tmx_x, tmx_y)
		var marker_center: Vector2 = cell_center + Vector2(0.0, -_tmx_tile_height * 0.16 * _zoom)
		var overlay_frame: String = str(entry.get("overlayFrame", ""))
		var texture_drawn: bool = false
		var world_resource_png_drawn: bool = false
		if _world_resource_frame_meta_by_frame.has(overlay_frame):
			world_resource_png_drawn = _draw_world_resource_frame(overlay_frame, cell_center, zoom_alpha)
			texture_drawn = world_resource_png_drawn
		else:
			texture_drawn = _draw_overlay_frame(
				overlay_frame,
				marker_center,
				clampf(resource_overlay_base_height * _zoom, 12.0, 64.0),
				zoom_alpha
			)
		if texture_drawn:
			if resource_cell_debug_overlay_enabled and world_resource_png_drawn:
				_resource_debug_png_drawn_tmx_keys[resource_cell_key] = true
			if resource_overlay_text_enabled and font != null and _zoom >= 0.72:
				var text: String = str(level)
				var font_size: int = int(clampf(11.0 * _zoom, 8.0, 13.0))
				_draw_centered_text(font, marker_center + Vector2(0.0, clampf(10.0 * _zoom, 3.0, 8.0)), text, font_size, Color(0.05, 0.05, 0.05, 0.95))
			continue

		var radius: float = clampf(4.8 * _zoom, 2.0, 8.6)
		var fill_color: Color = _resource_level_color(level)
		draw_circle(marker_center, radius + 1.0, Color(0.0, 0.0, 0.0, 0.52))
		draw_circle(marker_center, radius, fill_color)
		draw_arc(marker_center, radius + 0.3, 0.0, TAU, 20, Color(1.0, 1.0, 1.0, 0.58), 1.0)
		if resource_overlay_text_enabled and font != null and _zoom >= 0.50:
			var text_fallback: String = str(level)
			var font_size_fallback: int = int(clampf(12.0 * _zoom, 8.0, 15.0))
			_draw_centered_text(font, marker_center + Vector2(0.0, radius * 0.42), text_fallback, font_size_fallback, Color(0.05, 0.05, 0.05, 0.95))


func _resource_overlay_alpha_for_zoom() -> float:
	var base_alpha: float = clampf(resource_overlay_alpha, 0.0, 1.0)
	var full_zoom: float = max(0.01, resource_overlay_full_zoom)
	var mid_zoom: float = clampf(resource_overlay_mid_zoom, 0.01, full_zoom)
	if _zoom >= full_zoom:
		return base_alpha
	if _zoom >= mid_zoom:
		var mid_t: float = inverse_lerp(mid_zoom, full_zoom, _zoom)
		return base_alpha * lerpf(clampf(resource_overlay_mid_alpha, 0.0, 1.0), 1.0, mid_t)
	var far_t: float = clampf(_zoom / mid_zoom, 0.0, 1.0)
	return base_alpha * lerpf(clampf(resource_overlay_far_alpha, 0.0, 1.0), clampf(resource_overlay_mid_alpha, 0.0, 1.0), far_t)


func _resource_overlay_sample_step_for_zoom() -> int:
	return 1


func _reset_resource_cell_debug_overlay_frame() -> void:
	_resource_debug_png_drawn_tmx_keys = {}
	_last_resource_debug_visible_count = 0
	_last_resource_debug_png_drawn_count = 0
	_last_resource_debug_missing_png_count = 0
	_last_resource_debug_non_resource_visible_count = 0


func _draw_resource_cell_debug_overlay(visible_bounds: Dictionary) -> void:
	if not resource_cell_debug_overlay_enabled:
		return
	if _resource_overlay_entries.is_empty() and _resource_debug_non_resource_entries.is_empty():
		return

	var alpha: float = clampf(resource_cell_debug_overlay_alpha, 0.10, 1.0)
	var backend_outline := Color(0.05, 0.95, 1.0, alpha)
	var png_marker := Color(0.20, 1.0, 0.38, alpha)
	var missing_outline := Color(1.0, 0.16, 0.55, alpha)
	var non_resource_alpha: float = clampf(resource_cell_debug_non_resource_alpha, 0.05, 0.70)
	var non_resource_outline := Color(1.0, 0.68, 0.18, non_resource_alpha)
	var visible_count: int = 0
	var png_drawn_count: int = 0
	var missing_png_count: int = 0
	var non_resource_visible_count: int = 0

	if resource_cell_debug_non_resource_enabled:
		for non_resource_variant in _resource_debug_non_resource_entries:
			if not (non_resource_variant is Dictionary):
				continue
			var non_resource_entry: Dictionary = non_resource_variant as Dictionary
			var non_resource_tmx_x: int = int(non_resource_entry.get("tmxX", -1))
			var non_resource_tmx_y: int = int(non_resource_entry.get("tmxY", -1))
			if not _is_tmx_cell_visible(non_resource_tmx_x, non_resource_tmx_y, visible_bounds, 1):
				continue
			non_resource_visible_count += 1
			var non_resource_center: Vector2 = _tmx_to_screen(non_resource_tmx_x, non_resource_tmx_y)
			_draw_tile_diamond_overlay(
				non_resource_center,
				Color(1.0, 0.68, 0.18, non_resource_alpha * 0.04),
				non_resource_outline,
				max(0.7, _zoom * 0.85)
			)
			_draw_non_resource_cell_debug_marker(non_resource_center, non_resource_outline)

	for entry_variant in _resource_overlay_entries:
		if not (entry_variant is Dictionary):
			continue
		var entry: Dictionary = entry_variant as Dictionary
		var tmx_x: int = int(entry.get("tmxX", -1))
		var tmx_y: int = int(entry.get("tmxY", -1))
		if not _is_tmx_cell_visible(tmx_x, tmx_y, visible_bounds, 1):
			continue

		visible_count += 1
		var resource_cell_key: String = _coord_key(tmx_x, tmx_y)
		var cell_center: Vector2 = _tmx_to_screen(tmx_x, tmx_y)
		var png_drawn: bool = _resource_debug_png_drawn_tmx_keys.has(resource_cell_key)
		_draw_tile_diamond_overlay(
			cell_center,
			Color(0.0, 0.0, 0.0, 0.0),
			backend_outline,
			max(0.9, _zoom * 1.25)
		)
		if png_drawn:
			png_drawn_count += 1
			_draw_resource_cell_debug_marker(cell_center, png_marker, false)
		else:
			missing_png_count += 1
			_draw_tile_diamond_overlay(
				cell_center,
				Color(1.0, 0.16, 0.55, alpha * 0.08),
				missing_outline,
				max(1.2, _zoom * 1.8)
			)
			_draw_resource_cell_debug_marker(cell_center, missing_outline, true)

	_last_resource_debug_visible_count = visible_count
	_last_resource_debug_png_drawn_count = png_drawn_count
	_last_resource_debug_missing_png_count = missing_png_count
	_last_resource_debug_non_resource_visible_count = non_resource_visible_count


func _draw_resource_cell_debug_marker(center: Vector2, color: Color, is_missing_png: bool) -> void:
	var radius: float = max(1.8, 3.8 * _zoom)
	draw_circle(center, radius + 1.2, Color(0.0, 0.0, 0.0, min(0.55, color.a)))
	draw_circle(center, radius, color)
	if not is_missing_png:
		return
	var arm: float = max(5.0, _tmx_tile_height * 0.12 * _zoom)
	var width: float = max(1.2, 1.6 * _zoom)
	draw_line(center + Vector2(-arm, -arm * 0.5), center + Vector2(arm, arm * 0.5), Color(0.0, 0.0, 0.0, min(0.60, color.a)), width + 1.5)
	draw_line(center + Vector2(-arm, arm * 0.5), center + Vector2(arm, -arm * 0.5), Color(0.0, 0.0, 0.0, min(0.60, color.a)), width + 1.5)
	draw_line(center + Vector2(-arm, -arm * 0.5), center + Vector2(arm, arm * 0.5), color, width)
	draw_line(center + Vector2(-arm, arm * 0.5), center + Vector2(arm, -arm * 0.5), color, width)


func _draw_non_resource_cell_debug_marker(center: Vector2, color: Color) -> void:
	var half_w: float = max(3.5, _tmx_tile_width * 0.045 * _zoom)
	var half_h: float = max(1.8, _tmx_tile_height * 0.045 * _zoom)
	var width: float = max(1.0, _zoom * 1.1)
	var left := center + Vector2(-half_w, 0.0)
	var right := center + Vector2(half_w, 0.0)
	var top := center + Vector2(0.0, -half_h)
	var bottom := center + Vector2(0.0, half_h)
	draw_line(left, right, Color(0.0, 0.0, 0.0, min(0.50, color.a)), width + 1.4)
	draw_line(top, bottom, Color(0.0, 0.0, 0.0, min(0.50, color.a)), width + 1.4)
	draw_line(left, right, color, width)
	draw_line(top, bottom, color, width)


func _draw_world_cell_interaction_grids() -> void:
	if not world_cell_interaction_grid_debug_enabled:
		return
	var drawn_centers: Dictionary = {}
	if _selected_tile_key != "":
		_draw_world_cell_interaction_grid_for_tile(
			_selected_tile,
			Color(0.58, 0.84, 1.0, 0.56),
			drawn_centers
		)
	if _hover_tile_key != "":
		_draw_world_cell_interaction_grid_for_tile(
			_hover_tile,
			Color(1.0, 0.92, 0.54, 0.52),
			drawn_centers
		)


func _draw_world_cell_interaction_grid_for_tile(tile_data: Dictionary, outline_color: Color, drawn_centers: Dictionary) -> void:
	if tile_data.is_empty():
		return
	var tmx_key: String = _resolve_tmx_key_for_backend_tile(tile_data)
	if tmx_key == "":
		return
	var footprint_id: String = str(_world_cell_reserved_footprint_tmx_keys.get(tmx_key, "")).strip_edges()
	if footprint_id == "" or footprint_id == WORLD_CELL_FOOTPRINT_RESOURCE_1X1:
		return
	var center_variant: Variant = _world_cell_reserved_center_by_tmx_key.get(tmx_key, [])
	var center_tmx: Vector2i = _vector2i_from_json_array(center_variant, Vector2i(-1, -1))
	if center_tmx.x < 0 or center_tmx.y < 0:
		return
	var center_key: String = _coord_key(center_tmx.x, center_tmx.y)
	if drawn_centers.has(center_key):
		return
	drawn_centers[center_key] = true
	var offsets: Array = _resolve_world_cell_footprint_offsets(footprint_id, [3, 3])
	if offsets.size() <= 1:
		return
	var footprint_tiles: Array = _resolve_world_cell_footprint_tiles(footprint_id, [3, 3])
	var width: float = max(0.85, _zoom * 0.88)
	for offset_variant in offsets:
		var offset: Vector2i = _vector2i_from_json_array(offset_variant, Vector2i.ZERO)
		if not _is_world_cell_perimeter_offset(offset, footprint_tiles):
			continue
		var tmx_x: int = clampi(center_tmx.x + offset.x, 0, maxi(0, _tmx_map_width - 1))
		var tmx_y: int = clampi(center_tmx.y + offset.y, 0, maxi(0, _tmx_map_height - 1))
		var state_entry_variant: Variant = _world_cell_node_base_by_tmx_key.get(_coord_key(tmx_x, tmx_y), {})
		var state_entry: Dictionary = state_entry_variant as Dictionary if state_entry_variant is Dictionary else {}
		var cell_state: String = str(state_entry.get("cellState", "reserved_base")).strip_edges().to_lower()
		var cell_outline: Color = _resolve_world_cell_interaction_outline_color(outline_color, cell_state)
		var cell_fill: Color = _resolve_world_cell_interaction_fill_color(cell_state)
		_draw_tile_diamond_overlay(
			_tmx_to_screen(tmx_x, tmx_y),
			cell_fill,
			cell_outline,
			width
		)
		if cell_state == "active_building_cell":
			_draw_world_cell_active_corner_marks(_tmx_to_screen(tmx_x, tmx_y), cell_outline)


func _is_world_cell_perimeter_offset(offset: Vector2i, footprint_tiles: Array) -> bool:
	if footprint_tiles.size() < 2:
		return true
	var half_w: int = maxi(0, int(floor(float(footprint_tiles[0]) * 0.5)))
	var half_h: int = maxi(0, int(floor(float(footprint_tiles[1]) * 0.5)))
	return abs(offset.x) >= half_w or abs(offset.y) >= half_h


func _resolve_tmx_key_for_backend_tile(tile_data: Dictionary) -> String:
	var direct_tmx_x: int = int(tile_data.get("tmxX", -1))
	var direct_tmx_y: int = int(tile_data.get("tmxY", -1))
	if direct_tmx_x >= 0 and direct_tmx_y >= 0:
		return _coord_key(direct_tmx_x, direct_tmx_y)
	var backend_x: int = int(tile_data.get("x", 0))
	var backend_y: int = int(tile_data.get("y", 0))
	var mapped_variant: Variant = _tmx_cell_by_coord_key.get(_coord_key(backend_x, backend_y), null)
	if mapped_variant is Vector2i:
		var mapped: Vector2i = mapped_variant as Vector2i
		return _coord_key(mapped.x, mapped.y)
	if _backend_x_min <= _backend_x_max and _backend_y_min <= _backend_y_max:
		return _coord_key(
			_map_backend_to_tmx_axis(backend_x, _backend_x_min, _backend_x_max, _tmx_map_width),
			_map_backend_to_tmx_axis(backend_y, _backend_y_min, _backend_y_max, _tmx_map_height)
		)
	return ""


func _draw_hover_tile_overlay() -> void:
	var hover_pos: Vector2 = _resolve_screen_position_for_tile(_hover_tile)
	var hover_state: String = str(_hover_tile.get("cellState", "")).strip_edges().to_lower()
	_draw_tile_diamond_overlay(
		hover_pos,
		_resolve_world_cell_overlay_fill_color("hover", hover_state),
		_resolve_world_cell_overlay_outline_color("hover", hover_state),
		max(1.4, _zoom * 1.10)
	)
	_draw_world_cell_state_overlay_for_tile(_hover_tile, hover_pos, "hover")


func _draw_selected_tile_overlay() -> void:
	var selected_pos: Vector2 = _resolve_screen_position_for_tile(_selected_tile)
	var selected_state: String = str(_selected_tile.get("cellState", "")).strip_edges().to_lower()
	_draw_tile_diamond_overlay(
		selected_pos,
		_resolve_world_cell_overlay_fill_color("selected", selected_state),
		_resolve_world_cell_overlay_outline_color("selected", selected_state),
		max(1.6, _zoom * 1.45)
	)
	_draw_world_cell_state_overlay_for_tile(_selected_tile, selected_pos, "selected")
	if _should_draw_world_cell_selection_frame(_selected_tile):
		_draw_selected_node_frame(selected_pos)


func _should_draw_world_cell_selection_frame(tile_data: Dictionary) -> bool:
	if tile_data.is_empty():
		return false
	var tmx_key: String = _resolve_tmx_key_for_backend_tile(tile_data)
	if tmx_key != "" and _world_cell_reserved_footprint_tmx_keys.has(tmx_key):
		return true
	var tile_type: String = str(tile_data.get("type", tile_data.get("tileType", ""))).strip_edges().to_lower()
	if _string_array_has(WORLD_CELL_DIRECT_SELECTION_FRAME_TYPES, tile_type):
		return true
	var footprint_id: String = _resolve_world_cell_footprint_id_for_runtime_tile(tile_data)
	return footprint_id != ""


func _draw_world_cell_state_overlay_for_tile(tile_data: Dictionary, center: Vector2, kind: String) -> void:
	if not world_cell_state_overlay_enabled:
		return
	if tile_data.is_empty():
		return
	var state_contract: Dictionary = _resolve_world_cell_state_contract_for_tile(tile_data)
	if state_contract.is_empty():
		return
	var ownership_state: String = _resolve_world_cell_ownership_state_for_tile(tile_data, state_contract)
	var interaction_state: String = _resolve_world_cell_interaction_state_for_tile(tile_data, state_contract)
	if ownership_state == "" and interaction_state == "":
		return
	_draw_tile_diamond_overlay(
		center,
		_resolve_world_cell_state_overlay_fill_color(ownership_state, interaction_state, kind),
		_resolve_world_cell_state_overlay_outline_color(ownership_state, interaction_state, kind),
		max(1.0, _zoom * 1.0)
	)


func _resolve_world_cell_state_contract_for_tile(tile_data: Dictionary) -> Dictionary:
	var composite_id: String = str(tile_data.get("compositeId", "")).strip_edges()
	if composite_id != "":
		var composite_variant: Variant = _world_cell_composite_by_id.get(composite_id, {})
		if composite_variant is Dictionary:
			var composite: Dictionary = composite_variant as Dictionary
			if not str(composite.get("package_id", "")).strip_edges().is_empty():
				return composite
	var footprint_id: String = _resolve_world_cell_footprint_id_for_runtime_tile(tile_data)
	var tile_type: String = str(tile_data.get("type", tile_data.get("tileType", ""))).strip_edges().to_lower()
	if footprint_id == "" and tile_type == "resource":
		footprint_id = WORLD_CELL_FOOTPRINT_RESOURCE_1X1
	var footprint_rule: Dictionary = _get_world_cell_footprint_rule(footprint_id)
	if not footprint_rule.is_empty() and not str(footprint_rule.get("package_id", "")).strip_edges().is_empty():
		return footprint_rule
	return {}


func _resolve_world_cell_ownership_state_for_tile(tile_data: Dictionary, state_contract: Dictionary) -> String:
	var supported_states_variant: Variant = state_contract.get("supported_ownership_states", [])
	var default_state: String = str(state_contract.get("default_ownership_state", "neutral")).strip_edges().to_lower()
	var tile_type: String = str(tile_data.get("type", tile_data.get("tileType", ""))).strip_edges().to_lower()
	var owner_id: String = str(tile_data.get("owner", "")).strip_edges().to_lower()
	var human_faction_id: String = _resolve_human_faction_id().strip_edges().to_lower()
	var resolved_state: String = default_state
	if owner_id != "" and owner_id != "neutral":
		if owner_id == "player" or owner_id == "human" or (human_faction_id != "" and owner_id == human_faction_id):
			resolved_state = "own"
		else:
			resolved_state = "enemy"
	elif tile_type == "player_city":
		resolved_state = "own"
	elif tile_type == "ai_city":
		resolved_state = "enemy"
	return _resolve_world_cell_supported_state(resolved_state, default_state, supported_states_variant)


func _resolve_world_cell_interaction_state_for_tile(tile_data: Dictionary, state_contract: Dictionary) -> String:
	var supported_states_variant: Variant = state_contract.get("supported_interaction_states", [])
	var explicit_state: String = str(tile_data.get("interactionState", "")).strip_edges().to_lower()
	if explicit_state == "disabled" or bool(tile_data.get("disabled", false)):
		return _resolve_world_cell_supported_state("disabled", "", supported_states_variant)
	return _resolve_world_cell_supported_state("selectable", "", supported_states_variant)


func _resolve_world_cell_supported_state(requested_state: String, fallback_state: String, supported_states_variant: Variant) -> String:
	var requested: String = requested_state.strip_edges().to_lower()
	var fallback: String = fallback_state.strip_edges().to_lower()
	if supported_states_variant is Array:
		var supported_states: Array = supported_states_variant as Array
		if requested != "" and _string_array_has(supported_states, requested):
			return requested
		if fallback != "" and _string_array_has(supported_states, fallback):
			return fallback
		if not supported_states.is_empty():
			return str(supported_states[0]).strip_edges().to_lower()
	return requested if requested != "" else fallback


func _resolve_world_cell_state_overlay_outline_color(ownership_state: String, interaction_state: String, kind: String) -> Color:
	if interaction_state == "disabled":
		return Color(0.58, 0.62, 0.62, 0.64 if kind == "selected" else 0.48)
	match ownership_state:
		"own":
			return Color(0.36, 0.82, 1.0, 0.74 if kind == "selected" else 0.54)
		"enemy":
			return Color(1.0, 0.36, 0.30, 0.76 if kind == "selected" else 0.56)
		_:
			return Color(0.98, 0.84, 0.42, 0.58 if kind == "selected" else 0.42)


func _resolve_world_cell_state_overlay_fill_color(ownership_state: String, interaction_state: String, kind: String) -> Color:
	if interaction_state == "disabled":
		return Color(0.30, 0.32, 0.32, 0.070 if kind == "selected" else 0.045)
	match ownership_state:
		"own":
			return Color(0.16, 0.54, 0.86, 0.085 if kind == "selected" else 0.050)
		"enemy":
			return Color(0.86, 0.20, 0.16, 0.090 if kind == "selected" else 0.052)
		_:
			return Color(0.82, 0.66, 0.24, 0.055 if kind == "selected" else 0.034)


func _draw_world_cell_base_state_overlay(center: Vector2, base_entry: Dictionary) -> void:
	if base_entry.is_empty():
		return
	if not bool(base_entry.get("isPerimeter", false)):
		return
	var cell_state: String = str(base_entry.get("cellState", "reserved_base")).strip_edges().to_lower()
	match cell_state:
		"reserved_building_cell":
			_draw_tile_diamond_overlay(
				center,
				Color(0.90, 0.87, 0.60, 0.045),
				Color(0.92, 0.84, 0.42, 0.16),
				max(0.65, _zoom * 0.55)
			)
		"active_building_cell":
			_draw_tile_diamond_overlay(
				center,
				Color(0.40, 0.50, 0.54, 0.028),
				Color(0.72, 0.76, 0.70, 0.14),
				max(0.62, _zoom * 0.52)
			)
			_draw_world_cell_active_corner_marks(center, Color(0.90, 0.84, 0.58, 0.32))
		_:
			return


func _resolve_world_cell_interaction_outline_color(base_color: Color, cell_state: String) -> Color:
	match cell_state:
		"reserved_building_cell":
			return Color(
				min(1.0, base_color.r * 1.06 + 0.06),
				min(1.0, base_color.g * 0.96 + 0.04),
				min(1.0, base_color.b * 0.72 + 0.02),
				min(1.0, base_color.a * 1.02)
			)
		"active_building_cell":
			return Color(
				min(1.0, base_color.r * 0.86 + 0.06),
				min(1.0, base_color.g * 0.96 + 0.04),
				min(1.0, base_color.b * 1.04 + 0.06),
				min(1.0, base_color.a * 1.08)
			)
		_:
			return base_color


func _resolve_world_cell_interaction_fill_color(cell_state: String) -> Color:
	match cell_state:
		"reserved_building_cell":
			return Color(1.0, 0.90, 0.44, 0.040)
		"active_building_cell":
			return Color(0.34, 0.52, 0.66, 0.048)
		_:
			return Color(0.0, 0.0, 0.0, 0.0)


func _resolve_world_cell_overlay_outline_color(kind: String, cell_state: String) -> Color:
	var base_color: Color = Color(1.0, 0.96, 0.70, 0.95)
	if kind == "selected":
		base_color = Color(0.56, 0.82, 1.0, 0.92)
	return _resolve_world_cell_interaction_outline_color(base_color, cell_state)


func _resolve_world_cell_overlay_fill_color(kind: String, cell_state: String) -> Color:
	if kind == "selected":
		match cell_state:
			"reserved_building_cell":
				return Color(1.0, 0.90, 0.48, 0.10)
			"active_building_cell":
				return Color(0.38, 0.66, 1.0, 0.11)
			_:
				return Color(0.36, 0.66, 1.0, 0.0)
	match cell_state:
		"reserved_building_cell":
			return Color(1.0, 0.93, 0.54, 0.08)
		"active_building_cell":
			return Color(0.50, 0.74, 0.96, 0.08)
		_:
			return Color(1.0, 0.96, 0.70, 0.0)


func _draw_world_cell_active_corner_marks(center: Vector2, color: Color) -> void:
	var inset_w: float = max(5.0, _tmx_tile_width * 0.12 * _zoom)
	var inset_h: float = max(2.6, _tmx_tile_height * 0.12 * _zoom)
	var arm_w: float = max(5.0, _tmx_tile_width * 0.07 * _zoom)
	var arm_h: float = max(2.8, _tmx_tile_height * 0.07 * _zoom)
	var width: float = max(0.9, _zoom * 0.90)
	var corners := [
		[
			Vector2(center.x, center.y - _tmx_tile_height * 0.5 * _zoom + inset_h),
			Vector2(-arm_w, arm_h),
			Vector2(arm_w, arm_h),
		],
		[
			Vector2(center.x + _tmx_tile_width * 0.5 * _zoom - inset_w, center.y),
			Vector2(-arm_w, -arm_h),
			Vector2(-arm_w, arm_h),
		],
		[
			Vector2(center.x, center.y + _tmx_tile_height * 0.5 * _zoom - inset_h),
			Vector2(-arm_w, -arm_h),
			Vector2(arm_w, -arm_h),
		],
		[
			Vector2(center.x - _tmx_tile_width * 0.5 * _zoom + inset_w, center.y),
			Vector2(arm_w, -arm_h),
			Vector2(arm_w, arm_h),
		],
	]
	for corner_variant in corners:
		var corner: Array = corner_variant
		_draw_corner_tick(corner[0], corner[1], corner[2], color, width)


func _draw_tile_diamond_overlay(center: Vector2, fill_color: Color, outline_color: Color, outline_width: float) -> void:
	var half_w: float = _tmx_tile_width * 0.5 * _zoom
	var half_h: float = _tmx_tile_height * 0.5 * _zoom
	var points := PackedVector2Array(
		[
			Vector2(center.x, center.y - half_h),
			Vector2(center.x + half_w, center.y),
			Vector2(center.x, center.y + half_h),
			Vector2(center.x - half_w, center.y),
		]
	)
	if fill_color.a > 0.001:
		draw_colored_polygon(points, fill_color)
	var outline := PackedVector2Array(points)
	outline.append(points[0])
	draw_polyline(outline, Color(0.0, 0.0, 0.0, 0.38), outline_width + 2.0)
	draw_polyline(outline, outline_color, outline_width)


func _draw_selected_node_frame(center: Vector2) -> void:
	var half_w: float = _tmx_tile_width * 0.5 * _zoom
	var half_h: float = _tmx_tile_height * 0.5 * _zoom
	var pad_w: float = max(4.0, 7.0 * _zoom)
	var pad_h: float = max(2.0, 4.0 * _zoom)
	var corner_len_w: float = max(10.0, half_w * 0.16)
	var corner_len_h: float = max(5.0, half_h * 0.16)
	var top := Vector2(center.x, center.y - half_h - pad_h)
	var right := Vector2(center.x + half_w + pad_w, center.y)
	var bottom := Vector2(center.x, center.y + half_h + pad_h)
	var left := Vector2(center.x - half_w - pad_w, center.y)
	var color := Color(0.98, 0.83, 0.42, 0.94)
	var width: float = max(1.4, _zoom * 1.6)
	_draw_corner_tick(top, Vector2(-corner_len_w, corner_len_h), Vector2(corner_len_w, corner_len_h), color, width)
	_draw_corner_tick(right, Vector2(-corner_len_w, -corner_len_h), Vector2(-corner_len_w, corner_len_h), color, width)
	_draw_corner_tick(bottom, Vector2(-corner_len_w, -corner_len_h), Vector2(corner_len_w, -corner_len_h), color, width)
	_draw_corner_tick(left, Vector2(corner_len_w, -corner_len_h), Vector2(corner_len_w, corner_len_h), color, width)


func _draw_corner_tick(origin: Vector2, arm_a: Vector2, arm_b: Vector2, color: Color, width: float) -> void:
	draw_line(origin, origin + arm_a, Color(0.0, 0.0, 0.0, 0.38), width + 2.0)
	draw_line(origin, origin + arm_b, Color(0.0, 0.0, 0.0, 0.38), width + 2.0)
	draw_line(origin, origin + arm_a, color, width)
	draw_line(origin, origin + arm_b, color, width)


func _draw_world_cell_placeholder(anchor_entry: Dictionary, cell_center: Vector2) -> bool:
	var placeholder_role: String = str(anchor_entry.get("placeholderRole", "")).strip_edges().to_lower()
	if placeholder_role == "":
		return false
	var fill := Color(0.0, 0.0, 0.0, 0.0)
	var outline := Color(0.70, 0.78, 0.74, 0.60)
	match placeholder_role:
		"river_corridor":
			fill = Color(0.20, 0.37, 0.42, 0.72)
			outline = Color(0.52, 0.80, 0.88, 0.78)
		"mountain_barrier":
			fill = Color(0.30, 0.34, 0.32, 0.82)
			outline = Color(0.74, 0.80, 0.76, 0.72)
		_:
			return false
	_draw_tile_diamond_overlay(
		cell_center,
		fill,
		outline,
		max(0.9, _zoom * 0.95)
	)
	return true


func _draw_terrain_edge_overlays(visible_bounds: Dictionary) -> void:
	if not terrain_edge_overlay_enabled:
		return
	if _terrain_edge_overlay_entries.is_empty():
		return
	if _zoom < 0.32:
		return

	for entry_variant in _terrain_edge_overlay_entries:
		if not (entry_variant is Dictionary):
			continue
		var entry: Dictionary = entry_variant as Dictionary
		var tmx_x: int = int(entry.get("tmxX", -1))
		var tmx_y: int = int(entry.get("tmxY", -1))
		if not _is_tmx_cell_visible(tmx_x, tmx_y, visible_bounds, 1):
			continue
		var center: Vector2 = _tmx_to_screen(tmx_x, tmx_y) + Vector2(0.0, -_tmx_tile_height * 0.05 * _zoom)
		var frame_name: String = str(entry.get("overlayFrame", ""))
		var alpha: float = float(entry.get("alpha", 0.35))
		var rotation: float = float(entry.get("rotation", 0.0))
		var overlay_height: float = float(entry.get("overlayHeight", terrain_edge_overlay_base_height))
		_draw_overlay_frame(frame_name, center, clampf(overlay_height * _zoom, 16.0, 110.0), alpha, rotation)


func _draw_mountain_continuity_overlays(visible_bounds: Dictionary) -> void:
	if not mountain_overlay_enabled:
		return
	if _mountain_overlay_entries.is_empty():
		return
	if _zoom < 0.34:
		return

	for entry_variant in _mountain_overlay_entries:
		if not (entry_variant is Dictionary):
			continue
		var entry: Dictionary = entry_variant as Dictionary
		var tmx_x: int = int(entry.get("tmxX", -1))
		var tmx_y: int = int(entry.get("tmxY", -1))
		if not _is_tmx_cell_visible(tmx_x, tmx_y, visible_bounds, 1):
			continue
		var center: Vector2 = _tmx_to_screen(tmx_x, tmx_y) + Vector2(0.0, -_tmx_tile_height * 0.07 * _zoom)
		var frame_name: String = str(entry.get("overlayFrame", ""))
		var alpha: float = float(entry.get("alpha", 0.40))
		var rotation: float = float(entry.get("rotation", 0.0))
		var overlay_height: float = float(entry.get("overlayHeight", mountain_overlay_base_height))
		_draw_overlay_frame(frame_name, center, clampf(overlay_height * _zoom, 18.0, 110.0), alpha, rotation)


func _draw_home_city_overlays(visible_bounds: Dictionary) -> void:
	if _home_city_overlay_entries.is_empty():
		return

	var font: Font = ThemeDB.fallback_font
	var human_faction_id: String = _resolve_human_faction_id()
	var scale: float = clampf(home_city_overlay_scale, 0.2, 1.8)
	for entry_variant in _home_city_overlay_entries:
		if not (entry_variant is Dictionary):
			continue
		var entry: Dictionary = entry_variant as Dictionary
		var tmx_x: int = int(entry.get("tmxX", -1))
		var tmx_y: int = int(entry.get("tmxY", -1))
		if not _is_tmx_cell_visible(tmx_x, tmx_y, visible_bounds, 2):
			continue

		var center: Vector2 = _tmx_to_screen(tmx_x, tmx_y)
		var faction_id: String = str(entry.get("factionId", "")).strip_edges()
		var is_human: bool = bool(entry.get("isHuman", false))
		var accent: Color = FactionVisualsScript.resolve_marker_color(faction_id, human_faction_id)
		var defend_center: Vector2 = center + Vector2(0.0, -_tmx_tile_height * 0.05 * _zoom * scale)
		var flag_center: Vector2 = center + Vector2(0.0, -_tmx_tile_height * 0.28 * _zoom * scale)
		var defend_drawn: bool = _draw_overlay_frame(
			str(entry.get("homeDefendFrame", "home_defend.png")),
			defend_center,
			clampf(38.0 * _zoom * scale, 10.0, 46.0)
		)
		var flag_drawn: bool = _draw_overlay_frame(
			str(entry.get("flagFrame", "")),
			flag_center,
			clampf(42.0 * _zoom * scale, 10.0, 48.0)
		)
		if not defend_drawn and not flag_drawn:
			var ring_radius: float = clampf(10.0 * _zoom, 3.5, 13.0)
			draw_arc(center, ring_radius, 0.0, TAU, 28, accent, max(1.0, 1.2 * _zoom))

		if not home_city_badge_enabled:
			continue
		if _zoom < 0.38:
			continue
		var label: String = str(entry.get("label", AI_HOME_LABEL))
		var city_level: int = maxi(1, int(entry.get("cityLevel", 1)))
		var badge_text: String = "%s C%d" % [label, city_level]
		var badge_size := Vector2(clampf(46.0 * _zoom * scale, 20.0, 64.0), clampf(18.0 * _zoom * scale, 10.0, 28.0))
		var badge_center := center + Vector2(0.0, -_tmx_tile_height * 0.26 * _zoom * scale)
		var badge_rect := Rect2(badge_center - badge_size * 0.5, badge_size)
		draw_rect(badge_rect, Color(accent.r, accent.g, accent.b, 0.85), true)
		draw_rect(badge_rect, Color(0.08, 0.08, 0.08, 0.75), false, 1.0)
		if font != null:
			var font_size: int = int(clampf(11.0 * _zoom, 8.0, 14.0))
			_draw_centered_text(font, badge_center + Vector2(0.0, badge_size.y * 0.25), badge_text, font_size, Color(0.05, 0.05, 0.05, 0.95))


func _draw_centered_text(font: Font, baseline_center: Vector2, text: String, font_size: int, color: Color) -> void:
	if font == null:
		return
	draw_string(font, baseline_center, text, HORIZONTAL_ALIGNMENT_CENTER, -1.0, font_size, color)


func _is_tmx_cell_visible(tmx_x: int, tmx_y: int, visible_bounds: Dictionary, margin: int = 0) -> bool:
	var start_x: int = int(visible_bounds.get("startX", 0)) - margin
	var end_x: int = int(visible_bounds.get("endX", -1)) + margin
	var start_y: int = int(visible_bounds.get("startY", 0)) - margin
	var end_y: int = int(visible_bounds.get("endY", -1)) + margin
	return tmx_x >= start_x and tmx_x <= end_x and tmx_y >= start_y and tmx_y <= end_y


func _resource_level_color(level: int) -> Color:
	match clampi(level, 1, 5):
		1:
			return Color(0.73, 0.87, 0.66, 0.90)
		2:
			return Color(0.58, 0.84, 0.95, 0.91)
		3:
			return Color(0.98, 0.86, 0.56, 0.93)
		4:
			return Color(0.99, 0.70, 0.42, 0.94)
		5:
			return Color(0.95, 0.50, 0.45, 0.96)
		_:
			return Color(0.72, 0.84, 0.70, 0.90)


func _refresh_home_city_overlay_entries(world_payload: Dictionary) -> void:
	_home_city_overlay_entries = []
	if (_city_overlay_by_tile_id.is_empty() and _world_city_overlay_by_tile_id.is_empty()) or world_payload.is_empty():
		return
	var factions_variant: Variant = world_payload.get("factions", {})
	var human_faction_id: String = _resolve_human_faction_id()
	if factions_variant is Dictionary:
		var factions_map: Dictionary = factions_variant as Dictionary
		for faction_key in factions_map.keys():
			var faction_id: String = str(faction_key).strip_edges()
			var faction_data: Variant = factions_map.get(faction_key, {})
			if faction_id == "" or not (faction_data is Dictionary):
				continue
			_try_append_home_city_entry(faction_id, faction_data as Dictionary, human_faction_id)
	elif factions_variant is Array:
		for faction_variant in factions_variant:
			if not (faction_variant is Dictionary):
				continue
			var faction_data: Dictionary = faction_variant as Dictionary
			var faction_id: String = str(faction_data.get("id", faction_data.get("factionId", ""))).strip_edges()
			if faction_id == "":
				continue
			_try_append_home_city_entry(faction_id, faction_data, human_faction_id)


func _try_append_home_city_entry(faction_id: String, faction_data: Dictionary, human_faction_id: String) -> void:
	var hero_command: Dictionary = faction_data.get("heroCommand", {}) as Dictionary
	var home_tile_id: String = str(hero_command.get("homeTileId", faction_data.get("homeTileId", ""))).strip_edges()
	var city_entry: Dictionary = _resolve_city_entry_for_home(home_tile_id, faction_id)
	if city_entry.is_empty():
		return
	var resolved_tile_id: String = str(city_entry.get("tileId", home_tile_id)).strip_edges()
	if resolved_tile_id == "":
		return
	var is_human: bool = faction_id == human_faction_id
	var city_level: int = int(city_entry.get("cityLevel", 1))
	_home_city_overlay_entries.append(
		{
			"tileId": resolved_tile_id,
			"title": str(city_entry.get("title", resolved_tile_id)).strip_edges(),
			"tileX": int(city_entry.get("x", city_entry.get("backendX", -1))),
			"tileY": int(city_entry.get("y", city_entry.get("backendY", -1))),
			"tmxX": int(city_entry.get("tmxX", -1)),
			"tmxY": int(city_entry.get("tmxY", -1)),
			"cityLevel": city_level,
			"factionId": faction_id,
			"isHuman": is_human,
			"label": HUMAN_HOME_LABEL if is_human else AI_HOME_LABEL,
			"flagFrame": _resolve_home_city_flag_frame(faction_id, human_faction_id, city_level),
			"homeDefendFrame": "home_defend.png",
		}
	)


func _resolve_city_entry_for_home(home_tile_id: String, faction_id: String) -> Dictionary:
	if home_tile_id != "":
		var local_entry: Dictionary = _city_overlay_by_tile_id.get(home_tile_id, {}) as Dictionary
		if not local_entry.is_empty():
			return local_entry
		var world_entry: Dictionary = _world_city_overlay_by_tile_id.get(home_tile_id, {}) as Dictionary
		if not world_entry.is_empty():
			return world_entry

	var owner_hint: String = faction_id.strip_edges().to_lower()
	if owner_hint == "":
		return {}
	return _resolve_city_entry_by_owner(owner_hint)


func _resolve_city_entry_by_owner(owner_id: String) -> Dictionary:
	var normalized_owner: String = owner_id.strip_edges().to_lower()
	if normalized_owner == "":
		return {}

	var best_level: int = -1
	var best_entry: Dictionary = {}
	var sources: Array = [_city_overlay_by_tile_id, _world_city_overlay_by_tile_id]
	for source_variant in sources:
		if not (source_variant is Dictionary):
			continue
		var source: Dictionary = source_variant as Dictionary
		for entry_variant in source.values():
			if not (entry_variant is Dictionary):
				continue
			var entry: Dictionary = entry_variant as Dictionary
			var entry_owner: String = str(entry.get("owner", "")).strip_edges().to_lower()
			if entry_owner != normalized_owner:
				continue
			var level: int = maxi(1, int(entry.get("cityLevel", 1)))
			if level > best_level:
				best_level = level
				best_entry = entry
	return best_entry


func _resolve_human_faction_id() -> String:
	var session_faction_id: String = SessionStore.faction_id.strip_edges()
	if session_faction_id != "":
		return session_faction_id
	return "player"


func _rebuild_world_cell_runtime_entries(world_cell_entries: Array) -> void:
	_world_cell_node_base_by_tmx_key = {}
	_world_cell_node_anchor_by_tmx_key = {}
	_world_cell_reserved_footprint_tmx_keys = {}
	_world_cell_reserved_anchor_by_tmx_key = {}
	_world_cell_reserved_center_by_tmx_key = {}
	_ensure_world_cell_runtime_builder_stats()
	if world_cell_entries.is_empty():
		return

	var grouped_entries: Dictionary = {}
	for entry_variant in world_cell_entries:
		if not (entry_variant is Dictionary):
			continue
		var entry: Dictionary = entry_variant as Dictionary
		var tmx_x: int = int(entry.get("tmxX", -1))
		var tmx_y: int = int(entry.get("tmxY", -1))
		if tmx_x < 0 or tmx_y < 0:
			continue
		var group_key: String = str(entry.get("groupKey", entry.get("tileId", entry.get("id", "")))).strip_edges()
		if group_key == "":
			group_key = _coord_key(tmx_x, tmx_y)
		if not grouped_entries.has(group_key):
			grouped_entries[group_key] = []
		var group: Array = grouped_entries[group_key] as Array
		group.append(entry)

	var runtime_groups: Array = []
	for group_key_variant in grouped_entries.keys():
		runtime_groups.append(grouped_entries[group_key_variant] as Array)
	runtime_groups.sort_custom(Callable(self, "_compare_world_cell_runtime_group_priority"))
	for group_variant in runtime_groups:
		var group_entries: Array = group_variant as Array
		_register_world_cell_runtime_group(group_entries)


func _compare_world_cell_runtime_group_priority(a: Array, b: Array) -> bool:
	var a_priority: int = _resolve_world_cell_runtime_group_priority(a)
	var b_priority: int = _resolve_world_cell_runtime_group_priority(b)
	if a_priority != b_priority:
		return a_priority < b_priority
	return a.size() > b.size()


func _resolve_world_cell_runtime_group_priority(group_entries: Array) -> int:
	if group_entries.is_empty():
		return 999
	var anchor_entry: Dictionary = _pick_world_cell_runtime_anchor_entry(group_entries)
	var tile_type: String = _resolve_world_cell_runtime_type(anchor_entry, str(anchor_entry.get("footprintId", "")))
	var strategy: String = _resolve_world_cell_runtime_strategy_for_type(tile_type)
	return _resolve_world_cell_runtime_strategy_priority(strategy, tile_type)


func _register_world_cell_runtime_group(group_entries: Array) -> void:
	var runtime_group: Dictionary = _build_world_cell_runtime_group(group_entries)
	if runtime_group.is_empty():
		return
	var anchor_key: String = str(runtime_group.get("anchorKey", "")).strip_edges()
	var footprint_id: String = str(runtime_group.get("footprintId", "")).strip_edges()
	var footprint_center: Vector2i = runtime_group.get("footprintCenterTmx", Vector2i(-1, -1)) as Vector2i
	var anchor_visual_entry: Dictionary = runtime_group.get("anchorVisualEntry", {}) as Dictionary
	var stats_type: String = _resolve_world_cell_runtime_group_stats_type(group_entries, runtime_group)
	if anchor_key == "" or footprint_id == "" or footprint_center.x < 0 or footprint_center.y < 0 or anchor_visual_entry.is_empty():
		_record_world_cell_runtime_skipped_invalid(stats_type)
		return
	var conflict: Dictionary = _resolve_world_cell_footprint_conflict_at(footprint_center.x, footprint_center.y, footprint_id, anchor_key)
	if not conflict.is_empty():
		_record_world_cell_runtime_skipped_conflict(stats_type, conflict, runtime_group)
		push_warning("[world-cell] runtime group skipped by reserved footprint conflict | anchor=%s footprint=%s" % [anchor_key, footprint_id])
		return
	if _world_cell_node_anchor_by_tmx_key.has(anchor_key):
		var previous_anchor_variant: Variant = _world_cell_node_anchor_by_tmx_key.get(anchor_key, {})
		var previous_anchor: Dictionary = previous_anchor_variant as Dictionary if previous_anchor_variant is Dictionary else {}
		_record_world_cell_runtime_duplicate_last_write(stats_type, previous_anchor, runtime_group)
	_record_world_cell_runtime_registered_attempt(stats_type)
	_world_cell_node_anchor_by_tmx_key[anchor_key] = anchor_visual_entry
	_populate_world_cell_base_entries(
		footprint_center.x,
		footprint_center.y,
		footprint_id,
		anchor_key,
		anchor_visual_entry
	)
	_reserve_world_cell_footprint_at(
		footprint_center.x,
		footprint_center.y,
		footprint_id,
		anchor_key
	)


func _can_reserve_world_cell_footprint_at(center_tmx_x: int, center_tmx_y: int, footprint_id: String, anchor_key: String) -> bool:
	return _resolve_world_cell_footprint_conflict_at(center_tmx_x, center_tmx_y, footprint_id, anchor_key).is_empty()


func _resolve_world_cell_footprint_conflict_at(center_tmx_x: int, center_tmx_y: int, footprint_id: String, anchor_key: String) -> Dictionary:
	if not _does_world_cell_placement_policy_apply(footprint_id, WORLD_CELL_PLACEMENT_ACTION_RESERVE_CELLS):
		return {}
	var offsets: Array = _resolve_world_cell_footprint_offsets(footprint_id, [3, 3])
	for offset_variant in offsets:
		var offset: Vector2i = _vector2i_from_json_array(offset_variant, Vector2i.ZERO)
		var tmx_x: int = clampi(center_tmx_x + offset.x, 0, maxi(0, _tmx_map_width - 1))
		var tmx_y: int = clampi(center_tmx_y + offset.y, 0, maxi(0, _tmx_map_height - 1))
		var tmx_key: String = _coord_key(tmx_x, tmx_y)
		var existing_anchor_key: String = str(_world_cell_reserved_anchor_by_tmx_key.get(tmx_key, "")).strip_edges()
		if existing_anchor_key != "" and existing_anchor_key != anchor_key:
			var existing_anchor_variant: Variant = _world_cell_node_anchor_by_tmx_key.get(existing_anchor_key, {})
			var existing_anchor: Dictionary = existing_anchor_variant as Dictionary if existing_anchor_variant is Dictionary else {}
			return {
				"tmxKey": tmx_key,
				"tmx": [tmx_x, tmx_y],
				"footprintOffset": [offset.x, offset.y],
				"existingAnchorKey": existing_anchor_key,
				"existingFootprintId": str(_world_cell_reserved_footprint_tmx_keys.get(tmx_key, "")).strip_edges(),
				"existingType": str(existing_anchor.get("type", "")).strip_edges(),
				"existingTileId": str(existing_anchor.get("tileId", existing_anchor.get("id", ""))).strip_edges(),
				"nextAnchorKey": anchor_key,
				"nextFootprintId": footprint_id,
			}
	return {}


func _reset_world_cell_runtime_builder_stats() -> void:
	_world_cell_runtime_builder_stats = {
		"rawBackendNodeCounts": {},
		"registeredAttemptCounts": {},
		"registeredAnchorCounts": {},
		"registeredAnchorCountsSemantics": "registered_attempts_before_duplicate_last_write",
		"duplicateAnchorCounts": {},
		"duplicateAnchorPolicy": WORLD_CELL_DUPLICATE_ANCHOR_POLICY,
		"skippedConflictCounts": {},
		"skippedInvalidCounts": {},
		"skippedConflictSamples": {},
		"duplicateAnchorSamples": {},
	}


func _ensure_world_cell_runtime_builder_stats() -> void:
	if _world_cell_runtime_builder_stats.is_empty():
		_reset_world_cell_runtime_builder_stats()


func _record_world_cell_runtime_raw_backend_node(node_type: String) -> void:
	_increment_world_cell_runtime_builder_stat("rawBackendNodeCounts", node_type)


func _record_world_cell_runtime_registered_attempt(node_type: String) -> void:
	_increment_world_cell_runtime_builder_stat("registeredAttemptCounts", node_type)
	_increment_world_cell_runtime_builder_stat("registeredAnchorCounts", node_type)


func _record_world_cell_runtime_skipped_invalid(node_type: String) -> void:
	_increment_world_cell_runtime_builder_stat("skippedInvalidCounts", node_type)


func _record_world_cell_runtime_skipped_conflict(node_type: String, conflict: Dictionary, runtime_group: Dictionary) -> void:
	_increment_world_cell_runtime_builder_stat("skippedConflictCounts", node_type)
	_append_world_cell_runtime_builder_conflict_sample(node_type, conflict, runtime_group)


func _record_world_cell_runtime_duplicate_last_write(node_type: String, previous_anchor: Dictionary, runtime_group: Dictionary) -> void:
	_increment_world_cell_runtime_builder_stat("duplicateAnchorCounts", node_type)
	_append_world_cell_runtime_builder_duplicate_anchor_sample(node_type, previous_anchor, runtime_group)


func _increment_world_cell_runtime_builder_stat(bucket_name: String, node_type: String) -> void:
	_ensure_world_cell_runtime_builder_stats()
	var normalized_type: String = node_type.strip_edges().to_lower()
	if normalized_type == "":
		normalized_type = "unknown"
	var bucket_variant: Variant = _world_cell_runtime_builder_stats.get(bucket_name, {})
	var bucket: Dictionary = bucket_variant as Dictionary if bucket_variant is Dictionary else {}
	bucket[normalized_type] = int(bucket.get(normalized_type, 0)) + 1
	bucket["total"] = int(bucket.get("total", 0)) + 1
	_world_cell_runtime_builder_stats[bucket_name] = bucket


func _append_world_cell_runtime_builder_conflict_sample(node_type: String, conflict: Dictionary, runtime_group: Dictionary) -> void:
	_ensure_world_cell_runtime_builder_stats()
	var normalized_type: String = node_type.strip_edges().to_lower()
	if normalized_type == "":
		normalized_type = "unknown"
	var samples_variant: Variant = _world_cell_runtime_builder_stats.get("skippedConflictSamples", {})
	var samples_by_type: Dictionary = samples_variant as Dictionary if samples_variant is Dictionary else {}
	var type_samples_variant: Variant = samples_by_type.get(normalized_type, [])
	var type_samples: Array = type_samples_variant as Array if type_samples_variant is Array else []
	if type_samples.size() >= WORLD_CELL_RUNTIME_AUDIT_SAMPLE_LIMIT:
		samples_by_type[normalized_type] = type_samples
		_world_cell_runtime_builder_stats["skippedConflictSamples"] = samples_by_type
		return
	var anchor_entry: Dictionary = runtime_group.get("anchorEntry", {}) as Dictionary
	var footprint_center: Vector2i = runtime_group.get("footprintCenterTmx", Vector2i(-1, -1)) as Vector2i
	var conflict_tmx_key: String = str(conflict.get("tmxKey", "")).strip_edges()
	type_samples.append({
		"nodeType": normalized_type,
		"anchorKey": str(runtime_group.get("anchorKey", "")).strip_edges(),
		"footprintId": str(runtime_group.get("footprintId", "")).strip_edges(),
		"footprintCenterTmx": [footprint_center.x, footprint_center.y],
		"tileId": str(anchor_entry.get("tileId", anchor_entry.get("id", ""))).strip_edges(),
		"backend": [
			int(anchor_entry.get("backendX", anchor_entry.get("x", 0))),
			int(anchor_entry.get("backendY", anchor_entry.get("y", 0))),
		],
		"conflict": conflict.duplicate(true),
		"placementContextMatches": _build_world_cell_placement_context_matches_at_tmx_key(conflict_tmx_key),
	})
	samples_by_type[normalized_type] = type_samples
	_world_cell_runtime_builder_stats["skippedConflictSamples"] = samples_by_type


func _append_world_cell_runtime_builder_duplicate_anchor_sample(node_type: String, previous_anchor: Dictionary, runtime_group: Dictionary) -> void:
	_ensure_world_cell_runtime_builder_stats()
	var normalized_type: String = node_type.strip_edges().to_lower()
	if normalized_type == "":
		normalized_type = "unknown"
	var samples_variant: Variant = _world_cell_runtime_builder_stats.get("duplicateAnchorSamples", {})
	var samples_by_type: Dictionary = samples_variant as Dictionary if samples_variant is Dictionary else {}
	var type_samples_variant: Variant = samples_by_type.get(normalized_type, [])
	var type_samples: Array = type_samples_variant as Array if type_samples_variant is Array else []
	if type_samples.size() >= WORLD_CELL_RUNTIME_AUDIT_SAMPLE_LIMIT:
		samples_by_type[normalized_type] = type_samples
		_world_cell_runtime_builder_stats["duplicateAnchorSamples"] = samples_by_type
		return
	var anchor_entry: Dictionary = runtime_group.get("anchorEntry", {}) as Dictionary
	var footprint_center: Vector2i = runtime_group.get("footprintCenterTmx", Vector2i(-1, -1)) as Vector2i
	var anchor_key: String = str(runtime_group.get("anchorKey", "")).strip_edges()
	type_samples.append({
		"nodeType": normalized_type,
		"anchorKey": anchor_key,
		"policy": WORLD_CELL_DUPLICATE_ANCHOR_POLICY,
		"nextFootprintId": str(runtime_group.get("footprintId", "")).strip_edges(),
		"nextTileId": str(anchor_entry.get("tileId", anchor_entry.get("id", ""))).strip_edges(),
		"nextBackend": [
			int(anchor_entry.get("backendX", anchor_entry.get("x", 0))),
			int(anchor_entry.get("backendY", anchor_entry.get("y", 0))),
		],
		"nextFootprintCenterTmx": [footprint_center.x, footprint_center.y],
		"previousFootprintId": str(previous_anchor.get("footprintId", "")).strip_edges(),
		"previousTileId": str(previous_anchor.get("tileId", previous_anchor.get("id", ""))).strip_edges(),
		"previousType": str(previous_anchor.get("type", "")).strip_edges(),
		"placementContextMatches": _build_world_cell_placement_context_matches_at_tmx_key(anchor_key),
		"ownership": {
			"policy": WORLD_CELL_DUPLICATE_ANCHOR_POLICY,
			"previous": _build_world_cell_runtime_anchor_ownership_summary(previous_anchor),
			"next": _build_world_cell_runtime_anchor_ownership_summary(anchor_entry, runtime_group),
		},
	})
	samples_by_type[normalized_type] = type_samples
	_world_cell_runtime_builder_stats["duplicateAnchorSamples"] = samples_by_type


func _build_world_cell_runtime_anchor_ownership_summary(anchor_entry: Dictionary, runtime_group: Dictionary = {}) -> Dictionary:
	var footprint_center: Vector2i = runtime_group.get("footprintCenterTmx", Vector2i(-1, -1)) as Vector2i
	var summary := {
		"anchorKey": str(runtime_group.get("anchorKey", anchor_entry.get("anchorKey", ""))).strip_edges(),
		"type": str(anchor_entry.get("type", "")).strip_edges(),
		"footprintId": str(runtime_group.get("footprintId", anchor_entry.get("footprintId", ""))).strip_edges(),
		"tileId": str(anchor_entry.get("tileId", anchor_entry.get("id", ""))).strip_edges(),
		"owner": str(anchor_entry.get("owner", "")).strip_edges(),
		"compositeId": str(anchor_entry.get("compositeId", "")).strip_edges(),
		"backend": [
			int(anchor_entry.get("backendX", anchor_entry.get("x", 0))),
			int(anchor_entry.get("backendY", anchor_entry.get("y", 0))),
		],
	}
	if footprint_center.x >= 0 and footprint_center.y >= 0:
		summary["footprintCenterTmx"] = [footprint_center.x, footprint_center.y]
	return summary


func _resolve_world_cell_runtime_group_stats_type(group_entries: Array, runtime_group: Dictionary = {}) -> String:
	var anchor_entry: Dictionary = {}
	if not runtime_group.is_empty():
		var runtime_anchor_variant: Variant = runtime_group.get("anchorEntry", {})
		if runtime_anchor_variant is Dictionary:
			anchor_entry = runtime_anchor_variant as Dictionary
	if anchor_entry.is_empty():
		anchor_entry = _pick_world_cell_runtime_anchor_entry(group_entries)
	var footprint_id: String = str(runtime_group.get("footprintId", anchor_entry.get("footprintId", ""))).strip_edges()
	var node_type: String = _resolve_world_cell_runtime_type(anchor_entry, footprint_id)
	if node_type != "":
		return node_type
	if footprint_id != "":
		var footprint_rule: Dictionary = _get_world_cell_footprint_rule(footprint_id)
		node_type = str(footprint_rule.get("role", "")).strip_edges().to_lower()
		if node_type != "":
			return node_type
	return "unknown"


func _resolve_world_cell_runtime_builder_stats_snapshot() -> Dictionary:
	_ensure_world_cell_runtime_builder_stats()
	return _world_cell_runtime_builder_stats.duplicate(true)


func _build_world_cell_runtime_group(group_entries: Array) -> Dictionary:
	if group_entries.is_empty():
		return {}
	var anchor_entry: Dictionary = _pick_world_cell_runtime_anchor_entry(group_entries)
	var group_size: int = group_entries.size()
	if anchor_entry.is_empty():
		return {}
	var anchor_key: String = _coord_key(int(anchor_entry.get("tmxX", -1)), int(anchor_entry.get("tmxY", -1)))
	var footprint_id: String = _resolve_world_cell_runtime_footprint_id(anchor_entry, group_size)
	if footprint_id == "":
		return {}
	var composite_id: String = _resolve_world_cell_runtime_composite_id(anchor_entry, footprint_id, group_size)
	var footprint_center: Vector2i = _resolve_world_cell_runtime_footprint_center_tmx(anchor_entry, group_entries)
	var anchor_visual_entry: Dictionary = _build_world_cell_anchor_visual_entry(
		anchor_entry,
		group_entries,
		footprint_id,
		composite_id,
		group_size
	)
	anchor_visual_entry["anchorKey"] = anchor_key
	return {
		"anchorKey": anchor_key,
		"anchorEntry": anchor_entry,
		"anchorVisualEntry": anchor_visual_entry,
		"footprintId": footprint_id,
		"compositeId": composite_id,
		"footprintCenterTmx": footprint_center,
		"groupSize": group_size,
	}

func _pick_world_cell_runtime_anchor_entry(group_entries: Array) -> Dictionary:
	if group_entries.is_empty():
		return {}
	var center_x: float = 0.0
	var center_y: float = 0.0
	for entry_variant in group_entries:
		var entry: Dictionary = entry_variant as Dictionary
		center_x += float(entry.get("backendX", 0))
		center_y += float(entry.get("backendY", 0))
	center_x /= float(group_entries.size())
	center_y /= float(group_entries.size())

	var best_entry: Dictionary = {}
	var best_score: float = INF
	var best_level: int = -1
	for entry_variant in group_entries:
		if not (entry_variant is Dictionary):
			continue
		var entry: Dictionary = entry_variant as Dictionary
		var dx: float = float(entry.get("backendX", 0)) - center_x
		var dy: float = float(entry.get("backendY", 0)) - center_y
		var level: int = maxi(1, int(entry.get("cityLevel", 1)))
		var score: float = dx * dx + dy * dy - float(level) * 0.015
		if score < best_score or (is_equal_approx(score, best_score) and level > best_level):
			best_score = score
			best_level = level
			best_entry = entry
	return best_entry


func _resolve_world_cell_runtime_group_anchor_offset(group_entries: Array, anchor_entry: Dictionary) -> Array:
	if group_entries.size() <= 1 or anchor_entry.is_empty():
		return [0.0, 0.0]
	var center_x: float = 0.0
	var center_y: float = 0.0
	var valid_count: int = 0
	for entry_variant in group_entries:
		if not (entry_variant is Dictionary):
			continue
		var entry: Dictionary = entry_variant as Dictionary
		center_x += float(entry.get("tmxX", 0))
		center_y += float(entry.get("tmxY", 0))
		valid_count += 1
	if valid_count <= 0:
		return [0.0, 0.0]
	center_x /= float(valid_count)
	center_y /= float(valid_count)

	var locked_center_x: float = float(int(round(center_x)))
	var locked_center_y: float = float(int(round(center_y)))
	var delta_x: float = locked_center_x - float(anchor_entry.get("tmxX", locked_center_x))
	var delta_y: float = locked_center_y - float(anchor_entry.get("tmxY", locked_center_y))
	return [
		(delta_x - delta_y) * _tmx_tile_width * 0.5,
		(delta_x + delta_y) * _tmx_tile_height * 0.5,
	]


func _build_world_cell_anchor_visual_entry(
	anchor_entry: Dictionary,
	group_entries: Array,
	footprint_id: String,
	composite_id: String,
	group_size: int
) -> Dictionary:
	var visual_entry: Dictionary = anchor_entry.duplicate(true)
	visual_entry["compositeId"] = composite_id
	visual_entry["alpha"] = float(anchor_entry.get("alpha", 1.0))
	visual_entry["groupSize"] = group_size
	visual_entry["tmxX"] = int(anchor_entry.get("tmxX", -1))
	visual_entry["tmxY"] = int(anchor_entry.get("tmxY", -1))
	visual_entry["footprintId"] = footprint_id
	visual_entry["footprintTiles"] = _resolve_world_cell_footprint_tiles(footprint_id, [1, 1])
	visual_entry["offset"] = _resolve_world_cell_anchor_visual_offset(anchor_entry, group_entries)
	if str(visual_entry.get("type", "")).strip_edges() == "":
		visual_entry["type"] = _resolve_world_cell_runtime_type(anchor_entry, footprint_id)
	if str(visual_entry.get("id", "")).strip_edges() == "":
		var anchor_id: String = str(anchor_entry.get("tileId", anchor_entry.get("id", ""))).strip_edges()
		if anchor_id == "":
			anchor_id = "world_cell_%s" % _coord_key(int(anchor_entry.get("tmxX", -1)), int(anchor_entry.get("tmxY", -1))).replace(":", "_")
		visual_entry["id"] = anchor_id
	var composite: Dictionary = _get_world_cell_composite(composite_id)
	var rule: Dictionary = _get_world_cell_footprint_rule(footprint_id)
	var render_mode: String = str(composite.get("render_mode", rule.get("render_mode", ""))).strip_edges()
	if _should_world_cell_runtime_consume_payload_slots(render_mode, composite):
		var anchor_layers: Array = _resolve_world_cell_anchor_layers(composite)
		if not anchor_layers.is_empty():
			visual_entry["layeredLayers"] = anchor_layers
		var payload_slots: Array = _resolve_world_cell_payload_slots(composite, anchor_entry, footprint_id, group_size)
		if not payload_slots.is_empty():
			visual_entry["payloadSlots"] = payload_slots
	return visual_entry


func _should_world_cell_runtime_consume_payload_slots(render_mode: String, composite: Dictionary) -> bool:
	match render_mode.strip_edges().to_lower():
		"layered_city", "layered_node", "payload_node":
			return true
	var payload_slots_variant: Variant = composite.get("payload_slots", [])
	return payload_slots_variant is Array and not (payload_slots_variant as Array).is_empty()


func _resolve_world_cell_anchor_visual_offset(anchor_entry: Dictionary, group_entries: Array) -> Array:
	if group_entries.size() > 1:
		return _resolve_world_cell_runtime_group_anchor_offset(group_entries, anchor_entry)
	var explicit_offset: Variant = anchor_entry.get("offset", [0.0, 0.0])
	if explicit_offset is Array:
		var offset_values: Array = explicit_offset as Array
		if offset_values.size() >= 2:
			return [float(offset_values[0]), float(offset_values[1])]
	return [0.0, 0.0]


func _resolve_world_cell_runtime_footprint_center_tmx(anchor_entry: Dictionary, group_entries: Array) -> Vector2i:
	var center_tmx_x: float = float(anchor_entry.get("tmxX", -1))
	var center_tmx_y: float = float(anchor_entry.get("tmxY", -1))
	if group_entries.size() > 1:
		center_tmx_x = 0.0
		center_tmx_y = 0.0
		var valid_count: int = 0
		for entry_variant in group_entries:
			if not (entry_variant is Dictionary):
				continue
			var entry: Dictionary = entry_variant as Dictionary
			center_tmx_x += float(entry.get("tmxX", 0))
			center_tmx_y += float(entry.get("tmxY", 0))
			valid_count += 1
		if valid_count > 0:
			center_tmx_x /= float(valid_count)
			center_tmx_y /= float(valid_count)
	return Vector2i(int(round(center_tmx_x)), int(round(center_tmx_y)))


func _populate_world_cell_base_entries(
	center_tmx_x: int,
	center_tmx_y: int,
	footprint_id: String,
	anchor_key: String,
	anchor_visual_entry: Dictionary
) -> void:
	var rule: Dictionary = _get_world_cell_footprint_rule(footprint_id)
	if rule.is_empty():
		return
	var base_mode: String = str(rule.get("base_mode", "frame")).strip_edges().to_lower()
	if base_mode == "":
		base_mode = "frame"
	if base_mode == "none":
		return
	var base_frame: String = str(rule.get("base_frame", "")).strip_edges()
	if base_mode != "free_cell_base" and base_frame == "":
		return
	var base_alpha: float = float(rule.get("base_alpha", 0.96))
	var base_scale: float = float(rule.get("base_scale", 1.0))
	var base_offset: Array = rule.get("base_offset", [0.0, 0.0]) as Array
	var payload_state_by_offset: Dictionary = _build_world_cell_payload_state_by_offset(
		anchor_visual_entry.get("payloadSlots", [])
	)
	var offsets: Array = _resolve_world_cell_footprint_offsets(footprint_id, [3, 3])
	for offset_variant in offsets:
		var offset: Vector2i = _vector2i_from_json_array(offset_variant, Vector2i.ZERO)
		var tmx_x: int = clampi(center_tmx_x + offset.x, 0, maxi(0, _tmx_map_width - 1))
		var tmx_y: int = clampi(center_tmx_y + offset.y, 0, maxi(0, _tmx_map_height - 1))
		var tmx_key: String = _coord_key(tmx_x, tmx_y)
		var existing_base_variant: Variant = _world_cell_node_base_by_tmx_key.get(tmx_key, {})
		if existing_base_variant is Dictionary:
			var existing_base: Dictionary = existing_base_variant as Dictionary
			var existing_anchor_key: String = str(existing_base.get("anchorKey", "")).strip_edges()
			if existing_anchor_key != "" and existing_anchor_key != anchor_key:
				push_warning("[world-cell] footprint base conflict skipped | tmx=%s footprint=%s existingAnchor=%s nextAnchor=%s" % [tmx_key, footprint_id, existing_anchor_key, anchor_key])
				continue
		var offset_key: String = _coord_key(offset.x, offset.y)
		var payload_meta: Dictionary = payload_state_by_offset.get(offset_key, {}) as Dictionary
		var is_perimeter: bool = _is_world_cell_perimeter_offset(offset, rule.get("footprint_tiles", [3, 3]) as Array)
		_world_cell_node_base_by_tmx_key[tmx_key] = {
			"tmxX": tmx_x,
			"tmxY": tmx_y,
			"frame": base_frame,
			"baseMode": base_mode,
			"alpha": base_alpha,
			"scale": base_scale,
			"offset": base_offset,
			"anchorKey": anchor_key,
			"footprintId": footprint_id,
			"cellState": str(payload_meta.get("cellState", "reserved_base")),
			"slotId": str(payload_meta.get("slotId", "")).strip_edges(),
			"isPerimeter": is_perimeter,
			"footprintOffset": [offset.x, offset.y],
		}


func _reserve_world_cell_footprint_at(center_tmx_x: int, center_tmx_y: int, footprint_id: String, anchor_key: String) -> void:
	if not _does_world_cell_placement_policy_apply(footprint_id, WORLD_CELL_PLACEMENT_ACTION_RESERVE_CELLS):
		return
	var offsets: Array = _resolve_world_cell_footprint_offsets(footprint_id, [3, 3])
	for offset_variant in offsets:
		var offset: Vector2i = _vector2i_from_json_array(offset_variant, Vector2i.ZERO)
		var tmx_x: int = clampi(center_tmx_x + offset.x, 0, maxi(0, _tmx_map_width - 1))
		var tmx_y: int = clampi(center_tmx_y + offset.y, 0, maxi(0, _tmx_map_height - 1))
		var tmx_key: String = _coord_key(tmx_x, tmx_y)
		var existing_anchor_key: String = str(_world_cell_reserved_anchor_by_tmx_key.get(tmx_key, "")).strip_edges()
		if existing_anchor_key != "" and existing_anchor_key != anchor_key:
			push_warning("[world-cell] footprint reservation conflict skipped | tmx=%s footprint=%s existingAnchor=%s nextAnchor=%s" % [tmx_key, footprint_id, existing_anchor_key, anchor_key])
			continue
		_world_cell_reserved_footprint_tmx_keys[tmx_key] = footprint_id
		_world_cell_reserved_anchor_by_tmx_key[tmx_key] = anchor_key
		_world_cell_reserved_center_by_tmx_key[tmx_key] = [center_tmx_x, center_tmx_y]


func _rebuild_world_cell_preview_entries() -> void:
	_world_cell_preview_tile_by_tmx_key = {}
	_world_cell_preview_focus_tiles = {}
	_world_cell_preview_sample_by_id = {}
	_world_cell_preview_sample_order = []
	_world_cell_preview_placement_audit_by_sample_id = {}
	if _is_world_cell_live_capture_requested():
		return
	if not world_cell_preview_nodes_enabled:
		return
	if _tmx_map_width <= 0 or _tmx_map_height <= 0:
		return
	var preview_layout: Dictionary = _resolve_world_cell_preview_layout()
	var samples_variant: Variant = preview_layout.get("samples", [])
	if not (samples_variant is Array):
		return
	var samples: Array = samples_variant as Array
	for sample_variant in samples:
		if not (sample_variant is Dictionary):
			continue
		var sample: Dictionary = sample_variant as Dictionary
		var footprint_id: String = str(sample.get("footprintId", "")).strip_edges()
		if footprint_id == "":
			continue
		var preferred_tmx: Vector2i = _vector2i_from_json_array(sample.get("preferredTmx", []), Vector2i(-1, -1))
		var sample_id: String = str(sample.get("id", _coord_key(preferred_tmx.x, preferred_tmx.y))).strip_edges()
		var node_type: String = str(sample.get("type", "")).strip_edges().to_lower()
		var placement_resolution: Dictionary = _resolve_world_cell_preview_anchor_resolution(preferred_tmx, footprint_id, node_type)
		placement_resolution["sampleId"] = sample_id
		placement_resolution["type"] = node_type
		_world_cell_preview_placement_audit_by_sample_id[sample_id] = placement_resolution
		var anchor_tmx: Vector2i = _vector2i_from_json_array(placement_resolution.get("anchorTmx", [-1, -1]), Vector2i(-1, -1))
		if anchor_tmx.x < 0 or anchor_tmx.y < 0:
			continue
		_register_world_cell_preview_anchor(anchor_tmx, sample)


func _resolve_world_cell_preview_layout() -> Dictionary:
	var visible_bounds: Dictionary = _compute_visible_tmx_bounds()
	var preview_mode: String = _resolve_world_cell_preview_mode()
	var preview_variant: String = _resolve_world_cell_preview_variant()
	var start_x: int = 10
	var start_y: int = 10
	if preview_variant == "formal":
		start_x = 4
		start_y = 12
	elif preview_variant == "stages":
		start_x = 3
		start_y = 9
	if bool(visible_bounds.get("valid", false)):
		var start_x_bias: int = 12
		var start_y_bias: int = 12
		if preview_variant == "formal":
			start_x_bias = 6
		elif preview_variant == "stages":
			start_x_bias = 4
			start_y_bias = 8
		start_x = clampi(int(visible_bounds.get("startX", 0)) + start_x_bias, 2, maxi(2, _tmx_map_width - 12))
		start_y = clampi(int(visible_bounds.get("startY", 0)) + start_y_bias, 2, maxi(2, _tmx_map_height - 12))
	var samples: Array = []
	if preview_mode == "city" or preview_mode == "mixed":
		samples.append_array(_build_world_cell_city_preview_samples(Vector2i(start_x, start_y), preview_variant))
	if preview_mode == "nodes" or preview_mode == "mixed":
		samples.append_array(_build_world_cell_node_preview_samples(start_x, start_y, preview_variant))
	return {"mode": preview_mode, "variant": preview_variant, "samples": samples}


func _resolve_world_cell_preview_mode() -> String:
	var preview_mode: String = OS.get_environment("SLG_WORLD_CELL_PREVIEW_MODE").strip_edges().to_lower()
	if preview_mode == "nodes" or preview_mode == "mixed" or preview_mode == "city":
		return preview_mode
	return "city"


func _resolve_world_cell_capture_mode() -> String:
	var capture_mode: String = OS.get_environment("SLG_WORLD_CELL_CAPTURE_MODE").strip_edges().to_lower()
	if capture_mode == "live_pass" or capture_mode == "backend_pass":
		return WORLD_CELL_CAPTURE_MODE_LIVE_PASS
	if capture_mode == "live_nodes" or capture_mode == "backend_nodes" or capture_mode == "live_backend_nodes":
		return WORLD_CELL_CAPTURE_MODE_LIVE_NODES
	return WORLD_CELL_CAPTURE_MODE_PREVIEW


func _is_world_cell_live_capture_requested() -> bool:
	var capture_mode: String = _resolve_world_cell_capture_mode()
	return capture_mode == WORLD_CELL_CAPTURE_MODE_LIVE_PASS or capture_mode == WORLD_CELL_CAPTURE_MODE_LIVE_NODES


func _is_world_cell_live_pass_capture_requested() -> bool:
	return _resolve_world_cell_capture_mode() == WORLD_CELL_CAPTURE_MODE_LIVE_PASS


func _resolve_world_cell_preview_variant() -> String:
	var preview_variant: String = OS.get_environment("SLG_WORLD_CELL_PREVIEW_VARIANT").strip_edges().to_lower()
	if preview_variant == "formal":
		return "formal"
	if preview_variant == "stages":
		return "stages"
	return "spec"


func _build_world_cell_city_preview_samples(base_tmx: Vector2i, preview_variant: String = "spec") -> Array:
	if preview_variant == "formal":
		return _build_world_cell_city_formal_preview_samples(base_tmx)
	if preview_variant == "stages":
		return _build_world_cell_city_stage_preview_samples(base_tmx)
	return _build_world_cell_city_spec_preview_samples(base_tmx)


func _build_world_cell_city_spec_preview_samples(base_tmx: Vector2i) -> Array:
	var samples: Array = []
	samples.append_array([
		{
			"id": "preview_city_3x3_hall_only",
			"label": "3x3 hall-only",
			"footprintId": WORLD_CELL_FOOTPRINT_PLAYER_CITY_3X3_INITIAL,
			"compositeId": "world_node_city_v1",
			"preferredTmx": _preview_tmx_to_array(_offset_world_cell_preview_tmx(base_tmx, 0, 0)),
			"type": "player_city",
			"terrain": "cityland",
			"district": "preview",
			"owner": "player",
			"cityLevel": 3,
			"expansionStage": 0,
			"stateTag": "hall_only",
			"focus": "selected",
			"focusOffset": [1, 0],
		},
		{
			"id": "preview_city_5x5_activated",
			"label": "5x5 activated",
			"footprintId": WORLD_CELL_FOOTPRINT_SYSTEM_CITY_L05_L06_5X5,
			"compositeId": "world_node_system_city_5x5_v1",
			"preferredTmx": _preview_tmx_to_array(_offset_world_cell_preview_tmx(base_tmx, 6, 0)),
			"type": "system_city",
			"terrain": "cityland",
			"district": "preview",
			"owner": "neutral",
			"cityLevel": 6,
			"expansionStage": 2,
			"stateTag": "activated",
			"focus": "hover",
			"focusOffset": [1, 1],
		},
		{
			"id": "preview_city_7x7_activated",
			"label": "7x7 activated",
			"footprintId": WORLD_CELL_FOOTPRINT_SYSTEM_CITY_L07_L08_7X7,
			"compositeId": "world_node_system_city_7x7_v1",
			"preferredTmx": _preview_tmx_to_array(_offset_world_cell_preview_tmx(base_tmx, 0, 6)),
			"type": "system_city",
			"terrain": "cityland",
			"district": "preview",
			"owner": "neutral",
			"cityLevel": 8,
			"expansionStage": 3,
			"stateTag": "activated",
		},
		{
			"id": "preview_city_9x9_activated",
			"label": "9x9 activated",
			"footprintId": WORLD_CELL_FOOTPRINT_SYSTEM_CITY_L09_9X9,
			"compositeId": "world_node_system_city_9x9_v1",
			"preferredTmx": _preview_tmx_to_array(_offset_world_cell_preview_tmx(base_tmx, 6, 7)),
			"type": "system_city",
			"terrain": "cityland",
			"district": "preview",
			"owner": "neutral",
			"cityLevel": 9,
			"expansionStage": 4,
			"stateTag": "activated",
		},
	])
	return samples


func _build_world_cell_city_formal_preview_samples(base_tmx: Vector2i) -> Array:
	var samples: Array = []
	samples.append_array([
		{
			"id": "preview_system_city_5x5_formal",
			"label": "5x5 formal layout",
			"footprintId": WORLD_CELL_FOOTPRINT_SYSTEM_CITY_L05_L06_5X5,
			"compositeId": "world_node_system_city_5x5_v1",
			"preferredTmx": _preview_tmx_to_array(_offset_world_cell_preview_tmx(base_tmx, 0, 0)),
			"type": "system_city",
			"terrain": "cityland",
			"district": "preview_formal",
			"owner": "neutral",
			"cityLevel": 5,
			"expansionStage": 1,
			"stateTag": "formal_layout",
			"focus": "selected",
			"focusOffset": [0, 0],
		},
		{
			"id": "preview_system_city_7x7_formal",
			"label": "7x7 formal layout",
			"footprintId": WORLD_CELL_FOOTPRINT_SYSTEM_CITY_L07_L08_7X7,
			"compositeId": "world_node_system_city_7x7_v1",
			"preferredTmx": _preview_tmx_to_array(_offset_world_cell_preview_tmx(base_tmx, 6, 1)),
			"type": "system_city",
			"terrain": "cityland",
			"district": "preview_formal",
			"owner": "neutral",
			"cityLevel": 7,
			"expansionStage": 2,
			"stateTag": "formal_layout",
			"focus": "hover",
			"focusOffset": [1, 0],
		},
		{
			"id": "preview_system_city_9x9_formal",
			"label": "9x9 formal layout",
			"footprintId": WORLD_CELL_FOOTPRINT_SYSTEM_CITY_L09_9X9,
			"compositeId": "world_node_system_city_9x9_v1",
			"preferredTmx": _preview_tmx_to_array(_offset_world_cell_preview_tmx(base_tmx, 1, 8)),
			"type": "system_city",
			"terrain": "cityland",
			"district": "preview_formal",
			"owner": "neutral",
			"cityLevel": 9,
			"expansionStage": 3,
			"stateTag": "formal_layout",
		},
	])
	return samples


func _build_world_cell_city_stage_preview_samples(base_tmx: Vector2i) -> Array:
	var samples: Array = []
	samples.append_array([
		{
			"id": "preview_city_stage_0",
			"label": "Stage 0 / hall-only",
			"footprintId": WORLD_CELL_FOOTPRINT_SYSTEM_CITY_L03_L04_3X3,
			"compositeId": "world_node_system_city_3x3_v1",
			"preferredTmx": _preview_tmx_to_array(_offset_world_cell_preview_tmx(base_tmx, 0, 0)),
			"type": "system_city",
			"terrain": "cityland",
			"district": "preview_stages",
			"owner": "neutral",
			"cityLevel": 3,
			"expansionStage": 0,
			"stateTag": "stage_0",
		},
		{
			"id": "preview_city_stage_1",
			"label": "Stage 1 / inner ring",
			"footprintId": WORLD_CELL_FOOTPRINT_SYSTEM_CITY_L05_L06_5X5,
			"compositeId": "world_node_system_city_5x5_v1",
			"preferredTmx": _preview_tmx_to_array(_offset_world_cell_preview_tmx(base_tmx, 6, 0)),
			"type": "system_city",
			"terrain": "cityland",
			"district": "preview_stages",
			"owner": "neutral",
			"cityLevel": 5,
			"expansionStage": 1,
			"stateTag": "stage_1",
			"focus": "selected",
			"focusOffset": [0, 0],
		},
		{
			"id": "preview_city_stage_2",
			"label": "Stage 2 / core district",
			"footprintId": WORLD_CELL_FOOTPRINT_SYSTEM_CITY_L07_L08_7X7,
			"compositeId": "world_node_system_city_7x7_v1",
			"preferredTmx": _preview_tmx_to_array(_offset_world_cell_preview_tmx(base_tmx, 0, 6)),
			"type": "system_city",
			"terrain": "cityland",
			"district": "preview_stages",
			"owner": "neutral",
			"cityLevel": 7,
			"expansionStage": 2,
			"stateTag": "stage_2",
		},
		{
			"id": "preview_city_stage_3",
			"label": "Stage 3 / outer district",
			"footprintId": WORLD_CELL_FOOTPRINT_SYSTEM_CITY_L09_9X9,
			"compositeId": "world_node_system_city_9x9_v1",
			"preferredTmx": _preview_tmx_to_array(_offset_world_cell_preview_tmx(base_tmx, 7, 6)),
			"type": "system_city",
			"terrain": "cityland",
			"district": "preview_stages",
			"owner": "neutral",
			"cityLevel": 9,
			"expansionStage": 3,
			"stateTag": "stage_3",
		},
		{
			"id": "preview_city_stage_4",
			"label": "Stage 4 / full footprint",
			"footprintId": WORLD_CELL_FOOTPRINT_SYSTEM_CITY_L09_9X9,
			"compositeId": "world_node_system_city_9x9_v1",
			"preferredTmx": _preview_tmx_to_array(_offset_world_cell_preview_tmx(base_tmx, 4, 13)),
			"type": "system_city",
			"terrain": "cityland",
			"district": "preview_stages",
			"owner": "neutral",
			"cityLevel": 9,
			"expansionStage": 4,
			"stateTag": "stage_4",
			"focus": "hover",
			"focusOffset": [3, 4],
		},
	])
	return samples


func _build_world_cell_node_preview_samples(start_x: int, start_y: int, preview_variant: String = "spec") -> Array:
	var samples: Array = WORLD_CELL_NODE_PREVIEW_TYPES.duplicate()
	if preview_variant != "formal" and world_cell_preview_placeholders_enabled:
		samples.append_array(WORLD_CELL_NODE_PREVIEW_PLACEHOLDER_TYPES)
	var preview_samples: Array = []
	for node_type_variant in samples:
		var node_type: String = str(node_type_variant).strip_edges()
		preview_samples.append_array(
			_build_world_cell_node_preview_samples_for_type(node_type, start_x, start_y, preview_variant)
		)
	return preview_samples


func _build_world_cell_node_preview_samples_for_type(
	node_type: String,
	start_x: int,
	start_y: int,
	preview_variant: String
) -> Array:
	var dispatch_rule: Dictionary = _resolve_world_cell_node_dispatch_rule(node_type)
	var preview_rule: Dictionary = _resolve_world_cell_node_preview_sample_rule(node_type)
	if dispatch_rule.is_empty() and preview_rule.is_empty():
		return []
	var sample_defs_variant: Variant = preview_rule.get(
		"preview_formal_samples" if preview_variant == "formal" else "preview_spec_samples",
		[]
	)
	if not (sample_defs_variant is Array):
		return []
	var sample_defs: Array = sample_defs_variant as Array
	var preview_samples: Array = []
	for sample_def_variant in sample_defs:
		if not (sample_def_variant is Dictionary):
			continue
		var sample_def: Dictionary = sample_def_variant as Dictionary
		var preferred_offset: Vector2i = _vector2i_from_json_array(sample_def.get("preferred_offset", [0, 0]), Vector2i.ZERO)
		var fallback_footprint_id: String = str(preview_rule.get("footprint_id", dispatch_rule.get("footprint_id", ""))).strip_edges()
		var fallback_terrain: String = str(preview_rule.get("default_terrain", dispatch_rule.get("default_terrain", ""))).strip_edges()
		var sample := {
			"id": str(sample_def.get("id", "%s_preview" % node_type)).strip_edges(),
			"label": str(sample_def.get("label", node_type)).strip_edges(),
			"footprintId": str(sample_def.get("footprintId", fallback_footprint_id)).strip_edges(),
			"preferredTmx": [start_x + preferred_offset.x, start_y + preferred_offset.y],
			"type": node_type,
			"terrain": str(sample_def.get("terrain", fallback_terrain)).strip_edges(),
			"district": str(sample_def.get("district", "preview_formal" if preview_variant == "formal" else "preview")).strip_edges(),
		}
		var default_composite_id: String = str(preview_rule.get("default_composite_id", dispatch_rule.get("default_composite_id", ""))).strip_edges()
		if sample_def.has("compositeId"):
			sample["compositeId"] = str(sample_def.get("compositeId", "")).strip_edges()
		elif default_composite_id != "":
			sample["compositeId"] = default_composite_id
		for key in ["stateTag", "focus", "focusOffset", "placeholderRole", "scale", "offset", "frame", "alpha"]:
			if sample_def.has(key):
				sample[key] = sample_def.get(key)
		preview_samples.append(sample)
	return preview_samples


func _offset_world_cell_preview_tmx(base_tmx: Vector2i, right_steps: int, down_steps: int) -> Vector2i:
	return Vector2i(
		base_tmx.x + right_steps + down_steps,
		base_tmx.y - right_steps + down_steps
	)


func _preview_tmx_to_array(cell: Vector2i) -> Array:
	return [cell.x, cell.y]


func _resolve_world_cell_preview_anchor_resolution(preferred_tmx: Vector2i, footprint_id: String, node_type: String = "") -> Dictionary:
	var normalized_node_type: String = node_type.strip_edges().to_lower()
	var audit := {
		"ok": false,
		"context": WORLD_CELL_PLACEMENT_CONTEXT_PREVIEW_NODE_PLACEMENT,
		"footprintId": footprint_id,
		"nodeType": normalized_node_type,
		"preferredTmx": [preferred_tmx.x, preferred_tmx.y],
		"anchorTmx": [-1, -1],
		"candidateCount": 0,
		"blockedCandidateCount": 0,
		"blockedSamples": [],
	}
	var base_x: int = clampi(preferred_tmx.x, 0, maxi(0, _tmx_map_width - 1))
	var base_y: int = clampi(preferred_tmx.y, 0, maxi(0, _tmx_map_height - 1))
	for radius in range(0, 14):
		for dy in range(-radius, radius + 1):
			for dx in range(-radius, radius + 1):
				if radius > 0 and maxi(abs(dx), abs(dy)) != radius:
					continue
				var candidate := Vector2i(base_x + dx, base_y + dy)
				audit["candidateCount"] = int(audit.get("candidateCount", 0)) + 1
				var placement_match: Dictionary = _resolve_world_cell_preview_placement_match(candidate, footprint_id, normalized_node_type)
				if placement_match.is_empty():
					audit["ok"] = true
					audit["anchorTmx"] = [candidate.x, candidate.y]
					audit["searchRadius"] = radius
					audit["displacedFromPreferred"] = candidate != preferred_tmx
					return audit
				audit["blockedCandidateCount"] = int(audit.get("blockedCandidateCount", 0)) + 1
				var blocked_samples: Array = audit.get("blockedSamples", []) as Array
				if blocked_samples.size() < 8:
					blocked_samples.append(placement_match)
					audit["blockedSamples"] = blocked_samples
	audit["searchRadius"] = 13
	audit["displacedFromPreferred"] = true
	return audit


func _find_world_cell_preview_anchor(preferred_tmx: Vector2i, footprint_id: String, node_type: String = "") -> Vector2i:
	var resolution: Dictionary = _resolve_world_cell_preview_anchor_resolution(preferred_tmx, footprint_id, node_type)
	return _vector2i_from_json_array(resolution.get("anchorTmx", [-1, -1]), Vector2i(-1, -1))


func _resolve_world_cell_preview_placement_match(center_tmx: Vector2i, footprint_id: String, node_type: String = "") -> Dictionary:
	var normalized_node_type: String = node_type.strip_edges().to_lower()
	var placement_context := {
		"nodeType": normalized_node_type,
		"footprintId": footprint_id,
	}
	var offsets: Array = _resolve_world_cell_footprint_offsets(footprint_id, [1, 1])
	for offset_variant in offsets:
		var offset: Vector2i = _vector2i_from_json_array(offset_variant, Vector2i.ZERO)
		var tmx_x: int = center_tmx.x + offset.x
		var tmx_y: int = center_tmx.y + offset.y
		if tmx_x < 0 or tmx_y < 0 or tmx_x >= _tmx_map_width or tmx_y >= _tmx_map_height:
			return {
				"blocked": true,
				"reason": "out_of_bounds",
				"centerTmx": [center_tmx.x, center_tmx.y],
				"footprintId": footprint_id,
				"nodeType": normalized_node_type,
				"footprintOffset": [offset.x, offset.y],
				"tmx": [tmx_x, tmx_y],
			}
		var tmx_key: String = _coord_key(tmx_x, tmx_y)
		var context_match: Dictionary = _resolve_world_cell_placement_context_match_at_tmx_key(
			tmx_key,
			WORLD_CELL_PLACEMENT_CONTEXT_PREVIEW_NODE_PLACEMENT,
			0,
			placement_context
		)
		if not context_match.is_empty():
			return {
				"blocked": true,
				"reason": "placement_context",
				"centerTmx": [center_tmx.x, center_tmx.y],
				"footprintId": footprint_id,
				"nodeType": normalized_node_type,
				"footprintOffset": [offset.x, offset.y],
				"tmx": [tmx_x, tmx_y],
				"tmxKey": tmx_key,
				"context": WORLD_CELL_PLACEMENT_CONTEXT_PREVIEW_NODE_PLACEMENT,
				"match": context_match,
			}
	return {}


func _can_place_world_cell_preview_at(center_tmx: Vector2i, footprint_id: String, node_type: String = "") -> bool:
	return _resolve_world_cell_preview_placement_match(center_tmx, footprint_id, node_type).is_empty()


func _register_world_cell_preview_anchor(center_tmx: Vector2i, sample: Dictionary) -> void:
	var footprint_id: String = str(sample.get("footprintId", "")).strip_edges()
	var anchor_key: String = _coord_key(center_tmx.x, center_tmx.y)
	var anchor_entry := {
		"tmxX": center_tmx.x,
		"tmxY": center_tmx.y,
		"footprintId": footprint_id,
		"footprintTiles": _resolve_world_cell_footprint_tiles(footprint_id, [1, 1]),
		"alpha": float(sample.get("alpha", 1.0)),
		"frame": str(sample.get("frame", "")).strip_edges(),
		"offset": sample.get("offset", [0.0, 0.0]),
		"scale": float(sample.get("scale", 1.0)),
		"compositeId": str(sample.get("compositeId", "")).strip_edges(),
		"placeholderRole": str(sample.get("placeholderRole", "")).strip_edges(),
		"owner": str(sample.get("owner", "")).strip_edges(),
		"cityLevel": int(sample.get("cityLevel", 1)),
		"tileId": str(sample.get("tileId", "")).strip_edges(),
		"landmarkId": str(sample.get("landmarkId", "")).strip_edges(),
	}
	if sample.has("expansionStage"):
		anchor_entry["expansionStage"] = int(sample.get("expansionStage", 0))
	var anchor_visual_entry: Dictionary = anchor_entry.duplicate(true)
	var composite_id: String = str(anchor_entry.get("compositeId", "")).strip_edges()
	var preview_frame: String = str(anchor_entry.get("frame", "")).strip_edges()
	if preview_frame == "" and composite_id != "":
		var group_size: int = _resolve_world_cell_footprint_offsets(footprint_id, [1, 1]).size()
		anchor_visual_entry = _build_world_cell_anchor_visual_entry(anchor_entry, [anchor_entry], footprint_id, composite_id, group_size)
		if anchor_visual_entry.is_empty():
			anchor_visual_entry = anchor_entry.duplicate(true)
		else:
			for key in ["owner", "cityLevel", "tileId", "landmarkId", "expansionStage", "placeholderRole"]:
				if anchor_entry.has(key):
					anchor_visual_entry[key] = anchor_entry.get(key)
	_world_cell_node_anchor_by_tmx_key[anchor_key] = anchor_visual_entry
	_reserve_world_cell_footprint_at(center_tmx.x, center_tmx.y, footprint_id, anchor_key)
	if not anchor_visual_entry.is_empty():
		_populate_world_cell_base_entries(center_tmx.x, center_tmx.y, footprint_id, anchor_key, anchor_visual_entry)
	_register_world_cell_preview_tiles(center_tmx, footprint_id, sample, anchor_key, anchor_visual_entry)
	_register_world_cell_preview_sample(center_tmx, footprint_id, sample, anchor_key, anchor_visual_entry)


func _register_world_cell_preview_tiles(
	center_tmx: Vector2i,
	footprint_id: String,
	sample: Dictionary,
	anchor_key: String,
	anchor_entry: Dictionary = {}
) -> void:
	var offsets: Array = _resolve_world_cell_footprint_offsets(footprint_id, [1, 1])
	var focus_slot: String = str(sample.get("focus", "")).strip_edges().to_lower()
	var focus_offset: Vector2i = _vector2i_from_json_array(sample.get("focusOffset", []), Vector2i(99999, 99999))
	var role: String = str(sample.get("type", footprint_id)).strip_edges().to_lower()
	var terrain: String = str(sample.get("terrain", role)).strip_edges().to_lower()
	var district: String = str(sample.get("district", "preview")).strip_edges()
	var sample_id: String = str(sample.get("id", anchor_key)).strip_edges()
	var payload_state_by_offset: Dictionary = _build_world_cell_payload_state_by_offset(anchor_entry.get("payloadSlots", []))
	for offset_variant in offsets:
		var offset: Vector2i = _vector2i_from_json_array(offset_variant, Vector2i.ZERO)
		var tmx_x: int = center_tmx.x + offset.x
		var tmx_y: int = center_tmx.y + offset.y
		var tmx_key: String = _coord_key(tmx_x, tmx_y)
		var payload_meta: Dictionary = payload_state_by_offset.get(_coord_key(offset.x, offset.y), {}) as Dictionary
		var preview_tile := {
			"id": "preview_%s_%s" % [sample_id, tmx_key.replace(":", "_")],
			"x": tmx_x,
			"y": tmx_y,
			"tmxX": tmx_x,
			"tmxY": tmx_y,
			"type": role,
			"terrain": terrain,
			"district": district,
			"footprintId": footprint_id,
			"anchorKey": anchor_key,
			"isPreview": true,
			"sampleId": sample_id,
			"cellState": str(payload_meta.get("cellState", "reserved_base")).strip_edges(),
			"slotId": str(payload_meta.get("slotId", "")).strip_edges(),
		}
		_world_cell_preview_tile_by_tmx_key[tmx_key] = preview_tile
		var is_focus_tile: bool = false
		if focus_slot != "":
			if focus_offset != Vector2i(99999, 99999):
				is_focus_tile = offset == focus_offset
			else:
				is_focus_tile = tmx_key == anchor_key
		if is_focus_tile:
			_world_cell_preview_focus_tiles[focus_slot] = preview_tile


func _register_world_cell_preview_sample(
	center_tmx: Vector2i,
	footprint_id: String,
	sample: Dictionary,
	anchor_key: String,
	anchor_entry: Dictionary
) -> void:
	var sample_id: String = str(sample.get("id", anchor_key)).strip_edges()
	var composite_id: String = str(anchor_entry.get("compositeId", sample.get("compositeId", ""))).strip_edges()
	var composite: Dictionary = _get_world_cell_composite(composite_id)
	var group_size: int = _resolve_world_cell_footprint_offsets(footprint_id, [1, 1]).size()
	var payload_slots: Array = anchor_entry.get("payloadSlots", []) as Array
	var active_count: int = 0
	var reserved_count: int = 0
	var hall_active: int = 0
	for slot_variant in payload_slots:
		if not (slot_variant is Dictionary):
			continue
		var slot: Dictionary = slot_variant as Dictionary
		var is_active: bool = bool(slot.get("active", false))
		if is_active:
			active_count += 1
			if str(slot.get("slot_role", "")).strip_edges() == "hall":
				hall_active += 1
		else:
			reserved_count += 1
	var summary := {
		"id": sample_id,
		"label": str(sample.get("label", sample_id)).strip_edges(),
		"stateTag": str(sample.get("stateTag", "")).strip_edges(),
		"anchorKey": anchor_key,
		"anchorTmx": [center_tmx.x, center_tmx.y],
		"footprintId": footprint_id,
		"compositeId": composite_id,
		"payloadStage": _resolve_world_cell_node_payload_stage(anchor_entry, footprint_id, group_size, composite),
		"activePayloadCells": active_count,
		"reservedPayloadCells": reserved_count,
		"hallActiveCount": hall_active,
		"cellCount": group_size,
		"captureRect": _rect2_to_json_array(_estimate_world_cell_preview_sample_rect(center_tmx, footprint_id)),
	}
	var placement_resolution_variant: Variant = _world_cell_preview_placement_audit_by_sample_id.get(sample_id, {})
	if placement_resolution_variant is Dictionary:
		summary["placementResolution"] = (placement_resolution_variant as Dictionary).duplicate(true)
	_world_cell_preview_sample_by_id[sample_id] = summary
	_world_cell_preview_sample_order.append(sample_id)


func _rebuild_world_cell_live_capture_samples() -> void:
	_world_cell_live_capture_sample_by_id = {}
	_world_cell_live_capture_sample_order = []
	if not _is_world_cell_live_capture_requested():
		return
	var selected_anchors: Array = _select_world_cell_live_capture_anchors()
	if selected_anchors.is_empty():
		return
	var sample_index: int = 0
	for anchor_variant in selected_anchors:
		if not (anchor_variant is Dictionary):
			continue
		_register_world_cell_live_node_capture_sample(anchor_variant as Dictionary, sample_index)
		sample_index += 1


func _resolve_world_cell_live_capture_node_types() -> Array:
	if _resolve_world_cell_capture_mode() == WORLD_CELL_CAPTURE_MODE_LIVE_NODES:
		return WORLD_CELL_LIVE_STRATEGIC_NODE_TYPES.duplicate(true)
	return ["pass"]


func _resolve_world_cell_live_pass_anchor_entries() -> Array:
	return _resolve_world_cell_live_node_anchor_entries("pass")


func _resolve_world_cell_live_node_anchor_entries(node_type_filter: String = "") -> Array:
	var normalized_filter: String = node_type_filter.strip_edges().to_lower()
	var anchors: Array = []
	for anchor_variant in _world_cell_node_anchor_by_tmx_key.values():
		if not (anchor_variant is Dictionary):
			continue
		var anchor_entry: Dictionary = anchor_variant as Dictionary
		var node_type: String = str(anchor_entry.get("type", "")).strip_edges().to_lower()
		var footprint_id: String = str(anchor_entry.get("footprintId", "")).strip_edges()
		var expected_footprint_id: String = _resolve_world_cell_node_dispatch_footprint_id(normalized_filter)
		if normalized_filter == "":
			if _is_supported_world_cell_node_tile_type(node_type):
				anchors.append(anchor_entry)
		elif node_type == normalized_filter or (expected_footprint_id != "" and footprint_id == expected_footprint_id):
			anchors.append(anchor_entry)
	return anchors


func _select_world_cell_live_capture_anchors() -> Array:
	var capture_node_types: Array = _resolve_world_cell_live_capture_node_types()
	if capture_node_types.size() == 1 and str(capture_node_types[0]).strip_edges().to_lower() == "pass":
		return _select_world_cell_live_pass_capture_anchors(_resolve_world_cell_live_pass_anchor_entries())
	var selected_anchors: Array = []
	var used_anchor_keys: Dictionary = {}
	for node_type_variant in capture_node_types:
		var node_type: String = str(node_type_variant).strip_edges().to_lower()
		var anchors: Array = _resolve_world_cell_live_node_anchor_entries(node_type)
		if anchors.is_empty():
			continue
		var primary_anchor: Dictionary = _pick_world_cell_live_pass_primary_anchor(anchors)
		_append_world_cell_live_capture_anchor(selected_anchors, used_anchor_keys, primary_anchor)
		if selected_anchors.size() >= 6:
			break
		var nearest_anchor: Dictionary = _pick_nearest_world_cell_live_pass_anchor(anchors, primary_anchor, used_anchor_keys)
		_append_world_cell_live_capture_anchor(selected_anchors, used_anchor_keys, nearest_anchor)
		if selected_anchors.size() >= 6:
			break
	return selected_anchors


func _select_world_cell_live_pass_capture_anchors(pass_anchors: Array) -> Array:
	var selected_anchors: Array = []
	var used_anchor_keys: Dictionary = {}
	var primary_anchor: Dictionary = _pick_world_cell_live_pass_primary_anchor(pass_anchors)
	if primary_anchor.is_empty():
		return selected_anchors
	_append_world_cell_live_capture_anchor(selected_anchors, used_anchor_keys, primary_anchor)
	while selected_anchors.size() < 3 and selected_anchors.size() < pass_anchors.size():
		var nearest_anchor: Dictionary = _pick_nearest_world_cell_live_pass_anchor(pass_anchors, primary_anchor, used_anchor_keys)
		if nearest_anchor.is_empty():
			break
		_append_world_cell_live_capture_anchor(selected_anchors, used_anchor_keys, nearest_anchor)
	return selected_anchors


func _append_world_cell_live_pass_capture_anchor(selected_anchors: Array, used_anchor_keys: Dictionary, anchor_entry: Dictionary) -> void:
	_append_world_cell_live_capture_anchor(selected_anchors, used_anchor_keys, anchor_entry)


func _append_world_cell_live_capture_anchor(selected_anchors: Array, used_anchor_keys: Dictionary, anchor_entry: Dictionary) -> void:
	var tmx_x: int = int(anchor_entry.get("tmxX", -1))
	var tmx_y: int = int(anchor_entry.get("tmxY", -1))
	if tmx_x < 0 or tmx_y < 0:
		return
	var anchor_key: String = _coord_key(tmx_x, tmx_y)
	if used_anchor_keys.has(anchor_key):
		return
	used_anchor_keys[anchor_key] = true
	selected_anchors.append(anchor_entry)


func _pick_world_cell_live_pass_primary_anchor(pass_anchors: Array) -> Dictionary:
	var best_anchor: Dictionary = {}
	var best_score: float = INF
	var target_x: float = float(_tmx_map_width) * 0.5
	var target_y: float = float(_tmx_map_height) * 0.5
	for anchor_variant in pass_anchors:
		if not (anchor_variant is Dictionary):
			continue
		var anchor_entry: Dictionary = anchor_variant as Dictionary
		var tmx_x: float = float(anchor_entry.get("tmxX", -1))
		var tmx_y: float = float(anchor_entry.get("tmxY", -1))
		if tmx_x < 0.0 or tmx_y < 0.0:
			continue
		var dx: float = tmx_x - target_x
		var dy: float = tmx_y - target_y
		var score: float = dx * dx + dy * dy
		if score < best_score:
			best_score = score
			best_anchor = anchor_entry
	return best_anchor


func _pick_nearest_world_cell_live_pass_anchor(pass_anchors: Array, primary_anchor: Dictionary, used_anchor_keys: Dictionary) -> Dictionary:
	var best_anchor: Dictionary = {}
	var best_score: float = INF
	var primary_tmx_x: float = float(primary_anchor.get("tmxX", 0))
	var primary_tmx_y: float = float(primary_anchor.get("tmxY", 0))
	for anchor_variant in pass_anchors:
		if not (anchor_variant is Dictionary):
			continue
		var anchor_entry: Dictionary = anchor_variant as Dictionary
		var tmx_x: int = int(anchor_entry.get("tmxX", -1))
		var tmx_y: int = int(anchor_entry.get("tmxY", -1))
		if tmx_x < 0 or tmx_y < 0:
			continue
		var anchor_key: String = _coord_key(tmx_x, tmx_y)
		if used_anchor_keys.has(anchor_key):
			continue
		var dx: float = float(tmx_x) - primary_tmx_x
		var dy: float = float(tmx_y) - primary_tmx_y
		var score: float = dx * dx + dy * dy
		if score < best_score:
			best_score = score
			best_anchor = anchor_entry
	return best_anchor


func _register_world_cell_live_pass_capture_sample(anchor_entry: Dictionary, sample_index: int) -> void:
	_register_world_cell_live_node_capture_sample(anchor_entry, sample_index)


func _register_world_cell_live_node_capture_sample(anchor_entry: Dictionary, sample_index: int) -> void:
	var tmx_x: int = int(anchor_entry.get("tmxX", -1))
	var tmx_y: int = int(anchor_entry.get("tmxY", -1))
	if tmx_x < 0 or tmx_y < 0:
		return
	var anchor_key: String = _coord_key(tmx_x, tmx_y)
	var node_type: String = str(anchor_entry.get("type", "")).strip_edges().to_lower()
	if node_type == "":
		node_type = "pass"
	var footprint_id: String = str(anchor_entry.get("footprintId", _resolve_world_cell_node_dispatch_footprint_id(node_type))).strip_edges()
	var source_tile: Dictionary = _resolve_backend_tile_for_tmx_key(anchor_key)
	var screen_hit_tile: Dictionary = _screen_to_backend_tile_data(_tmx_to_screen(tmx_x, tmx_y))
	var reserved_hit_tile: Dictionary = _build_reserved_world_cell_hit_tile(tmx_x, tmx_y, source_tile)
	var hit_tile: Dictionary = screen_hit_tile if not screen_hit_tile.is_empty() else reserved_hit_tile
	var sample_id: String = "live_backend_%s_%02d" % [node_type, sample_index]
	var hit_ok: bool = _is_world_cell_live_node_hit_ok(hit_tile, anchor_entry, anchor_key, node_type, footprint_id)
	var screen_roundtrip_ok: bool = _is_world_cell_live_node_hit_ok(screen_hit_tile, anchor_entry, anchor_key, node_type, footprint_id)
	var reserved_proxy_ok: bool = _is_world_cell_live_node_hit_ok(reserved_hit_tile, anchor_entry, anchor_key, node_type, footprint_id)
	var selection_ok: bool = _is_world_cell_live_node_hit_ok(reserved_hit_tile, anchor_entry, anchor_key, node_type, footprint_id)
	var hover_ok: bool = _is_world_cell_live_node_hit_ok(hit_tile, anchor_entry, anchor_key, node_type, footprint_id)
	var hit_summary := {
		"ok": hit_ok,
		"screenRoundtripOk": screen_roundtrip_ok,
		"reservedProxyOk": reserved_proxy_ok,
		"type": str(hit_tile.get("type", "")).strip_edges(),
		"id": str(hit_tile.get("id", "")).strip_edges(),
		"tileId": str(hit_tile.get("tileId", "")).strip_edges(),
		"anchorKey": str(hit_tile.get("anchorKey", "")).strip_edges(),
		"footprintId": str(hit_tile.get("footprintId", "")).strip_edges(),
		"isReservedHit": bool(hit_tile.get("isReservedHit", false)),
		"tmx": [int(hit_tile.get("tmxX", -1)), int(hit_tile.get("tmxY", -1))],
	}
	var summary := {
		"id": sample_id,
		"label": "Live backend %s %d" % [node_type, sample_index + 1],
		"captureSource": "live_backend_map_layout",
		"anchorKey": anchor_key,
		"anchorTmx": [tmx_x, tmx_y],
		"backend": {
			"x": int(anchor_entry.get("backendX", anchor_entry.get("x", 0))),
			"y": int(anchor_entry.get("backendY", anchor_entry.get("y", 0))),
		},
		"tileId": str(anchor_entry.get("tileId", anchor_entry.get("id", ""))).strip_edges(),
		"type": node_type,
		"terrain": str(anchor_entry.get("terrain", "")).strip_edges(),
		"footprintId": footprint_id,
		"compositeId": str(anchor_entry.get("compositeId", "")).strip_edges(),
		"cellCount": _resolve_world_cell_footprint_offsets(footprint_id, [1, 1]).size(),
		"captureRect": _rect2_to_json_array(_estimate_world_cell_preview_sample_rect(Vector2i(tmx_x, tmx_y), footprint_id)),
		"hitOk": hit_ok,
		"screenRoundtripOk": screen_roundtrip_ok,
		"reservedProxyOk": reserved_proxy_ok,
		"hit": hit_summary,
		"hitTile": hit_tile,
		"interaction": {
			"selectionOk": selection_ok,
			"hoverOk": hover_ok,
			"reservedProxyOk": reserved_proxy_ok,
		},
	}
	_world_cell_live_capture_sample_by_id[sample_id] = summary
	_world_cell_live_capture_sample_order.append(sample_id)


func _is_world_cell_live_pass_hit_ok(hit_tile: Dictionary, anchor_entry: Dictionary, anchor_key: String) -> bool:
	return _is_world_cell_live_node_hit_ok(hit_tile, anchor_entry, anchor_key, "pass", WORLD_CELL_FOOTPRINT_PASS_1X1)


func _is_world_cell_live_node_hit_ok(
	hit_tile: Dictionary,
	anchor_entry: Dictionary,
	anchor_key: String,
	expected_node_type: String,
	expected_footprint_id: String
) -> bool:
	if hit_tile.is_empty():
		return false
	var hit_type: String = str(hit_tile.get("type", "")).strip_edges().to_lower()
	var hit_footprint_id: String = str(hit_tile.get("footprintId", "")).strip_edges()
	var hit_anchor_key: String = str(hit_tile.get("anchorKey", "")).strip_edges()
	var anchor_id: String = str(anchor_entry.get("id", anchor_entry.get("tileId", ""))).strip_edges()
	var hit_id: String = str(hit_tile.get("id", hit_tile.get("tileId", ""))).strip_edges()
	if hit_type != expected_node_type.strip_edges().to_lower():
		return false
	if hit_footprint_id != expected_footprint_id:
		return false
	if hit_anchor_key != anchor_key:
		return false
	if anchor_id != "" and hit_id != "" and anchor_id != hit_id:
		return false
	return true


func _build_world_cell_capture_node_sample_hit_stats(samples: Array) -> Dictionary:
	var stats := {
		"sampleCount": samples.size(),
		"hitOkCount": 0,
		"screenRoundtripOkCount": 0,
		"reservedProxyOkCount": 0,
		"selectionOkCount": 0,
		"hoverOkCount": 0,
		"failedSampleIds": [],
	}
	for sample_variant in samples:
		if not (sample_variant is Dictionary):
			continue
		var sample: Dictionary = sample_variant as Dictionary
		var hit_variant: Variant = sample.get("hit", {})
		var hit: Dictionary = hit_variant as Dictionary if hit_variant is Dictionary else {}
		var interaction_variant: Variant = sample.get("interaction", {})
		var interaction: Dictionary = interaction_variant as Dictionary if interaction_variant is Dictionary else {}
		var hit_ok: bool = bool(sample.get("hitOk", hit.get("ok", false)))
		var screen_roundtrip_ok: bool = bool(sample.get("screenRoundtripOk", hit.get("screenRoundtripOk", false)))
		var reserved_proxy_ok: bool = bool(sample.get("reservedProxyOk", hit.get("reservedProxyOk", false)))
		var selection_ok: bool = bool(interaction.get("selectionOk", hit_ok))
		var hover_ok: bool = bool(interaction.get("hoverOk", hit_ok))
		if hit_ok:
			stats["hitOkCount"] = int(stats.get("hitOkCount", 0)) + 1
		if screen_roundtrip_ok:
			stats["screenRoundtripOkCount"] = int(stats.get("screenRoundtripOkCount", 0)) + 1
		if reserved_proxy_ok:
			stats["reservedProxyOkCount"] = int(stats.get("reservedProxyOkCount", 0)) + 1
		if selection_ok:
			stats["selectionOkCount"] = int(stats.get("selectionOkCount", 0)) + 1
		if hover_ok:
			stats["hoverOkCount"] = int(stats.get("hoverOkCount", 0)) + 1
		if not (hit_ok and screen_roundtrip_ok and reserved_proxy_ok and selection_ok and hover_ok):
			var failed_samples: Array = stats.get("failedSampleIds", []) as Array
			if failed_samples.size() < 8:
				failed_samples.append(str(sample.get("id", "")).strip_edges())
				stats["failedSampleIds"] = failed_samples
	stats["allHitOk"] = int(stats.get("hitOkCount", 0)) == samples.size()
	stats["allScreenRoundtripOk"] = int(stats.get("screenRoundtripOkCount", 0)) == samples.size()
	stats["allReservedProxyOk"] = int(stats.get("reservedProxyOkCount", 0)) == samples.size()
	stats["allSelectionOk"] = int(stats.get("selectionOkCount", 0)) == samples.size()
	stats["allHoverOk"] = int(stats.get("hoverOkCount", 0)) == samples.size()
	return stats


func _build_world_cell_capture_node_reserved_hit_coverage_audit(samples: Array, capture_node_type: String = "pass") -> Dictionary:
	var normalized_capture_node_type: String = capture_node_type.strip_edges().to_lower()
	if normalized_capture_node_type == "":
		normalized_capture_node_type = "unknown"
	var audit := {
		"auditVersion": "live_pass_reserved_hit_coverage_v1",
		"coverageScope": "live_backend_%s_samples" % normalized_capture_node_type,
		"sampleCount": samples.size(),
		"footprintCellHitCount": 0,
		"anchorCellHitCount": 0,
		"nonAnchorCellHitCount": 0,
		"okCellCount": 0,
		"failedCellCount": 0,
		"failedSamples": [],
		"samples": {},
	}
	for sample_variant in samples:
		if not (sample_variant is Dictionary):
			continue
		var sample: Dictionary = sample_variant as Dictionary
		var sample_id: String = str(sample.get("id", "")).strip_edges()
		var anchor_key: String = str(sample.get("anchorKey", "")).strip_edges()
		var footprint_id: String = str(sample.get("footprintId", "")).strip_edges()
		var sample_node_type: String = str(sample.get("type", normalized_capture_node_type)).strip_edges().to_lower()
		var anchor_tmx: Vector2i = _vector2i_from_json_array(sample.get("anchorTmx", []), Vector2i(-1, -1))
		if sample_id == "":
			sample_id = anchor_key
		if sample_id == "" or anchor_key == "" or footprint_id == "" or anchor_tmx.x < 0 or anchor_tmx.y < 0:
			continue
		var anchor_entry_variant: Variant = _world_cell_node_anchor_by_tmx_key.get(anchor_key, {})
		var anchor_entry: Dictionary = anchor_entry_variant as Dictionary if anchor_entry_variant is Dictionary else sample
		var sample_audit := {
			"sampleId": sample_id,
			"anchorKey": anchor_key,
			"footprintId": footprint_id,
			"anchorTmx": [anchor_tmx.x, anchor_tmx.y],
			"cellCount": 0,
			"okCellCount": 0,
			"failedCellCount": 0,
			"nonAnchorCellCount": 0,
			"allReservedHitsOk": true,
			"cells": [],
		}
		var offsets: Array = _resolve_world_cell_footprint_offsets(footprint_id, [1, 1])
		for offset_variant in offsets:
			var offset: Vector2i = _vector2i_from_json_array(offset_variant, Vector2i.ZERO)
			var tmx_x: int = anchor_tmx.x + offset.x
			var tmx_y: int = anchor_tmx.y + offset.y
			var tmx_key: String = _coord_key(tmx_x, tmx_y)
			var source_tile: Dictionary = _resolve_backend_tile_for_tmx_key(tmx_key)
			var reserved_hit_tile: Dictionary = _build_reserved_world_cell_hit_tile(tmx_x, tmx_y, source_tile)
			var hit_ok: bool = _is_world_cell_live_node_hit_ok(reserved_hit_tile, anchor_entry, anchor_key, sample_node_type, footprint_id)
			audit["footprintCellHitCount"] = int(audit.get("footprintCellHitCount", 0)) + 1
			sample_audit["cellCount"] = int(sample_audit.get("cellCount", 0)) + 1
			if offset == Vector2i.ZERO:
				audit["anchorCellHitCount"] = int(audit.get("anchorCellHitCount", 0)) + 1
			else:
				audit["nonAnchorCellHitCount"] = int(audit.get("nonAnchorCellHitCount", 0)) + 1
				sample_audit["nonAnchorCellCount"] = int(sample_audit.get("nonAnchorCellCount", 0)) + 1
			if hit_ok:
				audit["okCellCount"] = int(audit.get("okCellCount", 0)) + 1
				sample_audit["okCellCount"] = int(sample_audit.get("okCellCount", 0)) + 1
			else:
				audit["failedCellCount"] = int(audit.get("failedCellCount", 0)) + 1
				sample_audit["failedCellCount"] = int(sample_audit.get("failedCellCount", 0)) + 1
				sample_audit["allReservedHitsOk"] = false
				var failed_samples: Array = audit.get("failedSamples", []) as Array
				if failed_samples.size() < 8:
					failed_samples.append(sample_id)
					audit["failedSamples"] = failed_samples
			var cell_audit := {
				"tmxKey": tmx_key,
				"tmx": [tmx_x, tmx_y],
				"offset": [offset.x, offset.y],
				"isAnchorCell": offset == Vector2i.ZERO,
				"ok": hit_ok,
				"hit": {
					"id": str(reserved_hit_tile.get("id", reserved_hit_tile.get("tileId", ""))).strip_edges(),
					"type": str(reserved_hit_tile.get("type", "")).strip_edges(),
					"anchorKey": str(reserved_hit_tile.get("anchorKey", "")).strip_edges(),
					"footprintId": str(reserved_hit_tile.get("footprintId", "")).strip_edges(),
					"isReservedHit": bool(reserved_hit_tile.get("isReservedHit", false)),
				},
			}
			(sample_audit["cells"] as Array).append(cell_audit)
		(audit["samples"] as Dictionary)[sample_id] = sample_audit
	audit["allReservedHitsOk"] = int(audit.get("failedCellCount", 0)) == 0
	audit["nonAnchorCoverageAvailable"] = int(audit.get("nonAnchorCellHitCount", 0)) > 0
	audit["allNonAnchorReservedHitsOk"] = true if int(audit.get("nonAnchorCellHitCount", 0)) == 0 else bool(audit.get("allReservedHitsOk", false))
	audit["coverageMode"] = "multi_cell" if bool(audit.get("nonAnchorCoverageAvailable", false)) else "anchor_only"
	audit["dataShape"] = {
		"source": "live_backend",
		"nodeType": normalized_capture_node_type,
		"observedFootprintCellCount": int(audit.get("footprintCellHitCount", 0)),
		"observedNonAnchorCellCount": int(audit.get("nonAnchorCellHitCount", 0)),
		"nonAnchorCoverageExpected": bool(audit.get("nonAnchorCoverageAvailable", false)),
	}
	return audit


func _build_world_cell_capture_node_placement_context_audit(samples: Array) -> Dictionary:
	var audit := {}
	var contexts: Array = _resolve_world_cell_default_placement_context_audit_order()
	for sample_variant in samples:
		if not (sample_variant is Dictionary):
			continue
		var sample: Dictionary = sample_variant as Dictionary
		var anchor_key: String = str(sample.get("anchorKey", "")).strip_edges()
		if anchor_key == "":
			continue
		audit[anchor_key] = {
			"sampleId": str(sample.get("id", "")).strip_edges(),
			"tileId": str(sample.get("tileId", "")).strip_edges(),
			"footprintId": str(sample.get("footprintId", "")).strip_edges(),
			"contexts": _build_world_cell_placement_context_matches_at_tmx_key(anchor_key, contexts),
		}
	return audit


func _build_world_cell_capture_node_placement_context_status(placement_context_audit: Dictionary) -> Dictionary:
	var reserved_contexts: Array = [
		WORLD_CELL_PLACEMENT_CONTEXT_EMPTY_RESOURCE_FILL,
		WORLD_CELL_PLACEMENT_CONTEXT_FREE_CELL_BASE,
		WORLD_CELL_PLACEMENT_CONTEXT_RESOURCE_OVERLAY,
		WORLD_CELL_PLACEMENT_CONTEXT_PREVIEW_NODE_PLACEMENT,
	]
	var deferred_contexts: Array = [WORLD_CELL_PLACEMENT_CONTEXT_MOVEMENT]
	var status := {
		"sampleCount": placement_context_audit.size(),
		"reservedContexts": reserved_contexts.duplicate(true),
		"deferredContexts": deferred_contexts.duplicate(true),
		"blockedCountsByContext": {},
		"unblockedCountsByContext": {},
		"failedReservedContextSamples": [],
		"failedDeferredContextSamples": [],
	}
	var blocked_counts: Dictionary = {}
	var unblocked_counts: Dictionary = {}
	for anchor_key_variant in placement_context_audit.keys():
		var anchor_key: String = str(anchor_key_variant).strip_edges()
		var sample_variant: Variant = placement_context_audit.get(anchor_key_variant, {})
		if not (sample_variant is Dictionary):
			continue
		var sample: Dictionary = sample_variant as Dictionary
		var contexts_variant: Variant = sample.get("contexts", {})
		var contexts: Dictionary = contexts_variant as Dictionary if contexts_variant is Dictionary else {}
		for context_variant in reserved_contexts:
			var context: String = str(context_variant).strip_edges()
			var context_status: Dictionary = contexts.get(context, {}) as Dictionary
			if bool(context_status.get("blocked", false)):
				_increment_world_cell_audit_count(blocked_counts, context)
			else:
				_increment_world_cell_audit_count(unblocked_counts, context)
				(status["failedReservedContextSamples"] as Array).append({
					"anchorKey": anchor_key,
					"sampleId": str(sample.get("sampleId", "")).strip_edges(),
					"context": context,
				})
		for context_variant in deferred_contexts:
			var context: String = str(context_variant).strip_edges()
			var context_status: Dictionary = contexts.get(context, {}) as Dictionary
			if bool(context_status.get("blocked", false)):
				_increment_world_cell_audit_count(blocked_counts, context)
				(status["failedDeferredContextSamples"] as Array).append({
					"anchorKey": anchor_key,
					"sampleId": str(sample.get("sampleId", "")).strip_edges(),
					"context": context,
					"expected": "unblocked_until_movement_chain_closes",
				})
			else:
				_increment_world_cell_audit_count(unblocked_counts, context)
	status["blockedCountsByContext"] = blocked_counts
	status["unblockedCountsByContext"] = unblocked_counts
	var expected_sample_count: int = int(status.get("sampleCount", 0))
	var all_reserved_contexts_blocked: bool = expected_sample_count > 0
	for context_variant in reserved_contexts:
		var context: String = str(context_variant).strip_edges()
		if int(blocked_counts.get(context, 0)) != expected_sample_count:
			all_reserved_contexts_blocked = false
	status["allReservedPlacementContextsBlocked"] = all_reserved_contexts_blocked
	status["allDeferredMovementContextsUnblocked"] = expected_sample_count > 0 and int(unblocked_counts.get(WORLD_CELL_PLACEMENT_CONTEXT_MOVEMENT, 0)) == expected_sample_count
	return status


func _resolve_world_cell_default_placement_context_audit_order() -> Array:
	return [
		WORLD_CELL_PLACEMENT_CONTEXT_EMPTY_RESOURCE_FILL,
		WORLD_CELL_PLACEMENT_CONTEXT_FREE_CELL_BASE,
		WORLD_CELL_PLACEMENT_CONTEXT_RESOURCE_OVERLAY,
		WORLD_CELL_PLACEMENT_CONTEXT_PREVIEW_NODE_PLACEMENT,
		WORLD_CELL_PLACEMENT_CONTEXT_MOVEMENT,
	]


func _build_world_cell_placement_context_matches_at_tmx_key(tmx_key: String, contexts: Array = []) -> Dictionary:
	var normalized_tmx_key: String = tmx_key.strip_edges()
	var matches := {}
	if normalized_tmx_key == "":
		return matches
	var context_order: Array = contexts
	if context_order.is_empty():
		context_order = _resolve_world_cell_default_placement_context_audit_order()
	for context_variant in context_order:
		var context: String = str(context_variant).strip_edges()
		if context == "":
			continue
		var match: Dictionary = _resolve_world_cell_placement_context_match_at_tmx_key(normalized_tmx_key, context)
		matches[context] = {
			"blocked": not match.is_empty(),
			"match": match,
		}
	return matches


func _build_world_cell_runtime_sample_preview_placement_current_context_audit(samples: Array) -> Dictionary:
	var audit := {}
	for sample_variant in samples:
		if not (sample_variant is Dictionary):
			continue
		var sample: Dictionary = sample_variant as Dictionary
		var sample_id: String = str(sample.get("id", "")).strip_edges()
		var anchor_key: String = str(sample.get("anchorKey", "")).strip_edges()
		var footprint_id: String = str(sample.get("footprintId", "")).strip_edges()
		var node_type: String = str(sample.get("type", "")).strip_edges().to_lower()
		var anchor_tmx: Vector2i = _vector2i_from_json_array(sample.get("anchorTmx", []), Vector2i(-1, -1))
		if sample_id == "":
			sample_id = anchor_key
		if sample_id == "" or footprint_id == "" or anchor_tmx.x < 0 or anchor_tmx.y < 0:
			continue
		var placement_match: Dictionary = _resolve_world_cell_preview_placement_match(anchor_tmx, footprint_id, node_type)
		audit[sample_id] = {
			"sampleId": sample_id,
			"anchorKey": anchor_key,
			"anchorTmx": [anchor_tmx.x, anchor_tmx.y],
			"footprintId": footprint_id,
			"nodeType": node_type,
			"context": WORLD_CELL_PLACEMENT_CONTEXT_PREVIEW_NODE_PLACEMENT,
			"eligibleInCurrentContext": placement_match.is_empty(),
			"match": placement_match,
		}
	return audit


func _build_world_cell_runtime_builder_audit_summary(builder_stats: Dictionary) -> Dictionary:
	var summary := {
		"duplicateAnchorPolicy": WORLD_CELL_DUPLICATE_ANCHOR_POLICY,
		"sampleLimitPerType": WORLD_CELL_RUNTIME_AUDIT_SAMPLE_LIMIT,
		"conflictSampleCount": 0,
		"duplicateSampleCount": 0,
		"conflictReasonCounts": {},
		"duplicateReasonCounts": {},
		"conflictReasonCountsByType": {},
		"duplicateReasonCountsByType": {},
		"conflictSampleCoverageByType": {},
		"duplicateSampleCoverageByType": {},
	}
	var conflict_samples_variant: Variant = builder_stats.get("skippedConflictSamples", {})
	if conflict_samples_variant is Dictionary:
		for node_type_variant in (conflict_samples_variant as Dictionary).keys():
			var node_type: String = str(node_type_variant).strip_edges().to_lower()
			var samples_variant: Variant = (conflict_samples_variant as Dictionary).get(node_type_variant, [])
			if not (samples_variant is Array):
				continue
			for sample_variant in samples_variant as Array:
				if not (sample_variant is Dictionary):
					continue
				summary["conflictSampleCount"] = int(summary.get("conflictSampleCount", 0)) + 1
				var reason: String = _resolve_world_cell_runtime_conflict_summary_reason(sample_variant as Dictionary)
				_increment_world_cell_runtime_builder_summary_reason(summary, "conflictReasonCounts", "conflictReasonCountsByType", node_type, reason)
	var duplicate_samples_variant: Variant = builder_stats.get("duplicateAnchorSamples", {})
	if duplicate_samples_variant is Dictionary:
		for node_type_variant in (duplicate_samples_variant as Dictionary).keys():
			var node_type: String = str(node_type_variant).strip_edges().to_lower()
			var samples_variant: Variant = (duplicate_samples_variant as Dictionary).get(node_type_variant, [])
			if not (samples_variant is Array):
				continue
			for sample_variant in samples_variant as Array:
				if not (sample_variant is Dictionary):
					continue
				summary["duplicateSampleCount"] = int(summary.get("duplicateSampleCount", 0)) + 1
				var reason: String = _resolve_world_cell_runtime_duplicate_anchor_summary_reason(sample_variant as Dictionary)
				_increment_world_cell_runtime_builder_summary_reason(summary, "duplicateReasonCounts", "duplicateReasonCountsByType", node_type, reason)
	summary["conflictSampleCoverageByType"] = _build_world_cell_runtime_builder_sample_coverage_by_type(
		builder_stats.get("skippedConflictCounts", {}),
		conflict_samples_variant
	)
	summary["duplicateSampleCoverageByType"] = _build_world_cell_runtime_builder_sample_coverage_by_type(
		builder_stats.get("duplicateAnchorCounts", {}),
		duplicate_samples_variant
	)
	var conflict_sample_coverage_by_type: Dictionary = summary.get("conflictSampleCoverageByType", {}) as Dictionary
	var duplicate_sample_coverage_by_type: Dictionary = summary.get("duplicateSampleCoverageByType", {}) as Dictionary
	summary["conflictReasonCountSemanticsByType"] = _build_world_cell_runtime_builder_reason_count_semantics_by_type(
		conflict_sample_coverage_by_type
	)
	summary["duplicateReasonCountSemanticsByType"] = _build_world_cell_runtime_builder_reason_count_semantics_by_type(
		duplicate_sample_coverage_by_type
	)
	var conflict_reason_count_semantics_by_type: Dictionary = summary.get("conflictReasonCountSemanticsByType", {}) as Dictionary
	var duplicate_reason_count_semantics_by_type: Dictionary = summary.get("duplicateReasonCountSemanticsByType", {}) as Dictionary
	summary["conflictReasonCountMode"] = _resolve_world_cell_runtime_builder_reason_count_mode(
		conflict_reason_count_semantics_by_type
	)
	summary["duplicateReasonCountMode"] = _resolve_world_cell_runtime_builder_reason_count_mode(
		duplicate_reason_count_semantics_by_type
	)
	return summary


func _build_world_cell_runtime_builder_sample_coverage_by_type(counts_variant: Variant, samples_variant: Variant) -> Dictionary:
	var coverage := {}
	var counts: Dictionary = counts_variant as Dictionary if counts_variant is Dictionary else {}
	var samples_by_type: Dictionary = samples_variant as Dictionary if samples_variant is Dictionary else {}
	for node_type_variant in counts.keys():
		var node_type: String = str(node_type_variant).strip_edges().to_lower()
		if node_type == "" or node_type == "total":
			continue
		var expected_count: int = int(counts.get(node_type_variant, 0))
		var type_samples_variant: Variant = samples_by_type.get(node_type, [])
		if not (type_samples_variant is Array):
			type_samples_variant = samples_by_type.get(node_type_variant, [])
		var sample_count: int = (type_samples_variant as Array).size() if type_samples_variant is Array else 0
		coverage[node_type] = {
			"count": expected_count,
			"sampleCount": sample_count,
			"sampleLimit": WORLD_CELL_RUNTIME_AUDIT_SAMPLE_LIMIT,
			"truncated": sample_count < expected_count,
			"complete": sample_count >= expected_count,
		}
	return coverage


func _build_world_cell_runtime_builder_reason_count_semantics_by_type(coverage_by_type: Dictionary) -> Dictionary:
	var semantics := {}
	for node_type_variant in coverage_by_type.keys():
		var node_type: String = str(node_type_variant).strip_edges().to_lower()
		if node_type == "":
			continue
		var coverage_variant: Variant = coverage_by_type.get(node_type_variant, {})
		if not (coverage_variant is Dictionary):
			continue
		var coverage: Dictionary = coverage_variant as Dictionary
		var complete: bool = bool(coverage.get("complete", false))
		semantics[node_type] = {
			"mode": "full" if complete else "sampled",
			"isFull": complete,
			"isSampled": not complete,
			"count": int(coverage.get("count", 0)),
			"sampleCount": int(coverage.get("sampleCount", 0)),
			"sampleLimit": int(coverage.get("sampleLimit", WORLD_CELL_RUNTIME_AUDIT_SAMPLE_LIMIT)),
			"truncated": bool(coverage.get("truncated", false)),
		}
	return semantics


func _resolve_world_cell_runtime_builder_reason_count_mode(semantics_by_type: Dictionary) -> String:
	var has_full := false
	var has_sampled := false
	for semantics_variant in semantics_by_type.values():
		if not (semantics_variant is Dictionary):
			continue
		var semantics: Dictionary = semantics_variant as Dictionary
		var mode: String = str(semantics.get("mode", "")).strip_edges().to_lower()
		if mode == "full":
			has_full = true
		elif mode == "sampled":
			has_sampled = true
	if has_full and has_sampled:
		return "mixed"
	if has_sampled:
		return "sampled"
	if has_full:
		return "full"
	return "none"


func _increment_world_cell_runtime_builder_summary_reason(
	summary: Dictionary,
	counts_key: String,
	by_type_key: String,
	node_type: String,
	reason: String
) -> void:
	var normalized_type: String = node_type.strip_edges().to_lower()
	if normalized_type == "":
		normalized_type = "unknown"
	var normalized_reason: String = reason.strip_edges().to_lower()
	if normalized_reason == "":
		normalized_reason = "unknown"
	var counts_variant: Variant = summary.get(counts_key, {})
	var counts: Dictionary = counts_variant as Dictionary if counts_variant is Dictionary else {}
	_increment_world_cell_audit_count(counts, normalized_reason)
	summary[counts_key] = counts
	var by_type_variant: Variant = summary.get(by_type_key, {})
	var by_type: Dictionary = by_type_variant as Dictionary if by_type_variant is Dictionary else {}
	var type_counts_variant: Variant = by_type.get(normalized_type, {})
	var type_counts: Dictionary = type_counts_variant as Dictionary if type_counts_variant is Dictionary else {}
	_increment_world_cell_audit_count(type_counts, normalized_reason)
	by_type[normalized_type] = type_counts
	summary[by_type_key] = by_type


func _resolve_world_cell_runtime_conflict_summary_reason(sample: Dictionary) -> String:
	var node_type: String = str(sample.get("nodeType", "")).strip_edges().to_lower()
	var conflict_variant: Variant = sample.get("conflict", {})
	var conflict: Dictionary = conflict_variant as Dictionary if conflict_variant is Dictionary else {}
	var existing_type: String = str(conflict.get("existingType", "")).strip_edges().to_lower()
	if node_type == "pass" and existing_type == "city":
		return "city_pass_overlap"
	if str(conflict.get("existingAnchorKey", "")).strip_edges() != "":
		return "reserved_footprint"
	return "unknown_conflict"


func _resolve_world_cell_runtime_duplicate_anchor_summary_reason(sample: Dictionary) -> String:
	if str(sample.get("anchorKey", "")).strip_edges() != "":
		return "same_anchor"
	return "duplicate_anchor"


func _build_world_cell_capture_node_builder_audit_status(
	capture_node_type: String,
	builder_audit_summary: Dictionary,
	skipped_conflict_count: int,
	duplicate_anchor_count: int
) -> Dictionary:
	var normalized_type: String = capture_node_type.strip_edges().to_lower()
	if normalized_type == "":
		normalized_type = "unknown"
	var conflict_sample_coverage_by_type: Dictionary = builder_audit_summary.get("conflictSampleCoverageByType", {}) as Dictionary
	var conflict_sample_coverage: Dictionary = conflict_sample_coverage_by_type.get(normalized_type, {}) as Dictionary
	var duplicate_sample_coverage_by_type: Dictionary = builder_audit_summary.get("duplicateSampleCoverageByType", {}) as Dictionary
	var duplicate_sample_coverage: Dictionary = duplicate_sample_coverage_by_type.get(normalized_type, {}) as Dictionary
	return {
		"captureNodeType": normalized_type,
		"conflictSampleCoverage": conflict_sample_coverage,
		"duplicateSampleCoverage": duplicate_sample_coverage,
		"conflictSamplesComplete": skipped_conflict_count == 0 or bool(conflict_sample_coverage.get("complete", false)),
		"duplicateSamplesComplete": duplicate_anchor_count == 0 or bool(duplicate_sample_coverage.get("complete", false)),
	}


func _build_world_cell_capture_node_reason_audit_status(
	capture_node_type: String,
	builder_audit_summary: Dictionary,
	skipped_conflict_count: int,
	duplicate_anchor_count: int
) -> Dictionary:
	var normalized_type: String = capture_node_type.strip_edges().to_lower()
	if normalized_type == "":
		normalized_type = "unknown"
	var conflict_by_type: Dictionary = builder_audit_summary.get("conflictReasonCountsByType", {}) as Dictionary
	var conflict_reason_counts: Dictionary = conflict_by_type.get(normalized_type, {}) as Dictionary
	var duplicate_by_type: Dictionary = builder_audit_summary.get("duplicateReasonCountsByType", {}) as Dictionary
	var duplicate_reason_counts: Dictionary = duplicate_by_type.get(normalized_type, {}) as Dictionary
	var conflict_semantics_by_type: Dictionary = builder_audit_summary.get("conflictReasonCountSemanticsByType", {}) as Dictionary
	var duplicate_semantics_by_type: Dictionary = builder_audit_summary.get("duplicateReasonCountSemanticsByType", {}) as Dictionary
	var conflict_semantics: Dictionary = conflict_semantics_by_type.get(normalized_type, {}) as Dictionary
	var duplicate_semantics: Dictionary = duplicate_semantics_by_type.get(normalized_type, {}) as Dictionary
	var conflict_reason_total: int = int(conflict_reason_counts.get("total", 0))
	var duplicate_reason_total: int = int(duplicate_reason_counts.get("total", 0))
	return {
		"captureNodeType": normalized_type,
		"conflictReasonCounts": conflict_reason_counts,
		"duplicateReasonCounts": duplicate_reason_counts,
		"conflictReasonCountSemantics": conflict_semantics,
		"duplicateReasonCountSemantics": duplicate_semantics,
		"conflictReasonTotal": conflict_reason_total,
		"duplicateReasonTotal": duplicate_reason_total,
		"conflictReasonTotalMatchesSkippedCount": conflict_reason_total == skipped_conflict_count,
		"duplicateReasonTotalMatchesDuplicateCount": duplicate_reason_total == duplicate_anchor_count,
	}


func _build_world_cell_live_strategic_node_availability_status(raw_backend_node_counts: Dictionary, registered_anchor_counts: Dictionary, active_unique_anchor_counts_by_type: Dictionary = {}) -> Dictionary:
	var observed_raw_counts := {}
	var observed_registered_counts := {}
	var observed_active_unique_counts := {}
	var live_available_types: Array = []
	var missing_live_types: Array = []
	for node_type_variant in WORLD_CELL_LIVE_STRATEGIC_NODE_TYPES:
		var node_type: String = str(node_type_variant).strip_edges().to_lower()
		var raw_count: int = int(raw_backend_node_counts.get(node_type, 0))
		var registered_count: int = int(registered_anchor_counts.get(node_type, 0))
		var active_unique_count: int = int(active_unique_anchor_counts_by_type.get(node_type, 0))
		observed_raw_counts[node_type] = raw_count
		observed_registered_counts[node_type] = registered_count
		observed_active_unique_counts[node_type] = active_unique_count
		if raw_count > 0:
			live_available_types.append(node_type)
		else:
			missing_live_types.append(node_type)
	return {
		"source": "/api/world/map-layout",
		"expectedNodeTypes": WORLD_CELL_LIVE_STRATEGIC_NODE_TYPES.duplicate(true),
		"observedRawBackendCounts": observed_raw_counts,
		"observedRegisteredAnchorCounts": observed_registered_counts,
		"observedRegisteredAnchorCountsSemantics": "registered_attempts_before_duplicate_last_write",
		"observedActiveUniqueAnchorCounts": observed_active_unique_counts,
		"liveAvailableTypes": live_available_types,
		"missingLiveTypes": missing_live_types,
		"liveRegressionCoveredTypes": live_available_types.duplicate(true),
		"liveRegressionMissingTypes": missing_live_types.duplicate(true),
		"allExpectedTypesAvailable": missing_live_types.is_empty(),
		"passOnlyCurrentBackend": live_available_types.size() == 1 and str(live_available_types[0]) == "pass",
	}


func _build_world_cell_live_pass_audit_status(live_backend: Dictionary) -> Dictionary:
	var node_type_stats: Dictionary = live_backend.get("nodeTypeStats", {}) as Dictionary
	var raw_backend_node_counts: Dictionary = live_backend.get("rawBackendNodeCounts", {}) as Dictionary
	var sample_hit_stats: Dictionary = live_backend.get("sampleHitStats", {}) as Dictionary
	var reserved_hit_coverage_audit: Dictionary = live_backend.get("reservedHitCoverageAudit", {}) as Dictionary
	var builder_audit_summary: Dictionary = live_backend.get("builderAuditSummary", {}) as Dictionary
	var runtime_strategy_handler_audit: Dictionary = live_backend.get("runtimeStrategyHandlerAudit", {}) as Dictionary
	var placement_context_status: Dictionary = live_backend.get("placementContextStatus", {}) as Dictionary
	var strategic_node_availability: Dictionary = live_backend.get("strategicNodeAvailability", {}) as Dictionary
	var strategic_node_raw_counts: Dictionary = strategic_node_availability.get("observedRawBackendCounts", {}) as Dictionary
	var pass_only_current_backend: bool = bool(strategic_node_availability.get("passOnlyCurrentBackend", false))
	var raw_backend_node_count: int = int(node_type_stats.get("rawBackendNodeCount", 0))
	var registered_attempt_count: int = int(node_type_stats.get("registeredAttemptCount", node_type_stats.get("registeredAnchorCount", 0)))
	var registered_anchor_count: int = int(node_type_stats.get("registeredAnchorCount", registered_attempt_count))
	var active_unique_anchor_count: int = int(node_type_stats.get("activeUniqueAnchorCount", 0))
	var duplicate_anchor_count: int = int(node_type_stats.get("duplicateAnchorCount", 0))
	var skipped_conflict_count: int = int(node_type_stats.get("skippedConflictCount", 0))
	var skipped_invalid_count: int = int(node_type_stats.get("skippedInvalidCount", 0))
	var raw_total_count: int = int(raw_backend_node_counts.get("total", 0))
	var capture_node_type: String = str(node_type_stats.get("nodeType", "pass")).strip_edges().to_lower()
	if capture_node_type == "":
		capture_node_type = "pass"
	var conflict_by_type: Dictionary = builder_audit_summary.get("conflictReasonCountsByType", {}) as Dictionary
	var pass_conflicts: Dictionary = conflict_by_type.get("pass", {}) as Dictionary
	var duplicate_by_type: Dictionary = builder_audit_summary.get("duplicateReasonCountsByType", {}) as Dictionary
	var pass_duplicates: Dictionary = duplicate_by_type.get("pass", {}) as Dictionary
	var capture_node_builder_audit_status: Dictionary = live_backend.get("captureNodeBuilderAuditStatus", {}) as Dictionary
	if capture_node_builder_audit_status.is_empty():
		capture_node_builder_audit_status = _build_world_cell_capture_node_builder_audit_status(
			capture_node_type,
			builder_audit_summary,
			skipped_conflict_count,
			duplicate_anchor_count
		)
	var capture_node_reason_audit_status: Dictionary = live_backend.get("captureNodeReasonAuditStatus", {}) as Dictionary
	if capture_node_reason_audit_status.is_empty():
		capture_node_reason_audit_status = _build_world_cell_capture_node_reason_audit_status(
			capture_node_type,
			builder_audit_summary,
			skipped_conflict_count,
			duplicate_anchor_count
		)
	var pass_specific_checks_apply: bool = capture_node_type == "pass"
	var checks := {
		"rawBackendPassOnly": true if not pass_only_current_backend else raw_total_count == raw_backend_node_count,
		"registeredPlusDuplicateMatchesRaw": registered_anchor_count + duplicate_anchor_count == raw_backend_node_count,
		"registeredAttemptPlusSkippedMatchesRaw": registered_attempt_count + skipped_conflict_count + skipped_invalid_count == raw_backend_node_count,
		"activeUniquePlusDuplicatePlusSkippedMatchesRaw": active_unique_anchor_count + duplicate_anchor_count + skipped_conflict_count + skipped_invalid_count == raw_backend_node_count,
		"skippedInvalidZero": skipped_invalid_count == 0,
		"sampleHitAllOk": bool(sample_hit_stats.get("allHitOk", false)),
		"sampleScreenRoundtripAllOk": bool(sample_hit_stats.get("allScreenRoundtripOk", false)),
		"sampleReservedProxyAllOk": bool(sample_hit_stats.get("allReservedProxyOk", false)),
		"sampleSelectionAllOk": bool(sample_hit_stats.get("allSelectionOk", false)),
		"sampleHoverAllOk": bool(sample_hit_stats.get("allHoverOk", false)),
		"reservedHitCoverageHasCells": int(reserved_hit_coverage_audit.get("footprintCellHitCount", 0)) > 0,
		"reservedHitCoverageAllOk": bool(reserved_hit_coverage_audit.get("allReservedHitsOk", false)),
		"captureNodeConflictReasonTotalMatchesSkippedCount": bool(capture_node_reason_audit_status.get("conflictReasonTotalMatchesSkippedCount", false)),
		"captureNodeDuplicateReasonTotalMatchesDuplicateCount": bool(capture_node_reason_audit_status.get("duplicateReasonTotalMatchesDuplicateCount", false)),
		"passConflictReasonMatchesSkippedCount": true if not pass_specific_checks_apply else int(pass_conflicts.get("city_pass_overlap", 0)) == skipped_conflict_count,
		"passDuplicateReasonMatchesDuplicateCount": true if not pass_specific_checks_apply else int(pass_duplicates.get("same_anchor", 0)) == duplicate_anchor_count,
		"captureNodeConflictSamplesComplete": bool(capture_node_builder_audit_status.get("conflictSamplesComplete", false)),
		"captureNodeDuplicateSamplesComplete": bool(capture_node_builder_audit_status.get("duplicateSamplesComplete", false)),
		"passConflictSamplesComplete": bool(capture_node_builder_audit_status.get("conflictSamplesComplete", false)),
		"passDuplicateSamplesComplete": bool(capture_node_builder_audit_status.get("duplicateSamplesComplete", false)),
		"placementPolicyReservedContextsAllBlocked": bool(placement_context_status.get("allReservedPlacementContextsBlocked", false)),
		"placementPolicyMovementDeferredUnblocked": bool(placement_context_status.get("allDeferredMovementContextsUnblocked", false)),
		"runtimeStrategyHandlersOk": bool(runtime_strategy_handler_audit.get("ok", false)),
		"strategicNodeLivePassAvailable": int(strategic_node_raw_counts.get("pass", 0)) > 0,
		"allExpectedStrategicNodeTypesAvailable": bool(strategic_node_availability.get("allExpectedTypesAvailable", false)),
	}
	var failed_checks: Array = []
	for check_key_variant in checks.keys():
		var check_key: String = str(check_key_variant)
		if not bool(checks.get(check_key, false)):
			failed_checks.append(check_key)
	return {
		"ok": failed_checks.is_empty(),
		"checks": checks,
		"failedChecks": failed_checks,
		"expected": {
			"captureNodeType": capture_node_type,
			"rawBackendNodeCount": raw_backend_node_count,
			"registeredAttemptCount": registered_attempt_count,
			"registeredAnchorCount": registered_anchor_count,
			"registeredAnchorCountSemantics": str(node_type_stats.get("registeredAnchorCountSemantics", "registered_attempts_before_duplicate_last_write")).strip_edges(),
			"activeUniqueAnchorCount": active_unique_anchor_count,
			"duplicateAnchorCount": duplicate_anchor_count,
			"skippedConflictCount": skipped_conflict_count,
			"skippedInvalidCount": skipped_invalid_count,
			"duplicateAnchorPolicy": WORLD_CELL_DUPLICATE_ANCHOR_POLICY,
			"passConflictReason": "city_pass_overlap",
			"passDuplicateReason": "same_anchor",
			"passSpecificChecksApplied": pass_specific_checks_apply,
			"captureNodeReasonAuditStatus": capture_node_reason_audit_status,
			"captureNodeBuilderAuditStatus": capture_node_builder_audit_status,
			"passConflictSampleCoverage": capture_node_builder_audit_status.get("conflictSampleCoverage", {}),
			"passDuplicateSampleCoverage": capture_node_builder_audit_status.get("duplicateSampleCoverage", {}),
			"reservedHitFootprintCellCount": int(reserved_hit_coverage_audit.get("footprintCellHitCount", 0)),
			"reservedHitNonAnchorCoverageAvailable": bool(reserved_hit_coverage_audit.get("nonAnchorCoverageAvailable", false)),
			"reservedHitCoverageMode": str(reserved_hit_coverage_audit.get("coverageMode", "")).strip_edges(),
			"reservedHitDataShape": reserved_hit_coverage_audit.get("dataShape", {}),
			"placementContextStatus": placement_context_status,
			"runtimeStrategyHandlerAudit": runtime_strategy_handler_audit,
			"strategicNodeAvailability": strategic_node_availability,
		},
	}


func _build_world_cell_live_node_capture_status(live_backend: Dictionary, samples: Array) -> Dictionary:
	var expected_node_types: Array = WORLD_CELL_LIVE_STRATEGIC_NODE_TYPES.duplicate(true)
	var strategic_node_availability: Dictionary = live_backend.get("strategicNodeAvailability", {}) as Dictionary
	var observed_raw_counts: Dictionary = strategic_node_availability.get("observedRawBackendCounts", {}) as Dictionary
	var sample_hit_stats: Dictionary = live_backend.get("sampleHitStats", {}) as Dictionary
	var reserved_hit_coverage_audit: Dictionary = live_backend.get("reservedHitCoverageAudit", {}) as Dictionary
	var sample_counts_by_type := {}
	var hit_ok_by_type := {}
	var screen_roundtrip_ok_by_type := {}
	var reserved_proxy_ok_by_type := {}
	var selection_ok_by_type := {}
	var hover_ok_by_type := {}
	for sample_variant in samples:
		if not (sample_variant is Dictionary):
			continue
		var sample: Dictionary = sample_variant as Dictionary
		var node_type: String = str(sample.get("type", "")).strip_edges().to_lower()
		if node_type == "":
			node_type = "unknown"
		var hit_variant: Variant = sample.get("hit", {})
		var hit: Dictionary = hit_variant as Dictionary if hit_variant is Dictionary else {}
		var interaction_variant: Variant = sample.get("interaction", {})
		var interaction: Dictionary = interaction_variant as Dictionary if interaction_variant is Dictionary else {}
		var hit_ok: bool = bool(sample.get("hitOk", hit.get("ok", false)))
		var screen_roundtrip_ok: bool = bool(sample.get("screenRoundtripOk", hit.get("screenRoundtripOk", false)))
		var reserved_proxy_ok: bool = bool(sample.get("reservedProxyOk", hit.get("reservedProxyOk", false)))
		var selection_ok: bool = bool(interaction.get("selectionOk", hit_ok))
		var hover_ok: bool = bool(interaction.get("hoverOk", hit_ok))
		_increment_world_cell_audit_count(sample_counts_by_type, node_type)
		if hit_ok:
			_increment_world_cell_audit_count(hit_ok_by_type, node_type)
		if screen_roundtrip_ok:
			_increment_world_cell_audit_count(screen_roundtrip_ok_by_type, node_type)
		if reserved_proxy_ok:
			_increment_world_cell_audit_count(reserved_proxy_ok_by_type, node_type)
		if selection_ok:
			_increment_world_cell_audit_count(selection_ok_by_type, node_type)
		if hover_ok:
			_increment_world_cell_audit_count(hover_ok_by_type, node_type)
	var missing_sample_types: Array = []
	var missing_raw_types: Array = []
	for expected_type_variant in expected_node_types:
		var expected_type: String = str(expected_type_variant).strip_edges().to_lower()
		if expected_type == "":
			continue
		if int(sample_counts_by_type.get(expected_type, 0)) <= 0:
			missing_sample_types.append(expected_type)
		if int(observed_raw_counts.get(expected_type, 0)) <= 0:
			missing_raw_types.append(expected_type)
	var checks := {
		"sampleCountPositive": samples.size() > 0,
		"allExpectedTypesSampled": missing_sample_types.is_empty(),
		"allExpectedTypesAvailable": bool(strategic_node_availability.get("allExpectedTypesAvailable", false)),
		"expectedRawTypesPresent": missing_raw_types.is_empty(),
		"sampleHitAllOk": bool(sample_hit_stats.get("allHitOk", false)),
		"sampleScreenRoundtripAllOk": bool(sample_hit_stats.get("allScreenRoundtripOk", false)),
		"sampleReservedProxyAllOk": bool(sample_hit_stats.get("allReservedProxyOk", false)),
		"sampleSelectionAllOk": bool(sample_hit_stats.get("allSelectionOk", false)),
		"sampleHoverAllOk": bool(sample_hit_stats.get("allHoverOk", false)),
		"reservedHitCoverageHasCells": int(reserved_hit_coverage_audit.get("footprintCellHitCount", 0)) > 0,
		"reservedHitCoverageAllOk": bool(reserved_hit_coverage_audit.get("allReservedHitsOk", false)),
	}
	var failed_checks: Array = []
	for check_key_variant in checks.keys():
		var check_key: String = str(check_key_variant)
		if not bool(checks.get(check_key, false)):
			failed_checks.append(check_key)
	return {
		"ok": failed_checks.is_empty(),
		"checks": checks,
		"failedChecks": failed_checks,
		"expectedNodeTypes": expected_node_types,
		"sampleCountsByType": sample_counts_by_type,
		"hitOkByType": hit_ok_by_type,
		"screenRoundtripOkByType": screen_roundtrip_ok_by_type,
		"reservedProxyOkByType": reserved_proxy_ok_by_type,
		"selectionOkByType": selection_ok_by_type,
		"hoverOkByType": hover_ok_by_type,
		"missingSampleTypes": missing_sample_types,
		"missingRawTypes": missing_raw_types,
		"observedRawBackendCounts": observed_raw_counts,
		"sampleHitStats": sample_hit_stats,
		"reservedHitCoverageAuditSummary": {
			"footprintCellHitCount": int(reserved_hit_coverage_audit.get("footprintCellHitCount", 0)),
			"allReservedHitsOk": bool(reserved_hit_coverage_audit.get("allReservedHitsOk", false)),
			"coverageMode": str(reserved_hit_coverage_audit.get("coverageMode", "")).strip_edges(),
		},
	}


func _build_world_cell_live_pass_runtime_strategy_audit(samples: Array) -> Dictionary:
	var strategy_rules := {}
	for strategy_variant in WORLD_CELL_RUNTIME_STRATEGY_ORDER:
		var strategy: String = str(strategy_variant).strip_edges()
		strategy_rules[strategy] = _resolve_world_cell_runtime_strategy_rule(strategy).duplicate(true)
	var sample_strategies := {}
	for sample_variant in samples:
		if not (sample_variant is Dictionary):
			continue
		var sample: Dictionary = sample_variant as Dictionary
		var sample_id: String = str(sample.get("id", "")).strip_edges()
		if sample_id == "":
			continue
		var tile_type: String = str(sample.get("type", "")).strip_edges().to_lower()
		var strategy: String = _resolve_world_cell_runtime_strategy_for_type(tile_type)
		sample_strategies[sample_id] = {
			"type": tile_type,
			"footprintId": str(sample.get("footprintId", "")).strip_edges(),
			"compositeId": str(sample.get("compositeId", "")).strip_edges(),
			"strategy": strategy,
			"priority": _resolve_world_cell_runtime_strategy_priority(strategy, tile_type),
		}
	return {
		"strategyRules": strategy_rules,
		"samples": sample_strategies,
	}


func _increment_world_cell_audit_count(bucket: Dictionary, key: String) -> void:
	var normalized_key: String = key.strip_edges()
	if normalized_key == "":
		normalized_key = "unknown"
	bucket[normalized_key] = int(bucket.get(normalized_key, 0)) + 1
	bucket["total"] = int(bucket.get("total", 0)) + 1


func _build_world_cell_active_unique_anchor_audit() -> Dictionary:
	var active_anchor_counts_by_footprint := {}
	var active_anchor_counts_by_type := {}
	for anchor_key_variant in _world_cell_node_anchor_by_tmx_key.keys():
		var anchor_key: String = str(anchor_key_variant).strip_edges()
		var anchor_entry_variant: Variant = _world_cell_node_anchor_by_tmx_key.get(anchor_key, {})
		if not (anchor_entry_variant is Dictionary):
			continue
		var anchor_entry: Dictionary = anchor_entry_variant as Dictionary
		_increment_world_cell_audit_count(
			active_anchor_counts_by_footprint,
			str(anchor_entry.get("footprintId", "")).strip_edges()
		)
		_increment_world_cell_audit_count(
			active_anchor_counts_by_type,
			str(anchor_entry.get("type", "")).strip_edges().to_lower()
		)
	return {
		"activeAnchorCountsByFootprint": active_anchor_counts_by_footprint,
		"activeAnchorCountsByType": active_anchor_counts_by_type,
	}


func _build_world_cell_runtime_builder_lifecycle_summary(builder_stats: Dictionary, active_unique_anchor_counts_by_type: Dictionary) -> Dictionary:
	var raw_counts: Dictionary = builder_stats.get("rawBackendNodeCounts", {}) as Dictionary
	var registered_attempt_counts: Dictionary = builder_stats.get("registeredAttemptCounts", builder_stats.get("registeredAnchorCounts", {})) as Dictionary
	var registered_anchor_counts: Dictionary = builder_stats.get("registeredAnchorCounts", registered_attempt_counts) as Dictionary
	var duplicate_counts: Dictionary = builder_stats.get("duplicateAnchorCounts", {}) as Dictionary
	var skipped_conflict_counts: Dictionary = builder_stats.get("skippedConflictCounts", {}) as Dictionary
	var skipped_invalid_counts: Dictionary = builder_stats.get("skippedInvalidCounts", {}) as Dictionary
	var node_type_set := {}
	for counts in [
		raw_counts,
		registered_attempt_counts,
		registered_anchor_counts,
		active_unique_anchor_counts_by_type,
		duplicate_counts,
		skipped_conflict_counts,
		skipped_invalid_counts,
	]:
		_collect_world_cell_runtime_builder_lifecycle_node_types(node_type_set, counts)
	var counts_by_type := {}
	for node_type_variant in node_type_set.keys():
		var node_type: String = str(node_type_variant).strip_edges().to_lower()
		if node_type == "":
			continue
		counts_by_type[node_type] = {
			"rawBackendNodeCount": int(raw_counts.get(node_type, 0)),
			"registeredAttemptCount": int(registered_attempt_counts.get(node_type, 0)),
			"registeredAnchorCount": int(registered_anchor_counts.get(node_type, 0)),
			"activeUniqueAnchorCount": int(active_unique_anchor_counts_by_type.get(node_type, 0)),
			"duplicateAnchorCount": int(duplicate_counts.get(node_type, 0)),
			"skippedConflictCount": int(skipped_conflict_counts.get(node_type, 0)),
			"skippedInvalidCount": int(skipped_invalid_counts.get(node_type, 0)),
		}
	return {
		"duplicateAnchorPolicy": WORLD_CELL_DUPLICATE_ANCHOR_POLICY,
		"countFieldSemantics": {
			"rawBackendNodeCounts": "raw supported backend strategic node records before runtime grouping",
			"registeredAttemptCounts": "runtime groups accepted for anchor registration before duplicate last-write",
			"registeredAnchorCounts": "compat alias for registeredAttemptCounts",
			"activeUniqueAnchorCountsByType": "active anchors after duplicate last-write by tmx anchor key",
			"duplicateAnchorCounts": "accepted groups that overwrote an existing anchor key",
			"skippedConflictCounts": "groups rejected by reserved footprint conflict before registration",
			"skippedInvalidCounts": "groups rejected before conflict checks because anchor/footprint/visual data was invalid",
		},
		"countsByType": counts_by_type,
		"totals": {
			"rawBackendNodeCount": int(raw_counts.get("total", 0)),
			"registeredAttemptCount": int(registered_attempt_counts.get("total", 0)),
			"registeredAnchorCount": int(registered_anchor_counts.get("total", 0)),
			"activeUniqueAnchorCount": int(active_unique_anchor_counts_by_type.get("total", 0)),
			"duplicateAnchorCount": int(duplicate_counts.get("total", 0)),
			"skippedConflictCount": int(skipped_conflict_counts.get("total", 0)),
			"skippedInvalidCount": int(skipped_invalid_counts.get("total", 0)),
		},
	}


func _collect_world_cell_runtime_builder_lifecycle_node_types(node_type_set: Dictionary, counts: Dictionary) -> void:
	for node_type_variant in counts.keys():
		var node_type: String = str(node_type_variant).strip_edges().to_lower()
		if node_type == "" or node_type == "total":
			continue
		node_type_set[node_type] = true


func _build_world_cell_reserved_footprint_audit() -> Dictionary:
	var reserved_cell_counts_by_footprint := {}
	var reserved_cell_samples_by_footprint := {}
	for tmx_key_variant in _world_cell_reserved_footprint_tmx_keys.keys():
		var tmx_key: String = str(tmx_key_variant).strip_edges()
		var footprint_id: String = str(_world_cell_reserved_footprint_tmx_keys.get(tmx_key, "")).strip_edges()
		_increment_world_cell_audit_count(reserved_cell_counts_by_footprint, footprint_id)
		var samples_variant: Variant = reserved_cell_samples_by_footprint.get(footprint_id, [])
		var samples: Array = samples_variant as Array if samples_variant is Array else []
		if samples.size() < 8:
			samples.append({
				"tmxKey": tmx_key,
				"anchorKey": str(_world_cell_reserved_anchor_by_tmx_key.get(tmx_key, "")).strip_edges(),
				"center": _world_cell_reserved_center_by_tmx_key.get(tmx_key, []),
			})
			reserved_cell_samples_by_footprint[footprint_id] = samples
	var active_anchor_audit: Dictionary = _build_world_cell_active_unique_anchor_audit()
	return {
		"reservedCellCountsByFootprint": reserved_cell_counts_by_footprint,
		"activeAnchorCountsByFootprint": active_anchor_audit.get("activeAnchorCountsByFootprint", {}),
		"activeAnchorCountsByType": active_anchor_audit.get("activeAnchorCountsByType", {}),
		"reservedCellSamplesByFootprint": reserved_cell_samples_by_footprint,
	}


func _estimate_world_cell_preview_sample_rect(center_tmx: Vector2i, footprint_id: String) -> Rect2:
	var offsets: Array = _resolve_world_cell_footprint_offsets(footprint_id, [1, 1])
	if offsets.is_empty():
		var cell_center: Vector2 = _tmx_to_screen(center_tmx.x, center_tmx.y)
		return Rect2(cell_center - Vector2(120.0, 160.0), Vector2(240.0, 260.0))
	var min_x: float = INF
	var min_y: float = INF
	var max_x: float = -INF
	var max_y: float = -INF
	for offset_variant in offsets:
		var offset: Vector2i = _vector2i_from_json_array(offset_variant, Vector2i.ZERO)
		var cell_center: Vector2 = _tmx_to_screen(center_tmx.x + offset.x, center_tmx.y + offset.y)
		min_x = min(min_x, cell_center.x)
		min_y = min(min_y, cell_center.y)
		max_x = max(max_x, cell_center.x)
		max_y = max(max_y, cell_center.y)
	var padding_x: float = max(96.0, 240.0 * _zoom)
	var padding_top: float = max(128.0, 380.0 * _zoom)
	var padding_bottom: float = max(84.0, 180.0 * _zoom)
	return Rect2(
		Vector2(min_x - padding_x, min_y - padding_top),
		Vector2((max_x - min_x) + padding_x * 2.0, (max_y - min_y) + padding_top + padding_bottom)
	)


func _rect2_to_json_array(rect: Rect2) -> Array:
	return [rect.position.x, rect.position.y, rect.size.x, rect.size.y]


func _get_world_cell_composite(composite_id: String) -> Dictionary:
	var normalized_id: String = composite_id.strip_edges()
	if normalized_id == "":
		return {}
	var composite_variant: Variant = _world_cell_composite_by_id.get(normalized_id, {})
	if composite_variant is Dictionary:
		return composite_variant as Dictionary
	return {}


func _resolve_world_cell_anchor_layers(composite: Dictionary) -> Array:
	if composite.is_empty():
		return []
	var layers_variant: Variant = composite.get("layers", [])
	if not (layers_variant is Array):
		return []
	var anchor_layers: Array = []
	for layer_variant in layers_variant:
		if not (layer_variant is Dictionary):
			continue
		var layer: Dictionary = layer_variant as Dictionary
		var layer_role: String = str(layer.get("layer_role", "")).strip_edges()
		var frame_name: String = str(layer.get("frame", "")).strip_edges()
		if layer_role == "":
			if frame_name == "world_cell_city_ground_base_v1.png":
				layer_role = "base"
			elif frame_name == "city_wall_ring_profile_v1.png":
				layer_role = "perimeter"
			elif frame_name != "":
				layer_role = "structure"
		if layer_role == "base":
			continue
		anchor_layers.append(layer.duplicate(true))
	return anchor_layers


func _resolve_world_cell_payload_slots(
	composite: Dictionary,
	anchor_entry: Dictionary,
	footprint_id: String,
	group_size: int
) -> Array:
	if composite.is_empty():
		return []
	var payload_slots_variant: Variant = composite.get("payload_slots", [])
	if not (payload_slots_variant is Array):
		return []
	var payload_slots: Array = payload_slots_variant as Array
	if payload_slots.is_empty():
		return []
	var active_stage: int = _resolve_world_cell_node_payload_stage(anchor_entry, footprint_id, group_size, composite)
	var resolved_slots: Array = []
	for slot_variant in payload_slots:
		if not (slot_variant is Dictionary):
			continue
		var slot: Dictionary = (slot_variant as Dictionary).duplicate(true)
		var activation_stage: int = maxi(0, int(slot.get("activation_stage", 0)))
		var is_active: bool = active_stage >= activation_stage
		slot["active"] = is_active
		slot["cellState"] = "active_building_cell" if is_active else "reserved_building_cell"
		resolved_slots.append(slot)
	return resolved_slots


func _resolve_world_cell_node_payload_stage(
	anchor_entry: Dictionary,
	footprint_id: String,
	group_size: int,
	composite: Dictionary
) -> int:
	if anchor_entry.has("expansionStage"):
		return maxi(0, int(anchor_entry.get("expansionStage", 0)))
	if anchor_entry.has("payloadStage"):
		return maxi(0, int(anchor_entry.get("payloadStage", 0)))
	var strategy: String = _resolve_world_cell_runtime_strategy(anchor_entry, footprint_id)
	return _resolve_world_cell_strategy_payload_stage(strategy, anchor_entry, footprint_id, group_size, composite)


func _resolve_world_cell_city_strategy_payload_stage(
	anchor_entry: Dictionary,
	footprint_id: String,
	group_size: int,
	composite: Dictionary
) -> int:
	var composite_stage_max: int = maxi(0, int(composite.get("payload_stage_max", 0)))
	if footprint_id == WORLD_CELL_FOOTPRINT_PLAYER_CITY_3X3_INITIAL:
		return 0
	if footprint_id == WORLD_CELL_FOOTPRINT_AI_CITY_3X3_INITIAL:
		return 0
	var owner_id: String = str(anchor_entry.get("owner", "")).strip_edges().to_lower()
	if owner_id != "" and owner_id != "neutral" and group_size <= 9:
		return 0
	var city_level: int = clampi(int(anchor_entry.get("cityLevel", 1)), 1, 9)
	return clampi(city_level - 3, 0, composite_stage_max)


func _build_world_cell_payload_state_by_offset(payload_slots_variant: Variant) -> Dictionary:
	var payload_state_by_offset: Dictionary = {}
	if not (payload_slots_variant is Array):
		return payload_state_by_offset
	var payload_slots: Array = payload_slots_variant as Array
	for slot_variant in payload_slots:
		if not (slot_variant is Dictionary):
			continue
		var slot: Dictionary = slot_variant as Dictionary
		var cell_offset: Vector2i = _vector2i_from_json_array(slot.get("cell_offset", []), Vector2i.ZERO)
		payload_state_by_offset[_coord_key(cell_offset.x, cell_offset.y)] = {
			"slotId": str(slot.get("slot_id", "")).strip_edges(),
			"cellState": str(slot.get("cellState", "reserved_building_cell")).strip_edges(),
			"active": bool(slot.get("active", false)),
		}
	return payload_state_by_offset


func _resolve_world_cell_city_strategy_composite_id(anchor_entry: Dictionary, group_size: int) -> String:
	var city_level: int = maxi(1, int(anchor_entry.get("cityLevel", 1)))
	var strategy_rule: Dictionary = _resolve_world_cell_city_strategy_rule(anchor_entry, group_size)
	var footprint_id: String = str(strategy_rule.get("footprint_id", _resolve_system_city_footprint_id(city_level))).strip_edges()
	var composite_fallback: String = str(strategy_rule.get("composite_fallback", "world_node_city_v1")).strip_edges()
	var footprint_rule: Dictionary = _get_world_cell_footprint_rule(footprint_id)
	var composite_id: String = str(footprint_rule.get("default_composite_id", composite_fallback)).strip_edges()
	if composite_id != "" and _world_cell_composite_by_id.has(composite_id):
		return composite_id
	return ""


func _resolve_world_cell_runtime_footprint_id(anchor_entry: Dictionary, group_size: int) -> String:
	var explicit_footprint_id: String = str(anchor_entry.get("footprintId", "")).strip_edges()
	if explicit_footprint_id != "" and not _get_world_cell_footprint_rule(explicit_footprint_id).is_empty():
		return explicit_footprint_id
	var strategy: String = _resolve_world_cell_runtime_strategy(anchor_entry, explicit_footprint_id)
	var strategy_footprint_id: String = _resolve_world_cell_strategy_footprint_id(strategy, anchor_entry, group_size)
	if strategy_footprint_id != "":
		return strategy_footprint_id
	var tile_type: String = _resolve_world_cell_runtime_type(anchor_entry, explicit_footprint_id)
	return _resolve_world_cell_node_dispatch_footprint_id(tile_type)


func _resolve_world_cell_runtime_composite_id(anchor_entry: Dictionary, footprint_id: String, group_size: int) -> String:
	var explicit_composite_id: String = str(anchor_entry.get("compositeId", "")).strip_edges()
	if explicit_composite_id != "" and _world_cell_composite_by_id.has(explicit_composite_id):
		return explicit_composite_id
	var strategy: String = _resolve_world_cell_runtime_strategy(anchor_entry, footprint_id)
	var strategy_composite_id: String = _resolve_world_cell_strategy_composite_id(strategy, anchor_entry, group_size)
	if strategy_composite_id != "":
		return strategy_composite_id
	var tile_type: String = _resolve_world_cell_runtime_type(anchor_entry, footprint_id)
	var node_composite_id: String = _resolve_world_cell_node_dispatch_composite_id(tile_type, anchor_entry)
	if node_composite_id != "" and _world_cell_composite_by_id.has(node_composite_id):
		return node_composite_id
	var rule: Dictionary = _get_world_cell_footprint_rule(footprint_id)
	var default_composite_id: String = str(rule.get("default_composite_id", "")).strip_edges()
	if default_composite_id != "" and _world_cell_composite_by_id.has(default_composite_id):
		return default_composite_id
	return explicit_composite_id


func _resolve_world_cell_city_strategy_footprint_id(anchor_entry: Dictionary, group_size: int) -> String:
	var city_level: int = maxi(1, int(anchor_entry.get("cityLevel", 1)))
	var strategy_rule: Dictionary = _resolve_world_cell_city_strategy_rule(anchor_entry, group_size)
	var strategy_footprint_id: String = str(strategy_rule.get("footprint_id", "")).strip_edges()
	if strategy_footprint_id != "":
		return strategy_footprint_id
	return _resolve_system_city_footprint_id(city_level)


func _resolve_world_cell_city_strategy_rule(anchor_entry: Dictionary, group_size: int) -> Dictionary:
	for rule_variant in WORLD_CELL_CITY_STRATEGY_RULES:
		if not (rule_variant is Dictionary):
			continue
		var rule: Dictionary = rule_variant as Dictionary
		if _does_world_cell_city_strategy_rule_match(rule, anchor_entry, group_size):
			return rule
	return {}


func _does_world_cell_city_strategy_rule_match(rule: Dictionary, anchor_entry: Dictionary, group_size: int) -> bool:
	var any_of_variant: Variant = rule.get("any_of", [])
	if any_of_variant is Array:
		var any_rules: Array = any_of_variant as Array
		if not any_rules.is_empty():
			var any_matched: bool = false
			for any_rule_variant in any_rules:
				if any_rule_variant is Dictionary and _does_world_cell_city_strategy_rule_match(any_rule_variant as Dictionary, anchor_entry, group_size):
					any_matched = true
					break
			if not any_matched:
				return false
	var tile_ids_variant: Variant = rule.get("tile_ids", [])
	if tile_ids_variant is Array and not (tile_ids_variant as Array).is_empty():
		var tile_id: String = str(anchor_entry.get("tileId", "")).strip_edges().to_lower()
		if not _string_array_has(tile_ids_variant, tile_id):
			return false
	var landmark_ids_variant: Variant = rule.get("landmark_ids", [])
	if landmark_ids_variant is Array and not (landmark_ids_variant as Array).is_empty():
		var landmark_id: String = str(anchor_entry.get("landmarkId", "")).strip_edges().to_lower()
		if not _string_array_has(landmark_ids_variant, landmark_id):
			return false
	var owner_excludes_variant: Variant = rule.get("owner_excludes", [])
	if bool(rule.get("owner_required", false)):
		var owner_id: String = str(anchor_entry.get("owner", "")).strip_edges().to_lower()
		if owner_id == "" or _string_array_has(owner_excludes_variant, owner_id):
			return false
	if rule.has("max_group_size") and group_size > int(rule.get("max_group_size", group_size)):
		return false
	if rule.has("min_group_size") and group_size < int(rule.get("min_group_size", group_size)):
		return false
	if rule.has("min_city_level"):
		var city_level: int = maxi(1, int(anchor_entry.get("cityLevel", 1)))
		if city_level < int(rule.get("min_city_level", city_level)):
			return false
	return true


func _resolve_world_cell_runtime_strategy(anchor_entry: Dictionary, footprint_id: String) -> String:
	var tile_type: String = _resolve_world_cell_runtime_type(anchor_entry, footprint_id)
	return _resolve_world_cell_runtime_strategy_for_type(tile_type)


func _resolve_world_cell_runtime_strategy_for_type(tile_type: String) -> String:
	var normalized_type: String = tile_type.strip_edges().to_lower()
	for strategy_variant in WORLD_CELL_RUNTIME_STRATEGY_ORDER:
		var strategy: String = str(strategy_variant).strip_edges()
		var strategy_rule: Dictionary = _resolve_world_cell_runtime_strategy_rule(strategy)
		var tile_types_variant: Variant = strategy_rule.get("tile_types", [])
		if tile_types_variant is Array and _string_array_has(tile_types_variant, normalized_type):
			return strategy
	return WORLD_CELL_RUNTIME_STRATEGY_NODE_DISPATCH


func _resolve_world_cell_runtime_strategy_rule(strategy: String) -> Dictionary:
	var rule_variant: Variant = WORLD_CELL_RUNTIME_STRATEGY_RULES.get(strategy.strip_edges(), {})
	if rule_variant is Dictionary:
		return rule_variant as Dictionary
	return {}


func _resolve_world_cell_strategy_handler_name(strategy: String, handler_key: String) -> String:
	var strategy_rule: Dictionary = _resolve_world_cell_runtime_strategy_rule(strategy)
	return str(strategy_rule.get(handler_key, "")).strip_edges()


func _call_world_cell_strategy_handler(strategy: String, handler_key: String, args: Array) -> Variant:
	var handler_name: String = _resolve_world_cell_strategy_handler_name(strategy, handler_key)
	if handler_name == "" or not has_method(handler_name):
		return null
	return callv(handler_name, args)


func _validate_world_cell_runtime_strategy_handlers() -> void:
	_world_cell_runtime_strategy_handler_audit = _build_world_cell_runtime_strategy_handler_audit()
	if bool(_world_cell_runtime_strategy_handler_audit.get("ok", true)):
		return
	push_warning("[world-cell] runtime strategy handler audit failed | missing=%s" % JSON.stringify(_world_cell_runtime_strategy_handler_audit.get("missingHandlers", [])))


func _build_world_cell_runtime_strategy_handler_audit() -> Dictionary:
	var audit := {
		"ok": true,
		"handlerKeys": WORLD_CELL_RUNTIME_STRATEGY_HANDLER_KEYS.duplicate(true),
		"strategyOrder": WORLD_CELL_RUNTIME_STRATEGY_ORDER.duplicate(true),
		"strategies": {},
		"missingHandlers": [],
	}
	for strategy_variant in WORLD_CELL_RUNTIME_STRATEGY_ORDER:
		var strategy: String = str(strategy_variant).strip_edges()
		var strategy_rule: Dictionary = _resolve_world_cell_runtime_strategy_rule(strategy)
		var strategy_audit := {
			"ruleFound": not strategy_rule.is_empty(),
			"handlers": {},
		}
		for handler_key_variant in WORLD_CELL_RUNTIME_STRATEGY_HANDLER_KEYS:
			var handler_key: String = str(handler_key_variant).strip_edges()
			var handler_name: String = str(strategy_rule.get(handler_key, "")).strip_edges()
			var configured: bool = handler_name != ""
			var exists: bool = true if not configured else has_method(handler_name)
			(strategy_audit["handlers"] as Dictionary)[handler_key] = {
				"configured": configured,
				"handler": handler_name,
				"exists": exists,
			}
			if configured and not exists:
				audit["ok"] = false
				(audit["missingHandlers"] as Array).append({
					"strategy": strategy,
					"handlerKey": handler_key,
					"handler": handler_name,
				})
		(audit["strategies"] as Dictionary)[strategy] = strategy_audit
	return audit


func _resolve_world_cell_strategy_footprint_id(strategy: String, anchor_entry: Dictionary, group_size: int) -> String:
	var handler_result: Variant = _call_world_cell_strategy_handler(
		strategy,
		"footprint_resolver",
		[anchor_entry, group_size]
	)
	if handler_result == null:
		return ""
	return str(handler_result).strip_edges()


func _resolve_world_cell_strategy_composite_id(strategy: String, anchor_entry: Dictionary, group_size: int) -> String:
	var handler_result: Variant = _call_world_cell_strategy_handler(
		strategy,
		"composite_resolver",
		[anchor_entry, group_size]
	)
	if handler_result == null:
		return ""
	return str(handler_result).strip_edges()


func _resolve_world_cell_strategy_payload_stage(
	strategy: String,
	anchor_entry: Dictionary,
	footprint_id: String,
	group_size: int,
	composite: Dictionary
) -> int:
	var handler_result: Variant = _call_world_cell_strategy_handler(
		strategy,
		"payload_stage_resolver",
		[anchor_entry, footprint_id, group_size, composite]
	)
	if handler_result == null:
		return 0
	return maxi(0, int(handler_result))


func _resolve_world_cell_runtime_strategy_priority(strategy: String, tile_type: String) -> int:
	var strategy_rule: Dictionary = _resolve_world_cell_runtime_strategy_rule(strategy)
	if strategy_rule.is_empty():
		return 999
	var priority: int = int(strategy_rule.get("priority", 999))
	if strategy == WORLD_CELL_RUNTIME_STRATEGY_NODE_DISPATCH and _resolve_world_cell_node_dispatch_rule(tile_type).is_empty():
		return int(strategy_rule.get("fallback_priority", priority))
	return priority


func _resolve_world_cell_runtime_type(anchor_entry: Dictionary, footprint_id: String) -> String:
	var explicit_type: String = str(anchor_entry.get("type", anchor_entry.get("role", ""))).strip_edges().to_lower()
	if explicit_type != "":
		return explicit_type
	var rule: Dictionary = _get_world_cell_footprint_rule(footprint_id)
	return str(rule.get("role", "")).strip_edges().to_lower()


func _resolve_world_cell_node_dispatch_rule(node_type: String) -> Dictionary:
	var rule_variant: Variant = WORLD_CELL_NODE_DISPATCH_RULES.get(node_type.strip_edges().to_lower(), {})
	if rule_variant is Dictionary:
		return rule_variant as Dictionary
	return {}


func _resolve_world_cell_node_preview_sample_rule(node_type: String) -> Dictionary:
	var rule_variant: Variant = WORLD_CELL_NODE_PREVIEW_SAMPLE_RULES.get(node_type.strip_edges().to_lower(), {})
	if rule_variant is Dictionary:
		return rule_variant as Dictionary
	return {}


func _is_supported_world_cell_node_tile_type(tile_type: String) -> bool:
	var dispatch_rule: Dictionary = _resolve_world_cell_node_dispatch_rule(tile_type)
	return not dispatch_rule.is_empty() and bool(dispatch_rule.get("backend_enabled", false))


func _resolve_world_cell_node_dispatch_footprint_id(node_type: String) -> String:
	var dispatch_rule: Dictionary = _resolve_world_cell_node_dispatch_rule(node_type)
	return str(dispatch_rule.get("footprint_id", "")).strip_edges()


func _resolve_world_cell_node_dispatch_composite_id(node_type: String, entry: Dictionary = {}) -> String:
	var explicit_composite_id: String = str(entry.get("compositeId", "")).strip_edges()
	if explicit_composite_id != "" and _world_cell_composite_by_id.has(explicit_composite_id):
		return explicit_composite_id
	var dispatch_rule: Dictionary = _resolve_world_cell_node_dispatch_rule(node_type)
	if dispatch_rule.is_empty():
		return ""
	var orientation: String = str(entry.get("orientation", entry.get("direction", entry.get("nodeVariant", entry.get("variant", ""))))).strip_edges().to_lower()
	var orientation_map_variant: Variant = dispatch_rule.get("orientation_composites", {})
	if orientation_map_variant is Dictionary:
		var orientation_map: Dictionary = orientation_map_variant as Dictionary
		var orientation_composite_id: String = str(orientation_map.get(orientation, "")).strip_edges()
		if orientation_composite_id != "":
			return orientation_composite_id
	return str(dispatch_rule.get("default_composite_id", "")).strip_edges()


func _resolve_world_cell_node_dispatch_default_terrain(node_type: String) -> String:
	var dispatch_rule: Dictionary = _resolve_world_cell_node_dispatch_rule(node_type)
	var default_terrain: String = str(dispatch_rule.get("default_terrain", "")).strip_edges().to_lower()
	if default_terrain != "":
		return default_terrain
	return node_type.strip_edges().to_lower()


func _build_world_cell_backend_node_entry(
	tile_data: Dictionary,
	tile_id: String,
	tile_x: int,
	tile_y: int,
	mapped_x: int,
	mapped_y: int
) -> Dictionary:
	var tile_type: String = str(tile_data.get("type", "")).strip_edges().to_lower()
	var footprint_id: String = _resolve_world_cell_node_dispatch_footprint_id(tile_type)
	if footprint_id == "":
		return {}
	var node_id: String = tile_id
	if node_id == "":
		node_id = "%s_%d_%d" % [tile_type, tile_x, tile_y]
	var terrain_fallback: String = _resolve_world_cell_node_dispatch_default_terrain(tile_type)
	return {
		"id": node_id,
		"tileId": tile_id,
		"type": tile_type,
		"x": tile_x,
		"y": tile_y,
		"backendX": tile_x,
		"backendY": tile_y,
		"tmxX": mapped_x,
		"tmxY": mapped_y,
		"terrain": str(tile_data.get("terrain", terrain_fallback)).strip_edges().to_lower(),
		"district": str(tile_data.get("district", "world")).strip_edges(),
		"footprintId": footprint_id,
		"compositeId": _resolve_world_cell_node_dispatch_composite_id(tile_type, tile_data),
		"owner": str(tile_data.get("owner", "")).strip_edges().to_lower(),
		"landmarkId": str(tile_data.get("landmarkId", "")).strip_edges(),
		"nodeVariant": str(tile_data.get("variant", tile_data.get("orientation", tile_data.get("direction", "")))).strip_edges().to_lower(),
		"groupKey": node_id,
	}


func _resolve_system_city_footprint_id(city_level: int) -> String:
	var normalized_level: int = clampi(city_level, 3, 9)
	if normalized_level >= 9:
		return WORLD_CELL_FOOTPRINT_SYSTEM_CITY_L09_9X9
	if normalized_level >= 7:
		return WORLD_CELL_FOOTPRINT_SYSTEM_CITY_L07_L08_7X7
	if normalized_level >= 5:
		return WORLD_CELL_FOOTPRINT_SYSTEM_CITY_L05_L06_5X5
	return WORLD_CELL_FOOTPRINT_SYSTEM_CITY_L03_L04_3X3


func _resolve_city_group_key(tile_id: String) -> String:
	var normalized_id: String = tile_id.strip_edges()
	if normalized_id == "":
		return ""
	var parts: PackedStringArray = normalized_id.split("_")
	if parts.size() < 3:
		return normalized_id
	var local_x_text: String = parts[parts.size() - 2]
	var local_y_text: String = parts[parts.size() - 1]
	if not local_x_text.is_valid_int() or not local_y_text.is_valid_int():
		return normalized_id
	var prefix_parts: Array[String] = []
	for index in range(parts.size() - 2):
		prefix_parts.append(parts[index])
	var prefix: String = "_".join(prefix_parts)
	if prefix == "" or prefix == "grid":
		return normalized_id
	var local_x: int = int(local_x_text)
	var local_y: int = int(local_y_text)
	if absi(local_x) > 16 or absi(local_y) > 16:
		return normalized_id
	return prefix


func _ingest_world_city_overlays(world_payload: Dictionary) -> void:
	_world_city_overlay_by_tile_id = {}
	if world_payload.is_empty():
		return
	var map_variant: Variant = world_payload.get("map", {})
	if not (map_variant is Dictionary):
		return
	var map_payload: Dictionary = map_variant as Dictionary
	var tiles_variant: Variant = map_payload.get("tiles", [])
	if not (tiles_variant is Array):
		return
	if _tmx_map_width <= 0 or _tmx_map_height <= 0:
		return
	if _backend_x_min > _backend_x_max or _backend_y_min > _backend_y_max:
		return

	var tiles: Array = tiles_variant as Array
	for tile_variant in tiles:
		if not (tile_variant is Dictionary):
			continue
		var tile_data: Dictionary = tile_variant as Dictionary
		var tile_type: String = str(tile_data.get("type", "")).strip_edges().to_lower()
		if tile_type != "city":
			continue
		var tile_id: String = str(tile_data.get("id", "")).strip_edges()
		if tile_id == "":
			continue
		var tile_x: int = int(tile_data.get("x", 0))
		var tile_y: int = int(tile_data.get("y", 0))
		var mapped_x: int = _map_backend_to_tmx_axis(tile_x, _backend_x_min, _backend_x_max, _tmx_map_width)
		var mapped_y: int = _map_backend_to_tmx_axis(tile_y, _backend_y_min, _backend_y_max, _tmx_map_height)
		_world_city_overlay_by_tile_id[tile_id] = {
			"tileId": tile_id,
			"backendX": tile_x,
			"backendY": tile_y,
			"tmxX": mapped_x,
			"tmxY": mapped_y,
			"cityLevel": maxi(1, int(tile_data.get("cityLevel", 1))),
			"owner": str(tile_data.get("owner", "")).strip_edges().to_lower(),
		}


func _rebuild_terrain_edge_overlay_entries(
	river_backend_entries: Array,
	river_coord_set: Dictionary,
	sand_backend_entries: Array,
	sand_coord_set: Dictionary,
) -> void:
	_terrain_edge_overlay_entries = []
	if not terrain_edge_overlay_enabled:
		return
	if river_edge_enabled:
		_append_terrain_edge_family_entries(river_backend_entries, river_coord_set, "water")
	if terrain_edge_enabled:
		_append_terrain_edge_family_entries(sand_backend_entries, sand_coord_set, "sand")


func _append_terrain_edge_family_entries(backend_entries: Array, terrain_coord_set: Dictionary, family: String) -> void:
	for entry_variant in backend_entries:
		if not (entry_variant is Dictionary):
			continue
		var entry: Dictionary = entry_variant as Dictionary
		var tile_x: int = int(entry.get("x", 0))
		var tile_y: int = int(entry.get("y", 0))
		var overlay_meta: Dictionary = _resolve_terrain_edge_overlay_meta(tile_x, tile_y, terrain_coord_set, family)
		_terrain_edge_overlay_entries.append(
			{
				"tmxX": int(entry.get("tmxX", -1)),
				"tmxY": int(entry.get("tmxY", -1)),
				"overlayFrame": str(overlay_meta.get("frame", "")),
				"alpha": float(overlay_meta.get("alpha", 0.35)),
				"rotation": float(overlay_meta.get("rotation", 0.0)),
				"overlayHeight": float(overlay_meta.get("height", terrain_edge_overlay_base_height)),
			}
		)


func _resolve_terrain_edge_overlay_meta(tile_x: int, tile_y: int, terrain_coord_set: Dictionary, family: String) -> Dictionary:
	if terrain_edge_bitmask_enabled:
		return _resolve_terrain_edge_overlay_meta_bitmask(tile_x, tile_y, terrain_coord_set, family)

	var cardinal_mask: int = _compute_terrain_cardinal_mask(tile_x, tile_y, terrain_coord_set)
	var diagonal_mask: int = _compute_terrain_diagonal_mask(tile_x, tile_y, terrain_coord_set)
	var cardinal_count: int = _mask_bit_count(cardinal_mask)
	var diagonal_count: int = _mask_bit_count(diagonal_mask)
	var variant_code: String = _pick_edge_variant_code(EDGE_VARIANTS_SINGLE, tile_x, tile_y, diagonal_count)
	var frame_name: String = _resolve_terrain_edge_frame_name(family, variant_code, cardinal_count, diagonal_count, tile_x, tile_y)
	var alpha_min: float = min(clampf(terrain_edge_alpha_min, 0.0, 1.0), clampf(terrain_edge_alpha_max, 0.0, 1.0))
	var alpha_max: float = max(clampf(terrain_edge_alpha_min, 0.0, 1.0), clampf(terrain_edge_alpha_max, 0.0, 1.0))
	return {
		"frame": frame_name,
		"alpha": lerpf(alpha_min, alpha_max, clampf(float(cardinal_count) * 0.2, 0.0, 1.0)),
		"rotation": 0.0,
		"height": terrain_edge_overlay_base_height,
	}


func _resolve_terrain_edge_overlay_meta_bitmask(
	tile_x: int,
	tile_y: int,
	terrain_coord_set: Dictionary,
	family: String
) -> Dictionary:
	var cardinal_mask: int = _compute_terrain_cardinal_mask(tile_x, tile_y, terrain_coord_set)
	var diagonal_mask: int = _compute_terrain_diagonal_mask(tile_x, tile_y, terrain_coord_set)
	var cardinal_count: int = _mask_bit_count(cardinal_mask)
	var diagonal_count: int = _mask_bit_count(diagonal_mask)
	var rotation: float = 0.0
	var alpha_weight: float = 0.18
	var variants: Array = EDGE_VARIANTS_ISOLATED

	if cardinal_count <= 0:
		variants = EDGE_VARIANTS_ISOLATED
		alpha_weight = 0.16 + 0.04 * float(mini(3, diagonal_count))
	elif cardinal_count == 1:
		variants = EDGE_VARIANTS_SINGLE
		rotation = _rotation_for_single_mountain_link(cardinal_mask)
		alpha_weight = 0.32 + 0.05 * float(mini(2, diagonal_count))
	elif cardinal_count == 2:
		if cardinal_mask == (MOUNTAIN_MASK_N | MOUNTAIN_MASK_S):
			variants = EDGE_VARIANTS_STRAIGHT
			rotation = 0.0
			alpha_weight = 0.54
		elif cardinal_mask == (MOUNTAIN_MASK_E | MOUNTAIN_MASK_W):
			variants = EDGE_VARIANTS_STRAIGHT
			rotation = PI * 0.5
			alpha_weight = 0.54
		else:
			variants = EDGE_VARIANTS_CORNER
			rotation = _rotation_for_corner_mountain_link(cardinal_mask)
			alpha_weight = 0.62
			if not _corner_has_diagonal_support(cardinal_mask, diagonal_mask):
				alpha_weight -= 0.16
	elif cardinal_count == 3:
		variants = EDGE_VARIANTS_TEE
		rotation = _rotation_for_tee_mountain_link(cardinal_mask)
		alpha_weight = 0.76
	else:
		variants = EDGE_VARIANTS_FULL
		rotation = 0.0
		alpha_weight = 0.90

	var variant_code: String = _pick_edge_variant_code(variants, tile_x, tile_y, diagonal_count)
	var frame_name: String = _resolve_terrain_edge_frame_name(family, variant_code, cardinal_count, diagonal_count, tile_x, tile_y)
	var alpha_min: float = min(clampf(terrain_edge_alpha_min, 0.0, 1.0), clampf(terrain_edge_alpha_max, 0.0, 1.0))
	var alpha_max: float = max(clampf(terrain_edge_alpha_min, 0.0, 1.0), clampf(terrain_edge_alpha_max, 0.0, 1.0))
	var alpha: float = lerpf(alpha_min, alpha_max, clampf(alpha_weight, 0.0, 1.0))
	var overlay_height: float = terrain_edge_overlay_base_height * lerpf(0.84, 1.08, clampf(alpha_weight, 0.0, 1.0))
	if not terrain_edge_rotation_enabled:
		rotation = 0.0
	return {
		"frame": frame_name,
		"alpha": alpha,
		"rotation": rotation,
		"height": overlay_height,
	}


func _compute_terrain_cardinal_mask(tile_x: int, tile_y: int, terrain_coord_set: Dictionary) -> int:
	var mask: int = 0
	if _terrain_set_has(terrain_coord_set, tile_x, tile_y - 1):
		mask |= MOUNTAIN_MASK_N
	if _terrain_set_has(terrain_coord_set, tile_x + 1, tile_y):
		mask |= MOUNTAIN_MASK_E
	if _terrain_set_has(terrain_coord_set, tile_x, tile_y + 1):
		mask |= MOUNTAIN_MASK_S
	if _terrain_set_has(terrain_coord_set, tile_x - 1, tile_y):
		mask |= MOUNTAIN_MASK_W
	return mask


func _compute_terrain_diagonal_mask(tile_x: int, tile_y: int, terrain_coord_set: Dictionary) -> int:
	var mask: int = 0
	if _terrain_set_has(terrain_coord_set, tile_x + 1, tile_y - 1):
		mask |= MOUNTAIN_MASK_NE
	if _terrain_set_has(terrain_coord_set, tile_x + 1, tile_y + 1):
		mask |= MOUNTAIN_MASK_SE
	if _terrain_set_has(terrain_coord_set, tile_x - 1, tile_y + 1):
		mask |= MOUNTAIN_MASK_SW
	if _terrain_set_has(terrain_coord_set, tile_x - 1, tile_y - 1):
		mask |= MOUNTAIN_MASK_NW
	return mask


func _terrain_set_has(terrain_coord_set: Dictionary, tile_x: int, tile_y: int) -> bool:
	return terrain_coord_set.has(_coord_key(tile_x, tile_y))


func _pick_edge_variant_code(variants: Array, tile_x: int, tile_y: int, extra_seed: int = 0) -> String:
	if variants.is_empty():
		return "11"
	var hash_value: int = _edge_hash(tile_x, tile_y, extra_seed)
	var idx: int = posmod(hash_value, variants.size())
	return str(variants[idx])


func _resolve_terrain_edge_frame_name(
	family: String,
	variant_code: String,
	cardinal_count: int,
	diagonal_count: int,
	tile_x: int,
	tile_y: int
) -> String:
	var style_suffix: String = "3" if cardinal_count >= 3 or diagonal_count >= 2 else "1"
	if (cardinal_count == 2 and diagonal_count <= 1 and (posmod(_edge_hash(tile_x, tile_y, 3), 4) == 0)):
		style_suffix = "3" if style_suffix == "1" else "1"

	var primary: String = "%s_%s_%s.png" % [family, variant_code, style_suffix]
	if _overlay_texture_by_frame.has(primary):
		return primary
	var alt_style: String = "1" if style_suffix == "3" else "3"
	var fallback_style: String = "%s_%s_%s.png" % [family, variant_code, alt_style]
	if _overlay_texture_by_frame.has(fallback_style):
		return fallback_style
	var hard_fallback: String = "%s_11_1.png" % family
	if _overlay_texture_by_frame.has(hard_fallback):
		return hard_fallback
	return primary


func _edge_hash(tile_x: int, tile_y: int, extra_seed: int = 0) -> int:
	var value: int = int(tile_x * 73856093) ^ int(tile_y * 19349663) ^ int(extra_seed * 83492791)
	return absi(value)


func _rebuild_mountain_overlay_entries(mountain_backend_entries: Array) -> void:
	_mountain_overlay_entries = []
	if not mountain_overlay_enabled:
		return
	for entry_variant in mountain_backend_entries:
		if not (entry_variant is Dictionary):
			continue
		var entry: Dictionary = entry_variant as Dictionary
		var tile_x: int = int(entry.get("x", 0))
		var tile_y: int = int(entry.get("y", 0))
		var overlay_meta: Dictionary = _resolve_mountain_overlay_meta(tile_x, tile_y)
		if bool(overlay_meta.get("skip", false)):
			continue
		_mountain_overlay_entries.append(
			{
				"tmxX": int(entry.get("tmxX", -1)),
				"tmxY": int(entry.get("tmxY", -1)),
				"overlayFrame": str(overlay_meta.get("frame", "hill1.png")),
				"alpha": float(overlay_meta.get("alpha", 0.32)),
				"rotation": float(overlay_meta.get("rotation", 0.0)),
				"overlayHeight": float(overlay_meta.get("height", mountain_overlay_base_height)),
			}
		)


func _is_mountain_backend_tile(tile_x: int, tile_y: int) -> bool:
	return _mountain_coord_set.has(_coord_key(tile_x, tile_y))


func _count_mountain_cardinal_neighbors(tile_x: int, tile_y: int) -> int:
	var count: int = 0
	if _is_mountain_backend_tile(tile_x, tile_y - 1):
		count += 1
	if _is_mountain_backend_tile(tile_x + 1, tile_y):
		count += 1
	if _is_mountain_backend_tile(tile_x, tile_y + 1):
		count += 1
	if _is_mountain_backend_tile(tile_x - 1, tile_y):
		count += 1
	return count


func _count_mountain_diagonal_neighbors(tile_x: int, tile_y: int) -> int:
	var count: int = 0
	if _is_mountain_backend_tile(tile_x + 1, tile_y - 1):
		count += 1
	if _is_mountain_backend_tile(tile_x + 1, tile_y + 1):
		count += 1
	if _is_mountain_backend_tile(tile_x - 1, tile_y + 1):
		count += 1
	if _is_mountain_backend_tile(tile_x - 1, tile_y - 1):
		count += 1
	return count


func _resolve_mountain_overlay_meta(tile_x: int, tile_y: int) -> Dictionary:
	if mountain_bitmask_enabled:
		return _resolve_mountain_overlay_meta_bitmask(tile_x, tile_y)
	return {
		"frame": _resolve_mountain_overlay_frame(tile_x, tile_y),
		"alpha": _resolve_mountain_overlay_alpha(tile_x, tile_y),
		"rotation": 0.0,
		"height": mountain_overlay_base_height,
	}


func _resolve_mountain_overlay_meta_bitmask(tile_x: int, tile_y: int) -> Dictionary:
	var cardinal_mask: int = _compute_mountain_cardinal_mask(tile_x, tile_y)
	var diagonal_mask: int = _compute_mountain_diagonal_mask(tile_x, tile_y)
	var cardinal_count: int = _mask_bit_count(cardinal_mask)
	var diagonal_count: int = _mask_bit_count(diagonal_mask)
	var frame_name: String = "hill1.png"
	var rotation: float = 0.0
	var alpha_weight: float = 0.15

	if cardinal_count <= 0:
		frame_name = "hill1.png"
		alpha_weight = 0.12 + 0.05 * float(mini(3, diagonal_count))
	elif cardinal_count == 1:
		frame_name = "hill2.png"
		rotation = _rotation_for_single_mountain_link(cardinal_mask)
		alpha_weight = 0.32 + 0.04 * float(mini(2, diagonal_count))
	elif cardinal_count == 2:
		if cardinal_mask == (MOUNTAIN_MASK_N | MOUNTAIN_MASK_S):
			frame_name = "hill3.png"
			rotation = 0.0
			alpha_weight = 0.56
		elif cardinal_mask == (MOUNTAIN_MASK_E | MOUNTAIN_MASK_W):
			frame_name = "hill3.png"
			rotation = PI * 0.5
			alpha_weight = 0.56
		else:
			frame_name = "hill4.png"
			rotation = _rotation_for_corner_mountain_link(cardinal_mask)
			alpha_weight = 0.66
			if not _corner_has_diagonal_support(cardinal_mask, diagonal_mask):
				alpha_weight -= 0.14
	elif cardinal_count == 3:
		frame_name = "hill5.png"
		rotation = _rotation_for_tee_mountain_link(cardinal_mask)
		alpha_weight = 0.82
	else:
		frame_name = "hill5.png"
		rotation = 0.0
		alpha_weight = 1.0

	var ridge_score: float = _compute_mountain_ridge_score(cardinal_mask, diagonal_mask, cardinal_count, diagonal_count)
	if mountain_ridge_bias_enabled:
		alpha_weight += ridge_score * clampf(mountain_ridge_bias_strength, 0.0, 0.40)

	var clamped_weight: float = clampf(alpha_weight, 0.0, 1.0)
	if mountain_edge_denoise_enabled and _should_skip_mountain_overlay(cardinal_count, diagonal_count, clamped_weight):
		return {
			"skip": true,
			"frame": frame_name,
			"alpha": 0.0,
			"rotation": rotation,
			"height": mountain_overlay_base_height,
		}

	var alpha_min: float = min(clampf(mountain_overlay_alpha_min, 0.0, 1.0), clampf(mountain_overlay_alpha_max, 0.0, 1.0))
	var alpha_max: float = max(clampf(mountain_overlay_alpha_min, 0.0, 1.0), clampf(mountain_overlay_alpha_max, 0.0, 1.0))
	var alpha: float = lerpf(alpha_min, alpha_max, clamped_weight)
	var height_scale: float = lerpf(0.80, 1.10, clamped_weight)
	var overlay_height: float = mountain_overlay_base_height * height_scale
	if not mountain_rotation_enabled:
		rotation = 0.0
	return {
		"skip": false,
		"frame": frame_name,
		"alpha": alpha,
		"rotation": rotation,
		"height": overlay_height,
	}


func _compute_mountain_cardinal_mask(tile_x: int, tile_y: int) -> int:
	var mask: int = 0
	if _is_mountain_backend_tile(tile_x, tile_y - 1):
		mask |= MOUNTAIN_MASK_N
	if _is_mountain_backend_tile(tile_x + 1, tile_y):
		mask |= MOUNTAIN_MASK_E
	if _is_mountain_backend_tile(tile_x, tile_y + 1):
		mask |= MOUNTAIN_MASK_S
	if _is_mountain_backend_tile(tile_x - 1, tile_y):
		mask |= MOUNTAIN_MASK_W
	return mask


func _compute_mountain_diagonal_mask(tile_x: int, tile_y: int) -> int:
	var mask: int = 0
	if _is_mountain_backend_tile(tile_x + 1, tile_y - 1):
		mask |= MOUNTAIN_MASK_NE
	if _is_mountain_backend_tile(tile_x + 1, tile_y + 1):
		mask |= MOUNTAIN_MASK_SE
	if _is_mountain_backend_tile(tile_x - 1, tile_y + 1):
		mask |= MOUNTAIN_MASK_SW
	if _is_mountain_backend_tile(tile_x - 1, tile_y - 1):
		mask |= MOUNTAIN_MASK_NW
	return mask


func _mask_bit_count(mask: int) -> int:
	var count: int = 0
	var value: int = mask
	while value != 0:
		count += value & 1
		value >>= 1
	return count


func _rotation_for_single_mountain_link(cardinal_mask: int) -> float:
	if cardinal_mask == MOUNTAIN_MASK_N:
		return 0.0
	if cardinal_mask == MOUNTAIN_MASK_E:
		return PI * 0.5
	if cardinal_mask == MOUNTAIN_MASK_S:
		return PI
	if cardinal_mask == MOUNTAIN_MASK_W:
		return PI * 1.5
	return 0.0


func _rotation_for_corner_mountain_link(cardinal_mask: int) -> float:
	if cardinal_mask == (MOUNTAIN_MASK_N | MOUNTAIN_MASK_E):
		return 0.0
	if cardinal_mask == (MOUNTAIN_MASK_E | MOUNTAIN_MASK_S):
		return PI * 0.5
	if cardinal_mask == (MOUNTAIN_MASK_S | MOUNTAIN_MASK_W):
		return PI
	if cardinal_mask == (MOUNTAIN_MASK_W | MOUNTAIN_MASK_N):
		return PI * 1.5
	return 0.0


func _rotation_for_tee_mountain_link(cardinal_mask: int) -> float:
	if (cardinal_mask & MOUNTAIN_MASK_S) == 0:
		return 0.0
	if (cardinal_mask & MOUNTAIN_MASK_W) == 0:
		return PI * 0.5
	if (cardinal_mask & MOUNTAIN_MASK_N) == 0:
		return PI
	if (cardinal_mask & MOUNTAIN_MASK_E) == 0:
		return PI * 1.5
	return 0.0


func _corner_has_diagonal_support(cardinal_mask: int, diagonal_mask: int) -> bool:
	if cardinal_mask == (MOUNTAIN_MASK_N | MOUNTAIN_MASK_E):
		return (diagonal_mask & MOUNTAIN_MASK_NE) != 0
	if cardinal_mask == (MOUNTAIN_MASK_E | MOUNTAIN_MASK_S):
		return (diagonal_mask & MOUNTAIN_MASK_SE) != 0
	if cardinal_mask == (MOUNTAIN_MASK_S | MOUNTAIN_MASK_W):
		return (diagonal_mask & MOUNTAIN_MASK_SW) != 0
	if cardinal_mask == (MOUNTAIN_MASK_W | MOUNTAIN_MASK_N):
		return (diagonal_mask & MOUNTAIN_MASK_NW) != 0
	return true


func _compute_mountain_ridge_score(cardinal_mask: int, diagonal_mask: int, cardinal_count: int, diagonal_count: int) -> float:
	if cardinal_count <= 0:
		return 0.05 * float(mini(2, diagonal_count))
	if cardinal_count == 1:
		return 0.24 + 0.04 * float(mini(2, diagonal_count))
	if cardinal_count == 2:
		if cardinal_mask == (MOUNTAIN_MASK_N | MOUNTAIN_MASK_S):
			var ns_support: int = 0
			if (diagonal_mask & MOUNTAIN_MASK_NE) != 0:
				ns_support += 1
			if (diagonal_mask & MOUNTAIN_MASK_NW) != 0:
				ns_support += 1
			if (diagonal_mask & MOUNTAIN_MASK_SE) != 0:
				ns_support += 1
			if (diagonal_mask & MOUNTAIN_MASK_SW) != 0:
				ns_support += 1
			return 0.60 + 0.08 * float(ns_support)
		if cardinal_mask == (MOUNTAIN_MASK_E | MOUNTAIN_MASK_W):
			var ew_support: int = 0
			if (diagonal_mask & MOUNTAIN_MASK_NE) != 0:
				ew_support += 1
			if (diagonal_mask & MOUNTAIN_MASK_SE) != 0:
				ew_support += 1
			if (diagonal_mask & MOUNTAIN_MASK_NW) != 0:
				ew_support += 1
			if (diagonal_mask & MOUNTAIN_MASK_SW) != 0:
				ew_support += 1
			return 0.60 + 0.08 * float(ew_support)
		var corner_support: float = 0.55 if _corner_has_diagonal_support(cardinal_mask, diagonal_mask) else 0.30
		return corner_support + 0.04 * float(mini(2, diagonal_count))
	if cardinal_count == 3:
		return 0.74 + 0.05 * float(mini(2, diagonal_count))
	return 0.92


func _should_skip_mountain_overlay(cardinal_count: int, diagonal_count: int, clamped_weight: float) -> bool:
	var threshold: float = clampf(mountain_edge_noise_alpha_threshold, 0.0, 1.0)
	if cardinal_count == 0 and diagonal_count <= 1:
		return true
	if cardinal_count <= 1 and clamped_weight < threshold:
		return true
	return false


func _resolve_mountain_overlay_frame(tile_x: int, tile_y: int) -> String:
	var cardinal_count: int = _count_mountain_cardinal_neighbors(tile_x, tile_y)
	var diagonal_count: int = _count_mountain_diagonal_neighbors(tile_x, tile_y)
	if cardinal_count >= 4:
		return "hill5.png"
	if cardinal_count == 3:
		return "hill4.png"
	if cardinal_count == 2:
		if diagonal_count >= 2:
			return "hill4.png"
		return "hill3.png"
	if cardinal_count == 1:
		return "hill2.png"
	if diagonal_count >= 3:
		return "hill3.png"
	return "hill1.png"


func _resolve_mountain_overlay_alpha(tile_x: int, tile_y: int) -> float:
	var cardinal_count: int = _count_mountain_cardinal_neighbors(tile_x, tile_y)
	match cardinal_count:
		4:
			return 0.52
		3:
			return 0.48
		2:
			return 0.43
		1:
			return 0.36
		_:
			if _count_mountain_diagonal_neighbors(tile_x, tile_y) >= 2:
				return 0.34
			return 0.28


func _resolve_resource_overlay_frame(resource_kind: String, resource_level: int) -> String:
	var normalized_kind: String = resource_kind.strip_edges().to_lower()
	var level: int = maxi(1, resource_level)
	if normalized_kind == "fortress" or normalized_kind == "sys_fortress":
		return "sys_fortress.png"
	if normalized_kind == "":
		var ground_index: int = clampi(level, 1, 9)
		return "world_resource_grain_l%02d_v1.png" % ground_index

	var world_resource_level_index: int = clampi(level, 1, 9)
	match normalized_kind:
		"food", "grain":
			return "world_resource_grain_l%02d_v1.png" % world_resource_level_index
		"wood":
			return "world_resource_wood_l%02d_v1.png" % world_resource_level_index
		"stone":
			return "world_resource_stone_l%02d_v1.png" % world_resource_level_index
		"iron":
			return "world_resource_iron_l%02d_v1.png" % world_resource_level_index

	return "world_resource_stone_l%02d_v1.png" % world_resource_level_index


func _load_world_resource_asset_manifest() -> void:
	_world_resource_frame_meta_by_frame = {}
	if not FileAccess.file_exists(THEME_WORLD_RESOURCE_ASSET_MANIFEST_PATH):
		push_warning("[map-grid-theme] world resource asset manifest missing: %s" % THEME_WORLD_RESOURCE_ASSET_MANIFEST_PATH)
		return

	var file := FileAccess.open(THEME_WORLD_RESOURCE_ASSET_MANIFEST_PATH, FileAccess.READ)
	if file == null:
		push_warning("[map-grid-theme] world resource asset manifest open failed: %s" % THEME_WORLD_RESOURCE_ASSET_MANIFEST_PATH)
		return

	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if not (parsed is Dictionary):
		push_warning("[map-grid-theme] world resource asset manifest parse failed")
		return

	var manifest: Dictionary = parsed as Dictionary
	var effective_footprint: Vector2 = _vector2_from_json_array(
		manifest.get("effective_footprint", []),
		WORLD_RESOURCE_DEFAULT_EFFECTIVE_FOOTPRINT
	)
	var fit_footprint: Vector2 = _vector2_from_json_array(
		manifest.get("fit_footprint", []),
		WORLD_RESOURCE_DEFAULT_FIT_FOOTPRINT
	)
	var projection_variant: Variant = manifest.get("projection", {})
	var projection: Dictionary = {}
	if projection_variant is Dictionary:
		projection = projection_variant as Dictionary
	var source_anchor: Vector2 = _vector2_from_json_array(
		projection.get("anchor_pixel", []),
		WORLD_RESOURCE_DEFAULT_SOURCE_ANCHOR
	)
	var resources_variant: Variant = manifest.get("resources", {})
	if not (resources_variant is Dictionary):
		push_warning("[map-grid-theme] world resource asset manifest missing resources")
		return

	var loaded_count: int = 0
	var resources: Dictionary = resources_variant as Dictionary
	for kind_variant in resources.keys():
		var entries_variant: Variant = resources.get(kind_variant, {})
		if not (entries_variant is Dictionary):
			continue
		var entries: Dictionary = entries_variant as Dictionary
		for entry_key_variant in entries.keys():
			var filename: String = str(entries.get(entry_key_variant, "")).strip_edges()
			if filename == "" or not filename.ends_with(".png"):
				continue
			var texture_path: String = "%s/resources/%s" % [THEME_WORLD_ROOT, filename]
			var texture: Texture2D = _load_texture_with_fallback(texture_path)
			if texture == null:
				continue
			_overlay_texture_by_frame[filename] = texture
			_world_resource_frame_meta_by_frame[filename] = {
				"effectiveFootprint": effective_footprint,
				"fitFootprint": fit_footprint,
				"sourceAnchor": source_anchor,
			}
			loaded_count += 1

	print("[map-grid-theme] world resource assets loaded=%d" % loaded_count)


func _load_world_cell_asset_manifest() -> void:
	_world_cell_frame_meta_by_frame = {}
	_world_cell_composite_by_id = {}
	if not FileAccess.file_exists(THEME_WORLD_CELL_ASSET_MANIFEST_PATH):
		push_warning("[map-grid-theme] world cell asset manifest missing: %s" % THEME_WORLD_CELL_ASSET_MANIFEST_PATH)
		return

	var file := FileAccess.open(THEME_WORLD_CELL_ASSET_MANIFEST_PATH, FileAccess.READ)
	if file == null:
		push_warning("[map-grid-theme] world cell asset manifest open failed: %s" % THEME_WORLD_CELL_ASSET_MANIFEST_PATH)
		return

	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if not (parsed is Dictionary):
		push_warning("[map-grid-theme] world cell asset manifest parse failed")
		return

	var manifest: Dictionary = parsed as Dictionary
	var defaults_variant: Variant = manifest.get("defaults", {})
	var defaults: Dictionary = {}
	if defaults_variant is Dictionary:
		defaults = defaults_variant as Dictionary
	var default_fit_footprint: Vector2 = _vector2_from_json_array(
		defaults.get("fit_footprint", []),
		WORLD_CELL_DEFAULT_FIT_FOOTPRINT
	)
	var default_source_anchor: Vector2 = _vector2_from_json_array(
		defaults.get("source_anchor", []),
		WORLD_CELL_DEFAULT_SOURCE_ANCHOR
	)

	var frames_variant: Variant = manifest.get("frames", {})
	if not (frames_variant is Dictionary):
		push_warning("[map-grid-theme] world cell asset manifest missing frames")
		return

	var loaded_count: int = 0
	var frames: Dictionary = frames_variant as Dictionary
	for frame_key_variant in frames.keys():
		var frame_meta_variant: Variant = frames.get(frame_key_variant, {})
		if not (frame_meta_variant is Dictionary):
			continue
		var frame_meta: Dictionary = frame_meta_variant as Dictionary
		var filename: String = str(frame_meta.get("file", str(frame_key_variant))).strip_edges()
		if filename == "" or not filename.ends_with(".png"):
			continue
		var texture_path: String = "%s/%s" % [THEME_WORLD_ROOT, filename]
		var texture: Texture2D = _load_texture_with_fallback(texture_path)
		if texture == null:
			continue
		_overlay_texture_by_frame[filename] = texture
		_world_cell_frame_meta_by_frame[filename] = {
			"fitFootprint": _vector2_from_json_array(frame_meta.get("fit_footprint", []), default_fit_footprint),
			"sourceAnchor": _vector2_from_json_array(frame_meta.get("source_anchor", []), default_source_anchor),
			"visualFitScale": float(frame_meta.get("visual_fit_scale", 1.0)),
			"anchorRule": str(frame_meta.get("anchor_rule", defaults.get("anchor_rule", "bottom_center"))).strip_edges(),
			"drawLayer": str(frame_meta.get("draw_layer", "")).strip_edges(),
		}
		loaded_count += 1

	var composites_variant: Variant = manifest.get("composites", {})
	if composites_variant is Dictionary:
		var composites: Dictionary = composites_variant as Dictionary
		for composite_id_variant in composites.keys():
			var composite_variant: Variant = composites.get(composite_id_variant, {})
			if composite_variant is Dictionary:
				_world_cell_composite_by_id[str(composite_id_variant)] = composite_variant

	print("[map-grid-theme] world cell assets loaded=%d composites=%d" % [loaded_count, _world_cell_composite_by_id.size()])


func _load_world_cell_footprint_manifest() -> void:
	_world_cell_footprint_rule_by_id = {}
	if not FileAccess.file_exists(THEME_WORLD_CELL_FOOTPRINT_MANIFEST_PATH):
		_install_default_world_cell_footprint_rules()
		push_warning("[map-grid-theme] world cell footprint manifest missing: %s" % THEME_WORLD_CELL_FOOTPRINT_MANIFEST_PATH)
		return

	var file := FileAccess.open(THEME_WORLD_CELL_FOOTPRINT_MANIFEST_PATH, FileAccess.READ)
	if file == null:
		_install_default_world_cell_footprint_rules()
		push_warning("[map-grid-theme] world cell footprint manifest open failed: %s" % THEME_WORLD_CELL_FOOTPRINT_MANIFEST_PATH)
		return

	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if not (parsed is Dictionary):
		_install_default_world_cell_footprint_rules()
		push_warning("[map-grid-theme] world cell footprint manifest parse failed")
		return

	var manifest: Dictionary = parsed as Dictionary
	var footprints_variant: Variant = manifest.get("footprints", {})
	if footprints_variant is Dictionary:
		var footprints: Dictionary = footprints_variant as Dictionary
		for footprint_id_variant in footprints.keys():
			var rule_variant: Variant = footprints.get(footprint_id_variant, {})
			if rule_variant is Dictionary:
				var footprint_id: String = str(footprint_id_variant).strip_edges()
				if footprint_id != "":
					_world_cell_footprint_rule_by_id[footprint_id] = rule_variant

	if _world_cell_footprint_rule_by_id.is_empty():
		_install_default_world_cell_footprint_rules()

	print("[map-grid-theme] world cell footprints loaded=%d" % _world_cell_footprint_rule_by_id.size())


func _install_default_world_cell_footprint_rules() -> void:
	_world_cell_footprint_rule_by_id = {
		WORLD_CELL_FOOTPRINT_RESOURCE_1X1: {
			"id": WORLD_CELL_FOOTPRINT_RESOURCE_1X1,
			"role": "resource",
			"footprint_tiles": [1, 1],
			"cell_offsets": [[0, 0]],
			"draw_layer": "resource_cell",
		},
		WORLD_CELL_FOOTPRINT_PLAYER_CITY_3X3_INITIAL: {
			"id": WORLD_CELL_FOOTPRINT_PLAYER_CITY_3X3_INITIAL,
			"role": "player_city",
			"footprint_tiles": [3, 3],
			"cell_offsets": [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]],
			"draw_layer": "world_node",
			"render_mode": "layered_city",
			"base_frame": "world_cell_city_ground_base_v1.png",
			"base_alpha": 0.96,
			"base_scale": 1.0,
			"default_composite_id": "world_node_city_v1",
		},
		WORLD_CELL_FOOTPRINT_AI_CITY_3X3_INITIAL: {
			"id": WORLD_CELL_FOOTPRINT_AI_CITY_3X3_INITIAL,
			"role": "ai_city",
			"footprint_tiles": [3, 3],
			"cell_offsets": [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]],
			"draw_layer": "world_node",
			"render_mode": "layered_city",
			"base_frame": "world_cell_city_ground_base_v1.png",
			"base_alpha": 0.98,
			"base_scale": 1.0,
			"default_composite_id": "world_node_capital_v1",
		},
		WORLD_CELL_FOOTPRINT_SYSTEM_CITY_L03_L04_3X3: {
			"id": WORLD_CELL_FOOTPRINT_SYSTEM_CITY_L03_L04_3X3,
			"role": "system_city",
			"footprint_tiles": [3, 3],
			"cell_offsets": [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]],
			"draw_layer": "world_node",
			"render_mode": "layered_city",
			"base_frame": "world_cell_city_ground_base_v1.png",
			"base_alpha": 0.97,
			"base_scale": 1.0,
			"default_composite_id": "world_node_city_v1",
		},
		WORLD_CELL_FOOTPRINT_PASS_1X1: {
			"id": WORLD_CELL_FOOTPRINT_PASS_1X1,
			"role": "pass",
			"footprint_tiles": [1, 1],
			"cell_offsets": [[0, 0]],
			"draw_layer": "world_node",
			"render_mode": "payload_node",
			"base_frame": "world_cell_node_ground_base_v1.png",
			"base_alpha": 1.0,
			"base_scale": 1.0,
			"default_composite_id": "world_node_pass_sw_v1",
			"placement_policy": {
				"reserve_cells": true,
				"block_resource_generation": true,
				"block_resource_overlay": true,
				"block_resource_fill": true,
				"block_free_cell_base": true,
				"block_movement": false,
				"allow_selection_overlay_above": true,
				"allow_hover_overlay_above": true,
			},
		},
		WORLD_CELL_FOOTPRINT_FORT_1X1: {
			"id": WORLD_CELL_FOOTPRINT_FORT_1X1,
			"role": "fort",
			"footprint_tiles": [1, 1],
			"cell_offsets": [[0, 0]],
			"draw_layer": "world_node",
			"render_mode": "payload_node",
			"base_frame": "world_cell_node_ground_base_v1.png",
			"base_alpha": 1.0,
			"base_scale": 1.0,
			"default_composite_id": "world_node_fort_v1",
			"placement_policy": {
				"reserve_cells": true,
				"block_resource_generation": true,
				"block_resource_overlay": true,
				"block_resource_fill": true,
				"block_free_cell_base": true,
				"block_movement": false,
				"allow_selection_overlay_above": true,
				"allow_hover_overlay_above": true,
			},
		},
		WORLD_CELL_FOOTPRINT_DOCK_1X1: {
			"id": WORLD_CELL_FOOTPRINT_DOCK_1X1,
			"role": "dock",
			"footprint_tiles": [1, 1],
			"cell_offsets": [[0, 0]],
			"draw_layer": "world_node",
			"render_mode": "payload_node",
			"base_frame": "world_cell_node_ground_base_v1.png",
			"base_alpha": 1.0,
			"base_scale": 1.0,
			"default_composite_id": "world_node_dock_v1",
			"placement_policy": {
				"reserve_cells": true,
				"block_resource_generation": true,
				"block_resource_overlay": true,
				"block_resource_fill": true,
				"block_free_cell_base": true,
				"block_movement": false,
				"allow_selection_overlay_above": true,
				"allow_hover_overlay_above": true,
			},
		},
	}


func _get_world_cell_footprint_rule(footprint_id: String) -> Dictionary:
	var normalized_id: String = footprint_id.strip_edges()
	var rule_variant: Variant = _world_cell_footprint_rule_by_id.get(normalized_id, {})
	if rule_variant is Dictionary:
		return rule_variant as Dictionary
	return {}


func _resolve_world_cell_placement_policy(footprint_id: String) -> Dictionary:
	var rule: Dictionary = _get_world_cell_footprint_rule(footprint_id)
	var policy_variant: Variant = rule.get("placement_policy", {})
	if policy_variant is Dictionary:
		return policy_variant as Dictionary
	return {}


func _build_world_cell_placement_policy_audit(footprint_ids: Array) -> Dictionary:
	var audit := {}
	for footprint_variant in footprint_ids:
		var footprint_id: String = str(footprint_variant).strip_edges()
		if footprint_id == "":
			continue
		var rule: Dictionary = _get_world_cell_footprint_rule(footprint_id)
		var actions := {}
		for action_variant in WORLD_CELL_PLACEMENT_POLICY_ACTION_MAP.keys():
			var action: String = str(action_variant).strip_edges()
			actions[action] = _does_world_cell_placement_policy_apply(footprint_id, action)
		audit[footprint_id] = {
			"role": str(rule.get("role", "")).strip_edges(),
			"renderMode": str(rule.get("render_mode", "")).strip_edges(),
			"footprintTiles": rule.get("footprint_tiles", []),
			"placementPolicy": _resolve_world_cell_placement_policy(footprint_id).duplicate(true),
			"resolvedActions": actions,
		}
	return audit


func _resolve_world_cell_placement_policy_action_spec(action: String) -> Dictionary:
	var action_spec_variant: Variant = WORLD_CELL_PLACEMENT_POLICY_ACTION_MAP.get(action, {})
	if action_spec_variant is Dictionary:
		return action_spec_variant as Dictionary
	return {}


func _resolve_world_cell_placement_context_rule(context: String) -> Dictionary:
	var context_rule_variant: Variant = WORLD_CELL_PLACEMENT_CONTEXT_RULE_MAP.get(context.strip_edges().to_lower(), {})
	if context_rule_variant is Dictionary:
		return context_rule_variant as Dictionary
	return {}


func _does_world_cell_placement_policy_apply(footprint_id: String, action: String) -> bool:
	if footprint_id == "":
		return false
	var action_spec: Dictionary = _resolve_world_cell_placement_policy_action_spec(action)
	if action_spec.is_empty():
		return false
	var policy: Dictionary = _resolve_world_cell_placement_policy(footprint_id)
	var default_value: bool = bool(action_spec.get("default", false))
	if policy.is_empty():
		return default_value
	var policy_field: String = str(action_spec.get("field", "")).strip_edges()
	if policy_field != "" and policy.has(policy_field):
		return bool(policy.get(policy_field, default_value))
	var fallback_fields_variant: Variant = action_spec.get("fallback_fields", [])
	if fallback_fields_variant is Array:
		for fallback_field_variant in fallback_fields_variant as Array:
			var fallback_field: String = str(fallback_field_variant).strip_edges()
			if fallback_field != "" and policy.has(fallback_field):
				return bool(policy.get(fallback_field, default_value))
	return default_value


func _resolve_world_cell_placement_policy_source_footprint_id(tmx_key: String, source: String) -> String:
	match source:
		WORLD_CELL_PLACEMENT_POLICY_SOURCE_RESERVED_FOOTPRINT:
			return _resolve_reserved_world_cell_footprint_id(tmx_key)
		WORLD_CELL_PLACEMENT_POLICY_SOURCE_BACKEND_TILE:
			var backend_tile_variant: Variant = _backend_tile_by_tmx_key.get(tmx_key, {})
			if backend_tile_variant is Dictionary:
				return _resolve_world_cell_footprint_id_for_runtime_tile(backend_tile_variant as Dictionary)
	return ""


func _resolve_world_cell_placement_action_match_at_tmx_key(tmx_key: String, action: String) -> Dictionary:
	for source_variant in WORLD_CELL_PLACEMENT_POLICY_SOURCE_ORDER:
		var source: String = str(source_variant)
		var footprint_id: String = _resolve_world_cell_placement_policy_source_footprint_id(tmx_key, source)
		if _does_world_cell_placement_policy_apply(footprint_id, action):
			return {
				"tmxKey": tmx_key,
				"source": source,
				"footprintId": footprint_id,
				"action": action,
			}
	return {}


func _does_world_cell_placement_action_apply_at_tmx_key(tmx_key: String, action: String) -> bool:
	return not _resolve_world_cell_placement_action_match_at_tmx_key(tmx_key, action).is_empty()


func _does_world_cell_placement_context_apply_at_tmx_key(tmx_key: String, context: String) -> bool:
	return not _resolve_world_cell_placement_context_match_at_tmx_key(tmx_key, context).is_empty()


func _resolve_world_cell_placement_context_match_at_tmx_key(tmx_key: String, context: String, depth: int = 0, placement_context: Dictionary = {}) -> Dictionary:
	if depth > 4:
		return {}
	var context_rule: Dictionary = _resolve_world_cell_placement_context_rule(context)
	if context_rule.is_empty():
		return {}
	var action: String = str(context_rule.get("policy_action", "")).strip_edges()
	if action != "":
		var action_match: Dictionary = _resolve_world_cell_placement_action_match_at_tmx_key(tmx_key, action)
		if not action_match.is_empty():
			action_match["context"] = context
			action_match["reason"] = "policy_action"
			return action_match
	var block_rules_variant: Variant = context_rule.get("block_rules", [])
	if block_rules_variant is Array:
		for rule_variant in block_rules_variant as Array:
			if not (rule_variant is Dictionary):
				continue
			var rule_match: Dictionary = _resolve_world_cell_placement_context_block_rule_match(tmx_key, rule_variant as Dictionary, depth, placement_context)
			if not rule_match.is_empty():
				rule_match["context"] = context
				rule_match["reason"] = "block_rule"
				return rule_match
	return {}


func _does_world_cell_placement_context_block_rule_apply(tmx_key: String, rule: Dictionary) -> bool:
	return not _resolve_world_cell_placement_context_block_rule_match(tmx_key, rule).is_empty()


func _resolve_world_cell_placement_context_block_rule_match(tmx_key: String, rule: Dictionary, depth: int = 0, placement_context: Dictionary = {}) -> Dictionary:
	var rule_kind: String = str(rule.get("kind", "")).strip_edges().to_lower()
	match rule_kind:
		WORLD_CELL_PLACEMENT_BLOCK_RULE_RESERVED_FOOTPRINT:
			if _world_cell_reserved_footprint_tmx_keys.has(tmx_key):
				return {
					"tmxKey": tmx_key,
					"ruleKind": rule_kind,
					"footprintId": str(_world_cell_reserved_footprint_tmx_keys.get(tmx_key, "")).strip_edges(),
					"anchorKey": str(_world_cell_reserved_anchor_by_tmx_key.get(tmx_key, "")).strip_edges(),
				}
		WORLD_CELL_PLACEMENT_BLOCK_RULE_PREVIEW_TILE:
			if _world_cell_preview_tile_by_tmx_key.has(tmx_key):
				return {
					"tmxKey": tmx_key,
					"ruleKind": rule_kind,
				}
		WORLD_CELL_PLACEMENT_BLOCK_RULE_RESOURCE_OVERLAY:
			if _resource_overlay_by_tmx_key.has(tmx_key):
				return {
					"tmxKey": tmx_key,
					"ruleKind": rule_kind,
				}
		WORLD_CELL_PLACEMENT_BLOCK_RULE_BACKEND_TYPE:
			var backend_type_tile: Dictionary = _resolve_backend_tile_for_tmx_key(tmx_key)
			var backend_type: String = str(backend_type_tile.get("type", "")).strip_edges().to_lower()
			if _string_array_has(rule.get("values", []), backend_type):
				return {
					"tmxKey": tmx_key,
					"ruleKind": rule_kind,
					"value": backend_type,
					"values": rule.get("values", []),
				}
		WORLD_CELL_PLACEMENT_BLOCK_RULE_BACKEND_TERRAIN:
			var backend_terrain_tile: Dictionary = _resolve_backend_tile_for_tmx_key(tmx_key)
			var backend_terrain: String = str(backend_terrain_tile.get("terrain", "")).strip_edges().to_lower()
			if _string_array_has(rule.get("values", []), backend_terrain):
				var node_type: String = str(placement_context.get("nodeType", "")).strip_edges().to_lower()
				var allow_by_node_type_variant: Variant = rule.get("allow_by_node_type", {})
				if allow_by_node_type_variant is Dictionary:
					var allowed_terrains_variant: Variant = (allow_by_node_type_variant as Dictionary).get(node_type, [])
					if _string_array_has(allowed_terrains_variant, backend_terrain):
						return {}
				return {
					"tmxKey": tmx_key,
					"ruleKind": rule_kind,
					"value": backend_terrain,
					"values": rule.get("values", []),
					"nodeType": node_type,
				}
		WORLD_CELL_PLACEMENT_BLOCK_RULE_POLICY_CONTEXT:
			var nested_context: String = str(rule.get("context", "")).strip_edges()
			if nested_context == "":
				return {}
			var nested_match: Dictionary = _resolve_world_cell_placement_context_match_at_tmx_key(tmx_key, nested_context, depth + 1, placement_context)
			if not nested_match.is_empty():
				return {
					"tmxKey": tmx_key,
					"ruleKind": rule_kind,
					"nestedContext": nested_context,
					"nestedMatch": nested_match,
				}
	return {}


func _resolve_backend_tile_for_tmx_key(tmx_key: String) -> Dictionary:
	var backend_tile_variant: Variant = _backend_tile_by_tmx_key.get(tmx_key, {})
	if backend_tile_variant is Dictionary:
		return backend_tile_variant as Dictionary
	return {}


func _string_array_has(values_variant: Variant, target: String) -> bool:
	if not (values_variant is Array):
		return false
	var normalized_target: String = target.strip_edges().to_lower()
	for value_variant in values_variant as Array:
		if str(value_variant).strip_edges().to_lower() == normalized_target:
			return true
	return false


func _should_world_cell_block_empty_resource_fill(tmx_key: String) -> bool:
	return _does_world_cell_placement_context_apply_at_tmx_key(
		tmx_key,
		WORLD_CELL_PLACEMENT_CONTEXT_EMPTY_RESOURCE_FILL
	)


func _should_world_cell_block_free_cell_base(tmx_key: String) -> bool:
	return _does_world_cell_placement_context_apply_at_tmx_key(
		tmx_key,
		WORLD_CELL_PLACEMENT_CONTEXT_FREE_CELL_BASE
	)


func _should_world_cell_block_resource_overlay(tmx_key: String) -> bool:
	return _does_world_cell_placement_context_apply_at_tmx_key(
		tmx_key,
		WORLD_CELL_PLACEMENT_CONTEXT_RESOURCE_OVERLAY
	)


func _resolve_reserved_world_cell_footprint_id(tmx_key: String) -> String:
	return str(_world_cell_reserved_footprint_tmx_keys.get(tmx_key, "")).strip_edges()


func _resolve_world_cell_footprint_id_for_runtime_tile(tile_data: Dictionary) -> String:
	var explicit_footprint_id: String = str(tile_data.get("footprintId", "")).strip_edges()
	if explicit_footprint_id != "":
		return explicit_footprint_id
	var tile_type: String = str(tile_data.get("type", tile_data.get("tileType", ""))).strip_edges().to_lower()
	var strategy: String = _resolve_world_cell_runtime_strategy_for_type(tile_type)
	var strategy_footprint_id: String = _resolve_world_cell_strategy_footprint_id(strategy, tile_data, 1)
	if strategy_footprint_id != "":
		return strategy_footprint_id
	return _resolve_world_cell_node_dispatch_footprint_id(tile_type)


func _resolve_world_cell_footprint_tiles(footprint_id: String, fallback: Array) -> Array:
	var rule: Dictionary = _get_world_cell_footprint_rule(footprint_id)
	var tiles_variant: Variant = rule.get("footprint_tiles", fallback)
	if not (tiles_variant is Array):
		return fallback
	var tiles: Array = tiles_variant as Array
	if tiles.size() < 2:
		return fallback
	return [maxi(1, int(tiles[0])), maxi(1, int(tiles[1]))]


func _resolve_world_cell_footprint_offsets(footprint_id: String, fallback_tiles: Array) -> Array:
	var rule: Dictionary = _get_world_cell_footprint_rule(footprint_id)
	var offsets_variant: Variant = rule.get("cell_offsets", [])
	if offsets_variant is Array:
		var offsets: Array = offsets_variant as Array
		if not offsets.is_empty():
			return offsets
	return _build_centered_world_cell_footprint_offsets(_resolve_world_cell_footprint_tiles(footprint_id, fallback_tiles))


func _build_centered_world_cell_footprint_offsets(footprint_tiles: Array) -> Array:
	var width: int = 1
	var height: int = 1
	if footprint_tiles.size() >= 2:
		width = maxi(1, int(footprint_tiles[0]))
		height = maxi(1, int(footprint_tiles[1]))
	var half_x: int = int(floor(float(width) * 0.5))
	var half_y: int = int(floor(float(height) * 0.5))
	var offsets: Array = []
	for y in range(height):
		for x in range(width):
			offsets.append([x - half_x, y - half_y])
	return offsets


func _vector2i_from_json_array(value: Variant, fallback: Vector2i) -> Vector2i:
	if not (value is Array):
		return fallback
	var values: Array = value as Array
	if values.size() < 2:
		return fallback
	return Vector2i(int(values[0]), int(values[1]))


func _vector2_from_json_array(value: Variant, fallback: Vector2) -> Vector2:
	if not (value is Array):
		return fallback
	var values: Array = value as Array
	if values.size() < 2:
		return fallback
	return Vector2(float(values[0]), float(values[1]))


func _draw_world_resource_frame(frame_name: String, cell_center: Vector2, alpha: float = 1.0) -> bool:
	var normalized_name: String = frame_name.strip_edges()
	if normalized_name == "":
		return false
	var texture: Texture2D = _overlay_texture_by_frame.get(normalized_name, null) as Texture2D
	if texture == null:
		return false
	var raw_size: Vector2 = texture.get_size()
	if raw_size.y <= 0.0 or raw_size.x <= 0.0:
		return false

	var meta_variant: Variant = _world_resource_frame_meta_by_frame.get(normalized_name, {})
	var meta: Dictionary = {}
	if meta_variant is Dictionary:
		meta = meta_variant as Dictionary
	var effective_footprint: Vector2 = WORLD_RESOURCE_DEFAULT_EFFECTIVE_FOOTPRINT
	var effective_footprint_variant: Variant = meta.get("effectiveFootprint", effective_footprint)
	if effective_footprint_variant is Vector2:
		effective_footprint = effective_footprint_variant as Vector2
	var fit_footprint: Vector2 = WORLD_RESOURCE_DEFAULT_FIT_FOOTPRINT
	var fit_footprint_variant: Variant = meta.get("fitFootprint", fit_footprint)
	if fit_footprint_variant is Vector2:
		fit_footprint = fit_footprint_variant as Vector2
	var source_anchor: Vector2 = WORLD_RESOURCE_DEFAULT_SOURCE_ANCHOR
	var source_anchor_variant: Variant = meta.get("sourceAnchor", source_anchor)
	if source_anchor_variant is Vector2:
		source_anchor = source_anchor_variant as Vector2
	var visual_fit_scale: float = clampf(float(meta.get("visualFitScale", 1.0)), 0.05, 4.0)

	var tile_screen_width: float = max(1.0, _tmx_tile_width * _zoom)
	var tile_screen_height: float = max(1.0, _tmx_tile_height * _zoom)
	var scale: float = min(
		tile_screen_width / max(1.0, fit_footprint.x),
		tile_screen_height / max(1.0, fit_footprint.y)
	)
	scale = clampf(scale, 0.01, 8.0)
	var draw_size: Vector2 = raw_size * scale
	var destination_anchor: Vector2 = cell_center + Vector2(0.0, tile_screen_height * 0.5)
	var draw_rect := Rect2(destination_anchor - source_anchor * scale, draw_size)
	draw_texture_rect(texture, draw_rect, false, Color(1.0, 1.0, 1.0, clampf(alpha, 0.0, 1.0)))
	return true


func _draw_world_cell_composite(composite_id: String, cell_center: Vector2, alpha: float = 1.0) -> bool:
	var normalized_id: String = composite_id.strip_edges()
	if normalized_id == "":
		return false
	var composite_variant: Variant = _world_cell_composite_by_id.get(normalized_id, {})
	if not (composite_variant is Dictionary):
		return false
	var composite: Dictionary = composite_variant as Dictionary
	var layers_variant: Variant = composite.get("layers", [])
	if not (layers_variant is Array):
		return false

	var drawn: bool = false
	var layers: Array = layers_variant as Array
	for layer_variant in layers:
		if not (layer_variant is Dictionary):
			continue
		var layer: Dictionary = layer_variant as Dictionary
		var frame_name: String = str(layer.get("frame", "")).strip_edges()
		if frame_name == "":
			continue
		var layer_alpha: float = clampf(alpha * float(layer.get("alpha", 1.0)), 0.0, 1.0)
		var layer_scale: float = clampf(float(layer.get("scale", 1.0)), 0.05, 2.0)
		var layer_offset: Vector2 = _vector2_from_json_array(layer.get("offset", []), Vector2.ZERO) * _zoom
		if _draw_world_cell_frame(frame_name, cell_center + layer_offset, layer_alpha, layer_scale):
			drawn = true
	return drawn


func _draw_world_cell_layers(layers: Array, cell_center: Vector2, alpha: float = 1.0) -> bool:
	var drawn: bool = false
	for layer_variant in layers:
		if not (layer_variant is Dictionary):
			continue
		var layer: Dictionary = layer_variant as Dictionary
		var frame_name: String = str(layer.get("frame", "")).strip_edges()
		if frame_name == "":
			continue
		var layer_alpha: float = clampf(alpha * float(layer.get("alpha", 1.0)), 0.0, 1.0)
		var layer_scale: float = clampf(float(layer.get("scale", 1.0)), 0.05, 2.0)
		var layer_offset: Vector2 = _vector2_from_json_array(layer.get("offset", []), Vector2.ZERO) * _zoom
		if _draw_world_cell_frame(frame_name, cell_center + layer_offset, layer_alpha, layer_scale):
			drawn = true
	return drawn


func _draw_world_cell_payload_slots(payload_slots: Array, cell_center: Vector2, alpha: float = 1.0) -> bool:
	var drawn: bool = false
	for slot_variant in payload_slots:
		if not (slot_variant is Dictionary):
			continue
		var slot: Dictionary = slot_variant as Dictionary
		if not bool(slot.get("active", false)):
			continue
		var frame_name: String = str(slot.get("frame", "")).strip_edges()
		if frame_name == "":
			continue
		var cell_offset: Vector2i = _vector2i_from_json_array(slot.get("cell_offset", []), Vector2i.ZERO)
		var payload_offset: Vector2 = _resolve_world_cell_payload_cell_offset(cell_offset)
		payload_offset += _vector2_from_json_array(slot.get("offset", []), Vector2.ZERO) * _zoom
		var slot_alpha: float = clampf(alpha * float(slot.get("alpha", 1.0)), 0.0, 1.0)
		var slot_scale: float = clampf(float(slot.get("scale", 1.0)), 0.05, 2.0)
		if _draw_world_cell_frame(frame_name, cell_center + payload_offset, slot_alpha, slot_scale):
			drawn = true
	return drawn


func _resolve_world_cell_payload_cell_offset(cell_offset: Vector2i) -> Vector2:
	return Vector2(
		(float(cell_offset.x - cell_offset.y) * _tmx_tile_width * 0.5),
		(float(cell_offset.x + cell_offset.y) * _tmx_tile_height * 0.5)
	) * _zoom


func _draw_world_cell_frame(frame_name: String, cell_center: Vector2, alpha: float = 1.0, scale_multiplier: float = 1.0) -> bool:
	var normalized_name: String = frame_name.strip_edges()
	if normalized_name == "":
		return false
	var texture: Texture2D = _overlay_texture_by_frame.get(normalized_name, null) as Texture2D
	if texture == null:
		return false
	var raw_size: Vector2 = texture.get_size()
	if raw_size.y <= 0.0 or raw_size.x <= 0.0:
		return false

	var meta_variant: Variant = _world_cell_frame_meta_by_frame.get(normalized_name, {})
	var meta: Dictionary = {}
	if meta_variant is Dictionary:
		meta = meta_variant as Dictionary
	var fit_footprint: Vector2 = WORLD_CELL_DEFAULT_FIT_FOOTPRINT
	var fit_footprint_variant: Variant = meta.get("fitFootprint", fit_footprint)
	if fit_footprint_variant is Vector2:
		fit_footprint = fit_footprint_variant as Vector2
	var source_anchor: Vector2 = WORLD_CELL_DEFAULT_SOURCE_ANCHOR
	var source_anchor_variant: Variant = meta.get("sourceAnchor", source_anchor)
	if source_anchor_variant is Vector2:
		source_anchor = source_anchor_variant as Vector2
	var visual_fit_scale: float = clampf(float(meta.get("visualFitScale", 1.0)), 0.05, 4.0)

	var tile_screen_width: float = max(1.0, _tmx_tile_width * _zoom)
	var tile_screen_height: float = max(1.0, _tmx_tile_height * _zoom)
	var scale: float = min(
		tile_screen_width / max(1.0, fit_footprint.x),
		tile_screen_height / max(1.0, fit_footprint.y)
	)
	scale = clampf(scale * scale_multiplier * visual_fit_scale, 0.01, 8.0)
	var draw_size: Vector2 = raw_size * scale
	var destination_anchor: Vector2 = cell_center + Vector2(0.0, tile_screen_height * 0.5)
	var draw_rect := Rect2(destination_anchor - source_anchor * scale, draw_size)
	draw_texture_rect(texture, draw_rect, false, Color(1.0, 1.0, 1.0, clampf(alpha, 0.0, 1.0)))
	return true


func _resolve_home_city_flag_frame(faction_id: String, human_faction_id: String, city_level: int) -> String:
	return FactionVisualsScript.resolve_flag_frame(
		_overlay_texture_by_frame,
		faction_id,
		human_faction_id,
		city_level,
	)


func _load_overlay_manifest() -> void:
	_overlay_manifest = {}
	_overlay_texture_by_frame = {}
	if not FileAccess.file_exists(THEME_OVERLAY_MANIFEST_PATH):
		push_warning("[map-grid-theme] overlay manifest missing: %s" % THEME_OVERLAY_MANIFEST_PATH)
		return

	var manifest_file := FileAccess.open(THEME_OVERLAY_MANIFEST_PATH, FileAccess.READ)
	if manifest_file == null:
		push_warning("[map-grid-theme] overlay manifest open failed: err=%d" % FileAccess.get_open_error())
		return
	var parsed: Variant = JSON.parse_string(manifest_file.get_as_text())
	manifest_file.close()
	if not (parsed is Dictionary):
		push_warning("[map-grid-theme] overlay manifest parse failed: %s" % THEME_OVERLAY_MANIFEST_PATH)
		return
	_overlay_manifest = parsed as Dictionary
	var frame_table_variant: Variant = _overlay_manifest.get("frames", {})
	if not (frame_table_variant is Dictionary):
		push_warning("[map-grid-theme] overlay manifest missing frames dictionary")
		return

	var frame_table: Dictionary = frame_table_variant as Dictionary
	for frame_name_variant in frame_table.keys():
		var frame_name: String = str(frame_name_variant)
		var frame_meta_variant: Variant = frame_table.get(frame_name_variant, {})
		if not (frame_meta_variant is Dictionary):
			continue
		var frame_meta: Dictionary = frame_meta_variant as Dictionary
		var texture_path: String = str(frame_meta.get("texturePath", "")).strip_edges()
		if texture_path == "":
			continue
		var texture: Texture2D = _load_texture_with_fallback(texture_path)
		if texture != null:
			_overlay_texture_by_frame[frame_name] = texture

	print("[map-grid-theme] overlay frames loaded=%d" % _overlay_texture_by_frame.size())


func _draw_overlay_frame(frame_name: String, center: Vector2, target_height: float, alpha: float = 1.0, rotation: float = 0.0) -> bool:
	var normalized_name: String = frame_name.strip_edges()
	if normalized_name == "":
		return false
	var texture: Texture2D = _overlay_texture_by_frame.get(normalized_name, null) as Texture2D
	if texture == null:
		return false
	var raw_size: Vector2 = texture.get_size()
	if raw_size.y <= 0.0 or raw_size.x <= 0.0:
		return false
	var scale: float = clampf(target_height / raw_size.y, 0.01, 8.0)
	var draw_size: Vector2 = raw_size * scale
	var draw_rect := Rect2(center - draw_size * 0.5, draw_size)
	var clamped_alpha: float = clampf(alpha, 0.0, 1.0)
	if absf(rotation) <= 0.0001:
		draw_texture_rect(texture, draw_rect, false, Color(1.0, 1.0, 1.0, clamped_alpha))
		return true

	draw_set_transform(center, rotation, Vector2.ONE)
	draw_texture_rect(texture, Rect2(-draw_size * 0.5, draw_size), false, Color(1.0, 1.0, 1.0, clamped_alpha))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	return true


func _resolve_gid_tile_info(gid: int) -> Dictionary:
	for i in range(_tmx_tilesets.size() - 1, -1, -1):
		var tileset: Dictionary = _tmx_tilesets[i] as Dictionary
		var first_gid: int = int(tileset.get("firstGid", 0))
		if gid < first_gid:
			continue
		var local_id: int = gid - first_gid
		var columns: int = max(1, int(tileset.get("columns", 1)))
		var tile_w: float = float(tileset.get("tileWidth", _tmx_tile_width))
		var tile_h: float = float(tileset.get("tileHeight", _tmx_tile_height))
		var region_x: float = float(local_id % columns) * tile_w
		var region_y: float = float(local_id / columns) * tile_h
		return {
			"texture": tileset.get("texture", null),
			"region": Rect2(region_x, region_y, tile_w, tile_h),
			"tileWidth": tile_w,
			"tileHeight": tile_h,
		}
	return {}


func _load_theme_tmx() -> bool:
	_tmx_layers = []
	_tmx_tilesets = []
	var abs_path: String = ProjectSettings.globalize_path(THEME_MAP_TMX_PATH)
	if not FileAccess.file_exists(abs_path):
		push_warning("[map-grid-theme] missing TMX: %s" % abs_path)
		return false

	var parser := XMLParser.new()
	var open_err: Error = parser.open(abs_path)
	if open_err != OK:
		push_warning("[map-grid-theme] TMX open failed: %s (err=%d)" % [abs_path, int(open_err)])
		return false

	var tileset_refs: Array = []
	var current_layer: Dictionary = {}
	while true:
		var read_err: Error = parser.read()
		if read_err != OK:
			break
		if parser.get_node_type() != XMLParser.NODE_ELEMENT:
			continue
		var node_name: String = parser.get_node_name()
		if node_name == "map":
			_tmx_map_width = _xml_attr_int(parser, "width", 200)
			_tmx_map_height = _xml_attr_int(parser, "height", 200)
			_tmx_tile_width = float(_xml_attr_int(parser, "tilewidth", 200))
			_tmx_tile_height = float(_xml_attr_int(parser, "tileheight", 100))
		elif node_name == "tileset":
			tileset_refs.append(
				{
					"firstGid": _xml_attr_int(parser, "firstgid", 1),
					"source": _xml_attr(parser, "source", ""),
				}
			)
		elif node_name == "layer":
			current_layer = {
				"name": _xml_attr(parser, "name", "layer"),
				"width": _xml_attr_int(parser, "width", _tmx_map_width),
				"height": _xml_attr_int(parser, "height", _tmx_map_height),
			}
		elif node_name == "data" and not current_layer.is_empty():
			var encoding: String = _xml_attr(parser, "encoding", "")
			if encoding != "csv":
				continue
			var layer_total: int = int(current_layer.get("width", _tmx_map_width)) * int(current_layer.get("height", _tmx_map_height))
			var data_text: String = ""
			while true:
				var next_err: Error = parser.read()
				if next_err != OK:
					break
				if parser.get_node_type() == XMLParser.NODE_ELEMENT_END and parser.get_node_name() == "data":
					break
				if parser.get_node_type() == XMLParser.NODE_TEXT:
					data_text += parser.get_node_data()
			current_layer["data"] = _parse_csv_layer_data(data_text, layer_total)
			_tmx_layers.append(current_layer)
			current_layer = {}

	if _tmx_layers.is_empty() and _tmx_map_width > 0 and _tmx_map_height > 0:
		_tmx_layers.append({
			"name": "world_resource_grid",
			"width": _tmx_map_width,
			"height": _tmx_map_height,
			"data": PackedInt32Array(),
		})
	if _tmx_layers.is_empty():
		push_warning("[map-grid-theme] TMX parsed but missing layers")
		return false

	print(
		"[map-grid-theme] loaded tmx | map=%dx%d | tile=%.1fx%.1f | layers=%d | pureResourceGrid=true"
		% [_tmx_map_width, _tmx_map_height, _tmx_tile_width, _tmx_tile_height, _tmx_layers.size()]
	)
	return true


func _load_tsx_info(first_gid: int, source_name: String) -> Dictionary:
	if source_name == "":
		return {}
	var tsx_res_path: String = "%s/%s" % [THEME_WORLD_ROOT, source_name]
	var tsx_abs_path: String = ProjectSettings.globalize_path(tsx_res_path)
	if not FileAccess.file_exists(tsx_abs_path):
		push_warning("[map-grid-theme] missing TSX: %s" % tsx_abs_path)
		return {}

	var parser := XMLParser.new()
	var open_err: Error = parser.open(tsx_abs_path)
	if open_err != OK:
		push_warning("[map-grid-theme] TSX open failed: %s (err=%d)" % [tsx_abs_path, int(open_err)])
		return {}

	var tileset_name: String = source_name
	var tile_w: int = int(_tmx_tile_width)
	var tile_h: int = int(_tmx_tile_height)
	var columns: int = 1
	var image_source: String = ""

	while true:
		var read_err: Error = parser.read()
		if read_err != OK:
			break
		if parser.get_node_type() != XMLParser.NODE_ELEMENT:
			continue
		var node_name: String = parser.get_node_name()
		if node_name == "tileset":
			tileset_name = _xml_attr(parser, "name", tileset_name)
			tile_w = _xml_attr_int(parser, "tilewidth", tile_w)
			tile_h = _xml_attr_int(parser, "tileheight", tile_h)
			columns = max(1, _xml_attr_int(parser, "columns", columns))
		elif node_name == "image":
			image_source = _xml_attr(parser, "source", "")

	if image_source == "":
		push_warning("[map-grid-theme] TSX image source missing: %s" % source_name)
		return {}
	var texture_path: String = "%s/%s" % [THEME_WORLD_ROOT, image_source]
	var texture: Texture2D = _load_texture_with_fallback(texture_path)
	if texture == null:
		push_warning("[map-grid-theme] texture load failed: %s" % texture_path)
		return {}

	return {
		"name": tileset_name,
		"firstGid": first_gid,
		"columns": columns,
		"tileWidth": tile_w,
		"tileHeight": tile_h,
		"texture": texture,
		"imageSource": image_source,
	}


func _load_texture_with_fallback(res_path: String) -> Texture2D:
	var normalized_path: String = res_path.to_lower()
	if normalized_path.ends_with(".png") or normalized_path.ends_with(".jpg") or normalized_path.ends_with(".jpeg") or normalized_path.ends_with(".webp"):
		return _load_image_texture(res_path)

	var texture: Texture2D = load(res_path) as Texture2D
	if texture != null:
		return texture
	return _load_image_texture(res_path)


func _load_image_texture(res_path: String) -> Texture2D:
	var abs_path: String = ProjectSettings.globalize_path(res_path)
	var image := Image.new()
	var image_err: Error = image.load(abs_path)
	if image_err != OK:
		push_warning("[map-grid-theme] image load fallback failed: %s (err=%d)" % [abs_path, int(image_err)])
		return null

	var fallback_texture: ImageTexture = ImageTexture.create_from_image(image)
	return fallback_texture


func _parse_csv_layer_data(text: String, expected_size: int) -> PackedInt32Array:
	var values := PackedInt32Array()
	if text.strip_edges() == "":
		return values
	var normalized := text.replace("\r", "").replace("\n", "")
	var raw_tokens: PackedStringArray = normalized.split(",")
	for token in raw_tokens:
		var trimmed: String = token.strip_edges()
		if trimmed == "":
			continue
		values.append(int(trimmed))
	if expected_size > 0 and values.size() < expected_size:
		var missing: int = expected_size - values.size()
		for _i in range(missing):
			values.append(0)
	return values


func _xml_attr(parser: XMLParser, key: String, fallback: String) -> String:
	for i in range(parser.get_attribute_count()):
		if parser.get_attribute_name(i) == key:
			return parser.get_attribute_value(i)
	return fallback


func _xml_attr_int(parser: XMLParser, key: String, fallback: int) -> int:
	var raw: String = _xml_attr(parser, key, "")
	if raw == "":
		return fallback
	return int(raw)


func _sort_tileset_by_first_gid(a: Dictionary, b: Dictionary) -> bool:
	return int(a.get("firstGid", 0)) < int(b.get("firstGid", 0))


func _is_pan_button(button_index: MouseButton) -> bool:
	return button_index == MOUSE_BUTTON_MIDDLE or button_index == MOUSE_BUTTON_RIGHT


func _apply_zoom(multiplier: float, pivot_pos: Vector2) -> void:
	var previous_zoom: float = _zoom
	_zoom = clampf(_zoom * multiplier, _effective_min_zoom(), max_zoom)
	if is_equal_approx(previous_zoom, _zoom):
		return
	var tmx_before: Vector2 = _screen_to_tmx(pivot_pos, previous_zoom)
	var tmx_after: Vector2 = _screen_to_tmx(pivot_pos, _zoom)
	var tmx_delta: Vector2 = tmx_before - tmx_after
	_pan_offset += Vector2(tmx_delta.x * _tmx_tile_width * 0.5 * _zoom, tmx_delta.y * _tmx_tile_height * 0.5 * _zoom)
	queue_redraw()
	_emit_view_transform_changed()
	_update_hover(pivot_pos)


func _effective_min_zoom() -> float:
	return min(max_zoom, max(min_zoom, cell_layer_min_zoom))


func _update_hover(mouse_screen_pos: Vector2) -> void:
	var previous_hover_key: String = _hover_tile_key
	var hovered: Dictionary = _screen_to_backend_tile_data(mouse_screen_pos)
	if hovered.is_empty():
		_hover_tile = {}
		_hover_tile_key = ""
	else:
		_hover_tile = hovered
		_hover_tile_key = _coord_key(int(hovered.get("x", 0)), int(hovered.get("y", 0)))
	_update_hover_label()
	if previous_hover_key != _hover_tile_key:
		queue_redraw()


func _select_tile_at(mouse_screen_pos: Vector2) -> void:
	var selected: Dictionary = _screen_to_backend_tile_data(mouse_screen_pos)
	if selected.is_empty():
		if _selected_tile_key != "":
			_selected_tile = {}
			_selected_tile_key = ""
			queue_redraw()
		return
	_selected_tile = selected
	_selected_tile_key = _coord_key(int(selected.get("x", 0)), int(selected.get("y", 0)))
	_emit_player_home_city_node_clicked_if_applicable(selected)
	queue_redraw()


func _emit_player_home_city_node_clicked_if_applicable(tile_data: Dictionary) -> void:
	var context: Dictionary = _resolve_player_home_city_click_context(tile_data)
	if context.is_empty():
		return
	player_home_city_node_clicked.emit(context)


func _resolve_player_home_city_click_context(tile_data: Dictionary) -> Dictionary:
	if tile_data.is_empty() or _home_city_overlay_entries.is_empty():
		return {}
	for entry_variant in _home_city_overlay_entries:
		if not (entry_variant is Dictionary):
			continue
		var entry: Dictionary = entry_variant as Dictionary
		if not bool(entry.get("isHuman", false)):
			continue
		var home_tile_id: String = str(entry.get("tileId", "")).strip_edges()
		if home_tile_id == "":
			continue
		if not _does_home_city_entry_match_click_tile(entry, tile_data):
			continue
		return {
			"tileId": home_tile_id,
			"tileX": int(entry.get("tileX", int(tile_data.get("x", -1)))),
			"tileY": int(entry.get("tileY", int(tile_data.get("y", -1)))),
			"tmxX": int(entry.get("tmxX", int(tile_data.get("tmxX", -1)))),
			"tmxY": int(entry.get("tmxY", int(tile_data.get("tmxY", -1)))),
			"title": str(entry.get("title", home_tile_id)).strip_edges(),
			"factionId": str(entry.get("factionId", "")).strip_edges(),
			"cityLevel": int(entry.get("cityLevel", 1)),
		}
	return {}


func _does_home_city_entry_match_click_tile(entry: Dictionary, tile_data: Dictionary) -> bool:
	var home_tile_id: String = str(entry.get("tileId", "")).strip_edges()
	if home_tile_id == "":
		return false
	for id_key in ["tileId", "id", "anchorTileId", "anchorId", "sourceTileId"]:
		var clicked_id: String = str(tile_data.get(id_key, "")).strip_edges()
		if clicked_id != "" and clicked_id == home_tile_id:
			return true
	var home_tmx_x: int = int(entry.get("tmxX", -1))
	var home_tmx_y: int = int(entry.get("tmxY", -1))
	if home_tmx_x < 0 or home_tmx_y < 0:
		return false
	if _does_click_tile_tmx_match_home(tile_data, "tmxX", "tmxY", home_tmx_x, home_tmx_y):
		return true
	if _does_click_tile_tmx_match_home(tile_data, "anchorTmxX", "anchorTmxY", home_tmx_x, home_tmx_y):
		return true
	var anchor_key: String = str(tile_data.get("anchorKey", "")).strip_edges()
	return anchor_key != "" and anchor_key == _coord_key(home_tmx_x, home_tmx_y)


func _does_click_tile_tmx_match_home(
	tile_data: Dictionary,
	x_key: String,
	y_key: String,
	home_tmx_x: int,
	home_tmx_y: int
) -> bool:
	if not tile_data.has(x_key) or not tile_data.has(y_key):
		return false
	return int(tile_data.get(x_key, -1)) == home_tmx_x and int(tile_data.get(y_key, -1)) == home_tmx_y


func _screen_to_backend_tile_data(mouse_screen_pos: Vector2) -> Dictionary:
	if _tmx_map_width <= 0 or _tmx_map_height <= 0:
		return {}
	var tmx_coord: Vector2 = _screen_to_tmx(mouse_screen_pos, _zoom)
	if tmx_coord.x < -0.5 or tmx_coord.y < -0.5 or tmx_coord.x > float(_tmx_map_width) or tmx_coord.y > float(_tmx_map_height):
		return {}
	var preview_tmx_x: int = clampi(int(round(tmx_coord.x)), 0, maxi(0, _tmx_map_width - 1))
	var preview_tmx_y: int = clampi(int(round(tmx_coord.y)), 0, maxi(0, _tmx_map_height - 1))
	var preview_key: String = _coord_key(preview_tmx_x, preview_tmx_y)
	if _world_cell_preview_tile_by_tmx_key.has(preview_key):
		return _world_cell_preview_tile_by_tmx_key[preview_key] as Dictionary
	if _tiles.is_empty():
		return {}

	var backend_x: int = _map_tmx_to_backend_axis(tmx_coord.x, _backend_x_min, _backend_x_max, _tmx_map_width)
	var backend_y: int = _map_tmx_to_backend_axis(tmx_coord.y, _backend_y_min, _backend_y_max, _tmx_map_height)
	var direct_key: String = _coord_key(backend_x, backend_y)
	var direct_tile: Dictionary = {}
	if _tile_by_coord.has(direct_key):
		direct_tile = _tile_by_coord[direct_key] as Dictionary
	var reserved_hit_tile: Dictionary = _build_reserved_world_cell_hit_tile(preview_tmx_x, preview_tmx_y, direct_tile)
	if not reserved_hit_tile.is_empty():
		return reserved_hit_tile
	if not direct_tile.is_empty():
		return direct_tile

	for radius in range(1, 3):
		for dy in range(-radius, radius + 1):
			for dx in range(-radius, radius + 1):
				var key: String = _coord_key(backend_x + dx, backend_y + dy)
				if _tile_by_coord.has(key):
					var nearby_tile: Dictionary = _tile_by_coord[key] as Dictionary
					var nearby_tmx_variant: Variant = _tmx_cell_by_coord_key.get(key, null)
					if nearby_tmx_variant is Vector2i:
						var nearby_tmx: Vector2i = nearby_tmx_variant as Vector2i
						var nearby_reserved_hit: Dictionary = _build_reserved_world_cell_hit_tile(nearby_tmx.x, nearby_tmx.y, nearby_tile)
						if not nearby_reserved_hit.is_empty():
							return nearby_reserved_hit
					return nearby_tile
	return {}


func _build_reserved_world_cell_hit_tile(tmx_x: int, tmx_y: int, source_tile: Dictionary = {}) -> Dictionary:
	var tmx_key: String = _coord_key(tmx_x, tmx_y)
	var footprint_id: String = _resolve_reserved_world_cell_footprint_id(tmx_key)
	if not _should_world_cell_reserved_hit_proxy_apply(footprint_id):
		return {}
	var anchor_key: String = str(_world_cell_reserved_anchor_by_tmx_key.get(tmx_key, "")).strip_edges()
	var anchor_variant: Variant = _world_cell_node_anchor_by_tmx_key.get(anchor_key, {})
	var anchor_entry: Dictionary = anchor_variant as Dictionary if anchor_variant is Dictionary else {}
	if anchor_entry.is_empty() and source_tile.is_empty():
		return {}
	var hit_tile: Dictionary = source_tile.duplicate(true) if not source_tile.is_empty() else {}
	var backend_x: int = int(hit_tile.get("x", _map_tmx_to_backend_axis(float(tmx_x), _backend_x_min, _backend_x_max, _tmx_map_width)))
	var backend_y: int = int(hit_tile.get("y", _map_tmx_to_backend_axis(float(tmx_y), _backend_y_min, _backend_y_max, _tmx_map_height)))
	hit_tile["x"] = backend_x
	hit_tile["y"] = backend_y
	hit_tile["tmxX"] = tmx_x
	hit_tile["tmxY"] = tmx_y
	hit_tile["footprintId"] = footprint_id
	hit_tile["isReservedHit"] = true
	hit_tile["anchorKey"] = anchor_key
	if not anchor_entry.is_empty():
		for key in ["id", "tileId", "type", "terrain", "district", "owner", "cityLevel", "landmarkId", "compositeId", "placeholderRole"]:
			if anchor_entry.has(key):
				hit_tile[key] = anchor_entry.get(key)
		hit_tile["anchorTmxX"] = int(anchor_entry.get("tmxX", tmx_x))
		hit_tile["anchorTmxY"] = int(anchor_entry.get("tmxY", tmx_y))
	var base_variant: Variant = _world_cell_node_base_by_tmx_key.get(tmx_key, {})
	if base_variant is Dictionary:
		var base_entry: Dictionary = base_variant as Dictionary
		hit_tile["cellState"] = str(base_entry.get("cellState", "reserved_base")).strip_edges()
		hit_tile["slotId"] = str(base_entry.get("slotId", "")).strip_edges()
	else:
		hit_tile["cellState"] = str(hit_tile.get("cellState", "reserved_base")).strip_edges()
		hit_tile["slotId"] = str(hit_tile.get("slotId", "")).strip_edges()
	if str(hit_tile.get("type", "")).strip_edges() == "":
		hit_tile["type"] = _resolve_world_cell_runtime_type(anchor_entry, footprint_id)
	if str(hit_tile.get("terrain", "")).strip_edges() == "":
		hit_tile["terrain"] = _resolve_world_cell_runtime_default_terrain(str(hit_tile.get("type", "")).strip_edges().to_lower())
	if str(hit_tile.get("id", "")).strip_edges() == "":
		hit_tile["id"] = "world_cell_%s" % tmx_key.replace(":", "_")
	return hit_tile


func _should_world_cell_reserved_hit_proxy_apply(footprint_id: String) -> bool:
	if footprint_id == "":
		return false
	return footprint_id != WORLD_CELL_FOOTPRINT_RESOURCE_1X1


func _resolve_world_cell_runtime_default_terrain(tile_type: String) -> String:
	if not _resolve_world_cell_node_dispatch_rule(tile_type).is_empty():
		return _resolve_world_cell_node_dispatch_default_terrain(tile_type)
	match tile_type:
		"city", "player_city", "ai_city", "system_city":
			return "cityland"
		_:
			return tile_type


func _resolve_screen_position_for_tile(tile_data: Dictionary) -> Vector2:
	var direct_tmx_x: int = int(tile_data.get("tmxX", -1))
	var direct_tmx_y: int = int(tile_data.get("tmxY", -1))
	if direct_tmx_x >= 0 and direct_tmx_y >= 0:
		return _tmx_to_screen(direct_tmx_x, direct_tmx_y)
	return tile_to_screen_position(int(tile_data.get("x", 0)), int(tile_data.get("y", 0)))


func _map_tmx_to_backend_axis(value: float, min_axis: int, max_axis: int, tmx_size: int) -> int:
	if tmx_size <= 1 or max_axis <= min_axis:
		return min_axis
	var ratio: float = clampf(value / float(tmx_size - 1), 0.0, 1.0)
	return int(round(lerpf(float(min_axis), float(max_axis), ratio)))


func _update_hover_label() -> void:
	if _hover_label == null:
		return
	if _hover_tile_key == "":
		_hover_label.text = (
			"SLG Theme | scope=%s | zoom=%.2f | backendTiles=%d | visibleDrawn=%d | sampleStep=%d"
			% [_chunk_scope, _zoom, _tiles.size(), _last_visible_draw_count, _last_sampling_step]
		)
		_emit_hud_snapshot_changed()
		return
	var tile_id: String = str(_hover_tile.get("id", "-"))
	var tile_x: int = int(_hover_tile.get("x", 0))
	var tile_y: int = int(_hover_tile.get("y", 0))
	var tile_type: String = str(_hover_tile.get("type", "-"))
	var terrain: String = str(_hover_tile.get("terrain", "-"))
	var district: String = str(_hover_tile.get("district", "-"))
	var cell_state: String = str(_hover_tile.get("cellState", "")).strip_edges()
	var slot_id: String = str(_hover_tile.get("slotId", "")).strip_edges()
	var sample_id: String = str(_hover_tile.get("sampleId", "")).strip_edges()
	var extra_line: String = ""
	if cell_state != "" or slot_id != "" or sample_id != "":
		extra_line = "\nCellState:%s  Slot:%s  Sample:%s" % [
			cell_state if cell_state != "" else "-",
			slot_id if slot_id != "" else "-",
			sample_id if sample_id != "" else "-",
		]
	_hover_label.text = (
		"SLG Theme | scope=%s | zoom=%.2f | visible=%d | sample=%d\nID:%s  Pos:(%d,%d)\nType:%s  Terrain:%s  District:%s%s"
		% [_chunk_scope, _zoom, _last_visible_draw_count, _last_sampling_step, tile_id, tile_x, tile_y, tile_type, terrain, district, extra_line]
	)
	_emit_hud_snapshot_changed()


func _update_perf_label() -> void:
	if _perf_label == null:
		return
	var instant_fps: int = Engine.get_frames_per_second()
	var instant_frame_ms: float = 1000.0 / max(1.0, float(instant_fps))
	_perf_label.text = (
		"Perf(5s) | avgFPS=%.1f | avgFrameMs=%.2f | instFPS=%d | instFrameMs=%.2f | visibleDrawn=%d | visibleCandidates=%d | sampleStep=%d"
		% [_avg_fps_5s, _avg_frame_ms_5s, instant_fps, instant_frame_ms, _last_visible_draw_count, _last_visible_candidate_count, _last_sampling_step]
	)
	_emit_hud_snapshot_changed()


func _record_frame_sample(delta: float) -> void:
	var now_sec: float = float(Time.get_ticks_msec()) / 1000.0
	_frame_timestamps.append(now_sec)
	_frame_deltas.append(delta)
	_frame_delta_sum += delta
	while not _frame_timestamps.is_empty() and now_sec - float(_frame_timestamps[0]) > perf_window_seconds:
		_frame_timestamps.pop_front()
		if not _frame_deltas.is_empty():
			var removed_delta: float = float(_frame_deltas.pop_front())
			_frame_delta_sum = max(0.0, _frame_delta_sum - removed_delta)


func _refresh_perf_metrics() -> void:
	var frame_count: int = _frame_deltas.size()
	if frame_count <= 0 or _frame_delta_sum <= 0.0:
		_avg_fps_5s = 0.0
		_avg_frame_ms_5s = 0.0
		return
	_avg_fps_5s = float(frame_count) / _frame_delta_sum
	_avg_frame_ms_5s = (_frame_delta_sum / float(frame_count)) * 1000.0


func _on_export_button_pressed() -> void:
	_export_perf_baseline("button")


func _export_perf_baseline(source: String) -> void:
	var export_dir: String = _resolve_export_dir_path()
	if export_dir == "":
		_update_export_status("Export failed | tmp dir unavailable")
		return
	var stamp: String = str(Time.get_unix_time_from_system()).replace(".", "_")
	var file_name: String = "godot_perf_baseline_%s.json" % stamp
	var output_path: String = _join_path(export_dir, file_name)
	var payload: Dictionary = {
		"exportedAtUnixSec": float(Time.get_unix_time_from_system()),
		"source": source,
		"theme": {
			"name": "slgclient",
			"tmxLoaded": _tmx_loaded,
			"tmxPath": THEME_MAP_TMX_PATH,
			"tmxMapWidth": _tmx_map_width,
			"tmxMapHeight": _tmx_map_height,
			"tmxTileWidth": _tmx_tile_width,
			"tmxTileHeight": _tmx_tile_height,
		},
		"metrics": {
			"avgFPS5s": _avg_fps_5s,
			"avgFrameMs5s": _avg_frame_ms_5s,
			"instantFPS": Engine.get_frames_per_second(),
			"visibleDrawn": _last_visible_draw_count,
			"visibleCandidates": _last_visible_candidate_count,
			"sampleStep": _last_sampling_step,
		},
		"backendMap": {
			"scope": _chunk_scope,
			"tileCount": _tiles.size(),
			"mapWidth": _map_width,
			"mapHeight": _map_height,
			"loadedProvinceCount": _loaded_province_ids.size(),
		},
		"camera": {
			"zoom": _zoom,
			"panOffset": {"x": _pan_offset.x, "y": _pan_offset.y},
		},
	}
	var export_file := FileAccess.open(output_path, FileAccess.WRITE)
	if export_file == null:
		_update_export_status("Export failed | open error=%d" % FileAccess.get_open_error())
		return
	export_file.store_string(JSON.stringify(payload, "  "))
	export_file.flush()
	export_file.close()
	_update_export_status("Exported: %s" % output_path)
	print("[map-grid-theme] baseline exported | source=%s | path=%s" % [source, output_path])


func _resolve_export_dir_path() -> String:
	var repo_tmp_dir: String = ProjectSettings.globalize_path("res://../tmp")
	if DirAccess.make_dir_recursive_absolute(repo_tmp_dir) == OK:
		return repo_tmp_dir
	var user_tmp_dir: String = ProjectSettings.globalize_path("user://tmp")
	if DirAccess.make_dir_recursive_absolute(user_tmp_dir) == OK:
		return user_tmp_dir
	return ""


func _update_export_status(message: String) -> void:
	if _export_status_label != null:
		_export_status_label.text = message
	_emit_hud_snapshot_changed()


func get_hud_snapshot() -> Dictionary:
	return {
		"hover_summary": _hover_label.text if _hover_label != null else "",
		"perf_summary": _perf_label.text if _perf_label != null else "",
		"export_status_text": _export_status_label.text if _export_status_label != null else "",
	}


func _emit_hud_snapshot_changed() -> void:
	hud_snapshot_changed.emit(get_hud_snapshot())


func _is_truthy_env(key: String) -> bool:
	var value: String = OS.get_environment(key).strip_edges().to_lower()
	return value == "1" or value == "true" or value == "yes"


func _schedule_runtime_preview_capture() -> void:
	if _runtime_preview_capture_done or not _runtime_preview_capture_requested:
		return
	_runtime_preview_capture_done = true
	call_deferred("_export_runtime_preview_capture")


func _should_schedule_runtime_capture_now() -> bool:
	if not _is_world_cell_live_capture_requested():
		return true
	return not _world_cell_live_capture_sample_order.is_empty()


func _export_runtime_preview_capture() -> void:
	if not _runtime_preview_capture_requested:
		return
	_selected_tile = {}
	_selected_tile_key = ""
	_hover_tile = {}
	_hover_tile_key = ""
	var previous_visible: bool = visible
	var restore_zoom: bool = false
	var previous_zoom: float = _zoom
	var restore_pan: bool = false
	var previous_pan_offset: Vector2 = _pan_offset
	if _resolve_world_cell_preview_variant() == "stages" and _zoom > 0.32:
		_zoom = 0.32
		restore_zoom = true
	if not visible:
		visible = true
	if _is_world_cell_live_capture_requested():
		_focus_runtime_live_pass_capture_camera()
		restore_pan = true
		_rebuild_world_cell_live_capture_samples()
		_apply_runtime_live_pass_capture_interaction_focus()
	elif _resolve_world_cell_preview_variant() != "formal":
		var selected_variant: Variant = _world_cell_preview_focus_tiles.get("selected", {})
		if selected_variant is Dictionary:
			_selected_tile = (selected_variant as Dictionary).duplicate(true)
			_selected_tile_key = _coord_key(int(_selected_tile.get("x", 0)), int(_selected_tile.get("y", 0)))
		var hover_variant: Variant = _world_cell_preview_focus_tiles.get("hover", {})
		if hover_variant is Dictionary:
			_hover_tile = (hover_variant as Dictionary).duplicate(true)
			_hover_tile_key = _coord_key(int(_hover_tile.get("x", 0)), int(_hover_tile.get("y", 0)))
	_update_hover_label()
	queue_redraw()
	var hidden_canvas_items: Array = _set_runtime_preview_capture_canvas_items_visible(false)
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var capture_path: String = _resolve_runtime_preview_capture_path()
	if capture_path == "":
		visible = previous_visible
		if restore_zoom:
			_zoom = previous_zoom
		if restore_pan:
			_pan_offset = previous_pan_offset
		_restore_runtime_preview_capture_canvas_items(hidden_canvas_items)
		_update_export_status("Runtime capture failed | tmp screenshot dir unavailable")
		return
	var viewport_texture: ViewportTexture = get_viewport().get_texture()
	if viewport_texture == null:
		visible = previous_visible
		if restore_zoom:
			_zoom = previous_zoom
		if restore_pan:
			_pan_offset = previous_pan_offset
		_restore_runtime_preview_capture_canvas_items(hidden_canvas_items)
		_update_export_status("Runtime capture failed | viewport texture missing")
		return
	var image: Image = viewport_texture.get_image()
	if image == null:
		visible = previous_visible
		if restore_zoom:
			_zoom = previous_zoom
		if restore_pan:
			_pan_offset = previous_pan_offset
		_restore_runtime_preview_capture_canvas_items(hidden_canvas_items)
		_update_export_status("Runtime capture failed | viewport image missing")
		return
	var save_err: Error = image.save_png(capture_path)
	_restore_runtime_preview_capture_canvas_items(hidden_canvas_items)
	visible = previous_visible
	if restore_zoom:
		_zoom = previous_zoom
	if restore_pan:
		_pan_offset = previous_pan_offset
	if save_err != OK:
		_update_export_status("Runtime capture failed | err=%d" % int(save_err))
		return
	var crop_path: String = _resolve_runtime_preview_capture_crop_path()
	var crop_rect: Rect2i = _resolve_runtime_preview_capture_crop_rect(image)
	if crop_path != "" and crop_rect.size.x > 0 and crop_rect.size.y > 0:
		var crop_image: Image = image.get_region(crop_rect)
		if crop_image != null:
			crop_image.save_png(crop_path)
	var metadata_path: String = _resolve_runtime_preview_capture_metadata_path()
	if metadata_path != "":
		_save_runtime_preview_capture_metadata(metadata_path, image, crop_rect)
	_update_export_status("Runtime capture saved: %s" % capture_path)
	print("[map-grid-theme] runtime preview capture exported | path=%s" % capture_path)


func _focus_runtime_live_pass_capture_camera() -> void:
	if _world_cell_live_capture_sample_order.is_empty():
		return
	var min_x: float = INF
	var min_y: float = INF
	var max_x: float = -INF
	var max_y: float = -INF
	for sample_id_variant in _world_cell_live_capture_sample_order:
		var sample_variant: Variant = _world_cell_live_capture_sample_by_id.get(str(sample_id_variant), {})
		if not (sample_variant is Dictionary):
			continue
		var sample: Dictionary = sample_variant as Dictionary
		var anchor_tmx: Vector2i = _vector2i_from_json_array(sample.get("anchorTmx", []), Vector2i(-1, -1))
		if anchor_tmx.x < 0 or anchor_tmx.y < 0:
			continue
		var screen_pos: Vector2 = _tmx_to_screen(anchor_tmx.x, anchor_tmx.y)
		min_x = min(min_x, screen_pos.x)
		min_y = min(min_y, screen_pos.y)
		max_x = max(max_x, screen_pos.x)
		max_y = max(max_y, screen_pos.y)
	if min_x == INF or min_y == INF:
		return
	var sample_center := Vector2((min_x + max_x) * 0.5, (min_y + max_y) * 0.5)
	var viewport_center: Vector2 = get_viewport_rect().size * 0.5
	_pan_offset += viewport_center - sample_center


func _apply_runtime_live_pass_capture_interaction_focus() -> void:
	if _world_cell_live_capture_sample_order.is_empty():
		return
	var selected_tile: Dictionary = _resolve_runtime_live_pass_capture_hit_tile(0)
	if not selected_tile.is_empty():
		_selected_tile = selected_tile
		_selected_tile_key = _coord_key(int(selected_tile.get("x", 0)), int(selected_tile.get("y", 0)))
	var hover_index: int = 1 if _world_cell_live_capture_sample_order.size() > 1 else 0
	var hover_tile: Dictionary = _resolve_runtime_live_pass_capture_hit_tile(hover_index)
	if not hover_tile.is_empty():
		_hover_tile = hover_tile
		_hover_tile_key = _coord_key(int(hover_tile.get("x", 0)), int(hover_tile.get("y", 0)))


func _resolve_runtime_live_pass_capture_hit_tile(sample_index: int) -> Dictionary:
	if sample_index < 0 or sample_index >= _world_cell_live_capture_sample_order.size():
		return {}
	var sample_id: String = str(_world_cell_live_capture_sample_order[sample_index]).strip_edges()
	var sample_variant: Variant = _world_cell_live_capture_sample_by_id.get(sample_id, {})
	if not (sample_variant is Dictionary):
		return {}
	var sample: Dictionary = sample_variant as Dictionary
	var hit_tile_variant: Variant = sample.get("hitTile", {})
	if hit_tile_variant is Dictionary:
		return (hit_tile_variant as Dictionary).duplicate(true)
	return {}


func _join_path(base_path: String, file_name: String) -> String:
	if base_path.ends_with("/") or base_path.ends_with("\\"):
		return base_path + file_name
	return base_path + "/" + file_name


func _resolve_runtime_preview_capture_path() -> String:
	var screenshot_dir: String = ProjectSettings.globalize_path("res://../tmp/screenshots/world_resource_alignment")
	if DirAccess.make_dir_recursive_absolute(screenshot_dir) != OK:
		return ""
	return _join_path(screenshot_dir, "world_cell_runtime_preview_capture%s.png" % _resolve_world_cell_preview_capture_suffix())


func _resolve_runtime_preview_capture_crop_path() -> String:
	var screenshot_dir: String = ProjectSettings.globalize_path("res://../tmp/screenshots/world_resource_alignment")
	if DirAccess.make_dir_recursive_absolute(screenshot_dir) != OK:
		return ""
	return _join_path(screenshot_dir, "world_cell_runtime_preview_capture%s_crop.png" % _resolve_world_cell_preview_capture_suffix())


func _resolve_runtime_preview_capture_metadata_path() -> String:
	var screenshot_dir: String = ProjectSettings.globalize_path("res://../tmp/screenshots/world_resource_alignment")
	if DirAccess.make_dir_recursive_absolute(screenshot_dir) != OK:
		return ""
	return _join_path(screenshot_dir, "world_cell_runtime_preview_capture%s.json" % _resolve_world_cell_preview_capture_suffix())


func _resolve_world_cell_preview_capture_suffix() -> String:
	var capture_mode: String = _resolve_world_cell_capture_mode()
	if capture_mode == WORLD_CELL_CAPTURE_MODE_LIVE_PASS:
		return "_live_pass"
	if capture_mode == WORLD_CELL_CAPTURE_MODE_LIVE_NODES:
		return "_live_nodes"
	var preview_mode: String = _resolve_world_cell_preview_mode()
	var preview_variant: String = _resolve_world_cell_preview_variant()
	var suffix_parts: Array = []
	if preview_mode != "city":
		suffix_parts.append(preview_mode)
	if preview_variant == "formal":
		suffix_parts.append("formal")
	elif preview_variant == "stages":
		suffix_parts.append("stages")
	if suffix_parts.is_empty():
		return ""
	return "_" + "_".join(suffix_parts)


func _set_runtime_preview_capture_canvas_items_visible(visible: bool) -> Array:
	var saved_states: Array = []
	for node_path in [
		NodePath("../HoverLayer"),
		NodePath("../UiLayer"),
		NodePath("../ObservabilityPanel"),
		NodePath("../UnitViewLayer"),
	]:
		var node: Node = get_node_or_null(node_path)
		if node == null:
			continue
		_collect_runtime_preview_capture_canvas_item_states(node, saved_states, visible)
	return saved_states


func _restore_runtime_preview_capture_canvas_items(saved_states: Array) -> void:
	for state_variant in saved_states:
		if not (state_variant is Dictionary):
			continue
		var state: Dictionary = state_variant as Dictionary
		var item: CanvasItem = state.get("item", null) as CanvasItem
		if item == null:
			continue
		item.visible = bool(state.get("visible", true))
	queue_redraw()


func _collect_runtime_preview_capture_canvas_item_states(node: Node, saved_states: Array, visible: bool) -> void:
	if node is CanvasItem:
		var item: CanvasItem = node as CanvasItem
		saved_states.append({"item": item, "visible": item.visible})
		item.visible = visible
	for child in node.get_children():
		if child is Node:
			_collect_runtime_preview_capture_canvas_item_states(child as Node, saved_states, visible)


func _resolve_runtime_preview_capture_crop_rect(image: Image) -> Rect2i:
	if image == null:
		return Rect2i()
	var image_width: int = image.get_width()
	var image_height: int = image.get_height()
	if image_width <= 0 or image_height <= 0:
		return Rect2i()
	var sample_rects: Array = []
	for sample_id_variant in _resolve_runtime_capture_sample_order():
		var sample_id: String = str(sample_id_variant).strip_edges()
		var sample_variant: Variant = _resolve_runtime_capture_sample(sample_id)
		if not (sample_variant is Dictionary):
			continue
		var sample: Dictionary = sample_variant as Dictionary
		var capture_rect_data: Array = sample.get("captureRect", []) as Array
		if capture_rect_data.size() < 4:
			continue
		var rect := Rect2(
			Vector2(float(capture_rect_data[0]), float(capture_rect_data[1])),
			Vector2(float(capture_rect_data[2]), float(capture_rect_data[3]))
		)
		sample_rects.append(rect)
	if sample_rects.is_empty():
		return Rect2i(0, 0, image_width, image_height)
	var union_rect: Rect2 = sample_rects[0]
	for rect_variant in sample_rects:
		if not (rect_variant is Rect2):
			continue
		union_rect = union_rect.merge(rect_variant as Rect2)
	var crop_padding_x: int = maxi(32, int(ceil(_tmx_tile_width * maxf(_zoom, 0.25) * 0.60)))
	var crop_padding_y: int = maxi(48, int(ceil(_tmx_tile_height * maxf(_zoom, 0.25) * 1.40)))
	var min_x: int = clampi(int(floor(union_rect.position.x)) - crop_padding_x, 0, image_width - 1)
	var min_y: int = clampi(int(floor(union_rect.position.y)) - crop_padding_y, 0, image_height - 1)
	var max_x: int = clampi(int(ceil(union_rect.end.x)) + crop_padding_x, min_x + 1, image_width)
	var max_y: int = clampi(int(ceil(union_rect.end.y)) + crop_padding_y, min_y + 1, image_height)
	return Rect2i(min_x, min_y, max_x - min_x, max_y - min_y)


func _build_world_cell_live_pass_backend_metadata() -> Dictionary:
	var live_backend: Dictionary = _build_world_cell_capture_node_backend_metadata("pass")
	live_backend["totalPassAnchors"] = _resolve_world_cell_live_pass_anchor_entries().size()
	return live_backend


func _build_world_cell_live_nodes_backend_metadata() -> Dictionary:
	var live_backend: Dictionary = _build_world_cell_capture_node_backend_metadata("live_nodes")
	live_backend["capturedNodeTypes"] = _resolve_world_cell_live_capture_node_types()
	return live_backend


func _build_world_cell_capture_node_backend_metadata(capture_node_type: String) -> Dictionary:
	var normalized_capture_node_type: String = capture_node_type.strip_edges().to_lower()
	if normalized_capture_node_type == "":
		normalized_capture_node_type = "pass"
	var builder_stats: Dictionary = _resolve_world_cell_runtime_builder_stats_snapshot()
	var raw_backend_node_counts: Dictionary = (builder_stats.get("rawBackendNodeCounts", {}) as Dictionary).duplicate(true)
	var registered_attempt_counts: Dictionary = (builder_stats.get("registeredAttemptCounts", builder_stats.get("registeredAnchorCounts", {})) as Dictionary).duplicate(true)
	var registered_anchor_counts: Dictionary = (builder_stats.get("registeredAnchorCounts", {}) as Dictionary).duplicate(true)
	var duplicate_anchor_counts: Dictionary = (builder_stats.get("duplicateAnchorCounts", {}) as Dictionary).duplicate(true)
	var skipped_conflict_counts: Dictionary = (builder_stats.get("skippedConflictCounts", {}) as Dictionary).duplicate(true)
	var skipped_invalid_counts: Dictionary = (builder_stats.get("skippedInvalidCounts", {}) as Dictionary).duplicate(true)
	var skipped_conflict_samples: Dictionary = (builder_stats.get("skippedConflictSamples", {}) as Dictionary).duplicate(true)
	var duplicate_anchor_samples: Dictionary = (builder_stats.get("duplicateAnchorSamples", {}) as Dictionary).duplicate(true)
	var active_unique_anchor_audit: Dictionary = _build_world_cell_active_unique_anchor_audit()
	var active_unique_anchor_counts_by_type: Dictionary = (active_unique_anchor_audit.get("activeAnchorCountsByType", {}) as Dictionary).duplicate(true)
	var active_unique_anchor_counts_by_footprint: Dictionary = (active_unique_anchor_audit.get("activeAnchorCountsByFootprint", {}) as Dictionary).duplicate(true)
	var builder_lifecycle_summary: Dictionary = _build_world_cell_runtime_builder_lifecycle_summary(builder_stats, active_unique_anchor_counts_by_type)
	return {
		"metadataBuilder": "capture_node_backend_v1",
		"nodeType": normalized_capture_node_type,
		"source": "/api/world/map-layout",
		"sampleCount": _world_cell_live_capture_sample_order.size(),
		"duplicateAnchorPolicy": WORLD_CELL_DUPLICATE_ANCHOR_POLICY,
		"nodeTypeStats": {
			"nodeType": normalized_capture_node_type,
			"rawBackendNodeCount": int(raw_backend_node_counts.get(normalized_capture_node_type, 0)),
			"registeredAttemptCount": int(registered_attempt_counts.get(normalized_capture_node_type, 0)),
			"registeredAnchorCount": int(registered_anchor_counts.get(normalized_capture_node_type, 0)),
			"registeredAnchorCountSemantics": "registered_attempts_before_duplicate_last_write",
			"activeUniqueAnchorCount": int(active_unique_anchor_counts_by_type.get(normalized_capture_node_type, 0)),
			"duplicateAnchorCount": int(duplicate_anchor_counts.get(normalized_capture_node_type, 0)),
			"skippedConflictCount": int(skipped_conflict_counts.get(normalized_capture_node_type, 0)),
			"skippedInvalidCount": int(skipped_invalid_counts.get(normalized_capture_node_type, 0)),
		},
		"rawBackendNodeCounts": raw_backend_node_counts,
		"registeredAttemptCounts": registered_attempt_counts,
		"registeredAnchorCounts": registered_anchor_counts,
		"registeredAnchorCountsSemantics": "registered_attempts_before_duplicate_last_write",
		"activeUniqueAnchorCountsByType": active_unique_anchor_counts_by_type,
		"activeUniqueAnchorCountsByFootprint": active_unique_anchor_counts_by_footprint,
		"duplicateAnchorCounts": duplicate_anchor_counts,
		"skippedConflictCounts": skipped_conflict_counts,
		"skippedInvalidCounts": skipped_invalid_counts,
		"skippedConflictSamples": skipped_conflict_samples,
		"duplicateAnchorSamples": duplicate_anchor_samples,
		"builderStats": builder_stats,
		"builderLifecycleSummary": builder_lifecycle_summary,
		"builderAuditSummary": _build_world_cell_runtime_builder_audit_summary(builder_stats),
		"runtimeStrategyHandlerAudit": _world_cell_runtime_strategy_handler_audit.duplicate(true),
		"strategicNodeAvailability": _build_world_cell_live_strategic_node_availability_status(raw_backend_node_counts, registered_attempt_counts, active_unique_anchor_counts_by_type),
		"placementPolicyAudit": _build_world_cell_placement_policy_audit([
			WORLD_CELL_FOOTPRINT_PASS_1X1,
			WORLD_CELL_FOOTPRINT_FORT_1X1,
			WORLD_CELL_FOOTPRINT_DOCK_1X1,
			WORLD_CELL_FOOTPRINT_SYSTEM_CITY_L03_L04_3X3,
			WORLD_CELL_FOOTPRINT_SYSTEM_CITY_L05_L06_5X5,
			WORLD_CELL_FOOTPRINT_SYSTEM_CITY_L07_L08_7X7,
			WORLD_CELL_FOOTPRINT_SYSTEM_CITY_L09_9X9,
		]),
	}


func _finalize_world_cell_capture_node_backend_metadata(live_backend: Dictionary, samples: Array) -> Dictionary:
	var finalized: Dictionary = live_backend.duplicate(true)
	var capture_node_type: String = str(finalized.get("nodeType", "pass")).strip_edges().to_lower()
	if capture_node_type == "":
		capture_node_type = "pass"
	finalized["sampleHitStats"] = _build_world_cell_capture_node_sample_hit_stats(samples)
	finalized["reservedHitCoverageAudit"] = _build_world_cell_capture_node_reserved_hit_coverage_audit(samples, capture_node_type)
	finalized["placementContextAudit"] = _build_world_cell_capture_node_placement_context_audit(samples)
	finalized["placementContextStatus"] = _build_world_cell_capture_node_placement_context_status(finalized["placementContextAudit"] as Dictionary)
	var node_type_stats: Dictionary = finalized.get("nodeTypeStats", {}) as Dictionary
	var builder_audit_summary: Dictionary = finalized.get("builderAuditSummary", {}) as Dictionary
	var skipped_conflict_count: int = int(node_type_stats.get("skippedConflictCount", 0))
	var duplicate_anchor_count: int = int(node_type_stats.get("duplicateAnchorCount", 0))
	finalized["captureNodeBuilderAuditStatus"] = _build_world_cell_capture_node_builder_audit_status(
		capture_node_type,
		builder_audit_summary,
		skipped_conflict_count,
		duplicate_anchor_count
	)
	finalized["captureNodeReasonAuditStatus"] = _build_world_cell_capture_node_reason_audit_status(
		capture_node_type,
		builder_audit_summary,
		skipped_conflict_count,
		duplicate_anchor_count
	)
	finalized["previewPlacementCurrentContextAudit"] = _build_world_cell_runtime_sample_preview_placement_current_context_audit(samples)
	finalized["runtimeStrategyAudit"] = _build_world_cell_live_pass_runtime_strategy_audit(samples)
	finalized["reservedFootprintAudit"] = _build_world_cell_reserved_footprint_audit()
	return finalized


func _save_runtime_preview_capture_metadata(path: String, image: Image, crop_rect: Rect2i) -> void:
	var capture_mode: String = _resolve_world_cell_capture_mode()
	var metadata := {
		"captureMode": capture_mode,
		"mode": _resolve_world_cell_capture_metadata_mode(capture_mode),
		"variant": "runtime" if _is_world_cell_live_capture_requested() else _resolve_world_cell_preview_variant(),
		"zoom": _zoom,
		"fullCapturePath": _resolve_runtime_preview_capture_path(),
		"cropCapturePath": _resolve_runtime_preview_capture_crop_path(),
		"imageSize": [image.get_width(), image.get_height()],
		"cropRect": [crop_rect.position.x, crop_rect.position.y, crop_rect.size.x, crop_rect.size.y],
		"samples": [],
	}
	if capture_mode == WORLD_CELL_CAPTURE_MODE_LIVE_PASS:
		metadata["liveBackend"] = _build_world_cell_live_pass_backend_metadata()
	elif capture_mode == WORLD_CELL_CAPTURE_MODE_LIVE_NODES:
		metadata["liveBackend"] = _build_world_cell_live_nodes_backend_metadata()
	for sample_id_variant in _resolve_runtime_capture_sample_order():
		var sample_id: String = str(sample_id_variant).strip_edges()
		var sample_variant: Variant = _resolve_runtime_capture_sample(sample_id)
		if sample_variant is Dictionary:
			(metadata["samples"] as Array).append((sample_variant as Dictionary).duplicate(true))
	if _is_world_cell_live_capture_requested() and metadata.has("liveBackend"):
		var live_backend: Dictionary = metadata.get("liveBackend", {}) as Dictionary
		live_backend = _finalize_world_cell_capture_node_backend_metadata(live_backend, metadata["samples"] as Array)
		if capture_mode == WORLD_CELL_CAPTURE_MODE_LIVE_PASS:
			live_backend["livePassAuditStatus"] = _build_world_cell_live_pass_audit_status(live_backend)
		elif capture_mode == WORLD_CELL_CAPTURE_MODE_LIVE_NODES:
			live_backend["liveNodeCaptureStatus"] = _build_world_cell_live_node_capture_status(live_backend, metadata["samples"] as Array)
		metadata["liveBackend"] = live_backend
	elif capture_mode == WORLD_CELL_CAPTURE_MODE_PREVIEW:
		metadata["previewPlacementEligibilityAudit"] = _world_cell_preview_placement_audit_by_sample_id.duplicate(true)
	var file: FileAccess = FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		return
	file.store_string(JSON.stringify(metadata, "\t"))
	file.close()


func _resolve_world_cell_capture_metadata_mode(capture_mode: String) -> String:
	if capture_mode == WORLD_CELL_CAPTURE_MODE_LIVE_PASS:
		return "live_backend_pass"
	if capture_mode == WORLD_CELL_CAPTURE_MODE_LIVE_NODES:
		return "live_backend_nodes"
	return _resolve_world_cell_preview_mode()


func _resolve_runtime_capture_sample_order() -> Array:
	if _is_world_cell_live_capture_requested():
		return _world_cell_live_capture_sample_order
	return _world_cell_preview_sample_order


func _resolve_runtime_capture_sample(sample_id: String) -> Variant:
	if _is_world_cell_live_capture_requested():
		return _world_cell_live_capture_sample_by_id.get(sample_id, {})
	return _world_cell_preview_sample_by_id.get(sample_id, {})


func _resolve_sampling_step(candidate_count: int) -> int:
	if candidate_count <= MAX_VISIBLE_TILE_DRAW_COUNT:
		return 1
	var ratio: float = float(candidate_count) / float(MAX_VISIBLE_TILE_DRAW_COUNT)
	return maxi(1, int(ceil(sqrt(max(1.0, ratio)))))


func _compute_visible_tmx_bounds() -> Dictionary:
	if _tmx_map_width <= 0 or _tmx_map_height <= 0:
		return {"valid": false}
	var viewport_rect: Rect2 = get_viewport_rect()
	var corners: Array = [
		viewport_rect.position,
		viewport_rect.position + Vector2(viewport_rect.size.x, 0.0),
		viewport_rect.position + Vector2(0.0, viewport_rect.size.y),
		viewport_rect.position + viewport_rect.size,
	]
	var min_u: float = INF
	var max_u: float = -INF
	var min_v: float = INF
	var max_v: float = -INF
	for corner_variant in corners:
		var corner: Vector2 = corner_variant as Vector2
		var uv: Vector2 = _screen_to_tmx(corner, _zoom)
		min_u = min(min_u, uv.x)
		max_u = max(max_u, uv.x)
		min_v = min(min_v, uv.y)
		max_v = max(max_v, uv.y)

	var margin_tiles: int = 2
	var start_x: int = clampi(int(floor(min_u)) - margin_tiles, 0, _tmx_map_width - 1)
	var end_x: int = clampi(int(ceil(max_u)) + margin_tiles, 0, _tmx_map_width - 1)
	var start_y: int = clampi(int(floor(min_v)) - margin_tiles, 0, _tmx_map_height - 1)
	var end_y: int = clampi(int(ceil(max_v)) + margin_tiles, 0, _tmx_map_height - 1)
	if start_x > end_x or start_y > end_y:
		return {"valid": false}
	return {
		"valid": true,
		"startX": start_x,
		"endX": end_x,
		"startY": start_y,
		"endY": end_y,
	}


func _tmx_to_screen(tmx_x: int, tmx_y: int) -> Vector2:
	var world_x: float = (float(tmx_x) - float(tmx_y)) * (_tmx_tile_width * 0.5)
	var world_y: float = (float(tmx_x) + float(tmx_y)) * (_tmx_tile_height * 0.5)
	return _draw_origin + _pan_offset + Vector2(world_x, world_y) * _zoom


func _screen_to_tmx(screen_pos: Vector2, target_zoom: float) -> Vector2:
	var safe_zoom: float = max(0.0001, target_zoom)
	var local: Vector2 = (screen_pos - _draw_origin - _pan_offset) / safe_zoom
	var half_w: float = max(0.001, _tmx_tile_width * 0.5)
	var half_h: float = max(0.001, _tmx_tile_height * 0.5)
	var a: float = local.x / half_w
	var b: float = local.y / half_h
	var u: float = (a + b) * 0.5
	var v: float = (b - a) * 0.5
	return Vector2(u, v)


func _coord_key(tile_x: int, tile_y: int) -> String:
	return "%d:%d" % [tile_x, tile_y]


func tile_to_screen_position(tile_x: int, tile_y: int) -> Vector2:
	var coord_key: String = _coord_key(tile_x, tile_y)
	if _tmx_cell_by_coord_key.has(coord_key):
		var cached_cell: Vector2i = _tmx_cell_by_coord_key[coord_key] as Vector2i
		return _tmx_to_screen(cached_cell.x, cached_cell.y)

	var mapped_x: int = _map_backend_to_tmx_axis(tile_x, _backend_x_min, _backend_x_max, _tmx_map_width)
	var mapped_y: int = _map_backend_to_tmx_axis(tile_y, _backend_y_min, _backend_y_max, _tmx_map_height)
	return _tmx_to_screen(mapped_x, mapped_y)


func tile_id_to_screen_position(tile_id: String, fallback_x: int = 0, fallback_y: int = 0) -> Vector2:
	var normalized_tile_id: String = tile_id.strip_edges()
	if normalized_tile_id != "" and _tmx_cell_by_tile_id.has(normalized_tile_id):
		var cached_cell: Vector2i = _tmx_cell_by_tile_id[normalized_tile_id] as Vector2i
		return _tmx_to_screen(cached_cell.x, cached_cell.y)
	return tile_to_screen_position(fallback_x, fallback_y)


func _map_backend_to_tmx_axis(value: int, min_axis: int, max_axis: int, tmx_size: int) -> int:
	if tmx_size <= 1:
		return 0
	if max_axis <= min_axis:
		return 0
	var ratio: float = clampf((float(value) - float(min_axis)) / max(1.0, float(max_axis - min_axis)), 0.0, 1.0)
	return clampi(int(round(ratio * float(tmx_size - 1))), 0, tmx_size - 1)


func get_view_state() -> Dictionary:
	return {
		"zoom": _zoom,
		"panOffsetX": _pan_offset.x,
		"panOffsetY": _pan_offset.y,
		"drawOriginX": _draw_origin.x,
		"drawOriginY": _draw_origin.y,
		"tmxTileWidth": _tmx_tile_width,
		"tmxTileHeight": _tmx_tile_height,
		"tmxMapWidth": _tmx_map_width,
		"tmxMapHeight": _tmx_map_height,
	}


func _emit_view_transform_changed() -> void:
	view_transform_changed.emit(get_view_state())
