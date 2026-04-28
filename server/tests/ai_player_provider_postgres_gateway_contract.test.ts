import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { createServer } from 'node:http'
import {
  AI_PLAYER_PROVIDER_POSTGRES_GATEWAY_MIGRATION_SQL,
  AI_PLAYER_PROVIDER_POSTGRES_GATEWAY_MIGRATION_ID,
  AiPlayerProviderPostgresGatewayStore,
  createAiPlayerProviderPostgresGatewayHandler,
  type PgPoolLike,
} from '../src/application/ai/aiPlayerProviderPostgresGateway'
import { getAvailablePort } from './helpers/backendHarness'

const LEDGER_HMAC_SECRET = 'provider-postgres-ledger-hmac-fixture'
const BUDGET_HMAC_SECRET = 'provider-postgres-budget-hmac-fixture'

type GatewayStoreForTest = Parameters<typeof createAiPlayerProviderPostgresGatewayHandler>[0]
type IngestInput = Parameters<GatewayStoreForTest['ingestLedgerAudit']>[0]
type ReserveInput = Parameters<GatewayStoreForTest['reserveBudget']>[0]
type CommitInput = Parameters<GatewayStoreForTest['commitBudget']>[0]
type ReleaseInput = Parameters<GatewayStoreForTest['releaseBudget']>[0]
type IdempotentInput = {
  idempotencyKey: string
  requestHash: string
}
type QueryCall = {
  text: string
  params?: readonly unknown[]
}

function sign(body: string, secret: string) {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

function assertMigrationSql() {
  for (const fragment of [
    'CREATE TABLE IF NOT EXISTS ai_provider_gateway_schema_migrations',
    'CREATE TABLE IF NOT EXISTS ai_provider_gateway_idempotency',
    'CREATE TABLE IF NOT EXISTS ai_provider_billing_ledger',
    'CREATE TABLE IF NOT EXISTS ai_provider_audit_events',
    'CREATE TABLE IF NOT EXISTS ai_provider_budget_windows',
    'CREATE TABLE IF NOT EXISTS ai_provider_budget_reservations',
    'idx_ai_provider_billing_account_created',
    'idx_ai_provider_audit_request',
    'idx_ai_provider_budget_reservation_expiry',
    'chk_ai_provider_gateway_idempotency_status',
    'chk_ai_provider_gateway_idempotency_key_length',
    'chk_ai_provider_billing_account_type',
    'chk_ai_provider_audit_event_type',
    'chk_ai_provider_budget_window_values',
    'chk_ai_provider_budget_reservation_values',
    "status IN ('reserved', 'committed', 'released', 'expired')",
    "provider_source IN ('default', 'env', 'faction_config', 'player_config', 'fallback')",
    AI_PLAYER_PROVIDER_POSTGRES_GATEWAY_MIGRATION_ID,
  ]) {
    assert.ok(
      AI_PLAYER_PROVIDER_POSTGRES_GATEWAY_MIGRATION_SQL.includes(fragment),
      `migration SQL missing ${fragment}`,
    )
  }
}

function makeHealthPool(migrationApplied: boolean) {
  const calls: QueryCall[] = []
  const pool: PgPoolLike = {
    async query<T extends Record<string, unknown> = Record<string, unknown>>(
      text: string,
      params?: readonly unknown[],
    ) {
      calls.push({ text, params })
      if (text.includes('SELECT 1::int AS ok')) {
        return { rows: [{ ok: 1 } as unknown as T], rowCount: 1 }
      }
      if (text.includes('ai_provider_gateway_schema_migrations')) {
        assert.deepEqual(params, [AI_PLAYER_PROVIDER_POSTGRES_GATEWAY_MIGRATION_ID])
        return { rows: [{ migration_applied: migrationApplied } as unknown as T], rowCount: 1 }
      }
      throw new Error(`unexpected query in health pool: ${text}`)
    },
    async connect() {
      throw new Error('connect should not be used by health contract')
    },
  }
  return { pool, calls }
}

function makeUnreachableHealthPool() {
  const pool: PgPoolLike = {
    async query<T extends Record<string, unknown> = Record<string, unknown>>(): Promise<{
      rows: T[]
      rowCount: number | null
    }> {
      throw new Error('postgres_unreachable')
    },
    async connect() {
      throw new Error('connect should not be used by health contract')
    },
  }
  return pool
}

async function assertPostgresStoreHealth() {
  const migrated = makeHealthPool(true)
  const migratedHealth = await new AiPlayerProviderPostgresGatewayStore(migrated.pool).health()
  assert.equal(migratedHealth.ok, true)
  assert.equal(migratedHealth.backend, 'postgres')
  assert.equal(migratedHealth.databaseReachable, true)
  assert.equal(migratedHealth.migrationApplied, true)
  assert.equal(migratedHealth.migrationId, AI_PLAYER_PROVIDER_POSTGRES_GATEWAY_MIGRATION_ID)
  assert.equal(migrated.calls.length, 2)

  const missingMigration = makeHealthPool(false)
  const missingHealth = await new AiPlayerProviderPostgresGatewayStore(missingMigration.pool).health()
  assert.equal(missingHealth.ok, false)
  assert.equal(missingHealth.databaseReachable, true)
  assert.equal(missingHealth.migrationApplied, false)
  assert.equal(missingHealth.migrationId, AI_PLAYER_PROVIDER_POSTGRES_GATEWAY_MIGRATION_ID)

  const unreachableHealth = await new AiPlayerProviderPostgresGatewayStore(makeUnreachableHealthPool()).health()
  assert.equal(unreachableHealth.ok, false)
  assert.equal(unreachableHealth.databaseReachable, false)
  assert.equal(unreachableHealth.migrationApplied, false)
  assert.equal(unreachableHealth.error, 'postgres_unreachable')
}

function makeFakeStore() {
  const responses = new Map<string, Record<string, unknown>>()
  const calls = {
    ingest: [] as IngestInput[],
    reserve: [] as ReserveInput[],
    commit: [] as CommitInput[],
    release: [] as ReleaseInput[],
  }

  function remember<TInput extends IdempotentInput>(
    bucket: TInput[],
    input: TInput,
    build: () => Record<string, unknown>,
  ) {
    const existing = responses.get(input.idempotencyKey)
    if (existing) {
      if (existing.requestHash !== input.requestHash) {
        return { ok: false, error: 'idempotency_key_reused_with_different_payload' }
      }
      return { ...existing, deduped: true }
    }
    bucket.push(input)
    const response = { ...build(), requestHash: input.requestHash }
    responses.set(input.idempotencyKey, response)
    return response
  }

  const store: GatewayStoreForTest = {
    async health() {
      return { ok: true, backend: 'fake-postgres' }
    },
    async ingestLedgerAudit(input) {
      if (input.idempotencyKey === 'ingest-in-progress-key') {
        throw new Error('idempotency_key_in_progress')
      }
      return remember(calls.ingest, input, () => ({
        ok: true,
        ledgerInserted: input.payload.billingLedgerEntries.length,
        auditInserted: input.payload.auditEvents.length,
      }))
    },
    async reserveBudget(input) {
      if (input.idempotencyKey === 'budget-reservation-conflict-key') {
        throw new Error('budget_reservation_id_conflict')
      }
      return remember(calls.reserve, input, () => {
        const reserve = input.payload.reserve ?? {}
        return {
          ok: true,
          reservationId: input.payload.reservationId,
          budgetWindowKey: reserve.budgetWindowKey,
          budgetTier: reserve.budgetTier,
          limitMode: 'configured',
          window: {
            budgetWindowKey: reserve.budgetWindowKey,
            billingAccountType: reserve.billingAccountType,
            billingAccountId: reserve.billingAccountId,
            budgetTier: reserve.budgetTier,
            windowStartedAt: reserve.windowStartedAt,
            windowEndsAt: reserve.windowEndsAt,
            limitMode: 'configured',
            maxRuns: reserve.maxRuns,
            maxPromptTokens: reserve.maxPromptTokens,
            maxCompletionTokens: reserve.maxCompletionTokens,
            maxTotalTokens: reserve.maxTotalTokens,
            maxEstimatedCostUsd: reserve.maxEstimatedCostUsd,
            reservedRuns: 1,
            consumedRuns: 0,
            deniedRuns: 0,
            consumedPromptTokens: 0,
            consumedCompletionTokens: 0,
            consumedTotalTokens: 0,
            consumedEstimatedCostUsd: 0,
            updatedAt: new Date(0).toISOString(),
          },
        }
      })
    },
    async commitBudget(input) {
      if (input.idempotencyKey === 'budget-reservation-missing-key') {
        throw new Error('budget_reservation_not_found')
      }
      return remember(calls.commit, input, () => ({
        ok: true,
        reservationId: input.payload.reservationId,
      }))
    },
    async releaseBudget(input) {
      return remember(calls.release, input, () => ({
        ok: true,
        reservationId: input.payload.reservationId,
      }))
    },
  }

  return { store, calls }
}

async function startGateway(store: GatewayStoreForTest, maxBodyBytes?: number) {
  const port = await getAvailablePort()
  const server = createServer(createAiPlayerProviderPostgresGatewayHandler(store, {
    ledgerAuditHmacSecret: LEDGER_HMAC_SECRET,
    budgetGateHmacSecret: BUDGET_HMAC_SECRET,
    maxBodyBytes,
  }))
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve())
  })
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    stop: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  }
}

async function postJson(
  baseUrl: string,
  path: string,
  payload: unknown,
  idempotencyKey: string,
  secret: string,
  signatureOverride?: string,
  signatureAlgOverride?: string,
) {
  const body = JSON.stringify(payload)
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-idempotency-key': idempotencyKey,
      'x-signature-alg': signatureAlgOverride ?? 'hmac-sha256',
      'x-signature': signatureOverride ?? sign(body, secret),
    },
    body,
  })
  const text = await response.text()
  return {
    status: response.status,
    data: text ? JSON.parse(text) as Record<string, unknown> : {},
  }
}

async function postRaw(
  baseUrl: string,
  path: string,
  body: string,
  idempotencyKey: string,
  secret: string,
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-idempotency-key': idempotencyKey,
      'x-signature-alg': 'hmac-sha256',
      'x-signature': sign(body, secret),
    },
    body,
  })
  const text = await response.text()
  return {
    status: response.status,
    data: text ? JSON.parse(text) as Record<string, unknown> : {},
  }
}

function buildIngestPayload() {
  const createdAt = new Date(0).toISOString()
  return {
    schemaVersion: 1,
    source: 'ai-player-provider-account-store',
    sentAt: createdAt,
    billingLedgerEntries: [
      {
        ledgerEntryId: 'ledger_postgres_gateway_contract',
        requestId: 'provider_req_postgres_gateway_contract',
        aiPlayerId: 'ai_provider_gateway_contract',
        factionId: 'player',
        governorPlayerId: 'human_alpha',
        billingAccountType: 'player_byok',
        billingAccountId: 'human_alpha',
        providerSource: 'player_config',
        byokSource: 'player_config',
        model: 'player/postgres-gateway-contract-model',
        provider: 'openai-compatible',
        budgetTier: 'strict_action',
        budgetWindowKey: 'provider_budget:player_byok:human_alpha:strict_action:0',
        budgetReservationId: 'budget_res_postgres_gateway_contract',
        usage: {
          promptTokens: 5,
          completionTokens: 7,
          totalTokens: 12,
          estimatedCostUsd: 0,
        },
        queueRunId: 'queue_run_postgres_gateway_contract',
        idempotencyKey: 'idempotency_postgres_gateway_contract',
        createdAt,
      },
    ],
    auditEvents: [
      {
        eventId: 'audit_postgres_gateway_contract',
        eventType: 'provider_request_succeeded',
        requestId: 'provider_req_postgres_gateway_contract',
        aiPlayerId: 'ai_provider_gateway_contract',
        factionId: 'player',
        governorPlayerId: 'human_alpha',
        providerSource: 'player_config',
        byokSource: 'player_config',
        model: 'player/postgres-gateway-contract-model',
        provider: 'openai-compatible',
        keyFingerprint: 'sha256:postgres-gateway-contract',
        reason: 'provider_request_succeeded',
        queueRunId: 'queue_run_postgres_gateway_contract',
        idempotencyKey: 'idempotency_postgres_gateway_contract',
        metadata: { budgetTier: 'strict_action' },
        createdAt,
      },
    ],
  }
}

function buildBudgetPayload(operation: 'reserve' | 'commit' | 'release') {
  const now = new Date(0).toISOString()
  const reservationId = 'budget_res_postgres_gateway_contract'
  return {
    schemaVersion: 1,
    source: 'ai-player-provider-account-store',
    operation,
    sentAt: now,
    reservationId,
    reserve: operation === 'reserve'
      ? {
          aiPlayerId: 'ai_provider_gateway_contract',
          factionId: 'player',
          governorPlayerId: 'human_alpha',
          model: 'player/postgres-gateway-contract-model',
          provider: 'openai-compatible',
          source: 'player_config',
          byokSource: 'player_config',
          budgetTier: 'strict_action',
          billingAccountType: 'player_byok',
          billingAccountId: 'human_alpha',
          budgetWindowKey: 'provider_budget:player_byok:human_alpha:strict_action:0',
          windowStartedAt: now,
          windowEndsAt: new Date(60_000).toISOString(),
          localLimitMode: 'configured',
          maxRuns: 1,
          maxPromptTokens: null,
          maxCompletionTokens: null,
          maxTotalTokens: 500,
          maxEstimatedCostUsd: null,
          expiresAt: new Date(30_000).toISOString(),
          queueRunId: 'queue_run_postgres_gateway_contract',
          idempotencyKey: 'idempotency_postgres_gateway_contract',
        }
      : undefined,
    commit: operation === 'commit'
      ? {
          ok: true,
          usage: {
            promptTokens: 5,
            completionTokens: 7,
            totalTokens: 12,
            estimatedCostUsd: 0,
          },
        }
      : undefined,
  }
}

async function run() {
  assertMigrationSql()
  await assertPostgresStoreHealth()
  const { store, calls } = makeFakeStore()
  const gateway = await startGateway(store)
  try {
    const health = await fetch(`${gateway.baseUrl}/health`)
    assert.equal(health.status, 200)
    const healthPayload = await health.json() as Record<string, unknown>
    assert.equal(healthPayload.backend, 'fake-postgres')
    assert.equal(healthPayload.ok, true)

    const ingestPayload = buildIngestPayload()
    const firstIngest = await postJson(gateway.baseUrl, '/ingest', ingestPayload, 'ingest-key-1', LEDGER_HMAC_SECRET)
    assert.equal(firstIngest.status, 200, `ingest failed: ${JSON.stringify(firstIngest.data)}`)
    assert.equal(firstIngest.data.ok, true)
    assert.equal(firstIngest.data.ledgerInserted, 1)
    assert.equal(firstIngest.data.auditInserted, 1)
    assert.equal(calls.ingest.length, 1)

    const replayIngest = await postJson(gateway.baseUrl, '/ingest', ingestPayload, 'ingest-key-1', LEDGER_HMAC_SECRET)
    assert.equal(replayIngest.status, 200)
    assert.equal(replayIngest.data.deduped, true)
    assert.equal(calls.ingest.length, 1)

    const badSignature = await postJson(gateway.baseUrl, '/ingest', ingestPayload, 'ingest-key-2', LEDGER_HMAC_SECRET, 'bad')
    assert.equal(badSignature.status, 401)
    assert.equal(calls.ingest.length, 1)

    const badSignatureAlg = await postJson(
      gateway.baseUrl,
      '/ingest',
      ingestPayload,
      'ingest-key-3',
      LEDGER_HMAC_SECRET,
      undefined,
      'sha256',
    )
    assert.equal(badSignatureAlg.status, 401)
    assert.equal(calls.ingest.length, 1)

    const missingIdempotency = await fetch(`${gateway.baseUrl}/ingest`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-signature-alg': 'hmac-sha256',
        'x-signature': sign(JSON.stringify(ingestPayload), LEDGER_HMAC_SECRET),
      },
      body: JSON.stringify(ingestPayload),
    })
    assert.equal(missingIdempotency.status, 400)

    const longIdempotency = await postJson(
      gateway.baseUrl,
      '/ingest',
      ingestPayload,
      'x'.repeat(161),
      LEDGER_HMAC_SECRET,
    )
    assert.equal(longIdempotency.status, 400)
    assert.equal(longIdempotency.data.error, 'idempotency_key_too_long')

    const inProgress = await postJson(
      gateway.baseUrl,
      '/ingest',
      ingestPayload,
      'ingest-in-progress-key',
      LEDGER_HMAC_SECRET,
    )
    assert.equal(inProgress.status, 409)
    assert.equal(inProgress.data.error, 'idempotency_key_in_progress')

    const malformedJson = await postRaw(gateway.baseUrl, '/ingest', '{"schemaVersion":', 'ingest-malformed-json', LEDGER_HMAC_SECRET)
    assert.equal(malformedJson.status, 400)
    assert.equal(malformedJson.data.error, 'invalid_json')

    const contractMismatch = await postJson(
      gateway.baseUrl,
      '/ingest',
      { ...ingestPayload, schemaVersion: 2 },
      'ingest-contract-mismatch',
      LEDGER_HMAC_SECRET,
    )
    assert.equal(contractMismatch.status, 400)
    assert.equal(contractMismatch.data.error, 'provider_ingest_contract_mismatch')

    const reserve = await postJson(
      gateway.baseUrl,
      '/budget-gate',
      buildBudgetPayload('reserve'),
      'budget-reserve-key-1',
      BUDGET_HMAC_SECRET,
    )
    assert.equal(reserve.status, 200, `reserve failed: ${JSON.stringify(reserve.data)}`)
    assert.equal(reserve.data.ok, true)
    assert.equal(reserve.data.reservationId, 'budget_res_postgres_gateway_contract')
    assert.equal(calls.reserve.length, 1)

    const reservationConflict = await postJson(
      gateway.baseUrl,
      '/budget-gate',
      buildBudgetPayload('reserve'),
      'budget-reservation-conflict-key',
      BUDGET_HMAC_SECRET,
    )
    assert.equal(reservationConflict.status, 409)
    assert.equal(reservationConflict.data.error, 'budget_reservation_id_conflict')

    const badBudgetOperation = await postJson(
      gateway.baseUrl,
      '/budget-gate',
      { ...buildBudgetPayload('reserve'), operation: 'unknown' },
      'budget-bad-operation-key',
      BUDGET_HMAC_SECRET,
    )
    assert.equal(badBudgetOperation.status, 400)
    assert.equal(badBudgetOperation.data.error, 'budget_gate_operation_required')

    const commit = await postJson(
      gateway.baseUrl,
      '/budget-gate',
      buildBudgetPayload('commit'),
      'budget-commit-key-1',
      BUDGET_HMAC_SECRET,
    )
    assert.equal(commit.status, 200, `commit failed: ${JSON.stringify(commit.data)}`)
    assert.equal(commit.data.ok, true)
    assert.equal(calls.commit.length, 1)

    const missingReservation = await postJson(
      gateway.baseUrl,
      '/budget-gate',
      buildBudgetPayload('commit'),
      'budget-reservation-missing-key',
      BUDGET_HMAC_SECRET,
    )
    assert.equal(missingReservation.status, 409)
    assert.equal(missingReservation.data.error, 'budget_reservation_not_found')

    const release = await postJson(
      gateway.baseUrl,
      '/budget-gate',
      buildBudgetPayload('release'),
      'budget-release-key-1',
      BUDGET_HMAC_SECRET,
    )
    assert.equal(release.status, 200, `release failed: ${JSON.stringify(release.data)}`)
    assert.equal(release.data.ok, true)
    assert.equal(calls.release.length, 1)

    const serialized = JSON.stringify({ ingestPayload, reserve: reserve.data, commit: commit.data, release: release.data })
    assert.equal(serialized.includes('apiKeys'), false)
    assert.equal(serialized.includes('Bearer '), false)

    const smallGateway = await startGateway(store, 8)
    try {
      const tooLarge = await postRaw(smallGateway.baseUrl, '/ingest', JSON.stringify(ingestPayload), 'ingest-too-large', LEDGER_HMAC_SECRET)
      assert.equal(tooLarge.status, 413)
      assert.equal(tooLarge.data.error, 'request_body_too_large')
    } finally {
      await smallGateway.stop()
    }

    console.log('[ai_player_provider_postgres_gateway_contract] all checks passed')
  } finally {
    await gateway.stop()
  }
}

run().catch((error) => {
  console.error('[ai_player_provider_postgres_gateway_contract] failed:', error)
  process.exitCode = 1
})
