extends RefCounted
class_name HeroCardView

const MODE_POOL_PREVIEW := "pool_preview"
const MODE_OWNED_ROSTER := "owned_roster"
const MODE_DRAW_RESULT := "draw_result"
const FormalPackAssetRegistryScript := preload("res://scripts/ui/formal_pack/components/formal_pack_asset_registry.gd")

const HERO_CARD_INPUT_CONTRACT := {
	"identity": ["name", "displayName", "display_name", "faction", "campName", "camp_name", "camp"],
	"hero_template": ["heroTemplateId", "template_id", "templateId", "rarity", "quality", "stars", "starText", "levelPreview", "troopType", "portraitAssetKey"],
	"owned_instance": ["heroInstanceId", "instanceId", "instance_id", "heroCardInstanceId", "level", "soldierCount", "team", "owner", "status"],
	"draw_receipt": ["receiptId", "heroTemplateId", "templateId", "heroInstanceId", "instanceId", "portraitAssetKey", "rarity"],
	"visual": ["tone", "portraitAssetKey", "asset_key"],
}

const HERO_CARD_MODE_CONTRACT := {
	MODE_POOL_PREVIEW: {
		"source": "HeroTemplateCatalog / RecruitPoolCatalog.candidateHeroTemplateIds",
		"shows": ["rarity", "stars", "levelPreview", "troopType"],
		"hides": ["name", "displayName", "team", "owner", "soldierCount"],
	},
	MODE_OWNED_ROSTER: {
		"source": "OwnedHeroState + HeroTemplateCatalog",
		"shows": ["name", "campName", "rarity", "level", "soldierCount", "team", "owner", "status"],
		"action": "open_hero_profile:<heroInstanceId>",
	},
	MODE_DRAW_RESULT: {
		"source": "backend draw receipt + HeroTemplateCatalog",
		"shows": ["name", "campName", "rarity", "level", "troopType", "result"],
		"action": "continue same draw count",
	},
}

const TEXT_MAIN := Color(0.930, 0.900, 0.820, 1.0)
const TEXT_MUTED := Color(0.690, 0.670, 0.600, 1.0)
const TEXT_GOLD := Color(0.960, 0.730, 0.330, 1.0)
const TEXT_GREEN := Color(0.420, 0.760, 0.470, 1.0)

static func build_card(entry: Dictionary, mode: String, config: Dictionary = {}) -> Button:
	var card_entry := normalize_entry(entry, mode)
	var card_width := float(config.get("width", 224.0))
	var card_height := float(config.get("height", 336.0))
	var compact := bool(config.get("compact", false))
	var clickable := bool(config.get("clickable", true))
	var card_id := str(card_entry.get("id", "hero_card"))

	var button := Button.new()
	button.name = "HeroCardView_%s_%s" % [mode, card_id]
	button.text = ""
	button.flat = true
	button.focus_mode = Control.FOCUS_NONE
	button.mouse_filter = Control.MOUSE_FILTER_STOP if clickable else Control.MOUSE_FILTER_IGNORE
	button.custom_minimum_size = Vector2(card_width, card_height)
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.size_flags_vertical = Control.SIZE_EXPAND_FILL
	button.add_theme_stylebox_override("normal", _style(Color(0.095, 0.087, 0.074, 0.94), _tone_border(card_entry, 0.72), 2))
	button.add_theme_stylebox_override("hover", _style(Color(0.170, 0.120, 0.067, 0.96), Color(0.950, 0.710, 0.290, 0.90), 2))
	button.add_theme_stylebox_override("pressed", _style(Color(0.170, 0.120, 0.067, 0.96), Color(0.950, 0.710, 0.290, 0.90), 2))
	button.add_theme_stylebox_override("disabled", _style(Color(0.095, 0.087, 0.074, 0.94), _tone_border(card_entry, 0.72), 2))

	var outer_margin := int(config.get("outer_margin", 4))
	var margin := _margin(outer_margin, outer_margin, outer_margin, outer_margin)
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	margin.set_anchors_preset(Control.PRESET_FULL_RECT)
	button.add_child(margin)

	var portrait := _panel(Color(0.110, 0.120, 0.135, 0.92), Color(0.700, 0.560, 0.240, 0.34), 2)
	portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
	portrait.custom_minimum_size = Vector2(0, card_height - float(outer_margin * 2))
	portrait.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	portrait.size_flags_vertical = Control.SIZE_EXPAND_FILL
	margin.add_child(portrait)

	var portrait_margin_value := int(config.get("inner_margin", 5 if not compact else 3))
	var portrait_margin := _margin(portrait_margin_value, portrait_margin_value, portrait_margin_value, portrait_margin_value)
	portrait_margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	portrait.add_child(portrait_margin)
	var visual_config := config.duplicate()
	visual_config["_card_height"] = card_height
	visual_config["_outer_margin"] = outer_margin
	visual_config["_inner_margin"] = portrait_margin_value
	portrait_margin.add_child(_build_portrait_visual(card_entry, mode, compact, visual_config))
	return button

static func build_card_from_receipt(receipt_entry: Dictionary, config: Dictionary = {}) -> Button:
	return build_card(receipt_entry, MODE_DRAW_RESULT, config)

static func input_contract() -> Dictionary:
	return HERO_CARD_INPUT_CONTRACT.duplicate(true)

static func mode_contract() -> Dictionary:
	return HERO_CARD_MODE_CONTRACT.duplicate(true)

static func normalize_entry(raw: Dictionary, mode: String = MODE_OWNED_ROSTER) -> Dictionary:
	var entry := raw.duplicate(true)
	var identity_name := str(_first_value(raw, ["name", "displayName", "display_name", "heroName", "hero_name"], ""))
	var identity_faction := _normalize_faction_label(str(_first_value(raw, ["faction", "campName", "camp_name", "camp", "forceName", "force_name"], "")))
	var rarity := str(_first_value(raw, ["rarity", "quality"], str(entry.get("quality", "")))).strip_edges()
	var stars := str(_first_value(raw, ["stars", "starText", "star_text"], "")).strip_edges()
	if stars == "" and (rarity == "S" or rarity == "S级"):
		stars = "★★★★★"
	elif stars == "" and rarity != "":
		stars = rarity

	entry["id"] = str(_first_value(raw, ["id", "heroInstanceId", "instanceId", "instance_id", "heroCardInstanceId", "cardInstanceId", "heroTemplateId", "template_id"], "hero_card"))
	entry["name"] = identity_name
	entry["display_name"] = identity_name
	entry["faction"] = identity_faction
	entry["camp"] = identity_faction
	entry["tone"] = _faction_tone_key(identity_faction, str(_first_value(raw, ["tone", "toneKey", "visualTone", "visual_tone"], entry.get("tone", ""))))
	entry["quality"] = rarity
	entry["rarity"] = rarity
	entry["stars"] = stars
	entry["level"] = _first_value(raw, ["level", "heroLevel", "hero_level", "levelPreview"], entry.get("level", ""))
	entry["troop"] = _first_value(raw, ["troop", "troopType", "troop_type", "soldierType", "soldier_type"], entry.get("troop", ""))
	entry["power"] = _first_value(raw, ["power", "soldierCount", "soldier_count", "strength"], entry.get("power", ""))
	entry["team"] = _first_value(raw, ["team", "teamName", "team_name", "armyName", "army_name"], entry.get("team", ""))
	entry["owner"] = _first_value(raw, ["owner", "ownerLabel", "owner_label", "controller"], entry.get("owner", ""))
	entry["status"] = _first_value(raw, ["status", "stateLabel", "state_label"], entry.get("status", ""))
	entry["template_id"] = str(_first_value(raw, ["template_id", "heroTemplateId", "templateId"], entry.get("template_id", "")))
	entry["instance_id"] = str(_first_value(raw, ["instance_id", "heroInstanceId", "instanceId", "heroCardInstanceId", "cardInstanceId"], entry.get("instance_id", "")))
	entry["asset_key"] = str(_first_value(raw, ["asset_key", "portraitAssetKey", "portrait_asset_key", "assetKey"], entry.get("asset_key", "")))
	if mode == MODE_DRAW_RESULT:
		entry["result_label"] = str(_first_value(raw, ["result_label", "resultLabel", "rarityLabel"], rarity if rarity != "" else "获得"))
		entry["draw_label"] = str(_first_value(raw, ["draw_label", "drawLabel", "receiptLabel", "status"], entry.get("status", "")))
	return entry

static func _normalize_faction_label(raw_faction: String) -> String:
	var faction := raw_faction.strip_edges()
	match faction:
		"魏", "曹魏":
			return "曹魏"
		"蜀", "汉", "季汉", "纪汉":
			return "季汉"
		"吴", "东吴", "孙吴":
			return "东吴"
		"群", "群雄":
			return "群雄"
		"晋", "晋国":
			return "晋国"
		"东汉":
			return "东汉"
		_:
			return faction

static func _faction_tone_key(faction_label: String, fallback: String = "") -> String:
	match _normalize_faction_label(faction_label):
		"曹魏":
			return "cao_wei"
		"季汉":
			return "ji_han"
		"东吴":
			return "dong_wu"
		"群雄":
			return "qun_xiong"
		"东汉":
			return "dong_han"
		"晋国":
			return "jin"
		_:
			return fallback.strip_edges()

static func _first_value(raw: Dictionary, keys: Array, fallback: Variant = "") -> Variant:
	for key_variant in keys:
		var key := str(key_variant)
		if not raw.has(key):
			continue
		var value: Variant = raw.get(key)
		if value == null:
			continue
		if value is String and value.strip_edges() == "":
			continue
		return value
	return fallback

static func _portrait_texture(entry: Dictionary) -> Texture2D:
	var asset_key := str(entry.get("asset_key", "")).strip_edges()
	if asset_key == "":
		return null
	return FormalPackAssetRegistryScript.portrait_texture(asset_key)

static func _build_portrait_visual(entry: Dictionary, mode: String, compact: bool, config: Dictionary) -> Control:
	var root := Control.new()
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL

	var stage := _panel(_portrait_tone(entry), Color(0.350, 0.270, 0.120, 0.28), 1)
	stage.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stage.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stage.size_flags_vertical = Control.SIZE_EXPAND_FILL
	stage.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_child(stage)

	var stage_margin_value := int(config.get("stage_margin", 6 if not compact else 3))
	var stage_margin := _margin(stage_margin_value, stage_margin_value, stage_margin_value, stage_margin_value)
	stage_margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stage.add_child(stage_margin)

	var stage_col := VBoxContainer.new()
	stage_col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stage_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stage_col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	stage_col.add_theme_constant_override("separation", 0)
	stage_margin.add_child(stage_col)

	_add_top_strip(stage_col, entry, mode, compact, config)

	var asset_slot := Control.new()
	asset_slot.name = "HeroCardAssetSlot"
	asset_slot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	asset_slot.clip_contents = true
	asset_slot.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	asset_slot.size_flags_vertical = Control.SIZE_EXPAND_FILL
	stage_col.add_child(asset_slot)
	var portrait_texture: Texture2D = _portrait_texture(entry)
	if portrait_texture != null:
		var portrait_image := TextureRect.new()
		portrait_image.mouse_filter = Control.MOUSE_FILTER_IGNORE
		portrait_image.texture = portrait_texture
		portrait_image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		portrait_image.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
		portrait_image.set_anchors_preset(Control.PRESET_FULL_RECT)
		asset_slot.add_child(portrait_image)
		var shade := ColorRect.new()
		shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
		shade.color = Color(0.020, 0.018, 0.014, float(config.get("portrait_shade_alpha", 0.08)))
		shade.set_anchors_preset(Control.PRESET_FULL_RECT)
		asset_slot.add_child(shade)

	if mode == MODE_OWNED_ROSTER:
		_add_roster_overlay(stage_col, entry, compact, config)
	elif mode == MODE_DRAW_RESULT:
		_add_draw_result_overlay(stage_col, entry, compact, config)

	_add_bottom_strip(stage_col, entry, mode, compact, config)
	var show_identity_strip := bool(config.get("show_identity_strip", mode != MODE_POOL_PREVIEW))
	if show_identity_strip:
		var identity_strip := _build_identity_strip(entry, mode, compact, config)
		root.add_child(identity_strip)
	return root

static func _build_identity_strip(entry: Dictionary, mode: String, compact: bool, config: Dictionary) -> Control:
	var left_width := float(config.get("left_strip_width", 42.0 if not compact else 22.0))
	var left_alpha := float(config.get("left_strip_alpha", 0.22 if mode == MODE_OWNED_ROSTER else 0.18))
	var card_height := float(config.get("_card_height", 336.0))
	var outer_margin := float(config.get("_outer_margin", 4.0))
	var inner_margin := float(config.get("_inner_margin", 5.0))
	var usable_height := maxf(72.0, card_height - (outer_margin + inner_margin) * 2.0)
	var strip_height := float(config.get("identity_strip_height", usable_height * 0.50))
	if compact:
		strip_height = float(config.get("identity_strip_height", usable_height * 0.48))
	strip_height = clampf(strip_height, 46.0 if compact else 118.0, usable_height * 0.58)

	var strip := _panel(_identity_strip_bg(entry, left_alpha), _tone_border(entry, 0.72), 1)
	strip.name = "HeroCardIdentityStrip"
	strip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	strip.custom_minimum_size = Vector2(left_width, strip_height)
	strip.size = Vector2(left_width, strip_height)
	strip.position = Vector2.ZERO

	var margin := _margin(2, 6 if not compact else 3, 2, 6 if not compact else 3)
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	strip.add_child(margin)
	var text_col := VBoxContainer.new()
	text_col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	text_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	text_col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	text_col.add_theme_constant_override("separation", 4 if not compact else 2)
	margin.add_child(text_col)

	var faction := str(entry.get("faction", entry.get("camp", config.get("identity_faction_placeholder", "阵营")))).strip_edges()
	var hero_name := str(entry.get("name", entry.get("display_name", config.get("identity_name_placeholder", "待定")))).strip_edges()
	if faction == "":
		faction = str(config.get("identity_faction_placeholder", "阵营"))
	if hero_name == "":
		hero_name = str(config.get("identity_name_placeholder", "待定"))
	var faction_font := int(config.get("identity_faction_font_size", 12 if not compact else 7))
	var name_font := int(config.get("identity_name_font_size", 14 if not compact else 8))
	var faction_label := _compact_label(_vertical_text(faction), faction_font, TEXT_MUTED, HORIZONTAL_ALIGNMENT_CENTER)
	faction_label.custom_minimum_size = Vector2(maxf(10.0, left_width - 4.0), float(faction_font * 4))
	text_col.add_child(faction_label)
	var name_label := _compact_label(_vertical_text(hero_name), name_font, TEXT_MAIN, HORIZONTAL_ALIGNMENT_CENTER)
	name_label.custom_minimum_size = Vector2(maxf(10.0, left_width - 4.0), float(name_font * 6))
	text_col.add_child(name_label)
	text_col.add_spacer(false)
	return strip

static func _add_top_strip(parent: VBoxContainer, entry: Dictionary, mode: String, compact: bool, config: Dictionary) -> void:
	var top_height := float(config.get("top_height", 18.0 if not compact else 14.0))
	var top_alpha := float(config.get("top_alpha", 0.18 if mode == MODE_OWNED_ROSTER else 0.14))
	var top := _panel(Color(0.020, 0.020, 0.020, top_alpha), Color(0.200, 0.170, 0.110, 0.12), 1)
	top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	top.custom_minimum_size = Vector2(0, top_height)
	parent.add_child(top)

	var left_width := float(config.get("left_strip_width", 42.0 if not compact else 22.0))
	var top_margin_left := int(config.get("top_margin_left", left_width + (16.0 if not compact else 6.0)))
	var top_margin := _margin(top_margin_left, 1, 5, 1)
	top_margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	top.add_child(top_margin)

	var top_row := HBoxContainer.new()
	top_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	top_margin.add_child(top_row)

	var left_text := "兵力%s" % str(entry.get("power", ""))
	if mode == MODE_POOL_PREVIEW:
		left_text = "Lv.%s" % str(entry.get("level", ""))
	elif mode == MODE_DRAW_RESULT:
		left_text = str(entry.get("result_label", "获得"))

	var top_font := int(config.get("top_font_size", 11 if not compact else 9))
	var left_label := _compact_label(left_text, top_font, TEXT_MAIN)
	left_label.custom_minimum_size = Vector2(float(config.get("top_left_width", 72.0 if not compact else 38.0)), 0)
	top_row.add_child(left_label)
	top_row.add_spacer(false)
	var top_stars := _compact_label(str(entry.get("stars", "")), top_font, TEXT_GOLD, HORIZONTAL_ALIGNMENT_RIGHT)
	top_stars.custom_minimum_size = Vector2(float(config.get("top_stars_width", 56.0 if not compact else 36.0)), 0)
	top_row.add_child(top_stars)

static func _add_roster_overlay(parent: VBoxContainer, entry: Dictionary, compact: bool, config: Dictionary) -> void:
	var overlay_height := float(config.get("overlay_height", 56.0 if not compact else 42.0))
	var overlay_alpha := float(config.get("overlay_alpha", 0.26))
	var overlay := _panel(Color(0.025, 0.024, 0.023, overlay_alpha), Color(0.360, 0.290, 0.150, 0.18), 1)
	overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.custom_minimum_size = Vector2(0, overlay_height)
	parent.add_child(overlay)

	var overlay_margin := _margin(6, 5, 6, 5)
	overlay_margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.add_child(overlay_margin)
	var overlay_col := VBoxContainer.new()
	overlay_col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay_col.add_theme_constant_override("separation", 0)
	overlay_margin.add_child(overlay_col)
	overlay_col.add_child(_compact_label(str(entry.get("team", "")), int(config.get("team_font_size", 18 if not compact else 14)), TEXT_GREEN, HORIZONTAL_ALIGNMENT_CENTER))
	overlay_col.add_child(_compact_label(str(entry.get("owner", "")), int(config.get("owner_font_size", 14 if not compact else 11)), TEXT_MAIN, HORIZONTAL_ALIGNMENT_CENTER))

static func _add_draw_result_overlay(parent: VBoxContainer, entry: Dictionary, compact: bool, config: Dictionary) -> void:
	var overlay := _panel(Color(0.025, 0.024, 0.023, float(config.get("overlay_alpha", 0.26))), Color(0.360, 0.290, 0.150, 0.18), 1)
	overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.custom_minimum_size = Vector2(0, float(config.get("overlay_height", 54.0 if not compact else 40.0)))
	parent.add_child(overlay)
	var overlay_margin := _margin(6, 5, 6, 5)
	overlay_margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.add_child(overlay_margin)
	overlay_margin.add_child(_compact_label(str(entry.get("draw_label", "招募获得")), int(config.get("draw_label_font_size", 18 if not compact else 13)), TEXT_GOLD, HORIZONTAL_ALIGNMENT_CENTER))

static func _add_bottom_strip(parent: VBoxContainer, entry: Dictionary, mode: String, compact: bool, config: Dictionary) -> void:
	var bottom_height := float(config.get("bottom_height", 30.0 if not compact else 20.0))
	var bottom_alpha := float(config.get("bottom_alpha", 0.42 if mode == MODE_OWNED_ROSTER else 0.30))
	var bottom := _panel(Color(0.020, 0.018, 0.020, bottom_alpha), Color(0.460, 0.340, 0.160, 0.20), 1)
	bottom.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bottom.custom_minimum_size = Vector2(0, bottom_height)
	parent.add_child(bottom)

	var bottom_margin := _margin(5, 2, 5, 2)
	bottom_margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bottom.add_child(bottom_margin)

	var bottom_row := HBoxContainer.new()
	bottom_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bottom_margin.add_child(bottom_row)

	var left_text := "Lv.%s / %s" % [str(entry.get("level", "")), str(entry.get("troop", ""))]
	if mode == MODE_POOL_PREVIEW:
		left_text = "Lv.%s / %s" % [str(entry.get("level", "")), str(entry.get("quality", "S"))]
	var bottom_font := int(config.get("bottom_font_size", 13 if not compact else 9))
	bottom_row.add_child(_compact_label(left_text, bottom_font, TEXT_MAIN))
	bottom_row.add_spacer(false)
	if mode == MODE_OWNED_ROSTER:
		bottom_row.add_child(_compact_label(str(entry.get("status", "")), int(config.get("status_font_size", 12 if not compact else 9)), TEXT_GOLD, HORIZONTAL_ALIGNMENT_RIGHT))
	elif mode == MODE_DRAW_RESULT:
		bottom_row.add_child(_compact_label(str(entry.get("status", "")), int(config.get("status_font_size", 12 if not compact else 9)), TEXT_GOLD, HORIZONTAL_ALIGNMENT_RIGHT))

static func _compact_label(text: String, font_size: int, color: Color, alignment: HorizontalAlignment = HORIZONTAL_ALIGNMENT_LEFT) -> Label:
	var label := _label(text, font_size, color)
	label.autowrap_mode = TextServer.AUTOWRAP_OFF
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	label.horizontal_alignment = alignment
	label.clip_text = true
	return label

static func _vertical_text(text: String) -> String:
	var chars: Array[String] = []
	for index in range(text.length()):
		chars.append(text.substr(index, 1))
	return "\n".join(chars)

static func _label(text: String, font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	label.custom_minimum_size = Vector2(_estimated_label_width(text, font_size), float(font_size + 6))
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return label

static func _estimated_label_width(text: String, font_size: int) -> float:
	if text.strip_edges() == "":
		return 0.0
	return clampf(float(text.length()) * float(font_size) * 0.58 + 8.0, float(font_size * 2), 300.0)

static func _margin(left: int, top: int, right: int, bottom: int) -> MarginContainer:
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", left)
	margin.add_theme_constant_override("margin_top", top)
	margin.add_theme_constant_override("margin_right", right)
	margin.add_theme_constant_override("margin_bottom", bottom)
	return margin

static func _panel(bg: Color, border: Color, radius: int) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", _style(bg, border, radius))
	return panel

static func _style(bg: Color, border: Color, radius: int) -> StyleBoxFlat:
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

static func _tone_border(entry: Dictionary, alpha: float = 0.84) -> Color:
	match str(entry.get("tone", "")):
		"cao_wei":
			return Color(0.360, 0.620, 0.960, alpha)
		"ji_han":
			return Color(0.340, 0.760, 0.430, alpha)
		"dong_wu":
			return Color(0.860, 0.280, 0.220, alpha)
		"qun_xiong":
			return Color(0.930, 0.720, 0.240, alpha)
		"dong_han":
			return Color(0.720, 0.460, 0.520, alpha)
		"jin":
			return Color(0.450, 0.680, 0.700, alpha)
		"blue":
			return Color(0.370, 0.520, 0.720, alpha)
		"green":
			return Color(0.360, 0.650, 0.330, alpha)
		"red":
			return Color(0.780, 0.290, 0.300, alpha)
		_:
			return Color(0.780, 0.520, 0.220, alpha)

static func _identity_strip_bg(entry: Dictionary, alpha: float) -> Color:
	match str(entry.get("tone", "")):
		"cao_wei":
			return Color(0.030, 0.060, 0.110, alpha)
		"ji_han":
			return Color(0.030, 0.100, 0.055, alpha)
		"dong_wu":
			return Color(0.120, 0.035, 0.030, alpha)
		"qun_xiong":
			return Color(0.120, 0.075, 0.025, alpha)
		"dong_han":
			return Color(0.120, 0.060, 0.075, alpha)
		"jin":
			return Color(0.030, 0.085, 0.095, alpha)
		_:
			return Color(0.018, 0.017, 0.017, alpha)

static func _portrait_tone(entry: Dictionary) -> Color:
	match str(entry.get("tone", "")):
		"cao_wei":
			return Color(0.035, 0.070, 0.125, 0.98)
		"ji_han":
			return Color(0.040, 0.120, 0.065, 0.98)
		"dong_wu":
			return Color(0.125, 0.045, 0.038, 0.98)
		"qun_xiong":
			return Color(0.130, 0.085, 0.030, 0.98)
		"dong_han":
			return Color(0.125, 0.065, 0.080, 0.98)
		"jin":
			return Color(0.035, 0.090, 0.100, 0.98)
		"blue":
			return Color(0.160, 0.220, 0.300, 0.98)
		"green":
			return Color(0.150, 0.270, 0.155, 0.98)
		"red":
			return Color(0.300, 0.120, 0.130, 0.98)
		_:
			return Color(0.300, 0.190, 0.085, 0.98)
