@tool
extends "res://scripts/dev/stories/ui_preview_story_base.gd"
class_name PanelStackStory

const PAYLOAD_DEFAULT_PATH := "res://data/ui_preview/stories/panel_stack_story.json"
const ShellScene := preload("res://scenes/ui/slg_panel_shell.tscn")
const PanelStackControllerScript := preload("res://scripts/dev/components/panel_stack_controller.gd")
const LAYER_LEVELS := {
	"main": 1,
	"l2": 2,
	"l3": 3,
	"l4": 3,
}

var _shell: Control
var _title_label: Label
var _description_label: Label
var _state_label: Label
var _main_title: Label
var _main_summary: Label
var _main_path: Label
var _rules_label: Label
var _open_l2_button: Button
var _reset_button: Button
var _shell_host: Control
var _panel_nodes: Dictionary = {}
var _stack_controller


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
			"Shell/MainHUD",
			"Shell/ShellHost/L2Panel",
			"Shell/ShellHost/L3Panel",
			"Shell/ShellHost/L4Panel",
			"Shell/MainHUD/MainMargin/MainVBox/MainActions/OpenL2Button",
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

	_title_label = _create_label(shell_vbox, "Title", "Panel Stack Story", 22)
	_description_label = _create_label(
		shell_vbox,
		"Description",
		"L1/L2/L3 panel stack preview with deterministic open/back/mutex behavior.",
		14
	)
	_state_label = _create_label(shell_vbox, "StateLabel", "State: main", 13)

	var chrome_row := _create_hbox(shell_vbox, "ChromeRow", 16)
	chrome_row.size_flags_vertical = Control.SIZE_EXPAND_FILL

	var left_col := _create_vbox(chrome_row, "LeftColumn", 10)
	left_col.custom_minimum_size = Vector2(410, 0)
	left_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left_col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_main_title = _create_label(left_col, "MainTitle", "MainHUD", 20)
	_main_summary = _create_label(
		left_col,
		"MainSummary",
		"Open L2 then push to L3 panels. Back pops one level; same-level L3 panels are mutex.",
		14
	)
	_main_path = _create_label(left_col, "MainPath", "Stack: main", 13)
	_rules_label = _create_label(left_col, "RulesLabel", "Rules: waiting...", 12)
	var action_row := _create_hbox(left_col, "ActionRow", 10)
	_open_l2_button = _create_button(action_row, "OpenL2Button", "Open L2", 14, 140)
	_reset_button = _create_button(action_row, "ResetButton", "Reset to Main", 14, 140)
	_open_l2_button.pressed.connect(_on_open_l2_pressed)
	_reset_button.pressed.connect(_on_reset_pressed)

	_shell_host = Control.new()
	_shell_host.name = "ShellHost"
	_shell_host.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_shell_host.size_flags_vertical = Control.SIZE_EXPAND_FILL
	chrome_row.add_child(_shell_host)
	_shell_host.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	_panel_nodes = {
		"l2": _spawn_shell(
			"l2",
			"Command Deck",
			"L2",
			"Layer 2 is the first drill-down. It keeps L1 visible behind the deck.",
			"Open L3 Strategy",
			"Back to Main",
			"Close L2",
			"Close L2",
			"l3",
			"main",
			"main",
			"main",
			Color(0.25, 0.58, 0.94, 1.0),
			Vector2(72, 180),
			Vector2(684, 520)
		),
		"l3": _spawn_shell(
			"l3",
			"Strategy Sheet",
			"L3-A",
			"First L3 panel. Opening the alternative L3 panel replaces this one (mutex).",
			"Switch to L3 Alert",
			"Back to L2",
			"Close L3",
			"Close L3",
			"l4",
			"l2",
			"l2",
			"l2",
			Color(0.82, 0.57, 0.22, 1.0),
			Vector2(248, 248),
			Vector2(896, 606)
		),
		"l4": _spawn_shell(
			"l4",
			"Alert Popup",
			"L3-B",
			"Alternative L3 panel sharing the same level as L3-A. They cannot stay open together.",
			"Switch to L3 Strategy",
			"Back to L2",
			"Close L3",
			"Close L3",
			"l3",
			"l2",
			"l2",
			"l2",
			Color(0.88, 0.35, 0.44, 1.0),
			Vector2(422, 304),
			Vector2(1094, 700)
		),
	}

	_stack_controller = PanelStackControllerScript.new()
	_stack_controller.configure("main", LAYER_LEVELS)
	_sync_stack_visuals()


func _spawn_shell(
	panel_id: String,
	panel_title: String,
	panel_depth_label: String,
	panel_body: String,
	primary_button_label: String,
	secondary_button_label: String,
	back_button_label: String,
	close_button_label: String,
	primary_target_id: String,
	secondary_target_id: String,
	back_target_id: String,
	close_target_id: String,
	accent_color: Color,
	offset_left: Vector2,
	offset_right: Vector2
) -> Node:
	var shell := ShellScene.instantiate()
	shell.name = panel_id.capitalize() + "Panel"
	shell.set("panel_id", panel_id)
	shell.set("panel_title", panel_title)
	shell.set("panel_depth_label", panel_depth_label)
	shell.set("panel_body", panel_body)
	shell.set("primary_button_label", primary_button_label)
	shell.set("secondary_button_label", secondary_button_label)
	shell.set("back_button_label", back_button_label)
	shell.set("close_button_label", close_button_label)
	shell.set("primary_target_id", primary_target_id)
	shell.set("secondary_target_id", secondary_target_id)
	shell.set("back_target_id", back_target_id)
	shell.set("close_target_id", close_target_id)
	shell.set("accent_color", accent_color)
	shell.offset_left = offset_left.x
	shell.offset_top = offset_left.y
	shell.offset_right = offset_right.x
	shell.offset_bottom = offset_right.y
	shell.connect("navigate_requested", Callable(self, "_on_shell_navigate_requested"))
	_shell_host.add_child(shell)
	return shell


func _apply_preview_payload() -> void:
	var state_label := get_active_state_label()
	var source_meta := get_preview_data_source_meta()
	var effective_source_mode := str(source_meta.get("effectiveMode", "fixture"))
	_state_label.text = "State: %s | source=%s" % [state_label, effective_source_mode]
	_title_label.text = str(_preview_payload.get("title", story_title))
	_description_label.text = str(_preview_payload.get("description", story_description))
	_main_title.text = str(_active_state.get("mainTitle", "MainHUD"))
	_main_summary.text = str(_active_state.get("mainSummary", "Open L2 to push deeper layers."))
	_open_l2_button.text = str(_active_state.get("openLabel", "Open L2"))
	_reset_button.text = str(_active_state.get("resetLabel", "Reset to Main"))

	var stack_path := _parse_stack_path(str(_active_state.get("stackPath", "Stack: main")))
	if _stack_controller != null:
		_stack_controller.set_stack_path(stack_path)

	var shell_states: Dictionary = _active_state.get("shells", {}) as Dictionary
	for panel_id in _panel_nodes.keys():
		var shell = _panel_nodes[panel_id]
		var shell_state: Dictionary = shell_states.get(panel_id, {}) as Dictionary
		if shell_state.is_empty():
			continue
		shell.set("panel_title", str(shell_state.get("panelTitle", shell.get("panel_title"))))
		shell.set("panel_depth_label", str(shell_state.get("panelDepthLabel", shell.get("panel_depth_label"))))
		shell.set("panel_body", str(shell_state.get("panelBody", shell.get("panel_body"))))
		shell.set("primary_button_label", str(shell_state.get("primaryButtonLabel", shell.get("primary_button_label"))))
		shell.set("secondary_button_label", str(shell_state.get("secondaryButtonLabel", shell.get("secondary_button_label"))))
		shell.set("back_button_label", str(shell_state.get("backButtonLabel", shell.get("back_button_label"))))
		shell.set("close_button_label", str(shell_state.get("closeButtonLabel", shell.get("close_button_label"))))
		shell.set("primary_target_id", str(shell_state.get("primaryTargetId", shell.get("primary_target_id"))))
		shell.set("secondary_target_id", str(shell_state.get("secondaryTargetId", shell.get("secondary_target_id"))))
		shell.set("back_target_id", str(shell_state.get("backTargetId", shell.get("back_target_id"))))
		shell.set("close_target_id", str(shell_state.get("closeTargetId", shell.get("close_target_id"))))
		shell.set("accent_color", _read_color(shell_state.get("accentColor", null), shell.get("accent_color")))
		shell.call("_refresh_view")
	_sync_stack_visuals()


func _parse_stack_path(raw_path: String) -> Array:
	var cleaned := raw_path.replace("Stack:", "").strip_edges()
	if cleaned == "":
		return ["main"]
	var parts := cleaned.split(">", false)
	var stack: Array = []
	for part in parts:
		var trimmed := part.strip_edges()
		if trimmed != "":
			stack.append(trimmed)
	if stack.is_empty():
		stack.append("main")
	return stack


func _sync_stack_visuals() -> void:
	if _stack_controller == null:
		return

	var stack_path: Array = _stack_controller.get_stack_path()
	var top_layer_id: String = str(_stack_controller.get_top_layer_id())
	var stack_path_text := " > ".join(stack_path)
	for panel_id in _panel_nodes.keys():
		var shell = _panel_nodes[panel_id]
		var rank: int = int(_stack_controller.get_layer_rank(panel_id))
		var is_visible: bool = rank >= 0
		shell.visible = is_visible
		if is_visible:
			shell.z_index = rank
		if shell.has_method("set_active_state"):
			shell.call("set_active_state", panel_id == top_layer_id, rank, stack_path_text)
		if is_visible and panel_id == top_layer_id:
			shell.call("focus_shell")

	for layer_id_variant in stack_path:
		var layer_id := str(layer_id_variant)
		if _panel_nodes.has(layer_id):
			_shell_host.move_child(_panel_nodes[layer_id], _shell_host.get_child_count() - 1)

	_main_path.text = "Stack: %s" % stack_path_text
	_rules_label.text = "Rules: %s" % _stack_controller.describe_rules()


func _on_open_l2_pressed() -> void:
	_navigate_to("l2")


func _on_reset_pressed() -> void:
	if _stack_controller != null:
		_stack_controller.reset()
	_sync_stack_visuals()


func _on_shell_navigate_requested(_panel_id: String, target_panel_id: String) -> void:
	_navigate_to(target_panel_id)


func _navigate_to(target_panel_id: String) -> void:
	if _stack_controller == null:
		return
	_stack_controller.navigate_to(target_panel_id)
	_sync_stack_visuals()
