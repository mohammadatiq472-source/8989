@tool
extends PanelContainer
class_name WarzoneSummaryPanel

signal entry_requested(target_story_id: String, reason: String, request_payload: Dictionary)

const UiThemeTokensScript = preload("res://scripts/ui/ui_theme_tokens.gd")

const SAMPLE_STATE: Dictionary = {
	"headline": "战区摘要｜右栏读板",
	"subheadline": "先看坐标、关口、入口，再切到国家层，不离开预览台。",
	"entryStatus": "国家层入口",
	"compactEmbed": true,
	"statusPills": [
		"战区摘要",
		"坐标联动",
		"关口读板",
		"连续点跳",
	],
	"focusCards": [
		{
			"title": "坐标",
			"value": "X=128 / Y=84",
			"detail": "点击后回到地图定位点。",
			"tone": "coord",
			"toneLabel": "坐标",
		},
		{
			"title": "关口",
			"value": "虎牢 / 汜水",
			"detail": "先看门闸，再看回线。",
			"tone": "gate",
			"toneLabel": "关口",
		},
		{
			"title": "入口",
			"value": "国家层前置",
			"detail": "从摘要继续进入国家层。",
			"tone": "route",
			"toneLabel": "入口",
		},
	],
	"summaryLines": [
		"右栏先给坐标、关口、入口三层读板。",
		"摘要先收口，再进入国家层，不绕主场景。",
		"让人和 AI 都能按同一入口继续。",
	],
	"actionChips": [
		"定位坐标",
		"查看关口",
		"继续国家层",
	],
	"storyNavigation": {
		"targetStoryId": "nation_layer",
		"buttonLabel": "继续到国家层",
		"buttonHint": "先看右栏摘要，再切到国家层前置页。",
		"reason": "warzone_to_nation",
		"targetStateId": "foundation_ready",
		"title": "国家层入口",
	},
}

@export_group("Layout")
@export var content_margin_h: int = 18
@export var content_margin_v: int = 14
@export var main_vbox_separation: int = 10
@export var header_row_separation: int = 10
@export var status_row_min_height: float = 26.0
@export var focus_section_min_height: float = 20.0
@export var focus_grid_h_separation: int = 9
@export var focus_grid_v_separation: int = 7
@export var summary_rows_separation: int = 4
@export var action_row_separation: int = 7
@export var entry_margin_h: int = 12
@export var entry_margin_v: int = 9
@export var entry_row_separation: int = 10
@export var entry_button_min_width: float = 164.0
@export var entry_button_min_height: float = 34.0
@export var focus_card_min_height: float = 44.0
@export var focus_card_margin_h: int = 7
@export var focus_card_margin_v: int = 3
@export var action_chip_min_width: float = 122.0
@export var action_chip_min_height: float = 28.0

@export_group("Typography")
@export var header_title_font_size: int = 24
@export var header_subtitle_font_size: int = 14
@export var entry_status_font_size: int = 11
@export var section_title_font_size: int = 15
@export var section_hint_font_size: int = 11
@export var panel_title_font_size: int = 15
@export var panel_value_font_size: int = 15
@export var panel_detail_font_size: int = 11
@export var body_text_font_size: int = 11
@export var action_chip_font_size: int = 11
@export var entry_button_font_size: int = 14
@export var entry_hint_font_size: int = 12

@export_group("Contrast")
@export_range(0.6, 1.8, 0.05) var contrast_strength: float = 1.40
@export var accent_default: Color = Color(0.92, 0.74, 0.44, 0.96)
@export var title_color: Color = Color(0.97, 0.98, 1.0, 0.98)
@export var subtitle_color: Color = Color(0.86, 0.92, 0.98, 0.90)
@export var entry_status_color: Color = Color(0.86, 0.90, 0.96, 0.92)
@export var body_text_color: Color = Color(0.91, 0.95, 1.0, 0.92)
@export var detail_text_color: Color = Color(0.88, 0.94, 0.99, 0.90)
@export var entry_hint_color: Color = Color(0.20, 0.24, 0.32, 0.95)

var _theme_tokens: UiThemeTokens = UiThemeTokensScript.new()
var _content_margin: MarginContainer
var _header_title: Label
var _header_subtitle: Label
var _entry_status: Label
var _status_row: HBoxContainer
var _focus_section_row: HBoxContainer
var _focus_grid: GridContainer
var _summary_rows: VBoxContainer
var _action_row: HBoxContainer
var _entry_panel: PanelContainer
var _entry_button: Button
var _entry_hint: Label
var _accent_bar: ColorRect
var _compact_embed: bool = true
var _preview_state: Dictionary = {}
var _ui_ready: bool = false


func _ready() -> void:
	_build_shell()
	if _preview_state.is_empty():
		apply_preview_state(SAMPLE_STATE)


func apply_preview_state(state: Dictionary) -> void:
	if not _ui_ready:
		_build_shell()
	_preview_state = _merge_preview_state(state)
	_compact_embed = bool(_preview_state.get("compactEmbed", true))
	_apply_compact_layout()
	_render_state()


func _build_shell() -> void:
	if _ui_ready:
		return
	_ui_ready = true

	clip_contents = true
	_apply_panel_style(self, "panel", "hud_bottom_bar")

	_content_margin = _create_margin_container(self, "SummaryMargin", content_margin_h, content_margin_v, content_margin_h, content_margin_v)
	_content_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var main_vbox := _create_vbox(_content_margin, "SummaryVBox", main_vbox_separation)
	main_vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var header_row := _create_hbox(main_vbox, "HeaderRow", header_row_separation)
	header_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header_row.alignment = BoxContainer.ALIGNMENT_BEGIN

	var header_column := _create_vbox(header_row, "HeaderColumn", 1)
	header_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_header_title = _create_label(header_column, "HeaderTitle", "战区摘要｜右栏读板", header_title_font_size)
	_apply_compact_text_mode(_header_title)
	_header_title.modulate = title_color
	_header_subtitle = _create_label(header_column, "HeaderSubtitle", "先看坐标、关口、入口，再切到国家层。", header_subtitle_font_size)
	_apply_compact_text_mode(_header_subtitle)
	_header_subtitle.modulate = subtitle_color

	var header_spacer := Control.new()
	header_spacer.name = "HeaderSpacer"
	header_spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header_row.add_child(header_spacer)

	_entry_status = _create_label(header_row, "EntryStatus", "国家层入口", entry_status_font_size)
	_apply_compact_text_mode(_entry_status)
	_entry_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_entry_status.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_entry_status.size_flags_horizontal = Control.SIZE_SHRINK_END
	_entry_status.modulate = entry_status_color

	_accent_bar = ColorRect.new()
	_accent_bar.name = "AccentBar"
	_accent_bar.color = accent_default
	_accent_bar.custom_minimum_size = Vector2(0.0, 4.0)
	main_vbox.add_child(_accent_bar)

	_status_row = _create_hbox(main_vbox, "StatusRow", 6)
	_status_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_status_row.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	_status_row.custom_minimum_size = Vector2(0.0, status_row_min_height)

	_focus_section_row = _create_hbox(main_vbox, "FocusSectionRow", 6)
	_focus_section_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_focus_section_row.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	_focus_section_row.custom_minimum_size = Vector2(0.0, focus_section_min_height)
	var focus_section_title := _create_label(_focus_section_row, "FocusSectionTitle", "战区读板", section_title_font_size)
	_apply_compact_text_mode(focus_section_title)
	focus_section_title.modulate = title_color
	var focus_section_hint := _create_label(_focus_section_row, "FocusSectionHint", "坐标 / 关口 / 入口", section_hint_font_size)
	_apply_compact_text_mode(focus_section_hint)
	focus_section_hint.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	focus_section_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	focus_section_hint.modulate = subtitle_color

	_focus_grid = GridContainer.new()
	_focus_grid.name = "FocusGrid"
	_focus_grid.columns = 3
	_focus_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_focus_grid.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	_focus_grid.add_theme_constant_override("h_separation", focus_grid_h_separation)
	_focus_grid.add_theme_constant_override("v_separation", focus_grid_v_separation)
	main_vbox.add_child(_focus_grid)

	_summary_rows = _create_vbox(main_vbox, "SummaryRows", summary_rows_separation)
	_summary_rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_summary_rows.size_flags_vertical = Control.SIZE_SHRINK_BEGIN

	_action_row = _create_hbox(main_vbox, "ActionRow", action_row_separation)
	_action_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_action_row.size_flags_vertical = Control.SIZE_SHRINK_BEGIN

	_entry_panel = _create_panel(main_vbox, "EntryPanel")
	_apply_panel_style(_entry_panel, "panel", "hud_bottom_bar")
	_entry_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_entry_panel.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	var entry_margin := _create_margin_container(_entry_panel, "EntryMargin", entry_margin_h, entry_margin_v, entry_margin_h, entry_margin_v)
	entry_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var entry_row := _create_hbox(entry_margin, "EntryRow", entry_row_separation)
	entry_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_entry_button = _create_button(entry_row, "EntryButton", "继续到国家层", entry_button_font_size, entry_button_min_width)
	_entry_button.custom_minimum_size.y = entry_button_min_height
	_apply_button_style(_entry_button, "advance_tick")
	_entry_button.pressed.connect(_on_entry_button_pressed)
	var entry_column := _create_vbox(entry_row, "EntryColumn", 1)
	entry_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_entry_hint = _create_label(entry_column, "EntryHint", "先看右栏摘要，再切到国家层前置页。", entry_hint_font_size)
	_apply_compact_text_mode(_entry_hint)
	_entry_hint.modulate = entry_hint_color
	var entry_spacer := Control.new()
	entry_spacer.name = "EntrySpacer"
	entry_spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	entry_row.add_child(entry_spacer)


func _render_state() -> void:
	var accent := _read_color(_preview_state.get("accentColor", null), accent_default)
	_header_title.text = str(_preview_state.get("headline", SAMPLE_STATE.get("headline", "战区摘要｜右栏读板")))
	_header_subtitle.text = str(_preview_state.get("subheadline", SAMPLE_STATE.get("subheadline", "")))
	_entry_status.text = str(_preview_state.get("entryStatus", SAMPLE_STATE.get("entryStatus", "国家层入口")))
	_header_title.modulate = _blend_color(title_color, accent, 0.22)
	_header_subtitle.modulate = _blend_color(subtitle_color, accent, 0.16)
	_entry_status.modulate = _blend_color(entry_status_color, accent, 0.24)
	if _accent_bar != null and is_instance_valid(_accent_bar):
		_accent_bar.color = accent
	_render_status_pills(_status_row, _normalize_string_array(_preview_state.get("statusPills", [])), accent)
	_render_focus_cards(_focus_grid, _normalize_cards(_preview_state.get("focusCards", [])), accent)
	_render_summary_rows(_summary_rows, _normalize_string_array(_preview_state.get("summaryLines", [])), accent)
	_render_action_row(_action_row, _normalize_string_array(_preview_state.get("actionChips", [])), accent)
	_sync_entry_row(accent)


func _render_status_pills(parent: HBoxContainer, pills: Array, accent: Color) -> void:
	_clear_children(parent)
	var index := 0
	var normalized := pills
	if normalized.is_empty():
		normalized = _normalize_string_array(SAMPLE_STATE.get("statusPills", []))
	for pill_variant in normalized:
		var pill_text := str(pill_variant).strip_edges()
		if pill_text == "":
			continue
		parent.add_child(_create_chip(pill_text, _blend_color(body_text_color, accent, 0.22), "hud_top_left", "StatusPill_%d" % index, action_chip_font_size))
		index += 1


func _render_focus_cards(parent: GridContainer, cards: Array, accent: Color) -> void:
	_clear_children(parent)
	var normalized := cards
	if normalized.is_empty():
		normalized = _normalize_cards(SAMPLE_STATE.get("focusCards", []))
	parent.columns = 3 if normalized.size() >= 3 else max(1, normalized.size())
	var index := 0
	for card_variant in normalized:
		if card_variant is not Dictionary:
			continue
		var card_state: Dictionary = card_variant as Dictionary
		var card := PanelContainer.new()
		card.name = "FocusCard_%d" % index
		card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		card.custom_minimum_size = Vector2(0.0, focus_card_min_height)
		_apply_panel_style(card, "panel", _tone_token(str(card_state.get("tone", "route"))))
		parent.add_child(card)

		var margin := _create_margin_container(card, "FocusCardMargin_%d" % index, focus_card_margin_h, focus_card_margin_v, focus_card_margin_h, focus_card_margin_v)
		margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		var vbox := _create_vbox(margin, "FocusCardVBox_%d" % index, 3)
		vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

		var stripe := ColorRect.new()
		stripe.name = "FocusStripe_%d" % index
		stripe.custom_minimum_size = Vector2(0.0, 2.0)
		stripe.color = _tone_color(str(card_state.get("tone", "route")), accent)
		vbox.add_child(stripe)

		var title_row := _create_hbox(vbox, "FocusTitleRow_%d" % index, 6)
		title_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var title := _create_label(title_row, "FocusTitle_%d" % index, str(card_state.get("title", "摘要")), _summary_font_size(panel_title_font_size))
		_apply_compact_text_mode(title)
		title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		title.modulate = _blend_color(title_color, accent, 0.10)
		var tone_chip := _create_chip(str(card_state.get("toneLabel", _tone_label(str(card_state.get("tone", "route"))))), _tone_color(str(card_state.get("tone", "route")), accent), "observability_panel", "FocusTone_%d" % index, _summary_font_size(10))
		title_row.add_child(tone_chip)

		var value := _create_label(vbox, "FocusValue_%d" % index, str(card_state.get("value", "—")), _summary_font_size(panel_value_font_size))
		_apply_compact_text_mode(value)
		value.modulate = _tone_color(str(card_state.get("tone", "route")), accent).lightened(0.04)

		var detail := _create_label(vbox, "FocusDetail_%d" % index, str(card_state.get("detail", "")), _summary_font_size(panel_detail_font_size))
		_apply_compact_text_mode(detail)
		detail.modulate = _blend_color(detail_text_color, accent, 0.10)
		index += 1


func _render_summary_rows(parent: VBoxContainer, lines: Array, accent: Color) -> void:
	_clear_children(parent)
	var normalized := lines
	if normalized.is_empty():
		normalized = _normalize_string_array(SAMPLE_STATE.get("summaryLines", []))
	var index := 0
	for line_variant in normalized:
		var line_text := str(line_variant).strip_edges()
		if line_text == "":
			continue
		var row := _create_hbox(parent, "SummaryRow_%d" % index, 5)
		row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var bullet := _create_label(row, "SummaryBullet_%d" % index, "•", _summary_font_size(body_text_font_size))
		bullet.custom_minimum_size = Vector2(14.0, 0.0)
		bullet.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		bullet.modulate = _lift_color(accent, 0.10)
		var text := _create_label(row, "SummaryText_%d" % index, line_text, _summary_font_size(body_text_font_size))
		_apply_compact_text_mode(text)
		text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		text.modulate = _blend_color(body_text_color, accent, 0.08)
		index += 1


func _render_action_row(parent: HBoxContainer, labels: Array, accent: Color) -> void:
	_clear_children(parent)
	var normalized := labels
	if normalized.is_empty():
		normalized = _normalize_string_array(SAMPLE_STATE.get("actionChips", []))
	var index := 0
	for label_variant in normalized:
		var label_text := str(label_variant).strip_edges()
		if label_text == "":
			continue
		var button := Button.new()
		button.name = "Action_%d" % index
		button.text = label_text
		button.focus_mode = Control.FOCUS_NONE
		button.clip_text = true
		button.custom_minimum_size = Vector2(action_chip_min_width, action_chip_min_height)
		button.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		button.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		button.add_theme_font_size_override("font_size", _summary_font_size(action_chip_font_size))
		parent.add_child(button)
		_apply_button_style(button, "advance_tick")
		button.modulate = _lift_color(accent, 0.10)
		index += 1


func _sync_entry_row(accent: Color) -> void:
	var navigation_meta: Dictionary = _resolve_story_navigation_meta()
	var target_story_id := str(navigation_meta.get("targetStoryId", "")).strip_edges()
	var button_label := str(navigation_meta.get("buttonLabel", "继续到国家层")).strip_edges()
	var hint_text := str(navigation_meta.get("buttonHint", "先看右栏摘要，再切到国家层前置页。")).strip_edges()
	if _entry_button != null:
		_entry_button.text = button_label if button_label != "" else "继续到国家层"
		_entry_button.disabled = target_story_id == ""
		_entry_button.modulate = _lift_color(accent, 0.08)
	if _entry_hint != null:
		_entry_hint.text = hint_text if hint_text != "" else "先看右栏摘要，再切到国家层前置页。"
		_entry_hint.modulate = _blend_color(entry_hint_color, accent, 0.30)


func _resolve_story_navigation_meta() -> Dictionary:
	var navigation_meta: Dictionary = _normalize_dictionary(_preview_state.get("storyNavigation", {}))
	if not navigation_meta.is_empty():
		return navigation_meta
	return _normalize_dictionary(SAMPLE_STATE.get("storyNavigation", {}))


func _on_entry_button_pressed() -> void:
	var navigation_meta: Dictionary = _resolve_story_navigation_meta()
	var target_story_id := str(navigation_meta.get("targetStoryId", "")).strip_edges()
	if target_story_id == "":
		return
	var reason := str(navigation_meta.get("reason", "warzone_to_nation")).strip_edges()
	var request_payload: Dictionary = _normalize_dictionary(navigation_meta.get("requestPayload", {}))
	var target_state_id := str(navigation_meta.get("targetStateId", "")).strip_edges()
	if target_state_id != "":
		request_payload["targetStateId"] = target_state_id
	request_payload["entry"] = "warzone_summary_entry"
	request_payload["sourceStateId"] = str(_preview_state.get("id", ""))
	emit_signal("entry_requested", target_story_id, reason, request_payload)


func _summary_font_size(base_size: int) -> int:
	return base_size - 1 if _compact_embed and base_size > 10 else base_size


func _apply_compact_layout() -> void:
	if _status_row != null and is_instance_valid(_status_row):
		var compact_status_separation: int = max(4, action_row_separation - 2)
		_status_row.add_theme_constant_override("separation", compact_status_separation if _compact_embed else action_row_separation)
	if _focus_section_row != null and is_instance_valid(_focus_section_row):
		var compact_section_separation: int = max(4, action_row_separation - 2)
		_focus_section_row.add_theme_constant_override("separation", compact_section_separation if _compact_embed else max(action_row_separation - 1, 5))
	if _focus_grid != null and is_instance_valid(_focus_grid):
		_focus_grid.add_theme_constant_override("h_separation", max(6, focus_grid_h_separation - 2) if _compact_embed else focus_grid_h_separation)
		_focus_grid.add_theme_constant_override("v_separation", max(5, focus_grid_v_separation - 1) if _compact_embed else focus_grid_v_separation)
	if _summary_rows != null and is_instance_valid(_summary_rows):
		_summary_rows.add_theme_constant_override("separation", max(3, summary_rows_separation - 1) if _compact_embed else summary_rows_separation)
	if _action_row != null and is_instance_valid(_action_row):
		_action_row.add_theme_constant_override("separation", max(5, action_row_separation - 1) if _compact_embed else action_row_separation)
	if _entry_hint != null and is_instance_valid(_entry_hint):
		_entry_hint.add_theme_font_size_override("font_size", max(9, entry_hint_font_size - 1) if _compact_embed else entry_hint_font_size)


func _apply_compact_text_mode(label: Label) -> void:
	if label == null:
		return
	if not _compact_embed:
		return
	label.autowrap_mode = TextServer.AUTOWRAP_OFF
	label.clip_text = true
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS


func _normalize_cards(raw_value: Variant) -> Array:
	if raw_value is not Array:
		return []
	var normalized: Array = []
	for item in raw_value as Array:
		if item is Dictionary:
			normalized.append((item as Dictionary).duplicate(true))
	return normalized


func _normalize_string_array(raw_value: Variant) -> Array:
	if raw_value is not Array:
		return []
	var normalized: Array = []
	for item in raw_value as Array:
		var text := str(item).strip_edges()
		if text != "":
			normalized.append(text)
	return normalized


func _tone_label(tone: String) -> String:
	match tone:
		"coord":
			return "坐标"
		"pressure":
			return "压强"
		"gate":
			return "关口"
		"route":
			return "路线"
		"city":
			return "城池"
		"army":
			return "军势"
		_:
			return "摘要"


func _tone_token(tone: String) -> String:
	match tone:
		"coord":
			return "hud_top_left"
		"pressure":
			return "observability_panel"
		"gate":
			return "hud_top_left"
		"route":
			return "hud_bottom_bar"
		"city":
			return "hud_top_left"
		"army":
			return "observability_panel"
		_:
			return "hud_top_left"


func _tone_color(tone: String, accent: Color) -> Color:
	match tone:
		"coord":
			return _blend_color(Color(0.60, 0.86, 1.0, 0.96), accent, 0.08)
		"pressure":
			return _blend_color(Color(1.0, 0.64, 0.34, 0.98), accent, 0.16)
		"gate":
			return _lift_color(accent, 0.10)
		"route":
			return _blend_color(Color(0.82, 0.78, 0.56, 0.96), accent, 0.28)
		"city":
			return _blend_color(Color(0.74, 0.90, 0.82, 0.96), accent, 0.12)
		"army":
			return _blend_color(Color(0.98, 0.84, 0.48, 0.96), accent, 0.20)
		_:
			return _lift_color(accent, 0.10)


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


func _create_button(parent: Node, node_name: String, text: String = "", font_size: int = 14, minimum_width: float = 0.0) -> Button:
	var button := Button.new()
	button.name = node_name
	button.text = text
	button.add_theme_font_size_override("font_size", font_size)
	button.focus_mode = Control.FOCUS_NONE
	if minimum_width > 0.0:
		button.custom_minimum_size = Vector2(minimum_width, 0.0)
	parent.add_child(button)
	return button


func _create_chip(text: String, accent: Color, token_name: String = "hud_top_left", node_name: String = "", font_size: int = 10) -> PanelContainer:
	var chip := PanelContainer.new()
	chip.name = node_name if node_name != "" else "Chip_%s" % text.replace(" ", "_").replace("/", "_")
	chip.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	chip.custom_minimum_size = Vector2(0.0, 24.0)
	_apply_panel_style(chip, "panel", token_name)
	var margin := _create_margin_container(chip, "ChipMargin", 7, 1, 7, 1)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var label := _create_label(margin, "Text", text, font_size)
	_apply_compact_text_mode(label)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.modulate = accent
	return chip


func _apply_panel_style(panel: PanelContainer, category: String, token_name: String) -> void:
	if panel == null:
		return
	_theme_tokens.apply_panel_style(panel, category, token_name)


func _apply_button_style(button: Button, token_name: String) -> void:
	if button == null:
		return
	_theme_tokens.apply_button_style(button, token_name)


func _clear_children(parent: Node) -> void:
	for child in parent.get_children():
		child.queue_free()


func _merge_preview_state(state: Dictionary) -> Dictionary:
	var merged_state: Dictionary = SAMPLE_STATE.duplicate(true)
	if state.is_empty():
		return merged_state
	for key_variant in state.keys():
		var key := str(key_variant)
		var value: Variant = state.get(key_variant, null)
		if value is Dictionary:
			merged_state[key] = (value as Dictionary).duplicate(true)
		elif value is Array:
			merged_state[key] = _duplicate_array(value as Array)
		else:
			merged_state[key] = value
	return merged_state


func _duplicate_array(values: Array) -> Array:
	var copied: Array = []
	for item in values:
		if item is Dictionary:
			copied.append((item as Dictionary).duplicate(true))
		elif item is Array:
			copied.append(_duplicate_array(item as Array))
		else:
			copied.append(item)
	return copied


func _normalize_dictionary(raw_value: Variant) -> Dictionary:
	if raw_value is Dictionary:
		return (raw_value as Dictionary).duplicate(true)
	return {}


func _read_color(raw_color: Variant, fallback_color: Color) -> Color:
	if raw_color is Color:
		return raw_color as Color
	if raw_color is Dictionary:
		var color_dict: Dictionary = raw_color as Dictionary
		if color_dict.has("r") and color_dict.has("g") and color_dict.has("b"):
			var r: float = float(color_dict.get("r", fallback_color.r))
			var g: float = float(color_dict.get("g", fallback_color.g))
			var b: float = float(color_dict.get("b", fallback_color.b))
			var a: float = float(color_dict.get("a", fallback_color.a))
			return Color(r, g, b, a)
	return fallback_color


func _lift_color(base: Color, lift: float) -> Color:
	var amount: float = clamp(lift * contrast_strength, 0.0, 0.95)
	return base.lightened(amount)


func _blend_color(base: Color, accent: Color, weight: float) -> Color:
	var clamped_weight: float = clamp(weight * contrast_strength, 0.0, 1.0)
	return base.lerp(accent, clamped_weight)
