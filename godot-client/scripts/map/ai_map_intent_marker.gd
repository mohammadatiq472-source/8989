extends Node2D
class_name AIMapIntentMarker

const KIND_INTENT: String = "intent"
const KIND_OCCUPIED: String = "occupied"
const KIND_GATHERED: String = "gathered"

@export var radius: float = 16.0

var _kind: String = KIND_INTENT
var _status: String = "pending"
var _pulse: float = 0.0

func _ready() -> void:
	set_process(true)

func set_visual_state(kind: String, status: String = "pending") -> void:
	_kind = _normalize_kind(kind)
	_status = status.strip_edges()
	queue_redraw()

func _process(delta: float) -> void:
	_pulse = fmod(_pulse + delta, 1.0)
	queue_redraw()

func _draw() -> void:
	var color := _resolve_kind_color(_kind)
	var alpha_boost := 0.16 * sin(_pulse * TAU)
	color.a = clampf(color.a + alpha_boost, 0.32, 0.88)
	match _kind:
		KIND_OCCUPIED:
			_draw_occupied_marker(color)
		KIND_GATHERED:
			_draw_gathered_marker(color)
		_:
			_draw_intent_ring(color)

func _normalize_kind(kind: String) -> String:
	var normalized := kind.strip_edges()
	if normalized == KIND_OCCUPIED or normalized == KIND_GATHERED:
		return normalized
	return KIND_INTENT

func _resolve_kind_color(kind: String) -> Color:
	match kind:
		KIND_OCCUPIED:
			return Color(0.26, 0.68, 0.38, 0.62)
		KIND_GATHERED:
			return Color(0.90, 0.70, 0.20, 0.64)
		_:
			return Color(0.22, 0.52, 0.86, 0.66)

func _draw_intent_ring(color: Color) -> void:
	draw_arc(Vector2.ZERO, radius, deg_to_rad(-42.0), deg_to_rad(222.0), 34, color, 2.0)
	draw_arc(Vector2.ZERO, radius + 4.0, deg_to_rad(138.0), deg_to_rad(320.0), 24, Color(color.r, color.g, color.b, color.a * 0.56), 1.25)
	draw_circle(Vector2(radius, 0.0), 2.2, color)

func _draw_occupied_marker(color: Color) -> void:
	var points := PackedVector2Array([
		Vector2(0.0, -radius * 0.72),
		Vector2(radius * 0.72, 0.0),
		Vector2(0.0, radius * 0.72),
		Vector2(-radius * 0.72, 0.0),
	])
	draw_colored_polygon(points, Color(color.r, color.g, color.b, color.a * 0.34))
	for index in range(points.size()):
		var next_index := (index + 1) % points.size()
		draw_line(points[index], points[next_index], color, 2.0)

func _draw_gathered_marker(color: Color) -> void:
	draw_arc(Vector2.ZERO, radius * 0.82, 0.0, TAU, 26, color, 1.8)
	draw_line(Vector2(-radius * 0.42, 0.0), Vector2(radius * 0.42, 0.0), color, 2.0)
	draw_line(Vector2(0.0, -radius * 0.42), Vector2(0.0, radius * 0.42), color, 2.0)
