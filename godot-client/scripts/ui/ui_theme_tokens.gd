extends RefCounted
class_name UiThemeTokens

const DEFAULT_MANIFEST_PATH := "res://assets/themes/slgclient/manifests/ui_theme_tokens.json"

const CATEGORY_PANEL := "panel"
const CATEGORY_BUTTON := "button"
const CATEGORY_FRAME := "frame"
const CATEGORY_ICON := "icon"

const _DEFAULT_TOKEN_TABLE: Dictionary = {
	CATEGORY_PANEL: {
		"hud_top_left": {
			"bgColor": {"r": 0.045, "g": 0.060, "b": 0.070, "a": 0.88},
			"borderColor": {"r": 0.430, "g": 0.520, "b": 0.470, "a": 0.52},
			"borderWidth": 1,
			"radius": 5,
			"margin": 12.0,
		},
		"hud_bottom_bar": {
			"bgColor": {"r": 0.035, "g": 0.045, "b": 0.050, "a": 0.82},
			"borderColor": {"r": 0.600, "g": 0.500, "b": 0.300, "a": 0.42},
			"borderWidth": 1,
			"radius": 4,
			"margin": 10.0,
		},
		"observability_panel": {
			"bgColor": {"r": 0.030, "g": 0.040, "b": 0.048, "a": 0.94},
			"borderColor": {"r": 0.450, "g": 0.590, "b": 0.560, "a": 0.62},
			"borderWidth": 1,
			"radius": 6,
			"margin": 16.0,
		},
	},
	CATEGORY_BUTTON: {
		"refresh": {
			"bgColor": {"r": 0.340, "g": 0.240, "b": 0.090, "a": 0.94},
			"borderColor": {"r": 0.780, "g": 0.600, "b": 0.260, "a": 0.88},
			"borderWidth": 1,
			"radius": 5,
			"margin": 8.0,
		},
		"advance_tick": {
			"bgColor": {"r": 0.360, "g": 0.100, "b": 0.075, "a": 0.94},
			"borderColor": {"r": 0.840, "g": 0.400, "b": 0.260, "a": 0.82},
			"borderWidth": 1,
			"radius": 5,
			"margin": 8.0,
		},
		"export": {
			"bgColor": {"r": 0.105, "g": 0.125, "b": 0.135, "a": 0.94},
			"borderColor": {"r": 0.450, "g": 0.500, "b": 0.520, "a": 0.72},
			"borderWidth": 1,
			"radius": 5,
			"margin": 8.0,
		},
	},
	CATEGORY_FRAME: {
		"observability_section": {
			"bgColor": {"r": 0.050, "g": 0.060, "b": 0.066, "a": 0.78},
			"borderColor": {"r": 0.330, "g": 0.440, "b": 0.470, "a": 0.44},
			"borderWidth": 1,
			"radius": 4,
			"margin": 10.0,
		},
	},
	CATEGORY_ICON: {
		"ws_state_connected": {
			"color": {"r": 0.24, "g": 0.75, "b": 0.32, "a": 1.0},
		},
		"ws_state_connecting": {
			"color": {"r": 0.95, "g": 0.72, "b": 0.20, "a": 1.0},
		},
		"ws_state_disconnected": {
			"color": {"r": 0.90, "g": 0.28, "b": 0.24, "a": 1.0},
		},
	},
}

var _loaded: bool = false
var _token_table: Dictionary = {}
var _texture_cache: Dictionary = {}


func _init() -> void:
	_token_table = _DEFAULT_TOKEN_TABLE.duplicate(true)


func apply_panel_style(panel: PanelContainer, category: String, token_name: String) -> bool:
	if panel == null:
		return false
	var style: StyleBox = resolve_stylebox(category, token_name)
	if style == null:
		return false
	panel.add_theme_stylebox_override("panel", style)
	return true


func apply_button_style(button: Button, token_name: String) -> bool:
	if button == null:
		return false
	var style: StyleBox = resolve_stylebox(CATEGORY_BUTTON, token_name)
	if style == null:
		return false
	button.add_theme_stylebox_override("normal", style)
	button.add_theme_stylebox_override("hover", style)
	button.add_theme_stylebox_override("pressed", style)
	button.add_theme_stylebox_override("disabled", style)
	button.add_theme_stylebox_override("focus", style)
	return true


func resolve_stylebox(category: String, token_name: String) -> StyleBox:
	_ensure_loaded()
	var token_entry: Dictionary = _resolve_token_entry(category, token_name)
	if token_entry.is_empty():
		push_warning("[ui-theme-tokens] missing style token: %s/%s" % [category, token_name])
		return null

	var texture_path: String = str(token_entry.get("texturePath", "")).strip_edges()
	var fallback_texture_path: String = str(token_entry.get("fallbackTexturePath", "")).strip_edges()
	var margin: float = float(token_entry.get("margin", 0.0))
	if texture_path != "" or fallback_texture_path != "":
		var texture: Texture2D = _load_texture(texture_path)
		if texture == null and fallback_texture_path != "":
			texture = _load_texture(fallback_texture_path)
		if texture != null:
			var texture_style := StyleBoxTexture.new()
			texture_style.texture = texture
			texture_style.texture_margin_left = margin
			texture_style.texture_margin_top = margin
			texture_style.texture_margin_right = margin
			texture_style.texture_margin_bottom = margin
			return texture_style
	return _build_flat_stylebox(token_entry, margin)


func _build_flat_stylebox(token_entry: Dictionary, margin: float) -> StyleBoxFlat:
	var flat_style := StyleBoxFlat.new()
	flat_style.bg_color = _read_color(token_entry.get("bgColor", null), Color(0.05, 0.06, 0.07, 0.90))
	flat_style.border_color = _read_color(token_entry.get("borderColor", null), Color(0.42, 0.48, 0.50, 0.56))
	flat_style.set_border_width_all(int(token_entry.get("borderWidth", 1)))
	flat_style.set_corner_radius_all(int(token_entry.get("radius", 4)))
	flat_style.content_margin_left = margin
	flat_style.content_margin_top = margin
	flat_style.content_margin_right = margin
	flat_style.content_margin_bottom = margin
	return flat_style


func resolve_color(category: String, token_name: String) -> Color:
	_ensure_loaded()
	var token_entry: Dictionary = _resolve_token_entry(category, token_name)
	if token_entry.is_empty():
		push_warning("[ui-theme-tokens] missing color token: %s/%s" % [category, token_name])
		return Color.WHITE
	return _read_color(token_entry.get("color", null), Color.WHITE)


func _ensure_loaded() -> void:
	if _loaded:
		return
	_loaded = true
	var manifest_path: String = _normalize_resource_path(DEFAULT_MANIFEST_PATH)
	if manifest_path == "":
		return
	if not FileAccess.file_exists(ProjectSettings.globalize_path(manifest_path)):
		push_warning("[ui-theme-tokens] manifest missing, using built-in defaults: %s" % manifest_path)
		return

	var manifest_file := FileAccess.open(manifest_path, FileAccess.READ)
	if manifest_file == null:
		push_warning("[ui-theme-tokens] manifest open failed, using built-in defaults: %s" % manifest_path)
		return

	var parsed: Variant = JSON.parse_string(manifest_file.get_as_text())
	manifest_file.close()
	if not (parsed is Dictionary):
		push_warning("[ui-theme-tokens] manifest parse failed, using built-in defaults: %s" % manifest_path)
		return

	var manifest: Dictionary = parsed as Dictionary
	var raw_tokens_variant: Variant = manifest.get("tokens", manifest.get("uiTokens", {}))
	if not (raw_tokens_variant is Dictionary):
		push_warning("[ui-theme-tokens] manifest tokens missing or invalid, using built-in defaults: %s" % manifest_path)
		return

	_merge_token_table(raw_tokens_variant as Dictionary)


func _merge_token_table(raw_tokens: Dictionary) -> void:
	for category_variant in raw_tokens.keys():
		var category: String = str(category_variant)
		var raw_category_variant: Variant = raw_tokens.get(category_variant, {})
		if not (raw_category_variant is Dictionary):
			continue
		var raw_category: Dictionary = raw_category_variant as Dictionary
		var category_table: Dictionary = _token_table.get(category, {}).duplicate(true)
		for token_variant in raw_category.keys():
			var token_name: String = str(token_variant)
			var raw_token_variant: Variant = raw_category.get(token_variant, {})
			if not (raw_token_variant is Dictionary):
				continue
			var raw_token: Dictionary = raw_token_variant as Dictionary
			var merged_token: Dictionary = {}
			if category_table.has(token_name) and category_table.get(token_name) is Dictionary:
				merged_token = (category_table.get(token_name) as Dictionary).duplicate(true)
			for field_variant in raw_token.keys():
				merged_token[str(field_variant)] = raw_token[field_variant]
			category_table[token_name] = merged_token
		_token_table[category] = category_table


func _resolve_token_entry(category: String, token_name: String) -> Dictionary:
	var category_table_variant: Variant = _token_table.get(category, {})
	if not (category_table_variant is Dictionary):
		return {}
	var category_table: Dictionary = category_table_variant as Dictionary
	var token_entry_variant: Variant = category_table.get(token_name, {})
	if not (token_entry_variant is Dictionary):
		return {}
	return token_entry_variant as Dictionary


func _load_texture(res_path: String) -> Texture2D:
	var normalized_path: String = _normalize_resource_path(res_path)
	if normalized_path == "":
		return null
	var cached_texture: Variant = _texture_cache.get(normalized_path, null)
	if cached_texture is Texture2D:
		return cached_texture as Texture2D
	var absolute_path: String = _resource_path_to_absolute(normalized_path)
	if absolute_path == "":
		return null
	if not FileAccess.file_exists(absolute_path):
		return null
	var image := Image.new()
	var image_err: Error = image.load(absolute_path)
	if image_err != OK:
		push_warning("[ui-theme-tokens] texture load failed: %s (err=%d)" % [absolute_path, int(image_err)])
		return null
	var texture: Texture2D = ImageTexture.create_from_image(image)
	_texture_cache[normalized_path] = texture
	return texture


func _read_color(raw_color: Variant, fallback_color: Color) -> Color:
	if raw_color is Color:
		return raw_color as Color
	if raw_color is Dictionary:
		var color_dict: Dictionary = raw_color as Dictionary
		if color_dict.has("r") and color_dict.has("g") and color_dict.has("b"):
			var r: float = float(color_dict.get("r", fallback_color.r))
			var g: float = float(color_dict.get("g", fallback_color.g))
			var b: float = float(color_dict.get("b", fallback_color.b))
			var a: float = float(color_dict.get("a", fallback_color.a))
			return Color(r, g, b, a)
	return fallback_color


func _normalize_resource_path(raw_path: String) -> String:
	var path: String = raw_path.strip_edges()
	if path == "":
		return ""
	if path.begins_with("res://") or path.begins_with("user://"):
		return path
	if path.begins_with("godot-client/"):
		return "res://" + path.substr("godot-client/".length())
	return path


func _resource_path_to_absolute(res_path: String) -> String:
	var path: String = _normalize_resource_path(res_path)
	if path == "":
		return ""
	if path.begins_with("res://") or path.begins_with("user://"):
		return ProjectSettings.globalize_path(path)
	return path
