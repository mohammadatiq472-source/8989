import assert from 'node:assert/strict'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'

type HttpJsonResult = {
  ok: boolean
  status: number
  data: unknown
}

type TailState = {
  stdout: string[]
  stderr: string[]
}

async function getAvailablePort(start = 8890, end = 8999): Promise<number> {
  for (let port = start; port <= end; port += 1) {
    const available = await new Promise<boolean>((resolve) => {
      const server = createServer()
      server.once('error', () => resolve(false))
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve(true))
      })
    })

    if (available) {
      return port
    }
  }

  throw new Error(`No available port in range ${start}-${end}`)
}

function appendTail(target: string[], chunk: string, max = 40) {
  const lines = chunk.split(/\r?\n/).filter((line) => line.trim().length > 0)
  target.push(...lines)
  if (target.length > max) {
    target.splice(0, target.length - max)
  }
}

function spawnBackend(port: number, tail: TailState): ChildProcess {
  const npmExecPath = process.env.npm_execpath?.trim()
  const env = {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(port),
    GAME_CLOCK_ENABLED: '0',
    NODE_ENV: 'test',
  }

  const child = npmExecPath
    ? spawn(process.execPath, [npmExecPath, 'run', 'start'], {
        cwd: process.cwd(),
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    : spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'start'], {
        cwd: process.cwd(),
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

  child.stdout?.on('data', (chunk) => appendTail(tail.stdout, String(chunk)))
  child.stderr?.on('data', (chunk) => appendTail(tail.stderr, String(chunk)))
  return child
}

async function requestJson(
  baseUrl: string,
  path: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>,
  timeoutMs = 15_000,
): Promise<HttpJsonResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(new URL(path, baseUrl), {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })

    const raw = await response.text()
    let data: unknown = null
    if (raw.trim().length > 0) {
      try {
        data = JSON.parse(raw)
      } catch {
        data = { raw }
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
    }
  } finally {
    clearTimeout(timer)
  }
}

async function waitForHealth(baseUrl: string, timeoutMs = 35_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const result = await requestJson(baseUrl, '/api/health', 'GET', undefined, 5_000).catch(() => null)
    if (result?.status === 200 && result.ok) {
      return result
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return null
}

async function shutdownChild(child: ChildProcess | null) {
  if (!child || child.exitCode !== null) {
    return
  }

  const waitForExit = (timeoutMs: number) =>
    new Promise<boolean>((resolve) => {
      if (child.exitCode !== null) {
        resolve(true)
        return
      }

      const timer = setTimeout(() => resolve(false), timeoutMs)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve(true)
      })
    })

  child.kill('SIGINT')
  const exited = await waitForExit(8_000)

  if (!exited && child.pid) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      child.kill('SIGKILL')
    }

    await waitForExit(8_000)
  }

  child.stdout?.destroy()
  child.stderr?.destroy()
}

function readObject(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'expected object payload')
  return value as Record<string, unknown>
}

function readArray(value: unknown): unknown[] {
  assert.ok(Array.isArray(value), 'expected array payload')
  return value
}

async function run() {
  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const tail: TailState = { stdout: [], stderr: [] }
  const child = spawnBackend(port, tail)
  let sessionToken = ''

  try {
    const health = await waitForHealth(baseUrl)
    assert.ok(health, `backend did not become healthy\nstdout=${tail.stdout.join('\n')}\nstderr=${tail.stderr.join('\n')}`)

    const join = await requestJson(baseUrl, '/api/session/join', 'POST', {
      factionId: 'player',
      playerName: 'ai_runtime_http_contract',
    })
    assert.equal(join.status, 200, `join failed: ${JSON.stringify(join.data)}`)
    const joinPayload = readObject(join.data)
    sessionToken = String(joinPayload.token ?? '')
    assert.ok(sessionToken.length > 0, 'session join should return token')

    const initialRuntime = await requestJson(baseUrl, '/api/observability/ai-runtime?factionId=player&eventLimit=2', 'GET')
    assert.equal(initialRuntime.status, 200, 'ai-runtime route should return 200')
    const initialRuntimePayload = readObject(initialRuntime.data)
    assert.equal(initialRuntimePayload.factionFilter, 'player')
    const initialRuntimeRuntime = readObject(initialRuntimePayload.runtime)
    const recentFailures = readObject(initialRuntimeRuntime.recentFailures)
    const lockConflicts = readObject(initialRuntimeRuntime.lockConflicts)
    assert.ok(typeof recentFailures.totalRecentFailures === 'number', 'ai-runtime route should expose recentFailures aggregation')
    assert.ok(typeof lockConflicts.totalRecentConflicts === 'number', 'ai-runtime route should expose lockConflicts aggregation')
    const initialFactions = readArray(initialRuntimePayload.factions)
    assert.equal(initialFactions.length, 1, 'faction filter should reduce payload to one faction')
    const initialPlayer = readObject(initialFactions[0])
    assert.equal(initialPlayer.autonomyLevel, 'L1_assigned')
    assert.equal(initialPlayer.controlMode, 'human_assigned')
    const initialWorldVersion = Number(initialRuntimePayload.worldVersion)
    assert.ok(Number.isFinite(initialWorldVersion), 'initial ai-runtime payload should expose worldVersion')

    const worldSummary = await requestJson(
      baseUrl,
      '/api/world?intelMode=sparse&planningHistoryLimit=1&replayLimit=1&replayFrameLimit=1',
      'GET',
      undefined,
      30_000,
    )
    assert.equal(worldSummary.status, 200, 'world summary route should return 200')
    const worldPayload = readObject(worldSummary.data)
    const world = readObject(worldPayload.world)
    const units = readArray(world.units)
    const playerUnit = units
      .map((item) => readObject(item))
      .find((item) => item.faction === 'player' && typeof item.id === 'string' && typeof item.tileId === 'string')
    assert.ok(playerUnit, 'world summary should expose at least one player unit')
    const unitId = String(playerUnit.id)
    const targetTileId = String(playerUnit.tileId)

    const queueRequestId = `ai_runtime_http_${Date.now()}`
    const queuePlan = await requestJson(baseUrl, '/api/world/action?includeWorld=false', 'POST', {
      action: 'queuePlanExecution',
      payload: {
        factionId: 'player',
        source: 'mock',
        strategicCommand: 'AI runtime HTTP contract test',
        requestId: queueRequestId,
        basedOnWorldVersion: initialWorldVersion,
        plan: {
          intent: 'AI runtime HTTP contract',
          priority: 'medium',
          reviewAfterTicks: 1,
          constraints: ['ai_runtime_http_contract'],
          orders: [
            {
              unitId,
              action: 'recon',
              target: targetTileId,
            },
          ],
        },
      },
    })
    assert.equal(queuePlan.status, 200, `queuePlanExecution route failed: ${JSON.stringify(queuePlan.data)}`)
    const queuePayload = readObject(queuePlan.data)
    assert.equal(queuePayload.ok, true, `queuePlanExecution should succeed: ${JSON.stringify(queuePlan.data)}`)
    assert.equal(queuePayload.requestId, queueRequestId, 'HTTP route should preserve requestId in immediate response')
    const queueExecution = readObject(queuePayload.execution)
    assert.equal(queueExecution.requestId, queueRequestId, 'HTTP route should expose execution.requestId')

    const runtimeAfterQueue = await requestJson(baseUrl, '/api/observability/ai-runtime?factionId=player&eventLimit=2', 'GET')
    assert.equal(runtimeAfterQueue.status, 200)
    const runtimeAfterQueuePayload = readObject(runtimeAfterQueue.data)
    const runtimeAfterQueuePlayer = readObject(readArray(runtimeAfterQueuePayload.factions)[0])
    const runtimeExecution = readObject(runtimeAfterQueuePlayer.execution)
    assert.equal(runtimeExecution.requestId, queueRequestId, 'ai-runtime route should expose queued execution requestId')
    const budget = readObject(runtimeAfterQueuePlayer.budget)
    assert.equal(
      budget.actionPointsRemaining,
      runtimeExecution.actionPointsRemaining,
      'budget snapshot should stay aligned with execution snapshot',
    )
    const recentEvents = readArray(runtimeAfterQueuePayload.recentEvents)
    assert.ok(recentEvents.length <= 2, 'eventLimit should cap recentEvents length')
    assert.ok(
      recentEvents.some((item) => readObject(item).action === 'queue_plan_execution'),
      'ai-runtime route should expose queue_plan_execution in recent events',
    )

    const advance = await requestJson(baseUrl, '/api/world/action?includeWorld=false', 'POST', { action: 'advanceTick' }, 300_000)
    assert.equal(advance.status, 200, `advanceTick route failed: ${JSON.stringify(advance.data)}`)
    const advancePayload = readObject(advance.data)
    assert.equal(advancePayload.ok, true, `advanceTick should succeed: ${JSON.stringify(advance.data)}`)

    const runtimeAfterAdvance = await requestJson(baseUrl, '/api/observability/ai-runtime?factionId=player&eventLimit=3', 'GET')
    assert.equal(runtimeAfterAdvance.status, 200, 'ai-runtime route should stay available after advanceTick')
    const runtimeAfterAdvancePayload = readObject(runtimeAfterAdvance.data)
    const runtimeAfterAdvanceRuntime = readObject(runtimeAfterAdvancePayload.runtime)
    const advanceTickPerformance = readObject(runtimeAfterAdvanceRuntime.advanceTickPerformance)
    assert.equal(advanceTickPerformance.lastOutcome, 'success', 'ai-runtime route should expose the last advanceTick outcome')
    assert.ok(
      Number(advanceTickPerformance.lastTotalDurationMs ?? 0) > 0,
      'ai-runtime route should expose lastTotalDurationMs after advanceTick',
    )
    const phaseStats = readObject(advanceTickPerformance.phaseStats)
    assert.ok(
      Number(readObject(phaseStats.reflect_world_tick ?? {}).maxDurationMs ?? 0) > 0,
      'ai-runtime route should expose aggregated phase stats for reflect_world_tick',
    )
    const advanceWorldSubphaseStats = readObject(readObject(phaseStats.advance_world_state ?? {}).subphaseStats)
    const precomputeSharedIndexStats = readObject(advanceWorldSubphaseStats['advance_world_state.precompute_shared_index'])
    assert.ok(
      Number(precomputeSharedIndexStats.maxDurationMs ?? 0) > 0,
      'ai-runtime route should expose aggregated second-level advance_world_state subphase stats',
    )
    assert.ok(
      readObject(advanceWorldSubphaseStats['advance_world_state.snapshot_previous_world.clone_map_tiles']),
      'ai-runtime route should expose deeper snapshot_previous_world timing stats',
    )
    assert.ok(
      readObject(advanceWorldSubphaseStats['advance_world_state.commit_world_state.sync_world_map_layout']),
      'ai-runtime route should expose deeper commit_world_state timing stats',
    )
    assert.ok(
      readObject(advanceWorldSubphaseStats['advance_world_state.directors_and_theater.theater_snapshot']),
      'ai-runtime route should expose deeper directors_and_theater timing stats',
    )
    assert.ok(
      readObject(advanceWorldSubphaseStats['advance_world_state.directors_and_theater.alliance_director.build_theater_snapshot']),
      'ai-runtime route should expose deeper alliance_director timing stats',
    )
    assert.ok(
      readObject(advanceWorldSubphaseStats['advance_world_state.directors_and_theater.alliance_director.build_theater_snapshot.summarize_macro_regions']),
      'ai-runtime route should expose deeper buildTheaterSnapshot timing stats',
    )
    assert.ok(
      readObject(
        advanceWorldSubphaseStats[
          'advance_world_state.directors_and_theater.alliance_director.build_theater_snapshot.summarize_macro_regions.count_units'
        ],
      ),
      'ai-runtime route should expose deepest alliance buildTheaterSnapshot region counting stats',
    )
    assert.ok(
      readObject(
        advanceWorldSubphaseStats[
          'advance_world_state.directors_and_theater.alliance_director.build_theater_snapshot.summarize_macro_regions.build_region_unit_count_index.scan_units'
        ],
      ),
      'ai-runtime route should expose deepest alliance buildTheaterSnapshot unit count index scan stats',
    )
    assert.ok(
      readObject(advanceWorldSubphaseStats['advance_world_state.directors_and_theater.opposing_director.build_theater_snapshot']),
      'ai-runtime route should expose deeper opposing_director timing stats',
    )
    assert.ok(
      readObject(
        advanceWorldSubphaseStats[
          'advance_world_state.directors_and_theater.opposing_director.build_theater_snapshot.summarize_macro_regions.count_units'
        ],
      ),
      'ai-runtime route should expose deepest opposing buildTheaterSnapshot region counting stats',
    )
    assert.ok(
      readObject(
        advanceWorldSubphaseStats[
          'advance_world_state.directors_and_theater.opposing_director.build_theater_snapshot.summarize_macro_regions.build_region_unit_count_index.scan_units'
        ],
      ),
      'ai-runtime route should expose deepest opposing buildTheaterSnapshot unit count index scan stats',
    )
    assert.ok(
      readObject(
        advanceWorldSubphaseStats[
          'advance_world_state.directors_and_theater.alliance_director.apply_stance_support.boost_regional_supply'
        ],
      ),
      'ai-runtime route should expose deepest alliance stance handler timing stats',
    )
    assert.ok(
      readObject(
        advanceWorldSubphaseStats[
          'advance_world_state.directors_and_theater.alliance_director.pick_target_tile.collect_region_tiles'
        ],
      ),
      'ai-runtime route should expose deeper alliance target picker timing stats',
    )
    assert.ok(
      readObject(
        advanceWorldSubphaseStats[
          'advance_world_state.directors_and_theater.alliance_director.pick_anchor_unit.scan_units'
        ],
      ),
      'ai-runtime route should expose deeper alliance anchor picker timing stats',
    )
    assert.ok(
      readObject(
        advanceWorldSubphaseStats[
          'advance_world_state.directors_and_theater.opposing_director.apply_scout_reposition'
        ],
      ),
      'ai-runtime route should expose deepest opposing scripted handler timing stats',
    )
    assert.ok(
      readObject(
        advanceWorldSubphaseStats[
          'advance_world_state.directors_and_theater.opposing_director.process_unhandled_units.collect_neighbor_tiles'
        ],
      ),
      'ai-runtime route should expose deepest opposing generic-unit handler timing stats',
    )
    assert.ok(
      readObject(advanceWorldSubphaseStats['advance_world_state.directors_and_theater.opposing_director.build_target_occupied_tile_set']),
      'ai-runtime route should expose deepest opposing_director index timing stats',
    )
    assert.ok(
      readObject(advanceWorldSubphaseStats['advance_world_state.commit_world_state.record_intel_diff.scan_next_intel']),
      'ai-runtime route should expose deeper record_intel_diff timing stats',
    )
    assert.ok(
      readObject(advanceWorldSubphaseStats['advance_world_state.commit_world_state.record_intel_diff.scan_next_intel.compare_entries']),
      'ai-runtime route should expose deepest record_intel_diff comparison timing stats',
    )
    assert.ok(
      readObject(
        advanceWorldSubphaseStats[
          'advance_world_state.commit_world_state.record_intel_diff.scan_removed_intel.iterate_previous_entries'
        ],
      ),
      'ai-runtime route should expose deepest record_intel_diff removed-entry scan timing stats',
    )
    assert.ok(
      readObject(
        advanceWorldSubphaseStats[
          'advance_world_state.commit_world_state.record_intel_diff.persist_diff.trim_history'
        ],
      ),
      'ai-runtime route should expose deepest record_intel_diff persist trim timing stats',
    )
    const reflectSubphaseStats = readObject(readObject(phaseStats.reflect_world_tick ?? {}).subphaseStats)
    assert.ok(
      readObject(reflectSubphaseStats['reflect_world_tick.collect_context.select_tick_artifacts']),
      'ai-runtime route should expose deeper reflect collect_context timing stats',
    )
    assert.ok(
      readObject(reflectSubphaseStats['reflect_world_tick.collect_context.select_tick_artifacts.scan_reports']),
      'ai-runtime route should expose deepest reflect tick report scan timing stats',
    )
    assert.ok(
      readObject(reflectSubphaseStats['reflect_world_tick.collect_context.build_search_indexes']),
      'ai-runtime route should expose deeper reflect search index timing stats',
    )
    assert.ok(
      readObject(reflectSubphaseStats['reflect_world_tick.collect_context.build_search_indexes.normalize_unit_entries']),
      'ai-runtime route should expose deepest reflect search index normalization timing stats',
    )
    assert.ok(
      readObject(reflectSubphaseStats['reflect_world_tick.collect_context.collect_unit_deltas.scan_after_units']),
      'ai-runtime route should expose deepest reflect unit delta scan timing stats',
    )
    assert.ok(
      readObject(
        reflectSubphaseStats[
          'reflect_world_tick.collect_context.collect_order_outcomes.collect_execution_orders.flatten_execution_buckets'
        ],
      ),
      'ai-runtime route should expose deepest reflect execution bucket flatten timing stats',
    )
    assert.ok(
      readObject(reflectSubphaseStats['reflect_world_tick.collect_context.build_drafts.build_report_drafts']),
      'ai-runtime route should expose deeper reflect build_drafts timing stats',
    )
    assert.ok(
      readObject(reflectSubphaseStats['reflect_world_tick.collect_context.build_drafts.build_report_drafts.match_units']),
      'ai-runtime route should expose deepest reflect report matching timing stats',
    )
    const syncV2SubphaseStats = readObject(readObject(phaseStats.sync_v2_resources ?? {}).subphaseStats)
    assert.ok(
      readObject(syncV2SubphaseStats['sync_v2_resources.sync_v2_state']),
      'ai-runtime route should expose sync_v2_resources subphase stats',
    )
    const recentRuns = readArray(advanceTickPerformance.recentRuns)
    assert.ok(recentRuns.length > 0, 'ai-runtime route should expose recent advanceTick runs')
    const latestRun = readObject(recentRuns[0])
    const latestRunPhases = readArray(latestRun.phases)
    assert.ok(
      latestRunPhases.some((item) => readObject(item).phase === 'advance_world_state'),
      'ai-runtime route should expose phase timings for advance_world_state',
    )
    const latestReflectPhase = latestRunPhases.find((item) => readObject(item).phase === 'reflect_world_tick')
    assert.ok(latestReflectPhase, 'latest advanceTick run should include reflect_world_tick phase timing')
    const latestReflectSubphases = readArray(readObject(latestReflectPhase).subphases)
    assert.ok(
      latestReflectSubphases.some((item) => readObject(item).subphase === 'reflect_world_tick.collect_context'),
      'latest advanceTick run should expose reflect_world_tick subphase timings',
    )
    assert.ok(
      latestReflectSubphases.some((item) => readObject(item).subphase === 'reflect_world_tick.collect_context.select_tick_artifacts'),
      'latest advanceTick run should expose deeper reflect collect_context timings',
    )
    assert.ok(
      latestReflectSubphases.some(
        (item) => readObject(item).subphase === 'reflect_world_tick.collect_context.select_tick_artifacts.scan_reports',
      ),
      'latest advanceTick run should expose deepest reflect tick report scan timings',
    )
    assert.ok(
      latestReflectSubphases.some((item) => readObject(item).subphase === 'reflect_world_tick.collect_context.build_search_indexes'),
      'latest advanceTick run should expose reflect search index timings',
    )
    assert.ok(
      latestReflectSubphases.some(
        (item) => readObject(item).subphase === 'reflect_world_tick.collect_context.build_search_indexes.normalize_unit_entries',
      ),
      'latest advanceTick run should expose deepest reflect search index normalization timings',
    )
    assert.ok(
      latestReflectSubphases.some(
        (item) => readObject(item).subphase === 'reflect_world_tick.collect_context.collect_unit_deltas.scan_after_units',
      ),
      'latest advanceTick run should expose deepest reflect unit delta scan timings',
    )
    assert.ok(
      latestReflectSubphases.some(
        (item) =>
          readObject(item).subphase ===
          'reflect_world_tick.collect_context.collect_order_outcomes.collect_execution_orders.flatten_execution_buckets',
      ),
      'latest advanceTick run should expose deepest reflect execution bucket flatten timings',
    )
    assert.ok(
      latestReflectSubphases.some((item) => readObject(item).subphase === 'reflect_world_tick.collect_context.build_drafts.build_report_drafts'),
      'latest advanceTick run should expose deeper reflect build_drafts timings',
    )
    assert.ok(
      latestReflectSubphases.some((item) => readObject(item).subphase === 'reflect_world_tick.collect_context.build_drafts.build_report_drafts.match_units'),
      'latest advanceTick run should expose deepest reflect report matching timings',
    )
    const latestAdvanceWorldPhase = latestRunPhases.find((item) => readObject(item).phase === 'advance_world_state')
    assert.ok(latestAdvanceWorldPhase, 'latest advanceTick run should include advance_world_state phase timing')
    const latestAdvanceWorldSubphases = readArray(readObject(latestAdvanceWorldPhase).subphases)
    assert.ok(
      latestAdvanceWorldSubphases.some((item) => readObject(item).subphase === 'advance_world_state.snapshot_previous_world.clone_map_tiles'),
      'latest advanceTick run should expose deeper snapshot_previous_world timings',
    )
    assert.ok(
      latestAdvanceWorldSubphases.some((item) => readObject(item).subphase === 'advance_world_state.directors_and_theater.alliance_director.build_theater_snapshot'),
      'latest advanceTick run should expose deeper alliance_director timings',
    )
    assert.ok(
      latestAdvanceWorldSubphases.some((item) => readObject(item).subphase === 'advance_world_state.directors_and_theater.alliance_director.build_theater_snapshot.summarize_macro_regions'),
      'latest advanceTick run should expose deeper buildTheaterSnapshot timings',
    )
    assert.ok(
      latestAdvanceWorldSubphases.some(
        (item) =>
          readObject(item).subphase ===
          'advance_world_state.directors_and_theater.alliance_director.build_theater_snapshot.summarize_macro_regions.count_units',
      ),
      'latest advanceTick run should expose deepest alliance buildTheaterSnapshot region counting timings',
    )
    assert.ok(
      latestAdvanceWorldSubphases.some(
        (item) =>
          readObject(item).subphase ===
          'advance_world_state.directors_and_theater.alliance_director.build_theater_snapshot.summarize_macro_regions.build_region_unit_count_index.scan_units',
      ),
      'latest advanceTick run should expose deepest alliance buildTheaterSnapshot unit count index scan timings',
    )
    assert.ok(
      latestAdvanceWorldSubphases.some((item) => readObject(item).subphase === 'advance_world_state.directors_and_theater.opposing_director.build_theater_snapshot'),
      'latest advanceTick run should expose deeper opposing_director timings',
    )
    assert.ok(
      latestAdvanceWorldSubphases.some(
        (item) =>
          readObject(item).subphase ===
          'advance_world_state.directors_and_theater.opposing_director.build_theater_snapshot.summarize_macro_regions.count_units',
      ),
      'latest advanceTick run should expose deepest opposing buildTheaterSnapshot region counting timings',
    )
    assert.ok(
      latestAdvanceWorldSubphases.some(
        (item) =>
          readObject(item).subphase ===
          'advance_world_state.directors_and_theater.opposing_director.build_theater_snapshot.summarize_macro_regions.build_region_unit_count_index.scan_units',
      ),
      'latest advanceTick run should expose deepest opposing buildTheaterSnapshot unit count index scan timings',
    )
    assert.ok(
      latestAdvanceWorldSubphases.some(
        (item) =>
          readObject(item).subphase ===
          'advance_world_state.directors_and_theater.alliance_director.apply_stance_support.boost_regional_supply',
      ),
      'latest advanceTick run should expose deepest alliance stance handler timings',
    )
    assert.ok(
      latestAdvanceWorldSubphases.some(
        (item) =>
          readObject(item).subphase ===
          'advance_world_state.directors_and_theater.alliance_director.pick_target_tile.collect_region_tiles',
      ),
      'latest advanceTick run should expose deeper alliance target picker timings',
    )
    assert.ok(
      latestAdvanceWorldSubphases.some(
        (item) =>
          readObject(item).subphase ===
          'advance_world_state.directors_and_theater.alliance_director.pick_anchor_unit.scan_units',
      ),
      'latest advanceTick run should expose deeper alliance anchor picker timings',
    )
    assert.ok(
      latestAdvanceWorldSubphases.some(
        (item) =>
          readObject(item).subphase ===
          'advance_world_state.directors_and_theater.opposing_director.apply_scout_reposition',
      ),
      'latest advanceTick run should expose deepest opposing scripted handler timings',
    )
    assert.ok(
      latestAdvanceWorldSubphases.some(
        (item) =>
          readObject(item).subphase ===
          'advance_world_state.directors_and_theater.opposing_director.process_unhandled_units.collect_neighbor_tiles',
      ),
      'latest advanceTick run should expose deepest opposing generic-unit handler timings',
    )
    assert.ok(
      latestAdvanceWorldSubphases.some((item) => readObject(item).subphase === 'advance_world_state.directors_and_theater.opposing_director.build_target_occupied_tile_set'),
      'latest advanceTick run should expose deepest opposing_director index timings',
    )
    assert.ok(
      latestAdvanceWorldSubphases.some((item) => readObject(item).subphase === 'advance_world_state.commit_world_state.record_intel_diff.scan_next_intel'),
      'latest advanceTick run should expose deeper record_intel_diff timings',
    )
    assert.ok(
      latestAdvanceWorldSubphases.some((item) => readObject(item).subphase === 'advance_world_state.commit_world_state.record_intel_diff.scan_next_intel.compare_entries'),
      'latest advanceTick run should expose deepest record_intel_diff comparison timings',
    )
    assert.ok(
      latestAdvanceWorldSubphases.some(
        (item) =>
          readObject(item).subphase ===
          'advance_world_state.commit_world_state.record_intel_diff.scan_removed_intel.iterate_previous_entries',
      ),
      'latest advanceTick run should expose deepest record_intel_diff removed-entry scan timings',
    )
    assert.ok(
      latestAdvanceWorldSubphases.some(
        (item) =>
          readObject(item).subphase ===
          'advance_world_state.commit_world_state.record_intel_diff.persist_diff.trim_history',
      ),
      'latest advanceTick run should expose deepest record_intel_diff persist trim timings',
    )
    const latestSyncPhase = latestRunPhases.find((item) => readObject(item).phase === 'sync_v2_resources')
    assert.ok(latestSyncPhase, 'latest advanceTick run should include sync_v2_resources phase timing')
    const latestSyncSubphases = readArray(readObject(latestSyncPhase).subphases)
    assert.ok(
      latestSyncSubphases.some((item) => readObject(item).subphase === 'sync_v2_resources.sync_v2_state'),
      'latest advanceTick run should expose sync_v2_resources subphase timings',
    )

    const agendaMemory = await requestJson(baseUrl, '/api/civil-memory?type=agenda_compiled&limit=5', 'GET')
    assert.equal(agendaMemory.status, 200, 'civil-memory route should return 200')
    const agendaMemoryPayload = readObject(agendaMemory.data)
    const agendaItems = readArray(agendaMemoryPayload.items)
    assert.ok(agendaItems.length > 0, 'advanceTick should produce agenda_compiled memory entries')
    const matchedAgenda = agendaItems.find((item) => {
      const record = readObject(item)
      return readArray(record.factionIds).length > 0 && readArray(record.relatedIds).length > 0
    })
    assert.ok(matchedAgenda, 'at least one agenda_compiled memory entry should expose factionIds and relatedIds')
    const matchedAgendaRecord = readObject(matchedAgenda)
    const factionId = String(readArray(matchedAgendaRecord.factionIds)[0] ?? '')
    const relatedId = String(readArray(matchedAgendaRecord.relatedIds)[0] ?? '')
    assert.ok(factionId.length > 0, 'matched memory entry should expose factionId')
    assert.ok(relatedId.length > 0, 'matched memory entry should expose relatedId')

    const filteredMemory = await requestJson(
      baseUrl,
      `/api/civil-memory?type=agenda_compiled&limit=10&factionId=${encodeURIComponent(factionId)}&relatedId=${encodeURIComponent(relatedId)}`,
      'GET',
    )
    assert.equal(filteredMemory.status, 200, 'filtered civil-memory route should return 200')
    const filteredItems = readArray(readObject(filteredMemory.data).items)
    assert.ok(
      filteredItems.some((item) => readObject(item).id === matchedAgendaRecord.id),
      'civil-memory route should pass through factionId and relatedId filters',
    )

    const leave = await requestJson(baseUrl, '/api/session/leave', 'POST', { token: sessionToken })
    assert.equal(leave.status, 200, `leave failed: ${JSON.stringify(leave.data)}`)

    console.log('[ai_runtime_http_contract] all checks passed')
  } catch (error) {
    const details =
      error instanceof Error
        ? `${error.message}\nstdout=${tail.stdout.join('\n')}\nstderr=${tail.stderr.join('\n')}`
        : `unknown error\nstdout=${tail.stdout.join('\n')}\nstderr=${tail.stderr.join('\n')}`
    console.error('[ai_runtime_http_contract] failed', details)
    process.exitCode = 1
  } finally {
    if (sessionToken.length > 0) {
      await requestJson(baseUrl, '/api/session/leave', 'POST', { token: sessionToken }).catch(() => null)
    }
    await shutdownChild(child)
  }
}

void run()
