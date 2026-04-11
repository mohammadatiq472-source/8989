extends Node2D
class_name UnitMarker

const UNIT_MANIFEST_PATH: String = "res://assets/themes/slgclient/manifests/unit_frames_manifest.json"
const DIRECTION_ORDER: Array[String] = ["r", "ru", "u", "lu", "l", "ld", "d", "rd"]
const ENGAGE_KIND_BATTLE: String = "battle"
const ENGAGE_KIND_TILE_CONTROL: String = "tile_control"
const ENGAGE_KIND_LOGISTICS: String = "logistics"

@export var radius: float = 4.0
@export var visual_scale: float = 0.52
@export var frame_fps: float = 14.0

static var _shared_loaded: bool = false
static var _shared_frames_by_direction: Dictionary = {}
static var _shared_texture_cache: Dictionary = {}

var _sprite: Sprite2D
var _base_color: Color = Color(0.88, 0.88, 0.90, 0.95)
var _engaged: bool = false
var _is_moving: bool = false
var _direction_key: String = "d"
var _engage_kind: String = ENGAGE_KIND_BATTLE
var _frame_timer: float = 0.0
var _frame_index: int = 0


func _ready() -> void:
	_ensure_shared_frames_loaded()
	if _sprite == null:
		_sprite = Sprite2D.new()
		_sprite.name = "UnitSprite"
		_sprite.centered = true
		_sprite.position = Vector2(0.0, -34.0)
		_sprite.scale = Vector2(visual_scale, visual_scale)
		add_child(_sprite)
	_apply_sprite_modulate()
	_apply_current_frame(true)


func _process(delta: float) -> void:
	if _is_moving:
		_frame_timer += delta
		var frame_step: float = 1.0 / max(1.0, frame_fps)
		while _frame_timer >= frame_step:
			_frame_timer -= frame_step
			_frame_index += 1
			_apply_current_frame(false)
	else:
		if _frame_index != 0:
			_frame_index = 0
			_apply_current_frame(false)


func set_faction_color(next_color: Color) -> void:
	_base_color = next_color
	_apply_sprite_modulate()
	queue_redraw()


func set_move_direction(direction: Vector2) -> void:
	_direction_key = _resolve_direction_key(direction)
	_apply_current_frame(false)


func set_moving(next_moving: bool, direction: Vector2 = Vector2.ZERO) -> void:
	if direction.length() > 0.001:
		_direction_key = _resolve_direction_key(direction)
	_is_moving = next_moving
	if not _is_moving:
		_frame_timer = 0.0
		_frame_index = 0
	_apply_current_frame(false)


func play_engage(intensity: float = 1.0, direction: Vector2 = Vector2.ZERO, kind: String = ENGAGE_KIND_BATTLE) -> void:
	if direction.length() > 0.001:
		_direction_key = _resolve_direction_key(direction)
	_engage_kind = _normalize_engage_kind(kind)
	var profile: Dictionary = _resolve_engage_profile(_engage_kind)
	var normalized_intensity: float = clampf(intensity * float(profile.get("boost", 1.0)), 0.30, 1.55)
	var dir: Vector2 = direction.normalized() if direction.length() > 0.001 else Vector2.ZERO
	var base_position: Vector2 = position
	_kill_engage_tween()
	_engaged = true
	_apply_sprite_modulate()
	queue_redraw()
	var tween := create_tween()
	set_meta("engage_tween", tween)
	tween.set_trans(Tween.TRANS_SINE)
	tween.set_ease(Tween.EASE_OUT)
	var pre_scale: float = 1.0 + float(profile.get("preScale", 0.10)) * normalized_intensity
	var peak_scale: float = 1.0 + float(profile.get("peakScale", 0.28)) * normalized_intensity
	var pre_duration: float = float(profile.get("preDuration", 0.04)) + 0.04 * normalized_intensity
	var burst_duration: float = float(profile.get("burstDuration", 0.06)) + 0.05 * normalized_intensity
	var settle_duration: float = float(profile.get("settleDuration", 0.10)) + 0.08 * normalized_intensity
	var push: float = float(profile.get("push", 1.0))
	var pre_offset: Vector2 = dir * (-0.60 - 1.05 * normalized_intensity * push)
	var burst_offset: Vector2 = dir * (1.20 + 2.20 * normalized_intensity * push)

	tween.tween_property(self, "scale", Vector2(pre_scale, pre_scale), pre_duration)
	if dir != Vector2.ZERO:
		tween.parallel().tween_property(self, "position", base_position + pre_offset, pre_duration)
	tween.tween_property(self, "scale", Vector2(peak_scale, peak_scale), burst_duration)
	if dir != Vector2.ZERO:
		tween.parallel().tween_property(self, "position", base_position + burst_offset, burst_duration)
	tween.tween_property(self, "scale", Vector2.ONE, settle_duration)
	if dir != Vector2.ZERO:
		tween.parallel().tween_property(self, "position", base_position, settle_duration)
	tween.tween_callback(Callable(self, "_clear_engage_state"))
	tween.tween_callback(Callable(self, "_clear_engage_tween"))


func _clear_engage_state() -> void:
	_engaged = false
	_apply_sprite_modulate()
	queue_redraw()


func _clear_engage_tween() -> void:
	if has_meta("engage_tween"):
		remove_meta("engage_tween")


func _kill_engage_tween() -> void:
	if not has_meta("engage_tween"):
		return
	var running_tween: Variant = get_meta("engage_tween")
	if running_tween is Tween:
		(running_tween as Tween).kill()
	remove_meta("engage_tween")


func _draw() -> void:
	if _sprite != null and _sprite.texture != null:
		var ring_color: Color = _resolve_engage_accent_color(_engage_kind) if _engaged else Color(0.05, 0.06, 0.08, 0.74)
		draw_arc(Vector2.ZERO, radius + 2.0, 0.0, TAU, 24, ring_color, 1.15)
		return
	var draw_color: Color = _resolve_engage_accent_color(_engage_kind) if _engaged else _base_color
	draw_circle(Vector2.ZERO, radius, draw_color)
	draw_arc(Vector2.ZERO, radius + 1.5, 0.0, TAU, 16, Color(0.08, 0.08, 0.10, 0.75), 1.0)


func _resolve_direction_key(direction: Vector2) -> String:
	if direction.length() <= 0.001:
		return _direction_key if _direction_key in DIRECTION_ORDER else "d"
	var angle_deg: float = rad_to_deg(direction.angle())
	if angle_deg < 0.0:
		angle_deg += 360.0
	if angle_deg >= 337.5 or angle_deg < 22.5:
		return "r"
	if angle_deg < 67.5:
		return "rd"
	if angle_deg < 112.5:
		return "d"
	if angle_deg < 157.5:
		return "ld"
	if angle_deg < 202.5:
		return "l"
	if angle_deg < 247.5:
		return "lu"
	if angle_deg < 292.5:
		return "u"
	return "ru"


func _apply_current_frame(force_reset: bool) -> void:
	if _sprite == null:
		return
	var frames: Array = _shared_frames_by_direction.get(_direction_key, []) as Array
	if frames.is_empty():
		frames = _shared_frames_by_direction.get("d", []) as Array
	if frames.is_empty():
		_sprite.texture = null
		return
	if force_reset:
		_frame_index = 0
	var frame: Dictionary = frames[_frame_index % frames.size()] as Dictionary
	var frame_texture: Texture2D = frame.get("texture", null) as Texture2D
	_sprite.texture = frame_texture
	_sprite.region_enabled = false
	_apply_sprite_modulate()


func _apply_sprite_modulate() -> void:
	if _sprite == null:
		return
	var tint := Color(1.0, 1.0, 1.0, 0.96).lerp(_base_color, 0.22)
	if _engaged:
		tint = tint.lerp(_resolve_engage_accent_color(_engage_kind), 0.34)
	_sprite.modulate = tint


func _normalize_engage_kind(kind: String) -> String:
	match kind:
		ENGAGE_KIND_BATTLE:
			return ENGAGE_KIND_BATTLE
		ENGAGE_KIND_TILE_CONTROL:
			return ENGAGE_KIND_TILE_CONTROL
		ENGAGE_KIND_LOGISTICS:
			return ENGAGE_KIND_LOGISTICS
		_:
			return ENGAGE_KIND_BATTLE


func _resolve_engage_profile(kind: String) -> Dictionary:
	match _normalize_engage_kind(kind):
		ENGAGE_KIND_BATTLE:
			return {
				"boost": 1.08,
				"preScale": 0.13,
				"peakScale": 0.34,
				"preDuration": 0.035,
				"burstDuration": 0.055,
				"settleDuration": 0.10,
				"push": 1.35,
			}
		ENGAGE_KIND_TILE_CONTROL:
			return {
				"boost": 0.97,
				"preScale": 0.10,
				"peakScale": 0.27,
				"preDuration": 0.04,
				"burstDuration": 0.065,
				"settleDuration": 0.11,
				"push": 1.0,
			}
		ENGAGE_KIND_LOGISTICS:
			return {
				"boost": 0.84,
				"preScale": 0.08,
				"peakScale": 0.21,
				"preDuration": 0.05,
				"burstDuration": 0.075,
				"settleDuration": 0.13,
				"push": 0.72,
			}
		_:
			return {
				"boost": 1.0,
				"preScale": 0.10,
				"peakScale": 0.28,
				"preDuration": 0.04,
				"burstDuration": 0.06,
				"settleDuration": 0.10,
				"push": 1.0,
			}


func _resolve_engage_accent_color(kind: String) -> Color:
	match _normalize_engage_kind(kind):
		ENGAGE_KIND_BATTLE:
			return Color(1.0, 0.45, 0.34, 0.96)
		ENGAGE_KIND_TILE_CONTROL:
			return Color(1.0, 0.82, 0.38, 0.93)
		ENGAGE_KIND_LOGISTICS:
			return Color(0.50, 0.82, 1.0, 0.90)
		_:
			return Color(1.0, 0.45, 0.34, 0.96)


static func _ensure_shared_frames_loaded() -> void:
	if _shared_loaded:
		return
	_shared_loaded = true
	_shared_frames_by_direction = {}
	var file := FileAccess.open(UNIT_MANIFEST_PATH, FileAccess.READ)
	if file == null:
		push_warning("[unit-marker] manifest missing: %s" % UNIT_MANIFEST_PATH)
		return
	var raw_text: String = file.get_as_text()
	file.close()
	var parsed: Variant = JSON.parse_string(raw_text)
	if not (parsed is Dictionary):
		push_warning("[unit-marker] manifest parse failed")
		return
	var manifest: Dictionary = parsed as Dictionary
	var raw_directions: Dictionary = manifest.get("directions", {}) as Dictionary
	for direction in DIRECTION_ORDER:
		var frame_list: Array = raw_directions.get(direction, []) as Array
		var cooked: Array = []
		for frame_variant in frame_list:
			if not (frame_variant is Dictionary):
				continue
			var frame: Dictionary = frame_variant as Dictionary
			var texture_path: String = str(frame.get("texturePath", "")).strip_edges()
			if texture_path == "":
				continue
			var texture: Texture2D = _shared_texture_cache.get(texture_path, null) as Texture2D
			if texture == null:
				texture = _load_texture_with_fallback(texture_path)
				if texture != null:
					_shared_texture_cache[texture_path] = texture
			if texture == null:
				continue
			cooked.append(
				{
					"name": str(frame.get("name", "")),
					"direction": direction,
					"sequence": int(frame.get("sequence", 0)),
					"texture": texture,
				}
			)
		_shared_frames_by_direction[direction] = cooked


static func _load_texture_with_fallback(res_path: String) -> Texture2D:
	var normalized_path: String = res_path.to_lower()
	if normalized_path.ends_with(".png") or normalized_path.ends_with(".jpg") or normalized_path.ends_with(".jpeg") or normalized_path.ends_with(".webp"):
		return _load_image_texture(res_path)

	var texture: Texture2D = load(res_path) as Texture2D
	if texture != null:
		return texture
	return _load_image_texture(res_path)


static func _load_image_texture(res_path: String) -> Texture2D:
	var abs_path: String = ProjectSettings.globalize_path(res_path)
	var image := Image.new()
	var image_err: Error = image.load(abs_path)
	if image_err != OK:
		push_warning("[unit-marker] image load fallback failed: %s (err=%d)" % [abs_path, int(image_err)])
		return null
	return ImageTexture.create_from_image(image)
