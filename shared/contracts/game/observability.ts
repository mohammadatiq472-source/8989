import type { WorldEventRecord, WebSocketObservabilityStats } from './history'
import type { SessionAutonomyLevel, SessionControlMode } from './session'
import type { FactionAiQuota, SlgAiAgendaState, SlgAiContextMemorySummary, SlgAiExecutionState } from './world'

export type AiRuntimeCategoryStats = {
  total: number
  byCategory: Record<string, number>
}

export type AiRuntimeBudgetSnapshot = {
  actionPointsRemaining: number
  foodRemaining: number
  aiQuota: FactionAiQuota | null
}

export type AiRuntimeFailureRecord = {
  category: WorldEventRecord['category']
  action: string
  tick: number
  worldVersion: number
  createdAt: string
  factionId?: string
  requestId?: string
  message?: string
  failureCode?: string
  conflictCategory?: string
  holder?: string
}

export type AiRuntimeFailureAggregation = {
  totalRecentFailures: number
  byAction: Record<string, number>
  byFailureCode: Record<string, number>
  byFaction: Record<string, number>
  samples: AiRuntimeFailureRecord[]
}

export type AiRuntimeLockConflictAggregation = {
  totalRecentConflicts: number
  byAction: Record<string, number>
  byHolder: Record<string, number>
  samples: AiRuntimeFailureRecord[]
}

export type AiRuntimeObservabilityLock = {
  busy: boolean
  holder: string | null
}

export type AiRuntimeAdvanceTickPhaseTiming = {
  phase: string
  durationMs: number
  subphases?: AiRuntimeAdvanceTickSubphaseTiming[]
}

export type AiRuntimeAdvanceTickSubphaseTiming = {
  subphase: string
  durationMs: number
}

export type AiRuntimeAdvanceTickSubphaseStats = {
  runs: number
  lastDurationMs: number
  avgDurationMs: number
  maxDurationMs: number
}

export type AiRuntimeAdvanceTickPhaseStats = {
  runs: number
  lastDurationMs: number
  avgDurationMs: number
  maxDurationMs: number
  subphaseStats?: Record<string, AiRuntimeAdvanceTickSubphaseStats>
}

export type AiRuntimeAdvanceTickRun = {
  outcome: 'success' | 'runtime_error'
  startedAt: string
  completedAt: string
  tickBefore: number
  tickAfter: number
  worldVersionBefore: number
  worldVersionAfter: number
  totalDurationMs: number
  slowestPhase: string | null
  slowestPhaseDurationMs: number | null
  phases: AiRuntimeAdvanceTickPhaseTiming[]
  narrativeEvents: number
  memoryWrites: number
  memoryWriteFailures: number
  battleReportsBroadcast: number
  errorName?: string
  errorMessage?: string
}

export type AiRuntimeAdvanceTickPerformance = {
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  lastOutcome: AiRuntimeAdvanceTickRun['outcome'] | null
  lastCompletedAt?: string
  lastTotalDurationMs?: number
  avgTotalDurationMs?: number
  maxTotalDurationMs?: number
  phaseStats: Record<string, AiRuntimeAdvanceTickPhaseStats>
  recentRuns: AiRuntimeAdvanceTickRun[]
}

export type AiRuntimeObservabilitySessionMetrics = {
  activeSessions: number
  onlineSessions: number
  delegatedSessions: number
  claimedFactions: number
  maxActiveSessions: number
  maxSeatsPerFaction: number
  heartbeatTimeoutMs: number
  staleSessionTtlMs: number
  tokenMaxAgeMs: number
  maxPlayerNameLength: number
}

export type AiRuntimeObservabilityFaction = {
  factionId: string
  autonomyLevel: SessionAutonomyLevel
  controlMode: SessionControlMode
  playerNames: string[]
  online: boolean
  seatCount: number
  onlineSeatCount: number
  contextFocusId?: string
  contextMemorySummary?: SlgAiContextMemorySummary
  agenda?: SlgAiAgendaState
  execution?: SlgAiExecutionState
  budget: AiRuntimeBudgetSnapshot
  lastAgendaActionId?: string
  updatedTick?: number
  updatedWorldVersion?: number
  lastFailure?: AiRuntimeFailureRecord
}

export type AiRuntimeObservabilityResponse = {
  tick: number
  worldVersion: number
  generatedAt: string
  factionFilter?: string
  runtime: {
    lock: AiRuntimeObservabilityLock
    queuePlanFailureStats: AiRuntimeCategoryStats
    queuePlanConflictStats: AiRuntimeCategoryStats
    advanceTickFailureStats: AiRuntimeCategoryStats
    advanceTickPerformance: AiRuntimeAdvanceTickPerformance
    recentFailures: AiRuntimeFailureAggregation
    lockConflicts: AiRuntimeLockConflictAggregation
    sessionMetrics: AiRuntimeObservabilitySessionMetrics
    wsStats: WebSocketObservabilityStats
  }
  factions: AiRuntimeObservabilityFaction[]
  recentEvents: WorldEventRecord[]
}
