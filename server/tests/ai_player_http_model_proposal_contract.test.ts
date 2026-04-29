import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { createInitialWorldState } from '../../shared/domain/scenario'
import {
  buildSessionPersistPath,
  getAvailablePort,
  readArray,
  readObject,
  requestJson,
  shutdownChild,
  spawnBackend,
  type TailState,
  waitForHealth,
} from './helpers/backendHarness'

const AI_PLAYER_ID = 'player_operator_model_transfer'
const FACTION_ID = 'player'
const GOVERNOR_PLAYER_ID = 'human_alpha'
const TRANSFER_WOOD = 11

const MODEL_OUTPUT = {
  summary: 'transfer excess AI wood to the governor inbox through governed proposal flow',
  proposals: [
    {
      action: 'resource_transfer_to_governor',
      args: {
        resources: {
          wood: TRANSFER_WOOD,
        },
      },
      reason: '资源：AI 子账户木材 11 可输送；目标：转入总督通用收件箱；风险：需要人工批准且受额度/冷却约束；批准后结果：后端执行资源输送并生成 receipt。',
    },
  ],
  deferReason: '',
  needsHumanReview: false,
}

function seedWorldStateWithAiResourceSubaccount() {
  const world = createInitialWorldState()
  const faction = world.factions[FACTION_ID]
  assert.ok(faction, `missing faction ${FACTION_ID} while seeding model proposal shard`)
  faction.aiPlayers = [
    {
      id: AI_PLAYER_ID,
      name: 'Player Operator Model Transfer',
      factionId: FACTION_ID,
      unitIds: [],
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
        wood: 40,
        stone: 0,
        iron: 0,
      },
      updatedTick: world.tick,
    },
  }
  faction.governorResourceInboxes = {}

  const path = buildSessionPersistPath('ai_player_http_model_proposal_world_state')
  writeFileSync(path, `${JSON.stringify(world)}\n`, 'utf-8')
  return path
}

async function loadWorldState(baseUrl: string) {
  const worldResult = await requestJson(baseUrl, '/api/world?intelMode=full', 'GET', undefined, 30_000)
  assert.equal(worldResult.status, 200, `world route failed: ${JSON.stringify(worldResult.data)}`)
  return readObject(readObject(worldResult.data).world)
}

async function run() {
  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const tail: TailState = { stdout: [], stderr: [] }
  const worldStatePath = seedWorldStateWithAiResourceSubaccount()
  const child = spawnBackend(port, tail, {
    AI_PLAYER_GOVERNANCE_STATE_PATH: buildSessionPersistPath('ai_player_http_model_proposal_governance_state'),
    SESSION_STATE_PERSIST_PATH: buildSessionPersistPath('ai_player_http_model_proposal_session_state'),
    WORLD_STATE_PERSIST_PATH: worldStatePath,
    AI_PLAYER_RUNTIME_MODEL_MOCK_OUTPUT: JSON.stringify(MODEL_OUTPUT),
  })

  try {
    const health = await waitForHealth(baseUrl)
    assert.ok(health, `backend did not become healthy\nstdout=${tail.stdout.join('\n')}\nstderr=${tail.stderr.join('\n')}`)

    const join = await requestJson(baseUrl, '/api/session/join', 'POST', {
      factionId: 'player',
      playerName: 'human_alpha',
    })
    assert.equal(join.status, 200, `session join failed: ${JSON.stringify(join.data)}`)

    const register = await requestJson(baseUrl, '/api/ai/players', 'POST', {
      aiPlayerId: AI_PLAYER_ID,
      displayName: 'Player Operator Model',
      governorPlayerId: GOVERNOR_PLAYER_ID,
      factionId: FACTION_ID,
      actionWhitelist: ['resource_transfer_to_governor'],
      budgetPolicy: {
        allowHighRiskActions: true,
      },
    })
    assert.equal(register.status, 200, `register failed: ${JSON.stringify(register.data)}`)

    const runtimeBefore = await requestJson(baseUrl, `/api/ai/players/${AI_PLAYER_ID}`, 'GET')
    assert.equal(runtimeBefore.status, 200, `runtime before model proposal failed: ${JSON.stringify(runtimeBefore.data)}`)
    const resourceTransferBefore = readObject(readObject(runtimeBefore.data).resourceTransfer)
    assert.equal(resourceTransferBefore.canTransferNow, true)
    assert.equal(resourceTransferBefore.blockedBy, null)

    const worldBeforeTransfer = await loadWorldState(baseUrl)
    const factionBeforeTransfer = readObject(readObject(worldBeforeTransfer.factions)[FACTION_ID])
    const governorWoodBeforeClaim = Number(factionBeforeTransfer.wood ?? 0)

    const modelProposals = await requestJson(baseUrl, `/api/ai/players/${AI_PLAYER_ID}/model-proposals`, 'POST')
    assert.equal(modelProposals.status, 200, `model proposal route failed: ${JSON.stringify(modelProposals.data)}`)
    const modelProposalPayload = readObject(modelProposals.data)
    assert.equal(modelProposalPayload.ok, true)
    assert.equal(modelProposalPayload.model, 'mock:test')
    assert.equal(modelProposalPayload.proposalCount, 1)
    assert.equal(modelProposalPayload.rejectedCount, 0)
    const proposals = readArray(modelProposalPayload.proposals).map((item) => readObject(item))
    const proposal = proposals[0]
    assert.equal(proposal.aiPlayerId, AI_PLAYER_ID)
    assert.equal(proposal.action, 'resource_transfer_to_governor')
    assert.equal(proposal.source, 'llm')
    assert.equal(proposal.status, 'pending_approval')
    assert.equal(proposal.requiresApproval, true, 'resource transfer proposal should remain governor-approved')
    assert.deepEqual(proposal.args, { resources: { wood: TRANSFER_WOOD } })

    const proposalId = String(proposal.proposalId)
    const listed = await requestJson(baseUrl, `/api/ai/players/proposals?aiPlayerId=${AI_PLAYER_ID}`, 'GET')
    assert.equal(listed.status, 200, `list proposals failed: ${JSON.stringify(listed.data)}`)
    assert.equal(readArray(readObject(listed.data).items).length, 1, 'created llm proposal should be listable')

    const approve = await requestJson(baseUrl, `/api/ai/players/proposals/${proposalId}/approve`, 'POST', {
      approvedBy: GOVERNOR_PLAYER_ID,
    })
    assert.equal(approve.status, 200, `approve failed: ${JSON.stringify(approve.data)}`)

    const execute = await requestJson(baseUrl, `/api/ai/players/proposals/${proposalId}/execute`, 'POST', {
      executedBy: GOVERNOR_PLAYER_ID,
      includeWorld: false,
    })
    assert.equal(execute.status, 200, `execute failed: ${JSON.stringify(execute.data)}`)
    const receipt = readObject(readObject(execute.data).receipt)
    assert.equal(receipt.ok, true, `receipt should report success: ${JSON.stringify(execute.data)}`)
    assert.equal(receipt.worldAction, 'transferFactionResourcesToGovernor')
    assert.equal(receipt.failureCode, null)
    const worldActionPayload = readObject(receipt.worldActionPayload)
    assert.equal(worldActionPayload.sourceFactionId, FACTION_ID)
    assert.equal(worldActionPayload.sourceAiPlayerId, AI_PLAYER_ID)
    assert.equal(worldActionPayload.governorPlayerId, GOVERNOR_PLAYER_ID)
    assert.equal(worldActionPayload.approvedBy, GOVERNOR_PLAYER_ID)
    assert.deepEqual(readObject(worldActionPayload.resources), { wood: TRANSFER_WOOD })

    const runtimeAfterTransfer = await requestJson(baseUrl, `/api/ai/players/${AI_PLAYER_ID}`, 'GET')
    assert.equal(runtimeAfterTransfer.status, 200, `runtime after model transfer failed: ${JSON.stringify(runtimeAfterTransfer.data)}`)
    const latestReceipt = readObject(readObject(runtimeAfterTransfer.data).latestReceipt)
    assert.equal(latestReceipt.proposalId, proposalId)
    assert.equal(latestReceipt.worldAction, 'transferFactionResourcesToGovernor')
    const resourceTransferAfter = readObject(readObject(runtimeAfterTransfer.data).resourceTransfer)
    assert.equal(resourceTransferAfter.canTransferNow, false)
    assert.equal(resourceTransferAfter.blockedBy, 'transfer_cooldown_active')

    const receipts = await requestJson(baseUrl, `/api/ai/players/${AI_PLAYER_ID}/receipts?limit=5`, 'GET')
    assert.equal(receipts.status, 200, `receipt log failed: ${JSON.stringify(receipts.data)}`)
    const receiptItems = readArray(readObject(receipts.data).items).map((item) => readObject(item))
    assert.ok(
      receiptItems.some((item) => item.proposalId === proposalId && item.worldAction === 'transferFactionResourcesToGovernor'),
      'receipt log should include the llm transfer result',
    )

    const worldAfterTransfer = await loadWorldState(baseUrl)
    const factionAfterTransfer = readObject(readObject(worldAfterTransfer.factions)[FACTION_ID])
    const accountAfterTransfer = readObject(readObject(factionAfterTransfer.aiResourceAccounts)[AI_PLAYER_ID])
    assert.equal(readObject(accountAfterTransfer.resources).wood, 40 - TRANSFER_WOOD)
    const inbox = readObject(readObject(factionAfterTransfer.governorResourceInboxes)[GOVERNOR_PLAYER_ID])
    assert.equal(readArray(inbox.pendingTransfers).length, 1)
    assert.equal(readObject(inbox.totalPendingResources).wood, TRANSFER_WOOD)
    const transferId = String(readObject(readArray(inbox.pendingTransfers)[0]).id)
    assert.ok(transferId.length > 0, 'model transfer should create a claimable governor inbox transfer id')

    const claim = await requestJson(baseUrl, '/api/world/action?includeWorld=false', 'POST', {
      action: 'claimGovernorResourceInbox',
      payload: {
        factionId: FACTION_ID,
        governorPlayerId: GOVERNOR_PLAYER_ID,
        transferId,
      },
    }, 60_000)
    assert.equal(claim.status, 200, `claim governor inbox failed: ${JSON.stringify(claim.data)}`)
    const claimPayload = readObject(claim.data)
    assert.equal(claimPayload.ok, true, 'governor inbox claim should succeed after llm transfer')
    assert.equal(claimPayload.relatedId, transferId)
    assert.ok(readObject(claimPayload.execution), 'claim receipt should expose execution snapshot')

    const worldAfterClaim = await loadWorldState(baseUrl)
    const factionAfterClaim = readObject(readObject(worldAfterClaim.factions)[FACTION_ID])
    assert.equal(factionAfterClaim.wood, governorWoodBeforeClaim + TRANSFER_WOOD)
    const inboxAfterClaim = readObject(readObject(factionAfterClaim.governorResourceInboxes)[GOVERNOR_PLAYER_ID])
    assert.equal(readArray(inboxAfterClaim.pendingTransfers).length, 0)
    assert.equal(readObject(inboxAfterClaim.totalPendingResources).wood, 0)

    console.log('[ai_player_http_model_proposal_contract] all checks passed')
  } finally {
    await shutdownChild(child)
  }
}

run().catch((error) => {
  console.error('[ai_player_http_model_proposal_contract] failed:', error)
  process.exitCode = 1
})
