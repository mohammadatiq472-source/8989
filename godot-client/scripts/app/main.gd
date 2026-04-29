extends Node

const BackendApiClientScript = preload("res://scripts/infra/http/backend_api_client.gd")
const ObservabilityBridgeScript = preload("res://scripts/infra/observability/observability_bridge.gd")
const OverlayRuntimeHelperScript = preload("res://scripts/app/overlay_runtime_helper.gd")
const SlgDomainActionAdapterScript = preload("res://scripts/app/adapters/slg_domain_action_adapter.gd")
const UiThemeTokensScript = preload("res://scripts/ui/ui_theme_tokens.gd")
const AlliancePresenterScript = preload("res://scripts/ui/presenters/alliance_presenter.gd")
const NativeShellPresenterScript = preload("res://scripts/ui/presenters/native_shell_presenter.gd")
const RuntimeContextPresenterScript = preload("res://scripts/ui/presenters/runtime_context_presenter.gd")
const TroopPanelPresenterScript = preload("res://scripts/ui/presenters/troop_panel_presenter.gd")
const InternalAffairsPresenterScript = preload("res://scripts/ui/presenters/internal_affairs_presenter.gd")
const RecruitPresenterScript = preload("res://scripts/ui/presenters/recruit_presenter.gd")
const GeneralPresenterScript = preload("res://scripts/ui/presenters/general_presenter.gd")
const AIPanelPresenterScript = preload("res://scripts/ui/presenters/ai_panel_presenter.gd")
const BattleReportPresenterScript = preload("res://scripts/ui/presenters/battle_report_presenter.gd")
const WorldEventActivityPresenterScript = preload("res://scripts/ui/presenters/world_event_activity_presenter.gd")
const ChildPageBlockFactoryScript = preload("res://scripts/ui/child_page_block_factory.gd")
const AlliancePanelScene: PackedScene = preload("res://scenes/ui/alliance_panel.tscn")
const InteriorPanelScene: PackedScene = preload("res://scenes/ui/interior_panel.tscn")
const TroopPanelScene: PackedScene = preload("res://scenes/ui/troop_panel.tscn")
const RecruitPanelScene: PackedScene = preload("res://scenes/ui/recruit_panel.tscn")
const GeneralPanelScene: PackedScene = preload("res://scenes/ui/general_panel.tscn")
const AIPanelScene: PackedScene = preload("res://scenes/ui/ai_panel.tscn")
const BattleReportPanelScene: PackedScene = preload("res://scenes/ui/battle_report_panel.tscn")
const WorldEventActivityPanelScene: PackedScene = preload("res://scenes/ui/world_event_activity_panel.tscn")
const ADVANCE_TICK_SOFT_TIMEOUT_SECONDS := 15.0
const ADVANCE_TICK_TIMEOUT_NOTICE := "请求已超时，可能仍在后台执行，请稍后 Refresh Snapshot"
const HUD_TOP_LEFT_PATH := NodePath("UiLayer/NativeShell/TopStrip")
const HUD_EXPORT_BUTTON_PATH := NodePath("HoverLayer/ExportPerfButton")
const MAP_GRID_PATH := NodePath("MapGrid")
const UNIT_VIEW_LAYER_PATH := NodePath("UnitViewLayer")
const UI_LAYER_PATH := NodePath("UiLayer")
const NATIVE_SHELL_PATH := NodePath("UiLayer/NativeShell")
const MAIN_CITY_HUB_OVERLAY_PATH := NodePath("UiLayer/MainCityHubOverlay")
const MAIN_CHAT_OVERLAY_PATH := NodePath("UiLayer/MainChatOverlay")
const FULL_SCREEN_PANEL_HOST_PATH := NodePath("UiLayer/FullScreenPanelHost")
const DISPLAY_MODE_CITY := "city"
const DISPLAY_MODE_WORLD := "world"
const WORLD_EVENT_ACTIVITY_PANEL_IDS := ["activity", "event", "world_event", "world_affairs", "tasks", "faction_status"]
const UNDER_CONSTRUCTION_PANEL_COPY := {
	"world": {
		"title": "国战（开发中）",
		"empty_state_text": "当前仅保留大地图模式切换与运行时浏览，正式国战二级面板尚未接入当前主线。",
	},
	"mail": {
		"title": "战报（开发中）",
		"empty_state_text": "战报面板尚未接入当前主线；后续会统一走正式回执与战报链，不再展示空壳。",
	},
	"bag": {
		"title": "背包（开发中）",
		"empty_state_text": "背包系统尚未接入当前主线，为避免误导，暂不展示空内容。",
	},
	"settings": {
		"title": "设置（开发中）",
		"empty_state_text": "设置面板尚未收口到当前主线；后续统一接入正式配置与控制链。",
	},
	"activity": {
		"title": "活动（结构入口）",
		"empty_state_text": "活动入口先保留位置与层级，后续再接每日任务、赛季活动和限时事件。",
	},
	"help": {
		"title": "帮助（结构入口）",
		"empty_state_text": "帮助入口先保留位置，后续会接新手引导、规则说明和快捷说明卡。",
	},
}

@export var runtime_label_path: NodePath = NodePath("HoverLayer/RuntimeLabel")
@export var observability_panel_path: NodePath = NodePath("ObservabilityPanel")
@export var refresh_button_path: NodePath = NodePath("HoverLayer/RefreshWorldButton")
@export var advance_tick_button_path: NodePath = NodePath("HoverLayer/AdvanceTickButton")

var _api_client
var _runtime_label: Label
var _observability_panel: Node
var _refresh_button: Button
var _advance_tick_button: Button
var _export_button: Button
var _top_left_info_card: PanelContainer
var _observability_bridge
var _ui_theme_tokens
var _ui_layer: CanvasLayer
var _active_map_scope: String = "bootstrap"
var _active_map_query_params: Dictionary = {}
var _native_shell: Node
var _main_city_hub_overlay: Node
var _main_chat_overlay: Node
var _full_screen_panel_host: Node
var _active_overlay_panel: Control = null
var _map_grid: CanvasItem
var _unit_view_layer: CanvasItem
var _display_mode: String = DISPLAY_MODE_CITY
var _request_in_flight: bool = false
var _advance_tick_request_seq: int = 0
var _advance_tick_active_seq: int = -1
var _advance_tick_timeout_warning_visible: bool = false
var _advance_tick_button_default_text: String = "Advance Tick"
var _target_faction_id: String = ""
var _runtime_autonomy_level: String = "unknown"
var _runtime_control_mode: String = "unknown"
var _runtime_seat_count: int = 0
var _runtime_online_seat_count: int = 0
var _runtime_player_names: String = "none"
var _runtime_session_mode: String = "bootstrap"
var _runtime_last_action: String = "none"
var _runtime_last_action_status: String = "idle"
var _runtime_last_action_tick: String = "unknown"
var _runtime_action_receipt: Dictionary = {}
var _backend_health_status: String = "unknown"
var _backend_health_message: String = "not checked"
var _runtime_bootstrap_diagnostic: String = "pending"
var _active_city_action: String = "interior"
var _active_panel_id: String = ""
var _active_panel_tab_id: String = ""
var _active_troop_panel_unit_id: String = ""
var _active_troop_panel_facility_id: String = ""
var _active_city_state_id: String = ""
var _runtime_status_message: String = "bootstrap starting"
var _generated_panel_content: Node = null
var _last_player_home_city_node_context: Dictionary = {}
var _overlay_runtime_helper
var _slg_domain_action_adapter
var _alliance_presenter
var _native_shell_presenter
var _runtime_context_presenter
var _troop_panel_presenter
var _internal_affairs_presenter
var _recruit_presenter
var _general_presenter
var _ai_panel_presenter
var _battle_report_presenter
var _world_event_activity_presenter

func _ready() -> void:
	print("[godot-bootstrap] start")
	_api_client = BackendApiClientScript.new()
	add_child(_api_client)
	_api_client.configure(AppConfig.backend_base_url)
	_active_map_scope = AppConfig.map_layout_scope
	_active_map_query_params = AppConfig.get_map_layout_query_params()
	_ui_theme_tokens = UiThemeTokensScript.new()
	_runtime_label = get_node_or_null(runtime_label_path) as Label
	_observability_panel = get_node_or_null(observability_panel_path)
	_refresh_button = get_node_or_null(refresh_button_path) as Button
	_advance_tick_button = get_node_or_null(advance_tick_button_path) as Button
	_export_button = get_node_or_null(HUD_EXPORT_BUTTON_PATH) as Button
	_top_left_info_card = get_node_or_null(HUD_TOP_LEFT_PATH) as PanelContainer
	_ui_layer = get_node_or_null(UI_LAYER_PATH) as CanvasLayer
	_native_shell = get_node_or_null(NATIVE_SHELL_PATH)
	_main_city_hub_overlay = get_node_or_null(MAIN_CITY_HUB_OVERLAY_PATH)
	_main_chat_overlay = get_node_or_null(MAIN_CHAT_OVERLAY_PATH)
	_full_screen_panel_host = get_node_or_null(FULL_SCREEN_PANEL_HOST_PATH)
	if _main_chat_overlay != null and _main_chat_overlay.has_method("configure"):
		_main_chat_overlay.configure(_api_client)
	_map_grid = get_node_or_null(MAP_GRID_PATH) as CanvasItem
	_unit_view_layer = get_node_or_null(UNIT_VIEW_LAYER_PATH) as CanvasItem
	if _advance_tick_button != null and _advance_tick_button.text.strip_edges() != "":
		_advance_tick_button_default_text = _advance_tick_button.text
	_observability_bridge = ObservabilityBridgeScript.new()
	add_child(_observability_bridge)
	_observability_bridge.configure(_api_client, AppConfig.backend_base_url)
	_resolve_overlay_runtime_helper().seed_runtime_state({
		"active_city_state_id": _active_city_state_id,
		"active_troop_panel_unit_id": _active_troop_panel_unit_id,
		"active_troop_panel_facility_id": _active_troop_panel_facility_id,
	})
	var snapshot_callback := Callable(self, "_on_observability_snapshot_updated")
	if _observability_bridge.has_signal("snapshot_updated") and not _observability_bridge.snapshot_updated.is_connected(snapshot_callback):
		_observability_bridge.snapshot_updated.connect(snapshot_callback)

	_apply_hud_v1_styles()
	_connect_ui_actions()
	_connect_shell_actions()
	_connect_main_city_hub_actions()
	_connect_main_chat_actions()
	_connect_panel_host_actions()
	_connect_world_store_actions()
	_set_display_mode(_resolve_boot_display_mode())
	_update_runtime_label("bootstrap starting")
	_update_observability_panel({
		"wsState": "bootstrap",
		"wsSubscribed": false,
		"wsMessageCount": 0,
		"wsTickDeltaCount": 0,
		"wsGeneralMessageCount": 0,
		"wsErrorCount": 0,
		"eventsPollOkCount": 0,
		"eventsPollFailCount": 0,
		"eventsLastSummary": "waiting...",
		"runtimePollOkCount": 0,
		"runtimePollFailCount": 0,
		"runtimeApiTick": "unknown",
		"runtimeApiWorldVersion": "unknown",
		"runtimeApiFactionCount": 0,
		"runtimeApiControlMode": "unknown",
		"runtimeApiAutonomyLevel": "unknown",
		"runtimeApiSeatOnline": "0/0",
		"runtimeApiPlayerNames": "none",
		"civilMemoryPollOkCount": 0,
		"civilMemoryPollFailCount": 0,
		"civilMemoryLastCount": 0,
		"civilMemoryLastType": "none",
		"civilMemoryLastSummary": "none",
		"civilMemoryProvider": "unknown->unknown",
		"civilMemoryLifecycle": "unknown",
		"civilMemoryDowngraded": "unknown",
		"civilMemoryProviderReason": "none",
		"backendWsConnections": 0,
		"backendWsSubscribedConnections": 0,
		"backendWsFactionDistribution": "none",
		"backendWsRecentError": "none",
		"backendWsMaxConnections": 0,
		"backendWsMaxSubscriptionsPerFaction": 0,
		"backendWsRejectedConnections": 0,
		"backendWsRejectedSubscriptions": 0,
		"backendWsTruncatedTickDeltaMessages": 0,
		"runtimeFactionId": "none",
		"runtimeControlMode": "unknown",
		"runtimeAutonomyLevel": "unknown",
		"runtimeControlAuthoritySource": "unknown",
		"runtimeSeatCount": 0,
		"runtimeOnlineSeatCount": 0,
		"runtimePlayerNames": "none",
		"runtimeSessionId": "none",
		"runtimeSeatId": "none",
		"runtimeSessionMode": "bootstrap",
		"runtimeTick": "unknown",
		"runtimeWorldVersion": "unknown",
		"runtimeAiExecutionSummary": "idle / active 0 / queued 0 / running 0",
		"runtimeAiBudgetSummary": "AP unknown / Food unknown",
		"runtimeAiRequestId": "none",
		"runtimeAiFailureCode": "none",
		"runtimeAiReceiptMessage": "none",
		"backendHealthStatus": _backend_health_status,
		"backendHealthMessage": _backend_health_message,
		"runtimeBootstrapDiagnostic": _runtime_bootstrap_diagnostic,
		"runtimeBackendUrl": AppConfig.backend_base_url,
	})

	await _bootstrap_runtime_world()

	if _is_truthy_env("SLG_MAINLINE_VISUAL_SMOKE"):
		await _run_mainline_visual_smoke()
		return

	if _is_truthy_env("SLG_AUTO_ADVANCE_TICK_ON_BOOT"):
		await _execute_advance_tick("auto boot")

	if _should_auto_quit():
		get_tree().quit()

func _exit_tree() -> void:
	if _observability_bridge != null:
		_observability_bridge.stop()

func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventKey):
		return
	var key_event := event as InputEventKey
	if not key_event.pressed or key_event.echo or not key_event.ctrl_pressed:
		return

	if key_event.keycode == KEY_R:
		call_deferred("_run_hotkey_refresh")
		get_viewport().set_input_as_handled()
		return
	if key_event.keycode == KEY_T:
		call_deferred("_run_hotkey_advance_tick")
		get_viewport().set_input_as_handled()
		return
	if key_event.keycode == KEY_1:
		call_deferred("_run_hotkey_template_action", "clear_plan_execution")
		get_viewport().set_input_as_handled()
		return
	if key_event.keycode == KEY_2:
		call_deferred("_run_hotkey_template_action", "preview_national_agenda")
		get_viewport().set_input_as_handled()
		return
	if key_event.keycode == KEY_3:
		call_deferred("_run_hotkey_template_action", "preview_court_session")
		get_viewport().set_input_as_handled()
		return

func _run_hotkey_refresh() -> void:
	if _request_in_flight:
		return
	if _should_retry_runtime_bootstrap():
		await _execute_bootstrap_retry("hotkey ctrl+r")
		return
	await _execute_refresh_world("hotkey ctrl+r")

func _run_hotkey_advance_tick() -> void:
	if _request_in_flight:
		return
	await _execute_advance_tick("hotkey ctrl+t")

func _run_hotkey_template_action(template_id: String) -> void:
	if _request_in_flight:
		return
	await _execute_template_world_action(template_id, "hotkey")

func _bootstrap_runtime_world() -> void:
	_set_backend_diagnostic("checking", "checking /api/session/runtime")
	var runtime_result: Dictionary = await _api_client.get_runtime()
	if not bool(runtime_result.get("ok", false)):
		var diagnostic_label: String = await _diagnose_runtime_bootstrap_failure(runtime_result)
		push_error("[godot-bootstrap] runtime request failed: %s | diagnostic=%s" % [str(runtime_result), diagnostic_label])
		_runtime_session_mode = "bootstrap_failed"
		_record_last_action("bootstrap_runtime", "failed")
		_update_runtime_label(diagnostic_label)
		return
	_set_backend_diagnostic("ok", "runtime endpoint ok")

	var runtime_data: Dictionary = runtime_result.get("data", {}) as Dictionary
	_target_faction_id = _resolve_target_faction_id(runtime_data)
	if _target_faction_id == "":
		push_error("[godot-bootstrap] no faction available in runtime response")
		_runtime_session_mode = "bootstrap_failed"
		_set_backend_diagnostic("runtime_no_faction", "/api/session/runtime returned no faction")
		_update_runtime_label("no faction in runtime; press Ctrl+R to retry")
		return

	var runtime_row: Dictionary = _find_runtime_faction_row(runtime_data, _target_faction_id)
	_apply_runtime_faction_row(runtime_row)

	var should_join: bool = _should_join_faction(runtime_data, _target_faction_id)
	if SessionStore.faction_id == _target_faction_id and SessionStore.token != "":
		should_join = false

	if should_join:
		var join_result: Dictionary = await _api_client.join_session(_target_faction_id, AppConfig.player_name)
		if not bool(join_result.get("ok", false)):
			push_warning("[godot-bootstrap] join failed, continue with readonly fetch: %s" % str(join_result))
			_runtime_session_mode = "readonly"
			SessionStore.set_control_context(_runtime_autonomy_level, _runtime_control_mode)
			_sync_world_store_ai_control_context("runtime_bootstrap_readonly")
		else:
			var join_data: Dictionary = join_result.get("data", {}) as Dictionary
			SessionStore.set_session(
				str(join_data.get("sessionId", "")),
				str(join_data.get("token", "")),
				str(join_data.get("factionId", _target_faction_id)),
				str(join_data.get("seatId", "")),
				str(join_data.get("autonomyLevel", _runtime_autonomy_level)),
				str(join_data.get("controlMode", _runtime_control_mode)),
			)
			_runtime_autonomy_level = str(join_data.get("autonomyLevel", _runtime_autonomy_level))
			_runtime_control_mode = str(join_data.get("controlMode", _runtime_control_mode))
			_runtime_session_mode = "joined"
			_sync_world_store_ai_control_context("session_join")
	else:
		print("[godot-bootstrap] join skipped for faction=%s (already online)" % _target_faction_id)
		_runtime_session_mode = "reused" if (SessionStore.faction_id == _target_faction_id and SessionStore.token != "") else "readonly"
		SessionStore.set_control_context(_runtime_autonomy_level, _runtime_control_mode)
		_sync_world_store_ai_control_context("runtime_bootstrap_reused")

	var refresh_ok: bool = await _refresh_world_and_map(true)
	if not refresh_ok:
		_set_backend_diagnostic("world_map_failed", "runtime ok but world/map refresh failed")
		_update_runtime_label("world/map refresh failed")
		return

	print(
		"[godot-bootstrap] done | faction=%s | tick=%s | session=%s | map_scope=%s"
		% [
			_target_faction_id,
			_read_tick_label(WorldStore.world),
			SessionStore.session_id,
			_active_map_scope,
		]
	)

	_start_observability()
	_update_runtime_label("ready")

func _diagnose_runtime_bootstrap_failure(runtime_result: Dictionary) -> String:
	var runtime_error: String = _format_api_failure(runtime_result)
	var health_result: Dictionary = await _api_client.get_health()
	if bool(health_result.get("ok", false)):
		var label := "runtime failed; backend health ok; check /api/session/runtime"
		_set_backend_diagnostic("health_ok_runtime_failed", "%s | runtime=%s" % [label, runtime_error])
		return label

	var health_error: String = _format_api_failure(health_result)
	var label := "backend unreachable; run npm run dev:godot:play, then press Ctrl+R"
	_set_backend_diagnostic("unreachable", "%s | runtime=%s | health=%s" % [label, runtime_error, health_error])
	return label

func _format_api_failure(result: Dictionary) -> String:
	var status_text := str(result.get("status", "unknown"))
	var error_text := str(result.get("error", "unknown"))
	var message_text := str(result.get("message", "")).strip_edges()
	if message_text == "":
		message_text = "none"
	return "status=%s error=%s message=%s" % [status_text, error_text, message_text.left(120)]

func _set_backend_diagnostic(status: String, message: String) -> void:
	_backend_health_status = status
	_backend_health_message = message
	_runtime_bootstrap_diagnostic = message
	_update_observability_panel({
		"backendHealthStatus": _backend_health_status,
		"backendHealthMessage": _backend_health_message,
		"runtimeBootstrapDiagnostic": _runtime_bootstrap_diagnostic,
		"runtimeBackendUrl": AppConfig.backend_base_url,
	})

func _run_mainline_visual_smoke() -> void:
	var expected_display_mode := OS.get_environment("SLG_MAINLINE_VISUAL_SMOKE_DISPLAY_MODE").strip_edges().to_lower()
	if expected_display_mode != DISPLAY_MODE_WORLD and expected_display_mode != DISPLAY_MODE_CITY:
		expected_display_mode = _display_mode
	var require_panel := _is_truthy_env("SLG_MAINLINE_VISUAL_SMOKE_REQUIRE_PANEL")
	var world_action := OS.get_environment("SLG_MAINLINE_VISUAL_SMOKE_WORLD_ACTION").strip_edges().to_lower()
	var panel_id := OS.get_environment("SLG_MAINLINE_VISUAL_SMOKE_PANEL").strip_edges()
	if panel_id == "":
		panel_id = "alliance"
	var close_after_open := _is_truthy_env("SLG_MAINLINE_VISUAL_SMOKE_CLOSE_AFTER_OPEN")
	var click_action := OS.get_environment("SLG_MAINLINE_VISUAL_SMOKE_CLICK_ACTION").strip_edges().to_lower()
	var report_path := OS.get_environment("SLG_MAINLINE_VISUAL_SMOKE_REPORT").strip_edges()
	var screenshot_path := OS.get_environment("SLG_MAINLINE_VISUAL_SMOKE_SCREENSHOT").strip_edges()
	var ai_panel_refresh_summary := {}
	var close_button_result := {"attempted": false, "reason": "not_requested"}
	var click_action_result := {"attempted": false, "reason": "not_requested"}
	var click_action_requirement_ok := true

	await get_tree().process_frame
	await get_tree().process_frame
	var tick_label := _read_tick_label(WorldStore.world)
	var world_version_label := _read_world_version_label(WorldStore.world)
	var runtime_label_text := _runtime_label.text if _runtime_label != null else ""
	var ready_ok := _runtime_status_message == "ready" and tick_label != "unknown" and world_version_label != "unknown"
	var runtime_label_ok := runtime_label_text.find("tick=%s" % tick_label) >= 0 and runtime_label_text.find("worldVersion=%s" % world_version_label) >= 0
	var display_mode_ok := _display_mode == expected_display_mode
	var map_visible := _map_grid != null and _map_grid.visible
	var map_requirement_ok := true
	if expected_display_mode == DISPLAY_MODE_WORLD:
		map_requirement_ok = map_visible
	var hub_summary := _read_main_city_hub_visual_smoke_summary()
	var hub_requirement_ok := true
	if expected_display_mode == DISPLAY_MODE_WORLD:
		hub_requirement_ok = bool(hub_summary.get("visible", false))

	if ready_ok and expected_display_mode == DISPLAY_MODE_WORLD and _main_city_hub_overlay != null:
		if world_action == "open_hub" or world_action == "open_hub_panel":
			if _main_city_hub_overlay.has_method("set_expanded"):
				_main_city_hub_overlay.call("set_expanded", true)
				await get_tree().process_frame
				await get_tree().create_timer(0.15).timeout
		hub_summary = _read_main_city_hub_visual_smoke_summary()
		hub_requirement_ok = bool(hub_summary.get("visible", false))
		if world_action == "open_hub_panel" and _main_city_hub_overlay.has_method("request_entry"):
			_main_city_hub_overlay.call("request_entry", panel_id)
			await get_tree().process_frame
			await get_tree().process_frame
			await get_tree().create_timer(0.25).timeout
			ai_panel_refresh_summary = await _wait_for_mainline_visual_smoke_ai_panel_refresh(panel_id)
	elif ready_ok and require_panel:
		_open_overlay_panel_with_page(panel_id)
		await get_tree().process_frame
		await get_tree().process_frame
		await get_tree().create_timer(0.25).timeout
		ai_panel_refresh_summary = await _wait_for_mainline_visual_smoke_ai_panel_refresh(panel_id)

	var panel_open_ok := (
		_active_panel_id == panel_id
		and _active_overlay_panel != null
		and is_instance_valid(_active_overlay_panel)
		and _active_overlay_panel.visible
	)
	var panel_requirement_ok := panel_open_ok if require_panel else true
	var observability_hidden := false
	if _is_truthy_env("SLG_MAINLINE_VISUAL_SMOKE_HIDE_OBSERVABILITY"):
		observability_hidden = _hide_mainline_visual_smoke_observability_panel()
		await get_tree().process_frame
	if panel_open_ok:
		if panel_id == "ai_hub":
			_set_active_overlay_panel_page("players")
		_refresh_overlay_panel_state()
		_reset_mainline_visual_smoke_overlay_scroll()
		await get_tree().process_frame
		_reset_mainline_visual_smoke_overlay_scroll()
	var overlay_panel_layout_summary := {
		"ok": true,
		"enforced": false,
		"reason": "panel_not_open",
	}
	if panel_open_ok:
		overlay_panel_layout_summary = _read_mainline_visual_smoke_overlay_panel_layout_summary(panel_id)
	var overlay_panel_layout_ok := bool(overlay_panel_layout_summary.get("ok", true))
	if click_action != "" and click_action != "none":
		click_action_result = await _run_mainline_visual_smoke_click_action(click_action, panel_id)
		click_action_requirement_ok = bool(click_action_result.get("ok", false))
	elif close_after_open:
		close_button_result = await _press_mainline_visual_smoke_overlay_close_button(panel_id)
		panel_requirement_ok = panel_open_ok and bool(close_button_result.get("closed", false))
	var shell_nav_layout_summary := _read_mainline_visual_smoke_shell_nav_layout_summary()
	var shell_nav_layout_ok := bool(shell_nav_layout_summary.get("ok", true))
	var screenshot_result := _save_mainline_visual_smoke_screenshot(screenshot_path)
	var screenshot_ok := int(screenshot_result.get("error", ERR_UNCONFIGURED)) == OK
	var payload := {
		"ok": ready_ok and runtime_label_ok and display_mode_ok and map_requirement_ok and hub_requirement_ok and panel_requirement_ok and click_action_requirement_ok and shell_nav_layout_ok and overlay_panel_layout_ok and screenshot_ok,
		"windowReady": true,
		"runtimeReady": ready_ok,
		"runtimeLabelOk": runtime_label_ok,
		"runtimeLabelText": runtime_label_text,
		"statusMessage": _runtime_status_message,
		"displayMode": _display_mode,
		"expectedDisplayMode": expected_display_mode,
		"displayModeOk": display_mode_ok,
		"mapVisible": map_visible,
		"mapRequirementOk": map_requirement_ok,
		"worldAction": world_action,
		"mainCityHub": hub_summary,
		"mainCityHubRequirementOk": hub_requirement_ok,
		"factionId": _target_faction_id,
		"tick": tick_label,
		"worldVersion": world_version_label,
		"panelId": panel_id,
		"panelRequired": require_panel,
		"panelOpenOk": panel_open_ok,
		"panelRequirementOk": panel_requirement_ok,
		"closeAfterOpen": close_after_open,
		"closeButtonResult": close_button_result,
		"panelClosedAfterClose": bool(close_button_result.get("closed", false)) if close_after_open else false,
		"clickAction": click_action,
		"clickActionResult": click_action_result,
		"clickActionRequirementOk": click_action_requirement_ok,
		"aiPanelRefresh": ai_panel_refresh_summary,
		"shellNavLayout": shell_nav_layout_summary,
		"overlayPanelLayout": overlay_panel_layout_summary,
		"observabilityHidden": observability_hidden,
		"activePanelId": _active_panel_id,
		"screenshot": screenshot_result,
		"backendHealthStatus": _backend_health_status,
		"backendHealthMessage": _backend_health_message,
		"runtimeBootstrapDiagnostic": _runtime_bootstrap_diagnostic,
	}
	_write_mainline_visual_smoke_report(report_path, payload)
	get_tree().quit(0 if bool(payload.get("ok", false)) else 1)

func _press_mainline_visual_smoke_overlay_close_button(panel_id: String) -> Dictionary:
	if _active_panel_id != panel_id:
		return {
			"attempted": true,
			"pressed": false,
			"closed": false,
			"reason": "active_panel_mismatch",
			"activePanelId": _active_panel_id,
		}
	if _active_overlay_panel == null or not is_instance_valid(_active_overlay_panel):
		return {
			"attempted": true,
			"pressed": false,
			"closed": false,
			"reason": "overlay_missing",
			"activePanelId": _active_panel_id,
		}
	var close_button := _find_mainline_visual_smoke_visible_button(_active_overlay_panel, "CloseButton")
	if close_button == null:
		return {
			"attempted": true,
			"pressed": false,
			"closed": false,
			"reason": "close_button_missing",
			"activePanelId": _active_panel_id,
		}
	close_button.emit_signal("pressed")
	await get_tree().process_frame
	await get_tree().process_frame
	await get_tree().create_timer(0.15).timeout
	var closed := (
		_active_panel_id == ""
		and (_active_overlay_panel == null or not is_instance_valid(_active_overlay_panel))
	)
	return {
		"attempted": true,
		"pressed": true,
		"closed": closed,
		"reason": "closed" if closed else "still_open",
		"activePanelId": _active_panel_id,
	}

func _run_mainline_visual_smoke_click_action(click_action: String, panel_id: String) -> Dictionary:
	match click_action:
		"ai_panel_open_chat_channel":
			return await _press_mainline_visual_smoke_ai_panel_open_chat_channel(panel_id)
		"shell_open_chat_channel":
			return await _press_mainline_visual_smoke_shell_open_chat_channel()
		"world_open_main_city_hub":
			return await _ensure_mainline_visual_smoke_main_city_hub_expanded()
		"world_click_main_city_node":
			return await _press_mainline_visual_smoke_main_city_map_node()
		"world_click_main_city_node_city_context":
			return await _press_mainline_visual_smoke_main_city_context("overview")
		"world_click_main_city_node_troop_assign_preview":
			return await _press_mainline_visual_smoke_main_city_troop_assign_preview()
		"world_click_main_city_node_facility_building_tree":
			return await _press_mainline_visual_smoke_main_city_context("building_tree")
		"world_click_main_city_node_interior":
			return await _press_mainline_visual_smoke_main_city_map_node_panel("interior")
		"world_click_main_city_node_interior_close":
			return await _press_mainline_visual_smoke_main_city_map_node_panel_close("interior")
		"world_click_main_city_node_building_upgrade":
			return await _press_mainline_visual_smoke_main_city_map_node_building_upgrade()
		"world_click_main_city_node_troop":
			return await _press_mainline_visual_smoke_main_city_map_node_troop()
		"world_click_main_city_node_troop_close":
			return await _press_mainline_visual_smoke_main_city_map_node_troop_close()
		"world_open_main_city_interior":
			return await _verify_mainline_visual_smoke_main_city_panel("interior")
		"world_open_main_city_building_upgrade":
			return await _press_mainline_visual_smoke_main_city_building_upgrade()
		"world_open_main_city_troop":
			return await _verify_mainline_visual_smoke_troop_panel()
		"generals_roster_open_hero_profile":
			return await _press_mainline_visual_smoke_generals_roster_open_hero_profile(panel_id)
		_:
			return {
				"attempted": true,
				"ok": false,
				"clicked": false,
				"reason": "click_action_not_allowed",
				"clickAction": click_action,
				"activePanelId": _active_panel_id,
			}

func _press_mainline_visual_smoke_generals_roster_open_hero_profile(panel_id: String) -> Dictionary:
	if panel_id != "generals" or _active_panel_id != "generals":
		return {
			"attempted": true,
			"ok": false,
			"clicked": false,
			"reason": "generals_panel_not_active",
			"panelId": panel_id,
			"activePanelId": _active_panel_id,
		}
	if _active_overlay_panel == null or not is_instance_valid(_active_overlay_panel):
		return {
			"attempted": true,
			"ok": false,
			"clicked": false,
			"reason": "overlay_missing",
			"panelId": panel_id,
			"activePanelId": _active_panel_id,
		}
	var panel_control := _active_overlay_panel as Control
	if panel_control == null:
		return {
			"attempted": true,
			"ok": false,
			"clicked": false,
			"reason": "overlay_not_control",
			"panelId": panel_id,
			"activePanelId": _active_panel_id,
		}
	var before_page_id := ""
	if panel_control.has_method("get_active_page_id"):
		before_page_id = str(panel_control.call("get_active_page_id")).strip_edges()
	if before_page_id != "roster":
		return {
			"attempted": true,
			"ok": false,
			"clicked": false,
			"reason": "active_page_not_roster",
			"panelId": panel_id,
			"activePanelId": _active_panel_id,
			"beforeActivePageId": before_page_id,
		}
	var profile_button := _find_mainline_visual_smoke_visible_button_by_name_prefix(panel_control, "OpenHeroProfileButton_")
	if profile_button == null:
		return {
			"attempted": true,
			"ok": false,
			"clicked": false,
			"reason": "open_hero_profile_button_missing",
			"panelId": panel_id,
			"activePanelId": _active_panel_id,
			"beforeActivePageId": before_page_id,
		}
	var button_name := str(profile_button.name)
	var hero_id := button_name.trim_prefix("OpenHeroProfileButton_")
	profile_button.emit_signal("pressed")
	await get_tree().process_frame
	await get_tree().process_frame
	await get_tree().create_timer(0.15).timeout
	var after_page_id := ""
	if panel_control.has_method("get_active_page_id"):
		after_page_id = str(panel_control.call("get_active_page_id")).strip_edges()
	var layout_after := _read_mainline_visual_smoke_overlay_panel_layout_summary(panel_id)
	var profile_page_ok := after_page_id == "profile"
	var layout_ok := bool(layout_after.get("layoutOk", false))
	return {
		"attempted": true,
		"ok": profile_page_ok and layout_ok,
		"clicked": true,
		"reason": "profile_page_opened" if profile_page_ok and layout_ok else "profile_page_not_verified",
		"panelId": panel_id,
		"activePanelId": _active_panel_id,
		"beforeActivePageId": before_page_id,
		"afterActivePageId": after_page_id,
		"profilePageOk": profile_page_ok,
		"selectedHeroId": hero_id,
		"buttonName": button_name,
		"buttonText": profile_button.text,
		"buttonRect": _rect_to_mainline_visual_smoke_dict(profile_button.get_global_rect()),
		"overlayPanelLayoutAfter": layout_after,
	}

func _ensure_mainline_visual_smoke_main_city_hub_expanded() -> Dictionary:
	if _display_mode != DISPLAY_MODE_WORLD:
		return {
			"attempted": true,
			"ok": false,
			"clicked": false,
			"reason": "display_mode_not_world",
			"displayMode": _display_mode,
		}
	if _main_city_hub_overlay == null or not is_instance_valid(_main_city_hub_overlay):
		return {
			"attempted": true,
			"ok": false,
			"clicked": false,
			"reason": "main_city_hub_missing",
		}
	if _main_city_hub_overlay.has_method("set_expanded"):
		_main_city_hub_overlay.call("set_expanded", true)
	await get_tree().process_frame
	await get_tree().process_frame
	await get_tree().create_timer(0.15).timeout
	var hub_summary := _read_main_city_hub_visual_smoke_summary()
	var ok := bool(hub_summary.get("visible", false)) and bool(hub_summary.get("expanded", false))
	return {
		"attempted": true,
		"ok": ok,
		"clicked": true,
		"reason": "main_city_hub_expanded" if ok else "main_city_hub_not_expanded",
		"mainCityHub": hub_summary,
	}

func _press_mainline_visual_smoke_main_city_map_node() -> Dictionary:
	if _display_mode != DISPLAY_MODE_WORLD:
		return {
			"attempted": true,
			"ok": false,
			"clicked": false,
			"reason": "display_mode_not_world",
			"displayMode": _display_mode,
		}
	if _map_grid == null or not is_instance_valid(_map_grid):
		return {
			"attempted": true,
			"ok": false,
			"clicked": false,
			"reason": "map_grid_missing",
		}
	if not _map_grid.has_signal("player_home_city_node_clicked"):
		return {
			"attempted": true,
			"ok": false,
			"clicked": false,
			"reason": "map_grid_signal_missing",
		}
	if not _map_grid.has_method("_select_tile_at") and not _map_grid.has_method("_unhandled_input"):
		return {
			"attempted": true,
			"ok": false,
			"clicked": false,
			"reason": "map_grid_input_hook_missing",
		}
	var target_source := "map_grid_home_city_overlay"
	var context := _read_mainline_visual_smoke_player_home_city_map_context()
	if context.is_empty():
		target_source = "main_city_hub_context"
		context = _build_main_city_hub_context()
	var tile_id := str(context.get("tileId", "")).strip_edges()
	var tile_x := int(context.get("tileX", -1))
	var tile_y := int(context.get("tileY", -1))
	if tile_id == "" or tile_x < 0 or tile_y < 0:
		return {
			"attempted": true,
			"ok": false,
			"clicked": false,
			"reason": "main_city_tile_context_missing",
			"mainCityHub": context,
		}
	var click_position := Vector2.ZERO
	if _map_grid.has_method("_resolve_screen_position_for_tile") and int(context.get("tmxX", -1)) >= 0 and int(context.get("tmxY", -1)) >= 0:
		click_position = _map_grid.call("_resolve_screen_position_for_tile", context)
	elif _map_grid.has_method("tile_id_to_screen_position"):
		click_position = _map_grid.call("tile_id_to_screen_position", tile_id, tile_x, tile_y)
	elif _map_grid.has_method("tile_to_screen_position"):
		click_position = _map_grid.call("tile_to_screen_position", tile_x, tile_y)
	else:
		return {
			"attempted": true,
			"ok": false,
			"clicked": false,
			"reason": "map_grid_tile_position_missing",
			"tileId": tile_id,
			"tileX": tile_x,
			"tileY": tile_y,
		}
	_last_player_home_city_node_context = {}
	var selected_tile_preview: Dictionary = {}
	if _map_grid.has_method("_screen_to_backend_tile_data"):
		var selected_tile_variant: Variant = _map_grid.call("_screen_to_backend_tile_data", click_position)
		if selected_tile_variant is Dictionary:
			selected_tile_preview = (selected_tile_variant as Dictionary).duplicate(true)
	var click_context_preview: Dictionary = {}
	if _map_grid.has_method("_resolve_player_home_city_click_context") and not selected_tile_preview.is_empty():
		var click_context_variant: Variant = _map_grid.call("_resolve_player_home_city_click_context", selected_tile_preview)
		if click_context_variant is Dictionary:
			click_context_preview = (click_context_variant as Dictionary).duplicate(true)
	if _map_grid.has_method("_select_tile_at"):
		_map_grid.call("_select_tile_at", click_position)
	else:
		var press_event := InputEventMouseButton.new()
		press_event.button_index = MOUSE_BUTTON_LEFT
		press_event.pressed = true
		press_event.position = click_position
		press_event.global_position = click_position
		_map_grid.call("_unhandled_input", press_event)
		var release_event := InputEventMouseButton.new()
		release_event.button_index = MOUSE_BUTTON_LEFT
		release_event.pressed = false
		release_event.position = click_position
		release_event.global_position = click_position
		_map_grid.call("_unhandled_input", release_event)
	await get_tree().process_frame
	await get_tree().process_frame
	await get_tree().create_timer(0.15).timeout
	var clicked_context := _last_player_home_city_node_context.duplicate(true)
	var hub_summary := _read_main_city_hub_visual_smoke_summary()
	var emitted_tile_id := str(clicked_context.get("tileId", "")).strip_edges()
	var ok := (
		not clicked_context.is_empty()
		and emitted_tile_id == tile_id
		and bool(hub_summary.get("visible", false))
		and bool(hub_summary.get("expanded", false))
	)
	return {
		"attempted": true,
		"ok": ok,
		"clicked": true,
		"reason": "main_city_map_node_clicked" if ok else "main_city_map_node_click_not_verified",
		"targetSource": target_source,
		"targetContext": context,
		"tileId": tile_id,
		"tileX": tile_x,
		"tileY": tile_y,
		"clickPosition": {"x": click_position.x, "y": click_position.y},
		"selectedTilePreview": selected_tile_preview,
		"clickContextPreview": click_context_preview,
		"mapNodeClickContext": clicked_context,
		"mainCityHub": hub_summary,
	}

func _press_mainline_visual_smoke_main_city_map_node_panel(expected_panel_id: String) -> Dictionary:
	var map_click_result := await _press_mainline_visual_smoke_main_city_map_node()
	if not bool(map_click_result.get("ok", false)):
		return {
			"attempted": true,
			"ok": false,
			"clicked": bool(map_click_result.get("clicked", false)),
			"reason": "main_city_map_node_click_failed",
			"expectedPanelId": expected_panel_id,
			"mapClickResult": map_click_result,
		}
	if _main_city_hub_overlay == null or not is_instance_valid(_main_city_hub_overlay):
		return {
			"attempted": true,
			"ok": false,
			"clicked": true,
			"reason": "main_city_hub_missing_after_map_click",
			"expectedPanelId": expected_panel_id,
			"mapClickResult": map_click_result,
		}
	if not _main_city_hub_overlay.has_method("request_entry"):
		return {
			"attempted": true,
			"ok": false,
			"clicked": true,
			"reason": "main_city_hub_request_entry_missing",
			"expectedPanelId": expected_panel_id,
			"mapClickResult": map_click_result,
		}
	_main_city_hub_overlay.call("request_entry", expected_panel_id)
	await get_tree().process_frame
	await get_tree().process_frame
	await get_tree().create_timer(0.25).timeout
	var panel_result := _verify_mainline_visual_smoke_main_city_panel(expected_panel_id)
	var ok := bool(panel_result.get("ok", false))
	return {
		"attempted": true,
		"ok": ok,
		"clicked": true,
		"reason": "main_city_map_node_panel_opened" if ok else "main_city_map_node_panel_not_verified",
		"expectedPanelId": expected_panel_id,
		"activePanelId": _active_panel_id,
		"mapClickResult": map_click_result,
		"panelResult": panel_result,
	}

func _press_mainline_visual_smoke_main_city_context(expected_tab_id: String) -> Dictionary:
	var map_click_result := await _press_mainline_visual_smoke_main_city_map_node()
	if not bool(map_click_result.get("ok", false)):
		return {
			"attempted": true,
			"ok": false,
			"clicked": bool(map_click_result.get("clicked", false)),
			"reason": "main_city_map_node_click_failed",
			"expectedContextTab": expected_tab_id,
			"mapClickResult": map_click_result,
		}
	if _main_city_hub_overlay == null or not is_instance_valid(_main_city_hub_overlay):
		return {
			"attempted": true,
			"ok": false,
			"clicked": true,
			"reason": "main_city_context_overlay_missing",
			"expectedContextTab": expected_tab_id,
			"mapClickResult": map_click_result,
		}
	if _main_city_hub_overlay.has_method("select_context_tab"):
		_main_city_hub_overlay.call("select_context_tab", expected_tab_id)
	await get_tree().process_frame
	await get_tree().process_frame
	await get_tree().create_timer(0.25).timeout
	var hub_summary := _read_main_city_hub_visual_smoke_summary()
	var ok := (
		bool(hub_summary.get("contextPanelVisible", false))
		and str(hub_summary.get("activeContextTab", "")) == expected_tab_id
	)
	return {
		"attempted": true,
		"ok": ok,
		"clicked": true,
		"reason": "main_city_context_visible" if ok else "main_city_context_not_verified",
		"expectedContextTab": expected_tab_id,
		"mapClickResult": map_click_result,
		"mainCityContext": hub_summary,
	}

func _press_mainline_visual_smoke_main_city_troop_assign_preview() -> Dictionary:
	var context_result := await _press_mainline_visual_smoke_main_city_context("troop")
	if not bool(context_result.get("ok", false)):
		return {
			"attempted": true,
			"ok": false,
			"clicked": bool(context_result.get("clicked", false)),
			"reason": "main_city_troop_context_open_failed",
			"contextResult": context_result,
		}
	if _main_city_hub_overlay != null and is_instance_valid(_main_city_hub_overlay) and _main_city_hub_overlay.has_method("assign_preview_general"):
		_main_city_hub_overlay.call("assign_preview_general", "general_yue")
	await get_tree().process_frame
	await get_tree().process_frame
	await get_tree().create_timer(0.2).timeout
	var hub_summary := _read_main_city_hub_visual_smoke_summary()
	var assignment_count := int(hub_summary.get("templateAssignmentCount", 0))
	var ok := (
		bool(hub_summary.get("contextPanelVisible", false))
		and str(hub_summary.get("activeContextTab", "")) == "troop"
		and assignment_count >= 1
	)
	return {
		"attempted": true,
		"ok": ok,
		"clicked": true,
		"reason": "main_city_troop_assign_preview_done" if ok else "main_city_troop_assign_preview_failed",
		"contextResult": context_result,
		"mainCityContext": hub_summary,
		"templateOnly": true,
		"authorityTriggered": false,
	}

func _press_mainline_visual_smoke_main_city_map_node_panel_close(expected_panel_id: String) -> Dictionary:
	var panel_open_result := await _press_mainline_visual_smoke_main_city_map_node_panel(expected_panel_id)
	var map_click_result: Dictionary = {}
	var map_click_variant: Variant = panel_open_result.get("mapClickResult", {})
	if map_click_variant is Dictionary:
		map_click_result = (map_click_variant as Dictionary).duplicate(true)
	var map_node_click_context: Dictionary = {}
	var map_context_variant: Variant = map_click_result.get("mapNodeClickContext", {})
	if map_context_variant is Dictionary:
		map_node_click_context = (map_context_variant as Dictionary).duplicate(true)
	if not bool(panel_open_result.get("ok", false)):
		return {
			"attempted": true,
			"ok": false,
			"clicked": bool(panel_open_result.get("clicked", false)),
			"reason": "main_city_map_node_panel_open_failed",
			"expectedPanelId": expected_panel_id,
			"mapNodeClickContext": map_node_click_context,
			"mapClickResult": map_click_result,
			"panelOpenResult": panel_open_result,
		}
	var close_result := await _press_mainline_visual_smoke_overlay_close_button(expected_panel_id)
	var map_visible := _map_grid != null and is_instance_valid(_map_grid) and (_map_grid as CanvasItem).visible
	var returned_to_map := bool(close_result.get("closed", false)) and _display_mode == DISPLAY_MODE_WORLD and map_visible
	return {
		"attempted": true,
		"ok": returned_to_map,
		"clicked": true,
		"reason": "main_city_map_node_panel_closed_to_map" if returned_to_map else "main_city_map_node_panel_close_failed",
		"expectedPanelId": expected_panel_id,
		"activePanelId": _active_panel_id,
		"displayMode": _display_mode,
		"mapVisible": map_visible,
		"returnedToMap": returned_to_map,
		"mapNodeClickContext": map_node_click_context,
		"mapClickResult": map_click_result,
		"panelOpenResult": panel_open_result,
		"closeResult": close_result,
	}

func _press_mainline_visual_smoke_main_city_map_node_building_upgrade() -> Dictionary:
	var panel_open_result := await _press_mainline_visual_smoke_main_city_map_node_panel("interior")
	var map_click_result: Dictionary = {}
	var map_click_variant: Variant = panel_open_result.get("mapClickResult", {})
	if map_click_variant is Dictionary:
		map_click_result = (map_click_variant as Dictionary).duplicate(true)
	var map_node_click_context: Dictionary = {}
	var map_context_variant: Variant = map_click_result.get("mapNodeClickContext", {})
	if map_context_variant is Dictionary:
		map_node_click_context = (map_context_variant as Dictionary).duplicate(true)
	if not bool(panel_open_result.get("ok", false)):
		return {
			"attempted": true,
			"ok": false,
			"clicked": bool(panel_open_result.get("clicked", false)),
			"reason": "main_city_map_node_interior_open_failed",
			"expectedPanelId": "interior",
			"mapNodeClickContext": map_node_click_context,
			"mapClickResult": map_click_result,
			"panelOpenResult": panel_open_result,
		}
	var upgrade_result := await _press_mainline_visual_smoke_main_city_building_upgrade()
	var ok := bool(upgrade_result.get("ok", false))
	return {
		"attempted": true,
		"ok": ok,
		"clicked": true,
		"reason": "main_city_map_node_building_upgrade_template_feedback" if ok else "main_city_map_node_building_upgrade_failed",
		"expectedPanelId": "interior",
		"activePanelId": _active_panel_id,
		"mapNodeClickContext": map_node_click_context,
		"mapClickResult": map_click_result,
		"panelOpenResult": panel_open_result,
		"buildingUpgradeResult": upgrade_result,
		"buildingChain": upgrade_result.get("buildingChain", {}),
	}

func _press_mainline_visual_smoke_main_city_map_node_troop() -> Dictionary:
	var map_click_result := await _press_mainline_visual_smoke_main_city_map_node()
	var map_node_click_context: Dictionary = {}
	var map_context_variant: Variant = map_click_result.get("mapNodeClickContext", {})
	if map_context_variant is Dictionary:
		map_node_click_context = (map_context_variant as Dictionary).duplicate(true)
	if not bool(map_click_result.get("ok", false)):
		return {
			"attempted": true,
			"ok": false,
			"clicked": bool(map_click_result.get("clicked", false)),
			"reason": "main_city_map_node_click_failed",
			"expectedPanelId": "troop",
			"mapNodeClickContext": map_node_click_context,
			"mapClickResult": map_click_result,
		}
	if _main_city_hub_overlay == null or not is_instance_valid(_main_city_hub_overlay):
		return {
			"attempted": true,
			"ok": false,
			"clicked": true,
			"reason": "main_city_hub_missing_after_map_click",
			"expectedPanelId": "troop",
			"mapNodeClickContext": map_node_click_context,
			"mapClickResult": map_click_result,
		}
	if not _main_city_hub_overlay.has_method("request_entry"):
		return {
			"attempted": true,
			"ok": false,
			"clicked": true,
			"reason": "main_city_hub_request_entry_missing",
			"expectedPanelId": "troop",
			"mapNodeClickContext": map_node_click_context,
			"mapClickResult": map_click_result,
		}
	_main_city_hub_overlay.call("request_entry", "troop")
	await get_tree().process_frame
	await get_tree().process_frame
	await get_tree().create_timer(0.25).timeout
	var panel_result := _verify_mainline_visual_smoke_troop_panel()
	var ok := bool(panel_result.get("ok", false))
	return {
		"attempted": true,
		"ok": ok,
		"clicked": true,
		"reason": "main_city_map_node_troop_opened" if ok else "main_city_map_node_troop_not_verified",
		"expectedPanelId": "troop",
		"activePanelId": _active_panel_id,
		"mapNodeClickContext": map_node_click_context,
		"mapClickResult": map_click_result,
		"panelResult": panel_result,
		"troopPanel": panel_result.get("troopPanel", {}),
	}

func _press_mainline_visual_smoke_main_city_map_node_troop_close() -> Dictionary:
	var panel_open_result := await _press_mainline_visual_smoke_main_city_map_node_troop()
	var map_click_result: Dictionary = {}
	var map_click_variant: Variant = panel_open_result.get("mapClickResult", {})
	if map_click_variant is Dictionary:
		map_click_result = (map_click_variant as Dictionary).duplicate(true)
	var map_node_click_context: Dictionary = {}
	var map_context_variant: Variant = panel_open_result.get("mapNodeClickContext", {})
	if map_context_variant is Dictionary:
		map_node_click_context = (map_context_variant as Dictionary).duplicate(true)
	if map_node_click_context.is_empty():
		var nested_map_context_variant: Variant = map_click_result.get("mapNodeClickContext", {})
		if nested_map_context_variant is Dictionary:
			map_node_click_context = (nested_map_context_variant as Dictionary).duplicate(true)
	if not bool(panel_open_result.get("ok", false)):
		return {
			"attempted": true,
			"ok": false,
			"clicked": bool(panel_open_result.get("clicked", false)),
			"reason": "main_city_map_node_troop_open_failed",
			"expectedPanelId": "troop",
			"mapNodeClickContext": map_node_click_context,
			"mapClickResult": map_click_result,
			"panelOpenResult": panel_open_result,
		}
	var close_result := await _press_mainline_visual_smoke_overlay_close_button("troop")
	var map_visible := _map_grid != null and is_instance_valid(_map_grid) and (_map_grid as CanvasItem).visible
	var returned_to_map := bool(close_result.get("closed", false)) and _display_mode == DISPLAY_MODE_WORLD and map_visible
	return {
		"attempted": true,
		"ok": returned_to_map,
		"clicked": true,
		"reason": "main_city_map_node_troop_closed_to_map" if returned_to_map else "main_city_map_node_troop_close_failed",
		"expectedPanelId": "troop",
		"activePanelId": _active_panel_id,
		"displayMode": _display_mode,
		"mapVisible": map_visible,
		"returnedToMap": returned_to_map,
		"mapNodeClickContext": map_node_click_context,
		"mapClickResult": map_click_result,
		"panelOpenResult": panel_open_result,
		"closeResult": close_result,
	}

func _read_mainline_visual_smoke_player_home_city_map_context() -> Dictionary:
	if _map_grid == null or not is_instance_valid(_map_grid):
		return {}
	var entries_variant: Variant = _map_grid.get("_home_city_overlay_entries")
	if not (entries_variant is Array):
		return {}
	var fallback_context: Dictionary = {}
	for entry_variant in entries_variant as Array:
		if not (entry_variant is Dictionary):
			continue
		var entry: Dictionary = entry_variant as Dictionary
		var faction_id := str(entry.get("factionId", "")).strip_edges()
		var is_human := bool(entry.get("isHuman", false))
		if fallback_context.is_empty() and _target_faction_id != "" and faction_id == _target_faction_id:
			fallback_context = _build_main_city_hub_context_from_map_node_click(entry)
		if is_human:
			return _build_main_city_hub_context_from_map_node_click(entry)
	return fallback_context

func _verify_mainline_visual_smoke_main_city_panel(expected_panel_id: String) -> Dictionary:
	var panel_open := (
		_active_panel_id == expected_panel_id
		and _active_overlay_panel != null
		and is_instance_valid(_active_overlay_panel)
		and (_active_overlay_panel as CanvasItem).visible
	)
	var chain_summary := _read_mainline_visual_smoke_building_chain_summary()
	var chain_ok := bool(chain_summary.get("hasBuildingTree", false)) and bool(chain_summary.get("hasSelectedBuilding", false))
	var ok := panel_open and chain_ok
	return {
		"attempted": true,
		"ok": ok,
		"clicked": true,
		"reason": "main_city_panel_open_with_building_chain" if ok else "main_city_panel_chain_missing",
		"expectedPanelId": expected_panel_id,
		"activePanelId": _active_panel_id,
		"panelOpen": panel_open,
		"buildingChain": chain_summary,
	}

func _verify_mainline_visual_smoke_troop_panel() -> Dictionary:
	var panel_open := (
		_active_panel_id == "troop"
		and _active_overlay_panel != null
		and is_instance_valid(_active_overlay_panel)
		and (_active_overlay_panel as CanvasItem).visible
	)
	var troop_panel_summary := _read_mainline_visual_smoke_troop_panel_summary()
	var ok := panel_open and bool(troop_panel_summary.get("hasTroopPanel", false))
	return {
		"attempted": true,
		"ok": ok,
		"clicked": true,
		"reason": "troop_panel_open" if ok else "troop_panel_missing",
		"expectedPanelId": "troop",
		"activePanelId": _active_panel_id,
		"panelOpen": panel_open,
		"troopPanel": troop_panel_summary,
	}

func _press_mainline_visual_smoke_main_city_building_upgrade() -> Dictionary:
	if _active_panel_id != "interior":
		return {
			"attempted": true,
			"ok": false,
			"clicked": false,
			"reason": "active_panel_not_interior",
			"activePanelId": _active_panel_id,
		}
	if _active_overlay_panel == null or not is_instance_valid(_active_overlay_panel):
		return {
			"attempted": true,
			"ok": false,
			"clicked": false,
			"reason": "overlay_missing",
			"activePanelId": _active_panel_id,
		}
	if _active_overlay_panel.has_method("set_active_page_id"):
		_active_overlay_panel.call("set_active_page_id", "market/overview")
	_refresh_overlay_panel_state()
	_reset_mainline_visual_smoke_overlay_scroll()
	await get_tree().process_frame
	await get_tree().process_frame
	await get_tree().create_timer(0.15).timeout
	var before_summary := _read_mainline_visual_smoke_building_chain_summary()
	if not bool(before_summary.get("hasSelectedBuilding", false)):
		return {
			"attempted": true,
			"ok": false,
			"clicked": false,
			"reason": "building_not_selected",
			"activePanelId": _active_panel_id,
			"buildingChain": before_summary,
		}
	var primary_button := _find_mainline_visual_smoke_visible_button(_active_overlay_panel, "PrimaryButton")
	if primary_button == null:
		return {
			"attempted": true,
			"ok": false,
			"clicked": false,
			"reason": "upgrade_primary_button_missing",
			"activePanelId": _active_panel_id,
			"buildingChain": before_summary,
		}
	if primary_button.disabled:
		return {
			"attempted": true,
			"ok": false,
			"clicked": false,
			"reason": "upgrade_primary_button_disabled",
			"activePanelId": _active_panel_id,
			"buildingChain": before_summary,
		}
	primary_button.emit_signal("pressed")
	await get_tree().process_frame
	await get_tree().process_frame
	await get_tree().create_timer(0.25).timeout
	var after_summary := _read_mainline_visual_smoke_building_chain_summary()
	var still_open := (
		_active_panel_id == "interior"
		and _active_overlay_panel != null
		and is_instance_valid(_active_overlay_panel)
		and (_active_overlay_panel as CanvasItem).visible
	)
	var template_feedback_visible := bool(after_summary.get("templateFeedbackVisible", false)) or bool(after_summary.get("submittedStateVisible", false))
	var ok := still_open and bool(after_summary.get("hasSelectedBuilding", false)) and template_feedback_visible
	var building_chain_result := after_summary.duplicate(true)
	building_chain_result["templateOnly"] = true
	building_chain_result["authorityTriggered"] = false
	building_chain_result["feedbackVisible"] = template_feedback_visible
	building_chain_result["before"] = before_summary
	building_chain_result["after"] = after_summary
	return {
		"attempted": true,
		"ok": ok,
		"clicked": true,
		"reason": "building_upgrade_template_feedback" if ok else "building_upgrade_feedback_missing",
		"activePanelId": _active_panel_id,
		"selectedBuildingId": str(before_summary.get("selectedBuildingId", "")),
		"templateOnly": true,
		"authorityTriggered": false,
		"buildingChain": building_chain_result,
		"buildingChainBefore": before_summary,
		"buildingChainAfter": after_summary,
	}

func _read_mainline_visual_smoke_troop_panel_summary() -> Dictionary:
	if _active_overlay_panel == null or not is_instance_valid(_active_overlay_panel):
		return {
			"hasTroopPanel": false,
			"reason": "overlay_missing",
		}
	if not _active_overlay_panel.has_method("get_visual_smoke_summary"):
		return {
			"hasTroopPanel": false,
			"reason": "troop_panel_summary_missing",
		}
	var summary_variant: Variant = _active_overlay_panel.call("get_visual_smoke_summary")
	if not (summary_variant is Dictionary):
		return {
			"hasTroopPanel": false,
			"reason": "troop_panel_summary_invalid",
		}
	var summary: Dictionary = (summary_variant as Dictionary).duplicate(true)
	summary["hasTroopPanel"] = true
	return summary

func _read_mainline_visual_smoke_building_chain_summary() -> Dictionary:
	if _active_overlay_panel == null or not is_instance_valid(_active_overlay_panel):
		return {
			"hasBuildingTree": false,
			"hasSelectedBuilding": false,
			"reason": "overlay_missing",
		}
	var building_tree := _find_mainline_visual_smoke_visible_node_with_method(_active_overlay_panel, "get_selected_building_id")
	var upgrade_sheet := _find_mainline_visual_smoke_visible_node_with_method(_active_overlay_panel, "get_visual_smoke_summary")
	var primary_button := _find_mainline_visual_smoke_visible_button(_active_overlay_panel, "PrimaryButton")
	var upgrade_sheet_summary: Dictionary = {}
	if upgrade_sheet != null:
		var upgrade_sheet_summary_variant: Variant = upgrade_sheet.call("get_visual_smoke_summary")
		if upgrade_sheet_summary_variant is Dictionary:
			upgrade_sheet_summary = (upgrade_sheet_summary_variant as Dictionary).duplicate(true)
	if building_tree == null:
		return {
			"hasBuildingTree": false,
			"hasSelectedBuilding": false,
			"upgradeButtonVisible": primary_button != null,
			"hasUpgradeSheet": upgrade_sheet != null,
			"upgradeSheet": upgrade_sheet_summary,
			"templateFeedbackVisible": bool(upgrade_sheet_summary.get("templateFeedbackVisible", false)),
			"submittedStateVisible": bool(upgrade_sheet_summary.get("submittedStateVisible", false)),
			"reason": "building_tree_missing",
		}
	var selected_building_id := str(building_tree.call("get_selected_building_id")).strip_edges()
	return {
		"hasBuildingTree": true,
		"hasSelectedBuilding": selected_building_id != "",
		"selectedBuildingId": selected_building_id,
		"upgradeButtonVisible": primary_button != null,
		"upgradeButtonDisabled": primary_button.disabled if primary_button != null else true,
		"hasUpgradeSheet": upgrade_sheet != null,
		"upgradeSheet": upgrade_sheet_summary,
		"templateFeedbackVisible": bool(upgrade_sheet_summary.get("templateFeedbackVisible", false)),
		"submittedStateVisible": bool(upgrade_sheet_summary.get("submittedStateVisible", false)),
	}

func _find_mainline_visual_smoke_visible_node_with_method(root: Node, method_name: String) -> Node:
	if root == null:
		return null
	var canvas_item := root as CanvasItem
	var visible := canvas_item == null or (canvas_item.visible and canvas_item.is_visible_in_tree())
	if visible and root.has_method(method_name):
		return root
	for child in root.get_children():
		var found := _find_mainline_visual_smoke_visible_node_with_method(child, method_name)
		if found != null:
			return found
	return null

func _press_mainline_visual_smoke_shell_open_chat_channel() -> Dictionary:
	if _native_shell == null or not is_instance_valid(_native_shell):
		return {
			"attempted": true,
			"ok": false,
			"clicked": false,
			"reason": "native_shell_missing",
		}
	var chat_button := _find_mainline_visual_smoke_visible_button(_native_shell, "ChatButton")
	if chat_button == null:
		return {
			"attempted": true,
			"ok": false,
			"clicked": false,
			"reason": "chat_button_missing",
		}
	var chat_visible_before := _main_chat_overlay != null and is_instance_valid(_main_chat_overlay) and (_main_chat_overlay as CanvasItem).visible
	chat_button.emit_signal("pressed")
	await get_tree().process_frame
	await get_tree().process_frame
	await get_tree().create_timer(0.25).timeout
	var chat_visible_after_open := _main_chat_overlay != null and is_instance_valid(_main_chat_overlay) and (_main_chat_overlay as CanvasItem).visible
	var close_button: Button = null
	if chat_visible_after_open:
		close_button = _find_mainline_visual_smoke_visible_button(_main_chat_overlay, "CloseButton")
	var chat_overlay_layout_summary := _read_mainline_visual_smoke_chat_overlay_layout_summary(close_button) if chat_visible_after_open else {
		"ok": false,
		"reason": "chat_overlay_not_open",
	}
	var chat_overlay_layout_ok := bool(chat_overlay_layout_summary.get("ok", false))
	if close_button != null:
		close_button.emit_signal("pressed")
		await get_tree().process_frame
		await get_tree().process_frame
		await get_tree().create_timer(0.15).timeout
	var chat_visible_after_close := _main_chat_overlay != null and is_instance_valid(_main_chat_overlay) and (_main_chat_overlay as CanvasItem).visible
	var close_ok := close_button != null and not chat_visible_after_close
	return {
		"attempted": true,
		"ok": (not chat_visible_before) and chat_visible_after_open and chat_overlay_layout_ok and close_ok,
		"clicked": true,
		"reason": "shell_chat_opened_and_closed" if (not chat_visible_before) and chat_visible_after_open and chat_overlay_layout_ok and close_ok else "shell_chat_flow_failed",
		"chatOverlayVisibleBefore": chat_visible_before,
		"chatOverlayVisibleAfterOpen": chat_visible_after_open,
		"chatOverlayVisibleAfterClose": chat_visible_after_close,
		"closeButtonFound": close_button != null,
		"chatOverlayLayout": chat_overlay_layout_summary,
	}

func _press_mainline_visual_smoke_ai_panel_open_chat_channel(panel_id: String) -> Dictionary:
	if panel_id != "ai_hub" or _active_panel_id != "ai_hub":
		return {
			"attempted": true,
			"ok": false,
			"clicked": false,
			"reason": "active_panel_not_ai_hub",
			"panelId": panel_id,
			"activePanelId": _active_panel_id,
		}
	if _active_overlay_panel == null or not is_instance_valid(_active_overlay_panel):
		return {
			"attempted": true,
			"ok": false,
			"clicked": false,
			"reason": "overlay_missing",
			"activePanelId": _active_panel_id,
		}
	_set_active_overlay_panel_page("context")
	_refresh_overlay_panel_state()
	_reset_mainline_visual_smoke_overlay_scroll()
	await get_tree().process_frame
	await get_tree().process_frame
	await get_tree().create_timer(0.15).timeout
	var open_chat_button := _find_mainline_visual_smoke_visible_button_by_text(_active_overlay_panel, "打开聊天频道")
	if open_chat_button == null:
		return {
			"attempted": true,
			"ok": false,
			"clicked": false,
			"reason": "open_chat_button_missing",
			"activePanelId": _active_panel_id,
		}
	if open_chat_button.disabled:
		return {
			"attempted": true,
			"ok": false,
			"clicked": false,
			"reason": "open_chat_button_disabled",
			"activePanelId": _active_panel_id,
		}
	var chat_visible_before := _main_chat_overlay != null and is_instance_valid(_main_chat_overlay) and (_main_chat_overlay as CanvasItem).visible
	open_chat_button.emit_signal("pressed")
	await get_tree().process_frame
	await get_tree().process_frame
	await get_tree().create_timer(0.25).timeout
	var panel_closed := _active_panel_id == "" and (_active_overlay_panel == null or not is_instance_valid(_active_overlay_panel))
	var chat_visible_after := _main_chat_overlay != null and is_instance_valid(_main_chat_overlay) and (_main_chat_overlay as CanvasItem).visible
	return {
		"attempted": true,
		"ok": panel_closed and chat_visible_after,
		"clicked": true,
		"reason": "chat_channel_open" if panel_closed and chat_visible_after else "chat_channel_not_visible",
		"panelClosed": panel_closed,
		"chatOverlayVisibleBefore": chat_visible_before,
		"chatOverlayVisibleAfter": chat_visible_after,
		"activePanelId": _active_panel_id,
	}

func _find_mainline_visual_smoke_visible_button(root: Node, target_name: String) -> Button:
	if root == null:
		return null
	var root_button := root as Button
	if root_button != null and root_button.name == target_name and root_button.visible and root_button.is_visible_in_tree():
		return root_button
	for child in root.get_children():
		var found := _find_mainline_visual_smoke_visible_button(child, target_name)
		if found != null:
			return found
	return null

func _find_mainline_visual_smoke_visible_button_by_text(root: Node, target_text: String) -> Button:
	if root == null:
		return null
	var root_button := root as Button
	if root_button != null and root_button.text.strip_edges() == target_text and root_button.visible and root_button.is_visible_in_tree():
		return root_button
	for child in root.get_children():
		var found := _find_mainline_visual_smoke_visible_button_by_text(child, target_text)
		if found != null:
			return found
	return null

func _find_mainline_visual_smoke_visible_button_by_name_prefix(root: Node, name_prefix: String) -> Button:
	if root == null:
		return null
	var root_button := root as Button
	if root_button != null and str(root_button.name).begins_with(name_prefix) and root_button.visible and root_button.is_visible_in_tree():
		return root_button
	for child in root.get_children():
		var found := _find_mainline_visual_smoke_visible_button_by_name_prefix(child, name_prefix)
		if found != null:
			return found
	return null

func _read_mainline_visual_smoke_shell_nav_layout_summary() -> Dictionary:
	if _native_shell == null or not is_instance_valid(_native_shell):
		return {"ok": false, "reason": "native_shell_missing"}
	var nav_buttons := _native_shell.get_node_or_null("BottomNav/BottomMargin/BottomRow/MainNav/NavButtons") as Control
	if nav_buttons == null:
		return {"ok": false, "reason": "nav_buttons_missing"}
	var bottom_nav := _native_shell.get_node_or_null("BottomNav") as Control
	var tracked_button_names := [
		"ChatButton",
		"RecruitButton",
		"GeneralsButton",
		"AllianceButton",
		"AiHubButton",
		"BagButton",
		"SettingsButton",
		"InteriorButton",
		"WarButton",
	]
	var required_visible_names := [
		"ChatButton",
		"RecruitButton",
		"GeneralsButton",
		"AllianceButton",
		"AiHubButton",
	]
	var button_summaries: Array = []
	var visible_rects: Array = []
	var missing_visible_required: Array = []
	for button_name in tracked_button_names:
		var button := nav_buttons.get_node_or_null(str(button_name)) as Button
		if button == null:
			if required_visible_names.has(button_name):
				missing_visible_required.append(button_name)
			button_summaries.append({
				"name": button_name,
				"exists": false,
				"visible": false,
			})
			continue
		var is_visible := button.visible and button.is_visible_in_tree()
		var rect := button.get_global_rect()
		if required_visible_names.has(button_name) and not is_visible:
			missing_visible_required.append(button_name)
		button_summaries.append({
			"name": button_name,
			"exists": true,
			"visible": is_visible,
			"disabled": button.disabled,
			"text": button.text,
			"rect": _rect_to_mainline_visual_smoke_dict(rect),
		})
		if is_visible:
			visible_rects.append({
				"name": button_name,
				"rect": rect,
			})
	var overlaps: Array = []
	for index in range(visible_rects.size()):
		var left := visible_rects[index] as Dictionary
		var left_rect: Rect2 = left.get("rect", Rect2())
		for other_index in range(index + 1, visible_rects.size()):
			var right := visible_rects[other_index] as Dictionary
			var right_rect: Rect2 = right.get("rect", Rect2())
			if _mainline_visual_smoke_rects_overlap(left_rect, right_rect):
				overlaps.append({
					"a": str(left.get("name", "")),
					"b": str(right.get("name", "")),
				})
	return {
		"ok": missing_visible_required.is_empty() and overlaps.is_empty(),
		"navButtonsRect": _rect_to_mainline_visual_smoke_dict(nav_buttons.get_global_rect()),
		"bottomNavRect": _rect_to_mainline_visual_smoke_dict(bottom_nav.get_global_rect()) if bottom_nav != null else {},
		"visibleButtonCount": visible_rects.size(),
		"missingVisibleRequired": missing_visible_required,
		"overlaps": overlaps,
		"buttons": button_summaries,
	}

func _read_mainline_visual_smoke_chat_overlay_layout_summary(close_button: Button) -> Dictionary:
	if _main_chat_overlay == null or not is_instance_valid(_main_chat_overlay):
		return {"ok": false, "reason": "chat_overlay_missing"}
	var chat_panel := _main_chat_overlay.get_node_or_null("ChatPanel") as Control
	if chat_panel == null:
		return {"ok": false, "reason": "chat_panel_missing"}
	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	var panel_rect := chat_panel.get_global_rect()
	var bottom_nav: Control = null
	if _native_shell != null and is_instance_valid(_native_shell):
		bottom_nav = _native_shell.get_node_or_null("BottomNav") as Control
	var bottom_nav_visible := bottom_nav != null and bottom_nav.visible and bottom_nav.is_visible_in_tree()
	var bottom_nav_rect := bottom_nav.get_global_rect() if bottom_nav_visible else Rect2()
	var overlaps_bottom_nav := bottom_nav_visible and _mainline_visual_smoke_rects_overlap(panel_rect, bottom_nav_rect)
	var covers_bottom_nav_vertical := (
		not bottom_nav_visible
		or (
			panel_rect.position.y <= bottom_nav_rect.position.y + 0.5
			and panel_rect.position.y + panel_rect.size.y >= bottom_nav_rect.position.y + bottom_nav_rect.size.y - 0.5
		)
	)
	var close_button_visible := close_button != null and close_button.visible and close_button.is_visible_in_tree()
	var close_button_rect := close_button.get_global_rect() if close_button_visible else Rect2()
	var close_button_touch_ok := close_button_visible and close_button_rect.size.x >= 112.0 and close_button_rect.size.y >= 52.0
	var panel_inside_viewport: bool = (
		panel_rect.position.x >= -0.5
		and panel_rect.position.y >= -0.5
		and panel_rect.position.x + panel_rect.size.x <= viewport_size.x + 0.5
		and panel_rect.position.y + panel_rect.size.y <= viewport_size.y + 0.5
	)
	return {
		"ok": panel_inside_viewport and overlaps_bottom_nav and covers_bottom_nav_vertical and close_button_touch_ok,
		"panelRect": _rect_to_mainline_visual_smoke_dict(panel_rect),
		"bottomNavVisible": bottom_nav_visible,
		"bottomNavRect": _rect_to_mainline_visual_smoke_dict(bottom_nav_rect) if bottom_nav_visible else {},
		"overlapsBottomNav": overlaps_bottom_nav,
		"coversBottomNavVertical": covers_bottom_nav_vertical,
		"closeButtonVisible": close_button_visible,
		"closeButtonRect": _rect_to_mainline_visual_smoke_dict(close_button_rect) if close_button_visible else {},
		"closeButtonTouchOk": close_button_touch_ok,
		"panelInsideViewport": panel_inside_viewport,
		"viewport": {
			"w": viewport_size.x,
			"h": viewport_size.y,
		},
	}

func _read_mainline_visual_smoke_overlay_panel_layout_summary(panel_id: String) -> Dictionary:
	var enforced := _is_mainline_visual_smoke_world_event_family_panel(panel_id)
	if _active_overlay_panel == null or not is_instance_valid(_active_overlay_panel):
		return {
			"ok": not enforced,
			"enforced": enforced,
			"reason": "active_overlay_missing",
		}
	var panel_control := _active_overlay_panel as Control
	if panel_control == null:
		return {
			"ok": not enforced,
			"enforced": enforced,
			"reason": "active_overlay_not_control",
		}
	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	var panel_rect := panel_control.get_global_rect()
	var panel_visible := panel_control.visible and panel_control.is_visible_in_tree()
	var panel_inside_viewport := _mainline_visual_smoke_rect_inside_viewport(panel_rect, viewport_size)
	var active_page_id := ""
	if panel_control.has_method("get_active_page_id"):
		active_page_id = str(panel_control.call("get_active_page_id")).strip_edges()
	var expected_active_page_id := _resolve_mainline_visual_smoke_expected_active_page_id(panel_id)
	var active_page_ok := expected_active_page_id == "" or active_page_id == expected_active_page_id
	var close_button := _find_mainline_visual_smoke_visible_button(panel_control, "CloseButton")
	var close_button_visible := close_button != null
	var close_button_rect := close_button.get_global_rect() if close_button_visible else Rect2()
	var close_button_touch_ok := close_button_visible and close_button_rect.size.x >= 112.0 and close_button_rect.size.y >= 52.0
	var back_button := _find_mainline_visual_smoke_visible_button(panel_control, "BackButton")
	var back_button_visible := back_button != null
	var back_button_rect := back_button.get_global_rect() if back_button_visible else Rect2()
	var back_button_touch_ok := not back_button_visible or (back_button_rect.size.x >= 172.0 and back_button_rect.size.y >= 52.0)
	var tab_strip := panel_control.find_child("TabStrip", true, false) as Control
	var tab_strip_visible := tab_strip != null and tab_strip.visible and tab_strip.is_visible_in_tree()
	var tab_strip_rect := tab_strip.get_global_rect() if tab_strip_visible else Rect2()
	var tab_strip_inside_viewport := not tab_strip_visible or _mainline_visual_smoke_rect_inside_viewport(tab_strip_rect, viewport_size)
	var tab_strip_width_ok := not tab_strip_visible or tab_strip_rect.size.x <= viewport_size.x + 0.5
	var scroll_summary := _read_mainline_visual_smoke_overlay_scroll_summary(panel_control, viewport_size)
	var has_visible_scroll := bool(scroll_summary.get("hasVisibleUsableScroll", false))
	var scroll_height_ok := bool(scroll_summary.get("usableScrollHeightOk", false))
	var placeholder_hits := _collect_mainline_visual_smoke_visible_text_hits(panel_control, [
		"开发中空壳",
		"Under Construction",
		"under-construction",
	])
	var scroll_ok := has_visible_scroll and scroll_height_ok if enforced else true
	var layout_ok := (
		panel_visible
		and panel_inside_viewport
		and close_button_touch_ok
		and back_button_touch_ok
		and tab_strip_inside_viewport
		and tab_strip_width_ok
		and scroll_ok
		and active_page_ok
		and placeholder_hits.is_empty()
	)
	return {
		"ok": layout_ok if enforced else true,
		"enforced": enforced,
		"layoutOk": layout_ok,
		"panelId": panel_id,
		"activePageId": active_page_id,
		"expectedActivePageId": expected_active_page_id,
		"activePageOk": active_page_ok,
		"panelVisible": panel_visible,
		"panelRect": _rect_to_mainline_visual_smoke_dict(panel_rect),
		"panelInsideViewport": panel_inside_viewport,
		"viewport": {
			"w": viewport_size.x,
			"h": viewport_size.y,
		},
		"closeButtonVisible": close_button_visible,
		"closeButtonRect": _rect_to_mainline_visual_smoke_dict(close_button_rect) if close_button_visible else {},
		"closeButtonTouchOk": close_button_touch_ok,
		"backButtonVisible": back_button_visible,
		"backButtonRect": _rect_to_mainline_visual_smoke_dict(back_button_rect) if back_button_visible else {},
		"backButtonTouchOk": back_button_touch_ok,
		"tabStripVisible": tab_strip_visible,
		"tabStripRect": _rect_to_mainline_visual_smoke_dict(tab_strip_rect) if tab_strip_visible else {},
		"tabStripInsideViewport": tab_strip_inside_viewport,
		"tabStripWidthOk": tab_strip_width_ok,
		"scroll": scroll_summary,
		"scrollRequired": enforced,
		"scrollOk": scroll_ok,
		"scrollHeightOk": scroll_height_ok,
		"placeholderHits": placeholder_hits,
	}

func _is_mainline_visual_smoke_world_event_family_panel(panel_id: String) -> bool:
	return panel_id == "world" or WORLD_EVENT_ACTIVITY_PANEL_IDS.has(panel_id)

func _resolve_mainline_visual_smoke_expected_active_page_id(panel_id: String) -> String:
	match panel_id:
		"event", "world", "world_event", "world_affairs":
			return "world_affairs"
		"tasks":
			return "tasks"
		"faction_status":
			return "faction_status"
		"activity":
			return "activities"
		_:
			return ""

func _read_mainline_visual_smoke_overlay_scroll_summary(root: Node, viewport_size: Vector2) -> Dictionary:
	var scrolls: Array = []
	var usable_scroll_count := _collect_mainline_visual_smoke_overlay_scrolls(root, scrolls, viewport_size)
	var max_usable_scroll_height := 0.0
	for scroll_entry_variant in scrolls:
		if not (scroll_entry_variant is Dictionary):
			continue
		var scroll_entry := scroll_entry_variant as Dictionary
		if bool(scroll_entry.get("usable", false)):
			max_usable_scroll_height = maxf(max_usable_scroll_height, float(scroll_entry.get("usableHeight", 0.0)))
	var usable_scroll_min_height := _resolve_mainline_visual_smoke_overlay_scroll_min_height(viewport_size)
	return {
		"hasVisibleScroll": not scrolls.is_empty(),
		"hasVisibleUsableScroll": usable_scroll_count > 0,
		"visibleScrollCount": scrolls.size(),
		"visibleUsableScrollCount": usable_scroll_count,
		"maxUsableScrollHeight": max_usable_scroll_height,
		"usableScrollMinHeight": usable_scroll_min_height,
		"usableScrollHeightOk": max_usable_scroll_height >= usable_scroll_min_height,
		"scrolls": scrolls,
	}

func _resolve_mainline_visual_smoke_overlay_scroll_min_height(viewport_size: Vector2) -> float:
	if viewport_size.x <= 1024.0 and viewport_size.y <= 620.0:
		return 240.0
	if viewport_size.y <= 720.0:
		return 280.0
	return 300.0

func _collect_mainline_visual_smoke_overlay_scrolls(node: Node, scrolls: Array, viewport_size: Vector2) -> int:
	var usable_scroll_count := 0
	if node is ScrollContainer:
		var scroll := node as ScrollContainer
		if scroll.visible and scroll.is_visible_in_tree():
			var rect := scroll.get_global_rect()
			var inside_viewport := _mainline_visual_smoke_rect_inside_viewport(rect, viewport_size)
			var usable := inside_viewport and rect.size.x >= 120.0 and rect.size.y >= 64.0
			scrolls.append({
				"name": str(scroll.name),
				"path": str(scroll.get_path()),
				"rect": _rect_to_mainline_visual_smoke_dict(rect),
				"horizontalScrollMode": int(scroll.horizontal_scroll_mode),
				"verticalScrollMode": int(scroll.vertical_scroll_mode),
				"scrollHorizontal": scroll.scroll_horizontal,
				"scrollVertical": scroll.scroll_vertical,
				"insideViewport": inside_viewport,
				"usable": usable,
				"usableHeight": rect.size.y if usable else 0.0,
			})
			if usable:
				usable_scroll_count += 1
	for child in node.get_children():
		usable_scroll_count += _collect_mainline_visual_smoke_overlay_scrolls(child, scrolls, viewport_size)
	return usable_scroll_count

func _collect_mainline_visual_smoke_visible_text_hits(root: Node, needles: Array) -> Array:
	var hits: Array = []
	_collect_mainline_visual_smoke_visible_text_hits_recursive(root, needles, hits)
	return hits

func _collect_mainline_visual_smoke_visible_text_hits_recursive(node: Node, needles: Array, hits: Array) -> void:
	if node is CanvasItem:
		var canvas_item := node as CanvasItem
		if not canvas_item.visible or not canvas_item.is_visible_in_tree():
			return
	var text_value := ""
	if node is Label:
		text_value = (node as Label).text
	elif node is Button:
		text_value = (node as Button).text
	elif node is RichTextLabel:
		text_value = (node as RichTextLabel).text
	if text_value != "":
		for needle_variant in needles:
			var needle := str(needle_variant)
			if needle != "" and text_value.find(needle) >= 0:
				hits.append({
					"path": str(node.get_path()),
					"needle": needle,
					"text": text_value.substr(0, 80),
				})
	for child in node.get_children():
		_collect_mainline_visual_smoke_visible_text_hits_recursive(child, needles, hits)

func _mainline_visual_smoke_rect_inside_viewport(rect: Rect2, viewport_size: Vector2) -> bool:
	return (
		rect.position.x >= -0.5
		and rect.position.y >= -0.5
		and rect.position.x + rect.size.x <= viewport_size.x + 0.5
		and rect.position.y + rect.size.y <= viewport_size.y + 0.5
	)

func _rect_to_mainline_visual_smoke_dict(rect: Rect2) -> Dictionary:
	return {
		"x": rect.position.x,
		"y": rect.position.y,
		"w": rect.size.x,
		"h": rect.size.y,
	}

func _mainline_visual_smoke_rects_overlap(left: Rect2, right: Rect2) -> bool:
	var epsilon := 0.5
	return (
		left.position.x < right.position.x + right.size.x - epsilon
		and left.position.x + left.size.x > right.position.x + epsilon
		and left.position.y < right.position.y + right.size.y - epsilon
		and left.position.y + left.size.y > right.position.y + epsilon
	)

func _wait_for_mainline_visual_smoke_ai_panel_refresh(panel_id: String) -> Dictionary:
	var summary := _read_mainline_visual_smoke_ai_panel_status_summary()
	if panel_id != "ai_hub":
		summary["attempted"] = false
		summary["reason"] = "not_ai_panel"
		return summary
	if _active_panel_id != "ai_hub" or _active_overlay_panel == null or not is_instance_valid(_active_overlay_panel):
		summary["attempted"] = false
		summary["reason"] = "ai_panel_not_open"
		return summary
	summary["attempted"] = true
	await _on_snapshot_overlay_page_action_requested("players", "ai_players_refresh")
	_refresh_overlay_panel_state()
	_reset_mainline_visual_smoke_overlay_scroll()
	await get_tree().process_frame
	await get_tree().process_frame
	var deadline_msec := Time.get_ticks_msec() + 6000
	while Time.get_ticks_msec() < deadline_msec:
		var next_summary := _read_mainline_visual_smoke_ai_panel_status_summary()
		summary["playerRuntimeCount"] = int(next_summary.get("playerRuntimeCount", 0))
		summary["modelStatusVisible"] = bool(next_summary.get("modelStatusVisible", false))
		summary["modelName"] = str(next_summary.get("modelName", ""))
		summary["source"] = str(next_summary.get("source", ""))
		summary["budgetTier"] = str(next_summary.get("budgetTier", ""))
		summary["secretConfigured"] = bool(next_summary.get("secretConfigured", false))
		summary["fallbackEnabled"] = bool(next_summary.get("fallbackEnabled", false))
		if bool(summary.get("modelStatusVisible", false)):
			summary["reason"] = "model_status_visible"
			_refresh_overlay_panel_state()
			_set_active_overlay_panel_page("players")
			_reset_mainline_visual_smoke_overlay_scroll()
			await get_tree().process_frame
			return summary
		await get_tree().create_timer(0.1).timeout
		_refresh_overlay_panel_state()
		_reset_mainline_visual_smoke_overlay_scroll()
	summary["reason"] = "timeout_waiting_model_status"
	return summary

func _hide_mainline_visual_smoke_observability_panel() -> bool:
	var hidden := false
	var candidates: Array[Node] = []
	if _observability_panel != null and is_instance_valid(_observability_panel):
		candidates.append(_observability_panel)
	var direct_panel := get_node_or_null("ObservabilityPanel")
	if direct_panel != null and is_instance_valid(direct_panel) and not candidates.has(direct_panel):
		candidates.append(direct_panel)
	var found_panel := find_child("ObservabilityPanel", true, false)
	if found_panel != null and is_instance_valid(found_panel) and not candidates.has(found_panel):
		candidates.append(found_panel)
	for candidate in candidates:
		hidden = _hide_mainline_visual_smoke_canvas_items(candidate) or hidden
	return hidden

func _hide_mainline_visual_smoke_canvas_items(node: Node) -> bool:
	var hidden := false
	if node is CanvasItem:
		var canvas_item := node as CanvasItem
		canvas_item.visible = false
		hidden = true
	for child in node.get_children():
		if child is Node:
			hidden = _hide_mainline_visual_smoke_canvas_items(child as Node) or hidden
	return hidden

func _reset_mainline_visual_smoke_overlay_scroll() -> void:
	if _active_overlay_panel == null or not is_instance_valid(_active_overlay_panel):
		return
	_reset_mainline_visual_smoke_scroll_recursive(_active_overlay_panel)

func _reset_mainline_visual_smoke_scroll_recursive(node: Node) -> void:
	if node is ScrollContainer:
		var scroll := node as ScrollContainer
		scroll.scroll_horizontal = 0
		scroll.scroll_vertical = 0
	for child in node.get_children():
		_reset_mainline_visual_smoke_scroll_recursive(child)

func _read_mainline_visual_smoke_ai_panel_status_summary() -> Dictionary:
	var ai_state := WorldStore.get_ai_state(_target_faction_id)
	var runtime_items: Array = []
	var runtime_items_variant: Variant = ai_state.get("playerRuntimeList", [])
	if runtime_items_variant is Array:
		runtime_items = runtime_items_variant as Array
	var summary := {
		"attempted": false,
		"playerRuntimeCount": runtime_items.size(),
		"modelStatusVisible": false,
		"modelName": "",
		"source": "",
		"budgetTier": "",
		"secretConfigured": false,
		"fallbackEnabled": false,
	}
	for runtime_variant in runtime_items:
		if not (runtime_variant is Dictionary):
			continue
		var runtime_item: Dictionary = runtime_variant as Dictionary
		var model_status_variant: Variant = runtime_item.get("modelStatus", {})
		if not (model_status_variant is Dictionary):
			continue
		var model_status: Dictionary = model_status_variant as Dictionary
		if model_status.is_empty():
			continue
		summary["modelStatusVisible"] = true
		summary["modelName"] = _first_non_empty_runtime_value(
			model_status.get("activeModel", model_status.get("modelName", "")),
			model_status.get("model", model_status.get("targetModel", ""))
		)
		summary["source"] = _first_non_empty_runtime_value(
			model_status.get("source", model_status.get("modelSource", "")),
			model_status.get("activeProvider", model_status.get("provider", ""))
		)
		summary["budgetTier"] = str(model_status.get("budgetTier", model_status.get("budget", ""))).strip_edges()
		summary["secretConfigured"] = bool(model_status.get("secretConfigured", model_status.get("hasSecret", false)))
		summary["fallbackEnabled"] = bool(model_status.get("fallbackEnabled", false))
		return summary
	return summary

func _save_mainline_visual_smoke_screenshot(screenshot_path: String) -> Dictionary:
	if screenshot_path == "":
		return {"ok": false, "error": ERR_UNCONFIGURED, "message": "SLG_MAINLINE_VISUAL_SMOKE_SCREENSHOT is empty"}
	var dir_error := _ensure_absolute_parent_dir(screenshot_path)
	if dir_error != OK:
		return {"ok": false, "error": dir_error, "path": screenshot_path, "message": "failed to create screenshot dir"}
	var image: Image = get_viewport().get_texture().get_image()
	var save_error := image.save_png(screenshot_path)
	return {
		"ok": save_error == OK,
		"error": save_error,
		"path": screenshot_path,
		"width": image.get_width(),
		"height": image.get_height(),
	}

func _write_mainline_visual_smoke_report(report_path: String, payload: Dictionary) -> void:
	if report_path == "":
		push_warning("[mainline-visual-smoke] report path empty")
		return
	var dir_error := _ensure_absolute_parent_dir(report_path)
	if dir_error != OK:
		push_warning("[mainline-visual-smoke] failed to create report dir: %s" % str(dir_error))
		return
	var file := FileAccess.open(report_path, FileAccess.WRITE)
	if file == null:
		push_warning("[mainline-visual-smoke] failed to open report: %s" % str(FileAccess.get_open_error()))
		return
	file.store_string(JSON.stringify(payload, "\t"))
	file.close()

func _read_main_city_hub_visual_smoke_summary() -> Dictionary:
	if _main_city_hub_overlay == null or not is_instance_valid(_main_city_hub_overlay):
		return {"visible": false, "expanded": false, "reason": "missing"}
	if _main_city_hub_overlay.has_method("get_context_summary"):
		var summary: Variant = _main_city_hub_overlay.call("get_context_summary")
		if summary is Dictionary:
			var hub_summary: Dictionary = summary as Dictionary
			if not _last_player_home_city_node_context.is_empty():
				hub_summary["lastMapNodeClick"] = _last_player_home_city_node_context.duplicate(true)
			return hub_summary
	return {"visible": bool(_main_city_hub_overlay.visible), "expanded": false}

func _ensure_absolute_parent_dir(file_path: String) -> Error:
	var normalized_path := file_path.replace("\\", "/")
	var slash_index := normalized_path.rfind("/")
	if slash_index <= 0:
		return OK
	var dir_path := normalized_path.substr(0, slash_index)
	return DirAccess.make_dir_recursive_absolute(dir_path)

func _connect_ui_actions() -> void:
	var refresh_callback := Callable(self, "_on_refresh_world_pressed")
	if _refresh_button != null and not _refresh_button.pressed.is_connected(refresh_callback):
		_refresh_button.pressed.connect(refresh_callback)

	var advance_callback := Callable(self, "_on_advance_tick_pressed")
	if _advance_tick_button != null and not _advance_tick_button.pressed.is_connected(advance_callback):
		_advance_tick_button.pressed.connect(advance_callback)
func _connect_shell_actions() -> void:
	if _native_shell == null:
		return
	if _native_shell.has_signal("mode_toggle_requested"):
		var mode_callback := Callable(self, "_on_shell_mode_toggle_requested")
		if not _native_shell.mode_toggle_requested.is_connected(mode_callback):
			_native_shell.mode_toggle_requested.connect(mode_callback)
	if _native_shell.has_signal("shell_action_requested"):
		var action_callback := Callable(self, "_on_shell_action_requested")
		if not _native_shell.shell_action_requested.is_connected(action_callback):
			_native_shell.shell_action_requested.connect(action_callback)
	if _native_shell.has_signal("troop_slot_requested"):
		var troop_callback := Callable(self, "_on_shell_troop_slot_requested")
		if not _native_shell.troop_slot_requested.is_connected(troop_callback):
			_native_shell.troop_slot_requested.connect(troop_callback)
	if _native_shell.has_signal("interior_tab_requested"):
		var interior_tab_callback := Callable(self, "_on_shell_interior_tab_requested")
		if not _native_shell.interior_tab_requested.is_connected(interior_tab_callback):
			_native_shell.interior_tab_requested.connect(interior_tab_callback)

func _connect_main_city_hub_actions() -> void:
	if _main_city_hub_overlay == null:
		return
	if _main_city_hub_overlay.has_method("configure"):
		_main_city_hub_overlay.call("configure", _map_grid)
	if _main_city_hub_overlay.has_signal("hub_entry_requested"):
		var hub_callback := Callable(self, "_on_main_city_hub_entry_requested")
		if not _main_city_hub_overlay.is_connected("hub_entry_requested", hub_callback):
			_main_city_hub_overlay.connect("hub_entry_requested", hub_callback)
	if _map_grid != null and _map_grid.has_signal("player_home_city_node_clicked"):
		var map_city_callback := Callable(self, "_on_player_home_city_node_clicked")
		if not _map_grid.is_connected("player_home_city_node_clicked", map_city_callback):
			_map_grid.connect("player_home_city_node_clicked", map_city_callback)

func _connect_main_chat_actions() -> void:
	if _main_chat_overlay == null:
		return
	if _main_chat_overlay.has_signal("close_requested"):
		var close_callback := Callable(self, "_on_main_chat_overlay_close_requested")
		if not _main_chat_overlay.is_connected("close_requested", close_callback):
			_main_chat_overlay.connect("close_requested", close_callback)

func _connect_panel_host_actions() -> void:
	if _full_screen_panel_host == null:
		return
	if _full_screen_panel_host.has_signal("back_requested"):
		var back_callback := Callable(self, "_on_panel_host_back_requested")
		if not _full_screen_panel_host.back_requested.is_connected(back_callback):
			_full_screen_panel_host.back_requested.connect(back_callback)
	if _full_screen_panel_host.has_signal("close_requested"):
		var close_callback := Callable(self, "_on_panel_host_close_requested")
		if not _full_screen_panel_host.close_requested.is_connected(close_callback):
			_full_screen_panel_host.close_requested.connect(close_callback)
	if _full_screen_panel_host.has_signal("tab_selected"):
		var tab_callback := Callable(self, "_on_panel_host_tab_selected")
		if not _full_screen_panel_host.tab_selected.is_connected(tab_callback):
			_full_screen_panel_host.tab_selected.connect(tab_callback)

func _connect_world_store_actions() -> void:
	if WorldStore == null or not WorldStore.has_signal("slg_domain_state_updated"):
		return
	var domain_callback := Callable(self, "_on_slg_domain_state_updated")
	if not WorldStore.is_connected("slg_domain_state_updated", domain_callback):
		WorldStore.connect("slg_domain_state_updated", domain_callback)

func _on_panel_host_back_requested() -> void:
	_close_active_panel("back")

func _on_panel_host_close_requested() -> void:
	_close_active_panel("close")

func _on_panel_host_tab_selected(tab_id: String) -> void:
	if tab_id.strip_edges() == "":
		return
	_active_panel_tab_id = tab_id
	_refresh_active_panel_content()
	_apply_overlay_feedback(
		"panel/%s/%s" % [_active_panel_id, _active_panel_tab_id],
		"tab",
		"panel %s / %s" % [_active_panel_id, _active_panel_tab_id]
	)

func _on_slg_domain_state_updated(_next_state: Dictionary) -> void:
	if _active_panel_id == "":
		return
	_refresh_active_panel_content()

func _open_fixed_panel(action_id: String) -> void:
	if action_id == "mail" or action_id == "alliance" or action_id == "interior" or action_id == "troop" or action_id == "recruit" or action_id == "generals" or action_id == "ai_hub" or WORLD_EVENT_ACTIVITY_PANEL_IDS.has(action_id):
		_open_overlay_panel_with_page(action_id)
		return
	if _full_screen_panel_host == null:
		return
	_dispose_overlay_panel()
	var panel_config: Dictionary = _build_panel_config(action_id)
	_active_panel_id = action_id
	var tabs: Array = panel_config.get("tabs", []) as Array
	_active_panel_tab_id = str(panel_config.get("defaultTabId", ""))
	if _active_panel_tab_id == "" and not tabs.is_empty():
		var first_tab: Variant = tabs[0]
		if first_tab is Dictionary:
			_active_panel_tab_id = str((first_tab as Dictionary).get("id", ""))
	_full_screen_panel_host.visible = true
	_full_screen_panel_host.call("set_panel_title", str(panel_config.get("title", "功能面板")))
	_full_screen_panel_host.call("set_back_button_label", str(panel_config.get("backLabel", "返回主壳")))
	_full_screen_panel_host.call("set_close_button_label", str(panel_config.get("closeLabel", "关闭")))
	_full_screen_panel_host.call("set_empty_state_text", str(panel_config.get("empty_state_text", "正在准备功能面板。")))
	_full_screen_panel_host.call("set_tabs", tabs)
	if _active_panel_tab_id != "":
		_full_screen_panel_host.call("set_active_tab", _active_panel_tab_id)
	_refresh_active_panel_content()
	if _full_screen_panel_host.has_method("focus_first_action"):
		_full_screen_panel_host.call("focus_first_action")
	_record_last_action("panel/%s" % action_id, "opened")
	_update_runtime_label("panel %s" % str(panel_config.get("title", action_id)))

func _close_active_panel(reason: String) -> void:
	_hide_inline_panel_host()
	_dispose_overlay_panel()
	var active_overlay_spec := _resolve_active_snapshot_overlay_spec()
	if _active_panel_id != "":
		_apply_overlay_feedback("panel/%s" % _active_panel_id, reason, "")
	_apply_overlay_runtime_state_patch(_resolve_overlay_runtime_helper().build_close_runtime_patch(active_overlay_spec))
	_active_panel_id = ""
	_active_panel_tab_id = ""
	_update_runtime_label("panel closed")

func _refresh_active_panel_content() -> void:
	if _active_panel_id == "":
		return
	if _active_overlay_panel != null and is_instance_valid(_active_overlay_panel):
		_refresh_overlay_panel_state()
		return
	if _full_screen_panel_host == null:
		return
	var content := _build_panel_content(_active_panel_id, _active_panel_tab_id)
	if content == null:
		_full_screen_panel_host.call("show_empty_state")
		return
	_replace_panel_content(content)

func _replace_panel_content(content: Control) -> void:
	_dispose_generated_panel_content()
	_generated_panel_content = content
	_full_screen_panel_host.call("set_content_node", content)

func _dispose_generated_panel_content() -> void:
	if _generated_panel_content == null:
		return
	if is_instance_valid(_generated_panel_content):
		if _generated_panel_content.get_parent() != null:
			_generated_panel_content.get_parent().remove_child(_generated_panel_content)
		_generated_panel_content.queue_free()
	_generated_panel_content = null

func _hide_inline_panel_host() -> void:
	if _full_screen_panel_host == null:
		return
	_dispose_generated_panel_content()
	if _full_screen_panel_host.has_method("clear_content"):
		_full_screen_panel_host.call("clear_content")
	_full_screen_panel_host.visible = false

func _dispose_overlay_panel() -> void:
	if _active_overlay_panel == null:
		return
	if is_instance_valid(_active_overlay_panel):
		if _active_overlay_panel.get_parent() != null:
			_active_overlay_panel.get_parent().remove_child(_active_overlay_panel)
		_active_overlay_panel.queue_free()
	_active_overlay_panel = null

func _open_snapshot_overlay(
	scene: PackedScene,
	setter_method: String,
	snapshot: Dictionary,
	page_handler: String,
	action_handler: String = "",
	extra_signal_handlers: Dictionary = {}
) -> Control:
	var panel_instance := scene.instantiate()
	var panel_control := panel_instance as Control
	if panel_control == null:
		return null
	_active_overlay_panel = panel_control
	_ui_layer.add_child(panel_control)
	panel_control.visible = true
	panel_control.z_index = 200
	panel_control.mouse_filter = Control.MOUSE_FILTER_STOP
	panel_control.set_anchors_preset(Control.PRESET_FULL_RECT)
	if panel_control.has_method(setter_method):
		panel_control.call(setter_method, snapshot)
	if panel_control.has_signal("back_requested"):
		var back_callback := Callable(self, "_on_overlay_panel_back_requested")
		if not panel_control.is_connected("back_requested", back_callback):
			panel_control.connect("back_requested", back_callback)
	if panel_control.has_signal("close_requested"):
		var close_callback := Callable(self, "_on_overlay_panel_close_requested")
		if not panel_control.is_connected("close_requested", close_callback):
			panel_control.connect("close_requested", close_callback)
	if page_handler != "" and panel_control.has_signal("page_changed"):
		var page_callback := Callable(self, page_handler)
		if not panel_control.is_connected("page_changed", page_callback):
			panel_control.connect("page_changed", page_callback)
	if action_handler != "" and panel_control.has_signal("page_action_requested"):
		var action_callback := Callable(self, action_handler)
		if not panel_control.is_connected("page_action_requested", action_callback):
			panel_control.connect("page_action_requested", action_callback)
	for signal_name_variant in extra_signal_handlers.keys():
		var signal_name := str(signal_name_variant).strip_edges()
		var handler_spec: Variant = extra_signal_handlers.get(signal_name_variant, "")
		var extra_callback := Callable()
		if signal_name == "":
			continue
		if not panel_control.has_signal(signal_name):
			continue
		if handler_spec is Dictionary:
			var handler_payload: Dictionary = handler_spec as Dictionary
			var handler_name := str(handler_payload.get("handler", "")).strip_edges()
			if handler_name == "":
				continue
			extra_callback = Callable(self, handler_name)
			var bind_args_variant: Variant = handler_payload.get("bind_args", [])
			if bind_args_variant is Array and not (bind_args_variant as Array).is_empty():
				extra_callback = extra_callback.bindv(bind_args_variant as Array)
		else:
			var handler_name := str(handler_spec).strip_edges()
			if handler_name == "":
				continue
			extra_callback = Callable(self, handler_name)
		if not panel_control.is_connected(signal_name, extra_callback):
			panel_control.connect(signal_name, extra_callback)
	return panel_control

func _refresh_snapshot_overlay(setter_method: String, snapshot: Dictionary) -> void:
	if _active_overlay_panel == null or not is_instance_valid(_active_overlay_panel):
		return
	if _active_overlay_panel.has_method(setter_method):
		_active_overlay_panel.call(setter_method, snapshot)

func _resolve_snapshot_overlay_spec(action_id: String) -> Dictionary:
	match action_id:
		"interior":
			return _resolve_overlay_runtime_helper().build_interior_overlay_spec(
				InteriorPanelScene,
				_resolve_internal_affairs_presenter().build_overlay_payload()
			)
		"troop":
			var troop_runtime_state: Dictionary = _resolve_overlay_runtime_helper().snapshot_runtime_state()
			return _resolve_overlay_runtime_helper().build_troop_overlay_spec(
				TroopPanelScene,
				_resolve_troop_panel_presenter().build_overlay_payload(
					str(troop_runtime_state.get("active_troop_panel_unit_id", "")),
					str(troop_runtime_state.get("active_troop_panel_facility_id", "")),
					_build_runtime_panel_context()
				)
			)
		"recruit":
			var recruit_overlay_payload: Dictionary = _resolve_recruit_presenter().build_overlay_payload(_build_runtime_panel_context())
			return _resolve_overlay_runtime_helper().build_basic_snapshot_overlay_spec(
				RecruitPanelScene,
				"set_recruit_snapshot",
				recruit_overlay_payload,
				"panel/recruit",
				"panel 招募",
				"_on_overlay_page_changed",
				"_on_snapshot_overlay_page_action_requested",
				"request_recruit_panel_action"
			)
		"mail":
			var battle_report_overlay_payload: Dictionary = _resolve_battle_report_presenter().build_overlay_payload(_build_runtime_panel_context())
			return _resolve_overlay_runtime_helper().build_basic_snapshot_overlay_spec(
				BattleReportPanelScene,
				"set_battle_report_snapshot",
				battle_report_overlay_payload,
				"panel/mail",
				"panel 战报"
			)
		"generals":
			var general_overlay_payload: Dictionary = _resolve_general_presenter().build_overlay_payload(_build_runtime_panel_context())
			return _resolve_overlay_runtime_helper().build_basic_snapshot_overlay_spec(
				GeneralPanelScene,
				"set_general_snapshot",
				general_overlay_payload,
				"panel/generals",
				"panel 武将",
				"_on_overlay_page_changed",
				"_on_snapshot_overlay_page_action_requested",
				"request_general_panel_action"
			)
		"alliance":
			return {
				"scene": AlliancePanelScene,
				"setter_method": "set_alliance_snapshot",
				"snapshot": _resolve_alliance_presenter().build_snapshot(_build_runtime_panel_context()),
				"page_handler": "_on_overlay_page_changed",
				"action_handler": "_on_snapshot_overlay_page_action_requested",
				"adapter_method": "request_alliance_panel_action",
				"extra_signal_handlers": {},
				"record_key": "panel/alliance",
				"runtime_label": "panel 同盟",
			}
		"ai_hub":
			var ai_overlay_payload: Dictionary = _resolve_ai_panel_presenter().build_overlay_payload(_build_runtime_panel_context())
			return _resolve_overlay_runtime_helper().build_basic_snapshot_overlay_spec(
				AIPanelScene,
				"set_ai_snapshot",
				ai_overlay_payload,
				"panel/ai_hub",
				"panel AI",
				"_on_overlay_page_changed",
				"_on_snapshot_overlay_page_action_requested",
				"request_ai_panel_action"
			)
		"activity", "event", "world_event", "world_affairs", "tasks", "faction_status":
			return _build_world_event_activity_overlay_spec(action_id)
		_:
			return {}

func _build_world_event_activity_overlay_spec(action_id: String) -> Dictionary:
	var snapshot_payload: Dictionary = _resolve_world_event_activity_presenter().build_snapshot(_build_runtime_panel_context())
	var default_page_id := _resolve_world_event_activity_default_page_id(action_id)
	if default_page_id != "":
		snapshot_payload["default_page_id"] = default_page_id
	return _resolve_overlay_runtime_helper().build_basic_snapshot_overlay_spec(
		WorldEventActivityPanelScene,
		"set_world_event_activity_snapshot",
		snapshot_payload,
		"panel/%s" % action_id,
		"panel %s" % _resolve_panel_runtime_label(action_id),
		"_on_overlay_page_changed",
		"_on_world_event_activity_page_action_requested"
	)

func _resolve_world_event_activity_default_page_id(action_id: String) -> String:
	match action_id:
		"event", "world_event", "world_affairs":
			return "world_affairs"
		"tasks":
			return "tasks"
		"faction_status":
			return "faction_status"
		_:
			return "activities"

func _open_overlay_panel(action_id: String) -> void:
	if _ui_layer == null:
		return
	var overlay_spec: Dictionary = _resolve_snapshot_overlay_spec(action_id)
	var overlay_runtime_helper = _resolve_overlay_runtime_helper()
	_hide_inline_panel_host()
	_dispose_overlay_panel()
	_active_panel_id = action_id
	_active_panel_tab_id = ""
	if overlay_spec.is_empty():
		_active_panel_id = ""
		_active_panel_tab_id = ""
		return
	_apply_overlay_runtime_state_patch(overlay_runtime_helper.build_open_overlay_runtime_patch(overlay_spec))
	var panel_control := _open_snapshot_overlay_from_spec(overlay_spec)
	if panel_control == null:
		return
	_apply_overlay_feedback(
		str(overlay_spec.get("record_key", "panel")),
		"opened",
		str(overlay_spec.get("runtime_label", "panel"))
	)

func _refresh_overlay_panel_state() -> void:
	if _active_overlay_panel == null or not is_instance_valid(_active_overlay_panel):
		return
	var apply_payload: Dictionary = _resolve_overlay_runtime_helper().build_active_overlay_refresh_apply_payload_from_state(
		_resolve_active_snapshot_overlay_spec()
	)
	if apply_payload.is_empty():
		return
	_apply_overlay_action_apply_payload(apply_payload)

func _resolve_active_snapshot_overlay_spec() -> Dictionary:
	match _active_panel_id:
		"interior", "troop", "recruit", "generals", "alliance", "ai_hub", "activity", "event", "world_event", "world_affairs", "tasks", "faction_status":
			return _resolve_snapshot_overlay_spec(_active_panel_id)
		_:
			return {}

func _open_snapshot_overlay_from_spec(overlay_spec: Dictionary) -> Control:
	var prepared_payload: Dictionary = _resolve_overlay_runtime_helper().prepare_snapshot_payload_from_state(overlay_spec)
	_apply_overlay_runtime_state_patch(prepared_payload.get("runtime_state_patch", {}) as Dictionary)
	var overlay_scene: PackedScene = overlay_spec.get("scene")
	return _open_snapshot_overlay(
		overlay_scene,
		str(overlay_spec.get("setter_method", "")),
		prepared_payload.get("snapshot", {}) as Dictionary,
		str(overlay_spec.get("page_handler", "")),
		str(overlay_spec.get("action_handler", "")),
		overlay_spec.get("extra_signal_handlers", {}) as Dictionary
	)

func _on_overlay_panel_back_requested() -> void:
	_close_active_panel("back")

func _on_overlay_panel_close_requested() -> void:
	_close_active_panel("close")

func _resolve_panel_runtime_label(panel_id: String) -> String:
	match panel_id:
		"interior":
			return "内政"
		"troop":
			return "部队"
		"recruit":
			return "招募"
		"generals":
			return "武将"
		"alliance":
			return "同盟"
		"ai_hub":
			return "AI"
		"activity":
			return "活动"
		"event":
			return "事件"
		"world_event":
			return "天下大事"
		"world_affairs":
			return "天下大事"
		"tasks":
			return "任务"
		"faction_status":
			return "势力状态"
		_:
			return panel_id

func _on_overlay_page_changed(page_id: String) -> void:
	_active_panel_tab_id = page_id
	_apply_overlay_feedback(
		"panel/%s/%s" % [_active_panel_id, page_id],
		"page",
		"panel %s / %s" % [_resolve_panel_runtime_label(_active_panel_id), page_id]
	)

func _on_overlay_section_changed(top_tab_id: String, section_id: String) -> void:
	_active_panel_tab_id = "%s/%s" % [top_tab_id, section_id]
	_apply_overlay_feedback(
		"panel/%s/%s/%s" % [_active_panel_id, top_tab_id, section_id],
		"section",
		"panel %s / %s / %s" % [_resolve_panel_runtime_label(_active_panel_id), top_tab_id, section_id]
	)

func _on_snapshot_overlay_page_action_requested(page_id: String, action_id: String) -> void:
	var overlay_spec := _resolve_active_snapshot_overlay_spec()
	var adapter_method := str(overlay_spec.get("adapter_method", "")).strip_edges()
	if adapter_method == "":
		return
	var adapter = _resolve_slg_domain_action_adapter()
	if not adapter.has_method(adapter_method):
		return
	var outcome: Dictionary = await adapter.call(adapter_method, action_id, page_id)
	await _apply_overlay_action_outcome(outcome)

func _on_world_event_activity_page_action_requested(page_id: String, action_id: String) -> void:
	var resolved_page_id := page_id.strip_edges()
	var resolved_action_id := action_id.strip_edges()
	if resolved_action_id == "":
		return
	_apply_overlay_feedback(
		"panel/%s/%s/%s" % [_active_panel_id, resolved_page_id, resolved_action_id],
		"preview_action",
		"panel %s / %s" % [_resolve_panel_runtime_label(_active_panel_id), resolved_action_id]
	)

func _apply_overlay_action_outcome(outcome: Dictionary) -> void:
	if outcome.is_empty():
		return
	var record_path := str(outcome.get("record_path", "")).strip_edges()
	var runtime_label := str(outcome.get("runtime_label", "")).strip_edges()
	if not bool(outcome.get("ok", false)):
		_store_runtime_action_receipt(_extract_overlay_action_receipt(outcome))
		_apply_overlay_feedback(record_path, str(outcome.get("record_state", "rejected")), runtime_label)
		return
	var adapter = _resolve_slg_domain_action_adapter()
	var finalize_result: Dictionary = await adapter.finalize_overlay_outcome(outcome)
	var followup_payload: Dictionary = await _resolve_overlay_runtime_helper().run_overlay_action_followup_from_state(
		outcome,
		_resolve_active_snapshot_overlay_spec(),
		bool(finalize_result.get("requires_map_refresh", false)),
		Callable(self, "_refresh_world_and_map")
	)
	_store_runtime_action_receipt(_extract_overlay_action_receipt(outcome))
	var apply_payload: Dictionary = followup_payload.get("apply_payload", {}) as Dictionary
	_apply_overlay_action_apply_payload(apply_payload)
	var runtime_feedback_label := runtime_label
	if str(apply_payload.get("open_panel_id", "")).strip_edges() != "":
		runtime_feedback_label = ""
	_apply_overlay_feedback(record_path, str(outcome.get("record_state", "updated")), runtime_feedback_label)

func _apply_overlay_action_apply_payload(apply_payload: Dictionary) -> void:
	var runtime_state_patch: Dictionary = apply_payload.get("runtime_state_patch", {}) as Dictionary
	var open_panel_id := str(apply_payload.get("open_panel_id", "")).strip_edges()
	if open_panel_id != "":
		_apply_overlay_runtime_state_patch(runtime_state_patch)
		_open_overlay_panel(open_panel_id)
		var open_page_id := str(apply_payload.get("open_page_id", "")).strip_edges()
		if open_page_id != "":
			_set_active_overlay_panel_page(open_page_id)
		return
	var refresh_payload: Dictionary = apply_payload.get("refresh_payload", {}) as Dictionary
	if not refresh_payload.is_empty():
		_apply_overlay_runtime_state_patch(runtime_state_patch)
		_apply_overlay_runtime_state_patch(refresh_payload.get("runtime_state_patch", {}) as Dictionary)
		_refresh_snapshot_overlay(
			str(refresh_payload.get("setter_method", "")),
			refresh_payload.get("snapshot", {}) as Dictionary
		)
		return
	_apply_overlay_runtime_state_patch(runtime_state_patch)
	if bool(apply_payload.get("refresh_overlay", true)):
		_refresh_overlay_panel_state()

func _set_active_overlay_panel_page(page_id: String) -> void:
	if _active_overlay_panel == null or not is_instance_valid(_active_overlay_panel):
		return
	_active_panel_tab_id = page_id
	if _active_overlay_panel.has_method("set_active_page_id"):
		_active_overlay_panel.call("set_active_page_id", page_id)
		return

func _open_overlay_panel_with_page(action_id: String, page_id: String = "") -> void:
	_open_overlay_panel(action_id)
	var resolved_page_id := page_id.strip_edges()
	if resolved_page_id != "":
		_set_active_overlay_panel_page(resolved_page_id)

func _build_panel_config(action_id: String) -> Dictionary:
	match action_id:
		"interior":
			return {
				"title": "内政",
				"defaultTabId": "market",
				"tabs": [
					{"id": "market", "label": "市井"},
					{"id": "tax", "label": "税收"},
					{"id": "policy", "label": "政策"},
					{"id": "affairs", "label": "政务"},
				],
			}
		"troop":
			return {
				"title": "部队",
				"defaultTabId": "",
				"empty_state_text": "正在准备五部队总览与设施区。",
				"tabs": [],
			}
		"recruit":
			return {
				"title": "招募",
				"defaultTabId": "pool",
				"tabs": [
					{"id": "pool", "label": "卡池"},
					{"id": "single", "label": "单抽"},
					{"id": "multi", "label": "多抽"},
					{"id": "result", "label": "结果"},
				],
			}
		"generals":
			return {
				"title": "武将",
				"defaultTabId": "roster",
				"tabs": [
					{"id": "roster", "label": "总览"},
					{"id": "profile", "label": "详情"},
					{"id": "tactics", "label": "战法"},
					{"id": "growth", "label": "养成"},
				],
			}
		"alliance":
			return {
				"title": "同盟",
				"defaultTabId": "members",
				"tabs": [
					{"id": "members", "label": "成员"},
					{"id": "groups", "label": "分组"},
					{"id": "subordinates", "label": "下属成员"},
					{"id": "officers", "label": "官员架构"},
					{"id": "territory", "label": "势力分布"},
					{"id": "strategy", "label": "军略"},
				],
			}
		"ai_hub":
			return {
				"title": "AI",
				"defaultTabId": "autonomy",
				"tabs": [
					{"id": "autonomy", "label": "托管"},
					{"id": "agenda", "label": "议程"},
					{"id": "context", "label": "上下文"},
				],
			}
		_:
			return _build_under_construction_panel_config(action_id)

func _build_under_construction_panel_config(action_id: String) -> Dictionary:
	var resolved_action_id := action_id.strip_edges()
	var panel_copy: Dictionary = UNDER_CONSTRUCTION_PANEL_COPY.get(resolved_action_id, {}) as Dictionary
	if panel_copy.is_empty():
		var fallback_label := resolved_action_id if resolved_action_id != "" else "该入口"
		return {
			"title": "%s（开发中）" % fallback_label,
			"defaultTabId": "",
			"empty_state_text": "当前入口尚未接入正式主线，为避免误导，不再展示空白功能面板。",
			"tabs": [],
		}
	return {
		"title": str(panel_copy.get("title", "功能入口（开发中）")),
		"defaultTabId": "",
		"empty_state_text": str(panel_copy.get("empty_state_text", "当前入口尚未接入正式主线。")),
		"tabs": [],
	}

func _build_panel_content(action_id: String, tab_id: String) -> Control:
	match action_id:
		"interior":
			return _build_stub_child_page_panel("内政", "正式入口", ["内政已升级为正式全屏面板"], "当前状态", ["请从主壳入口直接进入正式内政面板。"])
		"troop":
			return _build_stub_child_page_panel("部队", "正式入口", ["部队已升级为正式全屏面板"], "当前状态", ["请从主壳入口直接进入正式部队面板。"])
		"recruit":
			return _build_recruit_panel_content(tab_id)
		"generals":
			return _build_generals_panel_content(tab_id)
		"alliance":
			return _build_stub_child_page_panel("同盟", "正在切换", ["同盟已升级为正式全屏面板"], "当前状态", ["请从主壳入口直接进入正式同盟面板。"])
		"ai_hub":
			return _build_ai_panel_content(tab_id)
		"activity":
			return _build_stub_child_page_panel(
				"活动",
				"壳层入口",
				["活动入口已收回到主壳 UtilityRow。"],
				"当前状态",
				[
					"这里后续承接每日任务、赛季活动和运营事件。",
					"当前先保留入口位置与层级，不再让运行时按钮看起来像空壳。",
				]
			)
		"help":
			return _build_stub_child_page_panel(
				"帮助",
				"壳层入口",
				["帮助入口已接入主壳 UtilityRow。"],
				"当前状态",
				[
					"这里后续承接玩法说明、界面帮助和快捷规则提示。",
					"当前战报面板内部也已经有一版帮助按钮与说明位。",
				]
			)
		_:
			return null

func _on_shell_troop_slot_requested(troop_id: String) -> void:
	var resolved_troop_id := troop_id.strip_edges()
	if resolved_troop_id == "":
		return
	_apply_overlay_runtime_state_patch(_resolve_overlay_runtime_helper().build_shell_troop_runtime_patch(resolved_troop_id))
	_open_overlay_panel("troop")

func _resolve_unit_status_copy(status_id: String) -> String:
	match status_id.strip_edges().to_lower():
		"marching", "moving":
			return "行军"
		"engaged", "battle":
			return "交战"
		"fallback", "retreat":
			return "回撤"
		"escort":
			return "护送"
		"guard", "garrison", "defend":
			return "驻守"
		"support":
			return "支援"
		"idle", "":
			return "待命"
		_:
			return status_id

func _on_snapshot_overlay_state_signal(value_id: String, signal_kind: String) -> void:
	var state_feedback := _resolve_overlay_state_feedback(signal_kind, value_id)
	if state_feedback.is_empty():
		return
	_apply_overlay_runtime_state_patch(state_feedback.get("runtime_state_patch", {}) as Dictionary)
	_apply_overlay_feedback(
		str(state_feedback.get("record_path", "")),
		str(state_feedback.get("record_state", "")),
		str(state_feedback.get("runtime_label", ""))
	)

func _resolve_overlay_state_feedback(signal_kind: String, value_id: String) -> Dictionary:
	return _resolve_overlay_runtime_helper().resolve_state_feedback_from_state(
		_resolve_active_snapshot_overlay_spec(),
		signal_kind,
		value_id
	)

func _apply_overlay_feedback(record_path: String, record_state: String, runtime_label: String) -> void:
	if record_path != "" and record_state != "":
		_record_last_action(record_path, record_state)
	if runtime_label != "":
		_update_runtime_label(runtime_label)

func _on_snapshot_overlay_extra_action_requested(arg1: String = "", arg2: String = "", adapter_method: String = "") -> void:
	var resolved_method := adapter_method.strip_edges()
	if resolved_method == "":
		return
	var adapter = _resolve_slg_domain_action_adapter()
	if not adapter.has_method(resolved_method):
		return
	var adapter_args := _build_overlay_adapter_args(resolved_method, arg1, arg2)
	if adapter_args.is_empty():
		return
	var outcome: Dictionary = await adapter.callv(resolved_method, adapter_args)
	await _apply_overlay_action_outcome(outcome)

func _build_overlay_adapter_args(adapter_method: String, arg1: String, arg2: String) -> Array:
	return _resolve_overlay_runtime_helper().build_adapter_args_from_state(
		_resolve_active_snapshot_overlay_spec(),
		adapter_method,
		arg1,
		arg2
	)

func _build_interior_panel_content(tab_id: String) -> Control:
	return _build_stub_child_page_panel(
		"内政",
		"正式 Presenter",
		["内政已升级为正式全屏二级功能面板"],
		"当前状态",
		[
			"当前正式实现位于 scenes/ui/interior_panel.tscn。",
			"请从世界主壳入口直接进入正式内政面板。",
			"旧的内联文本占位已降级，不再作为现行实现。",
			"当前请求 tab：%s" % tab_id,
		]
	)

func _build_recruit_panel_content(tab_id: String) -> Control:
	match tab_id:
		"single":
			return _build_stub_child_page_panel("招募", "正式 Overlay", ["当前正式实现位于 scenes/ui/recruit_panel.tscn"], "当前状态", ["请从世界主壳入口直接进入正式招募面板。", "当前请求 tab：single"])
		"multi":
			return _build_stub_child_page_panel("招募", "正式 Overlay", ["当前正式实现位于 scenes/ui/recruit_panel.tscn"], "当前状态", ["请从世界主壳入口直接进入正式招募面板。", "当前请求 tab：multi"])
		"result":
			return _build_stub_child_page_panel("招募", "正式 Overlay", ["当前正式实现位于 scenes/ui/recruit_panel.tscn"], "当前状态", ["请从世界主壳入口直接进入正式招募面板。", "当前请求 tab：result"])
		_:
			return _build_stub_child_page_panel("招募", "正式 Overlay", ["当前正式实现位于 scenes/ui/recruit_panel.tscn"], "当前状态", ["请从世界主壳入口直接进入正式招募面板。", "当前请求 tab：pool"])

func _build_generals_panel_content(tab_id: String) -> Control:
	return _build_stub_child_page_panel("武将", "正式 Overlay", ["当前正式实现位于 scenes/ui/general_panel.tscn"], "当前状态", ["请从世界主壳入口直接进入正式武将面板。", "当前请求 tab：%s" % tab_id])

func _build_ai_panel_content(tab_id: String) -> Control:
	return _build_stub_child_page_panel("AI", "正式 Overlay", ["当前正式实现位于 scenes/ui/ai_panel.tscn"], "当前状态", ["请从世界主壳入口直接进入正式 AI 面板。", "当前请求 tab：%s" % tab_id])

func _build_stub_child_page_panel(title: String, list_title: String, items: Array, detail_title: String, detail_lines: Array, footer_lines: Array = []) -> Control:
	var factory = ChildPageBlockFactoryScript.new()
	return factory.build_section_page({
		"page_id": "legacy_stub_%s" % title,
		"title": title,
		"summary_title": title,
		"summary_lines": [
			"当前入口已切回正式面板链路，旧内联占位只保留结构说明。",
		],
		"list_title": list_title,
		"item_cards": _build_stub_item_cards(list_title, items),
		"content_blocks": _build_stub_content_blocks(detail_title, detail_lines, footer_lines),
	})

func _build_stub_item_cards(list_title: String, items: Array) -> Array:
	var cards: Array = []
	var index := 0
	for raw_item in items:
		var text := str(raw_item).strip_edges()
		if text == "":
			continue
		index += 1
		cards.append({
			"title": text,
			"meta": "%s %s" % [list_title, str(index)],
			"description": "当前入口只保留层级与路由说明，正式内容请从主壳进入。",
		})
	if not cards.is_empty():
		return cards
	return [{
		"title": "当前项",
		"value": "暂无条目",
		"description": "当前入口只保留结构说明。",
	}]

func _build_stub_content_blocks(detail_title: String, detail_lines: Array, footer_lines: Array = []) -> Array:
	var blocks: Array = [{
		"kind": "text_block",
		"title": detail_title,
		"node_name": "LegacyStubDetailBlock",
		"lines": _coerce_stub_string_array(detail_lines),
	}]
	var footer_copy := _coerce_stub_string_array(footer_lines)
	if not footer_copy.is_empty():
		blocks.append({
			"kind": "text_block",
			"title": "补充",
			"node_name": "LegacyStubFooterBlock",
			"lines": footer_copy,
		})
	return blocks

func _coerce_stub_string_array(raw_value: Variant) -> Array[String]:
	var result: Array[String] = []
	if raw_value is Array:
		for item in raw_value as Array:
			var text := str(item).strip_edges()
			if text != "":
				result.append(text)
	return result


func _apply_hud_v1_styles() -> void:
	if _ui_theme_tokens == null:
		return
	_ui_theme_tokens.apply_panel_style(_top_left_info_card, "panel", "hud_top_left")
	_ui_theme_tokens.apply_button_style(_refresh_button, "refresh")
	_ui_theme_tokens.apply_button_style(_advance_tick_button, "advance_tick")
	_ui_theme_tokens.apply_button_style(_export_button, "export")

func _on_shell_mode_toggle_requested(next_mode: String) -> void:
	_set_display_mode(next_mode)

func _on_shell_action_requested(action_id: String) -> void:
	if action_id == "chat":
		_open_main_chat_overlay()
		return
	_active_city_action = action_id
	_record_last_action("city_entry/%s" % action_id, "focused")
	_update_runtime_label("city entry %s" % action_id)
	_open_fixed_panel(action_id)

func _open_main_chat_overlay(ai_player_id: String = "") -> void:
	if _main_chat_overlay == null or not is_instance_valid(_main_chat_overlay):
		return
	_close_active_panel("chat")
	if _main_chat_overlay.has_method("open_ai_player_channel"):
		_main_chat_overlay.call("open_ai_player_channel", ai_player_id)
	else:
		(_main_chat_overlay as CanvasItem).visible = true
	_record_last_action("chat/channel", "opened")
	_update_runtime_label("chat channel")

func _on_main_chat_overlay_close_requested() -> void:
	_record_last_action("chat/channel", "closed")
	_update_runtime_label("chat channel closed")

func _on_shell_interior_tab_requested(tab_id: String) -> void:
	var resolved_tab_id := tab_id.strip_edges()
	if resolved_tab_id == "":
		return
	_active_city_action = "interior"
	_record_last_action("city_entry/interior/%s" % resolved_tab_id, "focused")
	_update_runtime_label("city entry interior / %s" % resolved_tab_id)
	_open_overlay_panel_with_page("interior", resolved_tab_id)

func _on_main_city_hub_entry_requested(action_id: String) -> void:
	var resolved_action_id := action_id.strip_edges()
	if resolved_action_id == "":
		return
	_active_city_action = resolved_action_id
	_record_last_action("main_city_hub/%s" % resolved_action_id, "opened")
	_update_runtime_label("main city hub %s" % resolved_action_id)
	_open_overlay_panel(resolved_action_id)

func _on_player_home_city_node_clicked(context: Dictionary) -> void:
	var hub_context := _build_main_city_hub_context_from_map_node_click(context)
	_last_player_home_city_node_context = hub_context.duplicate(true)
	if _main_city_hub_overlay != null and is_instance_valid(_main_city_hub_overlay):
		if _main_city_hub_overlay.has_method("set_context"):
			_main_city_hub_overlay.call("set_context", hub_context)
		if _main_city_hub_overlay.has_method("set_expanded"):
			_main_city_hub_overlay.call("set_expanded", true)
	var tile_id := str(hub_context.get("tileId", "")).strip_edges()
	_record_last_action("map/main_city_node/%s" % tile_id, "selected")

func _set_display_mode(next_mode: String) -> void:
	_display_mode = DISPLAY_MODE_WORLD if next_mode == DISPLAY_MODE_WORLD else DISPLAY_MODE_CITY
	var show_world_map: bool = _display_mode == DISPLAY_MODE_WORLD
	if _map_grid != null:
		_map_grid.visible = show_world_map
	if _unit_view_layer != null:
		_unit_view_layer.visible = show_world_map
	if _native_shell != null:
		if _native_shell.has_method("set_display_mode"):
			_native_shell.call("set_display_mode", _display_mode)
	if _main_city_hub_overlay != null and _main_city_hub_overlay.has_method("set_display_mode"):
		_main_city_hub_overlay.call("set_display_mode", _display_mode)
	_refresh_main_city_hub_context()
	_update_runtime_label("mode %s" % _display_mode)

func _on_refresh_world_pressed() -> void:
	if _request_in_flight:
		return
	if _should_retry_runtime_bootstrap():
		await _execute_bootstrap_retry("manual")
		return
	await _execute_refresh_world("manual")

func _on_advance_tick_pressed() -> void:
	if _request_in_flight:
		return
	await _execute_advance_tick("manual")

func _execute_refresh_world(source: String) -> void:
	_set_request_state(true, "refresh %s..." % source)
	var ok: bool = await _refresh_world_and_map(false)
	if ok:
		_record_last_action("refresh_world", "ok")
		_set_request_state(false, "refresh %s ok" % source)
	else:
		_record_last_action("refresh_world", "failed")
		_set_request_state(false, "refresh %s failed" % source)

func _execute_bootstrap_retry(source: String) -> void:
	_set_request_state(true, "bootstrap retry %s..." % source)
	await _bootstrap_runtime_world()
	_set_request_controls_disabled(false)

func _should_retry_runtime_bootstrap() -> bool:
	return _runtime_session_mode == "bootstrap_failed" or _target_faction_id == ""

func _execute_advance_tick(source: String) -> void:
	var request_seq: int = _begin_advance_tick_request(source)
	var advance_result: Dictionary = await _api_client.advance_tick(true)
	var after_timeout_notice: bool = _advance_tick_timeout_warning_visible
	if not bool(advance_result.get("ok", false)):
		push_warning("[godot-runtime] advanceTick request failed: %s" % str(advance_result))
		_record_last_action("advanceTick", "request_failed")
		_end_advance_tick_request(request_seq)
		_set_request_state(false, "advanceTick failed%s" % _format_after_timeout_suffix(after_timeout_notice))
		return

	var action_payload: Dictionary = advance_result.get("data", {}) as Dictionary
	if not bool(action_payload.get("ok", false)):
		push_warning("[godot-runtime] advanceTick action returned ok=false: %s" % str(action_payload))
		_record_last_action("advanceTick", "rejected")
		_end_advance_tick_request(request_seq)
		_set_request_state(false, "advanceTick rejected%s" % _format_after_timeout_suffix(after_timeout_notice))
		return

	var action_world: Variant = action_payload.get("world", null)
	if action_world is Dictionary:
		WorldStore.set_world(action_world as Dictionary)
		_update_runtime_label("advanceTick ok")
	else:
		var refresh_ok: bool = await _refresh_world_and_map(false)
		if not refresh_ok:
			_record_last_action("advanceTick", "ok_refresh_failed")
			_end_advance_tick_request(request_seq)
			_set_request_state(false, "advanceTick ok, refresh failed%s" % _format_after_timeout_suffix(after_timeout_notice))
			return
		_update_runtime_label("advanceTick ok + refresh")

	_record_last_action("advanceTick", "ok")
	_end_advance_tick_request(request_seq)
	_set_request_state(false, "advanceTick %s ok%s" % [source, _format_after_timeout_suffix(after_timeout_notice)])

func _begin_advance_tick_request(source: String) -> int:
	_advance_tick_request_seq += 1
	_advance_tick_active_seq = _advance_tick_request_seq
	_advance_tick_timeout_warning_visible = false
	_set_request_state(true, "advanceTick %s in progress..." % source)
	if _advance_tick_button != null:
		_advance_tick_button.text = "%s (Running...)" % _advance_tick_button_default_text
	call_deferred("_watch_advance_tick_soft_timeout", _advance_tick_active_seq)
	return _advance_tick_active_seq

func _end_advance_tick_request(request_seq: int) -> void:
	if request_seq == _advance_tick_active_seq:
		_advance_tick_active_seq = -1
	_advance_tick_timeout_warning_visible = false
	if _advance_tick_button != null:
		_advance_tick_button.text = _advance_tick_button_default_text

func _watch_advance_tick_soft_timeout(request_seq: int) -> void:
	await get_tree().create_timer(ADVANCE_TICK_SOFT_TIMEOUT_SECONDS).timeout
	if request_seq != _advance_tick_active_seq:
		return
	if not _request_in_flight:
		return
	_advance_tick_timeout_warning_visible = true
	_record_last_action("advanceTick", "timeout_waiting")
	_update_runtime_label(ADVANCE_TICK_TIMEOUT_NOTICE)

func _format_after_timeout_suffix(after_timeout_notice: bool) -> String:
	return " (after timeout notice)" if after_timeout_notice else ""

func _resolve_runtime_world_action_template(template_id: String) -> Dictionary:
	if template_id == "clear_plan_execution":
		var payload: Dictionary = {}
		if _target_faction_id != "":
			payload["factionId"] = _target_faction_id
		return {
			"ok": true,
			"action": "clearPlanExecution",
			"payload": payload,
			"includeWorld": true,
			"templateLabel": "clear_plan_execution",
		}

	if template_id == "preview_national_agenda":
		return {
			"ok": true,
			"action": "previewNationalAgenda",
			"payload": {"maxOptions": 5},
			"includeWorld": false,
			"templateLabel": "preview_national_agenda",
		}

	if template_id == "preview_court_session":
		return {
			"ok": true,
			"action": "previewCourtSession",
			"payload": {"maxProposals": 5, "maxOptions": 5},
			"includeWorld": false,
			"templateLabel": "preview_court_session",
		}

	return {
		"ok": false,
		"error": "unknown_template",
		"templateLabel": template_id,
	}

func _execute_template_world_action(template_id: String, source: String) -> void:
	var template_config: Dictionary = _resolve_runtime_world_action_template(template_id)
	if not bool(template_config.get("ok", false)):
		var template_error: String = str(template_config.get("error", "template_resolve_failed"))
		push_warning("[godot-runtime] world-action template resolve failed: %s (%s)" % [template_id, template_error])
		_record_last_action(template_id, template_error)
		_update_runtime_label("%s template failed" % template_id)
		return

	var action_name: String = str(template_config.get("action", ""))
	if action_name == "":
		_record_last_action(template_id, "empty_action")
		_update_runtime_label("%s template invalid" % template_id)
		return

	var payload: Dictionary = template_config.get("payload", {}) as Dictionary
	var include_world: bool = bool(template_config.get("includeWorld", false))
	_set_request_state(true, "%s %s..." % [action_name, source])
	var action_result: Dictionary = await _api_client.post_world_action(action_name, payload, include_world)
	if not bool(action_result.get("ok", false)):
		push_warning("[godot-runtime] %s request failed: %s" % [action_name, str(action_result)])
		_record_last_action("%s/%s" % [template_id, action_name], "request_failed")
		_set_request_state(false, "%s failed" % action_name)
		return

	var action_payload: Dictionary = action_result.get("data", {}) as Dictionary
	if not bool(action_payload.get("ok", false)):
		push_warning("[godot-runtime] %s action returned ok=false: %s" % [action_name, str(action_payload)])
		_record_last_action("%s/%s" % [template_id, action_name], "rejected")
		_set_request_state(false, "%s rejected" % action_name)
		return

	var action_world: Variant = action_payload.get("world", null)
	if action_world is Dictionary:
		WorldStore.set_world(action_world as Dictionary)
	elif include_world:
		var refresh_ok: bool = await _refresh_world_and_map(false)
		if not refresh_ok:
			_record_last_action("%s/%s" % [template_id, action_name], "ok_refresh_failed")
			_set_request_state(false, "%s ok, refresh failed" % action_name)
			return

	_record_last_action("%s/%s" % [template_id, action_name], "ok")
	_set_request_state(false, "%s %s ok" % [action_name, source])

func _refresh_world_and_map(fetch_map_layout: bool) -> bool:
	var world_result: Dictionary = await _api_client.get_world_summary()
	if not bool(world_result.get("ok", false)):
		push_warning("[godot-runtime] world request failed: %s" % str(world_result))
		return false

	var world_response: Dictionary = world_result.get("data", {}) as Dictionary
	var world_data: Dictionary = world_response.get("world", world_response) as Dictionary
	if world_data.is_empty():
		push_warning("[godot-runtime] world payload empty")
		return false

	WorldStore.set_world(world_data)

	var should_fetch_map: bool = fetch_map_layout or WorldStore.map_layout.is_empty()
	if not should_fetch_map:
		_update_runtime_label("world refreshed")
		return true

	var map_result: Dictionary = await _api_client.get_map_layout(_active_map_scope, _active_map_query_params)
	if not bool(map_result.get("ok", false)) and int(map_result.get("status", 0)) == 403 and _active_map_scope == "full":
		print("[godot-runtime] map scope=full unavailable, fallback to scope=bootstrap")
		_active_map_scope = "bootstrap"
		_active_map_query_params = {}
		map_result = await _api_client.get_map_layout(_active_map_scope, _active_map_query_params)

	if bool(map_result.get("ok", false)):
		var map_layout_data: Dictionary = map_result.get("data", {}) as Dictionary
		WorldStore.set_map_layout(map_layout_data)
		_update_runtime_label("world/map refreshed")
		return true

	push_warning("[godot-runtime] map layout request failed: %s" % str(map_result))
	return false

func _resolve_target_faction_id(runtime_data: Dictionary) -> String:
	var factions: Array = _read_faction_rows(runtime_data)
	var preferred: String = AppConfig.preferred_faction_id.strip_edges()
	if preferred != "":
		for faction_row in factions:
			var row: Dictionary = faction_row as Dictionary
			if str(row.get("factionId", "")) == preferred:
				return preferred

	if factions.is_empty():
		return ""
	return str((factions[0] as Dictionary).get("factionId", ""))

func _should_join_faction(runtime_data: Dictionary, faction_id: String) -> bool:
	for faction_row in _read_faction_rows(runtime_data):
		var row: Dictionary = faction_row as Dictionary
		if str(row.get("factionId", "")) != faction_id:
			continue
		var online_seat_count: int = int(row.get("onlineSeatCount", 0))
		return online_seat_count <= 0
	return true

func _read_faction_rows(runtime_data: Dictionary) -> Array:
	var raw_factions: Variant = runtime_data.get("factions", [])
	if raw_factions is Array:
		return raw_factions
	return []

func _find_runtime_faction_row(runtime_data: Dictionary, faction_id: String) -> Dictionary:
	for faction_row in _read_faction_rows(runtime_data):
		var row: Dictionary = faction_row as Dictionary
		if str(row.get("factionId", "")) == faction_id:
			return row
	return {}

func _apply_runtime_faction_row(runtime_row: Dictionary) -> void:
	if runtime_row.is_empty():
		_runtime_autonomy_level = "unknown"
		_runtime_control_mode = "unknown"
		_runtime_seat_count = 0
		_runtime_online_seat_count = 0
		_runtime_player_names = "none"
		return

	_runtime_autonomy_level = str(runtime_row.get("autonomyLevel", "unknown"))
	_runtime_control_mode = str(runtime_row.get("controlMode", "unknown"))
	_runtime_seat_count = int(runtime_row.get("seatCount", 0))
	_runtime_online_seat_count = int(runtime_row.get("onlineSeatCount", 0))
	_runtime_player_names = _format_player_names(runtime_row.get("playerNames", []))
	SessionStore.set_control_context(_runtime_autonomy_level, _runtime_control_mode)
	_sync_world_store_ai_control_context("session_runtime_bootstrap")

func _format_player_names(raw_player_names: Variant) -> String:
	if raw_player_names is Array:
		var names: Array = raw_player_names
		if names.is_empty():
			return "none"
		var parts: PackedStringArray = PackedStringArray()
		for item in names:
			parts.append(str(item))
		return ",".join(parts).left(80)
	return "none"

func _read_tick_label(world_data: Dictionary) -> String:
	var tick_value: Variant = world_data.get("tick", null)
	if tick_value is int:
		return str(tick_value)
	if tick_value is float:
		return str(int(tick_value))
	return "unknown"

func _read_world_version_label(world_data: Dictionary) -> String:
	var world_version: Variant = world_data.get("worldVersion", null)
	if world_version is int:
		return str(world_version)
	if world_version is float:
		return str(int(world_version))
	return "unknown"

func _set_request_state(in_flight: bool, status_message: String) -> void:
	_set_request_controls_disabled(in_flight)
	_update_runtime_label(status_message)

func _set_request_controls_disabled(in_flight: bool) -> void:
	_request_in_flight = in_flight
	if _refresh_button != null:
		_refresh_button.disabled = in_flight
	if _advance_tick_button != null:
		_advance_tick_button.disabled = in_flight

func _start_observability() -> void:
	if _observability_bridge == null:
		return
	_observability_bridge.bind_session(_target_faction_id, SessionStore.token)
	_observability_bridge.start()

func _on_observability_snapshot_updated(snapshot: Dictionary) -> void:
	_sync_world_store_ai_control_context_from_snapshot(snapshot)
	_update_observability_panel(snapshot)

func _update_runtime_label(status_message: String) -> void:
	_runtime_status_message = status_message
	var runtime_label_text := _compose_runtime_label_text(status_message)
	if _runtime_label != null:
		_runtime_label.text = runtime_label_text
	_refresh_shell_state(status_message)
	_refresh_main_city_hub_context()

func _update_observability_panel(snapshot: Dictionary) -> void:
	if _observability_panel == null:
		return

	if _observability_panel.has_method("update_snapshot"):
		var merged_snapshot: Dictionary = snapshot.duplicate(true)
		var runtime_snapshot: Dictionary = _build_runtime_snapshot()
		for key in runtime_snapshot.keys():
			merged_snapshot[key] = runtime_snapshot[key]
		_observability_panel.call("update_snapshot", merged_snapshot)

func _build_runtime_snapshot() -> Dictionary:
	var world_data: Dictionary = WorldStore.world
	var control_context := WorldStore.get_resolved_ai_control_context(_target_faction_id)
	var display_control_mode: String = str(control_context.get("controlMode", _runtime_control_mode)).strip_edges()
	var display_autonomy_level: String = str(control_context.get("autonomyLevel", _runtime_autonomy_level)).strip_edges()
	var control_authority_source := str(control_context.get("authoritySource", "unknown")).strip_edges()
	var execution_state := WorldStore.get_resolved_ai_execution(_target_faction_id)
	var action_receipt := WorldStore.get_ai_action_receipt(_target_faction_id)
	var ai_execution_summary := _format_runtime_ai_execution_summary(execution_state)
	var ai_budget_summary := _format_runtime_ai_budget_summary(execution_state)
	var ai_request_id := _first_non_empty_runtime_value(
		action_receipt.get("request_id", ""),
		execution_state.get("requestId", "")
	)
	var ai_failure_code := _first_non_empty_runtime_value(
		action_receipt.get("failure_code", ""),
		"none"
	)
	var ai_receipt_message := _first_non_empty_runtime_value(
		action_receipt.get("message", ""),
		"none"
	)
	return {
		"runtimeFactionId": _target_faction_id if _target_faction_id != "" else "none",
		"runtimeControlMode": display_control_mode,
		"runtimeAutonomyLevel": display_autonomy_level,
		"runtimeControlAuthoritySource": control_authority_source if control_authority_source != "" else "unknown",
		"runtimeSeatCount": _runtime_seat_count,
		"runtimeOnlineSeatCount": _runtime_online_seat_count,
		"runtimePlayerNames": _runtime_player_names,
		"runtimeSessionId": SessionStore.session_id if SessionStore.session_id != "" else "none",
		"runtimeSeatId": SessionStore.seat_id if SessionStore.seat_id != "" else "none",
		"runtimeSessionMode": _runtime_session_mode,
		"runtimeTick": _read_tick_label(world_data),
		"runtimeWorldVersion": _read_world_version_label(world_data),
		"runtimeLastAction": _runtime_last_action,
		"runtimeLastActionStatus": _runtime_last_action_status,
		"runtimeLastActionTick": _runtime_last_action_tick,
		"runtimeAiExecutionSummary": ai_execution_summary,
		"runtimeAiBudgetSummary": ai_budget_summary,
		"runtimeAiRequestId": ai_request_id if ai_request_id != "" else "none",
		"runtimeAiFailureCode": ai_failure_code if ai_failure_code != "" else "none",
		"runtimeAiReceiptMessage": ai_receipt_message if ai_receipt_message != "" else "none",
		"backendHealthStatus": _backend_health_status,
		"backendHealthMessage": _backend_health_message,
		"runtimeBootstrapDiagnostic": _runtime_bootstrap_diagnostic,
		"runtimeBackendUrl": AppConfig.backend_base_url,
	}


func _compose_runtime_label_text(status_message: String) -> String:
	var world_data: Dictionary = WorldStore.world
	var control_context := WorldStore.get_resolved_ai_control_context(_target_faction_id)
	var display_control_mode: String = str(control_context.get("controlMode", _runtime_control_mode)).strip_edges()
	var display_autonomy_level: String = str(control_context.get("autonomyLevel", _runtime_autonomy_level)).strip_edges()
	return (
		"Runtime | view=%s | status=%s | faction=%s | mode=%s | autonomy=%s | tick=%s | worldVersion=%s | mapScope=%s | seats=%s/%s | session=%s | sessionMode=%s"
		% [
			_display_mode,
			status_message,
			_target_faction_id,
			display_control_mode,
			display_autonomy_level,
			_read_tick_label(world_data),
			_read_world_version_label(world_data),
			_active_map_scope,
			str(_runtime_online_seat_count),
			str(_runtime_seat_count),
			SessionStore.session_id,
			_runtime_session_mode,
		]
	)


func _format_runtime_ai_execution_summary(execution_state: Dictionary) -> String:
	var execution_status := str(execution_state.get("status", "idle")).strip_edges()
	if execution_status == "":
		execution_status = "idle"
	return "%s / active %s / queued %s / running %s" % [
		execution_status,
		str(int(execution_state.get("activeOrderCount", 0))),
		str(int(execution_state.get("queuedOrderCount", 0))),
		str(int(execution_state.get("runningOrderCount", 0))),
	]

func _format_runtime_ai_budget_summary(execution_state: Dictionary) -> String:
	var action_points: Variant = execution_state.get("actionPointsRemaining", null)
	var food_remaining: Variant = execution_state.get("foodRemaining", null)
	var action_points_label := "unknown"
	var food_label := "unknown"
	if action_points is int or action_points is float:
		action_points_label = str(int(action_points))
	if food_remaining is int or food_remaining is float:
		food_label = str(int(food_remaining))
	return "AP %s / Food %s" % [action_points_label, food_label]

func _record_last_action(action_name: String, status: String) -> void:
	_runtime_last_action = action_name
	_runtime_last_action_status = status
	_runtime_last_action_tick = _read_tick_label(WorldStore.world)


func _store_runtime_action_receipt(receipt: Dictionary) -> void:
	if receipt.is_empty():
		return
	_runtime_action_receipt = receipt.duplicate(true)
	if _target_faction_id != "":
		WorldStore.set_ai_action_receipt(_target_faction_id, _runtime_action_receipt)
	var receipt_autonomy_level := str(_runtime_action_receipt.get("autonomy_level", "")).strip_edges()
	var receipt_control_mode := str(_runtime_action_receipt.get("control_mode", "")).strip_edges()
	if receipt_autonomy_level != "":
		_runtime_autonomy_level = receipt_autonomy_level
	if receipt_control_mode != "":
		_runtime_control_mode = receipt_control_mode
	if receipt_autonomy_level != "" or receipt_control_mode != "":
		_sync_world_store_ai_control_context("action_receipt")


func _extract_overlay_action_receipt(outcome: Dictionary) -> Dictionary:
	var action_result: Dictionary = outcome.get("action_result", {}) as Dictionary
	if action_result.is_empty():
		return {}
	var remote_result: Dictionary = action_result.get("remote_result", {}) as Dictionary
	var response_data: Dictionary = remote_result.get("data", {}) as Dictionary
	var receipt_data: Dictionary = response_data.get("receipt", response_data) as Dictionary
	var proposal_data: Dictionary = response_data.get("proposal", {}) as Dictionary
	var world_action_intent: Dictionary = action_result.get("world_action_intent", {}) as Dictionary
	var intent_payload: Dictionary = world_action_intent.get("payload", {}) as Dictionary
	var action_name := _first_non_empty_runtime_value(
		world_action_intent.get("action_name", ""),
		receipt_data.get("worldAction", proposal_data.get("action", ""))
	)
	if response_data.is_empty() and action_name == "":
		return {}
	var context_focus_id := _first_non_empty_runtime_value(
		receipt_data.get("contextFocusId", response_data.get("contextFocusId", "")),
		intent_payload.get("contextFocusId", "")
	)
	var related_id := str(receipt_data.get("relatedId", response_data.get("relatedId", ""))).strip_edges()
	var unit_id := _first_non_empty_runtime_value(
		receipt_data.get("unitId", response_data.get("unitId", "")),
		related_id if context_focus_id == "focus_troop" else ""
	)
	var execution_data: Dictionary = receipt_data.get("execution", response_data.get("execution", {})) as Dictionary
	var request_id := _first_non_empty_runtime_value(
		response_data.get("requestId", proposal_data.get("proposalId", "")),
		execution_data.get("requestId", "")
	)
	return {
		"source_action": action_name,
		"message": _first_non_empty_runtime_value(
			receipt_data.get("message", response_data.get("message", "")),
			remote_result.get("message", "")
		),
		"hero_id": _first_non_empty_runtime_value(
			receipt_data.get("heroId", response_data.get("heroId", "")),
			intent_payload.get("heroId", "")
		),
		"unit_id": unit_id,
		"tactic_id": _first_non_empty_runtime_value(
			receipt_data.get("tacticId", response_data.get("tacticId", "")),
			intent_payload.get("tacticId", "")
		),
		"context_focus_id": context_focus_id,
		"related_id": related_id,
		"tick": str(receipt_data.get("tick", response_data.get("tick", ""))).strip_edges(),
		"world_version": str(receipt_data.get("worldVersion", response_data.get("worldVersion", ""))).strip_edges(),
		"faction_id": _first_non_empty_runtime_value(
			receipt_data.get("factionId", response_data.get("factionId", "")),
			intent_payload.get("factionId", "")
		),
		"autonomy_level": str(receipt_data.get("autonomyLevel", response_data.get("autonomyLevel", ""))).strip_edges(),
		"control_mode": str(receipt_data.get("controlMode", response_data.get("controlMode", ""))).strip_edges(),
		"success": bool(receipt_data.get("ok", remote_result.get("ok", false))),
		"failure_code": str(receipt_data.get("failureCode", response_data.get("failureCode", ""))).strip_edges(),
		"request_id": request_id,
		"execution_status": str(execution_data.get("status", "")).strip_edges(),
		"active_order_count": int(execution_data.get("activeOrderCount", 0)),
		"queued_order_count": int(execution_data.get("queuedOrderCount", 0)),
		"running_order_count": int(execution_data.get("runningOrderCount", 0)),
		"action_points_remaining": execution_data.get("actionPointsRemaining", null),
		"food_remaining": execution_data.get("foodRemaining", null),
		"based_on_world_version": execution_data.get("basedOnWorldVersion", null),
	}


func _first_non_empty_runtime_value(primary: Variant, fallback: Variant) -> String:
	var primary_text := str(primary).strip_edges()
	if primary_text != "":
		return primary_text
	return str(fallback).strip_edges()

func _refresh_shell_state(status_message: String) -> void:
	if _native_shell == null:
		if _active_overlay_panel == null or not is_instance_valid(_active_overlay_panel):
			_refresh_active_panel_content()
		return
	var troop_specs := _build_troop_specs()
	var shell_payload: Dictionary = _resolve_native_shell_presenter().build_payload(
		status_message,
		_display_mode,
		_active_city_action,
		_build_runtime_panel_context(),
		troop_specs
	)
	if _native_shell.has_method("set_context_summary"):
		_native_shell.call("set_context_summary", str(shell_payload.get("context_summary", "")))
	if _native_shell.has_method("set_context_slots"):
		_native_shell.call("set_context_slots", shell_payload.get("context_slots", []))
	if _native_shell.has_method("set_resource_summary"):
		_native_shell.call("set_resource_summary", str(shell_payload.get("resource_summary", "")))
	if _native_shell.has_method("set_premium_currency_summary"):
		_native_shell.call("set_premium_currency_summary", str(shell_payload.get("premium_currency_summary", "")))
	if _native_shell.has_method("set_city_overview"):
		_native_shell.call("set_city_overview", shell_payload.get("city_overview", {}))
	if _native_shell.has_method("set_troop_summary"):
		_native_shell.call("set_troop_summary", str(shell_payload.get("troop_summary", "")))
	if _native_shell.has_method("set_troop_slots"):
		_native_shell.call("set_troop_slots", shell_payload.get("troop_slots", []))
	if _active_overlay_panel == null or not is_instance_valid(_active_overlay_panel):
		_refresh_active_panel_content()

func _resolve_alliance_presenter():
	if _alliance_presenter == null:
		_alliance_presenter = AlliancePresenterScript.new()
	_alliance_presenter.configure(WorldStore.world, WorldStore.map_layout, _target_faction_id)
	return _alliance_presenter

func _resolve_native_shell_presenter():
	if _native_shell_presenter == null:
		_native_shell_presenter = NativeShellPresenterScript.new()
	_native_shell_presenter.configure(WorldStore.world, WorldStore.map_layout, _target_faction_id)
	return _native_shell_presenter

func _resolve_runtime_context_presenter():
	if _runtime_context_presenter == null:
		_runtime_context_presenter = RuntimeContextPresenterScript.new()
	return _runtime_context_presenter

func _resolve_troop_panel_presenter():
	if _troop_panel_presenter == null:
		_troop_panel_presenter = TroopPanelPresenterScript.new()
	_troop_panel_presenter.configure(WorldStore.world, WorldStore.map_layout, _target_faction_id)
	return _troop_panel_presenter

func _build_troop_specs() -> Array:
	return _resolve_troop_panel_presenter().build_troop_specs()

func _resolve_internal_affairs_presenter():
	if _internal_affairs_presenter == null:
		_internal_affairs_presenter = InternalAffairsPresenterScript.new()
	_internal_affairs_presenter.configure(WorldStore.world, WorldStore.map_layout, _target_faction_id)
	return _internal_affairs_presenter

func _resolve_recruit_presenter():
	if _recruit_presenter == null:
		_recruit_presenter = RecruitPresenterScript.new()
	_recruit_presenter.configure(WorldStore.world, WorldStore.map_layout, _target_faction_id)
	return _recruit_presenter

func _resolve_general_presenter():
	if _general_presenter == null:
		_general_presenter = GeneralPresenterScript.new()
	_general_presenter.configure(WorldStore.world, WorldStore.map_layout, _target_faction_id)
	return _general_presenter

func _resolve_ai_panel_presenter():
	if _ai_panel_presenter == null:
		_ai_panel_presenter = AIPanelPresenterScript.new()
	_ai_panel_presenter.configure(WorldStore.world, WorldStore.map_layout, _target_faction_id)
	return _ai_panel_presenter

func _resolve_battle_report_presenter():
	if _battle_report_presenter == null:
		_battle_report_presenter = BattleReportPresenterScript.new()
	_battle_report_presenter.configure(WorldStore.world, WorldStore.map_layout, _target_faction_id)
	return _battle_report_presenter

func _resolve_world_event_activity_presenter():
	if _world_event_activity_presenter == null:
		_world_event_activity_presenter = WorldEventActivityPresenterScript.new()
	return _world_event_activity_presenter

func _resolve_overlay_runtime_helper():
	if _overlay_runtime_helper == null:
		_overlay_runtime_helper = OverlayRuntimeHelperScript.new()
	return _overlay_runtime_helper

func _apply_overlay_runtime_state_patch(runtime_state_patch: Dictionary) -> void:
	if runtime_state_patch.is_empty():
		return
	var next_runtime_state: Dictionary = _resolve_overlay_runtime_helper().apply_runtime_state_patch(runtime_state_patch)
	_active_city_state_id = str(next_runtime_state.get("active_city_state_id", ""))
	_active_troop_panel_unit_id = str(next_runtime_state.get("active_troop_panel_unit_id", ""))
	_active_troop_panel_facility_id = str(next_runtime_state.get("active_troop_panel_facility_id", ""))

func _resolve_slg_domain_action_adapter():
	if _slg_domain_action_adapter == null:
		_slg_domain_action_adapter = SlgDomainActionAdapterScript.new()
	_slg_domain_action_adapter.configure(_api_client, _target_faction_id)
	return _slg_domain_action_adapter

func _build_runtime_panel_context() -> Dictionary:
	var control_context := WorldStore.get_resolved_ai_control_context(_target_faction_id)
	var panel_context: Dictionary = _resolve_runtime_context_presenter().build_panel_context(
		_runtime_seat_count,
		_runtime_online_seat_count,
		str(control_context.get("autonomyLevel", _runtime_autonomy_level)).strip_edges(),
		str(control_context.get("controlMode", _runtime_control_mode)).strip_edges(),
		SessionStore.session_id if SessionStore.session_id != "" else "none",
		_runtime_last_action,
		_runtime_last_action_status,
		_runtime_last_action_tick,
		_runtime_action_receipt
	)
	panel_context["ai_chat_history_snapshot"] = _build_ai_chat_history_snapshot()
	return panel_context

func _build_ai_chat_history_snapshot() -> Dictionary:
	if _main_chat_overlay == null or not is_instance_valid(_main_chat_overlay):
		return {}
	if not _main_chat_overlay.has_method("get_ai_chat_history_snapshot"):
		return {}
	var snapshot_variant = _main_chat_overlay.call("get_ai_chat_history_snapshot", _resolve_ai_panel_chat_player_id(), 24)
	if snapshot_variant is Dictionary:
		return (snapshot_variant as Dictionary).duplicate(true)
	return {}

func _resolve_ai_panel_chat_player_id() -> String:
	var ai_state := WorldStore.get_ai_state(_target_faction_id)
	var primary_ai_player_id := str(ai_state.get("playerRuntimePrimaryAiPlayerId", "")).strip_edges()
	if primary_ai_player_id != "":
		return primary_ai_player_id
	return ""

func _sync_world_store_ai_control_context(authority_source: String) -> void:
	if _target_faction_id == "":
		return
	var autonomy_level := _runtime_autonomy_level.strip_edges()
	var control_mode := _runtime_control_mode.strip_edges()
	if autonomy_level == "" or autonomy_level == "unknown":
		return
	if control_mode == "" or control_mode == "unknown":
		return
	WorldStore.set_ai_control_state(_target_faction_id, {
		"autonomyLevel": autonomy_level,
		"controlMode": control_mode,
		"authoritySource": authority_source,
		"sessionId": SessionStore.session_id,
		"seatId": SessionStore.seat_id,
		"sessionMode": _runtime_session_mode,
	})

func _sync_world_store_ai_control_context_from_snapshot(snapshot: Dictionary) -> void:
	if _target_faction_id == "":
		return
	var snapshot_faction_id := str(snapshot.get("runtimeApiFactionId", "")).strip_edges()
	if snapshot_faction_id != "" and snapshot_faction_id != "none" and snapshot_faction_id != _target_faction_id:
		return
	var snapshot_autonomy_level := str(snapshot.get("runtimeApiAutonomyLevel", "")).strip_edges()
	var snapshot_control_mode := str(snapshot.get("runtimeApiControlMode", "")).strip_edges()
	if snapshot_autonomy_level == "" or snapshot_autonomy_level == "unknown":
		return
	if snapshot_control_mode == "" or snapshot_control_mode == "unknown":
		return
	_runtime_autonomy_level = snapshot_autonomy_level
	_runtime_control_mode = snapshot_control_mode
	_sync_world_store_ai_control_context("session_runtime_poll")

func _read_target_faction_state() -> Dictionary:
	var world_data: Dictionary = WorldStore.world
	var raw_factions: Variant = world_data.get("factions", {})
	if raw_factions is Dictionary and _target_faction_id != "":
		var faction_state: Variant = (raw_factions as Dictionary).get(_target_faction_id, {})
		if faction_state is Dictionary:
			return faction_state
	return {}

func _read_target_units() -> Array:
	var world_data: Dictionary = WorldStore.world
	var raw_units: Variant = world_data.get("units", [])
	if not (raw_units is Array):
		return []
	var target_units: Array = []
	for unit_variant in raw_units as Array:
		if not (unit_variant is Dictionary):
			continue
		var unit: Dictionary = unit_variant as Dictionary
		if _target_faction_id != "" and str(unit.get("faction", "")).strip_edges() != _target_faction_id:
			continue
		target_units.append(unit)
	return target_units

func _read_city_clusters() -> Array:
	var map_layout_data: Dictionary = WorldStore.map_layout
	var world_data: Dictionary = WorldStore.world
	var layout_map: Dictionary = map_layout_data.get("map", {}) as Dictionary
	var layout_overlays: Dictionary = layout_map.get("overlays", {}) as Dictionary
	var direct_layout_overlays: Dictionary = map_layout_data.get("overlays", {}) as Dictionary
	var world_map: Dictionary = world_data.get("map", {}) as Dictionary
	var world_overlays: Dictionary = world_map.get("overlays", {}) as Dictionary
	var candidates: Array = [
		layout_overlays.get("cityClusters", []),
		direct_layout_overlays.get("cityClusters", []),
		world_overlays.get("cityClusters", []),
	]
	for candidate in candidates:
		if candidate is Array and not (candidate as Array).is_empty():
			return candidate
	return []

func _refresh_main_city_hub_context() -> void:
	if _main_city_hub_overlay == null:
		return
	if _main_city_hub_overlay.has_method("set_context"):
		_main_city_hub_overlay.call("set_context", _build_main_city_hub_context())

func _build_main_city_hub_context() -> Dictionary:
	var faction_state: Dictionary = _read_target_faction_state()
	var hero_command: Dictionary = faction_state.get("heroCommand", {}) as Dictionary
	var home_tile_id := str(hero_command.get("homeTileId", "")).strip_edges()
	var city_clusters: Array = _read_city_clusters()
	var primary_cluster: Dictionary = _find_primary_city_cluster(city_clusters, home_tile_id)
	var tile_id := home_tile_id
	if tile_id == "":
		tile_id = str(primary_cluster.get("cityHallTileId", primary_cluster.get("centerTileId", ""))).strip_edges()
	var tile_data: Dictionary = _read_tile_data(tile_id)
	var title := _read_tile_name(tile_id)
	if title == "":
		title = str(primary_cluster.get("name", "")).strip_edges()
	if title == "":
		title = "主城中枢"
	var development_points := int(hero_command.get("developmentPoints", 0))
	var captured_cities: Array = faction_state.get("capturedCities", []) as Array
	return {
		"title": title,
		"subtitle": "主城入口 | 城%s | 开发%s" % [str(captured_cities.size()), str(development_points)],
		"status": "世界主壳对象直达二级面板",
		"tileId": tile_id,
		"tileX": int(tile_data.get("x", -1)),
		"tileY": int(tile_data.get("y", -1)),
	}

func _build_main_city_hub_context_from_map_node_click(context: Dictionary) -> Dictionary:
	var tile_id := str(context.get("tileId", "")).strip_edges()
	var title := str(context.get("title", "")).strip_edges()
	if title == "":
		title = "主城中枢"
	var faction_id := str(context.get("factionId", "")).strip_edges()
	var city_level := int(context.get("cityLevel", 1))
	var subtitle_parts: Array[String] = ["地图主城节点", "Lv%s" % str(city_level)]
	if faction_id != "":
		subtitle_parts.append(faction_id)
	return {
		"title": title,
		"subtitle": " | ".join(subtitle_parts),
		"status": "地图节点点击展开主城入口",
		"tileId": tile_id,
		"tileX": int(context.get("tileX", -1)),
		"tileY": int(context.get("tileY", -1)),
		"tmxX": int(context.get("tmxX", -1)),
		"tmxY": int(context.get("tmxY", -1)),
		"factionId": faction_id,
		"cityLevel": city_level,
	}

func _find_primary_city_cluster(city_clusters: Array, home_tile_id: String) -> Dictionary:
	for item in city_clusters:
		var cluster: Dictionary = item as Dictionary
		if str(cluster.get("centerTileId", "")) == home_tile_id or str(cluster.get("cityHallTileId", "")) == home_tile_id:
			return cluster
		var tile_ids: Variant = cluster.get("tileIds", [])
		if tile_ids is Array and home_tile_id in (tile_ids as Array):
			return cluster
	for item in city_clusters:
		var cluster: Dictionary = item as Dictionary
		if str(cluster.get("owner", "")) == _target_faction_id:
			return cluster
	return {}

func _read_tile_data(tile_id: String) -> Dictionary:
	if tile_id == "":
		return {}
	var map_layout_data: Dictionary = WorldStore.map_layout
	var world_data: Dictionary = WorldStore.world
	var candidate_tile_lists: Array = [
		(map_layout_data.get("map", {}) as Dictionary).get("tiles", []),
		map_layout_data.get("tiles", []),
		(world_data.get("map", {}) as Dictionary).get("tiles", []),
	]
	for candidate in candidate_tile_lists:
		if not (candidate is Array):
			continue
		for item in candidate:
			var tile: Dictionary = item as Dictionary
			if str(tile.get("id", "")) == tile_id:
				return tile
	return {}

func _read_tile_name(tile_id: String) -> String:
	if tile_id == "":
		return ""
	var map_layout_data: Dictionary = WorldStore.map_layout
	var world_data: Dictionary = WorldStore.world
	var candidate_tile_lists: Array = [
		(map_layout_data.get("map", {}) as Dictionary).get("tiles", []),
		map_layout_data.get("tiles", []),
		(world_data.get("map", {}) as Dictionary).get("tiles", []),
	]
	for candidate in candidate_tile_lists:
		if not (candidate is Array):
			continue
		for item in candidate:
			var tile: Dictionary = item as Dictionary
			if str(tile.get("id", "")) == tile_id:
				return str(tile.get("name", ""))
	return ""

func _is_truthy_env(key: String) -> bool:
	var value: String = OS.get_environment(key).strip_edges().to_lower()
	return value == "1" or value == "true" or value == "yes"


func _resolve_boot_display_mode() -> String:
	var requested_mode: String = OS.get_environment("SLG_BOOT_DISPLAY_MODE").strip_edges().to_lower()
	if requested_mode == DISPLAY_MODE_WORLD:
		return DISPLAY_MODE_WORLD
	return DISPLAY_MODE_CITY


func _should_auto_quit() -> bool:
	var forced_quit: String = OS.get_environment("SLG_BOOTSTRAP_QUIT").strip_edges().to_lower()
	if forced_quit == "1" or forced_quit == "true" or forced_quit == "yes":
		return true
	return OS.has_feature("headless") or DisplayServer.get_name() == "headless"
