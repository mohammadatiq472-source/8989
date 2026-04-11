extends Node

signal world_updated(next_world: Dictionary)
signal map_layout_updated(next_map_layout: Dictionary)

var world: Dictionary = {}
var map_layout: Dictionary = {}

func set_world(next_world: Dictionary) -> void:
	world = next_world
	world_updated.emit(world)

func set_map_layout(next_map_layout: Dictionary) -> void:
	map_layout = next_map_layout
	map_layout_updated.emit(map_layout)
