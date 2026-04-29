extends Node2D

const UnitMarkerScript = preload("res://scripts/map/unit_marker.gd")
const AIMapIntentMarkerScript = preload("res://scripts/map/ai_map_intent_marker.gd")
const FactionVisualsScript = preload("res://scripts/map/faction_visuals.gd")
const ENGAGE_KIND_BATTLE: String = "battle"
const ENGAGE_KIND_TILE_CONTROL: String = "tile_control"
const ENGAGE_KIND_LOGISTICS: String = "logistics"
const ENGAGE_KIND_FALLBACK: String = ENGAGE_KIND_TILE_CONTROL
const IDENTITY_KIND_HUMAN: String = "human"
const IDENTITY_KIND_AI: String = "ai"
const IDENTITY_KIND_NEUTRAL: String = "neutral"
const NEUTRAL_FACTION_HINTS: Array[String] = [
	"",
	"neutral",
	"npc",
	"world",
	"environment",
]
const KNOWN_NON_ENGAGE_HIGHLIGHT_KINDS: Array[String] = [
	"enemy_turn",
	"alliance_turn",
	"intel",
	"planning",
]
const AI_MAP_INTENT_MARKER_LIMIT: int = 12
const AI_MAP_RESOURCE_STATE_MARKER_LIMIT: int = 24

@export var map_grid_path: NodePath = NodePath("../MapGrid")
@export var marker_radius: float = 4.0
@export var marker_vertical_offset: float = -2.0
@export var move_duration_sec: float = 0.35

var _map_grid: Node
var _tile_positions_by_id: Dictionary = {}
var _markers_by_unit_id: Dictionary = {}
var _ai_map_markers_by_key: Dictionary = {}
var _prev_units_by_id: Dictionary = {}
var _seen_replay_frame_ids: Dictionary = {}
var _seen_replay_frame_order: Array = []
var _replay_engage_kind_counts: Dictionary = {
	ENGAGE_KIND_BATTLE: 0,
	ENGAGE_KIND_TILE_CONTROL: 0,
	ENGAGE_KIND_LOGISTICS: 0,
}
var _replay_engage_unknown_kind_count: int = 0
var _replay_engage_unknown_kind_samples: Array[String] = []
var _replay_engage_trigger_count: int = 0
var _replay_engage_direction_direct_hits: int = 0
var _replay_engage_direction_fallback_hits: int = 0
var _replay_engage_last_frame_summary: Dictionary = {}

func _ready() -> void:
	_map_grid = get_node_or_null(map_grid_path)
	if _map_grid != null and _map_grid.has_signal("view_transform_changed"):
		_map_grid.view_transform_changed.connect(_on_view_transform_changed)

	if WorldStore.has_signal("map_layout_updated"):
		WorldStore.map_layout_updated.connect(_on_map_layout_updated)
	if WorldStore.has_signal("world_updated"):
		WorldStore.world_updated.connect(_on_world_updated)

	_on_map_layout_updated(WorldStore.map_layout)
	_on_world_updated(WorldStore.world)

func _on_view_transform_changed(_view_state: Dictionary) -> void:
	_sync_marker_positions()
	_sync_ai_map_visual_positions()

func _on_map_layout_updated(next_map_layout: Dictionary) -> void:
	_rebuild_tile_positions(next_map_layout)
	_sync_marker_positions()
	_sync_ai_map_visuals(WorldStore.world)

func _on_world_updated(next_world: Dictionary) -> void:
	if next_world.is_empty():
		return

	var next_units_by_id: Dictionary = _index_units(next_world.get("units", []))

	for unit_id_variant in _markers_by_unit_id.keys():
		var unit_id: String = str(unit_id_variant)
		if next_units_by_id.has(unit_id):
			continue
		var stale_marker: Node2D = _markers_by_unit_id[unit_id] as Node2D
		if stale_marker != null:
			stale_marker.queue_free()
		_markers_by_unit_id.erase(unit_id)

	for unit_id_variant in next_units_by_id.keys():
		var unit_id: String = str(unit_id_variant)
		var unit: Dictionary = next_units_by_id[unit_id] as Dictionary
		var marker: Node2D = _ensure_marker(unit_id, unit)

		if marker == null:
			continue

		var target_position: Vector2 = _resolve_unit_position(unit, marker.position)
		var has_previous: bool = _prev_units_by_id.has(unit_id)
		if not has_previous:
			_set_marker_position(marker, target_position)
			continue

		var previous_unit: Dictionary = _prev_units_by_id[unit_id] as Dictionary
		var moved: bool = str(previous_unit.get("tileId", "")) != str(unit.get("tileId", ""))
		var strength_drop: bool = int(previous_unit.get("strength", 0)) > int(unit.get("strength", 0))
		var status_changed: bool = str(previous_unit.get("status", "")) != str(unit.get("status", ""))
		var engage_intensity_after_move: float = 0.0
		var engage_kind_after_move: String = ""
		var engage_direction_after_move: Vector2 = _resolve_unit_direction_vector(previous_unit, unit)
		if strength_drop:
			engage_intensity_after_move = _resolve_engage_intensity_for_kind("battle")
			engage_kind_after_move = "battle"
		elif status_changed:
			engage_intensity_after_move = _resolve_engage_intensity_for_kind("tile_control")
			engage_kind_after_move = "tile_control"

		if moved:
			var from_position: Vector2 = _resolve_unit_position(previous_unit, marker.position)
			_animate_marker_move(
				marker,
				from_position,
				target_position,
				engage_intensity_after_move,
				engage_kind_after_move,
				engage_direction_after_move,
			)
			continue

		_set_marker_position(marker, target_position)
		if strength_drop or status_changed:
			marker.call(
				"play_engage",
				_resolve_engage_intensity_for_kind("battle" if strength_drop else "tile_control"),
				engage_direction_after_move,
				"battle" if strength_drop else "tile_control",
			)

	_trigger_engage_from_replay_frames(next_world, next_units_by_id)
	_prev_units_by_id = next_units_by_id
	_sync_ai_map_visuals(next_world)

func _rebuild_tile_positions(next_map_layout: Dictionary) -> void:
	_tile_positions_by_id = {}
	var map_payload: Dictionary = next_map_layout.get("map", {}) as Dictionary
	var raw_tiles: Variant = map_payload.get("tiles", [])
	if not (raw_tiles is Array):
		return

	for tile_variant in raw_tiles:
		if not (tile_variant is Dictionary):
			continue
		var tile: Dictionary = tile_variant as Dictionary
		var tile_id: String = str(tile.get("id", "")).strip_edges()
		if tile_id == "":
			continue
		_tile_positions_by_id[tile_id] = Vector2i(int(tile.get("x", 0)), int(tile.get("y", 0)))

func _index_units(raw_units: Variant) -> Dictionary:
	var indexed: Dictionary = {}
	if not (raw_units is Array):
		return indexed

	for unit_variant in raw_units:
		if not (unit_variant is Dictionary):
			continue
		var unit: Dictionary = unit_variant as Dictionary
		var unit_id: String = str(unit.get("id", "")).strip_edges()
		if unit_id == "":
			continue
		indexed[unit_id] = unit

	return indexed

func _ensure_marker(unit_id: String, unit: Dictionary) -> Node2D:
	if _markers_by_unit_id.has(unit_id):
		var existing: Node2D = _markers_by_unit_id[unit_id] as Node2D
		_update_marker_style(existing, unit)
		return existing

	var marker := Node2D.new()
	marker.name = "UnitMarker_%s" % unit_id
	marker.z_index = 4
	marker.set_script(UnitMarkerScript)
	add_child(marker)
	_markers_by_unit_id[unit_id] = marker
	_update_marker_style(marker, unit)
	return marker

func _update_marker_style(marker: Node2D, unit: Dictionary) -> void:
	if marker == null:
		return
	var faction_id: String = _resolve_unit_faction_id(unit)
	marker.set("radius", marker_radius)
	marker.call("set_faction_color", _resolve_faction_color(faction_id))
	if marker.has_method("set_identity_kind"):
		marker.call("set_identity_kind", _resolve_identity_kind(unit))

func _resolve_unit_faction_id(unit: Dictionary) -> String:
	var faction_id: String = str(unit.get("faction", unit.get("factionId", ""))).strip_edges()
	return faction_id

func _resolve_identity_kind(unit: Dictionary) -> String:
	var ai_player_id: String = str(unit.get("aiPlayerId", "")).strip_edges()
	if ai_player_id != "":
		return IDENTITY_KIND_AI
	var faction_id: String = _resolve_unit_faction_id(unit)
	var normalized_faction: String = faction_id.strip_edges().to_lower()
	if normalized_faction in NEUTRAL_FACTION_HINTS:
		return IDENTITY_KIND_NEUTRAL
	var human_faction_id: String = _resolve_human_faction_id()
	if human_faction_id != "" and normalized_faction == human_faction_id:
		return IDENTITY_KIND_HUMAN
	return IDENTITY_KIND_AI

func _resolve_human_faction_id() -> String:
	var session_faction_id: String = SessionStore.faction_id.strip_edges().to_lower()
	if session_faction_id != "":
		return session_faction_id
	return "player"

func _resolve_unit_position(unit: Dictionary, fallback: Vector2) -> Vector2:
	var tile_id: String = str(unit.get("tileId", "")).strip_edges()
	if tile_id == "":
		return fallback
	if not _tile_positions_by_id.has(tile_id):
		return fallback
	if _map_grid == null or not _map_grid.has_method("tile_to_screen_position"):
		return fallback

	var tile_coord: Vector2i = _tile_positions_by_id[tile_id] as Vector2i
	var base_position: Vector2
	if _map_grid.has_method("tile_id_to_screen_position"):
		base_position = _map_grid.tile_id_to_screen_position(tile_id, tile_coord.x, tile_coord.y)
	else:
		base_position = _map_grid.tile_to_screen_position(tile_coord.x, tile_coord.y)
	return base_position + Vector2(0.0, marker_vertical_offset)

func _sync_marker_positions() -> void:
	for unit_id_variant in _prev_units_by_id.keys():
		var unit_id: String = str(unit_id_variant)
		if not _markers_by_unit_id.has(unit_id):
			continue
		var marker: Node2D = _markers_by_unit_id[unit_id] as Node2D
		if marker == null:
			continue
		var unit: Dictionary = _prev_units_by_id[unit_id] as Dictionary
		var target_position: Vector2 = _resolve_unit_position(unit, marker.position)
		_set_marker_position(marker, target_position)

func _sync_ai_map_visuals(world_payload: Dictionary) -> void:
	if world_payload.is_empty():
		for marker_variant in _ai_map_markers_by_key.values():
			if marker_variant is Node2D:
				(marker_variant as Node2D).queue_free()
		_ai_map_markers_by_key.clear()
		return

	var desired_markers: Dictionary = {}
	_collect_ai_intent_markers(desired_markers)
	_collect_ai_resource_state_markers(world_payload, desired_markers)

	for key_variant in _ai_map_markers_by_key.keys():
		var key := str(key_variant)
		if desired_markers.has(key):
			continue
		var stale_marker: Node2D = _ai_map_markers_by_key[key] as Node2D
		if stale_marker != null:
			stale_marker.queue_free()
		_ai_map_markers_by_key.erase(key)

	for key_variant in desired_markers.keys():
		var key := str(key_variant)
		var marker_meta: Dictionary = desired_markers[key] as Dictionary
		var tile_id := str(marker_meta.get("tileId", "")).strip_edges()
		if tile_id == "":
			continue
		var marker := _ensure_ai_map_marker(
			key,
			str(marker_meta.get("kind", "intent")),
			str(marker_meta.get("status", "pending"))
		)
		if marker == null:
			continue
		marker.set_meta("tile_id", tile_id)
		marker.position = _resolve_tile_marker_position(tile_id, marker.position)

func _sync_ai_map_visual_positions() -> void:
	for key_variant in _ai_map_markers_by_key.keys():
		var key := str(key_variant)
		var marker: Node2D = _ai_map_markers_by_key[key] as Node2D
		if marker == null or not marker.has_meta("tile_id"):
			continue
		var tile_id := str(marker.get_meta("tile_id")).strip_edges()
		marker.position = _resolve_tile_marker_position(tile_id, marker.position)

func _collect_ai_intent_markers(markers: Dictionary) -> void:
	var ai_state: Dictionary = WorldStore.get_ai_state(_resolve_human_faction_id())
	var proposal_items: Array = ai_state.get("playerRuntimeProposalItems", []) as Array
	var intent_marker_count := 0
	for proposal_variant in proposal_items:
		if intent_marker_count >= AI_MAP_INTENT_MARKER_LIMIT:
			break
		if not (proposal_variant is Dictionary):
			continue
		var proposal: Dictionary = proposal_variant as Dictionary
		var status := str(proposal.get("status", "")).strip_edges()
		if status != "pending_approval" and status != "approved":
			continue
		var action := str(proposal.get("action", "")).strip_edges()
		if action != "march_move" and action != "tile_occupy" and action != "resource_gather":
			continue
		var args: Dictionary = proposal.get("args", {}) as Dictionary
		var tile_id := _resolve_tile_id_from_ai_payload(args)
		if tile_id == "":
			continue
		var proposal_id := str(proposal.get("proposalId", proposal.get("id", ""))).strip_edges()
		var key := "intent:%s:%s" % [action, proposal_id if proposal_id != "" else tile_id]
		markers[key] = {
			"kind": "intent",
			"status": status,
			"tileId": tile_id,
		}
		intent_marker_count += 1

func _collect_ai_resource_state_markers(world_payload: Dictionary, markers: Dictionary) -> void:
	var human_faction_id := _resolve_human_faction_id()
	var faction_state := _read_world_faction_state(world_payload, human_faction_id)
	var gathered_tile_count := 0
	var raw_claims_variant: Variant = faction_state.get("aiResourceGatherClaims", {})
	var raw_claims: Dictionary = (raw_claims_variant as Dictionary) if raw_claims_variant is Dictionary else {}
	for claim_variant in raw_claims.values():
		if not (claim_variant is Dictionary):
			continue
		var claim: Dictionary = claim_variant as Dictionary
		var tile_id := str(claim.get("tileId", "")).strip_edges()
		if tile_id == "":
			continue
		markers["gathered:%s" % tile_id] = {
			"kind": "gathered",
			"status": "claimed",
			"tileId": tile_id,
		}
		gathered_tile_count += 1
		if gathered_tile_count >= AI_MAP_RESOURCE_STATE_MARKER_LIMIT:
			break

	var map_payload: Dictionary = world_payload.get("map", {}) as Dictionary
	var raw_tiles_variant: Variant = map_payload.get("tiles", [])
	if not (raw_tiles_variant is Array):
		return
	var raw_tiles: Array = raw_tiles_variant as Array
	var occupied_tile_count := 0
	for tile_variant in raw_tiles:
		if not (tile_variant is Dictionary):
			continue
		var tile: Dictionary = tile_variant as Dictionary
		if str(tile.get("owner", "")).strip_edges().to_lower() != human_faction_id:
			continue
		var tile_type := str(tile.get("type", "")).strip_edges()
		var resource_kind := str(tile.get("resourceKind", "")).strip_edges()
		if tile_type != "resource" and resource_kind == "":
			continue
		var tile_id := str(tile.get("id", "")).strip_edges()
		if tile_id == "":
			continue
		var key := "occupied:%s" % tile_id
		if markers.has("gathered:%s" % tile_id):
			continue
		markers[key] = {
			"kind": "occupied",
			"status": "owned",
			"tileId": tile_id,
		}
		occupied_tile_count += 1
		if occupied_tile_count >= AI_MAP_RESOURCE_STATE_MARKER_LIMIT:
			break

func _ensure_ai_map_marker(key: String, kind: String, status: String) -> Node2D:
	var marker: Node2D = null
	if _ai_map_markers_by_key.has(key):
		marker = _ai_map_markers_by_key[key] as Node2D
	else:
		marker = Node2D.new()
		marker.name = "AIMapMarker_%s" % key.replace(":", "_")
		marker.set_script(AIMapIntentMarkerScript)
		add_child(marker)
		_ai_map_markers_by_key[key] = marker
	if marker != null and marker.has_method("set_visual_state"):
		marker.call("set_visual_state", kind, status)
	if marker != null:
		marker.z_index = 1
	return marker

func _resolve_tile_id_from_ai_payload(payload: Dictionary) -> String:
	for key in ["tileId", "targetTileId", "toTileId"]:
		var tile_id := str(payload.get(key, "")).strip_edges()
		if tile_id != "":
			return tile_id
	return ""

func _read_world_faction_state(world_payload: Dictionary, faction_id: String) -> Dictionary:
	var raw_factions: Variant = world_payload.get("factions", {})
	if raw_factions is Dictionary:
		var faction_state: Variant = (raw_factions as Dictionary).get(faction_id, {})
		if faction_state is Dictionary:
			return faction_state as Dictionary
	return {}

func _resolve_tile_marker_position(tile_id: String, fallback: Vector2) -> Vector2:
	if tile_id == "" or not _tile_positions_by_id.has(tile_id):
		return fallback
	if _map_grid == null or not _map_grid.has_method("tile_to_screen_position"):
		return fallback
	var tile_coord: Vector2i = _tile_positions_by_id[tile_id] as Vector2i
	var base_position: Vector2
	if _map_grid.has_method("tile_id_to_screen_position"):
		base_position = _map_grid.tile_id_to_screen_position(tile_id, tile_coord.x, tile_coord.y)
	else:
		base_position = _map_grid.tile_to_screen_position(tile_coord.x, tile_coord.y)
	return base_position + Vector2(0.0, marker_vertical_offset - 4.0)

func _set_marker_position(marker: Node2D, target_position: Vector2) -> void:
	_cancel_marker_tween(marker)
	marker.position = target_position
	if marker != null and marker.has_method("set_moving"):
		marker.call("set_moving", false, Vector2.ZERO)

func _animate_marker_move(
	marker: Node2D,
	from_position: Vector2,
	target_position: Vector2,
	engage_intensity_after_move: float,
	engage_kind_after_move: String,
	engage_direction_after_move: Vector2,
) -> void:
	_cancel_marker_tween(marker)
	marker.position = from_position
	var move_direction: Vector2 = (target_position - from_position).normalized() if target_position.distance_to(from_position) > 0.001 else engage_direction_after_move
	if marker != null and marker.has_method("set_moving"):
		marker.call("set_moving", true, move_direction)
	var tween := create_tween()
	tween.set_trans(Tween.TRANS_CUBIC)
	tween.set_ease(Tween.EASE_OUT)
	marker.set_meta("move_tween", tween)
	tween.tween_property(marker, "position", target_position, move_duration_sec)
	if engage_intensity_after_move > 0.0:
		tween.tween_callback(
			Callable(marker, "play_engage").bind(
				engage_intensity_after_move,
				engage_direction_after_move,
				engage_kind_after_move,
			),
		)
	tween.tween_callback(Callable(self, "_on_marker_move_finished").bind(marker))

func _cancel_marker_tween(marker: Node2D) -> void:
	if marker == null or not marker.has_meta("move_tween"):
		return
	var running_tween: Variant = marker.get_meta("move_tween")
	if running_tween is Tween:
		(running_tween as Tween).kill()
	marker.remove_meta("move_tween")

func _on_marker_move_finished(marker: Node2D) -> void:
	if marker == null:
		return
	if marker.has_meta("move_tween"):
		marker.remove_meta("move_tween")
	if marker.has_method("set_moving"):
		marker.call("set_moving", false, Vector2.ZERO)

func _resolve_faction_color(faction_id: String) -> Color:
	return FactionVisualsScript.resolve_marker_color(faction_id, _resolve_human_faction_id())

func _trigger_engage_from_replay_frames(world_payload: Dictionary, next_units_by_id: Dictionary) -> void:
	var history_payload: Dictionary = world_payload.get("history", {}) as Dictionary
	var raw_replays: Variant = history_payload.get("executionReplays", [])
	if not (raw_replays is Array):
		return
	var units_by_tile: Dictionary = _index_unit_ids_by_tile(next_units_by_id)

	for replay_variant in raw_replays:
		if not (replay_variant is Dictionary):
			continue
		var replay: Dictionary = replay_variant as Dictionary
		var request_id: String = str(replay.get("requestId", "")).strip_edges()
		if request_id == "":
			continue
		var raw_frames: Variant = replay.get("frames", [])
		if not (raw_frames is Array):
			continue

		for frame_variant in raw_frames:
			if not (frame_variant is Dictionary):
				continue
			var frame: Dictionary = frame_variant as Dictionary
			var frame_id: String = _build_replay_frame_id(request_id, frame)
			if frame_id == "" or _seen_replay_frame_ids.has(frame_id):
				continue
			_remember_replay_frame_id(frame_id)

			if not _frame_has_engage_highlight(frame):
				continue

			var engage_targets: Dictionary = _collect_engage_targets_from_highlights(frame, units_by_tile)
			if engage_targets.is_empty():
				engage_targets = _collect_engage_targets_from_frame(frame)
				_replay_engage_kind_counts[ENGAGE_KIND_TILE_CONTROL] = int(_replay_engage_kind_counts.get(ENGAGE_KIND_TILE_CONTROL, 0)) + engage_targets.size()
			var frame_trigger_count: int = 0
			for unit_id_variant in engage_targets.keys():
				var unit_id: String = str(unit_id_variant)
				if not _markers_by_unit_id.has(unit_id):
					continue
				var marker: Node2D = _markers_by_unit_id[unit_id] as Node2D
				if marker != null:
					var target_meta: Dictionary = engage_targets[unit_id] as Dictionary
					var target_intensity: float = float(target_meta.get("intensity", 0.65))
					var target_kind: String = str(target_meta.get("kind", "tile_control")).strip_edges()
					var replay_direction: Vector2 = _resolve_replay_engage_direction(
						unit_id,
						target_meta,
						next_units_by_id,
					)
					marker.call("play_engage", target_intensity, replay_direction, target_kind)
					frame_trigger_count += 1
					_replay_engage_trigger_count += 1
			_update_replay_engage_metrics_snapshot(frame_id, frame_trigger_count)

func _build_replay_frame_id(request_id: String, frame: Dictionary) -> String:
	var tick: int = int(frame.get("tick", -1))
	var world_version: int = int(frame.get("worldVersion", -1))
	var label: String = str(frame.get("label", ""))
	if tick < 0 or world_version < 0:
		return ""
	return "%s:%d:%d:%s" % [request_id, tick, world_version, label]

func _frame_has_engage_highlight(frame: Dictionary) -> bool:
	var raw_highlights: Variant = frame.get("highlights", [])
	if not (raw_highlights is Array):
		return false

	for highlight_variant in raw_highlights:
		if not (highlight_variant is Dictionary):
			continue
		var highlight: Dictionary = highlight_variant as Dictionary
		var kind: String = str(highlight.get("kind", "")).strip_edges()
		if kind == "battle" or kind == "tile_control" or kind == "logistics":
			return true
		if _is_replay_engage_unknown_with_anchor(kind, highlight):
			return true
	return false

func _is_known_non_engage_kind(kind: String) -> bool:
	return kind in KNOWN_NON_ENGAGE_HIGHLIGHT_KINDS

func _is_replay_engage_unknown_with_anchor(kind: String, highlight: Dictionary) -> bool:
	if kind == "" or _is_known_non_engage_kind(kind):
		return false
	return _highlight_has_engage_anchor(highlight)

func _highlight_has_engage_anchor(highlight: Dictionary) -> bool:
	return (
		str(highlight.get("unitId", "")).strip_edges() != ""
		or str(highlight.get("tileId", "")).strip_edges() != ""
		or str(highlight.get("fromTileId", "")).strip_edges() != ""
		or str(highlight.get("toTileId", "")).strip_edges() != ""
	)

func _normalize_replay_engage_kind(raw_kind: String, highlight: Dictionary) -> String:
	var kind: String = raw_kind.strip_edges()
	if kind == ENGAGE_KIND_BATTLE or kind == ENGAGE_KIND_TILE_CONTROL or kind == ENGAGE_KIND_LOGISTICS:
		return kind
	if kind == "" or _is_known_non_engage_kind(kind):
		return ""
	if not _highlight_has_engage_anchor(highlight):
		return ""
	_replay_engage_unknown_kind_count += 1
	if _replay_engage_unknown_kind_samples.size() < 8 and not _replay_engage_unknown_kind_samples.has(kind):
		_replay_engage_unknown_kind_samples.append(kind)
	return ENGAGE_KIND_FALLBACK

func _register_replay_engage_kind(kind: String) -> void:
	if kind == "":
		return
	_replay_engage_kind_counts[kind] = int(_replay_engage_kind_counts.get(kind, 0)) + 1

func _collect_engage_targets_from_frame(frame: Dictionary) -> Dictionary:
	var targets: Dictionary = {}
	var raw_order_states: Variant = frame.get("orderStates", [])
	if not (raw_order_states is Array):
		return targets

	for order_state_variant in raw_order_states:
		if not (order_state_variant is Dictionary):
			continue
		var order_state: Dictionary = order_state_variant as Dictionary
		var status: String = str(order_state.get("status", ""))
		if status != "running" and status != "completed" and status != "failed":
			continue

		var unit_id: String = str(order_state.get("unitId", "")).strip_edges()
		if unit_id == "" or targets.has(unit_id):
			continue
		targets[unit_id] = {
			"intensity": _resolve_engage_intensity_for_kind("tile_control"),
			"kind": "tile_control",
			"fromTileId": "",
			"toTileId": str(order_state.get("target", "")).strip_edges(),
		}
		if targets.size() >= 4:
			break

	return targets

func _collect_engage_targets_from_highlights(frame: Dictionary, units_by_tile: Dictionary) -> Dictionary:
	var targets: Dictionary = {}
	var raw_highlights: Variant = frame.get("highlights", [])
	if not (raw_highlights is Array):
		return targets

	for highlight_variant in raw_highlights:
		if not (highlight_variant is Dictionary):
			continue
		var highlight: Dictionary = highlight_variant as Dictionary
		var kind: String = _normalize_replay_engage_kind(str(highlight.get("kind", "")).strip_edges(), highlight)
		if kind == "":
			continue
		_register_replay_engage_kind(kind)
		var intensity: float = _resolve_engage_intensity_for_kind(kind)
		if intensity <= 0.0:
			continue

		var from_tile_id: String = str(highlight.get("fromTileId", "")).strip_edges()
		var to_tile_id: String = str(highlight.get("toTileId", "")).strip_edges()
		var tile_id: String = str(highlight.get("tileId", "")).strip_edges()
		if to_tile_id == "" and tile_id != "":
			to_tile_id = tile_id

		var unit_id: String = str(highlight.get("unitId", "")).strip_edges()
		if unit_id != "":
			_upsert_engage_target(targets, unit_id, intensity, kind, from_tile_id, to_tile_id)
			continue

		var anchor_tile_id: String = tile_id if tile_id != "" else to_tile_id
		if anchor_tile_id == "" or not units_by_tile.has(anchor_tile_id):
			continue
		var units_on_tile: Array = units_by_tile[anchor_tile_id] as Array
		for tile_unit_id_variant in units_on_tile:
			var tile_unit_id: String = str(tile_unit_id_variant)
			if tile_unit_id == "":
				continue
			_upsert_engage_target(targets, tile_unit_id, intensity, kind, from_tile_id, to_tile_id)
			if targets.size() >= 8:
				return targets

	return targets

func _upsert_engage_target(
	targets: Dictionary,
	unit_id: String,
	intensity: float,
	kind: String,
	from_tile_id: String,
	to_tile_id: String,
) -> void:
	if not targets.has(unit_id):
		targets[unit_id] = {
			"intensity": intensity,
			"kind": kind,
			"fromTileId": from_tile_id,
			"toTileId": to_tile_id,
		}
		return

	var previous: Dictionary = targets[unit_id] as Dictionary
	var previous_intensity: float = float(previous.get("intensity", 0.0))
	if intensity <= previous_intensity:
		return

	targets[unit_id] = {
		"intensity": intensity,
		"kind": kind,
		"fromTileId": from_tile_id,
		"toTileId": to_tile_id,
	}

func _remember_replay_frame_id(frame_id: String) -> void:
	_seen_replay_frame_ids[frame_id] = true
	_seen_replay_frame_order.append(frame_id)
	const MAX_SEEN_REPLAY_FRAME_IDS: int = 512
	while _seen_replay_frame_order.size() > MAX_SEEN_REPLAY_FRAME_IDS:
		var stale_id: String = str(_seen_replay_frame_order.pop_front())
		_seen_replay_frame_ids.erase(stale_id)

func _update_replay_engage_metrics_snapshot(frame_id: String, frame_trigger_count: int) -> void:
	_replay_engage_last_frame_summary = {
		"frameId": frame_id,
		"frameTriggerCount": frame_trigger_count,
		"totalTriggerCount": _replay_engage_trigger_count,
		"kindCounts": _replay_engage_kind_counts.duplicate(true),
		"unknownKindCount": _replay_engage_unknown_kind_count,
		"unknownKindSamples": _replay_engage_unknown_kind_samples.duplicate(),
		"directionDirectHits": _replay_engage_direction_direct_hits,
		"directionFallbackHits": _replay_engage_direction_fallback_hits,
	}
	set_meta("replay_engage_metrics", _replay_engage_last_frame_summary)

func _index_unit_ids_by_tile(next_units_by_id: Dictionary) -> Dictionary:
	var indexed: Dictionary = {}
	for unit_id_variant in next_units_by_id.keys():
		var unit_id: String = str(unit_id_variant)
		var unit: Dictionary = next_units_by_id[unit_id] as Dictionary
		var tile_id: String = str(unit.get("tileId", "")).strip_edges()
		if tile_id == "":
			continue
		if not indexed.has(tile_id):
			indexed[tile_id] = []
		var units_on_tile: Array = indexed[tile_id] as Array
		if not units_on_tile.has(unit_id):
			units_on_tile.append(unit_id)
	return indexed

func _resolve_engage_intensity_for_kind(kind: String) -> float:
	match kind:
		"battle":
			return 1.20
		"tile_control":
			return 0.82
		"logistics":
			return 0.55
		_:
			return 0.0

func _resolve_unit_direction_vector(previous_unit: Dictionary, next_unit: Dictionary) -> Vector2:
	var from_tile_id: String = str(previous_unit.get("tileId", "")).strip_edges()
	var to_tile_id: String = str(next_unit.get("tileId", "")).strip_edges()
	return _resolve_tile_direction_vector(from_tile_id, to_tile_id)

func _resolve_replay_engage_direction(unit_id: String, target_meta: Dictionary, next_units_by_id: Dictionary) -> Vector2:
	var from_tile_id: String = str(target_meta.get("fromTileId", "")).strip_edges()
	var to_tile_id: String = str(target_meta.get("toTileId", "")).strip_edges()
	var replay_vector: Vector2 = _resolve_tile_direction_vector(from_tile_id, to_tile_id)
	if replay_vector != Vector2.ZERO:
		_replay_engage_direction_direct_hits += 1
		return replay_vector

	_replay_engage_direction_fallback_hits += 1
	if _prev_units_by_id.has(unit_id) and next_units_by_id.has(unit_id):
		var previous_unit: Dictionary = _prev_units_by_id[unit_id] as Dictionary
		var next_unit: Dictionary = next_units_by_id[unit_id] as Dictionary
		var delta_vector: Vector2 = _resolve_unit_direction_vector(previous_unit, next_unit)
		if delta_vector != Vector2.ZERO:
			return delta_vector

	if to_tile_id != "" and next_units_by_id.has(unit_id):
		var unit: Dictionary = next_units_by_id[unit_id] as Dictionary
		var current_tile_id: String = str(unit.get("tileId", "")).strip_edges()
		var toward_target: Vector2 = _resolve_tile_direction_vector(current_tile_id, to_tile_id)
		if toward_target != Vector2.ZERO:
			return toward_target

	return Vector2.ZERO

func _resolve_tile_direction_vector(from_tile_id: String, to_tile_id: String) -> Vector2:
	if from_tile_id == "" or to_tile_id == "" or from_tile_id == to_tile_id:
		return Vector2.ZERO
	if not _tile_positions_by_id.has(from_tile_id) or not _tile_positions_by_id.has(to_tile_id):
		return Vector2.ZERO

	var from_coord: Vector2i = _tile_positions_by_id[from_tile_id] as Vector2i
	var to_coord: Vector2i = _tile_positions_by_id[to_tile_id] as Vector2i
	var delta: Vector2 = Vector2(float(to_coord.x - from_coord.x), float(to_coord.y - from_coord.y))
	if delta.length() <= 0.001:
		return Vector2.ZERO
	return delta.normalized()
