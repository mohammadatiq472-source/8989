import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
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

const FACTION_ID = 'player'
const TEST_MODEL = 'claude-haiku-4-5-20251001'
const TEST_BASE_URL = 'https://xiamiapi.xyz'
const TEST_API_KEY = 'test-byok-secret-never-persist-plain'
const TEST_ENCRYPTION_KEY = 'test-faction-apikey-encryption-key-do-not-use'
const LEGACY_PLAINTEXT_KEY = 'legacy-plaintext-key-should-be-dropped'

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

  throw new Error(`persisted faction config did not match within ${timeoutMs}ms: ${path}`)
}

function assertNoSecretLeak(value: unknown, secret: string) {
  const serialized = JSON.stringify(value)
  assert.ok(!serialized.includes(secret), `secret leaked through response payload: ${serialized}`)
}

async function spawnFactionBackend(
  prefix: string,
  env: NodeJS.ProcessEnv,
): Promise<{
  baseUrl: string
  tail: TailState
  child: ReturnType<typeof spawnBackend>
}> {
  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const tail: TailState = { stdout: [], stderr: [] }
  const child = spawnBackend(port, tail, {
    WORLD_STATE_PERSIST_PATH: buildSessionPersistPath(`${prefix}_world_state`),
    SESSION_STATE_PERSIST_PATH: buildSessionPersistPath(`${prefix}_session_state`),
    AI_PLAYER_GOVERNANCE_STATE_PATH: buildSessionPersistPath(`${prefix}_governance_state`),
    ...env,
  })

  const health = await waitForHealth(baseUrl)
  assert.ok(health, `backend did not become healthy\nstdout=${tail.stdout.join('\n')}\nstderr=${tail.stderr.join('\n')}`)
  return { baseUrl, tail, child }
}

function assertEncryptedPersistenceHealth(payload: unknown) {
  const healthPayload = readObject(payload)
  const persistence = readObject(healthPayload.persistence)
  const factionConfig = readObject(persistence.factionConfig)
  const security = readObject(factionConfig.security)
  assert.equal(security.secretPersistMode, 'encrypted')
  assert.equal(security.encryptionKeyConfigured, true)
  assert.equal(security.allowPlaintextPersist, false)

  const alerts = readArray(persistence.alerts)
  assert.equal(
    alerts.some((item) => readObject(item).code === 'missing_encryption_key'),
    false,
    'encrypted BYOK mode should not raise missing_encryption_key',
  )
}

async function testEncryptedByokRoundTrip() {
  const factionStorePath = buildSessionPersistPath('faction_config_byok_contract')
  let backend = await spawnFactionBackend('faction_config_byok_contract_initial', {
    FACTION_CONFIG_STORE_PATH: factionStorePath,
    FACTION_APIKEY_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
    FACTION_APIKEY_ALLOW_PLAINTEXT_PERSIST: '',
  })

  try {
    const initialHealth = await requestJson(backend.baseUrl, '/api/health', 'GET')
    assert.equal(initialHealth.status, 200, `health failed: ${JSON.stringify(initialHealth.data)}`)
    assertEncryptedPersistenceHealth(initialHealth.data)

    const saved = await requestJson(backend.baseUrl, `/api/faction/${FACTION_ID}/model-config`, 'POST', {
      model: TEST_MODEL,
      baseUrl: TEST_BASE_URL,
      apiKey: TEST_API_KEY,
      commanderModel: TEST_MODEL,
    })
    assert.equal(saved.status, 200, `model-config save failed: ${JSON.stringify(saved.data)}`)

    const config = await requestJson(backend.baseUrl, `/api/faction/${FACTION_ID}/config`, 'GET')
    assert.equal(config.status, 200, `config read failed: ${JSON.stringify(config.data)}`)
    const configPayload = readObject(config.data)
    const modelConfig = readObject(configPayload.modelConfig)
    assert.equal(modelConfig.model, TEST_MODEL)
    assert.equal(modelConfig.baseUrl, TEST_BASE_URL)
    assert.equal(modelConfig.hasApiKey, true)
    assert.equal(Object.prototype.hasOwnProperty.call(modelConfig, 'apiKey'), false)
    assertNoSecretLeak(config.data, TEST_API_KEY)

    const persisted = await waitForPersistedFile(
      factionStorePath,
      (raw) => raw.includes('enc:v1:') && raw.includes(TEST_MODEL),
    )
    assert.ok(!persisted.includes(TEST_API_KEY), 'persisted store must not contain plaintext apiKey')
    assert.ok(!persisted.includes(TEST_ENCRYPTION_KEY), 'persisted store must not contain encryption key')
  } finally {
    await shutdownChild(backend.child)
  }

  backend = await spawnFactionBackend('faction_config_byok_contract_restart', {
    FACTION_CONFIG_STORE_PATH: factionStorePath,
    FACTION_APIKEY_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
    FACTION_APIKEY_ALLOW_PLAINTEXT_PERSIST: '',
  })

  try {
    const restartedConfig = await requestJson(backend.baseUrl, `/api/faction/${FACTION_ID}/config`, 'GET')
    assert.equal(restartedConfig.status, 200, `restarted config read failed: ${JSON.stringify(restartedConfig.data)}`)
    const restartedPayload = readObject(restartedConfig.data)
    const restartedModelConfig = readObject(restartedPayload.modelConfig)
    assert.equal(restartedModelConfig.model, TEST_MODEL)
    assert.equal(restartedModelConfig.hasApiKey, true)
    assertNoSecretLeak(restartedConfig.data, TEST_API_KEY)
  } finally {
    await shutdownChild(backend.child)
  }
}

async function testLegacyPlaintextIsNotLoadedByDefault() {
  const factionStorePath = buildSessionPersistPath('faction_config_byok_legacy_plaintext')
  mkdirSync(dirname(factionStorePath), { recursive: true })
  writeFileSync(
    factionStorePath,
    `${JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      items: [
        {
          factionId: FACTION_ID,
          modelConfig: {
            model: TEST_MODEL,
            apiKey: LEGACY_PLAINTEXT_KEY,
            baseUrl: TEST_BASE_URL,
          },
          updatedAt: Date.now(),
        },
      ],
    }, null, 2)}\n`,
    'utf8',
  )

  const backend = await spawnFactionBackend('faction_config_byok_legacy_plaintext', {
    FACTION_CONFIG_STORE_PATH: factionStorePath,
    FACTION_APIKEY_ENCRYPTION_KEY: '',
    FACTION_APIKEY_ALLOW_PLAINTEXT_PERSIST: '',
  })

  try {
    const config = await requestJson(backend.baseUrl, `/api/faction/${FACTION_ID}/config`, 'GET')
    assert.equal(config.status, 200, `legacy config read failed: ${JSON.stringify(config.data)}`)
    const configPayload = readObject(config.data)
    const modelConfig = readObject(configPayload.modelConfig)
    assert.equal(modelConfig.model, TEST_MODEL)
    assert.equal(modelConfig.hasApiKey, false)
    assertNoSecretLeak(config.data, LEGACY_PLAINTEXT_KEY)
  } finally {
    await shutdownChild(backend.child)
  }
}

async function run() {
  await testEncryptedByokRoundTrip()
  await testLegacyPlaintextIsNotLoadedByDefault()
}

void run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
