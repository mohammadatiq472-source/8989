import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createInitialWorldState } from '../../shared/domain/scenario'
import {
  aiPlayerChatPatrolSchedulerRunResponseSchema,
  aiPlayerChatPatrolTickResponseSchema,
} from '../../shared/schemas/aiPlayerChat'
import {
  AI_PLAYER_ID,
  FACTION_ID,
  GOVERNOR_PLAYER_ID,
  joinGovernor,
  loadWorldState,
  startAiPlayerHttpBackend,
  type AiPlayerHttpBackend,
} from './helpers/aiPlayerHttpContractHarness'
import { readArray, readObject, requestJson } from './helpers/backendHarness'

type PatrolTickSeed = {
  persistRoot: string
  unitId: string
  tileId: string
}

function seedPatrolTickWorld(): PatrolTickSeed {
  const world = createInitialWorldState()
  const faction = world.factions[FACTION_ID]
  assert.ok(faction, `missing faction ${FACTION_ID} while seeding patrol tick shard`)
  const unit = world.units.find((candidate) => candidate.faction === FACTION_ID)
  assert.ok(unit, `missing unit for faction ${FACTION_ID} while seeding patrol tick shard`)
  const targetTile = world.map.tiles.find((tile) => tile.type !== 'city' && tile.type !== 'fog')
    ?? world.map.tiles[0]
  assert.ok(targetTile, 'missing target tile while seeding patrol tick shard')

  targetTile.type = 'resource'
  targetTile.owner = 'neutral'
  targetTile.resourceKind = targetTile.resourceKind || 'wood'
  targetTile.resourceLevel = Math.max(1, targetTile.resourceLevel ?? 2)
  targetTile.enemyPressure = 2

  unit.tileId = targetTile.id
  unit.strength = 68
  unit.supply = 4
  unit.currentTask = undefined
  unit.aiPlayerId = AI_PLAYER_ID

  faction.actionPoints = Math.max(faction.actionPoints, 8)
  faction.food = Math.max(faction.food, 12)
  faction.aiPlayers = [
    {
      id: AI_PLAYER_ID,
      name: 'Patrol Operator Alpha',
      factionId: FACTION_ID,
      unitIds: [unit.id],
      specialty: 'recon',
    },
  ]

  world.tick = 44
  world.feedback.battleRecords = [
    {
      id: 'patrol_tick_ai_loss_latest',
      tick: 43,
      regionId: 'patrol_tick_front',
      tileId: targetTile.id,
      attackerFaction: FACTION_ID,
      attackerUnitId: unit.id,
      outcome: 'loss',
      attackerLoss: 36,
      defenderLoss: 12,
      alliedSupport: 0,
      summary: 'AI patrol should read this latest battle report before proposing next steps.',
    },
  ]

  const persistRoot = join(process.cwd(), 'tmp', `ai_player_http_chat_patrol_tick_world_${process.pid}_${Date.now()}`)
  const path = join(persistRoot, 'world_snapshot.json')
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(world)}\n`, 'utf-8')
  return {
    persistRoot,
    unitId: unit.id,
    tileId: targetTile.id,
  }
}

async function bootPatrolTickBackend(worldPersistRoot: string): Promise<AiPlayerHttpBackend> {
  const backend = await startAiPlayerHttpBackend(
    'ai_player_http_chat_patrol_tick_contract',
    undefined,
    {
      WORLD_PERSIST_ROOT: worldPersistRoot,
    },
  )
  await joinGovernor(backend.baseUrl)
  const register = await requestJson(backend.baseUrl, '/api/ai/players', 'POST', {
    aiPlayerId: AI_PLAYER_ID,
    displayName: 'Patrol Operator Alpha',
    governorPlayerId: GOVERNOR_PLAYER_ID,
    factionId: FACTION_ID,
    actionWhitelist: ['battle_report_read', 'troop_heal', 'tile_occupy', 'march_move', 'resource_gather'],
    budgetPolicy: {
      allowHighRiskActions: true,
    },
  })
  assert.equal(register.status, 200, `register patrol tick AI player failed: ${JSON.stringify(register.data)}`)
  return backend
}

async function run() {
  const seeded = seedPatrolTickWorld()
  const backend = await bootPatrolTickBackend(seeded.persistRoot)
  try {
    const worldBefore = await loadWorldState(backend.baseUrl)
    const patrol = await requestJson(
      backend.baseUrl,
      `/api/ai/players/${AI_PLAYER_ID}/chat/patrol-tick`,
      'POST',
      {
        triggeredBy: GOVERNOR_PLAYER_ID,
        triggerMode: 'manual',
        goalPower: 4000,
        battleReportLimit: 3,
        cooldownTicks: 6,
      },
    )
    assert.equal(patrol.status, 200, `patrol tick failed: ${JSON.stringify(patrol.data)}`)
    const patrolPayload = readObject(patrol.data)
    aiPlayerChatPatrolTickResponseSchema.parse(patrolPayload)
    assert.equal(patrolPayload.ok, true)
    assert.equal(patrolPayload.triggerMode, 'manual')
    assert.equal(patrolPayload.scheduled, false)
    assert.equal(patrolPayload.skipped, false)
    assert.equal(patrolPayload.cooldownTicks, 6)
    assert.equal(patrolPayload.cooldownUntilTick, 50)
    assert.equal(patrolPayload.cooldownRemainingTicks, 0)
    assert.equal(patrolPayload.worldVersionBefore, worldBefore.worldVersion)
    assert.equal(patrolPayload.worldVersionAfter, worldBefore.worldVersion)

    const message = readObject(patrolPayload.message)
    assert.equal(message.kind, 'message')
    assert.equal(message.authorType, 'ai')
    assert.equal(message.authorId, AI_PLAYER_ID)
    assert.equal(message.authorName, 'Patrol Operator Alpha')
    assert.match(String(message.body), /巡查完成/)
    assert.match(String(message.body), /候选提案/)
    const messageMetadata = readObject(message.metadata)
    assert.equal(messageMetadata.source, 'manual_patrol_tick')
    assert.equal(messageMetadata.triggerMode, 'manual')
    assert.equal(messageMetadata.cooldownUntilTick, 50)

    const proposalSummary = readObject(patrolPayload.proposalSummary)
    assert.equal(proposalSummary.action, 'tile_occupy')
    assert.equal(proposalSummary.readiness, 'ready')
    assert.equal(proposalSummary.targetUnitId, seeded.unitId)
    assert.equal(proposalSummary.targetTileId, seeded.tileId)
    assert.deepEqual(readObject(proposalSummary.proposalArgs), {
      unitId: seeded.unitId,
      tileId: seeded.tileId,
    })

    const battleSummary = readObject(patrolPayload.battleReportSummary)
    assert.equal(battleSummary.count, 1)
    assert.equal(battleSummary.latestReportId, 'patrol_tick_ai_loss_latest')
    assert.equal(battleSummary.latestSeverity, 'high')
    assert.match(String(battleSummary.latestNextStepSuggestion), /补兵|驻防/)

    const developmentSummary = readObject(patrolPayload.developmentPlanSummary)
    assert.equal(developmentSummary.tick, 44)
    assert.ok(Number(developmentSummary.readyCandidateCount) >= 1)

    const cooldownBlocked = await requestJson(
      backend.baseUrl,
      `/api/ai/players/${AI_PLAYER_ID}/chat/patrol-tick`,
      'POST',
      {
        triggeredBy: 'ai_patrol_scheduler',
        triggerMode: 'scheduler',
        goalPower: 4000,
        battleReportLimit: 3,
        cooldownTicks: 6,
      },
    )
    assert.equal(cooldownBlocked.status, 429, `patrol cooldown should reject duplicate scheduler tick: ${JSON.stringify(cooldownBlocked.data)}`)
    const cooldownPayload = readObject(cooldownBlocked.data)
    aiPlayerChatPatrolTickResponseSchema.parse(cooldownPayload)
    assert.equal(cooldownPayload.ok, false)
    assert.equal(cooldownPayload.error, 'patrol_cooldown_active')
    assert.equal(cooldownPayload.triggerMode, 'scheduler')
    assert.equal(cooldownPayload.scheduled, true)
    assert.equal(cooldownPayload.skipped, true)
    assert.equal(cooldownPayload.cooldownUntilTick, 50)
    assert.equal(cooldownPayload.cooldownRemainingTicks, 6)

    const forcedScheduler = await requestJson(
      backend.baseUrl,
      `/api/ai/players/${AI_PLAYER_ID}/chat/patrol-tick`,
      'POST',
      {
        triggeredBy: 'ai_patrol_scheduler',
        triggerMode: 'scheduler',
        goalPower: 4000,
        battleReportLimit: 3,
        cooldownTicks: 6,
        force: true,
      },
    )
    assert.equal(forcedScheduler.status, 200, `forced scheduler patrol tick failed: ${JSON.stringify(forcedScheduler.data)}`)
    const forcedPayload = readObject(forcedScheduler.data)
    aiPlayerChatPatrolTickResponseSchema.parse(forcedPayload)
    assert.equal(forcedPayload.ok, true)
    assert.equal(forcedPayload.triggerMode, 'scheduler')
    assert.equal(forcedPayload.scheduled, true)
    assert.equal(readObject(readObject(forcedPayload.message).metadata).source, 'scheduler_patrol_tick')

    const schedulerSkipped = await requestJson(
      backend.baseUrl,
      '/api/ai/chat/patrol-scheduler/run',
      'POST',
      {
        governorPlayerId: GOVERNOR_PLAYER_ID,
        factionId: FACTION_ID,
        cooldownTicks: 6,
        limit: 10,
      },
    )
    assert.equal(schedulerSkipped.status, 200, `scheduler should treat cooldown as a safe skip: ${JSON.stringify(schedulerSkipped.data)}`)
    const schedulerSkippedPayload = readObject(schedulerSkipped.data)
    aiPlayerChatPatrolSchedulerRunResponseSchema.parse(schedulerSkippedPayload)
    assert.equal(schedulerSkippedPayload.ok, true)
    assert.equal(schedulerSkippedPayload.attemptedCount, 1)
    assert.equal(schedulerSkippedPayload.writtenCount, 0)
    assert.equal(schedulerSkippedPayload.skippedCount, 1)
    assert.equal(schedulerSkippedPayload.failedCount, 0)
    assert.deepEqual(readObject(schedulerSkippedPayload.shard), {
      shardIndex: 0,
      shardCount: 1,
      selectedCount: 1,
    })
    assert.deepEqual(readObject(schedulerSkippedPayload.providerBudget), {
      budgetTier: 'economy_chat',
      maxRuns: null,
      consumedRuns: 1,
      remainingRuns: null,
      skippedCount: 0,
    })
    assert.equal(readObject(readArray(schedulerSkippedPayload.items)[0]).error, 'patrol_cooldown_active')

    const schedulerForced = await requestJson(
      backend.baseUrl,
      '/api/ai/chat/patrol-scheduler/run',
      'POST',
      {
        aiPlayerIds: [AI_PLAYER_ID],
        cooldownTicks: 6,
        force: true,
      },
    )
    assert.equal(schedulerForced.status, 200, `forced scheduler run failed: ${JSON.stringify(schedulerForced.data)}`)
    const schedulerForcedPayload = readObject(schedulerForced.data)
    aiPlayerChatPatrolSchedulerRunResponseSchema.parse(schedulerForcedPayload)
    assert.equal(schedulerForcedPayload.ok, true)
    assert.equal(schedulerForcedPayload.attemptedCount, 1)
    assert.equal(schedulerForcedPayload.writtenCount, 1)
    assert.equal(schedulerForcedPayload.skippedCount, 0)
    assert.equal(schedulerForcedPayload.failedCount, 0)
    const schedulerForcedItem = readObject(readArray(schedulerForcedPayload.items)[0])
    assert.equal(schedulerForcedItem.aiPlayerId, AI_PLAYER_ID)
    assert.equal(schedulerForcedItem.ok, true)
    assert.ok(String(schedulerForcedItem.messageId).startsWith('chat_'))

    const schedulerIdempotentFirst = await requestJson(
      backend.baseUrl,
      '/api/ai/chat/patrol-scheduler/run',
      'POST',
      {
        aiPlayerIds: [AI_PLAYER_ID],
        cooldownTicks: 6,
        force: true,
        queueRunId: 'patrol_queue_run_contract',
        idempotencyKey: 'patrol_idempotency_contract',
        leaseId: 'patrol_lease_contract',
        leaseTtlMs: 30_000,
        backoffMs: 5_000,
        retryAfterMs: 7_000,
      },
    )
    assert.equal(
      schedulerIdempotentFirst.status,
      200,
      `idempotent scheduler first run failed: ${JSON.stringify(schedulerIdempotentFirst.data)}`,
    )
    const schedulerIdempotentFirstPayload = readObject(schedulerIdempotentFirst.data)
    aiPlayerChatPatrolSchedulerRunResponseSchema.parse(schedulerIdempotentFirstPayload)
    assert.equal(schedulerIdempotentFirstPayload.writtenCount, 1)
    assert.deepEqual(readObject(schedulerIdempotentFirstPayload.queue), {
      queueRunId: 'patrol_queue_run_contract',
      idempotencyKey: 'patrol_idempotency_contract',
      leaseId: 'patrol_lease_contract',
      leaseTtlMs: 30_000,
      retryAfterMs: 7_000,
      backoffMs: 5_000,
      deduped: false,
    })
    const idempotentFirstItem = readObject(readArray(schedulerIdempotentFirstPayload.items)[0])
    assert.ok(String(idempotentFirstItem.messageId).startsWith('chat_'))

    const schedulerIdempotentReplay = await requestJson(
      backend.baseUrl,
      '/api/ai/chat/patrol-scheduler/run',
      'POST',
      {
        aiPlayerIds: [AI_PLAYER_ID],
        cooldownTicks: 6,
        force: true,
        queueRunId: 'patrol_queue_run_contract_replay',
        idempotencyKey: 'patrol_idempotency_contract',
        leaseId: 'patrol_lease_contract_replay',
        leaseTtlMs: 45_000,
        backoffMs: 9_000,
      },
    )
    assert.equal(
      schedulerIdempotentReplay.status,
      200,
      `idempotent scheduler replay failed: ${JSON.stringify(schedulerIdempotentReplay.data)}`,
    )
    const schedulerIdempotentReplayPayload = readObject(schedulerIdempotentReplay.data)
    aiPlayerChatPatrolSchedulerRunResponseSchema.parse(schedulerIdempotentReplayPayload)
    assert.equal(readObject(schedulerIdempotentReplayPayload.queue).deduped, true)
    assert.equal(readObject(schedulerIdempotentReplayPayload.queue).queueRunId, 'patrol_queue_run_contract_replay')
    assert.equal(readObject(schedulerIdempotentReplayPayload.queue).leaseId, 'patrol_lease_contract_replay')
    assert.equal(readObject(schedulerIdempotentReplayPayload.queue).retryAfterMs, 9_000)
    assert.equal(schedulerIdempotentReplayPayload.writtenCount, schedulerIdempotentFirstPayload.writtenCount)
    assert.equal(
      readObject(readArray(schedulerIdempotentReplayPayload.items)[0]).messageId,
      idempotentFirstItem.messageId,
      'idempotency replay must return cached item without writing a new patrol message',
    )

    const schedulerShardedOut = await requestJson(
      backend.baseUrl,
      '/api/ai/chat/patrol-scheduler/run',
      'POST',
      {
        aiPlayerIds: [AI_PLAYER_ID],
        shardIndex: 1,
        shardCount: 2,
        limit: 10,
      },
    )
    assert.equal(schedulerShardedOut.status, 200, `sharded scheduler run failed: ${JSON.stringify(schedulerShardedOut.data)}`)
    const schedulerShardedOutPayload = readObject(schedulerShardedOut.data)
    aiPlayerChatPatrolSchedulerRunResponseSchema.parse(schedulerShardedOutPayload)
    assert.equal(schedulerShardedOutPayload.attemptedCount, 0)
    assert.deepEqual(readObject(schedulerShardedOutPayload.shard), {
      shardIndex: 1,
      shardCount: 2,
      selectedCount: 0,
    })

    const schedulerBudgetDisabled = await requestJson(
      backend.baseUrl,
      '/api/ai/chat/patrol-scheduler/run',
      'POST',
      {
        aiPlayerIds: [AI_PLAYER_ID],
        providerBudgetTier: 'disabled',
        providerBudgetMaxRuns: 0,
        limit: 10,
      },
    )
    assert.equal(schedulerBudgetDisabled.status, 200, `budget disabled scheduler run failed: ${JSON.stringify(schedulerBudgetDisabled.data)}`)
    const schedulerBudgetDisabledPayload = readObject(schedulerBudgetDisabled.data)
    aiPlayerChatPatrolSchedulerRunResponseSchema.parse(schedulerBudgetDisabledPayload)
    assert.equal(schedulerBudgetDisabledPayload.attemptedCount, 1)
    assert.equal(schedulerBudgetDisabledPayload.writtenCount, 0)
    assert.equal(schedulerBudgetDisabledPayload.skippedCount, 1)
    assert.equal(schedulerBudgetDisabledPayload.failedCount, 0)
    assert.deepEqual(readObject(schedulerBudgetDisabledPayload.providerBudget), {
      budgetTier: 'disabled',
      maxRuns: 0,
      consumedRuns: 0,
      remainingRuns: 0,
      skippedCount: 1,
    })
    assert.equal(readObject(readArray(schedulerBudgetDisabledPayload.items)[0]).error, 'provider_budget_disabled')

    const chatHistory = await requestJson(backend.baseUrl, `/api/ai/players/${AI_PLAYER_ID}/chat/messages?limit=20`, 'GET')
    assert.equal(chatHistory.status, 200, `chat history after patrol tick failed: ${JSON.stringify(chatHistory.data)}`)
    const chatPayload = readObject(chatHistory.data)
    const messages = readArray(chatPayload.messages).map((item) => readObject(item))
    assert.equal(messages.length, 4)
    assert.equal(messages[0].messageId, message.messageId)
    assert.equal(messages[0].authorType, 'ai')
    assert.equal(readObject(messages[1].metadata).source, 'scheduler_patrol_tick')
    assert.equal(readObject(messages[2].metadata).source, 'scheduler_patrol_tick')
    assert.equal(readObject(messages[3].metadata).source, 'scheduler_patrol_tick')
    const historyCounts = readObject(chatPayload.historyCounts)
    assert.equal(historyCounts.command, 0)
    assert.equal(historyCounts.proposal, 0)
    assert.equal(historyCounts.receipt, 0)

    const worldAfter = await loadWorldState(backend.baseUrl)
    assert.equal(worldAfter.worldVersion, worldBefore.worldVersion, 'patrol tick must not execute or mutate world')
    const tileStates = (worldAfter.map as unknown as { tileStates?: Array<{ id: string; owner?: string }> }).tileStates ?? []
    const tileAfter = worldAfter.map.tiles.find((tile) => tile.id === seeded.tileId)
    const tileStateAfter = tileStates.find((tile) => tile.id === seeded.tileId)
    assert.notEqual(tileAfter?.owner ?? tileStateAfter?.owner, FACTION_ID, 'patrol tick must not occupy the candidate tile')
    const unitAfter = worldAfter.units.find((candidate) => candidate.id === seeded.unitId)
    assert.equal(unitAfter?.tileId, seeded.tileId, 'patrol tick must not move the candidate unit')

    console.log('[ai_player_http_chat_patrol_tick_contract] all checks passed')
  } finally {
    await backend.stop()
  }
}

run().catch((error) => {
  console.error('[ai_player_http_chat_patrol_tick_contract] failed:', error)
  process.exitCode = 1
})
