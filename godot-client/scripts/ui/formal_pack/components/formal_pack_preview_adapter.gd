extends RefCounted
class_name FormalPackPreviewAdapter

const ENV_EMPTY_POOLS := "FORMAL_PACK_EMPTY_POOLS"
const ENV_EMPTY_ROSTER := "FORMAL_PACK_EMPTY_ROSTER"

static func recruit_read_model(default_pools: Array) -> Dictionary:
	return {
		"visiblePools": [] if _env_flag(ENV_EMPTY_POOLS) else default_pools,
	}

static func general_read_model(default_owned_heroes: Array) -> Dictionary:
	return {
		"ownedHeroes": [] if _env_flag(ENV_EMPTY_ROSTER) else default_owned_heroes,
	}

static func visible_pools(default_pools: Array) -> Array:
	var read_model := recruit_read_model(default_pools)
	return read_model.get("visiblePools", []) as Array

static func owned_heroes(default_owned_heroes: Array) -> Array:
	var read_model := general_read_model(default_owned_heroes)
	return read_model.get("ownedHeroes", []) as Array

static func _env_flag(name: String) -> bool:
	var value := OS.get_environment(name).strip_edges().to_lower()
	return value == "1" or value == "true" or value == "yes"
