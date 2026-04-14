@tool
extends Control
class_name MapSurfaceCommandDock

signal command_navigation_requested(command_id: String, command_label: String)

const UiThemeTokensScript = preload("res://scripts/ui/ui_theme_tokens.gd")

const SURFACE_SHELL_TEXTURE_PATH := "res://assets/themes/slgclient/current/ui/bg_window_6.png"
const SURFACE_TITLE_TEXTURE_PATH := "res://assets/themes/slgclient/current/ui/tipsbiaoti.png"
const SURFACE_SECTION_TEXTURE_PATH := "res://assets/themes/slgclient/current/ui/diban_1.png"
const SURFACE_CARD_TEXTURE_PATH := "res://assets/themes/slgclient/current/ui/diban1_23.png"
const PRIMARY_COMMAND_LIMIT := 4

const SAMPLE_STATE: Dictionary = {
	"headline": "地图指挥坞",
	"subheadline": "地图常驻入口、联盟消息与战区摘要。",
	"commandItems": [
		{
			"id": "mini_map",
			"label": "小地图入口",
			"detail": "快速定位战区与当前焦点",
			"badge": "地图",
			"hot": true,
		},
		{
			"id": "union",
			"label": "联盟",
			"detail": "申请、审核、联盟态势",
			"badge": "3",
			"hot": false,
		},
		{
			"id": "favorites",
			"label": "收藏",
			"detail": "标记常用城池、坐标与路线",
			"badge": "12",
			"hot": false,
		},
		{
			"id": "chat",
			"label": "聊天",
			"detail": "同盟频道、系统消息、队伍频道",
			"badge": "新",
			"hot": false,
		},
		{
			"id": "settings",
			"label": "设置",
			"detail": "地图、镜头、提示与快捷操作",
			"badge": "局",
			"hot": false,
		},
		{
			"id": "intel",
			"label": "情报",
			"detail": "战区摘要、风险、观察点、待办",
			"badge": "HOT",
			"hot": true,
		},
	],
	"miniMap": {
		"scopeLabel": "范围: 雍州战区",
		"focusLabel": "焦点: 洛阳 / 虎牢方向",
		"zoomLabel": "缩放: 44%",
	},
	"intelSummary": [
		"前线巡逻已展开，路网保持可达。",
		"联盟有待处理申请与战报提醒。",
		"情报台正在聚合城池、资源与风险信号。",
	],
}

const COMMAND_ITEM_FALLBACKS: Dictionary = {
	"id": "command",
	"label": "未命名功能",
	"detail": "无详情",
	"badge": "",
	"hot": false,
}

var _ui_theme_tokens: UiThemeTokensScript
var _dock_panel: PanelContainer
var _dock_margin: MarginContainer
var _dock_content: VBoxContainer
var _title_label: Label
var _subtitle_label: Label
var _selected_label: Label
var _ai_entry_name_label: Label
var _ai_entry_meta_label: Label
var _ai_entry_status_label: Label
var _ai_entry_button: Button
var _mini_map_scope_label: Label
var _mini_map_focus_label: Label
var _mini_map_zoom_label: Label
var _command_grid: GridContainer
var _detail_title_label: Label
var _detail_body_label: Label
var _detail_action_button: Button
var _intel_list: VBoxContainer
var _footer_label: Label
var _command_card_lookup: Dictionary = {}
var _current_state: Dictionary = {}


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_ui_theme_tokens = UiThemeTokensScript.new()
	_build_shell()
	var viewport: Viewport = get_viewport()
	if viewport != null and not viewport.size_changed.is_connected(_update_layout):
		viewport.size_changed.connect(_update_layout)
	_update_layout()
	apply_preview_state(SAMPLE_STATE.duplicate(true))


func apply_preview_state(state: Dictionary) -> void:
	_current_state = _normalize_state(state)
	_update_layout()
	_render_header()
	_render_ai_entry()
	_render_mini_map()
	_render_command_cards()
	_render_intel_summary()
	_render_footer()


func _build_shell() -> void:
	if _dock_panel != null:
		return

	_dock_panel = PanelContainer.new()
	_dock_panel.name = "CommandDockPanel"
	_dock_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(_dock_panel)

	_dock_margin = MarginContainer.new()
	_dock_margin.name = "DockMargin"
	_dock_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_dock_margin.add_theme_constant_override("margin_left", 12)
	_dock_margin.add_theme_constant_override("margin_top", 12)
	_dock_margin.add_theme_constant_override("margin_right", 12)
	_dock_margin.add_theme_constant_override("margin_bottom", 12)
	_dock_panel.add_child(_dock_margin)

	_dock_content = VBoxContainer.new()
	_dock_content.name = "DockContent"
	_dock_content.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_dock_content.add_theme_constant_override("separation", 6)
	_dock_margin.add_child(_dock_content)

	_apply_surface_panel_style(_dock_panel, SURFACE_SHELL_TEXTURE_PATH, 16.0, "panel", "hud_top_left")

	var title_block := _create_panel_card("TitleBlock", "panel", "hud_bottom_bar")
	_apply_surface_panel_style(title_block, SURFACE_TITLE_TEXTURE_PATH, 12.0, "panel", "hud_bottom_bar")
	_dock_content.add_child(title_block)
	var title_margin := _create_margin_container(title_block, "TitleMargin", 12, 10, 12, 10)
	var title_vbox := _create_vbox(title_margin, "TitleVBox", 3)
	_title_label = _create_label(title_vbox, "Title", "地图指挥坞", 18, Color(0.96, 0.99, 1.0, 0.98))
	_subtitle_label = _create_label(title_vbox, "Subtitle", "地图常驻入口、联盟消息与战区摘要。", 11, Color(0.82, 0.89, 0.98, 0.90))
	_selected_label = _create_label(title_vbox, "Selected", "首屏保留 AI / 小地图 / 主入口", 11, Color(0.86, 0.94, 0.88, 0.92))

	var ai_entry_panel := _create_panel_card("AiEntryPanel", "panel", "hud_bottom_bar")
	_apply_surface_panel_style(ai_entry_panel, SURFACE_CARD_TEXTURE_PATH, 10.0, "panel", "hud_bottom_bar")
	_dock_content.add_child(ai_entry_panel)
	var ai_entry_margin := _create_margin_container(ai_entry_panel, "AiEntryMargin", 10, 8, 10, 8)
	var ai_entry_root := _create_hbox(ai_entry_margin, "AiEntryRoot", 8)
	var ai_badge := _create_label(ai_entry_root, "AiEntryBadge", "AI", 12, Color(0.99, 0.95, 0.86, 0.98))
	ai_badge.custom_minimum_size = Vector2(28.0, 0.0)
	var ai_text := _create_vbox(ai_entry_root, "AiEntryText", 2)
	ai_text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_ai_entry_name_label = _create_label(ai_text, "AiEntryName", "AI 玩家位", 13, Color(0.97, 0.99, 1.0, 0.98))
	_ai_entry_meta_label = _create_label(ai_text, "AiEntryMeta", "同盟 / 主城", 10, Color(0.83, 0.90, 0.97, 0.92))
	_ai_entry_status_label = _create_label(ai_text, "AiEntryStatus", "点击查看当前托管状态", 10, Color(0.86, 0.93, 0.99, 0.90))
	_ai_entry_button = _create_button(ai_entry_root, "AiEntryButton", "打开", 11, 76, "advance_tick")
	_ai_entry_button.size_flags_horizontal = Control.SIZE_SHRINK_END
	_ai_entry_button.pressed.connect(_on_command_entry_requested.bind("ai_player", "AI 玩家位"))

	var mini_map_panel := _create_panel_card("MiniMapPanel", "frame", "observability_section")
	_apply_surface_panel_style(mini_map_panel, SURFACE_SECTION_TEXTURE_PATH, 12.0, "frame", "observability_section")
	_dock_content.add_child(mini_map_panel)
	var mini_map_margin := _create_margin_container(mini_map_panel, "MiniMapMargin", 10, 10, 10, 10)
	var mini_map_root := _create_hbox(mini_map_margin, "MiniMapRoot", 10)
	var mini_map_glyph := _create_mini_map_glyph(mini_map_root)
	var mini_map_text := _create_vbox(mini_map_root, "MiniMapText", 5)
	mini_map_text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_mini_map_scope_label = _create_label(mini_map_text, "Scope", "范围: 雍州战区", 14, Color(0.95, 0.98, 1.0, 0.96))
	_mini_map_focus_label = _create_label(mini_map_text, "Focus", "焦点: 洛阳 / 虎牢方向", 13, Color(0.84, 0.91, 0.97, 0.92))
	_mini_map_zoom_label = _create_label(mini_map_text, "Zoom", "缩放: 44%", 13, Color(0.84, 0.91, 0.97, 0.92))
	var mini_map_button := _create_button(mini_map_text, "OpenMiniMapButton", "小地图", 12, 92, "refresh")
	mini_map_button.pressed.connect(_on_command_entry_requested.bind("mini_map", "小地图入口"))

	var command_panel := _create_panel_card("CommandPanel", "frame", "observability_section")
	_apply_surface_panel_style(command_panel, SURFACE_SECTION_TEXTURE_PATH, 12.0, "frame", "observability_section")
	_dock_content.add_child(command_panel)
	var command_margin := _create_margin_container(command_panel, "CommandMargin", 10, 8, 10, 8)
	var command_vbox := _create_vbox(command_margin, "CommandVBox", 6)
	var command_header := _create_hbox(command_vbox, "CommandHeader", 8)
	var command_title := _create_label(command_header, "CommandTitle", "入口轨道", 14, Color(0.97, 0.99, 1.0, 0.98))
	command_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var command_hint := _create_label(command_header, "CommandHint", "一级入口", 10, Color(0.78, 0.86, 0.95, 0.88))
	command_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	command_hint.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_command_grid = GridContainer.new()
	_command_grid.name = "CommandGrid"
	_command_grid.columns = 2
	_command_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_command_grid.add_theme_constant_override("h_separation", 6)
	_command_grid.add_theme_constant_override("v_separation", 6)
	command_vbox.add_child(_command_grid)

	var detail_panel := _create_panel_card("DetailPanel", "panel", "hud_bottom_bar")
	_apply_surface_panel_style(detail_panel, SURFACE_CARD_TEXTURE_PATH, 10.0, "panel", "hud_bottom_bar")
	command_vbox.add_child(detail_panel)
	var detail_margin := _create_margin_container(detail_panel, "DetailMargin", 10, 8, 10, 8)
	var detail_vbox := _create_vbox(detail_margin, "DetailVBox", 3)
	_detail_title_label = _create_label(detail_vbox, "DetailTitle", "当前展开", 12, Color(0.96, 0.99, 1.0, 0.98))
	_detail_body_label = _create_label(detail_vbox, "DetailBody", "选择一个入口以查看二级摘要。", 10, Color(0.82, 0.89, 0.96, 0.90))
	_detail_body_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_detail_action_button = _create_button(detail_vbox, "DetailAction", "进入", 11, 84, "advance_tick")
	_detail_action_button.pressed.connect(_on_detail_action_pressed)

	_intel_list = VBoxContainer.new()
	_footer_label = _create_label(_dock_content, "Footer", "首屏保留 AI / 小地图 / 一级入口。", 11, Color(0.80, 0.87, 0.95, 0.82))

	_apply_theme_styles()


func _update_layout() -> void:
	if _dock_panel == null:
		return
	var viewport: Viewport = get_viewport()
	if viewport == null:
		return
	var size: Vector2 = viewport.get_visible_rect().size
	var target_width: float = 292.0
	if size.x < 1500.0:
		target_width = max(250.0, floor(size.x * 0.20))
	target_width = clamp(target_width, 250.0, max(250.0, size.x - 32.0))
	var target_height: float = max(420.0, size.y - 56.0)
	_dock_panel.offset_left = 16.0
	_dock_panel.offset_top = 16.0
	_dock_panel.offset_right = min(size.x - 16.0, _dock_panel.offset_left + target_width)
	_dock_panel.offset_bottom = min(size.y - 16.0, _dock_panel.offset_top + target_height)


func _render_header() -> void:
	if _title_label == null:
		return
	_title_label.text = str(_current_state.get("headline", SAMPLE_STATE.get("headline", "地图指挥坞")))
	_subtitle_label.text = str(_current_state.get("subheadline", SAMPLE_STATE.get("subheadline", "")))
	var command_count := _get_normalized_command_items().size()
	_selected_label.text = "当前摘要: %s | 首屏入口 %d" % [str(_current_state.get("selectedCommandLabel", "小地图入口")), min(command_count, PRIMARY_COMMAND_LIMIT)]


func _render_ai_entry() -> void:
	var ai_card: Dictionary = _current_state.get("aiPlayerCard", {}) as Dictionary
	if _ai_entry_name_label != null:
		_ai_entry_name_label.text = str(ai_card.get("playerName", "AI 玩家位"))
	if _ai_entry_meta_label != null:
		_ai_entry_meta_label.text = "同盟：%s · 主城：%s" % [
			str(ai_card.get("allianceName", "未入盟")),
			str(ai_card.get("cityName", "未定城"))
		]
	if _ai_entry_status_label != null:
		_ai_entry_status_label.text = "托管：%s · %s" % [
			str(ai_card.get("controlLabel", "AI托管")),
			str(ai_card.get("strategyLabel", "待设置"))
		]


func _render_mini_map() -> void:
	var mini_map: Dictionary = _current_state.get("miniMap", {}) as Dictionary
	if _mini_map_scope_label != null:
		_mini_map_scope_label.text = str(mini_map.get("scopeLabel", SAMPLE_STATE["miniMap"]["scopeLabel"]))
	if _mini_map_focus_label != null:
		_mini_map_focus_label.text = str(mini_map.get("focusLabel", SAMPLE_STATE["miniMap"]["focusLabel"]))
	if _mini_map_zoom_label != null:
		_mini_map_zoom_label.text = str(mini_map.get("zoomLabel", SAMPLE_STATE["miniMap"]["zoomLabel"]))


func _render_command_cards() -> void:
	_clear_children(_command_grid)
	_command_card_lookup.clear()
	var command_items := _get_command_items()
	var selected_id := _resolve_selected_command_id(command_items)
	for raw_item in command_items:
		var item: Dictionary = raw_item as Dictionary
		var item_id := str(item.get("id", "command"))
		var card := _create_command_card(item, item_id == selected_id)
		_command_grid.add_child(card)
		_command_card_lookup[item_id] = card
	_render_selected_detail(_find_command_item_by_id(command_items, selected_id))


func _render_intel_summary() -> void:
	var intel_summary: Array = _get_intel_summary()
	if _footer_label == null:
		return
	if intel_summary.is_empty():
		_footer_label.text = "首屏保留 AI / 小地图 / 一级入口。"
		return
	_footer_label.text = "战区摘要：%s" % str(intel_summary[0]).strip_edges()


func _render_footer() -> void:
	if _footer_label == null:
		return
	var selected_label := str(_current_state.get("selectedCommandLabel", "小地图")).strip_edges()
	var intel_summary := _get_intel_summary()
	var intel_line := ""
	if not intel_summary.is_empty():
		intel_line = str(intel_summary[0]).strip_edges()
	if intel_line != "":
		_footer_label.text = "当前聚焦 %s；%s" % [selected_label, intel_line]
		return
	_footer_label.text = "当前聚焦 %s；首屏保留 AI / 小地图 / 一级入口。" % selected_label


func _create_command_card(item: Dictionary, is_selected: bool) -> PanelContainer:
	var item_id := str(item.get("id", "command"))
	var item_label := str(item.get("label", "未命名功能"))
	var badge_text := str(item.get("badge", ""))
	var is_hot := bool(item.get("hot", false))

	var card := _create_panel_card("%sCard" % item_id, "panel", "hud_bottom_bar")
	_apply_surface_panel_style(card, SURFACE_CARD_TEXTURE_PATH, 10.0, "panel", "hud_bottom_bar")
	card.custom_minimum_size = Vector2(0, 42)
	var margin := _create_margin_container(card, "%sMargin" % item_id, 8, 6, 8, 6)
	var row := _create_hbox(margin, "%sRow" % item_id, 8)
	var text_col := _create_vbox(row, "%sTextCol" % item_id, 2)
	text_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var header := _create_hbox(text_col, "%sHeader" % item_id, 8)
	var title := _create_label(header, "%sTitle" % item_id, item_label, 13, Color(0.96, 0.99, 1.0, 0.98 if is_hot else 0.94))
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var badge := _create_label(header, "%sBadge" % item_id, badge_text, 10, _read_badge_color(is_hot))
	badge.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	badge.size_flags_horizontal = Control.SIZE_SHRINK_END
	var state_text := "当前展开" if is_selected else "查看摘要"
	var state_label := _create_label(text_col, "%sState" % item_id, state_text, 9, Color(0.74, 0.88, 0.97, 0.88))
	state_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	var action_button := _create_button(row, "%sButton" % item_id, "摘要" if not is_selected else "已选", 11, 72, _button_token_for_item(item))
	action_button.size_flags_horizontal = Control.SIZE_SHRINK_END
	action_button.disabled = is_selected
	action_button.pressed.connect(_on_command_pressed.bind(item_id, item_label))
	return card


func _on_command_pressed(command_id: String, command_label: String) -> void:
	_current_state["selectedCommandId"] = command_id
	_current_state["selectedCommandLabel"] = command_label
	_selected_label.text = "当前摘要: %s | 命令ID: %s" % [command_label, command_id]
	_render_header()
	_render_command_cards()
	_render_footer()


func _on_command_entry_requested(command_id: String, command_label: String) -> void:
	_on_command_pressed(command_id, command_label)
	command_navigation_requested.emit(command_id, command_label)


func _on_detail_action_pressed() -> void:
	var command_id := str(_current_state.get("selectedCommandId", "")).strip_edges()
	var command_label := str(_current_state.get("selectedCommandLabel", "")).strip_edges()
	if command_id == "":
		return
	command_navigation_requested.emit(command_id, command_label)


func _resolve_selected_command_id(items: Array) -> String:
	var requested_id := str(_current_state.get("selectedCommandId", "")).strip_edges()
	if requested_id != "":
		for raw_item in items:
			if raw_item is Dictionary and str((raw_item as Dictionary).get("id", "")).strip_edges() == requested_id:
				return requested_id
		if _has_overflow_commands() and _is_overflow_command_id(requested_id):
			return "more"
	var requested_label := str(_current_state.get("selectedCommandLabel", "")).strip_edges()
	if requested_label != "":
		for raw_item in items:
			if raw_item is Dictionary and str((raw_item as Dictionary).get("label", "")).strip_edges() == requested_label:
				return str((raw_item as Dictionary).get("id", "")).strip_edges()
		if _has_overflow_commands():
			for raw_item in _get_normalized_command_items().slice(PRIMARY_COMMAND_LIMIT, _get_normalized_command_items().size()):
				if raw_item is Dictionary and str((raw_item as Dictionary).get("label", "")).strip_edges() == requested_label:
					return "more"
	if items.is_empty():
		return ""
	var first_item: Variant = items[0]
	if first_item is Dictionary:
		return str((first_item as Dictionary).get("id", "")).strip_edges()
	return ""


func _find_command_item_by_id(items: Array, command_id: String) -> Dictionary:
	for raw_item in items:
		if raw_item is Dictionary and str((raw_item as Dictionary).get("id", "")).strip_edges() == command_id:
			return (raw_item as Dictionary).duplicate(true)
	return {}


func _render_selected_detail(item: Dictionary) -> void:
	if _detail_title_label == null or _detail_body_label == null or _detail_action_button == null:
		return
	if item.is_empty():
		_detail_title_label.text = "当前展开"
		_detail_body_label.text = "选择一个入口以查看二级摘要。"
		_detail_action_button.text = "未选择"
		_detail_action_button.disabled = true
		return
	var item_label := str(item.get("label", "未命名入口")).strip_edges()
	var detail_text := str(item.get("detail", "无详情")).strip_edges()
	var badge_text := str(item.get("badge", "")).strip_edges()
	if str(item.get("id", "")).strip_edges() == "more":
		var overflow_raw: Variant = item.get("overflowLabels", [])
		var overflow_items: Array = []
		if overflow_raw is Array:
			overflow_items = overflow_raw as Array
		var overflow_labels: Array = _normalize_string_array(overflow_items)
		_detail_title_label.text = "更多 · 次级入口"
		_detail_body_label.text = "其余入口: %s" % " / ".join(overflow_labels)
		_detail_action_button.text = "仅摘要"
		_detail_action_button.disabled = true
		return
	_detail_title_label.text = "%s · 二级摘要" % item_label
	_detail_body_label.text = detail_text if badge_text == "" else "%s | 标识 %s" % [detail_text, badge_text]
	if _is_command_actionable(str(item.get("id", "")).strip_edges()):
		_detail_action_button.text = "打开 %s" % item_label
		_detail_action_button.disabled = false
	else:
		_detail_action_button.text = "当前仅摘要"
		_detail_action_button.disabled = true


func _button_token_for_item(item: Dictionary) -> String:
	if bool(item.get("hot", false)):
		return "advance_tick"
	var item_id := str(item.get("id", ""))
	if item_id in ["settings", "intel"]:
		return "export"
	return "refresh"


func _is_command_actionable(command_id: String) -> bool:
	return command_id.strip_edges() in ["mini_map", "ai_player"]


func _read_badge_color(is_hot: bool) -> Color:
	if is_hot:
		return _ui_theme_tokens.resolve_color("icon", "ws_state_connected") if _ui_theme_tokens != null else Color(0.24, 0.75, 0.32, 1.0)
	return Color(0.92, 0.84, 0.56, 0.95)


func _create_mini_map_glyph(parent: Node) -> PanelContainer:
	var glyph := _create_panel_card("MiniMapGlyph", "frame", "observability_section")
	glyph.custom_minimum_size = Vector2(56, 56)
	var glyph_margin := _create_margin_container(glyph, "MiniMapGlyphMargin", 8, 8, 8, 8)
	var grid := GridContainer.new()
	grid.name = "MiniMapGrid"
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 3)
	grid.add_theme_constant_override("v_separation", 3)
	glyph_margin.add_child(grid)
	var palette := [
		Color(0.18, 0.22, 0.28, 1.0),
		Color(0.22, 0.34, 0.42, 1.0),
		Color(0.24, 0.58, 0.34, 1.0),
		Color(0.42, 0.30, 0.20, 1.0),
		Color(0.72, 0.42, 0.18, 1.0),
		Color(0.18, 0.44, 0.72, 1.0),
		Color(0.32, 0.48, 0.26, 1.0),
		Color(0.55, 0.55, 0.18, 1.0),
		Color(0.92, 0.74, 0.22, 1.0),
	]
	for index in range(palette.size()):
		var tile := ColorRect.new()
		tile.name = "Tile_%d" % index
		tile.custom_minimum_size = Vector2(12, 12)
		tile.color = palette[index]
		grid.add_child(tile)
	parent.add_child(glyph)
	return glyph


func _get_command_items() -> Array:
	var normalized := _get_normalized_command_items()
	if normalized.size() <= PRIMARY_COMMAND_LIMIT:
		return normalized
	var primary: Array = normalized.slice(0, PRIMARY_COMMAND_LIMIT)
	var overflow: Array = normalized.slice(PRIMARY_COMMAND_LIMIT, normalized.size())
	var overflow_labels: Array = []
	for raw_item in overflow:
		if raw_item is Dictionary:
			overflow_labels.append(str((raw_item as Dictionary).get("label", "")).strip_edges())
	primary.append({
		"id": "more",
		"label": "更多",
		"detail": "其余入口集中收纳到这里。",
		"badge": str(overflow.size()),
		"hot": false,
		"overflowLabels": overflow_labels,
	})
	return primary


func _get_normalized_command_items() -> Array:
	var raw_items: Variant = _current_state.get("commandItems", [])
	if not (raw_items is Array):
		return SAMPLE_STATE.get("commandItems", [])
	var items: Array = raw_items as Array
	if items.is_empty():
		return SAMPLE_STATE.get("commandItems", [])
	var normalized: Array = []
	for index in range(items.size()):
		var item_variant: Variant = items[index]
		if item_variant is Dictionary:
			normalized.append(_normalize_command_item(item_variant as Dictionary, index))
	return normalized if not normalized.is_empty() else SAMPLE_STATE.get("commandItems", [])


func _has_overflow_commands() -> bool:
	return _get_normalized_command_items().size() > PRIMARY_COMMAND_LIMIT


func _is_overflow_command_id(command_id: String) -> bool:
	if command_id.strip_edges() == "":
		return false
	var normalized := _get_normalized_command_items()
	for raw_item in normalized.slice(PRIMARY_COMMAND_LIMIT, normalized.size()):
		if raw_item is Dictionary and str((raw_item as Dictionary).get("id", "")).strip_edges() == command_id:
			return true
	return false


func _normalize_command_item(item: Dictionary, index: int) -> Dictionary:
	var normalized: Dictionary = COMMAND_ITEM_FALLBACKS.duplicate(true)
	for key_variant in item.keys():
		normalized[str(key_variant)] = item[key_variant]
	if str(normalized.get("id", "")).strip_edges() == "":
		normalized["id"] = "command_%d" % index
	if str(normalized.get("label", "")).strip_edges() == "":
		normalized["label"] = "未命名功能"
	if str(normalized.get("detail", "")).strip_edges() == "":
		normalized["detail"] = "无详情"
	normalized["badge"] = str(normalized.get("badge", ""))
	normalized["hot"] = bool(normalized.get("hot", false))
	return normalized


func _normalize_string_array(values: Array) -> Array:
	var normalized: Array = []
	for item in values:
		var text := str(item).strip_edges()
		if text != "":
			normalized.append(text)
	return normalized


func _get_intel_summary() -> Array:
	var raw_summary: Variant = _current_state.get("intelSummary", [])
	if not (raw_summary is Array):
		return SAMPLE_STATE.get("intelSummary", [])
	var summary: Array = raw_summary as Array
	if summary.is_empty():
		return SAMPLE_STATE.get("intelSummary", [])
	return summary


func _normalize_state(state: Dictionary) -> Dictionary:
	var normalized: Dictionary = SAMPLE_STATE.duplicate(true)
	if state == null:
		return normalized
	for key_variant in state.keys():
		var key := str(key_variant)
		var value: Variant = state[key_variant]
		if key == "miniMap" and value is Dictionary:
			var mini_map: Dictionary = normalized.get("miniMap", {}).duplicate(true)
			for mini_key_variant in (value as Dictionary).keys():
				mini_map[str(mini_key_variant)] = (value as Dictionary)[mini_key_variant]
			if str(mini_map.get("scopeLabel", "")).strip_edges() == "":
				mini_map["scopeLabel"] = SAMPLE_STATE["miniMap"]["scopeLabel"]
			if str(mini_map.get("focusLabel", "")).strip_edges() == "":
				mini_map["focusLabel"] = SAMPLE_STATE["miniMap"]["focusLabel"]
			if str(mini_map.get("zoomLabel", "")).strip_edges() == "":
				mini_map["zoomLabel"] = SAMPLE_STATE["miniMap"]["zoomLabel"]
			normalized["miniMap"] = mini_map
		elif key == "commandItems" and value is Array:
			var items: Array = []
			for index in range((value as Array).size()):
				var item_variant: Variant = (value as Array)[index]
				if item_variant is Dictionary:
					items.append(_normalize_command_item(item_variant as Dictionary, index))
			if not items.is_empty():
				normalized["commandItems"] = items
		elif key == "intelSummary" and value is Array:
			var summary: Array = []
			for raw_line_variant in value as Array:
				var raw_line := str(raw_line_variant).strip_edges()
				if raw_line != "":
					summary.append(raw_line)
			if not summary.is_empty():
				normalized["intelSummary"] = summary
		elif key == "headline" or key == "subheadline" or key == "stateId" or key == "selectedCommandLabel":
			normalized[key] = value
		else:
			normalized[key] = value
	return normalized


func _create_panel_card(name: String, category: String, token_name: String) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.name = name
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if _ui_theme_tokens != null:
		_ui_theme_tokens.apply_panel_style(panel, category, token_name)
	return panel


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
	var vbox := VBoxContainer.new()
	vbox.name = name
	vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	vbox.add_theme_constant_override("separation", separation)
	parent.add_child(vbox)
	return vbox


func _create_hbox(parent: Node, name: String, separation: int) -> HBoxContainer:
	var hbox := HBoxContainer.new()
	hbox.name = name
	hbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hbox.add_theme_constant_override("separation", separation)
	parent.add_child(hbox)
	return hbox


func _create_label(parent: Node, name: String, text: String, font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.name = name
	label.text = text
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	parent.add_child(label)
	return label


func _create_button(parent: Node, name: String, text: String, font_size: int, min_width: int, token_name: String) -> Button:
	var button := Button.new()
	button.name = name
	button.text = text
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.custom_minimum_size = Vector2(min_width, 36)
	button.add_theme_font_size_override("font_size", font_size)
	button.flat = false
	if _ui_theme_tokens != null:
		_ui_theme_tokens.apply_button_style(button, token_name)
	parent.add_child(button)
	return button


func _apply_theme_styles() -> void:
	if _ui_theme_tokens == null:
		return
	_apply_surface_panel_style(_dock_panel, SURFACE_SHELL_TEXTURE_PATH, 16.0, "panel", "hud_top_left")


func _apply_surface_panel_style(panel: PanelContainer, texture_path: String, texture_margin: float, fallback_category: String = "", fallback_token: String = "") -> bool:
	if panel == null:
		return false
	var stylebox := _build_surface_stylebox(texture_path, texture_margin)
	if stylebox != null:
		panel.add_theme_stylebox_override("panel", stylebox)
		return true
	if fallback_category != "" and fallback_token != "":
		var style := _ui_theme_tokens.resolve_stylebox(fallback_category, fallback_token)
		if style != null:
			panel.add_theme_stylebox_override("panel", style)
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


func _clear_children(parent: Node) -> void:
	for child in parent.get_children():
		child.queue_free()
