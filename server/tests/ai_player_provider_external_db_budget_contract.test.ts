import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { createServer, type IncomingMessage } from 'node:http'
import { writeFileSync } from 'node:fs'
import { createInitialWorldState } from '../../shared/domain/scenario'
import {
  listAiPlayerProviderAuditEventsResponseSchema,
  listAiPlayerProviderBillingLedgerResponseSchema,
  listAiPlayerProviderBudgetWindowsResponseSchema,
} from '../../shared/schemas/aiPlayerProviderAccount'
import {
  buildSessionPersistPath,
  getAvailablePort,
  readArray,
  readObject,
  requestJson,
  shutdownChild,
  sleep,
  spawnBackend,
  type TailState,
  waitForHealth,
} from './helpers/backendHarness'

const AI_PLAYER_ID = 'provider_external_budget_ai'
const FACTION_ID = 'player'
const GOVERNOR_PLAYER_ID = 'human_alpha'
const PLAYER_MODEL = 'player/strict-json-budget-model'
const PLAYER_SECRET = 'provider-external-budget-player-key-fixture'
const ENCRYPTION_KEY = 'provider-external-budget-encryption-key-fixture'
const LEDGER_HMAC_SECRET = 'provider-ledger-audit-hmac-fixture'
const BUDGET_GATE_HMAC_SECRET = 'provider-budget-gate-hmac-fixture'
const MODEL_OUTPUT = {
  summary: 'claim the available reward through budgeted player BYOK',
  proposals: [
    {
      action: 'reward_claim',
      args: {},
      reason: '资源：当前存在待领取奖励；目标：领取奖励入账；风险：需要人工批准；批准后结果：后端执行奖励领取并生成 receipt。',
    },
  ],
  deferReason: '',
  needsHumanReview: false,
}

type RelayProbe = {
  authorization: string
  model: string
  path: string
}

async function readRequestBody(req: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf-8')
}

function seedWorldState() {
  const world = createInitialWorldState()
  const faction = world.factions[FACTION_ID]
  assert.ok(faction, `missing faction ${FACTION_ID} while seeding provider external budget shard`)
  faction.aiPlayers = [
    {
      id: AI_PLAYER_ID,
      name: 'Provider External Budget AI',
      factionId: FACTION_ID,
      unitIds: [],
      specialty: 'logistics',
    },
  ]

  const path = buildSessionPersistPath('ai_player_provider_external_budget_world_state')
  writeFileSync(path, `${JSON.stringify(world)}\n`, 'utf-8')
  return path
}

async function startRelayProbe() {
  const port = await getAvailablePort()
  const probes: RelayProbe[] = []
  const server = createServer((req, res) => {
    void (async () => {
      const body = JSON.parse(await readRequestBody(req)) as Record<string, unknown>
      probes.push({
        authorization: String(req.headers.authorization ?? ''),
        model: String(body.model ?? ''),
        path: String(req.url ?? ''),
      })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        model: PLAYER_MODEL,
        choices: [
          {
            message: {
              content: JSON.stringify(MODEL_OUTPUT),
            },
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 6, total_tokens: 11 },
      }))
    })().catch((error: unknown) => {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve())
  })

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    probes,
    stop: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  }
}

async function startExternalLedgerAuditSink() {
  const port = await getAvailablePort()
  const payloads: unknown[] = []
  const headers: Array<Record<string, string>> = []
  const server = createServer((req, res) => {
    void (async () => {
      const raw = await readRequestBody(req)
      payloads.push(JSON.parse(raw) as unknown)
      headers.push({
        idempotencyKey: String(req.headers['x-idempotency-key'] ?? ''),
        signature: String(req.headers['x-signature'] ?? ''),
        expectedSignature: createHmac('sha256', LEDGER_HMAC_SECRET).update(raw, 'utf8').digest('hex'),
      })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    })().catch((error: unknown) => {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve())
  })

  return {
    ingestUrl: `http://127.0.0.1:${port}/ingest`,
    payloads,
    headers,
    stop: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  }
}

async function startExternalBudgetGate() {
  const port = await getAvailablePort()
  const requests: Array<{ payload: Record<string, unknown>; headers: Record<string, string> }> = []
  const server = createServer((req, res) => {
    void (async () => {
      const raw = await readRequestBody(req)
      const payload = JSON.parse(raw) as Record<string, unknown>
      requests.push({
        payload,
        headers: {
          idempotencyKey: String(req.headers['x-idempotency-key'] ?? ''),
          signature: String(req.headers['x-signature'] ?? ''),
          expectedSignature: createHmac('sha256', BUDGET_GATE_HMAC_SECRET).update(raw, 'utf8').digest('hex'),
        },
      })
      const operation = String(payload.operation ?? '')
      const reservationId = String(payload.reservationId ?? 'budget_res_external_fixture')
      const reserve = readObject(payload.reserve ?? {})
      const budgetWindowKey = String(reserve.budgetWindowKey ?? 'provider_budget:player_byok:human_alpha:strict_action:0')
      const windowBase = {
        budgetWindowKey,
        billingAccountType: 'player_byok',
        billingAccountId: GOVERNOR_PLAYER_ID,
        budgetTier: 'strict_action',
        windowStartedAt: new Date(0).toISOString(),
        windowEndsAt: new Date(600_000).toISOString(),
        limitMode: 'configured',
        maxRuns: 1,
        maxPromptTokens: null,
        maxCompletionTokens: null,
        maxTotalTokens: null,
        maxEstimatedCostUsd: null,
        consumedPromptTokens: 0,
        consumedCompletionTokens: 0,
        consumedEstimatedCostUsd: 0,
        updatedAt: new Date().toISOString(),
      }
      const reserveCount = requests.filter((item) => item.payload.operation === 'reserve').length
      if (operation === 'reserve' && reserveCount === 1) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({
          ok: true,
          reservationId,
          budgetWindowKey,
          budgetTier: 'strict_action',
          limitMode: 'configured',
          remainingRuns: 0,
          remainingTotalTokens: null,
          window: {
            ...windowBase,
            reservedRuns: 1,
            consumedRuns: 0,
            deniedRuns: 0,
            consumedTotalTokens: 0,
          },
        }))
        return
      }
      if (operation === 'reserve') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({
          ok: false,
          error: 'provider_budget_exhausted',
          budgetWindowKey,
          budgetTier: 'strict_action',
          limitMode: 'configured',
          remainingRuns: 0,
          remainingTotalTokens: null,
          window: {
            ...windowBase,
            reservedRuns: 0,
            consumedRuns: 1,
            deniedRuns: 0,
            consumedTotalTokens: 11,
          },
        }))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    })().catch((error: unknown) => {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve())
  })

  return {
    url: `http://127.0.0.1:${port}/budget-gate`,
    requests,
    stop: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  }
}

async function waitForExternalPayload(payloads: unknown[], predicate: (payloads: unknown[]) => boolean) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 10_000) {
    if (predicate(payloads)) {
      return
    }
    await sleep(200)
  }
  throw new Error(`external ledger/audit sink did not receive expected payloads: ${JSON.stringify(payloads)}`)
}

async function waitForProviderOutboxDrained(baseUrl: string) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 10_000) {
    const providerHealth = await requestJson(baseUrl, '/api/ai/provider/health', 'GET')
    if (providerHealth.status === 200) {
      const externalLedgerAuditDb = readObject(readObject(providerHealth.data).externalLedgerAuditDb)
      if (externalLedgerAuditDb.durableOutboxCount === 0) {
        return providerHealth
      }
    }
    await sleep(200)
  }
  throw new Error('provider external ledger/audit outbox did not drain within timeout')
}

function assertNoSecretLeak(value: unknown) {
  const serialized = JSON.stringify(value)
  assert.equal(serialized.includes(PLAYER_SECRET), false, `player key leaked through payload: ${serialized}`)
  assert.equal(serialized.includes(`Bearer ${PLAYER_SECRET}`), false, 'authorization header leaked through payload')
  assert.equal(serialized.includes(ENCRYPTION_KEY), false, 'encryption key leaked through payload')
}

function flattenExternalLedgerEntries(payloads: unknown[]) {
  return payloads.flatMap((payload) => {
    const object = readObject(payload)
    return readArray(object.billingLedgerEntries ?? [])
  })
}

function flattenExternalAuditEvents(payloads: unknown[]) {
  return payloads.flatMap((payload) => {
    const object = readObject(payload)
    return readArray(object.auditEvents ?? [])
  })
}

async function run() {
  const relay = await startRelayProbe()
  const sink = await startExternalLedgerAuditSink()
  const budgetGate = await startExternalBudgetGate()
  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const tail: TailState = { stdout: [], stderr: [] }
  const child = spawnBackend(port, tail, {
    AI_PLAYER_PROVIDER_ACCOUNT_STORE_PATH: buildSessionPersistPath('ai_player_provider_external_budget_store'),
    AI_PLAYER_PROVIDER_LEDGER_AUDIT_DB_URL: sink.ingestUrl,
    AI_PLAYER_PROVIDER_LEDGER_AUDIT_DB_HMAC_SECRET: LEDGER_HMAC_SECRET,
    AI_PLAYER_PROVIDER_BUDGET_GATE_URL: budgetGate.url,
    AI_PLAYER_PROVIDER_BUDGET_GATE_HMAC_SECRET: BUDGET_GATE_HMAC_SECRET,
    AI_PLAYER_PROVIDER_BUDGET_WINDOW_MS: '600000',
    AI_PLAYER_PROVIDER_BUDGET_MAX_RUNS_PER_WINDOW: '1',
    AI_PLAYER_GOVERNANCE_STATE_PATH: buildSessionPersistPath('ai_player_provider_external_budget_governance_state'),
    SESSION_STATE_PERSIST_PATH: buildSessionPersistPath('ai_player_provider_external_budget_session_state'),
    WORLD_STATE_PERSIST_PATH: seedWorldState(),
    FACTION_CONFIG_STORE_PATH: buildSessionPersistPath('ai_player_provider_external_budget_faction_config'),
    FACTION_APIKEY_ENCRYPTION_KEY: ENCRYPTION_KEY,
    AI_PLAYER_RUNTIME_MODEL_BASE_URL: '',
    AI_PLAYER_RUNTIME_MODEL_API_KEY: '',
    LLM_RELAY_URL: '',
    LLM_RELAY_MODEL: '',
    LLM_RELAY_API_KEY: '',
    LLM_RELAY_API_KEYS: '',
    OPENAI_API_KEY: '',
  })

  try {
    const health = await waitForHealth(baseUrl)
    assert.ok(health, `backend did not become healthy\nstdout=${tail.stdout.join('\n')}\nstderr=${tail.stderr.join('\n')}`)

    const savePlayerKey = await requestJson(baseUrl, `/api/ai/provider/player-keys/${GOVERNOR_PLAYER_ID}`, 'POST', {
      model: PLAYER_MODEL,
      baseUrl: relay.baseUrl,
      apiKey: PLAYER_SECRET,
      updatedBy: GOVERNOR_PLAYER_ID,
    })
    assert.equal(savePlayerKey.status, 200, `player key save failed: ${JSON.stringify(savePlayerKey.data)}`)

    const register = await requestJson(baseUrl, '/api/ai/players', 'POST', {
      aiPlayerId: AI_PLAYER_ID,
      displayName: 'Provider External Budget AI',
      governorPlayerId: GOVERNOR_PLAYER_ID,
      factionId: FACTION_ID,
      actionWhitelist: ['reward_claim'],
    })
    assert.equal(register.status, 200, `register failed: ${JSON.stringify(register.data)}`)

    const firstProposal = await requestJson(baseUrl, `/api/ai/players/${AI_PLAYER_ID}/model-proposals`, 'POST')
    assert.equal(firstProposal.status, 200, `first model proposal failed: ${JSON.stringify(firstProposal.data)}`)
    assert.equal(relay.probes.length, 1)
    assert.equal(relay.probes[0].authorization, `Bearer ${PLAYER_SECRET}`)
    assert.equal(budgetGate.requests.filter((request) => request.payload.operation === 'reserve').length, 1)
    assert.equal(budgetGate.requests.filter((request) => request.payload.operation === 'commit').length, 1)
    assert.ok(budgetGate.requests.every((request) => request.headers.signature === request.headers.expectedSignature))
    assertNoSecretLeak(firstProposal.data)

    await waitForExternalPayload(sink.payloads, (payloads) => flattenExternalLedgerEntries(payloads).length > 0)
    const externalLedgerEntries = flattenExternalLedgerEntries(sink.payloads)
    const externalAuditEvents = flattenExternalAuditEvents(sink.payloads)
    assert.ok(externalLedgerEntries.some((entry) => readObject(entry).budgetWindowKey), 'ledger entry should include budgetWindowKey')
    assert.ok(externalLedgerEntries.some((entry) => readObject(entry).budgetReservationId), 'ledger entry should include budgetReservationId')
    assert.ok(externalAuditEvents.some((event) => readObject(event).eventType === 'byok_key_configured'))
    assert.ok(externalAuditEvents.some((event) => readObject(event).eventType === 'provider_request_succeeded'))
    assert.ok(sink.headers.length > 0)
    assert.ok(sink.headers.every((header) => header.idempotencyKey.startsWith('provider_outbox_')))
    assert.ok(sink.headers.every((header) => header.signature === header.expectedSignature))
    assertNoSecretLeak(sink.payloads)

    const secondProposal = await requestJson(baseUrl, `/api/ai/players/${AI_PLAYER_ID}/model-proposals`, 'POST')
    assert.equal(secondProposal.status, 429, `second model proposal should be budget limited: ${JSON.stringify(secondProposal.data)}`)
    const secondPayload = readObject(secondProposal.data)
    assert.equal(secondPayload.error, 'provider_budget_exhausted')
    assert.equal(relay.probes.length, 1, 'budget exhaustion must skip relay call')
    assert.equal(budgetGate.requests.filter((request) => request.payload.operation === 'reserve').length, 2)
    assert.equal(budgetGate.requests.filter((request) => request.payload.operation === 'commit').length, 1)
    assertNoSecretLeak(secondProposal.data)

    const budgetWindows = await requestJson(baseUrl, '/api/ai/provider/budget-windows?limit=10', 'GET')
    assert.equal(budgetWindows.status, 200, `budget window read failed: ${JSON.stringify(budgetWindows.data)}`)
    listAiPlayerProviderBudgetWindowsResponseSchema.parse(budgetWindows.data)
    const budgetWindowItems = readArray(readObject(budgetWindows.data).items)
    assert.equal(budgetWindowItems.length, 1)
    const budgetWindow = readObject(budgetWindowItems[0])
    assert.equal(budgetWindow.billingAccountType, 'player_byok')
    assert.equal(budgetWindow.billingAccountId, GOVERNOR_PLAYER_ID)
    assert.equal(budgetWindow.limitMode, 'configured')
    assert.equal(budgetWindow.maxRuns, 1)
    assert.equal(budgetWindow.consumedRuns, 1)
    assert.equal(budgetWindow.deniedRuns, 1)
    assert.equal(budgetWindow.consumedTotalTokens, 11)

    const providerHealth = await waitForProviderOutboxDrained(baseUrl)
    assert.equal(providerHealth.status, 200, `provider health read failed: ${JSON.stringify(providerHealth.data)}`)
    const providerHealthPayload = readObject(providerHealth.data)
    assert.equal(readObject(providerHealthPayload.externalLedgerAuditDb).hmacConfigured, true)
    assert.equal(readObject(providerHealthPayload.externalLedgerAuditDb).durableOutboxCount, 0)
    assert.equal(readObject(providerHealthPayload.externalBudgetGate).configured, true)
    assert.equal(readObject(providerHealthPayload.externalBudgetGate).hmacConfigured, true)

    const ledger = await requestJson(baseUrl, '/api/ai/provider/billing-ledger?limit=10', 'GET')
    assert.equal(ledger.status, 200, `billing ledger read failed: ${JSON.stringify(ledger.data)}`)
    listAiPlayerProviderBillingLedgerResponseSchema.parse(ledger.data)
    const ledgerItems = readArray(readObject(ledger.data).items)
    assert.equal(ledgerItems.length, 1)

    const audit = await requestJson(baseUrl, '/api/ai/provider/audit-events?limit=20', 'GET')
    assert.equal(audit.status, 200, `audit read failed: ${JSON.stringify(audit.data)}`)
    listAiPlayerProviderAuditEventsResponseSchema.parse(audit.data)
    const auditItems = readArray(readObject(audit.data).items)
    assert.ok(auditItems.some((item) => readObject(item).reason === 'provider_budget_exhausted'))
    assertNoSecretLeak(audit.data)

    console.log('[ai_player_provider_external_db_budget_contract] all checks passed')
  } finally {
    await shutdownChild(child)
    await relay.stop()
    await sink.stop()
    await budgetGate.stop()
  }
}

run().catch((error) => {
  console.error('[ai_player_provider_external_db_budget_contract] failed:', error)
  process.exitCode = 1
})
