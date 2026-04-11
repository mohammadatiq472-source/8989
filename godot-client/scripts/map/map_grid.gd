extends Node2D

const MAX_VISIBLE_TILE_DRAW_COUNT: int = 20000
const THEME_MAP_TMX_PATH: String = "res://assets/themes/slgclient/current/world/map.tmx"
const THEME_WORLD_ROOT: String = "res://assets/themes/slgclient/current/world"
const THEME_OVERLAY_MANIFEST_PATH: String = "res://assets/themes/slgclient/manifests/overlay_frames_manifest.json"
const HUMAN_HOME_LABEL: String = "P"
const AI_HOME_LABEL: String = "AI"
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

@export var tile_size: float = 12.0
@export var tile_gap: float = 1.0
@export var min_zoom: float = 0.25
@export var max_zoom: float = 2.25
@export var zoom_step: float = 1.12
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
@export var sand_edge_enabled: bool = true
@export_range(24.0, 140.0, 1.0) var terrain_edge_overlay_base_height: float = 86.0
@export_range(0.05, 0.90, 0.01) var terrain_edge_alpha_min: float = 0.20
@export_range(0.05, 0.95, 0.01) var terrain_edge_alpha_max: float = 0.50
@export var resource_overlay_enabled: bool = true
@export var resource_overlay_text_enabled: bool = false
@export_range(20.0, 120.0, 1.0) var resource_overlay_base_height: float = 62.0
@export_range(0.20, 1.00, 0.01) var resource_overlay_alpha: float = 0.96
@export_range(0.20, 1.80, 0.01) var home_city_overlay_scale: float = 1.0
@export var home_city_badge_enabled: bool = true

var _tiles: Array = []
var _tile_by_coord: Dictionary = {}
var _tmx_cell_by_tile_id: Dictionary = {}
var _tmx_cell_by_coord_key: Dictionary = {}
var _mountain_coord_set: Dictionary = {}
var _mountain_overlay_entries: Array = []
var _terrain_edge_overlay_entries: Array = []
var _resource_overlay_entries: Array = []
var _city_overlay_by_tile_id: Dictionary = {}
var _world_city_overlay_by_tile_id: Dictionary = {}
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
var _hover_label: Label
var _perf_label: Label
var _export_button: Button
var _export_status_label: Label

var _last_visible_draw_count: int = 0
var _last_visible_candidate_count: int = 0
var _last_sampling_step: int = 1
var _perf_elapsed: float = 0.0
var _frame_timestamps: Array = []
var _frame_deltas: Array = []
var _frame_delta_sum: float = 0.0
var _avg_fps_5s: float = 0.0
var _avg_frame_ms_5s: float = 0.0
var _auto_export_requested: bool = false
var _auto_export_done: bool = false

var _tmx_loaded: bool = false
var _tmx_map_width: int = 0
var _tmx_map_height: int = 0
var _tmx_tile_width: float = 200.0
var _tmx_tile_height: float = 100.0
var _tmx_layers: Array = []
var _tmx_tilesets: Array = []
var _overlay_manifest: Dictionary = {}
var _overlay_texture_by_frame: Dictionary = {}
var _applied_mountain_visual_profile: String = ""


func _ready() -> void:
	set_process(true)
	set_process_unhandled_input(true)
	_hover_label = get_node_or_null(hover_label_path) as Label
	_perf_label = get_node_or_null(perf_label_path) as Label
	_export_button = get_node_or_null(export_button_path) as Button
	_export_status_label = get_node_or_null(export_status_label_path) as Label
	_auto_export_requested = _is_truthy_env("SLG_EXPORT_BASELINE_ON_START")

	var export_callback := Callable(self, "_on_export_button_pressed")
	if _export_button != null and not _export_button.pressed.is_connected(export_callback):
		_export_button.pressed.connect(export_callback)

	_tmx_loaded = _load_theme_tmx()
	_load_overlay_manifest()
	_sync_mountain_visual_profile(true)
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
	_tmx_cell_by_tile_id = {}
	_tmx_cell_by_coord_key = {}
	_mountain_coord_set = {}
	_mountain_overlay_entries = []
	_terrain_edge_overlay_entries = []
	_resource_overlay_entries = []
	_city_overlay_by_tile_id = {}
	var has_bounds: bool = false
	var mountain_backend_entries: Array = []
	var river_coord_set: Dictionary = {}
	var river_backend_entries: Array = []
	var sand_coord_set: Dictionary = {}
	var sand_backend_entries: Array = []

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
		_tmx_cell_by_coord_key[_coord_key(tile_x, tile_y)] = mapped_cell
		var tile_id: String = str(tile_data.get("id", "")).strip_edges()
		if tile_id != "":
			_tmx_cell_by_tile_id[tile_id] = mapped_cell

		var tile_type: String = str(tile_data.get("type", "")).strip_edges().to_lower()
		if tile_type == "resource":
			var resource_level: int = maxi(1, int(tile_data.get("resourceLevel", 1)))
			var resource_kind: String = str(tile_data.get("resourceKind", "")).strip_edges().to_lower()
			_resource_overlay_entries.append(
				{
					"tileId": tile_id,
					"tmxX": mapped_x,
					"tmxY": mapped_y,
					"resourceLevel": resource_level,
					"resourceKind": resource_kind,
					"overlayFrame": _resolve_resource_overlay_frame(resource_kind, resource_level),
				}
			)
		elif tile_type == "city" and tile_id != "":
			var city_owner: String = str(tile_data.get("owner", "")).strip_edges().to_lower()
			_city_overlay_by_tile_id[tile_id] = {
				"tileId": tile_id,
				"backendX": tile_x,
				"backendY": tile_y,
				"tmxX": mapped_x,
				"tmxY": mapped_y,
				"cityLevel": maxi(1, int(tile_data.get("cityLevel", 1))),
				"owner": city_owner,
			}

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

	_draw_terrain_edge_overlays(visible_bounds)
	_draw_mountain_continuity_overlays(visible_bounds)
	_draw_resource_level_overlays(visible_bounds)
	_draw_home_city_overlays(visible_bounds)

	if _hover_tile_key != "":
		var hover_x: int = int(_hover_tile.get("x", 0))
		var hover_y: int = int(_hover_tile.get("y", 0))
		var hover_pos: Vector2 = tile_to_screen_position(hover_x, hover_y)
		var half_w: float = _tmx_tile_width * 0.5 * _zoom
		var half_h: float = _tmx_tile_height * 0.5 * _zoom
		var points := PackedVector2Array(
			[
				Vector2(hover_pos.x, hover_pos.y - half_h),
				Vector2(hover_pos.x + half_w, hover_pos.y),
				Vector2(hover_pos.x, hover_pos.y + half_h),
				Vector2(hover_pos.x - half_w, hover_pos.y),
			]
		)
		draw_colored_polygon(points, Color(1.0, 0.96, 0.70, 0.18))
		var outline := PackedVector2Array(points)
		outline.append(points[0])
		draw_polyline(outline, Color(1.0, 0.96, 0.70, 0.95), max(1.0, _zoom))


func _draw_tmx_cell(tmx_x: int, tmx_y: int) -> void:
	if _tmx_map_width <= 0 or _tmx_map_height <= 0:
		return
	var idx: int = tmx_y * _tmx_map_width + tmx_x
	var screen_center: Vector2 = _tmx_to_screen(tmx_x, tmx_y)

	for layer_variant in _tmx_layers:
		if not (layer_variant is Dictionary):
			continue
		var layer: Dictionary = layer_variant as Dictionary
		var layer_data: PackedInt32Array = layer.get("data", PackedInt32Array()) as PackedInt32Array
		if idx < 0 or idx >= layer_data.size():
			continue
		var gid: int = int(layer_data[idx])
		if gid <= 0:
			continue
		var tile_info: Dictionary = _resolve_gid_tile_info(gid)
		if tile_info.is_empty():
			continue
		var texture: Texture2D = tile_info.get("texture", null) as Texture2D
		if texture == null:
			continue
		var region: Rect2 = tile_info.get("region", Rect2()) as Rect2
		var tile_w: float = float(tile_info.get("tileWidth", _tmx_tile_width))
		var tile_h: float = float(tile_info.get("tileHeight", _tmx_tile_height))
		var dest_size := Vector2(tile_w * _zoom, tile_h * _zoom)
		var top_left := screen_center - Vector2(dest_size.x * 0.5, dest_size.y * 0.5)
		draw_texture_rect_region(texture, Rect2(top_left, dest_size), region)


func _draw_resource_level_overlays(visible_bounds: Dictionary) -> void:
	if not resource_overlay_enabled:
		return
	if _resource_overlay_entries.is_empty():
		return
	if _zoom < 0.36:
		return

	var font: Font = ThemeDB.fallback_font
	for entry_variant in _resource_overlay_entries:
		if not (entry_variant is Dictionary):
			continue
		var entry: Dictionary = entry_variant as Dictionary
		var tmx_x: int = int(entry.get("tmxX", -1))
		var tmx_y: int = int(entry.get("tmxY", -1))
		if not _is_tmx_cell_visible(tmx_x, tmx_y, visible_bounds, 1):
			continue
		var level: int = maxi(1, int(entry.get("resourceLevel", 1)))
		var center: Vector2 = _tmx_to_screen(tmx_x, tmx_y) + Vector2(0.0, -_tmx_tile_height * 0.16 * _zoom)
		var overlay_frame: String = str(entry.get("overlayFrame", ""))
		var texture_drawn: bool = _draw_overlay_frame(
			overlay_frame,
			center,
			clampf(resource_overlay_base_height * _zoom, 12.0, 64.0),
			resource_overlay_alpha
		)
		if texture_drawn:
			if resource_overlay_text_enabled and font != null and _zoom >= 0.72:
				var text: String = str(level)
				var font_size: int = int(clampf(11.0 * _zoom, 8.0, 13.0))
				_draw_centered_text(font, center + Vector2(0.0, clampf(10.0 * _zoom, 3.0, 8.0)), text, font_size, Color(0.05, 0.05, 0.05, 0.95))
			continue

		var radius: float = clampf(4.8 * _zoom, 2.0, 8.6)
		var fill_color: Color = _resource_level_color(level)
		draw_circle(center, radius + 1.0, Color(0.0, 0.0, 0.0, 0.52))
		draw_circle(center, radius, fill_color)
		draw_arc(center, radius + 0.3, 0.0, TAU, 20, Color(1.0, 1.0, 1.0, 0.58), 1.0)
		if resource_overlay_text_enabled and font != null and _zoom >= 0.50:
			var text_fallback: String = str(level)
			var font_size_fallback: int = int(clampf(12.0 * _zoom, 8.0, 15.0))
			_draw_centered_text(font, center + Vector2(0.0, radius * 0.42), text_fallback, font_size_fallback, Color(0.05, 0.05, 0.05, 0.95))


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
		var is_human: bool = bool(entry.get("isHuman", false))
		var accent: Color = Color(0.48, 0.94, 0.66, 0.96) if is_human else Color(1.0, 0.57, 0.48, 0.95)
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
			"tmxX": int(city_entry.get("tmxX", -1)),
			"tmxY": int(city_entry.get("tmxY", -1)),
			"cityLevel": city_level,
			"factionId": faction_id,
			"isHuman": is_human,
			"label": HUMAN_HOME_LABEL if is_human else AI_HOME_LABEL,
			"flagFrame": _resolve_home_city_flag_frame(is_human, city_level),
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
	if sand_edge_enabled:
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
		return "land_ground_%d_1.png" % ground_index

	var level_index: int = clampi(level, 1, 6)
	match normalized_kind:
		"food", "grain":
			return "land_1_%d.png" % level_index
		"wood":
			return "land_2_%d.png" % level_index
		"stone":
			return "land_3_%d.png" % level_index
		"iron":
			return "land_4_%d.png" % level_index
		_:
			return "land_3_%d.png" % level_index


func _resolve_home_city_flag_frame(is_human: bool, city_level: int) -> String:
	var level: int = clampi(city_level, 1, 5)
	var preferred: String = "flag_blue_%d.png" % level if is_human else "flag_red_%d.png" % level
	if _overlay_texture_by_frame.has(preferred):
		return preferred
	var fallback_primary: String = "flag_blue_3.png" if is_human else "flag_red_3.png"
	if _overlay_texture_by_frame.has(fallback_primary):
		return fallback_primary
	var fallback_outside: String = "out_flag_blue_3.png" if is_human else "out_flag_red_3.png"
	if _overlay_texture_by_frame.has(fallback_outside):
		return fallback_outside
	return ""


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
			var next_err: Error = parser.read()
			if next_err == OK and parser.get_node_type() == XMLParser.NODE_TEXT:
				data_text = parser.get_node_data()
			current_layer["data"] = _parse_csv_layer_data(data_text, layer_total)
			_tmx_layers.append(current_layer)
			current_layer = {}

	for ref_variant in tileset_refs:
		if not (ref_variant is Dictionary):
			continue
		var ref: Dictionary = ref_variant as Dictionary
		var tsx_info: Dictionary = _load_tsx_info(int(ref.get("firstGid", 1)), str(ref.get("source", "")))
		if not tsx_info.is_empty():
			_tmx_tilesets.append(tsx_info)

	_tmx_tilesets.sort_custom(Callable(self, "_sort_tileset_by_first_gid"))

	if _tmx_layers.is_empty() or _tmx_tilesets.is_empty():
		push_warning("[map-grid-theme] TMX parsed but missing layers or tilesets")
		return false

	print(
		"[map-grid-theme] loaded tmx | map=%dx%d | tile=%.1fx%.1f | layers=%d | tilesets=%d"
		% [_tmx_map_width, _tmx_map_height, _tmx_tile_width, _tmx_tile_height, _tmx_layers.size(), _tmx_tilesets.size()]
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
	_zoom = clampf(_zoom * multiplier, min_zoom, max_zoom)
	if is_equal_approx(previous_zoom, _zoom):
		return
	var tmx_before: Vector2 = _screen_to_tmx(pivot_pos, previous_zoom)
	var tmx_after: Vector2 = _screen_to_tmx(pivot_pos, _zoom)
	var tmx_delta: Vector2 = tmx_before - tmx_after
	_pan_offset += Vector2(tmx_delta.x * _tmx_tile_width * 0.5 * _zoom, tmx_delta.y * _tmx_tile_height * 0.5 * _zoom)
	queue_redraw()
	_emit_view_transform_changed()
	_update_hover(pivot_pos)


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


func _screen_to_backend_tile_data(mouse_screen_pos: Vector2) -> Dictionary:
	if _tiles.is_empty() or _tmx_map_width <= 0 or _tmx_map_height <= 0:
		return {}
	var tmx_coord: Vector2 = _screen_to_tmx(mouse_screen_pos, _zoom)
	if tmx_coord.x < -0.5 or tmx_coord.y < -0.5 or tmx_coord.x > float(_tmx_map_width) or tmx_coord.y > float(_tmx_map_height):
		return {}

	var backend_x: int = _map_tmx_to_backend_axis(tmx_coord.x, _backend_x_min, _backend_x_max, _tmx_map_width)
	var backend_y: int = _map_tmx_to_backend_axis(tmx_coord.y, _backend_y_min, _backend_y_max, _tmx_map_height)
	var direct_key: String = _coord_key(backend_x, backend_y)
	if _tile_by_coord.has(direct_key):
		return _tile_by_coord[direct_key] as Dictionary

	for radius in range(1, 3):
		for dy in range(-radius, radius + 1):
			for dx in range(-radius, radius + 1):
				var key: String = _coord_key(backend_x + dx, backend_y + dy)
				if _tile_by_coord.has(key):
					return _tile_by_coord[key] as Dictionary
	return {}


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
		return
	var tile_id: String = str(_hover_tile.get("id", "-"))
	var tile_x: int = int(_hover_tile.get("x", 0))
	var tile_y: int = int(_hover_tile.get("y", 0))
	var tile_type: String = str(_hover_tile.get("type", "-"))
	var terrain: String = str(_hover_tile.get("terrain", "-"))
	var district: String = str(_hover_tile.get("district", "-"))
	_hover_label.text = (
		"SLG Theme | scope=%s | zoom=%.2f | visible=%d | sample=%d\nID:%s  Pos:(%d,%d)\nType:%s  Terrain:%s  District:%s"
		% [_chunk_scope, _zoom, _last_visible_draw_count, _last_sampling_step, tile_id, tile_x, tile_y, tile_type, terrain, district]
	)


func _update_perf_label() -> void:
	if _perf_label == null:
		return
	var instant_fps: int = Engine.get_frames_per_second()
	var instant_frame_ms: float = 1000.0 / max(1.0, float(instant_fps))
	_perf_label.text = (
		"Perf(5s) | avgFPS=%.1f | avgFrameMs=%.2f | instFPS=%d | instFrameMs=%.2f | visibleDrawn=%d | visibleCandidates=%d | sampleStep=%d"
		% [_avg_fps_5s, _avg_frame_ms_5s, instant_fps, instant_frame_ms, _last_visible_draw_count, _last_visible_candidate_count, _last_sampling_step]
	)


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


func _is_truthy_env(key: String) -> bool:
	var value: String = OS.get_environment(key).strip_edges().to_lower()
	return value == "1" or value == "true" or value == "yes"


func _join_path(base_path: String, file_name: String) -> String:
	if base_path.ends_with("/") or base_path.ends_with("\\"):
		return base_path + file_name
	return base_path + "/" + file_name


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
