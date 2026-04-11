import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AiLogEntry, AiModelDescriptor, AiModelsResponse } from '../../../shared/contracts/game'
import { getAiHubConfig, updateAiHubConfig } from '../application/ai/AiConfigService'
import { parseAiConfigUpdateBody } from '../application/ai/aiRouteBody'
import { getWorldStateReadonly } from '../application/world/WorldService'
import { getFactionConfig, setFactionDoctrine, setFactionModelConfig } from '../application/faction/FactionConfigStore'
import { resolveRelayModelDiscoveryTarget } from '../config/modelGateway'
import { isHttpBodyError, writeJson } from './http'

const FACTION_ID_PATTERN = /^[a-z0-9_-]{1,40}$/
const FALLBACK_CAUSE_KEYS = [
  'gateway_timeout',
  'gateway_network',
  'gateway_http',
  'gateway_quota',
  'provider_error',
  'validation',
  'unknown',
] as const

type FallbackCause = (typeof FALLBACK_CAUSE_KEYS)[number]
type StrictModeFlag = 'on' | 'off' | 'n/a'
type AiLogObservabilityEntry = AiLogEntry & {
  strictMode: StrictModeFlag
  fallbackUsed: boolean
  fallbackCause?: FallbackCause
}

function resolveDefaultFactionId(): string {
  const world = getWorldStateReadonly()
  return resolvePreferredFactionId(world)
}

function resolveFactionId(input: string | null | undefined): string {
  const normalized = input?.trim().toLowerCase()
  const fallbackFactionId = resolveDefaultFactionId()
  if (!normalized) {
    return fallbackFactionId
  }
  return FACTION_ID_PATTERN.test(normalized) ? normalized : fallbackFactionId
}

function resolvePreferredFactionId(world: ReturnType<typeof getWorldStateReadonly>) {
  const factionIds = Object.keys(world.factions)
  const nonNeutralFactionIds = factionIds.filter((factionId) => factionId !== 'neutral')

  const scoredFactionIds = (nonNeutralFactionIds.length > 0 ? nonNeutralFactionIds : factionIds)
    .map((factionId) => ({
      factionId,
      unitCount: world.units.filter((unit) => unit.faction === factionId).length,
      tileCount: world.map.tiles.filter((tile) => tile.owner === factionId).length,
    }))

  if (scoredFactionIds.length === 0) {
    return 'neutral'
  }

  scoredFactionIds.sort((left, right) => {
    if (right.unitCount !== left.unitCount) {
      return right.unitCount - left.unitCount
    }
    if (right.tileCount !== left.tileCount) {
      return right.tileCount - left.tileCount
    }
    return left.factionId.localeCompare(right.factionId)
  })

  return scoredFactionIds[0]?.factionId ?? 'neutral'
}

export function handleAiConfigGetRoute(req: IncomingMessage, res: ServerResponse) {
  const requestUrl = new URL(req.url ?? '/api/ai/config', 'http://localhost')
  const factionId = resolveFactionId(requestUrl.searchParams.get('factionId'))
  writeJson(res, 200, getAiHubConfig(factionId))
}

export async function handleAiConfigSaveRoute(req: IncomingMessage, res: ServerResponse) {
  try {
    const parsed = await parseAiConfigUpdateBody(req)

    if (!parsed.success) {
      writeJson(res, 400, {
        error: 'Invalid AI config payload.',
        details: parsed.details,
      })
      return
    }

    const factionId = resolveFactionId(parsed.data.factionId)
    const updated = updateAiHubConfig(parsed.data.config, factionId)

    setFactionDoctrine(factionId, parsed.data.config.doctrinePrompt)
    const existingModelConfig = getFactionConfig(factionId)?.modelConfig
    setFactionModelConfig(factionId, {
      model: existingModelConfig?.model ?? parsed.data.config.models.commander,
      apiKey: existingModelConfig?.apiKey,
      baseUrl: existingModelConfig?.baseUrl,
      commanderModel: parsed.data.config.models.commander,
      generalModel: parsed.data.config.models.general,
      unitModel: parsed.data.config.models.unit,
    })

    writeJson(res, 200, updated)
  } catch (error) {
    if (isHttpBodyError(error)) {
      writeJson(res, error.statusCode, { error: error.message })
      return
    }

    const message = error instanceof Error ? error.message : 'Failed to save AI config.'
    writeJson(res, 500, { error: message })
  }
}

export function handleAiLogsRoute(_req: IncomingMessage, res: ServerResponse, limit = 20) {
  const normalizedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 20
  const world = getWorldStateReadonly()
  const gatewayStrictEnabled = readGatewayStrictMode()

  const items: AiLogObservabilityEntry[] = world.history.planningJobs.slice(0, normalizedLimit).map((entry) => {
    const strictMode: StrictModeFlag = entry.sourceMode === 'gateway' ? (gatewayStrictEnabled ? 'on' : 'off') : 'n/a'
    const fallbackUsed = entry.sourceMode !== 'mock' && entry.resolvedSource === 'mock'
    const fallbackCause = fallbackUsed
      ? inferFallbackCause([entry.message, entry.plannerNote, entry.plannerExplanation])
      : undefined

    return {
      id: entry.id,
      status: entry.status,
      sourceMode: entry.sourceMode,
      requestedTick: entry.requestedTick,
      requestedWorldVersion: entry.requestedWorldVersion,
      message: entry.message,
      resolvedSource: entry.resolvedSource,
      plannerNote: entry.plannerNote,
      completedTick: entry.completedTick,
      completedWorldVersion: entry.completedWorldVersion,
      strictMode,
      fallbackUsed,
      fallbackCause,
    }
  })

  const fallbackUsedCount = items.filter((item) => item.fallbackUsed).length

  writeJson(res, 200, {
    items,
    limit: normalizedLimit,
    fetchedAt: new Date().toISOString(),
    gatewayStrictMode: gatewayStrictEnabled ? 'on' : 'off',
    fallbackUsedCount,
  })
}

function readGatewayStrictMode() {
  const raw = process.env.PLANNER_GATEWAY_STRICT?.trim().toLowerCase()
  if (!raw) {
    return true
  }

  return !['0', 'false', 'off', 'no'].includes(raw)
}

function inferFallbackCause(parts: Array<string | undefined>): FallbackCause {
  const joined = parts
    .map((part) => part?.trim().toLowerCase())
    .filter((part): part is string => Boolean(part))
    .join(' | ')

  for (const key of FALLBACK_CAUSE_KEYS) {
    if (joined.includes(`fallbackcause=${key}`) || joined.includes(key)) {
      return key
    }
  }

  if (joined.includes('timeout') || joined.includes('timed out')) {
    return 'gateway_timeout'
  }

  if (joined.includes('network') || joined.includes('fetch') || joined.includes('econn')) {
    return 'gateway_network'
  }

  if (joined.includes('http') || joined.includes('status')) {
    return 'gateway_http'
  }

  if (joined.includes('quota') || joined.includes('rate limit') || joined.includes('too many requests')) {
    return 'gateway_quota'
  }

  if (joined.includes('schema') || joined.includes('json') || joined.includes('invalid')) {
    return 'validation'
  }

  return 'unknown'
}

type CacheEntry = {
  expiresAt: number
  payload: AiModelsResponse
}

type RelayModelsPayload = {
  data?: unknown
}

const DEFAULT_MODELS_CACHE_MS = 45_000
const FALLBACK_MODEL_ID = 'qwen/qwen3.5-flash-02-23'

let cacheEntry: CacheEntry | null = null
let inflightRequest: Promise<AiModelsResponse> | null = null
let lastSuccessfulItems: AiModelDescriptor[] = []

export async function handleAiModelsRoute(_req: IncomingMessage, res: ServerResponse) {
  const now = Date.now()

  if (cacheEntry && cacheEntry.expiresAt > now) {
    writeJson(res, 200, cacheEntry.payload)
    return
  }

  if (!inflightRequest) {
    inflightRequest = resolveAiModels().finally(() => {
      inflightRequest = null
    })
  }

  const payload = await inflightRequest
  cacheEntry = {
    expiresAt: now + getModelsCacheTtlMs(),
    payload,
  }
  writeJson(res, 200, payload)
}

async function resolveAiModels(): Promise<AiModelsResponse> {
  const fetchedAt = new Date().toISOString()

  try {
    const target = resolveRelayModelDiscoveryTarget()
    const items = await fetchRelayModels(target.baseUrl, target.apiKeys)
    if (items.length === 0) {
      throw new Error('Relay returned an empty model list.')
    }

    lastSuccessfulItems = items
    return {
      items,
      source: 'live',
      fetchedAt,
      stale: false,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load models.'

    if (lastSuccessfulItems.length > 0) {
      return {
        items: lastSuccessfulItems,
        source: 'cache',
        fetchedAt,
        stale: true,
        error: message,
      }
    }

    return {
      items: buildFallbackModels(),
      source: 'fallback',
      fetchedAt,
      stale: true,
      error: message,
    }
  }
}

async function fetchRelayModels(baseUrl: string, apiKeys: string[]) {
  const keys = apiKeys.length > 0 ? apiKeys : [undefined]
  let lastError: string | null = null

  for (const apiKey of keys) {
    try {
      const payload = await requestRelayModels(baseUrl, apiKey)
      const records = Array.isArray(payload.data) ? payload.data : []
      const normalized = records
        .map(normalizeModelRecord)
        .filter((item): item is AiModelDescriptor => !!item)

      if (normalized.length === 0) {
        throw new Error('Relay response has no usable models.')
      }

      return dedupeModels(normalized)
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error'
    }
  }

  throw new Error(lastError ?? 'Failed to fetch relay models.')
}

async function requestRelayModels(baseUrl: string, apiKey: string | undefined) {
  const headers: Record<string, string> = {}
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  const response = await fetch(`${baseUrl}/models`, {
    method: 'GET',
    headers,
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Model list request failed: HTTP ${response.status}${body ? ` (${body.slice(0, 120)})` : ''}`)
  }

  const payload = (await response.json()) as RelayModelsPayload
  return payload
}

function normalizeModelRecord(entry: unknown): AiModelDescriptor | null {
  if (!entry || typeof entry !== 'object') {
    return null
  }

  const record = entry as Record<string, unknown>
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  if (!id) {
    return null
  }

  return {
    id,
    name: buildModelDisplayName(id),
    provider: typeof record.owned_by === 'string' && record.owned_by.trim() ? record.owned_by : 'relay',
    contextWindow:
      coerceNumber(record.context_window) ??
      coerceNumber(record.max_context_tokens) ??
      coerceNumber(record.max_input_tokens),
    tags: buildModelTags(id),
    available: true,
  }
}

function dedupeModels(items: AiModelDescriptor[]) {
  const map = new Map<string, AiModelDescriptor>()
  for (const item of items) {
    if (!map.has(item.id)) {
      map.set(item.id, item)
    }
  }

  return Array.from(map.values())
}

function buildModelDisplayName(id: string) {
  const normalized = id.includes('/') ? id.split('/').at(-1) ?? id : id
  return normalized.replace(/[-_]+/g, ' ').trim() || id
}

function buildModelTags(id: string) {
  const lower = id.toLowerCase()
  const tags = new Set<string>()

  if (lower.includes('flash') || lower.includes('mini') || lower.includes('nano')) {
    tags.add('fast')
    tags.add('low_cost')
  }

  if (lower.includes('reason') || lower.includes('r1') || lower.includes('think')) {
    tags.add('reasoning')
  }

  if (lower.includes('gpt') || lower.includes('qwen') || lower.includes('deepseek')) {
    tags.add('llm')
  }

  if (tags.size === 0) {
    tags.add('general')
  }

  return Array.from(tags)
}

function coerceNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  return undefined
}

function getModelsCacheTtlMs() {
  const raw = process.env.AI_MODELS_CACHE_MS
  if (!raw) {
    return DEFAULT_MODELS_CACHE_MS
  }

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 5_000) {
    return DEFAULT_MODELS_CACHE_MS
  }

  return Math.floor(parsed)
}

function buildFallbackModels(): AiModelDescriptor[] {
  const candidates = [
    process.env.LLM_RELAY_MODEL?.trim(),
    process.env.LOCAL_MODEL_NAME?.trim(),
    FALLBACK_MODEL_ID,
  ].filter((item): item is string => !!item)

  const uniqueCandidates = Array.from(new Set(candidates))
  return uniqueCandidates.map((id) => ({
    id,
    name: buildModelDisplayName(id),
    provider: 'fallback',
    tags: buildModelTags(id),
    available: false,
  }))
}
