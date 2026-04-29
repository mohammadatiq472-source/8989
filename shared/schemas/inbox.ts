import { z } from 'zod'
import type {
  ClaimUnifiedInboxItemRequest,
  IssueDailyWelfareRequest,
  IssueEventRewardRequest,
  IssueUnifiedInboxRewardRequest,
} from '../contracts/inbox'
import { aiPlayerChatMessageSchema } from './aiPlayerChat'

export const unifiedInboxItemKindSchema = z.enum(['ai_resource_transfer', 'daily_welfare', 'event_reward'])

export const unifiedInboxClaimActionSchema = z.enum(['claimGovernorResourceInbox', 'claimReward'])

export const unifiedInboxItemStatusSchema = z.enum(['claimable'])

const resourceTransferBundlePartialSchema = z.object({
  food: z.number().int().nonnegative().optional(),
  wood: z.number().int().nonnegative().optional(),
  stone: z.number().int().nonnegative().optional(),
  iron: z.number().int().nonnegative().optional(),
}).strict()

const rewardBundleSchema = z.object({
  food: z.number().int().nonnegative(),
  ap: z.number().int().nonnegative(),
}).strict()

export const unifiedInboxItemSchema = z.object({
  itemId: z.string().trim().min(1).max(180),
  kind: unifiedInboxItemKindSchema,
  status: unifiedInboxItemStatusSchema,
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(500),
  factionId: z.string().trim().min(1).max(64),
  aiPlayerId: z.string().trim().min(1).max(80).optional(),
  governorPlayerId: z.string().trim().min(1).max(80).optional(),
  sourceId: z.string().trim().min(1).max(180),
  createdTick: z.number().int().nonnegative(),
  resources: resourceTransferBundlePartialSchema.optional(),
  reward: rewardBundleSchema.optional(),
  claimAction: unifiedInboxClaimActionSchema,
  claimPayload: z.record(z.string(), z.unknown()),
})

export const unifiedInboxListResponseSchema = z.object({
  ok: z.boolean(),
  factionId: z.string().trim().min(1).max(64),
  governorPlayerId: z.string().trim().min(1).max(80).optional(),
  items: z.array(unifiedInboxItemSchema),
  count: z.number().int().nonnegative(),
  countsByKind: z.record(unifiedInboxItemKindSchema, z.number().int().nonnegative()),
  error: z.string().trim().min(1).optional(),
})

export const claimUnifiedInboxItemRequestSchema = z.object({
  itemId: z.string().trim().min(1).max(180),
  factionId: z.string().trim().min(1).max(64).optional(),
  governorPlayerId: z.string().trim().min(1).max(80).optional(),
  chatAiPlayerId: z.string().trim().min(1).max(80).optional(),
  includeWorld: z.boolean().optional(),
})

export const issueUnifiedInboxRewardRequestSchema = z.object({
  kind: z.enum(['daily_welfare', 'event_reward']),
  factionId: z.string().trim().min(1).max(64).optional(),
  rewardId: z.string().trim().min(1).max(128).optional(),
  ledgerKey: z.string().trim().min(1).max(160).optional(),
  label: z.string().trim().min(1).max(80).optional(),
  summary: z.string().trim().min(1).max(240).optional(),
  reward: rewardBundleSchema.refine(
    (reward) => reward.food + reward.ap > 0,
    { message: 'reward must include food or action points' },
  ),
  includeWorld: z.boolean().optional(),
})

export const issueDailyWelfareRequestSchema = z.object({
  factionId: z.string().trim().min(1).max(64).optional(),
  benefitDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  label: z.string().trim().min(1).max(80).optional(),
  summary: z.string().trim().min(1).max(240).optional(),
  reward: rewardBundleSchema.refine(
    (reward) => reward.food + reward.ap > 0,
    { message: 'reward must include food or action points' },
  ).optional(),
  includeWorld: z.boolean().optional(),
})

export const issueEventRewardRequestSchema = z.object({
  factionId: z.string().trim().min(1).max(64).optional(),
  eventId: z.string().trim().min(1).max(96),
  rewardId: z.string().trim().min(1).max(128).optional(),
  label: z.string().trim().min(1).max(80).optional(),
  summary: z.string().trim().min(1).max(240).optional(),
  reward: rewardBundleSchema.refine(
    (reward) => reward.food + reward.ap > 0,
    { message: 'reward must include food or action points' },
  ),
  includeWorld: z.boolean().optional(),
})

export const claimUnifiedInboxItemResponseSchema = z.object({
  ok: z.boolean(),
  itemId: z.string().trim().min(1).max(180).optional(),
  kind: unifiedInboxItemKindSchema.optional(),
  worldAction: unifiedInboxClaimActionSchema.optional(),
  result: z.unknown().optional(),
  chatMessage: aiPlayerChatMessageSchema.optional(),
  error: z.string().trim().min(1).optional(),
})

export const issueUnifiedInboxRewardResponseSchema = z.object({
  ok: z.boolean(),
  item: unifiedInboxItemSchema.optional(),
  kind: z.enum(['daily_welfare', 'event_reward']).optional(),
  worldAction: z.literal('issueClaimableReward'),
  result: z.unknown().optional(),
  error: z.string().trim().min(1).optional(),
})

export function parseClaimUnifiedInboxItemRequest(input: unknown): ClaimUnifiedInboxItemRequest {
  return claimUnifiedInboxItemRequestSchema.parse(input) as ClaimUnifiedInboxItemRequest
}

export function parseIssueUnifiedInboxRewardRequest(input: unknown): IssueUnifiedInboxRewardRequest {
  return issueUnifiedInboxRewardRequestSchema.parse(input) as IssueUnifiedInboxRewardRequest
}

export function parseIssueDailyWelfareRequest(input: unknown): IssueDailyWelfareRequest {
  return issueDailyWelfareRequestSchema.parse(input) as IssueDailyWelfareRequest
}

export function parseIssueEventRewardRequest(input: unknown): IssueEventRewardRequest {
  return issueEventRewardRequestSchema.parse(input) as IssueEventRewardRequest
}
