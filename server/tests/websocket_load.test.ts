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

const LOAD_PROFILE = readLabelEnv('AI_RUNTIME_LOAD_PROFILE', 'baseline')
const CLIENT_COUNT = readIntegerEnv('WEBSOCKET_LOAD_CLIENT_COUNT', 16)
const PRIMARY_CLIENT_COUNT = readIntegerEnv('WEBSOCKET_LOAD_PRIMARY_CLIENT_COUNT', CLIENT_COUNT)
const SECONDARY_CLIENT_COUNT = readIntegerEnv('WEBSOCKET_LOAD_SECONDARY_CLIENT_COUNT', 0, 0)
const FANOUT_BURSTS = readIntegerEnv('WEBSOCKET_LOAD_FANOUT_BURSTS', 1)
const FANOUT_BURST_DELAY_MS = readIntegerEnv('WEBSOCKET_LOAD_FANOUT_BURST_DELAY_MS', 150, 0)
const MAX_SUBSCRIBE_P95_MS = readNumberEnv('WEBSOCKET_LOAD_MAX_SUBSCRIBE_P95_MS', 3_000, 1)
const MAX_FANOUT_P95_MS = readNumberEnv('WEBSOCKET_LOAD_MAX_FANOUT_P95_MS', 5_000, 1)

assert.equal(
  PRIMARY_CLIENT_COUNT + SECONDARY_CLIENT_COUNT,
  CLIENT_COUNT,
  'websocket load split must add up to the configured client count',
)

function selectTargetFactions(data: unknown, targetCount: number): string[] {
  const payload = readObject(data)
  const world = readObject(payload.world)
  const factions = Object.keys(readObject(world.factions))
  assert.ok(factions.length > 0, 'websocket load requires at least one faction in the world')
  const primaryFactionId = factions.includes('player') ? 'player' : factions[0]
  if (targetCount <= 1) {
    return [primaryFactionId]
  }

  const secondaryFactionId = factions.find((factionId) => factionId !== primaryFactionId)
  assert.ok(secondaryFactionId, 'websocket load requires a second faction for split fanout load')
  return [primaryFactionId, secondaryFactionId]
}

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
  timeoutMs = 10_000,
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

async function run() {
  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const wsUrl = `ws://127.0.0.1:${port}/ws`
  const tail: TailState = { stdout: [], stderr: [] }
  const sessionPersistPath = buildSessionPersistPath('websocket_load')
  const saveSlotsPersistPath = buildSessionPersistPath('websocket_load_save_slots')
  const maxPerFactionClientCount = Math.max(PRIMARY_CLIENT_COUNT, SECONDARY_CLIENT_COUNT, 1)
  const child = spawnBackend(port, tail, {
    SESSION_MAX_ACTIVE: String(CLIENT_COUNT),
    SESSION_MAX_SEATS_PER_FACTION: String(maxPerFactionClientCount),
    WS_MAX_CONNECTIONS: String(CLIENT_COUNT),
    WS_MAX_SUBSCRIPTIONS_PER_FACTION: String(maxPerFactionClientCount),
    SESSION_STATE_PERSIST_PATH: sessionPersistPath,
    WORLD_SAVE_SLOTS_PATH: saveSlotsPersistPath,
    WORLD_SAVE_SLOTS_ARCHIVE_DIR: `${saveSlotsPersistPath}.archive`,
  })

  const tokens: Array<{ token: string; factionId: string }> = []
  const sockets: WebSocket[] = []

  try {
    const health = await waitForHealth(baseUrl)
    assert.ok(health, `backend did not become healthy\nstdout=${tail.stdout.join('\n')}\nstderr=${tail.stderr.join('\n')}`)

    const worldResult = await requestJson(baseUrl, '/api/world?planningHistoryLimit=1&replayLimit=1&replayFrameLimit=1', 'GET')
    assert.equal(worldResult.status, 200, `world probe failed: ${JSON.stringify(worldResult.data)}`)
    const [primaryFactionId, secondaryFactionId] = selectTargetFactions(
      worldResult.data,
      SECONDARY_CLIENT_COUNT > 0 ? 2 : 1,
    )

    async function joinFactionClients(factionId: string, count: number, prefix: string) {
      for (let index = 0; index < count; index += 1) {
        const join = await requestJson(
          baseUrl,
          '/api/session/join',
          'POST',
          {
            factionId,
            playerName: `${prefix}_${index}`,
          },
          20_000,
        )
        assert.equal(join.status, 200, `join failed: ${JSON.stringify(join.data)}`)
        const payload = readObject(join.data)
        const token = String(payload.token ?? '')
        assert.ok(token.length > 0, 'join should return token')
        tokens.push({ token, factionId })
      }
    }

    if (PRIMARY_CLIENT_COUNT > 0) {
      await joinFactionClients(primaryFactionId, PRIMARY_CLIENT_COUNT, 'ws_load_primary')
    }
    if (SECONDARY_CLIENT_COUNT > 0) {
      await joinFactionClients(secondaryFactionId, SECONDARY_CLIENT_COUNT, 'ws_load_secondary')
    }

    const subscribeResults = await Promise.all(
      tokens.map(async ({ token, factionId }) => {
        const socket = new WebSocket(wsUrl)
        sockets.push(socket)
        const startedAt = performance.now()
        await waitForOpen(socket)
        const subscribedPromise = waitForMessage(socket, (payload) => payload.type === 'subscribed')
        socket.send(JSON.stringify({ type: 'subscribe', factionId, token }))
        const subscribed = await subscribedPromise
        assert.equal(subscribed.type, 'subscribed')
        return {
          socket,
          factionId,
          latencyMs: performance.now() - startedAt,
        }
      }),
    )

    const subscribeP95Ms = calculatePercentile(
      subscribeResults.map((item) => item.latencyMs),
      95,
    )
    assert.ok(
      subscribeP95Ms <= MAX_SUBSCRIBE_P95_MS,
      `websocket subscribe p95 should stay under ${MAX_SUBSCRIBE_P95_MS}ms, got ${subscribeP95Ms.toFixed(2)}ms`,
    )

    await sleep(150)

    const runtimeBefore = await requestJson(
      baseUrl,
      `/api/observability/ai-runtime?factionId=${encodeURIComponent(primaryFactionId)}&eventLimit=1`,
      'GET',
    )
    assert.equal(runtimeBefore.status, 200, `ai-runtime preflight failed: ${JSON.stringify(runtimeBefore.data)}`)
    const wsStatsBefore = readObject(readObject(readObject(runtimeBefore.data).runtime).wsStats)
    assert.equal(Number(wsStatsBefore.totalConnections ?? 0), CLIENT_COUNT, 'wsStats should expose active socket count')
    assert.equal(Number(wsStatsBefore.subscribedConnections ?? 0), CLIENT_COUNT, 'wsStats should expose subscribed socket count')

    const activeFactionIds = [
      primaryFactionId,
      ...(SECONDARY_CLIENT_COUNT > 0 ? [secondaryFactionId] : []),
    ]
    const deltaLatencies: number[] = []
    for (let burst = 0; burst < FANOUT_BURSTS; burst += 1) {
      const deltaStartedAt = performance.now()
      const deltaPromises = subscribeResults.map(async ({ socket }) => {
        const message = await waitForMessage(socket, (payload) => payload.type === 'tick_delta', 15_000)
        return {
          message,
          latencyMs: performance.now() - deltaStartedAt,
        }
      })

      const emitResponses = await Promise.all(
        activeFactionIds.map(async (factionId) => {
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
      assert.equal(emitResponses.length, activeFactionIds.length, 'fanout should emit for every subscribed faction')

      const deltas = await Promise.all(deltaPromises)
      deltaLatencies.push(...deltas.map((item) => item.latencyMs))

      for (const delta of deltas) {
        assert.equal(delta.message.type, 'tick_delta')
        assert.ok(typeof delta.message.worldVersion === 'number', 'tick_delta should expose worldVersion')
      }

      if (burst < FANOUT_BURSTS - 1 && FANOUT_BURST_DELAY_MS > 0) {
        await sleep(FANOUT_BURST_DELAY_MS)
      }
    }

    const fanoutP95Ms = calculatePercentile(deltaLatencies, 95)
    assert.ok(
      fanoutP95Ms <= MAX_FANOUT_P95_MS,
      `websocket fanout p95 should stay under ${MAX_FANOUT_P95_MS}ms, got ${fanoutP95Ms.toFixed(2)}ms`,
    )

    const runtimeAfter = await requestJson(
      baseUrl,
      `/api/observability/ai-runtime?factionId=${encodeURIComponent(primaryFactionId)}&eventLimit=1`,
      'GET',
    )
    assert.equal(runtimeAfter.status, 200, `ai-runtime post-fanout failed: ${JSON.stringify(runtimeAfter.data)}`)
    const wsStatsAfter = readObject(readObject(readObject(runtimeAfter.data).runtime).wsStats)
    assert.equal(Number(wsStatsAfter.totalConnections ?? 0), CLIENT_COUNT, 'fanout should preserve active socket count')
    assert.equal(Number(wsStatsAfter.subscribedConnections ?? 0), CLIENT_COUNT, 'fanout should preserve subscribed socket count')
    assert.equal(Number(wsStatsAfter.rejectedConnections ?? 0), 0, 'real socket load should not reject under configured quota')

    console.log(JSON.stringify({
      name: 'websocket_load',
      ok: true,
      profile: LOAD_PROFILE,
      clientCount: CLIENT_COUNT,
      primaryClientCount: PRIMARY_CLIENT_COUNT,
      secondaryClientCount: SECONDARY_CLIENT_COUNT,
      primaryFactionId,
      secondaryFactionId: SECONDARY_CLIENT_COUNT > 0 ? secondaryFactionId : null,
      fanoutBursts: FANOUT_BURSTS,
      subscribeP95Ms: Number(subscribeP95Ms.toFixed(2)),
      fanoutP95Ms: Number(fanoutP95Ms.toFixed(2)),
    }))
  } catch (error) {
    const details =
      error instanceof Error
        ? `${error.message}\nstdout=${tail.stdout.join('\n')}\nstderr=${tail.stderr.join('\n')}`
        : `unknown error\nstdout=${tail.stdout.join('\n')}\nstderr=${tail.stderr.join('\n')}`
    console.error('[websocket_load] failed', details)
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
