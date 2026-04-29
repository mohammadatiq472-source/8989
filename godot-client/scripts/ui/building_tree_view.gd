extends PanelContainer
class_name BuildingTreeView

signal building_selected(building_id: String)

@export var item_button_min_width: float = 168.0
@export var item_button_text_size: int = 13

const DEFAULT_TREE_TITLE := "建筑树"
const DEFAULT_STATE_BADGE_TEXT := "建筑树"
const DEFAULT_EMPTY_STATE_TEXT := "请选择一个设施或建筑项后加载建筑树。"
const DEFAULT_DETAIL_PLACEHOLDER := {
	"name": "建筑详情",
	"meta": "等待选择",
	"body": "等待建筑详情。",
	"cost": "消耗：--",
	"effect": "效果：--",
}

@onready var _title_label: Label = $BodyMargin/BodyVBox/HeaderRow/TitleLabel
@onready var _state_badge: Label = $BodyMargin/BodyVBox/HeaderRow/StateBadge
@onready var _empty_state_label: Label = $BodyMargin/BodyVBox/EmptyHintLabel
@onready var _list_container: VBoxContainer = $BodyMargin/BodyVBox/ContentSplit/ListScroll/ListVBox
@onready var _detail_name_label: Label = $BodyMargin/BodyVBox/ContentSplit/DetailPanel/DetailMargin/DetailVBox/DetailName
@onready var _detail_meta_label: Label = $BodyMargin/BodyVBox/ContentSplit/DetailPanel/DetailMargin/DetailVBox/DetailMeta
@onready var _detail_body_label: Label = $BodyMargin/BodyVBox/ContentSplit/DetailPanel/DetailMargin/DetailVBox/DetailBody
@onready var _detail_cost_label: Label = $BodyMargin/BodyVBox/ContentSplit/DetailPanel/DetailMargin/DetailVBox/DetailCost
@onready var _detail_effect_label: Label = $BodyMargin/BodyVBox/ContentSplit/DetailPanel/DetailMargin/DetailVBox/DetailEffect

var _tree_items: Array = []
var _item_buttons: Dictionary = {}
var _selected_building_id: String = ""
var _button_group: ButtonGroup = ButtonGroup.new()
var _tree_title: String = DEFAULT_TREE_TITLE
var _state_badge_text: String = DEFAULT_STATE_BADGE_TEXT
var _empty_state_text: String = DEFAULT_EMPTY_STATE_TEXT
var _detail_placeholder: Dictionary = DEFAULT_DETAIL_PLACEHOLDER.duplicate(true)
var _is_ready: bool = false

func _ready() -> void:
	_is_ready = true
	_refresh_static_copy()
	_rebuild_items()

func set_tree_contract(tree_contract: Dictionary) -> void:
	_tree_title = str(tree_contract.get("title", DEFAULT_TREE_TITLE)).strip_edges()
	_state_badge_text = str(tree_contract.get("state_badge", DEFAULT_STATE_BADGE_TEXT)).strip_edges()
	_empty_state_text = str(tree_contract.get("empty_state_text", DEFAULT_EMPTY_STATE_TEXT)).strip_edges()
	_detail_placeholder = DEFAULT_DETAIL_PLACEHOLDER.duplicate(true)
	var detail_placeholder_variant: Variant = tree_contract.get("detail_placeholder", {})
	if detail_placeholder_variant is Dictionary:
		var detail_placeholder_payload := detail_placeholder_variant as Dictionary
		for key_variant in DEFAULT_DETAIL_PLACEHOLDER.keys():
			var key := str(key_variant)
			var value := str(detail_placeholder_payload.get(key, _detail_placeholder.get(key, ""))).strip_edges()
			if value != "":
				_detail_placeholder[key] = value
	if _is_ready:
		_refresh_static_copy()
	var tree_items_variant: Variant = tree_contract.get("tree_items", [])
	if tree_items_variant is Array:
		set_tree_items(tree_items_variant as Array)
	var selected_building_id := str(tree_contract.get("selected_building_id", "")).strip_edges()
	if selected_building_id != "":
		if _is_ready:
			set_selected_building(selected_building_id)
		else:
			_selected_building_id = selected_building_id

func set_tree_items(tree_items: Array) -> void:
	_tree_items = tree_items.duplicate(true)
	if _is_ready:
		_rebuild_items()

func clear_tree() -> void:
	_tree_items = []
	_selected_building_id = ""
	if _is_ready:
		_rebuild_items()

func get_selected_building_id() -> String:
	return _selected_building_id

func set_selected_building(building_id: String) -> void:
	if not _is_ready:
		_selected_building_id = building_id
		return
	if building_id.is_empty() or not _item_buttons.has(building_id):
		return
	_selected_building_id = building_id
	for item_id in _item_buttons.keys():
		var button := _item_buttons[item_id] as Button
		if button != null:
			button.button_pressed = item_id == _selected_building_id
	_refresh_detail_for_selected()

func has_tree_items() -> bool:
	return not _item_buttons.is_empty()

func _refresh_static_copy() -> void:
	if not _is_ready or _title_label == null:
		return
	_title_label.text = _tree_title if _tree_title != "" else DEFAULT_TREE_TITLE
	_state_badge.text = _state_badge_text if _state_badge_text != "" else DEFAULT_STATE_BADGE_TEXT
	_empty_state_label.text = _empty_state_text if _empty_state_text != "" else DEFAULT_EMPTY_STATE_TEXT
	_refresh_detail_placeholder()

func _refresh_detail_placeholder() -> void:
	if not _is_ready or _detail_name_label == null:
		return
	_detail_name_label.text = str(_detail_placeholder.get("name", DEFAULT_DETAIL_PLACEHOLDER.name))
	_detail_meta_label.text = str(_detail_placeholder.get("meta", DEFAULT_DETAIL_PLACEHOLDER.meta))
	_detail_body_label.text = str(_detail_placeholder.get("body", DEFAULT_DETAIL_PLACEHOLDER.body))
	_detail_cost_label.text = str(_detail_placeholder.get("cost", DEFAULT_DETAIL_PLACEHOLDER.cost))
	_detail_effect_label.text = str(_detail_placeholder.get("effect", DEFAULT_DETAIL_PLACEHOLDER.effect))

func _clear_item_buttons() -> void:
	if not _is_ready or _list_container == null:
		return
	for child in _list_container.get_children():
		child.queue_free()
	_item_buttons.clear()

func _rebuild_items() -> void:
	if not _is_ready or _list_container == null:
		return
	_clear_item_buttons()
	_button_group = ButtonGroup.new()
	for raw_item in _tree_items:
		var item: Dictionary = raw_item if raw_item is Dictionary else {}
		var building_id := str(item.get("id", "")).strip_edges()
		if building_id.is_empty():
			continue
		var button := _create_item_button(item)
		_item_buttons[building_id] = button
		_list_container.add_child(button)
	var has_items := not _item_buttons.is_empty()
	_empty_state_label.visible = not has_items
	_list_container.visible = has_items
	if has_items and (_selected_building_id.is_empty() or not _item_buttons.has(_selected_building_id)):
		_selected_building_id = str((_tree_items[0] as Dictionary).get("id", ""))
	set_selected_building(_selected_building_id)
	if not has_items:
		_refresh_detail_placeholder()

func _create_item_button(item: Dictionary) -> Button:
	var building_id := str(item.get("id", "")).strip_edges()
	var label_text := str(item.get("label", building_id))
	var level_text := str(item.get("levelText", item.get("level", "")))
	var status_text := str(item.get("statusText", item.get("status", "")))
	var description_text := str(item.get("description", ""))
	var enabled := bool(item.get("enabled", true))
	var selected := bool(item.get("selected", false))

	var button := Button.new()
	button.name = "Building_%s" % building_id
	button.text = _compose_button_text(label_text, level_text, status_text)
	button.tooltip_text = description_text
	button.toggle_mode = true
	button.button_group = _button_group
	button.button_pressed = selected
	button.disabled = not enabled
	button.custom_minimum_size = Vector2(item_button_min_width, 0.0)
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.size_flags_stretch_ratio = 1.0
	button.focus_mode = Control.FOCUS_ALL
	button.add_theme_font_size_override("font_size", item_button_text_size)
	button.pressed.connect(func() -> void:
		_on_item_pressed(building_id)
	)
	return button

func _compose_button_text(label_text: String, level_text: String, status_text: String) -> String:
	var lines: PackedStringArray = PackedStringArray()
	lines.append(label_text)
	if level_text.strip_edges() != "":
		lines.append(level_text)
	if status_text.strip_edges() != "":
		lines.append(status_text)
	return "\n".join(lines)

func _on_item_pressed(building_id: String) -> void:
	if building_id.is_empty() or not _item_buttons.has(building_id):
		return
	_selected_building_id = building_id
	set_selected_building(building_id)
	building_selected.emit(building_id)

func _refresh_detail_for_selected() -> void:
	if not _is_ready or _detail_name_label == null:
		return
	if _selected_building_id.is_empty():
		_refresh_detail_placeholder()
		return
	var selected_item := _find_tree_item(_selected_building_id)
	if selected_item.is_empty():
		_refresh_detail_placeholder()
		return
	_detail_name_label.text = str(selected_item.get("label", _selected_building_id))
	_detail_meta_label.text = str(selected_item.get("meta", selected_item.get("levelText", "")))
	_detail_body_label.text = str(selected_item.get("description", _detail_placeholder.get("body", DEFAULT_DETAIL_PLACEHOLDER.body)))
	_detail_cost_label.text = "消耗：%s" % str(selected_item.get("costSummary", "待接入"))
	_detail_effect_label.text = "效果：%s" % str(selected_item.get("effectSummary", "待接入"))

func _find_tree_item(building_id: String) -> Dictionary:
	for raw_item in _tree_items:
		var item: Dictionary = raw_item if raw_item is Dictionary else {}
		if str(item.get("id", "")) == building_id:
			return item
	return {}
