extends Control
class_name BattleReportListPage

signal report_selected(report_id: String)

const BATTLE_REPORT_PRESENTER_SCRIPT := preload("res://scripts/ui/presenters/battle_report_presenter.gd")
const DEFAULT_SHARED_STATE_TITLE := "壳层状态"

@onready var _list_summary_card: PanelContainer = $ListMargin/ListColumn/SOM_L04_ListSummaryCard
@onready var _list_summary_label: Label = $ListMargin/ListColumn/SOM_L04_ListSummaryCard/ListSummaryMargin/ListSummaryLabel
@onready var _shared_state_card: PanelContainer = $ListMargin/ListColumn/SOM_L04A_SharedStateCard
@onready var _shared_state_title_label: Label = $ListMargin/ListColumn/SOM_L04A_SharedStateCard/SharedStateMargin/SharedStateColumn/SharedStateTitleLabel
@onready var _shared_state_flow: HFlowContainer = $ListMargin/ListColumn/SOM_L04A_SharedStateCard/SharedStateMargin/SharedStateColumn/SharedStateFlow
@onready var _report_card_list: VBoxContainer = $ListMargin/ListColumn/SOM_L05_L09_ListBodyRow/SOM_L05_L08_ReportScroll/ReportCardList
@onready var _list_utility_rail: VBoxContainer = $ListMargin/ListColumn/SOM_L05_L09_ListBodyRow/SOM_L09_ListUtilityRail
@onready var _filter_button: Button = $ListMargin/ListColumn/SOM_L05_L09_ListBodyRow/SOM_L09_ListUtilityRail/SOM_L09_FilterButton
@onready var _scroll_hint_label: Label = $ListMargin/ListColumn/SOM_L05_L09_ListBodyRow/SOM_L09_ListUtilityRail/SOM_L09_ScrollHintLabel

var _page_payload: Dictionary = {}

func _ready() -> void:
	_apply_static_styling()
	_refresh_view()

func set_page_payload(page_payload: Dictionary) -> void:
	_page_payload = page_payload.duplicate(true)
	_refresh_view()

func _refresh_view() -> void:
	var page_contract := _coerce_dictionary(_page_payload.get("page_contract", {}))
	var list_frame_contract := _coerce_dictionary(page_contract.get("list_frame_contract", {}))
	var entry_contracts: Array = page_contract.get("entry_contracts", []) as Array
	var display_entry_contracts := _resolve_display_entry_contracts(entry_contracts)
	var shared_state := _coerce_dictionary(_page_payload.get("shared_state", {}))
	var has_entries := not entry_contracts.is_empty()
	_list_summary_label.text = str(list_frame_contract.get("summary_text", "")).strip_edges()
	if _list_summary_label.text == "":
		_list_summary_label.text = "战报列表会把同类交战按时间顺序合并展示，当前先对齐结构与层级。"
	_refresh_shared_state(shared_state, entry_contracts)
	_filter_button.text = str(list_frame_contract.get("filter_label", "筛\n选")) if has_entries else "SOM-L09-C\n筛选位"
	_scroll_hint_label.text = str(list_frame_contract.get("scroll_hint_label", "1\n∨")) if has_entries else "SOM-L09-D\n滚动位"
	_rebuild_entries(display_entry_contracts, shared_state, has_entries)

func _rebuild_entries(entry_contracts: Array, shared_state: Dictionary, interactive: bool = true) -> void:
	_clear_children(_report_card_list)
	for report_card_variant in entry_contracts:
		if not (report_card_variant is Dictionary):
			continue
		_report_card_list.add_child(_build_report_card(report_card_variant as Dictionary, shared_state, interactive))

func _resolve_display_entry_contracts(entry_contracts: Array) -> Array:
	if not entry_contracts.is_empty():
		return entry_contracts
	var empty_state_contracts: Dictionary = BATTLE_REPORT_PRESENTER_SCRIPT.build_empty_state_contracts()
	var fallback_entry_contracts: Variant = empty_state_contracts.get("entry_contracts", [])
	return fallback_entry_contracts as Array if fallback_entry_contracts is Array else []

func _refresh_shared_state(shared_state: Dictionary, entry_contracts: Array) -> void:
	_clear_children(_shared_state_flow)
	_shared_state_title_label.text = DEFAULT_SHARED_STATE_TITLE
	_shared_state_flow.add_child(_build_shared_state_chip(
		"当前页",
		_resolve_shared_state_text(shared_state, "page_id", entry_contracts),
		Color(0.82, 0.74, 0.60, 0.98),
		"SOM_L04A_PageIdChip"
	))
	_shared_state_flow.add_child(_build_shared_state_chip(
		"列表模式",
		_resolve_shared_state_text(shared_state, "list_mode", entry_contracts),
		Color(0.78, 0.72, 0.58, 0.98),
		"SOM_L04A_ListModeChip"
	))
	_shared_state_flow.add_child(_build_shared_state_chip(
		"战报数量",
		_resolve_shared_state_text(shared_state, "report_count", entry_contracts),
		Color(0.62, 0.78, 0.64, 0.98),
		"SOM_L04A_ReportCountChip"
	))
	_shared_state_flow.add_child(_build_shared_state_chip(
		"选中战报",
		_resolve_shared_state_text(shared_state, "selected_report", entry_contracts),
		Color(0.74, 0.80, 0.92, 0.98),
		"SOM_L04A_SelectedReportChip"
	))
	_shared_state_flow.add_child(_build_shared_state_chip(
		"详情页签",
		_resolve_shared_state_text(shared_state, "detail_tab", entry_contracts),
		Color(0.92, 0.78, 0.62, 0.98),
		"SOM_L04A_DetailTabChip"
	))
	_shared_state_card.visible = _shared_state_flow.get_child_count() > 0

func _build_shared_state_chip(title: String, value: String, accent_color: Color, node_name: String = "") -> Control:
	var panel := PanelContainer.new()
	if node_name != "":
		panel.name = node_name
	panel.custom_minimum_size = Vector2(116, 0)
	_apply_panel_linework(panel, Color(0.12, 0.12, 0.14, 0.94), Color(0.30, 0.30, 0.32, 0.92))

	var margin := MarginContainer.new()
	_apply_margin(margin, 8, 6, 8, 6)
	panel.add_child(margin)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 2)
	margin.add_child(column)

	var title_label := _build_label(title, 11, Color(0.72, 0.72, 0.74, 0.96))
	title_label.size_flags_horizontal = 0
	column.add_child(title_label)

	var value_label := _build_label(value, 13, accent_color, true)
	value_label.custom_minimum_size = Vector2(96, 0)
	column.add_child(value_label)
	return panel

func _resolve_shared_state_text(shared_state: Dictionary, key: String, entry_contracts: Array) -> String:
	match key:
		"page_id":
			var page_label := str(shared_state.get("page_id_label", "")).strip_edges()
			if page_label != "":
				return page_label
			match str(shared_state.get(key, "")).strip_edges():
				"detail":
					return "详情页"
				"list":
					return "列表页"
				_:
					return "未定"
		"list_mode":
			var list_mode_label := str(shared_state.get("list_mode_label", "")).strip_edges()
			if list_mode_label != "":
				return list_mode_label
			match str(shared_state.get(key, "")).strip_edges():
				"favorite":
					return "收藏"
				"personal":
					return "个人"
				_:
					return "未定"
		"selected_report":
			var selected_report_label := str(shared_state.get("selected_report_label", "")).strip_edges()
			if selected_report_label != "":
				return _truncate_text(selected_report_label, 20)
			var report_count := maxi(int(shared_state.get("report_count", entry_contracts.size())), 0)
			if report_count <= 0:
				return "结构预览"
			var report_id := str(shared_state.get(key, "")).strip_edges()
			if report_id == "":
				return "未选择"
			for report_card_variant in entry_contracts:
				if not (report_card_variant is Dictionary):
					continue
				var report_card := report_card_variant as Dictionary
				if str(report_card.get("report_id", "")).strip_edges() != report_id:
					continue
				var header_block := _coerce_dictionary(report_card.get("header_block", {}))
				var attacker := str(header_block.get("attacker_team_label", "")).strip_edges()
				var defender := str(header_block.get("defender_team_label", "")).strip_edges()
				if attacker != "" and defender != "":
					return _truncate_text("%s vs %s" % [attacker, defender], 20)
			return _truncate_text(report_id, 20)
		"detail_tab":
			var detail_tab_label := str(shared_state.get("detail_tab_label", "")).strip_edges()
			if detail_tab_label != "":
				return detail_tab_label
			match str(shared_state.get(key, "")).strip_edges():
				"stats":
					return "统计"
				"formation":
					return "阵容详情"
				"battlefield":
					return "战斗地点"
				_:
					return "未定"
		"report_count":
			var report_count_label := str(shared_state.get("report_count_label", "")).strip_edges()
			if report_count_label != "":
				return report_count_label
			return "%s 条" % str(maxi(int(shared_state.get(key, 0)), 0))
		_:
			var text := str(shared_state.get(key, "")).strip_edges()
			return text if text != "" else "未定"

func _truncate_text(text: String, max_length: int) -> String:
	if text.length() <= max_length:
		return text
	return "%s…" % text.substr(0, maxi(max_length - 1, 1))

func _build_structure_box(title: String, min_size: Vector2, expand: bool = false, node_name: String = "") -> Control:
	var panel := PanelContainer.new()
	if node_name != "":
		panel.name = node_name
	panel.custom_minimum_size = min_size
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL if expand else 0
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_apply_panel_linework(panel, Color(0.13, 0.13, 0.15, 0.94), Color(0.36, 0.36, 0.38, 0.92))

	var margin := MarginContainer.new()
	_apply_margin(margin, 8, 8, 8, 8)
	panel.add_child(margin)

	var label := _build_label(title, 13, Color(0.86, 0.86, 0.88, 0.96), true)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	margin.add_child(label)
	return panel

func _build_report_card(report_card: Dictionary, shared_state: Dictionary, interactive: bool = true) -> Control:
	var report_id := str(report_card.get("report_id", "")).strip_edges()
	var header_block := _coerce_dictionary(report_card.get("header_block", {}))
	var body_blocks := report_card.get("body_blocks", []) as Array
	var selected_report_id := str(shared_state.get("selected_report", "")).strip_edges()
	var is_selected := report_id != "" and report_id == selected_report_id
	var button := Button.new()
	button.name = "ReportCard_%s" % (report_id if report_id != "" else "unknown")
	button.text = ""
	button.custom_minimum_size = Vector2(0, 216)
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.alignment = HORIZONTAL_ALIGNMENT_LEFT
	button.clip_text = false
	button.disabled = not interactive
	_apply_button_linework(
		button,
		Color(0.14, 0.14, 0.16, 0.97) if is_selected else Color(0.11, 0.11, 0.12, 0.95),
		Color(0.68, 0.58, 0.28, 0.98) if is_selected else Color(0.30, 0.30, 0.32, 0.92),
		Color(0.96, 0.94, 0.90, 1.0) if is_selected else Color(0.94, 0.94, 0.95, 1.0)
	)
	if interactive:
		button.pressed.connect(Callable(self, "_on_report_button_pressed").bind(report_id))

	var margin := MarginContainer.new()
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_apply_margin(margin, 10, 8, 10, 8)
	button.add_child(margin)

	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_theme_constant_override("separation", 8)
	margin.add_child(column)
	column.add_child(_build_entry_header_block(header_block))

	var body_row := HBoxContainer.new()
	body_row.name = "SOM_L06_L09_BodyRow"
	body_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	body_row.add_theme_constant_override("separation", 8)
	for block_variant in body_blocks:
		if not (block_variant is Dictionary):
			continue
		var block := _build_entry_body_block(block_variant as Dictionary, is_selected)
		if block != null:
			body_row.add_child(block)
	column.add_child(body_row)
	return button

func _build_entry_header_block(header_block: Dictionary) -> Control:
	var header_row := HBoxContainer.new()
	header_row.name = "SOM_L05_HeaderRow"
	header_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	header_row.add_theme_constant_override("separation", 6)
	header_row.add_child(_build_structure_box(str(header_block.get("badge_label", "战")), Vector2(30, 26), false, "SOM_L05_A_Badge"))
	header_row.add_child(_build_label(str(header_block.get("attacker_team_label", "我方标题")), 16, Color(0.92, 0.92, 0.94, 0.98), true, true))
	header_row.add_child(_build_label(str(header_block.get("location_label", "地点 / 等级")), 14, Color(0.74, 0.82, 0.76, 0.96), false, false))
	header_row.add_child(_build_label(str(header_block.get("defender_team_label", "敌方标题")), 16, Color(0.86, 0.80, 0.80, 0.96), true, false))
	return header_row

func _build_entry_body_block(block_payload: Dictionary, is_selected: bool) -> Control:
	match str(block_payload.get("kind", "")).strip_edges():
		"team_cluster":
			return _build_team_cluster(block_payload)
		"result_cluster":
			return _build_result_cluster(block_payload)
		"utility_cluster":
			return _build_utility_cluster(block_payload, is_selected)
		_:
			return null

func _build_team_cluster(team_block: Dictionary) -> Control:
	var is_defender := str(team_block.get("side", "")).strip_edges() == "defender"
	var som_prefix := "SOM_L08" if is_defender else "SOM_L06"
	var panel := PanelContainer.new()
	panel.name = "%s_TeamCluster" % som_prefix
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.custom_minimum_size = Vector2(0, 154)
	_apply_panel_linework(
		panel,
		Color(0.15, 0.09, 0.09, 0.95) if is_defender else Color(0.08, 0.10, 0.16, 0.95),
		Color(0.48, 0.22, 0.22, 0.92) if is_defender else Color(0.22, 0.34, 0.56, 0.92)
	)

	var margin := MarginContainer.new()
	_apply_margin(margin, 8, 8, 8, 8)
	panel.add_child(margin)

	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 6)
	margin.add_child(column)

	var title := str(team_block.get("title", "")).strip_edges()
	if title != "":
		column.add_child(_build_label(title, 13, Color(0.86, 0.84, 0.78, 0.96), true, is_defender))
	column.add_child(_build_label(str(team_block.get("power_label", "0/0")), 15, Color(0.90, 0.90, 0.92, 0.98), false, is_defender))

	var bar := ProgressBar.new()
	bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bar.custom_minimum_size = Vector2(0, 10)
	bar.max_value = float(maxi(int(team_block.get("power_max", 1)), 1))
	bar.value = float(clampi(int(team_block.get("power_current", 0)), 0, int(bar.max_value)))
	bar.show_percentage = false
	_apply_progress_bar_style(
		bar,
		Color(0.73, 0.20, 0.20, 0.96) if is_defender else Color(0.28, 0.52, 0.88, 0.98),
		Color(0.10, 0.10, 0.11, 0.94)
	)
	column.add_child(bar)

	var hero_row := HBoxContainer.new()
	hero_row.name = "%s_HeroRow" % som_prefix
	hero_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hero_row.add_theme_constant_override("separation", 6)
	var hero_list := team_block.get("hero_slots", []) as Array
	var hero_index := 0
	for hero_variant in hero_list:
		if not (hero_variant is Dictionary):
			continue
		hero_index += 1
		hero_row.add_child(_build_compact_hero_slot(hero_variant as Dictionary, "%s_C%s_HeroSlot" % [som_prefix, str(hero_index)]))
	column.add_child(hero_row)
	return panel

func _build_compact_hero_slot(hero: Dictionary, node_name: String = "") -> Control:
	var panel := PanelContainer.new()
	if node_name != "":
		panel.name = node_name
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.custom_minimum_size = Vector2(0, 108)
	_apply_panel_linework(panel, Color(0.12, 0.12, 0.14, 0.96), Color(0.42, 0.35, 0.22, 0.92))

	var margin := MarginContainer.new()
	_apply_margin(margin, 6, 6, 6, 6)
	panel.add_child(margin)

	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 4)
	margin.add_child(column)

	column.add_child(_build_label(str(hero.get("star_label", "★★★")), 11, Color(0.95, 0.78, 0.30, 0.98), false, true))
	column.add_child(_build_label(str(hero.get("name", "武将位")), 13, Color(0.92, 0.92, 0.94, 0.98), true, true))
	column.add_child(_build_label(str(hero.get("troop_label", "兵力 --")), 12, Color(0.78, 0.86, 0.90, 0.94), false, true))
	column.add_child(_build_label(str(hero.get("level_label", "Lv.--")), 12, Color(0.88, 0.80, 0.58, 0.94), false, true))
	return panel

func _build_result_cluster(result_block: Dictionary) -> Control:
	var panel := PanelContainer.new()
	panel.name = "SOM_L07_ResultCluster"
	panel.custom_minimum_size = Vector2(152, 154)
	_apply_panel_linework(panel, Color(0.12, 0.12, 0.13, 0.95), Color(0.54, 0.45, 0.22, 0.92))

	var margin := MarginContainer.new()
	_apply_margin(margin, 10, 10, 10, 10)
	panel.add_child(margin)

	var column := VBoxContainer.new()
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 6)
	margin.add_child(column)

	column.add_child(_build_label(str(result_block.get("result_note", "结果区")), 13, Color(0.80, 0.80, 0.82, 0.96), true, true))
	column.add_child(_build_label(str(result_block.get("result_text", "未结")), 38, Color(0.95, 0.78, 0.34, 0.98), false, true))
	column.add_child(_build_label(str(result_block.get("time_label", "--")), 12, Color(0.80, 0.80, 0.82, 0.96), false, true))
	column.add_child(_build_label(str(result_block.get("enter_detail_label", "进入详情")), 11, Color(0.72, 0.72, 0.74, 0.94), false, true))
	return panel

func _build_utility_cluster(utility_block: Dictionary, is_selected: bool = false) -> Control:
	var column := VBoxContainer.new()
	column.name = "SOM_L09_UtilityCluster"
	column.custom_minimum_size = Vector2(44, 154)
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 6)
	column.add_child(_build_structure_box(str(utility_block.get("index_label", "1")), Vector2(0, 46), true, "SOM_L09_A_Index"))
	var expand_label := "已选" if is_selected else str(utility_block.get("expand_label", "展开"))
	column.add_child(_build_structure_box(expand_label, Vector2(0, 82), true, "SOM_L09_B_Expand"))
	return column

func _apply_static_styling() -> void:
	_apply_panel_linework(_list_summary_card, Color(0.10, 0.10, 0.12, 0.90), Color(0.27, 0.27, 0.29, 0.92))
	_list_summary_label.add_theme_font_size_override("font_size", 12)
	_set_label_color(_list_summary_label, Color(0.72, 0.72, 0.74, 0.94))
	_apply_panel_linework(_shared_state_card, Color(0.10, 0.10, 0.12, 0.92), Color(0.28, 0.28, 0.30, 0.92))
	_shared_state_title_label.add_theme_font_size_override("font_size", 12)
	_set_label_color(_shared_state_title_label, Color(0.78, 0.78, 0.80, 0.96))
	_apply_button_linework(_filter_button, Color(0.17, 0.17, 0.19, 0.95), Color(0.52, 0.52, 0.54, 0.94), Color(0.92, 0.92, 0.94, 0.98))
	_filter_button.custom_minimum_size = Vector2(0, 84)
	_filter_button.alignment = HORIZONTAL_ALIGNMENT_CENTER
	_filter_button.add_theme_font_size_override("font_size", 14)
	_ensure_list_utility_layout()

func _ensure_list_utility_layout() -> void:
	_list_utility_rail.custom_minimum_size = Vector2(48, 0)
	_list_utility_rail.add_theme_constant_override("separation", 4)
	var top_spacer: Control = _list_utility_rail.get_node_or_null("UtilityTopSpacer") as Control
	if top_spacer == null:
		top_spacer = Control.new()
		top_spacer.name = "UtilityTopSpacer"
		top_spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
		_list_utility_rail.add_child(top_spacer)
	var middle_spacer: Control = _list_utility_rail.get_node_or_null("UtilityMiddleSpacer") as Control
	if middle_spacer == null:
		middle_spacer = Control.new()
		middle_spacer.name = "UtilityMiddleSpacer"
		middle_spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
		_list_utility_rail.add_child(middle_spacer)
	var bottom_spacer: Control = _list_utility_rail.get_node_or_null("UtilityBottomSpacer") as Control
	if bottom_spacer == null:
		bottom_spacer = Control.new()
		bottom_spacer.name = "UtilityBottomSpacer"
		bottom_spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
		_list_utility_rail.add_child(bottom_spacer)
	var scroll_hint_shell: PanelContainer = _list_utility_rail.get_node_or_null("ScrollHintShell") as PanelContainer
	if scroll_hint_shell == null:
		scroll_hint_shell = PanelContainer.new()
		scroll_hint_shell.name = "ScrollHintShell"
		_apply_panel_linework(scroll_hint_shell, Color(0.15, 0.15, 0.17, 0.94), Color(0.44, 0.44, 0.46, 0.92))
		var scroll_hint_margin := MarginContainer.new()
		_apply_margin(scroll_hint_margin, 4, 8, 4, 8)
		scroll_hint_shell.add_child(scroll_hint_margin)
		if _scroll_hint_label.get_parent() != null:
			_scroll_hint_label.get_parent().remove_child(_scroll_hint_label)
		scroll_hint_margin.add_child(_scroll_hint_label)
		_list_utility_rail.add_child(scroll_hint_shell)
	_set_label_color(_scroll_hint_label, Color(0.90, 0.90, 0.92, 0.96))
	_scroll_hint_label.add_theme_font_size_override("font_size", 18)
	_scroll_hint_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_scroll_hint_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_list_utility_rail.move_child(top_spacer, 0)
	_list_utility_rail.move_child(_filter_button, 1)
	_list_utility_rail.move_child(middle_spacer, 2)
	_list_utility_rail.move_child(scroll_hint_shell, 3)
	_list_utility_rail.move_child(bottom_spacer, 4)

func _build_label(
	text: String,
	font_size: int,
	color: Color,
	wrap: bool = false,
	align_center: bool = false
) -> Label:
	var label := Label.new()
	label.text = text
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART if wrap else TextServer.AUTOWRAP_OFF
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.add_theme_font_size_override("font_size", font_size)
	_set_label_color(label, color)
	if align_center:
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	return label

func _coerce_dictionary(raw_value: Variant) -> Dictionary:
	if raw_value is Dictionary:
		return raw_value as Dictionary
	return {}

func _clear_children(node: Node) -> void:
	for child in node.get_children():
		node.remove_child(child)
		child.queue_free()

func _apply_margin(container: MarginContainer, left: int, top: int, right: int, bottom: int) -> void:
	container.add_theme_constant_override("margin_left", left)
	container.add_theme_constant_override("margin_top", top)
	container.add_theme_constant_override("margin_right", right)
	container.add_theme_constant_override("margin_bottom", bottom)

func _set_label_color(label: Label, color: Color) -> void:
	label.add_theme_color_override("font_color", color)

func _apply_button_linework(button: Button, bg_color: Color, border_color: Color, font_color: Color) -> void:
	var normal_style := StyleBoxFlat.new()
	normal_style.bg_color = bg_color
	normal_style.border_color = border_color
	normal_style.set_border_width_all(1)
	button.add_theme_stylebox_override("normal", normal_style)

	var hover_style: StyleBoxFlat = normal_style.duplicate()
	hover_style.bg_color = bg_color.lightened(0.06)
	button.add_theme_stylebox_override("hover", hover_style)

	var pressed_style: StyleBoxFlat = normal_style.duplicate()
	pressed_style.bg_color = bg_color.darkened(0.06)
	button.add_theme_stylebox_override("pressed", pressed_style)
	button.add_theme_stylebox_override("focus", pressed_style)
	button.add_theme_stylebox_override("disabled", normal_style)

	button.add_theme_color_override("font_color", font_color)
	button.add_theme_color_override("font_hover_color", font_color)
	button.add_theme_color_override("font_pressed_color", font_color)

func _apply_panel_linework(panel: PanelContainer, bg_color: Color, border_color: Color) -> void:
	var style_box := StyleBoxFlat.new()
	style_box.bg_color = bg_color
	style_box.border_color = border_color
	style_box.set_border_width_all(1)
	panel.add_theme_stylebox_override("panel", style_box)

func _apply_progress_bar_style(bar: ProgressBar, fill_color: Color, background_color: Color) -> void:
	var background_style := StyleBoxFlat.new()
	background_style.bg_color = background_color
	bar.add_theme_stylebox_override("background", background_style)

	var fill_style := StyleBoxFlat.new()
	fill_style.bg_color = fill_color
	bar.add_theme_stylebox_override("fill", fill_style)

func _on_report_button_pressed(report_id: String) -> void:
	report_selected.emit(report_id)
