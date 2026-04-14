@tool
extends PanelContainer
class_name UIPreviewSandboxDock

const STORY_MANIFEST_PATH := "res://data/ui_preview/stories/stories_manifest.json"
const SANDBOX_SCENE_PATH := "res://scenes/dev/ui_preview_sandbox.tscn"
const START_STORY_SETTING := "ui_preview_sandbox/start_story_id"

var _editor_interface: EditorInterface
var _story_manifest: Dictionary = {}
var _story_catalog: Array = []
var _story_selector: OptionButton
var _status_label: Label
var _story_count_label: Label
var _default_story_label: Label


func set_editor_interface(editor_interface: EditorInterface) -> void:
	_editor_interface = editor_interface


func _ready() -> void:
	_build_ui()
	_reload_story_manifest()


func _build_ui() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	custom_minimum_size = Vector2(360, 0)
	name = "UI Preview"

	var root := VBoxContainer.new()
	root.name = "Root"
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_theme_constant_override("separation", 10)
	add_child(root)

	var title := Label.new()
	title.name = "Title"
	title.text = "UI Preview"
	title.add_theme_font_size_override("font_size", 18)
	root.add_child(title)

	_status_label = Label.new()
	_status_label.name = "Status"
	_status_label.text = "Sandbox dock ready."
	_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	root.add_child(_status_label)

	_story_count_label = Label.new()
	_story_count_label.name = "StoryCount"
	_story_count_label.text = "Stories: loading..."
	_story_count_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	root.add_child(_story_count_label)

	_default_story_label = Label.new()
	_default_story_label.name = "DefaultStory"
	_default_story_label.text = "Default: loading..."
	_default_story_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	root.add_child(_default_story_label)

	_story_selector = OptionButton.new()
	_story_selector.name = "StorySelector"
	_story_selector.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.add_child(_story_selector)

	var button_row := HBoxContainer.new()
	button_row.name = "ButtonRow"
	button_row.add_theme_constant_override("separation", 8)
	root.add_child(button_row)

	var open_button := Button.new()
	open_button.name = "OpenSceneButton"
	open_button.text = "Open Sandbox Scene"
	open_button.pressed.connect(_on_open_scene_pressed)
	button_row.add_child(open_button)

	var play_button := Button.new()
	play_button.name = "PlayButton"
	play_button.text = "Play Selected Story"
	play_button.pressed.connect(_on_play_selected_story_pressed)
	button_row.add_child(play_button)

	var refresh_button := Button.new()
	refresh_button.name = "RefreshButton"
	refresh_button.text = "Refresh Registry"
	refresh_button.pressed.connect(_reload_story_manifest)
	button_row.add_child(refresh_button)

	var clear_button := Button.new()
	clear_button.name = "ClearOverrideButton"
	clear_button.text = "Clear Override"
	clear_button.pressed.connect(_on_clear_override_pressed)
	button_row.add_child(clear_button)

	var hint := Label.new()
	hint.name = "Hint"
	hint.text = "Select a story here, then open or play the sandbox with the same registry."
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	root.add_child(hint)


func _reload_story_manifest() -> void:
	_story_manifest = _load_story_manifest()
	_story_catalog = []
	if _story_manifest.is_empty():
		_story_count_label.text = "Stories: manifest missing"
		_default_story_label.text = "Default: unavailable"
		_status_label.text = "Sandbox registry not found."
		_populate_story_selector()
		return
	var raw_stories: Variant = _story_manifest.get("stories", [])
	if raw_stories is Array:
		for item in raw_stories:
			if item is Dictionary:
				_story_catalog.append((item as Dictionary).duplicate(true))
	_populate_story_selector()
	var default_story_id := str(_story_manifest.get("defaultStoryId", "")).strip_edges()
	if default_story_id == "":
		default_story_id = _get_first_story_id()
	_story_count_label.text = "Stories: %d" % _story_catalog.size()
	_default_story_label.text = "Default: %s" % (default_story_id if default_story_id != "" else "none")
	_status_label.text = "Loaded %d sandbox stories." % _story_catalog.size()


func _load_story_manifest() -> Dictionary:
	if not FileAccess.file_exists(STORY_MANIFEST_PATH):
		push_warning("[ui-preview-sandbox-dock] manifest missing: %s" % STORY_MANIFEST_PATH)
		return {}
	var file := FileAccess.open(STORY_MANIFEST_PATH, FileAccess.READ)
	if file == null:
		push_warning("[ui-preview-sandbox-dock] unable to open manifest: %s" % STORY_MANIFEST_PATH)
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	file.close()
	if not (parsed is Dictionary):
		push_warning("[ui-preview-sandbox-dock] invalid manifest: %s" % STORY_MANIFEST_PATH)
		return {}
	return parsed as Dictionary


func _populate_story_selector() -> void:
	_story_selector.clear()
	_story_selector.add_item("Default story", 0)
	_story_selector.set_item_metadata(0, "")
	var index := 1
	for story_info in _story_catalog:
		var story_id := str(story_info.get("id", "")).strip_edges()
		if story_id == "":
			continue
		var story_title := str(story_info.get("title", story_id))
		_story_selector.add_item("%s (%s)" % [story_title, story_id], index)
		_story_selector.set_item_metadata(index, story_id)
		index += 1
	var default_story_id := str(_story_manifest.get("defaultStoryId", "")).strip_edges()
	if default_story_id != "":
		var selected_index := _find_story_selector_index(default_story_id)
		if selected_index >= 0:
			_story_selector.select(selected_index)
		else:
			_story_selector.select(0)
	else:
		_story_selector.select(0)


func _find_story_selector_index(story_id: String) -> int:
	for index in range(_story_selector.get_item_count()):
		var metadata := _story_selector.get_item_metadata(index)
		if metadata is String and str(metadata) == story_id:
			return index
	return -1


func _get_selected_story_id() -> String:
	if _story_selector == null or _story_selector.get_item_count() == 0:
		return ""
	var metadata := _story_selector.get_item_metadata(_story_selector.selected)
	if metadata is String:
		return str(metadata).strip_edges()
	return ""


func _get_first_story_id() -> String:
	for story_info in _story_catalog:
		var story_id := str(story_info.get("id", "")).strip_edges()
		if story_id != "":
			return story_id
	return ""


func _get_default_story_id() -> String:
	var default_story_id := str(_story_manifest.get("defaultStoryId", "")).strip_edges()
	if default_story_id != "":
		return default_story_id
	return _get_first_story_id()


func _on_open_scene_pressed() -> void:
	if _editor_interface == null:
		_status_label.text = "Editor interface unavailable."
		return
	_editor_interface.open_scene_from_path(SANDBOX_SCENE_PATH)
	_status_label.text = "Opened sandbox scene: %s" % SANDBOX_SCENE_PATH


func _on_play_selected_story_pressed() -> void:
	if _editor_interface == null:
		_status_label.text = "Editor interface unavailable."
		return
	var selected_story_id := _get_selected_story_id()
	if selected_story_id == "":
		selected_story_id = _get_default_story_id()
	ProjectSettings.set_setting(START_STORY_SETTING, selected_story_id)
	_status_label.text = "Playing sandbox with story: %s" % (selected_story_id if selected_story_id != "" else "default")
	if _editor_interface.has_method("play_custom_scene"):
		_editor_interface.call("play_custom_scene", SANDBOX_SCENE_PATH)
	else:
		_status_label.text = "Editor interface does not expose play_custom_scene."


func _on_clear_override_pressed() -> void:
	ProjectSettings.set_setting(START_STORY_SETTING, "")
	_status_label.text = "Sandbox story override cleared."
