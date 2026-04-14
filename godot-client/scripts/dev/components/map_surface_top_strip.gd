@tool
extends Control
class_name MapSurfaceTopStrip

const UiThemeTokensScript = preload("res://scripts/ui/ui_theme_tokens.gd")

const SURFACE_SHELL_TEXTURE_PATH := "res://assets/themes/slgclient/current/ui/bg_window_6.png"
const SURFACE_TITLE_TEXTURE_PATH := "res://assets/themes/slgclient/current/ui/tipsbiaoti.png"
const SURFACE_SECTION_TEXTURE_PATH := "res://assets/themes/slgclient/current/ui/toast_bg.png"

const SAMPLE_STATE := {
	"headline": "Map Surface | resource strip preview",
	"roleName": "Han Vanguard",
	"rid": "RID-0001024",
	"tokenCount": 18,
	"resources": [
		{"key": "grain", "label": "谷", "value": 23000, "capacity": 30000},
		{"key": "wood", "label": "木", "value": 18200, "capacity": 26000},
		{"key": "iron", "label": "铁", "value": 11400, "capacity": 18000},
		{"key": "stone", "label": "石", "value": 9700, "capacity": 14000},
	],
	"yields": [
		{"key": "wood_yield", "label": "木+", "value": 210},
		{"key": "iron_yield", "label": "铁+", "value": 94},
		{"key": "stone_yield", "label": "石+", "value": 88},
		{"key": "grain_yield", "label": "谷+", "value": 145},
	],
	"statusBadges": ["Fixture", "Stable", "Frontline"],
}

var _ui_theme_tokens = UiThemeTokensScript.new()
var _shell_panel: PanelContainer
var _headline_label: Label
var _role_label: Label
var _rid_label: Label
var _token_label: Label
var _particle_flow: HFlowContainer
var _active_state: Dictionary = {}


func _ready() -> void:
	_build_shell()
	apply_preview_state(SAMPLE_STATE)


func apply_preview_state(state: Dictionary) -> void:
	if _shell_panel == null:
		_build_shell()
	var merged_state: Dictionary = _merge_preview_state(state)
	_active_state = merged_state.duplicate(true)
	_render_state(_active_state)


func _build_shell() -> void:
	if _shell_panel != null:
		return

	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	_shell_panel = PanelContainer.new()
	_shell_panel.name = "Shell"
	_shell_panel.anchor_left = 0.0
	_shell_panel.anchor_top = 0.0
	_shell_panel.anchor_right = 1.0
	_shell_panel.anchor_bottom = 0.0
	_shell_panel.offset_left = 20.0
	_shell_panel.offset_top = 10.0
	_shell_panel.offset_right = -20.0
	_shell_panel.offset_bottom = 60.0
	add_child(_shell_panel)
	_apply_surface_panel_style(_shell_panel, SURFACE_SHELL_TEXTURE_PATH, 16.0, "panel", "hud_bottom_bar")

	var shell_margin: MarginContainer = _create_margin_container(_shell_panel, "ShellMargin", 8, 3, 8, 3)
	shell_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var shell_vbox: VBoxContainer = _create_vbox(shell_margin, "ShellVBox", 2)
	shell_vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var title_band: PanelContainer = _create_panel(shell_vbox, "TitleBand")
	_apply_surface_panel_style(title_band, SURFACE_TITLE_TEXTURE_PATH, 12.0, "panel", "hud_top_left")
	title_band.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_band.custom_minimum_size = Vector2(0.0, 20.0)
	var title_margin: MarginContainer = _create_margin_container(title_band, "TitleMargin", 8, 1, 8, 1)
	title_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var title_row: HBoxContainer = _create_hbox(title_margin, "TitleRow", 6)
	title_row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	title_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_row.alignment = BoxContainer.ALIGNMENT_BEGIN
	var headline_chip: Label = _create_chip_label(title_row, "HeadlineChip", "主界面")
	headline_chip.add_theme_font_size_override("font_size", 9)
	headline_chip.modulate = Color(0.96, 0.99, 1.0, 0.96)
	_headline_label = _create_label(title_row, "HeadlineLabel", "", 13)
	_headline_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_headline_label.add_theme_font_size_override("font_size", 13)
	_headline_label.modulate = Color(0.72, 0.98, 0.92, 0.99)
	_headline_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	_headline_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	var identity_stack: HBoxContainer = _create_hbox(title_row, "IdentityStack", 5)
	identity_stack.size_flags_horizontal = Control.SIZE_SHRINK_END
	identity_stack.alignment = BoxContainer.ALIGNMENT_END
	_role_label = _create_chip_label(identity_stack, "RoleNameChip", "roleName: -")
	_rid_label = _create_chip_label(identity_stack, "RidChip", "rid: -")
	_token_label = _create_chip_label(identity_stack, "TokenCountChip", "tokenCount: -")

	var stats_band: PanelContainer = _create_panel(shell_vbox, "StatsBand")
	_apply_surface_panel_style(stats_band, SURFACE_SECTION_TEXTURE_PATH, 14.0, "panel", "hud_bottom_bar")
	stats_band.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stats_band.custom_minimum_size = Vector2(0.0, 22.0)
	var stats_margin: MarginContainer = _create_margin_container(stats_band, "StatsMargin", 6, 2, 6, 2)
	stats_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_particle_flow = HFlowContainer.new()
	_particle_flow.name = "ParticleFlow"
	_particle_flow.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_particle_flow.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_particle_flow.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_particle_flow.add_theme_constant_override("h_separation", 3)
	_particle_flow.add_theme_constant_override("v_separation", 1)
	stats_margin.add_child(_particle_flow)


func _render_state(state: Dictionary) -> void:
	var headline: String = _pick_string(state, "headline", str(SAMPLE_STATE.get("headline", "Map Surface")))
	var role_name: String = _pick_string(state, "roleName", str(SAMPLE_STATE.get("roleName", "Unknown")))
	var rid: String = _pick_string(state, "rid", str(SAMPLE_STATE.get("rid", "-")))
	var token_count: int = int(_pick_value(state, "tokenCount", SAMPLE_STATE.get("tokenCount", 0)))
	var accent_color: Color = _read_color(state.get("accentColor", null), Color(0.85, 0.92, 1.0, 0.92))

	_headline_label.text = headline
	_headline_label.modulate = accent_color

	_role_label.text = "君主 %s" % role_name
	_rid_label.text = "编号 %s" % rid
	_token_label.text = "令牌 %s" % _format_number(token_count)

	_rebuild_particle_row(_particle_flow, _resolve_resource_items(state), _resolve_yield_items(state), _resolve_status_badges(state))


func _merge_preview_state(state: Dictionary) -> Dictionary:
	var merged_state: Dictionary = SAMPLE_STATE.duplicate(true)
	if state.is_empty():
		return merged_state
	for key_variant in state.keys():
		var key := str(key_variant)
		var value: Variant = state.get(key_variant, null)
		if value is Dictionary:
			merged_state[key] = (value as Dictionary).duplicate(true)
		elif value is Array:
			merged_state[key] = _duplicate_array(value as Array)
		else:
			merged_state[key] = value
	return merged_state


func _resolve_resource_items(state: Dictionary) -> Array:
	var raw_items: Variant = state.get("resources", null)
	if raw_items is Array:
		return _duplicate_array(raw_items as Array)
	return _duplicate_array(SAMPLE_STATE.get("resources", []) as Array)


func _resolve_yield_items(state: Dictionary) -> Array:
	var raw_items: Variant = state.get("yields", null)
	if raw_items is Array:
		return _duplicate_array(raw_items as Array)
	return _duplicate_array(SAMPLE_STATE.get("yields", []) as Array)


func _resolve_status_badges(state: Dictionary) -> Array:
	var raw_badges: Variant = state.get("statusBadges", null)
	if raw_badges is Array:
		return _normalize_string_array(raw_badges as Array)
	return _normalize_string_array(SAMPLE_STATE.get("statusBadges", []) as Array)


func _rebuild_particle_row(flow: HFlowContainer, resources: Array, yields: Array, badges: Array) -> void:
	if flow == null:
		return
	_clear_children(flow)
	for item_variant in resources:
		if item_variant is not Dictionary:
			continue
		var item := item_variant as Dictionary
		var text := _format_metric_chip_text(item, true)
		if text == "":
			continue
		var chip := _create_chip_panel(flow, text, "hud_top_left", 8)
		chip.name = "Chip_%s" % str(item.get("key", text)).strip_edges()
	for item_variant in yields:
		if item_variant is not Dictionary:
			continue
		var item := item_variant as Dictionary
		var text := _format_metric_chip_text(item, false)
		if text == "":
			continue
		var chip := _create_chip_panel(flow, text, "hud_bottom_bar", 8)
		chip.name = "Yield_%s" % str(item.get("key", text)).strip_edges()
	for badge_variant in badges:
		var badge := str(badge_variant).strip_edges()
		if badge == "":
			continue
		_create_chip_panel(flow, badge, "observability_panel", 8)


func _create_chip_panel(parent: Node, text: String, token_name: String, font_size: int = 9) -> PanelContainer:
	var chip: PanelContainer = _create_panel(parent, "%sChip" % text.replace(" ", "_").replace("/", "_"))
	_apply_surface_panel_style(chip, SURFACE_SECTION_TEXTURE_PATH, 14.0, "panel", token_name)
	chip.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	var margin: MarginContainer = _create_margin_container(chip, "Margin", 4, 1, 4, 1)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var label: Label = _create_label(margin, "Text", text, font_size)
	label.autowrap_mode = TextServer.AUTOWRAP_OFF
	label.modulate = Color(0.99, 1.0, 1.0, 0.98)
	return chip


func _create_chip_label(parent: Node, node_name: String, text: String) -> Label:
	var chip: PanelContainer = _create_chip_panel(parent, text, "hud_top_left", 9)
	chip.name = node_name
	return chip.get_node("Margin/Text") as Label


func _format_metric_chip_text(item: Dictionary, is_resource_row: bool) -> String:
	var label_text: String = _pick_string(item, "label", _pick_string(item, "key", ""))
	var value_text: String = _format_number(item.get("value", ""))
	if label_text == "":
		return ""
	if is_resource_row:
		var capacity_value: Variant = item.get("capacity", null)
		if capacity_value != null and str(capacity_value).strip_edges() != "":
			return "%s %s/%s" % [label_text, value_text, _format_number(capacity_value)]
		return "%s %s" % [label_text, value_text]
	return "%s %s" % [label_text, value_text]


func _pick_string(state: Dictionary, key: String, fallback: String) -> String:
	var raw_value: Variant = state.get(key, null)
	if raw_value == null:
		return fallback
	var value := str(raw_value).strip_edges()
	if value == "":
		return fallback
	return value


func _pick_value(state: Dictionary, key: String, fallback: Variant) -> Variant:
	if not state.has(key):
		return fallback
	return state.get(key, fallback)


func _format_number(value: Variant) -> String:
	if value == null:
		return "-"
	if value is String:
		var text := (value as String).strip_edges()
		return text if text != "" else "-"
	if value is int:
		return _format_compact_number(float(value))
	if value is float:
		return _format_compact_number(float(value))
	return str(value)


func _format_compact_number(value: float) -> String:
	var abs_value := absf(value)
	if abs_value >= 100000000.0:
		return "%.1fB" % (value / 100000000.0)
	if abs_value >= 10000.0:
		return "%.1fK" % (value / 10000.0)
	if abs_value >= 1000.0:
		return "%.1fK" % (value / 1000.0)
	if floor(value) == value:
		return "%d" % int(value)
	return "%.1f" % value


func _normalize_string_array(values: Array) -> Array:
	var normalized: Array = []
	for item in values:
		var text := str(item).strip_edges()
		if text != "":
			normalized.append(text)
	return normalized


func _duplicate_array(values: Array) -> Array:
	var copied: Array = []
	for item in values:
		if item is Dictionary:
			copied.append((item as Dictionary).duplicate(true))
		elif item is Array:
			copied.append(_duplicate_array(item as Array))
		else:
			copied.append(item)
	return copied


func _clear_children(parent: Node) -> void:
	for child in parent.get_children():
		child.queue_free()


func _apply_panel_style(panel: PanelContainer, category: String, token_name: String) -> bool:
	return _ui_theme_tokens.apply_panel_style(panel, category, token_name)


func _apply_surface_panel_style(panel: PanelContainer, texture_path: String, texture_margin: float, fallback_category: String = "", fallback_token: String = "") -> bool:
	if panel == null:
		return false
	var stylebox := _build_surface_stylebox(texture_path, texture_margin)
	if stylebox != null:
		panel.add_theme_stylebox_override("panel", stylebox)
		return true
	if fallback_category != "" and fallback_token != "":
		return _apply_panel_style(panel, fallback_category, fallback_token)
	return false


func _build_surface_stylebox(texture_path: String, texture_margin: float) -> StyleBoxTexture:
	var texture := _load_surface_texture(texture_path)
	if texture == null:
		return null
	var stylebox := StyleBoxTexture.new()
	stylebox.texture = texture
	stylebox.texture_margin_left = texture_margin
	stylebox.texture_margin_top = texture_margin
	stylebox.texture_margin_right = texture_margin
	stylebox.texture_margin_bottom = texture_margin
	return stylebox


func _load_surface_texture(texture_path: String) -> Texture2D:
	var normalized_path := texture_path.strip_edges()
	if normalized_path == "":
		return null
	if not ResourceLoader.exists(normalized_path):
		return null
	var loaded_texture: Variant = load(normalized_path)
	if loaded_texture is Texture2D:
		return loaded_texture as Texture2D
	return null


func _create_panel(parent: Node, node_name: String) -> PanelContainer:
	var panel: PanelContainer = PanelContainer.new()
	panel.name = node_name
	parent.add_child(panel)
	return panel


func _create_margin_container(parent: Node, node_name: String, left_margin: int = 0, top_margin: int = 0, right_margin: int = 0, bottom_margin: int = 0) -> MarginContainer:
	var margin: MarginContainer = MarginContainer.new()
	margin.name = node_name
	margin.add_theme_constant_override("margin_left", left_margin)
	margin.add_theme_constant_override("margin_top", top_margin)
	margin.add_theme_constant_override("margin_right", right_margin)
	margin.add_theme_constant_override("margin_bottom", bottom_margin)
	parent.add_child(margin)
	return margin


func _create_vbox(parent: Node, node_name: String, separation: int = 0) -> VBoxContainer:
	var container: VBoxContainer = VBoxContainer.new()
	container.name = node_name
	container.add_theme_constant_override("separation", separation)
	parent.add_child(container)
	return container


func _create_hbox(parent: Node, node_name: String, separation: int = 0) -> HBoxContainer:
	var container: HBoxContainer = HBoxContainer.new()
	container.name = node_name
	container.add_theme_constant_override("separation", separation)
	parent.add_child(container)
	return container


func _create_label(parent: Node, node_name: String, text: String = "", font_size: int = 13) -> Label:
	var label: Label = Label.new()
	label.name = node_name
	label.text = text
	label.add_theme_font_size_override("font_size", font_size)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	parent.add_child(label)
	return label


func _create_color_rect(parent: Node, node_name: String, color: Color, height: float = 4.0) -> ColorRect:
	var rect: ColorRect = ColorRect.new()
	rect.name = node_name
	rect.color = color
	rect.custom_minimum_size = Vector2(0.0, height)
	parent.add_child(rect)
	return rect


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
