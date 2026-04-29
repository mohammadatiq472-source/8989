extends Node

signal world_updated(next_world: Dictionary)
signal map_layout_updated(next_map_layout: Dictionary)
signal slg_domain_state_updated(next_state: Dictionary)

var world: Dictionary = {}
var map_layout: Dictionary = {}
var slg_domain_state: Dictionary = {
	"version": 0,
	"troopFacilitiesByUnit": {},
	"cityBuildingGroupsByCity": {},
	"affairsQueueByCity": {},
	"recruitStateByFaction": {},
	"generalStateByFaction": {},
	"aiStateByFaction": {},
	"aiControlStateByFaction": {},
	"aiActionReceiptByFaction": {},
	"aiAgendaPreviewByFaction": {},
}

func set_world(next_world: Dictionary) -> void:
	world = next_world
	_sync_authoritative_slg_domain_state_from_world()
	_prune_stale_ai_agenda_previews()
	world_updated.emit(world)

func set_map_layout(next_map_layout: Dictionary) -> void:
	map_layout = next_map_layout
	map_layout_updated.emit(map_layout)

func sync_domain_snapshot(
	troop_facilities_by_unit: Dictionary,
	city_building_groups_by_city: Dictionary,
	affairs_queue_by_city: Dictionary
) -> void:
	slg_domain_state["troopFacilitiesByUnit"] = _merge_domain_map(
		slg_domain_state.get("troopFacilitiesByUnit", {}) as Dictionary,
		troop_facilities_by_unit
	)
	slg_domain_state["cityBuildingGroupsByCity"] = _merge_domain_map(
		slg_domain_state.get("cityBuildingGroupsByCity", {}) as Dictionary,
		city_building_groups_by_city
	)
	slg_domain_state["affairsQueueByCity"] = _merge_domain_map(
		slg_domain_state.get("affairsQueueByCity", {}) as Dictionary,
		affairs_queue_by_city
	)
	_touch_slg_domain_state()

func bootstrap_troop_facilities(unit_id: String, facility_entries: Array) -> void:
	var resolved_unit_id := unit_id.strip_edges()
	if resolved_unit_id == "":
		return
	var troop_state: Dictionary = slg_domain_state.get("troopFacilitiesByUnit", {}) as Dictionary
	if troop_state.has(resolved_unit_id):
		return
	troop_state[resolved_unit_id] = facility_entries.duplicate(true)
	slg_domain_state["troopFacilitiesByUnit"] = troop_state
	_sync_authoritative_slg_domain_state_from_world()

func get_troop_facilities(unit_id: String) -> Array:
	var resolved_unit_id := unit_id.strip_edges()
	if resolved_unit_id == "":
		return []
	var troop_state: Dictionary = slg_domain_state.get("troopFacilitiesByUnit", {}) as Dictionary
	var facility_entries: Variant = troop_state.get(resolved_unit_id, [])
	return facility_entries as Array if facility_entries is Array else []

func bootstrap_city_building_groups(city_id: String, building_groups: Dictionary) -> void:
	var resolved_city_id := city_id.strip_edges()
	if resolved_city_id == "":
		return
	var city_state: Dictionary = slg_domain_state.get("cityBuildingGroupsByCity", {}) as Dictionary
	if city_state.has(resolved_city_id):
		return
	city_state[resolved_city_id] = building_groups.duplicate(true)
	slg_domain_state["cityBuildingGroupsByCity"] = city_state

func get_city_building_groups(city_id: String) -> Dictionary:
	var resolved_city_id := city_id.strip_edges()
	if resolved_city_id == "":
		return {}
	var city_state: Dictionary = slg_domain_state.get("cityBuildingGroupsByCity", {}) as Dictionary
	var building_groups: Variant = city_state.get(resolved_city_id, {})
	return building_groups as Dictionary if building_groups is Dictionary else {}

func bootstrap_affairs_queue(city_id: String, queue_items: Array) -> void:
	var resolved_city_id := city_id.strip_edges()
	if resolved_city_id == "":
		return
	var queue_state: Dictionary = slg_domain_state.get("affairsQueueByCity", {}) as Dictionary
	if queue_state.has(resolved_city_id):
		return
	queue_state[resolved_city_id] = queue_items.duplicate(true)
	slg_domain_state["affairsQueueByCity"] = queue_state
	_sync_authoritative_slg_domain_state_from_world()

func get_affairs_queue(city_id: String) -> Array:
	var resolved_city_id := city_id.strip_edges()
	if resolved_city_id == "":
		return []
	var queue_state: Dictionary = slg_domain_state.get("affairsQueueByCity", {}) as Dictionary
	var queue_items: Variant = queue_state.get(resolved_city_id, [])
	return queue_items as Array if queue_items is Array else []

func bootstrap_recruit_state(faction_id: String, state: Dictionary) -> void:
	var resolved_faction_id := faction_id.strip_edges()
	if resolved_faction_id == "":
		return
	var recruit_state: Dictionary = slg_domain_state.get("recruitStateByFaction", {}) as Dictionary
	if recruit_state.has(resolved_faction_id):
		return
	recruit_state[resolved_faction_id] = state.duplicate(true)
	slg_domain_state["recruitStateByFaction"] = recruit_state

func get_recruit_state(faction_id: String) -> Dictionary:
	var resolved_faction_id := faction_id.strip_edges()
	if resolved_faction_id == "":
		return {}
	var recruit_state: Dictionary = slg_domain_state.get("recruitStateByFaction", {}) as Dictionary
	var state_variant: Variant = recruit_state.get(resolved_faction_id, {})
	return state_variant as Dictionary if state_variant is Dictionary else {}

func set_recruit_state(faction_id: String, state: Dictionary) -> void:
	var resolved_faction_id := faction_id.strip_edges()
	if resolved_faction_id == "":
		return
	var recruit_state: Dictionary = slg_domain_state.get("recruitStateByFaction", {}) as Dictionary
	recruit_state[resolved_faction_id] = state.duplicate(true)
	slg_domain_state["recruitStateByFaction"] = recruit_state
	_touch_slg_domain_state()

func bootstrap_general_state(faction_id: String, state: Dictionary) -> void:
	var resolved_faction_id := faction_id.strip_edges()
	if resolved_faction_id == "":
		return
	var general_state: Dictionary = slg_domain_state.get("generalStateByFaction", {}) as Dictionary
	if general_state.has(resolved_faction_id):
		return
	general_state[resolved_faction_id] = state.duplicate(true)
	slg_domain_state["generalStateByFaction"] = general_state

func get_general_state(faction_id: String) -> Dictionary:
	var resolved_faction_id := faction_id.strip_edges()
	if resolved_faction_id == "":
		return {}
	var general_state: Dictionary = slg_domain_state.get("generalStateByFaction", {}) as Dictionary
	var state_variant: Variant = general_state.get(resolved_faction_id, {})
	return state_variant as Dictionary if state_variant is Dictionary else {}

func set_general_state(faction_id: String, state: Dictionary) -> void:
	var resolved_faction_id := faction_id.strip_edges()
	if resolved_faction_id == "":
		return
	var general_state: Dictionary = slg_domain_state.get("generalStateByFaction", {}) as Dictionary
	general_state[resolved_faction_id] = state.duplicate(true)
	slg_domain_state["generalStateByFaction"] = general_state
	_touch_slg_domain_state()

func bootstrap_ai_state(faction_id: String, state: Dictionary) -> void:
	var resolved_faction_id := faction_id.strip_edges()
	if resolved_faction_id == "":
		return
	var ai_state: Dictionary = slg_domain_state.get("aiStateByFaction", {}) as Dictionary
	if ai_state.has(resolved_faction_id):
		return
	ai_state[resolved_faction_id] = state.duplicate(true)
	slg_domain_state["aiStateByFaction"] = ai_state

func get_ai_state(faction_id: String) -> Dictionary:
	var resolved_faction_id := faction_id.strip_edges()
	if resolved_faction_id == "":
		return {}
	var ai_state: Dictionary = slg_domain_state.get("aiStateByFaction", {}) as Dictionary
	var state_variant: Variant = ai_state.get(resolved_faction_id, {})
	return state_variant as Dictionary if state_variant is Dictionary else {}

func get_ai_control_state(faction_id: String) -> Dictionary:
	var resolved_faction_id := faction_id.strip_edges()
	if resolved_faction_id == "":
		return {}
	var control_state: Dictionary = slg_domain_state.get("aiControlStateByFaction", {}) as Dictionary
	var state_variant: Variant = control_state.get(resolved_faction_id, {})
	return state_variant as Dictionary if state_variant is Dictionary else {}

func get_resolved_ai_control_context(faction_id: String) -> Dictionary:
	var runtime_control_state := get_ai_control_state(faction_id)
	var ai_state := get_ai_state(faction_id)
	var autonomy_level := _read_first_non_empty_string([
		runtime_control_state.get("autonomyLevel", ""),
		ai_state.get("autonomyLevel", ""),
		"L2_delegated",
	])
	var control_mode := _read_first_non_empty_string([
		runtime_control_state.get("controlMode", ""),
		ai_state.get("controlMode", ""),
		"ai_delegated",
	])
	var authority_source := str(runtime_control_state.get("authoritySource", "")).strip_edges()
	if authority_source == "":
		if str(ai_state.get("autonomyLevel", "")).strip_edges() != "" or str(ai_state.get("controlMode", "")).strip_edges() != "":
			authority_source = "world_ai_state"
		else:
			authority_source = "fallback_default"
	var resolved := runtime_control_state.duplicate(true)
	resolved["autonomyLevel"] = autonomy_level
	resolved["controlMode"] = control_mode
	resolved["authoritySource"] = authority_source
	return resolved

func set_ai_control_state(faction_id: String, state: Dictionary) -> void:
	var resolved_faction_id := faction_id.strip_edges()
	if resolved_faction_id == "":
		return
	var control_state: Dictionary = slg_domain_state.get("aiControlStateByFaction", {}) as Dictionary
	var current_state: Dictionary = control_state.get(resolved_faction_id, {}) as Dictionary
	var next_state := state.duplicate(true)
	if current_state == next_state:
		return
	control_state[resolved_faction_id] = next_state
	slg_domain_state["aiControlStateByFaction"] = control_state
	_touch_slg_domain_state()

func set_ai_state(faction_id: String, state: Dictionary) -> void:
	var resolved_faction_id := faction_id.strip_edges()
	if resolved_faction_id == "":
		return
	var ai_state: Dictionary = slg_domain_state.get("aiStateByFaction", {}) as Dictionary
	ai_state[resolved_faction_id] = state.duplicate(true)
	slg_domain_state["aiStateByFaction"] = ai_state
	_touch_slg_domain_state()

func get_ai_action_receipt(faction_id: String) -> Dictionary:
	var resolved_faction_id := faction_id.strip_edges()
	if resolved_faction_id == "":
		return {}
	var receipt_state: Dictionary = slg_domain_state.get("aiActionReceiptByFaction", {}) as Dictionary
	var receipt_variant: Variant = receipt_state.get(resolved_faction_id, {})
	return receipt_variant as Dictionary if receipt_variant is Dictionary else {}

func set_ai_action_receipt(faction_id: String, receipt: Dictionary) -> void:
	var resolved_faction_id := faction_id.strip_edges()
	if resolved_faction_id == "":
		return
	var receipt_state: Dictionary = slg_domain_state.get("aiActionReceiptByFaction", {}) as Dictionary
	var current_receipt: Dictionary = receipt_state.get(resolved_faction_id, {}) as Dictionary
	var next_receipt := receipt.duplicate(true)
	if current_receipt == next_receipt:
		return
	receipt_state[resolved_faction_id] = next_receipt
	slg_domain_state["aiActionReceiptByFaction"] = receipt_state
	_touch_slg_domain_state()

func get_resolved_ai_execution(faction_id: String) -> Dictionary:
	var ai_state := get_ai_state(faction_id)
	var resolved_execution: Dictionary = {}
	var execution_variant: Variant = ai_state.get("execution", {})
	if execution_variant is Dictionary:
		resolved_execution = (execution_variant as Dictionary).duplicate(true)
	var action_receipt := get_ai_action_receipt(faction_id)
	if action_receipt.is_empty():
		return resolved_execution
	if str(action_receipt.get("request_id", "")).strip_edges() != "" and str(resolved_execution.get("requestId", "")).strip_edges() == "":
		resolved_execution["requestId"] = str(action_receipt.get("request_id", "")).strip_edges()
	if str(action_receipt.get("execution_status", "")).strip_edges() != "" and str(resolved_execution.get("status", "")).strip_edges() == "":
		resolved_execution["status"] = str(action_receipt.get("execution_status", "")).strip_edges()
	for key in ["activeOrderCount", "queuedOrderCount", "runningOrderCount", "actionPointsRemaining", "foodRemaining", "basedOnWorldVersion"]:
		if resolved_execution.has(key):
			continue
		var receipt_key := _resolve_receipt_execution_key(key)
		if receipt_key == "":
			continue
		if action_receipt.has(receipt_key):
			resolved_execution[key] = action_receipt.get(receipt_key, null)
	return resolved_execution

func get_ai_agenda_preview(faction_id: String) -> Dictionary:
	var resolved_faction_id := faction_id.strip_edges()
	if resolved_faction_id == "":
		return {}
	var preview_state: Dictionary = slg_domain_state.get("aiAgendaPreviewByFaction", {}) as Dictionary
	var preview_variant: Variant = preview_state.get(resolved_faction_id, {})
	return preview_variant as Dictionary if preview_variant is Dictionary else {}

func get_resolved_ai_agenda(faction_id: String) -> Dictionary:
	var preview := get_ai_agenda_preview(faction_id)
	if not preview.is_empty():
		var current_world_version := int(world.get("worldVersion", -1))
		if current_world_version < 0 or _read_ai_agenda_world_version(preview) == current_world_version:
			return preview
	var ai_state := get_ai_state(faction_id)
	var agenda_variant: Variant = ai_state.get("agenda", {})
	return agenda_variant as Dictionary if agenda_variant is Dictionary else {}

func set_ai_agenda_preview(faction_id: String, preview: Dictionary) -> void:
	var resolved_faction_id := faction_id.strip_edges()
	if resolved_faction_id == "":
		return
	var preview_state: Dictionary = slg_domain_state.get("aiAgendaPreviewByFaction", {}) as Dictionary
	preview_state[resolved_faction_id] = preview.duplicate(true)
	slg_domain_state["aiAgendaPreviewByFaction"] = preview_state
	_touch_slg_domain_state()

func clear_ai_agenda_preview(faction_id: String) -> void:
	var resolved_faction_id := faction_id.strip_edges()
	if resolved_faction_id == "":
		return
	var preview_state: Dictionary = slg_domain_state.get("aiAgendaPreviewByFaction", {}) as Dictionary
	if not preview_state.has(resolved_faction_id):
		return
	preview_state.erase(resolved_faction_id)
	slg_domain_state["aiAgendaPreviewByFaction"] = preview_state
	_touch_slg_domain_state()

func promote_troop_facility_building(unit_id: String, facility_id: String, building_id: String) -> Dictionary:
	var troop_state: Dictionary = slg_domain_state.get("troopFacilitiesByUnit", {}) as Dictionary
	var resolved_unit_id := unit_id.strip_edges()
	if resolved_unit_id == "" or not troop_state.has(resolved_unit_id):
		return {}
	var facility_entries_variant: Variant = troop_state.get(resolved_unit_id, [])
	if not (facility_entries_variant is Array):
		return {}
	var facility_entries: Array = (facility_entries_variant as Array).duplicate(true)
	var promoted_item: Dictionary = {}
	var promoted_level: int = 0
	for facility_index in range(facility_entries.size()):
		var facility_entry: Dictionary = facility_entries[facility_index] as Dictionary
		if str(facility_entry.get("id", "")).strip_edges() != facility_id.strip_edges():
			continue
		var tree_items_variant: Variant = facility_entry.get("treeItems", [])
		if not (tree_items_variant is Array):
			break
		var tree_items: Array = (tree_items_variant as Array).duplicate(true)
		for item_index in range(tree_items.size()):
			var tree_item: Dictionary = tree_items[item_index] as Dictionary
			if str(tree_item.get("id", "")).strip_edges() != building_id.strip_edges():
				continue
			var current_level: int = _read_level_text_start(tree_item)
			promoted_level = current_level + 1
			tree_item["levelText"] = "Lv.%s -> Lv.%s" % [str(promoted_level), str(promoted_level + 1)]
			tree_item["statusText"] = "已升级"
			tree_item["sheetSubtitle"] = "%s · 已提升" % str(tree_item.get("label", building_id))
			tree_item["sheetBody"] = "%s\n\n当前已写回共享状态，下一次刷新会沿用新的等级与状态。" % str(tree_item.get("sheetBody", tree_item.get("description", "等待说明加载。")))
			tree_item["effectSummary"] = _promote_effect_summary(str(tree_item.get("effectSummary", "")))
			tree_items[item_index] = tree_item
			promoted_item = tree_item
			break
		if promoted_item.is_empty():
			break
		facility_entry["treeItems"] = tree_items
		facility_entry["statusText"] = "Lv %s | 已提升" % str(promoted_level)
		facility_entry["sheetSubtitle"] = "%s · 已提升" % str(facility_entry.get("label", facility_id))
		facility_entry["sheetBody"] = "该设施已写回 Godot 侧共享状态，当前展示的是新的设施状态。"
		facility_entries[facility_index] = facility_entry
		break
	if promoted_item.is_empty():
		return {}
	troop_state[resolved_unit_id] = facility_entries
	slg_domain_state["troopFacilitiesByUnit"] = troop_state
	_touch_slg_domain_state()
	return promoted_item

func promote_city_building(city_id: String, group_id: String, building_id: String) -> Dictionary:
	var city_state: Dictionary = slg_domain_state.get("cityBuildingGroupsByCity", {}) as Dictionary
	var resolved_city_id := city_id.strip_edges()
	if resolved_city_id == "" or not city_state.has(resolved_city_id):
		return {}
	var building_groups_variant: Variant = city_state.get(resolved_city_id, {})
	if not (building_groups_variant is Dictionary):
		return {}
	var building_groups: Dictionary = (building_groups_variant as Dictionary).duplicate(true)
	if not building_groups.has(group_id):
		return {}
	var group_entry: Dictionary = building_groups.get(group_id, {}) as Dictionary
	var tree_items_variant: Variant = group_entry.get("treeItems", [])
	if not (tree_items_variant is Array):
		return {}
	var tree_items: Array = (tree_items_variant as Array).duplicate(true)
	var promoted_item: Dictionary = {}
	var promoted_level := 0
	for item_index in range(tree_items.size()):
		var tree_item: Dictionary = tree_items[item_index] as Dictionary
		if str(tree_item.get("id", "")).strip_edges() != building_id.strip_edges():
			continue
		var current_level: int = _read_level_text_start(tree_item)
		promoted_level = current_level + 1
		tree_item["levelText"] = "Lv.%s -> Lv.%s" % [str(promoted_level), str(promoted_level + 1)]
		tree_item["statusText"] = "已入城建序列"
		tree_item["sheetSubtitle"] = "%s · 城建已推进" % str(tree_item.get("label", building_id))
		tree_item["sheetBody"] = "%s\n\n该升级已写回主城共享状态，并加入内政治理的执行链。" % str(tree_item.get("sheetBody", tree_item.get("description", "等待说明加载。")))
		tree_item["effectSummary"] = _promote_effect_summary(str(tree_item.get("effectSummary", "")))
		tree_items[item_index] = tree_item
		promoted_item = tree_item
		break
	if promoted_item.is_empty():
		return {}
	group_entry["treeItems"] = tree_items
	building_groups[group_id] = group_entry
	city_state[resolved_city_id] = building_groups
	slg_domain_state["cityBuildingGroupsByCity"] = city_state
	var affair_id := _resolve_affair_queue_id_for_group(group_id)
	if affair_id != "":
		var queue_state: Dictionary = slg_domain_state.get("affairsQueueByCity", {}) as Dictionary
		var queue_items_variant: Variant = queue_state.get(resolved_city_id, [])
		if queue_items_variant is Array:
			var queue_items: Array = (queue_items_variant as Array).duplicate(true)
			var queue_note := "%s\n\n该建筑已写回共享状态并进入政务队列。" % str(promoted_item.get("sheetBody", promoted_item.get("description", "等待说明加载。")))
			var updated_queue_item := _update_affair_queue_item(queue_items, affair_id, "已入队", queue_note)
			if not updated_queue_item.is_empty():
				queue_state[resolved_city_id] = queue_items
				slg_domain_state["affairsQueueByCity"] = queue_state
	_touch_slg_domain_state()
	return promoted_item

func enqueue_affair(city_id: String, affair_id: String) -> Dictionary:
	var queue_state: Dictionary = slg_domain_state.get("affairsQueueByCity", {}) as Dictionary
	var resolved_city_id := city_id.strip_edges()
	if resolved_city_id == "" or not queue_state.has(resolved_city_id):
		return {}
	var queue_items_variant: Variant = queue_state.get(resolved_city_id, [])
	if not (queue_items_variant is Array):
		return {}
	var queue_items: Array = (queue_items_variant as Array).duplicate(true)
	var queued_item := _update_affair_queue_item(
		queue_items,
		affair_id,
		"已入队",
		"该政务项已进入 Godot 侧共享队列，后续可继续接正式执行链。"
	)
	if queued_item.is_empty():
		return {}
	queue_state[resolved_city_id] = queue_items
	slg_domain_state["affairsQueueByCity"] = queue_state
	_touch_slg_domain_state()
	return queued_item

func _merge_domain_map(existing_map: Dictionary, incoming_map: Dictionary) -> Dictionary:
	var merged := existing_map.duplicate(true)
	for key in incoming_map.keys():
		if merged.has(key):
			continue
		var value: Variant = incoming_map.get(key, null)
		if value is Dictionary:
			merged[key] = (value as Dictionary).duplicate(true)
		elif value is Array:
			merged[key] = (value as Array).duplicate(true)
		else:
			merged[key] = value
	return merged

func _read_first_non_empty_string(values: Array) -> String:
	for value in values:
		var text := str(value).strip_edges()
		if text != "":
			return text
	return ""

func _resolve_receipt_execution_key(execution_key: String) -> String:
	match execution_key:
		"activeOrderCount":
			return "active_order_count"
		"queuedOrderCount":
			return "queued_order_count"
		"runningOrderCount":
			return "running_order_count"
		"actionPointsRemaining":
			return "action_points_remaining"
		"foodRemaining":
			return "food_remaining"
		"basedOnWorldVersion":
			return "based_on_world_version"
		_:
			return ""

func _resolve_affair_queue_id_for_group(group_id: String) -> String:
	match group_id.strip_edges():
		"market":
			return "queue_market_upgrade"
		"tax":
			return "queue_tax_upgrade"
		"policy":
			return "queue_policy_review"
		_:
			return ""

func _update_affair_queue_item(queue_items: Array, affair_id: String, status_text: String, extra_note: String) -> Dictionary:
	for item_index in range(queue_items.size()):
		var queue_item: Dictionary = queue_items[item_index] as Dictionary
		if str(queue_item.get("id", "")).strip_edges() != affair_id.strip_edges():
			continue
		queue_item["statusText"] = status_text
		var original_description := str(queue_item.get("description", "等待政务说明。")).strip_edges()
		if extra_note.strip_edges() != "":
			if original_description == "":
				queue_item["description"] = extra_note
			else:
				queue_item["description"] = "%s\n\n%s" % [original_description, extra_note]
		queue_items[item_index] = queue_item
		return queue_item
	return {}

func _touch_slg_domain_state() -> void:
	var version := int(slg_domain_state.get("version", 0))
	slg_domain_state["version"] = version + 1
	slg_domain_state_updated.emit(slg_domain_state.duplicate(true))

func _read_ai_agenda_world_version(agenda: Dictionary) -> int:
	var updated_world_version := int(agenda.get("updatedWorldVersion", -1))
	if updated_world_version >= 0:
		return updated_world_version
	return int(agenda.get("generatedWorldVersion", -1))

func _prune_stale_ai_agenda_previews() -> void:
	var current_world_version := int(world.get("worldVersion", -1))
	if current_world_version < 0:
		return
	var preview_state: Dictionary = slg_domain_state.get("aiAgendaPreviewByFaction", {}) as Dictionary
	if preview_state.is_empty():
		return
	var next_preview_state: Dictionary = preview_state.duplicate(true)
	var changed := false
	for faction_id_variant in preview_state.keys():
		var faction_id := str(faction_id_variant)
		var preview_variant: Variant = preview_state.get(faction_id, {})
		if not (preview_variant is Dictionary):
			next_preview_state.erase(faction_id)
			changed = true
			continue
		var preview: Dictionary = preview_variant as Dictionary
		if _read_ai_agenda_world_version(preview) == current_world_version:
			continue
		next_preview_state.erase(faction_id)
		changed = true
	if not changed:
		return
	slg_domain_state["aiAgendaPreviewByFaction"] = next_preview_state
	_touch_slg_domain_state()

func _sync_authoritative_slg_domain_state_from_world() -> void:
	var domain_variant: Variant = world.get("slgDomainState", {})
	if not (domain_variant is Dictionary):
		return
	var domain_state: Dictionary = domain_variant as Dictionary
	var changed := false
	changed = _apply_authoritative_troop_facilities(domain_state.get("troopFacilitiesByUnit", {})) or changed
	changed = _apply_authoritative_city_buildings(domain_state.get("cityBuildingGroupsByCity", {})) or changed
	changed = _apply_authoritative_affairs_queue(domain_state.get("affairsQueueByCity", {})) or changed
	changed = _apply_authoritative_simple_map("recruitStateByFaction", domain_state.get("recruitStateByFaction", {})) or changed
	changed = _apply_authoritative_simple_map("generalStateByFaction", domain_state.get("generalStateByFaction", {})) or changed
	changed = _apply_authoritative_simple_map("aiStateByFaction", domain_state.get("aiStateByFaction", {})) or changed
	if changed:
		_touch_slg_domain_state()

func _apply_authoritative_troop_facilities(authoritative_variant: Variant) -> bool:
	if not (authoritative_variant is Dictionary):
		return false
	var troop_state: Dictionary = slg_domain_state.get("troopFacilitiesByUnit", {}) as Dictionary
	var changed := false
	for unit_id_variant in (authoritative_variant as Dictionary).keys():
		var unit_id := str(unit_id_variant)
		if not troop_state.has(unit_id):
			continue
		var facility_entries_variant: Variant = troop_state.get(unit_id, [])
		var unit_authoritative_variant: Variant = (authoritative_variant as Dictionary).get(unit_id, {})
		if not (facility_entries_variant is Array) or not (unit_authoritative_variant is Dictionary):
			continue
		var facility_entries: Array = (facility_entries_variant as Array).duplicate(true)
		var unit_authoritative: Dictionary = unit_authoritative_variant as Dictionary
		var unit_changed := false
		for facility_index in range(facility_entries.size()):
			var facility_entry: Dictionary = facility_entries[facility_index] as Dictionary
			var facility_id := str(facility_entry.get("id", "")).strip_edges()
			if facility_id == "" or not unit_authoritative.has(facility_id):
				continue
			var tree_items_variant: Variant = facility_entry.get("treeItems", [])
			var facility_authoritative_variant: Variant = unit_authoritative.get(facility_id, {})
			if not (tree_items_variant is Array) or not (facility_authoritative_variant is Dictionary):
				continue
			var tree_items: Array = (tree_items_variant as Array).duplicate(true)
			var facility_authoritative: Dictionary = facility_authoritative_variant as Dictionary
			var highest_level := 0
			var facility_changed := false
			for item_index in range(tree_items.size()):
				var tree_item: Dictionary = tree_items[item_index] as Dictionary
				var building_id := str(tree_item.get("id", "")).strip_edges()
				if building_id == "" or not facility_authoritative.has(building_id):
					continue
				var building_state_variant: Variant = facility_authoritative.get(building_id, {})
				if not (building_state_variant is Dictionary):
					continue
				var building_state: Dictionary = building_state_variant as Dictionary
				var level := maxi(1, int(building_state.get("level", _read_level_text_start(tree_item))))
				tree_item["levelText"] = "Lv.%s -> Lv.%s" % [str(level), str(level + 1)]
				tree_item["statusText"] = str(building_state.get("statusText", "已同步升级"))
				var description := str(building_state.get("description", "")).strip_edges()
				if description != "":
					tree_item["description"] = description
					tree_item["sheetBody"] = description
				tree_items[item_index] = tree_item
				highest_level = maxi(highest_level, level)
				facility_changed = true
			if not facility_changed:
				continue
			facility_entry["treeItems"] = tree_items
			facility_entry["statusText"] = "Lv %s | 已同步" % str(maxi(1, highest_level))
			facility_entries[facility_index] = facility_entry
			unit_changed = true
		if not unit_changed:
			continue
		troop_state[unit_id] = facility_entries
		changed = true
	if changed:
		slg_domain_state["troopFacilitiesByUnit"] = troop_state
	return changed

func _apply_authoritative_city_buildings(authoritative_variant: Variant) -> bool:
	if not (authoritative_variant is Dictionary):
		return false
	var city_state: Dictionary = slg_domain_state.get("cityBuildingGroupsByCity", {}) as Dictionary
	var changed := false
	for city_id_variant in (authoritative_variant as Dictionary).keys():
		var city_id := str(city_id_variant)
		if not city_state.has(city_id):
			continue
		var local_groups_variant: Variant = city_state.get(city_id, {})
		var authoritative_groups_variant: Variant = (authoritative_variant as Dictionary).get(city_id, {})
		if not (local_groups_variant is Dictionary) or not (authoritative_groups_variant is Dictionary):
			continue
		var local_groups: Dictionary = (local_groups_variant as Dictionary).duplicate(true)
		var authoritative_groups: Dictionary = authoritative_groups_variant as Dictionary
		var city_changed := false
		for group_id_variant in authoritative_groups.keys():
			var group_id := str(group_id_variant)
			if not local_groups.has(group_id):
				continue
			var group_entry: Dictionary = local_groups.get(group_id, {}) as Dictionary
			var tree_items_variant: Variant = group_entry.get("treeItems", [])
			var group_authoritative_variant: Variant = authoritative_groups.get(group_id, {})
			if not (tree_items_variant is Array) or not (group_authoritative_variant is Dictionary):
				continue
			var tree_items: Array = (tree_items_variant as Array).duplicate(true)
			var group_authoritative: Dictionary = group_authoritative_variant as Dictionary
			var group_changed := false
			for item_index in range(tree_items.size()):
				var tree_item: Dictionary = tree_items[item_index] as Dictionary
				var building_id := str(tree_item.get("id", "")).strip_edges()
				if building_id == "" or not group_authoritative.has(building_id):
					continue
				var building_state_variant: Variant = group_authoritative.get(building_id, {})
				if not (building_state_variant is Dictionary):
					continue
				var building_state: Dictionary = building_state_variant as Dictionary
				var level := maxi(1, int(building_state.get("level", _read_level_text_start(tree_item))))
				tree_item["levelText"] = "Lv.%s -> Lv.%s" % [str(level), str(level + 1)]
				tree_item["statusText"] = str(building_state.get("statusText", "已同步升级"))
				var description := str(building_state.get("description", "")).strip_edges()
				if description != "":
					tree_item["description"] = description
					tree_item["sheetBody"] = description
				tree_items[item_index] = tree_item
				group_changed = true
			if not group_changed:
				continue
			group_entry["treeItems"] = tree_items
			local_groups[group_id] = group_entry
			city_changed = true
		if not city_changed:
			continue
		city_state[city_id] = local_groups
		changed = true
	if changed:
		slg_domain_state["cityBuildingGroupsByCity"] = city_state
	return changed

func _apply_authoritative_simple_map(slot_key: String, authoritative_variant: Variant) -> bool:
	if not (authoritative_variant is Dictionary):
		return false
	var next_state := (authoritative_variant as Dictionary).duplicate(true)
	var current_state: Dictionary = slg_domain_state.get(slot_key, {}) as Dictionary
	if current_state == next_state:
		return false
	slg_domain_state[slot_key] = next_state
	return true

func _apply_authoritative_affairs_queue(authoritative_variant: Variant) -> bool:
	if not (authoritative_variant is Dictionary):
		return false
	var queue_state: Dictionary = slg_domain_state.get("affairsQueueByCity", {}) as Dictionary
	var changed := false
	for city_id_variant in (authoritative_variant as Dictionary).keys():
		var city_id := str(city_id_variant)
		if not queue_state.has(city_id):
			continue
		var queue_items_variant: Variant = queue_state.get(city_id, [])
		var authoritative_items_variant: Variant = (authoritative_variant as Dictionary).get(city_id, [])
		if not (queue_items_variant is Array) or not (authoritative_items_variant is Array):
			continue
		var queue_items: Array = (queue_items_variant as Array).duplicate(true)
		var authoritative_items: Array = authoritative_items_variant as Array
		var city_changed := false
		for item_index in range(queue_items.size()):
			var queue_item: Dictionary = queue_items[item_index] as Dictionary
			var affair_id := str(queue_item.get("id", "")).strip_edges()
			if affair_id == "":
				continue
			for authoritative_item_variant in authoritative_items:
				if not (authoritative_item_variant is Dictionary):
					continue
				var authoritative_item: Dictionary = authoritative_item_variant as Dictionary
				if str(authoritative_item.get("id", "")).strip_edges() != affair_id:
					continue
				queue_item["statusText"] = str(authoritative_item.get("statusText", queue_item.get("statusText", "已入队")))
				var description := str(authoritative_item.get("description", "")).strip_edges()
				if description != "":
					queue_item["description"] = description
				queue_items[item_index] = queue_item
				city_changed = true
				break
		if not city_changed:
			continue
		queue_state[city_id] = queue_items
		changed = true
	if changed:
		slg_domain_state["affairsQueueByCity"] = queue_state
	return changed

func _read_level_text_start(item: Dictionary) -> int:
	var level_text := str(item.get("levelText", "")).strip_edges()
	if not level_text.begins_with("Lv."):
		return 1
	var normalized := level_text.replace("Lv.", "")
	var parts := normalized.split("->")
	if parts.is_empty():
		return 1
	return maxi(1, int(parts[0].strip_edges()))

func _promote_effect_summary(effect_summary: String) -> String:
	var trimmed := effect_summary.strip_edges()
	if trimmed == "":
		return "效果：已提升"
	if trimmed.ends_with("+1"):
		return trimmed.trim_suffix("+1") + "+2"
	return trimmed + " | 已提升"
