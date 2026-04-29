import assert from 'node:assert/strict'
import { createServer, type IncomingMessage } from 'node:http'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createInitialWorldState } from '../../shared/domain/scenario'
import {
  aiPlayerProviderPlayerKeyMutationResponseSchema,
  listAiPlayerProviderAuditEventsResponseSchema,
  listAiPlayerProviderBillingLedgerResponseSchema,
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

const AI_PLAYER_ID = 'provider_accounting_ai'
const FACTION_ID = 'player'
const GOVERNOR_PLAYER_ID = 'human_alpha'
const PLAYER_MODEL = 'player/strict-json-model'
const PLAYER_SECRET = 'provider-accounting-player-key-fixture'
const ENCRYPTION_KEY = 'provider-accounting-encryption-key-fixture'
const MODEL_OUTPUT = {
  summary: 'claim the available reward through player-level BYOK',
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

function seedWorldState() {
  const world = createInitialWorldState()
  const faction = world.factions[FACTION_ID]
  assert.ok(faction, `missing faction ${FACTION_ID} while seeding provider accounting shard`)
  faction.aiPlayers = [
    {
      id: AI_PLAYER_ID,
      name: 'Provider Accounting AI',
      factionId: FACTION_ID,
      unitIds: [],
      specialty: 'logistics',
    },
  ]

  const path = buildSessionPersistPath('ai_player_provider_accounting_world_state')
  writeFileSync(path, `${JSON.stringify(world)}\n`, 'utf-8')
  return path
}

async function readRequestBody(req: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf-8')
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
        usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
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

async function waitForPersistedFile(
  path: string,
  predicate: (raw: string) => boolean,
  timeoutMs = 10_000,
): Promise<string> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (existsSync(path)) {
      const raw = readFileSync(path, 'utf8')
      if (predicate(raw)) {
        return raw
      }
    }
    await sleep(250)
  }

  throw new Error(`persisted provider account store did not match within ${timeoutMs}ms: ${path}`)
}

function assertNoSecretLeak(value: unknown) {
  const serialized = JSON.stringify(value)
  assert.equal(serialized.includes(PLAYER_SECRET), false, `player key leaked through payload: ${serialized}`)
  assert.equal(serialized.includes(`Bearer ${PLAYER_SECRET}`), false, 'authorization header leaked through payload')
}

async function run() {
  const relay = await startRelayProbe()
  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const providerAccountStorePath = buildSessionPersistPath('ai_player_provider_accounting_store')
  const tail: TailState = { stdout: [], stderr: [] }
  const child = spawnBackend(port, tail, {
    AI_PLAYER_PROVIDER_ACCOUNT_STORE_PATH: providerAccountStorePath,
    AI_PLAYER_GOVERNANCE_STATE_PATH: buildSessionPersistPath('ai_player_provider_accounting_governance_state'),
    SESSION_STATE_PERSIST_PATH: buildSessionPersistPath('ai_player_provider_accounting_session_state'),
    WORLD_STATE_PERSIST_PATH: seedWorldState(),
    FACTION_CONFIG_STORE_PATH: buildSessionPersistPath('ai_player_provider_accounting_faction_config'),
    FACTION_APIKEY_ENCRYPTION_KEY: ENCRYPTION_KEY,
    AI_PLAYER_RUNTIME_MODEL_BASE_URL: '',
    AI_PLAYER_RUNTIME_MODEL_API_KEY: '',
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
    aiPlayerProviderPlayerKeyMutationResponseSchema.parse(savePlayerKey.data)
    const savedKey = readObject(readObject(savePlayerKey.data).key)
    assert.equal(savedKey.ownerPlayerId, GOVERNOR_PLAYER_ID)
    assert.equal(savedKey.model, PLAYER_MODEL)
    assert.equal(savedKey.status, 'active')
    assert.equal(savedKey.secretConfigured, true)
    assert.equal(savedKey.secretSource, 'player_config:byok')
    assert.equal(savedKey.byokSource, 'player_config')
    assert.match(String(savedKey.keyFingerprint), /^sha256:/)
    assertNoSecretLeak(savePlayerKey.data)

    const persisted = await waitForPersistedFile(
      providerAccountStorePath,
      (raw) => raw.includes('enc:v1:') && raw.includes(PLAYER_MODEL),
    )
    assert.equal(persisted.includes(PLAYER_SECRET), false, 'persisted provider account store must not contain plaintext player apiKey')
    assert.equal(persisted.includes(ENCRYPTION_KEY), false, 'persisted provider account store must not contain encryption key')

    const register = await requestJson(baseUrl, '/api/ai/players', 'POST', {
      aiPlayerId: AI_PLAYER_ID,
      displayName: 'Provider Accounting AI',
      governorPlayerId: GOVERNOR_PLAYER_ID,
      factionId: FACTION_ID,
      actionWhitelist: ['reward_claim'],
    })
    assert.equal(register.status, 200, `register failed: ${JSON.stringify(register.data)}`)

    const runtimeBefore = await requestJson(baseUrl, `/api/ai/players/${AI_PLAYER_ID}`, 'GET')
    assert.equal(runtimeBefore.status, 200, `runtime read failed: ${JSON.stringify(runtimeBefore.data)}`)
    const modelStatusBefore = readObject(readObject(runtimeBefore.data).modelStatus)
    assert.equal(modelStatusBefore.source, 'player_config')
    assert.equal(modelStatusBefore.byokSource, 'player_config')
    assert.equal(modelStatusBefore.secretSource, 'player_config:byok')
    const playerCandidate = readObject(readArray(modelStatusBefore.candidateTargets)[0])
    assert.equal(playerCandidate.source, 'player_config')
    assert.equal(playerCandidate.byokSource, 'player_config')
    assert.equal(playerCandidate.priority, 0)
    assert.equal(playerCandidate.secretConfigured, true)
    assertNoSecretLeak(runtimeBefore.data)

    const modelProposals = await requestJson(baseUrl, `/api/ai/players/${AI_PLAYER_ID}/model-proposals`, 'POST')
    assert.equal(modelProposals.status, 200, `model proposal route failed: ${JSON.stringify(modelProposals.data)}`)
    const modelProposalPayload = readObject(modelProposals.data)
    assert.equal(modelProposalPayload.ok, true)
    assert.equal(modelProposalPayload.model, PLAYER_MODEL)
    assert.equal(relay.probes.length, 1)
    assert.equal(relay.probes[0].path, '/v1/chat/completions')
    assert.equal(relay.probes[0].model, PLAYER_MODEL)
    assert.equal(relay.probes[0].authorization, `Bearer ${PLAYER_SECRET}`)
    const providerFallback = readObject(modelProposalPayload.providerFallback)
    assert.match(String(providerFallback.requestId), /^provider_req_/)
    assert.equal(readObject(providerFallback.selectedProvider).source, 'player_config')
    assert.equal(readObject(providerFallback.selectedProvider).byokSource, 'player_config')
    assert.equal(providerFallback.failureCount, 0)
    assertNoSecretLeak(modelProposals.data)

    const ledger = await requestJson(baseUrl, '/api/ai/provider/billing-ledger?limit=10', 'GET')
    assert.equal(ledger.status, 200, `billing ledger read failed: ${JSON.stringify(ledger.data)}`)
    listAiPlayerProviderBillingLedgerResponseSchema.parse(ledger.data)
    const ledgerItems = readArray(readObject(ledger.data).items)
    assert.equal(ledgerItems.length, 1)
    const ledgerEntry = readObject(ledgerItems[0])
    assert.equal(ledgerEntry.aiPlayerId, AI_PLAYER_ID)
    assert.equal(ledgerEntry.factionId, FACTION_ID)
    assert.equal(ledgerEntry.governorPlayerId, GOVERNOR_PLAYER_ID)
    assert.equal(ledgerEntry.billingAccountType, 'player_byok')
    assert.equal(ledgerEntry.billingAccountId, GOVERNOR_PLAYER_ID)
    assert.equal(ledgerEntry.providerSource, 'player_config')
    assert.equal(ledgerEntry.byokSource, 'player_config')
    assert.equal(ledgerEntry.model, PLAYER_MODEL)
    assert.equal(readObject(ledgerEntry.usage).promptTokens, 3)
    assert.equal(readObject(ledgerEntry.usage).completionTokens, 4)
    assert.equal(readObject(ledgerEntry.usage).totalTokens, 7)
    assertNoSecretLeak(ledger.data)

    const auditBeforeDelete = await requestJson(baseUrl, '/api/ai/provider/audit-events?limit=20', 'GET')
    assert.equal(auditBeforeDelete.status, 200, `audit event read failed: ${JSON.stringify(auditBeforeDelete.data)}`)
    listAiPlayerProviderAuditEventsResponseSchema.parse(auditBeforeDelete.data)
    const auditEvents = readArray(readObject(auditBeforeDelete.data).items)
    assert.equal(auditEvents.some((item) => readObject(item).eventType === 'byok_key_configured'), true)
    assert.equal(auditEvents.some((item) => readObject(item).eventType === 'provider_request_succeeded'), true)
    assertNoSecretLeak(auditBeforeDelete.data)

    const revoke = await requestJson(
      baseUrl,
      `/api/ai/provider/player-keys/${GOVERNOR_PLAYER_ID}?actorId=${GOVERNOR_PLAYER_ID}`,
      'DELETE',
    )
    assert.equal(revoke.status, 200, `player key revoke failed: ${JSON.stringify(revoke.data)}`)
    aiPlayerProviderPlayerKeyMutationResponseSchema.parse(revoke.data)
    const revokedKey = readObject(readObject(revoke.data).key)
    assert.equal(revokedKey.status, 'revoked')
    assert.equal(revokedKey.secretConfigured, false)
    assert.equal(revokedKey.secretSource, null)
    assertNoSecretLeak(revoke.data)

    const runtimeAfterRevoke = await requestJson(baseUrl, `/api/ai/players/${AI_PLAYER_ID}`, 'GET')
    assert.equal(runtimeAfterRevoke.status, 200, `runtime read after revoke failed: ${JSON.stringify(runtimeAfterRevoke.data)}`)
    const modelStatusAfter = readObject(readObject(runtimeAfterRevoke.data).modelStatus)
    assert.notEqual(modelStatusAfter.source, 'player_config')
    assert.equal(readArray(modelStatusAfter.candidateTargets).some((item) => readObject(item).source === 'player_config'), false)

    const auditAfterDelete = await requestJson(baseUrl, '/api/ai/provider/audit-events?limit=20', 'GET')
    assert.equal(auditAfterDelete.status, 200, `audit event read after delete failed: ${JSON.stringify(auditAfterDelete.data)}`)
    const auditAfterDeleteItems = readArray(readObject(auditAfterDelete.data).items)
    assert.equal(auditAfterDeleteItems.some((item) => readObject(item).eventType === 'byok_key_revoked'), true)
    assertNoSecretLeak(auditAfterDelete.data)

    console.log('[ai_player_provider_accounting_contract] all checks passed')
  } finally {
    await shutdownChild(child)
    await relay.stop()
  }
}

run().catch((error) => {
  console.error('[ai_player_provider_accounting_contract] failed:', error)
  process.exitCode = 1
})
