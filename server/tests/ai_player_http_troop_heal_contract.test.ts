import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createInitialWorldState } from '../../shared/domain/scenario'
import {
  AI_PLAYER_ID,
  FACTION_ID,
  GOVERNOR_PLAYER_ID,
  assertSuccessfulReceipt,
  createApproveExecuteProposal,
  joinGovernor,
  loadWorldState,
  startAiPlayerHttpBackend,
  type AiPlayerHttpBackend,
} from './helpers/aiPlayerHttpContractHarness'
import { readArray, readObject, requestJson } from './helpers/backendHarness'

type TroopHealSeed = {
  persistRoot: string
  path: string
  unitId: string
  strength: number
  supply: number
  actionPoints: number
  food: number
}

function seedWorldStateWithTroopHealTarget(options?: {
  strength?: number
  supply?: number
  food?: number
}): TroopHealSeed {
  const world = createInitialWorldState()
  const faction = world.factions[FACTION_ID]
  assert.ok(faction, `missing faction ${FACTION_ID} while seeding AI player troop heal shard`)
  const unit = world.units.find((candidate) => candidate.faction === FACTION_ID)
  assert.ok(unit, `missing unit for faction ${FACTION_ID} while seeding AI player troop heal shard`)

  unit.strength = options?.strength ?? 42
  unit.supply = options?.supply ?? 3
  unit.status = '待命'
  unit.currentTask = undefined
  unit.aiPlayerId = AI_PLAYER_ID
  faction.actionPoints = Math.max(faction.actionPoints, 3)
  faction.food = Math.max(faction.food, options?.food ?? 8)
  faction.aiPlayers = [
    {
      id: AI_PLAYER_ID,
      name: 'Player Operator Alpha',
      factionId: FACTION_ID,
      unitIds: [unit.id],
      specialty: 'logistics',
    },
  ]

  const persistRoot = join(process.cwd(), 'tmp', `ai_player_http_troop_heal_world_${process.pid}_${Date.now()}`)
  const path = join(persistRoot, 'world_snapshot.json')
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(world)}\n`, 'utf-8')
  return {
    persistRoot,
    path,
    unitId: unit.id,
    strength: unit.strength,
    supply: unit.supply,
    actionPoints: faction.actionPoints,
    food: faction.food,
  }
}

async function bootTroopHealBackend(worldPersistRoot: string): Promise<AiPlayerHttpBackend> {
  const backend = await startAiPlayerHttpBackend(
    'ai_player_http_troop_heal_contract',
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
    actionWhitelist: ['troop_heal'],
  })
  assert.equal(register.status, 200, `register troop heal AI player failed: ${JSON.stringify(register.data)}`)
  return backend
}

async function assertTroopHealCatalogAndSchema(baseUrl: string) {
  const catalog = await requestJson(baseUrl, '/api/ai/player-actions/catalog', 'GET')
  assert.equal(catalog.status, 200)
  const healEntry = readArray(readObject(catalog.data).catalog)
    .map((item) => readObject(item))
    .find((item) => item.action === 'troop_heal')
  assert.ok(healEntry, 'catalog should expose troop_heal')
  assert.equal(healEntry.riskLevel, 'medium')
  assert.equal(healEntry.requiresApprovalByDefault, true)
  assert.equal(healEntry.executableInV1, true)
  assert.equal(healEntry.mappedWorldAction, 'healTroop')

  const invalidArgs = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
    aiPlayerId: AI_PLAYER_ID,
    action: 'troop_heal',
    source: 'mcp',
    reason: 'invalid troop heal args should be rejected',
    args: {
      unitId: 123,
    },
  })
  assert.equal(invalidArgs.status, 422, 'troop_heal should reject non-string unitId')
}

async function runSuccessShard() {
  const seeded = seedWorldStateWithTroopHealTarget()
  const backend = await bootTroopHealBackend(seeded.persistRoot)
  try {
    await assertTroopHealCatalogAndSchema(backend.baseUrl)

    const { receipt } = await createApproveExecuteProposal(
      backend.baseUrl,
      'troop_heal',
      {},
      'AI player troop heal shard success',
    )
    assertSuccessfulReceipt('troop_heal', receipt, 'healTroop')
    assert.deepEqual(
      readObject(receipt.worldActionPayload),
      {
        factionId: FACTION_ID,
        aiPlayerId: AI_PLAYER_ID,
        unitId: seeded.unitId,
      },
      'troop_heal receipt should surface resolved world action payload',
    )
    assert.ok(readObject(receipt.execution), 'troop_heal receipt should include execution')

    const worldAfter = await loadWorldState(backend.baseUrl)
    const factionAfter = worldAfter.factions[FACTION_ID]
    assert.ok(factionAfter, 'faction should exist after troop heal')
    const unitAfter = worldAfter.units.find((candidate) => candidate.id === seeded.unitId)
    assert.ok(unitAfter, 'unit should exist after troop heal')
    assert.equal(unitAfter.strength, Math.min(100, seeded.strength + 20), 'troop_heal should restore strength')
    assert.equal(unitAfter.supply, Math.min(9, seeded.supply + 2), 'troop_heal should restore supply')
    assert.equal(factionAfter.actionPoints, seeded.actionPoints - 1, 'troop_heal should spend 1 action point')
    assert.equal(factionAfter.food, seeded.food - 2, 'troop_heal should spend 2 food')
  } finally {
    await backend.stop()
  }
}

async function runFullUnitFailureShard() {
  const seeded = seedWorldStateWithTroopHealTarget({ strength: 100, supply: 9, food: 8 })
  const backend = await bootTroopHealBackend(seeded.persistRoot)
  try {
    const { receipt } = await createApproveExecuteProposal(
      backend.baseUrl,
      'troop_heal',
      {},
      'AI player troop heal shard formal full-unit failure',
    )
    assert.equal(receipt.ok, false, 'full troop_heal receipt should report formal failure')
    assert.equal(receipt.worldAction, 'healTroop', 'full troop_heal failure should preserve mapped world action')
    assert.equal(receipt.failureCode, 'unit_already_full', 'full troop_heal should expose unit_already_full')
  } finally {
    await backend.stop()
  }
}

async function run() {
  await runSuccessShard()
  await runFullUnitFailureShard()
  console.log('[ai_player_http_troop_heal_contract] all checks passed')
}

run().catch((error) => {
  console.error('[ai_player_http_troop_heal_contract] failed:', error)
  process.exitCode = 1
})
