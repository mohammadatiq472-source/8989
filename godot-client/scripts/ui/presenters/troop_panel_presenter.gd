extends RefCounted
class_name TroopPanelPresenter

var _world_data: Dictionary = {}
var _map_layout_data: Dictionary = {}
var _target_faction_id: String = ""

func configure(world_data: Dictionary, map_layout_data: Dictionary, target_faction_id: String) -> void:
	_world_data = world_data
	_map_layout_data = map_layout_data
	_target_faction_id = target_faction_id.strip_edges()

func build_snapshot(selected_troop_id: String, preferred_facility_id: String = "", runtime_context: Dictionary = {}) -> Dictionary:
	var troop_specs := build_troop_specs(runtime_context)
	var active_troop_id := _resolve_default_troop_id(troop_specs, selected_troop_id)
	var active_spec := _find_troop_spec_by_id(troop_specs, active_troop_id)
	var active_facility_id := _resolve_default_facility_id_from_troop_spec(active_spec, preferred_facility_id)
	return {
		"title": "部队面板",
		"subtitle": "五部队总览 / 单队编组 / 设施 / 建筑树 / 升级说明",
		"troopSpecs": troop_specs,
		"activeTroopId": active_troop_id,
		"activeFacilityId": active_facility_id,
	}

func build_overlay_payload(selected_troop_id: String, preferred_facility_id: String = "", runtime_context: Dictionary = {}) -> Dictionary:
	var snapshot := build_snapshot(selected_troop_id, preferred_facility_id, runtime_context)
	return {
		"snapshot": snapshot,
		"runtime_state_patch": _build_runtime_state_patch(snapshot),
	}

func build_troop_specs(runtime_context: Dictionary = {}) -> Array:
	var troop_specs: Array = []
	var units := _read_target_units()
	var faction_state := _read_target_faction_state()
	var ai_player_names := _build_ai_player_name_map(faction_state)
	var hero_command: Dictionary = faction_state.get("heroCommand", {}) as Dictionary
	var home_tile_id := str(hero_command.get("homeTileId", "")).strip_edges()
	var primary_cluster := _find_primary_city_cluster(_read_city_clusters(), home_tile_id)
	var limit := mini(units.size(), 5)
	for index in range(limit):
		var unit_variant: Variant = units[index]
		if not (unit_variant is Dictionary):
			continue
		var unit: Dictionary = unit_variant as Dictionary
		var corps: Dictionary = unit.get("corps", {}) as Dictionary
		var hero: Dictionary = unit.get("hero", {}) as Dictionary
		var co_heroes_variant: Variant = unit.get("coHeroes", [])
		var co_heroes: Array = co_heroes_variant as Array if co_heroes_variant is Array else []
		var troop_id := str(unit.get("id", "")).strip_edges()
		if troop_id == "":
			continue
		var corps_name := str(corps.get("name", "")).strip_edges()
		if corps_name == "":
			corps_name = str(unit.get("name", "")).strip_edges()
		if corps_name == "":
			corps_name = "未编组部队"
		var tile_id := str(unit.get("tileId", "")).strip_edges()
		var tile_name := _read_tile_name(tile_id)
		var hero_name := _format_primary_hero_label(hero)
		var ai_player_id := str(unit.get("aiPlayerId", "")).strip_edges()
		var ai_player_name := str(ai_player_names.get(ai_player_id, "")).strip_edges()
		var strength := int(unit.get("strength", 0))
		var supply := int(unit.get("supply", 0))
		var mobility := int(unit.get("mobility", 0))
		var status_label := _resolve_unit_status_copy(str(unit.get("status", "")))
		var subtitle_parts: Array[String] = []
		if hero_name != "":
			subtitle_parts.append(hero_name)
		if ai_player_name != "":
			subtitle_parts.append(ai_player_name)
		var subtitle := " | ".join(subtitle_parts)
		if subtitle == "":
			subtitle = "待命编组"
		var status_text := "%s | 兵力 %s | 补给 %s" % [
			status_label,
			str(strength),
			str(supply),
		]
		var task_text := str(unit.get("currentTask", "")).strip_edges()
		var description_lines: PackedStringArray = PackedStringArray()
		description_lines.append("位置：%s" % (tile_name if tile_name != "" else tile_id if tile_id != "" else "未定位"))
		if task_text != "":
			description_lines.append("任务：%s" % task_text)
		description_lines.append("机动：%s | 军团：%s" % [str(mobility), str(corps.get("specialty", "待定"))])
		var default_facility_entries := _build_troop_facility_specs_for_unit(unit, faction_state, hero_command, primary_cluster, tile_name)
		WorldStore.bootstrap_troop_facilities(troop_id, default_facility_entries)
		troop_specs.append({
			"id": troop_id,
			"label": corps_name,
			"subtitle": subtitle,
			"heroName": hero_name,
			"aiPlayerName": ai_player_name,
			"statusLabel": status_label,
			"statusText": status_text,
			"description": "\n".join(description_lines),
			"strength": strength,
			"strengthMax": _resolve_troop_strength_capacity(strength),
			"morale": _resolve_troop_morale_proxy(supply),
			"moraleMax": 100,
			"supply": supply,
			"mobility": mobility,
			"taskText": task_text,
			"camp": "大营：%s" % (hero_name if hero_name != "" else "待补"),
			"mid": "中军：%s" % _format_support_hero_label(co_heroes, 0),
			"front": "前锋：%s" % _format_support_hero_label(co_heroes, 1),
			"formationHint": "所在：%s | 任务：%s" % [
				tile_name if tile_name != "" else (tile_id if tile_id != "" else "未定位"),
				task_text if task_text != "" else "待命",
			],
			"facilityEntries": WorldStore.get_troop_facilities(troop_id),
			"enabled": true,
		})
		_apply_runtime_action_receipt_to_troop_spec(troop_specs[troop_specs.size() - 1] as Dictionary, runtime_context)
	return troop_specs


func _resolve_troop_strength_capacity(strength: int) -> int:
	var normalized := maxi(strength, 0)
	if normalized <= 10000:
		return 10000
	if normalized <= 20000:
		return 20000
	if normalized <= 30000:
		return 30000
	return int(ceil(float(normalized) / 5000.0) * 5000.0)


func _resolve_troop_morale_proxy(supply: int) -> int:
	var normalized := maxi(supply, 0)
	if normalized <= 100:
		return clampi(normalized, 0, 100)
	return clampi(int(round(float(normalized) / 10.0)), 0, 100)


func _apply_runtime_action_receipt_to_troop_spec(spec: Dictionary, runtime_context: Dictionary) -> void:
	if spec.is_empty():
		return
	var action_receipt: Dictionary = runtime_context.get("action_receipt", {}) as Dictionary
	if action_receipt.is_empty():
		return
	var troop_id := str(spec.get("id", "")).strip_edges()
	var receipt_unit_id := str(action_receipt.get("unit_id", "")).strip_edges()
	if troop_id == "" or receipt_unit_id == "" or troop_id != receipt_unit_id:
		return
	var receipt_message := str(action_receipt.get("message", "")).strip_edges()
	var receipt_hero_id := str(action_receipt.get("hero_id", "")).strip_edges()
	var receipt_tactic_id := str(action_receipt.get("tactic_id", "")).strip_edges()
	var source_action := str(action_receipt.get("source_action", "")).strip_edges()
	var receipt_status := _resolve_troop_receipt_status(source_action, receipt_tactic_id)
	var existing_status_text := str(spec.get("statusText", "")).strip_edges()
	if receipt_status != "":
		spec["statusText"] = "%s | %s" % [existing_status_text, receipt_status] if existing_status_text != "" else receipt_status
	var description_text := str(spec.get("description", "")).strip_edges()
	var description_lines := PackedStringArray()
	if description_text != "":
		description_lines.append_array(description_text.split("\n"))
	description_lines.append("武将回执：%s" % (receipt_hero_id if receipt_hero_id != "" else "当前武将"))
	if receipt_message != "":
		description_lines.append("权威结果：%s" % receipt_message)
	spec["description"] = "\n".join(description_lines)
	var formation_hint := str(spec.get("formationHint", "")).strip_edges()
	var receipt_hint := "最近回执：%s" % receipt_status if receipt_status != "" else "最近回执已写入当前部队"
	spec["formationHint"] = "%s | %s" % [formation_hint, receipt_hint] if formation_hint != "" else receipt_hint


func _resolve_troop_receipt_status(source_action: String, tactic_id: String) -> String:
	match source_action:
		"setGeneralTactic":
			return "战法同步 %s" % _resolve_tactic_label(tactic_id)
		"deployReserveHero":
			return "最新编组完成"
		_:
			return "最近动作已同步"


func _resolve_tactic_label(tactic_id: String) -> String:
	match tactic_id:
		"guard":
			return "驻守"
		"logistics":
			return "后勤"
		_:
			return "先锋"

func _build_runtime_state_patch(snapshot: Dictionary) -> Dictionary:
	return {
		"active_troop_panel_unit_id": str(snapshot.get("activeTroopId", "")).strip_edges(),
		"active_troop_panel_facility_id": str(snapshot.get("activeFacilityId", "")).strip_edges(),
	}

func _build_troop_facility_specs_for_unit(
	unit: Dictionary,
	faction_state: Dictionary,
	hero_command: Dictionary,
	primary_cluster: Dictionary,
	tile_name: String
) -> Array:
	var corps: Dictionary = unit.get("corps", {}) as Dictionary
	var co_heroes_variant: Variant = unit.get("coHeroes", [])
	var co_heroes: Array = co_heroes_variant as Array if co_heroes_variant is Array else []
	var troop_label := str(corps.get("name", unit.get("name", "当前部队"))).strip_edges()
	if troop_label == "":
		troop_label = "当前部队"
	var troop_status := _resolve_unit_status_copy(str(unit.get("status", "")))
	var troop_task := str(unit.get("currentTask", "")).strip_edges()
	var troop_hint := "%s · %s" % [troop_label, troop_status]
	var tech_levels: Dictionary = primary_cluster.get("techLevels", {}) as Dictionary
	var governance_level := maxi(1, int(tech_levels.get("governance", 0)))
	var logistics_level := maxi(1, int(tech_levels.get("logistics", 0)))
	var defense_level := maxi(1, int(tech_levels.get("defense", 0)))
	var recruitment_level := maxi(1, int(tech_levels.get("recruitment", 0)))
	var command_limit := maxi(1, int(hero_command.get("commandLimit", 1)))
	var support_hero_count := mini(co_heroes.size(), 2)
	var hero_slot_count := 1 + support_hero_count
	var strength := int(unit.get("strength", 0))
	var supply := int(unit.get("supply", 0))
	var mobility := int(unit.get("mobility", 0))
	var action_points := int(faction_state.get("actionPoints", 0))
	var food := int(faction_state.get("food", 0))
	var wood := int(faction_state.get("wood", 0))
	var stone := int(faction_state.get("stone", 0))
	var iron := int(faction_state.get("iron", 0))
	var recruit_cooldown := int(faction_state.get("recruitCooldown", 0))
	var position_label := tile_name if tile_name != "" else str(unit.get("tileId", "未定位"))
	var training_ready := wood >= 180 and stone >= 120 and action_points >= 1
	var recruit_ready := food >= 240 and wood >= 100 and action_points >= 1 and recruit_cooldown <= 0
	var command_ready := stone >= 180 and iron >= 160 and action_points >= 2
	var support_ready := wood >= 140 and iron >= 110 and action_points >= 1
	var training_level := maxi(1, governance_level + support_hero_count)
	var recruit_level := maxi(1, recruitment_level + int(round(float(strength) / 150.0)))
	var command_level := maxi(1, defense_level + int(round(float(command_limit) / 2.0)))
	var support_level := maxi(1, logistics_level + int(round(float(supply) / 30.0)))
	var queue_label := troop_task if troop_task != "" else "待命编组"
	var training_status := "可升级" if training_ready else "资源不足"
	var recruit_status := "可补员" if recruit_ready else ("冷却 %s" % str(recruit_cooldown) if recruit_cooldown > 0 else "资源不足")
	var command_status := "可扩编" if command_ready else "资源不足"
	var support_status := "可整备" if support_ready else "资源不足"
	return [
		{
			"id": "training_ground",
			"label": "校场",
			"subtitle": "操练",
			"statusText": "Lv %s | %s" % [str(training_level), training_status],
			"description": "%s 当前位于 %s，承接 %s 的编组、操练和战法配位。" % [troop_hint, position_label, queue_label],
			"treeTitle": "校场建筑树",
			"treeItems": [
				_build_troop_facility_tree_item("training_ground_base", "基础校场", training_level, training_level + 1, training_status, "编组位 %s / 3 | 命令上限 %s" % [str(hero_slot_count), str(command_limit)], "基础校场用于稳定三武将编组和日常操练节奏。", "校场基础项", "当前 %s 已编入 %s 个武将位，下一次升级会强化编组稳定和操练效率。" % [troop_label, str(hero_slot_count)], "木 180 | 石 120 | 令 1", "编组稳定 +1 | 操练效率 +1", "升级校场", "稍后处理", training_ready),
				_build_troop_facility_tree_item("training_drill", "兵种操演", governance_level, governance_level + 1, "补给 %s | %s" % [str(supply), "可推进" if action_points >= 1 else "令不足"], "位置 %s" % position_label, "兵种操演用于提升当前编队的训练完成度与配合度。", "操演项", "当前补给为 %s，升级后会提升操练节奏并强化部队在 %s 的驻扎稳定。" % [str(supply), position_label], "粮 120 | 木 90 | 令 1", "操练效率 +1 | 编队稳定 +1", "开始操演", "返回", action_points >= 1),
			],
			"sheetTitle": "校场",
			"sheetSubtitle": "%s · 校场说明" % troop_label,
			"sheetBody": "校场用于处理当前部队的编组、操练和兵种训练。当前状态：%s，任务：%s。" % [troop_status, queue_label],
			"costSummary": "木 180 | 石 120 | 令 1",
			"effectSummary": "编组位 %s / 3 | 操练效率 %s" % [str(hero_slot_count), str(training_level)],
			"primaryActionLabel": "升级校场",
			"secondaryActionLabel": "返回部队",
		},
		{
			"id": "recruit_station",
			"label": "募兵所",
			"subtitle": "征兵",
			"statusText": "Lv %s | %s" % [str(recruit_level), recruit_status],
			"description": "募兵所负责 %s 的征兵、补员和预备兵处理，当前兵力 %s。" % [troop_hint, str(strength)],
			"treeTitle": "募兵所建筑树",
			"treeItems": [
				_build_troop_facility_tree_item("recruit_station_base", "基础募兵所", recruit_level, recruit_level + 1, recruit_status, "兵力 %s | 募兵技 %s" % [str(strength), str(recruitment_level)], "基础募兵所用于稳定征兵节奏和兵力补员。", "募兵基础项", "当前兵力 %s，下一次升级会缩短补员周期并提高预备兵周转。" % str(strength), "粮 240 | 木 100 | 令 1", "补员效率 +1 | 伤兵回补 +1", "升级募兵所", "稍后处理", recruit_ready),
				_build_troop_facility_tree_item("reserve_camp", "预备兵营", logistics_level, logistics_level + 1, "冷却 %s | %s" % [str(recruit_cooldown), "可推进" if recruit_ready else "待恢复"], "补给 %s | 行军 %s" % [str(supply), str(mobility)], "预备兵营为当前部队提供更快的战前补位和预备兵储备。", "预备兵营", "当前募兵冷却为 %s，升级后会提升预备兵储量并强化战前整补。" % str(recruit_cooldown), "粮 300 | 铁 120 | 令 2", "预备兵上限 +1 | 整补速度 +1", "扩建兵营", "返回", food >= 300 and iron >= 120 and action_points >= 2),
			],
			"sheetTitle": "募兵所",
			"sheetSubtitle": "%s · 募兵说明" % troop_label,
			"sheetBody": "募兵所用于处理当前部队的补员、伤兵与预备兵储备。当前冷却：%s。" % str(recruit_cooldown),
			"costSummary": "粮 240 | 木 100 | 令 1",
			"effectSummary": "兵力 %s | 募兵技 %s" % [str(strength), str(recruitment_level)],
			"primaryActionLabel": "升级募兵所",
			"secondaryActionLabel": "返回部队",
		},
		{
			"id": "command_hall",
			"label": "统帅厅",
			"subtitle": "统率",
			"statusText": "Lv %s | %s" % [str(command_level), command_status],
			"description": "统帅厅负责 %s 的统率扩编、前锋位与编制上限。" % troop_hint,
			"treeTitle": "统帅厅建筑树",
			"treeItems": [
				_build_troop_facility_tree_item("command_hall_base", "基础统帅厅", command_level, command_level + 1, command_status, "命令上限 %s | 支援位 %s" % [str(command_limit), str(support_hero_count)], "基础统帅厅用于稳定主将统率与队伍编制。", "统帅厅基础项", "当前命令上限 %s，升级后会提升编制冗余并稳定前锋位。" % str(command_limit), "石 180 | 铁 160 | 令 2", "统率上限 +1 | 编制稳定", "升级统帅厅", "稍后处理", command_ready),
				_build_troop_facility_tree_item("frontline_slot", "前锋扩编", support_hero_count + 1, support_hero_count + 2, "%s | %s" % [troop_status, "可推进" if command_ready else "资源不足"], "前锋位 %s / 1" % ("已解锁" if support_hero_count >= 1 else "待解锁"), "前锋扩编用于优化三武将编队的前锋位和整体编制能力。", "前锋扩编", "当前支援位数量为 %s，升级后会进一步强化三武将编组的编制弹性。" % str(support_hero_count), "石 200 | 铁 180 | 令 2", "前锋位稳定 | 编队上限说明强化", "开始扩编", "返回", command_ready),
			],
			"sheetTitle": "统帅厅",
			"sheetSubtitle": "%s · 统率说明" % troop_label,
			"sheetBody": "统帅厅用于处理前锋位、编制和统率上限。当前命令上限 %s。" % str(command_limit),
			"costSummary": "石 180 | 铁 160 | 令 2",
			"effectSummary": "统率上限 %s | 前锋位 %s" % [str(command_limit), str(support_hero_count)],
			"primaryActionLabel": "升级统帅厅",
			"secondaryActionLabel": "返回部队",
		},
		{
			"id": "support_structures",
			"label": "其他建筑项",
			"subtitle": "后勤",
			"statusText": "Lv %s | %s" % [str(support_level), support_status],
			"description": "其他建筑项承接 %s 相关的辎重、营门和后勤支援。" % troop_hint,
			"treeTitle": "其他建筑项",
			"treeItems": [
				_build_troop_facility_tree_item("supply_camp", "辎重营", support_level, support_level + 1, "补给 %s | %s" % [str(supply), support_status], "机动 %s | 后勤技 %s" % [str(mobility), str(logistics_level)], "辎重营用于保障当前部队的补给稳定和后勤调度。", "辎重营", "当前补给为 %s，升级后会增强战线续航并改善后勤回补。" % str(supply), "木 140 | 铁 110 | 令 1", "补给稳定 +1 | 后勤恢复 +1", "扩建辎重营", "返回", support_ready),
				_build_troop_facility_tree_item("signal_tower", "鼓角台", defense_level, defense_level + 1, "机动 %s | %s" % [str(mobility), "可推进" if action_points >= 1 else "令不足"], "当前任务 %s" % queue_label, "鼓角台用于提升当前部队的调度清晰度和命令传达效率。", "鼓角台", "当前任务为 %s，升级后会提升调度节奏和命令同步效率。" % queue_label, "木 120 | 石 90 | 令 1", "调度效率 +1 | 命令同步 +1", "升级鼓角台", "返回", action_points >= 1),
			],
			"sheetTitle": "其他建筑项",
			"sheetSubtitle": "%s · 军备说明" % troop_label,
			"sheetBody": "其他建筑项用于承接辎重、鼓角和其他军备支援。当前位置：%s。" % position_label,
			"costSummary": "木 140 | 铁 110 | 令 1",
			"effectSummary": "补给 %s | 后勤技 %s" % [str(supply), str(logistics_level)],
			"primaryActionLabel": "升级军备",
			"secondaryActionLabel": "返回部队",
		},
	]

func _build_troop_facility_tree_item(
	building_id: String,
	label: String,
	current_level: int,
	next_level: int,
	status_text: String,
	meta_text: String,
	description: String,
	sheet_subtitle: String,
	sheet_body: String,
	cost_summary: String,
	effect_summary: String,
	primary_action_label: String,
	secondary_action_label: String,
	enabled: bool
) -> Dictionary:
	return {
		"id": building_id,
		"label": label,
		"levelText": "Lv.%s -> Lv.%s" % [str(current_level), str(next_level)],
		"statusText": status_text,
		"meta": meta_text,
		"description": description,
		"sheetSubtitle": sheet_subtitle,
		"sheetBody": sheet_body,
		"costSummary": cost_summary,
		"effectSummary": effect_summary,
		"primaryActionLabel": primary_action_label,
		"secondaryActionLabel": secondary_action_label,
		"enabled": enabled,
	}

func _build_ai_player_name_map(faction_state: Dictionary) -> Dictionary:
	var ai_player_name_map: Dictionary = {}
	var ai_players_variant: Variant = faction_state.get("aiPlayers", [])
	if not (ai_players_variant is Array):
		return ai_player_name_map
	for ai_player_variant in ai_players_variant as Array:
		if not (ai_player_variant is Dictionary):
			continue
		var ai_player: Dictionary = ai_player_variant as Dictionary
		var ai_player_id := str(ai_player.get("id", "")).strip_edges()
		if ai_player_id == "":
			continue
		ai_player_name_map[ai_player_id] = str(ai_player.get("name", "AI分队"))
	return ai_player_name_map

func _format_primary_hero_label(hero: Dictionary) -> String:
	var hero_title := str(hero.get("title", "")).strip_edges()
	var hero_name := str(hero.get("name", "")).strip_edges()
	if hero_title != "" and hero_name != "":
		return "%s%s" % [hero_title, hero_name]
	if hero_name != "":
		return hero_name
	return ""

func _format_support_hero_label(co_heroes: Array, index: int) -> String:
	if index < 0 or index >= co_heroes.size():
		return "待补"
	var hero_variant: Variant = co_heroes[index]
	if not (hero_variant is Dictionary):
		return "待补"
	var hero: Dictionary = hero_variant as Dictionary
	var hero_name := str(hero.get("name", "")).strip_edges()
	if hero_name == "":
		return "待补"
	return hero_name

func _resolve_unit_status_copy(status_id: String) -> String:
	match status_id.strip_edges().to_lower():
		"marching", "moving":
			return "行军"
		"engaged", "battle":
			return "交战"
		"fallback", "retreat":
			return "回撤"
		"escort":
			return "护送"
		"guard", "garrison", "defend":
			return "驻守"
		"support":
			return "支援"
		"idle", "":
			return "待命"
		_:
			return status_id

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
	var target_units: Array = []
	for unit_variant in raw_units as Array:
		if not (unit_variant is Dictionary):
			continue
		var unit: Dictionary = unit_variant as Dictionary
		if _target_faction_id != "" and str(unit.get("faction", "")).strip_edges() != _target_faction_id:
			continue
		target_units.append(unit)
	return target_units

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
	for item in city_clusters:
		var cluster: Dictionary = item as Dictionary
		if str(cluster.get("centerTileId", "")) == home_tile_id or str(cluster.get("cityHallTileId", "")) == home_tile_id:
			return cluster
		var tile_ids: Variant = cluster.get("tileIds", [])
		if tile_ids is Array and home_tile_id in (tile_ids as Array):
			return cluster
	for item in city_clusters:
		var cluster: Dictionary = item as Dictionary
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
		for item in candidate:
			var tile: Dictionary = item as Dictionary
			if str(tile.get("id", "")) == tile_id:
				return str(tile.get("name", ""))
	return ""

func _resolve_default_troop_id(troop_specs: Array, preferred_troop_id: String) -> String:
	var resolved_preferred := preferred_troop_id.strip_edges()
	if resolved_preferred != "":
		for raw_spec in troop_specs:
			if not (raw_spec is Dictionary):
				continue
			var spec: Dictionary = raw_spec as Dictionary
			if str(spec.get("id", "")).strip_edges() == resolved_preferred:
				return resolved_preferred
	for raw_spec in troop_specs:
		if not (raw_spec is Dictionary):
			continue
		var spec: Dictionary = raw_spec as Dictionary
		var troop_id := str(spec.get("id", "")).strip_edges()
		if troop_id != "":
			return troop_id
	return ""

func _find_troop_spec_by_id(troop_specs: Array, troop_id: String) -> Dictionary:
	for raw_spec in troop_specs:
		if not (raw_spec is Dictionary):
			continue
		var spec: Dictionary = raw_spec as Dictionary
		if str(spec.get("id", "")).strip_edges() == troop_id:
			return spec
	return {}

func _resolve_default_facility_id_from_troop_spec(active_spec: Dictionary, preferred_facility_id: String = "") -> String:
	var resolved_preferred := preferred_facility_id.strip_edges()
	var facility_entries_variant: Variant = active_spec.get("facilityEntries", [])
	if not (facility_entries_variant is Array):
		return ""
	var facility_entries: Array = facility_entries_variant as Array
	if resolved_preferred != "":
		for raw_entry in facility_entries:
			var facility_entry: Dictionary = raw_entry if raw_entry is Dictionary else {}
			if str(facility_entry.get("id", "")).strip_edges() == resolved_preferred:
				return resolved_preferred
	for raw_entry in facility_entries:
		var facility_entry: Dictionary = raw_entry if raw_entry is Dictionary else {}
		var facility_id := str(facility_entry.get("id", "")).strip_edges()
		if facility_id != "":
			return facility_id
	return ""
