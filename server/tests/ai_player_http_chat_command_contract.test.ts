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

const AI_PLAYER_ID = 'player_operator_chat_alpha'
const LOW_RESOURCE_AI_PLAYER_ID = 'player_operator_chat_low_resource'
const FACTION_ID = 'player'
const GOVERNOR_PLAYER_ID = 'human_alpha'
const TRANSFER_WOOD = 11
const MODEL_OUTPUT = {
  summary: 'chat command asks the logistics AI to transfer wood to the governor inbox',
  proposals: [
    {
      action: 'resource_transfer_to_governor',
      args: {
        resources: {
          wood: TRANSFER_WOOD,
        },
      },
      reason: 'The governor chat command requested wood transfer and runtime.resourceTransfer.canTransferNow is true.',
    },
  ],
  deferReason: '',
  needsHumanReview: true,
}

function seedWorldStateWithAiResourceSubaccount() {
  const world = createInitialWorldState()
  const faction = world.factions[FACTION_ID]
  assert.ok(faction, `missing faction ${FACTION_ID} while seeding AI chat command shard`)
  faction.aiPlayers = [
    {
      id: AI_PLAYER_ID,
      name: '青州后勤官',
      factionId: FACTION_ID,
      unitIds: [],
      specialty: 'logistics',
    },
    {
      id: LOW_RESOURCE_AI_PLAYER_ID,
      name: '青州见习后勤官',
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
    [LOW_RESOURCE_AI_PLAYER_ID]: {
      aiPlayerId: LOW_RESOURCE_AI_PLAYER_ID,
      governorPlayerId: GOVERNOR_PLAYER_ID,
      factionId: FACTION_ID,
      resources: {
        food: 0,
        wood: 2,
        stone: 0,
        iron: 0,
      },
      updatedTick: world.tick,
    },
  }
  faction.aiResourceTransferPolicy = {
    cooldownTicks: 10_000,
  }
  faction.governorResourceInboxes = {}

  const path = buildSessionPersistPath('ai_player_http_chat_command_world_state')
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
  const governanceStatePath = buildSessionPersistPath('ai_player_http_chat_command_governance_state')
  const sessionStatePath = buildSessionPersistPath('ai_player_http_chat_command_session_state')
  const backendEnv = {
    AI_PLAYER_GOVERNANCE_STATE_PATH: governanceStatePath,
    SESSION_STATE_PERSIST_PATH: sessionStatePath,
    WORLD_STATE_PERSIST_PATH: worldStatePath,
    AI_PLAYER_RUNTIME_MODEL_MOCK_OUTPUT: JSON.stringify(MODEL_OUTPUT),
  }
  let child = spawnBackend(port, tail, backendEnv)

  try {
    const health = await waitForHealth(baseUrl)
    assert.ok(health, `backend did not become healthy\nstdout=${tail.stdout.join('\n')}\nstderr=${tail.stderr.join('\n')}`)

    const join = await requestJson(baseUrl, '/api/session/join', 'POST', {
      factionId: FACTION_ID,
      playerName: GOVERNOR_PLAYER_ID,
    })
    assert.equal(join.status, 200, `session join failed: ${JSON.stringify(join.data)}`)

    const register = await requestJson(baseUrl, '/api/ai/players', 'POST', {
      aiPlayerId: AI_PLAYER_ID,
      displayName: '青州后勤官',
      governorPlayerId: GOVERNOR_PLAYER_ID,
      factionId: FACTION_ID,
      actionWhitelist: ['resource_transfer_to_governor'],
      budgetPolicy: {
        allowHighRiskActions: true,
      },
    })
    assert.equal(register.status, 200, `register failed: ${JSON.stringify(register.data)}`)

    const registerLowResource = await requestJson(baseUrl, '/api/ai/players', 'POST', {
      aiPlayerId: LOW_RESOURCE_AI_PLAYER_ID,
      displayName: '青州见习后勤官',
      governorPlayerId: GOVERNOR_PLAYER_ID,
      factionId: FACTION_ID,
      actionWhitelist: ['resource_transfer_to_governor'],
      budgetPolicy: {
        allowHighRiskActions: true,
      },
    })
    assert.equal(registerLowResource.status, 200, `register low-resource ai failed: ${JSON.stringify(registerLowResource.data)}`)

    const channelBefore = await requestJson(baseUrl, `/api/ai/players/${AI_PLAYER_ID}/chat?limit=20`, 'GET')
    assert.equal(channelBefore.status, 200, `chat channel before send failed: ${JSON.stringify(channelBefore.data)}`)
    const channelBeforePayload = readObject(channelBefore.data)
    assert.equal(readObject(channelBeforePayload.channel).channelId, `ai:${AI_PLAYER_ID}`)
    assert.equal(readArray(channelBeforePayload.messages).length, 0)

    const sent = await requestJson(baseUrl, `/api/ai/players/${AI_PLAYER_ID}/chat/messages`, 'POST', {
      body: `青州后勤官，输送 ${TRANSFER_WOOD} 木材到总督的通用收件箱。`,
      senderId: GOVERNOR_PLAYER_ID,
      senderName: '总督',
      createProposal: true,
    })
    assert.equal(sent.status, 200, `send chat command failed: ${JSON.stringify(sent.data)}`)
    const sentPayload = readObject(sent.data)
    assert.equal(sentPayload.ok, true)
    const proposal = readObject(sentPayload.proposal)
    assert.equal(proposal.aiPlayerId, AI_PLAYER_ID)
    assert.equal(proposal.action, 'resource_transfer_to_governor')
    assert.equal(proposal.source, 'llm')
    assert.equal(proposal.status, 'pending_approval')
    assert.deepEqual(readObject(proposal.args), { resources: { wood: TRANSFER_WOOD } })
    const proposalRecoveryHint = readObject(proposal.recoveryHint)
    assert.equal(proposalRecoveryHint.focus, 'approval')
    assert.match(String(proposalRecoveryHint.summary), /批准/)
    const proposalMessage = readObject(sentPayload.proposalMessage)
    assert.equal(proposalMessage.kind, 'proposal')
    assert.equal(proposalMessage.proposalId, proposal.proposalId)

    const proposalId = String(proposal.proposalId)
    const chatAfterProposal = await requestJson(baseUrl, `/api/ai/players/${AI_PLAYER_ID}/chat/messages?limit=20`, 'GET')
    assert.equal(chatAfterProposal.status, 200, `chat channel after proposal failed: ${JSON.stringify(chatAfterProposal.data)}`)
    const afterProposalMessages = readArray(readObject(chatAfterProposal.data).messages).map((item) => readObject(item))
    assert.ok(afterProposalMessages.some((item) => item.kind === 'message' && item.authorType === 'governor'))
    assert.ok(afterProposalMessages.some((item) => item.kind === 'proposal' && item.proposalId === proposalId))
    const afterProposalCounts = readObject(readObject(chatAfterProposal.data).historyCounts)
    assert.equal(afterProposalCounts.command, 1)
    assert.equal(afterProposalCounts.proposal, 1)

    const commandHistory = await requestJson(baseUrl, `/api/ai/players/${AI_PLAYER_ID}/chat/messages?limit=20&filter=command`, 'GET')
    assert.equal(commandHistory.status, 200, `chat command history failed: ${JSON.stringify(commandHistory.data)}`)
    const commandHistoryPayload = readObject(commandHistory.data)
    assert.equal(commandHistoryPayload.filter, 'command')
    const commandMessages = readArray(commandHistoryPayload.messages).map((item) => readObject(item))
    assert.equal(commandMessages.length, 1)
    assert.equal(commandMessages[0].kind, 'message')
    assert.equal(commandMessages[0].authorType, 'governor')

    const proposalHistory = await requestJson(baseUrl, `/api/ai/players/${AI_PLAYER_ID}/chat/messages?limit=20&filter=proposal`, 'GET')
    assert.equal(proposalHistory.status, 200, `chat proposal history failed: ${JSON.stringify(proposalHistory.data)}`)
    const proposalHistoryPayload = readObject(proposalHistory.data)
    assert.equal(proposalHistoryPayload.filter, 'proposal')
    const proposalMessages = readArray(proposalHistoryPayload.messages).map((item) => readObject(item))
    assert.equal(proposalMessages.length, 1)
    assert.equal(proposalMessages[0].proposalId, proposalId)

    const invalidHistoryFilter = await requestJson(baseUrl, `/api/ai/players/${AI_PLAYER_ID}/chat/messages?filter=debug`, 'GET')
    assert.equal(invalidHistoryFilter.status, 422)

    const unreadAfterProposal = await requestJson(
      baseUrl,
      `/api/ai/players/${AI_PLAYER_ID}/chat/messages?limit=20&readerId=${GOVERNOR_PLAYER_ID}`,
      'GET',
    )
    assert.equal(unreadAfterProposal.status, 200, `chat channel unread failed: ${JSON.stringify(unreadAfterProposal.data)}`)
    const unreadAfterProposalPayload = readObject(unreadAfterProposal.data)
    assert.equal(readObject(unreadAfterProposalPayload.readCursor).unreadCount, afterProposalMessages.length)

    const markReadAfterProposal = await requestJson(baseUrl, `/api/ai/players/${AI_PLAYER_ID}/chat/read-cursor`, 'POST', {
      readerId: GOVERNOR_PLAYER_ID,
      readMessageCount: afterProposalMessages.length,
    })
    assert.equal(markReadAfterProposal.status, 200, `chat read cursor update failed: ${JSON.stringify(markReadAfterProposal.data)}`)
    const markedCursor = readObject(readObject(markReadAfterProposal.data).readCursor)
    assert.equal(markedCursor.readMessageCount, afterProposalMessages.length)
    assert.equal(markedCursor.unreadCount, 0)

    const approve = await requestJson(baseUrl, `/api/ai/players/proposals/${proposalId}/approve`, 'POST', {
      approvedBy: GOVERNOR_PLAYER_ID,
    })
    assert.equal(approve.status, 200, `approve chat proposal failed: ${JSON.stringify(approve.data)}`)

    const execute = await requestJson(baseUrl, `/api/ai/players/proposals/${proposalId}/execute`, 'POST', {
      executedBy: GOVERNOR_PLAYER_ID,
      includeWorld: false,
    }, 60_000)
    assert.equal(execute.status, 200, `execute chat proposal failed: ${JSON.stringify(execute.data)}`)
    const executePayload = readObject(execute.data)
    const receipt = readObject(executePayload.receipt)
    assert.equal(receipt.ok, true)
    assert.equal(receipt.worldAction, 'transferFactionResourcesToGovernor')
    assert.equal(receipt.failureCode, null)
    const receiptRecoveryHint = readObject(receipt.recoveryHint)
    assert.equal(receiptRecoveryHint.focus, 'inbox')
    assert.match(String(receiptRecoveryHint.summary), /通用收件箱/)
    const executedProposal = readObject(executePayload.proposal)
    assert.equal(readObject(executedProposal.recoveryHint).focus, 'inbox')
    const receiptChatMessage = readObject(executePayload.chatMessage)
    assert.equal(receiptChatMessage.kind, 'receipt')
    assert.equal(receiptChatMessage.authorType, 'ai')
    assert.equal(receiptChatMessage.authorName, '青州后勤官')
    assert.equal(receiptChatMessage.receiptProposalId, proposalId)
    assert.equal(receiptChatMessage.receiptOk, true)
    assert.equal(readObject(readObject(receiptChatMessage.metadata).recoveryHint).focus, 'inbox')

    const chatAfterReceipt = await requestJson(baseUrl, `/api/ai/players/${AI_PLAYER_ID}/chat/messages?limit=20`, 'GET')
    assert.equal(chatAfterReceipt.status, 200, `chat channel after receipt failed: ${JSON.stringify(chatAfterReceipt.data)}`)
    const chatAfterReceiptPayload = readObject(chatAfterReceipt.data)
    const afterReceiptMessages = readArray(chatAfterReceiptPayload.messages).map((item) => readObject(item))
    assert.ok(
      afterReceiptMessages.some((item) => item.kind === 'receipt' && item.receiptProposalId === proposalId),
      'chat flow should include execute receipt writeback',
    )
    const afterReceiptCounts = readObject(chatAfterReceiptPayload.historyCounts)
    assert.equal(afterReceiptCounts.all, afterReceiptMessages.length)
    assert.equal(afterReceiptCounts.receipt, 1)
    assert.equal(afterReceiptCounts.failure, 0)

    const latestPage = await requestJson(baseUrl, `/api/ai/players/${AI_PLAYER_ID}/chat/messages?limit=2`, 'GET')
    assert.equal(latestPage.status, 200, `chat latest page failed: ${JSON.stringify(latestPage.data)}`)
    const latestPagePayload = readObject(latestPage.data)
    assert.equal(latestPagePayload.hasMore, true)
    const latestPageMessages = readArray(latestPagePayload.messages).map((item) => readObject(item))
    assert.equal(latestPageMessages.length, 2)
    assert.equal(latestPageMessages[0].kind, 'proposal')
    assert.equal(latestPageMessages[1].kind, 'receipt')
    const nextBeforeMessageId = String(latestPagePayload.nextBeforeMessageId)
    assert.equal(nextBeforeMessageId, String(latestPageMessages[0].messageId))
    const previousPage = await requestJson(
      baseUrl,
      `/api/ai/players/${AI_PLAYER_ID}/chat/messages?limit=2&beforeMessageId=${encodeURIComponent(nextBeforeMessageId)}`,
      'GET',
    )
    assert.equal(previousPage.status, 200, `chat previous page failed: ${JSON.stringify(previousPage.data)}`)
    const previousPagePayload = readObject(previousPage.data)
    assert.equal(previousPagePayload.beforeMessageId, nextBeforeMessageId)
    assert.equal(previousPagePayload.hasMore, false)
    const previousPageMessages = readArray(previousPagePayload.messages).map((item) => readObject(item))
    assert.equal(previousPageMessages.length, 1)
    assert.equal(previousPageMessages[0].kind, 'message')
    assert.equal(previousPageMessages[0].authorType, 'governor')

    const invalidCursorPage = await requestJson(baseUrl, `/api/ai/players/${AI_PLAYER_ID}/chat/messages?beforeMessageId=missing_chat_message`, 'GET')
    assert.equal(invalidCursorPage.status, 409)

    const receiptHistory = await requestJson(baseUrl, `/api/ai/players/${AI_PLAYER_ID}/chat/messages?limit=20&filter=receipt`, 'GET')
    assert.equal(receiptHistory.status, 200, `chat receipt history failed: ${JSON.stringify(receiptHistory.data)}`)
    const receiptMessages = readArray(readObject(receiptHistory.data).messages).map((item) => readObject(item))
    assert.equal(receiptMessages.length, 1)
    assert.equal(receiptMessages[0].kind, 'receipt')
    const failureHistory = await requestJson(baseUrl, `/api/ai/players/${AI_PLAYER_ID}/chat/messages?limit=20&filter=failure`, 'GET')
    assert.equal(failureHistory.status, 200, `chat failure history failed: ${JSON.stringify(failureHistory.data)}`)
    assert.equal(readArray(readObject(failureHistory.data).messages).length, 0)
    const cursorAfterReceipt = await requestJson(
      baseUrl,
      `/api/ai/players/${AI_PLAYER_ID}/chat/read-cursor?readerId=${GOVERNOR_PLAYER_ID}`,
      'GET',
    )
    assert.equal(cursorAfterReceipt.status, 200, `chat read cursor after receipt failed: ${JSON.stringify(cursorAfterReceipt.data)}`)
    const cursorAfterReceiptPayload = readObject(cursorAfterReceipt.data)
    assert.equal(readObject(cursorAfterReceiptPayload.readCursor).unreadCount, afterReceiptMessages.length - afterProposalMessages.length)

    const worldAfterTransfer = await loadWorldState(baseUrl)
    const factionAfterTransfer = readObject(readObject(worldAfterTransfer.factions)[FACTION_ID])
    const accountAfterTransfer = readObject(readObject(factionAfterTransfer.aiResourceAccounts)[AI_PLAYER_ID])
    assert.equal(readObject(accountAfterTransfer.resources).wood, 40 - TRANSFER_WOOD)
    const inbox = readObject(readObject(factionAfterTransfer.governorResourceInboxes)[GOVERNOR_PLAYER_ID])
    assert.equal(readArray(inbox.pendingTransfers).length, 1)
    assert.equal(readObject(inbox.totalPendingResources).wood, TRANSFER_WOOD)

    await new Promise((resolve) => setTimeout(resolve, 1_500))
    await shutdownChild(child)
    child = spawnBackend(port, tail, backendEnv)
    const restartedHealth = await waitForHealth(baseUrl)
    assert.ok(restartedHealth, `backend did not restart with governance cursor state\nstdout=${tail.stdout.join('\n')}\nstderr=${tail.stderr.join('\n')}`)
    const cursorAfterRestart = await requestJson(
      baseUrl,
      `/api/ai/players/${AI_PLAYER_ID}/chat/read-cursor?readerId=${GOVERNOR_PLAYER_ID}`,
      'GET',
    )
    assert.equal(cursorAfterRestart.status, 200, `chat read cursor after restart failed: ${JSON.stringify(cursorAfterRestart.data)}`)
    const cursorAfterRestartPayload = readObject(cursorAfterRestart.data)
    assert.equal(readObject(cursorAfterRestartPayload.readCursor).readMessageCount, afterProposalMessages.length)
    assert.equal(readObject(cursorAfterRestartPayload.readCursor).unreadCount, afterReceiptMessages.length - afterProposalMessages.length)

    const pendingDirectProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: AI_PLAYER_ID,
      action: 'resource_transfer_to_governor',
      args: {
        resources: {
          wood: 1,
        },
      },
      reason: 'direct test proposal should not execute before approval',
      source: 'human',
    })
    assert.equal(pendingDirectProposal.status, 200, `create pending direct proposal failed: ${JSON.stringify(pendingDirectProposal.data)}`)
    const pendingProposal = readObject(readObject(pendingDirectProposal.data).proposal)
    const executeBeforeApproval = await requestJson(baseUrl, `/api/ai/players/proposals/${String(pendingProposal.proposalId)}/execute`, 'POST', {
      executedBy: GOVERNOR_PLAYER_ID,
      includeWorld: false,
    }, 60_000)
    assert.equal(executeBeforeApproval.status, 409, `execute-before-approval should fail structurally: ${JSON.stringify(executeBeforeApproval.data)}`)
    const executeBeforeApprovalPayload = readObject(executeBeforeApproval.data)
    assert.equal(executeBeforeApprovalPayload.ok, false)
    assert.equal(executeBeforeApprovalPayload.failureCode, 'proposal_not_approved')
    assert.equal(readObject(executeBeforeApprovalPayload.recoveryHint).focus, 'approval')
    const executeBeforeApprovalChatMessage = readObject(executeBeforeApprovalPayload.chatMessage)
    assert.equal(executeBeforeApprovalChatMessage.kind, 'receipt')
    assert.equal(executeBeforeApprovalChatMessage.authorType, 'ai')
    assert.equal(executeBeforeApprovalChatMessage.receiptOk, false)
    assert.equal(executeBeforeApprovalChatMessage.failureCode, 'proposal_not_approved')

    const cooldownPrimerCreate = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: AI_PLAYER_ID,
      action: 'resource_transfer_to_governor',
      args: {
        resources: {
          wood: 1,
        },
      },
      reason: 'prime cooldown for deterministic cooldown failure',
      source: 'human',
    })
    assert.equal(cooldownPrimerCreate.status, 200, `create cooldown primer failed: ${JSON.stringify(cooldownPrimerCreate.data)}`)
    const cooldownPrimer = readObject(readObject(cooldownPrimerCreate.data).proposal)
    const approveCooldownPrimer = await requestJson(baseUrl, `/api/ai/players/proposals/${String(cooldownPrimer.proposalId)}/approve`, 'POST', {
      approvedBy: GOVERNOR_PLAYER_ID,
    })
    assert.equal(approveCooldownPrimer.status, 200, `approve cooldown primer failed: ${JSON.stringify(approveCooldownPrimer.data)}`)
    const executeCooldownPrimer = await requestJson(baseUrl, `/api/ai/players/proposals/${String(cooldownPrimer.proposalId)}/execute`, 'POST', {
      executedBy: GOVERNOR_PLAYER_ID,
      includeWorld: false,
    }, 60_000)
    assert.equal(executeCooldownPrimer.status, 200, `execute cooldown primer route failed: ${JSON.stringify(executeCooldownPrimer.data)}`)
    assert.equal(readObject(readObject(executeCooldownPrimer.data).receipt).ok, true)

    const cooldownProposalCreate = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: AI_PLAYER_ID,
      action: 'resource_transfer_to_governor',
      args: {
        resources: {
          wood: 1,
        },
      },
      reason: 'second transfer should be blocked by cooldown',
      source: 'human',
    })
    assert.equal(cooldownProposalCreate.status, 200, `create cooldown proposal failed: ${JSON.stringify(cooldownProposalCreate.data)}`)
    const cooldownProposal = readObject(readObject(cooldownProposalCreate.data).proposal)
    const approveCooldownProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${String(cooldownProposal.proposalId)}/approve`, 'POST', {
      approvedBy: GOVERNOR_PLAYER_ID,
    })
    assert.equal(approveCooldownProposal.status, 200, `approve cooldown proposal failed: ${JSON.stringify(approveCooldownProposal.data)}`)
    const executeCooldownProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${String(cooldownProposal.proposalId)}/execute`, 'POST', {
      executedBy: GOVERNOR_PLAYER_ID,
      includeWorld: false,
    }, 60_000)
    assert.equal(executeCooldownProposal.status, 200, `execute cooldown proposal route failed: ${JSON.stringify(executeCooldownProposal.data)}`)
    const cooldownReceipt = readObject(readObject(executeCooldownProposal.data).receipt)
    assert.equal(cooldownReceipt.ok, false)
    assert.equal(cooldownReceipt.failureCode, 'transfer_cooldown_active')
    assert.equal(readObject(cooldownReceipt.recoveryHint).focus, 'cooldown')
    assert.equal(readObject(readObject(executeCooldownProposal.data).chatMessage).failureCode, 'transfer_cooldown_active')

    const insufficientProposalCreate = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: LOW_RESOURCE_AI_PLAYER_ID,
      action: 'resource_transfer_to_governor',
      args: {
        resources: {
          wood: 3,
        },
      },
      reason: 'low-resource AI should explain insufficient resource failure',
      source: 'human',
    })
    assert.equal(insufficientProposalCreate.status, 200, `create insufficient proposal failed: ${JSON.stringify(insufficientProposalCreate.data)}`)
    const insufficientProposal = readObject(readObject(insufficientProposalCreate.data).proposal)
    const approveInsufficientProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${String(insufficientProposal.proposalId)}/approve`, 'POST', {
      approvedBy: GOVERNOR_PLAYER_ID,
    })
    assert.equal(approveInsufficientProposal.status, 200, `approve insufficient proposal failed: ${JSON.stringify(approveInsufficientProposal.data)}`)
    const executeInsufficientProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${String(insufficientProposal.proposalId)}/execute`, 'POST', {
      executedBy: GOVERNOR_PLAYER_ID,
      includeWorld: false,
    }, 60_000)
    assert.equal(executeInsufficientProposal.status, 200, `execute insufficient proposal route failed: ${JSON.stringify(executeInsufficientProposal.data)}`)
    const insufficientReceipt = readObject(readObject(executeInsufficientProposal.data).receipt)
    assert.equal(insufficientReceipt.ok, false)
    assert.equal(insufficientReceipt.failureCode, 'insufficient_resources')
    assert.equal(readObject(insufficientReceipt.recoveryHint).focus, 'resources')
    assert.match(String(readObject(insufficientReceipt.recoveryHint).summary), /资源不足/)
    const insufficientChatMessage = readObject(readObject(executeInsufficientProposal.data).chatMessage)
    assert.equal(insufficientChatMessage.kind, 'receipt')
    assert.equal(insufficientChatMessage.authorType, 'ai')
    assert.equal(insufficientChatMessage.authorName, '青州见习后勤官')
    assert.equal(insufficientChatMessage.receiptOk, false)
    assert.equal(insufficientChatMessage.failureCode, 'insufficient_resources')

    const failureHistoryAfterFailureReceipts = await requestJson(baseUrl, `/api/ai/players/${AI_PLAYER_ID}/chat/messages?limit=20&filter=failure`, 'GET')
    assert.equal(failureHistoryAfterFailureReceipts.status, 200, `chat failure history after failure receipts failed: ${JSON.stringify(failureHistoryAfterFailureReceipts.data)}`)
    assert.ok(readArray(readObject(failureHistoryAfterFailureReceipts.data).messages).length >= 2)
    const lowResourceFailureHistory = await requestJson(baseUrl, `/api/ai/players/${LOW_RESOURCE_AI_PLAYER_ID}/chat/messages?limit=20&filter=failure`, 'GET')
    assert.equal(lowResourceFailureHistory.status, 200, `low-resource failure history failed: ${JSON.stringify(lowResourceFailureHistory.data)}`)
    assert.equal(readArray(readObject(lowResourceFailureHistory.data).messages).length, 1)

    console.log('[ai_player_http_chat_command_contract] all checks passed')
  } finally {
    await shutdownChild(child)
  }
}

run().catch((error) => {
  console.error('[ai_player_http_chat_command_contract] failed:', error)
  process.exitCode = 1
})
