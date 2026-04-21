import type {
  AiPlayerActionCatalogEntry,
  AiPlayerActionType,
  AiPlayerApprovalPolicy,
  AiPlayerBudgetPolicy,
  AiPlayerRuntimePolicy,
  CreateGovernedAiPlayerRequest,
  GovernedAiPlayer,
  GovernedAiPlayerRuntime,
  GovernedAiPlayerRuntimeDetail,
} from '../../../../shared/contracts/aiPlayer'
import { getWorldStateReadonly } from '../world/WorldService'
import { AI_PLAYER_ACTION_CATALOG, listStaticAiPlayerActionCatalog } from './aiPlayerActionCatalog'
import { recordAiPlayerGovernanceEvent } from './aiPlayerGovernanceEvents'
import {
  ensureAiPlayerGovernanceLoaded,
  flushAiPlayerGovernancePersist,
  getAiPlayerGovernancePersistHealth,
  loadPersistedGovernanceState,
  resetAiPlayerGovernancePersistForTests,
  scheduleAiPlayerGovernancePersist,
} from './aiPlayerGovernancePersist'
import { buildAiPlayerRuntime, buildAiPlayerRuntimeDetail } from './aiPlayerGovernanceRuntimeView'
import {
  governedAiPlayers,
  nowIso,
} from './aiPlayerGovernanceState'

export {
  approveAiPlayerActionProposal,
  createAiPlayerActionProposal,
  executeAiPlayerActionProposal,
  getAiPlayerActionProposal,
  listAiPlayerActionProposals,
  listAiPlayerActionReceipts,
  rejectAiPlayerActionProposal,
} from './aiPlayerProposalLifecycle'
export {
  flushAiPlayerGovernancePersist,
  getAiPlayerGovernancePersistHealth,
}

const DEFAULT_APPROVAL_POLICY: AiPlayerApprovalPolicy = {
  autoApproveLowRisk: false,
  autoApproveMediumRisk: false,
  requireHumanApprovalForHighRisk: true,
}

const DEFAULT_BUDGET_POLICY: AiPlayerBudgetPolicy = {
  maxPendingProposals: 16,
  maxExecutableActionsPerTick: 4,
  maxExecutableActionsPerHour: 120,
  allowHighRiskActions: false,
}

const DEFAULT_RUNTIME_POLICY: AiPlayerRuntimePolicy = {
  allowLlmProposals: true,
  allowRuleProposals: true,
  allowMcpExecution: true,
  allowCliExecution: true,
}

function listAllActionTypes(): AiPlayerActionType[] {
  return AI_PLAYER_ACTION_CATALOG.map((entry) => entry.action)
}

function mergeApprovalPolicy(partial?: Partial<AiPlayerApprovalPolicy>): AiPlayerApprovalPolicy {
  return {
    ...DEFAULT_APPROVAL_POLICY,
    ...partial,
  }
}

function mergeBudgetPolicy(partial?: Partial<AiPlayerBudgetPolicy>): AiPlayerBudgetPolicy {
  return {
    ...DEFAULT_BUDGET_POLICY,
    ...partial,
  }
}

function mergeRuntimePolicy(partial?: Partial<AiPlayerRuntimePolicy>): AiPlayerRuntimePolicy {
  return {
    ...DEFAULT_RUNTIME_POLICY,
    ...partial,
  }
}

function uniqueActions(actions: AiPlayerActionType[]): AiPlayerActionType[] {
  return Array.from(new Set(actions))
}

function ensureFactionExists(factionId: string): boolean {
  const world = getWorldStateReadonly()
  return Boolean(world.factions[factionId])
}

export function listAiPlayerActionCatalog(): AiPlayerActionCatalogEntry[] {
  return listStaticAiPlayerActionCatalog()
}

export function registerGovernedAiPlayer(input: CreateGovernedAiPlayerRequest): {
  player?: GovernedAiPlayerRuntimeDetail
  error?: string
} {
  ensureAiPlayerGovernanceLoaded()
  if (governedAiPlayers.has(input.aiPlayerId)) {
    return { error: `ai player already exists: ${input.aiPlayerId}` }
  }
  if (!ensureFactionExists(input.factionId)) {
    return { error: `unknown faction: ${input.factionId}` }
  }

  const createdAt = nowIso()
  const player: GovernedAiPlayer = {
    aiPlayerId: input.aiPlayerId,
    displayName: input.displayName,
    governorPlayerId: input.governorPlayerId,
    factionId: input.factionId,
    enabled: input.enabled ?? true,
    paused: input.paused ?? false,
    actionWhitelist: uniqueActions(input.actionWhitelist?.slice() ?? listAllActionTypes()),
    approvalPolicy: mergeApprovalPolicy(input.approvalPolicy),
    budgetPolicy: mergeBudgetPolicy(input.budgetPolicy),
    runtimePolicy: mergeRuntimePolicy(input.runtimePolicy),
    createdAt,
    updatedAt: createdAt,
  }

  governedAiPlayers.set(player.aiPlayerId, player)
  scheduleAiPlayerGovernancePersist()
  recordAiPlayerGovernanceEvent({
    action: 'ai_player_register',
    success: true,
    message: `registered governed ai player ${player.aiPlayerId}`,
    metadata: {
      aiPlayerId: player.aiPlayerId,
      governorPlayerId: player.governorPlayerId,
      factionId: player.factionId,
    },
  })
  return { player: buildAiPlayerRuntimeDetail(player) }
}

export function listGovernedAiPlayers(params: {
  governorPlayerId?: string
  factionId?: string
  includeDisabled?: boolean
} = {}): GovernedAiPlayerRuntime[] {
  ensureAiPlayerGovernanceLoaded()
  const items = Array.from(governedAiPlayers.values()).filter((player) => {
    if (!params.includeDisabled && !player.enabled) {
      return false
    }
    if (params.governorPlayerId && player.governorPlayerId !== params.governorPlayerId) {
      return false
    }
    if (params.factionId && player.factionId !== params.factionId) {
      return false
    }
    return true
  })

  return items
    .map((player) => buildAiPlayerRuntime(player))
    .sort((left, right) => left.factionId.localeCompare(right.factionId) || left.aiPlayerId.localeCompare(right.aiPlayerId))
}

export function getGovernedAiPlayerRuntime(aiPlayerId: string): GovernedAiPlayerRuntimeDetail | null {
  ensureAiPlayerGovernanceLoaded()
  const player = governedAiPlayers.get(aiPlayerId)
  return player ? buildAiPlayerRuntimeDetail(player) : null
}

export function pauseGovernedAiPlayer(aiPlayerId: string, updatedBy: string): {
  player?: GovernedAiPlayerRuntimeDetail
  error?: string
} {
  ensureAiPlayerGovernanceLoaded()
  const player = governedAiPlayers.get(aiPlayerId)
  if (!player) {
    return { error: `ai player not found: ${aiPlayerId}` }
  }

  player.paused = true
  player.updatedAt = nowIso()
  governedAiPlayers.set(aiPlayerId, player)
  scheduleAiPlayerGovernancePersist()
  recordAiPlayerGovernanceEvent({
    action: 'ai_player_pause',
    success: true,
    message: `paused governed ai player ${aiPlayerId}`,
    metadata: {
      aiPlayerId,
      updatedBy,
      governorPlayerId: player.governorPlayerId,
      factionId: player.factionId,
    },
  })
  return { player: buildAiPlayerRuntimeDetail(player) }
}

export function resumeGovernedAiPlayer(aiPlayerId: string, updatedBy: string): {
  player?: GovernedAiPlayerRuntimeDetail
  error?: string
} {
  ensureAiPlayerGovernanceLoaded()
  const player = governedAiPlayers.get(aiPlayerId)
  if (!player) {
    return { error: `ai player not found: ${aiPlayerId}` }
  }

  player.paused = false
  player.updatedAt = nowIso()
  governedAiPlayers.set(aiPlayerId, player)
  scheduleAiPlayerGovernancePersist()
  recordAiPlayerGovernanceEvent({
    action: 'ai_player_resume',
    success: true,
    message: `resumed governed ai player ${aiPlayerId}`,
    metadata: {
      aiPlayerId,
      updatedBy,
      governorPlayerId: player.governorPlayerId,
      factionId: player.factionId,
    },
  })
  return { player: buildAiPlayerRuntimeDetail(player) }
}

export function resetAiPlayerGovernanceServiceForTests() {
  resetAiPlayerGovernancePersistForTests()
}

loadPersistedGovernanceState()
