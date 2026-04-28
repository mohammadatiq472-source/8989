import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, renameSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type {
  AiPlayerModelBudgetTier,
  AiPlayerModelByokSource,
  AiPlayerModelRoutingSource,
} from '../../../../shared/contracts/aiPlayer'
import type {
  AiPlayerProviderAuditEvent,
  AiPlayerProviderAuditEventType,
  AiPlayerProviderBillingAccountType,
  AiPlayerProviderBillingLedgerEntry,
  AiPlayerProviderBillingUsage,
  AiPlayerProviderBudgetLimitMode,
  AiPlayerProviderBudgetWindow,
  AiPlayerProviderPlayerKeyReadModel,
  AiPlayerProviderPlayerKeyStatus,
  UpsertAiPlayerProviderPlayerKeyRequest,
} from '../../../../shared/contracts/aiPlayerProviderAccount'

type StoredPlayerKeyConfig = {
  ownerPlayerId: string
  model: string
  provider?: string
  baseUrl?: string
  apiKey?: string
  keyFingerprint: string | null
  status: AiPlayerProviderPlayerKeyStatus
  createdAt: string
  updatedAt: string
  revokedAt?: string
}

type PersistedPlayerKeyConfig = Omit<StoredPlayerKeyConfig, 'apiKey'> & {
  apiKey?: string
}

type PersistedProviderAccountStore = {
  version?: number
  savedAt?: string
  playerKeys?: unknown
  billingLedger?: unknown
  auditEvents?: unknown
  budgetWindows?: unknown
  budgetReservations?: unknown
  externalLedgerAuditOutbox?: unknown
}

type ActivePlayerModelConfig = {
  ownerPlayerId: string
  model: string
  provider?: string
  baseUrl?: string
  apiKey: string
  keyFingerprint: string | null
}

type ProviderAccountingSelectedProvider = {
  model: string
  provider: string
  source: AiPlayerModelRoutingSource
  byokSource: AiPlayerModelByokSource
  priority: number
}

type ProviderAccountingFailure = {
  model: string
  source: AiPlayerModelRoutingSource
  byokSource: AiPlayerModelByokSource
  priority: number
  error: string
}

type RecordProviderAccountingInput = {
  ok: boolean
  requestId?: string
  aiPlayerId: string
  factionId: string
  governorPlayerId: string
  selectedProvider?: ProviderAccountingSelectedProvider | null
  providerFallbackFailures?: ProviderAccountingFailure[]
  usage?: unknown
  error?: string
  queueRunId?: string
  idempotencyKey?: string
  budgetWindowKey?: string
  budgetReservationId?: string
}

type ProviderBudgetAccountInput = {
  byokSource: AiPlayerModelByokSource
  factionId: string
  governorPlayerId: string
}

type ReserveProviderBudgetInput = {
  aiPlayerId?: string
  factionId: string
  governorPlayerId: string
  model: string
  provider: string
  source: AiPlayerModelRoutingSource
  byokSource: AiPlayerModelByokSource
  budgetTier?: AiPlayerModelBudgetTier
  queueRunId?: string
  idempotencyKey?: string
}

type ProviderBudgetReservation = {
  reservationId: string
  budgetWindowKey: string
  reservedAt: string
  expiresAt: string
  aiPlayerId?: string
  factionId: string
  governorPlayerId: string
  model: string
  provider: string
  source: AiPlayerModelRoutingSource
  byokSource: AiPlayerModelByokSource
  budgetTier: AiPlayerModelBudgetTier
  queueRunId?: string
  idempotencyKey?: string
}

type ProviderBudgetReservationOk = {
  ok: true
  reservationId: string
  budgetWindowKey: string
  budgetTier: AiPlayerModelBudgetTier
  limitMode: AiPlayerProviderBudgetLimitMode
  remainingRuns: number | null
  remainingTotalTokens: number | null
  window: AiPlayerProviderBudgetWindow
}

type ProviderBudgetReservationDenied = {
  ok: false
  error: 'provider_budget_disabled' | 'provider_budget_exhausted' | 'provider_budget_gate_unavailable'
  budgetWindowKey: string
  budgetTier: AiPlayerModelBudgetTier
  limitMode: AiPlayerProviderBudgetLimitMode
  remainingRuns: number | null
  remainingTotalTokens: number | null
  window: AiPlayerProviderBudgetWindow
}

export type ProviderBudgetReservationResult = ProviderBudgetReservationOk | ProviderBudgetReservationDenied

type ProviderBudgetLimits = {
  limitMode: AiPlayerProviderBudgetLimitMode
  maxRuns: number | null
  maxPromptTokens: number | null
  maxCompletionTokens: number | null
  maxTotalTokens: number | null
  maxEstimatedCostUsd: number | null
}

type ExternalLedgerAuditPayload = {
  schemaVersion: 1
  source: 'ai-player-provider-account-store'
  sentAt: string
  billingLedgerEntries: AiPlayerProviderBillingLedgerEntry[]
  auditEvents: AiPlayerProviderAuditEvent[]
}

type ExternalLedgerAuditOutboxItem = ExternalLedgerAuditPayload & {
  outboxId: string
  idempotencyKey: string
  createdAt: string
  nextAttemptAt: string
  attemptCount: number
  lastError?: string
}

type ExternalBudgetGateOperation = 'reserve' | 'commit' | 'release'

type ExternalBudgetGatePayload = {
  schemaVersion: 1
  source: 'ai-player-provider-account-store'
  operation: ExternalBudgetGateOperation
  sentAt: string
  reservationId?: string
  reserve?: ReserveProviderBudgetInput & {
    billingAccountType: AiPlayerProviderBillingAccountType
    billingAccountId: string | null
    budgetWindowKey: string
    windowStartedAt: string
    windowEndsAt: string
    localLimitMode: AiPlayerProviderBudgetLimitMode
    maxRuns: number | null
    maxPromptTokens: number | null
    maxCompletionTokens: number | null
    maxTotalTokens: number | null
    maxEstimatedCostUsd: number | null
    expiresAt: string
  }
  commit?: {
    usage?: AiPlayerProviderBillingUsage
    ok?: boolean
    error?: string
  }
}

type ExternalBudgetGateResponse = {
  ok?: unknown
  error?: unknown
  reservationId?: unknown
  budgetWindowKey?: unknown
  budgetTier?: unknown
  limitMode?: unknown
  remainingRuns?: unknown
  remainingTotalTokens?: unknown
  window?: unknown
}

const STORE_PATH =
  process.env.AI_PLAYER_PROVIDER_ACCOUNT_STORE_PATH?.trim()
    || join(process.cwd(), 'tmp', 'ai_player_provider_accounts.json')
const STORE_PERSIST_VERSION = 1
const STORE_PERSIST_DEBOUNCE_MS = 1_500
const MAX_PLAYER_KEYS = 512
const MAX_BILLING_LEDGER_ENTRIES = 1_000
const MAX_AUDIT_EVENTS = 2_000
const MAX_BUDGET_WINDOWS = 1_000
const MAX_BUDGET_RESERVATIONS = 1_000
const MAX_EXTERNAL_LEDGER_AUDIT_OUTBOX_ITEMS = 2_000
const MAX_ID_LENGTH = 120
const MAX_MODEL_LENGTH = 160
const MAX_PROVIDER_LENGTH = 120
const MAX_BASE_URL_LENGTH = 240
const MAX_SECRET_FIELD_LENGTH = 1024
const APIKEY_ENCRYPTED_PREFIX = 'enc:v1:'
const APIKEY_ENCRYPTION_IV_BYTES = 12
const APIKEY_ENCRYPTION_TAG_BYTES = 16
const APIKEY_ENCRYPTION_KEY_ENV = 'FACTION_APIKEY_ENCRYPTION_KEY'
const APIKEY_ALLOW_PLAINTEXT_ENV = 'FACTION_APIKEY_ALLOW_PLAINTEXT_PERSIST'
const LEDGER_AUDIT_DB_URL_ENV = 'AI_PLAYER_PROVIDER_LEDGER_AUDIT_DB_URL'
const LEDGER_AUDIT_DB_TIMEOUT_MS_ENV = 'AI_PLAYER_PROVIDER_LEDGER_AUDIT_DB_TIMEOUT_MS'
const LEDGER_AUDIT_DB_HMAC_SECRET_ENV = 'AI_PLAYER_PROVIDER_LEDGER_AUDIT_DB_HMAC_SECRET'
const BUDGET_WINDOW_MS_ENV = 'AI_PLAYER_PROVIDER_BUDGET_WINDOW_MS'
const BUDGET_RESERVATION_TTL_MS_ENV = 'AI_PLAYER_PROVIDER_BUDGET_RESERVATION_TTL_MS'
const BUDGET_MAX_RUNS_ENV = 'AI_PLAYER_PROVIDER_BUDGET_MAX_RUNS_PER_WINDOW'
const BUDGET_MAX_PROMPT_TOKENS_ENV = 'AI_PLAYER_PROVIDER_BUDGET_MAX_PROMPT_TOKENS_PER_WINDOW'
const BUDGET_MAX_COMPLETION_TOKENS_ENV = 'AI_PLAYER_PROVIDER_BUDGET_MAX_COMPLETION_TOKENS_PER_WINDOW'
const BUDGET_MAX_TOTAL_TOKENS_ENV = 'AI_PLAYER_PROVIDER_BUDGET_MAX_TOTAL_TOKENS_PER_WINDOW'
const BUDGET_MAX_COST_USD_ENV = 'AI_PLAYER_PROVIDER_BUDGET_MAX_COST_USD_PER_WINDOW'
const BUDGET_GATE_URL_ENV = 'AI_PLAYER_PROVIDER_BUDGET_GATE_URL'
const BUDGET_GATE_TIMEOUT_MS_ENV = 'AI_PLAYER_PROVIDER_BUDGET_GATE_TIMEOUT_MS'
const BUDGET_GATE_HMAC_SECRET_ENV = 'AI_PLAYER_PROVIDER_BUDGET_GATE_HMAC_SECRET'
const BUDGET_GATE_FAIL_OPEN_ENV = 'AI_PLAYER_PROVIDER_BUDGET_GATE_FAIL_OPEN'
const DEFAULT_BUDGET_WINDOW_MS = 86_400_000
const DEFAULT_BUDGET_RESERVATION_TTL_MS = 120_000
const MIN_BUDGET_WINDOW_MS = 60_000
const MAX_BUDGET_WINDOW_MS = 31 * 86_400_000

const playerKeys = new Map<string, StoredPlayerKeyConfig>()
const billingLedger: AiPlayerProviderBillingLedgerEntry[] = []
const auditEvents: AiPlayerProviderAuditEvent[] = []
const providerBudgetWindows = new Map<string, AiPlayerProviderBudgetWindow>()
const providerBudgetReservations = new Map<string, ProviderBudgetReservation>()
const externalLedgerAuditOutbox: ExternalLedgerAuditOutboxItem[] = []

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
let externalLedgerAuditTimer: ReturnType<typeof setTimeout> | null = null
let externalLedgerAuditInFlight: Promise<void> | null = null
let externalLedgerAuditSuccessCount = 0
let externalLedgerAuditFailureCount = 0
let externalLedgerAuditLastSuccessAt: number | null = null
let externalLedgerAuditLastFailureAt: number | null = null
let externalLedgerAuditLastError: string | null = null
let externalBudgetGateSuccessCount = 0
let externalBudgetGateFailureCount = 0
let externalBudgetGateLastSuccessAt: number | null = null
let externalBudgetGateLastFailureAt: number | null = null
let externalBudgetGateLastError: string | null = null

function nowIso() {
  return new Date().toISOString()
}

function clipString(input: unknown, maxLength: number): string | undefined {
  if (typeof input !== 'string') {
    return undefined
  }
  const normalized = input.trim()
  return normalized ? normalized.slice(0, maxLength) : undefined
}

function sanitizeOwnerPlayerId(input: unknown): string | null {
  return clipString(input, 80) ?? null
}

function sanitizeModel(input: unknown): string | null {
  return clipString(input, MAX_MODEL_LENGTH) ?? null
}

function sanitizeProvider(input: unknown): string | undefined {
  return clipString(input, MAX_PROVIDER_LENGTH)
}

function sanitizeBaseUrl(input: unknown): string | undefined {
  return clipString(input, MAX_BASE_URL_LENGTH)
}

function sanitizeOptionalId(input: unknown): string | undefined {
  return clipString(input, MAX_ID_LENGTH)
}

function sanitizeBudgetWindowKey(input: unknown): string | undefined {
  return clipString(input, 240)
}

function sanitizeReason(input: unknown): string | undefined {
  return clipString(input, 240)
}

function readEnvUrl(name: string): string | null {
  const raw = process.env[name]?.trim()
  if (!raw) {
    return null
  }
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

function readIntegerEnv(name: string, options: { minimum?: number; maximum?: number } = {}): number | null {
  const raw = process.env[name]?.trim()
  if (!raw) {
    return null
  }
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    return null
  }
  const minimum = options.minimum ?? 0
  const maximum = options.maximum ?? Number.MAX_SAFE_INTEGER
  return Math.max(minimum, Math.min(maximum, Math.trunc(parsed)))
}

function readNumberEnv(name: string, options: { minimum?: number; maximum?: number } = {}): number | null {
  const raw = process.env[name]?.trim()
  if (!raw) {
    return null
  }
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    return null
  }
  const minimum = options.minimum ?? 0
  const maximum = options.maximum ?? Number.MAX_SAFE_INTEGER
  return Math.max(minimum, Math.min(maximum, parsed))
}

function readBudgetWindowMs() {
  return readIntegerEnv(BUDGET_WINDOW_MS_ENV, {
    minimum: MIN_BUDGET_WINDOW_MS,
    maximum: MAX_BUDGET_WINDOW_MS,
  }) ?? DEFAULT_BUDGET_WINDOW_MS
}

function readExternalLedgerAuditDbTimeoutMs() {
  return readIntegerEnv(LEDGER_AUDIT_DB_TIMEOUT_MS_ENV, { minimum: 1_000, maximum: 30_000 }) ?? 5_000
}

function readBudgetReservationTtlMs() {
  return readIntegerEnv(BUDGET_RESERVATION_TTL_MS_ENV, { minimum: 1_000, maximum: 3_600_000 })
    ?? DEFAULT_BUDGET_RESERVATION_TTL_MS
}

function readExternalBudgetGateTimeoutMs() {
  return readIntegerEnv(BUDGET_GATE_TIMEOUT_MS_ENV, { minimum: 1_000, maximum: 30_000 }) ?? 5_000
}

function readBooleanEnv(name: string) {
  const raw = process.env[name]?.trim().toLowerCase()
  if (!raw) {
    return false
  }
  return ['1', 'true', 'yes', 'on'].includes(raw)
}

function readEnvSecret(name: string): string | null {
  return process.env[name]?.trim() || null
}

function buildSignedHeaders(input: {
  body: string
  idempotencyKey: string
  signatureSecretEnv: string
}): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Idempotency-Key': input.idempotencyKey,
  }
  const secret = readEnvSecret(input.signatureSecretEnv)
  if (secret) {
    headers['X-Signature-Alg'] = 'hmac-sha256'
    headers['X-Signature'] = createHmac('sha256', secret).update(input.body, 'utf8').digest('hex')
  }
  return headers
}

function hashApiKey(apiKey: string): string {
  return `sha256:${createHash('sha256').update(apiKey, 'utf8').digest('hex').slice(0, 24)}`
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
        `[AiPlayerProviderAccountStore] ${APIKEY_ENCRYPTION_KEY_ENV} not set; player BYOK apiKey will not be persisted unless ${APIKEY_ALLOW_PLAINTEXT_ENV}=1`,
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
        `[AiPlayerProviderAccountStore] plaintext player BYOK apiKey found in persisted store; set ${APIKEY_ALLOW_PLAINTEXT_ENV}=1 only for one-time legacy migration`,
      )
    }
    return undefined
  }

  const key = getApiKeyEncryptionKey()
  if (!key) {
    if (!warnedMissingEncryptionKeyDecrypt) {
      warnedMissingEncryptionKeyDecrypt = true
      console.warn(
        `[AiPlayerProviderAccountStore] encrypted player BYOK apiKey found but ${APIKEY_ENCRYPTION_KEY_ENV} is missing; apiKey will be dropped`,
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
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
  } catch {
    if (!warnedDecryptFailure) {
      warnedDecryptFailure = true
      console.warn('[AiPlayerProviderAccountStore] failed to decrypt persisted player BYOK apiKey; value dropped')
    }
    return undefined
  }
}

function quarantineCorruptStoreFile() {
  try {
    if (!existsSync(STORE_PATH)) {
      return
    }
    const quarantinedPath = `${STORE_PATH}.corrupt.${Date.now()}`
    renameSync(STORE_PATH, quarantinedPath)
    corruptQuarantineCount += 1
    lastCorruptQuarantineAt = Date.now()
    console.warn(`[AiPlayerProviderAccountStore] quarantined corrupt store file: ${quarantinedPath}`)
  } catch {
    // Keep the app usable in memory if quarantine itself fails.
  }
}

function sanitizePersistedPlayerKey(input: unknown): StoredPlayerKeyConfig | null {
  if (!input || typeof input !== 'object') {
    return null
  }
  const source = input as Partial<PersistedPlayerKeyConfig>
  const ownerPlayerId = sanitizeOwnerPlayerId(source.ownerPlayerId)
  const model = sanitizeModel(source.model)
  if (!ownerPlayerId || !model) {
    return null
  }
  const rawApiKey = clipString(source.apiKey, MAX_SECRET_FIELD_LENGTH)
  const apiKey = rawApiKey ? decryptApiKey(rawApiKey) : undefined
  const status = source.status === 'revoked' ? 'revoked' : 'active'
  return {
    ownerPlayerId,
    model,
    provider: sanitizeProvider(source.provider),
    baseUrl: sanitizeBaseUrl(source.baseUrl),
    apiKey: apiKey ? apiKey.slice(0, MAX_SECRET_FIELD_LENGTH) : undefined,
    keyFingerprint: clipString(source.keyFingerprint, 80) ?? (apiKey ? hashApiKey(apiKey) : null),
    status,
    createdAt: clipString(source.createdAt, 80) ?? nowIso(),
    updatedAt: clipString(source.updatedAt, 80) ?? nowIso(),
    revokedAt: clipString(source.revokedAt, 80),
  }
}

function sanitizeBillingEntry(input: unknown): AiPlayerProviderBillingLedgerEntry | null {
  if (!input || typeof input !== 'object') {
    return null
  }
  const source = input as Partial<AiPlayerProviderBillingLedgerEntry>
  const ledgerEntryId = sanitizeOptionalId(source.ledgerEntryId)
  const requestId = sanitizeOptionalId(source.requestId)
  const aiPlayerId = sanitizeOwnerPlayerId(source.aiPlayerId)
  const factionId = clipString(source.factionId, 64)
  const governorPlayerId = sanitizeOwnerPlayerId(source.governorPlayerId)
  const model = sanitizeModel(source.model)
  const provider = sanitizeProvider(source.provider)
  if (!ledgerEntryId || !requestId || !aiPlayerId || !factionId || !governorPlayerId || !model || !provider) {
    return null
  }
  return {
    ledgerEntryId,
    requestId,
    aiPlayerId,
    factionId,
    governorPlayerId,
    billingAccountType: sanitizeBillingAccountType(source.billingAccountType),
    billingAccountId: sanitizeOptionalId(source.billingAccountId) ?? null,
    providerSource: sanitizeProviderSource(source.providerSource),
    byokSource: sanitizeByokSource(source.byokSource),
    model,
    provider,
    budgetTier: sanitizeBudgetTier(source.budgetTier),
    budgetWindowKey: sanitizeBudgetWindowKey(source.budgetWindowKey),
    budgetReservationId: sanitizeOptionalId(source.budgetReservationId),
    usage: sanitizeUsage(source.usage),
    queueRunId: sanitizeOptionalId(source.queueRunId),
    idempotencyKey: sanitizeOptionalId(source.idempotencyKey),
    createdAt: clipString(source.createdAt, 80) ?? nowIso(),
  }
}

function sanitizeBudgetLimitMode(input: unknown): AiPlayerProviderBudgetLimitMode {
  switch (input) {
    case 'configured':
    case 'disabled':
      return input
    case 'unlimited':
    default:
      return 'unlimited'
  }
}

function sanitizeNullableInteger(input: unknown): number | null {
  if (input === null) {
    return null
  }
  const parsed = Number(input)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null
  }
  return Math.trunc(parsed)
}

function sanitizeNullableNumber(input: unknown): number | null {
  if (input === null) {
    return null
  }
  const parsed = Number(input)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null
  }
  return parsed
}

function sanitizeNonnegativeInteger(input: unknown): number {
  const parsed = Number(input)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0
  }
  return Math.trunc(parsed)
}

function sanitizeNonnegativeNumber(input: unknown): number {
  const parsed = Number(input)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0
  }
  return parsed
}

function sanitizeBudgetWindow(input: unknown): AiPlayerProviderBudgetWindow | null {
  if (!input || typeof input !== 'object') {
    return null
  }
  const source = input as Partial<AiPlayerProviderBudgetWindow>
  const budgetWindowKey = sanitizeBudgetWindowKey(source.budgetWindowKey)
  if (!budgetWindowKey) {
    return null
  }
  return {
    budgetWindowKey,
    billingAccountType: sanitizeBillingAccountType(source.billingAccountType),
    billingAccountId: sanitizeOptionalId(source.billingAccountId) ?? null,
    budgetTier: sanitizeBudgetTier(source.budgetTier),
    windowStartedAt: clipString(source.windowStartedAt, 80) ?? nowIso(),
    windowEndsAt: clipString(source.windowEndsAt, 80) ?? nowIso(),
    limitMode: sanitizeBudgetLimitMode(source.limitMode),
    maxRuns: sanitizeNullableInteger(source.maxRuns),
    maxPromptTokens: sanitizeNullableInteger(source.maxPromptTokens),
    maxCompletionTokens: sanitizeNullableInteger(source.maxCompletionTokens),
    maxTotalTokens: sanitizeNullableInteger(source.maxTotalTokens),
    maxEstimatedCostUsd: sanitizeNullableNumber(source.maxEstimatedCostUsd),
    reservedRuns: sanitizeNonnegativeInteger(source.reservedRuns),
    consumedRuns: sanitizeNonnegativeInteger(source.consumedRuns),
    deniedRuns: sanitizeNonnegativeInteger(source.deniedRuns),
    consumedPromptTokens: sanitizeNonnegativeNumber(source.consumedPromptTokens),
    consumedCompletionTokens: sanitizeNonnegativeNumber(source.consumedCompletionTokens),
    consumedTotalTokens: sanitizeNonnegativeNumber(source.consumedTotalTokens),
    consumedEstimatedCostUsd: sanitizeNonnegativeNumber(source.consumedEstimatedCostUsd),
    updatedAt: clipString(source.updatedAt, 80) ?? nowIso(),
  }
}

function sanitizeBudgetReservation(input: unknown): ProviderBudgetReservation | null {
  if (!input || typeof input !== 'object') {
    return null
  }
  const source = input as Partial<ProviderBudgetReservation>
  const reservationId = sanitizeOptionalId(source.reservationId)
  const budgetWindowKey = sanitizeBudgetWindowKey(source.budgetWindowKey)
  const factionId = clipString(source.factionId, 64)
  const governorPlayerId = sanitizeOwnerPlayerId(source.governorPlayerId)
  const model = sanitizeModel(source.model)
  const provider = sanitizeProvider(source.provider)
  const reservedAt = clipString(source.reservedAt, 80)
  const expiresAt = clipString(source.expiresAt, 80)
  if (!reservationId || !budgetWindowKey || !factionId || !governorPlayerId || !model || !provider || !reservedAt || !expiresAt) {
    return null
  }
  return {
    reservationId,
    budgetWindowKey,
    reservedAt,
    expiresAt,
    aiPlayerId: sanitizeOwnerPlayerId(source.aiPlayerId) ?? undefined,
    factionId,
    governorPlayerId,
    model,
    provider,
    source: sanitizeProviderSource(source.source),
    byokSource: sanitizeByokSource(source.byokSource),
    budgetTier: sanitizeBudgetTier(source.budgetTier),
    queueRunId: sanitizeOptionalId(source.queueRunId),
    idempotencyKey: sanitizeOptionalId(source.idempotencyKey),
  }
}

function sanitizeExternalLedgerAuditOutboxItem(input: unknown): ExternalLedgerAuditOutboxItem | null {
  if (!input || typeof input !== 'object') {
    return null
  }
  const source = input as Partial<ExternalLedgerAuditOutboxItem>
  const outboxId = sanitizeOptionalId(source.outboxId)
  const idempotencyKey = sanitizeOptionalId(source.idempotencyKey)
  if (!outboxId || !idempotencyKey) {
    return null
  }
  const billingLedgerEntries = Array.isArray(source.billingLedgerEntries)
    ? source.billingLedgerEntries.flatMap((entry) => {
        const sanitized = sanitizeBillingEntry(entry)
        return sanitized ? [sanitized] : []
      })
    : []
  const sanitizedAuditEvents = Array.isArray(source.auditEvents)
    ? source.auditEvents.flatMap((event) => {
        const sanitized = sanitizeAuditEvent(event)
        return sanitized ? [sanitized] : []
      })
    : []
  if (billingLedgerEntries.length === 0 && sanitizedAuditEvents.length === 0) {
    return null
  }
  return {
    schemaVersion: 1,
    source: 'ai-player-provider-account-store',
    sentAt: clipString(source.sentAt, 80) ?? nowIso(),
    billingLedgerEntries,
    auditEvents: sanitizedAuditEvents,
    outboxId,
    idempotencyKey,
    createdAt: clipString(source.createdAt, 80) ?? nowIso(),
    nextAttemptAt: clipString(source.nextAttemptAt, 80) ?? nowIso(),
    attemptCount: sanitizeNonnegativeInteger(source.attemptCount),
    lastError: sanitizeReason(source.lastError),
  }
}

function sanitizeAuditEvent(input: unknown): AiPlayerProviderAuditEvent | null {
  if (!input || typeof input !== 'object') {
    return null
  }
  const source = input as Partial<AiPlayerProviderAuditEvent>
  const eventId = sanitizeOptionalId(source.eventId)
  const eventType = sanitizeAuditEventType(source.eventType)
  if (!eventId || !eventType) {
    return null
  }
  return {
    eventId,
    eventType,
    requestId: sanitizeOptionalId(source.requestId),
    aiPlayerId: sanitizeOwnerPlayerId(source.aiPlayerId) ?? undefined,
    factionId: clipString(source.factionId, 64),
    governorPlayerId: sanitizeOwnerPlayerId(source.governorPlayerId) ?? undefined,
    ownerPlayerId: sanitizeOwnerPlayerId(source.ownerPlayerId) ?? undefined,
    actorId: sanitizeOwnerPlayerId(source.actorId) ?? undefined,
    providerSource: source.providerSource ? sanitizeProviderSource(source.providerSource) : undefined,
    byokSource: source.byokSource ? sanitizeByokSource(source.byokSource) : undefined,
    model: sanitizeModel(source.model) ?? undefined,
    provider: sanitizeProvider(source.provider),
    keyFingerprint: source.keyFingerprint === null ? null : (clipString(source.keyFingerprint, 80) ?? undefined),
    reason: sanitizeReason(source.reason),
    queueRunId: sanitizeOptionalId(source.queueRunId),
    idempotencyKey: sanitizeOptionalId(source.idempotencyKey),
    metadata: sanitizeAuditMetadata(source.metadata),
    createdAt: clipString(source.createdAt, 80) ?? nowIso(),
  }
}

function ensureLoaded() {
  if (loaded) {
    return
  }
  loaded = true
  playerKeys.clear()
  billingLedger.splice(0, billingLedger.length)
  auditEvents.splice(0, auditEvents.length)
  providerBudgetWindows.clear()
  providerBudgetReservations.clear()
  externalLedgerAuditOutbox.splice(0, externalLedgerAuditOutbox.length)

  try {
    if (!existsSync(STORE_PATH)) {
      return
    }
    const parsed = JSON.parse(readFileSync(STORE_PATH, 'utf8')) as PersistedProviderAccountStore
    const persistedPlayerKeys = Array.isArray(parsed.playerKeys) ? parsed.playerKeys : []
    for (const item of persistedPlayerKeys) {
      const next = sanitizePersistedPlayerKey(item)
      if (!next) {
        continue
      }
      playerKeys.set(next.ownerPlayerId, next)
      if (playerKeys.size >= MAX_PLAYER_KEYS) {
        break
      }
    }
    const persistedLedger = Array.isArray(parsed.billingLedger) ? parsed.billingLedger : []
    for (const item of persistedLedger) {
      const next = sanitizeBillingEntry(item)
      if (next) {
        billingLedger.push(next)
      }
      if (billingLedger.length >= MAX_BILLING_LEDGER_ENTRIES) {
        break
      }
    }
    const persistedAuditEvents = Array.isArray(parsed.auditEvents) ? parsed.auditEvents : []
    for (const item of persistedAuditEvents) {
      const next = sanitizeAuditEvent(item)
      if (next) {
        auditEvents.push(next)
      }
      if (auditEvents.length >= MAX_AUDIT_EVENTS) {
        break
      }
    }
    const persistedBudgetWindows = Array.isArray(parsed.budgetWindows) ? parsed.budgetWindows : []
    for (const item of persistedBudgetWindows) {
      const next = sanitizeBudgetWindow(item)
      if (next) {
        providerBudgetWindows.set(next.budgetWindowKey, next)
      }
      if (providerBudgetWindows.size >= MAX_BUDGET_WINDOWS) {
        break
      }
    }
    const persistedBudgetReservations = Array.isArray(parsed.budgetReservations) ? parsed.budgetReservations : []
    for (const item of persistedBudgetReservations) {
      const next = sanitizeBudgetReservation(item)
      if (next) {
        providerBudgetReservations.set(next.reservationId, next)
      }
      if (providerBudgetReservations.size >= MAX_BUDGET_RESERVATIONS) {
        break
      }
    }
    const persistedExternalOutbox = Array.isArray(parsed.externalLedgerAuditOutbox) ? parsed.externalLedgerAuditOutbox : []
    for (const item of persistedExternalOutbox) {
      const next = sanitizeExternalLedgerAuditOutboxItem(item)
      if (next) {
        externalLedgerAuditOutbox.push(next)
      }
      if (externalLedgerAuditOutbox.length >= MAX_EXTERNAL_LEDGER_AUDIT_OUTBOX_ITEMS) {
        break
      }
    }
    expireProviderBudgetReservations()
  } catch {
    playerKeys.clear()
    billingLedger.splice(0, billingLedger.length)
    auditEvents.splice(0, auditEvents.length)
    providerBudgetWindows.clear()
    providerBudgetReservations.clear()
    externalLedgerAuditOutbox.splice(0, externalLedgerAuditOutbox.length)
    quarantineCorruptStoreFile()
  }
}

function toPersistedPlayerKey(input: StoredPlayerKeyConfig): PersistedPlayerKeyConfig {
  let persistedApiKey: string | undefined
  if (input.apiKey && input.status === 'active') {
    persistedApiKey = encryptApiKey(input.apiKey)
    if (!persistedApiKey && allowPlaintextApiKeyPersist()) {
      persistedApiKey = input.apiKey.slice(0, MAX_SECRET_FIELD_LENGTH)
    }
  }
  return {
    ownerPlayerId: input.ownerPlayerId,
    model: input.model,
    provider: input.provider,
    baseUrl: input.baseUrl,
    apiKey: persistedApiKey,
    keyFingerprint: input.keyFingerprint,
    status: input.status,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    revokedAt: input.revokedAt,
  }
}

function buildPersistedPayload(): PersistedProviderAccountStore {
  return {
    version: STORE_PERSIST_VERSION,
    savedAt: nowIso(),
    playerKeys: Array.from(playerKeys.values(), (item) => toPersistedPlayerKey(item)),
    billingLedger: billingLedger.slice(-MAX_BILLING_LEDGER_ENTRIES),
    auditEvents: auditEvents.slice(-MAX_AUDIT_EVENTS),
    budgetWindows: Array.from(providerBudgetWindows.values()).slice(-MAX_BUDGET_WINDOWS),
    budgetReservations: Array.from(providerBudgetReservations.values()).slice(-MAX_BUDGET_RESERVATIONS),
    externalLedgerAuditOutbox: externalLedgerAuditOutbox.slice(-MAX_EXTERNAL_LEDGER_AUDIT_OUTBOX_ITEMS),
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
  }, STORE_PERSIST_DEBOUNCE_MS)
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
        const tmpPath = `${STORE_PATH}.tmp`
        await mkdir(dirname(STORE_PATH), { recursive: true })
        await writeFile(tmpPath, payload, 'utf8')
        await rename(tmpPath, STORE_PATH)
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

function enqueueExternalLedgerAuditSync(input: {
  billingLedgerEntry?: AiPlayerProviderBillingLedgerEntry
  auditEvent?: AiPlayerProviderAuditEvent
}) {
  if (!readEnvUrl(LEDGER_AUDIT_DB_URL_ENV)) {
    return
  }
  const outboxId = `provider_outbox_${randomUUID()}`
  const timestamp = nowIso()
  externalLedgerAuditOutbox.push({
    schemaVersion: 1,
    source: 'ai-player-provider-account-store',
    sentAt: timestamp,
    billingLedgerEntries: input.billingLedgerEntry ? [structuredClone(input.billingLedgerEntry)] : [],
    auditEvents: input.auditEvent ? [structuredClone(input.auditEvent)] : [],
    outboxId,
    idempotencyKey: outboxId,
    createdAt: timestamp,
    nextAttemptAt: timestamp,
    attemptCount: 0,
  })
  while (externalLedgerAuditOutbox.length > MAX_EXTERNAL_LEDGER_AUDIT_OUTBOX_ITEMS) {
    externalLedgerAuditOutbox.shift()
  }
  schedulePersist()
  scheduleExternalLedgerAuditDrain(100)
}

function scheduleExternalLedgerAuditDrain(delayMs: number) {
  if (externalLedgerAuditTimer || externalLedgerAuditInFlight) {
    return
  }
  externalLedgerAuditTimer = setTimeout(() => {
    externalLedgerAuditTimer = null
    void drainExternalLedgerAuditSync()
  }, delayMs)
}

async function postExternalLedgerAuditPayload(item: ExternalLedgerAuditOutboxItem) {
  const url = readEnvUrl(LEDGER_AUDIT_DB_URL_ENV)
  if (!url) {
    return
  }
  const payload: ExternalLedgerAuditPayload = {
    schemaVersion: 1,
    source: 'ai-player-provider-account-store',
    sentAt: nowIso(),
    billingLedgerEntries: item.billingLedgerEntries,
    auditEvents: item.auditEvents,
  }
  const body = JSON.stringify(payload)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), readExternalLedgerAuditDbTimeoutMs())
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: buildSignedHeaders({
        body,
        idempotencyKey: item.idempotencyKey,
        signatureSecretEnv: LEDGER_AUDIT_DB_HMAC_SECRET_ENV,
      }),
      body,
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`external_ledger_audit_db_${response.status}`)
    }
  } finally {
    clearTimeout(timer)
  }
}

function scheduleFailedExternalLedgerAuditRetry(item: ExternalLedgerAuditOutboxItem, error: unknown) {
  item.attemptCount += 1
  item.lastError = error instanceof Error ? error.message : String(error)
  item.nextAttemptAt = new Date(Date.now() + Math.min(60_000, 1_000 * (2 ** Math.min(6, item.attemptCount)))).toISOString()
  externalLedgerAuditFailureCount += 1
  externalLedgerAuditLastFailureAt = Date.now()
  externalLedgerAuditLastError = item.lastError
  schedulePersist()
  scheduleExternalLedgerAuditDrain(1_000)
}

async function drainExternalLedgerAuditSync(): Promise<void> {
  if (externalLedgerAuditInFlight) {
    await externalLedgerAuditInFlight
    return
  }
  if (externalLedgerAuditOutbox.length === 0) {
    return
  }

  externalLedgerAuditInFlight = (async () => {
    try {
      const now = Date.now()
      const readyItems = externalLedgerAuditOutbox
        .filter((item) => Date.parse(item.nextAttemptAt) <= now)
        .slice(0, 25)
      for (const item of readyItems) {
        try {
          await postExternalLedgerAuditPayload(item)
          const index = externalLedgerAuditOutbox.findIndex((candidate) => candidate.outboxId === item.outboxId)
          if (index >= 0) {
            externalLedgerAuditOutbox.splice(index, 1)
          }
          externalLedgerAuditSuccessCount += 1
          externalLedgerAuditLastSuccessAt = Date.now()
          externalLedgerAuditLastError = null
          schedulePersist()
        } catch (error) {
          scheduleFailedExternalLedgerAuditRetry(item, error)
        }
      }
    } finally {
      externalLedgerAuditInFlight = null
      if (externalLedgerAuditOutbox.length > 0) {
        scheduleExternalLedgerAuditDrain(1_000)
      }
    }
  })()
  await externalLedgerAuditInFlight
}

export async function flushAiPlayerProviderAccountStorePersist(): Promise<void> {
  ensureLoaded()
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (!persistDirty) {
    if (persistInFlight) {
      await persistInFlight
    }
    await drainExternalLedgerAuditSync()
    return
  }
  await drainPersistQueue()
  if (externalLedgerAuditTimer) {
    clearTimeout(externalLedgerAuditTimer)
    externalLedgerAuditTimer = null
  }
  await drainExternalLedgerAuditSync()
}

function sanitizeBillingAccountType(input: unknown): AiPlayerProviderBillingAccountType {
  return input === 'faction_byok' || input === 'player_byok' ? input : 'platform'
}

function sanitizeProviderSource(input: unknown): AiPlayerModelRoutingSource {
  switch (input) {
    case 'env':
    case 'faction_config':
    case 'player_config':
    case 'fallback':
      return input
    case 'default':
    default:
      return 'default'
  }
}

function sanitizeByokSource(input: unknown): AiPlayerModelByokSource {
  switch (input) {
    case 'faction_config':
    case 'player_config':
      return input
    case 'none':
    default:
      return 'none'
  }
}

function sanitizeBudgetTier(input: unknown): AiPlayerModelBudgetTier {
  switch (input) {
    case 'economy_chat':
    case 'disabled':
      return input
    case 'strict_action':
    default:
      return 'strict_action'
  }
}

function sanitizeAuditEventType(input: unknown): AiPlayerProviderAuditEventType | null {
  switch (input) {
    case 'byok_key_configured':
    case 'byok_key_revoked':
    case 'provider_request_succeeded':
    case 'provider_request_failed':
    case 'provider_fallback_failed':
      return input
    default:
      return null
  }
}

function sanitizeUsage(input: unknown): AiPlayerProviderBillingUsage {
  if (!input || typeof input !== 'object') {
    return {}
  }
  const source = input as Record<string, unknown>
  const promptTokens = readUsageNumber(source.prompt_tokens ?? source.promptTokens)
  const completionTokens = readUsageNumber(source.completion_tokens ?? source.completionTokens)
  const totalTokens = readUsageNumber(source.total_tokens ?? source.totalTokens)
  const estimatedCostUsd = readUsageNumber(source.estimated_cost_usd ?? source.estimatedCostUsd)
  return {
    ...(promptTokens !== undefined ? { promptTokens } : {}),
    ...(completionTokens !== undefined ? { completionTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
    ...(estimatedCostUsd !== undefined ? { estimatedCostUsd } : {}),
  }
}

function readUsageNumber(input: unknown): number | undefined {
  const parsed = Number(input)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined
  }
  return parsed
}

function sanitizeAuditMetadata(input: unknown): Record<string, string | number | boolean | null> | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return undefined
  }
  const result: Record<string, string | number | boolean | null> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>).slice(0, 24)) {
    const safeKey = key.trim().slice(0, 80)
    if (!safeKey) {
      continue
    }
    if (typeof value === 'string') {
      result[safeKey] = value.trim().slice(0, 240)
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      result[safeKey] = value
    } else if (typeof value === 'boolean' || value === null) {
      result[safeKey] = value
    }
  }
  return Object.keys(result).length > 0 ? result : undefined
}

function deriveProviderLabel(baseUrl: string | undefined, fallback = 'relay') {
  if (!baseUrl) {
    return fallback
  }
  try {
    return new URL(baseUrl).host || fallback
  } catch {
    return fallback
  }
}

function toReadModel(input: StoredPlayerKeyConfig): AiPlayerProviderPlayerKeyReadModel {
  const secretConfigured = Boolean(input.apiKey && input.status === 'active')
  return {
    ownerPlayerId: input.ownerPlayerId,
    model: input.model,
    provider: input.provider ?? deriveProviderLabel(input.baseUrl, 'player_config'),
    baseUrl: input.baseUrl,
    status: input.status,
    secretConfigured,
    secretSource: secretConfigured ? 'player_config:byok' : null,
    byokSource: 'player_config',
    keyFingerprint: input.keyFingerprint,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    revokedAt: input.revokedAt,
  }
}

function appendAuditEvent(input: Omit<AiPlayerProviderAuditEvent, 'eventId' | 'createdAt'> & { createdAt?: string }) {
  ensureLoaded()
  const event: AiPlayerProviderAuditEvent = {
    eventId: `audit_${randomUUID()}`,
    eventType: input.eventType,
    requestId: sanitizeOptionalId(input.requestId),
    aiPlayerId: sanitizeOwnerPlayerId(input.aiPlayerId) ?? undefined,
    factionId: clipString(input.factionId, 64),
    governorPlayerId: sanitizeOwnerPlayerId(input.governorPlayerId) ?? undefined,
    ownerPlayerId: sanitizeOwnerPlayerId(input.ownerPlayerId) ?? undefined,
    actorId: sanitizeOwnerPlayerId(input.actorId) ?? undefined,
    providerSource: input.providerSource ? sanitizeProviderSource(input.providerSource) : undefined,
    byokSource: input.byokSource ? sanitizeByokSource(input.byokSource) : undefined,
    model: sanitizeModel(input.model) ?? undefined,
    provider: sanitizeProvider(input.provider),
    keyFingerprint: input.keyFingerprint === null ? null : (clipString(input.keyFingerprint, 80) ?? undefined),
    reason: sanitizeReason(input.reason),
    queueRunId: sanitizeOptionalId(input.queueRunId),
    idempotencyKey: sanitizeOptionalId(input.idempotencyKey),
    metadata: sanitizeAuditMetadata(input.metadata),
    createdAt: input.createdAt ?? nowIso(),
  }
  auditEvents.push(event)
  while (auditEvents.length > MAX_AUDIT_EVENTS) {
    auditEvents.shift()
  }
  enqueueExternalLedgerAuditSync({ auditEvent: event })
  schedulePersist()
  return structuredClone(event)
}

function appendBillingEntry(input: Omit<AiPlayerProviderBillingLedgerEntry, 'ledgerEntryId' | 'createdAt'>) {
  ensureLoaded()
  const entry: AiPlayerProviderBillingLedgerEntry = {
    ...input,
    ledgerEntryId: `bill_${randomUUID()}`,
    createdAt: nowIso(),
  }
  billingLedger.push(entry)
  while (billingLedger.length > MAX_BILLING_LEDGER_ENTRIES) {
    billingLedger.shift()
  }
  enqueueExternalLedgerAuditSync({ billingLedgerEntry: entry })
  schedulePersist()
  return structuredClone(entry)
}

function resolveBillingAccount(input: {
  byokSource: AiPlayerModelByokSource
  factionId: string
  governorPlayerId: string
}): { billingAccountType: AiPlayerProviderBillingAccountType; billingAccountId: string | null } {
  if (input.byokSource === 'player_config') {
    return {
      billingAccountType: 'player_byok',
      billingAccountId: input.governorPlayerId,
    }
  }
  if (input.byokSource === 'faction_config') {
    return {
      billingAccountType: 'faction_byok',
      billingAccountId: input.factionId,
    }
  }
  return {
    billingAccountType: 'platform',
    billingAccountId: null,
  }
}

function resolveProviderBudgetAccount(input: ProviderBudgetAccountInput) {
  return resolveBillingAccount(input)
}

function resolveBudgetTierForModel(model: string): AiPlayerModelBudgetTier {
  const normalized = model.trim().toLowerCase()
  return normalized === 'claude-sonnet-4-6' || normalized.includes('strict-json')
    ? 'strict_action'
    : 'economy_chat'
}

function resolveProviderBudgetLimits(budgetTier: AiPlayerModelBudgetTier): ProviderBudgetLimits {
  if (budgetTier === 'disabled') {
    return {
      limitMode: 'disabled',
      maxRuns: 0,
      maxPromptTokens: 0,
      maxCompletionTokens: 0,
      maxTotalTokens: 0,
      maxEstimatedCostUsd: 0,
    }
  }
  const maxRuns = readIntegerEnv(BUDGET_MAX_RUNS_ENV, { minimum: 0 })
  const maxPromptTokens = readIntegerEnv(BUDGET_MAX_PROMPT_TOKENS_ENV, { minimum: 0 })
  const maxCompletionTokens = readIntegerEnv(BUDGET_MAX_COMPLETION_TOKENS_ENV, { minimum: 0 })
  const maxTotalTokens = readIntegerEnv(BUDGET_MAX_TOTAL_TOKENS_ENV, { minimum: 0 })
  const maxEstimatedCostUsd = readNumberEnv(BUDGET_MAX_COST_USD_ENV, { minimum: 0 })
  const configured = maxRuns !== null
    || maxPromptTokens !== null
    || maxCompletionTokens !== null
    || maxTotalTokens !== null
    || maxEstimatedCostUsd !== null
  return {
    limitMode: configured ? 'configured' : 'unlimited',
    maxRuns,
    maxPromptTokens,
    maxCompletionTokens,
    maxTotalTokens,
    maxEstimatedCostUsd,
  }
}

function buildBudgetWindowKey(input: {
  billingAccountType: AiPlayerProviderBillingAccountType
  billingAccountId: string | null
  budgetTier: AiPlayerModelBudgetTier
  windowStartedAtMs: number
}) {
  const accountId = input.billingAccountId ?? 'platform'
  return [
    'provider_budget',
    input.billingAccountType,
    accountId,
    input.budgetTier,
    String(input.windowStartedAtMs),
  ].join(':')
}

function ensureProviderBudgetWindow(input: ReserveProviderBudgetInput): AiPlayerProviderBudgetWindow {
  ensureLoaded()
  const budgetTier = input.budgetTier ?? resolveBudgetTierForModel(input.model)
  const account = resolveProviderBudgetAccount({
    byokSource: input.byokSource,
    factionId: input.factionId,
    governorPlayerId: input.governorPlayerId,
  })
  const windowMs = readBudgetWindowMs()
  const now = Date.now()
  const windowStartedAtMs = Math.floor(now / windowMs) * windowMs
  const windowEndsAtMs = windowStartedAtMs + windowMs
  const budgetWindowKey = buildBudgetWindowKey({
    billingAccountType: account.billingAccountType,
    billingAccountId: account.billingAccountId,
    budgetTier,
    windowStartedAtMs,
  })
  const limits = resolveProviderBudgetLimits(budgetTier)
  const existing = providerBudgetWindows.get(budgetWindowKey)
  const timestamp = nowIso()
  if (existing) {
    const next = {
      ...existing,
      limitMode: limits.limitMode,
      maxRuns: limits.maxRuns,
      maxPromptTokens: limits.maxPromptTokens,
      maxCompletionTokens: limits.maxCompletionTokens,
      maxTotalTokens: limits.maxTotalTokens,
      maxEstimatedCostUsd: limits.maxEstimatedCostUsd,
      updatedAt: timestamp,
    }
    providerBudgetWindows.set(budgetWindowKey, next)
    return next
  }

  const window: AiPlayerProviderBudgetWindow = {
    budgetWindowKey,
    billingAccountType: account.billingAccountType,
    billingAccountId: account.billingAccountId,
    budgetTier,
    windowStartedAt: new Date(windowStartedAtMs).toISOString(),
    windowEndsAt: new Date(windowEndsAtMs).toISOString(),
    limitMode: limits.limitMode,
    maxRuns: limits.maxRuns,
    maxPromptTokens: limits.maxPromptTokens,
    maxCompletionTokens: limits.maxCompletionTokens,
    maxTotalTokens: limits.maxTotalTokens,
    maxEstimatedCostUsd: limits.maxEstimatedCostUsd,
    reservedRuns: 0,
    consumedRuns: 0,
    deniedRuns: 0,
    consumedPromptTokens: 0,
    consumedCompletionTokens: 0,
    consumedTotalTokens: 0,
    consumedEstimatedCostUsd: 0,
    updatedAt: timestamp,
  }
  providerBudgetWindows.set(budgetWindowKey, window)
  while (providerBudgetWindows.size > MAX_BUDGET_WINDOWS) {
    const oldestKey = providerBudgetWindows.keys().next().value as string | undefined
    if (!oldestKey) {
      break
    }
    providerBudgetWindows.delete(oldestKey)
  }
  return window
}

function remainingBudget(max: number | null, consumed: number, reserved = 0): number | null {
  return max === null ? null : Math.max(0, max - consumed - reserved)
}

function isProviderBudgetExhausted(window: AiPlayerProviderBudgetWindow) {
  if (window.limitMode === 'disabled') {
    return true
  }
  return (
    (window.maxRuns !== null && window.consumedRuns + window.reservedRuns >= window.maxRuns)
    || (window.maxPromptTokens !== null && window.consumedPromptTokens >= window.maxPromptTokens)
    || (window.maxCompletionTokens !== null && window.consumedCompletionTokens >= window.maxCompletionTokens)
    || (window.maxTotalTokens !== null && window.consumedTotalTokens >= window.maxTotalTokens)
    || (window.maxEstimatedCostUsd !== null && window.consumedEstimatedCostUsd >= window.maxEstimatedCostUsd)
  )
}

function toBudgetReservationOk(
  reservationId: string,
  window: AiPlayerProviderBudgetWindow,
): ProviderBudgetReservationOk {
  return {
    ok: true,
    reservationId,
    budgetWindowKey: window.budgetWindowKey,
    budgetTier: window.budgetTier,
    limitMode: window.limitMode,
    remainingRuns: remainingBudget(window.maxRuns, window.consumedRuns, window.reservedRuns),
    remainingTotalTokens: remainingBudget(window.maxTotalTokens, window.consumedTotalTokens),
    window: structuredClone(window),
  }
}

function toBudgetReservationDenied(
  error: ProviderBudgetReservationDenied['error'],
  window: AiPlayerProviderBudgetWindow,
): ProviderBudgetReservationDenied {
  return {
    ok: false,
    error,
    budgetWindowKey: window.budgetWindowKey,
    budgetTier: window.budgetTier,
    limitMode: window.limitMode,
    remainingRuns: remainingBudget(window.maxRuns, window.consumedRuns, window.reservedRuns),
    remainingTotalTokens: remainingBudget(window.maxTotalTokens, window.consumedTotalTokens),
    window: structuredClone(window),
  }
}

function buildBudgetReservation(input: {
  reservationId: string
  window: AiPlayerProviderBudgetWindow
  budgetTier: AiPlayerModelBudgetTier
  request: ReserveProviderBudgetInput
  expiresAt?: string
}): ProviderBudgetReservation {
  const timestamp = nowIso()
  return {
    reservationId: input.reservationId,
    budgetWindowKey: input.window.budgetWindowKey,
    reservedAt: timestamp,
    expiresAt: input.expiresAt ?? new Date(Date.now() + readBudgetReservationTtlMs()).toISOString(),
    aiPlayerId: sanitizeOwnerPlayerId(input.request.aiPlayerId) ?? undefined,
    factionId: clipString(input.request.factionId, 64) ?? input.request.factionId,
    governorPlayerId: sanitizeOwnerPlayerId(input.request.governorPlayerId) ?? input.request.governorPlayerId,
    model: sanitizeModel(input.request.model) ?? input.request.model,
    provider: sanitizeProvider(input.request.provider) ?? input.request.provider,
    source: sanitizeProviderSource(input.request.source),
    byokSource: sanitizeByokSource(input.request.byokSource),
    budgetTier: input.budgetTier,
    queueRunId: sanitizeOptionalId(input.request.queueRunId),
    idempotencyKey: sanitizeOptionalId(input.request.idempotencyKey),
  }
}

function trackExternalBudgetGateSuccess() {
  externalBudgetGateSuccessCount += 1
  externalBudgetGateLastSuccessAt = Date.now()
  externalBudgetGateLastError = null
}

function trackExternalBudgetGateFailure(error: unknown) {
  externalBudgetGateFailureCount += 1
  externalBudgetGateLastFailureAt = Date.now()
  externalBudgetGateLastError = error instanceof Error ? error.message : String(error)
}

async function postExternalBudgetGate(
  payload: ExternalBudgetGatePayload,
  idempotencyKey: string,
): Promise<ExternalBudgetGateResponse | null> {
  const url = readEnvUrl(BUDGET_GATE_URL_ENV)
  if (!url) {
    return null
  }
  const body = JSON.stringify(payload)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), readExternalBudgetGateTimeoutMs())
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: buildSignedHeaders({
        body,
        idempotencyKey,
        signatureSecretEnv: BUDGET_GATE_HMAC_SECRET_ENV,
      }),
      body,
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`external_budget_gate_${response.status}`)
    }
    trackExternalBudgetGateSuccess()
    return await response.json() as ExternalBudgetGateResponse
  } catch (error) {
    trackExternalBudgetGateFailure(error)
    if (readBooleanEnv(BUDGET_GATE_FAIL_OPEN_ENV)) {
      return null
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function reserveExternalProviderBudget(
  input: ReserveProviderBudgetInput,
  window: AiPlayerProviderBudgetWindow,
): Promise<ProviderBudgetReservationResult | null> {
  if (!readEnvUrl(BUDGET_GATE_URL_ENV)) {
    return null
  }
  const desiredReservationId = `budget_res_${randomUUID()}`
  const expiresAt = new Date(Date.now() + readBudgetReservationTtlMs()).toISOString()
  const payload: ExternalBudgetGatePayload = {
    schemaVersion: 1,
    source: 'ai-player-provider-account-store',
    operation: 'reserve',
    sentAt: nowIso(),
    reservationId: desiredReservationId,
    reserve: {
      ...input,
      budgetTier: window.budgetTier,
      billingAccountType: window.billingAccountType,
      billingAccountId: window.billingAccountId,
      budgetWindowKey: window.budgetWindowKey,
      windowStartedAt: window.windowStartedAt,
      windowEndsAt: window.windowEndsAt,
      localLimitMode: window.limitMode,
      maxRuns: window.maxRuns,
      maxPromptTokens: window.maxPromptTokens,
      maxCompletionTokens: window.maxCompletionTokens,
      maxTotalTokens: window.maxTotalTokens,
      maxEstimatedCostUsd: window.maxEstimatedCostUsd,
      expiresAt,
      queueRunId: sanitizeOptionalId(input.queueRunId),
      idempotencyKey: sanitizeOptionalId(input.idempotencyKey),
    },
  }
  let response: ExternalBudgetGateResponse | null
  try {
    response = await postExternalBudgetGate(payload, input.idempotencyKey ?? desiredReservationId)
  } catch {
    window.deniedRuns += 1
    window.updatedAt = nowIso()
    schedulePersist()
    return toBudgetReservationDenied('provider_budget_gate_unavailable', window)
  }
  if (!response) {
    return null
  }
  const responseWindow = sanitizeBudgetWindow(response.window)
  if (responseWindow) {
    providerBudgetWindows.set(responseWindow.budgetWindowKey, responseWindow)
    window = responseWindow
  }
  if (response.ok !== true) {
    const error = response.error === 'provider_budget_disabled'
      ? 'provider_budget_disabled'
      : 'provider_budget_exhausted'
    window.deniedRuns += 1
    window.updatedAt = nowIso()
    schedulePersist()
    return toBudgetReservationDenied(error, window)
  }
  const reservationId = sanitizeOptionalId(response.reservationId) ?? desiredReservationId
  const budgetWindowKey = sanitizeBudgetWindowKey(response.budgetWindowKey) ?? window.budgetWindowKey
  if (!responseWindow) {
    window.reservedRuns += 1
    window.updatedAt = nowIso()
  }
  const reservation = buildBudgetReservation({
    reservationId,
    window: {
      ...window,
      budgetWindowKey,
    },
    budgetTier: sanitizeBudgetTier(response.budgetTier ?? window.budgetTier),
    request: input,
    expiresAt,
  })
  providerBudgetReservations.set(reservationId, reservation)
  schedulePersist()
  return toBudgetReservationOk(reservationId, window)
}

async function notifyExternalBudgetGate(
  operation: 'commit' | 'release',
  reservation: ProviderBudgetReservation,
  input: { usage?: unknown; ok?: boolean; error?: string } = {},
) {
  if (!readEnvUrl(BUDGET_GATE_URL_ENV)) {
    return
  }
  const usage = sanitizeUsage(input.usage)
  const payload: ExternalBudgetGatePayload = {
    schemaVersion: 1,
    source: 'ai-player-provider-account-store',
    operation,
    sentAt: nowIso(),
    reservationId: reservation.reservationId,
    commit: operation === 'commit'
      ? {
          usage,
          ok: input.ok,
          error: input.error,
        }
      : undefined,
  }
  try {
    await postExternalBudgetGate(payload, `${reservation.reservationId}:${operation}`)
  } catch {
    // Keep local accounting authoritative for this process; health exposes gate failures.
  }
}

function expireProviderBudgetReservations(nowMs = Date.now()) {
  let expiredCount = 0
  for (const reservation of Array.from(providerBudgetReservations.values())) {
    const expiresAtMs = Date.parse(reservation.expiresAt)
    if (!Number.isFinite(expiresAtMs) || expiresAtMs > nowMs) {
      continue
    }
    providerBudgetReservations.delete(reservation.reservationId)
    const window = providerBudgetWindows.get(reservation.budgetWindowKey)
    if (window) {
      window.reservedRuns = Math.max(0, window.reservedRuns - 1)
      window.updatedAt = nowIso()
    }
    expiredCount += 1
  }
  if (expiredCount > 0) {
    schedulePersist()
  }
}

export function getAiPlayerProviderAccountStoreHealth() {
  ensureLoaded()
  const keyConfigured = Boolean(getApiKeyEncryptionKey())
  const allowPlaintext = allowPlaintextApiKeyPersist()
  const secretPersistMode = keyConfigured ? 'encrypted' : (allowPlaintext ? 'plaintext' : 'memory_only')
  return {
    path: STORE_PATH,
    loaded,
    playerKeyCount: playerKeys.size,
    billingLedgerCount: billingLedger.length,
    auditEventCount: auditEvents.length,
    budgetWindowCount: providerBudgetWindows.size,
    budgetReservationCount: providerBudgetReservations.size,
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
    externalLedgerAuditDb: {
      configured: Boolean(readEnvUrl(LEDGER_AUDIT_DB_URL_ENV)),
      hmacConfigured: Boolean(readEnvSecret(LEDGER_AUDIT_DB_HMAC_SECRET_ENV)),
      durableOutboxCount: externalLedgerAuditOutbox.length,
      pendingBillingLedgerCount: externalLedgerAuditOutbox.reduce((count, item) => count + item.billingLedgerEntries.length, 0),
      pendingAuditEventCount: externalLedgerAuditOutbox.reduce((count, item) => count + item.auditEvents.length, 0),
      inFlight: Boolean(externalLedgerAuditInFlight),
      successCount: externalLedgerAuditSuccessCount,
      failureCount: externalLedgerAuditFailureCount,
      lastSuccessAt: externalLedgerAuditLastSuccessAt,
      lastFailureAt: externalLedgerAuditLastFailureAt,
      lastError: externalLedgerAuditLastError,
    },
    externalBudgetGate: {
      configured: Boolean(readEnvUrl(BUDGET_GATE_URL_ENV)),
      hmacConfigured: Boolean(readEnvSecret(BUDGET_GATE_HMAC_SECRET_ENV)),
      failOpen: readBooleanEnv(BUDGET_GATE_FAIL_OPEN_ENV),
      successCount: externalBudgetGateSuccessCount,
      failureCount: externalBudgetGateFailureCount,
      lastSuccessAt: externalBudgetGateLastSuccessAt,
      lastFailureAt: externalBudgetGateLastFailureAt,
      lastError: externalBudgetGateLastError,
    },
  }
}

export function getAiPlayerProviderPlayerKey(ownerPlayerId: string): AiPlayerProviderPlayerKeyReadModel | null {
  ensureLoaded()
  const normalizedOwner = sanitizeOwnerPlayerId(ownerPlayerId)
  if (!normalizedOwner) {
    return null
  }
  const key = playerKeys.get(normalizedOwner)
  return key ? toReadModel(key) : null
}

export function getActiveAiPlayerProviderPlayerKeyModelConfig(
  ownerPlayerId: string | undefined,
): ActivePlayerModelConfig | null {
  ensureLoaded()
  const normalizedOwner = sanitizeOwnerPlayerId(ownerPlayerId)
  if (!normalizedOwner) {
    return null
  }
  const key = playerKeys.get(normalizedOwner)
  if (!key || key.status !== 'active' || !key.apiKey) {
    return null
  }
  return {
    ownerPlayerId: key.ownerPlayerId,
    model: key.model,
    provider: key.provider,
    baseUrl: key.baseUrl,
    apiKey: key.apiKey,
    keyFingerprint: key.keyFingerprint,
  }
}

export function upsertAiPlayerProviderPlayerKey(
  ownerPlayerId: string,
  input: UpsertAiPlayerProviderPlayerKeyRequest,
): { ok: true; key: AiPlayerProviderPlayerKeyReadModel } | { ok: false; error: string } {
  ensureLoaded()
  const normalizedOwner = sanitizeOwnerPlayerId(ownerPlayerId)
  const model = sanitizeModel(input.model)
  if (!normalizedOwner) {
    return { ok: false, error: 'ownerPlayerId is required' }
  }
  if (!model) {
    return { ok: false, error: 'model is required' }
  }
  const existing = playerKeys.get(normalizedOwner)
  const apiKey = clipString(input.apiKey, MAX_SECRET_FIELD_LENGTH)
  const status = input.status === 'revoked' ? 'revoked' : 'active'
  if (status === 'active' && !apiKey && !existing?.apiKey) {
    return { ok: false, error: 'apiKey is required for active player-level BYOK config' }
  }
  const timestamp = nowIso()
  const next: StoredPlayerKeyConfig = {
    ownerPlayerId: normalizedOwner,
    model,
    provider: sanitizeProvider(input.provider),
    baseUrl: sanitizeBaseUrl(input.baseUrl),
    apiKey: status === 'active' ? (apiKey ?? existing?.apiKey) : undefined,
    keyFingerprint: status === 'active'
      ? (apiKey ? hashApiKey(apiKey) : (existing?.keyFingerprint ?? null))
      : (existing?.keyFingerprint ?? (apiKey ? hashApiKey(apiKey) : null)),
    status,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    revokedAt: status === 'revoked' ? timestamp : undefined,
  }
  playerKeys.set(normalizedOwner, next)
  appendAuditEvent({
    eventType: status === 'active' ? 'byok_key_configured' : 'byok_key_revoked',
    ownerPlayerId: normalizedOwner,
    actorId: input.updatedBy ?? normalizedOwner,
    providerSource: 'player_config',
    byokSource: 'player_config',
    model: next.model,
    provider: next.provider ?? deriveProviderLabel(next.baseUrl, 'player_config'),
    keyFingerprint: next.keyFingerprint,
    metadata: {
      secretConfigured: Boolean(next.apiKey),
      status: next.status,
    },
  })
  schedulePersist()
  return { ok: true, key: toReadModel(next) }
}

export function revokeAiPlayerProviderPlayerKey(
  ownerPlayerId: string,
  actorId?: string,
): { ok: true; key: AiPlayerProviderPlayerKeyReadModel } | { ok: false; error: string } {
  ensureLoaded()
  const normalizedOwner = sanitizeOwnerPlayerId(ownerPlayerId)
  if (!normalizedOwner) {
    return { ok: false, error: 'ownerPlayerId is required' }
  }
  const existing = playerKeys.get(normalizedOwner)
  if (!existing) {
    return { ok: false, error: `player key not found: ${normalizedOwner}` }
  }
  const timestamp = nowIso()
  const next: StoredPlayerKeyConfig = {
    ...existing,
    apiKey: undefined,
    status: 'revoked',
    updatedAt: timestamp,
    revokedAt: timestamp,
  }
  playerKeys.set(normalizedOwner, next)
  appendAuditEvent({
    eventType: 'byok_key_revoked',
    ownerPlayerId: normalizedOwner,
    actorId: actorId ?? normalizedOwner,
    providerSource: 'player_config',
    byokSource: 'player_config',
    model: next.model,
    provider: next.provider ?? deriveProviderLabel(next.baseUrl, 'player_config'),
    keyFingerprint: next.keyFingerprint,
    metadata: {
      secretConfigured: false,
      status: next.status,
    },
  })
  schedulePersist()
  return { ok: true, key: toReadModel(next) }
}

export function listAiPlayerProviderBillingLedger(options: {
  limit?: number
  aiPlayerId?: string
  factionId?: string
  governorPlayerId?: string
  billingAccountType?: AiPlayerProviderBillingAccountType
} = {}) {
  ensureLoaded()
  const limit = Math.max(1, Math.min(500, Math.trunc(Number(options.limit ?? 50))))
  const filtered = billingLedger.filter((entry) => {
    if (options.aiPlayerId && entry.aiPlayerId !== options.aiPlayerId) return false
    if (options.factionId && entry.factionId !== options.factionId) return false
    if (options.governorPlayerId && entry.governorPlayerId !== options.governorPlayerId) return false
    if (options.billingAccountType && entry.billingAccountType !== options.billingAccountType) return false
    return true
  })
  const items = filtered.slice(-limit).reverse().map((item) => structuredClone(item))
  return {
    items,
    count: items.length,
  }
}

export function listAiPlayerProviderAuditEvents(options: {
  limit?: number
  aiPlayerId?: string
  factionId?: string
  governorPlayerId?: string
  ownerPlayerId?: string
  eventType?: AiPlayerProviderAuditEventType
} = {}) {
  ensureLoaded()
  const limit = Math.max(1, Math.min(500, Math.trunc(Number(options.limit ?? 50))))
  const filtered = auditEvents.filter((entry) => {
    if (options.aiPlayerId && entry.aiPlayerId !== options.aiPlayerId) return false
    if (options.factionId && entry.factionId !== options.factionId) return false
    if (options.governorPlayerId && entry.governorPlayerId !== options.governorPlayerId) return false
    if (options.ownerPlayerId && entry.ownerPlayerId !== options.ownerPlayerId) return false
    if (options.eventType && entry.eventType !== options.eventType) return false
    return true
  })
  const items = filtered.slice(-limit).reverse().map((item) => structuredClone(item))
  return {
    items,
    count: items.length,
  }
}

export function listAiPlayerProviderBudgetWindows(options: {
  limit?: number
  billingAccountType?: AiPlayerProviderBillingAccountType
  billingAccountId?: string
  budgetTier?: AiPlayerModelBudgetTier
} = {}) {
  ensureLoaded()
  const limit = Math.max(1, Math.min(500, Math.trunc(Number(options.limit ?? 50))))
  const filtered = Array.from(providerBudgetWindows.values()).filter((window) => {
    if (options.billingAccountType && window.billingAccountType !== options.billingAccountType) return false
    if (options.billingAccountId && window.billingAccountId !== options.billingAccountId) return false
    if (options.budgetTier && window.budgetTier !== options.budgetTier) return false
    return true
  })
  const items = filtered
    .sort((left, right) => left.windowStartedAt.localeCompare(right.windowStartedAt))
    .slice(-limit)
    .reverse()
    .map((item) => structuredClone(item))
  return {
    items,
    count: items.length,
  }
}

export async function reserveAiPlayerProviderBudget(input: ReserveProviderBudgetInput): Promise<ProviderBudgetReservationResult> {
  ensureLoaded()
  expireProviderBudgetReservations()
  const window = ensureProviderBudgetWindow(input)
  const externalResult = await reserveExternalProviderBudget(input, window)
  if (externalResult) {
    return externalResult
  }
  if (window.limitMode === 'disabled') {
    window.deniedRuns += 1
    window.updatedAt = nowIso()
    schedulePersist()
    return toBudgetReservationDenied('provider_budget_disabled', window)
  }
  if (isProviderBudgetExhausted(window)) {
    window.deniedRuns += 1
    window.updatedAt = nowIso()
    schedulePersist()
    return toBudgetReservationDenied('provider_budget_exhausted', window)
  }

  const reservationId = `budget_res_${randomUUID()}`
  window.reservedRuns += 1
  window.updatedAt = nowIso()
  providerBudgetReservations.set(reservationId, buildBudgetReservation({
    reservationId,
    window,
    budgetTier: window.budgetTier,
    request: input,
  }))
  schedulePersist()
  return toBudgetReservationOk(reservationId, window)
}

export async function releaseAiPlayerProviderBudgetReservation(reservationId: string): Promise<AiPlayerProviderBudgetWindow | null> {
  ensureLoaded()
  expireProviderBudgetReservations()
  const normalizedReservationId = sanitizeOptionalId(reservationId)
  if (!normalizedReservationId) {
    return null
  }
  const reservation = providerBudgetReservations.get(normalizedReservationId)
  if (!reservation) {
    return null
  }
  providerBudgetReservations.delete(normalizedReservationId)
  await notifyExternalBudgetGate('release', reservation)
  const window = providerBudgetWindows.get(reservation.budgetWindowKey)
  if (!window) {
    return null
  }
  window.reservedRuns = Math.max(0, window.reservedRuns - 1)
  window.updatedAt = nowIso()
  schedulePersist()
  return structuredClone(window)
}

export async function commitAiPlayerProviderBudgetReservation(
  reservationId: string | undefined,
  input: { usage?: unknown; ok?: boolean; error?: string } = {},
): Promise<AiPlayerProviderBudgetWindow | null> {
  ensureLoaded()
  expireProviderBudgetReservations()
  const normalizedReservationId = sanitizeOptionalId(reservationId)
  if (!normalizedReservationId) {
    return null
  }
  const reservation = providerBudgetReservations.get(normalizedReservationId)
  if (!reservation) {
    return null
  }
  providerBudgetReservations.delete(normalizedReservationId)
  await notifyExternalBudgetGate('commit', reservation, input)
  const window = providerBudgetWindows.get(reservation.budgetWindowKey)
  if (!window) {
    return null
  }
  const usage = sanitizeUsage(input.usage)
  const promptTokens = usage.promptTokens ?? 0
  const completionTokens = usage.completionTokens ?? 0
  const totalTokens = usage.totalTokens ?? (promptTokens + completionTokens)
  window.reservedRuns = Math.max(0, window.reservedRuns - 1)
  window.consumedRuns += 1
  window.consumedPromptTokens += promptTokens
  window.consumedCompletionTokens += completionTokens
  window.consumedTotalTokens += totalTokens
  window.consumedEstimatedCostUsd += usage.estimatedCostUsd ?? 0
  window.updatedAt = nowIso()
  schedulePersist()
  if (input.ok === false && input.error) {
    appendAuditEvent({
      eventType: 'provider_request_failed',
      requestId: normalizedReservationId,
      aiPlayerId: reservation.aiPlayerId,
      factionId: reservation.factionId,
      governorPlayerId: reservation.governorPlayerId,
      providerSource: reservation.source,
      byokSource: reservation.byokSource,
      model: reservation.model,
      provider: reservation.provider,
      reason: input.error,
      queueRunId: reservation.queueRunId,
      idempotencyKey: reservation.idempotencyKey,
      metadata: {
        budgetWindowKey: reservation.budgetWindowKey,
      },
    })
  }
  return structuredClone(window)
}

export function recordAiPlayerProviderModelRequestAccounting(input: RecordProviderAccountingInput): string {
  ensureLoaded()
  const requestId = sanitizeOptionalId(input.requestId) ?? `provider_req_${randomUUID()}`
  const failures = input.providerFallbackFailures ?? []
  for (const failure of failures) {
    appendAuditEvent({
      eventType: input.ok ? 'provider_fallback_failed' : 'provider_request_failed',
      requestId,
      aiPlayerId: input.aiPlayerId,
      factionId: input.factionId,
      governorPlayerId: input.governorPlayerId,
      providerSource: failure.source,
      byokSource: failure.byokSource,
      model: failure.model,
      reason: failure.error,
      queueRunId: input.queueRunId,
      idempotencyKey: input.idempotencyKey,
      metadata: {
        priority: failure.priority,
      },
    })
  }

  if (!input.ok || !input.selectedProvider) {
    if (failures.length === 0) {
      appendAuditEvent({
        eventType: 'provider_request_failed',
        requestId,
        aiPlayerId: input.aiPlayerId,
        factionId: input.factionId,
        governorPlayerId: input.governorPlayerId,
        reason: input.error ?? 'provider_request_failed',
        queueRunId: input.queueRunId,
        idempotencyKey: input.idempotencyKey,
      })
    }
    return requestId
  }

  const selected = input.selectedProvider
  const billingAccount = resolveBillingAccount({
    byokSource: selected.byokSource,
    factionId: input.factionId,
    governorPlayerId: input.governorPlayerId,
  })
  appendBillingEntry({
    requestId,
    aiPlayerId: input.aiPlayerId,
    factionId: input.factionId,
    governorPlayerId: input.governorPlayerId,
    billingAccountType: billingAccount.billingAccountType,
    billingAccountId: billingAccount.billingAccountId,
    providerSource: selected.source,
    byokSource: selected.byokSource,
    model: selected.model,
    provider: selected.provider,
    budgetTier: resolveBudgetTierForModel(selected.model),
    budgetWindowKey: sanitizeBudgetWindowKey(input.budgetWindowKey),
    budgetReservationId: sanitizeOptionalId(input.budgetReservationId),
    usage: sanitizeUsage(input.usage),
    queueRunId: sanitizeOptionalId(input.queueRunId),
    idempotencyKey: sanitizeOptionalId(input.idempotencyKey),
  })
  appendAuditEvent({
    eventType: 'provider_request_succeeded',
    requestId,
    aiPlayerId: input.aiPlayerId,
    factionId: input.factionId,
    governorPlayerId: input.governorPlayerId,
    providerSource: selected.source,
    byokSource: selected.byokSource,
    model: selected.model,
    provider: selected.provider,
    queueRunId: input.queueRunId,
    idempotencyKey: input.idempotencyKey,
    metadata: {
      priority: selected.priority,
      fallbackFailureCount: failures.length,
      budgetWindowKey: sanitizeBudgetWindowKey(input.budgetWindowKey) ?? null,
      budgetReservationId: sanitizeOptionalId(input.budgetReservationId) ?? null,
    },
  })
  return requestId
}
