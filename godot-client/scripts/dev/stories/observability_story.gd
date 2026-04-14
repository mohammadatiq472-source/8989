@tool
extends "res://scripts/dev/stories/ui_preview_story_base.gd"
class_name ObservabilityStory

const PAYLOAD_DEFAULT_PATH := "res://data/ui_preview/stories/observability_story.json"
const ObservabilityPanelScene := preload("res://scenes/ui/observability_panel.tscn")

var _shell: Control
var _title_label: Label
var _description_label: Label
var _state_label: Label
var _panel_host: Control
var _panel_instance: Node


func _ready() -> void:
	_build_ui()
	if payload_path.strip_edges() == "":
		payload_path = PAYLOAD_DEFAULT_PATH
	boot_preview_story()


func capture_targets() -> Array:
	var targets: Array = super.capture_targets()
	if targets.is_empty():
		targets = [
			"Shell",
			"Shell/PanelHost",
			"Shell/PanelHost/ObservabilityPanel",
			"Shell/PanelHost/ObservabilityPanel/Panel/Margin/Content/WsSection",
			"Shell/PanelHost/ObservabilityPanel/Panel/Margin/Content/EventsSection",
			"Shell/PanelHost/ObservabilityPanel/Panel/Margin/Content/RuntimeSection",
			"Shell/PanelHost/ObservabilityPanel/Panel/Margin/Content/CivilMemorySection",
		]
	return targets


func _build_ui() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_shell = _create_panel(self, "Shell")
	_shell.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var shell_margin := _create_margin_container(_shell, "ShellMargin", 18, 18, 18, 18)
	shell_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var shell_vbox := _create_vbox(shell_margin, "ShellVBox", 12)
	shell_vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	_title_label = _create_label(shell_vbox, "Title", "Observability Story", 22)
	_description_label = _create_label(
		shell_vbox,
		"Description",
		"Fake WS / runtime / memory payloads injected into the existing observability panel.",
		14
	)
	_state_label = _create_label(shell_vbox, "StateLabel", "State: idle", 13)

	_panel_host = Control.new()
	_panel_host.name = "PanelHost"
	_panel_host.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_panel_host.size_flags_vertical = Control.SIZE_EXPAND_FILL
	shell_vbox.add_child(_panel_host)
	_panel_host.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	_panel_instance = ObservabilityPanelScene.instantiate()
	_panel_host.add_child(_panel_instance)


func _apply_preview_payload() -> void:
	var state_label := get_active_state_label()
	var source_meta := get_preview_data_source_meta()
	var effective_source_mode := str(source_meta.get("effectiveMode", "fixture"))
	_state_label.text = "State: %s | source=%s" % [state_label, effective_source_mode]
	_title_label.text = str(_preview_payload.get("title", story_title))
	_description_label.text = str(_preview_payload.get("description", story_description))
	var snapshot: Dictionary = _active_state.get("snapshot", {}) as Dictionary
	if _panel_instance != null and _panel_instance.has_method("update_snapshot"):
		_panel_instance.call("update_snapshot", snapshot)
