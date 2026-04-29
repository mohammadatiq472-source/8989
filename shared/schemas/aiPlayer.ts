import { z } from 'zod'
import type {
  AiPlayerActionArgs,
  AiPlayerActionType,
  AiPlayerActionProposalRequest,
  ApproveAiPlayerProposalRequest,
  CreateGovernedAiPlayerRequest,
  ExecuteAiPlayerProposalRequest,
  RejectAiPlayerProposalRequest,
  UpsertAiPlayerContextDocumentRequest,
  UpdateGovernedAiPlayerProfileRequest,
  UpdateGovernedAiPlayerStatusRequest,
} from '../contracts/aiPlayer'
import {
  aiRuntimeFailureAggregationSchema,
  aiRuntimeFailureRecordSchema,
  aiRuntimeLockConflictAggregationSchema,
  aiRuntimeObservabilityLockSchema,
  factionAiQuotaSchema,
} from './observability'
import { sessionAutonomyLevelSchema, sessionControlModeSchema } from './session'

export const aiPlayerActionCategorySchema = z.enum([
  'governance',
  'city',
  'world',
  'alliance',
  'economy',
  'activity',
  'intel',
])

export const aiPlayerActionRiskLevelSchema = z.enum([
  'low',
  'medium',
  'high',
])

export const aiPlayerProposalSourceSchema = z.enum([
  'llm',
  'rule',
  'human',
  'replay',
  'mcp',
  'cli',
])

export const aiPlayerProposalStatusSchema = z.enum([
  'pending_approval',
  'approved',
  'rejected',
  'executed',
  'failed',
])

export const aiPlayerActionTypeSchema = z.enum([
  'ai_player_pause',
  'ai_player_resume',
  'ai_player_set_control_mode',
  'ai_player_set_action_whitelist',
  'ai_player_set_budget',
  'ai_player_set_schedule_window',
  'ai_player_assign_governor',
  'ai_player_transfer_governor',
  'ai_player_takeover',
  'ai_player_release_takeover',
  'city_upgrade',
  'building_upgrade',
  'research_start',
  'troop_train',
  'troop_facility_upgrade',
  'recruit_pool_select',
  'troop_heal',
  'queue_fill_idle_slot',
  'speedup_use',
  'resource_item_use',
  'boost_item_use',
  'recruit_commander',
  'world_scout',
  'march_move',
  'march_recall',
  'resource_gather',
  'garrison_set',
  'tile_occupy',
  'wild_attack',
  'teleport_use',
  'general_focus_set',
  'formation_assign',
  'threat_escape',
  'alliance_help',
  'resource_transfer_to_governor',
  'alliance_donate',
  'rally_join',
  'rally_launch',
  'alliance_relocate',
  'alliance_task_execute',
  'alliance_mail_ack',
  'daily_task_execute',
  'reward_claim',
  'event_task_execute',
  'event_priority_sort',
  'stamina_spend',
  'activity_window_enter',
  'battle_report_read',
  'failure_reason_summarize',
  'enemy_pressure_estimate',
  'threat_alert_emit',
  'next_step_propose',
  'human_escalation_request',
])

export const aiPlayerActionCatalogEntrySchema = z.object({
  action: aiPlayerActionTypeSchema,
  category: aiPlayerActionCategorySchema,
  label: z.string().trim().min(1).max(120),
  riskLevel: aiPlayerActionRiskLevelSchema,
  requiresApprovalByDefault: z.boolean(),
  executableInV1: z.boolean(),
  mappedWorldAction: z.string().trim().min(1).max(120).optional(),
  notes: z.string().trim().min(1).max(400).optional(),
})

const cityTechTrackIdSchema = z.enum(['governance', 'logistics', 'defense', 'recruitment'])
const aiPlayerBuildingGroupIdSchema = z.enum(['market', 'tax', 'policy'])
const aiPlayerBuildingIdSchema = z.enum(['market_plaza', 'tax_office', 'policy_hall', 'recruit_policy_board'])
const aiPlayerTroopFacilityIdSchema = z.enum(['training_ground', 'recruit_station', 'command_hall', 'support_structures'])
const aiPlayerTroopFacilityBuildingIdSchema = z.enum([
  'training_ground_base',
  'training_drill',
  'recruit_station_base',
  'reserve_camp',
  'command_hall_base',
  'frontline_slot',
  'supply_camp',
  'signal_tower',
])
const aiPlayerRecruitPoolIdSchema = z.enum(['pool_standard', 'pool_season', 'pool_limited'])
const aiPlayerGeneralTacticIdSchema = z.enum(['assault', 'guard', 'logistics'])
const aiPlayerThreatEscapeModeSchema = z.enum(['recover', 'redeploy'])
const resourceTransferBundleSchema = z.object({
  food: z.number().int().positive().optional(),
  wood: z.number().int().positive().optional(),
  stone: z.number().int().positive().optional(),
  iron: z.number().int().positive().optional(),
}).strict().refine(
  (value) => Object.values(value).some((amount) => typeof amount === 'number' && amount > 0),
  { message: 'at least one positive resource amount is required' },
)

export const aiPlayerEmptyArgsSchema = z.object({}).strict()

export const aiPlayerCityUpgradeArgsSchema = z.object({
  tileId: z.string().trim().min(1).max(64).optional(),
}).strict()

export const aiPlayerBuildingUpgradeArgsSchema = z.object({
  cityId: z.string().trim().min(1).max(64).optional(),
  groupId: aiPlayerBuildingGroupIdSchema.optional(),
  buildingId: aiPlayerBuildingIdSchema.optional(),
}).strict()

export const aiPlayerQueueFillIdleSlotArgsSchema = z.object({
  cityId: z.string().trim().min(1).max(64).optional(),
  groupId: aiPlayerBuildingGroupIdSchema.optional(),
}).strict()

export const aiPlayerResearchStartArgsSchema = z.object({
  tileId: z.string().trim().min(1).max(64).optional(),
  techId: cityTechTrackIdSchema.optional(),
}).strict()

export const aiPlayerTroopTrainArgsSchema = z.object({
  heroId: z.string().trim().min(1).max(64).optional(),
  tileId: z.string().trim().min(1).max(64).optional(),
}).strict()

export const aiPlayerTroopFacilityUpgradeArgsSchema = z.object({
  unitId: z.string().trim().min(1).max(64).optional(),
  facilityId: aiPlayerTroopFacilityIdSchema.optional(),
  buildingId: aiPlayerTroopFacilityBuildingIdSchema.optional(),
}).strict()

export const aiPlayerRecruitPoolSelectArgsSchema = z.object({
  poolId: aiPlayerRecruitPoolIdSchema.optional(),
}).strict()

export const aiPlayerRecruitCommanderArgsSchema = z.object({
  poolId: aiPlayerRecruitPoolIdSchema.optional(),
  count: z.number().int().min(1).max(10).optional(),
}).strict()

export const aiPlayerWorldScoutArgsSchema = z.object({
  unitId: z.string().trim().min(1).max(64).optional(),
  targetTileId: z.string().trim().min(1).max(64).optional(),
}).strict()

export const aiPlayerMarchMoveArgsSchema = z.object({
  unitId: z.string().trim().min(1).max(64).optional(),
  targetTileId: z.string().trim().min(1).max(64).optional(),
}).strict()

export const aiPlayerGarrisonSetArgsSchema = z.object({
  unitId: z.string().trim().min(1).max(64).optional(),
  targetTileId: z.string().trim().min(1).max(64).optional(),
  summary: z.string().trim().min(1).max(400).optional(),
}).strict()

export const aiPlayerGeneralFocusSetArgsSchema = z.object({
  heroId: z.string().trim().min(1).max(64).optional(),
}).strict()

export const aiPlayerFormationAssignArgsSchema = z.object({
  heroId: z.string().trim().min(1).max(64).optional(),
  tacticId: aiPlayerGeneralTacticIdSchema.optional(),
}).strict()

export const aiPlayerThreatEscapeArgsSchema = z.object({
  mode: aiPlayerThreatEscapeModeSchema.optional(),
}).strict()

export const aiPlayerAllianceHelpArgsSchema = z.object({
  regionId: z.string().trim().min(1).max(64).optional(),
}).strict()

export const aiPlayerResourceGatherArgsSchema = z.object({
  unitId: z.string().trim().min(1).max(120),
  tileId: z.string().trim().min(1).max(120),
}).strict()

export const aiPlayerTileOccupyArgsSchema = z.object({
  unitId: z.string().trim().min(1).max(120).optional(),
  tileId: z.string().trim().min(1).max(120).optional(),
}).strict()

export const aiPlayerTroopHealArgsSchema = z.object({
  unitId: z.string().trim().min(1).max(120).optional(),
}).strict()

export const aiPlayerResourceTransferToGovernorArgsSchema = z.object({
  resources: resourceTransferBundleSchema,
}).strict()

export const aiPlayerRewardClaimArgsSchema = z.object({
  rewardId: z.string().trim().min(1).max(120).optional(),
}).strict()

const aiPlayerActionArgsSchemaByAction = {
  city_upgrade: aiPlayerCityUpgradeArgsSchema,
  building_upgrade: aiPlayerBuildingUpgradeArgsSchema,
  queue_fill_idle_slot: aiPlayerQueueFillIdleSlotArgsSchema,
  research_start: aiPlayerResearchStartArgsSchema,
  troop_train: aiPlayerTroopTrainArgsSchema,
  troop_heal: aiPlayerTroopHealArgsSchema,
  troop_facility_upgrade: aiPlayerTroopFacilityUpgradeArgsSchema,
  recruit_pool_select: aiPlayerRecruitPoolSelectArgsSchema,
  recruit_commander: aiPlayerRecruitCommanderArgsSchema,
  world_scout: aiPlayerWorldScoutArgsSchema,
  march_move: aiPlayerMarchMoveArgsSchema,
  garrison_set: aiPlayerGarrisonSetArgsSchema,
  general_focus_set: aiPlayerGeneralFocusSetArgsSchema,
  formation_assign: aiPlayerFormationAssignArgsSchema,
  threat_escape: aiPlayerThreatEscapeArgsSchema,
  alliance_help: aiPlayerAllianceHelpArgsSchema,
  resource_gather: aiPlayerResourceGatherArgsSchema,
  tile_occupy: aiPlayerTileOccupyArgsSchema,
  resource_transfer_to_governor: aiPlayerResourceTransferToGovernorArgsSchema,
  reward_claim: aiPlayerRewardClaimArgsSchema,
} as const

function resolveAiPlayerActionArgsSchema(action: AiPlayerActionType) {
  switch (action) {
    case 'city_upgrade':
      return aiPlayerActionArgsSchemaByAction.city_upgrade
    case 'building_upgrade':
      return aiPlayerActionArgsSchemaByAction.building_upgrade
    case 'queue_fill_idle_slot':
      return aiPlayerActionArgsSchemaByAction.queue_fill_idle_slot
    case 'research_start':
      return aiPlayerActionArgsSchemaByAction.research_start
    case 'troop_train':
      return aiPlayerActionArgsSchemaByAction.troop_train
    case 'troop_heal':
      return aiPlayerActionArgsSchemaByAction.troop_heal
    case 'troop_facility_upgrade':
      return aiPlayerActionArgsSchemaByAction.troop_facility_upgrade
    case 'recruit_pool_select':
      return aiPlayerActionArgsSchemaByAction.recruit_pool_select
    case 'recruit_commander':
      return aiPlayerActionArgsSchemaByAction.recruit_commander
    case 'world_scout':
      return aiPlayerActionArgsSchemaByAction.world_scout
    case 'march_move':
      return aiPlayerActionArgsSchemaByAction.march_move
    case 'garrison_set':
      return aiPlayerActionArgsSchemaByAction.garrison_set
    case 'general_focus_set':
      return aiPlayerActionArgsSchemaByAction.general_focus_set
    case 'formation_assign':
      return aiPlayerActionArgsSchemaByAction.formation_assign
    case 'threat_escape':
      return aiPlayerActionArgsSchemaByAction.threat_escape
    case 'alliance_help':
      return aiPlayerActionArgsSchemaByAction.alliance_help
    case 'resource_gather':
      return aiPlayerActionArgsSchemaByAction.resource_gather
    case 'tile_occupy':
      return aiPlayerActionArgsSchemaByAction.tile_occupy
    case 'resource_transfer_to_governor':
      return aiPlayerActionArgsSchemaByAction.resource_transfer_to_governor
    case 'reward_claim':
      return aiPlayerActionArgsSchemaByAction.reward_claim
    default:
      return aiPlayerEmptyArgsSchema
  }
}

function appendNestedIssues(
  error: z.ZodError,
  ctx: z.RefinementCtx,
  prefix: (string | number)[],
) {
  for (const issue of error.issues) {
    ctx.addIssue({
      ...issue,
      path: [...prefix, ...issue.path],
    })
  }
}

export function parseAiPlayerActionArgs<T extends AiPlayerActionType>(
  action: T,
  input: unknown,
): AiPlayerActionArgs<T> {
  const schema = resolveAiPlayerActionArgsSchema(action)
  return schema.parse(input ?? {}) as AiPlayerActionArgs<T>
}

export const aiPlayerApprovalPolicySchema = z.object({
  autoApproveLowRisk: z.boolean(),
  autoApproveMediumRisk: z.boolean(),
  requireHumanApprovalForHighRisk: z.boolean(),
})

export const aiPlayerBudgetPolicySchema = z.object({
  maxPendingProposals: z.number().int().min(1).max(1000),
  maxExecutableActionsPerTick: z.number().int().min(1).max(1000),
  maxExecutableActionsPerHour: z.number().int().min(1).max(100000),
  allowHighRiskActions: z.boolean(),
})

export const aiPlayerRuntimePolicySchema = z.object({
  allowLlmProposals: z.boolean(),
  allowRuleProposals: z.boolean(),
  allowMcpExecution: z.boolean(),
  allowCliExecution: z.boolean(),
})

export const aiPlayerContextDocumentKindSchema = z.enum([
  'identity',
  'memory',
  'skill',
  'instruction',
])

export const aiPlayerContextDocumentSchema = z.object({
  documentId: z.string().trim().min(1).max(120),
  kind: aiPlayerContextDocumentKindSchema,
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(12000),
  sourceFileName: z.string().trim().min(1).max(240).optional(),
  contentBytes: z.number().int().nonnegative().max(120000),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
  updatedBy: z.string().trim().min(1).max(80),
})

export const governedAiPlayerSchema = z.object({
  aiPlayerId: z.string().trim().min(1).max(80),
  displayName: z.string().trim().min(1).max(80),
  avatarId: z.string().trim().min(1).max(120).optional(),
  avatarImagePath: z.string().trim().min(1).max(240).optional(),
  governorPlayerId: z.string().trim().min(1).max(80),
  factionId: z.string().trim().min(1).max(64),
  enabled: z.boolean(),
  paused: z.boolean(),
  actionWhitelist: z.array(aiPlayerActionTypeSchema).min(1).max(64),
  approvalPolicy: aiPlayerApprovalPolicySchema,
  budgetPolicy: aiPlayerBudgetPolicySchema,
  runtimePolicy: aiPlayerRuntimePolicySchema,
  contextDocuments: z.array(aiPlayerContextDocumentSchema).max(16).default([]),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
})

export const aiPlayerBudgetSnapshotSchema = z.object({
  actionPointsRemaining: z.number().int(),
  foodRemaining: z.number().int(),
  aiQuota: factionAiQuotaSchema.nullable(),
})

const resourceTransferBundleSnapshotSchema = z.object({
  food: z.number().int().nonnegative(),
  wood: z.number().int().nonnegative(),
  stone: z.number().int().nonnegative(),
  iron: z.number().int().nonnegative(),
})

const aiResourceTransferPolicyStateSchema = z.object({
  dailyQuotaTotal: z.number().int().positive().optional(),
  dailyWindowTicks: z.number().int().positive().optional(),
  cooldownTicks: z.number().int().nonnegative().optional(),
})

const aiResourceTransferEffectivePolicySchema = z.object({
  dailyQuotaTotal: z.number().int().positive(),
  dailyWindowTicks: z.number().int().positive(),
  cooldownTicks: z.number().int().nonnegative(),
})

const aiResourceTransferQuotaStateSchema = z.object({
  aiPlayerId: z.string().trim().min(1).max(80),
  governorPlayerId: z.string().trim().min(1).max(80),
  factionId: z.string().trim().min(1).max(64),
  windowStartedTick: z.number().int().nonnegative(),
  windowEndsTick: z.number().int().nonnegative(),
  dailyQuotaTotal: z.number().int().positive(),
  transferredTotal: z.number().int().nonnegative(),
  transferredResources: resourceTransferBundleSnapshotSchema,
  lastTransferTick: z.number().int().nonnegative().optional(),
  cooldownUntilTick: z.number().int().nonnegative().optional(),
})

export const aiPlayerResourceTransferRuntimeSchema = z.object({
  configuredPolicy: aiResourceTransferPolicyStateSchema.nullable(),
  effectivePolicy: aiResourceTransferEffectivePolicySchema,
  quota: aiResourceTransferQuotaStateSchema.nullable(),
  remainingQuotaTotal: z.number().int().nonnegative(),
  cooldownRemainingTicks: z.number().int().nonnegative(),
  windowRemainingTicks: z.number().int().nonnegative(),
  canTransferNow: z.boolean(),
  blockedBy: z.enum(['daily_quota_exceeded', 'transfer_cooldown_active']).nullable(),
})

export const aiPlayerProposalStatsSchema = z.object({
  pendingApprovalCount: z.number().int().nonnegative(),
  approvedCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  executedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
})

export const aiPlayerGovernancePersistHealthSchema = z.object({
  path: z.string().trim().min(1),
  enabled: z.boolean(),
  loaded: z.boolean(),
  playerCount: z.number().int().nonnegative(),
  pausedPlayerCount: z.number().int().nonnegative(),
  disabledPlayerCount: z.number().int().nonnegative(),
  proposalCount: z.number().int().nonnegative(),
  pendingProposalCount: z.number().int().nonnegative(),
  receiptCount: z.number().int().nonnegative(),
  persistDirty: z.boolean(),
  persistInFlight: z.boolean(),
  persistSuccessCount: z.number().int().nonnegative(),
  persistFailureCount: z.number().int().nonnegative(),
  lastPersistAt: z.number().int().nonnegative().nullable(),
  lastPersistErrorAt: z.number().int().nonnegative().nullable(),
  corruptQuarantineCount: z.number().int().nonnegative(),
  lastCorruptQuarantineAt: z.number().int().nonnegative().nullable(),
  restoredPlayerCount: z.number().int().nonnegative(),
  restoredProposalCount: z.number().int().nonnegative(),
  restoredReceiptCount: z.number().int().nonnegative(),
  lastRestoreAt: z.number().int().nonnegative().nullable(),
  persistVersion: z.number().int().positive(),
})

export const aiPlayerAdvanceTickPhaseSummarySchema = z.object({
  phase: z.string().trim().min(1).max(120),
  durationMs: z.number().nonnegative(),
})

export const aiPlayerAdvanceTickSubphaseSummarySchema = z.object({
  phase: z.string().trim().min(1).max(120),
  subphase: z.string().trim().min(1).max(240),
  durationMs: z.number().nonnegative(),
})

export const aiPlayerRuntimeObservabilitySummarySchema = z.object({
  generatedAt: z.string().trim().min(1),
  factionId: z.string().trim().min(1).max(64),
  lock: aiRuntimeObservabilityLockSchema,
  lastFailure: aiRuntimeFailureRecordSchema.optional(),
  recentFailures: aiRuntimeFailureAggregationSchema,
  recentLockConflicts: aiRuntimeLockConflictAggregationSchema,
  topAdvanceTickPhasesByLast: z.array(aiPlayerAdvanceTickPhaseSummarySchema),
  topAdvanceTickSubphasesByLast: z.array(aiPlayerAdvanceTickSubphaseSummarySchema),
  recentEventActions: z.array(z.string().trim().min(1).max(120)),
})

export const aiPlayerModelRoutingSourceSchema = z.enum(['default', 'env', 'faction_config', 'player_config', 'fallback'])

export const aiPlayerModelBudgetTierSchema = z.enum(['strict_action', 'economy_chat', 'disabled'])

export const aiPlayerModelByokSourceSchema = z.enum(['none', 'faction_config', 'player_config'])

export const aiPlayerModelTargetCandidateSchema = z.object({
  model: z.string().trim().min(1).max(160),
  provider: z.string().trim().min(1).max(160),
  source: aiPlayerModelRoutingSourceSchema,
  byokSource: aiPlayerModelByokSourceSchema,
  priority: z.number().int().nonnegative(),
  isActive: z.boolean(),
  fallbackCandidate: z.boolean(),
  strictJsonOnlyCapable: z.boolean(),
  budgetTier: aiPlayerModelBudgetTierSchema,
  lastFailureReason: z.string().trim().min(1).max(240).nullable(),
  secretConfigured: z.boolean(),
  secretSource: z.string().trim().min(1).max(120).nullable(),
})

export const aiPlayerModelStatusSchema = z.object({
  activeModel: z.string().trim().min(1).max(160),
  activeProvider: z.string().trim().min(1).max(160),
  source: aiPlayerModelRoutingSourceSchema,
  strictJsonOnlyCapable: z.boolean(),
  budgetTier: aiPlayerModelBudgetTierSchema,
  fallbackEnabled: z.boolean(),
  fallbackModel: z.string().trim().min(1).max(160).nullable(),
  lastFallbackReason: z.string().trim().min(1).max(240).nullable(),
  secretConfigured: z.boolean(),
  secretSource: z.string().trim().min(1).max(120).nullable(),
  byokSource: aiPlayerModelByokSourceSchema,
  targetCount: z.number().int().nonnegative(),
  candidateTargets: z.array(aiPlayerModelTargetCandidateSchema).max(8),
})

export const aiPlayerRecoveryHintSchema = z.object({
  summary: z.string().trim().min(1).max(500),
  recommendedCommand: z.string().trim().min(1).max(500).optional(),
  focus: z.enum(['approval', 'resources', 'cooldown', 'inbox', 'retry', 'none']).optional(),
})

export const aiPlayerActionReceiptSchema = z.object({
  proposalId: z.string().trim().min(1).max(120),
  aiPlayerId: z.string().trim().min(1).max(80),
  governorPlayerId: z.string().trim().min(1).max(80),
  factionId: z.string().trim().min(1).max(64),
  action: aiPlayerActionTypeSchema,
  worldAction: z.string().trim().min(1).max(120).nullable(),
  worldActionPayload: z.record(z.string(), z.unknown()).optional(),
  actionRequestId: z.string().trim().min(1).max(160).nullable(),
  ok: z.boolean(),
  failureCode: z.string().trim().min(1).max(120).nullable().default(null),
  message: z.string().trim().min(1).max(1000).optional(),
  execution: z.unknown().nullable().default(null),
  observedAt: z.string().trim().min(1),
  recoveryHint: aiPlayerRecoveryHintSchema.optional(),
})

export const governedAiPlayerRuntimeSchema = governedAiPlayerSchema.extend({
  modelName: z.string().trim().min(1).max(160),
  modelSource: z.enum(['env', 'default']),
  modelStatus: aiPlayerModelStatusSchema,
  autonomyLevel: sessionAutonomyLevelSchema,
  controlMode: sessionControlModeSchema,
  online: z.boolean(),
  seatCount: z.number().int().nonnegative(),
  onlineSeatCount: z.number().int().nonnegative(),
  playerNames: z.array(z.string()),
  governorOnline: z.boolean(),
  budget: aiPlayerBudgetSnapshotSchema,
  resourceTransfer: aiPlayerResourceTransferRuntimeSchema,
  proposalStats: aiPlayerProposalStatsSchema,
  latestProposalId: z.string().trim().min(1).max(120).optional(),
  latestReceipt: aiPlayerActionReceiptSchema.optional(),
})

export const governedAiPlayerRuntimeDetailSchema = governedAiPlayerRuntimeSchema.extend({
  persistence: aiPlayerGovernancePersistHealthSchema,
  observability: aiPlayerRuntimeObservabilitySummarySchema,
})

const aiPlayerActionProposalBaseSchema = z.object({
  proposalId: z.string().trim().min(1).max(120),
  aiPlayerId: z.string().trim().min(1).max(80),
  governorPlayerId: z.string().trim().min(1).max(80),
  factionId: z.string().trim().min(1).max(64),
  action: aiPlayerActionTypeSchema,
  args: z.unknown(),
  reason: z.string().trim().min(1).max(1000),
  riskLevel: aiPlayerActionRiskLevelSchema,
  source: aiPlayerProposalSourceSchema,
  status: aiPlayerProposalStatusSchema,
  requiresApproval: z.boolean(),
  executableInV1: z.boolean(),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
  approvedAt: z.string().trim().min(1).optional(),
  approvedBy: z.string().trim().min(1).max(80).optional(),
  rejectedAt: z.string().trim().min(1).optional(),
  rejectedBy: z.string().trim().min(1).max(80).optional(),
  rejectionReason: z.string().trim().min(1).max(400).optional(),
  executedAt: z.string().trim().min(1).optional(),
  executedBy: z.string().trim().min(1).max(80).optional(),
  worldAction: z.string().trim().min(1).max(120).optional(),
  worldActionPayload: z.record(z.string(), z.unknown()).optional(),
  recoveryHint: aiPlayerRecoveryHintSchema.optional(),
})

export const aiPlayerActionProposalSchema = aiPlayerActionProposalBaseSchema
  .superRefine((value, ctx) => {
    const parsedArgs = resolveAiPlayerActionArgsSchema(value.action).safeParse(value.args)
    if (!parsedArgs.success) {
      appendNestedIssues(parsedArgs.error, ctx, ['args'])
    }
  })
  .transform((value) => ({
    ...value,
    args: parseAiPlayerActionArgs(value.action, value.args),
  }))

export const createGovernedAiPlayerRequestSchema = z.object({
  aiPlayerId: z.string().trim().min(1).max(80),
  displayName: z.string().trim().min(1).max(80),
  avatarId: z.string().trim().min(1).max(120).optional(),
  avatarImagePath: z.string().trim().min(1).max(240).optional(),
  governorPlayerId: z.string().trim().min(1).max(80),
  factionId: z.string().trim().min(1).max(64),
  enabled: z.boolean().optional(),
  paused: z.boolean().optional(),
  actionWhitelist: z.array(aiPlayerActionTypeSchema).min(1).max(64).optional(),
  approvalPolicy: aiPlayerApprovalPolicySchema.partial().optional(),
  budgetPolicy: aiPlayerBudgetPolicySchema.partial().optional(),
  runtimePolicy: aiPlayerRuntimePolicySchema.partial().optional(),
  contextDocuments: z.array(aiPlayerContextDocumentSchema).max(16).optional(),
})

export const updateGovernedAiPlayerStatusRequestSchema = z.object({
  updatedBy: z.string().trim().min(1).max(80),
})

export const updateGovernedAiPlayerProfileRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  avatarId: z.string().trim().min(1).max(120).optional(),
  avatarImagePath: z.string().trim().min(1).max(240).optional(),
  updatedBy: z.string().trim().min(1).max(80),
}).refine(
  (value) => value.displayName !== undefined || value.avatarId !== undefined || value.avatarImagePath !== undefined,
  { message: 'displayName, avatarId or avatarImagePath is required' },
)

export const upsertAiPlayerContextDocumentRequestSchema = z.object({
  documentId: z.string().trim().min(1).max(120).optional(),
  kind: aiPlayerContextDocumentKindSchema,
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(12000),
  sourceFileName: z.string().trim().min(1).max(240).optional(),
  updatedBy: z.string().trim().min(1).max(80),
})

const aiPlayerActionProposalRequestBaseSchema = z.object({
  aiPlayerId: z.string().trim().min(1).max(80),
  action: aiPlayerActionTypeSchema,
  args: z.unknown().optional(),
  reason: z.string().trim().min(1).max(1000),
  source: aiPlayerProposalSourceSchema,
})

export const aiPlayerActionProposalRequestSchema = aiPlayerActionProposalRequestBaseSchema
  .superRefine((value, ctx) => {
    const parsedArgs = resolveAiPlayerActionArgsSchema(value.action).safeParse(value.args ?? {})
    if (!parsedArgs.success) {
      appendNestedIssues(parsedArgs.error, ctx, ['args'])
    }
  })
  .transform((value) => ({
    ...value,
    args: parseAiPlayerActionArgs(value.action, value.args ?? {}),
  }))

export const approveAiPlayerProposalRequestSchema = z.object({
  approvedBy: z.string().trim().min(1).max(80),
})

export const rejectAiPlayerProposalRequestSchema = z.object({
  rejectedBy: z.string().trim().min(1).max(80),
  rejectionReason: z.string().trim().min(1).max(400).optional(),
})

export const executeAiPlayerProposalRequestSchema = z.object({
  executedBy: z.string().trim().min(1).max(80),
  includeWorld: z.boolean().optional(),
})

export const aiPlayerActionCatalogResponseSchema = z.object({
  catalog: z.array(aiPlayerActionCatalogEntrySchema),
})

export const listGovernedAiPlayersResponseSchema = z.object({
  items: z.array(governedAiPlayerRuntimeSchema),
  count: z.number().int().nonnegative(),
})

export const listAiPlayerProposalsResponseSchema = z.object({
  items: z.array(aiPlayerActionProposalSchema),
  count: z.number().int().nonnegative(),
})

export const listAiPlayerReceiptsResponseSchema = z.object({
  items: z.array(aiPlayerActionReceiptSchema),
  count: z.number().int().nonnegative(),
})

export const governedAiPlayerMutationResponseSchema = z.object({
  ok: z.boolean(),
  player: governedAiPlayerRuntimeDetailSchema.optional(),
  error: z.string().trim().min(1).optional(),
})

export const aiPlayerProposalMutationResponseSchema = z.object({
  ok: z.boolean(),
  proposal: aiPlayerActionProposalSchema.optional(),
  receipt: aiPlayerActionReceiptSchema.optional(),
  failureCode: z.string().trim().min(1).max(120).nullable().optional(),
  recoveryHint: aiPlayerRecoveryHintSchema.optional(),
  error: z.string().trim().min(1).optional(),
})

export function parseCreateGovernedAiPlayerRequest(input: unknown): CreateGovernedAiPlayerRequest {
  return createGovernedAiPlayerRequestSchema.parse(input) as CreateGovernedAiPlayerRequest
}

export function parseUpdateGovernedAiPlayerStatusRequest(input: unknown): UpdateGovernedAiPlayerStatusRequest {
  return updateGovernedAiPlayerStatusRequestSchema.parse(input) as UpdateGovernedAiPlayerStatusRequest
}

export function parseUpdateGovernedAiPlayerProfileRequest(input: unknown): UpdateGovernedAiPlayerProfileRequest {
  return updateGovernedAiPlayerProfileRequestSchema.parse(input) as UpdateGovernedAiPlayerProfileRequest
}

export function parseUpsertAiPlayerContextDocumentRequest(input: unknown): UpsertAiPlayerContextDocumentRequest {
  return upsertAiPlayerContextDocumentRequestSchema.parse(input) as UpsertAiPlayerContextDocumentRequest
}

export function parseAiPlayerActionProposalRequest(input: unknown): AiPlayerActionProposalRequest {
  return aiPlayerActionProposalRequestSchema.parse(input) as AiPlayerActionProposalRequest
}

export function parseApproveAiPlayerProposalRequest(input: unknown): ApproveAiPlayerProposalRequest {
  return approveAiPlayerProposalRequestSchema.parse(input) as ApproveAiPlayerProposalRequest
}

export function parseRejectAiPlayerProposalRequest(input: unknown): RejectAiPlayerProposalRequest {
  return rejectAiPlayerProposalRequestSchema.parse(input) as RejectAiPlayerProposalRequest
}

export function parseExecuteAiPlayerProposalRequest(input: unknown): ExecuteAiPlayerProposalRequest {
  return executeAiPlayerProposalRequestSchema.parse(input) as ExecuteAiPlayerProposalRequest
}
