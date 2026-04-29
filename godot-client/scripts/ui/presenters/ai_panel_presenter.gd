extends RefCounted
class_name AIPanelPresenter

var _world_data: Dictionary = {}
var _map_layout_data: Dictionary = {}
var _target_faction_id: String = ""

const AI_CHAT_PORTRAIT_MANIFEST := "res://data/ai_chat_portraits.json"

func configure(world_data: Dictionary, map_layout_data: Dictionary, target_faction_id: String) -> void:
	_world_data = world_data
	_map_layout_data = map_layout_data
	_target_faction_id = target_faction_id.strip_edges()

func build_snapshot(runtime_context: Dictionary) -> Dictionary:
	var faction_state := _read_target_faction_state()
	var hero_command: Dictionary = faction_state.get("heroCommand", {}) as Dictionary
	var ai_players: Array = faction_state.get("aiPlayers", []) as Array
	var captured_cities: Array = faction_state.get("capturedCities", []) as Array
	var ai_state := WorldStore.get_ai_state(_target_faction_id)
	var control_context := WorldStore.get_resolved_ai_control_context(_target_faction_id)
	var autonomy_level := str(control_context.get("autonomyLevel", "L2_delegated")).strip_edges()
	var control_mode := str(control_context.get("controlMode", "ai_delegated")).strip_edges()
	var control_authority_source := str(control_context.get("authoritySource", "unknown")).strip_edges()
	var context_focus_id := str(ai_state.get("contextFocusId", "focus_city"))
	var agenda: Dictionary = WorldStore.get_resolved_ai_agenda(_target_faction_id)
	var agenda_options: Array = _resolve_agenda_options(agenda)
	var execution_state := WorldStore.get_resolved_ai_execution(_target_faction_id)
	var action_receipt := WorldStore.get_ai_action_receipt(_target_faction_id)
	var ai_player_runtimes: Array = ai_state.get("playerRuntimeList", []) as Array
	var ai_player_receipt_items: Array = ai_state.get("playerRuntimeReceiptItems", []) as Array
	var ai_player_proposal_items: Array = ai_state.get("playerRuntimeProposalItems", []) as Array
	var ai_player_action_catalog: Array = ai_state.get("playerRuntimeActionCatalog", []) as Array
	var ai_player_development_plan: Dictionary = ai_state.get("playerRuntimeDevelopmentPlan", {}) as Dictionary
	var ai_player_battle_report_items: Array = ai_state.get("playerRuntimeBattleReportItems", []) as Array
	var ai_player_battle_report_read_model: Dictionary = ai_state.get("playerRuntimeBattleReportReadModel", {}) as Dictionary
	var primary_ai_player_id := str(ai_state.get("playerRuntimePrimaryAiPlayerId", "")).strip_edges()
	var primary_ai_player_display_name := _resolve_primary_ai_player_display_name(ai_player_runtimes, primary_ai_player_id)
	var ai_player_runtime_updated_at := str(ai_state.get("playerRuntimeUpdatedAt", "")).strip_edges()
	if ai_player_runtime_updated_at == "":
		ai_player_runtime_updated_at = "尚未刷新"
	var ai_player_runtime_error := str(ai_state.get("playerRuntimeLastError", "")).strip_edges()
	var ai_context_document_count := _count_ai_context_documents(ai_player_runtimes)
	var ai_context_document_summary := _format_ai_context_document_summary(ai_player_runtimes)
	var ai_resource_accounts: Dictionary = faction_state.get("aiResourceAccounts", {}) as Dictionary
	var governor_resource_inboxes: Dictionary = faction_state.get("governorResourceInboxes", {}) as Dictionary
	var ai_resource_account_count := ai_resource_accounts.size()
	var governor_pending_transfer_count := _count_pending_governor_transfers(governor_resource_inboxes)
	var ai_latest_receipt_summary := _format_ai_player_latest_receipt(ai_player_runtimes, ai_player_receipt_items)
	var ai_latest_proposal_summary := _format_ai_player_latest_proposal(ai_player_proposal_items)
	var ai_actionable_proposal_count := _count_actionable_ai_proposals(ai_player_proposal_items)
	var ai_model_summary := _format_ai_player_model_summary(ai_player_runtimes)
	var ai_model_access_summary := _format_ai_player_model_access_summary(ai_player_runtimes)
	var ai_key_status := _format_ai_player_key_status(ai_player_runtimes)
	autonomy_level = _resolve_autonomy_display_level(autonomy_level, ai_player_runtimes, control_authority_source)
	var ai_failure_summary := _format_ai_player_failure_summary(ai_player_runtimes, ai_player_proposal_items, ai_player_receipt_items, ai_player_runtime_error)
	var ai_resource_summary := _format_ai_resource_accounts_summary(ai_resource_accounts)
	var governor_inbox_summary := _format_governor_inbox_summary(governor_resource_inboxes)
	var ai_development_goal_summary := _format_ai_development_goal_summary(ai_player_development_plan)
	var ai_development_risk_summary := _format_ai_development_risk_summary(ai_player_development_plan)
	var ai_development_ready_action_count := _count_ai_development_ready_actions(ai_player_development_plan)
	var ai_battle_report_summary := _format_ai_battle_report_summary(ai_player_battle_report_items)
	var ai_battle_report_damage_summary := _format_ai_battle_report_damage_summary(ai_player_battle_report_items)
	var ai_battle_report_suggestion := _format_ai_battle_report_suggestion(ai_player_battle_report_items)
	var ai_battle_report_next_action := _resolve_ai_battle_report_next_action(ai_player_battle_report_items)
	var ai_portrait_assignments := _load_ai_chat_portrait_assignments()
	var context_memory_summary: Dictionary = ai_state.get("contextMemorySummary", {}) as Dictionary
	var context_memory_lines: Array = context_memory_summary.get("lines", []) as Array
	var context_related_id := str(context_memory_summary.get("relatedId", ""))
	var context_related_label := _format_context_related_id(context_focus_id, context_related_id)
	var development_points := int(hero_command.get("developmentPoints", 0))
	var home_tile_id := str(hero_command.get("homeTileId", ""))
	var current_agenda_target_unit_id := _resolve_primary_agenda_target_unit_id(agenda)
	var runtime_receipt_lines := _build_runtime_receipt_lines(runtime_context)
	var ai_chat_history_snapshot: Dictionary = runtime_context.get("ai_chat_history_snapshot", {}) as Dictionary
	var context_focus_label := _focus_label(context_focus_id)
	var home_tile_label := home_tile_id if home_tile_id != "" else "未定位"
	var agenda_source_label := str(agenda.get("source", "domain")).strip_edges()
	if agenda_source_label == "":
		agenda_source_label = "domain"
	var agenda_summary := str(agenda.get("summary", "尚未刷新议程。")).strip_edges()
	if agenda_summary == "":
		agenda_summary = "尚未刷新议程。"
	var current_agenda_target_unit_label := current_agenda_target_unit_id if current_agenda_target_unit_id != "" else "未定位"
	var execution_status := _resolve_execution_status(execution_state, action_receipt)
	var execution_request_id := _resolve_execution_request_id(agenda, execution_state, action_receipt)
	var execution_queue_summary := _format_execution_queue_summary(execution_state)
	var execution_budget_summary := _format_execution_budget_summary(execution_state)
	var last_failure_code := _resolve_failure_code(action_receipt)
	var last_receipt_message := _resolve_receipt_message(action_receipt)
	var context_memory_headline := str(context_memory_lines[0] if not context_memory_lines.is_empty() else "尚未查询").strip_edges()
	if context_memory_headline == "":
		context_memory_headline = "尚未查询"
	var ai_player_model_name := _format_ai_player_model_name(ai_player_runtimes)
	var ai_player_model_source_label := _format_ai_player_model_source_label(ai_player_runtimes)
	var ai_player_model_budget_tier := _format_model_budget_text(ai_player_runtimes)
	var ai_player_model_fallback_status := _format_ai_player_model_fallback_status(ai_player_runtimes)
	var ai_player_model_fallback_short := _format_ai_player_model_fallback_short(ai_player_runtimes)
	var ai_budget_summary := _format_ai_player_budget_summary(ai_player_runtimes, ai_resource_accounts, governor_resource_inboxes, execution_budget_summary)
	var ai_failure_player_summary := _format_failure_to_player_text(ai_failure_summary)
	var ai_next_step_summary := _format_ai_player_next_step_summary(ai_player_development_plan, ai_player_battle_report_items, ai_failure_summary)
	return {
		"title": "AI",
		"subtitle": "",
		"empty_state_text": "AI 域正在等待运行时快照。",
		"shared_state": {
			"autonomy_level": autonomy_level,
			"control_mode": control_mode,
			"control_authority_source": control_authority_source if control_authority_source != "" else "unknown",
			"ai_player_count": ai_players.size(),
			"captured_city_count": captured_cities.size(),
			"context_focus_id": context_focus_id,
			"context_focus_label": context_focus_label,
			"context_related_id": context_related_id,
			"context_related_label": context_related_label,
			"current_agenda_target_unit_id": current_agenda_target_unit_id,
			"current_agenda_target_unit_label": current_agenda_target_unit_label,
			"agenda": agenda.duplicate(true),
			"agenda_option_count": agenda_options.size(),
			"agenda_source_label": agenda_source_label,
			"agenda_summary": agenda_summary,
			"execution_status": execution_status,
			"execution_request_id": execution_request_id,
			"execution_queue_summary": execution_queue_summary,
			"execution_budget_summary": execution_budget_summary,
			"last_failure_code": last_failure_code,
			"last_receipt_message": last_receipt_message,
			"context_memory_headline": context_memory_headline,
			"home_tile_label": home_tile_label,
			"runtime_receipt_summary": runtime_receipt_lines[0],
			"runtime_receipt_tick": runtime_receipt_lines[1],
			"runtime_receipt_lines": runtime_receipt_lines.duplicate(),
			"ai_chat_history_count": _count_ai_chat_history_messages(ai_chat_history_snapshot),
			"ai_chat_history_source": str(ai_chat_history_snapshot.get("sourceLabel", "聊天频道")).strip_edges(),
			"ai_player_runtime_count": ai_player_runtimes.size(),
			"ai_player_primary_id": primary_ai_player_id if primary_ai_player_id != "" else "未选择",
			"ai_player_primary_display_name": primary_ai_player_display_name,
			"ai_player_runtime_updated_at": ai_player_runtime_updated_at,
			"ai_player_runtime_error": ai_player_runtime_error if ai_player_runtime_error != "" else "none",
			"ai_player_model_name": _format_ai_model_name_for_player(ai_player_model_name),
			"ai_player_model_source_label": ai_player_model_source_label,
			"ai_player_model_budget_tier": ai_player_model_budget_tier,
			"ai_player_model_fallback_status": ai_player_model_fallback_short,
			"ai_player_model_summary": ai_model_summary,
			"ai_player_model_access_summary": ai_model_access_summary,
			"ai_player_key_status": ai_key_status,
			"ai_context_document_count": ai_context_document_count,
			"ai_context_document_summary": ai_context_document_summary,
			"ai_player_failure_summary": ai_failure_summary,
			"ai_player_candidate_action_count": _count_candidate_actions(ai_player_runtimes, ai_player_action_catalog),
			"ai_resource_account_count": ai_resource_account_count,
			"ai_resource_summary": ai_resource_summary,
			"governor_pending_transfer_count": governor_pending_transfer_count,
			"governor_inbox_summary": governor_inbox_summary,
			"ai_development_goal_summary": ai_development_goal_summary,
			"ai_development_ready_action_count": ai_development_ready_action_count,
			"ai_development_risk_summary": ai_development_risk_summary,
			"ai_battle_report_count": int(ai_player_battle_report_read_model.get("count", ai_player_battle_report_items.size())),
			"ai_battle_report_summary": ai_battle_report_summary,
			"ai_battle_report_damage_summary": ai_battle_report_damage_summary,
			"ai_battle_report_suggestion": ai_battle_report_suggestion,
			"ai_battle_report_next_action": ai_battle_report_next_action,
			"ai_latest_receipt_summary": ai_latest_receipt_summary,
			"ai_latest_proposal_summary": ai_latest_proposal_summary,
			"ai_actionable_proposal_count": ai_actionable_proposal_count,
			"ai_player_budget_summary": ai_budget_summary,
			"ai_player_failure_player_summary": ai_failure_player_summary,
			"ai_next_step_summary": ai_next_step_summary,
		},
		"default_page_id": "players",
		"tabs": [],
		"sidebar_items": _build_ai_panel_sidebar_items(primary_ai_player_display_name, ai_next_step_summary, ai_actionable_proposal_count, ai_context_document_count),
		"sections": {
			"autonomy": {
				"summary_title": "托管权限",
				"shared_state_title": "",
				"player_reading_mode": true,
				"shared_state_fields": [],
				"summary_lines": [
					"默认日常代管；全权保留红线。",
				],
				"list_title": "AI玩家目录",
				"item_cards": [],
				"detail_title": "托管权限",
				"content_blocks": [
					_build_status_hero_block("当前托管", _build_autonomy_status_hero(autonomy_level), "AIAutonomyStatusHeroBlock"),
					_build_button_row_block("托管档位", [
						{"id": "autonomy_L1_assigned", "label": "只给建议", "disabled": autonomy_level == "L1_assigned", "min_width": 176},
						{"id": "autonomy_L2_delegated", "label": "日常代管", "disabled": autonomy_level == "L2_delegated", "min_width": 176},
						{"id": "autonomy_L3_negotiated", "label": "全权托管", "disabled": autonomy_level == "L3_negotiated", "min_width": 176},
					], "AIAutonomyActionBlock"),
					_build_reading_list_block("权限档位", _build_autonomy_reading_items(autonomy_level), "AIAutonomyReadingListBlock"),
				],
			},
			"players": {
				"summary_title": "AI玩家",
				"shared_state_title": "AI玩家状态",
				"player_reading_mode": true,
				"mobile_stack": true,
				"mobile_stack_breakpoint": 920,
				"left_card_columns": 2,
				"shared_state_fields": [],
				"summary_lines": [
					"先看本轮建议，再决定是否批准行动。",
				],
				"list_title": "AI玩家目录",
				"item_cards": [],
				"detail_title": "本轮建议",
				"content_blocks": [
					_build_status_hero_block("AI玩家状态", _build_ai_player_model_status_hero(primary_ai_player_display_name, ai_player_runtimes), "AIPlayerModelStatusFirstScreenBlock"),
					_build_reading_list_block("本轮先看", _build_action_management_priority_items(ai_next_step_summary, ai_failure_player_summary, ai_player_battle_report_items, ai_player_proposal_items, ai_player_runtime_error), "AIPlayerPriorityReadingBlock"),
					_build_button_row_block("常用操作", [
						{"id": "ai_players_refresh", "label": "刷新", "min_width": 156, "min_height": 64},
						{"id": "ai_player_model_proposal_create", "label": "问AI玩家", "disabled": ai_player_runtimes.is_empty(), "min_width": 176, "min_height": 64},
						{"id": "ai_player_latest_proposal_execute", "label": "批准执行", "disabled": ai_actionable_proposal_count <= 0, "min_width": 196, "min_height": 64},
					], "AIPlayerRuntimeActionBlock"),
				],
			},
			"advisor": {
				"summary_title": "AI玩家",
				"shared_state_title": "",
				"player_reading_mode": true,
				"mobile_stack": true,
				"mobile_stack_breakpoint": 920,
				"shared_state_fields": [],
				"summary_lines": [
					"头像用内置武将头像；身份只接文本档案。",
				],
				"list_title": "AI玩家目录",
				"item_cards": [],
				"detail_title": "AI玩家身份",
				"content_blocks": [
					_build_card_grid_block("AI玩家档案", _build_ai_advisor_profile_cards(ai_player_runtimes, ai_portrait_assignments, ai_player_development_plan, ai_player_battle_report_items, ai_failure_summary), "AIAdvisorProfileBlock", 2),
					_build_button_row_block("头像与身份", [
						{"id": "ai_player_display_name_edit", "label": "改名", "disabled": ai_player_runtimes.is_empty(), "min_width": 132, "min_height": 64},
						{"id": "ai_player_avatar_select_open", "label": "自选头像", "disabled": ai_player_runtimes.is_empty(), "min_width": 176, "min_height": 64},
						{"id": "ai_player_context_document_open", "label": "写身份提示", "disabled": ai_player_runtimes.is_empty(), "min_width": 196, "min_height": 64},
						{"id": "ai_player_context_document_file_open", "label": "导入文件", "disabled": ai_player_runtimes.is_empty(), "min_width": 176, "min_height": 64},
					], "AIAdvisorActionBlock"),
					_build_card_grid_block("已加入身份", _build_ai_context_document_cards(ai_player_runtimes), "AIAdvisorDocumentBlock", 2),
				],
			},
			"model": {
				"summary_title": "模型状态",
				"shared_state_title": "",
				"player_reading_mode": true,
				"mobile_stack": true,
				"mobile_stack_breakpoint": 920,
				"shared_state_fields": [],
				"summary_lines": [
					"只看模型是否接入、预算是否合适、备用模型是否可用。",
				],
				"list_title": "AI玩家目录",
				"item_cards": [],
				"detail_title": "模型状态",
				"content_blocks": [
					_build_card_grid_block("模型状态", _build_ai_player_model_status_cards(ai_player_runtimes), "AIPlayerModelStatusBlock", 5),
					_build_card_grid_block("资源预算", _build_ai_player_budget_cards(ai_player_runtimes, ai_resource_accounts, governor_resource_inboxes, execution_budget_summary), "AIPlayerBudgetBlock", 2),
					_build_button_row_block("动作", [
						{"id": "ai_players_refresh", "label": "刷新状态"},
					], "AIModelActionBlock"),
				],
			},
			"agenda": {
				"summary_title": "行动管理",
				"shared_state_title": "",
				"player_reading_mode": true,
				"shared_state_fields": [],
				"summary_lines": [
					"这里按玩家处理顺序整理候选动作、失败原因、战报和待批提案。",
				],
				"list_title": "AI玩家目录",
				"item_cards": [],
				"detail_title": "行动管理",
				"content_blocks": [
					_build_status_hero_block("行动总览", _build_action_management_status_hero(ai_next_step_summary, ai_failure_player_summary, ai_development_ready_action_count, ai_actionable_proposal_count, ai_player_battle_report_items), "AIActionManagementHeroBlock"),
					_build_button_row_block("玩家操作", _build_agenda_actions(agenda), "AIAgendaActionBlock"),
					_build_reading_list_block("玩家先看", _build_action_management_priority_items(ai_next_step_summary, ai_failure_player_summary, ai_player_battle_report_items, ai_player_proposal_items, ai_player_runtime_error), "AIActionPriorityListBlock"),
					_build_reading_list_block("候选行动明细", _build_candidate_action_reading_items(ai_player_development_plan, ai_player_runtimes, ai_player_action_catalog), "AIActionCandidateListBlock"),
					_build_reading_list_block("战报和提案明细", _build_proposal_battle_reading_items(ai_player_proposal_items, ai_player_battle_report_items), "AIActionProposalBattleListBlock"),
				],
			},
			"context": {
				"summary_title": "聊天记忆",
				"shared_state_title": "",
				"player_reading_mode": true,
				"shared_state_fields": [],
				"summary_lines": [
					"主要聊天在主界面频道；这里整理记忆和回执。",
				],
				"list_title": "AI玩家目录",
				"item_cards": [],
				"detail_title": "聊天记忆",
				"content_blocks": [
					_build_card_grid_block("记忆摘要", _build_ai_chat_memory_summary_cards(primary_ai_player_display_name, ai_chat_history_snapshot, context_memory_lines, runtime_receipt_lines, ai_latest_proposal_summary, ai_failure_player_summary, ai_battle_report_suggestion), "AIContextMemorySummaryBlock", 2),
					_build_button_row_block("", [
						{"id": "ai_player_open_chat_channel", "label": "打开聊天频道", "disabled": ai_player_runtimes.is_empty(), "min_width": 220, "min_height": 64},
					], "AIContextOpenChatBlock"),
					_build_collapsible_chat_timeline_block("最近对话", _build_ai_chat_timeline_messages(primary_ai_player_display_name, ai_chat_history_snapshot, context_memory_lines, runtime_receipt_lines, ai_latest_proposal_summary, ai_failure_player_summary, ai_battle_report_suggestion), "AIContextRecentChatBlock", false),
					_build_card_grid_block("同步来源", _build_ai_chat_history_source_cards(ai_chat_history_snapshot), "AIContextChatSourceBlock", 3),
				],
			},
		},
	}

func build_overlay_payload(runtime_context: Dictionary) -> Dictionary:
	return {
		"snapshot": build_snapshot(runtime_context),
		"runtime_state_patch": {},
	}

func _build_item_cards_from_items(raw_items: Array) -> Array:
	var cards: Array = []
	for item_variant in raw_items:
		if not (item_variant is Dictionary):
			continue
		var item := item_variant as Dictionary
		cards.append({
			"title": str(item.get("label", "")).strip_edges(),
			"value": str(item.get("status", "")).strip_edges(),
			"meta": str(item.get("meta", "")).strip_edges(),
			"description": str(item.get("description", "")).strip_edges(),
			"image_path": str(item.get("image_path", "")).strip_edges(),
		})
	return cards

func _build_card_grid_block(title: String, cards: Array, node_name: String = "", columns: int = 2) -> Dictionary:
	return {
		"kind": "card_grid",
		"title": title,
		"cards": cards.duplicate(true),
		"columns": maxi(1, columns),
		"node_name": node_name,
	}

func _build_status_hero_block(title: String, payload: Dictionary, node_name: String = "") -> Dictionary:
	return {
		"kind": "status_hero",
		"title": title,
		"payload": payload.duplicate(true),
		"node_name": node_name,
	}

func _build_chat_timeline_block(title: String, messages: Array, node_name: String = "") -> Dictionary:
	return {
		"kind": "chat_timeline",
		"title": title,
		"messages": messages.duplicate(true),
		"node_name": node_name,
	}

func _build_collapsible_chat_timeline_block(title: String, messages: Array, node_name: String = "", default_expanded: bool = false) -> Dictionary:
	return {
		"kind": "collapsible_chat_timeline",
		"title": title,
		"messages": messages.duplicate(true),
		"node_name": node_name,
		"default_expanded": default_expanded,
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

func _merge_card_sets(primary: Array, secondary: Array) -> Array:
	var merged: Array = []
	for source in [primary, secondary]:
		for card_variant in source:
			if card_variant is Dictionary:
				merged.append((card_variant as Dictionary).duplicate(true))
	return merged

func _build_ai_player_identity_cards(ai_player_runtimes: Array, portrait_assignments: Dictionary) -> Array:
	var cards: Array = []
	for runtime_variant in ai_player_runtimes.slice(0, min(ai_player_runtimes.size(), 3)):
		if not (runtime_variant is Dictionary):
			continue
		var runtime: Dictionary = runtime_variant as Dictionary
		var ai_player_id := _read_runtime_ai_player_id(runtime)
		var display_name := str(runtime.get("displayName", runtime.get("name", ai_player_id))).strip_edges()
		if display_name == "":
			display_name = ai_player_id if ai_player_id != "" else "未命名 AI"
		var model_name := _format_single_runtime_model_name(runtime)
		var source_label := _format_single_runtime_model_source_label(runtime)
		var key_status := _format_single_runtime_model_secret_status(runtime)
		var budget_label := _format_single_runtime_model_budget_text(runtime)
		var fallback_label := _format_single_runtime_model_fallback_status(runtime)
		var status_label := _format_runtime_status_label(str(runtime.get("status", "active")).strip_edges())
		var saved_avatar_path := str(runtime.get("avatarImagePath", "")).strip_edges()
		var portrait_path := saved_avatar_path if saved_avatar_path != "" and FileAccess.file_exists(saved_avatar_path) else _resolve_ai_player_portrait_path(ai_player_id, display_name, cards.size(), portrait_assignments)
		cards.append({
			"title": display_name,
			"value": status_label,
			"meta": "模型 %s / %s" % [model_name, source_label],
			"description": "预算 %s；%s；fallback %s；不会显示任何密钥明文。" % [budget_label, key_status, fallback_label],
			"image_path": portrait_path,
			"tone": "gold",
			"min_width": 190,
		})
	if not cards.is_empty():
		return cards
	var fallback_portrait := _resolve_ai_player_portrait_path("player_operator_alpha", "青州后勤官", 0, portrait_assignments)
	return [{
		"title": "AI 身份",
		"value": "待刷新",
		"meta": "正式头像库 / 等待 modelStatus",
		"description": "点击刷新后展示 runtime.modelStatus 的模型、来源、预算、secret 和 fallback 状态。",
		"image_path": fallback_portrait,
		"tone": "neutral",
	}]

func _build_ai_panel_sidebar_items(primary_display_name: String, next_step_summary: String, actionable_proposal_count: int, context_document_count: int) -> Array:
	return [{
		"id": "players",
		"label": "本轮建议",
		"meta": _format_ai_next_step_sidebar_label(next_step_summary),
		"description": "先看",
	}, {
		"id": "advisor",
		"label": "AI玩家",
		"meta": primary_display_name,
		"description": "%s 个身份文件" % str(context_document_count),
	}, {
		"id": "context",
		"label": "聊天记忆",
		"meta": "总结 / 最近",
		"description": "主频道回看",
	}, {
		"id": "model",
		"label": "模型接入",
		"meta": "模型 / 预算",
		"description": "是否正常",
	}, {
		"id": "agenda",
		"label": "行动管理",
		"meta": "待批 %s" % str(actionable_proposal_count),
		"description": "候选 / 战报",
	}, {
		"id": "autonomy",
		"label": "托管权限",
		"meta": "日常 / 全权",
		"description": "放开什么",
	}]

func _format_ai_next_step_sidebar_label(next_step: String) -> String:
	var short_label := _format_ai_next_step_short_label(next_step)
	return short_label if short_label != "" else "先看"

func _format_ai_next_step_short_label(next_step: String) -> String:
	var normalized := next_step.strip_edges()
	if normalized == "":
		return "待刷新"
	if normalized.find("风险") >= 0:
		return "看风险"
	if normalized.find("批准") >= 0:
		return "待批准"
	if normalized.find("刷新") >= 0:
		return "先刷新"
	if normalized.find("目标") >= 0:
		return "选目标"
	if normalized.find("战报") >= 0:
		return "看战报"
	if normalized.find("候选") >= 0:
		return "看候选"
	if normalized.length() > 8:
		return "%s..." % normalized.substr(0, 8).strip_edges()
	return normalized

func _format_ai_next_step_player_hint(next_step: String) -> String:
	var normalized := next_step.strip_edges()
	if normalized == "":
		return "等待AI玩家刷新。"
	if normalized.find("风险") >= 0:
		return "先看风险，再选行动。"
	if normalized.find("批准") >= 0:
		return "有提案待拍板。"
	if normalized.find("刷新") >= 0:
		return "先同步最新局势。"
	if normalized.find("目标") >= 0:
		return "需要玩家点选目标。"
	if normalized.find("战报") >= 0:
		return "先看战报再行动。"
	if normalized.find("候选") >= 0:
		return "查看可选行动。"
	return normalized if normalized.length() <= 14 else _format_ai_next_step_short_label(normalized)

func _build_autonomy_status_hero(autonomy_level: String) -> Dictionary:
	var level_label := _format_autonomy_level_label(autonomy_level)
	return {
		"headline": level_label,
		"subtitle": "日常交给 AI；攻伐、外交、大额消耗先停手。",
		"state": _format_autonomy_guardrail_state(autonomy_level),
		"facts": [{
			"label": "权限",
			"value": level_label,
			"tone": "gold",
			"min_width": 190,
		}, {
			"label": "自动",
			"value": _format_autonomy_ai_scope(autonomy_level),
			"tone": "green",
			"min_width": 210,
		}, {
			"label": "停手",
			"value": _format_autonomy_player_confirm_scope(autonomy_level),
			"tone": "blue",
			"min_width": 210,
		}, {
			"label": "接入",
			"value": "Token/API",
			"tone": "neutral",
			"min_width": 170,
		}],
	}

func _build_autonomy_reading_items(autonomy_level: String) -> Array:
	return [{
		"badge": "1",
		"title": "只给建议",
		"value": _autonomy_status(autonomy_level, "L1_assigned"),
		"meta": "旁观",
		"description": "看局势，不落子。",
		"tone": "gold" if autonomy_level == "L1_assigned" else "neutral",
	}, {
		"badge": "2",
		"title": "日常代管",
		"value": _autonomy_status(autonomy_level, "L2_delegated"),
		"meta": "默认",
		"description": "采集、治疗、训练、队列。",
		"tone": "blue" if autonomy_level == "L2_delegated" else "neutral",
	}, {
		"badge": "3",
		"title": "全权托管",
		"value": _autonomy_status(autonomy_level, "L3_negotiated"),
		"meta": "高强度",
		"description": "连续推进；红线停手。",
		"tone": "green" if autonomy_level == "L3_negotiated" else "neutral",
	}]

func _format_autonomy_level_label(autonomy_level: String) -> String:
	match autonomy_level.strip_edges():
		"L1_assigned":
			return "只给建议"
		"L2_delegated":
			return "日常代管"
		"L3_negotiated":
			return "全权托管"
		_:
			return "等待权限状态"

func _format_autonomy_ai_scope(autonomy_level: String) -> String:
	match autonomy_level.strip_edges():
		"L1_assigned":
			return "无"
		"L2_delegated":
			return "内政日常"
		"L3_negotiated":
			return "多数动作"
		_:
			return "等待状态"

func _format_autonomy_player_confirm_scope(autonomy_level: String) -> String:
	match autonomy_level.strip_edges():
		"L1_assigned":
			return "全部"
		"L2_delegated":
			return "攻伐外交"
		"L3_negotiated":
			return "红线"
		_:
			return "等待状态"

func _format_autonomy_guardrail_state(autonomy_level: String) -> String:
	match autonomy_level.strip_edges():
		"L1_assigned":
			return "只看不动"
		"L2_delegated":
			return "默认托管"
		"L3_negotiated":
			return "红线停手"
		_:
			return "等待权限状态"

func _resolve_autonomy_display_level(raw_level: String, ai_player_runtimes: Array, authority_source: String) -> String:
	var normalized := raw_level.strip_edges()
	if normalized == "" or normalized == "unknown":
		return "L2_delegated" if _has_configured_ai_player_secret(ai_player_runtimes) else "L1_assigned"
	if normalized == "L1_assigned" and _has_configured_ai_player_secret(ai_player_runtimes):
		var source := authority_source.strip_edges()
		if source == "" or source == "unknown" or source == "session_join" or source == "runtime_bootstrap_reused" or source == "runtime_bootstrap_readonly":
			return "L2_delegated"
	return normalized

func _has_configured_ai_player_secret(ai_player_runtimes: Array) -> bool:
	for runtime_variant in ai_player_runtimes:
		if not (runtime_variant is Dictionary):
			continue
		var model_status := _read_runtime_model_status(runtime_variant as Dictionary)
		for key_variant in ["secretConfigured", "hasSecret", "hasApiKey"]:
			var key := str(key_variant)
			if model_status.has(key) and bool(model_status.get(key, false)):
				return true
	return false

func _build_action_management_status_hero(next_step: String, failure_summary: String, ready_action_count: int, proposal_count: int, battle_report_items: Array) -> Dictionary:
	var player_failure := _format_failure_to_player_text(failure_summary)
	return {
		"headline": next_step,
		"subtitle": "先看阻塞，再看是否有可执行候选；战报和提案放在后面作为明细。",
		"state": "待玩家判断" if proposal_count > 0 or ready_action_count > 0 else "等待可执行动作",
		"facts": [{
			"label": "当前阻塞",
			"value": player_failure,
			"tone": "green" if player_failure == "暂无失败" else "blue",
			"min_width": 190,
		}, {
			"label": "候选行动",
			"value": "%s 条可看" % str(ready_action_count),
			"tone": "green" if ready_action_count > 0 else "neutral",
			"min_width": 180,
		}, {
			"label": "待批提案",
			"value": "%s 个提案" % str(proposal_count),
			"tone": "gold" if proposal_count > 0 else "neutral",
			"min_width": 180,
		}, {
			"label": "战报",
			"value": _format_ai_battle_report_summary(battle_report_items),
			"meta": _format_ai_battle_report_damage_summary(battle_report_items),
			"tone": "blue" if not battle_report_items.is_empty() else "neutral",
			"min_width": 220,
		}],
	}

func _build_action_management_priority_items(next_step: String, failure_summary: String, battle_report_items: Array, proposal_items: Array, runtime_error: String) -> Array:
	var player_failure := _format_failure_to_player_text(failure_summary)
	var runtime_error_text := runtime_error.strip_edges()
	var proposal_count := _count_actionable_ai_proposals(proposal_items)
	var items: Array = [{
		"badge": "先",
		"title": "下一步",
		"value": _format_ai_next_step_short_label(next_step),
		"meta": "判断",
		"description": _format_ai_next_step_player_hint(next_step),
		"tone": "gold",
	}, {
		"badge": "阻",
		"title": "阻塞",
		"value": "刷新异常" if runtime_error_text != "" else player_failure,
		"meta": "处理" if runtime_error_text != "" or player_failure != "暂无失败" else "正常",
		"description": runtime_error_text if runtime_error_text != "" else "无阻塞，可看候选。",
		"tone": "green" if runtime_error_text == "" and player_failure == "暂无失败" else "blue",
	}]
	if proposal_count > 0:
		items.append({
			"badge": "批",
			"title": "待批",
			"value": "%s 个" % str(proposal_count),
			"meta": "拍板",
			"description": _format_ai_player_latest_proposal(proposal_items),
			"tone": "gold",
		})
	if not battle_report_items.is_empty():
		items.append({
			"badge": "战",
			"title": "战报",
			"value": _format_ai_battle_report_summary(battle_report_items),
			"meta": _format_ai_battle_report_damage_summary(battle_report_items),
			"description": _format_ai_battle_report_suggestion(battle_report_items),
			"tone": "blue",
		})
	return items

func _build_candidate_action_reading_items(development_plan: Dictionary, ai_player_runtimes: Array, action_catalog: Array) -> Array:
	var actions: Array = development_plan.get("candidateActions", []) as Array
	var items: Array = []
	for action_variant in actions.slice(0, min(actions.size(), 3)):
		if not (action_variant is Dictionary):
			continue
		var action: Dictionary = action_variant as Dictionary
		var action_id := str(action.get("action", "")).strip_edges()
		if action_id == "":
			continue
		var readiness := str(action.get("readiness", "unknown")).strip_edges()
		var reason := str(action.get("proposalReason", action.get("reason", ""))).strip_edges()
		var blockers: Array = action.get("blockers", []) as Array
		var target_summary := _format_ai_action_target_summary(action_id, action)
		var blocker_text := "现在可以批准" if blockers.is_empty() else "还差：%s" % _format_ai_player_blockers(blockers)
		items.append({
			"badge": str(items.size() + 1),
			"title": _format_ai_action_label(action_id),
			"value": _format_action_readiness_label(readiness),
			"meta": _format_ai_action_approval_result(action_id),
			"description": "%s%s%s" % [
				target_summary if target_summary != "" else _format_ai_action_player_reason(action_id, reason),
				"。" if target_summary != "" else "",
				blocker_text,
			],
			"tone": "green" if readiness == "ready" else "blue" if readiness == "needs_target" else "neutral",
		})
	if not items.is_empty():
		return items
	var fallback_cards := _build_ai_player_candidate_action_cards(ai_player_runtimes, action_catalog)
	for card_variant in fallback_cards.slice(0, min(fallback_cards.size(), 3)):
		if not (card_variant is Dictionary):
			continue
		var card: Dictionary = card_variant as Dictionary
		items.append({
			"badge": str(items.size() + 1),
			"title": str(card.get("title", "候选动作")).strip_edges(),
			"value": "待确认",
			"meta": "刷新后显示可执行条件",
			"description": str(card.get("description", "刷新 AI 玩家后显示候选行动。")).strip_edges(),
			"tone": str(card.get("tone", "neutral")).strip_edges(),
		})
	return items

func _build_proposal_battle_reading_items(proposal_items: Array, battle_report_items: Array) -> Array:
	var items: Array = []
	for proposal_variant in proposal_items.slice(0, min(proposal_items.size(), 3)):
		if not (proposal_variant is Dictionary):
			continue
		var proposal: Dictionary = proposal_variant as Dictionary
		var action := str(proposal.get("action", "unknown")).strip_edges()
		var status := str(proposal.get("status", "unknown")).strip_edges()
		var risk_level := str(proposal.get("riskLevel", "unknown")).strip_edges()
		var failure_reason := str(proposal.get("rejectionReason", proposal.get("error", ""))).strip_edges()
		var description := _format_failure_to_player_text(failure_reason) if failure_reason != "" else _format_ai_action_player_reason(action, str(proposal.get("reason", "")).strip_edges())
		var target_summary := _format_ai_action_target_summary(action, proposal)
		if target_summary != "":
			description = "%s。%s" % [target_summary, description]
		items.append({
			"badge": "批",
			"title": _format_ai_action_label(action),
			"value": _format_ai_proposal_status_label(status),
			"meta": _format_ai_risk_label(risk_level),
			"description": description,
			"tone": "gold" if status == "pending_approval" or status == "approved" else "neutral",
		})
	for report_variant in battle_report_items.slice(0, min(battle_report_items.size(), 2)):
		if not (report_variant is Dictionary):
			continue
		var report: Dictionary = report_variant as Dictionary
		var severity := str(report.get("severity", "unknown")).strip_edges()
		items.append({
			"badge": "战",
			"title": _format_ai_battle_report_perspective(report),
			"value": _format_ai_battle_report_outcome(report),
			"meta": _format_ai_battle_report_damage(report),
			"description": str(report.get("nextStepSuggestion", "等待战报建议。")).strip_edges(),
			"tone": "gold" if severity == "high" else "blue" if severity == "medium" else "green",
		})
	if not items.is_empty():
		return items
	return [{
		"badge": "空",
		"title": "暂无提案或战报",
		"value": "等待刷新",
		"meta": "本轮没有需要处理的记录",
		"description": "让AI玩家出主意或刷新战报后，这里会显示玩家要处理的事项。",
		"tone": "neutral",
	}]

func _build_ai_advisor_identity_hero(primary_display_name: String, ai_player_runtimes: Array) -> Dictionary:
	var runtime := _read_primary_ai_player_runtime(ai_player_runtimes)
	var display_name := primary_display_name.strip_edges()
	if display_name == "":
		display_name = "AI玩家"
	var saved_avatar_path := ""
	if not runtime.is_empty():
		saved_avatar_path = str(runtime.get("avatarImagePath", "")).strip_edges()
	var avatar_status := "已设置" if saved_avatar_path != "" else "可选择或上传"
	var document_count := _count_ai_context_documents(ai_player_runtimes)
	return {
		"headline": display_name,
		"subtitle": "给AI玩家设置头像、名字和身份文件。身份文件可作为提示词、记忆或 SKLL 风格文档使用。",
		"state": "AI玩家档案可编辑" if not ai_player_runtimes.is_empty() else "等待刷新AI玩家",
		"facts": [{
			"label": "头像",
			"value": avatar_status,
			"meta": "内置头像",
			"tone": "gold",
			"min_width": 160,
		}, {
			"label": "身份文件",
			"value": "%s 个" % str(document_count),
			"meta": "身份 / 记忆 / 指令",
			"tone": "blue",
			"min_width": 160,
		}, {
			"label": "文本格式",
			"value": "txt / md / skll",
			"meta": "可粘贴或选择文件",
			"tone": "green",
			"min_width": 180,
		}, {
			"label": "作用",
			"value": "影响AI玩家说话与建议",
			"meta": "不改后端合同",
			"tone": "neutral",
			"min_width": 220,
		}],
	}

func _build_ai_advisor_profile_cards(ai_player_runtimes: Array, portrait_assignments: Dictionary, development_plan: Dictionary, battle_report_items: Array, failure_summary: String) -> Array:
	var runtime := _read_primary_ai_player_runtime(ai_player_runtimes)
	if runtime.is_empty():
		return [{
			"title": "AI玩家",
			"value": "待刷新",
			"meta": "还没有读取到 AI",
			"description": "刷新后可以设置头像、名字和身份文件。",
			"tone": "neutral",
		}]
	var ai_player_id := _read_runtime_ai_player_id(runtime)
	var display_name := str(runtime.get("displayName", runtime.get("name", ai_player_id))).strip_edges()
	if display_name == "":
		display_name = "未命名 AI"
	var saved_avatar_path := str(runtime.get("avatarImagePath", "")).strip_edges()
	var portrait_path := saved_avatar_path if saved_avatar_path != "" and FileAccess.file_exists(saved_avatar_path) else _resolve_ai_player_portrait_path(ai_player_id, display_name, 0, portrait_assignments)
	return [{
		"title": "当前AI玩家",
		"value": display_name,
		"meta": _format_runtime_status_label(str(runtime.get("status", "active")).strip_edges()),
		"description": _format_ai_model_name_for_player(_format_single_runtime_model_name(runtime)),
		"image_path": portrait_path,
		"image_size": 144,
		"tone": "gold",
		"min_width": 360,
	}, {
		"title": "身份文件",
		"value": _format_ai_context_document_summary(ai_player_runtimes),
		"meta": "txt / md / skll",
		"description": "导入或粘贴身份、记忆、规则、作战风格；图片身份以后再开放。",
		"tone": "blue",
		"min_width": 360,
	}]

func _build_ai_chat_memory_summary_cards(_primary_display_name: String, chat_history_snapshot: Dictionary, context_memory_lines: Array, runtime_receipt_lines: Array, latest_proposal_summary: String, failure_summary: String, battle_report_suggestion: String) -> Array:
	var player_latest := _find_latest_ai_chat_message_body(chat_history_snapshot, ["player"])
	var ai_latest := _find_latest_ai_chat_message_body(chat_history_snapshot, ["ai", "proposal", "receipt"])
	var memory_headline := _resolve_ai_chat_memory_headline(context_memory_lines, ai_latest, battle_report_suggestion)
	var followup_text := _resolve_ai_chat_followup_text(latest_proposal_summary, failure_summary, battle_report_suggestion, runtime_receipt_lines)
	return [{
		"title": "记忆摘要",
		"value": _clip_ai_chat_line(memory_headline, 72),
		"meta": "来自主聊天",
		"description": "玩家：%s\nAI玩家：%s" % [
			_clip_ai_chat_line(player_latest if player_latest != "" else "暂无玩家发言", 42),
			_clip_ai_chat_line(ai_latest if ai_latest != "" else "暂无回复", 42),
		],
		"tone": "gold",
		"min_width": 320,
	}, {
		"title": "待跟进",
		"value": _clip_ai_chat_line(followup_text, 72),
		"meta": "点下面按钮回频道继续聊",
		"description": "这里不直接聊天，只整理主界面聊天频道里的重点、提案、回执和失败。",
		"tone": "blue",
		"min_width": 320,
	}]

func _resolve_ai_chat_memory_headline(context_memory_lines: Array, ai_latest: String, battle_report_suggestion: String) -> String:
	for line_variant in context_memory_lines.slice(0, min(context_memory_lines.size(), 4)):
		var line := str(line_variant).strip_edges()
		if line != "" and line != "尚未查询":
			return line
	if ai_latest.strip_edges() != "":
		return ai_latest.strip_edges()
	if battle_report_suggestion.strip_edges() != "":
		return battle_report_suggestion.strip_edges()
	return "等待主聊天频道形成可总结内容。"

func _resolve_ai_chat_followup_text(latest_proposal_summary: String, failure_summary: String, battle_report_suggestion: String, runtime_receipt_lines: Array) -> String:
	var player_failure := _format_failure_to_player_text(failure_summary)
	if player_failure != "" and player_failure != "暂无失败":
		return player_failure
	var latest_proposal := latest_proposal_summary.strip_edges()
	if latest_proposal != "" and latest_proposal != "暂无提案":
		return latest_proposal
	var receipt_text := str(runtime_receipt_lines[0] if runtime_receipt_lines.size() > 0 else "").strip_edges()
	if receipt_text != "" and receipt_text != "暂无回执":
		return receipt_text
	if battle_report_suggestion.strip_edges() != "":
		return battle_report_suggestion.strip_edges()
	return "暂无待跟进事项。"

func _find_latest_ai_chat_message_body(chat_history_snapshot: Dictionary, accepted_kinds: Array) -> String:
	var raw_messages: Array = chat_history_snapshot.get("messages", []) as Array
	for reverse_index in range(raw_messages.size() - 1, -1, -1):
		var raw_message = raw_messages[reverse_index]
		if not (raw_message is Dictionary):
			continue
		var message := raw_message as Dictionary
		var kind := str(message.get("kind", "")).strip_edges()
		if not accepted_kinds.has(kind):
			continue
		var body := str(message.get("body", "")).strip_edges()
		if body != "":
			return body
	return ""

func _build_ai_chat_history_source_cards(chat_history_snapshot: Dictionary) -> Array:
	var loaded_count := _count_ai_chat_history_messages(chat_history_snapshot)
	var total_count := int(chat_history_snapshot.get("messageCount", loaded_count))
	if total_count < loaded_count:
		total_count = loaded_count
	var channel_label := str(chat_history_snapshot.get("channelLabel", "")).strip_edges()
	if channel_label == "":
		channel_label = str(chat_history_snapshot.get("sourceLabel", "主聊天频道")).strip_edges()
	var has_more := bool(chat_history_snapshot.get("hasMore", false))
	return [{
		"title": "频道",
		"value": channel_label,
		"meta": "主聊天",
		"description": "读取主界面同一批频道消息。",
		"tone": "gold",
		"min_width": 240,
	}, {
		"title": "已载入",
		"value": "%s / %s" % [str(loaded_count), str(total_count)],
		"meta": "最近记录",
		"description": "自然语言、提案、回执、失败都会按时间排在下方。",
		"tone": "blue",
		"min_width": 240,
	}, {
		"title": "更多历史",
		"value": "主频道可加载" if has_more else "当前批次",
		"meta": "不按主题拆分",
		"description": "玩家直接按聊天顺序阅读，不再手动选择聊天主题。",
		"tone": "green" if has_more else "neutral",
		"min_width": 240,
	}]

func _build_ai_chat_history_status_hero(chat_history_snapshot: Dictionary, context_focus_label: String) -> Dictionary:
	var message_count := _count_ai_chat_history_messages(chat_history_snapshot)
	var channel_label := str(chat_history_snapshot.get("channelLabel", "")).strip_edges()
	if channel_label == "":
		channel_label = str(chat_history_snapshot.get("sourceLabel", "主聊天频道")).strip_edges()
	var source_label := str(chat_history_snapshot.get("sourceLabel", "主聊天频道")).strip_edges()
	var filter_label := _format_ai_chat_filter_label(str(chat_history_snapshot.get("filter", "all")).strip_edges())
	var has_more := bool(chat_history_snapshot.get("hasMore", false))
	return {
		"headline": "同步聊天频道",
		"subtitle": "这里读取主界面同一批聊天历史。",
		"state": "%s 条记录" % str(message_count) if message_count > 0 else "等待聊天",
		"facts": [{
			"label": "频道",
			"value": channel_label,
			"meta": source_label,
			"tone": "gold",
			"min_width": 190,
		}, {
			"label": "记录",
			"value": "%s 条" % str(message_count),
			"meta": "同频显示",
			"tone": "blue",
			"min_width": 150,
		}, {
			"label": "筛选",
			"value": filter_label,
			"meta": context_focus_label,
			"tone": "green",
			"min_width": 150,
		}, {
			"label": "更多",
			"value": "可加载" if has_more else "当前批次",
			"meta": "来自聊天窗口",
			"tone": "neutral",
			"min_width": 170,
		}],
	}

func _build_ai_player_model_status_cards(ai_player_runtimes: Array) -> Array:
	var runtime := _read_primary_ai_player_runtime(ai_player_runtimes)
	var model_status: Dictionary = {}
	if not runtime.is_empty():
		model_status = _read_runtime_model_status(runtime)
	var fallback_model := _read_model_status_text(model_status, ["fallbackModel"], "")
	if fallback_model == "<null>":
		fallback_model = ""
	return [{
		"title": "模型",
		"value": _format_ai_model_name_for_player(_format_ai_player_model_name(ai_player_runtimes)),
		"meta": "当前接入",
		"description": "用于生成行动建议和说明。",
		"tone": "gold",
		"min_width": 168,
	}, {
		"title": "来源",
		"value": _format_ai_player_model_source_label(ai_player_runtimes),
		"meta": "已连接",
		"description": "显示当前模型从哪里接入。",
		"tone": "blue",
		"min_width": 168,
	}, {
		"title": "预算档位",
		"value": _format_model_budget_text(ai_player_runtimes),
		"meta": "本轮消耗",
		"description": "帮助玩家判断是否适合继续让 AI 出主意。",
		"tone": "green",
		"min_width": 168,
	}, {
		"title": "密钥",
		"value": _format_ai_player_key_status(ai_player_runtimes),
		"meta": "安全状态",
		"description": "只显示是否可用，不显示任何密钥。",
		"tone": "neutral",
		"min_width": 168,
	}, {
		"title": "备用模型",
		"value": _format_ai_player_model_fallback_short(ai_player_runtimes),
		"meta": _format_ai_model_name_for_player(fallback_model) if fallback_model != "" else "自动保护",
		"description": "主模型不可用时自动切换。",
		"tone": "neutral",
		"min_width": 168,
	}]

func _build_ai_player_model_status_hero(primary_display_name: String, ai_player_runtimes: Array) -> Dictionary:
	var runtime := _read_primary_ai_player_runtime(ai_player_runtimes)
	var model_status: Dictionary = {}
	if not runtime.is_empty():
		model_status = _read_runtime_model_status(runtime)
	var fallback_model := _read_model_status_text(model_status, ["fallbackModel"], "")
	if fallback_model == "<null>":
		fallback_model = ""
	var display_name := primary_display_name.strip_edges()
	if display_name == "":
		display_name = "AI玩家"
	var model_name := _format_ai_model_name_for_player(_format_ai_player_model_name(ai_player_runtimes))
	var source_label := _format_ai_player_model_source_label(ai_player_runtimes)
	var budget_label := _format_model_budget_text(ai_player_runtimes)
	var key_status := _format_ai_player_key_status(ai_player_runtimes)
	var fallback_status := _format_ai_player_model_fallback_short(ai_player_runtimes)
	var fallback_meta := _format_ai_model_name_for_player(fallback_model) if fallback_model != "" else "主模型不可用时自动切换"
	return {
		"headline": "%s 已接入" % display_name,
		"subtitle": "模型、来源、预算、密钥、备用，一屏确认。",
		"state": "接入正常" if not ai_player_runtimes.is_empty() else "等待刷新",
		"facts": [{
			"label": "模型",
			"value": model_name,
			"tone": "gold",
			"min_width": 152,
		}, {
			"label": "来源",
			"value": source_label,
			"tone": "blue",
			"min_width": 152,
		}, {
			"label": "预算",
			"value": budget_label,
			"tone": "green",
			"min_width": 170,
		}, {
			"label": "密钥",
			"value": key_status,
			"tone": "neutral",
			"min_width": 150,
		}, {
			"label": "备用",
			"value": fallback_status,
			"meta": fallback_meta,
			"tone": "neutral",
			"min_width": 170,
		}],
	}

func _build_ai_player_priority_cards(development_plan: Dictionary, ai_player_runtimes: Array, action_catalog: Array, failure_summary: String, battle_report_items: Array, proposal_items: Array, runtime_error: String) -> Array:
	var player_failure := _format_failure_to_player_text(failure_summary)
	var next_step := _format_ai_player_next_step_summary(development_plan, battle_report_items, failure_summary)
	var runtime_error_text := runtime_error.strip_edges()
	var candidate_cards := _build_ai_player_management_candidate_cards(development_plan, ai_player_runtimes, action_catalog)
	var candidate_card: Dictionary = {}
	if not candidate_cards.is_empty() and candidate_cards[0] is Dictionary:
		candidate_card = candidate_cards[0] as Dictionary
	var actionable_proposal_count := _count_actionable_ai_proposals(proposal_items)
	var latest_proposal := _format_ai_player_latest_proposal(proposal_items)
	var battle_summary := _format_ai_battle_report_summary(battle_report_items)
	var battle_meta := _format_ai_battle_report_damage_summary(battle_report_items)
	var battle_description := _format_ai_battle_report_suggestion(battle_report_items)
	var report_and_proposal_description := battle_description
	if latest_proposal != "暂无提案":
		report_and_proposal_description = "%s\n提案：%s" % [battle_description, latest_proposal]
	return [{
		"title": "下一步",
		"value": next_step,
		"meta": "优先处理",
		"description": "先看这一条，再决定是否批准行动。",
		"tone": "gold",
		"min_width": 260,
	}, {
		"title": "当前阻塞",
		"value": "刷新异常" if runtime_error_text != "" else player_failure,
		"meta": "需要处理" if player_failure != "暂无失败" or runtime_error_text != "" else "运行正常",
		"description": runtime_error_text if runtime_error_text != "" else "没有阻塞时，可以直接看候选行动。",
		"tone": "green" if player_failure == "暂无失败" and runtime_error_text == "" else "blue",
		"min_width": 260,
	}, {
		"title": "可批行动",
		"value": str(candidate_card.get("value", "待刷新")),
		"meta": str(candidate_card.get("title", "候选动作")),
		"description": str(candidate_card.get("description", "刷新 AI 玩家后展示下一条可批准动作。")),
		"tone": str(candidate_card.get("tone", "neutral")),
		"min_width": 260,
	}, {
		"title": "战报 / 提案",
		"value": battle_summary,
		"meta": "%s / 待批 %s" % [battle_meta, str(actionable_proposal_count)],
		"description": report_and_proposal_description,
		"tone": "blue" if actionable_proposal_count > 0 else "neutral",
		"min_width": 260,
	}]

func _build_ai_chat_history_cards(primary_display_name: String, chat_history_snapshot: Dictionary, context_memory_lines: Array, runtime_receipt_lines: Array, latest_proposal_summary: String, failure_summary: String, battle_report_suggestion: String) -> Array:
	var ai_name := primary_display_name.strip_edges()
	if ai_name == "":
		ai_name = "AI玩家"
	var message_cards := _build_ai_chat_message_cards(chat_history_snapshot)
	if not message_cards.is_empty():
		return message_cards
	var cards: Array = [{
		"title": "聊天频道",
		"value": "等待第一条聊天记忆",
		"meta": str(chat_history_snapshot.get("sourceLabel", "聊天频道")).strip_edges(),
		"description": "打开主界面聊天并给AI玩家发消息后，这里会显示同一批历史记录。",
		"tone": "gold",
		"min_width": 320,
	}]
	var ai_reply := ""
	for line_variant in context_memory_lines.slice(0, min(context_memory_lines.size(), 3)):
		var line := str(line_variant).strip_edges()
		if line != "":
			ai_reply = line
			break
	if ai_reply == "":
		ai_reply = battle_report_suggestion.strip_edges()
	if ai_reply == "":
		ai_reply = "我已同步当前局势。可以先看风险项，再选择下一条可执行动作。"
	cards.append({
		"title": ai_name,
		"value": _clip_ai_chat_line(ai_reply),
		"meta": "AI玩家回复",
		"description": "这里显示聊天频道里最接近当前局势的一条回复或记忆。",
		"tone": "blue",
		"min_width": 300,
	})
	var receipt_text := str(runtime_receipt_lines[0] if runtime_receipt_lines.size() > 0 else "").strip_edges()
	var receipt_meta := str(runtime_receipt_lines[1] if runtime_receipt_lines.size() > 1 else "最近回执").strip_edges()
	if receipt_text == "":
		receipt_text = "暂无回执"
	if receipt_meta == "":
		receipt_meta = "最近回执"
	cards.append({
		"title": "系统",
		"value": _clip_ai_chat_line(receipt_text),
		"meta": receipt_meta,
		"description": "提案批准、执行回执和失败原因会按聊天流回写。",
		"tone": "green" if failure_summary == "暂无失败" else "neutral",
		"min_width": 300,
	})
	if latest_proposal_summary.strip_edges() != "":
		cards.append({
			"title": "提案",
			"value": _clip_ai_chat_line(latest_proposal_summary),
			"meta": "聊天生成",
			"description": "聊天里生成的提案会在这里留下可读摘要。",
			"tone": "neutral",
			"min_width": 300,
		})
	return cards

func _build_ai_chat_message_cards(chat_history_snapshot: Dictionary) -> Array:
	var raw_messages: Array = chat_history_snapshot.get("messages", []) as Array
	var cards: Array = []
	var start_index := maxi(0, raw_messages.size() - 6)
	for index in range(start_index, raw_messages.size()):
		var raw_message = raw_messages[index]
		if not (raw_message is Dictionary):
			continue
		var message: Dictionary = raw_message as Dictionary
		var body := str(message.get("body", "")).strip_edges()
		if body == "":
			continue
		cards.append({
			"title": _format_ai_chat_message_title(message),
			"value": _clip_ai_chat_line(body, 78),
			"meta": _format_ai_chat_message_meta(message),
			"description": _format_ai_chat_message_description(message),
			"footer": _format_ai_chat_message_footer(message),
			"tone": _resolve_ai_chat_message_tone(message),
			"min_width": 360,
		})
	return cards

func _build_ai_chat_timeline_messages(primary_display_name: String, chat_history_snapshot: Dictionary, context_memory_lines: Array, runtime_receipt_lines: Array, latest_proposal_summary: String, failure_summary: String, battle_report_suggestion: String) -> Array:
	var raw_messages: Array = chat_history_snapshot.get("messages", []) as Array
	var messages: Array = []
	var start_index := maxi(0, raw_messages.size() - 18)
	for index in range(start_index, raw_messages.size()):
		var raw_message = raw_messages[index]
		if not (raw_message is Dictionary):
			continue
		var message: Dictionary = raw_message as Dictionary
		var body := str(message.get("body", "")).strip_edges()
		if body == "":
			continue
		messages.append({
			"name": _format_ai_chat_message_title(message),
			"body": body,
			"meta": _format_ai_chat_message_meta(message),
			"footer": _format_ai_chat_message_footer(message),
			"tone": _resolve_ai_chat_message_tone(message),
			"align": "right" if str(message.get("kind", "")).strip_edges() == "player" else "left",
			"min_width": 520,
		})
	if not messages.is_empty():
		return messages
	messages.append({
		"name": "聊天频道",
		"body": "暂无聊天记忆。打开主界面聊天并给AI玩家发消息后，这里会同步显示。",
		"meta": str(chat_history_snapshot.get("sourceLabel", "聊天频道")).strip_edges(),
		"footer": "",
		"tone": "gold",
		"align": "left",
	})
	return messages

func _count_ai_chat_history_messages(chat_history_snapshot: Dictionary) -> int:
	var raw_messages: Array = chat_history_snapshot.get("messages", []) as Array
	return raw_messages.size()

func _format_ai_chat_message_title(message: Dictionary) -> String:
	var display_name := str(message.get("name", "")).strip_edges()
	if display_name != "":
		return display_name
	match str(message.get("kind", "")).strip_edges():
		"player":
			return "总督"
		"ai":
			return "AI玩家"
		"proposal":
			return "提案"
		"receipt":
			return "回执"
		_:
			return "系统"

func _format_ai_chat_message_meta(message: Dictionary) -> String:
	var parts: Array[String] = []
	parts.append(_format_ai_chat_kind_label(str(message.get("kind", "")).strip_edges()))
	var action := _format_runtime_action_for_player(str(message.get("action", "")).strip_edges())
	if action != "" and action != "最近行动":
		parts.append(action)
	var failure_code := str(message.get("failureCode", "")).strip_edges()
	if failure_code != "":
		parts.append("失败：%s" % _format_failure_to_player_text(failure_code))
	return " / ".join(parts)

func _format_ai_chat_message_description(message: Dictionary) -> String:
	var kind := str(message.get("kind", "")).strip_edges()
	var metadata: Dictionary = message.get("metadata", {}) as Dictionary
	if kind == "proposal":
		return "这条聊天已经生成提案，等待玩家确认。"
	if kind == "receipt":
		return "这是执行后的聊天回执。"
	if kind == "player":
		return "玩家在聊天频道下达的自然语言意图。"
	if kind == "ai":
		return "AI玩家在聊天频道给出的回复。"
	var metadata_failure := str(metadata.get("failureCode", "")).strip_edges()
	if metadata_failure != "":
		return "系统记录了失败原因：%s。" % _format_failure_to_player_text(metadata_failure)
	return "来自聊天频道的系统记录。"

func _format_ai_chat_message_footer(message: Dictionary) -> String:
	var parts: Array[String] = []
	var created_at := str(message.get("createdAt", "")).strip_edges()
	if created_at != "":
		parts.append(created_at)
	var proposal_id := str(message.get("proposalId", "")).strip_edges()
	if proposal_id == "":
		proposal_id = str(message.get("receiptProposalId", "")).strip_edges()
	if proposal_id != "":
		parts.append("提案 %s" % proposal_id)
	return " / ".join(parts)

func _format_ai_chat_kind_label(kind: String) -> String:
	match kind:
		"player":
			return "玩家"
		"ai":
			return "AI玩家"
		"proposal":
			return "提案"
		"receipt":
			return "回执"
		"system":
			return "系统"
		_:
			return "聊天"

func _format_ai_chat_filter_label(filter_id: String) -> String:
	match filter_id:
		"command":
			return "命令"
		"proposal":
			return "提案"
		"receipt":
			return "回执"
		"failure":
			return "失败"
		_:
			return "全部"

func _resolve_ai_chat_message_tone(message: Dictionary) -> String:
	var failure_code := str(message.get("failureCode", "")).strip_edges()
	if failure_code != "":
		return "neutral"
	match str(message.get("kind", "")).strip_edges():
		"player":
			return "gold"
		"ai":
			return "blue"
		"proposal":
			return "gold"
		"receipt":
			return "green" if bool(message.get("receiptOk", false)) else "neutral"
		_:
			return "neutral"

func _clip_ai_chat_line(value: String, max_chars: int = 52) -> String:
	var text := value.strip_edges()
	if text.length() <= max_chars:
		return text
	return "%s..." % text.substr(0, max_chars).strip_edges()

func _build_ai_player_budget_cards(ai_player_runtimes: Array, resource_accounts: Dictionary, governor_resource_inboxes: Dictionary, execution_budget_summary: String) -> Array:
	var cards: Array = [{
		"title": "行动预算",
		"value": _format_execution_budget_player_text(execution_budget_summary),
		"meta": "本轮可做多少事",
		"description": "行动点和粮草仍以后端执行结果为准，UI 不本地扣减。",
		"tone": "gold",
	}]
	cards.append({
		"title": "资源子账户",
		"value": _format_ai_resource_accounts_summary(resource_accounts),
		"meta": "AI 自己可用的粮草、木材、石料和铁矿",
		"description": "采集收益先进入 AI 子账户，再按正式提案转给总督。",
		"tone": "green",
	})
	cards.append({
		"title": "资源输送额度",
		"value": _format_primary_transfer_budget(ai_player_runtimes),
		"meta": "配额 / 冷却 / 阻塞",
		"description": "显示当前能不能把资源交给总督。",
		"tone": "blue",
	})
	cards.append({
		"title": "模型预算",
		"value": _format_model_budget_text(ai_player_runtimes),
		"meta": _format_pending_transfer_budget(governor_resource_inboxes),
		"description": "这里只提示预算档位，实际消耗由系统结算。",
		"tone": "neutral",
	})
	return cards

func _build_ai_player_roster_cards(ai_player_runtimes: Array, portrait_assignments: Dictionary, development_plan: Dictionary, failure_summary: String, battle_report_items: Array, proposal_items: Array) -> Array:
	var cards: Array = []
	for runtime_variant in ai_player_runtimes.slice(0, min(ai_player_runtimes.size(), 2)):
		if not (runtime_variant is Dictionary):
			continue
		var runtime: Dictionary = runtime_variant as Dictionary
		var ai_player_id := _read_runtime_ai_player_id(runtime)
		var display_name := str(runtime.get("displayName", runtime.get("name", ai_player_id))).strip_edges()
		if display_name == "":
			display_name = "未命名 AI"
		var saved_avatar_path := str(runtime.get("avatarImagePath", "")).strip_edges()
		var portrait_path := saved_avatar_path if saved_avatar_path != "" and FileAccess.file_exists(saved_avatar_path) else _resolve_ai_player_portrait_path(ai_player_id, display_name, cards.size(), portrait_assignments)
		var status_label := _format_runtime_status_label(str(runtime.get("status", "active")).strip_edges())
		cards.append({
			"title": display_name,
			"value": status_label,
			"meta": _format_ai_model_name_for_player(_format_single_runtime_model_name(runtime)),
			"description": "下一步：%s" % _format_ai_player_next_step_summary(development_plan, battle_report_items, failure_summary),
			"image_path": portrait_path,
			"tone": "gold",
			"min_width": 220,
		})
	if cards.is_empty():
		cards.append({
			"title": "青州后勤官",
			"value": "待刷新",
			"meta": "等待模型状态",
			"description": "刷新后会显示当前AI玩家的接入状态。",
			"image_path": _resolve_ai_player_portrait_path("player_operator_alpha", "青州后勤官", 0, portrait_assignments),
			"tone": "neutral",
		})
	cards.append({
		"title": "本轮建议",
		"value": _format_ai_player_next_step_summary(development_plan, battle_report_items, failure_summary),
		"meta": "玩家先看",
		"description": "候选行动、阻塞原因、战报和提案已按处理顺序整理。",
		"tone": "blue",
		"min_width": 220,
	})
	cards.append({
		"title": "待批提案",
		"value": str(_count_actionable_ai_proposals(proposal_items)),
		"meta": "可由玩家批准",
		"description": "没有待批提案时，先处理候选行动或战报建议。",
		"tone": "green" if _count_actionable_ai_proposals(proposal_items) > 0 else "neutral",
		"min_width": 220,
	})
	return cards

func _build_ai_player_management_candidate_cards(development_plan: Dictionary, ai_player_runtimes: Array, action_catalog: Array) -> Array:
	var actions: Array = development_plan.get("candidateActions", []) as Array
	var cards: Array = []
	for action_variant in actions.slice(0, min(actions.size(), 3)):
		if not (action_variant is Dictionary):
			continue
		var action: Dictionary = action_variant as Dictionary
		var action_id := str(action.get("action", "")).strip_edges()
		if action_id == "":
			continue
		var readiness := str(action.get("readiness", "unknown")).strip_edges()
		var reason := str(action.get("proposalReason", action.get("reason", ""))).strip_edges()
		var blockers: Array = action.get("blockers", []) as Array
		var blocker_text := "现在可批准" if blockers.is_empty() else "缺少条件：%s" % _format_ai_player_blockers(blockers)
		var target_summary := _format_ai_action_target_summary(action_id, action)
		var why_text := _format_ai_action_player_reason(action_id, reason)
		cards.append({
			"title": _format_ai_action_label(action_id),
			"value": _format_action_readiness_label(readiness),
			"meta": "批准后：%s" % _format_ai_action_approval_result(action_id),
			"description": "%s。%s。%s。" % [
				target_summary if target_summary != "" else _format_ai_action_label(action_id),
				why_text,
				blocker_text,
			],
			"tone": "green" if readiness == "ready" else "blue" if readiness == "needs_target" else "neutral",
			"min_width": 260,
		})
	if not cards.is_empty():
		return cards
	var fallback_cards := _build_ai_player_candidate_action_cards(ai_player_runtimes, action_catalog)
	return fallback_cards.slice(0, min(fallback_cards.size(), 3))

func _build_ai_player_failure_next_step_cards(failure_summary: String, development_plan: Dictionary, battle_report_items: Array, runtime_error: String) -> Array:
	var player_failure := _format_failure_to_player_text(failure_summary)
	var next_step := _format_ai_player_next_step_summary(development_plan, battle_report_items, failure_summary)
	var cards: Array = [{
		"title": "最近失败原因",
		"value": player_failure,
		"meta": "运行时 / 提案 / 回执",
		"description": "这里只解释玩家该怎么处理，不把后端字段堆给玩家。",
		"tone": "green" if player_failure == "暂无失败" else "blue",
	}, {
		"title": "下一步建议",
		"value": next_step,
		"meta": "玩家可执行",
		"description": "优先从发育主赛项和战报建议读取；没有字段时显示等待后端字段。",
		"tone": "gold",
	}, {
		"title": "战报提示",
		"value": _format_ai_battle_report_summary(battle_report_items),
		"meta": _format_ai_battle_report_damage_summary(battle_report_items),
		"description": _format_ai_battle_report_suggestion(battle_report_items),
		"tone": "blue",
	}]
	if runtime_error.strip_edges() != "":
		cards.append({
			"title": "刷新异常",
			"value": "需要重试刷新",
			"meta": "运行时暂不可用",
			"description": runtime_error.strip_edges(),
			"tone": "neutral",
		})
	return cards

func _build_agenda_items(agenda: Dictionary, captured_city_count: int, ai_player_count: int, home_tile_id: String) -> Array:
	var items: Array = []
	var agenda_options: Array = _resolve_agenda_options(agenda)
	for option_variant in agenda_options.slice(0, min(agenda_options.size(), 4)):
		if not (option_variant is Dictionary):
			continue
		var option: Dictionary = option_variant as Dictionary
		var action_meta := str(option.get("actionId", "")).strip_edges()
		var intent_meta := str(option.get("intent", action_meta)).strip_edges()
		var target_tile_id := str(option.get("targetTileId", "")).strip_edges()
		var support_count := int(option.get("supportCount", 0))
		var priority := str(option.get("priority", "P2")).strip_edges()
		var summary := str(option.get("summary", option.get("label", ""))).strip_edges()
		var supporting_ai_player_ids: Array = option.get("supportingAiPlayerIds", []) as Array
		var support_ai_description := ""
		if not supporting_ai_player_ids.is_empty():
			support_ai_description = " 支援 AI：%s。" % ",".join(supporting_ai_player_ids.slice(0, min(supporting_ai_player_ids.size(), 3)))
		items.append({
			"label": str(option.get("label", summary)).strip_edges(),
			"meta": "%s%s" % [
				intent_meta if intent_meta != "" else action_meta if action_meta != "" else str(agenda.get("source", "domain")),
				" @ %s" % target_tile_id if target_tile_id != "" else "",
			],
			"status": "%s / %s票" % [priority, str(support_count)],
			"description": "%s%s" % [summary if summary != "" else "当前议程预览项。", support_ai_description],
		})
	if items.is_empty():
		items = [
			{"label": "扩张优先", "meta": "已占城池 %s" % str(captured_city_count), "status": "待刷新", "description": "当前势力仍保留扩张路线。"},
			{"label": "补给修复", "meta": "主城 %s" % (home_tile_id if home_tile_id != "" else "未定位"), "status": "待刷新", "description": "部队域与内政域共享补给事实，但不共享层级。"},
			{"label": "盟友支援", "meta": "AI 玩家 %s" % str(ai_player_count), "status": "待刷新", "description": "后续可与同盟域和政务队列联动。"},
		]
	var followups: Array = agenda.get("recommendedFollowups", []) as Array
	if not followups.is_empty():
		items.append({
			"label": "后续建议",
			"meta": ",".join(followups.slice(0, min(followups.size(), 2))),
			"status": "权威建议",
			"description": "当前议程执行后的推荐后续动作。",
		})
	return items

func _build_agenda_actions(agenda: Dictionary) -> Array:
	var actions: Array = [
		{"id": "agenda_refresh", "label": "刷新议程"},
	]
	var agenda_options: Array = _resolve_agenda_options(agenda)
	for option_variant in agenda_options.slice(0, min(agenda_options.size(), 5)):
		if not (option_variant is Dictionary):
			continue
		var option: Dictionary = option_variant as Dictionary
		var label_text := str(option.get("label", "")).strip_edges()
		if label_text == "":
			continue
		var action_id := str(option.get("actionId", "")).strip_edges()
		if action_id == "":
			continue
		var target_tile_id := str(option.get("targetTileId", "")).strip_edges()
		var summary := str(option.get("summary", label_text)).strip_edges()
		actions.append({
			"id": action_id,
			"label": label_text,
			"description": summary,
			"targetTileId": target_tile_id,
			"priority": str(option.get("priority", "P2")).strip_edges(),
		})
	var target_unit_id := _resolve_primary_agenda_target_unit_id(agenda)
	actions.append({
		"id": "agenda_open_troop",
		"label": "查看部队",
		"disabled": target_unit_id == "",
	})
	actions.append({
		"id": "agenda_open_interior",
		"label": "查看内政",
	})
	actions.append({
		"id": "agenda_open_alliance",
		"label": "查看同盟",
	})
	return actions

func _build_agenda_detail_lines(agenda: Dictionary, agenda_options: Array, runtime_context: Dictionary) -> Array:
	var execution_state := WorldStore.get_resolved_ai_execution(_target_faction_id)
	var action_receipt := WorldStore.get_ai_action_receipt(_target_faction_id)
	var execution_request_id := _resolve_execution_request_id(agenda, execution_state, action_receipt)
	var execution_status := _resolve_execution_status(execution_state, action_receipt)
	var failure_code := _resolve_failure_code(action_receipt)
	var lines := [
		"当前议程来源：%s" % str(agenda.get("source", "domain")),
		"当前议程模式：%s" % str(agenda.get("authorityMode", "authoritative_world")),
		"当前议程摘要：%s" % str(agenda.get("summary", "尚未刷新议程。")),
		"目标地块：%s" % str(agenda.get("targetTileId", "未定位")),
		"目标部队：%s" % _join_target_units(agenda.get("targetUnitIds", []) as Array),
		"首项选项：%s" % _agenda_option_detail(agenda_options),
		"执行请求：%s" % execution_request_id,
		"执行状态：%s" % execution_status,
		"执行预算：%s" % _format_execution_budget_summary(execution_state),
		"队列摘要：%s" % _format_execution_queue_summary(execution_state),
	]
	if failure_code != "none":
		lines.append("失败码：%s" % failure_code)
	var receipt_message := _resolve_receipt_message(action_receipt)
	if receipt_message != "none":
		lines.append("回执详情：%s" % receipt_message)
	var target_unit_id := _resolve_primary_agenda_target_unit_id(agenda)
	lines.append("联动建议：%s" % _resolve_agenda_link_hint(agenda, target_unit_id))
	var runtime_receipt_lines := _build_runtime_receipt_lines(runtime_context)
	for runtime_receipt_line in runtime_receipt_lines:
		lines.append(runtime_receipt_line)
	return lines

func _build_ai_player_runtime_items(ai_player_runtimes: Array, resource_accounts: Dictionary, portrait_assignments: Dictionary = {}) -> Array:
	var items: Array = []
	for runtime_variant in ai_player_runtimes:
		if not (runtime_variant is Dictionary):
			continue
		var runtime: Dictionary = runtime_variant as Dictionary
		var ai_player_id := _read_runtime_ai_player_id(runtime)
		var display_name := str(runtime.get("displayName", runtime.get("name", ai_player_id))).strip_edges()
		if display_name == "":
			display_name = ai_player_id if ai_player_id != "" else "未命名 AI"
		var model_name := _format_single_runtime_model_name(runtime)
		var source_label := _format_single_runtime_model_source_label(runtime)
		var budget_label := _format_single_runtime_model_budget_text(runtime)
		var key_status := _format_single_runtime_model_secret_status(runtime)
		var fallback_label := _format_single_runtime_model_fallback_status(runtime)
		var resource_transfer: Dictionary = runtime.get("resourceTransfer", {}) as Dictionary
		var account: Dictionary = resource_accounts.get(ai_player_id, {}) as Dictionary
		var account_resources: Dictionary = account.get("resources", {}) as Dictionary
		var latest_receipt: Dictionary = runtime.get("latestReceipt", {}) as Dictionary
		var receipt_summary := _format_receipt_summary(latest_receipt)
		var transfer_blocked_by := str(resource_transfer.get("blockedBy", "")).strip_edges()
		var transfer_status := "可输送" if bool(resource_transfer.get("canTransferNow", false)) else transfer_blocked_by
		if transfer_status == "":
			transfer_status = "待刷新"
		var saved_avatar_id := str(runtime.get("avatarId", "")).strip_edges()
		var saved_avatar_path := str(runtime.get("avatarImagePath", "")).strip_edges()
		var portrait_path := saved_avatar_path if saved_avatar_path != "" and FileAccess.file_exists(saved_avatar_path) else _resolve_ai_player_portrait_path(ai_player_id, display_name, items.size(), portrait_assignments)
		var avatar_summary := saved_avatar_id if saved_avatar_id != "" else "默认头像"
		items.append({
			"label": display_name,
			"meta": "%s / %s" % [model_name, source_label],
			"status": str(runtime.get("status", "active")),
			"image_path": portrait_path,
			"description": "%s / 预算 %s / %s / fallback %s / %s / 资源 %s / 输送 %s / %s" % [
				ai_player_id,
				budget_label,
				key_status,
				fallback_label,
				avatar_summary,
				_format_resource_bundle(account_resources),
				transfer_status,
				receipt_summary,
			],
		})
	if not items.is_empty():
		return items
	var fallback_portrait := _resolve_ai_player_portrait_path("player_operator_alpha", "青州后勤官", 0, portrait_assignments)
	return [{
		"label": "青州后勤官",
		"meta": "等待 modelStatus",
		"status": "待刷新",
		"image_path": fallback_portrait,
		"description": "点击刷新 AI 玩家后展示 runtime.modelStatus，不在 UI 内倒查 provider pool。",
	}]

func _load_ai_chat_portrait_assignments() -> Dictionary:
	var assignments: Dictionary = {}
	if not FileAccess.file_exists(AI_CHAT_PORTRAIT_MANIFEST):
		return assignments
	var raw := FileAccess.get_file_as_string(AI_CHAT_PORTRAIT_MANIFEST)
	if FileAccess.get_open_error() != OK or raw.strip_edges() == "":
		return assignments
	var parsed = JSON.parse_string(raw)
	if not (parsed is Dictionary):
		return assignments
	var manifest := parsed as Dictionary
	var portrait_paths: Array[String] = []
	var assignments_value = manifest.get("assignments", {})
	if assignments_value is Dictionary:
		for key in (assignments_value as Dictionary).keys():
			var portrait_path := str((assignments_value as Dictionary).get(key, "")).strip_edges()
			if portrait_path != "":
				assignments[str(key).strip_edges()] = portrait_path
	var players_value = manifest.get("players", {})
	if players_value is Dictionary:
		for key in (players_value as Dictionary).keys():
			var player_value = (players_value as Dictionary).get(key, {})
			if player_value is Dictionary:
				var path := str((player_value as Dictionary).get("portraitPath", "")).strip_edges()
				if path != "":
					assignments[str(key).strip_edges()] = path
	var portraits_value = manifest.get("portraits", [])
	if portraits_value is Array:
		for portrait_value in portraits_value as Array:
			if not (portrait_value is Dictionary):
				continue
			var portrait := portrait_value as Dictionary
			if not bool(portrait.get("selectable", true)):
				continue
			var image_path := str(portrait.get("image", portrait.get("portraitPath", ""))).strip_edges()
			if image_path == "":
				continue
			portrait_paths.append(image_path)
			var portrait_id := str(portrait.get("id", "")).strip_edges()
			if portrait_id != "":
				assignments[portrait_id] = image_path
			var display_name := str(portrait.get("display_name", "")).strip_edges()
			if display_name != "":
				assignments[display_name] = image_path
	for i in range(portrait_paths.size()):
		assignments["__index_%d" % i] = portrait_paths[i]
	if portrait_paths.size() > 0:
		assignments["player_operator_alpha"] = assignments.get("player_operator_alpha", portrait_paths[0])
		assignments["青州后勤官"] = assignments.get("青州后勤官", portrait_paths[0])
	if portrait_paths.size() > 1:
		assignments["player_operator_beta"] = assignments.get("player_operator_beta", portrait_paths[1])
		assignments["兖州斥候官"] = assignments.get("兖州斥候官", portrait_paths[1])
	return assignments

func _resolve_ai_player_portrait_path(ai_player_id: String, display_name: String, index: int, portrait_assignments: Dictionary) -> String:
	for key in [ai_player_id.strip_edges(), display_name.strip_edges(), "__index_%d" % index]:
		if key != "" and portrait_assignments.has(key):
			var path := str(portrait_assignments.get(key, "")).strip_edges()
			if path != "" and FileAccess.file_exists(path):
				return path
	return ""

func _resolve_primary_ai_player_display_name(ai_player_runtimes: Array, primary_ai_player_id: String) -> String:
	var normalized_primary_id := primary_ai_player_id.strip_edges()
	for runtime_variant in ai_player_runtimes:
		if not (runtime_variant is Dictionary):
			continue
		var runtime: Dictionary = runtime_variant as Dictionary
		var ai_player_id := _read_runtime_ai_player_id(runtime)
		if normalized_primary_id != "" and ai_player_id != normalized_primary_id:
			continue
		var display_name := str(runtime.get("displayName", runtime.get("name", ai_player_id))).strip_edges()
		if display_name != "":
			return display_name
		if ai_player_id != "":
			return ai_player_id
	if normalized_primary_id != "":
		return normalized_primary_id
	return ""

func _build_ai_resource_account_cards(resource_accounts: Dictionary) -> Array:
	var cards: Array = []
	for ai_player_id_variant in resource_accounts.keys():
		var ai_player_id := str(ai_player_id_variant).strip_edges()
		if ai_player_id == "":
			continue
		var account_variant: Variant = resource_accounts.get(ai_player_id, {})
		if not (account_variant is Dictionary):
			continue
		var account: Dictionary = account_variant as Dictionary
		var resources: Dictionary = account.get("resources", {}) as Dictionary
		cards.append({
			"title": ai_player_id,
			"value": _format_resource_bundle(resources),
			"meta": "governor %s" % str(account.get("governorPlayerId", "unknown")),
			"description": "updatedTick %s / faction %s" % [
				str(account.get("updatedTick", "unknown")),
				str(account.get("factionId", _target_faction_id)),
			],
			"tone": "green",
		})
	if not cards.is_empty():
		return cards
	return [{
		"title": "资源子账户",
		"value": "暂无",
		"meta": "world.aiResourceAccounts",
		"description": "采集成功后这里会显示 AI 独立资源账户。",
		"tone": "neutral",
	}]

func _build_ai_player_proposal_cards(proposal_items: Array) -> Array:
	var cards: Array = []
	for proposal_variant in proposal_items.slice(0, min(proposal_items.size(), 3)):
		if not (proposal_variant is Dictionary):
			continue
		var proposal: Dictionary = proposal_variant as Dictionary
		var action := str(proposal.get("action", "unknown")).strip_edges()
		var status := str(proposal.get("status", "unknown")).strip_edges()
		var risk_level := str(proposal.get("riskLevel", "unknown")).strip_edges()
		var failure_reason := str(proposal.get("rejectionReason", proposal.get("error", ""))).strip_edges()
		var description := _format_failure_to_player_text(failure_reason) if failure_reason != "" else _format_ai_action_player_reason(action, str(proposal.get("reason", "")).strip_edges())
		var target_summary := _format_ai_action_target_summary(action, proposal)
		if target_summary != "":
			description = "%s。%s" % [target_summary, description]
		cards.append({
			"title": _format_ai_action_label(action),
			"value": _format_ai_proposal_status_label(status),
			"meta": _format_ai_risk_label(risk_level),
			"description": description,
			"tone": "blue" if status == "pending_approval" or status == "approved" else "neutral",
		})
	if not cards.is_empty():
		return cards
	return [{
		"title": "待批提案",
		"value": "暂无",
		"meta": "本轮没有要批准的事",
		"description": "生成提案后，这里会展示玩家可以批准的行动。",
		"tone": "neutral",
	}]

func _build_ai_player_candidate_action_cards(ai_player_runtimes: Array, action_catalog: Array) -> Array:
	var catalog_by_action: Dictionary = {}
	for catalog_variant in action_catalog:
		if not (catalog_variant is Dictionary):
			continue
		var catalog_entry: Dictionary = catalog_variant as Dictionary
		var action := str(catalog_entry.get("action", "")).strip_edges()
		if action != "":
			catalog_by_action[action] = catalog_entry
	var cards: Array = []
	for runtime_variant in ai_player_runtimes.slice(0, min(ai_player_runtimes.size(), 2)):
		if not (runtime_variant is Dictionary):
			continue
		var runtime: Dictionary = runtime_variant as Dictionary
		var ai_player_id := _read_runtime_ai_player_id(runtime)
		var action_whitelist: Array = runtime.get("actionWhitelist", []) as Array
		for action_variant in action_whitelist.slice(0, min(action_whitelist.size(), 5)):
			var action_id := str(action_variant).strip_edges()
			if action_id == "":
				continue
			var catalog_entry: Dictionary = catalog_by_action.get(action_id, {}) as Dictionary
			var label := _format_ai_action_label(action_id)
			if label == action_id:
				label = str(catalog_entry.get("label", action_id)).strip_edges()
			var risk_level := str(catalog_entry.get("riskLevel", "unknown")).strip_edges()
			var mapped_world_action := str(catalog_entry.get("mappedWorldAction", "待接 rules")).strip_edges()
			cards.append({
				"title": label,
				"value": action_id,
				"meta": "%s / %s" % [risk_level, ai_player_id],
				"description": "后端动作：%s" % mapped_world_action,
				"tone": "green" if bool(catalog_entry.get("executableInV1", false)) else "neutral",
			})
	if not cards.is_empty():
		return cards.slice(0, min(cards.size(), 8))
	return [{
		"title": "候选动作",
		"value": "待刷新",
		"meta": "/api/ai/player-actions/catalog",
		"description": "刷新 AI 玩家后展示 actionWhitelist 与后端 catalog 的交集。",
		"tone": "neutral",
	}]

func _build_ai_development_action_cards(development_plan: Dictionary) -> Array:
	var actions: Array = development_plan.get("candidateActions", []) as Array
	var cards: Array = []
	for action_variant in actions.slice(0, min(actions.size(), 6)):
		if not (action_variant is Dictionary):
			continue
		var action: Dictionary = action_variant as Dictionary
		var action_id := str(action.get("action", "")).strip_edges()
		if action_id == "":
			continue
		var readiness := str(action.get("readiness", "unknown")).strip_edges()
		var blockers: Array = action.get("blockers", []) as Array
		var blocker_text := "可生成提案" if blockers.is_empty() else "阻塞：%s" % _join_string_array(blockers, "、")
		var target_summary := _format_ai_action_target_summary(action_id, action)
		var description := str(action.get("reason", ""))
		if target_summary != "":
			description = "%s。%s" % [target_summary, description]
		cards.append({
			"title": _format_ai_action_label(action_id),
			"value": readiness,
			"meta": "%s / %s" % [action_id, str(action.get("mappedWorldAction", "待接 authority"))],
			"description": "%s。%s" % [description, blocker_text],
			"tone": "green" if readiness == "ready" else "blue" if readiness == "needs_target" else "neutral",
		})
	if not cards.is_empty():
		return cards
	return [{
		"title": "发育主赛项",
		"value": "待刷新",
		"meta": "/development-plan",
		"description": "刷新 AI 玩家后展示移动、编队、采集等可执行主线动作。",
		"tone": "neutral",
	}]

func _build_ai_development_risk_cards(development_plan: Dictionary) -> Array:
	var risks: Array = development_plan.get("riskItems", []) as Array
	var cards: Array = []
	for risk_variant in risks.slice(0, min(risks.size(), 6)):
		if not (risk_variant is Dictionary):
			continue
		var risk: Dictionary = risk_variant as Dictionary
		var severity := str(risk.get("severity", "warning")).strip_edges()
		cards.append({
			"title": str(risk.get("title", risk.get("code", "风险项"))),
			"value": severity,
			"meta": str(risk.get("action", risk.get("code", ""))),
			"description": "%s 下一步：%s" % [
				str(risk.get("detail", "")),
				str(risk.get("nextStep", "")),
			],
			"tone": "blue" if severity == "warning" else "neutral",
		})
	if not cards.is_empty():
		return cards
	return [{
		"title": "风险项",
		"value": "暂无阻塞",
		"meta": "/development-plan",
		"description": "当前只读 planner 没有发现主赛项阻塞。",
		"tone": "green",
	}]

func _build_ai_battle_report_cards(battle_report_items: Array) -> Array:
	var cards: Array = []
	for report_variant in battle_report_items.slice(0, min(battle_report_items.size(), 2)):
		if not (report_variant is Dictionary):
			continue
		var report: Dictionary = report_variant as Dictionary
		var report_id := str(report.get("reportId", report.get("id", "战报"))).strip_edges()
		var tile_id := str(report.get("tileId", "未知地块")).strip_edges()
		var severity := str(report.get("severity", "unknown")).strip_edges()
		cards.append({
			"title": "战报 %s" % (report_id if report_id != "" else "latest"),
			"value": _format_ai_battle_report_outcome(report),
			"meta": "%s / %s" % [severity, tile_id if tile_id != "" else "未知地块"],
			"description": "战报：%s。损伤：%s。建议：%s" % [
				_format_ai_battle_report_perspective(report),
				_format_ai_battle_report_damage(report),
				str(report.get("nextStepSuggestion", "等待战报建议。")),
			],
			"tone": "gold" if severity == "high" else "blue" if severity == "medium" else "green",
		})
	if not cards.is_empty():
		return cards
	return [{
		"title": "最近战报",
		"value": "暂无",
		"meta": "没有新的损伤",
		"description": "刷新后会显示战报结果和下一步建议。",
		"tone": "neutral",
	}]

func _format_ai_battle_report_summary(battle_report_items: Array) -> String:
	if battle_report_items.is_empty() or not (battle_report_items[0] is Dictionary):
		return "暂无战报"
	var report: Dictionary = battle_report_items[0] as Dictionary
	return "%s / %s" % [
		_format_ai_battle_report_outcome(report),
		_format_ai_battle_report_perspective(report),
	]

func _format_ai_battle_report_damage_summary(battle_report_items: Array) -> String:
	if battle_report_items.is_empty() or not (battle_report_items[0] is Dictionary):
		return "暂无损伤"
	return _format_ai_battle_report_damage(battle_report_items[0] as Dictionary)

func _format_ai_battle_report_suggestion(battle_report_items: Array) -> String:
	if battle_report_items.is_empty() or not (battle_report_items[0] is Dictionary):
		return "暂无建议"
	var suggestion := str((battle_report_items[0] as Dictionary).get("nextStepSuggestion", "")).strip_edges()
	return suggestion if suggestion != "" else "等待后端战报建议。"

func _resolve_ai_battle_report_next_action(battle_report_items: Array) -> String:
	if battle_report_items.is_empty() or not (battle_report_items[0] is Dictionary):
		return "无"
	var report: Dictionary = battle_report_items[0] as Dictionary
	var suggestion := str(report.get("nextStepSuggestion", "")).strip_edges().to_lower()
	var outcome := str(report.get("outcome", "")).strip_edges()
	var severity := str(report.get("severity", "")).strip_edges()
	if outcome == "loss" or severity == "high" or suggestion.find("补兵") >= 0 or suggestion.find("heal") >= 0:
		return "troop_heal"
	if suggestion.find("tile_occupy") >= 0 or suggestion.find("占地") >= 0:
		return "tile_occupy"
	if suggestion.find("resource_gather") >= 0 or suggestion.find("采集") >= 0:
		return "resource_gather"
	return "march_move"

func _format_ai_battle_report_outcome(report: Dictionary) -> String:
	var outcome := str(report.get("outcome", "unknown")).strip_edges()
	match outcome:
		"win":
			return "胜利"
		"loss":
			return "失败"
		"draw":
			return "平局"
		_:
			return outcome if outcome != "" else "未知"

func _format_ai_battle_report_perspective(report: Dictionary) -> String:
	var perspective := str(report.get("perspective", "")).strip_edges()
	var unit_id := str(report.get("attackerUnitId", "")).strip_edges()
	var tile_id := str(report.get("tileId", "")).strip_edges()
	var perspective_label := "我方进攻" if perspective == "attacker" else "附近战斗" if perspective == "nearby" else "相关战斗"
	return "%s / 部队 %s / 地块 %s" % [
		perspective_label,
		unit_id if unit_id != "" else "未知",
		tile_id if tile_id != "" else "未知",
	]

func _format_ai_battle_report_damage(report: Dictionary) -> String:
	return "我方 %s / 敌方 %s" % [
		_format_optional_number(report.get("ownLoss", null)),
		_format_optional_number(report.get("enemyLoss", null)),
	]

func _format_optional_number(value: Variant) -> String:
	if value is int or value is float:
		return str(int(value))
	return "未知"

func _build_ai_context_document_cards(ai_player_runtimes: Array) -> Array:
	var cards: Array = []
	for runtime_variant in ai_player_runtimes.slice(0, min(ai_player_runtimes.size(), 2)):
		if not (runtime_variant is Dictionary):
			continue
		var runtime: Dictionary = runtime_variant as Dictionary
		var documents: Array = runtime.get("contextDocuments", []) as Array
		for document_variant in documents.slice(0, min(documents.size(), 4)):
			if not (document_variant is Dictionary):
				continue
			var document: Dictionary = document_variant as Dictionary
			var title := str(document.get("title", "未命名身份文件")).strip_edges()
			var kind := str(document.get("kind", "identity")).strip_edges()
			var source_file_name := str(document.get("sourceFileName", "")).strip_edges()
			var source_label := source_file_name if source_file_name != "" else "手动粘贴"
			cards.append({
				"title": title,
				"value": _format_context_document_kind(kind),
				"meta": source_label,
				"description": "这份内容会作为AI玩家身份、记忆或作战风格使用。",
				"tone": "blue",
			})
	if not cards.is_empty():
		return cards
	return [{
		"title": "身份文件",
		"value": "暂无",
		"meta": "txt / md / skll",
		"description": "可添加身份、记忆或 SKLL 文档，让AI玩家按你的设定说话和提建议。",
		"tone": "neutral",
	}]

func _build_governor_inbox_cards(governor_resource_inboxes: Dictionary) -> Array:
	var cards: Array = []
	for governor_id_variant in governor_resource_inboxes.keys():
		var governor_id := str(governor_id_variant).strip_edges()
		if governor_id == "":
			continue
		var inbox_variant: Variant = governor_resource_inboxes.get(governor_id, {})
		if not (inbox_variant is Dictionary):
			continue
		var inbox: Dictionary = inbox_variant as Dictionary
		var pending_transfers: Array = inbox.get("pendingTransfers", []) as Array
		var total_pending: Dictionary = inbox.get("totalPendingResources", {}) as Dictionary
		cards.append({
			"title": governor_id,
			"value": _format_resource_bundle(total_pending),
			"meta": "pending %s" % str(pending_transfers.size()),
			"description": _format_pending_transfer_ids(pending_transfers),
			"tone": "gold",
		})
	if not cards.is_empty():
		return cards
	return [{
		"title": "总督 inbox",
		"value": "暂无待领",
		"meta": "governorResourceInboxes",
		"description": "AI 资源输送成功后，这里会显示待领取转入。",
		"tone": "neutral",
	}]

func _build_ai_player_detail_lines(
	ai_player_runtimes: Array,
	receipt_items: Array,
	proposal_items: Array,
	resource_accounts: Dictionary,
	governor_resource_inboxes: Dictionary,
	development_plan: Dictionary,
	battle_report_items: Array,
	updated_at: String,
	error_text: String
) -> Array:
	var lines: Array = [
		"运行时玩家：%s" % str(ai_player_runtimes.size()),
		"模型：%s" % _format_ai_player_model_summary(ai_player_runtimes),
		"模型接入：%s" % _format_ai_player_model_access_summary(ai_player_runtimes),
		"secret configured：%s" % _format_ai_player_key_status(ai_player_runtimes),
		"失败原因：%s" % _format_ai_player_failure_summary(ai_player_runtimes, proposal_items, receipt_items, error_text),
		"提案：待处理 %s / 最近 %s" % [
			str(_count_actionable_ai_proposals(proposal_items)),
			_format_ai_player_latest_proposal(proposal_items),
		],
		"资源子账户：%s / %s" % [str(resource_accounts.size()), _format_ai_resource_accounts_summary(resource_accounts)],
		"总督 inbox：%s" % _format_governor_inbox_summary(governor_resource_inboxes),
		"发育目标：%s" % _format_ai_development_goal_summary(development_plan),
		"主赛项：ready %s / 风险 %s" % [
			str(_count_ai_development_ready_actions(development_plan)),
			_format_ai_development_risk_summary(development_plan),
		],
		"战报：%s" % _format_ai_battle_report_summary(battle_report_items),
		"损伤：%s" % _format_ai_battle_report_damage_summary(battle_report_items),
		"建议：%s" % _format_ai_battle_report_suggestion(battle_report_items),
		"刷新时间：%s" % updated_at,
	]
	if error_text.strip_edges() != "":
		lines.append("最近刷新错误：%s" % error_text.strip_edges())
	for runtime_variant in ai_player_runtimes.slice(0, min(ai_player_runtimes.size(), 3)):
		if not (runtime_variant is Dictionary):
			continue
		var runtime: Dictionary = runtime_variant as Dictionary
		var ai_player_id := _read_runtime_ai_player_id(runtime)
		var resource_transfer: Dictionary = runtime.get("resourceTransfer", {}) as Dictionary
		lines.append("AI %s：proposal %s / quota %s / cooldown %s / blocked %s" % [
			ai_player_id if ai_player_id != "" else "unknown",
			str((runtime.get("proposalStats", {}) as Dictionary).get("executedCount", 0)),
			str(resource_transfer.get("remainingQuotaTotal", "unknown")),
			str(resource_transfer.get("cooldownRemainingTicks", "unknown")),
			str(resource_transfer.get("blockedBy", "none")),
		])
	if receipt_items.is_empty():
		lines.append("receipt：暂无 /api/ai/players/:id/receipts 结果。")
	else:
		for receipt_variant in receipt_items.slice(0, min(receipt_items.size(), 3)):
			if receipt_variant is Dictionary:
				lines.append("receipt：%s" % _format_receipt_summary(receipt_variant as Dictionary))
	return lines

func _format_ai_action_label(action: String) -> String:
	match action:
		"resource_transfer_to_governor":
			return "输送资源给总督"
		"resource_gather":
			return "采集资源到 AI 子账户"
		"tile_occupy":
			return "占领地图目标地块"
		"troop_heal":
			return "整补部队"
		"march_move":
			return "行军到目标地"
		"battle_report_read":
			return "读取战报建议"
		"reward_claim":
			return "领取奖励"
		"formation_assign":
			return "调整部队编组"
		"recruit_commander":
			return "招募武将"
		"troop_train":
			return "征兵"
		_:
			return action if action != "" else "未标记动作"

func _format_ai_action_target_summary(action: String, payload: Dictionary) -> String:
	var args: Dictionary = payload.get("proposalArgs", payload.get("args", {})) as Dictionary
	var unit_id := str(payload.get("targetUnitId", args.get("unitId", ""))).strip_edges()
	var tile_id := str(payload.get("targetTileId", args.get("targetTileId", args.get("tileId", "")))).strip_edges()
	match action:
		"march_move":
			return "目标：部队 %s 行军到地图地块 %s，地图意图环会标出该目标" % [
				unit_id if unit_id != "" else "自动选择",
				tile_id if tile_id != "" else "待选择",
			]
		"tile_occupy":
			return "目标：部队 %s 占领地图地块 %s，成功后地块归属变为我方" % [
				unit_id if unit_id != "" else "自动选择",
				tile_id if tile_id != "" else "待选择",
			]
		"resource_gather":
			return "目标：部队 %s 采集资源地 %s，收益进入 AI 子账户" % [
				unit_id if unit_id != "" else "自动选择",
				tile_id if tile_id != "" else "待选择",
			]
		"troop_heal":
			return "目标：整补部队 %s，恢复兵力和补给后继续发育" % (unit_id if unit_id != "" else str(args.get("unitId", "自动选择受损部队")).strip_edges())
		_:
			if tile_id != "":
				return "目标：地图地块 %s" % tile_id
			if unit_id != "":
				return "目标：部队 %s" % unit_id
			return ""

func _read_runtime_ai_player_id(runtime: Dictionary) -> String:
	return str(runtime.get("aiPlayerId", runtime.get("id", ""))).strip_edges()

func _format_ai_player_latest_receipt(ai_player_runtimes: Array, receipt_items: Array) -> String:
	if not receipt_items.is_empty() and receipt_items[0] is Dictionary:
		return _format_receipt_summary(receipt_items[0] as Dictionary)
	for runtime_variant in ai_player_runtimes:
		if not (runtime_variant is Dictionary):
			continue
		var runtime: Dictionary = runtime_variant as Dictionary
		var latest_receipt: Dictionary = runtime.get("latestReceipt", {}) as Dictionary
		if not latest_receipt.is_empty():
			return _format_receipt_summary(latest_receipt)
	return "暂无回执"

func _format_ai_player_latest_proposal(proposal_items: Array) -> String:
	if proposal_items.is_empty() or not (proposal_items[0] is Dictionary):
		return "暂无提案"
	var proposal: Dictionary = proposal_items[0] as Dictionary
	var action := str(proposal.get("action", "unknown")).strip_edges()
	var status := str(proposal.get("status", "unknown")).strip_edges()
	return "%s / %s" % [
		_format_ai_action_label(action),
		_format_ai_proposal_status_label(status),
	]

func _count_actionable_ai_proposals(proposal_items: Array) -> int:
	var count := 0
	for proposal_variant in proposal_items:
		if not (proposal_variant is Dictionary):
			continue
		var proposal: Dictionary = proposal_variant as Dictionary
		var status := str(proposal.get("status", "")).strip_edges()
		if status == "pending_approval" or status == "approved":
			count += 1
	return count

func _count_candidate_actions(ai_player_runtimes: Array, action_catalog: Array) -> int:
	var catalog_actions := {}
	for catalog_variant in action_catalog:
		if catalog_variant is Dictionary:
			var catalog_entry: Dictionary = catalog_variant as Dictionary
			var catalog_action := str(catalog_entry.get("action", "")).strip_edges()
			if catalog_action != "":
				catalog_actions[catalog_action] = true
	var count := 0
	for runtime_variant in ai_player_runtimes:
		if not (runtime_variant is Dictionary):
			continue
		var runtime: Dictionary = runtime_variant as Dictionary
		var action_whitelist: Array = runtime.get("actionWhitelist", []) as Array
		for action_variant in action_whitelist:
			var action_id := str(action_variant).strip_edges()
			if action_id != "" and (catalog_actions.is_empty() or catalog_actions.has(action_id)):
				count += 1
	return count

func _count_ai_development_ready_actions(development_plan: Dictionary) -> int:
	var count := 0
	var actions: Array = development_plan.get("candidateActions", []) as Array
	for action_variant in actions:
		if action_variant is Dictionary and str((action_variant as Dictionary).get("readiness", "")).strip_edges() == "ready":
			count += 1
	return count

func _format_ai_development_goal_summary(development_plan: Dictionary) -> String:
	var goal: Dictionary = development_plan.get("goal", {}) as Dictionary
	if goal.is_empty():
		return "待刷新"
	var current_points := int(goal.get("currentDevelopmentPoints", 0))
	var target_points := int(goal.get("targetDevelopmentPoints", 4000))
	var remaining_points := int(goal.get("remainingDevelopmentPoints", max(0, target_points - current_points)))
	return "%s / %s，差 %s" % [str(current_points), str(target_points), str(remaining_points)]

func _format_ai_development_risk_summary(development_plan: Dictionary) -> String:
	var risks: Array = development_plan.get("riskItems", []) as Array
	if risks.is_empty():
		return "暂无"
	var blocker_count := 0
	var warning_count := 0
	for risk_variant in risks:
		if not (risk_variant is Dictionary):
			continue
		var severity := str((risk_variant as Dictionary).get("severity", "")).strip_edges()
		if severity == "blocker":
			blocker_count += 1
		elif severity == "warning":
			warning_count += 1
	return "阻塞 %s / 警告 %s" % [str(blocker_count), str(warning_count)]

func _count_ai_context_documents(ai_player_runtimes: Array) -> int:
	var count := 0
	for runtime_variant in ai_player_runtimes:
		if not (runtime_variant is Dictionary):
			continue
		var runtime: Dictionary = runtime_variant as Dictionary
		var documents: Array = runtime.get("contextDocuments", []) as Array
		count += documents.size()
	return count

func _format_ai_context_document_summary(ai_player_runtimes: Array) -> String:
	var titles: Array[String] = []
	for runtime_variant in ai_player_runtimes:
		if not (runtime_variant is Dictionary):
			continue
		var runtime: Dictionary = runtime_variant as Dictionary
		var documents: Array = runtime.get("contextDocuments", []) as Array
		for document_variant in documents:
			if not (document_variant is Dictionary):
				continue
			var document: Dictionary = document_variant as Dictionary
			var title := str(document.get("title", "")).strip_edges()
			if title != "":
				titles.append(title)
			if titles.size() >= 2:
				break
		if titles.size() >= 2:
			break
	if titles.is_empty():
		return "暂未添加"
	return "、".join(titles)

func _format_context_document_kind(kind: String) -> String:
	match kind:
		"identity":
			return "身份"
		"memory":
			return "记忆"
		"skill":
			return "SKLL"
		"image":
			return "图片"
		"instruction":
			return "指令"
		_:
			return kind if kind != "" else "身份"

func _read_primary_ai_player_runtime(ai_player_runtimes: Array) -> Dictionary:
	if ai_player_runtimes.is_empty() or not (ai_player_runtimes[0] is Dictionary):
		return {}
	return ai_player_runtimes[0] as Dictionary

func _read_runtime_model_status(runtime: Dictionary) -> Dictionary:
	var model_status_value: Variant = runtime.get("modelStatus", {})
	if model_status_value is Dictionary:
		return model_status_value as Dictionary
	return {}

func _read_model_status_text(model_status: Dictionary, keys: Array, fallback_text: String) -> String:
	for key_variant in keys:
		var key := str(key_variant).strip_edges()
		if key == "" or not model_status.has(key):
			continue
		var value_text := str(model_status.get(key, "")).strip_edges()
		if value_text != "":
			return value_text
	return fallback_text

func _format_ai_player_model_name(ai_player_runtimes: Array) -> String:
	var runtime := _read_primary_ai_player_runtime(ai_player_runtimes)
	if runtime.is_empty():
		return "等待后端字段"
	return _format_single_runtime_model_name(runtime)

func _format_single_runtime_model_name(runtime: Dictionary) -> String:
	var model_status := _read_runtime_model_status(runtime)
	if model_status.is_empty():
		return "等待后端字段"
	var model_name := _read_model_status_text(model_status, ["activeModel", "modelName", "model", "targetModel"], "")
	return model_name if model_name != "" else "等待后端字段"

func _format_ai_model_name_for_player(model_name: String) -> String:
	var normalized := model_name.strip_edges()
	if normalized == "" or normalized == "等待后端字段":
		return "等待模型"
	var slash_index := normalized.rfind("/")
	if slash_index >= 0 and slash_index < normalized.length() - 1:
		normalized = normalized.substr(slash_index + 1)
	var colon_index := normalized.find(":")
	if colon_index > 0:
		normalized = normalized.substr(0, colon_index)
	normalized = normalized.replace("_", " ").replace("-", " ")
	var words: Array[String] = []
	for word_variant in normalized.split(" ", false):
		var word := str(word_variant).strip_edges()
		if word == "":
			continue
		var lower_word := word.to_lower()
		match lower_word:
			"ai":
				words.append("AI")
			"120b":
				words.append("120B")
			"a12b":
				words.append("A12B")
			"4":
				words.append("4")
			_:
				words.append(word.capitalize())
	return " ".join(words)

func _format_ai_player_model_source_label(ai_player_runtimes: Array) -> String:
	var runtime := _read_primary_ai_player_runtime(ai_player_runtimes)
	if runtime.is_empty():
		return "等待后端字段"
	return _format_single_runtime_model_source_label(runtime)

func _format_single_runtime_model_source_label(runtime: Dictionary) -> String:
	var model_status := _read_runtime_model_status(runtime)
	if model_status.is_empty():
		return "等待后端字段"
	var source := _read_model_status_text(model_status, ["source", "modelSource", "activeProvider", "provider", "providerId"], "")
	match source:
		"default":
			return "默认接入"
		"env":
			return "系统接入"
		"faction_config":
			return "势力接入"
		"player_config":
			return "玩家接入"
		"fallback":
			return "备用接入"
		"":
			return "等待后端字段"
		_:
			return "系统接入"

func _format_ai_player_key_status(ai_player_runtimes: Array) -> String:
	var runtime := _read_primary_ai_player_runtime(ai_player_runtimes)
	if runtime.is_empty():
		return "等待后端字段"
	return _format_single_runtime_model_secret_status(runtime)

func _format_single_runtime_model_secret_status(runtime: Dictionary) -> String:
	var model_status := _read_runtime_model_status(runtime)
	if model_status.is_empty():
		return "等待后端字段"
	for key_variant in ["secretConfigured", "hasSecret", "hasApiKey"]:
		var key := str(key_variant)
		if model_status.has(key):
			return "已配置" if bool(model_status.get(key, false)) else "未配置"
	return "等待后端字段"

func _format_ai_player_model_fallback_status(ai_player_runtimes: Array) -> String:
	var runtime := _read_primary_ai_player_runtime(ai_player_runtimes)
	if runtime.is_empty():
		return "等待后端字段"
	return _format_single_runtime_model_fallback_status(runtime)

func _format_ai_player_model_fallback_short(ai_player_runtimes: Array) -> String:
	var status := _format_ai_player_model_fallback_status(ai_player_runtimes)
	if status.begins_with("已启用"):
		return "已开启"
	if status == "未触发":
		return "待命"
	if status == "等待后端字段":
		return "等待状态"
	return status

func _format_single_runtime_model_fallback_status(runtime: Dictionary) -> String:
	var model_status := _read_runtime_model_status(runtime)
	if model_status.is_empty():
		return "等待后端字段"
	if model_status.has("fallbackEnabled"):
		if bool(model_status.get("fallbackEnabled", false)):
			var fallback_model := str(model_status.get("fallbackModel", "")).strip_edges()
			return "已启用 %s" % (fallback_model if fallback_model != "" and fallback_model != "<null>" else "备用模型")
		var last_reason := str(model_status.get("lastFallbackReason", "")).strip_edges()
		return "未触发" if last_reason == "" or last_reason == "<null>" else "未触发，上次失败 %s" % last_reason
	for key_variant in ["fallbackStatus", "fallbackState", "fallback", "fallbackActive"]:
		var key := str(key_variant)
		if not model_status.has(key):
			continue
		var value: Variant = model_status.get(key)
		if value is bool:
			return "已启用" if bool(value) else "未触发"
		var status := str(value).strip_edges()
		match status:
			"active", "enabled", "fallback":
				return "已启用"
			"inactive", "none", "disabled", "off":
				return "未触发"
			"":
				continue
			_:
				return status
	return "等待后端字段"

func _format_runtime_status_label(status: String) -> String:
	match status:
		"active":
			return "在线"
		"paused":
			return "暂停"
		"disabled":
			return "停用"
		"":
			return "待刷新"
		_:
			return status

func _format_ai_player_budget_summary(ai_player_runtimes: Array, resource_accounts: Dictionary, governor_resource_inboxes: Dictionary, execution_budget_summary: String) -> String:
	var transfer_budget := _format_primary_transfer_budget(ai_player_runtimes)
	var pending_transfer_count := _count_pending_governor_transfers(governor_resource_inboxes)
	return "%s；输送 %s；子账户 %s；待领 %s" % [
		_format_execution_budget_player_text(execution_budget_summary),
		transfer_budget,
		_format_ai_resource_accounts_summary(resource_accounts),
		str(pending_transfer_count),
	]

func _format_execution_budget_player_text(execution_budget_summary: String) -> String:
	var normalized := execution_budget_summary.strip_edges()
	if normalized == "" or normalized == "AP unknown / food unknown":
		return "行动点等待后端刷新"
	return normalized.replace("AP", "行动点").replace("Food", "粮草").replace("food", "粮草").replace("unknown", "待刷新")

func _format_primary_transfer_budget(ai_player_runtimes: Array) -> String:
	if ai_player_runtimes.is_empty() or not (ai_player_runtimes[0] is Dictionary):
		return "等待后端字段"
	var runtime: Dictionary = ai_player_runtimes[0] as Dictionary
	var resource_transfer: Dictionary = runtime.get("resourceTransfer", {}) as Dictionary
	if resource_transfer.is_empty():
		return "等待后端字段"
	var remaining := str(resource_transfer.get("remainingQuotaTotal", "")).strip_edges()
	var cooldown := str(resource_transfer.get("cooldownRemainingTicks", "")).strip_edges()
	var blocked_by := str(resource_transfer.get("blockedBy", "")).strip_edges()
	var can_transfer := bool(resource_transfer.get("canTransferNow", false))
	if can_transfer:
		return "可输送，剩余额度 %s" % (remaining if remaining != "" else "待刷新")
	if blocked_by != "":
		return "%s，冷却 %s 回合" % [_format_failure_to_player_text(blocked_by), cooldown if cooldown != "" else "待刷新"]
	return "暂不可输送，剩余额度 %s" % (remaining if remaining != "" else "待刷新")

func _format_model_budget_text(ai_player_runtimes: Array) -> String:
	var runtime := _read_primary_ai_player_runtime(ai_player_runtimes)
	if runtime.is_empty():
		return "等待后端字段"
	return _format_single_runtime_model_budget_text(runtime)

func _format_single_runtime_model_budget_text(runtime: Dictionary) -> String:
	var model_status := _read_runtime_model_status(runtime)
	if model_status.is_empty():
		return "等待后端字段"
	var budget_tier := _read_model_status_text(model_status, ["budgetTier", "budget", "budgetClass"], "")
	if budget_tier == "":
		return "等待后端字段"
	match budget_tier:
		"strict_action":
			return "行动预算"
		"economy_chat":
			return "聊天预算"
		"disabled":
			return "预算关闭"
		_:
			return budget_tier

func _format_pending_transfer_budget(governor_resource_inboxes: Dictionary) -> String:
	var pending_count := _count_pending_governor_transfers(governor_resource_inboxes)
	if pending_count <= 0:
		return "暂无待领取转入"
	return "待领取转入 %s 笔" % str(pending_count)

func _format_action_readiness_label(readiness: String) -> String:
	match readiness:
		"ready":
			return "可批准"
		"needs_target":
			return "需要玩家选目标"
		"blocked":
			return "暂不可用"
		"":
			return "待刷新"
		_:
			return readiness

func _format_ai_action_player_reason(action: String, raw_reason: String) -> String:
	match action:
		"resource_transfer_to_governor":
			return "把可用资源交给总督，方便统一调度。"
		"resource_gather":
			return "先补充资源，为后续扩张做准备。"
		"tile_occupy":
			return "扩大控制范围，为部队争取更好的发育位置。"
		"troop_heal":
			return "恢复受损部队，避免继续行动时战损扩大。"
		"march_move":
			return "把部队移动到更合适的位置。"
		"battle_report_read":
			return "先读取战报，再决定补兵、行军或占地。"
		_:
			var reason := raw_reason.strip_edges()
			return reason if reason != "" and reason.length() < 36 else "根据当前局势给出的建议。"

func _format_ai_player_blockers(blockers: Array) -> String:
	var labels: Array[String] = []
	for blocker_variant in blockers.slice(0, min(blockers.size(), 3)):
		var blocker := str(blocker_variant).strip_edges()
		if blocker == "":
			continue
		labels.append(_format_ai_player_blocker_label(blocker))
	return "、".join(labels) if not labels.is_empty() else "等待条件满足"

func _format_ai_player_blocker_label(blocker: String) -> String:
	match blocker:
		"no_assigned_unit":
			return "没有可派出的部队"
		"action_not_whitelisted":
			return "该行动尚未开放"
		"missing_target", "target_required", "no_target_tile":
			return "需要先选目标"
		"insufficient_resource", "insufficient_resources":
			return "资源不足"
		"action_points_insufficient", "insufficient_action_points":
			return "行动点不足"
		"cooldown_active", "transfer_cooldown_active":
			return "仍在冷却"
		_:
			return "条件未满足"

func _format_ai_risk_label(risk_level: String) -> String:
	match risk_level.strip_edges():
		"low":
			return "低风险"
		"medium":
			return "中风险"
		"high":
			return "高风险"
		"unknown", "":
			return "风险待评估"
		_:
			return "风险待评估"

func _format_ai_action_approval_result(action: String) -> String:
	match action:
		"resource_transfer_to_governor":
			return "资源进入总督待领取转入"
		"resource_gather":
			return "资源进入 AI 子账户"
		"tile_occupy":
			return "目标地块改为我方控制"
		"troop_heal":
			return "部队恢复兵力和补给"
		"march_move":
			return "部队移动到目标地块"
		"battle_report_read":
			return "刷新战报建议"
		"reward_claim":
			return "领取奖励"
		"formation_assign":
			return "更新部队编组"
		"recruit_commander":
			return "发起武将招募"
		"troop_train":
			return "补充兵力"
		_:
			return "交给后端正式动作链处理"

func _format_failure_to_player_text(failure: String) -> String:
	var normalized := failure.strip_edges()
	match normalized:
		"", "none", "暂无失败":
			return "暂无失败"
		"approval_required":
			return "需要玩家批准"
		"transfer_cooldown_active":
			return "资源输送还在冷却"
		"daily_quota_exceeded":
			return "今日资源输送额度已用完"
		"insufficient_resource", "insufficient_resources":
			return "资源不足"
		"unit_already_full":
			return "部队已经满状态"
		"action_points_insufficient", "insufficient_action_points":
			return "行动点不足"
		"missing_target", "target_required":
			return "需要先选择目标"
		"invalid_target":
			return "目标不符合执行条件"
		"no_assigned_unit":
			return "没有可派出的部队"
		"action_not_whitelisted":
			return "该行动尚未开放"
		_:
			return normalized

func _format_ai_player_next_step_summary(development_plan: Dictionary, battle_report_items: Array, failure_summary: String) -> String:
	var failure_text := _format_failure_to_player_text(failure_summary)
	if failure_text == "需要玩家批准":
		return "审批待处理提案"
	if failure_text == "行动点不足" or failure_text == "资源不足":
		return "先恢复预算或选择低成本动作"
	if failure_text == "资源输送还在冷却":
		return "等待冷却后再输送资源"
	var actions: Array = development_plan.get("candidateActions", []) as Array
	for action_variant in actions:
		if not (action_variant is Dictionary):
			continue
		var action: Dictionary = action_variant as Dictionary
		if str(action.get("readiness", "")).strip_edges() != "ready":
			continue
		var action_id := str(action.get("action", "")).strip_edges()
		if action_id != "":
			return "优先批准：%s" % _format_ai_action_label(action_id)
	var battle_suggestion := _format_ai_battle_report_suggestion(battle_report_items)
	if battle_suggestion != "暂无建议" and battle_suggestion != "等待后端战报建议。":
		return battle_suggestion
	if development_plan.is_empty():
		return "刷新 AI 玩家，等待后端 planner 字段"
	return "查看风险项并选择下一条可执行动作"

func _format_ai_proposal_status_label(status: String) -> String:
	match status.strip_edges():
		"pending_approval":
			return "待审批"
		"approved":
			return "已批准"
		"executed":
			return "已执行"
		"rejected":
			return "未通过"
		"failed":
			return "执行失败"
		"":
			return "待刷新"
		_:
			return status

func _format_ai_player_model_summary(ai_player_runtimes: Array) -> String:
	return "%s / %s / %s / 密钥%s / 备用%s" % [
		_format_ai_model_name_for_player(_format_ai_player_model_name(ai_player_runtimes)),
		_format_ai_player_model_source_label(ai_player_runtimes),
		_format_model_budget_text(ai_player_runtimes),
		_format_ai_player_key_status(ai_player_runtimes),
		_format_ai_player_model_fallback_short(ai_player_runtimes),
	]

func _format_ai_player_model_access_summary(ai_player_runtimes: Array) -> String:
	return _format_ai_player_model_summary(ai_player_runtimes)

func _format_ai_player_failure_summary(ai_player_runtimes: Array, proposal_items: Array, receipt_items: Array, error_text: String) -> String:
	var normalized_error := error_text.strip_edges()
	if normalized_error != "":
		return normalized_error
	for proposal_variant in proposal_items:
		if proposal_variant is Dictionary:
			var proposal: Dictionary = proposal_variant as Dictionary
			var rejection_reason := str(proposal.get("rejectionReason", "")).strip_edges()
			if rejection_reason != "":
				return rejection_reason
	for receipt_variant in receipt_items:
		if receipt_variant is Dictionary:
			var receipt: Dictionary = receipt_variant as Dictionary
			var failure_code := str(receipt.get("failureCode", "")).strip_edges()
			if failure_code != "":
				return failure_code
	for runtime_variant in ai_player_runtimes:
		if not (runtime_variant is Dictionary):
			continue
		var runtime: Dictionary = runtime_variant as Dictionary
		var latest_receipt: Dictionary = runtime.get("latestReceipt", {}) as Dictionary
		var receipt_failure := str(latest_receipt.get("failureCode", "")).strip_edges()
		if receipt_failure != "":
			return receipt_failure
		var observability: Dictionary = runtime.get("observability", {}) as Dictionary
		var last_failure: Dictionary = observability.get("lastFailure", {}) as Dictionary
		var observed_failure := str(last_failure.get("failureCode", last_failure.get("message", ""))).strip_edges()
		if observed_failure != "":
			return observed_failure
	return "暂无失败"

func _format_receipt_summary(receipt: Dictionary) -> String:
	if receipt.is_empty():
		return "receipt none"
	var world_action := str(receipt.get("worldAction", receipt.get("source_action", "none"))).strip_edges()
	var ok_text := "ok" if bool(receipt.get("ok", receipt.get("success", false))) else "failed"
	var failure_code := str(receipt.get("failureCode", receipt.get("failure_code", ""))).strip_edges()
	if failure_code == "":
		failure_code = "none"
	return "%s / %s / %s" % [world_action if world_action != "" else "none", ok_text, failure_code]

func _format_ai_resource_accounts_summary(resource_accounts: Dictionary) -> String:
	if resource_accounts.is_empty():
		return "暂无资源子账户"
	var summaries: Array[String] = []
	for ai_player_id_variant in resource_accounts.keys():
		var ai_player_id := str(ai_player_id_variant).strip_edges()
		var account_variant: Variant = resource_accounts.get(ai_player_id, {})
		if not (account_variant is Dictionary):
			continue
		var account: Dictionary = account_variant as Dictionary
		summaries.append("%s %s" % [ai_player_id, _format_resource_bundle(account.get("resources", {}) as Dictionary)])
	return " | ".join(summaries.slice(0, min(summaries.size(), 2))) if not summaries.is_empty() else "暂无资源子账户"

func _format_governor_inbox_summary(governor_resource_inboxes: Dictionary) -> String:
	var pending_count := _count_pending_governor_transfers(governor_resource_inboxes)
	if pending_count <= 0:
		return "暂无待领"
	for governor_id_variant in governor_resource_inboxes.keys():
		var governor_id := str(governor_id_variant).strip_edges()
		var inbox_variant: Variant = governor_resource_inboxes.get(governor_id, {})
		if not (inbox_variant is Dictionary):
			continue
		var inbox: Dictionary = inbox_variant as Dictionary
		var pending: Array = inbox.get("pendingTransfers", []) as Array
		if pending.is_empty():
			continue
		return "%s pending %s / %s" % [
			governor_id,
			str(pending.size()),
			_format_resource_bundle(inbox.get("totalPendingResources", {}) as Dictionary),
		]
	return "pending %s" % str(pending_count)

func _count_pending_governor_transfers(governor_resource_inboxes: Dictionary) -> int:
	var count := 0
	for inbox_variant in governor_resource_inboxes.values():
		if not (inbox_variant is Dictionary):
			continue
		var inbox: Dictionary = inbox_variant as Dictionary
		var pending: Array = inbox.get("pendingTransfers", []) as Array
		count += pending.size()
	return count

func _format_resource_bundle(resources: Dictionary) -> String:
	if resources.is_empty():
		return "粮草 0 / 木材 0 / 石料 0 / 铁矿 0"
	return "粮草 %s / 木材 %s / 石料 %s / 铁矿 %s" % [
		str(int(resources.get("food", 0))),
		str(int(resources.get("wood", 0))),
		str(int(resources.get("stone", 0))),
		str(int(resources.get("iron", 0))),
	]

func _format_pending_transfer_ids(pending_transfers: Array) -> String:
	if pending_transfers.is_empty():
		return "暂无待领转入。"
	var ids: Array[String] = []
	for transfer_variant in pending_transfers.slice(0, min(pending_transfers.size(), 3)):
		if not (transfer_variant is Dictionary):
			continue
		var transfer: Dictionary = transfer_variant as Dictionary
		var transfer_id := str(transfer.get("id", "")).strip_edges()
		if transfer_id != "":
			ids.append(transfer_id)
	return "待领：%s" % ", ".join(ids) if not ids.is_empty() else "存在待领转入。"

func _resolve_agenda_options(agenda: Dictionary) -> Array:
	var options: Array = agenda.get("options", []) as Array
	if not options.is_empty():
		return _normalize_agenda_options(options, agenda.get("recommendedFollowups", []) as Array)
	var candidates: Array = agenda.get("candidates", []) as Array
	var fallback_followups: Array = agenda.get("recommendedFollowups", []) as Array
	var fallback_options: Array = []
	for candidate_variant in candidates:
		if not (candidate_variant is Dictionary):
			continue
		var candidate: Dictionary = candidate_variant as Dictionary
		var supporting_ai_player_ids: Array = candidate.get("supportingAiPlayerIds", []) as Array
		fallback_options.append({
			"actionId": str(candidate.get("actionId", "")).strip_edges(),
			"intent": str(candidate.get("intent", candidate.get("actionId", ""))).strip_edges(),
			"label": str(candidate.get("summary", "")).strip_edges(),
			"summary": str(candidate.get("summary", "")).strip_edges(),
			"priority": str(candidate.get("priority", "P2")).strip_edges(),
			"targetTileId": str(candidate.get("targetTileId", "")).strip_edges(),
			"targetUnitIds": candidate.get("targetUnitIds", []) as Array,
			"supportingAiPlayerIds": supporting_ai_player_ids,
			"evidenceRefs": candidate.get("evidenceRefs", []) as Array,
			"supportCount": supporting_ai_player_ids.size(),
			"recommendedFollowups": candidate.get("recommendedFollowups", fallback_followups) as Array,
		})
	return fallback_options

func _normalize_agenda_options(options: Array, fallback_followups: Array) -> Array:
	var normalized_options: Array = []
	for option_variant in options:
		if not (option_variant is Dictionary):
			continue
		var option: Dictionary = option_variant as Dictionary
		var supporting_ai_player_ids: Array = option.get("supportingAiPlayerIds", []) as Array
		normalized_options.append({
			"actionId": str(option.get("actionId", "")).strip_edges(),
			"intent": str(option.get("intent", option.get("actionId", ""))).strip_edges(),
			"label": str(option.get("label", option.get("summary", ""))).strip_edges(),
			"summary": str(option.get("summary", option.get("label", ""))).strip_edges(),
			"priority": str(option.get("priority", "P2")).strip_edges(),
			"targetTileId": str(option.get("targetTileId", "")).strip_edges(),
			"targetUnitIds": option.get("targetUnitIds", []) as Array,
			"supportingAiPlayerIds": supporting_ai_player_ids,
			"evidenceRefs": option.get("evidenceRefs", []) as Array,
			"supportCount": int(option.get("supportCount", supporting_ai_player_ids.size())),
			"recommendedFollowups": option.get("recommendedFollowups", fallback_followups) as Array,
		})
	return normalized_options

func _agenda_option_detail(agenda_options: Array) -> String:
	if agenda_options.is_empty() or not (agenda_options[0] is Dictionary):
		return "暂无"
	var option: Dictionary = agenda_options[0] as Dictionary
	var label_text := str(option.get("label", option.get("summary", "未命名"))).strip_edges()
	var priority := str(option.get("priority", "P2")).strip_edges()
	var support_count := int(option.get("supportCount", 0))
	var target_tile_id := str(option.get("targetTileId", "")).strip_edges()
	var summary := str(option.get("summary", label_text)).strip_edges()
	var target_suffix := " / %s" % target_tile_id if target_tile_id != "" else ""
	var summary_suffix := " / %s" % summary if summary != "" else ""
	return "%s / %s / %s票%s%s" % [
		label_text if label_text != "" else "未命名",
		priority,
		str(support_count),
		target_suffix,
		summary_suffix,
	]

func _join_target_units(target_unit_ids: Array) -> String:
	if target_unit_ids.is_empty():
		return "未定位"
	return ",".join(target_unit_ids.slice(0, min(target_unit_ids.size(), 3)))

func _join_string_array(items: Array, separator: String = ",") -> String:
	var normalized: Array[String] = []
	for item in items:
		var text := str(item).strip_edges()
		if text != "":
			normalized.append(text)
	return separator.join(normalized)

func _resolve_primary_agenda_target_unit_id(agenda: Dictionary) -> String:
	var target_unit_ids: Array = agenda.get("targetUnitIds", []) as Array
	var direct_target := _first_target_unit_id(target_unit_ids)
	if direct_target != "":
		return direct_target
	var agenda_options: Array = _resolve_agenda_options(agenda)
	for option_variant in agenda_options:
		if not (option_variant is Dictionary):
			continue
		var option: Dictionary = option_variant as Dictionary
		var option_target := _first_target_unit_id(option.get("targetUnitIds", []) as Array)
		if option_target != "":
			return option_target
	return ""


func _first_target_unit_id(target_unit_ids: Array) -> String:
	for target_unit_id in target_unit_ids:
		var normalized_target_unit_id := str(target_unit_id).strip_edges()
		if normalized_target_unit_id != "":
			return normalized_target_unit_id
	return ""

func _resolve_agenda_link_hint(agenda: Dictionary, target_unit_id: String) -> String:
	var source := str(agenda.get("source", "")).strip_edges()
	if source == "authoritative_action":
		return "执行后建议先复核部队和同盟协同。"
	if target_unit_id != "":
		return "先看部队 %s，再按需要跳同盟 / 内政。" % target_unit_id
	return "先看内政 affairs，再根据议程摘要判断是否转同盟。"

func _build_runtime_receipt_lines(runtime_context: Dictionary) -> Array:
	var last_action := str(runtime_context.get("last_action", "none")).strip_edges()
	var last_status := str(runtime_context.get("last_action_status", "idle")).strip_edges()
	var last_tick := str(runtime_context.get("last_action_tick", "unknown")).strip_edges()
	var action_receipt := WorldStore.get_ai_action_receipt(_target_faction_id)
	var lines := [
		"最近回执：%s / %s" % [_format_runtime_action_for_player(last_action), _format_runtime_status_for_player(last_status)],
		"回执 tick：%s" % (last_tick if last_tick != "" else "unknown"),
	]
	var request_id := _resolve_execution_request_id(
		WorldStore.get_resolved_ai_agenda(_target_faction_id),
		WorldStore.get_resolved_ai_execution(_target_faction_id),
		action_receipt
	)
	if request_id != "尚未提交":
		lines.append("执行请求：%s" % request_id)
	var failure_code := _resolve_failure_code(action_receipt)
	if failure_code != "none":
		lines.append("失败码：%s" % failure_code)
	var receipt_message := _resolve_receipt_message(action_receipt)
	if receipt_message != "none":
		lines.append("回执说明：%s" % receipt_message)
	return lines

func _format_runtime_action_for_player(action_id: String) -> String:
	var normalized := action_id.strip_edges()
	if normalized == "" or normalized == "none":
		return "暂无行动"
	if normalized.contains("ai_players_refresh"):
		return "刷新AI玩家状态"
	if normalized.contains("ai_player_model_proposal_create"):
		return "请AI玩家出主意"
	if normalized.contains("ai_player_transfer_proposal_create"):
		return "安排资源转入"
	if normalized.contains("battle_report"):
		return "处理战报建议"
	if normalized.contains("/"):
		var parts := normalized.split("/", false)
		if not parts.is_empty():
			return _format_runtime_action_for_player(str(parts[parts.size() - 1]))
	return normalized

func _format_runtime_status_for_player(status: String) -> String:
	var normalized := status.strip_edges()
	match normalized:
		"", "idle":
			return "待命"
		"refreshed", "updated", "selected":
			return "已完成"
		"rejected", "failed":
			return "未完成"
		_:
			return normalized

func _resolve_execution_request_id(agenda: Dictionary, execution_state: Dictionary, action_receipt: Dictionary) -> String:
	var request_id := str(action_receipt.get("request_id", "")).strip_edges()
	if request_id == "":
		request_id = str(execution_state.get("requestId", "")).strip_edges()
	if request_id == "":
		request_id = str(agenda.get("executionRequestId", "")).strip_edges()
	return request_id if request_id != "" else "尚未提交"

func _resolve_execution_status(execution_state: Dictionary, action_receipt: Dictionary) -> String:
	var execution_status := str(execution_state.get("status", "")).strip_edges()
	if execution_status == "":
		execution_status = str(action_receipt.get("execution_status", "")).strip_edges()
	return execution_status if execution_status != "" else "idle"

func _format_execution_queue_summary(execution_state: Dictionary) -> String:
	return "active %s / queued %s / running %s" % [
		str(int(execution_state.get("activeOrderCount", 0))),
		str(int(execution_state.get("queuedOrderCount", 0))),
		str(int(execution_state.get("runningOrderCount", 0))),
	]

func _format_execution_budget_summary(execution_state: Dictionary) -> String:
	var action_points: Variant = execution_state.get("actionPointsRemaining", null)
	var food_remaining: Variant = execution_state.get("foodRemaining", null)
	var action_points_label := "unknown"
	var food_label := "unknown"
	if action_points is int or action_points is float:
		action_points_label = str(int(action_points))
	if food_remaining is int or food_remaining is float:
		food_label = str(int(food_remaining))
	return "AP %s / Food %s" % [action_points_label, food_label]

func _resolve_failure_code(action_receipt: Dictionary) -> String:
	var failure_code := str(action_receipt.get("failure_code", "")).strip_edges()
	return failure_code if failure_code != "" else "none"

func _resolve_receipt_message(action_receipt: Dictionary) -> String:
	var receipt_message := str(action_receipt.get("message", "")).strip_edges()
	return receipt_message if receipt_message != "" else "none"

func _autonomy_status(current_level: String, candidate_level: String) -> String:
	return "当前选择" if current_level == candidate_level else "可切换"

func _focus_status(current_focus_id: String, candidate_focus_id: String) -> String:
	return "当前焦点" if current_focus_id == candidate_focus_id else "可切换"

func _focus_label(focus_id: String) -> String:
	match focus_id:
		"focus_troop":
			return "部队压力"
		"focus_alliance":
			return "同盟协作"
		_:
			return "主城态势"


func _format_context_related_id(context_focus_id: String, context_related_id: String) -> String:
	var normalized_related_id := context_related_id.strip_edges()
	if normalized_related_id == "":
		return "未定位"
	if context_focus_id == "focus_alliance":
		var alliance_name := str((_world_data.get("alliance", {}) as Dictionary).get("name", "")).strip_edges()
		var region_name := _read_region_name(normalized_related_id)
		if region_name != "":
			return "%s / %s" % [region_name, normalized_related_id]
		if alliance_name != "":
			return "%s / %s" % [alliance_name, normalized_related_id]
	return normalized_related_id


func _read_region_name(region_id: String) -> String:
	var map_data: Dictionary = _world_data.get("map", {}) as Dictionary
	var regions: Array = map_data.get("regions", []) as Array
	for region_variant in regions:
		if not (region_variant is Dictionary):
			continue
		var region: Dictionary = region_variant as Dictionary
		if str(region.get("id", "")).strip_edges() == region_id.strip_edges():
			return str(region.get("name", "")).strip_edges()
	return ""


func _read_target_faction_state() -> Dictionary:
	var raw_factions: Variant = _world_data.get("factions", {})
	if raw_factions is Dictionary and _target_faction_id != "":
		var faction_state: Variant = (raw_factions as Dictionary).get(_target_faction_id, {})
		if faction_state is Dictionary:
			return faction_state
	return {}
