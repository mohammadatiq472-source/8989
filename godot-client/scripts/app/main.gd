extends Node

const BackendApiClientScript = preload("res://scripts/infra/http/backend_api_client.gd")
const ObservabilityBridgeScript = preload("res://scripts/infra/observability/observability_bridge.gd")

@export var runtime_label_path: NodePath = NodePath("HoverLayer/RuntimeInfo")
@export var observability_panel_path: NodePath = NodePath("ObservabilityPanel")
@export var refresh_button_path: NodePath = NodePath("HoverLayer/RefreshWorldButton")
@export var advance_tick_button_path: NodePath = NodePath("HoverLayer/AdvanceTickButton")

var _api_client
var _runtime_label: Label
var _observability_panel: Node
var _refresh_button: Button
var _advance_tick_button: Button
var _observability_bridge
var _active_map_scope: String = "bootstrap"
var _request_in_flight: bool = false
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

func _ready() -> void:
	print("[godot-bootstrap] start")
	_api_client = BackendApiClientScript.new()
	add_child(_api_client)
	_api_client.configure(AppConfig.backend_base_url)
	_active_map_scope = AppConfig.map_layout_scope
	_runtime_label = get_node_or_null(runtime_label_path) as Label
	_observability_panel = get_node_or_null(observability_panel_path)
	_refresh_button = get_node_or_null(refresh_button_path) as Button
	_advance_tick_button = get_node_or_null(advance_tick_button_path) as Button
	_observability_bridge = ObservabilityBridgeScript.new()
	add_child(_observability_bridge)
	_observability_bridge.configure(_api_client, AppConfig.backend_base_url)
	var snapshot_callback := Callable(self, "_on_observability_snapshot_updated")
	if _observability_bridge.has_signal("snapshot_updated") and not _observability_bridge.snapshot_updated.is_connected(snapshot_callback):
		_observability_bridge.snapshot_updated.connect(snapshot_callback)

	_connect_ui_actions()
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
		"runtimeFactionId": "none",
		"runtimeControlMode": "unknown",
		"runtimeAutonomyLevel": "unknown",
		"runtimeSeatCount": 0,
		"runtimeOnlineSeatCount": 0,
		"runtimePlayerNames": "none",
		"runtimeSessionId": "none",
		"runtimeSeatId": "none",
		"runtimeSessionMode": "bootstrap",
		"runtimeTick": "unknown",
		"runtimeWorldVersion": "unknown",
	})

	await _bootstrap_runtime_world()

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
	var runtime_result: Dictionary = await _api_client.get_runtime()
	if not bool(runtime_result.get("ok", false)):
		push_error("[godot-bootstrap] runtime request failed: %s" % str(runtime_result))
		_update_runtime_label("runtime failed")
		return

	var runtime_data: Dictionary = runtime_result.get("data", {}) as Dictionary
	_target_faction_id = _resolve_target_faction_id(runtime_data)
	if _target_faction_id == "":
		push_error("[godot-bootstrap] no faction available in runtime response")
		_update_runtime_label("no faction in runtime")
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
			_runtime_autonomy_level = SessionStore.autonomy_level
			_runtime_control_mode = SessionStore.control_mode
			_runtime_session_mode = "joined"
	else:
		print("[godot-bootstrap] join skipped for faction=%s (already online)" % _target_faction_id)
		_runtime_session_mode = "reused" if (SessionStore.faction_id == _target_faction_id and SessionStore.token != "") else "readonly"
		SessionStore.set_control_context(_runtime_autonomy_level, _runtime_control_mode)

	var refresh_ok: bool = await _refresh_world_and_map(true)
	if not refresh_ok:
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

func _connect_ui_actions() -> void:
	var refresh_callback := Callable(self, "_on_refresh_world_pressed")
	if _refresh_button != null and not _refresh_button.pressed.is_connected(refresh_callback):
		_refresh_button.pressed.connect(refresh_callback)

	var advance_callback := Callable(self, "_on_advance_tick_pressed")
	if _advance_tick_button != null and not _advance_tick_button.pressed.is_connected(advance_callback):
		_advance_tick_button.pressed.connect(advance_callback)

func _on_refresh_world_pressed() -> void:
	if _request_in_flight:
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

func _execute_advance_tick(source: String) -> void:
	_set_request_state(true, "advanceTick %s..." % source)
	var advance_result: Dictionary = await _api_client.advance_tick(true)
	if not bool(advance_result.get("ok", false)):
		push_warning("[godot-runtime] advanceTick request failed: %s" % str(advance_result))
		_record_last_action("advanceTick", "request_failed")
		_set_request_state(false, "advanceTick failed")
		return

	var action_payload: Dictionary = advance_result.get("data", {}) as Dictionary
	if not bool(action_payload.get("ok", false)):
		push_warning("[godot-runtime] advanceTick action returned ok=false: %s" % str(action_payload))
		_record_last_action("advanceTick", "rejected")
		_set_request_state(false, "advanceTick rejected")
		return

	var action_world: Variant = action_payload.get("world", null)
	if action_world is Dictionary:
		WorldStore.set_world(action_world as Dictionary)
		_update_runtime_label("advanceTick ok")
	else:
		var refresh_ok: bool = await _refresh_world_and_map(false)
		if not refresh_ok:
			_record_last_action("advanceTick", "ok_refresh_failed")
			_set_request_state(false, "advanceTick ok, refresh failed")
			return
		_update_runtime_label("advanceTick ok + refresh")

	_record_last_action("advanceTick", "ok")
	_set_request_state(false, "advanceTick %s ok" % source)

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

	var map_result: Dictionary = await _api_client.get_map_layout(_active_map_scope)
	if not bool(map_result.get("ok", false)) and int(map_result.get("status", 0)) == 403 and _active_map_scope == "full":
		print("[godot-runtime] map scope=full unavailable, fallback to scope=bootstrap")
		_active_map_scope = "bootstrap"
		map_result = await _api_client.get_map_layout(_active_map_scope)

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
	_request_in_flight = in_flight
	if _refresh_button != null:
		_refresh_button.disabled = in_flight
	if _advance_tick_button != null:
		_advance_tick_button.disabled = in_flight
	_update_runtime_label(status_message)

func _start_observability() -> void:
	if _observability_bridge == null:
		return
	_observability_bridge.bind_session(_target_faction_id, SessionStore.token)
	_observability_bridge.start()

func _on_observability_snapshot_updated(snapshot: Dictionary) -> void:
	_update_observability_panel(snapshot)

func _update_runtime_label(status_message: String) -> void:
	if _runtime_label == null:
		return

	var world_data: Dictionary = WorldStore.world
	var display_control_mode: String = SessionStore.control_mode if SessionStore.control_mode != "" else _runtime_control_mode
	var display_autonomy_level: String = SessionStore.autonomy_level if SessionStore.autonomy_level != "" else _runtime_autonomy_level
	_runtime_label.text = (
		"Runtime | status=%s | faction=%s | mode=%s | autonomy=%s | tick=%s | worldVersion=%s | mapScope=%s | seats=%s/%s | session=%s | sessionMode=%s"
		% [
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
	var display_control_mode: String = SessionStore.control_mode if SessionStore.control_mode != "" else _runtime_control_mode
	var display_autonomy_level: String = SessionStore.autonomy_level if SessionStore.autonomy_level != "" else _runtime_autonomy_level
	return {
		"runtimeFactionId": _target_faction_id if _target_faction_id != "" else "none",
		"runtimeControlMode": display_control_mode,
		"runtimeAutonomyLevel": display_autonomy_level,
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
	}

func _record_last_action(action_name: String, status: String) -> void:
	_runtime_last_action = action_name
	_runtime_last_action_status = status
	_runtime_last_action_tick = _read_tick_label(WorldStore.world)

func _is_truthy_env(key: String) -> bool:
	var value: String = OS.get_environment(key).strip_edges().to_lower()
	return value == "1" or value == "true" or value == "yes"

func _should_auto_quit() -> bool:
	var forced_quit: String = OS.get_environment("SLG_BOOTSTRAP_QUIT").strip_edges().to_lower()
	if forced_quit == "1" or forced_quit == "true" or forced_quit == "yes":
		return true
	return OS.has_feature("headless") or DisplayServer.get_name() == "headless"
