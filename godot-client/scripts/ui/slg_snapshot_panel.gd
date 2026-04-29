extends Control
class_name SlgSnapshotPanel

signal back_requested
signal close_requested
signal page_changed(page_id: String)
signal page_action_requested(page_id: String, action_id: String)

const FULL_SCREEN_PANEL_HOST_SCENE: PackedScene = preload("res://scenes/ui/full_screen_panel_host.tscn")
const SNAPSHOT_SECTION_PAGE_SCENE: PackedScene = preload("res://scenes/ui/slg_snapshot_section_page.tscn")

var panel_title: String = "功能面板"
var panel_subtitle: String = "等待功能域数据。"
var panel_empty_state_text: String = "正在准备正式功能面板。"

var _panel_host: Control = null
var _snapshot: Dictionary = {}
var _active_page_id: String = ""
var _section_page: Control = null

func _ready() -> void:
	_ensure_panel_host()
	_ensure_section_page()
	_refresh_panel()

func set_snapshot(snapshot: Dictionary) -> void:
	_snapshot = snapshot.duplicate(true)
	if _active_page_id == "" or not _snapshot_has_page(_active_page_id):
		_active_page_id = _resolve_default_page_id()
	_refresh_panel()

func set_active_page_id(page_id: String) -> void:
	var resolved_page_id := page_id.strip_edges()
	if resolved_page_id == "":
		return
	_active_page_id = resolved_page_id
	_refresh_panel()

func get_active_page_id() -> String:
	return _active_page_id

func focus_first_action() -> void:
	if _panel_host != null and _panel_host.has_method("focus_first_action"):
		_panel_host.call("focus_first_action")

func _ensure_panel_host() -> void:
	if _panel_host != null and is_instance_valid(_panel_host):
		return
	var host_instance := FULL_SCREEN_PANEL_HOST_SCENE.instantiate()
	var host_control := host_instance as Control
	if host_control == null:
		return
	host_control.name = "FullScreenPanelHost"
	host_control.set_anchors_preset(Control.PRESET_FULL_RECT)
	host_control.offset_left = 0.0
	host_control.offset_top = 0.0
	host_control.offset_right = 0.0
	host_control.offset_bottom = 0.0
	add_child(host_control)
	_panel_host = host_control
	if _panel_host.has_signal("back_requested"):
		_panel_host.connect("back_requested", Callable(self, "_on_panel_host_back_requested"))
	if _panel_host.has_signal("close_requested"):
		_panel_host.connect("close_requested", Callable(self, "_on_panel_host_close_requested"))
	if _panel_host.has_signal("tab_selected"):
		_panel_host.connect("tab_selected", Callable(self, "_on_panel_host_tab_selected"))

func _ensure_section_page() -> void:
	if _section_page != null and is_instance_valid(_section_page):
		return
	var page_instance := SNAPSHOT_SECTION_PAGE_SCENE.instantiate()
	var page_control := page_instance as Control
	if page_control == null:
		return
	page_control.name = "SnapshotSectionPage"
	page_control.set_anchors_preset(Control.PRESET_FULL_RECT)
	page_control.offset_left = 0.0
	page_control.offset_top = 0.0
	page_control.offset_right = 0.0
	page_control.offset_bottom = 0.0
	_section_page = page_control
	if _section_page.has_signal("action_requested"):
		_section_page.connect("action_requested", Callable(self, "_on_section_page_action_requested"))

func _refresh_panel() -> void:
	if _panel_host == null or not is_instance_valid(_panel_host):
		return
	var tabs: Array = _snapshot.get("tabs", []) as Array
	if _active_page_id == "":
		_active_page_id = _resolve_default_page_id()
	var section_payload := _resolve_active_section_payload()
	var resolved_title := str(section_payload.get("panel_title", _snapshot.get("title", panel_title))).strip_edges()
	if resolved_title == "":
		resolved_title = panel_title
	_panel_host.call("set_panel_title", resolved_title)
	_panel_host.call("set_back_button_label", str(section_payload.get("back_button_label", _snapshot.get("back_button_label", "返回"))))
	_panel_host.call("set_close_button_label", str(section_payload.get("close_button_label", _snapshot.get("close_button_label", "关闭"))))
	_panel_host.call("set_empty_state_text", str(_snapshot.get("empty_state_text", panel_empty_state_text)))
	_panel_host.call("set_tabs", tabs)
	if _active_page_id != "":
		_panel_host.call("set_active_tab", _active_page_id)
	_apply_host_payload_settings(section_payload)
	if section_payload.is_empty():
		_panel_host.call("show_empty_state", str(_snapshot.get("empty_state_text", panel_empty_state_text)))
		return
	_ensure_section_page()
	if _section_page == null or not is_instance_valid(_section_page):
		_panel_host.call("show_empty_state", str(_snapshot.get("empty_state_text", panel_empty_state_text)))
		return
	if _section_page.get_parent() == null:
		_panel_host.call("set_content_node", _section_page)
	if _section_page.has_method("set_page_payload"):
		_section_page.call("set_page_payload", section_payload, _snapshot, _active_page_id)

func _apply_host_payload_settings(section_payload: Dictionary) -> void:
	if _panel_host == null or not is_instance_valid(_panel_host):
		return
	if _panel_host.has_method("set_title_font_size"):
		_panel_host.call("set_title_font_size", int(section_payload.get("title_font_size", _snapshot.get("title_font_size", 24))))
	if _panel_host.has_method("set_content_frame_transparent"):
		_panel_host.call("set_content_frame_transparent", bool(section_payload.get("content_frame_transparent", _snapshot.get("content_frame_transparent", false))))
	if _panel_host.has_method("set_content_margins"):
		var content_margins: Variant = section_payload.get("content_margins", _snapshot.get("content_margins", []))
		if content_margins is Array and (content_margins as Array).size() == 4:
			_panel_host.call(
				"set_content_margins",
				int((content_margins as Array)[0]),
				int((content_margins as Array)[1]),
				int((content_margins as Array)[2]),
				int((content_margins as Array)[3])
			)
	if _panel_host.has_method("set_body_margins"):
		var body_margins: Variant = section_payload.get("body_margins", _snapshot.get("body_margins", []))
		if body_margins is Array and (body_margins as Array).size() == 4:
			_panel_host.call(
				"set_body_margins",
				int((body_margins as Array)[0]),
				int((body_margins as Array)[1]),
				int((body_margins as Array)[2]),
				int((body_margins as Array)[3])
			)

func _resolve_active_section_payload() -> Dictionary:
	var sections: Dictionary = _snapshot.get("sections", {}) as Dictionary
	if _active_page_id != "" and sections.has(_active_page_id):
		return sections.get(_active_page_id, {}) as Dictionary
	for page_id in sections.keys():
		return sections.get(page_id, {}) as Dictionary
	return {}

func _resolve_default_page_id() -> String:
	var default_page_id := str(_snapshot.get("default_page_id", "")).strip_edges()
	if default_page_id != "" and _snapshot_has_page(default_page_id):
		return default_page_id
	var tabs: Array = _snapshot.get("tabs", []) as Array
	if not tabs.is_empty():
		var first_tab: Variant = tabs[0]
		if first_tab is Dictionary:
			var first_tab_id := str((first_tab as Dictionary).get("id", "")).strip_edges()
			if first_tab_id != "":
				return first_tab_id
	var sections: Dictionary = _snapshot.get("sections", {}) as Dictionary
	for page_id in sections.keys():
		return str(page_id).strip_edges()
	return ""

func _snapshot_has_page(page_id: String) -> bool:
	var resolved_page_id := page_id.strip_edges()
	if resolved_page_id == "":
		return false
	var sections: Dictionary = _snapshot.get("sections", {}) as Dictionary
	if sections.has(resolved_page_id):
		return true
	for tab_variant in _snapshot.get("tabs", []) as Array:
		if not (tab_variant is Dictionary):
			continue
		if str((tab_variant as Dictionary).get("id", "")).strip_edges() == resolved_page_id:
			return true
	return false

func _on_panel_host_back_requested() -> void:
	back_requested.emit()

func _on_panel_host_close_requested() -> void:
	close_requested.emit()

func _on_panel_host_tab_selected(tab_id: String) -> void:
	_active_page_id = tab_id
	page_changed.emit(tab_id)
	_refresh_panel()

func _on_section_page_action_requested(action_id: String) -> void:
	page_action_requested.emit(_active_page_id, action_id)
