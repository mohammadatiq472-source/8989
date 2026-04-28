import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import type { WorldMapLayoutTile, WorldSummary } from '../../shared/contracts/game/world'
import { createInitialWorldState } from '../../shared/domain/scenario'
import {
  AI_PLAYER_ID,
  FACTION_ID,
  GOVERNOR_PLAYER_ID,
  assertSuccessfulReceipt,
  joinGovernor,
  loadWorldState,
  startAiPlayerHttpBackend,
  type AiPlayerHttpBackend,
} from './helpers/aiPlayerHttpContractHarness'
import { buildSessionPersistPath, readArray, readObject, requestJson } from './helpers/backendHarness'

const RESOURCE_TILE_ID = 'tile_ai_player_playable_loop_resource'
const SECOND_AI_PLAYER_ID = 'player_operator_beta'

type ResourceGatherObservation = {
  action: 'resource_gather'
  unitId: string
  tileId: string
}

type ResourceTransferObservation = {
  action: 'resource_transfer_to_governor'
  resources: {
    wood: number
  }
}

function seedWorldStateWithPlayableGatherTarget(): { path: string } {
  const world = createInitialWorldState()
  const faction = world.factions[FACTION_ID]
  assert.ok(faction, `missing faction ${FACTION_ID} while seeding playable loop shard`)
  const unit = world.units.find((candidate) => candidate.faction === FACTION_ID)
  assert.ok(unit, `missing unit for faction ${FACTION_ID} while seeding playable loop shard`)
  const resourceTile =
    world.map.tiles.find((tile) => tile.id === RESOURCE_TILE_ID)
    ?? world.map.tiles.find((tile) => tile.type === 'resource')
    ?? world.map.tiles[0]
  assert.ok(resourceTile, 'missing map tile while seeding playable loop shard')

  resourceTile.id = RESOURCE_TILE_ID
  resourceTile.name = 'AI Player Playable Loop Resource Tile'
  resourceTile.type = 'resource'
  resourceTile.owner = FACTION_ID
  resourceTile.resourceKind = 'wood'
  resourceTile.resourceLevel = 2
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
        food: 1,
        wood: 2,
        stone: 3,
        iron: 4,
      },
      updatedTick: world.tick,
    },
  }
  faction.aiResourceGatherClaims = {}

  const path = buildSessionPersistPath('ai_player_http_playable_loop_world_state')
  writeFileSync(path, `${JSON.stringify(world)}\n`, 'utf-8')
  return { path }
}

async function bootPlayableLoopBackend(worldPersistPath: string): Promise<AiPlayerHttpBackend> {
  const backend = await startAiPlayerHttpBackend(
    'ai_player_http_playable_loop_contract',
    undefined,
    {
      WORLD_STATE_PERSIST_PATH: worldPersistPath,
      ENABLE_FULL_MAP_LAYOUT: '1',
    },
  )
  await joinGovernor(backend.baseUrl)

  for (const aiPlayerId of [AI_PLAYER_ID, SECOND_AI_PLAYER_ID]) {
    const register = await requestJson(backend.baseUrl, '/api/ai/players', 'POST', {
      aiPlayerId,
      displayName: aiPlayerId === AI_PLAYER_ID ? 'Player Operator Alpha' : 'Player Operator Beta',
      governorPlayerId: GOVERNOR_PLAYER_ID,
      factionId: FACTION_ID,
      actionWhitelist: ['resource_gather', 'resource_transfer_to_governor'],
      budgetPolicy: {
        allowHighRiskActions: true,
      },
      runtimePolicy: {
        allowRuleProposals: true,
      },
    })
    assert.equal(register.status, 200, `register ${aiPlayerId} failed: ${JSON.stringify(register.data)}`)
  }

  return backend
}

async function loadAuthoritativeWorldSummary(baseUrl: string): Promise<WorldSummary> {
  const worldResult = await requestJson(baseUrl, '/api/world?intelMode=full', 'GET', undefined, 30_000)
  assert.equal(worldResult.status, 200, `world route failed: ${JSON.stringify(worldResult.data)}`)
  return readObject(readObject(worldResult.data).world) as unknown as WorldSummary
}

async function loadWorldMapLayoutTiles(baseUrl: string): Promise<WorldMapLayoutTile[]> {
  const layoutResult = await requestJson(baseUrl, '/api/world/map-layout?scope=full', 'GET', undefined, 30_000)
  assert.equal(layoutResult.status, 200, `map layout route failed: ${JSON.stringify(layoutResult.data)}`)
  return readArray(readObject(readObject(layoutResult.data).map).tiles) as WorldMapLayoutTile[]
}

async function observeResourceGatherTarget(baseUrl: string): Promise<ResourceGatherObservation> {
  const world = await loadAuthoritativeWorldSummary(baseUrl)
  const layoutTiles = await loadWorldMapLayoutTiles(baseUrl)
  const faction = world.factions[FACTION_ID]
  assert.ok(faction, `missing faction ${FACTION_ID} while observing playable loop`)
  const aiPlayer = faction.aiPlayers?.find((candidate) => candidate.id === AI_PLAYER_ID)
  assert.ok(aiPlayer, `missing world ai player ${AI_PLAYER_ID} while observing playable loop`)
  const unit = world.units.find(
    (candidate) => candidate.faction === FACTION_ID && aiPlayer.unitIds.includes(candidate.id),
  )
  assert.ok(unit, `missing assigned unit for ${AI_PLAYER_ID} while observing playable loop`)
  const layoutTile = layoutTiles.find((candidate) => candidate.id === unit.tileId && candidate.type === 'resource')
  assert.ok(layoutTile, `missing resource layout tile at ${unit.tileId} while observing playable loop`)
  const tileState = world.map.tileStates.find((candidate) => candidate.id === unit.tileId)
  assert.equal(tileState?.owner, FACTION_ID, `resource tile ${unit.tileId} should be controlled by ${FACTION_ID}`)

  return {
    action: 'resource_gather',
    unitId: unit.id,
    tileId: layoutTile.id,
  }
}

async function observeResourceTransferTarget(baseUrl: string): Promise<ResourceTransferObservation> {
  const runtime = await requestJson(baseUrl, `/api/ai/players/${AI_PLAYER_ID}`, 'GET')
  assert.equal(runtime.status, 200, `get runtime before transfer failed: ${JSON.stringify(runtime.data)}`)
  const resourceTransfer = readObject(readObject(runtime.data).resourceTransfer)
  assert.equal(resourceTransfer.canTransferNow, true, 'runtime should report AI transfer as available before transfer')
  assert.equal(resourceTransfer.blockedBy, null, 'runtime should not block the first AI transfer')

  const world = await loadWorldState(baseUrl)
  const account = world.factions[FACTION_ID]?.aiResourceAccounts?.[AI_PLAYER_ID]
  assert.ok(account, 'AI subaccount should exist while observing transfer target')
  assert.ok(
    account.resources.wood >= 21,
    'AI subaccount should have gathered enough wood to transfer while keeping reserve floor',
  )

  return {
    action: 'resource_transfer_to_governor',
    resources: {
      wood: 11,
    },
  }
}

async function createResourceGatherRuleProposalFromObservation(baseUrl: string, observation: ResourceGatherObservation) {
  const create = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
    aiPlayerId: AI_PLAYER_ID,
    action: observation.action,
    source: 'rule',
    reason: `Playable loop rule proposal from observed unit ${observation.unitId} on ${observation.tileId}; expected worldAction gatherAiResourceTile.`,
    args: {
      unitId: observation.unitId,
      tileId: observation.tileId,
    },
  })
  assert.equal(create.status, 200, `create playable loop proposal failed: ${JSON.stringify(create.data)}`)
  return readObject(readObject(create.data).proposal)
}

async function createResourceTransferRuleProposalFromObservation(baseUrl: string, observation: ResourceTransferObservation) {
  const create = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
    aiPlayerId: AI_PLAYER_ID,
    action: observation.action,
    source: 'rule',
    reason: `Playable loop rule proposal transfers ${observation.resources.wood} wood from AI subaccount to governor inbox.`,
    args: {
      resources: observation.resources,
    },
  })
  assert.equal(create.status, 200, `create playable loop transfer proposal failed: ${JSON.stringify(create.data)}`)
  return readObject(readObject(create.data).proposal)
}

async function approveAndExecuteProposal(baseUrl: string, proposalId: string) {
  const approve = await requestJson(baseUrl, `/api/ai/players/proposals/${proposalId}/approve`, 'POST', {
    approvedBy: GOVERNOR_PLAYER_ID,
  })
  assert.equal(approve.status, 200, `approve playable loop proposal failed: ${JSON.stringify(approve.data)}`)

  const execute = await requestJson(
    baseUrl,
    `/api/ai/players/proposals/${proposalId}/execute`,
    'POST',
    {
      executedBy: GOVERNOR_PLAYER_ID,
      includeWorld: false,
    },
    60_000,
  )
  assert.equal(execute.status, 200, `execute playable loop proposal failed: ${JSON.stringify(execute.data)}`)
  return readObject(readObject(execute.data).receipt)
}

async function run() {
  const seeded = seedWorldStateWithPlayableGatherTarget()
  const backend = await bootPlayableLoopBackend(seeded.path)
  try {
    const players = await requestJson(backend.baseUrl, `/api/ai/players?factionId=${FACTION_ID}`, 'GET')
    assert.equal(players.status, 200, `list ai players failed: ${JSON.stringify(players.data)}`)
    const playerItems = readArray(readObject(players.data).items).map((item) => readObject(item))
    assert.equal(playerItems.length, 2, 'playable loop should exercise a multi-AI runtime list')
    assert.ok(
      playerItems.some((item) => item.aiPlayerId === AI_PLAYER_ID),
      'multi-AI runtime list should include alpha',
    )
    assert.ok(
      playerItems.some((item) => item.aiPlayerId === SECOND_AI_PLAYER_ID),
      'multi-AI runtime list should include beta',
    )

    const runtimeBefore = await requestJson(backend.baseUrl, `/api/ai/players/${AI_PLAYER_ID}`, 'GET')
    assert.equal(runtimeBefore.status, 200, `get runtime before proposal failed: ${JSON.stringify(runtimeBefore.data)}`)
    const runtimeBeforePayload = readObject(runtimeBefore.data)
    assert.ok(readArray(runtimeBeforePayload.actionWhitelist).includes('resource_gather'))
    assert.ok(readArray(runtimeBeforePayload.actionWhitelist).includes('resource_transfer_to_governor'))
    assert.equal(runtimeBeforePayload.latestReceipt, undefined, 'runtime should start without an alpha receipt')
    assert.equal(readObject(runtimeBeforePayload.proposalStats).executedCount, 0)

    const observation = await observeResourceGatherTarget(backend.baseUrl)
    const proposal = await createResourceGatherRuleProposalFromObservation(backend.baseUrl, observation)
    const proposalId = String(proposal.proposalId)
    assert.equal(proposal.status, 'pending_approval', 'playable loop proposal should wait for governor approval')
    assert.deepEqual(
      proposal.args,
      {
        unitId: observation.unitId,
        tileId: observation.tileId,
      },
      'generated proposal should preserve observed action args',
    )

    const receipt = await approveAndExecuteProposal(backend.baseUrl, proposalId)
    assertSuccessfulReceipt('resource_gather', receipt, 'gatherAiResourceTile')
    assert.deepEqual(
      readObject(receipt.worldActionPayload),
      {
        factionId: FACTION_ID,
        aiPlayerId: AI_PLAYER_ID,
        unitId: observation.unitId,
        tileId: observation.tileId,
      },
      'playable loop receipt should surface resolved world action payload',
    )
    assert.ok(readObject(receipt.execution), 'playable loop receipt should include execution snapshot')

    const runtimeAfter = await requestJson(backend.baseUrl, `/api/ai/players/${AI_PLAYER_ID}`, 'GET')
    assert.equal(runtimeAfter.status, 200, `get runtime after proposal failed: ${JSON.stringify(runtimeAfter.data)}`)
    const runtimeAfterPayload = readObject(runtimeAfter.data)
    assert.equal(runtimeAfterPayload.latestProposalId, proposalId, 'runtime should expose latest proposal id')
    assert.equal(readObject(runtimeAfterPayload.proposalStats).executedCount, 1)
    const latestReceipt = readObject(runtimeAfterPayload.latestReceipt)
    assert.equal(latestReceipt.proposalId, proposalId, 'runtime should expose the latest receipt')
    assert.equal(latestReceipt.worldAction, 'gatherAiResourceTile')

    const receipts = await requestJson(backend.baseUrl, `/api/ai/players/${AI_PLAYER_ID}/receipts?limit=5`, 'GET')
    assert.equal(receipts.status, 200, `receipt log route failed: ${JSON.stringify(receipts.data)}`)
    const receiptItems = readArray(readObject(receipts.data).items).map((item) => readObject(item))
    assert.ok(
      receiptItems.some((item) => item.proposalId === proposalId && item.worldAction === 'gatherAiResourceTile'),
      'receipt log should include playable loop result',
    )

    const betaRuntime = await requestJson(backend.baseUrl, `/api/ai/players/${SECOND_AI_PLAYER_ID}`, 'GET')
    assert.equal(betaRuntime.status, 200, `get beta runtime failed: ${JSON.stringify(betaRuntime.data)}`)
    assert.equal(readObject(betaRuntime.data).latestReceipt, undefined, 'beta runtime should not inherit alpha receipt')

    const worldAfter = await loadWorldState(backend.baseUrl)
    const accountAfter = worldAfter.factions[FACTION_ID]?.aiResourceAccounts?.[AI_PLAYER_ID]
    assert.ok(accountAfter, 'AI subaccount should exist after playable loop')
    assert.equal(accountAfter.resources.wood, 22, 'resourceLevel 2 should add 20 wood into the AI subaccount')
    assert.ok(
      worldAfter.factions[FACTION_ID]?.aiResourceGatherClaims?.[observation.tileId],
      'playable loop should persist the resource gather claim',
    )

    const transferObservation = await observeResourceTransferTarget(backend.baseUrl)
    const transferProposal = await createResourceTransferRuleProposalFromObservation(backend.baseUrl, transferObservation)
    const transferProposalId = String(transferProposal.proposalId)
    assert.equal(transferProposal.status, 'pending_approval', 'high-risk transfer proposal should wait for approval')
    assert.equal(transferProposal.requiresApproval, true, 'resource transfer should remain a governed action')
    assert.deepEqual(
      transferProposal.args,
      {
        resources: transferObservation.resources,
      },
      'generated transfer proposal should preserve observed resource args',
    )

    const transferReceipt = await approveAndExecuteProposal(backend.baseUrl, transferProposalId)
    assertSuccessfulReceipt('resource_transfer_to_governor', transferReceipt, 'transferFactionResourcesToGovernor')
    const transferPayload = readObject(transferReceipt.worldActionPayload)
    assert.equal(transferPayload.approvedBy, GOVERNOR_PLAYER_ID)
    assert.deepEqual(readObject(transferPayload.resources), transferObservation.resources)
    assert.ok(readObject(transferReceipt.execution), 'resource transfer receipt should include execution snapshot')

    const runtimeAfterTransfer = await requestJson(backend.baseUrl, `/api/ai/players/${AI_PLAYER_ID}`, 'GET')
    assert.equal(runtimeAfterTransfer.status, 200, `get runtime after transfer failed: ${JSON.stringify(runtimeAfterTransfer.data)}`)
    const runtimeAfterTransferPayload = readObject(runtimeAfterTransfer.data)
    assert.equal(runtimeAfterTransferPayload.latestProposalId, transferProposalId, 'runtime should expose transfer proposal as latest')
    assert.equal(readObject(runtimeAfterTransferPayload.proposalStats).executedCount, 2)
    const latestTransferReceipt = readObject(runtimeAfterTransferPayload.latestReceipt)
    assert.equal(latestTransferReceipt.proposalId, transferProposalId, 'runtime should expose latest transfer receipt')
    assert.equal(latestTransferReceipt.worldAction, 'transferFactionResourcesToGovernor')
    const resourceTransferAfter = readObject(runtimeAfterTransferPayload.resourceTransfer)
    assert.equal(resourceTransferAfter.remainingQuotaTotal, 89)
    assert.equal(resourceTransferAfter.cooldownRemainingTicks, 3)
    assert.equal(resourceTransferAfter.canTransferNow, false)
    assert.equal(resourceTransferAfter.blockedBy, 'transfer_cooldown_active')

    const receiptsAfterTransfer = await requestJson(backend.baseUrl, `/api/ai/players/${AI_PLAYER_ID}/receipts?limit=5`, 'GET')
    assert.equal(receiptsAfterTransfer.status, 200, `receipt log after transfer failed: ${JSON.stringify(receiptsAfterTransfer.data)}`)
    const receiptItemsAfterTransfer = readArray(readObject(receiptsAfterTransfer.data).items).map((item) => readObject(item))
    assert.ok(
      receiptItemsAfterTransfer.some((item) => item.proposalId === proposalId && item.worldAction === 'gatherAiResourceTile'),
      'receipt log should retain gather result after transfer',
    )
    assert.ok(
      receiptItemsAfterTransfer.some(
        (item) => item.proposalId === transferProposalId && item.worldAction === 'transferFactionResourcesToGovernor',
      ),
      'receipt log should include transfer result',
    )

    const worldAfterTransfer = await loadWorldState(backend.baseUrl)
    const accountAfterTransfer = worldAfterTransfer.factions[FACTION_ID]?.aiResourceAccounts?.[AI_PLAYER_ID]
    assert.ok(accountAfterTransfer, 'AI subaccount should remain after transfer')
    assert.equal(accountAfterTransfer.resources.wood, 11, 'transfer should debit only the AI subaccount')
    const factionAfterTransfer = worldAfterTransfer.factions[FACTION_ID]
    assert.ok(factionAfterTransfer, 'faction should exist after transfer')
    const governorWoodBeforeClaim = factionAfterTransfer.wood ?? 0
    const inbox = factionAfterTransfer.governorResourceInboxes?.[GOVERNOR_PLAYER_ID]
    assert.ok(inbox, 'transfer should create governor resource inbox')
    assert.equal(inbox.pendingTransfers.length, 1)
    assert.equal(inbox.totalPendingResources.wood, 11)
    const transferId = String(inbox.pendingTransfers[0]?.id)
    assert.ok(transferId.length > 0, 'pending transfer should expose a claimable transfer id')

    const claim = await requestJson(backend.baseUrl, '/api/world/action?includeWorld=false', 'POST', {
      action: 'claimGovernorResourceInbox',
      payload: {
        factionId: FACTION_ID,
        governorPlayerId: GOVERNOR_PLAYER_ID,
        transferId,
      },
    }, 60_000)
    assert.equal(claim.status, 200, `claim governor inbox failed: ${JSON.stringify(claim.data)}`)
    const claimPayload = readObject(claim.data)
    assert.equal(claimPayload.ok, true, 'governor inbox claim should succeed')
    assert.equal(claimPayload.relatedId, transferId)
    assert.ok(readObject(claimPayload.execution), 'claim governor inbox should include execution snapshot')

    const worldAfterClaim = await loadWorldState(backend.baseUrl)
    const factionAfterClaim = worldAfterClaim.factions[FACTION_ID]
    assert.ok(factionAfterClaim, 'faction should exist after governor claim')
    assert.equal(factionAfterClaim.wood, governorWoodBeforeClaim + 11, 'claim should settle pending AI wood into faction resources')
    const inboxAfterClaim = factionAfterClaim.governorResourceInboxes?.[GOVERNOR_PLAYER_ID]
    assert.ok(inboxAfterClaim, 'governor inbox should remain after claim as an empty container')
    assert.equal(inboxAfterClaim.pendingTransfers.length, 0)
    assert.equal(inboxAfterClaim.totalPendingResources.wood, 0)

    const betaRuntimeAfterLoop = await requestJson(backend.baseUrl, `/api/ai/players/${SECOND_AI_PLAYER_ID}`, 'GET')
    assert.equal(betaRuntimeAfterLoop.status, 200, `get beta runtime after full loop failed: ${JSON.stringify(betaRuntimeAfterLoop.data)}`)
    assert.equal(readObject(betaRuntimeAfterLoop.data).latestReceipt, undefined, 'beta runtime should not inherit alpha loop receipts')

    console.log('[ai_player_http_playable_loop_contract] all checks passed')
  } finally {
    await backend.stop()
  }
}

run().catch((error) => {
  console.error('[ai_player_http_playable_loop_contract] failed:', error)
  process.exitCode = 1
})
