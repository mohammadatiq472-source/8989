extends Node
class_name UIPreviewDataAdapter

const BackendApiClientScript = preload("res://scripts/infra/http/backend_api_client.gd")

const SOURCE_FIXTURE := "fixture"
const SOURCE_BACKEND := "backend"

var _api_client: BackendApiClient
var _story_id: String = ""
var _story_title: String = ""
var _story_description: String = ""
var _payload_path: String = ""
var _requested_source_mode: String = SOURCE_FIXTURE
var _effective_source_mode: String = SOURCE_FIXTURE
var _backend_base_url: String = ""
var _supported_source_modes: Array = []
var _status: Dictionary = {}
var _last_error: String = ""
var _last_error_detail: String = ""
var _last_loaded_at_unix: int = 0
var _last_duration_ms: int = 0


func configure(
	story_id: String,
	story_title: String,
	story_description: String,
	payload_path: String,
	source_mode: String,
	backend_base_url: String,
	supported_source_modes: Array = []) -> void:
	_story_id = story_id.strip_edges()
	_story_title = story_title.strip_edges()
	_story_description = story_description.strip_edges()
	_payload_path = payload_path.strip_edges()
	_requested_source_mode = _normalize_source_mode(source_mode)
	_effective_source_mode = SOURCE_FIXTURE
	_backend_base_url = backend_base_url.strip_edges().rstrip("/")
	_supported_source_modes = _normalize_supported_source_modes(supported_source_modes)
	_last_error = ""
	_last_error_detail = ""
	_ensure_api_client()
	_update_status("idle", false, "configured")


func set_source_mode(source_mode: String) -> void:
	_requested_source_mode = _normalize_source_mode(source_mode)
	if not supports_source_mode(_requested_source_mode):
		_effective_source_mode = SOURCE_FIXTURE
		_update_status("fallback", true, "unsupported_source_mode")
	else:
		_effective_source_mode = _requested_source_mode
		_update_status("idle", false, "source_mode_updated")


func get_source_mode() -> String:
	return _requested_source_mode


func get_effective_source_mode() -> String:
	return _effective_source_mode


func get_status() -> Dictionary:
	return _status.duplicate(true)


func supports_source_mode(source_mode: String) -> bool:
	var normalized := _normalize_source_mode(source_mode)
	if normalized == SOURCE_FIXTURE:
		return true
	return _available_source_modes().has(normalized)


func load_story_payload() -> Dictionary:
	var started_ms := Time.get_ticks_msec()
	var fallback_used := false
	var requested_mode := _requested_source_mode
	var payload: Dictionary = {}

	_update_status("loading", false, "requesting_payload")

	if requested_mode == SOURCE_BACKEND and supports_source_mode(SOURCE_BACKEND):
		payload = await _load_backend_payload()
		if payload.is_empty():
			fallback_used = true
			requested_mode = SOURCE_FIXTURE
			payload = _load_fixture_payload()
	else:
		requested_mode = SOURCE_FIXTURE
		payload = _load_fixture_payload()

	if payload.is_empty():
		_last_loaded_at_unix = int(Time.get_unix_time_from_system())
		_last_duration_ms = int(Time.get_ticks_msec() - started_ms)
		_last_error = "payload_missing"
		_last_error_detail = _payload_path
		_update_status("error", fallback_used, "payload_missing")
		return {}

	_effective_source_mode = requested_mode
	_last_loaded_at_unix = int(Time.get_unix_time_from_system())
	_last_duration_ms = int(Time.get_ticks_msec() - started_ms)
	_last_error = ""
	_last_error_detail = ""
	_update_status("ready", fallback_used, "payload_loaded")
	return _decorate_payload(payload, fallback_used)


func _ensure_api_client() -> void:
	if _api_client != null:
		_api_client.configure(_backend_base_url)
		return
	_api_client = BackendApiClientScript.new()
	add_child(_api_client)
	_api_client.configure(_backend_base_url)


func _load_fixture_payload() -> Dictionary:
	if _payload_path == "" or not FileAccess.file_exists(_payload_path):
		_last_error = "fixture_payload_missing"
		_last_error_detail = _payload_path
		return {}
	var file := FileAccess.open(_payload_path, FileAccess.READ)
	if file == null:
		_last_error = "fixture_payload_open_failed"
		_last_error_detail = _payload_path
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	file.close()
	if not (parsed is Dictionary):
		_last_error = "fixture_payload_parse_failed"
		_last_error_detail = _payload_path
		return {}
	return (parsed as Dictionary).duplicate(true)


func _load_backend_payload() -> Dictionary:
	if _api_client == null:
		_last_error = "api_client_missing"
		_last_error_detail = "BackendApiClient unavailable"
		return {}
	if _story_id == "observability":
		return await _build_backend_observability_payload()
	if _story_id == "hud_token":
		return await _build_backend_hud_payload()
	return _load_fixture_payload()


func _build_backend_observability_payload() -> Dictionary:
	var runtime_result: Dictionary = await _api_client.get_runtime()
	var events_result: Dictionary = await _api_client.get_events(20)
	var civil_result: Dictionary = await _api_client.get_civil_memory(20)
	if not bool(runtime_result.get("ok", false)):
		_last_error = "runtime_request_failed"
		_last_error_detail = str(runtime_result.get("message", runtime_result.get("status", "unknown")))
		return {}

	var payload := _load_fixture_payload()
	if payload.is_empty():
		payload = {
			"schemaVersion": 1,
			"storyId": _story_id,
			"title": _story_title,
			"description": _story_description,
			"captureTargets": [],
			"states": [],
		}

	var runtime_payload: Dictionary = runtime_result.get("data", {}) as Dictionary
	var events_payload: Dictionary = events_result.get("data", {}) as Dictionary if bool(events_result.get("ok", false)) else {}
	var civil_payload: Dictionary = civil_result.get("data", {}) as Dictionary if bool(civil_result.get("ok", false)) else {}
	payload["states"] = [
		{
			"id": "live",
			"label": "Live Backend",
			"snapshot": _build_observability_snapshot(runtime_payload, events_payload, civil_payload),
		}
	]
	payload["activeStateId"] = "live"
	payload["activeStateIndex"] = 0
	return payload


func _build_backend_hud_payload() -> Dictionary:
	var runtime_result: Dictionary = await _api_client.get_runtime()
	var world_result: Dictionary = await _api_client.get_world_summary()
	if not bool(runtime_result.get("ok", false)):
		_last_error = "runtime_request_failed"
		_last_error_detail = str(runtime_result.get("message", runtime_result.get("status", "unknown")))
		return {}

	var payload := _load_fixture_payload()
	if payload.is_empty():
		payload = {
			"schemaVersion": 1,
			"storyId": _story_id,
			"title": _story_title,
			"description": _story_description,
			"captureTargets": [],
			"states": [],
		}

	var runtime_payload: Dictionary = runtime_result.get("data", {}) as Dictionary
	var world_payload: Dictionary = world_result.get("data", {}) as Dictionary if bool(world_result.get("ok", false)) else {}
	var runtime_faction: Dictionary = _pick_runtime_faction_row(runtime_payload.get("factions", []), "")
	payload["states"] = [
		{
			"id": "live",
			"label": "Live Backend",
			"headline": "SLG HUD | backend preview",
			"cardTitle": "Live runtime snapshot",
			"hoverInfo": "Hover | backend data path active.",
			"perfInfo": "Perf | runtime tick=%s worldVersion=%s" % [str(runtime_payload.get("tick", "unknown")), str(runtime_payload.get("worldVersion", "unknown"))],
			"runtimeInfo": "Runtime | faction=%s mode=%s autonomy=%s seats=%s/%s world=%s" % [
				str(runtime_faction.get("factionId", "none")),
				str(runtime_faction.get("controlMode", "unknown")),
				str(runtime_faction.get("autonomyLevel", "unknown")),
				str(runtime_faction.get("onlineSeatCount", 0)),
				str(runtime_faction.get("seatCount", 0)),
				_summarize_world_like(world_payload),
			],
			"summary": "Backend-derived HUD payload generated by the preview adapter.",
			"refreshLabel": "Refresh Live Snapshot",
			"advanceLabel": "Advance Runtime Tick",
			"exportLabel": "Export Live Baseline",
			"accentColor": {"r": 0.25, "g": 0.58, "b": 0.94, "a": 1.0},
		}
	]
	payload["activeStateId"] = "live"
	payload["activeStateIndex"] = 0
	return payload


func _build_observability_snapshot(runtime_payload: Dictionary, events_payload: Dictionary, civil_payload: Dictionary) -> Dictionary:
	var runtime_faction: Dictionary = _pick_runtime_faction_row(runtime_payload.get("factions", []), "")
	var events_items: Array = events_payload.get("items", []) as Array
	var civil_items: Array = civil_payload.get("items", []) as Array
	var ws_stats: Dictionary = events_payload.get("wsStats", {}) as Dictionary
	return {
		"wsState": "open",
		"wsSubscribed": true,
		"wsMessageCount": events_items.size(),
		"wsTickDeltaCount": 0,
		"wsGeneralMessageCount": 0,
		"wsErrorCount": 0,
		"eventsPollOkCount": 1,
		"eventsPollFailCount": 0,
		"eventsLastCount": events_items.size(),
		"eventsLastId": _get_last_id(events_items),
		"eventsLastSummary": _summarize_event(events_items[0] if events_items.size() > 0 else {}),
		"runtimePollOkCount": 1,
		"runtimePollFailCount": 0,
		"runtimeApiTick": _to_numeric_label(runtime_payload.get("tick", "unknown")),
		"runtimeApiWorldVersion": _to_numeric_label(runtime_payload.get("worldVersion", "unknown")),
		"runtimeApiFactionCount": (runtime_payload.get("factions", []) as Array).size(),
		"runtimeApiFactionId": str(runtime_faction.get("factionId", "none")),
		"runtimeApiControlMode": str(runtime_faction.get("controlMode", "unknown")),
		"runtimeApiAutonomyLevel": str(runtime_faction.get("autonomyLevel", "unknown")),
		"runtimeApiSeatOnline": "%s/%s" % [str(int(runtime_faction.get("onlineSeatCount", 0))), str(int(runtime_faction.get("seatCount", 0)))],
		"runtimeApiPlayerNames": _format_player_names(runtime_faction.get("playerNames", [])),
		"civilMemoryPollOkCount": 1,
		"civilMemoryPollFailCount": 0,
		"civilMemoryLastCount": civil_items.size(),
		"civilMemoryLastType": _get_last_civil_type(civil_items),
		"civilMemoryLastSummary": _get_last_summary(civil_items),
		"civilMemoryProvider": _get_civil_provider_label(civil_payload),
		"civilMemoryLifecycle": _get_civil_provider_value(civil_payload, "lifecycle", "warm"),
		"civilMemoryDowngraded": "yes" if bool(_get_civil_provider_value(civil_payload, "downgraded", false)) else "no",
		"civilMemoryProviderReason": str(_get_civil_provider_value(civil_payload, "reason", "backend live snapshot")),
		"backendWsConnections": int(ws_stats.get("totalConnections", 0)),
		"backendWsSubscribedConnections": int(ws_stats.get("subscribedConnections", 0)),
		"backendWsFactionDistribution": _format_faction_distribution(ws_stats.get("factionDistribution", {}) as Dictionary),
		"backendWsRecentError": _summarize_recent_ws_error(ws_stats.get("recentErrors", [])),
	}


func _decorate_payload(payload: Dictionary, fallback_used: bool) -> Dictionary:
	var decorated := payload.duplicate(true)
	decorated["storyId"] = _story_id
	decorated["title"] = str(decorated.get("title", _story_title))
	decorated["description"] = str(decorated.get("description", _story_description))
	decorated["sourceMode"] = _requested_source_mode
	decorated["effectiveSourceMode"] = _effective_source_mode
	decorated["dataSource"] = {
		"requestedMode": _requested_source_mode,
		"effectiveMode": _effective_source_mode,
		"fallbackUsed": fallback_used,
		"availableModes": _available_source_modes(),
	}
	var adapter_meta := get_status()
	adapter_meta["lastLoadedAtUnix"] = _last_loaded_at_unix
	adapter_meta["lastDurationMs"] = _last_duration_ms
	adapter_meta["storyTitle"] = _story_title
	adapter_meta["storyDescription"] = _story_description
	adapter_meta["payloadPath"] = _payload_path
	adapter_meta["backendBaseUrl"] = _backend_base_url
	decorated["adapter"] = adapter_meta
	decorated["validation"] = _merge_validation_contract(decorated, _extract_state_ids(decorated), _available_source_modes())
	return decorated


func _merge_validation_contract(payload: Dictionary, required_state_ids: Array, source_modes: Array) -> Dictionary:
	var validation: Dictionary = {}
	var raw_validation: Variant = payload.get("validation", {})
	if raw_validation is Dictionary:
		validation = (raw_validation as Dictionary).duplicate(true)
	var capture_targets := _extract_capture_targets(payload)
	if not capture_targets.is_empty():
		validation["captureTargets"] = capture_targets
	if not required_state_ids.is_empty():
		validation["requiredStateIds"] = required_state_ids.duplicate(true)
	if not source_modes.is_empty():
		validation["sourceModes"] = source_modes.duplicate(true)
	validation["schemaVersion"] = 1
	return validation


func _extract_capture_targets(payload: Dictionary) -> Array:
	var raw_targets: Variant = payload.get("captureTargets", [])
	var validation: Variant = payload.get("validation", {})
	if validation is Dictionary:
		var validation_targets: Variant = (validation as Dictionary).get("captureTargets", [])
		if validation_targets is Array and not (validation_targets as Array).is_empty():
			raw_targets = validation_targets
	if raw_targets is Array:
		var targets: Array = []
		for item in raw_targets:
			targets.append(str(item))
		return targets
	return []


func _extract_state_ids(payload: Dictionary) -> Array:
	var state_ids: Array = []
	var raw_states: Variant = payload.get("states", [])
	if raw_states is Array:
		for item in raw_states:
			if item is Dictionary:
				var state_id := str((item as Dictionary).get("id", "")).strip_edges()
				if state_id != "":
					state_ids.append(state_id)
	return state_ids


func _available_source_modes() -> Array:
	var modes: Array = [SOURCE_FIXTURE]
	for mode in _supported_source_modes:
		var normalized := _normalize_source_mode(str(mode))
		if normalized != "" and not modes.has(normalized):
			modes.append(normalized)
	return modes


func _normalize_supported_source_modes(source_modes: Array) -> Array:
	var modes: Array = []
	for mode in source_modes:
		var normalized := _normalize_source_mode(str(mode))
		if normalized != "" and not modes.has(normalized):
			modes.append(normalized)
	if modes.is_empty():
		modes.append(SOURCE_FIXTURE)
	return modes


func _normalize_source_mode(source_mode: String) -> String:
	var normalized := source_mode.strip_edges().to_lower()
	if normalized in ["fixture", "local", "fake", "mock"]:
		return SOURCE_FIXTURE
	if normalized in ["backend", "live", "real", "server"]:
		return SOURCE_BACKEND
	return SOURCE_FIXTURE


func _update_status(state: String, fallback_used: bool, reason: String) -> void:
	_status = {
		"storyId": _story_id,
		"storyTitle": _story_title,
		"storyDescription": _story_description,
		"requestedSourceMode": _requested_source_mode,
		"effectiveSourceMode": _effective_source_mode,
		"availableSourceModes": _available_source_modes(),
		"backendBaseUrl": _backend_base_url,
		"state": state,
		"fallbackUsed": fallback_used,
		"reason": reason,
		"lastLoadedAtUnix": _last_loaded_at_unix,
		"lastDurationMs": _last_duration_ms,
		"lastError": _last_error,
		"lastErrorDetail": _last_error_detail,
	}


func _pick_runtime_faction_row(raw_factions: Variant, preferred_faction_id: String) -> Dictionary:
	if raw_factions is Array:
		var factions: Array = raw_factions
		for item in factions:
			if not (item is Dictionary):
				continue
			var row: Dictionary = item as Dictionary
			if preferred_faction_id != "" and str(row.get("factionId", "")) == preferred_faction_id:
				return row
		for item in factions:
			if item is Dictionary:
				return item as Dictionary
	return {}


func _format_player_names(raw_player_names: Variant) -> String:
	if raw_player_names is Array:
		var names: Array = raw_player_names
		if names.is_empty():
			return "none"
		var parts: PackedStringArray = PackedStringArray()
		for name in names:
			parts.append(str(name))
		return ",".join(parts).left(72)
	return "none"


func _to_numeric_label(value: Variant) -> String:
	if value is int:
		return str(value)
	if value is float:
		return str(int(value))
	return str(value)


func _summarize_event(event_item: Variant) -> String:
	if not (event_item is Dictionary):
		return "none"
	var event_dict: Dictionary = event_item as Dictionary
	var summary: String = str(event_dict.get("summary", "")).strip_edges()
	if summary != "":
		return summary.left(80)
	var event_type: String = str(event_dict.get("type", "unknown"))
	var tick: String = str(event_dict.get("tick", "unknown"))
	return "type=%s tick=%s" % [event_type, tick]


func _summarize_recent_ws_error(recent_errors: Variant) -> String:
	if recent_errors is Array:
		var errors: Array = recent_errors
		if errors.size() > 0 and errors[0] is Dictionary:
			var item: Dictionary = errors[0] as Dictionary
			var stage: String = str(item.get("stage", "unknown"))
			var faction_id: String = str(item.get("factionId", "-"))
			var message: String = str(item.get("message", "unknown"))
			return "[%s/%s] %s" % [stage, faction_id, message.left(60)]
	return "none"


func _format_faction_distribution(faction_distribution: Dictionary) -> String:
	if faction_distribution.is_empty():
		return "none"
	var parts: PackedStringArray = PackedStringArray()
	for faction_id in faction_distribution.keys():
		parts.append("%s:%s" % [str(faction_id), str(faction_distribution.get(faction_id, 0))])
	return ",".join(parts)


func _get_last_id(items: Array) -> String:
	if items.is_empty():
		return "none"
	if items[0] is Dictionary:
		return str((items[0] as Dictionary).get("id", "none"))
	return "none"


func _get_last_civil_type(items: Array) -> String:
	if items.is_empty():
		return "none"
	if items[0] is Dictionary:
		return str((items[0] as Dictionary).get("type", "unknown"))
	return "none"


func _get_last_summary(items: Array) -> String:
	if items.is_empty():
		return "none"
	if items[0] is Dictionary:
		var summary := str((items[0] as Dictionary).get("summary", "none")).strip_edges()
		return summary.left(72) if summary != "" else "none"
	return "none"


func _get_civil_provider_label(payload: Dictionary) -> String:
	var provider: Dictionary = payload.get("memoryProvider", {}) as Dictionary
	if provider.is_empty():
		return "unknown->unknown"
	return "%s->%s" % [str(provider.get("requestedProvider", "unknown")), str(provider.get("activeProvider", "unknown"))]


func _get_civil_provider_value(payload: Dictionary, key: String, fallback: Variant) -> Variant:
	var provider: Dictionary = payload.get("memoryProvider", {}) as Dictionary
	if provider.is_empty():
		return fallback
	return provider.get(key, fallback)


func _summarize_world_like(payload: Dictionary) -> String:
	if payload.is_empty():
		return "none"
	var tick := _to_numeric_label(payload.get("tick", "unknown"))
	var world_version := _to_numeric_label(payload.get("worldVersion", "unknown"))
	var map_data: Dictionary = payload.get("map", {}) as Dictionary
	var width := _to_numeric_label(map_data.get("width", "unknown"))
	var height := _to_numeric_label(map_data.get("height", "unknown"))
	return "tick=%s worldVersion=%s map=%sx%s" % [tick, world_version, width, height]
