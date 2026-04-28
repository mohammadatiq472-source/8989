import { randomUUID } from 'node:crypto'
import type {
  AiPlayerActionProposal,
  AiPlayerActionReceipt,
  AiPlayerActionProposalRequest,
  AiPlayerProposalSource,
  AiPlayerActionType,
  AiPlayerRecoveryHint,
  AiPlayerBattleReportReadItem,
  AiPlayerDevelopmentPlan,
  AiPlayerDevelopmentPlanCandidateAction,
  GovernedAiPlayerRuntimeDetail,
} from '../../../../shared/contracts/aiPlayer'
import type {
  AiPlayerChatChannel,
  AiPlayerChatHistoryCounts,
  AiPlayerChatHistoryFilter,
  AiPlayerChatMessage,
  AiPlayerChatPatrolSchedulerRunItem,
  AiPlayerChatPatrolSchedulerRunRequest,
  AiPlayerChatPatrolSchedulerRunResponse,
  AiPlayerChatPatrolSchedulerQueueSummary,
  AiPlayerChatPatrolTickBattleReportSummary,
  AiPlayerChatPatrolTickDevelopmentSummary,
  AiPlayerChatPatrolTickProposalSummary,
  AiPlayerChatPatrolTickRequest,
  AiPlayerChatPatrolTickResponse,
  AiPlayerChatPatrolTickTriggerMode,
  AiPlayerChatReadCursor,
  AiPlayerChatReadCursorResponse,
  SendAiPlayerChatMessageRequest,
  SendAiPlayerChatMessageResponse,
  UpdateAiPlayerChatReadCursorRequest,
} from '../../../../shared/contracts/aiPlayerChat'
import type {
  UnifiedInboxClaimAction,
  UnifiedInboxItem,
} from '../../../../shared/contracts/inbox'
import { getWorldStateReadonly } from '../world/WorldService'
import {
  clearAiPlayerRuntimeModelFallbackReasonForOwner,
  recordAiPlayerRuntimeModelFallbackFailuresForOwner,
  recordAiPlayerRuntimeModelFallbackReasonForOwner,
  resolveAiPlayerRuntimeModelTargetCandidates,
} from './aiPlayerRuntimeModelTarget'
import {
  commitAiPlayerProviderBudgetReservation,
  recordAiPlayerProviderModelRequestAccounting,
  reserveAiPlayerProviderBudget,
} from './aiPlayerProviderAccountStore'
import {
  parseAiPlayerRuntimeProposalJson,
  requestAiPlayerRuntimeProposalFromCandidateTargets,
  toAiPlayerActionProposalRequests,
} from './aiPlayerRuntimeProposalModel'
import {
  createAiPlayerActionProposal,
  getGovernedAiPlayerRuntime,
  listGovernedAiPlayers,
} from './AIPlayerGovernanceService'
import { buildAiPlayerBattleReportReadModel } from './aiPlayerBattleReportReadModel'
import { buildAiPlayerDevelopmentPlan } from './aiPlayerDevelopmentPlanReadModel'
import {
  ensureAiPlayerGovernanceLoaded,
  scheduleAiPlayerGovernancePersist,
} from './aiPlayerGovernancePersist'
import {
  chatMessagesByAiPlayer,
  chatReadCursors,
  cloneValue,
  MAX_PERSISTED_CHAT_MESSAGES_PER_PLAYER,
  nowIso,
} from './aiPlayerGovernanceState'

const DEFAULT_TRANSFER_AMOUNT = 11
const DEFAULT_PATROL_COOLDOWN_TICKS = 6
const DEFAULT_PATROL_SCHEDULER_LIMIT = 10
const PATROL_SCHEDULER_IDEMPOTENCY_CACHE_LIMIT = 128
const AI_SYSTEM_AUTHOR_ID = 'ai_chat_system'

type ResolvedChatProposal = {
  action: AiPlayerActionType
  args: Record<string, unknown>
  reason: string
  summary: string
  source: AiPlayerProposalSource
  metadata?: Record<string, unknown>
}

type ResourceKey = 'food' | 'wood' | 'stone' | 'iron'

type PatrolCooldownSnapshot = {
  cooldownUntilTick: number
  messageId: string
  source: string
}

type AiPlayerChatPatrolSchedulerOptions = AiPlayerChatPatrolSchedulerRunRequest & {
  intervalMs?: number
}

type PatrolSchedulerShard = {
  shardIndex: number
  shardCount: number
}

let patrolSchedulerTimer: ReturnType<typeof setInterval> | null = null
const patrolSchedulerIdempotencyCache = new Map<string, AiPlayerChatPatrolSchedulerRunResponse>()

function formatAiActionForPlayer(action: string | null | undefined): string {
  switch (action) {
    case 'resource_transfer_to_governor':
      return '输送资源给总督'
    case 'resource_gather':
      return '采集资源到 AI 子账户'
    case 'troop_heal':
      return '补兵整备'
    case 'tile_occupy':
      return '占领目标地块'
    case 'march_move':
      return '行军到目标地'
    case 'reward_claim':
      return '领取奖励'
    default:
      return action?.trim() || '未标记动作'
  }
}

function formatWorldActionForPlayer(worldAction: string | null | undefined, fallbackAction: string): string {
  switch (worldAction) {
    case 'transferFactionResourcesToGovernor':
      return '资源输送到总督通用收件箱'
    case 'claimGovernorResourceInbox':
      return '领取 AI 输送资源'
    case 'claimReward':
      return '领取通用奖励'
    case 'issueClaimableReward':
      return '发放可领取奖励'
    case 'healTroop':
      return '补兵整备'
    case 'occupyTile':
      return '占领目标地块'
    case 'moveUnit':
      return '行军到目标地'
    case 'gatherAiResourceTile':
      return '采集资源到 AI 子账户'
    default:
      return worldAction?.trim() || formatAiActionForPlayer(fallbackAction)
  }
}

function formatFailureCodeForPlayer(failureCode: string | null | undefined): string {
  switch (failureCode) {
    case 'insufficient_resources':
    case 'insufficient_ai_resources':
      return 'AI 子账户资源不足'
    case 'transfer_cooldown_active':
      return '资源输送冷却中'
    case 'daily_quota_exceeded':
      return '今日输送额度已耗尽'
    case 'approval_required':
    case 'proposal_not_approved':
      return '需要先批准提案'
    case 'proposal_not_found':
      return '提案不存在或已过期'
    case 'ai_player_not_found':
      return 'AI 玩家不存在'
    case 'ai_player_disabled':
      return 'AI 玩家已停用'
    case 'ai_player_paused':
      return 'AI 玩家已暂停'
    case 'proposal_execution_failed':
      return '后端执行失败'
    default:
      return failureCode?.trim() || ''
  }
}

function buildChannel(runtime: GovernedAiPlayerRuntimeDetail, messageCount: number): AiPlayerChatChannel {
  return {
    channelId: `ai:${runtime.aiPlayerId}`,
    aiPlayerId: runtime.aiPlayerId,
    label: runtime.displayName,
    avatarId: runtime.avatarId,
    avatarImagePath: runtime.avatarImagePath,
    governorPlayerId: runtime.governorPlayerId,
    factionId: runtime.factionId,
    messageCount,
  }
}

function readMessageBucket(aiPlayerId: string): AiPlayerChatMessage[] {
  ensureAiPlayerGovernanceLoaded()
  return chatMessagesByAiPlayer.get(aiPlayerId) ?? []
}

function buildAiAuthor(runtime: GovernedAiPlayerRuntimeDetail) {
  return {
    authorType: 'ai' as const,
    authorId: runtime.aiPlayerId,
    authorName: runtime.displayName,
  }
}

function messageMatchesHistoryFilter(message: AiPlayerChatMessage, filter: AiPlayerChatHistoryFilter): boolean {
  switch (filter) {
    case 'command':
      return message.kind === 'message' && message.authorType === 'governor'
    case 'proposal':
      return message.kind === 'proposal'
    case 'receipt':
      return message.kind === 'receipt'
    case 'failure':
      return Boolean(message.failureCode)
        || (message.kind === 'receipt' && message.receiptOk === false)
        || (message.kind === 'proposal' && String(message.metadata?.status ?? '') === 'failed')
    case 'all':
    default:
      return true
  }
}

function buildHistoryCounts(bucket: AiPlayerChatMessage[]): AiPlayerChatHistoryCounts {
  return {
    all: bucket.length,
    command: bucket.filter((message) => messageMatchesHistoryFilter(message, 'command')).length,
    proposal: bucket.filter((message) => messageMatchesHistoryFilter(message, 'proposal')).length,
    receipt: bucket.filter((message) => messageMatchesHistoryFilter(message, 'receipt')).length,
    failure: bucket.filter((message) => messageMatchesHistoryFilter(message, 'failure')).length,
  }
}

function buildReadCursorKey(aiPlayerId: string, readerId: string): string {
  return `${aiPlayerId}:${readerId}`
}

function buildReadCursor(
  runtime: GovernedAiPlayerRuntimeDetail,
  readerId: string,
  readMessageCount: number,
  updatedAt?: string,
): AiPlayerChatReadCursor {
  const bucket = readMessageBucket(runtime.aiPlayerId)
  const normalizedReadCount = Math.max(0, Math.min(bucket.length, Math.floor(readMessageCount)))
  return {
    aiPlayerId: runtime.aiPlayerId,
    channelId: `ai:${runtime.aiPlayerId}`,
    readerId,
    readMessageCount: normalizedReadCount,
    messageCount: bucket.length,
    unreadCount: Math.max(0, bucket.length - normalizedReadCount),
    updatedAt: updatedAt ?? nowIso(),
  }
}

function resolveStoredReadCursor(runtime: GovernedAiPlayerRuntimeDetail, readerId?: string): AiPlayerChatReadCursor | undefined {
  const normalizedReaderId = readerId?.trim()
  if (!normalizedReaderId) {
    return undefined
  }
  const stored = chatReadCursors.get(buildReadCursorKey(runtime.aiPlayerId, normalizedReaderId))
  if (!stored) {
    return buildReadCursor(runtime, normalizedReaderId, 0)
  }
  return buildReadCursor(runtime, normalizedReaderId, stored.readMessageCount, stored.updatedAt)
}

function appendAiPlayerChatMessage(input: Omit<AiPlayerChatMessage, 'messageId' | 'createdAt'>): AiPlayerChatMessage {
  ensureAiPlayerGovernanceLoaded()
  const message: AiPlayerChatMessage = {
    ...input,
    messageId: `chat_${randomUUID()}`,
    createdAt: nowIso(),
  }
  const bucket = chatMessagesByAiPlayer.get(input.aiPlayerId) ?? []
  bucket.push(cloneValue(message))
  if (bucket.length > MAX_PERSISTED_CHAT_MESSAGES_PER_PLAYER) {
    bucket.splice(0, bucket.length - MAX_PERSISTED_CHAT_MESSAGES_PER_PLAYER)
  }
  chatMessagesByAiPlayer.set(input.aiPlayerId, bucket)
  scheduleAiPlayerGovernancePersist()
  return cloneValue(message)
}

function hasSuccessfulReceipt(bucket: AiPlayerChatMessage[], action: AiPlayerActionType): boolean {
  return bucket.some((message) => message.kind === 'receipt'
    && message.action === action
    && message.receiptOk === true
    && String(message.metadata?.aggregateKind ?? '') !== 'battle_report_followup'
    && String(message.metadata?.aggregateKind ?? '') !== 'march_move_executed')
}

function recordBattleReportFollowupAggregateIfReady(proposal: AiPlayerActionProposal): AiPlayerChatMessage | null {
  if (proposal.action !== 'march_move' || proposal.status !== 'pending_approval') {
    return null
  }
  const runtime = getGovernedAiPlayerRuntime(proposal.aiPlayerId)
  if (!runtime) {
    return null
  }
  const bucket = readMessageBucket(runtime.aiPlayerId)
  const hasHealReceipt = hasSuccessfulReceipt(bucket, 'troop_heal')
  const hasOccupyReceipt = hasSuccessfulReceipt(bucket, 'tile_occupy')
  if (!hasHealReceipt || !hasOccupyReceipt) {
    return null
  }
  const duplicate = bucket.some((message) => String(message.metadata?.aggregateKind ?? '') === 'battle_report_followup'
    && String(message.metadata?.marchProposalId ?? '') === proposal.proposalId)
  if (duplicate) {
    return null
  }
  return appendAiPlayerChatMessage({
    aiPlayerId: runtime.aiPlayerId,
    channelId: `ai:${runtime.aiPlayerId}`,
    kind: 'receipt',
    ...buildAiAuthor(runtime),
    body: '已补兵、已占地，下一步行军待批准。',
    receiptProposalId: proposal.proposalId,
    action: 'march_move',
    receiptOk: true,
    metadata: {
      aggregateKind: 'battle_report_followup',
      steps: ['battle_report_read', 'troop_heal', 'tile_occupy', 'march_move'],
      marchProposalId: proposal.proposalId,
      proposalStatus: proposal.status,
    },
  })
}

function recordMarchMoveExecutedAggregateIfReady(receipt: AiPlayerActionReceipt): AiPlayerChatMessage | null {
  if (!receipt.ok || receipt.action !== 'march_move') {
    return null
  }
  if (receipt.worldAction && receipt.worldAction !== 'moveUnit') {
    return null
  }
  const runtime = getGovernedAiPlayerRuntime(receipt.aiPlayerId)
  if (!runtime) {
    return null
  }
  const bucket = readMessageBucket(runtime.aiPlayerId)
  const duplicate = bucket.some((message) => String(message.metadata?.aggregateKind ?? '') === 'march_move_executed'
    && String(message.metadata?.marchProposalId ?? '') === receipt.proposalId)
  if (duplicate) {
    return null
  }
  return appendAiPlayerChatMessage({
    aiPlayerId: runtime.aiPlayerId,
    channelId: `ai:${runtime.aiPlayerId}`,
    kind: 'receipt',
    ...buildAiAuthor(runtime),
    body: '已行军到目标地。',
    receiptProposalId: receipt.proposalId,
    action: 'march_move',
    receiptOk: true,
    metadata: {
      aggregateKind: 'march_move_executed',
      steps: ['march_move'],
      marchProposalId: receipt.proposalId,
      worldAction: receipt.worldAction,
      worldActionPayload: receipt.worldActionPayload,
    },
  })
}

function formatResources(resources: Record<string, unknown>): string {
  const labels: Record<ResourceKey, string> = {
    food: '粮草',
    wood: '木材',
    stone: '石料',
    iron: '铁矿',
  }
  return (Object.keys(labels) as ResourceKey[])
    .map((key) => {
      const amount = Number(resources[key] ?? 0)
      return amount > 0 ? `${labels[key]} ${amount}` : ''
    })
    .filter(Boolean)
    .join('、')
}

function formatReward(reward: Record<string, unknown>): string {
  const food = Number(reward.food ?? 0)
  const actionPoints = Number(reward.ap ?? 0)
  return [
    food > 0 ? `粮草 ${food}` : '',
    actionPoints > 0 ? `行动点 ${actionPoints}` : '',
  ].filter(Boolean).join('、') || '奖励'
}

function formatInboxItemPayloadForPlayer(item: UnifiedInboxItem): string {
  if (item.kind === 'ai_resource_transfer') {
    return `资源已到账：${formatResources((item.resources ?? {}) as Record<string, unknown>)}`
  }
  return `奖励已到账：${formatReward((item.reward ?? {}) as Record<string, unknown>)}`
}

function readFailureCodeFromUnknown(result: unknown, fallback?: string): string {
  if (result && typeof result === 'object' && 'failureCode' in result) {
    const failureCode = String((result as { failureCode?: unknown }).failureCode ?? '').trim()
    if (failureCode) {
      return failureCode
    }
  }
  return fallback?.trim() ?? ''
}

function resolveRequestedResource(body: string): ResourceKey {
  const normalized = body.toLowerCase()
  if (normalized.includes('粮') || normalized.includes('food')) {
    return 'food'
  }
  if (normalized.includes('石') || normalized.includes('stone')) {
    return 'stone'
  }
  if (normalized.includes('铁') || normalized.includes('iron')) {
    return 'iron'
  }
  return 'wood'
}

function parseRequestedAmount(body: string): number | null {
  const matched = body.match(/\d+/)
  if (!matched) {
    return null
  }
  const amount = Number(matched[0])
  return Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : null
}

function shouldCreateResourceTransferProposal(body: string): boolean {
  const normalized = body.toLowerCase()
  return [
    '输送',
    '转',
    '交',
    '给我',
    '总督',
    '资源',
    '木材',
    '粮',
    '石',
    '铁',
    'transfer',
    'resource',
    'wood',
    'food',
    'stone',
    'iron',
  ].some((keyword) => normalized.includes(keyword))
}

function resolveResourceTransferProposal(
  runtime: GovernedAiPlayerRuntimeDetail,
  body: string,
): ResolvedChatProposal | { error: string; summary: string } | null {
  if (!shouldCreateResourceTransferProposal(body)) {
    return null
  }
  if (!runtime.resourceTransfer.canTransferNow) {
    return {
      error: runtime.resourceTransfer.blockedBy ?? 'resource_transfer_blocked',
      summary: '当前资源输送被后端策略拦截，暂不生成提案。',
    }
  }

  const world = getWorldStateReadonly()
  const account = world.factions[runtime.factionId]?.aiResourceAccounts?.[runtime.aiPlayerId]
  if (!account) {
    return {
      error: 'missing_ai_resource_account',
      summary: '当前 AI 没有可读取的资源子账户，暂不生成输送提案。',
    }
  }

  const resourceKey = resolveRequestedResource(body)
  const available = Math.max(0, Math.floor(Number(account.resources[resourceKey] ?? 0)))
  if (available <= 0) {
    return {
      error: 'missing_transferable_resource',
      summary: '资源子账户里没有足够资源，暂不生成输送提案。',
    }
  }

  const requestedAmount = parseRequestedAmount(body) ?? Math.min(DEFAULT_TRANSFER_AMOUNT, available)
  const quotaCappedAmount = Math.min(requestedAmount, Math.max(0, runtime.resourceTransfer.remainingQuotaTotal))
  const amount = Math.min(available, quotaCappedAmount)
  if (amount <= 0) {
    return {
      error: 'daily_quota_exceeded',
      summary: '今日输送额度不足，暂不生成输送提案。',
    }
  }

  const resources = { [resourceKey]: amount }
  const summary = `我已根据聊天命令生成提案：输送${formatResources(resources)}到主界面通用收件箱。`
  return {
    action: 'resource_transfer_to_governor',
    args: {
      resources,
    },
    reason: `Governor chat command requested resource transfer: ${body}`,
    summary,
    source: 'human',
  }
}

function buildAiPlayerChatModelObservation(runtime: GovernedAiPlayerRuntimeDetail, body: string) {
  const world = getWorldStateReadonly()
  const faction = world.factions[runtime.factionId]
  const developmentPlan = buildAiPlayerDevelopmentPlan(runtime)
  return {
    aiPlayerId: runtime.aiPlayerId,
    runtime,
    chatCommand: {
      body,
      senderRole: 'governor',
      safetyRule: 'model may only propose governed JSON actions; backend owns validation and execution',
    },
    world: {
      tick: world.tick,
      worldVersion: world.worldVersion,
      faction: faction
        ? {
            id: faction.id,
            actionPoints: faction.actionPoints,
            food: faction.food,
            wood: faction.wood ?? 0,
            stone: faction.stone ?? 0,
            iron: faction.iron ?? 0,
            aiResourceAccounts: faction.aiResourceAccounts ?? {},
            governorResourceInboxes: faction.governorResourceInboxes ?? {},
            aiResourceTransferQuotaByAiPlayer: faction.aiResourceTransferQuotaByAiPlayer ?? {},
            aiResourceTransferPolicy: faction.aiResourceTransferPolicy ?? null,
          }
        : null,
    },
    developmentPlan,
    receipts: runtime.latestReceipt ? [runtime.latestReceipt] : [],
    failures: runtime.observability.recentFailures?.samples ?? [],
  }
}

function normalizePatrolTargetDevelopmentPoints(input: AiPlayerChatPatrolTickRequest): number | undefined {
  const raw = input.targetDevelopmentPoints ?? input.goalPower
  const value = Number(raw ?? Number.NaN)
  if (!Number.isFinite(value)) {
    return undefined
  }
  return Math.max(1, Math.min(100000, Math.trunc(value)))
}

function normalizePatrolBattleReportLimit(input: AiPlayerChatPatrolTickRequest): number {
  const value = Number(input.battleReportLimit ?? 3)
  if (!Number.isFinite(value)) {
    return 3
  }
  return Math.max(1, Math.min(50, Math.trunc(value)))
}

function normalizePatrolTriggerMode(input: AiPlayerChatPatrolTickRequest): AiPlayerChatPatrolTickTriggerMode {
  return input.triggerMode === 'scheduler' ? 'scheduler' : 'manual'
}

function normalizePatrolCooldownTicks(input: AiPlayerChatPatrolTickRequest): number {
  const value = Number(input.cooldownTicks ?? DEFAULT_PATROL_COOLDOWN_TICKS)
  if (!Number.isFinite(value)) {
    return DEFAULT_PATROL_COOLDOWN_TICKS
  }
  return Math.max(0, Math.min(100000, Math.trunc(value)))
}

function normalizePatrolSchedulerLimit(input: AiPlayerChatPatrolSchedulerRunRequest): number {
  const value = Number(input.limit ?? DEFAULT_PATROL_SCHEDULER_LIMIT)
  if (!Number.isFinite(value)) {
    return DEFAULT_PATROL_SCHEDULER_LIMIT
  }
  return Math.max(1, Math.min(50, Math.trunc(value)))
}

function normalizePatrolSchedulerShard(input: AiPlayerChatPatrolSchedulerRunRequest): PatrolSchedulerShard {
  const rawCount = Number(input.shardCount ?? 1)
  const shardCount = Number.isFinite(rawCount)
    ? Math.max(1, Math.min(1000, Math.trunc(rawCount)))
    : 1
  const rawIndex = Number(input.shardIndex ?? 0)
  const shardIndex = Number.isFinite(rawIndex)
    ? Math.max(0, Math.min(shardCount - 1, Math.trunc(rawIndex)))
    : 0
  return { shardIndex, shardCount }
}

function normalizeOptionalQueueText(value: string | undefined) {
  const normalized = value?.trim()
  return normalized || null
}

function normalizeQueueMs(value: number | undefined, fallback = 0) {
  const normalized = Number(value ?? fallback)
  if (!Number.isFinite(normalized)) {
    return fallback
  }
  return Math.max(0, Math.min(3_600_000, Math.trunc(normalized)))
}

function buildPatrolSchedulerQueueSummary(
  input: AiPlayerChatPatrolSchedulerRunRequest,
  deduped: boolean,
): AiPlayerChatPatrolSchedulerQueueSummary {
  const backoffMs = normalizeQueueMs(input.backoffMs)
  return {
    queueRunId: normalizeOptionalQueueText(input.queueRunId),
    idempotencyKey: normalizeOptionalQueueText(input.idempotencyKey),
    leaseId: normalizeOptionalQueueText(input.leaseId),
    leaseTtlMs: input.leaseTtlMs === undefined ? null : normalizeQueueMs(input.leaseTtlMs),
    retryAfterMs: normalizeQueueMs(input.retryAfterMs, backoffMs),
    backoffMs,
    deduped,
  }
}

function cachePatrolSchedulerIdempotentResponse(
  key: string | null,
  response: AiPlayerChatPatrolSchedulerRunResponse,
) {
  if (!key) {
    return
  }
  patrolSchedulerIdempotencyCache.set(key, cloneValue(response))
  while (patrolSchedulerIdempotencyCache.size > PATROL_SCHEDULER_IDEMPOTENCY_CACHE_LIMIT) {
    const oldestKey = patrolSchedulerIdempotencyCache.keys().next().value
    if (!oldestKey) {
      break
    }
    patrolSchedulerIdempotencyCache.delete(oldestKey)
  }
}

function readPatrolSchedulerIdempotentResponse(
  queue: AiPlayerChatPatrolSchedulerQueueSummary,
): AiPlayerChatPatrolSchedulerRunResponse | null {
  if (!queue.idempotencyKey) {
    return null
  }
  const cached = patrolSchedulerIdempotencyCache.get(queue.idempotencyKey)
  if (!cached) {
    return null
  }
  return {
    ...cloneValue(cached),
    queue: {
      ...cloneValue(cached.queue),
      queueRunId: queue.queueRunId ?? cached.queue.queueRunId,
      leaseId: queue.leaseId ?? cached.queue.leaseId,
      leaseTtlMs: queue.leaseTtlMs ?? cached.queue.leaseTtlMs,
      retryAfterMs: queue.retryAfterMs,
      backoffMs: queue.backoffMs,
      deduped: true,
    },
  }
}

function readMetadataNumber(metadata: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = Number(metadata?.[key] ?? Number.NaN)
  return Number.isFinite(value) ? value : undefined
}

function readLatestPatrolCooldown(aiPlayerId: string): PatrolCooldownSnapshot | null {
  const bucket = readMessageBucket(aiPlayerId)
  for (let index = bucket.length - 1; index >= 0; index -= 1) {
    const message = bucket[index]
    const source = String(message.metadata?.source ?? '').trim()
    if (source !== 'manual_patrol_tick' && source !== 'scheduler_patrol_tick') {
      continue
    }
    const cooldownUntilTick = readMetadataNumber(message.metadata, 'cooldownUntilTick')
    if (cooldownUntilTick === undefined) {
      continue
    }
    return {
      cooldownUntilTick,
      messageId: message.messageId,
      source,
    }
  }
  return null
}

function clipMessageBody(body: string, maxLength = 900): string {
  if (body.length <= maxLength) {
    return body
  }
  return `${body.slice(0, Math.max(0, maxLength - 3))}...`
}

function toPatrolProposalSummary(
  candidate: AiPlayerDevelopmentPlanCandidateAction,
): AiPlayerChatPatrolTickProposalSummary {
  const proposalArgs = candidate.proposalArgs ?? candidate.args
  const proposalReason = candidate.proposalReason ?? candidate.reason
  return {
    action: candidate.action,
    label: candidate.label,
    readiness: candidate.readiness,
    riskLevel: candidate.riskLevel,
    args: candidate.args,
    proposalArgs,
    proposalReason,
    targetUnitId: candidate.targetUnitId,
    targetTileId: candidate.targetTileId,
    reason: candidate.reason,
    blockers: candidate.blockers,
  }
}

function selectPatrolProposalSummary(
  plan: AiPlayerDevelopmentPlan,
): AiPlayerChatPatrolTickProposalSummary | undefined {
  const readyCandidate = plan.candidateActions.find((candidate) => (
    candidate.executableInV1
      && candidate.readiness === 'ready'
      && Boolean(candidate.proposalArgs ?? candidate.args)
  ))
  const fallbackCandidate = readyCandidate
    ?? plan.candidateActions.find((candidate) => candidate.executableInV1 && candidate.readiness === 'ready')
    ?? plan.candidateActions.find((candidate) => candidate.readiness === 'needs_target')
  return fallbackCandidate ? toPatrolProposalSummary(fallbackCandidate) : undefined
}

function buildPatrolDevelopmentSummary(plan: AiPlayerDevelopmentPlan): AiPlayerChatPatrolTickDevelopmentSummary {
  return {
    tick: plan.tick,
    worldVersion: plan.worldVersion,
    goalSummary: plan.goal.summary,
    readyCandidateCount: plan.candidateActions.filter((candidate) => candidate.readiness === 'ready').length,
    blockedCandidateCount: plan.candidateActions.filter((candidate) => candidate.readiness === 'blocked').length,
    riskItemCount: plan.riskItems.length,
  }
}

function buildPatrolBattleReportSummary(
  latestReport: AiPlayerBattleReportReadItem | undefined,
  count: number,
): AiPlayerChatPatrolTickBattleReportSummary {
  return {
    count,
    latestReportId: latestReport?.reportId,
    latestOutcome: latestReport?.outcome,
    latestSeverity: latestReport?.severity,
    latestNextStepSuggestion: latestReport?.nextStepSuggestion,
  }
}

function buildPatrolMessageBody(input: {
  developmentSummary: AiPlayerChatPatrolTickDevelopmentSummary
  battleReportSummary: AiPlayerChatPatrolTickBattleReportSummary
  proposalSummary?: AiPlayerChatPatrolTickProposalSummary
}): string {
  const battleText = input.battleReportSummary.latestReportId
    ? `最近战报 ${input.battleReportSummary.latestReportId}：${input.battleReportSummary.latestOutcome ?? 'unknown'}，建议：${input.battleReportSummary.latestNextStepSuggestion ?? '继续观察'}。`
    : '最近没有 AI 相关战报。'
  const proposalText = input.proposalSummary
    ? `候选提案：${input.proposalSummary.label}；${input.proposalSummary.proposalReason ?? input.proposalSummary.reason}`
    : '当前没有可直接形成提案的候选动作，我会继续等待目标或资源条件。'
  return clipMessageBody([
    `巡查完成：tick ${input.developmentSummary.tick}，worldVersion ${input.developmentSummary.worldVersion}。`,
    `发育目标：${input.developmentSummary.goalSummary}`,
    battleText,
    proposalText,
  ].join(' '))
}

function pickModelProposalRequest(
  aiPlayerId: string,
  proposalRequests: AiPlayerActionProposalRequest[],
): AiPlayerActionProposalRequest | null {
  return proposalRequests.find((request) => request.aiPlayerId === aiPlayerId) ?? proposalRequests[0] ?? null
}

function normalizeModelProposalRequestForCommand(
  request: AiPlayerActionProposalRequest,
  body: string,
): AiPlayerActionProposalRequest {
  if (request.action !== 'resource_transfer_to_governor') {
    return request
  }
  const requestedAmount = parseRequestedAmount(body)
  if (!requestedAmount) {
    return request
  }
  const resourceKey = resolveRequestedResource(body)
  const args = request.args && typeof request.args === 'object'
    ? { ...(request.args as Record<string, unknown>) }
    : {}
  const resources = {
    [resourceKey]: requestedAmount,
  }
  args.resources = resources
  return {
    ...request,
    args,
    reason: `按聊天命令提案：输送${formatResources(resources)}到总督通用收件箱。`,
  }
}

function buildModelProposalSummary(
  request: AiPlayerActionProposalRequest,
  fallbackSummary: string,
): string {
  if (request.action === 'resource_transfer_to_governor') {
    const args = request.args && typeof request.args === 'object'
      ? request.args as Record<string, unknown>
      : {}
    const resources = args.resources && typeof args.resources === 'object'
      ? args.resources as Record<string, unknown>
      : {}
    const resourceText = formatResources(resources)
    if (resourceText) {
      return `我已按聊天命令生成提案：输送${resourceText}到主界面通用收件箱。`
    }
  }
  return fallbackSummary.trim() || `我已根据聊天命令生成提案：${request.action}`
}

function resolveProposalFromModelRequest(
  request: AiPlayerActionProposalRequest,
  body: string,
  summary: string,
  metadata: Record<string, unknown>,
): ResolvedChatProposal {
  const normalizedRequest = normalizeModelProposalRequestForCommand(request, body)
  return {
    action: normalizedRequest.action,
    args: normalizedRequest.args && typeof normalizedRequest.args === 'object'
      ? normalizedRequest.args as Record<string, unknown>
      : {},
    reason: normalizedRequest.reason,
    summary: buildModelProposalSummary(normalizedRequest, summary),
    source: normalizedRequest.source,
    metadata,
  }
}

function resolveProviderLabel(baseUrl: string) {
  try {
    return new URL(baseUrl).host || 'relay'
  } catch {
    return 'relay'
  }
}

async function resolveModelProposal(
  runtime: GovernedAiPlayerRuntimeDetail,
  body: string,
): Promise<ResolvedChatProposal | { error: string; summary: string } | null> {
  const observation = buildAiPlayerChatModelObservation(runtime, body)
  const testMockOutput = process.env.NODE_ENV === 'test'
    ? process.env.AI_PLAYER_RUNTIME_MODEL_MOCK_OUTPUT?.trim()
    : ''
  if (testMockOutput) {
    try {
      const output = parseAiPlayerRuntimeProposalJson(testMockOutput)
      const proposalRequest = pickModelProposalRequest(
        runtime.aiPlayerId,
        toAiPlayerActionProposalRequests(runtime.aiPlayerId, output),
      )
      if (!proposalRequest) {
        return {
          error: 'model_proposal_empty',
          summary: output.deferReason || '模型没有生成可执行提案。',
        }
      }
      return resolveProposalFromModelRequest(proposalRequest, body, output.summary ?? proposalRequest.reason, {
        proposalMode: 'model',
        model: 'mock:test',
        providerFallbackFailures: [],
      })
    } catch {
      return {
        error: 'model_response_invalid_json_proposal',
        summary: '模型返回不是严格 JSON proposal，已拒绝创建提案。',
      }
    }
  }

  const candidates = resolveAiPlayerRuntimeModelTargetCandidates({
    factionId: runtime.factionId,
    ownerPlayerId: runtime.governorPlayerId,
  })
  if (candidates.every((candidate) => candidate.target.apiKeys.length === 0)) {
    recordAiPlayerRuntimeModelFallbackReasonForOwner(
      runtime.factionId,
      'missing_model_api_key',
      runtime.governorPlayerId,
    )
    recordAiPlayerProviderModelRequestAccounting({
      ok: false,
      aiPlayerId: runtime.aiPlayerId,
      factionId: runtime.factionId,
      governorPlayerId: runtime.governorPlayerId,
      error: 'missing_model_api_key',
    })
    return null
  }

  const modelResult = await requestAiPlayerRuntimeProposalFromCandidateTargets({
    candidates,
    observation,
    reserveCandidateAttempt: (candidate) => reserveAiPlayerProviderBudget({
      aiPlayerId: runtime.aiPlayerId,
      factionId: runtime.factionId,
      governorPlayerId: runtime.governorPlayerId,
      model: candidate.target.model,
      provider: resolveProviderLabel(candidate.target.baseUrl),
      source: candidate.source,
      byokSource: candidate.byokSource,
    }),
    commitCandidateAttempt: async (_candidate, result, reservation) => {
      await commitAiPlayerProviderBudgetReservation(reservation?.reservationId, {
        ok: result.ok,
        usage: result.ok ? result.usage : undefined,
        error: result.ok ? undefined : result.error,
      })
    },
  })
  if (!modelResult.ok) {
    if (modelResult.providerFallbackFailures?.length) {
      recordAiPlayerRuntimeModelFallbackFailuresForOwner(
        runtime.factionId,
        modelResult.providerFallbackFailures,
        runtime.governorPlayerId,
      )
    } else {
      recordAiPlayerRuntimeModelFallbackReasonForOwner(runtime.factionId, modelResult.error, runtime.governorPlayerId)
    }
    recordAiPlayerProviderModelRequestAccounting({
      ok: false,
      aiPlayerId: runtime.aiPlayerId,
      factionId: runtime.factionId,
      governorPlayerId: runtime.governorPlayerId,
      providerFallbackFailures: modelResult.providerFallbackFailures ?? [],
      error: modelResult.error,
    })
    return {
      error: modelResult.error,
      summary: `模型提案失败：${modelResult.error}`,
    }
  }
  if (modelResult.providerFallbackFailures?.length) {
    recordAiPlayerRuntimeModelFallbackFailuresForOwner(
      runtime.factionId,
      modelResult.providerFallbackFailures,
      runtime.governorPlayerId,
    )
  } else {
    clearAiPlayerRuntimeModelFallbackReasonForOwner(runtime.factionId, runtime.governorPlayerId)
  }
  const providerRequestId = recordAiPlayerProviderModelRequestAccounting({
    ok: true,
    aiPlayerId: runtime.aiPlayerId,
    factionId: runtime.factionId,
    governorPlayerId: runtime.governorPlayerId,
    selectedProvider: modelResult.selectedProvider ?? null,
    providerFallbackFailures: modelResult.providerFallbackFailures ?? [],
    usage: modelResult.usage,
    budgetWindowKey: modelResult.budgetWindowKey,
    budgetReservationId: modelResult.budgetReservationId,
  })

  const proposalRequest = pickModelProposalRequest(runtime.aiPlayerId, modelResult.proposalRequests)
  if (!proposalRequest) {
    return {
      error: 'model_proposal_empty',
      summary: modelResult.output.deferReason || '模型没有生成可执行提案。',
    }
  }
  return resolveProposalFromModelRequest(proposalRequest, body, modelResult.output.summary ?? proposalRequest.reason, {
      proposalMode: 'model',
      model: modelResult.model,
      providerRequestId,
      usage: modelResult.usage,
    normalization: modelResult.normalization,
    providerFallback: {
      selectedProvider: modelResult.selectedProvider ?? null,
      failureCount: modelResult.providerFallbackFailures?.length ?? 0,
      failures: modelResult.providerFallbackFailures ?? [],
    },
  })
}

async function resolveChatProposal(
  runtime: GovernedAiPlayerRuntimeDetail,
  body: string,
): Promise<ResolvedChatProposal | { error: string; summary: string } | null> {
  const modelResolved = await resolveModelProposal(runtime, body)
  if (modelResolved) {
    return modelResolved
  }
  return resolveResourceTransferProposal(runtime, body)
}

export function listAiPlayerChatChannel(
  aiPlayerId: string,
  limit = 50,
  readerId?: string,
  filter: AiPlayerChatHistoryFilter = 'all',
  beforeMessageId?: string,
) {
  const runtime = getGovernedAiPlayerRuntime(aiPlayerId)
  if (!runtime) {
    return { error: `ai player not found: ${aiPlayerId}` }
  }

  const bucket = readMessageBucket(aiPlayerId)
  const normalizedLimit = Math.max(1, Math.min(200, Math.floor(limit)))
  const filteredBucket = bucket.filter((message) => messageMatchesHistoryFilter(message, filter))
  const normalizedBeforeMessageId = beforeMessageId?.trim()
  let endIndex = filteredBucket.length
  if (normalizedBeforeMessageId) {
    const matchedIndex = filteredBucket.findIndex((message) => message.messageId === normalizedBeforeMessageId)
    if (matchedIndex < 0) {
      return { error: `chat message not found: ${normalizedBeforeMessageId}` }
    }
    endIndex = matchedIndex
  }
  const startIndex = Math.max(0, endIndex - normalizedLimit)
  const page = filteredBucket.slice(startIndex, endIndex)
  const hasMore = startIndex > 0
  const messages = page.map((message) => cloneValue(message))
  const readCursor = resolveStoredReadCursor(runtime, readerId)
  return {
    channel: buildChannel(runtime, bucket.length),
    messages,
    count: messages.length,
    filter,
    beforeMessageId: normalizedBeforeMessageId || undefined,
    totalCount: filteredBucket.length,
    hasMore,
    nextBeforeMessageId: hasMore && page.length > 0 ? page[0].messageId : undefined,
    historyCounts: buildHistoryCounts(bucket),
    readCursor,
    unreadCount: readCursor?.unreadCount,
  }
}

export function getAiPlayerChatReadCursor(aiPlayerId: string, readerId: string): AiPlayerChatReadCursorResponse {
  const runtime = getGovernedAiPlayerRuntime(aiPlayerId)
  if (!runtime) {
    return { ok: false, error: `ai player not found: ${aiPlayerId}` }
  }
  const normalizedReaderId = readerId.trim()
  if (!normalizedReaderId) {
    return { ok: false, error: 'readerId required' }
  }
  const readCursor = resolveStoredReadCursor(runtime, normalizedReaderId)
  return {
    ok: true,
    channel: buildChannel(runtime, readMessageBucket(aiPlayerId).length),
    readCursor,
  }
}

export function updateAiPlayerChatReadCursor(
  aiPlayerId: string,
  input: UpdateAiPlayerChatReadCursorRequest,
): AiPlayerChatReadCursorResponse {
  const runtime = getGovernedAiPlayerRuntime(aiPlayerId)
  if (!runtime) {
    return { ok: false, error: `ai player not found: ${aiPlayerId}` }
  }
  const readerId = input.readerId.trim()
  if (!readerId) {
    return { ok: false, error: 'readerId required' }
  }

  const bucket = readMessageBucket(aiPlayerId)
  let readMessageCount = input.readMessageCount
  if (readMessageCount === undefined && input.readMessageId) {
    const matchedIndex = bucket.findIndex((message) => message.messageId === input.readMessageId)
    if (matchedIndex < 0) {
      return { ok: false, error: `chat message not found: ${input.readMessageId}` }
    }
    readMessageCount = matchedIndex + 1
  }
  if (readMessageCount === undefined) {
    return { ok: false, error: 'readMessageCount or readMessageId required' }
  }

  const readCursor = buildReadCursor(runtime, readerId, readMessageCount)
  chatReadCursors.set(buildReadCursorKey(aiPlayerId, readerId), cloneValue(readCursor))
  scheduleAiPlayerGovernancePersist()
  return {
    ok: true,
    channel: buildChannel(runtime, bucket.length),
    readCursor,
  }
}

export function triggerAiPlayerChatPatrolTick(
  aiPlayerId: string,
  input: AiPlayerChatPatrolTickRequest = {},
): AiPlayerChatPatrolTickResponse {
  const runtime = getGovernedAiPlayerRuntime(aiPlayerId)
  if (!runtime) {
    return { ok: false, error: `ai player not found: ${aiPlayerId}` }
  }

  const worldBefore = getWorldStateReadonly()
  const triggerMode = normalizePatrolTriggerMode(input)
  const scheduled = triggerMode === 'scheduler'
  const cooldownTicks = normalizePatrolCooldownTicks(input)
  const latestCooldown = readLatestPatrolCooldown(runtime.aiPlayerId)
  const cooldownRemainingTicks = Math.max(0, (latestCooldown?.cooldownUntilTick ?? worldBefore.tick) - worldBefore.tick)
  if (!input.force && cooldownRemainingTicks > 0) {
    return {
      ok: false,
      error: 'patrol_cooldown_active',
      channel: buildChannel(runtime, readMessageBucket(aiPlayerId).length),
      triggerMode,
      scheduled,
      skipped: true,
      cooldownTicks,
      cooldownUntilTick: latestCooldown?.cooldownUntilTick,
      cooldownRemainingTicks,
      tick: worldBefore.tick,
      worldVersionBefore: worldBefore.worldVersion,
      worldVersionAfter: worldBefore.worldVersion,
    }
  }

  const developmentPlan = buildAiPlayerDevelopmentPlan(runtime, {
    targetDevelopmentPoints: normalizePatrolTargetDevelopmentPoints(input),
  })
  const battleReports = buildAiPlayerBattleReportReadModel(runtime, normalizePatrolBattleReportLimit(input))
  const proposalSummary = selectPatrolProposalSummary(developmentPlan)
  const developmentPlanSummary = buildPatrolDevelopmentSummary(developmentPlan)
  const battleReportSummary = buildPatrolBattleReportSummary(battleReports.items[0], battleReports.count)
  const worldAfterRead = getWorldStateReadonly()
  const cooldownUntilTick = worldAfterRead.tick + cooldownTicks
  const message = appendAiPlayerChatMessage({
    aiPlayerId: runtime.aiPlayerId,
    channelId: `ai:${runtime.aiPlayerId}`,
    kind: 'message',
    ...buildAiAuthor(runtime),
    body: buildPatrolMessageBody({
      developmentSummary: developmentPlanSummary,
      battleReportSummary,
      proposalSummary,
    }),
    metadata: {
      source: scheduled ? 'scheduler_patrol_tick' : 'manual_patrol_tick',
      triggeredBy: input.triggeredBy?.trim() || undefined,
      triggerMode,
      scheduled,
      cooldownTicks,
      cooldownUntilTick,
      developmentPlanSummary,
      battleReportSummary,
      proposalSummary,
      worldVersionBefore: worldBefore.worldVersion,
      worldVersionAfterRead: worldAfterRead.worldVersion,
    },
  })
  const worldAfter = getWorldStateReadonly()

  return {
    ok: true,
    channel: buildChannel(runtime, readMessageBucket(aiPlayerId).length),
    message,
    triggerMode,
    scheduled,
    skipped: false,
    proposalSummary,
    developmentPlanSummary,
    battleReportSummary,
    cooldownTicks,
    cooldownUntilTick,
    cooldownRemainingTicks: 0,
    tick: worldAfter.tick,
    worldVersionBefore: worldBefore.worldVersion,
    worldVersionAfter: worldAfter.worldVersion,
  }
}

function listPatrolSchedulerTargets(input: AiPlayerChatPatrolSchedulerRunRequest) {
  const requestedIds = new Set((input.aiPlayerIds ?? []).map((id) => id.trim()).filter(Boolean))
  const shard = normalizePatrolSchedulerShard(input)
  const players = listGovernedAiPlayers({
    governorPlayerId: input.governorPlayerId?.trim() || undefined,
    factionId: input.factionId?.trim() || undefined,
    includeDisabled: false,
  })
    .filter((runtime) => requestedIds.size === 0 || requestedIds.has(runtime.aiPlayerId))
    .filter((_, index) => index % shard.shardCount === shard.shardIndex)
    .slice(0, normalizePatrolSchedulerLimit(input))
  return { players, shard }
}

function toPatrolSchedulerRunItem(aiPlayerId: string, result: AiPlayerChatPatrolTickResponse): AiPlayerChatPatrolSchedulerRunItem {
  return {
    aiPlayerId,
    ok: result.ok,
    skipped: result.skipped,
    error: result.error,
    messageId: result.message?.messageId,
    cooldownUntilTick: result.cooldownUntilTick,
    cooldownRemainingTicks: result.cooldownRemainingTicks,
    tick: result.tick,
  }
}

function toPatrolSchedulerBudgetSkipItem(
  aiPlayerId: string,
  error: 'provider_budget_disabled' | 'provider_budget_exhausted',
  providerBudgetTier: AiPlayerChatPatrolSchedulerRunRequest['providerBudgetTier'],
): AiPlayerChatPatrolSchedulerRunItem {
  return {
    aiPlayerId,
    ok: false,
    skipped: true,
    error,
    providerBudgetTier,
  }
}

export function runAiPlayerChatPatrolScheduler(
  input: AiPlayerChatPatrolSchedulerRunRequest = {},
): AiPlayerChatPatrolSchedulerRunResponse {
  const queue = buildPatrolSchedulerQueueSummary(input, false)
  const cachedResponse = readPatrolSchedulerIdempotentResponse(queue)
  if (cachedResponse) {
    return cachedResponse
  }

  const worldBefore = getWorldStateReadonly()
  const { players: targets, shard } = listPatrolSchedulerTargets(input)
  const items: AiPlayerChatPatrolSchedulerRunItem[] = []
  const providerBudgetTier = input.providerBudgetTier ?? 'economy_chat'
  const maxProviderRuns = input.providerBudgetTier === 'disabled'
    ? 0
    : input.providerBudgetMaxRuns === undefined
      ? null
      : Math.max(0, Math.min(50, Math.trunc(Number(input.providerBudgetMaxRuns))))
  let consumedProviderRuns = 0
  for (const target of targets) {
    if (providerBudgetTier === 'disabled') {
      items.push(toPatrolSchedulerBudgetSkipItem(target.aiPlayerId, 'provider_budget_disabled', providerBudgetTier))
      continue
    }
    if (maxProviderRuns !== null && consumedProviderRuns >= maxProviderRuns) {
      items.push(toPatrolSchedulerBudgetSkipItem(target.aiPlayerId, 'provider_budget_exhausted', providerBudgetTier))
      continue
    }
    consumedProviderRuns += 1
    const result = triggerAiPlayerChatPatrolTick(target.aiPlayerId, {
      triggeredBy: input.triggeredBy?.trim() || 'ai_patrol_scheduler',
      triggerMode: 'scheduler',
      goalPower: input.goalPower,
      targetDevelopmentPoints: input.targetDevelopmentPoints,
      battleReportLimit: input.battleReportLimit,
      cooldownTicks: input.cooldownTicks,
      force: input.force,
    })
    items.push(toPatrolSchedulerRunItem(target.aiPlayerId, result))
  }

  const worldAfter = getWorldStateReadonly()
  const writtenCount = items.filter((item) => item.ok && !item.skipped && item.messageId).length
  const skippedCount = items.filter((item) => item.skipped || item.error === 'patrol_cooldown_active').length
  const budgetSkipCodes = new Set(['provider_budget_disabled', 'provider_budget_exhausted'])
  const failedCount = items.filter((item) => !item.ok
    && item.error !== 'patrol_cooldown_active'
    && !budgetSkipCodes.has(item.error ?? '')).length
  const providerBudgetSkippedCount = items.filter((item) => budgetSkipCodes.has(item.error ?? '')).length
  const response: AiPlayerChatPatrolSchedulerRunResponse = {
    ok: failedCount === 0,
    triggerMode: 'scheduler',
    scheduled: true,
    attemptedCount: items.length,
    writtenCount,
    skippedCount,
    failedCount,
    shard: {
      ...shard,
      selectedCount: targets.length,
    },
    providerBudget: {
      budgetTier: providerBudgetTier,
      maxRuns: maxProviderRuns,
      consumedRuns: consumedProviderRuns,
      remainingRuns: maxProviderRuns === null ? null : Math.max(0, maxProviderRuns - consumedProviderRuns),
      skippedCount: providerBudgetSkippedCount,
    },
    queue,
    items,
    tick: worldAfter.tick,
    worldVersionBefore: worldBefore.worldVersion,
    worldVersionAfter: worldAfter.worldVersion,
    error: failedCount > 0 ? 'patrol_scheduler_partial_failure' : undefined,
  }
  cachePatrolSchedulerIdempotentResponse(queue.idempotencyKey, response)
  return response
}

export function startAiPlayerChatPatrolScheduler(options: AiPlayerChatPatrolSchedulerOptions = {}): boolean {
  if (patrolSchedulerTimer) {
    return false
  }
  const intervalMs = Math.max(5_000, Math.min(3_600_000, Math.trunc(Number(options.intervalMs ?? 60_000))))
  patrolSchedulerTimer = setInterval(() => {
    try {
      runAiPlayerChatPatrolScheduler(options)
    } catch (error) {
      console.warn('[ai-chat-patrol-scheduler] run failed:', error instanceof Error ? error.message : error)
    }
  }, intervalMs)
  patrolSchedulerTimer.unref?.()
  return true
}

export function stopAiPlayerChatPatrolScheduler(): boolean {
  if (!patrolSchedulerTimer) {
    return false
  }
  clearInterval(patrolSchedulerTimer)
  patrolSchedulerTimer = null
  return true
}

export async function submitAiPlayerChatMessage(
  aiPlayerId: string,
  input: SendAiPlayerChatMessageRequest,
): Promise<SendAiPlayerChatMessageResponse> {
  const runtime = getGovernedAiPlayerRuntime(aiPlayerId)
  if (!runtime) {
    return { ok: false, error: `ai player not found: ${aiPlayerId}` }
  }

  const channelId = `ai:${runtime.aiPlayerId}`
  const senderId = input.senderId?.trim() || runtime.governorPlayerId
  const senderName = input.senderName?.trim() || '总督'
  const message = appendAiPlayerChatMessage({
    aiPlayerId: runtime.aiPlayerId,
    channelId,
    kind: 'message',
    authorType: 'governor',
    authorId: senderId,
    authorName: senderName,
    body: input.body,
  })

  if (input.createProposal === false) {
    const aiMessage = appendAiPlayerChatMessage({
      aiPlayerId: runtime.aiPlayerId,
      channelId,
      kind: 'message',
      authorType: 'ai',
      authorId: runtime.aiPlayerId,
      authorName: runtime.displayName,
      body: '收到，我会把这条命令记录到当前 AI 频道。',
    })
    return {
      ok: true,
      channel: buildChannel(runtime, readMessageBucket(aiPlayerId).length),
      message,
      aiMessage,
    }
  }

  const resolved = await resolveChatProposal(runtime, input.body)
  if (!resolved) {
    const aiMessage = appendAiPlayerChatMessage({
      aiPlayerId: runtime.aiPlayerId,
      channelId,
      kind: 'message',
      authorType: 'ai',
      authorId: runtime.aiPlayerId,
      authorName: runtime.displayName,
      body: '收到。我已记录目标，但这句话暂未命中可执行提案模板。',
    })
    return {
      ok: true,
      channel: buildChannel(runtime, readMessageBucket(aiPlayerId).length),
      message,
      aiMessage,
    }
  }

  if ('error' in resolved) {
    const aiMessage = appendAiPlayerChatMessage({
      aiPlayerId: runtime.aiPlayerId,
      channelId,
      kind: 'system',
      authorType: 'system',
      authorId: AI_SYSTEM_AUTHOR_ID,
      authorName: '系统',
      body: resolved.summary,
      metadata: {
        failureCode: resolved.error,
      },
    })
    return {
      ok: true,
      channel: buildChannel(runtime, readMessageBucket(aiPlayerId).length),
      message,
      aiMessage,
    }
  }

  const created = createAiPlayerActionProposal({
    aiPlayerId: runtime.aiPlayerId,
    action: resolved.action,
    args: resolved.args,
    reason: resolved.reason,
    source: resolved.source,
  })
  if (created.error || !created.proposal) {
    const aiMessage = appendAiPlayerChatMessage({
      aiPlayerId: runtime.aiPlayerId,
      channelId,
      kind: 'system',
      authorType: 'system',
      authorId: AI_SYSTEM_AUTHOR_ID,
      authorName: '系统',
      body: `提案生成失败：${created.error ?? 'proposal_create_failed'}`,
      metadata: {
        failureCode: created.error ?? 'proposal_create_failed',
      },
    })
    return {
      ok: false,
      channel: buildChannel(runtime, readMessageBucket(aiPlayerId).length),
      message,
      aiMessage,
      error: created.error ?? 'proposal_create_failed',
    }
  }

  const proposal: AiPlayerActionProposal = created.proposal
  const proposalMessage = appendAiPlayerChatMessage({
    aiPlayerId: runtime.aiPlayerId,
    channelId,
    kind: 'proposal',
    authorType: 'ai',
    authorId: runtime.aiPlayerId,
    authorName: runtime.displayName,
    body: resolved.summary,
    proposalId: proposal.proposalId,
    action: proposal.action,
    metadata: {
      status: proposal.status,
      requiresApproval: proposal.requiresApproval,
      resources: proposal.args && typeof proposal.args === 'object' ? (proposal.args as Record<string, unknown>).resources : undefined,
      ...resolved.metadata,
      recoveryHint: proposal.recoveryHint,
    },
  })
  const aggregateMessage = recordBattleReportFollowupAggregateIfReady(proposal)

  return {
    ok: true,
    channel: buildChannel(runtime, readMessageBucket(aiPlayerId).length),
    message,
    proposalMessage,
    aggregateMessage: aggregateMessage ?? undefined,
    proposal,
  }
}

export function recordAiPlayerProposalInChat(proposal: AiPlayerActionProposal): {
  proposalMessage: AiPlayerChatMessage | null
  aggregateMessage: AiPlayerChatMessage | null
} {
  const runtime = getGovernedAiPlayerRuntime(proposal.aiPlayerId)
  if (!runtime) {
    return {
      proposalMessage: null,
      aggregateMessage: null,
    }
  }

  const statusLabel = proposal.status === 'pending_approval' ? '待批准' : proposal.status
  const proposalMessage = appendAiPlayerChatMessage({
    aiPlayerId: runtime.aiPlayerId,
    channelId: `ai:${runtime.aiPlayerId}`,
    kind: 'proposal',
    authorType: 'ai',
    authorId: runtime.aiPlayerId,
    authorName: runtime.displayName,
    body: `已生成提案：${formatAiActionForPlayer(proposal.action)}（${statusLabel}）。${proposal.reason}`,
    proposalId: proposal.proposalId,
    action: proposal.action,
    metadata: {
      status: proposal.status,
      requiresApproval: proposal.requiresApproval,
      source: proposal.source,
      riskLevel: proposal.riskLevel,
      recoveryHint: proposal.recoveryHint,
    },
  })

  return {
    proposalMessage,
    aggregateMessage: recordBattleReportFollowupAggregateIfReady(proposal),
  }
}

export function recordAiPlayerReceiptInChat(receipt: AiPlayerActionReceipt): AiPlayerChatMessage | null {
  const runtime = getGovernedAiPlayerRuntime(receipt.aiPlayerId)
  if (!runtime) {
    return null
  }

  const status = receipt.ok ? '执行成功' : '执行失败'
  const failure = receipt.failureCode ? `，失败原因：${formatFailureCodeForPlayer(receipt.failureCode)}` : ''
  const actionLabel = formatWorldActionForPlayer(receipt.worldAction, receipt.action)
  const receiptMessage = appendAiPlayerChatMessage({
    aiPlayerId: runtime.aiPlayerId,
    channelId: `ai:${runtime.aiPlayerId}`,
    kind: 'receipt',
    ...buildAiAuthor(runtime),
    body: `${status}：${actionLabel}${failure}`,
    receiptProposalId: receipt.proposalId,
    action: receipt.action,
    receiptOk: receipt.ok,
    failureCode: receipt.failureCode,
    metadata: {
      worldAction: receipt.worldAction,
      worldActionPayload: receipt.worldActionPayload,
      actionRequestId: receipt.actionRequestId,
      recoveryHint: receipt.recoveryHint,
    },
  })
  recordMarchMoveExecutedAggregateIfReady(receipt)
  return receiptMessage
}

export function recordAiPlayerProposalFailureInChat(input: {
  proposal: AiPlayerActionProposal
  failureCode: string
  error: string
  recoveryHint?: AiPlayerRecoveryHint
}): AiPlayerChatMessage | null {
  const runtime = getGovernedAiPlayerRuntime(input.proposal.aiPlayerId)
  if (!runtime) {
    return null
  }

  return appendAiPlayerChatMessage({
    aiPlayerId: runtime.aiPlayerId,
    channelId: `ai:${runtime.aiPlayerId}`,
    kind: 'receipt',
    ...buildAiAuthor(runtime),
    body: `执行失败：${formatAiActionForPlayer(input.proposal.action)}，失败原因：${formatFailureCodeForPlayer(input.failureCode)}`,
    receiptProposalId: input.proposal.proposalId,
    action: input.proposal.action,
    receiptOk: false,
    failureCode: input.failureCode,
    metadata: {
      error: input.error,
      status: input.proposal.status,
      proposalArgs: input.proposal.args,
      recoveryHint: input.recoveryHint,
    },
  })
}

export function recordUnifiedInboxClaimInChat(input: {
  aiPlayerId: string
  item: UnifiedInboxItem
  ok: boolean
  worldAction: UnifiedInboxClaimAction
  result?: unknown
  error?: string
}): AiPlayerChatMessage | null {
  const runtime = getGovernedAiPlayerRuntime(input.aiPlayerId)
  if (!runtime) {
    return null
  }

  const action: AiPlayerActionType = input.item.kind === 'ai_resource_transfer'
    ? 'resource_transfer_to_governor'
    : 'reward_claim'
  const failureCode = input.ok ? '' : readFailureCodeFromUnknown(input.result, input.error)
  const title = input.item.title.trim() || '通用收件箱'
  const body = input.ok
    ? `已领取：${title}，${formatInboxItemPayloadForPlayer(input.item)}。`
    : `领取失败：${title}，失败原因：${formatFailureCodeForPlayer(failureCode)}。`

  return appendAiPlayerChatMessage({
    aiPlayerId: runtime.aiPlayerId,
    channelId: `ai:${runtime.aiPlayerId}`,
    kind: 'receipt',
    ...buildAiAuthor(runtime),
    body,
    action,
    receiptOk: input.ok,
    failureCode: failureCode || null,
    metadata: {
      itemId: input.item.itemId,
      inboxKind: input.item.kind,
      worldAction: input.worldAction,
      resources: input.item.resources,
      reward: input.item.reward,
      result: input.result,
    },
  })
}
