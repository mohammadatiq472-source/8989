import type { FactionAiQuota, ResourceTransferBundle } from './game/world'
import type {
  AiRuntimeFailureAggregation,
  AiRuntimeFailureRecord,
  AiRuntimeLockConflictAggregation,
  AiRuntimeObservabilityLock,
} from './game/observability'
import type { CityTechTrackId } from './game/meta'
import type { SessionAutonomyLevel, SessionControlMode } from './game/session'

export type AiPlayerActionCategory =
  | 'governance'
  | 'city'
  | 'world'
  | 'alliance'
  | 'economy'
  | 'activity'
  | 'intel'

export type AiPlayerActionRiskLevel = 'low' | 'medium' | 'high'

export type AiPlayerProposalSource =
  | 'llm'
  | 'rule'
  | 'human'
  | 'replay'
  | 'mcp'
  | 'cli'

export type AiPlayerProposalStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'failed'

export type AiPlayerActionType =
  | 'ai_player_pause'
  | 'ai_player_resume'
  | 'ai_player_set_control_mode'
  | 'ai_player_set_action_whitelist'
  | 'ai_player_set_budget'
  | 'ai_player_set_schedule_window'
  | 'ai_player_assign_governor'
  | 'ai_player_transfer_governor'
  | 'ai_player_takeover'
  | 'ai_player_release_takeover'
  | 'city_upgrade'
  | 'building_upgrade'
  | 'research_start'
  | 'troop_train'
  | 'troop_facility_upgrade'
  | 'recruit_pool_select'
  | 'troop_heal'
  | 'queue_fill_idle_slot'
  | 'speedup_use'
  | 'resource_item_use'
  | 'boost_item_use'
  | 'recruit_commander'
  | 'world_scout'
  | 'march_move'
  | 'march_recall'
  | 'resource_gather'
  | 'garrison_set'
  | 'tile_occupy'
  | 'wild_attack'
  | 'teleport_use'
  | 'general_focus_set'
  | 'formation_assign'
  | 'threat_escape'
  | 'alliance_help'
  | 'resource_transfer_to_governor'
  | 'alliance_donate'
  | 'rally_join'
  | 'rally_launch'
  | 'alliance_relocate'
  | 'alliance_task_execute'
  | 'alliance_mail_ack'
  | 'daily_task_execute'
  | 'reward_claim'
  | 'event_task_execute'
  | 'event_priority_sort'
  | 'stamina_spend'
  | 'activity_window_enter'
  | 'battle_report_read'
  | 'failure_reason_summarize'
  | 'enemy_pressure_estimate'
  | 'threat_alert_emit'
  | 'next_step_propose'
  | 'human_escalation_request'

export type AiPlayerActionCatalogEntry = {
  action: AiPlayerActionType
  category: AiPlayerActionCategory
  label: string
  riskLevel: AiPlayerActionRiskLevel
  requiresApprovalByDefault: boolean
  executableInV1: boolean
  mappedWorldAction?: string
  notes?: string
}

export type AiPlayerExecutableV1ActionType =
  | 'city_upgrade'
  | 'building_upgrade'
  | 'queue_fill_idle_slot'
  | 'research_start'
  | 'troop_train'
  | 'troop_facility_upgrade'
  | 'recruit_pool_select'
  | 'recruit_commander'
  | 'world_scout'
  | 'march_move'
  | 'garrison_set'
  | 'resource_gather'
  | 'general_focus_set'
  | 'formation_assign'
  | 'threat_escape'
  | 'alliance_help'
  | 'resource_transfer_to_governor'
  | 'reward_claim'

export type AiPlayerEmptyArgs = Record<string, never>

export type AiPlayerBuildingGroupId = 'market' | 'tax' | 'policy'

export type AiPlayerBuildingId =
  | 'market_plaza'
  | 'tax_office'
  | 'policy_hall'
  | 'recruit_policy_board'

export type AiPlayerQueueAffairGroupId = AiPlayerBuildingGroupId

export type AiPlayerCityUpgradeArgs = {
  tileId?: string
}

export type AiPlayerBuildingUpgradeArgs = {
  cityId?: string
  groupId?: AiPlayerBuildingGroupId
  buildingId?: AiPlayerBuildingId
}

export type AiPlayerQueueFillIdleSlotArgs = {
  cityId?: string
  groupId?: AiPlayerQueueAffairGroupId
}

export type AiPlayerResearchStartArgs = {
  tileId?: string
  techId?: CityTechTrackId
}

export type AiPlayerTroopTrainArgs = {
  heroId?: string
  tileId?: string
}

export type AiPlayerTroopFacilityId =
  | 'training_ground'
  | 'recruit_station'
  | 'command_hall'
  | 'support_structures'

export type AiPlayerTroopFacilityBuildingId =
  | 'training_ground_base'
  | 'training_drill'
  | 'recruit_station_base'
  | 'reserve_camp'
  | 'command_hall_base'
  | 'frontline_slot'
  | 'supply_camp'
  | 'signal_tower'

export type AiPlayerRecruitPoolId =
  | 'pool_standard'
  | 'pool_season'
  | 'pool_limited'

export type AiPlayerGeneralTacticId = 'assault' | 'guard' | 'logistics'
export type AiPlayerThreatEscapeMode = 'recover' | 'redeploy'

export type AiPlayerRecruitCommanderArgs = {
  poolId?: AiPlayerRecruitPoolId
  count?: number
}

export type AiPlayerTroopFacilityUpgradeArgs = {
  unitId?: string
  facilityId?: AiPlayerTroopFacilityId
  buildingId?: AiPlayerTroopFacilityBuildingId
}

export type AiPlayerRecruitPoolSelectArgs = {
  poolId?: AiPlayerRecruitPoolId
}

export type AiPlayerWorldScoutArgs = {
  unitId?: string
  targetTileId?: string
}

export type AiPlayerMarchMoveArgs = {
  unitId?: string
  targetTileId?: string
}

export type AiPlayerGarrisonSetArgs = {
  unitId?: string
  targetTileId?: string
  summary?: string
}

export type AiPlayerGeneralFocusSetArgs = {
  heroId?: string
}

export type AiPlayerFormationAssignArgs = {
  heroId?: string
  tacticId?: AiPlayerGeneralTacticId
}

export type AiPlayerThreatEscapeArgs = {
  mode?: AiPlayerThreatEscapeMode
}

export type AiPlayerAllianceHelpArgs = {
  regionId?: string
}

export type AiPlayerResourceGatherArgs = {
  unitId: string
  tileId: string
}

export type AiPlayerResourceTransferToGovernorArgs = {
  resources: Partial<ResourceTransferBundle>
}

export type AiPlayerRewardClaimArgs = {
  rewardId?: string
}

type AiPlayerActionArgsByType = {
  city_upgrade: AiPlayerCityUpgradeArgs
  building_upgrade: AiPlayerBuildingUpgradeArgs
  queue_fill_idle_slot: AiPlayerQueueFillIdleSlotArgs
  research_start: AiPlayerResearchStartArgs
  troop_train: AiPlayerTroopTrainArgs
  troop_facility_upgrade: AiPlayerTroopFacilityUpgradeArgs
  recruit_pool_select: AiPlayerRecruitPoolSelectArgs
  recruit_commander: AiPlayerRecruitCommanderArgs
  world_scout: AiPlayerWorldScoutArgs
  march_move: AiPlayerMarchMoveArgs
  garrison_set: AiPlayerGarrisonSetArgs
  resource_gather: AiPlayerResourceGatherArgs
  general_focus_set: AiPlayerGeneralFocusSetArgs
  formation_assign: AiPlayerFormationAssignArgs
  threat_escape: AiPlayerThreatEscapeArgs
  alliance_help: AiPlayerAllianceHelpArgs
  resource_transfer_to_governor: AiPlayerResourceTransferToGovernorArgs
  reward_claim: AiPlayerRewardClaimArgs
} & {
  [K in Exclude<AiPlayerActionType, AiPlayerExecutableV1ActionType>]: AiPlayerEmptyArgs
}

export type AiPlayerActionArgs<T extends AiPlayerActionType = AiPlayerActionType> = AiPlayerActionArgsByType[T]

export type AiPlayerApprovalPolicy = {
  autoApproveLowRisk: boolean
  autoApproveMediumRisk: boolean
  requireHumanApprovalForHighRisk: boolean
}

export type AiPlayerBudgetPolicy = {
  maxPendingProposals: number
  maxExecutableActionsPerTick: number
  maxExecutableActionsPerHour: number
  allowHighRiskActions: boolean
}

export type AiPlayerRuntimePolicy = {
  allowLlmProposals: boolean
  allowRuleProposals: boolean
  allowMcpExecution: boolean
  allowCliExecution: boolean
}

export type GovernedAiPlayer = {
  aiPlayerId: string
  displayName: string
  governorPlayerId: string
  factionId: string
  enabled: boolean
  paused: boolean
  actionWhitelist: AiPlayerActionType[]
  approvalPolicy: AiPlayerApprovalPolicy
  budgetPolicy: AiPlayerBudgetPolicy
  runtimePolicy: AiPlayerRuntimePolicy
  createdAt: string
  updatedAt: string
}

export type AiPlayerBudgetSnapshot = {
  actionPointsRemaining: number
  foodRemaining: number
  aiQuota: FactionAiQuota | null
}

export type AiPlayerProposalStats = {
  pendingApprovalCount: number
  approvedCount: number
  rejectedCount: number
  executedCount: number
  failedCount: number
}

export type AiPlayerGovernancePersistHealth = {
  path: string
  enabled: boolean
  loaded: boolean
  playerCount: number
  pausedPlayerCount: number
  disabledPlayerCount: number
  proposalCount: number
  pendingProposalCount: number
  receiptCount: number
  persistDirty: boolean
  persistInFlight: boolean
  persistSuccessCount: number
  persistFailureCount: number
  lastPersistAt: number | null
  lastPersistErrorAt: number | null
  corruptQuarantineCount: number
  lastCorruptQuarantineAt: number | null
  restoredPlayerCount: number
  restoredProposalCount: number
  restoredReceiptCount: number
  lastRestoreAt: number | null
  persistVersion: number
}

export type AiPlayerAdvanceTickPhaseSummary = {
  phase: string
  durationMs: number
}

export type AiPlayerAdvanceTickSubphaseSummary = {
  phase: string
  subphase: string
  durationMs: number
}

export type AiPlayerRuntimeObservabilitySummary = {
  generatedAt: string
  factionId: string
  lock: AiRuntimeObservabilityLock
  lastFailure?: AiRuntimeFailureRecord
  recentFailures: AiRuntimeFailureAggregation
  recentLockConflicts: AiRuntimeLockConflictAggregation
  topAdvanceTickPhasesByLast: AiPlayerAdvanceTickPhaseSummary[]
  topAdvanceTickSubphasesByLast: AiPlayerAdvanceTickSubphaseSummary[]
  recentEventActions: string[]
}

export type GovernedAiPlayerRuntime = GovernedAiPlayer & {
  autonomyLevel: SessionAutonomyLevel
  controlMode: SessionControlMode
  online: boolean
  seatCount: number
  onlineSeatCount: number
  playerNames: string[]
  governorOnline: boolean
  budget: AiPlayerBudgetSnapshot
  proposalStats: AiPlayerProposalStats
  latestProposalId?: string
  latestReceipt?: AiPlayerActionReceipt
}

export type GovernedAiPlayerRuntimeDetail = GovernedAiPlayerRuntime & {
  persistence: AiPlayerGovernancePersistHealth
  observability: AiPlayerRuntimeObservabilitySummary
}

export type AiPlayerActionProposal = {
  proposalId: string
  aiPlayerId: string
  governorPlayerId: string
  factionId: string
  action: AiPlayerActionType
  args: AiPlayerActionArgs
  reason: string
  riskLevel: AiPlayerActionRiskLevel
  source: AiPlayerProposalSource
  status: AiPlayerProposalStatus
  requiresApproval: boolean
  executableInV1: boolean
  createdAt: string
  updatedAt: string
  approvedAt?: string
  approvedBy?: string
  rejectedAt?: string
  rejectedBy?: string
  rejectionReason?: string
  executedAt?: string
  executedBy?: string
  worldAction?: string
  worldActionPayload?: Record<string, unknown>
}

export type AiPlayerActionProposalOf<T extends AiPlayerActionType> =
  Omit<AiPlayerActionProposal, 'action' | 'args'> & {
    action: T
    args: AiPlayerActionArgs<T>
  }

export type AiPlayerActionReceipt = {
  proposalId: string
  aiPlayerId: string
  governorPlayerId: string
  factionId: string
  action: AiPlayerActionType
  worldAction: string | null
  worldActionPayload?: Record<string, unknown>
  actionRequestId: string | null
  ok: boolean
  failureCode?: string | null
  message?: string
  execution: unknown | null
  observedAt: string
}

export type CreateGovernedAiPlayerRequest = {
  aiPlayerId: string
  displayName: string
  governorPlayerId: string
  factionId: string
  enabled?: boolean
  paused?: boolean
  actionWhitelist?: AiPlayerActionType[]
  approvalPolicy?: Partial<AiPlayerApprovalPolicy>
  budgetPolicy?: Partial<AiPlayerBudgetPolicy>
  runtimePolicy?: Partial<AiPlayerRuntimePolicy>
}

export type UpdateGovernedAiPlayerStatusRequest = {
  updatedBy: string
}

export type AiPlayerActionProposalRequest = {
  aiPlayerId: string
  action: AiPlayerActionType
  args?: AiPlayerActionArgs
  reason: string
  source: AiPlayerProposalSource
}

export type AiPlayerActionProposalRequestOf<T extends AiPlayerActionType> =
  Omit<AiPlayerActionProposalRequest, 'action' | 'args'> & {
    action: T
    args?: AiPlayerActionArgs<T>
  }

export type ApproveAiPlayerProposalRequest = {
  approvedBy: string
}

export type RejectAiPlayerProposalRequest = {
  rejectedBy: string
  rejectionReason?: string
}

export type ExecuteAiPlayerProposalRequest = {
  executedBy: string
  includeWorld?: boolean
}

export type AiPlayerActionCatalogResponse = {
  catalog: AiPlayerActionCatalogEntry[]
}

export type ListGovernedAiPlayersResponse = {
  items: GovernedAiPlayerRuntime[]
  count: number
}

export type ListAiPlayerProposalsResponse = {
  items: AiPlayerActionProposal[]
  count: number
}

export type ListAiPlayerReceiptsResponse = {
  items: AiPlayerActionReceipt[]
  count: number
}

export type GovernedAiPlayerMutationResponse = {
  ok: boolean
  player?: GovernedAiPlayerRuntimeDetail
  error?: string
}

export type AiPlayerProposalMutationResponse = {
  ok: boolean
  proposal?: AiPlayerActionProposal
  receipt?: AiPlayerActionReceipt
  error?: string
}
