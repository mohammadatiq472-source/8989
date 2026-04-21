import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
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
import { buildSessionPersistPath, readArray, readObject, requestJson } from './helpers/backendHarness'

function seedWorldStateWithAiResourceAccount(): string {
  const world = createInitialWorldState()
  const faction = world.factions[FACTION_ID]
  assert.ok(faction, `missing faction ${FACTION_ID} while seeding AI player resource transfer shard`)

  faction.aiResourceAccounts = {
    [AI_PLAYER_ID]: {
      aiPlayerId: AI_PLAYER_ID,
      governorPlayerId: GOVERNOR_PLAYER_ID,
      factionId: FACTION_ID,
      resources: {
        food: 90,
        wood: 70,
        stone: 50,
        iron: 30,
      },
      updatedTick: world.tick,
    },
  }

  const path = buildSessionPersistPath('ai_player_http_resource_transfer_world_state')
  writeFileSync(path, `${JSON.stringify(world)}\n`, 'utf-8')
  return path
}

async function bootResourceTransferBackend(worldPersistPath: string): Promise<AiPlayerHttpBackend> {
  const backend = await startAiPlayerHttpBackend(
    'ai_player_http_resource_transfer_contract',
    undefined,
    {
      WORLD_STATE_PERSIST_PATH: worldPersistPath,
    },
  )
  await joinGovernor(backend.baseUrl)
  const register = await requestJson(backend.baseUrl, '/api/ai/players', 'POST', {
    aiPlayerId: AI_PLAYER_ID,
    displayName: 'Player Operator Alpha',
    governorPlayerId: GOVERNOR_PLAYER_ID,
    factionId: FACTION_ID,
    actionWhitelist: ['resource_transfer_to_governor'],
    budgetPolicy: {
      allowHighRiskActions: true,
    },
  })
  assert.equal(register.status, 200, `register transfer AI player failed: ${JSON.stringify(register.data)}`)
  return backend
}

async function run() {
  const worldPersistPath = seedWorldStateWithAiResourceAccount()
  const backend = await bootResourceTransferBackend(worldPersistPath)
  try {
    const catalog = await requestJson(backend.baseUrl, '/api/ai/player-actions/catalog', 'GET')
    assert.equal(catalog.status, 200)
    const transferEntry = readArray(readObject(catalog.data).catalog)
      .map((item) => readObject(item))
      .find((item) => item.action === 'resource_transfer_to_governor')
    assert.ok(transferEntry, 'catalog should expose resource_transfer_to_governor')
    assert.equal(transferEntry.riskLevel, 'high')
    assert.equal(transferEntry.requiresApprovalByDefault, true)
    assert.equal(transferEntry.mappedWorldAction, 'transferFactionResourcesToGovernor')

    const invalidArgs = await requestJson(backend.baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: AI_PLAYER_ID,
      action: 'resource_transfer_to_governor',
      source: 'mcp',
      reason: 'invalid transfer args should be rejected',
      args: {
        resources: {
          food: 0,
        },
      },
    })
    assert.equal(invalidArgs.status, 422, 'resource_transfer_to_governor should reject non-positive resources')

    const create = await requestJson(backend.baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: AI_PLAYER_ID,
      action: 'resource_transfer_to_governor',
      source: 'mcp',
      reason: 'high-risk transfer must wait for governor approval',
      args: {
        resources: {
          food: 11,
        },
      },
    })
    assert.equal(create.status, 200, `create transfer proposal failed: ${JSON.stringify(create.data)}`)
    const createdProposal = readObject(readObject(create.data).proposal)
    assert.equal(createdProposal.status, 'pending_approval')
    assert.equal(createdProposal.requiresApproval, true)
    assert.equal(createdProposal.riskLevel, 'high')

    const { receipt } = await createApproveExecuteProposal(
      backend.baseUrl,
      'resource_transfer_to_governor',
      {
        resources: {
          food: 11,
          iron: 7,
        },
      },
      'AI player resource transfer shard success',
    )
    assertSuccessfulReceipt('resource_transfer_to_governor', receipt, 'transferFactionResourcesToGovernor')
    assert.ok(readObject(receipt.worldActionPayload).approvedBy === GOVERNOR_PLAYER_ID)
    assert.ok(readObject(receipt.execution), 'resource transfer receipt should include execution')

    const worldAfter = await loadWorldState(backend.baseUrl)
    const accountAfter = worldAfter.factions[FACTION_ID]?.aiResourceAccounts?.[AI_PLAYER_ID]
    assert.ok(accountAfter, 'AI subaccount should remain after transfer')
    assert.equal(accountAfter.resources.food, 79)
    assert.equal(accountAfter.resources.iron, 23)
    const inbox = worldAfter.factions[FACTION_ID]?.governorResourceInboxes?.[GOVERNOR_PLAYER_ID]
    assert.ok(inbox, 'governor pending resource inbox should exist after AI transfer')
    assert.equal(inbox.pendingTransfers.length, 1)
    assert.equal(inbox.totalPendingResources.food, 11)
    assert.equal(inbox.totalPendingResources.iron, 7)

    console.log('[ai_player_http_resource_transfer_contract] all checks passed')
  } finally {
    await backend.stop()
  }
}

run().catch((error) => {
  console.error('[ai_player_http_resource_transfer_contract] failed:', error)
  process.exitCode = 1
})
