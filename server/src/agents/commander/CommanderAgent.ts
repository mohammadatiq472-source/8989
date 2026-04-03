import type {
  PlannerConfig,
  PlannerResult,
  StrategicPlan,
  StructuredOrder,
  WorldState,
} from '../../../../shared/contracts/game'
import { parsePlannerResult } from '../../../../shared/schemas/planning'
import { createMockPlan } from '../../fallback/mockPlanner'
import { createPlanningResultViaModelGateway } from '../../infra/llm/ModelGatewayAdapter'
import { getMemoryProvider } from '../memory/MemoryStore'
import { buildCommanderToolContextForFaction, type CommanderToolContext } from '../tools/CommanderTools'

export async function createCommanderPlan(
  world: WorldState,
  strategicCommand: string,
  config: PlannerConfig,
  factionId?: string,
): Promise<PlannerResult> {
  const targetFactionId = resolveTargetFactionId(world, factionId)
  const memoryProvider = await getMemoryProvider()
  const commanderId = resolveCommanderAgentId(targetFactionId)
  const memoryRecall = await safeRecall(memoryProvider, commanderId, strategicCommand)
  const toolContext = {
    ...(await buildCommanderToolContextForFaction(world, strategicCommand, targetFactionId)),
    memoryRecall,
  }

  const rawResult =
    config.mode === 'mock'
      ? createMockPlan(world, strategicCommand, targetFactionId)
      : await createPlanningResultViaModelGateway(strategicCommand, config, toolContext)

  const validated = parsePlannerResult(rawResult)
  const guardResult = guardPlan(validated.plan, toolContext)
  const guardedNote = mergeGuardNote(validated.note, guardResult)

  await safeRemember(memoryProvider, commanderId, world, strategicCommand, guardResult, targetFactionId)

  return {
    ...validated,
    plan: guardResult.plan,
    note: guardedNote,
    explanation: mergeExplanation(validated.explanation, guardResult, strategicCommand),
    planningRationale: mergePlanningRationale(validated.planningRationale, guardResult),
  }
}

type GuardResult = {
  plan: StrategicPlan
  droppedOrders: number
  reasons: string[]
}

function guardPlan(plan: StrategicPlan, context: CommanderToolContext): GuardResult {
  const allowedUnits = new Set(
    context.availableUnits.filter((unit) => unit.available).map((unit) => unit.id),
  )
  const allowedTiles = new Set(context.worldSnapshot.localLayer.tiles.map((tile) => tile.id))
  // march 动作的目标可以是地图上任意格（如向洛阳行军），不限于 localLayer
  // tile ID 格式: grid_X_Y 或 luoyang_X_Y 或其他前缀_X_Y
  const globalTilePattern = /^[a-z]+_\d+_\d+$/
  const allowedActions = new Set(context.allowedActions)
  const seenUnits = new Set<string>()
  const nextOrders: StructuredOrder[] = []
  const reasons = new Set<string>()

  const maxOrders = Math.max(8, context.availableUnits.filter(u => u.available).length)
  for (const order of plan.orders.slice(0, maxOrders)) {
    if (!allowedActions.has(order.action)) {
      reasons.add('guard_invalid_action')
      continue
    }

    if (!allowedUnits.has(order.unitId)) {
      reasons.add('guard_unit_unavailable')
      continue
    }

    // march 目标可以是远端格子（行军），只验证格式；其他动作仍限 localLayer
    const targetValid = order.action === 'march'
      ? (allowedTiles.has(order.target) || globalTilePattern.test(order.target))
      : allowedTiles.has(order.target)
    if (!targetValid) {
      reasons.add('guard_target_missing')
      continue
    }

    if (seenUnits.has(order.unitId)) {
      reasons.add('guard_duplicate_unit_order')
      continue
    }

    seenUnits.add(order.unitId)
    nextOrders.push(order)
  }

  if (nextOrders.length === 0) {
    const fallbackUnit = context.availableUnits.find((unit) => unit.available)
    const fallbackTarget = pickReconTarget(context)

    if (fallbackUnit && fallbackTarget) {
      nextOrders.push({
        unitId: fallbackUnit.id,
        action: 'recon',
        target: fallbackTarget,
      })
      reasons.add('guard_fallback_recon')
    }
  }

  const constraints = Array.from(new Set([...plan.constraints, ...reasons])).slice(0, 16)

  return {
    plan: {
      ...plan,
      orders: nextOrders,
      constraints,
      reviewAfterTicks: normalizeReviewAfterTicks(plan.reviewAfterTicks),
    },
    droppedOrders: Math.max(0, plan.orders.length - nextOrders.length),
    reasons: Array.from(reasons),
  }
}

function pickReconTarget(context: CommanderToolContext) {
  const unknownTile = context.worldSnapshot.localLayer.tiles
    .filter((tile) => tile.intel === 'unknown')
    .sort((a, b) => b.enemyPressure - a.enemyPressure)[0]

  if (unknownTile) {
    return unknownTile.id
  }

  return context.worldSnapshot.localLayer.tiles.sort((a, b) => b.enemyPressure - a.enemyPressure)[0]?.id
}

function normalizeReviewAfterTicks(value: number) {
  if (!Number.isFinite(value)) {
    return 2
  }

  return Math.max(1, Math.min(12, Math.round(value)))
}

function mergeGuardNote(origin: string | undefined, guardResult: GuardResult) {
  if (guardResult.reasons.length === 0) {
    return origin
  }

  const guardMessage = `CommanderGuard filtered ${guardResult.droppedOrders} invalid orders: ${guardResult.reasons.join(', ')}.`
  return origin ? `${origin} ${guardMessage}` : guardMessage
}

function mergeExplanation(
  origin: string | undefined,
  guardResult: GuardResult,
  strategicCommand: string,
) {
  const fallback = `Generated an executable plan for strategic command: ${strategicCommand}.`

  if (guardResult.reasons.length === 0) {
    return origin ?? fallback
  }

  const guardSuffix = `Order guard adjusted ${guardResult.droppedOrders} invalid commands.`
  return origin ? `${origin} ${guardSuffix}` : `${fallback} ${guardSuffix}`
}

function mergePlanningRationale(origin: string[] | undefined, guardResult: GuardResult) {
  const normalized = (origin ?? []).filter((item) => item.trim().length > 0)

  if (guardResult.reasons.length === 0) {
    return normalized.length > 0 ? normalized : ['Orders passed guard checks and remain executable.']
  }

  return [
    ...normalized,
    `Guard correction reasons: ${guardResult.reasons.join(', ')}`,
  ].slice(0, 8)
}

function resolveCommanderAgentId(factionId: string) {
  return `commander_${factionId}`
}

function resolveTargetFactionId(world: WorldState, requestedFactionId: string | undefined) {
  if (requestedFactionId && world.factions[requestedFactionId]) {
    return requestedFactionId
  }
  return resolvePreferredFactionId(world)
}

function resolvePreferredFactionId(world: WorldState) {
  const factionIds = Object.keys(world.factions)
  const nonNeutralFactionIds = factionIds.filter((factionId) => factionId !== 'neutral')

  const scoredFactionIds = (nonNeutralFactionIds.length > 0 ? nonNeutralFactionIds : factionIds)
    .map((factionId) => ({
      factionId,
      unitCount: world.units.filter((unit) => unit.faction === factionId).length,
      tileCount: world.map.tiles.filter((tile) => tile.owner === factionId).length,
    }))

  if (scoredFactionIds.length === 0) {
    return 'neutral'
  }

  scoredFactionIds.sort((left, right) => {
    if (right.unitCount !== left.unitCount) {
      return right.unitCount - left.unitCount
    }
    if (right.tileCount !== left.tileCount) {
      return right.tileCount - left.tileCount
    }
    return left.factionId.localeCompare(right.factionId)
  })

  return scoredFactionIds[0]?.factionId ?? 'neutral'
}

async function safeRecall(
  memoryProvider: Awaited<ReturnType<typeof getMemoryProvider>>,
  agentId: string,
  command: string,
) {
  try {
    return await memoryProvider.search(agentId, command, 4)
  } catch {
    return []
  }
}

async function safeRemember(
  memoryProvider: Awaited<ReturnType<typeof getMemoryProvider>>,
  agentId: string,
  world: WorldState,
  command: string,
  guardResult: GuardResult,
  factionId: string,
) {
  try {
    const plan = guardResult.plan
    const text = `[tick ${world.tick}] intent=${plan.intent} priority=${plan.priority} orders=${plan.orders.length} command=${command}`
    await memoryProvider.add(agentId, text, {
      type: 'commander_plan',
      tick: world.tick,
      priority: plan.priority,
      orderCount: plan.orders.length,
      factionId,
    })
  } catch {
    // ignore memory failures
  }
}
