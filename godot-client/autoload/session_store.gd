extends Node

var session_id: String = ""
var token: String = ""
var faction_id: String = ""
var seat_id: String = ""
var autonomy_level: String = ""
var control_mode: String = ""

func set_session(
	next_session_id: String,
	next_token: String,
	next_faction_id: String,
	next_seat_id: String = "",
	next_autonomy_level: String = "",
	next_control_mode: String = "",
) -> void:
	session_id = next_session_id
	token = next_token
	faction_id = next_faction_id
	seat_id = next_seat_id
	autonomy_level = next_autonomy_level
	control_mode = next_control_mode

func set_control_context(next_autonomy_level: String, next_control_mode: String) -> void:
	autonomy_level = next_autonomy_level
	control_mode = next_control_mode

func clear_session() -> void:
	session_id = ""
	token = ""
	faction_id = ""
	seat_id = ""
	autonomy_level = ""
	control_mode = ""
