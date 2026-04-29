import { randomUUID } from 'node:crypto'
import type {
  AiPlayerActionCatalogEntry,
  AiPlayerActionProposal,
  AiPlayerActionProposalRequest,
  AiPlayerActionReceipt,
  AiPlayerActionType,
  AiPlayerRecoveryHint,
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

type ExecuteAiPlayerActionProposalResult = {
  proposal?: AiPlayerActionProposal
  receipt?: AiPlayerActionReceipt
  error?: string
  failureCode?: string | null
  recoveryHint?: AiPlayerRecoveryHint
}

const RESOURCE_HINT_LABELS = [
  ['food', '粮草'],
  ['wood', '木材'],
  ['stone', '石料'],
  ['iron', '铁矿'],
] as const

function formatResourceTransferBundle(args: unknown): string {
  if (!args || typeof args !== 'object') {
    return ''
  }
  const resources = (args as Record<string, unknown>).resources
  if (!resources || typeof resources !== 'object') {
    return ''
  }
  const resourceRecord = resources as Record<string, unknown>
  return RESOURCE_HINT_LABELS.flatMap(([key, label]) => {
    const amount = Number(resourceRecord[key])
    return Number.isFinite(amount) && amount > 0 ? [`${label} ${amount}`] : []
  }).join('、')
}

function buildResourceTransferRetryCommand(args: unknown, prefix: string): string {
  const resourceText = formatResourceTransferBundle(args)
  if (resourceText) {
    return `${prefix}${resourceText} 到总督通用收件箱。`
  }
  return `${prefix}一部分资源到总督通用收件箱。`
}

function buildAiPlayerRecoveryHint(params: {
  action: AiPlayerActionType
  args?: unknown
  failureCode?: string | null
  ok?: boolean
  status?: AiPlayerActionProposal['status']
}): AiPlayerRecoveryHint {
  if (params.ok === true || params.status === 'executed') {
    return {
      summary: '已执行；输送资源会进入主界面通用收件箱，玩家在通用收件箱领取。',
      focus: 'inbox',
    }
  }

  if (params.status === 'pending_approval') {
    return {
      summary: '等待总督批准；批准后后端会执行规则并把回执写回 AI 聊天。',
      focus: 'approval',
    }
  }

  if (params.status === 'approved') {
    return {
      summary: '已批准，等待执行；执行结果会回写 AI 聊天和回执列表。',
      recommendedCommand: '执行这个已经批准的提案。',
      focus: 'retry',
    }
  }

  if (params.status === 'rejected') {
    return {
      summary: '提案已拒绝；需要重新用自然语言下令生成新提案。',
      recommendedCommand: params.action === 'resource_transfer_to_governor'
        ? buildResourceTransferRetryCommand(params.args, '重新生成提案：输送')
        : '重新生成一个更明确的提案。',
      focus: 'retry',
    }
  }

  switch (params.failureCode) {
    case 'approval_required':
      return {
        summary: '该动作需要先批准；请在提案详情中批准后再执行。',
        focus: 'approval',
      }
    case 'transfer_cooldown_active':
      return {
        summary: 'AI 子账户输送仍在冷却；等待冷却结束后再执行。',
        recommendedCommand: buildResourceTransferRetryCommand(params.args, '冷却结束后再输送'),
      focus: 'cooldown',
    }
    case 'insufficient_resources':
    case 'insufficient_ai_resources':
      return {
        summary: 'AI 子账户四类资源不足；先让 AI 采集资源，或降低输送数量。',
        recommendedCommand: buildResourceTransferRetryCommand(params.args, '先继续采集资源；资源够了再输送'),
        focus: 'resources',
      }
    case 'daily_quota_exceeded':
      return {
        summary: 'AI 子账户今日输送额度已用完；等待下一个额度窗口，或改让 AI 继续采集。',
        recommendedCommand: '等待额度刷新后再输送资源到总督通用收件箱。',
        focus: 'cooldown',
      }
    case 'proposal_not_found':
      return {
        summary: '提案记录不存在或已过期；请重新下达自然语言命令生成新提案。',
        focus: 'retry',
      }
    case 'proposal_not_approved':
      return {
        summary: '提案尚未批准；请先批准，或拒绝后重新下令。',
        focus: 'approval',
      }
    default:
      if (params.action === 'resource_transfer_to_governor') {
        return {
          summary: '检查 AI 子账户四类资源、输送冷却和总督通用收件箱状态；修正后重新下令。',
          recommendedCommand: buildResourceTransferRetryCommand(params.args, '重新生成提案：输送'),
          focus: 'retry',
        }
      }
      return {
        summary: '查看回执失败原因，必要时重新下达更具体的自然语言命令。',
        focus: 'retry',
      }
  }
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
  const recoveryHint = buildAiPlayerRecoveryHint({
    action: proposal.action,
    args: proposal.args,
    failureCode: response.failureCode ?? null,
    ok: response.ok,
    status: response.ok ? 'executed' : 'failed',
  })
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
    recoveryHint,
  }

  const updatedProposal: AiPlayerActionProposal = {
    ...proposal,
    status: response.ok ? 'executed' : 'failed',
    executedAt: observedAt,
    executedBy,
    updatedAt: observedAt,
    worldAction: worldAction ?? undefined,
    worldActionPayload,
    recoveryHint,
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
  if (!catalogEntry.executableInV1) {
    return { error: `action '${parsedInput.action}' is not executable in v1` }
  }
  if (catalogEntry.riskLevel === 'high' && !player.budgetPolicy.allowHighRiskActions) {
    return { error: `high-risk actions disabled for ${parsedInput.aiPlayerId}` }
  }

  const createdAt = nowIso()
  const proposalArgs = cloneProposalArgs(parsedInput.args ?? {})
  const requiresApproval = computeRequiresApproval(catalogEntry, player)
  const status: AiPlayerActionProposal['status'] = requiresApproval ? 'pending_approval' : 'approved'
  const proposal: AiPlayerActionProposal = {
    proposalId: randomUUID(),
    aiPlayerId: player.aiPlayerId,
    governorPlayerId: player.governorPlayerId,
    factionId: player.factionId,
    action: parsedInput.action,
    args: proposalArgs,
    reason: parsedInput.reason,
    riskLevel: catalogEntry.riskLevel,
    source: parsedInput.source,
    status,
    requiresApproval,
    executableInV1: catalogEntry.executableInV1,
    createdAt,
    updatedAt: createdAt,
    recoveryHint: buildAiPlayerRecoveryHint({
      action: parsedInput.action,
      args: proposalArgs,
      status,
    }),
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
    recoveryHint: buildAiPlayerRecoveryHint({
      action: proposal.action,
      args: proposal.args,
      status: 'approved',
    }),
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
    recoveryHint: buildAiPlayerRecoveryHint({
      action: proposal.action,
      args: proposal.args,
      failureCode: input.rejectionReason,
      status: 'rejected',
    }),
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
): Promise<ExecuteAiPlayerActionProposalResult> {
  ensureAiPlayerGovernanceLoaded()
  const proposal = actionProposals.get(proposalId)
  if (!proposal) {
    const failureCode = 'proposal_not_found'
    const recoveryHint = buildAiPlayerRecoveryHint({
      action: 'next_step_propose',
      failureCode,
    })
    return { error: `proposal not found: ${proposalId}`, failureCode, recoveryHint }
  }
  if (proposal.status !== 'approved') {
    const failureCode = proposal.status === 'pending_approval' ? 'proposal_not_approved' : 'proposal_not_approved'
    const recoveryHint = buildAiPlayerRecoveryHint({
      action: proposal.action,
      args: proposal.args,
      failureCode,
    })
    return {
      proposal: cloneValue(proposal),
      error: `proposal ${proposalId} is not approved`,
      failureCode,
      recoveryHint,
    }
  }

  const player = governedAiPlayers.get(proposal.aiPlayerId)
  if (!player) {
    const recoveryHint = buildAiPlayerRecoveryHint({
      action: proposal.action,
      args: proposal.args,
      failureCode: 'ai_player_not_found',
    })
    return {
      proposal: cloneValue(proposal),
      error: `ai player not found: ${proposal.aiPlayerId}`,
      failureCode: 'ai_player_not_found',
      recoveryHint,
    }
  }
  if (!player.enabled) {
    const recoveryHint = buildAiPlayerRecoveryHint({
      action: proposal.action,
      args: proposal.args,
      failureCode: 'ai_player_disabled',
    })
    return {
      proposal: cloneValue(proposal),
      error: `ai player disabled: ${proposal.aiPlayerId}`,
      failureCode: 'ai_player_disabled',
      recoveryHint,
    }
  }
  if (player.paused) {
    const recoveryHint = buildAiPlayerRecoveryHint({
      action: proposal.action,
      args: proposal.args,
      failureCode: 'ai_player_paused',
    })
    return {
      proposal: cloneValue(proposal),
      error: `ai player paused: ${proposal.aiPlayerId}`,
      failureCode: 'ai_player_paused',
      recoveryHint,
    }
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
    const failureCode = 'proposal_execution_failed'
    const recoveryHint = buildAiPlayerRecoveryHint({
      action: proposal.action,
      args: proposal.args,
      failureCode,
    })
    return {
      proposal: cloneValue(proposal),
      error: execution.error,
      failureCode,
      recoveryHint,
    }
  }
  return execution
}

export function listAiPlayerActionReceipts(aiPlayerId: string, limit = 20): AiPlayerActionReceipt[] {
  ensureAiPlayerGovernanceLoaded()
  const receipts = actionReceiptsByAiPlayer.get(aiPlayerId) ?? []
  return cloneValue(receipts.slice(-Math.max(1, Math.min(200, Math.trunc(limit))))).reverse()
}
