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

function readWorldStatePayload(value: unknown): WorldState {
  const root = readObject(value)
  const world = readObject(root.world)
  return world as unknown as WorldState
}

function seedWorldStateWithAiResourceAccount(): string {
  const world = createInitialWorldState()
  const faction = world.factions[FACTION_ID]
  assert.ok(faction, `missing faction ${FACTION_ID} while seeding resource transfer contract`)

  faction.aiResourceAccounts = {
    [AI_PLAYER_ID]: {
      aiPlayerId: AI_PLAYER_ID,
      governorPlayerId: GOVERNOR_PLAYER_ID,
      factionId: FACTION_ID,
      resources: {
        food: 300,
        wood: 300,
        stone: 300,
        iron: 300,
      },
      updatedTick: world.tick,
    },
    mismatched_governor_ai: {
      aiPlayerId: 'mismatched_governor_ai',
      governorPlayerId: 'human_beta',
      factionId: FACTION_ID,
      resources: {
        food: 100,
        wood: 100,
        stone: 100,
        iron: 100,
      },
      updatedTick: world.tick,
    },
  }
  const path = buildSessionPersistPath('world_resource_transfer_contract_world_state')
  writeFileSync(path, `${JSON.stringify(world)}\n`, 'utf-8')
  return path
}

async function loadWorldState(baseUrl: string): Promise<WorldState> {
  const worldResult = await requestJson(baseUrl, '/api/world?intelMode=full', 'GET')
  assert.equal(worldResult.status, 200, `world route failed: ${JSON.stringify(worldResult.data)}`)
  return readWorldStatePayload(worldResult.data)
}

async function run() {
  const worldPersistPath = seedWorldStateWithAiResourceAccount()
  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const tail: TailState = { stdout: [], stderr: [] }
  const child = spawnBackend(port, tail, {
    WORLD_STATE_PERSIST_PATH: worldPersistPath,
  })

  try {
    const health = await waitForHealth(baseUrl)
    assert.ok(health, `backend did not become healthy\nstdout=${tail.stdout.join('\n')}\nstderr=${tail.stderr.join('\n')}`)

    const invalidPolicySchema = await requestJson(baseUrl, '/api/world/action?includeWorld=false', 'POST', {
      action: 'setAiResourceTransferPolicy',
      payload: {
        factionId: FACTION_ID,
      },
    })
    assert.equal(invalidPolicySchema.status, 400, 'policy update should require at least one policy field')

    const setPolicy = await requestJson(baseUrl, '/api/world/action?includeWorld=true', 'POST', {
      action: 'setAiResourceTransferPolicy',
      payload: {
        factionId: FACTION_ID,
        dailyQuotaTotal: 25,
        dailyWindowTicks: 12,
        cooldownTicks: 2,
      },
    })
    assert.equal(setPolicy.status, 200, `set policy route failed: ${JSON.stringify(setPolicy.data)}`)
    const setPolicyPayload = readObject(setPolicy.data)
    assert.equal(setPolicyPayload.ok, true)
    assert.equal(setPolicyPayload.relatedId, FACTION_ID)
    assert.ok(readObject(setPolicyPayload.execution), 'policy update should expose execution snapshot')
    const worldAfterPolicy = readWorldStatePayload(setPolicy.data)
    assert.deepEqual(
      worldAfterPolicy.factions[FACTION_ID]?.aiResourceTransferPolicy,
      {
        dailyQuotaTotal: 25,
        dailyWindowTicks: 12,
        cooldownTicks: 2,
      },
      'policy update should persist the configured resource transfer policy',
    )

    const invalidSchema = await requestJson(baseUrl, '/api/world/action?includeWorld=false', 'POST', {
      action: 'transferFactionResourcesToGovernor',
      payload: {
        sourceFactionId: FACTION_ID,
        sourceAiPlayerId: AI_PLAYER_ID,
        governorPlayerId: GOVERNOR_PLAYER_ID,
        resources: {
          food: 0,
        },
        reason: 'invalid amount',
        approvedBy: GOVERNOR_PLAYER_ID,
      },
    })
    assert.equal(invalidSchema.status, 400, 'transfer should reject non-positive resources at schema validation time')

    const missingAccount = await requestJson(baseUrl, '/api/world/action?includeWorld=false', 'POST', {
      action: 'transferFactionResourcesToGovernor',
      payload: {
        sourceFactionId: FACTION_ID,
        sourceAiPlayerId: 'missing_ai_account',
        governorPlayerId: GOVERNOR_PLAYER_ID,
        resources: {
          food: 5,
        },
        reason: 'missing account',
        approvedBy: GOVERNOR_PLAYER_ID,
      },
    })
    assert.equal(missingAccount.status, 200)
    const missingAccountPayload = readObject(missingAccount.data)
    assert.equal(missingAccountPayload.ok, false)
    assert.equal(missingAccountPayload.failureCode, 'missing_ai_resource_account')

    const approvalRequired = await requestJson(baseUrl, '/api/world/action?includeWorld=false', 'POST', {
      action: 'transferFactionResourcesToGovernor',
      payload: {
        sourceFactionId: FACTION_ID,
        sourceAiPlayerId: AI_PLAYER_ID,
        governorPlayerId: GOVERNOR_PLAYER_ID,
        resources: {
          wood: 5,
        },
        reason: 'wrong approver',
        approvedBy: 'human_beta',
      },
    })
    assert.equal(approvalRequired.status, 200)
    const approvalRequiredPayload = readObject(approvalRequired.data)
    assert.equal(approvalRequiredPayload.ok, false)
    assert.equal(approvalRequiredPayload.failureCode, 'approval_required')

    const governorMismatch = await requestJson(baseUrl, '/api/world/action?includeWorld=false', 'POST', {
      action: 'transferFactionResourcesToGovernor',
      payload: {
        sourceFactionId: FACTION_ID,
        sourceAiPlayerId: 'mismatched_governor_ai',
        governorPlayerId: GOVERNOR_PLAYER_ID,
        resources: {
          stone: 5,
        },
        reason: 'wrong governor',
        approvedBy: GOVERNOR_PLAYER_ID,
      },
    })
    assert.equal(governorMismatch.status, 200)
    const governorMismatchPayload = readObject(governorMismatch.data)
    assert.equal(governorMismatchPayload.ok, false)
    assert.equal(governorMismatchPayload.failureCode, 'governor_mismatch')

    const worldBefore = await loadWorldState(baseUrl)
    const accountBefore = worldBefore.factions[FACTION_ID]?.aiResourceAccounts?.[AI_PLAYER_ID]
    assert.ok(accountBefore, 'seeded AI resource account should be visible before transfer')

    const success = await requestJson(baseUrl, '/api/world/action?includeWorld=true', 'POST', {
      action: 'transferFactionResourcesToGovernor',
      payload: {
        sourceFactionId: FACTION_ID,
        sourceAiPlayerId: AI_PLAYER_ID,
        governorPlayerId: GOVERNOR_PLAYER_ID,
        resources: {
          food: 12,
          wood: 8,
        },
        reason: 'same-governor support transfer',
        approvedBy: GOVERNOR_PLAYER_ID,
      },
    }, 60_000)
    assert.equal(success.status, 200, `transfer success route failed: ${JSON.stringify(success.data)}`)
    const successPayload = readObject(success.data)
    assert.equal(successPayload.ok, true)
    assert.ok(
      String(successPayload.relatedId).startsWith('resource_transfer_'),
      'transfer success should expose generated transfer id as relatedId',
    )
    assert.ok(readObject(successPayload.execution), 'transfer success should expose execution snapshot')

    const worldAfter = readWorldStatePayload(success.data)
    const accountAfter = worldAfter.factions[FACTION_ID]?.aiResourceAccounts?.[AI_PLAYER_ID]
    assert.ok(accountAfter, 'AI resource account should remain after transfer')
    assert.equal(accountAfter.resources.food, accountBefore.resources.food - 12)
    assert.equal(accountAfter.resources.wood, accountBefore.resources.wood - 8)
    assert.equal(accountAfter.resources.stone, accountBefore.resources.stone)
    assert.equal(accountAfter.resources.iron, accountBefore.resources.iron)

    const inbox = worldAfter.factions[FACTION_ID]?.governorResourceInboxes?.[GOVERNOR_PLAYER_ID]
    assert.ok(inbox, 'same-governor pending inbox should be created')
    assert.equal(inbox.pendingTransfers.length, 1)
    assert.equal(inbox.pendingTransfers[0]?.id, successPayload.relatedId)
    assert.equal(inbox.pendingTransfers[0]?.status, 'pending')
    assert.equal(inbox.pendingTransfers[0]?.sourceAiPlayerId, AI_PLAYER_ID)
    assert.equal(inbox.totalPendingResources.food, 12)
    assert.equal(inbox.totalPendingResources.wood, 8)
    assert.equal(inbox.totalPendingResources.stone, 0)
    assert.equal(inbox.totalPendingResources.iron, 0)
    const quotaAfterSuccess = worldAfter.factions[FACTION_ID]?.aiResourceTransferQuotaByAiPlayer?.[AI_PLAYER_ID]
    assert.ok(quotaAfterSuccess, 'same-governor transfer should persist AI transfer quota state')
    assert.equal(quotaAfterSuccess.transferredTotal, 20)
    assert.equal(quotaAfterSuccess.dailyQuotaTotal, 25)
    assert.equal(quotaAfterSuccess.windowEndsTick, worldAfter.tick + 12)
    assert.equal(quotaAfterSuccess.transferredResources.food, 12)
    assert.equal(quotaAfterSuccess.transferredResources.wood, 8)
    assert.equal(
      quotaAfterSuccess.cooldownUntilTick,
      worldAfter.tick + 2,
      'successful transfer should start the configured transfer cooldown',
    )

    const cooldownActive = await requestJson(baseUrl, '/api/world/action?includeWorld=false', 'POST', {
      action: 'transferFactionResourcesToGovernor',
      payload: {
        sourceFactionId: FACTION_ID,
        sourceAiPlayerId: AI_PLAYER_ID,
        governorPlayerId: GOVERNOR_PLAYER_ID,
        resources: {
          iron: 1,
        },
        reason: 'cooldown should block immediate follow-up transfer',
        approvedBy: GOVERNOR_PLAYER_ID,
      },
    })
    assert.equal(cooldownActive.status, 200)
    const cooldownActivePayload = readObject(cooldownActive.data)
    assert.equal(cooldownActivePayload.ok, false)
    assert.equal(cooldownActivePayload.failureCode, 'transfer_cooldown_active')

    for (let i = 0; i < 2; i += 1) {
      const advance = await requestJson(
        baseUrl,
        '/api/world/action?includeWorld=false',
        'POST',
        { action: 'advanceTick' },
        60_000,
      )
      assert.equal(advance.status, 200, `advance tick ${i + 1} failed: ${JSON.stringify(advance.data)}`)
      assert.equal(readObject(advance.data).ok, true, `advance tick ${i + 1} should succeed`)
    }

    const dailyQuotaExceeded = await requestJson(baseUrl, '/api/world/action?includeWorld=false', 'POST', {
      action: 'transferFactionResourcesToGovernor',
      payload: {
        sourceFactionId: FACTION_ID,
        sourceAiPlayerId: AI_PLAYER_ID,
        governorPlayerId: GOVERNOR_PLAYER_ID,
        resources: {
          stone: 6,
        },
        reason: 'daily quota should block transfer over the daily budget',
        approvedBy: GOVERNOR_PLAYER_ID,
      },
    })
    assert.equal(dailyQuotaExceeded.status, 200)
    const dailyQuotaExceededPayload = readObject(dailyQuotaExceeded.data)
    assert.equal(dailyQuotaExceededPayload.ok, false)
    assert.equal(dailyQuotaExceededPayload.failureCode, 'daily_quota_exceeded')

    const worldAfterQuotaFailure = await loadWorldState(baseUrl)
    const accountAfterQuotaFailure = worldAfterQuotaFailure.factions[FACTION_ID]?.aiResourceAccounts?.[AI_PLAYER_ID]
    assert.ok(accountAfterQuotaFailure, 'AI resource account should remain after quota failure')
    assert.equal(accountAfterQuotaFailure.resources.stone, accountAfter.resources.stone)
    assert.equal(
      worldAfterQuotaFailure.factions[FACTION_ID]?.governorResourceInboxes?.[GOVERNOR_PLAYER_ID]?.pendingTransfers.length,
      1,
      'quota failure must not create a second pending transfer',
    )

    const worldReloaded = await loadWorldState(baseUrl)
    assert.equal(
      worldReloaded.factions[FACTION_ID]?.governorResourceInboxes?.[GOVERNOR_PLAYER_ID]?.pendingTransfers.length,
      1,
      'resource transfer inbox should persist through world reload',
    )
  } finally {
    await shutdownChild(child)
  }
}

run().catch((error) => {
  console.error('[world_resource_transfer_http_contract] failed:', error)
  process.exitCode = 1
})
