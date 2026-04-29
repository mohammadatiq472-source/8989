extends RefCounted
class_name InternalAffairsPresenter

var _world_data: Dictionary = {}
var _map_layout_data: Dictionary = {}
var _target_faction_id: String = ""

func configure(world_data: Dictionary, map_layout_data: Dictionary, target_faction_id: String) -> void:
	_world_data = world_data
	_map_layout_data = map_layout_data
	_target_faction_id = target_faction_id.strip_edges()

func build_snapshot() -> Dictionary:
	return _build_snapshot_bundle().get("snapshot", {}) as Dictionary

func build_overlay_payload() -> Dictionary:
	var snapshot_bundle := _build_snapshot_bundle()
	return {
		"snapshot": snapshot_bundle.get("snapshot", {}) as Dictionary,
		"runtime_state_patch": _build_runtime_state_patch(snapshot_bundle),
	}

func _build_snapshot_bundle() -> Dictionary:
	var faction_state := _read_target_faction_state()
	var hero_command: Dictionary = faction_state.get("heroCommand", {}) as Dictionary
	var city_clusters := _read_city_clusters()
	var home_tile_id := str(hero_command.get("homeTileId", ""))
	var primary_cluster := _find_primary_city_cluster(city_clusters, home_tile_id)
	var tech_levels: Dictionary = primary_cluster.get("techLevels", {}) as Dictionary
	var city_name := str(primary_cluster.get("name", "")).strip_edges()
	var captured_cities: Array = faction_state.get("capturedCities", []) as Array
	if city_name == "":
		city_name = _read_tile_name(home_tile_id)
	if city_name == "":
		city_name = "主城待识别"
	var city_state_id := _build_city_state_id(home_tile_id, city_name)
	var default_building_groups := _build_city_building_groups(primary_cluster, faction_state, hero_command)
	var default_affairs_queue := _build_governance_queue(primary_cluster, faction_state, hero_command, city_name)
	WorldStore.bootstrap_city_building_groups(city_state_id, default_building_groups)
	WorldStore.bootstrap_affairs_queue(city_state_id, default_affairs_queue)
	var building_groups := WorldStore.get_city_building_groups(city_state_id)
	var affairs_queue := WorldStore.get_affairs_queue(city_state_id)
	var development_points := int(hero_command.get("developmentPoints", 0))
	var order := int(faction_state.get("actionPoints", 0))
	var food := int(faction_state.get("food", 0))
	var gold := int(faction_state.get("gold", 0))
	var wood := int(faction_state.get("wood", 0))
	var stone := int(faction_state.get("stone", 0))
	var iron := int(faction_state.get("iron", 0))
	var logistics := int(tech_levels.get("logistics", 0))
	var defense := int(tech_levels.get("defense", 0))
	var recruitment := int(tech_levels.get("recruitment", 0))
	var governance := int(tech_levels.get("governance", 0))
	var recruit_cooldown := int(faction_state.get("recruitCooldown", 0))
	var section_payloads := _build_section_payloads(
		city_name,
		home_tile_id,
		development_points,
		order,
		food,
		gold,
		wood,
		stone,
		iron,
		logistics,
		defense,
		recruitment,
		governance,
		captured_cities.size(),
		recruit_cooldown,
		affairs_queue
	)
	return {
		"city_state_id": city_state_id,
		"snapshot": {
			"city_name": city_name,
			"home_tile_id": home_tile_id,
			"development_points": development_points,
			"food": food,
			"gold": gold,
			"wood": wood,
			"stone": stone,
			"iron": iron,
			"order": order,
			"logistics": logistics,
			"defense": defense,
			"recruitment": recruitment,
			"governance": governance,
			"captured_city_count": captured_cities.size(),
			"recruit_cooldown": recruit_cooldown,
			"tech_levels": tech_levels,
			"building_groups": building_groups,
			"affairs_queue": affairs_queue,
			"section_payloads": section_payloads,
			"summary_note": "内政已升级为正式 Presenter，并开始接入城市建筑树与政务队列。",
		},
	}

func _build_runtime_state_patch(snapshot_bundle: Dictionary) -> Dictionary:
	return {
		"active_city_state_id": str(snapshot_bundle.get("city_state_id", "")).strip_edges(),
	}

func _build_city_state_id(home_tile_id: String, city_name: String) -> String:
	var resolved_home_tile_id := home_tile_id.strip_edges()
	if resolved_home_tile_id != "":
		return resolved_home_tile_id
	var resolved_city_name := city_name.strip_edges()
	if resolved_city_name != "":
		return resolved_city_name
	return "primary_city"

func _build_city_building_groups(primary_cluster: Dictionary, faction_state: Dictionary, hero_command: Dictionary) -> Dictionary:
	var tech_levels: Dictionary = primary_cluster.get("techLevels", {}) as Dictionary
	var governance_level := maxi(1, int(tech_levels.get("governance", 0)))
	var logistics_level := maxi(1, int(tech_levels.get("logistics", 0)))
	var defense_level := maxi(1, int(tech_levels.get("defense", 0)))
	var recruitment_level := maxi(1, int(tech_levels.get("recruitment", 0)))
	var development_points := int(hero_command.get("developmentPoints", 0))
	var action_points := int(faction_state.get("actionPoints", 0))
	var food := int(faction_state.get("food", 0))
	var wood := int(faction_state.get("wood", 0))
	var stone := int(faction_state.get("stone", 0))
	var iron := int(faction_state.get("iron", 0))
	return {
		"market": {
			"treeTitle": "市井建筑树",
			"treeItems": [
				_build_city_building_item("market_plaza", "市井", governance_level + 1, governance_level + 2, "经营中" if action_points >= 1 else "军令不足", "开发点 %s | 行令 %s" % [str(development_points), str(action_points)], "市井承接主城经营、交易入口和基础收益，是内政域的正式经济锚点。", "市井升级单", "当前开发点为 %s，升级后会提高主城经营上限并强化资源转化能力。" % str(development_points), "木 220 | 石 140 | 令 1", "经营收益 +1 | 主城入口稳定", "扩建市井", "稍后处理", wood >= 220 and stone >= 140 and action_points >= 1),
				_build_city_building_item("granary", "仓廪", logistics_level + 1, logistics_level + 2, "粮 %s | %s" % [str(food), "可扩仓" if food >= 260 else "粮不足"], "后勤技 %s" % str(logistics_level), "仓廪用于承接主城粮草、仓储和持续经营的资源缓冲。", "仓廪升级单", "当前粮草储量为 %s，升级后会提高主城仓储与转运冗余。" % str(food), "粮 260 | 木 120 | 令 1", "仓储容量 +1 | 粮草缓冲 +1", "扩建仓廪", "返回", food >= 260 and wood >= 120 and action_points >= 1),
				_build_city_building_item("workshop", "作坊", maxi(governance_level, logistics_level), maxi(governance_level, logistics_level) + 1, "木 %s | 石 %s" % [str(wood), str(stone)], "经营技 %s" % str(governance_level), "作坊负责主城建设物资与日常经营加工，是城市建筑树里的基础工业节点。", "作坊升级单", "升级后会改善主城建设物资转换，支撑后续税收与政务链。", "木 180 | 石 180 | 令 1", "建设周转 +1 | 经营转换 +1", "升级作坊", "返回", wood >= 180 and stone >= 180 and action_points >= 1),
			],
		},
		"tax": {
			"treeTitle": "税收建筑树",
			"treeItems": [
				_build_city_building_item("tax_office", "田赋司", governance_level, governance_level + 1, "木 %s | 可征收" % str(wood), "治理 %s | 开发点 %s" % [str(governance_level), str(development_points)], "田赋司负责城内税率、回收和主城财政节奏。", "田赋司升级单", "升级后会提升主城税收冗余，并降低战时财政波动。", "木 160 | 石 120 | 令 1", "财政回收 +1 | 收入稳定 +1", "升级田赋司", "稍后处理", wood >= 160 and stone >= 120 and action_points >= 1),
				_build_city_building_item("storage_bureau", "仓储司", logistics_level, logistics_level + 1, "粮 %s | 铁 %s" % [str(food), str(iron)], "后勤 %s" % str(logistics_level), "仓储司承接仓储调拨、资源回流和税收后的统仓管理。", "仓储司升级单", "升级后会提高税收沉淀后的资源回流效率，并支撑后续政务调拨。", "粮 180 | 铁 140 | 令 1", "仓储周转 +1 | 资源调拨 +1", "升级仓储司", "返回", food >= 180 and iron >= 140 and action_points >= 1),
				_build_city_building_item("relay_station", "转运站", maxi(logistics_level, defense_level), maxi(logistics_level, defense_level) + 1, "石 %s | 铁 %s" % [str(stone), str(iron)], "后勤 %s / 防务 %s" % [str(logistics_level), str(defense_level)], "转运站负责税收、仓储和战时物资在城市域中的横向调拨。", "转运站升级单", "升级后会改善主城对外调拨效率，让财政与军备不再完全割裂。", "石 160 | 铁 160 | 令 1", "调拨效率 +1 | 回流稳定 +1", "升级转运站", "返回", stone >= 160 and iron >= 160 and action_points >= 1),
			],
		},
		"policy": {
			"treeTitle": "政策建筑树",
			"treeItems": [
				_build_city_building_item("policy_hall", "政令台", governance_level, governance_level + 1, "治理 %s | %s" % [str(governance_level), "可推演" if development_points >= 1 else "开发点不足"], "开发点 %s" % str(development_points), "政令台承接发展、治理与主城长期规划，是政策域的主入口。", "政令台升级单", "升级后会提升政令推演能力，并增加长期治理弹性。", "木 150 | 石 150 | 令 1", "治理效率 +1 | 政令容量 +1", "升级政令台", "稍后处理", development_points >= 1 and wood >= 150 and stone >= 150 and action_points >= 1),
				_build_city_building_item("recruit_policy_board", "募兵令", recruitment_level, recruitment_level + 1, "募兵技 %s" % str(recruitment_level), "粮 %s | 铁 %s" % [str(food), str(iron)], "募兵令用于协调内政域与部队域之间的征兵政策，而不是替代部队面板。", "募兵令升级单", "升级后会改善征兵批次、补员效率和与部队域的联动质量。", "粮 220 | 铁 120 | 令 1", "征兵效率 +1 | 政策联动 +1", "升级募兵令", "返回", food >= 220 and iron >= 120 and action_points >= 1),
				_build_city_building_item("defense_board", "守备司", defense_level, defense_level + 1, "防务技 %s" % str(defense_level), "石 %s | 铁 %s" % [str(stone), str(iron)], "守备司负责主城防务、驻守优先级和内政域的战备策略。", "守备司升级单", "升级后会强化主城防线策略，并提高驻守与补给联动效果。", "石 200 | 铁 180 | 令 1", "防务效率 +1 | 驻守稳定 +1", "升级守备司", "返回", stone >= 200 and iron >= 180 and action_points >= 1),
			],
		},
	}

func _build_city_building_item(
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

func _build_governance_queue(
	primary_cluster: Dictionary,
	faction_state: Dictionary,
	hero_command: Dictionary,
	city_name: String
) -> Array:
	var tech_levels: Dictionary = primary_cluster.get("techLevels", {}) as Dictionary
	var governance_level := maxi(1, int(tech_levels.get("governance", 0)))
	var defense_level := maxi(1, int(tech_levels.get("defense", 0)))
	var recruitment_level := maxi(1, int(tech_levels.get("recruitment", 0)))
	var development_points := int(hero_command.get("developmentPoints", 0))
	var recruit_cooldown := int(faction_state.get("recruitCooldown", 0))
	var captured_cities: Array = faction_state.get("capturedCities", []) as Array
	var ai_players: Array = faction_state.get("aiPlayers", []) as Array
	var action_points := int(faction_state.get("actionPoints", 0))
	return [
		{"id": "queue_market_upgrade", "label": "市井扩建", "statusText": "待处理" if action_points >= 1 else "军令不足", "description": "%s 当前开发点 %s，市井扩建被列为主城经营的第一优先级。" % [city_name, str(development_points)]},
		{"id": "queue_tax_upgrade", "label": "税务整编", "statusText": "待处理" if action_points >= 1 else "军令不足", "description": "税收域升级已纳入主城政务队列，用于承接税务司、税路与仓储侧的城市治理推进。"},
		{"id": "queue_recruit_batch", "label": "募兵批次", "statusText": "冷却 %s" % str(recruit_cooldown) if recruit_cooldown > 0 else "可入队", "description": "募兵技 %s，当前征兵冷却 %s，后续与部队域募兵所保持联动但不混层级。" % [str(recruitment_level), str(recruit_cooldown)]},
		{"id": "queue_defense_ready", "label": "城防整备", "statusText": "进行中" if defense_level >= 2 else "待强化", "description": "防务等级 %s，已占城池 %s，政务队列需要为主城和已占点准备守备节奏。" % [str(defense_level), str(captured_cities.size())]},
		{"id": "queue_ai_dispatch", "label": "协同委任", "statusText": "待分配" if ai_players.size() > 0 else "暂无对象", "description": "当前 AI 玩家数 %s，政务队列用于给 AI 协同与城市域职责分配预留执行位。" % str(ai_players.size())},
		{"id": "queue_policy_review", "label": "政策复盘", "statusText": "治理 %s" % str(governance_level), "description": "治理等级 %s，政令台与守备司升级后需要回写到下一轮政策复盘。" % str(governance_level)},
	]


func _build_section_payloads(
	city_name: String,
	home_tile_id: String,
	development_points: int,
	order: int,
	food: int,
	gold: int,
	wood: int,
	stone: int,
	iron: int,
	logistics: int,
	defense: int,
	recruitment: int,
	governance: int,
	captured_city_count: int,
	recruit_cooldown: int,
	affairs_queue: Array
) -> Dictionary:
	var recruit_queue_item := _find_affair_queue_item(affairs_queue, "queue_recruit_batch")
	var defense_queue_item := _find_affair_queue_item(affairs_queue, "queue_defense_ready")
	var dispatch_queue_item := _find_affair_queue_item(affairs_queue, "queue_ai_dispatch")
	var policy_review_queue_item := _find_affair_queue_item(affairs_queue, "queue_policy_review")
	return {
		"market": {
			"economy": {
				"summary_lines": [
					"收益页已切到显式经济 card + 收益说明 block。",
					"市井收益当前按主城资源池、开发点和军令状态组织展示。",
				],
				"list_title": "收益卡片",
				"item_cards": [
					_build_section_item_card("财政收益", "铜钱 %s" % str(gold), "军令 %s" % str(order), "主城经营和税务沉淀先在这里汇总。"),
					_build_section_item_card("粮草补充", "粮 %s" % str(food), "募兵冷却 %s" % str(recruit_cooldown), "收益页继续作为募兵与经营共用的粮草视角。"),
					_build_section_item_card("建设转化", "木 %s / 石 %s" % [str(wood), str(stone)], "开发点 %s" % str(development_points), "建设类资源先并到经济收益层。"),
					_build_section_item_card("军备支撑", "铁 %s" % str(iron), "已占城池 %s" % str(captured_city_count), "收益页保留军备和扩张成本的结构位。"),
				],
				"content_blocks": [
					_build_section_text_block(
						"收益摘要",
						[
							"收益页用于承接内政内的经济相关信息。",
							"当前主城 %s 先按资源结构、产出和加成来源固定 child-page 合同。" % city_name,
						],
						"InteriorMarketEconomySummaryBlock"
					),
					_build_section_text_block(
						"经营提示",
						[
							"治理 %s / 后勤 %s，当前收益结构会同时影响仓储、税收和募兵节奏。" % [str(governance), str(logistics)],
							"后续可继续扩展为统计图或更细的收益来源拆分。",
						],
						"InteriorMarketEconomyHintBlock"
					),
					_build_static_section_boundary_block(
						"market/overview",
						"市井总览 / 城市建筑树",
						"收益页当前仍以资源状态卡和摘要块为主，还不到独立收益 scene 的复杂度。",
						"InteriorMarketEconomyBoundaryBlock"
					),
				],
			},
			"routing": {
				"summary_lines": [
					"动线页已切到显式入口 card + 路径说明 block。",
					"当前主城入口关系先固定在市井 child-page 壳内，不单独拉预览页。",
				],
				"list_title": "入口路径卡",
				"item_cards": [
					_build_section_item_card("主城首页", city_name, "homeTile %s" % (home_tile_id if home_tile_id != "" else "未定位"), "作为内政和市井返回链的顶层入口。"),
					_build_section_item_card("城建入口", "建筑树", "开发点 %s" % str(development_points), "后续继续连接城市建筑树与升级单。"),
					_build_section_item_card("队列入口", "%s 项政务" % str(affairs_queue.size()), "军令 %s" % str(order), "当前先把队列入口和政务页的关系固定。"),
					_build_section_item_card("政务入口", "治理 %s" % str(governance), "后勤 %s / 防务 %s" % [str(logistics), str(defense)], "治理相关入口在这里汇总返回关系。"),
				],
				"content_blocks": [
					_build_section_text_block(
						"动线摘要",
						[
							"动线页用于保留内政入口的返回关系。",
							"当前先固定主城、市井、城建、队列和政务之间的入口层级。",
						],
						"InteriorMarketRoutingSummaryBlock"
					),
					_build_section_text_block(
						"路径说明",
						[
							"当前还不把动线页扩成专用导航 scene，只先固定结构和位置关系。",
							"后续可继续接更细的建筑与城政路径。",
						],
						"InteriorMarketRoutingHintBlock"
					),
					_build_static_section_boundary_block(
						"market/overview",
						"市井总览 / 城市建筑树",
						"动线页现阶段主要表达入口层级和返回关系，暂不值得拆独立导航 scene。",
						"InteriorMarketRoutingBoundaryBlock"
					),
				],
			},
		},
		"tax": {
			"flow": {
				"summary_lines": [
					"收支页已切到显式资源 card + 流转 block 合同。",
					"主城 %s 当前按资源池、军令和税务技术等级组织收支结构。" % city_name,
				],
				"list_title": "收支指标",
				"item_cards": [
					_build_section_item_card("财政池", "铜钱 %s" % str(gold), "军令 %s" % str(order), "主城税务与日常财政节奏的锚点。"),
					_build_section_item_card("粮草流", "粮 %s" % str(food), "募兵冷却 %s" % str(recruit_cooldown), "税收与募兵节奏共享这条粮草流。"),
					_build_section_item_card("建设料流", "木 %s / 石 %s" % [str(wood), str(stone)], "开发点 %s" % str(development_points), "建设消耗与税务沉淀先在这一层收口。"),
					_build_section_item_card("战备料流", "铁 %s" % str(iron), "已占城池 %s" % str(captured_city_count), "战时消耗和军备补位先固定在同一结构位。"),
				],
				"content_blocks": [
					_build_section_text_block(
						"收支摘要",
						[
							"主城：%s | homeTile：%s" % [city_name, home_tile_id if home_tile_id != "" else "未定位"],
							"治理 %s / 后勤 %s，当前财政线按资源池与军令状态展示。" % [str(governance), str(logistics)],
						],
						"InteriorTaxFlowSummaryBlock"
					),
					_build_section_text_block(
						"流转判断",
						[
							"当前军令 %s，%s。" % [str(order), "可继续处理税收与建设动作" if order > 0 else "暂不适合继续推进税务动作"],
							"收支趋势当前先固定结构关系，后续再接统计图或折线信息。",
						],
						"InteriorTaxFlowStatusBlock"
					),
				],
			},
			"reserve": {
				"summary_lines": [
					"仓储页已切到显式储备卡片，不再只靠“粮仓/资源仓/调拨/回收”文本占位。",
					"仓储调度当前以主城资源池、政务队列和税收建筑树做锚点。",
				],
				"list_title": "仓储卡片",
				"item_cards": [
					_build_section_item_card("粮仓", "粮 %s" % str(food), "后勤 %s" % str(logistics), "主城持续经营与募兵的基础储备。"),
					_build_section_item_card("工料仓", "木 %s / 石 %s" % [str(wood), str(stone)], "治理 %s" % str(governance), "建筑与税务调拨先共用这一层仓储视角。"),
					_build_section_item_card("军备仓", "铁 %s" % str(iron), "防务 %s" % str(defense), "防务与驻守补给优先从这里抽取军备资源。"),
					_build_section_item_card("调拨冗余", "队列 %s 项" % str(affairs_queue.size()), "军令 %s" % str(order), "政务队列数量用于表示当前仓储调拨压力。"),
				],
				"content_blocks": [
					_build_section_text_block(
						"仓储摘要",
						[
							"仓储页保留资源储备和调度信息，后续可接真实仓储容量与调配链。",
							"当前主城 %s 以税收建筑树和政务队列为调度锚点。" % city_name,
						],
						"InteriorTaxReserveSummaryBlock"
					),
					_build_section_text_block(
						"调拨提示",
						[
							"已占城池 %s，仓储链需要同时覆盖主城与已占点的回流。" % str(captured_city_count),
							"当前先固定仓储关系和位置，不在这一轮扩展为专用 scene。",
						],
						"InteriorTaxReserveDispatchBlock"
					),
				],
			},
		},
		"policy": {
			"recruitment": {
				"summary_lines": [
					"募兵政策已切到显式政策卡 + 队列参考 block。",
					"募兵页继续保留与部队域联动，但不在这里混入部队面板结构。",
				],
				"list_title": "募兵政策卡",
				"item_cards": [
					_build_section_item_card("募兵等级", "Lv.%s" % str(recruitment), "冷却 %s" % str(recruit_cooldown), "募兵政策负责征兵批次与补员节奏。"),
					_build_section_item_card("粮草储备", "粮 %s" % str(food), "军令 %s" % str(order), "募兵政策首先受粮草和军令约束。"),
					_build_section_item_card("军备补员", "铁 %s" % str(iron), "开发点 %s" % str(development_points), "补员和战备联动先收口在同一张政策卡。"),
					_build_section_item_card("城市联动", "已占城池 %s" % str(captured_city_count), "治理 %s" % str(governance), "募兵政策后续继续回写到城市与队列域。"),
				],
				"content_blocks": [
					_build_section_text_block(
						"募兵摘要",
						[
							"募兵政策承接征兵和兵力补充，后续可与部队面板的征兵联动。",
							"当前先按募兵等级、资源和冷却展示稳定 child-page 合同。",
						],
						"InteriorPolicyRecruitmentSummaryBlock"
					),
					_build_section_text_block(
						"队列参考",
						[
							"政务队列状态：%s" % str(recruit_queue_item.get("statusText", "等待接入")),
							str(recruit_queue_item.get("description", "当前还没有募兵批次队列说明。")),
						],
						"InteriorPolicyRecruitmentQueueBlock"
					),
				],
			},
			"defense": {
				"summary_lines": [
					"防务政策已切到显式防务 card + 队列参考 block。",
					"防务页保持城防、驻守与补给策略的 child-page 结构，不先抽专用 scene。",
				],
				"list_title": "防务政策卡",
				"item_cards": [
					_build_section_item_card("防务等级", "Lv.%s" % str(defense), "已占城池 %s" % str(captured_city_count), "防务等级决定主城和已占点的守备节奏。"),
					_build_section_item_card("城防料池", "石 %s / 铁 %s" % [str(stone), str(iron)], "军令 %s" % str(order), "城防与驻守动作优先吃石料和军备。"),
					_build_section_item_card("守备冗余", "后勤 %s" % str(logistics), "治理 %s" % str(governance), "后勤与治理共同决定防务调度稳定度。"),
					_build_section_item_card("政策联动", "开发点 %s" % str(development_points), "主城 %s" % city_name, "防务政策后续继续回写到驻守和建筑树。"),
				],
				"content_blocks": [
					_build_section_text_block(
						"防务摘要",
						[
							"防务政策用于城防和驻守侧的治理策略，后续可接与地图和驻点相关的联动效果。",
							"当前先固定防务卡片、资源和队列说明三层关系。",
						],
						"InteriorPolicyDefenseSummaryBlock"
					),
					_build_section_text_block(
						"队列参考",
						[
							"政务队列状态：%s" % str(defense_queue_item.get("statusText", "等待接入")),
							str(defense_queue_item.get("description", "当前还没有城防整备队列说明。")),
						],
						"InteriorPolicyDefenseQueueBlock"
					),
				],
			},
		},
		"affairs": {
			"appointment": {
				"summary_lines": [
					"委任页已切到显式职责 card + 队列参考 block。",
					"当前先用城市状态与政务队列说明委任关系，不直接拉独立委任系统。",
				],
				"list_title": "委任职责卡",
				"item_cards": [
					_build_section_item_card("城内委任", city_name, "治理 %s" % str(governance), "主城治理职责先固定在委任页的第一层。"),
					_build_section_item_card("资源委任", "粮 %s / 木 %s" % [str(food), str(wood)], "石 %s / 铁 %s" % [str(stone), str(iron)], "资源岗位优先承接主城经营与仓储协同。"),
					_build_section_item_card("防务委任", "防务 %s" % str(defense), "已占城池 %s" % str(captured_city_count), "防务岗位负责守备节奏与已占点协同。"),
					_build_section_item_card("协同委任", str(dispatch_queue_item.get("statusText", "待分配")), "队列 %s 项" % str(affairs_queue.size()), "AI 协同和城市职责分配先通过这一页保留结构位。"),
				],
				"content_blocks": [
					_build_section_text_block(
						"委任摘要",
						[
							"委任用于治理职责分配。",
							"后续可接官员、建筑和资源岗位，但当前先固定职责卡片和说明层级。",
						],
						"InteriorAffairsAppointmentSummaryBlock"
					),
					_build_section_text_block(
						"队列参考",
						[
							"政务队列状态：%s" % str(dispatch_queue_item.get("statusText", "等待接入")),
							str(dispatch_queue_item.get("description", "当前还没有协同委任队列说明。")),
						],
						"InteriorAffairsAppointmentQueueBlock"
					),
					_build_static_section_boundary_block(
						"affairs/queue",
						"建设队列 / 政务队列",
						"委任页当前以职责卡和队列引用为主，先维持 block schema，不单独拉委任 scene。",
						"InteriorAffairsAppointmentBoundaryBlock"
					),
				],
			},
			"bounty": {
				"summary_lines": [
					"悬赏页已切到显式任务 card + 复盘说明 block。",
					"当前先借政策复盘和城市状态固定悬赏/任务页的结构位。",
				],
				"list_title": "悬赏任务卡",
				"item_cards": [
					_build_section_item_card("主城悬赏", city_name, "开发点 %s" % str(development_points), "主城长期建设与经营任务先汇总在这里。"),
					_build_section_item_card("资源悬赏", "铜钱 %s / 粮 %s" % [str(gold), str(food)], "木 %s / 石 %s" % [str(wood), str(stone)], "资源目标优先承接经营和税务侧任务。"),
					_build_section_item_card("战备悬赏", "铁 %s" % str(iron), "防务 %s" % str(defense), "战备相关任务先与防务策略共用一层结构。"),
					_build_section_item_card("复盘任务", str(policy_review_queue_item.get("statusText", "等待接入")), "治理 %s / 募兵 %s" % [str(governance), str(recruitment)], "政策复盘队列先作为悬赏页的任务锚点。"),
				],
				"content_blocks": [
					_build_section_text_block(
						"悬赏摘要",
						[
							"悬赏用于承接阶段性内政任务和治理目标。",
							"当前先固定主城任务、资源任务、战备任务和复盘任务四层关系。",
						],
						"InteriorAffairsBountySummaryBlock"
					),
					_build_section_text_block(
						"队列参考",
						[
							"政务队列状态：%s" % str(policy_review_queue_item.get("statusText", "等待接入")),
							str(policy_review_queue_item.get("description", "当前还没有政策复盘任务说明。")),
						],
						"InteriorAffairsBountyQueueBlock"
					),
					_build_static_section_boundary_block(
						"affairs/queue",
						"建设队列 / 政务队列",
						"悬赏页当前更像阶段性任务摘要，不需要像队列页那样升级成双栏强交互 scene。",
						"InteriorAffairsBountyBoundaryBlock"
					),
				],
			},
		},
	}


func _find_affair_queue_item(affairs_queue: Array, affair_id: String) -> Dictionary:
	for raw_queue_item in affairs_queue:
		var queue_item: Dictionary = raw_queue_item as Dictionary
		if str(queue_item.get("id", "")).strip_edges() == affair_id:
			return queue_item
	return {}


func _build_static_section_boundary_block(anchor_page_id: String, anchor_label: String, decision_text: String, node_name: String) -> Dictionary:
	var anchor_text := anchor_label.strip_edges()
	if anchor_text == "":
		anchor_text = anchor_page_id.strip_edges()
	if anchor_page_id.strip_edges() != "":
		anchor_text = "%s（%s）" % [anchor_text, anchor_page_id]
	return _build_section_text_block(
		"合同边界",
		[
			"当前页合同：child-page block schema。",
			"同域专用页锚点：%s。" % anchor_text,
			decision_text,
		],
		node_name
	)


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
