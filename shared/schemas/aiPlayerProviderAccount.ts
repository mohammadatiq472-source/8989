import { z } from 'zod'
import type {
  AiPlayerProviderAuditEvent,
  AiPlayerProviderBillingLedgerEntry,
  ListAiPlayerProviderBudgetWindowsResponse,
  AiPlayerProviderPlayerKeyMutationResponse,
  ListAiPlayerProviderAuditEventsResponse,
  ListAiPlayerProviderBillingLedgerResponse,
  UpsertAiPlayerProviderPlayerKeyRequest,
} from '../contracts/aiPlayerProviderAccount'

export const aiPlayerProviderBillingAccountTypeSchema = z.enum(['platform', 'faction_byok', 'player_byok'])
export const aiPlayerProviderPlayerKeyStatusSchema = z.enum(['active', 'revoked'])
export const aiPlayerProviderAuditEventTypeSchema = z.enum([
  'byok_key_configured',
  'byok_key_revoked',
  'provider_request_succeeded',
  'provider_request_failed',
  'provider_fallback_failed',
])

export const aiPlayerProviderBillingUsageSchema = z.object({
  promptTokens: z.number().finite().nonnegative().optional(),
  completionTokens: z.number().finite().nonnegative().optional(),
  totalTokens: z.number().finite().nonnegative().optional(),
  estimatedCostUsd: z.number().finite().nonnegative().optional(),
})

export const aiPlayerProviderBudgetLimitModeSchema = z.enum(['unlimited', 'configured', 'disabled'])

export const aiPlayerProviderBudgetWindowSchema = z.object({
  budgetWindowKey: z.string().trim().min(1).max(240),
  billingAccountType: aiPlayerProviderBillingAccountTypeSchema,
  billingAccountId: z.string().trim().min(1).max(120).nullable(),
  budgetTier: z.enum(['strict_action', 'economy_chat', 'disabled']),
  windowStartedAt: z.string().trim().min(1).max(80),
  windowEndsAt: z.string().trim().min(1).max(80),
  limitMode: aiPlayerProviderBudgetLimitModeSchema,
  maxRuns: z.number().int().nonnegative().nullable(),
  maxPromptTokens: z.number().int().nonnegative().nullable(),
  maxCompletionTokens: z.number().int().nonnegative().nullable(),
  maxTotalTokens: z.number().int().nonnegative().nullable(),
  maxEstimatedCostUsd: z.number().finite().nonnegative().nullable(),
  reservedRuns: z.number().int().nonnegative(),
  consumedRuns: z.number().int().nonnegative(),
  deniedRuns: z.number().int().nonnegative(),
  consumedPromptTokens: z.number().nonnegative(),
  consumedCompletionTokens: z.number().nonnegative(),
  consumedTotalTokens: z.number().nonnegative(),
  consumedEstimatedCostUsd: z.number().nonnegative(),
  updatedAt: z.string().trim().min(1).max(80),
})

export const aiPlayerProviderBillingLedgerEntrySchema = z.object({
  ledgerEntryId: z.string().trim().min(1).max(120),
  requestId: z.string().trim().min(1).max(120),
  aiPlayerId: z.string().trim().min(1).max(80),
  factionId: z.string().trim().min(1).max(64),
  governorPlayerId: z.string().trim().min(1).max(80),
  billingAccountType: aiPlayerProviderBillingAccountTypeSchema,
  billingAccountId: z.string().trim().min(1).max(120).nullable(),
  providerSource: z.enum(['default', 'env', 'faction_config', 'player_config', 'fallback']),
  byokSource: z.enum(['none', 'faction_config', 'player_config']),
  model: z.string().trim().min(1).max(160),
  provider: z.string().trim().min(1).max(120),
  budgetTier: z.enum(['strict_action', 'economy_chat', 'disabled']),
  budgetWindowKey: z.string().trim().min(1).max(240).optional(),
  budgetReservationId: z.string().trim().min(1).max(120).optional(),
  usage: aiPlayerProviderBillingUsageSchema,
  queueRunId: z.string().trim().min(1).max(120).optional(),
  idempotencyKey: z.string().trim().min(1).max(160).optional(),
  createdAt: z.string().trim().min(1).max(80),
})

export const aiPlayerProviderAuditEventSchema = z.object({
  eventId: z.string().trim().min(1).max(120),
  eventType: aiPlayerProviderAuditEventTypeSchema,
  requestId: z.string().trim().min(1).max(120).optional(),
  aiPlayerId: z.string().trim().min(1).max(80).optional(),
  factionId: z.string().trim().min(1).max(64).optional(),
  governorPlayerId: z.string().trim().min(1).max(80).optional(),
  ownerPlayerId: z.string().trim().min(1).max(80).optional(),
  actorId: z.string().trim().min(1).max(80).optional(),
  providerSource: z.enum(['default', 'env', 'faction_config', 'player_config', 'fallback']).optional(),
  byokSource: z.enum(['none', 'faction_config', 'player_config']).optional(),
  model: z.string().trim().min(1).max(160).optional(),
  provider: z.string().trim().min(1).max(120).optional(),
  keyFingerprint: z.string().trim().min(1).max(80).nullable().optional(),
  reason: z.string().trim().min(1).max(240).optional(),
  queueRunId: z.string().trim().min(1).max(120).optional(),
  idempotencyKey: z.string().trim().min(1).max(160).optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  createdAt: z.string().trim().min(1).max(80),
})

export const aiPlayerProviderPlayerKeyReadModelSchema = z.object({
  ownerPlayerId: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(160),
  provider: z.string().trim().min(1).max(120),
  baseUrl: z.string().trim().min(1).max(240).optional(),
  status: aiPlayerProviderPlayerKeyStatusSchema,
  secretConfigured: z.boolean(),
  secretSource: z.literal('player_config:byok').nullable(),
  byokSource: z.literal('player_config'),
  keyFingerprint: z.string().trim().min(1).max(80).nullable(),
  createdAt: z.string().trim().min(1).max(80),
  updatedAt: z.string().trim().min(1).max(80),
  revokedAt: z.string().trim().min(1).max(80).optional(),
})

export const upsertAiPlayerProviderPlayerKeyRequestSchema = z.object({
  model: z.string().trim().min(1).max(160),
  provider: z.string().trim().min(1).max(120).optional(),
  baseUrl: z.string().trim().min(1).max(240).optional(),
  apiKey: z.string().trim().min(1).max(1024).optional(),
  status: aiPlayerProviderPlayerKeyStatusSchema.optional(),
  updatedBy: z.string().trim().min(1).max(80).optional(),
})

export const aiPlayerProviderPlayerKeyMutationResponseSchema = z.object({
  ok: z.boolean(),
  key: aiPlayerProviderPlayerKeyReadModelSchema.optional(),
  error: z.string().trim().min(1).optional(),
})

export const listAiPlayerProviderBillingLedgerResponseSchema = z.object({
  items: z.array(aiPlayerProviderBillingLedgerEntrySchema),
  count: z.number().int().nonnegative(),
})

export const listAiPlayerProviderAuditEventsResponseSchema = z.object({
  items: z.array(aiPlayerProviderAuditEventSchema),
  count: z.number().int().nonnegative(),
})

export const listAiPlayerProviderBudgetWindowsResponseSchema = z.object({
  items: z.array(aiPlayerProviderBudgetWindowSchema),
  count: z.number().int().nonnegative(),
})

export function parseUpsertAiPlayerProviderPlayerKeyRequest(input: unknown): UpsertAiPlayerProviderPlayerKeyRequest {
  return upsertAiPlayerProviderPlayerKeyRequestSchema.parse(input) as UpsertAiPlayerProviderPlayerKeyRequest
}

export function parseAiPlayerProviderPlayerKeyMutationResponse(input: unknown): AiPlayerProviderPlayerKeyMutationResponse {
  return aiPlayerProviderPlayerKeyMutationResponseSchema.parse(input) as AiPlayerProviderPlayerKeyMutationResponse
}

export function parseListAiPlayerProviderBillingLedgerResponse(input: unknown): ListAiPlayerProviderBillingLedgerResponse {
  return listAiPlayerProviderBillingLedgerResponseSchema.parse(input) as ListAiPlayerProviderBillingLedgerResponse
}

export function parseListAiPlayerProviderAuditEventsResponse(input: unknown): ListAiPlayerProviderAuditEventsResponse {
  return listAiPlayerProviderAuditEventsResponseSchema.parse(input) as ListAiPlayerProviderAuditEventsResponse
}

export function parseListAiPlayerProviderBudgetWindowsResponse(input: unknown): ListAiPlayerProviderBudgetWindowsResponse {
  return listAiPlayerProviderBudgetWindowsResponseSchema.parse(input) as ListAiPlayerProviderBudgetWindowsResponse
}

export function parseAiPlayerProviderBillingLedgerEntry(input: unknown): AiPlayerProviderBillingLedgerEntry {
  return aiPlayerProviderBillingLedgerEntrySchema.parse(input) as AiPlayerProviderBillingLedgerEntry
}

export function parseAiPlayerProviderAuditEvent(input: unknown): AiPlayerProviderAuditEvent {
  return aiPlayerProviderAuditEventSchema.parse(input) as AiPlayerProviderAuditEvent
}
