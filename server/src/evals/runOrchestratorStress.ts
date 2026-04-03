import '../bootstrap/loadEnv'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createInitialWorldState } from '../../../shared/domain/scenario'
import type { PlannerConfig, PlannerMode, WorldState } from '../../../shared/contracts/game'
import { runAgentOrchestrator } from '../agents/orchestrator/AgentOrchestrator'
import { runGeneralDispatch } from '../agents/general/GeneralAgent'
import { getGeneralProfilesForFaction } from '../agents/general/GeneralProfileStore'

const DEFAULT_PRIMARY_AGENTS = 12
const DEFAULT_OPPOSING_AGENTS = 12
const DEFAULT_CONCURRENCY = 4
const DEFAULT_BATCH_SIZE = 4

const DEFAULT_COMMANDS = [
  'Hold west line, dispatch recon to north fog corridor.',
  'Secure Qingshi city and food route, then expand east with low risk.',
  'Probe east flank with short steps, avoid deep high-risk transfer.',
  'Reinforce midline garrison to isolate opposing fortress pressure.',
  'Intel-first posture: scout west perimeter before forward push.',
  'Stabilize resource tiles on midline, then expand conservatively.',
]

type GeneralDispatchAggregate = {
  totalGenerals: number
  totalOrders: number
  durationMs: number
  p50LatencyMs: number
  p95LatencyMs: number
}

type OrchestratorPerfSummary = {
  runId: string
  startedAt: string
  finishedAt: string
  mapSize: string
  mapTiles: number
  totalAgents: number
  primaryFactionId: string
  opposingFactionId: string
  primaryAgents: number
  opposingAgents: number
  /** @deprecated use primaryAgents */
  playerAgents: number
  /** @deprecated use opposingAgents */
  enemyAgents: number
  successCount: number
  failureCount: number
  fallbackCount: number
  successRate: number
  fallbackRate: number
  durationMs: number
  qps: number
  p50LatencyMs: number
  p95LatencyMs: number
  totalTokens: number
  totalCostUsd: number
}
type StressGateResult = {
  passed: boolean
  thresholds: {
    minSuccessRate?: number
    maxP95LatencyMs?: number
    maxFallbackRate?: number
    maxFailureCount?: number
  }
  violations: string[]
}


async function main() {
  const primaryAgents = readNumberArg(
    '--primary-agents',
    readNumberArg('--player-agents', DEFAULT_PRIMARY_AGENTS),
  )
  const opposingAgents = readNumberArg(
    '--opposing-agents',
    readNumberArg('--enemy-agents', DEFAULT_OPPOSING_AGENTS),
  )
  const world = createInitialWorldState()
  const defaults = resolveDefaultFactionPair(world)
  const primaryFactionId = readArg('--primary-faction-id')?.trim() || defaults.primaryFactionId
  const opposingFactionId = readArg('--opposing-faction-id')?.trim() || defaults.opposingFactionId
  const concurrency = readNumberArg('--concurrency', DEFAULT_CONCURRENCY)
  const batchSize = readNumberArg('--batch-size', DEFAULT_BATCH_SIZE)
  const mode = readModeArg('--mode', 'mock')
  const model = readArg('--model') ?? process.env.LLM_RELAY_MODEL ?? ''
  const modelPool = readModelPool(readArg('--models') ?? process.env.GATEWAY_ROTATION_MODELS)
  const failFast = hasArg('--fail-fast')
  const includeResults = hasArg('--include-results')
  const generalDispatch = hasArg('--general-dispatch')
  const generalConcurrency = readNumberArg('--general-concurrency', concurrency)
  const outputArg = readArg('--output')
  const minSuccessRate = readOptionalNumberArg('--min-success-rate')
  const maxP95LatencyMs = readOptionalNumberArg('--max-p95-ms')
  const maxFallbackRate = readOptionalNumberArg('--max-fallback-rate')
  const maxFailureCount = readOptionalNumberArg('--max-failure-count')
  const agents = [
    ...buildAgentSpecs(primaryFactionId, primaryAgents, mode, model, modelPool),
    ...buildAgentSpecs(opposingFactionId, opposingAgents, mode, model, modelPool),
  ]

  const report = await runAgentOrchestrator(world, agents, {
    concurrency,
    batchSize,
    failFast,
  })

  const summary = buildPerfSummary(report, {
    primaryFactionId,
    opposingFactionId,
    primaryAgents,
    opposingAgents,
    mapSize: world.map.width + 'x' + world.map.height,
    mapTiles: world.map.tiles.length,
  })

  const generalSummary = generalDispatch
    ? await runGeneralDispatches(world, report, generalConcurrency)
    : undefined

  const gate = evaluateStressGate(summary, {
    minSuccessRate,
    maxP95LatencyMs,
    maxFallbackRate,
    maxFailureCount,
  })

  const payload = includeResults
    ? { summary, generalSummary, gate, results: report.results }
    : { summary, generalSummary, gate }

  const serialized = JSON.stringify(payload, null, 2)
  console.info(serialized)

  if (outputArg) {
    const outputPath = resolve(process.cwd(), outputArg)
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, serialized + '\n', 'utf-8')
  }

  if (!gate.passed) {
    throw new Error('orchestrator stress gate failed: ' + gate.violations.join('; '))
  }
}

function buildAgentSpecs(
  side: string,
  count: number
  ,mode: PlannerMode
  ,fallbackModel: string
  ,modelPool: string[]
) {
  return Array.from({ length: count }).map((_, index) => ({
    plannerConfig: {
      mode,
      model: pickRotatedModel(index, fallbackModel, modelPool),
    } satisfies PlannerConfig,
    id: side + '_' + (index + 1)
    ,side
    ,command: DEFAULT_COMMANDS[index % DEFAULT_COMMANDS.length]
  }))
}

function resolveDefaultFactionPair(world: WorldState) {
  const factionIds = Object.keys(world.factions)
  const primaryFactionId = factionIds[0] ?? ''
  const opposingFactionId = factionIds.find((factionId) => factionId !== primaryFactionId) ?? primaryFactionId

  return {
    primaryFactionId,
    opposingFactionId,
  }
}

function pickRotatedModel(index: number, fallbackModel: string, modelPool: string[]) {
  if (modelPool.length > 0) {
    return modelPool[index % modelPool.length]
  }

  return fallbackModel
}

function buildPerfSummary(
  report: Awaited<ReturnType<typeof runAgentOrchestrator>>
  ,params: {
    primaryFactionId: string
    opposingFactionId: string
    primaryAgents: number
    opposingAgents: number
    mapSize: string
    mapTiles: number
  }
) : OrchestratorPerfSummary {
  const summary = report.summary
  const totalAgents = summary.totalAgents
  const successRate = ratio(summary.successCount, totalAgents)
  const fallbackRate = ratio(summary.fallbackCount, totalAgents)

  return {
    runId: summary.runId
    ,startedAt: summary.startedAt
    ,finishedAt: summary.finishedAt
    ,mapSize: params.mapSize
    ,mapTiles: params.mapTiles
    ,totalAgents: summary.totalAgents
    ,primaryFactionId: params.primaryFactionId
    ,opposingFactionId: params.opposingFactionId
    ,primaryAgents: params.primaryAgents
    ,opposingAgents: params.opposingAgents
    ,playerAgents: params.primaryAgents
    ,enemyAgents: params.opposingAgents
    ,successCount: summary.successCount
    ,failureCount: summary.failureCount
    ,fallbackCount: summary.fallbackCount
    ,successRate
    ,fallbackRate
    ,durationMs: summary.durationMs
    ,qps: summary.qps
    ,p50LatencyMs: summary.p50LatencyMs
    ,p95LatencyMs: summary.p95LatencyMs
    ,totalTokens: summary.totalTokens
    ,totalCostUsd: summary.totalCostUsd
  }
}

async function runGeneralDispatches(
  world: WorldState
  ,report: Awaited<ReturnType<typeof runAgentOrchestrator>>
  ,concurrency: number
) : Promise<GeneralDispatchAggregate> {
  let totalGenerals = 0
  let totalOrders = 0
  let durationMs = 0
  const latencies: number[] = []

  for (const result of report.results) {
    if (!result.plan) {
      continue
    }
    const generals = getGeneralProfilesForFaction(world, result.side)
    const generalReport = await runGeneralDispatch(world, result.plan, generals, {
      concurrency
    })
    totalGenerals += generalReport.summary.totalGenerals
    totalOrders += generalReport.summary.totalOrders
    durationMs += generalReport.summary.durationMs
    latencies.push(generalReport.summary.p50LatencyMs, generalReport.summary.p95LatencyMs)
  }

  return {
    totalGenerals
    ,totalOrders
    ,durationMs
    ,p50LatencyMs: percentile(latencies, 0.5)
    ,p95LatencyMs: percentile(latencies, 0.95)
  }
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) {
    return 0
  }

  const sorted = values.slice().sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * ratio)))
  return sorted[index]
}

function ratio(value: number, total: number) {
  if (total <= 0) {
    return 0
  }
  return Number((value / total).toFixed(4))
}

function evaluateStressGate(
  summary: OrchestratorPerfSummary,
  thresholds: StressGateResult['thresholds'],
): StressGateResult {
  const violations: string[] = []

  if (typeof thresholds.minSuccessRate === 'number' && summary.successRate < thresholds.minSuccessRate) {
    violations.push(`successRate ${summary.successRate} < minSuccessRate ${thresholds.minSuccessRate}`)
  }

  if (typeof thresholds.maxP95LatencyMs === 'number' && summary.p95LatencyMs > thresholds.maxP95LatencyMs) {
    violations.push(`p95LatencyMs ${summary.p95LatencyMs} > maxP95LatencyMs ${thresholds.maxP95LatencyMs}`)
  }

  if (typeof thresholds.maxFallbackRate === 'number' && summary.fallbackRate > thresholds.maxFallbackRate) {
    violations.push(`fallbackRate ${summary.fallbackRate} > maxFallbackRate ${thresholds.maxFallbackRate}`)
  }

  if (typeof thresholds.maxFailureCount === 'number' && summary.failureCount > thresholds.maxFailureCount) {
    violations.push(`failureCount ${summary.failureCount} > maxFailureCount ${thresholds.maxFailureCount}`)
  }

  return {
    passed: violations.length === 0,
    thresholds,
    violations,
  }
}

function readOptionalNumberArg(name: string) {
  const value = readArg(name)
  if (!value) {
    return undefined
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(name + ' must be a number')
  }

  return parsed
}

function readModeArg(name: string, fallback: PlannerMode): PlannerMode {
  const value = (readArg(name) ?? fallback).trim()
  if (value === 'mock' || value === 'local' || value === 'gateway') {
    return value
  }

  throw new Error('unknown mode: ' + value)
}

function readNumberArg(name: string, fallback: number) {
  const value = readArg(name)
  if (!value) {
    return fallback
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(name + ' must be a positive number')
  }

  return Math.floor(parsed)
}

function readArg(name: string) {
  const index = process.argv.findIndex((item) => item === name)
  if (index < 0 || index + 1 >= process.argv.length) {
    return undefined
  }

  return process.argv[index + 1]
}

function hasArg(name: string) {
  return process.argv.includes(name)
}

function readModelPool(value?: string) {
  if (!value) {
    return []
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'orchestrator stress run failed')
  process.exit(1)
})
