import { randomUUID } from 'node:crypto'
import type {
  AiPlayerActionCatalogEntry,
  AiPlayerActionProposal,
  AiPlayerActionProposalRequest,
  AiPlayerActionReceipt,
  AiPlayerActionType,
  ApproveAiPlayerProposalRequest,
  ExecuteAiPlayerProposalRequest,
  GovernedAiPlayer,
  RejectAiPlayerProposalRequest,
} from '../../../../shared/contracts/aiPlayer'
import { aiPlayerActionProposalRequestSchema } from '../../../../shared/schemas/aiPlayer'
import { AI_PLAYER_ACTION_CATALOG } from './aiPlayerActionCatalog'
import { recordAiPlayerGovernanceEvent } from './aiPlayerGovernanceEvents'
import {
  ensureAiPlayerGovernanceLoaded,
  scheduleAiPlayerGovernancePersist,
  storeAiPlayerActionReceipt,
} from './aiPlayerGovernancePersist'
import {
  actionReceiptsByAiPlayer,
  actionProposals,
  cloneValue,
  governedAiPlayers,
  nowIso,
  sortByUpdatedDesc,
} from './aiPlayerGovernanceState'
import { cloneProposalArgs, executeSupportedAiPlayerProposal } from './aiPlayerProposalExecution'

function getCatalogEntry(action: AiPlayerActionType): AiPlayerActionCatalogEntry | undefined {
  return AI_PLAYER_ACTION_CATALOG.find((entry) => entry.action === action)
}

function computeRequiresApproval(entry: AiPlayerActionCatalogEntry, player: GovernedAiPlayer): boolean {
  if (entry.requiresApprovalByDefault) {
    return true
  }

  if (entry.riskLevel === 'low') {
    return !player.approvalPolicy.autoApproveLowRisk
  }
  if (entry.riskLevel === 'medium') {
    return !player.approvalPolicy.autoApproveMediumRisk
  }
  return player.approvalPolicy.requireHumanApprovalForHighRisk
}

function getPendingProposalCount(aiPlayerId: string): number {
  return Array.from(actionProposals.values()).filter(
    (proposal) => proposal.aiPlayerId === aiPlayerId && proposal.status === 'pending_approval',
  ).length
}

async function executeSupportedProposal(
  proposal: AiPlayerActionProposal,
  executedBy: string,
  includeWorld: boolean,
): Promise<{ proposal: AiPlayerActionProposal; receipt: AiPlayerActionReceipt } | { error: string }> {
  const execution = await executeSupportedAiPlayerProposal(proposal, includeWorld)
  if ('error' in execution) {
    return execution
  }

  const { worldAction, worldActionPayload, response } = execution
  const observedAt = nowIso()
  const receipt: AiPlayerActionReceipt = {
    proposalId: proposal.proposalId,
    aiPlayerId: proposal.aiPlayerId,
    governorPlayerId: proposal.governorPlayerId,
    factionId: proposal.factionId,
    action: proposal.action,
    worldAction,
    worldActionPayload,
    actionRequestId: response.requestId ?? null,
    ok: response.ok,
    failureCode: response.failureCode ?? null,
    message: response.message,
    execution: response.execution ?? null,
    observedAt,
  }

  const updatedProposal: AiPlayerActionProposal = {
    ...proposal,
    status: response.ok ? 'executed' : 'failed',
    executedAt: observedAt,
    executedBy,
    updatedAt: observedAt,
    worldAction: worldAction ?? undefined,
    worldActionPayload,
  }

  actionProposals.set(updatedProposal.proposalId, updatedProposal)
  scheduleAiPlayerGovernancePersist()
  storeAiPlayerActionReceipt(receipt)
  recordAiPlayerGovernanceEvent({
    action: 'ai_player_execute_proposal',
    success: response.ok,
    message: response.ok
      ? `executed ai player proposal ${proposal.proposalId}`
      : `failed ai player proposal ${proposal.proposalId}`,
    metadata: {
      aiPlayerId: proposal.aiPlayerId,
      governorPlayerId: proposal.governorPlayerId,
      factionId: proposal.factionId,
      proposalId: proposal.proposalId,
      proposalAction: proposal.action,
      worldAction,
      failureCode: response.failureCode ?? null,
    },
  })
  return {
    proposal: cloneValue(updatedProposal),
    receipt: cloneValue(receipt),
  }
}

export function createAiPlayerActionProposal(
  input: AiPlayerActionProposalRequest,
): { proposal?: AiPlayerActionProposal; error?: string } {
  ensureAiPlayerGovernanceLoaded()
  const parsedInputResult = aiPlayerActionProposalRequestSchema.safeParse(input)
  if (!parsedInputResult.success) {
    return {
      error: parsedInputResult.error.issues
        .map((issue) => `${issue.path.join('.') || 'proposal'}: ${issue.message}`)
        .join('; '),
    }
  }

  const parsedInput = cloneValue(parsedInputResult.data)
  const player = governedAiPlayers.get(parsedInput.aiPlayerId)
  if (!player) {
    return { error: `ai player not found: ${parsedInput.aiPlayerId}` }
  }
  if (!player.enabled) {
    return { error: `ai player disabled: ${parsedInput.aiPlayerId}` }
  }
  if (player.paused) {
    return { error: `ai player paused: ${parsedInput.aiPlayerId}` }
  }
  if (parsedInput.source === 'llm' && !player.runtimePolicy.allowLlmProposals) {
    return { error: `llm proposals disabled for ${parsedInput.aiPlayerId}` }
  }
  if (parsedInput.source === 'rule' && !player.runtimePolicy.allowRuleProposals) {
    return { error: `rule proposals disabled for ${parsedInput.aiPlayerId}` }
  }
  if (!player.actionWhitelist.includes(parsedInput.action)) {
    return { error: `action '${parsedInput.action}' not whitelisted for ${parsedInput.aiPlayerId}` }
  }
  if (getPendingProposalCount(player.aiPlayerId) >= player.budgetPolicy.maxPendingProposals) {
    return { error: `pending proposal budget reached for ${parsedInput.aiPlayerId}` }
  }

  const catalogEntry = getCatalogEntry(parsedInput.action)
  if (!catalogEntry) {
    return { error: `unknown ai player action: ${parsedInput.action}` }
  }
  if (catalogEntry.riskLevel === 'high' && !player.budgetPolicy.allowHighRiskActions) {
    return { error: `high-risk actions disabled for ${parsedInput.aiPlayerId}` }
  }

  const createdAt = nowIso()
  const proposal: AiPlayerActionProposal = {
    proposalId: randomUUID(),
    aiPlayerId: player.aiPlayerId,
    governorPlayerId: player.governorPlayerId,
    factionId: player.factionId,
    action: parsedInput.action,
    args: cloneProposalArgs(parsedInput.args ?? {}),
    reason: parsedInput.reason,
    riskLevel: catalogEntry.riskLevel,
    source: parsedInput.source,
    status: computeRequiresApproval(catalogEntry, player) ? 'pending_approval' : 'approved',
    requiresApproval: computeRequiresApproval(catalogEntry, player),
    executableInV1: catalogEntry.executableInV1,
    createdAt,
    updatedAt: createdAt,
  }

  actionProposals.set(proposal.proposalId, proposal)
  scheduleAiPlayerGovernancePersist()
  recordAiPlayerGovernanceEvent({
    action: 'ai_player_propose_action',
    success: true,
    message: `created ai player proposal ${proposal.proposalId}`,
    metadata: {
      aiPlayerId: player.aiPlayerId,
      governorPlayerId: player.governorPlayerId,
      factionId: player.factionId,
      proposalId: proposal.proposalId,
      proposalAction: proposal.action,
      source: proposal.source,
      status: proposal.status,
    },
  })
  return { proposal: cloneValue(proposal) }
}

export function listAiPlayerActionProposals(params: {
  aiPlayerId?: string
  status?: AiPlayerActionProposal['status']
  limit?: number
} = {}): AiPlayerActionProposal[] {
  ensureAiPlayerGovernanceLoaded()
  const limit = typeof params.limit === 'number' ? Math.max(1, Math.min(200, Math.trunc(params.limit))) : 50
  return sortByUpdatedDesc(
    Array.from(actionProposals.values()).filter((proposal) => {
      if (params.aiPlayerId && proposal.aiPlayerId !== params.aiPlayerId) {
        return false
      }
      if (params.status && proposal.status !== params.status) {
        return false
      }
      return true
    }),
  )
    .slice(0, limit)
    .map((proposal) => cloneValue(proposal))
}

export function getAiPlayerActionProposal(proposalId: string): AiPlayerActionProposal | null {
  ensureAiPlayerGovernanceLoaded()
  const proposal = actionProposals.get(proposalId)
  return proposal ? cloneValue(proposal) : null
}

export function approveAiPlayerActionProposal(
  proposalId: string,
  input: ApproveAiPlayerProposalRequest,
): { proposal?: AiPlayerActionProposal; error?: string } {
  ensureAiPlayerGovernanceLoaded()
  const proposal = actionProposals.get(proposalId)
  if (!proposal) {
    return { error: `proposal not found: ${proposalId}` }
  }
  if (proposal.status !== 'pending_approval') {
    return { error: `proposal ${proposalId} is not pending approval` }
  }

  const updatedAt = nowIso()
  const updatedProposal: AiPlayerActionProposal = {
    ...proposal,
    status: 'approved',
    approvedAt: updatedAt,
    approvedBy: input.approvedBy,
    updatedAt,
  }
  actionProposals.set(proposalId, updatedProposal)
  scheduleAiPlayerGovernancePersist()
  recordAiPlayerGovernanceEvent({
    action: 'ai_player_approve_proposal',
    success: true,
    message: `approved ai player proposal ${proposalId}`,
    metadata: {
      aiPlayerId: updatedProposal.aiPlayerId,
      governorPlayerId: updatedProposal.governorPlayerId,
      factionId: updatedProposal.factionId,
      proposalId,
      approvedBy: input.approvedBy,
      proposalAction: updatedProposal.action,
    },
  })
  return { proposal: cloneValue(updatedProposal) }
}

export function rejectAiPlayerActionProposal(
  proposalId: string,
  input: RejectAiPlayerProposalRequest,
): { proposal?: AiPlayerActionProposal; error?: string } {
  ensureAiPlayerGovernanceLoaded()
  const proposal = actionProposals.get(proposalId)
  if (!proposal) {
    return { error: `proposal not found: ${proposalId}` }
  }
  if (proposal.status !== 'pending_approval' && proposal.status !== 'approved') {
    return { error: `proposal ${proposalId} cannot be rejected from status ${proposal.status}` }
  }

  const updatedAt = nowIso()
  const updatedProposal: AiPlayerActionProposal = {
    ...proposal,
    status: 'rejected',
    rejectedAt: updatedAt,
    rejectedBy: input.rejectedBy,
    rejectionReason: input.rejectionReason,
    updatedAt,
  }
  actionProposals.set(proposalId, updatedProposal)
  scheduleAiPlayerGovernancePersist()
  recordAiPlayerGovernanceEvent({
    action: 'ai_player_reject_proposal',
    success: true,
    message: `rejected ai player proposal ${proposalId}`,
    metadata: {
      aiPlayerId: updatedProposal.aiPlayerId,
      governorPlayerId: updatedProposal.governorPlayerId,
      factionId: updatedProposal.factionId,
      proposalId,
      rejectedBy: input.rejectedBy,
      proposalAction: updatedProposal.action,
    },
  })
  return { proposal: cloneValue(updatedProposal) }
}

export async function executeAiPlayerActionProposal(
  proposalId: string,
  input: ExecuteAiPlayerProposalRequest,
): Promise<{ proposal?: AiPlayerActionProposal; receipt?: AiPlayerActionReceipt; error?: string }> {
  ensureAiPlayerGovernanceLoaded()
  const proposal = actionProposals.get(proposalId)
  if (!proposal) {
    return { error: `proposal not found: ${proposalId}` }
  }
  if (proposal.status !== 'approved') {
    return { error: `proposal ${proposalId} is not approved` }
  }

  const player = governedAiPlayers.get(proposal.aiPlayerId)
  if (!player) {
    return { error: `ai player not found: ${proposal.aiPlayerId}` }
  }
  if (!player.enabled) {
    return { error: `ai player disabled: ${proposal.aiPlayerId}` }
  }
  if (player.paused) {
    return { error: `ai player paused: ${proposal.aiPlayerId}` }
  }

  const execution = await executeSupportedProposal(proposal, input.executedBy, input.includeWorld ?? false)
  if ('error' in execution) {
    recordAiPlayerGovernanceEvent({
      action: 'ai_player_execute_proposal',
      success: false,
      message: execution.error,
      metadata: {
        aiPlayerId: proposal.aiPlayerId,
        governorPlayerId: proposal.governorPlayerId,
        factionId: proposal.factionId,
        proposalId,
        proposalAction: proposal.action,
      },
    })
    return { error: execution.error }
  }
  return execution
}

export function listAiPlayerActionReceipts(aiPlayerId: string, limit = 20): AiPlayerActionReceipt[] {
  ensureAiPlayerGovernanceLoaded()
  const receipts = actionReceiptsByAiPlayer.get(aiPlayerId) ?? []
  return cloneValue(receipts.slice(-Math.max(1, Math.min(200, Math.trunc(limit))))).reverse()
}
