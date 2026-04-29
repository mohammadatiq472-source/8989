extends Control
class_name RecruitFormalPackPreview

const HeroCardViewScript := preload("res://scripts/ui/formal_pack/components/hero_card_view.gd")
const FormalPackCloseButton := preload("res://scripts/ui/formal_pack/components/formal_pack_close_button.gd")

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
const PACK_MIN_WIDTH := 330.0
const PACK_ACTIVE_WIDTH := 330.0
const PACK_ACTION_WIDTH := 330.0
const PACK_CARD_HEIGHT := 642.0

const RECRUIT_PACKS = [
	{
		"id": "pool_vanguard",
		"title": "先锋征令",
		"subtitle": "S级",
		"level": "30级",
		"cost": "40000",
		"single": "40000铜钱",
		"five": "20万铜钱",
		"rule": "后端按卡池权重返回武将模板；本地只展示回执等待位",
		"status": "可抽",
		"resource_state": "资源满足",
		"capacity_state": "82/300",
		"can_single": true,
		"can_five": true,
		"tone": Color(0.300, 0.230, 0.180, 1.0),
		"currency_badge": "铜",
		"corner_badge": "令",
	},
	{
		"id": "pool_strategy",
		"title": "军略征令",
		"subtitle": "S级",
		"level": "30级",
		"cost": "50000",
		"single": "50000铜钱",
		"five": "25万铜钱",
		"rule": "赛季开放后展示候选池；关闭时不允许本地抽取",
		"status": "未开放",
		"resource_state": "资源待校验",
		"capacity_state": "82/300",
		"can_single": false,
		"can_five": false,
		"tone": Color(0.170, 0.150, 0.180, 1.0),
		"currency_badge": "铜",
		"corner_badge": "令",
	},
	{
		"id": "pool_prefecture",
		"title": "州府荐令",
		"subtitle": "S级",
		"level": "30级",
		"cost": "50000",
		"single": "50000铜钱",
		"five": "25万铜钱",
		"rule": "资源不足时仅展示原因；真实扣减必须等待后端回执",
		"status": "资源不足",
		"resource_state": "缺少铜钱 5120",
		"capacity_state": "82/300",
		"can_single": false,
		"can_five": false,
		"tone": Color(0.210, 0.150, 0.120, 1.0),
		"currency_badge": "铜",
		"corner_badge": "令",
	},
	{
		"id": "pool_alliance",
		"title": "盟约荐令",
		"subtitle": "S级",
		"level": "30级",
		"cost": "招募券",
		"single": "1张招募券",
		"five": "5张招募券",
		"rule": "容量满时后端应拒绝并返回 hero_card_capacity_full",
		"status": "容量不足",
		"resource_state": "招募券 37",
		"capacity_state": "300/300",
		"can_single": false,
		"can_five": false,
		"tone": Color(0.180, 0.130, 0.210, 1.0),
		"currency_badge": "券",
		"corner_badge": "令",
	},
]

const BACKEND_STATES = [
	{"code": "ok", "label": "成功", "detail": "receiptId + results + stateAfter", "tone": "green"},
	{"code": "pool_closed", "label": "未开放", "detail": "卡池暂未开放或赛季已结束", "tone": "red"},
	{"code": "insufficient_resource", "label": "资源不足", "detail": "返回 required/current，不做本地扣减", "tone": "red"},
	{"code": "hero_card_capacity_full", "label": "容量不足", "detail": "返回 heroCard count/capacity", "tone": "red"},
]

const POOL_CANDIDATES = {
	"pool_vanguard": [
		{"id": "pool_vanguard_slot_01", "name": "长锋", "faction": "北府", "tone": "red", "level": 30, "stars": "★★★★★", "troop": "弓兵", "quality": "S"},
		{"id": "pool_vanguard_slot_02", "name": "云麾", "faction": "西庭", "tone": "gold", "level": 30, "stars": "★★★★★", "troop": "骑兵", "quality": "S"},
		{"id": "pool_vanguard_slot_03", "name": "赤弦", "faction": "东原", "tone": "blue", "level": 30, "stars": "★★★★★", "troop": "步兵", "quality": "S"},
	],
	"pool_strategy": [
		{"id": "pool_strategy_slot_01", "name": "玄策", "faction": "东原", "tone": "blue", "level": 30, "stars": "★★★★★", "troop": "骑兵", "quality": "S"},
		{"id": "pool_strategy_slot_02", "name": "西陵", "faction": "西庭", "tone": "gold", "level": 30, "stars": "★★★★★", "troop": "弓兵", "quality": "S"},
		{"id": "pool_strategy_slot_03", "name": "苍衡", "faction": "南庭", "tone": "green", "level": 30, "stars": "★★★★★", "troop": "步兵", "quality": "S"},
	],
	"pool_prefecture": [
		{"id": "pool_prefecture_slot_01", "name": "白霆", "faction": "南庭", "tone": "green", "level": 30, "stars": "★★★★★", "troop": "步兵", "quality": "S"},
		{"id": "pool_prefecture_slot_02", "name": "归鸿", "faction": "北府", "tone": "red", "level": 30, "stars": "★★★★★", "troop": "弓兵", "quality": "S"},
		{"id": "pool_prefecture_slot_03", "name": "南弈", "faction": "西庭", "tone": "gold", "level": 30, "stars": "★★★★★", "troop": "骑兵", "quality": "S"},
	],
	"pool_alliance": [
		{"id": "pool_alliance_slot_01", "name": "东序", "faction": "西庭", "tone": "gold", "level": 30, "stars": "★★★★★", "troop": "骑兵", "quality": "S"},
		{"id": "pool_alliance_slot_02", "name": "北辰", "faction": "东原", "tone": "blue", "level": 30, "stars": "★★★★★", "troop": "弓兵", "quality": "S"},
		{"id": "pool_alliance_slot_03", "name": "折戟", "faction": "北府", "tone": "red", "level": 30, "stars": "★★★★★", "troop": "步兵", "quality": "S"},
	],
}

var _selected_pack_index := 0
var _pack_buttons: Array = []
var _pack_glow_strips: Array = []
var _pack_state_labels: Array = []
var _pack_scroll: ScrollContainer
var _pack_row: HBoxContainer
var _probability_panel: Control
var _recruit_status_label: Label
var _show_pool_candidates := false

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

	var background := ColorRect.new()
	background.color = BG_ROOT
	background.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(background)

	var margin := _margin(22, 18, 22, 18)
	margin.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(margin)

	var panel := _panel(BG_BAND, BORDER, 4)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	margin.add_child(panel)

	var content_margin := _margin(18, 14, 18, 14)
	panel.add_child(content_margin)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 10)
	content_margin.add_child(column)

	column.add_child(_build_header())
	var body := VBoxContainer.new()
	body.name = "RecruitMiddleBand"
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(body)
	body.add_child(_build_pack_scroll())
	column.add_child(_build_bottom_resource_bar())

	_select_recruit_pack(0, false)
	_maybe_capture_viewport("FORMAL_PACK_SCREENSHOT_RECRUIT")

func _build_header() -> Control:
	var header := HBoxContainer.new()
	header.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.custom_minimum_size = Vector2(0, 54)
	header.add_theme_constant_override("separation", 12)
	header.add_child(_label("招募", 32, TEXT_GOLD))
	header.add_spacer(false)
	header.add_child(_compact_label("后端回执后写入武将列表", 16, TEXT_GREEN, HORIZONTAL_ALIGNMENT_RIGHT))
	header.add_child(_badge("预览不做本地随机", TEXT_MAIN))
	header.add_child(FormalPackCloseButton.build("关闭", Callable(self, "_on_preview_close_pressed")))
	return header

func _build_pack_scroll() -> Control:
	_pack_scroll = ScrollContainer.new()
	_pack_scroll.name = "RecruitPackHorizontalScroll"
	_pack_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_pack_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_pack_scroll.custom_minimum_size = Vector2(0, 0)
	_pack_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	_pack_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED

	_pack_row = HBoxContainer.new()
	_pack_row.name = "RecruitPackRow"
	_pack_row.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_pack_row.add_theme_constant_override("separation", 12)
	_pack_scroll.add_child(_pack_row)
	_rebuild_pack_row()
	return _pack_scroll

func _rebuild_pack_row() -> void:
	if _pack_row == null:
		return
	for child in _pack_row.get_children():
		child.queue_free()
	_pack_buttons.clear()
	_pack_glow_strips.clear()
	_pack_state_labels.clear()
	for index in range(RECRUIT_PACKS.size()):
		var pack := RECRUIT_PACKS[index] as Dictionary
		var button := _build_pack_card(index, pack)
		_pack_buttons.append(button)
		_pack_row.add_child(button)
		_update_pack_feedback(index, pack, index == _selected_pack_index)
		if index == _selected_pack_index:
			_pack_row.add_child(_build_inline_action_panel(pack))

func _build_pack_card(index: int, pack: Dictionary) -> Control:
	var button := _panel(BG_CARD, BORDER, 2)
	button.name = "RecruitPackButton_%s" % str(pack.get("id", "pool"))
	button.custom_minimum_size = Vector2(PACK_MIN_WIDTH, PACK_CARD_HEIGHT)
	button.size_flags_vertical = Control.SIZE_EXPAND_FILL
	button.mouse_filter = Control.MOUSE_FILTER_STOP
	button.gui_input.connect(Callable(self, "_on_pack_gui_input").bind(index))

	var card_margin := _margin(9, 9, 9, 9)
	card_margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button.add_child(card_margin)
	var column := VBoxContainer.new()
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 7)
	card_margin.add_child(column)

	var glow := ColorRect.new()
	glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	glow.color = Color(0.400, 0.330, 0.190, 0.22)
	glow.custom_minimum_size = Vector2(0, 4)
	column.add_child(glow)
	_pack_glow_strips.append(glow)

	var art := _panel(pack.get("tone", BG_CARD) as Color, Color(0.780, 0.650, 0.330, 0.42), 2)
	art.mouse_filter = Control.MOUSE_FILTER_IGNORE
	art.custom_minimum_size = Vector2(0, 548)
	art.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	art.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(art)
	var art_margin := _margin(12, 14, 12, 12)
	art_margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	art.add_child(art_margin)
	art_margin.add_child(_build_cover_visual(pack))

	var price_plate := _panel(Color(0.035, 0.027, 0.045, 0.94), Color(0.740, 0.560, 0.260, 0.72), 2)
	price_plate.mouse_filter = Control.MOUSE_FILTER_IGNORE
	price_plate.custom_minimum_size = Vector2(0, 46)
	column.add_child(price_plate)
	var plate_margin := _margin(8, 5, 8, 5)
	price_plate.add_child(plate_margin)
	var footer := HBoxContainer.new()
	footer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	footer.add_theme_constant_override("separation", 7)
	plate_margin.add_child(footer)
	footer.add_child(_corner_badge(str(pack.get("currency_badge", "钱"))))
	var cost_label := _compact_label(str(pack.get("cost", "")), 21, TEXT_VIOLET)
	cost_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	footer.add_child(cost_label)
	var state_label := _compact_label(str(pack.get("status", "")), 13, TEXT_GOLD, HORIZONTAL_ALIGNMENT_RIGHT)
	footer.add_child(state_label)
	_pack_state_labels.append(state_label)
	return button

func _on_pack_gui_input(event: InputEvent, index: int) -> void:
	if event is InputEventMouseButton:
		var mouse_event := event as InputEventMouseButton
		if mouse_event.pressed and mouse_event.button_index == MOUSE_BUTTON_LEFT:
			_select_recruit_pack(index, true)

func _build_cover_visual(pack: Dictionary) -> Control:
	var root := Control.new()
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL

	var stage := _panel(pack.get("tone", BG_CARD) as Color, Color(0.620, 0.520, 0.300, 0.36), 1)
	stage.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stage.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stage.size_flags_vertical = Control.SIZE_EXPAND_FILL
	stage.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_child(stage)
	var stage_margin := _margin(9, 8, 9, 8)
	stage.add_child(stage_margin)
	var stage_col := VBoxContainer.new()
	stage_col.name = "RecruitPackCoverAssetSlot"
	stage_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stage_col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	stage_col.add_theme_constant_override("separation", 0)
	stage_margin.add_child(stage_col)

	stage_col.add_spacer(false)
	var badge_row := HBoxContainer.new()
	badge_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stage_col.add_child(badge_row)
	badge_row.add_spacer(false)
	badge_row.add_child(_corner_badge(str(pack.get("corner_badge", "名"))))

	var left_strip := _panel(Color(0.018, 0.016, 0.015, 0.28), Color(0.230, 0.180, 0.120, 0.38), 1)
	left_strip.custom_minimum_size = Vector2(26, 300)
	left_strip.size = Vector2(26, 300)
	root.add_child(left_strip)
	var strip_margin := _margin(2, 10, 2, 10)
	left_strip.add_child(strip_margin)
	var strip_col := VBoxContainer.new()
	strip_col.add_theme_constant_override("separation", 3)
	strip_margin.add_child(strip_col)
	strip_col.add_child(_compact_label(_vertical_text(str(pack.get("title", ""))), 16, TEXT_VIOLET, HORIZONTAL_ALIGNMENT_CENTER))
	strip_col.add_child(_compact_label(_vertical_text(str(pack.get("subtitle", ""))), 12, TEXT_VIOLET, HORIZONTAL_ALIGNMENT_CENTER))
	strip_col.add_spacer(false)
	return root

func _corner_badge(text: String) -> Control:
	var badge := _panel(Color(0.110, 0.060, 0.090, 0.95), Color(0.900, 0.680, 0.320, 0.86), 2)
	badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	badge.custom_minimum_size = Vector2(36, 32)
	var margin := _margin(5, 4, 5, 4)
	badge.add_child(margin)
	margin.add_child(_compact_label(text, 14, TEXT_GOLD, HORIZONTAL_ALIGNMENT_CENTER))
	return badge

func _select_recruit_pack(index: int, animated: bool = true) -> void:
	_selected_pack_index = clampi(index, 0, RECRUIT_PACKS.size() - 1)
	_rebuild_pack_row()
	_update_pack_row_width()
	call_deferred("_scroll_selected_pack_into_view", animated)

func _build_inline_action_panel(pack: Dictionary) -> Control:
	var panel := _panel(BG_DARK, BORDER_ACTIVE, 4)
	panel.name = "RecruitInlineActionPanel_%s" % str(pack.get("id", "pool"))
	panel.custom_minimum_size = Vector2(PACK_ACTION_WIDTH, PACK_CARD_HEIGHT)
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL

	var margin := _margin(16, 18, 16, 16)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 14)
	margin.add_child(column)

	var top := HBoxContainer.new()
	column.add_child(top)
	top.add_child(_compact_label("?", 34, TEXT_GOLD, HORIZONTAL_ALIGNMENT_CENTER))
	top.add_spacer(false)
	var prob_button := Button.new()
	prob_button.text = "概率说明"
	prob_button.custom_minimum_size = Vector2(104, 34)
	prob_button.focus_mode = Control.FOCUS_NONE
	prob_button.pressed.connect(Callable(self, "_toggle_probability_panel"))
	top.add_child(prob_button)

	column.add_spacer(false)
	column.add_child(_state_line("当前卡池状态", str(pack.get("status", "")), _status_color(str(pack.get("status", "")))))
	column.add_child(_state_line("资源", str(pack.get("resource_state", "")), TEXT_MAIN if bool(pack.get("can_single", false)) else TEXT_RED))
	column.add_child(_state_line("容量", str(pack.get("capacity_state", "")), TEXT_MAIN if str(pack.get("status", "")) != "容量不足" else TEXT_RED))
	column.add_child(_state_line("后端 authority", "等待回执，不做本地随机", TEXT_MUTED))

	var draw_col := VBoxContainer.new()
	draw_col.add_theme_constant_override("separation", 12)
	column.add_child(draw_col)
	draw_col.add_child(_draw_button("招募 1 次", str(pack.get("single", "")), "single", bool(pack.get("can_single", true))))
	draw_col.add_child(_draw_button("招募 5 次", str(pack.get("five", "")), "five", bool(pack.get("can_five", true))))
	_recruit_status_label = _compact_label("等待选择招募次数", 14, TEXT_MUTED, HORIZONTAL_ALIGNMENT_CENTER)
	column.add_child(_recruit_status_label)
	column.add_child(_candidate_toggle_button())
	if _show_pool_candidates:
		column.add_child(_build_pool_candidate_preview(pack))
	column.add_spacer(false)

	_probability_panel = _panel(Color(0.035, 0.034, 0.030, 0.96), Color(0.730, 0.580, 0.260, 0.72), 3)
	_probability_panel.name = "RecruitProbabilityInlinePanel"
	_probability_panel.visible = true
	column.add_child(_probability_panel)
	var prob_margin := _margin(10, 8, 10, 8)
	_probability_panel.add_child(prob_margin)
	var prob_col := VBoxContainer.new()
	prob_col.add_theme_constant_override("separation", 3)
	prob_margin.add_child(prob_col)
	prob_col.add_child(_compact_label("概率说明 / 当前卡池", 15, TEXT_GOLD))
	prob_col.add_child(_compact_label("S级武将 30% / S级战法 10%", 13, TEXT_MAIN))
	prob_col.add_child(_compact_label("A级战法 30% / B级战法 30%", 13, TEXT_MAIN))
	prob_col.add_child(_compact_label(str(pack.get("rule", "")), 12, TEXT_MUTED))
	return panel

func _build_pool_candidate_preview(pack: Dictionary) -> Control:
	var panel := _panel(Color(0.042, 0.040, 0.036, 0.58), Color(0.360, 0.290, 0.150, 0.34), 2)
	panel.name = "RecruitPoolCandidatePreview_%s" % str(pack.get("id", "pool"))
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(8, 7, 8, 7)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 6)
	margin.add_child(column)
	column.add_child(_compact_label("卡池候选卡面", 13, TEXT_GOLD))

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	column.add_child(row)
	var candidates := POOL_CANDIDATES.get(str(pack.get("id", "")), []) as Array
	for candidate_variant in candidates:
		var candidate := candidate_variant as Dictionary
		var card := HeroCardViewScript.build_card(candidate, HeroCardViewScript.MODE_POOL_PREVIEW, {
			"width": 84.0,
			"height": 118.0,
			"compact": true,
			"clickable": false,
			"outer_margin": 2,
			"inner_margin": 2,
			"stage_margin": 2,
			"left_strip_width": 22.0,
			"left_strip_alpha": 0.18,
			"identity_strip_height": 54.0,
			"identity_faction_font_size": 6,
			"identity_name_font_size": 7,
			"top_height": 12.0,
			"top_alpha": 0.12,
			"bottom_height": 18.0,
			"bottom_alpha": 0.28,
			"top_font_size": 8,
			"bottom_font_size": 8,
			"top_left_width": 26.0,
			"top_stars_width": 26.0,
		})
		card.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		row.add_child(card)
	return panel

func _draw_button(title: String, cost: String, mode: String, enabled: bool) -> Button:
	var button := Button.new()
	button.text = "%s\n%s" % [title, cost if enabled else "暂不可用"]
	button.disabled = not enabled
	button.custom_minimum_size = Vector2(0, 62)
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.focus_mode = Control.FOCUS_NONE
	button.add_theme_font_size_override("font_size", 18)
	button.add_theme_stylebox_override("normal", _style(Color(0.850, 0.790, 0.580, 0.95) if enabled else Color(0.200, 0.190, 0.170, 0.88), Color(0.980, 0.880, 0.460, 0.92) if enabled else Color(0.340, 0.320, 0.270, 0.72), 2))
	button.add_theme_color_override("font_color", Color(0.090, 0.074, 0.050, 1.0) if enabled else TEXT_MUTED)
	button.pressed.connect(Callable(self, "_request_draw").bind(mode))
	return button

func _build_bottom_resource_bar() -> Control:
	var panel := _panel(Color(0.045, 0.047, 0.050, 0.96), Color(0.180, 0.170, 0.140, 0.62), 2)
	panel.custom_minimum_size = Vector2(0, 60)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var margin := _margin(14, 8, 14, 8)
	panel.add_child(margin)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	margin.add_child(row)
	row.add_child(_resource_chip("战法经验", "17588"))
	row.add_child(_resource_chip("玉", "935"))
	row.add_child(_resource_chip("招募券", "37"))
	row.add_child(_resource_chip("铜钱", "44881"))
	row.add_spacer(false)
	row.add_child(_resource_chip("武将卡", "82/300"))
	return panel

func _request_draw(mode: String) -> void:
	if _recruit_status_label == null:
		return
	var pack := RECRUIT_PACKS[_selected_pack_index] as Dictionary
	_recruit_status_label.text = "已选择 %s / %s，进入招募结果页 drawMode=%s。" % [str(pack.get("title", "")), "单抽" if mode == "single" else "五连", mode]

func _candidate_toggle_button() -> Button:
	var button := Button.new()
	button.text = "隐藏卡池候选" if _show_pool_candidates else "显示卡池候选"
	button.custom_minimum_size = Vector2(0, 34)
	button.focus_mode = Control.FOCUS_NONE
	button.add_theme_font_size_override("font_size", 14)
	button.add_theme_stylebox_override("normal", _style(Color(0.055, 0.052, 0.047, 0.82), Color(0.440, 0.360, 0.180, 0.52), 2))
	button.add_theme_stylebox_override("hover", _style(Color(0.095, 0.075, 0.048, 0.92), Color(0.760, 0.580, 0.240, 0.80), 2))
	button.add_theme_color_override("font_color", TEXT_MAIN)
	button.pressed.connect(Callable(self, "_toggle_pool_candidates"))
	return button

func _toggle_pool_candidates() -> void:
	_show_pool_candidates = not _show_pool_candidates
	_rebuild_pack_row()
	_update_pack_row_width()

func _on_preview_close_pressed() -> void:
	if _recruit_status_label != null:
		_recruit_status_label.text = "close_requested / activePanelId=\"\""

func _toggle_probability_panel() -> void:
	if _probability_panel == null:
		return
	_probability_panel.visible = not _probability_panel.visible

func _update_responsive_layout() -> void:
	_update_pack_row_width()

func _update_pack_row_width() -> void:
	if _pack_row == null:
		return
	var width := 0.0
	for i in range(RECRUIT_PACKS.size()):
		width += PACK_ACTIVE_WIDTH if i == _selected_pack_index else PACK_MIN_WIDTH
		if i == _selected_pack_index:
			width += PACK_ACTION_WIDTH + 12.0
	width += maxi(0, RECRUIT_PACKS.size() - 1) * 12.0
	_pack_row.custom_minimum_size = Vector2(width, 0)

func _update_pack_feedback(index: int, pack: Dictionary, active: bool) -> void:
	if index < _pack_glow_strips.size() and _pack_glow_strips[index] is ColorRect:
		var glow := _pack_glow_strips[index] as ColorRect
		glow.color = Color(0.980, 0.720, 0.250, 0.90) if active else Color(0.400, 0.330, 0.190, 0.22)
		glow.custom_minimum_size = Vector2(0, 6 if active else 4)
	if index < _pack_state_labels.size() and _pack_state_labels[index] is Label:
		var label := _pack_state_labels[index] as Label
		label.text = "已展开" if active else str(pack.get("status", ""))
		label.add_theme_color_override("font_color", TEXT_GOLD if active else _status_color(str(pack.get("status", ""))))

func _scroll_selected_pack_into_view(animated: bool) -> void:
	if _pack_scroll == null:
		return
	var offset := 0.0
	for i in range(_selected_pack_index):
		offset += PACK_MIN_WIDTH
		offset += 12.0
	var target_scroll: int = maxi(0, int(offset - 14.0))
	if animated:
		var tween := create_tween()
		tween.tween_property(_pack_scroll, "scroll_horizontal", target_scroll, 0.12)
	else:
		_pack_scroll.scroll_horizontal = target_scroll

func _state_line(title: String, value: String, value_color: Color) -> Control:
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 8)
	row.add_child(_compact_label(title, 13, TEXT_MUTED))
	row.add_spacer(false)
	row.add_child(_compact_label(value, 13, value_color, HORIZONTAL_ALIGNMENT_RIGHT))
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
	for state_variant in BACKEND_STATES:
		var state := state_variant as Dictionary
		column.add_child(_backend_state_row(state))
	return panel

func _backend_state_row(state: Dictionary) -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 7)
	var label := _compact_label(str(state.get("label", "")), 12, _state_tone_color(str(state.get("tone", ""))))
	label.custom_minimum_size = Vector2(62, 0)
	row.add_child(label)
	var detail := _compact_label(str(state.get("detail", "")), 12, TEXT_MUTED)
	detail.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(detail)
	return row

func _resource_chip(title: String, value: String) -> Control:
	var panel := _panel(Color(0.045, 0.045, 0.041, 0.86), Color(0.260, 0.230, 0.150, 0.62), 2)
	panel.custom_minimum_size = Vector2(110, 36)
	var margin := _margin(8, 4, 8, 4)
	panel.add_child(margin)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 4)
	margin.add_child(row)
	row.add_child(_compact_label(title, 12, TEXT_MUTED))
	row.add_spacer(false)
	row.add_child(_compact_label(value, 15, TEXT_MAIN, HORIZONTAL_ALIGNMENT_RIGHT))
	return panel

func _badge(text: String, color: Color) -> Control:
	var panel := _panel(Color(0.036, 0.036, 0.034, 0.78), Color(0.240, 0.210, 0.150, 0.54), 2)
	var margin := _margin(7, 3, 7, 3)
	panel.add_child(margin)
	margin.add_child(_compact_label(text, 13, color))
	return panel

func _status_color(status: String) -> Color:
	if status == "可抽":
		return TEXT_GREEN
	if status == "未开放" or status == "资源不足" or status == "容量不足":
		return TEXT_RED
	return TEXT_MUTED

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

func _compact_label(text: String, font_size: int, color: Color, alignment: HorizontalAlignment = HORIZONTAL_ALIGNMENT_LEFT) -> Label:
	var label := _label(text, font_size, color)
	label.autowrap_mode = TextServer.AUTOWRAP_OFF
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	label.horizontal_alignment = alignment
	label.clip_text = true
	return label

func _vertical_text(text: String) -> String:
	var chars: Array[String] = []
	for index in range(text.length()):
		chars.append(text.substr(index, 1))
	return "\n".join(chars)

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
	return clampf(float(text.length()) * float(font_size) * 0.58 + 8.0, float(font_size * 2), 300.0)

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

func _maybe_capture_viewport(env_name: String) -> void:
	var output_path := OS.get_environment(env_name).strip_edges()
	if output_path == "":
		return
	call_deferred("_capture_viewport_deferred", output_path)

func _capture_viewport_deferred(output_path: String) -> void:
	await get_tree().process_frame
	await get_tree().process_frame
	var texture := get_viewport().get_texture()
	if texture == null:
		push_warning("Formal pack screenshot skipped: viewport texture is empty.")
		return
	var image := texture.get_image()
	if image == null:
		push_warning("Formal pack screenshot skipped: viewport image is empty.")
		return
	image.save_png(output_path)
	get_tree().quit()
