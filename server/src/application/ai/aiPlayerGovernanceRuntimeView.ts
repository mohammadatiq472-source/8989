import type {
  AiPlayerActionReceipt,
  AiPlayerAdvanceTickPhaseSummary,
  AiPlayerAdvanceTickSubphaseSummary,
  AiPlayerProposalStats,
  AiPlayerRuntimeObservabilitySummary,
  GovernedAiPlayer,
  GovernedAiPlayerRuntime,
  GovernedAiPlayerRuntimeDetail,
} from '../../../../shared/contracts/aiPlayer'
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

function getBudgetSnapshot(factionId: string) {
  const world = getWorldStateReadonly()
  const faction = world.factions[factionId]
  return {
    actionPointsRemaining: faction?.actionPoints ?? 0,
    foodRemaining: faction?.food ?? 0,
    aiQuota: faction?.aiQuota ? cloneValue(faction.aiQuota) : null,
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
  return {
    ...cloneValue(player),
    autonomyLevel,
    controlMode,
    online: session.online,
    seatCount: session.seatCount ?? 0,
    onlineSeatCount: session.onlineSeatCount ?? 0,
    playerNames: session.playerNames.slice(),
    governorOnline: session.playerNames.includes(player.governorPlayerId),
    budget: getBudgetSnapshot(player.factionId),
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
