import { randomUUID } from 'node:crypto'
import type { PlannerConfig, PlannerResult, WorldState } from '../../../../shared/contracts/game'
import { createCommanderPlan } from '../../agents/commander/CommanderAgent'
import { createMockPlan } from '../../fallback/mockPlanner'
import { classifyPlanningFailure, logTrace, mergePlannerMetrics } from '../../infra/observability/trace'
import { createPlanningJobLifecycle } from './PlanningJobMachine'

export async function createPlanningResult(
  world: WorldState,
  strategicCommand: string,
  config: PlannerConfig,
  side?: string,
): Promise<PlannerResult> {
  const resolvedSide = resolvePlanningSide(world, side)
  const requestId = randomUUID()
  const startedAt = Date.now()
  const lifecycle = createPlanningJobLifecycle()
  const STALE_TIMEOUT_MS = 120_000

  logTrace('planning.started', {
    requestId,
    lifecycleStatus: lifecycle.getStatus(),
    mode: config.mode,
    tick: world.tick,
    worldVersion: world.worldVersion,
    model: config.model || '(server-default)',
  })

  lifecycle.send('START')

  const staleTimer = setTimeout(() => {
    if (lifecycle.getStatus() === 'running') {
      lifecycle.send('STALE')
      logTrace('planning.stale', {
        requestId,
        lifecycleStatus: lifecycle.getStatus(),
        tick: world.tick,
        latencyMs: Date.now() - startedAt,
      })
    }
  }, STALE_TIMEOUT_MS)

  try {
    const result = await createCommanderPlan(world, strategicCommand, config, resolvedSide)
    const modelName = config.model.trim() || '(server-default)'
    const gatewayProvider =
      result.metrics?.gatewayProvider ??
      (result.source === 'mock' ? 'mock_planner' : result.source === 'gateway' ? 'mumu_relay' : 'local_model')

    const completedResult: PlannerResult = {
      ...result,
      metrics: mergePlannerMetrics(result.metrics, {
        requestId,
        gatewayProvider,
        model: result.metrics?.model ?? modelName,
        latencyMs: Date.now() - startedAt,
      }),
    }

    lifecycle.send('SUCCEED')
    clearTimeout(staleTimer)

    logTrace('planning.succeeded', {
      requestId,
      lifecycleStatus: lifecycle.getStatus(),
      mode: config.mode,
      source: completedResult.source,
      tick: world.tick,
      worldVersion: world.worldVersion,
      orderCount: completedResult.plan.orders.length,
      latencyMs: completedResult.metrics?.latencyMs,
      promptTokens: completedResult.metrics?.promptTokens,
      completionTokens: completedResult.metrics?.completionTokens,
      totalTokens: completedResult.metrics?.totalTokens,
      estimatedCostUsd: completedResult.metrics?.estimatedCostUsd,
    })

    return completedResult
  } catch (error) {
    clearTimeout(staleTimer)
    lifecycle.send('FAIL')

    if (config.mode === 'gateway' && isGatewayStrictMode()) {
      const message = error instanceof Error ? error.message : 'gateway planning unavailable'
      const failureCategory = classifyPlanningFailure(error)
      logTrace('planning.failed', {
        requestId,
        lifecycleStatus: lifecycle.getStatus(),
        mode: config.mode,
        tick: world.tick,
        worldVersion: world.worldVersion,
        latencyMs: Date.now() - startedAt,
        failureCategory,
        reason: message,
      })
      throw error
    }

    const fallback = createMockPlan(world, strategicCommand, resolvedSide)
    const failureCategory = classifyPlanningFailure(error)
    const message = error instanceof Error ? error.message : 'planner unavailable'
    const fallbackProvider =
      config.mode === 'gateway' ? 'mumu_relay' : config.mode === 'local' ? 'local_model' : 'mock_planner'

    logTrace('planning.fallback', {
      requestId,
      lifecycleStatus: lifecycle.getStatus(),
      mode: config.mode,
      tick: world.tick,
      worldVersion: world.worldVersion,
      latencyMs: Date.now() - startedAt,
      failureCategory,
      reason: message,
    })

    return {
      ...fallback,
      note: `${message}. Fallback to Mock Planner.`,
      metrics: {
        requestId,
        gatewayProvider: fallbackProvider,
        model: config.model.trim() || '(server-default)',
        latencyMs: Date.now() - startedAt,
        failureCategory,
      },
    }
  }
}

function isGatewayStrictMode() {
  const raw = process.env.PLANNER_GATEWAY_STRICT?.trim().toLowerCase()
  if (!raw) {
    return true
  }

  return !['0', 'false', 'off', 'no'].includes(raw)
}

export async function createPlanningResultForFaction(
  world: WorldState,
  strategicCommand: string,
  config: PlannerConfig,
  side?: string,
): Promise<PlannerResult> {
  return createPlanningResult(world, strategicCommand, config, side)
}

function resolvePlanningSide(world: WorldState, requestedSide: string | undefined) {
  if (requestedSide && world.factions[requestedSide]) {
    return requestedSide
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
