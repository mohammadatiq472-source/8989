import { z } from 'zod'
import { worldEventRecordSchema, webSocketObservabilityStatsSchema } from './history'
import { sessionAutonomyLevelSchema, sessionControlModeSchema } from './session'

export const factionAiQuotaSchema = z.object({
  initialQuota: z.number().int(),
  currentQuota: z.number().int(),
  maxQuota: z.number().int(),
  growthScore: z.number().int(),
  tugIntensity: z.number().int(),
  nextUnlockScore: z.number().int().nullable(),
  lastGrowthTick: z.number().int().optional(),
})

export const slgAiContextMemorySummarySchema = z.object({
  focusId: z.string().optional(),
  relatedId: z.string().optional(),
  lines: z.array(z.string()).optional(),
  updatedTick: z.number().int().optional(),
})

export const slgAiAgendaOptionSchema = z.object({
  actionId: z.string(),
  intent: z.string().optional(),
  label: z.string(),
  summary: z.string().optional(),
  priority: z.string().optional(),
  targetTileId: z.string().optional(),
  targetUnitIds: z.array(z.string()).optional(),
  supportingAiPlayerIds: z.array(z.string()).optional(),
  evidenceRefs: z.array(z.string()).optional(),
  supportCount: z.number().int(),
  recommendedFollowups: z.array(z.string()).optional(),
})

export const slgAiAgendaStateSchema = z.object({
  source: z.string(),
  summary: z.string().optional(),
  options: z.array(slgAiAgendaOptionSchema).optional(),
  optionActionIds: z.array(z.string()).optional(),
  optionLabels: z.array(z.string()).optional(),
  optionTargetTileIds: z.array(z.string()).optional(),
  optionSupportCounts: z.array(z.number().int()).optional(),
  targetTileId: z.string().optional(),
  targetUnitIds: z.array(z.string()).optional(),
  executionRequestId: z.string().optional(),
  recommendedFollowups: z.array(z.string()).optional(),
  updatedTick: z.number().int().optional(),
  updatedWorldVersion: z.number().int().optional(),
})

export const slgAiExecutionStateSchema = z.object({
  status: z.enum(['idle', 'queued', 'running']),
  activeOrderCount: z.number().int(),
  queuedOrderCount: z.number().int(),
  runningOrderCount: z.number().int(),
  actionPointsRemaining: z.number().int(),
  foodRemaining: z.number().int(),
  requestId: z.string().optional(),
  basedOnWorldVersion: z.number().int().optional(),
  reviewAtTick: z.number().int().optional(),
  strategicCommand: z.string().optional(),
  source: z.enum(['mock', 'local', 'gateway']).optional(),
  updatedTick: z.number().int(),
  updatedWorldVersion: z.number().int(),
})

export const aiRuntimeCategoryStatsSchema = z.object({
  total: z.number().int().nonnegative(),
  byCategory: z.record(z.string(), z.number().int().nonnegative()),
})

export const aiRuntimeBudgetSnapshotSchema = z.object({
  actionPointsRemaining: z.number().int(),
  foodRemaining: z.number().int(),
  aiQuota: factionAiQuotaSchema.nullable(),
})

export const aiRuntimeFailureRecordSchema = z.object({
  category: z.enum(['world_action', 'planning', 'replay', 'persistence', 'system']),
  action: z.string(),
  tick: z.number().int(),
  worldVersion: z.number().int(),
  createdAt: z.string(),
  factionId: z.string().optional(),
  requestId: z.string().optional(),
  message: z.string().optional(),
  failureCode: z.string().optional(),
  conflictCategory: z.string().optional(),
  holder: z.string().optional(),
})

export const aiRuntimeFailureAggregationSchema = z.object({
  totalRecentFailures: z.number().int().nonnegative(),
  byAction: z.record(z.string(), z.number().int().nonnegative()),
  byFailureCode: z.record(z.string(), z.number().int().nonnegative()),
  byFaction: z.record(z.string(), z.number().int().nonnegative()),
  samples: z.array(aiRuntimeFailureRecordSchema),
})

export const aiRuntimeLockConflictAggregationSchema = z.object({
  totalRecentConflicts: z.number().int().nonnegative(),
  byAction: z.record(z.string(), z.number().int().nonnegative()),
  byHolder: z.record(z.string(), z.number().int().nonnegative()),
  samples: z.array(aiRuntimeFailureRecordSchema),
})

export const aiRuntimeObservabilityLockSchema = z.object({
  busy: z.boolean(),
  holder: z.string().nullable(),
})

export const aiRuntimeAdvanceTickPhaseTimingSchema = z.object({
  phase: z.string(),
  durationMs: z.number().nonnegative(),
  subphases: z.array(z.object({
    subphase: z.string(),
    durationMs: z.number().nonnegative(),
  })).optional(),
})

export const aiRuntimeAdvanceTickSubphaseStatsSchema = z.object({
  runs: z.number().int().nonnegative(),
  lastDurationMs: z.number().nonnegative(),
  avgDurationMs: z.number().nonnegative(),
  maxDurationMs: z.number().nonnegative(),
})

export const aiRuntimeAdvanceTickPhaseStatsSchema = z.object({
  runs: z.number().int().nonnegative(),
  lastDurationMs: z.number().nonnegative(),
  avgDurationMs: z.number().nonnegative(),
  maxDurationMs: z.number().nonnegative(),
  subphaseStats: z.record(z.string(), aiRuntimeAdvanceTickSubphaseStatsSchema).optional(),
})

export const aiRuntimeAdvanceTickRunSchema = z.object({
  outcome: z.enum(['success', 'runtime_error']),
  startedAt: z.string(),
  completedAt: z.string(),
  tickBefore: z.number().int().nonnegative(),
  tickAfter: z.number().int().nonnegative(),
  worldVersionBefore: z.number().int().nonnegative(),
  worldVersionAfter: z.number().int().nonnegative(),
  totalDurationMs: z.number().nonnegative(),
  slowestPhase: z.string().nullable(),
  slowestPhaseDurationMs: z.number().nonnegative().nullable(),
  phases: z.array(aiRuntimeAdvanceTickPhaseTimingSchema),
  narrativeEvents: z.number().int().nonnegative(),
  memoryWrites: z.number().int().nonnegative(),
  memoryWriteFailures: z.number().int().nonnegative(),
  battleReportsBroadcast: z.number().int().nonnegative(),
  errorName: z.string().optional(),
  errorMessage: z.string().optional(),
})

export const aiRuntimeAdvanceTickPerformanceSchema = z.object({
  totalRuns: z.number().int().nonnegative(),
  successfulRuns: z.number().int().nonnegative(),
  failedRuns: z.number().int().nonnegative(),
  lastOutcome: z.enum(['success', 'runtime_error']).nullable(),
  lastCompletedAt: z.string().optional(),
  lastTotalDurationMs: z.number().nonnegative().optional(),
  avgTotalDurationMs: z.number().nonnegative().optional(),
  maxTotalDurationMs: z.number().nonnegative().optional(),
  phaseStats: z.record(z.string(), aiRuntimeAdvanceTickPhaseStatsSchema),
  recentRuns: z.array(aiRuntimeAdvanceTickRunSchema),
})

export const aiRuntimeObservabilitySessionMetricsSchema = z.object({
  activeSessions: z.number().int().nonnegative(),
  onlineSessions: z.number().int().nonnegative(),
  delegatedSessions: z.number().int().nonnegative(),
  claimedFactions: z.number().int().nonnegative(),
  maxActiveSessions: z.number().int().positive(),
  maxSeatsPerFaction: z.number().int().positive(),
  heartbeatTimeoutMs: z.number().int().positive(),
  staleSessionTtlMs: z.number().int().positive(),
  tokenMaxAgeMs: z.number().int().positive(),
  maxPlayerNameLength: z.number().int().positive(),
})

export const aiRuntimeObservabilityFactionSchema = z.object({
  factionId: z.string(),
  autonomyLevel: sessionAutonomyLevelSchema,
  controlMode: sessionControlModeSchema,
  playerNames: z.array(z.string()),
  online: z.boolean(),
  seatCount: z.number().int().nonnegative(),
  onlineSeatCount: z.number().int().nonnegative(),
  contextFocusId: z.string().optional(),
  contextMemorySummary: slgAiContextMemorySummarySchema.optional(),
  agenda: slgAiAgendaStateSchema.optional(),
  execution: slgAiExecutionStateSchema.optional(),
  budget: aiRuntimeBudgetSnapshotSchema,
  lastAgendaActionId: z.string().optional(),
  updatedTick: z.number().int().optional(),
  updatedWorldVersion: z.number().int().optional(),
  lastFailure: aiRuntimeFailureRecordSchema.optional(),
})

export const aiRuntimeObservabilityResponseSchema = z.object({
  tick: z.number().int(),
  worldVersion: z.number().int(),
  generatedAt: z.string(),
  factionFilter: z.string().optional(),
  runtime: z.object({
    lock: aiRuntimeObservabilityLockSchema,
    queuePlanFailureStats: aiRuntimeCategoryStatsSchema,
    queuePlanConflictStats: aiRuntimeCategoryStatsSchema,
    advanceTickFailureStats: aiRuntimeCategoryStatsSchema,
    advanceTickPerformance: aiRuntimeAdvanceTickPerformanceSchema,
    recentFailures: aiRuntimeFailureAggregationSchema,
    lockConflicts: aiRuntimeLockConflictAggregationSchema,
    sessionMetrics: aiRuntimeObservabilitySessionMetricsSchema,
    wsStats: webSocketObservabilityStatsSchema,
  }),
  factions: z.array(aiRuntimeObservabilityFactionSchema),
  recentEvents: z.array(worldEventRecordSchema),
})
