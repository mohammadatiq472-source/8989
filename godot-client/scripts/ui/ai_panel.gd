extends "res://scripts/ui/slg_snapshot_panel.gd"
class_name AIPanel

var _name_edit_popup: PanelContainer = null
var _name_edit_input: LineEdit = null
var _name_edit_status: Label = null
var _context_file_popup: PanelContainer = null
var _context_file_title_input: LineEdit = null
var _context_file_kind_option: OptionButton = null
var _context_file_content_input: TextEdit = null
var _context_file_status: Label = null
var _context_file_dialog: FileDialog = null
var _context_file_source_name := ""
var _avatar_select_popup: PanelContainer = null
var _avatar_select_grid: GridContainer = null
var _avatar_select_status: Label = null

const AI_CHAT_PORTRAIT_MANIFEST := "res://data/ai_chat_portraits.json"
const MAX_CONTEXT_FILE_CHARS := 6000
const CONTEXT_IMAGE_EXTENSIONS := ["png", "jpg", "jpeg", "webp"]

func _init() -> void:
	panel_title = "AI"
	panel_subtitle = ""
	panel_empty_state_text = "等待 AI 域数据。"

func _ready() -> void:
	super._ready()
	if _is_truthy_env("SLG_MAINLINE_VISUAL_SMOKE"):
		call_deferred("_request_visual_smoke_ai_players_refresh")
	if _is_truthy_env("SLG_AI_PANEL_VISUAL_SMOKE_OPEN_AVATAR_SELECT"):
		call_deferred("_open_avatar_select_popup")

func _is_truthy_env(name: String) -> bool:
	var value := OS.get_environment(name).strip_edges().to_lower()
	return value == "1" or value == "true" or value == "yes" or value == "on"

func set_ai_snapshot(snapshot: Dictionary) -> void:
	set_snapshot(snapshot)

func set_active_page_id(page_id: String) -> void:
	var smoke_page_id := OS.get_environment("SLG_AI_PANEL_VISUAL_SMOKE_PAGE").strip_edges()
	if _is_truthy_env("SLG_MAINLINE_VISUAL_SMOKE") and smoke_page_id != "":
		super.set_active_page_id(smoke_page_id)
		return
	super.set_active_page_id(page_id)

func _request_visual_smoke_ai_players_refresh() -> void:
	await get_tree().process_frame
	await get_tree().process_frame
	page_action_requested.emit(get_active_page_id(), "ai_players_refresh")

func _on_section_page_action_requested(action_id: String) -> void:
	if action_id.begins_with("ai_sidebar_open:"):
		var page_id := action_id.trim_prefix("ai_sidebar_open:").strip_edges()
		if page_id != "":
			set_active_page_id(page_id)
			page_changed.emit(page_id)
		return
	if action_id == "ai_player_display_name_edit":
		_open_name_edit_popup()
		return
	if action_id == "ai_player_context_document_open":
		_open_context_file_popup()
		return
	if action_id == "ai_player_context_document_file_open":
		_open_context_file_popup()
		call_deferred("_open_context_file_dialog")
		return
	if action_id == "ai_player_avatar_select_open":
		_open_avatar_select_popup()
		return
	if action_id == "ai_player_open_chat_channel":
		_open_main_chat_channel()
		return
	page_action_requested.emit(get_active_page_id(), action_id)

func _open_main_chat_channel() -> void:
	var chat_overlay := _find_main_chat_overlay()
	if chat_overlay != null and chat_overlay.has_method("open_ai_player_channel"):
		chat_overlay.call("open_ai_player_channel", _resolve_primary_ai_player_id_for_chat())
	close_requested.emit()

func _find_main_chat_overlay() -> Node:
	var tree := get_tree()
	if tree == null or tree.root == null:
		return null
	return tree.root.find_child("MainChatOverlay", true, false)

func _resolve_primary_ai_player_id_for_chat() -> String:
	var shared_state: Dictionary = _snapshot.get("shared_state", {}) as Dictionary
	var ai_player_id := str(shared_state.get("ai_player_primary_id", "")).strip_edges()
	if ai_player_id == "未选择":
		return ""
	return ai_player_id

func _open_name_edit_popup() -> void:
	_ensure_name_edit_popup()
	if _name_edit_popup == null:
		return
	if _name_edit_input != null:
		_name_edit_input.text = _resolve_current_display_name()
		_name_edit_input.select_all()
	if _name_edit_status != null:
		_name_edit_status.text = "保存后会同步到AI玩家档案。"
	_name_edit_popup.visible = true
	if _name_edit_input != null:
		_name_edit_input.call_deferred("grab_focus")

func _ensure_name_edit_popup() -> void:
	if _name_edit_popup != null and is_instance_valid(_name_edit_popup):
		return
	var popup := PanelContainer.new()
	popup.name = "AINameEditPopup"
	popup.visible = false
	popup.set_anchors_preset(Control.PRESET_CENTER)
	popup.custom_minimum_size = Vector2(420, 0)
	popup.add_theme_stylebox_override("panel", _make_name_edit_style())
	add_child(popup)
	_name_edit_popup = popup

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 18)
	margin.add_theme_constant_override("margin_top", 16)
	margin.add_theme_constant_override("margin_right", 18)
	margin.add_theme_constant_override("margin_bottom", 16)
	popup.add_child(margin)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 10)
	margin.add_child(column)

	var title := Label.new()
	title.text = "编辑AI玩家名称"
	title.add_theme_font_size_override("font_size", 18)
	column.add_child(title)

	var input := LineEdit.new()
	input.placeholder_text = "输入新的 AI 名称"
	input.text_submitted.connect(_on_name_edit_submitted)
	column.add_child(input)
	_name_edit_input = input

	var status := Label.new()
	status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status.add_theme_font_size_override("font_size", 12)
	column.add_child(status)
	_name_edit_status = status

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	column.add_child(row)

	var save := Button.new()
	save.text = "保存"
	save.pressed.connect(_on_name_edit_confirmed)
	row.add_child(save)

	var cancel := Button.new()
	cancel.text = "取消"
	cancel.pressed.connect(_close_name_edit_popup)
	row.add_child(cancel)

func _make_name_edit_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.07, 0.08, 0.08, 0.96)
	style.border_color = Color(0.78, 0.68, 0.48, 0.45)
	style.border_width_left = 1
	style.border_width_top = 1
	style.border_width_right = 1
	style.border_width_bottom = 1
	style.corner_radius_top_left = 6
	style.corner_radius_top_right = 6
	style.corner_radius_bottom_left = 6
	style.corner_radius_bottom_right = 6
	return style

func _resolve_current_display_name() -> String:
	var shared_state: Dictionary = _snapshot.get("shared_state", {}) as Dictionary
	var display_name := str(shared_state.get("ai_player_primary_display_name", "")).strip_edges()
	if display_name != "":
		return display_name
	return str(shared_state.get("ai_player_primary_id", "")).strip_edges()

func _on_name_edit_submitted(_text: String) -> void:
	_on_name_edit_confirmed()

func _on_name_edit_confirmed() -> void:
	if _name_edit_input == null:
		return
	var next_name := _name_edit_input.text.strip_edges()
	if next_name == "":
		if _name_edit_status != null:
			_name_edit_status.text = "名称不能为空。"
		return
	_close_name_edit_popup()
	page_action_requested.emit(get_active_page_id(), "ai_player_display_name_save:%s" % next_name.uri_encode())

func _close_name_edit_popup() -> void:
	if _name_edit_popup != null:
		_name_edit_popup.visible = false

func _open_context_file_popup() -> void:
	_ensure_context_file_popup()
	if _context_file_popup == null:
		return
	if _context_file_title_input != null and _context_file_title_input.text.strip_edges() == "":
		_context_file_title_input.text = "%s 身份与作战说明" % _resolve_current_display_name()
	if _context_file_content_input != null and _context_file_content_input.text.strip_edges() == "":
		_context_file_content_input.text = "身份：我是当前势力的AI玩家。\n目标：先说明意图、收益和风险，再等待玩家批准。\n汇报：每次行动后说明资源、目标、风险和下一步。"
	if _context_file_status != null:
		_context_file_status.text = "可选择本地 txt/md/skll 文件，也可以直接粘贴身份、记忆或 SKLL 文档。"
	_context_file_popup.visible = true

func _ensure_context_file_popup() -> void:
	if _context_file_popup != null and is_instance_valid(_context_file_popup):
		return
	var popup := PanelContainer.new()
	popup.name = "AIContextFilePopup"
	popup.visible = false
	popup.set_anchors_preset(Control.PRESET_CENTER)
	popup.custom_minimum_size = Vector2(680, 0)
	popup.add_theme_stylebox_override("panel", _make_name_edit_style())
	add_child(popup)
	_context_file_popup = popup

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 18)
	margin.add_theme_constant_override("margin_top", 16)
	margin.add_theme_constant_override("margin_right", 18)
	margin.add_theme_constant_override("margin_bottom", 16)
	popup.add_child(margin)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 10)
	margin.add_child(column)

	var title := Label.new()
	title.text = "添加身份文件"
	title.add_theme_font_size_override("font_size", 24)
	column.add_child(title)

	var type_row := HBoxContainer.new()
	type_row.add_theme_constant_override("separation", 8)
	column.add_child(type_row)

	_context_file_kind_option = OptionButton.new()
	_context_file_kind_option.custom_minimum_size = Vector2(128, 54)
	_context_file_kind_option.add_theme_font_size_override("font_size", 18)
	_context_file_kind_option.add_item("身份", 0)
	_context_file_kind_option.add_item("记忆", 1)
	_context_file_kind_option.add_item("SKLL", 2)
	_context_file_kind_option.add_item("指令", 3)
	type_row.add_child(_context_file_kind_option)

	_context_file_title_input = LineEdit.new()
	_context_file_title_input.placeholder_text = "文件标题"
	_context_file_title_input.custom_minimum_size = Vector2(0, 54)
	_context_file_title_input.add_theme_font_size_override("font_size", 18)
	_context_file_title_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	type_row.add_child(_context_file_title_input)

	_context_file_content_input = TextEdit.new()
	_context_file_content_input.custom_minimum_size = Vector2(0, 240)
	_context_file_content_input.add_theme_font_size_override("font_size", 18)
	_context_file_content_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_context_file_content_input.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	column.add_child(_context_file_content_input)

	_context_file_status = Label.new()
	_context_file_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_context_file_status.add_theme_font_size_override("font_size", 16)
	column.add_child(_context_file_status)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	column.add_child(row)

	var choose := Button.new()
	choose.text = "选择文件"
	choose.custom_minimum_size = Vector2(150, 58)
	choose.add_theme_font_size_override("font_size", 18)
	choose.pressed.connect(_open_context_file_dialog)
	row.add_child(choose)

	var save := Button.new()
	save.text = "保存到AI玩家档案"
	save.custom_minimum_size = Vector2(210, 58)
	save.add_theme_font_size_override("font_size", 18)
	save.pressed.connect(_on_context_file_confirmed)
	row.add_child(save)

	var cancel := Button.new()
	cancel.text = "取消"
	cancel.custom_minimum_size = Vector2(120, 58)
	cancel.add_theme_font_size_override("font_size", 18)
	cancel.pressed.connect(_close_context_file_popup)
	row.add_child(cancel)

	_context_file_dialog = FileDialog.new()
	_context_file_dialog.file_mode = FileDialog.FILE_MODE_OPEN_FILE
	_context_file_dialog.access = FileDialog.ACCESS_FILESYSTEM
	_context_file_dialog.filters = PackedStringArray(["*.txt,*.md,*.skll,*.skill ; AI identity text", "*.* ; All files"])
	_context_file_dialog.file_selected.connect(_on_context_file_selected)
	add_child(_context_file_dialog)

func _open_context_file_dialog() -> void:
	_ensure_context_file_popup()
	if _context_file_dialog != null:
		_context_file_dialog.popup_centered_ratio(0.72)

func _on_context_file_selected(path: String) -> void:
	var content := ""
	_context_file_source_name = path.get_file()
	if _is_context_image_file(path):
		if _context_file_status != null:
			_context_file_status.text = "图片身份入口暂未开放。请先使用自选头像，或导入 txt / md / skll 身份文件。"
		return
	else:
		content = FileAccess.get_file_as_string(path)
		if FileAccess.get_open_error() != OK:
			if _context_file_status != null:
				_context_file_status.text = "文件读取失败。"
			return
	if _context_file_title_input != null:
		_context_file_title_input.text = _context_file_source_name
	if content.length() > MAX_CONTEXT_FILE_CHARS:
		content = content.substr(0, MAX_CONTEXT_FILE_CHARS)
		if _context_file_status != null:
			_context_file_status.text = "文件已读取，并截取前 %d 字符作为 AI 上下文。" % MAX_CONTEXT_FILE_CHARS
	elif _context_file_status != null:
		_context_file_status.text = "文件已读取：%s" % _context_file_source_name
	if _context_file_content_input != null:
		_context_file_content_input.text = content

func _is_context_image_file(path: String) -> bool:
	var extension := path.get_extension().to_lower().strip_edges()
	return CONTEXT_IMAGE_EXTENSIONS.has(extension)

func _on_context_file_confirmed() -> void:
	if _context_file_title_input == null or _context_file_content_input == null:
		return
	var title := _context_file_title_input.text.strip_edges()
	var content := _context_file_content_input.text.strip_edges()
	if title == "":
		if _context_file_status != null:
			_context_file_status.text = "标题不能为空。"
		return
	if content == "":
		if _context_file_status != null:
			_context_file_status.text = "文件内容不能为空。"
		return
	if content.length() > MAX_CONTEXT_FILE_CHARS:
		content = content.substr(0, MAX_CONTEXT_FILE_CHARS)
	var kind := _resolve_selected_context_file_kind()
	_close_context_file_popup()
	page_action_requested.emit(
		get_active_page_id(),
		"ai_player_context_document_add:%s:%s:%s:%s" % [
			kind.uri_encode(),
			title.uri_encode(),
			_context_file_source_name.uri_encode(),
			content.uri_encode(),
		]
	)

func _resolve_selected_context_file_kind() -> String:
	if _context_file_kind_option == null:
		return "identity"
	match _context_file_kind_option.selected:
		1:
			return "memory"
		2:
			return "skill"
		3:
			return "instruction"
		_:
			return "identity"

func _close_context_file_popup() -> void:
	if _context_file_popup != null:
		_context_file_popup.visible = false

func _open_avatar_select_popup() -> void:
	_ensure_avatar_select_popup()
	if _avatar_select_popup == null:
		return
	_populate_avatar_select_grid()
	if _avatar_select_status != null:
		_avatar_select_status.text = "选择后会同步到AI玩家档案，刷新后用于聊天头像和管理卡片。"
	_avatar_select_popup.visible = true

func _ensure_avatar_select_popup() -> void:
	if _avatar_select_popup != null and is_instance_valid(_avatar_select_popup):
		return
	var popup := PanelContainer.new()
	popup.name = "AIAvatarSelectPopup"
	popup.visible = false
	popup.set_anchors_preset(Control.PRESET_CENTER)
	popup.custom_minimum_size = Vector2(700, 500)
	popup.add_theme_stylebox_override("panel", _make_name_edit_style())
	add_child(popup)
	_avatar_select_popup = popup

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 18)
	margin.add_theme_constant_override("margin_top", 16)
	margin.add_theme_constant_override("margin_right", 18)
	margin.add_theme_constant_override("margin_bottom", 16)
	popup.add_child(margin)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 10)
	margin.add_child(column)

	var title := Label.new()
	title.text = "选择AI玩家头像"
	title.add_theme_font_size_override("font_size", 24)
	column.add_child(title)

	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(0, 340)
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(scroll)

	var grid := GridContainer.new()
	grid.columns = 3
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	scroll.add_child(grid)
	_avatar_select_grid = grid

	var status := Label.new()
	status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status.add_theme_font_size_override("font_size", 16)
	column.add_child(status)
	_avatar_select_status = status

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	column.add_child(row)

	var close := Button.new()
	close.text = "关闭"
	close.custom_minimum_size = Vector2(140, 58)
	close.add_theme_font_size_override("font_size", 18)
	close.pressed.connect(_close_avatar_select_popup)
	row.add_child(close)

func _populate_avatar_select_grid() -> void:
	if _avatar_select_grid == null:
		return
	for child in _avatar_select_grid.get_children():
		child.queue_free()
	var portraits := _load_avatar_portrait_options()
	if portraits.is_empty():
		if _avatar_select_status != null:
			_avatar_select_status.text = "没有找到可选头像清单。"
		return
	for portrait_variant in portraits:
		if not (portrait_variant is Dictionary):
			continue
		var portrait: Dictionary = portrait_variant as Dictionary
		var avatar_id := str(portrait.get("id", "")).strip_edges()
		var avatar_image_path := str(portrait.get("image", portrait.get("portraitPath", ""))).strip_edges()
		if avatar_id == "" or avatar_image_path == "":
			continue
		var display_name := str(portrait.get("display_name", avatar_id)).strip_edges()
		var button := Button.new()
		button.text = display_name
		button.custom_minimum_size = Vector2(198, 86)
		button.add_theme_font_size_override("font_size", 17)
		button.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		var texture := _load_avatar_texture(avatar_image_path)
		if texture != null:
			button.icon = texture
			button.expand_icon = true
		button.set_meta("avatar_id", avatar_id)
		button.set_meta("avatar_image_path", avatar_image_path)
		button.pressed.connect(_on_avatar_button_pressed.bind(button))
		_avatar_select_grid.add_child(button)

func _load_avatar_portrait_options() -> Array:
	if not FileAccess.file_exists(AI_CHAT_PORTRAIT_MANIFEST):
		return []
	var raw := FileAccess.get_file_as_string(AI_CHAT_PORTRAIT_MANIFEST)
	if FileAccess.get_open_error() != OK or raw.strip_edges() == "":
		return []
	var parsed = JSON.parse_string(raw)
	if not (parsed is Dictionary):
		return []
	var portraits_value = (parsed as Dictionary).get("portraits", [])
	if not (portraits_value is Array):
		return []
	var portraits: Array = []
	for portrait_variant in portraits_value as Array:
		if not (portrait_variant is Dictionary):
			continue
		var portrait: Dictionary = portrait_variant as Dictionary
		if bool(portrait.get("selectable", true)):
			portraits.append(portrait)
	return portraits

func _load_avatar_texture(path: String) -> Texture2D:
	if path.strip_edges() == "" or not FileAccess.file_exists(path):
		return null
	var image := Image.new()
	var load_result := image.load(path)
	if load_result != OK:
		return null
	return ImageTexture.create_from_image(image)

func _on_avatar_button_pressed(button: Button) -> void:
	var avatar_id := str(button.get_meta("avatar_id", "")).strip_edges()
	var avatar_image_path := str(button.get_meta("avatar_image_path", "")).strip_edges()
	if avatar_id == "" or avatar_image_path == "":
		if _avatar_select_status != null:
			_avatar_select_status.text = "头像数据缺失，无法保存。"
		return
	_close_avatar_select_popup()
	page_action_requested.emit(
		get_active_page_id(),
		"ai_player_avatar_save:%s:%s" % [
			avatar_id.uri_encode(),
			avatar_image_path.uri_encode(),
		]
	)

func _close_avatar_select_popup() -> void:
	if _avatar_select_popup != null:
		_avatar_select_popup.visible = false
