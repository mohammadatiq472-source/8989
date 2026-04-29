extends Control
class_name MainChatOverlay

signal close_requested

const DEFAULT_AI_PLAYER_ID := "player_operator_alpha"
const SECONDARY_AI_PLAYER_ID := "player_operator_beta"
const DEFAULT_FACTION_ID := "player"
const DEFAULT_GOVERNOR_PLAYER_ID := "human_alpha"
const CHAT_PANEL_MAX_WIDTH := 820.0
const CHAT_PANEL_MIN_WIDTH := 380.0
const CHAT_MOBILE_BREAKPOINT := 640.0
const CHAT_COMPACT_LANDSCAPE_MAX_WIDTH := 1024.0
const CHAT_COMPACT_LANDSCAPE_MAX_HEIGHT := 620.0
const CHAT_COMPACT_PANEL_MAX_WIDTH := 620.0
const CHAT_PANEL_MOBILE_MARGIN := 8.0
const CHAT_PANEL_TOP_MARGIN := 8.0
const CHAT_PANEL_DESKTOP_WIDTH_RATIO := 0.54
const CHAT_RAIL_DESKTOP_WIDTH := 148.0
const CHAT_RAIL_MOBILE_WIDTH := 104.0
const CHAT_TOUCH_TARGET_MIN_HEIGHT := 48.0
const CHAT_CLOSE_BUTTON_SIZE := Vector2(112, 52)
const CHAT_CLOSE_BUTTON_FONT_SIZE := 22
const CHAT_KEYBOARD_SAFE_AREA_MAX_RATIO := 0.46
const CHAT_COMPOSER_MIN_HEIGHT := 50.0
const CHAT_COMPOSER_MAX_HEIGHT := 118.0
const CHAT_AVATAR_SIZE := 46.0
const AI_CHAT_PORTRAIT_MANIFEST := "res://data/ai_chat_portraits.json"

const BASE_CHANNELS := [
	{"id": "world", "label": "事件"},
	{"id": "state", "label": "本周"},
	{"id": "alliance", "label": "同盟"},
]

const FALLBACK_AI_CHANNELS := [
	{"id": DEFAULT_AI_PLAYER_ID, "label": "青州后勤官", "aiPlayerId": DEFAULT_AI_PLAYER_ID},
	{"id": SECONDARY_AI_PLAYER_ID, "label": "兖州斥候官", "aiPlayerId": SECONDARY_AI_PLAYER_ID},
]

const SYSTEM_CHANNEL := {"id": "system", "label": "系统"}

const FALLBACK_CHANNELS := [
	{"id": "world", "label": "事件"},
	{"id": "state", "label": "本周"},
	{"id": "alliance", "label": "同盟"},
	{"id": DEFAULT_AI_PLAYER_ID, "label": "青州后勤官", "aiPlayerId": DEFAULT_AI_PLAYER_ID, "factionId": DEFAULT_FACTION_ID, "governorPlayerId": DEFAULT_GOVERNOR_PLAYER_ID},
	{"id": SECONDARY_AI_PLAYER_ID, "label": "兖州斥候官", "aiPlayerId": SECONDARY_AI_PLAYER_ID, "factionId": DEFAULT_FACTION_ID, "governorPlayerId": DEFAULT_GOVERNOR_PLAYER_ID},
	{"id": "system", "label": "系统"},
]

const FALLBACK_MESSAGES := [
	{"kind": "player", "name": "总督", "body": "青州后勤官，保留一半木材，剩下交给我。"},
	{"kind": "ai", "name": "青州后勤官", "body": "我已完成一轮周边巡查：九原要塞附近出现敌方动向，建议先保留木材用于补兵，再把可调拨部分送到总督收件箱。"},
	{"kind": "ai", "name": "青州后勤官", "body": "后端未连接时显示本地预览；连接后会读取正式 AI 聊天频道。"},
]

const MAILBOX_FILTER_ALL := "all"
const MAILBOX_FILTER_AI_TRANSFER := "ai_resource_transfer"
const MAILBOX_FILTER_DAILY := "daily_welfare"
const MAILBOX_FILTER_EVENT := "event_reward"

const MESSAGE_FILTER_ALL := "all"
const MESSAGE_FILTER_COMMAND := "command"
const MESSAGE_FILTER_PROPOSAL := "proposal"
const MESSAGE_FILTER_RECEIPT := "receipt"
const MESSAGE_FILTER_FAILURE := "failure"

const MESSAGE_FILTERS := [
	{"id": MESSAGE_FILTER_ALL, "label": "全部"},
	{"id": MESSAGE_FILTER_COMMAND, "label": "命令"},
	{"id": MESSAGE_FILTER_PROPOSAL, "label": "提案"},
	{"id": MESSAGE_FILTER_RECEIPT, "label": "回执"},
	{"id": MESSAGE_FILTER_FAILURE, "label": "失败"},
]

var _api_client = null
var _messages: Array = []
var _channels: Array = FALLBACK_CHANNELS.duplicate(true)
var _ai_players: Array = []
var _active_channel_id := DEFAULT_AI_PLAYER_ID
var _active_ai_player_id := DEFAULT_AI_PLAYER_ID
var _active_faction_id := DEFAULT_FACTION_ID
var _active_governor_player_id := DEFAULT_GOVERNOR_PLAYER_ID
var _active_proposal_id := ""
var _channel_buttons: Dictionary = {}
var _channel_message_counts: Dictionary = {}
var _channel_seen_counts: Dictionary = {}
var _mailbox_items: Array = []
var _mailbox_filter := MAILBOX_FILTER_ALL
var _mailbox_filter_buttons: Dictionary = {}
var _history_counts: Dictionary = {}
var _history_has_more := false
var _history_next_before_message_id := ""
var _message_filter := MESSAGE_FILTER_ALL
var _message_filter_buttons: Dictionary = {}
var _channel_list: VBoxContainer
var _message_list: VBoxContainer
var _message_scroll: ScrollContainer
var _mailbox_list: VBoxContainer
var _input: TextEdit
var _keyboard_spacer: Control
var _debug_keyboard_height_for_evidence := 0.0
var _last_chat_failure_signature := ""
var _ai_chat_portrait_assignments: Dictionary = {}
var _title_label: Label
var _subtitle_label: Label
var _status_label: Label
var _history_status_label: Label
var _load_earlier_button: Button
var _mailbox_button: Button
var _mailbox_status_label: Label
var _mailbox_popup: PanelContainer
var _mailbox_popup_list: VBoxContainer
var _mailbox_popup_status_label: Label
var _proposal_detail_popup: PanelContainer
var _proposal_detail_title: Label
var _proposal_detail_body: Label
var _proposal_detail_status_label: Label
var _proposal_detail_retry_button: Button
var _proposal_detail_failure_button: Button
var _proposal_detail_retry_text := ""
var _claim_toast: PanelContainer
var _claim_toast_label: Label
var _claim_toast_hide_timer: Timer
var _chat_panel: PanelContainer
var _channel_rail: Control

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_PASS
	_load_ai_chat_portrait_manifest()
	_messages = FALLBACK_MESSAGES.duplicate(true)
	set_process(true)
	_build_overlay()
	visible = false

func _process(_delta: float) -> void:
	_apply_responsive_overlay_layout()
	_update_keyboard_safe_area()

func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED and is_inside_tree():
		_apply_responsive_overlay_layout()

func _is_mobile_chat_layout() -> bool:
	var viewport_size := get_viewport_rect().size
	if viewport_size.x <= 0.0:
		return false
	if viewport_size.x < CHAT_MOBILE_BREAKPOINT:
		return true
	return _is_compact_landscape_chat_layout()

func _is_compact_landscape_chat_layout() -> bool:
	var viewport_size := get_viewport_rect().size
	return viewport_size.x >= CHAT_MOBILE_BREAKPOINT and viewport_size.x <= CHAT_COMPACT_LANDSCAPE_MAX_WIDTH and viewport_size.y <= CHAT_COMPACT_LANDSCAPE_MAX_HEIGHT

func _load_ai_chat_portrait_manifest() -> void:
	_ai_chat_portrait_assignments.clear()
	if not FileAccess.file_exists(AI_CHAT_PORTRAIT_MANIFEST):
		return
	var raw := FileAccess.get_file_as_string(AI_CHAT_PORTRAIT_MANIFEST)
	if FileAccess.get_open_error() != OK or raw.strip_edges() == "":
		return
	var parsed = JSON.parse_string(raw)
	if not (parsed is Dictionary):
		return
	var manifest := parsed as Dictionary
	var assignments_value = manifest.get("assignments", {})
	if assignments_value is Dictionary:
		for key in (assignments_value as Dictionary).keys():
			var portrait_path := str((assignments_value as Dictionary).get(key, "")).strip_edges()
			if portrait_path != "":
				_ai_chat_portrait_assignments[str(key).strip_edges()] = portrait_path
	var players_value = manifest.get("players", {})
	if players_value is Dictionary:
		for key in (players_value as Dictionary).keys():
			var player_value = (players_value as Dictionary).get(key, {})
			if player_value is Dictionary:
				var path := str((player_value as Dictionary).get("portraitPath", "")).strip_edges()
				if path != "":
					_ai_chat_portrait_assignments[str(key).strip_edges()] = path
	var portrait_paths: Array[String] = []
	var portraits_value = manifest.get("portraits", [])
	if portraits_value is Array:
		for portrait_value in portraits_value as Array:
			if not (portrait_value is Dictionary):
				continue
			var portrait := portrait_value as Dictionary
			if not bool(portrait.get("selectable", true)):
				continue
			var image_path := str(portrait.get("image", portrait.get("portraitPath", ""))).strip_edges()
			if image_path == "":
				continue
			portrait_paths.append(image_path)
			var portrait_id := str(portrait.get("id", "")).strip_edges()
			if portrait_id != "":
				_ai_chat_portrait_assignments[portrait_id] = image_path
			var display_name := str(portrait.get("display_name", "")).strip_edges()
			if display_name != "":
				_ai_chat_portrait_assignments[display_name] = image_path
	if not portrait_paths.is_empty():
		if not _ai_chat_portrait_assignments.has(DEFAULT_AI_PLAYER_ID):
			_ai_chat_portrait_assignments[DEFAULT_AI_PLAYER_ID] = portrait_paths[0]
		if not _ai_chat_portrait_assignments.has("青州后勤官"):
			_ai_chat_portrait_assignments["青州后勤官"] = portrait_paths[0]
	if portrait_paths.size() > 1:
		if not _ai_chat_portrait_assignments.has(SECONDARY_AI_PLAYER_ID):
			_ai_chat_portrait_assignments[SECONDARY_AI_PLAYER_ID] = portrait_paths[1]
		if not _ai_chat_portrait_assignments.has("兖州斥候官"):
			_ai_chat_portrait_assignments["兖州斥候官"] = portrait_paths[1]

func _resolve_chat_panel_width() -> float:
	var viewport_width := get_viewport_rect().size.x
	if viewport_width <= 0.0:
		return CHAT_PANEL_MAX_WIDTH
	if viewport_width < CHAT_MOBILE_BREAKPOINT:
		return maxf(1.0, viewport_width - CHAT_PANEL_MOBILE_MARGIN * 2.0)
	if _is_mobile_chat_layout():
		return minf(CHAT_COMPACT_PANEL_MAX_WIDTH, maxf(CHAT_PANEL_MIN_WIDTH, viewport_width * CHAT_PANEL_DESKTOP_WIDTH_RATIO))
	return minf(CHAT_PANEL_MAX_WIDTH, maxf(CHAT_PANEL_MIN_WIDTH, viewport_width * CHAT_PANEL_DESKTOP_WIDTH_RATIO))

func _resolve_chat_panel_left() -> float:
	return CHAT_PANEL_MOBILE_MARGIN if _is_mobile_chat_layout() else 0.0

func _resolve_chat_panel_bottom_offset() -> float:
	return -CHAT_PANEL_MOBILE_MARGIN

func _resolve_channel_rail_width() -> float:
	return CHAT_RAIL_MOBILE_WIDTH if _is_mobile_chat_layout() else CHAT_RAIL_DESKTOP_WIDTH

func _apply_responsive_overlay_layout() -> void:
	if _chat_panel != null and is_instance_valid(_chat_panel):
		var panel_left := _resolve_chat_panel_left()
		_chat_panel.offset_left = panel_left
		_chat_panel.offset_top = CHAT_PANEL_TOP_MARGIN
		_chat_panel.offset_right = panel_left + _resolve_chat_panel_width()
		_chat_panel.offset_bottom = _resolve_chat_panel_bottom_offset()
	if _channel_rail != null and is_instance_valid(_channel_rail):
		_channel_rail.custom_minimum_size = Vector2(_resolve_channel_rail_width(), 0)

func _read_virtual_keyboard_height() -> float:
	if _debug_keyboard_height_for_evidence > 0.0:
		return _debug_keyboard_height_for_evidence
	if not _is_mobile_chat_layout():
		return 0.0
	if _input == null or not _input.has_focus():
		return 0.0
	return float(DisplayServer.virtual_keyboard_get_height())

func _update_keyboard_safe_area() -> void:
	if _keyboard_spacer == null:
		return
	var keyboard_height := _read_virtual_keyboard_height()
	var safe_height := 0.0
	if keyboard_height > 0.0:
		var viewport_height := get_viewport_rect().size.y
		safe_height = min(keyboard_height, viewport_height * CHAT_KEYBOARD_SAFE_AREA_MAX_RATIO)
	if abs(_keyboard_spacer.custom_minimum_size.y - safe_height) <= 1.0:
		return
	_keyboard_spacer.visible = safe_height > 0.0
	_keyboard_spacer.custom_minimum_size = Vector2(0, safe_height)
	if safe_height > 0.0:
		call_deferred("_scroll_messages_to_bottom")

func _scroll_messages_to_bottom() -> void:
	if _message_scroll == null:
		return
	var bar := _message_scroll.get_v_scroll_bar()
	if bar == null:
		return
	bar.value = bar.max_value

func _set_debug_keyboard_height_for_evidence(height: float) -> void:
	_debug_keyboard_height_for_evidence = max(0.0, height)
	_update_keyboard_safe_area()

func configure(api_client) -> void:
	_api_client = api_client
	if is_inside_tree():
		call_deferred("_refresh_runtime_views")

func open_ai_player_channel(ai_player_id: String = "") -> void:
	var normalized_ai_player_id := ai_player_id.strip_edges()
	var channel := _find_channel_by_ai_player_id(normalized_ai_player_id)
	if channel.is_empty():
		channel = _find_channel(_active_channel_id)
	if channel.is_empty():
		channel = _find_channel(DEFAULT_AI_PLAYER_ID)
	if channel.is_empty():
		return
	var channel_id := str(channel.get("id", "")).strip_edges()
	if channel_id != "":
		_active_channel_id = channel_id
	_apply_active_identity(channel)
	_sync_active_channel_header()
	_refresh_channel_buttons()
	_set_status("已打开聊天频道")
	visible = true
	if _input != null:
		_input.call_deferred("grab_focus")
	call_deferred("_refresh_active_chat_for_open_channel")

func close_overlay() -> void:
	visible = false
	if _input != null:
		_input.release_focus()
	close_requested.emit()

func _refresh_active_chat_for_open_channel() -> void:
	if _find_channel(_active_channel_id).has("aiPlayerId"):
		await _refresh_chat()
		await _refresh_mailbox()

func _refresh_runtime_views() -> void:
	await _refresh_identity()
	await _refresh_chat()
	await _refresh_mailbox()

func _build_overlay() -> void:
	var chat_panel := PanelContainer.new()
	_chat_panel = chat_panel
	chat_panel.name = "ChatPanel"
	chat_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	chat_panel.anchor_left = 0.0
	chat_panel.anchor_top = 0.0
	chat_panel.anchor_right = 0.0
	chat_panel.anchor_bottom = 1.0
	chat_panel.offset_left = _resolve_chat_panel_left()
	chat_panel.offset_top = CHAT_PANEL_TOP_MARGIN
	chat_panel.offset_right = _resolve_chat_panel_left() + _resolve_chat_panel_width()
	chat_panel.offset_bottom = _resolve_chat_panel_bottom_offset()
	chat_panel.add_theme_stylebox_override("panel", _make_panel_style(Color(0.05, 0.06, 0.06, 0.58), Color(0.55, 0.48, 0.38, 0.22), 0))
	add_child(chat_panel)

	var root_margin := MarginContainer.new()
	root_margin.add_theme_constant_override("margin_left", 0)
	root_margin.add_theme_constant_override("margin_top", 8)
	root_margin.add_theme_constant_override("margin_right", 10)
	root_margin.add_theme_constant_override("margin_bottom", 8)
	chat_panel.add_child(root_margin)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	root_margin.add_child(row)

	row.add_child(_build_channel_rail())
	row.add_child(_build_chat_body())
	_refresh_channel_buttons()
	_render_messages()
	add_child(_build_mailbox_popup())
	add_child(_build_proposal_detail_popup())
	add_child(_build_claim_toast())

func _build_channel_rail() -> Control:
	var rail := PanelContainer.new()
	_channel_rail = rail
	rail.custom_minimum_size = Vector2(_resolve_channel_rail_width(), 0)
	rail.add_theme_stylebox_override("panel", _make_panel_style(Color(0.10, 0.11, 0.11, 0.46), Color(0.80, 0.72, 0.58, 0.14), 0))

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 8)
	margin.add_theme_constant_override("margin_top", 12)
	margin.add_theme_constant_override("margin_right", 8)
	margin.add_theme_constant_override("margin_bottom", 12)
	rail.add_child(margin)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	margin.add_child(column)

	var title := Label.new()
	title.text = "聊天"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 22)
	title.add_theme_color_override("font_color", Color(0.96, 0.91, 0.78, 1.0))
	column.add_child(title)

	var scroll := ScrollContainer.new()
	_message_scroll = scroll
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	column.add_child(scroll)

	_channel_list = VBoxContainer.new()
	_channel_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_channel_list.add_theme_constant_override("separation", 4)
	scroll.add_child(_channel_list)
	_render_channel_buttons()

	_mailbox_button = Button.new()
	_mailbox_button.text = "通用收件箱"
	_mailbox_button.focus_mode = Control.FOCUS_NONE
	_mailbox_button.custom_minimum_size = Vector2(0, 42)
	_mailbox_button.add_theme_color_override("font_color", Color(1.0, 0.86, 0.52, 1.0))
	_mailbox_button.pressed.connect(_on_mailbox_pressed)
	column.add_child(_mailbox_button)
	return rail

func _build_chat_body() -> Control:
	var body := VBoxContainer.new()
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 8)

	var header := VBoxContainer.new()
	header.add_theme_constant_override("separation", 2)
	body.add_child(header)

	var title_row := HBoxContainer.new()
	title_row.add_theme_constant_override("separation", 8)
	header.add_child(title_row)

	var title_column := VBoxContainer.new()
	title_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_column.add_theme_constant_override("separation", 2)
	title_row.add_child(title_column)

	_title_label = Label.new()
	_title_label.text = "青州后勤官"
	_title_label.add_theme_font_size_override("font_size", 20)
	_title_label.add_theme_color_override("font_color", Color(0.96, 0.91, 0.78, 1.0))
	title_column.add_child(_title_label)

	_subtitle_label = Label.new()
	_subtitle_label.text = "AI 频道 / 直接下达自然语言命令"
	_subtitle_label.add_theme_font_size_override("font_size", 13)
	_subtitle_label.add_theme_color_override("font_color", Color(0.82, 0.78, 0.68, 0.9))
	title_column.add_child(_subtitle_label)

	var close_button := Button.new()
	close_button.name = "CloseButton"
	close_button.text = "返回地图"
	close_button.tooltip_text = "关闭聊天频道，返回地图"
	close_button.focus_mode = Control.FOCUS_NONE
	close_button.custom_minimum_size = CHAT_CLOSE_BUTTON_SIZE
	close_button.add_theme_font_size_override("font_size", CHAT_CLOSE_BUTTON_FONT_SIZE)
	close_button.pressed.connect(close_overlay)
	title_row.add_child(close_button)

	_status_label = Label.new()
	_status_label.text = "等待后端连接"
	_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status_label.add_theme_font_size_override("font_size", 13)
	_status_label.add_theme_color_override("font_color", Color(0.84, 0.76, 0.58, 0.96))
	header.add_child(_status_label)

	body.add_child(_build_history_filter_bar())

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.add_theme_stylebox_override("panel", _make_panel_style(Color(0.03, 0.03, 0.03, 0.10), Color(0.7, 0.62, 0.50, 0.14), 4))
	body.add_child(scroll)

	_message_list = VBoxContainer.new()
	_message_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_message_list.add_theme_constant_override("separation", 8)
	scroll.add_child(_message_list)

	var composer: BoxContainer
	var mobile_composer := _is_mobile_chat_layout()
	if mobile_composer:
		composer = VBoxContainer.new()
	else:
		composer = HBoxContainer.new()
	composer.add_theme_constant_override("separation", 8)
	body.add_child(composer)

	_input = TextEdit.new()
	_input.placeholder_text = "输入给当前 AI 的命令"
	_input.text = "输送 11 木材到总督的通用收件箱。"
	_input.custom_minimum_size = Vector2(88, CHAT_COMPOSER_MIN_HEIGHT)
	_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_input.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	_input.scroll_fit_content_height = false
	_input.add_theme_font_size_override("font_size", 16)
	_input.focus_entered.connect(_on_chat_input_focus_changed)
	_input.focus_exited.connect(_on_chat_input_focus_changed)
	_input.text_changed.connect(_on_chat_input_text_changed)
	_input.gui_input.connect(_on_chat_input_gui_input)
	composer.add_child(_input)

	var action_row := HBoxContainer.new()
	if mobile_composer:
		action_row.add_theme_constant_override("separation", 8)
		var action_spacer := Control.new()
		action_spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		action_row.add_child(action_spacer)
		composer.add_child(action_row)
	else:
		action_row = composer as HBoxContainer

	var patrol_button := Button.new()
	patrol_button.text = "巡查"
	patrol_button.tooltip_text = "让当前 AI 主动巡查并回报"
	patrol_button.focus_mode = Control.FOCUS_NONE
	patrol_button.custom_minimum_size = Vector2(52, CHAT_TOUCH_TARGET_MIN_HEIGHT)
	patrol_button.pressed.connect(_request_ai_patrol_tick)
	action_row.add_child(patrol_button)

	var voice_button := Button.new()
	voice_button.text = "语音"
	voice_button.focus_mode = Control.FOCUS_NONE
	voice_button.custom_minimum_size = Vector2(44, CHAT_TOUCH_TARGET_MIN_HEIGHT)
	voice_button.pressed.connect(_on_voice_input_pressed)
	action_row.add_child(voice_button)

	var send_button := Button.new()
	send_button.text = "发送"
	send_button.custom_minimum_size = Vector2(52, CHAT_TOUCH_TARGET_MIN_HEIGHT)
	send_button.pressed.connect(_send_current_input)
	action_row.add_child(send_button)

	_keyboard_spacer = Control.new()
	_keyboard_spacer.name = "KeyboardSafeAreaSpacer"
	_keyboard_spacer.visible = false
	_keyboard_spacer.custom_minimum_size = Vector2(0, 0)
	body.add_child(_keyboard_spacer)

	var mailbox_block := _build_mailbox_block()
	mailbox_block.visible = not _is_compact_landscape_chat_layout()
	body.add_child(mailbox_block)
	return body

func _build_history_filter_bar() -> Control:
	var filter_panel := PanelContainer.new()
	filter_panel.add_theme_stylebox_override("panel", _make_panel_style(Color(0.06, 0.06, 0.05, 0.48), Color(0.75, 0.66, 0.48, 0.18), 4))

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 8)
	margin.add_theme_constant_override("margin_top", 6)
	margin.add_theme_constant_override("margin_right", 8)
	margin.add_theme_constant_override("margin_bottom", 6)
	filter_panel.add_child(margin)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 4)
	margin.add_child(column)

	var row := GridContainer.new()
	row.columns = 6 if _is_compact_landscape_chat_layout() else (3 if _is_mobile_chat_layout() else 6)
	row.add_theme_constant_override("h_separation", 6)
	row.add_theme_constant_override("v_separation", 6)
	column.add_child(row)

	_message_filter_buttons.clear()
	for filter_variant in MESSAGE_FILTERS:
		var filter := filter_variant as Dictionary
		var filter_id := str(filter.get("id", MESSAGE_FILTER_ALL)).strip_edges()
		var button := Button.new()
		button.text = _format_message_filter_button_text(filter)
		button.focus_mode = Control.FOCUS_NONE
		button.custom_minimum_size = Vector2(58, CHAT_TOUCH_TARGET_MIN_HEIGHT)
		button.pressed.connect(_set_message_filter.bind(filter_id))
		row.add_child(button)
		_message_filter_buttons[filter_id] = button

	_load_earlier_button = Button.new()
	_load_earlier_button.text = "更早"
	_load_earlier_button.focus_mode = Control.FOCUS_NONE
	_load_earlier_button.custom_minimum_size = Vector2(58, CHAT_TOUCH_TARGET_MIN_HEIGHT)
	_load_earlier_button.pressed.connect(_load_earlier_chat_history)
	row.add_child(_load_earlier_button)

	_history_status_label = Label.new()
	_history_status_label.text = "这里主要用于下达命令；提案和回执只作轻量追踪。"
	_history_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_history_status_label.add_theme_font_size_override("font_size", 12)
	_history_status_label.add_theme_color_override("font_color", Color(0.82, 0.78, 0.68, 0.92))
	_history_status_label.visible = not _is_compact_landscape_chat_layout()
	column.add_child(_history_status_label)
	_refresh_message_filter_buttons()
	return filter_panel

func _build_mailbox_block() -> Control:
	var mailbox := PanelContainer.new()
	mailbox.add_theme_stylebox_override("panel", _make_panel_style(Color(0.10, 0.08, 0.04, 0.62), Color(0.95, 0.72, 0.38, 0.34), 5))

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 10)
	margin.add_theme_constant_override("margin_top", 8)
	margin.add_theme_constant_override("margin_right", 10)
	margin.add_theme_constant_override("margin_bottom", 8)
	mailbox.add_child(margin)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 6)
	margin.add_child(column)

	var title := Label.new()
	title.text = "通用收件箱"
	title.add_theme_font_size_override("font_size", 13)
	title.add_theme_color_override("font_color", Color(1.0, 0.86, 0.52, 1.0))
	column.add_child(title)

	_mailbox_status_label = Label.new()
	_mailbox_status_label.text = "承接 AI 输送资源、每日福利和活动奖励。"
	_mailbox_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_mailbox_status_label.add_theme_font_size_override("font_size", 12)
	_mailbox_status_label.add_theme_color_override("font_color", Color(0.98, 0.94, 0.84, 0.92))
	column.add_child(_mailbox_status_label)

	_mailbox_list = VBoxContainer.new()
	_mailbox_list.add_theme_constant_override("separation", 4)
	column.add_child(_mailbox_list)
	return mailbox

func _build_mailbox_popup() -> Control:
	_mailbox_popup = PanelContainer.new()
	_mailbox_popup.name = "UnifiedInboxPopup"
	_mailbox_popup.visible = false
	_mailbox_popup.z_index = 40
	_mailbox_popup.mouse_filter = Control.MOUSE_FILTER_STOP
	_mailbox_popup.anchor_left = 0.22
	_mailbox_popup.anchor_top = 0.10
	_mailbox_popup.anchor_right = 0.92
	_mailbox_popup.anchor_bottom = 0.88
	_mailbox_popup.offset_left = 0.0
	_mailbox_popup.offset_top = 0.0
	_mailbox_popup.offset_right = 0.0
	_mailbox_popup.offset_bottom = 0.0
	_mailbox_popup.add_theme_stylebox_override("panel", _make_panel_style(Color(0.06, 0.06, 0.05, 0.94), Color(0.95, 0.72, 0.38, 0.48), 6))

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 14)
	margin.add_theme_constant_override("margin_top", 12)
	margin.add_theme_constant_override("margin_right", 14)
	margin.add_theme_constant_override("margin_bottom", 12)
	_mailbox_popup.add_child(margin)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	margin.add_child(column)

	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 8)
	column.add_child(header)

	var title := Label.new()
	title.text = "通用收件箱"
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.add_theme_font_size_override("font_size", 18)
	title.add_theme_color_override("font_color", Color(1.0, 0.88, 0.55, 1.0))
	header.add_child(title)

	var close_button := Button.new()
	close_button.text = "关闭"
	close_button.focus_mode = Control.FOCUS_NONE
	close_button.pressed.connect(_close_mailbox_popup)
	header.add_child(close_button)

	_mailbox_popup_status_label = Label.new()
	_mailbox_popup_status_label.text = "正在同步收件箱"
	_mailbox_popup_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_mailbox_popup_status_label.add_theme_font_size_override("font_size", 12)
	_mailbox_popup_status_label.add_theme_color_override("font_color", Color(0.98, 0.94, 0.84, 0.92))
	column.add_child(_mailbox_popup_status_label)

	var filter_row := HBoxContainer.new()
	filter_row.add_theme_constant_override("separation", 6)
	column.add_child(filter_row)
	_add_mailbox_filter_button(filter_row, MAILBOX_FILTER_ALL, "全部")
	_add_mailbox_filter_button(filter_row, MAILBOX_FILTER_AI_TRANSFER, "AI 输送")
	_add_mailbox_filter_button(filter_row, MAILBOX_FILTER_DAILY, "每日")
	_add_mailbox_filter_button(filter_row, MAILBOX_FILTER_EVENT, "活动")

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	column.add_child(scroll)

	_mailbox_popup_list = VBoxContainer.new()
	_mailbox_popup_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_mailbox_popup_list.add_theme_constant_override("separation", 6)
	scroll.add_child(_mailbox_popup_list)
	_refresh_mailbox_filter_buttons()
	return _mailbox_popup

func _build_proposal_detail_popup() -> Control:
	_proposal_detail_popup = PanelContainer.new()
	_proposal_detail_popup.name = "ProposalDetailPopup"
	_proposal_detail_popup.visible = false
	_proposal_detail_popup.z_index = 45
	_proposal_detail_popup.mouse_filter = Control.MOUSE_FILTER_STOP
	if _is_mobile_chat_layout():
		_proposal_detail_popup.anchor_left = 0.04
		_proposal_detail_popup.anchor_top = 0.08
		_proposal_detail_popup.anchor_right = 0.96
		_proposal_detail_popup.anchor_bottom = 0.88
	else:
		_proposal_detail_popup.anchor_left = 0.26
		_proposal_detail_popup.anchor_top = 0.18
		_proposal_detail_popup.anchor_right = 0.88
		_proposal_detail_popup.anchor_bottom = 0.78
	_proposal_detail_popup.offset_left = 0.0
	_proposal_detail_popup.offset_top = 0.0
	_proposal_detail_popup.offset_right = 0.0
	_proposal_detail_popup.offset_bottom = 0.0
	_proposal_detail_popup.add_theme_stylebox_override("panel", _make_panel_style(Color(0.05, 0.06, 0.07, 0.96), Color(0.42, 0.57, 0.72, 0.46), 6))

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 14)
	margin.add_theme_constant_override("margin_top", 12)
	margin.add_theme_constant_override("margin_right", 14)
	margin.add_theme_constant_override("margin_bottom", 12)
	_proposal_detail_popup.add_child(margin)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	margin.add_child(column)

	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 8)
	column.add_child(header)

	_proposal_detail_title = Label.new()
	_proposal_detail_title.text = "提案详情"
	_proposal_detail_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_proposal_detail_title.add_theme_font_size_override("font_size", 20)
	_proposal_detail_title.add_theme_color_override("font_color", Color(0.88, 0.94, 1.0, 1.0))
	header.add_child(_proposal_detail_title)

	var close_button := Button.new()
	close_button.text = "关闭"
	close_button.focus_mode = Control.FOCUS_NONE
	close_button.pressed.connect(_close_proposal_detail_popup)
	header.add_child(close_button)

	var scroll := ScrollContainer.new()
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	column.add_child(scroll)

	_proposal_detail_body = Label.new()
	_proposal_detail_body.custom_minimum_size = Vector2(0, 0)
	_proposal_detail_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_proposal_detail_body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_proposal_detail_body.add_theme_font_size_override("font_size", 16)
	_proposal_detail_body.add_theme_color_override("font_color", Color(0.95, 0.97, 1.0, 0.96))
	scroll.add_child(_proposal_detail_body)

	_proposal_detail_status_label = Label.new()
	_proposal_detail_status_label.text = "状态提示：等待选择提案。"
	_proposal_detail_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_proposal_detail_status_label.add_theme_font_size_override("font_size", 14)
	_proposal_detail_status_label.add_theme_color_override("font_color", Color(0.82, 0.88, 0.96, 0.92))
	column.add_child(_proposal_detail_status_label)

	var action_row := HBoxContainer.new()
	action_row.add_theme_constant_override("separation", 8)
	column.add_child(action_row)

	_proposal_detail_failure_button = Button.new()
	_proposal_detail_failure_button.text = "查看失败历史"
	_proposal_detail_failure_button.focus_mode = Control.FOCUS_NONE
	_proposal_detail_failure_button.pressed.connect(_show_failure_history_from_detail)
	action_row.add_child(_proposal_detail_failure_button)

	_proposal_detail_retry_button = Button.new()
	_proposal_detail_retry_button.text = "填入恢复命令"
	_proposal_detail_retry_button.focus_mode = Control.FOCUS_NONE
	_proposal_detail_retry_button.pressed.connect(_fill_retry_command_from_detail)
	action_row.add_child(_proposal_detail_retry_button)
	return _proposal_detail_popup

func _build_claim_toast() -> Control:
	_claim_toast = PanelContainer.new()
	_claim_toast.name = "ClaimReceiptToast"
	_claim_toast.visible = false
	_claim_toast.z_index = 70
	_claim_toast.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_claim_toast.anchor_left = 0.16
	_claim_toast.anchor_top = 0.05
	_claim_toast.anchor_right = 0.60
	_claim_toast.anchor_bottom = 0.05
	_claim_toast.offset_left = 0.0
	_claim_toast.offset_top = 0.0
	_claim_toast.offset_right = 0.0
	_claim_toast.offset_bottom = 76.0
	_claim_toast.add_theme_stylebox_override("panel", _make_panel_style(Color(0.03, 0.20, 0.10, 0.94), Color(0.36, 0.90, 0.48, 0.70), 6))

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 14)
	margin.add_theme_constant_override("margin_top", 10)
	margin.add_theme_constant_override("margin_right", 14)
	margin.add_theme_constant_override("margin_bottom", 10)
	_claim_toast.add_child(margin)

	_claim_toast_label = Label.new()
	_claim_toast_label.text = "资源已到账"
	_claim_toast_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_claim_toast_label.add_theme_font_size_override("font_size", 15)
	_claim_toast_label.add_theme_color_override("font_color", Color(0.86, 1.0, 0.76, 1.0))
	margin.add_child(_claim_toast_label)

	_claim_toast_hide_timer = Timer.new()
	_claim_toast_hide_timer.one_shot = true
	_claim_toast_hide_timer.wait_time = 4.2
	_claim_toast_hide_timer.timeout.connect(_hide_claim_toast)
	_claim_toast.add_child(_claim_toast_hide_timer)
	return _claim_toast

func _add_mailbox_filter_button(row: HBoxContainer, filter_id: String, label: String) -> void:
	var button := Button.new()
	button.text = label
	button.focus_mode = Control.FOCUS_NONE
	button.pressed.connect(_set_mailbox_filter.bind(filter_id))
	row.add_child(button)
	_mailbox_filter_buttons[filter_id] = button

func _refresh_identity() -> void:
	if _api_client == null:
		_use_fallback_identity()
		return

	var response: Dictionary = await _api_client.get_ai_players("", false)
	if not bool(response.get("ok", false)):
		_use_fallback_identity()
		_set_status("AI 玩家列表读取失败，使用本地默认频道：%s" % _extract_error_text(response))
		return

	var data: Dictionary = response.get("data", {}) as Dictionary
	var items: Array = data.get("items", []) as Array
	var channels: Array = BASE_CHANNELS.duplicate(true)
	var discovered_players: Array = []
	for raw_item in items:
		if raw_item is Dictionary:
			var player := raw_item as Dictionary
			var ai_player_id := str(player.get("aiPlayerId", "")).strip_edges()
			if ai_player_id == "":
				continue
			var display_name := str(player.get("displayName", ai_player_id)).strip_edges()
			if display_name == "":
				display_name = ai_player_id
			var faction_id := str(player.get("factionId", DEFAULT_FACTION_ID)).strip_edges()
			if faction_id == "":
				faction_id = DEFAULT_FACTION_ID
			var governor_player_id := str(player.get("governorPlayerId", DEFAULT_GOVERNOR_PLAYER_ID)).strip_edges()
			if governor_player_id == "":
				governor_player_id = DEFAULT_GOVERNOR_PLAYER_ID
			var channel := {
				"id": ai_player_id,
				"label": display_name,
				"aiPlayerId": ai_player_id,
				"factionId": faction_id,
				"governorPlayerId": governor_player_id,
				"avatarId": str(player.get("avatarId", "")).strip_edges(),
				"avatarImagePath": str(player.get("avatarImagePath", "")).strip_edges(),
			}
			discovered_players.append(channel)
			channels.append(channel)

	if discovered_players.is_empty():
		_use_fallback_identity()
		_set_status("后端没有返回 AI 玩家，使用本地默认频道")
		return

	channels.append(SYSTEM_CHANNEL.duplicate(true))
	_ai_players = discovered_players
	_channels = channels

	var active_channel := _find_channel(_active_channel_id)
	if active_channel.is_empty() or not active_channel.has("aiPlayerId"):
		active_channel = discovered_players[0] as Dictionary
		_active_channel_id = str(active_channel.get("id", DEFAULT_AI_PLAYER_ID))
	_apply_active_identity(active_channel)
	_render_channel_buttons()
	_sync_active_channel_header()
	await _refresh_channel_message_counts()

func _use_fallback_identity() -> void:
	_channels = FALLBACK_CHANNELS.duplicate(true)
	_ai_players = FALLBACK_AI_CHANNELS.duplicate(true)
	if _find_channel(_active_channel_id).is_empty():
		_active_channel_id = DEFAULT_AI_PLAYER_ID
	var active_channel := _find_channel(_active_channel_id)
	if active_channel.is_empty():
		active_channel = _find_channel(DEFAULT_AI_PLAYER_ID)
		_active_channel_id = DEFAULT_AI_PLAYER_ID
	_apply_active_identity(active_channel)
	_render_channel_buttons()
	_sync_active_channel_header()

func _render_channel_buttons() -> void:
	if _channel_list == null:
		return
	for child in _channel_list.get_children():
		child.queue_free()
	_channel_buttons.clear()
	for channel in _channels:
		if not (channel is Dictionary):
			continue
		var channel_dict := channel as Dictionary
		var channel_id := str(channel_dict.get("id", "")).strip_edges()
		if channel_id == "":
			continue
		var button := Button.new()
		button.text = _format_channel_button_text(channel_dict)
		button.focus_mode = Control.FOCUS_NONE
		button.custom_minimum_size = Vector2(0, 54)
		button.pressed.connect(_on_channel_pressed.bind(channel_id))
		_channel_list.add_child(button)
		_channel_buttons[channel_id] = button
	_refresh_channel_buttons()

func _format_channel_button_text(channel: Dictionary) -> String:
	var channel_id := str(channel.get("id", "")).strip_edges()
	var label := str(channel.get("label", channel_id)).strip_edges()
	if label == "":
		label = channel_id
	if not channel.has("aiPlayerId"):
		return label
	var unread := _resolve_channel_unread(str(channel.get("aiPlayerId", channel_id)))
	if unread <= 0:
		return label
	return "%s %d" % [label, unread]

func _resolve_channel_unread(ai_player_id: String) -> int:
	var normalized_ai_player_id := ai_player_id.strip_edges()
	if normalized_ai_player_id == "":
		return 0
	var count := int(_channel_message_counts.get(normalized_ai_player_id, 0))
	var seen := int(_channel_seen_counts.get(normalized_ai_player_id, count))
	return maxi(0, count - seen)

func _refresh_channel_message_counts() -> void:
	if _api_client == null:
		return
	for channel in _ai_players:
		if not (channel is Dictionary):
			continue
		var channel_dict := channel as Dictionary
		var ai_player_id := str(channel_dict.get("aiPlayerId", "")).strip_edges()
		if ai_player_id == "":
			continue
		var reader_id := str(channel_dict.get("governorPlayerId", _active_governor_player_id)).strip_edges()
		if reader_id == "":
			reader_id = DEFAULT_GOVERNOR_PLAYER_ID
		var response: Dictionary = await _api_client.get_ai_player_chat_read_cursor(ai_player_id, reader_id)
		if not bool(response.get("ok", false)):
			response = await _api_client.get_ai_player_chat_messages(ai_player_id, 1, reader_id)
			if not bool(response.get("ok", false)):
				continue
		var data: Dictionary = response.get("data", {}) as Dictionary
		var channel_payload: Dictionary = data.get("channel", {}) as Dictionary
		var read_cursor: Dictionary = data.get("readCursor", {}) as Dictionary
		var message_count := int(read_cursor.get("messageCount", channel_payload.get("messageCount", data.get("count", 0))))
		var read_message_count := int(read_cursor.get("readMessageCount", message_count))
		_channel_message_counts[ai_player_id] = message_count
		_channel_seen_counts[ai_player_id] = read_message_count
	_refresh_channel_buttons()

func _find_channel(channel_id: String) -> Dictionary:
	var normalized_channel_id := channel_id.strip_edges()
	for channel in _channels:
		if channel is Dictionary and str((channel as Dictionary).get("id", "")).strip_edges() == normalized_channel_id:
			return channel as Dictionary
	return {}

func _apply_active_identity(channel: Dictionary) -> void:
	if not channel.has("aiPlayerId"):
		return
	_active_ai_player_id = str(channel.get("aiPlayerId", DEFAULT_AI_PLAYER_ID)).strip_edges()
	if _active_ai_player_id == "":
		_active_ai_player_id = DEFAULT_AI_PLAYER_ID
	_active_faction_id = str(channel.get("factionId", DEFAULT_FACTION_ID)).strip_edges()
	if _active_faction_id == "":
		_active_faction_id = DEFAULT_FACTION_ID
	_active_governor_player_id = str(channel.get("governorPlayerId", DEFAULT_GOVERNOR_PLAYER_ID)).strip_edges()
	if _active_governor_player_id == "":
		_active_governor_player_id = DEFAULT_GOVERNOR_PLAYER_ID

func _sync_active_channel_header() -> void:
	var channel := _find_channel(_active_channel_id)
	if _title_label != null:
		_title_label.text = str(channel.get("label", "聊天"))
	if _subtitle_label != null:
		if channel.has("aiPlayerId"):
			_subtitle_label.text = "AI 巡查频道 / 定期激活 / 总督 %s" % _active_governor_player_id
		else:
			_subtitle_label.text = "主界面聊天 / 真人频道 / AI 命令请切到具体 AI"

func _render_messages() -> void:
	if _message_list == null:
		return
	for child in _message_list.get_children():
		child.queue_free()

	var visible_messages := _filter_messages_for_active_view()
	for message in visible_messages:
		_message_list.add_child(_build_message_card(message))
	if visible_messages.is_empty():
		_message_list.add_child(_build_empty_history_card())
	_refresh_message_filter_buttons()
	_update_history_filter_status(visible_messages.size())
	call_deferred("_scroll_messages_to_bottom")

func _set_message_filter(filter_id: String) -> void:
	var normalized_filter := filter_id.strip_edges()
	if normalized_filter == "":
		normalized_filter = MESSAGE_FILTER_ALL
	_message_filter = normalized_filter
	if _api_client != null and _find_channel(_active_channel_id).has("aiPlayerId"):
		await _refresh_chat()
	else:
		_render_messages()

func _filter_messages_for_active_view() -> Array:
	var filtered: Array = []
	for message_variant in _messages:
		if not (message_variant is Dictionary):
			continue
		var message: Dictionary = message_variant as Dictionary
		if _message_matches_active_filter(message):
			filtered.append(message)
	return filtered

func _message_matches_active_filter(message: Dictionary) -> bool:
	return _message_matches_filter(message, _message_filter)

func _message_matches_filter(message: Dictionary, filter_id: String) -> bool:
	match filter_id:
		MESSAGE_FILTER_COMMAND:
			return _is_command_message(message)
		MESSAGE_FILTER_PROPOSAL:
			return str(message.get("kind", "")).strip_edges() == "proposal"
		MESSAGE_FILTER_RECEIPT:
			return str(message.get("kind", "")).strip_edges() == "receipt"
		MESSAGE_FILTER_FAILURE:
			return _is_failure_message(message)
		_:
			return true

func _is_command_message(message: Dictionary) -> bool:
	var kind := str(message.get("kind", "")).strip_edges()
	if kind == "player":
		return true
	var author_type := str(message.get("authorType", "")).strip_edges()
	return kind == "message" and author_type == "governor"

func _is_failure_message(message: Dictionary) -> bool:
	var metadata: Dictionary = message.get("metadata", {}) as Dictionary
	var failure_code := _clean_optional_text(message.get("failureCode", metadata.get("failureCode", "")))
	if failure_code != "":
		return true
	var kind := str(message.get("kind", "")).strip_edges()
	if kind == "receipt" and not bool(message.get("receiptOk", false)):
		return true
	if kind == "proposal" and str(metadata.get("status", "")).strip_edges() == "failed":
		return true
	return false

func _build_empty_history_card() -> Control:
	return _build_message_card({
		"kind": "system",
		"name": "筛选",
		"body": "当前筛选没有匹配记录。可切回全部，或发送新的自然语言命令生成提案。",
	})

func _refresh_message_filter_buttons() -> void:
	for filter_id_variant in _message_filter_buttons.keys():
		var filter_id := str(filter_id_variant).strip_edges()
		var button := _message_filter_buttons[filter_id] as Button
		if button == null:
			continue
		button.text = _format_message_filter_button_text(_find_message_filter(filter_id))
		if filter_id == _message_filter:
			button.add_theme_color_override("font_color", Color(1.0, 0.88, 0.55, 1.0))
		else:
			button.add_theme_color_override("font_color", Color(0.92, 0.90, 0.84, 0.92))
	if _load_earlier_button != null:
		_load_earlier_button.disabled = _api_client == null or not _history_has_more or _history_next_before_message_id == ""
		_load_earlier_button.add_theme_color_override(
			"font_color",
			Color(0.92, 0.90, 0.84, 0.92) if not _load_earlier_button.disabled else Color(0.62, 0.58, 0.50, 0.72)
		)

func _update_history_filter_status(visible_count: int) -> void:
	if _history_status_label == null:
		return
	if _message_filter == MESSAGE_FILTER_ALL:
		_history_status_label.text = "这里主要用于下达命令；提案和回执只作轻量追踪，完整统计留在 AI 管理页。"
		return
	_history_status_label.text = "%s记录：%d 条；完整统计留在 AI 管理页。" % [
		_format_message_filter_label(_message_filter),
		visible_count,
	]

func _format_message_filter_button_text(filter: Dictionary) -> String:
	var filter_id := str(filter.get("id", MESSAGE_FILTER_ALL)).strip_edges()
	var label := str(filter.get("label", _format_message_filter_label(filter_id))).strip_edges()
	return label

func _format_message_filter_label(filter_id: String) -> String:
	match filter_id:
		MESSAGE_FILTER_COMMAND:
			return "命令"
		MESSAGE_FILTER_PROPOSAL:
			return "提案"
		MESSAGE_FILTER_RECEIPT:
			return "回执"
		MESSAGE_FILTER_FAILURE:
			return "失败"
		_:
			return "全部"

func _find_message_filter(filter_id: String) -> Dictionary:
	var normalized_filter := filter_id.strip_edges()
	for filter_variant in MESSAGE_FILTERS:
		var filter := filter_variant as Dictionary
		if str(filter.get("id", "")).strip_edges() == normalized_filter:
			return filter
	return {"id": MESSAGE_FILTER_ALL, "label": "全部"}

func _count_messages_for_filter(filter_id: String) -> int:
	if not _history_counts.is_empty() and _history_counts.has(filter_id):
		return int(_history_counts.get(filter_id, 0))
	var count := 0
	for message_variant in _messages:
		if message_variant is Dictionary and _message_matches_filter(message_variant as Dictionary, filter_id):
			count += 1
	return count

func _load_earlier_chat_history() -> void:
	if _api_client == null:
		_set_status("后端未连接，无法加载更早历史")
		return
	if not _history_has_more or _history_next_before_message_id == "":
		_set_status("当前筛选没有更早记录")
		return
	await _refresh_chat(_history_next_before_message_id, true)

func _build_message_card(message: Dictionary) -> Control:
	var kind := str(message.get("kind", "system")).strip_edges()
	if kind == "system":
		var system_row := HBoxContainer.new()
		system_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var left_spacer := Control.new()
		left_spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		system_row.add_child(left_spacer)
		system_row.add_child(_build_message_bubble_panel(message, true, false))
		var right_spacer := Control.new()
		right_spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		system_row.add_child(right_spacer)
		return system_row

	var is_player := _message_is_player_bubble(message)
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 8)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 3)
	column.custom_minimum_size = Vector2(_resolve_message_bubble_width(), 0)

	var name_label := Label.new()
	name_label.text = _format_message_display_name(message, is_player)
	name_label.add_theme_color_override("font_color", Color(0.90, 0.84, 0.68, 0.96))
	name_label.add_theme_font_size_override("font_size", 12)
	name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT if is_player else HORIZONTAL_ALIGNMENT_LEFT
	column.add_child(name_label)

	column.add_child(_build_message_bubble_panel(message, false, is_player))

	if is_player:
		var left_fill := Control.new()
		left_fill.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(left_fill)
		row.add_child(column)
		row.add_child(_build_chat_avatar(message, true))
	else:
		row.add_child(_build_chat_avatar(message, false))
		row.add_child(column)
		var right_fill := Control.new()
		right_fill.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(right_fill)
	return row

func _build_message_bubble_panel(message: Dictionary, is_system_center: bool, is_player: bool) -> PanelContainer:
	var card := PanelContainer.new()
	var kind := str(message.get("kind", "system")).strip_edges()
	card.custom_minimum_size = Vector2(_resolve_message_bubble_width() * (0.92 if is_system_center else 1.0), 0)
	var palette := _message_bubble_palette(message, is_system_center, is_player)
	card.add_theme_stylebox_override("panel", _make_panel_style(palette.get("bg", Color(0.12, 0.12, 0.10, 0.72)), palette.get("border", Color(0.8, 0.7, 0.5, 0.25)), 9))

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 12)
	margin.add_theme_constant_override("margin_top", 8)
	margin.add_theme_constant_override("margin_right", 12)
	margin.add_theme_constant_override("margin_bottom", 8)
	card.add_child(margin)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 4)
	margin.add_child(column)

	if is_system_center:
		var name_label := Label.new()
		name_label.text = str(message.get("name", "系统")).strip_edges()
		name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		name_label.add_theme_color_override("font_color", Color(0.95, 0.88, 0.68, 1.0))
		name_label.add_theme_font_size_override("font_size", 12)
		column.add_child(name_label)

	var body_label := Label.new()
	body_label.text = str(message.get("body", ""))
	body_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body_label.add_theme_color_override("font_color", Color(0.98, 0.96, 0.90, 1.0))
	body_label.add_theme_font_size_override("font_size", 14 if is_system_center else 16)
	column.add_child(body_label)

	var meta_text := _format_message_meta_text(message)
	if meta_text != "":
		var meta_label := Label.new()
		meta_label.text = meta_text
		meta_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		meta_label.add_theme_color_override("font_color", Color(0.82, 0.78, 0.68, 0.96))
		meta_label.add_theme_font_size_override("font_size", 13)
		column.add_child(meta_label)

	if kind == "proposal":
		var proposal_id := str(message.get("proposalId", "")).strip_edges()
		if proposal_id != "":
			_active_proposal_id = proposal_id
		var action_row := HBoxContainer.new()
		action_row.add_theme_constant_override("separation", 8)
		column.add_child(action_row)
		var approve := Button.new()
		approve.text = "批准执行"
		approve.focus_mode = Control.FOCUS_NONE
		approve.custom_minimum_size = Vector2(96, CHAT_TOUCH_TARGET_MIN_HEIGHT)
		approve.disabled = proposal_id == "" or _api_client == null
		approve.pressed.connect(_approve_and_execute_proposal.bind(proposal_id))
		action_row.add_child(approve)
		var detail := Button.new()
		detail.text = "详情"
		detail.focus_mode = Control.FOCUS_NONE
		detail.custom_minimum_size = Vector2(72, CHAT_TOUCH_TARGET_MIN_HEIGHT)
		detail.pressed.connect(_show_proposal_detail.bind(message))
		action_row.add_child(detail)
	elif kind == "receipt":
		var receipt_row := HBoxContainer.new()
		receipt_row.add_theme_constant_override("separation", 8)
		column.add_child(receipt_row)
		var receipt_detail := Button.new()
		receipt_detail.text = "回执详情"
		receipt_detail.focus_mode = Control.FOCUS_NONE
		receipt_detail.custom_minimum_size = Vector2(96, CHAT_TOUCH_TARGET_MIN_HEIGHT)
		receipt_detail.pressed.connect(_show_receipt_detail.bind(message))
		receipt_row.add_child(receipt_detail)
	return card

func _message_is_player_bubble(message: Dictionary) -> bool:
	var kind := str(message.get("kind", "")).strip_edges()
	var author_type := str(message.get("authorType", "")).strip_edges()
	return kind == "player" or author_type == "governor"

func _resolve_message_bubble_width() -> float:
	var available_width := _resolve_chat_panel_width() - _resolve_channel_rail_width() - 72.0
	return max(188.0, min(520.0, available_width * 0.88))

func _message_bubble_palette(message: Dictionary, is_system_center: bool, is_player: bool) -> Dictionary:
	var kind := str(message.get("kind", "system")).strip_edges()
	if is_player:
		return {"bg": Color(0.10, 0.16, 0.22, 0.82), "border": Color(0.48, 0.64, 0.82, 0.38)}
	if kind == "proposal":
		return {"bg": Color(0.23, 0.15, 0.05, 0.84), "border": Color(0.95, 0.72, 0.38, 0.50)}
	if kind == "receipt":
		return {"bg": Color(0.07, 0.13, 0.07, 0.80), "border": Color(0.54, 0.78, 0.46, 0.42)}
	if is_system_center:
		return {"bg": Color(0.12, 0.10, 0.07, 0.72), "border": Color(0.86, 0.72, 0.45, 0.28)}
	return {"bg": Color(0.07, 0.18, 0.13, 0.78), "border": Color(0.42, 0.72, 0.56, 0.38)}

func _build_chat_avatar(message: Dictionary, is_player: bool) -> Control:
	if not is_player:
		var portrait_path := _resolve_ai_portrait_path(message)
		if portrait_path != "":
			var texture := _load_portrait_texture(portrait_path)
			if texture != null:
				return _build_portrait_avatar(texture)
	var badge := PanelContainer.new()
	badge.custom_minimum_size = Vector2(CHAT_AVATAR_SIZE, CHAT_AVATAR_SIZE)
	var bg := Color(0.22, 0.30, 0.50, 0.92) if is_player else Color(0.12, 0.36, 0.29, 0.92)
	badge.add_theme_stylebox_override("panel", _make_panel_style(bg, Color(1.0, 0.92, 0.72, 0.32), 10))
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 4)
	margin.add_theme_constant_override("margin_top", 4)
	margin.add_theme_constant_override("margin_right", 4)
	margin.add_theme_constant_override("margin_bottom", 4)
	badge.add_child(margin)
	var column := VBoxContainer.new()
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	column.add_theme_constant_override("separation", 0)
	margin.add_child(column)
	var title := Label.new()
	title.text = _format_avatar_initial(message, is_player)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 14)
	title.add_theme_color_override("font_color", Color(1.0, 0.97, 0.88, 1.0))
	column.add_child(title)
	var role := Label.new()
	role.text = _format_avatar_role(message, is_player)
	role.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	role.add_theme_font_size_override("font_size", 8)
	role.add_theme_color_override("font_color", Color(0.94, 0.88, 0.70, 0.86))
	column.add_child(role)
	return badge

func _build_portrait_avatar(texture: Texture2D) -> Control:
	var frame := PanelContainer.new()
	frame.custom_minimum_size = Vector2(CHAT_AVATAR_SIZE, CHAT_AVATAR_SIZE)
	frame.add_theme_stylebox_override("panel", _make_panel_style(Color(0.04, 0.05, 0.05, 0.94), Color(1.0, 0.86, 0.48, 0.38), 10))
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 2)
	margin.add_theme_constant_override("margin_top", 2)
	margin.add_theme_constant_override("margin_right", 2)
	margin.add_theme_constant_override("margin_bottom", 2)
	frame.add_child(margin)
	var portrait := TextureRect.new()
	portrait.texture = texture
	portrait.custom_minimum_size = Vector2(CHAT_AVATAR_SIZE - 4.0, CHAT_AVATAR_SIZE - 4.0)
	portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	margin.add_child(portrait)
	return frame

func _load_portrait_texture(path: String) -> Texture2D:
	var normalized_path := path.strip_edges()
	if normalized_path == "" or not FileAccess.file_exists(normalized_path):
		return null
	var image := Image.new()
	var error := image.load(normalized_path)
	if error != OK:
		return null
	return ImageTexture.create_from_image(image)

func _resolve_ai_portrait_path(message: Dictionary) -> String:
	var metadata_value = message.get("metadata", {})
	var metadata: Dictionary = metadata_value as Dictionary if metadata_value is Dictionary else {}
	var active_channel := _find_channel(_active_channel_id)
	for direct_path in [
		str(metadata.get("avatarImagePath", "")).strip_edges(),
		str(message.get("avatarImagePath", "")).strip_edges(),
		str(active_channel.get("avatarImagePath", "")).strip_edges(),
	]:
		if direct_path != "" and FileAccess.file_exists(direct_path):
			return direct_path
	var keys: Array[String] = [
		str(active_channel.get("avatarId", "")).strip_edges(),
		str(metadata.get("aiPlayerId", "")).strip_edges(),
		str(message.get("aiPlayerId", "")).strip_edges(),
		_active_ai_player_id.strip_edges(),
		_active_channel_id.strip_edges(),
		_format_message_display_name(message, false),
	]
	for key in keys:
		if key != "" and _ai_chat_portrait_assignments.has(key):
			var portrait_path := str(_ai_chat_portrait_assignments.get(key, "")).strip_edges()
			if portrait_path != "" and FileAccess.file_exists(portrait_path):
				return portrait_path
	return ""

func _format_message_display_name(message: Dictionary, is_player: bool) -> String:
	var kind := str(message.get("kind", "")).strip_edges()
	var name := str(message.get("name", "")).strip_edges()
	if is_player:
		return "总督"
	if kind == "receipt" and (name == "" or name == "系统"):
		return str(_find_channel(_active_channel_id).get("label", "AI")).strip_edges()
	if name == "" or name == "系统":
		return str(_find_channel(_active_channel_id).get("label", "AI")).strip_edges()
	return name

func _format_avatar_initial(message: Dictionary, is_player: bool) -> String:
	var name := _format_message_display_name(message, is_player)
	if name == "":
		return "我" if is_player else "AI"
	if is_player:
		return "我"
	return "AI"

func _format_avatar_role(message: Dictionary, is_player: bool) -> String:
	if is_player:
		return "总督"
	var name := _format_message_display_name(message, is_player)
	if name.contains("斥候"):
		return "斥候"
	if name.contains("后勤"):
		return "后勤"
	if name.contains("军"):
		return "军务"
	return "助手"

func _on_channel_pressed(channel_id: String) -> void:
	_active_channel_id = channel_id
	var channel := _find_channel(channel_id)
	_apply_active_identity(channel)
	_sync_active_channel_header()
	_refresh_channel_buttons()
	if channel.has("aiPlayerId"):
		await _refresh_chat()
		await _refresh_mailbox()
		return
	_messages = [{
		"kind": "system",
		"name": "系统",
		"body": "%s频道已打开。自然语言命令请切到具体 AI 频道；这里保留给真人玩家聊天和事件信息。" % str(channel.get("label", "主界面")),
	}]
	_render_messages()
	_set_status("主界面频道已切换")

func _refresh_channel_buttons() -> void:
	for channel_id in _channel_buttons.keys():
		var button := _channel_buttons[channel_id] as Button
		if button == null:
			continue
		var channel := _find_channel(str(channel_id))
		if not channel.is_empty():
			button.text = _format_channel_button_text(channel)
		if str(channel_id) == _active_channel_id:
			button.add_theme_color_override("font_color", Color(1.0, 0.88, 0.55, 1.0))
		else:
			button.add_theme_color_override("font_color", Color(0.92, 0.90, 0.84, 0.92))

func _on_message_submitted(_text: String) -> void:
	_send_current_input()

func _on_chat_input_focus_changed() -> void:
	_update_keyboard_safe_area()
	_sync_chat_input_height()

func _on_chat_input_text_changed() -> void:
	_sync_chat_input_height()

func _on_chat_input_gui_input(event: InputEvent) -> void:
	if _input == null:
		return
	if event is InputEventKey:
		var key_event := event as InputEventKey
		if key_event.pressed and not key_event.echo and key_event.keycode == KEY_ENTER and (key_event.ctrl_pressed or key_event.meta_pressed):
			_input.accept_event()
			_send_current_input()

func _sync_chat_input_height() -> void:
	if _input == null:
		return
	var line_count: int = max(1, int(_input.get_line_count()))
	var target_height: float = CHAT_COMPOSER_MIN_HEIGHT + float(min(line_count - 1, 3)) * 21.0
	_input.custom_minimum_size = Vector2(0, min(CHAT_COMPOSER_MAX_HEIGHT, target_height))

func _send_current_input() -> void:
	if _input == null:
		return
	var text := _input.text.strip_edges()
	if text == "":
		return
	if _api_client == null:
		_messages.append({"kind": "player", "name": "总督", "body": text})
		_messages.append({"kind": "ai", "name": "青州后勤官", "body": "后端未连接，已先记录为本地预览消息。"})
		_input.text = ""
		_sync_chat_input_height()
		_render_messages()
		_set_status("后端未连接，本地预览")
		return
	if _active_ai_player_id.strip_edges() == "" or not _find_channel(_active_channel_id).has("aiPlayerId"):
		_append_system_message("请先切换到具体 AI 频道，再发送自然语言命令。")
		_set_status("未选择 AI 频道")
		return

	_set_status("发送命令并生成提案...")
	var response: Dictionary = await _api_client.send_ai_player_chat_message(
		_active_ai_player_id,
		text,
		_active_governor_player_id,
		"总督",
		true
	)
	if not bool(response.get("ok", false)):
		_append_system_message("聊天发送失败：%s" % _extract_error_text(response))
		_set_status("发送失败")
		return
	_input.text = ""
	_sync_chat_input_height()
	_set_status(_format_chat_send_result_status(response))
	await _refresh_chat()

func _on_voice_input_pressed() -> void:
	_set_status("语音入口已预留；当前先用文字命令发给 AI。")

func _refresh_chat(before_message_id: String = "", append_older: bool = false) -> void:
	if _api_client == null:
		_render_messages()
		return
	if _active_ai_player_id.strip_edges() == "":
		_render_messages()
		return
	var response: Dictionary = await _api_client.get_ai_player_chat_messages(
		_active_ai_player_id,
		120,
		_active_governor_player_id,
		_message_filter,
		before_message_id
	)
	if not bool(response.get("ok", false)):
		var failure_signature := "%s:%s:%s" % [_active_ai_player_id, _message_filter, _extract_error_text(response)]
		if failure_signature != _last_chat_failure_signature:
			_last_chat_failure_signature = failure_signature
			_append_system_message("读取 AI 聊天频道失败：%s\n可以继续输入本地命令；后端恢复后会重新同步。" % _extract_error_text(response))
		_set_status("聊天读取失败")
		return

	var data: Dictionary = response.get("data", {}) as Dictionary
	_last_chat_failure_signature = ""
	var channel_payload: Dictionary = data.get("channel", {}) as Dictionary
	var read_cursor: Dictionary = data.get("readCursor", {}) as Dictionary
	_history_counts = data.get("historyCounts", {}) as Dictionary
	_history_has_more = bool(data.get("hasMore", false))
	_history_next_before_message_id = str(data.get("nextBeforeMessageId", "")).strip_edges()
	var raw_messages: Array = data.get("messages", []) as Array
	var message_count := int(read_cursor.get("messageCount", channel_payload.get("messageCount", data.get("count", raw_messages.size()))))
	_channel_message_counts[_active_ai_player_id] = message_count
	_channel_seen_counts[_active_ai_player_id] = int(read_cursor.get("readMessageCount", _channel_seen_counts.get(_active_ai_player_id, 0)))
	var loaded_messages: Array = []
	for raw_message in raw_messages:
		if raw_message is Dictionary:
			loaded_messages.append(_normalize_backend_message(raw_message as Dictionary))
	if append_older:
		_messages = loaded_messages + _messages
	else:
		_messages = loaded_messages
	if _messages.is_empty():
		_messages.append({
			"kind": "system",
			"name": "系统",
			"body": "正式 AI 频道已连接。可以输入自然语言命令生成提案。",
		})
	_render_messages()
	if append_older:
		_refresh_channel_buttons()
		_set_status("已加载更早历史")
		return
	var cursor_saved := await _mark_active_ai_channel_read(message_count)
	_refresh_channel_buttons()
	if cursor_saved:
		_set_status("聊天已同步")

func _mark_active_ai_channel_read(message_count: int) -> bool:
	if _api_client == null:
		return false
	var ai_player_id := _active_ai_player_id.strip_edges()
	var reader_id := _active_governor_player_id.strip_edges()
	if ai_player_id == "" or reader_id == "":
		return false
	var response: Dictionary = await _api_client.update_ai_player_chat_read_cursor(ai_player_id, reader_id, message_count)
	if not bool(response.get("ok", false)):
		_channel_seen_counts[ai_player_id] = message_count
		_set_status("聊天已同步；未读状态保存失败：%s" % _extract_error_text(response))
		return false
	var data: Dictionary = response.get("data", {}) as Dictionary
	var read_cursor: Dictionary = data.get("readCursor", {}) as Dictionary
	_channel_message_counts[ai_player_id] = int(read_cursor.get("messageCount", message_count))
	_channel_seen_counts[ai_player_id] = int(read_cursor.get("readMessageCount", message_count))
	return true

func _request_ai_patrol_tick() -> void:
	if _api_client == null:
		_set_status("后端未连接，无法巡查")
		return
	var ai_player_id := _active_ai_player_id.strip_edges()
	if ai_player_id == "":
		_set_status("请先选择一个 AI 频道")
		return
	_set_status("请求 AI 巡查...")
	var response: Dictionary = await _api_client.create_ai_player_chat_patrol_tick(ai_player_id, _active_governor_player_id)
	if not bool(response.get("ok", false)):
		_append_backend_failure_response("巡查失败", response)
		_set_status("巡查失败")
		return
	var data: Dictionary = response.get("data", {}) as Dictionary
	var chat_message: Dictionary = {}
	var chat_message_value = data.get("chatMessage", data.get("aiMessage", {}))
	if chat_message_value is Dictionary:
		chat_message = chat_message_value as Dictionary
	if not chat_message.is_empty():
		_messages.append(_normalize_backend_message(chat_message))
		_render_messages()
	_set_status("AI 已完成巡查回报")
	await _refresh_chat()

func _approve_and_execute_proposal(proposal_id: String) -> void:
	var normalized_proposal_id := proposal_id.strip_edges()
	if normalized_proposal_id == "":
		normalized_proposal_id = _active_proposal_id
	if normalized_proposal_id == "":
		_set_status("没有可审批的提案")
		return
	if _api_client == null:
		_set_status("后端未连接，无法审批")
		return

	_set_status("审批提案...")
	var approve_response: Dictionary = await _api_client.approve_ai_player_proposal(normalized_proposal_id, _active_governor_player_id)
	if not bool(approve_response.get("ok", false)):
		_append_backend_failure_response("审批失败", approve_response)
		_set_status("审批失败")
		return

	_set_status("执行提案...")
	var execute_response: Dictionary = await _api_client.execute_ai_player_proposal(normalized_proposal_id, _active_governor_player_id, true)
	if not bool(execute_response.get("ok", false)):
		_append_backend_failure_response("执行失败", execute_response)
		_set_status("执行失败")
		return

	_set_status("执行完成，回执已回写聊天流")
	await _refresh_chat()
	await _refresh_mailbox()

func _show_proposal_detail(message: Dictionary) -> void:
	var proposal_id := str(message.get("proposalId", "")).strip_edges()
	var action := str(message.get("action", "resource_transfer_to_governor")).strip_edges()
	var preview_proposal := _build_message_proposal_preview(message)
	if proposal_id == "":
		_set_status("提案详情：本地预览卡，尚未生成后端 proposalId")
		_open_proposal_detail("提案详情", _format_proposal_readable_detail(preview_proposal, message), preview_proposal)
		return
	_open_proposal_detail("提案详情", "正在读取 %s ..." % proposal_id, {})
	if _api_client == null:
		_set_status("提案详情：%s / %s" % [action, proposal_id])
		return
	var response: Dictionary = await _api_client.get_ai_player_proposal(proposal_id)
	if not bool(response.get("ok", false)):
		_open_proposal_detail("提案详情", "%s\n\n读取正式提案失败：%s" % [
			_format_proposal_readable_detail(preview_proposal, message),
			_extract_error_text(response),
		], preview_proposal)
		_set_status("提案详情读取失败")
		return
	var data: Dictionary = response.get("data", {}) as Dictionary
	var proposal: Dictionary = data.get("proposal", {}) as Dictionary
	var proposal_context := proposal if not proposal.is_empty() else preview_proposal
	_open_proposal_detail("提案详情", _format_backend_proposal_detail(proposal, message), proposal_context)
	_set_status("提案详情：%s / %s" % [action, proposal_id])

func _show_receipt_detail(message: Dictionary) -> void:
	var proposal_id := str(message.get("receiptProposalId", "")).strip_edges()
	var preview_context := _build_message_receipt_preview(message)
	if proposal_id == "":
		_open_proposal_detail("回执详情", _format_receipt_readable_detail(preview_context, message), preview_context)
		_set_status("回执详情：本地回执，没有 proposalId")
		return
	_open_proposal_detail("回执详情", "正在读取回执关联提案 %s ..." % proposal_id, preview_context)
	if _api_client == null:
		_open_proposal_detail("回执详情", _format_receipt_readable_detail(preview_context, message), preview_context)
		_set_status("回执详情：后端未连接，显示本地回执")
		return
	var response: Dictionary = await _api_client.get_ai_player_proposal(proposal_id)
	if not bool(response.get("ok", false)):
		_open_proposal_detail("回执详情", "%s\n\n读取正式提案失败：%s" % [
			_format_receipt_readable_detail(preview_context, message),
			_extract_error_text(response),
		], preview_context)
		_set_status("回执详情读取失败")
		return
	var data: Dictionary = response.get("data", {}) as Dictionary
	var proposal: Dictionary = data.get("proposal", {}) as Dictionary
	var receipt_context := _merge_receipt_context(proposal, message)
	_open_proposal_detail("回执详情", _format_receipt_readable_detail(receipt_context, message), receipt_context)
	_set_status("回执详情：%s" % proposal_id)

func _open_proposal_detail(title: String, body: String, proposal_context: Dictionary = {}) -> void:
	if _proposal_detail_popup == null:
		return
	_proposal_detail_popup.visible = true
	if _proposal_detail_title != null:
		_proposal_detail_title.text = title
	if _proposal_detail_body != null:
		_proposal_detail_body.text = body
	_proposal_detail_retry_text = _build_retry_command_from_proposal(proposal_context)
	if _proposal_detail_status_label != null:
		_proposal_detail_status_label.text = _format_proposal_detail_status_hint(proposal_context)
	_refresh_proposal_detail_action_buttons()

func _close_proposal_detail_popup() -> void:
	if _proposal_detail_popup != null:
		_proposal_detail_popup.visible = false

func _refresh_proposal_detail_action_buttons() -> void:
	if _proposal_detail_retry_button != null:
		_proposal_detail_retry_button.disabled = _proposal_detail_retry_text == ""
		_proposal_detail_retry_button.add_theme_color_override(
			"font_color",
			Color(0.92, 0.90, 0.84, 0.92) if not _proposal_detail_retry_button.disabled else Color(0.62, 0.58, 0.50, 0.72)
		)
	if _proposal_detail_failure_button != null:
		_proposal_detail_failure_button.disabled = _count_messages_for_filter(MESSAGE_FILTER_FAILURE) <= 0
		_proposal_detail_failure_button.add_theme_color_override(
			"font_color",
			Color(0.92, 0.90, 0.84, 0.92) if not _proposal_detail_failure_button.disabled else Color(0.62, 0.58, 0.50, 0.72)
		)

func _show_failure_history_from_detail() -> void:
	_message_filter = MESSAGE_FILTER_FAILURE
	_close_proposal_detail_popup()
	await _refresh_chat()
	_set_status("已切到失败历史")

func _fill_retry_command_from_detail() -> void:
	if _proposal_detail_retry_text == "":
		_set_status("当前提案没有可填入的恢复命令")
		return
	if _input != null:
		_input.text = _proposal_detail_retry_text
		_sync_chat_input_height()
		_input.grab_focus()
	_close_proposal_detail_popup()
	_set_status("已填入恢复命令，可修改后发送")

func _build_message_proposal_preview(message: Dictionary) -> Dictionary:
	var metadata: Dictionary = message.get("metadata", {}) as Dictionary
	var args: Dictionary = {}
	if metadata.has("resources"):
		args["resources"] = metadata.get("resources", {})
	return {
		"proposalId": str(message.get("proposalId", "")).strip_edges(),
		"action": str(message.get("action", "")).strip_edges(),
		"status": str(metadata.get("status", "pending_approval")).strip_edges(),
		"riskLevel": str(metadata.get("riskLevel", "low")).strip_edges(),
		"requiresApproval": bool(metadata.get("requiresApproval", true)),
		"source": str(metadata.get("proposalMode", metadata.get("source", "chat"))).strip_edges(),
		"model": str(metadata.get("model", "")).strip_edges(),
		"reason": str(message.get("body", "")).strip_edges(),
		"args": args,
		"recoveryHint": metadata.get("recoveryHint", {}),
	}

func _build_message_receipt_preview(message: Dictionary) -> Dictionary:
	var metadata: Dictionary = message.get("metadata", {}) as Dictionary
	var receipt_ok := bool(message.get("receiptOk", false))
	var failure_code := str(message.get("failureCode", metadata.get("failureCode", ""))).strip_edges()
	return {
		"proposalId": str(message.get("receiptProposalId", "")).strip_edges(),
		"action": str(message.get("action", "")).strip_edges(),
		"status": "executed" if receipt_ok else "failed",
		"reason": str(message.get("body", "")).strip_edges(),
		"failureCode": failure_code,
		"worldAction": str(metadata.get("worldAction", "")).strip_edges(),
		"worldActionPayload": metadata.get("worldActionPayload", {}),
		"recoveryHint": metadata.get("recoveryHint", {}),
	}

func _merge_receipt_context(proposal: Dictionary, message: Dictionary) -> Dictionary:
	var context: Dictionary = proposal.duplicate(true) if not proposal.is_empty() else _build_message_receipt_preview(message)
	var metadata: Dictionary = message.get("metadata", {}) as Dictionary
	var receipt_ok := bool(message.get("receiptOk", false))
	context["status"] = "executed" if receipt_ok else "failed"
	var failure_code := str(message.get("failureCode", metadata.get("failureCode", ""))).strip_edges()
	if failure_code != "":
		context["failureCode"] = failure_code
	var recovery_hint_value = metadata.get("recoveryHint", {})
	if recovery_hint_value is Dictionary and not (recovery_hint_value as Dictionary).is_empty():
		context["recoveryHint"] = recovery_hint_value
	var world_action := str(metadata.get("worldAction", context.get("worldAction", ""))).strip_edges()
	if world_action != "":
		context["worldAction"] = world_action
	if metadata.has("worldActionPayload"):
		context["worldActionPayload"] = metadata.get("worldActionPayload", {})
	if str(context.get("proposalId", "")).strip_edges() == "":
		context["proposalId"] = str(message.get("receiptProposalId", "")).strip_edges()
	return context

func _format_message_proposal_detail(message: Dictionary) -> String:
	return _format_proposal_readable_detail(_build_message_proposal_preview(message), message)

func _format_backend_proposal_detail(proposal: Dictionary, fallback_message: Dictionary) -> String:
	if proposal.is_empty():
		return _format_message_proposal_detail(fallback_message)
	return _format_proposal_readable_detail(proposal, fallback_message)

func _format_receipt_readable_detail(proposal_context: Dictionary, message: Dictionary) -> String:
	var metadata: Dictionary = message.get("metadata", {}) as Dictionary
	var receipt_ok := bool(message.get("receiptOk", false))
	var context := proposal_context.duplicate(true)
	context["status"] = "executed" if receipt_ok else "failed"
	if str(context.get("reason", "")).strip_edges() == "":
		context["reason"] = str(message.get("body", "")).strip_edges()
	var failure_code := str(message.get("failureCode", metadata.get("failureCode", ""))).strip_edges()
	if failure_code != "":
		context["failureCode"] = failure_code
	var recovery_hint_value = metadata.get("recoveryHint", context.get("recoveryHint", {}))
	if recovery_hint_value is Dictionary and not (recovery_hint_value as Dictionary).is_empty():
		context["recoveryHint"] = recovery_hint_value
	return _format_proposal_readable_detail(context, message)

func _format_receipt_failure_next_step(proposal_context: Dictionary, failure_code: String, recovery_hint: Dictionary) -> String:
	if failure_code == "":
		return ""
	var recommended_command := str(recovery_hint.get("recommendedCommand", "")).strip_edges()
	var args: Dictionary = proposal_context.get("args", {}) as Dictionary
	var resources: Dictionary = args.get("resources", {}) as Dictionary
	var resource_text := _format_retry_resource_bundle(resources).strip_edges()
	match failure_code:
		"insufficient_resources", "insufficient_ai_resources":
			if recommended_command != "":
				return "先不要重复执行同一提案；让 AI 继续采集或降低输送数量。可直接填入建议命令。"
			return "先不要重复执行同一提案；让 AI 继续采集%s，或把本次输送数量调低后重新生成提案。" % (("，目标资源：%s" % resource_text) if resource_text != "一部分资源" else "")
		"transfer_cooldown_active":
			if recommended_command != "":
				return "等待输送冷却结束后再执行；等待期间可以改下采集命令，或直接填入建议命令。"
			return "等待输送冷却结束后再输送%s；等待期间让 AI 继续采集。" % resource_text
		"daily_quota_exceeded":
			return "今日输送额度已耗尽；等额度窗口刷新后再输送资源，当前可以让 AI 继续采集但不要重复提交输送。"
		"proposal_not_approved":
			return "先批准提案，再执行；如果目标或数量不对，拒绝后重新用自然语言下令。"
		"proposal_not_found":
			return "刷新聊天历史或重新下达自然语言命令生成新提案。"
		_:
			return "按失败原因修正资源、冷却或审批状态后，再重新生成提案。"

func _format_proposal_readable_detail(proposal: Dictionary, fallback_message: Dictionary = {}) -> String:
	var lines: Array[String] = []
	var fallback_metadata: Dictionary = fallback_message.get("metadata", {}) as Dictionary
	var action := str(proposal.get("action", fallback_message.get("action", ""))).strip_edges()
	var args: Dictionary = proposal.get("args", {}) as Dictionary
	var status := str(proposal.get("status", fallback_metadata.get("status", ""))).strip_edges()
	var risk_level := str(proposal.get("riskLevel", fallback_metadata.get("riskLevel", ""))).strip_edges()
	var requires_approval := bool(proposal.get("requiresApproval", fallback_metadata.get("requiresApproval", true)))
	var executable_in_v1 := bool(proposal.get("executableInV1", true))
	var recovery_hint := _extract_proposal_recovery_hint(proposal, fallback_metadata)
	var reason := str(proposal.get("reason", fallback_message.get("body", ""))).strip_edges()
	var reason_blocks := _extract_proposal_reason_blocks(reason)

	var resource_text := str(reason_blocks.get("资源", "")).strip_edges()
	if resource_text == "":
		resource_text = _format_proposal_resource_focus(action, args)
	_append_detail_block(lines, "资源", resource_text)

	var target_text := str(reason_blocks.get("目标", "")).strip_edges()
	if target_text == "":
		target_text = _format_proposal_target_line(action, args, proposal)
	_append_detail_block(lines, "目标", target_text)

	var failure_code := _clean_optional_text(proposal.get("failureCode", fallback_metadata.get("failureCode", "")))
	if failure_code == "":
		failure_code = _clean_optional_text(proposal.get("rejectionReason", ""))
	var risk_lines: Array[String] = []
	var risk_text := str(reason_blocks.get("风险", "")).strip_edges()
	if risk_text != "":
		risk_lines.append(risk_text)
	if status != "":
		risk_lines.append("状态：%s" % _format_proposal_status_label(status))
	if risk_level == "medium" or risk_level == "high":
		risk_lines.append("等级：%s" % _format_proposal_risk_label(risk_level))
	risk_lines.append("审批：%s" % _format_proposal_approval_guidance(status, requires_approval, risk_level, executable_in_v1))
	if not executable_in_v1:
		risk_lines.append("限制：%s" % _format_proposal_execution_readiness(executable_in_v1))
	if failure_code != "":
		risk_lines.append("失败：%s" % _format_failure_code_label(failure_code))
		risk_lines.append("处理：%s" % _format_proposal_recovery_hint(action, status, failure_code, recovery_hint))
	_append_detail_block(lines, "风险", "\n".join(risk_lines))

	var result_lines: Array[String] = []
	var result_text := str(reason_blocks.get("批准后结果", "")).strip_edges()
	if result_text != "":
		result_lines.append(result_text)
	else:
		for effect_line in _build_proposal_effect_lines(action, args):
			result_lines.append(effect_line)
	_append_detail_block(lines, "批准后结果", "\n".join(result_lines))
	return "\n".join(lines)

func _extract_proposal_reason_blocks(reason: String) -> Dictionary:
	var blocks: Dictionary = {}
	var text := reason.strip_edges()
	if text == "":
		return blocks
	var markers: Array = []
	for label in ["资源", "目标", "风险", "批准后结果"]:
		var marker := "%s：" % label
		var index := text.find(marker)
		if index < 0:
			marker = "%s:" % label
			index = text.find(marker)
		if index >= 0:
			markers.append({"label": label, "index": index, "length": marker.length()})
	markers.sort_custom(func(a, b) -> bool:
		return int(a.get("index", 0)) < int(b.get("index", 0))
	)
	for i in range(markers.size()):
		var item: Dictionary = markers[i] as Dictionary
		var start := int(item.get("index", 0)) + int(item.get("length", 0))
		var finish := text.length()
		if i + 1 < markers.size():
			var next_item: Dictionary = markers[i + 1] as Dictionary
			finish = int(next_item.get("index", finish))
		var value := text.substr(start, max(0, finish - start)).strip_edges()
		value = _trim_reason_block_punctuation(value)
		if value != "":
			blocks[str(item.get("label", ""))] = value
	return blocks

func _trim_reason_block_punctuation(value: String) -> String:
	var text := value.strip_edges()
	while text.begins_with("；") or text.begins_with(";") or text.begins_with("。") or text.begins_with("."):
		text = text.substr(1).strip_edges()
	while text.ends_with("；") or text.ends_with(";"):
		text = text.substr(0, text.length() - 1).strip_edges()
	return text

func _append_detail_block(lines: Array[String], title: String, body: String) -> void:
	var normalized := body.strip_edges()
	if normalized == "":
		return
	if not lines.is_empty():
		lines.append("")
	lines.append("%s：" % title)
	for raw_line in normalized.split("\n"):
		var line := raw_line.strip_edges()
		if line != "":
			lines.append("· %s" % line)

func _append_detail_line(lines: Array[String], label: String, value: String) -> void:
	var normalized := value.strip_edges()
	if normalized == "":
		return
	lines.append("%s：%s" % [label, normalized])

func _format_proposal_resource_focus(action: String, args: Dictionary) -> String:
	var resources: Dictionary = args.get("resources", {}) as Dictionary
	if not resources.is_empty():
		return "%s。AI 子账户会先扣除这部分资源，执行成功后进入总督通用收件箱待领取。" % _format_resources(resources)
	var reward: Dictionary = args.get("reward", {}) as Dictionary
	if not reward.is_empty():
		return "%s。奖励领取后进入总督账户。" % _format_reward(reward)
	if action == "resource_gather":
		return "预计把采集收益写入 AI 子账户，具体收益以后端回执为准。"
	if action == "tile_occupy":
		return "占地会消耗行动点和粮草；成功后地块归属和势力发育进度以后端回执为准。"
	if action == "troop_heal":
		return "整补会消耗行动点和粮草；成功后恢复兵力和补给。"
	if action == "march_move":
		return "行军主要校验部队位置和目标地块；不直接结算占地或采集。"
	return "无直接资源变化，执行结果以后端回执为准。"

func _build_proposal_effect_lines(action: String, args: Dictionary) -> Array[String]:
	var lines: Array[String] = []
	var resources: Dictionary = args.get("resources", {}) as Dictionary
	if not resources.is_empty():
		lines.append("资源变化：AI 子账户扣除 %s，总督通用收件箱增加同等待领资源。" % _format_resources(resources))
		lines.append("领取位置：主界面通用收件箱，不在 AI 管理页领取。")
	var reward: Dictionary = args.get("reward", {}) as Dictionary
	if not reward.is_empty():
		lines.append("奖励变化：领取 %s。" % _format_reward(reward))
	var target_line := _format_proposal_target_line(action, args, {})
	if target_line != "":
		lines.append("目标：%s。" % target_line)
	if action == "reward_claim" and lines.is_empty():
		lines.append("从通用收件箱领取当前可用奖励。")
	if action == "tile_occupy":
		lines.append("占领成功后，目标地块会变成我方地块，并生成正式回执。")
	if action == "troop_heal":
		lines.append("整补成功后，部队兵力和补给会恢复，方便继续行军或占地。")
	if action == "march_move":
		lines.append("地图变化：部队到达目标地块，地图意图环随后消失或进入下一条目标。")
	if lines.is_empty():
		lines.append("执行后会生成正式回执，并回写到 AI 聊天流。")
	else:
		lines.append("执行成功后会在聊天流写入回执。")
	return lines

func _format_proposal_target_line(action: String, args: Dictionary, proposal: Dictionary) -> String:
	match action:
		"resource_transfer_to_governor":
			var governor_id := str(proposal.get("governorPlayerId", _active_governor_player_id)).strip_edges()
			return "把资源转入总督 %s 的通用收件箱" % (governor_id if governor_id != "" else "当前总督")
		"resource_gather":
			var unit_id := str(args.get("unitId", "")).strip_edges()
			var tile_id := str(args.get("tileId", "")).strip_edges()
			if unit_id != "" and tile_id != "":
				return "派 %s 采集资源地 %s" % [unit_id, tile_id]
			if tile_id != "":
				return "采集资源地 %s" % tile_id
			return "采集可用资源地"
		"tile_occupy":
			return "让部队 %s 占领地块 %s" % [
				str(args.get("unitId", "未指定")).strip_edges(),
				str(args.get("tileId", "未指定")).strip_edges(),
			]
		"troop_heal":
			return "整补部队 %s" % str(args.get("unitId", "自动选择受损部队")).strip_edges()
		"march_move":
			return "派部队 %s 前往地图目标地块 %s；地图意图环会标出该目标" % [
				str(args.get("unitId", "未指定")).strip_edges(),
				str(args.get("targetTileId", "未指定")).strip_edges(),
			]
		"reward_claim":
			var reward_id := str(args.get("rewardId", "")).strip_edges()
			return "领取 %s" % (reward_id if reward_id != "" else "当前可领取奖励")
		"formation_assign":
			return "调整武将 %s 到战法 %s" % [
				str(args.get("heroId", "未指定")).strip_edges(),
				str(args.get("tacticId", "未指定")).strip_edges(),
			]
		"general_focus_set", "general_focus":
			return "把武将关注目标切到 %s" % str(args.get("heroId", "未指定")).strip_edges()
		"troop_facility_upgrade":
			return "升级部队设施 %s" % str(args.get("facilityId", args.get("buildingId", "未指定"))).strip_edges()
		"threat_escape":
			return "按 %s 模式脱离威胁" % str(args.get("mode", "recover")).strip_edges()
		_:
			var target_tile_id := str(args.get("targetTileId", "")).strip_edges()
			if target_tile_id != "":
				return "目标地块 %s" % target_tile_id
			return ""

func _format_proposal_approval_guidance(status: String, requires_approval: bool, risk_level: String, executable_in_v1: bool) -> String:
	if not executable_in_v1:
		return "当前版本不可直接执行，先不要批准。"
	if status == "executed":
		return "已执行，可查看回执确认结果。"
	if status == "rejected":
		return "已拒绝，需重新下达命令才会生成新提案。"
	if status == "failed":
		return "执行失败，先看失败原因和恢复建议。"
	if not requires_approval:
		return "不需要人工批准，后端可直接执行。"
	if risk_level == "high":
		return "高风险，建议确认资源和目标后再批准。"
	return "可由总督批准；批准后后端执行并把回执写回聊天。"

func _format_proposal_execution_readiness(executable_in_v1: bool) -> String:
	return "可执行，走后端规则和 WorldService 回执链" if executable_in_v1 else "当前版本仅能记录，不会直接改世界"

func _extract_proposal_recovery_hint(proposal: Dictionary, fallback_metadata: Dictionary = {}) -> Dictionary:
	var proposal_hint = proposal.get("recoveryHint", {})
	if proposal_hint is Dictionary:
		return proposal_hint as Dictionary
	var fallback_hint = fallback_metadata.get("recoveryHint", {})
	if fallback_hint is Dictionary:
		return fallback_hint as Dictionary
	return {}

func _format_proposal_recovery_hint(action: String, status: String, failure_code: String, recovery_hint: Dictionary = {}) -> String:
	var backend_summary := str(recovery_hint.get("summary", "")).strip_edges()
	if backend_summary != "":
		return backend_summary
	var normalized_failure := failure_code.strip_edges()
	if normalized_failure == "":
		if status == "pending_approval":
			return "等待批准；如果资源或目标不对，可以拒绝后重新下令。"
		if status == "executed":
			return "已执行；查看回执确认结果。"
		return ""
	match normalized_failure:
		"approval_required":
			return "点击批准执行，后端才会继续。"
		"transfer_cooldown_active":
			return "等待冷却结束，或改为采集/其他低风险任务。"
		"insufficient_resources":
			return "先让 AI 采集资源，或降低本次输送数量。"
		"insufficient_ai_resources":
			return "先让 AI 采集资源，或降低本次输送数量。"
		"daily_quota_exceeded":
			return "今日输送额度已用完，等待额度窗口刷新后再执行。"
		"proposal_not_found":
			return "刷新聊天历史，确认提案还存在。"
		"proposal_not_approved":
			return "先批准提案，再执行。"
		_:
			if action == "resource_transfer_to_governor":
				return "检查 AI 子账户资源、输送冷却和总督收件箱状态。"
			return "查看回执失败原因，必要时重新下达更具体的命令。"

func _format_proposal_detail_status_hint(proposal: Dictionary) -> String:
	if proposal.is_empty():
		return "状态提示：正在读取正式提案，按钮暂不可用。"
	var action := str(proposal.get("action", "")).strip_edges()
	var status := str(proposal.get("status", "")).strip_edges()
	var failure_code := _clean_optional_text(proposal.get("failureCode", proposal.get("rejectionReason", "")))
	if status == "executed":
		return "状态提示：已执行，查看回执确认结果。"
	if status == "pending_approval":
		return "状态提示：等待总督批准；批准后执行结果会回写聊天流。"
	var recovery_hint := _extract_proposal_recovery_hint(proposal)
	var guidance := _format_proposal_recovery_hint(action, status, failure_code, recovery_hint)
	if guidance != "":
		return "状态提示：%s" % guidance
	if status == "approved":
		return "状态提示：已批准，等待执行或重试执行。"
	return "状态提示：查看详情后决定批准、拒绝或重新下令。"

func _build_retry_command_from_proposal(proposal: Dictionary) -> String:
	if proposal.is_empty():
		return ""
	var recovery_hint := _extract_proposal_recovery_hint(proposal)
	var recommended_command := str(recovery_hint.get("recommendedCommand", "")).strip_edges()
	if recommended_command != "":
		return recommended_command
	var action := str(proposal.get("action", "")).strip_edges()
	var args: Dictionary = proposal.get("args", {}) as Dictionary
	var failure_code := str(proposal.get("failureCode", proposal.get("rejectionReason", ""))).strip_edges()
	match action:
		"resource_transfer_to_governor":
			var resources: Dictionary = args.get("resources", {}) as Dictionary
			var resource_text := _format_retry_resource_bundle(resources)
			if failure_code == "insufficient_ai_resources" or failure_code == "insufficient_resources":
				return "先继续采集资源；资源够了再输送%s到总督通用收件箱。" % resource_text
			if failure_code == "transfer_cooldown_active":
				return "冷却结束后再输送%s到总督通用收件箱；等待期间继续采集。" % resource_text
			if failure_code == "daily_quota_exceeded":
				return "等待额度刷新后再输送%s到总督通用收件箱。" % resource_text
			return "确认资源和冷却后，输送%s到总督通用收件箱。" % resource_text
		"resource_gather":
			var tile_id := str(args.get("tileId", "")).strip_edges()
			if tile_id != "":
				return "继续采集资源地 %s，采集完成后汇报结果。" % tile_id
			return "选择最近可用资源地继续采集，采集完成后汇报结果。"
		"reward_claim":
			return "打开通用收件箱，领取当前可领取奖励。"
		_:
			if failure_code != "":
				return "根据失败原因重新规划这条任务，降低风险后再生成提案。"
	return ""

func _format_retry_resource_bundle(resources: Dictionary) -> String:
	var resource_text := _format_resources(resources)
	if resource_text == "无":
		return "一部分资源"
	return " %s " % resource_text

func _format_proposal_action_label(action: String) -> String:
	match action:
		"resource_transfer_to_governor":
			return "输送资源给总督"
		"resource_gather":
			return "采集资源到 AI 子账户"
		"tile_occupy":
			return "占领地块"
		"troop_heal":
			return "整补部队"
		"march_move":
			return "行军到目标地"
		"reward_claim":
			return "领取奖励"
		"alliance_help":
			return "请求同盟协助"
		"formation_assign":
			return "调整部队编组"
		"general_focus":
			return "调整武将关注目标"
		"general_focus_set":
			return "调整武将关注目标"
		"troop_facility_upgrade":
			return "升级部队设施"
		"threat_escape":
			return "脱离威胁区域"
		_:
			return action if action != "" else "未标记动作"

func _format_proposal_status_label(status: String) -> String:
	match status:
		"candidate":
			return "候选"
		"pending_approval":
			return "等待批准"
		"approved":
			return "已批准，等待执行"
		"executed":
			return "已执行"
		"rejected":
			return "已拒绝"
		"failed":
			return "执行失败"
		_:
			return status if status != "" else "等待批准"

func _format_proposal_risk_label(risk_level: String) -> String:
	match risk_level:
		"high":
			return "高，需要谨慎确认"
		"medium":
			return "中"
		"low":
			return "低"
		_:
			return risk_level if risk_level != "" else "低"

func _format_failure_code_label(failure_code: String) -> String:
	match failure_code.strip_edges():
		"insufficient_resources", "insufficient_ai_resources":
			return "AI 子账户资源不足"
		"transfer_cooldown_active":
			return "资源输送冷却中"
		"daily_quota_exceeded":
			return "今日输送额度已耗尽"
		"approval_required", "proposal_not_approved":
			return "需要先批准提案"
		"proposal_not_found":
			return "提案不存在或已过期"
		"ai_player_not_found":
			return "AI 玩家不存在"
		"ai_player_disabled":
			return "AI 玩家已停用"
		"ai_player_paused":
			return "AI 玩家已暂停"
		"proposal_execution_failed":
			return "后端执行失败"
		_:
			return failure_code

func _format_proposal_source_label(source: String) -> String:
	match source:
		"model":
			return "模型生成"
		"llm":
			return "模型生成"
		"human":
			return "玩家聊天命令"
		"chat":
			return "AI 频道聊天"
		"rule":
			return "后端规则生成"
		_:
			return source if source != "" else "AI 运行时"

func _format_world_action_label(world_action: String) -> String:
	match world_action:
		"moveUnit":
			return "行军到目标地"
		"occupyTile":
			return "占领目标地块"
		"healTroop":
			return "整补部队"
		"gatherAiResourceTile":
			return "采集资源"
		"transferFactionResourcesToGovernor":
			return "资源输送到总督收件箱"
		"claimGovernorResourceInbox":
			return "领取 AI 输送资源"
		"claimReward":
			return "领取通用奖励"
		"issueClaimableReward":
			return "发放可领取奖励"
		_:
			return world_action

func _on_mailbox_pressed() -> void:
	if _mailbox_popup != null:
		_mailbox_popup.visible = true
	await _refresh_mailbox()

func _close_mailbox_popup() -> void:
	if _mailbox_popup != null:
		_mailbox_popup.visible = false

func _set_mailbox_filter(filter_id: String) -> void:
	_mailbox_filter = filter_id
	_refresh_mailbox_filter_buttons()
	_render_mailbox_items()

func _refresh_mailbox_filter_buttons() -> void:
	for filter_id in _mailbox_filter_buttons.keys():
		var button := _mailbox_filter_buttons[filter_id] as Button
		if button == null:
			continue
		if str(filter_id) == _mailbox_filter:
			button.add_theme_color_override("font_color", Color(1.0, 0.88, 0.55, 1.0))
		else:
			button.add_theme_color_override("font_color", Color(0.92, 0.90, 0.84, 0.92))

func _refresh_mailbox() -> void:
	if _mailbox_list == null:
		return
	if _api_client == null:
		_mailbox_items = []
		_mailbox_status_label.text = "后端未连接；通用收件箱等待同步。"
		if _mailbox_popup_status_label != null:
			_mailbox_popup_status_label.text = "后端未连接；通用收件箱等待同步。"
		_render_mailbox_items()
		return

	var response: Dictionary = await _api_client.get_unified_inbox(_active_faction_id, _active_governor_player_id)
	if not bool(response.get("ok", false)):
		_mailbox_status_label.text = "收件箱读取失败：%s" % _extract_error_text(response)
		if _mailbox_popup_status_label != null:
			_mailbox_popup_status_label.text = _mailbox_status_label.text
		return

	var data: Dictionary = response.get("data", {}) as Dictionary
	var items: Array = data.get("items", []) as Array
	var counts: Dictionary = data.get("countsByKind", {}) as Dictionary
	var ai_transfer_count := int(counts.get("ai_resource_transfer", 0))
	var daily_welfare_count := int(counts.get("daily_welfare", 0))
	var event_reward_count := int(counts.get("event_reward", 0))
	_mailbox_button.text = "通用收件箱 %d" % int(data.get("count", items.size()))
	_mailbox_status_label.text = "AI 输送 %d / 每日福利 %d / 活动奖励 %d" % [
		ai_transfer_count,
		daily_welfare_count,
		event_reward_count,
	]
	if _mailbox_popup_status_label != null:
		_mailbox_popup_status_label.text = _mailbox_status_label.text
	_mailbox_items = items
	_render_mailbox_items()

func _render_mailbox_items() -> void:
	_render_mailbox_list(_mailbox_list, true)
	_render_mailbox_list(_mailbox_popup_list, false)

func _render_mailbox_list(target: VBoxContainer, compact: bool) -> void:
	if target == null:
		return
	for child in target.get_children():
		child.queue_free()
	var matching_items: Array = []
	for item in _mailbox_items:
		if item is Dictionary and _mailbox_item_matches_filter(item as Dictionary):
			matching_items.append(item)
	if matching_items.is_empty():
		target.add_child(_build_mailbox_line("暂无可领取内容。"))
		return

	for item in matching_items:
		if item is Dictionary:
			target.add_child(_build_mailbox_item(item as Dictionary, compact))

func _mailbox_item_matches_filter(item: Dictionary) -> bool:
	if _mailbox_filter == MAILBOX_FILTER_ALL:
		return true
	return str(item.get("kind", "")).strip_edges() == _mailbox_filter

func _add_mailbox_line(text: String) -> void:
	_mailbox_list.add_child(_build_mailbox_line(text))

func _build_mailbox_line(text: String) -> Control:
	var label := Label.new()
	label.text = text
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_size_override("font_size", 12)
	label.add_theme_color_override("font_color", Color(0.98, 0.94, 0.84, 0.92))
	return label

func _build_mailbox_item(item: Dictionary, compact: bool) -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)

	var item_id := str(item.get("itemId", "")).strip_edges()
	var kind := str(item.get("kind", "")).strip_edges()
	var title := str(item.get("title", "收件箱")).strip_edges()
	var summary := str(item.get("summary", "")).strip_edges()
	var label := Label.new()
	label.text = "%s：%s" % [title, summary]
	if kind == "ai_resource_transfer":
		var resources: Dictionary = item.get("resources", {}) as Dictionary
		label.text = "%s：%s" % [title, _format_resources(resources)]
	elif kind == "daily_welfare" or kind == "event_reward":
		var reward: Dictionary = item.get("reward", {}) as Dictionary
		var reward_text := _format_reward(reward)
		if reward_text != "无":
			label.text = "%s：%s / %s" % [title, summary, reward_text]
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_size_override("font_size", 12 if compact else 14)
	label.add_theme_color_override("font_color", Color(0.98, 0.94, 0.84, 0.92))
	row.add_child(label)

	var claim := Button.new()
	claim.text = "领取"
	claim.focus_mode = Control.FOCUS_NONE
	claim.disabled = item_id == ""
	claim.pressed.connect(_claim_mailbox_item.bind(item_id))
	row.add_child(claim)
	return row

func _format_chat_send_result_status(response: Dictionary) -> String:
	var data: Dictionary = response.get("data", {}) as Dictionary
	var proposal: Dictionary = data.get("proposal", {}) as Dictionary
	if not proposal.is_empty():
		var proposal_message: Dictionary = data.get("proposalMessage", {}) as Dictionary
		var metadata: Dictionary = proposal_message.get("metadata", {}) as Dictionary
		var source_label := _format_proposal_source_label(str(metadata.get("proposalMode", proposal.get("source", ""))).strip_edges())
		var model_name := str(metadata.get("model", "")).strip_edges()
		if model_name != "":
			return "%s已生成提案，等待批准 / %s" % [source_label, model_name]
		return "%s已生成提案，等待批准" % source_label
	var ai_message: Dictionary = data.get("aiMessage", {}) as Dictionary
	if not ai_message.is_empty():
		var ai_metadata: Dictionary = ai_message.get("metadata", {}) as Dictionary
		var failure_code := str(ai_metadata.get("failureCode", "")).strip_edges()
		if failure_code != "":
			return "AI 已回写失败原因：%s" % _format_failure_code_label(failure_code)
		return "AI 已回写回复"
	return "命令已写入 AI 频道"

func _format_message_meta_text(message: Dictionary) -> String:
	var kind := str(message.get("kind", "")).strip_edges()
	var metadata: Dictionary = message.get("metadata", {}) as Dictionary
	var parts: Array[String] = []
	if kind == "proposal":
		var status := str(metadata.get("status", "")).strip_edges()
		if status != "":
			parts.append("状态：%s" % _format_proposal_status_label(status))
		if bool(metadata.get("requiresApproval", status == "pending_approval")):
			parts.append("需要总督确认")
	elif kind == "receipt":
		var receipt_ok := bool(message.get("receiptOk", false))
		parts.append("执行%s" % ("成功" if receipt_ok else "失败"))
		var world_action := _clean_optional_text(metadata.get("worldAction", ""))
		if world_action != "":
			parts.append(_format_world_action_label(world_action))
		var failure_code := _clean_optional_text(message.get("failureCode", ""))
		if failure_code != "":
			parts.append("失败原因：%s" % _format_failure_code_label(failure_code))
	elif kind == "system":
		var failure := str(metadata.get("failureCode", message.get("failureCode", ""))).strip_edges()
		if failure != "":
			parts.append("失败原因：%s" % _format_failure_code_label(failure))
	if parts.is_empty():
		return ""
	return " / ".join(parts)

func _claim_mailbox_item(item_id: String) -> void:
	if _api_client == null or item_id.strip_edges() == "":
		return
	_set_status("领取通用收件箱...")
	var response: Dictionary = await _api_client.claim_unified_inbox_item(
		item_id,
		_active_faction_id,
		_active_governor_player_id,
		true,
		_active_ai_player_id
	)
	if not bool(response.get("ok", false)):
		_set_status("领取失败：%s" % _extract_error_text(response))
		return
	var claim_message := _format_claim_receipt_toast(response)
	_set_status("%s，回执已写入聊天" % claim_message)
	await _refresh_chat()
	await _refresh_mailbox()
	_show_claim_toast(claim_message)

func _format_claim_receipt_toast(response: Dictionary) -> String:
	var data: Dictionary = response.get("data", {}) as Dictionary
	var chat_message: Dictionary = {}
	var chat_message_value = data.get("chatMessage", {})
	if chat_message_value is Dictionary:
		chat_message = chat_message_value as Dictionary
	var chat_body := str(chat_message.get("body", "")).strip_edges()
	if chat_body != "":
		return chat_body.replace("已领取：", "已到账：")
	var kind := str(data.get("kind", "")).strip_edges()
	if kind == "ai_resource_transfer":
		return "AI 输送资源已到账"
	if kind == "daily_welfare":
		return "每日福利已到账"
	if kind == "event_reward":
		return "活动奖励已到账"
	return "通用收件箱已领取"

func _show_claim_toast(text: String) -> void:
	if _claim_toast == null or _claim_toast_label == null:
		return
	_claim_toast_label.text = text
	_claim_toast.visible = true
	_claim_toast.modulate = Color(1, 1, 1, 1)
	if _claim_toast_hide_timer != null:
		_claim_toast_hide_timer.start()
	var tween := create_tween()
	tween.tween_property(_claim_toast, "scale", Vector2(1.02, 1.02), 0.12)
	tween.tween_property(_claim_toast, "scale", Vector2.ONE, 0.16)

func _hide_claim_toast() -> void:
	if _claim_toast == null:
		return
	var tween := create_tween()
	tween.tween_property(_claim_toast, "modulate", Color(1, 1, 1, 0), 0.25)
	tween.tween_callback(_finish_hide_claim_toast)

func _finish_hide_claim_toast() -> void:
	if _claim_toast != null:
		_claim_toast.visible = false

func get_ai_chat_history_snapshot(ai_player_id: String = "", limit: int = 24) -> Dictionary:
	var normalized_ai_player_id := ai_player_id.strip_edges()
	var resolved_ai_player_id := normalized_ai_player_id
	if resolved_ai_player_id == "":
		resolved_ai_player_id = _active_ai_player_id.strip_edges()
	var channel := _find_channel_by_ai_player_id(resolved_ai_player_id)
	if channel.is_empty():
		channel = _find_channel(_active_channel_id)
	var channel_label := str(channel.get("label", "聊天频道")).strip_edges()
	var max_count := maxi(1, limit)
	var matched_messages: Array = []
	for message_variant in _messages:
		if not (message_variant is Dictionary):
			continue
		var message: Dictionary = (message_variant as Dictionary).duplicate(true)
		if _message_belongs_to_ai_history(message, normalized_ai_player_id):
			matched_messages.append(message)
	var start_index := maxi(0, matched_messages.size() - max_count)
	var visible_messages: Array = []
	for index in range(start_index, matched_messages.size()):
		visible_messages.append(_normalize_ai_panel_history_message(matched_messages[index] as Dictionary))
	return {
		"source": "main_chat_overlay_read_adapter",
		"sourceLabel": "主聊天频道",
		"adapter": "MainChatOverlay.get_ai_chat_history_snapshot",
		"channelId": str(channel.get("id", _active_channel_id)).strip_edges(),
		"channelLabel": channel_label if channel_label != "" else "聊天频道",
		"aiPlayerId": resolved_ai_player_id,
		"activeAiPlayerId": _active_ai_player_id,
		"readerId": _active_governor_player_id,
		"filter": _message_filter,
		"backendConnected": _api_client != null,
		"messageCount": int(_channel_message_counts.get(resolved_ai_player_id, matched_messages.size())),
		"seenCount": int(_channel_seen_counts.get(resolved_ai_player_id, 0)),
		"historyCounts": _history_counts.duplicate(true),
		"hasMore": _history_has_more,
		"nextBeforeMessageId": _history_next_before_message_id,
		"messages": visible_messages,
	}

func _find_channel_by_ai_player_id(ai_player_id: String) -> Dictionary:
	var normalized_ai_player_id := ai_player_id.strip_edges()
	if normalized_ai_player_id == "":
		return {}
	for channel_variant in _channels:
		if not (channel_variant is Dictionary):
			continue
		var channel := channel_variant as Dictionary
		if str(channel.get("aiPlayerId", "")).strip_edges() == normalized_ai_player_id:
			return channel
	return {}

func _normalize_ai_panel_history_message(message: Dictionary) -> Dictionary:
	var normalized := message.duplicate(true)
	var metadata_value = normalized.get("metadata", {})
	var metadata: Dictionary = metadata_value as Dictionary if metadata_value is Dictionary else {}
	var kind := _clean_optional_text(normalized.get("kind", "system"))
	if kind == "message":
		var author_type := _clean_optional_text(normalized.get("authorType", metadata.get("authorType", "")))
		kind = "player" if author_type == "governor" else "ai"
	if kind == "":
		kind = "system"
	normalized["kind"] = kind
	normalized["name"] = _clean_optional_text(normalized.get("name", normalized.get("authorName", "")))
	if str(normalized.get("name", "")).strip_edges() == "":
		normalized["name"] = _format_message_display_name(normalized, kind == "player")
	normalized["body"] = _clean_optional_text(normalized.get("body", ""))
	normalized["createdAt"] = _clean_optional_text(normalized.get("createdAt", normalized.get("timestamp", "")))
	normalized["aiPlayerId"] = _clean_optional_text(normalized.get("aiPlayerId", metadata.get("aiPlayerId", "")))
	normalized["failureCode"] = _clean_optional_text(normalized.get("failureCode", metadata.get("failureCode", "")))
	normalized["metadata"] = metadata
	return normalized

func _message_belongs_to_ai_history(message: Dictionary, ai_player_id: String) -> bool:
	var normalized_ai_player_id := ai_player_id.strip_edges()
	if normalized_ai_player_id == "":
		return true
	var metadata: Dictionary = message.get("metadata", {}) as Dictionary
	var message_ai_player_id := _clean_optional_text(message.get("aiPlayerId", ""))
	if message_ai_player_id == "":
		message_ai_player_id = _clean_optional_text(metadata.get("aiPlayerId", ""))
	if message_ai_player_id == "":
		message_ai_player_id = _clean_optional_text(metadata.get("targetAiPlayerId", ""))
	if message_ai_player_id != "":
		return message_ai_player_id == normalized_ai_player_id
	return _active_ai_player_id.strip_edges() == normalized_ai_player_id

func _normalize_backend_message(message: Dictionary) -> Dictionary:
	var kind := _clean_optional_text(message.get("kind", "message"))
	if kind == "":
		kind = "message"
	var author_type := _clean_optional_text(message.get("authorType", "system"))
	if author_type == "":
		author_type = "system"
	var normalized_kind := kind
	if kind == "message":
		normalized_kind = "player" if author_type == "governor" else "ai"
	return {
		"messageId": _clean_optional_text(message.get("messageId", "")),
		"kind": normalized_kind,
		"authorType": author_type,
		"aiPlayerId": _clean_optional_text(message.get("aiPlayerId", "")),
		"name": _clean_optional_text(message.get("authorName", "系统")),
		"body": _clean_optional_text(message.get("body", "")),
		"createdAt": _clean_optional_text(message.get("createdAt", message.get("timestamp", ""))),
		"proposalId": _clean_optional_text(message.get("proposalId", "")),
		"receiptProposalId": _clean_optional_text(message.get("receiptProposalId", "")),
		"action": _clean_optional_text(message.get("action", "")),
		"receiptOk": bool(message.get("receiptOk", false)),
		"failureCode": _clean_optional_text(message.get("failureCode", "")),
		"metadata": message.get("metadata", {}),
	}

func _clean_optional_text(value) -> String:
	if value == null:
		return ""
	var text := str(value).strip_edges()
	if text == "<null>" or text.to_lower() == "null":
		return ""
	return text

func _append_backend_failure_response(prefix: String, response: Dictionary) -> void:
	var data: Dictionary = response.get("data", {}) as Dictionary
	var chat_message: Dictionary = {}
	var chat_message_value = data.get("chatMessage", {})
	if chat_message_value is Dictionary:
		chat_message = chat_message_value as Dictionary
	if not chat_message.is_empty():
		_messages.append(_normalize_backend_message(chat_message))
		_render_messages()
		return
	var failure_code := str(data.get("failureCode", "")).strip_edges()
	var recovery_hint: Dictionary = _extract_response_recovery_hint(response)
	var body := "%s：%s" % [prefix, _extract_error_text(response)]
	var recovery_summary := str(recovery_hint.get("summary", "")).strip_edges()
	if recovery_summary != "":
		body = "%s\n恢复建议：%s" % [body, recovery_summary]
	_append_system_message(body, {
		"failureCode": failure_code,
		"recoveryHint": recovery_hint,
	})

func _extract_response_recovery_hint(response: Dictionary) -> Dictionary:
	var data: Dictionary = response.get("data", {}) as Dictionary
	var recovery_hint_value = data.get("recoveryHint", {})
	if recovery_hint_value is Dictionary:
		return recovery_hint_value as Dictionary
	return {}

func _append_system_message(body: String, metadata: Dictionary = {}) -> void:
	_messages.append({
		"kind": "system",
		"name": "系统",
		"body": body,
		"metadata": metadata,
		"failureCode": str(metadata.get("failureCode", "")),
	})
	_render_messages()

func _set_status(text: String) -> void:
	if _status_label != null:
		_status_label.text = text

func _extract_error_text(response: Dictionary) -> String:
	var data: Dictionary = response.get("data", {}) as Dictionary
	var error := str(data.get("error", response.get("error", "unknown_error"))).strip_edges()
	if error == "":
		error = "unknown_error"
	return error

func _format_resources(resources: Dictionary) -> String:
	var parts: Array[String] = []
	var labels := {
		"food": "粮草",
		"wood": "木材",
		"stone": "石料",
		"iron": "铁矿",
	}
	for key in ["food", "wood", "stone", "iron"]:
		var amount := int(resources.get(key, 0))
		if amount > 0:
			parts.append("%s %d" % [labels[key], amount])
	if parts.is_empty():
		return "无"
	return "、".join(parts)

func _format_reward(reward: Dictionary) -> String:
	var parts: Array[String] = []
	var labels := {
		"food": "粮草",
		"ap": "行动点",
	}
	for key in ["food", "ap"]:
		var amount := int(reward.get(key, 0))
		if amount > 0:
			parts.append("%s %d" % [labels[key], amount])
	if parts.is_empty():
		return "无"
	return "、".join(parts)

func _make_panel_style(bg: Color, border: Color, radius: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = bg
	style.border_color = border
	style.border_width_left = 1
	style.border_width_top = 1
	style.border_width_right = 1
	style.border_width_bottom = 1
	style.corner_radius_top_left = radius
	style.corner_radius_top_right = radius
	style.corner_radius_bottom_left = radius
	style.corner_radius_bottom_right = radius
	return style
