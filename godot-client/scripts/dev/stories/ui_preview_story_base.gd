@tool
extends Control
class_name UIPreviewStoryBase

signal story_navigation_requested(target_story_id: String, source_story_id: String, reason: String, request_payload: Dictionary)

const UiThemeTokensScript = preload("res://scripts/ui/ui_theme_tokens.gd")

@export var story_id: String = ""
@export var story_title: String = ""
@export_multiline var story_description: String = ""
@export var payload_path: String = ""

var _ui_theme_tokens = UiThemeTokensScript.new()
var _preview_payload: Dictionary = {}
var _preview_validation: Dictionary = {}
var _preview_capture_targets: Array = []
var _preview_data_source: Dictionary = {}
var _preview_adapter: Dictionary = {}
var _preview_states: Array = []
var _preview_state_index: int = 0
var _active_state: Dictionary = {}


func boot_preview_story() -> void:
	if payload_path.strip_edges() != "":
		var payload := load_preview_payload_from_path(payload_path)
		if not payload.is_empty():
			apply_preview_payload(payload)


func apply_preview_payload(payload: Dictionary) -> void:
	_preview_payload = payload.duplicate(true)
	_preview_validation = _normalize_validation(_preview_payload.get("validation", {}))
	_preview_capture_targets = _normalize_string_array(_preview_payload.get("captureTargets", []))
	_preview_data_source = _normalize_dictionary(_preview_payload.get("dataSource", {}))
	_preview_adapter = _normalize_dictionary(_preview_payload.get("adapter", {}))
	_preview_states = _normalize_states(_preview_payload.get("states", []))
	_preview_state_index = _resolve_state_index(_preview_payload, _preview_states)
	_active_state = _get_active_state()
	_apply_preview_payload()


func cycle_preview_state() -> void:
	if _preview_states.is_empty():
		return
	_preview_state_index = (_preview_state_index + 1) % _preview_states.size()
	_active_state = _get_active_state()
	_apply_preview_payload()


func request_story_navigation(target_story_id: String, reason: String = "", request_payload: Dictionary = {}) -> void:
	var normalized_target_story_id := str(target_story_id).strip_edges()
	if normalized_target_story_id == "":
		return
	var normalized_reason := str(reason).strip_edges()
	var payload_copy := request_payload.duplicate(true)
	var resolved_story_id := story_id.strip_edges()
	if resolved_story_id == "":
		resolved_story_id = str(_preview_payload.get("storyId", "")).strip_edges()
	story_navigation_requested.emit(normalized_target_story_id, resolved_story_id, normalized_reason, payload_copy)


func capture_targets() -> Array:
	var targets: Array = _preview_capture_targets.duplicate(true)
	var raw_targets: Variant = _active_state.get("captureTargets", _preview_payload.get("captureTargets", []))
	if raw_targets is Array:
		var active_targets := _normalize_string_array(raw_targets)
		if not active_targets.is_empty():
			return active_targets
	return targets


func get_preview_capture_targets() -> Array:
	return _preview_capture_targets.duplicate(true)


func get_preview_validation() -> Dictionary:
	return _preview_validation.duplicate(true)


func get_preview_data_source_meta() -> Dictionary:
	return _preview_data_source.duplicate(true)


func get_preview_adapter_meta() -> Dictionary:
	return _preview_adapter.duplicate(true)


func get_preview_context() -> Dictionary:
	var resolved_story_id := story_id
	if resolved_story_id.strip_edges() == "":
		resolved_story_id = str(_preview_payload.get("storyId", ""))
	return {
		"storyId": resolved_story_id,
		"activeStateId": get_active_state_id(),
		"captureTargets": get_preview_capture_targets(),
		"validation": get_preview_validation(),
		"dataSource": get_preview_data_source_meta(),
		"adapter": get_preview_adapter_meta(),
	}


func get_active_state_id() -> String:
	return str(_active_state.get("id", "default"))


func get_active_state_label() -> String:
	var label := str(_active_state.get("label", "")).strip_edges()
	if label != "":
		return label
	return get_active_state_id()


func load_preview_payload_from_path(file_path: String) -> Dictionary:
	var normalized_path := file_path.strip_edges()
	if normalized_path == "":
		return {}
	if not FileAccess.file_exists(normalized_path):
		push_warning("[ui-preview-story] payload missing: %s" % normalized_path)
		return {}
	var file := FileAccess.open(normalized_path, FileAccess.READ)
	if file == null:
		push_warning("[ui-preview-story] payload open failed: %s" % normalized_path)
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	file.close()
	if not (parsed is Dictionary):
		push_warning("[ui-preview-story] payload parse failed: %s" % normalized_path)
		return {}
	return parsed as Dictionary


func _apply_preview_payload() -> void:
	pass


func _normalize_states(raw_states: Variant) -> Array:
	var states: Array = []
	if raw_states is Array:
		for item in raw_states:
			if item is Dictionary:
				states.append((item as Dictionary).duplicate(true))
	return states


func _normalize_string_array(raw_values: Variant) -> Array:
	var values: Array = []
	if raw_values is Array:
		for item in raw_values:
			var value := str(item).strip_edges()
			if value != "":
				values.append(value)
	return values


func _normalize_validation(raw_validation: Variant) -> Dictionary:
	if raw_validation is Dictionary:
		return (raw_validation as Dictionary).duplicate(true)
	return {}


func _normalize_dictionary(raw_value: Variant) -> Dictionary:
	if raw_value is Dictionary:
		return (raw_value as Dictionary).duplicate(true)
	return {}


func _resolve_state_index(payload: Dictionary, states: Array) -> int:
	if states.is_empty():
		return 0
	var preferred_id := str(payload.get("activeStateId", "")).strip_edges()
	if preferred_id != "":
		for index in range(states.size()):
			var state: Dictionary = states[index] as Dictionary
			if str(state.get("id", "")) == preferred_id:
				return index
	var preferred_index := int(payload.get("activeStateIndex", 0))
	if preferred_index < 0:
		return 0
	if preferred_index >= states.size():
		return states.size() - 1
	return preferred_index


func _get_active_state() -> Dictionary:
	if _preview_states.is_empty():
		return _preview_payload.duplicate(true)
	return (_preview_states[_preview_state_index] as Dictionary).duplicate(true)


func _read_color(raw_color: Variant, fallback_color: Color) -> Color:
	if raw_color is Color:
		return raw_color as Color
	if raw_color is Dictionary:
		var color_dict: Dictionary = raw_color as Dictionary
		if color_dict.has("r") and color_dict.has("g") and color_dict.has("b"):
			return Color(
				float(color_dict.get("r", fallback_color.r)),
				float(color_dict.get("g", fallback_color.g)),
				float(color_dict.get("b", fallback_color.b)),
				float(color_dict.get("a", fallback_color.a))
			)
	return fallback_color


func _apply_panel_style(panel: PanelContainer, category: String, token_name: String) -> bool:
	return _ui_theme_tokens.apply_panel_style(panel, category, token_name)


func _apply_button_style(button: Button, token_name: String) -> bool:
	return _ui_theme_tokens.apply_button_style(button, token_name)


func _create_panel(parent: Node, node_name: String) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.name = node_name
	parent.add_child(panel)
	return panel


func _create_margin_container(parent: Node, node_name: String, left_margin: int = 0, top_margin: int = 0, right_margin: int = 0, bottom_margin: int = 0) -> MarginContainer:
	var margin := MarginContainer.new()
	margin.name = node_name
	margin.add_theme_constant_override("margin_left", left_margin)
	margin.add_theme_constant_override("margin_top", top_margin)
	margin.add_theme_constant_override("margin_right", right_margin)
	margin.add_theme_constant_override("margin_bottom", bottom_margin)
	parent.add_child(margin)
	return margin


func _create_vbox(parent: Node, node_name: String, separation: int = 0) -> VBoxContainer:
	var container := VBoxContainer.new()
	container.name = node_name
	container.add_theme_constant_override("separation", separation)
	parent.add_child(container)
	return container


func _create_hbox(parent: Node, node_name: String, separation: int = 0) -> HBoxContainer:
	var container := HBoxContainer.new()
	container.name = node_name
	container.add_theme_constant_override("separation", separation)
	parent.add_child(container)
	return container


func _create_label(parent: Node, node_name: String, text: String = "", font_size: int = 13) -> Label:
	var label := Label.new()
	label.name = node_name
	label.text = text
	label.add_theme_font_size_override("font_size", font_size)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	parent.add_child(label)
	return label


func _create_button(parent: Node, node_name: String, text: String = "", font_size: int = 14, minimum_width: float = 0.0) -> Button:
	var button := Button.new()
	button.name = node_name
	button.text = text
	button.add_theme_font_size_override("font_size", font_size)
	if minimum_width > 0.0:
		button.custom_minimum_size = Vector2(minimum_width, 0.0)
	parent.add_child(button)
	return button


func _create_color_rect(parent: Node, node_name: String, color: Color, height: float = 4.0) -> ColorRect:
	var rect := ColorRect.new()
	rect.name = node_name
	rect.color = color
	rect.custom_minimum_size = Vector2(0, height)
	parent.add_child(rect)
	return rect


func _create_spacer(parent: Node, node_name: String) -> Control:
	var spacer := Control.new()
	spacer.name = node_name
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(spacer)
	return spacer
