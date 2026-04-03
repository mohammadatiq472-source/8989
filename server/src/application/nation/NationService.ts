import type {
  FactionId,
  NationFoundRequest,
  NationFoundResponse,
  NationProfile,
  NationProfilesResponse,
  Tile,
  WorldState,
} from '../../../../shared/contracts/game'
import { getWorldStateReadonly } from '../world/WorldService'

const DEFAULT_COLOR_PALETTE = ['#4c8bd9', '#d06a55', '#63a375', '#b17acc', '#d7a94d', '#5db9b2']

const nationProfiles = new Map<FactionId, NationProfile>()

function resolveNationPreset(factionId: FactionId) {
  const paletteIndex = Math.abs(hashFactionId(factionId)) % DEFAULT_COLOR_PALETTE.length
  return {
    nationName: `Nation ${factionId}`,
    color: DEFAULT_COLOR_PALETTE[paletteIndex],
  }
}

export function getNationProfiles(): NationProfilesResponse {
  const world = getWorldStateReadonly()
  const items: NationProfile[] = Object.keys(world.factions).map((factionId) =>
    structuredClone(getNationProfileForWorld(world, factionId)),
  )

  return {
    items,
    fetchedAt: new Date().toISOString(),
  }
}

function hashFactionId(value: string) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return hash
}

export function getNationProfileForWorld(world: WorldState, factionId: FactionId): NationProfile {
  const profile = ensureNationProfile(factionId)
  const synced = syncNationCapital(world, profile)

  // Compute territory stats at read time
  let territoryTileCount = 0
  let controlledCityCount = 0
  let controlledResourceCount = 0
  for (const tile of world.map.tiles) {
    if (tile.owner === factionId) {
      territoryTileCount++
      if (tile.type === 'city') controlledCityCount++
      if (tile.type === 'resource') controlledResourceCount++
    }
  }
  synced.territoryTileCount = territoryTileCount
  synced.controlledCityCount = controlledCityCount
  synced.controlledResourceCount = controlledResourceCount

  return synced
}

export function foundNation(request: NationFoundRequest): NationFoundResponse {
  const world = getWorldStateReadonly()
  const profile = ensureNationProfile(request.factionId)
  const now = new Date().toISOString()

  const capitalTile = resolveCapitalTile(world, request.factionId, request.capitalTileId)

  const nextProfile: NationProfile = {
    ...profile,
    nationName: request.nationName.trim(),
    color: request.color.trim().toLowerCase(),
    capitalTileId: capitalTile?.id,
    capitalName: capitalTile?.name,
    updatedAt: now,
    foundedAt: profile.foundedAt || now,
  }

  nationProfiles.set(request.factionId, nextProfile)

  return {
    ok: true,
    nation: structuredClone(nextProfile),
    message: `${nextProfile.nationName} founded successfully.`,
  }
}

function ensureNationProfile(factionId: FactionId): NationProfile {
  const existing = nationProfiles.get(factionId)
  if (existing) {
    return existing
  }

  const now = new Date().toISOString()
  const preset = resolveNationPreset(factionId)
  const profile: NationProfile = {
    factionId,
    nationName: preset.nationName,
    color: preset.color,
    foundedAt: now,
    updatedAt: now,
  }

  nationProfiles.set(factionId, profile)
  return profile
}

function syncNationCapital(world: WorldState, profile: NationProfile): NationProfile {
  const next = { ...profile }

  const preferredTile = profile.capitalTileId
    ? world.map.tiles.find((tile) => tile.id === profile.capitalTileId && tile.owner === profile.factionId)
    : undefined

  const fallbackTile =
    world.map.tiles.find((tile) => tile.owner === profile.factionId && tile.type === 'city') ??
    world.map.tiles.find((tile) => tile.owner === profile.factionId && tile.type === 'resource')

  const capitalTile = preferredTile ?? fallbackTile

  next.capitalTileId = capitalTile?.id
  next.capitalName = capitalTile?.name

  nationProfiles.set(profile.factionId, next)
  return next
}

function resolveCapitalTile(
  world: WorldState,
  factionId: FactionId,
  preferredTileId?: string,
): Tile | undefined {
  if (preferredTileId) {
    const preferred = world.map.tiles.find((tile) => tile.id === preferredTileId)
    if (!preferred) {
      throw new Error('Selected capital tile does not exist.')
    }

    if (preferred.owner !== factionId) {
      throw new Error('Selected capital tile is not controlled by the target faction.')
    }

    return preferred
  }

  return (
    world.map.tiles.find((tile) => tile.owner === factionId && tile.type === 'city') ??
    world.map.tiles.find((tile) => tile.owner === factionId && tile.type === 'resource')
  )
}
