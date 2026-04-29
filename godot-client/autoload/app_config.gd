extends Node

const DEFAULT_BASE_URL := "http://127.0.0.1:8787"
const DEFAULT_PLAYER_NAME := "godot_mvp"
const DEFAULT_MAP_LAYOUT_SCOPE := "full"

var backend_base_url: String = DEFAULT_BASE_URL
var player_name: String = DEFAULT_PLAYER_NAME
var preferred_faction_id: String = ""
var map_layout_scope: String = DEFAULT_MAP_LAYOUT_SCOPE
var map_layout_province_id: String = ""
var map_layout_region_id: String = ""
var map_layout_center_x: String = ""
var map_layout_center_y: String = ""
var map_layout_layer: String = ""

func _ready() -> void:
	backend_base_url = _read_env("SLG_BACKEND_URL", DEFAULT_BASE_URL).rstrip("/")
	player_name = _read_env("SLG_PLAYER_NAME", DEFAULT_PLAYER_NAME)
	preferred_faction_id = _read_env("SLG_FACTION_ID", "")
	map_layout_scope = _read_env("SLG_MAP_SCOPE", DEFAULT_MAP_LAYOUT_SCOPE)
	map_layout_province_id = _read_env("SLG_MAP_PROVINCE_ID", "")
	map_layout_region_id = _read_env("SLG_MAP_REGION_ID", "")
	map_layout_center_x = _read_env("SLG_MAP_CENTER_X", "")
	map_layout_center_y = _read_env("SLG_MAP_CENTER_Y", "")
	map_layout_layer = _read_env("SLG_MAP_LAYER", "")

func _read_env(key: String, fallback: String) -> String:
	var value := OS.get_environment(key).strip_edges()
	if value == "":
		return fallback
	return value

func get_map_layout_query_params() -> Dictionary:
	var params := {}
	if map_layout_province_id != "":
		params["provinceId"] = map_layout_province_id
	if map_layout_region_id != "":
		params["regionId"] = map_layout_region_id
	if map_layout_center_x != "":
		params["centerX"] = map_layout_center_x
	if map_layout_center_y != "":
		params["centerY"] = map_layout_center_y
	if map_layout_layer != "":
		params["layer"] = map_layout_layer
	return params
