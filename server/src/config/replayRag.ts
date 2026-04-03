import { readFileSync } from 'node:fs'

export type ReplayRagEmbeddingProvider = 'hash' | 'openai_compat'

export type ResolvedReplayRagConfig = {
  provider: ReplayRagEmbeddingProvider
  topK: number
  maxExcerptChars: number
  embeddingDimension: number
  timeoutMs: number
  failOpen: boolean
  baseUrl?: string
  apiKeys: string[]
  model?: string
}

const DEFAULT_PROVIDER: ReplayRagEmbeddingProvider = 'hash'
const DEFAULT_TOP_K = 3
const DEFAULT_MAX_EXCERPT_CHARS = 220
const DEFAULT_EMBEDDING_DIMENSION = 192
const DEFAULT_TIMEOUT_MS = 6000
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small'
const DEFAULT_EMBEDDING_BASE_URL = 'http://127.0.0.1:8080/v1'

export function resolveReplayRagConfig(): ResolvedReplayRagConfig {
  const provider = readProvider()
  const topK = readNumberEnv('REPLAY_RAG_TOP_K', DEFAULT_TOP_K, 1, 8)
  const maxExcerptChars = readNumberEnv('REPLAY_RAG_MAX_EXCERPT_CHARS', DEFAULT_MAX_EXCERPT_CHARS, 80, 1200)
  const embeddingDimension = readNumberEnv(
    'REPLAY_RAG_EMBEDDING_DIMENSION',
    DEFAULT_EMBEDDING_DIMENSION,
    64,
    3072,
  )
  const timeoutMs = readNumberEnv('REPLAY_RAG_EMBEDDING_TIMEOUT_MS', DEFAULT_TIMEOUT_MS, 1000, 30000)
  const failOpen = readBooleanEnv('REPLAY_RAG_FAIL_OPEN', true)

  if (provider === 'hash') {
    return {
      provider,
      topK,
      maxExcerptChars,
      embeddingDimension,
      timeoutMs,
      failOpen,
      apiKeys: [],
    }
  }

  const baseUrl = normalizeEmbeddingBaseUrl(
    readOptionalEnv('REPLAY_RAG_EMBEDDING_URL') ??
      readOptionalEnv('LLM_RELAY_URL') ??
      readOptionalEnv('LOCAL_MODEL_ENDPOINT') ??
      DEFAULT_EMBEDDING_BASE_URL,
  )

  return {
    provider,
    topK,
    maxExcerptChars,
    embeddingDimension,
    timeoutMs,
    failOpen,
    baseUrl,
    apiKeys: readEmbeddingApiKeys(),
    model:
      readOptionalEnv('REPLAY_RAG_EMBEDDING_MODEL') ??
      readOptionalEnv('LLM_RELAY_EMBEDDING_MODEL') ??
      DEFAULT_EMBEDDING_MODEL,
  }
}

function readProvider(): ReplayRagEmbeddingProvider {
  const rawProvider = readOptionalEnv('REPLAY_RAG_PROVIDER') ?? DEFAULT_PROVIDER

  if (rawProvider === 'hash' || rawProvider === 'openai_compat') {
    return rawProvider
  }

  throw new Error(`unsupported REPLAY_RAG_PROVIDER: ${rawProvider}`)
}

function normalizeEmbeddingBaseUrl(baseUrl: string) {
  const normalized = trimTrailingSlash(baseUrl)

  if (normalized.endsWith('/embeddings')) {
    return normalized.slice(0, -'/embeddings'.length)
  }

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

function trimTrailingSlash(value: string) {
  return value.trim().replace(/\/+$/, '')
}

function readNumberEnv(name: string, fallback: number, min: number, max: number) {
  const raw = Number(process.env[name] ?? fallback)
  if (!Number.isFinite(raw)) {
    return fallback
  }

  return Math.max(min, Math.min(max, Math.round(raw)))
}

function readBooleanEnv(name: string, fallback: boolean) {
  const raw = process.env[name]?.trim().toLowerCase()
  if (!raw) {
    return fallback
  }

  if (['1', 'true', 'yes', 'on'].includes(raw)) {
    return true
  }

  if (['0', 'false', 'no', 'off'].includes(raw)) {
    return false
  }

  return fallback
}

function readEmbeddingApiKeys() {
  const tokens = [
    ...parseTokenList(readOptionalEnv('REPLAY_RAG_EMBEDDING_API_KEYS')),
    ...readTokenFile(readOptionalEnv('REPLAY_RAG_EMBEDDING_API_KEYS_FILE')),
    ...parseTokenList(readOptionalEnv('REPLAY_RAG_EMBEDDING_API_KEY')),
    ...parseTokenList(readOptionalEnv('LLM_RELAY_API_KEYS')),
    ...parseTokenList(readOptionalEnv('LLM_RELAY_API_KEY')),
    ...parseTokenList(readOptionalEnv('OPENAI_API_KEY')),
  ]

  return Array.from(new Set(tokens))
}

function readTokenFile(filePath: string | undefined) {
  if (!filePath) {
    return []
  }

  try {
    return parseTokenList(readFileSync(filePath, 'utf-8'))
  } catch (error) {
    throw new Error(
      `failed to read REPLAY_RAG_EMBEDDING_API_KEYS_FILE: ${
        error instanceof Error ? error.message : 'unknown'
      }`,
    )
  }
}

function readOptionalEnv(name: string) {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

function parseTokenList(rawValue: string | undefined) {
  if (!rawValue) {
    return []
  }

  return rawValue
    .split(/[\r\n,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}
