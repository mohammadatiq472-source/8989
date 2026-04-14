@tool
extends "res://scripts/dev/stories/ui_preview_story_base.gd"
class_name HUDTokenStory

const PAYLOAD_DEFAULT_PATH := "res://data/ui_preview/stories/hud_token_story.json"

var _shell: Control
var _title_label: Label
var _description_label: Label
var _state_label: Label
var _state_badge: Label
var _top_card: PanelContainer
var _top_card_title: Label
var _hover_label: Label
var _perf_label: Label
var _bottom_bar: PanelContainer
var _bottom_title: Label
var _bottom_summary: Label
var _runtime_label: Label
var _refresh_button: Button
var _advance_button: Button
var _export_button: Button


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
			"Shell/TopCard",
			"Shell/BottomBar",
			"Shell/BottomBar/VBox/ActionRow/RefreshButton",
			"Shell/BottomBar/VBox/ActionRow/AdvanceButton",
			"Shell/BottomBar/VBox/ActionRow/ExportButton",
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

	_title_label = _create_label(shell_vbox, "Title", "HUD Token Story", 22)
	_description_label = _create_label(
		shell_vbox,
		"Description",
		"Token-driven HUD cards that mirror the main scene's top-left info block and bottom action strip.",
		14
	)
	_state_label = _create_label(shell_vbox, "StateLabel", "State: idle", 13)
	_state_badge = _create_label(shell_vbox, "StateBadge", "capture targets: 0", 13)

	var body_row := _create_hbox(shell_vbox, "BodyRow", 16)
	body_row.size_flags_vertical = Control.SIZE_EXPAND_FILL

	_top_card = _create_panel(body_row, "TopCard")
	_top_card.custom_minimum_size = Vector2(520, 280)
	_top_card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_top_card.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_apply_panel_style(_top_card, "panel", "hud_top_left")
	var top_card_margin := _create_margin_container(_top_card, "Margin", 16, 14, 16, 14)
	top_card_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var top_card_vbox := _create_vbox(top_card_margin, "VBox", 10)
	_top_card_title = _create_label(top_card_vbox, "Title", "Top-left info card", 17)
	_hover_label = _create_label(top_card_vbox, "HoverInfo", "Hover | waiting for sample data...", 14)
	_perf_label = _create_label(top_card_vbox, "PerfInfo", "Perf | waiting for sample metrics...", 14)

	_bottom_bar = _create_panel(body_row, "BottomBar")
	_bottom_bar.custom_minimum_size = Vector2(520, 280)
	_bottom_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_bottom_bar.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_apply_panel_style(_bottom_bar, "panel", "hud_bottom_bar")
	var bottom_margin := _create_margin_container(_bottom_bar, "Margin", 16, 14, 16, 14)
	bottom_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var bottom_vbox := _create_vbox(bottom_margin, "VBox", 10)
	_bottom_title = _create_label(bottom_vbox, "Title", "Bottom action bar", 17)
	_bottom_summary = _create_label(bottom_vbox, "Summary", "Action buttons below are styled by tokens.", 14)
	_runtime_label = _create_label(bottom_vbox, "Runtime", "Runtime | waiting...", 14)

	var action_row := _create_hbox(bottom_vbox, "ActionRow", 10)
	action_row.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_refresh_button = _create_button(action_row, "RefreshButton", "Refresh Snapshot", 14, 170)
	_advance_button = _create_button(action_row, "AdvanceButton", "Advance Tick", 14, 150)
	_export_button = _create_button(action_row, "ExportButton", "Export Baseline", 14, 160)
	_apply_button_style(_refresh_button, "refresh")
	_apply_button_style(_advance_button, "advance_tick")
	_apply_button_style(_export_button, "export")

	_refresh_button.pressed.connect(_on_refresh_pressed)
	_advance_button.pressed.connect(_on_advance_pressed)
	_export_button.pressed.connect(_on_export_pressed)


func _apply_preview_payload() -> void:
	var state_label := get_active_state_label()
	var source_meta := get_preview_data_source_meta()
	var effective_source_mode := str(source_meta.get("effectiveMode", "fixture"))
	_state_label.text = "State: %s | source=%s" % [state_label, effective_source_mode]
	_state_badge.text = "capture targets: %d | source=%s" % [capture_targets().size(), effective_source_mode]
	_title_label.text = str(_active_state.get("headline", _preview_payload.get("title", story_title)))
	_description_label.text = str(_preview_payload.get("description", story_description))
	_top_card_title.text = str(_active_state.get("cardTitle", "Top-left info card"))
	_hover_label.text = str(_active_state.get("hoverInfo", "Hover | waiting for sample data."))
	_perf_label.text = str(_active_state.get("perfInfo", "Perf | waiting for sample data."))
	_runtime_label.text = str(_active_state.get("runtimeInfo", "Runtime | waiting for sample data."))
	_bottom_summary.text = str(_active_state.get("summary", "Bottom action bar preview."))
	_refresh_button.text = str(_active_state.get("refreshLabel", "Refresh Snapshot"))
	_advance_button.text = str(_active_state.get("advanceLabel", "Advance Tick"))
	_export_button.text = str(_active_state.get("exportLabel", "Export Baseline"))
	var accent_color := _read_color(_active_state.get("accentColor", null), Color(0.25, 0.58, 0.94, 1.0))
	_top_card_title.modulate = accent_color
	_bottom_title.modulate = accent_color


func _on_refresh_pressed() -> void:
	if _preview_payload.is_empty():
		return
	_apply_preview_payload()


func _on_advance_pressed() -> void:
	cycle_preview_state()


func _on_export_pressed() -> void:
	_state_badge.text = "capture targets: %d | export-ready" % capture_targets().size()
