extends RefCounted
class_name OverlayRuntimeHelper

var _runtime_state := {
	"active_city_state_id": "",
	"active_troop_panel_unit_id": "",
	"active_troop_panel_facility_id": "",
}

func seed_runtime_state(runtime_state: Dictionary) -> void:
	_runtime_state = _merge_runtime_state(_runtime_state, runtime_state)

func snapshot_runtime_state() -> Dictionary:
	return _runtime_state.duplicate(true)

func apply_runtime_state_patch(runtime_state_patch: Dictionary) -> Dictionary:
	_runtime_state = _merge_runtime_state(_runtime_state, runtime_state_patch)
	return snapshot_runtime_state()

func capture_runtime_state(overlay_spec: Dictionary, runtime_state: Dictionary) -> Dictionary:
	var captured_state := {}
	var preserve_keys: Array = overlay_spec.get("preserve_runtime_state_keys", []) as Array
	for key_variant in preserve_keys:
		var key := str(key_variant).strip_edges()
		if key == "":
			continue
		captured_state[key] = str(runtime_state.get(key, ""))
	return captured_state

func restore_runtime_state(overlay_spec: Dictionary, preserved_state: Dictionary) -> Dictionary:
	if preserved_state.is_empty():
		return {}
	var restore_patch := {}
	var preserve_keys: Array = overlay_spec.get("preserve_runtime_state_keys", []) as Array
	for key_variant in preserve_keys:
		var key := str(key_variant).strip_edges()
		if key == "" or not preserved_state.has(key):
			continue
		restore_patch[key] = str(preserved_state.get(key, ""))
	return restore_patch

func build_open_runtime_patch(
	overlay_spec: Dictionary,
	runtime_state: Dictionary,
	preserved_state: Dictionary,
	reset_keys: Array = []
) -> Dictionary:
	var resolved_reset_keys: Array = reset_keys
	if resolved_reset_keys.is_empty():
		resolved_reset_keys = overlay_spec.get("open_runtime_state_reset_keys", []) as Array
	var next_patch := {}
	for key_variant in resolved_reset_keys:
		var key := str(key_variant).strip_edges()
		if key == "":
			continue
		next_patch[key] = ""
	var restore_patch := restore_runtime_state(overlay_spec, preserved_state)
	for key_variant in restore_patch.keys():
		next_patch[str(key_variant)] = restore_patch.get(key_variant, "")
	var prepared_payload := prepare_snapshot_payload(
		overlay_spec,
		overlay_spec.get("snapshot", {}) as Dictionary,
		_merge_runtime_state(runtime_state, next_patch)
	)
	for key_variant in (prepared_payload.get("runtime_state_patch", {}) as Dictionary).keys():
		next_patch[str(key_variant)] = (prepared_payload.get("runtime_state_patch", {}) as Dictionary).get(key_variant, "")
	return next_patch

func build_open_overlay_runtime_patch(overlay_spec: Dictionary) -> Dictionary:
	if overlay_spec.is_empty():
		return {}
	var runtime_state := snapshot_runtime_state()
	var preserved_state := capture_runtime_state(overlay_spec, runtime_state)
	return build_open_runtime_patch(overlay_spec, runtime_state, preserved_state)

func build_interior_overlay_spec(scene: PackedScene, snapshot_payload: Dictionary) -> Dictionary:
	return {
		"scene": scene,
		"setter_method": "set_interior_snapshot",
		"snapshot": snapshot_payload.get("snapshot", {}) as Dictionary,
		"runtime_state_patch": snapshot_payload.get("runtime_state_patch", {}) as Dictionary,
		"open_runtime_state_reset_keys": [],
		"close_runtime_state_patch": {},
		"page_handler": "_on_overlay_page_changed",
		"action_handler": "",
		"extra_signal_handlers": {
			"building_upgrade_requested": {
				"handler": "_on_snapshot_overlay_extra_action_requested",
				"bind_args": ["request_interior_building_panel_action"],
			},
			"affair_enqueued": {
				"handler": "_on_snapshot_overlay_extra_action_requested",
				"bind_args": ["request_interior_affair_panel_action"],
			},
		},
		"extra_action_arg_templates": {
			"request_interior_building_panel_action": ["{active_city_state_id}", "{arg1}", "{arg2}"],
			"request_interior_affair_panel_action": ["{active_city_state_id}", "{arg1}"],
		},
		"record_key": "panel/interior",
		"runtime_label": "panel 内政",
	}

func build_troop_overlay_spec(scene: PackedScene, snapshot_payload: Dictionary) -> Dictionary:
	return {
		"scene": scene,
		"setter_method": "set_troop_snapshot",
		"snapshot": snapshot_payload.get("snapshot", {}) as Dictionary,
		"runtime_state_patch": snapshot_payload.get("runtime_state_patch", {}) as Dictionary,
		"open_runtime_state_reset_keys": [
			"active_troop_panel_unit_id",
			"active_troop_panel_facility_id",
		],
		"close_runtime_state_patch": {
			"active_troop_panel_unit_id": "",
			"active_troop_panel_facility_id": "",
		},
		"page_handler": "",
		"action_handler": "",
		"extra_signal_handlers": {
			"troop_selected": {
				"handler": "_on_snapshot_overlay_state_signal",
				"bind_args": ["troop_selected"],
			},
			"facility_selected": {
				"handler": "_on_snapshot_overlay_state_signal",
				"bind_args": ["facility_selected"],
			},
			"building_selected": {
				"handler": "_on_snapshot_overlay_state_signal",
				"bind_args": ["building_selected"],
			},
			"upgrade_requested": {
				"handler": "_on_snapshot_overlay_extra_action_requested",
				"bind_args": ["request_troop_panel_upgrade_action"],
			},
		},
		"preserve_runtime_state_keys": [
			"active_troop_panel_unit_id",
			"active_troop_panel_facility_id",
		],
		"state_feedback_specs": {
			"troop_selected": {
				"assign_state": {
					"active_troop_panel_unit_id": "{value}",
					"active_troop_panel_facility_id": "",
				},
				"record_path": "panel/troop/{active_troop_panel_unit_id}",
				"record_state": "troop",
				"runtime_label": "panel 部队 / {active_troop_panel_unit_id}",
			},
			"facility_selected": {
				"assign_state": {
					"active_troop_panel_facility_id": "{value}",
				},
				"record_path": "panel/troop/{active_troop_panel_unit_id}/facility/{value}",
				"record_state": "facility",
				"runtime_label": "panel 部队 / 设施 / {value}",
			},
			"building_selected": {
				"record_path": "panel/troop/{active_troop_panel_unit_id}/building/{value}",
				"record_state": "building",
				"runtime_label": "panel 部队 / 建筑 / {value}",
			},
		},
		"extra_action_arg_templates": {
			"request_troop_panel_upgrade_action": ["{active_troop_panel_unit_id}", "{active_troop_panel_facility_id}", "{arg1}"],
		},
		"record_key": "panel/troop",
		"runtime_label": "panel 部队",
	}

func build_basic_snapshot_overlay_spec(
	scene: PackedScene,
	setter_method: String,
	snapshot_payload: Dictionary,
	record_key: String,
	runtime_label: String,
	page_handler: String = "_on_overlay_page_changed",
	action_handler: String = "",
	adapter_method: String = "",
	extra_signal_handlers: Dictionary = {}
) -> Dictionary:
	return {
		"scene": scene,
		"setter_method": setter_method,
		"snapshot": snapshot_payload.get("snapshot", snapshot_payload) as Dictionary,
		"runtime_state_patch": snapshot_payload.get("runtime_state_patch", {}) as Dictionary,
		"open_runtime_state_reset_keys": [],
		"close_runtime_state_patch": {},
		"page_handler": page_handler,
		"action_handler": action_handler,
		"adapter_method": adapter_method,
		"extra_signal_handlers": extra_signal_handlers.duplicate(true),
		"record_key": record_key,
		"runtime_label": runtime_label,
	}

func prepare_snapshot_payload(overlay_spec: Dictionary, snapshot: Dictionary, runtime_state: Dictionary) -> Dictionary:
	var prepared_snapshot: Dictionary = snapshot.duplicate(true)
	var runtime_state_patch: Dictionary = (overlay_spec.get("runtime_state_patch", {}) as Dictionary).duplicate(true)
	var snapshot_runtime_state_keys: Dictionary = overlay_spec.get("snapshot_runtime_state_keys", {}) as Dictionary
	for runtime_key_variant in snapshot_runtime_state_keys.keys():
		var runtime_key := str(runtime_key_variant).strip_edges()
		var snapshot_key := str(snapshot_runtime_state_keys.get(runtime_key_variant, "")).strip_edges()
		if runtime_key == "" or snapshot_key == "":
			continue
		runtime_state_patch[runtime_key] = str(prepared_snapshot.get(snapshot_key, runtime_state.get(runtime_key, "")))
	return {
		"snapshot": prepared_snapshot,
		"runtime_state_patch": runtime_state_patch,
	}

func prepare_snapshot_payload_from_state(overlay_spec: Dictionary) -> Dictionary:
	return prepare_snapshot_payload(
		overlay_spec,
		overlay_spec.get("snapshot", {}) as Dictionary,
		snapshot_runtime_state()
	)

func build_refresh_payload(overlay_spec: Dictionary, runtime_state: Dictionary) -> Dictionary:
	if overlay_spec.is_empty():
		return {}
	var prepared_payload := prepare_snapshot_payload(
		overlay_spec,
		overlay_spec.get("snapshot", {}) as Dictionary,
		runtime_state
	)
	return {
		"setter_method": str(overlay_spec.get("setter_method", "")),
		"snapshot": prepared_payload.get("snapshot", {}) as Dictionary,
		"runtime_state_patch": prepared_payload.get("runtime_state_patch", {}) as Dictionary,
	}

func build_active_overlay_refresh_payload(active_overlay_spec: Dictionary, runtime_state: Dictionary) -> Dictionary:
	if active_overlay_spec.is_empty():
		return {}
	return build_refresh_payload(active_overlay_spec, runtime_state)

func build_active_overlay_refresh_payload_from_state(active_overlay_spec: Dictionary) -> Dictionary:
	return build_active_overlay_refresh_payload(active_overlay_spec, snapshot_runtime_state())

func build_active_overlay_refresh_apply_payload(active_overlay_spec: Dictionary, runtime_state: Dictionary) -> Dictionary:
	var refresh_payload := build_active_overlay_refresh_payload(active_overlay_spec, runtime_state)
	if refresh_payload.is_empty():
		return {}
	return {
		"refresh_payload": refresh_payload,
		"refresh_overlay": true,
	}

func build_active_overlay_refresh_apply_payload_from_state(active_overlay_spec: Dictionary) -> Dictionary:
	return build_active_overlay_refresh_apply_payload(active_overlay_spec, snapshot_runtime_state())

func resolve_state_feedback(overlay_spec: Dictionary, signal_kind: String, value_id: String, runtime_state: Dictionary) -> Dictionary:
	if overlay_spec.is_empty():
		return {}
	var state_feedback_specs: Dictionary = overlay_spec.get("state_feedback_specs", {}) as Dictionary
	if not state_feedback_specs.has(signal_kind):
		return {}
	var state_feedback_spec: Dictionary = state_feedback_specs.get(signal_kind, {}) as Dictionary
	var value_token := value_id.strip_edges()
	var runtime_state_patch := _build_state_assignments(
		state_feedback_spec.get("assign_state", {}) as Dictionary,
		value_token,
		runtime_state
	)
	var resolved_state := runtime_state.duplicate(true)
	for key_variant in runtime_state_patch.keys():
		resolved_state[str(key_variant)] = runtime_state_patch.get(key_variant, "")
	var template_tokens := _build_template_tokens(value_token, "", "", resolved_state)
	return {
		"record_path": _expand_template(str(state_feedback_spec.get("record_path", "")), template_tokens),
		"record_state": str(state_feedback_spec.get("record_state", "")),
		"runtime_label": _expand_template(str(state_feedback_spec.get("runtime_label", "")), template_tokens),
		"runtime_state_patch": runtime_state_patch,
	}

func resolve_state_feedback_from_state(overlay_spec: Dictionary, signal_kind: String, value_id: String) -> Dictionary:
	return resolve_state_feedback(overlay_spec, signal_kind, value_id, snapshot_runtime_state())

func build_adapter_args(overlay_spec: Dictionary, adapter_method: String, arg1: String, arg2: String, runtime_state: Dictionary) -> Array:
	if overlay_spec.is_empty():
		return []
	var arg_templates_by_method: Dictionary = overlay_spec.get("extra_action_arg_templates", {}) as Dictionary
	if not arg_templates_by_method.has(adapter_method):
		return []
	var arg_templates: Array = arg_templates_by_method.get(adapter_method, []) as Array
	var template_tokens := _build_template_tokens("", arg1, arg2, runtime_state)
	var resolved_args: Array = []
	for arg_template_variant in arg_templates:
		resolved_args.append(_expand_template(str(arg_template_variant), template_tokens))
	return resolved_args

func build_adapter_args_from_state(overlay_spec: Dictionary, adapter_method: String, arg1: String, arg2: String) -> Array:
	return build_adapter_args(overlay_spec, adapter_method, arg1, arg2, snapshot_runtime_state())

func build_post_navigation_spec(outcome: Dictionary) -> Dictionary:
	var open_page_id := str(outcome.get("post_open_page_id", "")).strip_edges()
	return {
		"open_panel_id": str(outcome.get("post_open_panel_id", "")).strip_edges(),
		"open_page_id": open_page_id,
		"runtime_state_patch": (outcome.get("post_open_runtime_state_patch", {}) as Dictionary).duplicate(true),
		"refresh_overlay": bool(outcome.get("refresh_overlay", true)),
	}

func build_overlay_action_apply_payload(
	outcome: Dictionary,
	active_overlay_spec: Dictionary,
	runtime_state: Dictionary
) -> Dictionary:
	return build_post_navigation_apply_payload(
		build_post_navigation_spec(outcome),
		active_overlay_spec,
		runtime_state
	)

func build_overlay_action_apply_payload_from_state(
	outcome: Dictionary,
	active_overlay_spec: Dictionary
) -> Dictionary:
	return build_overlay_action_apply_payload(outcome, active_overlay_spec, snapshot_runtime_state())

func build_overlay_action_followup_payload(
	outcome: Dictionary,
	active_overlay_spec: Dictionary,
	runtime_state: Dictionary,
	requires_map_refresh: bool = false
) -> Dictionary:
	return {
		"requires_map_refresh": requires_map_refresh or bool(outcome.get("requires_map_refresh", false)),
		"apply_payload": build_overlay_action_apply_payload(outcome, active_overlay_spec, runtime_state),
	}

func build_overlay_action_followup_payload_from_state(
	outcome: Dictionary,
	active_overlay_spec: Dictionary,
	requires_map_refresh: bool = false
) -> Dictionary:
	return build_overlay_action_followup_payload(outcome, active_overlay_spec, snapshot_runtime_state(), requires_map_refresh)

func run_overlay_action_followup_from_state(
	outcome: Dictionary,
	active_overlay_spec: Dictionary,
	requires_map_refresh: bool,
	world_refresh_callable: Callable
) -> Dictionary:
	var followup_payload := build_overlay_action_followup_payload_from_state(
		outcome,
		active_overlay_spec,
		requires_map_refresh
	)
	if bool(followup_payload.get("requires_map_refresh", false)) and world_refresh_callable.is_valid():
		await world_refresh_callable.call(true)
	return followup_payload

func build_close_runtime_patch(overlay_spec: Dictionary = {}) -> Dictionary:
	if overlay_spec.has("close_runtime_state_patch"):
		return (overlay_spec.get("close_runtime_state_patch", {}) as Dictionary).duplicate(true)
	return {
		"active_troop_panel_unit_id": "",
		"active_troop_panel_facility_id": "",
	}

func build_shell_troop_runtime_patch(troop_id: String) -> Dictionary:
	return {
		"active_troop_panel_unit_id": troop_id.strip_edges(),
		"active_troop_panel_facility_id": "",
	}

func merge_runtime_state(runtime_state: Dictionary, runtime_state_patch: Dictionary) -> Dictionary:
	return _merge_runtime_state(runtime_state, runtime_state_patch)

func build_post_navigation_apply_payload(
	post_navigation_spec: Dictionary,
	active_overlay_spec: Dictionary,
	runtime_state: Dictionary
) -> Dictionary:
	var runtime_state_patch: Dictionary = (post_navigation_spec.get("runtime_state_patch", {}) as Dictionary).duplicate(true)
	var resolved_runtime_state := _merge_runtime_state(runtime_state, runtime_state_patch)
	var open_panel_id := str(post_navigation_spec.get("open_panel_id", "")).strip_edges()
	if open_panel_id != "":
		return {
			"open_panel_id": open_panel_id,
			"open_page_id": str(post_navigation_spec.get("open_page_id", "")).strip_edges(),
			"runtime_state_patch": runtime_state_patch,
		}
	if bool(post_navigation_spec.get("refresh_overlay", true)) and not active_overlay_spec.is_empty():
		return {
			"runtime_state_patch": runtime_state_patch,
			"refresh_payload": build_refresh_payload(active_overlay_spec, resolved_runtime_state),
			"refresh_overlay": true,
		}
	return {
		"runtime_state_patch": runtime_state_patch,
		"refresh_overlay": bool(post_navigation_spec.get("refresh_overlay", true)),
	}

func _build_state_assignments(assignments: Dictionary, value_id: String, runtime_state: Dictionary) -> Dictionary:
	if assignments.is_empty():
		return {}
	var template_tokens := _build_template_tokens(value_id, "", "", runtime_state)
	var state_patch := {}
	for key_variant in assignments.keys():
		var key := str(key_variant).strip_edges()
		if key == "":
			continue
		state_patch[key] = _expand_template(str(assignments.get(key_variant, "")), template_tokens)
	return state_patch

func _build_template_tokens(value_id: String, arg1: String, arg2: String, runtime_state: Dictionary) -> Dictionary:
	return {
		"value": value_id,
		"arg1": arg1,
		"arg2": arg2,
		"active_city_state_id": str(runtime_state.get("active_city_state_id", "")),
		"active_troop_panel_unit_id": str(runtime_state.get("active_troop_panel_unit_id", "")),
		"active_troop_panel_facility_id": str(runtime_state.get("active_troop_panel_facility_id", "")),
	}

func _expand_template(template_text: String, template_tokens: Dictionary) -> String:
	var resolved := template_text
	for key_variant in template_tokens.keys():
		var key := str(key_variant).strip_edges()
		resolved = resolved.replace("{%s}" % key, str(template_tokens.get(key_variant, "")))
	return resolved

func _merge_runtime_state(runtime_state: Dictionary, runtime_state_patch: Dictionary) -> Dictionary:
	var merged_state := runtime_state.duplicate(true)
	for key_variant in runtime_state_patch.keys():
		merged_state[str(key_variant)] = runtime_state_patch.get(key_variant, "")
	return merged_state
