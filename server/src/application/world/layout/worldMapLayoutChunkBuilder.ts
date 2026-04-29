import type { WorldMapLayoutResponse, WorldMapLayoutTile, WorldState } from '../../../../../shared/contracts/game'

export function listProvinceIds(tiles: WorldMapLayoutTile[]) {
  const provinceIds = new Set<string>()

  for (const tile of tiles) {
    const district = tile.district?.trim()
    if (district) {
      provinceIds.add(district)
    }
  }

  return Array.from(provinceIds).sort()
}

export function buildLayoutChunkByTileIds(
  mapLayout: WorldMapLayoutResponse['map'],
  tileIds: Set<string>,
): WorldMapLayoutResponse['map'] {
  const tiles = mapLayout.tiles.filter((tile) => tileIds.has(tile.id))
  const connections: Record<string, string[]> = {}

  for (const tile of tiles) {
    const neighbors = mapLayout.connections[tile.id] ?? []
    const filtered = neighbors.filter((neighborId) => tileIds.has(neighborId))
    connections[tile.id] = filtered
  }

  const regions = mapLayout.regions
    .map((region) => {
      const regionTileIds = region.tileIds.filter((tileId) => tileIds.has(tileId))
      if (regionTileIds.length === 0) {
        return null
      }

      return {
        ...region,
        tileIds: regionTileIds,
      }
    })
    .filter((region): region is WorldState['map']['regions'][number] => !!region)

  return {
    width: mapLayout.width,
    height: mapLayout.height,
    tiles,
    connections,
    regions,
    overlays: buildOverlayChunkByTileIds(mapLayout, tileIds),
    resourceGeneration: mapLayout.resourceGeneration ? structuredClone(mapLayout.resourceGeneration) : undefined,
  }
}

export function buildOverlayChunkByTileIds(
  mapLayout: WorldMapLayoutResponse['map'],
  tileIds: Set<string>,
): WorldMapLayoutResponse['map']['overlays'] {
  const intersectsTileIds = (candidateTileIds: string[]) => candidateTileIds.some((tileId) => tileIds.has(tileId))

  return {
    mountainRidges: mapLayout.overlays.mountainRidges.filter((path) => intersectsTileIds(path.tileIds)),
    rivers: mapLayout.overlays.rivers.filter((path) => intersectsTileIds(path.tileIds)),
    cityClusters: mapLayout.overlays.cityClusters.filter((cluster) => intersectsTileIds(cluster.tileIds)),
  }
}

export function resolveBootstrapProvinceIds(
  mapLayout: WorldMapLayoutResponse['map'],
  worldState: WorldState,
  maxLoadedProvinceCount = 6,
) {
  const allProvinceIds = listProvinceIds(mapLayout.tiles)
  const loadedProvinceIds = new Set<string>()

  const tileById = new Map<string, WorldState['map']['tiles'][number]>()
  for (const tile of worldState.map.tiles) {
    tileById.set(tile.id, tile)
  }

  const addProvinceByTileId = (tileId: string | undefined) => {
    if (!tileId) {
      return
    }

    const district = tileById.get(tileId)?.district
    if (district && allProvinceIds.includes(district)) {
      loadedProvinceIds.add(district)
    }
  }

  if (allProvinceIds.includes('sili')) {
    loadedProvinceIds.add('sili')
  }

  const factionIdsByUnitCount = Object.keys(worldState.factions).sort((left, right) => {
    const rightUnits = worldState.units.filter((item) => item.faction === right).length
    const leftUnits = worldState.units.filter((item) => item.faction === left).length
    return rightUnits - leftUnits
  })
  const primaryFactionId = factionIdsByUnitCount[0]
  const rivalFactionId = factionIdsByUnitCount.find((factionId) => factionId !== primaryFactionId)

  for (const unit of worldState.units.filter((item) => item.faction === primaryFactionId)) {
    addProvinceByTileId(unit.tileId)
    if (loadedProvinceIds.size >= maxLoadedProvinceCount - 2) {
      break
    }
  }

  if (rivalFactionId) {
    for (const unit of worldState.units.filter((item) => item.faction === rivalFactionId)) {
      addProvinceByTileId(unit.tileId)
      if (loadedProvinceIds.size >= maxLoadedProvinceCount - 1) {
        break
      }
    }
  }

  for (const region of mapLayout.regions) {
    addProvinceByTileId(region.centerTileId)
    if (loadedProvinceIds.size >= maxLoadedProvinceCount) {
      break
    }
  }

  for (const provinceId of allProvinceIds) {
    if (loadedProvinceIds.size >= maxLoadedProvinceCount) {
      break
    }

    loadedProvinceIds.add(provinceId)
  }

  return Array.from(loadedProvinceIds).filter((provinceId) => allProvinceIds.includes(provinceId))
}

