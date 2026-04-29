extends RefCounted
class_name AlliancePresenter

var _world_data: Dictionary = {}
var _map_layout_data: Dictionary = {}
var _target_faction_id: String = ""

const DIRECTIVE_ACTION_STANCE_ORDER := ["hold", "support", "harass", "expand"]
const DIRECTIVE_ACTION_LIMIT := 3

func configure(world_data: Dictionary, map_layout_data: Dictionary, target_faction_id: String) -> void:
	_world_data = world_data
	_map_layout_data = map_layout_data
	_target_faction_id = target_faction_id.strip_edges()

func build_snapshot(runtime_context: Dictionary = {}) -> Dictionary:
	var alliance_data: Dictionary = _world_data.get("alliance", {}) as Dictionary
	var feedback: Dictionary = _world_data.get("feedback", {}) as Dictionary
	var history: Dictionary = _world_data.get("history", {}) as Dictionary
	var executions: Dictionary = _world_data.get("executions", {}) as Dictionary
	var faction_state: Dictionary = _read_target_faction_state()
	var city_clusters: Array = _read_city_clusters()
	var owned_clusters: Array = _collect_owned_city_clusters(city_clusters)
	var directives_by_region: Dictionary = alliance_data.get("directives", {}) as Dictionary
	var directives: Array = _collect_directive_dicts(directives_by_region)
	var commanders: Array = alliance_data.get("commanders", []) as Array
	var alliance_actions: Array = feedback.get("allianceActions", []) as Array
	var battle_records: Array = feedback.get("battleRecords", []) as Array
	var diplomacy_agreements: Array = feedback.get("diplomacyAgreements", []) as Array
	var reports: Array = _world_data.get("reports", []) as Array
	var execution_replays: Array = history.get("executionReplays", []) as Array
	var player_execution: Dictionary = executions.get(_target_faction_id, {}) as Dictionary
	if player_execution.is_empty():
		player_execution = executions.get("player", {}) as Dictionary
	var player_orders: Array = player_execution.get("orders", []) as Array
	var ai_players: Array = faction_state.get("aiPlayers", []) as Array
	var alliance_name: String = str(alliance_data.get("name", "")).strip_edges()
	if alliance_name == "":
		alliance_name = "%s同盟" % (_target_faction_id if _target_faction_id != "" else "原生SLG")
	var runtime_seat_count: int = int(runtime_context.get("seat_count", 0))
	var runtime_online_count: int = int(runtime_context.get("online_seat_count", 0))
	var commander_count: int = commanders.size()
	var member_count: int = max(runtime_seat_count, commander_count + ai_players.size() + 1)
	if member_count <= 0:
		member_count = 1
	var online_count: int = runtime_online_count
	if online_count <= 0:
		online_count = mini(member_count, commander_count + 1)
	var low_support_count: int = _count_low_support_directives(directives)
	var status_counts: Dictionary = _build_order_status_counts(player_orders)
	return {
		"alliance_name": alliance_name,
		"member_count": member_count,
		"online_count": online_count,
		"territory_count": max(owned_clusters.size(), directives.size()),
		"goal_count": directives.size(),
		"commander_count": commander_count,
		"ai_player_count": ai_players.size(),
		"recent_action_count": alliance_actions.size(),
		"report_count": reports.size(),
		"tab_summary_lines": _build_tab_summary_lines(
			member_count,
			online_count,
			owned_clusters,
			directives,
			alliance_actions,
			reports,
			execution_replays,
			low_support_count,
			status_counts
		),
		"section_payloads": _build_section_payloads(
			faction_state,
			runtime_context,
			owned_clusters,
			directives,
			commanders,
			alliance_actions,
			battle_records,
			diplomacy_agreements,
			reports,
			execution_replays,
			player_execution,
			status_counts
		),
	}

func _build_tab_summary_lines(
	member_count: int,
	online_count: int,
	owned_clusters: Array,
	directives: Array,
	alliance_actions: Array,
	reports: Array,
	execution_replays: Array,
	low_support_count: int,
	status_counts: Dictionary
) -> Dictionary:
	return {
		"members": [
			"成员骨架按主控位与正式同盟指挥官生成，不再使用静态假名册。",
			"当前在线 %s / %s，已占城池 %s，协同目标 %s。" % [str(online_count), str(member_count), str(owned_clusters.size()), str(directives.size())],
		],
		"applications": [
			"当前世界合同未提供权威入盟申请流，先按动态容量、指挥缺口和待补目标展示。",
			"低支援协同目标 %s，执行中协同单 %s。" % [str(low_support_count), str(int(status_counts.get("running", 0)))],
		],
		"battle_reports": [
			"战报页当前优先消费正式 reports、allianceActions 和 executionReplays，不再展示静态示例战报。",
			"最近战报 %s，协同行动摘要 %s，执行回放 %s。" % [str(reports.size()), str(alliance_actions.size()), str(execution_replays.size())],
		],
		"mail": [
			"邮件页先用正式战报、执行链和协同行动摘要拼成通知流，后续再接独立邮件合同。",
			"当前通知源：reports %s / allianceActions %s。" % [str(reports.size()), str(alliance_actions.size())],
		],
		"coordination": [
			"协同目标页当前直接读取 directives、执行单和同盟行动反馈。",
			"目标 %s，待执行 %s，进行中 %s，已完成 %s。" % [
				str(directives.size()),
				str(int(status_counts.get("queued", 0))),
				str(int(status_counts.get("running", 0))),
				str(int(status_counts.get("completed", 0))),
			],
		],
	}

func _build_section_payloads(
	faction_state: Dictionary,
	runtime_context: Dictionary,
	owned_clusters: Array,
	directives: Array,
	commanders: Array,
	alliance_actions: Array,
	battle_records: Array,
	diplomacy_agreements: Array,
	reports: Array,
	execution_replays: Array,
	player_execution: Dictionary,
	status_counts: Dictionary
) -> Dictionary:
	var capital_name: String = _resolve_home_city_name(faction_state, owned_clusters)
	var member_count: int = max(int(runtime_context.get("seat_count", 0)), commanders.size() + 1)
	var online_count: int = int(runtime_context.get("online_seat_count", 0))
	if online_count <= 0:
		online_count = mini(member_count, commanders.size() + 1)
	var commander_gap: int = maxi(0, directives.size() - commanders.size())
	var seat_gap: int = maxi(0, max(int(runtime_context.get("seat_count", 0)), member_count) - member_count)
	var low_support_count: int = _count_low_support_directives(directives)
	return {
		"members": {
			"overview": _build_members_overview_section(capital_name, faction_state, directives, commanders, member_count, online_count),
			"groups": _build_member_groups_section(commanders, member_count),
			"subordinates": _build_subordinates_section(owned_clusters),
			"officers": _build_officers_section(capital_name, commanders, directives),
			"territory": _build_territory_section(owned_clusters, directives),
			"strategy": _build_strategy_section(directives, alliance_actions),
		},
		"applications": {
			"pending": _build_applications_pending_section(
				member_count,
				online_count,
				seat_gap,
				commander_gap,
				low_support_count,
				status_counts,
				reports.size()
			),
			"review": _build_applications_review_section(status_counts, low_support_count, reports.size()),
			"history": _build_applications_history_section(alliance_actions.size(), execution_replays.size(), reports.size(), diplomacy_agreements.size()),
		},
		"battle_reports": {
			"latest": _build_latest_reports_section(reports, battle_records),
			"highlights": _build_report_highlights_section(alliance_actions, battle_records),
			"archive": _build_report_archive_section(reports, execution_replays, battle_records, diplomacy_agreements),
		},
		"mail": {
			"inbox": _build_mail_inbox_section(reports, alliance_actions),
			"system": _build_mail_system_section(player_execution, reports, diplomacy_agreements),
			"archive": _build_mail_archive_section(reports, execution_replays, alliance_actions),
		},
		"coordination": {
			"board": _build_coordination_board_section(directives, status_counts),
			"progress": _build_coordination_progress_section(player_execution, status_counts, directives),
			"log": _build_coordination_log_section(alliance_actions, execution_replays),
		},
	}

func _build_members_overview_section(capital_name: String, faction_state: Dictionary, directives: Array, commanders: Array, member_count: int, online_count: int) -> Dictionary:
	var item_cards: Array = []
	var covered_regions: Dictionary = {}
	var action_points := int(faction_state.get("actionPoints", 0))
	item_cards.append(_build_section_item_card(
		"玩家主控",
		capital_name,
		"盟主位 | 行令 %s" % str(action_points),
		"主控席位已进入正式同盟名册骨架。"
	))
	for raw_commander in commanders:
		var commander: Dictionary = raw_commander as Dictionary
		var region_label: String = _format_region_label(str(commander.get("assignedRegionId", "")))
		covered_regions[region_label] = true
		item_cards.append(_build_section_item_card(
			str(commander.get("name", "同盟指挥")),
			_format_specialty_label(str(commander.get("specialty", ""))),
			region_label,
			"就绪 %s" % str(int(commander.get("readiness", 0)))
		))
	return {
		"summary_lines": [
			"成员骨架已切到正式 child-page block 合同，不再只靠字符串拆分。",
			"成员 %s / 在线 %s / 指挥位 %s / 协同目标 %s。" % [
				str(member_count),
				str(online_count),
				str(commanders.size()),
				str(directives.size()),
			],
		],
		"item_cards": item_cards,
		"content_blocks": [
			_build_section_text_block(
				"名册摘要",
				[
					"正式成员骨架当前由主控位与 %s 名同盟指挥官组成。" % str(commanders.size()),
					"协同目标 %s，后续接入真实成员 roster 后可直接扩展到个人资料层。" % str(directives.size()),
				],
				"AllianceMembersOverviewSummaryBlock"
			),
			_build_section_text_block(
				"结构说明",
				[
					"成员页当前优先展示指挥骨架、所在区域与就绪度，不再使用静态假成员列表。",
					"当前已覆盖区域 %s。" % str(covered_regions.size()),
				],
				"AllianceMembersOverviewStructureBlock"
			),
		],
	}

func _build_member_groups_section(commanders: Array, member_count: int) -> Dictionary:
	var grouped: Dictionary = {}
	for raw_commander in commanders:
		var commander: Dictionary = raw_commander as Dictionary
		var specialty_id: String = str(commander.get("specialty", "reserve"))
		if not grouped.has(specialty_id):
			grouped[specialty_id] = []
		(grouped[specialty_id] as Array).append(str(commander.get("name", "同盟指挥")))
	var item_cards: Array = []
	for specialty_id in grouped.keys():
		var names: Array = grouped[specialty_id] as Array
		item_cards.append(_build_section_item_card(
			_format_specialty_label(str(specialty_id)),
			"%s 人" % str(names.size()),
			"成员：%s" % " / ".join(names),
			"当前分组由指挥 specialty 聚合生成。"
		))
	if item_cards.is_empty():
		item_cards.append(_build_section_item_card("主控组", "1 人", "当前尚未编成更多正式同盟分组", "后续接真实团编制后可直接替换。"))
	return {
		"summary_lines": [
			"分组页已切到显式 group card 合同，不再只靠字符串拼接团编制。",
			"当前同盟成员 %s / 指挥 specialty 组 %s。" % [str(member_count), str(maxi(item_cards.size(), 1))],
		],
		"item_cards": item_cards,
		"content_blocks": [
			_build_section_text_block(
				"分组摘要",
				[
					"当前分组按正式指挥官 specialty 聚合，不再展示静态一团/二团样例。",
					"后续接真实团编制后，这里可平滑替换为指挥链和团级 roster。",
				],
				"AllianceMembersGroupsSummaryBlock"
			),
			_build_section_text_block(
				"结构说明",
				[
					"主控位和正式指挥位当前都能归入分组视角。",
					"分组页现在先固定卡片、说明和后续 roster 扩展位三层关系。",
				],
				"AllianceMembersGroupsStructureBlock"
			),
		],
	}

func _build_subordinates_section(owned_clusters: Array) -> Dictionary:
	var district_groups: Dictionary = _group_city_clusters_by_district(owned_clusters)
	var item_cards: Array = []
	for district_id in district_groups.keys():
		var district_clusters: Array = district_groups[district_id] as Array
		item_cards.append(_build_section_item_card(
			"%s组" % _format_district_label(str(district_id)),
			"%s 城" % str(district_clusters.size()),
			_summarize_cluster_names(district_clusters),
			"下属成员当前按已占城池所在州郡聚合。"
		))
	if item_cards.is_empty():
		item_cards.append(_build_section_item_card(
			"暂无下属城池",
			"待接入",
			"当前势力尚未在地图上形成可聚合州郡",
			"后续接更多已占城池后会在这里自动展开州郡层级。"
		))
	return {
		"summary_lines": [
			"下属成员页已切到显式 district card 合同，不再只靠字符串拼州郡列表。",
			"当前已占城池 %s / 聚合州郡 %s。" % [str(owned_clusters.size()), str(maxi(item_cards.size(), 1))],
		],
		"item_cards": item_cards,
		"content_blocks": [
			_build_section_text_block(
				"下属成员摘要",
				[
					"下属成员按已占城池所在州郡聚合，反映真实地图占领面而不是静态组织样例。",
					"后续接更细的下属城市或驻点 roster 后，这里可继续向组织层下钻。",
				],
				"AllianceMembersSubordinatesSummaryBlock"
			),
		],
	}

func _build_officers_section(capital_name: String, commanders: Array, directives: Array) -> Dictionary:
	var item_cards: Array = [
		_build_section_item_card("盟主", "玩家主控", "主城 %s" % capital_name, "官员架构先固定主控位。"),
	]
	for raw_commander in commanders:
		var commander: Dictionary = raw_commander as Dictionary
		var region_label: String = _format_region_label(str(commander.get("assignedRegionId", "")))
		item_cards.append(_build_section_item_card(
			_resolve_officer_title(str(commander.get("specialty", ""))),
			str(commander.get("name", "同盟指挥")),
			region_label,
			"当前官员架构按同盟主控位与指挥 specialty 生成。"
		))
	var structure_lines: Array[String] = ["当前官员架构按同盟主控位与指挥 specialty 生成。"]
	if directives.size() > commanders.size():
		structure_lines.append("仍有 %s 个目标缺少专属指挥位，后续可继续补编。" % str(directives.size() - commanders.size()))
	return {
		"summary_lines": [
			"官员架构页已切到显式 officer card 合同，不再只靠职级字符串拼接。",
			"主控位 1 / 指挥位 %s / 协同目标 %s。" % [str(commanders.size()), str(directives.size())],
		],
		"item_cards": item_cards,
		"content_blocks": [
			_build_section_text_block(
				"官员摘要",
				structure_lines,
				"AllianceMembersOfficersSummaryBlock"
			),
			_build_section_text_block(
				"结构说明",
				[
					"当前官员页保持主控位、正式指挥位和区域归属三层关系。",
					"后续接真实官职权限后，可继续向审批链和职责面扩展。",
				],
				"AllianceMembersOfficersStructureBlock"
			),
		],
	}

func _build_territory_section(owned_clusters: Array, directives: Array) -> Dictionary:
	var item_cards: Array = []
	for raw_cluster in owned_clusters.slice(0, 4):
		var cluster: Dictionary = raw_cluster as Dictionary
		item_cards.append(_build_section_item_card(
			str(cluster.get("name", "已占城池")),
			_format_district_label(str(cluster.get("district", ""))),
			"政%s / 后%s / 防%s / 募%s" % [
				str(int((cluster.get("techLevels", {}) as Dictionary).get("governance", 0))),
				str(int((cluster.get("techLevels", {}) as Dictionary).get("logistics", 0))),
				str(int((cluster.get("techLevels", {}) as Dictionary).get("defense", 0))),
				str(int((cluster.get("techLevels", {}) as Dictionary).get("recruitment", 0))),
			],
			"势力分布优先消费正式已占城池与科技结构。"
		))
	for raw_directive in directives.slice(0, max(0, 4 - item_cards.size())):
		var directive: Dictionary = raw_directive as Dictionary
		item_cards.append(_build_section_item_card(
			_format_region_label(str(directive.get("regionId", ""))),
			_format_stance_label(str(directive.get("stance", ""))),
			"支援 %s" % str(int(directive.get("supportLevel", 0))),
			"当前没有更多已占城池时，先保留正式 directive 的地域结构位。"
		))
	if item_cards.is_empty():
		item_cards.append(_build_section_item_card(
			"暂无可展示领地",
			"待接入",
			"当前世界占领面尚未形成正式同盟版图",
			"后续会在城市占领面回写后自动替换。"
		))
	return {
		"summary_lines": [
			"势力分布页已切到显式 territory card 合同，不再只靠字符串拼区域项。",
			"已占城池 %s / 协同目标 %s。" % [str(owned_clusters.size()), str(directives.size())],
		],
		"item_cards": item_cards,
		"content_blocks": [
			_build_section_text_block(
				"势力摘要",
				[
					"势力分布当前优先读取已占城池与正式 directives，保持和地图权威状态一致。",
					"后续可继续接更细的地图驻点和区域密度信息。",
				],
				"AllianceMembersTerritorySummaryBlock"
			),
		],
	}

func _build_strategy_section(directives: Array, alliance_actions: Array) -> Dictionary:
	var item_cards: Array = []
	for raw_directive in directives.slice(0, 4):
		var directive: Dictionary = raw_directive as Dictionary
		item_cards.append(_build_section_item_card(
			_format_region_label(str(directive.get("regionId", ""))),
			_format_stance_label(str(directive.get("stance", ""))),
			"支援 %s" % str(int(directive.get("supportLevel", 0))),
			"军略页优先消费正式 directives。"
		))
	if item_cards.is_empty():
		item_cards.append(_build_section_item_card(
			"暂无正式同盟目标",
			"待命",
			"当前无 directives 可展示",
			"后续会在正式协同目标回写后刷新。"
		))
	var strategy_lines: Array[String] = []
	if not alliance_actions.is_empty():
		var latest_action: Dictionary = alliance_actions[0] as Dictionary
		strategy_lines.append("最近协同行动：%s" % str(latest_action.get("detail", "等待协同行动反馈。")))
	else:
		strategy_lines.append("当前尚未产出同盟行动反馈，军略先显示 directives 主线。")
	return {
		"summary_lines": [
			"军略页已切到显式 strategy card 合同，不再只靠字符串拼目标项。",
			"当前正式协同目标 %s / 最新协同行动 %s。" % [str(directives.size()), str(alliance_actions.size())],
		],
		"item_cards": item_cards,
		"content_blocks": [
			_build_section_text_block(
				"军略摘要",
				strategy_lines,
				"AllianceMembersStrategySummaryBlock"
			),
			_build_section_text_block(
				"结构说明",
				[
					"军略页当前固定为目标卡片 + 协同行动摘要的二层结构。",
					"后续可继续接区域策略或执行节奏块。",
				],
				"AllianceMembersStrategyStructureBlock"
			),
		],
	}

func _build_latest_reports_section(reports: Array, battle_records: Array) -> Dictionary:
	var item_cards: Array = []
	for raw_report in reports.slice(0, 4):
		var report: Dictionary = raw_report as Dictionary
		item_cards.append(_build_section_item_card(
			str(report.get("title", "战报")),
			"Tick %s" % str(int(report.get("tick", 0))),
			"正式 reports 来源",
			"最新战报优先消费权威 reports。"
		))
	if item_cards.is_empty():
		for raw_record in battle_records.slice(0, 4):
			var record: Dictionary = raw_record as Dictionary
			item_cards.append(_build_section_item_card(
				str(record.get("summary", "战斗记录")),
				"Tick %s" % str(int(record.get("tick", 0))),
				"battleRecords 回退来源",
				"当前正式 reports 为空时先保留战斗记录入口。"
			))
	if item_cards.is_empty():
		item_cards.append(_build_section_item_card(
			"暂无最新战报",
			"等待回写",
			"当前权威 reports 为空",
			"后续会在正式战报流回写后刷新。"
		))
	return {
		"summary_lines": [
			"最新战报页已切到显式 report card 合同，不再只保留战报标题字符串。",
			"当前优先读取 world.reports，如为空则回退到 battleRecords。",
		],
		"list_title": "战报卡片",
		"item_cards": item_cards,
		"content_blocks": [
			_build_section_text_block(
				"战报摘要",
				[
					"最新战报当前直接读取正式 world.reports / battleRecords。",
					"当前 reports %s / battleRecords %s。" % [str(reports.size()), str(battle_records.size())],
				],
				"AllianceBattleReportsLatestSummaryBlock"
			),
			_build_section_text_block(
				"来源说明",
				[
					"reports 是首选来源，battleRecords 仅作为缺省回退。",
					"这一页继续保留时间线入口，不在本轮展开详情页内嵌结构。",
				],
				"AllianceBattleReportsLatestSourceBlock"
			),
		],
	}

func _build_report_highlights_section(alliance_actions: Array, battle_records: Array) -> Dictionary:
	var item_cards: Array = []
	for raw_action in alliance_actions.slice(0, 4):
		var action: Dictionary = raw_action as Dictionary
		item_cards.append(_build_section_item_card(
			str(action.get("title", "协同行动")),
			str(action.get("severity", "medium")),
			"allianceActions 重点来源",
			"重点战况优先展示正式协同行动。"
		))
	if item_cards.is_empty():
		for raw_record in battle_records.slice(0, 4):
			var record: Dictionary = raw_record as Dictionary
			item_cards.append(_build_section_item_card(
				str(record.get("summary", "战斗记录")),
				"支援 %s" % str(int(record.get("alliedSupport", 0))),
				"battleRecords 回退来源",
				"当前正式重点行动为空时先保留战斗记录入口。"
			))
	if item_cards.is_empty():
		item_cards.append(_build_section_item_card(
			"暂无重点战况",
			"等待回写",
			"当前未生成 allianceActions / battleRecords",
			"后续会在正式重点战况回写后刷新。"
		))
	return {
		"summary_lines": [
			"重点战况页已切到显式 highlight card 合同，不再只保留重点节点字符串。",
			"当前优先展示 allianceActions，如为空则回退到 battleRecords。",
		],
		"list_title": "重点卡片",
		"item_cards": item_cards,
		"content_blocks": [
			_build_section_text_block(
				"重点摘要",
				[
					"重点战况优先展示正式 allianceActions，如无则回退到 battleRecords。",
					"当前 allianceActions %s / battleRecords %s。" % [str(alliance_actions.size()), str(battle_records.size())],
				],
				"AllianceBattleReportsHighlightsSummaryBlock"
			),
			_build_section_text_block(
				"筛选说明",
				[
					"重点页用于快速定位高价值战况，不在本轮展开更细的战区过滤。",
					"后续可继续接突破点、伤亡高点和驻守变更标签。",
				],
				"AllianceBattleReportsHighlightsStructureBlock"
			),
		],
	}

func _build_report_archive_section(reports: Array, execution_replays: Array, battle_records: Array, diplomacy_agreements: Array) -> Dictionary:
	return {
		"summary_lines": [
			"战报归档页已切到显式 archive card 合同，不再只保留归档数量字符串。",
			"当前先按正式 reports / executionReplays / battleRecords / diplomacyAgreements 聚合。",
		],
		"list_title": "归档卡片",
		"item_cards": [
			_build_section_item_card("战报总数", str(reports.size()), "reports 归档", "正式战报数量作为归档主锚点。"),
			_build_section_item_card("执行回放", str(execution_replays.size()), "executionReplays 归档", "执行回放继续保留和战报并列的结构位。"),
			_build_section_item_card("战斗记录", str(battle_records.size()), "battleRecords 归档", "战斗记录用于补足回放前后的历史节点。"),
			_build_section_item_card("外交协议", str(diplomacy_agreements.size()), "diplomacyAgreements 归档", "外交协议继续作为联盟战报域的上下文归档。"),
		],
		"content_blocks": [
			_build_section_text_block(
				"归档摘要",
				[
					"归档当前按正式 reports / executionReplays / battleRecords / diplomacyAgreements 聚合。",
					"这部分先固定来源和数量关系，不在本轮展开导出与筛选。",
				],
				"AllianceBattleReportsArchiveSummaryBlock"
			),
			_build_section_text_block(
				"归档说明",
				[
					"战报、回放、战斗记录和外交协议继续保持并列结构位。",
					"后续可在这一页继续接时间筛选、战区标签和复盘标记。",
				],
				"AllianceBattleReportsArchiveStructureBlock"
			),
		],
	}

func _build_mail_inbox_section(reports: Array, alliance_actions: Array) -> Dictionary:
	var item_cards: Array = []
	for raw_action in alliance_actions.slice(0, 2):
		var action: Dictionary = raw_action as Dictionary
		item_cards.append(_build_section_item_card(
			"同盟通知",
			str(action.get("title", "协同行动")),
			str(action.get("severity", "medium")),
			"收件箱先由 allianceActions 提供同盟通知源。"
		))
	for raw_report in reports.slice(0, 2):
		var report: Dictionary = raw_report as Dictionary
		item_cards.append(_build_section_item_card(
			"战报通知",
			str(report.get("title", "系统报告")),
			"Tick %s" % str(int(report.get("tick", 0))),
			"收件箱继续保留战报通知入口。"
		))
	if item_cards.is_empty():
		item_cards.append(_build_section_item_card(
			"暂无收件内容",
			"等待通知源",
			"当前未产出 allianceActions / reports",
			"后续会在正式通知回写后刷新。"
		))
	return {
		"summary_lines": [
			"收件箱页已切到显式 inbox card 合同，不再只保留通知标题字符串。",
			"当前收件流先由 allianceActions 与 reports 组成。",
		],
		"list_title": "通知卡片",
		"item_cards": item_cards,
		"content_blocks": [
			_build_section_text_block(
				"收件摘要",
				[
					"收件箱先由 allianceActions 与 reports 拼成正式通知流。",
					"当前同盟通知 %s / 战报通知 %s。" % [str(mini(2, alliance_actions.size())), str(mini(2, reports.size()))],
				],
				"AllianceMailInboxSummaryBlock"
			),
			_build_section_text_block(
				"来源说明",
				[
					"收件箱继续保留同盟通知和战报通知的混合入口。",
					"后续可在这一页接来源筛选、已读状态和跳转关联。",
				],
				"AllianceMailInboxSourceBlock"
			),
		],
	}

func _build_mail_system_section(player_execution: Dictionary, reports: Array, diplomacy_agreements: Array) -> Dictionary:
	var item_cards: Array = []
	if not player_execution.is_empty():
		item_cards.append(_build_section_item_card(
			"执行链",
			str(player_execution.get("strategicCommand", "当前无战略命令")),
			"系统执行态",
			"系统信承接同盟执行链的系统回执。"
		))
		item_cards.append(_build_section_item_card(
			"复盘 Tick",
			str(int(player_execution.get("reviewAtTick", 0))),
			"execution.reviewAtTick",
			"用于表示下一次复盘或回写节点。"
		))
	for raw_report in reports.slice(0, 2):
		var report: Dictionary = raw_report as Dictionary
		item_cards.append(_build_section_item_card(
			"系统信",
			str(report.get("title", "系统报告")),
			"Tick %s" % str(int(report.get("tick", 0))),
			"战报类系统信继续在这里保留结构位。"
		))
	if diplomacy_agreements.is_empty():
		item_cards.append(_build_section_item_card(
			"外交提醒",
			"当前无正式协定",
			"外交状态",
			"无正式协定时仍保留提醒位。"
		))
	return {
		"summary_lines": [
			"系统信页已切到显式 system mail card 合同，不再只保留系统通知字符串。",
			"当前承接执行链、战报与外交状态。",
		],
		"list_title": "系统通知卡",
		"item_cards": item_cards,
		"content_blocks": [
			_build_section_text_block(
				"系统摘要",
				[
					"系统信当前承接执行链、战报与外交状态，不再用静态建筑升级提醒占位。",
					"当前系统信 %s / 外交协定 %s。" % [str(mini(2, reports.size())), str(diplomacy_agreements.size())],
				],
				"AllianceMailSystemSummaryBlock"
			),
			_build_section_text_block(
				"来源说明",
				[
					"系统信继续保留 world 回写、执行链状态和外交提醒的混合来源。",
					"后续可继续接已读状态、来源筛选和跨壳跳转。",
				],
				"AllianceMailSystemSourceBlock"
			),
		],
	}

func _build_mail_archive_section(reports: Array, execution_replays: Array, alliance_actions: Array) -> Dictionary:
	return {
		"summary_lines": [
			"邮件归档页已切到显式 archive card 合同，不再只保留归档条目字符串。",
			"当前先按通知源数量和执行回放数量组织归档结构。",
		],
		"list_title": "归档卡片",
		"item_cards": [
			_build_section_item_card("已归档通知", str(reports.size() + alliance_actions.size()), "邮件总量", "收件流与同盟通知先在这一层合并归档。"),
			_build_section_item_card("执行链归档", str(execution_replays.size()), "executionReplays", "执行回放继续作为通知归档的旁路来源。"),
			_build_section_item_card("最近协同行动", str(alliance_actions.size()), "allianceActions", "协同行动条目保留最近通知来源的结构位。"),
			_build_section_item_card("最近战报", str(reports.size()), "reports", "战报通知数量继续作为归档页的稳定锚点。"),
		],
		"content_blocks": [
			_build_section_text_block(
				"归档摘要",
				[
					"归档页先按正式通知源数量聚合，等独立邮件合同落地后再接搜索与批处理。",
					"当前收件归档、执行回放和最近通知保持并列结构。",
				],
				"AllianceMailArchiveSummaryBlock"
			),
			_build_section_text_block(
				"归档说明",
				[
					"这一页当前只负责沉淀已读消息和历史通知。",
					"后续可继续接批量归档、来源筛选和关联跳转。",
				],
				"AllianceMailArchiveStructureBlock"
			),
		],
	}

func _build_applications_pending_section(
	member_count: int,
	online_count: int,
	seat_gap: int,
	commander_gap: int,
	low_support_count: int,
	status_counts: Dictionary,
	report_count: int
) -> Dictionary:
	return {
		"summary_lines": [
			"申请待审页当前先按容量、指挥缺口和低支援目标补骨架。",
			"当前成员 %s / 在线 %s，后续接权威申请流后可直接替换卡片内容。" % [str(member_count), str(online_count)],
		],
		"list_title": "审批指标",
		"item_cards": [
			_build_section_item_card("待审申请", "0", "当前合同未提供正式申请数组", "先保留审批位置与容量关系。"),
			_build_section_item_card("可扩编席位", str(seat_gap), "成员 %s / 在线 %s" % [str(member_count), str(online_count)], "用于表示当前同盟的可补位空间。"),
			_build_section_item_card("指挥位缺口", str(commander_gap), "进行中 %s / 待执行 %s" % [str(int(status_counts.get("running", 0))), str(int(status_counts.get("queued", 0)))], "优先补足协同目标缺少专属指挥位的部分。"),
			_build_section_item_card("低支援目标", str(low_support_count), "待回执战报 %s" % str(mini(4, report_count)), "低支援目标会优先进入审批与补位视线。"),
		],
		"content_blocks": [
			_build_section_text_block(
				"审批口径",
				[
					"当前世界合同尚未提供正式入盟申请数组，这里先按真实容量与协同缺口展示。",
					"后续接权威申请流后，这一栏可直接替换，不需要改面板骨架。",
				],
				"AllianceApplicationsPendingPolicyBlock"
			),
			_build_section_text_block(
				"容量校验",
				[
					"当前成员 %s / 在线 %s。" % [str(member_count), str(online_count)],
					"进行中协同单 %s，待执行协同单 %s。" % [str(int(status_counts.get("running", 0))), str(int(status_counts.get("queued", 0)))],
				],
				"AllianceApplicationsPendingCapacityBlock"
			),
		],
	}


func _build_applications_review_section(status_counts: Dictionary, low_support_count: int, report_count: int) -> Dictionary:
	return {
		"summary_lines": [
			"审批复核页已切到显式 review card 合同，用于承接继续确认的同盟事务。",
			"运行中与待执行协同单会优先进入这一页的复核视野。",
		],
		"list_title": "复核卡片",
		"item_cards": [
			_build_section_item_card("进行中协同单", str(int(status_counts.get("running", 0))), "当前执行链在跑的协同单", "优先确认正在运行中的同盟事务。"),
			_build_section_item_card("待执行协同单", str(int(status_counts.get("queued", 0))), "等待编排层推进", "表示还没真正进入运行态的同盟单。"),
			_build_section_item_card("低支援复核", str(low_support_count), "需要继续补支援或补位", "低支援目标会持续停留在复核页。"),
			_build_section_item_card("待回执战报", str(mini(4, report_count)), "最近战报等待回执", "先保留战报回执和审批链的结构关系。"),
		],
		"content_blocks": [
			_build_section_text_block(
				"复核摘要",
				[
					"审批中先借用执行链和低支援目标，表示需要继续确认的同盟事务。",
					"这部分是动态数据替代，不再写死 '待审批 4 / 待补材料 2' 这类静态文案。",
				],
				"AllianceApplicationsReviewSummaryBlock"
			),
			_build_section_text_block(
				"处理提示",
				[
					"运行中协同单建议优先看执行态，待执行协同单建议优先看编排缺口。",
					"待回执战报当前先作为复核提醒，不在这一页展开战报详情。",
				],
				"AllianceApplicationsReviewHintBlock"
			),
		],
	}


func _build_applications_history_section(alliance_action_count: int, execution_replay_count: int, report_count: int, diplomacy_count: int) -> Dictionary:
	return {
		"summary_lines": [
			"历史页已切到显式 archive card 合同，用于承接协同行动、回放和战报归档。",
			"当前先按正式反馈源数量聚合，不再只保留一串归档文本。",
		],
		"list_title": "归档卡片",
		"item_cards": [
			_build_section_item_card("本轮协同行动", str(alliance_action_count), "allianceActions 归档", "协同行动反馈是历史页的第一层正式来源。"),
			_build_section_item_card("执行回放归档", str(execution_replay_count), "executionReplays 归档", "用于承接后续可回放的执行链历史。"),
			_build_section_item_card("战报归档", str(report_count), "reports 归档", "战报数量先在这里固定为历史页的正式锚点。"),
			_build_section_item_card("外交协定", str(diplomacy_count), "diplomacyAgreements 归档", "后续可把同盟准入通过/拒绝继续并入这里。"),
		],
		"content_blocks": [
			_build_section_text_block(
				"历史摘要",
				[
					"历史记录按正式协同行动、执行回放与战报数量聚合。",
					"后续接真实申请流后，可把同盟准入的通过/拒绝也放进这里。",
				],
				"AllianceApplicationsHistorySummaryBlock"
			),
			_build_section_text_block(
				"归档说明",
				[
					"当前历史页先固定正式来源和数量关系，不在这一轮展开筛选与检索层。",
					"外交协定、执行回放和战报会继续保持并列结构位。",
				],
				"AllianceApplicationsHistoryArchiveBlock"
			),
		],
	}


func _build_coordination_board_section(directives: Array, status_counts: Dictionary) -> Dictionary:
	var item_cards: Array = []
	for raw_directive in directives.slice(0, 4):
		var directive: Dictionary = raw_directive as Dictionary
		var region_label := _format_region_label(str(directive.get("regionId", "")))
		var stance_label := _format_stance_label(str(directive.get("stance", "")))
		var support_level := int(directive.get("supportLevel", 0))
		item_cards.append(_build_section_item_card(
			region_label,
			stance_label,
			"支援 %s" % str(support_level),
			"低支援待补" if support_level < 70 else "协同态稳定"
		))
	if item_cards.is_empty():
		item_cards.append(_build_section_item_card("暂无正式协同目标", "待命", "当前 directives 为空", "后续会在权威协同目标回写后刷新。"))
	var actions: Array = _build_directive_actions(directives)
	var content_blocks: Array = [
		_build_section_text_block(
			"目标摘要",
			[
				"目标看板直接读取正式 directives，不再写死攻城/驻点/补给样例。",
				"总目标 %s / 低支援 %s / 待执行 %s / 进行中 %s / 已完成 %s。" % [
					str(directives.size()),
					str(_count_low_support_directives(directives)),
					str(int(status_counts.get("queued", 0))),
					str(int(status_counts.get("running", 0))),
					str(int(status_counts.get("completed", 0))),
				],
			],
			"AllianceCoordinationBoardSummaryBlock"
		),
	]
	if not actions.is_empty():
		content_blocks.append({
			"kind": "button_row",
			"title": "姿态调整",
			"actions": actions,
			"node_name": "AllianceCoordinationBoardActionBlock",
		})
	var footer_lines := _build_directive_action_footer_lines(directives)
	if not footer_lines.is_empty():
		content_blocks.append(_build_section_text_block(
			"动作说明",
			footer_lines,
			"AllianceCoordinationBoardFooterBlock"
		))
	return {
		"summary_lines": [
			"协同看板已切到显式 directive card + action block 合同。",
			"只开放前 %s 个正式协同目标的姿态调整。" % str(DIRECTIVE_ACTION_LIMIT),
		],
		"item_cards": item_cards,
		"content_blocks": content_blocks,
	}

func _build_coordination_progress_section(player_execution: Dictionary, status_counts: Dictionary, directives: Array) -> Dictionary:
	var item_cards: Array = [
		_build_section_item_card("待执行", str(int(status_counts.get("queued", 0))), "执行状态", "当前待进入正式执行链的协同目标。"),
		_build_section_item_card("进行中", str(int(status_counts.get("running", 0))), "执行状态", "当前处于执行中的正式协同目标。"),
		_build_section_item_card("已完成", str(int(status_counts.get("completed", 0))), "执行状态", "当前已经收口到完成态的协同目标。"),
		_build_section_item_card("低支援目标", str(_count_low_support_directives(directives)), "风险状态", "当前需要补支援或调整姿态的目标数量。"),
	]
	var progress_lines: Array[String] = []
	if not player_execution.is_empty():
		progress_lines.append("当前战略命令：%s" % str(player_execution.get("strategicCommand", "无")))
		progress_lines.append("计划来源：%s" % str(player_execution.get("source", "unknown")))
	else:
		progress_lines.append("当前无正式 player execution，进度先按 directives 和状态计数展示。")
	return {
		"summary_lines": [
			"执行进度页已切到显式 progress card 合同，不再只靠状态字符串统计。",
			"总目标 %s / 当前 player execution %s。" % [str(directives.size()), "已接入" if not player_execution.is_empty() else "未接入"],
		],
		"item_cards": item_cards,
		"content_blocks": [
			_build_section_text_block(
				"进度摘要",
				progress_lines,
				"AllianceCoordinationProgressSummaryBlock"
			),
			_build_section_text_block(
				"结构说明",
				[
					"进度页当前固定为状态卡片 + 执行说明块。",
					"后续可继续接更细的逐目标里程碑或来源面板。",
				],
				"AllianceCoordinationProgressStructureBlock"
			),
		],
	}

func _build_coordination_log_section(alliance_actions: Array, execution_replays: Array) -> Dictionary:
	var item_cards: Array = []
	for raw_action in alliance_actions.slice(0, 4):
		var action: Dictionary = raw_action as Dictionary
		item_cards.append(_build_section_item_card(
			str(action.get("title", "协同行动")),
			"执行日志",
			str(action.get("detail", "")),
			"协同日志优先展示正式 allianceActions。"
		))
	if item_cards.is_empty():
		for raw_replay in execution_replays.slice(0, 4):
			var replay: Dictionary = raw_replay as Dictionary
			item_cards.append(_build_section_item_card(
				str(replay.get("strategicCommand", "执行回放")),
				"复盘 Tick %s" % str(int(replay.get("reviewAtTick", 0))),
				"executionReplays 回退来源",
				"当前正式协同行动为空时，先保留执行回放入口。"
			))
	if item_cards.is_empty():
		item_cards.append(_build_section_item_card(
			"暂无协同日志",
			"待接入",
			"当前未生成 allianceActions / executionReplays",
			"后续会在正式协同行动或执行回放回写后刷新。"
		))
	return {
		"summary_lines": [
			"协同日志页已切到显式 log card 合同，不再只靠字符串拼接执行记录。",
			"allianceActions %s / executionReplays %s。" % [str(alliance_actions.size()), str(execution_replays.size())],
		],
		"item_cards": item_cards,
		"content_blocks": [
			_build_section_text_block(
				"日志摘要",
				[
					"协同日志优先展示正式 allianceActions，必要时回退到 executionReplays。",
					"当前继续保持列表入口和来源说明分层，不在这里展开日志详情页。",
				],
				"AllianceCoordinationLogSummaryBlock"
			),
		],
	}


func _build_section_item_card(title: String, value: String, meta: String = "", description: String = "") -> Dictionary:
	return {
		"title": title,
		"value": value,
		"meta": meta,
		"description": description,
	}


func _build_section_text_block(title: String, lines: Array, node_name: String) -> Dictionary:
	return {
		"kind": "text_block",
		"title": title,
		"lines": lines,
		"node_name": node_name,
	}

func _collect_directive_dicts(directives_by_region: Dictionary) -> Array:
	var directives: Array = []
	for region_id_variant in directives_by_region.keys():
		var region_id: String = str(region_id_variant).strip_edges()
		if region_id == "":
			continue
		var raw_directive: Variant = directives_by_region.get(region_id_variant, {})
		var directive: Dictionary = raw_directive as Dictionary if raw_directive is Dictionary else {}
		var directive_copy: Dictionary = directive.duplicate(true)
		directive_copy["regionId"] = str(directive_copy.get("regionId", region_id))
		directives.append(directive_copy)
	return directives

func _collect_owned_city_clusters(city_clusters: Array) -> Array:
	var owned_clusters: Array = []
	for raw_cluster in city_clusters:
		var cluster: Dictionary = raw_cluster as Dictionary
		if _target_faction_id != "" and str(cluster.get("owner", "")) != _target_faction_id:
			continue
		owned_clusters.append(cluster)
	return owned_clusters

func _group_city_clusters_by_district(city_clusters: Array) -> Dictionary:
	var district_groups: Dictionary = {}
	for raw_cluster in city_clusters:
		var cluster: Dictionary = raw_cluster as Dictionary
		var district_id: String = str(cluster.get("district", "unknown")).strip_edges()
		if district_id == "":
			district_id = "unknown"
		if not district_groups.has(district_id):
			district_groups[district_id] = []
		(district_groups[district_id] as Array).append(cluster)
	return district_groups

func _build_order_status_counts(orders: Array) -> Dictionary:
	var counts: Dictionary = {
		"queued": 0,
		"running": 0,
		"completed": 0,
	}
	for raw_order in orders:
		var order: Dictionary = raw_order as Dictionary
		var status_id: String = str(order.get("status", "")).strip_edges().to_lower()
		if counts.has(status_id):
			counts[status_id] = int(counts.get(status_id, 0)) + 1
	return counts

func _count_low_support_directives(directives: Array) -> int:
	var low_support_count: int = 0
	for raw_directive in directives:
		var directive: Dictionary = raw_directive as Dictionary
		if int(directive.get("supportLevel", 0)) < 70:
			low_support_count += 1
	return low_support_count


func _build_directive_actions(directives: Array) -> Array:
	var actions: Array = []
	for raw_directive in directives.slice(0, DIRECTIVE_ACTION_LIMIT):
		var directive: Dictionary = raw_directive as Dictionary
		var region_id: String = str(directive.get("regionId", "")).strip_edges()
		var current_stance: String = str(directive.get("stance", "")).strip_edges()
		if region_id == "":
			continue
		for stance_id_variant in DIRECTIVE_ACTION_STANCE_ORDER:
			var stance_id: String = str(stance_id_variant).strip_edges()
			if stance_id == "":
				continue
			actions.append({
				"id": "directive|%s|%s" % [region_id, stance_id],
				"label": "%s -> %s" % [_format_region_label(region_id), _format_stance_label(stance_id)],
				"disabled": current_stance == stance_id,
			})
	return actions


func _build_directive_action_footer_lines(directives: Array) -> Array:
	if directives.is_empty():
		return []
	var footer_lines: Array = [
		"当前只开放前 %s 个正式协同目标的姿态切换按钮，避免主面板一次堆叠过多控制项。" % str(DIRECTIVE_ACTION_LIMIT),
	]
	if directives.size() > DIRECTIVE_ACTION_LIMIT:
		footer_lines.append("其余目标仍保留在列表里展示，后续再补更细的选中态和逐目标控制。")
	return footer_lines

func _summarize_cluster_names(city_clusters: Array) -> String:
	var names: Array = []
	for raw_cluster in city_clusters.slice(0, 3):
		var cluster: Dictionary = raw_cluster as Dictionary
		names.append(str(cluster.get("name", "城池")))
	var summary: String = " / ".join(names)
	if city_clusters.size() > names.size():
		summary = "%s 等 %s 城" % [summary, str(city_clusters.size())]
	return summary

func _resolve_home_city_name(faction_state: Dictionary, owned_clusters: Array) -> String:
	var hero_command: Dictionary = faction_state.get("heroCommand", {}) as Dictionary
	var home_tile_id: String = str(hero_command.get("homeTileId", ""))
	var primary_cluster: Dictionary = _find_primary_city_cluster(owned_clusters, home_tile_id)
	var city_name: String = str(primary_cluster.get("name", "")).strip_edges()
	if city_name == "":
		city_name = _read_tile_name(home_tile_id)
	if city_name == "":
		city_name = "主城待识别"
	return city_name

func _resolve_officer_title(specialty_id: String) -> String:
	match specialty_id:
		"frontier":
			return "前线指挥"
		"recon":
			return "侦察官"
		"resource":
			return "拓展官"
		_:
			return "同盟官员"

func _format_specialty_label(specialty_id: String) -> String:
	match specialty_id:
		"frontier":
			return "前线组"
		"recon":
			return "侦察组"
		"resource":
			return "拓展组"
		_:
			return specialty_id if specialty_id != "" else "待命组"

func _format_stance_label(stance_id: String) -> String:
	match stance_id:
		"support":
			return "策应"
		"harass":
			return "袭扰"
		"hold":
			return "固守"
		"expand":
			return "推进"
		_:
			return stance_id if stance_id != "" else "待命"

func _format_region_label(region_id: String) -> String:
	if region_id == "":
		return "未定区域"
	var words: Array = region_id.replace("_", " ").split(" ")
	var normalized_words: Array = []
	for raw_word in words:
		var word: String = str(raw_word).strip_edges()
		if word == "":
			continue
		normalized_words.append(word.capitalize())
	return " ".join(normalized_words)

func _format_district_label(district_id: String) -> String:
	if district_id == "":
		return "未知州郡"
	match district_id:
		"sili":
			return "司隶"
		"jizhou":
			return "冀州"
		"jingzhou":
			return "荆州"
		"yanzhou":
			return "兖州"
		_:
			return district_id.capitalize()

func _read_target_faction_state() -> Dictionary:
	var raw_factions: Variant = _world_data.get("factions", {})
	if raw_factions is Dictionary and _target_faction_id != "":
		var faction_state: Variant = (raw_factions as Dictionary).get(_target_faction_id, {})
		if faction_state is Dictionary:
			return faction_state
	return {}

func _read_city_clusters() -> Array:
	var layout_map: Dictionary = _map_layout_data.get("map", {}) as Dictionary
	var layout_overlays: Dictionary = layout_map.get("overlays", {}) as Dictionary
	var direct_layout_overlays: Dictionary = _map_layout_data.get("overlays", {}) as Dictionary
	var world_map: Dictionary = _world_data.get("map", {}) as Dictionary
	var world_overlays: Dictionary = world_map.get("overlays", {}) as Dictionary
	var candidates: Array = [
		layout_overlays.get("cityClusters", []),
		direct_layout_overlays.get("cityClusters", []),
		world_overlays.get("cityClusters", []),
	]
	for candidate in candidates:
		if candidate is Array and not (candidate as Array).is_empty():
			return candidate
	return []

func _find_primary_city_cluster(city_clusters: Array, home_tile_id: String) -> Dictionary:
	for raw_cluster in city_clusters:
		var cluster: Dictionary = raw_cluster as Dictionary
		if str(cluster.get("centerTileId", "")) == home_tile_id or str(cluster.get("cityHallTileId", "")) == home_tile_id:
			return cluster
		var tile_ids: Variant = cluster.get("tileIds", [])
		if tile_ids is Array and home_tile_id in (tile_ids as Array):
			return cluster
	for raw_cluster in city_clusters:
		var cluster: Dictionary = raw_cluster as Dictionary
		if str(cluster.get("owner", "")) == _target_faction_id:
			return cluster
	return {}

func _read_tile_name(tile_id: String) -> String:
	if tile_id == "":
		return ""
	var candidate_tile_lists: Array = [
		(_map_layout_data.get("map", {}) as Dictionary).get("tiles", []),
		_map_layout_data.get("tiles", []),
		(_world_data.get("map", {}) as Dictionary).get("tiles", []),
	]
	for candidate in candidate_tile_lists:
		if not (candidate is Array):
			continue
		for raw_tile in candidate:
			var tile: Dictionary = raw_tile as Dictionary
			if str(tile.get("id", "")) == tile_id:
				return str(tile.get("name", ""))
	return ""
