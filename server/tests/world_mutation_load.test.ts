import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import {
  advanceTickAction,
  clearPlanExecutionAction,
  getAiRuntimeObservabilitySnapshot,
  getWorldStateReadonly,
  queuePlanExecutionAction,
  resetWorldServiceForTests,
} from '../src/application/world/WorldService'
import { calculatePercentile, readIntegerEnv, readLabelEnv, readNumberEnv, sleep } from './helpers/backendHarness'

const LOAD_PROFILE = readLabelEnv('AI_RUNTIME_LOAD_PROFILE', 'baseline')
const CONTENDING_REQUESTS = readIntegerEnv('WORLD_MUTATION_LOAD_CONTENDING_REQUESTS', 16)
const PRESSURE_WAVES = readIntegerEnv('WORLD_MUTATION_LOAD_PRESSURE_WAVES', 1)
const WAVE_DELAY_MS = readIntegerEnv('WORLD_MUTATION_LOAD_WAVE_DELAY_MS', 0, 0)
const MAX_BUSY_P95_MS = readNumberEnv('WORLD_MUTATION_LOAD_MAX_BUSY_P95_MS', 500, 1)

function pickTopNumericEntries(
  value: Record<string, { lastDurationMs: number; avgDurationMs: number }> | undefined,
  field: 'lastDurationMs' | 'avgDurationMs',
  limit: number,
) {
  return Object.entries(value ?? {})
    .map(([key, record]) => ({
      key,
      value: Number(record?.[field] ?? 0),
    }))
    .filter((entry) => Number.isFinite(entry.value) && entry.value > 0)
    .sort((left, right) => right.value - left.value || left.key.localeCompare(right.key))
    .slice(0, limit)
}

function pickTopSubphaseEntries(
  value: Record<string, { subphaseStats?: Record<string, { lastDurationMs: number; avgDurationMs: number }> }> | undefined,
  field: 'lastDurationMs' | 'avgDurationMs',
  limit: number,
) {
  const entries: Array<{ phase: string; subphase: string; value: number }> = []
  for (const [phase, record] of Object.entries(value ?? {})) {
    for (const [subphase, subphaseRecord] of Object.entries(record.subphaseStats ?? {})) {
      const numericValue = Number(subphaseRecord?.[field] ?? 0)
      if (!Number.isFinite(numericValue) || numericValue <= 0) {
        continue
      }
      entries.push({
        phase,
        subphase,
        value: numericValue,
      })
    }
  }
  return entries
    .sort((left, right) => right.value - left.value || left.subphase.localeCompare(right.subphase))
    .slice(0, limit)
}

function selectPlayerProbe() {
  const world = getWorldStateReadonly()
  const playerUnit = world.units.find((item) => item.faction === 'player') ?? world.units[0]
  assert.ok(playerUnit, 'world load probe requires at least one unit')
  return {
    unitId: playerUnit.id,
    targetTileId: playerUnit.tileId,
  }
}

async function run() {
  resetWorldServiceForTests()
  const { unitId, targetTileId } = selectPlayerProbe()
  const worldVersionBefore = getWorldStateReadonly().worldVersion
  const totalContendingRequests = CONTENDING_REQUESTS * PRESSURE_WAVES

  const advanceStartedAt = performance.now()
  const advancePromise = advanceTickAction(false)
  const contentionResponses: Array<{
    requestId: string
    latencyMs: number
    response: Awaited<ReturnType<typeof queuePlanExecutionAction>>
  }> = []

  for (let wave = 0; wave < PRESSURE_WAVES; wave += 1) {
    const waveResponses = await Promise.all(
      Array.from({ length: CONTENDING_REQUESTS }, async (_, index) => {
        const requestId = `world_mutation_load_${Date.now()}_${wave}_${index}`
        const startedAt = performance.now()
        const response = await queuePlanExecutionAction(
          {
            factionId: 'player',
            source: 'mock',
            strategicCommand: `world mutation load probe wave ${wave + 1}`,
            requestId,
            basedOnWorldVersion: worldVersionBefore,
            plan: {
              intent: `world mutation load probe wave ${wave + 1}`,
              priority: 'medium',
              reviewAfterTicks: 1,
              constraints: [`world_mutation_load_wave_${wave + 1}`],
              orders: [
                {
                  unitId,
                  action: 'recon',
                  target: targetTileId,
                },
              ],
            },
          },
          false,
        )
        return {
          requestId,
          latencyMs: performance.now() - startedAt,
          response,
        }
      }),
    )
    contentionResponses.push(...waveResponses)
    if (wave < PRESSURE_WAVES - 1 && WAVE_DELAY_MS > 0) {
      await sleep(WAVE_DELAY_MS)
    }
  }

  const advanceResponse = await advancePromise
  const advanceLatencyMs = performance.now() - advanceStartedAt
  assert.equal(advanceResponse.ok, true, `advanceTick should succeed: ${JSON.stringify(advanceResponse)}`)

  const busyResponses = contentionResponses.filter((item) => item.response.failureCode === 'world_mutation_busy')
  const staleResponses = contentionResponses.filter((item) => item.response.failureCode === 'stale_world_version')
  assert.ok(
    busyResponses.length >= Math.max(1, CONTENDING_REQUESTS),
    `expected at least one full contention wave to hit busy lock responses, got ${busyResponses.length}/${totalContendingRequests}`,
  )
  assert.ok(
    busyResponses.length + staleResponses.length >= Math.max(CONTENDING_REQUESTS, totalContendingRequests - CONTENDING_REQUESTS),
    `expected later contention waves to resolve into busy or stale responses, got busy=${busyResponses.length} stale=${staleResponses.length} total=${totalContendingRequests}`,
  )

  for (const item of busyResponses) {
    assert.equal(item.response.requestId, item.requestId, 'busy response should echo requestId')
    assert.match(String(item.response.message ?? ''), /world mutation busy/i, 'busy response should expose lock status')
  }

  const busyP95Ms = calculatePercentile(
    busyResponses.map((item) => item.latencyMs),
    95,
  )
  assert.ok(
    busyP95Ms <= MAX_BUSY_P95_MS,
    `busy contention responses should stay under ${MAX_BUSY_P95_MS}ms p95, got ${busyP95Ms.toFixed(2)}ms`,
  )

  const runtimeAfter = getAiRuntimeObservabilitySnapshot({
    factionId: 'player',
    eventLimit: totalContendingRequests + 8,
  })
  assert.ok(
    runtimeAfter.runtime.recentFailures.totalRecentFailures >= busyResponses.length,
    'ai-runtime recentFailures should aggregate busy contention failures',
  )
  assert.ok(
    runtimeAfter.runtime.lockConflicts.totalRecentConflicts >= busyResponses.length,
    'ai-runtime lockConflicts should aggregate busy contention failures',
  )
  assert.ok(
    runtimeAfter.runtime.advanceTickPerformance.lastOutcome === 'success',
    'ai-runtime advanceTickPerformance should expose the latest successful tick outcome',
  )
  assert.ok(
    (runtimeAfter.runtime.advanceTickPerformance.lastTotalDurationMs ?? 0) > 0,
    'ai-runtime advanceTickPerformance should expose total tick duration',
  )
  assert.ok(
    runtimeAfter.runtime.advanceTickPerformance.recentRuns[0]?.phases.some((phase) => phase.phase === 'reflect_world_tick'),
    'ai-runtime advanceTickPerformance should expose stage timings for the latest tick',
  )
  assert.ok(
    runtimeAfter.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.precompute_shared_index'
    ],
    'world mutation load should expose second-level advance_world_state timing stats',
  )
  assert.ok(
    runtimeAfter.runtime.advanceTickPerformance.phaseStats.reflect_world_tick?.subphaseStats?.[
      'reflect_world_tick.collect_context'
    ],
    'world mutation load should expose second-level reflect_world_tick timing stats',
  )
  assert.ok(
    runtimeAfter.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.snapshot_previous_world.clone_map_tiles'
    ],
    'world mutation load should expose deeper snapshot_previous_world timing stats',
  )
  assert.ok(
    runtimeAfter.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.commit_world_state.sync_world_map_layout'
    ],
    'world mutation load should expose deeper commit_world_state timing stats',
  )
  assert.ok(
    runtimeAfter.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.directors_and_theater.theater_snapshot'
    ],
    'world mutation load should expose deeper directors_and_theater timing stats',
  )
  assert.ok(
    runtimeAfter.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.directors_and_theater.alliance_director.build_theater_snapshot'
    ],
    'world mutation load should expose deeper alliance_director timing stats',
  )
  assert.ok(
    runtimeAfter.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.directors_and_theater.alliance_director.build_theater_snapshot.summarize_macro_regions'
    ],
    'world mutation load should expose deeper buildTheaterSnapshot timing stats',
  )
  assert.ok(
    runtimeAfter.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.directors_and_theater.alliance_director.build_theater_snapshot.summarize_macro_regions.count_units'
    ],
    'world mutation load should expose deepest alliance buildTheaterSnapshot region counting stats',
  )
  assert.ok(
    runtimeAfter.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.directors_and_theater.alliance_director.build_theater_snapshot.summarize_macro_regions.build_region_unit_count_index.scan_units'
    ],
    'world mutation load should expose deepest alliance buildTheaterSnapshot unit count index scan stats',
  )
  assert.ok(
    runtimeAfter.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.directors_and_theater.opposing_director.build_theater_snapshot'
    ],
    'world mutation load should expose deeper opposing_director timing stats',
  )
  assert.ok(
    runtimeAfter.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.directors_and_theater.opposing_director.build_theater_snapshot.summarize_macro_regions.count_units'
    ],
    'world mutation load should expose deepest opposing buildTheaterSnapshot region counting stats',
  )
  assert.ok(
    runtimeAfter.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.directors_and_theater.opposing_director.build_theater_snapshot.summarize_macro_regions.build_region_unit_count_index.scan_units'
    ],
    'world mutation load should expose deepest opposing buildTheaterSnapshot unit count index scan stats',
  )
  assert.ok(
    runtimeAfter.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.directors_and_theater.alliance_director.apply_stance_support.boost_regional_supply'
    ],
    'world mutation load should expose deepest alliance stance handler timing stats',
  )
  assert.ok(
    runtimeAfter.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.directors_and_theater.alliance_director.pick_target_tile.collect_region_tiles'
    ],
    'world mutation load should expose deeper alliance target picker timing stats',
  )
  assert.ok(
    runtimeAfter.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.directors_and_theater.alliance_director.pick_anchor_unit.scan_units'
    ],
    'world mutation load should expose deeper alliance anchor picker timing stats',
  )
  assert.ok(
    runtimeAfter.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.directors_and_theater.opposing_director.apply_scout_reposition'
    ],
    'world mutation load should expose deepest opposing scripted handler timing stats',
  )
  assert.ok(
    runtimeAfter.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.directors_and_theater.opposing_director.process_unhandled_units.collect_neighbor_tiles'
    ],
    'world mutation load should expose deepest opposing generic-unit handler timing stats',
  )
  assert.ok(
    runtimeAfter.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.directors_and_theater.opposing_director.build_target_occupied_tile_set'
    ],
    'world mutation load should expose deepest opposing_director index timing stats',
  )
  assert.ok(
    runtimeAfter.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.commit_world_state.record_intel_diff.scan_next_intel'
    ],
    'world mutation load should expose deeper record_intel_diff timing stats',
  )
  assert.ok(
    runtimeAfter.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.commit_world_state.record_intel_diff.scan_next_intel.compare_entries'
    ],
    'world mutation load should expose deepest record_intel_diff comparison timing stats',
  )
  assert.ok(
    runtimeAfter.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.commit_world_state.record_intel_diff.scan_removed_intel.iterate_previous_entries'
    ],
    'world mutation load should expose deepest record_intel_diff removed-entry scan timing stats',
  )
  assert.ok(
    runtimeAfter.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.commit_world_state.record_intel_diff.persist_diff.trim_history'
    ],
    'world mutation load should expose deepest record_intel_diff persist trim timing stats',
  )
  assert.ok(
    runtimeAfter.runtime.advanceTickPerformance.phaseStats.reflect_world_tick?.subphaseStats?.[
      'reflect_world_tick.collect_context.select_tick_artifacts'
    ],
    'world mutation load should expose deeper reflect collect_context timing stats',
  )
  assert.ok(
    runtimeAfter.runtime.advanceTickPerformance.phaseStats.reflect_world_tick?.subphaseStats?.[
      'reflect_world_tick.collect_context.select_tick_artifacts.scan_reports'
    ],
    'world mutation load should expose deepest reflect tick report scan timing stats',
  )
  assert.ok(
    runtimeAfter.runtime.advanceTickPerformance.phaseStats.reflect_world_tick?.subphaseStats?.[
      'reflect_world_tick.collect_context.build_drafts.build_report_drafts'
    ],
    'world mutation load should expose deeper reflect build_drafts timing stats',
  )
  assert.ok(
    runtimeAfter.runtime.advanceTickPerformance.phaseStats.reflect_world_tick?.subphaseStats?.[
      'reflect_world_tick.collect_context.build_drafts.build_report_drafts.match_units'
    ],
    'world mutation load should expose deepest reflect report matching timing stats',
  )
  assert.ok(
    runtimeAfter.runtime.advanceTickPerformance.phaseStats.reflect_world_tick?.subphaseStats?.[
      'reflect_world_tick.collect_context.build_search_indexes.normalize_unit_entries'
    ],
    'world mutation load should expose deepest reflect search index normalization timing stats',
  )
  assert.ok(
    runtimeAfter.runtime.advanceTickPerformance.phaseStats.reflect_world_tick?.subphaseStats?.[
      'reflect_world_tick.collect_context.collect_unit_deltas.scan_after_units'
    ],
    'world mutation load should expose deepest reflect unit delta scan timing stats',
  )
  assert.ok(
    runtimeAfter.runtime.advanceTickPerformance.phaseStats.reflect_world_tick?.subphaseStats?.[
      'reflect_world_tick.collect_context.collect_order_outcomes.collect_execution_orders.flatten_execution_buckets'
    ],
    'world mutation load should expose deepest reflect execution bucket flatten timing stats',
  )
  assert.ok(
    runtimeAfter.runtime.advanceTickPerformance.phaseStats.sync_v2_resources?.subphaseStats?.[
      'sync_v2_resources.sync_v2_state'
    ],
    'world mutation load should expose sync_v2_resources subphase stats',
  )

  const worldVersionAfter = getWorldStateReadonly().worldVersion
  const successRequestId = `world_mutation_load_success_${Date.now()}`
  const successResponse = await queuePlanExecutionAction(
    {
      factionId: 'player',
      source: 'mock',
      strategicCommand: 'world mutation load recovery probe',
      requestId: successRequestId,
      basedOnWorldVersion: worldVersionAfter,
      plan: {
        intent: 'world mutation load recovery probe',
        priority: 'medium',
        reviewAfterTicks: 1,
        constraints: ['world_mutation_load_recovery'],
        orders: [
          {
            unitId,
            action: 'recon',
            target: targetTileId,
          },
        ],
      },
    },
    false,
  )
  assert.equal(successResponse.ok, true, `recovery queue should succeed: ${JSON.stringify(successResponse)}`)
  assert.equal(successResponse.requestId, successRequestId, 'recovery queue should echo requestId')
  assert.equal(successResponse.execution?.requestId, successRequestId, 'recovery queue should expose execution.requestId')

  clearPlanExecutionAction(false, 'player')

  console.log(JSON.stringify({
    name: 'world_mutation_load',
    ok: true,
    profile: LOAD_PROFILE,
    contendingRequests: CONTENDING_REQUESTS,
    pressureWaves: PRESSURE_WAVES,
      totalContendingRequests,
      busyCount: busyResponses.length,
      staleCount: staleResponses.length,
      busyP95Ms: Number(busyP95Ms.toFixed(2)),
      advanceLatencyMs: Number(advanceLatencyMs.toFixed(2)),
      topPhasesByLast: pickTopNumericEntries(runtimeAfter.runtime.advanceTickPerformance.phaseStats, 'lastDurationMs', 4),
      topSubphasesByLast: pickTopSubphaseEntries(runtimeAfter.runtime.advanceTickPerformance.phaseStats, 'lastDurationMs', 8),
    }))
}

run().catch((error) => {
  console.error('[world_mutation_load] failed', error)
  process.exitCode = 1
})
