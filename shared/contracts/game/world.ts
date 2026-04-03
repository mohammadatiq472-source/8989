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

export type PveNode = {
  id: string
  name: string
  district: string
  tileId: string
  guardStrength: number
  reward: { food: number; ap: number }
  cleared: boolean
  clearedByFaction?: string
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

export type WorldActionResponse = {
  ok: boolean
  worldVersion: number
  tick: number
  world?: WorldState
  message?: string
  unitId?: string
  domainAgenda?: DomainAgenda
  domainCommMetrics?: DomainCommMetricsSnapshot
  domainMessages?: BusMessage[]
  nationalAgenda?: NationalAgendaWindow
  courtSession?: CourtSession
  civilMemoryEntries?: CivilMemoryEntry[]
}
