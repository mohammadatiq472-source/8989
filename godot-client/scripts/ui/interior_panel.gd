extends Control
class_name InteriorPanel

signal back_requested
signal close_requested
signal page_changed(page_id: String)
signal building_upgrade_requested(tab_id: String, building_id: String)
signal affair_enqueued(affair_id: String)

const DEFAULT_CITY_NAME := "主城待识别"
const DEFAULT_TOP_TAB_ID := "market"
const PANEL_TAB_STRIP_SCENE := preload("res://scenes/ui/panel_tab_strip.tscn")
const BUILDING_TREE_VIEW_SCENE := preload("res://scenes/ui/building_tree_view.tscn")
const BUILD_UPGRADE_SHEET_SCENE := preload("res://scenes/ui/build_upgrade_sheet.tscn")
const AFFAIRS_QUEUE_VIEW_SCENE := preload("res://scenes/ui/affairs_queue_view.tscn")
const CHILD_PAGE_BLOCK_FACTORY_SCRIPT := preload("res://scripts/ui/child_page_block_factory.gd")
const BUILDING_SECTION_BY_TAB := {
	"market": "overview",
	"tax": "structure",
	"policy": "development",
}
const SPECIALIZED_ANCHOR_PAGE_BY_TAB := {
	"market": "market/overview",
	"tax": "tax/structure",
	"policy": "policy/development",
	"affairs": "affairs/queue",
}

const TOP_TAB_ORDER := [
	"market",
	"tax",
	"policy",
	"affairs",
]

const PANEL_DEFS := {
	"market": {
		"label": "市井",
		"summary_title": "主城经营",
		"summary_lines": [
			"市井已确认归内政域，承接主城经营、收益与城政入口。",
			"这里先保留主城经营的正式结构，不再用 preview story 代替。",
		],
		"sections": [
			{
				"id": "overview",
				"label": "总览",
				"title": "市井总览",
				"item_cards": [
					{"title": "主城收益", "value": "市井总览", "meta": "默认经营卡位", "description": "默认主城经营入口。"},
					{"title": "城内经营", "value": "市井总览", "meta": "默认经营卡位", "description": "默认主城经营入口。"},
					{"title": "资源调度", "value": "市井总览", "meta": "默认经营卡位", "description": "默认主城经营入口。"},
					{"title": "市井入口", "value": "市井总览", "meta": "默认经营卡位", "description": "默认主城经营入口。"},
				],
				"content_blocks": [
					{
						"kind": "text_block",
						"title": "经营摘要",
						"lines": [
							"市井是内政域的一部分，不是独立设施域。",
							"它负责主城经营与日常治理入口的汇总。",
						],
						"node_name": "InteriorMarketOverviewDefaultSummaryBlock",
					},
					{
						"kind": "text_block",
						"title": "补充",
						"lines": [
							"后续可接市集、仓储与城内经营流。",
						],
						"node_name": "InteriorMarketOverviewDefaultFooterBlock",
					},
				],
			},
			{
				"id": "economy",
				"label": "收益",
				"title": "市井收益",
				"item_cards": [
					{"title": "铜钱产出", "value": "市井收益", "meta": "默认收益卡位", "description": "默认收益页入口。"},
					{"title": "粮草补充", "value": "市井收益", "meta": "默认收益卡位", "description": "默认收益页入口。"},
					{"title": "资源调度", "value": "市井收益", "meta": "默认收益卡位", "description": "默认收益页入口。"},
					{"title": "经营加成", "value": "市井收益", "meta": "默认收益卡位", "description": "默认收益页入口。"},
				],
				"content_blocks": [
					{
						"kind": "text_block",
						"title": "收益摘要",
						"lines": [
							"收益页用于承接内政内的经济相关信息。",
							"可继续扩展为资源结构、产出和加成来源。",
						],
						"node_name": "InteriorMarketEconomyDefaultSummaryBlock",
					},
				],
			},
			{
				"id": "routing",
				"label": "动线",
				"title": "城政动线",
				"item_cards": [
					{"title": "主城首页", "value": "城政动线", "meta": "默认动线卡位", "description": "默认动线页入口。"},
					{"title": "城建入口", "value": "城政动线", "meta": "默认动线卡位", "description": "默认动线页入口。"},
					{"title": "队列入口", "value": "城政动线", "meta": "默认动线卡位", "description": "默认动线页入口。"},
					{"title": "政务入口", "value": "城政动线", "meta": "默认动线卡位", "description": "默认动线页入口。"},
				],
				"content_blocks": [
					{
						"kind": "text_block",
						"title": "动线摘要",
						"lines": [
							"动线页用于保留内政入口的返回关系。",
							"后续可接更细的建筑与城政路径。",
						],
						"node_name": "InteriorMarketRoutingDefaultSummaryBlock",
					},
				],
			},
		],
	},
	"tax": {
		"label": "税收",
		"summary_title": "财政结构",
		"summary_lines": [
			"税收页承接主城财政、仓储调度和资源回收。",
			"税收与城内经营共享状态，但不混层级。",
		],
		"sections": [
			{
				"id": "structure",
				"label": "税制",
				"title": "税收结构",
				"item_cards": [
					{"title": "主城税收", "value": "税收结构", "meta": "默认税制卡位", "description": "默认税制页入口。"},
					{"title": "市井收益", "value": "税收结构", "meta": "默认税制卡位", "description": "默认税制页入口。"},
					{"title": "仓储调度", "value": "税收结构", "meta": "默认税制卡位", "description": "默认税制页入口。"},
					{"title": "资源回流", "value": "税收结构", "meta": "默认税制卡位", "description": "默认税制页入口。"},
				],
				"content_blocks": [
					{
						"kind": "text_block",
						"title": "税制摘要",
						"lines": [
							"税收页保留财政、回收与仓储相关的治理信息。",
							"后续可接真实税率与回收规则。",
						],
						"node_name": "InteriorTaxStructureDefaultSummaryBlock",
					},
				],
			},
			{
				"id": "flow",
				"label": "收支",
				"title": "收支趋势",
				"item_cards": [
					{"title": "日常收入", "value": "收支趋势", "meta": "默认收支卡位", "description": "默认收支页入口。"},
					{"title": "日常支出", "value": "收支趋势", "meta": "默认收支卡位", "description": "默认收支页入口。"},
					{"title": "战时消耗", "value": "收支趋势", "meta": "默认收支卡位", "description": "默认收支页入口。"},
					{"title": "建设消耗", "value": "收支趋势", "meta": "默认收支卡位", "description": "默认收支页入口。"},
				],
				"content_blocks": [
					{
						"kind": "text_block",
						"title": "收支摘要",
						"lines": [
							"收支趋势用于展示财政流转。",
							"后续可直接接统计图或折线信息。",
						],
						"node_name": "InteriorTaxFlowDefaultSummaryBlock",
					},
				],
			},
			{
				"id": "reserve",
				"label": "仓储",
				"title": "仓储调度",
				"item_cards": [
					{"title": "粮仓", "value": "仓储调度", "meta": "默认仓储卡位", "description": "默认仓储页入口。"},
					{"title": "资源仓", "value": "仓储调度", "meta": "默认仓储卡位", "description": "默认仓储页入口。"},
					{"title": "调拨", "value": "仓储调度", "meta": "默认仓储卡位", "description": "默认仓储页入口。"},
					{"title": "回收", "value": "仓储调度", "meta": "默认仓储卡位", "description": "默认仓储页入口。"},
				],
				"content_blocks": [
					{
						"kind": "text_block",
						"title": "仓储摘要",
						"lines": [
							"仓储页保留资源储备和调度信息。",
							"后续可接真实仓储容量与调配链。",
						],
						"node_name": "InteriorTaxReserveDefaultSummaryBlock",
					},
				],
			},
		],
	},
	"policy": {
		"label": "政策",
		"summary_title": "政策树",
		"summary_lines": [
			"政策页承接发展、募兵、防务等治理策略。",
			"政策更偏治理选择，不是单纯数值面板。",
		],
		"sections": [
			{
				"id": "development",
				"label": "发展",
				"title": "发展政策",
				"item_cards": [
					{"title": "主城发展", "value": "发展政策", "meta": "默认政策卡位", "description": "默认发展政策入口。"},
					{"title": "建筑加速", "value": "发展政策", "meta": "默认政策卡位", "description": "默认发展政策入口。"},
					{"title": "资源倾斜", "value": "发展政策", "meta": "默认政策卡位", "description": "默认发展政策入口。"},
					{"title": "长期建设", "value": "发展政策", "meta": "默认政策卡位", "description": "默认发展政策入口。"},
				],
				"content_blocks": [
					{
						"kind": "text_block",
						"title": "发展摘要",
						"lines": [
							"发展政策侧重长期经营和建筑节奏。",
							"后续可接实际政策树与效果。",
						],
						"node_name": "InteriorPolicyDevelopmentDefaultSummaryBlock",
					},
				],
			},
			{
				"id": "recruitment",
				"label": "募兵",
				"title": "募兵政策",
				"item_cards": [
					{"title": "募兵加速", "value": "募兵政策", "meta": "默认政策卡位", "description": "默认募兵政策入口。"},
					{"title": "兵力补充", "value": "募兵政策", "meta": "默认政策卡位", "description": "默认募兵政策入口。"},
					{"title": "补给优先", "value": "募兵政策", "meta": "默认政策卡位", "description": "默认募兵政策入口。"},
					{"title": "战备调整", "value": "募兵政策", "meta": "默认政策卡位", "description": "默认募兵政策入口。"},
				],
				"content_blocks": [
					{
						"kind": "text_block",
						"title": "募兵摘要",
						"lines": [
							"募兵政策承接征兵和兵力补充。",
							"后续可与部队面板的征兵联动。",
						],
						"node_name": "InteriorPolicyRecruitmentDefaultSummaryBlock",
					},
				],
			},
			{
				"id": "defense",
				"label": "防务",
				"title": "防务政策",
				"item_cards": [
					{"title": "城防加固", "value": "防务政策", "meta": "默认政策卡位", "description": "默认防务政策入口。"},
					{"title": "驻守优先", "value": "防务政策", "meta": "默认政策卡位", "description": "默认防务政策入口。"},
					{"title": "补给防线", "value": "防务政策", "meta": "默认政策卡位", "description": "默认防务政策入口。"},
					{"title": "前线强化", "value": "防务政策", "meta": "默认政策卡位", "description": "默认防务政策入口。"},
				],
				"content_blocks": [
					{
						"kind": "text_block",
						"title": "防务摘要",
						"lines": [
							"防务政策用于城防和驻守侧的治理策略。",
							"后续可接与地图和驻点相关的联动效果。",
						],
						"node_name": "InteriorPolicyDefenseDefaultSummaryBlock",
					},
				],
			},
		],
	},
	"affairs": {
		"label": "政务",
		"summary_title": "政务总览",
		"summary_lines": [
			"政务页承接委任、建设队列与悬赏任务。",
			"政务是内政治理的执行层，不是列表页附属层。",
		],
		"sections": [
			{
				"id": "queue",
				"label": "建设队列",
				"title": "建设队列",
				"item_cards": [
					{"title": "主城队列", "value": "建设队列", "meta": "默认政务卡位", "description": "默认建设队列入口。"},
					{"title": "升级队列", "value": "建设队列", "meta": "默认政务卡位", "description": "默认建设队列入口。"},
					{"title": "候补队列", "value": "建设队列", "meta": "默认政务卡位", "description": "默认建设队列入口。"},
					{"title": "维护队列", "value": "建设队列", "meta": "默认政务卡位", "description": "默认建设队列入口。"},
				],
				"content_blocks": [
					{
						"kind": "text_block",
						"title": "队列摘要",
						"lines": [
							"建设队列承接建筑升级与维护节奏。",
							"后续可直接接城市建筑树和升级链。",
						],
						"node_name": "InteriorAffairsQueueDefaultSummaryBlock",
					},
				],
			},
			{
				"id": "appointment",
				"label": "委任",
				"title": "委任管理",
				"item_cards": [
					{"title": "城内委任", "value": "委任管理", "meta": "默认委任卡位", "description": "默认委任页入口。"},
					{"title": "资源委任", "value": "委任管理", "meta": "默认委任卡位", "description": "默认委任页入口。"},
					{"title": "防务委任", "value": "委任管理", "meta": "默认委任卡位", "description": "默认委任页入口。"},
					{"title": "队列委任", "value": "委任管理", "meta": "默认委任卡位", "description": "默认委任页入口。"},
				],
				"content_blocks": [
					{
						"kind": "text_block",
						"title": "委任摘要",
						"lines": [
							"委任用于治理职责分配。",
							"后续可接官员、建筑和资源岗位。",
						],
						"node_name": "InteriorAffairsAppointmentDefaultSummaryBlock",
					},
				],
			},
			{
				"id": "bounty",
				"label": "悬赏",
				"title": "悬赏任务",
				"item_cards": [
					{"title": "政务悬赏", "value": "悬赏任务", "meta": "默认悬赏卡位", "description": "默认悬赏页入口。"},
					{"title": "资源悬赏", "value": "悬赏任务", "meta": "默认悬赏卡位", "description": "默认悬赏页入口。"},
					{"title": "协同悬赏", "value": "悬赏任务", "meta": "默认悬赏卡位", "description": "默认悬赏页入口。"},
					{"title": "临时任务", "value": "悬赏任务", "meta": "默认悬赏卡位", "description": "默认悬赏页入口。"},
				],
				"content_blocks": [
					{
						"kind": "text_block",
						"title": "悬赏摘要",
						"lines": [
							"悬赏任务用于承接短期治理目标。",
							"后续可接任务状态与奖励。",
						],
						"node_name": "InteriorAffairsBountyDefaultSummaryBlock",
					},
				],
			},
		],
	},
}

var _host = null

var _interior_snapshot: Dictionary = {
	"city_name": DEFAULT_CITY_NAME,
	"home_tile_id": "",
	"development_points": 0,
	"food": 0,
	"gold": 0,
	"wood": 0,
	"stone": 0,
	"iron": 0,
	"order": 0,
	"logistics": 0,
	"defense": 0,
	"recruitment": 0,
	"governance": 0,
	"captured_city_count": 0,
	"recruit_cooldown": 0,
	"tech_levels": {},
	"building_groups": {},
	"affairs_queue": [],
	"summary_note": "",
}
var _tab_views: Dictionary = {}
var _current_top_tab_id: String = ""
var _current_section_by_tab: Dictionary = {}
var _selected_affair_id: String = ""
var _refresh_pending: bool = false
var _refresh_deferred: bool = false


func _ready() -> void:
	_bind_host_signals()
	_request_panel_refresh()


func set_interior_snapshot(snapshot: Dictionary) -> void:
	_interior_snapshot = _merge_snapshot(snapshot)
	_request_panel_refresh()


func set_interior_summary(summary: String) -> void:
	_interior_snapshot["summary_note"] = summary
	_request_panel_refresh()


func get_active_top_tab_id() -> String:
	return _current_top_tab_id


func get_active_page_id() -> String:
	return _compose_page_id(_current_top_tab_id, _get_current_section_id(_current_top_tab_id))


func set_active_page_id(page_id: String) -> void:
	var resolved_tab_id := page_id.strip_edges()
	if resolved_tab_id == "":
		return
	var top_tab_id := resolved_tab_id
	var section_id := ""
	var separator_index := resolved_tab_id.find("/")
	if separator_index != -1:
		top_tab_id = resolved_tab_id.substr(0, separator_index).strip_edges()
		section_id = resolved_tab_id.substr(separator_index + 1).strip_edges()
	set_active_top_tab(top_tab_id)
	if section_id != "":
		set_active_section(top_tab_id, section_id)


func set_active_top_tab(tab_id: String) -> void:
	_select_top_tab(tab_id)


func set_active_section(top_tab_id: String, section_id: String) -> void:
	var tab_def: Dictionary = _get_tab_def(top_tab_id)
	if tab_def.is_empty():
		return
	if not _get_section_ids(tab_def).has(section_id):
		return
	_current_section_by_tab[top_tab_id] = section_id
	var state: Dictionary = _ensure_tab_view(top_tab_id)
	var section_strip = state.get("section_strip")
	if section_strip != null:
		section_strip.set_active_tab(section_id)
	_render_section_content(top_tab_id, section_id)
	page_changed.emit(_compose_page_id(top_tab_id, section_id))


func _request_panel_refresh() -> void:
	_refresh_pending = true
	if not is_inside_tree():
		return
	if _refresh_deferred:
		return
	_refresh_deferred = true
	call_deferred("_flush_panel_refresh")


func _flush_panel_refresh() -> void:
	_refresh_deferred = false
	if not _refresh_pending:
		return
	_refresh_pending = false
	_rebuild_panel()


func _bind_host_signals() -> void:
	var host = _ensure_host()
	if host == null:
		push_error("[interior-panel] host is missing.")
		return
	if not host.back_requested.is_connected(Callable(self, "_on_host_back_requested")):
		host.back_requested.connect(Callable(self, "_on_host_back_requested"))
	if not host.close_requested.is_connected(Callable(self, "_on_host_close_requested")):
		host.close_requested.connect(Callable(self, "_on_host_close_requested"))
	if not host.tab_selected.is_connected(Callable(self, "_on_host_tab_selected")):
		host.tab_selected.connect(Callable(self, "_on_host_tab_selected"))


func _rebuild_panel() -> void:
	var host = _ensure_host()
	if host == null:
		return
	_tab_views.clear()
	var preserved_top_tab := _current_top_tab_id if not _current_top_tab_id.is_empty() else DEFAULT_TOP_TAB_ID
	host.set_panel_title("内政")
	host.set_back_button_label("返回")
	host.set_close_button_label("关闭")
	host.set_empty_state_text("请选择一个内政功能入口。")
	host.set_title_font_size(22)
	host.set_empty_state_font_size(14)
	if host.has_method("set_body_margins"):
		host.call("set_body_margins", 16, 12, 16, 14)
	if host.has_method("set_content_margins"):
		host.call("set_content_margins", 12, 10, 12, 12)
	host.set_tab_settings(_build_top_tab_settings())
	_select_top_tab(preserved_top_tab)


func _build_top_tab_settings() -> Array:
	var tab_settings: Array = []
	for tab_id in TOP_TAB_ORDER:
		var tab_def: Dictionary = _get_tab_def(tab_id)
		if tab_def.is_empty():
			continue
		tab_settings.append({
			"id": tab_id,
			"label": str(tab_def.get("label", tab_id)),
			"tooltip": str(tab_def.get("summary_title", "")),
		})
	return tab_settings


func _select_top_tab(tab_id: String) -> void:
	var tab_def: Dictionary = _get_tab_def(tab_id)
	if tab_def.is_empty():
		return
	var host = _ensure_host()
	if host == null:
		return
	_current_top_tab_id = tab_id
	host.set_active_tab(tab_id)
	host.set_content_node(_ensure_tab_view(tab_id).get("root") as Node)
	page_changed.emit(_compose_page_id(tab_id, _get_current_section_id(tab_id)))


func _ensure_tab_view(tab_id: String) -> Dictionary:
	if _tab_views.has(tab_id):
		return _tab_views[tab_id]
	var tab_def: Dictionary = _get_tab_def(tab_id)
	if tab_def.is_empty():
		return {}

	var root := ScrollContainer.new()
	root.name = "InteriorTabRoot_%s" % tab_id
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.mouse_filter = Control.MOUSE_FILTER_PASS

	var root_vbox := VBoxContainer.new()
	root_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root_vbox.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root_vbox.add_theme_constant_override("separation", 10)
	root.add_child(root_vbox)

	root_vbox.add_child(_build_summary_card(tab_id))

	var section_strip = _build_section_strip(tab_id)
	root_vbox.add_child(section_strip)

	var section_host := Control.new()
	section_host.name = "SectionHost"
	section_host.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	section_host.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root_vbox.add_child(section_host)

	var default_section_id := _get_default_section_id(tab_id)
	_current_section_by_tab[tab_id] = _current_section_by_tab.get(tab_id, default_section_id)
	var current_section_id := str(_current_section_by_tab.get(tab_id, default_section_id))
	if section_strip != null:
		section_strip.set_active_tab(current_section_id)
	_render_section_content(tab_id, current_section_id, section_host)

	var state := {
		"root": root,
		"section_strip": section_strip,
		"section_host": section_host,
		"current_section_id": current_section_id,
	}
	_tab_views[tab_id] = state
	return state


func _build_summary_card(tab_id: String) -> Control:
	var tab_def: Dictionary = _get_tab_def(tab_id)
	var city_name := _snapshot_string("city_name", DEFAULT_CITY_NAME)
	var home_tile_id := _snapshot_string("home_tile_id", "")
	var development_points := _snapshot_int("development_points", 0)
	var food := _snapshot_int("food", _snapshot_int("gold", 0))
	var wood := _snapshot_int("wood", 0)
	var stone := _snapshot_int("stone", 0)
	var iron := _snapshot_int("iron", 0)
	var order := _snapshot_int("order", 0)
	var governance := _snapshot_int("governance", 0)
	var logistics := _snapshot_int("logistics", 0)
	var defense := _snapshot_int("defense", 0)
	var recruitment := _snapshot_int("recruitment", 0)
	var captured_city_count := _snapshot_int("captured_city_count", 0)
	var recruit_cooldown := _snapshot_int("recruit_cooldown", 0)
	var tech_levels: Dictionary = _interior_snapshot.get("tech_levels", {}) as Dictionary
	var building_groups: Dictionary = _interior_snapshot.get("building_groups", {}) as Dictionary
	var active_group_count := _snapshot_building_count(tab_id, building_groups)
	var affairs_queue := _snapshot_affairs_queue()
	var card := PanelContainer.new()
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 12)
	margin.add_theme_constant_override("margin_top", 10)
	margin.add_theme_constant_override("margin_right", 12)
	margin.add_theme_constant_override("margin_bottom", 10)

	var vbox := VBoxContainer.new()
	vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	vbox.add_theme_constant_override("separation", 4)
	vbox.add_child(_make_label("%s · %s" % [city_name, str(tab_def.get("label", "内政"))], 20))
	vbox.add_child(_make_label("homeTile：%s | 开发点：%d | 军令：%d" % [home_tile_id if home_tile_id != "" else "未定位", development_points, order], 13))
	vbox.add_child(_make_label("粮 %d | 木 %d | 石 %d | 铁 %d    政 %d | 后 %d | 防 %d | 募 %d" % [food, wood, stone, iron, governance, logistics, defense, recruitment], 12, true))
	vbox.add_child(_make_label(str(tab_def.get("summary_title", "内政面板")), 14))
	for line in tab_def.get("summary_lines", []) as Array:
		vbox.add_child(_make_label(str(line), 12, true))
	var summary_note := str(_interior_snapshot.get("summary_note", "")).strip_edges()
	if summary_note != "":
		vbox.add_child(_make_label("摘要：" + summary_note, 12, true))
	vbox.add_child(_make_label(_format_section_hint(tab_id, str(_current_section_by_tab.get(tab_id, _get_default_section_id(tab_id)))), 12, true))
	vbox.add_child(_make_label("政务线索：主城 %s | homeTile %s | 开发点 %d | 已占城池 %d" % [city_name, home_tile_id if home_tile_id != "" else "未定位", development_points, captured_city_count], 11, true))
	vbox.add_child(_make_label("技术等级：政 %d / 后 %d / 防 %d / 募 %d" % [
		_snapshot_tech_level(tech_levels, "governance"),
		_snapshot_tech_level(tech_levels, "logistics"),
		_snapshot_tech_level(tech_levels, "defense"),
		_snapshot_tech_level(tech_levels, "recruitment"),
	], 11, true))
	if active_group_count > 0:
		vbox.add_child(_make_label("当前建筑树：%d 项可见" % active_group_count, 11, true))
	if tab_id == "affairs":
		vbox.add_child(_make_label("政务队列：%d 项 | 募兵冷却 %d" % [affairs_queue.size(), recruit_cooldown], 11, true))

	margin.add_child(vbox)
	card.add_child(margin)
	return card


func _build_section_strip(tab_id: String) -> Control:
	var section_strip = PANEL_TAB_STRIP_SCENE.instantiate()
	section_strip.empty_state_text = "暂无内政切项"
	section_strip.tab_button_min_width = 92.0
	section_strip.tab_button_text_size = 12
	section_strip.set_tab_settings(_build_section_tab_settings(tab_id))
	var section_callback := Callable(self, "_on_section_tab_selected").bind(tab_id)
	if not section_strip.tab_selected.is_connected(section_callback):
		section_strip.tab_selected.connect(section_callback)
	return section_strip


func _build_section_tab_settings(tab_id: String) -> Array:
	var tab_def: Dictionary = _get_tab_def(tab_id)
	var section_settings: Array = []
	for raw_section in tab_def.get("sections", []) as Array:
		var section: Dictionary = raw_section if raw_section is Dictionary else {}
		var section_id := str(section.get("id", "")).strip_edges()
		if section_id.is_empty():
			continue
		section_settings.append({
			"id": section_id,
			"label": str(section.get("label", section_id)),
			"tooltip": str(section.get("title", "")),
		})
	return section_settings


func _render_section_content(tab_id: String, section_id: String, section_host: Control = null) -> void:
	var resolved_section_host: Control = section_host
	if resolved_section_host == null:
		var state: Dictionary = _tab_views.get(tab_id, {}) as Dictionary
		resolved_section_host = state.get("section_host") as Control
	if resolved_section_host == null:
		return
	_clear_control_children(resolved_section_host)
	var section_view := _build_section_view(tab_id, section_id)
	if section_view == null:
		section_view = _make_label("等待内政切项加载。", 14, true)
	resolved_section_host.add_child(section_view)


func _build_section_view(tab_id: String, section_id: String) -> Control:
	var section_def: Dictionary = _resolve_section_payload(tab_id, section_id)
	if section_def.is_empty():
		return _make_label("暂无可用内政切项。", 14, true)
	var dynamic_view: Control = _build_dynamic_section_view(tab_id, section_id, section_def)
	if dynamic_view != null:
		return dynamic_view
	return CHILD_PAGE_BLOCK_FACTORY_SCRIPT.new().build_section_page(_build_child_page_payload(tab_id, section_id, section_def))


func _build_dynamic_section_view(tab_id: String, section_id: String, section_def: Dictionary) -> Control:
	if _should_use_building_group_view(tab_id, section_id):
		return _build_building_group_view(tab_id, section_def)
	if tab_id == "affairs" and section_id == "queue":
		return _build_affairs_queue_view(section_def)
	return null


func _should_use_building_group_view(tab_id: String, section_id: String) -> bool:
	if not BUILDING_SECTION_BY_TAB.has(tab_id):
		return false
	if str(BUILDING_SECTION_BY_TAB.get(tab_id, "")) != section_id:
		return false
	var group: Dictionary = _snapshot_building_group(tab_id)
	var tree_items_variant: Variant = group.get("treeItems", [])
	return tree_items_variant is Array and not (tree_items_variant as Array).is_empty()


func _build_building_group_view(tab_id: String, section_def: Dictionary) -> Control:
	var group: Dictionary = _snapshot_building_group(tab_id)
	if group.is_empty():
		var empty_payload := section_def.duplicate(true)
		empty_payload["summary_lines"] = [
			"城市建筑树专用页当前没有可用 building group，先显示空态卡片。",
			"当前会在建筑树数据回写后自动恢复左树右单结构。",
		]
		empty_payload["item_cards"] = [
			{
				"title": "等待城市建筑树数据",
				"value": "待接入",
				"meta": str(section_def.get("title", "城市建筑树")),
				"description": "当前 building_groups 为空，先保留建筑树专用页空态。",
			},
		]
		var empty_blocks: Array = section_def.get("content_blocks", []) as Array
		empty_blocks.append({
			"kind": "text_block",
			"title": "空态说明",
			"lines": [
				"城市建筑树当前还没有可显示节点。",
				"升级单会在建筑树数据到位后继续由专用 scene 接管。",
			],
			"node_name": "InteriorBuildingGroupEmptyStateBlock",
		})
		empty_payload["content_blocks"] = empty_blocks
		return CHILD_PAGE_BLOCK_FACTORY_SCRIPT.new().build_section_page(_build_child_page_payload(tab_id, str(section_def.get("id", "")), empty_payload))

	var root := VBoxContainer.new()
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_theme_constant_override("separation", 10)
	root.add_child(_make_label(str(section_def.get("title", "城市建筑树")), 18))
	for line in _extract_text_block_lines(section_def):
		root.add_child(_make_label(str(line), 12, true))

	var split := HBoxContainer.new()
	split.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	split.size_flags_vertical = Control.SIZE_EXPAND_FILL
	split.add_theme_constant_override("separation", 10)

	var building_tree = BUILDING_TREE_VIEW_SCENE.instantiate()
	var upgrade_sheet = BUILD_UPGRADE_SHEET_SCENE.instantiate()
	if building_tree is Control:
		(building_tree as Control).size_flags_horizontal = Control.SIZE_EXPAND_FILL
		(building_tree as Control).size_flags_vertical = Control.SIZE_EXPAND_FILL
		(building_tree as Control).custom_minimum_size = Vector2(420, 260)
	if upgrade_sheet is Control:
		(upgrade_sheet as Control).size_flags_horizontal = Control.SIZE_EXPAND_FILL
		(upgrade_sheet as Control).size_flags_vertical = Control.SIZE_EXPAND_FILL
		(upgrade_sheet as Control).custom_minimum_size = Vector2(360, 260)
	split.add_child(building_tree)
	split.add_child(upgrade_sheet)
	root.add_child(split)

	var tree_title := str(group.get("treeTitle", section_def.get("title", "城市建筑树")))
	var tree_items_variant: Variant = group.get("treeItems", [])
	var tree_items: Array = tree_items_variant as Array if tree_items_variant is Array else []
	if building_tree != null and building_tree.has_method("set_tree_contract"):
		building_tree.call("set_tree_contract", _build_building_tree_contract(tree_title, tree_items))
	if tree_items.is_empty():
		if upgrade_sheet != null and upgrade_sheet.has_method("set_sheet_contract"):
			upgrade_sheet.call("set_sheet_contract", _build_upgrade_sheet_contract({}, tree_title))
		return root

	var selected_building_id := str((tree_items[0] as Dictionary).get("id", "")).strip_edges()
	if building_tree != null and selected_building_id != "" and building_tree.has_method("set_tree_contract"):
		building_tree.call("set_tree_contract", _build_building_tree_contract(tree_title, tree_items, selected_building_id))
	var selected_item: Dictionary = _find_building_tree_item(tree_items, selected_building_id)
	_apply_building_item_to_sheet(upgrade_sheet, selected_item, tree_title)
	if building_tree != null and building_tree.has_signal("building_selected"):
		var building_selected_callback := func(building_id: String) -> void:
			var tree_item := _find_building_tree_item(tree_items, building_id)
			_apply_building_item_to_sheet(upgrade_sheet, tree_item, tree_title)
		if not building_tree.is_connected("building_selected", building_selected_callback):
			building_tree.connect("building_selected", building_selected_callback)
	if upgrade_sheet != null and upgrade_sheet.has_signal("primary_action_requested"):
		var primary_action_callback := func(_action_id: String) -> void:
			var building_id := ""
			if building_tree != null and building_tree.has_method("get_selected_building_id"):
				building_id = str(building_tree.call("get_selected_building_id"))
			var queue_item := _find_building_tree_item(tree_items, building_id)
			if queue_item.is_empty():
				return
			# This main-city context chain is template-only; do not dispatch building authority here.
			if upgrade_sheet.has_method("set_sheet_contract"):
				upgrade_sheet.call("set_sheet_contract", _build_upgrade_sheet_contract(queue_item, tree_title, true))
		if not upgrade_sheet.is_connected("primary_action_requested", primary_action_callback):
			upgrade_sheet.connect("primary_action_requested", primary_action_callback)
	if upgrade_sheet != null and upgrade_sheet.has_signal("secondary_action_requested"):
		var secondary_action_callback := func(_action_id: String) -> void:
			var building_id := ""
			if building_tree != null and building_tree.has_method("get_selected_building_id"):
				building_id = str(building_tree.call("get_selected_building_id"))
			var tree_item := _find_building_tree_item(tree_items, building_id)
			_apply_building_item_to_sheet(upgrade_sheet, tree_item, tree_title)
		if not upgrade_sheet.is_connected("secondary_action_requested", secondary_action_callback):
			upgrade_sheet.connect("secondary_action_requested", secondary_action_callback)
	return root


func _build_affairs_queue_view(section_def: Dictionary) -> Control:
	var queue_items := _snapshot_affairs_queue()
	var queue_view = AFFAIRS_QUEUE_VIEW_SCENE.instantiate()
	if queue_view == null:
		return CHILD_PAGE_BLOCK_FACTORY_SCRIPT.new().build_section_page(_build_child_page_payload("affairs", str(section_def.get("id", "queue")), section_def))
	if queue_view.has_method("set_queue_contract"):
		queue_view.call("set_queue_contract", _build_affairs_queue_contract(section_def, queue_items))
	if queue_view.has_signal("queue_item_pressed"):
		var queue_item_pressed_callback := func(affair_id: String) -> void:
			affair_enqueued.emit(affair_id)
		if not queue_view.is_connected("queue_item_pressed", queue_item_pressed_callback):
			queue_view.connect("queue_item_pressed", queue_item_pressed_callback)
	if queue_view.has_signal("selected_affair_changed"):
		var selected_affair_changed_callback := func(affair_id: String) -> void:
			_selected_affair_id = affair_id
		if not queue_view.is_connected("selected_affair_changed", selected_affair_changed_callback):
			queue_view.connect("selected_affair_changed", selected_affair_changed_callback)
	if queue_view.has_signal("detail_action_requested"):
		var detail_action_requested_callback := func(action_id: String, affair_id: String) -> void:
			if action_id == "enqueue_selected" and affair_id != "":
				affair_enqueued.emit(affair_id)
		if not queue_view.is_connected("detail_action_requested", detail_action_requested_callback):
			queue_view.connect("detail_action_requested", detail_action_requested_callback)
	return queue_view as Control


func _apply_building_item_to_sheet(upgrade_sheet, tree_item: Dictionary, fallback_title: String) -> void:
	if upgrade_sheet == null:
		return
	if tree_item.is_empty():
		if upgrade_sheet.has_method("set_sheet_contract"):
			upgrade_sheet.call("set_sheet_contract", _build_upgrade_sheet_contract({}, fallback_title))
		return
	if upgrade_sheet.has_method("set_sheet_contract"):
		upgrade_sheet.call("set_sheet_contract", _build_upgrade_sheet_contract(tree_item, fallback_title))

func _build_affairs_queue_contract(section_def: Dictionary, queue_items: Array) -> Dictionary:
	var queue_empty_lines := _extract_text_block_lines(section_def)
	var footer_lines: Array[String] = queue_empty_lines.duplicate()
	footer_lines.append("政务队列现在直接读取主城快照，不再只是静态占位。")
	return {
		"title": str(section_def.get("title", "建设队列")),
		"subtitle": "当前政务队列",
		"summary_title": "执行摘要",
		"queue_items": queue_items,
		"selected_affair_id": _selected_affair_id,
		"detail_actions": [
			{"id": "enqueue_selected", "label": "提交政务"},
			{"id": "refresh_selected", "label": "刷新详情"},
		],
		"empty_state": {
			"list_label": "等待政务项。",
			"title": "当前政务队列为空。",
			"body": "\n".join(queue_empty_lines) if not queue_empty_lines.is_empty() else "当前还没有可显示的政务队列说明。",
			"footer_lines": footer_lines,
		},
	}

func _build_building_tree_contract(tree_title: String, tree_items: Array, selected_building_id: String = "") -> Dictionary:
	return {
		"title": tree_title,
		"state_badge": "建筑树",
		"empty_state_text": "等待城市建筑树数据。" if tree_items.is_empty() else "请选择一个设施或建筑项后加载建筑树。",
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

func _build_upgrade_sheet_contract(tree_item: Dictionary, fallback_title: String, submitted: bool = false) -> Dictionary:
	if tree_item.is_empty():
		return {
			"title": fallback_title,
			"subtitle": "等待升级单数据。",
			"body": "",
			"cost_summary": "消耗：--",
			"effect_summary": "效果：--",
			"primary_action_label": "确认",
			"secondary_action_label": "返回",
			"close_button_label": "关闭",
			"empty_state_text": "等待升级单数据。",
			"has_payload": false,
		}
	var subtitle := str(tree_item.get("sheetSubtitle", tree_item.get("description", "")))
	var body := str(tree_item.get("sheetBody", tree_item.get("description", "等待说明加载。")))
	if submitted:
		subtitle = "%s · 已加入模板排队" % str(tree_item.get("label", fallback_title))
		body = "%s\n\n升级按钮已进入面板内模板/排队态，本轮不请求后端建筑 authority、不扣资源。" % body
	return {
		"title": str(tree_item.get("label", fallback_title)),
		"subtitle": subtitle,
		"body": body,
		"cost_summary": "消耗：" + str(tree_item.get("costSummary", "--")),
		"effect_summary": "效果：" + str(tree_item.get("effectSummary", "--")),
		"primary_action_label": str(tree_item.get("primaryActionLabel", "确认")),
		"secondary_action_label": str(tree_item.get("secondaryActionLabel", "返回")),
		"close_button_label": "关闭",
		"empty_state_text": "等待升级单数据。",
		"has_payload": true,
	}


func _find_building_tree_item(tree_items: Array, building_id: String) -> Dictionary:
	for raw_item in tree_items:
		var tree_item: Dictionary = raw_item if raw_item is Dictionary else {}
		if str(tree_item.get("id", "")).strip_edges() == building_id:
			return tree_item
	return {}


func _snapshot_building_group(tab_id: String) -> Dictionary:
	var building_groups: Dictionary = _interior_snapshot.get("building_groups", {}) as Dictionary
	if not building_groups.has(tab_id):
		return {}
	return building_groups.get(tab_id, {}) as Dictionary


func _snapshot_building_count(tab_id: String, building_groups: Dictionary) -> int:
	if not building_groups.has(tab_id):
		return 0
	var group: Dictionary = building_groups.get(tab_id, {}) as Dictionary
	var tree_items_variant: Variant = group.get("treeItems", [])
	if not (tree_items_variant is Array):
		return 0
	return (tree_items_variant as Array).size()


func _snapshot_affairs_queue() -> Array:
	var queue_variant: Variant = _interior_snapshot.get("affairs_queue", [])
	return queue_variant as Array if queue_variant is Array else []


func _make_label(text: String, font_size: int, wrap: bool = false) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", font_size)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART if wrap else TextServer.AUTOWRAP_OFF
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return label


func _merge_snapshot(snapshot: Dictionary) -> Dictionary:
	var merged := _interior_snapshot.duplicate(true)
	for key in snapshot.keys():
		merged[key] = snapshot[key]
	return merged


func _snapshot_string(key: String, fallback: String) -> String:
	if not _interior_snapshot.has(key):
		return fallback
	var value := str(_interior_snapshot.get(key, fallback)).strip_edges()
	return value if value != "" else fallback


func _snapshot_int(key: String, fallback: int) -> int:
	if not _interior_snapshot.has(key):
		return fallback
	var raw_value = _interior_snapshot.get(key, fallback)
	if raw_value is int:
		return raw_value
	return int(str(raw_value))


func _snapshot_tech_level(tech_levels: Dictionary, key: String) -> int:
	if not tech_levels.has(key):
		return 0
	var raw_value = tech_levels.get(key, 0)
	if raw_value is int:
		return raw_value
	return int(str(raw_value))


func _get_tab_def(tab_id: String) -> Dictionary:
	if not PANEL_DEFS.has(tab_id):
		return {}
	return PANEL_DEFS.get(tab_id, {}) as Dictionary


func _get_section_def(tab_id: String, section_id: String) -> Dictionary:
	var tab_def: Dictionary = _get_tab_def(tab_id)
	for raw_section in tab_def.get("sections", []) as Array:
		var section: Dictionary = raw_section if raw_section is Dictionary else {}
		if str(section.get("id", "")).strip_edges() == section_id:
			return section
	return {}


func _resolve_section_payload(tab_id: String, section_id: String) -> Dictionary:
	var section_def: Dictionary = _get_section_def(tab_id, section_id)
	if section_def.is_empty():
		return {}
	var resolved_section: Dictionary = section_def.duplicate(true)
	var section_payloads: Dictionary = _interior_snapshot.get("section_payloads", {}) as Dictionary
	var tab_payloads: Dictionary = section_payloads.get(tab_id, {}) as Dictionary
	var override_payload: Dictionary = tab_payloads.get(section_id, {}) as Dictionary
	for key_variant in override_payload.keys():
		var key := str(key_variant).strip_edges()
		if key == "":
			continue
		resolved_section[key] = override_payload.get(key_variant)
	return resolved_section


func _get_default_section_id(tab_id: String) -> String:
	var tab_def: Dictionary = _get_tab_def(tab_id)
	for raw_section in tab_def.get("sections", []) as Array:
		var section: Dictionary = raw_section if raw_section is Dictionary else {}
		var section_id := str(section.get("id", "")).strip_edges()
		if not section_id.is_empty():
			return section_id
	return ""


func _build_child_page_payload(tab_id: String, section_id: String, section_payload: Dictionary) -> Dictionary:
	var city_name := _snapshot_string("city_name", DEFAULT_CITY_NAME)
	var payload := section_payload.duplicate(true)
	var preferred_view_kind := _get_preferred_view_kind(tab_id, section_id)
	payload["summary_title"] = str(payload.get("summary_title", payload.get("title", section_id))).strip_edges()
	payload["list_title"] = str(payload.get("list_title", payload.get("title", "列表"))).strip_edges()
	if not payload.has("summary_lines"):
		payload["summary_lines"] = [
			_format_section_hint(tab_id, section_id),
			"主城：%s | 开发点 %s | 军令 %s | 已占城池 %s" % [
				city_name,
				str(_snapshot_int("development_points", 0)),
				str(_snapshot_int("order", 0)),
				str(_snapshot_int("captured_city_count", 0)),
			],
		]
	payload["page_id"] = _compose_page_id(tab_id, section_id)
	payload["preferred_view_kind"] = str(payload.get("preferred_view_kind", preferred_view_kind)).strip_edges()
	var contract_boundary_kind := str(payload.get(
		"contract_boundary_kind",
		"specialized_scene_fallback" if preferred_view_kind != "block_schema" else "block_schema"
	)).strip_edges()
	if contract_boundary_kind == "":
		contract_boundary_kind = "specialized_scene_fallback" if preferred_view_kind != "block_schema" else "block_schema"
	payload["contract_boundary_kind"] = contract_boundary_kind
	payload["specialized_anchor_page_id"] = str(payload.get("specialized_anchor_page_id", _get_specialized_anchor_page_id(tab_id))).strip_edges()
	return payload


func _get_preferred_view_kind(tab_id: String, section_id: String) -> String:
	if BUILDING_SECTION_BY_TAB.has(tab_id) and str(BUILDING_SECTION_BY_TAB.get(tab_id, "")) == section_id:
		return "building_group_scene"
	if tab_id == "affairs" and section_id == "queue":
		return "affairs_queue_view"
	return "block_schema"


func _get_specialized_anchor_page_id(tab_id: String) -> String:
	return str(SPECIALIZED_ANCHOR_PAGE_BY_TAB.get(tab_id, "")).strip_edges()


func _has_nonempty_array(raw_value: Variant) -> bool:
	return raw_value is Array and not (raw_value as Array).is_empty()


func _coerce_string_array(raw_value: Variant) -> Array[String]:
	var result: Array[String] = []
	if raw_value is Array:
		for item in raw_value as Array:
			var text := str(item).strip_edges()
			if text != "":
				result.append(text)
	return result


func _extract_text_block_lines(section_payload: Dictionary) -> Array[String]:
	var raw_blocks: Variant = section_payload.get("content_blocks", [])
	if raw_blocks is Array:
		for raw_block in raw_blocks as Array:
			var block: Dictionary = raw_block as Dictionary if raw_block is Dictionary else {}
			if str(block.get("kind", "text_block")).strip_edges() != "text_block":
				continue
			var lines := _coerce_string_array(block.get("lines", []))
			if not lines.is_empty():
				return lines
	return []


func _get_section_ids(tab_def: Dictionary) -> Array:
	var section_ids: Array = []
	for raw_section in tab_def.get("sections", []) as Array:
		var section: Dictionary = raw_section if raw_section is Dictionary else {}
		var section_id := str(section.get("id", "")).strip_edges()
		if not section_id.is_empty():
			section_ids.append(section_id)
	return section_ids


func _format_section_hint(tab_id: String, section_id: String) -> String:
	var tab_def: Dictionary = _get_tab_def(tab_id)
	var section_def: Dictionary = _get_section_def(tab_id, section_id)
	var tab_label := str(tab_def.get("label", "内政"))
	var section_label := str(section_def.get("label", section_id))
	var summary_title := str(tab_def.get("summary_title", "内政面板"))
	return "当前切项：%s · %s | %s" % [tab_label, section_label, summary_title]


func _clear_control_children(node: Control) -> void:
	for child in node.get_children():
		child.queue_free()


func _on_host_back_requested() -> void:
	back_requested.emit()


func _on_host_close_requested() -> void:
	close_requested.emit()


func _on_host_tab_selected(tab_id: String) -> void:
	_select_top_tab(tab_id)


func _on_section_tab_selected(section_id: String, top_tab_id: String) -> void:
	if top_tab_id.is_empty():
		return
	var tab_def: Dictionary = _get_tab_def(top_tab_id)
	if tab_def.is_empty():
		return
	if not _get_section_ids(tab_def).has(section_id):
		return
	_current_section_by_tab[top_tab_id] = section_id
	var state: Dictionary = _ensure_tab_view(top_tab_id)
	var section_strip = state.get("section_strip")
	if section_strip != null:
		section_strip.set_active_tab(section_id)
	_render_section_content(top_tab_id, section_id)
	page_changed.emit(_compose_page_id(top_tab_id, section_id))


func _get_current_section_id(tab_id: String) -> String:
	return str(_current_section_by_tab.get(tab_id, _get_default_section_id(tab_id))).strip_edges()


func _compose_page_id(top_tab_id: String, section_id: String) -> String:
	var resolved_top_tab_id := top_tab_id.strip_edges()
	var resolved_section_id := section_id.strip_edges()
	if resolved_top_tab_id == "":
		return ""
	if resolved_section_id == "":
		return resolved_top_tab_id
	return "%s/%s" % [resolved_top_tab_id, resolved_section_id]


func _ensure_host():
	if _host == null:
		_host = get_node_or_null("InteriorHost")
	return _host
