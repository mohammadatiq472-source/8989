import { z } from 'zod'
import type {
  AiPlayerChatPatrolSchedulerRunRequest,
  AiPlayerChatPatrolTickRequest,
  SendAiPlayerChatMessageRequest,
  UpdateAiPlayerChatReadCursorRequest,
} from '../contracts/aiPlayerChat'
import {
  aiPlayerActionProposalSchema,
  aiPlayerModelBudgetTierSchema,
  aiPlayerActionRiskLevelSchema,
  aiPlayerActionReceiptSchema,
  aiPlayerActionTypeSchema,
} from './aiPlayer'

export const aiPlayerChatMessageKindSchema = z.enum(['message', 'proposal', 'receipt', 'system'])

export const aiPlayerChatAuthorTypeSchema = z.enum(['governor', 'ai', 'system'])

export const aiPlayerChatHistoryFilterSchema = z.enum(['all', 'command', 'proposal', 'receipt', 'failure'])

export const aiPlayerChatHistoryCountsSchema = z.object({
  all: z.number().int().nonnegative(),
  command: z.number().int().nonnegative(),
  proposal: z.number().int().nonnegative(),
  receipt: z.number().int().nonnegative(),
  failure: z.number().int().nonnegative(),
})

export const aiPlayerChatPatrolTickTriggerModeSchema = z.enum(['manual', 'scheduler'])

export const aiPlayerChatMessageSchema = z.object({
  messageId: z.string().trim().min(1).max(120),
  aiPlayerId: z.string().trim().min(1).max(80),
  channelId: z.string().trim().min(1).max(120),
  kind: aiPlayerChatMessageKindSchema,
  authorType: aiPlayerChatAuthorTypeSchema,
  authorId: z.string().trim().min(1).max(120),
  authorName: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(1000),
  createdAt: z.string().trim().min(1),
  proposalId: z.string().trim().min(1).max(120).optional(),
  receiptProposalId: z.string().trim().min(1).max(120).optional(),
  action: aiPlayerActionTypeSchema.optional(),
  receiptOk: z.boolean().optional(),
  failureCode: z.string().trim().min(1).max(120).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const aiPlayerChatChannelSchema = z.object({
  channelId: z.string().trim().min(1).max(120),
  aiPlayerId: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  avatarId: z.string().trim().min(1).max(120).optional(),
  avatarImagePath: z.string().trim().min(1).max(240).optional(),
  governorPlayerId: z.string().trim().min(1).max(80),
  factionId: z.string().trim().min(1).max(64),
  messageCount: z.number().int().nonnegative(),
})

export const aiPlayerChatReadCursorSchema = z.object({
  aiPlayerId: z.string().trim().min(1).max(80),
  channelId: z.string().trim().min(1).max(120),
  readerId: z.string().trim().min(1).max(120),
  readMessageCount: z.number().int().nonnegative(),
  messageCount: z.number().int().nonnegative(),
  unreadCount: z.number().int().nonnegative(),
  updatedAt: z.string().trim().min(1),
})

export const sendAiPlayerChatMessageRequestSchema = z.object({
  body: z.string().trim().min(1).max(500),
  senderId: z.string().trim().min(1).max(80).optional(),
  senderName: z.string().trim().min(1).max(120).optional(),
  createProposal: z.boolean().optional(),
})

export const aiPlayerChatPatrolTickRequestSchema = z.object({
  triggeredBy: z.string().trim().min(1).max(120).optional(),
  triggerMode: aiPlayerChatPatrolTickTriggerModeSchema.optional(),
  goalPower: z.number().int().positive().max(100000).optional(),
  targetDevelopmentPoints: z.number().int().positive().max(100000).optional(),
  battleReportLimit: z.number().int().positive().max(50).optional(),
  cooldownTicks: z.number().int().nonnegative().max(100000).optional(),
  force: z.boolean().optional(),
}).strict()

export const aiPlayerChatPatrolSchedulerRunRequestSchema = z.object({
  triggeredBy: z.string().trim().min(1).max(120).optional(),
  queueRunId: z.string().trim().min(1).max(160).optional(),
  idempotencyKey: z.string().trim().min(1).max(160).optional(),
  leaseId: z.string().trim().min(1).max(160).optional(),
  leaseTtlMs: z.number().int().nonnegative().max(3_600_000).optional(),
  retryAfterMs: z.number().int().nonnegative().max(3_600_000).optional(),
  backoffMs: z.number().int().nonnegative().max(3_600_000).optional(),
  aiPlayerIds: z.array(z.string().trim().min(1).max(80)).min(1).max(50).optional(),
  governorPlayerId: z.string().trim().min(1).max(80).optional(),
  factionId: z.string().trim().min(1).max(64).optional(),
  shardIndex: z.number().int().nonnegative().max(999).optional(),
  shardCount: z.number().int().positive().max(1000).optional(),
  limit: z.number().int().positive().max(50).optional(),
  goalPower: z.number().int().positive().max(100000).optional(),
  targetDevelopmentPoints: z.number().int().positive().max(100000).optional(),
  battleReportLimit: z.number().int().positive().max(50).optional(),
  cooldownTicks: z.number().int().nonnegative().max(100000).optional(),
  providerBudgetTier: aiPlayerModelBudgetTierSchema.optional(),
  providerBudgetMaxRuns: z.number().int().nonnegative().max(50).optional(),
  force: z.boolean().optional(),
}).strict()

export const updateAiPlayerChatReadCursorRequestSchema = z.object({
  readerId: z.string().trim().min(1).max(120),
  readMessageCount: z.number().int().nonnegative().optional(),
  readMessageId: z.string().trim().min(1).max(120).optional(),
}).strict().refine(
  (value) => value.readMessageCount !== undefined || value.readMessageId !== undefined,
  { message: 'readMessageCount or readMessageId is required' },
)

export const aiPlayerChatChannelResponseSchema = z.object({
  channel: aiPlayerChatChannelSchema,
  messages: z.array(aiPlayerChatMessageSchema),
  count: z.number().int().nonnegative(),
  filter: aiPlayerChatHistoryFilterSchema.optional(),
  beforeMessageId: z.string().trim().min(1).max(120).optional(),
  totalCount: z.number().int().nonnegative().optional(),
  hasMore: z.boolean().optional(),
  nextBeforeMessageId: z.string().trim().min(1).max(120).optional(),
  historyCounts: aiPlayerChatHistoryCountsSchema.optional(),
  readCursor: aiPlayerChatReadCursorSchema.optional(),
  unreadCount: z.number().int().nonnegative().optional(),
})

const aiPlayerChatPatrolTickReadinessSchema = z.enum(['ready', 'needs_target', 'blocked', 'information_only'])

export const aiPlayerChatPatrolTickProposalSummarySchema = z.object({
  action: aiPlayerActionTypeSchema,
  label: z.string().trim().min(1).max(120),
  readiness: aiPlayerChatPatrolTickReadinessSchema,
  riskLevel: aiPlayerActionRiskLevelSchema,
  args: z.record(z.string(), z.unknown()).optional(),
  proposalArgs: z.record(z.string(), z.unknown()).optional(),
  proposalReason: z.string().trim().min(1).max(500).optional(),
  targetUnitId: z.string().trim().min(1).max(120).optional(),
  targetTileId: z.string().trim().min(1).max(120).optional(),
  reason: z.string().trim().min(1).max(500),
  blockers: z.array(z.string().trim().min(1).max(120)),
})

export const aiPlayerChatPatrolTickDevelopmentSummarySchema = z.object({
  tick: z.number().int().nonnegative(),
  worldVersion: z.number().int().nonnegative(),
  goalSummary: z.string().trim().min(1).max(500),
  readyCandidateCount: z.number().int().nonnegative(),
  blockedCandidateCount: z.number().int().nonnegative(),
  riskItemCount: z.number().int().nonnegative(),
})

export const aiPlayerChatPatrolTickBattleReportSummarySchema = z.object({
  count: z.number().int().nonnegative(),
  latestReportId: z.string().trim().min(1).max(120).optional(),
  latestOutcome: z.string().trim().min(1).max(80).optional(),
  latestSeverity: z.enum(['low', 'medium', 'high']).optional(),
  latestNextStepSuggestion: z.string().trim().min(1).max(500).optional(),
})

export const sendAiPlayerChatMessageResponseSchema = z.object({
  ok: z.boolean(),
  channel: aiPlayerChatChannelSchema.optional(),
  message: aiPlayerChatMessageSchema.optional(),
  aiMessage: aiPlayerChatMessageSchema.optional(),
  proposalMessage: aiPlayerChatMessageSchema.optional(),
  aggregateMessage: aiPlayerChatMessageSchema.optional(),
  proposal: aiPlayerActionProposalSchema.optional(),
  receipt: aiPlayerActionReceiptSchema.optional(),
  error: z.string().trim().min(1).optional(),
})

export const aiPlayerChatPatrolTickResponseSchema = z.object({
  ok: z.boolean(),
  channel: aiPlayerChatChannelSchema.optional(),
  message: aiPlayerChatMessageSchema.optional(),
  triggerMode: aiPlayerChatPatrolTickTriggerModeSchema.optional(),
  scheduled: z.boolean().optional(),
  skipped: z.boolean().optional(),
  proposalSummary: aiPlayerChatPatrolTickProposalSummarySchema.optional(),
  developmentPlanSummary: aiPlayerChatPatrolTickDevelopmentSummarySchema.optional(),
  battleReportSummary: aiPlayerChatPatrolTickBattleReportSummarySchema.optional(),
  cooldownTicks: z.number().int().nonnegative().optional(),
  cooldownUntilTick: z.number().int().nonnegative().optional(),
  cooldownRemainingTicks: z.number().int().nonnegative().optional(),
  tick: z.number().int().nonnegative().optional(),
  worldVersionBefore: z.number().int().nonnegative().optional(),
  worldVersionAfter: z.number().int().nonnegative().optional(),
  error: z.string().trim().min(1).optional(),
})

export const aiPlayerChatPatrolSchedulerRunItemSchema = z.object({
  aiPlayerId: z.string().trim().min(1).max(80),
  ok: z.boolean(),
  skipped: z.boolean().optional(),
  error: z.string().trim().min(1).optional(),
  messageId: z.string().trim().min(1).max(120).optional(),
  cooldownUntilTick: z.number().int().nonnegative().optional(),
  cooldownRemainingTicks: z.number().int().nonnegative().optional(),
  tick: z.number().int().nonnegative().optional(),
  providerBudgetTier: aiPlayerModelBudgetTierSchema.optional(),
})

export const aiPlayerChatPatrolSchedulerShardSummarySchema = z.object({
  shardIndex: z.number().int().nonnegative(),
  shardCount: z.number().int().positive(),
  selectedCount: z.number().int().nonnegative(),
})

export const aiPlayerChatPatrolSchedulerProviderBudgetSummarySchema = z.object({
  budgetTier: aiPlayerModelBudgetTierSchema,
  maxRuns: z.number().int().nonnegative().nullable(),
  consumedRuns: z.number().int().nonnegative(),
  remainingRuns: z.number().int().nonnegative().nullable(),
  skippedCount: z.number().int().nonnegative(),
  limitMode: z.enum(['unlimited', 'configured', 'disabled']).optional(),
  budgetWindowKey: z.string().trim().min(1).max(240).optional(),
  deniedRuns: z.number().int().nonnegative().optional(),
  consumedTotalTokens: z.number().nonnegative().optional(),
  remainingTotalTokens: z.number().nonnegative().nullable().optional(),
})

export const aiPlayerChatPatrolSchedulerQueueSummarySchema = z.object({
  queueRunId: z.string().trim().min(1).max(160).nullable(),
  idempotencyKey: z.string().trim().min(1).max(160).nullable(),
  leaseId: z.string().trim().min(1).max(160).nullable(),
  leaseTtlMs: z.number().int().nonnegative().nullable(),
  retryAfterMs: z.number().int().nonnegative(),
  backoffMs: z.number().int().nonnegative(),
  deduped: z.boolean(),
})

export const aiPlayerChatPatrolSchedulerRunResponseSchema = z.object({
  ok: z.boolean(),
  triggerMode: z.literal('scheduler'),
  scheduled: z.literal(true),
  attemptedCount: z.number().int().nonnegative(),
  writtenCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  shard: aiPlayerChatPatrolSchedulerShardSummarySchema,
  providerBudget: aiPlayerChatPatrolSchedulerProviderBudgetSummarySchema,
  queue: aiPlayerChatPatrolSchedulerQueueSummarySchema,
  items: z.array(aiPlayerChatPatrolSchedulerRunItemSchema),
  tick: z.number().int().nonnegative().optional(),
  worldVersionBefore: z.number().int().nonnegative().optional(),
  worldVersionAfter: z.number().int().nonnegative().optional(),
  error: z.string().trim().min(1).optional(),
})

export const aiPlayerChatReadCursorResponseSchema = z.object({
  ok: z.boolean(),
  channel: aiPlayerChatChannelSchema.optional(),
  readCursor: aiPlayerChatReadCursorSchema.optional(),
  error: z.string().trim().min(1).optional(),
})

export function parseSendAiPlayerChatMessageRequest(input: unknown): SendAiPlayerChatMessageRequest {
  return sendAiPlayerChatMessageRequestSchema.parse(input) as SendAiPlayerChatMessageRequest
}

export function parseAiPlayerChatPatrolTickRequest(input: unknown): AiPlayerChatPatrolTickRequest {
  return aiPlayerChatPatrolTickRequestSchema.parse(input) as AiPlayerChatPatrolTickRequest
}

export function parseAiPlayerChatPatrolSchedulerRunRequest(input: unknown): AiPlayerChatPatrolSchedulerRunRequest {
  return aiPlayerChatPatrolSchedulerRunRequestSchema.parse(input) as AiPlayerChatPatrolSchedulerRunRequest
}

export function parseUpdateAiPlayerChatReadCursorRequest(input: unknown): UpdateAiPlayerChatReadCursorRequest {
  return updateAiPlayerChatReadCursorRequestSchema.parse(input) as UpdateAiPlayerChatReadCursorRequest
}
