import type {
  AiPlayerModelBudgetTier,
  AiPlayerModelByokSource,
  AiPlayerModelRoutingSource,
} from './aiPlayer'

export type AiPlayerProviderBillingAccountType = 'platform' | 'faction_byok' | 'player_byok'

export type AiPlayerProviderBillingUsage = {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  estimatedCostUsd?: number
}

export type AiPlayerProviderBudgetLimitMode = 'unlimited' | 'configured' | 'disabled'

export type AiPlayerProviderBudgetWindow = {
  budgetWindowKey: string
  billingAccountType: AiPlayerProviderBillingAccountType
  billingAccountId: string | null
  budgetTier: AiPlayerModelBudgetTier
  windowStartedAt: string
  windowEndsAt: string
  limitMode: AiPlayerProviderBudgetLimitMode
  maxRuns: number | null
  maxPromptTokens: number | null
  maxCompletionTokens: number | null
  maxTotalTokens: number | null
  maxEstimatedCostUsd: number | null
  reservedRuns: number
  consumedRuns: number
  deniedRuns: number
  consumedPromptTokens: number
  consumedCompletionTokens: number
  consumedTotalTokens: number
  consumedEstimatedCostUsd: number
  updatedAt: string
}

export type AiPlayerProviderBillingLedgerEntry = {
  ledgerEntryId: string
  requestId: string
  aiPlayerId: string
  factionId: string
  governorPlayerId: string
  billingAccountType: AiPlayerProviderBillingAccountType
  billingAccountId: string | null
  providerSource: AiPlayerModelRoutingSource
  byokSource: AiPlayerModelByokSource
  model: string
  provider: string
  budgetTier: AiPlayerModelBudgetTier
  budgetWindowKey?: string
  budgetReservationId?: string
  usage: AiPlayerProviderBillingUsage
  queueRunId?: string
  idempotencyKey?: string
  createdAt: string
}

export type AiPlayerProviderAuditEventType =
  | 'byok_key_configured'
  | 'byok_key_revoked'
  | 'provider_request_succeeded'
  | 'provider_request_failed'
  | 'provider_fallback_failed'

export type AiPlayerProviderAuditEvent = {
  eventId: string
  eventType: AiPlayerProviderAuditEventType
  requestId?: string
  aiPlayerId?: string
  factionId?: string
  governorPlayerId?: string
  ownerPlayerId?: string
  actorId?: string
  providerSource?: AiPlayerModelRoutingSource
  byokSource?: AiPlayerModelByokSource
  model?: string
  provider?: string
  keyFingerprint?: string | null
  reason?: string
  queueRunId?: string
  idempotencyKey?: string
  metadata?: Record<string, string | number | boolean | null>
  createdAt: string
}

export type AiPlayerProviderPlayerKeyStatus = 'active' | 'revoked'

export type AiPlayerProviderPlayerKeyReadModel = {
  ownerPlayerId: string
  model: string
  provider: string
  baseUrl?: string
  status: AiPlayerProviderPlayerKeyStatus
  secretConfigured: boolean
  secretSource: 'player_config:byok' | null
  byokSource: 'player_config'
  keyFingerprint: string | null
  createdAt: string
  updatedAt: string
  revokedAt?: string
}

export type UpsertAiPlayerProviderPlayerKeyRequest = {
  model: string
  provider?: string
  baseUrl?: string
  apiKey?: string
  status?: AiPlayerProviderPlayerKeyStatus
  updatedBy?: string
}

export type AiPlayerProviderPlayerKeyMutationResponse = {
  ok: boolean
  key?: AiPlayerProviderPlayerKeyReadModel
  error?: string
}

export type ListAiPlayerProviderBillingLedgerResponse = {
  items: AiPlayerProviderBillingLedgerEntry[]
  count: number
}

export type ListAiPlayerProviderAuditEventsResponse = {
  items: AiPlayerProviderAuditEvent[]
  count: number
}

export type ListAiPlayerProviderBudgetWindowsResponse = {
  items: AiPlayerProviderBudgetWindow[]
  count: number
}
