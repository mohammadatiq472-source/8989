import type { PlannerMetrics, PlanningFailureCategory } from '../../../../shared/contracts/game'
import { PlannerGatewayError } from '../llm/errors'

const TRACE_ENABLED = isTraceEnabled()

export function logTrace(event: string, payload: Record<string, unknown>) {
  if (!TRACE_ENABLED) {
    return
  }

  console.info(`[trace] ${JSON.stringify({ event, ts: new Date().toISOString(), ...payload })}`)
}

export function classifyPlanningFailure(error: unknown): PlanningFailureCategory {
  if (error instanceof PlannerGatewayError) {
    return error.category
  }

  if (error instanceof SyntaxError) {
    return 'validation'
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    if (message.includes('timeout')) {
      return 'gateway_timeout'
    }

    if (message.includes('json') || message.includes('schema') || message.includes('invalid')) {
      return 'validation'
    }

    if (message.includes('network') || message.includes('fetch')) {
      return 'gateway_network'
    }
  }

  return 'unknown'
}

export function mergePlannerMetrics(
  metrics: PlannerMetrics | undefined,
  patch: Partial<PlannerMetrics>,
): PlannerMetrics | undefined {
  if (!metrics && Object.keys(patch).length === 0) {
    return undefined
  }

  return {
    gatewayProvider: patch.gatewayProvider ?? metrics?.gatewayProvider ?? 'unknown',
    model: patch.model ?? metrics?.model ?? 'unknown',
    latencyMs: patch.latencyMs ?? metrics?.latencyMs ?? 0,
    requestId: patch.requestId ?? metrics?.requestId,
    promptTokens: patch.promptTokens ?? metrics?.promptTokens,
    completionTokens: patch.completionTokens ?? metrics?.completionTokens,
    totalTokens: patch.totalTokens ?? metrics?.totalTokens,
    estimatedCostUsd: patch.estimatedCostUsd ?? metrics?.estimatedCostUsd,
    failureCategory: patch.failureCategory ?? metrics?.failureCategory,
  }
}

function isTraceEnabled() {
  const raw = process.env.TRACE_ENABLED?.trim().toLowerCase()
  if (!raw) {
    return true
  }

  return !['0', 'false', 'off', 'no'].includes(raw)
}
