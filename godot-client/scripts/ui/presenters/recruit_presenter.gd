extends RefCounted
class_name RecruitPresenter

const PROFILE_PREVIEW_DATA_PATH := "res://data/ui/general_profile_preview.json"
const EQUIPPABLE_SKILL_LIBRARY_DATA_PATH := "res://data/ui/general_skill_library_preview.json"

var _world_data: Dictionary = {}
var _map_layout_data: Dictionary = {}
var _target_faction_id: String = ""

func configure(world_data: Dictionary, map_layout_data: Dictionary, target_faction_id: String) -> void:
	_world_data = world_data
	_map_layout_data = map_layout_data
	_target_faction_id = target_faction_id.strip_edges()

func build_snapshot(runtime_context: Dictionary) -> Dictionary:
	var faction_state := _read_target_faction_state()
	var hero_command: Dictionary = faction_state.get("heroCommand", {}) as Dictionary
	var roster_ids: Array = hero_command.get("rosterHeroIds", []) as Array
	var cooldown := int(faction_state.get("recruitCooldown", 0))
	var development_points := int(hero_command.get("developmentPoints", 0))
	var acquisition_threshold := int(hero_command.get("acquisitionThreshold", 0))
	var prospect_hero_ids: Array = hero_command.get("prospectHeroIds", []) as Array
	var home_tile_id := str(hero_command.get("homeTileId", "")).strip_edges()
	var recruit_state := WorldStore.get_recruit_state(_target_faction_id)
	var selected_pool_id := str(recruit_state.get("selectedPoolId", "pool_standard"))
	var last_results: Array = recruit_state.get("lastResults", []) as Array
	var last_draw_mode := str(recruit_state.get("lastDrawMode", "none"))
	var updated_tick := int(recruit_state.get("updatedTick", -1))
	var available_draw_count := _estimate_available_draw_count(development_points, acquisition_threshold, prospect_hero_ids.size())
	var latest_result := _resolve_latest_result(hero_command, last_results)
	var latest_hero_id := str(latest_result.get("heroId", "")).strip_edges()
	var latest_deployment := _resolve_hero_deployment(latest_hero_id)
	var latest_updated_tick := int(latest_result.get("updatedTick", updated_tick))
	var latest_result_label := str(latest_result.get("heroName", latest_result.get("heroId", "暂无结果"))).strip_edges()
	if latest_result_label == "":
		latest_result_label = "暂无结果"
	var selected_pool_label := _pool_label(selected_pool_id)
	var prospect_count := prospect_hero_ids.size()
	var latest_deployment_summary := _format_deployment_summary(latest_deployment)
	var home_tile_label := home_tile_id if home_tile_id != "" else "未定位"
	var latest_unit_label := str(latest_deployment.get("unitId", "")).strip_edges()
	if latest_unit_label == "":
		latest_unit_label = "未编组"
	var latest_role_label := str(latest_deployment.get("role", "reserve")).strip_edges()
	if latest_role_label == "":
		latest_role_label = "reserve"
	var latest_tick_label := str(latest_updated_tick) if latest_updated_tick >= 0 else str(updated_tick) if updated_tick >= 0 else "未记录"
	var online_summary := "%s/%s" % [str(int(runtime_context.get("online_seat_count", 0))), str(int(runtime_context.get("seat_count", 0)))]
	var runtime_receipt_lines := _build_runtime_receipt_lines(runtime_context)
	var recruit_preview := _build_recruit_preview_payload(selected_pool_id)
	var preview_single_cards := recruit_preview.get("single_cards", []) as Array
	var preview_five_cards := recruit_preview.get("five_cards", []) as Array
	var class_summary_cards := recruit_preview.get("class_summary_cards", []) as Array
	var boundary_cards := recruit_preview.get("boundary_cards", []) as Array
	var guide_cards := recruit_preview.get("guide_cards", []) as Array
	var probability_group_cards := recruit_preview.get("probability_group_cards", []) as Array
	var probability_cards := recruit_preview.get("probability_cards", []) as Array
	return {
		"title": "招募",
		"subtitle": "卡池 / 单招 / 五连 / 结果 / 说明",
		"empty_state_text": "招募域正在等待运行时快照。",
		"shared_state": {
			"selected_pool_id": selected_pool_id,
			"selected_pool_label": selected_pool_label,
			"available_draw_count": available_draw_count,
			"development_points": development_points,
			"acquisition_threshold": acquisition_threshold,
			"prospect_count": prospect_count,
			"latest_hero_id": latest_hero_id,
			"latest_result_label": latest_result_label,
			"latest_result": latest_result.duplicate(true),
			"latest_deployment": latest_deployment.duplicate(true),
			"latest_deployment_summary": latest_deployment_summary,
			"latest_unit_label": latest_unit_label,
			"latest_role_label": latest_role_label,
			"home_tile_id": home_tile_id,
			"home_tile_label": home_tile_label,
			"online_summary": online_summary,
			"last_draw_mode": last_draw_mode,
			"last_result_count": last_results.size(),
			"latest_tick_label": latest_tick_label,
			"runtime_receipt_summary": runtime_receipt_lines[0],
			"runtime_receipt_tick": runtime_receipt_lines[1],
			"runtime_receipt_lines": runtime_receipt_lines.duplicate(),
			"preview_pool_rule": str(recruit_preview.get("pool_rule", "")),
			"preview_single_label": str(recruit_preview.get("single_label", "")),
			"preview_five_summary": str(recruit_preview.get("five_summary", "")),
			"preview_class_summary": str(recruit_preview.get("class_summary", "")),
			"preview_mix_summary": str(recruit_preview.get("mix_summary", "")),
			"preview_boundary_summary": str(recruit_preview.get("boundary_summary", "")),
			"preview_probability_group_summary": str(recruit_preview.get("probability_group_summary", "")),
			"preview_probability_summary": str(recruit_preview.get("probability_summary", "")),
			"preview_probability_detail_location": "结果页",
		},
		"default_page_id": "pool",
		"tabs": [
			{"id": "pool", "label": "卡池"},
			{"id": "single", "label": "单招"},
			{"id": "multi", "label": "五连"},
			{"id": "result", "label": "结果"},
			{"id": "guide", "label": "说明"},
		],
		"sections": {
			"pool": {
				"summary_title": "卡池总览",
				"shared_state_title": "当前共享状态",
				"shared_state_fields": [
					{"key": "selected_pool_id", "label": "卡池"},
					{"key": "available_draw_count", "label": "可抽次数"},
					{"key": "home_tile_id", "label": "锚点"},
				],
				"summary_lines": [
					"招募域已切到真实动作链，当前主线是 world action recruitProspectHero。",
					"当前选中卡池：%s。" % selected_pool_label,
				],
				"list_title": "卡池列表",
				"item_cards": _build_item_cards_from_items([
					{"label": "常驻卡池", "meta": "pool_standard", "status": _selected_status(selected_pool_id, "pool_standard"), "description": "用于当前最小真实招募链。"},
					{"label": "赛季卡池", "meta": "pool_season", "status": _selected_status(selected_pool_id, "pool_season"), "description": "保留赛季池位置。"},
					{"label": "限时卡池", "meta": "pool_limited", "status": _selected_status(selected_pool_id, "pool_limited"), "description": "保留限时池位置。"},
				]),
				"detail_title": "卡池情报",
				"content_blocks": [
					_build_card_grid_block("当前状态", _merge_card_sets([
						{"title": "当前卡池", "value_key": "selected_pool_label", "meta_key": "selected_pool_id", "description": "当前默认招募入口。", "tone": "gold"},
						{"title": "可抽次数", "value_key": "available_draw_count", "meta": "development 驱动", "description": "按当前 development/acquisition 估算。", "tone": "green"},
						{"title": "待招募", "value_key": "prospect_count", "meta": "prospect 队列", "description": "等待写回 roster / reserve。", "tone": "blue"},
					], [
						{"title": "发展点", "value_key": "development_points", "meta": "当前 developmentPoints", "description": "阈值 %s。" % str(acquisition_threshold), "tone": "gold"},
						{"title": "部署锚点", "value_key": "home_tile_label", "meta": "主城 / 世界主壳", "description": "在线席位 %s。" % online_summary, "tone": "blue"},
					]), "RecruitPoolStateCardBlock"),
					_build_text_block("卡池情报", [
						"正式消耗：developmentPoints %s / 阈值 %s / 预计可抽 %s 次。" % [str(development_points), str(acquisition_threshold), str(available_draw_count)],
						"待招募武将数：%s / 招募冷却：%s。" % [str(prospect_hero_ids.size()), str(cooldown)],
						"当前 roster 武将数：%s" % str(roster_ids.size()),
						"部署锚点：%s" % (home_tile_id if home_tile_id != "" else "未定位"),
						"在线席位：%s" % online_summary,
					], "RecruitPoolDetailBlock"),
					_build_card_grid_block("招募池只读预览", _build_recruit_pool_preview_cards(recruit_preview), "RecruitMixedPoolPreviewBlock", 2),
					_build_card_grid_block("卡类摘要", class_summary_cards, "RecruitCardClassSummaryBlock", 2),
					_build_card_grid_block("预览边界", boundary_cards, "RecruitPreviewBoundaryBlock", 3),
					_build_text_block("预览口径", [
						str(recruit_preview.get("pool_rule", "")),
						"单招 / 五连只是前端只读样例，不写 roster / reserve / 战法库存。",
						str(recruit_preview.get("class_summary", "")),
						str(recruit_preview.get("boundary_summary", "")),
						str(recruit_preview.get("probability_group_summary", "")),
						str(recruit_preview.get("depletion_note", "")),
						"完整概率明细保留在结果页，卡池页只展示摘要。",
						str(recruit_preview.get("guarantee_note", "")),
					], "RecruitPoolPreviewRuleBlock"),
					_build_card_grid_block("概率分组", probability_group_cards, "RecruitProbabilityGroupBlock", 3),
					_build_button_row_block("动作", [
						{"id": "pool_standard", "label": "常驻池", "disabled": selected_pool_id == "pool_standard"},
						{"id": "pool_season", "label": "赛季池", "disabled": selected_pool_id == "pool_season"},
						{"id": "pool_limited", "label": "限时池", "disabled": selected_pool_id == "pool_limited"},
					], "RecruitPoolActionBlock"),
				],
			},
			"single": {
				"summary_title": "单招",
				"shared_state_title": "当前共享状态",
				"shared_state_fields": [
					{"key": "selected_pool_id", "label": "卡池"},
					{"key": "available_draw_count", "label": "可抽次数"},
					{"key": "preview_single_label", "label": "预览结果"},
				],
				"summary_lines": [
					"单招只读预览展示 1 格结果，可能是武将卡，也可能是战法卡。",
					"当前预览不消耗 developmentPoints，不写回库存或 roster。",
				],
				"list_title": "单招预览",
				"item_cards": _build_item_cards_from_items([
					{"label": "当前卡池", "meta": _pool_label(selected_pool_id), "status": "development %s" % str(development_points), "description": "单抽直接复用当前卡池选择。"},
					{"label": "最近模式", "meta": last_draw_mode, "status": "阈值 %s" % str(acquisition_threshold), "description": "最近一次抽卡模式回写到共享状态。"},
				]),
				"detail_title": "单招说明",
				"content_blocks": [
					_build_card_grid_block("当前状态", _merge_card_sets([
						{"title": "当前卡池", "value_key": "selected_pool_label", "meta_key": "selected_pool_id", "description": "单抽直接复用当前卡池。", "tone": "gold"},
						{"title": "可抽次数", "value_key": "available_draw_count", "meta": "单抽 readiness", "description": "不足时会保留按钮禁用态。", "tone": "green"},
						{"title": "最新结果", "value_key": "latest_result_label", "meta_key": "latest_hero_id", "description": "最新招募结果会先写回 shared_state。", "tone": "blue"},
					], [
						{"title": "最近模式", "value_key": "last_draw_mode", "meta": "draw mode", "description_key": "runtime_receipt_summary", "tone": "neutral"},
						{"title": "编组状态", "value_key": "latest_deployment_summary", "meta_key": "latest_unit_label", "description": "角色 %s。" % latest_role_label, "tone": "blue"},
					]), "RecruitSingleStateCardBlock"),
					_build_card_grid_block("单招只读结果", preview_single_cards, "RecruitSinglePreviewResultBlock", 1),
					_build_text_block("单招说明", [
						"当前 development/acquisition 逻辑由后端 world action 驱动。",
						"单抽 readiness：%s" % ("可执行" if available_draw_count >= 1 else "developmentPoints 不足"),
						"只读预览：%s" % str(recruit_preview.get("single_label", "")),
						"概率草案：%s" % str(recruit_preview.get("probability_summary", "")),
						str(recruit_preview.get("single_draw_preview_note", "")),
						"当前回执：%s" % runtime_receipt_lines[0],
					], "RecruitSingleDetailBlock"),
					_build_button_row_block("动作", [
						{"id": "draw_single", "label": "单招一次", "disabled": available_draw_count < 1},
					], "RecruitSingleActionBlock"),
				],
			},
			"multi": {
				"summary_title": "五连",
				"shared_state_title": "当前共享状态",
				"shared_state_fields": [
					{"key": "selected_pool_id", "label": "卡池"},
					{"key": "available_draw_count", "label": "可抽次数"},
					{"key": "preview_five_summary", "label": "五连预览"},
				],
				"summary_lines": [
					"五连只读预览固定展示 5 格结果，混合武将卡和战法卡。",
					"当前预览不消耗 developmentPoints，不写回库存或 roster。",
				],
				"list_title": "五连状态",
				"item_cards": _build_item_cards_from_items([
					{"label": "当前卡池", "meta": _pool_label(selected_pool_id), "status": "最近模式 %s" % last_draw_mode, "description": "当前多抽以最小批量招募链落地。"},
					{"label": "当前 roster", "meta": "武将 %s" % str(roster_ids.size()), "status": "可抽 %s" % str(available_draw_count), "description": "结果会回写到 roster / reserve / 招募结果。"},
				]),
				"detail_title": "五连说明",
				"content_blocks": [
					_build_card_grid_block("当前状态", _merge_card_sets([
						{"title": "当前卡池", "value_key": "selected_pool_label", "meta_key": "selected_pool_id", "description": "多抽沿用同一张卡池选择。", "tone": "gold"},
						{"title": "可抽次数", "value_key": "available_draw_count", "meta": "批量招募", "description": "当前最小批量会按可用次数落地。", "tone": "green"},
						{"title": "最近结果", "value_key": "latest_result_label", "meta_key": "latest_hero_id", "description": "结果页会继续承接最近一次多抽。", "tone": "blue"},
					], [
						{"title": "结果数", "value_key": "last_result_count", "meta": "最近结果批次", "description_key": "runtime_receipt_summary", "tone": "neutral"},
						{"title": "编组状态", "value_key": "latest_deployment_summary", "meta_key": "latest_unit_label", "description": "角色 %s。" % latest_role_label, "tone": "blue"},
					]), "RecruitMultiStateCardBlock"),
					_build_card_grid_block("五连只读结果", preview_five_cards, "RecruitFivePreviewResultBlock", 3),
					_build_card_grid_block("卡类摘要", class_summary_cards, "RecruitFiveCardClassSummaryBlock", 2),
					_build_text_block("五连说明", [
						"当前五连先做只读混合预览，不先做复杂保底规则。",
						"五连 readiness：%s" % ("可执行五连" if available_draw_count >= 5 else "正式动作仍按当前后端可用次数约束"),
						"只读预览：%s" % str(recruit_preview.get("five_summary", "")),
						str(recruit_preview.get("class_summary", "")),
						str(recruit_preview.get("five_draw_preview_rule", "")),
						str(recruit_preview.get("five_draw_probability_note", "")),
						str(recruit_preview.get("depletion_note", "")),
						str(recruit_preview.get("guarantee_note", "")),
						"当前回执：%s" % runtime_receipt_lines[0],
					], "RecruitMultiDetailBlock"),
					_build_button_row_block("动作", [
						{"id": "draw_multi", "label": "五连一次", "disabled": available_draw_count < 1},
					], "RecruitMultiActionBlock"),
				],
			},
			"result": {
				"summary_title": "最近结果",
				"shared_state_title": "当前共享状态",
				"shared_state_fields": [
					{"key": "latest_hero_id", "label": "最新武将"},
					{"key": "latest_result_label", "label": "结果"},
					{"key": "home_tile_id", "label": "锚点"},
				],
				"summary_lines": [
					"结果页直接读取 recruitStateByFaction.lastResults。",
					"最新武将会先落 roster / reserve，直接编组成功后会跳到对应部队。",
					"只读预览额外展示武将卡与战法卡混合池，不代表已经落库。",
				],
				"list_title": "最近结果",
				"item_cards": _build_item_cards_from_items(_build_recent_result_items(last_results, roster_ids)),
				"detail_title": "结果摘要",
				"content_blocks": [
					_build_card_grid_block("当前状态", _merge_card_sets([
						{"title": "最新结果", "value_key": "latest_result_label", "meta_key": "latest_hero_id", "description": "结果页直接读 recruitStateByFaction.lastResults。", "tone": "gold"},
						{"title": "编组状态", "value_key": "latest_deployment_summary", "meta_key": "latest_unit_label", "description": "角色 %s。" % latest_role_label, "tone": "blue"},
						{"title": "部署锚点", "value_key": "home_tile_label", "meta": "主城 / 世界主壳", "description": "直接编组默认回到该锚点。", "tone": "green"},
					], [
						{"title": "最近模式", "value_key": "last_draw_mode", "meta": "draw mode", "description": "结果数 %s。" % str(last_results.size()), "tone": "neutral"},
						{"title": "最近 tick", "value_key": "latest_tick_label", "meta_key": "runtime_receipt_tick", "description_key": "runtime_receipt_summary", "tone": "neutral"},
					]), "RecruitResultStateCardBlock"),
					_build_text_block("结果摘要", [
						"最近模式：%s" % last_draw_mode,
						"最近结果数：%s" % str(last_results.size()),
						"最新武将：%s" % latest_result_label,
						"最新状态：%s" % _format_deployment_summary(latest_deployment),
						"最新结果 tick：%s" % (str(latest_updated_tick) if latest_updated_tick >= 0 else str(updated_tick) if updated_tick >= 0 else "未记录"),
						runtime_receipt_lines[0],
						runtime_receipt_lines[1],
					], "RecruitResultDetailBlock"),
					_build_card_grid_block("混合池只读预览", preview_five_cards, "RecruitResultMixedPreviewBlock", 3),
					_build_card_grid_block("卡类摘要", class_summary_cards, "RecruitResultCardClassSummaryBlock", 2),
					_build_card_grid_block("概率草案", probability_cards, "RecruitResultProbabilityPreviewBlock", 3),
					_build_button_row_block("动作", [
						{"id": "focus_latest_hero", "label": "查看最新武将", "disabled": latest_hero_id == ""},
						{"id": "deploy_latest_hero", "label": "直接编组", "disabled": latest_hero_id == "" or home_tile_id == "" or bool(latest_deployment.get("deployed", false))},
						{"id": "draw_single", "label": "再单招", "disabled": available_draw_count < 1},
						{"id": "draw_multi", "label": "再五连", "disabled": available_draw_count < 1},
					], "RecruitResultActionBlock"),
					_build_text_block("补充", [
						"当前卡池：%s / developmentPoints %s / 阈值 %s。" % [_pool_label(selected_pool_id), str(development_points), str(acquisition_threshold)],
						"直接编组会复用 homeTile 作为部署锚点；若成功，会打开对应部队而不是停留在说明层。",
					], "RecruitResultFooterBlock"),
				],
			},
			"guide": {
				"summary_title": "卡池说明",
				"shared_state_title": "当前共享状态",
				"shared_state_fields": [
					{"key": "selected_pool_id", "label": "卡池"},
					{"key": "preview_probability_detail_location", "label": "概率明细"},
					{"key": "preview_boundary_summary", "label": "边界"},
				],
				"summary_lines": [
					"说明页只汇总招募预览口径，不发起抽卡，不写库存。",
					"当前所有通用战法来源仍为招募，完整概率明细保留在结果页。",
				],
				"list_title": "说明目录",
				"item_cards": _build_item_cards_from_items([
					{"label": "同池", "meta": "武将卡 + 战法卡", "status": "只读", "description": "单招和五连都读取同一批预览数据。"},
					{"label": "概率", "meta": "摘要 + 明细", "status": "预览", "description": "卡池页看摘要，结果页看完整草案。"},
					{"label": "边界", "meta": "不落库", "status": "preview_only", "description": "不写 roster / reserve / 战法库存。"},
				]),
				"detail_title": "只读说明",
				"content_blocks": [
					_build_card_grid_block("说明摘要", guide_cards, "RecruitGuideSummaryBlock", 2),
					_build_card_grid_block("预览边界", boundary_cards, "RecruitGuideBoundaryBlock", 3),
					_build_card_grid_block("概率分组", probability_group_cards, "RecruitGuideProbabilityGroupBlock", 3),
					_build_text_block("说明正文", [
						str(recruit_preview.get("pool_rule", "")),
						str(recruit_preview.get("class_summary", "")),
						str(recruit_preview.get("boundary_summary", "")),
						str(recruit_preview.get("probability_group_summary", "")),
						str(recruit_preview.get("depletion_note", "")),
						"完整概率明细：%s。" % str(recruit_preview.get("probability_summary", "")),
					], "RecruitGuideTextBlock"),
				],
			},
		},
	}

func _build_recruit_preview_payload(selected_pool_id: String) -> Dictionary:
	var hero_profiles := _read_profile_preview_hero_profiles()
	var library := _read_equippable_skill_library()
	var skills := _dictionary_array(library.get("skills", []))
	var probability_preview: Dictionary = library.get("recruit_probability_preview", {}) as Dictionary
	var hero_offsets := {
		"pool_season": 8,
		"pool_limited": 16,
	}
	var skill_offsets := {
		"pool_season": 12,
		"pool_limited": 24,
	}
	var hero_offset := int(hero_offsets.get(selected_pool_id, 0))
	var skill_offset := int(skill_offsets.get(selected_pool_id, 0))
	var single_cards: Array = []
	var single_skill := _preview_skill_at(skills, skill_offset + 2)
	if not single_skill.is_empty():
		single_cards.append(_build_preview_skill_card(single_skill, 1))
	var five_cards: Array = []
	var pattern := ["skill", "skill", "hero", "skill", "skill"]
	for index in range(pattern.size()):
		var kind := str(pattern[index])
		if kind == "hero":
			var hero := _preview_hero_at(hero_profiles, hero_offset + index)
			if not hero.is_empty():
				five_cards.append(_build_preview_hero_card(hero, index + 1))
		else:
			var skill := _preview_skill_at(skills, skill_offset + index)
			if not skill.is_empty():
				five_cards.append(_build_preview_skill_card(skill, index + 1))
	if five_cards.is_empty() and not single_cards.is_empty():
		five_cards = single_cards.duplicate(true)
	return {
		"single_cards": single_cards,
		"five_cards": five_cards,
		"single_label": _preview_cards_summary(single_cards),
		"five_summary": _preview_cards_summary(five_cards),
		"class_summary": _preview_class_summary(five_cards),
		"class_summary_cards": _build_recruit_class_summary_cards(five_cards),
		"mix_summary": _preview_mix_summary(hero_profiles, skills),
		"pool_rule": _recruit_preview_pool_rule(library),
		"boundary_summary": _recruit_boundary_summary(probability_preview),
		"boundary_cards": _build_recruit_boundary_cards(probability_preview),
		"depletion_note": _recruit_depletion_note(probability_preview),
		"guide_cards": _build_recruit_guide_cards(
			_recruit_preview_pool_rule(library),
			_preview_cards_summary(single_cards),
			_preview_cards_summary(five_cards),
			_preview_class_summary(five_cards),
			probability_preview
		),
		"probability_group_summary": _recruit_probability_group_summary(probability_preview),
		"probability_group_cards": _build_recruit_probability_group_cards(probability_preview),
		"probability_summary": _recruit_probability_summary(probability_preview),
		"probability_cards": _build_recruit_probability_cards(probability_preview),
		"five_draw_preview_rule": str(probability_preview.get("five_draw_preview_rule", "")),
		"single_draw_preview_note": str(probability_preview.get("single_draw_preview_note", "")),
		"five_draw_probability_note": str(probability_preview.get("five_draw_probability_note", "")),
		"guarantee_note": _recruit_guarantee_note(probability_preview),
	}

func _build_recruit_pool_preview_cards(recruit_preview: Dictionary) -> Array:
	return [
		{
			"title": "同池入口",
			"value": "武将 + 战法",
			"meta": "单招 / 五连",
			"description": str(recruit_preview.get("pool_rule", "")),
			"footer": "只读预览，不写库存，不改 roster。",
			"tone": "gold",
		},
		{
			"title": "五连样例",
			"value": str(recruit_preview.get("five_summary", "")),
			"meta": "战法权重更高",
			"description": "用于验证招募页能同时展示武将卡与战法卡。",
			"footer": "正式概率表后续由招募系统统一维护。",
			"tone": "blue",
		},
	]

func _build_recruit_class_summary_cards(cards: Array) -> Array:
	var hero_names := _preview_class_names(cards, "hero")
	var skill_names := _preview_class_names(cards, "skill")
	return [
		{
			"title": "武将卡",
			"value": "%s 张" % str(hero_names.size()),
			"meta": "hero card",
			"description": "样例：%s" % (_join_preview_names(hero_names) if not hero_names.is_empty() else "本次样例未展示"),
			"footer": "武将主战法仍随武将存在，不进入通用战法库。",
			"tone": "gold",
		},
		{
			"title": "战法卡",
			"value": "%s 张" % str(skill_names.size()),
			"meta": "skill card",
			"description": "样例：%s" % (_join_preview_names(skill_names) if not skill_names.is_empty() else "本次样例未展示"),
			"footer": "战法卡进入玩家可装配通用战法库。",
			"tone": "blue",
		},
	]

func _build_recruit_guide_cards(pool_rule: String, single_label: String, five_summary: String, class_summary: String, probability_preview: Dictionary) -> Array:
	var draw_modes := " / ".join(_string_array(probability_preview.get("draw_modes", [])))
	if draw_modes == "":
		draw_modes = "单招 / 五连"
	return [
		{
			"title": "同池入口",
			"value": "武将 + 战法",
			"meta": draw_modes,
			"description": pool_rule,
			"footer": "通用战法来源保持招募。",
			"tone": "gold",
		},
		{
			"title": "单招样例",
			"value": single_label,
			"meta": "1 格只读结果",
			"description": str(probability_preview.get("single_draw_preview_note", "")),
			"footer": "不消耗，不落库。",
			"tone": "blue",
		},
		{
			"title": "五连样例",
			"value": five_summary,
			"meta": "5 格混合结果",
			"description": class_summary,
			"footer": str(probability_preview.get("five_draw_probability_note", "")),
			"tone": "green",
		},
		{
			"title": "抽空规则",
			"value": "战法不重复",
			"meta": "preview only",
			"description": _recruit_depletion_note(probability_preview),
			"footer": "当前不写库存，只记录未来真实链路口径。",
			"tone": "gold",
		},
		{
			"title": "概率明细",
			"value": "结果页",
			"meta": "preview only",
			"description": str(probability_preview.get("probability_note", "")),
			"footer": "卡池页只展示摘要，完整明细在结果页。",
			"tone": "neutral",
		},
	]

func _build_recruit_boundary_cards(probability_preview: Dictionary) -> Array:
	var notes: Array[String] = []
	var raw_notes: Variant = probability_preview.get("display_notes", [])
	if raw_notes is Array:
		for note_variant in raw_notes as Array:
			var note := str(note_variant).strip_edges()
			if note != "":
				notes.append(note)
	if notes.is_empty():
		notes = [
			"概率表只用于 Godot 原生 UI 预览",
			"不代表最终线上概率，不进入服务端合同",
			"不写入 roster/reserve/战法库存",
		]
	var titles := ["只读预览", "概率边界", "库存边界"]
	var metas := ["preview only", "not final", "no inventory write"]
	var tones := ["gold", "blue", "neutral"]
	var cards: Array = []
	for index in range(notes.size()):
		cards.append({
			"title": str(titles[index]) if index < titles.size() else "边界说明",
			"value": "已声明",
			"meta": str(metas[index]) if index < metas.size() else "preview",
			"description": notes[index],
			"footer": "招募页只读展示，不触发真实获得。",
			"tone": str(tones[index]) if index < tones.size() else "neutral",
		})
	return cards

func _build_recruit_probability_group_cards(probability_preview: Dictionary) -> Array:
	var cards: Array = []
	var item_weights := _dictionary_array(probability_preview.get("item_type_weights", []))
	var rarity_weights := _dictionary_array(probability_preview.get("rarity_weights", []))
	var item_summary := _weight_label_summary(item_weights)
	var s_parts: Array[String] = []
	var other_parts: Array[String] = []
	for rarity_variant in rarity_weights:
		var rarity := rarity_variant as Dictionary
		var rarity_id := str(rarity.get("id", ""))
		var part := "%s %s%%" % [str(rarity.get("label", "")), str(rarity.get("weight", 0))]
		if rarity_id == "hero_s" or rarity_id == "skill_s":
			s_parts.append(part)
		else:
			other_parts.append(part)
	var guarantee: Dictionary = probability_preview.get("guarantee_preview", {}) as Dictionary
	cards.append({
		"title": "卡类权重",
		"value": item_summary if item_summary != "" else "待填写",
		"meta": str(probability_preview.get("pool_name", "招募预览池")),
		"description": "战法卡整体高于武将卡，降低前期装配门槛。",
		"footer": "只读预览，不做真实随机。",
		"tone": "gold",
	})
	cards.append({
		"title": "稀有度权重",
		"value": " / ".join(s_parts) if not s_parts.is_empty() else "S 权重待填写",
		"meta": "细分概率",
		"description": "其余：%s" % (" / ".join(other_parts) if not other_parts.is_empty() else "待填写"),
		"footer": str(probability_preview.get("probability_note", "")),
		"tone": "green",
	})
	cards.append({
		"title": "保底状态",
		"value": str(guarantee.get("label", "保底未启用")),
		"meta": "preview only",
		"description": str(guarantee.get("note", "第一版不接保底状态。")),
		"footer": "不写保底计数，不接真实招募库存链。",
		"tone": "neutral",
	})
	return cards

func _build_recruit_probability_cards(probability_preview: Dictionary) -> Array:
	var cards: Array = []
	for weight_variant in _dictionary_array(probability_preview.get("item_type_weights", [])):
		var weight := weight_variant as Dictionary
		cards.append({
			"title": "类型权重",
			"value": "%s %s%%" % [str(weight.get("label", "")), str(weight.get("weight", 0))],
			"meta": str(probability_preview.get("pool_name", "招募预览池")),
			"description": "preview_only=%s / no_inventory_write=%s" % [str(bool(probability_preview.get("preview_only", false))), str(bool(probability_preview.get("no_inventory_write", false)))],
			"footer": "只做前端概率预览，不做真实随机。",
			"tone": "gold" if str(weight.get("id", "")) == "skill_card" else "blue",
		})
	for rarity_variant in _dictionary_array(probability_preview.get("rarity_weights", [])):
		var rarity := rarity_variant as Dictionary
		cards.append({
			"title": "稀有度权重",
			"value": "%s %s%%" % [str(rarity.get("label", "")), str(rarity.get("weight", 0))],
			"meta": str(rarity.get("card_class", "")),
			"description": str(probability_preview.get("probability_note", "")),
			"footer": str(probability_preview.get("pity_preview_note", "")),
			"tone": "gold" if str(rarity.get("id", "")).find("_s") >= 0 else "green",
		})
	var guarantee: Dictionary = probability_preview.get("guarantee_preview", {}) as Dictionary
	if not guarantee.is_empty():
		cards.append({
			"title": "保底状态",
			"value": str(guarantee.get("label", "保底未启用")),
			"meta": "preview only",
			"description": str(guarantee.get("note", "")),
			"footer": "不写保底计数，不接真实招募库存链。",
			"tone": "neutral",
		})
	if cards.is_empty():
		cards.append({
			"title": "概率草案",
			"value": "待填写",
			"meta": "preview only",
			"description": "当前还没有 recruit_probability_preview 数据。",
			"tone": "neutral",
		})
	return cards

func _recruit_boundary_summary(probability_preview: Dictionary) -> String:
	var notes: Array[String] = []
	var raw_notes: Variant = probability_preview.get("display_notes", [])
	if raw_notes is Array:
		for note_variant in raw_notes as Array:
			var note := str(note_variant).strip_edges()
			if note != "":
				notes.append(note)
	if notes.is_empty():
		return "预览边界：只读、不消耗、不落库。"
	return "预览边界：%s。" % " / ".join(notes)

func _recruit_depletion_note(probability_preview: Dictionary) -> String:
	var depletion: Dictionary = probability_preview.get("pool_depletion_preview", {}) as Dictionary
	if depletion.is_empty():
		return "抽空规则：战法卡抽出后从可抽池移除；抽空后武将卡概率自然上升。"
	return "抽空规则：%s" % str(depletion.get("depletion_rule", "战法卡抽出后从可抽池移除。"))

func _recruit_probability_group_summary(probability_preview: Dictionary) -> String:
	var item_summary := _weight_label_summary(_dictionary_array(probability_preview.get("item_type_weights", [])))
	var guarantee: Dictionary = probability_preview.get("guarantee_preview", {}) as Dictionary
	var guarantee_label := str(guarantee.get("label", "保底未启用"))
	if item_summary == "":
		return "概率分组待填写；当前仍只做混合池展示。"
	return "概率分组：%s；%s。" % [item_summary, guarantee_label]

func _recruit_probability_summary(probability_preview: Dictionary) -> String:
	var item_parts: Array[String] = []
	for weight_variant in _dictionary_array(probability_preview.get("item_type_weights", [])):
		var weight := weight_variant as Dictionary
		item_parts.append("%s%s%%" % [str(weight.get("label", "")), str(weight.get("weight", 0))])
	var rarity_parts: Array[String] = []
	for rarity_variant in _dictionary_array(probability_preview.get("rarity_weights", [])):
		var rarity := rarity_variant as Dictionary
		rarity_parts.append("%s%s%%" % [str(rarity.get("label", "")), str(rarity.get("weight", 0))])
	if item_parts.is_empty() and rarity_parts.is_empty():
		return "概率草案待填写；当前仍只做混合池展示。"
	return "类型：%s；细分：%s。" % [" / ".join(item_parts), " / ".join(rarity_parts)]

func _weight_label_summary(weights: Array) -> String:
	var parts: Array[String] = []
	for weight_variant in weights:
		var weight := weight_variant as Dictionary
		parts.append("%s %s%%" % [str(weight.get("label", "")), str(weight.get("weight", 0))])
	return " / ".join(parts)

func _recruit_guarantee_note(probability_preview: Dictionary) -> String:
	var guarantee: Dictionary = probability_preview.get("guarantee_preview", {}) as Dictionary
	if guarantee.is_empty():
		return "保底暂不落库。"
	return "%s：%s" % [str(guarantee.get("label", "保底未启用")), str(guarantee.get("note", ""))]

func _read_profile_preview_hero_profiles() -> Dictionary:
	var root := _read_json_dictionary(PROFILE_PREVIEW_DATA_PATH)
	var raw_profiles: Variant = root.get("hero_profiles", {})
	return raw_profiles as Dictionary if raw_profiles is Dictionary else {}

func _read_equippable_skill_library() -> Dictionary:
	return _read_json_dictionary(EQUIPPABLE_SKILL_LIBRARY_DATA_PATH)

func _read_json_dictionary(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	return parsed as Dictionary if parsed is Dictionary else {}

func _preview_hero_at(hero_profiles: Dictionary, offset: int) -> Dictionary:
	if hero_profiles.is_empty():
		return {}
	var ids: Array = []
	for key in hero_profiles.keys():
		ids.append(str(key))
	ids.sort()
	var index := posmod(offset, ids.size())
	var hero_id := str(ids[index])
	var raw_profile: Variant = hero_profiles.get(hero_id, {})
	if not (raw_profile is Dictionary):
		return {}
	var profile := (raw_profile as Dictionary).duplicate(true)
	profile["id"] = hero_id
	return profile

func _preview_skill_at(skills: Array, offset: int) -> Dictionary:
	if skills.is_empty():
		return {}
	var index := posmod(offset, skills.size())
	var raw_skill: Variant = skills[index]
	return (raw_skill as Dictionary).duplicate(true) if raw_skill is Dictionary else {}

func _build_preview_hero_card(hero: Dictionary, draw_index: int) -> Dictionary:
	var hero_name := str(hero.get("name", hero.get("id", "武将"))).strip_edges()
	var faction := str(hero.get("faction", "阵营")).strip_edges()
	var troop_label := _troop_type_label(str(hero.get("troop_type", "")))
	var quality := str(hero.get("quality", "%s星" % str(hero.get("stars", 5)))).strip_edges()
	var skills := _dictionary_array(hero.get("skills", []))
	var skill_name := str(hero.get("skill_name", "主战法")).strip_edges()
	if not skills.is_empty():
		skill_name = str((skills[0] as Dictionary).get("name", skill_name)).strip_edges()
	return {
		"title": "第%s抽 · 武将卡" % str(draw_index),
		"value": "%s · %s" % [quality, hero_name],
		"meta": "%s / %s / %s" % [faction, troop_label, str(hero.get("id", ""))],
		"description": "主战法：%s；抽到后进入武将 roster/reserve 口径。" % skill_name,
		"footer": "武将主战法随武将存在，不进入通用可装配战法库。",
		"tone": "gold",
		"preview_kind": "hero",
	}

func _build_preview_skill_card(skill: Dictionary, draw_index: int) -> Dictionary:
	var grade := str(skill.get("grade", "B")).strip_edges()
	var name := str(skill.get("name", "战法")).strip_edges()
	var skill_type := str(skill.get("type", "主动")).strip_edges()
	var source := skill.get("source", {}) as Dictionary
	var source_pool := str(source.get("pool", "招募")).strip_edges()
	var tags := _string_array(skill.get("tags", []))
	var troops := _string_array(skill.get("compatible_troops", []))
	var tag_line := " / ".join(tags.slice(0, min(tags.size(), 3)))
	var troop_line := " / ".join(troops.slice(0, min(troops.size(), 3)))
	return {
		"title": "第%s抽 · 战法卡" % str(draw_index),
		"value": "%s · %s" % [grade, name],
		"meta": "%s / %s / %s" % [skill_type, source_pool, troop_line],
		"description": "%s；标签 %s。" % [str(skill.get("combat_role", "通用战法")), tag_line],
		"footer": "抽到后进入玩家可装配通用战法库，不写入武将主战法槽。",
		"tone": _preview_skill_tone(grade),
		"preview_kind": "skill",
	}

func _preview_skill_tone(grade: String) -> String:
	match grade:
		"S":
			return "gold"
		"A":
			return "blue"
		_:
			return "green"

func _preview_cards_summary(cards: Array) -> String:
	var hero_count := 0
	var skill_count := 0
	for card_variant in cards:
		if not (card_variant is Dictionary):
			continue
		var kind := str((card_variant as Dictionary).get("preview_kind", "")).strip_edges()
		if kind == "hero":
			hero_count += 1
		elif kind == "skill":
			skill_count += 1
	if hero_count == 0 and skill_count == 0:
		return "暂无预览"
	if cards.size() == 1:
		var first := cards[0] as Dictionary
		return str(first.get("value", "1张预览"))
	return "武将卡%s / 战法卡%s / 共%s" % [str(hero_count), str(skill_count), str(cards.size())]

func _preview_class_summary(cards: Array) -> String:
	var hero_names := _preview_class_names(cards, "hero")
	var skill_names := _preview_class_names(cards, "skill")
	return "武将卡%s：%s；战法卡%s：%s。" % [
		str(hero_names.size()),
		_join_preview_names(hero_names) if not hero_names.is_empty() else "暂无",
		str(skill_names.size()),
		_join_preview_names(skill_names) if not skill_names.is_empty() else "暂无",
	]

func _preview_class_names(cards: Array, target_kind: String) -> Array[String]:
	var names: Array[String] = []
	for card_variant in cards:
		if not (card_variant is Dictionary):
			continue
		var card := card_variant as Dictionary
		if str(card.get("preview_kind", "")).strip_edges() != target_kind:
			continue
		var value := str(card.get("value", "")).strip_edges()
		if value != "":
			names.append(value)
	return names

func _join_preview_names(names: Array[String]) -> String:
	var shown := names.slice(0, min(names.size(), 3))
	var text := " / ".join(shown)
	if names.size() > shown.size():
		text += " 等"
	return text

func _preview_mix_summary(hero_profiles: Dictionary, skills: Array) -> String:
	return "武将%s / 战法%s / 同池招募" % [str(hero_profiles.size()), str(skills.size())]

func _recruit_preview_pool_rule(library: Dictionary) -> String:
	var model: Dictionary = library.get("acquisition_model", {}) as Dictionary
	var rule := str(model.get("pool_rule", "")).strip_edges()
	if rule != "":
		return rule
	return "通用战法与武将同池产出；单招和五连都可能获得战法卡或武将卡。"

func _dictionary_array(raw_value: Variant) -> Array:
	var result: Array = []
	if not (raw_value is Array):
		return result
	for item in raw_value as Array:
		if item is Dictionary:
			result.append(item as Dictionary)
	return result

func _string_array(raw_value: Variant) -> Array:
	var result: Array = []
	if not (raw_value is Array):
		return result
	for item in raw_value as Array:
		var text := str(item).strip_edges()
		if text != "":
			result.append(text)
	return result

func _troop_type_label(troop_type: String) -> String:
	match troop_type:
		"cavalry":
			return "骑兵"
		"infantry":
			return "步兵"
		"archer":
			return "弓兵"
		_:
			return troop_type if troop_type.strip_edges() != "" else "未定兵种"

func build_overlay_payload(runtime_context: Dictionary) -> Dictionary:
	return {
		"snapshot": build_snapshot(runtime_context),
		"runtime_state_patch": {},
	}

func _build_recent_result_items(last_results: Array, roster_ids: Array) -> Array:
	var items: Array = []
	for index in range(last_results.size() - 1, -1, -1):
		var entry_variant: Variant = last_results[index]
		if not (entry_variant is Dictionary):
			continue
		var entry: Dictionary = entry_variant as Dictionary
		var deployment := _resolve_hero_deployment(str(entry.get("heroId", "")))
		items.append({
			"label": str(entry.get("heroName", entry.get("heroId", "未知武将"))),
			"meta": "%s / %s" % [_pool_label(str(entry.get("poolId", "pool_standard"))), str(entry.get("heroId", ""))],
			"status": "%s / %s" % [str(entry.get("drawMode", "single")), _format_deployment_summary(deployment)],
			"description": "该结果已写回 roster / reserve，更新时间 tick %s。" % str(int(entry.get("updatedTick", 0))),
		})
	if items.is_empty():
		for hero_id in roster_ids.slice(0, min(roster_ids.size(), 4)):
			items.append({
				"label": "武将 %s" % str(hero_id),
				"meta": "最近 roster",
				"status": "待编组",
				"description": "暂无最新招募结果时回退到当前 roster。",
			})
	if items.is_empty():
		items = [
			{"label": "暂无结果", "meta": "等待首次招募", "status": "未刷新", "description": "执行单抽或多抽后会在此回写。"},
		]
	return items

func _build_item_cards_from_items(raw_items: Array) -> Array:
	var cards: Array = []
	for item_variant in raw_items:
		if not (item_variant is Dictionary):
			continue
		var item := item_variant as Dictionary
		cards.append({
			"title": str(item.get("label", "")).strip_edges(),
			"value": str(item.get("status", "")).strip_edges(),
			"meta": str(item.get("meta", "")).strip_edges(),
			"description": str(item.get("description", "")).strip_edges(),
		})
	return cards

func _build_card_grid_block(title: String, cards: Array, node_name: String = "", columns: int = 2) -> Dictionary:
	return {
		"kind": "card_grid",
		"title": title,
		"cards": cards.duplicate(true),
		"columns": maxi(1, columns),
		"node_name": node_name,
	}

func _build_text_block(title: String, lines: Array, node_name: String = "") -> Dictionary:
	return {
		"kind": "text_block",
		"title": title,
		"lines": lines.duplicate(true),
		"node_name": node_name,
	}

func _build_button_row_block(title: String, actions: Array, node_name: String = "") -> Dictionary:
	return {
		"kind": "button_row",
		"title": title,
		"actions": actions.duplicate(true),
		"node_name": node_name,
	}

func _merge_card_sets(primary: Array, secondary: Array) -> Array:
	var merged: Array = []
	for source in [primary, secondary]:
		for card_variant in source:
			if card_variant is Dictionary:
				merged.append((card_variant as Dictionary).duplicate(true))
	return merged


func _resolve_latest_result(hero_command: Dictionary, last_results: Array) -> Dictionary:
	var recent_hero_id := str(hero_command.get("recentHeroId", "")).strip_edges()
	if recent_hero_id != "":
		for index in range(last_results.size() - 1, -1, -1):
			var result_variant: Variant = last_results[index]
			if not (result_variant is Dictionary):
				continue
			var result: Dictionary = result_variant as Dictionary
			if str(result.get("heroId", "")).strip_edges() == recent_hero_id:
				return result
	for index in range(last_results.size() - 1, -1, -1):
		var fallback_variant: Variant = last_results[index]
		if fallback_variant is Dictionary:
			return fallback_variant as Dictionary
	return {}

func _selected_status(selected_pool_id: String, candidate_id: String) -> String:
	return "当前选择" if selected_pool_id == candidate_id else "可切换"

func _pool_label(pool_id: String) -> String:
	match pool_id:
		"pool_season":
			return "赛季卡池"
		"pool_limited":
			return "限时卡池"
		_:
			return "常驻卡池"

func _estimate_available_draw_count(development_points: int, acquisition_threshold: int, prospect_count: int) -> int:
	var remaining_points := maxi(0, development_points)
	var next_threshold := maxi(1, acquisition_threshold)
	var remaining_prospect_count := maxi(0, prospect_count)
	var count := 0
	while remaining_prospect_count > 0 and remaining_points >= next_threshold:
		remaining_points -= next_threshold
		next_threshold = mini(36, next_threshold + 2)
		remaining_prospect_count -= 1
		count += 1
	return count

func _resolve_hero_deployment(hero_id: String) -> Dictionary:
	var normalized_hero_id := hero_id.strip_edges()
	if normalized_hero_id == "":
		return {}
	var raw_units: Variant = _world_data.get("units", [])
	if not (raw_units is Array):
		return {}
	for unit_variant in raw_units as Array:
		if not (unit_variant is Dictionary):
			continue
		var unit: Dictionary = unit_variant as Dictionary
		var primary_hero: Dictionary = unit.get("hero", {}) as Dictionary
		var unit_id := str(unit.get("id", "")).strip_edges()
		var tile_id := str(unit.get("tileId", "")).strip_edges()
		if str(primary_hero.get("id", "")).strip_edges() == normalized_hero_id:
			return {
				"deployed": true,
				"unitId": unit_id,
				"tileId": tile_id,
				"role": "主将",
			}
		var co_heroes_variant: Variant = unit.get("coHeroes", [])
		if not (co_heroes_variant is Array):
			continue
		for co_hero_variant in co_heroes_variant as Array:
			if not (co_hero_variant is Dictionary):
				continue
			var co_hero: Dictionary = co_hero_variant as Dictionary
			if str(co_hero.get("id", "")).strip_edges() == normalized_hero_id:
				return {
					"deployed": true,
					"unitId": unit_id,
					"tileId": tile_id,
					"role": "副将",
				}
	return {
		"deployed": false,
		"unitId": "",
		"tileId": "",
		"role": "reserve",
	}

func _format_deployment_summary(deployment: Dictionary) -> String:
	if deployment.is_empty():
		return "待命"
	if not bool(deployment.get("deployed", false)):
		return "reserve / 待编组"
	var unit_id := str(deployment.get("unitId", "")).strip_edges()
	var tile_id := str(deployment.get("tileId", "")).strip_edges()
	var role := str(deployment.get("role", "主将")).strip_edges()
	var parts: Array[String] = ["已编组", role]
	if unit_id != "":
		parts.append(unit_id)
	if tile_id != "":
		parts.append(tile_id)
	return " / ".join(parts)

func _build_runtime_receipt_lines(runtime_context: Dictionary) -> Array:
	var last_action := str(runtime_context.get("last_action", "none")).strip_edges()
	var last_status := str(runtime_context.get("last_action_status", "idle")).strip_edges()
	var last_tick := str(runtime_context.get("last_action_tick", "unknown")).strip_edges()
	return [
		"最近回执：%s / %s" % [last_action if last_action != "" else "none", last_status if last_status != "" else "idle"],
		"回执 tick：%s" % (last_tick if last_tick != "" else "unknown"),
	]

func _read_target_faction_state() -> Dictionary:
	var raw_factions: Variant = _world_data.get("factions", {})
	if raw_factions is Dictionary and _target_faction_id != "":
		var faction_state: Variant = (raw_factions as Dictionary).get(_target_faction_id, {})
		if faction_state is Dictionary:
			return faction_state
	return {}
