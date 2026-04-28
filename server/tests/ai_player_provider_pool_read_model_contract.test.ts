import assert from 'node:assert/strict'
import {
  governedAiPlayerRuntimeDetailSchema,
  listGovernedAiPlayersResponseSchema,
} from '../../shared/schemas/aiPlayer'
import {
  AI_PLAYER_ID,
  joinGovernor,
  registerDefaultAiPlayer,
  startAiPlayerHttpBackend,
} from './helpers/aiPlayerHttpContractHarness'
import { readArray, readObject, requestJson } from './helpers/backendHarness'

const ENV_SECRET_VALUE = 'provider-pool-read-model-env-token'
const FACTION_SECRET_VALUE = 'provider-pool-read-model-faction-token'

async function run() {
  const backend = await startAiPlayerHttpBackend(
    'ai_player_provider_pool_read_model_contract',
    undefined,
    {
      AI_PLAYER_RUNTIME_MODEL_BASE_URL: 'https://provider-a.example',
      AI_PLAYER_RUNTIME_MODEL: 'provider-a/strict-json-model',
      AI_PLAYER_RUNTIME_MODEL_API_KEY: ENV_SECRET_VALUE,
    },
  )

  try {
    await joinGovernor(backend.baseUrl)
    const saveModelConfig = await requestJson(backend.baseUrl, '/api/faction/player/model-config', 'POST', {
      model: 'faction/base-model',
      commanderModel: 'faction/strict-json-model',
      baseUrl: 'https://faction-provider.example',
      apiKey: FACTION_SECRET_VALUE,
    })
    assert.equal(saveModelConfig.status, 200, `save faction model-config failed: ${JSON.stringify(saveModelConfig.data)}`)
    await registerDefaultAiPlayer(backend.baseUrl)

    const list = await requestJson(backend.baseUrl, '/api/ai/players', 'GET')
    assert.equal(list.status, 200, `list ai players failed: ${JSON.stringify(list.data)}`)
    listGovernedAiPlayersResponseSchema.parse(list.data)
    const players = readArray(readObject(list.data).items)
    const runtime = readObject(players.find((item) => readObject(item).aiPlayerId === AI_PLAYER_ID))
    assert.equal(runtime.modelName, 'faction/strict-json-model')
    assert.equal(runtime.modelSource, 'env')

    const modelStatus = readObject(runtime.modelStatus)
    assert.equal(modelStatus.activeModel, 'faction/strict-json-model')
    assert.equal(modelStatus.activeProvider, 'faction-provider.example')
    assert.equal(modelStatus.source, 'faction_config')
    assert.equal(modelStatus.strictJsonOnlyCapable, true)
    assert.equal(modelStatus.budgetTier, 'strict_action')
    assert.equal(modelStatus.fallbackEnabled, true)
    assert.equal(modelStatus.fallbackModel, 'provider-a/strict-json-model')
    assert.equal(modelStatus.lastFallbackReason, null)
    assert.equal(modelStatus.secretConfigured, true)
    assert.equal(modelStatus.secretSource, 'faction_config:byok')
    assert.equal(modelStatus.byokSource, 'faction_config')
    const targetCount = Number(modelStatus.targetCount)
    assert.equal(targetCount >= 3, true)
    const candidates = readArray(modelStatus.candidateTargets)
    assert.equal(candidates.length, targetCount)
    const factionCandidate = readObject(candidates.find((candidate) => readObject(candidate).source === 'faction_config'))
    assert.equal(factionCandidate.model, 'faction/strict-json-model')
    assert.equal(factionCandidate.provider, 'faction-provider.example')
    assert.equal(factionCandidate.source, 'faction_config')
    assert.equal(factionCandidate.byokSource, 'faction_config')
    assert.equal(factionCandidate.priority, 0)
    assert.equal(factionCandidate.isActive, true)
    assert.equal(factionCandidate.fallbackCandidate, false)
    assert.equal(factionCandidate.strictJsonOnlyCapable, true)
    assert.equal(factionCandidate.budgetTier, 'strict_action')
    assert.equal(factionCandidate.lastFailureReason, null)
    assert.equal(factionCandidate.secretConfigured, true)
    assert.equal(factionCandidate.secretSource, 'faction_config:byok')
    const envCandidate = readObject(candidates.find((candidate) => readObject(candidate).model === 'provider-a/strict-json-model'))
    assert.equal(envCandidate.model, 'provider-a/strict-json-model')
    assert.equal(envCandidate.provider, 'provider-a.example')
    assert.equal(envCandidate.source, 'env')
    assert.equal(envCandidate.byokSource, 'none')
    assert.equal(envCandidate.fallbackCandidate, true)
    assert.equal(envCandidate.secretConfigured, true)
    assert.equal(envCandidate.secretSource, 'AI_PLAYER_RUNTIME_MODEL_API_KEY')
    const defaultCandidate = readObject(candidates.find((candidate) => readObject(candidate).source === 'default'))
    assert.equal(defaultCandidate.model, 'claude-sonnet-4-6')
    assert.equal(defaultCandidate.provider, 'xiamiapi.xyz')
    assert.equal(defaultCandidate.source, 'default')
    assert.equal(defaultCandidate.secretConfigured, false)

    const detail = await requestJson(backend.baseUrl, `/api/ai/players/${AI_PLAYER_ID}`, 'GET')
    assert.equal(detail.status, 200, `get ai player runtime detail failed: ${JSON.stringify(detail.data)}`)
    governedAiPlayerRuntimeDetailSchema.parse(detail.data)
    assert.deepEqual(readObject(readObject(detail.data).modelStatus), modelStatus)

    const serializedPayload = JSON.stringify({ list: list.data, detail: detail.data })
    assert.equal(serializedPayload.includes(ENV_SECRET_VALUE), false, 'runtime read-model must not expose env secret value')
    assert.equal(serializedPayload.includes(FACTION_SECRET_VALUE), false, 'runtime read-model must not expose faction BYOK secret value')
    assert.equal(serializedPayload.includes('apiKeys'), false, 'runtime read-model must not expose raw apiKeys')

    console.log('[ai_player_provider_pool_read_model_contract] all checks passed')
  } finally {
    await backend.stop()
  }
}

run().catch((error) => {
  console.error('[ai_player_provider_pool_read_model_contract] failed:', error)
  process.exitCode = 1
})
