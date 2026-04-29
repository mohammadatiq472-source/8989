extends "res://scripts/ui/slg_snapshot_panel.gd"
class_name WorldEventActivityPanel

const WORLD_EVENT_ACTIVITY_PRESENTER_SCRIPT := preload("res://scripts/ui/presenters/world_event_activity_presenter.gd")

var _presenter := WORLD_EVENT_ACTIVITY_PRESENTER_SCRIPT.new()
var _using_standalone_default_snapshot := false

func _init() -> void:
	panel_title = "精彩活动 / 天下大事 / 任务 / 势力状态"
	panel_subtitle = "正式二级页模板"
	panel_empty_state_text = "等待活动、天下大事、任务、势力状态模板快照。"

func _ready() -> void:
	super._ready()
	if _snapshot.is_empty():
		_using_standalone_default_snapshot = true
		var preview_snapshot := _presenter.build_snapshot({})
		preview_snapshot["entry_focus_mode"] = false
		set_snapshot(preview_snapshot)

func set_world_event_activity_snapshot(snapshot: Dictionary) -> void:
	var normalized_snapshot := _normalize_entry_snapshot(snapshot)
	var requested_default_page_id := str(snapshot.get("default_page_id", "")).strip_edges()
	if _using_standalone_default_snapshot and requested_default_page_id != "":
		_active_page_id = requested_default_page_id
	_using_standalone_default_snapshot = false
	set_snapshot(normalized_snapshot)

func build_template_snapshot(runtime_context: Dictionary = {}) -> Dictionary:
	return _presenter.build_snapshot(runtime_context)

func _normalize_entry_snapshot(snapshot: Dictionary) -> Dictionary:
	var normalized := snapshot.duplicate(true)
	var entry_focus_mode := bool(normalized.get("entry_focus_mode", true))
	if not entry_focus_mode:
		return normalized
	var default_page_id := str(normalized.get("default_page_id", "")).strip_edges()
	if default_page_id == "":
		return normalized
	var entry_configs: Dictionary = normalized.get("entry_configs", {}) as Dictionary
	if not entry_configs.has(default_page_id):
		return normalized
	var raw_profile: Variant = entry_configs.get(default_page_id, null)
	if not (raw_profile is Dictionary):
		return normalized
	var profile := (raw_profile as Dictionary).duplicate(true)
	var sections: Dictionary = normalized.get("sections", {}) as Dictionary
	if not sections.has(default_page_id):
		return normalized
	var focused_sections := {
		default_page_id: sections.get(default_page_id, {})
	}
	normalized["sections"] = focused_sections
	normalized["focused_entry_page_id"] = default_page_id
	normalized["focused_entry_panel_ids"] = profile.get("entry_panel_ids", [])
	normalized["focused_asset_slots"] = profile.get("asset_slots", [])
	if bool(profile.get("hide_tab_strip", true)):
		normalized["tabs"] = []
	var panel_title_text := str(profile.get("panel_title", "")).strip_edges()
	if panel_title_text != "":
		normalized["title"] = panel_title_text
	var panel_subtitle_text := str(profile.get("panel_subtitle", "")).strip_edges()
	if panel_subtitle_text != "":
		normalized["subtitle"] = panel_subtitle_text
	return normalized

func _on_section_page_action_requested(action_id: String) -> void:
	if action_id.begins_with("template_open:"):
		var page_id := action_id.trim_prefix("template_open:").strip_edges()
		if page_id != "":
			set_active_page_id(page_id)
			page_changed.emit(page_id)
		return
	if action_id == "template_back":
		back_requested.emit()
		return
	if action_id == "template_close":
		close_requested.emit()
		return
	page_action_requested.emit(get_active_page_id(), action_id)
