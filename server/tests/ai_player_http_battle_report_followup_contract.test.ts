import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
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
import { readArray, readObject, requestJson } from './helpers/backendHarness'

type BattleFollowupSeed = {
  persistRoot: string
  unitId: string
  tileId: string
}

function seedBattleReportFollowupWorld(): BattleFollowupSeed {
  const world = createInitialWorldState()
  const faction = world.factions[FACTION_ID]
  assert.ok(faction, `missing faction ${FACTION_ID} while seeding battle followup shard`)
  const unit = world.units.find((candidate) => candidate.faction === FACTION_ID)
  assert.ok(unit, `missing unit for faction ${FACTION_ID} while seeding battle followup shard`)
  const targetTile = world.map.tiles.find((tile) => tile.type === 'resource')
    ?? world.map.tiles.find((tile) => tile.type === 'plain')
    ?? world.map.tiles[0]
  assert.ok(targetTile, 'missing target tile while seeding battle followup shard')

  targetTile.type = 'resource'
  targetTile.owner = 'neutral'
  targetTile.resourceKind = targetTile.resourceKind || 'wood'
  targetTile.resourceLevel = Math.max(1, targetTile.resourceLevel ?? 2)
  targetTile.enemyPressure = 2

  unit.tileId = targetTile.id
  unit.strength = 42
  unit.supply = 3
  unit.status = '待命'
  unit.currentTask = undefined
  unit.aiPlayerId = AI_PLAYER_ID

  faction.actionPoints = Math.max(faction.actionPoints, 8)
  faction.food = Math.max(faction.food, 12)
  faction.aiPlayers = [
    {
      id: AI_PLAYER_ID,
      name: 'Player Operator Alpha',
      factionId: FACTION_ID,
      unitIds: [unit.id],
      specialty: 'logistics',
    },
  ]

  world.tick = 33
  world.feedback.battleRecords = [
    {
      id: 'battle_followup_ai_loss_latest',
      tick: 32,
      regionId: 'battle_followup_front',
      tileId: targetTile.id,
      attackerFaction: FACTION_ID,
      attackerUnitId: unit.id,
      outcome: 'loss',
      attackerLoss: 78,
      defenderLoss: 18,
      alliedSupport: 0,
      summary: 'AI unit lost with high damage; player should see troop_heal advice.',
    },
  ]

  const persistRoot = join(process.cwd(), 'tmp', `ai_player_http_battle_followup_world_${process.pid}_${Date.now()}`)
  const path = join(persistRoot, 'world_snapshot.json')
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(world)}\n`, 'utf-8')
  return {
    persistRoot,
    unitId: unit.id,
    tileId: targetTile.id,
  }
}

async function bootBattleFollowupBackend(worldPersistRoot: string): Promise<AiPlayerHttpBackend> {
  const backend = await startAiPlayerHttpBackend(
    'ai_player_http_battle_report_followup_contract',
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
    actionWhitelist: ['battle_report_read', 'troop_heal', 'tile_occupy', 'march_move', 'resource_gather'],
    budgetPolicy: {
      allowHighRiskActions: true,
    },
  })
  assert.equal(register.status, 200, `register battle followup AI player failed: ${JSON.stringify(register.data)}`)
  return backend
}

async function createProposal(
  baseUrl: string,
  action: string,
  args: Record<string, unknown>,
  reason: string,
) {
  const create = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
    aiPlayerId: AI_PLAYER_ID,
    action,
    source: 'human',
    reason,
    args,
  })
  assert.equal(create.status, 200, `create ${action} proposal failed: ${JSON.stringify(create.data)}`)
  const payload = readObject(create.data)
  const proposal = readObject(payload.proposal)
  const chatMessage = readObject(payload.chatMessage)
  assert.equal(chatMessage.kind, 'proposal', `${action} direct proposal should be visible in AI chat`)
  assert.equal(chatMessage.proposalId, proposal.proposalId)
  return {
    proposal,
    chatMessage,
    aggregateChatMessage: payload.aggregateChatMessage ? readObject(payload.aggregateChatMessage) : null,
  }
}

async function approveExecute(baseUrl: string, proposalId: string, action: string, worldAction: string) {
  const approve = await requestJson(baseUrl, `/api/ai/players/proposals/${proposalId}/approve`, 'POST', {
    approvedBy: GOVERNOR_PLAYER_ID,
  })
  assert.equal(approve.status, 200, `approve ${action} proposal failed: ${JSON.stringify(approve.data)}`)

  const execute = await requestJson(baseUrl, `/api/ai/players/proposals/${proposalId}/execute`, 'POST', {
    executedBy: GOVERNOR_PLAYER_ID,
    includeWorld: false,
  }, 60_000)
  assert.equal(execute.status, 200, `execute ${action} proposal failed: ${JSON.stringify(execute.data)}`)
  const payload = readObject(execute.data)
  const receipt = readObject(payload.receipt)
  assertSuccessfulReceipt(action, receipt, worldAction)
  const chatMessage = readObject(payload.chatMessage)
  assert.equal(chatMessage.kind, 'receipt', `${action} receipt should be written to chat`)
  assert.equal(chatMessage.receiptOk, true)
  return {
    receipt,
    chatMessage,
  }
}

async function run() {
  const seeded = seedBattleReportFollowupWorld()
  const backend = await bootBattleFollowupBackend(seeded.persistRoot)
  try {
    const reports = await requestJson(backend.baseUrl, `/api/ai/players/${AI_PLAYER_ID}/battle-reports?limit=3`, 'GET')
    assert.equal(reports.status, 200, `battle report read failed: ${JSON.stringify(reports.data)}`)
    const reportItems = readArray(readObject(reports.data).items).map((item) => readObject(item))
    assert.equal(reportItems[0].reportId, 'battle_followup_ai_loss_latest')
    assert.equal(reportItems[0].severity, 'high')
    assert.match(String(reportItems[0].nextStepSuggestion), /补兵|驻防/)

    const heal = await createProposal(
      backend.baseUrl,
      'troop_heal',
      { unitId: seeded.unitId },
      `根据战报 ${String(reportItems[0].reportId)} 先补兵整备。`,
    )
    await approveExecute(backend.baseUrl, String(heal.proposal.proposalId), 'troop_heal', 'healTroop')

    const occupy = await createProposal(
      backend.baseUrl,
      'tile_occupy',
      { unitId: seeded.unitId, tileId: seeded.tileId },
      `补兵完成后占领当前低压力资源地 ${seeded.tileId}。`,
    )
    await approveExecute(backend.baseUrl, String(occupy.proposal.proposalId), 'tile_occupy', 'occupyTile')

    const planAfterOccupy = await requestJson(
      backend.baseUrl,
      `/api/ai/players/${AI_PLAYER_ID}/development-plan?goalPower=4000`,
      'GET',
    )
    assert.equal(planAfterOccupy.status, 200, `development plan after occupy failed: ${JSON.stringify(planAfterOccupy.data)}`)
    const march = readArray(readObject(planAfterOccupy.data).candidateActions)
      .map((item) => readObject(item))
      .find((candidate) => candidate.action === 'march_move')
    assert.ok(march, 'development-plan should keep march_move as the next player-visible step')
    assert.equal(march.readiness, 'ready')
    assert.ok(march.args && typeof march.args === 'object', 'march_move should expose proposal args after occupy')
    const marchArgs = readObject(march.args)
    const marchTargetTileId = String(marchArgs.targetTileId ?? '')
    assert.ok(marchTargetTileId, 'march_move should expose a targetTileId for map and chat details')

    const marchProposal = await createProposal(
      backend.baseUrl,
      'march_move',
      marchArgs,
      '占地完成后按 development-plan 推荐继续行军到下一块目标地。',
    )
    assert.equal(marchProposal.proposal.status, 'pending_approval')
    assert.ok(marchProposal.aggregateChatMessage, 'battle followup aggregate receipt should be appended when march waits for approval')
    assert.equal(marchProposal.aggregateChatMessage?.kind, 'receipt')
    assert.equal(marchProposal.aggregateChatMessage?.body, '已补兵、已占地，下一步行军待批准。')
    assert.equal(readObject(marchProposal.aggregateChatMessage?.metadata ?? {}).aggregateKind, 'battle_report_followup')
    const marchReceipt = await approveExecute(
      backend.baseUrl,
      String(marchProposal.proposal.proposalId),
      'march_move',
      'moveUnit',
    )
    assert.equal(marchReceipt.chatMessage.body, '执行成功：行军到目标地')

    const worldAfter = await loadWorldState(backend.baseUrl)
    const tileStates = (worldAfter.map as unknown as { tileStates?: Array<{ id: string; owner?: string }> }).tileStates ?? []
    const occupiedTile = tileStates.find((tile) => tile.id === seeded.tileId)
    assert.equal(occupiedTile?.owner, FACTION_ID, 'tile_occupy should persist target tile owner')
    const unitAfterMarch = worldAfter.units.find((candidate) => candidate.id === seeded.unitId)
    assert.equal(unitAfterMarch?.tileId, marchTargetTileId, 'march_move should persist unit at target tile')

    const chatHistory = await requestJson(backend.baseUrl, `/api/ai/players/${AI_PLAYER_ID}/chat/messages?limit=20`, 'GET')
    assert.equal(chatHistory.status, 200, `chat history failed: ${JSON.stringify(chatHistory.data)}`)
    const chatPayload = readObject(chatHistory.data)
    const messages = readArray(chatPayload.messages).map((item) => readObject(item))
    assert.ok(
      messages.some((message) => message.kind === 'receipt' && message.body === '已补兵、已占地，下一步行军待批准。'),
      'main chat flow should include the player-readable aggregate receipt',
    )
    assert.ok(
      messages.some((message) => message.kind === 'receipt' && message.body === '已行军到目标地。'),
      'main chat flow should include the player-readable march completion aggregate receipt',
    )
    const historyCounts = readObject(chatPayload.historyCounts)
    assert.equal(historyCounts.proposal, 3)
    assert.equal(historyCounts.receipt, 5)
    assert.equal(historyCounts.failure, 0)

    console.log('[ai_player_http_battle_report_followup_contract] all checks passed')
  } finally {
    await backend.stop()
  }
}

run().catch((error) => {
  console.error('[ai_player_http_battle_report_followup_contract] failed:', error)
  process.exitCode = 1
})
