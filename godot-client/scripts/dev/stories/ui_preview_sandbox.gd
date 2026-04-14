@tool
extends "res://scripts/dev/stories/ui_preview_story_base.gd"
class_name UIPreviewSandbox

const STORY_MANIFEST_PATH := "res://data/ui_preview/stories/stories_manifest.json"
const EDITOR_START_STORY_SETTING := "ui_preview_sandbox/start_story_id"
const EDITOR_START_SOURCE_SETTING := "ui_preview_sandbox/start_source_mode"
const EDITOR_START_VIEWPORT_SETTING := "ui_preview_sandbox/start_viewport_id"
const ENV_START_STORY_ID := "SLG_UI_PREVIEW_START_STORY_ID"
const ENV_START_SOURCE_MODE := "SLG_UI_PREVIEW_START_SOURCE_MODE"
const ENV_START_VIEWPORT_ID := "SLG_UI_PREVIEW_START_VIEWPORT_ID"
const ENV_HEADLESS_ACTIVE_ONLY := "SLG_UI_PREVIEW_HEADLESS_ACTIVE_ONLY"
const UIPreviewDataAdapterScript = preload("res://scripts/dev/data/ui_preview_data_adapter.gd")

var _manifest: Dictionary = {}
var _story_catalog: Array = []
var _story_by_id: Dictionary = {}
var _active_story_id: String = ""
var _active_story_info: Dictionary = {}
var _active_story_node: Node
var _story_host: Control
var _story_list: VBoxContainer
var _story_title_label: Label
var _story_description_label: Label
var _story_meta_label: Label
var _story_capture_label: Label
var _data_source_meta_label: Label
var _data_source_status_label: Label
var _data_source_list: HBoxContainer
var _viewport_meta_label: Label
var _viewport_list: HBoxContainer
var _cycle_button: Button
var _reload_button: Button
var _refresh_manifest_button: Button
var _viewport_catalog: Array = []
var _viewport_by_id: Dictionary = {}
var _active_viewport_id: String = ""
var _data_source_catalog: Array = []
var _data_source_by_id: Dictionary = {}
var _active_source_mode: String = "fixture"
var _data_adapter: UIPreviewDataAdapter
var _sidebar_panel: Control
var _presentation_capture_mode: bool = false
var _pending_navigation_payload: Dictionary = {}


func _ready() -> void:
	_build_ui()
	_load_manifest()
	_rebuild_story_buttons()
	_rebuild_viewport_buttons()
	var start_viewport_id := _resolve_start_override(EDITOR_START_VIEWPORT_SETTING, ENV_START_VIEWPORT_ID, get_default_viewport_id())
	if start_viewport_id != "":
		select_viewport_by_id(start_viewport_id)
	var start_story_id := _resolve_start_override(EDITOR_START_STORY_SETTING, ENV_START_STORY_ID, get_default_story_id())
	await _activate_story(start_story_id)
	var start_source_mode := _resolve_start_override(EDITOR_START_SOURCE_SETTING, ENV_START_SOURCE_MODE, _active_source_mode)
	if start_source_mode != "":
		await select_data_source_by_id(start_source_mode)
	if OS.has_feature("headless") or DisplayServer.get_name() == "headless":
		call_deferred("_run_headless_smoke")


func _build_ui() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var root := _create_hbox(self, "Root", 18)
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	_sidebar_panel = _create_panel(root, "Sidebar")
	_sidebar_panel.custom_minimum_size = Vector2(320, 0)
	_sidebar_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_apply_panel_style(_sidebar_panel, "panel", "hud_top_left")
	var sidebar_margin := _create_margin_container(_sidebar_panel, "SidebarMargin", 18, 18, 18, 18)
	sidebar_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var sidebar_vbox := _create_vbox(sidebar_margin, "SidebarVBox", 12)
	sidebar_vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_create_label(sidebar_vbox, "Title", "SLG UI Preview Sandbox", 22)
	_create_label(
		sidebar_vbox,
		"Subtitle",
		"Storybook-style preview host for HUD token, observability, and panel stack payloads.",
		14
	)
	_story_meta_label = _create_label(sidebar_vbox, "StoryMeta", "manifest: loading...", 13)
	_story_title_label = _create_label(sidebar_vbox, "StoryTitle", "Story: none", 18)
	_story_description_label = _create_label(sidebar_vbox, "StoryDescription", "Select a story to begin.", 14)
	_story_capture_label = _create_label(sidebar_vbox, "CaptureTargets", "Capture targets: none", 13)
	_data_source_meta_label = _create_label(sidebar_vbox, "DataSourceMeta", "Data source: fixture", 13)
	_data_source_status_label = _create_label(sidebar_vbox, "DataSourceStatus", "Adapter: idle", 13)
	_data_source_list = _create_hbox(sidebar_vbox, "DataSourceList", 8)
	_viewport_meta_label = _create_label(sidebar_vbox, "ViewportMeta", "Viewport: desktop", 13)
	_viewport_list = _create_hbox(sidebar_vbox, "ViewportList", 8)

	_story_list = _create_vbox(sidebar_vbox, "StoryList", 8)
	_story_list.size_flags_vertical = Control.SIZE_EXPAND_FILL

	var action_row := _create_vbox(sidebar_vbox, "ActionRow", 8)
	_cycle_button = _create_button(action_row, "CycleButton", "Cycle Preview State", 14, 0)
	_reload_button = _create_button(action_row, "ReloadButton", "Reload Story Payload", 14, 0)
	_refresh_manifest_button = _create_button(action_row, "RefreshManifestButton", "Refresh Manifest", 14, 0)
	_apply_button_style(_cycle_button, "advance_tick")
	_apply_button_style(_reload_button, "refresh")
	_apply_button_style(_refresh_manifest_button, "export")
	_cycle_button.pressed.connect(_on_cycle_pressed)
	_reload_button.pressed.connect(_on_reload_pressed)
	_refresh_manifest_button.pressed.connect(_on_refresh_manifest_pressed)

	var host_panel := _create_panel(root, "PreviewPane")
	host_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	host_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_apply_panel_style(host_panel, "panel", "observability_panel")
	var host_margin := _create_margin_container(host_panel, "HostMargin", 18, 18, 18, 18)
	host_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_story_host = Control.new()
	_story_host.name = "StoryHost"
	_story_host.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_story_host.size_flags_vertical = Control.SIZE_EXPAND_FILL
	host_margin.add_child(_story_host)
	_story_host.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)


func _load_manifest() -> void:
	_manifest = load_preview_payload_from_path(STORY_MANIFEST_PATH)
	_story_catalog = []
	_story_by_id = {}
	_viewport_catalog = []
	_viewport_by_id = {}
	_data_source_catalog = []
	_data_source_by_id = {}
	if _manifest.is_empty():
		_story_meta_label.text = "manifest: missing"
		_data_source_meta_label.text = "Data source: missing"
		_data_source_status_label.text = "Adapter: manifest missing"
		_viewport_meta_label.text = "Viewport: missing"
		return
	var raw_viewports: Variant = _manifest.get("viewportPresets", [])
	if raw_viewports is Array:
		for item in raw_viewports:
			if not (item is Dictionary):
				continue
			var viewport_info: Dictionary = (item as Dictionary).duplicate(true)
			_viewport_catalog.append(viewport_info)
			var viewport_id := str(viewport_info.get("id", "")).strip_edges()
			if viewport_id != "":
				_viewport_by_id[viewport_id] = viewport_info
	var raw_stories: Variant = _manifest.get("stories", [])
	if raw_stories is Array:
		for item in raw_stories:
			if not (item is Dictionary):
				continue
			var story_info: Dictionary = (item as Dictionary).duplicate(true)
			_story_catalog.append(story_info)
			var story_id := str(story_info.get("id", "")).strip_edges()
			if story_id != "":
				_story_by_id[story_id] = story_info
	_story_meta_label.text = "manifest: %s stories" % _story_catalog.size()
	_activate_viewport(get_default_viewport_id())


func get_story_ids() -> Array:
	var story_ids: Array = []
	for story_info in _story_catalog:
		var story_id := str(story_info.get("id", "")).strip_edges()
		if story_id != "":
			story_ids.append(story_id)
	return story_ids


func get_viewport_ids() -> Array:
	var viewport_ids: Array = []
	for viewport_info in _viewport_catalog:
		var viewport_id := str(viewport_info.get("id", "")).strip_edges()
		if viewport_id != "":
			viewport_ids.append(viewport_id)
	return viewport_ids


func get_default_story_id() -> String:
	var default_story_id := str(_manifest.get("defaultStoryId", "hud_token")).strip_edges()
	if default_story_id == "":
		default_story_id = "hud_token"
	return default_story_id


func get_default_viewport_id() -> String:
	var default_viewport_id := str(_manifest.get("defaultViewportId", "desktop")).strip_edges()
	if default_viewport_id == "":
		default_viewport_id = "desktop"
	return default_viewport_id


func get_available_source_modes() -> Array:
	var source_modes: Array = []
	for source_info in _data_source_catalog:
		var source_id := str(source_info.get("id", "")).strip_edges()
		if source_id != "":
			source_modes.append(source_id)
	return source_modes


func _rebuild_story_buttons() -> void:
	for child in _story_list.get_children():
		child.queue_free()
	for story_info in _story_catalog:
		var story_id := str(story_info.get("id", "")).strip_edges()
		if story_id == "":
			continue
		var button := _create_button(_story_list, "StoryButton_%s" % story_id, str(story_info.get("title", story_id)), 14, 0)
		button.toggle_mode = true
		var story_ref := story_id
		button.pressed.connect(Callable(self, "_on_story_button_pressed").bind(story_ref))
		if story_id == _active_story_id:
			button.button_pressed = true
			_apply_button_style(button, "refresh")


func _rebuild_viewport_buttons() -> void:
	for child in _viewport_list.get_children():
		child.queue_free()
	for viewport_info in _viewport_catalog:
		var viewport_id := str(viewport_info.get("id", "")).strip_edges()
		if viewport_id == "":
			continue
		var button := _create_button(_viewport_list, "ViewportButton_%s" % viewport_id, str(viewport_info.get("title", viewport_id)), 14, 0)
		button.toggle_mode = true
		var viewport_ref := viewport_id
		button.pressed.connect(Callable(self, "_on_viewport_button_pressed").bind(viewport_ref))
		if viewport_id == _active_viewport_id:
			button.button_pressed = true
			_apply_button_style(button, "export")


func _rebuild_data_source_buttons() -> void:
	for child in _data_source_list.get_children():
		child.queue_free()
	for source_info in _data_source_catalog:
		var source_id := str(source_info.get("id", "")).strip_edges()
		if source_id == "":
			continue
		var button := _create_button(_data_source_list, "DataSourceButton_%s" % source_id, str(source_info.get("title", source_id)), 14, 0)
		button.toggle_mode = true
		var source_ref := source_id
		button.pressed.connect(Callable(self, "_on_data_source_button_pressed").bind(source_ref))
		if source_id == _active_source_mode:
			button.button_pressed = true
			_apply_button_style(button, "advance_tick")


func _activate_viewport(viewport_id: String) -> void:
	var normalized_viewport_id := viewport_id.strip_edges()
	if normalized_viewport_id == "":
		return
	var viewport_info: Dictionary = _viewport_by_id.get(normalized_viewport_id, {}) as Dictionary
	if viewport_info.is_empty():
		push_warning("[ui-preview-sandbox] unknown viewport: %s" % normalized_viewport_id)
		return
	_active_viewport_id = normalized_viewport_id
	_apply_viewport_preset(viewport_info)
	_refresh_story_meta()
	_rebuild_viewport_buttons()


func select_story_by_id(story_id: String) -> bool:
	var normalized_story_id := story_id.strip_edges()
	if normalized_story_id == "":
		return false
	if not _story_by_id.has(normalized_story_id):
		return false
	await _activate_story(normalized_story_id)
	return _active_story_id == normalized_story_id


func select_viewport_by_id(viewport_id: String) -> bool:
	var normalized_viewport_id := viewport_id.strip_edges()
	if normalized_viewport_id == "":
		return false
	if not _viewport_by_id.has(normalized_viewport_id):
		return false
	_activate_viewport(normalized_viewport_id)
	return _active_viewport_id == normalized_viewport_id


func reload_story_payload() -> void:
	await _apply_story_payload()


func get_active_story_id() -> String:
	return _active_story_id


func get_active_story_node() -> Node:
	return _active_story_node


func get_active_viewport_id() -> String:
	return _active_viewport_id


func get_active_source_mode() -> String:
	return _active_source_mode


func get_preview_context() -> Dictionary:
	var story_context: Dictionary = {}
	if _active_story_node != null and _active_story_node.has_method("get_preview_context"):
		story_context = _active_story_node.call("get_preview_context") as Dictionary
	return {
		"storyId": _active_story_id,
		"viewportId": _active_viewport_id,
		"sourceMode": _active_source_mode,
		"story": story_context,
	}


func _select_story_by_id(story_id: String) -> void:
	await select_story_by_id(story_id)


func _select_viewport_by_id(viewport_id: String) -> void:
	select_viewport_by_id(viewport_id)


func _select_source_mode(source_mode: String) -> void:
	await select_data_source_by_id(source_mode)


func _apply_viewport_preset(viewport_info: Dictionary) -> void:
	var width := int(viewport_info.get("width", 0))
	var height := int(viewport_info.get("height", 0))
	if width > 0 and height > 0:
		_story_host.custom_minimum_size = Vector2(width, height)
		_story_host.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_story_host.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_viewport_meta_label.text = "Viewport: %s (%dx%d)" % [str(viewport_info.get("title", _active_viewport_id)), width, height]


func select_data_source_by_id(source_mode: String) -> bool:
	var normalized_source_mode := str(source_mode).strip_edges().to_lower()
	if normalized_source_mode == "":
		return false
	if not _data_source_by_id.has(normalized_source_mode):
		return false
	_active_source_mode = normalized_source_mode
	await _apply_story_payload()
	_rebuild_data_source_buttons()
	return _active_source_mode == normalized_source_mode


func _activate_story(story_id: String) -> void:
	var normalized_story_id := story_id.strip_edges()
	if normalized_story_id == "":
		return
	var story_info: Dictionary = _story_by_id.get(normalized_story_id, {}) as Dictionary
	if story_info.is_empty():
		push_warning("[ui-preview-sandbox] unknown story: %s" % normalized_story_id)
		return
	_active_story_id = normalized_story_id
	_active_story_info = story_info.duplicate(true)
	_set_story_data_sources(story_info)
	_load_story_scene(story_info)
	await _apply_story_payload()
	_refresh_story_meta()
	_rebuild_story_buttons()
	_rebuild_data_source_buttons()
	_apply_viewport_preset(_viewport_by_id.get(_active_viewport_id, {}) as Dictionary)


func _load_story_scene(story_info: Dictionary) -> void:
	for child in _story_host.get_children():
		child.queue_free()
	_active_story_node = null
	var scene_path := str(story_info.get("scenePath", "")).strip_edges()
	if scene_path == "":
		return
	var packed_scene: PackedScene = load(scene_path) as PackedScene
	if packed_scene == null:
		push_warning("[ui-preview-sandbox] failed to load scene: %s" % scene_path)
		return
	_active_story_node = packed_scene.instantiate()
	_story_host.add_child(_active_story_node)
	if _active_story_node is Control:
		var story_control := _active_story_node as Control
		story_control.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_bind_story_navigation_handler()
	_apply_presentation_capture_mode()


func _bind_story_navigation_handler() -> void:
	if _active_story_node == null or not is_instance_valid(_active_story_node):
		return
	if not _active_story_node.has_signal("story_navigation_requested"):
		return
	var nav_callback := Callable(self, "_on_story_navigation_requested")
	if _active_story_node.is_connected("story_navigation_requested", nav_callback):
		return
	_active_story_node.connect("story_navigation_requested", nav_callback)


func _apply_story_payload() -> void:
	if _active_story_node == null:
		return
	var payload_path := str(_active_story_info.get("payloadPath", "")).strip_edges()
	if _data_adapter == null:
		_data_adapter = UIPreviewDataAdapterScript.new()
		add_child(_data_adapter)
	var source_modes := get_available_source_modes()
	_data_adapter.configure(
		_active_story_id,
		str(_active_story_info.get("title", _active_story_id)),
		str(_active_story_info.get("description", "")),
		payload_path,
		_active_source_mode,
		AppConfig.backend_base_url,
		source_modes
	)
	var payload: Dictionary = await _data_adapter.load_story_payload()
	if payload.is_empty():
		_pending_navigation_payload = {}
		return
	payload = _apply_pending_navigation_payload(payload)
	if _active_story_node.has_method("apply_preview_payload"):
		_active_story_node.call("apply_preview_payload", payload)
	_pending_navigation_payload = {}
	_refresh_story_meta()
	_apply_presentation_capture_mode()


func _on_story_navigation_requested(target_story_id: String, source_story_id: String, reason: String, request_payload: Dictionary) -> void:
	var normalized_target_story_id := str(target_story_id).strip_edges()
	if normalized_target_story_id == "":
		return
	if not _story_by_id.has(normalized_target_story_id):
		push_warning("[ui-preview-sandbox] navigation target missing: %s" % normalized_target_story_id)
		return
	var normalized_source_story_id := str(source_story_id).strip_edges()
	var normalized_reason := str(reason).strip_edges()
	var payload_snapshot := request_payload.duplicate(true)
	if normalized_source_story_id != "" and not payload_snapshot.has("sourceStoryId"):
		payload_snapshot["sourceStoryId"] = normalized_source_story_id
	if normalized_reason != "" and not payload_snapshot.has("navigationReason"):
		payload_snapshot["navigationReason"] = normalized_reason
	_pending_navigation_payload = payload_snapshot.duplicate(true)
	print(
		"[ui-preview-sandbox] navigation requested source=%s target=%s reason=%s payload=%s"
		% [normalized_source_story_id, normalized_target_story_id, normalized_reason, JSON.stringify(payload_snapshot)]
	)
	call_deferred("_activate_requested_story", normalized_target_story_id)


func _activate_requested_story(story_id: String) -> void:
	await select_story_by_id(story_id)


func _apply_pending_navigation_payload(payload: Dictionary) -> Dictionary:
	if _pending_navigation_payload.is_empty():
		return payload
	var merged_payload := payload.duplicate(true)
	var navigation_context := _pending_navigation_payload.duplicate(true)
	merged_payload["navigationContext"] = navigation_context
	var preferred_state_id := str(navigation_context.get("activeStateId", "")).strip_edges()
	if preferred_state_id == "":
		preferred_state_id = str(navigation_context.get("targetStateId", "")).strip_edges()
	if preferred_state_id != "":
		merged_payload["activeStateId"] = preferred_state_id
	if navigation_context.has("activeStateIndex"):
		merged_payload["activeStateIndex"] = int(navigation_context.get("activeStateIndex", 0))
	return merged_payload


func _refresh_story_meta() -> void:
	var title := str(_active_story_info.get("title", _active_story_id))
	var description := str(_active_story_info.get("description", ""))
	var payload_path := str(_active_story_info.get("payloadPath", ""))
	var capture_target_count := 0
	var validation_kind := "none"
	var validation_state_count := 0
	var requested_source_mode := _active_source_mode
	var effective_source_mode := _active_source_mode
	var adapter_state := "idle"
	var adapter_reason := "configured"
	if _active_story_info.has("captureTargets") and _active_story_info.get("captureTargets") is Array:
		capture_target_count = (_active_story_info.get("captureTargets") as Array).size()
	if _active_story_info.has("validation") and _active_story_info.get("validation") is Dictionary:
		var validation: Dictionary = _active_story_info.get("validation") as Dictionary
		validation_kind = str(validation.get("kind", "none"))
		validation_state_count = int(validation.get("expectedStateCount", 0))
	if _active_story_node != null and _active_story_node.has_method("get_preview_data_source_meta"):
		var source_meta: Dictionary = _active_story_node.call("get_preview_data_source_meta") as Dictionary
		requested_source_mode = str(source_meta.get("requestedMode", requested_source_mode))
		effective_source_mode = str(source_meta.get("effectiveMode", effective_source_mode))
	if _active_story_node != null and _active_story_node.has_method("get_preview_adapter_meta"):
		var adapter_meta: Dictionary = _active_story_node.call("get_preview_adapter_meta") as Dictionary
		adapter_state = str(adapter_meta.get("state", adapter_state))
		adapter_reason = str(adapter_meta.get("reason", adapter_reason))
	_story_title_label.text = "Story: %s" % title
	_story_description_label.text = description
	_story_meta_label.text = "id=%s | payload=%s | viewport=%s | targets=%d | validation=%s/%d" % [_active_story_id, payload_path, _active_viewport_id, capture_target_count, validation_kind, validation_state_count]
	_data_source_meta_label.text = "Data source: requested=%s effective=%s available=%s" % [requested_source_mode, effective_source_mode, ",".join(get_available_source_modes())]
	_data_source_status_label.text = "Adapter: state=%s reason=%s" % [adapter_state, adapter_reason]
	if _active_story_node != null and _active_story_node.has_method("capture_targets"):
		var targets: Array = _active_story_node.call("capture_targets")
		_story_capture_label.text = "Capture targets: %s" % ", ".join(targets)
	else:
		_story_capture_label.text = "Capture targets: none"


func _on_cycle_pressed() -> void:
	if _active_story_node != null and _active_story_node.has_method("cycle_preview_state"):
		_active_story_node.call("cycle_preview_state")
		_refresh_story_meta()


func _on_story_button_pressed(story_id: String) -> void:
	await _activate_story(story_id)


func _on_viewport_button_pressed(viewport_id: String) -> void:
	_activate_viewport(viewport_id)


func _on_data_source_button_pressed(source_mode: String) -> void:
	await select_data_source_by_id(source_mode)


func _on_reload_pressed() -> void:
	await _apply_story_payload()


func _on_refresh_manifest_pressed() -> void:
	_load_manifest()
	_rebuild_viewport_buttons()
	_rebuild_story_buttons()
	if _active_story_id != "":
		await _activate_story(_active_story_id)


func set_presentation_capture_mode(enabled: bool) -> void:
	_presentation_capture_mode = enabled
	_apply_presentation_capture_mode()


func is_presentation_capture_mode_enabled() -> bool:
	return _presentation_capture_mode


func _apply_presentation_capture_mode() -> void:
	if _sidebar_panel != null and is_instance_valid(_sidebar_panel):
		_sidebar_panel.visible = not _presentation_capture_mode
	if _active_story_node != null and is_instance_valid(_active_story_node) and _active_story_node.has_method("set_presentation_capture_mode"):
		_active_story_node.call("set_presentation_capture_mode", _presentation_capture_mode)
	elif _active_story_node != null and is_instance_valid(_active_story_node) and _active_story_node.has_method("_set_presentation_capture_mode"):
		_active_story_node.call("_set_presentation_capture_mode", _presentation_capture_mode)


func _run_headless_smoke() -> void:
	await get_tree().process_frame
	if _story_catalog.is_empty():
		push_error("UI_PREVIEW_SANDBOX_SMOKE_FAIL manifest-empty")
		get_tree().quit(1)
		return
	var active_only := OS.get_environment(ENV_HEADLESS_ACTIVE_ONLY).strip_edges().to_lower() in ["1", "true", "yes"]
	if active_only:
		await _apply_story_payload()
		if _active_story_node != null and _active_story_node.has_method("capture_targets"):
			var active_targets: Array = _active_story_node.call("capture_targets")
			var preview_context := get_preview_context()
			print("UI_PREVIEW_SANDBOX_TARGETS story=%s viewport=%s source=%s count=%d" % [_active_story_id, _active_viewport_id, _active_source_mode, active_targets.size()])
			print("UI_PREVIEW_SANDBOX_CONTEXT %s" % JSON.stringify(preview_context))
			print("UI_PREVIEW_SANDBOX_SMOKE_OK stories=1 viewports=1 active=%s viewport=%s source=%s" % [_active_story_id, _active_viewport_id, _active_source_mode])
			get_tree().quit(0)
			return
		push_error("UI_PREVIEW_SANDBOX_SMOKE_FAIL active-story-missing")
		get_tree().quit(1)
		return
	if _viewport_catalog.is_empty():
		_activate_viewport(_active_viewport_id)
		for story_info in _story_catalog:
			var story_id := str(story_info.get("id", "")).strip_edges()
			if story_id == "":
				continue
			await _activate_story(story_id)
			if _active_story_node == null:
				push_error("UI_PREVIEW_SANDBOX_SMOKE_FAIL missing-story-node:%s" % story_id)
				get_tree().quit(1)
				return
			await _apply_story_payload()
			if _active_story_node.has_method("capture_targets"):
				var targets: Array = _active_story_node.call("capture_targets")
				print("UI_PREVIEW_SANDBOX_TARGETS story=%s count=%d" % [story_id, targets.size()])
			if _active_story_node.has_method("cycle_preview_state"):
				_active_story_node.call("cycle_preview_state")
				_active_story_node.call("cycle_preview_state")
				_refresh_story_meta()
	else:
		for viewport_info in _viewport_catalog:
			var viewport_id := str(viewport_info.get("id", "")).strip_edges()
			if viewport_id == "":
				continue
			_activate_viewport(viewport_id)
			for story_info in _story_catalog:
				var story_id := str(story_info.get("id", "")).strip_edges()
				if story_id == "":
					continue
				await _activate_story(story_id)
				if _active_story_node == null:
					push_error("UI_PREVIEW_SANDBOX_SMOKE_FAIL missing-story-node:%s" % story_id)
					get_tree().quit(1)
					return
				await _apply_story_payload()
				if _active_story_node.has_method("capture_targets"):
					var targets: Array = _active_story_node.call("capture_targets")
					print("UI_PREVIEW_SANDBOX_TARGETS story=%s viewport=%s count=%d" % [story_id, viewport_id, targets.size()])
				if _active_story_node.has_method("cycle_preview_state"):
					_active_story_node.call("cycle_preview_state")
					_active_story_node.call("cycle_preview_state")
					_refresh_story_meta()
	print("UI_PREVIEW_SANDBOX_SMOKE_OK stories=%d viewports=%d active=%s viewport=%s" % [_story_catalog.size(), _viewport_catalog.size(), _active_story_id, _active_viewport_id])
	get_tree().quit(0)


func _set_story_data_sources(story_info: Dictionary) -> void:
	_data_source_catalog = []
	_data_source_by_id = {}
	var raw_sources: Variant = story_info.get("dataSources", [])
	if raw_sources is Array:
		for source_variant in raw_sources:
			if not (source_variant is Dictionary):
				continue
			var source_info: Dictionary = (source_variant as Dictionary).duplicate(true)
			var source_id := str(source_info.get("id", source_info.get("mode", ""))).strip_edges().to_lower()
			if source_id == "":
				continue
			source_info["id"] = source_id
			_data_source_catalog.append(source_info)
			_data_source_by_id[source_id] = source_info
	if _data_source_catalog.is_empty():
		var fallback_source := {
			"id": "fixture",
			"title": "Fixture",
			"description": "Stable fixture payload.",
			"mode": "fixture",
		}
		_data_source_catalog.append(fallback_source)
		_data_source_by_id["fixture"] = fallback_source
	var default_source_mode := str(story_info.get("defaultSourceMode", "fixture")).strip_edges().to_lower()
	if default_source_mode == "" or not _data_source_by_id.has(default_source_mode):
		default_source_mode = "fixture"
	_active_source_mode = default_source_mode


func _resolve_start_override(setting_key: String, env_key: String, fallback: String) -> String:
	var project_value := str(ProjectSettings.get_setting(setting_key, "")).strip_edges()
	if project_value != "":
		ProjectSettings.set_setting(setting_key, "")
		return project_value
	var env_value := OS.get_environment(env_key).strip_edges()
	if env_value != "":
		return env_value
	return fallback
