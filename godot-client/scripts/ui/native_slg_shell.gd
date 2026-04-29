extends Control
class_name NativeSlgShell

signal mode_toggle_requested(next_mode: String)
signal shell_action_requested(action_id: String)
signal troop_slot_requested(troop_id: String)
signal interior_tab_requested(tab_id: String)

const NativeShellChromeProfileCatalogScript = preload("res://scripts/ui/native_shell_chrome_profile_catalog.gd")
const CITY_MODE := "city"
const WORLD_MODE := "world"
const DEFAULT_CITY_ACTION := "interior"
const TROOP_SLOT_ARCHETYPE_PRIMARY := NativeShellChromeProfileCatalogScript.TROOP_ARCHETYPE_PRIMARY
const TROOP_SLOT_ARCHETYPE_MOBILE := NativeShellChromeProfileCatalogScript.TROOP_ARCHETYPE_MOBILE
const TROOP_SLOT_ARCHETYPE_RESERVE := NativeShellChromeProfileCatalogScript.TROOP_ARCHETYPE_RESERVE
const CHROME_PROFILE_FALLBACK := NativeShellChromeProfileCatalogScript.PROFILE_FALLBACK
const CITY_ACTION_SURFACE_MAIN_NAV := NativeShellChromeProfileCatalogScript.ACTION_SURFACE_MAIN_NAV
const CITY_ACTION_SURFACE_ENTRY := NativeShellChromeProfileCatalogScript.ACTION_SURFACE_ENTRY
const TROOP_SLOT_VISIBLE_COUNT := 3
const TROOP_STRENGTH_TRACK_WIDTH := 86
const TROOP_MORALE_TRACK_WIDTH := 62
const CITY_GRID_DEBUG_CELL_WIDTH := 26
const CITY_GRID_DEBUG_CELL_HEIGHT := 15
const MOBILE_SHELL_BREAKPOINT := 720.0
const MOBILE_LANDSCAPE_SHELL_MAX_WIDTH := 1024.0
const MOBILE_LANDSCAPE_SHELL_MAX_HEIGHT := 620.0
const MOBILE_SHELL_SIDE_MARGIN := 8.0
const MOBILE_BOTTOM_NAV_HEIGHT := 162.0
const MOBILE_MAIN_NAV_BUTTON_MIN_WIDTH := 52.0
const MOBILE_MAIN_NAV_BUTTON_MAX_WIDTH := 72.0
const MOBILE_MAIN_NAV_BUTTON_HEIGHT := 72.0
const DESKTOP_BOTTOM_NAV_RIGHT := 760.0
const DESKTOP_BOTTOM_NAV_TOP := -152.0
const DESKTOP_MAIN_NAV_BUTTON_SIZE := Vector2(80.0, 76.0)
const RIGHT_CONTEXT_PANEL_ENABLED := false

@onready var _backdrop: ColorRect = $Backdrop
@onready var _mode_badge: Label = $CenterStage/StageMargin/StageColumn/ModeBadge
@onready var _stage_title: Label = $CenterStage/StageMargin/StageColumn/StageTitle
@onready var _stage_body: Label = $CenterStage/StageMargin/StageColumn/StageBody
@onready var _city_focus: Label = $CenterStage/StageMargin/StageColumn/CityFocus
@onready var _city_entry_grid: GridContainer = $CenterStage/StageMargin/StageColumn/CityEntryGrid
@onready var _entry_status: Label = $CenterStage/StageMargin/StageColumn/EntryStatus
@onready var _mode_hint: Label = $CenterStage/StageMargin/StageColumn/ModeHint
@onready var _top_strip: PanelContainer = $TopStrip
@onready var _top_margin_container: MarginContainer = $TopStrip/TopMargin
@onready var _top_row: HBoxContainer = $TopStrip/TopMargin/TopRow
@onready var _top_actions_row: HBoxContainer = $TopStrip/TopMargin/TopRow/Actions
@onready var _center_stage: PanelContainer = $CenterStage
@onready var _stage_margin_container: MarginContainer = $CenterStage/StageMargin
@onready var _stage_column: VBoxContainer = $CenterStage/StageMargin/StageColumn
@onready var _left_rail_panel: PanelContainer = $LeftRail
@onready var _bottom_nav_panel: PanelContainer = $BottomNav
@onready var _bottom_margin_container: MarginContainer = $BottomNav/BottomMargin
@onready var _bottom_row: HBoxContainer = $BottomNav/BottomMargin/BottomRow
@onready var _main_nav_column: VBoxContainer = $BottomNav/BottomMargin/BottomRow/MainNav
@onready var _nav_buttons: HBoxContainer = $BottomNav/BottomMargin/BottomRow/MainNav/NavButtons
@onready var _mail_button: Button = $BottomNav/BottomMargin/BottomRow/MainNav/UtilityRow/MailButton
@onready var _activity_button: Button = $BottomNav/BottomMargin/BottomRow/MainNav/UtilityRow/ActivityButton
@onready var _help_button: Button = $BottomNav/BottomMargin/BottomRow/MainNav/UtilityRow/HelpButton
@onready var _utility_row: HBoxContainer = $BottomNav/BottomMargin/BottomRow/MainNav/UtilityRow
@onready var _mode_toggle_button: Button = $TopStrip/TopMargin/TopRow/Actions/ModeToggleButton
@onready var _resource_strip: Label = $TopStrip/TopMargin/TopRow/ResourceStrip
@onready var _profile_badge: Label = $TopStrip/TopMargin/TopRow/ProfileBadge
@onready var _premium_currency_row: HBoxContainer = $TopStrip/TopMargin/TopRow/Actions/PremiumCurrencyRow
@onready var _jade_currency_badge: Button = $TopStrip/TopMargin/TopRow/Actions/PremiumCurrencyRow/JadeCurrencyBadge
@onready var _copper_currency_badge: Button = $TopStrip/TopMargin/TopRow/Actions/PremiumCurrencyRow/CopperCurrencyBadge
@onready var _left_margin: MarginContainer = $LeftRail/LeftMargin
@onready var _left_column: VBoxContainer = $LeftRail/LeftMargin/LeftColumn
@onready var _task_header_row: HBoxContainer = $LeftRail/LeftMargin/LeftColumn/TaskHeaderRow
@onready var _task_icon: TextureRect = $LeftRail/LeftMargin/LeftColumn/TaskHeaderRow/TaskIcon
@onready var _task_title: Label = $LeftRail/LeftMargin/LeftColumn/TaskHeaderRow/TaskTitle
@onready var _task_body: Label = $LeftRail/LeftMargin/LeftColumn/TaskBody
@onready var _task_hint: Label = $LeftRail/LeftMargin/LeftColumn/TaskHint
@onready var _city_state_title: Label = $LeftRail/LeftMargin/LeftColumn/CityStateTitle
@onready var _city_state_summary: Label = $LeftRail/LeftMargin/LeftColumn/CityStateSummary
@onready var _city_tech_summary: Label = $LeftRail/LeftMargin/LeftColumn/CityTechSummary
@onready var _interior_quick_links: HBoxContainer = $LeftRail/LeftMargin/LeftColumn/InteriorQuickLinks
@onready var _interior_summary_button_market: Button = $LeftRail/LeftMargin/LeftColumn/InteriorQuickLinks/MarketQuickLinkButton
@onready var _interior_summary_button_tax: Button = $LeftRail/LeftMargin/LeftColumn/InteriorQuickLinks/TaxQuickLinkButton
@onready var _interior_summary_button_policy: Button = $LeftRail/LeftMargin/LeftColumn/InteriorQuickLinks/PolicyQuickLinkButton
@onready var _interior_summary_button_affairs: Button = $LeftRail/LeftMargin/LeftColumn/InteriorQuickLinks/AffairsQuickLinkButton
@onready var _troop_section_title: Label = $LeftRail/LeftMargin/LeftColumn/TroopSectionTitle
@onready var _troop_summary: Label = $LeftRail/LeftMargin/LeftColumn/TroopSummary
@onready var _troop_slot_scroll: ScrollContainer = $LeftRail/LeftMargin/LeftColumn/TroopSlotScroll
@onready var _troop_slot_list: VBoxContainer = $LeftRail/LeftMargin/LeftColumn/TroopSlotScroll/TroopSlotList
@onready var _troop_slot_01_button: Button = $LeftRail/LeftMargin/LeftColumn/TroopSlotScroll/TroopSlotList/TroopSlot01Button
@onready var _troop_slot_02_button: Button = $LeftRail/LeftMargin/LeftColumn/TroopSlotScroll/TroopSlotList/TroopSlot02Button
@onready var _troop_slot_03_button: Button = $LeftRail/LeftMargin/LeftColumn/TroopSlotScroll/TroopSlotList/TroopSlot03Button
@onready var _troop_slot_04_button: Button = $LeftRail/LeftMargin/LeftColumn/TroopSlotScroll/TroopSlotList/TroopSlot04Button
@onready var _troop_slot_05_button: Button = $LeftRail/LeftMargin/LeftColumn/TroopSlotScroll/TroopSlotList/TroopSlot05Button
@onready var _right_context_panel: PanelContainer = $RightContext
@onready var _right_margin_container: MarginContainer = $RightContext/RightMargin
@onready var _right_column: VBoxContainer = $RightContext/RightMargin/RightColumn
@onready var _context_slot_list: VBoxContainer = $RightContext/RightMargin/RightColumn/ContextSlotList
@onready var _context_slot_01_panel: PanelContainer = $RightContext/RightMargin/RightColumn/ContextSlotList/ContextSlot01Panel
@onready var _context_slot_02_panel: PanelContainer = $RightContext/RightMargin/RightColumn/ContextSlotList/ContextSlot02Panel
@onready var _context_slot_03_panel: PanelContainer = $RightContext/RightMargin/RightColumn/ContextSlotList/ContextSlot03Panel
@onready var _context_slot_01_label: Label = $RightContext/RightMargin/RightColumn/ContextSlotList/ContextSlot01Panel/SlotMargin/SlotLabel
@onready var _context_slot_02_label: Label = $RightContext/RightMargin/RightColumn/ContextSlotList/ContextSlot02Panel/SlotMargin/SlotLabel
@onready var _context_slot_03_label: Label = $RightContext/RightMargin/RightColumn/ContextSlotList/ContextSlot03Panel/SlotMargin/SlotLabel
@onready var _context_body: Label = $RightContext/RightMargin/RightColumn/ContextBody
@onready var _context_title: Label = $RightContext/RightMargin/RightColumn/ContextTitle
@onready var _world_entry_hint: Label = $BottomNav/BottomMargin/BottomRow/MainNav/WorldEntryHint
@onready var _generals_button: Button = $BottomNav/BottomMargin/BottomRow/MainNav/NavButtons/GeneralsButton
@onready var _interior_button: Button = $BottomNav/BottomMargin/BottomRow/MainNav/NavButtons/InteriorButton
@onready var _alliance_button: Button = $BottomNav/BottomMargin/BottomRow/MainNav/NavButtons/AllianceButton
@onready var _war_button: Button = $BottomNav/BottomMargin/BottomRow/MainNav/NavButtons/WarButton
@onready var _ai_hub_button: Button = $BottomNav/BottomMargin/BottomRow/MainNav/NavButtons/AiHubButton
@onready var _chat_button: Button = $BottomNav/BottomMargin/BottomRow/MainNav/NavButtons/ChatButton
@onready var _recruit_button: Button = $BottomNav/BottomMargin/BottomRow/MainNav/NavButtons/RecruitButton
@onready var _bag_button: Button = $BottomNav/BottomMargin/BottomRow/MainNav/NavButtons/BagButton
@onready var _settings_button: Button = $BottomNav/BottomMargin/BottomRow/MainNav/NavButtons/SettingsButton
@onready var _interior_entry_button: Button = $CenterStage/StageMargin/StageColumn/CityEntryGrid/InteriorEntryButton
@onready var _recruit_entry_button: Button = $CenterStage/StageMargin/StageColumn/CityEntryGrid/RecruitEntryButton
@onready var _generals_entry_button: Button = $CenterStage/StageMargin/StageColumn/CityEntryGrid/GeneralsEntryButton
@onready var _alliance_entry_button: Button = $CenterStage/StageMargin/StageColumn/CityEntryGrid/AllianceEntryButton
@onready var _ai_hub_entry_button: Button = $CenterStage/StageMargin/StageColumn/CityEntryGrid/AiHubEntryButton

@export var chrome_profile_catalog: Resource

var _current_mode: String = CITY_MODE
var _current_city_action: String = DEFAULT_CITY_ACTION
var _chrome_profile_id: String = CHROME_PROFILE_FALLBACK
var _troop_slot_buttons: Array = []
var _troop_slot_views: Array = []
var _context_slot_panels: Array = []
var _context_slot_labels: Array = []
var _last_context_slots: Array = []
var _last_troop_slot_payloads: Array = []
var _interior_summary_buttons: Dictionary = {}
var _city_action_button_groups: Dictionary = {}
var _fallback_chrome_profile_catalog: Resource = NativeShellChromeProfileCatalogScript.new()
var _city_grid_debug_preview: Control
var _city_grid_foundation_texture: TextureRect
var _city_grid_wall_ring_texture: TextureRect
var _city_grid_debug_cells: Array = []

func _ready() -> void:
	_clear_placeholder_text_nodes()
	var mode_toggle_callback := Callable(self, "_on_mode_toggle_pressed")
	if not _mode_toggle_button.pressed.is_connected(mode_toggle_callback):
		_mode_toggle_button.pressed.connect(mode_toggle_callback)
	_bind_action_button(_mail_button, "mail")
	_bind_action_button(_activity_button, "activity")
	_bind_action_button(_help_button, "help")
	_bind_action_button(_war_button, "world")
	_register_city_action_button(_interior_button, "interior", CITY_ACTION_SURFACE_MAIN_NAV)
	_register_city_action_button(_recruit_button, "recruit", CITY_ACTION_SURFACE_MAIN_NAV)
	_register_city_action_button(_generals_button, "generals", CITY_ACTION_SURFACE_MAIN_NAV)
	_register_city_action_button(_alliance_button, "alliance", CITY_ACTION_SURFACE_MAIN_NAV)
	_register_city_action_button(_ai_hub_button, "ai_hub", CITY_ACTION_SURFACE_MAIN_NAV)
	_register_city_action_button(_chat_button, "chat", CITY_ACTION_SURFACE_MAIN_NAV)
	_register_city_action_button(_interior_entry_button, "interior", CITY_ACTION_SURFACE_ENTRY)
	_register_city_action_button(_recruit_entry_button, "recruit", CITY_ACTION_SURFACE_ENTRY)
	_register_city_action_button(_generals_entry_button, "generals", CITY_ACTION_SURFACE_ENTRY)
	_register_city_action_button(_alliance_entry_button, "alliance", CITY_ACTION_SURFACE_ENTRY)
	_register_city_action_button(_ai_hub_entry_button, "ai_hub", CITY_ACTION_SURFACE_ENTRY)
	_interior_summary_buttons = {
		"market": _interior_summary_button_market,
		"tax": _interior_summary_button_tax,
		"policy": _interior_summary_button_policy,
		"affairs": _interior_summary_button_affairs,
	}
	for tab_id in _interior_summary_buttons.keys():
		_bind_interior_summary_button(_interior_summary_buttons[tab_id] as Button, str(tab_id))
	_troop_slot_buttons = [
		_troop_slot_01_button,
		_troop_slot_02_button,
		_troop_slot_03_button,
		_troop_slot_04_button,
		_troop_slot_05_button,
	]
	_troop_slot_views.clear()
	_context_slot_panels = [
		_context_slot_01_panel,
		_context_slot_02_panel,
		_context_slot_03_panel,
	]
	_context_slot_labels = [
		_context_slot_01_label,
		_context_slot_02_label,
		_context_slot_03_label,
	]
	for index in range(_troop_slot_buttons.size()):
		var troop_button := _troop_slot_buttons[index] as Button
		_troop_slot_views.append(_ensure_troop_slot_view(troop_button))
		_bind_troop_slot_button(troop_button, index)
	set_resource_summary("")
	set_troop_summary("")
	_apply_shell_icons()
	_ensure_city_grid_debug_preview()
	_apply_typography_profile()
	_apply_shell_layout_geometry_profile()
	_refresh_city_grid_debug_preview()
	_refresh_backdrop_chrome()
	_refresh_bottom_nav_chrome()
	_refresh_right_context_chrome()
	set_premium_currency_summary("")
	if _profile_badge != null:
		_profile_badge.text = _resolve_shell_copy_value("default_profile_badge_text", "主公")
	if _context_title != null:
		_context_title.text = _resolve_shell_copy_value("default_context_title_text", "城市上下文")
	_apply_left_rail_density_style()
	set_context_slots([])
	set_troop_slots([])
	set_display_mode(CITY_MODE)
	set_city_overview({})
	set_context_summary("")
	_apply_static_action_button_copy()
	_apply_utility_row_style()
	_reorder_left_rail_layout()
	_refresh_troop_slot_scroll_container()
	set_city_action_focus(DEFAULT_CITY_ACTION)
	_refresh_interior_summary_buttons()
	_refresh_under_construction_buttons()

func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED and is_inside_tree():
		_apply_shell_layout_geometry_profile()

func _clear_placeholder_text_nodes() -> void:
	var text_nodes: Array = [
		_profile_badge,
		_resource_strip,
		_jade_currency_badge,
		_copper_currency_badge,
		_mode_toggle_button,
		_task_title,
		_task_body,
		_task_hint,
		_city_state_title,
		_city_state_summary,
		_city_tech_summary,
		_interior_summary_button_market,
		_interior_summary_button_tax,
		_interior_summary_button_policy,
		_interior_summary_button_affairs,
		_troop_section_title,
		_troop_summary,
		_troop_slot_01_button,
		_troop_slot_02_button,
		_troop_slot_03_button,
		_troop_slot_04_button,
		_troop_slot_05_button,
		_context_title,
		_context_body,
		_context_slot_01_label,
		_context_slot_02_label,
		_context_slot_03_label,
		_mode_badge,
		_stage_title,
		_stage_body,
		_city_focus,
		_interior_entry_button,
		_recruit_entry_button,
		_generals_entry_button,
		_alliance_entry_button,
		_ai_hub_entry_button,
		_entry_status,
		_mode_hint,
		_mail_button,
		_activity_button,
		_help_button,
		_generals_button,
		_interior_button,
		_alliance_button,
		_war_button,
		_ai_hub_button,
		_chat_button,
		_recruit_button,
		_bag_button,
		_settings_button,
		_world_entry_hint,
	]
	for node_variant in text_nodes:
		if node_variant == null:
			continue
		if node_variant is Label:
			(node_variant as Label).text = ""
		elif node_variant is Button:
			(node_variant as Button).text = ""

func set_chrome_profile(profile_id: String) -> void:
	_chrome_profile_id = _normalize_chrome_profile_id(profile_id)
	if not is_inside_tree():
		return
	_refresh_chrome_profile()

func set_display_mode(next_mode: String) -> void:
	_current_mode = WORLD_MODE if next_mode == WORLD_MODE else CITY_MODE
	var is_world_mode: bool = _current_mode == WORLD_MODE
	_mode_badge.text = _resolve_shell_copy_value("default_mode_badge_world", "大地图") if is_world_mode else _resolve_shell_copy_value("default_mode_badge_city", "主城")
	_stage_title.text = _resolve_shell_copy_value("default_stage_title_world", "十三州世界图") if is_world_mode else _resolve_shell_copy_value("default_stage_title_city", "主城入口")
	var raw_stage_body := (
		_resolve_shell_copy_value("default_stage_body_world", "世界主视图先保留浏览、镜头和模式切换。")
		if is_world_mode
		else _resolve_shell_copy_value("default_stage_body_city", "主城先稳定任务、队列和入口层级。")
	)
	_stage_body.text = _compact_multiline_text(raw_stage_body, 2, 20)
	_stage_body.tooltip_text = raw_stage_body
	var raw_mode_hint := (
		_resolve_shell_copy_value("default_mode_hint_world", "当前仅保留世界浏览和模式切换。")
		if is_world_mode
		else _resolve_shell_copy_value("default_mode_hint_city", "当前继续压主壳层级，让地图回到主视区。")
	)
	_mode_hint.text = _compact_multiline_text(raw_mode_hint, 2, 18)
	_mode_hint.tooltip_text = raw_mode_hint
	var raw_world_entry_hint := (
		_resolve_shell_copy_value("default_world_entry_hint_world", "当前正在浏览大地图；可从右上返回主城。")
		if is_world_mode
		else _resolve_shell_copy_value("default_world_entry_hint_city", "主线入口留底栏；战报/活动降为辅助。")
	)
	_world_entry_hint.text = _compact_single_line_text(raw_world_entry_hint, 20)
	_world_entry_hint.tooltip_text = raw_world_entry_hint
	_mode_toggle_button.text = _resolve_shell_copy_value("default_mode_toggle_label_world", "回主城") if is_world_mode else _resolve_shell_copy_value("default_mode_toggle_label_city", "大地图")
	var show_center_stage := not is_world_mode
	if _center_stage != null:
		_center_stage.visible = show_center_stage
	_mode_badge.visible = false
	_stage_title.visible = show_center_stage
	_stage_body.visible = show_center_stage
	_city_focus.visible = show_center_stage
	_entry_status.visible = show_center_stage
	_mode_hint.visible = show_center_stage
	var has_city_grid_profile := _refresh_city_grid_debug_preview()
	_city_entry_grid.visible = not is_world_mode and not has_city_grid_profile
	if _city_grid_debug_preview != null:
		_city_grid_debug_preview.visible = not is_world_mode and has_city_grid_profile
	_city_entry_grid.columns = 5 if not is_world_mode else 3
	_refresh_city_shell_density()
	_refresh_city_action_button_states()
	_refresh_utility_row_density()
	_refresh_interior_summary_buttons()
	_refresh_under_construction_buttons()
	_refresh_right_context_visibility()

func set_context_summary(summary: String) -> void:
	var normalized_summary := summary.strip_edges()
	if normalized_summary == "":
		normalized_summary = _resolve_shell_copy_value("default_context_summary", "等待 runtime 与 world 数据加载。")
	_context_body.text = normalized_summary
	_context_body.tooltip_text = normalized_summary
	_refresh_right_context_visibility()

func set_context_slots(slot_payloads: Array) -> void:
	_last_context_slots = slot_payloads.duplicate(true)
	var resolved_slot_payloads: Array = slot_payloads if not slot_payloads.is_empty() else _resolve_default_context_slots()
	for index in range(_context_slot_labels.size()):
		var slot_panel := _context_slot_panels[index] as PanelContainer
		var slot_label := _context_slot_labels[index] as Label
		if slot_panel == null or slot_label == null:
			continue
		if index >= resolved_slot_payloads.size() or not (resolved_slot_payloads[index] is Dictionary):
			slot_panel.visible = false
			slot_label.text = ""
			slot_label.tooltip_text = ""
			continue
		var slot_payload := resolved_slot_payloads[index] as Dictionary
		var label := str(slot_payload.get("label", "")).strip_edges()
		var value := str(slot_payload.get("value", "")).strip_edges()
		var tooltip := str(slot_payload.get("tooltip", "")).strip_edges()
		var line_text := _format_copy_template(
			"context_slot_line_template",
			{
				"label": label,
				"value": value,
			},
			"{label} | {value}"
		).strip_edges()
		slot_panel.visible = line_text != ""
		slot_label.text = _compact_single_line_text(line_text, 18)
		slot_label.tooltip_text = tooltip if tooltip != "" else line_text
	_refresh_right_context_visibility()


func set_resource_summary(summary: String) -> void:
	_resource_strip.text = summary if summary.strip_edges() != "" else _resolve_shell_copy_value("default_resource_summary", "木 -- | 铁 -- | 石 -- | 粮 --")

func set_premium_currency_summary(summary: String) -> void:
	if _premium_currency_row == null or _jade_currency_badge == null or _copper_currency_badge == null:
		return
	var normalized := _parse_premium_currency_summary(summary)
	var jade_value := str(normalized.get("jade", "0")).strip_edges()
	var copper_value := str(normalized.get("copper", "0")).strip_edges()
	var jade_label := _resolve_shell_copy_value("currency_jade_label", "玉符")
	var copper_label := _resolve_shell_copy_value("currency_copper_label", "铜钱")
	_jade_currency_badge.text = jade_value if jade_value != "" else "0"
	_copper_currency_badge.text = copper_value if copper_value != "" else "0"
	_premium_currency_row.tooltip_text = _format_copy_template(
		"currency_tooltip_template",
		{
			"jade_label": jade_label,
			"jade": _jade_currency_badge.text,
			"copper_label": copper_label,
			"copper": _copper_currency_badge.text,
		},
		"{jade_label} {jade} | {copper_label} {copper}"
	)

func set_city_overview(payload: Dictionary) -> void:
	var raw_task_title := str(payload.get("taskTitle", _resolve_shell_copy_value("default_city_task_title", "主城经营")))
	var raw_task_body := str(payload.get("taskBody", _resolve_shell_copy_value("default_city_task_body", "等待主城任务流加载。")))
	var raw_task_hint := str(payload.get("taskHint", _resolve_shell_copy_value("default_city_task_hint", "保持主城壳层稳定，再向大地图递进。")))
	var raw_city_state_title := str(payload.get("cityStateTitle", _resolve_shell_copy_value("default_city_state_title", "主城态势")))
	var raw_city_state_summary := str(payload.get("cityStateSummary", _resolve_shell_copy_value("default_city_state_summary", "等待主城业务数据加载。")))
	var raw_city_tech_summary := str(payload.get("cityTechSummary", _resolve_shell_copy_value("default_city_tech_summary", "政 0 后 0 防 0 募 0")))
	var raw_city_focus := str(payload.get("cityFocus", _resolve_shell_copy_value("default_city_focus", "主城：等待识别 | 已占城池 0 | 开发点 0")))
	_task_title.text = raw_task_title
	_task_body.text = _compact_single_line_text(raw_task_body, 20)
	_task_body.tooltip_text = _build_tooltip_text([raw_task_body, raw_task_hint])
	_task_hint.text = ""
	_task_hint.tooltip_text = ""
	_task_hint.visible = false
	_city_state_title.text = raw_city_state_title
	_city_state_summary.text = _compact_single_line_text(raw_city_state_summary, 20)
	_city_state_summary.tooltip_text = _build_tooltip_text([raw_city_state_summary, raw_city_tech_summary])
	_city_tech_summary.text = _compact_single_line_text(raw_city_tech_summary, 18)
	_city_tech_summary.tooltip_text = raw_city_tech_summary
	_city_focus.text = _compact_single_line_text(raw_city_focus, 20)
	_city_focus.tooltip_text = raw_city_focus
	if payload.has("activeCityAction"):
		set_city_action_focus(str(payload.get("activeCityAction", DEFAULT_CITY_ACTION)))
	var raw_entry_status := str(payload.get("entryStatus", _resolve_shell_copy_value("default_entry_status", "当前：内政")))
	if payload.has("entryStatus"):
		raw_entry_status = str(payload.get("entryStatus", raw_entry_status))
	_entry_status.text = _compact_single_line_text(raw_entry_status, 12)
	_entry_status.tooltip_text = _build_tooltip_text([raw_entry_status, raw_task_hint])
	_refresh_city_shell_density()

func set_troop_summary(summary: String) -> void:
	_troop_section_title.text = _resolve_shell_copy_value("default_troop_section_title", "五队")
	var normalized := summary if summary.strip_edges() != "" else _resolve_shell_copy_value("default_troop_summary", "等待 5 部队总览加载。")
	_troop_summary.text = _compact_single_line_text(normalized, 14)
	_troop_summary.tooltip_text = normalized

func set_troop_slots(slot_payloads: Array) -> void:
	_last_troop_slot_payloads = slot_payloads.duplicate(true)
	var slot_labels: Array = ["一队", "二队", "三队", "四队", "五队"]
	for index in range(_troop_slot_buttons.size()):
		var button := _troop_slot_buttons[index] as Button
		if button == null:
			continue
		var payload: Dictionary = {}
		if index < slot_payloads.size() and slot_payloads[index] is Dictionary:
			payload = slot_payloads[index] as Dictionary
		var troop_id := str(payload.get("id", "")).strip_edges()
		var label := str(payload.get("label", slot_labels[index]))
		var subtitle := str(payload.get("subtitle", "待命"))
		var status_text := str(payload.get("statusText", ""))
		var is_enabled := troop_id != "" and bool(payload.get("enabled", troop_id != ""))
		var role_tag := _resolve_troop_slot_role_tag(index, is_enabled)
		var state_tag := _resolve_troop_slot_state_tag(status_text, subtitle, is_enabled)
		button.text = ""
		var tooltip_state := status_text if status_text.strip_edges() != "" else subtitle
		var strength := int(payload.get("strength", 0))
		var strength_max := maxi(maxi(int(payload.get("strengthMax", 0)), strength), 1)
		var morale := clampi(int(payload.get("morale", 0)), 0, maxi(int(payload.get("moraleMax", 100)), 1))
		var morale_max := maxi(int(payload.get("moraleMax", 100)), 1)
		button.tooltip_text = _build_tooltip_text([
			_format_copy_template(
				"troop_slot_tooltip_template",
				{
					"label": label,
					"role": role_tag,
					"state": tooltip_state,
				},
				"{label} | {role} | {state}"
			),
			"兵力：%s/%s | 士气：%s/%s" % [
				_format_grouped_int(strength),
				_format_grouped_int(strength_max),
				_format_grouped_int(morale),
				_format_grouped_int(morale_max),
			],
			str(payload.get("description", _resolve_shell_copy_value("default_troop_slot_description", "等待部队编组。"))),
		])
		button.disabled = not is_enabled
		button.set_meta("troop_id", troop_id)
		button.set_meta("troop_strength", strength)
		button.set_meta("troop_strength_max", strength_max)
		button.set_meta("troop_morale", morale)
		button.set_meta("troop_morale_max", morale_max)
		button.set_meta("troop_status_label", _resolve_troop_slot_status_label(payload, status_text, subtitle, is_enabled))
		button.set_meta("troop_title_label", label)
		var hero_name := _resolve_troop_slot_hero_name(payload, subtitle)
		button.set_meta("troop_portrait_label", _resolve_troop_slot_portrait_text(hero_name, slot_labels[index], is_enabled))
		button.set_meta("troop_slot_label", slot_labels[index])
		button.set_meta("troop_role_tag", role_tag)
		_apply_troop_slot_button_style(button, status_text, button.disabled, role_tag, index)
		_apply_troop_slot_content(button, payload, slot_labels[index], role_tag, is_enabled)
	_refresh_troop_slot_scroll_container(_resolve_shell_layout_profile())

func set_city_action_focus(action_id: String) -> void:
	var action_copy := _resolve_city_action_copy(action_id)
	if action_copy.is_empty():
		return
	_current_city_action = action_id
	var label: String = str(action_copy.get("label", "入口"))
	var description: String = str(action_copy.get("description", "等待入口说明加载。"))
	_entry_status.text = _compact_single_line_text(_format_copy_template("current_entry_status_template", {"label": label}, "当前：{label}"), 12)
	_entry_status.tooltip_text = _format_copy_template(
		"current_entry_tooltip_template",
		{
			"label": label,
			"description": description,
		},
		"当前入口：{label} | {description}"
	)
	_refresh_city_shell_density()
	_refresh_city_action_button_states()
	_refresh_utility_row_density()
	_refresh_interior_summary_buttons()
	_refresh_right_context_visibility()

func _on_mode_toggle_pressed() -> void:
	var next_mode := WORLD_MODE if _current_mode == CITY_MODE else CITY_MODE
	mode_toggle_requested.emit(next_mode)

func _bind_action_button(button: Button, action_id: String) -> void:
	if button == null:
		return
	var callback := func() -> void:
		_on_action_button_pressed(action_id)
	if not button.pressed.is_connected(callback):
		button.pressed.connect(callback)

func _register_city_action_button(button: Button, action_id: String, surface_role: String) -> void:
	if button == null:
		return
	button.set_meta("city_action_id", action_id)
	button.set_meta("city_action_surface_role", surface_role)
	_bind_action_button(button, action_id)
	var button_group: Dictionary = _city_action_button_groups.get(action_id, {}) as Dictionary
	button_group[surface_role] = button
	_city_action_button_groups[action_id] = button_group

func _bind_troop_slot_button(button: Button, slot_index: int) -> void:
	if button == null:
		return
	var callback := func() -> void:
		_on_troop_slot_pressed(slot_index)
	if not button.pressed.is_connected(callback):
		button.pressed.connect(callback)

func _ensure_troop_slot_view(button: Button) -> Dictionary:
	if button == null:
		return {}
	if button.has_meta("troop_slot_view"):
		var cached_variant: Variant = button.get_meta("troop_slot_view", {})
		if cached_variant is Dictionary:
			return cached_variant as Dictionary
	var shell_texture := TextureRect.new()
	shell_texture.name = "ShellTexture"
	shell_texture.mouse_filter = Control.MOUSE_FILTER_IGNORE
	shell_texture.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shell_texture.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	shell_texture.stretch_mode = TextureRect.STRETCH_SCALE
	button.add_child(shell_texture)

	var root := MarginContainer.new()
	root.name = "ShellMargin"
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_theme_constant_override("margin_left", 7)
	root.add_theme_constant_override("margin_top", 5)
	root.add_theme_constant_override("margin_right", 7)
	root.add_theme_constant_override("margin_bottom", 5)
	button.add_child(root)

	var left_inlay := ColorRect.new()
	left_inlay.name = "LeftInlay"
	left_inlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	left_inlay.set_anchors_and_offsets_preset(Control.PRESET_LEFT_WIDE)
	left_inlay.custom_minimum_size = Vector2(2, 0)
	left_inlay.offset_left = 0
	left_inlay.offset_top = 0
	left_inlay.offset_right = 2
	left_inlay.offset_bottom = 0
	root.add_child(left_inlay)

	var top_line := ColorRect.new()
	top_line.name = "TopLine"
	top_line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	top_line.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	top_line.custom_minimum_size = Vector2(0, 1)
	top_line.offset_left = 10
	top_line.offset_right = -8
	top_line.offset_top = 0
	top_line.offset_bottom = 1
	root.add_child(top_line)

	var bottom_line := ColorRect.new()
	bottom_line.name = "BottomLine"
	bottom_line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bottom_line.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	bottom_line.custom_minimum_size = Vector2(0, 1)
	bottom_line.offset_left = 12
	bottom_line.offset_right = -10
	bottom_line.offset_top = -1
	bottom_line.offset_bottom = 0
	root.add_child(bottom_line)

	var card_row := HBoxContainer.new()
	card_row.name = "CardRow"
	card_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card_row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	card_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	card_row.size_flags_vertical = Control.SIZE_EXPAND_FILL
	card_row.add_theme_constant_override("separation", 8)
	root.add_child(card_row)

	var portrait_panel := PanelContainer.new()
	portrait_panel.name = "PortraitPanel"
	portrait_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	portrait_panel.custom_minimum_size = Vector2(50, 0)
	portrait_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	card_row.add_child(portrait_panel)

	var portrait_label := Label.new()
	portrait_label.name = "PortraitLabel"
	portrait_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	portrait_label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	portrait_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	portrait_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	portrait_panel.add_child(portrait_label)

	var info_column := VBoxContainer.new()
	info_column.name = "InfoColumn"
	info_column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	info_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	info_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	info_column.add_theme_constant_override("separation", 2)
	card_row.add_child(info_column)

	var headline_row := HBoxContainer.new()
	headline_row.name = "HeadlineRow"
	headline_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	headline_row.add_theme_constant_override("separation", 4)
	info_column.add_child(headline_row)

	var slot_label := Label.new()
	slot_label.name = "SlotLabel"
	slot_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	headline_row.add_child(slot_label)

	var role_label := Label.new()
	role_label.name = "RoleLabel"
	role_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	headline_row.add_child(role_label)

	var headline_spacer := Control.new()
	headline_spacer.name = "HeadlineSpacer"
	headline_spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	headline_spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	headline_row.add_child(headline_spacer)

	var status_label := Label.new()
	status_label.name = "StatusLabel"
	status_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	headline_row.add_child(status_label)

	var title_row := HBoxContainer.new()
	title_row.name = "TitleRow"
	title_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	title_row.add_theme_constant_override("separation", 4)
	info_column.add_child(title_row)

	var title_label := Label.new()
	title_label.name = "TitleLabel"
	title_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_row.add_child(title_label)

	var strength_row := HBoxContainer.new()
	strength_row.name = "StrengthRow"
	strength_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	strength_row.add_theme_constant_override("separation", 4)
	info_column.add_child(strength_row)

	var strength_tag := Label.new()
	strength_tag.name = "StrengthTag"
	strength_tag.mouse_filter = Control.MOUSE_FILTER_IGNORE
	strength_tag.text = "兵力"
	strength_row.add_child(strength_tag)

	var strength_track := PanelContainer.new()
	strength_track.name = "StrengthTrack"
	strength_track.mouse_filter = Control.MOUSE_FILTER_IGNORE
	strength_track.custom_minimum_size = Vector2(TROOP_STRENGTH_TRACK_WIDTH, 5)
	strength_track.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	strength_row.add_child(strength_track)

	var strength_fill := ColorRect.new()
	strength_fill.name = "StrengthFill"
	strength_fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	strength_fill.set_anchors_and_offsets_preset(Control.PRESET_LEFT_WIDE)
	strength_fill.custom_minimum_size = Vector2(0, 0)
	strength_fill.offset_left = 0
	strength_fill.offset_top = 0
	strength_fill.offset_bottom = 0
	strength_track.add_child(strength_fill)

	var strength_value := Label.new()
	strength_value.name = "StrengthValue"
	strength_value.mouse_filter = Control.MOUSE_FILTER_IGNORE
	strength_value.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	strength_value.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	strength_row.add_child(strength_value)

	var morale_row := HBoxContainer.new()
	morale_row.name = "MoraleRow"
	morale_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	morale_row.add_theme_constant_override("separation", 4)
	info_column.add_child(morale_row)

	var morale_tag := Label.new()
	morale_tag.name = "MoraleTag"
	morale_tag.mouse_filter = Control.MOUSE_FILTER_IGNORE
	morale_tag.text = "士气"
	morale_row.add_child(morale_tag)

	var morale_track := PanelContainer.new()
	morale_track.name = "MoraleTrack"
	morale_track.mouse_filter = Control.MOUSE_FILTER_IGNORE
	morale_track.custom_minimum_size = Vector2(TROOP_MORALE_TRACK_WIDTH, 4)
	morale_track.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	morale_row.add_child(morale_track)

	var morale_fill := ColorRect.new()
	morale_fill.name = "MoraleFill"
	morale_fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	morale_fill.set_anchors_and_offsets_preset(Control.PRESET_LEFT_WIDE)
	morale_fill.custom_minimum_size = Vector2(0, 0)
	morale_fill.offset_left = 0
	morale_fill.offset_top = 0
	morale_fill.offset_bottom = 0
	morale_track.add_child(morale_fill)

	var morale_value := Label.new()
	morale_value.name = "MoraleValue"
	morale_value.mouse_filter = Control.MOUSE_FILTER_IGNORE
	morale_value.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	morale_value.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	morale_row.add_child(morale_value)

	var refs := {
		"shell_texture": shell_texture,
		"root": root,
		"left_inlay": left_inlay,
		"top_line": top_line,
		"bottom_line": bottom_line,
		"portrait_panel": portrait_panel,
		"portrait_label": portrait_label,
		"slot_label": slot_label,
		"role_label": role_label,
		"status_label": status_label,
		"title_label": title_label,
		"strength_tag": strength_tag,
		"strength_track": strength_track,
		"strength_fill": strength_fill,
		"strength_value": strength_value,
		"morale_tag": morale_tag,
		"morale_track": morale_track,
		"morale_fill": morale_fill,
		"morale_value": morale_value,
	}
	button.set_meta("troop_slot_view", refs)
	return refs

func _create_troop_slot_stylebox(bg_color: Color, border_color: Color, radius: int = 1, border_width: int = 1) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = bg_color
	style.border_color = border_color
	style.set_corner_radius_all(radius)
	style.set_border_width_all(border_width)
	return style

func _format_grouped_int(value: int) -> String:
	var normalized := maxi(value, 0)
	var raw := str(normalized)
	if raw.length() <= 3:
		return raw
	var segments: Array[String] = []
	var cursor := raw.length()
	while cursor > 3:
		segments.push_front(raw.substr(cursor - 3, 3))
		cursor -= 3
	segments.push_front(raw.substr(0, cursor))
	return ",".join(segments)

func _resolve_troop_slot_hero_name(payload: Dictionary, fallback_subtitle: String) -> String:
	var hero_name := str(payload.get("heroName", "")).strip_edges()
	if hero_name != "":
		return hero_name
	var subtitle := fallback_subtitle.strip_edges()
	if subtitle.contains("|"):
		var parts := subtitle.split("|")
		if not parts.is_empty():
			return str(parts[0]).strip_edges()
	return subtitle

func _resolve_troop_slot_status_label(payload: Dictionary, status_text: String, subtitle: String, is_enabled: bool) -> String:
	if not is_enabled:
		return "空位"
	var explicit_label := str(payload.get("statusLabel", "")).strip_edges()
	if explicit_label != "":
		return _truncate_text(explicit_label, 4)
	var normalized := status_text.strip_edges()
	if normalized == "":
		normalized = subtitle.strip_edges()
	if normalized.contains("|"):
		var segments := normalized.split("|")
		if not segments.is_empty():
			normalized = str(segments[0]).strip_edges()
	return _truncate_text(normalized if normalized != "" else "待命", 4)

func _resolve_troop_slot_portrait_text(hero_name: String, slot_label: String, is_enabled: bool) -> String:
	if not is_enabled:
		return "空"
	var source := hero_name.strip_edges()
	if source == "":
		source = slot_label.strip_edges()
	if source == "":
		return "队"
	return source.substr(0, 1)

func _resolve_troop_ratio(value: int, max_value: int) -> float:
	if max_value <= 0:
		return 0.0
	return clamp(float(value) / float(max_value), 0.0, 1.0)

func _resolve_troop_slot_view(button: Button) -> Dictionary:
	if button == null:
		return {}
	var cached_variant: Variant = button.get_meta("troop_slot_view", {})
	return cached_variant as Dictionary if cached_variant is Dictionary else {}

func _refresh_troop_slot_scroll_container(layout_profile: Dictionary = {}) -> void:
	if _troop_slot_scroll == null:
		return
	_troop_slot_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_troop_slot_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	var viewport_height := int(layout_profile.get("troop_slot_scroll_min_height", 0))
	viewport_height = maxi(viewport_height, _compute_troop_slot_scroll_height())
	_troop_slot_scroll.custom_minimum_size = Vector2(0, viewport_height)
	var scroll_bar := _troop_slot_scroll.get_v_scroll_bar()
	if scroll_bar != null:
		scroll_bar.modulate = Color(1.0, 1.0, 1.0, 0.0)
		scroll_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
		scroll_bar.custom_minimum_size = Vector2.ZERO

func _compute_troop_slot_scroll_height() -> int:
	var visible_count := mini(TROOP_SLOT_VISIBLE_COUNT, _troop_slot_buttons.size())
	if visible_count <= 0:
		return 0
	var gap := 1
	if _troop_slot_list != null:
		gap = _troop_slot_list.get_theme_constant("separation")
	var total_height := 0
	for index in range(visible_count):
		var button := _troop_slot_buttons[index] as Button
		if button == null:
			continue
		var height := int(button.custom_minimum_size.y)
		if height <= 0:
			height = int(button.get_combined_minimum_size().y)
		if height <= 0:
			height = 40
		total_height += height
		if index > 0:
			total_height += gap
	return total_height

func _bind_interior_summary_button(button: Button, tab_id: String) -> void:
	if button == null:
		return
	var callback := func() -> void:
		_on_interior_summary_button_pressed(tab_id)
	if not button.pressed.is_connected(callback):
		button.pressed.connect(callback)

func _on_action_button_pressed(action_id: String) -> void:
	if action_id == "world":
		var world_copy := _resolve_under_construction_button_copy("world")
		var world_label := str(world_copy.get("label", "国战")).strip_edges()
		var world_description := str(world_copy.get("description", "当前仅切换到大地图模式。")).strip_edges()
		if _entry_status != null:
			_entry_status.text = _compact_single_line_text(_format_copy_template("world_entry_selected_status_template", {"label": world_label}, "已选：{label}"), 14)
			_entry_status.tooltip_text = _format_copy_template(
				"world_entry_selected_tooltip_template",
				{
					"label": world_label,
					"description": world_description,
				},
				"已选入口：{label}（开发中） | {description}"
			)
		mode_toggle_requested.emit(WORLD_MODE)
		return
	if action_id == "chat":
		shell_action_requested.emit(action_id)
		return
	set_city_action_focus(action_id)
	shell_action_requested.emit(action_id)

func _on_troop_slot_pressed(slot_index: int) -> void:
	if slot_index < 0 or slot_index >= _troop_slot_buttons.size():
		return
	var button := _troop_slot_buttons[slot_index] as Button
	if button == null:
		return
	var troop_id := str(button.get_meta("troop_id", "")).strip_edges()
	if troop_id == "":
		return
	troop_slot_requested.emit(troop_id)

func _on_interior_summary_button_pressed(tab_id: String) -> void:
	set_city_action_focus(DEFAULT_CITY_ACTION)
	interior_tab_requested.emit(tab_id)

func _refresh_interior_summary_buttons() -> void:
	var is_city_mode := _current_mode == CITY_MODE
	var show_interior_quick_links := is_city_mode and _current_city_action == DEFAULT_CITY_ACTION
	if _interior_quick_links != null:
		_interior_quick_links.visible = show_interior_quick_links
	for tab_id_variant in _interior_summary_buttons.keys():
		var tab_id := str(tab_id_variant)
		var button := _interior_summary_buttons[tab_id_variant] as Button
		if button == null:
			continue
		button.visible = show_interior_quick_links
		button.disabled = not show_interior_quick_links
		button.text = _resolve_interior_tab_label(tab_id)
		button.tooltip_text = _format_copy_template("interior_quick_link_tooltip_template", {"label": button.text}, "直达内政/{label}")

func _refresh_city_shell_density() -> void:
	var is_city_mode := _current_mode == CITY_MODE
	var is_interior_focus := _current_city_action == DEFAULT_CITY_ACTION
	var show_city_detail := is_city_mode and is_interior_focus
	var has_non_default_focus := is_city_mode and not is_interior_focus
	_city_focus.visible = has_non_default_focus
	_city_state_title.visible = show_city_detail
	_city_state_summary.visible = show_city_detail
	_city_tech_summary.visible = show_city_detail
	_entry_status.visible = has_non_default_focus
	_world_entry_hint.visible = _current_mode == WORLD_MODE or has_non_default_focus
	_refresh_center_stage_chrome()

func _refresh_city_action_button_states() -> void:
	for action_id_variant in _city_action_button_groups.keys():
		var action_id := str(action_id_variant)
		var is_selected := _current_mode == CITY_MODE and _current_city_action == action_id
		var button_group: Dictionary = _city_action_button_groups.get(action_id_variant, {}) as Dictionary
		for surface_role_variant in button_group.keys():
			var surface_role := str(surface_role_variant)
			var button := button_group[surface_role_variant] as Button
			if button == null:
				continue
			_apply_city_action_button_state(button, is_selected, surface_role)

func _refresh_utility_row_density() -> void:
	if _utility_row == null:
		return
	var show_activity_help := _current_mode == WORLD_MODE or _current_city_action != DEFAULT_CITY_ACTION
	_mail_button.visible = true
	_activity_button.visible = show_activity_help
	_help_button.visible = show_activity_help
	_utility_row.visible = _mail_button.visible or _activity_button.visible or _help_button.visible

func _apply_city_action_button_state(button: Button, is_selected: bool, surface_role: String) -> void:
	_apply_button_chrome_profile(button, _resolve_city_action_chrome_profile(is_selected, surface_role))
	if surface_role == CITY_ACTION_SURFACE_MAIN_NAV and _has_main_nav_button_shell_texture(is_selected):
		_apply_button_texture_backing(
			button,
			_resolve_main_nav_button_shell_profile(is_selected),
			_resolve_main_nav_button_pressed_shell_profile(is_selected)
		)

func _has_main_nav_button_shell_texture(is_selected: bool) -> bool:
	return _resolve_main_nav_button_shell_profile(is_selected).get("texture", null) != null

func _apply_button_texture_backing(button: Button, profile: Dictionary, pressed_profile: Dictionary = {}) -> void:
	if button == null:
		return
	var texture := profile.get("texture", null) as Texture2D
	if texture == null:
		return
	var normal_style := _build_texture_stylebox_from_profile(profile, texture)
	var pressed_texture := pressed_profile.get("texture", null) as Texture2D
	var pressed_style := _build_texture_stylebox_from_profile(pressed_profile, pressed_texture) if pressed_texture != null else normal_style.duplicate()
	button.add_theme_stylebox_override("normal", normal_style)
	button.add_theme_stylebox_override("hover", normal_style.duplicate())
	button.add_theme_stylebox_override("pressed", pressed_style)
	button.add_theme_stylebox_override("focus", normal_style.duplicate())
	button.add_theme_stylebox_override("disabled", normal_style.duplicate())

func _build_texture_stylebox_from_profile(profile: Dictionary, texture: Texture2D) -> StyleBoxTexture:
	var style := StyleBoxTexture.new()
	style.texture = texture
	style.modulate_color = profile.get("modulate", Color(1.0, 1.0, 1.0, 1.0))
	return style

func _apply_left_rail_density_style() -> void:
	var density_profile := _resolve_left_rail_density_profile()
	if _left_margin != null:
		var outer_margin := int(density_profile.get("outer_margin", 6))
		_left_margin.add_theme_constant_override("margin_left", outer_margin)
		_left_margin.add_theme_constant_override("margin_top", outer_margin)
		_left_margin.add_theme_constant_override("margin_right", outer_margin)
		_left_margin.add_theme_constant_override("margin_bottom", outer_margin)
	if _left_column != null:
		_left_column.add_theme_constant_override("separation", int(density_profile.get("section_gap", 1)))
	if _task_header_row != null:
		_task_header_row.add_theme_constant_override("separation", int(density_profile.get("task_header_gap", 1)))
	if _task_icon != null:
		_task_icon.custom_minimum_size = density_profile.get("task_icon_min_size", Vector2(14, 14))
	if _task_title != null:
		_task_title.add_theme_font_size_override("font_size", int(density_profile.get("task_title_font_size", 11)))
		_task_title.add_theme_color_override("font_color", density_profile.get("title_color", Color(0.89, 0.84, 0.73, 0.96)))
	if _task_body != null:
		_task_body.custom_minimum_size = Vector2(0, int(density_profile.get("task_body_min_height", 18)))
		_task_body.add_theme_font_size_override("font_size", int(density_profile.get("primary_token_font_size", 8)))
		_task_body.add_theme_color_override("font_color", density_profile.get("token_color", Color(0.92, 0.90, 0.84, 0.98)))
	if _city_state_title != null:
		_city_state_title.custom_minimum_size = Vector2(0, int(density_profile.get("section_label_min_height", 12)))
		_city_state_title.add_theme_font_size_override("font_size", int(density_profile.get("section_title_font_size", 7)))
		_city_state_title.add_theme_color_override("font_color", density_profile.get("secondary_color", Color(0.74, 0.73, 0.69, 0.94)))
	if _city_state_summary != null:
		_city_state_summary.custom_minimum_size = Vector2(0, int(density_profile.get("summary_row_min_height", 13)))
		_city_state_summary.add_theme_font_size_override("font_size", int(density_profile.get("secondary_token_font_size", 6)))
		_city_state_summary.add_theme_color_override("font_color", density_profile.get("token_color", Color(0.92, 0.90, 0.84, 0.98)))
	if _city_tech_summary != null:
		_city_tech_summary.custom_minimum_size = Vector2(0, int(density_profile.get("section_label_min_height", 12)))
		_city_tech_summary.add_theme_font_size_override("font_size", int(density_profile.get("secondary_token_font_size", 6)))
		_city_tech_summary.add_theme_color_override("font_color", density_profile.get("secondary_color", Color(0.74, 0.73, 0.69, 0.94)))
	if _troop_section_title != null:
		_troop_section_title.custom_minimum_size = Vector2(0, int(density_profile.get("section_label_min_height", 12)))
		_troop_section_title.add_theme_font_size_override("font_size", int(density_profile.get("section_title_font_size", 7)))
		_troop_section_title.add_theme_color_override("font_color", density_profile.get("secondary_color", Color(0.74, 0.73, 0.69, 0.94)))
	if _troop_summary != null:
		_troop_summary.add_theme_font_size_override("font_size", int(density_profile.get("secondary_token_font_size", 6)))
		_troop_summary.add_theme_color_override("font_color", density_profile.get("token_color", Color(0.92, 0.90, 0.84, 0.98)))
	if _troop_slot_list != null:
		_troop_slot_list.add_theme_constant_override("separation", int(density_profile.get("card_list_gap", 1)))
	_refresh_troop_slot_scroll_container(_resolve_shell_layout_profile())
	if _interior_quick_links != null:
		_interior_quick_links.add_theme_constant_override("separation", int(density_profile.get("quick_link_gap", 1)))
	for button in [_interior_summary_button_market, _interior_summary_button_tax, _interior_summary_button_policy, _interior_summary_button_affairs]:
		var quick_link_button := button as Button
		if quick_link_button == null:
			continue
		quick_link_button.custom_minimum_size = Vector2(0, int(density_profile.get("quick_link_min_height", 18)))
		quick_link_button.add_theme_font_size_override("font_size", int(density_profile.get("quick_link_font_size", 7)))
		quick_link_button.add_theme_color_override("font_color", density_profile.get("secondary_color", Color(0.74, 0.73, 0.69, 0.94)))
		quick_link_button.add_theme_color_override("font_hover_color", density_profile.get("token_color", Color(0.92, 0.90, 0.84, 0.98)))
		quick_link_button.add_theme_color_override("font_pressed_color", density_profile.get("token_color", Color(0.92, 0.90, 0.84, 0.98)))
		_apply_button_chrome_profile(quick_link_button, _resolve_left_rail_quick_link_chrome_profile())
	for button in _troop_slot_buttons:
		var troop_button := button as Button
		if troop_button == null:
			continue
		_apply_troop_slot_density_style(troop_button, density_profile)

func _apply_troop_slot_button_style(button: Button, status_text: String, is_disabled: bool, _role_tag: String, slot_index: int) -> void:
	if button == null:
		return
	var is_moving := status_text.begins_with("行军")
	_apply_button_chrome_profile(button, _resolve_troop_slot_chrome_profile(slot_index, is_disabled, is_moving), true)
	if _has_troop_slot_shell_texture():
		_apply_transparent_button_backing(button)
	_apply_troop_slot_shell_texture(button)
	_apply_troop_slot_view_style(button, slot_index, is_disabled, is_moving)

func _apply_transparent_button_backing(button: Button) -> void:
	var transparent_style := _build_button_stylebox(Color(0, 0, 0, 0), Color(0, 0, 0, 0), 0, 0, 0, 0, 0, 0)
	button.add_theme_stylebox_override("normal", transparent_style)
	button.add_theme_stylebox_override("hover", transparent_style)
	button.add_theme_stylebox_override("pressed", transparent_style)
	button.add_theme_stylebox_override("focus", transparent_style)
	button.add_theme_stylebox_override("disabled", transparent_style)

func _has_troop_slot_shell_texture() -> bool:
	return _resolve_troop_slot_shell_profile().get("texture", null) != null

func _apply_troop_slot_shell_texture(button: Button) -> void:
	var refs := _resolve_troop_slot_view(button)
	if refs.is_empty():
		return
	var shell_texture := refs.get("shell_texture") as TextureRect
	if shell_texture == null:
		return
	var profile := _resolve_troop_slot_shell_profile()
	var texture := profile.get("texture", null) as Texture2D
	shell_texture.texture = texture
	shell_texture.visible = texture != null
	if texture == null:
		return
	shell_texture.modulate = profile.get("modulate", Color(1.0, 1.0, 1.0, 1.0))
	shell_texture.expand_mode = int(profile.get("expand_mode", TextureRect.EXPAND_IGNORE_SIZE))
	shell_texture.stretch_mode = int(profile.get("stretch_mode", TextureRect.STRETCH_SCALE))

func _apply_troop_slot_density_style(button: Button, density_profile: Dictionary) -> void:
	var refs := _resolve_troop_slot_view(button)
	if refs.is_empty():
		return
	var primary_size := int(density_profile.get("primary_token_font_size", 8))
	var secondary_size := int(density_profile.get("secondary_token_font_size", 6))
	var title_size := maxi(primary_size + 1, 9)
	var title_color: Color = density_profile.get("title_color", Color(0.89, 0.84, 0.73, 0.96))
	var token_color: Color = density_profile.get("token_color", Color(0.92, 0.90, 0.84, 0.98))
	var secondary_color: Color = density_profile.get("secondary_color", Color(0.74, 0.73, 0.69, 0.94))
	(refs.get("portrait_label") as Label).add_theme_font_size_override("font_size", title_size + 6)
	(refs.get("portrait_label") as Label).add_theme_color_override("font_color", token_color)
	(refs.get("slot_label") as Label).add_theme_font_size_override("font_size", primary_size)
	(refs.get("slot_label") as Label).add_theme_color_override("font_color", token_color)
	(refs.get("role_label") as Label).add_theme_font_size_override("font_size", secondary_size)
	(refs.get("role_label") as Label).add_theme_color_override("font_color", title_color)
	(refs.get("status_label") as Label).add_theme_font_size_override("font_size", secondary_size)
	(refs.get("title_label") as Label).add_theme_font_size_override("font_size", title_size)
	(refs.get("title_label") as Label).add_theme_color_override("font_color", token_color)
	(refs.get("strength_tag") as Label).add_theme_font_size_override("font_size", secondary_size)
	(refs.get("strength_tag") as Label).add_theme_color_override("font_color", secondary_color)
	(refs.get("strength_value") as Label).add_theme_font_size_override("font_size", secondary_size)
	(refs.get("strength_value") as Label).add_theme_color_override("font_color", title_color)
	(refs.get("morale_tag") as Label).add_theme_font_size_override("font_size", secondary_size)
	(refs.get("morale_tag") as Label).add_theme_color_override("font_color", secondary_color)
	(refs.get("morale_value") as Label).add_theme_font_size_override("font_size", secondary_size)
	(refs.get("morale_value") as Label).add_theme_color_override("font_color", secondary_color)

func _apply_troop_slot_view_style(button: Button, slot_index: int, is_disabled: bool, is_moving: bool) -> void:
	var refs := _resolve_troop_slot_view(button)
	if refs.is_empty():
		return
	var has_shell_texture := _has_troop_slot_shell_texture()
	var archetype := _resolve_troop_slot_archetype(slot_index)
	var accent := Color(0.69, 0.57, 0.34, 0.82)
	var base_line := Color(0.34, 0.25, 0.16, 0.44)
	var bottom_line := Color(0.24, 0.18, 0.12, 0.34)
	match archetype:
		TROOP_SLOT_ARCHETYPE_PRIMARY:
			accent = Color(0.78, 0.64, 0.37, 0.9)
		TROOP_SLOT_ARCHETYPE_MOBILE:
			accent = Color(0.59, 0.50, 0.33, 0.76)
		_:
			accent = Color(0.48, 0.42, 0.30, 0.62)
	if is_moving:
		accent = Color(0.88, 0.72, 0.40, 0.96)
		base_line = Color(0.52, 0.37, 0.18, 0.54)
	if is_disabled:
		accent.a *= 0.6
		base_line.a *= 0.55
		bottom_line.a *= 0.5
	var portrait_bg := Color(0.08, 0.07, 0.06, 0.94)
	var portrait_border := Color(0.32, 0.25, 0.17, 0.86)
	if is_disabled:
		portrait_bg = Color(0.07, 0.07, 0.07, 0.82)
		portrait_border = Color(0.22, 0.20, 0.18, 0.58)
	(refs.get("left_inlay") as ColorRect).color = Color(base_line.r, base_line.g, base_line.b, 0.0 if has_shell_texture else base_line.a)
	(refs.get("top_line") as ColorRect).color = Color(accent.r, accent.g, accent.b, 0.0 if has_shell_texture else accent.a)
	(refs.get("bottom_line") as ColorRect).color = Color(bottom_line.r, bottom_line.g, bottom_line.b, 0.0 if has_shell_texture else bottom_line.a)
	if has_shell_texture:
		(refs.get("portrait_panel") as PanelContainer).add_theme_stylebox_override("panel", _create_troop_slot_stylebox(Color(0, 0, 0, 0), Color(0, 0, 0, 0), 0, 0))
		(refs.get("strength_track") as PanelContainer).add_theme_stylebox_override("panel", _create_troop_slot_stylebox(Color(0, 0, 0, 0), Color(0, 0, 0, 0), 0, 0))
		(refs.get("morale_track") as PanelContainer).add_theme_stylebox_override("panel", _create_troop_slot_stylebox(Color(0, 0, 0, 0), Color(0, 0, 0, 0), 0, 0))
	else:
		(refs.get("portrait_panel") as PanelContainer).add_theme_stylebox_override("panel", _create_troop_slot_stylebox(portrait_bg, portrait_border, 1, 1))
		(refs.get("strength_track") as PanelContainer).add_theme_stylebox_override("panel", _create_troop_slot_stylebox(Color(0.08, 0.06, 0.05, 0.94), Color(0.28, 0.21, 0.15, 0.78), 1, 1))
		(refs.get("morale_track") as PanelContainer).add_theme_stylebox_override("panel", _create_troop_slot_stylebox(Color(0.05, 0.05, 0.05, 0.92), Color(0.20, 0.18, 0.15, 0.72), 1, 1))
	(refs.get("strength_fill") as ColorRect).color = accent.lightened(0.08)
	(refs.get("morale_fill") as ColorRect).color = Color(accent.r * 0.72, accent.g * 0.62, accent.b * 0.52, 0.92)
	(refs.get("status_label") as Label).add_theme_color_override("font_color", accent.lightened(0.08))

func _apply_troop_slot_content(button: Button, payload: Dictionary, slot_label: String, role_tag: String, is_enabled: bool) -> void:
	var refs := _resolve_troop_slot_view(button)
	if refs.is_empty():
		return
	var label := str(payload.get("label", slot_label)).strip_edges()
	var subtitle := str(payload.get("subtitle", "")).strip_edges()
	var hero_name := _resolve_troop_slot_hero_name(payload, subtitle)
	var strength := maxi(int(payload.get("strength", 0)), 0)
	var strength_max := maxi(maxi(int(payload.get("strengthMax", 0)), strength), 1)
	var morale := clampi(int(payload.get("morale", 0)), 0, maxi(int(payload.get("moraleMax", 100)), 1))
	var morale_max := maxi(int(payload.get("moraleMax", 100)), 1)
	var status_label := _resolve_troop_slot_status_label(payload, str(payload.get("statusText", "")), subtitle, is_enabled)
	var display_title := label if label != "" else slot_label
	if not is_enabled:
		display_title = "待补位"
		hero_name = "武将待命"
		strength = 0
		morale = 0
	(refs.get("slot_label") as Label).text = slot_label
	(refs.get("role_label") as Label).text = role_tag
	(refs.get("status_label") as Label).text = status_label
	(refs.get("title_label") as Label).text = _truncate_text(display_title, 9)
	(refs.get("portrait_label") as Label).text = _resolve_troop_slot_portrait_text(hero_name, slot_label, is_enabled)
	(refs.get("strength_value") as Label).text = "%s/%s" % [_format_grouped_int(strength), _format_grouped_int(strength_max)]
	(refs.get("morale_value") as Label).text = "%s/%s" % [_format_grouped_int(morale), _format_grouped_int(morale_max)]
	var strength_fill := refs.get("strength_fill") as ColorRect
	if strength_fill != null:
		strength_fill.custom_minimum_size = Vector2(maxi(0, int(round(TROOP_STRENGTH_TRACK_WIDTH * _resolve_troop_ratio(strength, strength_max)))), 0)
		strength_fill.offset_right = strength_fill.custom_minimum_size.x
	var morale_fill := refs.get("morale_fill") as ColorRect
	if morale_fill != null:
		morale_fill.custom_minimum_size = Vector2(maxi(0, int(round(TROOP_MORALE_TRACK_WIDTH * _resolve_troop_ratio(morale, morale_max)))), 0)
		morale_fill.offset_right = morale_fill.custom_minimum_size.x

func _apply_utility_row_style() -> void:
	for button in [_mail_button, _activity_button, _help_button]:
		var utility_button := button as Button
		if utility_button == null:
			continue
		_apply_button_chrome_profile(utility_button, _resolve_utility_button_chrome_profile())

func _refresh_center_stage_chrome() -> void:
	if _center_stage == null:
		return
	_center_stage.add_theme_stylebox_override("panel", _build_stylebox_from_chrome_profile(_resolve_center_stage_chrome_profile()))

func _ensure_city_grid_debug_preview() -> void:
	if _city_grid_debug_preview != null:
		return
	if _stage_column == null:
		return
	_city_grid_debug_preview = Control.new()
	_city_grid_debug_preview.name = "CityGridDebugPreview"
	_city_grid_debug_preview.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_city_grid_debug_preview.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_city_grid_debug_preview.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_city_grid_debug_preview.clip_contents = false
	_stage_column.add_child(_city_grid_debug_preview)
	if _city_entry_grid != null and _city_entry_grid.get_parent() == _stage_column:
		_stage_column.move_child(_city_grid_debug_preview, _city_entry_grid.get_index())
	_city_grid_foundation_texture = TextureRect.new()
	_city_grid_foundation_texture.name = "MainCityFoundationTexture"
	_city_grid_foundation_texture.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_city_grid_foundation_texture.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_city_grid_foundation_texture.stretch_mode = TextureRect.STRETCH_SCALE
	_city_grid_foundation_texture.visible = false
	_city_grid_foundation_texture.z_index = 0
	_city_grid_debug_preview.add_child(_city_grid_foundation_texture)
	_city_grid_wall_ring_texture = TextureRect.new()
	_city_grid_wall_ring_texture.name = "CityWallRingTexture"
	_city_grid_wall_ring_texture.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_city_grid_wall_ring_texture.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_city_grid_wall_ring_texture.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_city_grid_wall_ring_texture.visible = false
	_city_grid_wall_ring_texture.z_index = 0
	_city_grid_debug_preview.add_child(_city_grid_wall_ring_texture)

func _refresh_city_grid_debug_preview() -> bool:
	_ensure_city_grid_debug_preview()
	if _city_grid_debug_preview == null:
		return false
	var profile := _resolve_city_grid_profile()
	if profile.is_empty():
		_city_grid_debug_preview.visible = false
		return false
	var visual_grid := profile.get("visual_grid", {}) as Dictionary
	var projection := _resolve_city_grid_projection(profile)
	var columns: int = maxi(1, int(visual_grid.get("columns", 5)))
	var rows: int = maxi(1, int(visual_grid.get("rows", 5)))
	var cell_size := _resolve_city_grid_debug_cell_size(profile)
	var preview_size := _resolve_city_grid_debug_preview_size(profile, projection, columns, rows, cell_size)
	_city_grid_debug_preview.custom_minimum_size = preview_size
	_city_grid_debug_preview.size = preview_size
	var cell_count: int = columns * rows
	while _city_grid_debug_cells.size() < cell_count:
		var cell := _create_city_grid_debug_cell()
		_city_grid_debug_cells.append(cell)
		_city_grid_debug_preview.add_child(cell)
	var slot_map := _build_city_grid_debug_slot_map(profile, columns, rows)
	var asset_slots := _resolve_city_grid_asset_slots(profile)
	_apply_city_grid_layer_texture(_city_grid_foundation_texture, profile, asset_slots, "foundation", preview_size)
	_apply_city_grid_wall_ring(profile, asset_slots, preview_size)
	var show_debug_labels := bool(profile.get("debug_labels_enabled_by_default", false))
	for index in range(_city_grid_debug_cells.size()):
		var cell := _city_grid_debug_cells[index] as PanelContainer
		if cell == null:
			continue
		var is_active_cell: bool = index < cell_count
		cell.visible = is_active_cell
		if not is_active_cell:
			continue
		cell.custom_minimum_size = cell_size
		cell.size = cell_size
		var x: int = index % columns
		var y: int = int(index / columns)
		var key := _city_grid_key_from_xy(x, y)
		var slot := slot_map.get(key, {}) as Dictionary
		var slot_kind := str(slot.get("slot_kind", "breathing"))
		var grid := Vector2i(x, y)
		cell.position = _project_city_grid_position(profile, grid, preview_size, cell_size, 0.0, "center")
		cell.z_index = _resolve_city_grid_z_index(projection, grid, slot_kind)
		_apply_city_grid_debug_cell(cell, slot, asset_slots, x, y, columns, rows, show_debug_labels)
	return true

func _create_city_grid_debug_cell() -> PanelContainer:
	var cell := PanelContainer.new()
	cell.mouse_filter = Control.MOUSE_FILTER_IGNORE
	cell.custom_minimum_size = Vector2(CITY_GRID_DEBUG_CELL_WIDTH, CITY_GRID_DEBUG_CELL_HEIGHT)
	cell.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	cell.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var content := Control.new()
	content.name = "CellContent"
	content.mouse_filter = Control.MOUSE_FILTER_IGNORE
	content.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	cell.add_child(content)
	var asset_texture := TextureRect.new()
	asset_texture.name = "AssetTexture"
	asset_texture.mouse_filter = Control.MOUSE_FILTER_IGNORE
	asset_texture.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	asset_texture.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	asset_texture.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	asset_texture.visible = false
	content.add_child(asset_texture)
	var label := Label.new()
	label.name = "CellLabel"
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 7)
	content.add_child(label)
	return cell

func _resolve_city_grid_debug_cell_size(profile: Dictionary) -> Vector2:
	var visual_grid := profile.get("visual_grid", {}) as Dictionary
	return _city_grid_profile_vector2(
		visual_grid.get("cell_size", Vector2(CITY_GRID_DEBUG_CELL_WIDTH, CITY_GRID_DEBUG_CELL_HEIGHT)),
		Vector2(CITY_GRID_DEBUG_CELL_WIDTH, CITY_GRID_DEBUG_CELL_HEIGHT)
	)

func _resolve_city_grid_debug_preview_size(profile: Dictionary, projection: Dictionary, columns: int, rows: int, cell_size: Vector2) -> Vector2:
	var visual_grid := profile.get("visual_grid", {}) as Dictionary
	var tile_width := float(projection.get("tile_width", 56.0))
	var tile_height := float(projection.get("tile_height", 28.0))
	var fallback_step := Vector2(tile_width * 0.5, tile_height * 0.5)
	var fallback_size := Vector2(
		maxi(int(round((columns + rows - 2) * fallback_step.x + cell_size.x)), 1),
		maxi(int(round((columns + rows - 2) * fallback_step.y + cell_size.y)), 1)
	)
	return _city_grid_profile_vector2(visual_grid.get("preview_size", fallback_size), fallback_size)

func _resolve_city_grid_projection(profile: Dictionary) -> Dictionary:
	var visual_grid := profile.get("visual_grid", {}) as Dictionary
	var legacy_projection := visual_grid.get("projection", {}) as Dictionary
	var projection := profile.get("city_grid_projection", {}) as Dictionary
	var resolved := projection.duplicate(true)
	if resolved.is_empty() and not legacy_projection.is_empty():
		resolved["type"] = legacy_projection.get("type", "isometric_2_to_1")
		var legacy_step := _city_grid_profile_vector2(legacy_projection.get("cell_step", Vector2(28, 14)), Vector2(28, 14))
		resolved["tile_width"] = legacy_step.x * 2.0
		resolved["tile_height"] = legacy_step.y * 2.0
		resolved["origin"] = legacy_projection.get("origin", Vector2.ZERO)
	if not resolved.has("type"):
		resolved["type"] = "isometric_2_to_1"
	if not resolved.has("tile_width"):
		resolved["tile_width"] = 56.0
	if not resolved.has("tile_height"):
		resolved["tile_height"] = 28.0
	if not resolved.has("origin"):
		resolved["origin"] = Vector2.ZERO
	if not resolved.has("elevation_scale"):
		resolved["elevation_scale"] = 1.0
	if not resolved.has("anchor_rule"):
		resolved["anchor_rule"] = "center"
	if not resolved.has("z_sort_rule"):
		resolved["z_sort_rule"] = {
			"type": "grid_sum_then_x",
			"base_z_index": 10,
			"sort_step": 10,
			"x_step": 1,
			"layer_offsets": {},
			"flat_layers": [],
		}
	return resolved

func _project_city_grid_position(
	profile: Dictionary,
	grid: Vector2i,
	preview_size: Vector2,
	target_size: Vector2,
	elevation: float = 0.0,
	anchor_rule_override: String = ""
) -> Vector2:
	var projection := _resolve_city_grid_projection(profile)
	var tile_width := float(projection.get("tile_width", 56.0))
	var tile_height := float(projection.get("tile_height", 28.0))
	var elevation_scale := float(projection.get("elevation_scale", 1.0))
	var fallback_origin := Vector2(preview_size.x * 0.5, target_size.y * 1.5)
	var origin := _city_grid_profile_vector2(projection.get("origin", fallback_origin), fallback_origin)
	var center := Vector2(
		float(grid.x - grid.y) * tile_width * 0.5,
		float(grid.x + grid.y) * tile_height * 0.5 - elevation * elevation_scale
	) + origin
	var anchor_rule := anchor_rule_override.strip_edges()
	if anchor_rule == "":
		anchor_rule = str(projection.get("anchor_rule", "center")).strip_edges()
	match anchor_rule:
		"bottom_center", "bottom-center footprint center":
			return center - Vector2(target_size.x * 0.5, target_size.y)
		"top_left":
			return center
		_:
			return center - target_size * 0.5

func _resolve_city_grid_z_index(projection: Dictionary, grid: Vector2i, slot_kind: String) -> int:
	var rule := projection.get("z_sort_rule", {}) as Dictionary
	var rule_type := str(rule.get("type", "grid_sum_then_x"))
	var layer_offsets := rule.get("layer_offsets", {}) as Dictionary
	var flat_layers := rule.get("flat_layers", []) as Array
	var layer_offset := int(layer_offsets.get(slot_kind, 0))
	if flat_layers.has(slot_kind):
		return int(rule.get("base_z_index", 10)) + layer_offset
	match rule_type:
		"grid_sum_then_x":
			var base_z := int(rule.get("base_z_index", 10))
			var sort_step := int(rule.get("sort_step", 10))
			var x_step := int(rule.get("x_step", 1))
			return base_z + ((grid.x + grid.y) * sort_step) + (grid.x * x_step) + layer_offset
		_:
			return int(rule.get("base_z_index", 10)) + layer_offset

func _apply_city_grid_debug_cell(
	cell: PanelContainer,
	slot: Dictionary,
	asset_slots: Dictionary,
	x: int,
	y: int,
	columns: int,
	rows: int,
	show_debug_labels: bool
) -> void:
	var asset_slot := _resolve_city_grid_asset_slot(slot, asset_slots)
	var has_texture := _city_grid_asset_slot_has_texture(asset_slot)
	cell.add_theme_stylebox_override("panel", _resolve_city_grid_debug_cell_style(slot, x, y, columns, rows, has_texture))
	cell.tooltip_text = _build_city_grid_debug_tooltip(slot, asset_slot, x, y)
	_apply_city_grid_asset_slot_texture(cell, asset_slot)
	var label := cell.get_node_or_null("CellContent/CellLabel") as Label
	if label == null:
		return
	label.text = _resolve_city_grid_debug_token(slot, asset_slot) if show_debug_labels else ""
	label.add_theme_color_override("font_color", Color(0.86, 0.72, 0.46, 0.88))

func _build_city_grid_debug_slot_map(profile: Dictionary, columns: int, rows: int) -> Dictionary:
	var slot_map := {}
	var visual_shell := profile.get("visual_shell", {}) as Dictionary
	var perimeter := visual_shell.get("perimeter", {}) as Dictionary
	if not perimeter.is_empty():
		for y in range(rows):
			for x in range(columns):
				if not _is_city_grid_edge_cell(x, y, columns, rows):
					continue
				var key := _city_grid_key_from_xy(x, y)
				var slot := perimeter.duplicate(true)
				slot["grid"] = Vector2i(x, y)
				slot_map[key] = slot
	_append_city_grid_slot_map(slot_map, visual_shell.get("breathing_slots", []), "breathing")
	_append_city_grid_slot_map(slot_map, profile.get("active_core_slots", []), "active_building")
	_append_city_grid_slot_map(slot_map, visual_shell.get("corner_slots", []), "corner_tower")
	_append_city_grid_slot_map(slot_map, visual_shell.get("gate_slots", []), "city_gate")
	_append_city_grid_slot_map(slot_map, visual_shell.get("reserved_slots", []), "reserved_plot")
	return slot_map

func _append_city_grid_slot_map(slot_map: Dictionary, slots_variant: Variant, fallback_kind: String) -> void:
	if not (slots_variant is Array):
		return
	for slot_variant in slots_variant:
		var slot := {}
		if slot_variant is Dictionary:
			slot = (slot_variant as Dictionary).duplicate(true)
		else:
			slot = {
				"grid": slot_variant,
				"slot_kind": fallback_kind,
			}
		var key := _city_grid_key_from_variant(slot.get("grid", Vector2i(-1, -1)))
		if key == "":
			continue
		if fallback_kind == "breathing" and slot_map.has(key):
			continue
		if not slot.has("slot_kind"):
			slot["slot_kind"] = fallback_kind
		slot_map[key] = slot

func _resolve_city_grid_asset_slots(profile: Dictionary) -> Dictionary:
	var asset_slots_variant: Variant = profile.get("asset_slots", {})
	if asset_slots_variant is Dictionary:
		return (asset_slots_variant as Dictionary).duplicate(true)
	return {}

func _resolve_city_grid_asset_slot(slot: Dictionary, asset_slots: Dictionary) -> Dictionary:
	if str(slot.get("slot_kind", "")) == "continuous_city_wall_ring":
		return {}
	var asset_id := str(slot.get("asset_id", "")).strip_edges()
	if asset_id != "" and asset_slots.has(asset_id):
		var asset_slot_variant: Variant = asset_slots.get(asset_id, {})
		if asset_slot_variant is Dictionary:
			return (asset_slot_variant as Dictionary).duplicate(true)
	return {}

func _city_grid_asset_slot_has_texture(asset_slot: Dictionary) -> bool:
	if asset_slot.get("texture", null) is Texture2D:
		return true
	return str(asset_slot.get("texture_path", "")).strip_edges() != ""

func _apply_city_grid_wall_ring(profile: Dictionary, asset_slots: Dictionary, preview_size: Vector2) -> void:
	_apply_city_grid_layer_texture(_city_grid_wall_ring_texture, profile, asset_slots, "perimeter", preview_size)

func _apply_city_grid_layer_texture(texture_rect: TextureRect, profile: Dictionary, asset_slots: Dictionary, visual_shell_key: String, preview_size: Vector2) -> void:
	if texture_rect == null:
		return
	var visual_shell := profile.get("visual_shell", {}) as Dictionary
	var layer := visual_shell.get(visual_shell_key, {}) as Dictionary
	if layer.is_empty():
		texture_rect.visible = false
		texture_rect.texture = null
		return
	var asset_id := str(layer.get("asset_id", "")).strip_edges()
	var asset_slot_variant: Variant = asset_slots.get(asset_id, {})
	var asset_slot: Dictionary = asset_slot_variant as Dictionary if asset_slot_variant is Dictionary else {}
	var texture := _resolve_city_grid_asset_slot_texture(asset_slot)
	texture_rect.texture = texture
	texture_rect.visible = texture != null
	if texture == null:
		return
	var fallback_size := _city_grid_profile_vector2(layer.get("display_size", preview_size), preview_size)
	var display_size := _city_grid_profile_vector2(asset_slot.get("display_size", fallback_size), fallback_size)
	var fallback_offset := _city_grid_profile_vector2(layer.get("display_offset", Vector2.ZERO), Vector2.ZERO)
	var display_offset := _city_grid_profile_vector2(asset_slot.get("display_offset", fallback_offset), fallback_offset)
	var layer_grid := _city_grid_vector2i_from_variant(layer.get("grid", _resolve_city_grid_default_layer_grid(profile)))
	var slot_kind := str(asset_slot.get("slot_kind", layer.get("slot_kind", visual_shell_key))).strip_edges()
	var elevation := float(asset_slot.get("elevation", layer.get("elevation", 0.0)))
	var anchor_rule := str(asset_slot.get("anchor", layer.get("anchor", "center"))).strip_edges()
	texture_rect.custom_minimum_size = display_size
	texture_rect.size = display_size
	texture_rect.position = _project_city_grid_position(profile, layer_grid, preview_size, display_size, elevation, anchor_rule) + display_offset
	texture_rect.modulate = asset_slot.get("modulate", Color(1.0, 1.0, 1.0, 1.0))
	texture_rect.expand_mode = int(asset_slot.get("expand_mode", TextureRect.EXPAND_IGNORE_SIZE))
	texture_rect.stretch_mode = int(asset_slot.get("stretch_mode", TextureRect.STRETCH_SCALE))
	texture_rect.z_index = _resolve_city_grid_z_index(_resolve_city_grid_projection(profile), layer_grid, slot_kind)

func _apply_city_grid_asset_slot_texture(cell: PanelContainer, asset_slot: Dictionary) -> void:
	var texture_rect := cell.get_node_or_null("CellContent/AssetTexture") as TextureRect
	if texture_rect == null:
		return
	var texture := _resolve_city_grid_asset_slot_texture(asset_slot)
	texture_rect.texture = texture
	texture_rect.visible = texture != null
	if texture == null:
		return
	_apply_city_grid_asset_texture_anchor(cell, texture_rect, asset_slot)
	texture_rect.modulate = asset_slot.get("modulate", Color(1.0, 1.0, 1.0, 1.0))
	texture_rect.expand_mode = int(asset_slot.get("expand_mode", TextureRect.EXPAND_IGNORE_SIZE))
	texture_rect.stretch_mode = int(asset_slot.get("stretch_mode", TextureRect.STRETCH_KEEP_ASPECT_CENTERED))

func _resolve_city_grid_asset_slot_texture(asset_slot: Dictionary) -> Texture2D:
	var texture := asset_slot.get("texture", null) as Texture2D
	if texture != null:
		return texture
	var texture_path := str(asset_slot.get("texture_path", "")).strip_edges()
	if texture_path == "":
		return null
	if ResourceLoader.exists(texture_path):
		var loaded_resource: Resource = load(texture_path)
		if loaded_resource is Texture2D:
			return loaded_resource as Texture2D
	if texture_path.to_lower().ends_with(".png"):
		var image := Image.new()
		if image.load(texture_path) == OK:
			return ImageTexture.create_from_image(image)
	return null

func _apply_city_grid_asset_texture_anchor(cell: PanelContainer, texture_rect: TextureRect, asset_slot: Dictionary) -> void:
	var display_size := _city_grid_profile_vector2(
		asset_slot.get("display_size", cell.custom_minimum_size),
		cell.custom_minimum_size
	)
	var display_offset := _city_grid_profile_vector2(asset_slot.get("display_offset", Vector2.ZERO), Vector2.ZERO)
	var anchor := str(asset_slot.get("anchor", "cell_fill")).strip_edges()
	texture_rect.set_anchors_preset(Control.PRESET_TOP_LEFT)
	texture_rect.custom_minimum_size = display_size
	texture_rect.size = display_size
	match anchor:
		"bottom_center", "bottom-center footprint center":
			texture_rect.position = Vector2(
				(cell.custom_minimum_size.x - display_size.x) * 0.5,
				cell.custom_minimum_size.y - display_size.y
			) + display_offset
		"center":
			texture_rect.position = (cell.custom_minimum_size - display_size) * 0.5 + display_offset
		_:
			texture_rect.position = display_offset

func _city_grid_profile_vector2(value: Variant, fallback: Vector2) -> Vector2:
	if value is Vector2:
		return value as Vector2
	if value is Vector2i:
		var int_value := value as Vector2i
		return Vector2(int_value.x, int_value.y)
	if value is Array:
		var value_array := value as Array
		if value_array.size() >= 2:
			return Vector2(float(value_array[0]), float(value_array[1]))
	if value is Dictionary:
		var value_dict := value as Dictionary
		return Vector2(float(value_dict.get("x", fallback.x)), float(value_dict.get("y", fallback.y)))
	return fallback

func _resolve_city_grid_debug_cell_style(slot: Dictionary, x: int, y: int, columns: int, rows: int, has_texture: bool) -> StyleBoxFlat:
	var slot_kind := str(slot.get("slot_kind", "breathing"))
	var building_id := str(slot.get("building_id", ""))
	if has_texture or slot_kind == "continuous_city_wall_ring" or slot_kind == "breathing":
		return _build_button_stylebox(Color(0, 0, 0, 0), Color(0, 0, 0, 0), 0, 0, 0, 0, 0, 0)
	var bg_color := Color(0.05, 0.04, 0.03, 0.20)
	var border_color := Color(0.26, 0.19, 0.11, 0.36)
	var border_width := 1
	if _is_city_grid_edge_cell(x, y, columns, rows):
		bg_color = Color(0.08, 0.06, 0.035, 0.32)
		border_color = Color(0.40, 0.28, 0.14, 0.45)
	match slot_kind:
		"active_building":
			bg_color = Color(0.28, 0.19, 0.08, 0.48)
			border_color = Color(0.72, 0.52, 0.24, 0.62)
		"corner_tower":
			bg_color = Color(0.19, 0.12, 0.055, 0.54)
			border_color = Color(0.74, 0.50, 0.22, 0.70)
		"city_gate":
			bg_color = Color(0.24, 0.15, 0.06, 0.56)
			border_color = Color(0.84, 0.57, 0.24, 0.76)
		"reserved_plot":
			bg_color = Color(0.05, 0.08, 0.065, 0.32)
			border_color = Color(0.28, 0.40, 0.34, 0.50)
		"breathing":
			bg_color = Color(0.0, 0.0, 0.0, 0.08)
			border_color = Color(0.20, 0.15, 0.09, 0.22)
	if building_id == "city_hall":
		bg_color = Color(0.38, 0.23, 0.08, 0.66)
		border_color = Color(0.95, 0.69, 0.30, 0.86)
		border_width = 2
	return _build_button_stylebox(bg_color, border_color, 1, border_width, 0, 0, 0, 0)

func _resolve_city_grid_debug_token(slot: Dictionary, asset_slot: Dictionary) -> String:
	var placeholder_token := str(asset_slot.get("placeholder_token", "")).strip_edges()
	if placeholder_token != "":
		return placeholder_token.substr(0, 1)
	var slot_kind := str(slot.get("slot_kind", ""))
	var building_id := str(slot.get("building_id", ""))
	if building_id == "city_hall":
		return "府"
	match slot_kind:
		"active_building":
			return _first_non_empty_city_grid_label_char(slot, "筑")
		"corner_tower":
			return "角"
		"city_gate":
			return "门"
		"reserved_plot":
			return "预"
		"continuous_city_wall_ring":
			return "墙"
		_:
			return ""

func _first_non_empty_city_grid_label_char(slot: Dictionary, fallback: String) -> String:
	var label := str(slot.get("debug_label", slot.get("display_name_zh", ""))).strip_edges()
	if label == "":
		return fallback
	return label.substr(0, 1)

func _build_city_grid_debug_tooltip(slot: Dictionary, asset_slot: Dictionary, x: int, y: int) -> String:
	if slot.is_empty():
		return "主城占位 [%d,%d]" % [x, y]
	var label := str(slot.get("debug_label", slot.get("display_name_zh", "主城占位"))).strip_edges()
	var slot_kind := str(slot.get("slot_kind", "unknown"))
	var asset_id := str(slot.get("asset_id", "unbound_asset"))
	var state := str(slot.get("state", "debug"))
	var asset_slot_id := str(asset_slot.get("asset_id", asset_id)).strip_edges()
	var texture_path := str(asset_slot.get("texture_path", "")).strip_edges()
	return "%s [%d,%d]\nkind=%s\nasset=%s\nslot=%s\ntexture_path=%s\nstate=%s" % [label, x, y, slot_kind, asset_id, asset_slot_id, texture_path, state]

func _is_city_grid_edge_cell(x: int, y: int, columns: int, rows: int) -> bool:
	return x == 0 or y == 0 or x == columns - 1 or y == rows - 1

func _city_grid_key_from_xy(x: int, y: int) -> String:
	return "%d,%d" % [x, y]

func _city_grid_key_from_variant(grid_variant: Variant) -> String:
	if grid_variant is Vector2i:
		var grid := grid_variant as Vector2i
		return _city_grid_key_from_xy(grid.x, grid.y)
	if grid_variant is Vector2:
		var grid_float := grid_variant as Vector2
		return _city_grid_key_from_xy(int(grid_float.x), int(grid_float.y))
	if grid_variant is Array:
		var grid_array := grid_variant as Array
		if grid_array.size() >= 2:
			return _city_grid_key_from_xy(int(grid_array[0]), int(grid_array[1]))
	return ""

func _city_grid_vector2i_from_variant(grid_variant: Variant) -> Vector2i:
	if grid_variant is Vector2i:
		return grid_variant as Vector2i
	if grid_variant is Vector2:
		var grid_float := grid_variant as Vector2
		return Vector2i(int(grid_float.x), int(grid_float.y))
	if grid_variant is Array:
		var grid_array := grid_variant as Array
		if grid_array.size() >= 2:
			return Vector2i(int(grid_array[0]), int(grid_array[1]))
	if grid_variant is Dictionary:
		var grid_dict := grid_variant as Dictionary
		return Vector2i(int(grid_dict.get("x", 0)), int(grid_dict.get("y", 0)))
	return Vector2i.ZERO

func _resolve_city_grid_default_layer_grid(profile: Dictionary) -> Vector2i:
	var visual_grid := profile.get("visual_grid", {}) as Dictionary
	var columns: int = maxi(1, int(visual_grid.get("columns", 5)))
	var rows: int = maxi(1, int(visual_grid.get("rows", 5)))
	return Vector2i(int(columns / 2), int(rows / 2))

func _refresh_backdrop_chrome() -> void:
	if _backdrop == null:
		return
	var profile := _resolve_backdrop_chrome_profile()
	_backdrop.color = profile.get("bg_color", _backdrop.color)

func _refresh_bottom_nav_chrome() -> void:
	if _bottom_nav_panel == null:
		return
	_bottom_nav_panel.add_theme_stylebox_override("panel", _build_stylebox_from_chrome_profile(_resolve_bottom_nav_chrome_profile()))

func _refresh_right_context_chrome() -> void:
	if _right_context_panel == null:
		return
	_right_context_panel.add_theme_stylebox_override("panel", _build_stylebox_from_chrome_profile(_resolve_right_context_chrome_profile()))
	var slot_profile := _resolve_right_context_slot_chrome_profile()
	for slot_panel_variant in _context_slot_panels:
		var slot_panel := slot_panel_variant as PanelContainer
		if slot_panel == null:
			continue
		slot_panel.add_theme_stylebox_override("panel", _build_stylebox_from_chrome_profile(slot_profile))

func _refresh_chrome_profile() -> void:
	_apply_typography_profile()
	_apply_shell_layout_geometry_profile()
	_refresh_city_grid_debug_preview()
	_apply_left_rail_density_style()
	_apply_utility_row_style()
	_refresh_backdrop_chrome()
	_refresh_bottom_nav_chrome()
	_refresh_right_context_chrome()
	_refresh_center_stage_chrome()
	_refresh_city_action_button_states()
	_refresh_interior_summary_buttons()
	_refresh_under_construction_buttons()
	_refresh_right_context_visibility()
	set_troop_slots(_last_troop_slot_payloads)

func _normalize_chrome_profile_id(profile_id: String) -> String:
	return _get_chrome_profile_catalog().normalize_profile_id(profile_id)

func _get_chrome_profile_catalog():
	if chrome_profile_catalog != null and chrome_profile_catalog.has_method("normalize_profile_id"):
		return chrome_profile_catalog
	if _fallback_chrome_profile_catalog == null:
		_fallback_chrome_profile_catalog = NativeShellChromeProfileCatalogScript.new()
	return _fallback_chrome_profile_catalog

func _resolve_city_action_chrome_profile(is_selected: bool, surface_role: String) -> Dictionary:
	return _get_chrome_profile_catalog().resolve_city_action_profile(_chrome_profile_id, surface_role, is_selected)

func _resolve_left_rail_quick_link_chrome_profile() -> Dictionary:
	return _get_chrome_profile_catalog().resolve_left_rail_quick_link_profile(_chrome_profile_id)

func _resolve_left_rail_density_profile() -> Dictionary:
	return _get_chrome_profile_catalog().resolve_left_rail_density_profile(_chrome_profile_id)

func _resolve_default_button_fallback_profile() -> Dictionary:
	return _get_chrome_profile_catalog().resolve_default_button_fallback_profile(_chrome_profile_id)

func _resolve_shell_layout_profile() -> Dictionary:
	return _get_chrome_profile_catalog().resolve_shell_layout_profile(_chrome_profile_id)

func _resolve_city_grid_profile() -> Dictionary:
	return _get_chrome_profile_catalog().resolve_city_grid_profile(_chrome_profile_id)

func _resolve_typography_profile() -> Dictionary:
	return _get_chrome_profile_catalog().resolve_typography_profile(_chrome_profile_id)

func _resolve_copy_profile() -> Dictionary:
	return _get_chrome_profile_catalog().resolve_copy_profile(_chrome_profile_id)

func _resolve_backdrop_chrome_profile() -> Dictionary:
	return _get_chrome_profile_catalog().resolve_backdrop_profile(_chrome_profile_id)

func _resolve_bottom_nav_chrome_profile() -> Dictionary:
	return _get_chrome_profile_catalog().resolve_bottom_nav_profile(_chrome_profile_id)

func _resolve_task_icon_profile() -> Dictionary:
	return _get_chrome_profile_catalog().resolve_task_icon_profile(_chrome_profile_id)

func _resolve_button_icon_profile(slot_id: String) -> Dictionary:
	return _get_chrome_profile_catalog().resolve_button_icon_profile(_chrome_profile_id, slot_id)

func _resolve_troop_slot_chrome_profile(slot_index: int, is_disabled: bool, is_moving: bool) -> Dictionary:
	return _get_chrome_profile_catalog().resolve_troop_slot_profile(
		_chrome_profile_id,
		_resolve_troop_slot_archetype(slot_index),
		is_disabled,
		is_moving
	)

func _resolve_troop_slot_shell_profile() -> Dictionary:
	return _get_chrome_profile_catalog().resolve_troop_slot_shell_profile(_chrome_profile_id)

func _resolve_main_nav_button_shell_profile(is_selected: bool = false) -> Dictionary:
	return _get_chrome_profile_catalog().resolve_main_nav_button_shell_profile(_chrome_profile_id, is_selected)

func _resolve_main_nav_button_pressed_shell_profile(is_selected: bool = false) -> Dictionary:
	return _get_chrome_profile_catalog().resolve_main_nav_button_pressed_shell_profile(_chrome_profile_id, is_selected)

func _resolve_utility_button_chrome_profile() -> Dictionary:
	return _get_chrome_profile_catalog().resolve_utility_button_profile(_chrome_profile_id)

func _resolve_under_construction_chrome_profile(is_disabled: bool) -> Dictionary:
	return _get_chrome_profile_catalog().resolve_under_construction_profile(_chrome_profile_id, is_disabled)

func _resolve_center_stage_chrome_profile() -> Dictionary:
	return _get_chrome_profile_catalog().resolve_center_stage_profile(
		_chrome_profile_id,
		_current_mode == WORLD_MODE,
		_current_city_action != DEFAULT_CITY_ACTION
	)

func _resolve_right_context_chrome_profile() -> Dictionary:
	return _get_chrome_profile_catalog().resolve_right_context_profile(_chrome_profile_id)

func _resolve_right_context_slot_chrome_profile() -> Dictionary:
	return _get_chrome_profile_catalog().resolve_right_context_slot_profile(_chrome_profile_id)

func _apply_typography_profile() -> void:
	var typography_profile := _resolve_typography_profile()
	if typography_profile.is_empty():
		return
	_apply_label_font_size(_profile_badge, typography_profile, "profile_badge_font_size")
	_apply_label_font_size(_resource_strip, typography_profile, "resource_strip_font_size")
	_apply_button_font_size(_jade_currency_badge, typography_profile, "currency_badge_font_size")
	_apply_button_font_size(_copper_currency_badge, typography_profile, "currency_badge_font_size")
	_apply_label_font_size(_context_title, typography_profile, "right_context_title_font_size")
	_apply_label_font_size(_context_body, typography_profile, "right_context_body_font_size")
	for slot_label_variant in _context_slot_labels:
		_apply_label_font_size(slot_label_variant as Label, typography_profile, "right_context_slot_font_size")
	_apply_label_font_size(_mode_badge, typography_profile, "center_mode_badge_font_size")
	_apply_label_font_size(_stage_title, typography_profile, "center_stage_title_font_size")
	_apply_label_font_size(_stage_body, typography_profile, "center_stage_body_font_size")
	_apply_label_font_size(_city_focus, typography_profile, "center_city_focus_font_size")
	_apply_button_font_size(_interior_entry_button, typography_profile, "center_entry_button_font_size")
	_apply_button_font_size(_recruit_entry_button, typography_profile, "center_entry_button_font_size")
	_apply_button_font_size(_generals_entry_button, typography_profile, "center_entry_button_font_size")
	_apply_button_font_size(_alliance_entry_button, typography_profile, "center_entry_button_font_size")
	_apply_button_font_size(_ai_hub_entry_button, typography_profile, "center_entry_button_font_size")
	_apply_label_font_size(_entry_status, typography_profile, "center_entry_status_font_size")
	_apply_label_font_size(_mode_hint, typography_profile, "center_mode_hint_font_size")
	for button in [_mail_button, _activity_button, _help_button]:
		_apply_button_font_size(button as Button, typography_profile, "utility_button_font_size")
	for button in [_generals_button, _interior_button, _alliance_button, _ai_hub_button, _chat_button, _recruit_button, _bag_button, _settings_button]:
		_apply_button_font_size(button as Button, typography_profile, "main_nav_button_font_size")
	_apply_label_font_size(_world_entry_hint, typography_profile, "world_entry_hint_font_size")

func _apply_shell_layout_geometry_profile() -> void:
	var layout_profile := _resolve_shell_layout_profile()
	if layout_profile.is_empty():
		return
	_apply_control_offsets(_top_strip, layout_profile, "top_strip")
	_apply_control_offsets(_left_rail_panel, layout_profile, "left_rail")
	_apply_control_offsets(_right_context_panel, layout_profile, "right_context")
	_apply_control_offsets(_center_stage, layout_profile, "center_stage")
	_apply_control_offsets(_bottom_nav_panel, layout_profile, "bottom_nav")
	_apply_margin_offsets(_top_margin_container, layout_profile, "top")
	_apply_box_separation(_top_row, layout_profile, "top_row_separation")
	_apply_box_separation(_top_actions_row, layout_profile, "top_actions_separation")
	_apply_box_separation(_premium_currency_row, layout_profile, "premium_currency_row_separation")
	_apply_margin_offsets(_right_margin_container, layout_profile, "right")
	_apply_box_separation(_right_column, layout_profile, "right_column_separation")
	_apply_box_separation(_context_slot_list, layout_profile, "right_context_slot_list_separation")
	_apply_margin_offsets(_stage_margin_container, layout_profile, "stage")
	_apply_box_separation(_stage_column, layout_profile, "stage_column_separation")
	_apply_grid_separation(_city_entry_grid, layout_profile)
	_apply_grid_separation(_city_grid_debug_preview, layout_profile)
	_apply_margin_offsets(_bottom_margin_container, layout_profile, "bottom")
	_apply_box_separation(_bottom_row, layout_profile, "bottom_row_separation")
	_apply_box_separation(_main_nav_column, layout_profile, "main_nav_separation")
	_apply_box_separation(_utility_row, layout_profile, "utility_row_separation")
	_apply_box_separation(_nav_buttons, layout_profile, "nav_buttons_separation")
	if _premium_currency_row != null:
		_premium_currency_row.custom_minimum_size = layout_profile.get("premium_currency_row_min_size", _premium_currency_row.custom_minimum_size)
	if _jade_currency_badge != null:
		_jade_currency_badge.custom_minimum_size = layout_profile.get("jade_currency_badge_min_size", _jade_currency_badge.custom_minimum_size)
	if _copper_currency_badge != null:
		_copper_currency_badge.custom_minimum_size = layout_profile.get("copper_currency_badge_min_size", _copper_currency_badge.custom_minimum_size)
	if _mode_toggle_button != null:
		_mode_toggle_button.custom_minimum_size = layout_profile.get("mode_toggle_button_min_size", _mode_toggle_button.custom_minimum_size)
	for button in [_interior_entry_button, _recruit_entry_button, _generals_entry_button, _alliance_entry_button, _ai_hub_entry_button]:
		var entry_button := button as Button
		if entry_button == null:
			continue
		entry_button.custom_minimum_size = layout_profile.get("city_entry_button_min_size", entry_button.custom_minimum_size)
	var utility_button_size_map := {
		_mail_button: "utility_mail_button_min_size",
		_activity_button: "utility_activity_button_min_size",
		_help_button: "utility_help_button_min_size",
	}
	for button_variant in utility_button_size_map.keys():
		var utility_button := button_variant as Button
		if utility_button == null:
			continue
		var layout_key := str(utility_button_size_map[button_variant])
		utility_button.custom_minimum_size = layout_profile.get(layout_key, utility_button.custom_minimum_size)
	for button in [_generals_button, _interior_button, _alliance_button, _ai_hub_button, _chat_button, _recruit_button, _bag_button, _settings_button]:
		var main_nav_button := button as Button
		if main_nav_button == null:
			continue
		main_nav_button.custom_minimum_size = layout_profile.get("main_nav_button_min_size", main_nav_button.custom_minimum_size)
	for button in [_war_button, _bag_button, _settings_button]:
		var under_construction_button := button as Button
		if under_construction_button == null:
			continue
		under_construction_button.custom_minimum_size = layout_profile.get("under_construction_button_min_size", under_construction_button.custom_minimum_size)
	if _context_body != null:
		_context_body.custom_minimum_size = Vector2(0, int(layout_profile.get("context_body_min_height", _context_body.custom_minimum_size.y)))
	for slot_panel_variant in _context_slot_panels:
		var slot_panel := slot_panel_variant as PanelContainer
		if slot_panel == null:
			continue
		slot_panel.custom_minimum_size = Vector2(0, int(layout_profile.get("context_slot_min_height", slot_panel.custom_minimum_size.y)))
	_apply_responsive_shell_layout_overrides(layout_profile)
	_refresh_troop_slot_scroll_container(layout_profile)

func _apply_responsive_shell_layout_overrides(layout_profile: Dictionary) -> void:
	var viewport_size := get_viewport_rect().size
	if viewport_size.x <= 0.0:
		return
	if _uses_mobile_shell_layout(viewport_size):
		_apply_mobile_shell_layout(viewport_size)
		return
	_apply_desktop_shell_density(layout_profile)

func _uses_mobile_shell_layout(viewport_size: Vector2) -> bool:
	if viewport_size.x < MOBILE_SHELL_BREAKPOINT:
		return true
	return viewport_size.x <= MOBILE_LANDSCAPE_SHELL_MAX_WIDTH and viewport_size.y <= MOBILE_LANDSCAPE_SHELL_MAX_HEIGHT

func _apply_desktop_shell_density(layout_profile: Dictionary) -> void:
	if _bottom_nav_panel != null:
		_bottom_nav_panel.offset_right = maxf(
			float(layout_profile.get("bottom_nav_offset_right", _bottom_nav_panel.offset_right)),
			DESKTOP_BOTTOM_NAV_RIGHT
		)
		_bottom_nav_panel.offset_top = minf(
			float(layout_profile.get("bottom_nav_offset_top", _bottom_nav_panel.offset_top)),
			DESKTOP_BOTTOM_NAV_TOP
		)
	if _nav_buttons != null:
		_nav_buttons.add_theme_constant_override("separation", max(5, int(layout_profile.get("nav_buttons_separation", 4))))
	for button in _active_main_nav_buttons():
		button.custom_minimum_size = DESKTOP_MAIN_NAV_BUTTON_SIZE

func _apply_mobile_shell_layout(viewport_size: Vector2) -> void:
	var side_margin := MOBILE_SHELL_SIDE_MARGIN
	if viewport_size.x < 380.0:
		side_margin = 6.0
	if _bottom_nav_panel != null:
		_bottom_nav_panel.offset_left = side_margin
		_bottom_nav_panel.offset_right = maxf(side_margin, viewport_size.x - side_margin)
		_bottom_nav_panel.offset_top = -MOBILE_BOTTOM_NAV_HEIGHT
		_bottom_nav_panel.offset_bottom = -side_margin
	if _bottom_margin_container != null:
		_bottom_margin_container.add_theme_constant_override("margin_left", 6)
		_bottom_margin_container.add_theme_constant_override("margin_top", 8)
		_bottom_margin_container.add_theme_constant_override("margin_right", 6)
		_bottom_margin_container.add_theme_constant_override("margin_bottom", 8)
	if _nav_buttons != null:
		_nav_buttons.add_theme_constant_override("separation", 3)
	var button_width := _resolve_mobile_main_nav_button_width()
	for button in _active_main_nav_buttons():
		button.custom_minimum_size = Vector2(button_width, MOBILE_MAIN_NAV_BUTTON_HEIGHT)
	if _world_entry_hint != null:
		_world_entry_hint.visible = viewport_size.y >= 700.0
	if _right_context_panel != null:
		var right_margin := side_margin
		var right_context_width := minf(348.0, maxf(300.0, viewport_size.x - side_margin * 2.0))
		_right_context_panel.offset_left = -right_context_width - right_margin
		_right_context_panel.offset_right = -right_margin
		_right_context_panel.offset_top = 82.0
		_right_context_panel.offset_bottom = minf(viewport_size.y - 178.0, 566.0)
	if _center_stage != null:
		var stage_half_width := minf(220.0, maxf(148.0, viewport_size.x * 0.46))
		_center_stage.offset_left = -stage_half_width
		_center_stage.offset_right = stage_half_width
	if _city_entry_grid != null:
		_city_entry_grid.columns = 3

func _resolve_mobile_main_nav_button_width() -> float:
	var visible_count := maxi(1, _active_main_nav_buttons().size())
	var available_width := 360.0
	if _bottom_nav_panel != null:
		available_width = maxf(1.0, _bottom_nav_panel.offset_right - _bottom_nav_panel.offset_left)
	var inner_margin := 12.0
	if _bottom_margin_container != null:
		inner_margin = float(_bottom_margin_container.get_theme_constant("margin_left") + _bottom_margin_container.get_theme_constant("margin_right"))
	var separation := 3.0
	if _nav_buttons != null:
		separation = float(_nav_buttons.get_theme_constant("separation"))
	var usable_width := maxf(1.0, available_width - inner_margin - separation * float(maxi(0, visible_count - 1)))
	return clampf(floor(usable_width / float(visible_count)), MOBILE_MAIN_NAV_BUTTON_MIN_WIDTH, MOBILE_MAIN_NAV_BUTTON_MAX_WIDTH)

func _active_main_nav_buttons() -> Array[Button]:
	var buttons: Array[Button] = []
	for button_variant in [_generals_button, _interior_button, _alliance_button, _ai_hub_button, _chat_button, _recruit_button, _bag_button, _settings_button]:
		var button := button_variant as Button
		if button != null and button.visible:
			buttons.append(button)
	return buttons

func _apply_control_offsets(control: Control, layout_profile: Dictionary, prefix: String) -> void:
	if control == null:
		return
	control.offset_left = float(layout_profile.get("%s_offset_left" % prefix, control.offset_left))
	control.offset_top = float(layout_profile.get("%s_offset_top" % prefix, control.offset_top))
	control.offset_right = float(layout_profile.get("%s_offset_right" % prefix, control.offset_right))
	control.offset_bottom = float(layout_profile.get("%s_offset_bottom" % prefix, control.offset_bottom))

func _apply_margin_offsets(container: MarginContainer, layout_profile: Dictionary, prefix: String) -> void:
	if container == null:
		return
	container.add_theme_constant_override("margin_left", int(layout_profile.get("%s_margin_left" % prefix, container.get_theme_constant("margin_left"))))
	container.add_theme_constant_override("margin_top", int(layout_profile.get("%s_margin_top" % prefix, container.get_theme_constant("margin_top"))))
	container.add_theme_constant_override("margin_right", int(layout_profile.get("%s_margin_right" % prefix, container.get_theme_constant("margin_right"))))
	container.add_theme_constant_override("margin_bottom", int(layout_profile.get("%s_margin_bottom" % prefix, container.get_theme_constant("margin_bottom"))))

func _apply_box_separation(container: Control, layout_profile: Dictionary, key: String) -> void:
	if container == null:
		return
	container.add_theme_constant_override("separation", int(layout_profile.get(key, container.get_theme_constant("separation"))))

func _apply_grid_separation(container: Control, layout_profile: Dictionary) -> void:
	if container == null:
		return
	if not (container is GridContainer):
		return
	var grid_container := container as GridContainer
	grid_container.add_theme_constant_override("h_separation", int(layout_profile.get("city_entry_grid_h_separation", grid_container.get_theme_constant("h_separation"))))
	grid_container.add_theme_constant_override("v_separation", int(layout_profile.get("city_entry_grid_v_separation", grid_container.get_theme_constant("v_separation"))))

func _apply_label_font_size(label: Label, typography_profile: Dictionary, key: String) -> void:
	if label == null:
		return
	if not typography_profile.has(key):
		return
	label.add_theme_font_size_override("font_size", int(typography_profile.get(key, label.get_theme_font_size("font_size"))))

func _apply_button_font_size(button: Button, typography_profile: Dictionary, key: String) -> void:
	if button == null:
		return
	if not typography_profile.has(key):
		return
	button.add_theme_font_size_override("font_size", int(typography_profile.get(key, button.get_theme_font_size("font_size"))))

func _apply_button_chrome_profile(button: Button, profile: Dictionary, allow_size_override: bool = false) -> void:
	if button == null:
		return
	var fallback_profile := _resolve_default_button_fallback_profile()
	var fallback_font_color: Color = fallback_profile.get("font_color", button.get_theme_color("font_color"))
	var fallback_hover_font_color: Color = fallback_profile.get("font_hover_color", fallback_font_color)
	var fallback_pressed_font_color: Color = fallback_profile.get("font_pressed_color", fallback_font_color)
	var fallback_disabled_font_color: Color = fallback_profile.get("font_disabled_color", button.get_theme_color("font_disabled_color"))
	if allow_size_override and profile.has("min_size"):
		button.custom_minimum_size = profile.get("min_size", button.custom_minimum_size)
	if allow_size_override and profile.has("font_size"):
		var density_profile: Dictionary = _resolve_left_rail_density_profile()
		button.add_theme_font_size_override("font_size", int(profile.get("font_size", density_profile.get("primary_token_font_size", 8))))
	var normal_style := _build_stylebox_from_chrome_profile(profile)
	var hover_style: StyleBoxFlat = normal_style.duplicate()
	if profile.has("hover_bg_color"):
		hover_style.bg_color = profile.get("hover_bg_color", hover_style.bg_color)
	else:
		hover_style.bg_color = hover_style.bg_color.lightened(float(profile.get("hover_lighten", 0.05)))
	var pressed_style: StyleBoxFlat = normal_style.duplicate()
	if profile.has("pressed_bg_color"):
		pressed_style.bg_color = profile.get("pressed_bg_color", pressed_style.bg_color)
	else:
		pressed_style.bg_color = pressed_style.bg_color.darkened(float(profile.get("pressed_darken", 0.05)))
	button.add_theme_stylebox_override("normal", normal_style)
	button.add_theme_stylebox_override("hover", hover_style)
	button.add_theme_stylebox_override("pressed", pressed_style)
	button.add_theme_stylebox_override("focus", pressed_style)
	button.add_theme_stylebox_override("disabled", normal_style)
	button.add_theme_color_override("font_color", profile.get("font_color", fallback_font_color))
	button.add_theme_color_override("font_hover_color", profile.get("font_hover_color", fallback_hover_font_color))
	button.add_theme_color_override("font_pressed_color", profile.get("font_pressed_color", fallback_pressed_font_color))
	button.add_theme_color_override("font_disabled_color", profile.get("font_disabled_color", fallback_disabled_font_color))
	button.alignment = int(profile.get("alignment", fallback_profile.get("alignment", button.alignment)))
	if profile.has("modulate"):
		button.modulate = profile.get("modulate", Color(1.0, 1.0, 1.0, 1.0))
	if profile.has("flat"):
		button.flat = bool(profile.get("flat", button.flat))

func _apply_button_visual_profile(button: Button, profile: Dictionary) -> void:
	if button == null:
		return
	var fallback_profile := _resolve_default_button_fallback_profile()
	var fallback_font_color: Color = fallback_profile.get("font_color", button.get_theme_color("font_color"))
	var fallback_hover_font_color: Color = fallback_profile.get("font_hover_color", fallback_font_color)
	var fallback_pressed_font_color: Color = fallback_profile.get("font_pressed_color", fallback_font_color)
	var fallback_disabled_font_color: Color = fallback_profile.get("font_disabled_color", button.get_theme_color("font_disabled_color"))
	var font_color: Color = profile.get("font_color", fallback_font_color)
	button.add_theme_color_override("font_color", font_color)
	button.add_theme_color_override("font_hover_color", profile.get("font_hover_color", fallback_hover_font_color))
	button.add_theme_color_override("font_pressed_color", profile.get("font_pressed_color", fallback_pressed_font_color))
	button.add_theme_color_override("font_disabled_color", profile.get("font_disabled_color", fallback_disabled_font_color))
	button.modulate = profile.get("modulate", Color(1.0, 1.0, 1.0, 1.0))
	if profile.has("flat"):
		button.flat = bool(profile.get("flat", button.flat))

func _build_stylebox_from_chrome_profile(profile: Dictionary) -> StyleBoxFlat:
	return _build_button_stylebox(
		profile.get("bg_color", Color(0.0, 0.0, 0.0, 0.0)),
		profile.get("border_color", Color(0.0, 0.0, 0.0, 0.0)),
		int(profile.get("radius", 0)),
		int(profile.get("border_width", 0)),
		int(profile.get("margin_left", 0)),
		int(profile.get("margin_right", 0)),
		int(profile.get("margin_top", 0)),
		int(profile.get("margin_bottom", 0))
	)

func _build_button_stylebox(
	bg_color: Color,
	border_color: Color,
	radius: int,
	border_width: int,
	margin_left: int,
	margin_right: int,
	margin_top: int,
	margin_bottom: int
) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = bg_color
	style.border_color = border_color
	style.set_border_width_all(border_width)
	style.corner_radius_top_left = radius
	style.corner_radius_top_right = radius
	style.corner_radius_bottom_right = radius
	style.corner_radius_bottom_left = radius
	style.content_margin_left = margin_left
	style.content_margin_right = margin_right
	style.content_margin_top = margin_top
	style.content_margin_bottom = margin_bottom
	return style

func _refresh_under_construction_buttons() -> void:
	_apply_under_construction_button_state(_war_button, "world")
	_apply_under_construction_button_state(_bag_button, "bag")
	_apply_under_construction_button_state(_settings_button, "settings")
	if is_inside_tree():
		_apply_responsive_shell_layout_overrides(_resolve_shell_layout_profile())

func _apply_under_construction_button_state(button: Button, action_id: String) -> void:
	if button == null:
		return
	var button_copy := _resolve_under_construction_button_copy(action_id)
	if button_copy.is_empty():
		return
	var label := str(button_copy.get("stateLabel", button.text)).strip_edges()
	var description := str(button_copy.get("description", "该入口仍在开发中。")).strip_edges()
	var is_disabled := bool(button_copy.get("disabled", true))
	if action_id == "bag" or action_id == "settings":
		label = str(button_copy.get("label", label)).strip_edges()
	button.text = label
	button.visible = false
	button.tooltip_text = description if button.visible else _format_copy_template("under_construction_tooltip_template", {"description": description}, "开发中：{description}")
	button.disabled = is_disabled
	_apply_button_visual_profile(button, _resolve_under_construction_chrome_profile(is_disabled))

func _apply_shell_icons() -> void:
	_apply_texture_icon_profile(_task_icon, _resolve_task_icon_profile())
	_apply_button_icon_profile(_mail_button, _resolve_button_icon_profile("mail"))
	_apply_button_icon_profile(_activity_button, _resolve_button_icon_profile("activity"))
	_apply_button_icon_profile(_help_button, _resolve_button_icon_profile("help"))
	_apply_button_icon_profile(_jade_currency_badge, _resolve_button_icon_profile("jade"))
	_apply_button_icon_profile(_copper_currency_badge, _resolve_button_icon_profile("copper"))

func _apply_texture_icon_profile(texture_rect: TextureRect, profile: Dictionary) -> void:
	if texture_rect == null:
		return
	texture_rect.texture = profile.get("icon_texture", null)
	texture_rect.tooltip_text = str(profile.get("tooltip_text", "")).strip_edges()

func _apply_button_icon_profile(button: Button, profile: Dictionary) -> void:
	if button == null:
		return
	button.icon = profile.get("icon_texture", null)
	button.expand_icon = bool(profile.get("expand_icon", true))
	button.icon_alignment = int(profile.get("icon_alignment", HORIZONTAL_ALIGNMENT_LEFT))
	if profile.has("h_separation"):
		button.add_theme_constant_override("h_separation", int(profile.get("h_separation", 4)))
	var tooltip_text := str(profile.get("tooltip_text", "")).strip_edges()
	if tooltip_text != "":
		button.tooltip_text = tooltip_text


func _apply_static_action_button_copy() -> void:
	_apply_city_action_button_copy(_interior_button, "interior")
	_apply_city_action_button_copy(_recruit_button, "recruit")
	_apply_city_action_button_copy(_generals_button, "generals")
	_apply_city_action_button_copy(_alliance_button, "alliance")
	_apply_city_action_button_copy(_ai_hub_button, "ai_hub")
	_apply_city_action_button_copy(_chat_button, "chat")
	_apply_city_action_button_copy(_interior_entry_button, "interior")
	_apply_city_action_button_copy(_recruit_entry_button, "recruit")
	_apply_city_action_button_copy(_generals_entry_button, "generals")
	_apply_city_action_button_copy(_alliance_entry_button, "alliance")
	_apply_city_action_button_copy(_ai_hub_entry_button, "ai_hub")
	_apply_utility_action_button_copy(_mail_button, "mail")
	_apply_utility_action_button_copy(_activity_button, "activity")
	_apply_utility_action_button_copy(_help_button, "help")


func _apply_city_action_button_copy(button: Button, action_id: String) -> void:
	if button == null:
		return
	var action_copy := _resolve_city_action_copy(action_id)
	if action_copy.is_empty():
		return
	var label: String = str(action_copy.get("label", action_id)).strip_edges()
	var description: String = str(action_copy.get("description", "")).strip_edges()
	button.text = label
	if description != "":
		button.tooltip_text = description


func _apply_utility_action_button_copy(button: Button, action_id: String) -> void:
	if button == null:
		return
	var button_copy := _resolve_utility_action_copy(action_id)
	if button_copy.is_empty():
		return
	var label: String = str(button_copy.get("label", action_id)).strip_edges()
	var description: String = str(button_copy.get("description", "")).strip_edges()
	button.text = label
	if description != "":
		button.tooltip_text = description

func _parse_premium_currency_summary(summary: String) -> Dictionary:
	var normalized_summary := summary.strip_edges()
	if normalized_summary == "":
		normalized_summary = _format_copy_template(
			"currency_tooltip_template",
			{
				"jade_label": _resolve_shell_copy_value("currency_jade_label", "玉符"),
				"jade": "0",
				"copper_label": _resolve_shell_copy_value("currency_copper_label", "铜钱"),
				"copper": "0",
			},
			"{jade_label} {jade} | {copper_label} {copper}"
		)
	var parsed := {
		"jade": "0",
		"copper": "0",
	}
	var jade_label := _resolve_shell_copy_value("currency_jade_label", "玉符")
	var copper_label := _resolve_shell_copy_value("currency_copper_label", "铜钱")
	for segment_variant in normalized_summary.split("|"):
		var segment := str(segment_variant).strip_edges()
		if segment == "":
			continue
		if segment.begins_with(jade_label):
			parsed["jade"] = _strip_currency_prefix(segment, jade_label)
		elif segment.begins_with(copper_label):
			parsed["copper"] = _strip_currency_prefix(segment, copper_label)
	return parsed

func _resolve_city_action_copy(action_id: String) -> Dictionary:
	return _resolve_copy_entry("city_action_copy", action_id)

func _resolve_utility_action_copy(action_id: String) -> Dictionary:
	return _resolve_copy_entry("utility_action_copy", action_id)

func _resolve_under_construction_button_copy(action_id: String) -> Dictionary:
	return _resolve_copy_entry("under_construction_copy", action_id)

func _resolve_copy_entry(map_key: String, entry_id: String) -> Dictionary:
	var copy_profile := _resolve_copy_profile()
	var copy_map_variant: Variant = copy_profile.get(map_key, {})
	if copy_map_variant is Dictionary:
		var copy_map := copy_map_variant as Dictionary
		if copy_map.has(entry_id):
			var entry_variant: Variant = copy_map.get(entry_id, {})
			if entry_variant is Dictionary:
				return (entry_variant as Dictionary).duplicate(true)
	return {}

func _resolve_default_context_slots() -> Array:
	var copy_profile := _resolve_copy_profile()
	var default_slots_variant: Variant = copy_profile.get("default_context_slots", [])
	if default_slots_variant is Array:
		return (default_slots_variant as Array).duplicate(true)
	return []

func _resolve_shell_copy_value(key: String, fallback: String) -> String:
	var copy_profile := _resolve_copy_profile()
	var resolved := str(copy_profile.get(key, fallback)).strip_edges()
	return resolved if resolved != "" else fallback

func _format_copy_template(template_key: String, replacements: Dictionary, fallback_template: String) -> String:
	var template := _resolve_shell_copy_value(template_key, fallback_template)
	for key_variant in replacements.keys():
		var token := "{%s}" % str(key_variant)
		template = template.replace(token, str(replacements[key_variant]))
	return template

func _refresh_right_context_visibility() -> void:
	if _right_context_panel == null:
		return
	if not RIGHT_CONTEXT_PANEL_ENABLED:
		_right_context_panel.visible = false
		return
	var has_summary := _context_body != null and _context_body.text.strip_edges() != ""
	var has_slot_content := false
	for slot_panel_variant in _context_slot_panels:
		var slot_panel := slot_panel_variant as PanelContainer
		if slot_panel != null and slot_panel.visible:
			has_slot_content = true
			break
	var is_context_mode := _current_mode == WORLD_MODE or _current_city_action != DEFAULT_CITY_ACTION
	_right_context_panel.visible = is_context_mode and (has_summary or has_slot_content)

func _strip_currency_prefix(segment: String, prefix: String) -> String:
	var value := segment.strip_edges()
	if value.begins_with(prefix):
		value = value.substr(prefix.length()).strip_edges()
	while value.begins_with(":") or value.begins_with("："):
		value = value.substr(1).strip_edges()
	return value if value != "" else "0"

func _resolve_interior_tab_label(tab_id: String) -> String:
	var interior_tab_label := _resolve_copy_map_string("interior_tab_labels", tab_id, "")
	if interior_tab_label != "":
		return interior_tab_label
	match tab_id:
		"market":
			return "市井"
		"tax":
			return "税收"
		"policy":
			return "政策"
		"affairs":
			return "政务"
		_:
			return tab_id

func _resolve_copy_map_string(map_key: String, entry_id: String, fallback: String) -> String:
	var copy_profile := _resolve_copy_profile()
	var copy_map_variant: Variant = copy_profile.get(map_key, {})
	if copy_map_variant is Dictionary:
		var copy_map := copy_map_variant as Dictionary
		if copy_map.has(entry_id):
			var resolved := str(copy_map.get(entry_id, fallback)).strip_edges()
			if resolved != "":
				return resolved
	return fallback

func _build_tooltip_text(parts: Array) -> String:
	var segments: Array[String] = []
	for part_variant in parts:
		var part := str(part_variant).strip_edges()
		if part != "":
			segments.append(part)
	return "\n".join(segments)

func _compact_multiline_text(text: String, max_lines: int, max_chars_per_line: int) -> String:
	var lines := text.split("\n")
	var compacted: Array[String] = []
	for raw_line_variant in lines:
		var raw_line := str(raw_line_variant).strip_edges()
		if raw_line == "":
			continue
		compacted.append(_truncate_text(raw_line, max_chars_per_line))
		if compacted.size() >= max_lines:
			break
	if compacted.is_empty():
		return ""
	return "\n".join(compacted)

func _compact_single_line_text(text: String, max_chars: int) -> String:
	var normalized := text.replace("\n", " | ").replace("\r", " ").strip_edges()
	return _truncate_text(normalized, max_chars)

func _truncate_text(text: String, max_chars: int) -> String:
	if max_chars <= 0:
		return text
	if text.length() <= max_chars:
		return text
	return "%s…" % text.substr(0, max_chars - 1)

func _compose_troop_slot_text(slot_label: String, label: String, role_tag: String, state_tag: String, slot_index: int, is_enabled: bool) -> String:
	var normalized_label := label.strip_edges()
	if normalized_label == "":
		normalized_label = slot_label
	var archetype := _resolve_troop_slot_archetype(slot_index)
	var headline := "%s%s" % [slot_label, role_tag]
	var detail_label := _truncate_text(normalized_label, 4)
	if not is_enabled:
		detail_label = _resolve_empty_slot_caption(archetype)
	elif archetype == TROOP_SLOT_ARCHETYPE_PRIMARY:
		detail_label = _truncate_text(normalized_label, 5)
	var detail := "%s·%s" % [state_tag, detail_label]
	return "%s\n%s" % [headline, detail]

func _resolve_troop_slot_archetype(slot_index: int) -> String:
	if slot_index <= 1:
		return TROOP_SLOT_ARCHETYPE_PRIMARY
	if slot_index <= 3:
		return TROOP_SLOT_ARCHETYPE_MOBILE
	return TROOP_SLOT_ARCHETYPE_RESERVE

func _resolve_empty_slot_caption(archetype: String) -> String:
	match archetype:
		TROOP_SLOT_ARCHETYPE_PRIMARY:
			return "主位"
		TROOP_SLOT_ARCHETYPE_MOBILE:
			return "机位"
		_:
			return "后位"

func _resolve_troop_slot_role_tag(slot_index: int, is_enabled: bool) -> String:
	var archetype := _resolve_troop_slot_archetype(slot_index)
	if not is_enabled:
		match archetype:
			TROOP_SLOT_ARCHETYPE_PRIMARY:
				return "主位"
			TROOP_SLOT_ARCHETYPE_MOBILE:
				return "机位"
			_:
				return "后位"
	match archetype:
		TROOP_SLOT_ARCHETYPE_PRIMARY:
			return "主力"
		TROOP_SLOT_ARCHETYPE_MOBILE:
			return "机动"
		_:
			return "后备"

func _resolve_troop_slot_state_tag(status_text: String, subtitle: String, is_enabled: bool) -> String:
	if not is_enabled:
		return "空位"
	var normalized := status_text.strip_edges()
	if normalized == "":
		normalized = subtitle.strip_edges()
	if normalized.begins_with("行军"):
		return "行军"
	if normalized.begins_with("驻守"):
		return "驻守"
	if normalized.begins_with("征兵"):
		return "征兵"
	if normalized.begins_with("待命"):
		return "待命"
	return _truncate_text(normalized if normalized != "" else "待命", 4)


func _reorder_left_rail_layout() -> void:
	if _left_column == null:
		return
	var desired_order := [
		$LeftRail/LeftMargin/LeftColumn/TaskHeaderRow,
		_task_body,
		_city_state_title,
		_city_state_summary,
		_city_tech_summary,
		_troop_section_title,
		_troop_summary,
		$LeftRail/LeftMargin/LeftColumn/TroopSlotScroll,
		$LeftRail/LeftMargin/LeftColumn/InteriorQuickLinks,
		_task_hint,
	]
	for index in range(desired_order.size()):
		var node: Node = desired_order[index]
		if node != null and node.get_parent() == _left_column:
			_left_column.move_child(node, index)
