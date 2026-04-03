import { buildTheaterSnapshot } from '../../../../shared/domain/theater'
import type { ExecutionReplayOutcome, RegionPriority, WorldState } from '../../../../shared/contracts/game'
import { resolveReplayRagConfig, type ReplayRagEmbeddingProvider } from '../../config/replayRag'
import {
  isReplayRagCacheEnabled,
  readReplayRagCacheFile,
  resolveReplayRagCacheFilePath,
  writeReplayRagCacheFile,
} from './replayRagCache'

export type ReplayIndexSourceRecord = {
  requestId: string
  createdTick: number
  outcome: ExecutionReplayOutcome
  intent: string
  priority: RegionPriority
  orderCount: number
  shortSummary: string
  excerpt: string
}

export type ReplayVectorIndexItem = ReplayIndexSourceRecord & {
  embedding: number[]
}

export type ReplayVectorIndex = {
  dimension: number
  items: ReplayVectorIndexItem[]
}

export type ReplayRetrievalItem = ReplayIndexSourceRecord & {
  score: number
}

export type ReplayEmbeddingBuildOptions = {
  provider?: ReplayRagEmbeddingProvider
  embeddingDimension?: number
  baseUrl?: string
  apiKeys?: string[]
  model?: string
  timeoutMs?: number
  failOpen?: boolean
}

type RuntimeEmbeddingConfig = {
  provider: ReplayRagEmbeddingProvider
  embeddingDimension: number
  baseUrl?: string
  apiKeys: string[]
  model?: string
  timeoutMs: number
  failOpen: boolean
}

type OpenAICompatibleEmbeddingResponse = {
  error?: {
    message?: string
  }
  data?: Array<{
    index: number
    embedding: number[]
  }>
}

type CachedReplayVectorIndexItem = ReplayVectorIndexItem & {
  recordHash: number
}

type ReplayVectorIndexCacheEntry = {
  cacheKey: string
  provider: ReplayRagEmbeddingProvider
  dimension: number
  model?: string
  baseUrl?: string
  updatedAt: string
  items: CachedReplayVectorIndexItem[]
}

type ReplayRagCacheStats = {
  enabled: boolean
  filePath: string
  memoryEntries: number
  diskLoaded: boolean
  hits: number
  misses: number
  reusedItems: number
  embeddedItems: number
  writes: number
}

const replayIndexCache = new Map<string, ReplayVectorIndexCacheEntry>()
let replayDiskCacheLoaded = false

const replayRagCacheStats: ReplayRagCacheStats = {
  enabled: true,
  filePath: '',
  memoryEntries: 0,
  diskLoaded: false,
  hits: 0,
  misses: 0,
  reusedItems: 0,
  embeddedItems: 0,
  writes: 0,
}

export async function retrieveReplays(
  world: WorldState,
  strategicCommand: string,
  options?: {
    topK?: number
    maxExcerptChars?: number
  } & ReplayEmbeddingBuildOptions,
): Promise<ReplayRetrievalItem[]> {
  const defaults = resolveReplayRagConfig()
  const topK = Math.max(1, Math.min(8, options?.topK ?? defaults.topK))
  const maxExcerptChars = options?.maxExcerptChars ?? defaults.maxExcerptChars
  const runtimeConfig = resolveRuntimeEmbeddingConfig(options)

  const records = buildReplaySourceRecords(world, maxExcerptChars)
  if (records.length === 0) {
    return []
  }

  const index = await buildReplayVectorIndexWithCache(records, runtimeConfig)
  const query = buildReplayQuery(world, strategicCommand)
  const queryEmbedding = (await embedTexts([query], runtimeConfig))[0] ?? createZeroVector(index.dimension)

  return queryReplayVectorIndexByEmbedding(index, queryEmbedding, {
    topK,
    currentTick: world.tick,
  })
}

export function buildReplayVectorIndex(
  records: ReplayIndexSourceRecord[],
  dimension = 192,
): ReplayVectorIndex {
  const normalizedDimension = normalizeDimension(dimension)

  return {
    dimension: normalizedDimension,
    items: records.map((record) => ({
      ...record,
      embedding: embedTextHash(buildRecordText(record), normalizedDimension),
    })),
  }
}

export async function buildReplayVectorIndexAsync(
  records: ReplayIndexSourceRecord[],
  options?: ReplayEmbeddingBuildOptions,
): Promise<ReplayVectorIndex> {
  const runtimeConfig = resolveRuntimeEmbeddingConfig(options)

  if (records.length === 0) {
    return {
      dimension: runtimeConfig.embeddingDimension,
      items: [],
    }
  }

  const embeddings = await embedTexts(
    records.map((record) => buildRecordText(record)),
    runtimeConfig,
  )

  return {
    dimension: runtimeConfig.embeddingDimension,
    items: records.map((record, index) => ({
      ...record,
      embedding: embeddings[index] ?? createZeroVector(runtimeConfig.embeddingDimension),
    })),
  }
}



export function getReplayRagCacheStats() {
  const filePath = resolveReplayRagCacheFilePath()
  replayRagCacheStats.enabled = isReplayRagCacheEnabled()
  replayRagCacheStats.filePath = filePath
  replayRagCacheStats.memoryEntries = replayIndexCache.size
  replayRagCacheStats.diskLoaded = replayDiskCacheLoaded

  return {
    ...replayRagCacheStats,
  }
}

async function buildReplayVectorIndexWithCache(
  records: ReplayIndexSourceRecord[],
  runtimeConfig: RuntimeEmbeddingConfig,
): Promise<ReplayVectorIndex> {
  if (records.length === 0) {
    return {
      dimension: runtimeConfig.embeddingDimension,
      items: [],
    }
  }

  if (!isReplayRagCacheEnabled()) {
    return buildReplayVectorIndexAsync(records, runtimeConfig)
  }

  ensureReplayDiskCacheLoaded()

  const cacheKey = buildReplayIndexCacheKey(runtimeConfig)
  const existing = replayIndexCache.get(cacheKey)
  const existingByRequestId = new Map(
    (existing?.items ?? []).map((item) => [item.requestId, item] as const),
  )

  const nextItems: CachedReplayVectorIndexItem[] = []
  const pendingRecords: ReplayIndexSourceRecord[] = []
  const pendingTexts: string[] = []

  for (const record of records) {
    const recordText = buildRecordText(record)
    const recordHash = hashText(recordText)
    const cachedItem = existingByRequestId.get(record.requestId)

    if (cachedItem && cachedItem.recordHash === recordHash && cachedItem.embedding.length === runtimeConfig.embeddingDimension) {
      nextItems.push({
        ...record,
        embedding: cachedItem.embedding,
        recordHash,
      })
      replayRagCacheStats.reusedItems += 1
      continue
    }

    pendingRecords.push(record)
    pendingTexts.push(recordText)
  }

  if (pendingRecords.length > 0) {
    const embeddings = await embedTexts(pendingTexts, runtimeConfig)
    for (let index = 0; index < pendingRecords.length; index += 1) {
      const record = pendingRecords[index]
      const recordText = pendingTexts[index]
      nextItems.push({
        ...record,
        embedding: embeddings[index] ?? createZeroVector(runtimeConfig.embeddingDimension),
        recordHash: hashText(recordText),
      })
    }
    replayRagCacheStats.embeddedItems += pendingRecords.length
  }

  const itemsByRequestId = new Map(nextItems.map((item) => [item.requestId, item] as const))
  const orderedItems = records
    .map((record) => itemsByRequestId.get(record.requestId))
    .filter((item): item is CachedReplayVectorIndexItem => !!item)

  const hasChanges =
    !existing ||
    pendingRecords.length > 0 ||
    existing.items.length !== orderedItems.length ||
    existing.items.some((item, index) => item.requestId !== orderedItems[index]?.requestId)

  if (existing) {
    replayRagCacheStats.hits += 1
  } else {
    replayRagCacheStats.misses += 1
  }

  if (hasChanges) {
    const nextCacheEntry: ReplayVectorIndexCacheEntry = {
      cacheKey,
      provider: runtimeConfig.provider,
      dimension: runtimeConfig.embeddingDimension,
      model: runtimeConfig.model,
      baseUrl: runtimeConfig.baseUrl,
      updatedAt: new Date().toISOString(),
      items: orderedItems,
    }

    replayIndexCache.set(cacheKey, nextCacheEntry)
    persistReplayDiskCache()
  }

  return {
    dimension: runtimeConfig.embeddingDimension,
    items: orderedItems.map((item) => ({
      requestId: item.requestId,
      createdTick: item.createdTick,
      outcome: item.outcome,
      intent: item.intent,
      priority: item.priority,
      orderCount: item.orderCount,
      shortSummary: item.shortSummary,
      excerpt: item.excerpt,
      embedding: item.embedding,
    })),
  }
}

function ensureReplayDiskCacheLoaded() {
  if (replayDiskCacheLoaded) {
    return
  }

  replayDiskCacheLoaded = true
  const filePath = resolveReplayRagCacheFilePath()
  replayRagCacheStats.filePath = filePath

  const { entries, diskLoaded } = readReplayRagCacheFile(filePath, isReplayVectorIndexCacheEntry)
  if (!diskLoaded) {
    return
  }

  for (const entry of entries) {
    replayIndexCache.set(entry.cacheKey, entry)
  }

  replayRagCacheStats.memoryEntries = replayIndexCache.size
  replayRagCacheStats.diskLoaded = true
}

function persistReplayDiskCache() {
  const filePath = resolveReplayRagCacheFilePath()
  replayRagCacheStats.filePath = filePath

  const didWrite = writeReplayRagCacheFile(filePath, Array.from(replayIndexCache.values()))
  if (didWrite) {
    replayRagCacheStats.writes += 1
    replayRagCacheStats.memoryEntries = replayIndexCache.size
  }
}

function isReplayVectorIndexCacheEntry(entry: unknown): entry is ReplayVectorIndexCacheEntry {
  if (!entry || typeof entry !== 'object') {
    return false
  }

  const candidate = entry as { cacheKey?: unknown; items?: unknown }
  return typeof candidate.cacheKey === 'string' && Array.isArray(candidate.items)
}

function buildReplayIndexCacheKey(config: RuntimeEmbeddingConfig) {
  return [
    config.provider,
    config.embeddingDimension,
    config.baseUrl ?? '',
    config.model ?? '',
  ].join('|')
}

function hashText(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}
export function queryReplayVectorIndex(
  index: ReplayVectorIndex,
  queryText: string,
  options?: {
    topK?: number
    currentTick?: number
  },
): ReplayRetrievalItem[] {
  const queryEmbedding = embedTextHash(queryText, index.dimension)
  return queryReplayVectorIndexByEmbedding(index, queryEmbedding, options)
}

function queryReplayVectorIndexByEmbedding(
  index: ReplayVectorIndex,
  queryEmbedding: number[],
  options?: {
    topK?: number
    currentTick?: number
  },
) {
  const topK = Math.max(1, Math.min(8, options?.topK ?? 3))
  const currentTick = options?.currentTick ?? 0

  return index.items
    .map((item) => {
      const semanticScore = cosineSimilarity(queryEmbedding, item.embedding)
      const recencyScore =
        currentTick > 0 ? computeRecencyScore(currentTick, item.createdTick) : 0.5
      const score = semanticScore * 0.82 + recencyScore * 0.18

      return {
        requestId: item.requestId,
        createdTick: item.createdTick,
        outcome: item.outcome,
        intent: item.intent,
        priority: item.priority,
        orderCount: item.orderCount,
        shortSummary: item.shortSummary,
        excerpt: item.excerpt,
        score: Number(score.toFixed(4)),
      } satisfies ReplayRetrievalItem
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

function buildReplaySourceRecords(world: WorldState, maxExcerptChars: number): ReplayIndexSourceRecord[] {
  return world.history.executionReplays.slice(0, 24).map((replay) => {
    const lastFrame = replay.frames.at(-1)
    const shortSummary =
      replay.plannerExplanation?.trim() ||
      replay.plannerNote?.trim() ||
      replay.plan.intent ||
      'Replay memory summary unavailable.'
    const frameHighlights = (lastFrame?.highlights ?? [])
      .slice(0, 3)
      .map((item) => `${item.kind}:${item.title}`)
      .join(' | ')
    const rationale = replay.planningRationale?.slice(0, 3).join(' | ') ?? ''
    const excerpt = compactText(`${frameHighlights} ${rationale}`.trim(), maxExcerptChars)

    return {
      requestId: replay.requestId,
      createdTick: replay.createdTick,
      outcome: replay.outcome,
      intent: replay.plan.intent,
      priority: replay.plan.priority,
      orderCount: replay.plan.orders.length,
      shortSummary: compactText(shortSummary, 160),
      excerpt,
    }
  })
}

function buildReplayQuery(world: WorldState, strategicCommand: string) {
  const theater = buildTheaterSnapshot(world)
  const hotspotSummary = theater.macroRegions
    .slice(0, 3)
    .map((region) => `${region.id}:${region.priority}:${region.averageEnemyPressure}`)
    .join(' ')

  return `command:${strategicCommand}
frontlineRisk:${theater.frontlineRisk}
battleRisk:${theater.battleRisk}
reconCoverage:${theater.reconCoverage}
hotspots:${hotspotSummary}`
}

function buildRecordText(record: ReplayIndexSourceRecord) {
  return [
    `request:${record.requestId}`,
    `tick:${record.createdTick}`,
    `outcome:${record.outcome}`,
    `intent:${record.intent}`,
    `priority:${record.priority}`,
    `orders:${record.orderCount}`,
    record.shortSummary,
    record.excerpt,
  ].join('\n')
}

function resolveRuntimeEmbeddingConfig(options?: ReplayEmbeddingBuildOptions): RuntimeEmbeddingConfig {
  const defaults = resolveReplayRagConfig()

  return {
    provider: options?.provider ?? defaults.provider,
    embeddingDimension: normalizeDimension(options?.embeddingDimension ?? defaults.embeddingDimension),
    baseUrl: options?.baseUrl ?? defaults.baseUrl,
    apiKeys: options?.apiKeys ?? defaults.apiKeys,
    model: options?.model ?? defaults.model,
    timeoutMs: options?.timeoutMs ?? defaults.timeoutMs,
    failOpen: options?.failOpen ?? defaults.failOpen,
  }
}

async function embedTexts(texts: string[], config: RuntimeEmbeddingConfig): Promise<number[][]> {
  if (texts.length === 0) {
    return []
  }

  if (config.provider === 'hash') {
    return texts.map((text) => embedTextHash(text, config.embeddingDimension))
  }

  try {
    return await embedTextsViaOpenAICompat(texts, config)
  } catch (error) {
    if (!config.failOpen) {
      throw error
    }

    console.warn(
      `[ReplayRAG] embedding provider openai_compat failed, fallback to hash embeddings: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    )

    return texts.map((text) => embedTextHash(text, config.embeddingDimension))
  }
}

async function embedTextsViaOpenAICompat(texts: string[], config: RuntimeEmbeddingConfig) {
  if (!config.baseUrl) {
    throw new Error('REPLAY_RAG embedding base url is missing')
  }

  const endpoint = normalizeEmbeddingEndpoint(config.baseUrl)
  const requestBody = JSON.stringify({
    model: config.model,
    input: texts,
  })

  const apiKeys = rotateApiKeys(config.apiKeys)
  let lastError = ''

  for (let index = 0; index < apiKeys.length; index += 1) {
    const apiKey = apiKeys[index]
    const isLastAttempt = index === apiKeys.length - 1

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: buildHeaders(apiKey),
        body: requestBody,
        signal: AbortSignal.timeout(config.timeoutMs),
      })

      if (!response.ok) {
        lastError = await buildEmbeddingErrorMessage(response)

        if (!isLastAttempt && shouldRetryWithNextKey(response.status)) {
          continue
        }

        throw new Error(lastError)
      }

      const payload = (await response.json()) as OpenAICompatibleEmbeddingResponse
      const data = payload.data
      if (!Array.isArray(data) || data.length !== texts.length) {
        throw new Error('embedding response data shape mismatch')
      }

      return data
        .slice()
        .sort((a, b) => a.index - b.index)
        .map((item) => fitVectorDimension(item.embedding, config.embeddingDimension))
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'openai_compat embedding request failed'
      lastError = message

      if (!isLastAttempt && isRetryableEmbeddingError(error)) {
        continue
      }

      throw new Error(lastError)
    }
  }

  throw new Error(lastError || 'openai_compat embedding failed after retries')
}

function embedTextHash(text: string, dimension: number) {
  const vector = new Array<number>(dimension).fill(0)
  const tokens = tokenize(text)

  if (tokens.length === 0) {
    return vector
  }

  for (const token of tokens) {
    const index = hashToken(token) % dimension
    vector[index] += 1
  }

  return normalizeVector(vector)
}

function tokenize(text: string) {
  const normalized = text.toLowerCase()
  const tokens = normalized.match(/[\p{L}\p{N}_-]+/gu)
  return tokens ?? []
}

function hashToken(token: string) {
  let hash = 2166136261
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0) + 1
}

function normalizeVector(vector: number[]) {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  if (norm === 0) {
    return vector
  }

  return vector.map((value) => value / norm)
}

function fitVectorDimension(vector: number[] | undefined, dimension: number) {
  const next = createZeroVector(dimension)

  if (!Array.isArray(vector)) {
    return next
  }

  const limit = Math.min(dimension, vector.length)
  for (let index = 0; index < limit; index += 1) {
    const value = vector[index]
    next[index] = Number.isFinite(value) ? value : 0
  }

  return normalizeVector(next)
}

function createZeroVector(dimension: number) {
  return new Array<number>(dimension).fill(0)
}

function cosineSimilarity(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length)
  let dot = 0

  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index]
  }

  return Math.max(0, Math.min(1, dot))
}

function computeRecencyScore(currentTick: number, createdTick: number) {
  const age = Math.max(0, currentTick - createdTick)
  return 1 / (1 + age / 10)
}

function compactText(text: string, maxChars: number) {
  if (text.length <= maxChars) {
    return text
  }

  return `${text.slice(0, Math.max(0, maxChars - 3))}...`
}

function normalizeDimension(value: number) {
  if (!Number.isFinite(value)) {
    return 192
  }

  return Math.max(64, Math.min(3072, Math.round(value)))
}

function normalizeEmbeddingEndpoint(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, '')
  return normalized.endsWith('/embeddings') ? normalized : `${normalized}/embeddings`
}

function buildHeaders(apiKey?: string) {
  return {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  }
}

async function buildEmbeddingErrorMessage(response: Response) {
  const fallback = `embedding request failed with HTTP ${response.status}`

  try {
    const rawText = await response.text()
    if (!rawText.trim()) {
      return fallback
    }

    const payload = JSON.parse(rawText) as OpenAICompatibleEmbeddingResponse
    const message = payload.error?.message?.trim()
    return message ? `embedding endpoint responded with error: ${message}` : `${fallback} ${rawText}`
  } catch {
    return fallback
  }
}

let nextEmbeddingApiKeyIndex = 0

function rotateApiKeys(apiKeys: string[]) {
  if (apiKeys.length === 0) {
    return [undefined]
  }

  const startIndex = nextEmbeddingApiKeyIndex % apiKeys.length
  nextEmbeddingApiKeyIndex = (nextEmbeddingApiKeyIndex + 1) % apiKeys.length

  return [...apiKeys.slice(startIndex), ...apiKeys.slice(0, startIndex)]
}

function shouldRetryWithNextKey(status: number) {
  return status === 401 || status === 402 || status === 403 || status === 429 || status >= 500
}

function isRetryableEmbeddingError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  return /network|timeout|fetch|ECONN|ENOTFOUND/i.test(error.message)
}
