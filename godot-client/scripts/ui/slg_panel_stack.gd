extends CanvasLayer
class_name SLGPanelStack

const MAIN_PANEL_ID := "main"
const L2_PANEL_ID := "l2"
const L3_PANEL_ID := "l3"
const L4_PANEL_ID := "l4"

@onready var _stage: Control = $Stage
@onready var _backdrop: ColorRect = $Stage/Backdrop
@onready var _main_hud: PanelContainer = $Stage/MainHUD
@onready var _main_path: Label = $Stage/MainHUD/MainMargin/MainVBox/MainPath
@onready var _open_l2_button: Button = $Stage/MainHUD/MainMargin/MainVBox/MainActions/OpenL2Button
@onready var _reset_button: Button = $Stage/MainHUD/MainMargin/MainVBox/MainActions/ResetButton
@onready var _shell_host: Control = $Stage/ShellHost
@onready var _l2_panel = $Stage/ShellHost/L2Panel
@onready var _l3_panel = $Stage/ShellHost/L3Panel
@onready var _l4_panel = $Stage/ShellHost/L4Panel

var _stack: Array[String] = [MAIN_PANEL_ID]
var _shells: Dictionary = {}

func _ready() -> void:
	_shells = {
		L2_PANEL_ID: _l2_panel,
		L3_PANEL_ID: _l3_panel,
		L4_PANEL_ID: _l4_panel,
	}
	_open_l2_button.pressed.connect(_on_open_l2_pressed)
	_reset_button.pressed.connect(_on_reset_pressed)
	_bind_shell(_l2_panel)
	_bind_shell(_l3_panel)
	_bind_shell(_l4_panel)
	_sync_stack_visuals()
	print("SLG_PANEL_STACK_READY display=%s headless_feature=%s" % [DisplayServer.get_name(), OS.has_feature("headless")])
	if OS.has_feature("headless") or DisplayServer.get_name() == "headless":
		call_deferred("_run_headless_smoke")

func _bind_shell(shell) -> void:
	shell.navigate_requested.connect(_on_shell_navigate_requested)

func _on_open_l2_pressed() -> void:
	_navigate_to(L2_PANEL_ID)

func _on_reset_pressed() -> void:
	_navigate_to(MAIN_PANEL_ID)

func _on_shell_navigate_requested(_panel_id: String, target_panel_id: String) -> void:
	_navigate_to(target_panel_id)

func _navigate_to(target_panel_id: String) -> void:
	if target_panel_id.is_empty():
		return
	if target_panel_id == MAIN_PANEL_ID:
		_stack = [MAIN_PANEL_ID]
	else:
		var target_index := _stack.find(target_panel_id)
		if target_index >= 0:
			_stack = _stack.slice(0, target_index + 1)
		else:
			_stack.append(target_panel_id)
	_sync_stack_visuals()

func _sync_stack_visuals() -> void:
	_main_hud.visible = true
	_backdrop.visible = _stack.size() > 1
	_main_path.text = "Stack: %s" % _stack_path_string()
	for shell_id in [L2_PANEL_ID, L3_PANEL_ID, L4_PANEL_ID]:
		var shell = _shells[shell_id]
		var shell_rank := _stack.find(shell_id)
		var active := shell_rank >= 0
		shell.visible = active
		shell.set_active_state(active and shell_id == _stack[-1], max(shell_rank, 0), _stack_path_string())
		if active:
			_shell_host.move_child(shell, _shell_host.get_child_count() - 1)
		if active and shell_id == _stack[-1]:
			shell.focus_shell()

func _current_path_string() -> String:
	return _stack_path_string()

func _stack_path_string() -> String:
	var path := ""
	for index in range(_stack.size()):
		if index > 0:
			path += " > "
		path += _stack[index]
	return path

func _expect_stack(expected_path: String, step_name: String) -> void:
	var actual := _current_path_string()
	if actual != expected_path:
		push_error("%s stack mismatch. expected=%s actual=%s" % [step_name, expected_path, actual])
		get_tree().quit(1)

func _run_headless_smoke() -> void:
	await get_tree().process_frame
	_expect_stack(MAIN_PANEL_ID, "initial")
	_navigate_to(L2_PANEL_ID)
	_expect_stack("main > l2", "open_l2")
	_navigate_to(L3_PANEL_ID)
	_expect_stack("main > l2 > l3", "open_l3")
	_navigate_to(L4_PANEL_ID)
	_expect_stack("main > l2 > l3 > l4", "open_l4")
	_navigate_to(L3_PANEL_ID)
	_expect_stack("main > l2 > l3", "back_to_l3")
	_navigate_to(MAIN_PANEL_ID)
	_expect_stack("main", "reset")
	print("SLG_PANEL_STACK_SMOKE_OK path=%s shell_count=%d" % [_current_path_string(), _shell_host.get_child_count()])
	get_tree().quit(0)
