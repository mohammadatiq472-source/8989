extends Node
class_name ObservabilityBridge

signal snapshot_updated(snapshot: Dictionary)

@export var events_poll_interval_sec: float = 3.0
@export var events_limit: int = 20
@export var runtime_poll_interval_sec: float = 4.0
@export var civil_memory_poll_interval_sec: float = 5.0
@export var civil_memory_limit: int = 20
@export var ws_reconnect_interval_sec: float = 2.0
@export var ws_ping_interval_sec: float = 5.0

var _api_client
var _base_url: String = ""
var _ws_url: String = ""
var _faction_id: String = ""
var _token: String = ""

var _enabled: bool = false
var _ws_peer: WebSocketPeer
var _ws_subscribe_sent: bool = false
var _events_in_flight: bool = false
var _events_elapsed: float = 0.0
var _runtime_in_flight: bool = false
var _runtime_elapsed: float = 0.0
var _civil_memory_in_flight: bool = false
var _civil_memory_elapsed: float = 0.0
var _ws_reconnect_elapsed: float = 0.0
var _ws_ping_elapsed: float = 0.0

var _snapshot: Dictionary = {
	"wsState": "idle",
	"wsSubscribed": false,
	"wsMessageCount": 0,
	"wsTickDeltaCount": 0,
	"wsGeneralMessageCount": 0,
	"wsErrorCount": 0,
	"wsLastType": "none",
	"wsLastTick": "unknown",
	"eventsPollOkCount": 0,
	"eventsPollFailCount": 0,
	"eventsLastCount": 0,
	"eventsLastId": "none",
	"eventsLastSummary": "none",
	"runtimePollOkCount": 0,
	"runtimePollFailCount": 0,
	"runtimeApiTick": "unknown",
	"runtimeApiWorldVersion": "unknown",
	"runtimeApiFactionCount": 0,
	"runtimeApiFactionId": "none",
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
}

func configure(api_client: Node, base_url: String) -> void:
	_api_client = api_client
	_base_url = base_url.strip_edges().rstrip("/")
	_ws_url = _to_ws_url(_base_url)

func bind_session(faction_id: String, token: String) -> void:
	_faction_id = faction_id.strip_edges()
	_token = token.strip_edges()
	_ws_subscribe_sent = false
	_snapshot["wsSubscribed"] = false
	_emit_snapshot()

func start() -> void:
	_enabled = true
	set_process(true)
	_connect_ws_now()
	_emit_snapshot()

func stop() -> void:
	_enabled = false
	set_process(false)
	_ws_subscribe_sent = false
	_snapshot["wsState"] = "stopped"
	_snapshot["wsSubscribed"] = false
	if _ws_peer != null:
		_ws_peer.close()
	_ws_peer = null
	_emit_snapshot()

func get_snapshot() -> Dictionary:
	return _snapshot.duplicate(true)

func _process(delta: float) -> void:
	if not _enabled:
		return

	_events_elapsed += delta
	if _events_elapsed >= events_poll_interval_sec and not _events_in_flight:
		_events_elapsed = 0.0
		_poll_events_async()

	_runtime_elapsed += delta
	if _runtime_elapsed >= runtime_poll_interval_sec and not _runtime_in_flight:
		_runtime_elapsed = 0.0
		_poll_runtime_async()

	_civil_memory_elapsed += delta
	if _civil_memory_elapsed >= civil_memory_poll_interval_sec and not _civil_memory_in_flight:
		_civil_memory_elapsed = 0.0
		_poll_civil_memory_async()

	_poll_ws(delta)

func _poll_events_async() -> void:
	if _api_client == null:
		return
	_events_in_flight = true
	var result: Dictionary = await _api_client.get_events(events_limit)
	if bool(result.get("ok", false)):
		_snapshot["eventsPollOkCount"] = int(_snapshot.get("eventsPollOkCount", 0)) + 1
		var payload: Dictionary = result.get("data", {}) as Dictionary
		var items: Array = payload.get("items", []) as Array
		_snapshot["eventsLastCount"] = items.size()
		if items.size() > 0:
			var last_item: Dictionary = items[0] as Dictionary
			_snapshot["eventsLastId"] = str(last_item.get("id", "none"))
			_snapshot["eventsLastSummary"] = _summarize_event(last_item)

		var ws_stats: Dictionary = payload.get("wsStats", {}) as Dictionary
		if not ws_stats.is_empty():
			_apply_backend_ws_stats(ws_stats)
	else:
		_snapshot["eventsPollFailCount"] = int(_snapshot.get("eventsPollFailCount", 0)) + 1
	_events_in_flight = false
	_emit_snapshot()

func _poll_runtime_async() -> void:
	if _api_client == null:
		return
	_runtime_in_flight = true
	var result: Dictionary = await _api_client.get_runtime()
	if bool(result.get("ok", false)):
		_snapshot["runtimePollOkCount"] = int(_snapshot.get("runtimePollOkCount", 0)) + 1
		var payload: Dictionary = result.get("data", {}) as Dictionary
		_apply_runtime_payload(payload)
	else:
		_snapshot["runtimePollFailCount"] = int(_snapshot.get("runtimePollFailCount", 0)) + 1
	_runtime_in_flight = false
	_emit_snapshot()

func _poll_civil_memory_async() -> void:
	if _api_client == null:
		return
	_civil_memory_in_flight = true
	var result: Dictionary = await _api_client.get_civil_memory(civil_memory_limit)
	if bool(result.get("ok", false)):
		_snapshot["civilMemoryPollOkCount"] = int(_snapshot.get("civilMemoryPollOkCount", 0)) + 1
		var payload: Dictionary = result.get("data", {}) as Dictionary
		_apply_civil_memory_payload(payload)
	else:
		_snapshot["civilMemoryPollFailCount"] = int(_snapshot.get("civilMemoryPollFailCount", 0)) + 1
	_civil_memory_in_flight = false
	_emit_snapshot()

func _apply_runtime_payload(payload: Dictionary) -> void:
	_snapshot["runtimeApiTick"] = _to_numeric_label(payload.get("tick", "unknown"))
	_snapshot["runtimeApiWorldVersion"] = _to_numeric_label(payload.get("worldVersion", "unknown"))
	var factions: Array = payload.get("factions", []) as Array
	_snapshot["runtimeApiFactionCount"] = factions.size()
	var runtime_faction: Dictionary = _pick_runtime_faction_row(factions)
	if runtime_faction.is_empty():
		_snapshot["runtimeApiFactionId"] = "none"
		_snapshot["runtimeApiControlMode"] = "unknown"
		_snapshot["runtimeApiAutonomyLevel"] = "unknown"
		_snapshot["runtimeApiSeatOnline"] = "0/0"
		_snapshot["runtimeApiPlayerNames"] = "none"
		return

	_snapshot["runtimeApiFactionId"] = str(runtime_faction.get("factionId", "none"))
	_snapshot["runtimeApiControlMode"] = str(runtime_faction.get("controlMode", "unknown"))
	_snapshot["runtimeApiAutonomyLevel"] = str(runtime_faction.get("autonomyLevel", "unknown"))
	var online_seats: int = int(runtime_faction.get("onlineSeatCount", 0))
	var seat_count: int = int(runtime_faction.get("seatCount", 0))
	_snapshot["runtimeApiSeatOnline"] = "%s/%s" % [str(online_seats), str(seat_count)]
	_snapshot["runtimeApiPlayerNames"] = _format_player_names(runtime_faction.get("playerNames", []))

func _apply_civil_memory_payload(payload: Dictionary) -> void:
	var items: Array = payload.get("items", []) as Array
	_snapshot["civilMemoryLastCount"] = items.size()
	_snapshot["civilMemoryLastType"] = "none"
	_snapshot["civilMemoryLastSummary"] = "none"
	if items.size() > 0 and items[0] is Dictionary:
		var last_item: Dictionary = items[0] as Dictionary
		_snapshot["civilMemoryLastType"] = str(last_item.get("type", "unknown"))
		var summary: String = str(last_item.get("summary", "none")).strip_edges()
		_snapshot["civilMemoryLastSummary"] = summary.left(72) if summary != "" else "none"

	var provider: Dictionary = payload.get("memoryProvider", {}) as Dictionary
	if provider.is_empty():
		_snapshot["civilMemoryProvider"] = "unknown->unknown"
		_snapshot["civilMemoryLifecycle"] = "unknown"
		_snapshot["civilMemoryDowngraded"] = "unknown"
		_snapshot["civilMemoryProviderReason"] = "none"
		return

	var requested: String = str(provider.get("requestedProvider", "unknown"))
	var active: String = str(provider.get("activeProvider", "unknown"))
	var lifecycle: String = str(provider.get("lifecycle", "unknown"))
	var downgraded: bool = bool(provider.get("downgraded", false))
	var reason: String = str(provider.get("reason", "")).strip_edges()
	_snapshot["civilMemoryProvider"] = "%s->%s" % [requested, active]
	_snapshot["civilMemoryLifecycle"] = lifecycle
	_snapshot["civilMemoryDowngraded"] = "yes" if downgraded else "no"
	_snapshot["civilMemoryProviderReason"] = reason.left(72) if reason != "" else "none"

func _pick_runtime_faction_row(raw_factions: Variant) -> Dictionary:
	if raw_factions is Array:
		var factions: Array = raw_factions
		for item in factions:
			if not (item is Dictionary):
				continue
			var row: Dictionary = item as Dictionary
			if _faction_id != "" and str(row.get("factionId", "")) == _faction_id:
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

func _poll_ws(delta: float) -> void:
	if _ws_peer == null:
		_ws_reconnect_elapsed += delta
		if _ws_reconnect_elapsed >= ws_reconnect_interval_sec:
			_ws_reconnect_elapsed = 0.0
			_connect_ws_now()
		return

	_ws_peer.poll()
	var state: int = _ws_peer.get_ready_state()
	match state:
		WebSocketPeer.STATE_CONNECTING:
			_snapshot["wsState"] = "connecting"
		WebSocketPeer.STATE_OPEN:
			_snapshot["wsState"] = "open"
			_ensure_ws_subscribed()
			_ws_ping_elapsed += delta
			if _ws_ping_elapsed >= ws_ping_interval_sec:
				_ws_ping_elapsed = 0.0
				_send_ws_json({"type": "ping"})
			_drain_ws_packets()
		WebSocketPeer.STATE_CLOSING:
			_snapshot["wsState"] = "closing"
		WebSocketPeer.STATE_CLOSED:
			_snapshot["wsState"] = "closed"
			_snapshot["wsSubscribed"] = false
			_ws_subscribe_sent = false
			_ws_peer = null

	_emit_snapshot()

func _connect_ws_now() -> void:
	if _ws_url == "":
		_snapshot["wsState"] = "missing_ws_url"
		return
	_ws_peer = WebSocketPeer.new()
	_ws_subscribe_sent = false
	_snapshot["wsSubscribed"] = false
	var err: int = _ws_peer.connect_to_url(_ws_url)
	if err != OK:
		_snapshot["wsState"] = "connect_failed:%d" % err
		_ws_peer = null
	else:
		_snapshot["wsState"] = "connecting"
		_ws_reconnect_elapsed = 0.0
		_ws_ping_elapsed = 0.0
	_emit_snapshot()

func _ensure_ws_subscribed() -> void:
	if _ws_subscribe_sent:
		return
	if _faction_id == "":
		return
	var payload: Dictionary = {
		"type": "subscribe",
		"factionId": _faction_id,
	}
	if _token != "":
		payload["token"] = _token
	_send_ws_json(payload)
	_ws_subscribe_sent = true

func _drain_ws_packets() -> void:
	while _ws_peer != null and _ws_peer.get_available_packet_count() > 0:
		var raw_packet: PackedByteArray = _ws_peer.get_packet()
		var message_text: String = raw_packet.get_string_from_utf8()
		var parser := JSON.new()
		var parse_err: int = parser.parse(message_text)
		if parse_err != OK or not (parser.data is Dictionary):
			continue

		var msg: Dictionary = parser.data as Dictionary
		var msg_type: String = str(msg.get("type", "unknown"))
		_snapshot["wsMessageCount"] = int(_snapshot.get("wsMessageCount", 0)) + 1
		_snapshot["wsLastType"] = msg_type

		match msg_type:
			"subscribed":
				_snapshot["wsSubscribed"] = true
			"tick_delta":
				_snapshot["wsTickDeltaCount"] = int(_snapshot.get("wsTickDeltaCount", 0)) + 1
				_snapshot["wsLastTick"] = str(msg.get("tick", "unknown"))
			"general_message":
				_snapshot["wsGeneralMessageCount"] = int(_snapshot.get("wsGeneralMessageCount", 0)) + 1
			"error":
				_snapshot["wsErrorCount"] = int(_snapshot.get("wsErrorCount", 0)) + 1
				_snapshot["wsLastError"] = str(msg.get("message", "unknown"))
			_:
				pass

func _send_ws_json(payload: Dictionary) -> void:
	if _ws_peer == null:
		return
	if _ws_peer.get_ready_state() != WebSocketPeer.STATE_OPEN:
		return
	var body: String = JSON.stringify(payload)
	_ws_peer.send_text(body)

func _to_ws_url(http_base_url: String) -> String:
	var normalized: String = http_base_url.strip_edges().rstrip("/")
	if normalized.begins_with("https://"):
		return "wss://%s/ws" % normalized.trim_prefix("https://")
	if normalized.begins_with("http://"):
		return "ws://%s/ws" % normalized.trim_prefix("http://")
	return "ws://%s/ws" % normalized

func _summarize_event(event_item: Dictionary) -> String:
	var summary: String = str(event_item.get("summary", "")).strip_edges()
	if summary != "":
		return summary.left(80)
	var event_type: String = str(event_item.get("type", "unknown"))
	var tick: String = str(event_item.get("tick", "unknown"))
	return "type=%s tick=%s" % [event_type, tick]

func _apply_backend_ws_stats(ws_stats: Dictionary) -> void:
	_snapshot["backendWsConnections"] = int(ws_stats.get("totalConnections", 0))
	_snapshot["backendWsSubscribedConnections"] = int(ws_stats.get("subscribedConnections", 0))
	var faction_distribution: Dictionary = ws_stats.get("factionDistribution", {}) as Dictionary
	_snapshot["backendWsFactionDistribution"] = _format_faction_distribution(faction_distribution)
	_snapshot["backendWsRecentError"] = _summarize_recent_ws_error(ws_stats.get("recentErrors", []))

func _format_faction_distribution(faction_distribution: Dictionary) -> String:
	if faction_distribution.is_empty():
		return "none"
	var parts: PackedStringArray = PackedStringArray()
	for faction_id in faction_distribution.keys():
		parts.append("%s:%s" % [str(faction_id), str(faction_distribution.get(faction_id, 0))])
	return ",".join(parts)

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

func _emit_snapshot() -> void:
	snapshot_updated.emit(get_snapshot())
