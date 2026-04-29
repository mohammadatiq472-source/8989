extends HBoxContainer
class_name AffairsQueueView

signal queue_item_pressed(affair_id: String)
signal selected_affair_changed(affair_id: String)
signal detail_action_requested(action_id: String, affair_id: String)

const DEFAULT_VIEW_TITLE := "建设队列"
const DEFAULT_VIEW_SUBTITLE := "当前政务队列"
const DEFAULT_SUMMARY_TITLE := "执行摘要"
const DEFAULT_FOOTER_TITLE := "补充"
const DEFAULT_EMPTY_LIST_LABEL := "等待政务项。"
const DEFAULT_EMPTY_STATE_TITLE := "当前政务队列为空。"
const DEFAULT_EMPTY_STATE_BODY := "当前还没有可显示的政务队列说明。"
const DEFAULT_EMPTY_STATE_FOOTER := "政务队列现在直接读取主城快照，不再只是静态占位。"

@onready var _title_label: Label = $LeftPanel/LeftMargin/LeftColumn/TitleLabel
@onready var _subtitle_label: Label = $LeftPanel/LeftMargin/LeftColumn/SubtitleLabel
@onready var _queue_buttons: VBoxContainer = $LeftPanel/LeftMargin/LeftColumn/QueueButtons
@onready var _summary_title_label: Label = $RightPanel/RightMargin/RightColumn/SummaryTitleLabel
@onready var _selected_label: Label = $RightPanel/RightMargin/RightColumn/SelectedLabel
@onready var _status_label: Label = $RightPanel/RightMargin/RightColumn/StatusLabel
@onready var _description_label: Label = $RightPanel/RightMargin/RightColumn/DescriptionLabel
@onready var _detail_action_wrap: HFlowContainer = $RightPanel/RightMargin/RightColumn/DetailActionWrap
@onready var _footer_title_label: Label = $RightPanel/RightMargin/RightColumn/FooterTitleLabel
@onready var _footer_note_label: Label = $RightPanel/RightMargin/RightColumn/FooterNoteLabel

var _queue_items: Array = []
var _selected_affair_id: String = ""
var _detail_actions: Array = []
var _view_title: String = DEFAULT_VIEW_TITLE
var _view_subtitle: String = DEFAULT_VIEW_SUBTITLE
var _summary_title: String = DEFAULT_SUMMARY_TITLE
var _empty_list_label: String = DEFAULT_EMPTY_LIST_LABEL
var _empty_state_title: String = DEFAULT_EMPTY_STATE_TITLE
var _empty_state_body: String = DEFAULT_EMPTY_STATE_BODY
var _footer_note_text: String = DEFAULT_EMPTY_STATE_FOOTER


func _ready() -> void:
	_refresh_meta_labels()
	_refresh_detail()


func set_queue_contract(queue_contract: Dictionary) -> void:
	_view_title = str(queue_contract.get("title", DEFAULT_VIEW_TITLE)).strip_edges()
	_view_subtitle = str(queue_contract.get("subtitle", DEFAULT_VIEW_SUBTITLE)).strip_edges()
	_summary_title = str(queue_contract.get("summary_title", DEFAULT_SUMMARY_TITLE)).strip_edges()
	_apply_empty_state_contract(queue_contract.get("empty_state", {}))
	_detail_actions = _normalize_detail_actions(queue_contract.get("detail_actions", []))
	_queue_items = _normalize_queue_items(queue_contract.get("queue_items", []))
	var selected_affair_id := str(queue_contract.get("selected_affair_id", "")).strip_edges()
	if _has_queue_item(selected_affair_id):
		_selected_affair_id = selected_affair_id
	elif not _has_queue_item(_selected_affair_id):
		_selected_affair_id = _derive_first_affair_id()
	_refresh_meta_labels()
	_rebuild_queue_buttons()
	_refresh_detail()


func _apply_empty_state_contract(empty_state_variant: Variant) -> void:
	_empty_list_label = DEFAULT_EMPTY_LIST_LABEL
	_empty_state_title = DEFAULT_EMPTY_STATE_TITLE
	_empty_state_body = DEFAULT_EMPTY_STATE_BODY
	var footer_lines: Array[String] = []
	if empty_state_variant is Dictionary:
		var empty_state_contract := empty_state_variant as Dictionary
		_empty_list_label = str(empty_state_contract.get("list_label", DEFAULT_EMPTY_LIST_LABEL)).strip_edges()
		_empty_state_title = str(empty_state_contract.get("title", DEFAULT_EMPTY_STATE_TITLE)).strip_edges()
		_empty_state_body = str(empty_state_contract.get("body", DEFAULT_EMPTY_STATE_BODY)).strip_edges()
		var raw_footer_lines: Variant = empty_state_contract.get("footer_lines", [])
		if raw_footer_lines is Array:
			for line_variant in raw_footer_lines:
				var line := str(line_variant).strip_edges()
				if line != "":
					footer_lines.append(line)
		if footer_lines.is_empty():
			var footer_text := str(empty_state_contract.get("footer", "")).strip_edges()
			if footer_text != "":
				footer_lines.append(footer_text)
	if footer_lines.is_empty():
		footer_lines.append(DEFAULT_EMPTY_STATE_FOOTER)
	_footer_note_text = "\n".join(footer_lines)


func _refresh_meta_labels() -> void:
	_title_label.text = _view_title if _view_title != "" else DEFAULT_VIEW_TITLE
	_subtitle_label.text = _view_subtitle if _view_subtitle != "" else DEFAULT_VIEW_SUBTITLE
	_summary_title_label.text = _summary_title if _summary_title != "" else DEFAULT_SUMMARY_TITLE
	_footer_title_label.text = DEFAULT_FOOTER_TITLE


func _normalize_detail_actions(actions_variant: Variant) -> Array:
	var normalized_actions: Array = []
	if actions_variant is Array:
		for raw_action in actions_variant:
			if raw_action is Dictionary:
				normalized_actions.append(raw_action as Dictionary)
	return normalized_actions


func _normalize_queue_items(queue_items_variant: Variant) -> Array:
	var normalized_queue_items: Array = []
	if queue_items_variant is Array:
		for raw_queue_item in queue_items_variant:
			if raw_queue_item is Dictionary:
				normalized_queue_items.append(raw_queue_item as Dictionary)
	return normalized_queue_items


func get_selected_queue_id() -> String:
	return _selected_affair_id


func _rebuild_queue_buttons() -> void:
	for child in _queue_buttons.get_children():
		child.queue_free()
	if _queue_items.is_empty():
		var empty_label := Label.new()
		empty_label.text = _empty_list_label if _empty_list_label != "" else DEFAULT_EMPTY_LIST_LABEL
		empty_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		empty_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_queue_buttons.add_child(empty_label)
		return
	for raw_queue_item in _queue_items:
		var queue_item: Dictionary = raw_queue_item as Dictionary
		var affair_id := str(queue_item.get("id", "")).strip_edges()
		var is_selected := affair_id != "" and affair_id == _selected_affair_id
		var button := Button.new()
		button.toggle_mode = true
		button.button_pressed = is_selected
		button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		button.text = "%s%s\n%s" % [
			"> " if is_selected else "",
			str(queue_item.get("label", "政务项")),
			str(queue_item.get("statusText", "待处理")),
		]
		button.custom_minimum_size = Vector2(160, 0)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		if is_selected:
			button.add_theme_color_override("font_color", Color(0.93, 0.78, 0.46, 0.98))
		button.pressed.connect(_on_queue_button_pressed.bind(affair_id))
		_queue_buttons.add_child(button)


func _refresh_detail() -> void:
	var selected_queue_item := _find_selected_queue_item()
	if selected_queue_item.is_empty():
		_selected_label.text = _empty_state_title if _empty_state_title != "" else "当前政务队列为空。"
		_status_label.text = ""
		_description_label.text = _empty_state_body if _empty_state_body != "" else "当前还没有可显示的政务队列说明。"
		_footer_note_label.text = _footer_note_text
		_rebuild_action_buttons()
		return
	_selected_label.text = "当前选中：%s" % str(selected_queue_item.get("label", "政务项"))
	_status_label.text = "状态：%s" % str(selected_queue_item.get("statusText", "待处理"))
	_description_label.text = str(selected_queue_item.get("description", "等待政务说明。"))
	_footer_note_label.text = _footer_note_text
	_rebuild_action_buttons()


func _rebuild_action_buttons() -> void:
	for child in _detail_action_wrap.get_children():
		child.queue_free()
	if _detail_actions.is_empty():
		return
	var selected_affair_id := get_selected_queue_id()
	var has_selected_affair := selected_affair_id != ""
	for raw_action in _detail_actions:
		var action_payload: Dictionary = raw_action as Dictionary
		var action_id := str(action_payload.get("id", "")).strip_edges()
		if action_id == "":
			continue
		var button := Button.new()
		button.text = str(action_payload.get("label", action_id))
		button.disabled = bool(action_payload.get("disabled", false)) or not has_selected_affair
		button.pressed.connect(_on_detail_action_pressed.bind(action_id))
		_detail_action_wrap.add_child(button)


func _on_queue_button_pressed(affair_id: String) -> void:
	_selected_affair_id = affair_id
	_rebuild_queue_buttons()
	_refresh_detail()
	selected_affair_changed.emit(affair_id)
	if affair_id != "":
		queue_item_pressed.emit(affair_id)


func _on_detail_action_pressed(action_id: String) -> void:
	if action_id == "":
		return
	var affair_id := get_selected_queue_id()
	if action_id == "refresh_selected":
		_refresh_detail()
	detail_action_requested.emit(action_id, affair_id)


func _find_selected_queue_item() -> Dictionary:
	for raw_queue_item in _queue_items:
		var queue_item: Dictionary = raw_queue_item as Dictionary
		if str(queue_item.get("id", "")).strip_edges() == _selected_affair_id:
			return queue_item
	return {}


func _derive_first_affair_id() -> String:
	if _queue_items.is_empty():
		return ""
	return str((_queue_items[0] as Dictionary).get("id", "")).strip_edges()


func _has_queue_item(affair_id: String) -> bool:
	if affair_id == "":
		return false
	for raw_queue_item in _queue_items:
		var queue_item: Dictionary = raw_queue_item as Dictionary
		if str(queue_item.get("id", "")).strip_edges() == affair_id:
			return true
	return false
