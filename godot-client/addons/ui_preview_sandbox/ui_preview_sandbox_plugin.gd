@tool
extends EditorPlugin

const DOCK_TITLE := "UI Preview"

var _dock: UIPreviewSandboxDock


func _enter_tree() -> void:
	_dock = UIPreviewSandboxDock.new()
	_dock.name = DOCK_TITLE
	_dock.set_editor_interface(get_editor_interface())
	add_control_to_dock(DOCK_SLOT_RIGHT_UL, _dock)
	print("[ui-preview-sandbox-plugin] loaded")


func _exit_tree() -> void:
	if _dock != null:
		remove_control_from_docks(_dock)
		_dock.queue_free()
		_dock = null
