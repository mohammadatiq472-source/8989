import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, renameSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * Per-faction configuration storage.
 * Stores doctrine and model/BYOK settings and now persists to disk.
 */

export interface FactionModelConfig {
  /** Base model id for planner fallback */
  model: string
  /** Optional BYOK API key */
  apiKey?: string
  /** Optional custom model endpoint */
  baseUrl?: string
  /** Per-role model override */
  commanderModel?: string
  generalModel?: string
  unitModel?: string
}

export interface FactionConfig {
  factionId: string
  doctrine?: string
  modelConfig?: FactionModelConfig
  updatedAt: number
}

const store = new Map<string, FactionConfig>()
const FACTION_CONFIG_PERSIST_PATH =
  process.env.FACTION_CONFIG_STORE_PATH?.trim() || join(process.cwd(), 'tmp', 'faction_configs.json')
const FACTION_CONFIG_PERSIST_DEBOUNCE_MS = 1_500
const FACTION_CONFIG_PERSIST_VERSION = 2
const MAX_FACTION_CONFIGS = 256
const MAX_FACTION_ID_LENGTH = 64
const MAX_DOCTRINE_LENGTH = 1000
const MAX_MODEL_FIELD_LENGTH = 100
const MAX_SECRET_FIELD_LENGTH = 200
const MAX_PERSISTED_SECRET_FIELD_LENGTH = 1024
const APIKEY_ENCRYPTED_PREFIX = 'enc:v1:'
const APIKEY_ENCRYPTION_IV_BYTES = 12
const APIKEY_ENCRYPTION_TAG_BYTES = 16
const APIKEY_ENCRYPTION_KEY_ENV = 'FACTION_APIKEY_ENCRYPTION_KEY'
const APIKEY_ALLOW_PLAINTEXT_ENV = 'FACTION_APIKEY_ALLOW_PLAINTEXT_PERSIST'

let loaded = false
let persistDirty = false
let persistTimer: ReturnType<typeof setTimeout> | null = null
let persistInFlight: Promise<void> | null = null
let encryptionKeyCache: Buffer | null | undefined
let warnedMissingEncryptionKeyPersist = false
let warnedMissingEncryptionKeyDecrypt = false
let warnedDecryptFailure = false
let warnedPlaintextApiKeyDropped = false
let persistSuccessCount = 0
let persistFailureCount = 0
let lastPersistAt: number | null = null
let lastPersistErrorAt: number | null = null
let corruptQuarantineCount = 0
let lastCorruptQuarantineAt: number | null = null

type PersistedFactionConfigStore = {
  version?: number
  savedAt?: string
  items?: unknown
}

const DEFAULT_DOCTRINE =
  process.env.AI_DOCTRINE_PROMPT ??
  'Secure strategic passes and resource tiles. Expand when supply is sufficient. Defend under pressure. Scout before advancing.'

function quarantineCorruptStoreFile() {
  try {
    if (!existsSync(FACTION_CONFIG_PERSIST_PATH)) {
      return
    }

    const quarantinedPath = `${FACTION_CONFIG_PERSIST_PATH}.corrupt.${Date.now()}`
    renameSync(FACTION_CONFIG_PERSIST_PATH, quarantinedPath)
    corruptQuarantineCount += 1
    lastCorruptQuarantineAt = Date.now()
    console.warn(`[FactionConfigStore] quarantined corrupt store file: ${quarantinedPath}`)
  } catch {
    // keep non-fatal behavior; store stays in-memory only
  }
}

function resolvePersistedItems(input: unknown): unknown[] {
  if (Array.isArray(input)) {
    return input
  }

  if (!input || typeof input !== 'object') {
    return []
  }

  const envelope = input as PersistedFactionConfigStore
  return Array.isArray(envelope.items) ? envelope.items : []
}

function buildPersistedPayload(): PersistedFactionConfigStore {
  return {
    version: FACTION_CONFIG_PERSIST_VERSION,
    savedAt: new Date().toISOString(),
    items: Array.from(store.values(), (item) => toPersistedFactionConfig(item)),
  }
}

function allowPlaintextApiKeyPersist() {
  const raw = process.env[APIKEY_ALLOW_PLAINTEXT_ENV]?.trim().toLowerCase()
  if (!raw) {
    return false
  }

  return ['1', 'true', 'yes', 'on'].includes(raw)
}

function getApiKeyEncryptionKey(): Buffer | null {
  if (encryptionKeyCache !== undefined) {
    return encryptionKeyCache
  }

  const raw = process.env[APIKEY_ENCRYPTION_KEY_ENV]?.trim()
  if (!raw) {
    encryptionKeyCache = null
    return encryptionKeyCache
  }

  encryptionKeyCache = createHash('sha256').update(raw, 'utf8').digest()
  return encryptionKeyCache
}

function encryptApiKey(apiKey: string): string | undefined {
  const key = getApiKeyEncryptionKey()
  if (!key) {
    if (!warnedMissingEncryptionKeyPersist) {
      warnedMissingEncryptionKeyPersist = true
      console.warn(
        `[FactionConfigStore] ${APIKEY_ENCRYPTION_KEY_ENV} not set; BYOK apiKey will not be persisted unless ${APIKEY_ALLOW_PLAINTEXT_ENV}=1`,
      )
    }
    return undefined
  }

  try {
    const iv = randomBytes(APIKEY_ENCRYPTION_IV_BYTES)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const encrypted = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return `${APIKEY_ENCRYPTED_PREFIX}${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`
  } catch {
    return undefined
  }
}

function decryptApiKey(raw: string): string | undefined {
  if (!raw.startsWith(APIKEY_ENCRYPTED_PREFIX)) {
    if (allowPlaintextApiKeyPersist()) {
      return raw
    }

    if (!warnedPlaintextApiKeyDropped) {
      warnedPlaintextApiKeyDropped = true
      console.warn(
        `[FactionConfigStore] plaintext BYOK apiKey found in persisted store; set ${APIKEY_ALLOW_PLAINTEXT_ENV}=1 only for one-time legacy migration`,
      )
    }
    return undefined
  }

  const key = getApiKeyEncryptionKey()
  if (!key) {
    if (!warnedMissingEncryptionKeyDecrypt) {
      warnedMissingEncryptionKeyDecrypt = true
      console.warn(
        `[FactionConfigStore] encrypted BYOK apiKey found but ${APIKEY_ENCRYPTION_KEY_ENV} is missing; apiKey will be dropped`,
      )
    }
    return undefined
  }

  try {
    const encoded = raw.slice(APIKEY_ENCRYPTED_PREFIX.length)
    const [ivRaw, tagRaw, encryptedRaw] = encoded.split('.')
    if (!ivRaw || !tagRaw || !encryptedRaw) {
      return undefined
    }

    const iv = Buffer.from(ivRaw, 'base64')
    const tag = Buffer.from(tagRaw, 'base64')
    const encrypted = Buffer.from(encryptedRaw, 'base64')
    if (iv.length !== APIKEY_ENCRYPTION_IV_BYTES || tag.length !== APIKEY_ENCRYPTION_TAG_BYTES) {
      return undefined
    }

    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
    return decrypted
  } catch {
    if (!warnedDecryptFailure) {
      warnedDecryptFailure = true
      console.warn('[FactionConfigStore] failed to decrypt persisted BYOK apiKey; value dropped')
    }
    return undefined
  }
}

function toPersistedFactionConfig(input: FactionConfig): FactionConfig {
  const sanitizedModel = sanitizeModelConfig(input.modelConfig, false)
  let persistedApiKey: string | undefined
  if (sanitizedModel?.apiKey) {
    persistedApiKey = encryptApiKey(sanitizedModel.apiKey)
    if (!persistedApiKey && allowPlaintextApiKeyPersist()) {
      persistedApiKey = sanitizedModel.apiKey.slice(0, MAX_SECRET_FIELD_LENGTH)
    }
  }

  return {
    factionId: normalizeFactionId(input.factionId) ?? 'unknown',
    doctrine: sanitizeDoctrine(input.doctrine),
    modelConfig: sanitizedModel
      ? {
          ...sanitizedModel,
          apiKey: persistedApiKey,
        }
      : undefined,
    updatedAt: sanitizeUpdatedAt(input.updatedAt),
  }
}

function ensureLoaded() {
  if (loaded) {
    return
  }

  loaded = true
  store.clear()

  try {
    if (!existsSync(FACTION_CONFIG_PERSIST_PATH)) {
      return
    }

    const raw = readFileSync(FACTION_CONFIG_PERSIST_PATH, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    const items = resolvePersistedItems(parsed)

    for (const item of items) {
      const next = sanitizeFactionConfig(item)
      if (!next) {
        continue
      }
      store.set(next.factionId, next)
      if (store.size >= MAX_FACTION_CONFIGS) {
        break
      }
    }
  } catch {
    store.clear()
    quarantineCorruptStoreFile()
  }
}

function normalizeFactionId(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null
  }

  const normalized = input.trim()
  if (!normalized) {
    return null
  }

  return normalized.slice(0, MAX_FACTION_ID_LENGTH)
}

function sanitizeDoctrine(input: unknown): string | undefined {
  if (typeof input !== 'string') {
    return undefined
  }

  const normalized = input.trim()
  if (!normalized) {
    return undefined
  }

  return normalized.slice(0, MAX_DOCTRINE_LENGTH)
}

function sanitizeModelConfig(input: unknown, fromPersistedStore: boolean): FactionModelConfig | undefined {
  if (!input || typeof input !== 'object') {
    return undefined
  }

  const source = input as Partial<FactionModelConfig>
  if (typeof source.model !== 'string' || source.model.trim().length === 0) {
    return undefined
  }

  const rawApiKey = typeof source.apiKey === 'string'
    ? source.apiKey.slice(0, MAX_PERSISTED_SECRET_FIELD_LENGTH)
    : undefined
  const decryptedApiKey = rawApiKey
    ? (fromPersistedStore ? decryptApiKey(rawApiKey) : rawApiKey)
    : undefined

  return {
    model: source.model.trim().slice(0, MAX_MODEL_FIELD_LENGTH),
    apiKey: decryptedApiKey ? decryptedApiKey.slice(0, MAX_SECRET_FIELD_LENGTH) : undefined,
    baseUrl: typeof source.baseUrl === 'string' ? source.baseUrl.slice(0, MAX_SECRET_FIELD_LENGTH) : undefined,
    commanderModel: typeof source.commanderModel === 'string'
      ? source.commanderModel.slice(0, MAX_MODEL_FIELD_LENGTH)
      : undefined,
    generalModel: typeof source.generalModel === 'string'
      ? source.generalModel.slice(0, MAX_MODEL_FIELD_LENGTH)
      : undefined,
    unitModel: typeof source.unitModel === 'string'
      ? source.unitModel.slice(0, MAX_MODEL_FIELD_LENGTH)
      : undefined,
  }
}

function sanitizeUpdatedAt(input: unknown): number {
  const parsed = typeof input === 'number' ? input : Number(input)
  if (!Number.isFinite(parsed)) {
    return Date.now()
  }
  return Math.max(0, Math.floor(parsed))
}

function sanitizeFactionConfig(input: unknown): FactionConfig | null {
  if (!input || typeof input !== 'object') {
    return null
  }

  const source = input as Partial<FactionConfig>
  const factionId = normalizeFactionId(source.factionId)
  if (!factionId) {
    return null
  }

  return {
    factionId,
    doctrine: sanitizeDoctrine(source.doctrine),
    modelConfig: sanitizeModelConfig(source.modelConfig, true),
    updatedAt: sanitizeUpdatedAt(source.updatedAt),
  }
}

function schedulePersist() {
  persistDirty = true
  if (persistTimer) {
    return
  }

  persistTimer = setTimeout(() => {
    persistTimer = null
    void drainPersistQueue()
  }, FACTION_CONFIG_PERSIST_DEBOUNCE_MS)
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
        const tmpPath = `${FACTION_CONFIG_PERSIST_PATH}.tmp`
        await mkdir(dirname(FACTION_CONFIG_PERSIST_PATH), { recursive: true })
        await writeFile(tmpPath, payload, 'utf8')
        await rename(tmpPath, FACTION_CONFIG_PERSIST_PATH)
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

export async function flushFactionConfigPersist(): Promise<void> {
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

export function getFactionConfigPersistHealth() {
  const keyConfigured = Boolean(getApiKeyEncryptionKey())
  const allowPlaintext = allowPlaintextApiKeyPersist()
  const secretPersistMode = keyConfigured ? 'encrypted' : (allowPlaintext ? 'plaintext' : 'memory_only')

  return {
    path: FACTION_CONFIG_PERSIST_PATH,
    loaded,
    entryCount: store.size,
    persistDirty,
    persistInFlight: Boolean(persistInFlight),
    persistSuccessCount,
    persistFailureCount,
    lastPersistAt,
    lastPersistErrorAt,
    corruptQuarantineCount,
    lastCorruptQuarantineAt,
    security: {
      secretPersistMode,
      encryptionKeyConfigured: keyConfigured,
      allowPlaintextPersist: allowPlaintext,
    },
  }
}

export function getFactionDoctrine(factionId: string): string {
  ensureLoaded()
  return store.get(factionId)?.doctrine ?? DEFAULT_DOCTRINE
}

export function getDefaultDoctrine(): string {
  return DEFAULT_DOCTRINE
}

export function getFactionModelConfig(factionId: string): FactionModelConfig | undefined {
  ensureLoaded()
  return structuredClone(store.get(factionId)?.modelConfig)
}

export function getFactionConfig(factionId: string): FactionConfig | undefined {
  ensureLoaded()
  return structuredClone(store.get(factionId))
}

export function getAllFactionConfigs(): FactionConfig[] {
  ensureLoaded()
  return Array.from(store.values(), (item) => structuredClone(item))
}

export function setFactionDoctrine(factionId: string, doctrine: string): void {
  ensureLoaded()
  const normalizedFactionId = normalizeFactionId(factionId)
  if (!normalizedFactionId) {
    return
  }

  const existing = store.get(normalizedFactionId) ?? { factionId: normalizedFactionId, updatedAt: 0 }
  store.set(normalizedFactionId, {
    ...existing,
    doctrine: sanitizeDoctrine(doctrine),
    updatedAt: Date.now(),
  })
  schedulePersist()
}

export function setFactionModelConfig(factionId: string, config: FactionModelConfig): void {
  ensureLoaded()
  const normalizedFactionId = normalizeFactionId(factionId)
  if (!normalizedFactionId) {
    return
  }

  const nextModelConfig = sanitizeModelConfig(config, false)
  if (!nextModelConfig) {
    return
  }

  const existing = store.get(normalizedFactionId) ?? { factionId: normalizedFactionId, updatedAt: 0 }
  store.set(normalizedFactionId, {
    ...existing,
    modelConfig: nextModelConfig,
    updatedAt: Date.now(),
  })
  schedulePersist()
}

export function clearFactionConfig(factionId: string): void {
  ensureLoaded()
  const normalizedFactionId = normalizeFactionId(factionId)
  if (!normalizedFactionId) {
    return
  }

  if (store.delete(normalizedFactionId)) {
    schedulePersist()
  }
}
