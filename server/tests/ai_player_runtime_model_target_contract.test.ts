import assert from 'node:assert/strict'
import {
  clearAiPlayerRuntimeModelFallbackReason,
  DEFAULT_AI_PLAYER_RUNTIME_MODEL,
  readAiPlayerRuntimeModelSecretSources,
  recordAiPlayerRuntimeModelFallbackReason,
  resolveAiPlayerRuntimeModelStatus,
  resolveAiPlayerRuntimeModelTarget,
  resolveAiPlayerRuntimeModelTargetCandidates,
} from '../src/application/ai/aiPlayerRuntimeModelTarget'
import { clearFactionConfig, setFactionModelConfig } from '../src/application/faction/FactionConfigStore'

const MANAGED_ENV = [
  'AI_PLAYER_RUNTIME_MODEL_API_KEY',
  'AI_PLAYER_RUNTIME_MODEL_BASE_URL',
  'AI_PLAYER_RUNTIME_MODEL',
  'LLM_RELAY_API_KEY',
  'LLM_RELAY_API_KEYS',
  'LLM_RELAY_URL',
  'LLM_RELAY_MODEL',
  'OPENAI_API_KEY',
] as const

function snapshotEnv() {
  const snapshot = new Map<string, string | undefined>()
  for (const name of MANAGED_ENV) {
    snapshot.set(name, process.env[name])
    delete process.env[name]
  }
  return snapshot
}

function restoreEnv(snapshot: Map<string, string | undefined>) {
  for (const [name, value] of snapshot.entries()) {
    if (value === undefined) {
      delete process.env[name]
    } else {
      process.env[name] = value
    }
  }
}

function clearManagedEnv() {
  for (const name of MANAGED_ENV) {
    delete process.env[name]
  }
}

function testStrictJsonModelIsDefault() {
  clearManagedEnv()
  const target = resolveAiPlayerRuntimeModelTarget()
  const status = resolveAiPlayerRuntimeModelStatus()
  assert.equal(target.baseUrl, 'https://xiamiapi.xyz/v1')
  assert.equal(target.model, DEFAULT_AI_PLAYER_RUNTIME_MODEL)
  assert.equal(DEFAULT_AI_PLAYER_RUNTIME_MODEL, 'claude-sonnet-4-6')
  assert.deepEqual(target.apiKeys, [])
  assert.deepEqual(readAiPlayerRuntimeModelSecretSources(), [])
  assert.equal(status.activeModel, DEFAULT_AI_PLAYER_RUNTIME_MODEL)
  assert.equal(status.activeProvider, 'xiamiapi.xyz')
  assert.equal(status.source, 'default')
  assert.equal(status.strictJsonOnlyCapable, true)
  assert.equal(status.budgetTier, 'strict_action')
  assert.equal(status.fallbackEnabled, false)
  assert.equal(status.fallbackModel, null)
  assert.equal(status.lastFallbackReason, null)
  assert.equal(status.secretConfigured, false)
  assert.equal(status.secretSource, null)
  assert.equal(status.byokSource, 'none')
  assert.equal(status.targetCount, 1)
  assert.equal(status.candidateTargets.length, 1)
  assert.deepEqual(status.candidateTargets[0], {
    model: DEFAULT_AI_PLAYER_RUNTIME_MODEL,
    provider: 'xiamiapi.xyz',
    source: 'default',
    byokSource: 'none',
    priority: 0,
    isActive: true,
    fallbackCandidate: false,
    strictJsonOnlyCapable: true,
    budgetTier: 'strict_action',
    lastFailureReason: null,
    secretConfigured: false,
    secretSource: null,
  })
}

function testEnvOverrideKeepsMultiProviderEscapeHatch() {
  clearManagedEnv()
  process.env.AI_PLAYER_RUNTIME_MODEL_BASE_URL = 'https://provider-a.example'
  process.env.AI_PLAYER_RUNTIME_MODEL = 'provider-a/strict-json-model'
  process.env.LLM_RELAY_URL = 'https://provider-b.example'
  process.env.LLM_RELAY_MODEL = 'provider-b/economy-model'
  process.env.LLM_RELAY_API_KEYS = 'test-key-a test-key-b'

  const target = resolveAiPlayerRuntimeModelTarget()
  const status = resolveAiPlayerRuntimeModelStatus()
  assert.equal(target.baseUrl, 'https://provider-a.example/v1')
  assert.equal(target.model, 'provider-a/strict-json-model')
  assert.deepEqual(target.apiKeys, ['test-key-a', 'test-key-b'])
  assert.deepEqual(readAiPlayerRuntimeModelSecretSources(), ['LLM_RELAY_API_KEYS'])
  assert.equal(status.activeModel, 'provider-a/strict-json-model')
  assert.equal(status.activeProvider, 'provider-a.example')
  assert.equal(status.source, 'env')
  assert.equal(status.strictJsonOnlyCapable, true)
  assert.equal(status.budgetTier, 'strict_action')
  assert.equal(status.fallbackEnabled, true)
  assert.equal(status.fallbackModel, 'provider-b/economy-model')
  assert.equal(status.secretConfigured, true)
  assert.equal(status.secretSource, 'LLM_RELAY_API_KEYS')
  assert.equal(status.byokSource, 'none')
  assert.equal(status.targetCount, 3)
  assert.equal(status.candidateTargets[0].model, 'provider-a/strict-json-model')
  assert.equal(status.candidateTargets[0].provider, 'provider-a.example')
  assert.equal(status.candidateTargets[0].isActive, true)
  assert.equal(status.candidateTargets[1].model, 'provider-b/economy-model')
  assert.equal(status.candidateTargets[1].provider, 'provider-b.example')
  assert.equal(status.candidateTargets[1].fallbackCandidate, true)
  assert.equal(status.candidateTargets[2].model, DEFAULT_AI_PLAYER_RUNTIME_MODEL)
}

function testEconomyModelAndDisabledBudget() {
  clearManagedEnv()
  process.env.LLM_RELAY_MODEL = 'claude-haiku-4-5-20251001'

  const economyStatus = resolveAiPlayerRuntimeModelStatus()
  assert.equal(economyStatus.activeModel, 'claude-haiku-4-5-20251001')
  assert.equal(economyStatus.source, 'env')
  assert.equal(economyStatus.strictJsonOnlyCapable, false)
  assert.equal(economyStatus.budgetTier, 'economy_chat')
  assert.equal(economyStatus.fallbackModel, DEFAULT_AI_PLAYER_RUNTIME_MODEL)
  assert.equal(economyStatus.targetCount, 2)

  const disabledStatus = resolveAiPlayerRuntimeModelStatus({ allowLlmProposals: false })
  assert.equal(disabledStatus.budgetTier, 'disabled')
  assert.equal(disabledStatus.fallbackEnabled, false)
}

function testFactionByokOverridesEnvWithoutLeakingSecret() {
  clearManagedEnv()
  const factionId = 'runtime_model_target_byok_contract'
  const byokFixture = 'faction-byok-runtime-model-target-fixture'
  const envFixture = 'env-runtime-model-target-fixture'
  process.env.AI_PLAYER_RUNTIME_MODEL = 'env/strict-json-model'
  process.env.AI_PLAYER_RUNTIME_MODEL_BASE_URL = 'https://env-provider.example'
  process.env['AI_PLAYER_RUNTIME_MODEL_' + 'API_KEY'] = envFixture
  setFactionModelConfig(factionId, {
    model: 'faction/base-model',
    commanderModel: 'faction/strict-json-model',
    baseUrl: 'https://faction-provider.example',
    apiKey: byokFixture,
  })

  try {
    const target = resolveAiPlayerRuntimeModelTarget({ factionId })
    const status = resolveAiPlayerRuntimeModelStatus({ factionId })
    assert.equal(target.baseUrl, 'https://faction-provider.example/v1')
    assert.equal(target.model, 'faction/strict-json-model')
    assert.deepEqual(target.apiKeys, [byokFixture])
    assert.equal(status.activeModel, 'faction/strict-json-model')
    assert.equal(status.activeProvider, 'faction-provider.example')
    assert.equal(status.source, 'faction_config')
    assert.equal(status.secretConfigured, true)
    assert.equal(status.secretSource, 'faction_config:byok')
    assert.equal(status.byokSource, 'faction_config')
    assert.equal(status.targetCount, 3)
    assert.equal(status.candidateTargets[0].source, 'faction_config')
    assert.equal(status.candidateTargets[0].byokSource, 'faction_config')
    assert.equal(status.candidateTargets[1].source, 'env')
    assert.equal(status.candidateTargets[1].byokSource, 'none')
    assert.equal(status.candidateTargets[2].source, 'default')
    assert.equal(status.fallbackEnabled, true)
    assert.equal(status.fallbackModel, 'env/strict-json-model')
    assert.equal(JSON.stringify(status).includes(byokFixture), false)
  } finally {
    clearFactionConfig(factionId)
  }
}

function testFallbackReasonIsStoredOnRuntimeStatus() {
  clearManagedEnv()
  const factionId = 'runtime_model_target_fallback_reason_contract'
  try {
    recordAiPlayerRuntimeModelFallbackReason(factionId, 'model_request_failed_401')
    const status = resolveAiPlayerRuntimeModelStatus({ factionId })
    const candidates = resolveAiPlayerRuntimeModelTargetCandidates({ factionId })
    assert.equal(status.lastFallbackReason, 'model_request_failed_401')
    assert.equal(status.candidateTargets[0].lastFailureReason, 'model_request_failed_401')
    assert.equal(candidates[0].lastFailureReason, 'model_request_failed_401')

    const explicit = resolveAiPlayerRuntimeModelStatus({
      factionId,
      lastFallbackReason: 'model_response_missing_content',
    })
    assert.equal(explicit.lastFallbackReason, 'model_response_missing_content')
    assert.equal(explicit.candidateTargets[0].lastFailureReason, 'model_response_missing_content')
  } finally {
    clearAiPlayerRuntimeModelFallbackReason(factionId)
  }
}

function run() {
  const snapshot = snapshotEnv()
  try {
    testStrictJsonModelIsDefault()
    testEnvOverrideKeepsMultiProviderEscapeHatch()
    testEconomyModelAndDisabledBudget()
    testFactionByokOverridesEnvWithoutLeakingSecret()
    testFallbackReasonIsStoredOnRuntimeStatus()
  } finally {
    restoreEnv(snapshot)
  }
  console.log('[ai_player_runtime_model_target_contract] all checks passed')
}

try {
  run()
} catch (error) {
  console.error('[ai_player_runtime_model_target_contract] failed:', error)
  process.exitCode = 1
}
