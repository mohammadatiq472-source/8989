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

function seedWorldStateWithTileOccupyTarget(): { persistRoot: string; path: string; unitId: string; tileId: string } {
  const world = createInitialWorldState()
  const faction = world.factions[FACTION_ID]
  assert.ok(faction, `missing faction ${FACTION_ID} while seeding AI player tile occupy shard`)
  const unit = world.units.find((candidate) => candidate.faction === FACTION_ID)
  assert.ok(unit, `missing unit for faction ${FACTION_ID} while seeding AI player tile occupy shard`)
  const targetTile = world.map.tiles.find((tile) => tile.type === 'plain')
    ?? world.map.tiles.find((tile) => tile.type === 'resource')
    ?? world.map.tiles[0]
  assert.ok(targetTile, 'missing map tile while seeding AI player tile occupy shard')

  targetTile.type = 'plain'
  targetTile.owner = 'neutral'
  targetTile.enemyPressure = 2
  unit.tileId = targetTile.id
  unit.status = '待命'
  unit.currentTask = undefined
  faction.actionPoints = Math.max(faction.actionPoints, 3)
  faction.food = Math.max(faction.food, 3)
  faction.aiPlayers = [
    {
      id: AI_PLAYER_ID,
      name: 'Player Operator Alpha',
      factionId: FACTION_ID,
      unitIds: [unit.id],
      specialty: 'logistics',
    },
  ]

  const persistRoot = join(process.cwd(), 'tmp', `ai_player_http_tile_occupy_world_${process.pid}_${Date.now()}`)
  const path = join(persistRoot, 'world_snapshot.json')
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(world)}\n`, 'utf-8')
  return { persistRoot, path, unitId: unit.id, tileId: targetTile.id }
}

async function bootTileOccupyBackend(worldPersistRoot: string): Promise<AiPlayerHttpBackend> {
  const backend = await startAiPlayerHttpBackend(
    'ai_player_http_tile_occupy_contract',
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
    actionWhitelist: ['tile_occupy'],
  })
  assert.equal(register.status, 200, `register tile occupy AI player failed: ${JSON.stringify(register.data)}`)
  return backend
}

async function run() {
  const seeded = seedWorldStateWithTileOccupyTarget()
  const backend = await bootTileOccupyBackend(seeded.persistRoot)
  try {
    const catalog = await requestJson(backend.baseUrl, '/api/ai/player-actions/catalog', 'GET')
    assert.equal(catalog.status, 200)
    const occupyEntry = readArray(readObject(catalog.data).catalog)
      .map((item) => readObject(item))
      .find((item) => item.action === 'tile_occupy')
    assert.ok(occupyEntry, 'catalog should expose tile_occupy')
    assert.equal(occupyEntry.riskLevel, 'medium')
    assert.equal(occupyEntry.requiresApprovalByDefault, true)
    assert.equal(occupyEntry.executableInV1, true)
    assert.equal(occupyEntry.mappedWorldAction, 'occupyTile')

    const invalidArgs = await requestJson(backend.baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: AI_PLAYER_ID,
      action: 'tile_occupy',
      source: 'mcp',
      reason: 'invalid tile occupy args should be rejected',
      args: {
        unitId: 123,
        tileId: seeded.tileId,
      },
    })
    assert.equal(invalidArgs.status, 422, 'tile_occupy should reject non-string unitId')

    const worldBefore = await loadWorldState(backend.baseUrl)
    const factionBefore = worldBefore.factions[FACTION_ID]
    assert.ok(factionBefore, 'faction should exist before tile occupy')

    const { receipt } = await createApproveExecuteProposal(
      backend.baseUrl,
      'tile_occupy',
      {
        unitId: seeded.unitId,
        tileId: seeded.tileId,
      },
      'AI player tile occupy shard success',
    )
    assertSuccessfulReceipt('tile_occupy', receipt, 'occupyTile')
    assert.deepEqual(
      readObject(receipt.worldActionPayload),
      {
        factionId: FACTION_ID,
        aiPlayerId: AI_PLAYER_ID,
        unitId: seeded.unitId,
        tileId: seeded.tileId,
      },
      'tile_occupy receipt should surface world action payload',
    )
    assert.ok(readObject(receipt.execution), 'tile_occupy receipt should include execution')

    const worldAfter = await loadWorldState(backend.baseUrl)
    const tileStates = (worldAfter.map as unknown as { tileStates?: Array<{ id: string; owner?: string; enemyPressure?: number }> }).tileStates ?? []
    const occupiedTileState = tileStates.find((tile) => tile.id === seeded.tileId)
    assert.ok(occupiedTileState, 'occupied tile state should be returned in world summary')
    assert.equal(occupiedTileState.owner, FACTION_ID, 'tile_occupy should change tile owner')
    assert.equal(occupiedTileState.enemyPressure, 1, 'tile_occupy should reduce enemy pressure by one')
    const factionAfter = worldAfter.factions[FACTION_ID]
    assert.ok(factionAfter, 'faction should exist after tile occupy')
    assert.equal(factionAfter.actionPoints, factionBefore.actionPoints - 1, 'tile_occupy should spend one action point')
    assert.equal(factionAfter.food, factionBefore.food - 1, 'tile_occupy should spend one food')

    console.log('[ai_player_http_tile_occupy_contract] all checks passed')
  } finally {
    await backend.stop()
  }
}

run().catch((error) => {
  console.error('[ai_player_http_tile_occupy_contract] failed:', error)
  process.exitCode = 1
})
