extends RefCounted
class_name ChildPageBlockFactory

func build_section_page(section_payload: Dictionary, action_callback: Callable = Callable()) -> Control:
	_emit_legacy_contract_warnings(section_payload)
	var root := VBoxContainer.new()
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_theme_constant_override("separation", 12)

	var summary_card := _build_summary_card(section_payload)
	if summary_card != null:
		root.add_child(summary_card)

	var body_row := HBoxContainer.new()
	body_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body_row.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body_row.add_theme_constant_override("separation", 12)
	root.add_child(body_row)

	body_row.add_child(_build_item_card_panel(section_payload))
	body_row.add_child(_build_content_block_column(section_payload, action_callback))
	return root


func _emit_legacy_contract_warnings(section_payload: Dictionary) -> void:
	if not OS.is_debug_build():
		return
	var legacy_keys: Array[String] = []
	if str(section_payload.get("section_summary", "")).strip_edges() != "":
		legacy_keys.append("section_summary")
	if not _coerce_string_array(section_payload.get("items", [])).is_empty():
		legacy_keys.append("items")
	if not _coerce_string_array(section_payload.get("detail_lines", [])).is_empty():
		legacy_keys.append("detail_lines")
	if not _coerce_string_array(section_payload.get("footer_lines", [])).is_empty():
		legacy_keys.append("footer_lines")
	var actions_variant: Variant = section_payload.get("actions", [])
	if actions_variant is Array and not (actions_variant as Array).is_empty():
		legacy_keys.append("actions")
	if legacy_keys.is_empty():
		return
	var page_id := str(section_payload.get("page_id", section_payload.get("id", section_payload.get("title", "unknown_page")))).strip_edges()
	if page_id == "":
		page_id = "unknown_page"
	var message := (
		"ChildPageBlockFactory received legacy top-level fields for %s: %s. UI mainline must provide explicit summary_lines/item_cards/content_blocks and button_row blocks only."
		% [page_id, ", ".join(legacy_keys)]
	)
	push_error(message)
	assert(false, message)

func _build_summary_card(section_payload: Dictionary) -> Control:
	var title := str(section_payload.get("summary_title", section_payload.get("title", ""))).strip_edges()
	if title == "":
		return null
	var summary_lines := _coerce_string_array(section_payload.get("summary_lines", []))
	if summary_lines.is_empty():
		summary_lines = ["当前切项已进入 child page 结构化展示。"]

	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_apply_panel_linework(panel, Color(0.10, 0.10, 0.12, 0.92), Color(0.28, 0.28, 0.30, 0.92))

	var margin := MarginContainer.new()
	_apply_margin(margin, 14, 12, 14, 12)
	panel.add_child(margin)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 6)
	margin.add_child(column)

	column.add_child(_build_label(title, 18, Color(0.92, 0.92, 0.94, 0.98)))
	for summary_line in summary_lines:
		column.add_child(_build_label(summary_line, 13, Color(0.78, 0.78, 0.80, 0.96), true))
	return panel

func _build_item_card_panel(section_payload: Dictionary) -> Control:
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(300, 0)
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_apply_panel_linework(panel, Color(0.11, 0.11, 0.13, 0.94), Color(0.30, 0.30, 0.32, 0.92))

	var margin := MarginContainer.new()
	_apply_margin(margin, 12, 12, 12, 12)
	panel.add_child(margin)

	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 8)
	margin.add_child(column)

	column.add_child(_build_label(str(section_payload.get("list_title", "列表")), 15, Color(0.84, 0.84, 0.86, 0.98)))

	var cards_grid := GridContainer.new()
	cards_grid.columns = 1
	cards_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cards_grid.size_flags_vertical = Control.SIZE_EXPAND_FILL
	cards_grid.add_theme_constant_override("h_separation", 8)
	cards_grid.add_theme_constant_override("v_separation", 8)
	column.add_child(cards_grid)

	var item_cards := _resolve_item_cards(section_payload)
	if item_cards.is_empty():
		cards_grid.add_child(_build_text_block(
			{
				"title": "当前项",
				"lines": ["暂无切项内容。"],
				"node_name": "ChildPageEmptyItemBlock",
			}
		))
	else:
		for card_variant in item_cards:
			if not (card_variant is Dictionary):
				continue
			cards_grid.add_child(_build_item_card(card_variant as Dictionary))
	return panel

func _build_content_block_column(section_payload: Dictionary, action_callback: Callable = Callable()) -> Control:
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_apply_panel_linework(panel, Color(0.11, 0.11, 0.13, 0.94), Color(0.30, 0.30, 0.32, 0.92))

	var margin := MarginContainer.new()
	_apply_margin(margin, 14, 14, 14, 14)
	panel.add_child(margin)

	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 10)
	margin.add_child(column)

	for block_variant in _resolve_content_blocks(section_payload):
		if not (block_variant is Dictionary):
			continue
		var block_payload := block_variant as Dictionary
		var kind := str(block_payload.get("kind", "text_block")).strip_edges()
		match kind:
			"button_row":
				column.add_child(_build_action_block(block_payload, action_callback))
			_:
				column.add_child(_build_text_block(block_payload))
	return panel

func _build_item_card(card_payload: Dictionary) -> Control:
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_apply_panel_linework(panel, Color(0.13, 0.13, 0.15, 0.95), Color(0.34, 0.34, 0.36, 0.92))

	var margin := MarginContainer.new()
	_apply_margin(margin, 10, 10, 10, 10)
	panel.add_child(margin)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 4)
	margin.add_child(column)

	var title := str(card_payload.get("title", "")).strip_edges()
	var value := str(card_payload.get("value", "")).strip_edges()
	var meta := str(card_payload.get("meta", "")).strip_edges()
	var description := str(card_payload.get("description", "")).strip_edges()
	if title != "":
		column.add_child(_build_label(title, 14, Color(0.92, 0.92, 0.94, 0.98)))
	if value != "":
		column.add_child(_build_label(value, 13, Color(0.82, 0.74, 0.60, 0.98), true))
	if meta != "":
		column.add_child(_build_label(meta, 12, Color(0.72, 0.82, 0.76, 0.96), true))
	if description != "":
		column.add_child(_build_label(description, 12, Color(0.78, 0.78, 0.80, 0.94), true))
	return panel

func _build_text_block(block_payload: Dictionary) -> Control:
	var panel := PanelContainer.new()
	var node_name := str(block_payload.get("node_name", "")).strip_edges()
	if node_name != "":
		panel.name = node_name
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_apply_panel_linework(panel, Color(0.12, 0.12, 0.14, 0.95), Color(0.34, 0.34, 0.36, 0.92))

	var margin := MarginContainer.new()
	_apply_margin(margin, 12, 12, 12, 12)
	panel.add_child(margin)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 6)
	margin.add_child(column)

	var title := str(block_payload.get("title", "")).strip_edges()
	if title != "":
		column.add_child(_build_label(title, 15, Color(0.84, 0.84, 0.86, 0.98)))
	for line in _coerce_string_array(block_payload.get("lines", [])):
		column.add_child(_build_label(line, 13, Color(0.78, 0.78, 0.80, 0.96), true))
	return panel

func _build_action_block(block_payload: Dictionary, action_callback: Callable = Callable()) -> Control:
	var panel := PanelContainer.new()
	var node_name := str(block_payload.get("node_name", "")).strip_edges()
	if node_name != "":
		panel.name = node_name
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_apply_panel_linework(panel, Color(0.12, 0.12, 0.14, 0.95), Color(0.34, 0.34, 0.36, 0.92))

	var margin := MarginContainer.new()
	_apply_margin(margin, 12, 12, 12, 12)
	panel.add_child(margin)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	margin.add_child(column)

	var title := str(block_payload.get("title", "动作")).strip_edges()
	column.add_child(_build_label(title, 15, Color(0.84, 0.84, 0.86, 0.98)))

	var wrap := HFlowContainer.new()
	wrap.add_theme_constant_override("h_separation", 8)
	wrap.add_theme_constant_override("v_separation", 8)
	wrap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_child(wrap)

	var actions := block_payload.get("actions", []) as Array
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
		if action_callback.is_valid():
			button.pressed.connect(action_callback.bind(action_id))
		wrap.add_child(button)
	return panel

func _resolve_item_cards(section_payload: Dictionary) -> Array:
	var raw_cards: Variant = section_payload.get("item_cards", [])
	if raw_cards is Array and not (raw_cards as Array).is_empty():
		return raw_cards as Array
	return []

func _resolve_content_blocks(section_payload: Dictionary) -> Array:
	var raw_blocks: Variant = section_payload.get("content_blocks", [])
	if raw_blocks is Array and not (raw_blocks as Array).is_empty():
		return raw_blocks as Array
	return [{
		"kind": "text_block",
		"title": "当前页",
		"lines": ["当前切项还没有可显示内容。"],
		"node_name": "ChildPageFallbackBlock",
	}]


func _has_nonempty_array(raw_value: Variant) -> bool:
	return raw_value is Array and not (raw_value as Array).is_empty()


func _coerce_string_array(raw_value: Variant) -> Array[String]:
	var result: Array[String] = []
	if raw_value is Array:
		for item in raw_value as Array:
			var text := str(item).strip_edges()
			if text != "":
				result.append(text)
	return result

func _build_label(text: String, font_size: int, color: Color, wrap: bool = false) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART if wrap else TextServer.AUTOWRAP_OFF
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return label

func _apply_margin(container: MarginContainer, left: int, top: int, right: int, bottom: int) -> void:
	container.add_theme_constant_override("margin_left", left)
	container.add_theme_constant_override("margin_top", top)
	container.add_theme_constant_override("margin_right", right)
	container.add_theme_constant_override("margin_bottom", bottom)

func _apply_panel_linework(panel: PanelContainer, bg_color: Color, border_color: Color) -> void:
	var style_box := StyleBoxFlat.new()
	style_box.bg_color = bg_color
	style_box.border_color = border_color
	style_box.set_border_width_all(1)
	panel.add_theme_stylebox_override("panel", style_box)
