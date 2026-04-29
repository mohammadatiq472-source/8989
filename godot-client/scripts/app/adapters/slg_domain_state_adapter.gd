extends RefCounted
class_name SlgDomainStateAdapter

func apply_remote_world(world_data: Dictionary) -> bool:
	if world_data.is_empty():
		return false
	WorldStore.set_world(world_data)
	return true

func promote_troop_facility_building(unit_id: String, facility_id: String, building_id: String) -> Dictionary:
	return WorldStore.promote_troop_facility_building(unit_id, facility_id, building_id)

func promote_city_building(city_id: String, group_id: String, building_id: String) -> Dictionary:
	return WorldStore.promote_city_building(city_id, group_id, building_id)

func enqueue_affair(city_id: String, affair_id: String) -> Dictionary:
	return WorldStore.enqueue_affair(city_id, affair_id)

func get_recruit_state(faction_id: String) -> Dictionary:
	return WorldStore.get_recruit_state(faction_id)

func set_recruit_state(faction_id: String, state: Dictionary) -> void:
	WorldStore.set_recruit_state(faction_id, state)

func get_general_state(faction_id: String) -> Dictionary:
	return WorldStore.get_general_state(faction_id)

func set_general_state(faction_id: String, state: Dictionary) -> void:
	WorldStore.set_general_state(faction_id, state)

func get_ai_state(faction_id: String) -> Dictionary:
	return WorldStore.get_ai_state(faction_id)

func get_resolved_ai_control_context(faction_id: String) -> Dictionary:
	return WorldStore.get_resolved_ai_control_context(faction_id)

func get_resolved_ai_execution(faction_id: String) -> Dictionary:
	return WorldStore.get_resolved_ai_execution(faction_id)

func get_ai_action_receipt(faction_id: String) -> Dictionary:
	return WorldStore.get_ai_action_receipt(faction_id)

func set_ai_state(faction_id: String, state: Dictionary) -> void:
	WorldStore.set_ai_state(faction_id, state)

func get_ai_agenda_preview(faction_id: String) -> Dictionary:
	return WorldStore.get_ai_agenda_preview(faction_id)

func get_resolved_ai_agenda(faction_id: String) -> Dictionary:
	return WorldStore.get_resolved_ai_agenda(faction_id)

func set_ai_agenda_preview(faction_id: String, preview: Dictionary) -> void:
	WorldStore.set_ai_agenda_preview(faction_id, preview)

func clear_ai_agenda_preview(faction_id: String) -> void:
	WorldStore.clear_ai_agenda_preview(faction_id)
