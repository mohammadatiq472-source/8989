extends RefCounted
class_name BattleReportPresenter

const ATTACKER_ROLE_ORDER := ["大营", "中军", "前锋"]
const DEFENDER_ROLE_ORDER := ["前锋", "中军", "大营"]
const DETAIL_PAGE_LABELS := {
	"battlefield": "战斗地点",
	"stats": "统计",
	"formation": "阵容详情",
}

var _world_data: Dictionary = {}
var _map_layout_data: Dictionary = {}
var _target_faction_id: String = ""

func configure(world_data: Dictionary, map_layout_data: Dictionary, target_faction_id: String) -> void:
	_world_data = world_data
	_map_layout_data = map_layout_data
	_target_faction_id = target_faction_id.strip_edges()

func build_snapshot(runtime_context: Dictionary = {}) -> Dictionary:
	var feedback: Dictionary = _world_data.get("feedback", {}) as Dictionary
	var history: Dictionary = _world_data.get("history", {}) as Dictionary
	var reports: Array = _world_data.get("reports", []) as Array
	var battle_records: Array = feedback.get("battleRecords", []) as Array
	var execution_replays: Array = history.get("executionReplays", []) as Array
	var personal_list_contract: Dictionary = _build_list_contracts(reports, battle_records, execution_replays, runtime_context, false)
	var favorite_list_contract: Dictionary = _build_list_contracts(reports, battle_records, execution_replays, runtime_context, true)
	var personal_entry_contracts: Array = personal_list_contract.get("entry_contracts", []) as Array
	var favorite_entry_contracts: Array = favorite_list_contract.get("entry_contracts", []) as Array
	var has_reports: bool = not personal_entry_contracts.is_empty()
	return {
		"title": "个人战报",
		"country_summary": _build_country_summary(),
		"search_label": "搜索",
		"filter_label": "筛\n选",
		"scroll_hint_label": "1\n∨",
		"header_hint": "当前无战报；先对齐结构和空状态。" if not has_reports else "点击任意条目进入详情页。",
		"list_summary_lines": [
			"暂无战报；交战、攻地、驻守后会在这里生成记录。" if not has_reports else "同类交战按时间合并展示。",
			"当前先对齐结构和位置关系。" if not has_reports else "点击任意条目进入详情页。",
		],
		"default_list_mode": "personal",
		"default_detail_tab": "battlefield",
		"shared_state": {
			"page_id": "list",
			"page_id_label": "列表页",
			"list_mode": "personal",
			"list_mode_label": "个人",
			"selected_report": "",
			"selected_report_label": "未选择",
			"detail_tab": "battlefield",
			"detail_tab_label": "战斗地点",
			"report_count": personal_entry_contracts.size(),
			"report_count_label": "%s 条" % str(personal_entry_contracts.size()),
		},
		"list_modes": {
			"personal": {
				"entry_contracts": personal_entry_contracts,
				"detail_contracts_by_id": personal_list_contract.get("detail_contracts_by_id", {}),
			},
			"favorite": {
				"entry_contracts": favorite_entry_contracts,
				"detail_contracts_by_id": favorite_list_contract.get("detail_contracts_by_id", {}),
			},
		},
	}

func build_overlay_payload(runtime_context: Dictionary = {}) -> Dictionary:
	return {
		"snapshot": build_snapshot(runtime_context),
		"runtime_state_patch": {},
	}

static func build_empty_state_contracts() -> Dictionary:
	var attacker_slots := [
		{"role_label": "大营", "name": "SOM-D03-A 武将位", "troop_label": "SOM-D03-D 信息位", "delta_label": "SOM-D03-E 信息位", "level_label": "SOM-D03-F 信息位"},
		{"role_label": "中军", "name": "SOM-D03-B 武将位", "troop_label": "SOM-D03-D 信息位", "delta_label": "SOM-D03-E 信息位", "level_label": "SOM-D03-F 信息位"},
		{"role_label": "前锋", "name": "SOM-D03-C 武将位", "troop_label": "SOM-D03-D 信息位", "delta_label": "SOM-D03-E 信息位", "level_label": "SOM-D03-F 信息位"},
	]
	var defender_slots := [
		{"role_label": "前锋", "name": "SOM-D05-A 武将位", "troop_label": "SOM-D05-D 信息位", "delta_label": "SOM-D05-E 信息位", "level_label": "SOM-D05-F 信息位"},
		{"role_label": "中军", "name": "SOM-D05-B 武将位", "troop_label": "SOM-D05-D 信息位", "delta_label": "SOM-D05-E 信息位", "level_label": "SOM-D05-F 信息位"},
		{"role_label": "大营", "name": "SOM-D05-C 武将位", "troop_label": "SOM-D05-D 信息位", "delta_label": "SOM-D05-E 信息位", "level_label": "SOM-D05-F 信息位"},
	]
	var detail_frame_contract := _build_detail_frame_contract(
		"SOM-D01-C 我方标题位",
		"SOM-D01-F 敌方标题位",
		"胜负位",
		"SOM-D02-A 顶部注释位",
		0,
		1,
		0,
		1,
		[
			"SOM-D04-A 奖励摘要位",
			"SOM-D04-B 回放按钮位",
			"SOM-D04-C 中部说明位",
		],
		attacker_slots,
		defender_slots
	)
	var detail_pages := {
		"battlefield": {
			"page_id": "battlefield",
			"page_label": "战斗地点",
			"summary": "结构预览下，战场页只固定标题、主内容和补充说明三段关系。",
			"hide_summary_body": true,
			"content_blocks": [
				_build_structure_group_block("stack", "SOM_D07_BattlefieldStructure", [
					_build_structure_box_spec("SOM-D07-A 标题位", 30, "SOM_D07_BattlefieldStructure_Box_1"),
					_build_structure_box_spec("SOM-D07-B 主内容区", 124, "SOM_D07_BattlefieldStructure_Box_2"),
					_build_structure_box_spec("SOM-D07-C 辅助说明区", 42, "SOM_D07_BattlefieldStructure_Box_3"),
				]),
			],
		},
		"stats": {
			"page_id": "stats",
			"page_label": "统计",
			"summary": "结构预览下，统计页先固定三块横向统计位。",
			"hide_summary_body": true,
			"content_blocks": [
				_build_structure_group_block("row", "SOM_D07_StatsRow", [
					_build_structure_box_spec("SOM-D07-A 统计标题位", 120, "SOM_D07_StatsBox_1"),
					_build_structure_box_spec("SOM-D07-B 统计主内容区", 120, "SOM_D07_StatsBox_2"),
					_build_structure_box_spec("SOM-D07-C 统计补充说明区", 120, "SOM_D07_StatsBox_3"),
				]),
			],
		},
		"formation": {
			"page_id": "formation",
			"page_label": "阵容详情",
			"summary": "结构预览下，阵容页固定双栏阵容卡加一条补充说明位。",
			"hide_summary_body": true,
			"content_blocks": [
				_build_structure_group_block("row", "SOM_D07_FormationRow", [
					_build_structure_box_spec("SOM-D07-A 阵容标题位", 120, "SOM_D07_FormationBox_1"),
					_build_structure_box_spec("SOM-D07-B 阵容主内容区", 120, "SOM_D07_FormationBox_2"),
				]),
				_build_structure_group_block("stack", "SOM_D07_FormationTail", [
					_build_structure_box_spec("SOM-D07-C 阵容补充说明区", 48, "SOM_D07_FormationBox_3"),
				]),
			],
		},
	}
	var report_id := "preview_empty_state"
	return {
		"entry_contracts": [
			_build_entry_contract(
				report_id,
				_build_report_header_block(
					"SOM-L05-A\n徽标",
					"SOM-L05-B 我方标题",
					"SOM-L05-C 地点 / 等级",
					"SOM-L05-D 敌方标题"
				),
				[
					_build_team_cluster_block("attacker", "SOM-L06-A 数值位", 0, 1, [
						{"name": "SOM-L06-C1 武将位", "troop_label": "SOM-L06-D 信息位", "level_label": "SOM-L06-E 信息位"},
						{"name": "SOM-L06-C2 武将位", "troop_label": "SOM-L06-D 信息位", "level_label": "SOM-L06-E 信息位"},
						{"name": "SOM-L06-C3 武将位", "troop_label": "SOM-L06-D 信息位", "level_label": "SOM-L06-E 信息位"},
					]),
					_build_result_cluster_block(
						"SOM-L07-A 结果提示",
						"SOM-L07-B 胜负字位",
						"SOM-L07-C 时间位",
						"SOM-L07-D 进入详情"
					),
					_build_team_cluster_block("defender", "SOM-L08-A 数值位", 0, 1, [
						{"name": "SOM-L08-C1 武将位", "troop_label": "SOM-L08-D 信息位", "level_label": "SOM-L08-E 信息位"},
						{"name": "SOM-L08-C2 武将位", "troop_label": "SOM-L08-D 信息位", "level_label": "SOM-L08-E 信息位"},
						{"name": "SOM-L08-C3 武将位", "troop_label": "SOM-L08-D 信息位", "level_label": "SOM-L08-E 信息位"},
					]),
					_build_utility_cluster_block("SOM-L09-A\n序号", "SOM-L09-B\n展开"),
				]
			),
		],
		"detail_contracts_by_id": {
			report_id: _compose_detail_page_contract(detail_frame_contract, detail_pages),
		},
	}

static func _build_entry_contract(report_id: String, header_block: Dictionary, body_blocks: Array) -> Dictionary:
	return {
		"report_id": report_id,
		"header_block": header_block,
		"body_blocks": body_blocks,
	}

static func _build_report_header_block(badge_label: String, attacker_team_label: String, location_label: String, defender_team_label: String) -> Dictionary:
	return {
		"kind": "report_header",
		"badge_label": badge_label,
		"attacker_team_label": attacker_team_label,
		"location_label": location_label,
		"defender_team_label": defender_team_label,
	}

static func _build_team_cluster_block(side: String, power_label: String, power_current: int, power_max: int, hero_slots: Array, title: String = "") -> Dictionary:
	var block := {
		"kind": "team_cluster",
		"side": side,
		"power_label": power_label,
		"power_current": power_current,
		"power_max": power_max,
		"hero_slots": hero_slots,
	}
	if title != "":
		block["title"] = title
	return block

static func _build_result_cluster_block(result_note: String, result_text: String, time_label: String, enter_detail_label: String) -> Dictionary:
	return {
		"kind": "result_cluster",
		"result_note": result_note,
		"result_text": result_text,
		"time_label": time_label,
		"enter_detail_label": enter_detail_label,
	}

static func _build_utility_cluster_block(index_label: String, expand_label: String) -> Dictionary:
	return {
		"kind": "utility_cluster",
		"index_label": index_label,
		"expand_label": expand_label,
	}

static func _build_structure_group_block(layout: String, node_name: String, boxes: Array) -> Dictionary:
	return {
		"kind": "structure_group",
		"layout": layout,
		"node_name": node_name,
		"boxes": boxes,
	}

static func _build_structure_box_spec(text: String, height: int, node_name: String) -> Dictionary:
	return {
		"text": text,
		"height": height,
		"node_name": node_name,
	}

func _build_country_summary() -> String:
	var faction_state: Dictionary = _read_target_faction_state()
	var nation_label := _first_non_empty([
		faction_state.get("nation", ""),
		faction_state.get("factionName", ""),
		_target_faction_id,
	])
	if nation_label == "":
		nation_label = "未定势力"
	return "国家 / 势力：%s" % nation_label

func _build_list_contracts(reports: Array, battle_records: Array, execution_replays: Array, runtime_context: Dictionary, is_favorite: bool) -> Dictionary:
	var card_count: int = maxi(reports.size(), battle_records.size())
	if card_count <= 0:
		return {
			"entry_contracts": [],
			"detail_contracts_by_id": {},
		}
	var entry_contracts: Array = []
	var detail_contracts_by_id: Dictionary = {}
	for index in range(card_count):
		var raw_report: Dictionary = reports[index] as Dictionary if index < reports.size() and reports[index] is Dictionary else {}
		var raw_record: Dictionary = battle_records[index] as Dictionary if index < battle_records.size() and battle_records[index] is Dictionary else {}
		var report_id := _first_non_empty([
			raw_report.get("id", ""),
			raw_report.get("reportId", ""),
			raw_record.get("id", ""),
			raw_record.get("reportId", ""),
			raw_report.get("timestamp", ""),
			raw_record.get("timestamp", ""),
		])
		if report_id == "":
			report_id = "report_%s" % str(index)
		var attacker_team_label := _first_non_empty([
			raw_report.get("attacker", ""),
			raw_report.get("playerName", ""),
			raw_record.get("attacker", ""),
			_resolve_faction_label(),
		])
		var location_label := _first_non_empty([
			raw_report.get("region", ""),
			raw_report.get("location", ""),
			raw_record.get("location", ""),
			raw_report.get("targetName", ""),
			"交战地点",
		])
		var defender_team_label := _first_non_empty([
			raw_report.get("defender", ""),
			raw_record.get("defender", ""),
			raw_report.get("target", ""),
			"目标",
		])
		var result_text := _normalize_result_text(_first_non_empty([
			raw_report.get("result", ""),
			raw_record.get("result", ""),
			raw_report.get("status", ""),
			raw_record.get("status", ""),
			"",
		]))
		var time_label := _first_non_empty([
			raw_report.get("time", ""),
			raw_report.get("timestamp", ""),
			raw_record.get("time", ""),
			raw_record.get("timestamp", ""),
			"--",
		])
		var attacker_current := _resolve_numeric([
			raw_report.get("attackerTroops", null),
			raw_report.get("attackerPower", null),
			raw_record.get("attackerTroops", null),
			raw_record.get("attackerPower", null),
		])
		var attacker_max := maxi(attacker_current, _resolve_numeric([
			raw_report.get("attackerMaxTroops", null),
			raw_report.get("attackerMaxPower", null),
			raw_record.get("attackerMaxTroops", null),
			raw_record.get("attackerMaxPower", null),
		]))
		var defender_current := _resolve_numeric([
			raw_report.get("defenderTroops", null),
			raw_report.get("defenderPower", null),
			raw_record.get("defenderTroops", null),
			raw_record.get("defenderPower", null),
		])
		var defender_max := maxi(defender_current, _resolve_numeric([
			raw_report.get("defenderMaxTroops", null),
			raw_report.get("defenderMaxPower", null),
			raw_record.get("defenderMaxTroops", null),
			raw_record.get("defenderMaxPower", null),
		]))
		var attacker_heroes := _build_compact_heroes(false)
		var defender_heroes := _build_compact_heroes(true)
		var detail_page_contract := _build_detail_page_contract(
			attacker_team_label,
			defender_team_label,
			result_text,
			time_label,
			location_label,
			attacker_current,
			attacker_max,
			defender_current,
			defender_max,
			attacker_heroes,
			defender_heroes,
			runtime_context,
			execution_replays,
			is_favorite
		)
		detail_contracts_by_id[report_id] = detail_page_contract
		entry_contracts.append(_build_entry_contract(
			report_id,
			_build_report_header_block(
				"藏" if is_favorite else "战",
				attacker_team_label,
				location_label,
				defender_team_label
			),
			[
				_build_team_cluster_block(
					"attacker",
					"%s/%s" % [str(attacker_current), str(attacker_max)],
					attacker_current,
					attacker_max,
					attacker_heroes,
					attacker_team_label
				),
				_build_result_cluster_block(
					"结果区" if result_text == "未结" else "结果已生成",
					result_text,
					time_label,
					"进入详情"
				),
				_build_team_cluster_block(
					"defender",
					"%s/%s" % [str(defender_current), str(defender_max)],
					defender_current,
					defender_max,
					defender_heroes,
					defender_team_label
				),
				_build_utility_cluster_block(str(index + 1), "展开"),
			]
		))
	return {
		"entry_contracts": entry_contracts,
		"detail_contracts_by_id": detail_contracts_by_id,
	}

func _build_detail_page_contract(
	attacker_team_label: String,
	defender_team_label: String,
	result_text: String,
	time_label: String,
	location_label: String,
	attacker_current: int,
	attacker_max: int,
	defender_current: int,
	defender_max: int,
	attacker_heroes: Array,
	defender_heroes: Array,
	runtime_context: Dictionary,
	execution_replays: Array,
	is_favorite: bool
) -> Dictionary:
	var outcome_note := "【结果已生成】" if result_text != "未结" else "【结果区占位】"
	var reward_lines: Array[String] = [
		"奖励 / 回放区",
		"这里先保留位置关系。",
		"后续接真实奖励和回放。",
	]
	if is_favorite:
		reward_lines.append("该条目来自收藏夹视图。")
	var replay_hint := "执行回放 %s 条可供后续接线。" % str(execution_replays.size())
	var attacker_slots := _build_detail_slots(attacker_heroes, ATTACKER_ROLE_ORDER, false)
	var defender_slots := _build_detail_slots(defender_heroes, DEFENDER_ROLE_ORDER, true)
	var detail_frame_contract := _build_detail_frame_contract(
		attacker_team_label,
		defender_team_label,
		result_text,
		outcome_note,
		attacker_current,
		attacker_max,
		defender_current,
		defender_max,
		reward_lines,
		attacker_slots,
		defender_slots
	)
	var detail_pages := _build_detail_pages(
		location_label,
		time_label,
		attacker_current,
		attacker_max,
		defender_current,
		defender_max,
		attacker_slots,
		defender_slots,
		runtime_context,
		replay_hint
	)
	return _compose_detail_page_contract(detail_frame_contract, detail_pages)

static func _build_detail_frame_contract(
	attacker_team_label: String,
	defender_team_label: String,
	result_text: String,
	outcome_note: String,
	attacker_current: int,
	attacker_max: int,
	defender_current: int,
	defender_max: int,
	reward_lines: Array[String],
	attacker_slots: Array,
	defender_slots: Array
) -> Dictionary:
	return {
		"attacker_power_label": "%s/%s" % [str(attacker_current), str(attacker_max)],
		"attacker_power_current": attacker_current,
		"attacker_power_max": attacker_max,
		"attacker_team_label": attacker_team_label,
		"result_text": result_text,
		"outcome_note": outcome_note,
		"defender_power_label": "%s/%s" % [str(defender_current), str(defender_max)],
		"defender_power_current": defender_current,
		"defender_power_max": defender_max,
		"defender_team_label": defender_team_label,
		"reward_title": "奖励 / 回放",
		"reward_lines": reward_lines,
		"attacker_morale_label": "士气位",
		"defender_morale_label": "士气位",
		"share_label": "分享",
		"favorite_label": "收藏",
		"attacker_slots": attacker_slots,
		"defender_slots": defender_slots,
	}

static func _compose_detail_page_contract(detail_frame_contract: Dictionary, detail_pages: Dictionary) -> Dictionary:
	return {
		"detail_frame_contract": detail_frame_contract,
		"detail_pages": detail_pages,
	}

func _build_detail_pages(
	location_label: String,
	time_label: String,
	attacker_current: int,
	attacker_max: int,
	defender_current: int,
	defender_max: int,
	attacker_slots: Array,
	defender_slots: Array,
	runtime_context: Dictionary,
	replay_hint: String
) -> Dictionary:
	return {
		"battlefield": {
			"page_id": "battlefield",
			"page_label": str(DETAIL_PAGE_LABELS.get("battlefield", "战斗地点")),
			"summary": "地点、时间和落点说明统一走战场页合同。",
			"content_blocks": [
				{
					"kind": "info_card",
					"title": "战斗地点",
					"accent_key": "battlefield",
					"node_name": "SOM_D07_BattlefieldCard",
					"lines": [
						"地点位：%s" % location_label,
						"时间位：%s" % time_label,
						"这一页只先保留位置关系，后续接坐标、州郡和地块。",
					],
				},
			],
		},
		"stats": {
			"page_id": "stats",
			"page_label": str(DETAIL_PAGE_LABELS.get("stats", "统计")),
			"summary": "统计、结果和运行态参考统一走统计页合同。",
			"content_blocks": [
				{
					"kind": "info_card",
					"title": "统计块 1",
					"accent_key": "stats",
					"node_name": "SOM_D07_StatsCard_1",
					"lines": ["我方统计位：%s / %s" % [str(attacker_current), str(attacker_max)]],
				},
				{
					"kind": "info_card",
					"title": "统计块 2",
					"accent_key": "stats",
					"node_name": "SOM_D07_StatsCard_2",
					"lines": ["敌方统计位：%s / %s" % [str(defender_current), str(defender_max)]],
				},
				{
					"kind": "info_card",
					"title": "统计块 3",
					"accent_key": "stats",
					"node_name": "SOM_D07_StatsCard_3",
					"lines": [
						"运行态参考：%s (%s)" % [
							str(runtime_context.get("last_action", "none")),
							str(runtime_context.get("last_action_status", "idle")),
						],
					],
				},
			],
		},
		"formation": {
			"page_id": "formation",
			"page_label": str(DETAIL_PAGE_LABELS.get("formation", "阵容详情")),
			"summary": "阵容、站位和卡内信息统一走阵容页合同。",
			"content_blocks": [
				{
					"kind": "roster_card",
					"title": "我方阵容",
					"slot_source": "attacker_slots",
					"is_defender": false,
					"node_name": "SOM_D07_AttackerRosterCard",
				},
				{
					"kind": "roster_card",
					"title": "敌方阵容",
					"slot_source": "defender_slots",
					"is_defender": true,
					"node_name": "SOM_D07_DefenderRosterCard",
				},
			],
			"footer_note": replay_hint,
		},
	}

func _build_compact_heroes(is_defender: bool) -> Array:
	var prefix := "敌方" if is_defender else "我方"
	var role_order := DEFENDER_ROLE_ORDER if is_defender else ATTACKER_ROLE_ORDER
	var heroes: Array = []
	for slot_index in range(3):
		heroes.append({
			"role_label": str(role_order[slot_index]),
			"name": "%s武将位%s" % [prefix, str(slot_index + 1)],
			"star_label": "★★★" if is_defender else "★★★★★",
			"level_label": "Lv.%s" % str(40 - slot_index if is_defender else 43 - slot_index),
			"troop_label": "兵力 %s" % str(0 if is_defender else 8500 - slot_index * 500),
		})
	return heroes

func _build_detail_slots(hero_list: Array, role_order: Array, is_defender: bool) -> Array:
	var slots: Array = []
	for index in range(mini(hero_list.size(), role_order.size())):
		var hero: Dictionary = hero_list[index] as Dictionary
		slots.append({
			"role_label": str(role_order[index]),
			"name": str(hero.get("name", "武将位")),
			"star_label": str(hero.get("star_label", "★★★")),
			"troop_label": str(hero.get("troop_label", "兵力 --")),
			"delta_label": "损兵 / 状态位" if is_defender else "伤兵 / 增益位",
			"level_label": str(hero.get("level_label", "Lv.--")),
		})
	return slots

func _normalize_result_text(raw_value: String) -> String:
	var normalized := raw_value.strip_edges()
	if normalized.find("胜") != -1:
		return "胜"
	if normalized.find("败") != -1:
		return "败"
	return "未结"

func _resolve_numeric(candidates: Array) -> int:
	for candidate in candidates:
		if candidate == null:
			continue
		if candidate is int:
			return maxi(0, int(candidate))
		if candidate is float:
			return maxi(0, int(round(float(candidate))))
		var text: String = str(candidate).strip_edges()
		if text.is_valid_int():
			return maxi(0, int(text))
	return 0

func _resolve_faction_label() -> String:
	var faction_state: Dictionary = _read_target_faction_state()
	return _first_non_empty([
		faction_state.get("factionName", ""),
		faction_state.get("name", ""),
		_target_faction_id,
		"风华",
	])

func _read_target_faction_state() -> Dictionary:
	var raw_factions: Variant = _world_data.get("factions", {})
	if raw_factions is Dictionary and _target_faction_id != "":
		var faction_state: Variant = (raw_factions as Dictionary).get(_target_faction_id, {})
		if faction_state is Dictionary:
			return faction_state as Dictionary
	return {}

func _first_non_empty(candidates: Array) -> String:
	for candidate in candidates:
		var text: String = str(candidate).strip_edges()
		if text != "":
			return text
	return ""
