import { performance } from 'node:perf_hooks'
import type {
  AllianceDirective,
  AiRuntimeAdvanceTickSubphaseTiming,
  FactionId,
  MapRegion,
  PlannerSnapshot,
  RegionSnapshot,
  TheaterSnapshot,
  TileOwner,
  WorldState,
} from '../contracts/game'
import { buildTileIdSet } from './worldIndex'
import { getTileByIdFast } from './worldIndex'
import { allianceStanceLabel } from './labels'

export type TheaterDiagnostics = {
  subphases?: AiRuntimeAdvanceTickSubphaseTiming[]
}

type RegionUnitCounts = {
  friendlyUnits: number
  hostileUnits: number
}

type TheaterSummaryIndexes = {
  directiveByRegionId: Map<string, AllianceDirective>
  commanderNameById: Map<string, string>
  unitCountsByRegionId: Map<string, RegionUnitCounts>
}

function buildTheaterSubphaseName(prefix: string, suffix: string) {
  return `${prefix}.${suffix}`
}

function measureTheaterSubphase<T>(
  diagnostics: TheaterDiagnostics | undefined,
  subphase: string,
  work: () => T,
): T {
  const startedAtMs = performance.now()
  try {
    return work()
  } finally {
    diagnostics?.subphases?.push({
      subphase,
      durationMs: Number((performance.now() - startedAtMs).toFixed(2)),
    })
  }
}

export function getRegionById(world: WorldState, regionId: string) {
  return world.map.regions.find((region) => region.id === regionId)
}

export function getRegionTileIds(world: WorldState, regionId: string) {
  return getRegionById(world, regionId)?.tileIds ?? []
}

function resolveDefaultFactionId(world: WorldState): FactionId {
  const firstFactionId = Object.keys(world.factions)[0]
  return (firstFactionId ?? 'neutral') as FactionId
}

export function buildTheaterSnapshot(
  world: WorldState,
  factionId: FactionId = resolveDefaultFactionId(world),
  diagnostics?: TheaterDiagnostics,
  subphasePrefix = 'advance_world_state.directors_and_theater.theater_snapshot',
): TheaterSnapshot {
  const tileById = measureTheaterSubphase(
    diagnostics,
    buildTheaterSubphaseName(subphasePrefix, 'build_tile_index'),
    () => Object.fromEntries(world.map.tiles.map((tile) => [tile.id, tile])) as Record<
      string,
      WorldState['map']['tiles'][number]
    >,
  )
  const macroRegions = measureTheaterSubphase(
    diagnostics,
    buildTheaterSubphaseName(subphasePrefix, 'summarize_macro_regions'),
    () => {
      const summaryIndexes = buildTheaterSummaryIndexes(
        world,
        factionId,
        diagnostics,
        buildTheaterSubphaseName(subphasePrefix, 'summarize_macro_regions'),
      )
      return (
      world.map.regions.map((region) =>
        summarizeRegion(
          world,
          region,
          tileById,
          factionId,
          diagnostics,
          buildTheaterSubphaseName(subphasePrefix, 'summarize_macro_regions'),
          summaryIndexes,
        ),
      )
      )
    },
  )
  const frontlineRisk = measureTheaterSubphase(
    diagnostics,
    buildTheaterSubphaseName(subphasePrefix, 'compute_frontline_risk'),
    () => Math.round(
      macroRegions
        .filter((region) => region.role === 'frontier')
        .reduce((sum, region) => sum + region.averageEnemyPressure, 0),
    ),
  )
  const factionResourceTiles = measureTheaterSubphase(
    diagnostics,
    buildTheaterSubphaseName(subphasePrefix, 'collect_faction_resource_tiles'),
    () => world.map.tiles.filter((tile) => tile.owner === factionId && tile.type === 'resource'),
  )
  const foodSecurity = measureTheaterSubphase(
    diagnostics,
    buildTheaterSubphaseName(subphasePrefix, 'compute_food_security'),
    () => Number(
      factionResourceTiles.reduce((sum, tile) => sum + 2 - tile.enemyPressure * 0.2, 0).toFixed(1),
    ),
  )
  const supplyLineHealth = measureTheaterSubphase(
    diagnostics,
    buildTheaterSubphaseName(subphasePrefix, 'compute_supply_line_health'),
    () => {
      const supplyTileIds = ['tile_11', 'tile_12', 'tile_13', 'tile_08'] as const
      const supplyTiles = supplyTileIds
        .map((id) => getTileByIdFast(world, id))
        .filter((tile): tile is NonNullable<typeof tile> => !!tile)
      const averageSupplyPressure =
        supplyTiles.reduce((sum, tile) => sum + tile.enemyPressure, 0) / Math.max(1, supplyTiles.length)
      return clampPercent(100 - averageSupplyPressure * 16)
    },
  )
  const developmentCapacity = measureTheaterSubphase(
    diagnostics,
    buildTheaterSubphaseName(subphasePrefix, 'compute_development_capacity'),
    () => {
      const playerFood = world.factions[factionId]?.food ?? 0
      return clampPercent(factionResourceTiles.length * 24 + playerFood * 1.8)
    },
  )
  const reconCoverage = measureTheaterSubphase(
    diagnostics,
    buildTheaterSubphaseName(subphasePrefix, 'compute_recon_coverage'),
    () => Math.round(
      (world.map.tiles.filter((tile) => world.intel[tile.id]?.level === 'confirmed').length /
        world.map.tiles.length) *
        100,
    ),
  )
  const allianceCoordination = measureTheaterSubphase(
    diagnostics,
    buildTheaterSubphaseName(subphasePrefix, 'compute_alliance_coordination'),
    () => clampPercent(
      macroRegions.reduce((sum, region) => sum + region.alliedSupport, 0) /
        Math.max(1, macroRegions.length),
    ),
  )
  const { recentBattleTilt, battleRisk } = measureTheaterSubphase(
    diagnostics,
    buildTheaterSubphaseName(subphasePrefix, 'compute_battle_risk'),
    () => {
      const recentBattleTilt = world.feedback.battleRecords
        .slice(0, 6)
        .reduce(
          (sum, record) =>
            sum + (record.outcome === 'win' ? 1 : -1) * (record.attackerFaction === factionId ? 1 : -1),
          0,
        )
      const playerBattleLoss = world.feedback.battleRecords
        .slice(0, 6)
        .filter((record) => record.attackerFaction === factionId)
        .reduce((sum, record) => sum + record.attackerLoss, 0)
      const battleRisk = clampPercent(frontlineRisk * 10 + playerBattleLoss * 0.7 - recentBattleTilt * 6)
      return { recentBattleTilt, battleRisk }
    },
  )

  return {
    macroRegions,
    frontlineRisk,
    foodSecurity,
    supplyLineHealth,
    developmentCapacity,
    reconCoverage,
    allianceCoordination,
    battleRisk,
    recentBattleTilt,
  }
}

export function summarizeRegion(
  world: WorldState,
  region: MapRegion,
  tileById: Record<string, WorldState['map']['tiles'][number]> = Object.fromEntries(
    world.map.tiles.map((tile) => [tile.id, tile]),
  ),
  factionId: FactionId = resolveDefaultFactionId(world),
  diagnostics?: TheaterDiagnostics,
  subphasePrefix?: string,
  summaryIndexes?: TheaterSummaryIndexes,
): RegionSnapshot {
  const measureRegionSubphase = <T>(suffix: string, work: () => T): T => {
    if (!diagnostics || !subphasePrefix) {
      return work()
    }
    return measureTheaterSubphase(diagnostics, buildTheaterSubphaseName(subphasePrefix, suffix), work)
  }
  const tiles = measureRegionSubphase('resolve_tiles', () =>
    region.tileIds
      .map((tileId) => tileById[tileId])
      .filter((tile): tile is NonNullable<typeof tile> => !!tile),
  )
  const { friendlyControlledTiles, hostileControlledTiles, resourceTiles, scoutingCoverage, averageEnemyPressure } =
    measureRegionSubphase('scan_tiles', () => {
      let friendlyControlledTiles = 0
      let hostileControlledTiles = 0
      let resourceTiles = 0
      let confirmedIntelTiles = 0
      let totalEnemyPressure = 0

      for (const tile of tiles) {
        if (tile.owner === factionId) {
          friendlyControlledTiles += 1
        } else if (tile.owner !== factionId && tile.owner !== 'neutral' && !!tile.owner) {
          hostileControlledTiles += 1
        }
        if (tile.type === 'resource') {
          resourceTiles += 1
        }
        if (world.intel[tile.id]?.level === 'confirmed') {
          confirmedIntelTiles += 1
        }
        totalEnemyPressure += tile.enemyPressure
      }

      return {
        friendlyControlledTiles,
        hostileControlledTiles,
        resourceTiles,
        scoutingCoverage: Math.round((confirmedIntelTiles / Math.max(1, tiles.length)) * 100),
        averageEnemyPressure: Number((totalEnemyPressure / Math.max(1, tiles.length)).toFixed(1)),
      }
    })
  const { friendlyUnits, hostileUnits } = measureRegionSubphase('count_units', () => {
    const precomputedCounts = summaryIndexes?.unitCountsByRegionId.get(region.id)
    if (precomputedCounts) {
      return measureRegionSubphase('count_units.resolve_precomputed_counts', () => precomputedCounts)
    }

    const regionTileSet = measureRegionSubphase('count_units.build_region_tile_set', () =>
      buildTileIdSet(region.tileIds),
    )
    return measureRegionSubphase('count_units.scan_units', () => {
      let friendlyUnits = 0
      let hostileUnits = 0
      for (const unit of world.units) {
        if (!regionTileSet.has(unit.tileId)) {
          continue
        }
        if (unit.faction === factionId) {
          friendlyUnits += 1
        } else {
          hostileUnits += 1
        }
      }
      return { friendlyUnits, hostileUnits }
    })
  })
  const control = measureRegionSubphase('resolve_control', () =>
    resolveRegionControl(friendlyControlledTiles, hostileControlledTiles, tiles.length, factionId),
  )
  const { directive, commanderName, alliedSupport } = measureRegionSubphase('resolve_directive', () => {
    const directive = measureRegionSubphase(
      'resolve_directive.lookup_directive',
      () => summaryIndexes?.directiveByRegionId.get(region.id) ?? getAllianceDirective(world, region.id),
    )
    const commanderName = measureRegionSubphase(
      'resolve_directive.lookup_commander_name',
      () => summaryIndexes?.commanderNameById.get(directive.assignedCommanderId) ?? directive.assignedCommanderId,
    )
    return {
      directive,
      commanderName,
      alliedSupport: Math.round(directive.supportLevel),
    }
  })
  const recentBattlePressure = measureRegionSubphase('compute_recent_battle_pressure', () =>
    clampPercent(
      world.feedback.battleRecords
        .filter((record) => record.regionId === region.id)
        .slice(0, 3)
        .reduce((sum, record) => {
          const signedLoss =
            record.outcome === 'loss' && record.attackerFaction === factionId ? record.attackerLoss : 0
          const winRelief = record.outcome === 'win' && record.attackerFaction === factionId ? -8 : 0
          return sum + signedLoss + winRelief
        }, averageEnemyPressure * 12),
    ),
  )
  const summary = measureRegionSubphase('build_summary', () =>
    buildRegionSummary(
      region,
      control,
      friendlyUnits,
      hostileUnits,
      averageEnemyPressure,
      scoutingCoverage,
      directive,
      commanderName,
      alliedSupport,
      recentBattlePressure,
      factionId,
    ),
  )

  return {
    id: region.id,
    name: region.name,
    role: region.role,
    priority: region.priority,
    control,
    friendlyUnits,
    hostileUnits,
    friendlyControlledTiles,
    hostileControlledTiles,
    resourceTiles,
    averageEnemyPressure,
    scoutingCoverage,
    allianceStance: directive.stance,
    alliedSupport,
    alliedCommanderName: commanderName,
    recentBattlePressure,
    summary,
  }
}

function buildTheaterSummaryIndexes(
  world: WorldState,
  factionId: FactionId,
  diagnostics: TheaterDiagnostics | undefined,
  subphasePrefix: string,
): TheaterSummaryIndexes {
  const directiveByRegionId = measureTheaterSubphase(
    diagnostics,
    buildTheaterSubphaseName(subphasePrefix, 'build_directive_index'),
    () => new Map(Object.entries(world.alliance.directives)),
  )
  const commanderNameById = measureTheaterSubphase(
    diagnostics,
    buildTheaterSubphaseName(subphasePrefix, 'build_commander_index'),
    () => new Map(world.alliance.commanders.map((commander) => [commander.id, commander.name] as const)),
  )
  const unitCountsByRegionId = measureTheaterSubphase(
    diagnostics,
    buildTheaterSubphaseName(subphasePrefix, 'build_region_unit_count_index'),
    () => {
      const countsByRegionId = new Map<string, RegionUnitCounts>()
      measureTheaterSubphase(
        diagnostics,
        buildTheaterSubphaseName(subphasePrefix, 'build_region_unit_count_index.initialize_regions'),
        () => {
          for (const region of world.map.regions) {
            countsByRegionId.set(region.id, { friendlyUnits: 0, hostileUnits: 0 })
          }
        },
      )
      const regionIdByTileId = measureTheaterSubphase(
        diagnostics,
        buildTheaterSubphaseName(subphasePrefix, 'build_region_unit_count_index.build_tile_to_region_index'),
        () => {
          const index = new Map<string, string>()
          for (const region of world.map.regions) {
            for (const tileId of region.tileIds) {
              if (!index.has(tileId)) {
                index.set(tileId, region.id)
              }
            }
          }
          return index
        },
      )
      measureTheaterSubphase(
        diagnostics,
        buildTheaterSubphaseName(subphasePrefix, 'build_region_unit_count_index.scan_units'),
        () => {
          for (const unit of world.units) {
            const regionId = regionIdByTileId.get(unit.tileId)
            if (!regionId) {
              continue
            }
            const counts = countsByRegionId.get(regionId)
            if (!counts) {
              continue
            }
            if (unit.faction === factionId) {
              counts.friendlyUnits += 1
            } else {
              counts.hostileUnits += 1
            }
          }
        },
      )
      return countsByRegionId
    },
  )
  return {
    directiveByRegionId,
    commanderNameById,
    unitCountsByRegionId,
  }
}

export function buildPlannerSnapshot(world: WorldState, strategicCommand: string): PlannerSnapshot {
  return buildPlannerSnapshotForFaction(world, strategicCommand, resolveDefaultFactionId(world))
}

export function buildPlannerSnapshotForFaction(
  world: WorldState,
  strategicCommand: string,
  factionId: FactionId,
): PlannerSnapshot {
  const theater = buildTheaterSnapshot(world, factionId)
  const resources = world.factions[factionId] ?? Object.values(world.factions)[0]
  const localTiles = selectPlannerLocalTiles(world, factionId)

  return {
    tick: world.tick,
    worldVersion: world.worldVersion,
    command: strategicCommand,
    resources,
    macroLayer: {
      frontlineRisk: theater.frontlineRisk,
      foodSecurity: theater.foodSecurity,
      supplyLineHealth: theater.supplyLineHealth,
      developmentCapacity: theater.developmentCapacity,
      reconCoverage: theater.reconCoverage,
      allianceCoordination: theater.allianceCoordination,
      battleRisk: theater.battleRisk,
      recentBattleTilt: theater.recentBattleTilt,
      regions: theater.macroRegions,
    },
    allianceLayer: {
      commanders: world.alliance.commanders,
      directives: Object.values(world.alliance.directives),
      recentActions: world.feedback.allianceActions.slice(0, 4),
    },
    localLayer: {
      units: world.units
        .filter((unit) => unit.faction === factionId)
        .map((unit) => ({
          id: unit.id,
          name: unit.name,
          tileId: unit.tileId,
          strength: unit.strength,
          supply: unit.supply,
          status: unit.status,
        })),
      tiles: localTiles.map((tile) => ({
        id: tile.id,
        name: tile.name,
        type: tile.type,
        owner: tile.owner,
        enemyPressure: tile.enemyPressure,
        intel: world.intel[tile.id]?.level ?? 'unknown',
      })),
      recentBattles: world.feedback.battleRecords.slice(0, 4),
    },
  }
}

function selectPlannerLocalTiles(world: WorldState, factionId: FactionId) {
  const selected = new Map<string, WorldState['map']['tiles'][number]>()
  const tileById = Object.fromEntries(world.map.tiles.map((tile) => [tile.id, tile])) as Record<
    string,
    WorldState['map']['tiles'][number]
  >

  const includeTile = (tileId: string) => {
    const tile = tileById[tileId]
    if (!tile) {
      return
    }
    selected.set(tile.id, tile)
  }

  const includeNeighborhood = (tileId: string, depth: number) => {
    const queue: Array<{ id: string; depth: number }> = [{ id: tileId, depth: 0 }]
    const visited = new Set<string>()
    while (queue.length > 0) {
      const current = queue.shift()
      if (!current || visited.has(current.id) || current.depth > depth) {
        continue
      }
      visited.add(current.id)
      includeTile(current.id)
      for (const neighborId of world.map.connections[current.id] ?? []) {
        queue.push({ id: neighborId, depth: current.depth + 1 })
      }
    }
  }

  const factionUnits = world.units.filter((unit) => unit.faction === factionId)
  for (const unit of factionUnits) {
    includeNeighborhood(unit.tileId, 3)
  }

  // 把未清剿的 PVE 节点格子加入本地层，让 AI（mock + LLM）能看见并规划开荒行动
  const pveNodeTileIds = new Set((world.pveNodes ?? []).filter((n) => !n.cleared).map((n) => n.tileId))
  for (const tileId of pveNodeTileIds) {
    includeTile(tileId)
  }

  for (const tile of world.map.tiles) {
    if (tile.type === 'pass' || tile.landmarkId || (tile.cityLevel ?? 0) >= 7 || tile.enemyPressure >= 4) {
      includeTile(tile.id)
    }
  }

  const unknownTiles = world.map.tiles
    .filter((tile) => world.intel[tile.id]?.level === 'unknown')
    .sort((a, b) => b.enemyPressure - a.enemyPressure)
    .slice(0, 80)
  for (const tile of unknownTiles) {
    includeTile(tile.id)
  }

  return Array.from(selected.values()).slice(0, 280)
}


function buildRegionSummary(
  region: MapRegion,
  control: TileOwner,
  friendlyUnits: number,
  hostileUnits: number,
  averageEnemyPressure: number,
  scoutingCoverage: number,
  directive: AllianceDirective,
  commanderName: string,
  alliedSupport: number,
  recentBattlePressure: number,
  factionId: FactionId,
) {
  return `${region.name} 当前为${ownerLabel(control, factionId)}态势，${factionId} ${friendlyUnits} 支、对抗方 ${hostileUnits} 支，敌压均值 ${averageEnemyPressure}，侦察覆盖 ${scoutingCoverage}%。同盟由 ${commanderName} 执行 ${allianceStanceLabel(directive.stance)}，协同强度 ${alliedSupport}，战斗风险 ${recentBattlePressure}。`
}

function resolveRegionControl(
  friendlyControlledTiles: number,
  hostileControlledTiles: number,
  totalTiles: number,
  factionId: FactionId,
): TileOwner {
  if (friendlyControlledTiles > hostileControlledTiles && friendlyControlledTiles >= Math.ceil(totalTiles / 2)) {
    return factionId
  }

  if (hostileControlledTiles > friendlyControlledTiles && hostileControlledTiles >= Math.ceil(totalTiles / 2)) {
    return 'hostile'
  }

  return 'neutral'
}

function ownerLabel(owner: TileOwner, factionId: FactionId) {
  if (owner === factionId) {
    return '我方控制'
  }

  if (owner === 'neutral') {
    return '拉锯'
  }

  if (owner) {
    return '敌方控制'
  }

  return '拉锯'
}

function getAllianceDirective(world: WorldState, regionId: string): AllianceDirective {
  return (
    world.alliance.directives[regionId] ?? {
      regionId,
      stance: 'hold',
      assignedCommanderId: 'unassigned',
      supportLevel: 50,
      summary: '当前未设置同盟协同姿态。',
    }
  )
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}
