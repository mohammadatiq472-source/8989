import { existsSync, readFileSync, renameSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { AiConfigResponse, AiHubConfig } from '../../../../shared/contracts/game'
import { aiHubConfigSchema } from '../../../../shared/schemas/ai'

const DEFAULT_FACTION_ID = 'neutral'
const AI_CONFIG_PERSIST_PATH =
  process.env.AI_HUB_CONFIG_STORE_PATH?.trim() || join(process.cwd(), 'tmp', 'ai_hub_configs.json')
const AI_CONFIG_PERSIST_DEBOUNCE_MS = 1_500
const AI_CONFIG_PERSIST_VERSION = 2
const MAX_CONFIG_FACTIONS = 256
const MAX_FACTION_ID_LENGTH = 64

const defaultConfig: AiHubConfig = {
  automationEnabled: true,
  plannerFrequency: 2,
  riskPreference: 'balanced',
  doctrinePrompt: process.env.AI_DOCTRINE_PROMPT?.trim() || 'Secure passes first, then expand macro regions.',
  models: {
    commander: process.env.LLM_RELAY_MODEL?.trim() || process.env.LOCAL_MODEL_NAME?.trim() || 'qwen/qwen3.5-flash-02-23',
    general: process.env.LLM_RELAY_MODEL?.trim() || process.env.LOCAL_MODEL_NAME?.trim() || 'qwen/qwen3.5-flash-02-23',
    unit: process.env.LLM_RELAY_MODEL?.trim() || process.env.LOCAL_MODEL_NAME?.trim() || 'qwen/qwen3.5-flash-02-23',
  },
}

type PersistedAiHubConfigStore = {
  version?: number
  savedAt?: string
  configs?: Record<string, unknown>
  updatedAt?: Record<string, unknown>
}

const aiHubConfigByFaction = new Map<string, AiHubConfig>()
const updatedAtByFaction = new Map<string, string>()

let loaded = false
let persistDirty = false
let persistTimer: ReturnType<typeof setTimeout> | null = null
let persistInFlight: Promise<void> | null = null
let persistSuccessCount = 0
let persistFailureCount = 0
let lastPersistAt: number | null = null
let lastPersistErrorAt: number | null = null
let corruptQuarantineCount = 0
let lastCorruptQuarantineAt: number | null = null

function quarantineCorruptStoreFile() {
  try {
    if (!existsSync(AI_CONFIG_PERSIST_PATH)) {
      return
    }

    const quarantinedPath = `${AI_CONFIG_PERSIST_PATH}.corrupt.${Date.now()}`
    renameSync(AI_CONFIG_PERSIST_PATH, quarantinedPath)
    corruptQuarantineCount += 1
    lastCorruptQuarantineAt = Date.now()
    console.warn(`[AiConfigService] quarantined corrupt store file: ${quarantinedPath}`)
  } catch {
    // keep non-fatal behavior; continue with in-memory defaults
  }
}

function resolvePersistedStore(input: unknown): PersistedAiHubConfigStore {
  if (!input || typeof input !== 'object') {
    return {}
  }
  return input as PersistedAiHubConfigStore
}

function normalizeFactionId(factionId?: string): string {
  const normalized = factionId?.trim()
  if (!normalized) {
    return DEFAULT_FACTION_ID
  }
  return normalized.slice(0, MAX_FACTION_ID_LENGTH)
}

function ensureLoaded() {
  if (loaded) {
    return
  }

  loaded = true
  aiHubConfigByFaction.clear()
  updatedAtByFaction.clear()

  try {
    if (!existsSync(AI_CONFIG_PERSIST_PATH)) {
      return
    }

    const raw = readFileSync(AI_CONFIG_PERSIST_PATH, 'utf8')
    const parsed = resolvePersistedStore(JSON.parse(raw) as unknown)
    const configs = parsed.configs && typeof parsed.configs === 'object' ? parsed.configs : {}
    const updatedAt = parsed.updatedAt && typeof parsed.updatedAt === 'object' ? parsed.updatedAt : {}

    for (const [factionIdRaw, configRaw] of Object.entries(configs)) {
      const factionId = normalizeFactionId(factionIdRaw)
      const validated = aiHubConfigSchema.safeParse(configRaw)
      if (!validated.success) {
        continue
      }

      aiHubConfigByFaction.set(factionId, structuredClone(validated.data))
      const updatedRaw = (updatedAt as Record<string, unknown>)[factionIdRaw]
      const updated = sanitizeUpdatedAt(updatedRaw)
      if (updated) {
        updatedAtByFaction.set(factionId, updated)
      }

      if (aiHubConfigByFaction.size >= MAX_CONFIG_FACTIONS) {
        break
      }
    }
  } catch {
    aiHubConfigByFaction.clear()
    updatedAtByFaction.clear()
    quarantineCorruptStoreFile()
  }
}

function sanitizeUpdatedAt(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null
  }
  const timestamp = Date.parse(input)
  if (!Number.isFinite(timestamp)) {
    return null
  }
  return new Date(timestamp).toISOString()
}

function schedulePersist() {
  persistDirty = true
  if (persistTimer) {
    return
  }

  persistTimer = setTimeout(() => {
    persistTimer = null
    void drainPersistQueue()
  }, AI_CONFIG_PERSIST_DEBOUNCE_MS)
}

function buildPersistedPayload(): PersistedAiHubConfigStore {
  const configs: Record<string, AiHubConfig> = {}
  const updatedAt: Record<string, string> = {}

  for (const [factionId, config] of aiHubConfigByFaction.entries()) {
    configs[factionId] = structuredClone(config)
    const storedUpdatedAt = updatedAtByFaction.get(factionId)
    if (storedUpdatedAt) {
      updatedAt[factionId] = storedUpdatedAt
    }
  }

  return {
    version: AI_CONFIG_PERSIST_VERSION,
    savedAt: new Date().toISOString(),
    configs,
    updatedAt,
  }
}

async function drainPersistQueue(): Promise<void> {
  if (persistInFlight) {
    await persistInFlight
    return
  }

  if (!persistDirty) {
    return
  }

  persistInFlight = (async () => {
    try {
      while (persistDirty) {
        persistDirty = false
        const payload = JSON.stringify(buildPersistedPayload(), null, 2)
        const tmpPath = `${AI_CONFIG_PERSIST_PATH}.tmp`
        await mkdir(dirname(AI_CONFIG_PERSIST_PATH), { recursive: true })
        await writeFile(tmpPath, payload, 'utf8')
        await rename(tmpPath, AI_CONFIG_PERSIST_PATH)
        persistSuccessCount += 1
        lastPersistAt = Date.now()
      }
    } catch {
      persistDirty = true
      persistFailureCount += 1
      lastPersistErrorAt = Date.now()
    } finally {
      persistInFlight = null
      if (persistDirty) {
        schedulePersist()
      }
    }
  })()

  await persistInFlight
}

export async function flushAiHubConfigPersist(): Promise<void> {
  ensureLoaded()

  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }

  if (!persistDirty) {
    if (persistInFlight) {
      await persistInFlight
    }
    return
  }

  await drainPersistQueue()
}

export function getAiHubConfigPersistHealth() {
  return {
    path: AI_CONFIG_PERSIST_PATH,
    loaded,
    factionCount: aiHubConfigByFaction.size,
    persistDirty,
    persistInFlight: Boolean(persistInFlight),
    persistSuccessCount,
    persistFailureCount,
    lastPersistAt,
    lastPersistErrorAt,
    corruptQuarantineCount,
    lastCorruptQuarantineAt,
  }
}

function resolveConfigForFaction(factionId: string): AiHubConfig {
  ensureLoaded()
  return aiHubConfigByFaction.get(factionId) ?? defaultConfig
}

function resolveUpdatedAtForFaction(factionId: string): string {
  ensureLoaded()
  return updatedAtByFaction.get(factionId) ?? new Date(0).toISOString()
}

export function getAiHubConfig(factionId?: string): AiConfigResponse {
  ensureLoaded()
  const normalizedFactionId = normalizeFactionId(factionId)
  return {
    config: structuredClone(resolveConfigForFaction(normalizedFactionId)),
    updatedAt: resolveUpdatedAtForFaction(normalizedFactionId),
    factionId: normalizedFactionId,
  }
}

export function updateAiHubConfig(config: AiHubConfig, factionId?: string): AiConfigResponse {
  ensureLoaded()
  const normalizedFactionId = normalizeFactionId(factionId)
  const validated = aiHubConfigSchema.parse(config)
  const nextUpdatedAt = new Date().toISOString()
  aiHubConfigByFaction.set(normalizedFactionId, structuredClone(validated))
  updatedAtByFaction.set(normalizedFactionId, nextUpdatedAt)
  schedulePersist()

  return {
    config: structuredClone(validated),
    updatedAt: nextUpdatedAt,
    factionId: normalizedFactionId,
  }
}
