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

const FACTION_ID = 'player'
const GOVERNOR_PLAYER_ID = 'human_alpha'
const AI_PLAYER_ID = 'player_operator_alpha'
const TRANSFER_ID = 'resource_transfer_unified_inbox_contract'
const DAILY_REWARD_ID = 'daily_welfare_unified_inbox_contract'
const DAILY_LEDGER_KEY = 'daily_welfare:2026-04-26:player'
const FORMAL_DAILY_BENEFIT_DATE = '2026-04-27'
const FORMAL_DAILY_REWARD_ID = `daily_welfare:${FORMAL_DAILY_BENEFIT_DATE}:${FACTION_ID}`
const EVENT_ID = 'event_reward_unified_inbox_contract'
const EVENT_REWARD_ID = `event_reward:${EVENT_ID}:${FACTION_ID}`

function seedWorldStateWithUnifiedInboxItems() {
  const world = createInitialWorldState()
  const faction = world.factions[FACTION_ID]
  assert.ok(faction, `missing faction ${FACTION_ID} while seeding unified inbox shard`)
  faction.food = 100
  faction.actionPoints = 1
  faction.governorResourceInboxes = {
    [GOVERNOR_PLAYER_ID]: {
      governorPlayerId: GOVERNOR_PLAYER_ID,
      pendingTransfers: [
        {
          id: TRANSFER_ID,
          sourceAiPlayerId: 'player_operator_alpha',
          sourceFactionId: FACTION_ID,
          governorPlayerId: GOVERNOR_PLAYER_ID,
          resources: {
            food: 0,
            wood: 11,
            stone: 0,
            iron: 0,
          },
          reason: 'contract seeded AI transfer',
          approvedBy: GOVERNOR_PLAYER_ID,
          status: 'pending',
          createdTick: world.tick,
        },
      ],
      totalPendingResources: {
        food: 0,
        wood: 11,
        stone: 0,
        iron: 0,
      },
    },
  }
  faction.claimableRewards = []

  const path = buildSessionPersistPath('world_unified_inbox_contract_world_state')
  writeFileSync(path, `${JSON.stringify(world)}\n`, 'utf-8')
  return path
}

async function run() {
  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const tail: TailState = { stdout: [], stderr: [] }
  const worldStatePath = seedWorldStateWithUnifiedInboxItems()
  const child = spawnBackend(port, tail, {
    WORLD_STATE_PERSIST_PATH: worldStatePath,
    SESSION_STATE_PERSIST_PATH: buildSessionPersistPath('world_unified_inbox_contract_session_state'),
    AI_PLAYER_GOVERNANCE_STATE_PATH: buildSessionPersistPath('world_unified_inbox_contract_governance_state'),
  })

  try {
    const health = await waitForHealth(baseUrl)
    assert.ok(health, `backend did not become healthy\nstdout=${tail.stdout.join('\n')}\nstderr=${tail.stderr.join('\n')}`)

    const issueDaily = await requestJson(baseUrl, '/api/inbox/issue', 'POST', {
      kind: 'daily_welfare',
      factionId: FACTION_ID,
      rewardId: DAILY_REWARD_ID,
      ledgerKey: DAILY_LEDGER_KEY,
      label: '每日福利',
      summary: '每日登录福利。',
      reward: {
        food: 20,
        ap: 1,
      },
      includeWorld: false,
    }, 60_000)
    assert.equal(issueDaily.status, 200, `issue daily welfare failed: ${JSON.stringify(issueDaily.data)}`)
    const issueDailyPayload = readObject(issueDaily.data)
    assert.equal(issueDailyPayload.ok, true)
    assert.equal(issueDailyPayload.kind, 'daily_welfare')
    assert.equal(issueDailyPayload.worldAction, 'issueClaimableReward')

    const issueEvent = await requestJson(baseUrl, '/api/inbox/event-reward', 'POST', {
      factionId: FACTION_ID,
      eventId: EVENT_ID,
      label: '活动奖励',
      summary: '活动结算奖励。',
      reward: {
        food: 30,
        ap: 2,
      },
      includeWorld: false,
    }, 60_000)
    assert.equal(issueEvent.status, 200, `issue event reward failed: ${JSON.stringify(issueEvent.data)}`)
    const issueEventPayload = readObject(issueEvent.data)
    assert.equal(issueEventPayload.ok, true)
    assert.equal(issueEventPayload.kind, 'event_reward')
    assert.equal(issueEventPayload.worldAction, 'issueClaimableReward')
    assert.equal(issueEventPayload.eventId, EVENT_ID)
    assert.equal(issueEventPayload.rewardId, EVENT_REWARD_ID)

    const duplicateEvent = await requestJson(baseUrl, '/api/inbox/event-reward', 'POST', {
      factionId: FACTION_ID,
      eventId: EVENT_ID,
      reward: {
        food: 30,
        ap: 2,
      },
      includeWorld: false,
    }, 60_000)
    assert.equal(duplicateEvent.status, 409, `duplicate event reward should be rejected while pending: ${JSON.stringify(duplicateEvent.data)}`)
    assert.equal(readObject(duplicateEvent.data).error, 'reward_already_pending')

    const duplicateDaily = await requestJson(baseUrl, '/api/inbox/issue', 'POST', {
      kind: 'daily_welfare',
      factionId: FACTION_ID,
      rewardId: DAILY_REWARD_ID,
      ledgerKey: DAILY_LEDGER_KEY,
      reward: {
        food: 20,
        ap: 1,
      },
      includeWorld: false,
    }, 60_000)
    assert.equal(duplicateDaily.status, 409, `duplicate daily welfare should be rejected: ${JSON.stringify(duplicateDaily.data)}`)
    assert.equal(readObject(duplicateDaily.data).error, 'reward_already_pending')

    const list = await requestJson(
      baseUrl,
      `/api/inbox?factionId=${FACTION_ID}&governorPlayerId=${GOVERNOR_PLAYER_ID}`,
      'GET',
    )
    assert.equal(list.status, 200, `list unified inbox failed: ${JSON.stringify(list.data)}`)
    const listPayload = readObject(list.data)
    assert.equal(listPayload.ok, true)
    assert.equal(listPayload.count, 3)
    assert.deepEqual(readObject(listPayload.countsByKind), {
      ai_resource_transfer: 1,
      daily_welfare: 1,
      event_reward: 1,
    })
    const items = readArray(listPayload.items).map((item) => readObject(item))
    assert.ok(items.some((item) => item.itemId === `ai_resource_transfer:${TRANSFER_ID}`))
    assert.ok(items.some((item) => item.itemId === `reward:${DAILY_REWARD_ID}` && item.kind === 'daily_welfare'))
    assert.ok(items.some((item) => item.itemId === `reward:${EVENT_REWARD_ID}` && item.kind === 'event_reward'))

    const registerAi = await requestJson(baseUrl, '/api/ai/players', 'POST', {
      aiPlayerId: AI_PLAYER_ID,
      displayName: '青州后勤官',
      factionId: FACTION_ID,
      governorPlayerId: GOVERNOR_PLAYER_ID,
      actionWhitelist: ['resource_transfer_to_governor', 'reward_claim'],
      budgetPolicy: {
        allowHighRiskActions: true,
      },
    }, 60_000)
    assert.equal(registerAi.status, 200, `register AI player for inbox chat failed: ${JSON.stringify(registerAi.data)}`)

    const claimTransfer = await requestJson(baseUrl, '/api/inbox/claim', 'POST', {
      itemId: `ai_resource_transfer:${TRANSFER_ID}`,
      factionId: FACTION_ID,
      governorPlayerId: GOVERNOR_PLAYER_ID,
      chatAiPlayerId: AI_PLAYER_ID,
      includeWorld: false,
    }, 60_000)
    assert.equal(claimTransfer.status, 200, `claim AI transfer inbox item failed: ${JSON.stringify(claimTransfer.data)}`)
    const claimTransferPayload = readObject(claimTransfer.data)
    assert.equal(claimTransferPayload.ok, true)
    assert.equal(claimTransferPayload.kind, 'ai_resource_transfer')
    assert.equal(claimTransferPayload.worldAction, 'claimGovernorResourceInbox')
    const claimTransferChatMessage = readObject(claimTransferPayload.chatMessage)
    assert.equal(claimTransferChatMessage.kind, 'receipt')
    assert.equal(claimTransferChatMessage.receiptOk, true)
    assert.match(String(claimTransferChatMessage.body), /已领取/)
    assert.match(String(claimTransferChatMessage.body), /资源已到账/)

    const claimDaily = await requestJson(baseUrl, '/api/inbox/claim', 'POST', {
      itemId: `reward:${DAILY_REWARD_ID}`,
      factionId: FACTION_ID,
      chatAiPlayerId: AI_PLAYER_ID,
      includeWorld: false,
    }, 60_000)
    assert.equal(claimDaily.status, 200, `claim daily welfare inbox item failed: ${JSON.stringify(claimDaily.data)}`)
    const claimDailyPayload = readObject(claimDaily.data)
    assert.equal(claimDailyPayload.ok, true)
    assert.equal(claimDailyPayload.kind, 'daily_welfare')
    assert.equal(claimDailyPayload.worldAction, 'claimReward')
    const claimDailyChatMessage = readObject(claimDailyPayload.chatMessage)
    assert.equal(claimDailyChatMessage.kind, 'receipt')
    assert.equal(claimDailyChatMessage.receiptOk, true)
    assert.match(String(claimDailyChatMessage.body), /奖励已到账/)

    const chatAfterClaims = await requestJson(
      baseUrl,
      `/api/ai/players/${AI_PLAYER_ID}/chat/messages?limit=20&filter=receipt`,
      'GET',
    )
    assert.equal(chatAfterClaims.status, 200, `inbox claim receipts should be visible in AI chat: ${JSON.stringify(chatAfterClaims.data)}`)
    assert.ok(readArray(readObject(chatAfterClaims.data).messages).length >= 2)

    const duplicateDailyAfterClaim = await requestJson(baseUrl, '/api/inbox/issue', 'POST', {
      kind: 'daily_welfare',
      factionId: FACTION_ID,
      rewardId: DAILY_REWARD_ID,
      ledgerKey: DAILY_LEDGER_KEY,
      reward: {
        food: 20,
        ap: 1,
      },
      includeWorld: false,
    }, 60_000)
    assert.equal(
      duplicateDailyAfterClaim.status,
      409,
      `claimed daily welfare should not be reissued: ${JSON.stringify(duplicateDailyAfterClaim.data)}`,
    )
    assert.equal(readObject(duplicateDailyAfterClaim.data).error, 'daily_welfare_already_issued')

    const issueFormalDaily = await requestJson(baseUrl, '/api/inbox/daily-welfare', 'POST', {
      factionId: FACTION_ID,
      benefitDate: FORMAL_DAILY_BENEFIT_DATE,
      reward: {
        food: 7,
        ap: 1,
      },
      includeWorld: false,
    }, 60_000)
    assert.equal(issueFormalDaily.status, 200, `issue formal daily welfare failed: ${JSON.stringify(issueFormalDaily.data)}`)
    const issueFormalDailyPayload = readObject(issueFormalDaily.data)
    assert.equal(issueFormalDailyPayload.ok, true)
    assert.equal(issueFormalDailyPayload.kind, 'daily_welfare')
    assert.equal(issueFormalDailyPayload.benefitDate, FORMAL_DAILY_BENEFIT_DATE)
    assert.equal(issueFormalDailyPayload.ledgerKey, FORMAL_DAILY_REWARD_ID)
    assert.equal(issueFormalDailyPayload.rewardId, FORMAL_DAILY_REWARD_ID)

    const duplicateFormalDaily = await requestJson(baseUrl, '/api/inbox/daily-welfare', 'POST', {
      factionId: FACTION_ID,
      benefitDate: FORMAL_DAILY_BENEFIT_DATE,
      reward: {
        food: 7,
        ap: 1,
      },
      includeWorld: false,
    }, 60_000)
    assert.equal(
      duplicateFormalDaily.status,
      409,
      `pending formal daily welfare should not be reissued: ${JSON.stringify(duplicateFormalDaily.data)}`,
    )
    assert.equal(readObject(duplicateFormalDaily.data).error, 'reward_already_pending')

    const claimFormalDaily = await requestJson(baseUrl, '/api/inbox/claim', 'POST', {
      itemId: `reward:${FORMAL_DAILY_REWARD_ID}`,
      factionId: FACTION_ID,
      includeWorld: false,
    }, 60_000)
    assert.equal(claimFormalDaily.status, 200, `claim formal daily welfare inbox item failed: ${JSON.stringify(claimFormalDaily.data)}`)
    const claimFormalDailyPayload = readObject(claimFormalDaily.data)
    assert.equal(claimFormalDailyPayload.ok, true)
    assert.equal(claimFormalDailyPayload.kind, 'daily_welfare')

    const duplicateFormalDailyAfterClaim = await requestJson(baseUrl, '/api/inbox/daily-welfare', 'POST', {
      factionId: FACTION_ID,
      benefitDate: FORMAL_DAILY_BENEFIT_DATE,
      reward: {
        food: 7,
        ap: 1,
      },
      includeWorld: false,
    }, 60_000)
    assert.equal(
      duplicateFormalDailyAfterClaim.status,
      409,
      `claimed formal daily welfare should not be reissued: ${JSON.stringify(duplicateFormalDailyAfterClaim.data)}`,
    )
    assert.equal(readObject(duplicateFormalDailyAfterClaim.data).error, 'daily_welfare_already_issued')

    const afterClaim = await requestJson(
      baseUrl,
      `/api/inbox?factionId=${FACTION_ID}&governorPlayerId=${GOVERNOR_PLAYER_ID}`,
      'GET',
    )
    assert.equal(afterClaim.status, 200, `list unified inbox after claims failed: ${JSON.stringify(afterClaim.data)}`)
    const afterClaimPayload = readObject(afterClaim.data)
    assert.equal(afterClaimPayload.count, 1)
    assert.deepEqual(readObject(afterClaimPayload.countsByKind), {
      ai_resource_transfer: 0,
      daily_welfare: 0,
      event_reward: 1,
    })

    console.log('[world_unified_inbox_http_contract] all checks passed')
  } finally {
    await shutdownChild(child)
  }
}

run().catch((error) => {
  console.error('[world_unified_inbox_http_contract] failed:', error)
  process.exitCode = 1
})
