import type {
  AiPlayerActionReceipt,
  AiPlayerAdvanceTickPhaseSummary,
  AiPlayerAdvanceTickSubphaseSummary,
  AiPlayerProposalStats,
  AiPlayerResourceTransferRuntime,
  AiPlayerRuntimeObservabilitySummary,
  GovernedAiPlayer,
  GovernedAiPlayerRuntime,
  GovernedAiPlayerRuntimeDetail,
} from '../../../../shared/contracts/aiPlayer'
import { DEFAULT_AI_RESOURCE_TRANSFER_POLICY, resolveAiResourceTransferPolicy } from '../../../../shared/domain/rules'
import { getFactionSessionSnapshot, resolveSessionControlMode } from '../../multiplayer/SessionManager'
import {
  getAiRuntimeObservabilitySnapshot,
  getWorldStateReadonly,
} from '../world/WorldService'
import { getAiPlayerGovernancePersistHealth } from './aiPlayerGovernancePersist'
import {
  actionProposals,
  actionReceiptsByAiPlayer,
  AI_RUNTIME_EVENT_LIMIT,
  cloneValue,
  sortByUpdatedDesc,
} from './aiPlayerGovernanceState'
import { resolveAiPlayerRuntimeModelStatus } from './aiPlayerRuntimeModelTarget'

function getBudgetSnapshot(factionId: string) {
  const world = getWorldStateReadonly()
  const faction = world.factions[factionId]
  return {
    actionPointsRemaining: faction?.actionPoints ?? 0,
    foodRemaining: faction?.food ?? 0,
    aiQuota: faction?.aiQuota ? cloneValue(faction.aiQuota) : null,
  }
}

function getResourceTransferRuntime(player: GovernedAiPlayer): AiPlayerResourceTransferRuntime {
  const world = getWorldStateReadonly()
  const faction = world.factions[player.factionId]
  if (!faction) {
    return {
      configuredPolicy: null,
      effectivePolicy: cloneValue(DEFAULT_AI_RESOURCE_TRANSFER_POLICY),
      quota: null,
      remainingQuotaTotal: DEFAULT_AI_RESOURCE_TRANSFER_POLICY.dailyQuotaTotal,
      cooldownRemainingTicks: 0,
      windowRemainingTicks: 0,
      canTransferNow: true,
      blockedBy: null,
    }
  }

  const effectivePolicy = resolveAiResourceTransferPolicy(faction)
  const quota = faction.aiResourceTransferQuotaByAiPlayer?.[player.aiPlayerId] ?? null
  const remainingQuotaTotal = Math.max(0, (quota?.dailyQuotaTotal ?? effectivePolicy.dailyQuotaTotal) - (quota?.transferredTotal ?? 0))
  const cooldownRemainingTicks = Math.max(0, (quota?.cooldownUntilTick ?? world.tick) - world.tick)
  const windowRemainingTicks = Math.max(0, (quota?.windowEndsTick ?? world.tick) - world.tick)
  const blockedBy =
    cooldownRemainingTicks > 0
      ? 'transfer_cooldown_active'
      : remainingQuotaTotal <= 0
        ? 'daily_quota_exceeded'
        : null

  return {
    configuredPolicy: faction.aiResourceTransferPolicy ? cloneValue(faction.aiResourceTransferPolicy) : null,
    effectivePolicy: cloneValue(effectivePolicy),
    quota: quota ? cloneValue(quota) : null,
    remainingQuotaTotal,
    cooldownRemainingTicks,
    windowRemainingTicks,
    canTransferNow: blockedBy === null,
    blockedBy,
  }
}

function getProposalStats(aiPlayerId: string): AiPlayerProposalStats {
  const proposals = Array.from(actionProposals.values()).filter((proposal) => proposal.aiPlayerId === aiPlayerId)
  return {
    pendingApprovalCount: proposals.filter((proposal) => proposal.status === 'pending_approval').length,
    approvedCount: proposals.filter((proposal) => proposal.status === 'approved').length,
    rejectedCount: proposals.filter((proposal) => proposal.status === 'rejected').length,
    executedCount: proposals.filter((proposal) => proposal.status === 'executed').length,
    failedCount: proposals.filter((proposal) => proposal.status === 'failed').length,
  }
}

function getLatestProposalId(aiPlayerId: string): string | undefined {
  const latest = sortByUpdatedDesc(
    Array.from(actionProposals.values()).filter((proposal) => proposal.aiPlayerId === aiPlayerId),
  )[0]
  return latest?.proposalId
}

function getLatestReceipt(aiPlayerId: string): AiPlayerActionReceipt | undefined {
  const receipts = actionReceiptsByAiPlayer.get(aiPlayerId) ?? []
  return receipts.length > 0 ? cloneValue(receipts[receipts.length - 1]) : undefined
}

function getRuntimeModelSnapshot(player: GovernedAiPlayer) {
  const modelStatus = resolveAiPlayerRuntimeModelStatus({
    factionId: player.factionId,
    ownerPlayerId: player.governorPlayerId,
    allowLlmProposals: player.runtimePolicy.allowLlmProposals,
  })
  return {
    modelName: modelStatus.activeModel,
    modelSource: modelStatus.source === 'default' ? 'default' as const : 'env' as const,
    modelStatus,
  }
}

function pickTopAdvanceTickPhasesByLast(
  phaseStats: Record<string, { lastDurationMs: number }>,
  limit = 5,
): AiPlayerAdvanceTickPhaseSummary[] {
  return Object.entries(phaseStats)
    .map(([phase, stats]) => ({
      phase,
      durationMs: Number.isFinite(stats.lastDurationMs) ? stats.lastDurationMs : 0,
    }))
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, limit)
}

function pickTopAdvanceTickSubphasesByLast(
  phaseStats: Record<string, { subphaseStats?: Record<string, { lastDurationMs: number }> }>,
  limit = 8,
): AiPlayerAdvanceTickSubphaseSummary[] {
  const items: AiPlayerAdvanceTickSubphaseSummary[] = []
  for (const [phase, stats] of Object.entries(phaseStats)) {
    const subphaseStats = stats.subphaseStats ?? {}
    for (const [subphase, entry] of Object.entries(subphaseStats)) {
      items.push({
        phase,
        subphase,
        durationMs: Number.isFinite(entry.lastDurationMs) ? entry.lastDurationMs : 0,
      })
    }
  }

  return items.sort((left, right) => right.durationMs - left.durationMs).slice(0, limit)
}

function buildRuntimeObservabilitySummary(player: GovernedAiPlayer): AiPlayerRuntimeObservabilitySummary {
  const snapshot = getAiRuntimeObservabilitySnapshot({
    factionId: player.factionId,
    eventLimit: AI_RUNTIME_EVENT_LIMIT,
  })
  const factionRuntime = snapshot.factions.find((item) => item.factionId === player.factionId)
  return {
    generatedAt: snapshot.generatedAt,
    factionId: player.factionId,
    lock: cloneValue(snapshot.runtime.lock),
    lastFailure: factionRuntime?.lastFailure ? cloneValue(factionRuntime.lastFailure) : undefined,
    recentFailures: cloneValue(snapshot.runtime.recentFailures),
    recentLockConflicts: cloneValue(snapshot.runtime.lockConflicts),
    topAdvanceTickPhasesByLast: pickTopAdvanceTickPhasesByLast(snapshot.runtime.advanceTickPerformance.phaseStats),
    topAdvanceTickSubphasesByLast: pickTopAdvanceTickSubphasesByLast(snapshot.runtime.advanceTickPerformance.phaseStats),
    recentEventActions: snapshot.recentEvents.slice(0, AI_RUNTIME_EVENT_LIMIT).map((event) => event.action),
  }
}

export function buildAiPlayerRuntime(player: GovernedAiPlayer): GovernedAiPlayerRuntime {
  const session = getFactionSessionSnapshot(player.factionId)
  const autonomyLevel = session.autonomyLevel
  const controlMode = resolveSessionControlMode(autonomyLevel)
  const model = getRuntimeModelSnapshot(player)
  return {
    ...cloneValue(player),
    ...model,
    autonomyLevel,
    controlMode,
    online: session.online,
    seatCount: session.seatCount ?? 0,
    onlineSeatCount: session.onlineSeatCount ?? 0,
    playerNames: session.playerNames.slice(),
    governorOnline: session.playerNames.includes(player.governorPlayerId),
    budget: getBudgetSnapshot(player.factionId),
    resourceTransfer: getResourceTransferRuntime(player),
    proposalStats: getProposalStats(player.aiPlayerId),
    latestProposalId: getLatestProposalId(player.aiPlayerId),
    latestReceipt: getLatestReceipt(player.aiPlayerId),
  }
}

export function buildAiPlayerRuntimeDetail(player: GovernedAiPlayer): GovernedAiPlayerRuntimeDetail {
  return {
    ...buildAiPlayerRuntime(player),
    persistence: getAiPlayerGovernancePersistHealth(),
    observability: buildRuntimeObservabilitySummary(player),
  }
}
