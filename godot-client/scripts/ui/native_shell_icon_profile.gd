extends Resource
class_name NativeShellIconProfile

@export var icon_texture: Texture2D
@export var tooltip_text: String = ""
@export var expand_icon: bool = true
@export var icon_alignment: int = HORIZONTAL_ALIGNMENT_LEFT
@export var use_h_separation: bool = true
@export var h_separation: int = 4

func to_dictionary() -> Dictionary:
	var profile := {
		"icon_texture": icon_texture,
		"tooltip_text": tooltip_text,
		"expand_icon": expand_icon,
		"icon_alignment": icon_alignment,
	}
	if use_h_separation:
		profile["h_separation"] = h_separation
	return profile
