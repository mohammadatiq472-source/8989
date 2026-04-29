extends SceneTree

const SANDBOX_SCENE_PATH := "res://scenes/dev/ui_preview_sandbox.tscn"


func _initialize() -> void:
	var packed_scene: PackedScene = load(SANDBOX_SCENE_PATH) as PackedScene
	if packed_scene == null:
		push_error("UI_PREVIEW_SANDBOX_VALIDATE_FAIL unable to load %s" % SANDBOX_SCENE_PATH)
		quit(1)
		return

	var sandbox: Node = packed_scene.instantiate()
	root.add_child(sandbox)
