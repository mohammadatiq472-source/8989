extends RefCounted
class_name NativeShellPresenter

const DISPLAY_MODE_WORLD := "world"
const InternalAffairsPresenterScript = preload("res://scripts/ui/presenters/internal_affairs_presenter.gd")
const SHELL_FOCUS_GROUP_MARKET := "market"
const SHELL_FOCUS_GROUP_TAX := "tax"
const SHELL_FOCUS_GROUP_POLICY := "policy"
const SHELL_FOCUS_GROUP_DOMAIN_MAP := {
	SHELL_FOCUS_GROUP_MARKET: "市",
	SHELL_FOCUS_GROUP_TAX: "税",
	SHELL_FOCUS_GROUP_POLICY: "策",
}
const SHELL_FOCUS_BUILDING_MARKET_PLAZA := "market_plaza"
const SHELL_FOCUS_BUILDING_GRANARY := "granary"
const SHELL_FOCUS_BUILDING_WORKSHOP := "workshop"
const SHELL_FOCUS_BUILDING_TAX_OFFICE := "tax_office"
const SHELL_FOCUS_BUILDING_STORAGE_BUREAU := "storage_bureau"
const SHELL_FOCUS_BUILDING_RELAY_STATION := "relay_station"
const SHELL_FOCUS_BUILDING_POLICY_HALL := "policy_hall"
const SHELL_FOCUS_BUILDING_RECRUIT_POLICY_BOARD := "recruit_policy_board"
const SHELL_FOCUS_BUILDING_DEFENSE_BOARD := "defense_board"
const SHELL_FOCUS_BUILDING_DOMAIN_MAP := {
	SHELL_FOCUS_BUILDING_MARKET_PLAZA: "市",
	SHELL_FOCUS_BUILDING_GRANARY: "市",
	SHELL_FOCUS_BUILDING_WORKSHOP: "市",
	SHELL_FOCUS_BUILDING_TAX_OFFICE: "税",
	SHELL_FOCUS_BUILDING_STORAGE_BUREAU: "税",
	SHELL_FOCUS_BUILDING_RELAY_STATION: "税",
	SHELL_FOCUS_BUILDING_POLICY_HALL: "策",
	SHELL_FOCUS_BUILDING_RECRUIT_POLICY_BOARD: "策",
	SHELL_FOCUS_BUILDING_DEFENSE_BOARD: "策",
}
const SHELL_FOCUS_BUILDING_STATE_MAP := {
	SHELL_FOCUS_BUILDING_MARKET_PLAZA: "营",
	SHELL_FOCUS_BUILDING_GRANARY: "仓",
	SHELL_FOCUS_BUILDING_WORKSHOP: "工",
	SHELL_FOCUS_BUILDING_TAX_OFFICE: "征",
	SHELL_FOCUS_BUILDING_STORAGE_BUREAU: "储",
	SHELL_FOCUS_BUILDING_RELAY_STATION: "调",
	SHELL_FOCUS_BUILDING_POLICY_HALL: "演",
	SHELL_FOCUS_BUILDING_RECRUIT_POLICY_BOARD: "募",
	SHELL_FOCUS_BUILDING_DEFENSE_BOARD: "守",
}
const SHELL_FOCUS_LABEL_DOMAIN_MAP := {
	"市井": "市",
	"仓廪": "市",
	"作坊": "市",
	"田赋司": "税",
	"仓储司": "税",
	"转运站": "税",
	"政令台": "策",
	"募兵令": "策",
	"守备司": "策",
}
const SHELL_FOCUS_LABEL_STATE_MAP := {
	"市井": "营",
	"仓廪": "仓",
	"作坊": "工",
	"田赋司": "征",
	"仓储司": "储",
	"转运站": "调",
	"政令台": "演",
	"募兵令": "募",
	"守备司": "守",
}
const SHELL_QUEUE_AFFAIR_MARKET_UPGRADE := "queue_market_upgrade"
const SHELL_QUEUE_AFFAIR_TAX_UPGRADE := "queue_tax_upgrade"
const SHELL_QUEUE_AFFAIR_RECRUIT_BATCH := "queue_recruit_batch"
const SHELL_QUEUE_AFFAIR_DEFENSE_READY := "queue_defense_ready"
const SHELL_QUEUE_AFFAIR_AI_DISPATCH := "queue_ai_dispatch"
const SHELL_QUEUE_AFFAIR_POLICY_REVIEW := "queue_policy_review"
const SHELL_QUEUE_AFFAIR_DOMAIN_MAP := {
	SHELL_QUEUE_AFFAIR_MARKET_UPGRADE: "市",
	SHELL_QUEUE_AFFAIR_TAX_UPGRADE: "税",
	SHELL_QUEUE_AFFAIR_RECRUIT_BATCH: "募",
	SHELL_QUEUE_AFFAIR_DEFENSE_READY: "防",
	SHELL_QUEUE_AFFAIR_AI_DISPATCH: "托",
	SHELL_QUEUE_AFFAIR_POLICY_REVIEW: "策",
}
const SHELL_QUEUE_LABEL_DOMAIN_MAP := {
	"市井扩建": "市",
	"税务整编": "税",
	"募兵批次": "募",
	"城防整备": "防",
	"协同委任": "托",
	"政策复盘": "策",
}

var _world_data: Dictionary = {}
var _map_layout_data: Dictionary = {}
var _target_faction_id: String = ""

func configure(world_data: Dictionary, map_layout_data: Dictionary, target_faction_id: String) -> void:
	_world_data = world_data
	_map_layout_data = map_layout_data
	_target_faction_id = target_faction_id.strip_edges()

func build_payload(
	status_message: String,
	display_mode: String,
	active_city_action: String,
	runtime_context: Dictionary,
	troop_specs: Array
) -> Dictionary:
	return {
		"context_summary": _build_shell_context_summary(status_message, display_mode, runtime_context),
		"context_slots": _build_shell_context_slots(display_mode, runtime_context),
		"resource_summary": _build_resource_strip_summary(),
		"premium_currency_summary": _build_premium_currency_summary(),
		"city_overview": _build_city_overview_payload(active_city_action, runtime_context, troop_specs),
		"troop_summary": _build_shell_troop_summary(troop_specs),
		"troop_slots": _build_shell_troop_slots(troop_specs),
	}

func _build_shell_context_summary(status_message: String, display_mode: String, runtime_context: Dictionary) -> String:
	var world_data: Dictionary = _world_data
	var faction_label: String = _target_faction_id if _target_faction_id != "" else "none"
	return (
		"状态：%s\n视图：%s | 势力：%s | Tick：%s\n托管：%s / %s\n会话：%s | 最近动作：%s (%s)"
		% [
			status_message,
			"大地图" if display_mode == DISPLAY_MODE_WORLD else "主城",
			faction_label,
			_read_tick_label(world_data),
			str(runtime_context.get("autonomy_level", "unknown")),
			str(runtime_context.get("control_mode", "unknown")),
			str(runtime_context.get("session_id", "none")),
			str(runtime_context.get("last_action", "none")),
			str(runtime_context.get("last_action_status", "idle")),
		]
	)

func _build_shell_context_slots(display_mode: String, runtime_context: Dictionary) -> Array:
	var world_data: Dictionary = _world_data
	var is_world_mode := display_mode == DISPLAY_MODE_WORLD
	var faction_label: String = _target_faction_id if _target_faction_id != "" else "none"
	var autonomy_label := str(runtime_context.get("autonomy_level", "unknown"))
	var control_mode_label := str(runtime_context.get("control_mode", "unknown"))
	var session_label := str(runtime_context.get("session_id", "none"))
	return [
		{
			"id": "view",
			"label": "视图",
			"value": "世界" if is_world_mode else "主城",
			"tooltip": "当前主壳视图 | Tick %s | 事件 %s" % [
				str(int(world_data.get("tick", 0))),
				str(int(world_data.get("eventCount", 0))),
			],
		},
		{
			"id": "faction",
			"label": "势力",
			"value": faction_label,
			"tooltip": "当前操作势力 | 在线 %s/%s" % [
				str(int(runtime_context.get("online_seat_count", 0))),
				str(int(runtime_context.get("seat_count", 0))),
			],
		},
		{
			"id": "control",
			"label": "托管",
			"value": "%s/%s" % [autonomy_label, control_mode_label],
			"tooltip": "会话 %s | 最近动作 %s" % [
				session_label,
				str(runtime_context.get("last_action", "none")),
			],
		},
	]

func _build_resource_strip_summary() -> String:
	var faction_state: Dictionary = _read_target_faction_state()
	if faction_state.is_empty():
		return "木 -- | 铁 -- | 石 -- | 粮 --"
	return (
		"木 %s | 铁 %s | 石 %s | 粮 %s"
		% [
			str(int(faction_state.get("wood", 0))),
			str(int(faction_state.get("iron", 0))),
			str(int(faction_state.get("stone", 0))),
			str(int(faction_state.get("food", 0))),
		]
	)

func _build_premium_currency_summary() -> String:
	var faction_state: Dictionary = _read_target_faction_state()
	var jade_value := 0
	var copper_value := 0
	if not faction_state.is_empty():
		jade_value = int(faction_state.get("jade", 0))
		copper_value = int(faction_state.get("copper", faction_state.get("gold", 0)))
	return "玉符 %s | 铜钱 %s" % [str(jade_value), str(copper_value)]

func _build_city_overview_payload(active_city_action: String, runtime_context: Dictionary, troop_specs: Array) -> Dictionary:
	var faction_state: Dictionary = _read_target_faction_state()
	var hero_command: Dictionary = faction_state.get("heroCommand", {}) as Dictionary
	var home_tile_id: String = str(hero_command.get("homeTileId", ""))
	var captured_cities: Array = faction_state.get("capturedCities", []) as Array
	var captured_city_count: int = captured_cities.size()
	var development_points: int = int(hero_command.get("developmentPoints", 0))
	var city_clusters: Array = _read_city_clusters()
	var primary_cluster: Dictionary = _find_primary_city_cluster(city_clusters, home_tile_id)
	var capital_name: String = str(primary_cluster.get("name", ""))
	if capital_name == "":
		capital_name = _read_tile_name(home_tile_id)
	if capital_name == "":
		capital_name = "主城待识别"
	var seat_summary: String = "%s/%s" % [
		str(int(runtime_context.get("online_seat_count", 0))),
		str(int(runtime_context.get("seat_count", 0))),
	]
	var entry_copy: Dictionary = _build_city_entry_copy(active_city_action)
	var entry_label := str(entry_copy.get("label", "内政"))
	var interior_digest: Dictionary = _build_interior_shell_digest()
	var focus_line := str(interior_digest.get("focus_line", "")).strip_edges()
	var queue_line := str(interior_digest.get("queue_line", "")).strip_edges()
	var focus_tokens: Array = interior_digest.get("focus_tokens", []) as Array
	var queue_tokens: Array = interior_digest.get("queue_tokens", []) as Array
	var total_building_count := int(interior_digest.get("total_building_count", 0))
	var upgradeable_count := int(interior_digest.get("upgradeable_count", 0))
	var affairs_count := int(interior_digest.get("affairs_count", 0))
	var ready_affairs_count := int(interior_digest.get("ready_affairs_count", 0))
	var autonomy_label := str(runtime_context.get("autonomy_level", "unknown"))
	var control_mode_label := str(runtime_context.get("control_mode", "unknown"))
	var troop_digest := _build_troop_status_digest(troop_specs)
	var task_line := _build_shell_action_task_line(
		active_city_action,
		affairs_count,
		ready_affairs_count,
		upgradeable_count,
		captured_city_count,
		troop_digest,
		seat_summary,
		autonomy_label,
		control_mode_label,
		queue_tokens
	)
	var hint_segments: Array[String] = []
	if focus_line != "":
		hint_segments.append(focus_line)
	if queue_line != "":
		hint_segments.append(queue_line)
	var hint_suffix := str(interior_digest.get("hint_suffix", "")).strip_edges()
	if hint_suffix != "":
		hint_segments.append(hint_suffix)
	var readiness_line := str(interior_digest.get("readiness_line", "")).strip_edges()
	if readiness_line != "":
		hint_segments.append(readiness_line)
	var task_hint := "\n".join(hint_segments)
	var task_title := _resolve_shell_task_title(active_city_action)
	var city_state_title := _resolve_shell_state_title(active_city_action)
	var city_state_line := _build_shell_action_state_line(
		active_city_action,
		seat_summary,
		autonomy_label,
		control_mode_label,
		captured_city_count,
		troop_digest,
		queue_tokens
	)
	var tech_summary := _build_shell_action_metric_line(
		active_city_action,
		total_building_count,
		upgradeable_count,
		affairs_count,
		ready_affairs_count,
		captured_city_count,
		development_points,
		troop_digest,
		seat_summary,
		focus_tokens
	)
	return {
		"taskTitle": task_title,
		"taskBody": task_line,
		"taskHint": task_hint,
		"cityStateTitle": city_state_title,
		"cityStateSummary": city_state_line,
		"cityTechSummary": tech_summary,
		"cityFocus": _build_shell_action_focus_line(
			active_city_action,
			capital_name,
			captured_city_count,
			development_points,
			troop_digest,
			seat_summary,
			autonomy_label,
			control_mode_label
		),
		"activeCityAction": active_city_action,
		"entryStatus": "当前：%s" % entry_label,
	}

func _build_shell_troop_summary(troop_specs: Array) -> String:
	if troop_specs.is_empty():
		return "暂无可用部队。"
	var troop_digest := _build_troop_status_digest(troop_specs)
	var primary_count := mini(int(troop_digest.get("active_count", 0)), 2)
	var moving_count := int(troop_digest.get("moving_count", 0))
	var empty_count := int(troop_digest.get("empty_count", 0))
	return _format_shell_tokens([
		"主%s" % str(primary_count),
		"行%s" % str(moving_count),
		"空%s" % str(empty_count),
	])

func _build_shell_troop_slots(troop_specs: Array) -> Array:
	var slot_payloads: Array = []
	var slot_labels: Array[String] = ["一队", "二队", "三队", "四队", "五队"]
	for index in range(5):
		if index < troop_specs.size():
			var raw_spec: Variant = troop_specs[index]
			var spec: Dictionary = raw_spec as Dictionary if raw_spec is Dictionary else {}
			slot_payloads.append({
				"id": str(spec.get("id", "")),
				"label": str(spec.get("label", slot_labels[index])),
				"subtitle": str(spec.get("subtitle", "待命")),
				"heroName": str(spec.get("heroName", "")),
				"statusLabel": str(spec.get("statusLabel", "")),
				"statusText": str(spec.get("statusText", "")),
				"strength": int(spec.get("strength", 0)),
				"strengthMax": int(spec.get("strengthMax", 0)),
				"morale": int(spec.get("morale", 0)),
				"moraleMax": int(spec.get("moraleMax", 100)),
				"supply": int(spec.get("supply", 0)),
				"taskText": str(spec.get("taskText", "")),
				"description": str(spec.get("description", "等待部队编组。")),
				"enabled": true,
			})
			continue
		slot_payloads.append({
			"id": "",
			"label": slot_labels[index],
			"subtitle": "待补位",
			"heroName": "",
			"statusLabel": "空位",
			"statusText": "暂无编队",
			"strength": 0,
			"strengthMax": 10000,
			"morale": 0,
			"moraleMax": 100,
			"supply": 0,
			"taskText": "",
			"description": "当前势力尚未填满五部队总览位。",
			"enabled": false,
		})
	return slot_payloads

func _build_interior_shell_digest() -> Dictionary:
	var presenter = InternalAffairsPresenterScript.new()
	presenter.configure(_world_data, _map_layout_data, _target_faction_id)
	var snapshot: Dictionary = presenter.build_snapshot()
	var building_groups: Dictionary = snapshot.get("building_groups", {}) as Dictionary
	var affairs_queue: Array = snapshot.get("affairs_queue", []) as Array
	var focus_items: Array[String] = []
	var focus_tokens: Array[String] = []
	var total_building_count := 0
	var upgradeable_count := 0
	for group_id in [SHELL_FOCUS_GROUP_MARKET, SHELL_FOCUS_GROUP_TAX, SHELL_FOCUS_GROUP_POLICY]:
		var group: Dictionary = building_groups.get(group_id, {}) as Dictionary
		var tree_items: Array = group.get("treeItems", []) as Array
		if tree_items.is_empty():
			continue
		var lead_item: Dictionary = tree_items[0] as Dictionary
		var lead_item_id := str(lead_item.get("id", ""))
		var lead_label := str(lead_item.get("label", group_id))
		var lead_status := str(lead_item.get("statusText", "待命"))
		focus_items.append("%s（%s）" % [lead_label, lead_status])
		focus_tokens.append(_build_shell_focus_token(group_id, lead_item_id, lead_label, lead_status))
		for raw_item in tree_items:
			var item: Dictionary = raw_item as Dictionary
			total_building_count += 1
			if bool(item.get("enabled", false)):
				upgradeable_count += 1
	var queue_items: Array[String] = []
	var queue_tokens: Array[String] = []
	for index in range(mini(3, affairs_queue.size())):
		var affair: Dictionary = affairs_queue[index] as Dictionary
		var affair_id := str(affair.get("id", ""))
		var status_text := str(affair.get("statusText", "待处理"))
		var affair_label := str(affair.get("label", "政务"))
		queue_items.append("%s（%s）" % [affair_label, status_text])
		queue_tokens.append(_build_shell_queue_token(affair_id, affair_label, status_text))
	var remaining_ready_affairs := 0
	for raw_affair in affairs_queue:
		var affair: Dictionary = raw_affair as Dictionary
		var status_text := str(affair.get("statusText", ""))
		if status_text == "待处理" or status_text == "可入队" or status_text == "进行中":
			remaining_ready_affairs += 1
	var focus_line := ""
	if not focus_items.is_empty():
		focus_line = "内政焦点：%s" % " / ".join(focus_items)
	var queue_line := ""
	if not queue_items.is_empty():
		queue_line = "政务队列：%s" % " / ".join(queue_items)
	var hint_suffix := ""
	if not queue_items.is_empty():
		hint_suffix = "建议下一步：进入内政后优先处理 %s。" % str(queue_items[0]).replace("（", " ").replace("）", "")
	return {
		"focus_line": focus_line,
		"queue_line": queue_line,
		"focus_tokens": focus_tokens,
		"queue_tokens": queue_tokens,
		"total_building_count": total_building_count,
		"upgradeable_count": upgradeable_count,
		"affairs_count": affairs_queue.size(),
		"ready_affairs_count": remaining_ready_affairs,
		"readiness_line": "建筑 %s 项 | 可升级 %s | 政务 %s 项 | 可推进 %s" % [
			str(total_building_count),
			str(upgradeable_count),
			str(affairs_queue.size()),
			str(remaining_ready_affairs),
		],
		"hint_suffix": hint_suffix,
	}

func _build_troop_status_digest(troop_specs: Array) -> Dictionary:
	var active_count: int = mini(troop_specs.size(), 5)
	var moving_count: int = 0
	for index in range(active_count):
		var raw_spec: Variant = troop_specs[index]
		if not (raw_spec is Dictionary):
			continue
		var spec: Dictionary = raw_spec as Dictionary
		var status_text := str(spec.get("statusText", ""))
		if status_text.begins_with("行军"):
			moving_count += 1
	var standby_count: int = maxi(active_count - moving_count, 0)
	var empty_count: int = maxi(5 - active_count, 0)
	return {
		"active_count": active_count,
		"moving_count": moving_count,
		"standby_count": standby_count,
		"empty_count": empty_count,
	}

func _build_shell_action_task_line(
	active_city_action: String,
	affairs_count: int,
	ready_affairs_count: int,
	upgradeable_count: int,
	captured_city_count: int,
	troop_digest: Dictionary,
	seat_summary: String,
	autonomy_label: String,
	control_mode_label: String,
	queue_tokens: Array
) -> String:
	var active_troops := int(troop_digest.get("active_count", 0))
	var moving_troops := int(troop_digest.get("moving_count", 0))
	var standby_troops := int(troop_digest.get("standby_count", 0))
	var empty_troops := int(troop_digest.get("empty_count", 0))
	match active_city_action:
		"recruit":
			return _format_shell_tokens([
				"队%s" % str(active_troops),
				"待%s" % str(standby_troops),
				"空%s" % str(empty_troops),
			])
		"generals":
			return _format_shell_tokens([
				"队%s" % str(active_troops),
				"行%s" % str(moving_troops),
				"待%s" % str(standby_troops),
			])
		"alliance":
			return _format_shell_tokens([
				"座%s" % seat_summary,
				"城%s" % str(captured_city_count),
				"行%s" % str(moving_troops),
			])
		"ai_hub":
			return _format_shell_tokens([
				"托%s" % autonomy_label,
				"控%s" % control_mode_label,
				"队%s" % str(active_troops),
			])
		_:
			return _format_shell_tokens([
				"政%s" % str(affairs_count),
				"推%s" % str(ready_affairs_count),
				"首%s" % _resolve_shell_strip_token(queue_tokens, 0, "空队"),
			])

func _build_shell_action_focus_line(
	active_city_action: String,
	capital_name: String,
	captured_city_count: int,
	development_points: int,
	troop_digest: Dictionary,
	seat_summary: String,
	autonomy_label: String,
	control_mode_label: String
) -> String:
	var active_troops := int(troop_digest.get("active_count", 0))
	var moving_troops := int(troop_digest.get("moving_count", 0))
	match active_city_action:
		"recruit":
			return "招募焦点 | 主城 %s | 五队%s" % [capital_name, str(active_troops)]
		"generals":
			return "编组焦点 | 主城 %s | 行军%s" % [capital_name, str(moving_troops)]
		"alliance":
			return "同盟焦点 | 座%s | 城%s" % [seat_summary, str(captured_city_count)]
		"ai_hub":
			return "AI焦点 | 托%s | 控%s" % [autonomy_label, control_mode_label]
		_:
			return "主城 %s | 城%s | 开发%s" % [capital_name, str(captured_city_count), str(development_points)]

func _resolve_shell_task_title(active_city_action: String) -> String:
	match active_city_action:
		"recruit":
			return "募兵"
		"generals":
			return "编组"
		"alliance":
			return "协同"
		"ai_hub":
			return "托管"
		_:
			return "城务"

func _resolve_shell_state_title(active_city_action: String) -> String:
	match active_city_action:
		"recruit":
			return "补位"
		"generals":
			return "主力"
		"alliance":
			return "州势"
		"ai_hub":
			return "执行"
		_:
			return "队列"

func _build_shell_action_state_line(
	active_city_action: String,
	seat_summary: String,
	autonomy_label: String,
	control_mode_label: String,
	captured_city_count: int,
	troop_digest: Dictionary,
	queue_tokens: Array
) -> String:
	var moving_troops := int(troop_digest.get("moving_count", 0))
	var standby_troops := int(troop_digest.get("standby_count", 0))
	var empty_troops := int(troop_digest.get("empty_count", 0))
	match active_city_action:
		"recruit":
			return _format_shell_tokens([
				"城%s" % str(captured_city_count),
				"待%s" % str(standby_troops),
				"空%s" % str(empty_troops),
			])
		"generals":
			return _format_shell_tokens([
				"座%s" % seat_summary,
				"行%s" % str(moving_troops),
				"待%s" % str(standby_troops),
			])
		"alliance":
			return _format_shell_tokens([
				"座%s" % seat_summary,
				"城%s" % str(captured_city_count),
				"托%s" % autonomy_label,
			])
		"ai_hub":
			return _format_shell_tokens([
				"托%s" % autonomy_label,
				"控%s" % control_mode_label,
				"座%s" % seat_summary,
			])
		_:
			return _format_shell_tokens([
				_resolve_shell_strip_token(queue_tokens, 0, "空队"),
				_resolve_shell_strip_token(queue_tokens, 1, "待派"),
				_resolve_shell_strip_token(queue_tokens, 2, "待补"),
			])

func _build_shell_action_metric_line(
	active_city_action: String,
	total_building_count: int,
	upgradeable_count: int,
	affairs_count: int,
	ready_affairs_count: int,
	captured_city_count: int,
	development_points: int,
	troop_digest: Dictionary,
	seat_summary: String,
	focus_tokens: Array
) -> String:
	var active_troops := int(troop_digest.get("active_count", 0))
	var moving_troops := int(troop_digest.get("moving_count", 0))
	var standby_troops := int(troop_digest.get("standby_count", 0))
	var empty_troops := int(troop_digest.get("empty_count", 0))
	match active_city_action:
		"recruit":
			return _format_shell_tokens([
				"城%s" % str(captured_city_count),
				"开%s" % str(development_points),
				"补%s" % str(empty_troops),
			])
		"generals":
			return _format_shell_tokens([
				"队%s" % str(active_troops),
				"行%s" % str(moving_troops),
				"待%s" % str(standby_troops),
			])
		"alliance":
			return _format_shell_tokens([
				"行%s" % str(moving_troops),
				"开%s" % str(development_points),
				"座%s" % seat_summary,
			])
		"ai_hub":
			return _format_shell_tokens([
				"队%s" % str(active_troops),
				"行%s" % str(moving_troops),
				"座%s" % seat_summary,
			])
		_:
			return _format_shell_tokens([
				_resolve_shell_strip_token(focus_tokens, 0, "主城稳"),
				_resolve_shell_strip_token(focus_tokens, 1, "税务稳"),
				"升%s" % str(upgradeable_count),
			])

func _format_shell_tokens(parts: Array) -> String:
	var normalized: Array[String] = []
	for part_variant in parts:
		var token := str(part_variant).strip_edges()
		if token != "":
			normalized.append(token)
	var combined := ""
	for token in normalized:
		combined = token if combined == "" else "%s · %s" % [combined, token]
	return combined

func _resolve_shell_strip_token(tokens: Array, index: int, fallback: String) -> String:
	if index >= 0 and index < tokens.size():
		var token := str(tokens[index]).strip_edges()
		if token != "":
			return token
	return fallback

func _build_shell_focus_token(group_id: String, building_id: String, label: String, status_text: String) -> String:
	return "%s%s" % [
		_resolve_shell_focus_domain_token(group_id, building_id, label),
		_resolve_shell_focus_state_token(building_id, label, status_text),
	]

func _build_shell_queue_token(affair_id: String, label: String, status_text: String) -> String:
	return "%s%s" % [
		_resolve_shell_queue_domain_token(affair_id, label),
		_compact_shell_status_token(status_text, "待"),
	]

func _resolve_shell_focus_domain_token(group_id: String, building_id: String, label: String) -> String:
	var normalized_group := group_id.strip_edges()
	var normalized_building_id := building_id.strip_edges()
	var normalized_label := label.strip_edges()
	if normalized_building_id != "" and SHELL_FOCUS_BUILDING_DOMAIN_MAP.has(normalized_building_id):
		return str(SHELL_FOCUS_BUILDING_DOMAIN_MAP.get(normalized_building_id, "务"))
	if normalized_group != "" and SHELL_FOCUS_GROUP_DOMAIN_MAP.has(normalized_group):
		return str(SHELL_FOCUS_GROUP_DOMAIN_MAP.get(normalized_group, "务"))
	if normalized_label != "" and SHELL_FOCUS_LABEL_DOMAIN_MAP.has(normalized_label):
		return str(SHELL_FOCUS_LABEL_DOMAIN_MAP.get(normalized_label, "务"))
	return _resolve_shell_queue_domain_token("", label)

func _resolve_shell_focus_state_token(building_id: String, label: String, status_text: String) -> String:
	var normalized_building_id := building_id.strip_edges()
	var normalized_label := label.strip_edges()
	var normalized_status := status_text.strip_edges()
	if normalized_status.contains("不足") or normalized_status.contains("暂无"):
		return "待"
	if normalized_status.contains("可征收"):
		return "征"
	if normalized_status.contains("可推演"):
		return "演"
	if normalized_status.contains("可扩仓"):
		return "仓"
	if normalized_status.contains("经营中"):
		return "营"
	if normalized_building_id != "" and SHELL_FOCUS_BUILDING_STATE_MAP.has(normalized_building_id):
		return str(SHELL_FOCUS_BUILDING_STATE_MAP.get(normalized_building_id, "稳"))
	if normalized_label != "" and SHELL_FOCUS_LABEL_STATE_MAP.has(normalized_label):
		return str(SHELL_FOCUS_LABEL_STATE_MAP.get(normalized_label, "稳"))
	return _compact_shell_status_token(status_text, "稳")

func _resolve_shell_queue_domain_token(affair_id: String, label: String) -> String:
	var normalized_affair_id := affair_id.strip_edges()
	var normalized := label.strip_edges()
	if normalized_affair_id != "" and SHELL_QUEUE_AFFAIR_DOMAIN_MAP.has(normalized_affair_id):
		return str(SHELL_QUEUE_AFFAIR_DOMAIN_MAP.get(normalized_affair_id, "务"))
	if normalized == "":
		return "务"
	if SHELL_QUEUE_LABEL_DOMAIN_MAP.has(normalized):
		return str(SHELL_QUEUE_LABEL_DOMAIN_MAP.get(normalized, "务"))
	return "务"

func _compact_shell_status_token(status_text: String, fallback: String) -> String:
	var normalized := status_text.strip_edges()
	if normalized == "":
		return fallback
	if normalized.begins_with("可升级"):
		return "升"
	if normalized.begins_with("待处理"):
		return "待"
	if normalized.begins_with("可入队"):
		return "入"
	if normalized.begins_with("进行中"):
		return "行"
	if normalized.begins_with("已完成"):
		return "完"
	if normalized.begins_with("已满级"):
		return "满"
	if normalized.begins_with("待命"):
		return "待"
	if normalized.begins_with("稳定"):
		return "稳"
	if normalized.begins_with("驻守"):
		return "守"
	return normalized.substr(0, 1)

func _build_city_entry_copy(active_city_action: String) -> Dictionary:
	match active_city_action:
		"recruit":
			return {
				"label": "招募",
				"taskBody": "招募页先承接卡池、征兵和补位入口，确保主城底栏结构与原生 SLG 一致。",
				"taskHint": "先把招募做成原生入口占位，后续再接武将池与征兵链。",
				"description": "招募入口预留给卡池、征兵和新武将补位。",
			}
		"generals":
			return {
				"label": "武将",
				"taskBody": "武将页先承接 roster、编组和委任，后续再接真实阵容与队伍管理。",
				"taskHint": "武将入口不再埋入侧线文档，直接固定在主城底栏。",
				"description": "武将入口预留给 roster、委任和编组。",
			}
		"alliance":
			return {
				"label": "同盟",
				"taskBody": "同盟页保留联盟组织、国战协同和成员态势，后续接 AI 组织协作面板。",
				"taskHint": "同盟是原生 SLG 主线，不再让 preview story 替代正式结构。",
				"description": "同盟入口承接联盟组织、协同和国战关系。",
			}
		"ai_hub":
			return {
				"label": "AI",
				"taskBody": "AI 是第一阶段强入口，后续承接托管、议程、城市上下文和 AI 玩家观察位。",
				"taskHint": "先把 AI 固定在主壳层，再逐步接入真实 AI 面板能力。",
				"description": "AI 入口承接托管、议程和城市上下文助手。",
			}
		_:
			return {
				"label": "内政",
				"taskBody": "内政页先承接资源、城建、开发点和城池升级，作为主城默认焦点。",
				"taskHint": "主城首页默认先落内政焦点，再从同一壳层切到其他业务入口。",
				"description": "内政入口承接资源、城建和城市升级。",
			}

func _read_target_faction_state() -> Dictionary:
	var raw_factions: Variant = _world_data.get("factions", {})
	if raw_factions is Dictionary and _target_faction_id != "":
		var faction_state: Variant = (raw_factions as Dictionary).get(_target_faction_id, {})
		if faction_state is Dictionary:
			return faction_state
	return {}

func _read_city_clusters() -> Array:
	var layout_map: Dictionary = _map_layout_data.get("map", {}) as Dictionary
	var layout_overlays: Dictionary = layout_map.get("overlays", {}) as Dictionary
	var direct_layout_overlays: Dictionary = _map_layout_data.get("overlays", {}) as Dictionary
	var world_map: Dictionary = _world_data.get("map", {}) as Dictionary
	var world_overlays: Dictionary = world_map.get("overlays", {}) as Dictionary
	var candidates: Array = [
		layout_overlays.get("cityClusters", []),
		direct_layout_overlays.get("cityClusters", []),
		world_overlays.get("cityClusters", []),
	]
	for candidate in candidates:
		if candidate is Array and not (candidate as Array).is_empty():
			return candidate
	return []

func _find_primary_city_cluster(city_clusters: Array, home_tile_id: String) -> Dictionary:
	for item in city_clusters:
		var cluster: Dictionary = item as Dictionary
		if str(cluster.get("centerTileId", "")) == home_tile_id or str(cluster.get("cityHallTileId", "")) == home_tile_id:
			return cluster
		var tile_ids: Variant = cluster.get("tileIds", [])
		if tile_ids is Array and home_tile_id in (tile_ids as Array):
			return cluster
	for item in city_clusters:
		var cluster: Dictionary = item as Dictionary
		if str(cluster.get("owner", "")) == _target_faction_id:
			return cluster
	return {}

func _read_tile_name(tile_id: String) -> String:
	if tile_id == "":
		return ""
	var candidate_tile_lists: Array = [
		(_map_layout_data.get("map", {}) as Dictionary).get("tiles", []),
		_map_layout_data.get("tiles", []),
		(_world_data.get("map", {}) as Dictionary).get("tiles", []),
	]
	for candidate in candidate_tile_lists:
		if not (candidate is Array):
			continue
		for item in candidate:
			var tile: Dictionary = item as Dictionary
			if str(tile.get("id", "")) == tile_id:
				return str(tile.get("name", ""))
	return ""

func _read_tick_label(world_data: Dictionary) -> String:
	var tick_value: Variant = world_data.get("tick", null)
	if tick_value is int:
		return str(tick_value)
	if tick_value is float:
		return str(int(tick_value))
	return "unknown"
