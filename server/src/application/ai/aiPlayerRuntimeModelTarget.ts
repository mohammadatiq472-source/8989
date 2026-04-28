import type { ResolvedPlannerTarget } from '../../config/modelGateway'
import type {
  AiPlayerModelByokSource,
  AiPlayerModelBudgetTier,
  AiPlayerModelRoutingSource,
  AiPlayerModelStatus,
} from '../../../../shared/contracts/aiPlayer'
import { getFactionModelConfig, type FactionModelConfig } from '../faction/FactionConfigStore'
import { getActiveAiPlayerProviderPlayerKeyModelConfig } from './aiPlayerProviderAccountStore'

const DEFAULT_RUNTIME_RELAY_BASE_URL = 'https://xiamiapi.xyz'
export const DEFAULT_AI_PLAYER_RUNTIME_MODEL = 'claude-sonnet-4-6'

const BASE_URL_ENV_PRIORITY = [
  'AI_PLAYER_RUNTIME_MODEL_BASE_URL',
  'LLM_RELAY_URL',
] as const

const MODEL_ENV_PRIORITY = [
  'AI_PLAYER_RUNTIME_MODEL',
  'LLM_RELAY_MODEL',
] as const

const SECRET_ENV_PRIORITY = [
  'AI_PLAYER_RUNTIME_MODEL_API_KEY',
  'LLM_RELAY_API_KEY',
  'LLM_RELAY_API_KEYS',
  'OPENAI_API_KEY',
] as const

type AiPlayerRuntimeModelTargetOptions = {
  factionId?: string
  ownerPlayerId?: string
  lastFallbackReason?: string | null
}

type ResolvedFactionModelConfig = {
  config: FactionModelConfig
  model: string
  baseUrl?: string
  apiKey?: string
}

type ResolvedPlayerModelConfig = {
  model: string
  baseUrl?: string
  apiKey: string
}

export type AiPlayerRuntimeModelTargetCandidate = {
  target: ResolvedPlannerTarget
  source: AiPlayerModelRoutingSource
  byokSource: AiPlayerModelByokSource
  priority: number
  secretSource: string | null
  lastFailureReason: string | null
}

export type AiPlayerRuntimeModelTargetFailure = {
  model: string
  source: AiPlayerModelRoutingSource
  byokSource: AiPlayerModelByokSource
  priority: number
  error: string
}

const LAST_FALLBACK_REASON_LIMIT = 240
const lastFallbackReasonByFactionId = new Map<string, string>()
const fallbackFailuresByFactionId = new Map<string, AiPlayerRuntimeModelTargetFailure[]>()

function buildFallbackStateKey(factionId: string | undefined, ownerPlayerId?: string) {
  const normalizedFactionId = factionId?.trim() || 'global'
  const normalizedOwnerPlayerId = ownerPlayerId?.trim()
  return normalizedOwnerPlayerId ? `${normalizedFactionId}::player:${normalizedOwnerPlayerId}` : normalizedFactionId
}

function readEnv(name: string) {
  return process.env[name]?.trim() || ''
}

function readFirstEnv(names: readonly string[], fallback: string) {
  return readFirstEnvWithSource(names, fallback).value
}

function readFirstEnvWithSource(names: readonly string[], fallback: string) {
  for (const name of names) {
    const value = readEnv(name)
    if (value) {
      return { value, envName: name }
    }
  }
  return { value: fallback, envName: null }
}

function parseTokenList(rawValue: string) {
  return rawValue
    .split(/[\r\n,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function readApiKeysFromEnv(names: readonly string[]) {
  const tokens = names.flatMap((name) => parseTokenList(readEnv(name)))
  return Array.from(new Set(tokens))
}

function readFirstSecretSource(names: readonly string[]) {
  return names.find((name) => Boolean(readEnv(name))) ?? null
}

function normalizeFallbackReason(reason: string | null | undefined) {
  const normalized = reason?.trim()
  if (!normalized) {
    return null
  }
  return normalized.slice(0, LAST_FALLBACK_REASON_LIMIT)
}

export function recordAiPlayerRuntimeModelFallbackReason(factionId: string, reason: string | null | undefined) {
  return recordAiPlayerRuntimeModelFallbackReasonForOwner(factionId, reason)
}

export function recordAiPlayerRuntimeModelFallbackReasonForOwner(
  factionId: string,
  reason: string | null | undefined,
  ownerPlayerId?: string,
) {
  const normalized = normalizeFallbackReason(reason)
  const key = buildFallbackStateKey(factionId, ownerPlayerId)
  if (!normalized) {
    lastFallbackReasonByFactionId.delete(key)
    fallbackFailuresByFactionId.delete(key)
    return
  }
  lastFallbackReasonByFactionId.set(key, normalized)
}

export function clearAiPlayerRuntimeModelFallbackReason(factionId: string) {
  clearAiPlayerRuntimeModelFallbackReasonForOwner(factionId)
}

export function clearAiPlayerRuntimeModelFallbackReasonForOwner(factionId: string, ownerPlayerId?: string) {
  const key = buildFallbackStateKey(factionId, ownerPlayerId)
  lastFallbackReasonByFactionId.delete(key)
  fallbackFailuresByFactionId.delete(key)
}

export function recordAiPlayerRuntimeModelFallbackFailures(
  factionId: string,
  failures: AiPlayerRuntimeModelTargetFailure[],
) {
  return recordAiPlayerRuntimeModelFallbackFailuresForOwner(factionId, failures)
}

export function recordAiPlayerRuntimeModelFallbackFailuresForOwner(
  factionId: string,
  failures: AiPlayerRuntimeModelTargetFailure[],
  ownerPlayerId?: string,
) {
  const key = buildFallbackStateKey(factionId, ownerPlayerId)
  const safeFailures = failures
    .map((failure) => ({
      model: failure.model.trim().slice(0, 160),
      source: failure.source,
      byokSource: failure.byokSource,
      priority: Math.max(0, Math.trunc(Number(failure.priority) || 0)),
      error: normalizeFallbackReason(failure.error) ?? 'model_request_failed',
    }))
    .filter((failure) => failure.model && failure.error)
    .slice(0, 8)
  if (safeFailures.length === 0) {
    clearAiPlayerRuntimeModelFallbackReasonForOwner(factionId, ownerPlayerId)
    return
  }
  fallbackFailuresByFactionId.set(key, safeFailures)
  lastFallbackReasonByFactionId.set(
    key,
    normalizeFallbackReason(safeFailures.map((failure) => `${failure.source}:${failure.error}`).join('; ')) ?? safeFailures[0].error,
  )
}

function readAiPlayerRuntimeModelFallbackReason(factionId: string | undefined, ownerPlayerId?: string) {
  return lastFallbackReasonByFactionId.get(buildFallbackStateKey(factionId, ownerPlayerId)) ?? null
}

function readAiPlayerRuntimeModelFallbackFailures(factionId: string | undefined, ownerPlayerId?: string) {
  return fallbackFailuresByFactionId.get(buildFallbackStateKey(factionId, ownerPlayerId)) ?? []
}

function findStoredFailure(
  candidate: AiPlayerRuntimeModelTargetCandidate,
  failures: AiPlayerRuntimeModelTargetFailure[],
) {
  return failures.find((failure) => (
    failure.priority === candidate.priority
      && failure.model === candidate.target.model
      && failure.source === candidate.source
  )) ?? null
}

function resolveByokSource(source: AiPlayerModelRoutingSource, secretSource: string | null): AiPlayerModelByokSource {
  if (source === 'faction_config' && secretSource === 'faction_config:byok') {
    return 'faction_config'
  }
  if (source === 'player_config' && secretSource === 'player_config:byok') {
    return 'player_config'
  }
  return 'none'
}

function trimTrailingSlash(value: string) {
  return value.trim().replace(/\/+$/, '')
}

function normalizeRelayBaseUrl(baseUrl: string) {
  const normalized = trimTrailingSlash(baseUrl)
  if (normalized.endsWith('/chat/completions')) {
    return normalized.slice(0, -'/chat/completions'.length)
  }
  if (normalized.endsWith('/models')) {
    return normalized.slice(0, -'/models'.length)
  }
  if (normalized.endsWith('/v1')) {
    return normalized
  }
  return `${normalized}/v1`
}

function resolveProviderLabel(baseUrl: string) {
  try {
    return new URL(baseUrl).host || 'relay'
  } catch {
    return 'relay'
  }
}

function resolveFactionRuntimeModelConfig(factionId: string | undefined): ResolvedFactionModelConfig | null {
  const config = factionId ? getFactionModelConfig(factionId) : undefined
  if (!config) {
    return null
  }
  const model = (config.commanderModel ?? config.model).trim()
  if (!model) {
    return null
  }
  return {
    config,
    model,
    baseUrl: config.baseUrl?.trim() || undefined,
    apiKey: config.apiKey?.trim() || undefined,
  }
}

function resolvePlayerRuntimeModelConfig(ownerPlayerId: string | undefined): ResolvedPlayerModelConfig | null {
  const config = getActiveAiPlayerProviderPlayerKeyModelConfig(ownerPlayerId)
  if (!config?.apiKey) {
    return null
  }
  const model = config.model.trim()
  if (!model) {
    return null
  }
  return {
    model,
    baseUrl: config.baseUrl?.trim() || undefined,
    apiKey: config.apiKey.trim(),
  }
}

export function isAiPlayerRuntimeModelStrictJsonOnlyCapable(model: string) {
  const normalized = model.trim().toLowerCase()
  return normalized === DEFAULT_AI_PLAYER_RUNTIME_MODEL || normalized.includes('strict-json')
}

export function readAiPlayerRuntimeModelApiKeys() {
  return readApiKeysFromEnv(SECRET_ENV_PRIORITY)
}

export function readAiPlayerRuntimeModelSecretSources() {
  return SECRET_ENV_PRIORITY.filter((name) => Boolean(readEnv(name)))
}

function buildRuntimeModelTarget({
  label,
  baseUrl,
  model,
  apiKeys,
}: {
  label: string
  baseUrl: string
  model: string
  apiKeys: string[]
}): ResolvedPlannerTarget {
  return {
    source: 'gateway',
    label,
    protocol: 'openai_compat',
    baseUrl: normalizeRelayBaseUrl(baseUrl),
    apiKeys,
    model,
  }
}

function buildRuntimeModelTargetCandidate({
  label,
  baseUrl,
  model,
  apiKeys,
  source,
  priority,
  secretSource,
  lastFailureReason = null,
}: {
  label: string
  baseUrl: string
  model: string
  apiKeys: string[]
  source: AiPlayerModelRoutingSource
  priority: number
  secretSource: string | null
  lastFailureReason?: string | null
}): AiPlayerRuntimeModelTargetCandidate {
  const byokSource = resolveByokSource(source, secretSource)
  return {
    target: buildRuntimeModelTarget({
      label,
      baseUrl,
      model,
      apiKeys,
    }),
    source,
    byokSource,
    priority,
    secretSource,
    lastFailureReason,
  }
}

function resolvePrimaryEnvRuntimeModelTargetCandidate(priority: number): AiPlayerRuntimeModelTargetCandidate | null {
  const baseUrlResolution = readFirstEnvWithSource(BASE_URL_ENV_PRIORITY, DEFAULT_RUNTIME_RELAY_BASE_URL)
  const modelResolution = readFirstEnvWithSource(MODEL_ENV_PRIORITY, DEFAULT_AI_PLAYER_RUNTIME_MODEL)
  const secretSources = readAiPlayerRuntimeModelSecretSources()
  const configured = Boolean(baseUrlResolution.envName || modelResolution.envName || secretSources.length > 0)
  if (!configured) {
    return null
  }
  return buildRuntimeModelTargetCandidate({
    label: 'AI player runtime env relay',
    baseUrl: baseUrlResolution.value,
    model: modelResolution.value,
    apiKeys: readAiPlayerRuntimeModelApiKeys(),
    source: 'env',
    priority,
    secretSource: secretSources[0] ?? null,
  })
}

function resolveLlmRelayRuntimeModelTargetCandidate(priority: number): AiPlayerRuntimeModelTargetCandidate | null {
  const model = readEnv('LLM_RELAY_MODEL')
  const baseUrl = readEnv('LLM_RELAY_URL')
  if (!model && !baseUrl) {
    return null
  }
  const secretSource = readFirstSecretSource(['LLM_RELAY_API_KEY', 'LLM_RELAY_API_KEYS'])
  return buildRuntimeModelTargetCandidate({
    label: 'AI player LLM relay fallback',
    baseUrl: baseUrl || DEFAULT_RUNTIME_RELAY_BASE_URL,
    model: model || DEFAULT_AI_PLAYER_RUNTIME_MODEL,
    apiKeys: readApiKeysFromEnv(['LLM_RELAY_API_KEY', 'LLM_RELAY_API_KEYS']),
    source: 'env',
    priority,
    secretSource,
  })
}

function resolveDefaultRuntimeModelTargetCandidate(priority: number): AiPlayerRuntimeModelTargetCandidate {
  return buildRuntimeModelTargetCandidate({
    label: 'AI player default runtime relay',
    baseUrl: DEFAULT_RUNTIME_RELAY_BASE_URL,
    model: DEFAULT_AI_PLAYER_RUNTIME_MODEL,
    apiKeys: [],
    source: 'default',
    priority,
    secretSource: null,
  })
}

function normalizeCandidatePriorities(candidates: AiPlayerRuntimeModelTargetCandidate[]) {
  const seen = new Set<string>()
  const deduped: AiPlayerRuntimeModelTargetCandidate[] = []
  for (const candidate of candidates) {
    const key = `${candidate.target.baseUrl}\n${candidate.target.model}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    deduped.push(candidate)
  }
  return deduped.map((candidate, priority) => ({
    ...candidate,
    priority,
  }))
}

export function resolveAiPlayerRuntimeModelTargetCandidates(
  options: AiPlayerRuntimeModelTargetOptions = {},
): AiPlayerRuntimeModelTargetCandidate[] {
  const candidates: AiPlayerRuntimeModelTargetCandidate[] = []
  const playerConfig = resolvePlayerRuntimeModelConfig(options.ownerPlayerId)
  const factionConfig = resolveFactionRuntimeModelConfig(options.factionId)
  const lastFallbackReason = normalizeFallbackReason(options.lastFallbackReason)
    ?? readAiPlayerRuntimeModelFallbackReason(options.factionId, options.ownerPlayerId)
  if (playerConfig) {
    candidates.push(buildRuntimeModelTargetCandidate({
      label: 'AI player player-level BYOK relay',
      baseUrl: playerConfig.baseUrl ?? readFirstEnv(BASE_URL_ENV_PRIORITY, DEFAULT_RUNTIME_RELAY_BASE_URL),
      model: playerConfig.model,
      apiKeys: [playerConfig.apiKey],
      source: 'player_config',
      priority: candidates.length,
      secretSource: 'player_config:byok',
      lastFailureReason: lastFallbackReason,
    }))
  }

  if (factionConfig) {
    const secretSources = readAiPlayerRuntimeModelSecretSources()
    candidates.push(buildRuntimeModelTargetCandidate({
      label: 'AI player faction BYOK relay',
      baseUrl: factionConfig.baseUrl ?? readFirstEnv(BASE_URL_ENV_PRIORITY, DEFAULT_RUNTIME_RELAY_BASE_URL),
      model: factionConfig.model,
      apiKeys: factionConfig.apiKey ? [factionConfig.apiKey] : readAiPlayerRuntimeModelApiKeys(),
      source: 'faction_config',
      priority: candidates.length,
      secretSource: factionConfig.apiKey ? 'faction_config:byok' : (secretSources[0] ?? null),
      lastFailureReason: lastFallbackReason,
    }))
  }

  const primaryEnvCandidate = resolvePrimaryEnvRuntimeModelTargetCandidate(candidates.length)
  if (primaryEnvCandidate) {
    candidates.push(primaryEnvCandidate)
  }

  const llmRelayCandidate = resolveLlmRelayRuntimeModelTargetCandidate(candidates.length)
  if (llmRelayCandidate) {
    candidates.push(llmRelayCandidate)
  }

  candidates.push(resolveDefaultRuntimeModelTargetCandidate(candidates.length))
  const normalized = normalizeCandidatePriorities(candidates)
  const storedFailures = readAiPlayerRuntimeModelFallbackFailures(options.factionId, options.ownerPlayerId)
  const withFailures = normalized.map((candidate) => ({
    ...candidate,
    lastFailureReason: findStoredFailure(candidate, storedFailures)?.error ?? candidate.lastFailureReason,
  }))
  if (withFailures.length > 0 && !playerConfig && !factionConfig) {
    withFailures[0] = {
      ...withFailures[0],
      lastFailureReason: lastFallbackReason,
    }
  }
  return withFailures
}

export function resolveAiPlayerRuntimeModelTarget(options: AiPlayerRuntimeModelTargetOptions = {}): ResolvedPlannerTarget {
  return resolveAiPlayerRuntimeModelTargetCandidates(options)[0].target
}

export function resolveAiPlayerRuntimeModelStatus(options: {
  factionId?: string
  ownerPlayerId?: string
  allowLlmProposals?: boolean
  lastFallbackReason?: string | null
} = {}): AiPlayerModelStatus {
  const candidates = resolveAiPlayerRuntimeModelTargetCandidates({
    factionId: options.factionId,
    ownerPlayerId: options.ownerPlayerId,
    lastFallbackReason: options.lastFallbackReason,
  })
  const lastFallbackReason = normalizeFallbackReason(options.lastFallbackReason)
    ?? readAiPlayerRuntimeModelFallbackReason(options.factionId, options.ownerPlayerId)
  const activeCandidate = candidates[0]
  const target = activeCandidate.target
  const strictJsonOnlyCapable = isAiPlayerRuntimeModelStrictJsonOnlyCapable(target.model)
  const budgetTier: AiPlayerModelBudgetTier = options.allowLlmProposals === false
    ? 'disabled'
    : strictJsonOnlyCapable
      ? 'strict_action'
      : 'economy_chat'
  const candidateTargets = candidates.map((candidate, index) => {
    const candidateStrictJsonOnlyCapable = isAiPlayerRuntimeModelStrictJsonOnlyCapable(candidate.target.model)
    const candidateBudgetTier: AiPlayerModelBudgetTier = options.allowLlmProposals === false
      ? 'disabled'
      : candidateStrictJsonOnlyCapable
        ? 'strict_action'
        : 'economy_chat'
    return {
      model: candidate.target.model,
      provider: resolveProviderLabel(candidate.target.baseUrl),
      source: candidate.source,
      byokSource: candidate.byokSource,
      priority: candidate.priority,
      isActive: index === 0,
      fallbackCandidate: index > 0,
      strictJsonOnlyCapable: candidateStrictJsonOnlyCapable,
      budgetTier: candidateBudgetTier,
      lastFailureReason: candidate.lastFailureReason,
      secretConfigured: candidate.target.apiKeys.length > 0,
      secretSource: candidate.secretSource,
    }
  })
  const secretConfigured = target.apiKeys.length > 0
  const secretSource = activeCandidate.secretSource
  return {
    activeModel: target.model,
    activeProvider: resolveProviderLabel(target.baseUrl),
    source: activeCandidate.source,
    strictJsonOnlyCapable,
    budgetTier,
    fallbackEnabled: options.allowLlmProposals !== false && candidates.length > 1,
    fallbackModel: candidates[1]?.target.model ?? null,
    lastFallbackReason,
    secretConfigured,
    secretSource,
    byokSource: activeCandidate.byokSource,
    targetCount: candidates.length,
    candidateTargets,
  }
}
