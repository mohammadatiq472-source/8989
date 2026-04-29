extends Control
class_name SlgSnapshotSectionPage

const DEFAULT_SHARED_STATE_TITLE := "共享状态"
const MOBILE_STACK_DEFAULT_BREAKPOINT := 640.0
const MOBILE_COMPACT_HEIGHT_BREAKPOINT := 620.0
const MOBILE_TOUCH_MIN_HEIGHT := 44.0
const SIDEBAR_TOGGLE_SIZE := Vector2(82, 72)

signal action_requested(action_id: String)

@onready var _root_column: VBoxContainer = $RootColumn
@onready var _subtitle_label: Label = $RootColumn/SubtitleLabel
@onready var _summary_title_label: Label = $RootColumn/SummaryTitleLabel
@onready var _summary_lines: VBoxContainer = $RootColumn/SummaryLines
@onready var _shared_state_panel: PanelContainer = $RootColumn/SharedStatePanel
@onready var _shared_state_title_label: Label = $RootColumn/SharedStatePanel/SharedStateMargin/SharedStateColumn/SharedStateTitleLabel
@onready var _shared_state_flow: HFlowContainer = $RootColumn/SharedStatePanel/SharedStateMargin/SharedStateColumn/SharedStateFlow
@onready var _body_row: HBoxContainer = $RootColumn/BodyRow
@onready var _left_panel: PanelContainer = $RootColumn/BodyRow/LeftPanel
@onready var _left_column: VBoxContainer = $RootColumn/BodyRow/LeftPanel/LeftMargin/LeftColumn
@onready var _left_title_label: Label = $RootColumn/BodyRow/LeftPanel/LeftMargin/LeftColumn/LeftTitleLabel
@onready var _left_card_grid: GridContainer = $RootColumn/BodyRow/LeftPanel/LeftMargin/LeftColumn/LeftCardGrid
@onready var _right_panel: PanelContainer = $RootColumn/BodyRow/RightPanel
@onready var _right_title_label: Label = $RootColumn/BodyRow/RightPanel/RightMargin/RightColumn/RightTitleLabel
@onready var _content_blocks: VBoxContainer = $RootColumn/BodyRow/RightPanel/RightMargin/RightColumn/ContentBlocks

var _section_payload: Dictionary = {}
var _snapshot: Dictionary = {}
var _page_id := ""
var _mobile_body_scroll: ScrollContainer = null
var _mobile_body_column: VBoxContainer = null
var _desktop_content_scroll: ScrollContainer = null
var _sidebar_list: VBoxContainer = null
var _sidebar_toggle_button: Button = null
var _sidebar_collapsed := false
var _body_stacked := false

func _ready() -> void:
	var viewport := get_viewport()
	if viewport != null:
		var resize_callback := Callable(self, "_on_viewport_size_changed")
		if not viewport.size_changed.is_connected(resize_callback):
			viewport.size_changed.connect(resize_callback)
	_refresh_view()

func set_page_payload(section_payload: Dictionary, snapshot: Dictionary = {}, page_id: String = "") -> void:
	_section_payload = section_payload.duplicate(true)
	_snapshot = snapshot.duplicate(true)
	_page_id = page_id.strip_edges()
	if _is_truthy_env("SLG_MAINLINE_VISUAL_SMOKE") and _is_truthy_env("SLG_AI_PANEL_VISUAL_SMOKE_SIDEBAR_COLLAPSED"):
		_sidebar_collapsed = true
	_refresh_view()
	call_deferred("_reset_content_scroll")

func _reset_content_scroll() -> void:
	if _desktop_content_scroll != null and is_instance_valid(_desktop_content_scroll):
		_desktop_content_scroll.scroll_horizontal = 0
		_desktop_content_scroll.scroll_vertical = 0
	if _mobile_body_scroll != null and is_instance_valid(_mobile_body_scroll):
		_mobile_body_scroll.scroll_horizontal = 0
		_mobile_body_scroll.scroll_vertical = 0

func _refresh_view() -> void:
	var shared_state := _snapshot.get("shared_state", {}) as Dictionary
	var subtitle_text := str(_section_payload.get("subtitle", _snapshot.get("subtitle", ""))).strip_edges()
	var hide_summary_chrome := _should_hide_summary_chrome()
	var hide_shared_state := _should_hide_shared_state()
	var hide_left_panel := _should_hide_left_panel()
	var hide_detail_title := _should_hide_detail_title()
	_subtitle_label.text = subtitle_text
	_subtitle_label.visible = subtitle_text != "" and not hide_summary_chrome

	var summary_title := str(_section_payload.get("summary_title", "概览")).strip_edges()
	_summary_title_label.text = summary_title
	_summary_title_label.visible = summary_title != "" and not hide_summary_chrome

	_left_title_label.text = str(_section_payload.get("list_title", "列表"))
	_right_title_label.text = str(_section_payload.get("detail_title", "详情"))
	_right_title_label.visible = _right_title_label.text.strip_edges() != "" and not hide_detail_title
	_refresh_responsive_layout()
	var compact_mobile_stack := _is_compact_mobile_stack()
	var compact_short_viewport := compact_mobile_stack or _should_use_short_viewport_compact()
	if compact_short_viewport:
		_root_column.add_theme_constant_override("separation", 8)
	_subtitle_label.visible = subtitle_text != "" and not compact_short_viewport and not hide_summary_chrome
	_summary_title_label.visible = summary_title != "" and not compact_short_viewport and not hide_summary_chrome

	var summary_lines := _coerce_string_array(_section_payload.get("summary_lines", []))
	if compact_short_viewport or hide_summary_chrome:
		summary_lines = []
	_rebuild_text_lines(_summary_lines, summary_lines, 16 if _is_player_reading_mode() else 13)
	_summary_lines.visible = not compact_short_viewport and not hide_summary_chrome and _summary_lines.get_child_count() > 0
	_rebuild_shared_state_flow([] if hide_shared_state else _section_payload.get("shared_state_fields", []))
	_rebuild_sidebar_items(_resolve_sidebar_items())
	_refresh_sidebar_toggle_state()
	_rebuild_explicit_item_cards([] if hide_left_panel else _section_payload.get("item_cards", []), shared_state)
	_rebuild_content_blocks(_content_blocks, _section_payload.get("content_blocks", []), shared_state)

	_shared_state_title_label.text = str(_section_payload.get("shared_state_title", DEFAULT_SHARED_STATE_TITLE)).strip_edges()
	_shared_state_title_label.visible = _shared_state_title_label.text != "" and not compact_short_viewport and not hide_shared_state
	_shared_state_panel.visible = _shared_state_flow.get_child_count() > 0 and not compact_short_viewport and not hide_shared_state
	_left_card_grid.visible = _left_card_grid.get_child_count() > 0 and not hide_left_panel
	_left_panel.visible = _left_panel.visible and not hide_left_panel
	if _sidebar_toggle_button != null:
		_sidebar_toggle_button.visible = _sidebar_toggle_button.visible and not hide_left_panel
	_right_title_label.visible = _right_title_label.text.strip_edges() != "" and not hide_detail_title
	_content_blocks.visible = _content_blocks.get_child_count() > 0
	_apply_page_surface_styles()

func _on_viewport_size_changed() -> void:
	_refresh_view()

func _refresh_responsive_layout() -> void:
	var should_stack := _should_stack_body()
	var compact_stack := _should_use_compact_mobile_stack_size(should_stack)
	var hide_left_panel := _should_hide_left_panel()
	_root_column.add_theme_constant_override("separation", 8 if compact_stack else 12)
	if should_stack:
		_ensure_mobile_body()
		_move_body_panels_to_mobile_column()
		_body_row.visible = false
		_mobile_body_scroll.visible = true
		_mobile_body_column.add_theme_constant_override("separation", 8 if compact_stack else 12)
		if _sidebar_toggle_button != null:
			_sidebar_toggle_button.visible = false
		_left_panel.visible = not hide_left_panel
		_left_panel.custom_minimum_size = Vector2(0, 0)
		_right_panel.custom_minimum_size = Vector2(0, 0)
		_left_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_right_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	else:
		_move_body_panels_to_desktop_row()
		_ensure_desktop_content_scroll()
		_ensure_sidebar_toggle_button()
		_body_row.visible = true
		_body_row.add_theme_constant_override("separation", 14)
		if _mobile_body_scroll != null:
			_mobile_body_scroll.visible = false
		var has_sidebar := _has_sidebar_items() and not hide_left_panel
		_sidebar_toggle_button.visible = has_sidebar
		_left_panel.visible = not hide_left_panel and not (_sidebar_collapsed and has_sidebar)
		_left_panel.custom_minimum_size = Vector2(0 if hide_left_panel else 356 if has_sidebar else 300, 0)
		_left_panel.size_flags_horizontal = Control.SIZE_FILL
		_right_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_body_stacked = should_stack
	_left_card_grid.columns = 1 if should_stack else maxi(1, int(_section_payload.get("left_card_columns", 2)))

func _is_compact_mobile_stack() -> bool:
	return _body_stacked and _should_use_compact_mobile_stack_size(true)

func _should_use_short_viewport_compact() -> bool:
	var enabled := bool(_section_payload.get("short_viewport_compact", _snapshot.get("short_viewport_compact", false)))
	if not enabled:
		return false
	var viewport_height := get_viewport_rect().size.y
	if viewport_height <= 0.0:
		return false
	var compact_breakpoint := float(_section_payload.get("short_viewport_compact_height", _snapshot.get("short_viewport_compact_height", 760.0)))
	return viewport_height <= compact_breakpoint

func _should_use_compact_mobile_stack_size(should_stack: bool) -> bool:
	if not should_stack:
		return false
	var viewport_size := get_viewport_rect().size
	if viewport_size.y <= 0.0:
		return false
	var compact_breakpoint := float(_section_payload.get("mobile_compact_height_breakpoint", MOBILE_COMPACT_HEIGHT_BREAKPOINT))
	return viewport_size.y <= compact_breakpoint

func _should_stack_body() -> bool:
	if not bool(_section_payload.get("mobile_stack", false)):
		return false
	var viewport_width := get_viewport_rect().size.x
	if viewport_width <= 0.0:
		return false
	var stack_breakpoint := float(_section_payload.get("mobile_stack_breakpoint", MOBILE_STACK_DEFAULT_BREAKPOINT))
	return viewport_width <= stack_breakpoint

func _is_player_reading_mode() -> bool:
	return bool(_section_payload.get("player_reading_mode", false))

func _is_content_first_mode() -> bool:
	return bool(_section_payload.get("content_first_mode", false))

func _should_hide_summary_chrome() -> bool:
	return _is_content_first_mode() or bool(_section_payload.get("hide_summary_chrome", false))

func _should_hide_shared_state() -> bool:
	return _is_content_first_mode() or bool(_section_payload.get("hide_shared_state", false))

func _should_hide_left_panel() -> bool:
	return _is_content_first_mode() or bool(_section_payload.get("hide_left_panel", false))

func _should_hide_detail_title() -> bool:
	return _is_content_first_mode() or bool(_section_payload.get("hide_detail_title", false))

func _is_truthy_env(name: String) -> bool:
	var value := OS.get_environment(name).strip_edges().to_lower()
	return value == "1" or value == "true" or value == "yes" or value == "on"

func _resolve_sidebar_items() -> Array:
	var root_items: Variant = _snapshot.get("sidebar_items", [])
	if root_items is Array:
		return root_items as Array
	var section_items: Variant = _section_payload.get("sidebar_items", [])
	if section_items is Array:
		return section_items as Array
	return []

func _has_sidebar_items() -> bool:
	return not _resolve_sidebar_items().is_empty()

func _ensure_mobile_body() -> void:
	if _mobile_body_scroll != null and is_instance_valid(_mobile_body_scroll):
		return
	_mobile_body_scroll = ScrollContainer.new()
	_mobile_body_scroll.name = "MobileBodyScroll"
	_mobile_body_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_mobile_body_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_mobile_body_column = VBoxContainer.new()
	_mobile_body_column.name = "MobileBodyColumn"
	_mobile_body_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_mobile_body_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_mobile_body_column.add_theme_constant_override("separation", 12)
	_mobile_body_scroll.add_child(_mobile_body_column)
	var body_index := _body_row.get_index()
	_root_column.add_child(_mobile_body_scroll)
	_root_column.move_child(_mobile_body_scroll, body_index)

func _move_body_panels_to_mobile_column() -> void:
	if _mobile_body_column == null:
		return
	if _left_panel.get_parent() != _mobile_body_column:
		var left_parent := _left_panel.get_parent()
		if left_parent != null:
			left_parent.remove_child(_left_panel)
		_mobile_body_column.add_child(_left_panel)
	if _right_panel.get_parent() != _mobile_body_column:
		var right_parent := _right_panel.get_parent()
		if right_parent != null:
			right_parent.remove_child(_right_panel)
		_mobile_body_column.add_child(_right_panel)

func _move_body_panels_to_desktop_row() -> void:
	_ensure_sidebar_toggle_button()
	if _sidebar_toggle_button.get_parent() != _body_row:
		var toggle_parent := _sidebar_toggle_button.get_parent()
		if toggle_parent != null:
			toggle_parent.remove_child(_sidebar_toggle_button)
		_body_row.add_child(_sidebar_toggle_button)
	_body_row.move_child(_sidebar_toggle_button, 0)
	if _left_panel.get_parent() != _body_row:
		var left_parent := _left_panel.get_parent()
		if left_parent != null:
			left_parent.remove_child(_left_panel)
		_body_row.add_child(_left_panel)
	_body_row.move_child(_left_panel, 1)
	if _right_panel.get_parent() != _body_row:
		var right_parent := _right_panel.get_parent()
		if right_parent != null:
			right_parent.remove_child(_right_panel)
		_body_row.add_child(_right_panel)
	_body_row.move_child(_right_panel, 2)

func _ensure_sidebar_toggle_button() -> void:
	if _sidebar_toggle_button != null and is_instance_valid(_sidebar_toggle_button):
		return
	_sidebar_toggle_button = Button.new()
	_sidebar_toggle_button.name = "SidebarToggleButton"
	_sidebar_toggle_button.custom_minimum_size = SIDEBAR_TOGGLE_SIZE
	_sidebar_toggle_button.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	_sidebar_toggle_button.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	_sidebar_toggle_button.focus_mode = Control.FOCUS_NONE
	_sidebar_toggle_button.tooltip_text = "切换左侧导航"
	_sidebar_toggle_button.add_theme_font_size_override("font_size", 18)
	_sidebar_toggle_button.add_theme_stylebox_override("normal", _build_flat_panel_style(Color(0.12, 0.10, 0.07, 0.94), Color(0.78, 0.62, 0.30, 0.78), 1))
	_sidebar_toggle_button.add_theme_stylebox_override("hover", _build_flat_panel_style(Color(0.18, 0.14, 0.08, 0.96), Color(0.92, 0.72, 0.34, 0.88), 1))
	_sidebar_toggle_button.add_theme_stylebox_override("pressed", _build_flat_panel_style(Color(0.22, 0.16, 0.08, 0.98), Color(1.0, 0.78, 0.36, 1.0), 2))
	_sidebar_toggle_button.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	_sidebar_toggle_button.add_theme_color_override("font_color", Color(0.98, 0.92, 0.78, 1.0))
	_sidebar_toggle_button.add_theme_color_override("font_hover_color", Color(1.0, 0.96, 0.84, 1.0))
	_sidebar_toggle_button.pressed.connect(_on_sidebar_toggle_pressed)

func _refresh_sidebar_toggle_state() -> void:
	if _sidebar_toggle_button == null:
		return
	if _should_hide_left_panel():
		_sidebar_toggle_button.visible = false
		_left_panel.visible = false
		return
	var has_sidebar := _has_sidebar_items()
	if not has_sidebar:
		_sidebar_collapsed = false
	_sidebar_toggle_button.visible = has_sidebar and not _body_stacked
	_sidebar_toggle_button.text = "导航\n展开" if _sidebar_collapsed else "导航\n收起"
	_left_panel.visible = not (_sidebar_collapsed and has_sidebar) or _body_stacked

func _on_sidebar_toggle_pressed() -> void:
	if not _has_sidebar_items():
		return
	_sidebar_collapsed = not _sidebar_collapsed
	_refresh_responsive_layout()
	_refresh_sidebar_toggle_state()

func _ensure_sidebar_list() -> void:
	if _sidebar_list != null and is_instance_valid(_sidebar_list):
		return
	_sidebar_list = VBoxContainer.new()
	_sidebar_list.name = "SidebarList"
	_sidebar_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_sidebar_list.add_theme_constant_override("separation", 10)
	_left_column.add_child(_sidebar_list)
	_left_column.move_child(_sidebar_list, _left_title_label.get_index() + 1)

func _rebuild_sidebar_items(raw_items: Array) -> void:
	_ensure_sidebar_list()
	_clear_children(_sidebar_list)
	_sidebar_list.visible = not raw_items.is_empty()
	for item_variant in raw_items:
		if not (item_variant is Dictionary):
			continue
		var button := _build_sidebar_button(item_variant as Dictionary)
		if button != null:
			_sidebar_list.add_child(button)

func _build_flat_panel_style(bg_color: Color, border_color: Color, border_width: int = 1) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = bg_color
	style.border_color = border_color
	style.set_border_width_all(border_width)
	style.set_corner_radius_all(6)
	style.content_margin_left = 14
	style.content_margin_top = 10
	style.content_margin_right = 14
	style.content_margin_bottom = 10
	return style

func _build_surface_panel_style(bg_color: Color, border_color: Color, border_width: int, corner_radius: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = bg_color
	style.border_color = border_color
	style.set_border_width_all(border_width)
	style.set_corner_radius_all(corner_radius)
	return style

func _apply_page_surface_styles() -> void:
	if _subtitle_label != null:
		_subtitle_label.add_theme_font_size_override("font_size", 18 if _is_player_reading_mode() else 15)
		_subtitle_label.add_theme_color_override("font_color", Color(0.96, 0.94, 0.86, 0.98))
	if _summary_title_label != null:
		_summary_title_label.add_theme_font_size_override("font_size", 24 if _is_player_reading_mode() else 18)
		_summary_title_label.add_theme_color_override("font_color", Color(0.98, 0.94, 0.82, 1.0))
	if _left_title_label != null:
		_left_title_label.add_theme_font_size_override("font_size", 20 if _is_player_reading_mode() else 16)
		_left_title_label.add_theme_color_override("font_color", Color(0.82, 0.84, 0.86, 0.94))
	if _right_title_label != null:
		_right_title_label.add_theme_font_size_override("font_size", 20 if _is_player_reading_mode() else 16)
		_right_title_label.add_theme_color_override("font_color", Color(0.92, 0.88, 0.76, 0.98))
	if _left_panel != null:
		var left_style := _build_surface_panel_style(Color(0.030, 0.030, 0.036, 0.84), Color(0.34, 0.28, 0.18, 0.34), 1, 6)
		if _is_content_first_mode():
			left_style = _build_surface_panel_style(Color(0.020, 0.020, 0.024, 0.48), Color(0.34, 0.28, 0.18, 0.20), 1, 5)
		_left_panel.add_theme_stylebox_override("panel", left_style)
	if _right_panel != null:
		var right_style := _build_surface_panel_style(Color(0.030, 0.030, 0.036, 0.90), Color(0.42, 0.34, 0.22, 0.40), 1, 6)
		if _is_content_first_mode():
			right_style = _build_surface_panel_style(Color(0.010, 0.010, 0.014, 0.22), Color(0.50, 0.40, 0.24, 0.18), 1, 5)
		_right_panel.add_theme_stylebox_override("panel", right_style)
	if _shared_state_panel != null:
		_shared_state_panel.add_theme_stylebox_override(
			"panel",
			_build_surface_panel_style(Color(0.045, 0.044, 0.050, 0.88), Color(0.36, 0.30, 0.20, 0.36), 1, 6)
		)

func _build_sidebar_button_style(bg_color: Color, rail_color: Color, rail_width: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = bg_color
	style.border_color = rail_color
	style.set_border_width_all(0)
	style.border_width_left = rail_width
	style.set_corner_radius_all(6)
	style.content_margin_left = 14
	style.content_margin_top = 12
	style.content_margin_right = 12
	style.content_margin_bottom = 12
	return style

func _build_sidebar_button(item: Dictionary) -> Button:
	var item_id := str(item.get("id", "")).strip_edges()
	var action_id := str(item.get("action_id", "")).strip_edges()
	if action_id == "" and item_id != "":
		action_id = "ai_sidebar_open:%s" % item_id
	if action_id == "":
		return null
	var label := str(item.get("label", item_id)).strip_edges()
	var meta := str(item.get("meta", "")).strip_edges()
	var description := str(item.get("description", "")).strip_edges()
	var text_lines: Array[String] = []
	if label != "":
		text_lines.append(label)
	if meta != "":
		text_lines.append(meta)
	if description != "":
		text_lines.append(description)
	var is_active := item_id == _page_id
	var button := Button.new()
	button.text = "\n".join(text_lines)
	button.custom_minimum_size = Vector2(0, 104)
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.alignment = HORIZONTAL_ALIGNMENT_LEFT
	button.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	button.focus_mode = Control.FOCUS_NONE
	button.add_theme_font_size_override("font_size", 21 if is_active else 19)
	button.add_theme_color_override("font_color", Color(0.96, 0.92, 0.80, 1.0) if is_active else Color(0.86, 0.86, 0.88, 0.96))
	button.add_theme_color_override("font_hover_color", Color(0.98, 0.95, 0.84, 1.0))
	button.add_theme_stylebox_override("normal", _build_sidebar_button_style(Color(0.19, 0.15, 0.08, 0.98), Color(0.86, 0.67, 0.28, 0.96), 6) if is_active else _build_sidebar_button_style(Color(0.055, 0.055, 0.064, 0.72), Color(0.0, 0.0, 0.0, 0.0), 0))
	button.add_theme_stylebox_override("hover", _build_sidebar_button_style(Color(0.14, 0.12, 0.09, 0.96), Color(0.74, 0.58, 0.30, 0.82), 4))
	button.add_theme_stylebox_override("pressed", _build_sidebar_button_style(Color(0.21, 0.17, 0.10, 0.98), Color(0.92, 0.70, 0.30, 1.0), 5))
	button.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	button.pressed.connect(Callable(self, "_on_sidebar_button_pressed").bind(action_id))
	return button

func _on_sidebar_button_pressed(action_id: String) -> void:
	action_requested.emit(action_id)

func _ensure_desktop_content_scroll() -> void:
	if _desktop_content_scroll != null and is_instance_valid(_desktop_content_scroll):
		return
	var content_parent := _content_blocks.get_parent()
	if content_parent == null:
		return
	var content_index := _content_blocks.get_index()
	content_parent.remove_child(_content_blocks)
	_desktop_content_scroll = ScrollContainer.new()
	_desktop_content_scroll.name = "DesktopContentScroll"
	_desktop_content_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_desktop_content_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_desktop_content_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_desktop_content_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	content_parent.add_child(_desktop_content_scroll)
	content_parent.move_child(_desktop_content_scroll, content_index)
	_desktop_content_scroll.add_child(_content_blocks)
	_content_blocks.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_content_blocks.size_flags_vertical = Control.SIZE_SHRINK_BEGIN

func _rebuild_explicit_item_cards(raw_cards: Variant, shared_state: Dictionary) -> void:
	_rebuild_state_card_grid(_left_card_grid, raw_cards, shared_state)
	if _left_card_grid.get_child_count() > 0:
		return
	if _has_sidebar_items():
		return
	var empty_card := _build_state_card(
		shared_state,
		{
			"title": "当前项",
			"value": "暂无内容",
			"description": "当前切项还没有可显示条目。",
			"tone": "neutral",
		}
	)
	if empty_card != null:
		_left_card_grid.add_child(empty_card)

func _rebuild_text_lines(container: VBoxContainer, lines: Array[String], font_size: int) -> void:
	_clear_children(container)
	for line in lines:
		container.add_child(_build_text_label(line, font_size))

func _rebuild_shared_state_flow(field_specs: Variant) -> void:
	_clear_children(_shared_state_flow)
	var shared_state := _snapshot.get("shared_state", {}) as Dictionary
	if shared_state.is_empty():
		return
	if not (field_specs is Array):
		return
	for field_spec in field_specs as Array:
		var chip := _build_shared_state_chip(shared_state, field_spec)
		if chip != null:
			_shared_state_flow.add_child(chip)

func _rebuild_action_buttons(container: HFlowContainer, actions: Array) -> void:
	_clear_children(container)
	for action_variant in actions:
		if not (action_variant is Dictionary):
			continue
		var action_payload := action_variant as Dictionary
		var action_id := str(action_payload.get("id", "")).strip_edges()
		if action_id == "":
			continue
		var button := Button.new()
		button.text = str(action_payload.get("label", action_id))
		button.disabled = bool(action_payload.get("disabled", false))
		var default_height := 58.0 if _is_player_reading_mode() else MOBILE_TOUCH_MIN_HEIGHT
		var default_width := 142.0 if _is_player_reading_mode() else 0.0
		button.custom_minimum_size = Vector2(
			float(action_payload.get("min_width", default_width)),
			maxf(default_height, float(action_payload.get("min_height", default_height)))
		)
		button.focus_mode = Control.FOCUS_NONE
		button.add_theme_font_size_override("font_size", 18 if _is_player_reading_mode() else 15 if _body_stacked else 14)
		if _is_player_reading_mode():
			button.add_theme_color_override("font_color", Color(0.96, 0.93, 0.84, 1.0))
			button.add_theme_color_override("font_hover_color", Color(1.0, 0.96, 0.84, 1.0))
			button.add_theme_color_override("font_disabled_color", Color(0.52, 0.52, 0.55, 0.92))
			button.add_theme_stylebox_override("normal", _build_flat_panel_style(Color(0.20, 0.16, 0.10, 0.96), Color(0.70, 0.54, 0.28, 0.88), 1))
			button.add_theme_stylebox_override("hover", _build_flat_panel_style(Color(0.24, 0.19, 0.12, 0.98), Color(0.84, 0.66, 0.34, 0.98), 1))
			button.add_theme_stylebox_override("pressed", _build_flat_panel_style(Color(0.16, 0.13, 0.09, 0.98), Color(0.88, 0.70, 0.36, 1.0), 2))
			button.add_theme_stylebox_override("disabled", _build_flat_panel_style(Color(0.10, 0.10, 0.12, 0.72), Color(0.26, 0.26, 0.29, 0.78), 1))
			button.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
		button.pressed.connect(Callable(self, "_on_action_button_pressed").bind(action_id))
		container.add_child(button)

func _rebuild_state_card_grid(container: GridContainer, raw_cards: Variant, shared_state: Dictionary) -> void:
	_clear_children(container)
	if not (raw_cards is Array):
		return
	for card_variant in raw_cards as Array:
		var card := _build_state_card(shared_state, card_variant)
		if card != null:
			container.add_child(card)

func _rebuild_content_blocks(container: VBoxContainer, raw_blocks: Variant, shared_state: Dictionary) -> void:
	_clear_children(container)
	if not (raw_blocks is Array):
		return
	for block_variant in raw_blocks as Array:
		if not (block_variant is Dictionary):
			continue
		var block := _build_content_block(shared_state, block_variant as Dictionary)
		if block != null:
			container.add_child(block)
	if container.get_child_count() > 0:
		return
	container.add_child(
		_build_text_block_panel(
			{
				"title": "当前页",
				"lines": ["当前切项还没有可显示内容。"],
			}
		)
	)

func _build_text_label(text: String, font_size: int) -> Label:
	var label := Label.new()
	label.text = text
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_size_override("font_size", font_size)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return label

func _build_content_block(shared_state: Dictionary, block_payload: Dictionary) -> Control:
	match str(block_payload.get("kind", "text_block")).strip_edges():
		"button_row":
			return _build_button_row_block(block_payload)
		"card_grid":
			return _build_card_grid_block(shared_state, block_payload)
		"feature_card_grid":
			return _build_feature_card_grid_block(shared_state, block_payload)
		"world_affairs_scene":
			return _build_world_affairs_scene_block(block_payload)
		"timeline":
			return _build_timeline_block(block_payload)
		"territory_table":
			return _build_territory_table_block(block_payload)
		"faction_map_preview":
			return _build_faction_map_preview_block(block_payload)
		"faction_status_split":
			return _build_faction_status_split_block(block_payload)
		"task_chapter_split":
			return _build_task_chapter_split_block(block_payload)
		"task_strip_list":
			return _build_task_strip_list_block(block_payload)
		"status_hero":
			return _build_status_hero_block(block_payload)
		"chat_timeline":
			return _build_chat_timeline_block(block_payload)
		"collapsible_chat_timeline":
			return _build_collapsible_chat_timeline_block(block_payload)
		"reading_list":
			return _build_reading_list_block(block_payload)
		_:
			return _build_text_block_panel(block_payload)

func _build_text_block_panel(block_payload: Dictionary) -> Control:
	var panel := _build_block_panel(block_payload)
	var column := panel.get_child(0).get_child(0) as VBoxContainer
	for line in _coerce_string_array(block_payload.get("lines", [])):
		column.add_child(_build_text_label(line, 15 if _is_player_reading_mode() else 13))
	return panel

func _build_button_row_block(block_payload: Dictionary) -> Control:
	var panel := _build_block_panel(block_payload)
	var column := panel.get_child(0).get_child(0) as VBoxContainer
	var wrap := HFlowContainer.new()
	wrap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	wrap.add_theme_constant_override("h_separation", 8)
	wrap.add_theme_constant_override("v_separation", 8)
	column.add_child(wrap)
	_rebuild_action_buttons(wrap, block_payload.get("actions", []) as Array)
	return panel

func _build_card_grid_block(shared_state: Dictionary, block_payload: Dictionary) -> Control:
	var panel := _build_block_panel(block_payload)
	var column := panel.get_child(0).get_child(0) as VBoxContainer
	var grid := GridContainer.new()
	grid.columns = _resolve_grid_columns(block_payload)
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.add_theme_constant_override("h_separation", 12 if _is_player_reading_mode() else 8)
	grid.add_theme_constant_override("v_separation", 12 if _is_player_reading_mode() else 8)
	column.add_child(grid)
	var cards := block_payload.get("cards", []) as Array
	for card_variant in cards:
		var card := _build_state_card(shared_state, card_variant)
		if card != null:
			grid.add_child(card)
	if grid.get_child_count() > 0:
		return panel
	column.add_child(_build_text_label("当前结构块还没有卡片内容。", 14 if _is_player_reading_mode() else 12))
	return panel

func _build_feature_card_grid_block(shared_state: Dictionary, block_payload: Dictionary) -> Control:
	var panel := _build_block_panel(block_payload)
	var column := panel.get_child(0).get_child(0) as VBoxContainer
	var cards: Array = block_payload.get("cards", []) as Array
	var featured_count := clampi(int(block_payload.get("featured_count", 1)), 0, cards.size())
	var start_index := 0
	if _should_use_feature_showcase(block_payload, cards, featured_count):
		start_index = _build_feature_showcase_row(shared_state, column, cards)
	else:
		for index in range(featured_count):
			var featured_card := _build_feature_card(shared_state, cards[index], true)
			if featured_card != null:
				column.add_child(featured_card)
		start_index = featured_count
	var remaining_grid := GridContainer.new()
	remaining_grid.columns = _resolve_grid_columns(block_payload)
	remaining_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	remaining_grid.add_theme_constant_override("h_separation", 12)
	remaining_grid.add_theme_constant_override("v_separation", 12)
	column.add_child(remaining_grid)
	for index in range(start_index, cards.size()):
		var card := _build_feature_card(shared_state, cards[index], false)
		if card != null:
			remaining_grid.add_child(card)
	if start_index == 0 and remaining_grid.get_child_count() == 0:
		column.add_child(_build_text_label("当前没有活动卡。", 14))
	return panel

func _should_use_feature_showcase(block_payload: Dictionary, cards: Array, featured_count: int) -> bool:
	return str(block_payload.get("layout", "")).strip_edges() == "showcase" and featured_count == 1 and cards.size() >= 4

func _build_feature_showcase_row(shared_state: Dictionary, column: VBoxContainer, cards: Array) -> int:
	var top_row := HBoxContainer.new()
	top_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top_row.add_theme_constant_override("separation", 12)
	column.add_child(top_row)
	var wide_card := _build_feature_card(shared_state, cards[0], true)
	if wide_card != null:
		wide_card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		wide_card.size_flags_stretch_ratio = 1.98
		wide_card.custom_minimum_size = Vector2(0, 302)
		top_row.add_child(wide_card)
	var side_grid := GridContainer.new()
	side_grid.columns = 3
	side_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	side_grid.size_flags_stretch_ratio = 2.54
	side_grid.add_theme_constant_override("h_separation", 12)
	side_grid.add_theme_constant_override("v_separation", 12)
	top_row.add_child(side_grid)
	for index in range(1, 4):
		var side_card := _build_feature_card(shared_state, cards[index], false)
		if side_card != null:
			side_card.custom_minimum_size = Vector2(0, 244)
			side_grid.add_child(side_card)
	return 4

func _build_feature_card(shared_state: Dictionary, raw_card: Variant, featured: bool) -> Control:
	if not (raw_card is Dictionary):
		return null
	var card_payload := raw_card as Dictionary
	var title_text := _resolve_card_text(shared_state, card_payload, "title")
	var value_text := _resolve_card_text(shared_state, card_payload, "value")
	var meta_text := _resolve_card_text(shared_state, card_payload, "meta")
	var description_text := _resolve_card_text(shared_state, card_payload, "description")
	var reward_text := _resolve_card_text(shared_state, card_payload, "reward")
	var progress_text := _resolve_card_text(shared_state, card_payload, "progress")
	var status_text := _resolve_card_text(shared_state, card_payload, "status_label")
	var image_path := _resolve_card_text(shared_state, card_payload, "image_path")
	var cover_mode := str(card_payload.get("cover_mode", "")).strip_edges()
	if title_text == "" and value_text == "" and meta_text == "" and description_text == "":
		return null
	var is_empty := bool(card_payload.get("empty", false))
	if image_path == "" and not is_empty and cover_mode != "blank_upload_slot":
		image_path = _resolve_feature_fallback_image_path(title_text)
	if status_text == "" and is_empty:
		status_text = "未开放"
	elif status_text == "" and bool(card_payload.get("red_dot", false)):
		status_text = "可领取"
	var shell := PanelContainer.new()
	shell.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	shell.custom_minimum_size = Vector2(0, 302 if featured else 244)
	shell.add_theme_stylebox_override("panel", _build_feature_card_style(str(card_payload.get("tone", "neutral")).strip_edges(), is_empty, featured))
	var margin := MarginContainer.new()
	var card_margin := 8
	margin.add_theme_constant_override("margin_left", card_margin)
	margin.add_theme_constant_override("margin_top", card_margin)
	margin.add_theme_constant_override("margin_right", card_margin)
	margin.add_theme_constant_override("margin_bottom", card_margin)
	shell.add_child(margin)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 0)
	margin.add_child(column)
	var image_slot := _build_feature_image_slot(image_path, featured, is_empty, title_text, str(card_payload.get("tone", "neutral")).strip_edges(), cover_mode)
	if image_slot != null:
		column.add_child(image_slot)
	var caption_bar := PanelContainer.new()
	caption_bar.custom_minimum_size = Vector2(0, 24 if featured else 20)
	caption_bar.add_theme_stylebox_override("panel", _build_feature_caption_bar_style(is_empty))
	column.add_child(caption_bar)
	var caption_margin := MarginContainer.new()
	caption_margin.add_theme_constant_override("margin_left", 10)
	caption_margin.add_theme_constant_override("margin_top", 2)
	caption_margin.add_theme_constant_override("margin_right", 10)
	caption_margin.add_theme_constant_override("margin_bottom", 2)
	caption_bar.add_child(caption_margin)
	var caption_row := HBoxContainer.new()
	caption_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	caption_row.add_theme_constant_override("separation", 8)
	caption_margin.add_child(caption_row)
	var caption_label := Label.new()
	var caption_text := description_text
	if caption_text == "":
		caption_text = meta_text
	if caption_text == "":
		caption_text = value_text
	caption_label.text = caption_text
	caption_label.clip_text = true
	caption_label.add_theme_font_size_override("font_size", 12 if featured else 11)
	caption_label.add_theme_color_override("font_color", Color(0.96, 0.96, 0.96, 0.96) if not is_empty else Color(0.58, 0.58, 0.60, 0.88))
	caption_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	caption_row.add_child(caption_label)
	if status_text != "":
		caption_row.add_child(_build_feature_status_chip(status_text, str(card_payload.get("tone", "neutral")).strip_edges(), is_empty))
	if bool(card_payload.get("red_dot", false)):
		caption_row.add_child(_build_feature_red_dot())
	var title_bar := PanelContainer.new()
	title_bar.custom_minimum_size = Vector2(0, 52 if featured else 42)
	title_bar.add_theme_stylebox_override("panel", _build_feature_title_bar_style(str(card_payload.get("tone", "neutral")).strip_edges(), is_empty))
	column.add_child(title_bar)
	var title_margin := MarginContainer.new()
	title_margin.add_theme_constant_override("margin_left", 8)
	title_margin.add_theme_constant_override("margin_top", 4)
	title_margin.add_theme_constant_override("margin_right", 8)
	title_margin.add_theme_constant_override("margin_bottom", 4)
	title_bar.add_child(title_margin)
	var title_label := Label.new()
	title_label.text = title_text
	title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	title_label.add_theme_font_size_override("font_size", 22 if featured else 18)
	title_label.add_theme_color_override("font_color", Color(0.98, 0.89, 0.58, 1.0) if not is_empty else Color(0.62, 0.62, 0.64, 0.92))
	title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_label.size_flags_vertical = Control.SIZE_EXPAND_FILL
	title_margin.add_child(title_label)
	if reward_text != "" or progress_text != "":
		var footer := HBoxContainer.new()
		footer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		footer.add_theme_constant_override("separation", 10)
		column.add_child(footer)
		if reward_text != "":
			var reward_label := _build_text_label("奖励 %s" % reward_text, 12)
			reward_label.add_theme_color_override("font_color", Color(0.94, 0.76, 0.34, 0.98))
			footer.add_child(reward_label)
		if progress_text != "":
			var progress_label := _build_text_label(progress_text, 12)
			progress_label.add_theme_color_override("font_color", Color(0.64, 0.88, 0.70, 0.98))
			footer.add_child(progress_label)
	return shell

func _resolve_feature_fallback_image_path(title_text: String) -> String:
	if title_text.find("武将") >= 0:
		return "res://assets/themes/slgclient/current/world/recruit_hall_base_v1.png"
	if title_text.find("外观") >= 0:
		return "res://assets/themes/slgclient/current/world/market_base_v1.png"
	return ""

func _build_feature_status_chip(text: String, tone: String, is_empty: bool) -> Control:
	var chip := PanelContainer.new()
	chip.add_theme_stylebox_override("panel", _build_feature_status_chip_style(tone, is_empty))
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 4)
	margin.add_theme_constant_override("margin_top", 1)
	margin.add_theme_constant_override("margin_right", 4)
	margin.add_theme_constant_override("margin_bottom", 1)
	chip.add_child(margin)
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", 8)
	label.add_theme_color_override("font_color", Color(0.88, 0.82, 0.66, 0.86) if not is_empty else Color(0.52, 0.52, 0.54, 0.82))
	margin.add_child(label)
	return chip

func _build_feature_status_chip_style(tone: String, is_empty: bool) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.075, 0.058, 0.045, 0.70) if not is_empty else Color(0.045, 0.045, 0.050, 0.60)
	style.border_color = Color(_resolve_card_tone_color(tone).r, _resolve_card_tone_color(tone).g, _resolve_card_tone_color(tone).b, 0.58) if not is_empty else Color(0.24, 0.24, 0.26, 0.58)
	style.set_border_width_all(1)
	style.set_corner_radius_all(3)
	return style

func _build_feature_caption_bar_style(is_empty: bool) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.02, 0.018, 0.016, 0.36) if not is_empty else Color(0.025, 0.025, 0.028, 0.40)
	style.border_color = Color(0.88, 0.74, 0.40, 0.10) if not is_empty else Color(0.28, 0.28, 0.30, 0.22)
	style.set_border_width(SIDE_TOP, 1)
	style.set_border_width(SIDE_BOTTOM, 1)
	return style

func _build_feature_title_bar_style(tone: String, is_empty: bool) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	var tone_color := _resolve_card_tone_color(tone)
	if is_empty:
		style.bg_color = Color(0.040, 0.040, 0.045, 0.86)
		style.border_color = Color(0.24, 0.24, 0.26, 0.62)
	else:
		style.bg_color = Color(0.13 + tone_color.r * 0.05, 0.045 + tone_color.g * 0.025, 0.035 + tone_color.b * 0.02, 0.94)
		style.border_color = Color(0.86, 0.68, 0.34, 0.62)
	style.set_border_width(SIDE_TOP, 1)
	style.set_border_width(SIDE_BOTTOM, 1)
	return style

func _build_feature_red_dot() -> Control:
	var dot := PanelContainer.new()
	dot.custom_minimum_size = Vector2(6, 6)
	dot.add_theme_stylebox_override("panel", _build_feature_red_dot_style())
	return dot

func _build_feature_red_dot_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.86, 0.12, 0.10, 1.0)
	style.border_color = Color(1.0, 0.54, 0.42, 0.92)
	style.set_border_width_all(1)
	style.set_corner_radius_all(6)
	return style

func _build_feature_image_slot(image_path: String, featured: bool, is_empty: bool, title_text: String = "", tone: String = "neutral", cover_mode: String = "") -> Control:
	var height := 190 if featured else 156
	var slot := PanelContainer.new()
	slot.custom_minimum_size = Vector2(0, height)
	slot.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	slot.add_theme_stylebox_override("panel", _build_feature_image_placeholder_style(is_empty, tone))
	var canvas := Control.new()
	canvas.anchor_right = 1.0
	canvas.anchor_bottom = 1.0
	canvas.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	canvas.size_flags_vertical = Control.SIZE_EXPAND_FILL
	slot.add_child(canvas)
	var texture: Texture2D = null
	var uses_fixture_scene := image_path.find("world_event_activity_fixtures") >= 0
	var blank_upload_slot := cover_mode == "blank_upload_slot"
	if image_path != "":
		texture = _load_card_image_texture(image_path)
	var should_layer_placeholder := not blank_upload_slot and (texture == null or (not uses_fixture_scene and (title_text.find("登录") >= 0 or title_text.find("武将") >= 0 or title_text.find("外观") >= 0)))
	if should_layer_placeholder:
		_populate_feature_placeholder_art(canvas, title_text, featured, tone, is_empty)
	if texture != null:
		var image_shadow := ColorRect.new()
		image_shadow.anchor_left = 0.0
		image_shadow.anchor_right = 1.0
		image_shadow.anchor_top = 0.58
		image_shadow.anchor_bottom = 1.0
		image_shadow.color = Color(0.03, 0.03, 0.04, 0.16)
		canvas.add_child(image_shadow)
		var image := TextureRect.new()
		image.texture = texture
		image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		image.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED if uses_fixture_scene else TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		if uses_fixture_scene:
			image.position = Vector2.ZERO
			image.anchor_right = 1.0
			image.anchor_bottom = 1.0
			image.modulate = Color(1.0, 1.0, 1.0, 0.96)
		elif title_text.find("武将") >= 0:
			image.position = Vector2(136 if featured else 52, 18 if featured else 16)
			image.size = Vector2(108 if featured else 74, 82 if featured else 58)
			image.modulate = Color(0.96, 0.92, 0.84, 0.72)
		elif title_text.find("外观") >= 0:
			image.position = Vector2(138 if featured else 54, 16 if featured else 14)
			image.size = Vector2(104 if featured else 72, 78 if featured else 54)
			image.modulate = Color(0.96, 0.88, 0.78, 0.74)
		else:
			image.anchor_right = 1.0
			image.anchor_bottom = 1.0
			image.size = Vector2(0, height)
		canvas.add_child(image)
		var image_haze := ColorRect.new()
		image_haze.anchor_left = 0.0
		image_haze.anchor_right = 1.0
		image_haze.anchor_top = 0.0
		image_haze.anchor_bottom = 0.38
		image_haze.color = Color(0.62, 0.60, 0.54, 0.04)
		canvas.add_child(image_haze)
		var image_vignette := ColorRect.new()
		image_vignette.anchor_left = 0.0
		image_vignette.anchor_right = 1.0
		image_vignette.anchor_top = 0.68
		image_vignette.anchor_bottom = 1.0
		image_vignette.color = Color(0.02, 0.02, 0.03, 0.18)
		canvas.add_child(image_vignette)
	var copy_label := Label.new()
	copy_label.text = _resolve_feature_image_copy(title_text, is_empty)
	copy_label.anchor_left = 0.08
	copy_label.anchor_right = 0.92
	copy_label.anchor_top = 0.70 if featured else 0.68
	copy_label.anchor_bottom = 0.86 if featured else 0.84
	copy_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	copy_label.vertical_alignment = VERTICAL_ALIGNMENT_BOTTOM
	copy_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	copy_label.add_theme_font_size_override("font_size", 18 if featured else 14)
	copy_label.add_theme_color_override("font_color", Color(0.98, 0.98, 0.96, 0.94) if not is_empty else Color(0.58, 0.58, 0.60, 0.86))
	canvas.add_child(copy_label)
	var bottom_line := PanelContainer.new()
	bottom_line.anchor_left = 0.04
	bottom_line.anchor_right = 0.96
	bottom_line.anchor_top = 0.86
	bottom_line.anchor_bottom = 0.88
	bottom_line.custom_minimum_size = Vector2(0, 2)
	bottom_line.add_theme_stylebox_override("panel", _build_feature_cover_line_style(tone, is_empty))
	canvas.add_child(bottom_line)
	return slot

func _build_feature_card_style(tone: String, is_empty: bool, featured: bool) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	if is_empty:
		style.bg_color = Color(0.06, 0.06, 0.07, 0.54)
		style.border_color = Color(0.22, 0.22, 0.24, 0.70)
	else:
		style.bg_color = Color(0.075, 0.070, 0.065, 0.96) if featured else Color(0.068, 0.066, 0.070, 0.94)
		style.border_color = _resolve_card_tone_color(tone)
	style.set_border_width_all(1)
	style.set_corner_radius_all(5)
	return style

func _build_feature_image_placeholder_style(is_empty: bool, tone: String = "neutral") -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	var tone_color := _resolve_card_tone_color(tone)
	style.bg_color = Color(0.05, 0.05, 0.055, 0.46) if is_empty else Color(0.06 + tone_color.r * 0.08, 0.055 + tone_color.g * 0.06, 0.050 + tone_color.b * 0.05, 0.92)
	style.border_color = Color(0.24, 0.24, 0.26, 0.55) if is_empty else Color(tone_color.r, tone_color.g, tone_color.b, 0.58)
	style.set_border_width_all(1)
	style.set_corner_radius_all(4)
	return style

func _build_feature_cover_line_style(tone: String, is_empty: bool) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	var tone_color := _resolve_card_tone_color(tone)
	style.bg_color = Color(0.22, 0.22, 0.24, 0.48) if is_empty else Color(tone_color.r, tone_color.g, tone_color.b, 0.78)
	style.border_color = Color(0.0, 0.0, 0.0, 0.0)
	style.set_border_width_all(0)
	style.set_corner_radius_all(1)
	return style

func _resolve_feature_image_copy(title_text: String, is_empty: bool) -> String:
	if is_empty:
		return "待定活动"
	if title_text.find("登录") >= 0:
		return "每天登录领取丰厚奖励"
	if title_text.find("武将") >= 0:
		return "获得新武将快速传承等级"
	if title_text.find("外观") >= 0:
		return "展示皮肤、装饰与商店入口"
	return title_text

func _populate_feature_placeholder_art(canvas: Control, title_text: String, featured: bool, tone: String, is_empty: bool) -> void:
	var overlay := ColorRect.new()
	overlay.anchor_right = 1.0
	overlay.anchor_bottom = 1.0
	overlay.color = Color(0.0, 0.0, 0.0, 0.18 if not is_empty else 0.06)
	canvas.add_child(overlay)
	if is_empty:
		for y in [0.18, 0.42, 0.66]:
			var line := ColorRect.new()
			line.anchor_left = 0.08
			line.anchor_right = 0.92
			line.anchor_top = y
			line.anchor_bottom = y + 0.012
			line.color = Color(0.34, 0.34, 0.36, 0.44)
			canvas.add_child(line)
		return
	if title_text.find("登录") >= 0:
		_populate_login_reward_placeholder(canvas, featured, tone)
	elif title_text.find("武将") >= 0:
		_populate_inherit_placeholder(canvas, featured, tone)
	elif title_text.find("外观") >= 0:
		_populate_shop_placeholder(canvas, featured, tone)
	else:
		_populate_generic_feature_placeholder(canvas, featured, tone)

func _populate_login_reward_placeholder(canvas: Control, featured: bool, tone: String) -> void:
	var floor := ColorRect.new()
	floor.anchor_left = 0.0
	floor.anchor_right = 1.0
	floor.anchor_top = 0.64
	floor.anchor_bottom = 1.0
	floor.color = Color(0.14, 0.10, 0.08, 0.42)
	canvas.add_child(floor)
	var backdrop := _build_atlas_texture_rect(
		"res://assets/themes/slgclient/current/world/component_outside.png",
		Rect2(530, 1680, 290, 220),
		Vector2(150 if featured else 92, 18 if featured else 12),
		Vector2(190 if featured else 118, 138 if featured else 86),
		Color(0.96, 0.92, 0.84, 0.04)
	)
	if backdrop != null:
		canvas.add_child(backdrop)
	var beam := ColorRect.new()
	beam.position = Vector2(112 if featured else 70, 26 if featured else 22)
	beam.custom_minimum_size = Vector2(154 if featured else 92, 112 if featured else 74)
	beam.rotation_degrees = -7.0
	beam.color = Color(0.96, 0.84, 0.52, 0.06)
	canvas.add_child(beam)
	var glow := ColorRect.new()
	glow.anchor_left = 0.24
	glow.anchor_right = 0.76
	glow.anchor_top = 0.12
	glow.anchor_bottom = 0.78
	glow.color = Color(0.98, 0.88, 0.56, 0.12)
	canvas.add_child(glow)
	var room_wall := ColorRect.new()
	room_wall.anchor_left = 0.56
	room_wall.anchor_right = 0.96
	room_wall.anchor_top = 0.10
	room_wall.anchor_bottom = 0.70
	room_wall.color = Color(0.34, 0.28, 0.18, 0.16)
	canvas.add_child(room_wall)
	var rear_box := PanelContainer.new()
	rear_box.position = Vector2(236 if featured else 146, 80 if featured else 54)
	rear_box.custom_minimum_size = Vector2(118 if featured else 72, 46 if featured else 28)
	rear_box.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.30, 0.22, 0.14, 0.30), Color(0.62, 0.46, 0.24, 0.12), 1, 2))
	canvas.add_child(rear_box)
	var chest := PanelContainer.new()
	chest.position = Vector2(22, 52 if featured else 38)
	chest.custom_minimum_size = Vector2(202 if featured else 122, 94 if featured else 68)
	chest.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.34, 0.22, 0.14, 0.94), Color(0.72, 0.54, 0.30, 0.70), 1, 3))
	canvas.add_child(chest)
	var chest_shadow := ColorRect.new()
	chest_shadow.position = Vector2(34, 128 if featured else 96)
	chest_shadow.custom_minimum_size = Vector2(214 if featured else 128, 20 if featured else 14)
	chest_shadow.color = Color(0.08, 0.06, 0.05, 0.14)
	canvas.add_child(chest_shadow)
	var lid := PanelContainer.new()
	lid.position = Vector2(42, 14 if featured else 10)
	lid.custom_minimum_size = Vector2(164 if featured else 100, 60 if featured else 42)
	lid.rotation_degrees = -8.0
	lid.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.24, 0.16, 0.10, 0.96), Color(0.66, 0.48, 0.28, 0.64), 1, 3))
	canvas.add_child(lid)
	var lid_inner_glow := ColorRect.new()
	lid_inner_glow.position = Vector2(66 if featured else 40, 46 if featured else 30)
	lid_inner_glow.custom_minimum_size = Vector2(104 if featured else 64, 26 if featured else 16)
	lid_inner_glow.color = Color(1.0, 0.88, 0.56, 0.12)
	canvas.add_child(lid_inner_glow)
	for index in range(8 if featured else 5):
		var jade := ColorRect.new()
		jade.position = Vector2(52 + index * (18 if featured else 14), 70 + (index % 2) * 10)
		jade.custom_minimum_size = Vector2(20 if featured else 14, 12 if featured else 8)
		jade.rotation_degrees = -18.0 + float(index % 3) * 12.0
		jade.color = Color(0.34, 0.92, 0.58, 0.92)
		canvas.add_child(jade)
	for index in range(6 if featured else 4):
		var coin := ColorRect.new()
		coin.position = Vector2(104 + index * 16, 100 + (index % 2) * 6)
		coin.custom_minimum_size = Vector2(10, 10)
		coin.color = Color(0.92, 0.76, 0.30, 0.82)
		canvas.add_child(coin)
	for index in range(5 if featured else 3):
		var gold_bar := PanelContainer.new()
		gold_bar.position = Vector2(252 + index * (22 if featured else 14), 106 + (index % 2) * 7)
		gold_bar.custom_minimum_size = Vector2(20 if featured else 14, 8 if featured else 6)
		gold_bar.rotation_degrees = -10.0
		gold_bar.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.90, 0.70, 0.26, 0.92), Color(1.0, 0.92, 0.66, 0.30), 1, 1))
		canvas.add_child(gold_bar)
	var tray := PanelContainer.new()
	tray.position = Vector2(226 if featured else 140, 98 if featured else 72)
	tray.custom_minimum_size = Vector2(90 if featured else 54, 28 if featured else 18)
	tray.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.26, 0.18, 0.12, 0.82), Color(0.62, 0.46, 0.26, 0.32), 1, 2))
	canvas.add_child(tray)
	var floor_glow := ColorRect.new()
	floor_glow.position = Vector2(176 if featured else 112, 124 if featured else 92)
	floor_glow.custom_minimum_size = Vector2(146 if featured else 84, 24 if featured else 16)
	floor_glow.color = Color(0.94, 0.82, 0.46, 0.10)
	canvas.add_child(floor_glow)

func _populate_inherit_placeholder(canvas: Control, featured: bool, tone: String) -> void:
	var sky := ColorRect.new()
	sky.anchor_right = 1.0
	sky.custom_minimum_size = Vector2(0, 40 if featured else 32)
	sky.color = Color(0.68, 0.66, 0.58, 0.18)
	canvas.add_child(sky)
	var backdrop := _build_atlas_texture_rect(
		"res://assets/themes/slgclient/current/world/component_outside.png",
		Rect2(0, 0, 350, 270),
		Vector2(54 if featured else 18, 6 if featured else 4),
		Vector2(188 if featured else 124, 132 if featured else 90),
		Color(0.94, 0.90, 0.84, 0.08)
	)
	if backdrop != null:
		canvas.add_child(backdrop)
	var gate := PanelContainer.new()
	gate.anchor_left = 0.08
	gate.anchor_right = 0.92
	gate.anchor_top = 0.08
	gate.anchor_bottom = 0.58
	gate.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.48, 0.46, 0.42, 0.46), Color(0.80, 0.78, 0.68, 0.14), 1, 2))
	canvas.add_child(gate)
	var roof := PanelContainer.new()
	roof.position = Vector2(16 if featured else 12, 24 if featured else 18)
	roof.custom_minimum_size = Vector2(210 if featured else 120, 18 if featured else 12)
	roof.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.46, 0.42, 0.36, 0.70), Color(0.78, 0.72, 0.60, 0.18), 1, 2))
	canvas.add_child(roof)
	var wall_band := ColorRect.new()
	wall_band.anchor_left = 0.0
	wall_band.anchor_right = 1.0
	wall_band.anchor_top = 0.36
	wall_band.anchor_bottom = 0.44
	wall_band.color = Color(0.28, 0.24, 0.20, 0.36)
	gate.add_child(wall_band)
	var floor_band := ColorRect.new()
	floor_band.anchor_left = 0.0
	floor_band.anchor_right = 1.0
	floor_band.anchor_top = 0.76
	floor_band.anchor_bottom = 1.0
	floor_band.color = Color(0.22, 0.18, 0.16, 0.28)
	gate.add_child(floor_band)
	var haze := ColorRect.new()
	haze.anchor_left = 0.0
	haze.anchor_right = 1.0
	haze.anchor_top = 0.46
	haze.anchor_bottom = 0.78
	haze.color = Color(0.82, 0.82, 0.78, 0.10)
	canvas.add_child(haze)
	for payload in [
		{"pos": Vector2(34, 82), "size": Vector2(36, 62), "cloak": Color(0.76, 0.34, 0.18, 0.82)},
		{"pos": Vector2(94, 92), "size": Vector2(28, 48), "cloak": Color(0.48, 0.34, 0.22, 0.72)}
	]:
		var figure := PanelContainer.new()
		figure.position = payload["pos"]
		figure.custom_minimum_size = payload["size"]
		figure.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.14, 0.14, 0.14, 0.74), Color(0.30, 0.28, 0.24, 0.18), 1, 2))
		canvas.add_child(figure)
		var cloak := ColorRect.new()
		cloak.position = Vector2(float(payload["pos"].x) - 12.0, float(payload["pos"].y) + 4.0)
		cloak.custom_minimum_size = Vector2(16, int(payload["size"].y) - 12)
		cloak.rotation_degrees = -18.0
		cloak.color = payload["cloak"]
		canvas.add_child(cloak)
	var rear_banner := ColorRect.new()
	rear_banner.position = Vector2(22 if featured else 18, 72 if featured else 60)
	rear_banner.custom_minimum_size = Vector2(10, 56 if featured else 44)
	rear_banner.rotation_degrees = -14.0
	rear_banner.color = Color(0.72, 0.38, 0.22, 0.78)
	canvas.add_child(rear_banner)
	var rear_shadow := ColorRect.new()
	rear_shadow.position = Vector2(18 if featured else 14, 126 if featured else 96)
	rear_shadow.custom_minimum_size = Vector2(142 if featured else 84, 14 if featured else 10)
	rear_shadow.color = Color(0.08, 0.08, 0.08, 0.12)
	canvas.add_child(rear_shadow)

func _populate_shop_placeholder(canvas: Control, featured: bool, tone: String) -> void:
	var backdrop := _build_atlas_texture_rect(
		"res://assets/themes/slgclient/current/world/component_outside.png",
		Rect2(530, 1680, 290, 220),
		Vector2(102 if featured else 62, 10 if featured else 8),
		Vector2(204 if featured else 126, 142 if featured else 92),
		Color(0.96, 0.90, 0.82, 0.08)
	)
	if backdrop != null:
		canvas.add_child(backdrop)
	var window_glow := ColorRect.new()
	window_glow.position = Vector2(110 if featured else 72, 22 if featured else 14)
	window_glow.custom_minimum_size = Vector2(78 if featured else 46, 56 if featured else 36)
	window_glow.color = Color(0.94, 0.82, 0.54, 0.10)
	canvas.add_child(window_glow)
	var room := PanelContainer.new()
	room.anchor_left = 0.10
	room.anchor_right = 0.90
	room.anchor_top = 0.16
	room.anchor_bottom = 0.84
	room.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.24, 0.18, 0.14, 0.32), Color(0.62, 0.52, 0.34, 0.14), 1, 2))
	canvas.add_child(room)
	for x in [0.14, 0.42, 0.70]:
		var column := ColorRect.new()
		column.anchor_left = x
		column.anchor_right = x + 0.02
		column.anchor_top = 0.18
		column.anchor_bottom = 0.82
		column.color = Color(0.26, 0.20, 0.14, 0.28)
		room.add_child(column)
	for y in [0.30, 0.54]:
		var shelf := ColorRect.new()
		shelf.anchor_left = 0.08
		shelf.anchor_right = 0.88
		shelf.anchor_top = y
		shelf.anchor_bottom = y + 0.02
		shelf.color = Color(0.22, 0.18, 0.14, 0.22)
		room.add_child(shelf)
	var figure := PanelContainer.new()
	figure.position = Vector2(52 if featured else 36, 74 if featured else 54)
	figure.custom_minimum_size = Vector2(26, 56 if featured else 40)
	figure.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.52, 0.22, 0.18, 0.76), Color(0.72, 0.42, 0.32, 0.22), 1, 2))
	canvas.add_child(figure)
	var lamp := ColorRect.new()
	lamp.position = Vector2(86 if featured else 68, 42 if featured else 34)
	lamp.custom_minimum_size = Vector2(10, 10)
	lamp.color = Color(0.96, 0.82, 0.54, 0.62)
	canvas.add_child(lamp)
	var rear_screen := PanelContainer.new()
	rear_screen.position = Vector2(154 if featured else 90, 42 if featured else 28)
	rear_screen.custom_minimum_size = Vector2(90 if featured else 54, 86 if featured else 52)
	rear_screen.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.34, 0.24, 0.18, 0.54), Color(0.68, 0.56, 0.36, 0.18), 1, 2))
	canvas.add_child(rear_screen)

func _populate_generic_feature_placeholder(canvas: Control, featured: bool, tone: String) -> void:
	var tone_color := _resolve_card_tone_color(tone)
	for index in range(3):
		var band := ColorRect.new()
		band.anchor_left = 0.04
		band.anchor_right = 0.96
		band.anchor_top = 0.18 + float(index) * 0.18
		band.anchor_bottom = 0.28 + float(index) * 0.18
		band.color = Color(tone_color.r, tone_color.g, tone_color.b, 0.18 + float(index) * 0.05)
		canvas.add_child(band)

func _build_timeline_block(block_payload: Dictionary) -> Control:
	var panel := _build_block_panel(block_payload)
	var column := panel.get_child(0).get_child(0) as VBoxContainer
	var items: Array = block_payload.get("items", []) as Array
	var scroll := ScrollContainer.new()
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.custom_minimum_size = Vector2(0, 136)
	column.add_child(scroll)
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 6)
	scroll.add_child(row)
	for index in range(items.size()):
		var item_variant: Variant = items[index]
		if not (item_variant is Dictionary):
			continue
		var node := _build_timeline_node(item_variant as Dictionary)
		if node != null:
			row.add_child(node)
		if index < items.size() - 1:
			var connector := Label.new()
			connector.text = "━"
			connector.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
			connector.add_theme_font_size_override("font_size", 18)
			connector.add_theme_color_override("font_color", Color(0.74, 0.62, 0.32, 0.82))
			row.add_child(connector)
	if row.get_child_count() == 0:
		column.add_child(_build_text_label("当前没有天下大事节点。", 14))
	return panel

func _build_world_affairs_scene_block(block_payload: Dictionary) -> Control:
	var panel := _build_block_panel(block_payload)
	var column := panel.get_child(0).get_child(0) as VBoxContainer
	var top_row := HBoxContainer.new()
	top_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top_row.add_theme_constant_override("separation", 20)
	column.add_child(top_row)
	var stage_panel := _build_world_affairs_stage_panel(block_payload)
	stage_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stage_panel.size_flags_stretch_ratio = 1.48
	top_row.add_child(stage_panel)
	var detail_panel := _build_world_affairs_detail_panel(block_payload)
	detail_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	detail_panel.size_flags_stretch_ratio = 0.88
	top_row.add_child(detail_panel)
	column.add_child(_build_world_affairs_bottom_timeline(block_payload.get("timeline", []) as Array))
	return panel

func _build_world_affairs_stage_panel(block_payload: Dictionary) -> PanelContainer:
	var shell := PanelContainer.new()
	shell.custom_minimum_size = Vector2(0, 414)
	shell.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.042, 0.042, 0.046, 0.18), Color(0.48, 0.40, 0.24, 0.06), 1, 5))
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 18)
	margin.add_theme_constant_override("margin_top", 18)
	margin.add_theme_constant_override("margin_right", 18)
	margin.add_theme_constant_override("margin_bottom", 18)
	shell.add_child(margin)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 10)
	margin.add_child(column)
	var image_hint := _build_world_affairs_scene_art(str(block_payload.get("scene_image_path", "")).strip_edges())
	column.add_child(image_hint)
	var progress_row := HBoxContainer.new()
	progress_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	progress_row.add_theme_constant_override("separation", 14)
	column.add_child(progress_row)
	progress_row.add_child(_build_world_affairs_scene_progress("8000/8000"))
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	progress_row.add_child(spacer)
	progress_row.add_child(_build_world_affairs_scene_action_button())
	return shell

func _build_world_affairs_scene_art(image_path: String = "") -> Control:
	var art_panel := PanelContainer.new()
	art_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	art_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	art_panel.custom_minimum_size = Vector2(0, 324)
	art_panel.add_theme_stylebox_override("panel", _build_world_affairs_scene_style())
	var canvas := Control.new()
	canvas.anchor_right = 1.0
	canvas.anchor_bottom = 1.0
	canvas.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	canvas.size_flags_vertical = Control.SIZE_EXPAND_FILL
	art_panel.add_child(canvas)
	var background := ColorRect.new()
	background.anchor_right = 1.0
	background.anchor_bottom = 1.0
	background.color = Color(0.10, 0.10, 0.11, 0.96)
	canvas.add_child(background)
	if image_path != "":
		var texture := _load_card_image_texture(image_path)
		if texture != null:
			var image := TextureRect.new()
			image.texture = texture
			image.anchor_right = 1.0
			image.anchor_bottom = 1.0
			image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
			image.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
			image.modulate = Color(0.98, 0.98, 0.98, 0.96)
			canvas.add_child(image)
			var top_haze := ColorRect.new()
			top_haze.anchor_right = 1.0
			top_haze.anchor_bottom = 0.46
			top_haze.color = Color(0.78, 0.78, 0.78, 0.04)
			canvas.add_child(top_haze)
			var side_mask_left := ColorRect.new()
			side_mask_left.anchor_right = 0.20
			side_mask_left.anchor_bottom = 1.0
			side_mask_left.color = Color(0.06, 0.06, 0.07, 0.08)
			canvas.add_child(side_mask_left)
			var side_mask_right := ColorRect.new()
			side_mask_right.anchor_left = 0.82
			side_mask_right.anchor_right = 1.0
			side_mask_right.anchor_bottom = 1.0
			side_mask_right.color = Color(0.05, 0.05, 0.06, 0.06)
			canvas.add_child(side_mask_right)
			var lower_shadow := ColorRect.new()
			lower_shadow.anchor_left = 0.0
			lower_shadow.anchor_right = 1.0
			lower_shadow.anchor_top = 0.68
			lower_shadow.anchor_bottom = 1.0
			lower_shadow.color = Color(0.03, 0.03, 0.04, 0.16)
			canvas.add_child(lower_shadow)
			var lower_fog := ColorRect.new()
			lower_fog.anchor_left = 0.0
			lower_fog.anchor_right = 1.0
			lower_fog.anchor_top = 0.48
			lower_fog.anchor_bottom = 0.96
			lower_fog.color = Color(0.70, 0.70, 0.70, 0.04)
			canvas.add_child(lower_fog)
			return art_panel
	var sky_glow := ColorRect.new()
	sky_glow.position = Vector2(250, 54)
	sky_glow.custom_minimum_size = Vector2(196, 96)
	sky_glow.color = Color(0.84, 0.80, 0.72, 0.06)
	canvas.add_child(sky_glow)
	var upper_fog := ColorRect.new()
	upper_fog.position = Vector2(188, 92)
	upper_fog.custom_minimum_size = Vector2(248, 62)
	upper_fog.color = Color(0.68, 0.68, 0.68, 0.05)
	canvas.add_child(upper_fog)
	var left_smoke := ColorRect.new()
	left_smoke.position = Vector2(6, 52)
	left_smoke.custom_minimum_size = Vector2(236, 212)
	left_smoke.rotation_degrees = -4.0
	left_smoke.color = Color(0.56, 0.56, 0.56, 0.04)
	canvas.add_child(left_smoke)
	var right_smoke := ColorRect.new()
	right_smoke.position = Vector2(420, 62)
	right_smoke.custom_minimum_size = Vector2(138, 194)
	right_smoke.rotation_degrees = 3.0
	right_smoke.color = Color(0.30, 0.30, 0.30, 0.04)
	canvas.add_child(right_smoke)
	var fortress_backdrop := _build_atlas_texture_rect(
		"res://assets/themes/slgclient/current/world/component_outside.png",
		Rect2(0, 0, 360, 292),
		Vector2(168, 18),
		Vector2(398, 270),
		Color(0.92, 0.92, 0.90, 0.03)
	)
	if fortress_backdrop != null:
		canvas.add_child(fortress_backdrop)
	var wall_mass := PanelContainer.new()
	wall_mass.position = Vector2(164, 24)
	wall_mass.custom_minimum_size = Vector2(360, 188)
	wall_mass.rotation_degrees = -1.0
	wall_mass.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.24, 0.23, 0.22, 0.14), Color(0.62, 0.56, 0.46, 0.04), 1, 2))
	canvas.add_child(wall_mass)
	var wall_cap := ColorRect.new()
	wall_cap.anchor_left = 0.0
	wall_cap.anchor_right = 1.0
	wall_cap.anchor_top = 0.14
	wall_cap.anchor_bottom = 0.24
	wall_cap.color = Color(0.18, 0.18, 0.18, 0.12)
	wall_mass.add_child(wall_cap)
	for index in range(11):
		var crenel := ColorRect.new()
		crenel.position = Vector2(14 + index * 30, 18)
		crenel.custom_minimum_size = Vector2(14, 14)
		crenel.color = Color(0.16, 0.16, 0.16, 0.16)
		wall_mass.add_child(crenel)
	var wall_texture := _load_card_image_texture("res://assets/themes/slgclient/current/world/city_wall_segment_base_v1.png")
	if wall_texture != null:
		var left_wall_sprite := TextureRect.new()
		left_wall_sprite.texture = wall_texture
		left_wall_sprite.position = Vector2(92, 46)
		left_wall_sprite.size = Vector2(224, 132)
		left_wall_sprite.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		left_wall_sprite.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		left_wall_sprite.modulate = Color(0.82, 0.82, 0.80, 0.08)
		canvas.add_child(left_wall_sprite)
		var wall_sprite := TextureRect.new()
		wall_sprite.texture = wall_texture
		wall_sprite.position = Vector2(214, 18)
		wall_sprite.size = Vector2(336, 196)
		wall_sprite.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		wall_sprite.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		wall_sprite.modulate = Color(0.88, 0.86, 0.80, 0.10)
		canvas.add_child(wall_sprite)
	var gate_texture := _load_card_image_texture("res://assets/themes/slgclient/current/world/city_gate_base_v1.png")
	if gate_texture != null:
		var gate_sprite := TextureRect.new()
		gate_sprite.texture = gate_texture
		gate_sprite.position = Vector2(308, 56)
		gate_sprite.size = Vector2(162, 134)
		gate_sprite.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		gate_sprite.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		gate_sprite.modulate = Color(0.96, 0.88, 0.74, 0.06)
		canvas.add_child(gate_sprite)
	var breach := PanelContainer.new()
	breach.position = Vector2(328, 64)
	breach.custom_minimum_size = Vector2(86, 138)
	breach.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.10, 0.08, 0.07, 0.42), Color(0.74, 0.60, 0.38, 0.02), 1, 8))
	canvas.add_child(breach)
	var fire_glow := ColorRect.new()
	fire_glow.position = Vector2(324, 58)
	fire_glow.custom_minimum_size = Vector2(154, 162)
	fire_glow.color = Color(0.98, 0.82, 0.46, 0.18)
	canvas.add_child(fire_glow)
	var fire_core := ColorRect.new()
	fire_core.position = Vector2(370, 84)
	fire_core.custom_minimum_size = Vector2(64, 84)
	fire_core.color = Color(1.0, 0.86, 0.58, 0.24)
	canvas.add_child(fire_core)
	var battle_heat := ColorRect.new()
	battle_heat.position = Vector2(306, 86)
	battle_heat.custom_minimum_size = Vector2(176, 148)
	battle_heat.color = Color(0.76, 0.54, 0.18, 0.04)
	canvas.add_child(battle_heat)
	var breach_haze := ColorRect.new()
	breach_haze.position = Vector2(258, 84)
	breach_haze.custom_minimum_size = Vector2(192, 136)
	breach_haze.color = Color(0.72, 0.72, 0.70, 0.08)
	canvas.add_child(breach_haze)
	for ember_pos in [Vector2(382, 84), Vector2(396, 102), Vector2(406, 120), Vector2(420, 96)]:
		var ember := ColorRect.new()
		ember.position = ember_pos
		ember.custom_minimum_size = Vector2(4, 4)
		ember.color = Color(0.98, 0.74, 0.28, 0.76)
		canvas.add_child(ember)
	var left_soldier := PanelContainer.new()
	left_soldier.position = Vector2(96, 142)
	left_soldier.custom_minimum_size = Vector2(84, 126)
	left_soldier.rotation_degrees = -8.0
	left_soldier.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.14, 0.14, 0.14, 0.88), Color(0.26, 0.26, 0.24, 0.12), 1, 12))
	canvas.add_child(left_soldier)
	var left_head := PanelContainer.new()
	left_head.position = Vector2(118, 124)
	left_head.custom_minimum_size = Vector2(28, 28)
	left_head.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.16, 0.16, 0.16, 0.90), Color(0.28, 0.28, 0.26, 0.12), 1, 12))
	canvas.add_child(left_head)
	var left_shield := PanelContainer.new()
	left_shield.position = Vector2(84, 192)
	left_shield.custom_minimum_size = Vector2(64, 70)
	left_shield.rotation_degrees = -14.0
	left_shield.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.38, 0.30, 0.20, 0.94), Color(0.76, 0.70, 0.58, 0.26), 1, 28))
	canvas.add_child(left_shield)
	var raised_sword := ColorRect.new()
	raised_sword.position = Vector2(164, 144)
	raised_sword.custom_minimum_size = Vector2(4, 82)
	raised_sword.rotation_degrees = -36.0
	raised_sword.color = Color(0.86, 0.86, 0.84, 0.78)
	canvas.add_child(raised_sword)
	for payload in [
		{"pos": Vector2(84, 132), "size": Vector2(34, 112), "rot": -8.0, "tone": Color(0.18, 0.18, 0.18, 0.52)},
		{"pos": Vector2(136, 156), "size": Vector2(26, 86), "rot": 8.0, "tone": Color(0.14, 0.14, 0.14, 0.46)},
		{"pos": Vector2(184, 176), "size": Vector2(24, 66), "rot": -6.0, "tone": Color(0.14, 0.14, 0.14, 0.40)},
		{"pos": Vector2(236, 190), "size": Vector2(18, 48), "rot": 4.0, "tone": Color(0.14, 0.14, 0.14, 0.36)},
		{"pos": Vector2(466, 104), "size": Vector2(72, 138), "rot": -4.0, "tone": Color(0.16, 0.16, 0.16, 0.56)}
	]:
		var silhouette := PanelContainer.new()
		silhouette.position = payload["pos"]
		silhouette.custom_minimum_size = payload["size"]
		silhouette.rotation_degrees = payload["rot"]
		silhouette.add_theme_stylebox_override("panel", _build_surface_panel_style(payload["tone"], Color(0.30, 0.30, 0.28, 0.12), 1, 12))
		canvas.add_child(silhouette)
	var shield := PanelContainer.new()
	shield.position = Vector2(120, 196)
	shield.custom_minimum_size = Vector2(54, 60)
	shield.rotation_degrees = -16.0
	shield.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.28, 0.22, 0.16, 0.92), Color(0.70, 0.64, 0.54, 0.30), 1, 27))
	canvas.add_child(shield)
	for horse_payload in [
		{"pos": Vector2(254, 224), "size": Vector2(48, 18), "rider": Vector2(266, 204)},
		{"pos": Vector2(308, 228), "size": Vector2(46, 16), "rider": Vector2(318, 208)},
		{"pos": Vector2(362, 230), "size": Vector2(52, 18), "rider": Vector2(374, 208)}
	]:
		var horse := PanelContainer.new()
		horse.position = horse_payload["pos"]
		horse.custom_minimum_size = horse_payload["size"]
		horse.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.14, 0.14, 0.14, 0.76), Color(0.24, 0.24, 0.22, 0.10), 1, 9))
		canvas.add_child(horse)
		var rider := PanelContainer.new()
		rider.position = horse_payload["rider"]
		rider.custom_minimum_size = Vector2(16, 24)
		rider.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.14, 0.14, 0.14, 0.82), Color(0.24, 0.24, 0.22, 0.10), 1, 7))
		canvas.add_child(rider)
	for index in range(9):
		var pike := ColorRect.new()
		pike.position = Vector2(84 + index * 46, 124 + (index % 2) * 8)
		pike.custom_minimum_size = Vector2(2, 118)
		pike.rotation_degrees = -18.0 + float(index % 3) * 10.0
		pike.color = Color(0.18, 0.18, 0.18, 0.72)
		canvas.add_child(pike)
	for payload in [
		{"pos": Vector2(248, 130), "size": Vector2(16, 74)},
		{"pos": Vector2(338, 116), "size": Vector2(20, 96)},
		{"pos": Vector2(432, 104), "size": Vector2(18, 84)}
	]:
		var flag := ColorRect.new()
		flag.position = payload["pos"]
		flag.custom_minimum_size = payload["size"]
		flag.rotation_degrees = -10.0
		flag.color = Color(0.50, 0.10, 0.08, 0.82)
		canvas.add_child(flag)
	var charge_shadow := ColorRect.new()
	charge_shadow.position = Vector2(86, 190)
	charge_shadow.custom_minimum_size = Vector2(388, 52)
	charge_shadow.color = Color(0.16, 0.16, 0.16, 0.05)
	canvas.add_child(charge_shadow)
	var front_fog := ColorRect.new()
	front_fog.position = Vector2(128, 144)
	front_fog.custom_minimum_size = Vector2(310, 104)
	front_fog.color = Color(0.62, 0.62, 0.62, 0.06)
	canvas.add_child(front_fog)
	var ground_fog := ColorRect.new()
	ground_fog.position = Vector2(48, 216)
	ground_fog.custom_minimum_size = Vector2(486, 60)
	ground_fog.color = Color(0.60, 0.60, 0.60, 0.08)
	canvas.add_child(ground_fog)
	var mid_fog := ColorRect.new()
	mid_fog.position = Vector2(76, 120)
	mid_fog.custom_minimum_size = Vector2(368, 96)
	mid_fog.color = Color(0.54, 0.54, 0.54, 0.06)
	canvas.add_child(mid_fog)
	var side_mask_left := ColorRect.new()
	side_mask_left.position = Vector2(0, 0)
	side_mask_left.custom_minimum_size = Vector2(116, 310)
	side_mask_left.color = Color(0.14, 0.14, 0.15, 0.34)
	canvas.add_child(side_mask_left)
	var side_mask_right := ColorRect.new()
	side_mask_right.position = Vector2(452, 0)
	side_mask_right.custom_minimum_size = Vector2(132, 310)
	side_mask_right.color = Color(0.14, 0.14, 0.15, 0.30)
	canvas.add_child(side_mask_right)
	var lower_shadow := ColorRect.new()
	lower_shadow.anchor_left = 0.0
	lower_shadow.anchor_right = 1.0
	lower_shadow.anchor_top = 0.78
	lower_shadow.anchor_bottom = 1.0
	lower_shadow.color = Color(0.10, 0.10, 0.10, 0.46)
	canvas.add_child(lower_shadow)
	return art_panel

func _build_world_affairs_detail_panel(block_payload: Dictionary) -> PanelContainer:
	var shell := PanelContainer.new()
	shell.custom_minimum_size = Vector2(0, 414)
	shell.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.032, 0.032, 0.038, 0.10), Color(0.48, 0.40, 0.26, 0.06), 1, 5))
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 18)
	margin.add_theme_constant_override("margin_top", 18)
	margin.add_theme_constant_override("margin_right", 18)
	margin.add_theme_constant_override("margin_bottom", 18)
	shell.add_child(margin)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 8)
	margin.add_child(column)
	var headline := Label.new()
	headline.text = "天下"
	headline.add_theme_font_size_override("font_size", 16)
	headline.add_theme_color_override("font_color", Color(0.76, 0.76, 0.78, 0.90))
	column.add_child(headline)
	var title_row := HBoxContainer.new()
	title_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_row.add_theme_constant_override("separation", 10)
	column.add_child(title_row)
	var title := Label.new()
	title.text = "黄天当立"
	title.add_theme_font_size_override("font_size", 38)
	title.add_theme_color_override("font_color", Color(0.98, 0.88, 0.50, 1.0))
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_row.add_child(title)
	title_row.add_child(_build_world_affairs_stamp("达成", true))
	var subtitle := Label.new()
	subtitle.text = "太平道灭，黄天熄息，汉室倾颓，遗患未止"
	subtitle.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	subtitle.add_theme_font_size_override("font_size", 16)
	subtitle.add_theme_color_override("font_color", Color(0.82, 0.80, 0.74, 0.96))
	column.add_child(subtitle)
	var meta_row := HBoxContainer.new()
	meta_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	meta_row.add_theme_constant_override("separation", 10)
	column.add_child(meta_row)
	var target_label := _build_text_label("目标", 18)
	target_label.add_theme_color_override("font_color", Color(0.95, 0.93, 0.84, 0.98))
	meta_row.add_child(target_label)
	var meta_spacer := Control.new()
	meta_spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	meta_row.add_child(meta_spacer)
	var date_label := _build_text_label("2026-03-21 16:09:42达成", 14)
	date_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	date_label.add_theme_color_override("font_color", Color(0.94, 0.84, 0.56, 0.94))
	meta_row.add_child(date_label)
	var separator := ColorRect.new()
	separator.custom_minimum_size = Vector2(0, 1)
	separator.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	separator.color = Color(0.42, 0.42, 0.42, 0.46)
	column.add_child(separator)
	var target := _build_text_label("全地图8000格4级或以上土地被占领", 22)
	target.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	target.add_theme_color_override("font_color", Color(0.95, 0.95, 0.90, 0.98))
	column.add_child(target)
	var unlock_shell := HBoxContainer.new()
	unlock_shell.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	unlock_shell.add_theme_constant_override("separation", 10)
	column.add_child(unlock_shell)
	var unlock_row := HBoxContainer.new()
	unlock_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	unlock_row.add_theme_constant_override("separation", 8)
	unlock_shell.add_child(unlock_row)
	for label_text in ["玉符 100", "局势开启", "赛季预留", "经验占位"]:
		unlock_row.add_child(_build_world_affairs_unlock_tile(label_text))
	var arrow_label := Label.new()
	arrow_label.text = "›"
	arrow_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	arrow_label.add_theme_font_size_override("font_size", 48)
	arrow_label.add_theme_color_override("font_color", Color(0.92, 0.78, 0.44, 0.86))
	unlock_shell.add_child(arrow_label)
	var note := _build_text_label(str(block_payload.get("subtitle", "天下 / 局势先行，赛季后续扩展。")).strip_edges(), 14)
	note.add_theme_color_override("font_color", Color(0.66, 0.68, 0.70, 0.88))
	note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(note)
	return shell

func _build_world_affairs_unlock_tile(text: String) -> Control:
	var tile := PanelContainer.new()
	tile.custom_minimum_size = Vector2(88, 102)
	tile.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.10, 0.075, 0.060, 0.88), Color(0.68, 0.48, 0.26, 0.68), 1, 3))
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 8)
	margin.add_theme_constant_override("margin_top", 7)
	margin.add_theme_constant_override("margin_right", 8)
	margin.add_theme_constant_override("margin_bottom", 7)
	tile.add_child(margin)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 5)
	margin.add_child(column)
	var icon := PanelContainer.new()
	icon.custom_minimum_size = Vector2(0, 44)
	icon.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	icon.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.18, 0.10, 0.09, 0.84), Color(0.70, 0.46, 0.24, 0.40), 1, 2))
	column.add_child(icon)
	var icon_label := Label.new()
	icon_label.text = _resolve_world_affairs_unlock_icon(text)
	icon_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	icon_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	icon_label.add_theme_font_size_override("font_size", 20 if text.find("经验") < 0 else 18)
	icon_label.add_theme_color_override("font_color", Color(0.95, 0.84, 0.56, 0.96))
	icon.add_child(icon_label)
	var label := Label.new()
	label.text = text
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_size_override("font_size", 13)
	label.add_theme_color_override("font_color", Color(0.93, 0.84, 0.62, 0.98))
	column.add_child(label)
	return tile

func _resolve_world_affairs_unlock_icon(text: String) -> String:
	if text.find("玉符") >= 0:
		return "✓"
	if text.find("局势") >= 0:
		return "印"
	if text.find("赛季") >= 0:
		return "兵"
	if text.find("经验") >= 0:
		return "EXP"
	return "开"

func _build_world_affairs_bottom_timeline(items: Array) -> Control:
	var scroll := ScrollContainer.new()
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.custom_minimum_size = Vector2(0, 122)
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 4)
	scroll.add_child(row)
	for index in range(items.size()):
		var item_variant: Variant = items[index]
		if not (item_variant is Dictionary):
			continue
		var item_payload := item_variant as Dictionary
		var node := _build_world_affairs_milestone_node(item_payload)
		if node != null:
			row.add_child(node)
		if index < items.size() - 1:
			row.add_child(_build_world_affairs_milestone_connector())
	return scroll

func _build_world_affairs_scene_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.10, 0.095, 0.090, 0.78)
	style.border_color = Color(0.48, 0.42, 0.30, 0.22)
	style.set_border_width_all(1)
	style.set_corner_radius_all(4)
	return style

func _build_world_affairs_scene_marker(text: String) -> Control:
	var marker := PanelContainer.new()
	marker.custom_minimum_size = Vector2(72, 26)
	marker.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.18, 0.09, 0.06, 0.46), Color(0.78, 0.58, 0.30, 0.24), 1, 2))
	var label := Label.new()
	label.text = text
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 12)
	label.add_theme_color_override("font_color", Color(0.92, 0.82, 0.60, 0.72))
	marker.add_child(label)
	return marker

func _build_world_affairs_scene_progress(text: String) -> Control:
	var progress := PanelContainer.new()
	progress.custom_minimum_size = Vector2(122, 50)
	progress.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.050, 0.038, 0.030, 0.84), Color(0.86, 0.66, 0.30, 0.70), 2, 25))
	var label := Label.new()
	label.text = text
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 18)
	label.add_theme_color_override("font_color", Color(0.94, 0.92, 0.86, 0.98))
	progress.add_child(label)
	return progress

func _build_world_affairs_scene_action_button() -> Control:
	var shell := PanelContainer.new()
	shell.custom_minimum_size = Vector2(54, 54)
	shell.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.18, 0.05, 0.04, 0.88), Color(0.84, 0.58, 0.22, 0.86), 2, 28))
	var label := Label.new()
	label.text = "▶"
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 24)
	label.add_theme_color_override("font_color", Color(0.98, 0.84, 0.52, 0.98))
	shell.add_child(label)
	return shell

func _build_world_affairs_scene_band(text: String, fill: Color) -> Control:
	var band := PanelContainer.new()
	band.custom_minimum_size = Vector2(0, 26)
	band.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	band.add_theme_stylebox_override("panel", _build_surface_panel_style(fill, Color(0.82, 0.60, 0.32, 0.18), 1, 2))
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 12)
	margin.add_theme_constant_override("margin_right", 12)
	band.add_child(margin)
	var label := Label.new()
	label.text = text
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 12)
	label.add_theme_color_override("font_color", Color(0.90, 0.82, 0.66, 0.62))
	margin.add_child(label)
	return band

func _build_world_affairs_stamp(text: String, compact: bool) -> Control:
	var stamp := PanelContainer.new()
	stamp.custom_minimum_size = Vector2(38 if compact else 46, 46 if compact else 54)
	stamp.add_theme_stylebox_override("panel", _build_world_affairs_stamp_style(compact))
	var label := Label.new()
	label.text = text
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_size_override("font_size", 13 if compact else 14)
	label.add_theme_color_override("font_color", Color(1.0, 0.88, 0.62, 0.96))
	stamp.add_child(label)
	return stamp

func _build_world_affairs_stamp_style(compact: bool) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.38, 0.065, 0.045, 0.94)
	style.border_color = Color(0.86, 0.44, 0.22, 0.76)
	style.set_border_width_all(1)
	style.set_corner_radius_all(2 if compact else 3)
	return style

func _build_world_affairs_milestone_connector() -> Control:
	var label := Label.new()
	label.text = "━━━━"
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 16)
	label.add_theme_color_override("font_color", Color(0.76, 0.64, 0.34, 0.82))
	label.custom_minimum_size = Vector2(36, 76)
	return label

func _build_world_affairs_milestone_node(item_payload: Dictionary) -> Control:
	var title := str(item_payload.get("title", "")).strip_edges()
	if title == "":
		return null
	var node := VBoxContainer.new()
	node.custom_minimum_size = Vector2(86, 106)
	node.add_theme_constant_override("separation", 4)
	var stamp_text := "达成" if bool(item_payload.get("completed", false)) else str(item_payload.get("badge", "")).strip_edges()
	if stamp_text == "":
		stamp_text = "锁"
	var stamp_wrap := CenterContainer.new()
	stamp_wrap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stamp_wrap.add_child(_build_world_affairs_stamp(stamp_text, true))
	node.add_child(stamp_wrap)
	var title_label := Label.new()
	title_label.text = title
	title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title_label.clip_text = true
	title_label.add_theme_font_size_override("font_size", 13)
	title_label.add_theme_color_override("font_color", Color(0.88, 0.86, 0.82, 0.96))
	node.add_child(title_label)
	var reward := str(item_payload.get("reward", "")).strip_edges()
	var reward_label := Label.new()
	reward_label.text = reward
	reward_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	reward_label.clip_text = true
	reward_label.add_theme_font_size_override("font_size", 11)
	reward_label.add_theme_color_override("font_color", Color(0.94, 0.74, 0.34, 0.86))
	node.add_child(reward_label)
	return node

func _build_timeline_node(item_payload: Dictionary) -> Control:
	var title := str(item_payload.get("title", "")).strip_edges()
	var state := str(item_payload.get("state", "")).strip_edges()
	var reward := str(item_payload.get("reward", "")).strip_edges()
	var progress := str(item_payload.get("progress", "")).strip_edges()
	if title == "" and state == "":
		return null
	var shell := PanelContainer.new()
	shell.custom_minimum_size = Vector2(float(int(item_payload.get("min_width", 104))), float(int(item_payload.get("min_height", 116))))
	var completed := bool(item_payload.get("completed", false))
	var current := bool(item_payload.get("current", false))
	shell.add_theme_stylebox_override("panel", _build_timeline_node_style(str(item_payload.get("tone", "neutral")).strip_edges(), completed, current))
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 8)
	margin.add_theme_constant_override("margin_top", 8)
	margin.add_theme_constant_override("margin_right", 8)
	margin.add_theme_constant_override("margin_bottom", 8)
	shell.add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 5)
	margin.add_child(column)
	var badge := Label.new()
	badge.text = "达成" if completed else "进行中" if current else str(item_payload.get("badge", "未开")).strip_edges()
	badge.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	badge.add_theme_font_size_override("font_size", 12)
	badge.add_theme_color_override("font_color", Color(0.98, 0.86, 0.56, 1.0) if not current else Color(0.66, 0.88, 1.0, 1.0))
	column.add_child(badge)
	var title_label := _build_text_label(title, 13)
	title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title_label.add_theme_color_override("font_color", Color(0.90, 0.88, 0.82, 0.98))
	column.add_child(title_label)
	if state != "":
		var state_label := _build_text_label(state, 12)
		state_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		state_label.add_theme_color_override("font_color", Color(0.70, 0.72, 0.74, 0.96))
		column.add_child(state_label)
	if progress != "":
		var progress_label := _build_text_label(progress, 12)
		progress_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		progress_label.add_theme_color_override("font_color", Color(0.58, 0.86, 0.66, 0.96))
		column.add_child(progress_label)
	if reward != "":
		var reward_label := _build_text_label(reward, 12)
		reward_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		reward_label.add_theme_color_override("font_color", Color(0.94, 0.72, 0.30, 0.98))
		column.add_child(reward_label)
	return shell

func _build_timeline_node_style(tone: String, completed: bool, current: bool = false) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	if current:
		style.bg_color = Color(0.07, 0.10, 0.14, 0.96)
	elif completed:
		style.bg_color = Color(0.12, 0.09, 0.06, 0.92)
	else:
		style.bg_color = Color(0.07, 0.07, 0.08, 0.90)
	style.border_color = _resolve_card_tone_color(tone)
	style.set_border_width_all(2 if current else 1)
	style.set_corner_radius_all(6)
	return style

func _build_territory_table_block(block_payload: Dictionary) -> Control:
	var panel := _build_block_panel(block_payload)
	var column := panel.get_child(0).get_child(0) as VBoxContainer
	var rows: Array = block_payload.get("rows", []) as Array
	if not rows.is_empty():
		column.add_child(_build_territory_table_header())
	for row_variant in rows:
		if not (row_variant is Dictionary):
			continue
		var row := _build_territory_row(row_variant as Dictionary)
		if row != null:
			column.add_child(row)
	if rows.is_empty():
		column.add_child(_build_text_label("当前没有领地记录。", 14))
	return panel

func _build_territory_table_header() -> Control:
	var header := HBoxContainer.new()
	header.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_theme_constant_override("separation", 12)
	for payload in [
		{"text": "领地", "width": 0, "expand": true},
		{"text": "等级", "width": 96},
		{"text": "坐标", "width": 128},
		{"text": "定位", "width": 74},
		{"text": "放弃", "width": 44},
	]:
		var label := _build_text_label(str(payload.get("text", "")), 12)
		label.add_theme_color_override("font_color", Color(0.78, 0.70, 0.48, 0.92))
		if bool(payload.get("expand", false)):
			label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		else:
			label.custom_minimum_size = Vector2(float(payload.get("width", 0)), 0)
		header.add_child(label)
	return header

func _build_territory_row(row_payload: Dictionary) -> Control:
	var name := str(row_payload.get("name", "")).strip_edges()
	var level := str(row_payload.get("level", "")).strip_edges()
	var coord := str(row_payload.get("coord", "")).strip_edges()
	var resource_label := str(row_payload.get("resource_label", "")).strip_edges()
	if name == "" and coord == "":
		return null
	var row_panel := PanelContainer.new()
	row_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row_panel.custom_minimum_size = Vector2(0, 56)
	row_panel.add_theme_stylebox_override("panel", _build_reading_list_style(str(row_payload.get("tone", "neutral")).strip_edges()))
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 10)
	margin.add_theme_constant_override("margin_top", 6)
	margin.add_theme_constant_override("margin_right", 10)
	margin.add_theme_constant_override("margin_bottom", 6)
	row_panel.add_child(margin)
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 9)
	margin.add_child(row)
	if resource_label != "":
		row.add_child(_build_territory_resource_badge(resource_label, str(row_payload.get("tone", "neutral")).strip_edges()))
	var name_label := _build_text_label(name, 16)
	name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_label.add_theme_color_override("font_color", Color(0.90, 0.88, 0.80, 0.98))
	row.add_child(name_label)
	var level_label := _build_text_label(level, 13)
	level_label.custom_minimum_size = Vector2(92, 0)
	row.add_child(level_label)
	row.add_child(_build_territory_coord_cell(coord))
	var action_id := str(row_payload.get("action_id", "")).strip_edges()
	if action_id != "":
		var button := Button.new()
		button.text = str(row_payload.get("action_label", "前往"))
		button.custom_minimum_size = Vector2(70, 34)
		button.focus_mode = Control.FOCUS_NONE
		button.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		button.add_theme_font_size_override("font_size", 14)
		_apply_faction_table_button_style(button)
		button.pressed.connect(Callable(self, "_on_action_button_pressed").bind(action_id))
		row.add_child(button)
	var abandon_button := Button.new()
	abandon_button.text = "╳"
	abandon_button.custom_minimum_size = Vector2(38, 34)
	abandon_button.focus_mode = Control.FOCUS_NONE
	abandon_button.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	abandon_button.disabled = true
	abandon_button.add_theme_font_size_override("font_size", 16)
	_apply_faction_abandon_button_style(abandon_button)
	row.add_child(abandon_button)
	return row_panel

func _build_territory_coord_cell(coord: String) -> Control:
	var shell := HBoxContainer.new()
	shell.custom_minimum_size = Vector2(128, 0)
	shell.add_theme_constant_override("separation", 6)
	shell.add_child(_build_territory_coord_icon())
	var coord_label := _build_text_label(coord, 13)
	coord_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	coord_label.add_theme_color_override("font_color", Color(0.50, 0.88, 0.66, 0.98))
	shell.add_child(coord_label)
	return shell

func _build_territory_coord_icon() -> Control:
	var pin := PanelContainer.new()
	pin.custom_minimum_size = Vector2(18, 18)
	pin.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.12, 0.24, 0.14, 0.92)
	style.border_color = Color(0.56, 0.98, 0.66, 0.82)
	style.set_border_width_all(1)
	style.set_corner_radius_all(9)
	pin.add_theme_stylebox_override("panel", style)
	var dot := Label.new()
	dot.text = "•"
	dot.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	dot.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	dot.add_theme_font_size_override("font_size", 16)
	dot.add_theme_color_override("font_color", Color(0.76, 1.0, 0.82, 1.0))
	pin.add_child(dot)
	return pin

func _apply_faction_table_button_style(button: Button) -> void:
	button.add_theme_color_override("font_color", Color(0.94, 0.92, 0.84, 1.0))
	button.add_theme_color_override("font_hover_color", Color(1.0, 0.95, 0.80, 1.0))
	button.add_theme_stylebox_override("normal", _build_flat_panel_style(Color(0.075, 0.075, 0.080, 0.92), Color(0.16, 0.16, 0.18, 0.82), 1))
	button.add_theme_stylebox_override("hover", _build_flat_panel_style(Color(0.12, 0.10, 0.08, 0.96), Color(0.58, 0.46, 0.24, 0.92), 1))
	button.add_theme_stylebox_override("pressed", _build_flat_panel_style(Color(0.16, 0.12, 0.08, 0.96), Color(0.74, 0.56, 0.28, 1.0), 1))
	button.add_theme_stylebox_override("focus", StyleBoxEmpty.new())

func _apply_faction_abandon_button_style(button: Button) -> void:
	button.add_theme_color_override("font_disabled_color", Color(0.96, 0.46, 0.48, 0.84))
	button.add_theme_stylebox_override("disabled", _build_flat_panel_style(Color(0.030, 0.030, 0.034, 0.94), Color(0.34, 0.12, 0.12, 0.88), 1))
	button.add_theme_stylebox_override("focus", StyleBoxEmpty.new())

func _build_territory_resource_badge(text: String, tone: String) -> Control:
	var badge := PanelContainer.new()
	badge.custom_minimum_size = Vector2(38, 38)
	badge.add_theme_stylebox_override("panel", _build_territory_resource_badge_style(text, tone))
	var label := Label.new()
	label.text = text
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 17)
	label.add_theme_color_override("font_color", Color(0.98, 0.92, 0.72, 1.0))
	badge.add_child(label)
	return badge

func _build_territory_resource_badge_style(text: String, tone: String) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = _resolve_card_tone_color(tone)
	if text.find("石") >= 0:
		style.bg_color = Color(0.54, 0.54, 0.56, 0.96)
	elif text.find("木") >= 0:
		style.bg_color = Color(0.38, 0.62, 0.42, 0.96)
	elif text.find("粮") >= 0:
		style.bg_color = Color(0.78, 0.64, 0.28, 0.96)
	elif text.find("铁") >= 0:
		style.bg_color = Color(0.30, 0.50, 0.88, 0.96)
	style.border_color = Color(0.08, 0.08, 0.09, 0.60)
	style.set_border_width_all(1)
	style.set_corner_radius_all(6)
	return style

func _build_faction_map_preview_block(block_payload: Dictionary) -> Control:
	var panel := _build_block_panel(block_payload)
	var column := panel.get_child(0).get_child(0) as VBoxContainer
	var payload: Dictionary = block_payload.get("payload", {}) as Dictionary
	var status := str(payload.get("status", "地图占位，不接真实跳转。")).strip_edges()
	if status != "":
		var status_label := _build_text_label(status, 13)
		status_label.add_theme_color_override("font_color", Color(0.72, 0.72, 0.74, 0.94))
		column.add_child(status_label)
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 12)
	column.add_child(row)
	row.add_child(_build_faction_map_canvas(payload))
	row.add_child(_build_faction_map_controls(payload))
	return panel

func _build_faction_status_split_block(block_payload: Dictionary) -> Control:
	var panel := _build_block_panel(block_payload)
	var column := panel.get_child(0).get_child(0) as VBoxContainer
	var split := HBoxContainer.new()
	split.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	split.add_theme_constant_override("separation", 14)
	column.add_child(split)
	var territories: Array = block_payload.get("territories", []) as Array
	var map_payload: Dictionary = block_payload.get("map_payload", {}) as Dictionary
	map_payload = map_payload.duplicate(true)
	var has_map := not map_payload.is_empty() and bool(map_payload.get("enabled", true))
	if has_map:
		map_payload["height"] = float(map_payload.get("height", 500))
	var territory_panel := _build_faction_split_territory_panel(territories)
	territory_panel.custom_minimum_size = Vector2(650 if has_map else 0, 0)
	territory_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	territory_panel.size_flags_stretch_ratio = 0.92
	split.add_child(territory_panel)
	if has_map:
		var map_panel := _build_faction_split_map_panel(map_payload)
		map_panel.custom_minimum_size = Vector2(0, 0)
		map_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		map_panel.size_flags_stretch_ratio = 1.38
		split.add_child(map_panel)
	return panel

func _build_faction_split_territory_panel(rows: Array) -> PanelContainer:
	var shell := PanelContainer.new()
	shell.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.028, 0.028, 0.032, 0.68), Color(0.42, 0.34, 0.22, 0.34), 1, 5))
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 12)
	margin.add_theme_constant_override("margin_top", 10)
	margin.add_theme_constant_override("margin_right", 12)
	margin.add_theme_constant_override("margin_bottom", 10)
	shell.add_child(margin)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 7)
	margin.add_child(column)
	var added := 0
	for row_variant in rows:
		if not (row_variant is Dictionary):
			continue
		if added == 0:
			column.add_child(_build_territory_table_header())
		var row := _build_territory_row(row_variant as Dictionary)
		if row != null:
			row.custom_minimum_size = Vector2(0, 56)
			column.add_child(row)
			added += 1
	if added == 0:
		column.add_child(_build_faction_empty_state())
	return shell

func _build_faction_empty_state() -> Control:
	var shell := VBoxContainer.new()
	shell.custom_minimum_size = Vector2(0, 180)
	shell.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	shell.size_flags_vertical = Control.SIZE_EXPAND_FILL
	shell.alignment = BoxContainer.ALIGNMENT_CENTER
	shell.add_theme_constant_override("separation", 8)
	var badge := PanelContainer.new()
	var badge_style := StyleBoxFlat.new()
	badge_style.bg_color = Color(0.18, 0.15, 0.10, 0.54)
	badge_style.border_color = Color(0.80, 0.66, 0.36, 0.42)
	badge_style.set_border_width_all(1)
	badge_style.set_corner_radius_all(10)
	badge_style.content_margin_left = 16
	badge_style.content_margin_right = 16
	badge_style.content_margin_top = 6
	badge_style.content_margin_bottom = 6
	badge.add_theme_stylebox_override("panel", badge_style)
	var badge_label := _build_text_label("空态", 14)
	badge_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	badge_label.add_theme_color_override("font_color", Color(0.94, 0.86, 0.68, 0.96))
	badge.add_child(badge_label)
	shell.add_child(badge)
	var title := _build_text_label("当前暂无领地", 22)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_color_override("font_color", Color(0.96, 0.92, 0.82, 0.98))
	shell.add_child(title)
	var line_one := _build_text_label("保持动态空态，不补静态样本。", 14)
	line_one.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	line_one.add_theme_color_override("font_color", Color(0.78, 0.76, 0.72, 0.90))
	shell.add_child(line_one)
	var notes := HBoxContainer.new()
	notes.alignment = BoxContainer.ALIGNMENT_CENTER
	notes.add_theme_constant_override("separation", 8)
	notes.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	notes.add_child(_build_faction_empty_note("等待 territories[]"))
	notes.add_child(_build_faction_empty_note("不接地图跳转"))
	shell.add_child(notes)
	return shell

func _build_faction_empty_note(text: String) -> Control:
	var chip := PanelContainer.new()
	chip.custom_minimum_size = Vector2(148, 34)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.12, 0.14, 0.13, 0.62)
	style.border_color = Color(0.44, 0.56, 0.46, 0.30)
	style.set_border_width_all(1)
	style.set_corner_radius_all(11)
	style.content_margin_left = 12
	style.content_margin_right = 12
	style.content_margin_top = 5
	style.content_margin_bottom = 5
	chip.add_theme_stylebox_override("panel", style)
	var label := Label.new()
	label.text = text
	label.autowrap_mode = TextServer.AUTOWRAP_OFF
	label.clip_text = false
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.add_theme_font_size_override("font_size", 13)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.add_theme_color_override("font_color", Color(0.72, 0.82, 0.76, 0.94))
	chip.add_child(label)
	return chip

func _build_faction_section_nav() -> Control:
	var shell := HBoxContainer.new()
	shell.custom_minimum_size = Vector2(84, 0)
	shell.size_flags_vertical = Control.SIZE_EXPAND_FILL
	shell.add_theme_constant_override("separation", 9)
	var column := VBoxContainer.new()
	column.custom_minimum_size = Vector2(74, 0)
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 10)
	shell.add_child(column)
	column.add_child(_build_faction_section_nav_item("总览", false))
	column.add_child(_build_faction_section_nav_item("领地", true))
	column.add_child(_build_faction_section_nav_item("沃土", false))
	var rail := ColorRect.new()
	rail.color = Color(0.72, 0.58, 0.28, 0.36)
	rail.custom_minimum_size = Vector2(1, 0)
	rail.size_flags_vertical = Control.SIZE_EXPAND_FILL
	shell.add_child(rail)
	return shell

func _build_faction_section_nav_item(text: String, active: bool) -> Control:
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(74, 58)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.10, 0.10, 0.12, 0.0)
	style.border_color = Color(0.58, 0.55, 0.50, 0.24)
	style.set_border_width_all(0)
	style.set_border_width(SIDE_BOTTOM, 1)
	style.content_margin_left = 4
	style.content_margin_right = 4
	style.content_margin_top = 4
	style.content_margin_bottom = 4
	if active:
		style.bg_color = Color(0.18, 0.05, 0.04, 0.38)
		style.border_color = Color(0.92, 0.16, 0.14, 0.72)
		style.set_border_width(SIDE_BOTTOM, 3)
	panel.add_theme_stylebox_override("panel", style)
	var label := _build_text_label(text, 16 if active else 15)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.size_flags_vertical = Control.SIZE_EXPAND_FILL
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_color_override("font_color", Color(0.96, 0.90, 0.74, 0.98) if active else Color(0.74, 0.72, 0.68, 0.86))
	panel.add_child(label)
	return panel

func _build_faction_split_map_panel(payload: Dictionary) -> PanelContainer:
	var shell := PanelContainer.new()
	shell.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.022, 0.030, 0.022, 0.70), Color(0.34, 0.54, 0.32, 0.36), 1, 5))
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 12)
	margin.add_theme_constant_override("margin_top", 10)
	margin.add_theme_constant_override("margin_right", 12)
	margin.add_theme_constant_override("margin_bottom", 10)
	shell.add_child(margin)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 8)
	margin.add_child(column)
	var status := str(payload.get("status", "地图占位，不接真实跳转。")).strip_edges()
	if bool(payload.get("show_status_text", false)) and status != "":
		var status_label := _build_text_label(status, 13)
		status_label.add_theme_color_override("font_color", Color(0.72, 0.76, 0.70, 0.94))
		column.add_child(status_label)
	var map_row := HBoxContainer.new()
	map_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	map_row.add_theme_constant_override("separation", 12)
	column.add_child(map_row)
	map_row.add_child(_build_faction_map_canvas(payload))
	map_row.add_child(_build_faction_map_controls(payload))
	return shell

func _build_faction_map_canvas(payload: Dictionary) -> Control:
	var map_height := maxf(360.0, float(payload.get("height", 246)) - 20.0)
	var shell := PanelContainer.new()
	shell.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	shell.custom_minimum_size = Vector2(0, map_height + 20.0)
	shell.add_theme_stylebox_override("panel", _build_faction_map_canvas_style())
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 10)
	margin.add_theme_constant_override("margin_top", 10)
	margin.add_theme_constant_override("margin_right", 10)
	margin.add_theme_constant_override("margin_bottom", 10)
	shell.add_child(margin)
	var canvas := Control.new()
	canvas.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	canvas.size_flags_vertical = Control.SIZE_EXPAND_FILL
	canvas.custom_minimum_size = Vector2(720, map_height)
	margin.add_child(canvas)
	var sea := PanelContainer.new()
	sea.position = Vector2(548, -18)
	sea.custom_minimum_size = Vector2(190, 390)
	sea.rotation_degrees = 2.0
	sea.add_theme_stylebox_override("panel", _build_faction_map_land_style(Color(0.03, 0.12, 0.15, 0.72), Color(0.12, 0.34, 0.38, 0.40)))
	canvas.add_child(sea)
	var desert := PanelContainer.new()
	desert.position = Vector2(20, 26)
	desert.custom_minimum_size = Vector2(268, 312)
	desert.rotation_degrees = -10.0
	desert.pivot_offset = Vector2(134, 156)
	desert.add_theme_stylebox_override("panel", _build_faction_map_land_style(Color(0.32, 0.25, 0.16, 0.34), Color(0.64, 0.56, 0.40, 0.26)))
	canvas.add_child(desert)
	var land := PanelContainer.new()
	land.position = Vector2(156, 28)
	land.custom_minimum_size = Vector2(520, 330)
	land.rotation_degrees = -6.0
	land.pivot_offset = Vector2(260, 165)
	land.add_theme_stylebox_override("panel", _build_faction_map_land_style(Color(0.12, 0.26, 0.15, 0.72), Color(0.42, 0.62, 0.36, 0.46)))
	canvas.add_child(land)
	for line_payload in [
		{"pos": Vector2(214, 82), "size": Vector2(372, 2), "rot": -12.0},
		{"pos": Vector2(226, 174), "size": Vector2(380, 2), "rot": -6.0},
		{"pos": Vector2(304, 46), "size": Vector2(2, 294), "rot": 12.0},
		{"pos": Vector2(420, 60), "size": Vector2(2, 276), "rot": -13.0},
		{"pos": Vector2(526, 86), "size": Vector2(2, 224), "rot": 9.0},
	]:
		canvas.add_child(_build_faction_map_line(line_payload["pos"], line_payload["size"], line_payload["rot"], Color(0.22, 0.42, 0.24, 0.34)))
	for river_payload in [
		{"pos": Vector2(286, 136), "size": Vector2(244, 3), "rot": -28.0},
		{"pos": Vector2(368, 230), "size": Vector2(188, 3), "rot": 18.0},
	]:
		canvas.add_child(_build_faction_map_line(river_payload["pos"], river_payload["size"], river_payload["rot"], Color(0.22, 0.44, 0.46, 0.42)))
	var provinces: Array = payload.get("provinces", []) as Array
	var province_positions := [
		Vector2(196, 40), Vector2(334, 58), Vector2(500, 74), Vector2(278, 140),
		Vector2(104, 158), Vector2(430, 158), Vector2(220, 232), Vector2(366, 252),
		Vector2(532, 210), Vector2(88, 84), Vector2(594, 132), Vector2(486, 286),
	]
	var province_index := 0
	for province_variant in provinces:
		if province_index >= province_positions.size():
			break
		var province_name := str(province_variant).strip_edges()
		if province_name != "":
			canvas.add_child(_build_faction_map_province_label(province_name, province_positions[province_index]))
			province_index += 1
	for dot_pos in [Vector2(302, 132), Vector2(218, 186), Vector2(390, 214), Vector2(510, 106)]:
		canvas.add_child(_build_faction_map_dot(dot_pos))
	canvas.add_child(_build_faction_map_city_marker(Vector2(292, 120), "主城"))
	var marker_row := HBoxContainer.new()
	marker_row.position = Vector2(36, map_height - 54.0)
	marker_row.custom_minimum_size = Vector2(560, 34)
	marker_row.size = Vector2(560, 34)
	marker_row.add_theme_constant_override("separation", 8)
	canvas.add_child(marker_row)
	var markers: Array = payload.get("markers", []) as Array
	for marker_variant in markers:
		var marker_text := str(marker_variant).strip_edges()
		if marker_text == "":
			continue
		marker_row.add_child(_build_faction_map_marker(marker_text))
	return shell

func _build_faction_map_line(pos: Vector2, line_size: Vector2, rotation: float, color: Color) -> ColorRect:
	var line := ColorRect.new()
	line.position = pos
	line.size = line_size
	line.custom_minimum_size = line_size
	line.rotation_degrees = rotation
	line.color = color
	return line

func _build_faction_map_land_style(bg_color: Color, border_color: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = bg_color
	style.border_color = border_color
	style.set_border_width_all(1)
	style.set_corner_radius_all(2)
	return style

func _build_faction_map_province_label(text: String, pos: Vector2) -> Control:
	var label := Label.new()
	label.text = text
	label.position = pos
	label.custom_minimum_size = Vector2(80, 22)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 14)
	label.add_theme_color_override("font_color", Color(0.78, 0.82, 0.74, 0.72))
	return label

func _build_faction_map_dot(pos: Vector2) -> Control:
	var dot := PanelContainer.new()
	dot.position = pos
	dot.custom_minimum_size = Vector2(8, 8)
	dot.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.24, 0.90, 0.34, 0.92), Color(0.50, 1.0, 0.58, 0.84), 1, 4))
	return dot

func _build_faction_map_city_marker(pos: Vector2, text: String) -> Control:
	var marker := PanelContainer.new()
	marker.position = pos
	marker.custom_minimum_size = Vector2(44, 28)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.12, 0.30, 0.18, 0.94)
	style.border_color = Color(0.42, 0.96, 0.58, 0.90)
	style.set_border_width_all(1)
	style.set_corner_radius_all(3)
	marker.add_theme_stylebox_override("panel", style)
	var label := _build_text_label(text, 11)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_color_override("font_color", Color(0.74, 1.0, 0.78, 0.98))
	marker.add_child(label)
	return marker

func _build_faction_map_province_tile(text: String) -> Control:
	var tile := PanelContainer.new()
	tile.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tile.custom_minimum_size = Vector2(0, 48)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.12, 0.18, 0.12, 0.72)
	style.border_color = Color(0.35, 0.58, 0.32, 0.72)
	style.set_border_width_all(1)
	style.set_corner_radius_all(3)
	tile.add_theme_stylebox_override("panel", style)
	var label := Label.new()
	label.text = text
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 13)
	label.add_theme_color_override("font_color", Color(0.80, 0.84, 0.76, 0.92))
	tile.add_child(label)
	return tile

func _build_faction_map_marker(text: String) -> Control:
	var marker := PanelContainer.new()
	marker.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.05, 0.07, 0.05, 0.86)
	style.border_color = Color(0.34, 0.86, 0.46, 0.80)
	style.set_border_width_all(1)
	style.set_corner_radius_all(4)
	marker.add_theme_stylebox_override("panel", style)
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 8)
	margin.add_theme_constant_override("margin_top", 6)
	margin.add_theme_constant_override("margin_right", 8)
	margin.add_theme_constant_override("margin_bottom", 6)
	marker.add_child(margin)
	var label := _build_text_label(text, 12)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.add_theme_color_override("font_color", Color(0.62, 0.94, 0.72, 0.96))
	margin.add_child(label)
	return marker

func _build_faction_map_controls(payload: Dictionary) -> Control:
	var controls := VBoxContainer.new()
	controls.custom_minimum_size = Vector2(58, 0)
	controls.add_theme_constant_override("separation", 12)
	var filter_button := Button.new()
	filter_button.text = "▦\n%s" % str(payload.get("filter_label", "筛选"))
	filter_button.focus_mode = Control.FOCUS_NONE
	filter_button.disabled = true
	filter_button.custom_minimum_size = Vector2(58, 112)
	filter_button.add_theme_font_size_override("font_size", 16)
	_apply_faction_map_control_style(filter_button)
	controls.add_child(filter_button)
	for label_text in ["＋", "－"]:
		var zoom_button := Button.new()
		zoom_button.text = label_text
		zoom_button.focus_mode = Control.FOCUS_NONE
		zoom_button.disabled = true
		zoom_button.custom_minimum_size = Vector2(58, 58)
		zoom_button.add_theme_font_size_override("font_size", 24)
		_apply_faction_map_control_style(zoom_button)
		controls.add_child(zoom_button)
	return controls

func _apply_faction_map_control_style(button: Button) -> void:
	button.add_theme_color_override("font_disabled_color", Color(0.90, 0.84, 0.62, 0.92))
	button.add_theme_stylebox_override("disabled", _build_flat_panel_style(Color(0.035, 0.038, 0.038, 0.94), Color(0.38, 0.34, 0.24, 0.86), 1))
	button.add_theme_stylebox_override("focus", StyleBoxEmpty.new())

func _build_faction_map_canvas_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.07, 0.09, 0.075, 0.94)
	style.border_color = Color(0.30, 0.34, 0.28, 0.88)
	style.set_border_width_all(1)
	style.set_corner_radius_all(5)
	return style

func _build_task_strip_list_block(block_payload: Dictionary) -> Control:
	var panel := _build_block_panel(block_payload)
	var column := panel.get_child(0).get_child(0) as VBoxContainer
	var items: Array = block_payload.get("items", []) as Array
	var added := 0
	for item_variant in items:
		if not (item_variant is Dictionary):
			continue
		var task_row := _build_task_strip_item(item_variant as Dictionary)
		if task_row != null:
			column.add_child(task_row)
			added += 1
	if added == 0:
		column.add_child(_build_text_label("当前没有章节任务。", 14))
	return panel

func _build_task_chapter_split_block(block_payload: Dictionary) -> Control:
	var panel := _build_block_panel(block_payload)
	var column := panel.get_child(0).get_child(0) as VBoxContainer
	var split := HBoxContainer.new()
	split.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	split.add_theme_constant_override("separation", 14)
	column.add_child(split)
	var chapter_panel := _build_task_chapter_stage_panel(block_payload)
	chapter_panel.custom_minimum_size = Vector2(560, 0)
	chapter_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	chapter_panel.size_flags_stretch_ratio = 0.90
	split.add_child(chapter_panel)
	var list_panel := _build_task_chapter_task_panel(block_payload.get("items", []) as Array)
	list_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list_panel.size_flags_stretch_ratio = 1.30
	split.add_child(list_panel)
	return panel

func _build_task_chapter_stage_panel(block_payload: Dictionary) -> PanelContainer:
	var shell := PanelContainer.new()
	shell.custom_minimum_size = Vector2(0, 460)
	shell.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.060, 0.065, 0.072, 0.56), Color(0.38, 0.42, 0.42, 0.14), 1, 5))
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 24)
	margin.add_theme_constant_override("margin_top", 24)
	margin.add_theme_constant_override("margin_right", 24)
	margin.add_theme_constant_override("margin_bottom", 24)
	shell.add_child(margin)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 12)
	margin.add_child(column)
	column.add_child(_build_task_chapter_scene_art(str(block_payload.get("scene_image_path", "")).strip_edges()))
	var chapter: Dictionary = block_payload.get("chapter", {}) as Dictionary
	var title := str(chapter.get("value", block_payload.get("headline", "任务"))).strip_edges()
	var title_label := Label.new()
	title_label.text = title
	title_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	title_label.add_theme_font_size_override("font_size", 36)
	title_label.add_theme_color_override("font_color", Color(0.98, 0.88, 0.52, 1.0))
	column.add_child(title_label)
	column.add_child(_build_task_chapter_plate(str(chapter.get("title", "第一章")).strip_edges()))
	var progress_row := HBoxContainer.new()
	progress_row.add_theme_constant_override("separation", 14)
	column.add_child(progress_row)
	progress_row.add_child(_build_task_chapter_progress_badge(str(chapter.get("meta", "0/0")).strip_edges()))
	var state_text := str(block_payload.get("state", "资源奖励模板")).strip_edges()
	var state_label := _build_text_label(state_text, 17)
	state_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	state_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	state_label.add_theme_color_override("font_color", Color(0.92, 0.92, 0.88, 0.98))
	progress_row.add_child(state_label)
	var reward_label := _build_text_label("奖励：粮 / 木 / 石 / 铁 / 铜钱", 16)
	reward_label.add_theme_color_override("font_color", Color(0.92, 0.82, 0.58, 0.98))
	column.add_child(reward_label)
	return shell

func _build_task_chapter_plate(text: String) -> Control:
	var plate := PanelContainer.new()
	plate.custom_minimum_size = Vector2(118, 34)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.14, 0.10, 0.09, 0.96)
	style.border_color = Color(0.46, 0.18, 0.14, 0.94)
	style.set_border_width_all(1)
	style.set_corner_radius_all(3)
	plate.add_theme_stylebox_override("panel", style)
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 10)
	margin.add_theme_constant_override("margin_right", 10)
	margin.add_theme_constant_override("margin_top", 3)
	margin.add_theme_constant_override("margin_bottom", 3)
	plate.add_child(margin)
	var label := Label.new()
	label.text = text
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 18)
	label.add_theme_color_override("font_color", Color(0.92, 0.88, 0.76, 0.98))
	margin.add_child(label)
	return plate

func _build_task_chapter_scene_art(image_path: String = "") -> Control:
	var art_panel := PanelContainer.new()
	art_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	art_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	art_panel.custom_minimum_size = Vector2(0, 350)
	art_panel.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.045, 0.055, 0.060, 0.88), Color(0.38, 0.36, 0.32, 0.34), 1, 4))
	var canvas := Control.new()
	canvas.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	canvas.size_flags_vertical = Control.SIZE_EXPAND_FILL
	canvas.custom_minimum_size = Vector2(0, 350)
	art_panel.add_child(canvas)
	var sky := ColorRect.new()
	sky.anchor_right = 1.0
	sky.anchor_bottom = 1.0
	sky.color = Color(0.11, 0.12, 0.13, 0.84)
	canvas.add_child(sky)
	if image_path != "":
		var texture := _load_card_image_texture(image_path)
		if texture != null:
			var image := TextureRect.new()
			image.texture = texture
			image.anchor_right = 1.0
			image.anchor_bottom = 1.0
			image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
			image.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
			image.modulate = Color(0.90, 0.91, 0.92, 0.90)
			canvas.add_child(image)
			var top_haze := ColorRect.new()
			top_haze.anchor_right = 1.0
			top_haze.anchor_bottom = 0.56
			top_haze.color = Color(0.80, 0.81, 0.83, 0.08)
			canvas.add_child(top_haze)
			var side_mask_left := ColorRect.new()
			side_mask_left.anchor_right = 0.20
			side_mask_left.anchor_bottom = 1.0
			side_mask_left.color = Color(0.05, 0.05, 0.06, 0.16)
			canvas.add_child(side_mask_left)
			var side_mask_right := ColorRect.new()
			side_mask_right.anchor_left = 0.82
			side_mask_right.anchor_right = 1.0
			side_mask_right.anchor_bottom = 1.0
			side_mask_right.color = Color(0.05, 0.05, 0.06, 0.14)
			canvas.add_child(side_mask_right)
			var bridge_band := ColorRect.new()
			bridge_band.anchor_left = 0.14
			bridge_band.anchor_right = 0.86
			bridge_band.anchor_top = 0.42
			bridge_band.anchor_bottom = 0.56
			bridge_band.color = Color(0.34, 0.34, 0.36, 0.10)
			canvas.add_child(bridge_band)
			var lower_shadow := ColorRect.new()
			lower_shadow.anchor_left = 0.0
			lower_shadow.anchor_right = 1.0
			lower_shadow.anchor_top = 0.62
			lower_shadow.anchor_bottom = 1.0
			lower_shadow.color = Color(0.04, 0.04, 0.05, 0.28)
			canvas.add_child(lower_shadow)
			var fog_band := ColorRect.new()
			fog_band.anchor_left = 0.0
			fog_band.anchor_right = 1.0
			fog_band.anchor_top = 0.30
			fog_band.anchor_bottom = 0.86
			fog_band.color = Color(0.72, 0.72, 0.74, 0.08)
			canvas.add_child(fog_band)
			var front_fog := ColorRect.new()
			front_fog.anchor_left = 0.0
			front_fog.anchor_right = 1.0
			front_fog.anchor_top = 0.58
			front_fog.anchor_bottom = 1.0
			front_fog.color = Color(0.66, 0.67, 0.69, 0.06)
			canvas.add_child(front_fog)
			return art_panel
	var upper_haze := ColorRect.new()
	upper_haze.position = Vector2(148, 96)
	upper_haze.custom_minimum_size = Vector2(188, 54)
	upper_haze.color = Color(0.66, 0.68, 0.70, 0.04)
	canvas.add_child(upper_haze)
	var left_fog := ColorRect.new()
	left_fog.position = Vector2(0, 58)
	left_fog.custom_minimum_size = Vector2(240, 204)
	left_fog.rotation_degrees = -2.0
	left_fog.color = Color(0.56, 0.60, 0.62, 0.05)
	canvas.add_child(left_fog)
	var chapter_backdrop := _build_atlas_texture_rect(
		"res://assets/themes/slgclient/current/world/component_outside.png",
		Rect2(0, 520, 350, 260),
		Vector2(2, 60),
		Vector2(374, 246),
		Color(0.92, 0.92, 0.90, 0.04)
	)
	if chapter_backdrop != null:
		canvas.add_child(chapter_backdrop)
	var hall_texture := _load_card_image_texture("res://assets/themes/slgclient/current/world/city_hall_base_v1.png")
	if hall_texture != null:
		var hall_sprite := TextureRect.new()
		hall_sprite.texture = hall_texture
		hall_sprite.position = Vector2(-6, 62)
		hall_sprite.size = Vector2(234, 190)
		hall_sprite.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		hall_sprite.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		hall_sprite.modulate = Color(0.82, 0.84, 0.84, 0.08)
		canvas.add_child(hall_sprite)
	var gate_texture := _load_card_image_texture("res://assets/themes/slgclient/current/world/city_gate_base_v1.png")
	if gate_texture != null:
		var gate_sprite := TextureRect.new()
		gate_sprite.texture = gate_texture
		gate_sprite.position = Vector2(158, 74)
		gate_sprite.size = Vector2(210, 150)
		gate_sprite.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		gate_sprite.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		gate_sprite.modulate = Color(0.88, 0.88, 0.84, 0.08)
		canvas.add_child(gate_sprite)
	var wall_texture := _load_card_image_texture("res://assets/themes/slgclient/current/world/city_wall_segment_base_v1.png")
	if wall_texture != null:
		var left_wall := TextureRect.new()
		left_wall.texture = wall_texture
		left_wall.position = Vector2(28, 138)
		left_wall.size = Vector2(128, 94)
		left_wall.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		left_wall.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		left_wall.modulate = Color(0.84, 0.84, 0.82, 0.04)
		canvas.add_child(left_wall)
		var mid_wall := TextureRect.new()
		mid_wall.texture = wall_texture
		mid_wall.position = Vector2(166, 132)
		mid_wall.size = Vector2(246, 102)
		mid_wall.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		mid_wall.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		mid_wall.modulate = Color(0.84, 0.84, 0.82, 0.05)
		canvas.add_child(mid_wall)
	var battlement := PanelContainer.new()
	battlement.position = Vector2(118, 104)
	battlement.custom_minimum_size = Vector2(266, 28)
	battlement.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.20, 0.20, 0.21, 0.26), Color(0.42, 0.40, 0.34, 0.10), 1, 1))
	canvas.add_child(battlement)
	for index in range(10):
		var crenel := ColorRect.new()
		crenel.position = Vector2(8 + index * 24, 4 + (index % 2))
		crenel.custom_minimum_size = Vector2(10, 10)
		crenel.color = Color(0.12, 0.12, 0.12, 0.22)
		battlement.add_child(crenel)
	var bridge := PanelContainer.new()
	bridge.position = Vector2(110, 114)
	bridge.custom_minimum_size = Vector2(296, 8)
	bridge.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.36, 0.37, 0.37, 0.42), Color(0.68, 0.66, 0.58, 0.10), 1, 1))
	canvas.add_child(bridge)
	var bridge_shadow := ColorRect.new()
	bridge_shadow.position = Vector2(108, 121)
	bridge_shadow.custom_minimum_size = Vector2(300, 12)
	bridge_shadow.color = Color(0.10, 0.10, 0.10, 0.18)
	canvas.add_child(bridge_shadow)
	for index in range(11):
		var rail_post := ColorRect.new()
		rail_post.position = Vector2(126 + index * 24, 98 + (index % 2))
		rail_post.custom_minimum_size = Vector2(2, 22)
		rail_post.color = Color(0.20, 0.20, 0.20, 0.54)
		canvas.add_child(rail_post)
	var bridge_banner := ColorRect.new()
	bridge_banner.position = Vector2(330, 108)
	bridge_banner.custom_minimum_size = Vector2(10, 20)
	bridge_banner.color = Color(0.78, 0.28, 0.18, 0.84)
	canvas.add_child(bridge_banner)
	var ship_hull := PanelContainer.new()
	ship_hull.position = Vector2(298, 102)
	ship_hull.custom_minimum_size = Vector2(52, 10)
	ship_hull.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.20, 0.18, 0.16, 0.34), Color(0.42, 0.38, 0.30, 0.08), 1, 2))
	canvas.add_child(ship_hull)
	var ship_mast := ColorRect.new()
	ship_mast.position = Vector2(322, 78)
	ship_mast.custom_minimum_size = Vector2(2, 26)
	ship_mast.color = Color(0.20, 0.18, 0.16, 0.54)
	canvas.add_child(ship_mast)
	var glow := ColorRect.new()
	glow.position = Vector2(146, 96)
	glow.custom_minimum_size = Vector2(250, 72)
	glow.color = Color(0.84, 0.86, 0.86, 0.10)
	canvas.add_child(glow)
	var bridge_light := ColorRect.new()
	bridge_light.position = Vector2(156, 106)
	bridge_light.custom_minimum_size = Vector2(214, 28)
	bridge_light.color = Color(0.82, 0.84, 0.84, 0.09)
	canvas.add_child(bridge_light)
	var bridge_haze := ColorRect.new()
	bridge_haze.position = Vector2(112, 104)
	bridge_haze.custom_minimum_size = Vector2(304, 40)
	bridge_haze.color = Color(0.72, 0.74, 0.74, 0.06)
	canvas.add_child(bridge_haze)
	var river_mist := ColorRect.new()
	river_mist.position = Vector2(132, 110)
	river_mist.custom_minimum_size = Vector2(282, 56)
	river_mist.color = Color(0.84, 0.86, 0.88, 0.10)
	canvas.add_child(river_mist)
	var back_glow := ColorRect.new()
	back_glow.position = Vector2(214, 82)
	back_glow.custom_minimum_size = Vector2(168, 118)
	back_glow.color = Color(0.74, 0.76, 0.76, 0.06)
	canvas.add_child(back_glow)
	var distant_wall := PanelContainer.new()
	distant_wall.position = Vector2(168, 132)
	distant_wall.custom_minimum_size = Vector2(258, 54)
	distant_wall.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.22, 0.23, 0.23, 0.08), Color(0.50, 0.46, 0.40, 0.03), 1, 2))
	canvas.add_child(distant_wall)
	var haze := ColorRect.new()
	haze.position = Vector2(0, 118)
	haze.custom_minimum_size = Vector2(520, 76)
	haze.color = Color(0.66, 0.70, 0.72, 0.10)
	canvas.add_child(haze)
	var mid_fog := ColorRect.new()
	mid_fog.position = Vector2(0, 168)
	mid_fog.custom_minimum_size = Vector2(520, 30)
	mid_fog.color = Color(0.56, 0.58, 0.60, 0.06)
	canvas.add_child(mid_fog)
	var high_fog := ColorRect.new()
	high_fog.position = Vector2(0, 136)
	high_fog.custom_minimum_size = Vector2(520, 22)
	high_fog.color = Color(0.70, 0.72, 0.72, 0.04)
	canvas.add_child(high_fog)
	for index in range(8):
		var pike := ColorRect.new()
		pike.position = Vector2(86 + index * 48, 166 + (index % 2) * 10)
		pike.custom_minimum_size = Vector2(2, 102)
		pike.color = Color(0.18, 0.13, 0.12, 0.82)
		canvas.add_child(pike)
	for banner_payload in [
		{"pos": Vector2(136, 178), "size": Vector2(18, 44), "tone": Color(0.50, 0.08, 0.05, 0.80)},
		{"pos": Vector2(188, 164), "size": Vector2(24, 64), "tone": Color(0.58, 0.10, 0.06, 0.82)},
		{"pos": Vector2(242, 176), "size": Vector2(18, 48), "tone": Color(0.54, 0.08, 0.05, 0.80)},
		{"pos": Vector2(298, 160), "size": Vector2(26, 70), "tone": Color(0.60, 0.12, 0.08, 0.82)},
	]:
		var flag := PanelContainer.new()
		flag.position = banner_payload["pos"]
		flag.custom_minimum_size = banner_payload["size"]
		flag.add_theme_stylebox_override("panel", _build_surface_panel_style(banner_payload["tone"], Color(0.72, 0.22, 0.14, 0.34), 1, 1))
		canvas.add_child(flag)
		var flag_shadow := ColorRect.new()
		flag_shadow.position = Vector2(float(banner_payload["pos"].x) + 6.0, float(banner_payload["pos"].y) + 12.0)
		flag_shadow.custom_minimum_size = Vector2(float(banner_payload["size"].x) * 0.8, float(banner_payload["size"].y) * 0.32)
		flag_shadow.color = Color(0.18, 0.10, 0.10, 0.18)
		flag_shadow.rotation_degrees = 16.0
		canvas.add_child(flag_shadow)
	var deep_banner := PanelContainer.new()
	deep_banner.position = Vector2(330, 170)
	deep_banner.custom_minimum_size = Vector2(20, 58)
	deep_banner.rotation_degrees = -6.0
	deep_banner.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.46, 0.08, 0.05, 0.66), Color(0.70, 0.22, 0.14, 0.18), 1, 1))
	canvas.add_child(deep_banner)
	var foreground_banner := PanelContainer.new()
	foreground_banner.position = Vector2(360, 156)
	foreground_banner.custom_minimum_size = Vector2(28, 86)
	foreground_banner.rotation_degrees = -8.0
	foreground_banner.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.54, 0.10, 0.06, 0.88), Color(0.76, 0.24, 0.16, 0.22), 1, 1))
	canvas.add_child(foreground_banner)
	var wall := PanelContainer.new()
	wall.position = Vector2(18, 244)
	wall.custom_minimum_size = Vector2(430, 48)
	wall.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.20, 0.20, 0.18, 0.18), Color(0.66, 0.58, 0.40, 0.12), 1, 3))
	canvas.add_child(wall)
	var foreground_shadow := ColorRect.new()
	foreground_shadow.anchor_right = 1.0
	foreground_shadow.position = Vector2(0, 214)
	foreground_shadow.custom_minimum_size = Vector2(520, 34)
	foreground_shadow.color = Color(0.04, 0.04, 0.05, 0.18)
	canvas.add_child(foreground_shadow)
	var side_mask_left := ColorRect.new()
	side_mask_left.position = Vector2(0, 0)
	side_mask_left.custom_minimum_size = Vector2(108, 330)
	side_mask_left.color = Color(0.10, 0.11, 0.12, 0.24)
	canvas.add_child(side_mask_left)
	var side_mask_right := ColorRect.new()
	side_mask_right.position = Vector2(414, 0)
	side_mask_right.custom_minimum_size = Vector2(118, 330)
	side_mask_right.color = Color(0.10, 0.11, 0.12, 0.20)
	canvas.add_child(side_mask_right)
	var lower_fog := ColorRect.new()
	lower_fog.anchor_left = 0.0
	lower_fog.anchor_right = 1.0
	lower_fog.anchor_top = 0.62
	lower_fog.anchor_bottom = 1.0
	lower_fog.color = Color(0.22, 0.24, 0.25, 0.20)
	canvas.add_child(lower_fog)
	var foreground_fog := ColorRect.new()
	foreground_fog.anchor_left = 0.0
	foreground_fog.anchor_right = 1.0
	foreground_fog.anchor_top = 0.72
	foreground_fog.anchor_bottom = 1.0
	foreground_fog.color = Color(0.58, 0.60, 0.62, 0.06)
	canvas.add_child(foreground_fog)
	return art_panel

func _build_task_scene_marker(text: String) -> Control:
	var marker := PanelContainer.new()
	marker.custom_minimum_size = Vector2(72, 28)
	marker.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.11, 0.10, 0.09, 0.74), Color(0.66, 0.54, 0.32, 0.34), 1, 2))
	var label := _build_text_label(text, 12)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_color_override("font_color", Color(0.84, 0.80, 0.68, 0.82))
	marker.add_child(label)
	return marker

func _build_task_chapter_progress_badge(text: String) -> Control:
	var badge := PanelContainer.new()
	badge.custom_minimum_size = Vector2(78, 78)
	badge.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.10, 0.08, 0.055, 0.92), Color(0.82, 0.66, 0.30, 0.82), 2, 39))
	var label := Label.new()
	label.text = text
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 20)
	label.add_theme_color_override("font_color", Color(0.98, 0.90, 0.62, 1.0))
	badge.add_child(label)
	return badge

func _build_task_chapter_task_panel(items: Array) -> PanelContainer:
	var shell := PanelContainer.new()
	shell.custom_minimum_size = Vector2(0, 460)
	shell.add_theme_stylebox_override("panel", _build_surface_panel_style(Color(0.040, 0.040, 0.046, 0.52), Color(0.36, 0.34, 0.34, 0.22), 1, 5))
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 12)
	margin.add_theme_constant_override("margin_top", 8)
	margin.add_theme_constant_override("margin_right", 12)
	margin.add_theme_constant_override("margin_bottom", 8)
	shell.add_child(margin)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 8)
	margin.add_child(column)
	var added := 0
	for item_variant in items:
		if not (item_variant is Dictionary):
			continue
		var task_row := _build_task_strip_item(item_variant as Dictionary)
		if task_row != null:
			task_row.custom_minimum_size = Vector2(0, 120)
			column.add_child(task_row)
			added += 1
	if added == 0:
		column.add_child(_build_text_label("当前没有章节任务。", 14))
	return shell

func _build_task_strip_item(item_payload: Dictionary) -> Control:
	var title := str(item_payload.get("title", "")).strip_edges()
	var progress := str(item_payload.get("value", "")).strip_edges()
	var reward := str(item_payload.get("meta", "")).strip_edges()
	var description := str(item_payload.get("description", "")).strip_edges()
	if title == "" and progress == "" and reward == "":
		return null
	var row_panel := PanelContainer.new()
	row_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row_panel.custom_minimum_size = Vector2(0, 112)
	row_panel.add_theme_stylebox_override("panel", _build_task_strip_row_style(str(item_payload.get("tone", "neutral")).strip_edges()))
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 11)
	margin.add_theme_constant_override("margin_top", 9)
	margin.add_theme_constant_override("margin_right", 11)
	margin.add_theme_constant_override("margin_bottom", 9)
	row_panel.add_child(margin)
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 12)
	margin.add_child(row)
	row.add_child(_build_task_strip_icon(str(item_payload.get("badge", "")).strip_edges(), str(item_payload.get("tone", "neutral")).strip_edges(), title))
	var text_column := VBoxContainer.new()
	text_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	text_column.add_theme_constant_override("separation", 7)
	row.add_child(text_column)
	var header := HBoxContainer.new()
	header.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_theme_constant_override("separation", 10)
	text_column.add_child(header)
	var title_label := Label.new()
	title_label.text = title
	title_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	title_label.add_theme_font_size_override("font_size", 19)
	title_label.add_theme_color_override("font_color", Color(0.96, 0.88, 0.62, 1.0))
	title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title_label)
	if progress != "":
		var progress_label := Label.new()
		progress_label.text = progress
		progress_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		progress_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		progress_label.add_theme_font_size_override("font_size", 16)
		progress_label.add_theme_color_override("font_color", Color(0.92, 0.30, 0.30, 0.98) if progress.find("/") >= 0 else Color(0.70, 0.72, 0.74, 0.96))
		progress_label.custom_minimum_size = Vector2(84, 0)
		header.add_child(progress_label)
	var rewards: Array = item_payload.get("rewards", []) as Array
	if not rewards.is_empty():
		text_column.add_child(_build_task_reward_chip_row(rewards))
	elif reward != "":
		var reward_label := Label.new()
		reward_label.text = reward
		reward_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		reward_label.add_theme_font_size_override("font_size", 14)
		reward_label.add_theme_color_override("font_color", Color(0.90, 0.82, 0.58, 0.98))
		text_column.add_child(reward_label)
	if description != "":
		var description_label := Label.new()
		description_label.text = description
		description_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		description_label.add_theme_font_size_override("font_size", 12)
		description_label.add_theme_color_override("font_color", Color(0.72, 0.72, 0.74, 0.94))
		text_column.add_child(description_label)
	var action_id := str(item_payload.get("action_id", "")).strip_edges()
	var action_label := str(item_payload.get("action_label", "前往")).strip_edges()
	if action_label != "":
		var button := Button.new()
		button.text = action_label
		button.custom_minimum_size = Vector2(94, 38)
		button.focus_mode = Control.FOCUS_NONE
		button.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		button.disabled = bool(item_payload.get("disabled", false)) or action_id == ""
		button.add_theme_font_size_override("font_size", 16)
		_apply_task_action_button_style(button)
		if action_id != "" and not button.disabled:
			button.pressed.connect(Callable(self, "_on_action_button_pressed").bind(action_id))
		row.add_child(button)
	return row_panel

func _apply_task_action_button_style(button: Button) -> void:
	button.add_theme_color_override("font_color", Color(0.18, 0.16, 0.13, 0.98))
	button.add_theme_color_override("font_hover_color", Color(0.12, 0.10, 0.08, 0.98))
	button.add_theme_color_override("font_pressed_color", Color(0.12, 0.10, 0.08, 0.98))
	button.add_theme_color_override("font_disabled_color", Color(0.54, 0.54, 0.56, 0.78))
	button.add_theme_stylebox_override("normal", _build_flat_panel_style(Color(0.86, 0.84, 0.77, 0.90), Color(0.56, 0.51, 0.42, 0.34), 1))
	button.add_theme_stylebox_override("hover", _build_flat_panel_style(Color(0.90, 0.88, 0.81, 0.94), Color(0.70, 0.62, 0.44, 0.48), 1))
	button.add_theme_stylebox_override("pressed", _build_flat_panel_style(Color(0.78, 0.75, 0.67, 0.92), Color(0.64, 0.56, 0.38, 0.52), 1))
	button.add_theme_stylebox_override("disabled", _build_flat_panel_style(Color(0.14, 0.14, 0.15, 0.70), Color(0.22, 0.22, 0.24, 0.70), 1))
	button.add_theme_stylebox_override("focus", StyleBoxEmpty.new())

func _build_task_reward_chip_row(rewards: Array) -> Control:
	var wrap := HBoxContainer.new()
	wrap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	wrap.add_theme_constant_override("separation", 5)
	var prefix := Label.new()
	prefix.text = "奖励"
	prefix.add_theme_font_size_override("font_size", 13)
	prefix.add_theme_color_override("font_color", Color(0.66, 0.66, 0.68, 0.84))
	wrap.add_child(prefix)
	for reward_variant in rewards:
		if not (reward_variant is Dictionary):
			continue
		var chip := _build_task_reward_chip(reward_variant as Dictionary)
		if chip != null:
			wrap.add_child(chip)
	return wrap

func _build_task_reward_chip(reward_payload: Dictionary) -> Control:
	var label_text := str(reward_payload.get("label", "")).strip_edges()
	var amount := str(reward_payload.get("amount", "")).strip_edges()
	if label_text == "" and amount == "":
		return null
	var chip := PanelContainer.new()
	chip.add_theme_stylebox_override("panel", _build_task_reward_chip_style(str(reward_payload.get("tone", "neutral")).strip_edges()))
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 6)
	margin.add_theme_constant_override("margin_top", 2)
	margin.add_theme_constant_override("margin_right", 6)
	margin.add_theme_constant_override("margin_bottom", 2)
	chip.add_child(margin)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 4)
	margin.add_child(row)
	var icon := PanelContainer.new()
	icon.custom_minimum_size = Vector2(10, 10)
	icon.add_theme_stylebox_override("panel", _build_task_reward_chip_icon_style(label_text))
	row.add_child(icon)
	var label := Label.new()
	label.text = (label_text + " " + amount).strip_edges()
	label.add_theme_font_size_override("font_size", 11)
	label.add_theme_color_override("font_color", Color(0.86, 0.84, 0.80, 0.92))
	row.add_child(label)
	return chip

func _build_task_reward_chip_style(tone: String) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.18, 0.17, 0.16, 0.58)
	style.border_color = _resolve_card_tone_color(tone).darkened(0.12)
	style.border_color.a = 0.34
	style.set_border_width_all(1)
	style.set_corner_radius_all(7)
	return style

func _build_task_reward_chip_icon_style(label_text: String) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.56, 0.44, 0.22, 0.78)
	if label_text.find("木") >= 0:
		style.bg_color = Color(0.30, 0.54, 0.28, 0.80)
	elif label_text.find("石") >= 0:
		style.bg_color = Color(0.56, 0.56, 0.58, 0.80)
	elif label_text.find("铁") >= 0:
		style.bg_color = Color(0.34, 0.50, 0.82, 0.80)
	elif label_text.find("粮") >= 0:
		style.bg_color = Color(0.76, 0.62, 0.28, 0.80)
	style.border_color = Color(0.96, 0.90, 0.72, 0.18)
	style.set_border_width_all(1)
	style.set_corner_radius_all(6)
	return style

func _build_task_strip_row_style(tone: String) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.21, 0.21, 0.23, 0.92)
	style.border_color = Color(0.34, 0.32, 0.30, 0.34)
	if tone != "" and tone != "neutral":
		style.border_color = style.border_color.lerp(_resolve_card_tone_color(tone), 0.18)
	style.set_border_width_all(1)
	style.set_border_width(SIDE_LEFT, 2)
	style.set_corner_radius_all(9)
	style.shadow_color = Color(0.0, 0.0, 0.0, 0.10)
	style.shadow_size = 3
	return style

func _build_task_strip_icon(text: String, tone: String, title: String = "") -> Control:
	var icon := PanelContainer.new()
	icon.custom_minimum_size = Vector2(136, 82)
	icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	icon.add_theme_stylebox_override("panel", _build_task_strip_icon_style(tone))
	var canvas := Control.new()
	canvas.custom_minimum_size = Vector2(136, 82)
	icon.add_child(canvas)
	canvas.add_child(_build_task_icon_layer(Vector2(18, 58), Vector2(100, 14), Color(0.18, 0.16, 0.12, 0.92), Color(0.70, 0.58, 0.34, 0.32)))
	canvas.add_child(_build_task_icon_layer(Vector2(32, 45), Vector2(76, 15), Color(0.28, 0.24, 0.16, 0.88), Color(0.84, 0.70, 0.38, 0.34)))
	canvas.add_child(_build_task_icon_layer(Vector2(48, 27), Vector2(42, 24), Color(0.20, 0.19, 0.18, 0.94), _resolve_card_tone_color(tone)))
	canvas.add_child(_build_task_icon_layer(Vector2(58, 12), Vector2(22, 20), Color(0.32, 0.28, 0.18, 0.90), Color(0.86, 0.70, 0.38, 0.42)))
	for offset in [Vector2(24, 34), Vector2(98, 34)]:
		canvas.add_child(_build_task_icon_layer(offset, Vector2(14, 28), Color(0.16, 0.14, 0.12, 0.84), Color(0.58, 0.48, 0.30, 0.28)))
	var image_label := Label.new()
	image_label.text = _resolve_task_icon_label(title, text)
	image_label.position = Vector2(51, 26)
	image_label.custom_minimum_size = Vector2(36, 28)
	image_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	image_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	image_label.add_theme_font_size_override("font_size", 23)
	image_label.add_theme_color_override("font_color", Color(0.98, 0.90, 0.62, 1.0))
	canvas.add_child(image_label)
	var badge_label := Label.new()
	badge_label.text = "任务 " + text if text != "" else "任务"
	badge_label.position = Vector2(8, 62)
	badge_label.custom_minimum_size = Vector2(120, 16)
	badge_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	badge_label.add_theme_font_size_override("font_size", 11)
	badge_label.add_theme_color_override("font_color", Color(0.82, 0.82, 0.78, 0.88))
	canvas.add_child(badge_label)
	return icon

func _build_task_icon_layer(pos: Vector2, size: Vector2, bg_color: Color, border_color: Color) -> Control:
	var layer := PanelContainer.new()
	layer.position = pos
	layer.custom_minimum_size = size
	layer.add_theme_stylebox_override("panel", _build_surface_panel_style(bg_color, border_color, 1, 2))
	return layer

func _resolve_task_icon_label(title: String, badge: String) -> String:
	if title.find("建造") >= 0:
		return "城"
	if title.find("土地") >= 0:
		return "地"
	if title.find("征兵") >= 0:
		return "兵"
	if title.find("章节") >= 0:
		return "奖"
	return badge if badge != "" else "任"

func _build_task_strip_icon_style(tone: String) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.14, 0.13, 0.11, 0.95)
	style.border_color = _resolve_card_tone_color(tone)
	style.set_border_width_all(1)
	style.set_corner_radius_all(4)
	return style

func _build_reading_list_block(block_payload: Dictionary) -> Control:
	var panel := _build_block_panel(block_payload)
	var column := panel.get_child(0).get_child(0) as VBoxContainer
	var items: Array = block_payload.get("items", []) as Array
	var added := 0
	for item_variant in items:
		if not (item_variant is Dictionary):
			continue
		var row := _build_reading_list_item(item_variant as Dictionary)
		if row != null:
			column.add_child(row)
			added += 1
	if added > 0:
		return panel
	column.add_child(_build_text_label("当前没有需要处理的记录。", 15 if _is_player_reading_mode() else 13))
	return panel

func _build_reading_list_item(item_payload: Dictionary) -> Control:
	var title := str(item_payload.get("title", "")).strip_edges()
	var value := str(item_payload.get("value", "")).strip_edges()
	var description := str(item_payload.get("description", "")).strip_edges()
	if title == "" and value == "" and description == "":
		return null
	var row_panel := PanelContainer.new()
	row_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row_panel.add_theme_stylebox_override("panel", _build_reading_list_style(str(item_payload.get("tone", "neutral")).strip_edges()))
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 14)
	margin.add_theme_constant_override("margin_top", 12)
	margin.add_theme_constant_override("margin_right", 14)
	margin.add_theme_constant_override("margin_bottom", 12)
	row_panel.add_child(margin)
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 14)
	margin.add_child(row)
	var badge_text := str(item_payload.get("badge", "")).strip_edges()
	if badge_text != "":
		row.add_child(_build_reading_list_badge(badge_text, str(item_payload.get("tone", "neutral")).strip_edges()))
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 6)
	row.add_child(column)
	var header := HBoxContainer.new()
	header.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_theme_constant_override("separation", 12)
	column.add_child(header)
	if title != "":
		var title_label := Label.new()
		title_label.text = title
		title_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		title_label.add_theme_font_size_override("font_size", 20 if _is_player_reading_mode() else 15)
		title_label.add_theme_color_override("font_color", Color(0.92, 0.90, 0.84, 1.0))
		title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		header.add_child(title_label)
	if value != "":
		var value_label := Label.new()
		value_label.text = value
		value_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		value_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		value_label.add_theme_font_size_override("font_size", 19 if _is_player_reading_mode() else 14)
		value_label.add_theme_color_override("font_color", Color(0.96, 0.94, 0.86, 0.98))
		value_label.custom_minimum_size = Vector2(180 if _is_player_reading_mode() else 120, 0)
		header.add_child(value_label)
	var meta := str(item_payload.get("meta", "")).strip_edges()
	if meta != "":
		var meta_label := Label.new()
		meta_label.text = meta
		meta_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		meta_label.add_theme_font_size_override("font_size", 15 if _is_player_reading_mode() else 12)
		meta_label.add_theme_color_override("font_color", Color(0.70, 0.70, 0.72, 0.94))
		column.add_child(meta_label)
	if description != "":
		var description_label := Label.new()
		description_label.text = description
		description_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		description_label.add_theme_font_size_override("font_size", 17 if _is_player_reading_mode() else 13)
		description_label.add_theme_color_override("font_color", Color(0.78, 0.78, 0.80, 0.96))
		description_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		column.add_child(description_label)
	return row_panel

func _build_reading_list_badge(text: String, tone: String) -> Control:
	var badge := PanelContainer.new()
	badge.custom_minimum_size = Vector2(52 if _is_player_reading_mode() else 42, 52 if _is_player_reading_mode() else 42)
	badge.add_theme_stylebox_override("panel", _build_reading_badge_style(tone))
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 4)
	margin.add_theme_constant_override("margin_top", 4)
	margin.add_theme_constant_override("margin_right", 4)
	margin.add_theme_constant_override("margin_bottom", 4)
	badge.add_child(margin)
	var label := Label.new()
	label.text = text
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 18 if _is_player_reading_mode() else 14)
	label.add_theme_color_override("font_color", Color(0.98, 0.94, 0.84, 1.0))
	margin.add_child(label)
	return badge

func _build_status_hero_block(block_payload: Dictionary) -> Control:
	var panel := _build_block_panel(block_payload)
	var column := panel.get_child(0).get_child(0) as VBoxContainer
	var payload: Dictionary = block_payload.get("payload", {}) as Dictionary
	var headline := str(payload.get("headline", "")).strip_edges()
	if headline != "":
		var headline_label := Label.new()
		headline_label.text = headline
		headline_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		headline_label.add_theme_font_size_override("font_size", 32 if _is_player_reading_mode() else 18)
		headline_label.add_theme_color_override("font_color", Color(0.96, 0.94, 0.88, 1.0))
		headline_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		column.add_child(headline_label)
	var subtitle := str(payload.get("subtitle", "")).strip_edges()
	if subtitle != "":
		var subtitle_label := Label.new()
		subtitle_label.text = subtitle
		subtitle_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		subtitle_label.add_theme_font_size_override("font_size", 16 if _is_player_reading_mode() else 13)
		subtitle_label.add_theme_color_override("font_color", Color(0.76, 0.76, 0.78, 0.95))
		subtitle_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		column.add_child(subtitle_label)
	var state := str(payload.get("state", "")).strip_edges()
	if state != "":
		var state_label := Label.new()
		state_label.text = state
		state_label.add_theme_font_size_override("font_size", 16 if _is_player_reading_mode() else 12)
		state_label.add_theme_color_override("font_color", Color(0.74, 0.94, 0.72, 0.96))
		column.add_child(state_label)
	var facts: Array = payload.get("facts", []) as Array
	if facts.is_empty():
		return panel
	var fact_row := HFlowContainer.new()
	fact_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	fact_row.add_theme_constant_override("h_separation", 10)
	fact_row.add_theme_constant_override("v_separation", 10)
	column.add_child(fact_row)
	for fact_variant in facts:
		if not (fact_variant is Dictionary):
			continue
		var fact := _build_status_fact(fact_variant as Dictionary)
		if fact != null:
			fact_row.add_child(fact)
	return panel

func _build_status_fact(fact_payload: Dictionary) -> Control:
	var value := str(fact_payload.get("value", "")).strip_edges()
	var label := str(fact_payload.get("label", "")).strip_edges()
	if value == "" and label == "":
		return null
	var fact := PanelContainer.new()
	fact.custom_minimum_size = Vector2(float(fact_payload.get("min_width", 160 if _is_player_reading_mode() else 150)), 0)
	fact.add_theme_stylebox_override("panel", _build_status_fact_style(str(fact_payload.get("tone", "neutral")).strip_edges()))
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 14)
	margin.add_theme_constant_override("margin_top", 10)
	margin.add_theme_constant_override("margin_right", 14)
	margin.add_theme_constant_override("margin_bottom", 10)
	fact.add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 4)
	margin.add_child(column)
	if label != "":
		var label_node := Label.new()
		label_node.text = label
		label_node.add_theme_font_size_override("font_size", 13 if _is_player_reading_mode() else 11)
		label_node.add_theme_color_override("font_color", Color(0.68, 0.68, 0.70, 0.95))
		column.add_child(label_node)
	if value != "":
		var value_node := Label.new()
		value_node.text = value
		value_node.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		value_node.add_theme_font_size_override("font_size", 19 if _is_player_reading_mode() else 14)
		value_node.add_theme_color_override("font_color", Color(0.94, 0.94, 0.95, 0.98))
		value_node.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		column.add_child(value_node)
	var meta := str(fact_payload.get("meta", "")).strip_edges()
	if meta != "":
		var meta_node := Label.new()
		meta_node.text = meta
		meta_node.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		meta_node.add_theme_font_size_override("font_size", 12)
		meta_node.add_theme_color_override("font_color", Color(0.62, 0.62, 0.64, 0.92))
		column.add_child(meta_node)
	return fact

func _build_chat_timeline_block(block_payload: Dictionary) -> Control:
	var panel := _build_block_panel(block_payload)
	var column := panel.get_child(0).get_child(0) as VBoxContainer
	var messages: Array = block_payload.get("messages", []) as Array
	for message_variant in messages:
		if not (message_variant is Dictionary):
			continue
		var bubble := _build_chat_timeline_message(message_variant as Dictionary)
		if bubble != null:
			column.add_child(bubble)
	if column.get_child_count() > 1:
		return panel
	column.add_child(_build_text_label("当前没有聊天内容。", 15 if _is_player_reading_mode() else 13))
	return panel

func _build_collapsible_chat_timeline_block(block_payload: Dictionary) -> Control:
	var panel := _build_block_panel(block_payload)
	var column := panel.get_child(0).get_child(0) as VBoxContainer
	var messages: Array = block_payload.get("messages", []) as Array
	var default_expanded := bool(block_payload.get("default_expanded", false))
	var expanded_label := "收起最近对话 · %s 条" % str(messages.size())
	var collapsed_label := "展开最近对话 · %s 条" % str(messages.size())
	var toggle := Button.new()
	toggle.text = expanded_label if default_expanded else collapsed_label
	toggle.custom_minimum_size = Vector2(220, 58 if _is_player_reading_mode() else 44)
	toggle.add_theme_font_size_override("font_size", 18 if _is_player_reading_mode() else 14)
	toggle.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	column.add_child(toggle)
	var message_column := VBoxContainer.new()
	message_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	message_column.add_theme_constant_override("separation", 8)
	message_column.visible = default_expanded
	column.add_child(message_column)
	for message_variant in messages:
		if not (message_variant is Dictionary):
			continue
		var bubble := _build_chat_timeline_message(message_variant as Dictionary)
		if bubble != null:
			message_column.add_child(bubble)
	if message_column.get_child_count() == 0:
		message_column.add_child(_build_text_label("当前没有聊天记忆。", 15 if _is_player_reading_mode() else 13))
	toggle.pressed.connect(_toggle_collapsible_chat_block.bind(toggle, message_column, expanded_label, collapsed_label))
	return panel

func _toggle_collapsible_chat_block(toggle: Button, message_column: Control, expanded_label: String, collapsed_label: String) -> void:
	if toggle == null or message_column == null:
		return
	message_column.visible = not message_column.visible
	toggle.text = expanded_label if message_column.visible else collapsed_label

func _build_chat_timeline_message(message_payload: Dictionary) -> Control:
	var body := str(message_payload.get("body", "")).strip_edges()
	if body == "":
		return null
	var align := str(message_payload.get("align", "left")).strip_edges()
	var is_player := align == "right"
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 12)
	if is_player:
		var left_spacer := Control.new()
		left_spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(left_spacer)
	var bubble := PanelContainer.new()
	bubble.custom_minimum_size = Vector2(float(message_payload.get("min_width", 620 if _is_player_reading_mode() else 480)), 0)
	bubble.size_flags_horizontal = Control.SIZE_SHRINK_END if is_player else Control.SIZE_SHRINK_BEGIN
	bubble.add_theme_stylebox_override(
		"panel",
		_build_chat_bubble_style(str(message_payload.get("tone", "neutral")).strip_edges(), is_player)
	)
	row.add_child(bubble)
	if not is_player:
		var right_spacer := Control.new()
		right_spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(right_spacer)
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 18)
	margin.add_theme_constant_override("margin_top", 14)
	margin.add_theme_constant_override("margin_right", 18)
	margin.add_theme_constant_override("margin_bottom", 14)
	bubble.add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	margin.add_child(column)
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 10)
	column.add_child(header)
	var name_label := Label.new()
	name_label.text = str(message_payload.get("name", "聊天")).strip_edges()
	name_label.add_theme_font_size_override("font_size", 17 if _is_player_reading_mode() else 14)
	name_label.add_theme_color_override("font_color", Color(0.95, 0.91, 0.78, 0.98) if is_player else Color(0.80, 0.86, 0.98, 0.98))
	header.add_child(name_label)
	var meta_label := Label.new()
	meta_label.text = str(message_payload.get("meta", "")).strip_edges()
	meta_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	meta_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	meta_label.add_theme_font_size_override("font_size", 14 if _is_player_reading_mode() else 12)
	meta_label.add_theme_color_override("font_color", Color(0.70, 0.70, 0.72, 0.92))
	header.add_child(meta_label)
	var body_label := Label.new()
	body_label.text = body
	body_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body_label.add_theme_font_size_override("font_size", 22 if _is_player_reading_mode() else 16)
	body_label.add_theme_color_override("font_color", Color(0.96, 0.96, 0.96, 0.98))
	body_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_child(body_label)
	var footer := str(message_payload.get("footer", "")).strip_edges()
	if footer != "":
		var footer_label := Label.new()
		footer_label.text = footer
		footer_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		footer_label.add_theme_font_size_override("font_size", 12)
		footer_label.add_theme_color_override("font_color", Color(0.64, 0.64, 0.66, 0.90))
		column.add_child(footer_label)
	return row

func _resolve_grid_columns(block_payload: Dictionary) -> int:
	if _body_stacked:
		return maxi(1, int(block_payload.get("mobile_columns", 1)))
	return maxi(1, int(block_payload.get("columns", 2)))

func _build_block_panel(block_payload: Dictionary) -> PanelContainer:
	var panel := PanelContainer.new()
	var node_name := str(block_payload.get("node_name", "")).strip_edges()
	if node_name != "":
		panel.name = node_name
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var style_box := StyleBoxFlat.new()
	var kind := str(block_payload.get("kind", "text_block")).strip_edges()
	if _is_content_first_mode() and kind != "text_block":
		style_box.bg_color = Color(0.040, 0.040, 0.046, 0.76)
		style_box.border_color = Color(0.46, 0.38, 0.24, 0.30)
	elif _is_player_reading_mode() and kind == "status_hero":
		style_box.bg_color = Color(0.050, 0.049, 0.058, 0.98)
		style_box.border_color = Color(0.76, 0.61, 0.32, 0.40)
	else:
		style_box.bg_color = Color(0.058, 0.058, 0.066, 0.96) if _is_player_reading_mode() else Color(0.12, 0.12, 0.14, 0.95)
		style_box.border_color = Color(0.34, 0.32, 0.28, 0.46) if _is_player_reading_mode() else Color(0.34, 0.34, 0.36, 0.92)
	style_box.set_border_width_all(1)
	style_box.set_corner_radius_all(6 if _is_player_reading_mode() else 4)
	panel.add_theme_stylebox_override("panel", style_box)
	var margin := MarginContainer.new()
	var block_margin := 14 if _is_content_first_mode() else 20 if _is_player_reading_mode() else 12
	margin.add_theme_constant_override("margin_left", block_margin)
	margin.add_theme_constant_override("margin_top", block_margin)
	margin.add_theme_constant_override("margin_right", block_margin)
	margin.add_theme_constant_override("margin_bottom", block_margin)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 12 if _is_player_reading_mode() else 6)
	margin.add_child(column)
	var title := str(block_payload.get("title", "")).strip_edges()
	if title != "":
		var title_label := Label.new()
		title_label.text = title
		title_label.add_theme_font_size_override("font_size", 21 if _is_player_reading_mode() else 15)
		title_label.add_theme_color_override("font_color", Color(0.94, 0.90, 0.78, 0.98) if _is_player_reading_mode() else Color(0.84, 0.84, 0.86, 0.98))
		title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		column.add_child(title_label)
	return panel

func _build_shared_state_chip(shared_state: Dictionary, field_spec: Variant) -> Control:
	var key_path := ""
	var label_text := ""
	if field_spec is String:
		key_path = str(field_spec).strip_edges()
		label_text = key_path
	elif field_spec is Dictionary:
		var field_payload := field_spec as Dictionary
		key_path = str(field_payload.get("key", "")).strip_edges()
		label_text = str(field_payload.get("label", key_path)).strip_edges()
	if key_path == "":
		return null
	var value: Variant = _read_shared_state_value(shared_state, key_path)
	var value_text: String = _stringify_shared_state_value(value)
	if value_text == "":
		return null
	var shell := PanelContainer.new()
	shell.custom_minimum_size = Vector2(188 if _is_player_reading_mode() else 164 if _body_stacked else 132, 0)
	shell.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var style_box := StyleBoxFlat.new()
	style_box.bg_color = Color(0.12, 0.12, 0.14, 0.94)
	style_box.border_color = Color(0.32, 0.32, 0.35, 0.92)
	style_box.set_border_width_all(1)
	style_box.set_corner_radius_all(4)
	shell.add_theme_stylebox_override("panel", style_box)
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 8)
	margin.add_theme_constant_override("margin_top", 6)
	margin.add_theme_constant_override("margin_right", 8)
	margin.add_theme_constant_override("margin_bottom", 6)
	shell.add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 4)
	margin.add_child(column)
	var title_label := Label.new()
	title_label.text = label_text
	title_label.add_theme_font_size_override("font_size", 14 if _is_player_reading_mode() else 12 if _body_stacked else 11)
	title_label.add_theme_color_override("font_color", Color(0.72, 0.72, 0.74, 0.94))
	column.add_child(title_label)
	var value_label := Label.new()
	value_label.text = value_text
	value_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	value_label.add_theme_font_size_override("font_size", 18 if _is_player_reading_mode() else 14 if _body_stacked else 13)
	value_label.add_theme_color_override("font_color", Color(0.94, 0.94, 0.95, 0.98))
	column.add_child(value_label)
	return shell

func _build_state_card(shared_state: Dictionary, raw_card: Variant) -> Control:
	if not (raw_card is Dictionary):
		return null
	var card_payload := raw_card as Dictionary
	var title_text := _resolve_card_text(shared_state, card_payload, "title")
	var value_text := _resolve_card_text(shared_state, card_payload, "value")
	var meta_text := _resolve_card_text(shared_state, card_payload, "meta")
	var description_text := _resolve_card_text(shared_state, card_payload, "description")
	var footer_text := _resolve_card_text(shared_state, card_payload, "footer")
	var image_path := _resolve_card_text(shared_state, card_payload, "image_path")
	if title_text == "" and value_text == "" and meta_text == "" and description_text == "" and footer_text == "" and image_path == "":
		return null
	var shell := PanelContainer.new()
	shell.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var default_min_width := 188 if _is_player_reading_mode() else 148
	shell.custom_minimum_size = Vector2(float(max(default_min_width, int(card_payload.get("min_width", default_min_width)))), 0.0)
	var style_box := StyleBoxFlat.new()
	style_box.bg_color = Color(0.11, 0.11, 0.13, 0.97) if _is_player_reading_mode() else Color(0.12, 0.12, 0.14, 0.95)
	style_box.border_color = _resolve_card_tone_color(str(card_payload.get("tone", "neutral")).strip_edges())
	style_box.set_border_width_all(1)
	shell.add_theme_stylebox_override("panel", style_box)

	var margin := MarginContainer.new()
	var card_margin := 16 if _is_player_reading_mode() else 10
	margin.add_theme_constant_override("margin_left", card_margin)
	margin.add_theme_constant_override("margin_top", card_margin)
	margin.add_theme_constant_override("margin_right", card_margin)
	margin.add_theme_constant_override("margin_bottom", card_margin)
	shell.add_child(margin)

	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 9 if _is_player_reading_mode() else 6)
	margin.add_child(column)

	if image_path != "":
		var texture := _load_card_image_texture(image_path)
		if texture != null:
			var image := TextureRect.new()
			image.texture = texture
			var default_image_size := 104 if _is_player_reading_mode() else 72 if _body_stacked else 56
			var image_size := int(card_payload.get("image_size", default_image_size))
			image.custom_minimum_size = Vector2(image_size, image_size)
			image.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
			image.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
			image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
			image.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
			column.add_child(image)
	if title_text != "":
		var title_label := Label.new()
		title_label.text = title_text
		title_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		title_label.add_theme_font_size_override("font_size", 16 if _is_player_reading_mode() else 12 if _body_stacked else 11)
		title_label.add_theme_color_override("font_color", Color(0.74, 0.74, 0.76, 0.96))
		column.add_child(title_label)
	if value_text != "":
		var value_label := Label.new()
		value_label.text = value_text
		value_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		value_label.add_theme_font_size_override("font_size", 25 if _is_player_reading_mode() else 17 if _body_stacked else 16)
		value_label.add_theme_color_override("font_color", Color(0.94, 0.94, 0.95, 0.98))
		value_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		column.add_child(value_label)
	if meta_text != "":
		var meta_label := Label.new()
		meta_label.text = meta_text
		meta_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		meta_label.add_theme_font_size_override("font_size", 17 if _is_player_reading_mode() else 13 if _body_stacked else 12)
		meta_label.add_theme_color_override("font_color", Color(0.82, 0.82, 0.84, 0.96))
		meta_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		column.add_child(meta_label)
	if description_text != "":
		var description_label := Label.new()
		description_label.text = description_text
		description_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		description_label.add_theme_font_size_override("font_size", 17 if _is_player_reading_mode() else 13 if _body_stacked else 12)
		description_label.add_theme_color_override("font_color", Color(0.74, 0.74, 0.76, 0.96))
		description_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		column.add_child(description_label)
	if footer_text != "":
		var footer_label := Label.new()
		footer_label.text = footer_text
		footer_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		footer_label.add_theme_font_size_override("font_size", 11)
		footer_label.add_theme_color_override("font_color", Color(0.66, 0.66, 0.68, 0.94))
		footer_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		column.add_child(footer_label)
	return shell

func _load_card_image_texture(path: String) -> Texture2D:
	var normalized_path := path.strip_edges()
	if normalized_path == "" or not FileAccess.file_exists(normalized_path):
		return null
	var image := Image.new()
	var error := image.load(normalized_path)
	if error != OK:
		return null
	return ImageTexture.create_from_image(image)

func _build_atlas_texture_rect(path: String, region: Rect2, position: Vector2, size: Vector2, modulate: Color) -> TextureRect:
	var source: Texture2D = null
	if path.begins_with("res://"):
		var resource := ResourceLoader.load(path)
		if resource is Texture2D:
			source = resource
	if source == null:
		source = _load_card_image_texture(path)
	if source == null:
		return null
	var atlas := AtlasTexture.new()
	atlas.atlas = source
	atlas.region = region
	var image := TextureRect.new()
	image.texture = atlas
	image.position = position
	image.size = size
	image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	image.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	image.modulate = modulate
	return image

func _resolve_card_text(shared_state: Dictionary, card_payload: Dictionary, field_name: String) -> String:
	var key_name := "%s_key" % field_name
	if card_payload.has(key_name):
		var key_path := str(card_payload.get(key_name, "")).strip_edges()
		if key_path == "":
			return ""
		return _stringify_card_field(_read_shared_state_value(shared_state, key_path), field_name)
	if not card_payload.has(field_name):
		return ""
	return _stringify_card_field(card_payload.get(field_name, null), field_name)

func _stringify_card_field(value: Variant, field_name: String) -> String:
	if value == null:
		return ""
	if value is Array:
		var parts: Array[String] = []
		for item in value as Array:
			var text := _stringify_shared_state_value(item)
			if text != "":
				parts.append(text)
		if parts.is_empty():
			return ""
		return "\n".join(parts.slice(0, min(parts.size(), 3))) if field_name == "description" or field_name == "footer" else " / ".join(parts.slice(0, min(parts.size(), 3)))
	if value is Dictionary and (field_name == "description" or field_name == "footer"):
		var dictionary_value := value as Dictionary
		if dictionary_value.has("summary"):
			return str(dictionary_value.get("summary", "")).strip_edges()
		if dictionary_value.has("label"):
			return str(dictionary_value.get("label", "")).strip_edges()
	return _stringify_shared_state_value(value)

func _resolve_card_tone_color(tone: String) -> Color:
	match tone:
		"blue":
			return Color(0.28, 0.52, 0.88, 0.94)
		"green":
			return Color(0.38, 0.62, 0.42, 0.94)
		"red":
			return Color(0.74, 0.28, 0.24, 0.94)
		"gold":
			return Color(0.72, 0.58, 0.28, 0.94)
		_:
			return Color(0.34, 0.34, 0.36, 0.92)

func _build_reading_list_style(tone: String) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.07, 0.07, 0.09, 0.82)
	style.border_color = _resolve_card_tone_color(tone)
	style.border_width_left = 4
	style.border_width_top = 0
	style.border_width_right = 0
	style.border_width_bottom = 0
	style.set_corner_radius_all(6)
	return style

func _build_reading_badge_style(tone: String) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = _resolve_card_tone_color(tone)
	style.border_color = Color(0.0, 0.0, 0.0, 0.0)
	style.set_border_width_all(0)
	style.set_corner_radius_all(6)
	return style

func _build_status_fact_style(tone: String) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.07, 0.07, 0.09, 0.76)
	style.border_color = _resolve_card_tone_color(tone)
	style.border_width_left = 3
	style.border_width_top = 0
	style.border_width_right = 0
	style.border_width_bottom = 0
	style.set_corner_radius_all(6)
	return style

func _build_chat_bubble_style(tone: String, is_player: bool) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	match tone:
		"blue":
			style.bg_color = Color(0.07, 0.10, 0.15, 0.96)
			style.border_color = Color(0.28, 0.52, 0.88, 0.74)
		"green":
			style.bg_color = Color(0.07, 0.13, 0.10, 0.96)
			style.border_color = Color(0.38, 0.62, 0.42, 0.74)
		"gold":
			style.bg_color = Color(0.17, 0.13, 0.08, 0.96)
			style.border_color = Color(0.72, 0.58, 0.28, 0.78)
		_:
			style.bg_color = Color(0.10, 0.10, 0.12, 0.96)
			style.border_color = Color(0.38, 0.38, 0.42, 0.68)
	if is_player and tone != "gold":
		style.bg_color = Color(0.17, 0.13, 0.08, 0.96)
		style.border_color = Color(0.72, 0.58, 0.28, 0.78)
	style.border_width_left = 4
	style.border_width_top = 1
	style.border_width_right = 1
	style.border_width_bottom = 1
	style.set_corner_radius_all(8)
	return style

func _read_shared_state_value(shared_state: Dictionary, key_path: String) -> Variant:
	var current: Variant = shared_state
	for segment_variant in key_path.split("."):
		var segment := str(segment_variant).strip_edges()
		if segment == "":
			continue
		if current is Dictionary:
			current = (current as Dictionary).get(segment, null)
		else:
			return null
	return current

func _stringify_shared_state_value(value: Variant) -> String:
	if value == null:
		return ""
	if value is String:
		return str(value).strip_edges()
	if value is bool:
		return "是" if bool(value) else "否"
	if value is int or value is float:
		return str(value)
	if value is Array:
		var array_value := value as Array
		return str(array_value.size())
	if value is Dictionary:
		var dictionary_value := value as Dictionary
		if dictionary_value.has("unitId"):
			return str(dictionary_value.get("unitId", "")).strip_edges()
		if dictionary_value.has("tileId"):
			return str(dictionary_value.get("tileId", "")).strip_edges()
		if dictionary_value.has("summary"):
			return str(dictionary_value.get("summary", "")).strip_edges()
		return "%s 项" % str(dictionary_value.size())
	return str(value).strip_edges()

func _clear_children(node: Node) -> void:
	for child in node.get_children():
		node.remove_child(child)
		child.queue_free()

func _coerce_string_array(raw_value: Variant) -> Array[String]:
	var result: Array[String] = []
	if raw_value is Array:
		for item in raw_value as Array:
			var text := str(item).strip_edges()
			if text != "":
				result.append(text)
	return result

func _on_action_button_pressed(action_id: String) -> void:
	action_requested.emit(action_id)
