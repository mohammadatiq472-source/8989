import assert from 'node:assert/strict'
import {
  advanceTickAction,
  getAiRuntimeObservabilitySnapshot,
  getWorldStateReadonly,
  queueAiAgendaActionAction,
  queuePlanExecutionAction,
} from '../src/application/world/WorldService'
import { tryAcquireWorldMutationLock } from '../src/application/world/runtime/worldMutationLock'
import {
  joinSession,
  resetSessionManagerForTests,
  setSessionRuntimeConfigForTests,
} from '../src/multiplayer/SessionManager'
import { __resetWebSocketStateForTests, __setWebSocketRuntimeConfigForTests } from '../src/ws/GameWebSocket'

function expectJoinSuccess(
  result: ReturnType<typeof joinSession>,
): Exclude<ReturnType<typeof joinSession>, { error: string }> {
  assert.ok(!('error' in result), `join should succeed, got error: ${'error' in result ? result.error : 'unknown'}`)
  return result as Exclude<ReturnType<typeof joinSession>, { error: string }>
}

function configureRuntime() {
  resetSessionManagerForTests()
  setSessionRuntimeConfigForTests({
    heartbeatTimeoutMs: 5_000,
    staleSessionTtlMs: 8_000,
    maxActiveSessions: 16,
    maxSeatsPerFaction: 8,
    maxPlayerNameLength: 32,
  })
  __resetWebSocketStateForTests()
  __setWebSocketRuntimeConfigForTests({
    maxConnections: 4,
    maxSubscriptionsPerFaction: 2,
    maxVisibleEventsPerTick: 4,
    maxVisibleUnitChangesPerTick: 4,
    maxVisibleTileChangesPerTick: 4,
  })
}

function buildPlanRequest(requestId: string) {
  const world = getWorldStateReadonly()
  const factionId = 'player'
  const unit = world.units.find((item) => item.faction === factionId) ?? world.units[0]
  assert.ok(unit, 'test world should contain at least one unit')
  return {
    factionId,
    requestId,
    basedOnWorldVersion: world.worldVersion,
    plan: {
      intent: 'AI runtime observability test',
      priority: 'medium' as const,
      reviewAfterTicks: 1,
      constraints: ['ai_runtime_observability_test'],
      orders: [
        {
          unitId: unit.id,
          action: 'recon' as const,
          target: unit.tileId,
        },
      ],
    },
  }
}

async function testImmediateResponseAndRuntimeSnapshot() {
  configureRuntime()
  const validFactions = Object.keys(getWorldStateReadonly().factions)
  expectJoinSuccess(joinSession('player', 'Alpha', validFactions))

  const request = buildPlanRequest('ai_runtime_obs_success')
  const queueResult = await queuePlanExecutionAction({
    source: 'mock',
    strategicCommand: 'AI runtime observability success path',
    factionId: request.factionId,
    requestId: request.requestId,
    basedOnWorldVersion: request.basedOnWorldVersion,
    plan: request.plan,
  }, false)

  assert.equal(queueResult.ok, true, 'queuePlanExecutionAction should succeed')
  assert.equal(queueResult.requestId, request.requestId, 'success response should echo requestId')
  assert.equal(queueResult.execution?.requestId, request.requestId, 'success response should expose execution requestId')
  assert.ok((queueResult.execution?.activeOrderCount ?? 0) >= 1, 'success response should expose active execution orders')

  const snapshot = getAiRuntimeObservabilitySnapshot({ factionId: request.factionId, eventLimit: 8 })
  assert.equal(snapshot.factions.length, 1, 'faction filter should narrow runtime snapshot')
  const player = snapshot.factions[0]
  assert.equal(player.factionId, request.factionId)
  assert.equal(player.autonomyLevel, 'L1_assigned', 'runtime authority should come from SessionManager')
  assert.equal(player.controlMode, 'human_assigned', 'control mode should derive from session authority')
  assert.equal(player.execution?.requestId, request.requestId, 'runtime snapshot should expose authoritative execution requestId')
  assert.equal(player.budget.actionPointsRemaining, player.execution?.actionPointsRemaining, 'budget should mirror execution AP')
  assert.ok(player.budget.aiQuota, 'runtime snapshot should expose quota budget')
  assert.ok(
    snapshot.recentEvents.some((event) => event.action === 'queue_plan_execution' && event.requestId === request.requestId),
    'runtime snapshot should include recent queue_plan_execution event',
  )

  const advanceResult = await advanceTickAction(false)
  assert.equal(advanceResult.ok, true, 'advanceTickAction should succeed for runtime observability success path')

  const snapshotAfterAdvance = getAiRuntimeObservabilitySnapshot({ factionId: request.factionId, eventLimit: 8 })
  assert.equal(snapshotAfterAdvance.runtime.advanceTickPerformance.lastOutcome, 'success')
  assert.ok(
    (snapshotAfterAdvance.runtime.advanceTickPerformance.lastTotalDurationMs ?? 0) > 0,
    'runtime snapshot should expose lastTotalDurationMs after advanceTick',
  )
  assert.ok(
    snapshotAfterAdvance.runtime.advanceTickPerformance.recentRuns[0]?.phases.some((phase) => phase.phase === 'reflect_world_tick'),
    'runtime snapshot should expose phase timings for the latest advanceTick',
  )
  assert.ok(
    (snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.reflect_world_tick?.maxDurationMs ?? 0) > 0,
    'runtime snapshot should aggregate phase stats without client-side parsing',
  )
  assert.ok(
    (snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.precompute_shared_index'
    ]?.maxDurationMs ?? 0) > 0,
    'runtime snapshot should aggregate second-level advance_world_state subphase stats',
  )
  assert.ok(
    snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.snapshot_previous_world.clone_map_tiles'
    ],
    'runtime snapshot should expose deeper snapshot_previous_world timing stats',
  )
  assert.ok(
    snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.commit_world_state.sync_world_map_layout'
    ],
    'runtime snapshot should expose deeper commit_world_state timing stats',
  )
  assert.ok(
    snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.directors_and_theater.theater_snapshot'
    ],
    'runtime snapshot should expose deeper directors_and_theater timing stats',
  )
  assert.ok(
    snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.directors_and_theater.alliance_director.build_theater_snapshot'
    ],
    'runtime snapshot should expose deeper alliance_director timing stats',
  )
  assert.ok(
    snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.directors_and_theater.alliance_director.build_theater_snapshot.summarize_macro_regions'
    ],
    'runtime snapshot should expose deeper buildTheaterSnapshot timing stats',
  )
  assert.ok(
    snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.directors_and_theater.alliance_director.build_theater_snapshot.summarize_macro_regions.count_units'
    ],
    'runtime snapshot should expose deepest alliance buildTheaterSnapshot region counting stats',
  )
  assert.ok(
    snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.directors_and_theater.alliance_director.build_theater_snapshot.summarize_macro_regions.build_region_unit_count_index.scan_units'
    ],
    'runtime snapshot should expose deepest alliance buildTheaterSnapshot unit count index scan stats',
  )
  assert.ok(
    snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.directors_and_theater.opposing_director.build_theater_snapshot'
    ],
    'runtime snapshot should expose deeper opposing_director timing stats',
  )
  assert.ok(
    snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.directors_and_theater.opposing_director.build_theater_snapshot.summarize_macro_regions.count_units'
    ],
    'runtime snapshot should expose deepest opposing buildTheaterSnapshot region counting stats',
  )
  assert.ok(
    snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.directors_and_theater.opposing_director.build_theater_snapshot.summarize_macro_regions.build_region_unit_count_index.scan_units'
    ],
    'runtime snapshot should expose deepest opposing buildTheaterSnapshot unit count index scan stats',
  )
  assert.ok(
    snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.directors_and_theater.opposing_director.build_target_occupied_tile_set'
    ],
    'runtime snapshot should expose deepest opposing_director index timing stats',
  )
  assert.ok(
    snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.directors_and_theater.alliance_director.apply_stance_support.boost_regional_supply'
    ],
    'runtime snapshot should expose deepest alliance stance handler timing stats',
  )
  assert.ok(
    snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.directors_and_theater.alliance_director.pick_target_tile.collect_region_tiles'
    ],
    'runtime snapshot should expose deeper alliance target picker timing stats',
  )
  assert.ok(
    snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.directors_and_theater.alliance_director.pick_anchor_unit.scan_units'
    ],
    'runtime snapshot should expose deeper alliance anchor picker timing stats',
  )
  assert.ok(
    snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.directors_and_theater.opposing_director.apply_scout_reposition'
    ],
    'runtime snapshot should expose deepest opposing scripted handler timing stats',
  )
  assert.ok(
    snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.directors_and_theater.opposing_director.process_unhandled_units.collect_neighbor_tiles'
    ],
    'runtime snapshot should expose deepest opposing generic-unit handler timing stats',
  )
  assert.ok(
    snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.commit_world_state.record_intel_diff.scan_next_intel'
    ],
    'runtime snapshot should expose deeper record_intel_diff timing stats',
  )
  assert.ok(
    snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.commit_world_state.record_intel_diff.scan_next_intel.compare_entries'
    ],
    'runtime snapshot should expose deepest record_intel_diff comparison timing stats',
  )
  assert.ok(
    snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.commit_world_state.record_intel_diff.scan_removed_intel.iterate_previous_entries'
    ],
    'runtime snapshot should expose deepest record_intel_diff removed-entry scan timing stats',
  )
  assert.ok(
    snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.advance_world_state?.subphaseStats?.[
      'advance_world_state.commit_world_state.record_intel_diff.persist_diff.trim_history'
    ],
    'runtime snapshot should expose deepest record_intel_diff persist trim timing stats',
  )
  assert.ok(
    (snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.reflect_world_tick?.subphaseStats?.[
      'reflect_world_tick.collect_context'
    ]?.maxDurationMs ?? 0) > 0,
    'runtime snapshot should aggregate second-level reflect_world_tick subphase stats',
  )
  assert.ok(
    snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.reflect_world_tick?.subphaseStats?.[
      'reflect_world_tick.collect_context.select_tick_artifacts'
    ],
    'runtime snapshot should expose deeper reflect collect_context timing stats',
  )
  assert.ok(
    snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.reflect_world_tick?.subphaseStats?.[
      'reflect_world_tick.collect_context.select_tick_artifacts.scan_reports'
    ],
    'runtime snapshot should expose deepest reflect tick report scan timing stats',
  )
  assert.ok(
    snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.reflect_world_tick?.subphaseStats?.[
      'reflect_world_tick.collect_context.build_search_indexes'
    ],
    'runtime snapshot should expose deeper reflect search index timing stats',
  )
  assert.ok(
    snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.reflect_world_tick?.subphaseStats?.[
      'reflect_world_tick.collect_context.build_search_indexes.normalize_unit_entries'
    ],
    'runtime snapshot should expose deepest reflect search index normalization timing stats',
  )
  assert.ok(
    snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.reflect_world_tick?.subphaseStats?.[
      'reflect_world_tick.collect_context.build_context'
    ],
    'runtime snapshot should expose higher-level reflect collect_context build timing stats',
  )
  assert.ok(
    snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.reflect_world_tick?.subphaseStats?.[
      'reflect_world_tick.collect_context.collect_unit_deltas.scan_after_units'
    ],
    'runtime snapshot should expose deepest reflect unit delta scan timing stats',
  )
  assert.ok(
    snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.reflect_world_tick?.subphaseStats?.[
      'reflect_world_tick.collect_context.collect_order_outcomes.collect_execution_orders.flatten_execution_buckets'
    ],
    'runtime snapshot should expose deepest reflect execution bucket flatten timing stats',
  )
  assert.ok(
    snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.reflect_world_tick?.subphaseStats?.[
      'reflect_world_tick.collect_context.build_drafts.build_report_drafts'
    ],
    'runtime snapshot should expose deeper reflect build_drafts timing stats',
  )
  assert.ok(
    snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.reflect_world_tick?.subphaseStats?.[
      'reflect_world_tick.collect_context.build_drafts.build_report_drafts.match_units'
    ],
    'runtime snapshot should expose deepest reflect report matching timing stats',
  )
  assert.ok(
    snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.broadcast_runtime?.subphaseStats?.[
      'broadcast_runtime.battle_report_fanout'
    ],
    'runtime snapshot should aggregate second-level broadcast_runtime subphase stats',
  )
  assert.ok(
    (snapshotAfterAdvance.runtime.advanceTickPerformance.phaseStats.sync_v2_resources?.subphaseStats?.[
      'sync_v2_resources.sync_v2_state'
    ]?.maxDurationMs ?? 0) >= 0,
    'runtime snapshot should expose sync_v2_resources subphase stats',
  )
}

async function testBusyFailureResponseAndLastFailure() {
  configureRuntime()
  const request = buildPlanRequest('ai_runtime_obs_busy')
  const lock = tryAcquireWorldMutationLock('ai_runtime_observability_test')
  assert.ok(lock, 'test should acquire world mutation lock')

  try {
    const busyResult = await queuePlanExecutionAction({
      source: 'mock',
      strategicCommand: 'AI runtime observability busy path',
      factionId: request.factionId,
      requestId: request.requestId,
      basedOnWorldVersion: request.basedOnWorldVersion,
      plan: request.plan,
    }, false)

    assert.equal(busyResult.ok, false, 'busy queuePlanExecutionAction should fail')
    assert.equal(busyResult.failureCode, 'world_mutation_busy', 'busy response should expose failureCode')
    assert.equal(busyResult.requestId, request.requestId, 'busy response should preserve requestId')
    assert.ok(busyResult.execution, 'busy response should include execution snapshot')

    const agendaBusy = queueAiAgendaActionAction('agenda_expand', false, request.factionId)
    assert.equal(agendaBusy.ok, false, 'busy queueAiAgendaActionAction should fail')
    assert.equal(agendaBusy.failureCode, 'world_mutation_busy', 'busy agenda action should expose failureCode')
  } finally {
    lock.release()
  }

  const snapshot = getAiRuntimeObservabilitySnapshot({ factionId: request.factionId, eventLimit: 8 })
  assert.equal(snapshot.runtime.lock.busy, false, 'lock should be released after busy-path assertion')
  assert.equal(snapshot.factions.length, 1)
  assert.equal(
    snapshot.factions[0]?.lastFailure?.failureCode,
    'world_mutation_busy',
    'runtime snapshot should expose last failureCode without parsing generic events on the client',
  )
  assert.ok(
    (snapshot.runtime.recentFailures.byFailureCode.world_mutation_busy ?? 0) >= 2,
    'recent failure aggregation should count world mutation busy samples',
  )
  assert.ok(
    (snapshot.runtime.recentFailures.byAction.queue_plan_execution ?? 0) >= 1,
    'recent failure aggregation should group queue_plan_execution samples',
  )
  assert.ok(
    (snapshot.runtime.recentFailures.byAction.queue_ai_agenda_action ?? 0) >= 1,
    'recent failure aggregation should group queue_ai_agenda_action samples',
  )
  assert.ok(
    snapshot.runtime.lockConflicts.totalRecentConflicts >= 2,
    'lock conflict aggregation should summarize recent busy samples',
  )
  assert.ok(
    (snapshot.runtime.lockConflicts.byHolder.ai_runtime_observability_test ?? 0) >= 2,
    'lock conflict aggregation should group by active holder',
  )
  assert.ok(
    snapshot.runtime.lockConflicts.samples.some((sample) => sample.action === 'queue_ai_agenda_action'),
    'lock conflict samples should include busy agenda action events',
  )
}

async function run() {
  await testImmediateResponseAndRuntimeSnapshot()
  await testBusyFailureResponseAndLastFailure()
  resetSessionManagerForTests()
  __resetWebSocketStateForTests()
  console.log('[ai_runtime_observability] all checks passed')
}

run().catch((error) => {
  console.error('[ai_runtime_observability] failed', error)
  process.exitCode = 1
})
