extends Node

const DEFAULT_BASE_URL := "http://127.0.0.1:8787"
const DEFAULT_PLAYER_NAME := "godot_mvp"
const DEFAULT_MAP_LAYOUT_SCOPE := "full"

var backend_base_url: String = DEFAULT_BASE_URL
var player_name: String = DEFAULT_PLAYER_NAME
var preferred_faction_id: String = ""
var map_layout_scope: String = DEFAULT_MAP_LAYOUT_SCOPE

func _ready() -> void:
	backend_base_url = _read_env("SLG_BACKEND_URL", DEFAULT_BASE_URL).rstrip("/")
	player_name = _read_env("SLG_PLAYER_NAME", DEFAULT_PLAYER_NAME)
	preferred_faction_id = _read_env("SLG_FACTION_ID", "")
	map_layout_scope = _read_env("SLG_MAP_SCOPE", DEFAULT_MAP_LAYOUT_SCOPE)

func _read_env(key: String, fallback: String) -> String:
	var value := OS.get_environment(key).strip_edges()
	if value == "":
		return fallback
	return value
