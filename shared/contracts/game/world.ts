import type { BusMessage, DomainAgenda, DomainCommMetricsSnapshot, NationalAgendaWindow } from '../commBus'
import type { CourtSession } from '../court'
import type { CivilMemoryEntry, CivilMemoryEventType } from '../civilMemory'
import type {
  AllianceStance,
  ExecutionEnqueueMode,
  FactionId,
  GeneralDirective,
  HeroArchetype,
  HeroCardType,
  HeroFaction,
  HeroQuality,
  IntelligenceLevel,
  PlanSource,
  ResourceKind,
  RegionPriority,
  RegionRole,
  TacticalTemplateId,
  TacticalOverrideStatus,
  TileOwner,
  TileTerrain,
  TileType,
  TroopType,
  UnitStatus,
} from './common'
import type { HistoryState, OperationalFeedback, Report } from './history'
import type { MapContinuousOverlays, CityTechTrackId } from './meta'
import type { PlanningJobHistoryEntry, StrategicPlan, PlanExecution } from './planning'

export type Tile = {
  id: string
  name: string
  type: TileType
  terrain: TileTerrain
  owner: TileOwner
  x: number
  y: number
  moveCost: number
  enemyPressure: number
  scoutingDifficulty: number
  resourceLevel?: number
  resourceKind?: ResourceKind
  cityLevel?: number
  district?: string
  landmarkId?: string
  landmarkName?: string
}

export type MapRegion = {
  id: string
  name: string
  role: RegionRole
  priority: RegionPriority
  centerTileId: string
  tileIds: string[]
  summary: string
}

export type AlliedCommander = {
  id: string
  name: string
  specialty: RegionRole
  assignedRegionId: string
  readiness: number
}

export type AllianceDirective = {
  regionId: string
  stance: AllianceStance
  assignedCommanderId: string
  supportLevel: number
  summary: string
}

export type AllianceState = {
  commanders: AlliedCommander[]
  directives: Record<string, AllianceDirective>
}

export type Unit = {
  id: string
  name: string
  faction: FactionId
  corps: {
    name: string
    doctrine: string
    specialty: string
    readiness: number
    roster: string[]
  }
  hero: {
    id: string
    name: string
    title: string
    faction: HeroFaction
    cardType: HeroCardType
    quality: HeroQuality
    archetype: HeroArchetype
    level: number
    troopType: TroopType
    avatarKey: string
    portraitKey: string
    force: number
    command: number
    intelligence: number
    charisma: number
    speed: number
    traits: string[]
    signatureSkill: {
      name: string
      detail: string
    }
    growthFocus: string
  }
  tileId: string
  strength: number
  mobility: number
  supply: number
  status: UnitStatus
  currentTask?: string
  /** 副英雄（支援武将，最多2人，实现3武将编队战力加成） */
  coHeroes?: Array<{
    id: string
    name: string
    archetype: HeroArchetype
    level: number
    troopType: TroopType
    force: number
    command: number
    intelligence: number
    charisma: number
    speed: number
  }>
  /** 所属 AI 玩家分组 ID（势力内分组管理） */
  aiPlayerId?: string
}

export type TacticalTemplate = {
  id: TacticalTemplateId
  label: string
  summary: string
  executionNote: string
  targetScope: 'self' | 'neighbor' | 'frontline' | 'region'
  accent: 'gold' | 'crimson' | 'jade' | 'azure'
  recommendedArchetypes: HeroArchetype[]
}

export type HeroPoolEntry = {
  id: string
  name: string
  faction: HeroFaction
  cardType: HeroCardType
  quality: HeroQuality
  cost: number
  skillName: string
  archetype: HeroArchetype
  troopType: TroopType
  tags: string[]
  avatarKey: string
  portraitKey: string
}

export type TacticalOverride = {
  id: string
  unitId: string
  templateId: TacticalTemplateId
  targetTileId: string
  summary: string
  status: TacticalOverrideStatus
  createdTick: number
  createdWorldVersion: number
  committedRequestId?: string
  completedTick?: number
  lastMessage?: string
}

export type FactionHeroCommand = {
  doctrine: string
  homeTileId: string
  commandLimit: number
  heroLuck: number
  developmentPoints: number
  acquisitionThreshold: number
  rosterHeroIds: string[]
  reserveHeroIds: string[]
  prospectHeroIds: string[]
  recentHeroId?: string
}

export type RewardBundle = {
  food: number
  ap: number
}

export type ResourceTransferBundle = {
  food: number
  wood: number
  stone: number
  iron: number
}

export type PveNode = {
  id: string
  name: string
  district: string
  tileId: string
  guardStrength: number
  reward: RewardBundle
  cleared: boolean
  clearedByFaction?: string
}

export type ClaimableRewardSource = 'province_pve'

export type ClaimableReward = {
  id: string
  source: ClaimableRewardSource
  label: string
  summary: string
  reward: RewardBundle
  createdTick: number
  nodeId?: string
  tileId?: string
}

export type AiResourceAccount = {
  aiPlayerId: string
  governorPlayerId: string
  factionId: FactionId
  resources: ResourceTransferBundle
  updatedTick: number
}

export type GovernorResourceTransfer = {
  id: string
  sourceAiPlayerId: string
  sourceFactionId: FactionId
  governorPlayerId: string
  resources: ResourceTransferBundle
  reason: string
  approvedBy: string
  status: 'pending'
  createdTick: number
}

export type GovernorResourceInbox = {
  governorPlayerId: string
  pendingTransfers: GovernorResourceTransfer[]
  totalPendingResources: ResourceTransferBundle
}

/** AI 玩家分组：势力内的指挥官角色，管辖最多 3 支部队（实现同势力飞地协作） */
export type AIPlayer = {
  id: string
  name: string
  factionId: string
  /** 管辖的 Unit ID 列表（最多3支，对应3武将编队） */
  unitIds: string[]
  /** 战术专长 */
  specialty: 'assault' | 'recon' | 'guard' | 'logistics' | 'expansion'
  lore?: string
}

export type FactionAiQuota = {
  initialQuota: number
  currentQuota: number
  maxQuota: number
  growthScore: number
  tugIntensity: number
  nextUnlockScore: number | null
  lastGrowthTick?: number
}

export type SlgTroopFacilityBuildingState = {
  level: number
  statusText: string
  updatedTick: number
  description?: string
}

export type SlgTroopFacilityState = Record<string, Record<string, SlgTroopFacilityBuildingState>>

export type SlgCityBuildingState = {
  level: number
  statusText: string
  updatedTick: number
  description?: string
}

export type SlgCityBuildingGroupState = Record<string, SlgCityBuildingState>

export type SlgRecruitResultState = {
  id: string
  heroId: string
  heroName: string
  poolId: string
  drawMode: 'single' | 'multi'
  updatedTick: number
}

export type SlgRecruitState = {
  selectedPoolId?: string
  drawCount?: number
  lastDrawMode?: 'single' | 'multi' | 'none'
  lastResults?: SlgRecruitResultState[]
  updatedTick?: number
}

export type SlgGeneralDirectivePreviewState = {
  heroId?: string
  tacticId?: string
  source?: string
  sourceActionId?: string
  accepted?: number
  rejected?: number
  status?: string
  executionState?: string
  summary?: string
  warnings?: string[]
  effectLines?: string[]
  nextSteps?: string[]
  templateId?: string
  affectedUnitIds?: string[]
  targetUnitId?: string
  targetTileId?: string
  updatedTick?: number
  updatedWorldVersion?: number
}

export type SlgGeneralState = {
  activeHeroId?: string
  deploymentAnchorTileId?: string
  tacticByHeroId?: Record<string, string>
  // Legacy compatibility mirror. Prefer directivePreviewByHeroId[activeHeroId] when available.
  directivePreviewHeroId?: string
  // Legacy compatibility mirror. Prefer the hero-level map for long-term state.
  directivePreview?: SlgGeneralDirectivePreviewState
  // Authoritative hero-level directive previews.
  directivePreviewByHeroId?: Record<string, SlgGeneralDirectivePreviewState>
  updatedTick?: number
}

export type SlgAiContextMemorySummary = {
  focusId?: string
  relatedId?: string
  lines?: string[]
  updatedTick?: number
}

export type SlgAiAgendaState = {
  source: string
  summary?: string
  options?: {
    actionId: string
    intent?: string
    label: string
    summary?: string
    priority?: string
    targetTileId?: string
    targetUnitIds?: string[]
    supportingAiPlayerIds?: string[]
    evidenceRefs?: string[]
    supportCount: number
    recommendedFollowups?: string[]
  }[]
  // Legacy mirror arrays kept only for older readers. New readers should consume options[] directly.
  optionActionIds?: string[]
  optionLabels?: string[]
  optionTargetTileIds?: string[]
  optionSupportCounts?: number[]
  targetTileId?: string
  targetUnitIds?: string[]
  executionRequestId?: string
  recommendedFollowups?: string[]
  updatedTick?: number
  updatedWorldVersion?: number
}

export type SlgAiExecutionState = {
  status: 'idle' | 'queued' | 'running'
  activeOrderCount: number
  queuedOrderCount: number
  runningOrderCount: number
  actionPointsRemaining: number
  foodRemaining: number
  requestId?: string
  basedOnWorldVersion?: number
  reviewAtTick?: number
  strategicCommand?: string
  source?: PlanSource
  updatedTick: number
  updatedWorldVersion: number
}

export type SlgAiState = {
  autonomyLevel?: string
  controlMode?: string
  contextFocusId?: string
  contextMemorySummary?: SlgAiContextMemorySummary
  agenda?: SlgAiAgendaState
  execution?: SlgAiExecutionState
  lastAgendaActionId?: string
  updatedTick?: number
  updatedWorldVersion?: number
}

export type SlgAffairQueueEntryState = {
  id: string
  statusText: string
  updatedTick: number
  description?: string
}

export type SlgFactionDomainState = {
  troopFacilitiesByUnit?: Record<string, SlgTroopFacilityState>
  cityBuildingGroupsByCity?: Record<string, Record<string, SlgCityBuildingGroupState>>
  affairsQueueByCity?: Record<string, SlgAffairQueueEntryState[]>
  recruitStateByFaction?: Record<string, SlgRecruitState>
  generalStateByFaction?: Record<string, SlgGeneralState>
  aiStateByFaction?: Record<string, SlgAiState>
}

export type FactionState = {
  id: FactionId
  food: number
  actionPoints: number
  /** 木材资源（城池建造/城防加固消耗） */
  wood?: number
  /** 石料资源（城防/攻城器械消耗） */
  stone?: number
  /** 铁矿资源（武装/装备升级消耗） */
  iron?: number
  heroCommand: FactionHeroCommand
  luoyangHoldTicks?: number
  /** 已占领城池 tileId 列表（传送点/征兵出生点，已占领即可用） */
  capturedCities?: string[]
  /** 征兵冷却计数（每 RECRUIT_COOLDOWN_TICKS 回合可征一次） */
  recruitCooldown?: number
  /** 累计征兵次数 */
  recruitedTotal?: number
  /** 待领取奖励（当前先承载开荒 PVE 等明确后端 authority 的奖励来源） */
  claimableRewards?: ClaimableReward[]
  /** AI 玩家独立资源子账户（用于后续资源地/建筑树产出与受治理资源输送） */
  aiResourceAccounts?: Record<string, AiResourceAccount>
  /** 总督待领取资源收件箱；只由后端 authority 写入，UI 不直接结算 */
  governorResourceInboxes?: Record<string, GovernorResourceInbox>
  /** 势力内 AI 玩家分组（每玩家管辖3支部队，支持飞地协作） */
  aiPlayers?: AIPlayer[]
  /** 势力内 AI 玩家配额（服务端权威计算：初始配额 + 扩容进度 + 上限） */
  aiQuota?: FactionAiQuota
}
export type TileIntel = {
  level: IntelligenceLevel
  lastScoutedTick?: number
  summary?: string
}
export type WorldState = {
  tick: number
  worldVersion: number
  map: {
    width: number
    height: number
    tiles: Tile[]
    connections: Record<string, string[]>
    regions: MapRegion[]
    overlays: MapContinuousOverlays
  }
  factions: Record<FactionId, FactionState>
  alliance: AllianceState
  feedback: OperationalFeedback
  units: Unit[]
  reports: Report[]
  intel: Record<string, TileIntel>
  tacticalOverrides: TacticalOverride[]
  executions: Record<string, PlanExecution | null>
  history: HistoryState
  pveNodes?: PveNode[]
  luoyangSiegeProgress?: Record<string, number>
  /** 非洛阳城池围城进度。key = `${factionId}:${tileId}`，value = 已完成的持续围攻 tick 数 */
  citySiegeProgress?: Record<string, number>
  /** 原生 SLG 前端补充域：部队设施、政务队列等最小权威状态 */
  slgDomainState?: SlgFactionDomainState
}

export type WorldMapLayoutTile = Omit<Tile, 'owner' | 'enemyPressure'>

export type WorldMapTileState = Pick<Tile, 'id' | 'owner' | 'enemyPressure'>

export type WorldMapLayout = {
  width: number
  height: number
  tiles: WorldMapLayoutTile[]
  connections: Record<string, string[]>
  regions: MapRegion[]
  overlays: MapContinuousOverlays
}

export type WorldSummary = Omit<WorldState, 'map'> & {
  map: {
    width: number
    height: number
    mapLayoutVersion: number
    tileStateMode: 'full' | 'delta'
    baseWorldVersion?: number
    tileStates: WorldMapTileState[]
  }
  intelSyncMode?: 'full' | 'delta'
  intelBaseWorldVersion?: number
}

export type WorldSummaryResponse = {
  world: WorldSummary
}

export type WorldMapLayoutChunkScope = 'full' | 'bootstrap' | 'province' | 'region' | 'viewport'

export type WorldMapLayoutChunkMeta = {
  scope: WorldMapLayoutChunkScope
  id?: string
  loadedProvinceIds: string[]
  pendingProvinceIds?: string[]
}

export type WorldMapLayoutResponse = {
  mapLayoutVersion: number
  map: WorldMapLayout
  chunk?: WorldMapLayoutChunkMeta
}
export type WorldSnapshotResponse = {
  world: WorldState
}

export type WorldActionRequest =
  | {
      action: 'appendPlanningJobHistory'
      payload: {
        entry: PlanningJobHistoryEntry
      }
    }
  | {
      action: 'queuePlanExecution'
      payload: {
        plan: StrategicPlan
        source: PlanSource
        strategicCommand: string
        requestId: string
        basedOnWorldVersion: number
        factionId?: FactionId
        plannerNote?: string
        plannerExplanation?: string
        planningRationale?: string[]
        dispatchGenerals?: boolean
        generalConcurrency?: number
        generalSide?: FactionId
        generalDirectives?: GeneralDirective[]
        executionMode?: ExecutionEnqueueMode
        expectedExecutionRequestId?: string
      }
    }
  | {
      action: 'previewGeneralDirectives'
      payload: {
        directives: GeneralDirective[]
        side?: FactionId
        basePlan?: StrategicPlan
      }
    }
  | {
      action: 'previewDomainAgenda'
      payload?: {
        factionId?: FactionId
        domainId?: string
        includeMessages?: boolean
      }
    }
  | {
      action: 'previewNationalAgenda'
      payload?: {
        maxOptions?: number
      }
    }
  | {
      action: 'previewCourtSession'
      payload?: {
        maxProposals?: number
        maxOptions?: number
      }
    }
  | {
      action: 'queryCivilMemory'
      payload?: {
        limit?: number
        type?: CivilMemoryEventType
        tickFrom?: number
        tickTo?: number
        factionId?: FactionId
        relatedId?: string
      }
    }
  | {
      action: 'setGeneralTactic'
      payload: {
        factionId?: FactionId
        heroId: string
        tacticId: 'assault' | 'guard' | 'logistics'
      }
    }
  | {
      action: 'setGeneralActiveHero'
      payload: {
        factionId?: FactionId
        heroId: string
      }
    }
    | {
      action: 'queueAiAgendaAction'
      payload: {
        factionId?: FactionId
        agendaActionId: 'agenda_expand' | 'agenda_support' | 'agenda_stabilize' | 'agenda_recover' | 'agenda_redeploy'
      }
    }
  | {
      action: 'setAiContextFocus'
      payload: {
        factionId?: FactionId
        contextFocusId: string
      }
    }
  | {
      action: 'advanceTick'
    }
  | {
      action: 'clearPlanExecution'
      payload?: {
        factionId?: FactionId
      }
    }
  | {
      action: 'moveUnit'
      payload: {
        factionId?: FactionId
        unitId: string
        targetTileId: string
      }
    }
  | {
      action: 'deployReserveHero'
      payload: {
        factionId: FactionId
        heroId: string
        tileId: string
      }
    }
  | {
      action: 'upgradeCity'
      payload: {
        factionId?: FactionId
        tileId: string
      }
    }
  | {
      action: 'upgradeCityTech'
      payload: {
        factionId?: FactionId
        tileId: string
        techId: CityTechTrackId
      }
    }
  | {
      action: 'promoteCityBuilding'
      payload: {
        factionId?: FactionId
        cityId: string
        groupId: string
        buildingId: string
      }
    }
  | {
      action: 'queueTacticalOverride'
      payload: {
        factionId?: FactionId
        unitId: string
        templateId: TacticalTemplateId
        targetTileId: string
        summary: string
      }
    }
  | {
      action: 'updateAllianceDirective'
      payload: {
        regionId: string
        stance: AllianceStance
      }
    }
  | {
      action: 'allianceHelp'
      payload: {
        factionId?: FactionId
        regionId: string
      }
    }
  | {
      action: 'claimReward'
      payload?: {
        factionId?: FactionId
        rewardId?: string
      }
    }
  | {
      action: 'transferFactionResourcesToGovernor'
      payload: {
        sourceFactionId: FactionId
        sourceAiPlayerId: string
        governorPlayerId: string
        resources: Partial<ResourceTransferBundle>
        reason: string
        approvedBy: string
      }
    }
  | {
      action: 'promoteTroopFacilityBuilding'
      payload: {
        factionId?: FactionId
        unitId: string
        facilityId: string
        buildingId: string
      }
    }
  | {
      action: 'setRecruitSelectedPool'
      payload: {
        factionId?: FactionId
        poolId: string
      }
    }
  | {
      action: 'recruitProspectHero'
      payload: {
        factionId?: FactionId
        count?: number
        poolId?: string
      }
    }
  | {
      action: 'enqueueAffair'
      payload: {
        factionId?: FactionId
        cityId: string
        affairId: string
      }
    }

export type WorldActionResponse = {
  ok: boolean
  worldVersion: number
  tick: number
  world?: WorldState
  message?: string
  failureCode?: string
  requestId?: string
  unitId?: string
  heroId?: string
  heroIds?: string[]
  heroNames?: string[]
  tacticId?: string
  contextFocusId?: string
  relatedId?: string
  execution?: SlgAiExecutionState
  domainAgenda?: DomainAgenda
  domainCommMetrics?: DomainCommMetricsSnapshot
  domainMessages?: BusMessage[]
  nationalAgenda?: NationalAgendaWindow
  courtSession?: CourtSession
  civilMemoryEntries?: CivilMemoryEntry[]
}
