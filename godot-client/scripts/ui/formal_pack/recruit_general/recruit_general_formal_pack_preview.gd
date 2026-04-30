extends Control
class_name RecruitGeneralFormalPackPreview

const BG_ROOT := Color(0.030, 0.032, 0.034, 1.0)
const BG_BAND := Color(0.070, 0.071, 0.067, 0.94)
const BG_CARD := Color(0.095, 0.087, 0.074, 0.94)
const BG_CARD_ACTIVE := Color(0.170, 0.120, 0.067, 0.96)
const BG_DARK := Color(0.028, 0.028, 0.027, 0.92)
const BORDER := Color(0.440, 0.370, 0.210, 0.52)
const BORDER_ACTIVE := Color(0.950, 0.710, 0.290, 0.90)
const TEXT_MAIN := Color(0.930, 0.900, 0.820, 1.0)
const TEXT_MUTED := Color(0.690, 0.670, 0.600, 1.0)
const TEXT_GOLD := Color(0.960, 0.730, 0.330, 1.0)
const TEXT_GREEN := Color(0.420, 0.760, 0.470, 1.0)
const TEXT_RED := Color(0.900, 0.360, 0.300, 1.0)
const TEXT_VIOLET := Color(0.900, 0.420, 0.920, 1.0)
const RECRUIT_PACK_MIN_WIDTH := 238.0
const RECRUIT_PACK_ACTIVE_WIDTH := 264.0
const ROSTER_CARD_MIN_WIDTH := 168.0
const ROSTER_CARD_MAX_WIDTH := 190.0
const ROSTER_GRID_GAP := 10.0

const RECRUIT_PACKS = [
	{
		"id": "pool_famous",
		"title": "名将",
		"subtitle": "5星",
		"level": "30级",
		"cost": "40000",
		"single": "40000铜钱",
		"five": "20万铜钱",
		"remaining": "还可以40000铜钱招募16次",
		"rule": "S级武将与通用战法同池",
		"status": "可招募",
		"can_single": true,
		"can_five": true,
		"tone": Color(0.300, 0.230, 0.180, 1.0),
	},
	{
		"id": "pool_legacy",
		"title": "经武纬文",
		"subtitle": "5星",
		"level": "30级",
		"cost": "50000",
		"single": "50000铜钱",
		"five": "25万铜钱",
		"remaining": "赛季卡包候选",
		"rule": "传承卡包占位",
		"status": "赛季未开放",
		"can_single": false,
		"can_five": false,
		"tone": Color(0.170, 0.150, 0.180, 1.0),
	},
	{
		"id": "pool_chaos",
		"title": "天下大乱",
		"subtitle": "5星",
		"level": "30级",
		"cost": "50000",
		"single": "50000铜钱",
		"five": "25万铜钱",
		"remaining": "限时卡包候选",
		"rule": "天下卡包占位",
		"status": "限时未开放",
		"can_single": false,
		"can_five": false,
		"tone": Color(0.210, 0.150, 0.120, 1.0),
	},
]

const ROSTER_CARDS = [
	{"id": "100451", "name": "吕蒙", "faction": "东吴", "level": 28, "stars": "★★★★★", "power": 7800, "troop": "弓兵", "status": "已编组", "team": "部队一", "owner": "真人: 风华", "quality": "S"},
	{"id": "100122", "name": "吕布", "faction": "群雄", "level": 33, "stars": "★★★★★", "power": 8500, "troop": "骑兵", "status": "已编组", "team": "部队一", "owner": "AI: 阿良", "quality": "S"},
	{"id": "100219", "name": "曹纯", "faction": "曹魏", "level": 38, "stars": "★★★★★", "power": 9200, "troop": "骑兵", "status": "战备92", "team": "部队一", "owner": "真人: 风华", "quality": "S"},
	{"id": "100337", "name": "乐进", "faction": "曹魏", "level": 40, "stars": "★★★★★", "power": 6375, "troop": "步兵", "status": "已编组", "team": "部队二", "owner": "AI: 阿良", "quality": "S"},
	{"id": "100418", "name": "刘备", "faction": "季汉", "level": 40, "stars": "★★★★★", "power": 4788, "troop": "步兵", "status": "已编组", "team": "部队二", "owner": "真人: 风华", "quality": "S"},
	{"id": "100502", "name": "魏延", "faction": "季汉", "level": 41, "stars": "★★★★★", "power": 3575, "troop": "步兵", "status": "预备", "team": "未编组", "owner": "AI: 山河", "quality": "S"},
	{"id": "100611", "name": "张辽", "faction": "曹魏", "level": 40, "stars": "★★★★★", "power": 9000, "troop": "骑兵", "status": "战备88", "team": "部队三", "owner": "真人: 风华", "quality": "S"},
	{"id": "100709", "name": "曹操", "faction": "曹魏", "level": 42, "stars": "★★★★★", "power": 9368, "troop": "骑兵", "status": "已编组", "team": "部队三", "owner": "AI: 阿良", "quality": "S"},
]

const RECRUIT_BACKEND_STATES = [
	{"code": "ok", "label": "成功", "detail": "receiptId + results + stateAfter", "tone": "green"},
	{"code": "insufficient_resource", "label": "资源不足", "detail": "返回缺少 currency / required / current", "tone": "red"},
	{"code": "hero_card_capacity_full", "label": "容量不足", "detail": "返回 heroCard count/capacity", "tone": "red"},
	{"code": "duplicate_request", "label": "重复请求", "detail": "clientRequestId 命中幂等回执", "tone": "gold"},
]

var _selected_pack_index := 0
var _pack_buttons: Array = []
var _pack_glow_strips: Array = []
var _pack_state_labels: Array = []
var _pack_scroll: ScrollContainer
var _pack_row: HBoxContainer
var _action_panel: PanelContainer
var _probability_panel: Control
var _recruit_status_label: Label
var _profile_status_label: Label
var _roster_grid: GridContainer

func _ready() -> void:
	_build()
	call_deferred("_update_responsive_layout")

func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED:
		call_deferred("_update_responsive_layout")

func _build() -> void:
	for child in get_children():
		child.queue_free()
	_pack_buttons.clear()
	_pack_glow_strips.clear()
	_pack_state_labels.clear()
	_pack_scroll = null
	_pack_row = null
	_roster_grid = null

	var background := ColorRect.new()
	background.color = BG_ROOT
	background.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(background)

	var margin := MarginContainer.new()
	margin.set_anchors_preset(Control.PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 18)
	margin.add_theme_constant_override("margin_top", 16)
	margin.add_theme_constant_override("margin_right", 18)
	margin.add_theme_constant_override("margin_bottom", 16)
	add_child(margin)

	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 12)
	margin.add_child(column)

	column.add_child(_build_recruit_section())
	column.add_child(_build_roster_section())
	_select_recruit_pack(0, false)
	call_deferred("_update_responsive_layout")

func _build_recruit_section() -> Control:
	var panel := _panel(BG_BAND, BORDER, 4)
	panel.custom_minimum_size = Vector2(0, 520)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	var margin := _margin(14, 12, 14, 12)
	panel.add_child(margin)

	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 10)
	margin.add_child(column)

	var header := HBoxContainer.new()
	header.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_theme_constant_override("separation", 14)
	column.add_child(header)

	var title := _label("招募", 28, TEXT_GOLD)
	title.custom_minimum_size = Vector2(110, 34)
	header.add_child(title)

	header.add_child(_nav_chip("招募", true))
	header.add_child(_nav_chip("战法", false))
	header.add_child(_nav_chip("推贤进士", false))
	header.add_spacer(false)
	header.add_child(_resource_chip("战法经验", "17588"))
	header.add_child(_resource_chip("玉", "935"))
	header.add_child(_resource_chip("招募券", "37"))
	header.add_child(_resource_chip("铜钱", "44881"))
	header.add_child(_resource_chip("武将卡", "82/300"))

	var body := VBoxContainer.new()
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 10)
	column.add_child(body)

	_pack_scroll = ScrollContainer.new()
	_pack_scroll.name = "RecruitPackHorizontalScroll"
	_pack_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_pack_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_pack_scroll.custom_minimum_size = Vector2(0, 230)
	_pack_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	_pack_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	body.add_child(_pack_scroll)

	_pack_row = HBoxContainer.new()
	_pack_row.name = "RecruitPackRow"
	_pack_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_pack_row.custom_minimum_size = Vector2(RECRUIT_PACKS.size() * (RECRUIT_PACK_MIN_WIDTH + 10.0), 0)
	_pack_row.add_theme_constant_override("separation", 10)
	_pack_scroll.add_child(_pack_row)

	for index in range(RECRUIT_PACKS.size()):
		var button := _build_recruit_pack_card(index, RECRUIT_PACKS[index] as Dictionary)
		_pack_buttons.append(button)
		_pack_row.add_child(button)

	_action_panel = _panel(BG_DARK, BORDER_ACTIVE, 4)
	_action_panel.custom_minimum_size = Vector2(0, 178)
	_action_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_child(_action_panel)
	return panel

func _build_recruit_pack_card(index: int, pack: Dictionary) -> Button:
	var button := Button.new()
	button.name = "RecruitPackButton_%s" % str(pack.get("id", "pool"))
	button.text = ""
	button.flat = true
	button.focus_mode = Control.FOCUS_NONE
	button.custom_minimum_size = Vector2(238, 216)
	button.size_flags_vertical = Control.SIZE_EXPAND_FILL
	button.add_theme_stylebox_override("normal", _style(BG_CARD, BORDER, 2))
	button.add_theme_stylebox_override("hover", _style(BG_CARD_ACTIVE, BORDER_ACTIVE, 2))
	button.add_theme_stylebox_override("pressed", _style(BG_CARD_ACTIVE, BORDER_ACTIVE, 2))
	button.pressed.connect(Callable(self, "_select_recruit_pack").bind(index, true))

	var card_margin := _margin(8, 8, 8, 8)
	card_margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button.add_child(card_margin)

	var column := VBoxContainer.new()
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 6)
	card_margin.add_child(column)

	var glow := ColorRect.new()
	glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	glow.color = Color(0.950, 0.710, 0.290, 0.12)
	glow.custom_minimum_size = Vector2(0, 3)
	column.add_child(glow)
	_pack_glow_strips.append(glow)

	var top := HBoxContainer.new()
	top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(top)
	top.add_child(_badge(str(pack.get("title", "")), TEXT_VIOLET))
	top.add_spacer(false)
	top.add_child(_badge(str(pack.get("level", "30级")), TEXT_GOLD))

	var art := _panel(pack.get("tone", BG_CARD) as Color, Color(0.780, 0.650, 0.330, 0.42), 2)
	art.mouse_filter = Control.MOUSE_FILTER_IGNORE
	art.custom_minimum_size = Vector2(0, 124)
	art.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_child(art)

	var art_margin := _margin(10, 12, 10, 10)
	art_margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	art.add_child(art_margin)
	var art_column := VBoxContainer.new()
	art_column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	art_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	art_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	art_column.add_theme_constant_override("separation", 5)
	art_margin.add_child(art_column)
	art_column.add_child(_label(str(pack.get("title", "")), 26, TEXT_MAIN))
	art_column.add_child(_label(str(pack.get("subtitle", "")), 18, TEXT_VIOLET))
	art_column.add_spacer(false)
	art_column.add_child(_label("卡包图占位", 13, TEXT_MUTED))

	var footer := HBoxContainer.new()
	footer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(footer)
	footer.add_child(_label("铜钱", 14, TEXT_GOLD))
	footer.add_spacer(false)
	footer.add_child(_label(str(pack.get("cost", "")), 22, TEXT_VIOLET))
	var state_label := _label(str(pack.get("status", "")), 13, TEXT_MUTED)
	state_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	column.add_child(state_label)
	_pack_state_labels.append(state_label)
	return button

func _select_recruit_pack(index: int, animated: bool = true) -> void:
	_selected_pack_index = clampi(index, 0, RECRUIT_PACKS.size() - 1)
	for i in range(_pack_buttons.size()):
		var button := _pack_buttons[i] as Button
		var pack := RECRUIT_PACKS[i] as Dictionary
		var active := i == _selected_pack_index
		button.custom_minimum_size = Vector2(RECRUIT_PACK_ACTIVE_WIDTH if active else RECRUIT_PACK_MIN_WIDTH, 216)
		button.add_theme_stylebox_override("normal", _style(BG_CARD_ACTIVE if active else BG_CARD, BORDER_ACTIVE if active else BORDER, 2))
		_update_pack_feedback(i, pack, active)
		var target_scale := Vector2(1.018, 1.018) if active else Vector2.ONE
		if animated:
			var tween := create_tween()
			tween.set_trans(Tween.TRANS_CUBIC)
			tween.set_ease(Tween.EASE_OUT)
			tween.tween_property(button, "scale", target_scale, 0.11)
		else:
			button.scale = target_scale
	_update_pack_row_width()
	_update_recruit_action_panel(animated)
	call_deferred("_scroll_selected_pack_into_view", animated)

func _update_recruit_action_panel(animated: bool) -> void:
	if _action_panel == null:
		return
	for child in _action_panel.get_children():
		child.queue_free()
	var pack := RECRUIT_PACKS[_selected_pack_index] as Dictionary
	var margin := _margin(12, 12, 12, 12)
	_action_panel.add_child(margin)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 10)
	margin.add_child(column)

	var title_row := HBoxContainer.new()
	column.add_child(title_row)
	title_row.add_child(_label(str(pack.get("title", "")), 22, TEXT_GOLD))
	title_row.add_spacer(false)
	var prob_button := Button.new()
	prob_button.text = "概率"
	prob_button.custom_minimum_size = Vector2(58, 34)
	prob_button.focus_mode = Control.FOCUS_NONE
	prob_button.pressed.connect(Callable(self, "_toggle_probability_panel"))
	title_row.add_child(prob_button)

	column.add_child(_label(str(pack.get("remaining", "")), 15, TEXT_MAIN))
	column.add_child(_state_line("卡池状态", str(pack.get("status", "")), TEXT_GREEN if bool(pack.get("can_single", true)) else TEXT_RED))
	column.add_child(_state_line("武将卡容量", "82/300", TEXT_MAIN))
	column.add_child(_state_line("后端链路", "等待 /api/v2/recruit/draw", TEXT_MUTED))
	column.add_child(_state_line("请求幂等", "clientRequestId 必填", TEXT_GOLD))
	column.add_child(_draw_button("招募1次", str(pack.get("single", "")), "single", bool(pack.get("can_single", true))))
	column.add_child(_draw_button("招募5次", str(pack.get("five", "")), "five", bool(pack.get("can_five", true))))
	_recruit_status_label = _label("等待选择招募次数", 13, TEXT_MUTED)
	column.add_child(_recruit_status_label)
	column.add_child(_build_backend_state_preview())

	_probability_panel = _panel(Color(0.035, 0.034, 0.030, 0.96), Color(0.730, 0.580, 0.260, 0.72), 3)
	_probability_panel.name = "RecruitProbabilityPopover"
	_probability_panel.visible = false
	_probability_panel.z_index = 8
	_probability_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	_probability_panel.custom_minimum_size = Vector2(0, 122)
	column.add_child(_probability_panel)
	var prob_margin := _margin(8, 8, 8, 8)
	_probability_panel.add_child(prob_margin)
	var prob_col := VBoxContainer.new()
	prob_col.add_theme_constant_override("separation", 4)
	prob_margin.add_child(prob_col)
	prob_col.add_child(_label("概率说明 / 当前卡池", 15, TEXT_GOLD))
	prob_col.add_child(_label("S级武将 30% / S级战法 10%", 13, TEXT_MAIN))
	prob_col.add_child(_label("A级战法 30% / B级战法 30%", 13, TEXT_MAIN))
	prob_col.add_child(_label(str(pack.get("rule", "")), 12, TEXT_MUTED))
	prob_col.add_child(_label("真实抽取以后端回执为准", 12, TEXT_MUTED))

	if animated:
		_action_panel.modulate.a = 0.0
		_action_panel.scale = Vector2(0.985, 0.985)
		var tween := create_tween()
		tween.set_trans(Tween.TRANS_CUBIC)
		tween.set_ease(Tween.EASE_OUT)
		tween.parallel().tween_property(_action_panel, "modulate:a", 1.0, 0.14)
		tween.parallel().tween_property(_action_panel, "scale", Vector2.ONE, 0.14)
	else:
		_action_panel.modulate.a = 1.0
		_action_panel.scale = Vector2.ONE

func _draw_button(title: String, cost: String, mode: String, enabled: bool) -> Button:
	var button := Button.new()
	button.text = "%s\n%s" % [title, cost if enabled else "暂不可用"]
	button.disabled = not enabled
	button.custom_minimum_size = Vector2(0, 58)
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.focus_mode = Control.FOCUS_NONE
	button.add_theme_font_size_override("font_size", 18)
	button.add_theme_stylebox_override("normal", _style(Color(0.850, 0.790, 0.580, 0.95) if enabled else Color(0.200, 0.190, 0.170, 0.88), Color(0.980, 0.880, 0.460, 0.92) if enabled else Color(0.340, 0.320, 0.270, 0.72), 2))
	button.add_theme_color_override("font_color", Color(0.090, 0.074, 0.050, 1.0) if enabled else TEXT_MUTED)
	button.pressed.connect(Callable(self, "_request_draw").bind(mode))
	return button

func _request_draw(mode: String) -> void:
	if _recruit_status_label == null:
		return
	var pack := RECRUIT_PACKS[_selected_pack_index] as Dictionary
	var label := "单招" if mode == "single" else "五连"
	_recruit_status_label.text = "已选择 %s / %s，等待后端 authority。" % [str(pack.get("title", "")), label]

func _toggle_probability_panel() -> void:
	if _probability_panel == null:
		return
	_probability_panel.visible = not _probability_panel.visible
	if _probability_panel.visible:
		_probability_panel.modulate.a = 0.0
		_probability_panel.scale = Vector2(0.985, 0.985)
		var tween := create_tween()
		tween.set_trans(Tween.TRANS_CUBIC)
		tween.set_ease(Tween.EASE_OUT)
		tween.parallel().tween_property(_probability_panel, "modulate:a", 1.0, 0.10)
		tween.parallel().tween_property(_probability_panel, "scale", Vector2.ONE, 0.10)

func _build_roster_section() -> Control:
	var panel := _panel(BG_BAND, BORDER, 4)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL

	var margin := _margin(14, 12, 14, 12)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 10)
	margin.add_child(column)

	var header := HBoxContainer.new()
	header.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_theme_constant_override("separation", 12)
	column.add_child(header)
	header.add_child(_label("武将", 28, TEXT_GOLD))
	header.add_child(_nav_chip("武将", true))
	header.add_child(_nav_chip("军士", false))
	header.add_spacer(false)
	header.add_child(_resource_chip("筛选", "全部"))
	header.add_child(_resource_chip("容量", "82/300"))

	var filter_scroll := ScrollContainer.new()
	filter_scroll.name = "RosterFilterHorizontalScroll"
	filter_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	filter_scroll.custom_minimum_size = Vector2(0, 38)
	filter_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	filter_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	column.add_child(filter_scroll)

	var filter_row := HBoxContainer.new()
	filter_row.name = "RosterFilterRow"
	filter_row.custom_minimum_size = Vector2(840, 0)
	filter_row.add_theme_constant_override("separation", 8)
	filter_scroll.add_child(filter_row)
	filter_row.add_child(_badge("部队中", TEXT_GOLD))
	filter_row.add_child(_badge("骑兵", TEXT_MAIN))
	filter_row.add_child(_badge("步兵", TEXT_MAIN))
	filter_row.add_child(_badge("弓兵", TEXT_MAIN))
	for chip in _build_roster_summary_chips():
		filter_row.add_child(chip)
	_profile_status_label = _compact_label("点击武将卡后进入单武将详情页", 13, TEXT_MUTED)
	_profile_status_label.custom_minimum_size = Vector2(260, 0)
	filter_row.add_child(_profile_status_label)

	var scroll := ScrollContainer.new()
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(scroll)

	var grid := GridContainer.new()
	grid.name = "RosterCardGrid"
	grid.columns = 6
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 10)
	scroll.add_child(grid)
	_roster_grid = grid

	for entry_variant in ROSTER_CARDS:
		grid.add_child(_build_roster_card(entry_variant as Dictionary))
	call_deferred("_update_responsive_layout")
	return panel

func _build_roster_card(entry: Dictionary) -> Button:
	var button := Button.new()
	button.name = "OpenHeroProfileButton_%s" % str(entry.get("id", ""))
	button.text = ""
	button.flat = true
	button.focus_mode = Control.FOCUS_NONE
	button.custom_minimum_size = Vector2(176, 244)
	button.add_theme_stylebox_override("normal", _style(BG_CARD, _faction_border(entry), 2))
	button.add_theme_stylebox_override("hover", _style(BG_CARD_ACTIVE, BORDER_ACTIVE, 2))
	button.add_theme_stylebox_override("pressed", _style(BG_CARD_ACTIVE, BORDER_ACTIVE, 2))
	button.pressed.connect(Callable(self, "_open_hero_profile").bind(str(entry.get("id", "")), str(entry.get("name", ""))))

	var margin := _margin(6, 6, 6, 6)
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button.add_child(margin)
	var column := VBoxContainer.new()
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 4)
	margin.add_child(column)

	var top := HBoxContainer.new()
	top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(top)
	var power_label := _compact_label("%s %s" % [str(entry.get("faction", "")), str(entry.get("power", ""))], 15, TEXT_MAIN)
	power_label.custom_minimum_size = Vector2(70, 0)
	top.add_child(power_label)
	top.add_spacer(false)
	var stars_label := _compact_label(str(entry.get("stars", "")), 13, TEXT_GOLD, HORIZONTAL_ALIGNMENT_RIGHT)
	stars_label.custom_minimum_size = Vector2(74, 0)
	top.add_child(stars_label)

	var portrait := _panel(Color(0.110, 0.120, 0.135, 0.94), Color(0.700, 0.560, 0.240, 0.42), 2)
	portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
	portrait.custom_minimum_size = Vector2(0, 94)
	portrait.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_child(portrait)
	var portrait_margin := _margin(8, 6, 8, 6)
	portrait_margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	portrait.add_child(portrait_margin)
	var portrait_col := VBoxContainer.new()
	portrait_col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	portrait_col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	portrait_margin.add_child(portrait_col)
	portrait_col.add_spacer(false)
	var name_label := _compact_label(str(entry.get("name", "")), 24, TEXT_MAIN, HORIZONTAL_ALIGNMENT_CENTER)
	name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	portrait_col.add_child(name_label)
	var type_label := _compact_label(str(entry.get("troop", "")), 13, TEXT_MUTED, HORIZONTAL_ALIGNMENT_CENTER)
	type_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	portrait_col.add_child(type_label)
	portrait_col.add_spacer(false)

	column.add_child(_compact_label(str(entry.get("team", "")), 17, TEXT_GREEN))
	column.add_child(_compact_label("%s | Lv.%s | %s" % [str(entry.get("quality", "")), str(entry.get("level", "")), str(entry.get("troop", ""))], 14, TEXT_MAIN))
	column.add_child(_compact_label(str(entry.get("owner", "")), 13, TEXT_MUTED))
	column.add_spacer(false)
	var bottom := HBoxContainer.new()
	bottom.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(bottom)
	var status_label := _compact_label(str(entry.get("status", "")), 14, TEXT_GOLD)
	status_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bottom.add_child(status_label)
	bottom.add_spacer(false)
	bottom.add_child(_compact_label("详情>", 13, TEXT_MUTED, HORIZONTAL_ALIGNMENT_RIGHT))
	return button

func _open_hero_profile(hero_id: String, hero_name: String) -> void:
	if _profile_status_label == null:
		return
	_profile_status_label.text = "open_hero_profile:%s / activePageId=profile / %s" % [hero_id, hero_name]

func _resource_chip(title: String, value: String) -> Control:
	var panel := _panel(Color(0.045, 0.045, 0.041, 0.86), Color(0.260, 0.230, 0.150, 0.62), 2)
	panel.custom_minimum_size = Vector2(94, 34)
	var margin := _margin(8, 4, 8, 4)
	panel.add_child(margin)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 4)
	margin.add_child(row)
	row.add_child(_label(title, 12, TEXT_MUTED))
	row.add_spacer(false)
	row.add_child(_label(value, 15, TEXT_MAIN))
	return panel

func _update_responsive_layout() -> void:
	_update_pack_row_width()
	_update_action_panel_width()
	_update_roster_grid_columns()

func _update_pack_row_width() -> void:
	if _pack_row == null:
		return
	var width := 0.0
	for i in range(_pack_buttons.size()):
		width += RECRUIT_PACK_ACTIVE_WIDTH if i == _selected_pack_index else RECRUIT_PACK_MIN_WIDTH
	width += maxi(0, _pack_buttons.size() - 1) * 10.0
	_pack_row.custom_minimum_size = Vector2(width, 0)

func _update_pack_feedback(index: int, pack: Dictionary, active: bool) -> void:
	if index < _pack_glow_strips.size() and _pack_glow_strips[index] is ColorRect:
		var glow := _pack_glow_strips[index] as ColorRect
		glow.color = Color(0.980, 0.720, 0.250, 0.90) if active else Color(0.400, 0.330, 0.190, 0.22)
		glow.custom_minimum_size = Vector2(0, 5 if active else 3)
	if index < _pack_state_labels.size() and _pack_state_labels[index] is Label:
		var label := _pack_state_labels[index] as Label
		label.text = "已展开" if active else str(pack.get("status", ""))
		label.add_theme_color_override("font_color", TEXT_GOLD if active else (TEXT_GREEN if bool(pack.get("can_single", true)) else TEXT_RED))

func _scroll_selected_pack_into_view(animated: bool) -> void:
	if _pack_scroll == null:
		return
	var offset := 0.0
	for i in range(_selected_pack_index):
		offset += RECRUIT_PACK_ACTIVE_WIDTH if i == _selected_pack_index else RECRUIT_PACK_MIN_WIDTH
		offset += 10.0
	var target_scroll: int = maxi(0, int(offset - 12.0))
	if animated:
		var tween := create_tween()
		tween.set_trans(Tween.TRANS_CUBIC)
		tween.set_ease(Tween.EASE_OUT)
		tween.tween_property(_pack_scroll, "scroll_horizontal", target_scroll, 0.13)
	else:
		_pack_scroll.scroll_horizontal = target_scroll

func _update_action_panel_width() -> void:
	if _action_panel == null:
		return
	_action_panel.custom_minimum_size = Vector2(0, 178)

func _update_roster_grid_columns() -> void:
	if _roster_grid == null:
		return
	var parent_control := _roster_grid.get_parent() as Control
	var available_width: float = 0.0
	if parent_control != null:
		available_width = float(parent_control.size.x)
	if available_width <= 0.0:
		available_width = size.x - 64.0
	if available_width <= 0.0:
		available_width = get_viewport_rect().size.x - 64.0
	var columns: int = int(floor((available_width + ROSTER_GRID_GAP) / (ROSTER_CARD_MIN_WIDTH + ROSTER_GRID_GAP)))
	columns = clampi(columns, 1, 6)
	_roster_grid.columns = columns
	var card_width: float = floor((available_width - ROSTER_GRID_GAP * float(maxi(0, columns - 1))) / float(columns))
	card_width = clampf(card_width, ROSTER_CARD_MIN_WIDTH, ROSTER_CARD_MAX_WIDTH)
	for child in _roster_grid.get_children():
		if child is Control:
			(child as Control).custom_minimum_size = Vector2(card_width, 244)

func _state_line(title: String, value: String, value_color: Color) -> Control:
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 8)
	row.add_child(_label(title, 13, TEXT_MUTED))
	row.add_spacer(false)
	row.add_child(_label(value, 13, value_color))
	return row

func _build_backend_state_preview() -> Control:
	var panel := _panel(Color(0.038, 0.037, 0.033, 0.86), Color(0.260, 0.225, 0.150, 0.58), 3)
	panel.name = "RecruitBackendStatePreview"
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(8, 7, 8, 7)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 4)
	margin.add_child(column)
	column.add_child(_compact_label("后端回执状态位", 13, TEXT_GOLD))
	for state_variant in RECRUIT_BACKEND_STATES:
		var state := state_variant as Dictionary
		column.add_child(_backend_state_row(state))
	return panel

func _backend_state_row(state: Dictionary) -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 7)
	var label := _compact_label(str(state.get("label", "")), 12, _state_tone_color(str(state.get("tone", ""))))
	label.custom_minimum_size = Vector2(66, 0)
	row.add_child(label)
	var detail := _compact_label(str(state.get("detail", "")), 12, TEXT_MUTED)
	detail.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(detail)
	return row

func _state_tone_color(tone: String) -> Color:
	match tone:
		"green":
			return TEXT_GREEN
		"red":
			return TEXT_RED
		"gold":
			return TEXT_GOLD
		_:
			return TEXT_MUTED

func _build_roster_summary_chips() -> Array:
	var deployed := 0
	var reserve := 0
	var max_power := 0
	for entry_variant in ROSTER_CARDS:
		var entry := entry_variant as Dictionary
		var status := str(entry.get("status", ""))
		if status.find("预备") >= 0:
			reserve += 1
		else:
			deployed += 1
		max_power = maxi(max_power, int(entry.get("power", 0)))
	return [
		_badge("全部%s" % str(ROSTER_CARDS.size()), TEXT_MAIN),
		_badge("已编%s" % str(deployed), TEXT_GREEN),
		_badge("预备%s" % str(reserve), TEXT_GOLD),
		_badge("最高%s" % str(max_power), TEXT_VIOLET),
	]

func _nav_chip(text: String, active: bool) -> Control:
	var panel := _panel(Color(0.145, 0.108, 0.075, 0.90) if active else Color(0.045, 0.045, 0.044, 0.80), BORDER_ACTIVE if active else Color(0.150, 0.140, 0.120, 0.68), 2)
	panel.custom_minimum_size = Vector2(100, 34)
	var margin := _margin(10, 5, 10, 5)
	panel.add_child(margin)
	var label := _label(text, 17, TEXT_MAIN if active else TEXT_MUTED)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.size_flags_vertical = Control.SIZE_EXPAND_FILL
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	margin.add_child(label)
	return panel

func _badge(text: String, color: Color) -> Control:
	var panel := _panel(Color(0.036, 0.036, 0.034, 0.78), Color(0.240, 0.210, 0.150, 0.54), 2)
	var margin := _margin(7, 3, 7, 3)
	panel.add_child(margin)
	margin.add_child(_compact_label(text, 13, color))
	return panel

func _compact_label(text: String, font_size: int, color: Color, alignment: HorizontalAlignment = HORIZONTAL_ALIGNMENT_LEFT) -> Label:
	var label := _label(text, font_size, color)
	label.autowrap_mode = TextServer.AUTOWRAP_OFF
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	label.horizontal_alignment = alignment
	label.clip_text = true
	return label

func _label(text: String, font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	label.custom_minimum_size = Vector2(_estimated_label_width(text, font_size), float(font_size + 6))
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return label

func _estimated_label_width(text: String, font_size: int) -> float:
	if text.strip_edges() == "":
		return 0.0
	var estimated := float(text.length()) * float(font_size) * 0.58 + 8.0
	return clampf(estimated, float(font_size * 2), 260.0)

func _margin(left: int, top: int, right: int, bottom: int) -> MarginContainer:
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", left)
	margin.add_theme_constant_override("margin_top", top)
	margin.add_theme_constant_override("margin_right", right)
	margin.add_theme_constant_override("margin_bottom", bottom)
	return margin

func _panel(bg: Color, border: Color, radius: int) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", _style(bg, border, radius))
	return panel

func _style(bg: Color, border: Color, radius: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = bg
	style.border_color = border
	style.border_width_left = 1
	style.border_width_top = 1
	style.border_width_right = 1
	style.border_width_bottom = 1
	style.corner_radius_top_left = radius
	style.corner_radius_top_right = radius
	style.corner_radius_bottom_right = radius
	style.corner_radius_bottom_left = radius
	return style

func _faction_border(entry: Dictionary) -> Color:
	match str(entry.get("faction", "")):
		"魏", "曹魏":
			return Color(0.370, 0.520, 0.720, 0.84)
		"蜀", "汉", "季汉", "纪汉":
			return Color(0.360, 0.650, 0.330, 0.84)
		"吴", "东吴", "孙吴":
			return Color(0.780, 0.290, 0.300, 0.84)
		"群", "群雄":
			return Color(0.900, 0.650, 0.220, 0.84)
		_:
			return Color(0.780, 0.520, 0.220, 0.84)
