extends Control
class_name BattleReportDetailPage

signal back_requested
signal detail_tab_selected(tab_id: String)

const DEFAULT_DETAIL_TAB_ID := "battlefield"
const DEFAULT_DETAIL_STATE_TITLE := "壳层状态"
const DEFAULT_REPLAY_LABEL := "战况回放"
const BATTLE_REPORT_ICON := preload("res://assets/themes/slgclient/source/svg_shell_icons/battle_report.svg")

@onready var _attacker_power_label: Label = $DetailMargin/DetailColumn/SOM_D01_D02_TopRow/SOM_D01_AttackerHeaderCard/AttackerHeaderMargin/AttackerHeaderColumn/AttackerPowerLabel
@onready var _attacker_power_bar: ProgressBar = $DetailMargin/DetailColumn/SOM_D01_D02_TopRow/SOM_D01_AttackerHeaderCard/AttackerHeaderMargin/AttackerHeaderColumn/AttackerPowerBar
@onready var _attacker_name_label: Label = $DetailMargin/DetailColumn/SOM_D01_D02_TopRow/SOM_D01_AttackerHeaderCard/AttackerHeaderMargin/AttackerHeaderColumn/AttackerNameLabel
@onready var _result_label: Label = $DetailMargin/DetailColumn/SOM_D01_D02_TopRow/SOM_D02_ResultHeaderCard/ResultHeaderMargin/ResultHeaderColumn/ResultLabel
@onready var _outcome_note_label: Label = $DetailMargin/DetailColumn/SOM_D01_D02_TopRow/SOM_D02_ResultHeaderCard/ResultHeaderMargin/ResultHeaderColumn/OutcomeNoteLabel
@onready var _defender_power_label: Label = $DetailMargin/DetailColumn/SOM_D01_D02_TopRow/SOM_D01_DefenderHeaderCard/DefenderHeaderMargin/DefenderHeaderColumn/DefenderPowerLabel
@onready var _defender_power_bar: ProgressBar = $DetailMargin/DetailColumn/SOM_D01_D02_TopRow/SOM_D01_DefenderHeaderCard/DefenderHeaderMargin/DefenderHeaderColumn/DefenderPowerBar
@onready var _defender_name_label: Label = $DetailMargin/DetailColumn/SOM_D01_D02_TopRow/SOM_D01_DefenderHeaderCard/DefenderHeaderMargin/DefenderHeaderColumn/DefenderNameLabel
@onready var _attacker_hero_row: HBoxContainer = $DetailMargin/DetailColumn/SOM_D03_D05_BattleRow/SOM_D03_AttackerHeroRow
@onready var _reward_title: Label = $DetailMargin/DetailColumn/SOM_D03_D05_BattleRow/SOM_D04_OutcomeCenterCard/OutcomeCenterMargin/OutcomeCenterColumn/RewardTitle
@onready var _reward_body: Label = $DetailMargin/DetailColumn/SOM_D03_D05_BattleRow/SOM_D04_OutcomeCenterCard/OutcomeCenterMargin/OutcomeCenterColumn/RewardBody
@onready var _replay_button: Button = $DetailMargin/DetailColumn/SOM_D03_D05_BattleRow/SOM_D04_OutcomeCenterCard/OutcomeCenterMargin/OutcomeCenterColumn/ReplayButton
@onready var _defender_hero_row: HBoxContainer = $DetailMargin/DetailColumn/SOM_D03_D05_BattleRow/SOM_D05_DefenderHeroRow
@onready var _attacker_morale_label: Label = $DetailMargin/DetailColumn/SOM_D06_MoraleRow/AttackerMoraleLabel
@onready var _defender_morale_label: Label = $DetailMargin/DetailColumn/SOM_D06_MoraleRow/DefenderMoraleLabel
@onready var _detail_section_column: VBoxContainer = $DetailMargin/DetailColumn/SOM_D07_DetailSectionCard/DetailSectionMargin/DetailSectionColumn
@onready var _detail_section_title: Label = $DetailMargin/DetailColumn/SOM_D07_DetailSectionCard/DetailSectionMargin/DetailSectionColumn/DetailSectionTitle
@onready var _detail_state_card: PanelContainer = $DetailMargin/DetailColumn/SOM_D07_DetailSectionCard/DetailSectionMargin/DetailSectionColumn/SOM_D07_StateCard
@onready var _detail_state_title_label: Label = $DetailMargin/DetailColumn/SOM_D07_DetailSectionCard/DetailSectionMargin/DetailSectionColumn/SOM_D07_StateCard/DetailStateMargin/DetailStateColumn/DetailStateTitleLabel
@onready var _detail_state_flow: HFlowContainer = $DetailMargin/DetailColumn/SOM_D07_DetailSectionCard/DetailSectionMargin/DetailSectionColumn/SOM_D07_StateCard/DetailStateMargin/DetailStateColumn/DetailStateFlow
@onready var _detail_section_body: Label = $DetailMargin/DetailColumn/SOM_D07_DetailSectionCard/DetailSectionMargin/DetailSectionColumn/DetailSectionBody
@onready var _share_button: Button = $DetailMargin/DetailColumn/SOM_D08_D10_BottomRow/SOM_D08_ShareButton
@onready var _favorite_button: Button = $DetailMargin/DetailColumn/SOM_D08_D10_BottomRow/SOM_D08_FavoriteButton
@onready var _battlefield_tab_button: Button = $DetailMargin/DetailColumn/SOM_D08_D10_BottomRow/SOM_D09_FooterTabRow/BattlefieldTabButton
@onready var _stats_tab_button: Button = $DetailMargin/DetailColumn/SOM_D08_D10_BottomRow/SOM_D09_FooterTabRow/StatsTabButton
@onready var _formation_tab_button: Button = $DetailMargin/DetailColumn/SOM_D08_D10_BottomRow/SOM_D09_FooterTabRow/FormationTabButton
@onready var _collapse_button: Button = $DetailMargin/DetailColumn/SOM_D08_D10_BottomRow/SOM_D10_CollapseButton

var _page_payload: Dictionary = {}
var _detail_page_contract: Dictionary = {}
var _active_detail_tab_id: String = DEFAULT_DETAIL_TAB_ID
var _detail_section_content: VBoxContainer = null

func _ready() -> void:
	_replay_button.pressed.connect(_on_replay_button_pressed)
	_share_button.pressed.connect(_on_share_button_pressed)
	_favorite_button.pressed.connect(_on_favorite_button_pressed)
	_battlefield_tab_button.pressed.connect(_on_detail_tab_pressed.bind("battlefield"))
	_stats_tab_button.pressed.connect(_on_detail_tab_pressed.bind("stats"))
	_formation_tab_button.pressed.connect(_on_detail_tab_pressed.bind("formation"))
	_collapse_button.pressed.connect(_on_collapse_button_pressed)
	_replay_button.icon = BATTLE_REPORT_ICON
	_replay_button.expand_icon = true
	_replay_button.icon_alignment = HORIZONTAL_ALIGNMENT_LEFT
	_replay_button.add_theme_constant_override("h_separation", 8)
	_apply_static_styling()
	_ensure_detail_section_content()
	_refresh_view()

func set_page_payload(page_payload: Dictionary) -> void:
	_page_payload = page_payload.duplicate(true)
	_detail_page_contract = _page_payload.get("page_contract", {}) as Dictionary
	_active_detail_tab_id = str(_page_payload.get("active_tab_id", DEFAULT_DETAIL_TAB_ID)).strip_edges()
	if _active_detail_tab_id == "":
		_active_detail_tab_id = DEFAULT_DETAIL_TAB_ID
	_refresh_view()

func _refresh_view() -> void:
	var detail_page_contract := _detail_page_contract
	var shared_state := _coerce_dictionary(_page_payload.get("shared_state", {}))
	if detail_page_contract.is_empty():
		detail_page_contract = {}
	var detail_frame_contract := _resolve_detail_frame_contract(detail_page_contract)
	_attacker_power_label.text = str(detail_frame_contract.get("attacker_power_label", "SOM-D01-A 数值位"))
	_attacker_name_label.text = str(detail_frame_contract.get("attacker_team_label", "SOM-D01-C 我方标题位"))
	_result_label.text = str(detail_frame_contract.get("result_text", "胜负位"))
	_outcome_note_label.text = str(detail_frame_contract.get("outcome_note", "SOM-D02-A 顶部注释位"))
	_defender_power_label.text = str(detail_frame_contract.get("defender_power_label", "SOM-D01-D 数值位"))
	_defender_name_label.text = str(detail_frame_contract.get("defender_team_label", "SOM-D01-F 敌方标题位"))
	_reward_title.text = str(detail_frame_contract.get("reward_title", "SOM-D04 奖励 / 回放区"))
	_reward_body.text = "\n".join(_coerce_string_array(detail_frame_contract.get("reward_lines", [])))
	_replay_button.text = str(detail_frame_contract.get("replay_label", DEFAULT_REPLAY_LABEL))
	_attacker_morale_label.text = str(detail_frame_contract.get("attacker_morale_label", "SOM-D06-A 我方士气位"))
	_defender_morale_label.text = str(detail_frame_contract.get("defender_morale_label", "SOM-D06-B 敌方士气位"))
	_share_button.text = str(detail_frame_contract.get("share_label", "分享"))
	_favorite_button.text = str(detail_frame_contract.get("favorite_label", "收藏"))
	_apply_progress_bar_values(_attacker_power_bar, int(detail_frame_contract.get("attacker_power_current", 0)), int(detail_frame_contract.get("attacker_power_max", 1)), Color(0.28, 0.52, 0.88, 0.98))
	_apply_progress_bar_values(_defender_power_bar, int(detail_frame_contract.get("defender_power_current", 0)), int(detail_frame_contract.get("defender_power_max", 1)), Color(0.73, 0.20, 0.20, 0.96))
	_rebuild_detail_hero_row(_attacker_hero_row, detail_frame_contract.get("attacker_slots", []), false)
	_rebuild_detail_hero_row(_defender_hero_row, detail_frame_contract.get("defender_slots", []), true)
	_refresh_detail_tab_buttons()
	_refresh_shared_state(shared_state, detail_frame_contract)
	_share_button.disabled = _is_empty_state_preview(shared_state)
	_favorite_button.disabled = _is_empty_state_preview(shared_state)
	_collapse_button.text = _resolve_collapse_button_text(shared_state)
	_rebuild_detail_section(detail_page_contract)

func _resolve_detail_frame_contract(detail_page_contract: Dictionary) -> Dictionary:
	var detail_frame_contract := _coerce_dictionary(detail_page_contract.get("detail_frame_contract", {}))
	return detail_frame_contract if not detail_frame_contract.is_empty() else detail_page_contract

func _refresh_shared_state(shared_state: Dictionary, detail_frame_contract: Dictionary) -> void:
	_clear_children(_detail_state_flow)
	_detail_state_title_label.text = DEFAULT_DETAIL_STATE_TITLE
	_detail_state_flow.add_child(_build_shared_state_chip(
		"当前页",
		_resolve_shared_state_text(shared_state, "page_id", detail_frame_contract),
		Color(0.82, 0.74, 0.60, 0.98),
		"SOM_D07_PageIdChip"
	))
	_detail_state_flow.add_child(_build_shared_state_chip(
		"来源列表",
		_resolve_shared_state_text(shared_state, "list_mode", detail_frame_contract),
		Color(0.78, 0.72, 0.58, 0.98),
		"SOM_D07_ListModeChip"
	))
	_detail_state_flow.add_child(_build_shared_state_chip(
		"战报数量",
		_resolve_shared_state_text(shared_state, "report_count", detail_frame_contract),
		Color(0.62, 0.78, 0.64, 0.98),
		"SOM_D07_ReportCountChip"
	))
	_detail_state_flow.add_child(_build_shared_state_chip(
		"当前战报",
		_resolve_shared_state_text(shared_state, "selected_report", detail_frame_contract),
		Color(0.74, 0.80, 0.92, 0.98),
		"SOM_D07_SelectedReportChip"
	))
	_detail_state_flow.add_child(_build_shared_state_chip(
		"详情页签",
		_resolve_shared_state_text(shared_state, "detail_tab", detail_frame_contract),
		Color(0.92, 0.78, 0.62, 0.98),
		"SOM_D07_DetailTabChip"
	))
	_detail_state_card.visible = _detail_state_flow.get_child_count() > 0

func _build_shared_state_chip(title: String, value: String, accent_color: Color, node_name: String = "") -> Control:
	var panel := PanelContainer.new()
	if node_name != "":
		panel.name = node_name
	panel.custom_minimum_size = Vector2(120, 0)
	_apply_panel_linework(panel, Color(0.12, 0.12, 0.14, 0.94), Color(0.30, 0.30, 0.32, 0.92))

	var margin := MarginContainer.new()
	_apply_margin(margin, 8, 6, 8, 6)
	panel.add_child(margin)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 2)
	margin.add_child(column)

	var title_label := Label.new()
	title_label.text = title
	title_label.add_theme_font_size_override("font_size", 11)
	title_label.add_theme_color_override("font_color", Color(0.72, 0.72, 0.74, 0.96))
	column.add_child(title_label)

	var value_label := Label.new()
	value_label.text = value
	value_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	value_label.custom_minimum_size = Vector2(100, 0)
	value_label.add_theme_font_size_override("font_size", 13)
	value_label.add_theme_color_override("font_color", accent_color)
	column.add_child(value_label)
	return panel

func _resolve_shared_state_text(shared_state: Dictionary, key: String, detail_frame_contract: Dictionary) -> String:
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
				return _truncate_text(selected_report_label, 24)
			var report_count := maxi(int(shared_state.get("report_count", 0)), 0)
			var report_id := str(shared_state.get(key, "")).strip_edges()
			if report_id == "":
				return "结构预览" if report_count <= 0 else "未选择"
			var attacker := str(detail_frame_contract.get("attacker_team_label", "")).strip_edges()
			var defender := str(detail_frame_contract.get("defender_team_label", "")).strip_edges()
			if attacker != "" and defender != "":
				return _truncate_text("%s vs %s" % [attacker, defender], 24)
			return _truncate_text(report_id, 24)
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

func _resolve_collapse_button_text(shared_state: Dictionary) -> String:
	var list_mode := str(shared_state.get("list_mode", "")).strip_edges()
	if list_mode == "favorite":
		return "返\n藏"
	return "返\n列"

func _is_empty_state_preview(shared_state: Dictionary) -> bool:
	return maxi(int(shared_state.get("report_count", 0)), 0) <= 0

func _truncate_text(text: String, max_length: int) -> String:
	if text.length() <= max_length:
		return text
	return "%s…" % text.substr(0, maxi(max_length - 1, 1))

func _rebuild_detail_section(detail_page_contract: Dictionary) -> void:
	_clear_children(_detail_section_content)
	var page_contract := _resolve_detail_page_contract(detail_page_contract)
	_detail_section_title.text = str(page_contract.get("page_label", _resolve_detail_tab_title())).strip_edges()
	if _detail_section_title.text == "":
		_detail_section_title.text = _resolve_detail_tab_title()
	_detail_section_body.text = str(page_contract.get("summary", "当前只固定结构关系。")).strip_edges()
	if _detail_section_body.text == "":
		_detail_section_body.text = "当前只固定结构关系。"
	_detail_section_body.visible = not bool(page_contract.get("hide_summary_body", false))
	_rebuild_detail_page_blocks(page_contract, _resolve_detail_frame_contract(detail_page_contract))

func _resolve_detail_page_contract(detail_page_contract: Dictionary) -> Dictionary:
	var detail_pages := _coerce_dictionary(detail_page_contract.get("detail_pages", {}))
	var page_contract := _coerce_dictionary(detail_pages.get(_active_detail_tab_id, {}))
	if not page_contract.is_empty():
		return page_contract
	return {
		"page_id": _active_detail_tab_id,
		"page_label": _resolve_detail_tab_title(),
		"summary": "当前页等待 detail_page_contract child-page 合同。",
		"content_blocks": [
			{
				"kind": "info_card",
				"title": _resolve_detail_tab_title(),
				"accent_key": "generic",
				"node_name": "SOM_D07_DetailCard",
				"lines": ["当前只固定结构关系。"],
			},
		],
	}

func _rebuild_detail_page_blocks(page_contract: Dictionary, detail_frame_contract: Dictionary) -> void:
	var content_blocks := page_contract.get("content_blocks", []) as Array
	if content_blocks.is_empty():
		_detail_section_content.add_child(_build_detail_info_card("战报详情", ["当前只固定结构关系。"], _resolve_accent_color("generic"), "SOM_D07_DetailCard"))
		return
	for block_variant in content_blocks:
		if not (block_variant is Dictionary):
			continue
		var block := _build_detail_page_block(block_variant as Dictionary, detail_frame_contract)
		if block != null:
			_detail_section_content.add_child(block)

func _build_detail_page_block(block_payload: Dictionary, detail_frame_contract: Dictionary) -> Control:
	var kind := str(block_payload.get("kind", "info_card")).strip_edges()
	var node_name := str(block_payload.get("node_name", "")).strip_edges()
	match kind:
		"roster_card":
			return _build_detail_roster_card(
				str(block_payload.get("title", "阵容详情")),
				_resolve_roster_block_slots(block_payload, detail_frame_contract),
				bool(block_payload.get("is_defender", false)),
				node_name
			)
		"structure_group":
			return _build_structure_group_block(block_payload)
		_:
			return _build_detail_info_card(
				str(block_payload.get("title", "战报详情")),
				_coerce_string_array(block_payload.get("lines", [])),
				_resolve_accent_color(str(block_payload.get("accent_key", "generic"))),
				node_name
			)

func _resolve_roster_block_slots(block_payload: Dictionary, detail_frame_contract: Dictionary) -> Variant:
	var slot_source := str(block_payload.get("slot_source", "")).strip_edges()
	if slot_source != "":
		return detail_frame_contract.get(slot_source, [])
	return block_payload.get("slots", [])

func _build_structure_group_block(group_payload: Dictionary) -> Control:
	var layout := str(group_payload.get("layout", "stack")).strip_edges()
	var node_name := str(group_payload.get("node_name", "SOM_D07_Group")).strip_edges()
	var boxes := group_payload.get("boxes", []) as Array
	if layout == "row":
		var row := HBoxContainer.new()
		row.name = node_name
		row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_theme_constant_override("separation", 8)
		for item_variant in boxes:
			if not (item_variant is Dictionary):
				continue
			row.add_child(_build_structure_item_box(item_variant as Dictionary, true))
		return row
	return _build_structure_stack_group(boxes, node_name)

func _build_structure_stack_group(items: Array, node_name: String) -> Control:
	var panel := PanelContainer.new()
	panel.name = node_name
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_apply_panel_linework(panel, Color(0.11, 0.11, 0.13, 0.95), Color(0.32, 0.32, 0.34, 0.92))

	var margin := MarginContainer.new()
	_apply_margin(margin, 10, 10, 10, 10)
	panel.add_child(margin)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	margin.add_child(column)

	for item_variant in items:
		if not (item_variant is Dictionary):
			continue
		column.add_child(_build_structure_item_box(item_variant as Dictionary, true))
	return panel

func _build_structure_item_box(item_payload: Dictionary, expand: bool = false) -> Control:
	return _build_structure_detail_box(
		str(item_payload.get("text", "SOM-D07 结构位")),
		Vector2(0, int(item_payload.get("height", 0))),
		expand,
		str(item_payload.get("node_name", "SOM_D07_StructureBox"))
	)

func _build_detail_info_card(title: String, lines: Array[String], accent_color: Color, node_name: String = "") -> Control:
	var panel := PanelContainer.new()
	if node_name != "":
		panel.name = node_name
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_apply_panel_linework(panel, Color(0.11, 0.11, 0.13, 0.95), Color(0.32, 0.32, 0.34, 0.92))

	var margin := MarginContainer.new()
	_apply_margin(margin, 12, 12, 12, 12)
	panel.add_child(margin)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	margin.add_child(column)

	var title_label := Label.new()
	title_label.text = title
	title_label.add_theme_font_size_override("font_size", 15)
	title_label.add_theme_color_override("font_color", accent_color)
	column.add_child(title_label)
	for line in lines:
		var label := Label.new()
		label.text = line
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		label.add_theme_font_size_override("font_size", 13)
		label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		column.add_child(label)
	return panel

func _resolve_accent_color(accent_key: String) -> Color:
	match accent_key:
		"battlefield":
			return Color(0.58, 0.72, 0.58, 0.96)
		"stats":
			return Color(0.56, 0.62, 0.82, 0.96)
		"formation":
			return Color(0.82, 0.74, 0.60, 0.98)
		_:
			return Color(0.66, 0.66, 0.66, 0.96)

func _build_structure_detail_box(text: String, min_size: Vector2, expand: bool = false, node_name: String = "") -> Control:
	var panel := PanelContainer.new()
	if node_name != "":
		panel.name = node_name
	panel.custom_minimum_size = min_size
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL if expand else 0
	_apply_panel_linework(panel, Color(0.13, 0.13, 0.15, 0.94), Color(0.36, 0.36, 0.38, 0.92))
	var margin := MarginContainer.new()
	_apply_margin(margin, 8, 8, 8, 8)
	panel.add_child(margin)
	var label := Label.new()
	label.text = text
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 13)
	margin.add_child(label)
	return panel

func _build_detail_roster_card(title: String, raw_slots: Variant, is_defender: bool, node_name: String = "") -> Control:
	var panel := PanelContainer.new()
	if node_name != "":
		panel.name = node_name
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_apply_panel_linework(panel, Color(0.11, 0.11, 0.13, 0.95), Color(0.32, 0.32, 0.34, 0.92))

	var margin := MarginContainer.new()
	_apply_margin(margin, 12, 12, 12, 12)
	panel.add_child(margin)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	margin.add_child(column)

	var title_label := Label.new()
	title_label.text = title
	title_label.add_theme_font_size_override("font_size", 15)
	title_label.add_theme_color_override("font_color", Color(0.82, 0.74, 0.60, 0.98))
	column.add_child(title_label)

	if raw_slots is Array:
		var row := HBoxContainer.new()
		row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_theme_constant_override("separation", 8)
		column.add_child(row)
		var slot_index := 0
		for slot_variant in raw_slots as Array:
			if not (slot_variant is Dictionary):
				continue
			slot_index += 1
			row.add_child(_build_detail_hero_card(slot_variant as Dictionary, is_defender, "%s_Slot_%s" % [panel.name if panel.name != "" else "SOM_D03", str(slot_index)]))
	return panel

func _rebuild_detail_hero_row(container: HBoxContainer, raw_slots: Variant, is_defender: bool) -> void:
	_clear_children(container)
	if raw_slots is Array:
		var slot_index := 0
		for slot_variant in raw_slots as Array:
			if not (slot_variant is Dictionary):
				continue
			slot_index += 1
			var node_name := "SOM_D05_Slot_%s" % str(slot_index) if is_defender else "SOM_D03_Slot_%s" % str(slot_index)
			container.add_child(_build_detail_hero_card(slot_variant as Dictionary, is_defender, node_name))

func _build_detail_hero_card(slot_payload: Dictionary, is_defender: bool, node_name: String = "") -> Control:
	var panel := PanelContainer.new()
	if node_name != "":
		panel.name = node_name
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.custom_minimum_size = Vector2(0, 214)
	_apply_panel_linework(
		panel,
		Color(0.16, 0.10, 0.10, 0.95) if is_defender else Color(0.08, 0.11, 0.16, 0.95),
		Color(0.48, 0.24, 0.24, 0.92) if is_defender else Color(0.62, 0.46, 0.24, 0.92)
	)

	var margin := MarginContainer.new()
	_apply_margin(margin, 10, 10, 10, 10)
	panel.add_child(margin)

	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 8)
	margin.add_child(column)

	var role_label := Label.new()
	role_label.text = str(slot_payload.get("role_label", "武将位"))
	role_label.add_theme_font_size_override("font_size", 14)
	role_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	role_label.add_theme_color_override("font_color", Color(0.82, 0.74, 0.60, 0.98))
	column.add_child(role_label)

	var portrait_shell := PanelContainer.new()
	portrait_shell.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	portrait_shell.size_flags_vertical = Control.SIZE_EXPAND_FILL
	portrait_shell.custom_minimum_size = Vector2(0, 96)
	_apply_panel_linework(portrait_shell, Color(0.10, 0.10, 0.12, 0.96), Color(0.38, 0.32, 0.22, 0.92))
	var portrait_margin := MarginContainer.new()
	_apply_margin(portrait_margin, 8, 8, 8, 8)
	portrait_shell.add_child(portrait_margin)
	var portrait_column := VBoxContainer.new()
	portrait_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	portrait_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	portrait_margin.add_child(portrait_column)
	var star_label := Label.new()
	star_label.text = str(slot_payload.get("star_label", "★★★"))
	star_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	star_label.add_theme_font_size_override("font_size", 13)
	star_label.add_theme_color_override("font_color", Color(0.95, 0.78, 0.30, 0.98))
	portrait_column.add_child(star_label)
	var portrait_label := Label.new()
	portrait_label.text = str(slot_payload.get("name", "武将位"))
	portrait_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	portrait_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	portrait_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	portrait_label.size_flags_vertical = Control.SIZE_EXPAND_FILL
	portrait_column.add_child(portrait_label)
	column.add_child(portrait_shell)

	column.add_child(_build_info_label(str(slot_payload.get("troop_label", "SOM-D03-D 信息位"))))
	column.add_child(_build_info_label(str(slot_payload.get("delta_label", "SOM-D03-E 信息位"))))
	column.add_child(_build_info_label(str(slot_payload.get("level_label", "SOM-D03-F 信息位"))))
	return panel

func _build_info_label(text: String) -> Label:
	var label := Label.new()
	label.text = text
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_size_override("font_size", 13)
	return label

func _refresh_detail_tab_buttons() -> void:
	_battlefield_tab_button.text = "战斗地点"
	_stats_tab_button.text = "统计"
	_formation_tab_button.text = "阵容详情"
	_apply_mode_button_state(_battlefield_tab_button, _active_detail_tab_id == "battlefield")
	_apply_mode_button_state(_stats_tab_button, _active_detail_tab_id == "stats")
	_apply_mode_button_state(_formation_tab_button, _active_detail_tab_id == "formation")

func _apply_mode_button_state(button: Button, is_active: bool) -> void:
	var font_color := Color(0.95, 0.90, 0.78, 1.0) if is_active else Color(0.76, 0.74, 0.70, 0.96)
	button.add_theme_color_override("font_color", font_color)
	button.add_theme_color_override("font_hover_color", font_color)
	button.add_theme_color_override("font_pressed_color", font_color)
	button.modulate = Color(1, 1, 1, 1.0) if is_active else Color(0.88, 0.88, 0.88, 0.94)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.18, 0.15, 0.10, 0.96) if is_active else Color(0.13, 0.13, 0.14, 0.94)
	style.border_color = Color(0.68, 0.52, 0.26, 0.96) if is_active else Color(0.36, 0.36, 0.38, 0.92)
	style.set_border_width_all(1)
	button.add_theme_stylebox_override("normal", style)
	button.add_theme_stylebox_override("disabled", style)

func _resolve_detail_tab_title() -> String:
	match _active_detail_tab_id:
		"battlefield":
			return "战斗地点"
		"stats":
			return "统计"
		"formation":
			return "阵容详情"
		_:
			return "战报详情"

func _apply_static_styling() -> void:
	_apply_panel_linework(_detail_state_card, Color(0.10, 0.10, 0.12, 0.92), Color(0.28, 0.28, 0.30, 0.92))
	_detail_state_title_label.add_theme_font_size_override("font_size", 12)
	_detail_state_title_label.add_theme_color_override("font_color", Color(0.78, 0.78, 0.80, 0.96))

func _ensure_detail_section_content() -> void:
	if _detail_section_content != null and is_instance_valid(_detail_section_content):
		return
	_detail_section_content = VBoxContainer.new()
	_detail_section_content.name = "DetailSectionDynamicContent"
	_detail_section_content.add_theme_constant_override("separation", 8)
	_detail_section_column.add_child(_detail_section_content)

func _apply_progress_bar_values(bar: ProgressBar, current_value: int, max_value: int, fill_color: Color) -> void:
	bar.max_value = float(maxi(max_value, 1))
	bar.value = float(clampi(current_value, 0, int(bar.max_value)))
	bar.show_percentage = false
	var background_style := StyleBoxFlat.new()
	background_style.bg_color = Color(0.10, 0.10, 0.11, 0.94)
	bar.add_theme_stylebox_override("background", background_style)
	var fill_style := StyleBoxFlat.new()
	fill_style.bg_color = fill_color
	bar.add_theme_stylebox_override("fill", fill_style)

func _apply_panel_linework(panel: PanelContainer, bg_color: Color, border_color: Color) -> void:
	var style_box := StyleBoxFlat.new()
	style_box.bg_color = bg_color
	style_box.border_color = border_color
	style_box.set_border_width_all(1)
	panel.add_theme_stylebox_override("panel", style_box)

func _apply_margin(container: MarginContainer, left: int, top: int, right: int, bottom: int) -> void:
	container.add_theme_constant_override("margin_left", left)
	container.add_theme_constant_override("margin_top", top)
	container.add_theme_constant_override("margin_right", right)
	container.add_theme_constant_override("margin_bottom", bottom)

func _clear_children(node: Node) -> void:
	for child in node.get_children():
		node.remove_child(child)
		child.queue_free()

func _coerce_string_array(raw_value: Variant) -> Array[String]:
	var result: Array[String] = []
	if raw_value is Array:
		for item in raw_value as Array:
			var text := str(item).strip_edges()
			if text != "":
				result.append(text)
	return result

func _coerce_dictionary(raw_value: Variant) -> Dictionary:
	if raw_value is Dictionary:
		return raw_value as Dictionary
	return {}

func _on_replay_button_pressed() -> void:
	_detail_section_body.text = "回放入口已保留；后续接正式回放链。"

func _on_share_button_pressed() -> void:
	_detail_section_body.text = "分享入口已保留；当前先固定结构关系。"

func _on_favorite_button_pressed() -> void:
	_detail_section_body.text = "收藏入口已保留；当前先固定结构关系。"

func _on_detail_tab_pressed(tab_id: String) -> void:
	_active_detail_tab_id = tab_id
	_refresh_view()
	detail_tab_selected.emit(tab_id)

func _on_collapse_button_pressed() -> void:
	back_requested.emit()
