extends RefCounted
class_name PanelStackController

var _base_layer_id: String = "main"
var _layer_levels: Dictionary = {}
var _stack: Array = []


func configure(base_layer_id: String, layer_levels: Dictionary) -> void:
	_base_layer_id = base_layer_id.strip_edges()
	if _base_layer_id == "":
		_base_layer_id = "main"
	_layer_levels.clear()
	for key_variant in layer_levels.keys():
		var layer_id := str(key_variant).strip_edges()
		if layer_id == "":
			continue
		_layer_levels[layer_id] = max(1, int(layer_levels.get(key_variant, 1)))
	if not _layer_levels.has(_base_layer_id):
		_layer_levels[_base_layer_id] = 1
	reset()


func reset() -> void:
	_stack = [_base_layer_id]


func navigate_to(layer_id: String) -> void:
	var target_layer_id := layer_id.strip_edges()
	if target_layer_id == "":
		return
	if target_layer_id == _base_layer_id:
		reset()
		return
	if not _layer_levels.has(target_layer_id):
		return

	var existing_index := _stack.find(target_layer_id)
	if existing_index >= 0:
		_stack = _stack.slice(0, existing_index + 1)
		_ensure_base_layer()
		return

	var target_level := int(_layer_levels.get(target_layer_id, 1))
	while _stack.size() > 0:
		var top_layer_id := str(_stack[_stack.size() - 1]).strip_edges()
		var top_level := int(_layer_levels.get(top_layer_id, 99))
		if top_level < target_level:
			break
		_stack.pop_back()

	_ensure_base_layer()
	_stack.append(target_layer_id)


func go_back() -> void:
	if _stack.size() <= 1:
		return
	_stack.pop_back()
	_ensure_base_layer()


func set_stack_path(stack_path: Array) -> void:
	reset()
	for layer_variant in stack_path:
		navigate_to(str(layer_variant))


func get_stack_path() -> Array:
	return _stack.duplicate(true)


func get_top_layer_id() -> String:
	if _stack.is_empty():
		return _base_layer_id
	return str(_stack[_stack.size() - 1]).strip_edges()


func is_layer_visible(layer_id: String) -> bool:
	return _stack.has(layer_id.strip_edges())


func get_layer_rank(layer_id: String) -> int:
	return _stack.find(layer_id.strip_edges())


func describe_rules() -> String:
	return "L1 root locked | open=push | back=pop | same-level panels are mutex."


func _ensure_base_layer() -> void:
	if _stack.is_empty():
		_stack = [_base_layer_id]
		return
	if str(_stack[0]).strip_edges() == _base_layer_id:
		return
	_stack.push_front(_base_layer_id)
