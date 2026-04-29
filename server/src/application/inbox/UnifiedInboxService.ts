import type {
  ClaimUnifiedInboxItemRequest,
  ClaimUnifiedInboxItemResponse,
  IssueDailyWelfareRequest,
  IssueDailyWelfareResponse,
  IssueEventRewardRequest,
  IssueEventRewardResponse,
  IssueUnifiedInboxRewardRequest,
  IssueUnifiedInboxRewardResponse,
  UnifiedInboxItem,
  UnifiedInboxItemKind,
  UnifiedInboxListResponse,
} from '../../../../shared/contracts/inbox'
import type {
  ClaimableReward,
  FactionState,
  GovernorResourceTransfer,
  RewardBundle,
  ResourceTransferBundle,
} from '../../../../shared/contracts/game/world'
import {
  claimGovernorResourceInboxAction,
  getWorldStateReadonly,
  issueClaimableRewardAction,
  rewardClaimAction,
} from '../world/WorldService'
import { recordUnifiedInboxClaimInChat } from '../ai/aiPlayerChatCommandService'

const DEFAULT_FACTION_ID = 'player'
const DEFAULT_DAILY_WELFARE_REWARD: RewardBundle = {
  food: 20,
  ap: 1,
}

function resolveFactionId(factionId?: string): string {
  const world = getWorldStateReadonly()
  const normalized = factionId?.trim()
  if (normalized && world.factions[normalized]) {
    return normalized
  }
  if (world.factions[DEFAULT_FACTION_ID]) {
    return DEFAULT_FACTION_ID
  }
  return Object.keys(world.factions)[0] ?? DEFAULT_FACTION_ID
}

function resolveBenefitDate(benefitDate?: string): string {
  const normalized = benefitDate?.trim()
  if (normalized && /^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized
  }
  return new Date().toISOString().slice(0, 10)
}

function resolveEventId(eventId: string): string {
  return eventId.trim()
}

function formatResourceBundle(resources: Partial<ResourceTransferBundle>): string {
  const labels: Record<keyof ResourceTransferBundle, string> = {
    food: '粮草',
    wood: '木材',
    stone: '石料',
    iron: '铁矿',
  }
  return (Object.keys(labels) as Array<keyof ResourceTransferBundle>)
    .map((key) => {
      const amount = Number(resources[key] ?? 0)
      return amount > 0 ? `${labels[key]} ${amount}` : ''
    })
    .filter(Boolean)
    .join('、') || '资源'
}

function resolveRewardKind(reward: ClaimableReward): UnifiedInboxItemKind {
  return reward.source === 'daily_welfare' ? 'daily_welfare' : 'event_reward'
}

function buildAiResourceTransferItem(
  factionId: string,
  transfer: GovernorResourceTransfer,
): UnifiedInboxItem {
  return {
    itemId: `ai_resource_transfer:${transfer.id}`,
    kind: 'ai_resource_transfer',
    status: 'claimable',
    title: 'AI 输送资源',
    summary: `${transfer.sourceAiPlayerId} 输送 ${formatResourceBundle(transfer.resources)}，领取后进入势力库存。`,
    factionId,
    aiPlayerId: transfer.sourceAiPlayerId,
    governorPlayerId: transfer.governorPlayerId,
    sourceId: transfer.id,
    createdTick: transfer.createdTick,
    resources: transfer.resources,
    claimAction: 'claimGovernorResourceInbox',
    claimPayload: {
      factionId,
      sourceAiPlayerId: transfer.sourceAiPlayerId,
      governorPlayerId: transfer.governorPlayerId,
      transferId: transfer.id,
    },
  }
}

function buildRewardItem(factionId: string, reward: ClaimableReward): UnifiedInboxItem {
  const kind = resolveRewardKind(reward)
  return {
    itemId: `reward:${reward.id}`,
    kind,
    status: 'claimable',
    title: kind === 'daily_welfare' ? '每日福利' : reward.label,
    summary: reward.summary,
    factionId,
    sourceId: reward.id,
    createdTick: reward.createdTick,
    reward: reward.reward,
    claimAction: 'claimReward',
    claimPayload: {
      factionId,
      rewardId: reward.id,
    },
  }
}

function collectInboxItems(
  factionId: string,
  faction: FactionState,
  governorPlayerId?: string,
): UnifiedInboxItem[] {
  const items: UnifiedInboxItem[] = []
  const inboxes = faction.governorResourceInboxes ?? {}
  for (const [inboxGovernorPlayerId, inbox] of Object.entries(inboxes)) {
    if (governorPlayerId && inboxGovernorPlayerId !== governorPlayerId) {
      continue
    }
    for (const transfer of inbox.pendingTransfers) {
      items.push(buildAiResourceTransferItem(factionId, transfer))
    }
  }

  for (const reward of faction.claimableRewards ?? []) {
    items.push(buildRewardItem(factionId, reward))
  }

  return items.sort((left, right) =>
    right.createdTick - left.createdTick || left.itemId.localeCompare(right.itemId),
  )
}

function buildCountsByKind(items: UnifiedInboxItem[]): Record<UnifiedInboxItemKind, number> {
  return {
    ai_resource_transfer: items.filter((item) => item.kind === 'ai_resource_transfer').length,
    daily_welfare: items.filter((item) => item.kind === 'daily_welfare').length,
    event_reward: items.filter((item) => item.kind === 'event_reward').length,
  }
}

export function listUnifiedInbox(params: {
  factionId?: string
  governorPlayerId?: string
} = {}): UnifiedInboxListResponse {
  const factionId = resolveFactionId(params.factionId)
  const world = getWorldStateReadonly()
  const faction = world.factions[factionId]
  if (!faction) {
    return {
      ok: false,
      factionId,
      governorPlayerId: params.governorPlayerId,
      items: [],
      count: 0,
      countsByKind: {
        ai_resource_transfer: 0,
        daily_welfare: 0,
        event_reward: 0,
      },
      error: `unknown faction: ${factionId}`,
    }
  }

  const governorPlayerId = params.governorPlayerId?.trim() || undefined
  const items = collectInboxItems(factionId, faction, governorPlayerId)
  return {
    ok: true,
    factionId,
    governorPlayerId,
    items,
    count: items.length,
    countsByKind: buildCountsByKind(items),
  }
}

function findInboxItem(itemId: string, factionId?: string, governorPlayerId?: string): UnifiedInboxItem | null {
  const inbox = listUnifiedInbox({ factionId, governorPlayerId })
  if (!inbox.ok) {
    return null
  }
  return inbox.items.find((item) => item.itemId === itemId) ?? null
}

export function claimUnifiedInboxItem(input: ClaimUnifiedInboxItemRequest): ClaimUnifiedInboxItemResponse {
  const item = findInboxItem(input.itemId, input.factionId, input.governorPlayerId)
  if (!item) {
    return {
      ok: false,
      itemId: input.itemId,
      error: 'inbox_item_not_found',
    }
  }

  const includeWorld = Boolean(input.includeWorld)
  const chatAiPlayerId = input.chatAiPlayerId?.trim() || item.aiPlayerId
  if (item.kind === 'ai_resource_transfer') {
    const result = claimGovernorResourceInboxAction({
      factionId: item.factionId,
      governorPlayerId: String(item.claimPayload.governorPlayerId ?? item.governorPlayerId ?? ''),
      transferId: String(item.claimPayload.transferId ?? item.sourceId),
    }, includeWorld)
    const response: ClaimUnifiedInboxItemResponse = {
      ok: Boolean(result.ok),
      itemId: item.itemId,
      kind: item.kind,
      worldAction: 'claimGovernorResourceInbox',
      result,
      error: result.ok ? undefined : result.failureCode ?? 'claim_governor_resource_inbox_failed',
    }
    if (chatAiPlayerId) {
      response.chatMessage = recordUnifiedInboxClaimInChat({
        aiPlayerId: chatAiPlayerId,
        item,
        ok: Boolean(result.ok),
        worldAction: 'claimGovernorResourceInbox',
        result,
        error: response.error,
      }) ?? undefined
    }
    return response
  }

  const result = rewardClaimAction(String(item.claimPayload.rewardId ?? item.sourceId), includeWorld, item.factionId)
  const response: ClaimUnifiedInboxItemResponse = {
    ok: Boolean(result.ok),
    itemId: item.itemId,
    kind: item.kind,
    worldAction: 'claimReward',
    result,
    error: result.ok ? undefined : result.failureCode ?? 'claim_reward_failed',
  }
  if (chatAiPlayerId) {
    response.chatMessage = recordUnifiedInboxClaimInChat({
      aiPlayerId: chatAiPlayerId,
      item,
      ok: Boolean(result.ok),
      worldAction: 'claimReward',
      result,
      error: response.error,
    }) ?? undefined
  }
  return response
}

export function issueUnifiedInboxReward(input: IssueUnifiedInboxRewardRequest): IssueUnifiedInboxRewardResponse {
  const result = issueClaimableRewardAction({
    factionId: input.factionId,
    rewardId: input.rewardId,
    ledgerKey: input.ledgerKey,
    source: input.kind,
    label: input.label,
    summary: input.summary,
    reward: input.reward,
  }, Boolean(input.includeWorld))
  if (!result.ok) {
    return {
      ok: false,
      kind: input.kind,
      worldAction: 'issueClaimableReward',
      result,
      error: result.failureCode ?? 'issue_claimable_reward_failed',
    }
  }

  const itemId = `reward:${String(result.relatedId ?? input.rewardId ?? '')}`
  const item = itemId === 'reward:'
    ? undefined
    : findInboxItem(itemId, input.factionId)
  return {
    ok: true,
    item: item ?? undefined,
    kind: input.kind,
    worldAction: 'issueClaimableReward',
    result,
  }
}

export function issueDailyWelfare(input: IssueDailyWelfareRequest): IssueDailyWelfareResponse {
  const factionId = resolveFactionId(input.factionId)
  const benefitDate = resolveBenefitDate(input.benefitDate)
  const ledgerKey = `daily_welfare:${benefitDate}:${factionId}`
  const rewardId = ledgerKey
  const result = issueUnifiedInboxReward({
    kind: 'daily_welfare',
    factionId,
    rewardId,
    ledgerKey,
    label: input.label ?? '每日福利',
    summary: input.summary ?? `${benefitDate} 每日登录福利。`,
    reward: input.reward ?? { ...DEFAULT_DAILY_WELFARE_REWARD },
    includeWorld: input.includeWorld,
  })

  return {
    ...result,
    benefitDate,
    ledgerKey,
    rewardId,
  }
}

export function issueEventReward(input: IssueEventRewardRequest): IssueEventRewardResponse {
  const factionId = resolveFactionId(input.factionId)
  const eventId = resolveEventId(input.eventId)
  const rewardId = input.rewardId?.trim() || `event_reward:${eventId}:${factionId}`
  const result = issueUnifiedInboxReward({
    kind: 'event_reward',
    factionId,
    rewardId,
    label: input.label ?? '活动奖励',
    summary: input.summary ?? `${eventId} 活动奖励。`,
    reward: input.reward,
    includeWorld: input.includeWorld,
  })

  return {
    ...result,
    eventId,
    rewardId,
  }
}
