extends Control
class_name AlliancePanel

signal back_requested
signal close_requested
signal page_changed(page_id: String)
signal page_action_requested(page_id: String, action_id: String)
signal action_requested(tab_id: String, action_id: String)

const DEFAULT_ALLIANCE_NAME := "逐鹿盟"
const DEFAULT_TOP_TAB_ID := "members"
const PANEL_TAB_STRIP_SCENE: PackedScene = preload("res://scenes/ui/panel_tab_strip.tscn")
const CHILD_PAGE_BLOCK_FACTORY_SCRIPT := preload("res://scripts/ui/child_page_block_factory.gd")

const TOP_TAB_ORDER := [
	"members",
	"applications",
	"battle_reports",
	"mail",
	"coordination",
]

const PANEL_DEFS := {
	"members": {
		"label": "成员",
		"summary_title": "成员总览",
		"summary_lines": [
			"成员页承接名册、分组、下属成员、官员架构、势力分布与军略。",
			"这里保留成员战功、坐标、州郡和角色信息的正式位置。",
		],
		"sections": [
			{
				"id": "overview",
				"label": "成员总览",
				"title": "成员名册",
				"item_cards": [
					{"title": "乌林义从军", "value": "盟主", "meta": "并州", "description": "战功 18.2k"},
					{"title": "滕海", "value": "副盟主", "meta": "兖州", "description": "战功 15.6k"},
					{"title": "天赐", "value": "官员", "meta": "巴州", "description": "战功 12.4k"},
					{"title": "青山", "value": "成员", "meta": "资源州", "description": "战功 9.8k"},
				],
				"content_blocks": [
					{
						"kind": "text_block",
						"title": "成员摘要",
						"lines": [
							"当前活跃成员：24",
							"在线成员：8",
							"主战队列：5",
						],
						"node_name": "AllianceMembersOverviewDefaultSummaryBlock",
					},
					{
						"kind": "text_block",
						"title": "补充",
						"lines": [
							"成员页保留战功、坐标、州郡和角色信息。",
							"成员个人资料页可以继续向下展开。",
						],
						"node_name": "AllianceMembersOverviewDefaultFooterBlock",
					},
				],
			},
			{
				"id": "groups",
				"label": "分组",
				"title": "同盟分组",
				"item_cards": [
					{"title": "一团", "value": "主攻", "meta": "同盟分组", "description": "默认分组卡位。"},
					{"title": "二团", "value": "驻守", "meta": "同盟分组", "description": "默认分组卡位。"},
					{"title": "三团", "value": "调度", "meta": "同盟分组", "description": "默认分组卡位。"},
					{"title": "预备组", "value": "待命", "meta": "同盟分组", "description": "默认分组卡位。"},
				],
				"content_blocks": [
					{
						"kind": "text_block",
						"title": "分组摘要",
						"lines": [
							"分组用于区分主力、协同和预备成员。",
							"分组切换不改变总体同盟身份。",
						],
						"node_name": "AllianceMembersGroupsDefaultSummaryBlock",
					},
				],
			},
			{
				"id": "subordinates",
				"label": "下属成员",
				"title": "下属成员",
				"item_cards": [
					{"title": "巴州组", "value": "5 人", "meta": "州郡队列", "description": "默认下属成员卡位。"},
					{"title": "兖州组", "value": "6 人", "meta": "州郡队列", "description": "默认下属成员卡位。"},
					{"title": "豫州组", "value": "4 人", "meta": "州郡队列", "description": "默认下属成员卡位。"},
					{"title": "资源州组", "value": "3 人", "meta": "州郡队列", "description": "默认下属成员卡位。"},
				],
				"content_blocks": [
					{
						"kind": "text_block",
						"title": "下属成员摘要",
						"lines": [
							"下属成员页与成员总览分开。",
							"这里更像组织下钻，而不是简单成员列表。",
						],
						"node_name": "AllianceMembersSubordinatesDefaultSummaryBlock",
					},
				],
			},
			{
				"id": "officers",
				"label": "官员架构",
				"title": "官职层级",
				"item_cards": [
					{"title": "盟主", "value": "官员架构", "meta": "官职层级", "description": "默认官员架构卡位。"},
					{"title": "副盟主", "value": "官员架构", "meta": "官职层级", "description": "默认官员架构卡位。"},
					{"title": "指挥官", "value": "官员架构", "meta": "官职层级", "description": "默认官员架构卡位。"},
					{"title": "后勤官", "value": "官员架构", "meta": "官职层级", "description": "默认官员架构卡位。"},
					{"title": "外交官", "value": "官员架构", "meta": "官职层级", "description": "默认官员架构卡位。"},
				],
				"content_blocks": [
					{
						"kind": "text_block",
						"title": "官员摘要",
						"lines": [
							"官员架构不是简单成员列表，而是组织图。",
							"后续可直接接官职权限、职责和审批链。",
						],
						"node_name": "AllianceMembersOfficersDefaultSummaryBlock",
					},
				],
			},
			{
				"id": "territory",
				"label": "势力分布",
				"title": "区域分布",
				"item_cards": [
					{"title": "并州前线", "value": "区域分布", "meta": "默认区域卡位", "description": "默认势力分布入口。"},
					{"title": "兖州缓冲带", "value": "区域分布", "meta": "默认区域卡位", "description": "默认势力分布入口。"},
					{"title": "巴州要点", "value": "区域分布", "meta": "默认区域卡位", "description": "默认势力分布入口。"},
					{"title": "资源州接力点", "value": "区域分布", "meta": "默认区域卡位", "description": "默认势力分布入口。"},
				],
				"content_blocks": [
					{
						"kind": "text_block",
						"title": "势力摘要",
						"lines": [
							"势力分布用于显示同盟影响范围和驻点密度。",
							"它和地图层共享事实，但不共享路由层级。",
						],
						"node_name": "AllianceMembersTerritoryDefaultSummaryBlock",
					},
				],
			},
			{
				"id": "strategy",
				"label": "军略",
				"title": "军略项",
				"item_cards": [
					{"title": "攻坚", "value": "军略项", "meta": "默认军略卡位", "description": "默认军略入口。"},
					{"title": "集中调动", "value": "军略项", "meta": "默认军略卡位", "description": "默认军略入口。"},
					{"title": "驻守轮换", "value": "军略项", "meta": "默认军略卡位", "description": "默认军略入口。"},
					{"title": "营造", "value": "军略项", "meta": "默认军略卡位", "description": "默认军略入口。"},
				],
				"content_blocks": [
					{
						"kind": "text_block",
						"title": "军略摘要",
						"lines": [
							"军略保持为策略子层，不埋进成员页。",
							"后续可继续接战区计划和执行节奏。",
						],
						"node_name": "AllianceMembersStrategyDefaultSummaryBlock",
					},
				],
			},
		],
	},
	"applications": {
		"label": "申请",
		"summary_title": "申请处理",
		"summary_lines": [
			"申请页承接同盟加入、审核和历史记录。",
			"后续可接审批流和通知流，不把申请塞回成员页。",
		],
		"sections": [
			{
				"id": "pending",
				"label": "待审",
				"title": "待审申请",
				"item_cards": [
					{"title": "巴州义从", "value": "加入申请", "meta": "备注：前线转入", "description": "默认待审申请卡位。"},
					{"title": "兖州前锋", "value": "加入申请", "meta": "备注：可驻守", "description": "默认待审申请卡位。"},
					{"title": "豫州预备", "value": "加入申请", "meta": "备注：待面试", "description": "默认待审申请卡位。"},
					{"title": "青州游侠", "value": "加入申请", "meta": "备注：补位队列", "description": "默认待审申请卡位。"},
				],
				"content_blocks": [
					{
						"kind": "text_block",
						"title": "审批摘要",
						"lines": [
							"待审申请保留来源、主推人、当前州郡和备注。",
							"审批动作后续可以接同盟通知与战区提醒。",
						],
						"node_name": "AllianceApplicationsPendingDefaultSummaryBlock",
					},
				],
			},
			{
				"id": "review",
				"label": "审批中",
				"title": "审批中",
				"item_cards": [
					{"title": "待审批", "value": "4", "meta": "审批节点", "description": "默认审批状态卡位。"},
					{"title": "待补材料", "value": "2", "meta": "审批节点", "description": "默认审批状态卡位。"},
					{"title": "待确认", "value": "1", "meta": "审批节点", "description": "默认审批状态卡位。"},
					{"title": "待分配", "value": "3", "meta": "审批节点", "description": "默认审批状态卡位。"},
				],
				"content_blocks": [
					{
						"kind": "text_block",
						"title": "审批摘要",
						"lines": [
							"审批中条目用于记录当前审批链状态。",
							"后续可接盟主、官员和指挥官的操作权限。",
						],
						"node_name": "AllianceApplicationsReviewDefaultSummaryBlock",
					},
				],
			},
			{
				"id": "history",
				"label": "历史记录",
				"title": "历史记录",
				"item_cards": [
					{"title": "昨日通过", "value": "3", "meta": "历史记录", "description": "默认审核历史卡位。"},
					{"title": "昨日拒绝", "value": "1", "meta": "历史记录", "description": "默认审核历史卡位。"},
					{"title": "过期申请", "value": "2", "meta": "历史记录", "description": "默认审核历史卡位。"},
					{"title": "本周归档", "value": "6", "meta": "历史记录", "description": "默认审核历史卡位。"},
				],
				"content_blocks": [
					{
						"kind": "text_block",
						"title": "历史摘要",
						"lines": [
							"历史记录用于追溯申请流和审批结果。",
							"后续可接筛选、检索和批量处理。",
						],
						"node_name": "AllianceApplicationsHistoryDefaultSummaryBlock",
					},
				],
			},
		],
	},
	"battle_reports": {
		"label": "战报",
		"summary_title": "战报总览",
		"summary_lines": [
			"战报页承接交战回放、重点战况与历史归档。",
			"后续可接战区过滤、时间线检索和指挥摘要。",
		],
		"sections": [
			{
				"id": "latest",
				"label": "最新战报",
				"title": "最新战报",
				"item_cards": [
					{"title": "并州北线交战", "value": "最新战报", "meta": "默认战报卡位", "description": "默认最新战报入口。"},
					{"title": "资源州抢点", "value": "最新战报", "meta": "默认战报卡位", "description": "默认最新战报入口。"},
					{"title": "夜袭回放", "value": "最新战报", "meta": "默认战报卡位", "description": "默认最新战报入口。"},
					{"title": "营地损失复盘", "value": "最新战报", "meta": "默认战报卡位", "description": "默认最新战报入口。"},
				],
				"content_blocks": [
					{
						"kind": "text_block",
						"title": "战报摘要",
						"lines": [
							"战报以时间线和战区维度组织。",
							"点击后可继续接战斗详情与行动批注。",
						],
						"node_name": "AllianceBattleReportsLatestDefaultSummaryBlock",
					},
				],
			},
			{
				"id": "highlights",
				"label": "重点战况",
				"title": "重点战况",
				"item_cards": [
					{"title": "关键战斗", "value": "重点节点", "meta": "默认重点战况卡位", "description": "默认重点战况入口。"},
					{"title": "重伤队伍", "value": "重点节点", "meta": "默认重点战况卡位", "description": "默认重点战况入口。"},
					{"title": "突破点", "value": "重点节点", "meta": "默认重点战况卡位", "description": "默认重点战况入口。"},
					{"title": "驻守变更", "value": "重点节点", "meta": "默认重点战况卡位", "description": "默认重点战况入口。"},
				],
				"content_blocks": [
					{
						"kind": "text_block",
						"title": "重点摘要",
						"lines": [
							"重点战况用于快速定位战报价值点。",
							"后续可直接接战区视图和战报标记。",
						],
						"node_name": "AllianceBattleReportsHighlightsDefaultSummaryBlock",
					},
				],
			},
			{
				"id": "archive",
				"label": "归档",
				"title": "战报归档",
				"item_cards": [
					{"title": "本周归档", "value": "战报归档", "meta": "默认归档卡位", "description": "默认战报归档入口。"},
					{"title": "本月归档", "value": "战报归档", "meta": "默认归档卡位", "description": "默认战报归档入口。"},
					{"title": "历史归档", "value": "战报归档", "meta": "默认归档卡位", "description": "默认战报归档入口。"},
					{"title": "战区分类", "value": "战报归档", "meta": "默认归档卡位", "description": "默认战报归档入口。"},
				],
				"content_blocks": [
					{
						"kind": "text_block",
						"title": "归档摘要",
						"lines": [
							"归档用于沉淀历史交战记录。",
							"后续可接筛选、导出和复盘标签。",
						],
						"node_name": "AllianceBattleReportsArchiveDefaultSummaryBlock",
					},
				],
			},
		],
	},
	"mail": {
		"label": "邮件",
		"summary_title": "邮件与通知",
		"summary_lines": [
			"邮件页承接同盟通知、系统信和已读归档。",
			"后续可接筛选、批量处理和跳转关联。",
		],
		"sections": [
			{
				"id": "inbox",
				"label": "收件箱",
				"title": "收件箱",
				"item_cards": [
					{"title": "同盟通知", "value": "攻城集合", "meta": "默认收件箱卡位", "description": "默认收件箱入口。"},
					{"title": "战区调度", "value": "驻守更替", "meta": "默认收件箱卡位", "description": "默认收件箱入口。"},
					{"title": "系统信", "value": "建筑升级提醒", "meta": "默认收件箱卡位", "description": "默认收件箱入口。"},
					{"title": "成员留言", "value": "申请回执", "meta": "默认收件箱卡位", "description": "默认收件箱入口。"},
				],
				"content_blocks": [
					{
						"kind": "text_block",
						"title": "收件摘要",
						"lines": [
							"收件箱保留战区、同盟和系统信混合入口。",
							"后续可按标签和来源继续筛选。",
						],
						"node_name": "AllianceMailInboxDefaultSummaryBlock",
					},
				],
			},
			{
				"id": "system",
				"label": "系统信",
				"title": "系统信",
				"item_cards": [
					{"title": "建筑升级提醒", "value": "系统信", "meta": "默认系统通知卡位", "description": "默认系统信入口。"},
					{"title": "补给提醒", "value": "系统信", "meta": "默认系统通知卡位", "description": "默认系统信入口。"},
					{"title": "驻守变更", "value": "系统信", "meta": "默认系统通知卡位", "description": "默认系统信入口。"},
					{"title": "申请结果", "value": "系统信", "meta": "默认系统通知卡位", "description": "默认系统信入口。"},
				],
				"content_blocks": [
					{
						"kind": "text_block",
						"title": "系统摘要",
						"lines": [
							"系统信用于承接规则、状态和提醒。",
							"后续可接世界主壳与同盟面板联动。",
						],
						"node_name": "AllianceMailSystemDefaultSummaryBlock",
					},
				],
			},
			{
				"id": "archive",
				"label": "归档",
				"title": "邮件归档",
				"item_cards": [
					{"title": "已读归档", "value": "邮件归档", "meta": "默认归档卡位", "description": "默认邮件归档入口。"},
					{"title": "本周归档", "value": "邮件归档", "meta": "默认归档卡位", "description": "默认邮件归档入口。"},
					{"title": "历史邮件", "value": "邮件归档", "meta": "默认归档卡位", "description": "默认邮件归档入口。"},
					{"title": "待整理", "value": "邮件归档", "meta": "默认归档卡位", "description": "默认邮件归档入口。"},
				],
				"content_blocks": [
					{
						"kind": "text_block",
						"title": "归档摘要",
						"lines": [
							"归档用于沉淀已读消息和历史通知。",
							"后续可接批量归档与搜索。",
						],
						"node_name": "AllianceMailArchiveDefaultSummaryBlock",
					},
				],
			},
		],
	},
	"coordination": {
		"label": "协同目标",
		"summary_title": "协同目标",
		"summary_lines": [
			"协同目标页承接攻城、驻守、补给和执行进度。",
			"后续可接目标卡、里程碑和协同日志。",
		],
		"sections": [
			{
				"id": "board",
				"label": "目标看板",
				"title": "目标看板",
				"item_cards": [
					{"title": "攻城目标", "value": "目标看板", "meta": "默认协同卡位", "description": "默认目标看板入口。"},
					{"title": "驻点维护", "value": "目标看板", "meta": "默认协同卡位", "description": "默认目标看板入口。"},
					{"title": "补给线", "value": "目标看板", "meta": "默认协同卡位", "description": "默认目标看板入口。"},
					{"title": "协同防守", "value": "目标看板", "meta": "默认协同卡位", "description": "默认目标看板入口。"},
				],
				"content_blocks": [
					{
						"kind": "text_block",
						"title": "看板摘要",
						"lines": [
							"目标看板用于承接当前同盟协同主线。",
							"可继续扩展为攻城、驻守和补给三类目标。",
						],
						"node_name": "AllianceCoordinationBoardDefaultSummaryBlock",
					},
				],
			},
			{
				"id": "progress",
				"label": "执行进度",
				"title": "执行进度",
				"item_cards": [
					{"title": "待执行", "value": "执行进度", "meta": "默认进度卡位", "description": "默认执行进度入口。"},
					{"title": "进行中", "value": "执行进度", "meta": "默认进度卡位", "description": "默认执行进度入口。"},
					{"title": "已完成", "value": "执行进度", "meta": "默认进度卡位", "description": "默认执行进度入口。"},
					{"title": "延期复盘", "value": "执行进度", "meta": "默认进度卡位", "description": "默认执行进度入口。"},
				],
				"content_blocks": [
					{
						"kind": "text_block",
						"title": "进度摘要",
						"lines": [
							"执行进度用于记录当前协同目标状态。",
							"后续可接里程碑和责任人。",
						],
						"node_name": "AllianceCoordinationProgressDefaultSummaryBlock",
					},
				],
			},
			{
				"id": "log",
				"label": "协同日志",
				"title": "协同日志",
				"item_cards": [
					{"title": "调动记录", "value": "协同日志", "meta": "默认日志卡位", "description": "默认协同日志入口。"},
					{"title": "执行变更", "value": "协同日志", "meta": "默认日志卡位", "description": "默认协同日志入口。"},
					{"title": "协同批注", "value": "协同日志", "meta": "默认日志卡位", "description": "默认协同日志入口。"},
					{"title": "复盘摘要", "value": "协同日志", "meta": "默认日志卡位", "description": "默认协同日志入口。"},
				],
				"content_blocks": [
					{
						"kind": "text_block",
						"title": "日志摘要",
						"lines": [
							"协同日志用于回看目标推进与执行变化。",
							"后续可接成员批注和任务回执。",
						],
						"node_name": "AllianceCoordinationLogDefaultSummaryBlock",
					},
				],
			},
		],
	},
}

@onready var _host = $AllianceHost

var _alliance_snapshot: Dictionary = {
	"alliance_name": DEFAULT_ALLIANCE_NAME,
	"member_count": 24,
	"online_count": 8,
	"territory_count": 3,
	"goal_count": 2,
}
var _tab_views: Dictionary = {}
var _current_top_tab_id: String = ""
var _current_section_by_tab: Dictionary = {}
var _last_emitted_page_id: String = ""
var _suppress_page_changed := false


func _ready() -> void:
	_bind_host_signals()
	_rebuild_panel()


func set_alliance_snapshot(snapshot: Dictionary) -> void:
	_alliance_snapshot = snapshot.duplicate(true)
	_suppress_page_changed = true
	_rebuild_panel()
	_suppress_page_changed = false


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
	var sections: Array = tab_def.get("sections", []) as Array
	if sections.is_empty():
		return
	var section_ids: Array = []
	for raw_section in sections:
		var section: Dictionary = raw_section if raw_section is Dictionary else {}
		var current_section_id := str(section.get("id", "")).strip_edges()
		if not current_section_id.is_empty():
			section_ids.append(current_section_id)
	if not section_ids.has(section_id):
		return
	_current_section_by_tab[top_tab_id] = section_id
	var state: Dictionary = _ensure_tab_view(top_tab_id)
	var section_strip = state.get("section_strip")
	if section_strip != null:
		section_strip.set_active_tab(section_id)
	_render_section_content(top_tab_id, section_id)
	_emit_page_changed(_compose_page_id(top_tab_id, section_id))


func _bind_host_signals() -> void:
	if _host == null:
		push_error("[alliance-panel] host is missing.")
		return
	if not _host.back_requested.is_connected(Callable(self, "_on_host_back_requested")):
		_host.back_requested.connect(Callable(self, "_on_host_back_requested"))
	if not _host.close_requested.is_connected(Callable(self, "_on_host_close_requested")):
		_host.close_requested.connect(Callable(self, "_on_host_close_requested"))
	if not _host.tab_selected.is_connected(Callable(self, "_on_host_tab_selected")):
		_host.tab_selected.connect(Callable(self, "_on_host_tab_selected"))


func _rebuild_panel() -> void:
	_tab_views.clear()
	var preserved_top_tab := _current_top_tab_id if not _current_top_tab_id.is_empty() else DEFAULT_TOP_TAB_ID
	_host.set_panel_title("同盟")
	_host.set_back_button_label("返回")
	_host.set_close_button_label("关闭")
	_host.set_empty_state_text("请选择一个同盟功能入口。")
	_host.set_title_font_size(24)
	_host.set_empty_state_font_size(15)
	_host.set_tab_settings(_build_top_tab_settings())
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
	_current_top_tab_id = tab_id
	_host.set_active_tab(tab_id)
	_host.set_content_node(_ensure_tab_view(tab_id).get("root") as Node)
	_emit_page_changed(_compose_page_id(tab_id, _get_current_section_id(tab_id)))


func _ensure_tab_view(tab_id: String) -> Dictionary:
	if _tab_views.has(tab_id):
		return _tab_views[tab_id]
	var tab_def: Dictionary = _get_tab_def(tab_id)
	if tab_def.is_empty():
		return {}

	var root := ScrollContainer.new()
	root.name = "AllianceTabRoot_%s" % tab_id
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.mouse_filter = Control.MOUSE_FILTER_PASS

	var root_vbox := VBoxContainer.new()
	root_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root_vbox.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root_vbox.add_theme_constant_override("separation", 12)
	root.add_child(root_vbox)

	root_vbox.add_child(_build_summary_card(tab_id))

	var section_strip := _build_section_strip(tab_id)
	root_vbox.add_child(section_strip)

	var section_host := Control.new()
	section_host.name = "SectionHost"
	section_host.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	section_host.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root_vbox.add_child(section_host)

	var default_section_id := _get_default_section_id(tab_id)
	_current_section_by_tab[tab_id] = _current_section_by_tab.get(tab_id, default_section_id)
	var current_section_id := str(_current_section_by_tab.get(tab_id, default_section_id))
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
	var alliance_name := _snapshot_string("alliance_name", DEFAULT_ALLIANCE_NAME)
	var member_count := _snapshot_int("member_count", 24)
	var online_count := _snapshot_int("online_count", 8)
	var territory_count := _snapshot_int("territory_count", 3)
	var goal_count := _snapshot_int("goal_count", 2)
	var commander_count := _snapshot_int("commander_count", 0)
	var recent_action_count := _snapshot_int("recent_action_count", 0)
	var report_count := _snapshot_int("report_count", 0)
	var card := PanelContainer.new()
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 14)
	margin.add_theme_constant_override("margin_top", 12)
	margin.add_theme_constant_override("margin_right", 14)
	margin.add_theme_constant_override("margin_bottom", 12)

	var vbox := VBoxContainer.new()
	vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	vbox.add_theme_constant_override("separation", 6)
	vbox.add_child(_make_label("%s · %s" % [alliance_name, str(tab_def.get("label", "同盟"))], 22))
	vbox.add_child(_make_label("成员 %d | 在线 %d | 领地 %d | 协同目标 %d" % [member_count, online_count, territory_count, goal_count], 14))
	if commander_count > 0 or recent_action_count > 0 or report_count > 0:
		vbox.add_child(_make_label("指挥官 %d | 协同行动 %d | 战报 %d" % [commander_count, recent_action_count, report_count], 13))
	vbox.add_child(_make_label(str(tab_def.get("summary_title", "同盟面板")), 16))
	for line in _resolve_tab_summary_lines(tab_id, tab_def):
		vbox.add_child(_make_label(str(line), 13, true))
	var current_section_id := str(_current_section_by_tab.get(tab_id, _get_default_section_id(tab_id)))
	vbox.add_child(_make_label(_format_section_hint(tab_id, current_section_id), 13, true))

	margin.add_child(vbox)
	card.add_child(margin)
	return card


func _build_section_strip(tab_id: String) -> Control:
	var section_strip = PANEL_TAB_STRIP_SCENE.instantiate()
	section_strip.empty_state_text = "暂无同盟切项"
	section_strip.tab_button_min_width = 100.0
	section_strip.tab_button_text_size = 13
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
		section_view = _make_label("等待同盟切项加载。", 14, true)
	resolved_section_host.add_child(section_view)


func _build_section_view(tab_id: String, section_id: String) -> Control:
	var section_def: Dictionary = _resolve_section_payload(tab_id, section_id)
	if section_def.is_empty():
		return _make_label("暂无可用切项。", 14, true)
	return CHILD_PAGE_BLOCK_FACTORY_SCRIPT.new().build_section_page(
		_build_child_page_payload(tab_id, section_id, section_def),
		Callable(self, "_on_action_button_pressed")
	)


func _make_label(text: String, font_size: int, wrap: bool = false) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", font_size)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART if wrap else TextServer.AUTOWRAP_OFF
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return label


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


func _resolve_tab_summary_lines(tab_id: String, tab_def: Dictionary) -> Array:
	var summary_lines_by_tab: Dictionary = _alliance_snapshot.get("tab_summary_lines", {}) as Dictionary
	if summary_lines_by_tab.has(tab_id):
		var dynamic_lines: Variant = summary_lines_by_tab.get(tab_id, [])
		if dynamic_lines is Array and not (dynamic_lines as Array).is_empty():
			return dynamic_lines as Array
	return tab_def.get("summary_lines", []) as Array


func _resolve_section_payload(tab_id: String, section_id: String) -> Dictionary:
	var section_def: Dictionary = _get_section_def(tab_id, section_id)
	if section_def.is_empty():
		return {}
	var resolved_section: Dictionary = section_def.duplicate(true)
	var section_payloads: Dictionary = _alliance_snapshot.get("section_payloads", {}) as Dictionary
	var tab_payloads: Dictionary = section_payloads.get(tab_id, {}) as Dictionary
	var override_payload: Dictionary = tab_payloads.get(section_id, {}) as Dictionary
	for key_variant in override_payload.keys():
		var key := str(key_variant).strip_edges()
		if key == "":
			continue
		resolved_section[key] = override_payload.get(key_variant)
	return resolved_section


func _build_child_page_payload(tab_id: String, section_id: String, section_payload: Dictionary) -> Dictionary:
	var payload := section_payload.duplicate(true)
	payload["summary_title"] = str(payload.get("summary_title", payload.get("title", section_id))).strip_edges()
	payload["list_title"] = str(payload.get("list_title", payload.get("title", "列表"))).strip_edges()
	if not payload.has("summary_lines"):
		payload["summary_lines"] = [
			_format_section_hint(tab_id, section_id),
			"同盟：%s | 成员 %s | 在线 %s | 目标 %s" % [
				_snapshot_string("alliance_name", DEFAULT_ALLIANCE_NAME),
				str(_snapshot_int("member_count", 0)),
				str(_snapshot_int("online_count", 0)),
				str(_snapshot_int("goal_count", 0)),
			],
		]
	payload["page_id"] = _compose_page_id(tab_id, section_id)
	payload["contract_boundary_kind"] = str(payload.get("contract_boundary_kind", "block_schema")).strip_edges()
	if str(payload.get("contract_boundary_kind", "")).strip_edges() == "":
		payload["contract_boundary_kind"] = "block_schema"
	return payload


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


func _get_default_section_id(tab_id: String) -> String:
	var tab_def: Dictionary = _get_tab_def(tab_id)
	for raw_section in tab_def.get("sections", []) as Array:
		var section: Dictionary = raw_section if raw_section is Dictionary else {}
		var section_id := str(section.get("id", "")).strip_edges()
		if not section_id.is_empty():
			return section_id
	return ""


func _format_section_hint(tab_id: String, section_id: String) -> String:
	var tab_def: Dictionary = _get_tab_def(tab_id)
	var section_def: Dictionary = _get_section_def(tab_id, section_id)
	var tab_label := str(tab_def.get("label", "同盟"))
	var section_label := str(section_def.get("label", section_id))
	var summary_title := str(tab_def.get("summary_title", "同盟面板"))
	return "当前切项：%s · %s | %s" % [tab_label, section_label, summary_title]


func _snapshot_string(key: String, fallback: String) -> String:
	if not _alliance_snapshot.has(key):
		return fallback
	var value := str(_alliance_snapshot.get(key, fallback)).strip_edges()
	return value if value != "" else fallback


func _snapshot_int(key: String, fallback: int) -> int:
	if not _alliance_snapshot.has(key):
		return fallback
	var raw_value = _alliance_snapshot.get(key, fallback)
	if raw_value is int:
		return raw_value
	return int(str(raw_value))


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
	_current_section_by_tab[top_tab_id] = section_id
	var state: Dictionary = _ensure_tab_view(top_tab_id)
	var section_strip = state.get("section_strip")
	if section_strip != null:
		section_strip.set_active_tab(section_id)
	_render_section_content(top_tab_id, section_id)
	_emit_page_changed(_compose_page_id(top_tab_id, section_id))


func _emit_page_changed(page_id: String) -> void:
	var resolved_page_id := page_id.strip_edges()
	if resolved_page_id == "":
		return
	if _suppress_page_changed:
		_last_emitted_page_id = resolved_page_id
		return
	if resolved_page_id == _last_emitted_page_id:
		return
	_last_emitted_page_id = resolved_page_id
	page_changed.emit(resolved_page_id)


func _on_action_button_pressed(action_id: String) -> void:
	if _current_top_tab_id == "":
		return
	page_action_requested.emit(get_active_page_id(), action_id)
	action_requested.emit(_current_top_tab_id, action_id)


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
