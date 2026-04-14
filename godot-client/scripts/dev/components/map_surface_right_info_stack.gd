@tool
extends Control
class_name MapSurfaceRightInfoStack

signal ai_player_panel_requested(panel_state: Dictionary)
signal ai_player_panel_changed(panel_state: Dictionary)

const UiThemeTokensScript = preload("res://scripts/ui/ui_theme_tokens.gd")
const ARMY_RAIL_SCENE = preload("res://scenes/dev/components/map_surface_army_rail.tscn")
const CITY_RAIL_SCENE = preload("res://scenes/dev/components/map_surface_city_rail.tscn")
const TAG_RAIL_SCENE = preload("res://scenes/dev/components/map_surface_tag_rail.tscn")

const SAMPLE_STATE: Dictionary = {
	"rightInfoTabs": ["armies", "cities", "tags"],
	"activeRightTab": "armies",
	"headerTitle": "战区情报",
	"headerSubtitle": "部队 / 城池 / 标记切换。",
	"summaryLine": "部队 3 | 城池 2 | 标记 3",
	"aiPlayerCard": {
		"playerName": "青州锋线营",
		"controlLabel": "AI托管",
		"allianceName": "汉室前锋",
		"cityName": "洛阳",
		"strategyLabel": "稳健推进，先补线再压进。",
		"personaLabel": "稳健推进，先补线再压进。",
		"currentTaskLabel": "虎牢方向铺路与北门换防",
		"memorySummary": "两支队伍已出城，一支留守补位。",
		"squadSummary": "队伍 3 | 武将 9",
		"detailButtonLabel": "查看"
	},
	"aiStatusOptions": [
		{"id": "executing", "label": "接受执行", "summary": "正在向虎牢方向铺路。", "tone": "success"},
		{"id": "pending", "label": "迟疑确认", "summary": "北门换防仍待主公确认。", "tone": "warning"},
		{"id": "adjust", "label": "建议调整", "summary": "建议先补北门再推东线。", "tone": "warning"},
		{"id": "report", "label": "最新回报", "summary": "两队已出城，一队留守补位。", "tone": "info"}
	],
	"activeAiStatusId": "executing",
	"aiPlayerPanel": {
		"title": "AI 玩家位",
		"playerName": "青州锋线营",
		"controlLabel": "AI托管",
		"allianceName": "汉室前锋",
		"cityName": "洛阳",
		"strategyLabel": "稳健推进，先补线再压进。",
		"personaLabel": "稳健推进，先补线再压进。",
		"currentTaskLabel": "虎牢方向铺路与北门换防",
		"memorySummary": "两支队伍已出城，一支留守补位。",
		"squadCount": "3 支队伍",
		"heroCount": "9 名武将",
		"currentTarget": "虎牢方向铺路与北门换防",
		"recentAction": "两支队伍已出城，一支留守补位。",
		"detailSummary": "已收口为最小 AI 玩家前台，只保留身份、人设、任务、记忆与接令反馈。",
		"detailActions": ["查看队伍", "查看武将", "调整策略"]
	},
	"armyCards": [
		{
			"title": "先登营",
			"subtitle": "洛阳城外前推队列。",
			"status": "行军中",
			"statusTone": "success",
			"portraitId": "100001",
			"location": "(32, 19)",
			"metrics": ["兵力 18.4K", "士气 87", "ETA 02:14"],
			"chips": ["先手压制", "前线主攻"],
			"footer": "编队稳定，前压节奏良好。"
		},
		{
			"title": "河防军",
			"subtitle": "负责渡口与护粮路线。",
			"status": "待命",
			"statusTone": "info",
			"portraitId": "100003",
			"location": "(18, 27)",
			"metrics": ["兵力 12.1K", "补给 94%", "巡逻 3 线"],
			"chips": ["护粮", "河道监控"],
			"footer": "需要在黄昏前补一次巡逻。"
		},
		{
			"title": "预备矛阵",
			"subtitle": "快速增援与反打编组。",
			"status": "警戒",
			"statusTone": "warning",
			"portraitId": "100007",
			"location": "(07, 09)",
			"metrics": ["兵力 9.8K", "战备 高", "命令 2"],
			"chips": ["机动", "待命"],
			"footer": "维持机动，等待下一轮指令。"
		}
	],
	"cityCards": [
		{
			"title": "洛阳",
			"subtitle": "核心主城，征兵与仓储都在运转。",
			"status": "核心",
			"statusTone": "success",
			"detail": "都城产能和同盟协同都集中在这里。",
			"location": "(24, 16)",
			"stateBlock": ["等级 6", "粮 23.0K", "队列 4"],
			"chips": ["征兵", "仓储", "统帅"],
			"footer": "核心城池需要持续保持在线状态。"
		},
		{
			"title": "虎牢关",
			"subtitle": "北线前沿关口。",
			"status": "护盾",
			"statusTone": "info",
			"detail": "承担侦查回传与阻击压力。",
			"location": "(11, 05)",
			"stateBlock": ["等级 4", "驻军 7.2K", "威胁 中"],
			"chips": ["防御", "前哨"],
			"footer": "需要补一次耐久和驻军。"
		}
	],
	"tagCards": [
		{
			"title": "前线压力",
			"subtitle": "东侧敌军正在集结。",
			"status": "警报",
			"statusTone": "danger",
			"detail": "需要优先派斥候和机动队确认推进节奏。",
			"group": "战斗",
			"owner": "指挥部",
			"priority": "高",
			"signals": "信号 6",
			"chips": ["18 格范围", "升级中"],
			"footer": "用于驱动底部动作栏与地图聚焦。"
		},
		{
			"title": "补给走廊",
			"subtitle": "粮线整体稳定，但有一段待维护。",
			"status": "稳定",
			"statusTone": "success",
			"detail": "与城池 rail 联动展示补给状态。",
			"group": "后勤",
			"owner": "军需官",
			"priority": "中",
			"signals": "信号 2",
			"chips": ["覆盖 91%", "维护"],
			"footer": "保持主界面与后勤态势一致。"
		},
		{
			"title": "联盟烽火",
			"subtitle": "共享标记点，供盟友协同调度。",
			"status": "已标记",
			"statusTone": "warning",
			"detail": "用于外交联动和集结提醒。",
			"group": "外交",
			"owner": "联盟",
			"priority": "低",
			"signals": "信号 1",
			"chips": ["共享", "协同"],
			"footer": "标记点会持续存在于右侧 rail。"
		}
	]
}

const TAB_STYLES := {
	"armies": "refresh",
	"cities": "export",
	"tags": "advance_tick",
}

const TAB_LABELS := {
	"armies": "部队",
	"cities": "城池",
	"tags": "标记",
}

const TAB_SUBTITLES := {
	"armies": "武将头像、状态块和行军指标常驻在这里。",
	"cities": "城池状态、产能和防御摘要通过独立 rail 展开。",
	"tags": "风险标签、同盟标签和战区提示统一走标签 rail。",
}

const DRAWER_EXPANDED_LEFT := 18.0
const DRAWER_COLLAPSED_LEFT := 104.0

var _ui_theme_tokens = UiThemeTokensScript.new()

var _frame_panel: PanelContainer
var _header_title_label: Label
var _header_subtitle_label: Label
var _summary_label: Label
var _tabs_row: HBoxContainer
var _tabs_panel: PanelContainer
var _content_host: Control
var _accent_bar: ColorRect
var _drawer_handle: ColorRect
var _ai_profile_panel: PanelContainer
var _ai_badge_label: Label
var _ai_name_label: Label
var _ai_role_label: Label
var _ai_status_chip_label: Label
var _ai_chip_row: HBoxContainer
var _ai_persona_label: Label
var _ai_task_label: Label
var _ai_feedback_label: Label
var _ai_memory_label: Label
var _ai_detail_button: Button
var _embed_preview_panel: PanelContainer
var _embed_preview_list: VBoxContainer
var _tab_buttons: Dictionary = {}
var _rail_instances: Dictionary = {}
var _ai_status_buttons: Dictionary = {}

var _active_tab_key: String = "armies"
var _compact_embed: bool = false
var _preview_state: Dictionary = {}
var _drawer_locked_open: bool = true
var _drawer_hovered: bool = false
var _active_ai_status_id: String = ""


func _ready() -> void:
	_build_shell()
	apply_preview_state({})


func apply_preview_state(state: Dictionary) -> void:
	_build_shell()
	_preview_state = _resolve_effective_state(state)
	_compact_embed = _resolve_compact_embed(_preview_state)
	_active_tab_key = _resolve_active_tab_key(_preview_state)
	_render_header(_preview_state, _active_tab_key)
	_render_ai_profile(_preview_state)
	_render_tabs(_preview_state, _active_tab_key)
	_render_active_rail(_preview_state, _active_tab_key)
	_update_drawer_state()


func _build_shell() -> void:
	if _frame_panel != null:
		return

	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	clip_contents = false

	_frame_panel = PanelContainer.new()
	_frame_panel.name = "Frame"
	_frame_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_frame_panel.offset_left = DRAWER_EXPANDED_LEFT
	_frame_panel.offset_top = 26.0
	_frame_panel.offset_right = -2.0
	_frame_panel.offset_bottom = -4.0
	_frame_panel.clip_contents = true
	_frame_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	_frame_panel.mouse_entered.connect(_on_drawer_mouse_entered)
	_frame_panel.mouse_exited.connect(_on_drawer_mouse_exited)
	_apply_panel_style(_frame_panel, "panel", "observability_panel")
	add_child(_frame_panel)

	var margin := _create_margin_container(_frame_panel, "Margin", 8, 6, 8, 8)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var body := _create_vbox(margin, "Body", 4)
	body.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL

	var handle_row := _create_hbox(body, "HandleRow", 0)
	handle_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	handle_row.alignment = BoxContainer.ALIGNMENT_CENTER
	_drawer_handle = _create_color_rect(handle_row, "DrawerHandle", Color(0.77, 0.85, 0.94, 0.52), 3.0)
	_drawer_handle.custom_minimum_size = Vector2(44.0, 3.0)
	_drawer_handle.mouse_filter = Control.MOUSE_FILTER_STOP
	_drawer_handle.gui_input.connect(_on_drawer_handle_gui_input)

	var top_strip := _create_vbox(body, "TopStrip", 2)
	top_strip.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	var title_row := _create_hbox(top_strip, "TitleRow", 4)
	title_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	var title_col := _create_vbox(title_row, "TitleColumn", 1)
	title_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	_header_title_label = _create_label(title_col, "Title", "战区情报", 12)
	_header_title_label.modulate = Color(0.95, 0.98, 1.0, 0.98)
	_header_subtitle_label = _create_label(title_col, "Subtitle", "部队 / 城池 / 标记切换。", 8)
	_header_subtitle_label.modulate = Color(0.84, 0.90, 0.97, 0.9)
	_header_subtitle_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	_header_subtitle_label.clip_text = true
	_header_subtitle_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS

	var title_spacer := Control.new()
	title_spacer.name = "TitleSpacer"
	title_spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_row.add_child(title_spacer)

	_summary_label = _create_label(title_row, "Summary", "部队 3 | 城池 2 | 标记 3", 8)
	_summary_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_summary_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_summary_label.size_flags_horizontal = Control.SIZE_SHRINK_END
	_summary_label.modulate = Color(0.76, 0.86, 0.96, 0.94)
	_summary_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	_summary_label.clip_text = true
	_summary_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS

	_accent_bar = _create_color_rect(top_strip, "AccentBar", Color(0.34, 0.81, 0.68, 0.92), 1.0)

	_ai_profile_panel = _create_panel(body, "AiProfilePanel")
	_ai_profile_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_ai_profile_panel.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	_ai_profile_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	_ai_profile_panel.gui_input.connect(_on_ai_profile_panel_gui_input)
	_apply_panel_style(_ai_profile_panel, "panel", "hud_bottom_bar")
	var ai_margin := _create_margin_container(_ai_profile_panel, "AiProfileMargin", 7, 6, 7, 6)
	var ai_stack := _create_vbox(ai_margin, "AiProfileStack", 3)
	ai_stack.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	var ai_top_row := _create_hbox(ai_stack, "AiTopRow", 5)
	ai_top_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ai_top_row.alignment = BoxContainer.ALIGNMENT_BEGIN

	var badge_panel := _create_panel(ai_top_row, "AiBadgePanel")
	_apply_panel_style(badge_panel, "panel", "hud_top_left")
	badge_panel.custom_minimum_size = Vector2(34.0, 26.0)
	var badge_margin := _create_margin_container(badge_panel, "AiBadgeMargin", 6, 3, 6, 3)
	_ai_badge_label = _create_label(badge_margin, "AiBadgeLabel", "AI", _small_font_size(10))
	_ai_badge_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_ai_badge_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_ai_badge_label.modulate = Color(0.99, 0.97, 0.92, 0.98)

	var ai_identity_col := _create_vbox(ai_top_row, "AiIdentityColumn", 1)
	ai_identity_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_ai_name_label = _create_label(ai_identity_col, "AiNameLabel", "青州锋线营", _small_font_size(12))
	_ai_name_label.modulate = Color(0.97, 0.99, 1.0, 0.98)
	_ai_role_label = _create_label(ai_identity_col, "AiRoleLabel", "同盟：汉室前锋 · 主城：洛阳", _small_font_size(9))
	_ai_role_label.modulate = Color(0.82, 0.90, 0.97, 0.92)
	_ai_role_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	_ai_role_label.clip_text = true
	_ai_role_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS

	var ai_status_chip_panel := _create_panel(ai_top_row, "AiStatusChipPanel")
	_apply_panel_style(ai_status_chip_panel, "panel", "hud_bottom_bar")
	var ai_status_margin := _create_margin_container(ai_status_chip_panel, "AiStatusChipMargin", 7, 3, 7, 3)
	_ai_status_chip_label = _create_label(ai_status_margin, "AiStatusChipLabel", "AI托管", _small_font_size(8))
	_ai_status_chip_label.modulate = Color(0.99, 0.98, 0.92, 0.98)

	_ai_chip_row = _create_hbox(ai_stack, "AiChipRow", 4)
	_ai_chip_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	_ai_persona_label = _create_label(ai_stack, "AiPersonaLabel", "人设：稳健推进，先补线再压进。", _small_font_size(9))
	_ai_persona_label.modulate = Color(0.92, 0.96, 1.0, 0.96)
	_ai_persona_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	_ai_persona_label.clip_text = true
	_ai_persona_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS

	_ai_task_label = _create_label(ai_stack, "AiTaskLabel", "当前任务：虎牢方向铺路与北门换防", _small_font_size(9))
	_ai_task_label.modulate = Color(0.92, 0.96, 1.0, 0.96)
	_ai_task_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	_ai_task_label.clip_text = true
	_ai_task_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS

	_ai_feedback_label = _create_label(ai_stack, "AiFeedbackLabel", "接令反馈：执行中 · 正在向虎牢方向铺路。", _small_font_size(9))
	_ai_feedback_label.modulate = Color(0.86, 0.93, 0.99, 0.9)
	_ai_feedback_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	_ai_feedback_label.clip_text = true
	_ai_feedback_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS

	var ai_bottom_row := _create_hbox(ai_stack, "AiBottomRow", 4)
	ai_bottom_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	_ai_memory_label = _create_label(ai_bottom_row, "AiMemoryLabel", "最近记忆：两支队伍已出城，一支留守补位。", _small_font_size(8))
	_ai_memory_label.modulate = Color(0.76, 0.86, 0.95, 0.84)
	_ai_memory_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	_ai_memory_label.clip_text = true
	_ai_memory_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_ai_memory_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	_ai_detail_button = _create_button(ai_bottom_row, "AiDetailButton", "查看", _small_font_size(8), 72.0)
	_ai_detail_button.focus_mode = Control.FOCUS_NONE
	_apply_button_style(_ai_detail_button, "refresh")
	_ai_detail_button.pressed.connect(_on_ai_detail_button_pressed)

	_tabs_panel = _create_panel(body, "TabsPanel")
	_tabs_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_apply_panel_style(_tabs_panel, "panel", "hud_bottom_bar")
	var tabs_margin := _create_margin_container(_tabs_panel, "TabsMargin", 4, 2, 4, 2)
	tabs_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_tabs_row = _create_hbox(tabs_margin, "TabsRow", 3)
	_tabs_row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_tabs_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	_content_host = Control.new()
	_content_host.name = "RailHost"
	_content_host.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_content_host.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_content_host.custom_minimum_size = Vector2(0.0, 214.0)
	_content_host.clip_contents = true
	body.add_child(_content_host)

	_embed_preview_panel = PanelContainer.new()
	_embed_preview_panel.name = "EmbedPreviewPanel"
	_embed_preview_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_embed_preview_panel.clip_contents = true
	_embed_preview_panel.visible = false
	_apply_panel_style(_embed_preview_panel, "panel", "hud_bottom_bar")
	_content_host.add_child(_embed_preview_panel)

	var preview_margin := _create_margin_container(_embed_preview_panel, "EmbedPreviewMargin", 6, 6, 6, 6)
	preview_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_embed_preview_list = _create_vbox(preview_margin, "EmbedPreviewList", 4)
	_embed_preview_list.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_embed_preview_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_embed_preview_list.size_flags_vertical = Control.SIZE_SHRINK_BEGIN

	_mount_rail_instances()


func _mount_rail_instances() -> void:
	if not _rail_instances.is_empty():
		return

	var scene_map := {
		"armies": ARMY_RAIL_SCENE,
		"cities": CITY_RAIL_SCENE,
		"tags": TAG_RAIL_SCENE,
	}
	for tab_key in scene_map.keys():
		var packed_scene: PackedScene = scene_map.get(tab_key) as PackedScene
		var instance := packed_scene.instantiate() as Control
		instance.name = "%sRail" % _to_node_suffix(str(tab_key))
		instance.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		instance.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		instance.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
		instance.custom_minimum_size = Vector2.ZERO
		instance.clip_contents = true
		instance.visible = false
		_content_host.add_child(instance)
		_rail_instances[str(tab_key)] = instance


func _resolve_effective_state(raw_state: Dictionary) -> Dictionary:
	var effective := SAMPLE_STATE.duplicate(true)
	if raw_state.is_empty():
		return effective

	effective["rightInfoTabs"] = _resolve_tabs(raw_state, effective)
	effective["activeRightTab"] = _resolve_string(raw_state.get("activeRightTab", effective.get("activeRightTab", "armies")), str(effective.get("activeRightTab", "armies")))
	effective["headerTitle"] = _resolve_string(raw_state.get("headerTitle", effective.get("headerTitle", "")), str(effective.get("headerTitle", "")))
	effective["headerSubtitle"] = _resolve_string(raw_state.get("headerSubtitle", effective.get("headerSubtitle", "")), str(effective.get("headerSubtitle", "")))
	effective["summaryLine"] = _resolve_string(raw_state.get("summaryLine", effective.get("summaryLine", "")), str(effective.get("summaryLine", "")))
	effective["compactEmbed"] = _resolve_compact_embed(raw_state, bool(effective.get("compactEmbed", true)))
	effective["aiPlayerCard"] = _resolve_dictionary(raw_state.get("aiPlayerCard", null), effective.get("aiPlayerCard", {}))
	effective["aiPlayerPanel"] = _resolve_dictionary(raw_state.get("aiPlayerPanel", null), effective.get("aiPlayerPanel", {}))
	effective["aiStatusOptions"] = _resolve_dictionary_array(raw_state.get("aiStatusOptions", effective.get("aiStatusOptions", [])))
	effective["activeAiStatusId"] = _resolve_string(raw_state.get("activeAiStatusId", effective.get("activeAiStatusId", "")), str(effective.get("activeAiStatusId", "")))

	for key in ["armyCards", "cityCards", "tagCards"]:
		var raw_cards: Variant = raw_state.get(key, null)
		if raw_cards is Array and not (raw_cards as Array).is_empty():
			effective[key] = _normalize_card_list(raw_cards as Array)

	return effective


func _resolve_tabs(raw_state: Dictionary, fallback_state: Dictionary) -> Array:
	var raw_tabs: Variant = raw_state.get("rightInfoTabs", null)
	if raw_tabs is Array:
		var normalized := _normalize_string_array(raw_tabs)
		if not normalized.is_empty():
			return normalized
	var fallback_tabs: Variant = fallback_state.get("rightInfoTabs", [])
	if fallback_tabs is Array:
		return _normalize_string_array(fallback_tabs)
	return ["armies", "cities", "tags"]


func _resolve_active_tab_key(state: Dictionary) -> String:
	var tabs := _normalize_string_array(state.get("rightInfoTabs", []))
	if tabs.is_empty():
		tabs = ["armies", "cities", "tags"]
	var requested: String = str(state.get("activeRightTab", "armies")).strip_edges().to_lower()
	for tab in tabs:
		var normalized_tab := str(tab).strip_edges().to_lower()
		if normalized_tab == requested:
			return normalized_tab
	return str(tabs[0]).strip_edges().to_lower()


func _render_header(state: Dictionary, active_tab_key: String) -> void:
	var header_title := _resolve_string(state.get("headerTitle", ""), "")
	if header_title == "":
		header_title = "情报抽屉"
	if _compact_embed:
		_header_title_label.text = _format_tab_label(active_tab_key)
	else:
		_header_title_label.text = "%s · %s" % [header_title, _format_tab_label(active_tab_key)]

	var header_subtitle := _resolve_string(state.get("headerSubtitle", ""), "")
	if header_subtitle == "":
		header_subtitle = str(TAB_SUBTITLES.get(active_tab_key, "右侧 rail 模块。"))
	if _compact_embed:
		header_subtitle = ""
	else:
		header_subtitle = "右下抽屉 · %s" % header_subtitle
	_header_subtitle_label.text = header_subtitle
	_header_subtitle_label.visible = header_subtitle != ""

	var summary_line := _resolve_string(state.get("summaryLine", ""), "")
	if summary_line == "":
		summary_line = _build_summary_line(state, active_tab_key)
	if _compact_embed:
		summary_line = "部 %d · 城 %d · 标 %d" % [
			_get_cards_by_key(state, "armyCards").size(),
			_get_cards_by_key(state, "cityCards").size(),
			_get_cards_by_key(state, "tagCards").size(),
		]
	else:
		summary_line = "抽屉总览 · %s" % summary_line
	_summary_label.text = summary_line

	var accent := _tab_tone_color(active_tab_key)
	_header_title_label.modulate = accent
	_header_title_label.add_theme_font_size_override("font_size", _small_font_size(18))
	_header_subtitle_label.add_theme_font_size_override("font_size", _small_font_size(10))
	_summary_label.add_theme_font_size_override("font_size", _small_font_size(9))
	if _accent_bar != null:
		_accent_bar.color = accent
	if _drawer_handle != null:
		_drawer_handle.color = accent.lightened(0.25)


func _render_ai_profile(state: Dictionary) -> void:
	if _ai_profile_panel == null:
		return
	var player_card := _resolve_dictionary(state.get("aiPlayerCard", {}), SAMPLE_STATE.get("aiPlayerCard", {}))
	var active_status := _resolve_active_ai_status(state)
	_active_ai_status_id = _resolve_string(active_status.get("id", ""), _active_ai_status_id)
	var player_name := _resolve_string(player_card.get("playerName", "AI 玩家位"), "AI 玩家位")
	var alliance_name := _resolve_string(player_card.get("allianceName", "未入盟"), "未入盟")
	var city_name := _resolve_string(player_card.get("cityName", "未定城"), "未定城")
	var control_label := _resolve_string(player_card.get("controlLabel", "AI托管"), "AI托管")
	var persona_label := _resolve_string(player_card.get("personaLabel", player_card.get("strategyLabel", "稳健推进，先补线再压进。")), "稳健推进，先补线再压进。")
	var current_task_label := _resolve_string(player_card.get("currentTaskLabel", "虎牢方向铺路与北门换防"), "虎牢方向铺路与北门换防")
	var memory_summary := _resolve_string(player_card.get("memorySummary", player_card.get("recentAction", "两支队伍已出城，一支留守补位。")), "两支队伍已出城，一支留守补位。")
	var detail_button_label := _resolve_string(player_card.get("detailButtonLabel", "查看"), "查看")
	var status_label := _resolve_string(active_status.get("label", "执行中"), "执行中")
	var status_summary := _resolve_string(active_status.get("summary", "等待本轮状态。"), "等待本轮状态。")
	var status_tone := _resolve_string(active_status.get("tone", "info"), "info")

	if _ai_badge_label != null:
		_ai_badge_label.text = "AI"
		_ai_badge_label.add_theme_font_size_override("font_size", _small_font_size(10))
	if _ai_name_label != null:
		_ai_name_label.text = player_name
		_ai_name_label.add_theme_font_size_override("font_size", _small_font_size(12))
	if _ai_role_label != null:
		_ai_role_label.text = "同盟：%s · 主城：%s" % [alliance_name, city_name]
		_ai_role_label.add_theme_font_size_override("font_size", _small_font_size(9))
	if _ai_status_chip_label != null:
		_ai_status_chip_label.text = control_label
		_ai_status_chip_label.add_theme_font_size_override("font_size", _small_font_size(8))
	if _ai_persona_label != null:
		_ai_persona_label.text = "人设：%s" % persona_label
		_ai_persona_label.add_theme_font_size_override("font_size", _small_font_size(9))
	if _ai_task_label != null:
		_ai_task_label.text = "当前任务：%s" % current_task_label
		_ai_task_label.add_theme_font_size_override("font_size", _small_font_size(9))
	if _ai_feedback_label != null:
		_ai_feedback_label.text = "接令反馈：%s · %s" % [status_label, status_summary]
		_ai_feedback_label.add_theme_font_size_override("font_size", _small_font_size(9))
	if _ai_memory_label != null:
		_ai_memory_label.text = "最近记忆：%s" % memory_summary
		_ai_memory_label.visible = memory_summary != ""
		_ai_memory_label.add_theme_font_size_override("font_size", _small_font_size(8))
	if _ai_detail_button != null:
		_ai_detail_button.text = detail_button_label
		_ai_detail_button.add_theme_font_size_override("font_size", _small_font_size(8))
	_clear_children(_ai_chip_row)
	_ai_status_buttons.clear()
	for option in _resolve_ai_status_options(state):
		var option_id := _resolve_string(option.get("id", ""), "")
		if option_id == "":
			continue
		var button := _create_button(_ai_chip_row, "%sStatusButton" % _to_node_suffix(option_id), _resolve_string(option.get("label", option_id), option_id), _small_font_size(7), 0.0)
		button.focus_mode = Control.FOCUS_NONE
		button.toggle_mode = true
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.pressed.connect(_on_ai_status_button_pressed.bind(option_id))
		_apply_button_style(button, _button_token_for_tone(_resolve_string(option.get("tone", "info"), "info")))
		_style_ai_status_button(button, option_id == _active_ai_status_id)
		_ai_status_buttons[option_id] = button
	_style_ai_status_chip(status_tone)


func _render_tabs(state: Dictionary, active_tab_key: String) -> void:
	_clear_children(_tabs_row)
	_tab_buttons.clear()
	var tabs: Array = _normalize_string_array(state.get("rightInfoTabs", []))
	if tabs.is_empty():
		tabs = ["armies", "cities", "tags"]

	for tab in tabs:
		var normalized_tab := str(tab).strip_edges().to_lower()
		var button := _create_button(_tabs_row, "%sTab" % _to_node_suffix(normalized_tab), _format_tab_label(normalized_tab), _tab_font_size(), _tab_button_min_width())
		button.toggle_mode = true
		button.focus_mode = Control.FOCUS_NONE
		button.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		button.pressed.connect(_on_tab_pressed.bind(normalized_tab))
		_apply_button_style(button, TAB_STYLES.get(normalized_tab, "refresh"))
		_style_tab_button(button, normalized_tab == active_tab_key)
		_tab_buttons[normalized_tab] = button

	var spacer := Control.new()
	spacer.name = "TabsSpacer"
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_tabs_row.add_child(spacer)

	if not _compact_embed:
		var hint := _create_label(_tabs_row, "TabsHint", "切换抽屉页。", _small_font_size(11))
		hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		hint.modulate = Color(0.76, 0.84, 0.93, 0.88)


func _render_active_rail(state: Dictionary, active_tab_key: String) -> void:
	if _content_host != null:
		_content_host.custom_minimum_size = Vector2(0.0, 160.0 if _compact_embed else 188.0)

	if _embed_preview_panel != null:
		_embed_preview_panel.visible = false
	for tab_key in _rail_instances.keys():
		var normalized_tab := str(tab_key)
		var instance := _rail_instances.get(normalized_tab) as Control
		if instance == null:
			continue
		var is_active := normalized_tab == active_tab_key
		instance.visible = is_active
		if is_active and instance.has_method("apply_preview_state"):
			instance.call("apply_preview_state", _build_rail_state(state, active_tab_key))


func _update_drawer_state() -> void:
	if _frame_panel == null:
		return
	var collapsed := _should_collapse_drawer()
	_frame_panel.offset_left = DRAWER_COLLAPSED_LEFT if collapsed else DRAWER_EXPANDED_LEFT
	if _tabs_panel != null:
		_tabs_panel.visible = not collapsed
	if _content_host != null:
		_content_host.visible = not collapsed
	if _accent_bar != null:
		_accent_bar.visible = not collapsed
	if _summary_label != null:
		_summary_label.visible = not collapsed
	if _header_subtitle_label != null:
		_header_subtitle_label.visible = (not collapsed) and _header_subtitle_label.text != ""
	if _ai_chip_row != null:
		_ai_chip_row.visible = true
	if _ai_task_label != null:
		_ai_task_label.visible = true
	if _ai_feedback_label != null:
		_ai_feedback_label.visible = true
	if _ai_memory_label != null:
		_ai_memory_label.visible = _ai_memory_label.text != ""
	if _ai_profile_panel != null:
		_ai_profile_panel.custom_minimum_size = Vector2(0.0, 96.0 if collapsed else 104.0)
	if _header_title_label != null:
		if collapsed:
			_header_title_label.text = "AI 玩家"
			_header_title_label.add_theme_font_size_override("font_size", _small_font_size(11))
		else:
			var header_title := _resolve_string(_preview_state.get("headerTitle", ""), "")
			if header_title == "":
				header_title = "情报抽屉"
			_header_title_label.text = "%s · %s" % [header_title, _format_tab_label(_active_tab_key)]
			_header_title_label.add_theme_font_size_override("font_size", _small_font_size(14))


func _should_collapse_drawer() -> bool:
	return not _drawer_locked_open


func _on_drawer_mouse_entered() -> void:
	_drawer_hovered = true
	_update_drawer_state()


func _on_drawer_mouse_exited() -> void:
	_drawer_hovered = false
	_update_drawer_state()


func _on_drawer_handle_gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mouse_event := event as InputEventMouseButton
		if mouse_event.button_index == MOUSE_BUTTON_LEFT and mouse_event.pressed:
			_drawer_locked_open = not _drawer_locked_open
			_drawer_hovered = _drawer_locked_open
			accept_event()
			_update_drawer_state()


func _on_ai_profile_panel_gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mouse_event := event as InputEventMouseButton
		if mouse_event.button_index == MOUSE_BUTTON_LEFT and mouse_event.pressed:
			accept_event()
			_emit_ai_player_panel_requested()


func _on_ai_detail_button_pressed() -> void:
	_emit_ai_player_panel_requested()


func _on_ai_status_button_pressed(status_id: String) -> void:
	var normalized_status_id := status_id.strip_edges()
	if normalized_status_id == "":
		return
	_active_ai_status_id = normalized_status_id
	_preview_state["activeAiStatusId"] = normalized_status_id
	_render_ai_profile(_preview_state)
	ai_player_panel_changed.emit(_build_ai_player_panel_state(_preview_state))


func _render_embed_preview(state: Dictionary, active_tab_key: String) -> void:
	if _embed_preview_panel == null or _embed_preview_list == null:
		return
	_embed_preview_panel.visible = true
	_clear_children(_embed_preview_list)
	_create_embed_summary_card(state, active_tab_key)

	var cards := _get_cards_for_tab(state, active_tab_key)
	var preview_count := mini(cards.size(), 1 if _compact_embed else 3)
	for index in range(preview_count):
		var card_data := cards[index] as Dictionary
		_create_embed_item_card(card_data, active_tab_key, index)


func _create_embed_summary_card(state: Dictionary, active_tab_key: String) -> PanelContainer:
	var panel := _create_panel(_embed_preview_list, "EmbedSummary")
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_apply_panel_style(panel, "panel", "hud_bottom_bar")
	var margin := _create_margin_container(panel, "Margin", 6, 5, 6, 5)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var vbox := _create_vbox(margin, "VBox", 2)
	vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var title_row := _create_hbox(vbox, "TitleRow", 4)
	title_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var title := _create_label(title_row, "Title", "%s总览" % _format_tab_label(active_tab_key), _small_font_size(13))
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.modulate = Color(0.97, 0.98, 0.92, 0.98)
	var tone_chip := _create_chip(title_row, "ToneChip", _build_active_summary(state, _cards_key_for_tab(active_tab_key), _format_tab_label(active_tab_key)), "hud_bottom_bar", _small_font_size(10))
	tone_chip.modulate = _tab_tone_color(active_tab_key)

	var subtitle := _resolve_string(state.get("headerSubtitle", ""), str(TAB_SUBTITLES.get(active_tab_key, "")))
	var subtitle_label := _create_label(vbox, "Subtitle", subtitle, _small_font_size(9))
	subtitle_label.modulate = Color(0.82, 0.89, 0.96, 0.92)
	return panel


func _create_embed_item_card(card_data: Dictionary, active_tab_key: String, index: int) -> PanelContainer:
	var panel := _create_panel(_embed_preview_list, "EmbedItem_%d" % index)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_apply_panel_style(panel, "panel", "hud_bottom_bar")
	var margin := _create_margin_container(panel, "Margin", 6, 5, 6, 5)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var vbox := _create_vbox(margin, "VBox", 2)
	vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var title_row := _create_hbox(vbox, "TitleRow", 4)
	title_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var title := _create_label(title_row, "Title", _resolve_string(card_data.get("title", ""), "%s %d" % [_format_tab_label(active_tab_key), index + 1]), _small_font_size(12))
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.modulate = Color(0.98, 0.99, 0.95, 0.98)
	var status := _resolve_string(card_data.get("status", ""), "")
	if status != "":
		var status_chip := _create_chip(title_row, "StatusChip", status, "hud_bottom_bar", _small_font_size(8))
		status_chip.modulate = _tab_tone_color(active_tab_key)

	var subtitle_text := _resolve_embed_subtitle(card_data, active_tab_key)
	if subtitle_text != "":
		var subtitle_label := _create_label(vbox, "Subtitle", subtitle_text, _small_font_size(9))
		subtitle_label.modulate = Color(0.83, 0.89, 0.95, 0.92)

	var meta_row := _create_hbox(vbox, "MetaRow", 4)
	meta_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for text in _resolve_embed_meta(card_data, active_tab_key):
		_create_chip(meta_row, "MetaChip", text, "hud_bottom_bar", _small_font_size(8))
	_create_spacer(meta_row, "MetaSpacer")
	return panel


func _resolve_embed_subtitle(card_data: Dictionary, active_tab_key: String) -> String:
	match active_tab_key:
		"armies":
			var metrics := _normalize_string_array(card_data.get("metrics", []))
			var joined_metrics := " | ".join(metrics.slice(0, mini(metrics.size(), 2)))
			var location := _resolve_string(card_data.get("location", ""), "")
			return "%s%s" % [joined_metrics, " · %s" % location if location != "" else ""]
		"cities":
			var detail := _resolve_string(card_data.get("detail", ""), "")
			if detail != "":
				return detail
			return _resolve_string(card_data.get("subtitle", ""), "")
		"tags":
			var detail_text := _resolve_string(card_data.get("detail", ""), "")
			if detail_text != "":
				return detail_text
			return _resolve_string(card_data.get("subtitle", ""), "")
		_:
			return _resolve_string(card_data.get("subtitle", ""), "")


func _resolve_embed_meta(card_data: Dictionary, active_tab_key: String) -> Array:
	match active_tab_key:
		"armies":
			var chips := _normalize_string_array(card_data.get("chips", []))
			return chips.slice(0, mini(chips.size(), 2))
		"cities":
			var city_meta: Array = []
			var location := _resolve_string(card_data.get("location", ""), "")
			if location != "":
				city_meta.append(location)
			var state_block := _normalize_string_array(card_data.get("stateBlock", []))
			for item in state_block.slice(0, mini(state_block.size(), 2)):
				city_meta.append(str(item))
			return city_meta
		"tags":
			var tag_meta: Array = []
			for key in ["group", "owner", "priority"]:
				var value := _resolve_string(card_data.get(key, ""), "")
				if value != "":
					tag_meta.append(value)
			return tag_meta.slice(0, mini(tag_meta.size(), 3))
		_:
			return []


func _build_rail_state(state: Dictionary, active_tab_key: String) -> Dictionary:
	match active_tab_key:
		"armies":
			return {
				"showRailHeader": false,
				"railTitle": "部队态势",
				"railSubtitle": "兵力、士气、坐标与命令摘要。",
				"summaryLine": _build_active_summary(state, "armyCards", "部队"),
				"railTone": "success",
				"compactEmbed": _resolve_compact_embed(state, _compact_embed),
				"armyItems": _build_army_items(_get_cards_for_tab(state, "armies")),
			}
		"cities":
			return {
				"showRailHeader": false,
				"railTitle": "城池态势",
				"railSubtitle": "等级、驻防、产能与防御摘要。",
				"summaryLine": _build_active_summary(state, "cityCards", "城池"),
				"railTone": "warning",
				"compactEmbed": _resolve_compact_embed(state, _compact_embed),
				"cityItems": _build_city_items(_get_cards_for_tab(state, "cities")),
			}
		"tags":
			return {
				"showRailHeader": false,
				"railTitle": "标记态势",
				"railSubtitle": "战区风险、联盟标记与提示摘要。",
				"summaryLine": _build_active_summary(state, "tagCards", "标记"),
				"railTone": "danger",
				"compactEmbed": _resolve_compact_embed(state, _compact_embed),
				"tagItems": _build_tag_items(_get_cards_for_tab(state, "tags")),
			}
		_:
			return {
				"showRailHeader": false,
				"compactEmbed": _resolve_compact_embed(state, _compact_embed),
				"summaryLine": "",
			}


func _build_active_summary(state: Dictionary, key: String, label: String) -> String:
	var items := _get_cards_by_key(state, key)
	return "%s %d 项" % [label, items.size()]


func _build_summary_line(state: Dictionary, active_tab_key: String) -> String:
	return "部队 %d | 城池 %d | 标记 %d | 当前 %s" % [
		_get_cards_by_key(state, "armyCards").size(),
		_get_cards_by_key(state, "cityCards").size(),
		_get_cards_by_key(state, "tagCards").size(),
		_format_tab_label(active_tab_key),
	]


func _build_army_items(raw_cards: Array) -> Array:
	var items: Array = []
	var default_portraits := ["100001", "100003", "100007", "100011"]
	var default_locations := ["(32, 19)", "(18, 27)", "(07, 09)", "(41, 12)"]
	for index in range(raw_cards.size()):
		var card_data := raw_cards[index] as Dictionary
		var item := card_data.duplicate(true)
		var metrics: Array = _normalize_string_array(item.get("metrics", []))
		if metrics.is_empty():
			metrics = _normalize_stats(card_data)
		item["metrics"] = metrics

		var chips: Array = _normalize_string_array(item.get("chips", []))
		item["chips"] = chips

		if _resolve_string(item.get("statusTone", ""), "") == "":
			item["statusTone"] = _resolve_card_tone(card_data)
		if _resolve_string(item.get("location", ""), "") == "":
			item["location"] = default_locations[index % default_locations.size()]
		if _resolve_string(item.get("portraitPath", ""), "") == "" and _resolve_string(item.get("portraitId", ""), "") == "":
			item["portraitId"] = default_portraits[index % default_portraits.size()]
		items.append(item)
	return items


func _build_city_items(raw_cards: Array) -> Array:
	var items: Array = []
	var default_locations := ["(24, 16)", "(11, 05)", "(41, 12)", "(08, 31)"]
	for index in range(raw_cards.size()):
		var card_data := raw_cards[index] as Dictionary
		var item := card_data.duplicate(true)
		if _resolve_string(item.get("statusTone", ""), "") == "":
			item["statusTone"] = _resolve_card_tone(card_data)
		if _resolve_string(item.get("detail", ""), "") == "":
			item["detail"] = _resolve_card_footer(card_data)
		var state_block: Array = _normalize_string_array(item.get("stateBlock", []))
		if state_block.is_empty():
			state_block = _normalize_stats(card_data)
		item["stateBlock"] = state_block
		item["chips"] = _normalize_string_array(item.get("chips", []))
		if _resolve_string(item.get("location", ""), "") == "":
			item["location"] = default_locations[index % default_locations.size()]
		items.append(item)
	return items


func _build_tag_items(raw_cards: Array) -> Array:
	var items: Array = []
	var default_groups := ["战斗", "后勤", "外交", "战区"]
	var default_owners := ["指挥部", "军需官", "联盟", "情报组"]
	var default_priorities := ["高", "中", "低", "中"]
	for index in range(raw_cards.size()):
		var card_data := raw_cards[index] as Dictionary
		var item := card_data.duplicate(true)
		if _resolve_string(item.get("statusTone", ""), "") == "":
			item["statusTone"] = _resolve_card_tone(card_data)
		if _resolve_string(item.get("detail", ""), "") == "":
			item["detail"] = _resolve_card_footer(card_data)
		if _resolve_string(item.get("group", ""), "") == "":
			item["group"] = default_groups[index % default_groups.size()]
		if _resolve_string(item.get("owner", ""), "") == "":
			item["owner"] = default_owners[index % default_owners.size()]
		if _resolve_string(item.get("priority", ""), "") == "":
			item["priority"] = default_priorities[index % default_priorities.size()]
		var stats := _normalize_stats(card_data)
		if _resolve_string(item.get("signals", ""), "") == "" and not stats.is_empty():
			item["signals"] = str(stats[0])
		var chips: Array = _normalize_string_array(item.get("chips", []))
		if chips.is_empty() and stats.size() > 1:
			chips = stats.slice(1, stats.size())
		item["chips"] = chips
		items.append(item)
	return items


func _style_tab_button(button: Button, is_active: bool) -> void:
	if button == null:
		return
	button.modulate = Color(0.98, 0.98, 1.0, 1.0) if is_active else Color(0.82, 0.88, 0.95, 0.86)
	button.add_theme_color_override("font_color", Color(0.99, 0.98, 0.94, 1.0) if is_active else Color(0.86, 0.92, 0.98, 0.98))
	button.add_theme_color_override("font_hover_color", Color(1.0, 1.0, 0.96, 1.0))
	button.add_theme_color_override("font_pressed_color", Color(1.0, 1.0, 0.90, 1.0))
	button.add_theme_color_override("font_focus_color", Color(1.0, 1.0, 0.96, 1.0))
	button.button_pressed = is_active


func _on_tab_pressed(tab_key: String) -> void:
	if tab_key.strip_edges() == "":
		return
	_active_tab_key = tab_key.strip_edges().to_lower()
	_render_header(_preview_state, _active_tab_key)
	_render_tabs(_preview_state, _active_tab_key)
	_render_active_rail(_preview_state, _active_tab_key)
	_update_drawer_state()


func _get_cards_for_tab(state: Dictionary, tab_key: String) -> Array:
	return _get_cards_by_key(state, _cards_key_for_tab(tab_key))


func _get_cards_by_key(state: Dictionary, key: String) -> Array:
	var raw_cards: Variant = state.get(key, [])
	if raw_cards is Array and not (raw_cards as Array).is_empty():
		return _normalize_card_list(raw_cards as Array)
	var fallback_cards: Variant = SAMPLE_STATE.get(key, [])
	if fallback_cards is Array:
		return _normalize_card_list(fallback_cards as Array)
	return []


func _cards_key_for_tab(tab_key: String) -> String:
	match tab_key.strip_edges().to_lower():
		"armies":
			return "armyCards"
		"cities":
			return "cityCards"
		"tags":
			return "tagCards"
		_:
			return "armyCards"


func _normalize_card_list(raw_cards: Array) -> Array:
	var cards: Array = []
	for raw_item in raw_cards:
		if raw_item is Dictionary:
			cards.append((raw_item as Dictionary).duplicate(true))
		elif raw_item is String:
			var text := str(raw_item).strip_edges()
			if text != "":
				cards.append({
					"title": text,
					"subtitle": "",
					"status": "",
					"stats": [],
					"footer": "",
					"tone": "info",
				})
	return cards


func _normalize_stats(card_data: Dictionary) -> Array:
	var raw_stats: Variant = card_data.get("stats", [])
	if raw_stats is Array:
		return _normalize_string_array(raw_stats)
	if raw_stats is Dictionary:
		var stat_pairs: Array = []
		for key_variant in (raw_stats as Dictionary).keys():
			var value := str((raw_stats as Dictionary).get(key_variant, "")).strip_edges()
			var key := str(key_variant).strip_edges()
			if key != "" and value != "":
				stat_pairs.append("%s %s" % [key, value])
		return stat_pairs
	if raw_stats is String:
		var stat_text := str(raw_stats).strip_edges()
		if stat_text != "":
			return [stat_text]
	return []


func _resolve_card_tone(card_data: Dictionary) -> String:
	var tone := _resolve_string(card_data.get("tone", ""), "")
	if tone != "":
		return tone
	tone = _resolve_string(card_data.get("statusTone", ""), "")
	if tone != "":
		return tone
	return "info"


func _resolve_card_footer(card_data: Dictionary) -> String:
	var footer := _resolve_string(card_data.get("footer", ""), "")
	if footer != "":
		return footer
	footer = _resolve_string(card_data.get("note", ""), "")
	if footer != "":
		return footer
	footer = _resolve_string(card_data.get("summary", ""), "")
	if footer != "":
		return footer
	return ""


func _tab_tone_color(tab_key: String) -> Color:
	match tab_key.strip_edges().to_lower():
		"armies":
			return Color(0.34, 0.81, 0.68, 1.0)
		"cities":
			return Color(0.95, 0.72, 0.20, 1.0)
		"tags":
			return Color(0.88, 0.47, 0.91, 1.0)
		_:
			return Color(0.84, 0.90, 0.97, 1.0)


func _resolve_string(raw_value: Variant, fallback: String) -> String:
	var value := str(raw_value).strip_edges()
	if value == "":
		return fallback
	return value


func _resolve_dictionary(raw_value: Variant, fallback: Variant = {}) -> Dictionary:
	if raw_value is Dictionary:
		return (raw_value as Dictionary).duplicate(true)
	if fallback is Dictionary:
		return (fallback as Dictionary).duplicate(true)
	return {}


func _resolve_dictionary_array(raw_value: Variant) -> Array:
	var items: Array = []
	if raw_value is Array:
		for item in raw_value:
			if item is Dictionary:
				items.append((item as Dictionary).duplicate(true))
	return items


func _resolve_ai_status_options(state: Dictionary) -> Array:
	var options := _resolve_dictionary_array(state.get("aiStatusOptions", []))
	if options.is_empty():
		options = _resolve_dictionary_array(SAMPLE_STATE.get("aiStatusOptions", []))
	return options


func _resolve_active_ai_status(state: Dictionary) -> Dictionary:
	var options := _resolve_ai_status_options(state)
	var requested_id := _resolve_string(state.get("activeAiStatusId", _active_ai_status_id), _active_ai_status_id)
	for option in options:
		var option_dict := option as Dictionary
		if _resolve_string(option_dict.get("id", ""), "") == requested_id:
			return option_dict.duplicate(true)
	if not options.is_empty():
		return (options[0] as Dictionary).duplicate(true)
	return {}


func _button_token_for_tone(tone: String) -> String:
	match tone.strip_edges().to_lower():
		"success":
			return "advance_tick"
		"warning":
			return "export"
		"danger":
			return "refresh"
		_:
			return "refresh"


func _style_ai_status_chip(tone: String) -> void:
	if _ai_status_chip_label == null:
		return
	var panel := _ai_status_chip_label.get_parent().get_parent() as PanelContainer
	if panel == null:
		return
	var normalized := tone.strip_edges().to_lower()
	var tone_color := Color(0.82, 0.90, 0.97, 0.98)
	match normalized:
		"success":
			tone_color = Color(0.71, 0.94, 0.76, 0.98)
		"warning":
			tone_color = Color(0.98, 0.86, 0.60, 0.98)
		"danger":
			tone_color = Color(0.98, 0.68, 0.70, 0.98)
	_apply_panel_style(panel, "panel", "hud_bottom_bar")
	panel.modulate = tone_color


func _style_ai_status_button(button: Button, is_active: bool) -> void:
	if button == null:
		return
	button.button_pressed = is_active
	button.add_theme_font_size_override("font_size", _small_font_size(7))
	button.modulate = Color(1.0, 1.0, 1.0, 1.0) if is_active else Color(0.84, 0.90, 0.96, 0.86)


func _build_ai_player_panel_state(state: Dictionary) -> Dictionary:
	var player_card := _resolve_dictionary(state.get("aiPlayerCard", {}), SAMPLE_STATE.get("aiPlayerCard", {}))
	var panel_state := _resolve_dictionary(state.get("aiPlayerPanel", {}), SAMPLE_STATE.get("aiPlayerPanel", {}))
	var active_status := _resolve_active_ai_status(state)
	panel_state["playerName"] = _resolve_string(panel_state.get("playerName", player_card.get("playerName", "AI 玩家位")), _resolve_string(player_card.get("playerName", "AI 玩家位"), "AI 玩家位"))
	panel_state["controlLabel"] = _resolve_string(panel_state.get("controlLabel", player_card.get("controlLabel", "AI托管")), "AI托管")
	panel_state["allianceName"] = _resolve_string(panel_state.get("allianceName", player_card.get("allianceName", "未入盟")), "未入盟")
	panel_state["cityName"] = _resolve_string(panel_state.get("cityName", player_card.get("cityName", "未定城")), "未定城")
	panel_state["personaLabel"] = _resolve_string(panel_state.get("personaLabel", player_card.get("personaLabel", player_card.get("strategyLabel", "稳健推进，先补线再压进。"))), "稳健推进，先补线再压进。")
	panel_state["strategyLabel"] = panel_state["personaLabel"]
	panel_state["currentTaskLabel"] = _resolve_string(panel_state.get("currentTaskLabel", panel_state.get("currentTarget", player_card.get("currentTaskLabel", "虎牢方向铺路与北门换防"))), "虎牢方向铺路与北门换防")
	panel_state["memorySummary"] = _resolve_string(panel_state.get("memorySummary", panel_state.get("recentAction", player_card.get("memorySummary", "两支队伍已出城，一支留守补位。"))), "两支队伍已出城，一支留守补位。")
	panel_state["statusLabel"] = _resolve_string(active_status.get("label", "执行中"), "执行中")
	panel_state["statusSummary"] = _resolve_string(active_status.get("summary", ""), "")
	panel_state["statusTone"] = _resolve_string(active_status.get("tone", "info"), "info")
	return panel_state


func get_ai_player_panel_state() -> Dictionary:
	return _build_ai_player_panel_state(_preview_state)


func _emit_ai_player_panel_requested() -> void:
	ai_player_panel_requested.emit(_build_ai_player_panel_state(_preview_state))


func _normalize_string_array(raw_values: Variant) -> Array:
	var values: Array = []
	if raw_values is Array:
		for item in raw_values:
			var value := str(item).strip_edges()
			if value != "":
				values.append(value)
	return values


func _format_tab_label(tab_key: String) -> String:
	return str(TAB_LABELS.get(tab_key.strip_edges().to_lower(), tab_key.strip_edges()))


func _to_node_suffix(raw_key: String) -> String:
	var value: String = raw_key.strip_edges().to_lower()
	if value == "":
		return "Item"
	var buffer: String = ""
	for index in range(value.length()):
		var ch: String = value.substr(index, 1)
		if ch == " " or ch == "-" or ch == "/":
			buffer += "_"
		else:
			buffer += ch
	return buffer.capitalize()


func _apply_panel_style(panel: PanelContainer, category: String, token_name: String) -> bool:
	return _ui_theme_tokens.apply_panel_style(panel, category, token_name)


func _apply_button_style(button: Button, token_name: String) -> bool:
	return _ui_theme_tokens.apply_button_style(button, token_name)


func _create_panel(parent: Node, node_name: String) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.name = node_name
	parent.add_child(panel)
	return panel


func _create_margin_container(parent: Node, node_name: String, left_margin: int = 0, top_margin: int = 0, right_margin: int = 0, bottom_margin: int = 0) -> MarginContainer:
	var margin := MarginContainer.new()
	margin.name = node_name
	margin.add_theme_constant_override("margin_left", left_margin)
	margin.add_theme_constant_override("margin_top", top_margin)
	margin.add_theme_constant_override("margin_right", right_margin)
	margin.add_theme_constant_override("margin_bottom", bottom_margin)
	parent.add_child(margin)
	return margin


func _create_vbox(parent: Node, node_name: String, separation: int = 0) -> VBoxContainer:
	var container := VBoxContainer.new()
	container.name = node_name
	container.add_theme_constant_override("separation", separation)
	parent.add_child(container)
	return container


func _create_hbox(parent: Node, node_name: String, separation: int = 0) -> HBoxContainer:
	var container := HBoxContainer.new()
	container.name = node_name
	container.add_theme_constant_override("separation", separation)
	parent.add_child(container)
	return container


func _create_label(parent: Node, node_name: String, text: String = "", font_size: int = 13) -> Label:
	var label := Label.new()
	label.name = node_name
	label.text = text
	label.add_theme_font_size_override("font_size", font_size)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	parent.add_child(label)
	return label


func _create_chip(parent: Node, node_name: String, text: String, token_name: String, font_size: int = 11) -> PanelContainer:
	var chip := _create_panel(parent, node_name)
	_apply_panel_style(chip, "panel", token_name)
	chip.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	var margin := _create_margin_container(chip, "Margin", 8, 4, 8, 4)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var label := _create_label(margin, "Text", text, font_size)
	label.autowrap_mode = TextServer.AUTOWRAP_OFF
	label.modulate = Color(0.96, 0.98, 0.94, 0.98)
	return chip


func _create_spacer(parent: Node, node_name: String) -> Control:
	var spacer := Control.new()
	spacer.name = node_name
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(spacer)
	return spacer


func _create_button(parent: Node, node_name: String, text: String = "", font_size: int = 14, minimum_width: float = 0.0) -> Button:
	var button := Button.new()
	button.name = node_name
	button.text = text
	button.add_theme_font_size_override("font_size", font_size)
	if minimum_width > 0.0:
		button.custom_minimum_size = Vector2(minimum_width, 0.0)
	parent.add_child(button)
	return button


func _create_color_rect(parent: Node, node_name: String, color: Color, height: float = 4.0) -> ColorRect:
	var rect := ColorRect.new()
	rect.name = node_name
	rect.color = color
	rect.custom_minimum_size = Vector2(0.0, height)
	parent.add_child(rect)
	return rect


func _small_font_size(base_size: int) -> int:
	return base_size - 1 if _compact_embed else base_size


func _tab_font_size() -> int:
	return 11 if _compact_embed else 14


func _tab_button_min_width() -> float:
	return 68.0 if _compact_embed else 88.0


func _resolve_compact_embed(state: Dictionary, fallback: bool = true) -> bool:
	if state.has("compactEmbed"):
		return bool(state.get("compactEmbed", fallback))
	return fallback


func _clear_children(parent: Node) -> void:
	for child in parent.get_children():
		child.queue_free()
