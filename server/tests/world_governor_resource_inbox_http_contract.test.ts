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
  sleep,
  spawnBackend,
  type TailState,
  waitForHealth,
} from './helpers/backendHarness'

const FACTION_ID = 'player'
const GOVERNOR_PLAYER_ID = 'human_alpha'
const FIRST_TRANSFER_ID = 'resource_transfer_claim_contract_first'
const SECOND_TRANSFER_ID = 'resource_transfer_claim_contract_second'

function readWorldStatePayload(value: unknown): WorldState {
  const root = readObject(value)
  const world = readObject(root.world)
  return world as unknown as WorldState
}

function seedWorldStateWithGovernorInbox(): string {
  const world = createInitialWorldState()
  const faction = world.factions[FACTION_ID]
  assert.ok(faction, `missing faction ${FACTION_ID} while seeding governor inbox contract`)
  faction.food = 20
  faction.wood = 5
  faction.stone = 3
  faction.iron = 1
  faction.governorResourceInboxes = {
    [GOVERNOR_PLAYER_ID]: {
      governorPlayerId: GOVERNOR_PLAYER_ID,
      pendingTransfers: [
        {
          id: FIRST_TRANSFER_ID,
          sourceAiPlayerId: 'player_operator_alpha',
          sourceFactionId: FACTION_ID,
          governorPlayerId: GOVERNOR_PLAYER_ID,
          resources: {
            food: 12,
            wood: 8,
            stone: 0,
            iron: 0,
          },
          reason: 'first seeded transfer',
          approvedBy: GOVERNOR_PLAYER_ID,
          status: 'pending',
          createdTick: world.tick,
        },
        {
          id: SECOND_TRANSFER_ID,
          sourceAiPlayerId: 'player_operator_beta',
          sourceFactionId: FACTION_ID,
          governorPlayerId: GOVERNOR_PLAYER_ID,
          resources: {
            food: 0,
            wood: 0,
            stone: 4,
            iron: 7,
          },
          reason: 'second seeded transfer',
          approvedBy: GOVERNOR_PLAYER_ID,
          status: 'pending',
          createdTick: world.tick,
        },
      ],
      totalPendingResources: {
        food: 12,
        wood: 8,
        stone: 4,
        iron: 7,
      },
    },
  }

  const path = buildSessionPersistPath('world_governor_resource_inbox_contract_world_state')
  writeFileSync(path, `${JSON.stringify(world)}\n`, 'utf-8')
  return path
}

async function loadWorldState(baseUrl: string): Promise<WorldState> {
  let lastError: unknown = null
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const worldResult = await requestJson(baseUrl, '/api/world', 'GET')
      assert.equal(worldResult.status, 200, `world route failed: ${JSON.stringify(worldResult.data)}`)
      return readWorldStatePayload(worldResult.data)
    } catch (error) {
      lastError = error
      if (attempt < 3) {
        await sleep(500)
      }
    }
  }
  throw lastError
}

async function run() {
  const worldPersistPath = seedWorldStateWithGovernorInbox()
  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const tail: TailState = { stdout: [], stderr: [] }
  const child = spawnBackend(port, tail, {
    WORLD_STATE_PERSIST_PATH: worldPersistPath,
  })

  try {
    const health = await waitForHealth(baseUrl)
    assert.ok(health, `backend did not become healthy\nstdout=${tail.stdout.join('\n')}\nstderr=${tail.stderr.join('\n')}`)

    const invalidSchema = await requestJson(baseUrl, '/api/world/action?includeWorld=false', 'POST', {
      action: 'claimGovernorResourceInbox',
      payload: {
        factionId: FACTION_ID,
        governorPlayerId: 123,
      },
    })
    assert.equal(invalidSchema.status, 400, 'claimGovernorResourceInbox should reject non-string governor id')

    const missingInbox = await requestJson(baseUrl, '/api/world/action?includeWorld=false', 'POST', {
      action: 'claimGovernorResourceInbox',
      payload: {
        factionId: FACTION_ID,
        governorPlayerId: 'human_beta',
      },
    })
    assert.equal(missingInbox.status, 200)
    const missingInboxPayload = readObject(missingInbox.data)
    assert.equal(missingInboxPayload.ok, false)
    assert.equal(missingInboxPayload.failureCode, 'missing_governor_inbox')

    const missingTransfer = await requestJson(baseUrl, '/api/world/action?includeWorld=false', 'POST', {
      action: 'claimGovernorResourceInbox',
      payload: {
        factionId: FACTION_ID,
        governorPlayerId: GOVERNOR_PLAYER_ID,
        transferId: 'missing_transfer',
      },
    })
    assert.equal(missingTransfer.status, 200)
    const missingTransferPayload = readObject(missingTransfer.data)
    assert.equal(missingTransferPayload.ok, false)
    assert.equal(missingTransferPayload.failureCode, 'missing_governor_transfer')

    const claimOne = await requestJson(baseUrl, '/api/world/action?includeWorld=true', 'POST', {
      action: 'claimGovernorResourceInbox',
      payload: {
        factionId: FACTION_ID,
        governorPlayerId: GOVERNOR_PLAYER_ID,
        transferId: FIRST_TRANSFER_ID,
      },
    }, 60_000)
    assert.equal(claimOne.status, 200, `claim one route failed: ${JSON.stringify(claimOne.data)}`)
    const claimOnePayload = readObject(claimOne.data)
    assert.equal(claimOnePayload.ok, true)
    assert.equal(claimOnePayload.relatedId, FIRST_TRANSFER_ID)
    assert.ok(readObject(claimOnePayload.execution), 'claim inbox success should expose execution snapshot')

    const worldAfterClaimOne = readWorldStatePayload(claimOne.data)
    const factionAfterClaimOne = worldAfterClaimOne.factions[FACTION_ID]
    assert.ok(factionAfterClaimOne, 'faction should exist after first inbox claim')
    assert.equal(factionAfterClaimOne.food, 32)
    assert.equal(factionAfterClaimOne.wood, 13)
    assert.equal(factionAfterClaimOne.stone, 3)
    assert.equal(factionAfterClaimOne.iron, 1)
    const inboxAfterClaimOne = factionAfterClaimOne.governorResourceInboxes?.[GOVERNOR_PLAYER_ID]
    assert.ok(inboxAfterClaimOne, 'governor inbox should remain after partial claim')
    assert.equal(inboxAfterClaimOne.pendingTransfers.length, 1)
    assert.equal(inboxAfterClaimOne.pendingTransfers[0]?.id, SECOND_TRANSFER_ID)
    assert.equal(inboxAfterClaimOne.totalPendingResources.food, 0)
    assert.equal(inboxAfterClaimOne.totalPendingResources.wood, 0)
    assert.equal(inboxAfterClaimOne.totalPendingResources.stone, 4)
    assert.equal(inboxAfterClaimOne.totalPendingResources.iron, 7)

    const claimRemaining = await requestJson(baseUrl, '/api/world/action?includeWorld=true', 'POST', {
      action: 'claimGovernorResourceInbox',
      payload: {
        factionId: FACTION_ID,
        governorPlayerId: GOVERNOR_PLAYER_ID,
      },
    }, 60_000)
    assert.equal(claimRemaining.status, 200, `claim remaining route failed: ${JSON.stringify(claimRemaining.data)}`)
    const worldAfterClaimRemaining = readWorldStatePayload(claimRemaining.data)
    const factionAfterClaimRemaining = worldAfterClaimRemaining.factions[FACTION_ID]
    assert.ok(factionAfterClaimRemaining, 'faction should exist after second inbox claim')
    assert.equal(factionAfterClaimRemaining.food, 32)
    assert.equal(factionAfterClaimRemaining.wood, 13)
    assert.equal(factionAfterClaimRemaining.stone, 7)
    assert.equal(factionAfterClaimRemaining.iron, 8)
    const inboxAfterClaimRemaining = factionAfterClaimRemaining.governorResourceInboxes?.[GOVERNOR_PLAYER_ID]
    assert.ok(inboxAfterClaimRemaining, 'governor inbox should remain as empty after full claim')
    assert.equal(inboxAfterClaimRemaining.pendingTransfers.length, 0)
    assert.equal(inboxAfterClaimRemaining.totalPendingResources.food, 0)
    assert.equal(inboxAfterClaimRemaining.totalPendingResources.wood, 0)
    assert.equal(inboxAfterClaimRemaining.totalPendingResources.stone, 0)
    assert.equal(inboxAfterClaimRemaining.totalPendingResources.iron, 0)

    const worldReloaded = await loadWorldState(baseUrl)
    assert.equal(worldReloaded.factions[FACTION_ID]?.iron, 8, 'governor inbox claim should persist resource settlement')
    assert.equal(
      worldReloaded.factions[FACTION_ID]?.governorResourceInboxes?.[GOVERNOR_PLAYER_ID]?.pendingTransfers.length,
      0,
      'governor inbox pending transfers should stay empty after reload',
    )
  } catch (error) {
    console.error('[world_governor_resource_inbox_http_contract] backend tail:', JSON.stringify({
      stdout: tail.stdout,
      stderr: tail.stderr,
      childExitCode: child.exitCode,
      childSignalCode: child.signalCode,
    }, null, 2))
    throw error
  } finally {
    await shutdownChild(child)
  }
}

run().catch((error) => {
  console.error('[world_governor_resource_inbox_http_contract] failed:', error)
  process.exitCode = 1
})
