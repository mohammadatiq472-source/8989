extends Control
class_name DrawResultFormalPackPreview

const HeroCardViewScript := preload("res://scripts/ui/formal_pack/components/hero_card_view.gd")
const FormalPackCloseButton := preload("res://scripts/ui/formal_pack/components/formal_pack_close_button.gd")

const BG_ROOT := Color(0.030, 0.032, 0.034, 1.0)
const BG_BAND := Color(0.070, 0.071, 0.067, 0.94)
const BG_PANEL := Color(0.045, 0.046, 0.047, 0.86)
const BORDER := Color(0.440, 0.370, 0.210, 0.52)
const BORDER_ACTIVE := Color(0.950, 0.710, 0.290, 0.90)
const TEXT_MAIN := Color(0.930, 0.900, 0.820, 1.0)
const TEXT_GOLD := Color(0.960, 0.730, 0.330, 1.0)
const TEXT_GREEN := Color(0.420, 0.760, 0.470, 1.0)

const FIVE_CARD_WIDTH := 224.0
const FIVE_CARD_HEIGHT := 540.0
const SINGLE_CARD_WIDTH := 330.0
const SINGLE_CARD_HEIGHT := 594.0
const CARD_GAP := 22.0
const DRAW_MODE_SINGLE := "single"
const DRAW_MODE_FIVE := "five"

const DRAW_RESULTS = [
	{"id": "draw_result_slot_01", "name": "长锋", "faction": "北府", "tone": "red", "level": 30, "stars": "★★★★★", "troop": "弓兵", "quality": "S", "status": "新获得", "result_label": "S级", "draw_label": "招募获得", "template_id": "heroTemplateId 接入位", "asset_key": "portraitAssetKey 接入位", "rarity": "rarity 接入位", "instance_id": "instanceId 接入位"},
	{"id": "draw_result_slot_02", "name": "云麾", "faction": "西庭", "tone": "gold", "level": 30, "stars": "★★★★★", "troop": "骑兵", "quality": "S", "status": "新获得", "result_label": "S级", "draw_label": "招募获得", "template_id": "heroTemplateId 接入位", "asset_key": "portraitAssetKey 接入位", "rarity": "rarity 接入位", "instance_id": "instanceId 接入位"},
	{"id": "draw_result_slot_03", "name": "赤弦", "faction": "东原", "tone": "blue", "level": 30, "stars": "★★★★★", "troop": "步兵", "quality": "S", "status": "已入库", "result_label": "S级", "draw_label": "已入库", "template_id": "heroTemplateId 接入位", "asset_key": "portraitAssetKey 接入位", "rarity": "rarity 接入位", "instance_id": "instanceId 接入位"},
	{"id": "draw_result_slot_04", "name": "苍衡", "faction": "南庭", "tone": "green", "level": 30, "stars": "★★★★★", "troop": "步兵", "quality": "S", "status": "已入库", "result_label": "S级", "draw_label": "已入库", "template_id": "heroTemplateId 接入位", "asset_key": "portraitAssetKey 接入位", "rarity": "rarity 接入位", "instance_id": "instanceId 接入位"},
	{"id": "draw_result_slot_05", "name": "南弈", "faction": "西庭", "tone": "gold", "level": 30, "stars": "★★★★★", "troop": "骑兵", "quality": "S", "status": "已入库", "result_label": "S级", "draw_label": "已入库", "template_id": "heroTemplateId 接入位", "asset_key": "portraitAssetKey 接入位", "rarity": "rarity 接入位", "instance_id": "instanceId 接入位"},
]

var _draw_mode := DRAW_MODE_FIVE
var _selected_index := 0
var _result_buttons: Array = []
var _result_stage: Control

func _ready() -> void:
	_draw_mode = _resolve_initial_draw_mode()
	_build()

func _build() -> void:
	for child in get_children():
		child.queue_free()
	_result_buttons.clear()

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
	column.add_child(_build_result_panel())
	_select_result(0)
	_maybe_capture_viewport("FORMAL_PACK_SCREENSHOT_DRAW_RESULT")

func _build_header() -> Control:
	var header := HBoxContainer.new()
	header.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.custom_minimum_size = Vector2(0, 54)
	header.add_theme_constant_override("separation", 12)
	var title := _compact_label("招募结果", 30, TEXT_GOLD)
	title.custom_minimum_size = Vector2(142, 40)
	title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	header.add_child(title)
	header.add_spacer(false)
	header.add_child(_badge("隔离 preview", TEXT_MAIN))
	header.add_child(_badge("不做本地随机", TEXT_GREEN))
	header.add_child(FormalPackCloseButton.build("关闭", Callable(self, "_on_preview_close_pressed")))
	return header

func _build_result_panel() -> Control:
	var panel := _panel(BG_PANEL, Color(0.150, 0.140, 0.110, 0.34), 2)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var margin := _margin(18, 6, 18, 12)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 8)
	margin.add_child(column)

	_result_stage = VBoxContainer.new()
	_result_stage.name = "DrawResultHeroCardStage"
	_result_stage.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_result_stage.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(_result_stage)
	_rebuild_result_stage()
	return panel

func _rebuild_result_stage() -> void:
	if _result_stage == null:
		return
	for child in _result_stage.get_children():
		child.queue_free()
	_result_buttons.clear()

	var stage_col := _result_stage as VBoxContainer
	stage_col.add_theme_constant_override("separation", 10)

	var center := CenterContainer.new()
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	center.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	stage_col.add_child(center)

	if _draw_mode == DRAW_MODE_SINGLE:
		var entry := DRAW_RESULTS[0] as Dictionary
		var card := _build_result_card(entry, 0, SINGLE_CARD_WIDTH, SINGLE_CARD_HEIGHT, false)
		center.add_child(card)
	else:
		var row := HBoxContainer.new()
		row.name = "DrawResultFiveCardRow"
		row.add_theme_constant_override("separation", CARD_GAP)
		center.add_child(row)
		for index in range(mini(5, DRAW_RESULTS.size())):
			var entry := DRAW_RESULTS[index] as Dictionary
			row.add_child(_build_result_card(entry, index, FIVE_CARD_WIDTH, FIVE_CARD_HEIGHT, false))
	var action_center := CenterContainer.new()
	action_center.name = "DrawResultRepeatActionSlot"
	action_center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stage_col.add_child(action_center)
	action_center.add_child(_action_button(_repeat_action_label(), "repeat"))
	stage_col.add_spacer(false)

func _build_result_card(entry: Dictionary, index: int, card_width: float, card_height: float, compact: bool) -> Button:
	var card := HeroCardViewScript.build_card(entry, HeroCardViewScript.MODE_DRAW_RESULT, {
		"width": card_width,
		"height": card_height,
		"compact": compact,
		"top_height": 20.0 if not compact else 14.0,
		"top_alpha": 0.16,
		"top_left_width": 72.0 if not compact else 38.0,
		"left_strip_width": 46.0 if not compact else 22.0,
		"left_strip_alpha": 0.18,
		"identity_strip_height": 206.0 if card_height > 560.0 else 184.0,
		"identity_faction_font_size": 12 if not compact else 7,
		"identity_name_font_size": 15 if not compact else 8,
		"overlay_alpha": 0.18,
		"overlay_height": 56.0 if not compact else 40.0,
		"bottom_height": 32.0 if not compact else 20.0,
		"bottom_alpha": 0.34,
	})
	card.custom_minimum_size = Vector2(card_width, card_height)
	card.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	card.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	card.name = "DrawResultCard_%s" % str(entry.get("id", "slot"))
	card.pressed.connect(Callable(self, "_select_result").bind(index))
	_result_buttons.append(card)
	return card

func _action_button(text: String, action: String) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(168, 46)
	button.focus_mode = Control.FOCUS_NONE
	button.add_theme_font_size_override("font_size", 16)
	button.add_theme_stylebox_override("normal", _style(Color(0.105, 0.092, 0.070, 0.94), Color(0.660, 0.540, 0.260, 0.84), 2))
	button.add_theme_stylebox_override("hover", _style(Color(0.170, 0.120, 0.067, 0.96), BORDER_ACTIVE, 2))
	button.add_theme_color_override("font_color", TEXT_MAIN)
	button.pressed.connect(Callable(self, "_on_action_pressed").bind(action))
	return button

func _on_action_pressed(action: String) -> void:
	if action != "repeat":
		return

func _select_result(index: int) -> void:
	var visible_count := 1 if _draw_mode == DRAW_MODE_SINGLE else mini(5, DRAW_RESULTS.size())
	_selected_index = clampi(index, 0, maxi(0, visible_count - 1))
	for i in range(_result_buttons.size()):
		var card := _result_buttons[i] as Control
		if card == null:
			continue
		card.modulate = Color(1.10, 1.05, 0.88, 1.0) if i == _selected_index else Color(1.0, 1.0, 1.0, 1.0)

func _repeat_action_label() -> String:
	return "再招募 1 次" if _draw_mode == DRAW_MODE_SINGLE else "再招募 5 次"

func _resolve_initial_draw_mode() -> String:
	var env_mode := OS.get_environment("FORMAL_PACK_DRAW_MODE").strip_edges().to_lower()
	return DRAW_MODE_SINGLE if env_mode == DRAW_MODE_SINGLE else DRAW_MODE_FIVE

func _on_preview_close_pressed() -> void:
	visible = false

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
	return clampf(float(text.length()) * float(font_size) * 0.58 + 8.0, float(font_size * 2), 420.0)

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
