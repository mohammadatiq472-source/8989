import assert from 'node:assert/strict'
import {
  getAllAutonomousFactionIds,
  getAllL2FactionIds,
  getFactionAutonomyLevel,
  getFactionSessionSnapshot,
  getSessionMetrics,
  getSessionStatus,
  heartbeat,
  joinSession,
  leaveSession,
  resetSessionManagerForTests,
  setSessionRuntimeConfigForTests,
  setSessionAutonomyLevel,
  setSessionTimeSourceForTests,
  sweepAllTimeouts,
  validateToken,
} from '../src/multiplayer/SessionManager'

function createClock(start = 0) {
  let now = start
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms
    },
  }
}

function expectJoinSuccess(
  result: ReturnType<typeof joinSession>,
): Exclude<ReturnType<typeof joinSession>, { error: string }> {
  assert.ok(!('error' in result), `join should succeed, got error: ${'error' in result ? result.error : 'unknown'}`)
  return result as Exclude<ReturnType<typeof joinSession>, { error: string }>
}

function testMultiSeatAutonomyAggregation() {
  resetSessionManagerForTests()
  const clock = createClock(10_000)
  setSessionTimeSourceForTests(clock.now)
  setSessionRuntimeConfigForTests({
    heartbeatTimeoutMs: 5_000,
    staleSessionTtlMs: 8_000,
    maxActiveSessions: 16,
    maxSeatsPerFaction: 10,
    maxPlayerNameLength: 32,
  })

  const alpha = expectJoinSuccess(joinSession('player', 'Alice', ['player', 'enemy']))
  const beta = expectJoinSuccess(joinSession('player', 'Bob', ['player', 'enemy']))

  assert.equal(alpha.seatId, 1)
  assert.equal(beta.seatId, 2)
  assert.equal(getFactionAutonomyLevel('player'), 'L1_assigned')
  assert.deepEqual(getAllAutonomousFactionIds(['player', 'enemy']), ['enemy'])

  const switchedAlpha = setSessionAutonomyLevel(alpha.token, 'L3_negotiated')
  assert.equal(switchedAlpha.ok, true)
  assert.equal(getFactionAutonomyLevel('player'), 'L1_assigned', 'one L1 online seat keeps faction human-assigned')

  const switchedBeta = setSessionAutonomyLevel(beta.token, 'L2_delegated')
  assert.equal(switchedBeta.ok, true)
  assert.equal(getFactionAutonomyLevel('player'), 'L3_negotiated', 'without L1 seats, L3 should win over L2')
  assert.deepEqual(getAllL2FactionIds(['player', 'enemy']).sort(), ['enemy', 'player'])

  const heartbeatBeta = heartbeat(beta.token)
  assert.equal(heartbeatBeta.ok, true)
  assert.equal(getFactionAutonomyLevel('player'), 'L1_assigned')

  resetSessionManagerForTests()
}

function testFactionSeatCapacityAndGlobalCapacity() {
  resetSessionManagerForTests()
  const clock = createClock(20_000)
  setSessionTimeSourceForTests(clock.now)
  setSessionRuntimeConfigForTests({
    heartbeatTimeoutMs: 5_000,
    staleSessionTtlMs: 8_000,
    maxActiveSessions: 2,
    maxSeatsPerFaction: 1,
    maxPlayerNameLength: 32,
  })

  expectJoinSuccess(joinSession('f1', 'Alpha', ['f1', 'f2', 'f3']))

  const sameFactionOverflow = joinSession('f1', 'Beta', ['f1', 'f2', 'f3'])
  assert.ok('error' in sameFactionOverflow)
  if ('error' in sameFactionOverflow) {
    assert.ok(sameFactionOverflow.error.includes('seat capacity reached'))
  }

  expectJoinSuccess(joinSession('f2', 'Gamma', ['f1', 'f2', 'f3']))

  const globalOverflow = joinSession('f3', 'Delta', ['f1', 'f2', 'f3'])
  assert.ok('error' in globalOverflow)
  if ('error' in globalOverflow) {
    assert.ok(globalOverflow.error.includes('Session capacity reached'))
  }

  resetSessionManagerForTests()
}

function testStaleSessionPruneAndReclaim() {
  resetSessionManagerForTests()
  const clock = createClock(30_000)
  setSessionTimeSourceForTests(clock.now)
  setSessionRuntimeConfigForTests({
    heartbeatTimeoutMs: 5_000,
    staleSessionTtlMs: 7_000,
    maxActiveSessions: 16,
    maxSeatsPerFaction: 10,
    maxPlayerNameLength: 32,
  })

  expectJoinSuccess(joinSession('player', 'Bob', ['player']))
  expectJoinSuccess(joinSession('player', 'Carol', ['player']))

  clock.advance(30_100)

  const status = getSessionStatus(['player'])
  assert.equal(status.players.length, 0, 'stale sessions should be pruned from status')
  assert.deepEqual(status.aiControlledFactions, ['player'])

  const rejoin = joinSession('player', 'Dave', ['player'])
  assert.ok(!('error' in rejoin), 'faction should be reclaimable after stale prune')

  resetSessionManagerForTests()
}

function testNameValidationAndMetrics() {
  resetSessionManagerForTests()
  const clock = createClock(40_000)
  setSessionTimeSourceForTests(clock.now)
  setSessionRuntimeConfigForTests({
    heartbeatTimeoutMs: 5_000,
    staleSessionTtlMs: 8_000,
    maxActiveSessions: 16,
    maxSeatsPerFaction: 10,
    maxPlayerNameLength: 12,
  })

  const tooLongName = joinSession('f1', 'NameLongerThan12', ['f1'])
  assert.ok('error' in tooLongName)

  const joined = expectJoinSuccess(joinSession('f1', '  Red   Fox  ', ['f1']))
  assert.equal(joined.playerName, 'Red Fox')
  expectJoinSuccess(joinSession('f1', 'Blue', ['f1']))

  const metrics = getSessionMetrics()
  assert.equal(metrics.activeSessions, 2)
  assert.equal(metrics.onlineSessions, 2)
  assert.equal(metrics.delegatedSessions, 0)
  assert.equal(metrics.claimedFactions, 1)
  assert.equal(metrics.maxSeatsPerFaction, 10)
  assert.equal(metrics.maxPlayerNameLength, 12)

  clock.advance(5_500)
  sweepAllTimeouts()

  const metricsAfterTimeout = getSessionMetrics()
  assert.equal(metricsAfterTimeout.delegatedSessions, 2)
  assert.equal(getFactionAutonomyLevel('f1'), 'L2_delegated')

  resetSessionManagerForTests()
}

function testNegotiatedAutonomyAndRuntimeSnapshot() {
  resetSessionManagerForTests()
  const clock = createClock(50_000)
  setSessionTimeSourceForTests(clock.now)
  setSessionRuntimeConfigForTests({
    heartbeatTimeoutMs: 5_000,
    staleSessionTtlMs: 8_000,
    maxActiveSessions: 16,
    maxSeatsPerFaction: 10,
    maxPlayerNameLength: 32,
  })

  const joined = expectJoinSuccess(joinSession('player', 'Delta', ['player', 'enemy']))
  const switched = setSessionAutonomyLevel(joined.token, 'L3_negotiated')
  assert.equal(switched.ok, true)
  assert.equal(getFactionAutonomyLevel('player'), 'L3_negotiated')

  const snapshot = getFactionSessionSnapshot('player')
  assert.equal(snapshot.factionId, 'player')
  assert.equal(snapshot.autonomyLevel, 'L3_negotiated')
  assert.equal(snapshot.playerName, 'Delta')
  assert.deepEqual(snapshot.playerNames, ['Delta'])
  assert.equal(snapshot.online, true)
  assert.equal(snapshot.seatCount, 1)
  assert.equal(snapshot.onlineSeatCount, 1)

  assert.deepEqual(getAllAutonomousFactionIds(['player', 'enemy']).sort(), ['enemy', 'player'])
  assert.deepEqual(getAllL2FactionIds(['player', 'enemy']).sort(), ['enemy', 'player'])

  const heartbeated = heartbeat(joined.token)
  assert.equal(heartbeated.ok, true)
  assert.equal(getFactionAutonomyLevel('player'), 'L1_assigned')

  resetSessionManagerForTests()
}

function testTokenValidationAndLeave() {
  resetSessionManagerForTests()
  const clock = createClock(60_000)
  setSessionTimeSourceForTests(clock.now)
  setSessionRuntimeConfigForTests({
    heartbeatTimeoutMs: 5_000,
    staleSessionTtlMs: 8_000,
    maxActiveSessions: 8,
    maxSeatsPerFaction: 10,
    maxPlayerNameLength: 32,
  })

  const joined = expectJoinSuccess(joinSession('f1', 'Alpha', ['f1']))
  const validated = validateToken(joined.token)
  assert.ok(validated)
  assert.equal(validated?.factionId, 'f1')

  const badHeartbeat = heartbeat('bad-token')
  assert.equal(badHeartbeat.ok, false)
  assert.equal(badHeartbeat.error, 'Invalid token format')

  const badLeave = leaveSession('bad-token')
  assert.equal(badLeave.ok, false)

  const removed = leaveSession(joined.token)
  assert.equal(removed.ok, true)
  assert.equal(getFactionAutonomyLevel('f1'), 'L2_delegated')

  resetSessionManagerForTests()
}

function run() {
  testMultiSeatAutonomyAggregation()
  testFactionSeatCapacityAndGlobalCapacity()
  testStaleSessionPruneAndReclaim()
  testNameValidationAndMetrics()
  testNegotiatedAutonomyAndRuntimeSnapshot()
  testTokenValidationAndLeave()
  console.log('[session_manager] all checks passed')
}

run()
