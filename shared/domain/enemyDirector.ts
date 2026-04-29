import { performance } from 'node:perf_hooks'
import { buildTheaterSnapshot } from './theater'
import type { AiRuntimeAdvanceTickSubphaseTiming, Tile, Unit, WorldState } from '../contracts/game'

type EnemyDirectorOptions = {
  defenderFactionId: string
  targetFactionId: string
  diagnostics?: OpposingDirectorDiagnostics
}

export type OpposingDirectorOptions = EnemyDirectorOptions
export type OpposingDirectorDiagnostics = {
  subphases?: AiRuntimeAdvanceTickSubphaseTiming[]
}
export type OpposingActionTrace = {
  summary: string
  unitId?: string
  tileId?: string
  fromTileId?: string
  toTileId?: string
  factionId: string
}
export type OpposingDirectorResult = {
  actions: string[]
  traces: OpposingActionTrace[]
}

type OpposingDirectorIndexes = {
  regionSummaryById: Map<string, ReturnType<typeof buildTheaterSnapshot>['macroRegions'][number]>
  tileById: Map<string, Tile>
  unitById: Map<string, Unit>
  targetOccupiedTileIds: Set<string>
}

type OpposingActionRecorder = (
  summary: string,
  context?: {
    unitId?: string
    tileId?: string
    fromTileId?: string
    toTileId?: string
  },
) => void

type OpposingDirectorRuntime = {
  world: WorldState
  defenderFactionId: string
  targetFactionId: string
  indexes: OpposingDirectorIndexes
  diagnostics?: OpposingDirectorDiagnostics
  recordAction: OpposingActionRecorder
}

function measureOpposingDirectorSubphase<T>(
  diagnostics: OpposingDirectorDiagnostics | undefined,
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

function measureOpposingScriptSubphase<T>(
  diagnostics: OpposingDirectorDiagnostics | undefined,
  suffix: string,
  work: () => T,
) {
  return measureOpposingDirectorSubphase(
    diagnostics,
    `advance_world_state.directors_and_theater.opposing_director.${suffix}`,
    work,
  )
}

function buildOpposingDirectorIndexes(
  world: WorldState,
  theater: ReturnType<typeof buildTheaterSnapshot>,
  targetFactionId: string,
  diagnostics: OpposingDirectorDiagnostics | undefined,
): OpposingDirectorIndexes {
  const regionSummaryById = measureOpposingDirectorSubphase(
    diagnostics,
    'advance_world_state.directors_and_theater.opposing_director.build_region_summary_index',
    () => new Map(theater.macroRegions.map((summary) => [summary.id, summary])),
  )
  const tileById = measureOpposingDirectorSubphase(
    diagnostics,
    'advance_world_state.directors_and_theater.opposing_director.build_tile_index',
    () => new Map(world.map.tiles.map((tile) => [tile.id, tile])),
  )
  const unitById = measureOpposingDirectorSubphase(
    diagnostics,
    'advance_world_state.directors_and_theater.opposing_director.build_unit_index',
    () => new Map(world.units.map((unit) => [unit.id, unit])),
  )
  const targetOccupiedTileIds = measureOpposingDirectorSubphase(
    diagnostics,
    'advance_world_state.directors_and_theater.opposing_director.build_target_occupied_tile_set',
    () => new Set(world.units.filter((unit) => unit.faction === targetFactionId).map((unit) => unit.tileId)),
  )

  return {
    regionSummaryById,
    tileById,
    unitById,
    targetOccupiedTileIds,
  }
}

function applyOpposingScoutReposition(
  runtime: OpposingDirectorRuntime,
  northRecon: ReturnType<typeof buildTheaterSnapshot>['macroRegions'][number] | undefined,
) {
  measureOpposingScriptSubphase(runtime.diagnostics, 'apply_scout_reposition', () => {
    const scout = runtime.indexes.unitById.get('e2')
    if (!scout) {
      return
    }

    const nextScoutTileId = (northRecon?.scoutingCoverage ?? 0) >= 60 ? 'tile_05' : 'tile_04'
    const nextScoutTile = runtime.indexes.tileById.get(nextScoutTileId)

    if (
      nextScoutTile &&
      scout.tileId !== nextScoutTile.id &&
      canOpposingUnitMoveInto(runtime.indexes.targetOccupiedTileIds, nextScoutTile)
    ) {
      const fromScoutTileId = scout.tileId
      scout.tileId = nextScoutTile.id
      scout.status = '侦察中'
      scout.currentTask = `盯防${nextScoutTile.name}`
      runtime.recordAction(`敌侦察转移至 ${nextScoutTile.name}`, {
        unitId: scout.id,
        tileId: nextScoutTile.id,
        fromTileId: fromScoutTileId,
        toTileId: nextScoutTile.id,
      })
    }
  })
}

function applyOpposingWestFrontPressure(
  runtime: OpposingDirectorRuntime,
  westFront: ReturnType<typeof buildTheaterSnapshot>['macroRegions'][number] | undefined,
) {
  measureOpposingScriptSubphase(runtime.diagnostics, 'apply_west_front_pressure', () => {
    const westPass = runtime.indexes.tileById.get('tile_06')
    const riverPlain = runtime.indexes.tileById.get('tile_07')

    if (westPass && westFront && (westFront.friendlyUnits >= 1 || westFront.control !== runtime.defenderFactionId)) {
      westPass.enemyPressure = Math.min(5, westPass.enemyPressure + 1)
      runtime.recordAction(`敌方对 ${westPass.name} 增加强压`, {
        tileId: westPass.id,
        toTileId: westPass.id,
      })
    }

    if (riverPlain && westFront && westFront.friendlyUnits >= 2) {
      riverPlain.enemyPressure = Math.min(5, riverPlain.enemyPressure + 1)
      runtime.recordAction(`敌方对 ${riverPlain.name} 实施压制`, {
        tileId: riverPlain.id,
        toTileId: riverPlain.id,
      })
    }
  })
}

function applyOpposingReserveAnchor(runtime: OpposingDirectorRuntime) {
  measureOpposingScriptSubphase(runtime.diagnostics, 'apply_reserve_anchor', () => {
    const reserve = runtime.indexes.unitById.get('e4')
    const northJunction = runtime.indexes.tileById.get('tile_09')
    if (!reserve || !northJunction) {
      return
    }

    const fromReserveTileId = reserve.tileId
    reserve.tileId = 'tile_09'
    reserve.status = '驻防中'
    reserve.currentTask = `压住${northJunction.name}`
    northJunction.enemyPressure = Math.min(5, northJunction.enemyPressure + 1)
    runtime.recordAction(`敌机动稳固 ${northJunction.name}`, {
      unitId: reserve.id,
      tileId: northJunction.id,
      fromTileId: fromReserveTileId,
      toTileId: northJunction.id,
    })
  })
}

function applyOpposingMidSupplyProbe(
  runtime: OpposingDirectorRuntime,
  theater: ReturnType<typeof buildTheaterSnapshot>,
) {
  measureOpposingScriptSubphase(runtime.diagnostics, 'apply_mid_supply_probe', () => {
    const midSupply = runtime.indexes.tileById.get('tile_13')
    if (!midSupply || theater.supplyLineHealth < 60) {
      return
    }

    midSupply.enemyPressure = Math.min(5, midSupply.enemyPressure + 1)
    runtime.recordAction(`敌军开始试探 ${midSupply.name}，意图切断我方补给线`, {
      tileId: midSupply.id,
      toTileId: midSupply.id,
    })
  })
}

function applyOpposingFortressHold(runtime: OpposingDirectorRuntime) {
  measureOpposingScriptSubphase(runtime.diagnostics, 'apply_fortress_hold', () => {
    const fortress = runtime.indexes.unitById.get('e1')
    if (!fortress) {
      return
    }

    fortress.status = '驻防中'
    fortress.currentTask = '固守赤垒要塞'
  })
}

function applyOpposingEasternGuardHold(runtime: OpposingDirectorRuntime) {
  measureOpposingScriptSubphase(runtime.diagnostics, 'apply_eastern_guard_hold', () => {
    const easternGuard = runtime.indexes.unitById.get('e3')
    const easternPass = runtime.indexes.tileById.get('tile_15')
    if (!easternGuard || !easternPass) {
      return
    }

    easternGuard.status = '驻防中'
    easternGuard.currentTask = `卡住${easternPass.name}`
    easternPass.enemyPressure = Math.min(5, easternPass.enemyPressure + 1)
    runtime.recordAction(`敌左翼强化 ${easternPass.name}`, {
      unitId: easternGuard.id,
      tileId: easternPass.id,
      fromTileId: easternGuard.tileId,
      toTileId: easternPass.id,
    })
  })
}

function applyOpposingEastExpansionPressure(
  runtime: OpposingDirectorRuntime,
  eastExpansion: ReturnType<typeof buildTheaterSnapshot>['macroRegions'][number] | undefined,
) {
  measureOpposingScriptSubphase(runtime.diagnostics, 'apply_east_expansion_pressure', () => {
    const eastResource = runtime.indexes.tileById.get('tile_14')
    if (
      !eastResource ||
      !eastExpansion ||
      (eastExpansion.friendlyUnits <= 0 && eastExpansion.friendlyControlledTiles <= 0)
    ) {
      return
    }

    eastResource.enemyPressure = Math.min(5, eastResource.enemyPressure + 1)
    runtime.recordAction(`敌军察觉我方向 ${eastResource.name} 发育，开始加压`, {
      tileId: eastResource.id,
      toTileId: eastResource.id,
    })
  })
}

function processUnhandledOpposingUnits(runtime: OpposingDirectorRuntime) {
  const handledUnitIds = new Set(['e1', 'e2', 'e3', 'e4'])
  const unhandledOpposingUnits = measureOpposingDirectorSubphase(
    runtime.diagnostics,
    'advance_world_state.directors_and_theater.opposing_director.build_unhandled_unit_list',
    () =>
      runtime.world.units.filter(
        (unit) => unit.faction === runtime.defenderFactionId && !handledUnitIds.has(unit.id),
      ),
  )

  measureOpposingScriptSubphase(runtime.diagnostics, 'process_unhandled_units', () => {
    for (const unit of unhandledOpposingUnits) {
      const currentTile = runtime.indexes.tileById.get(unit.tileId)
      if (!currentTile) continue

      const neighborTiles = measureOpposingScriptSubphase(
        runtime.diagnostics,
        'process_unhandled_units.collect_neighbor_tiles',
        () => {
          const connectedIds: string[] = runtime.world.map.connections[currentTile.id] ?? []
          return connectedIds
            .map((id: string) => runtime.indexes.tileById.get(id))
            .filter((tile): tile is Tile => tile !== undefined)
        },
      )

      if (currentTile.owner === runtime.defenderFactionId) {
        unit.status = '驻防中'
        unit.currentTask = `驻守 ${currentTile.name}`
        currentTile.enemyPressure = Math.min(5, currentTile.enemyPressure + 1)
        continue
      }

      const moveTarget = measureOpposingScriptSubphase(
        runtime.diagnostics,
        'process_unhandled_units.select_move_target',
        () => selectOpposingMoveTarget(runtime, neighborTiles),
      )

      if (moveTarget) {
        measureOpposingScriptSubphase(runtime.diagnostics, 'process_unhandled_units.apply_move', () => {
          const fromTileId = unit.tileId
          unit.tileId = moveTarget.id
          unit.status = '行军中'
          unit.currentTask = `向 ${moveTarget.name} 推进`
          moveTarget.enemyPressure = Math.min(5, moveTarget.enemyPressure + 1)
          runtime.recordAction(`敌 ${unit.name} 向 ${moveTarget.name} 推进`, {
            unitId: unit.id,
            tileId: moveTarget.id,
            fromTileId,
            toTileId: moveTarget.id,
          })
        })
      }
    }
  })
}

function selectOpposingMoveTarget(runtime: OpposingDirectorRuntime, neighborTiles: Tile[]) {
  return measureOpposingScriptSubphase(
    runtime.diagnostics,
    'process_unhandled_units.select_move_target.scan_candidates',
    () => {
      let bestTile: Tile | undefined
      let bestScore = Number.NEGATIVE_INFINITY
      for (const tile of neighborTiles) {
        if (!canOpposingUnitMoveInto(runtime.indexes.targetOccupiedTileIds, tile)) {
          continue
        }

        const score =
          (tile.owner === runtime.targetFactionId ? 3 : 0) +
          (tile.type === 'resource' ? 2 : 0) +
          (tile.type === 'pass' ? 2 : 0)
        if (score > bestScore) {
          bestScore = score
          bestTile = tile
        }
      }
      return bestTile
    },
  )
}

function resolveDefaultOpposingDirectorOptions(world: WorldState): OpposingDirectorOptions {
  const factionIds = Object.keys(world.factions)
  const targetFactionId = factionIds[0] ?? 'neutral'
  const defenderFactionId = factionIds.find((factionId) => factionId !== targetFactionId) ?? targetFactionId
  return { defenderFactionId, targetFactionId }
}

export function runOpposingDirector(world: WorldState, options?: OpposingDirectorOptions) {
  return runOpposingDirectorDetailed(world, options).actions
}

export function runOpposingDirectorDetailed(
  world: WorldState,
  options?: OpposingDirectorOptions,
): OpposingDirectorResult {
  const resolvedOptions = options ?? resolveDefaultOpposingDirectorOptions(world)
  const { defenderFactionId, targetFactionId, diagnostics } = resolvedOptions
  const actions: string[] = []
  const traces: OpposingActionTrace[] = []
  const recordAction: OpposingActionRecorder = (
    summary,
    context = {},
  ) => {
    actions.push(summary)
    traces.push({
      summary,
      factionId: defenderFactionId,
      unitId: context.unitId,
      tileId: context.tileId,
      fromTileId: context.fromTileId,
      toTileId: context.toTileId,
    })
  }

  const theater = measureOpposingDirectorSubphase(
    diagnostics,
    'advance_world_state.directors_and_theater.opposing_director.build_theater_snapshot',
    () =>
      buildTheaterSnapshot(
        world,
        targetFactionId,
        diagnostics,
        'advance_world_state.directors_and_theater.opposing_director.build_theater_snapshot',
      ),
  )
  const indexes = buildOpposingDirectorIndexes(world, theater, targetFactionId, diagnostics)
  const northRecon = indexes.regionSummaryById.get('north_recon')
  const westFront = indexes.regionSummaryById.get('west_front')
  const eastExpansion = indexes.regionSummaryById.get('east_expansion')
  const runtime: OpposingDirectorRuntime = {
    world,
    defenderFactionId,
    targetFactionId,
    indexes,
    diagnostics,
    recordAction,
  }

  applyOpposingScoutReposition(runtime, northRecon)
  applyOpposingWestFrontPressure(runtime, westFront)
  applyOpposingReserveAnchor(runtime)
  applyOpposingMidSupplyProbe(runtime, theater)
  applyOpposingFortressHold(runtime)
  applyOpposingEasternGuardHold(runtime)
  applyOpposingEastExpansionPressure(runtime, eastExpansion)
  processUnhandledOpposingUnits(runtime)

  return { actions, traces }
}

function canOpposingUnitMoveInto(targetOccupiedTileIds: Set<string>, tile: Tile) {
  return !targetOccupiedTileIds.has(tile.id)
}

// Backward compatibility: keep old API export name while semantic naming migrates.
export function runEnemyDirector(world: WorldState, options?: EnemyDirectorOptions) {
  return runOpposingDirector(world, options)
}
