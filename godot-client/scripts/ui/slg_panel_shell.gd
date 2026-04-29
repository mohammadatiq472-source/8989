extends PanelContainer
class_name SLGPanelShell

const DEFAULT_STACK_HINT := "open -> push, back -> pop, close -> dismiss top layer"

signal navigate_requested(panel_id: String, target_panel_id: String)

@export var panel_id: String = ""
@export var panel_title: String = "Panel"
@export_multiline var panel_body: String = "Panel body"
@export var panel_depth_label: String = "L?"
@export var primary_button_label: String = "Open next"
@export var secondary_button_label: String = "Back"
@export var back_button_label: String = "Close"
@export var close_button_label: String = "Close"
@export var primary_target_id: String = ""
@export var secondary_target_id: String = ""
@export var back_target_id: String = ""
@export var close_target_id: String = ""
@export var accent_color: Color = Color(0.25, 0.58, 0.94, 1.0)

@onready var _accent_bar: ColorRect = $BodyMargin/BodyVBox/AccentBar
@onready var _depth_badge: Label = $BodyMargin/BodyVBox/HeaderRow/DepthBadge
@onready var _title_label: Label = $BodyMargin/BodyVBox/HeaderRow/TitleLabel
@onready var _body_label: Label = $BodyMargin/BodyVBox/BodyLabel
@onready var _stack_hint: Label = $BodyMargin/BodyVBox/StackHint
@onready var _primary_button: Button = $BodyMargin/BodyVBox/ActionRow/PrimaryButton
@onready var _secondary_button: Button = $BodyMargin/BodyVBox/ActionRow/SecondaryButton
@onready var _back_button: Button = $BodyMargin/BodyVBox/ActionRow/BackButton
@onready var _close_button: Button = $BodyMargin/BodyVBox/HeaderRow/CloseButton

func _ready() -> void:
	_refresh_view()
	_primary_button.pressed.connect(_on_primary_button_pressed)
	_secondary_button.pressed.connect(_on_secondary_button_pressed)
	_back_button.pressed.connect(_on_back_button_pressed)
	_close_button.pressed.connect(_on_close_button_pressed)

func _refresh_view() -> void:
	_depth_badge.text = panel_depth_label
	_title_label.text = panel_title
	_body_label.text = panel_body
	_stack_hint.text = DEFAULT_STACK_HINT
	_primary_button.text = primary_button_label
	_secondary_button.text = secondary_button_label
	_back_button.text = back_button_label
	_close_button.text = close_button_label
	_accent_bar.color = accent_color

func focus_shell() -> void:
	_primary_button.grab_focus()

func set_active_state(is_active: bool, sibling_rank: int, stack_path: String) -> void:
	modulate = Color(1, 1, 1, 1.0 if is_active else 0.92)
	_stack_hint.text = "path: %s | rank: %d" % [stack_path, sibling_rank]
	z_index = sibling_rank

func _emit_navigation(target_panel_id: String) -> void:
	if target_panel_id.is_empty():
		return
	navigate_requested.emit(panel_id, target_panel_id)

func _on_primary_button_pressed() -> void:
	if primary_target_id.is_empty():
		_emit_navigation(close_target_id)
		return
	_emit_navigation(primary_target_id)

func _on_secondary_button_pressed() -> void:
	if secondary_target_id.is_empty():
		return
	_emit_navigation(secondary_target_id)

func _on_back_button_pressed() -> void:
	if back_target_id.is_empty():
		return
	_emit_navigation(back_target_id)

func _on_close_button_pressed() -> void:
	if close_target_id.is_empty():
		return
	_emit_navigation(close_target_id)
