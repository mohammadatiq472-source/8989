import { randomUUID } from 'node:crypto'
import {
  flushNarrativePersist as flushNarrativePersistFromPersistence,
  flushWorldPersist as flushWorldPersistFromPersistence,
  getNarrativeEvents as getNarrativeEventsFromPersistence,
  loadPersistedNarrativeEvents,
  loadPersistedWorldState,
  recordSimulationNarrativeEvents as recordSimulationNarrativeEventsFromPersistence,
  scheduleWorldPersist,
} from './persistence/worldPersistence'
import {
  buildLayoutChunkByTileIds,
  listProvinceIds,
  resolveBootstrapProvinceIds,
} from './layout/worldMapLayoutChunkBuilder'
import { getActiveWorldMutationHolder, tryAcquireWorldMutationLock } from './runtime/worldMutationLock'
import { runGeneralDispatch } from '../../agents/general/GeneralAgent'
import { previewDomainAgendaForFaction, runDomainCommWindow } from '../../agents/commBus/DomainCommBus'
import { compileNationalAgendaWindow } from '../../agents/commBus/AgendaCompiler'
import { runCourtSession, simulateCourtSession, getLatestCourtSession } from '../../agents/court/CourtService'
import { flushCourtSessionPersist } from '../../agents/court/CourtStore'
import { flushTacticalSkillPersist } from '../../agents/tools/TacticalSkillLibrary'
import {
  getCivilMemoryEntries as listCivilMemoryEntries,
  recordAgendaWindowMemory,
  recordCourtSessionMemory,
  recordExecutionOutcomeMemory,
} from '../../agents/memory/CivilMemoryService'
import { flushCivilMemoryPersist } from '../../agents/memory/CivilMemoryStore'
import { getGeneralProfilesForFaction } from '../../agents/general/GeneralProfileStore'
import { reflectWorldTick } from '../../agents/reflect/ReflectService'
import { broadcastTickDelta, broadcastBattleReport } from '../../ws/GameWebSocket'
import { getFactionAutonomyLevel } from '../../multiplayer/SessionManager'
import { createInitialWorldState } from '../../../../shared/domain/scenario'
import { syncAllFactionAiQuota } from '../../../../shared/domain/aiQuota'
import { settleResourcesForAllPlayers } from '../v2/V2GameService'
import {
  advanceTick,
  appendPlanningJobHistory,
  clearPlanExecution,
  deployReserveHero,
  moveUnit,
  upgradeCity,
  upgradeCityTech,
  queuePlanExecution,
  queueTacticalOverride,
  updateAllianceDirective,
} from '../../../../shared/domain/rules'
import type {
  ActionType,
  CityTechTrackId,
  ExecutionEnqueueMode,
  FactionId,
  GeneralDirective,
  GeneralDirectivePreviewConfidence,
  GeneralDirectivePreviewItem,
  GeneralDirectivePreviewMatchMode,
  GeneralDirectivePreviewResponse,
  NarrativeEvent,
  PlanSource,
  PlanningJobHistoryEntry,
  ReplayArchiveEntry,
  ReplayArchiveResponse,
  SaveSlotRecord,
  SaveSlotsResponse,
  StrategicPlan,
  WorldActionResponse,
  WorldEventRecord,
  WorldEventsResponse,
  WorldMapLayoutResponse,
  WorldMapLayoutTile,
  WorldMapTileState,
  WorldSnapshotResponse,
  WorldState,
  WorldSummary,
  WorldSummaryResponse,
} from '../../../../shared/contracts/game'
import type { NationalAgendaWindow } from '../../../../shared/contracts/commBus'
import type { CivilMemoryEventType } from '../../../../shared/contracts/civilMemory'

const MAX_WORLD_EVENTS = 500
const MAX_REPLAY_ARCHIVE = 160
const MAX_SAVE_SLOTS = 12

const WORLD_MUTATION_BUSY_MESSAGE = 'world mutation busy'

const MAX_TILE_STATE_DIFF_HISTORY = 180
const MAX_INTEL_DIFF_HISTORY = 180
const DEFAULT_MAP_LAYOUT_VERSION = 1
const MAX_GENERAL_DIRECTIVES = 16
const GENERAL_NAME_FUZZY_MIN_SCORE = 0.72
const GENERAL_NAME_FUZZY_GAP = 0.08

const TARGET_TILE_ALIAS_TABLE: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: '\u6d1b\u9633', aliases: ['\u6d1b\u9633', '\u6d1b\u9633\u57ce', '\u6d1b\u9633\u4e3b\u57ce', 'luoyang', 'capital'] },
  { canonical: '\u957f\u5b89', aliases: ['\u957f\u5b89', '\u957f\u5b89\u57ce', 'changan'] },
  { canonical: '\u90ba\u57ce', aliases: ['\u90ba\u57ce', '\u90ba\u90fd', 'yecheng'] },
  { canonical: '\u8bb8\u660c', aliases: ['\u8bb8\u660c', '\u8bb8\u90fd', 'xuchang'] },
  { canonical: '\u6210\u90fd', aliases: ['\u6210\u90fd', 'chengdu'] },
  { canonical: '\u5efa\u4e1a', aliases: ['\u5efa\u4e1a', 'jianye', '\u5efa\u5eb7'] },
  { canonical: '\u8d64\u5792\u8981\u585e', aliases: ['\u8d64\u5792', '\u8d64\u5792\u8981\u585e', 'redfort'] },
  { canonical: '\u897f\u4fa7\u5173\u53e3', aliases: ['\u897f\u4fa7\u5173\u53e3', '\u897f\u5173', '\u897f\u7ebf\u5173\u53e3', 'west gate'] },
  { canonical: '\u4e1c\u4fa7\u5ce1\u53e3', aliases: ['\u4e1c\u4fa7\u5ce1\u53e3', '\u4e1c\u5ce1\u53e3', 'east pass'] },
  { canonical: '\u540e\u52e4\u8425\u5730', aliases: ['\u540e\u52e4\u8425\u5730', '\u540e\u52e4\u70b9', 'logistics camp'] },
  { canonical: '\u5317\u7ebf\u5c94\u8def', aliases: ['\u5317\u7ebf\u5c94\u8def', '\u5317\u7ebf\u8282\u70b9', 'north fork'] },
  { canonical: '\u4e2d\u519b\u5927\u9053', aliases: ['\u4e2d\u519b\u5927\u9053', '\u4e2d\u7ebf\u5927\u9053', 'center avenue'] },
  { canonical: '\u897f\u5357\u7cae\u4ed3', aliases: ['\u897f\u5357\u7cae\u4ed3', '\u7cae\u4ed3', 'granary'] },
  { canonical: '\u70fd\u70df\u53f0', aliases: ['\u70fd\u70df\u53f0', '\u70fd\u706b\u53f0', 'beacon'] },
]

const DEFAULT_SUMMARY_PLANNING_HISTORY_LIMIT = 60
const MAX_SUMMARY_PLANNING_HISTORY_LIMIT = 240
const DEFAULT_SUMMARY_REPLAY_LIMIT = 12
const MAX_SUMMARY_REPLAY_LIMIT = 120
const DEFAULT_SUMMARY_REPLAY_FRAME_LIMIT = 8
const MAX_SUMMARY_REPLAY_FRAME_LIMIT = 60

type SaveSlotState = {
  record: SaveSlotRecord
  world: WorldState
}

type WorldSummaryOptions = {
  sinceWorldVersion?: number
  planningHistoryLimit?: number
  replayLimit?: number
  replayFrameLimit?: number
  intelMode?: 'sparse' | 'full'
}

type ResolvedWorldSummaryOptions = {
  sinceWorldVersion?: number
  planningHistoryLimit: number
  replayLimit: number
  replayFrameLimit: number
  intelMode: 'sparse' | 'full'
}

type MapHierarchyLayer = 'nation' | 'province' | 'region' | 'tile'

type WorldMapLayoutOptions = {
  scope?: 'full' | 'bootstrap' | 'province' | 'region' | 'viewport'
  provinceId?: string
  regionId?: string
  centerX?: number
  centerY?: number
  layer?: MapHierarchyLayer
}

type ResolvedWorldMapLayoutOptions =
  | {
      scope: 'full' | 'bootstrap'
    }
  | {
      scope: 'province'
      provinceId: string
    }
  | {
      scope: 'region'
      regionId: string
    }
  | {
      scope: 'viewport'
      centerX: number
      centerY: number
      layer: MapHierarchyLayer
    }

let worldState: WorldState = createInitialWorldState()
syncAllFactionAiQuota(worldState)
let mapLayoutVersion = DEFAULT_MAP_LAYOUT_VERSION
let worldMapLayout = buildWorldMapLayout(worldState, mapLayoutVersion)
let mapLayoutTileByCoord = new Map<string, WorldMapLayoutTile>()
let mapLayoutRegionIdByTileId = new Map<string, string>()
const tileStateDiffByVersion = new Map<number, WorldMapTileState[]>()
const intelDiffByVersion = new Map<number, WorldState['intel']>()
const worldEvents: WorldEventRecord[] = []
const replayArchive = new Map<string, ReplayArchiveEntry>()
const saveSlots = new Map<string, SaveSlotState>()
let lastNationalAgenda: NationalAgendaWindow | null = null
loadPersistedWorldState((savedWorldState) => {
  worldState = savedWorldState
  syncAllFactionAiQuota(worldState)
}) // P0: restore world state first
loadPersistedNarrativeEvents()

appendWorldEvent({
  category: 'system',
  action: 'world_bootstrapped',
  success: true,
  tick: worldState.tick,
  worldVersion: worldState.worldVersion,
  message: 'world service initialized',
})
refreshReplayArchive()
rebuildMapLayoutIndexes()

export function getWorldSnapshot(): WorldSnapshotResponse {
  return {
    world: structuredClone(worldState),
  }
}

export function getWorldSummary(options?: WorldSummaryOptions): WorldSummaryResponse {
  const resolvedOptions = resolveWorldSummaryOptions(options)
  const tileStatePayload = resolveTileStatePayload(resolvedOptions.sinceWorldVersion)
  const intelPayload = resolveIntelPayload(resolvedOptions)

  return {
    world: buildWorldSummary(
      worldState,
      tileStatePayload.tileStates,
      tileStatePayload.mode,
      intelPayload,
      resolvedOptions,
      tileStatePayload.baseWorldVersion,
    ),
  }
}

export function getWorldMapLayout(options?: WorldMapLayoutOptions): WorldMapLayoutResponse {
  const resolvedOptions = resolveWorldMapLayoutOptions(options)

  if (resolvedOptions.scope === 'full') {
    return {
      ...worldMapLayout,
      chunk: {
        scope: 'full',
        loadedProvinceIds: listProvinceIds(worldMapLayout.map.tiles),
      },
    }
  }

  if (resolvedOptions.scope === 'province') {
    return buildProvinceLayoutChunk(resolvedOptions.provinceId)
  }

  if (resolvedOptions.scope === 'region') {
    return buildRegionLayoutChunk(resolvedOptions.regionId)
  }

  if (resolvedOptions.scope === 'viewport') {
    return buildViewportLayoutChunk(resolvedOptions.centerX, resolvedOptions.centerY, resolvedOptions.layer)
  }

  return buildBootstrapLayoutChunk()
}

export function getWorldStateReadonly(): Readonly<WorldState> {
  return worldState
}

function buildWorldActionResponse(params: {
  ok: boolean
  includeWorld?: boolean
  message?: string
  unitId?: string
}): WorldActionResponse {
  const includeWorld = params.includeWorld !== false

  return {
    ok: params.ok,
    tick: worldState.tick,
    worldVersion: worldState.worldVersion,
    world: includeWorld ? structuredClone(worldState) : undefined,
    message: params.message,
    unitId: params.unitId,
  }
}

function buildWorldMutationBusyResponse(includeWorld = true): WorldActionResponse {
  const holder = getActiveWorldMutationHolder()
  const message = holder ? `${WORLD_MUTATION_BUSY_MESSAGE}: ${holder}` : WORLD_MUTATION_BUSY_MESSAGE
  return buildWorldActionResponse({
    ok: false,
    includeWorld,
    message,
  })
}

export function getWorldEvents(limit = 200): WorldEventsResponse {
  const normalizedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.floor(limit))) : 200
  return {
    items: worldEvents.slice(0, normalizedLimit),
  }
}

export function getNarrativeEvents(limit = 200) {
  return getNarrativeEventsFromPersistence(limit)
}

export function getNationalAgendaSnapshot() {
  return {
    item: lastNationalAgenda ? structuredClone(lastNationalAgenda) : null,
  }
}

export function getCourtSessionSnapshot() {
  return {
    item: getLatestCourtSession(),
  }
}

export function getCivilMemorySnapshot(params: {
  limit?: number
  type?: CivilMemoryEventType
  tickFrom?: number
  tickTo?: number
} = {}) {
  return {
    items: listCivilMemoryEntries(params),
  }
}

export function getReplayArchive(): ReplayArchiveResponse {
  return {
    items: Array.from(replayArchive.values()).sort((a, b) =>
      a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
    ),
  }
}

export function getReplayArchiveEntry(requestId: string): ReplayArchiveEntry | undefined {
  return replayArchive.get(requestId)
}

export function getExecutionReplayByRequestId(requestId: string) {
  const replay = worldState.history.executionReplays.find((item) => item.requestId === requestId)
  return replay ? structuredClone(replay) : undefined
}

export function getSaveSlots(): SaveSlotsResponse {
  return {
    slots: Array.from(saveSlots.values())
      .map((item) => item.record)
      .sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0)),
  }
}

export function saveWorldSlot(slotId: string, label?: string): SaveSlotRecord {
  const normalizedSlotId = normalizeSlotId(slotId)
  const now = new Date().toISOString()
  const record: SaveSlotRecord = {
    slotId: normalizedSlotId,
    label: label?.trim() || `Save ${normalizedSlotId}`,
    tick: worldState.tick,
    worldVersion: worldState.worldVersion,
    savedAt: now,
  }

  saveSlots.set(normalizedSlotId, {
    record,
    world: structuredClone(worldState),
  })

  trimSaveSlots()

  appendWorldEvent({
    category: 'persistence',
    action: 'save_slot',
    success: true,
    tick: worldState.tick,
    worldVersion: worldState.worldVersion,
    message: `save slot ${normalizedSlotId} updated`,
    metadata: {
      slotId: normalizedSlotId,
      label: record.label,
    },
  })

  return record
}

export function loadWorldSlot(slotId: string): WorldActionResponse {
  const mutationLock = tryAcquireWorldMutationLock('load_world_slot')
  if (!mutationLock) {
    return buildWorldMutationBusyResponse(true)
  }

  try {
    const normalizedSlotId = normalizeSlotId(slotId)
    const slot = saveSlots.get(normalizedSlotId)
    if (!slot) {
      const failed = buildWorldActionResponse({
        ok: false,
        message: `save slot ${normalizedSlotId} not found`,
      })

      appendWorldEvent({
        category: 'persistence',
        action: 'load_slot',
        success: false,
        tick: worldState.tick,
        worldVersion: worldState.worldVersion,
        message: failed.message,
        metadata: { slotId: normalizedSlotId },
      })

      return failed
    }

    commitWorldState(structuredClone(slot.world))
    refreshReplayArchive()

    const succeeded = buildWorldActionResponse({
      ok: true,
      message: `save slot ${normalizedSlotId} loaded`,
    })

    appendWorldEvent({
      category: 'persistence',
      action: 'load_slot',
      success: true,
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
      message: succeeded.message,
      metadata: { slotId: normalizedSlotId },
    })

    return succeeded
  } finally {
    mutationLock.release()
  }
}

export function appendPlanningJobHistoryAction(entry: PlanningJobHistoryEntry, includeWorld = true): WorldActionResponse {
  const mutationLock = tryAcquireWorldMutationLock('append_planning_history')
  if (!mutationLock) {
    return buildWorldMutationBusyResponse(includeWorld)
  }

  try {
    commitWorldState(appendPlanningJobHistory(worldState, entry))
    const response = buildWorldActionResponse({
      ok: true,
      includeWorld,
      message: entry.message,
    })

    appendWorldEvent({
      category: 'planning',
      action: 'append_planning_history',
      success: true,
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
      requestId: entry.id,
      message: entry.message,
      metadata: {
        status: entry.status,
        sourceMode: entry.sourceMode,
        resolvedSource: entry.resolvedSource,
      },
    })

    return response
  } finally {
    mutationLock.release()
  }
}

type QueuePlanExecutionActionParams = {
  plan: StrategicPlan
  source: PlanSource
  strategicCommand: string
  requestId: string
  basedOnWorldVersion: number
  factionId?: string
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

type GeneralDirectiveResolutionResult = {
  plan: StrategicPlan
  accepted: number
  rejected: number
  warnings: string[]
  items: GeneralDirectivePreviewItem[]
}

type PreviewGeneralDirectivesActionParams = {
  directives: GeneralDirective[]
  side?: FactionId
  basePlan?: StrategicPlan
}

type PreviewDomainAgendaActionParams = {
  factionId?: FactionId
  domainId?: string
  includeMessages?: boolean
}

type PreviewNationalAgendaActionParams = {
  maxOptions?: number
}

type PreviewCourtSessionActionParams = {
  maxProposals?: number
  maxOptions?: number
}

type QueryCivilMemoryActionParams = {
  limit?: number
  type?: CivilMemoryEventType
  tickFrom?: number
  tickTo?: number
}

type FactionGeneral = ReturnType<typeof getGeneralProfilesForFaction>[number]

export async function queuePlanExecutionAction(
  params: QueuePlanExecutionActionParams,
  includeWorld = true,
): Promise<WorldActionResponse> {
  const mutationLock = tryAcquireWorldMutationLock('queue_plan_execution')
  if (!mutationLock) {
    return buildWorldMutationBusyResponse(includeWorld)
  }

  try {
    let planForExecution = params.plan
    let generalDispatchMeta: Record<string, unknown> | undefined
    let generalDirectiveMeta: Record<string, unknown> | undefined
    const targetFactionId = params.factionId ?? resolveDefaultFactionId()
    const autonomyLevel = getFactionAutonomyLevel(targetFactionId)
    const controlMode =
      autonomyLevel === 'L1_assigned'
        ? 'human_assigned'
        : autonomyLevel === 'L3_negotiated'
          ? 'ai_negotiated'
          : 'ai_delegated'

    const side = params.generalSide ?? targetFactionId
    let cachedGenerals: FactionGeneral[] | undefined
    const resolveGenerals = () => {
      if (!cachedGenerals) {
        cachedGenerals = getGeneralProfilesForFaction(worldState, side)
      }

      return cachedGenerals
    }

    const directives = params.generalDirectives ?? []
    if (directives.length > 0) {
      const directiveResult = applyGeneralDirectivesToPlan(worldState, planForExecution, resolveGenerals(), directives)
      planForExecution = directiveResult.plan
      generalDirectiveMeta = {
        generalDirectiveCount: directives.length,
        generalDirectiveAccepted: directiveResult.accepted,
        generalDirectiveRejected: directiveResult.rejected,
        generalDirectiveWarnings: directiveResult.warnings.slice(0, 8),
      }
    }

    if (params.dispatchGenerals) {
      const concurrency = normalizeGeneralConcurrency(params.generalConcurrency)

      try {
        const generalReport = await runGeneralDispatch(worldState, planForExecution, resolveGenerals(), {
          concurrency,
        })
        planForExecution = generalReport.delegatedPlan
        generalDispatchMeta = {
          generalDispatch: true,
          generalSide: side,
          generalConcurrency: concurrency,
          generalSummary: generalReport.summary,
        }
      } catch (error) {
        generalDispatchMeta = {
          generalDispatch: false,
          generalSide: side,
          generalConcurrency: concurrency,
          generalError: error instanceof Error ? error.message : 'general dispatch failed',
        }
      }
    }

    const executionMode = normalizeExecutionMode(params.executionMode)
    const expectedExecutionRequestId = normalizeExpectedExecutionRequestId(params.expectedExecutionRequestId)

    const result = queuePlanExecution(
      worldState,
      planForExecution,
      params.source,
      targetFactionId,
      params.strategicCommand,
      params.requestId,
      params.basedOnWorldVersion,
      executionMode,
      expectedExecutionRequestId,
      params.plannerNote,
      params.plannerExplanation,
      params.planningRationale,
    )

    if (!result.ok) {
      const failed = buildWorldActionResponse({
        ok: false,
        includeWorld,
        message: result.message,
      })

      appendWorldEvent({
        category: 'planning',
        action: 'queue_plan_execution',
        success: false,
        tick: worldState.tick,
        worldVersion: worldState.worldVersion,
        requestId: params.requestId,
        message: result.message,
        metadata: {
          source: params.source,
          factionId: targetFactionId,
          autonomyLevel,
          controlMode,
          basedOnWorldVersion: params.basedOnWorldVersion,
          orderCount: planForExecution.orders.length,
          executionMode,
          expectedExecutionRequestId,
          ...(generalDirectiveMeta ?? {}),
          ...(generalDispatchMeta ?? {}),
        },
      })

      return failed
    }

    commitWorldState(result.world)
    refreshReplayArchive()

    const succeeded = buildWorldActionResponse({
      ok: true,
      includeWorld,
      message: result.message,
    })

    appendWorldEvent({
      category: 'planning',
      action: 'queue_plan_execution',
      success: true,
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
      requestId: params.requestId,
      message: result.message,
      metadata: {
        source: params.source,
        factionId: targetFactionId,
        autonomyLevel,
        controlMode,
        basedOnWorldVersion: params.basedOnWorldVersion,
        orderCount: planForExecution.orders.length,
        executionMode,
        expectedExecutionRequestId,
        ...(generalDirectiveMeta ?? {}),
        ...(generalDispatchMeta ?? {}),
      },
    })

    return succeeded
  } finally {
    mutationLock.release()
  }
}

export function previewGeneralDirectivesAction(
  params: PreviewGeneralDirectivesActionParams,
): GeneralDirectivePreviewResponse {
  const side = params.side ?? resolveDefaultFactionId()
  const generals = getGeneralProfilesForFaction(worldState, side)
  const basePlan = resolveDirectiveBasePlan(worldState, params.basePlan)
  const directives = params.directives ?? []

  const resolution = applyGeneralDirectivesToPlan(worldState, basePlan, generals, directives)

  return {
    ok: true,
    tick: worldState.tick,
    worldVersion: worldState.worldVersion,
    side,
    accepted: resolution.accepted,
    rejected: resolution.rejected,
    warnings: resolution.warnings.slice(0, 16),
    items: resolution.items,
    mergedPlan: resolution.plan,
  }
}

function resolveFactionForDomainPreview(params: PreviewDomainAgendaActionParams): FactionId {
  if (params.factionId && worldState.factions[params.factionId]) {
    return params.factionId
  }

  const domainId = params.domainId?.trim()
  if (domainId && domainId.startsWith('domain:')) {
    const derivedFactionId = domainId.slice('domain:'.length)
    if (derivedFactionId && worldState.factions[derivedFactionId]) {
      return derivedFactionId
    }
  }

  return resolveDefaultFactionId()
}

function resolveDefaultFactionId(): FactionId {
  const allFactionIds = Object.keys(worldState.factions)
  if (allFactionIds.length === 0) {
    return 'neutral'
  }

  return allFactionIds[0]
}

function compileNationalAgendaForCurrentWorld(maxOptions = 9): {
  domainCommWindow: ReturnType<typeof runDomainCommWindow>
  nationalAgenda: NationalAgendaWindow
} {
  const domainCommWindow = runDomainCommWindow(worldState)
  const nationalAgenda = compileNationalAgendaWindow({
    tick: worldState.tick,
    domainPreviews: domainCommWindow.domains,
    maxOptions,
  })
  lastNationalAgenda = nationalAgenda
  return {
    domainCommWindow,
    nationalAgenda,
  }
}

export function previewDomainAgendaAction(
  params: PreviewDomainAgendaActionParams = {},
  includeWorld = true,
): WorldActionResponse {
  const factionId = resolveFactionForDomainPreview(params)
  const includeMessages = params.includeMessages !== false
  const preview = previewDomainAgendaForFaction(worldState, factionId, includeMessages)

  if (!preview) {
    return buildWorldActionResponse({
      ok: false,
      includeWorld,
      message: `No domain actors found for faction ${factionId}.`,
    })
  }

  appendWorldEvent({
    category: 'system',
    action: 'preview_domain_agenda',
    success: true,
    tick: worldState.tick,
    worldVersion: worldState.worldVersion,
    metadata: {
      domainId: preview.domainId,
      factionId,
      includeMessages,
      agendaCandidates: preview.agenda.candidates.length,
      published: preview.metrics.published,
      delivered: preview.metrics.delivered,
      dropped: preview.metrics.dropped,
    },
  })

  return {
    ...buildWorldActionResponse({
      ok: true,
      includeWorld,
      message: `Domain agenda preview generated for ${factionId}.`,
    }),
    domainAgenda: preview.agenda,
    domainCommMetrics: preview.metrics,
    domainMessages: includeMessages ? preview.messages : undefined,
  }
}

export function previewNationalAgendaAction(
  params: PreviewNationalAgendaActionParams = {},
  includeWorld = true,
): WorldActionResponse {
  const { domainCommWindow, nationalAgenda } = compileNationalAgendaForCurrentWorld(params.maxOptions ?? 9)

  appendWorldEvent({
    category: 'system',
    action: 'preview_national_agenda',
    success: true,
    tick: worldState.tick,
    worldVersion: worldState.worldVersion,
    metadata: {
      domains: domainCommWindow.domains.length,
      optionCountIn: nationalAgenda.optionCountIn,
      optionCountOut: nationalAgenda.optionCountOut,
    },
  })

  return {
    ...buildWorldActionResponse({
      ok: true,
      includeWorld,
      message: `National agenda preview generated for tick ${worldState.tick}.`,
    }),
    nationalAgenda,
  }
}

export function previewCourtSessionAction(
  params: PreviewCourtSessionActionParams = {},
  includeWorld = true,
): WorldActionResponse {
  const { nationalAgenda } = compileNationalAgendaForCurrentWorld(params.maxOptions ?? 9)
  const courtSession = simulateCourtSession({
    world: worldState,
    nationalAgenda,
    maxProposals: params.maxProposals ?? 9,
  })

  appendWorldEvent({
    category: 'system',
    action: 'preview_court_session',
    success: true,
    tick: worldState.tick,
    worldVersion: worldState.worldVersion,
    metadata: {
      seatCount: courtSession.seats.length,
      proposalCount: courtSession.proposals.length,
      passed: courtSession.resolutions.filter((item) => item.decision === 'passed').length,
    },
  })

  return {
    ...buildWorldActionResponse({
      ok: true,
      includeWorld,
      message: `Court session preview generated for tick ${worldState.tick}.`,
    }),
    nationalAgenda,
    courtSession,
  }
}

export function queryCivilMemoryAction(
  params: QueryCivilMemoryActionParams = {},
  includeWorld = true,
): WorldActionResponse {
  const entries = listCivilMemoryEntries(params)

  appendWorldEvent({
    category: 'system',
    action: 'query_civil_memory',
    success: true,
    tick: worldState.tick,
    worldVersion: worldState.worldVersion,
    metadata: {
      limit: params.limit,
      type: params.type,
      tickFrom: params.tickFrom,
      tickTo: params.tickTo,
      results: entries.length,
    },
  })

  return {
    ...buildWorldActionResponse({
      ok: true,
      includeWorld,
      message: `Civil memory query returned ${entries.length} entries.`,
    }),
    civilMemoryEntries: entries,
  }
}

function resolveDirectiveBasePlan(world: WorldState, inputPlan?: StrategicPlan): StrategicPlan {
  if (inputPlan) {
    return {
      ...inputPlan,
      orders: inputPlan.orders.slice(0, 8),
      constraints: inputPlan.constraints.slice(0, 16),
      reviewAfterTicks: Math.max(1, Math.min(6, Math.round(inputPlan.reviewAfterTicks || 2))),
    }
  }

  const defaultFactionExec = world.executions?.[resolveDefaultFactionId()] ?? null
  if (defaultFactionExec?.currentPlan) {
    return {
      ...defaultFactionExec.currentPlan,
      orders: defaultFactionExec.currentPlan.orders.slice(0, 8),
      constraints: defaultFactionExec.currentPlan.constraints.slice(0, 16),
      reviewAfterTicks: Math.max(1, Math.min(6, Math.round(defaultFactionExec.currentPlan.reviewAfterTicks || 2))),
    }
  }

  return {
    intent: 'directive_preview',
    priority: 'medium',
    orders: [],
    constraints: ['directive_preview_default_plan_v1'],
    reviewAfterTicks: 2,
  }
}

function normalizeExecutionMode(mode?: ExecutionEnqueueMode): ExecutionEnqueueMode {
  if (mode === 'append' || mode === 'reject_if_active') {
    return mode
  }

  return 'replace'
}

function normalizeExpectedExecutionRequestId(rawValue?: string) {
  const normalized = rawValue?.trim()
  return normalized ? normalized : undefined
}

function applyGeneralDirectivesToPlan(
  world: WorldState,
  plan: StrategicPlan,
  generals: FactionGeneral[],
  directives: GeneralDirective[],
): GeneralDirectiveResolutionResult {
  const byUnitId = new Map<string, StrategicPlan['orders'][number]>()
  for (const order of plan.orders) {
    byUnitId.set(order.unitId, order)
  }

  let accepted = 0
  let rejected = 0
  const warnings: string[] = []
  const items: GeneralDirectivePreviewItem[] = []
  const resolvedOrdersByUnitId = new Map<string, { action: ActionType; target: string; directiveIndex: number }>()

  for (const [directiveIndex, directive] of directives.slice(0, MAX_GENERAL_DIRECTIVES).entries()) {
    const action = resolveDirectiveAction(directive)
    const baseItem: Omit<GeneralDirectivePreviewItem, 'status' | 'reason' | 'matchMode' | 'confidence'> = {
      directiveIndex,
      generalIdInput: directive.generalId,
      instruction: directive.instruction,
      action,
    }

    const generalResolution = resolveDirectiveGeneral(generals, directive.generalId)
    if (generalResolution.warning) {
      warnings.push(generalResolution.warning)
    }

    const general = generalResolution.general
    if (!general) {
      rejected += 1
      items.push({
        ...baseItem,
        status: 'rejected',
        matchMode: generalResolution.matchMode,
        confidence: generalResolution.confidence,
        reason: generalResolution.reason,
        warning: generalResolution.warning,
      })
      continue
    }

    const targetResolution = resolveDirectiveTargetTile(world, general, directive, action)
    if (targetResolution.warning) {
      warnings.push(targetResolution.warning)
    }

    if (!targetResolution.targetTileId) {
      rejected += 1
      items.push({
        ...baseItem,
        status: 'rejected',
        matchMode: generalResolution.matchMode,
        confidence: lowerConfidence(generalResolution.confidence),
        reason: targetResolution.reason,
        warning: targetResolution.warning,
        resolvedGeneralId: general.id,
        resolvedGeneralName: general.name,
        resolvedUnitId: general.unitId,
      })
      continue
    }

    const existingDirective = resolvedOrdersByUnitId.get(general.unitId)
    if (existingDirective) {
      rejected += 1

      const duplicate =
        existingDirective.action === action && existingDirective.target === targetResolution.targetTileId

      const reason = duplicate
        ? `directive duplicate: unit ${general.unitId} at #${directiveIndex + 1} duplicates #${existingDirective.directiveIndex + 1}`
        : `directive conflict: unit ${general.unitId} has multiple directives (#${existingDirective.directiveIndex + 1} kept, #${directiveIndex + 1} dropped)`

      warnings.push(reason)
      items.push({
        ...baseItem,
        status: duplicate ? 'duplicate' : 'conflict',
        matchMode: generalResolution.matchMode,
        confidence: lowerConfidence(generalResolution.confidence),
        reason,
        resolvedGeneralId: general.id,
        resolvedGeneralName: general.name,
        resolvedUnitId: general.unitId,
        targetTileId: targetResolution.targetTileId,
        targetTileName: targetResolution.targetTileName,
      })
      continue
    }

    resolvedOrdersByUnitId.set(general.unitId, {
      action,
      target: targetResolution.targetTileId,
      directiveIndex,
    })

    accepted += 1
    items.push({
      ...baseItem,
      status: 'accepted',
      matchMode: generalResolution.matchMode,
      confidence: combineConfidence(generalResolution.confidence, targetResolution.confidence),
      reason: `${generalResolution.reason}; ${targetResolution.reason}`,
      warning: generalResolution.warning ?? targetResolution.warning,
      resolvedGeneralId: general.id,
      resolvedGeneralName: general.name,
      resolvedUnitId: general.unitId,
      targetTileId: targetResolution.targetTileId,
      targetTileName: targetResolution.targetTileName,
    })
  }

  for (const [unitId, resolvedOrder] of resolvedOrdersByUnitId.entries()) {
    byUnitId.set(unitId, {
      unitId,
      action: resolvedOrder.action,
      target: resolvedOrder.target,
    })
  }

  const mergedPlan = accepted === 0
    ? plan
    : {
        ...plan,
        orders: Array.from(byUnitId.values()).slice(0, 8),
        constraints: Array.from(
          new Set([...plan.constraints, 'general_directive_nl_v1', 'directive_conflict_guard_v1']),
        ).slice(0, 16),
      }

  return {
    plan: mergedPlan,
    accepted,
    rejected,
    warnings,
    items,
  }
}

type DirectiveGeneralResolution = {
  general?: FactionGeneral
  warning?: string
  reason: string
  matchMode: GeneralDirectivePreviewMatchMode
  confidence: GeneralDirectivePreviewConfidence
}

type DirectiveTargetResolution = {
  targetTileId?: string
  targetTileName?: string
  warning?: string
  reason: string
  confidence: GeneralDirectivePreviewConfidence
}

function resolveDirectiveGeneral(generals: FactionGeneral[], identity: string): DirectiveGeneralResolution {
  const rawIdentity = identity.trim()
  if (!rawIdentity) {
    return {
      reason: 'directive ignored: empty general identity',
      matchMode: 'none',
      confidence: 'low',
      warning: 'directive ignored: empty general identity',
    }
  }

  const normalizedIdentity = normalizeMatchText(rawIdentity)
  if (!normalizedIdentity) {
    return {
      reason: `directive ignored: invalid general identity ${rawIdentity}`,
      matchMode: 'none',
      confidence: 'low',
      warning: `directive ignored: invalid general identity ${rawIdentity}`,
    }
  }

  const exactRawMatch = generals.find(
    (general) => general.id === rawIdentity || general.unitId === rawIdentity || general.name === rawIdentity,
  )
  if (exactRawMatch) {
    return {
      general: exactRawMatch,
      reason: 'general matched by exact identifier',
      matchMode: 'exact',
      confidence: 'high',
    }
  }

  const exactNormalizedMatch = generals.find((general) => {
    const candidates = [general.id, general.unitId, general.name].map((value) => normalizeMatchText(value))
    return candidates.includes(normalizedIdentity)
  })
  if (exactNormalizedMatch) {
    return {
      general: exactNormalizedMatch,
      reason: 'general matched by normalized identifier',
      matchMode: 'normalized',
      confidence: 'high',
    }
  }

  const partialMatch = generals.find((general) => {
    const candidates = [general.name, general.id, general.unitId]
      .map((value) => normalizeMatchText(value))
      .filter((value) => value.length >= 2)

    return candidates.some(
      (candidate) =>
        candidate.includes(normalizedIdentity) ||
        (normalizedIdentity.length >= 2 && normalizedIdentity.includes(candidate)),
    )
  })

  if (partialMatch) {
    return {
      general: partialMatch,
      reason: 'general matched by partial identity',
      matchMode: 'partial',
      confidence: 'medium',
      warning: `directive general matched by partial identity: ${rawIdentity} -> ${partialMatch.name}`,
    }
  }

  const scoredMatches = generals
    .map((general) => ({
      general,
      score: scoreGeneralIdentity(normalizedIdentity, general),
    }))
    .sort((left, right) => right.score - left.score)

  const best = scoredMatches[0]
  const second = scoredMatches[1]
  if (!best || best.score < GENERAL_NAME_FUZZY_MIN_SCORE) {
    return {
      reason: `directive ignored: no reliable general match for ${rawIdentity}`,
      matchMode: 'none',
      confidence: 'low',
      warning: `directive ignored: no reliable general match for ${rawIdentity}`,
    }
  }

  if (second && best.score - second.score < GENERAL_NAME_FUZZY_GAP) {
    return {
      reason: `directive ignored: ambiguous general identity ${rawIdentity}`,
      matchMode: 'none',
      confidence: 'low',
      warning: `directive ignored: ambiguous general identity ${rawIdentity}, top candidates ${best.general.name}/${second.general.name}`,
    }
  }

  return {
    general: best.general,
    reason: 'general matched by fuzzy identity score',
    matchMode: 'fuzzy',
    confidence: best.score >= 0.88 ? 'high' : 'medium',
    warning: `directive general matched by fuzzy score: ${rawIdentity} -> ${best.general.name} (${best.score.toFixed(2)})`,
  }
}

function resolveDirectiveAction(directive: GeneralDirective): ActionType {
  if (directive.action) {
    return directive.action
  }

  const instruction = directive.instruction.trim().toLowerCase()

  const hasAnyToken = (tokens: string[]) => tokens.some((token) => instruction.includes(token))

  if (hasAnyToken(['recon', 'scout', '侦察', '探路'])) {
    return 'recon'
  }

  if (hasAnyToken(['support', 'assist', '支援', '补给', '策应'])) {
    return 'support'
  }

  if (hasAnyToken(['garrison', 'hold', 'defend', '驻防', '守城', '防守'])) {
    return 'garrison'
  }

  if (hasAnyToken(['capture', 'siege', '开荒', '攻城', '占领', '夺取'])) {
    return 'capture'
  }

  if (hasAnyToken(['attack', 'fight', 'march', '打架', '进攻', '攻击', '推进'])) {
    return 'march'
  }

  return 'recon'
}

function resolveDirectiveTargetTile(
  world: WorldState,
  general: FactionGeneral,
  directive: GeneralDirective,
  action: ActionType,
): DirectiveTargetResolution {
  const explicitTarget = directive.targetTileId?.trim()
  if (explicitTarget) {
    const matchedTile = world.map.tiles.find((tile) => tile.id === explicitTarget)
    if (matchedTile) {
      return {
        targetTileId: matchedTile.id,
        targetTileName: matchedTile.name,
        reason: 'target resolved by explicit targetTileId',
        confidence: 'high',
      }
    }

    return {
      reason: `explicit targetTileId not found: ${explicitTarget}`,
      confidence: 'low',
      warning: `directive target not found: ${explicitTarget}`,
    }
  }

  const instruction = directive.instruction.trim()
  if (instruction) {
    const normalizedInstruction = normalizeMatchText(instruction)

    const byTileId = world.map.tiles.find((tile) => normalizedInstruction.includes(normalizeMatchText(tile.id)))
    if (byTileId) {
      return {
        targetTileId: byTileId.id,
        targetTileName: byTileId.name,
        reason: 'target resolved from tileId token in instruction',
        confidence: 'high',
      }
    }

    const byTileName = world.map.tiles
      .filter((tile) => !!tile.name)
      .map((tile) => ({
        tile,
        normalizedName: normalizeMatchText(tile.name),
      }))
      .filter(({ normalizedName }) => normalizedName && normalizedInstruction.includes(normalizedName))
      .sort((left, right) => right.normalizedName.length - left.normalizedName.length)[0]?.tile

    if (byTileName) {
      return {
        targetTileId: byTileName.id,
        targetTileName: byTileName.name,
        reason: 'target resolved from tile name in instruction',
        confidence: 'high',
      }
    }

    const aliasHit = resolveDirectiveTargetByAlias(world, normalizedInstruction)
    if (aliasHit) {
      return {
        targetTileId: aliasHit.id,
        targetTileName: aliasHit.name,
        reason: 'target resolved by alias dictionary',
        confidence: 'medium',
      }
    }
  }

  const fallbackTarget = pickFallbackDirectiveTargetTileId(world, general, action)
  if (fallbackTarget) {
    const tile = world.map.tiles.find((candidate) => candidate.id === fallbackTarget)

    return {
      targetTileId: fallbackTarget,
      targetTileName: tile?.name,
      reason: 'target resolved by tactical fallback heuristic',
      confidence: 'low',
      warning: `directive target fallback applied for general ${general.name}`,
    }
  }

  return {
    reason: `directive ignored: no viable target for general ${general.name}`,
    confidence: 'low',
    warning: `directive ignored: no target for general ${general.name}`,
  }
}

function resolveDirectiveTargetByAlias(world: WorldState, normalizedInstruction: string) {
  if (!normalizedInstruction) {
    return undefined
  }

  for (const entry of TARGET_TILE_ALIAS_TABLE) {
    const canonicalToken = normalizeMatchText(entry.canonical)
    const aliasTokens = [entry.canonical, ...entry.aliases]
      .map((alias) => normalizeMatchText(alias))
      .filter(Boolean)

    const hasAliasHit = aliasTokens.some((aliasToken) => normalizedInstruction.includes(aliasToken))
    if (!hasAliasHit) {
      continue
    }

    const candidates = world.map.tiles
      .filter((tile) => !!tile.name)
      .map((tile) => ({
        tile,
        normalizedName: normalizeMatchText(tile.name),
      }))
      .filter(
        ({ normalizedName }) =>
          normalizedName.includes(canonicalToken) || aliasTokens.some((aliasToken) => normalizedName.includes(aliasToken)),
      )
      .sort((left, right) => right.tile.enemyPressure - left.tile.enemyPressure)

    if (candidates[0]) {
      return candidates[0].tile
    }
  }

  return undefined
}

function combineConfidence(
  generalConfidence: GeneralDirectivePreviewConfidence,
  targetConfidence: GeneralDirectivePreviewConfidence,
): GeneralDirectivePreviewConfidence {
  if (generalConfidence === 'high' && targetConfidence === 'high') {
    return 'high'
  }

  if (generalConfidence === 'low' || targetConfidence === 'low') {
    return 'low'
  }

  return 'medium'
}

function lowerConfidence(confidence: GeneralDirectivePreviewConfidence): GeneralDirectivePreviewConfidence {
  if (confidence === 'high') {
    return 'medium'
  }

  return 'low'
}

function pickFallbackDirectiveTargetTileId(world: WorldState, general: FactionGeneral, action: ActionType) {
  const ownTiles = world.map.tiles.filter((tile) => tile.owner === general.faction)
  const foreignTiles = world.map.tiles.filter((tile) => tile.owner !== general.faction)

  const sortedOwnTiles = ownTiles
    .slice()
    .sort((left, right) => right.enemyPressure - left.enemyPressure)
  const sortedForeignTiles = foreignTiles
    .slice()
    .sort((left, right) => right.enemyPressure - left.enemyPressure)

  if (action === 'garrison' || action === 'support') {
    return sortedOwnTiles[0]?.id ?? ownTiles[0]?.id
  }

  if (action === 'capture') {
    const neutralOrEnemy = foreignTiles
      .slice()
      .sort((left, right) => {
        const leftScore = (left.owner === 'neutral' ? 2 : 1) + left.enemyPressure
        const rightScore = (right.owner === 'neutral' ? 2 : 1) + right.enemyPressure
        return rightScore - leftScore
      })

    return neutralOrEnemy[0]?.id ?? sortedForeignTiles[0]?.id
  }

  if (action === 'march' || action === 'recon') {
    return sortedForeignTiles[0]?.id ?? foreignTiles[0]?.id
  }

  const currentUnit = world.units.find((unit) => unit.id === general.unitId)
  return currentUnit?.tileId
}

function scoreGeneralIdentity(normalizedIdentity: string, general: FactionGeneral) {
  const normalizedName = normalizeMatchText(general.name)
  const normalizedId = normalizeMatchText(general.id)
  const normalizedUnitId = normalizeMatchText(general.unitId)

  const nameScore = scoreTokenSimilarity(normalizedIdentity, normalizedName)
  const idScore = scoreTokenSimilarity(normalizedIdentity, normalizedId) * 0.82
  const unitScore = scoreTokenSimilarity(normalizedIdentity, normalizedUnitId) * 0.82

  const surnameHint =
    normalizedIdentity.length === 1 && normalizedName.startsWith(normalizedIdentity)
      ? 0.76
      : 0

  return Math.max(nameScore, idScore, unitScore, surnameHint)
}

function scoreTokenSimilarity(input: string, candidate: string) {
  if (!input || !candidate) {
    return 0
  }

  if (input === candidate) {
    return 1
  }

  if (input.includes(candidate) || candidate.includes(input)) {
    const maxLength = Math.max(input.length, candidate.length)
    const lengthGap = Math.abs(input.length - candidate.length)
    const gapPenalty = maxLength > 0 ? lengthGap / maxLength : 0
    return Math.max(0.75, 0.96 - gapPenalty * 0.24)
  }

  const maxLength = Math.max(input.length, candidate.length)
  if (maxLength === 0) {
    return 0
  }

  const editDistance = levenshteinDistance(input, candidate)
  const editScore = 1 - editDistance / maxLength
  const overlapScore = characterOverlapScore(input, candidate)

  return Math.max(editScore * 0.9, overlapScore * 0.88)
}

function characterOverlapScore(input: string, candidate: string) {
  if (!input || !candidate) {
    return 0
  }

  const counts = new Map<string, number>()
  for (const char of candidate) {
    counts.set(char, (counts.get(char) ?? 0) + 1)
  }

  let matched = 0
  for (const char of input) {
    const remaining = counts.get(char) ?? 0
    if (remaining <= 0) {
      continue
    }

    counts.set(char, remaining - 1)
    matched += 1
  }

  return matched / Math.max(1, candidate.length)
}

function levenshteinDistance(left: string, right: string) {
  if (left === right) {
    return 0
  }

  if (!left.length) {
    return right.length
  }

  if (!right.length) {
    return left.length
  }

  const previous = new Array<number>(right.length + 1)
  const current = new Array<number>(right.length + 1)

  for (let index = 0; index <= right.length; index += 1) {
    previous[index] = index
  }

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i

    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      )
    }

    for (let j = 0; j <= right.length; j += 1) {
      previous[j] = current[j]
    }
  }

  return previous[right.length]
}

function normalizeMatchText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\s\-_,.;:!?\u3002\uff0c\u3001\uff1b\uff1a\u201c\u201d\u2018\u2019"'`~\u00b7()\uff08\uff09\u005b\u005d\u3010\u3011{}<>\u300a\u300b|/\\]+/g, '')
}

export async function advanceTickAction(includeWorld = true): Promise<WorldActionResponse> {
  const mutationLock = tryAcquireWorldMutationLock('advance_tick')
  if (!mutationLock) {
    return buildWorldMutationBusyResponse(includeWorld)
  }

  try {
    const { domainCommWindow, nationalAgenda } = compileNationalAgendaForCurrentWorld(9)
    const courtSession = runCourtSession({
      world: worldState,
      nationalAgenda,
      maxProposals: 9,
    })

    recordAgendaWindowMemory(nationalAgenda)
    recordCourtSessionMemory(courtSession)

    appendWorldEvent({
      category: 'system',
      action: 'domain_comm_window',
      success: true,
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
      metadata: {
        domains: domainCommWindow.domains.length,
        totalPublished: domainCommWindow.totalPublished,
        totalDelivered: domainCommWindow.totalDelivered,
        totalDropped: domainCommWindow.totalDropped,
      },
    })

    appendWorldEvent({
      category: 'system',
      action: 'national_agenda_window',
      success: true,
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
      metadata: {
        optionCountIn: nationalAgenda.optionCountIn,
        optionCountOut: nationalAgenda.optionCountOut,
      },
    })

    appendWorldEvent({
      category: 'system',
      action: 'court_session_closed',
      success: true,
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
      metadata: {
        seatCount: courtSession.seats.length,
        proposalCount: courtSession.proposals.length,
        passed: courtSession.resolutions.filter((item) => item.decision === 'passed').length,
      },
    })

    const previousWorld = structuredClone(worldState)
    commitWorldState(advanceTick(worldState))
    refreshReplayArchive()

    // V2 resource settlement: apply per-tick resource gains and costs for all V2 AI players
    settleResourcesForAllPlayers((tileId: string) => {
      const tile = worldState.map.tiles.find((t: { id: string; type: string; cityLevel?: number; resourceKind?: string }) => t.id === tileId)
      if (!tile) return undefined
      return { type: tile.type, cityLevel: tile.cityLevel, resourceKind: tile.resourceKind }
    })

    const reflectResult = await reflectWorldTick({
      before: previousWorld,
      after: worldState,
      commanderId: process.env.COMMANDER_AGENT_ID?.trim() || `commander_${Object.keys(worldState.factions)[0] ?? 'default'}`,
    })

    recordSimulationNarrativeEvents(reflectResult.events)

    const passedResolutions = courtSession.resolutions.filter((item) => item.decision === 'passed')
    recordExecutionOutcomeMemory({
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
      narrativeCount: reflectResult.events.length,
      memoryWrites: reflectResult.memoryWrites,
      memoryWriteFailures: reflectResult.memoryWriteFailures,
      passedResolutions,
    })

    // WebSocket delta broadcast for subscribed clients
    broadcastTickDelta(previousWorld, worldState, reflectResult.events)
    const previousBattleRecordIds = new Set(previousWorld.feedback.battleRecords.map((record) => record.id))
    for (const br of worldState.feedback.battleRecords) {
      if (!previousBattleRecordIds.has(br.id)) {
        broadcastBattleReport(worldState.tick, br)
      }
    }

    const response: WorldActionResponse = {
      ...buildWorldActionResponse({
        ok: true,
        includeWorld,
      }),
      nationalAgenda,
      courtSession,
    }

    appendWorldEvent({
      category: 'world_action',
      action: 'advance_tick',
      success: true,
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
      metadata: {
        narrativeEvents: reflectResult.events.length,
        memoryWrites: reflectResult.memoryWrites,
        memoryWriteFailures: reflectResult.memoryWriteFailures,
        profileUpdates: reflectResult.profileUpdates,
        causalLinks: reflectResult.causalLinks,
        consequenceLinks: reflectResult.consequenceLinks,
        domainCommDomains: domainCommWindow.domains.length,
        domainCommPublished: domainCommWindow.totalPublished,
        domainCommDelivered: domainCommWindow.totalDelivered,
        domainCommDropped: domainCommWindow.totalDropped,
        nationalAgendaOptionIn: nationalAgenda.optionCountIn,
        nationalAgendaOptionOut: nationalAgenda.optionCountOut,
        courtSeatCount: courtSession.seats.length,
        courtProposalCount: courtSession.proposals.length,
        courtResolutionPassed: passedResolutions.length,
      },
    })

    return response
  } finally {
    mutationLock.release()
  }
}

export function clearPlanExecutionAction(includeWorld = true, factionId?: FactionId): WorldActionResponse {
  const mutationLock = tryAcquireWorldMutationLock('clear_plan_execution')
  if (!mutationLock) {
    return buildWorldMutationBusyResponse(includeWorld)
  }

  try {
    const targetFactionId = factionId ?? resolveDefaultFactionId()
    commitWorldState(clearPlanExecution(worldState, targetFactionId))
    refreshReplayArchive()

    const response = buildWorldActionResponse({
      ok: true,
      includeWorld,
    })

    appendWorldEvent({
      category: 'world_action',
      action: 'clear_plan_execution',
      success: true,
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
    })

    return response
  } finally {
    mutationLock.release()
  }
}

export function moveUnitAction(
  unitId: string,
  targetTileId: string,
  includeWorld = true,
  factionId?: FactionId,
): WorldActionResponse {
  const mutationLock = tryAcquireWorldMutationLock('move_unit')
  if (!mutationLock) {
    return buildWorldMutationBusyResponse(includeWorld)
  }

  try {
    const targetFactionId = factionId ?? resolveDefaultFactionId()
    const result = moveUnit(worldState, unitId, targetTileId, targetFactionId)
    if (!result.ok) {
      const failed = buildWorldActionResponse({
        ok: false,
        includeWorld,
        message: result.message,
      })

      appendWorldEvent({
        category: 'world_action',
        action: 'move_unit',
        success: false,
        tick: worldState.tick,
        worldVersion: worldState.worldVersion,
        message: result.message,
        metadata: { unitId, targetTileId, factionId: targetFactionId },
      })

      return failed
    }

    commitWorldState(result.world)

    const succeeded = buildWorldActionResponse({
      ok: true,
      includeWorld,
      message: result.message,
      unitId: result.unitId,
    })

    appendWorldEvent({
      category: 'world_action',
      action: 'move_unit',
      success: true,
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
      message: result.message,
      metadata: { unitId, targetTileId, factionId: targetFactionId },
    })

    return succeeded
  } finally {
    mutationLock.release()
  }
}

export function upgradeCityAction(tileId: string, includeWorld = true, factionId?: FactionId): WorldActionResponse {
  const mutationLock = tryAcquireWorldMutationLock('upgrade_city')
  if (!mutationLock) {
    return buildWorldMutationBusyResponse(includeWorld)
  }

  try {
    const targetFactionId = factionId ?? resolveDefaultFactionId()
    const result = upgradeCity(worldState, tileId, targetFactionId)
    if (!result.ok) {
      const failed = buildWorldActionResponse({
        ok: false,
        includeWorld,
        message: result.message,
      })

      appendWorldEvent({
        category: 'world_action',
        action: 'upgrade_city',
        success: false,
        tick: worldState.tick,
        worldVersion: worldState.worldVersion,
        message: result.message,
        metadata: { tileId, factionId: targetFactionId },
      })

      return failed
    }

    commitWorldState(result.world)

    const succeeded = buildWorldActionResponse({
      ok: true,
      includeWorld,
      message: result.message,
    })

    appendWorldEvent({
      category: 'world_action',
      action: 'upgrade_city',
      success: true,
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
      message: result.message,
      metadata: {
        tileId,
        factionId: targetFactionId,
        cityHallTileId: result.cityHallTileId,
      },
    })

    return succeeded
  } finally {
    mutationLock.release()
  }
}

export function upgradeCityTechAction(
  tileId: string,
  techId: CityTechTrackId,
  includeWorld = true,
  factionId?: FactionId,
): WorldActionResponse {
  const mutationLock = tryAcquireWorldMutationLock('upgrade_city_tech')
  if (!mutationLock) {
    return buildWorldMutationBusyResponse(includeWorld)
  }

  try {
    const targetFactionId = factionId ?? resolveDefaultFactionId()
    const result = upgradeCityTech(worldState, tileId, techId, targetFactionId)
    if (!result.ok) {
      const failed = buildWorldActionResponse({
        ok: false,
        includeWorld,
        message: result.message,
      })

      appendWorldEvent({
        category: 'world_action',
        action: 'upgrade_city_tech',
        success: false,
        tick: worldState.tick,
        worldVersion: worldState.worldVersion,
        message: result.message,
        metadata: { tileId, techId, factionId: targetFactionId },
      })

      return failed
    }

    commitWorldState(result.world)

    const succeeded = buildWorldActionResponse({
      ok: true,
      includeWorld,
      message: result.message,
    })

    appendWorldEvent({
      category: 'world_action',
      action: 'upgrade_city_tech',
      success: true,
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
      message: result.message,
      metadata: {
        tileId,
        factionId: targetFactionId,
        cityHallTileId: result.cityHallTileId,
        techId: result.techId,
        nextLevel: result.nextLevel,
      },
    })

    return succeeded
  } finally {
    mutationLock.release()
  }
}

export function deployReserveHeroAction(
  factionId: string,
  heroId: string,
  tileId: string,
  includeWorld = true,
): WorldActionResponse {
  const mutationLock = tryAcquireWorldMutationLock('deploy_reserve_hero')
  if (!mutationLock) {
    return buildWorldMutationBusyResponse(includeWorld)
  }

  try {
    const result = deployReserveHero(worldState, factionId, heroId, tileId)
    if (!result.ok) {
      const failed = buildWorldActionResponse({
        ok: false,
        includeWorld,
        message: result.message,
      })

      appendWorldEvent({
        category: 'world_action',
        action: 'deploy_reserve_hero',
        success: false,
        tick: worldState.tick,
        worldVersion: worldState.worldVersion,
        message: result.message,
        metadata: { factionId, heroId, tileId },
      })

      return failed
    }

    commitWorldState(result.world)

    const succeeded = buildWorldActionResponse({
      ok: true,
      includeWorld,
      message: result.message,
      unitId: result.unitId,
    })

    appendWorldEvent({
      category: 'world_action',
      action: 'deploy_reserve_hero',
      success: true,
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
      message: result.message,
      metadata: { factionId, heroId, tileId },
    })

    return succeeded
  } finally {
    mutationLock.release()
  }
}

export function queueTacticalOverrideAction(
  unitId: string,
  templateId: Parameters<typeof queueTacticalOverride>[2],
  targetTileId: string,
  summary: string,
  includeWorld = true,
  factionId?: FactionId,
): WorldActionResponse {
  const mutationLock = tryAcquireWorldMutationLock('queue_tactical_override')
  if (!mutationLock) {
    return buildWorldMutationBusyResponse(includeWorld)
  }

  try {
    const targetFactionId = factionId ?? resolveDefaultFactionId()
    const nextWorld = queueTacticalOverride(worldState, unitId, templateId, targetTileId, summary, targetFactionId)
    if (nextWorld === worldState) {
      const message = `invalid tactical override target for faction ${targetFactionId}`
      const failed = buildWorldActionResponse({
        ok: false,
        includeWorld,
        message,
      })
      appendWorldEvent({
        category: 'world_action',
        action: 'queue_tactical_override',
        success: false,
        tick: worldState.tick,
        worldVersion: worldState.worldVersion,
        message,
        metadata: { unitId, templateId, targetTileId, factionId: targetFactionId },
      })
      return failed
    }

    commitWorldState(nextWorld)

    const response = buildWorldActionResponse({
      ok: true,
      includeWorld,
    })

    appendWorldEvent({
      category: 'world_action',
      action: 'queue_tactical_override',
      success: true,
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
      metadata: { unitId, templateId, targetTileId, factionId: targetFactionId },
    })

    return response
  } finally {
    mutationLock.release()
  }
}

export function updateAllianceDirectiveAction(
  regionId: string,
  stance: Parameters<typeof updateAllianceDirective>[2],
  includeWorld = true,
): WorldActionResponse {
  const mutationLock = tryAcquireWorldMutationLock('update_alliance_directive')
  if (!mutationLock) {
    return buildWorldMutationBusyResponse(includeWorld)
  }

  try {
    commitWorldState(updateAllianceDirective(worldState, regionId, stance))

    const response = buildWorldActionResponse({
      ok: true,
      includeWorld,
    })

    appendWorldEvent({
      category: 'world_action',
      action: 'update_alliance_directive',
      success: true,
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
      metadata: { regionId, stance },
    })

    return response
  } finally {
    mutationLock.release()
  }
}

function commitWorldState(nextWorld: WorldState) {
  const previousWorld = worldState
  syncAllFactionAiQuota(nextWorld)
  worldState = nextWorld

  syncWorldMapLayout(previousWorld, nextWorld)
  recordTileStateDiff(previousWorld, nextWorld)
  recordIntelDiff(previousWorld, nextWorld)
  scheduleWorldPersist(() => worldState)
}

export async function flushWorldPersist() {
  await flushWorldPersistFromPersistence(() => worldState)
}


function buildOverlaySignature(overlays: WorldState['map']['overlays']) {
  const mountainSignature = overlays.mountainRidges
    .map((path) => `${path.id}:${path.tileIds.length}:${path.nodes.length}`)
    .join('|')
  const riverSignature = overlays.rivers.map((path) => `${path.id}:${path.tileIds.length}:${path.nodes.length}`).join('|')
  const citySignature = overlays.cityClusters
    .map(
      (cluster) =>
        `${cluster.id}:${cluster.tileIds.join(',')}:${cluster.cityHallTileId}:${cluster.owner}:${cluster.camp}:${cluster.footprintTiles}:${cluster.upgradeCapTiles}:${cluster.isUpgradeable}:${cluster.techLevels?.governance ?? 0}-${cluster.techLevels?.logistics ?? 0}-${cluster.techLevels?.defense ?? 0}-${cluster.techLevels?.recruitment ?? 0}`,
    )
    .join('|')

  return `${mountainSignature}#${riverSignature}#${citySignature}`
}

function syncWorldMapLayout(previousWorld: WorldState, nextWorld: WorldState) {
  const previousTiles = previousWorld.map.tiles
  const nextTiles = nextWorld.map.tiles
  const previousLastTileId = previousTiles.length > 0 ? previousTiles[previousTiles.length - 1].id : undefined
  const nextLastTileId = nextTiles.length > 0 ? nextTiles[nextTiles.length - 1].id : undefined
  const previousOverlaySignature = buildOverlaySignature(previousWorld.map.overlays)
  const nextOverlaySignature = buildOverlaySignature(nextWorld.map.overlays)

  const layoutChanged =
    previousWorld.map.width !== nextWorld.map.width ||
    previousWorld.map.height !== nextWorld.map.height ||
    previousTiles.length !== nextTiles.length ||
    previousWorld.map.regions.length !== nextWorld.map.regions.length ||
    previousOverlaySignature !== nextOverlaySignature ||
    previousTiles[0]?.id !== nextTiles[0]?.id ||
    previousLastTileId !== nextLastTileId

  if (!layoutChanged) {
    return
  }

  mapLayoutVersion += 1
  worldMapLayout = buildWorldMapLayout(nextWorld, mapLayoutVersion)
  rebuildMapLayoutIndexes()
  tileStateDiffByVersion.clear()
  intelDiffByVersion.clear()
}

function buildWorldMapLayout(world: WorldState, layoutVersion: number): WorldMapLayoutResponse {
  const tiles: WorldMapLayoutTile[] = world.map.tiles.map((tile) => {
    const { owner, enemyPressure, ...layoutTile } = tile
    void owner
    void enemyPressure
    return layoutTile
  })

  return {
    mapLayoutVersion: layoutVersion,
    map: {
      width: world.map.width,
      height: world.map.height,
      tiles,
      connections: world.map.connections,
      regions: world.map.regions,
      overlays: world.map.overlays,
    },
  }
}

function rebuildMapLayoutIndexes() {
  const nextTileByCoord = new Map<string, WorldMapLayoutTile>()
  for (const tile of worldMapLayout.map.tiles) {
    nextTileByCoord.set(coordKey(tile.x, tile.y), tile)
  }

  const nextRegionIdByTileId = new Map<string, string>()
  for (const region of worldMapLayout.map.regions) {
    for (const tileId of region.tileIds) {
      if (!nextRegionIdByTileId.has(tileId)) {
        nextRegionIdByTileId.set(tileId, region.id)
      }
    }
  }

  mapLayoutTileByCoord = nextTileByCoord
  mapLayoutRegionIdByTileId = nextRegionIdByTileId
}

function coordKey(x: number, y: number) {
  return `${x}_${y}`
}

function clampGridCoordinate(value: number, maxValue: number) {
  return Math.max(0, Math.min(maxValue - 1, Math.floor(value)))
}

function resolveViewportScopeFromCenter(centerX: number, centerY: number, layer: MapHierarchyLayer) {
  const clampedX = clampGridCoordinate(centerX, worldMapLayout.map.width)
  const clampedY = clampGridCoordinate(centerY, worldMapLayout.map.height)
  const centerTile = mapLayoutTileByCoord.get(coordKey(clampedX, clampedY))

  if (!centerTile) {
    return {
      scope: 'bootstrap' as const,
    }
  }

  if (layer === 'region' || layer === 'tile') {
    const regionId = mapLayoutRegionIdByTileId.get(centerTile.id)
    if (regionId) {
      return {
        scope: 'region' as const,
        regionId,
      }
    }
  }

  const provinceId = centerTile.district?.trim()
  if (provinceId) {
    return {
      scope: 'province' as const,
      provinceId,
    }
  }

  return {
    scope: 'bootstrap' as const,
  }
}

function resolveWorldMapLayoutOptions(options?: WorldMapLayoutOptions): ResolvedWorldMapLayoutOptions {
  if (options?.scope === 'viewport') {
    const centerX =
      typeof options.centerX === 'number' && Number.isFinite(options.centerX)
        ? Math.floor(options.centerX)
        : Number.NaN
    const centerY =
      typeof options.centerY === 'number' && Number.isFinite(options.centerY)
        ? Math.floor(options.centerY)
        : Number.NaN

    if (Number.isFinite(centerX) && Number.isFinite(centerY)) {
      return {
        scope: 'viewport',
        centerX,
        centerY,
        layer: options.layer ?? 'province',
      }
    }

    return {
      scope: 'bootstrap',
    }
  }

  if ((options?.scope === 'province' || (!!options?.provinceId && options.scope !== 'region')) && options.provinceId) {
    return {
      scope: 'province',
      provinceId: options.provinceId,
    }
  }

  if ((options?.scope === 'region' || (!!options?.regionId && !options.provinceId)) && options.regionId) {
    return {
      scope: 'region',
      regionId: options.regionId,
    }
  }

  if (options?.scope === 'bootstrap') {
    return {
      scope: 'bootstrap',
    }
  }

  return {
    scope: 'full',
  }
}

function buildProvinceLayoutChunk(provinceIdRaw: string): WorldMapLayoutResponse {
  const provinceId = provinceIdRaw.trim().toLowerCase()
  const tileIds = new Set<string>()

  for (const tile of worldMapLayout.map.tiles) {
    if ((tile.district ?? '').trim().toLowerCase() === provinceId) {
      tileIds.add(tile.id)
    }
  }

  const loadedProvinceIds = tileIds.size > 0 ? [provinceId] : []
  const pendingProvinceIds = listProvinceIds(worldMapLayout.map.tiles).filter((id) => !loadedProvinceIds.includes(id))

  return {
    mapLayoutVersion,
    map: buildLayoutChunkByTileIds(worldMapLayout.map, tileIds),
    chunk: {
      scope: 'province',
      id: provinceId,
      loadedProvinceIds,
      pendingProvinceIds,
    },
  }
}

function buildRegionLayoutChunk(regionIdRaw: string): WorldMapLayoutResponse {
  const regionId = regionIdRaw.trim()
  const region = worldMapLayout.map.regions.find((item) => item.id === regionId)

  if (!region) {
    return buildBootstrapLayoutChunk()
  }

  const tileIds = new Set<string>(region.tileIds)
  const loadedProvinceIds = listProvinceIds(worldMapLayout.map.tiles.filter((tile) => tileIds.has(tile.id)))
  const pendingProvinceIds = listProvinceIds(worldMapLayout.map.tiles).filter((id) => !loadedProvinceIds.includes(id))

  return {
    mapLayoutVersion,
    map: buildLayoutChunkByTileIds(worldMapLayout.map, tileIds),
    chunk: {
      scope: 'region',
      id: region.id,
      loadedProvinceIds,
      pendingProvinceIds,
    },
  }
}

function buildViewportLayoutChunk(
  centerX: number,
  centerY: number,
  layer: MapHierarchyLayer,
): WorldMapLayoutResponse {
  const target = resolveViewportScopeFromCenter(centerX, centerY, layer)

  if (target.scope === 'region') {
    const chunk = buildRegionLayoutChunk(target.regionId)
    return {
      ...chunk,
      chunk: {
        ...(chunk.chunk ?? {
          scope: 'region',
          loadedProvinceIds: [],
        }),
        scope: 'viewport',
        id: target.regionId,
      },
    }
  }

  if (target.scope === 'province') {
    const chunk = buildProvinceLayoutChunk(target.provinceId)
    return {
      ...chunk,
      chunk: {
        ...(chunk.chunk ?? {
          scope: 'province',
          loadedProvinceIds: [],
        }),
        scope: 'viewport',
        id: target.provinceId,
      },
    }
  }

  const bootstrap = buildBootstrapLayoutChunk()
  return {
    ...bootstrap,
    chunk: {
      ...(bootstrap.chunk ?? {
        scope: 'bootstrap',
        loadedProvinceIds: [],
      }),
      scope: 'viewport',
    },
  }
}

function buildBootstrapLayoutChunk(): WorldMapLayoutResponse {
  const loadedProvinceIds = resolveBootstrapProvinceIds(worldMapLayout.map, worldState)
  const provinceSet = new Set(loadedProvinceIds)
  const tileIds = new Set<string>()

  for (const tile of worldMapLayout.map.tiles) {
    if (tile.district && provinceSet.has(tile.district)) {
      tileIds.add(tile.id)
    }
  }

  return {
    mapLayoutVersion,
    map: buildLayoutChunkByTileIds(worldMapLayout.map, tileIds),
    chunk: {
      scope: 'bootstrap',
      loadedProvinceIds,
      pendingProvinceIds: listProvinceIds(worldMapLayout.map.tiles).filter((id) => !provinceSet.has(id)),
    },
  }
}

function extractTileStates(world: WorldState): WorldMapTileState[] {
  return world.map.tiles.map((tile) => ({
    id: tile.id,
    owner: tile.owner,
    enemyPressure: tile.enemyPressure,
  }))
}

type IntelPayload = {
  mode: 'full' | 'delta'
  baseWorldVersion?: number
  intelByTileId: WorldState['intel']
}

function buildWorldSummary(
  world: WorldState,
  tileStates: WorldMapTileState[],
  tileStateMode: 'full' | 'delta',
  intelPayload: IntelPayload,
  options: ResolvedWorldSummaryOptions,
  baseWorldVersion?: number,
): WorldSummary {
  const { map, history, ...worldWithoutMap } = world
  void map

  const summaryHistory = {
    planningJobs: structuredClone(history.planningJobs.slice(0, options.planningHistoryLimit)),
    executionReplays: structuredClone(
      history.executionReplays.slice(0, options.replayLimit).map((replay) => {
        const trimmedFrames = replay.frames.slice(
          Math.max(0, replay.frames.length - options.replayFrameLimit),
        )

        return {
          ...replay,
          frames: trimmedFrames,
        }
      }),
    ),
  }

  return {
    ...structuredClone(worldWithoutMap),
    intel: structuredClone(intelPayload.intelByTileId),
    intelSyncMode: intelPayload.mode,
    intelBaseWorldVersion: intelPayload.baseWorldVersion,
    history: summaryHistory,
    map: {
      width: world.map.width,
      height: world.map.height,
      mapLayoutVersion,
      tileStateMode,
      baseWorldVersion,
      tileStates: structuredClone(tileStates),
    },
  }
}

function buildSparseIntel(intelByTileId: WorldState['intel']): WorldState['intel'] {
  const sparseIntel: WorldState['intel'] = {}

  for (const [tileId, intel] of Object.entries(intelByTileId)) {
    if (intel.level === 'unknown') {
      continue
    }

    sparseIntel[tileId] = optionsToSparseIntel(intel)
  }

  return sparseIntel
}

function resolveWorldSummaryOptions(options?: WorldSummaryOptions): ResolvedWorldSummaryOptions {
  const sinceWorldVersion =
    typeof options?.sinceWorldVersion === 'number' && Number.isFinite(options.sinceWorldVersion)
      ? Math.max(0, Math.floor(options.sinceWorldVersion))
      : undefined

  return {
    sinceWorldVersion,
    planningHistoryLimit: clampLimit(
      options?.planningHistoryLimit,
      DEFAULT_SUMMARY_PLANNING_HISTORY_LIMIT,
      MAX_SUMMARY_PLANNING_HISTORY_LIMIT,
    ),
    replayLimit: clampLimit(options?.replayLimit, DEFAULT_SUMMARY_REPLAY_LIMIT, MAX_SUMMARY_REPLAY_LIMIT),
    replayFrameLimit: clampLimit(
      options?.replayFrameLimit,
      DEFAULT_SUMMARY_REPLAY_FRAME_LIMIT,
      MAX_SUMMARY_REPLAY_FRAME_LIMIT,
    ),
    intelMode: options?.intelMode === 'full' ? 'full' : 'sparse',
  }
}

function clampLimit(value: number | undefined, fallback: number, upperBound: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.max(1, Math.min(upperBound, Math.floor(value)))
}

function resolveIntelPayload(options: ResolvedWorldSummaryOptions): IntelPayload {
  if (options.intelMode === 'full') {
    return {
      mode: 'full',
      intelByTileId: structuredClone(worldState.intel),
    }
  }

  const sparseIntel = buildSparseIntel(worldState.intel)
  const sinceWorldVersion = options.sinceWorldVersion

  if (sinceWorldVersion === undefined) {
    return {
      mode: 'full',
      intelByTileId: sparseIntel,
    }
  }

  if (sinceWorldVersion === worldState.worldVersion) {
    return {
      mode: 'delta',
      baseWorldVersion: sinceWorldVersion,
      intelByTileId: {},
    }
  }

  if (sinceWorldVersion >= 0 && sinceWorldVersion < worldState.worldVersion) {
    const delta = collectIntelDelta(sinceWorldVersion, worldState.worldVersion)
    if (delta) {
      return {
        mode: 'delta',
        baseWorldVersion: sinceWorldVersion,
        intelByTileId: delta,
      }
    }
  }

  return {
    mode: 'full',
    intelByTileId: sparseIntel,
  }
}

function collectIntelDelta(fromWorldVersion: number, toWorldVersion: number): WorldState['intel'] | null {
  if (fromWorldVersion >= toWorldVersion) {
    return {}
  }

  const mergedByTileId: WorldState['intel'] = {}

  for (let worldVersion = fromWorldVersion + 1; worldVersion <= toWorldVersion; worldVersion += 1) {
    const diff = intelDiffByVersion.get(worldVersion)
    if (!diff) {
      return null
    }

    for (const [tileId, intel] of Object.entries(diff)) {
      mergedByTileId[tileId] = intel
    }
  }

  return mergedByTileId
}

function resolveTileStatePayload(sinceWorldVersion?: number): {
  mode: 'full' | 'delta'
  baseWorldVersion?: number
  tileStates: WorldMapTileState[]
} {
  const currentWorldVersion = worldState.worldVersion
  const normalizedSince =
    typeof sinceWorldVersion === 'number' && Number.isFinite(sinceWorldVersion)
      ? Math.floor(sinceWorldVersion)
      : undefined

  if (normalizedSince !== undefined) {
    if (normalizedSince === currentWorldVersion) {
      return {
        mode: 'delta',
        baseWorldVersion: normalizedSince,
        tileStates: [],
      }
    }

    if (normalizedSince >= 0 && normalizedSince < currentWorldVersion) {
      const delta = collectTileStateDelta(normalizedSince, currentWorldVersion)
      if (delta) {
        return {
          mode: 'delta',
          baseWorldVersion: normalizedSince,
          tileStates: delta,
        }
      }
    }
  }

  return {
    mode: 'full',
    tileStates: extractTileStates(worldState),
  }
}

function collectTileStateDelta(fromWorldVersion: number, toWorldVersion: number): WorldMapTileState[] | null {
  if (fromWorldVersion >= toWorldVersion) {
    return []
  }

  const mergedByTileId = new Map<string, WorldMapTileState>()

  for (let worldVersion = fromWorldVersion + 1; worldVersion <= toWorldVersion; worldVersion += 1) {
    const diff = tileStateDiffByVersion.get(worldVersion)
    if (!diff) {
      return null
    }

    for (const tileState of diff) {
      mergedByTileId.set(tileState.id, tileState)
    }
  }

  return Array.from(mergedByTileId.values())
}

function recordTileStateDiff(previousWorld: WorldState, nextWorld: WorldState) {
  if (nextWorld.worldVersion <= previousWorld.worldVersion) {
    tileStateDiffByVersion.clear()
    return
  }

  const previousTiles = previousWorld.map.tiles
  const nextTiles = nextWorld.map.tiles

  let diff: WorldMapTileState[] = []

  if (previousTiles.length !== nextTiles.length) {
    diff = extractTileStates(nextWorld)
  } else {
    for (let index = 0; index < nextTiles.length; index += 1) {
      const previousTile = previousTiles[index]
      const nextTile = nextTiles[index]

      if (!previousTile || previousTile.id !== nextTile.id) {
        diff = extractTileStates(nextWorld)
        break
      }

      if (previousTile.owner !== nextTile.owner || previousTile.enemyPressure !== nextTile.enemyPressure) {
        diff.push({
          id: nextTile.id,
          owner: nextTile.owner,
          enemyPressure: nextTile.enemyPressure,
        })
      }
    }
  }

  tileStateDiffByVersion.set(nextWorld.worldVersion, diff)
  trimTileStateDiffHistory()
}

function trimTileStateDiffHistory() {
  if (tileStateDiffByVersion.size <= MAX_TILE_STATE_DIFF_HISTORY) {
    return
  }

  const sortedVersions = Array.from(tileStateDiffByVersion.keys()).sort((left, right) => left - right)
  while (sortedVersions.length > MAX_TILE_STATE_DIFF_HISTORY) {
    const oldest = sortedVersions.shift()
    if (oldest === undefined) {
      break
    }
    tileStateDiffByVersion.delete(oldest)
  }
}


function recordIntelDiff(previousWorld: WorldState, nextWorld: WorldState) {
  if (nextWorld.worldVersion <= previousWorld.worldVersion) {
    intelDiffByVersion.clear()
    return
  }

  const diff: WorldState['intel'] = {}
  const previousIntelByTileId = previousWorld.intel
  const nextIntelByTileId = nextWorld.intel

  for (const [tileId, nextIntel] of Object.entries(nextIntelByTileId)) {
    const previousIntel = previousIntelByTileId[tileId]
    const changed =
      !previousIntel ||
      previousIntel.level !== nextIntel.level ||
      previousIntel.lastScoutedTick !== nextIntel.lastScoutedTick ||
      previousIntel.summary !== nextIntel.summary

    if (changed) {
      diff[tileId] = optionsToSparseIntel(nextIntel)
    }
  }

  for (const tileId of Object.keys(previousIntelByTileId)) {
    if (!(tileId in nextIntelByTileId)) {
      diff[tileId] = {
        level: 'unknown',
      }
    }
  }

  intelDiffByVersion.set(nextWorld.worldVersion, diff)
  trimIntelDiffHistory()
}

function optionsToSparseIntel(intel: WorldState['intel'][string]): WorldState['intel'][string] {
  if (intel.level === 'unknown') {
    return {
      level: 'unknown',
      lastScoutedTick: intel.lastScoutedTick,
    }
  }

  const sparseIntel: WorldState['intel'][string] = {
    level: intel.level,
    lastScoutedTick: intel.lastScoutedTick,
  }

  if (intel.level === 'confirmed' && intel.summary) {
    sparseIntel.summary = intel.summary
  }

  return sparseIntel
}

function trimIntelDiffHistory() {
  if (intelDiffByVersion.size <= MAX_INTEL_DIFF_HISTORY) {
    return
  }

  const sortedVersions = Array.from(intelDiffByVersion.keys()).sort((left, right) => left - right)
  while (sortedVersions.length > MAX_INTEL_DIFF_HISTORY) {
    const oldest = sortedVersions.shift()
    if (oldest === undefined) {
      break
    }

    intelDiffByVersion.delete(oldest)
  }
}

function appendWorldEvent(params: {
  category: WorldEventRecord['category']
  action: string
  success: boolean
  tick: number
  worldVersion: number
  requestId?: string
  message?: string
  metadata?: Record<string, unknown>
}) {
  worldEvents.unshift({
    id: randomUUID(),
    category: params.category,
    action: params.action,
    success: params.success,
    tick: params.tick,
    worldVersion: params.worldVersion,
    createdAt: new Date().toISOString(),
    requestId: params.requestId,
    message: params.message,
    metadata: params.metadata,
  })

  if (worldEvents.length > MAX_WORLD_EVENTS) {
    worldEvents.splice(MAX_WORLD_EVENTS)
  }
}

export async function flushNarrativePersist() {
  await flushNarrativePersistFromPersistence()
}

export async function flushGovernancePersist() {
  await Promise.all([
    flushCourtSessionPersist(),
    flushCivilMemoryPersist(),
    flushTacticalSkillPersist(),
  ])
}

/** 供仿真环境（runMultiFactionSimulation）调用：将 ReflectService 生成的叙事事件写入全局叙事流 */
export function recordSimulationNarrativeEvents(events: NarrativeEvent[]): void {
  recordSimulationNarrativeEventsFromPersistence(events)
}

function refreshReplayArchive() {
  const now = new Date().toISOString()
  const previousArchive = new Map(replayArchive)
  const refreshed = new Map<string, ReplayArchiveEntry>()

  for (const replay of worldState.history.executionReplays) {
    const current = previousArchive.get(replay.requestId)
    refreshed.set(replay.requestId, {
      requestId: replay.requestId,
      source: replay.source,
      strategicCommand: replay.strategicCommand,
      basedOnWorldVersion: replay.basedOnWorldVersion,
      outcome: replay.outcome,
      frameCount: replay.frames.length,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    })
  }

  const entries = Array.from(refreshed.values()).sort((a, b) =>
    a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
  )

  replayArchive.clear()
  for (const entry of entries.slice(0, MAX_REPLAY_ARCHIVE)) {
    replayArchive.set(entry.requestId, entry)
  }
}

function normalizeGeneralConcurrency(value?: number) {
  const normalized = typeof value === 'number' && Number.isFinite(value) ? value : 4
  return Math.max(1, Math.min(32, Math.round(normalized)))
}

function trimSaveSlots() {
  if (saveSlots.size <= MAX_SAVE_SLOTS) {
    return
  }

  const ordered = Array.from(saveSlots.values()).sort((a, b) =>
    a.record.savedAt < b.record.savedAt ? 1 : a.record.savedAt > b.record.savedAt ? -1 : 0,
  )

  saveSlots.clear()
  for (const item of ordered.slice(0, MAX_SAVE_SLOTS)) {
    saveSlots.set(item.record.slotId, item)
  }
}

function normalizeSlotId(rawSlotId: string) {
  const normalized = rawSlotId.trim().toLowerCase()
  if (!normalized || !/^[a-z0-9_-]{1,32}$/.test(normalized)) {
    throw new Error('slotId must match ^[a-z0-9_-]{1,32}$')
  }

  return normalized
}
