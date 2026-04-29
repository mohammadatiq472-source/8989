import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { createInitialWorldState } from '../../shared/domain/scenario'
import type { WorldState } from '../../shared/contracts/game/world'
import {
  buildSessionPersistPath,
  getAvailablePort,
  readObject,
  requestJson,
  shutdownChild,
  spawnBackend,
  type TailState,
  waitForHealth,
} from './helpers/backendHarness'

const FACTION_ID = 'player'
const AI_PLAYER_ID = 'player_operator_alpha'
const GOVERNOR_PLAYER_ID = 'human_alpha'
const RESOURCE_TILE_ID = 'tile_ai_resource_gather_contract'

function readWorldStatePayload(value: unknown): WorldState {
  const root = readObject(value)
  const world = readObject(root.world)
  return world as unknown as WorldState
}

function seedWorldStateWithAiGatherTarget(): { path: string; unitId: string; tileId: string } {
  const world = createInitialWorldState()
  const faction = world.factions[FACTION_ID]
  assert.ok(faction, `missing faction ${FACTION_ID} while seeding AI resource gather contract`)
  const unit = world.units.find((candidate) => candidate.faction === FACTION_ID)
  assert.ok(unit, `missing unit for faction ${FACTION_ID} while seeding AI resource gather contract`)
  const resourceTile = world.map.tiles.find((tile) => tile.id === RESOURCE_TILE_ID)
    ?? world.map.tiles.find((tile) => tile.type === 'resource')
    ?? world.map.tiles[0]
  assert.ok(resourceTile, 'missing map tile while seeding AI resource gather contract')

  resourceTile.id = RESOURCE_TILE_ID
  resourceTile.name = 'AI Gather Contract Resource Tile'
  resourceTile.type = 'resource'
  resourceTile.owner = FACTION_ID
  resourceTile.resourceKind = 'wood'
  resourceTile.resourceLevel = 4
  unit.tileId = resourceTile.id

  faction.aiPlayers = [
    {
      id: AI_PLAYER_ID,
      name: 'Player Operator Alpha',
      factionId: FACTION_ID,
      unitIds: [unit.id],
      specialty: 'logistics',
    },
  ]
  faction.aiResourceAccounts = {
    [AI_PLAYER_ID]: {
      aiPlayerId: AI_PLAYER_ID,
      governorPlayerId: GOVERNOR_PLAYER_ID,
      factionId: FACTION_ID,
      resources: {
        food: 0,
        wood: 5,
        stone: 0,
        iron: 0,
      },
      updatedTick: world.tick,
    },
  }
  faction.aiResourceGatherClaims = {}

  const path = buildSessionPersistPath('world_ai_resource_gather_contract_world_state')
  writeFileSync(path, `${JSON.stringify(world)}\n`, 'utf-8')
  return { path, unitId: unit.id, tileId: resourceTile.id }
}

async function loadWorldState(baseUrl: string): Promise<WorldState> {
  const worldResult = await requestJson(baseUrl, '/api/world?intelMode=full', 'GET')
  assert.equal(worldResult.status, 200, `world route failed: ${JSON.stringify(worldResult.data)}`)
  return readWorldStatePayload(worldResult.data)
}

async function run() {
  const seeded = seedWorldStateWithAiGatherTarget()
  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const tail: TailState = { stdout: [], stderr: [] }
  const child = spawnBackend(port, tail, {
    WORLD_STATE_PERSIST_PATH: seeded.path,
  })

  try {
    const health = await waitForHealth(baseUrl)
    assert.ok(health, `backend did not become healthy\nstdout=${tail.stdout.join('\n')}\nstderr=${tail.stderr.join('\n')}`)

    const invalidSchema = await requestJson(baseUrl, '/api/world/action?includeWorld=false', 'POST', {
      action: 'gatherAiResourceTile',
      payload: {
        factionId: FACTION_ID,
        aiPlayerId: AI_PLAYER_ID,
        unitId: 123,
        tileId: seeded.tileId,
      },
    })
    assert.equal(invalidSchema.status, 400, 'gatherAiResourceTile should reject non-string unitId at schema validation time')

    const missingAccount = await requestJson(baseUrl, '/api/world/action?includeWorld=false', 'POST', {
      action: 'gatherAiResourceTile',
      payload: {
        factionId: FACTION_ID,
        aiPlayerId: 'missing_ai_account',
        unitId: seeded.unitId,
        tileId: seeded.tileId,
      },
    })
    assert.equal(missingAccount.status, 200)
    const missingAccountPayload = readObject(missingAccount.data)
    assert.equal(missingAccountPayload.ok, false)
    assert.equal(missingAccountPayload.failureCode, 'missing_ai_resource_account')

    const success = await requestJson(baseUrl, '/api/world/action?includeWorld=true', 'POST', {
      action: 'gatherAiResourceTile',
      payload: {
        factionId: FACTION_ID,
        aiPlayerId: AI_PLAYER_ID,
        unitId: seeded.unitId,
        tileId: seeded.tileId,
      },
    }, 60_000)
    assert.equal(success.status, 200, `gather success route failed: ${JSON.stringify(success.data)}`)
    const successPayload = readObject(success.data)
    assert.equal(successPayload.ok, true)
    assert.ok(String(successPayload.relatedId).startsWith('ai_resource_gather_'))
    assert.ok(readObject(successPayload.execution), 'gather success should expose execution snapshot')

    const worldAfter = readWorldStatePayload(success.data)
    const accountAfter = worldAfter.factions[FACTION_ID]?.aiResourceAccounts?.[AI_PLAYER_ID]
    assert.ok(accountAfter, 'AI resource account should remain after gather')
    assert.equal(accountAfter.resources.wood, 45, 'resourceLevel 4 should add 40 wood into the AI subaccount')
    assert.equal(accountAfter.resources.food, 0)
    assert.equal(accountAfter.resources.stone, 0)
    assert.equal(accountAfter.resources.iron, 0)
    const gatherClaim = worldAfter.factions[FACTION_ID]?.aiResourceGatherClaims?.[seeded.tileId]
    assert.ok(gatherClaim, 'gather should record a one-time tile claim')
    assert.equal(gatherClaim.id, successPayload.relatedId)
    assert.equal(gatherClaim.aiPlayerId, AI_PLAYER_ID)
    assert.equal(gatherClaim.unitId, seeded.unitId)
    assert.equal(gatherClaim.resourceKind, 'wood')
    assert.equal(gatherClaim.resourceLevel, 4)

    const duplicate = await requestJson(baseUrl, '/api/world/action?includeWorld=false', 'POST', {
      action: 'gatherAiResourceTile',
      payload: {
        factionId: FACTION_ID,
        aiPlayerId: AI_PLAYER_ID,
        unitId: seeded.unitId,
        tileId: seeded.tileId,
      },
    })
    assert.equal(duplicate.status, 200)
    const duplicatePayload = readObject(duplicate.data)
    assert.equal(duplicatePayload.ok, false)
    assert.equal(duplicatePayload.failureCode, 'resource_tile_already_gathered')

    const worldReloaded = await loadWorldState(baseUrl)
    assert.equal(
      worldReloaded.factions[FACTION_ID]?.aiResourceAccounts?.[AI_PLAYER_ID]?.resources.wood,
      45,
      'AI resource gather account mutation should persist through world reload',
    )
  } finally {
    await shutdownChild(child)
  }
}

run().catch((error) => {
  console.error('[world_ai_resource_gather_http_contract] failed:', error)
  process.exitCode = 1
})
