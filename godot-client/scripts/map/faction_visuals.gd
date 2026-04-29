extends RefCounted
class_name FactionVisuals

const COLOR_KEY_BLUE := "blue"
const COLOR_KEY_GREEN := "green"
const COLOR_KEY_PURPLE := "purple"
const COLOR_KEY_RED := "red"
const COLOR_KEY_YELLOW := "yellow"

const _AI_COLOR_KEYS: Array[String] = [
	COLOR_KEY_RED,
	COLOR_KEY_GREEN,
	COLOR_KEY_PURPLE,
	COLOR_KEY_YELLOW,
]

const _PALETTE_BY_KEY: Dictionary = {
	COLOR_KEY_BLUE: Color(0.36, 0.78, 0.98, 0.96),
	COLOR_KEY_GREEN: Color(0.56, 0.86, 0.42, 0.96),
	COLOR_KEY_PURPLE: Color(0.72, 0.60, 0.95, 0.96),
	COLOR_KEY_RED: Color(0.94, 0.46, 0.48, 0.96),
	COLOR_KEY_YELLOW: Color(0.98, 0.74, 0.30, 0.96),
}

const _NEUTRAL_HINTS: Array[String] = [
	"",
	"neutral",
	"npc",
	"world",
	"environment",
]


static func resolve_marker_color(faction_id: String, human_faction_id: String) -> Color:
	var color_key: String = resolve_color_key(faction_id, human_faction_id)
	return _PALETTE_BY_KEY.get(color_key, _PALETTE_BY_KEY[COLOR_KEY_BLUE]) as Color


static func resolve_color_key(faction_id: String, human_faction_id: String) -> String:
	var normalized_faction: String = _normalize_faction_id(faction_id)
	var normalized_human: String = _normalize_faction_id(human_faction_id)
	if normalized_faction != "" and normalized_faction == normalized_human:
		return COLOR_KEY_BLUE
	if normalized_faction in _NEUTRAL_HINTS:
		return COLOR_KEY_YELLOW
	return _AI_COLOR_KEYS[_stable_hash(normalized_faction) % _AI_COLOR_KEYS.size()]


static func resolve_flag_frame(
	overlay_texture_by_frame: Dictionary,
	faction_id: String,
	human_faction_id: String,
	city_level: int
) -> String:
	var level: int = clampi(city_level, 1, 5)
	var color_key: String = resolve_color_key(faction_id, human_faction_id)
	var preferred: String = "flag_%s_%d.png" % [color_key, level]
	if overlay_texture_by_frame.has(preferred):
		return preferred

	var fallback_primary: String = "flag_%s_3.png" % color_key
	if overlay_texture_by_frame.has(fallback_primary):
		return fallback_primary

	var fallback_outside: String = "out_flag_%s_3.png" % color_key
	if overlay_texture_by_frame.has(fallback_outside):
		return fallback_outside
	return ""


static func _normalize_faction_id(faction_id: String) -> String:
	return faction_id.strip_edges().to_lower()


static func _stable_hash(raw: String) -> int:
	if raw == "":
		return 0
	var hash_value: int = 0
	for index in raw.length():
		hash_value = int((hash_value * 33 + raw.unicode_at(index)) % 2147483647)
	return abs(hash_value)
