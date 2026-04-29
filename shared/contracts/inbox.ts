import type { ResourceTransferBundle, RewardBundle } from './game/world'
import type { AiPlayerChatMessage } from './aiPlayerChat'

export type UnifiedInboxItemKind = 'ai_resource_transfer' | 'daily_welfare' | 'event_reward'

export type UnifiedInboxClaimAction = 'claimGovernorResourceInbox' | 'claimReward'
export type UnifiedInboxWorldAction = UnifiedInboxClaimAction | 'issueClaimableReward'

export type UnifiedInboxItemStatus = 'claimable'

export type UnifiedInboxItem = {
  itemId: string
  kind: UnifiedInboxItemKind
  status: UnifiedInboxItemStatus
  title: string
  summary: string
  factionId: string
  aiPlayerId?: string
  governorPlayerId?: string
  sourceId: string
  createdTick: number
  resources?: Partial<ResourceTransferBundle>
  reward?: RewardBundle
  claimAction: UnifiedInboxClaimAction
  claimPayload: Record<string, unknown>
}

export type UnifiedInboxListResponse = {
  ok: boolean
  factionId: string
  governorPlayerId?: string
  items: UnifiedInboxItem[]
  count: number
  countsByKind: Record<UnifiedInboxItemKind, number>
  error?: string
}

export type ClaimUnifiedInboxItemRequest = {
  itemId: string
  factionId?: string
  governorPlayerId?: string
  chatAiPlayerId?: string
  includeWorld?: boolean
}

export type ClaimUnifiedInboxItemResponse = {
  ok: boolean
  itemId?: string
  kind?: UnifiedInboxItemKind
  worldAction?: UnifiedInboxClaimAction
  result?: unknown
  chatMessage?: AiPlayerChatMessage
  error?: string
}

export type IssueUnifiedInboxRewardRequest = {
  kind: Extract<UnifiedInboxItemKind, 'daily_welfare' | 'event_reward'>
  factionId?: string
  rewardId?: string
  ledgerKey?: string
  label?: string
  summary?: string
  reward: RewardBundle
  includeWorld?: boolean
}

export type IssueUnifiedInboxRewardResponse = {
  ok: boolean
  item?: UnifiedInboxItem
  kind?: Extract<UnifiedInboxItemKind, 'daily_welfare' | 'event_reward'>
  worldAction: 'issueClaimableReward'
  result?: unknown
  error?: string
}

export type IssueDailyWelfareRequest = {
  factionId?: string
  benefitDate?: string
  label?: string
  summary?: string
  reward?: RewardBundle
  includeWorld?: boolean
}

export type IssueDailyWelfareResponse = IssueUnifiedInboxRewardResponse & {
  benefitDate?: string
  ledgerKey?: string
  rewardId?: string
}

export type IssueEventRewardRequest = {
  factionId?: string
  eventId: string
  rewardId?: string
  label?: string
  summary?: string
  reward: RewardBundle
  includeWorld?: boolean
}

export type IssueEventRewardResponse = IssueUnifiedInboxRewardResponse & {
  eventId?: string
  rewardId?: string
}
