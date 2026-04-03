import { randomUUID } from 'node:crypto'
import type { PlannerConfig, PlannerResult, StrategicPlan, WorldState } from '../../../../shared/contracts/game'
import { createPlanningResultForFaction } from '../../application/planning/PlanningService'

export type AgentSide = string

export type OrchestratorAgentSpec = {
  id: string
  side: AgentSide
  command: string
  plannerConfig: PlannerConfig
}

export type OrchestratorRunOptions = {
  concurrency: number
  batchSize: number
  failFast?: boolean
}

export type OrchestratorAgentResult = {
  id: string
  side: AgentSide
  command: string
  source: PlannerResult['source']
  plan?: StrategicPlan
  latencyMs: number
  success: boolean
  fallback: boolean
  error?: string
  metrics?: PlannerResult['metrics']
}

export type OrchestratorRunSummary = {
  runId: string
  startedAt: string
  finishedAt: string
  totalAgents: number
  successCount: number
  failureCount: number
  fallbackCount: number
  durationMs: number
  qps: number
  p50LatencyMs: number
  p95LatencyMs: number
  totalTokens: number
  totalCostUsd: number
}

export type OrchestratorRunReport = {
  summary: OrchestratorRunSummary
  results: OrchestratorAgentResult[]
}

export async function runAgentOrchestrator(
  world: WorldState,
  agents: OrchestratorAgentSpec[],
  options: OrchestratorRunOptions,
): Promise<OrchestratorRunReport> {
  const runId = randomUUID()
  const startedAt = new Date().toISOString()
  const startTime = Date.now()
  const concurrency = normalizeNumber(options.concurrency, 1, 64)
  const batchSize = normalizeNumber(options.batchSize, 1, 32)

  const batches = chunkArray(agents, batchSize)
  const results: OrchestratorAgentResult[] = []
  let failed = false

  const batchTasks = batches.map((batch) => async () => {
    if (failed && options.failFast) {
      return
    }

    const batchResults = await Promise.all(
      batch.map(async (agent) => {
        const agentStart = Date.now()
        try {
          const result = await createPlanningResultForFaction(
            world,
            agent.command,
            agent.plannerConfig,
            agent.side,
          )

          const latencyMs = result.metrics?.latencyMs ?? Math.max(1, Date.now() - agentStart)
          const fallback = result.source === 'mock' && agent.plannerConfig.mode !== 'mock'

          return {
            id: agent.id,
            side: agent.side,
            command: agent.command,
            source: result.source,
            plan: result.plan,
            latencyMs,
            success: true,
            fallback,
            metrics: result.metrics,
          } satisfies OrchestratorAgentResult
        } catch (error) {
          failed = true
          const message = error instanceof Error ? error.message : 'orchestrator agent failed'
          return {
            id: agent.id,
            side: agent.side,
            command: agent.command,
            source: 'mock',
            latencyMs: Math.max(1, Date.now() - agentStart),
            success: false,
            fallback: true,
            error: message,
          } satisfies OrchestratorAgentResult
        }
      }),
    )

    results.push(...batchResults)
  })

  await runWithConcurrencyLimit(batchTasks, concurrency)

  const finishedAt = new Date().toISOString()
  const durationMs = Math.max(1, Date.now() - startTime)
  const totalAgents = results.length
  const successCount = results.filter((item) => item.success).length
  const failureCount = totalAgents - successCount
  const fallbackCount = results.filter((item) => item.fallback).length
  const latencies = results.map((item) => item.latencyMs)

  const totalTokens = results.reduce(
    (sum, item) => sum + (item.metrics?.totalTokens ?? 0),
    0,
  )
  const totalCostUsd = Number(
    results
      .reduce((sum, item) => sum + (item.metrics?.estimatedCostUsd ?? 0), 0)
      .toFixed(6),
  )

  const qps = Number((totalAgents / (durationMs / 1000)).toFixed(3))

  const summary: OrchestratorRunSummary = {
    runId,
    startedAt,
    finishedAt,
    totalAgents,
    successCount,
    failureCount,
    fallbackCount,
    durationMs,
    qps,
    p50LatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
    totalTokens,
    totalCostUsd,
  }

  return {
    summary,
    results,
  }
}

async function runWithConcurrencyLimit(tasks: Array<() => Promise<void>>, concurrency: number) {
  const queue = tasks.slice()
  const runners: Promise<void>[] = []

  const worker = async () => {
    while (queue.length > 0) {
      const task = queue.shift()
      if (!task) {
        return
      }

      await task()
    }
  }

  for (let index = 0; index < Math.min(concurrency, tasks.length); index += 1) {
    runners.push(worker())
  }

  await Promise.all(runners)
}

function chunkArray<T>(items: T[], size: number) {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }
  return result
}

function normalizeNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.max(min, Math.min(max, Math.round(value)))
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) {
    return 0
  }

  const sorted = values.slice().sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * ratio)))
  return sorted[index]
}
