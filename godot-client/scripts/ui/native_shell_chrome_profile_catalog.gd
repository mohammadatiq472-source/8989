extends Resource
class_name NativeShellChromeProfileCatalog

const PROFILE_FALLBACK := "fallback_flat"
const ACTION_SURFACE_MAIN_NAV := "main_nav"
const ACTION_SURFACE_ENTRY := "entry"
const TROOP_ARCHETYPE_PRIMARY := "primary"
const TROOP_ARCHETYPE_MOBILE := "mobile"
const TROOP_ARCHETYPE_RESERVE := "reserve"

@export var fallback_profile_id: String = PROFILE_FALLBACK
@export var city_action_base_profiles: Dictionary = {}
@export var city_action_selected_overrides: Dictionary = {}
@export var left_rail_quick_link_profile: Resource
@export var left_rail_density_profile: Resource
@export var default_button_fallback_profile: Resource
@export var shell_layout_profile: Resource
@export var typography_profile: Resource
@export var copy_profile: Resource
@export var city_grid_profile: Resource
@export var backdrop_profile: Resource
@export var bottom_nav_profile: Resource
@export var task_icon_profile: Resource
@export var mail_button_icon_profile: Resource
@export var activity_button_icon_profile: Resource
@export var help_button_icon_profile: Resource
@export var jade_currency_icon_profile: Resource
@export var copper_currency_icon_profile: Resource
@export var troop_slot_base_profiles: Dictionary = {}
@export var troop_slot_disabled_overrides: Dictionary = {}
@export var troop_slot_enabled_idle_overrides: Dictionary = {}
@export var troop_slot_enabled_moving_overrides: Dictionary = {}
@export var troop_slot_shell_profile: Resource
@export var main_nav_button_shell_profile: Resource
@export var main_nav_button_selected_shell_profile: Resource
@export var main_nav_button_pressed_shell_profile: Resource
@export var utility_button_profile: Resource
@export var under_construction_enabled_profile: Resource
@export var under_construction_disabled_profile: Resource
@export var right_context_profile: Resource
@export var right_context_slot_profile: Resource
@export var center_stage_base_profile: Resource
@export var center_stage_world_override: Resource
@export var center_stage_focus_override: Resource

func normalize_profile_id(profile_id: String) -> String:
	var normalized := profile_id.strip_edges()
	if normalized == "":
		return fallback_profile_id.strip_edges() if fallback_profile_id.strip_edges() != "" else PROFILE_FALLBACK
	if normalized == fallback_profile_id:
		return normalized
	return fallback_profile_id.strip_edges() if fallback_profile_id.strip_edges() != "" else PROFILE_FALLBACK

func resolve_city_action_profile(profile_id: String, surface_role: String, is_selected: bool) -> Dictionary:
	normalize_profile_id(profile_id)
	var role_key := ACTION_SURFACE_ENTRY if surface_role == ACTION_SURFACE_ENTRY else ACTION_SURFACE_MAIN_NAV
	var resolved := _profile_resource_to_dictionary(_resolve_profile_resource_from_map(city_action_base_profiles, role_key))
	if is_selected:
		resolved = _merge_profile(resolved, _profile_resource_to_dictionary(_resolve_profile_resource_from_map(city_action_selected_overrides, role_key)))
	return resolved

func resolve_left_rail_quick_link_profile(profile_id: String) -> Dictionary:
	normalize_profile_id(profile_id)
	return _profile_resource_to_dictionary(left_rail_quick_link_profile)

func resolve_left_rail_density_profile(profile_id: String) -> Dictionary:
	normalize_profile_id(profile_id)
	return _profile_resource_to_dictionary(left_rail_density_profile)

func resolve_default_button_fallback_profile(profile_id: String) -> Dictionary:
	normalize_profile_id(profile_id)
	return _profile_resource_to_dictionary(default_button_fallback_profile)

func resolve_shell_layout_profile(profile_id: String) -> Dictionary:
	normalize_profile_id(profile_id)
	return _profile_resource_to_dictionary(shell_layout_profile)

func resolve_typography_profile(profile_id: String) -> Dictionary:
	normalize_profile_id(profile_id)
	return _profile_resource_to_dictionary(typography_profile)

func resolve_copy_profile(profile_id: String) -> Dictionary:
	normalize_profile_id(profile_id)
	return _profile_resource_to_dictionary(copy_profile)

func resolve_city_grid_profile(profile_id: String) -> Dictionary:
	normalize_profile_id(profile_id)
	return _profile_resource_to_dictionary(city_grid_profile)

func resolve_backdrop_profile(profile_id: String) -> Dictionary:
	normalize_profile_id(profile_id)
	return _profile_resource_to_dictionary(backdrop_profile)

func resolve_bottom_nav_profile(profile_id: String) -> Dictionary:
	normalize_profile_id(profile_id)
	return _profile_resource_to_dictionary(bottom_nav_profile)

func resolve_task_icon_profile(profile_id: String) -> Dictionary:
	normalize_profile_id(profile_id)
	return _profile_resource_to_dictionary(task_icon_profile)

func resolve_button_icon_profile(profile_id: String, slot_id: String) -> Dictionary:
	normalize_profile_id(profile_id)
	match slot_id:
		"mail":
			return _profile_resource_to_dictionary(mail_button_icon_profile)
		"activity":
			return _profile_resource_to_dictionary(activity_button_icon_profile)
		"help":
			return _profile_resource_to_dictionary(help_button_icon_profile)
		"jade":
			return _profile_resource_to_dictionary(jade_currency_icon_profile)
		"copper":
			return _profile_resource_to_dictionary(copper_currency_icon_profile)
		_:
			return {}

func resolve_troop_slot_profile(profile_id: String, archetype: String, is_disabled: bool, is_moving: bool) -> Dictionary:
	normalize_profile_id(profile_id)
	var resolved_archetype := _normalize_troop_archetype(archetype)
	var resolved := _profile_resource_to_dictionary(_resolve_profile_resource_from_map(troop_slot_base_profiles, resolved_archetype))
	if is_disabled:
		return _merge_profile(resolved, _profile_resource_to_dictionary(_resolve_profile_resource_from_map(troop_slot_disabled_overrides, resolved_archetype)))
	var state_profile_map := troop_slot_enabled_moving_overrides if is_moving else troop_slot_enabled_idle_overrides
	return _merge_profile(resolved, _profile_resource_to_dictionary(_resolve_profile_resource_from_map(state_profile_map, resolved_archetype)))

func resolve_troop_slot_shell_profile(profile_id: String) -> Dictionary:
	normalize_profile_id(profile_id)
	return _profile_resource_to_dictionary(troop_slot_shell_profile)

func resolve_main_nav_button_shell_profile(profile_id: String, is_selected: bool = false) -> Dictionary:
	normalize_profile_id(profile_id)
	if is_selected:
		var selected_profile := _profile_resource_to_dictionary(main_nav_button_selected_shell_profile)
		if not selected_profile.is_empty():
			return selected_profile
	return _profile_resource_to_dictionary(main_nav_button_shell_profile)

func resolve_main_nav_button_pressed_shell_profile(profile_id: String, is_selected: bool = false) -> Dictionary:
	normalize_profile_id(profile_id)
	var pressed_profile := _profile_resource_to_dictionary(main_nav_button_pressed_shell_profile)
	if not pressed_profile.is_empty():
		return pressed_profile
	return resolve_main_nav_button_shell_profile(profile_id, is_selected)

func resolve_utility_button_profile(profile_id: String) -> Dictionary:
	normalize_profile_id(profile_id)
	return _profile_resource_to_dictionary(utility_button_profile)

func resolve_under_construction_profile(profile_id: String, is_disabled: bool) -> Dictionary:
	normalize_profile_id(profile_id)
	return _profile_resource_to_dictionary(under_construction_disabled_profile if is_disabled else under_construction_enabled_profile)

func resolve_center_stage_profile(profile_id: String, is_world_mode: bool, has_non_default_focus: bool) -> Dictionary:
	normalize_profile_id(profile_id)
	var resolved := _profile_resource_to_dictionary(center_stage_base_profile)
	if is_world_mode:
		return _merge_profile(resolved, _profile_resource_to_dictionary(center_stage_world_override))
	if has_non_default_focus:
		return _merge_profile(resolved, _profile_resource_to_dictionary(center_stage_focus_override))
	return resolved

func resolve_right_context_profile(profile_id: String) -> Dictionary:
	normalize_profile_id(profile_id)
	return _profile_resource_to_dictionary(right_context_profile)

func resolve_right_context_slot_profile(profile_id: String) -> Dictionary:
	normalize_profile_id(profile_id)
	return _profile_resource_to_dictionary(right_context_slot_profile)

func _normalize_troop_archetype(archetype: String) -> String:
	match archetype:
		TROOP_ARCHETYPE_PRIMARY, TROOP_ARCHETYPE_MOBILE, TROOP_ARCHETYPE_RESERVE:
			return archetype
		_:
			return TROOP_ARCHETYPE_RESERVE

func _resolve_profile_resource_from_map(profile_map: Dictionary, key: String) -> Variant:
	if profile_map.has(key):
		return profile_map[key]
	return null

func _profile_resource_to_dictionary(profile_resource: Variant) -> Dictionary:
	if profile_resource == null:
		return {}
	if profile_resource is Dictionary:
		return (profile_resource as Dictionary).duplicate(true)
	if profile_resource is Resource and profile_resource.has_method("to_dictionary"):
		return profile_resource.call("to_dictionary")
	return {}

func _merge_profile(base_profile: Dictionary, overlay_profile: Dictionary) -> Dictionary:
	var merged := base_profile.duplicate(true)
	for key_variant in overlay_profile.keys():
		merged[key_variant] = overlay_profile[key_variant]
	return merged
