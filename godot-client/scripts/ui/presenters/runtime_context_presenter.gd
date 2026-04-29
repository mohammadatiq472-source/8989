extends RefCounted
class_name RuntimeContextPresenter

func build_panel_context(
	runtime_seat_count: int,
	runtime_online_seat_count: int,
	autonomy_level: String,
	control_mode: String,
	session_id: String,
	last_action: String,
	last_action_status: String,
	last_action_tick: String,
	action_receipt: Dictionary = {}
) -> Dictionary:
	return {
		"seat_count": runtime_seat_count,
		"online_seat_count": runtime_online_seat_count,
		"autonomy_level": autonomy_level,
		"control_mode": control_mode,
		"session_id": session_id,
		"last_action": last_action,
		"last_action_status": last_action_status,
		"last_action_tick": last_action_tick,
		"action_receipt": action_receipt.duplicate(true),
	}
