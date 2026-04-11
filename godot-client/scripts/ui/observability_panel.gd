extends CanvasLayer

const WS_STATUS_GREEN := Color(0.24, 0.75, 0.32, 1.0)
const WS_STATUS_YELLOW := Color(0.95, 0.72, 0.20, 1.0)
const WS_STATUS_RED := Color(0.90, 0.28, 0.24, 1.0)

@export var ws_label_path: NodePath = NodePath("Panel/Margin/Content/WsSection/WsMargin/WsContent/WsInfo")
@export var events_label_path: NodePath = NodePath("Panel/Margin/Content/EventsSection/EventsMargin/EventsInfo")
@export var runtime_label_path: NodePath = NodePath("Panel/Margin/Content/RuntimeSection/RuntimeMargin/RuntimeInfo")
@export var civil_memory_label_path: NodePath = NodePath("Panel/Margin/Content/CivilMemorySection/CivilMemoryMargin/CivilMemoryInfo")
@export var ws_state_dot_path: NodePath = NodePath("Panel/Margin/Content/WsSection/WsMargin/WsContent/WsHeader/WsStateDot")
@export var ws_state_title_path: NodePath = NodePath("Panel/Margin/Content/WsSection/WsMargin/WsContent/WsHeader/WsTitle")

var _ws_label: Label
var _events_label: Label
var _runtime_label: Label
var _civil_memory_label: Label
var _ws_state_dot: ColorRect
var _ws_state_title: Label

func _ready() -> void:
	_ws_label = get_node_or_null(ws_label_path) as Label
	_events_label = get_node_or_null(events_label_path) as Label
	_runtime_label = get_node_or_null(runtime_label_path) as Label
	_civil_memory_label = get_node_or_null(civil_memory_label_path) as Label
	_ws_state_dot = get_node_or_null(ws_state_dot_path) as ColorRect
	_ws_state_title = get_node_or_null(ws_state_title_path) as Label
	update_snapshot({
		"wsState": "waiting",
		"wsSubscribed": false,
		"wsMessageCount": 0,
		"wsTickDeltaCount": 0,
		"wsGeneralMessageCount": 0,
		"wsErrorCount": 0,
		"eventsPollOkCount": 0,
		"eventsPollFailCount": 0,
		"eventsLastSummary": "none",
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
		"runtimeLastAction": "none",
		"runtimeLastActionStatus": "idle",
		"runtimeLastActionTick": "unknown",
	})

func update_snapshot(snapshot: Dictionary) -> void:
	if _ws_label == null:
		_ws_label = get_node_or_null(ws_label_path) as Label
	if _events_label == null:
		_events_label = get_node_or_null(events_label_path) as Label
	if _runtime_label == null:
		_runtime_label = get_node_or_null(runtime_label_path) as Label
	if _civil_memory_label == null:
		_civil_memory_label = get_node_or_null(civil_memory_label_path) as Label
	if _ws_state_dot == null:
		_ws_state_dot = get_node_or_null(ws_state_dot_path) as ColorRect
	if _ws_state_title == null:
		_ws_state_title = get_node_or_null(ws_state_title_path) as Label

	_update_ws_status_color(snapshot)

	if _ws_label != null:
		var backend_distribution: String = str(snapshot.get("backendWsFactionDistribution", "none"))
		var backend_recent_error: String = str(snapshot.get("backendWsRecentError", "none"))
		_ws_label.text = (
			"state=%s | sub=%s | srvConn=%s srvSub=%s\nmsg=%s tickDelta=%s gMsg=%s wsErr=%s\ndist=%s\nlastErr=%s"
			% [
				str(snapshot.get("wsState", "unknown")),
				"yes" if bool(snapshot.get("wsSubscribed", false)) else "no",
				str(snapshot.get("backendWsConnections", 0)),
				str(snapshot.get("backendWsSubscribedConnections", 0)),
				str(snapshot.get("wsMessageCount", 0)),
				str(snapshot.get("wsTickDeltaCount", 0)),
				str(snapshot.get("wsGeneralMessageCount", 0)),
				str(snapshot.get("wsErrorCount", 0)),
				backend_distribution.left(72),
				backend_recent_error.left(72),
			]
		)

	if _events_label != null:
		_events_label.text = (
			"pollOk=%s fail=%s\nlast=%s"
			% [
				str(snapshot.get("eventsPollOkCount", 0)),
				str(snapshot.get("eventsPollFailCount", 0)),
				str(snapshot.get("eventsLastSummary", "none")),
			]
		)

	if _runtime_label != null:
		_runtime_label.text = (
			"faction=%s mode=%s autonomy=%s\ntick=%s worldVersion=%s seats=%s/%s\nsession=%s seat=%s sessionMode=%s\nplayers=%s\nruntimeApi pollOk=%s fail=%s tick=%s world=%s factions=%s\napiMode=%s apiAutonomy=%s apiSeats=%s\nlastAction=%s status=%s tick=%s"
			% [
				str(snapshot.get("runtimeFactionId", "none")),
				str(snapshot.get("runtimeControlMode", "unknown")),
				str(snapshot.get("runtimeAutonomyLevel", "unknown")),
				str(snapshot.get("runtimeTick", "unknown")),
				str(snapshot.get("runtimeWorldVersion", "unknown")),
				str(snapshot.get("runtimeOnlineSeatCount", 0)),
				str(snapshot.get("runtimeSeatCount", 0)),
				str(snapshot.get("runtimeSessionId", "none")),
				str(snapshot.get("runtimeSeatId", "none")),
				str(snapshot.get("runtimeSessionMode", "unknown")),
				str(snapshot.get("runtimePlayerNames", "none")).left(80),
				str(snapshot.get("runtimePollOkCount", 0)),
				str(snapshot.get("runtimePollFailCount", 0)),
				str(snapshot.get("runtimeApiTick", "unknown")),
				str(snapshot.get("runtimeApiWorldVersion", "unknown")),
				str(snapshot.get("runtimeApiFactionCount", 0)),
				str(snapshot.get("runtimeApiControlMode", "unknown")),
				str(snapshot.get("runtimeApiAutonomyLevel", "unknown")),
				str(snapshot.get("runtimeApiSeatOnline", "0/0")),
				str(snapshot.get("runtimeLastAction", "none")),
				str(snapshot.get("runtimeLastActionStatus", "idle")),
				str(snapshot.get("runtimeLastActionTick", "unknown")),
			]
		)

	if _civil_memory_label != null:
		_civil_memory_label.text = (
			"pollOk=%s fail=%s lastCount=%s lastType=%s\nprovider=%s lifecycle=%s downgraded=%s\nreason=%s\nlast=%s"
			% [
				str(snapshot.get("civilMemoryPollOkCount", 0)),
				str(snapshot.get("civilMemoryPollFailCount", 0)),
				str(snapshot.get("civilMemoryLastCount", 0)),
				str(snapshot.get("civilMemoryLastType", "none")),
				str(snapshot.get("civilMemoryProvider", "unknown->unknown")),
				str(snapshot.get("civilMemoryLifecycle", "unknown")),
				str(snapshot.get("civilMemoryDowngraded", "unknown")),
				str(snapshot.get("civilMemoryProviderReason", "none")).left(72),
				str(snapshot.get("civilMemoryLastSummary", "none")).left(72),
			]
		)

func _update_ws_status_color(snapshot: Dictionary) -> void:
	var ws_state: String = str(snapshot.get("wsState", "unknown")).to_lower()
	var ws_subscribed: bool = bool(snapshot.get("wsSubscribed", false))
	var ws_error_count: int = int(snapshot.get("wsErrorCount", 0))

	var ws_color: Color = WS_STATUS_YELLOW
	var ws_state_text: String = "WS: TRANSITION"

	if ws_state == "open" and ws_subscribed and ws_error_count <= 0:
		ws_color = WS_STATUS_GREEN
		ws_state_text = "WS: CONNECTED"
	elif ws_state == "closed" or ws_state == "error" or ws_error_count >= 3:
		ws_color = WS_STATUS_RED
		ws_state_text = "WS: DISCONNECTED"
	else:
		ws_color = WS_STATUS_YELLOW
		ws_state_text = "WS: CONNECTING"

	if _ws_state_dot != null:
		_ws_state_dot.color = ws_color

	if _ws_state_title != null:
		_ws_state_title.text = ws_state_text
