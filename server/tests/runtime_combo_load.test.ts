import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { WebSocket } from 'ws'
import {
  buildSessionPersistPath,
  calculatePercentile,
  getAvailablePort,
  readIntegerEnv,
  readLabelEnv,
  readNumberEnv,
  readObject,
  requestJson,
  sleep,
  spawnBackend,
  shutdownChild,
  waitForHealth,
  type TailState,
} from './helpers/backendHarness'

const LOAD_PROFILE = readLabelEnv('AI_RUNTIME_LOAD_PROFILE', 'combo')
const SESSION_COUNT = readIntegerEnv('RUNTIME_COMBO_SESSION_COUNT', 32)
const PRIMARY_SESSION_COUNT = readIntegerEnv('RUNTIME_COMBO_PRIMARY_SESSION_COUNT', SESSION_COUNT)
const SECONDARY_SESSION_COUNT = readIntegerEnv('RUNTIME_COMBO_SECONDARY_SESSION_COUNT', 0, 0)
const CLIENT_COUNT = Math.min(SESSION_COUNT, readIntegerEnv('RUNTIME_COMBO_CLIENT_COUNT', 24))
const PRIMARY_CLIENT_COUNT = readIntegerEnv('RUNTIME_COMBO_PRIMARY_CLIENT_COUNT', CLIENT_COUNT)
const SECONDARY_CLIENT_COUNT = readIntegerEnv('RUNTIME_COMBO_SECONDARY_CLIENT_COUNT', 0, 0)
const HEARTBEAT_ROUNDS = readIntegerEnv('RUNTIME_COMBO_HEARTBEAT_ROUNDS', 1)
const FANOUT_BURSTS = readIntegerEnv('RUNTIME_COMBO_FANOUT_BURSTS', 2)
const FANOUT_BURST_DELAY_MS = readIntegerEnv('RUNTIME_COMBO_FANOUT_BURST_DELAY_MS', 150, 0)
const MAX_JOIN_P95_MS = readNumberEnv('RUNTIME_COMBO_MAX_JOIN_P95_MS', 8_000, 1)
const MAX_SUBSCRIBE_P95_MS = readNumberEnv('RUNTIME_COMBO_MAX_SUBSCRIBE_P95_MS', 8_000, 1)
const MAX_HEARTBEAT_P95_MS = readNumberEnv('RUNTIME_COMBO_MAX_HEARTBEAT_P95_MS', 6_000, 1)
const MAX_FANOUT_P95_MS = readNumberEnv('RUNTIME_COMBO_MAX_FANOUT_P95_MS', 16_000, 1)
const MAX_ADVANCE_P95_MS = readNumberEnv('RUNTIME_COMBO_MAX_ADVANCE_P95_MS', 240_000, 1)

assert.equal(
  PRIMARY_SESSION_COUNT + SECONDARY_SESSION_COUNT,
  SESSION_COUNT,
  'runtime combo session split must add up to the configured session count',
)
assert.equal(
  PRIMARY_CLIENT_COUNT + SECONDARY_CLIENT_COUNT,
  CLIENT_COUNT,
  'runtime combo client split must add up to the configured client count',
)
assert.ok(PRIMARY_CLIENT_COUNT <= PRIMARY_SESSION_COUNT, 'runtime combo primary clients require primary session seats')
assert.ok(SECONDARY_CLIENT_COUNT <= SECONDARY_SESSION_COUNT, 'runtime combo secondary clients require secondary session seats')

function waitForOpen(socket: WebSocket, timeoutMs = 10_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('websocket open timeout'))
    }, timeoutMs)

    const cleanup = () => {
      clearTimeout(timer)
      socket.off('open', handleOpen)
      socket.off('error', handleError)
    }

    const handleOpen = () => {
      cleanup()
      resolve()
    }

    const handleError = (error: Error) => {
      cleanup()
      reject(error)
    }

    socket.once('open', handleOpen)
    socket.once('error', handleError)
  })
}

function waitForMessage(
  socket: WebSocket,
  predicate: (payload: Record<string, unknown>) => boolean,
  timeoutMs = 15_000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('websocket message timeout'))
    }, timeoutMs)

    const cleanup = () => {
      clearTimeout(timer)
      socket.off('message', handleMessage)
      socket.off('error', handleError)
      socket.off('close', handleClose)
    }

    const handleMessage = (raw: WebSocket.RawData) => {
      let payload: unknown
      try {
        payload = JSON.parse(String(raw))
      } catch {
        return
      }

      const record = readObject(payload)
      if (!predicate(record)) {
        return
      }

      cleanup()
      resolve(record)
    }

    const handleError = (error: Error) => {
      cleanup()
      reject(error)
    }

    const handleClose = (code: number, reason: Buffer) => {
      cleanup()
      reject(new Error(`websocket closed before expected message code=${code} reason=${String(reason)}`))
    }

    socket.on('message', handleMessage)
    socket.once('error', handleError)
    socket.once('close', handleClose)
  })
}

async function closeSocket(socket: WebSocket) {
  if (socket.readyState === WebSocket.CLOSED) {
    return
  }

  await new Promise<void>((resolve) => {
    const finalize = () => resolve()
    socket.once('close', finalize)
    try {
      socket.close()
    } catch {
      resolve()
    }
    setTimeout(resolve, 1_000)
  })
}

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

function selectPlayerProbe(data: unknown) {
  const payload = readObject(data)
  const world = readObject(payload.world)
  const factions = Object.keys(readObject(world.factions))
  const factionId = factions.includes('player') ? 'player' : factions[0]
  const units = Array.isArray(world.units) ? world.units : []
  const playerUnit = units
    .map((item) => readObject(item))
    .find((item) => String(item.faction ?? '') === factionId) ?? readObject(units[0])
  assert.ok(playerUnit, 'runtime combo load requires at least one unit')
  return {
    factionId,
  }
}

function selectTargetFactions(data: unknown, targetCount: number): string[] {
  const payload = readObject(data)
  const world = readObject(payload.world)
  const factions = Object.keys(readObject(world.factions))
  assert.ok(factions.length > 0, 'runtime combo load requires at least one faction in the world')
  const primaryFactionId = factions.includes('player') ? 'player' : factions[0]
  if (targetCount <= 1) {
    return [primaryFactionId]
  }

  const secondaryFactionId = factions.find((factionId) => factionId !== primaryFactionId)
  assert.ok(secondaryFactionId, 'runtime combo load requires a second faction for split combo load')
  return [primaryFactionId, secondaryFactionId]
}

async function run() {
  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const wsUrl = `ws://127.0.0.1:${port}/ws`
  const tail: TailState = { stdout: [], stderr: [] }
  const sessionPersistPath = buildSessionPersistPath('runtime_combo_load')
  const saveSlotsPersistPath = buildSessionPersistPath('runtime_combo_load_save_slots')
  const maxPerFactionSessionCount = Math.max(PRIMARY_SESSION_COUNT, SECONDARY_SESSION_COUNT, 1)
  const maxPerFactionClientCount = Math.max(PRIMARY_CLIENT_COUNT, SECONDARY_CLIENT_COUNT, 1)
  const child = spawnBackend(port, tail, {
    SESSION_MAX_ACTIVE: String(SESSION_COUNT),
    SESSION_MAX_SEATS_PER_FACTION: String(maxPerFactionSessionCount),
    WS_MAX_CONNECTIONS: String(CLIENT_COUNT),
    WS_MAX_SUBSCRIPTIONS_PER_FACTION: String(maxPerFactionClientCount),
    SESSION_STATE_PERSIST_PATH: sessionPersistPath,
    WORLD_SAVE_SLOTS_PATH: saveSlotsPersistPath,
    WORLD_SAVE_SLOTS_ARCHIVE_DIR: `${saveSlotsPersistPath}.archive`,
  })

  const tokens: Array<{ token: string; factionId: string }> = []
  const sockets: WebSocket[] = []
  let currentStep = 'startup'

  try {
    currentStep = 'wait_for_health'
    const health = await waitForHealth(baseUrl, 60_000)
    assert.ok(health, `backend did not become healthy\nstdout=${tail.stdout.join('\n')}\nstderr=${tail.stderr.join('\n')}`)

    currentStep = 'probe_world'
    const worldResult = await requestJson(baseUrl, '/api/world?planningHistoryLimit=1&replayLimit=1&replayFrameLimit=1', 'GET')
    assert.equal(worldResult.status, 200, `world probe failed: ${JSON.stringify(worldResult.data)}`)
    const probe = selectPlayerProbe(worldResult.data)
    const [primaryFactionId, secondaryFactionId] = selectTargetFactions(
      worldResult.data,
      SECONDARY_SESSION_COUNT > 0 || SECONDARY_CLIENT_COUNT > 0 ? 2 : 1,
    )

    currentStep = 'join_sessions'
    async function joinFactionSessions(factionId: string, count: number, prefix: string) {
      return await Promise.all(
        Array.from({ length: count }, async (_, index) => {
          const startedAt = performance.now()
          const result = await requestJson(
            baseUrl,
            '/api/session/join',
            'POST',
            {
              factionId,
              playerName: `${prefix}_${index}`,
            },
            20_000,
          )
          const latencyMs = performance.now() - startedAt
          assert.equal(result.status, 200, `join failed: ${JSON.stringify(result.data)}`)
          const payload = readObject(result.data)
          const token = String(payload.token ?? '')
          assert.ok(token.length > 0, 'join should return token')
          tokens.push({ token, factionId })
          return { token, factionId, latencyMs }
        }),
      )
    }

    const joinResponses = [
      ...(PRIMARY_SESSION_COUNT > 0
        ? await joinFactionSessions(primaryFactionId, PRIMARY_SESSION_COUNT, 'runtime_combo_primary')
        : []),
      ...(SECONDARY_SESSION_COUNT > 0
        ? await joinFactionSessions(secondaryFactionId, SECONDARY_SESSION_COUNT, 'runtime_combo_secondary')
        : []),
    ]
    const joinP95Ms = calculatePercentile(joinResponses.map((item) => item.latencyMs), 95)
    assert.ok(
      joinP95Ms <= MAX_JOIN_P95_MS,
      `runtime combo join p95 should stay under ${MAX_JOIN_P95_MS}ms, got ${joinP95Ms.toFixed(2)}ms`,
    )

    currentStep = 'subscribe_websockets'
    const subscribeTargets = [
      ...joinResponses
        .filter((item) => item.factionId === primaryFactionId)
        .slice(0, PRIMARY_CLIENT_COUNT),
      ...joinResponses
        .filter((item) => item.factionId === secondaryFactionId)
        .slice(0, SECONDARY_CLIENT_COUNT),
    ]
    const subscribeResponses = await Promise.all(
      subscribeTargets.map(async ({ token, factionId }) => {
        const socket = new WebSocket(wsUrl)
        sockets.push(socket)
        const startedAt = performance.now()
        await waitForOpen(socket)
        const subscribedPromise = waitForMessage(socket, (payload) => payload.type === 'subscribed')
        socket.send(JSON.stringify({ type: 'subscribe', factionId, token }))
        await subscribedPromise
        return { socket, factionId, latencyMs: performance.now() - startedAt }
      }),
    )
    const subscribeP95Ms = calculatePercentile(subscribeResponses.map((item) => item.latencyMs), 95)
    assert.ok(
      subscribeP95Ms <= MAX_SUBSCRIBE_P95_MS,
      `runtime combo subscribe p95 should stay under ${MAX_SUBSCRIBE_P95_MS}ms, got ${subscribeP95Ms.toFixed(2)}ms`,
    )

    const heartbeatLatencies: number[] = []
    const advanceLatencies: number[] = []
    const fanoutLatencies: number[] = []
    const activeFanoutFactions = [
      primaryFactionId,
      ...(SECONDARY_CLIENT_COUNT > 0 ? [secondaryFactionId] : []),
    ]
    for (let burst = 0; burst < FANOUT_BURSTS; burst += 1) {
      currentStep = `combo_burst_${burst + 1}_advance`
      const advanceStartedAt = performance.now()
      const advancePromise = requestJson(
        baseUrl,
        '/api/world/action?includeWorld=false',
        'POST',
        { action: 'advanceTick' },
        300_000,
      )

      const advanceResponse = await advancePromise
      advanceLatencies.push(performance.now() - advanceStartedAt)
      assert.equal(advanceResponse.status, 200, `advanceTick failed: ${JSON.stringify(advanceResponse.data)}`)
      assert.equal(readObject(advanceResponse.data).ok, true, `advanceTick should succeed: ${JSON.stringify(advanceResponse.data)}`)

      currentStep = `combo_burst_${burst + 1}_heartbeat`
      for (let round = 0; round < HEARTBEAT_ROUNDS; round += 1) {
        const roundResponses = await Promise.all(
          tokens.map(async ({ token }) => {
            const startedAt = performance.now()
            const result = await requestJson(baseUrl, '/api/session/heartbeat', 'POST', { token }, 60_000)
            const latencyMs = performance.now() - startedAt
            assert.equal(result.status, 200, `heartbeat failed: ${JSON.stringify(result.data)}`)
            assert.equal(readObject(result.data).ok, true, `heartbeat should succeed: ${JSON.stringify(result.data)}`)
            return latencyMs
          }),
        )
        heartbeatLatencies.push(...roundResponses)
      }

      currentStep = `combo_burst_${burst + 1}_fanout`
      const deltaStartedAt = performance.now()
      const deltaPromises = subscribeResponses.map(async ({ socket }) => {
        const message = await waitForMessage(socket, (payload) => payload.type === 'tick_delta', 20_000)
        assert.equal(message.type, 'tick_delta')
        return performance.now() - deltaStartedAt
      })
      const emitResponses = await Promise.all(
        activeFanoutFactions.map(async (factionId) => {
          const emit = await requestJson(
            baseUrl,
            `/api/world/diagnostic/emit-ai-quota-delta?factionId=${encodeURIComponent(factionId)}`,
            'POST',
            {},
            20_000,
          )
          assert.equal(emit.status, 200, `emit-ai-quota-delta failed: ${JSON.stringify(emit.data)}`)
          return emit
        }),
      )
      assert.equal(emitResponses.length, activeFanoutFactions.length, 'combo load should emit for every subscribed faction')
      fanoutLatencies.push(...await Promise.all(deltaPromises))

      if (burst < FANOUT_BURSTS - 1 && FANOUT_BURST_DELAY_MS > 0) {
        await sleep(FANOUT_BURST_DELAY_MS)
      }
    }

    const heartbeatP95Ms = calculatePercentile(heartbeatLatencies, 95)
    const fanoutP95Ms = calculatePercentile(fanoutLatencies, 95)
    const advanceP95Ms = calculatePercentile(advanceLatencies, 95)
    assert.ok(
      heartbeatP95Ms <= MAX_HEARTBEAT_P95_MS,
      `runtime combo heartbeat p95 should stay under ${MAX_HEARTBEAT_P95_MS}ms, got ${heartbeatP95Ms.toFixed(2)}ms`,
    )
    assert.ok(
      fanoutP95Ms <= MAX_FANOUT_P95_MS,
      `runtime combo fanout p95 should stay under ${MAX_FANOUT_P95_MS}ms, got ${fanoutP95Ms.toFixed(2)}ms`,
    )
    assert.ok(
      advanceP95Ms <= MAX_ADVANCE_P95_MS,
      `runtime combo advanceTick p95 should stay under ${MAX_ADVANCE_P95_MS}ms, got ${advanceP95Ms.toFixed(2)}ms`,
    )

    currentStep = 'runtime_snapshot'
    const runtimeAfter = await requestJson(
      baseUrl,
      `/api/observability/ai-runtime?factionId=${encodeURIComponent(probe.factionId)}&eventLimit=4`,
      'GET',
    )
    assert.equal(runtimeAfter.status, 200, `ai-runtime failed after combo load: ${JSON.stringify(runtimeAfter.data)}`)
    const runtimePayload = readObject(runtimeAfter.data)
    const runtime = readObject(runtimePayload.runtime)
    const advanceTickPerformance = readObject(runtime.advanceTickPerformance)
    const phaseStats = readObject(advanceTickPerformance.phaseStats)
    const advanceWorldSubphaseStats = readObject(readObject(phaseStats.advance_world_state ?? {}).subphaseStats)
    const syncV2SubphaseStats = readObject(readObject(phaseStats.sync_v2_resources ?? {}).subphaseStats)
    const reflectSubphaseStats = readObject(readObject(phaseStats.reflect_world_tick ?? {}).subphaseStats)
    const broadcastSubphaseStats = readObject(readObject(phaseStats.broadcast_runtime ?? {}).subphaseStats)
    assert.equal(advanceTickPerformance.lastOutcome, 'success', 'combo load should leave latest advanceTick in success state')
    assert.ok(
      Number(readObject(advanceWorldSubphaseStats['advance_world_state.precompute_shared_index']).maxDurationMs ?? 0) > 0,
      'combo load should expose advance_world_state second-level timing',
    )
    assert.ok(
      Number(readObject(reflectSubphaseStats['reflect_world_tick.collect_context']).maxDurationMs ?? 0) > 0,
      'combo load should expose reflect_world_tick second-level timing',
    )
    assert.ok(
      readObject(advanceWorldSubphaseStats['advance_world_state.snapshot_previous_world.clone_map_tiles']),
      'combo load should expose deeper snapshot_previous_world timing',
    )
    assert.ok(
      readObject(advanceWorldSubphaseStats['advance_world_state.commit_world_state.sync_world_map_layout']),
      'combo load should expose deeper commit_world_state timing',
    )
    assert.ok(
      readObject(advanceWorldSubphaseStats['advance_world_state.directors_and_theater.theater_snapshot']),
      'combo load should expose deeper directors_and_theater timing',
    )
    assert.ok(
      readObject(advanceWorldSubphaseStats['advance_world_state.directors_and_theater.alliance_director.build_theater_snapshot']),
      'combo load should expose deeper alliance_director timing',
    )
    assert.ok(
      readObject(advanceWorldSubphaseStats['advance_world_state.directors_and_theater.alliance_director.build_theater_snapshot.summarize_macro_regions']),
      'combo load should expose deeper buildTheaterSnapshot timing',
    )
    assert.ok(
      readObject(
        advanceWorldSubphaseStats[
          'advance_world_state.directors_and_theater.alliance_director.build_theater_snapshot.summarize_macro_regions.count_units'
        ],
      ),
      'combo load should expose deepest alliance buildTheaterSnapshot region counting timing',
    )
    assert.ok(
      readObject(
        advanceWorldSubphaseStats[
          'advance_world_state.directors_and_theater.alliance_director.build_theater_snapshot.summarize_macro_regions.build_region_unit_count_index.scan_units'
        ],
      ),
      'combo load should expose deepest alliance buildTheaterSnapshot unit count index scan timing',
    )
    assert.ok(
      readObject(advanceWorldSubphaseStats['advance_world_state.directors_and_theater.opposing_director.build_theater_snapshot']),
      'combo load should expose deeper opposing_director timing',
    )
    assert.ok(
      readObject(
        advanceWorldSubphaseStats[
          'advance_world_state.directors_and_theater.opposing_director.build_theater_snapshot.summarize_macro_regions.count_units'
        ],
      ),
      'combo load should expose deepest opposing buildTheaterSnapshot region counting timing',
    )
    assert.ok(
      readObject(
        advanceWorldSubphaseStats[
          'advance_world_state.directors_and_theater.opposing_director.build_theater_snapshot.summarize_macro_regions.build_region_unit_count_index.scan_units'
        ],
      ),
      'combo load should expose deepest opposing buildTheaterSnapshot unit count index scan timing',
    )
    assert.ok(
      readObject(
        advanceWorldSubphaseStats[
          'advance_world_state.directors_and_theater.alliance_director.apply_stance_support.boost_regional_supply'
        ],
      ),
      'combo load should expose deepest alliance stance handler timing',
    )
    assert.ok(
      readObject(
        advanceWorldSubphaseStats[
          'advance_world_state.directors_and_theater.alliance_director.pick_target_tile.collect_region_tiles'
        ],
      ),
      'combo load should expose deeper alliance target picker timing',
    )
    assert.ok(
      readObject(
        advanceWorldSubphaseStats[
          'advance_world_state.directors_and_theater.alliance_director.pick_anchor_unit.scan_units'
        ],
      ),
      'combo load should expose deeper alliance anchor picker timing',
    )
    assert.ok(
      readObject(
        advanceWorldSubphaseStats[
          'advance_world_state.directors_and_theater.opposing_director.apply_scout_reposition'
        ],
      ),
      'combo load should expose deepest opposing scripted handler timing',
    )
    assert.ok(
      readObject(
        advanceWorldSubphaseStats[
          'advance_world_state.directors_and_theater.opposing_director.process_unhandled_units.collect_neighbor_tiles'
        ],
      ),
      'combo load should expose deepest opposing generic-unit handler timing',
    )
    assert.ok(
      readObject(advanceWorldSubphaseStats['advance_world_state.directors_and_theater.opposing_director.build_target_occupied_tile_set']),
      'combo load should expose deepest opposing_director index timing',
    )
    assert.ok(
      readObject(advanceWorldSubphaseStats['advance_world_state.commit_world_state.record_intel_diff.scan_next_intel']),
      'combo load should expose deeper record_intel_diff timing',
    )
    assert.ok(
      readObject(advanceWorldSubphaseStats['advance_world_state.commit_world_state.record_intel_diff.scan_next_intel.compare_entries']),
      'combo load should expose deepest record_intel_diff comparison timing',
    )
    assert.ok(
      readObject(
        advanceWorldSubphaseStats[
          'advance_world_state.commit_world_state.record_intel_diff.scan_removed_intel.iterate_previous_entries'
        ],
      ),
      'combo load should expose deepest record_intel_diff removed-entry scan timing',
    )
    assert.ok(
      readObject(
        advanceWorldSubphaseStats[
          'advance_world_state.commit_world_state.record_intel_diff.persist_diff.trim_history'
        ],
      ),
      'combo load should expose deepest record_intel_diff persist trim timing',
    )
    assert.ok(
      readObject(reflectSubphaseStats['reflect_world_tick.collect_context.select_tick_artifacts']),
      'combo load should expose deeper reflect collect_context timing',
    )
    assert.ok(
      readObject(reflectSubphaseStats['reflect_world_tick.collect_context.select_tick_artifacts.scan_reports']),
      'combo load should expose deepest reflect tick report scan timing',
    )
    assert.ok(
      readObject(reflectSubphaseStats['reflect_world_tick.collect_context.build_drafts.build_report_drafts']),
      'combo load should expose deeper reflect build_drafts timing',
    )
    assert.ok(
      readObject(reflectSubphaseStats['reflect_world_tick.collect_context.build_drafts.build_report_drafts.match_units']),
      'combo load should expose deepest reflect report matching timing',
    )
    assert.ok(
      readObject(reflectSubphaseStats['reflect_world_tick.collect_context.build_search_indexes.normalize_unit_entries']),
      'combo load should expose deepest reflect search index normalization timing',
    )
    assert.ok(
      readObject(reflectSubphaseStats['reflect_world_tick.collect_context.collect_unit_deltas.scan_after_units']),
      'combo load should expose deepest reflect unit delta scan timing',
    )
    assert.ok(
      readObject(
        reflectSubphaseStats[
          'reflect_world_tick.collect_context.collect_order_outcomes.collect_execution_orders.flatten_execution_buckets'
        ],
      ),
      'combo load should expose deepest reflect execution bucket flatten timing',
    )
    assert.ok(
      readObject(syncV2SubphaseStats['sync_v2_resources.sync_v2_state']),
      'combo load should expose sync_v2_resources subphase timing',
    )
    assert.ok(
      Number(readObject(broadcastSubphaseStats['broadcast_runtime.compute_delta']).maxDurationMs ?? 0) >= 0,
      'combo load should expose broadcast_runtime compute_delta timing',
    )
    assert.ok(
      Number(readObject(broadcastSubphaseStats['broadcast_runtime.tick_delta_fanout']).maxDurationMs ?? 0) >= 0,
      'combo load should expose broadcast_runtime tick_delta_fanout timing',
    )

    console.log(JSON.stringify({
      name: 'runtime_combo_load',
      ok: true,
      profile: LOAD_PROFILE,
      sessionCount: SESSION_COUNT,
      primarySessionCount: PRIMARY_SESSION_COUNT,
      secondarySessionCount: SECONDARY_SESSION_COUNT,
      clientCount: CLIENT_COUNT,
      primaryClientCount: PRIMARY_CLIENT_COUNT,
      secondaryClientCount: SECONDARY_CLIENT_COUNT,
      primaryFactionId,
      secondaryFactionId: SECONDARY_SESSION_COUNT > 0 || SECONDARY_CLIENT_COUNT > 0 ? secondaryFactionId : null,
      heartbeatRounds: HEARTBEAT_ROUNDS,
      fanoutBursts: FANOUT_BURSTS,
      joinP95Ms: Number(joinP95Ms.toFixed(2)),
      subscribeP95Ms: Number(subscribeP95Ms.toFixed(2)),
      heartbeatP95Ms: Number(heartbeatP95Ms.toFixed(2)),
      fanoutP95Ms: Number(fanoutP95Ms.toFixed(2)),
      advanceP95Ms: Number(advanceP95Ms.toFixed(2)),
      topPhasesByLast: pickTopNumericEntries(
        phaseStats as Record<string, { lastDurationMs: number; avgDurationMs: number }>,
        'lastDurationMs',
        4,
      ),
      topSubphasesByLast: pickTopSubphaseEntries(
        phaseStats as Record<string, { subphaseStats?: Record<string, { lastDurationMs: number; avgDurationMs: number }> }>,
        'lastDurationMs',
        8,
      ),
    }))
  } catch (error) {
    const details =
      error instanceof Error
        ? `[step=${currentStep}] ${error.stack ?? error.message}\nstdout=${tail.stdout.join('\n')}\nstderr=${tail.stderr.join('\n')}`
        : `unknown error\nstdout=${tail.stdout.join('\n')}\nstderr=${tail.stderr.join('\n')}`
    console.error('[runtime_combo_load] failed', details)
    process.exitCode = 1
  } finally {
    for (const socket of sockets) {
      await closeSocket(socket)
    }
    for (const { token } of tokens) {
      await requestJson(baseUrl, '/api/session/leave', 'POST', { token }, 10_000).catch(() => null)
    }
    await shutdownChild(child)
  }
}

void run()
