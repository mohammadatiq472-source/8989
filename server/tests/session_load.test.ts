import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import {
  buildSessionPersistPath,
  calculatePercentile,
  getAvailablePort,
  readArray,
  readIntegerEnv,
  readLabelEnv,
  readNumberEnv,
  readObject,
  requestJson,
  spawnBackend,
  shutdownChild,
  waitForHealth,
  type TailState,
} from './helpers/backendHarness'

const LOAD_PROFILE = readLabelEnv('AI_RUNTIME_LOAD_PROFILE', 'baseline')
const SESSION_COUNT = readIntegerEnv('SESSION_LOAD_SESSION_COUNT', 24)
const PRIMARY_SEAT_COUNT = readIntegerEnv('SESSION_LOAD_PRIMARY_SEAT_COUNT', SESSION_COUNT)
const SECONDARY_SEAT_COUNT = readIntegerEnv('SESSION_LOAD_SECONDARY_SEAT_COUNT', 0, 0)
const HEARTBEAT_ROUNDS = readIntegerEnv('SESSION_LOAD_HEARTBEAT_ROUNDS', 1)
const MAX_JOIN_P95_MS = readNumberEnv('SESSION_LOAD_MAX_JOIN_P95_MS', 3_000, 1)
const MAX_HEARTBEAT_P95_MS = readNumberEnv('SESSION_LOAD_MAX_HEARTBEAT_P95_MS', 2_000, 1)
const MAX_LEAVE_P95_MS = readNumberEnv('SESSION_LOAD_MAX_LEAVE_P95_MS', 2_000, 1)

assert.equal(
  PRIMARY_SEAT_COUNT + SECONDARY_SEAT_COUNT,
  SESSION_COUNT,
  'session load split must add up to the configured session count',
)

function selectTargetFactions(data: unknown, targetCount: number): string[] {
  const payload = readObject(data)
  const world = readObject(payload.world)
  const factions = Object.keys(readObject(world.factions))
  assert.ok(factions.length > 0, 'session load requires at least one faction in the world')
  const primaryFactionId = factions.includes('player') ? 'player' : factions[0]
  if (targetCount <= 1) {
    return [primaryFactionId]
  }

  const secondaryFactionId = factions.find((factionId) => factionId !== primaryFactionId)
  assert.ok(secondaryFactionId, 'session load requires a second faction for xhigh split load')
  return [primaryFactionId, secondaryFactionId]
}

function findRuntimeFaction(data: unknown, factionId: string) {
  const runtime = readObject(data)
  const factions = readArray(runtime.factions).map((item) => readObject(item))
  const row = factions.find((item) => item.factionId === factionId)
  assert.ok(row, `session runtime missing faction ${factionId}`)
  return row
}

async function run() {
  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const tail: TailState = { stdout: [], stderr: [] }
  const sessionPersistPath = buildSessionPersistPath('session_load')
  const saveSlotsPersistPath = buildSessionPersistPath('session_load_save_slots')
  const child = spawnBackend(port, tail, {
    SESSION_MAX_ACTIVE: String(SESSION_COUNT),
    SESSION_MAX_SEATS_PER_FACTION: String(SESSION_COUNT),
    SESSION_STATE_PERSIST_PATH: sessionPersistPath,
    WORLD_SAVE_SLOTS_PATH: saveSlotsPersistPath,
    WORLD_SAVE_SLOTS_ARCHIVE_DIR: `${saveSlotsPersistPath}.archive`,
  })

  const tokens: string[] = []

  try {
    const health = await waitForHealth(baseUrl)
    assert.ok(health, `backend did not become healthy\nstdout=${tail.stdout.join('\n')}\nstderr=${tail.stderr.join('\n')}`)

    const worldResult = await requestJson(baseUrl, '/api/world?planningHistoryLimit=1&replayLimit=1&replayFrameLimit=1', 'GET')
    assert.equal(worldResult.status, 200, `world probe failed: ${JSON.stringify(worldResult.data)}`)
    const [primaryFactionId, secondaryFactionId] = selectTargetFactions(
      worldResult.data,
      SECONDARY_SEAT_COUNT > 0 ? 2 : 1,
    )

    async function joinFactionSeats(factionId: string, seatCount: number, prefix: string) {
      return await Promise.all(
        Array.from({ length: seatCount }, async (_, index) => {
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
          tokens.push(token)
          return { token, latencyMs }
        }),
      )
    }

    const joinResponses = [
      ...(PRIMARY_SEAT_COUNT > 0 ? await joinFactionSeats(primaryFactionId, PRIMARY_SEAT_COUNT, 'session_load_primary') : []),
      ...(SECONDARY_SEAT_COUNT > 0
        ? await joinFactionSeats(secondaryFactionId, SECONDARY_SEAT_COUNT, 'session_load_secondary')
        : []),
    ]

    const joinP95Ms = calculatePercentile(joinResponses.map((item) => item.latencyMs), 95)
    assert.ok(
      joinP95Ms <= MAX_JOIN_P95_MS,
      `session join p95 should stay under ${MAX_JOIN_P95_MS}ms, got ${joinP95Ms.toFixed(2)}ms`,
    )

    const overflowJoin = await requestJson(
      baseUrl,
      '/api/session/join',
      'POST',
      {
        factionId: primaryFactionId,
        playerName: 'session_load_overflow',
      },
      20_000,
    )
    assert.equal(overflowJoin.status, 409, 'session join beyond configured capacity should be rejected')

    const runtimeAfterJoin = await requestJson(baseUrl, '/api/session/runtime', 'GET')
    assert.equal(runtimeAfterJoin.status, 200, `session runtime failed: ${JSON.stringify(runtimeAfterJoin.data)}`)
    const primaryRuntimeFaction = findRuntimeFaction(runtimeAfterJoin.data, primaryFactionId)
    assert.equal(Number(primaryRuntimeFaction.seatCount ?? 0), PRIMARY_SEAT_COUNT, 'primary seatCount should match load join count')
    assert.equal(
      Number(primaryRuntimeFaction.onlineSeatCount ?? 0),
      PRIMARY_SEAT_COUNT,
      'primary onlineSeatCount should match load join count',
    )
    if (SECONDARY_SEAT_COUNT > 0) {
      const secondaryRuntimeFaction = findRuntimeFaction(runtimeAfterJoin.data, secondaryFactionId)
      assert.equal(
        Number(secondaryRuntimeFaction.seatCount ?? 0),
        SECONDARY_SEAT_COUNT,
        'secondary seatCount should match load join count',
      )
      assert.equal(
        Number(secondaryRuntimeFaction.onlineSeatCount ?? 0),
        SECONDARY_SEAT_COUNT,
        'secondary onlineSeatCount should match load join count',
      )
    }

    const heartbeatResponses: number[] = []
    for (let round = 0; round < HEARTBEAT_ROUNDS; round += 1) {
      const roundResponses = await Promise.all(
        tokens.map(async (token) => {
          const startedAt = performance.now()
          const result = await requestJson(baseUrl, '/api/session/heartbeat', 'POST', { token }, 15_000)
          const latencyMs = performance.now() - startedAt
          assert.equal(result.status, 200, `heartbeat failed: ${JSON.stringify(result.data)}`)
          assert.equal(readObject(result.data).ok, true, `heartbeat should succeed: ${JSON.stringify(result.data)}`)
          return latencyMs
        }),
      )
      heartbeatResponses.push(...roundResponses)
    }
    const heartbeatP95Ms = calculatePercentile(heartbeatResponses, 95)
    assert.ok(
      heartbeatP95Ms <= MAX_HEARTBEAT_P95_MS,
      `session heartbeat p95 should stay under ${MAX_HEARTBEAT_P95_MS}ms, got ${heartbeatP95Ms.toFixed(2)}ms`,
    )

    const leaveResponses = await Promise.all(
      tokens.map(async (token) => {
        const startedAt = performance.now()
        const result = await requestJson(baseUrl, '/api/session/leave', 'POST', { token }, 15_000)
        const latencyMs = performance.now() - startedAt
        assert.equal(result.status, 200, `leave failed: ${JSON.stringify(result.data)}`)
        assert.equal(readObject(result.data).ok, true, `leave should succeed: ${JSON.stringify(result.data)}`)
        return latencyMs
      }),
    )
    const leaveP95Ms = calculatePercentile(leaveResponses, 95)
    assert.ok(
      leaveP95Ms <= MAX_LEAVE_P95_MS,
      `session leave p95 should stay under ${MAX_LEAVE_P95_MS}ms, got ${leaveP95Ms.toFixed(2)}ms`,
    )

    const runtimeAfterLeave = await requestJson(baseUrl, '/api/session/runtime', 'GET')
    assert.equal(runtimeAfterLeave.status, 200, `session runtime after leave failed: ${JSON.stringify(runtimeAfterLeave.data)}`)
    const runtimeAfterLeaveFaction = findRuntimeFaction(runtimeAfterLeave.data, primaryFactionId)
    assert.equal(Number(runtimeAfterLeaveFaction.seatCount ?? 0), 0, 'primary seatCount should be released after concurrent leave')
    assert.equal(
      Number(runtimeAfterLeaveFaction.onlineSeatCount ?? 0),
      0,
      'primary onlineSeatCount should be released after concurrent leave',
    )
    if (SECONDARY_SEAT_COUNT > 0) {
      const runtimeAfterLeaveSecondaryFaction = findRuntimeFaction(runtimeAfterLeave.data, secondaryFactionId)
      assert.equal(
        Number(runtimeAfterLeaveSecondaryFaction.seatCount ?? 0),
        0,
        'secondary seatCount should be released after concurrent leave',
      )
      assert.equal(
        Number(runtimeAfterLeaveSecondaryFaction.onlineSeatCount ?? 0),
        0,
        'secondary onlineSeatCount should be released after concurrent leave',
      )
    }

    console.log(JSON.stringify({
      name: 'session_load',
      ok: true,
      profile: LOAD_PROFILE,
      sessionCount: SESSION_COUNT,
      primarySeatCount: PRIMARY_SEAT_COUNT,
      secondarySeatCount: SECONDARY_SEAT_COUNT,
      primaryFactionId,
      secondaryFactionId: SECONDARY_SEAT_COUNT > 0 ? secondaryFactionId : null,
      heartbeatRounds: HEARTBEAT_ROUNDS,
      joinP95Ms: Number(joinP95Ms.toFixed(2)),
      heartbeatP95Ms: Number(heartbeatP95Ms.toFixed(2)),
      leaveP95Ms: Number(leaveP95Ms.toFixed(2)),
    }))
  } catch (error) {
    const details =
      error instanceof Error
        ? `${error.stack ?? error.message}\nstdout=${tail.stdout.join('\n')}\nstderr=${tail.stderr.join('\n')}`
        : `unknown error\nstdout=${tail.stdout.join('\n')}\nstderr=${tail.stderr.join('\n')}`
    console.error('[session_load] failed', details)
    process.exitCode = 1
  } finally {
    for (const token of tokens) {
      await requestJson(baseUrl, '/api/session/leave', 'POST', { token }, 10_000).catch(() => null)
    }
    await shutdownChild(child)
  }
}

void run()
