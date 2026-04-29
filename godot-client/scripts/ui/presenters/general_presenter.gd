extends RefCounted
class_name GeneralPresenter

var _world_data: Dictionary = {}
var _map_layout_data: Dictionary = {}
var _target_faction_id: String = ""

const DISPLAY_PREVIEW_PORTRAIT_ROOT := "res://assets/themes/slgclient/current/generalpic/display_preview"
const LOCKED_PREVIEW_PORTRAIT_ROOT := "res://assets/themes/slgclient/current/generalpic/locked_preview"
const PROFILE_PREVIEW_DATA_PATH := "res://data/ui/general_profile_preview.json"
const EQUIPPABLE_SKILL_LIBRARY_DATA_PATH := "res://data/ui/general_skill_library_preview.json"
const HERO_SOLDIER_CAP := 10000
const HERO_STAMINA_CAP := 150

const HERO_CATALOG := {
	"100451": {"name": "关羽", "faction": "蜀", "card_type": "骑", "quality": "4-SR", "cost": 3.0, "skill_name": "樊渊泅囚", "archetype": "assault", "troop_type": "cavalry", "traits": ["突击", "压线", "突破"]},
	"100090": {"name": "太史慈", "faction": "吴", "card_type": "弓", "quality": "4-SR", "cost": 2.5, "skill_name": "方阵突击", "archetype": "recon", "troop_type": "archer", "traits": ["观察", "点杀", "扫荡"]},
	"100475": {"name": "郝昭", "faction": "魏", "card_type": "步", "quality": "4-SR", "cost": 3.0, "skill_name": "不动如山", "archetype": "guard", "troop_type": "infantry", "traits": ["坚守", "筑点", "抗压"]},
	"100027": {"name": "张辽", "faction": "魏", "card_type": "骑", "quality": "4-SR", "cost": 3.5, "skill_name": "其疾如风", "archetype": "mobile", "troop_type": "cavalry", "traits": ["奔袭", "绕后", "追击"]},
	"100661": {"name": "吕布", "faction": "群", "card_type": "骑", "quality": "4-SR", "cost": 4.0, "skill_name": "天下无双", "archetype": "heavy", "troop_type": "cavalry", "traits": ["爆发", "决战", "威慑"]},
	"100369": {"name": "华佗", "faction": "未知", "card_type": "步", "quality": "4-SR", "cost": 3.0, "skill_name": "去疾", "archetype": "logistics", "troop_type": "infantry", "traits": ["恢复", "后勤", "续航"]},
	"100016": {"name": "刘备", "faction": "蜀", "card_type": "步", "quality": "4-SR", "cost": 3.5, "skill_name": "皇裔流离", "archetype": "reserve", "troop_type": "infantry", "traits": ["稳军", "恢复", "补位"]},
	"100017": {"name": "诸葛亮", "faction": "蜀", "card_type": "步", "quality": "4-SR", "cost": 3.0, "skill_name": "诸葛锦囊", "archetype": "recon", "troop_type": "infantry", "traits": ["筹划", "侦测", "控场"]},
	"100072": {"name": "关银屏", "faction": "蜀", "card_type": "步", "quality": "4-SR", "cost": 3.0, "skill_name": "巾帼战阵", "archetype": "assault", "troop_type": "infantry", "traits": ["强攻", "压前", "近战"]},
	"100442": {"name": "黄忠", "faction": "蜀", "card_type": "步", "quality": "4-SR", "cost": 3.0, "skill_name": "定军扬威", "archetype": "heavy", "troop_type": "infantry", "traits": ["火力", "定点压制", "稳打"]},
	"100031": {"name": "周瑜", "faction": "吴", "card_type": "弓", "quality": "4-SR", "cost": 3.0, "skill_name": "玄武洰流", "archetype": "reserve", "troop_type": "archer", "traits": ["谋略", "压制", "协同"]},
	"100526": {"name": "张机", "faction": "未知", "card_type": "弓", "quality": "4-SR", "cost": 3.0, "skill_name": "金匮要略", "archetype": "logistics", "troop_type": "archer", "traits": ["恢复", "支援", "维持"]},
	"100036": {"name": "孙尚香", "faction": "吴", "card_type": "弓", "quality": "4-SR", "cost": 2.5, "skill_name": "枭姬", "archetype": "mobile", "troop_type": "archer", "traits": ["远袭", "清点", "策应"]},
	"100029": {"name": "张春华", "faction": "魏", "card_type": "弓", "quality": "4-SR", "cost": 2.5, "skill_name": "强势", "archetype": "recon", "troop_type": "archer", "traits": ["扰乱", "压制", "穿插"]},
	"100021": {"name": "赵云", "faction": "蜀", "card_type": "步", "quality": "4-SR", "cost": 3.5, "skill_name": "银龙冲阵", "archetype": "mobile", "troop_type": "infantry", "traits": ["机动", "突前", "抢点"]},
	"100023": {"name": "曹操", "faction": "魏", "card_type": "骑", "quality": "4-SR", "cost": 3.5, "skill_name": "魏武之世", "archetype": "reserve", "troop_type": "cavalry", "traits": ["统御", "增益", "总揽"]},
}

func configure(world_data: Dictionary, map_layout_data: Dictionary, target_faction_id: String) -> void:
	_world_data = world_data
	_map_layout_data = map_layout_data
	_target_faction_id = target_faction_id.strip_edges()

func build_snapshot(runtime_context: Dictionary) -> Dictionary:
	var faction_state := _read_target_faction_state()
	var hero_command: Dictionary = faction_state.get("heroCommand", {}) as Dictionary
	var roster_ids: Array = hero_command.get("rosterHeroIds", []) as Array
	var reserve_ids: Array = hero_command.get("reserveHeroIds", []) as Array
	var general_state := WorldStore.get_general_state(_target_faction_id)
	var active_hero_id := str(general_state.get("activeHeroId", roster_ids[0] if not roster_ids.is_empty() else ""))
	var tactic_map: Dictionary = general_state.get("tacticByHeroId", {}) as Dictionary
	var active_tactic := str(tactic_map.get(active_hero_id, "assault"))
	var directive_preview_info := _resolve_directive_preview_info(general_state, active_hero_id, active_tactic)
	var directive_preview: Dictionary = directive_preview_info.get("preview", {}) as Dictionary
	var directive_preview_source := str(directive_preview_info.get("source", "")).strip_edges()
	var directive_preview_hero_id := str(directive_preview_info.get("heroId", "")).strip_edges()
	var home_tile_id := str(hero_command.get("homeTileId", ""))
	var units := _read_target_units()
	var active_unit_info := _resolve_hero_unit_info(active_hero_id)
	var runtime_receipt_lines := _build_runtime_receipt_lines(runtime_context, active_hero_id, active_unit_info)
	var roster_entries := _build_general_roster_entries(roster_ids, reserve_ids, active_hero_id, tactic_map)
	var active_hero_profile := _resolve_roster_entry(active_hero_id, roster_entries)
	var roster_filters := _build_roster_filter_summary(roster_entries)
	var equipable_skill_library := _read_equippable_skill_library()
	var equipable_skill_library_summary := _build_equippable_skill_library_summary(equipable_skill_library)
	var active_hero_label := _hero_label(active_hero_id)
	if not active_hero_profile.is_empty():
		active_hero_label = str(active_hero_profile.get("display_name", active_hero_label))
	var active_tactic_label := _tactic_label(active_tactic)
	var home_tile_label := home_tile_id if home_tile_id != "" else "未定位"
	var active_unit_label := _display_or_fallback(active_unit_info.get("unitId", ""), "未编组")
	var active_tile_label := _display_or_fallback(active_unit_info.get("tileId", ""), "未定位")
	var active_role_label := _display_or_fallback(active_unit_info.get("role", ""), "reserve")
	var deployment_summary := _format_deployment_summary(active_unit_info, reserve_ids)
	var directive_summary := str(directive_preview.get("summary", "尚未请求")).strip_edges()
	if directive_summary == "":
		directive_summary = "尚未请求"
	var directive_status := str(directive_preview.get("status", "待记录")).strip_edges()
	if directive_status == "":
		directive_status = "待记录"
	var directive_source_label := directive_preview_source if directive_preview_source != "" else str(directive_preview.get("source", "hero_fallback_summary")).strip_edges()
	return {
		"title": "武将",
		"subtitle": "总览 / 详情 / 配点 / 战法库 / 兵种",
		"empty_state_text": "武将域正在等待运行时快照。",
		"shared_state": {
			"active_hero_id": active_hero_id,
			"active_hero_label": active_hero_label,
			"active_tactic": active_tactic,
			"active_tactic_label": active_tactic_label,
			"home_tile_id": home_tile_id,
			"home_tile_label": home_tile_label,
			"roster_ids": roster_ids.duplicate(),
			"reserve_ids": reserve_ids.duplicate(),
			"roster_count": roster_ids.size(),
			"reserve_count": reserve_ids.size(),
			"active_unit_info": active_unit_info.duplicate(true),
			"active_unit_label": active_unit_label,
			"active_tile_label": active_tile_label,
			"active_role_label": active_role_label,
			"deployment_summary": deployment_summary,
			"directive_preview": directive_preview.duplicate(true),
			"directive_preview_source": directive_preview_source,
			"directive_preview_hero_id": directive_preview_hero_id,
			"directive_summary": directive_summary,
			"directive_status": directive_status,
			"directive_source_label": directive_source_label,
			"runtime_receipt_summary": runtime_receipt_lines[0],
			"runtime_receipt_detail": runtime_receipt_lines[1],
			"runtime_receipt_lines": runtime_receipt_lines.duplicate(),
			"roster_entries": roster_entries.duplicate(true),
			"roster_filter_summary": roster_filters.duplicate(true),
			"active_hero_profile": active_hero_profile.duplicate(true),
			"equipable_skill_library": equipable_skill_library.duplicate(true),
			"equipable_skill_library_summary": equipable_skill_library_summary.duplicate(true),
			"active_power_label": str(active_hero_profile.get("power", 0)) if not active_hero_profile.is_empty() else "0",
			"active_skill_label": str(active_hero_profile.get("skill_name", "待记录")) if not active_hero_profile.is_empty() else "待记录",
			"active_troop_type_label": str(active_hero_profile.get("troop_type_label", "待定")) if not active_hero_profile.is_empty() else "待定",
		},
		"default_page_id": "roster",
		"tabs": [
			{"id": "roster", "label": "总览"},
			{"id": "profile", "label": "详情"},
			{"id": "tactics", "label": "配点"},
			{"id": "library", "label": "战法库"},
			{"id": "growth", "label": "兵种"},
		],
		"sections": {
			"roster": {
				"summary_title": "武将总览",
				"shared_state_title": "当前共享状态",
				"shared_state_fields": [
					{"key": "active_hero_id", "label": "当前武将"},
					{"key": "active_tactic", "label": "战法"},
					{"key": "home_tile_id", "label": "锚点"},
				],
				"summary_lines": [
					"武将列表已按 roster、预备、兵种和战力聚合。",
					"当前聚焦：%s / %s / 战力 %s。" % [active_hero_label, str(active_hero_profile.get("quality", "待定")), str(active_hero_profile.get("power", 0))],
					"筛选摘要：%s。" % str(roster_filters.get("summary", "全部武将")),
				],
				"list_title": "当前 roster",
				"item_cards": _build_item_cards_from_items(_build_roster_items(roster_ids, reserve_ids, active_hero_id, tactic_map, roster_entries)),
				"detail_title": "总览摘要",
				"content_blocks": [
					_build_card_grid_block("当前状态", _merge_card_sets([
						{"title": "当前武将", "value_key": "active_hero_label", "meta_key": "active_hero_id", "description": "总览页焦点会跟随 activeHero。", "tone": "gold"},
						{"title": "当前战法", "value_key": "active_tactic_label", "meta_key": "active_tactic", "description": "切换后会走权威 world action。", "tone": "blue"},
						{"title": "roster", "value_key": "roster_count", "meta": "当前 roster 数", "description": "当前已进入正式武将总览。", "tone": "green"},
						{"title": "reserve", "value_key": "reserve_count", "meta": "待编组", "description": "可继续编组或切战法。", "tone": "neutral"},
					], [
						{"title": "战力", "value_key": "active_power_label", "meta_key": "active_skill_label", "description_key": "active_troop_type_label", "tone": "gold"},
						{"title": "部署状态", "value_key": "deployment_summary", "meta_key": "active_unit_label", "description_key": "active_tile_label", "tone": "blue"},
					]), "GeneralRosterStateCardBlock"),
					_build_text_block("总览摘要", [
						"已编部队数：%s" % str(units.size()),
						"homeTile：%s" % (home_tile_id if home_tile_id != "" else "未定位"),
						"当前战法：%s / 当前技能：%s" % [_tactic_label(active_tactic), str(active_hero_profile.get("skill_name", "待记录"))],
						runtime_receipt_lines[0],
					], "GeneralRosterDetailBlock"),
					_build_button_row_block("动作", [
						{"id": "hero_prev", "label": "上一位"},
						{"id": "hero_next", "label": "下一位"},
						{"id": "deploy_active", "label": "编组当前武将", "disabled": active_hero_id == "" or home_tile_id == "" or bool(active_unit_info.get("deployed", false))},
						{"id": "open_active_troop", "label": "查看部队", "disabled": not bool(active_unit_info.get("deployed", false))},
					], "GeneralRosterActionBlock"),
				],
			},
			"profile": {
				"summary_title": "武将详情",
				"shared_state_title": "当前共享状态",
				"shared_state_fields": [
					{"key": "active_hero_id", "label": "当前武将"},
					{"key": "active_unit_info.unitId", "label": "部队"},
					{"key": "active_unit_info.tileId", "label": "地块"},
				],
				"summary_lines": [
					"详情页按立绘/头像、基础属性、技能、兵种和养成入口分区。",
				],
				"list_title": "详情项",
				"item_cards": _build_item_cards_from_items(_build_profile_items(active_hero_id, reserve_ids, active_unit_info, home_tile_id, directive_preview)),
				"detail_title": "详情摘要",
				"content_blocks": [
					_build_card_grid_block("当前状态", _merge_card_sets([
						{"title": "当前武将", "value_key": "active_hero_label", "meta_key": "active_hero_id", "description": "详情页聚焦当前 activeHero。", "tone": "gold"},
						{"title": "当前角色", "value_key": "active_role_label", "meta_key": "active_unit_label", "description_key": "active_tile_label", "tone": "blue"},
						{"title": "部署状态", "value_key": "deployment_summary", "meta_key": "home_tile_label", "description": "可继续进入部队链查看。", "tone": "green"},
					], [
						{"title": "说明摘要", "value_key": "directive_summary", "meta_key": "directive_status", "description_key": "directive_source_label", "tone": "neutral"},
						{"title": "最近回执", "value_key": "runtime_receipt_summary", "meta_key": "runtime_receipt_detail", "description": "详情页和动作回执保持同一焦点。", "tone": "neutral"},
					]), "GeneralProfileStateCardBlock"),
					_build_text_block("详情摘要", [
						"当前激活武将：%s" % _hero_label(active_hero_id),
						"当前战法：%s" % _tactic_label(active_tactic),
						"当前部署：%s" % _format_deployment_summary(active_unit_info, reserve_ids),
						"说明链状态：%s / %s" % [
							str(directive_preview.get("status", "待记录")),
							str(directive_preview.get("executionState", "未同步")),
						],
						runtime_receipt_lines[0],
						runtime_receipt_lines[1],
					], "GeneralProfileDetailBlock"),
					_build_button_row_block("动作", [
						{"id": "deploy_active", "label": "编组当前武将", "disabled": active_hero_id == "" or home_tile_id == "" or bool(active_unit_info.get("deployed", false))},
						{"id": "open_active_troop", "label": "查看部队", "disabled": not bool(active_unit_info.get("deployed", false))},
					], "GeneralProfileActionBlock"),
				],
			},
			"tactics": {
				"summary_title": "战法",
				"shared_state_title": "当前共享状态",
				"shared_state_fields": [
					{"key": "active_hero_id", "label": "当前武将"},
					{"key": "active_tactic", "label": "战法"},
					{"key": "directive_preview.summary", "label": "摘要"},
				],
				"summary_lines": [
					"战法切换已接入权威 world action 与 generalStateByFaction.tacticByHeroId。",
					"说明链优先读取 directivePreviewByHeroId[activeHeroId]，directivePreview 只保留兼容镜像。",
					_build_equippable_skill_library_line(equipable_skill_library_summary),
				],
				"list_title": "战法槽",
				"item_cards": _build_item_cards_from_items([
					{"label": "先锋", "meta": "assault", "status": _active_status(active_tactic, "assault"), "description": "强调推进与攻击。"},
					{"label": "驻守", "meta": "guard", "status": _active_status(active_tactic, "guard"), "description": "强调守点与稳态。"},
					{"label": "后勤", "meta": "logistics", "status": _active_status(active_tactic, "logistics"), "description": "强调补给与恢复。"},
				]),
				"detail_title": "战法摘要",
				"content_blocks": [
					_build_card_grid_block("当前状态", _merge_card_sets([
						{"title": "当前武将", "value_key": "active_hero_label", "meta_key": "active_hero_id", "description": "战法页跟随当前武将焦点。", "tone": "gold"},
						{"title": "当前战法", "value_key": "active_tactic_label", "meta_key": "active_tactic", "description": "战法切换会直连权威动作。", "tone": "blue"},
						{"title": "说明状态", "value_key": "directive_status", "meta_key": "directive_source_label", "description_key": "directive_summary", "tone": "green"},
					], [
						{"title": "当前部队", "value_key": "active_unit_label", "meta_key": "active_tile_label", "description_key": "deployment_summary", "tone": "blue"},
						{"title": "最近回执", "value_key": "runtime_receipt_summary", "meta_key": "runtime_receipt_detail", "description": "说明链会跟权威回执一起更新。", "tone": "neutral"},
					]), "GeneralTacticsStateCardBlock"),
					_build_text_block("战法摘要", _build_tactic_detail_lines(general_state, active_hero_id, active_tactic, directive_preview, directive_preview_source, directive_preview_hero_id, active_unit_info, reserve_ids, runtime_context), "GeneralTacticsDetailBlock"),
					_build_button_row_block("动作", [
						{"id": "tactic_assault", "label": "先锋", "disabled": active_tactic == "assault"},
						{"id": "tactic_guard", "label": "驻守", "disabled": active_tactic == "guard"},
						{"id": "tactic_logistics", "label": "后勤", "disabled": active_tactic == "logistics"},
						{"id": "open_active_troop", "label": "查看部队", "disabled": not bool(active_unit_info.get("deployed", false))},
					], "GeneralTacticsActionBlock"),
				],
			},
			"library": {
				"summary_title": "战法库",
				"shared_state_title": "当前共享状态",
				"shared_state_fields": [
					{"key": "equipable_skill_library_summary.skill_count", "label": "通用战法"},
					{"key": "equipable_skill_library_summary.recommended_slot_counts.任意", "label": "任意装配"},
					{"key": "active_hero_id", "label": "当前武将"},
				],
				"summary_lines": [
					"通用战法库只读展示，支持按品质、类型、兵种、标签筛选。",
					"当前不做站位推荐和武将名推荐，让玩家自行试搭配。",
					_build_equippable_skill_library_line(equipable_skill_library_summary),
				],
				"list_title": "筛选",
				"item_cards": _build_item_cards_from_items([]),
				"detail_title": "战法库",
				"content_blocks": [],
			},
			"growth": {
				"summary_title": "养成",
				"shared_state_title": "当前共享状态",
				"shared_state_fields": [
					{"key": "active_hero_id", "label": "当前武将"},
					{"key": "active_tactic", "label": "战法"},
					{"key": "active_unit_info.unitId", "label": "部队"},
				],
				"summary_lines": [
					"养成仍保留为正式结构位，但当前重点先落 roster / 编组 / 战法链。",
				],
				"list_title": "养成项",
				"item_cards": _build_item_cards_from_items([
					{"label": "升级", "meta": "开发链", "status": "待继续接", "description": "后续接成长与资源消耗。"},
					{"label": "进阶", "meta": "素材链", "status": "待继续接", "description": "后续接重复武将和消耗。"},
				]),
				"detail_title": "养成摘要",
				"content_blocks": [
					_build_card_grid_block("当前状态", _merge_card_sets([
						{"title": "当前武将", "value_key": "active_hero_label", "meta_key": "active_hero_id", "description": "养成仍然锚定当前武将。", "tone": "gold"},
						{"title": "roster", "value_key": "roster_count", "meta": "当前 roster 数", "description": "后续继续接成长链。", "tone": "green"},
						{"title": "reserve", "value_key": "reserve_count", "meta": "待编组", "description": "保留养成 -> 编组的后续路径。", "tone": "neutral"},
					], [
						{"title": "部署状态", "value_key": "deployment_summary", "meta_key": "active_unit_label", "description_key": "home_tile_label", "tone": "blue"},
						{"title": "最近说明", "value_key": "directive_summary", "meta_key": "directive_status", "description": "当前先保留结构位，不抢主线。", "tone": "neutral"},
					]), "GeneralGrowthStateCardBlock"),
					_build_text_block("养成摘要", [
						"当前激活武将：%s" % _hero_label(active_hero_id),
						"最近战法预览：%s" % str(directive_preview.get("summary", "尚未请求")),
						"当前部署：%s" % _format_deployment_summary(active_unit_info, reserve_ids),
					], "GeneralGrowthDetailBlock"),
				],
			},
		},
	}

func build_overlay_payload(runtime_context: Dictionary) -> Dictionary:
	return {
		"snapshot": build_snapshot(runtime_context),
		"runtime_state_patch": {},
	}

func _build_roster_items(roster_ids: Array, reserve_ids: Array, active_hero_id: String, tactic_map: Dictionary, roster_entries: Array = []) -> Array:
	var items: Array = []
	var source_entries := roster_entries
	if source_entries.is_empty():
		source_entries = _build_general_roster_entries(roster_ids, reserve_ids, active_hero_id, tactic_map)
	for index in range(min(source_entries.size(), 12)):
		if not (source_entries[index] is Dictionary):
			continue
		var entry := source_entries[index] as Dictionary
		var hero_id := str(entry.get("id", ""))
		var tactic_id := str(entry.get("tactic_id", tactic_map.get(hero_id, "assault")))
		items.append({
			"label": str(entry.get("display_name", _hero_label(hero_id))),
			"meta": "%s · Lv.%s · %s" % [str(entry.get("quality", "待定")), str(entry.get("level", 1)), str(entry.get("troop_type_label", "待定"))],
			"status": "%s · %s" % [str(entry.get("status_label", "")), "当前激活" if hero_id == active_hero_id else "可切换"],
			"description": "战力 %s / 战法 %s / 技能 %s。" % [str(entry.get("power", 0)), _tactic_label(tactic_id), str(entry.get("skill_name", "待记录"))],
		})
	if items.is_empty():
		items.append({
			"label": "暂无武将",
			"meta": "等待招募",
			"status": "空",
			"description": "先在招募域完成真实招募动作。",
		})
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

func _build_general_roster_entries(roster_ids: Array, reserve_ids: Array, active_hero_id: String, tactic_map: Dictionary) -> Array:
	var entries: Array = []
	var seen_ids := {}
	for index in range(roster_ids.size()):
		var hero_id := _normalize_hero_id(str(roster_ids[index]))
		if hero_id == "":
			continue
		var unit_info := _resolve_hero_unit_info(hero_id)
		var entry := _build_general_roster_entry(hero_id, index, reserve_ids, active_hero_id, tactic_map, unit_info)
		entries.append(entry)
		seen_ids[hero_id] = true
	var preview_profiles := _read_preview_hero_profiles()
	var preview_ids: Array[String] = []
	for preview_id_variant in preview_profiles.keys():
		var preview_id := _normalize_hero_id(str(preview_id_variant))
		if preview_id != "" and not seen_ids.has(preview_id):
			preview_ids.append(preview_id)
	preview_ids.sort()
	for preview_id in preview_ids:
		var preview_entry := _build_general_roster_entry(preview_id, entries.size(), reserve_ids, active_hero_id, tactic_map, {})
		entries.append(preview_entry)
		seen_ids[preview_id] = true
	return entries

func _build_general_roster_entry(hero_id: String, index: int, reserve_ids: Array, active_hero_id: String, tactic_map: Dictionary, unit_info: Dictionary) -> Dictionary:
	var catalog := _read_hero_catalog_entry(hero_id)
	var hero_profile: Dictionary = unit_info.get("hero_profile", {}) as Dictionary
	var display_name := str(hero_profile.get("name", catalog.get("name", _hero_label(hero_id)))).strip_edges()
	var quality := str(hero_profile.get("quality", catalog.get("quality", "3-R"))).strip_edges()
	var stars: int = clampi(int(catalog.get("stars", 0)), 0, 5)
	var red_stars: int = clampi(int(catalog.get("red_stars", 0)), 0, stars)
	var archetype := str(hero_profile.get("archetype", catalog.get("archetype", "reserve"))).strip_edges()
	var troop_type := str(hero_profile.get("troopType", catalog.get("troop_type", "infantry"))).strip_edges()
	var card_type := str(hero_profile.get("cardType", catalog.get("card_type", "步"))).strip_edges()
	var level := int(hero_profile.get("level", catalog.get("level", _derive_hero_level(catalog))))
	var attributes: Dictionary = catalog.get("attributes", {}) as Dictionary
	var growth: Dictionary = catalog.get("growth", {}) as Dictionary
	var force := int(hero_profile.get("force", attributes.get("force", _derive_force(catalog, archetype))))
	var command := int(hero_profile.get("command", attributes.get("command", _derive_command(catalog, archetype))))
	var intelligence := int(hero_profile.get("intelligence", attributes.get("intelligence", _derive_intelligence(catalog, archetype))))
	var charisma := int(hero_profile.get("charisma", attributes.get("charisma", _derive_charisma(catalog, archetype))))
	var speed := int(hero_profile.get("speed", attributes.get("speed", _derive_speed(catalog, archetype))))
	var deployed := bool(unit_info.get("deployed", false))
	var reserve := reserve_ids.has(hero_id)
	var unit_strength := int(unit_info.get("strength", 0))
	var cost := float(catalog.get("cost", 2.5))
	var power := unit_strength if deployed and unit_strength > 0 else 58 + int(round(cost * 8.0))
	var soldier_max := clampi(int(catalog.get("soldier_max", HERO_SOLDIER_CAP)), 1, HERO_SOLDIER_CAP)
	var soldier_current := clampi(int(catalog.get("soldier_current", _resolve_hero_soldier_current(unit_strength, deployed, soldier_max))), 0, soldier_max)
	var stamina_max := clampi(int(catalog.get("stamina_max", HERO_STAMINA_CAP)), 1, HERO_STAMINA_CAP)
	var stamina_current := clampi(int(catalog.get("stamina_current", stamina_max if deployed else 120)), 0, stamina_max)
	var exp_max := maxi(1, int(catalog.get("exp_max", level * 17000)))
	var exp_current := clampi(int(catalog.get("exp_current", int(round(float(exp_max) * 0.48)))), 0, exp_max)
	var attack_range := int(hero_profile.get("attackRange", catalog.get("attack_range", 2 + (index % 2))))
	var tactic_id := str(tactic_map.get(hero_id, "assault")).strip_edges()
	var traits := _coerce_string_array(hero_profile.get("traits", catalog.get("traits", [])))
	var skill: Dictionary = hero_profile.get("signatureSkill", {}) as Dictionary
	var skills := _coerce_dictionary_array(catalog.get("skills", []))
	var first_skill: Dictionary = skills[0] if not skills.is_empty() and skills[0] is Dictionary else {}
	var skill_name := str(skill.get("name", catalog.get("skill_name", first_skill.get("name", "待记录")))).strip_edges()
	var skill_detail := str(skill.get("detail", _build_skill_detail(catalog, archetype))).strip_edges()
	var status_label := "已编组" if deployed else ("预备" if reserve else "未编组")
	var readiness := int(unit_info.get("readiness", 0))
	if deployed and readiness > 0:
		status_label = "%s / 战备 %s" % [status_label, str(readiness)]
	return {
		"id": hero_id,
		"index": index,
		"display_name": display_name if display_name != "" else _hero_label(hero_id),
		"title": str(hero_profile.get("title", _build_hero_title(catalog, archetype))),
		"faction": str(hero_profile.get("faction", catalog.get("faction", "未知"))),
		"quality": quality,
		"cost": cost,
		"cost_label": "%.1f" % cost,
		"attack_range": attack_range,
		"attack_range_label": str(attack_range),
		"rarity_label": _quality_label(quality),
		"variant_tag": str(catalog.get("variant_tag", "")),
		"variant_label": str(catalog.get("variant_label", "")),
		"stars": stars,
		"red_stars": red_stars,
		"star_text": _build_star_text(catalog, quality),
		"level": level,
		"exp_current": exp_current,
		"exp_max": exp_max,
		"soldier_current": soldier_current,
		"soldier_max": soldier_max,
		"stamina_current": stamina_current,
		"stamina_max": stamina_max,
		"card_type": card_type,
		"troop_type": troop_type,
		"troop_type_label": _troop_type_label(troop_type, card_type),
		"archetype": archetype,
		"archetype_label": _archetype_label(archetype),
		"force": force,
		"command": command,
		"intelligence": intelligence,
		"charisma": charisma,
		"speed": speed,
		"force_growth": _format_growth(growth.get("force", 0.72 + cost * 0.18)),
		"command_growth": _format_growth(growth.get("command", 1.12 + cost * 0.23)),
		"intelligence_growth": _format_growth(growth.get("intelligence", 0.86 + cost * 0.17)),
		"charisma_growth": _format_growth(growth.get("charisma", 0.50 + cost * 0.12)),
		"speed_growth": _format_growth(growth.get("speed", 0.64 + cost * 0.16)),
		"power": power,
		"status_label": status_label,
		"deployed": deployed,
		"reserve": reserve,
		"is_active": hero_id == active_hero_id,
		"unit_id": str(unit_info.get("unitId", "")),
		"tile_id": str(unit_info.get("tileId", "")),
		"role_label": _display_or_fallback(unit_info.get("role", ""), "reserve"),
		"corps_name": str(unit_info.get("corps_name", "")),
		"current_task": str(unit_info.get("current_task", "")),
		"readiness": readiness,
		"supply": int(unit_info.get("supply", 0)),
		"tactic_id": tactic_id,
		"tactic_label": _tactic_label(tactic_id),
		"skill_name": skill_name if skill_name != "" else "待记录",
		"skill_detail": skill_detail if skill_detail != "" else "等待技能说明。",
		"learnable_skill_slots": maxi(0, int(catalog.get("learnable_skill_slots", 2))),
		"traits": traits,
		"skills": skills,
		"allocation": catalog.get("allocation", {}) as Dictionary,
		"portrait_path": _build_portrait_path(hero_id, catalog),
		"action_id": "focus_hero:%s" % hero_id,
	}

func _resolve_roster_entry(hero_id: String, roster_entries: Array) -> Dictionary:
	var normalized_hero_id := _normalize_hero_id(hero_id)
	for entry_variant in roster_entries:
		if not (entry_variant is Dictionary):
			continue
		var entry := entry_variant as Dictionary
		if str(entry.get("id", "")).strip_edges() == normalized_hero_id:
			return entry
	if not roster_entries.is_empty() and roster_entries[0] is Dictionary:
		return roster_entries[0] as Dictionary
	return {}

func _build_roster_filter_summary(roster_entries: Array) -> Dictionary:
	var deployed_count := 0
	var reserve_count := 0
	var cavalry_count := 0
	var infantry_count := 0
	var ranged_count := 0
	var max_power := 0
	for entry_variant in roster_entries:
		if not (entry_variant is Dictionary):
			continue
		var entry := entry_variant as Dictionary
		if bool(entry.get("deployed", false)):
			deployed_count += 1
		if bool(entry.get("reserve", false)):
			reserve_count += 1
		match str(entry.get("card_type", "")):
			"骑":
				cavalry_count += 1
			"弓":
				ranged_count += 1
			_:
				infantry_count += 1
		max_power = maxi(max_power, int(entry.get("power", 0)))
	var summary := "全部 %s / 已编 %s / 预备 %s" % [str(roster_entries.size()), str(deployed_count), str(reserve_count)]
	return {
		"total": roster_entries.size(),
		"deployed": deployed_count,
		"reserve": reserve_count,
		"cavalry": cavalry_count,
		"infantry": infantry_count,
		"ranged": ranged_count,
		"max_power": max_power,
		"summary": summary,
	}

func _normalize_hero_id(hero_id: String) -> String:
	var normalized := hero_id.strip_edges()
	if normalized.begins_with("hero_"):
		return normalized.trim_prefix("hero_")
	return normalized

func _read_hero_catalog_entry(hero_id: String) -> Dictionary:
	var normalized_hero_id := _normalize_hero_id(hero_id)
	var catalog := {
		"name": "武将 %s" % normalized_hero_id,
		"faction": "未知",
		"card_type": "步",
		"quality": "3-R",
		"cost": 2.0,
		"skill_name": "待记录",
		"archetype": "reserve",
		"troop_type": "infantry",
		"traits": ["待编组"],
	}
	if normalized_hero_id != "" and HERO_CATALOG.has(normalized_hero_id):
		catalog = (HERO_CATALOG.get(normalized_hero_id, {}) as Dictionary).duplicate(true)
	var preview_profiles := _read_preview_hero_profiles()
	if preview_profiles.has(normalized_hero_id) and preview_profiles.get(normalized_hero_id) is Dictionary:
		var preview := preview_profiles.get(normalized_hero_id, {}) as Dictionary
		for key in preview.keys():
			catalog[key] = preview.get(key)
	return catalog

func _coerce_string_array(raw_value: Variant) -> Array:
	var result: Array = []
	if not (raw_value is Array):
		return result
	for item in raw_value as Array:
		var text := str(item).strip_edges()
		if text != "":
			result.append(text)
	return result

func _coerce_dictionary_array(raw_value: Variant) -> Array:
	var result: Array = []
	if not (raw_value is Array):
		return result
	for item in raw_value as Array:
		if item is Dictionary:
			result.append((item as Dictionary).duplicate(true))
	return result

func _read_preview_hero_profiles() -> Dictionary:
	if not FileAccess.file_exists(PROFILE_PREVIEW_DATA_PATH):
		return {}
	var file := FileAccess.open(PROFILE_PREVIEW_DATA_PATH, FileAccess.READ)
	if file == null:
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if not (parsed is Dictionary):
		return {}
	var root := parsed as Dictionary
	var profiles: Variant = root.get("hero_profiles", {})
	return profiles as Dictionary if profiles is Dictionary else {}

func _read_equippable_skill_library() -> Dictionary:
	if not FileAccess.file_exists(EQUIPPABLE_SKILL_LIBRARY_DATA_PATH):
		return {}
	var file := FileAccess.open(EQUIPPABLE_SKILL_LIBRARY_DATA_PATH, FileAccess.READ)
	if file == null:
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	return parsed as Dictionary if parsed is Dictionary else {}

func _build_equippable_skill_library_summary(library: Dictionary) -> Dictionary:
	var skills := _coerce_dictionary_array(library.get("skills", []))
	var grade_counts := {"S": 0, "A": 0, "B": 0}
	var type_counts := {"指挥": 0, "主动": 0, "被动": 0, "追击": 0}
	var troop_counts := {"骑兵": 0, "步兵": 0, "弓兵": 0}
	var slot_counts := {"前锋": 0, "中军": 0, "大营": 0, "任意": 0}
	var tag_counts: Dictionary = {}
	for skill_variant in skills:
		var skill := skill_variant as Dictionary
		var grade := str(skill.get("grade", "B")).strip_edges().to_upper()
		if grade_counts.has(grade):
			grade_counts[grade] = int(grade_counts.get(grade, 0)) + 1
		var skill_type := str(skill.get("type", "主动")).strip_edges()
		if skill_type == "突击":
			skill_type = "追击"
		if type_counts.has(skill_type):
			type_counts[skill_type] = int(type_counts.get(skill_type, 0)) + 1
		for troop in _coerce_string_array(skill.get("compatible_troops", [])):
			var troop_label := str(troop).strip_edges()
			if troop_counts.has(troop_label):
				troop_counts[troop_label] = int(troop_counts.get(troop_label, 0)) + 1
		for tag in _coerce_string_array(skill.get("tags", [])):
			var tag_label := str(tag).strip_edges()
			if tag_label != "":
				tag_counts[tag_label] = int(tag_counts.get(tag_label, 0)) + 1
		var recommended_slot := str(skill.get("recommended_slot", "")).strip_edges()
		if slot_counts.has(recommended_slot):
			slot_counts[recommended_slot] = int(slot_counts.get(recommended_slot, 0)) + 1
	return {
		"schema_version": str(library.get("schema_version", "")),
		"skill_count": skills.size(),
		"grade_counts": grade_counts,
		"type_counts": type_counts,
		"troop_counts": troop_counts,
		"slot_counts": slot_counts,
		"tag_counts": tag_counts,
		"top_tag_labels": _build_top_tag_labels(tag_counts, 4),
		"boundary": library.get("boundary", {}) as Dictionary,
	}

func _build_top_tag_labels(tag_counts: Dictionary, limit: int = 4) -> Array[String]:
	var labels: Array[String] = []
	var remaining := tag_counts.duplicate()
	while labels.size() < limit and not remaining.is_empty():
		var best_tag := ""
		var best_count := -1
		for tag_variant in remaining.keys():
			var tag := str(tag_variant)
			var count := int(remaining.get(tag_variant, 0))
			if count > best_count or (count == best_count and (best_tag == "" or tag < best_tag)):
				best_tag = tag
				best_count = count
		if best_tag == "" or best_count <= 0:
			break
		labels.append("%s×%s" % [best_tag, str(best_count)])
		remaining.erase(best_tag)
	return labels

func _build_equippable_skill_library_line(summary: Dictionary) -> String:
	var grade_counts: Dictionary = summary.get("grade_counts", {}) as Dictionary
	var type_counts: Dictionary = summary.get("type_counts", {}) as Dictionary
	return "可装配战法库：%s 个；品质 S/A/B=%s/%s/%s；类型 指挥/主动/被动/追击=%s/%s/%s/%s；与武将主战法分文件维护。" % [
		str(summary.get("skill_count", 0)),
		str(grade_counts.get("S", 0)),
		str(grade_counts.get("A", 0)),
		str(grade_counts.get("B", 0)),
		str(type_counts.get("指挥", 0)),
		str(type_counts.get("主动", 0)),
		str(type_counts.get("被动", 0)),
		str(type_counts.get("追击", 0)),
	]

func _build_portrait_path(hero_id: String, catalog: Dictionary = {}) -> String:
	var normalized_hero_id := _normalize_hero_id(hero_id)
	if normalized_hero_id == "":
		return ""
	var explicit_display_path := str(catalog.get("display_portrait_path", "")).strip_edges()
	if explicit_display_path != "" and _godot_path_exists(explicit_display_path):
		return explicit_display_path
	var display_preview_path := "%s/card_%s.png" % [DISPLAY_PREVIEW_PORTRAIT_ROOT, normalized_hero_id]
	if _godot_path_exists(display_preview_path):
		return display_preview_path
	var preview_path := "%s/card_%s.png" % [LOCKED_PREVIEW_PORTRAIT_ROOT, normalized_hero_id]
	if _godot_path_exists(preview_path):
		return preview_path
	return "res://assets/themes/slgclient/current/generalpic/card_%s.png" % normalized_hero_id

func _resolve_hero_soldier_current(unit_strength: int, deployed: bool, soldier_max: int) -> int:
	if not deployed:
		return 0
	var normalized := maxi(unit_strength, 0)
	if normalized <= 100:
		return int(round(float(soldier_max) * float(normalized) / 100.0))
	return clampi(normalized, 0, soldier_max)

func _godot_path_exists(path: String) -> bool:
	var resolved := path.strip_edges()
	if resolved == "":
		return false
	if ResourceLoader.exists(resolved):
		return true
	if FileAccess.file_exists(resolved):
		return true
	var globalized := ProjectSettings.globalize_path(resolved)
	return globalized != resolved and FileAccess.file_exists(globalized)

func _quality_label(quality: String) -> String:
	match quality:
		"4-SR":
			return "SR"
		"3-R":
			return "R"
		_:
			return quality if quality != "" else "N"

func _star_text(quality: String) -> String:
	match quality:
		"4-SR":
			return "★★★★"
		"3-R":
			return "★★★"
		_:
			return "★★"

func _build_star_text(catalog: Dictionary, quality: String) -> String:
	var stars := clampi(int(catalog.get("stars", 0)), 0, 5)
	if stars <= 0:
		return _star_text(quality)
	var red_stars := clampi(int(catalog.get("red_stars", 0)), 0, stars)
	var gold_stars := maxi(0, stars - red_stars)
	return "%s%s" % ["★".repeat(red_stars), "★".repeat(gold_stars)]

func _format_growth(value: Variant) -> String:
	return "%.2f" % float(value)

func _troop_type_label(troop_type: String, card_type: String = "") -> String:
	match troop_type:
		"cavalry":
			return "骑兵"
		"archer":
			return "弓兵"
		"infantry":
			return "步兵"
		_:
			if card_type == "骑":
				return "骑兵"
			if card_type == "弓":
				return "弓兵"
			return "步兵"

func _archetype_label(archetype: String) -> String:
	match archetype:
		"assault":
			return "破阵"
		"recon":
			return "侦察"
		"guard":
			return "镇守"
		"mobile":
			return "机动"
		"heavy":
			return "重锋"
		"logistics":
			return "后勤"
		_:
			return "中军"

func _derive_hero_level(catalog: Dictionary) -> int:
	var quality := str(catalog.get("quality", "3-R"))
	var quality_base := 24 if quality == "4-SR" else (18 if quality == "3-R" else 12)
	return quality_base + int(round(float(catalog.get("cost", 2.0)) * 2.0))

func _derive_command(catalog: Dictionary, archetype: String) -> int:
	var base := 48 + int(round(float(catalog.get("cost", 2.0)) * 10.0))
	var quality := str(catalog.get("quality", "3-R"))
	var quality_bonus := 12 if quality == "4-SR" else (6 if quality == "3-R" else 0)
	var role_bonus := 10 if archetype == "heavy" or archetype == "guard" else (8 if archetype == "reserve" else 4)
	return _clamp_stat(base + quality_bonus + role_bonus)

func _derive_force(catalog: Dictionary, archetype: String) -> int:
	var card_type := str(catalog.get("card_type", "步"))
	var base := 44 + int(round(float(catalog.get("cost", 2.0)) * 9.0))
	var type_bonus := 12 if card_type == "步" else (8 if card_type == "骑" else 2)
	var role_bonus := 14 if archetype == "assault" or archetype == "heavy" else (8 if archetype == "guard" else 0)
	return _clamp_stat(base + type_bonus + role_bonus)

func _derive_speed(catalog: Dictionary, archetype: String) -> int:
	var card_type := str(catalog.get("card_type", "步"))
	var type_bonus := 18 if card_type == "骑" else (10 if card_type == "弓" else 4)
	var role_bonus := 0
	match archetype:
		"mobile", "recon":
			role_bonus = 16
		"assault":
			role_bonus = 10
		"logistics":
			role_bonus = -6
	return _clamp_stat(40 + int(round(float(catalog.get("cost", 2.0)) * 7.0)) + type_bonus + role_bonus)

func _derive_intelligence(catalog: Dictionary, archetype: String) -> int:
	var card_type := str(catalog.get("card_type", "步"))
	var type_bonus := 14 if card_type == "弓" else (10 if card_type == "步" else 6)
	var role_bonus := 16 if archetype == "logistics" or archetype == "reserve" else (10 if archetype == "recon" else 2)
	return _clamp_stat(42 + int(round(float(catalog.get("cost", 2.0)) * 7.0)) + type_bonus + role_bonus)

func _derive_charisma(catalog: Dictionary, archetype: String) -> int:
	var base := 42 + int(round(float(catalog.get("cost", 2.0)) * 6.0))
	var quality := str(catalog.get("quality", "3-R"))
	var quality_bonus := 10 if quality == "4-SR" else (5 if quality == "3-R" else 0)
	var role_bonus := 14 if archetype == "reserve" or archetype == "logistics" else (10 if archetype == "recon" else (8 if archetype == "guard" else 2))
	return _clamp_stat(base + role_bonus + quality_bonus)

func _clamp_stat(value: int) -> int:
	return mini(99, maxi(35, value))

func _build_hero_title(catalog: Dictionary, archetype: String) -> String:
	var faction := str(catalog.get("faction", "未知"))
	var role_title := "中军节制"
	match archetype:
		"assault":
			role_title = "破阵主将"
		"recon":
			role_title = "游击谋臣"
		"guard":
			role_title = "镇守主将"
		"mobile":
			role_title = "机动先锋"
		"heavy":
			role_title = "重锋统军"
		"logistics":
			role_title = "军资总管"
	return "%s%s" % [faction, role_title]

func _build_skill_detail(catalog: Dictionary, archetype: String) -> String:
	var traits := _coerce_string_array(catalog.get("traits", []))
	var trait_text := " / ".join(traits.slice(0, min(traits.size(), 3))) if not traits.is_empty() else _archetype_label(archetype)
	return "%s型武将技能，偏向%s。" % [_archetype_label(archetype), trait_text]

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

func _hero_label(hero_id: String) -> String:
	var normalized_hero_id := _normalize_hero_id(hero_id)
	if normalized_hero_id == "":
		return "待补位"
	var catalog := _read_hero_catalog_entry(normalized_hero_id)
	return str(catalog.get("name", "武将 %s" % normalized_hero_id))

func _reserve_status(hero_id: String, reserve_ids: Array) -> String:
	return "reserve" if reserve_ids.has(hero_id) else "已编组"

func _tactic_label(tactic_id: String) -> String:
	match tactic_id:
		"guard":
			return "驻守"
		"logistics":
			return "后勤"
		_:
			return "先锋"

func _active_status(current_tactic: String, candidate_tactic: String) -> String:
	return "当前选择" if current_tactic == candidate_tactic else "可切换"

func _build_profile_items(active_hero_id: String, reserve_ids: Array, active_unit_info: Dictionary, home_tile_id: String, directive_preview: Dictionary) -> Array:
	return [
		{
			"label": _hero_label(active_hero_id),
			"meta": "当前激活武将",
			"status": _format_deployment_summary(active_unit_info, reserve_ids),
			"description": "该武将当前可继续进入战法、编组和部队链。",
		},
		{
			"label": "当前部队",
			"meta": _display_or_fallback(active_unit_info.get("unitId", ""), "未编组"),
			"status": _display_or_fallback(active_unit_info.get("tileId", ""), "未定位"),
			"description": "若已编组，可直接跳到对应部队查看当前任务和位置。",
		},
		{
			"label": "部署锚点",
			"meta": home_tile_id if home_tile_id != "" else "未定位",
			"status": "世界主壳",
			"description": "当前编组默认回到主城锚点。",
		},
		{
			"label": "说明链",
			"meta": str(directive_preview.get("status", "待记录")),
			"status": str(directive_preview.get("executionState", "未同步")),
			"description": str(directive_preview.get("summary", "等待新的权威战法说明链。")),
		},
	]

func _build_tactic_detail_lines(general_state: Dictionary, active_hero_id: String, active_tactic: String, directive_preview: Dictionary, directive_preview_source: String, directive_preview_hero_id: String, active_unit_info: Dictionary, reserve_ids: Array, runtime_context: Dictionary) -> Array:
	var lines := [
		"当前激活武将：%s" % _hero_label(active_hero_id),
		"当前战法：%s" % _tactic_label(active_tactic),
		"权威摘要：%s" % str(directive_preview.get("summary", "尚未请求")),
		"当前部署：%s" % _format_deployment_summary(active_unit_info, reserve_ids),
	]
	if directive_preview_source == "hero_index":
		lines.append("说明层级：hero 索引优先")
	elif directive_preview_source == "singleton_mirror":
		lines.append("说明层级：兼容镜像回退")
	elif directive_preview_source != "":
		lines.append("说明层级：%s" % directive_preview_source)
	if directive_preview_hero_id != "":
		lines.append("说明归属：%s" % _hero_label(directive_preview_hero_id))
	var status_text := str(directive_preview.get("status", "")).strip_edges()
	if status_text != "":
		lines.append("当前状态：%s" % status_text)
	var execution_state := str(directive_preview.get("executionState", "")).strip_edges()
	if execution_state != "":
		lines.append("执行链：%s" % execution_state)
	var source_text := str(directive_preview.get("source", "")).strip_edges()
	if source_text != "":
		lines.append("权威来源：%s" % source_text)
	var source_action_id := str(directive_preview.get("sourceActionId", "")).strip_edges()
	if source_action_id != "":
		lines.append("来源动作：%s" % source_action_id)
	var mirror_hero_id := str(general_state.get("directivePreviewHeroId", "")).strip_edges()
	if directive_preview_source == "singleton_mirror" and mirror_hero_id != "" and mirror_hero_id != directive_preview_hero_id:
		lines.append("单例镜像归属：%s" % _hero_label(mirror_hero_id))
	var template_id := str(directive_preview.get("templateId", "")).strip_edges()
	if template_id != "":
		lines.append("权威模板：%s" % template_id)
	var preview_hero_id := str(directive_preview.get("heroId", "")).strip_edges()
	if preview_hero_id != "":
		lines.append("说明归属：%s" % _hero_label(preview_hero_id))
	var target_unit_id := str(directive_preview.get("targetUnitId", "")).strip_edges()
	if target_unit_id != "":
		lines.append("当前部队：%s" % target_unit_id)
	var target_tile_id := str(directive_preview.get("targetTileId", "")).strip_edges()
	if target_tile_id != "":
		lines.append("目标地块：%s" % target_tile_id)
	var updated_tick := int(directive_preview.get("updatedTick", -1))
	if updated_tick >= 0:
		lines.append("权威更新 tick：%s" % str(updated_tick))
	var updated_world_version := int(directive_preview.get("updatedWorldVersion", -1))
	if updated_world_version >= 0:
		lines.append("权威世界版本：%s" % str(updated_world_version))
	var affected_unit_ids: Array = directive_preview.get("affectedUnitIds", []) as Array
	if not affected_unit_ids.is_empty():
		lines.append("影响部队：%s" % ",".join(affected_unit_ids.slice(0, min(affected_unit_ids.size(), 3))))
	var effect_lines: Array = directive_preview.get("effectLines", []) as Array
	for line in effect_lines.slice(0, 2):
		lines.append(str(line))
	var next_steps: Array = directive_preview.get("nextSteps", []) as Array
	for next_step in next_steps.slice(0, 2):
		lines.append("下一步：%s" % str(next_step))
	var warnings: Array = directive_preview.get("warnings", []) as Array
	for warning in warnings.slice(0, 2):
		lines.append("警告：%s" % str(warning))
	var runtime_receipt_lines := _build_runtime_receipt_lines(runtime_context, active_hero_id, active_unit_info)
	lines.append(runtime_receipt_lines[0])
	lines.append(runtime_receipt_lines[1])
	return lines

func _resolve_directive_preview_info(general_state: Dictionary, active_hero_id: String, active_tactic: String) -> Dictionary:
	var directive_preview_by_hero: Dictionary = general_state.get("directivePreviewByHeroId", {}) as Dictionary
	if active_hero_id != "" and directive_preview_by_hero.has(active_hero_id):
		var hero_preview: Variant = directive_preview_by_hero.get(active_hero_id, {})
		if hero_preview is Dictionary:
			return {
				"preview": hero_preview as Dictionary,
				"source": "hero_index",
				"heroId": active_hero_id,
			}
	var allow_singleton_mirror_fallback := directive_preview_by_hero.is_empty()
	var directive_preview: Dictionary = general_state.get("directivePreview", {}) as Dictionary
	var preview_hero_id := str(directive_preview.get("heroId", "")).strip_edges()
	var preview_mirror_hero_id := str(general_state.get("directivePreviewHeroId", "")).strip_edges()
	if not allow_singleton_mirror_fallback:
		return _build_active_hero_directive_preview_fallback(active_hero_id, active_tactic)
	if active_hero_id == "":
		if preview_hero_id != "" and (preview_mirror_hero_id == "" or preview_mirror_hero_id == preview_hero_id):
			return {
				"preview": directive_preview,
				"source": "singleton_mirror",
				"heroId": preview_hero_id,
			}
		return _build_active_hero_directive_preview_fallback(active_hero_id, active_tactic)
	if preview_hero_id != "" and preview_hero_id == active_hero_id and (preview_mirror_hero_id == "" or preview_mirror_hero_id == active_hero_id):
		return {
			"preview": directive_preview,
			"source": "singleton_mirror",
			"heroId": preview_hero_id,
		}
	return _build_active_hero_directive_preview_fallback(active_hero_id, active_tactic)

func _build_active_hero_directive_preview_fallback(active_hero_id: String, active_tactic: String) -> Dictionary:
	return {
		"preview": {
			"heroId": active_hero_id,
			"tacticId": active_tactic,
			"status": "synced_from_active_hero",
			"summary": "当前武将沿权威 activeHero 与 tacticByHeroId 解析，待新的正式说明链回写。",
			"source": "hero_fallback_summary",
			"warnings": ["上一位武将的说明链不会再直接套用到当前武将。"],
			"nextSteps": ["如需要刷新权威说明链，可再次切换战法或编组当前武将。"],
		},
		"source": "hero_fallback_summary",
		"heroId": active_hero_id,
	}

func _read_target_faction_state() -> Dictionary:
	var raw_factions: Variant = _world_data.get("factions", {})
	if raw_factions is Dictionary and _target_faction_id != "":
		var faction_state: Variant = (raw_factions as Dictionary).get(_target_faction_id, {})
		if faction_state is Dictionary:
			return faction_state
	return {}

func _read_target_units() -> Array:
	var raw_units: Variant = _world_data.get("units", [])
	if not (raw_units is Array):
		return []
	var units: Array = []
	for item in raw_units as Array:
		if not (item is Dictionary):
			continue
		var unit: Dictionary = item as Dictionary
		if _target_faction_id != "" and str(unit.get("faction", "")).strip_edges() != _target_faction_id:
			continue
		units.append(unit)
	return units

func _resolve_hero_unit_info(hero_id: String) -> Dictionary:
	var normalized_hero_id := hero_id.strip_edges()
	if normalized_hero_id == "":
		return {}
	for unit_variant in _read_target_units():
		if not (unit_variant is Dictionary):
			continue
		var unit: Dictionary = unit_variant as Dictionary
		var unit_id := str(unit.get("id", "")).strip_edges()
		var tile_id := str(unit.get("tileId", "")).strip_edges()
		var corps: Dictionary = unit.get("corps", {}) as Dictionary
		var hero: Dictionary = unit.get("hero", {}) as Dictionary
		if _normalize_hero_id(str(hero.get("id", ""))) == normalized_hero_id:
			return {
				"deployed": true,
				"heroId": normalized_hero_id,
				"unitId": unit_id,
				"tileId": tile_id,
				"role": "主将",
				"hero_profile": hero.duplicate(true),
				"strength": int(unit.get("strength", 0)),
				"supply": int(unit.get("supply", 0)),
				"status": str(unit.get("status", "")),
				"current_task": str(unit.get("currentTask", "")),
				"corps_name": str(corps.get("name", "")),
				"readiness": int(corps.get("readiness", 0)),
			}
		var co_heroes_variant: Variant = unit.get("coHeroes", [])
		if not (co_heroes_variant is Array):
			continue
		for co_hero_variant in co_heroes_variant as Array:
			if not (co_hero_variant is Dictionary):
				continue
			var co_hero: Dictionary = co_hero_variant as Dictionary
			if _normalize_hero_id(str(co_hero.get("id", ""))) == normalized_hero_id:
				return {
					"deployed": true,
					"heroId": normalized_hero_id,
					"unitId": unit_id,
					"tileId": tile_id,
					"role": "副将",
					"hero_profile": co_hero.duplicate(true),
					"strength": int(unit.get("strength", 0)),
					"supply": int(unit.get("supply", 0)),
					"status": str(unit.get("status", "")),
					"current_task": str(unit.get("currentTask", "")),
					"corps_name": str(corps.get("name", "")),
					"readiness": int(corps.get("readiness", 0)),
				}
	return {
		"deployed": false,
		"heroId": normalized_hero_id,
		"unitId": "",
		"tileId": "",
		"role": "reserve",
	}

func _format_deployment_summary(unit_info: Dictionary, reserve_ids: Array) -> String:
	if unit_info.is_empty():
		return "待补位"
	if not bool(unit_info.get("deployed", false)):
		return "reserve / 待编组" if reserve_ids.has(str(unit_info.get("heroId", ""))) else "未编组 / 待补位"
	var role := str(unit_info.get("role", "主将")).strip_edges()
	var unit_id := str(unit_info.get("unitId", "")).strip_edges()
	var tile_id := str(unit_info.get("tileId", "")).strip_edges()
	var parts: Array[String] = [role]
	if unit_id != "":
		parts.append(unit_id)
	if tile_id != "":
		parts.append(tile_id)
	return "已编组 / %s" % " / ".join(parts)


func _display_or_fallback(value: Variant, fallback: String) -> String:
	var normalized := str(value).strip_edges()
	return normalized if normalized != "" else fallback

func _build_runtime_receipt_lines(runtime_context: Dictionary, active_hero_id: String, active_unit_info: Dictionary) -> Array:
	var action_receipt: Dictionary = runtime_context.get("action_receipt", {}) as Dictionary
	if not action_receipt.is_empty():
		var receipt_hero_id := str(action_receipt.get("hero_id", "")).strip_edges()
		var receipt_unit_id := str(action_receipt.get("unit_id", "")).strip_edges()
		var receipt_tactic_id := str(action_receipt.get("tactic_id", "")).strip_edges()
		var receipt_message := str(action_receipt.get("message", "")).strip_edges()
		var active_unit_id := str(active_unit_info.get("unitId", "")).strip_edges()
		var source_action := str(action_receipt.get("source_action", "")).strip_edges()
		var hero_matches := receipt_hero_id != "" and receipt_hero_id == active_hero_id
		var unit_matches := receipt_unit_id != "" and receipt_unit_id == active_unit_id
		if hero_matches or unit_matches or source_action == "setGeneralTactic" or source_action == "deployReserveHero":
			var hero_line := "英雄回执：%s / %s" % [
				_hero_label(receipt_hero_id if receipt_hero_id != "" else active_hero_id),
				_tactic_label(receipt_tactic_id) if receipt_tactic_id != "" else _resolve_receipt_action_label(source_action),
			]
			var unit_line := "部队回执：%s / %s" % [
				receipt_unit_id if receipt_unit_id != "" else _display_or_fallback(active_unit_info.get("unitId", ""), "未落到部队"),
				receipt_message if receipt_message != "" else "等待新的权威动作回执。",
			]
			return [hero_line, unit_line]
	var last_action := str(runtime_context.get("last_action", "none")).strip_edges()
	var last_status := str(runtime_context.get("last_action_status", "idle")).strip_edges()
	var last_tick := str(runtime_context.get("last_action_tick", "unknown")).strip_edges()
	return [
		"最近回执：%s / %s" % [last_action if last_action != "" else "none", last_status if last_status != "" else "idle"],
		"回执 tick：%s" % (last_tick if last_tick != "" else "unknown"),
	]


func _resolve_receipt_action_label(source_action: String) -> String:
	match source_action:
		"setGeneralTactic":
			return "战法已切换"
		"deployReserveHero":
			return "编组已完成"
		_:
			return source_action if source_action != "" else "动作已提交"
