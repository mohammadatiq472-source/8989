extends Control
class_name GeneralRosterFormalPackPreview

const HeroCardViewScript := preload("res://scripts/ui/formal_pack/components/hero_card_view.gd")
const FormalPackCloseButton := preload("res://scripts/ui/formal_pack/components/formal_pack_close_button.gd")
const FormalPackPreviewAdapter := preload("res://scripts/ui/formal_pack/components/formal_pack_preview_adapter.gd")

const BG_ROOT := Color(0.030, 0.032, 0.034, 1.0)
const BG_BAND := Color(0.070, 0.071, 0.067, 0.94)
const BG_CARD := Color(0.095, 0.087, 0.074, 0.94)
const BG_CARD_ACTIVE := Color(0.170, 0.120, 0.067, 0.96)
const BORDER := Color(0.440, 0.370, 0.210, 0.52)
const BORDER_ACTIVE := Color(0.950, 0.710, 0.290, 0.90)
const TEXT_MAIN := Color(0.930, 0.900, 0.820, 1.0)
const TEXT_MUTED := Color(0.690, 0.670, 0.600, 1.0)
const TEXT_GOLD := Color(0.960, 0.730, 0.330, 1.0)
const TEXT_GREEN := Color(0.420, 0.760, 0.470, 1.0)
const TEXT_VIOLET := Color(0.900, 0.420, 0.920, 1.0)
const CARD_MIN_WIDTH := 202.0
const CARD_MAX_WIDTH := 246.0
const CARD_TARGET_HEIGHT := 336.0
const GRID_GAP := 18.0

const ROSTER_CARDS = [
	{"id": "hero_instance_001", "name": "曹操", "faction": "曹魏", "level": 28, "stars": "★★★★★", "power": 7800, "troop": "骑兵", "status": "已编组", "team": "部队一", "owner": "玩家", "quality": "S", "portraitAssetKey": "formal_pack.portrait.cao_cao_fate_v1"},
	{"id": "hero_instance_002", "name": "刘备", "faction": "季汉", "level": 33, "stars": "★★★★★", "power": 8500, "troop": "步兵", "status": "已编组", "team": "部队一", "owner": "AI", "quality": "S", "portraitAssetKey": "formal_pack.portrait.liu_bei_mature_hanzhong_sworddance_face_smile_v2"},
	{"id": "hero_instance_003", "name": "孙权", "faction": "东吴", "level": 38, "stars": "★★★★★", "power": 9200, "troop": "弓兵", "status": "战备92", "team": "部队一", "owner": "玩家", "quality": "S", "portraitAssetKey": "formal_pack.portrait.sun_quan_mature_successor_v1"},
	{"id": "hero_instance_004", "name": "诸葛亮", "faction": "季汉", "level": 40, "stars": "★★★★★", "power": 6375, "troop": "弓兵", "status": "已编组", "team": "部队二", "owner": "AI", "quality": "S", "portraitAssetKey": "formal_pack.portrait.zhuge_liang_mature_beifa_v1"},
	{"id": "hero_instance_005", "name": "关羽", "faction": "季汉", "level": 40, "stars": "★★★★★", "power": 4788, "troop": "骑兵", "status": "已编组", "team": "部队二", "owner": "玩家", "quality": "S", "portraitAssetKey": "formal_pack.portrait.guan_yu_mature_mounted_jingzhou_v1"},
	{"id": "hero_instance_006", "name": "周瑜", "faction": "东吴", "level": 41, "stars": "★★★★★", "power": 3575, "troop": "弓兵", "status": "预备", "team": "未编组", "owner": "AI", "quality": "S", "portraitAssetKey": "formal_pack.portrait.zhou_yu_mature_chibi_v1"},
	{"id": "hero_instance_007", "name": "吕布", "faction": "群雄", "level": 40, "stars": "★★★★★", "power": 9000, "troop": "骑兵", "status": "战备88", "team": "部队三", "owner": "玩家", "quality": "S", "portraitAssetKey": "formal_pack.portrait.lu_bu_mature_wenhou_v1"},
	{"id": "hero_instance_008", "name": "马超", "faction": "群雄", "level": 42, "stars": "★★★★★", "power": 9368, "troop": "骑兵", "status": "已编组", "team": "部队三", "owner": "AI", "quality": "S", "portraitAssetKey": "formal_pack.portrait.ma_chao_mature_xiliang_retreat_v1"},
	{"id": "hero_instance_009", "name": "司马懿", "faction": "曹魏", "level": 36, "stars": "★★★★★", "power": 7100, "troop": "弓兵", "status": "预备", "team": "部队四", "owner": "玩家", "quality": "S", "portraitAssetKey": "formal_pack.portrait.sima_yi_fate_gaopingling_v1"},
	{"id": "hero_instance_010", "name": "郭嘉", "faction": "曹魏", "level": 37, "stars": "★★★★★", "power": 7100, "troop": "骑兵", "status": "已编组", "team": "部队四", "owner": "AI", "quality": "S", "portraitAssetKey": "formal_pack.portrait.guo_jia_mature_fate_liaodong_v1"},
	{"id": "hero_instance_011", "name": "贾诩", "faction": "曹魏", "level": 39, "stars": "★★★★★", "power": 7100, "troop": "步兵", "status": "战备76", "team": "部队四", "owner": "玩家", "quality": "S", "portraitAssetKey": "formal_pack.portrait.jia_xu_mature_duoshi_v1"},
	{"id": "hero_instance_012", "name": "张辽", "faction": "曹魏", "level": 42, "stars": "★★★★★", "power": 9368, "troop": "骑兵", "status": "已编组", "team": "部队五", "owner": "AI", "quality": "S", "portraitAssetKey": "formal_pack.portrait.zhang_liao_mature_hefei_v1"},
]

var _profile_status_label: Label
var _roster_grid: GridContainer

func _ready() -> void:
	_build()
	call_deferred("_update_roster_grid_columns")

func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED:
		call_deferred("_update_roster_grid_columns")

func _build() -> void:
	for child in get_children():
		child.queue_free()

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
	column.add_child(_build_roster_grid())
	_maybe_capture_viewport("FORMAL_PACK_SCREENSHOT_GENERAL")

func _build_header() -> Control:
	var header := HBoxContainer.new()
	header.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.custom_minimum_size = Vector2(0, 56)
	header.add_theme_constant_override("separation", 12)
	header.add_child(_label("武将", 32, TEXT_GOLD))
	_profile_status_label = null
	header.add_spacer(false)
	header.add_child(_search_box())
	header.add_child(_filter_button("筛选"))
	header.add_child(FormalPackCloseButton.build("关闭", Callable(self, "_on_preview_close_pressed")))
	return header

func _build_roster_grid() -> Control:
	var holder := _panel(Color(0.045, 0.046, 0.047, 0.80), Color(0.150, 0.140, 0.110, 0.34), 2)
	holder.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	holder.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var margin := _margin(18, 18, 18, 18)
	holder.add_child(margin)

	var cards := _active_roster_cards()
	if cards.is_empty():
		margin.add_child(_build_empty_roster_state())
		return holder

	var grid := GridContainer.new()
	grid.name = "RosterCardGrid"
	grid.columns = 6
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.size_flags_vertical = Control.SIZE_EXPAND_FILL
	grid.add_theme_constant_override("h_separation", GRID_GAP)
	grid.add_theme_constant_override("v_separation", GRID_GAP)
	margin.add_child(grid)
	_roster_grid = grid

	for entry_variant in cards:
		grid.add_child(_build_roster_card(entry_variant as Dictionary))
	return holder

func _build_empty_roster_state() -> Control:
	var center := CenterContainer.new()
	center.name = "GeneralRosterEmptyState"
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	center.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var column := VBoxContainer.new()
	column.custom_minimum_size = Vector2(460, 0)
	column.add_theme_constant_override("separation", 8)
	center.add_child(column)
	column.add_child(_compact_label("暂无武将", 36, TEXT_GOLD, HORIZONTAL_ALIGNMENT_CENTER))
	return center

func _build_roster_card(entry: Dictionary) -> Button:
	var button := HeroCardViewScript.build_card(entry, HeroCardViewScript.MODE_OWNED_ROSTER, {
		"width": 224.0,
		"height": CARD_TARGET_HEIGHT,
		"top_height": 18.0,
		"top_alpha": 0.16,
		"left_strip_alpha": 0.24,
		"overlay_alpha": 0.22,
		"overlay_height": 54.0,
	})
	button.name = "OpenHeroProfileButton_%s" % str(entry.get("id", ""))
	button.pressed.connect(Callable(self, "_open_hero_profile").bind(str(entry.get("id", "")), str(entry.get("name", ""))))
	return button

func _open_hero_profile(hero_id: String, hero_name: String) -> void:
	if _profile_status_label == null:
		print("open_hero_profile:%s / activePageId=profile / %s" % [hero_id, hero_name])
		return
	_profile_status_label.text = "open_hero_profile:%s / activePageId=profile / %s" % [hero_id, hero_name]

func _on_preview_close_pressed() -> void:
	if _profile_status_label != null:
		_profile_status_label.text = "close_requested / activePanelId=\"\""

func _update_roster_grid_columns() -> void:
	if _roster_grid == null:
		return
	var parent_control := _roster_grid.get_parent() as Control
	var available_width: float = float(parent_control.size.x) if parent_control != null else size.x - 64.0
	if available_width <= 0.0:
		available_width = get_viewport_rect().size.x - 64.0
	var columns := 6
	_roster_grid.columns = columns
	var card_width: float = floor((available_width - GRID_GAP * float(maxi(0, columns - 1))) / float(columns))
	card_width = clampf(card_width, CARD_MIN_WIDTH, CARD_MAX_WIDTH)
	for child in _roster_grid.get_children():
		if child is Control:
			(child as Control).custom_minimum_size = Vector2(card_width, CARD_TARGET_HEIGHT)

func _deployed_count() -> int:
	var deployed := 0
	for entry_variant in _active_roster_cards():
		var entry := entry_variant as Dictionary
		if str(entry.get("status", "")).find("预备") < 0:
			deployed += 1
	return deployed

func _reserve_count() -> int:
	var reserve := 0
	for entry_variant in _active_roster_cards():
		var entry := entry_variant as Dictionary
		if str(entry.get("status", "")).find("预备") >= 0:
			reserve += 1
	return reserve

func _resource_chip(title: String, value: String) -> Control:
	var panel := _panel(Color(0.045, 0.045, 0.041, 0.86), Color(0.260, 0.230, 0.150, 0.62), 2)
	panel.custom_minimum_size = Vector2(108, 36)
	var margin := _margin(8, 4, 8, 4)
	panel.add_child(margin)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 4)
	margin.add_child(row)
	row.add_child(_compact_label(title, 12, TEXT_MUTED))
	row.add_spacer(false)
	row.add_child(_compact_label(value, 15, TEXT_MAIN, HORIZONTAL_ALIGNMENT_RIGHT))
	return panel

func _search_box() -> Control:
	var panel := _panel(Color(0.035, 0.036, 0.036, 0.94), Color(0.420, 0.400, 0.340, 0.72), 2)
	panel.custom_minimum_size = Vector2(260, 38)
	var margin := _margin(10, 5, 10, 5)
	panel.add_child(margin)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	margin.add_child(row)
	row.add_child(_compact_label("搜索武将 / 部队 / 归属", 14, TEXT_MUTED))
	row.add_spacer(false)
	row.add_child(_compact_label("查找", 14, TEXT_GOLD, HORIZONTAL_ALIGNMENT_RIGHT))
	return panel

func _filter_button(text: String) -> Control:
	var panel := _panel(Color(0.090, 0.086, 0.078, 0.94), Color(0.520, 0.460, 0.300, 0.78), 2)
	panel.custom_minimum_size = Vector2(84, 38)
	var margin := _margin(10, 5, 10, 5)
	panel.add_child(margin)
	var label := _compact_label(text, 15, TEXT_MAIN, HORIZONTAL_ALIGNMENT_CENTER)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	margin.add_child(label)
	return panel

func _active_roster_cards() -> Array:
	return FormalPackPreviewAdapter.owned_heroes(ROSTER_CARDS)

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

func _faction_border(entry: Dictionary) -> Color:
	match str(entry.get("tone", "")):
		"blue":
			return Color(0.370, 0.520, 0.720, 0.84)
		"green":
			return Color(0.360, 0.650, 0.330, 0.84)
		"red":
			return Color(0.780, 0.290, 0.300, 0.84)
		_:
			return Color(0.780, 0.520, 0.220, 0.84)

func _portrait_tone(entry: Dictionary) -> Color:
	match str(entry.get("tone", "")):
		"blue":
			return Color(0.160, 0.220, 0.300, 0.98)
		"green":
			return Color(0.150, 0.270, 0.155, 0.98)
		"red":
			return Color(0.300, 0.120, 0.130, 0.98)
		_:
			return Color(0.300, 0.190, 0.085, 0.98)

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
