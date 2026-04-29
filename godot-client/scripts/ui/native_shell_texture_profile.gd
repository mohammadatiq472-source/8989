extends Resource
class_name NativeShellTextureProfile

@export var texture: Texture2D
@export var modulate_color: Color = Color(1.0, 1.0, 1.0, 1.0)
@export var expand_mode: int = TextureRect.EXPAND_IGNORE_SIZE
@export var stretch_mode: int = TextureRect.STRETCH_SCALE

func to_dictionary() -> Dictionary:
	return {
		"texture": texture,
		"modulate": modulate_color,
		"expand_mode": expand_mode,
		"stretch_mode": stretch_mode,
	}
