import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createInitialWorldState } from '../../shared/domain/scenario'
import {
  AI_PLAYER_ID,
  FACTION_ID,
  GOVERNOR_PLAYER_ID,
  joinGovernor,
  loadWorldState,
  startAiPlayerHttpBackend,
  type AiPlayerHttpBackend,
} from './helpers/aiPlayerHttpContractHarness'
import { readArray, readObject, requestJson } from './helpers/backendHarness'

function seedWorldStateWithBattleReports(): { persistRoot: string; path: string; unitId: string } {
  const world = createInitialWorldState()
  const faction = world.factions[FACTION_ID]
  assert.ok(faction, `missing faction ${FACTION_ID} while seeding AI player battle-report shard`)
  const unit = world.units.find((candidate) => candidate.faction === FACTION_ID)
  assert.ok(unit, `missing unit for faction ${FACTION_ID} while seeding AI player battle-report shard`)

  unit.aiPlayerId = AI_PLAYER_ID
  faction.aiPlayers = [
    {
      id: AI_PLAYER_ID,
      name: 'Player Operator Alpha',
      factionId: FACTION_ID,
      unitIds: [unit.id],
      specialty: 'logistics',
    },
  ]
  world.tick = 21
  world.feedback.battleRecords = [
    {
      id: 'battle_read_win_previous',
      tick: 19,
      regionId: 'west_front',
      tileId: unit.tileId,
      attackerFaction: FACTION_ID,
      attackerUnitId: unit.id,
      outcome: 'win',
      attackerLoss: 8,
      defenderLoss: 34,
      alliedSupport: 1,
      summary: 'AI unit won a low-loss skirmish.',
    },
    {
      id: 'battle_read_enemy_irrelevant',
      tick: 20,
      regionId: 'north_recon',
      tileId: 'tile_enemy_irrelevant',
      attackerFaction: 'enemy',
      attackerUnitId: 'enemy_unit_for_contract',
      outcome: 'win',
      attackerLoss: 4,
      defenderLoss: 12,
      alliedSupport: 0,
      summary: 'Enemy-only report should not enter the AI player read model.',
    },
    {
      id: 'battle_read_loss_latest',
      tick: 20,
      regionId: 'west_front',
      tileId: unit.tileId,
      attackerFaction: FACTION_ID,
      attackerUnitId: unit.id,
      outcome: 'loss',
      attackerLoss: 80,
      defenderLoss: 20,
      alliedSupport: 0,
      summary: 'AI unit lost with high troop damage.',
    },
  ]

  const persistRoot = join(process.cwd(), 'tmp', `ai_player_http_battle_report_read_world_${process.pid}_${Date.now()}`)
  const path = join(persistRoot, 'world_snapshot.json')
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(world)}\n`, 'utf-8')
  return { persistRoot, path, unitId: unit.id }
}

async function bootBattleReportReadBackend(worldPersistRoot: string): Promise<AiPlayerHttpBackend> {
  const backend = await startAiPlayerHttpBackend(
    'ai_player_http_battle_report_read_contract',
    undefined,
    {
      WORLD_PERSIST_ROOT: worldPersistRoot,
    },
  )
  await joinGovernor(backend.baseUrl)
  const register = await requestJson(backend.baseUrl, '/api/ai/players', 'POST', {
    aiPlayerId: AI_PLAYER_ID,
    displayName: 'Player Operator Alpha',
    governorPlayerId: GOVERNOR_PLAYER_ID,
    factionId: FACTION_ID,
    actionWhitelist: ['battle_report_read'],
  })
  assert.equal(register.status, 200, `register battle-report AI player failed: ${JSON.stringify(register.data)}`)
  return backend
}

async function run() {
  const seeded = seedWorldStateWithBattleReports()
  const backend = await bootBattleReportReadBackend(seeded.persistRoot)
  try {
    const catalog = await requestJson(backend.baseUrl, '/api/ai/player-actions/catalog', 'GET')
    assert.equal(catalog.status, 200)
    const readEntry = readArray(readObject(catalog.data).catalog)
      .map((item) => readObject(item))
      .find((item) => item.action === 'battle_report_read')
    assert.ok(readEntry, 'catalog should expose battle_report_read')
    assert.equal(readEntry.riskLevel, 'low')
    assert.equal(readEntry.requiresApprovalByDefault, false)
    assert.equal(readEntry.executableInV1, false, 'battle_report_read must remain read-model only')

    const missing = await requestJson(backend.baseUrl, '/api/ai/players/missing_ai/battle-reports', 'GET')
    assert.equal(missing.status, 404, 'battle report read-model should 404 for unknown AI player')

    const worldBefore = await loadWorldState(backend.baseUrl)
    const readModelResult = await requestJson(
      backend.baseUrl,
      `/api/ai/players/${AI_PLAYER_ID}/battle-reports?limit=2`,
      'GET',
    )
    assert.equal(readModelResult.status, 200, `battle report read model failed: ${JSON.stringify(readModelResult.data)}`)
    const readModel = readObject(readModelResult.data)
    assert.equal(readModel.aiPlayerId, AI_PLAYER_ID)
    assert.equal(readModel.factionId, FACTION_ID)
    assert.equal(readModel.limit, 2)
    assert.equal(readModel.count, 2)
    assert.deepEqual(readArray(readModel.unitIds), [seeded.unitId])

    const items = readArray(readModel.items).map((item) => readObject(item))
    assert.equal(items.length, 2)
    assert.equal(items[0].reportId, 'battle_read_loss_latest')
    assert.equal(items[0].outcome, 'loss')
    assert.equal(items[0].perspective, 'attacker')
    assert.equal(items[0].severity, 'high')
    assert.equal(items[0].assignedUnitInvolved, true)
    assert.equal(items[0].ownLoss, 80)
    assert.equal(items[0].enemyLoss, 20)
    assert.match(String(items[0].nextStepSuggestion), /补兵|驻防/)
    assert.equal(items[1].reportId, 'battle_read_win_previous')
    assert.equal(items.some((item) => item.reportId === 'battle_read_enemy_irrelevant'), false)

    const worldAfter = await loadWorldState(backend.baseUrl)
    assert.deepEqual(
      worldAfter.feedback.battleRecords,
      worldBefore.feedback.battleRecords,
      'battle_report_read read model must not mutate battle records',
    )
    assert.equal(worldAfter.worldVersion, worldBefore.worldVersion, 'battle_report_read read model must not mutate worldVersion')

    console.log('[ai_player_http_battle_report_read_contract] all checks passed')
  } finally {
    await backend.stop()
  }
}

run().catch((error) => {
  console.error('[ai_player_http_battle_report_read_contract] failed:', error)
  process.exitCode = 1
})
