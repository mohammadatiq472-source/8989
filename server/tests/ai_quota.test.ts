import assert from 'node:assert/strict'
import { createInitialWorldState } from '../../shared/domain/scenario'
import {
  AI_QUOTA_MAX,
  resolveFactionAiQuotaLimit,
  syncAllFactionAiQuota,
} from '../../shared/domain/aiQuota'

function testScenarioInitialQuotaSeed() {
  const world = createInitialWorldState()

  assert.equal(world.factions.player.aiQuota?.initialQuota, 4)
  assert.equal(world.factions.player.aiQuota?.currentQuota, 4)
  assert.equal(world.factions.player.aiQuota?.maxQuota, 10)

  assert.equal(world.factions.enemy.aiQuota?.initialQuota, 3)
  assert.equal(world.factions.enemy.aiQuota?.currentQuota, 3)
  assert.equal(world.factions.enemy.aiQuota?.maxQuota, 10)

  syncAllFactionAiQuota(world)
  assert.ok((world.factions.player.aiQuota?.currentQuota ?? 0) <= 10)
  assert.ok((world.factions.enemy.aiQuota?.currentQuota ?? 0) <= 10)
}

function testQuotaGrowthUnlockAndHardCap() {
  const world = createInitialWorldState()

  for (const tile of world.map.tiles) {
    if (tile.owner === 'enemy') {
      tile.owner = 'player'
    }
    tile.enemyPressure = 5
  }

  world.feedback.battleRecords = Array.from({ length: 12 }, (_, index) => ({
    id: `quota_growth_${index}`,
    tick: world.tick,
    regionId: 'west_front',
    tileId: 'tile_06',
    attackerFaction: 'player',
    attackerUnitId: 'u1',
    outcome: index % 2 === 0 ? 'win' : 'loss',
    attackerLoss: 600,
    defenderLoss: 450,
    alliedSupport: 2,
    summary: 'quota stress battle',
  }))

  syncAllFactionAiQuota(world)

  const quota = world.factions.player.aiQuota
  assert.ok(quota, 'player quota should exist after sync')
  assert.equal(quota?.maxQuota, AI_QUOTA_MAX)
  assert.equal(quota?.currentQuota, AI_QUOTA_MAX, 'growth score should unlock all seats up to cap 10')
  assert.equal(quota?.nextUnlockScore, null)
}

function testServerAuthoritativeClampAndValidation() {
  const world = createInitialWorldState()
  const playerFaction = world.factions.player

  playerFaction.aiQuota = {
    initialQuota: -3,
    currentQuota: 99,
    maxQuota: 99,
    growthScore: -10,
    tugIntensity: 999,
    nextUnlockScore: -1,
  }

  playerFaction.aiPlayers = Array.from({ length: 25 }, (_, index) => ({
    id: `tampered_ai_${index}`,
    name: `Tampered AI ${index}`,
    factionId: 'player',
    unitIds: [],
    specialty: 'assault',
  }))

  for (const tile of world.map.tiles) {
    if (tile.owner === 'player') {
      tile.owner = 'neutral'
    }
    tile.enemyPressure = 0
  }
  world.feedback.battleRecords = []

  syncAllFactionAiQuota(world)

  const quota = playerFaction.aiQuota
  assert.ok(quota, 'quota should be rebuilt by authoritative sync')
  assert.equal(quota?.initialQuota, 2)
  assert.equal(quota?.maxQuota, 10)
  assert.equal(quota?.currentQuota, 2)
  assert.equal(quota?.growthScore, 0)
  assert.equal(quota?.tugIntensity, 0)
  assert.equal(playerFaction.aiPlayers?.length, 2, 'aiPlayers should be clamped to validated quota')
}

function testResolveLimitFallbackForUnknownFaction() {
  const world = createInitialWorldState()
  syncAllFactionAiQuota(world)

  assert.equal(resolveFactionAiQuotaLimit(world, 'unknown_faction'), AI_QUOTA_MAX)
}

function run() {
  testScenarioInitialQuotaSeed()
  testQuotaGrowthUnlockAndHardCap()
  testServerAuthoritativeClampAndValidation()
  testResolveLimitFallbackForUnknownFaction()
  console.log('[ai_quota] all checks passed')
}

run()
