import { getHanProvinceAnchors } from '../../../../shared/domain/scenario'
import type {
  FactionId,
  MapOverviewNation,
  MapOverviewProvince,
  MapOverviewResponse,
  NationProfile,
  Tile,
  TileOwner,
  WorldState,
} from '../../../../shared/contracts/game'
import { getNationProfileForWorld } from '../nation/NationService'
import { getWorldStateReadonly } from '../world/WorldService'

type ProvinceStat = MapOverviewProvince & {
  tileIds: string[]
}

export function getMapOverview(): MapOverviewResponse {
  const world = getWorldStateReadonly()
  const primaryFactionId = resolveOverviewPrimaryFactionId(world)
  const provinceStats = buildProvinceStats(world, primaryFactionId)

  return {
    tick: world.tick,
    worldVersion: world.worldVersion,
    primaryFactionId,
    worldSize: {
      width: world.map.width,
      height: world.map.height,
      tileCount: world.map.tiles.length,
    },
    provinces: provinceStats.map((province) => {
      const { tileIds, ...rest } = province
      void tileIds
      return rest
    }),
    nations: buildNationOverview(world, provinceStats),
  }
}

function buildProvinceStats(world: WorldState, primaryFactionId: FactionId): ProvinceStat[] {
  const anchors = getHanProvinceAnchors()
  const tileById = new Map(world.map.tiles.map((tile) => [tile.id, tile]))

  const statsById = new Map<string, ProvinceStat>()
  for (const anchor of anchors) {
    statsById.set(anchor.id, {
      id: anchor.id,
      name: anchor.name,
      summary: anchor.summary,
      centerX: anchor.centerX,
      centerY: anchor.centerY,
      centerTileId: pickCenterTileId(world, anchor.centerX, anchor.centerY),
      primaryControlledTiles: 0,
      opposingControlledTiles: 0,
      neutralTiles: 0,
      resourceTiles: 0,
      cityTiles: 0,
      passTiles: 0,
      primaryUnits: 0,
      opposingUnits: 0,
      tileIds: [],
    })
  }

  const tileProvinceMap = new Map<string, string>()

  for (const tile of world.map.tiles) {
    const provinceId = resolveProvinceId(tile, anchors)
    const stat = statsById.get(provinceId)
    if (!stat) {
      continue
    }

    stat.tileIds.push(tile.id)
    tileProvinceMap.set(tile.id, provinceId)

    incrementOwnerCounter(stat, tile.owner, primaryFactionId)
    if (tile.type === 'resource') {
      stat.resourceTiles += 1
    }
    if (tile.type === 'city') {
      stat.cityTiles += 1
    }
    if (tile.type === 'pass') {
      stat.passTiles += 1
    }
  }

  for (const unit of world.units) {
    const provinceId = tileProvinceMap.get(unit.tileId)
    if (!provinceId) {
      continue
    }

    const stat = statsById.get(provinceId)
    if (!stat) {
      continue
    }

    if (unit.faction === primaryFactionId) {
      stat.primaryUnits += 1
    } else if (unit.faction !== 'neutral') {
      stat.opposingUnits += 1
    }
  }

  for (const stat of statsById.values()) {
    const centerTile = tileById.get(stat.centerTileId)
    if (!centerTile) {
      continue
    }

    stat.centerX = centerTile.x
    stat.centerY = centerTile.y
  }

  return Array.from(statsById.values())
}

function buildNationOverview(world: WorldState, provinces: ProvinceStat[]): MapOverviewNation[] {
  const tileById = new Map(world.map.tiles.map((tile) => [tile.id, tile]))
  return Object.keys(world.factions).map((factionId) => {
    const nationProfile = getNationProfileForWorld(world, factionId)
    return buildNation(world, tileById, provinces, factionId, nationProfile)
  })
}

function buildNation(
  world: WorldState,
  tileById: Map<string, Tile>,
  provinces: ProvinceStat[],
  faction: FactionId,
  profile: NationProfile,
): MapOverviewNation {
  const controlledTiles = world.map.tiles.filter((tile) => tile.owner === faction).length
  const controlledRegions = world.map.regions.filter((region) => {
    const counters = new Map<string, number>()
    for (const tileId of region.tileIds) {
      const tile = tileById.get(tileId)
      if (!tile) {
        continue
      }
      if (tile.owner && tile.owner !== 'neutral') {
        counters.set(tile.owner, (counters.get(tile.owner) ?? 0) + 1)
      }
    }

    const dominantFactionId = Array.from(counters.entries()).sort((left, right) => right[1] - left[1])[0]?.[0]
    return dominantFactionId === faction
  }).length

  const units = world.units.filter((unit) => unit.faction === faction).length
  const provinceControl = provinces.reduce((sum, province) => {
    const ownerCounts = new Map<string, number>()
    for (const tileId of province.tileIds) {
      const tile = tileById.get(tileId)
      if (!tile?.owner || tile.owner === 'neutral') {
        continue
      }
      ownerCounts.set(tile.owner, (ownerCounts.get(tile.owner) ?? 0) + 1)
    }
    const dominantFactionId = Array.from(ownerCounts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0]
    return sum + (dominantFactionId === faction ? 1 : 0)
  }, 0)

  const strength = units * 6 + controlledRegions * 11 + controlledTiles

  const capitalTile = profile.capitalTileId
    ? world.map.tiles.find((tile) => tile.id === profile.capitalTileId)
    : undefined

  const fallbackCapital =
    world.map.tiles.find((tile) => tile.owner === faction && tile.type === 'city') ??
    world.map.tiles.find((tile) => tile.owner === faction && tile.type === 'resource')

  const finalCapital = capitalTile ?? fallbackCapital

  return {
    id: faction,
    name: profile.nationName,
    color: profile.color,
    strength,
    controlledTiles,
    controlledRegions: controlledRegions + provinceControl,
    capitalTileId: finalCapital?.id,
    capitalName: finalCapital?.name,
  }
}

function pickCenterTileId(world: WorldState, centerX: number, centerY: number) {
  let winner = world.map.tiles[0]
  let bestDistance = Number.POSITIVE_INFINITY

  for (const tile of world.map.tiles) {
    const distance = squaredDistance(tile.x, tile.y, centerX, centerY)
    if (distance < bestDistance) {
      bestDistance = distance
      winner = tile
    }
  }

  return winner.id
}

function resolveProvinceId(tile: Tile, anchors: ReturnType<typeof getHanProvinceAnchors>) {
  let winner = anchors[0]
  let bestDistance = Number.POSITIVE_INFINITY

  for (const anchor of anchors) {
    const distance = squaredDistance(tile.x, tile.y, anchor.centerX, anchor.centerY)
    if (distance < bestDistance) {
      bestDistance = distance
      winner = anchor
    }
  }

  return winner.id
}

function incrementOwnerCounter(stat: ProvinceStat, owner: TileOwner, primaryFactionId: FactionId) {
  if (owner === primaryFactionId) {
    stat.primaryControlledTiles += 1
    return
  }

  if (owner !== 'neutral') {
    stat.opposingControlledTiles += 1
    return
  }

  stat.neutralTiles += 1
}

function resolveOverviewPrimaryFactionId(world: WorldState): FactionId {
  const factionIds = Object.keys(world.factions)
  if (factionIds.length === 0) {
    return 'neutral'
  }

  return factionIds.sort((left, right) => {
    const rightScore = scoreFaction(world, right)
    const leftScore = scoreFaction(world, left)
    return rightScore - leftScore
  })[0]
}

function scoreFaction(world: WorldState, factionId: FactionId) {
  const territoryTiles = world.map.tiles.filter((tile) => tile.owner === factionId).length
  const units = world.units.filter((unit) => unit.faction === factionId).length
  return territoryTiles * 1000 + units
}

function squaredDistance(x1: number, y1: number, x2: number, y2: number) {
  const dx = x1 - x2
  const dy = y1 - y2
  return dx * dx + dy * dy
}
