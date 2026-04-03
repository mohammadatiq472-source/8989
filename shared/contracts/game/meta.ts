import type { FactionId, RegionPriority, RegionRole, TileOwner, AllianceStance } from './common'

export type NationProfile = {
  factionId: FactionId
  nationName: string
  color: string
  capitalTileId?: string
  capitalName?: string
  foundedAt: string
  updatedAt: string
  /** Runtime-computed territory stats (not persisted) */
  territoryTileCount?: number
  controlledCityCount?: number
  controlledResourceCount?: number
}

export type NationProfilesResponse = {
  items: NationProfile[]
  fetchedAt: string
}

export type NationFoundRequest = {
  factionId: FactionId
  nationName: string
  color: string
  capitalTileId?: string
}

export type NationFoundResponse = {
  ok: boolean
  nation: NationProfile
  message: string
}

export type MapOverviewProvince = {
  id: string
  name: string
  summary: string
  centerX: number
  centerY: number
  centerTileId: string
  primaryControlledTiles: number
  opposingControlledTiles: number
  neutralTiles: number
  resourceTiles: number
  cityTiles: number
  passTiles: number
  primaryUnits: number
  opposingUnits: number
}

export type MapOverviewNation = {
  id: FactionId
  name: string
  color: string
  strength: number
  controlledTiles: number
  controlledRegions: number
  capitalTileId?: string
  capitalName?: string
}

export type MapOverviewResponse = {
  tick: number
  worldVersion: number
  primaryFactionId: FactionId
  worldSize: {
    width: number
    height: number
    tileCount: number
  }
  provinces: MapOverviewProvince[]
  nations: MapOverviewNation[]
}

export type RegionSnapshot = {
  id: string
  name: string
  role: RegionRole
  priority: RegionPriority
  control: TileOwner
  friendlyUnits: number
  hostileUnits: number
  friendlyControlledTiles: number
  hostileControlledTiles: number
  resourceTiles: number
  averageEnemyPressure: number
  scoutingCoverage: number
  allianceStance: AllianceStance
  alliedSupport: number
  alliedCommanderName: string
  recentBattlePressure: number
  summary: string
}

export type TheaterSnapshot = {
  macroRegions: RegionSnapshot[]
  frontlineRisk: number
  foodSecurity: number
  supplyLineHealth: number
  developmentCapacity: number
  reconCoverage: number
  allianceCoordination: number
  battleRisk: number
  recentBattleTilt: number
}

export type MapPathNode = {
  x: number
  y: number
}

export type MapContinuousPath = {
  id: string
  name: string
  tileIds: string[]
  nodes: MapPathNode[]
}

export type CityFootprintTier = 'single_1' | 'small_2x2' | 'medium_3x3' | 'mega_4x4'
export type CityCamp = 'human_controlled' | 'autonomous' | 'neutral'
export type CityTechTrackId = 'governance' | 'logistics' | 'defense' | 'recruitment'
export type CityTechLevels = Record<CityTechTrackId, number>

export type MapCityCluster = {
  id: string
  name: string
  centerTileId: string
  cityHallTileId: string
  tileIds: string[]
  district?: string
  owner: TileOwner
  camp: CityCamp
  footprintTiles: 1 | 4 | 9 | 16
  footprintTier: CityFootprintTier
  upgradeCapTiles: 1 | 4 | 9 | 16
  isUpgradeable: boolean
  techLevels: CityTechLevels
}

export type MapContinuousOverlays = {
  mountainRidges: MapContinuousPath[]
  rivers: MapContinuousPath[]
  cityClusters: MapCityCluster[]
}
