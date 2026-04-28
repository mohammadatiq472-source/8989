import type { PlanningJobHistoryEntry, StrategicPlan } from './planning'
import type {
  ActionType,
  ExecutionReplayOutcome,
  FactionId,
  OrderStatus,
  PlanSource,
  ReplayHighlightKind,
  ReplayHighlightSeverity,
} from './common'
import type { CivilMemoryEntry } from '../civilMemory'

export type AllianceActionSummary = {
  id: string
  tick: number
  regionId: string
  title: string
  detail: string
  severity: ReplayHighlightSeverity
  unitId?: string
  tileId?: string
  fromTileId?: string
  toTileId?: string
  factionId?: FactionId
}

export type BattleOutcomeRecord = {
  id: string
  tick: number
  regionId: string
  tileId: string
  attackerFaction: FactionId
  attackerUnitId: string
  outcome: 'win' | 'loss' | 'draw'
  attackerLoss: number
  defenderLoss: number
  alliedSupport: number
  summary: string
}

export type DiplomacyAgreementType = 'ceasefire' | 'alliance' | 'trade'

export type DiplomacyAgreement = {
  id: string
  tick: number
  type: DiplomacyAgreementType
  parties: [string, string]
  duration: number
  terms: string
}

export type OperationalFeedback = {
  allianceActions: AllianceActionSummary[]
  battleRecords: BattleOutcomeRecord[]
  diplomacyAgreements: DiplomacyAgreement[]
  /** 游戏是否已结束（advanceTick 调用 checkVictoryConditions 后写入） */
  gameEnded?: {
    winner: string
    condition: string | null
    reason: string
  }
}
export type Report = {
  id: string
  tick: number
  title: string
  detail: string
}

export type NarrativeEvent = {
  id: string
  tick: number
  type: 'battle' | 'diplomacy' | 'betrayal' | 'achievement' | 'failure'
  actors: string[]
  summary: string
  causalChain: string[]
  consequences: string[]
  significance: 'minor' | 'major' | 'epic'
}

export type NarrativeEventsResponse = {
  items: NarrativeEvent[]
}

export type ReplayOrderSnapshot = {
  orderId: string
  unitId: string
  action: ActionType
  target: string
  status: OrderStatus
  message?: string
}

export type ReplayHighlight = {
  id: string
  kind: ReplayHighlightKind
  severity: ReplayHighlightSeverity
  title: string
  detail: string
  unitId?: string
  tileId?: string
  fromTileId?: string
  toTileId?: string
  factionId?: FactionId
}

export type ExecutionReplayFrame = {
  tick: number
  worldVersion: number
  label: string
  frontlineSummary: string
  latestReports: string[]
  highlights: ReplayHighlight[]
  orderStates: ReplayOrderSnapshot[]
}

export type ExecutionReplay = {
  requestId: string
  source: PlanSource
  strategicCommand: string
  basedOnWorldVersion: number
  createdTick: number
  createdWorldVersion: number
  reviewAtTick: number
  plannerNote?: string
  plannerExplanation?: string
  planningRationale?: string[]
  plan: StrategicPlan
  outcome: ExecutionReplayOutcome
  completedTick?: number
  completedWorldVersion?: number
  frames: ExecutionReplayFrame[]
}

export type HistoryState = {
  planningJobs: PlanningJobHistoryEntry[]
  executionReplays: ExecutionReplay[]
}
export type WorldEventCategory =
  | 'world_action'
  | 'planning'
  | 'replay'
  | 'persistence'
  | 'system'

export type WorldEventRecord = {
  id: string
  category: WorldEventCategory
  action: string
  success: boolean
  tick: number
  worldVersion: number
  createdAt: string
  requestId?: string
  message?: string
  metadata?: Record<string, unknown>
}

export type ReplayArchiveEntry = {
  requestId: string
  source: PlanSource
  strategicCommand: string
  basedOnWorldVersion: number
  outcome: ExecutionReplayOutcome
  frameCount: number
  createdAt: string
  updatedAt: string
}

export type ReplayArchiveResponse = {
  items: ReplayArchiveEntry[]
}

export type WebSocketObservabilityError = {
  at: string
  stage: string
  factionId: string | null
  message: string
}

export type WebSocketObservabilityStats = {
  totalConnections: number
  subscribedConnections: number
  factionDistribution: Record<string, number>
  recentErrors: WebSocketObservabilityError[]
  maxConnections: number
  maxSubscriptionsPerFaction: number
  maxVisibleEventsPerTick: number
  maxVisibleUnitChangesPerTick: number
  maxVisibleTileChangesPerTick: number
  rejectedConnections: number
  rejectedSubscriptions: number
  truncatedTickDeltaMessages: number
}

export type WorldEventsResponse = {
  items: WorldEventRecord[]
  wsStats?: WebSocketObservabilityStats
}

export type MemoryProviderRequested = 'mem0' | 'in_memory'
export type MemoryProviderActive = MemoryProviderRequested | 'unknown'
export type MemoryProviderLifecycle = 'uninitialized' | 'ready' | 'degraded'

export type MemoryProviderObservability = {
  requestedProvider: MemoryProviderRequested
  activeProvider: MemoryProviderActive
  lifecycle: MemoryProviderLifecycle
  downgraded: boolean
  reason?: string
  updatedAt: string
}

export type CivilMemoryObservabilityResponse = {
  items: CivilMemoryEntry[]
  memoryProvider: MemoryProviderObservability
}

export type SaveSlotRecord = {
  slotId: string
  label: string
  tick: number
  worldVersion: number
  savedAt: string
}

export type SaveSlotsResponse = {
  slots: SaveSlotRecord[]
}

export type SaveWorldSlotRequest = {
  slotId: string
  label?: string
}

export type LoadWorldSlotRequest = {
  slotId: string
}
