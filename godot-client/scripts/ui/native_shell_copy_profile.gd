extends Resource
class_name NativeShellCopyProfile

@export var default_context_summary: String = "等待 runtime 与 world 数据加载。"
@export var default_profile_badge_text: String = "主公"
@export var default_context_title_text: String = "城市上下文"
@export var default_context_slots: Array = []
@export var default_resource_summary: String = "木 -- | 铁 -- | 石 -- | 粮 --"
@export var default_mode_badge_city: String = "主城"
@export var default_mode_badge_world: String = "大地图"
@export var default_stage_title_city: String = "主城入口"
@export var default_stage_title_world: String = "十三州世界图"
@export var default_stage_body_city: String = "主城先稳定任务、队列和入口层级。"
@export var default_stage_body_world: String = "世界主视图先保留浏览、镜头和模式切换。"
@export var default_mode_hint_city: String = "当前继续压主壳层级，让地图回到主视区。"
@export var default_mode_hint_world: String = "当前仅保留世界浏览和模式切换。"
@export var default_world_entry_hint_city: String = "主线入口留底栏；战报/活动降为辅助。"
@export var default_world_entry_hint_world: String = "当前正在浏览大地图；可从右上返回主城。"
@export var default_mode_toggle_label_city: String = "大地图"
@export var default_mode_toggle_label_world: String = "回主城"
@export var default_city_task_title: String = "主城经营"
@export var default_city_task_body: String = "等待主城任务流加载。"
@export var default_city_task_hint: String = "保持主城壳层稳定，再向大地图递进。"
@export var default_city_state_title: String = "主城态势"
@export var default_city_state_summary: String = "等待主城业务数据加载。"
@export var default_city_tech_summary: String = "政 0 后 0 防 0 募 0"
@export var default_city_focus: String = "主城：等待识别 | 已占城池 0 | 开发点 0"
@export var default_entry_status: String = "当前：内政"
@export var default_troop_section_title: String = "五队"
@export var default_troop_summary: String = "等待 5 部队总览加载。"
@export var default_troop_slot_description: String = "等待部队编组。"
@export var currency_jade_label: String = "玉符"
@export var currency_copper_label: String = "铜钱"
@export var currency_tooltip_template: String = "{jade_label} {jade} | {copper_label} {copper}"
@export var current_entry_status_template: String = "当前：{label}"
@export var current_entry_tooltip_template: String = "当前入口：{label} | {description}"
@export var world_entry_selected_status_template: String = "已选：{label}"
@export var world_entry_selected_tooltip_template: String = "已选入口：{label}（开发中） | {description}"
@export var under_construction_tooltip_template: String = "开发中：{description}"
@export var interior_quick_link_tooltip_template: String = "直达内政/{label}"
@export var troop_slot_tooltip_template: String = "{label} | {role} | {state}"
@export var context_slot_line_template: String = "{label} | {value}"
@export var interior_tab_labels: Dictionary = {}
@export var city_action_copy: Dictionary = {}
@export var utility_action_copy: Dictionary = {}
@export var under_construction_copy: Dictionary = {}

func to_dictionary() -> Dictionary:
	return {
		"default_context_summary": default_context_summary,
		"default_profile_badge_text": default_profile_badge_text,
		"default_context_title_text": default_context_title_text,
		"default_context_slots": default_context_slots.duplicate(true),
		"default_resource_summary": default_resource_summary,
		"default_mode_badge_city": default_mode_badge_city,
		"default_mode_badge_world": default_mode_badge_world,
		"default_stage_title_city": default_stage_title_city,
		"default_stage_title_world": default_stage_title_world,
		"default_stage_body_city": default_stage_body_city,
		"default_stage_body_world": default_stage_body_world,
		"default_mode_hint_city": default_mode_hint_city,
		"default_mode_hint_world": default_mode_hint_world,
		"default_world_entry_hint_city": default_world_entry_hint_city,
		"default_world_entry_hint_world": default_world_entry_hint_world,
		"default_mode_toggle_label_city": default_mode_toggle_label_city,
		"default_mode_toggle_label_world": default_mode_toggle_label_world,
		"default_city_task_title": default_city_task_title,
		"default_city_task_body": default_city_task_body,
		"default_city_task_hint": default_city_task_hint,
		"default_city_state_title": default_city_state_title,
		"default_city_state_summary": default_city_state_summary,
		"default_city_tech_summary": default_city_tech_summary,
		"default_city_focus": default_city_focus,
		"default_entry_status": default_entry_status,
		"default_troop_section_title": default_troop_section_title,
		"default_troop_summary": default_troop_summary,
		"default_troop_slot_description": default_troop_slot_description,
		"currency_jade_label": currency_jade_label,
		"currency_copper_label": currency_copper_label,
		"currency_tooltip_template": currency_tooltip_template,
		"current_entry_status_template": current_entry_status_template,
		"current_entry_tooltip_template": current_entry_tooltip_template,
		"world_entry_selected_status_template": world_entry_selected_status_template,
		"world_entry_selected_tooltip_template": world_entry_selected_tooltip_template,
		"under_construction_tooltip_template": under_construction_tooltip_template,
		"interior_quick_link_tooltip_template": interior_quick_link_tooltip_template,
		"troop_slot_tooltip_template": troop_slot_tooltip_template,
		"context_slot_line_template": context_slot_line_template,
		"interior_tab_labels": interior_tab_labels.duplicate(true),
		"city_action_copy": city_action_copy.duplicate(true),
		"utility_action_copy": utility_action_copy.duplicate(true),
		"under_construction_copy": under_construction_copy.duplicate(true),
	}
