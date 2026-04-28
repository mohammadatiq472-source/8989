import type {
  AiPlayerActionCatalogEntry,
  AiPlayerDevelopmentPlan,
  AiPlayerDevelopmentPlanCandidateAction,
  AiPlayerDevelopmentPlanCandidateTile,
  AiPlayerDevelopmentPlanLoopStep,
  AiPlayerDevelopmentPlanResourceSnapshot,
  AiPlayerDevelopmentPlanRiskItem,
  AiPlayerDevelopmentPlanUnit,
  AiPlayerActionType,
  GovernedAiPlayerRuntimeDetail,
} from '../../../../shared/contracts/aiPlayer'
import type {
  ResourceTransferBundle,
  Tile,
  Unit,
  WorldState,
} from '../../../../shared/contracts/game/world'
import { getWorldStateReadonly } from '../world/WorldService'
import { listStaticAiPlayerActionCatalog } from './aiPlayerActionCatalog'

const RESOURCE_KEYS = ['food', 'wood', 'stone', 'iron'] as const
const DEVELOPMENT_TARGET_DEFAULT = 4000
const DEVELOPMENT_PLAN_ACTIONS = [
  'tile_occupy',
  'troop_heal',
  'march_move',
  'resource_gather',
  'formation_assign',
  'troop_train',
  'recruit_commander',
  'battle_report_read',
] as const

const DEVELOPMENT_RECOMMENDED_LOOP: Array<{
  action: AiPlayerActionType
  summary: string
  nextWhen: string
}> = [
  {
    action: 'tile_occupy',
    summary: '先把已经抵达的低风险中立地块转成正式占领，直接推进势力值和发育进度。',
    nextWhen: '部队站在目标格且资源足够时优先执行；如果还没到格，先看 march_move 的目标。',
  },
  {
    action: 'troop_heal',
    summary: '占地或战斗后先看损伤和补给，受损部队整补后再继续推进。',
    nextWhen: '战报显示失败、损伤偏高，或部队 strength/supply 不满时执行。',
  },
  {
    action: 'march_move',
    summary: '整补完成后移动到下一块相邻、低压力、可占领或可采集的地块。',
    nextWhen: '当前格没有可占领/可采集目标，或需要靠近下一块资源地时执行。',
  },
  {
    action: 'resource_gather',
    summary: '已经占有资源地时，把收益写入 AI 子账户，为后续输送和继续发育提供资源。',
    nextWhen: '部队位于己方资源地，且该地块还没有被本 AI 采集过时执行。',
  },
]

type DevelopmentPlanOptions = {
  targetDevelopmentPoints?: number
}

function emptyResources(): ResourceTransferBundle {
  return {
    food: 0,
    wood: 0,
    stone: 0,
    iron: 0,
  }
}

function normalizeResourceBundle(input?: Partial<ResourceTransferBundle> | null): ResourceTransferBundle {
  const normalized = emptyResources()
  for (const key of RESOURCE_KEYS) {
    normalized[key] = Math.max(0, Math.trunc(Number(input?.[key] ?? 0) || 0))
  }
  return normalized
}

function buildResourceSnapshot(world: Readonly<WorldState>, runtime: GovernedAiPlayerRuntimeDetail): AiPlayerDevelopmentPlanResourceSnapshot {
  const faction = world.factions[runtime.factionId]
  const aiAccount = faction?.aiResourceAccounts?.[runtime.aiPlayerId]
  return {
    faction: {
      ...normalizeResourceBundle({
        food: faction?.food ?? 0,
        wood: faction?.wood ?? 0,
        stone: faction?.stone ?? 0,
        iron: faction?.iron ?? 0,
      }),
      actionPoints: Math.max(0, Math.trunc(Number(faction?.actionPoints ?? 0) || 0)),
    },
    aiAccount: normalizeResourceBundle(aiAccount?.resources),
    aiAccountUpdatedTick: aiAccount?.updatedTick,
  }
}

function readAssignedUnitIds(world: Readonly<WorldState>, runtime: GovernedAiPlayerRuntimeDetail): Set<string> {
  const faction = world.factions[runtime.factionId]
  const assigned = new Set<string>()
  for (const unit of world.units) {
    if (unit.faction === runtime.factionId && unit.aiPlayerId === runtime.aiPlayerId) {
      assigned.add(unit.id)
    }
  }
  const aiPlayerGroup = faction?.aiPlayers?.find((player) => player.id === runtime.aiPlayerId)
  for (const unitId of aiPlayerGroup?.unitIds ?? []) {
    assigned.add(unitId)
  }
  return assigned
}

function buildAssignedUnits(world: Readonly<WorldState>, runtime: GovernedAiPlayerRuntimeDetail): AiPlayerDevelopmentPlanUnit[] {
  const assignedUnitIds = readAssignedUnitIds(world, runtime)
  return world.units
    .filter((unit) => unit.faction === runtime.factionId && assignedUnitIds.has(unit.id))
    .slice(0, 8)
    .map((unit) => ({
      unitId: unit.id,
      name: unit.name,
      tileId: unit.tileId,
      status: unit.status,
      strength: unit.strength,
      mobility: unit.mobility,
      supply: unit.supply,
      heroId: unit.hero.id,
      heroName: unit.hero.name,
      aiPlayerOwned: true,
      currentTask: unit.currentTask,
      neighborTileIds: [...(world.map.connections[unit.tileId] ?? [])].slice(0, 8),
    }))
}

function tileRisk(tile: Tile, factionId: string): AiPlayerDevelopmentPlanCandidateTile['risk'] {
  if (tile.owner === factionId && tile.type === 'resource') {
    return 'owned_resource'
  }
  if (tile.enemyPressure >= 70) {
    return 'enemy_pressure'
  }
  if (tile.owner && tile.owner !== factionId && tile.owner !== 'neutral') {
    return 'contested'
  }
  if (tile.enemyPressure <= 25) {
    return 'safe_neighbor'
  }
  return 'unknown'
}

function buildCandidateTile(
  tile: Tile,
  params: {
    runtime: GovernedAiPlayerRuntimeDetail
    unit?: Unit
    distance: number
    gatheredTileIds: Set<string>
  },
): AiPlayerDevelopmentPlanCandidateTile {
  const risk = tileRisk(tile, params.runtime.factionId)
  const isReadyResourceGather = Boolean(
    params.unit
      && tile.type === 'resource'
      && tile.owner === params.runtime.factionId
      && params.unit.tileId === tile.id
      && !params.gatheredTileIds.has(tile.id),
  )
  const isReadyTileOccupy = Boolean(
    params.unit
      && params.unit.tileId === tile.id
      && tile.owner === 'neutral'
      && tile.type !== 'city'
      && tile.type !== 'fog'
      && tile.enemyPressure <= 25,
  )
  const args = params.unit
    ? isReadyResourceGather || isReadyTileOccupy
      ? {
        unitId: params.unit.id,
        tileId: tile.id,
      }
      : {
        unitId: params.unit.id,
        targetTileId: tile.id,
      }
    : undefined
  const recommendedAction = params.unit
    ? isReadyResourceGather
      ? 'resource_gather'
      : isReadyTileOccupy
        ? 'tile_occupy'
        : 'march_move'
    : undefined
  const reason = recommendedAction === 'resource_gather'
    ? `部队已经在己方资源地 ${tile.id}，批准后采集收益入账 AI 子账户。`
    : recommendedAction === 'tile_occupy'
      ? `部队已经站在中立低风险地块 ${tile.id}，批准后占领该地并生成正式回执。`
      : `目标地块 ${tile.id} 是 AI 管辖部队附近的可移动格；批准后只移动，不自动占地或采集。`
  return {
    tileId: tile.id,
    name: tile.name,
    type: tile.type,
    owner: tile.owner,
    resourceKind: tile.resourceKind,
    resourceLevel: tile.resourceLevel,
    enemyPressure: tile.enemyPressure,
    moveCost: tile.moveCost,
    distance: params.distance,
    adjacentToUnitId: params.unit?.id,
    risk,
    recommendedAction,
    args,
    reason,
  }
}

function buildCandidateTiles(
  world: Readonly<WorldState>,
  runtime: GovernedAiPlayerRuntimeDetail,
  units: AiPlayerDevelopmentPlanUnit[],
): AiPlayerDevelopmentPlanCandidateTile[] {
  const tileById = new Map(world.map.tiles.map((tile) => [tile.id, tile] as const))
  const unitById = new Map(world.units.map((unit) => [unit.id, unit] as const))
  const gatheredTileIds = new Set(Object.keys(world.factions[runtime.factionId]?.aiResourceGatherClaims ?? {}))
  const candidates: AiPlayerDevelopmentPlanCandidateTile[] = []
  const seen = new Set<string>()

  for (const unitSummary of units) {
    const unit = unitById.get(unitSummary.unitId)
    if (!unit) {
      continue
    }
    const currentTile = tileById.get(unit.tileId)
    if (currentTile?.type === 'resource') {
      const key = `${unit.id}:${currentTile.id}:0`
      seen.add(key)
      candidates.push(buildCandidateTile(currentTile, {
        runtime,
        unit,
        distance: 0,
        gatheredTileIds,
      }))
    }
    for (const neighborId of world.map.connections[unit.tileId] ?? []) {
      const tile = tileById.get(neighborId)
      if (!tile) {
        continue
      }
      const key = `${unit.id}:${tile.id}:1`
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      candidates.push(buildCandidateTile(tile, {
        runtime,
        unit,
        distance: 1,
        gatheredTileIds,
      }))
    }
  }

  return candidates
    .sort((left, right) => {
      if (left.recommendedAction === 'resource_gather' && right.recommendedAction !== 'resource_gather') {
        return -1
      }
      if (right.recommendedAction === 'resource_gather' && left.recommendedAction !== 'resource_gather') {
        return 1
      }
      if (left.recommendedAction === 'tile_occupy' && right.recommendedAction !== 'tile_occupy') {
        return -1
      }
      if (right.recommendedAction === 'tile_occupy' && left.recommendedAction !== 'tile_occupy') {
        return 1
      }
      if (left.distance !== right.distance) {
        return left.distance - right.distance
      }
      if (left.enemyPressure !== right.enemyPressure) {
        return left.enemyPressure - right.enemyPressure
      }
      return left.tileId.localeCompare(right.tileId)
    })
    .slice(0, 12)
}

function findCatalogEntry(catalog: AiPlayerActionCatalogEntry[], action: string): AiPlayerActionCatalogEntry {
  const entry = catalog.find((item) => item.action === action)
  if (!entry) {
    throw new Error(`missing AI player action catalog entry: ${action}`)
  }
  return entry
}

function buildCandidateActions(
  runtime: GovernedAiPlayerRuntimeDetail,
  units: AiPlayerDevelopmentPlanUnit[],
  candidateTiles: AiPlayerDevelopmentPlanCandidateTile[],
  resources: AiPlayerDevelopmentPlanResourceSnapshot,
): AiPlayerDevelopmentPlanCandidateAction[] {
  const catalog = listStaticAiPlayerActionCatalog()
  const hasAssignedUnit = units.length > 0
  const firstUnit = units[0]
  const readyGatherTile = candidateTiles.find((tile) => tile.recommendedAction === 'resource_gather')
  const readyMoveTile = candidateTiles.find((tile) => tile.recommendedAction === 'march_move')
  const readyOccupyTile = candidateTiles.find((tile) => tile.recommendedAction === 'tile_occupy')
  const readyHealUnit = units.find((unit) => unit.strength < 100 || unit.supply < 9)
  const hasAiAccount = RESOURCE_KEYS.some((key) => resources.aiAccount[key] > 0) || resources.aiAccountUpdatedTick !== undefined
  const whitelistedActions = new Set(runtime.actionWhitelist)

  return DEVELOPMENT_PLAN_ACTIONS.map((action) => {
    const entry = findCatalogEntry(catalog, action)
    const blockers: string[] = []
    let readiness: AiPlayerDevelopmentPlanCandidateAction['readiness'] = 'ready'
    let args: Record<string, unknown> | undefined
    let reason = entry.notes ?? entry.label
    let proposalArgs: Record<string, unknown> | undefined
    let proposalReason: string | undefined
    let targetUnitId: string | undefined
    let targetTileId: string | undefined

    if (action === 'formation_assign') {
      if (!hasAssignedUnit) {
        blockers.push('no_assigned_unit')
        readiness = 'blocked'
      } else {
        args = {
          heroId: firstUnit.heroId,
          tacticId: 'logistics',
        }
        reason = '先给 AI 管辖武将设置战术倾向，作为发育链的低风险准备动作。'
      }
    } else if (action === 'march_move') {
      if (!hasAssignedUnit) {
        blockers.push('no_assigned_unit')
        readiness = 'blocked'
      } else if (!readyMoveTile) {
        blockers.push('no_adjacent_target')
        readiness = 'needs_target'
      } else {
        args = readyMoveTile.args
        proposalArgs = readyMoveTile.args
        proposalReason = readyMoveTile.reason
        targetUnitId = readyMoveTile.adjacentToUnitId
        targetTileId = readyMoveTile.tileId
        reason = `向地图目标地块 ${readyMoveTile.tileId} 行军；后端会校验相邻关系、移动力和目标合法性。`
      }
    } else if (action === 'resource_gather') {
      if (!hasAssignedUnit) {
        blockers.push('no_assigned_unit')
        readiness = 'blocked'
      }
      if (!hasAiAccount) {
        blockers.push('missing_ai_resource_account')
        readiness = 'blocked'
      }
      if (!readyGatherTile) {
        blockers.push('unit_not_on_owned_resource_tile')
        readiness = readiness === 'blocked' ? 'blocked' : 'needs_target'
      } else {
        args = readyGatherTile.args
        proposalArgs = readyGatherTile.args
        proposalReason = readyGatherTile.reason
        targetUnitId = readyGatherTile.adjacentToUnitId
        targetTileId = readyGatherTile.tileId
        reason = `部队已经驻扎在己方资源地 ${readyGatherTile.tileId}，可采集到 AI 子账户。`
      }
    } else if (action === 'troop_heal') {
      if (!hasAssignedUnit) {
        blockers.push('no_assigned_unit')
        readiness = 'blocked'
      } else if (resources.faction.actionPoints < 1 || resources.faction.food < 2) {
        blockers.push('resource_budget_low')
        readiness = 'blocked'
        reason = '行动点或粮草不足，补兵需要至少 1 行动点与 2 粮草。'
      } else if (!readyHealUnit) {
        blockers.push('unit_already_full')
        readiness = 'needs_target'
        reason = '当前 AI 管辖部队兵力和补给都充足，暂不需要整补。'
      } else {
        args = { unitId: readyHealUnit.unitId }
        proposalArgs = args
        proposalReason = `整补 ${readyHealUnit.name}，恢复兵力和补给后再继续发育。`
        targetUnitId = readyHealUnit.unitId
        reason = 'AI 管辖部队存在损伤或补给不足，可走 troop_heal 正式整补 authority。'
      }
    } else if (action === 'tile_occupy') {
      if (!hasAssignedUnit) {
        blockers.push('no_assigned_unit')
        readiness = 'blocked'
      } else if (resources.faction.actionPoints < 1 || resources.faction.food < 1) {
        blockers.push('resource_budget_low')
        readiness = 'blocked'
        reason = '行动点或粮草不足，占地需要至少 1 行动点与 1 粮草。'
      } else if (!readyOccupyTile) {
        blockers.push('unit_not_on_neutral_tile')
        readiness = 'needs_target'
        reason = '还没有 AI 管辖部队站在可占领的中立低风险地块上，先行军到目标格。'
      } else {
        args = readyOccupyTile.args
        proposalArgs = readyOccupyTile.args
        proposalReason = readyOccupyTile.reason
        targetUnitId = readyOccupyTile.adjacentToUnitId
        targetTileId = readyOccupyTile.tileId
        reason = `部队已到达中立低风险地块 ${readyOccupyTile.tileId}，可直接占领并推进发育目标。`
      }
    } else if (action === 'troop_train') {
      if (resources.faction.food <= 0) {
        blockers.push('insufficient_food')
        readiness = 'blocked'
      } else {
        reason = '发育到目标势力值需要可用部队；征兵仍通过正式 deployReserveHero authority。'
      }
    } else if (action === 'recruit_commander') {
      reason = '如果缺少可用武将，先走招募 proposal；抽卡和候选池由后端 authority 决定。'
    } else if (action === 'battle_report_read') {
      readiness = 'information_only'
      blockers.push('read_model_only')
      reason = '战报读取已接正式 /battle-reports 只读接口，用于判断损伤、胜负和下一步，不生成执行 proposal。'
    } else {
      readiness = 'information_only'
      blockers.push('not_executable_in_v1')
    }

    if (entry.executableInV1 && !whitelistedActions.has(entry.action)) {
      blockers.push('action_not_whitelisted')
      readiness = 'blocked'
      reason = `${reason} 当前 AI actionWhitelist 未开放该动作。`
    }

    return {
      action: entry.action,
      label: entry.label,
      executableInV1: entry.executableInV1,
      readiness,
      riskLevel: entry.riskLevel,
      mappedWorldAction: entry.mappedWorldAction,
      args,
      proposalArgs,
      proposalReason,
      targetUnitId,
      targetTileId,
      reason,
      blockers,
    }
  })
}

function buildRecommendedLoop(candidateActions: AiPlayerDevelopmentPlanCandidateAction[]): AiPlayerDevelopmentPlanLoopStep[] {
  const actionByType = new Map(candidateActions.map((action) => [action.action, action] as const))
  return DEVELOPMENT_RECOMMENDED_LOOP.map((step, index) => {
    const candidate = actionByType.get(step.action)
    return {
      order: index + 1,
      action: step.action,
      label: candidate?.label ?? step.action,
      readiness: candidate?.readiness ?? 'information_only',
      summary: step.summary,
      nextWhen: step.nextWhen,
      blockers: candidate?.blockers ?? ['action_not_in_plan'],
    }
  })
}

function buildRiskItems(
  runtime: GovernedAiPlayerRuntimeDetail,
  units: AiPlayerDevelopmentPlanUnit[],
  candidateActions: AiPlayerDevelopmentPlanCandidateAction[],
  resources: AiPlayerDevelopmentPlanResourceSnapshot,
): AiPlayerDevelopmentPlanRiskItem[] {
  const risks: AiPlayerDevelopmentPlanRiskItem[] = []
  if (units.length === 0) {
    risks.push({
      code: 'no_assigned_unit',
      severity: 'blocker',
      title: 'AI 还没有管辖部队',
      detail: '多 AI 读取世界时不能默认使用全势力部队；必须先把部队分配给当前 AI。',
      nextStep: '先在后端或配置中给该 AI 绑定 unitIds，再允许它生成移动、采集、占地相关提案。',
    })
  }
  if (resources.aiAccountUpdatedTick === undefined) {
    risks.push({
      code: 'missing_ai_resource_account',
      severity: 'warning',
      action: 'resource_gather',
      title: 'AI 资源子账户尚未初始化',
      detail: 'resource_gather 会把资源入账 AI 子账户；没有账户时后端会拒绝采集。',
      nextStep: '让正式资源账户初始化链先创建该 AI 的四类资源账户。',
    })
  }
  if (runtime.resourceTransfer.blockedBy) {
    const blockedBy = runtime.resourceTransfer.blockedBy
    risks.push({
      code: blockedBy,
      severity: blockedBy === 'daily_quota_exceeded' ? 'blocker' : 'warning',
      action: 'resource_transfer_to_governor',
      title: blockedBy === 'daily_quota_exceeded' ? '今日输送额度已耗尽' : '资源输送冷却中',
      detail: '后端 resourceTransfer runtime 已给出限制，UI 和模型都不能本地绕过。',
      nextStep: blockedBy === 'daily_quota_exceeded'
        ? '等待下一个额度窗口，或由总督调整正式额度策略。'
        : '等待冷却 tick 结束后再生成输送提案。',
    })
  }
  for (const action of candidateActions) {
    if (action.executableInV1 || !action.blockers.includes('not_executable_in_v1')) {
      continue
    }
    const titleByAction: Record<string, string> = {
      tile_occupy: '占地闭环尚未接 authority',
      troop_heal: '补兵/治疗尚未接 authority',
    }
    risks.push({
      code: `${action.action}_deferred`,
      severity: action.action === 'tile_occupy' ? 'blocker' : 'warning',
      action: action.action,
      title: titleByAction[action.action] ?? '动作尚未接入 v1',
      detail: action.reason,
      nextStep: '保持为风险项展示，不允许模型把它当作可执行 proposal。',
    })
  }
  return risks
}

export function buildAiPlayerDevelopmentPlan(
  runtime: GovernedAiPlayerRuntimeDetail,
  options: DevelopmentPlanOptions = {},
): AiPlayerDevelopmentPlan {
  const world = getWorldStateReadonly()
  const faction = world.factions[runtime.factionId]
  const targetDevelopmentPoints = Math.max(
    1,
    Math.trunc(Number(options.targetDevelopmentPoints ?? DEVELOPMENT_TARGET_DEFAULT) || DEVELOPMENT_TARGET_DEFAULT),
  )
  const currentDevelopmentPoints = Math.max(0, Math.trunc(Number(faction?.heroCommand.developmentPoints ?? 0) || 0))
  const remainingDevelopmentPoints = Math.max(0, targetDevelopmentPoints - currentDevelopmentPoints)
  const resources = buildResourceSnapshot(world, runtime)
  const units = buildAssignedUnits(world, runtime)
  const candidateTiles = buildCandidateTiles(world, runtime, units)
  const candidateActions = buildCandidateActions(
    runtime,
    units,
    candidateTiles,
    resources,
  )

  return {
    ok: true,
    aiPlayerId: runtime.aiPlayerId,
    factionId: runtime.factionId,
    governorPlayerId: runtime.governorPlayerId,
    tick: world.tick,
    worldVersion: world.worldVersion,
    generatedAt: new Date().toISOString(),
    goal: {
      kind: 'development_points',
      targetDevelopmentPoints,
      currentDevelopmentPoints,
      remainingDevelopmentPoints,
      summary: `从 ${currentDevelopmentPoints} 势力值推进到 ${targetDevelopmentPoints}，剩余 ${remainingDevelopmentPoints}。`,
    },
    resources,
    units,
    candidateTiles,
    candidateActions,
    recommendedLoop: buildRecommendedLoop(candidateActions),
    riskItems: buildRiskItems(runtime, units, candidateActions, resources),
  }
}
