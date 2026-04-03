import type { PlannerConfig } from './ai'
import type { AllianceActionSummary, BattleOutcomeRecord } from './history'
import type { RegionSnapshot } from './meta'
import type { AlliedCommander, AllianceDirective, FactionState } from './world'
import type {
  ActionType,
  FactionId,
  GeneralDirectivePreviewItem,
  IntelligenceLevel,
  OrderStatus,
  PlanSource,
  PlannerMode,
  PlanningJobStatus,
  RegionPriority,
  TileOwner,
  TileType,
  UnitStatus,
} from './common'

export type GeneralDirectivePreviewResponse = {
  ok: boolean
  tick: number
  worldVersion: number
  side: FactionId
  accepted: number
  rejected: number
  warnings: string[]
  items: GeneralDirectivePreviewItem[]
  mergedPlan: StrategicPlan
}
export type StructuredOrder = {
  unitId: string
  action: ActionType
  target: string
}

export type StrategicPlan = {
  intent: string
  priority: RegionPriority
  orders: StructuredOrder[]
  constraints: string[]
  reviewAfterTicks: number
}

export type ExecutableOrder = {
  id: string
  requestId: string
  unitId: string
  action: ActionType
  target: string
  tacticalOverrideId?: string
  status: OrderStatus
  summary: string
  createdTick: number
  basedOnWorldVersion: number
  startedTick?: number
  completedTick?: number
  lastMessage?: string
  error?: string
}

export type PlanExecution = {
  requestId: string
  source: PlanSource
  strategicCommand: string
  currentPlan: StrategicPlan
  orders: ExecutableOrder[]
  reviewAtTick: number
  basedOnWorldVersion: number
  plannerNote?: string
  plannerExplanation?: string
  planningRationale?: string[]
  lastError?: string
}

export type PlanningJob = {
  id: string
  status: PlanningJobStatus
  sourceMode: PlannerMode
  strategicCommand: string
  requestedTick: number
  requestedWorldVersion: number
  message: string
}

export type PlanningJobHistoryEntry = PlanningJob & {
  resolvedSource?: PlanSource
  plannerNote?: string
  plannerExplanation?: string
  planningRationale?: string[]
  completedTick?: number
  completedWorldVersion?: number
  plan?: StrategicPlan
}

export type PlannerSnapshot = {
  tick: number
  worldVersion: number
  command: string
  resources: FactionState
  macroLayer: {
    frontlineRisk: number
    foodSecurity: number
    supplyLineHealth: number
    developmentCapacity: number
    reconCoverage: number
    allianceCoordination: number
    battleRisk: number
    recentBattleTilt: number
    regions: RegionSnapshot[]
  }
  allianceLayer: {
    commanders: AlliedCommander[]
    directives: AllianceDirective[]
    recentActions: AllianceActionSummary[]
  }
  localLayer: {
    units: Array<{
      id: string
      name: string
      tileId: string
      strength: number
      supply: number
      status: UnitStatus
    }>
    tiles: Array<{
      id: string
      name: string
      type: TileType
      owner: TileOwner
      enemyPressure: number
      intel: IntelligenceLevel
    }>
    recentBattles: BattleOutcomeRecord[]
  }
}

export type PlanningRequest = {
  strategicCommand: string
  config: PlannerConfig
}
