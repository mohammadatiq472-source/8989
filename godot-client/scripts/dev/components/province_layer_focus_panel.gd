@tool
extends Control
class_name ProvinceLayerFocusPanel

signal entry_requested(target_story_id: String, reason: String, request_payload: Dictionary)

const UiThemeTokensScript = preload("res://scripts/ui/ui_theme_tokens.gd")

const SURFACE_SHELL_TEXTURE_PATH := "res://assets/themes/slgclient/current/ui/bg_window_6.png"
const SURFACE_TITLE_TEXTURE_PATH := "res://assets/themes/slgclient/current/ui/tipsbiaoti.png"
const SURFACE_SECTION_TEXTURE_PATH := "res://assets/themes/slgclient/current/ui/diban_1.png"
const SURFACE_CARD_TEXTURE_PATH := "res://assets/themes/slgclient/current/ui/diban1_23.png"
const SURFACE_BAND_TEXTURE_PATH := "res://assets/themes/slgclient/current/ui/toast_bg.png"

const SAMPLE_STATE: Dictionary = {
	"headline": "州层流程页｜北部关口",
	"focusProvinceName": "Jinyang / Bing",
	"focusCityName": "Jinyang",
	"focusCityKindLabel": "角色城",
	"focusUnionName": "北线同盟",
	"focusGateName": "Taihang Pass",
	"focusTilePos": "X 142 / Y 087",
	"focusDurableText": "耐久 92%",
	"focusYieldText": "木 8 / 铁 4 / 粮 10",
	"focusSoldierText": "驻军 14.2k",
	"focusPressureText": "压强 中",
	"cameraStateText": "锁定州府轴",
	"hoverTileId": "city_bing",
	"zoom": 0.39,
	"storyNavigation": {
		"targetStoryId": "warzone_layer",
		"buttonLabel": "进入战区流程",
		"buttonHint": "从州层切到战区总览页。",
		"reason": "province_to_warzone",
		"targetStateId": "province_overview",
		"title": "战区流程页"
	},
	"accentColor": {"r": 0.94, "g": 0.74, "b": 0.44, "a": 1.0},
}

const PROVINCE_NAME_MAP := {
	"You": "幽州",
	"Ji": "冀州",
	"Qing": "青州",
	"Xu": "徐州",
	"Bing": "并州",
	"Si Li": "司隶",
	"Yu": "豫州",
	"Yan": "兖州",
	"Jing": "荆州",
	"Liang": "凉州",
	"Yang": "扬州",
	"Yi": "益州",
	"Jiao": "交州",
}
const CITY_NAME_MAP := {
	"Juyong": "居庸",
	"Jicheng": "蓟城",
	"Linzi": "临淄",
	"Pengcheng": "彭城",
	"Jinyang": "晋阳",
	"Luoyang": "洛阳",
	"Yingchuan": "颍川",
	"Chenliu": "陈留",
	"Xiangyang": "襄阳",
	"Tianshui": "天水",
	"Shouchun": "寿春",
	"Chengdu": "成都",
	"Panyu": "番禺",
}
const GATE_NAME_MAP := {
	"Juyong Pass": "居庸关",
	"Pingyuan Gate": "平原关",
	"Qi Gate": "齐关",
	"Si River Gate": "泗水关",
	"Taihang Pass": "太行关",
	"Hangu Gate": "函谷关",
	"Huai Gate": "淮关",
	"Yanling Pass": "兖陵关",
	"Xiangyang Gate": "襄阳关",
	"Tong Pass": "潼关",
	"Hefei Gate": "合肥关",
	"Jianmen Pass": "剑门关",
	"Nanhai Gate": "南海关",
}

@export_group("Layout")
@export var shell_margin_left: int = 18
@export var shell_margin_top: int = 12
@export var shell_margin_right: int = 18
@export var shell_margin_bottom: int = 12
@export var shell_vbox_separation: int = 8
@export var header_min_height: float = 58.0
@export var body_min_height: float = 170.0
@export var summary_min_height: float = 150.0
@export var focus_min_height: float = 150.0
@export var summary_min_width: float = 320.0
@export var focus_min_width: float = 320.0
@export var entry_min_height: float = 52.0
@export var panel_inner_margin_h: int = 12
@export var panel_inner_margin_v: int = 9
@export var header_margin_h: int = 12
@export var header_margin_v: int = 8
@export var body_row_separation: int = 10
@export var entry_row_separation: int = 10
@export var summary_focus_grid_separation: int = 6
@export var chip_min_width: float = 104.0
@export var header_chip_separation: int = 8
@export var entry_button_min_width: float = 164.0
@export var entry_margin_v: int = 7
@export var compact_body_min_height: float = 132.0
@export var compact_summary_min_height: float = 118.0
@export var compact_focus_min_height: float = 118.0

@export_group("Typography")
@export var header_title_font_size: int = 24
@export var header_subtitle_font_size: int = 14
@export var panel_title_font_size: int = 15
@export var panel_subtitle_font_size: int = 13
@export var stat_key_font_size: int = 12
@export var stat_value_font_size: int = 15
@export var chip_font_size: int = 11
@export var entry_target_font_size: int = 13
@export var entry_hint_font_size: int = 12

@export_group("Contrast")
@export_range(0.6, 1.8, 0.05) var contrast_strength: float = 1.40
@export var header_subtitle_color: Color = Color(0.95, 0.98, 1.0, 0.99)
@export var summary_subtitle_color: Color = Color(0.18, 0.22, 0.30, 0.97)
@export var card_key_color: Color = Color(0.88, 0.92, 1.0, 0.98)
@export var card_value_color: Color = Color(0.97, 0.99, 1.0, 1.0)
@export var entry_hint_color: Color = Color(0.20, 0.24, 0.32, 0.95)

var _ui_theme_tokens = UiThemeTokensScript.new()
var _active_state: Dictionary = {}

var _shell_panel: PanelContainer
var _shell_margin: MarginContainer
var _shell_vbox: VBoxContainer
var _header_panel: PanelContainer
var _header_margin: MarginContainer
var _header_vbox: VBoxContainer
var _title_row: HBoxContainer
var _header_title: Label
var _header_subtitle: Label
var _header_chip_row: HBoxContainer
var _accent_bar: ColorRect
var _body_row: HBoxContainer
var _summary_panel: PanelContainer
var _summary_margin: MarginContainer
var _summary_vbox: VBoxContainer
var _summary_title: Label
var _summary_subtitle: Label
var _summary_grid: GridContainer
var _focus_panel: PanelContainer
var _focus_margin: MarginContainer
var _focus_vbox: VBoxContainer
var _focus_title: Label
var _focus_subtitle: Label
var _focus_rows: GridContainer
var _entry_panel: PanelContainer
var _entry_margin: MarginContainer
var _entry_row: HBoxContainer
var _entry_button: Button
var _entry_meta: VBoxContainer
var _entry_target_label: Label
var _entry_hint: Label


func _ready() -> void:
	_cache_nodes()
	_validate_required_nodes()
	_apply_surface_static_styles()
	_apply_layout_tokens()
	apply_preview_state(SAMPLE_STATE)


func apply_preview_state(state: Dictionary) -> void:
	if _shell_panel == null:
		_cache_nodes()
		_validate_required_nodes()
		_apply_surface_static_styles()
	_active_state = _merge_preview_state(state)
	_apply_layout_tokens()
	_render_state()


func _cache_nodes() -> void:
	_shell_panel = get_node_or_null("FocusShell") as PanelContainer
	_shell_margin = get_node_or_null("FocusShell/FocusMargin") as MarginContainer
	_shell_vbox = get_node_or_null("FocusShell/FocusMargin/FocusVBox") as VBoxContainer
	_header_panel = get_node_or_null("FocusShell/FocusMargin/FocusVBox/HeaderPanel") as PanelContainer
	_header_margin = get_node_or_null("FocusShell/FocusMargin/FocusVBox/HeaderPanel/HeaderMargin") as MarginContainer
	_header_vbox = get_node_or_null("FocusShell/FocusMargin/FocusVBox/HeaderPanel/HeaderMargin/HeaderVBox") as VBoxContainer
	_title_row = get_node_or_null("FocusShell/FocusMargin/FocusVBox/HeaderPanel/HeaderMargin/HeaderVBox/TitleRow") as HBoxContainer
	_header_title = get_node_or_null("FocusShell/FocusMargin/FocusVBox/HeaderPanel/HeaderMargin/HeaderVBox/TitleRow/TitleStack/HeaderTitle") as Label
	_header_subtitle = get_node_or_null("FocusShell/FocusMargin/FocusVBox/HeaderPanel/HeaderMargin/HeaderVBox/TitleRow/TitleStack/HeaderSubtitle") as Label
	_header_chip_row = get_node_or_null("FocusShell/FocusMargin/FocusVBox/HeaderPanel/HeaderMargin/HeaderVBox/TitleRow/HeaderChipRow") as HBoxContainer
	_accent_bar = get_node_or_null("FocusShell/FocusMargin/FocusVBox/HeaderPanel/HeaderMargin/HeaderVBox/AccentBar") as ColorRect
	_body_row = get_node_or_null("FocusShell/FocusMargin/FocusVBox/BodyRow") as HBoxContainer
	_summary_panel = get_node_or_null("FocusShell/FocusMargin/FocusVBox/BodyRow/SummaryPanel") as PanelContainer
	_summary_margin = get_node_or_null("FocusShell/FocusMargin/FocusVBox/BodyRow/SummaryPanel/SummaryMargin") as MarginContainer
	_summary_vbox = get_node_or_null("FocusShell/FocusMargin/FocusVBox/BodyRow/SummaryPanel/SummaryMargin/SummaryVBox") as VBoxContainer
	_summary_title = get_node_or_null("FocusShell/FocusMargin/FocusVBox/BodyRow/SummaryPanel/SummaryMargin/SummaryVBox/SummaryTitle") as Label
	_summary_subtitle = get_node_or_null("FocusShell/FocusMargin/FocusVBox/BodyRow/SummaryPanel/SummaryMargin/SummaryVBox/SummarySubtitle") as Label
	_summary_grid = get_node_or_null("FocusShell/FocusMargin/FocusVBox/BodyRow/SummaryPanel/SummaryMargin/SummaryVBox/SummaryGrid") as GridContainer
	_focus_panel = get_node_or_null("FocusShell/FocusMargin/FocusVBox/BodyRow/FocusPanel") as PanelContainer
	_focus_margin = get_node_or_null("FocusShell/FocusMargin/FocusVBox/BodyRow/FocusPanel/FocusMargin") as MarginContainer
	_focus_vbox = get_node_or_null("FocusShell/FocusMargin/FocusVBox/BodyRow/FocusPanel/FocusMargin/FocusVBox") as VBoxContainer
	_focus_title = get_node_or_null("FocusShell/FocusMargin/FocusVBox/BodyRow/FocusPanel/FocusMargin/FocusVBox/FocusTitle") as Label
	_focus_subtitle = get_node_or_null("FocusShell/FocusMargin/FocusVBox/BodyRow/FocusPanel/FocusMargin/FocusVBox/FocusSubtitle") as Label
	_focus_rows = get_node_or_null("FocusShell/FocusMargin/FocusVBox/BodyRow/FocusPanel/FocusMargin/FocusVBox/FocusRows") as GridContainer
	_entry_panel = get_node_or_null("FocusShell/FocusMargin/FocusVBox/EntryPanel") as PanelContainer
	_entry_margin = get_node_or_null("FocusShell/FocusMargin/FocusVBox/EntryPanel/EntryMargin") as MarginContainer
	_entry_row = get_node_or_null("FocusShell/FocusMargin/FocusVBox/EntryPanel/EntryMargin/EntryRow") as HBoxContainer
	_entry_button = get_node_or_null("FocusShell/FocusMargin/FocusVBox/EntryPanel/EntryMargin/EntryRow/EntryButton") as Button
	_entry_meta = get_node_or_null("FocusShell/FocusMargin/FocusVBox/EntryPanel/EntryMargin/EntryRow/EntryMeta") as VBoxContainer
	_entry_target_label = get_node_or_null("FocusShell/FocusMargin/FocusVBox/EntryPanel/EntryMargin/EntryRow/EntryMeta/EntryTarget") as Label
	_entry_hint = get_node_or_null("FocusShell/FocusMargin/FocusVBox/EntryPanel/EntryMargin/EntryRow/EntryMeta/EntryHint") as Label


func _apply_surface_static_styles() -> void:
	_apply_surface_panel_style(_shell_panel, SURFACE_SHELL_TEXTURE_PATH, 16.0, "panel", "hud_bottom_bar")
	_apply_surface_panel_style(_header_panel, SURFACE_TITLE_TEXTURE_PATH, 12.0, "panel", "hud_top_left")
	_apply_surface_panel_style(_summary_panel, SURFACE_SECTION_TEXTURE_PATH, 10.0, "panel", "hud_bottom_bar")
	_apply_surface_panel_style(_focus_panel, SURFACE_SECTION_TEXTURE_PATH, 10.0, "panel", "hud_bottom_bar")
	_apply_surface_panel_style(_entry_panel, SURFACE_CARD_TEXTURE_PATH, 10.0, "panel", "hud_bottom_bar")
	if _entry_button != null:
		_ui_theme_tokens.apply_button_style(_entry_button, "advance_tick")
		_entry_button.focus_mode = Control.FOCUS_NONE
		if not _entry_button.pressed.is_connected(_on_entry_button_pressed):
			_entry_button.pressed.connect(_on_entry_button_pressed)


func _apply_layout_tokens() -> void:
	if _shell_panel == null:
		return
	_set_margin_container(_shell_margin, shell_margin_left, shell_margin_top, shell_margin_right, shell_margin_bottom)
	_set_container_separation(_shell_vbox, shell_vbox_separation)
	_set_margin_container(_header_margin, header_margin_h, header_margin_v, header_margin_h, header_margin_v)
	_set_margin_container(_summary_margin, panel_inner_margin_h, panel_inner_margin_v, panel_inner_margin_h, panel_inner_margin_v)
	_set_margin_container(_focus_margin, panel_inner_margin_h, panel_inner_margin_v, panel_inner_margin_h, panel_inner_margin_v)
	_set_margin_container(_entry_margin, header_margin_h, entry_margin_v, header_margin_h, entry_margin_v)
	_set_container_separation(_header_vbox, 4)
	_set_container_separation(_title_row, 10)
	_set_container_separation(_body_row, body_row_separation)
	_set_container_separation(_summary_vbox, 4)
	_set_container_separation(_focus_vbox, 4)
	_set_container_separation(_entry_row, entry_row_separation)

	if _header_panel != null:
		_header_panel.custom_minimum_size = Vector2(0.0, header_min_height)
	var resolved_entry_height := _resolve_entry_panel_min_height()
	var adaptive := _resolve_adaptive_layout(resolved_entry_height)
	var resolved_body_height: float = float(adaptive.get("bodyMinHeight", body_min_height))
	var resolved_summary_height: float = float(adaptive.get("summaryMinHeight", summary_min_height))
	var resolved_focus_height: float = float(adaptive.get("focusMinHeight", focus_min_height))
	if _body_row != null:
		_body_row.custom_minimum_size = Vector2(0.0, resolved_body_height)
	if _summary_panel != null:
		_summary_panel.custom_minimum_size = Vector2(summary_min_width, resolved_summary_height)
	if _focus_panel != null:
		_focus_panel.custom_minimum_size = Vector2(focus_min_width, resolved_focus_height)
	if _entry_panel != null:
		_entry_panel.custom_minimum_size = Vector2(0.0, resolved_entry_height)
	if _entry_button != null:
		_entry_button.custom_minimum_size = Vector2(entry_button_min_width, 34.0)

	if _summary_grid != null:
		_summary_grid.columns = 1
		_summary_grid.add_theme_constant_override("h_separation", 10)
		_summary_grid.add_theme_constant_override("v_separation", summary_focus_grid_separation)
	if _focus_rows != null:
		_focus_rows.columns = 1
		_focus_rows.add_theme_constant_override("h_separation", 10)
		_focus_rows.add_theme_constant_override("v_separation", summary_focus_grid_separation)
	if _header_chip_row != null:
		_header_chip_row.add_theme_constant_override("h_separation", header_chip_separation)

	if _header_title != null:
		_header_title.add_theme_font_size_override("font_size", header_title_font_size)
	if _header_subtitle != null:
		_header_subtitle.add_theme_font_size_override("font_size", header_subtitle_font_size)
		_apply_single_line_label(_header_subtitle)
	if _summary_title != null:
		_summary_title.add_theme_font_size_override("font_size", panel_title_font_size)
	if _summary_subtitle != null:
		_summary_subtitle.add_theme_font_size_override("font_size", panel_subtitle_font_size)
		_apply_single_line_label(_summary_subtitle)
	if _focus_title != null:
		_focus_title.add_theme_font_size_override("font_size", panel_title_font_size)
	if _focus_subtitle != null:
		_focus_subtitle.add_theme_font_size_override("font_size", panel_subtitle_font_size)
		_apply_single_line_label(_focus_subtitle)
	if _entry_target_label != null:
		_entry_target_label.add_theme_font_size_override("font_size", entry_target_font_size)
	if _entry_hint != null:
		_entry_hint.add_theme_font_size_override("font_size", entry_hint_font_size)
		_apply_single_line_label(_entry_hint)


func _render_state() -> void:
	if _focus_rows == null:
		return
	var accent := _read_color(_active_state.get("accentColor", null), Color(0.96, 0.98, 1.0, 0.92))
	var focus_name := _resolve_focus_province(_active_state.get("focusProvinceName", SAMPLE_STATE.get("focusProvinceName", "")))
	var city_name := _resolve_city_name(str(_active_state.get("focusCityName", SAMPLE_STATE.get("focusCityName", ""))).strip_edges())
	var city_kind := _resolve_city_kind_label(_active_state.get("focusCityKindLabel", SAMPLE_STATE.get("focusCityKindLabel", "")), str(_active_state.get("hoverTileId", SAMPLE_STATE.get("hoverTileId", ""))).strip_edges())
	var union_name := _resolve_text_fallback(_active_state.get("focusUnionName", SAMPLE_STATE.get("focusUnionName", "")), "北线同盟")
	var focus_gate := _resolve_gate_name(str(_active_state.get("focusGateName", SAMPLE_STATE.get("focusGateName", ""))).strip_edges())
	var position_text := _resolve_text_fallback(_active_state.get("focusTilePos", SAMPLE_STATE.get("focusTilePos", "")), "X 142 / Y 087")
	var zoom := float(_active_state.get("zoom", SAMPLE_STATE.get("zoom", 0.36)))
	var hover_tile_id := str(_active_state.get("hoverTileId", SAMPLE_STATE.get("hoverTileId", "city_luoyang"))).strip_edges()
	var camera_state := _resolve_text_fallback(_active_state.get("cameraStateText", SAMPLE_STATE.get("cameraStateText", "")), "锁定州府轴")
	var durable_text := _resolve_text_fallback(_active_state.get("focusDurableText", SAMPLE_STATE.get("focusDurableText", "")), "耐久 92%")
	var yield_text := _resolve_text_fallback(_active_state.get("focusYieldText", SAMPLE_STATE.get("focusYieldText", "")), "木 8 / 铁 4 / 粮 10")
	var soldier_text := _resolve_text_fallback(_active_state.get("focusSoldierText", SAMPLE_STATE.get("focusSoldierText", "")), "驻军 14.2k")
	var pressure_text := _resolve_text_fallback(_active_state.get("focusPressureText", SAMPLE_STATE.get("focusPressureText", "")), "压强 中")
	var navigation_meta: Dictionary = _resolve_story_navigation_meta()
	var next_title := str(navigation_meta.get("title", "战区流程页")).strip_edges()

	if _header_title != null:
		_header_title.text = str(_active_state.get("headline", SAMPLE_STATE.get("headline", "州层流程页"))).strip_edges()
		_header_title.modulate = _blend_color(Color(0.98, 0.99, 1.0, 1.0), accent, 0.18)
	if _header_subtitle != null:
		_header_subtitle.text = "%s｜%s｜%s｜缩放 %.2f｜悬停 %s" % [focus_name, focus_gate, city_kind, zoom, hover_tile_id]
		_header_subtitle.modulate = _blend_color(header_subtitle_color, accent, 0.22)
	if _header_chip_row != null:
		_rebuild_chip_row(_header_chip_row, [
			"州层",
			"焦点 %s" % focus_name,
			"关口 %s" % focus_gate,
			"下一层 %s" % next_title,
		], accent)
	if _accent_bar != null:
		_accent_bar.color = accent

	_sync_summary_board(accent, focus_name, city_name, city_kind, union_name, focus_gate, position_text, camera_state, durable_text, yield_text, soldier_text)
	_rebuild_focus_cards(_focus_rows, _build_focus_cards(durable_text, yield_text, soldier_text, pressure_text, zoom, hover_tile_id), accent)
	_sync_entry_row(accent)


func _build_focus_cards(durable_text: String, yield_text: String, soldier_text: String, pressure_text: String, zoom: float, hover_tile_id: String) -> Array:
	return [
		{"title": "耐久 / 产出", "value": "%s｜%s" % [durable_text, yield_text]},
		{"title": "驻军 / 压强", "value": "%s｜%s" % [soldier_text, pressure_text]},
		{"title": "缩放 / 悬停", "value": "%.2f｜%s" % [zoom, hover_tile_id]},
	]


func _sync_entry_row(accent: Color) -> void:
	if _entry_panel == null:
		return
	var navigation_meta: Dictionary = _resolve_story_navigation_meta()
	var target_story_id := str(navigation_meta.get("targetStoryId", "")).strip_edges()
	var next_title := str(navigation_meta.get("title", "战区流程页")).strip_edges()
	var button_label := str(navigation_meta.get("buttonLabel", "进入战区流程")).strip_edges()
	var hint_text := str(navigation_meta.get("buttonHint", "从州层切到战区总览页。")).strip_edges()
	if _entry_button != null:
		_entry_button.text = button_label if button_label != "" else "进入战区流程"
		_entry_button.disabled = target_story_id == ""
		_entry_button.modulate = _lift_color(accent, 0.04)
	if _entry_target_label != null:
		_entry_target_label.text = next_title if next_title != "" else "战区流程页"
		_entry_target_label.modulate = _blend_color(Color(0.16, 0.20, 0.28, 0.98), accent, 0.20)
	if _entry_hint != null:
		_entry_hint.text = hint_text if hint_text != "" else "从州层切到战区总览页。"
		_entry_hint.modulate = _blend_color(entry_hint_color, accent, 0.30)
	_apply_layout_tokens()


func _resolve_entry_panel_min_height() -> float:
	var required_height: float = entry_min_height
	if _entry_button != null:
		required_height = max(required_height, _entry_button.get_combined_minimum_size().y + float(entry_margin_v * 2))
	var meta_height: float = 0.0
	if _entry_target_label != null:
		meta_height += _entry_target_label.get_combined_minimum_size().y
	if _entry_hint != null:
		meta_height += _entry_hint.get_combined_minimum_size().y
	if _entry_meta != null:
		meta_height += float(_entry_meta.get_theme_constant("separation"))
	if meta_height > 0.0:
		required_height = max(required_height, meta_height + float(entry_margin_v * 2))
	return ceil(required_height)


func _resolve_adaptive_layout(resolved_entry_height: float) -> Dictionary:
	var available_height: float = 0.0
	if _shell_panel != null:
		available_height = _shell_panel.size.y
	if available_height <= 0.0:
		available_height = size.y
	var resolved_body_height: float = body_min_height
	var resolved_summary_height: float = summary_min_height
	var resolved_focus_height: float = focus_min_height
	var reserved_height: float = float(shell_margin_top + shell_margin_bottom + shell_vbox_separation * 2) + header_min_height + resolved_entry_height
	if available_height > 0.0 and reserved_height + resolved_body_height > available_height:
		var compact_body: float = float(max(compact_body_min_height, available_height - reserved_height))
		resolved_body_height = clamp(compact_body, compact_body_min_height, body_min_height)
		resolved_summary_height = min(summary_min_height, max(compact_summary_min_height, resolved_body_height - 12.0))
		resolved_focus_height = min(focus_min_height, max(compact_focus_min_height, resolved_body_height - 12.0))
	return {
		"bodyMinHeight": resolved_body_height,
		"summaryMinHeight": resolved_summary_height,
		"focusMinHeight": resolved_focus_height,
	}


func _resolve_story_navigation_meta() -> Dictionary:
	var navigation_meta: Dictionary = _normalize_dictionary(_active_state.get("storyNavigation", {}))
	if not navigation_meta.is_empty():
		return navigation_meta
	return _normalize_dictionary(SAMPLE_STATE.get("storyNavigation", {}))


func _on_entry_button_pressed() -> void:
	var navigation_meta: Dictionary = _resolve_story_navigation_meta()
	var target_story_id := str(navigation_meta.get("targetStoryId", "")).strip_edges()
	if target_story_id == "":
		return
	var reason := str(navigation_meta.get("reason", "province_to_warzone")).strip_edges()
	var request_payload: Dictionary = _normalize_dictionary(navigation_meta.get("requestPayload", {}))
	var target_state_id := str(navigation_meta.get("targetStateId", "")).strip_edges()
	if target_state_id != "":
		request_payload["targetStateId"] = target_state_id
	var navigation_title := str(navigation_meta.get("title", "")).strip_edges()
	if navigation_title != "":
		request_payload["navigationTitle"] = navigation_title
	request_payload["entry"] = "province_focus_entry"
	request_payload["sourceStateId"] = str(_active_state.get("id", ""))
	emit_signal("entry_requested", target_story_id, reason, request_payload)


func _sync_summary_board(accent: Color, focus_name: String, city_name: String, city_kind: String, union_name: String, focus_gate: String, position_text: String, camera_state: String, durable_text: String, yield_text: String, soldier_text: String) -> void:
	if _summary_title != null:
		_summary_title.text = "州府 / 城池态势"
		_summary_title.modulate = _blend_color(Color(0.96, 0.98, 1.0, 1.0), accent, 0.10)
	if _summary_subtitle != null:
		_summary_subtitle.text = "%s｜%s｜%s" % [durable_text, yield_text, soldier_text]
		_summary_subtitle.modulate = _blend_color(summary_subtitle_color, accent, 0.18)
	if _summary_grid == null:
		return
	_rebuild_stat_grid(_summary_grid, [
		{"key": "州府 / 城池", "value": "%s｜%s·%s" % [focus_name, city_kind, city_name]},
		{"key": "关口 / 归属", "value": "%s｜%s" % [focus_gate, union_name]},
		{"key": "坐标 / 镜头", "value": "%s｜%s" % [position_text, camera_state]},
	], accent)


func _rebuild_stat_grid(parent: Node, items: Array, accent: Color) -> void:
	_clear_children(parent)
	var index := 0
	for item_variant in items:
		var item := _normalize_dictionary(item_variant)
		var key_text := str(item.get("key", "")).strip_edges()
		var value_text := str(item.get("value", "")).strip_edges()
		if key_text == "" or value_text == "":
			continue
		var card := _create_panel(parent, "StatCard_%d" % index, SURFACE_CARD_TEXTURE_PATH, 10.0, "panel", "hud_top_left")
		card.custom_minimum_size = Vector2(0.0, 44.0)
		card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var card_margin := _create_margin_container(card, "StatMargin", 7, 4, 7, 4)
		var card_vbox := _create_vbox(card_margin, "StatVBox", 0)
		var key_label := _create_label(card_vbox, "StatKey", key_text, stat_key_font_size)
		key_label.modulate = _blend_color(card_key_color, accent, 0.08)
		_apply_single_line_label(key_label)
		var value_label := _create_label(card_vbox, "StatValue", value_text, stat_value_font_size)
		value_label.modulate = _blend_color(card_value_color, accent, 0.06)
		value_label.autowrap_mode = TextServer.AUTOWRAP_OFF
		value_label.clip_text = true
		value_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		index += 1


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


func _resolve_focus_province(value: Variant) -> String:
	var raw := str(value).strip_edges()
	if raw.find("/") == -1:
		return _resolve_province_name(raw)
	var parts := raw.split("/")
	if parts.size() < 2:
		return _resolve_province_name(raw)
	var city_name := _resolve_city_name(parts[0].strip_edges())
	var province_name := _resolve_province_name(parts[1].strip_edges())
	return "%s·%s" % [province_name, city_name]


func _resolve_province_name(name: String) -> String:
	return str(PROVINCE_NAME_MAP.get(name.strip_edges(), name.strip_edges()))


func _resolve_city_name(name: String) -> String:
	return str(CITY_NAME_MAP.get(name.strip_edges(), name.strip_edges()))


func _resolve_gate_name(name: String) -> String:
	return str(GATE_NAME_MAP.get(name.strip_edges(), name.strip_edges()))


func _resolve_city_kind_label(raw_kind: Variant, hover_tile_id: String) -> String:
	var kind := str(raw_kind).strip_edges()
	if kind != "":
		if kind == "role":
			return "角色城"
		if kind == "sys":
			return "系统城"
		return kind
	var normalized_hover := hover_tile_id.strip_edges().to_lower()
	if normalized_hover.begins_with("sys") or normalized_hover.find("sys_") != -1:
		return "系统城"
	return "角色城"


func _resolve_text_fallback(raw_value: Variant, fallback_text: String) -> String:
	var text := str(raw_value).strip_edges()
	return text if text != "" else fallback_text


func _rebuild_focus_cards(parent: Node, rows: Array, accent: Color) -> void:
	_clear_children(parent)
	var index := 0
	for row_variant in rows:
		var item := _normalize_dictionary(row_variant)
		var key_text := str(item.get("title", "")).strip_edges()
		var value_text := str(item.get("value", "")).strip_edges()
		if key_text == "" or value_text == "":
			continue
		var card := _create_panel(parent, "FocusCard_%d" % index, SURFACE_CARD_TEXTURE_PATH, 10.0, "panel", "hud_top_left")
		card.custom_minimum_size = Vector2(0.0, 46.0)
		card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var card_margin := _create_margin_container(card, "FocusCardMargin", 7, 3, 7, 3)
		var card_row := _create_hbox(card_margin, "FocusCardRow", 7)
		var accent_strip := ColorRect.new()
		accent_strip.name = "AccentStrip"
		accent_strip.custom_minimum_size = Vector2(4.0, 0.0)
		accent_strip.color = _lift_color(accent, 0.02)
		card_row.add_child(accent_strip)
		var text_stack := _create_vbox(card_row, "FocusTextStack", 0)
		text_stack.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var key_label := _create_label(text_stack, "FocusKey", key_text, stat_key_font_size)
		key_label.modulate = _blend_color(card_key_color, accent, 0.08)
		_apply_single_line_label(key_label)
		var value_label := _create_label(text_stack, "FocusValue", value_text, stat_value_font_size)
		value_label.modulate = _blend_color(card_value_color, accent, 0.06)
		value_label.autowrap_mode = TextServer.AUTOWRAP_OFF
		value_label.clip_text = true
		value_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		index += 1


func _normalize_dictionary(raw_value: Variant) -> Dictionary:
	if raw_value is Dictionary:
		return (raw_value as Dictionary).duplicate(true)
	return {}


func _validate_required_nodes() -> void:
	if _shell_panel == null:
		push_warning("province_layer_focus_panel: missing node FocusShell")
	if _header_panel == null:
		push_warning("province_layer_focus_panel: missing node HeaderPanel")
	if _summary_panel == null:
		push_warning("province_layer_focus_panel: missing node SummaryPanel")
	if _focus_panel == null:
		push_warning("province_layer_focus_panel: missing node FocusPanel")
	if _entry_panel == null:
		push_warning("province_layer_focus_panel: missing node EntryPanel")
	if _entry_button == null:
		push_warning("province_layer_focus_panel: missing node EntryButton")


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


func _create_margin_container(parent: Node, name: String, left: int, top: int, right: int, bottom: int) -> MarginContainer:
	var margin := MarginContainer.new()
	margin.name = name
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", left)
	margin.add_theme_constant_override("margin_top", top)
	margin.add_theme_constant_override("margin_right", right)
	margin.add_theme_constant_override("margin_bottom", bottom)
	parent.add_child(margin)
	return margin


func _create_vbox(parent: Node, name: String, separation: int) -> VBoxContainer:
	var box := VBoxContainer.new()
	box.name = name
	box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	box.size_flags_vertical = Control.SIZE_EXPAND_FILL
	box.add_theme_constant_override("separation", separation)
	parent.add_child(box)
	return box


func _create_hbox(parent: Node, name: String, separation: int) -> HBoxContainer:
	var box := HBoxContainer.new()
	box.name = name
	box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	box.add_theme_constant_override("separation", separation)
	parent.add_child(box)
	return box


func _create_panel(parent: Node, name: String, texture_path: String, texture_margin: float, fallback_category: String = "", fallback_token: String = "") -> PanelContainer:
	var panel := PanelContainer.new()
	panel.name = name
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_apply_surface_panel_style(panel, texture_path, texture_margin, fallback_category, fallback_token)
	parent.add_child(panel)
	return panel


func _create_label(parent: Node, name: String, text: String, font_size: int) -> Label:
	var label := Label.new()
	label.name = name
	label.text = text
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_size_override("font_size", font_size)
	parent.add_child(label)
	return label


func _apply_single_line_label(label: Label) -> void:
	if label == null:
		return
	label.autowrap_mode = TextServer.AUTOWRAP_OFF
	label.clip_text = true
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS


func _rebuild_chip_row(parent: Node, chip_texts: Array, accent: Color) -> void:
	_clear_children(parent)
	var index := 0
	for chip_variant in chip_texts:
		var chip_text := str(chip_variant).strip_edges()
		if chip_text == "":
			continue
		var chip := _create_panel(parent, "Chip_%d" % index, SURFACE_BAND_TEXTURE_PATH, 8.0, "panel", "hud_top_left")
		chip.custom_minimum_size = Vector2(chip_min_width, 24.0)
		chip.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		var chip_margin := _create_margin_container(chip, "ChipMargin", 8, 3, 8, 3)
		var chip_label := _create_label(chip_margin, "ChipLabel", chip_text, chip_font_size)
		chip_label.autowrap_mode = TextServer.AUTOWRAP_OFF
		chip_label.clip_text = true
		chip_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		chip_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		chip_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		chip_label.modulate = _lift_color(accent, 0.05)
		index += 1


func _clear_children(parent: Node) -> void:
	for child in parent.get_children():
		child.queue_free()


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


func _apply_surface_panel_style(panel: PanelContainer, texture_path: String, texture_margin: float, fallback_category: String = "", fallback_token: String = "") -> bool:
	if panel == null:
		return false
	var stylebox := _build_surface_stylebox(texture_path, texture_margin)
	if stylebox != null:
		panel.add_theme_stylebox_override("panel", stylebox)
		return true
	if fallback_category != "" and fallback_token != "":
		var fallback_style := _ui_theme_tokens.resolve_stylebox(fallback_category, fallback_token)
		if fallback_style != null:
			panel.add_theme_stylebox_override("panel", fallback_style)
			return true
	return false


func _build_surface_stylebox(texture_path: String, texture_margin: float) -> StyleBoxTexture:
	var texture := _load_surface_texture(texture_path)
	if texture == null:
		return null
	var stylebox := StyleBoxTexture.new()
	stylebox.texture = texture
	stylebox.texture_margin_left = texture_margin
	stylebox.texture_margin_top = texture_margin
	stylebox.texture_margin_right = texture_margin
	stylebox.texture_margin_bottom = texture_margin
	return stylebox


func _load_surface_texture(texture_path: String) -> Texture2D:
	var normalized_path := texture_path.strip_edges()
	if normalized_path == "":
		return null
	if not ResourceLoader.exists(normalized_path):
		return null
	var loaded_texture: Variant = load(normalized_path)
	if loaded_texture is Texture2D:
		return loaded_texture as Texture2D
	return null


func _set_margin_container(container: MarginContainer, left: int, top: int, right: int, bottom: int) -> void:
	if container == null:
		return
	container.add_theme_constant_override("margin_left", left)
	container.add_theme_constant_override("margin_top", top)
	container.add_theme_constant_override("margin_right", right)
	container.add_theme_constant_override("margin_bottom", bottom)


func _set_container_separation(container: Container, separation: int) -> void:
	if container == null:
		return
	container.add_theme_constant_override("separation", separation)


func _lift_color(base: Color, lift: float) -> Color:
	var amount: float = clamp(lift * contrast_strength, 0.0, 0.95)
	return base.lightened(amount)


func _blend_color(base: Color, accent: Color, weight: float) -> Color:
	var clamped_weight: float = clamp(weight * contrast_strength, 0.0, 1.0)
	return base.lerp(accent, clamped_weight)
