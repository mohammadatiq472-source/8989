extends PanelContainer
class_name BuildUpgradeSheet

signal primary_action_requested(action_id: String)
signal secondary_action_requested(action_id: String)
signal close_requested

@export var body_font_size: int = 14

const DEFAULT_SHEET_CONTRACT := {
	"title": "建造 / 升级说明",
	"subtitle": "请选择一个建筑项查看建造、升级和条件说明。",
	"body": "当前没有选中任何建筑项。",
	"cost_summary": "消耗：--",
	"effect_summary": "效果：--",
	"primary_action_label": "确认",
	"secondary_action_label": "取消",
	"close_button_label": "关闭",
	"empty_state_text": "等待建造说明。",
	"has_payload": false,
}

@onready var _title_label: Label = $BodyMargin/BodyVBox/HeaderRow/TitleLabel
@onready var _subtitle_label: Label = $BodyMargin/BodyVBox/HeaderRow/SubtitleLabel
@onready var _close_button: Button = $BodyMargin/BodyVBox/HeaderRow/CloseButton
@onready var _empty_state_label: Label = $BodyMargin/BodyVBox/PlaceholderLabel
@onready var _body_label: Label = $BodyMargin/BodyVBox/SheetBody
@onready var _cost_label: Label = $BodyMargin/BodyVBox/CostLabel
@onready var _effect_label: Label = $BodyMargin/BodyVBox/EffectLabel
@onready var _primary_button: Button = $BodyMargin/BodyVBox/ActionRow/PrimaryButton
@onready var _secondary_button: Button = $BodyMargin/BodyVBox/ActionRow/SecondaryButton

var _has_payload: bool = false
var _sheet_contract: Dictionary = DEFAULT_SHEET_CONTRACT.duplicate(true)
var _is_ready: bool = false

func _ready() -> void:
	_is_ready = true
	_refresh_view()
	_primary_button.pressed.connect(_on_primary_pressed)
	_secondary_button.pressed.connect(_on_secondary_pressed)
	_close_button.pressed.connect(_on_close_pressed)

func set_sheet_contract(sheet_contract: Dictionary) -> void:
	_sheet_contract = DEFAULT_SHEET_CONTRACT.duplicate(true)
	for key_variant in sheet_contract.keys():
		var key := str(key_variant)
		_sheet_contract[key] = sheet_contract.get(key_variant)
	var body_text := str(_sheet_contract.get("body", "")).strip_edges()
	if bool(_sheet_contract.get("has_payload", false)):
		_has_payload = true
	else:
		_has_payload = body_text != ""
	if _is_ready:
		_refresh_view()

func clear_sheet() -> void:
	set_sheet_contract(DEFAULT_SHEET_CONTRACT.duplicate(true))

func get_visual_smoke_summary() -> Dictionary:
	var subtitle := str(_sheet_contract.get("subtitle", ""))
	var body := str(_sheet_contract.get("body", ""))
	return {
		"hasPayload": _has_payload,
		"primaryButtonDisabled": _primary_button.disabled if _is_ready and _primary_button != null else not _has_payload,
		"secondaryButtonDisabled": _secondary_button.disabled if _is_ready and _secondary_button != null else not _has_payload,
		"templateFeedbackVisible": body.find("模板/排队态") >= 0 and body.find("不请求后端") >= 0 and body.find("不扣资源") >= 0,
		"submittedStateVisible": subtitle.find("已加入模板排队") >= 0,
	}

func focus_first_action() -> void:
	if not _is_ready:
		return
	if _primary_button != null and not _primary_button.disabled:
		_primary_button.grab_focus()
		return
	if _secondary_button != null and not _secondary_button.disabled:
		_secondary_button.grab_focus()
		return
	if _close_button != null and not _close_button.disabled:
		_close_button.grab_focus()

func _refresh_view() -> void:
	if not _is_ready or _title_label == null:
		return
	_title_label.text = str(_sheet_contract.get("title", DEFAULT_SHEET_CONTRACT.title))
	_subtitle_label.text = str(_sheet_contract.get("subtitle", DEFAULT_SHEET_CONTRACT.subtitle))
	_close_button.text = str(_sheet_contract.get("close_button_label", DEFAULT_SHEET_CONTRACT.close_button_label))
	_empty_state_label.text = str(_sheet_contract.get("empty_state_text", DEFAULT_SHEET_CONTRACT.empty_state_text))
	_body_label.text = str(_sheet_contract.get("body", DEFAULT_SHEET_CONTRACT.body))
	_body_label.add_theme_font_size_override("font_size", body_font_size)
	_cost_label.text = str(_sheet_contract.get("cost_summary", DEFAULT_SHEET_CONTRACT.cost_summary))
	_effect_label.text = str(_sheet_contract.get("effect_summary", DEFAULT_SHEET_CONTRACT.effect_summary))
	_primary_button.text = str(_sheet_contract.get("primary_action_label", DEFAULT_SHEET_CONTRACT.primary_action_label))
	_secondary_button.text = str(_sheet_contract.get("secondary_action_label", DEFAULT_SHEET_CONTRACT.secondary_action_label))
	_empty_state_label.visible = not _has_payload
	_body_label.visible = _has_payload
	_cost_label.visible = _has_payload
	_effect_label.visible = _has_payload
	_primary_button.disabled = not _has_payload
	_secondary_button.disabled = not _has_payload

func _on_primary_pressed() -> void:
	if _has_payload:
		primary_action_requested.emit(str(_sheet_contract.get("primary_action_label", DEFAULT_SHEET_CONTRACT.primary_action_label)))

func _on_secondary_pressed() -> void:
	if _has_payload:
		secondary_action_requested.emit(str(_sheet_contract.get("secondary_action_label", DEFAULT_SHEET_CONTRACT.secondary_action_label)))

func _on_close_pressed() -> void:
	close_requested.emit()
