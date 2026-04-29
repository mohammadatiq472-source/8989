extends PanelContainer
class_name TroopPanel

signal troop_selected(troop_id: String)
signal facility_selected(facility_id: String)
signal building_selected(building_id: String)
signal upgrade_requested(building_id: String)
signal close_requested()

const DEFAULT_OVERVIEW_TITLE := "五部队总览"
const DEFAULT_OVERVIEW_HINT := "先保留 5 个部队位与状态占位"
const DEFAULT_FORMATION_TITLE := "单队编组占位"
const DEFAULT_FACILITY_TITLE := "设施"
const DEFAULT_CAMP_LABEL := "大营"
const DEFAULT_MID_LABEL := "中军"
const DEFAULT_FRONT_LABEL := "前锋"
const DEFAULT_PANEL_EMPTY_STATE := "等待部队面板数据。"
const DEFAULT_OVERVIEW_PLACEHOLDER := "等待五部队总览数据。"
const DEFAULT_FORMATION_PLACEHOLDER := "等待单队编组数据。"
const DEFAULT_FACILITY_PLACEHOLDER := "等待设施区数据。"
const DEFAULT_CAMP_VALUE := "大营：待接入"
const DEFAULT_MID_VALUE := "中军：待接入"
const DEFAULT_FRONT_VALUE := "前锋：待接入"
const DEFAULT_TREE_TITLE := "建筑树"
const DEFAULT_TREE_EMPTY_STATE := "等待设施或建筑项数据。"
const DEFAULT_TREE_SELECTION_HINT := "请选择一个设施或建筑项后加载建筑树。"
const DEFAULT_SHEET_TITLE := "建造 / 升级说明"
const DEFAULT_UPGRADE_EMPTY_STATE := "等待建筑项说明加载。"
const DEFAULT_CONFIRM_LABEL := "确认"
const DEFAULT_CANCEL_LABEL := "取消"
const DEFAULT_CLOSE_LABEL := "关闭"
const PANEL_MIN_SIZE := Vector2(1120, 760)
const PANEL_CONTENT_MIN_SIZE := Vector2(1040, 0)
const BODY_SCROLL_MIN_SIZE := Vector2(1040, 720)
const TROOP_BUTTON_MIN_SIZE := Vector2(166, 64)
const FACILITY_BUTTON_MIN_SIZE := Vector2(150, 50)

@export var panel_title: String = "部队面板"
@export var panel_subtitle: String = "五部队总览 / 单队编组 / 设施 / 建筑树 / 升级说明"
@export var overview_empty_state_text: String = DEFAULT_OVERVIEW_PLACEHOLDER
@export var formation_empty_state_text: String = DEFAULT_FORMATION_PLACEHOLDER
@export var facility_empty_state_text: String = DEFAULT_FACILITY_PLACEHOLDER

@onready var _title_label: Label = $BodyMargin/BodyVBox/HeaderRow/TitleLabel
@onready var _subtitle_label: Label = $BodyMargin/BodyVBox/HeaderRow/SubtitleLabel
@onready var _close_button: Button = $BodyMargin/BodyVBox/HeaderRow/CloseButton
@onready var _body_margin: MarginContainer = $BodyMargin
@onready var _body_vbox: VBoxContainer = $BodyMargin/BodyVBox
@onready var _overview_title_label: Label = $BodyMargin/BodyVBox/OverviewSection/OverviewMargin/OverviewVBox/OverviewTitleRow/OverviewTitleLabel
@onready var _overview_hint_label: Label = $BodyMargin/BodyVBox/OverviewSection/OverviewMargin/OverviewVBox/OverviewTitleRow/OverviewHintLabel
@onready var _troop_grid: GridContainer = $BodyMargin/BodyVBox/OverviewSection/OverviewMargin/OverviewVBox/TroopGrid
@onready var _troop_placeholder_label: Label = $BodyMargin/BodyVBox/OverviewSection/OverviewMargin/OverviewVBox/TroopPlaceholderLabel
@onready var _formation_title_label: Label = $BodyMargin/BodyVBox/FormationSection/FormationMargin/FormationVBox/FormationTitleLabel
@onready var _camp_value: Label = $BodyMargin/BodyVBox/FormationSection/FormationMargin/FormationVBox/FormationGrid/CampValue
@onready var _mid_value: Label = $BodyMargin/BodyVBox/FormationSection/FormationMargin/FormationVBox/FormationGrid/MidValue
@onready var _front_value: Label = $BodyMargin/BodyVBox/FormationSection/FormationMargin/FormationVBox/FormationGrid/FrontValue
@onready var _camp_label: Label = $BodyMargin/BodyVBox/FormationSection/FormationMargin/FormationVBox/FormationGrid/CampLabel
@onready var _mid_label: Label = $BodyMargin/BodyVBox/FormationSection/FormationMargin/FormationVBox/FormationGrid/MidLabel
@onready var _front_label: Label = $BodyMargin/BodyVBox/FormationSection/FormationMargin/FormationVBox/FormationGrid/FrontLabel
@onready var _formation_hint_label: Label = $BodyMargin/BodyVBox/FormationSection/FormationMargin/FormationVBox/FormationHintLabel
@onready var _facility_title_label: Label = $BodyMargin/BodyVBox/FacilitySection/FacilityMargin/FacilityVBox/FacilityTitleRow/FacilityTitleLabel
@onready var _facility_hint_label: Label = $BodyMargin/BodyVBox/FacilitySection/FacilityMargin/FacilityVBox/FacilityTitleRow/FacilityHintLabel
@onready var _facility_row: HBoxContainer = $BodyMargin/BodyVBox/FacilitySection/FacilityMargin/FacilityVBox/FacilityRow
@onready var _facility_placeholder_label: Label = $BodyMargin/BodyVBox/FacilitySection/FacilityMargin/FacilityVBox/FacilityPlaceholderLabel
@onready var _building_tree: Node = $BodyMargin/BodyVBox/BuildingTreeView
@onready var _upgrade_sheet: Node = $BodyMargin/BodyVBox/BuildUpgradeSheet

var _troop_specs: Array = []
var _troop_buttons: Dictionary = {}
var _active_troop_id: String = ""
var _troop_button_group: ButtonGroup = ButtonGroup.new()

var _facility_specs: Array = []
var _facility_buttons: Dictionary = {}
var _active_facility_id: String = ""
var _facility_button_group: ButtonGroup = ButtonGroup.new()

func _ready() -> void:
	_ensure_body_scroll()
	_apply_layout_polish()
	_refresh_static_copy()
	if _close_button != null and not _close_button.pressed.is_connected(_on_close_button_pressed):
		_close_button.pressed.connect(_on_close_button_pressed)
	_rebuild_troop_buttons()
	_rebuild_facility_buttons()
	_connect_child_signals()
	if _building_tree != null and _building_tree.has_method("clear_tree"):
		_building_tree.call("clear_tree")
	if _upgrade_sheet != null and _upgrade_sheet.has_method("clear_sheet"):
		_upgrade_sheet.call("clear_sheet")

func set_panel_title(value: String) -> void:
	panel_title = value
	_refresh_static_copy()

func set_panel_subtitle(value: String) -> void:
	panel_subtitle = value
	_refresh_static_copy()

func set_troop_overview(troop_specs: Array) -> void:
	_troop_specs = troop_specs.duplicate(true)
	_rebuild_troop_buttons()

func set_troop_snapshot(snapshot: Dictionary) -> void:
	if snapshot.has("title"):
		set_panel_title(str(snapshot.get("title", panel_title)))
	if snapshot.has("subtitle"):
		set_panel_subtitle(str(snapshot.get("subtitle", panel_subtitle)))
	set_troop_overview(snapshot.get("troopSpecs", []) as Array)
	var active_troop_id := str(snapshot.get("activeTroopId", "")).strip_edges()
	if active_troop_id != "":
		set_active_troop(active_troop_id)
	var active_facility_id := str(snapshot.get("activeFacilityId", "")).strip_edges()
	if active_facility_id != "":
		set_active_facility(active_facility_id)

func set_active_troop(troop_id: String) -> void:
	if troop_id.is_empty() or not _troop_buttons.has(troop_id):
		return
	_active_troop_id = troop_id
	for item_id in _troop_buttons.keys():
		var button := _troop_buttons[item_id] as Button
		if button != null:
			button.button_pressed = item_id == _active_troop_id
	_refresh_troop_detail()

func set_active_facility(facility_id: String) -> void:
	if facility_id.is_empty() or not _facility_buttons.has(facility_id):
		return
	_active_facility_id = facility_id
	for item_id in _facility_buttons.keys():
		var button := _facility_buttons[item_id] as Button
		if button != null:
			button.button_pressed = item_id == _active_facility_id
	_refresh_facility_detail()

func set_troop_formation(formation_data: Dictionary) -> void:
	_camp_value.text = str(formation_data.get("camp", DEFAULT_CAMP_VALUE))
	_mid_value.text = str(formation_data.get("mid", DEFAULT_MID_VALUE))
	_front_value.text = str(formation_data.get("front", DEFAULT_FRONT_VALUE))
	_formation_hint_label.text = str(formation_data.get("hint", _resolved_formation_placeholder()))

func set_facility_entries(facility_specs: Array) -> void:
	_facility_specs = facility_specs.duplicate(true)
	_rebuild_facility_buttons()

func set_building_tree(tree_title: String, tree_items: Array) -> void:
	if _building_tree == null:
		return
	if _building_tree.has_method("set_tree_contract"):
		_building_tree.call("set_tree_contract", _build_troop_tree_contract(tree_title, tree_items))

func set_build_upgrade_sheet(payload: Dictionary) -> void:
	if _upgrade_sheet == null:
		return
	if _upgrade_sheet.has_method("set_sheet_contract"):
		_upgrade_sheet.call("set_sheet_contract", _build_troop_upgrade_sheet_contract(payload))

func get_visual_smoke_summary() -> Dictionary:
	var selected_building_id := ""
	if _building_tree != null and _building_tree.has_method("get_selected_building_id"):
		selected_building_id = str(_building_tree.call("get_selected_building_id")).strip_edges()
	var upgrade_sheet_summary: Dictionary = {}
	if _upgrade_sheet != null and _upgrade_sheet.has_method("get_visual_smoke_summary"):
		var upgrade_summary_variant: Variant = _upgrade_sheet.call("get_visual_smoke_summary")
		if upgrade_summary_variant is Dictionary:
			upgrade_sheet_summary = (upgrade_summary_variant as Dictionary).duplicate(true)
	return {
		"title": panel_title,
		"subtitle": panel_subtitle,
		"hasTroopOverview": _troop_grid != null,
		"troopCount": _troop_specs.size(),
		"troopButtonCount": _troop_buttons.size(),
		"activeTroopId": _active_troop_id,
		"hasFacilityEntries": _facility_row != null,
		"facilityCount": _facility_specs.size(),
		"facilityButtonCount": _facility_buttons.size(),
		"activeFacilityId": _active_facility_id,
		"hasBuildingTree": _building_tree != null,
		"selectedBuildingId": selected_building_id,
		"hasSelectedBuilding": selected_building_id != "",
		"hasUpgradeSheet": _upgrade_sheet != null,
		"upgradeSheet": upgrade_sheet_summary,
	}

func show_empty_state(value: String = "") -> void:
	var fallback := value if value.strip_edges() != "" else DEFAULT_PANEL_EMPTY_STATE
	_overview_hint_label.text = fallback
	_troop_placeholder_label.text = _resolved_overview_placeholder() if value.strip_edges() == "" else value
	_facility_placeholder_label.text = _resolved_facility_placeholder() if value.strip_edges() == "" else value
	if _building_tree != null and _building_tree.has_method("set_tree_contract"):
		_building_tree.call("set_tree_contract", _build_troop_tree_contract(DEFAULT_TREE_TITLE, [], "", fallback))
	if _upgrade_sheet != null and _upgrade_sheet.has_method("set_sheet_contract"):
		_upgrade_sheet.call("set_sheet_contract", _build_troop_upgrade_sheet_contract({
			"title": DEFAULT_SHEET_TITLE,
			"subtitle": fallback,
			"body": "",
			"empty_state_text": fallback,
			"has_payload": false,
		}))

func focus_first_action() -> void:
	if _troop_grid != null and _troop_grid.get_child_count() > 0:
		var child := _troop_grid.get_child(0)
		if child is Button:
			(child as Button).grab_focus()
			return
	if _facility_row != null and _facility_row.get_child_count() > 0:
		var facility_child := _facility_row.get_child(0)
		if facility_child is Button:
			(facility_child as Button).grab_focus()
			return
	if _upgrade_sheet != null and _upgrade_sheet.has_method("focus_first_action"):
		_upgrade_sheet.call("focus_first_action")

func _on_close_button_pressed() -> void:
	close_requested.emit()

func clear_all() -> void:
	_troop_specs = []
	_facility_specs = []
	_active_troop_id = ""
	_active_facility_id = ""
	_rebuild_troop_buttons()
	_rebuild_facility_buttons()
	if _building_tree != null and _building_tree.has_method("clear_tree"):
		_building_tree.call("clear_tree")
	if _upgrade_sheet != null and _upgrade_sheet.has_method("clear_sheet"):
		_upgrade_sheet.call("clear_sheet")

func _connect_child_signals() -> void:
	if _building_tree != null and _building_tree.has_signal("building_selected"):
		var building_callback := Callable(self, "_on_building_tree_building_selected")
		if not _building_tree.is_connected("building_selected", building_callback):
			_building_tree.connect("building_selected", building_callback)
	if _upgrade_sheet != null:
		var primary_callback := Callable(self, "_on_upgrade_sheet_primary_requested")
		if _upgrade_sheet.has_signal("primary_action_requested") and not _upgrade_sheet.is_connected("primary_action_requested", primary_callback):
			_upgrade_sheet.connect("primary_action_requested", primary_callback)
		var secondary_callback := Callable(self, "_on_upgrade_sheet_secondary_requested")
		if _upgrade_sheet.has_signal("secondary_action_requested") and not _upgrade_sheet.is_connected("secondary_action_requested", secondary_callback):
			_upgrade_sheet.connect("secondary_action_requested", secondary_callback)

func _refresh_static_copy() -> void:
	_title_label.text = panel_title
	_subtitle_label.text = panel_subtitle
	_overview_title_label.text = DEFAULT_OVERVIEW_TITLE
	_overview_hint_label.text = DEFAULT_OVERVIEW_HINT
	_formation_title_label.text = DEFAULT_FORMATION_TITLE
	_camp_label.text = DEFAULT_CAMP_LABEL
	_mid_label.text = DEFAULT_MID_LABEL
	_front_label.text = DEFAULT_FRONT_LABEL
	_formation_hint_label.text = _resolved_formation_placeholder()
	_facility_title_label.text = DEFAULT_FACILITY_TITLE
	_facility_hint_label.text = _resolved_facility_placeholder()
	_troop_placeholder_label.text = _resolved_overview_placeholder()
	_facility_placeholder_label.text = _resolved_facility_placeholder()

func _ensure_body_scroll() -> void:
	if _body_margin == null or _body_vbox == null:
		return
	if _body_vbox.get_parent() != _body_margin:
		return
	_body_margin.remove_child(_body_vbox)
	var scroll := ScrollContainer.new()
	scroll.name = "BodyScroll"
	scroll.custom_minimum_size = BODY_SCROLL_MIN_SIZE
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_body_margin.add_child(scroll)
	scroll.add_child(_body_vbox)

func _apply_layout_polish() -> void:
	custom_minimum_size = PANEL_MIN_SIZE
	if _body_margin != null:
		_body_margin.custom_minimum_size = BODY_SCROLL_MIN_SIZE
		_body_margin.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_body_margin.size_flags_vertical = Control.SIZE_EXPAND_FILL
	if _body_vbox != null:
		_body_vbox.custom_minimum_size = PANEL_CONTENT_MIN_SIZE
		_body_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_body_vbox.size_flags_vertical = Control.SIZE_EXPAND_FILL
	if _troop_grid != null:
		_troop_grid.columns = 5
		_troop_grid.add_theme_constant_override("h_separation", 10)
		_troop_grid.add_theme_constant_override("v_separation", 8)
	if _facility_row != null:
		_facility_row.add_theme_constant_override("separation", 10)
	_apply_wrap_hint(_subtitle_label)
	_apply_wrap_hint(_overview_hint_label)
	_apply_wrap_hint(_formation_hint_label)
	_apply_wrap_hint(_facility_hint_label)
	for label in [_camp_label, _mid_label, _front_label]:
		if label == null:
			continue
		label.custom_minimum_size = Vector2(56, 0)
		label.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	for value_label in [_camp_value, _mid_value, _front_value]:
		if value_label == null:
			continue
		value_label.custom_minimum_size = Vector2(300, 0)
		value_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_apply_wrap_hint(value_label)
	for child_panel in [_building_tree, _upgrade_sheet]:
		if child_panel is Control:
			var control := child_panel as Control
			control.custom_minimum_size = Vector2(0, 210)
			control.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			control.size_flags_vertical = Control.SIZE_EXPAND_FILL

func _apply_wrap_hint(label: Label) -> void:
	if label == null:
		return
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS

func _resolved_overview_placeholder() -> String:
	return overview_empty_state_text if overview_empty_state_text.strip_edges() != "" else DEFAULT_OVERVIEW_PLACEHOLDER

func _resolved_formation_placeholder() -> String:
	return formation_empty_state_text if formation_empty_state_text.strip_edges() != "" else DEFAULT_FORMATION_PLACEHOLDER

func _resolved_facility_placeholder() -> String:
	return facility_empty_state_text if facility_empty_state_text.strip_edges() != "" else DEFAULT_FACILITY_PLACEHOLDER

func _clear_container_children(container: Container) -> void:
	for child in container.get_children():
		child.queue_free()

func _rebuild_troop_buttons() -> void:
	_clear_container_children(_troop_grid)
	_troop_buttons.clear()
	_troop_button_group = ButtonGroup.new()
	for raw_spec in _troop_specs:
		var spec: Dictionary = raw_spec if raw_spec is Dictionary else {}
		var troop_id := str(spec.get("id", "")).strip_edges()
		if troop_id.is_empty():
			continue
		var button := _create_troop_button(spec)
		_troop_buttons[troop_id] = button
		_troop_grid.add_child(button)
	var has_items := not _troop_buttons.is_empty()
	_troop_placeholder_label.visible = not has_items
	_troop_grid.visible = has_items
	if has_items and (_active_troop_id.is_empty() or not _troop_buttons.has(_active_troop_id)):
		_active_troop_id = str((_troop_specs[0] as Dictionary).get("id", ""))
	set_active_troop(_active_troop_id)
	if not has_items:
		_refresh_troop_detail()

func _create_troop_button(spec: Dictionary) -> Button:
	var troop_id := str(spec.get("id", "")).strip_edges()
	var label_text := str(spec.get("label", troop_id))
	var status_text := str(spec.get("statusText", spec.get("status", "")))
	var subtitle_text := str(spec.get("subtitle", spec.get("summary", "")))
	var enabled := bool(spec.get("enabled", true))
	var selected := bool(spec.get("selected", false))

	var button := Button.new()
	button.name = "Troop_%s" % troop_id
	button.toggle_mode = true
	button.button_group = _troop_button_group
	button.button_pressed = selected
	button.disabled = not enabled
	button.custom_minimum_size = TROOP_BUTTON_MIN_SIZE
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.size_flags_stretch_ratio = 1.0
	button.text = _compose_multiline_label(label_text, subtitle_text, status_text)
	button.tooltip_text = str(spec.get("description", ""))
	button.add_theme_font_size_override("font_size", 12)
	button.pressed.connect(func() -> void:
		_on_troop_pressed(troop_id)
	)
	return button

func _rebuild_facility_buttons() -> void:
	_clear_container_children(_facility_row)
	_facility_buttons.clear()
	_facility_button_group = ButtonGroup.new()
	for raw_spec in _facility_specs:
		var spec: Dictionary = raw_spec if raw_spec is Dictionary else {}
		var facility_id := str(spec.get("id", "")).strip_edges()
		if facility_id.is_empty():
			continue
		var button := _create_facility_button(spec)
		_facility_buttons[facility_id] = button
		_facility_row.add_child(button)
	var has_items := not _facility_buttons.is_empty()
	_facility_placeholder_label.visible = not has_items
	_facility_row.visible = has_items
	if has_items and (_active_facility_id.is_empty() or not _facility_buttons.has(_active_facility_id)):
		_active_facility_id = str((_facility_specs[0] as Dictionary).get("id", ""))
	_refresh_facility_detail()
	if not has_items:
		_facility_hint_label.text = _resolved_facility_placeholder()

func _create_facility_button(spec: Dictionary) -> Button:
	var facility_id := str(spec.get("id", "")).strip_edges()
	var label_text := str(spec.get("label", facility_id))
	var status_text := str(spec.get("statusText", spec.get("status", "")))
	var subtitle_text := str(spec.get("subtitle", spec.get("summary", "")))
	var enabled := bool(spec.get("enabled", true))
	var selected := bool(spec.get("selected", false))

	var button := Button.new()
	button.name = "Facility_%s" % facility_id
	button.toggle_mode = true
	button.button_group = _facility_button_group
	button.button_pressed = selected
	button.disabled = not enabled
	button.custom_minimum_size = FACILITY_BUTTON_MIN_SIZE
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.size_flags_stretch_ratio = 1.0
	button.text = _compose_multiline_label(label_text, subtitle_text, status_text)
	button.tooltip_text = str(spec.get("description", ""))
	button.add_theme_font_size_override("font_size", 12)
	button.pressed.connect(func() -> void:
		_on_facility_pressed(facility_id)
	)
	return button

func _compose_multiline_label(head: String, middle: String, tail: String) -> String:
	var lines: PackedStringArray = PackedStringArray()
	lines.append(_compact_button_line(head, 10))
	var detail_parts: PackedStringArray = PackedStringArray()
	if tail.strip_edges() != "":
		detail_parts.append(_compact_button_line(tail, 8))
	if middle.strip_edges() != "":
		detail_parts.append(_compact_button_line(middle, 12))
	if not detail_parts.is_empty():
		lines.append(" | ".join(detail_parts))
	return "\n".join(lines)

func _compact_button_line(value: String, max_chars: int) -> String:
	var text := value.strip_edges()
	if text.length() <= max_chars:
		return text
	return text.substr(0, max(1, max_chars - 2)) + ".."

func _on_troop_pressed(troop_id: String) -> void:
	if troop_id.is_empty() or not _troop_buttons.has(troop_id):
		return
	_active_troop_id = troop_id
	set_active_troop(troop_id)
	_refresh_troop_detail()
	troop_selected.emit(troop_id)

func _on_facility_pressed(facility_id: String) -> void:
	if facility_id.is_empty() or not _facility_buttons.has(facility_id):
		return
	_active_facility_id = facility_id
	for item_id in _facility_buttons.keys():
		var button := _facility_buttons[item_id] as Button
		if button != null:
			button.button_pressed = item_id == _active_facility_id
	_refresh_facility_detail()
	facility_selected.emit(facility_id)

func _refresh_troop_detail() -> void:
	var active_spec := _find_troop_spec(_active_troop_id)
	if active_spec.is_empty():
		_camp_value.text = DEFAULT_CAMP_VALUE
		_mid_value.text = DEFAULT_MID_VALUE
		_front_value.text = DEFAULT_FRONT_VALUE
		set_facility_entries([])
		return
	set_troop_formation({
		"camp": str(active_spec.get("camp", DEFAULT_CAMP_VALUE)),
		"mid": str(active_spec.get("mid", DEFAULT_MID_VALUE)),
		"front": str(active_spec.get("front", DEFAULT_FRONT_VALUE)),
		"hint": str(active_spec.get("formationHint", _resolved_formation_placeholder())),
	})
	_sync_facility_entries_for_active_troop(active_spec)

func _sync_facility_entries_for_active_troop(active_spec: Dictionary) -> void:
	var previous_facility_id := _active_facility_id
	var facility_entries_variant: Variant = active_spec.get("facilityEntries", [])
	if facility_entries_variant is Array:
		_facility_specs = (facility_entries_variant as Array).duplicate(true)
	else:
		_facility_specs = []
	_rebuild_facility_buttons()
	if previous_facility_id != "" and _facility_buttons.has(previous_facility_id):
		_active_facility_id = previous_facility_id
		_refresh_facility_detail()

func _refresh_facility_detail() -> void:
	var active_spec := _find_facility_spec(_active_facility_id)
	if active_spec.is_empty():
		_facility_hint_label.text = _resolved_facility_placeholder()
		if _building_tree != null and _building_tree.has_method("set_tree_contract"):
			_building_tree.call("set_tree_contract", _build_troop_tree_contract(DEFAULT_TREE_TITLE, [], "", _resolved_facility_placeholder()))
		if _upgrade_sheet != null and _upgrade_sheet.has_method("set_sheet_contract"):
			_upgrade_sheet.call("set_sheet_contract", _build_troop_upgrade_sheet_contract({
				"title": DEFAULT_SHEET_TITLE,
				"subtitle": _resolved_facility_placeholder(),
				"body": "",
				"empty_state_text": _resolved_facility_placeholder(),
				"has_payload": false,
			}))
		return
	_facility_hint_label.text = str(active_spec.get("description", _resolved_facility_placeholder()))
	_apply_facility_payload(active_spec)

func _apply_facility_payload(facility_spec: Dictionary) -> void:
	if _building_tree != null:
		var tree_items: Variant = facility_spec.get("treeItems", [])
		var normalized_tree_items: Array = tree_items as Array if tree_items is Array else []
		if _building_tree.has_method("set_tree_contract"):
			_building_tree.call("set_tree_contract", _build_troop_tree_contract(
				str(facility_spec.get("treeTitle", str(facility_spec.get("label", "建筑树")))),
				normalized_tree_items
			))
	if _upgrade_sheet != null and _upgrade_sheet.has_method("set_sheet_contract"):
		_upgrade_sheet.call("set_sheet_contract", _build_troop_upgrade_sheet_contract(
			facility_spec,
			str(facility_spec.get("sheetTitle", str(facility_spec.get("label", "建造 / 升级说明"))))
		))

func _find_troop_spec(troop_id: String) -> Dictionary:
	for raw_spec in _troop_specs:
		var spec: Dictionary = raw_spec if raw_spec is Dictionary else {}
		if str(spec.get("id", "")) == troop_id:
			return spec
	return {}

func _find_facility_spec(facility_id: String) -> Dictionary:
	for raw_spec in _facility_specs:
		var spec: Dictionary = raw_spec if raw_spec is Dictionary else {}
		if str(spec.get("id", "")) == facility_id:
			return spec
	return {}

func _build_troop_tree_contract(tree_title: String, tree_items: Array, selected_building_id: String = "", empty_state_text: String = "") -> Dictionary:
	var resolved_empty_state_text := empty_state_text
	if resolved_empty_state_text == "":
		resolved_empty_state_text = DEFAULT_TREE_EMPTY_STATE if tree_items.is_empty() else DEFAULT_TREE_SELECTION_HINT
	return {
		"title": tree_title,
		"state_badge": DEFAULT_TREE_TITLE,
		"empty_state_text": resolved_empty_state_text,
		"detail_placeholder": {
			"name": "建筑详情",
			"meta": "等待选择",
			"body": "等待建筑详情。",
			"cost": "消耗：--",
			"effect": "效果：--",
		},
		"tree_items": tree_items,
		"selected_building_id": selected_building_id,
	}

func _build_troop_upgrade_sheet_contract(payload: Dictionary, fallback_title: String = "建造 / 升级说明") -> Dictionary:
	var title := str(payload.get("title", payload.get("sheetTitle", fallback_title)))
	var subtitle := str(payload.get("subtitle", payload.get("sheetSubtitle", "点击建筑项查看说明。")))
	var body := str(payload.get("body", payload.get("sheetBody", payload.get("description", ""))))
	var empty_state_text := str(payload.get("empty_state_text", DEFAULT_UPGRADE_EMPTY_STATE))
	var has_payload := bool(payload.get("has_payload", body.strip_edges() != ""))
	return {
		"title": title,
		"subtitle": subtitle,
		"body": body,
		"cost_summary": str(payload.get("cost_summary", payload.get("costSummary", "消耗：--"))),
		"effect_summary": str(payload.get("effect_summary", payload.get("effectSummary", "效果：--"))),
		"primary_action_label": str(payload.get("primary_action_label", payload.get("primaryActionLabel", DEFAULT_CONFIRM_LABEL))),
		"secondary_action_label": str(payload.get("secondary_action_label", payload.get("secondaryActionLabel", DEFAULT_CANCEL_LABEL))),
		"close_button_label": str(payload.get("close_button_label", payload.get("closeButtonLabel", DEFAULT_CLOSE_LABEL))),
		"empty_state_text": empty_state_text,
		"has_payload": has_payload,
	}

func _on_building_tree_building_selected(building_id: String) -> void:
	building_selected.emit(building_id)
	var active_facility := _find_facility_spec(_active_facility_id)
	if active_facility.is_empty():
		return
	var tree_item := _find_tree_item(active_facility, building_id)
	if tree_item.is_empty():
		return
	if _upgrade_sheet != null and _upgrade_sheet.has_method("set_sheet_contract"):
		_upgrade_sheet.call("set_sheet_contract", _build_troop_upgrade_sheet_contract(tree_item, str(tree_item.get("label", building_id))))

func _find_tree_item(facility_spec: Dictionary, building_id: String) -> Dictionary:
	var tree_items: Variant = facility_spec.get("treeItems", [])
	if not (tree_items is Array):
		return {}
	for raw_item in tree_items:
		var item: Dictionary = raw_item if raw_item is Dictionary else {}
		if str(item.get("id", "")) == building_id:
			return item
	return {}

func _on_upgrade_sheet_primary_requested(_action_id: String) -> void:
	var building_id := ""
	if _building_tree != null and _building_tree.has_method("get_selected_building_id"):
		building_id = str(_building_tree.call("get_selected_building_id"))
	var active_facility := _find_facility_spec(_active_facility_id)
	if active_facility.is_empty():
		return
	var tree_item := _find_tree_item(active_facility, building_id)
	if tree_item.is_empty():
		return
	var submitted_item := tree_item.duplicate(true)
	var submitted_body := str(submitted_item.get("sheetBody", submitted_item.get("description", ""))).strip_edges()
	submitted_item["sheetSubtitle"] = "%s · 已加入模板排队" % str(submitted_item.get("label", building_id))
	submitted_item["sheetBody"] = "%s\n\n升级按钮已进入面板内模板/排队态，本轮不请求后端建筑 authority、不扣资源。" % submitted_body
	if _upgrade_sheet != null and _upgrade_sheet.has_method("set_sheet_contract"):
		_upgrade_sheet.call("set_sheet_contract", _build_troop_upgrade_sheet_contract(submitted_item, str(submitted_item.get("label", building_id))))

func _on_upgrade_sheet_secondary_requested(_action_id: String) -> void:
	pass
