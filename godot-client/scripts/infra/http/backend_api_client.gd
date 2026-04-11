extends Node
class_name BackendApiClient

const DEFAULT_BASE_URL := "http://127.0.0.1:8787"

var base_url: String = DEFAULT_BASE_URL

func configure(next_base_url: String) -> void:
	var trimmed := next_base_url.strip_edges()
	if trimmed == "":
		base_url = DEFAULT_BASE_URL
		return
	base_url = trimmed.rstrip("/")

func request_json(method: String, path: String, body: Variant = null, extra_headers: Dictionary = {}) -> Dictionary:
	var request_node := HTTPRequest.new()
	add_child(request_node)

	var headers := PackedStringArray()
	for key in extra_headers.keys():
		headers.append("%s: %s" % [str(key), str(extra_headers[key])])

	var payload := ""
	if body != null:
		payload = JSON.stringify(body)
		if not extra_headers.has("Content-Type") and not extra_headers.has("content-type"):
			headers.append("Content-Type: application/json")

	var request_error := request_node.request(
		base_url + path,
		headers,
		_resolve_http_method(method),
		payload,
	)
	if request_error != OK:
		request_node.queue_free()
		return {
			"ok": false,
			"status": -1,
			"error": "request_init_failed",
			"message": "HTTPRequest init failed, code=%d" % request_error,
		}

	var completed: Array = await request_node.request_completed
	request_node.queue_free()

	var request_result := int(completed[0])
	var response_code := int(completed[1])
	var response_body: PackedByteArray = completed[3]
	var raw_text := response_body.get_string_from_utf8()
	var parsed_payload: Variant = {}

	if raw_text.strip_edges() != "":
		var parser := JSON.new()
		var parse_error := parser.parse(raw_text)
		if parse_error == OK:
			parsed_payload = parser.data
		else:
			parsed_payload = {
				"raw": raw_text,
			}

	var network_ok := request_result == HTTPRequest.RESULT_SUCCESS
	var http_ok := response_code >= 200 and response_code < 300

	var response: Dictionary = {
		"ok": network_ok and http_ok,
		"status": response_code,
		"requestResult": request_result,
		"data": parsed_payload,
	}
	if not network_ok:
		response["error"] = "request_failed"
		response["message"] = "HTTPRequest failed, result=%d" % request_result
	elif not http_ok:
		response["error"] = "http_error"
		response["message"] = "HTTP status %d" % response_code

	return response

func get_health() -> Dictionary:
	return await request_json("GET", "/api/health")

func get_runtime() -> Dictionary:
	return await request_json("GET", "/api/session/runtime")

func join_session(faction_id: String, player_name: String) -> Dictionary:
	return await request_json(
		"POST",
		"/api/session/join",
		{
			"factionId": faction_id,
			"playerName": player_name,
		},
	)

func get_world_summary() -> Dictionary:
	return await request_json("GET", "/api/world?intelMode=sparse")

func get_map_layout(scope: String = "full") -> Dictionary:
	var normalized_scope := scope.strip_edges()
	if normalized_scope == "":
		normalized_scope = "bootstrap"
	return await request_json("GET", "/api/world/map-layout?scope=%s" % normalized_scope)

func get_events(limit: int = 20) -> Dictionary:
	var normalized_limit: int = maxi(1, limit)
	return await request_json("GET", "/api/events?limit=%d" % normalized_limit)

func get_civil_memory(limit: int = 20) -> Dictionary:
	var normalized_limit: int = maxi(1, limit)
	return await request_json("GET", "/api/civil-memory?limit=%d" % normalized_limit)

func post_world_action(action: String, payload: Dictionary = {}, include_world: bool = true) -> Dictionary:
	var request_payload: Dictionary = {
		"action": action,
	}
	if not payload.is_empty():
		request_payload["payload"] = payload

	var include_world_query: String = "true" if include_world else "false"
	return await request_json(
		"POST",
		"/api/world/action?includeWorld=%s" % include_world_query,
		request_payload,
	)

func advance_tick(include_world: bool = true) -> Dictionary:
	return await post_world_action("advanceTick", {}, include_world)

func _resolve_http_method(method: String) -> HTTPClient.Method:
	match method.to_upper():
		"POST":
			return HTTPClient.METHOD_POST
		"PUT":
			return HTTPClient.METHOD_PUT
		"PATCH":
			return HTTPClient.METHOD_PATCH
		"DELETE":
			return HTTPClient.METHOD_DELETE
		_:
			return HTTPClient.METHOD_GET
