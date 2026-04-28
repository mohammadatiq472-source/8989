import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { aiPlayerChatPatrolSchedulerRunResponseSchema } from '../../../shared/schemas/aiPlayerChat'
import {
  AI_PLAYER_ID,
  joinGovernor,
  registerDefaultAiPlayer,
  startAiPlayerHttpBackend,
} from '../../tests/helpers/aiPlayerHttpContractHarness'
import { readArray, readObject, requestJson } from '../../tests/helpers/backendHarness'

type GateCheck = {
  name: string
  passed: boolean
  details?: Record<string, unknown>
}

const LATEST_REPORT_PATH = join(process.cwd(), 'tmp', 'gates', 'ai_player_patrol_scheduler_ops_gate_latest.json')
const DEFAULT_OFF_WAIT_MS = 5_250
const TIMER_INTERVAL_MS = 5_000

function writeReport(report: Record<string, unknown>) {
  const stampedPath = join(
    process.cwd(),
    'tmp',
    'gates',
    `ai_player_patrol_scheduler_ops_gate_${new Date().toISOString().replace(/[:.]/g, '_')}.json`,
  )
  mkdirSync(dirname(LATEST_REPORT_PATH), { recursive: true })
  const body = JSON.stringify(report, null, 2)
  writeFileSync(LATEST_REPORT_PATH, body, 'utf-8')
  writeFileSync(stampedPath, body, 'utf-8')
  return { latestPath: LATEST_REPORT_PATH, stampedPath }
}

function assertNoSecretLeak(payload: unknown) {
  const serialized = JSON.stringify(payload)
  assert.equal(serialized.includes('apiKeys'), false, 'ops gate payload must not expose raw apiKeys')
  assert.equal(serialized.includes('AI_PLAYER_RUNTIME_MODEL_API_KEY'), false, 'ops gate payload must not expose secret env names')
  assert.equal(serialized.includes('LLM_RELAY_API_KEY'), false, 'ops gate payload must not expose secret env names')
}

async function run() {
  const checks: GateCheck[] = []
  const backend = await startAiPlayerHttpBackend(
    'ai_player_patrol_scheduler_ops_gate',
    undefined,
    {
      AI_PLAYER_CHAT_PATROL_SCHEDULER_INTERVAL_MS: String(TIMER_INTERVAL_MS),
    },
  )

  try {
    await joinGovernor(backend.baseUrl)
    await registerDefaultAiPlayer(backend.baseUrl)

    await delay(DEFAULT_OFF_WAIT_MS)
    const chatBeforeExternalRun = await requestJson(
      backend.baseUrl,
      `/api/ai/players/${AI_PLAYER_ID}/chat/messages?limit=20`,
      'GET',
    )
    assert.equal(chatBeforeExternalRun.status, 200, `chat read before scheduler failed: ${JSON.stringify(chatBeforeExternalRun.data)}`)
    const messagesBeforeExternalRun = readArray(readObject(chatBeforeExternalRun.data).messages)
    checks.push({
      name: 'app_timer_default_off',
      passed: messagesBeforeExternalRun.length === 0,
      details: {
        waitMs: DEFAULT_OFF_WAIT_MS,
        intervalMs: TIMER_INTERVAL_MS,
        enabledEnvRequired: 'AI_PLAYER_CHAT_PATROL_SCHEDULER_ENABLED=1',
        messageCount: messagesBeforeExternalRun.length,
      },
    })

    const externalRun = await requestJson(
      backend.baseUrl,
      '/api/ai/chat/patrol-scheduler/run',
      'POST',
      {
        aiPlayerIds: [AI_PLAYER_ID],
        shardIndex: 0,
        shardCount: 1,
        providerBudgetTier: 'economy_chat',
        providerBudgetMaxRuns: 1,
        queueRunId: 'ops_gate_patrol_queue_run',
        idempotencyKey: 'ops_gate_patrol_idempotency',
        leaseId: 'ops_gate_patrol_lease',
        leaseTtlMs: 30_000,
        backoffMs: 5_000,
        retryAfterMs: 8_000,
        cooldownTicks: 10_000,
        limit: 10,
      },
    )
    assert.equal(externalRun.status, 200, `external scheduler run failed: ${JSON.stringify(externalRun.data)}`)
    const externalRunPayload = aiPlayerChatPatrolSchedulerRunResponseSchema.parse(externalRun.data)
    checks.push({
      name: 'external_scheduler_http_runner_writes_once',
      passed:
        externalRunPayload.ok
        && externalRunPayload.attemptedCount === 1
        && externalRunPayload.writtenCount === 1
        && externalRunPayload.skippedCount === 0
        && externalRunPayload.failedCount === 0
        && externalRunPayload.providerBudget.consumedRuns === 1
        && externalRunPayload.providerBudget.remainingRuns === 0,
      details: {
        attemptedCount: externalRunPayload.attemptedCount,
        writtenCount: externalRunPayload.writtenCount,
        skippedCount: externalRunPayload.skippedCount,
        failedCount: externalRunPayload.failedCount,
        shard: externalRunPayload.shard,
        providerBudget: externalRunPayload.providerBudget,
        queue: externalRunPayload.queue,
      },
    })

    const externalRunReplay = await requestJson(
      backend.baseUrl,
      '/api/ai/chat/patrol-scheduler/run',
      'POST',
      {
        aiPlayerIds: [AI_PLAYER_ID],
        queueRunId: 'ops_gate_patrol_queue_run_replay',
        idempotencyKey: 'ops_gate_patrol_idempotency',
        leaseId: 'ops_gate_patrol_lease_replay',
        backoffMs: 12_000,
        force: true,
      },
    )
    assert.equal(externalRunReplay.status, 200, `external scheduler replay failed: ${JSON.stringify(externalRunReplay.data)}`)
    const externalRunReplayPayload = aiPlayerChatPatrolSchedulerRunResponseSchema.parse(externalRunReplay.data)
    checks.push({
      name: 'external_queue_idempotency_replay_is_deduped',
      passed:
        externalRunReplayPayload.ok
        && externalRunReplayPayload.queue.deduped
        && externalRunReplayPayload.writtenCount === externalRunPayload.writtenCount
        && externalRunReplayPayload.items[0]?.messageId === externalRunPayload.items[0]?.messageId
        && externalRunReplayPayload.queue.retryAfterMs === 12_000,
      details: {
        firstQueue: externalRunPayload.queue,
        replayQueue: externalRunReplayPayload.queue,
      },
    })

    const shardedOutRun = await requestJson(
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
    assert.equal(shardedOutRun.status, 200, `sharded scheduler run failed: ${JSON.stringify(shardedOutRun.data)}`)
    const shardedOutPayload = aiPlayerChatPatrolSchedulerRunResponseSchema.parse(shardedOutRun.data)
    checks.push({
      name: 'external_queue_shard_can_select_empty_batch',
      passed:
        shardedOutPayload.ok
        && shardedOutPayload.attemptedCount === 0
        && shardedOutPayload.shard.shardIndex === 1
        && shardedOutPayload.shard.shardCount === 2
        && shardedOutPayload.shard.selectedCount === 0,
      details: {
        attemptedCount: shardedOutPayload.attemptedCount,
        shard: shardedOutPayload.shard,
      },
    })

    const providerBudgetDisabledRun = await requestJson(
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
    assert.equal(
      providerBudgetDisabledRun.status,
      200,
      `provider budget disabled scheduler run failed: ${JSON.stringify(providerBudgetDisabledRun.data)}`,
    )
    const providerBudgetDisabledPayload = aiPlayerChatPatrolSchedulerRunResponseSchema.parse(providerBudgetDisabledRun.data)
    checks.push({
      name: 'provider_budget_disabled_counts_as_safe_skip',
      passed:
        providerBudgetDisabledPayload.ok
        && providerBudgetDisabledPayload.attemptedCount === 1
        && providerBudgetDisabledPayload.writtenCount === 0
        && providerBudgetDisabledPayload.skippedCount === 1
        && providerBudgetDisabledPayload.failedCount === 0
        && providerBudgetDisabledPayload.providerBudget.skippedCount === 1,
      details: {
        providerBudget: providerBudgetDisabledPayload.providerBudget,
        firstItemError: readObject(readArray(providerBudgetDisabledPayload.items)[0]).error,
      },
    })

    const cooldownRun = await requestJson(
      backend.baseUrl,
      '/api/ai/chat/patrol-scheduler/run',
      'POST',
      {
        aiPlayerIds: [AI_PLAYER_ID],
        cooldownTicks: 10_000,
        limit: 10,
        force: false,
      },
    )
    assert.equal(cooldownRun.status, 200, `cooldown scheduler run failed: ${JSON.stringify(cooldownRun.data)}`)
    const cooldownPayload = aiPlayerChatPatrolSchedulerRunResponseSchema.parse(cooldownRun.data)
    const cooldownItem = readObject(readArray(cooldownPayload.items)[0])
    checks.push({
      name: 'cooldown_counts_as_safe_skip',
      passed:
        cooldownPayload.ok
        && cooldownPayload.attemptedCount === 1
        && cooldownPayload.writtenCount === 0
        && cooldownPayload.skippedCount === 1
        && cooldownPayload.failedCount === 0
        && cooldownItem.error === 'patrol_cooldown_active',
      details: {
        attemptedCount: cooldownPayload.attemptedCount,
        writtenCount: cooldownPayload.writtenCount,
        skippedCount: cooldownPayload.skippedCount,
        failedCount: cooldownPayload.failedCount,
        itemError: cooldownItem.error,
      },
    })

    assertNoSecretLeak({
      chatBeforeExternalRun: chatBeforeExternalRun.data,
      externalRun: externalRun.data,
      externalRunReplay: externalRunReplay.data,
      shardedOutRun: shardedOutRun.data,
      providerBudgetDisabledRun: providerBudgetDisabledRun.data,
      cooldownRun: cooldownRun.data,
    })
    checks.push({
      name: 'no_secret_in_ops_payloads',
      passed: true,
    })

    const ok = checks.every((check) => check.passed)
    const report = {
      gate: 'ai_player_patrol_scheduler_ops',
      ok,
      checkedAt: new Date().toISOString(),
      checks,
    }
    const paths = writeReport(report)
    console.log(`[AI Player Patrol Scheduler Ops Gate] ok=${ok} latest=${paths.latestPath} stamped=${paths.stampedPath}`)
    if (!ok) {
      process.exitCode = 1
    }
  } finally {
    await backend.stop()
  }
}

run().catch((error) => {
  const report = {
    gate: 'ai_player_patrol_scheduler_ops',
    ok: false,
    checkedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
  }
  const paths = writeReport(report)
  console.error(`[AI Player Patrol Scheduler Ops Gate] ok=false latest=${paths.latestPath}`)
  process.exitCode = 1
})
