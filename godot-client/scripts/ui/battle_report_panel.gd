extends Control
class_name BattleReportPanel

signal back_requested
signal close_requested
signal page_changed(page_id: String)

const DEFAULT_LIST_MODE_ID := "personal"
const DEFAULT_DETAIL_TAB_ID := "battlefield"
const BATTLE_REPORT_PRESENTER_SCRIPT := preload("res://scripts/ui/presenters/battle_report_presenter.gd")
const CLOSE_BADGE_ICON := preload("res://assets/themes/slgclient/source/svg_shell_icons/close_badge.svg")
const BACK_BADGE_ICON := preload("res://assets/themes/slgclient/source/svg_shell_icons/back_badge.svg")
const MAIL_NOTICE_ICON := preload("res://assets/themes/slgclient/source/svg_shell_icons/mail_notice.svg")

@onready var _title_label: Label = $PanelFrame/FrameMargin/FrameColumn/HeaderRow/TitleColumn/TitleLabel
@onready var _country_summary_label: Label = $PanelFrame/FrameMargin/FrameColumn/HeaderRow/TitleColumn/CountrySummaryLabel
@onready var _search_button: Button = $PanelFrame/FrameMargin/FrameColumn/HeaderRow/SearchButton
@onready var _close_button: Button = $PanelFrame/FrameMargin/FrameColumn/HeaderRow/CloseButton
@onready var _personal_tab_button: Button = $PanelFrame/FrameMargin/FrameColumn/HeaderStateRow/ListModeRow/PersonalTabButton
@onready var _favorite_tab_button: Button = $PanelFrame/FrameMargin/FrameColumn/HeaderStateRow/ListModeRow/FavoriteTabButton
@onready var _list_mode_row: HBoxContainer = $PanelFrame/FrameMargin/FrameColumn/HeaderStateRow/ListModeRow
@onready var _detail_back_button: Button = $PanelFrame/FrameMargin/FrameColumn/HeaderStateRow/DetailBackButton
@onready var _header_hint_label: Label = $PanelFrame/FrameMargin/FrameColumn/HeaderStateRow/HeaderHintLabel
@onready var _list_page: Control = $PanelFrame/FrameMargin/FrameColumn/PageRoot/ListPage
@onready var _detail_page: Control = $PanelFrame/FrameMargin/FrameColumn/PageRoot/DetailPage

var _snapshot: Dictionary = {}
var _active_list_mode_id: String = DEFAULT_LIST_MODE_ID
var _active_detail_tab_id: String = DEFAULT_DETAIL_TAB_ID
var _active_page_id: String = "list"
var _selected_report_id: String = ""

func _ready() -> void:
	visible = true
	z_index = 220
	mouse_filter = Control.MOUSE_FILTER_STOP
	set_anchors_preset(Control.PRESET_FULL_RECT)
	_search_button.pressed.connect(_on_search_button_pressed)
	_close_button.pressed.connect(_on_close_button_pressed)
	_personal_tab_button.pressed.connect(_on_personal_tab_pressed)
	_favorite_tab_button.pressed.connect(_on_favorite_tab_pressed)
	_detail_back_button.pressed.connect(_on_detail_back_button_pressed)
	if _list_page != null:
		if _list_page.has_signal("report_selected"):
			_list_page.connect("report_selected", Callable(self, "_on_report_selected"))
	if _detail_page != null:
		if _detail_page.has_signal("back_requested"):
			_detail_page.connect("back_requested", Callable(self, "_on_detail_back_button_pressed"))
		if _detail_page.has_signal("detail_tab_selected"):
			_detail_page.connect("detail_tab_selected", Callable(self, "_on_detail_tab_selected"))
	_apply_shell_icons()
	_refresh_view()

func set_battle_report_snapshot(snapshot: Dictionary) -> void:
	_snapshot = snapshot.duplicate(true)
	_active_list_mode_id = str(_snapshot.get("default_list_mode", DEFAULT_LIST_MODE_ID)).strip_edges()
	if _active_list_mode_id == "":
		_active_list_mode_id = DEFAULT_LIST_MODE_ID
	_active_detail_tab_id = str(_snapshot.get("default_detail_tab", DEFAULT_DETAIL_TAB_ID)).strip_edges()
	if _active_detail_tab_id == "":
		_active_detail_tab_id = DEFAULT_DETAIL_TAB_ID
	_active_page_id = "list"
	_selected_report_id = _resolve_first_report_id(_resolve_display_list_entry_contracts(_resolve_list_entry_contracts()))
	_refresh_view()

func set_active_page_id(page_id: String) -> void:
	var resolved_tab_id := page_id.strip_edges()
	if resolved_tab_id == "":
		return
	if resolved_tab_id == "personal" or resolved_tab_id == "favorite":
		_active_list_mode_id = resolved_tab_id
		_active_page_id = "list"
		_selected_report_id = _resolve_first_report_id(_resolve_display_list_entry_contracts(_resolve_list_entry_contracts()))
		_refresh_view()
		return
	if resolved_tab_id == "detail":
		_active_page_id = "detail"
		_active_detail_tab_id = DEFAULT_DETAIL_TAB_ID
		_selected_report_id = _resolve_selected_report_id(_resolve_display_list_entry_contracts(_resolve_list_entry_contracts()))
		_refresh_view()
		return
	if resolved_tab_id == "battlefield" or resolved_tab_id == "stats" or resolved_tab_id == "formation":
		_active_detail_tab_id = resolved_tab_id
		_active_page_id = "detail"
		_selected_report_id = _resolve_selected_report_id(_resolve_display_list_entry_contracts(_resolve_list_entry_contracts()))
		_refresh_view()

func get_active_page_id() -> String:
	if _active_page_id == "detail":
		return _active_detail_tab_id
	return _active_list_mode_id

func _refresh_view() -> void:
	var actual_list_entry_contracts: Array = _resolve_list_entry_contracts()
	var display_list_entry_contracts: Array = _resolve_display_list_entry_contracts(actual_list_entry_contracts)
	_selected_report_id = _resolve_selected_report_id(display_list_entry_contracts)
	_title_label.text = str(_snapshot.get("title", "个人战报"))
	_country_summary_label.text = str(_snapshot.get("country_summary", "国家 / 势力"))
	_search_button.text = str(_snapshot.get("search_label", "搜索"))
	_header_hint_label.text = str(_snapshot.get("header_hint", "点击任意战报进入详情。"))
	_header_hint_label.visible = _active_page_id == "list" and _header_hint_label.text != ""
	_list_mode_row.visible = _active_page_id == "list"
	_detail_back_button.visible = _active_page_id == "detail"
	_list_page.visible = _active_page_id == "list"
	_detail_page.visible = _active_page_id == "detail"
	_refresh_list_mode_buttons()
	_refresh_list_page(display_list_entry_contracts, actual_list_entry_contracts.size())
	_refresh_detail_page(display_list_entry_contracts, actual_list_entry_contracts.size())

func _refresh_list_page(list_entry_contracts: Array, actual_report_count: int) -> void:
	if _list_page == null:
		return
	var shared_state := _build_child_page_shared_state(list_entry_contracts, actual_report_count)
	var list_payload := {
		"page_contract": _build_list_page_contract(list_entry_contracts, actual_report_count),
		"shared_state": shared_state,
	}
	if _list_page.has_method("set_page_payload"):
		_list_page.call("set_page_payload", list_payload)

func _refresh_detail_page(list_entry_contracts: Array, actual_report_count: int) -> void:
	if _detail_page == null:
		return
	var page_payload := {
		"active_tab_id": _active_detail_tab_id,
		"page_contract": _resolve_selected_detail_page_contract(list_entry_contracts, actual_report_count),
		"shared_state": _build_child_page_shared_state(list_entry_contracts, actual_report_count),
	}
	if _detail_page.has_method("set_page_payload"):
		_detail_page.call("set_page_payload", page_payload)

func _resolve_list_summary_text(actual_report_count: int) -> String:
	var lines := _coerce_string_array(_snapshot.get("list_summary_lines", []))
	if actual_report_count <= 0:
		lines.append("暂无正式战报，当前改为显示统一 list/detail 结构预览合同。")
	return "  ·  ".join(lines)

func _build_list_page_contract(list_entry_contracts: Array, actual_report_count: int) -> Dictionary:
	return {
		"page_id": "list",
		"page_label": "战报列表",
		"list_frame_contract": {
			"summary_text": _resolve_list_summary_text(actual_report_count),
			"filter_label": str(_snapshot.get("filter_label", "筛\n选")),
			"scroll_hint_label": str(_snapshot.get("scroll_hint_label", "1\n∨")),
		},
		"entry_contracts": list_entry_contracts,
	}

func _build_child_page_shared_state(list_entry_contracts: Array, actual_report_count: int) -> Dictionary:
	var shared_state: Dictionary = {}
	var raw_shared_state: Variant = _snapshot.get("shared_state", {})
	if raw_shared_state is Dictionary:
		shared_state = (raw_shared_state as Dictionary).duplicate(true)
	var selected_report_card := _resolve_selected_report_card(list_entry_contracts)
	shared_state["page_id"] = _active_page_id
	shared_state["page_id_label"] = _resolve_page_id_label(_active_page_id)
	shared_state["list_mode"] = _active_list_mode_id
	shared_state["list_mode_label"] = _resolve_list_mode_label(_active_list_mode_id)
	shared_state["selected_report"] = _selected_report_id
	shared_state["selected_report_label"] = "结构预览" if actual_report_count <= 0 else _resolve_selected_report_label(selected_report_card)
	shared_state["detail_tab"] = _active_detail_tab_id
	shared_state["detail_tab_label"] = _resolve_detail_tab_label(_active_detail_tab_id)
	shared_state["report_count"] = actual_report_count
	shared_state["report_count_label"] = "%s 条" % str(actual_report_count)
	return shared_state

func _resolve_page_id_label(page_id: String) -> String:
	match page_id:
		"detail":
			return "详情页"
		"list":
			return "列表页"
		_:
			return "未定"

func _resolve_list_mode_label(list_mode_id: String) -> String:
	match list_mode_id:
		"favorite":
			return "收藏"
		"personal":
			return "个人"
		_:
			return "未定"

func _resolve_detail_tab_label(detail_tab_id: String) -> String:
	match detail_tab_id:
		"stats":
			return "统计"
		"formation":
			return "阵容详情"
		"battlefield":
			return "战斗地点"
		_:
			return "未定"

func _resolve_selected_report_card(list_entry_contracts: Array) -> Dictionary:
	if list_entry_contracts.is_empty():
		return {}
	for report_card_variant in list_entry_contracts:
		if not (report_card_variant is Dictionary):
			continue
		var report_card := report_card_variant as Dictionary
		if str(report_card.get("report_id", "")).strip_edges() == _selected_report_id:
			return report_card
	return list_entry_contracts[0] as Dictionary if list_entry_contracts[0] is Dictionary else {}

func _resolve_selected_report_label(report_card: Dictionary) -> String:
	if report_card.is_empty():
		return "未选择"
	var report_label := str(report_card.get("report_label", "")).strip_edges()
	if report_label != "":
		return report_label
	var header_block := report_card.get("header_block", {}) as Dictionary
	var attacker := str(header_block.get("attacker_team_label", "")).strip_edges()
	var defender := str(header_block.get("defender_team_label", "")).strip_edges()
	if attacker != "" and defender != "":
		return "%s vs %s" % [attacker, defender]
	return "未选择"

func _refresh_list_mode_buttons() -> void:
	_apply_mode_button_state(_personal_tab_button, _active_list_mode_id == "personal")
	_apply_mode_button_state(_favorite_tab_button, _active_list_mode_id == "favorite")

func _apply_mode_button_state(button: Button, is_active: bool) -> void:
	if button == null:
		return
	var font_color := Color(0.95, 0.90, 0.78, 1.0) if is_active else Color(0.76, 0.74, 0.70, 0.96)
	button.add_theme_color_override("font_color", font_color)
	button.add_theme_color_override("font_hover_color", font_color)
	button.add_theme_color_override("font_pressed_color", font_color)
	button.modulate = Color(1, 1, 1, 1.0) if is_active else Color(0.88, 0.88, 0.88, 0.94)

func _resolve_list_entry_contracts() -> Array:
	var modes: Dictionary = _snapshot.get("list_modes", {}) as Dictionary
	var mode_payload: Variant = modes.get(_active_list_mode_id, {})
	if mode_payload is Dictionary:
		var raw_entry_contracts: Variant = (mode_payload as Dictionary).get("entry_contracts", [])
		if raw_entry_contracts is Array:
			return raw_entry_contracts as Array
	return []

func _resolve_display_list_entry_contracts(list_entry_contracts: Array) -> Array:
	if not list_entry_contracts.is_empty():
		return list_entry_contracts
	return _resolve_empty_state_entry_contracts()

func _resolve_first_report_id(list_entry_contracts: Array) -> String:
	for report_card_variant in list_entry_contracts:
		if not (report_card_variant is Dictionary):
			continue
		var report_id := str((report_card_variant as Dictionary).get("report_id", "")).strip_edges()
		if report_id != "":
			return report_id
	return ""

func _resolve_selected_report_id(list_entry_contracts: Array) -> String:
	if list_entry_contracts.is_empty():
		return ""
	for report_card_variant in list_entry_contracts:
		if not (report_card_variant is Dictionary):
			continue
		var report_id := str((report_card_variant as Dictionary).get("report_id", "")).strip_edges()
		if report_id != "" and report_id == _selected_report_id:
			return report_id
	return _resolve_first_report_id(list_entry_contracts)

func _resolve_selected_detail_page_contract(list_entry_contracts: Array, actual_report_count: int) -> Dictionary:
	var detail_contracts_by_id := _resolve_detail_contracts_by_id()
	if actual_report_count <= 0:
		return _resolve_empty_state_detail_page_contract()
	var fallback_payload := {}
	for report_card_variant in list_entry_contracts:
		if not (report_card_variant is Dictionary):
			continue
		var report_card := report_card_variant as Dictionary
		var selected_page_contract := detail_contracts_by_id.get(str(report_card.get("report_id", "")).strip_edges(), {}) as Dictionary
		if fallback_payload.is_empty():
			fallback_payload = selected_page_contract
		if str(report_card.get("report_id", "")).strip_edges() == _selected_report_id:
			return selected_page_contract
	return fallback_payload if not fallback_payload.is_empty() else _resolve_empty_state_detail_page_contract()

func _resolve_empty_state_contracts() -> Dictionary:
	return BATTLE_REPORT_PRESENTER_SCRIPT.build_empty_state_contracts()

func _resolve_empty_state_entry_contracts() -> Array:
	var empty_state_contracts := _resolve_empty_state_contracts()
	var entry_contracts_variant: Variant = empty_state_contracts.get("entry_contracts", [])
	return entry_contracts_variant as Array if entry_contracts_variant is Array else []

func _resolve_empty_state_detail_page_contract() -> Dictionary:
	var empty_state_contracts := _resolve_empty_state_contracts()
	var detail_contracts_variant: Variant = empty_state_contracts.get("detail_contracts_by_id", {})
	if not (detail_contracts_variant is Dictionary):
		return {}
	var detail_contracts_by_id: Dictionary = detail_contracts_variant as Dictionary
	var first_report_id: String = _resolve_first_report_id(_resolve_empty_state_entry_contracts())
	if first_report_id == "":
		for report_id_variant in detail_contracts_by_id.keys():
			var resolved_payload: Variant = detail_contracts_by_id.get(report_id_variant, {})
			if resolved_payload is Dictionary:
				return resolved_payload as Dictionary
		return {}
	var detail_page_contract: Variant = detail_contracts_by_id.get(first_report_id, {})
	return detail_page_contract as Dictionary if detail_page_contract is Dictionary else {}

func _resolve_detail_contracts_by_id() -> Dictionary:
	var modes: Dictionary = _snapshot.get("list_modes", {}) as Dictionary
	var mode_payload: Variant = modes.get(_active_list_mode_id, {})
	if mode_payload is Dictionary:
		var detail_contracts_by_id: Variant = (mode_payload as Dictionary).get("detail_contracts_by_id", {})
		if detail_contracts_by_id is Dictionary:
			return detail_contracts_by_id as Dictionary
	return {}

func _coerce_string_array(raw_value: Variant) -> Array[String]:
	var result: Array[String] = []
	if raw_value is Array:
		for item in raw_value as Array:
			var text := str(item).strip_edges()
			if text != "":
				result.append(text)
	return result

func _apply_shell_icons() -> void:
	_close_button.icon = CLOSE_BADGE_ICON
	_close_button.expand_icon = true
	_close_button.icon_alignment = HORIZONTAL_ALIGNMENT_LEFT
	_close_button.add_theme_constant_override("h_separation", 8)
	_search_button.icon = MAIL_NOTICE_ICON
	_search_button.expand_icon = true
	_search_button.icon_alignment = HORIZONTAL_ALIGNMENT_LEFT
	_search_button.add_theme_constant_override("h_separation", 8)
	_detail_back_button.icon = BACK_BADGE_ICON
	_detail_back_button.expand_icon = true
	_detail_back_button.icon_alignment = HORIZONTAL_ALIGNMENT_LEFT
	_detail_back_button.add_theme_constant_override("h_separation", 8)

func _on_search_button_pressed() -> void:
	_header_hint_label.text = "搜索入口位置已固定；后续接正式筛选链。"

func _on_close_button_pressed() -> void:
	close_requested.emit()

func _on_personal_tab_pressed() -> void:
	_active_list_mode_id = "personal"
	_active_page_id = "list"
	_selected_report_id = _resolve_first_report_id(_resolve_list_entry_contracts())
	_refresh_view()
	page_changed.emit(_active_list_mode_id)

func _on_favorite_tab_pressed() -> void:
	_active_list_mode_id = "favorite"
	_active_page_id = "list"
	_selected_report_id = _resolve_first_report_id(_resolve_list_entry_contracts())
	_refresh_view()
	page_changed.emit(_active_list_mode_id)

func _on_report_selected(report_id: String) -> void:
	_selected_report_id = report_id.strip_edges()
	_active_page_id = "detail"
	_active_detail_tab_id = DEFAULT_DETAIL_TAB_ID
	_refresh_view()
	page_changed.emit("detail")

func _on_detail_back_button_pressed() -> void:
	_active_page_id = "list"
	_refresh_view()
	page_changed.emit(_active_list_mode_id)

func _on_detail_tab_selected(tab_id: String) -> void:
	_active_detail_tab_id = tab_id
	_refresh_view()
	page_changed.emit(tab_id)
