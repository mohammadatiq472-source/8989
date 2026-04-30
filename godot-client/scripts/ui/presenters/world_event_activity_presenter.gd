extends RefCounted
class_name WorldEventActivityPresenter

const TEMPLATE_FIXTURE_PATH := "res://data/ui/world_event_activity_template_fixture.json"
const MOBILE_LANDSCAPE_STACK_BREAKPOINT := 1024

func build_snapshot(runtime_context: Dictionary = {}) -> Dictionary:
	var fixture := _load_template_fixture()
	var shared_state := _build_shared_state(fixture, runtime_context)
	return {
		"title": "精彩活动 / 天下大势 / 任务 / 势力状态",
		"subtitle": "正式二级页模板：活动卡、赛季目标线、章节任务、势力状态。",
		"empty_state_text": "当前页暂无可显示内容。",
		"shared_state": shared_state,
		"default_page_id": "activities",
		"entry_configs": _build_entry_configs(fixture),
		"short_viewport_compact": true,
		"short_viewport_compact_height": 760,
		"tabs": [
			{"id": "activities", "label": "精彩活动"},
			{"id": "world_affairs", "label": "天下大势"},
			{"id": "tasks", "label": "任务"},
			{"id": "faction_status", "label": "势力状态"},
		],
		"sections": {
			"activities": _build_activities_section(fixture),
			"world_affairs": _build_world_affairs_section(fixture),
			"tasks": _build_tasks_section(fixture),
			"faction_status": _build_faction_status_section(fixture),
		},
	}

func _build_entry_configs(fixture: Dictionary) -> Dictionary:
	var fixture_configs := _fixture_dict(fixture, "entry_configs")
	var defaults := {
		"activities": {
			"page_id": "activities",
			"panel_title": "精彩活动",
			"panel_subtitle": "活动卡模板",
			"hide_tab_strip": true,
			"entry_panel_ids": ["activity"],
			"asset_slots": ["activity_login_reward", "activity_inherit", "activity_shop"],
		},
		"world_affairs": {
			"page_id": "world_affairs",
			"panel_title": "天下大势",
			"panel_subtitle": "赛季目标线模板",
			"hide_tab_strip": true,
			"entry_panel_ids": ["event", "world_event", "world_affairs"],
			"asset_slots": [
				"world_affairs_scene",
				"world_affairs_node_01",
				"world_affairs_node_02",
				"world_affairs_node_03",
				"world_affairs_node_04",
				"world_affairs_node_05",
				"world_affairs_node_06",
				"world_affairs_node_07",
				"world_affairs_node_08",
				"world_affairs_node_09",
				"world_affairs_node_10",
			],
		},
		"tasks": {
			"page_id": "tasks",
			"panel_title": "任务",
			"panel_subtitle": "章节任务模板",
			"hide_tab_strip": true,
			"entry_panel_ids": ["tasks"],
			"asset_slots": ["task_chapter_scene"],
		},
		"faction_status": {
			"page_id": "faction_status",
			"panel_title": "势力状态",
			"panel_subtitle": "领地动态模板",
			"hide_tab_strip": true,
			"entry_panel_ids": ["faction_status"],
			"asset_slots": [],
		},
	}
	for key in fixture_configs.keys():
		var raw_config: Variant = fixture_configs.get(key, null)
		if not (raw_config is Dictionary):
			continue
		var merged := {}
		if defaults.has(key):
			merged = (defaults[key] as Dictionary).duplicate(true)
		var config_dict := (raw_config as Dictionary).duplicate(true)
		for config_key in config_dict.keys():
			merged[config_key] = config_dict[config_key]
		defaults[key] = merged
	return defaults

func _with_content_first(panel_title: String, section: Dictionary) -> Dictionary:
	section["panel_title"] = panel_title
	section["content_first_mode"] = true
	section["hide_summary_chrome"] = true
	section["hide_shared_state"] = true
	section["hide_left_panel"] = true
	section["hide_detail_title"] = true
	section["player_reading_mode"] = true
	section["content_frame_transparent"] = false
	section["content_margins"] = [8, 8, 8, 8]
	section["body_margins"] = [44, 24, 44, 30]
	section["title_font_size"] = 34
	return section

func _build_shared_state(fixture: Dictionary, runtime_context: Dictionary) -> Dictionary:
	return {
		"season_label": _resolve_context_string(runtime_context, fixture, "season_label", "赛季 S1"),
		"season_phase": _resolve_context_string(runtime_context, fixture, "season_phase", "立业月"),
		"template_scope": _resolve_context_string(runtime_context, fixture, "template_scope", "正式二级页模板"),
		"activity_status": _resolve_context_string(runtime_context, fixture, "activity_status", "精彩活动模板"),
		"world_affairs_status": _resolve_context_string(runtime_context, fixture, "world_affairs_status", "天下大势模板"),
		"task_status": _resolve_context_string(runtime_context, fixture, "task_status", "章节任务模板"),
		"faction_status": _resolve_context_string(runtime_context, fixture, "faction_status", "势力状态模板"),
		"jade_currency_label": _resolve_context_string(runtime_context, fixture, "jade_currency_label", "玉符"),
		"resource_reward_label": _resolve_context_string(runtime_context, fixture, "resource_reward_label", "资源"),
		"authority_binding": _resolve_context_string(runtime_context, fixture, "authority_binding", "未接后端 authority"),
	}

func _build_activities_section(fixture: Dictionary) -> Dictionary:
	var page := _fixture_dict(fixture, "activities")
	var cards := _page_array(page, "cards", [])
	return _with_content_first("精彩活动", {
		"summary_title": "精彩活动",
		"shared_state_title": "活动模板状态",
		"shared_state_fields": [
			{"key": "activity_status", "label": "活动"},
			{"key": "jade_currency_label", "label": "主要奖励"},
			{"key": "authority_binding", "label": "authority"},
		],
		"summary_lines": _page_array(page, "summary_lines", [
			"精彩活动页展示活动卡片矩阵。",
			"当前奖励只是玉符占位，不写真实库存。",
		]),
		"list_title": "",
		"left_card_columns": 2,
		"mobile_stack": true,
		"mobile_stack_breakpoint": MOBILE_LANDSCAPE_STACK_BREAKPOINT,
		"item_cards": [],
		"detail_title": "",
		"content_blocks": [
			_build_feature_card_grid_block("精彩活动", cards, "ActivityFeatureGridBlock", 3, 1, "showcase"),
		],
	})

func _build_world_affairs_section(fixture: Dictionary) -> Dictionary:
	var page := _fixture_dict(fixture, "world_affairs")
	return _with_content_first("天下大势", {
		"summary_title": "天下大势",
		"shared_state_title": "天下大势状态",
		"shared_state_fields": [
			{"key": "season_label", "label": "赛季"},
			{"key": "season_phase", "label": "阶段"},
			{"key": "world_affairs_status", "label": "模板"},
			{"key": "jade_currency_label", "label": "奖励"},
		],
		"summary_lines": _page_array(page, "summary_lines", [
			"天下大势展示本月目标线和局势推进。",
			"当前不做国战规则。",
		]),
		"list_title": "",
		"left_card_columns": 3,
		"mobile_stack": true,
		"mobile_stack_breakpoint": MOBILE_LANDSCAPE_STACK_BREAKPOINT,
		"item_cards": [],
		"detail_title": "",
		"content_blocks": [
			_build_world_affairs_scene_block("天下", page, _page_array(page, "timeline", []), "WorldAffairsSceneBlock"),
		],
	})

func _build_tasks_section(fixture: Dictionary) -> Dictionary:
	var page := _fixture_dict(fixture, "tasks")
	var task_items := _page_array(page, "task_items", [])
	return _with_content_first("任务", {
		"summary_title": "任务",
		"shared_state_title": "任务模板状态",
		"shared_state_fields": [
			{"key": "task_status", "label": "任务"},
			{"key": "resource_reward_label", "label": "奖励"},
			{"key": "authority_binding", "label": "authority"},
		],
		"summary_lines": _page_array(page, "summary_lines", [
			"任务页展示第一章到第十一章。",
			"奖励以资源为主，不使用玉符。",
		]),
		"list_title": "",
		"left_card_columns": 1,
		"mobile_stack": true,
		"mobile_stack_breakpoint": MOBILE_LANDSCAPE_STACK_BREAKPOINT,
		"item_cards": [],
		"detail_title": "",
		"content_blocks": [
			_build_task_chapter_split_block("主要事宜", page, task_items, "TaskChapterSplitBlock"),
		],
	})

func _build_faction_status_section(fixture: Dictionary) -> Dictionary:
	var page := _fixture_dict(fixture, "faction_status")
	return _with_content_first("势力状态", {
		"summary_title": "势力状态",
		"shared_state_title": "势力模板状态",
		"shared_state_fields": [
			{"key": "faction_status", "label": "势力"},
			{"key": "template_scope", "label": "范围"},
			{"key": "authority_binding", "label": "authority"},
		],
		"summary_lines": _page_array(page, "summary_lines", [
			"势力状态只保留领地动态壳，等待后端回传 territories[] 再显示。",
			"当前不放假地图，不接坐标跳转。",
		]),
		"list_title": "",
		"left_card_columns": 2,
		"mobile_stack": true,
		"mobile_stack_breakpoint": MOBILE_LANDSCAPE_STACK_BREAKPOINT,
		"item_cards": [],
		"detail_title": "",
		"content_blocks": [
			_build_faction_status_split_block("领地状态入口", _page_array(page, "territories", []), {}, "FactionStatusSplitBlock", _fixture_dict(page, "data_contract")),
		],
	})

func _page_status_payload(page: Dictionary, fallback_headline: String, fallback_subtitle: String, fallback_state: String) -> Dictionary:
	return {
		"headline": _page_string(page, "headline", fallback_headline),
		"subtitle": _page_string(page, "subtitle", fallback_subtitle),
		"state": _page_string(page, "state", fallback_state),
		"facts": [
			{"label": "展示范围", "value": "二级页模板", "tone": "gold"},
			{"label": "真实规则", "value": "未接入", "tone": "neutral"},
			{"label": "奖励写入", "value": "未写入", "tone": "neutral"},
		],
	}

func _compact_cards(cards: Array, limit: int) -> Array:
	var result: Array = []
	for card_variant in cards.slice(0, mini(cards.size(), limit)):
		if not (card_variant is Dictionary):
			continue
		result.append((card_variant as Dictionary).duplicate(true))
	return result

func _build_feature_card_grid_block(title: String, cards: Array, node_name: String = "", columns: int = 3, featured_count: int = 1, layout: String = "") -> Dictionary:
	return {
		"kind": "feature_card_grid",
		"title": title,
		"cards": cards.duplicate(true),
		"columns": columns,
		"mobile_columns": 1,
		"featured_count": featured_count,
		"layout": layout,
		"node_name": node_name,
	}

func _build_timeline_block(title: String, items: Array, node_name: String = "") -> Dictionary:
	return {
		"kind": "timeline",
		"title": title,
		"items": items.duplicate(true),
		"node_name": node_name,
	}

func _build_world_affairs_scene_block(title: String, page: Dictionary, timeline: Array, node_name: String = "") -> Dictionary:
	return {
		"kind": "world_affairs_scene",
		"title": title,
		"headline": _page_string(page, "headline", "天下大势"),
		"scene_image_path": _page_string(page, "scene_image_path", ""),
		"subtitle": _page_string(page, "subtitle", "天下 / 局势先行，赛季后续扩展。"),
		"state": _page_string(page, "state", "模板目标线"),
		"timeline": timeline.duplicate(true),
		"node_name": node_name,
	}

func _build_territory_table_block(title: String, rows: Array, node_name: String = "") -> Dictionary:
	return {
		"kind": "territory_table",
		"title": title,
		"rows": rows.duplicate(true),
		"node_name": node_name,
	}

func _build_task_strip_list_block(title: String, items: Array, node_name: String = "") -> Dictionary:
	return {
		"kind": "task_strip_list",
		"title": title,
		"items": items.duplicate(true),
		"node_name": node_name,
	}

func _build_task_chapter_split_block(title: String, page: Dictionary, items: Array, node_name: String = "") -> Dictionary:
	var chapters := _page_array(page, "chapters", [])
	var chapter: Dictionary = {}
	if not chapters.is_empty() and chapters[0] is Dictionary:
		chapter = (chapters[0] as Dictionary).duplicate(true)
	return {
		"kind": "task_chapter_split",
		"title": title,
		"headline": _page_string(page, "headline", "任务"),
		"scene_image_path": _page_string(page, "scene_image_path", ""),
		"subtitle": _page_string(page, "subtitle", "从第一章到第十一章逐章推进。"),
		"state": _page_string(page, "state", "资源奖励模板"),
		"chapter": chapter,
		"items": items.duplicate(true),
		"node_name": node_name,
	}

func _build_faction_map_preview_block(title: String, payload: Dictionary, node_name: String = "") -> Dictionary:
	return {
		"kind": "faction_map_preview",
		"title": title,
		"payload": payload.duplicate(true),
		"node_name": node_name,
	}

func _build_faction_status_split_block(title: String, territories: Array, map_payload: Dictionary, node_name: String = "", empty_config: Dictionary = {}) -> Dictionary:
	return {
		"kind": "faction_status_split",
		"title": title,
		"territories": territories.duplicate(true),
		"map_payload": map_payload.duplicate(true),
		"empty_config": empty_config.duplicate(true),
		"node_name": node_name,
	}

func _build_status_hero_block(title: String, payload: Dictionary, node_name: String = "") -> Dictionary:
	return {
		"kind": "status_hero",
		"title": title,
		"payload": payload.duplicate(true),
		"node_name": node_name,
	}

func _build_card_grid_block(title: String, cards: Array, node_name: String = "", columns: int = 2) -> Dictionary:
	return {
		"kind": "card_grid",
		"title": title,
		"cards": cards.duplicate(true),
		"columns": columns,
		"mobile_columns": 1,
		"node_name": node_name,
	}

func _build_reading_list_block(title: String, items: Array, node_name: String = "") -> Dictionary:
	return {
		"kind": "reading_list",
		"title": title,
		"items": items.duplicate(true),
		"node_name": node_name,
	}

func _build_text_block(title: String, lines: Array, node_name: String = "") -> Dictionary:
	return {
		"kind": "text_block",
		"title": title,
		"lines": lines.duplicate(true),
		"node_name": node_name,
	}

func _build_button_row_block(title: String, actions: Array, node_name: String = "") -> Dictionary:
	return {
		"kind": "button_row",
		"title": title,
		"actions": actions.duplicate(true),
		"node_name": node_name,
	}

func _load_template_fixture() -> Dictionary:
	if not FileAccess.file_exists(TEMPLATE_FIXTURE_PATH):
		return {}
	var file := FileAccess.open(TEMPLATE_FIXTURE_PATH, FileAccess.READ)
	if file == null:
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if parsed is Dictionary:
		return parsed as Dictionary
	return {}

func _fixture_dict(fixture: Dictionary, key: String) -> Dictionary:
	var value: Variant = fixture.get(key, {})
	if value is Dictionary:
		return value as Dictionary
	return {}

func _page_string(page: Dictionary, key: String, fallback: String) -> String:
	var value := str(page.get(key, "")).strip_edges()
	return value if value != "" else fallback

func _page_array(page: Dictionary, key: String, fallback: Array) -> Array:
	var value: Variant = page.get(key, null)
	if value is Array:
		return (value as Array).duplicate(true)
	return fallback.duplicate(true)

func _fixture_string(fixture: Dictionary, key: String, fallback: String) -> String:
	var value := str(fixture.get(key, "")).strip_edges()
	return value if value != "" else fallback

func _resolve_context_string(runtime_context: Dictionary, fixture: Dictionary, key: String, fallback: String) -> String:
	var runtime_value := str(runtime_context.get(key, "")).strip_edges()
	if runtime_value != "":
		return runtime_value
	return _fixture_string(fixture, key, fallback)
