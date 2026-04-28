import type {
  AiPlayerActionProposal,
  AiPlayerActionReceipt,
  AiPlayerActionRiskLevel,
  AiPlayerActionType,
  AiPlayerBattleReportSeverity,
  AiPlayerDevelopmentPlanActionReadiness,
  AiPlayerModelBudgetTier,
} from './aiPlayer'

export type AiPlayerChatMessageKind = 'message' | 'proposal' | 'receipt' | 'system'

export type AiPlayerChatAuthorType = 'governor' | 'ai' | 'system'

export type AiPlayerChatHistoryFilter = 'all' | 'command' | 'proposal' | 'receipt' | 'failure'

export type AiPlayerChatHistoryCounts = Record<AiPlayerChatHistoryFilter, number>

export type AiPlayerChatPatrolTickTriggerMode = 'manual' | 'scheduler'

export type AiPlayerChatMessage = {
  messageId: string
  aiPlayerId: string
  channelId: string
  kind: AiPlayerChatMessageKind
  authorType: AiPlayerChatAuthorType
  authorId: string
  authorName: string
  body: string
  createdAt: string
  proposalId?: string
  receiptProposalId?: string
  action?: AiPlayerActionType
  receiptOk?: boolean
  failureCode?: string | null
  metadata?: Record<string, unknown>
}

export type AiPlayerChatChannel = {
  channelId: string
  aiPlayerId: string
  label: string
  avatarId?: string
  avatarImagePath?: string
  governorPlayerId: string
  factionId: string
  messageCount: number
}

export type AiPlayerChatReadCursor = {
  aiPlayerId: string
  channelId: string
  readerId: string
  readMessageCount: number
  messageCount: number
  unreadCount: number
  updatedAt: string
}

export type SendAiPlayerChatMessageRequest = {
  body: string
  senderId?: string
  senderName?: string
  createProposal?: boolean
}

export type AiPlayerChatPatrolTickRequest = {
  triggeredBy?: string
  triggerMode?: AiPlayerChatPatrolTickTriggerMode
  goalPower?: number
  targetDevelopmentPoints?: number
  battleReportLimit?: number
  cooldownTicks?: number
  force?: boolean
}

export type AiPlayerChatPatrolSchedulerRunRequest = {
  triggeredBy?: string
  queueRunId?: string
  idempotencyKey?: string
  leaseId?: string
  leaseTtlMs?: number
  retryAfterMs?: number
  backoffMs?: number
  aiPlayerIds?: string[]
  governorPlayerId?: string
  factionId?: string
  shardIndex?: number
  shardCount?: number
  limit?: number
  goalPower?: number
  targetDevelopmentPoints?: number
  battleReportLimit?: number
  cooldownTicks?: number
  providerBudgetTier?: AiPlayerModelBudgetTier
  providerBudgetMaxRuns?: number
  force?: boolean
}

export type AiPlayerChatPatrolTickProposalSummary = {
  action: AiPlayerActionType
  label: string
  readiness: AiPlayerDevelopmentPlanActionReadiness
  riskLevel: AiPlayerActionRiskLevel
  args?: Record<string, unknown>
  proposalArgs?: Record<string, unknown>
  proposalReason?: string
  targetUnitId?: string
  targetTileId?: string
  reason: string
  blockers: string[]
}

export type AiPlayerChatPatrolTickDevelopmentSummary = {
  tick: number
  worldVersion: number
  goalSummary: string
  readyCandidateCount: number
  blockedCandidateCount: number
  riskItemCount: number
}

export type AiPlayerChatPatrolTickBattleReportSummary = {
  count: number
  latestReportId?: string
  latestOutcome?: string
  latestSeverity?: AiPlayerBattleReportSeverity
  latestNextStepSuggestion?: string
}

export type UpdateAiPlayerChatReadCursorRequest = {
  readerId: string
  readMessageCount?: number
  readMessageId?: string
}

export type AiPlayerChatChannelResponse = {
  channel: AiPlayerChatChannel
  messages: AiPlayerChatMessage[]
  count: number
  filter?: AiPlayerChatHistoryFilter
  beforeMessageId?: string
  totalCount?: number
  hasMore?: boolean
  nextBeforeMessageId?: string
  historyCounts?: AiPlayerChatHistoryCounts
  readCursor?: AiPlayerChatReadCursor
  unreadCount?: number
}

export type SendAiPlayerChatMessageResponse = {
  ok: boolean
  channel?: AiPlayerChatChannel
  message?: AiPlayerChatMessage
  aiMessage?: AiPlayerChatMessage
  proposalMessage?: AiPlayerChatMessage
  aggregateMessage?: AiPlayerChatMessage
  proposal?: AiPlayerActionProposal
  receipt?: AiPlayerActionReceipt
  error?: string
}

export type AiPlayerChatPatrolTickResponse = {
  ok: boolean
  channel?: AiPlayerChatChannel
  message?: AiPlayerChatMessage
  triggerMode?: AiPlayerChatPatrolTickTriggerMode
  scheduled?: boolean
  skipped?: boolean
  proposalSummary?: AiPlayerChatPatrolTickProposalSummary
  developmentPlanSummary?: AiPlayerChatPatrolTickDevelopmentSummary
  battleReportSummary?: AiPlayerChatPatrolTickBattleReportSummary
  cooldownTicks?: number
  cooldownUntilTick?: number
  cooldownRemainingTicks?: number
  tick?: number
  worldVersionBefore?: number
  worldVersionAfter?: number
  error?: string
}

export type AiPlayerChatPatrolSchedulerRunItem = {
  aiPlayerId: string
  ok: boolean
  skipped?: boolean
  error?: string
  messageId?: string
  cooldownUntilTick?: number
  cooldownRemainingTicks?: number
  tick?: number
  providerBudgetTier?: AiPlayerModelBudgetTier
}

export type AiPlayerChatPatrolSchedulerShardSummary = {
  shardIndex: number
  shardCount: number
  selectedCount: number
}

export type AiPlayerChatPatrolSchedulerProviderBudgetSummary = {
  budgetTier: AiPlayerModelBudgetTier
  maxRuns: number | null
  consumedRuns: number
  remainingRuns: number | null
  skippedCount: number
  limitMode?: 'unlimited' | 'configured' | 'disabled'
  budgetWindowKey?: string
  deniedRuns?: number
  consumedTotalTokens?: number
  remainingTotalTokens?: number | null
}

export type AiPlayerChatPatrolSchedulerQueueSummary = {
  queueRunId: string | null
  idempotencyKey: string | null
  leaseId: string | null
  leaseTtlMs: number | null
  retryAfterMs: number
  backoffMs: number
  deduped: boolean
}

export type AiPlayerChatPatrolSchedulerRunResponse = {
  ok: boolean
  triggerMode: 'scheduler'
  scheduled: true
  attemptedCount: number
  writtenCount: number
  skippedCount: number
  failedCount: number
  shard: AiPlayerChatPatrolSchedulerShardSummary
  providerBudget: AiPlayerChatPatrolSchedulerProviderBudgetSummary
  queue: AiPlayerChatPatrolSchedulerQueueSummary
  items: AiPlayerChatPatrolSchedulerRunItem[]
  tick?: number
  worldVersionBefore?: number
  worldVersionAfter?: number
  error?: string
}

export type AiPlayerChatReadCursorResponse = {
  ok: boolean
  channel?: AiPlayerChatChannel
  readCursor?: AiPlayerChatReadCursor
  error?: string
}
