import assert from 'node:assert/strict'
import { WebSocket } from 'ws'
import { getWorldStateReadonly } from '../src/application/world/WorldService'
import {
  joinSession,
  resetSessionManagerForTests,
  setSessionRuntimeConfigForTests,
} from '../src/multiplayer/SessionManager'
import {
  __handleClientMessageForTests,
  __registerTestClient,
  __resetWebSocketStateForTests,
  __setWebSocketRuntimeConfigForTests,
  broadcastTickDelta,
  getWebSocketStats,
} from '../src/ws/GameWebSocket'
import type { NarrativeEvent } from '../../shared/contracts/game'

class FakeWebSocket {
  readyState: number = WebSocket.OPEN
  sent: string[] = []
  closeCalls: Array<{ code?: number; reason?: string }> = []

  send(payload: string): void {
    this.sent.push(payload)
  }

  close(code?: number, reason?: string): void {
    this.closeCalls.push({ code, reason })
    this.readyState = WebSocket.CLOSED
  }
}

function expectJoinSuccess(
  result: ReturnType<typeof joinSession>,
): Exclude<ReturnType<typeof joinSession>, { error: string }> {
  assert.ok(!('error' in result), `join should succeed, got error: ${'error' in result ? result.error : 'unknown'}`)
  return result as Exclude<ReturnType<typeof joinSession>, { error: string }>
}

function parseMessages(ws: FakeWebSocket): Array<Record<string, unknown>> {
  return ws.sent.map((item) => JSON.parse(item) as Record<string, unknown>)
}

function configureSessionTests(): string[] {
  resetSessionManagerForTests()
  setSessionRuntimeConfigForTests({
    heartbeatTimeoutMs: 5_000,
    staleSessionTtlMs: 8_000,
    maxActiveSessions: 16,
    maxSeatsPerFaction: 8,
    maxPlayerNameLength: 32,
  })
  return Object.keys(getWorldStateReadonly().factions)
}

function testConnectionQuota() {
  __resetWebSocketStateForTests()
  __setWebSocketRuntimeConfigForTests({
    maxConnections: 1,
    maxSubscriptionsPerFaction: 1,
    maxVisibleEventsPerTick: 2,
    maxVisibleUnitChangesPerTick: 2,
    maxVisibleTileChangesPerTick: 2,
  })

  const firstSocket = new FakeWebSocket()
  const firstSession = __registerTestClient(firstSocket as unknown as WebSocket)
  assert.ok(firstSession, 'first websocket client should register')

  const secondSocket = new FakeWebSocket()
  const secondSession = __registerTestClient(secondSocket as unknown as WebSocket)
  assert.equal(secondSession, null, 'second websocket client should be rejected by connection quota')
  assert.equal(secondSocket.closeCalls.length, 1, 'rejected websocket should be closed')
  assert.equal(secondSocket.closeCalls[0]?.code, 1013, 'rejected websocket should use capacity close code')

  const stats = getWebSocketStats()
  assert.equal(stats.maxConnections, 1)
  assert.equal(stats.rejectedConnections, 1)
}

function testSubscriptionQuota() {
  __resetWebSocketStateForTests()
  __setWebSocketRuntimeConfigForTests({
    maxConnections: 4,
    maxSubscriptionsPerFaction: 1,
    maxVisibleEventsPerTick: 2,
    maxVisibleUnitChangesPerTick: 2,
    maxVisibleTileChangesPerTick: 2,
  })

  const validFactions = configureSessionTests()
  const alpha = expectJoinSuccess(joinSession('player', 'Alpha', validFactions))
  const beta = expectJoinSuccess(joinSession('player', 'Beta', validFactions))

  const firstSocket = new FakeWebSocket()
  const firstSession = __registerTestClient(firstSocket as unknown as WebSocket)
  assert.ok(firstSession, 'first subscribed client should register')
  __handleClientMessageForTests(firstSession, { type: 'subscribe', factionId: 'player', token: alpha.token })

  const secondSocket = new FakeWebSocket()
  const secondSession = __registerTestClient(secondSocket as unknown as WebSocket)
  assert.ok(secondSession, 'second subscribed client should register before subscribe quota check')
  __handleClientMessageForTests(secondSession, { type: 'subscribe', factionId: 'player', token: beta.token })

  const firstMessages = parseMessages(firstSocket)
  const secondMessages = parseMessages(secondSocket)
  assert.equal(firstMessages[firstMessages.length - 1]?.type, 'subscribed')
  assert.equal(secondMessages[secondMessages.length - 1]?.type, 'error')
  assert.match(
    String(secondMessages[secondMessages.length - 1]?.message ?? ''),
    /subscription quota reached/,
  )

  const stats = getWebSocketStats()
  assert.equal(stats.maxSubscriptionsPerFaction, 1)
  assert.equal(stats.rejectedSubscriptions, 1)
}

function testTickDeltaBudgetTruncation() {
  __resetWebSocketStateForTests()
  __setWebSocketRuntimeConfigForTests({
    maxConnections: 4,
    maxSubscriptionsPerFaction: 2,
    maxVisibleEventsPerTick: 1,
    maxVisibleUnitChangesPerTick: 1,
    maxVisibleTileChangesPerTick: 1,
  })

  const validFactions = configureSessionTests()
  const alpha = expectJoinSuccess(joinSession('player', 'Alpha', validFactions))

  const socket = new FakeWebSocket()
  const session = __registerTestClient(socket as unknown as WebSocket)
  assert.ok(session, 'tick delta client should register')
  __handleClientMessageForTests(session, { type: 'subscribe', factionId: 'player', token: alpha.token })

  const prevWorld = structuredClone(getWorldStateReadonly())
  const nextWorld = structuredClone(prevWorld)
  const anchorUnit = nextWorld.units.find((unit) => unit.faction === 'player') ?? nextWorld.units[0]
  assert.ok(anchorUnit, 'test world should contain at least one unit')
  anchorUnit.tileId = nextWorld.map.tiles[1]?.id ?? anchorUnit.tileId
  const clonedUnit = structuredClone(anchorUnit)
  clonedUnit.id = `${anchorUnit.id}_quota_test`
  clonedUnit.tileId = nextWorld.map.tiles[2]?.id ?? clonedUnit.tileId
  nextWorld.units.push(clonedUnit)
  nextWorld.map.tiles[0].enemyPressure += 1
  nextWorld.map.tiles[1].enemyPressure += 2

  const events: NarrativeEvent[] = [
    {
      id: 'ws-quota-1',
      tick: nextWorld.tick,
      type: 'achievement',
      actors: ['player'],
      summary: 'quota event alpha',
      causalChain: ['test'],
      consequences: ['alpha'],
      significance: 'major',
    },
    {
      id: 'ws-quota-2',
      tick: nextWorld.tick,
      type: 'failure',
      actors: ['player'],
      summary: 'quota event beta',
      causalChain: ['test'],
      consequences: ['beta'],
      significance: 'major',
    },
  ]

  broadcastTickDelta(prevWorld, nextWorld, events)

  const tickDelta = parseMessages(socket).find((message) => message.type == 'tick_delta')
  assert.ok(tickDelta, 'tick delta message should be delivered to subscribed client')
  assert.equal((tickDelta?.events as unknown[]).length, 1, 'events should respect per-message budget')
  assert.equal((tickDelta?.unitChanges as unknown[]).length, 1, 'unit changes should respect per-message budget')
  assert.equal((tickDelta?.tileChanges as unknown[]).length, 1, 'tile changes should respect per-message budget')

  const stats = getWebSocketStats()
  assert.equal(stats.truncatedTickDeltaMessages, 1)
}

function run() {
  testConnectionQuota()
  testSubscriptionQuota()
  testTickDeltaBudgetTruncation()
  resetSessionManagerForTests()
  __resetWebSocketStateForTests()
  console.log('[websocket_quota] all checks passed')
}

run()
