import { performance } from 'node:perf_hooks'
import { buildTheaterSnapshot, getRegionById } from './theater'
import type { AiRuntimeAdvanceTickSubphaseTiming, AllianceActionSummary, AlliedCommander, MapRegion, Tile, Unit, WorldState } from '../contracts/game'

export type AllianceDirectorDiagnostics = {
  subphases?: AiRuntimeAdvanceTickSubphaseTiming[]
}

function measureAllianceDirectorSubphase<T>(
  diagnostics: AllianceDirectorDiagnostics | undefined,
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

function resolveDefaultBeneficiaryFactionId(world: WorldState) {
  const factionIds = Object.keys(world.factions)
  return factionIds.find((factionId) => factionId !== 'neutral') ?? factionIds[0] ?? 'neutral'
}

function resolvePrimaryRivalFactionId(world: WorldState, beneficiaryFactionId: string) {
  return Object.keys(world.factions).find((factionId) => factionId !== beneficiaryFactionId) ?? beneficiaryFactionId
}

type AllianceDirectorIndexes = {
  regionSummaryById: Map<string, ReturnType<typeof buildTheaterSnapshot>['macroRegions'][number]>
  commanderById: Map<string, AlliedCommander>
  tileById: Map<string, Tile>
  beneficiaryUnits: Unit[]
  beneficiaryUnitTileIds: Set<string>
}

type AllianceDirectiveExecutionContext = {
  world: WorldState
  beneficiaryFactionId: string
  region: MapRegion
  commander: AlliedCommander
  targetTile: Tile
  anchorUnit?: Unit
  indexes: AllianceDirectorIndexes
  diagnostics?: AllianceDirectorDiagnostics
}

function buildAllianceDirectorIndexes(
  world: WorldState,
  theater: ReturnType<typeof buildTheaterSnapshot>,
  beneficiaryFactionId: string,
  diagnostics?: AllianceDirectorDiagnostics,
): AllianceDirectorIndexes {
  const regionSummaryById = measureAllianceDirectorSubphase(
    diagnostics,
    'advance_world_state.directors_and_theater.alliance_director.build_region_summary_index',
    () => new Map(theater.macroRegions.map((summary) => [summary.id, summary])),
  )
  const commanderById = measureAllianceDirectorSubphase(
    diagnostics,
    'advance_world_state.directors_and_theater.alliance_director.build_commander_index',
    () => new Map(world.alliance.commanders.map((commander) => [commander.id, commander])),
  )
  const tileById = measureAllianceDirectorSubphase(
    diagnostics,
    'advance_world_state.directors_and_theater.alliance_director.build_tile_index',
    () => new Map(world.map.tiles.map((tile) => [tile.id, tile])),
  )
  const beneficiaryUnits = measureAllianceDirectorSubphase(
    diagnostics,
    'advance_world_state.directors_and_theater.alliance_director.build_beneficiary_unit_index',
    () => world.units.filter((unit) => unit.faction === beneficiaryFactionId),
  )
  const beneficiaryUnitTileIds = measureAllianceDirectorSubphase(
    diagnostics,
    'advance_world_state.directors_and_theater.alliance_director.build_beneficiary_unit_tile_set',
    () => new Set(beneficiaryUnits.map((unit) => unit.tileId)),
  )

  return {
    regionSummaryById,
    commanderById,
    tileById,
    beneficiaryUnits,
    beneficiaryUnitTileIds,
  }
}

function updateAllianceTargetPressure(
  context: AllianceDirectiveExecutionContext,
  subphasePrefix: string,
) {
  measureAllianceDirectorSubphase(
    context.diagnostics,
    `${subphasePrefix}.decrease_enemy_pressure`,
    () => {
      context.targetTile.enemyPressure = Math.max(0, context.targetTile.enemyPressure - 1)
    },
  )
}

function buildAllianceActionContext(context: AllianceDirectiveExecutionContext) {
  return {
    factionId: context.beneficiaryFactionId,
    unitId: context.anchorUnit?.id,
    tileId: context.targetTile.id,
    fromTileId: context.anchorUnit?.tileId,
    toTileId: context.targetTile.id,
  }
}

function appendAllianceDirectiveAction(
  actions: AllianceActionSummary[],
  context: AllianceDirectiveExecutionContext,
  subphasePrefix: string,
  severity: AllianceActionSummary['severity'],
  title: string,
  detail: string,
) {
  const action = measureAllianceDirectorSubphase(
    context.diagnostics,
    `${subphasePrefix}.append_action`,
    () =>
      createAllianceAction(
        context.world,
        context.region.id,
        severity,
        title,
        detail,
        buildAllianceActionContext(context),
      ),
  )
  actions.push(action)
}

function applyAllianceHold(
  actions: AllianceActionSummary[],
  context: AllianceDirectiveExecutionContext,
) {
  measureAllianceDirectorSubphase(
    context.diagnostics,
    'advance_world_state.directors_and_theater.alliance_director.apply_stance_hold',
    () => {
      updateAllianceTargetPressure(
        context,
        'advance_world_state.directors_and_theater.alliance_director.apply_stance_hold',
      )
      appendAllianceDirectiveAction(
        actions,
        context,
        'advance_world_state.directors_and_theater.alliance_director.apply_stance_hold',
        'low',
        `${context.commander.name} 稳住 ${context.region.name}`,
        `${context.commander.name} 在 ${context.targetTile.name} 加固警戒，压低敌压并维持补给秩序。`,
      )
    },
  )
}

function applyAllianceSupport(
  actions: AllianceActionSummary[],
  context: AllianceDirectiveExecutionContext,
) {
  measureAllianceDirectorSubphase(
    context.diagnostics,
    'advance_world_state.directors_and_theater.alliance_director.apply_stance_support',
    () => {
      updateAllianceTargetPressure(
        context,
        'advance_world_state.directors_and_theater.alliance_director.apply_stance_support',
      )
      const regionTileIdSet = measureAllianceDirectorSubphase(
        context.diagnostics,
        'advance_world_state.directors_and_theater.alliance_director.apply_stance_support.build_region_tile_set',
        () => new Set(context.region.tileIds),
      )
      measureAllianceDirectorSubphase(
        context.diagnostics,
        'advance_world_state.directors_and_theater.alliance_director.apply_stance_support.boost_regional_supply',
        () => {
          for (const unit of context.indexes.beneficiaryUnits) {
            if (regionTileIdSet.has(unit.tileId)) {
              unit.supply = Math.min(9, unit.supply + 1)
            }
          }
        },
      )
      appendAllianceDirectiveAction(
        actions,
        context,
        'advance_world_state.directors_and_theater.alliance_director.apply_stance_support',
        'medium',
        `${context.commander.name} 策应 ${context.region.name}`,
        `${context.commander.name} 向 ${context.region.name} 输送补给和侧翼策应，减轻 ${context.targetTile.name} 压力。`,
      )
    },
  )
}

function applyAllianceHarass(
  actions: AllianceActionSummary[],
  context: AllianceDirectiveExecutionContext,
) {
  measureAllianceDirectorSubphase(
    context.diagnostics,
    'advance_world_state.directors_and_theater.alliance_director.apply_stance_harass',
    () => {
      updateAllianceTargetPressure(
        context,
        'advance_world_state.directors_and_theater.alliance_director.apply_stance_harass',
      )
      measureAllianceDirectorSubphase(
        context.diagnostics,
        'advance_world_state.directors_and_theater.alliance_director.apply_stance_harass.refresh_intel',
        () => {
          context.world.intel[context.targetTile.id] = {
            level: 'confirmed',
            lastScoutedTick: context.world.tick,
            summary: `盟友骚扰后回传：${context.targetTile.name} 敌压 ${context.targetTile.enemyPressure}。`,
          }
        },
      )
      appendAllianceDirectiveAction(
        actions,
        context,
        'advance_world_state.directors_and_theater.alliance_director.apply_stance_harass',
        'medium',
        `${context.commander.name} 骚扰 ${context.targetTile.name}`,
        `${context.commander.name} 对 ${context.targetTile.name} 发起袭扰并共享视野，压低敌军组织度。`,
      )
    },
  )
}

function applyAllianceExpand(
  actions: AllianceActionSummary[],
  context: AllianceDirectiveExecutionContext,
) {
  measureAllianceDirectorSubphase(
    context.diagnostics,
    'advance_world_state.directors_and_theater.alliance_director.apply_stance_expand',
    () => {
      updateAllianceTargetPressure(
        context,
        'advance_world_state.directors_and_theater.alliance_director.apply_stance_expand',
      )
      measureAllianceDirectorSubphase(
        context.diagnostics,
        'advance_world_state.directors_and_theater.alliance_director.apply_stance_expand.claim_neutral_resource',
        () => {
          if (context.targetTile.owner === 'neutral' && context.targetTile.type === 'resource') {
            context.targetTile.owner = context.beneficiaryFactionId
          }
        },
      )
      appendAllianceDirectiveAction(
        actions,
        context,
        'advance_world_state.directors_and_theater.alliance_director.apply_stance_expand',
        'high',
        `${context.commander.name} 推进 ${context.region.name}`,
        `${context.commander.name} 在 ${context.targetTile.name} 展开同盟先遣推进，为我方打开发展或接敌空间。`,
      )
    },
  )
}

function applyAllianceDirectiveByStance(
  actions: AllianceActionSummary[],
  stance: string,
  context: AllianceDirectiveExecutionContext,
) {
  switch (stance) {
    case 'hold':
      applyAllianceHold(actions, context)
      break
    case 'support':
      applyAllianceSupport(actions, context)
      break
    case 'harass':
      applyAllianceHarass(actions, context)
      break
    case 'expand':
      applyAllianceExpand(actions, context)
      break
  }
}

export function runAllianceDirector(
  world: WorldState,
  beneficiaryFactionId: string = resolveDefaultBeneficiaryFactionId(world),
  diagnostics?: AllianceDirectorDiagnostics,
) {
  const actions: AllianceActionSummary[] = []
  const rivalFactionId = resolvePrimaryRivalFactionId(world, beneficiaryFactionId)
  const theater = measureAllianceDirectorSubphase(
    diagnostics,
    'advance_world_state.directors_and_theater.alliance_director.build_theater_snapshot',
    () =>
      buildTheaterSnapshot(
        world,
        beneficiaryFactionId,
        diagnostics,
        'advance_world_state.directors_and_theater.alliance_director.build_theater_snapshot',
      ),
  )
  const indexes = buildAllianceDirectorIndexes(world, theater, beneficiaryFactionId, diagnostics)

  for (const directive of Object.values(world.alliance.directives)) {
    const context = measureAllianceDirectorSubphase(
      diagnostics,
      'advance_world_state.directors_and_theater.alliance_director.resolve_directive_context',
      () => ({
        region: getRegionById(world, directive.regionId),
        regionSummary: indexes.regionSummaryById.get(directive.regionId),
        commander: indexes.commanderById.get(directive.assignedCommanderId),
      }),
    )
    const region = context.region
    const regionSummary = context.regionSummary
    const commander = context.commander

    if (!region || !regionSummary || !commander) {
      continue
    }

    const targetTile = measureAllianceDirectorSubphase(
      diagnostics,
      'advance_world_state.directors_and_theater.alliance_director.pick_target_tile',
      () => pickAllianceTargetTile(indexes, region, directive.stance, rivalFactionId, diagnostics),
    )
    if (!targetTile) {
      continue
    }
    const anchorUnit = measureAllianceDirectorSubphase(
      diagnostics,
      'advance_world_state.directors_and_theater.alliance_director.pick_anchor_unit',
      () => pickAllianceAnchorUnit(indexes, region, diagnostics),
    )
    applyAllianceDirectiveByStance(actions, directive.stance, {
      world,
      beneficiaryFactionId,
      region,
      commander,
      targetTile,
      anchorUnit,
      indexes,
      diagnostics,
    })
  }

  if (actions.length > 0) {
    measureAllianceDirectorSubphase(
      diagnostics,
      'advance_world_state.directors_and_theater.alliance_director.commit_feedback_actions',
      () => {
        world.feedback.allianceActions = [...actions, ...world.feedback.allianceActions].slice(0, 8)
      },
    )
  }

  return actions
}

function pickAllianceTargetTile(
  indexes: AllianceDirectorIndexes,
  region: MapRegion,
  stance: string,
  rivalFactionId: string,
  diagnostics?: AllianceDirectorDiagnostics,
) {
  const regionTiles = measureAllianceDirectorSubphase(
    diagnostics,
    'advance_world_state.directors_and_theater.alliance_director.pick_target_tile.collect_region_tiles',
    () =>
      region.tileIds
        .map((tileId) => indexes.tileById.get(tileId))
        .filter((tile): tile is Tile => !!tile),
  )

  return measureAllianceDirectorSubphase(
    diagnostics,
    'advance_world_state.directors_and_theater.alliance_director.pick_target_tile.select_candidate',
    () => {
      let lowestPressureTile: Tile | undefined
      let highestPressureTile: Tile | undefined
      let supportAnchorTile: Tile | undefined
      let expandableResourceTile: Tile | undefined

      for (const tile of regionTiles) {
        if (!lowestPressureTile || tile.enemyPressure < lowestPressureTile.enemyPressure) {
          lowestPressureTile = tile
        }
        if (!highestPressureTile || tile.enemyPressure > highestPressureTile.enemyPressure) {
          highestPressureTile = tile
        }
        if (!supportAnchorTile && indexes.beneficiaryUnitTileIds.has(tile.id)) {
          supportAnchorTile = tile
        }
        if (!expandableResourceTile && tile.type === 'resource' && tile.owner !== rivalFactionId) {
          expandableResourceTile = tile
        }
      }

      if (stance === 'expand') {
        return expandableResourceTile ?? highestPressureTile
      }

      if (stance === 'harass') {
        return highestPressureTile
      }

      if (stance === 'support') {
        return supportAnchorTile ?? highestPressureTile
      }

      return lowestPressureTile
    },
  )
}

function createAllianceAction(
  world: WorldState,
  regionId: string,
  severity: AllianceActionSummary['severity'],
  title: string,
  detail: string,
  context?: {
    factionId?: string
    unitId?: string
    tileId?: string
    fromTileId?: string
    toTileId?: string
  },
): AllianceActionSummary {
  return {
    id: `${world.tick}-${regionId}-${title}`,
    tick: world.tick,
    regionId,
    title,
    detail,
    severity,
    factionId: context?.factionId,
    unitId: context?.unitId,
    tileId: context?.tileId,
    fromTileId: context?.fromTileId,
    toTileId: context?.toTileId,
  }
}

function pickAllianceAnchorUnit(
  indexes: AllianceDirectorIndexes,
  region: MapRegion,
  diagnostics?: AllianceDirectorDiagnostics,
) {
  const regionTileIdSet = measureAllianceDirectorSubphase(
    diagnostics,
    'advance_world_state.directors_and_theater.alliance_director.pick_anchor_unit.build_region_tile_set',
    () => new Set(region.tileIds),
  )
  return measureAllianceDirectorSubphase(
    diagnostics,
    'advance_world_state.directors_and_theater.alliance_director.pick_anchor_unit.scan_units',
    () =>
      indexes.beneficiaryUnits.find((unit) => regionTileIdSet.has(unit.tileId)) ??
      indexes.beneficiaryUnits[0],
  )
}
