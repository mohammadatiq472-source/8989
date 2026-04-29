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

func post_session_autonomy(token: String, level: String) -> Dictionary:
	return await request_json(
		"POST",
		"/api/session/autonomy",
		{
			"token": token,
			"level": level,
		},
	)

func get_world_summary() -> Dictionary:
	return await request_json("GET", "/api/world?intelMode=sparse")

func get_world_full_summary() -> Dictionary:
	return await request_json("GET", "/api/world?intelMode=full")

func get_unified_inbox(faction_id: String = "", governor_player_id: String = "") -> Dictionary:
	var query_parts: Array = []
	var normalized_faction_id := faction_id.strip_edges()
	var normalized_governor_player_id := governor_player_id.strip_edges()
	if normalized_faction_id != "":
		query_parts.append("factionId=%s" % normalized_faction_id.uri_encode())
	if normalized_governor_player_id != "":
		query_parts.append("governorPlayerId=%s" % normalized_governor_player_id.uri_encode())
	var query := ""
	if not query_parts.is_empty():
		query = "?%s" % "&".join(query_parts)
	return await request_json("GET", "/api/inbox%s" % query)

func claim_unified_inbox_item(item_id: String, faction_id: String = "", governor_player_id: String = "", include_world: bool = true, chat_ai_player_id: String = "") -> Dictionary:
	var normalized_item_id := item_id.strip_edges()
	if normalized_item_id == "":
		return {
			"ok": false,
			"status": -1,
			"error": "missing_inbox_item_id",
			"message": "Inbox item id is required.",
		}
	var payload := {
		"itemId": normalized_item_id,
		"includeWorld": include_world,
	}
	var normalized_faction_id := faction_id.strip_edges()
	var normalized_governor_player_id := governor_player_id.strip_edges()
	var normalized_chat_ai_player_id := chat_ai_player_id.strip_edges()
	if normalized_faction_id != "":
		payload["factionId"] = normalized_faction_id
	if normalized_governor_player_id != "":
		payload["governorPlayerId"] = normalized_governor_player_id
	if normalized_chat_ai_player_id != "":
		payload["chatAiPlayerId"] = normalized_chat_ai_player_id
	return await request_json("POST", "/api/inbox/claim", payload)

func get_map_layout(scope: String = "full", query_params: Dictionary = {}) -> Dictionary:
	var normalized_scope := scope.strip_edges()
	if normalized_scope == "":
		normalized_scope = "bootstrap"
	var query_parts: Array = ["scope=%s" % normalized_scope.uri_encode()]
	for key_variant in query_params.keys():
		var key: String = str(key_variant).strip_edges()
		var value: String = str(query_params.get(key_variant, "")).strip_edges()
		if key == "" or value == "":
			continue
		query_parts.append("%s=%s" % [key.uri_encode(), value.uri_encode()])
	return await request_json("GET", "/api/world/map-layout?%s" % "&".join(query_parts))

func get_events(limit: int = 20) -> Dictionary:
	var normalized_limit: int = maxi(1, limit)
	return await request_json("GET", "/api/events?limit=%d" % normalized_limit)

func get_civil_memory(limit: int = 20) -> Dictionary:
	var normalized_limit: int = maxi(1, limit)
	return await request_json("GET", "/api/civil-memory?limit=%d" % normalized_limit)

func get_ai_players(faction_id: String = "", include_disabled: bool = false) -> Dictionary:
	var query_parts: Array = []
	var normalized_faction_id := faction_id.strip_edges()
	if normalized_faction_id != "":
		query_parts.append("factionId=%s" % normalized_faction_id.uri_encode())
	if include_disabled:
		query_parts.append("includeDisabled=true")
	var query := ""
	if not query_parts.is_empty():
		query = "?%s" % "&".join(query_parts)
	return await request_json("GET", "/api/ai/players%s" % query)

func get_faction_config(faction_id: String) -> Dictionary:
	var normalized_faction_id := faction_id.strip_edges()
	if normalized_faction_id == "":
		return {
			"ok": false,
			"status": -1,
			"error": "missing_faction_id",
			"message": "Faction id is required.",
		}
	return await request_json("GET", "/api/faction/%s/config" % normalized_faction_id.uri_encode())

func get_ai_player_action_catalog() -> Dictionary:
	return await request_json("GET", "/api/ai/player-actions/catalog")

func get_ai_player(ai_player_id: String) -> Dictionary:
	var normalized_ai_player_id := ai_player_id.strip_edges()
	if normalized_ai_player_id == "":
		return {
			"ok": false,
			"status": -1,
			"error": "missing_ai_player_id",
			"message": "AI player id is required.",
		}
	return await request_json("GET", "/api/ai/players/%s" % normalized_ai_player_id.uri_encode())

func get_ai_player_development_plan(ai_player_id: String, goal_power: int = 4000) -> Dictionary:
	var normalized_ai_player_id := ai_player_id.strip_edges()
	if normalized_ai_player_id == "":
		return {
			"ok": false,
			"status": -1,
			"error": "missing_ai_player_id",
			"message": "AI player id is required.",
		}
	var normalized_goal_power: int = maxi(1, goal_power)
	return await request_json(
		"GET",
		"/api/ai/players/%s/development-plan?goalPower=%d" % [
			normalized_ai_player_id.uri_encode(),
			normalized_goal_power,
		]
	)

func get_ai_player_battle_reports(ai_player_id: String, limit: int = 5) -> Dictionary:
	var normalized_ai_player_id := ai_player_id.strip_edges()
	if normalized_ai_player_id == "":
		return {
			"ok": false,
			"status": -1,
			"error": "missing_ai_player_id",
			"message": "AI player id is required.",
		}
	var normalized_limit := maxi(1, limit)
	return await request_json("GET", "/api/ai/players/%s/battle-reports?limit=%d" % [
		normalized_ai_player_id.uri_encode(),
		normalized_limit,
	])

func update_ai_player_profile(ai_player_id: String, display_name: String = "", avatar_id: String = "", avatar_image_path: String = "", updated_by: String = "") -> Dictionary:
	var normalized_ai_player_id := ai_player_id.strip_edges()
	var normalized_display_name := display_name.strip_edges()
	var normalized_avatar_id := avatar_id.strip_edges()
	var normalized_avatar_image_path := avatar_image_path.strip_edges()
	var normalized_updated_by := updated_by.strip_edges()
	if normalized_ai_player_id == "":
		return {
			"ok": false,
			"status": -1,
			"error": "missing_ai_player_id",
			"message": "AI player id is required.",
		}
	if normalized_updated_by == "":
		normalized_updated_by = "godot_ai_panel"
	var payload: Dictionary = {
		"updatedBy": normalized_updated_by,
	}
	if normalized_display_name != "":
		payload["displayName"] = normalized_display_name
	if normalized_avatar_id != "":
		payload["avatarId"] = normalized_avatar_id
	if normalized_avatar_image_path != "":
		payload["avatarImagePath"] = normalized_avatar_image_path
	if payload.size() <= 1:
		return {
			"ok": false,
			"status": -1,
			"error": "missing_profile_update",
			"message": "AI profile update requires a display name or avatar.",
		}
	return await request_json(
		"POST",
		"/api/ai/players/%s/profile" % normalized_ai_player_id.uri_encode(),
		payload
	)

func update_ai_player_display_name(ai_player_id: String, display_name: String, updated_by: String) -> Dictionary:
	var normalized_display_name := display_name.strip_edges()
	if normalized_display_name == "":
		return {
			"ok": false,
			"status": -1,
			"error": "missing_display_name",
			"message": "AI display name is required.",
		}
	return await update_ai_player_profile(ai_player_id, normalized_display_name, "", "", updated_by)

func upsert_ai_player_context_document(ai_player_id: String, title: String, content: String, kind: String = "identity", updated_by: String = "", source_file_name: String = "") -> Dictionary:
	var normalized_ai_player_id := ai_player_id.strip_edges()
	var normalized_title := title.strip_edges()
	var normalized_content := content.strip_edges()
	if normalized_ai_player_id == "":
		return {
			"ok": false,
			"status": -1,
			"error": "missing_ai_player_id",
			"message": "AI player id is required.",
		}
	if normalized_title == "":
		return {
			"ok": false,
			"status": -1,
			"error": "missing_context_document_title",
			"message": "AI context document title is required.",
		}
	if normalized_content == "":
		return {
			"ok": false,
			"status": -1,
			"error": "missing_context_document_content",
			"message": "AI context document content is required.",
		}
	var normalized_kind := kind.strip_edges()
	if normalized_kind == "":
		normalized_kind = "identity"
	var normalized_updated_by := updated_by.strip_edges()
	if normalized_updated_by == "":
		normalized_updated_by = "godot_ai_panel"
	var payload := {
		"kind": normalized_kind,
		"title": normalized_title,
		"content": normalized_content,
		"updatedBy": normalized_updated_by,
	}
	var normalized_source_file_name := source_file_name.strip_edges()
	if normalized_source_file_name != "":
		payload["sourceFileName"] = normalized_source_file_name
	return await request_json(
		"POST",
		"/api/ai/players/%s/context-documents" % normalized_ai_player_id.uri_encode(),
		payload
	)

func get_ai_player_receipts(ai_player_id: String, limit: int = 5) -> Dictionary:
	var normalized_ai_player_id := ai_player_id.strip_edges()
	if normalized_ai_player_id == "":
		return {
			"ok": false,
			"status": -1,
			"error": "missing_ai_player_id",
			"message": "AI player id is required.",
		}
	var normalized_limit := maxi(1, limit)
	return await request_json("GET", "/api/ai/players/%s/receipts?limit=%d" % [
		normalized_ai_player_id.uri_encode(),
		normalized_limit,
	])

func get_ai_player_chat_messages(ai_player_id: String, limit: int = 20, reader_id: String = "", history_filter: String = "all", before_message_id: String = "") -> Dictionary:
	var normalized_ai_player_id := ai_player_id.strip_edges()
	if normalized_ai_player_id == "":
		return {
			"ok": false,
			"status": -1,
			"error": "missing_ai_player_id",
			"message": "AI player id is required.",
		}
	var query_parts: Array = [
		"limit=%d" % maxi(1, limit),
	]
	var normalized_reader_id := reader_id.strip_edges()
	if normalized_reader_id != "":
		query_parts.append("readerId=%s" % normalized_reader_id.uri_encode())
	var normalized_filter := history_filter.strip_edges()
	if normalized_filter != "" and normalized_filter != "all":
		query_parts.append("filter=%s" % normalized_filter.uri_encode())
	var normalized_before_message_id := before_message_id.strip_edges()
	if normalized_before_message_id != "":
		query_parts.append("beforeMessageId=%s" % normalized_before_message_id.uri_encode())
	return await request_json("GET", "/api/ai/players/%s/chat/messages?%s" % [
		normalized_ai_player_id.uri_encode(),
		"&".join(query_parts),
	])

func get_ai_player_chat_read_cursor(ai_player_id: String, reader_id: String) -> Dictionary:
	var normalized_ai_player_id := ai_player_id.strip_edges()
	var normalized_reader_id := reader_id.strip_edges()
	if normalized_ai_player_id == "":
		return {
			"ok": false,
			"status": -1,
			"error": "missing_ai_player_id",
			"message": "AI player id is required.",
		}
	if normalized_reader_id == "":
		return {
			"ok": false,
			"status": -1,
			"error": "missing_reader_id",
			"message": "Chat reader id is required.",
		}
	return await request_json("GET", "/api/ai/players/%s/chat/read-cursor?readerId=%s" % [
		normalized_ai_player_id.uri_encode(),
		normalized_reader_id.uri_encode(),
	])

func update_ai_player_chat_read_cursor(ai_player_id: String, reader_id: String, read_message_count: int = -1, read_message_id: String = "") -> Dictionary:
	var normalized_ai_player_id := ai_player_id.strip_edges()
	var normalized_reader_id := reader_id.strip_edges()
	if normalized_ai_player_id == "":
		return {
			"ok": false,
			"status": -1,
			"error": "missing_ai_player_id",
			"message": "AI player id is required.",
		}
	if normalized_reader_id == "":
		return {
			"ok": false,
			"status": -1,
			"error": "missing_reader_id",
			"message": "Chat reader id is required.",
		}
	var payload := {
		"readerId": normalized_reader_id,
	}
	var normalized_message_id := read_message_id.strip_edges()
	if read_message_count >= 0:
		payload["readMessageCount"] = read_message_count
	if normalized_message_id != "":
		payload["readMessageId"] = normalized_message_id
	return await request_json(
		"POST",
		"/api/ai/players/%s/chat/read-cursor" % normalized_ai_player_id.uri_encode(),
		payload
	)

func send_ai_player_chat_message(ai_player_id: String, body: String, sender_id: String = "", sender_name: String = "总督", create_proposal: bool = true) -> Dictionary:
	var normalized_ai_player_id := ai_player_id.strip_edges()
	var normalized_body := body.strip_edges()
	if normalized_ai_player_id == "":
		return {
			"ok": false,
			"status": -1,
			"error": "missing_ai_player_id",
			"message": "AI player id is required.",
		}
	if normalized_body == "":
		return {
			"ok": false,
			"status": -1,
			"error": "missing_chat_body",
			"message": "Chat body is required.",
		}
	var payload := {
		"body": normalized_body,
		"senderName": sender_name,
		"createProposal": create_proposal,
	}
	var normalized_sender_id := sender_id.strip_edges()
	if normalized_sender_id != "":
		payload["senderId"] = normalized_sender_id
	return await request_json(
		"POST",
		"/api/ai/players/%s/chat/messages" % normalized_ai_player_id.uri_encode(),
		payload
	)

func create_ai_player_chat_patrol_tick(ai_player_id: String, governor_player_id: String = "") -> Dictionary:
	var normalized_ai_player_id := ai_player_id.strip_edges()
	if normalized_ai_player_id == "":
		return {
			"ok": false,
			"status": -1,
			"error": "missing_ai_player_id",
			"message": "AI player id is required.",
		}
	var payload := {}
	var normalized_governor_player_id := governor_player_id.strip_edges()
	if normalized_governor_player_id != "":
		payload["governorPlayerId"] = normalized_governor_player_id
	return await request_json(
		"POST",
		"/api/ai/players/%s/chat/patrol-tick" % normalized_ai_player_id.uri_encode(),
		payload
	)

func create_ai_player_model_proposals(ai_player_id: String) -> Dictionary:
	var normalized_ai_player_id := ai_player_id.strip_edges()
	if normalized_ai_player_id == "":
		return {
			"ok": false,
			"status": -1,
			"error": "missing_ai_player_id",
			"message": "AI player id is required.",
		}
	return await request_json(
		"POST",
		"/api/ai/players/%s/model-proposals" % normalized_ai_player_id.uri_encode(),
		{}
	)

func get_ai_player_proposals(ai_player_id: String = "", status: String = "", limit: int = 5) -> Dictionary:
	var query_parts: Array = []
	var normalized_ai_player_id := ai_player_id.strip_edges()
	var normalized_status := status.strip_edges()
	if normalized_ai_player_id != "":
		query_parts.append("aiPlayerId=%s" % normalized_ai_player_id.uri_encode())
	if normalized_status != "":
		query_parts.append("status=%s" % normalized_status.uri_encode())
	query_parts.append("limit=%d" % maxi(1, limit))
	return await request_json("GET", "/api/ai/players/proposals?%s" % "&".join(query_parts))

func get_ai_player_proposal(proposal_id: String) -> Dictionary:
	var normalized_proposal_id := proposal_id.strip_edges()
	if normalized_proposal_id == "":
		return {
			"ok": false,
			"status": -1,
			"error": "missing_proposal_id",
			"message": "AI proposal id is required.",
		}
	return await request_json("GET", "/api/ai/players/proposals/%s" % normalized_proposal_id.uri_encode())

func create_ai_player_proposal(ai_player_id: String, action: String, args: Dictionary, reason: String, source: String = "human") -> Dictionary:
	return await request_json(
		"POST",
		"/api/ai/players/proposals",
		{
			"aiPlayerId": ai_player_id,
			"action": action,
			"source": source,
			"reason": reason,
			"args": args,
		}
	)

func approve_ai_player_proposal(proposal_id: String, approved_by: String) -> Dictionary:
	var normalized_proposal_id := proposal_id.strip_edges()
	if normalized_proposal_id == "":
		return {
			"ok": false,
			"status": -1,
			"error": "missing_proposal_id",
			"message": "AI proposal id is required.",
		}
	return await request_json(
		"POST",
		"/api/ai/players/proposals/%s/approve" % normalized_proposal_id.uri_encode(),
		{"approvedBy": approved_by}
	)

func execute_ai_player_proposal(proposal_id: String, executed_by: String, include_world: bool = false) -> Dictionary:
	var normalized_proposal_id := proposal_id.strip_edges()
	if normalized_proposal_id == "":
		return {
			"ok": false,
			"status": -1,
			"error": "missing_proposal_id",
			"message": "AI proposal id is required.",
		}
	return await request_json(
		"POST",
		"/api/ai/players/proposals/%s/execute" % normalized_proposal_id.uri_encode(),
		{
			"executedBy": executed_by,
			"includeWorld": include_world,
		}
	)

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

func claim_governor_resource_inbox(faction_id: String, governor_player_id: String, transfer_id: String, include_world: bool = true) -> Dictionary:
	return await post_world_action(
		"claimGovernorResourceInbox",
		{
			"factionId": faction_id,
			"governorPlayerId": governor_player_id,
			"transferId": transfer_id,
		},
		include_world
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
