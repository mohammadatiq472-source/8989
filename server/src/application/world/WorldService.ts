import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
  createReadStream,
  createWriteStream,
  closeSync,
} from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve as resolvePath } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createGzip, gunzipSync } from 'node:zlib'
import {
  flushNarrativePersist as flushNarrativePersistFromPersistence,
  flushWorldPersist as flushWorldPersistFromPersistence,
  getNarrativeEvents as getNarrativeEventsFromPersistence,
  loadPersistedNarrativeEvents,
  loadPersistedWorldState,
  recordSimulationNarrativeEvents as recordSimulationNarrativeEventsFromPersistence,
  scheduleWorldPersist,
} from './persistence/worldPersistence'
import { buildWorldPersistencePath } from './persistence/worldPersistencePaths'
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
import { broadcastTickDelta, broadcastBattleReport, getWebSocketStats } from '../../ws/GameWebSocket'
import {
  getFactionAutonomyLevel,
  getFactionSessionSnapshot,
  getSessionMetrics,
  resolveSessionControlMode,
} from '../../multiplayer/SessionManager'
import { createInitialWorldState } from '../../../../shared/domain/scenario'
import { syncAllFactionAiQuota } from '../../../../shared/domain/aiQuota'
import { settleResourcesForAllPlayers, syncV2StateWithWorld, syncWorldFactionResourcesFromV2 } from '../v2/V2GameService'
import {
  advanceTick,
  allianceHelp,
  appendPlanningJobHistory,
  claimReward,
  clearPlanExecution,
  deployReserveHero,
  moveUnit,
  promoteCityBuilding,
  promoteTroopFacilityBuilding,
  queueAiAgendaAction,
  recruitProspectHero,
  setRecruitSelectedPool,
  cloneGeneralDirectivePreviewMirror,
  setAiContextFocus,
  setGeneralActiveHero,
  setGeneralTactic,
  upgradeCity,
  upgradeCityTech,
  queuePlanExecution,
  queueTacticalOverride,
  enqueueAffair,
  transferFactionResourcesToGovernor,
  updateAllianceDirective,
} from '../../../../shared/domain/rules'
import type {
  AdvanceTickDiagnostics,
  AllianceHelpFailureCode,
  QueuePlanFailureCode,
  ResourceTransferFailureCode,
  RewardClaimFailureCode,
} from '../../../../shared/domain/rules'
import type {
  ActionType,
  AiRuntimeAdvanceTickPerformance,
  AiRuntimeAdvanceTickPhaseStats,
  AiRuntimeAdvanceTickPhaseTiming,
  AiRuntimeAdvanceTickRun,
  AiRuntimeAdvanceTickSubphaseStats,
  AiRuntimeAdvanceTickSubphaseTiming,
  AiRuntimeBudgetSnapshot,
  AiRuntimeCategoryStats,
  AiRuntimeFailureAggregation,
  AiRuntimeFailureRecord,
  AiRuntimeLockConflictAggregation,
  AiRuntimeObservabilityResponse,
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
  SlgAiExecutionState,
  StrategicPlan,
  Tile,
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
import type { DomainAgendaOption } from '../../../../shared/contracts/commBus'
import type { CivilMemoryEntry, CivilMemoryEventType } from '../../../../shared/contracts/civilMemory'

const MAX_WORLD_EVENTS = 1_000
const MAX_REPLAY_ARCHIVE = 160
const MAX_SAVE_SLOTS = 12
const MAX_AI_RUNTIME_EVENTS = 80
const MAX_ADVANCE_TICK_SAMPLES = 8
const SAVE_SLOTS_PERSIST_VERSION = 1
const SAVE_SLOTS_PERSIST_DEBOUNCE_MS = 1_200
const SAVE_SLOTS_PERSIST_PATH = process.env.WORLD_SAVE_SLOTS_PATH?.trim() || buildWorldPersistencePath('world_save_slots.json')
const DEFAULT_SAVE_SLOTS_SOFT_LIMIT_BYTES = 128 * 1024 * 1024
const DEFAULT_SAVE_SLOTS_HARD_LIMIT_BYTES = 512 * 1024 * 1024
const DEFAULT_SAVE_SLOTS_LOCK_STALE_MS = 15_000
const DEFAULT_SAVE_SLOTS_ARCHIVE_MAX_FILES = 12
const SAVE_SLOTS_SOFT_LIMIT_BYTES = readSaveSlotsLimitBytesEnv(
  'WORLD_SAVE_SLOTS_SOFT_LIMIT_BYTES',
  DEFAULT_SAVE_SLOTS_SOFT_LIMIT_BYTES,
)
const SAVE_SLOTS_HARD_LIMIT_BYTES = Math.max(
  SAVE_SLOTS_SOFT_LIMIT_BYTES,
  readSaveSlotsLimitBytesEnv('WORLD_SAVE_SLOTS_HARD_LIMIT_BYTES', DEFAULT_SAVE_SLOTS_HARD_LIMIT_BYTES),
)
const SAVE_SLOTS_LOCK_PATH = `${SAVE_SLOTS_PERSIST_PATH}.lock`
const SAVE_SLOTS_LOCK_STALE_MS = readSaveSlotsIntegerEnv(
  'WORLD_SAVE_SLOTS_LOCK_STALE_MS',
  DEFAULT_SAVE_SLOTS_LOCK_STALE_MS,
  1_000,
)
const SAVE_SLOTS_ARCHIVE_ON_SOFT_LIMIT = readSaveSlotsBooleanEnv('WORLD_SAVE_SLOTS_ARCHIVE_ON_SOFT_LIMIT', true)
const SAVE_SLOTS_ARCHIVE_DIR =
  process.env.WORLD_SAVE_SLOTS_ARCHIVE_DIR?.trim() || buildWorldPersistencePath('world_save_slots_archive')
const SAVE_SLOTS_ARCHIVE_MAX_FILES = readSaveSlotsIntegerEnv(
  'WORLD_SAVE_SLOTS_ARCHIVE_MAX_FILES',
  DEFAULT_SAVE_SLOTS_ARCHIVE_MAX_FILES,
  1,
)
const SAVE_SLOTS_ARCHIVE_BASENAME = basename(SAVE_SLOTS_PERSIST_PATH).replace(/\.json$/i, '')

const WORLD_MUTATION_BUSY_MESSAGE = 'world mutation busy'
const AI_RUNTIME_OBSERVABILITY_ACTIONS = new Set([
  'queue_plan_execution',
  'queue_ai_agenda_action',
  'set_ai_context_focus',
  'clear_plan_execution',
  'advance_tick',
])

type QueuePlanFailureCategory = QueuePlanFailureCode | 'mutation_lock_busy' | 'unknown'
type QueuePlanConflictCategory =
  | 'mutation_lock_busy'
  | 'stale_world_version'
  | 'execution_chain_guard_missing'
  | 'execution_chain_guard_mismatch'
  | 'execution_chain_active_rejected'
  | 'none'
type AdvanceTickFailureCategory = 'mutation_lock_busy' | 'runtime_error'
type SaveSlotsFileSizeLevel = 'none' | 'ok' | 'soft' | 'hard'
type WorldActionFailureCode =
  | QueuePlanFailureCode
  | AllianceHelpFailureCode
  | RewardClaimFailureCode
  | ResourceTransferFailureCode
  | 'invalid_ai_agenda_action'
  | 'unknown_faction'
  | 'no_primary_unit'
  | 'missing_target_tile'
  | 'world_mutation_busy'

type CategoryStats<T extends string> = {
  total: number
  byCategory: Record<T, number>
}

type AdvanceTickPhaseName =
  | 'compile_advisory'
  | 'record_pre_tick_memory'
  | 'append_pre_tick_events'
  | 'advance_world_state'
  | 'sync_v2_resources'
  | 'reflect_world_tick'
  | 'record_post_tick_memory'
  | 'broadcast_runtime'
  | 'finalize_response'

const queuePlanFailureStats: CategoryStats<QueuePlanFailureCategory> = {
  total: 0,
  byCategory: {
    mutation_lock_busy: 0,
    stale_world_version: 0,
    unknown_faction: 0,
    invalid_order_units: 0,
    execution_chain_guard_missing: 0,
    execution_chain_guard_mismatch: 0,
    execution_chain_active_rejected: 0,
    unknown: 0,
  },
}

const queuePlanConflictStats: CategoryStats<QueuePlanConflictCategory> = {
  total: 0,
  byCategory: {
    mutation_lock_busy: 0,
    stale_world_version: 0,
    execution_chain_guard_missing: 0,
    execution_chain_guard_mismatch: 0,
    execution_chain_active_rejected: 0,
    none: 0,
  },
}

const advanceTickFailureStats: CategoryStats<AdvanceTickFailureCategory> = {
  total: 0,
  byCategory: {
    mutation_lock_busy: 0,
    runtime_error: 0,
  },
}

const advanceTickRuns: AiRuntimeAdvanceTickRun[] = []

function bumpCategoryStats<T extends string>(stats: CategoryStats<T>, category: T) {
  stats.total += 1
  stats.byCategory[category] = (stats.byCategory[category] ?? 0) + 1
}

function snapshotCategoryStats<T extends string>(stats: CategoryStats<T>): CategoryStats<T> {
  return {
    total: stats.total,
    byCategory: { ...stats.byCategory },
  }
}

function resetCategoryStats<T extends string>(stats: CategoryStats<T>) {
  stats.total = 0
  for (const category of Object.keys(stats.byCategory) as T[]) {
    stats.byCategory[category] = 0
  }
}

function roundDurationMs(value: number): number {
  return Number(value.toFixed(2))
}

function recordAdvanceTickSubphaseSync<T>(
  subphases: AiRuntimeAdvanceTickSubphaseTiming[] | undefined,
  subphase: string,
  work: () => T,
): T {
  const startedAtMs = performance.now()
  try {
    return work()
  } finally {
    subphases?.push({
      subphase,
      durationMs: roundDurationMs(performance.now() - startedAtMs),
    })
  }
}

function cloneAdvanceTickSubphases(
  subphases: AiRuntimeAdvanceTickSubphaseTiming[] | undefined,
): AiRuntimeAdvanceTickSubphaseTiming[] | undefined {
  if (!subphases || subphases.length === 0) {
    return undefined
  }
  return subphases.map((subphase) => ({ ...subphase }))
}

function buildAdvanceTickPhaseTimingsRecord(phases: AiRuntimeAdvanceTickPhaseTiming[]): Record<string, number> {
  const record: Record<string, number> = {}
  for (const phase of phases) {
    record[phase.phase] = phase.durationMs
  }
  return record
}

function buildAdvanceTickSubphaseTimingsRecord(
  phases: AiRuntimeAdvanceTickPhaseTiming[],
): Record<string, Record<string, number>> {
  const record: Record<string, Record<string, number>> = {}
  for (const phase of phases) {
    if (!phase.subphases || phase.subphases.length === 0) {
      continue
    }
    record[phase.phase] = Object.fromEntries(
      phase.subphases.map((subphase) => [subphase.subphase, subphase.durationMs]),
    )
  }
  return record
}

function cloneTileForDeltaSnapshot(tile: Tile): Tile {
  return {
    id: tile.id,
    name: tile.name,
    type: tile.type,
    terrain: tile.terrain,
    owner: tile.owner,
    x: tile.x,
    y: tile.y,
    moveCost: tile.moveCost,
    enemyPressure: tile.enemyPressure,
    scoutingDifficulty: tile.scoutingDifficulty,
    resourceLevel: tile.resourceLevel,
    resourceKind: tile.resourceKind,
    cityLevel: tile.cityLevel,
    district: tile.district,
    landmarkId: tile.landmarkId,
    landmarkName: tile.landmarkName,
  }
}

export function createWorldDeltaSnapshot(
  world: Readonly<WorldState>,
  subphases?: AiRuntimeAdvanceTickSubphaseTiming[],
): WorldState {
  const factions = recordAdvanceTickSubphaseSync(
    subphases,
    'advance_world_state.snapshot_previous_world.clone_factions',
    () => Object.fromEntries(
      Object.entries(world.factions).map(([factionId, faction]) => [factionId, structuredClone(faction)]),
    ),
  )
  const tiles = recordAdvanceTickSubphaseSync(
    subphases,
    'advance_world_state.snapshot_previous_world.clone_map_tiles',
    () => world.map.tiles.map((tile) => cloneTileForDeltaSnapshot(tile)),
  )
  const units = recordAdvanceTickSubphaseSync(
    subphases,
    'advance_world_state.snapshot_previous_world.clone_units',
    () => world.units.map((unit) => structuredClone(unit)),
  )
  const reports = recordAdvanceTickSubphaseSync(
    subphases,
    'advance_world_state.snapshot_previous_world.clone_reports',
    () => world.reports.map((report) => ({ ...report })),
  )
  const feedback = recordAdvanceTickSubphaseSync(
    subphases,
    'advance_world_state.snapshot_previous_world.clone_feedback',
    () => ({
      ...world.feedback,
      battleRecords: world.feedback.battleRecords.map((record) => ({ ...record })),
      allianceActions: world.feedback.allianceActions.map((item) => ({ ...item })),
    }),
  )
  return {
    ...world,
    factions,
    map: {
      ...world.map,
      tiles,
    },
    units,
    reports,
    feedback,
  }
}

function finalizeAdvanceTickRun(params: {
  startedAt: string
  startedAtMs: number
  phases: AiRuntimeAdvanceTickPhaseTiming[]
  outcome: AiRuntimeAdvanceTickRun['outcome']
  tickBefore: number
  tickAfter: number
  worldVersionBefore: number
  worldVersionAfter: number
  narrativeEvents?: number
  memoryWrites?: number
  memoryWriteFailures?: number
  battleReportsBroadcast?: number
  errorName?: string
  errorMessage?: string
}): AiRuntimeAdvanceTickRun {
  const completedAt = new Date().toISOString()
  const totalDurationMs = roundDurationMs(performance.now() - params.startedAtMs)
  const slowestPhase = params.phases.reduce<AiRuntimeAdvanceTickPhaseTiming | null>(
    (current, phase) => {
      if (!current || phase.durationMs > current.durationMs) {
        return phase
      }
      return current
    },
    null,
  )
  return {
    outcome: params.outcome,
    startedAt: params.startedAt,
    completedAt,
    tickBefore: params.tickBefore,
    tickAfter: params.tickAfter,
    worldVersionBefore: params.worldVersionBefore,
    worldVersionAfter: params.worldVersionAfter,
    totalDurationMs,
    slowestPhase: slowestPhase?.phase ?? null,
    slowestPhaseDurationMs: slowestPhase?.durationMs ?? null,
    phases: params.phases.map((phase) => ({
      ...phase,
      subphases: cloneAdvanceTickSubphases(phase.subphases),
    })),
    narrativeEvents: params.narrativeEvents ?? 0,
    memoryWrites: params.memoryWrites ?? 0,
    memoryWriteFailures: params.memoryWriteFailures ?? 0,
    battleReportsBroadcast: params.battleReportsBroadcast ?? 0,
    errorName: params.errorName,
    errorMessage: params.errorMessage,
  }
}

function recordAdvanceTickRun(run: AiRuntimeAdvanceTickRun) {
  advanceTickRuns.unshift(run)
  if (advanceTickRuns.length > MAX_ADVANCE_TICK_SAMPLES) {
    advanceTickRuns.splice(MAX_ADVANCE_TICK_SAMPLES)
  }
}

function buildAdvanceTickPerformanceSnapshot(): AiRuntimeAdvanceTickPerformance {
  const phaseStats: Record<string, AiRuntimeAdvanceTickPhaseStats> = {}
  let totalDurationMs = 0
  let maxTotalDurationMs = 0
  let successfulRuns = 0
  let failedRuns = 0

  for (const run of advanceTickRuns) {
    totalDurationMs += run.totalDurationMs
    maxTotalDurationMs = Math.max(maxTotalDurationMs, run.totalDurationMs)
    if (run.outcome === 'success') {
      successfulRuns += 1
    } else {
      failedRuns += 1
    }

    for (const phase of run.phases) {
      const existing = phaseStats[phase.phase]
      if (!existing) {
        phaseStats[phase.phase] = {
          runs: 1,
          lastDurationMs: phase.durationMs,
          avgDurationMs: phase.durationMs,
          maxDurationMs: phase.durationMs,
          subphaseStats: phase.subphases
            ? Object.fromEntries(
                phase.subphases.map((subphase) => [
                  subphase.subphase,
                  {
                    runs: 1,
                    lastDurationMs: subphase.durationMs,
                    avgDurationMs: subphase.durationMs,
                    maxDurationMs: subphase.durationMs,
                  } satisfies AiRuntimeAdvanceTickSubphaseStats,
                ]),
              )
            : undefined,
        }
        continue
      }
      const runs = existing.runs + 1
      const subphaseStats = { ...(existing.subphaseStats ?? {}) }
      for (const subphase of phase.subphases ?? []) {
        const existingSubphase = subphaseStats[subphase.subphase]
        if (!existingSubphase) {
          subphaseStats[subphase.subphase] = {
            runs: 1,
            lastDurationMs: subphase.durationMs,
            avgDurationMs: subphase.durationMs,
            maxDurationMs: subphase.durationMs,
          }
          continue
        }
        const subphaseRuns = existingSubphase.runs + 1
        subphaseStats[subphase.subphase] = {
          runs: subphaseRuns,
          lastDurationMs: existingSubphase.lastDurationMs,
          avgDurationMs: roundDurationMs(
            ((existingSubphase.avgDurationMs * existingSubphase.runs) + subphase.durationMs) / subphaseRuns,
          ),
          maxDurationMs: Math.max(existingSubphase.maxDurationMs, subphase.durationMs),
        }
      }
      phaseStats[phase.phase] = {
        runs,
        lastDurationMs: existing.lastDurationMs,
        avgDurationMs: roundDurationMs(((existing.avgDurationMs * existing.runs) + phase.durationMs) / runs),
        maxDurationMs: Math.max(existing.maxDurationMs, phase.durationMs),
        subphaseStats: Object.keys(subphaseStats).length > 0 ? subphaseStats : undefined,
      }
    }
  }

  return {
    totalRuns: advanceTickRuns.length,
    successfulRuns,
    failedRuns,
    lastOutcome: advanceTickRuns[0]?.outcome ?? null,
    lastCompletedAt: advanceTickRuns[0]?.completedAt,
    lastTotalDurationMs: advanceTickRuns[0]?.totalDurationMs,
    avgTotalDurationMs:
      advanceTickRuns.length > 0 ? roundDurationMs(totalDurationMs / advanceTickRuns.length) : undefined,
    maxTotalDurationMs: advanceTickRuns.length > 0 ? roundDurationMs(maxTotalDurationMs) : undefined,
    phaseStats,
    recentRuns: advanceTickRuns.map((run) => structuredClone(run)),
  }
}

async function measureAdvanceTickPhase<T>(
  phases: AiRuntimeAdvanceTickPhaseTiming[],
  phase: AdvanceTickPhaseName,
  work: () => Promise<T> | T,
  options: {
    subphases?: AiRuntimeAdvanceTickSubphaseTiming[]
  } = {},
): Promise<T> {
  const startedAtMs = performance.now()
  try {
    return await work()
  } finally {
    phases.push({
      phase,
      durationMs: roundDurationMs(performance.now() - startedAtMs),
      subphases: cloneAdvanceTickSubphases(options.subphases),
    })
  }
}

async function measureAdvanceTickSubphase<T>(
  subphases: AiRuntimeAdvanceTickSubphaseTiming[],
  subphase: string,
  work: () => Promise<T> | T,
): Promise<T> {
  const startedAtMs = performance.now()
  try {
    return await work()
  } finally {
    subphases.push({
      subphase,
      durationMs: roundDurationMs(performance.now() - startedAtMs),
    })
  }
}

function readSaveSlotsLimitBytesEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name] ?? fallback)
  if (!Number.isFinite(raw)) {
    return fallback
  }

  return Math.max(1_024, Math.floor(raw))
}

function readSaveSlotsIntegerEnv(name: string, fallback: number, minimum: number): number {
  const raw = Number(process.env[name] ?? fallback)
  if (!Number.isFinite(raw)) {
    return fallback
  }

  return Math.max(minimum, Math.floor(raw))
}

function readSaveSlotsBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase()
  if (!raw) {
    return fallback
  }
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

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

type SaveSlotsArchiveFile = {
  path: string
  mtimeMs: number
  sizeBytes: number
}

type SaveSlotsArchiveRestoreDrillStatus = 'passed' | 'failed' | 'skipped'
type SaveSlotsArchiveRestoreApplyStatus = 'restored' | 'skipped' | 'failed'
type SaveSlotsArchiveRestoreRollbackDrillStatus = 'passed' | 'failed' | 'skipped'

type ReplayFixtureSource = 'initial_world_v1' | 'current_world'

type PersistedSaveSlotsPayload = {
  version: number
  savedAt: number
  slots: SaveSlotState[]
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
let saveSlotsPersistDirty = false
let saveSlotsPersistInFlight = false
let saveSlotsPersistTimer: ReturnType<typeof setTimeout> | null = null
let saveSlotsLoaded = false
let saveSlotsPersistSuccessCount = 0
let saveSlotsPersistFailureCount = 0
let saveSlotsLastPersistAt: number | null = null
let saveSlotsLastPersistErrorAt: number | null = null
let saveSlotsCorruptQuarantineCount = 0
let saveSlotsLastCorruptQuarantineAt: number | null = null
let saveSlotsRestoredSlotCount = 0
let saveSlotsLastRestoreAt: number | null = null
let saveSlotsPersistLockContentionCount = 0
let saveSlotsPersistLockStealCount = 0
let saveSlotsPersistLockFailureCount = 0
let saveSlotsArchiveFileCount = 0
let saveSlotsArchiveSuccessCount = 0
let saveSlotsArchiveFailureCount = 0
let saveSlotsLastArchiveAt: number | null = null
let saveSlotsLastArchiveErrorAt: number | null = null
let saveSlotsLastArchivePath: string | null = null
let saveSlotsRestoreDrillSuccessCount = 0
let saveSlotsRestoreDrillFailureCount = 0
let saveSlotsLastRestoreDrillAt: number | null = null
let saveSlotsLastRestoreDrillErrorAt: number | null = null
let saveSlotsLastRestoreDrillArchivePath: string | null = null
let saveSlotsLastRestoreDrillSlotCount: number | null = null
let saveSlotsLastRestoreDrillStatus: SaveSlotsArchiveRestoreDrillStatus | null = null
let saveSlotsLastRestoreDrillMessage: string | null = null
let saveSlotsRestoreApplySuccessCount = 0
let saveSlotsRestoreApplyFailureCount = 0
let saveSlotsLastRestoreApplyAt: number | null = null
let saveSlotsLastRestoreApplyErrorAt: number | null = null
let saveSlotsLastRestoreApplyArchivePath: string | null = null
let saveSlotsLastRestoreApplyBackupPath: string | null = null
let saveSlotsLastRestoreApplySlotCount: number | null = null
let saveSlotsLastRestoreApplyStatus: SaveSlotsArchiveRestoreApplyStatus | null = null
let saveSlotsLastRestoreApplyMessage: string | null = null
let saveSlotsRestoreRollbackDrillSuccessCount = 0
let saveSlotsRestoreRollbackDrillFailureCount = 0
let saveSlotsLastRestoreRollbackDrillAt: number | null = null
let saveSlotsLastRestoreRollbackDrillErrorAt: number | null = null
let saveSlotsLastRestoreRollbackDrillArchivePath: string | null = null
let saveSlotsLastRestoreRollbackDrillBackupPath: string | null = null
let saveSlotsLastRestoreRollbackDrillStorePath: string | null = null
let saveSlotsLastRestoreRollbackDrillSlotCount: number | null = null
let saveSlotsLastRestoreRollbackDrillStatus: SaveSlotsArchiveRestoreRollbackDrillStatus | null = null
let saveSlotsLastRestoreRollbackDrillMessage: string | null = null
let saveSlotsLastRestoreRollbackDrillVerified: boolean | null = null
let lastNationalAgenda: NationalAgendaWindow | null = null
loadPersistedWorldState((savedWorldState) => {
  worldState = savedWorldState
  syncAllFactionAiQuota(worldState)
}) // P0: restore world state first
loadPersistedNarrativeEvents()
loadPersistedSaveSlots()
refreshSaveSlotsArchiveFileCount()
syncV2StateWithWorld(worldState)

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

export function resetWorldServiceForTests() {
  worldState = createInitialWorldState()
  syncAllFactionAiQuota(worldState)
  mapLayoutVersion = DEFAULT_MAP_LAYOUT_VERSION
  worldMapLayout = buildWorldMapLayout(worldState, mapLayoutVersion)
  tileStateDiffByVersion.clear()
  intelDiffByVersion.clear()
  worldEvents.length = 0
  replayArchive.clear()
  advanceTickRuns.splice(0)
  resetCategoryStats(queuePlanFailureStats)
  resetCategoryStats(queuePlanConflictStats)
  resetCategoryStats(advanceTickFailureStats)
  refreshReplayArchive()
  rebuildMapLayoutIndexes()
}

function buildWorldActionResponse(params: {
  ok: boolean
  includeWorld?: boolean
  message?: string
  failureCode?: WorldActionFailureCode
  requestId?: string
  unitId?: string
  heroId?: string
  heroIds?: string[]
  heroNames?: string[]
  tacticId?: string
  contextFocusId?: string
  relatedId?: string
  execution?: SlgAiExecutionState
}): WorldActionResponse {
  const includeWorld = params.includeWorld !== false

  return {
    ok: params.ok,
    tick: worldState.tick,
    worldVersion: worldState.worldVersion,
    world: includeWorld ? structuredClone(worldState) : undefined,
    message: params.message,
    failureCode: params.failureCode,
    requestId: params.requestId,
    unitId: params.unitId,
    heroId: params.heroId,
    heroIds: params.heroIds,
    heroNames: params.heroNames,
    tacticId: params.tacticId,
    contextFocusId: params.contextFocusId,
    relatedId: params.relatedId,
    execution: params.execution,
  }
}

function buildWorldMutationBusyResponse(
  includeWorld = true,
  factionId?: FactionId,
  requestId?: string,
): WorldActionResponse {
  const holder = getActiveWorldMutationHolder()
  const message = holder ? `${WORLD_MUTATION_BUSY_MESSAGE}: ${holder}` : WORLD_MUTATION_BUSY_MESSAGE
  return buildWorldActionResponse({
    ok: false,
    includeWorld,
    message,
    failureCode: 'world_mutation_busy',
    requestId,
    execution: buildAiExecutionStateSnapshot(worldState, factionId),
  })
}

function buildAiExecutionStateSnapshot(
  world: Readonly<WorldState>,
  factionId?: string,
): SlgAiExecutionState | undefined {
  const normalizedFactionId = factionId?.trim()
  if (!normalizedFactionId) {
    return undefined
  }

  const faction = world.factions[normalizedFactionId]
  if (!faction) {
    return undefined
  }

  const execution = world.executions[normalizedFactionId]
  const orders = execution?.orders ?? []
  let queuedOrderCount = 0
  let runningOrderCount = 0

  for (const order of orders) {
    if (order.status === 'queued') {
      queuedOrderCount += 1
    } else if (order.status === 'running') {
      runningOrderCount += 1
    }
  }

  const activeOrderCount = queuedOrderCount + runningOrderCount
  const status: SlgAiExecutionState['status'] =
    runningOrderCount > 0 ? 'running' : queuedOrderCount > 0 ? 'queued' : 'idle'

  return {
    status,
    activeOrderCount,
    queuedOrderCount,
    runningOrderCount,
    actionPointsRemaining: faction.actionPoints,
    foodRemaining: faction.food,
    requestId: execution?.requestId,
    basedOnWorldVersion: execution?.basedOnWorldVersion,
    reviewAtTick: execution?.reviewAtTick,
    strategicCommand: execution?.strategicCommand,
    source: execution?.source,
    updatedTick: world.tick,
    updatedWorldVersion: world.worldVersion,
  }
}

function buildAiRuntimeCategoryStats<T extends string>(stats: CategoryStats<T>): AiRuntimeCategoryStats {
  return {
    total: stats.total,
    byCategory: { ...stats.byCategory },
  }
}

function buildAiRuntimeBudgetSnapshot(
  world: Readonly<WorldState>,
  factionId: string,
  execution?: SlgAiExecutionState,
): AiRuntimeBudgetSnapshot {
  const faction = world.factions[factionId]
  return {
    actionPointsRemaining: execution?.actionPointsRemaining ?? faction?.actionPoints ?? 0,
    foodRemaining: execution?.foodRemaining ?? faction?.food ?? 0,
    aiQuota: faction?.aiQuota ? structuredClone(faction.aiQuota) : null,
  }
}

function extractWorldEventFactionId(event: WorldEventRecord): string | undefined {
  const factionId = event.metadata?.factionId
  return typeof factionId === 'string' && factionId.trim().length > 0 ? factionId.trim() : undefined
}

function extractWorldEventFailureCode(event: WorldEventRecord): string | undefined {
  const failureCode = event.metadata?.failureCode
  return typeof failureCode === 'string' && failureCode.trim().length > 0 ? failureCode.trim() : undefined
}

function extractWorldEventConflictCategory(event: WorldEventRecord): string | undefined {
  const conflictCategory = event.metadata?.conflictCategory
  return typeof conflictCategory === 'string' && conflictCategory.trim().length > 0 ? conflictCategory.trim() : undefined
}

function extractWorldEventHolder(event: WorldEventRecord): string | undefined {
  const mutationHolder = event.metadata?.mutationHolder
  if (typeof mutationHolder === 'string' && mutationHolder.trim().length > 0) {
    return mutationHolder.trim()
  }

  const match = event.message?.match(/^world mutation busy:\s*(.+)$/i)
  return match?.[1]?.trim() || undefined
}

function bumpStringCounter(counter: Record<string, number>, key?: string) {
  if (!key) {
    return
  }
  counter[key] = (counter[key] ?? 0) + 1
}

function buildAiRuntimeFailureRecord(event: WorldEventRecord): AiRuntimeFailureRecord {
  return {
    category: event.category,
    action: event.action,
    tick: event.tick,
    worldVersion: event.worldVersion,
    createdAt: event.createdAt,
    factionId: extractWorldEventFactionId(event),
    requestId: event.requestId,
    message: event.message,
    failureCode: extractWorldEventFailureCode(event),
    conflictCategory: extractWorldEventConflictCategory(event),
    holder: extractWorldEventHolder(event),
  }
}

function buildAiRuntimeFailureAggregation(
  events: WorldEventRecord[],
  sampleLimit: number,
): AiRuntimeFailureAggregation {
  const failures = events.filter((event) => !event.success).map(buildAiRuntimeFailureRecord)
  const byAction: Record<string, number> = {}
  const byFailureCode: Record<string, number> = {}
  const byFaction: Record<string, number> = {}

  for (const failure of failures) {
    bumpStringCounter(byAction, failure.action)
    bumpStringCounter(byFailureCode, failure.failureCode ?? 'unknown')
    bumpStringCounter(byFaction, failure.factionId ?? 'global')
  }

  return {
    totalRecentFailures: failures.length,
    byAction,
    byFailureCode,
    byFaction,
    samples: failures.slice(0, sampleLimit),
  }
}

function buildAiRuntimeLockConflictAggregation(
  events: WorldEventRecord[],
  sampleLimit: number,
): AiRuntimeLockConflictAggregation {
  const conflicts = events
    .filter((event) => {
      if (event.success) {
        return false
      }

      const failureCode = extractWorldEventFailureCode(event)
      const conflictCategory = extractWorldEventConflictCategory(event)
      return failureCode === 'world_mutation_busy' || conflictCategory === 'mutation_lock_busy'
    })
    .map(buildAiRuntimeFailureRecord)
  const byAction: Record<string, number> = {}
  const byHolder: Record<string, number> = {}

  for (const conflict of conflicts) {
    bumpStringCounter(byAction, conflict.action)
    bumpStringCounter(byHolder, conflict.holder ?? 'unknown')
  }

  return {
    totalRecentConflicts: conflicts.length,
    byAction,
    byHolder,
    samples: conflicts.slice(0, sampleLimit),
  }
}

function syncAuthoritativeAiState(nextWorld: WorldState) {
  nextWorld.slgDomainState ??= {}
  const nextAiStateByFaction = { ...(nextWorld.slgDomainState.aiStateByFaction ?? {}) }

  for (const factionId of Object.keys(nextWorld.factions)) {
    const currentState = nextAiStateByFaction[factionId] ?? {}
    const nextAgenda = currentState.agenda
      ? {
          ...currentState.agenda,
          updatedTick: currentState.agenda.updatedTick ?? nextWorld.tick,
          updatedWorldVersion: currentState.agenda.updatedWorldVersion ?? nextWorld.worldVersion,
        }
      : undefined

    nextAiStateByFaction[factionId] = {
      ...currentState,
      agenda: nextAgenda,
      execution: buildAiExecutionStateSnapshot(nextWorld, factionId),
      updatedWorldVersion: currentState.updatedWorldVersion ?? nextWorld.worldVersion,
    }
  }

  nextWorld.slgDomainState.aiStateByFaction = nextAiStateByFaction
}

function resolveQueuePlanFailureCategory(failureCode?: QueuePlanFailureCode): QueuePlanFailureCategory {
  if (!failureCode) {
    return 'unknown'
  }

  return failureCode
}

function resolveQueuePlanConflictCategory(failureCategory: QueuePlanFailureCategory): QueuePlanConflictCategory {
  if (
    failureCategory === 'mutation_lock_busy' ||
    failureCategory === 'stale_world_version' ||
    failureCategory === 'execution_chain_guard_missing' ||
    failureCategory === 'execution_chain_guard_mismatch' ||
    failureCategory === 'execution_chain_active_rejected'
  ) {
    return failureCategory
  }

  return 'none'
}

export function getWorldEvents(limit = 200): WorldEventsResponse {
  const normalizedLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(MAX_WORLD_EVENTS, Math.floor(limit)))
    : 200
  return {
    items: worldEvents.slice(0, normalizedLimit),
  }
}

export function getAiRuntimeObservabilitySnapshot(params: {
  factionId?: string
  eventLimit?: number
} = {}): AiRuntimeObservabilityResponse {
  const normalizedFactionId = params.factionId?.trim()
  const eventLimit = Number.isFinite(params.eventLimit)
    ? Math.max(1, Math.min(MAX_AI_RUNTIME_EVENTS, Math.floor(params.eventLimit ?? 24)))
    : 24
  const factionIds = normalizedFactionId
    ? Object.prototype.hasOwnProperty.call(worldState.factions, normalizedFactionId)
      ? [normalizedFactionId]
      : []
    : Object.keys(worldState.factions)
  const runtimeEvents = getWorldEvents(Math.max(eventLimit * 12, 120)).items
    .filter((event) => {
      if (!AI_RUNTIME_OBSERVABILITY_ACTIONS.has(event.action)) {
        return false
      }
      if (!normalizedFactionId) {
        return true
      }
      const eventFactionId = extractWorldEventFactionId(event)
      return eventFactionId === normalizedFactionId || (eventFactionId == null && event.action === 'advance_tick')
    })
  const recentEvents = runtimeEvents.slice(0, eventLimit)
  const lockHolder = getActiveWorldMutationHolder()
  const recentFailures = buildAiRuntimeFailureAggregation(runtimeEvents, eventLimit)
  const lockConflicts = buildAiRuntimeLockConflictAggregation(runtimeEvents, eventLimit)

  return {
    tick: worldState.tick,
    worldVersion: worldState.worldVersion,
    generatedAt: new Date().toISOString(),
    factionFilter: normalizedFactionId,
    runtime: {
      lock: {
        busy: Boolean(lockHolder),
        holder: lockHolder,
      },
      queuePlanFailureStats: buildAiRuntimeCategoryStats(queuePlanFailureStats),
      queuePlanConflictStats: buildAiRuntimeCategoryStats(queuePlanConflictStats),
      advanceTickFailureStats: buildAiRuntimeCategoryStats(advanceTickFailureStats),
      advanceTickPerformance: buildAdvanceTickPerformanceSnapshot(),
      recentFailures,
      lockConflicts,
      sessionMetrics: getSessionMetrics(),
      wsStats: getWebSocketStats(),
    },
    factions: factionIds.map((factionId) => {
      const session = getFactionSessionSnapshot(factionId)
      const aiState = worldState.slgDomainState?.aiStateByFaction?.[factionId] ?? {}
      const execution = buildAiExecutionStateSnapshot(worldState, factionId)
      const lastFailureEvent = recentEvents.find((event) => {
        if (event.success) {
          return false
        }
        const eventFactionId = extractWorldEventFactionId(event)
        return eventFactionId === factionId || (eventFactionId == null && event.action === 'advance_tick')
      })

      return {
        factionId,
        autonomyLevel: session.autonomyLevel,
        controlMode: resolveSessionControlMode(session.autonomyLevel),
        playerNames: session.playerNames ?? [],
        online: session.online,
        seatCount: session.seatCount ?? 0,
        onlineSeatCount: session.onlineSeatCount ?? 0,
        contextFocusId: aiState.contextFocusId,
        contextMemorySummary: aiState.contextMemorySummary ? structuredClone(aiState.contextMemorySummary) : undefined,
        agenda: aiState.agenda ? structuredClone(aiState.agenda) : undefined,
        execution,
        budget: buildAiRuntimeBudgetSnapshot(worldState, factionId, execution),
        lastAgendaActionId: aiState.lastAgendaActionId,
        updatedTick: aiState.updatedTick ?? execution?.updatedTick,
        updatedWorldVersion: aiState.updatedWorldVersion ?? execution?.updatedWorldVersion,
        lastFailure: lastFailureEvent ? buildAiRuntimeFailureRecord(lastFailureEvent) : undefined,
      }
    }),
    recentEvents,
  }
}

export function appendRuntimeWorldEvent(params: {
  action: string
  success: boolean
  category?: WorldEventRecord['category']
  message?: string
  metadata?: Record<string, unknown>
}): void {
  const world = getWorldStateReadonly()
  appendWorldEvent({
    category: params.category ?? 'system',
    action: params.action,
    success: params.success,
    tick: world.tick,
    worldVersion: world.worldVersion,
    message: params.message,
    metadata: params.metadata,
  })
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
  factionId?: string
  relatedId?: string
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

function resolveSaveSlotsFileSizeSnapshot(): { fileSizeBytes: number | null; fileSizeLevel: SaveSlotsFileSizeLevel } {
  let fileSizeBytes: number | null = null
  let fileSizeLevel: SaveSlotsFileSizeLevel = 'none'

  if (existsSync(SAVE_SLOTS_PERSIST_PATH)) {
    try {
      const stats = statSync(SAVE_SLOTS_PERSIST_PATH)
      fileSizeBytes = Number.isFinite(stats.size) ? stats.size : null
      if (typeof fileSizeBytes === 'number') {
        if (fileSizeBytes >= SAVE_SLOTS_HARD_LIMIT_BYTES) {
          fileSizeLevel = 'hard'
        } else if (fileSizeBytes >= SAVE_SLOTS_SOFT_LIMIT_BYTES) {
          fileSizeLevel = 'soft'
        } else {
          fileSizeLevel = 'ok'
        }
      }
    } catch {
      fileSizeLevel = 'none'
    }
  }

  return {
    fileSizeBytes,
    fileSizeLevel,
  }
}

export function getSaveSlotsArchiveCatalog() {
  const archives = listSaveSlotsArchiveFiles().map((item) => ({
    path: item.path,
    sizeBytes: item.sizeBytes,
    modifiedAt: new Date(item.mtimeMs).toISOString(),
  }))

  return {
    archives,
  }
}

function resolveSaveSlotsArchiveSelection(options: { archivePath?: string } = {}) {
  const archiveFiles = listSaveSlotsArchiveFiles()
  const archiveCount = archiveFiles.length
  const requestedArchivePath = options.archivePath?.trim()
  let selectedArchive: SaveSlotsArchiveFile | null = null

  if (requestedArchivePath) {
    const normalizedRequestedPath = resolvePath(requestedArchivePath)
    selectedArchive =
      archiveFiles.find((item) => resolvePath(item.path) === normalizedRequestedPath) ??
      (() => {
        if (!existsSync(normalizedRequestedPath)) {
          return null
        }
        try {
          const stats = statSync(normalizedRequestedPath)
          return {
            path: normalizedRequestedPath,
            mtimeMs: stats.mtimeMs,
            sizeBytes: stats.size,
          } satisfies SaveSlotsArchiveFile
        } catch {
          return null
        }
      })()
  } else {
    selectedArchive = archiveFiles[0] ?? null
  }

  return {
    archiveCount,
    selectedArchive,
  }
}

function parseSaveSlotsArchivePayload(archivePath: string): {
  slots: SaveSlotState[]
  persistVersion: number | null
} {
  const compressed = readFileSync(archivePath)
  const restoredJson = gunzipSync(compressed).toString('utf8')
  const parsed = JSON.parse(restoredJson) as unknown
  const slots = extractPersistedSaveSlots(parsed)
  const persistVersion =
    typeof parsed === 'object' && parsed !== null && typeof (parsed as { version?: unknown }).version === 'number'
      ? ((parsed as { version: number }).version ?? null)
      : null

  return {
    slots,
    persistVersion,
  }
}

function buildNormalizedSaveSlotStates(slots: SaveSlotState[]): SaveSlotState[] {
  const normalized: SaveSlotState[] = []
  for (const slot of slots) {
    const normalizedSlotId = normalizeSlotId(slot.record.slotId)
    normalized.push({
      record: {
        ...slot.record,
        slotId: normalizedSlotId,
      },
      world: slot.world,
    })
  }

  normalized.sort((a, b) => (a.record.savedAt < b.record.savedAt ? 1 : a.record.savedAt > b.record.savedAt ? -1 : 0))
  return normalized.slice(0, MAX_SAVE_SLOTS)
}

function buildSaveSlotsRecordSignature(slots: SaveSlotState[]): string {
  const normalizedRecords: Array<{
    slotId: string
    label: string
    tick: number
    worldVersion: number
    savedAt: string
  }> = []

  for (const slot of slots) {
    try {
      const slotId = normalizeSlotId(slot.record.slotId)
      normalizedRecords.push({
        slotId,
        label: slot.record.label,
        tick: slot.record.tick,
        worldVersion: slot.record.worldVersion,
        savedAt: slot.record.savedAt,
      })
    } catch {
      // ignore malformed records in signature comparison
    }
  }

  normalizedRecords.sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0))
  return JSON.stringify(normalizedRecords)
}

export function runSaveSlotsArchiveRestoreDrill(options: { archivePath?: string } = {}) {
  const executedAt = new Date().toISOString()
  const { archiveCount, selectedArchive } = resolveSaveSlotsArchiveSelection(options)

  const finish = (
    status: SaveSlotsArchiveRestoreDrillStatus,
    message: string,
    params: {
      archivePath?: string | null
      slotCount?: number | null
      persistVersion?: number | null
    } = {},
  ) => {
    const archivePath = params.archivePath ?? null
    const slotCount = params.slotCount ?? null
    const persistVersion = params.persistVersion ?? null
    saveSlotsLastRestoreDrillStatus = status
    saveSlotsLastRestoreDrillMessage = message
    saveSlotsLastRestoreDrillArchivePath = archivePath
    saveSlotsLastRestoreDrillSlotCount = slotCount

    if (status === 'passed') {
      saveSlotsRestoreDrillSuccessCount += 1
      saveSlotsLastRestoreDrillAt = Date.now()
    } else if (status === 'failed') {
      saveSlotsRestoreDrillFailureCount += 1
      saveSlotsLastRestoreDrillErrorAt = Date.now()
    }

    return {
      status,
      executedAt,
      archivePath,
      archiveCount,
      slotCount,
      persistVersion,
      message,
    }
  }

  if (!selectedArchive) {
    const { fileSizeLevel } = resolveSaveSlotsFileSizeSnapshot()
    const shouldRequireArchive = SAVE_SLOTS_ARCHIVE_ON_SOFT_LIMIT && (fileSizeLevel === 'soft' || fileSizeLevel === 'hard')
    if (shouldRequireArchive) {
      return finish(
        'failed',
        'No save-slot archive available while store is oversize; restore drill cannot be performed.',
      )
    }
    return finish('skipped', 'No save-slot archive available; restore drill skipped.')
  }

  try {
    const parsed = parseSaveSlotsArchivePayload(selectedArchive.path)
    const slots = parsed.slots
    if (slots.length <= 0) {
      return finish('failed', 'Archive payload contains no valid save slots.', {
        archivePath: selectedArchive.path,
      })
    }

    return finish('passed', 'Archive restore drill passed (dry-run parse).', {
      archivePath: selectedArchive.path,
      slotCount: slots.length,
      persistVersion: parsed.persistVersion,
    })
  } catch (error) {
    return finish('failed', `Archive restore drill failed: ${error instanceof Error ? error.message : String(error)}`, {
      archivePath: selectedArchive.path,
    })
  }
}

export async function runSaveSlotsArchiveRestoreApply(options: { archivePath?: string; force?: boolean } = {}) {
  const executedAt = new Date().toISOString()
  const { archiveCount, selectedArchive } = resolveSaveSlotsArchiveSelection(options)
  const forceApply = options.force === true

  const finish = (
    status: SaveSlotsArchiveRestoreApplyStatus,
    message: string,
    params: {
      archivePath?: string | null
      backupPath?: string | null
      slotCount?: number | null
      persistVersion?: number | null
    } = {},
  ) => {
    const archivePath = params.archivePath ?? null
    const backupPath = params.backupPath ?? null
    const slotCount = params.slotCount ?? null
    const persistVersion = params.persistVersion ?? null
    saveSlotsLastRestoreApplyStatus = status
    saveSlotsLastRestoreApplyMessage = message
    saveSlotsLastRestoreApplyArchivePath = archivePath
    saveSlotsLastRestoreApplyBackupPath = backupPath
    saveSlotsLastRestoreApplySlotCount = slotCount

    if (status === 'restored') {
      saveSlotsRestoreApplySuccessCount += 1
      saveSlotsLastRestoreApplyAt = Date.now()
    } else if (status === 'failed') {
      saveSlotsRestoreApplyFailureCount += 1
      saveSlotsLastRestoreApplyErrorAt = Date.now()
    }

    return {
      status,
      executedAt,
      archivePath,
      backupPath,
      archiveCount,
      slotCount,
      persistVersion,
      message,
      forced: forceApply,
    }
  }

  if (!selectedArchive) {
    return finish('failed', 'No save-slot archive available; restore apply cannot be performed.')
  }

  let parsedArchive: ReturnType<typeof parseSaveSlotsArchivePayload>
  let normalizedSlots: SaveSlotState[]
  try {
    parsedArchive = parseSaveSlotsArchivePayload(selectedArchive.path)
    if (parsedArchive.slots.length <= 0) {
      return finish('failed', 'Archive payload contains no valid save slots.', {
        archivePath: selectedArchive.path,
        persistVersion: parsedArchive.persistVersion,
      })
    }
    normalizedSlots = buildNormalizedSaveSlotStates(parsedArchive.slots)
  } catch (error) {
    return finish('failed', `Archive restore apply parse failed: ${error instanceof Error ? error.message : String(error)}`, {
      archivePath: selectedArchive.path,
    })
  }

  await flushSaveSlotsPersist()
  const lockToken = tryAcquireSaveSlotsPersistLock()
  if (!lockToken) {
    return finish('failed', 'Save-slot restore apply lock contention: unable to acquire lock.', {
      archivePath: selectedArchive.path,
      slotCount: normalizedSlots.length,
      persistVersion: parsedArchive.persistVersion,
    })
  }

  const restorePayload: PersistedSaveSlotsPayload = {
    version: SAVE_SLOTS_PERSIST_VERSION,
    savedAt: Date.now(),
    slots: normalizedSlots,
  }
  const restoreSerializedPayload = JSON.stringify(restorePayload, null, 2)
  const restoreTempPath = `${SAVE_SLOTS_PERSIST_PATH}.restore.tmp`
  const restoreBackupPath = `${SAVE_SLOTS_PERSIST_PATH}.restore.bak.${Date.now()}`
  let existingPayload: string | null = null
  let backupWritten = false
  const targetSignature = buildSaveSlotsRecordSignature(normalizedSlots)

  try {
    if (existsSync(SAVE_SLOTS_PERSIST_PATH)) {
      existingPayload = readFileSync(SAVE_SLOTS_PERSIST_PATH, 'utf8')
    }

    if (!forceApply && typeof existingPayload === 'string') {
      try {
        const existingParsed = JSON.parse(existingPayload) as unknown
        const existingSlots = extractPersistedSaveSlots(existingParsed)
        const existingSignature = buildSaveSlotsRecordSignature(existingSlots)
        if (existingSignature === targetSignature) {
          return finish('skipped', 'Restore skipped: archive slot-state already matches active save-slot store.', {
            archivePath: selectedArchive.path,
            slotCount: normalizedSlots.length,
            persistVersion: parsedArchive.persistVersion,
          })
        }
      } catch {
        // ignore existing payload parse errors; restore can still proceed and overwrite with valid payload
      }
    }

    mkdirSync(dirname(SAVE_SLOTS_PERSIST_PATH), { recursive: true })

    if (typeof existingPayload === 'string') {
      await writeFile(restoreBackupPath, existingPayload, 'utf8')
      backupWritten = true
    }

    await writeFile(restoreTempPath, restoreSerializedPayload, 'utf8')
    renameSync(restoreTempPath, SAVE_SLOTS_PERSIST_PATH)

    saveSlots.clear()
    for (const slot of normalizedSlots) {
      saveSlots.set(slot.record.slotId, {
        record: { ...slot.record },
        world: slot.world,
      })
    }
    trimSaveSlots()
    saveSlotsLoaded = true
    saveSlotsRestoredSlotCount = saveSlots.size
    saveSlotsLastRestoreAt = Date.now()
    saveSlotsPersistDirty = false
    saveSlotsPersistInFlight = false

    return finish('restored', 'Archive restore applied to active save-slot store.', {
      archivePath: selectedArchive.path,
      backupPath: backupWritten ? restoreBackupPath : null,
      slotCount: saveSlots.size,
      persistVersion: parsedArchive.persistVersion,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    let rollbackMessage = ''

    if (typeof existingPayload === 'string') {
      try {
        await writeFile(SAVE_SLOTS_PERSIST_PATH, existingPayload, 'utf8')
        rollbackMessage = ' Rollback succeeded using pre-restore payload.'
      } catch (rollbackError) {
        rollbackMessage = ` Rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`
      }
    }

    try {
      if (existsSync(restoreTempPath)) {
        renameSync(restoreTempPath, `${restoreTempPath}.failed.${Date.now()}`)
      }
    } catch {
      // ignore temp cleanup failures
    }

    return finish('failed', `Archive restore apply failed: ${errorMessage}.${rollbackMessage}`.trim(), {
      archivePath: selectedArchive.path,
      backupPath: backupWritten ? restoreBackupPath : null,
      slotCount: normalizedSlots.length,
      persistVersion: parsedArchive.persistVersion,
    })
  } finally {
    releaseSaveSlotsPersistLock(lockToken)
  }
}

export function runSaveSlotsArchiveRestoreRollbackDrill(options: { archivePath?: string; drillDir?: string } = {}) {
  const executedAt = new Date().toISOString()
  const { archiveCount, selectedArchive } = resolveSaveSlotsArchiveSelection(options)
  const requestedDrillDir = options.drillDir?.trim()
  const drillDir = requestedDrillDir
    ? resolvePath(requestedDrillDir)
    : join(SAVE_SLOTS_ARCHIVE_DIR, '__restore_rollback_drill__')

  const finish = (
    status: SaveSlotsArchiveRestoreRollbackDrillStatus,
    message: string,
    params: {
      archivePath?: string | null
      backupPath?: string | null
      drillStorePath?: string | null
      slotCount?: number | null
      persistVersion?: number | null
      rollbackVerified?: boolean | null
    } = {},
  ) => {
    const archivePath = params.archivePath ?? null
    const backupPath = params.backupPath ?? null
    const drillStorePath = params.drillStorePath ?? null
    const slotCount = params.slotCount ?? null
    const persistVersion = params.persistVersion ?? null
    const rollbackVerified = params.rollbackVerified ?? null

    saveSlotsLastRestoreRollbackDrillStatus = status
    saveSlotsLastRestoreRollbackDrillMessage = message
    saveSlotsLastRestoreRollbackDrillArchivePath = archivePath
    saveSlotsLastRestoreRollbackDrillBackupPath = backupPath
    saveSlotsLastRestoreRollbackDrillStorePath = drillStorePath
    saveSlotsLastRestoreRollbackDrillSlotCount = slotCount
    saveSlotsLastRestoreRollbackDrillVerified = rollbackVerified

    if (status === 'passed') {
      saveSlotsRestoreRollbackDrillSuccessCount += 1
      saveSlotsLastRestoreRollbackDrillAt = Date.now()
    } else if (status === 'failed') {
      saveSlotsRestoreRollbackDrillFailureCount += 1
      saveSlotsLastRestoreRollbackDrillErrorAt = Date.now()
    }

    return {
      status,
      executedAt,
      archivePath,
      backupPath,
      drillStorePath,
      archiveCount,
      slotCount,
      persistVersion,
      rollbackVerified,
      message,
    }
  }

  if (!selectedArchive) {
    const { fileSizeLevel } = resolveSaveSlotsFileSizeSnapshot()
    const shouldRequireArchive = SAVE_SLOTS_ARCHIVE_ON_SOFT_LIMIT && (fileSizeLevel === 'soft' || fileSizeLevel === 'hard')
    if (shouldRequireArchive) {
      return finish(
        'failed',
        'No save-slot archive available while store is oversize; restore rollback drill cannot be performed.',
      )
    }
    return finish('skipped', 'No save-slot archive available; restore rollback drill skipped.')
  }

  let parsedArchive: ReturnType<typeof parseSaveSlotsArchivePayload>
  let normalizedSlots: SaveSlotState[]
  try {
    parsedArchive = parseSaveSlotsArchivePayload(selectedArchive.path)
    if (parsedArchive.slots.length <= 0) {
      return finish('failed', 'Archive payload contains no valid save slots.', {
        archivePath: selectedArchive.path,
        persistVersion: parsedArchive.persistVersion,
      })
    }
    normalizedSlots = buildNormalizedSaveSlotStates(parsedArchive.slots)
  } catch (error) {
    return finish('failed', `Archive restore rollback drill parse failed: ${error instanceof Error ? error.message : String(error)}`, {
      archivePath: selectedArchive.path,
    })
  }

  const restorePayload: PersistedSaveSlotsPayload = {
    version: SAVE_SLOTS_PERSIST_VERSION,
    savedAt: Date.now(),
    slots: normalizedSlots,
  }
  const restoreSerializedPayload = JSON.stringify(restorePayload, null, 2)
  let baselinePayload: string

  try {
    baselinePayload = existsSync(SAVE_SLOTS_PERSIST_PATH)
      ? readFileSync(SAVE_SLOTS_PERSIST_PATH, 'utf8')
      : JSON.stringify(buildSaveSlotsPersistPayload(), null, 2)
  } catch (error) {
    return finish('failed', `Restore rollback drill baseline snapshot failed: ${error instanceof Error ? error.message : String(error)}`, {
      archivePath: selectedArchive.path,
      slotCount: normalizedSlots.length,
      persistVersion: parsedArchive.persistVersion,
    })
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const drillStorePath = join(drillDir, `${SAVE_SLOTS_ARCHIVE_BASENAME}.rollback-drill.${stamp}.json`)
  const restoreTempPath = `${drillStorePath}.restore.tmp`
  const restoreBackupPath = `${drillStorePath}.restore.bak.${Date.now()}`

  try {
    mkdirSync(drillDir, { recursive: true })
    writeFileSync(drillStorePath, baselinePayload, 'utf8')
    writeFileSync(restoreBackupPath, baselinePayload, 'utf8')
    writeFileSync(restoreTempPath, restoreSerializedPayload, 'utf8')
    throw new Error('Simulated restore apply failure after backup write.')
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    let rollbackSucceeded = false
    let rollbackErrorMessage = ''

    try {
      writeFileSync(drillStorePath, baselinePayload, 'utf8')
      rollbackSucceeded = true
    } catch (rollbackError) {
      rollbackErrorMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
    }

    try {
      if (existsSync(restoreTempPath)) {
        renameSync(restoreTempPath, `${restoreTempPath}.failed.${Date.now()}`)
      }
    } catch {
      // ignore temp cleanup failures in drill mode
    }

    let rollbackVerified = false
    try {
      rollbackVerified = readFileSync(drillStorePath, 'utf8') === baselinePayload
    } catch {
      rollbackVerified = false
    }

    if (rollbackSucceeded && rollbackVerified) {
      return finish(
        'passed',
        `Restore rollback drill passed: simulated failure recovered via baseline rollback (${errorMessage}).`,
        {
          archivePath: selectedArchive.path,
          backupPath: restoreBackupPath,
          drillStorePath,
          slotCount: normalizedSlots.length,
          persistVersion: parsedArchive.persistVersion,
          rollbackVerified: true,
        },
      )
    }

    const rollbackReason = rollbackErrorMessage
      ? `Rollback write failed: ${rollbackErrorMessage}.`
      : 'Rollback write or verification failed.'
    return finish('failed', `Restore rollback drill failed: ${rollbackReason} Simulated failure: ${errorMessage}`, {
      archivePath: selectedArchive.path,
      backupPath: restoreBackupPath,
      drillStorePath,
      slotCount: normalizedSlots.length,
      persistVersion: parsedArchive.persistVersion,
      rollbackVerified,
    })
  }
}

export function getSaveSlotsPersistHealth() {
  refreshSaveSlotsArchiveFileCount()
  const { fileSizeBytes, fileSizeLevel } = resolveSaveSlotsFileSizeSnapshot()

  return {
    path: SAVE_SLOTS_PERSIST_PATH,
    loaded: saveSlotsLoaded,
    slotCount: saveSlots.size,
    persistDirty: saveSlotsPersistDirty,
    persistInFlight: saveSlotsPersistInFlight,
    persistSuccessCount: saveSlotsPersistSuccessCount,
    persistFailureCount: saveSlotsPersistFailureCount,
    lastPersistAt: saveSlotsLastPersistAt,
    lastPersistErrorAt: saveSlotsLastPersistErrorAt,
    corruptQuarantineCount: saveSlotsCorruptQuarantineCount,
    lastCorruptQuarantineAt: saveSlotsLastCorruptQuarantineAt,
    restoredSlotCount: saveSlotsRestoredSlotCount,
    lastRestoreAt: saveSlotsLastRestoreAt,
    persistVersion: SAVE_SLOTS_PERSIST_VERSION,
    lockPath: SAVE_SLOTS_LOCK_PATH,
    lockStaleMs: SAVE_SLOTS_LOCK_STALE_MS,
    lockContentionCount: saveSlotsPersistLockContentionCount,
    lockStealCount: saveSlotsPersistLockStealCount,
    lockFailureCount: saveSlotsPersistLockFailureCount,
    archiveOnSoftLimit: SAVE_SLOTS_ARCHIVE_ON_SOFT_LIMIT,
    archiveDir: SAVE_SLOTS_ARCHIVE_DIR,
    archiveMaxFiles: SAVE_SLOTS_ARCHIVE_MAX_FILES,
    archiveFileCount: saveSlotsArchiveFileCount,
    archiveSuccessCount: saveSlotsArchiveSuccessCount,
    archiveFailureCount: saveSlotsArchiveFailureCount,
    lastArchiveAt: saveSlotsLastArchiveAt,
    lastArchiveErrorAt: saveSlotsLastArchiveErrorAt,
    lastArchivePath: saveSlotsLastArchivePath,
    restoreDrillSuccessCount: saveSlotsRestoreDrillSuccessCount,
    restoreDrillFailureCount: saveSlotsRestoreDrillFailureCount,
    lastRestoreDrillAt: saveSlotsLastRestoreDrillAt,
    lastRestoreDrillErrorAt: saveSlotsLastRestoreDrillErrorAt,
    lastRestoreDrillArchivePath: saveSlotsLastRestoreDrillArchivePath,
    lastRestoreDrillSlotCount: saveSlotsLastRestoreDrillSlotCount,
    lastRestoreDrillStatus: saveSlotsLastRestoreDrillStatus,
    lastRestoreDrillMessage: saveSlotsLastRestoreDrillMessage,
    restoreApplySuccessCount: saveSlotsRestoreApplySuccessCount,
    restoreApplyFailureCount: saveSlotsRestoreApplyFailureCount,
    lastRestoreApplyAt: saveSlotsLastRestoreApplyAt,
    lastRestoreApplyErrorAt: saveSlotsLastRestoreApplyErrorAt,
    lastRestoreApplyArchivePath: saveSlotsLastRestoreApplyArchivePath,
    lastRestoreApplyBackupPath: saveSlotsLastRestoreApplyBackupPath,
    lastRestoreApplySlotCount: saveSlotsLastRestoreApplySlotCount,
    lastRestoreApplyStatus: saveSlotsLastRestoreApplyStatus,
    lastRestoreApplyMessage: saveSlotsLastRestoreApplyMessage,
    restoreRollbackDrillSuccessCount: saveSlotsRestoreRollbackDrillSuccessCount,
    restoreRollbackDrillFailureCount: saveSlotsRestoreRollbackDrillFailureCount,
    lastRestoreRollbackDrillAt: saveSlotsLastRestoreRollbackDrillAt,
    lastRestoreRollbackDrillErrorAt: saveSlotsLastRestoreRollbackDrillErrorAt,
    lastRestoreRollbackDrillArchivePath: saveSlotsLastRestoreRollbackDrillArchivePath,
    lastRestoreRollbackDrillBackupPath: saveSlotsLastRestoreRollbackDrillBackupPath,
    lastRestoreRollbackDrillStorePath: saveSlotsLastRestoreRollbackDrillStorePath,
    lastRestoreRollbackDrillSlotCount: saveSlotsLastRestoreRollbackDrillSlotCount,
    lastRestoreRollbackDrillStatus: saveSlotsLastRestoreRollbackDrillStatus,
    lastRestoreRollbackDrillMessage: saveSlotsLastRestoreRollbackDrillMessage,
    lastRestoreRollbackDrillVerified: saveSlotsLastRestoreRollbackDrillVerified,
    fileSizeBytes,
    fileSizeLevel,
    softLimitBytes: SAVE_SLOTS_SOFT_LIMIT_BYTES,
    hardLimitBytes: SAVE_SLOTS_HARD_LIMIT_BYTES,
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
  scheduleSaveSlotsPersist()

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

export function primeReplayFixtureSlot(
  slotId: string,
  options: {
    label?: string
    source?: ReplayFixtureSource
  } = {},
): SaveSlotRecord {
  const normalizedSlotId = normalizeSlotId(slotId)
  const source: ReplayFixtureSource = options.source === 'current_world' ? 'current_world' : 'initial_world_v1'
  const fixtureWorld = source === 'current_world' ? structuredClone(worldState) : createInitialWorldState()
  syncAllFactionAiQuota(fixtureWorld)

  const now = new Date().toISOString()
  const record: SaveSlotRecord = {
    slotId: normalizedSlotId,
    label: options.label?.trim() || `Replay Fixture ${normalizedSlotId}`,
    tick: fixtureWorld.tick,
    worldVersion: fixtureWorld.worldVersion,
    savedAt: now,
  }

  saveSlots.set(normalizedSlotId, {
    record,
    world: fixtureWorld,
  })

  trimSaveSlots()
  scheduleSaveSlotsPersist()

  appendWorldEvent({
    category: 'persistence',
    action: 'save_slot_fixture',
    success: true,
    tick: worldState.tick,
    worldVersion: worldState.worldVersion,
    message: `save slot fixture ${normalizedSlotId} primed`,
    metadata: {
      slotId: normalizedSlotId,
      label: record.label,
      source,
      fixtureTick: fixtureWorld.tick,
      fixtureWorldVersion: fixtureWorld.worldVersion,
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
  factionId?: FactionId
  relatedId?: string
}

type SetRecruitSelectedPoolActionParams = {
  factionId?: FactionId
  poolId: string
}

type SetAiContextFocusActionParams = {
  factionId?: FactionId
  contextFocusId: 'focus_city' | 'focus_troop' | 'focus_alliance'
}

type SetGeneralTacticActionParams = {
  factionId?: FactionId
  heroId: string
  tacticId: 'assault' | 'guard' | 'logistics'
}

type QueueAiAgendaActionParams = {
  factionId?: FactionId
  agendaActionId: 'agenda_expand' | 'agenda_support' | 'agenda_stabilize' | 'agenda_recover' | 'agenda_redeploy'
}

type FactionGeneral = ReturnType<typeof getGeneralProfilesForFaction>[number]

export async function queuePlanExecutionAction(
  params: QueuePlanExecutionActionParams,
  includeWorld = true,
): Promise<WorldActionResponse> {
  const targetFactionId = params.factionId ?? resolveDefaultFactionId()
  const autonomyLevel = getFactionAutonomyLevel(targetFactionId)
  const controlMode =
    autonomyLevel === 'L1_assigned'
      ? 'human_assigned'
      : autonomyLevel === 'L3_negotiated'
        ? 'ai_negotiated'
        : 'ai_delegated'

  const mutationLock = tryAcquireWorldMutationLock('queue_plan_execution')
  if (!mutationLock) {
    const failed = buildWorldMutationBusyResponse(includeWorld, targetFactionId, params.requestId)
    const mutationHolder = getActiveWorldMutationHolder()
    const failureCategory: QueuePlanFailureCategory = 'mutation_lock_busy'
    const conflictCategory: QueuePlanConflictCategory = 'mutation_lock_busy'
    bumpCategoryStats(queuePlanFailureStats, failureCategory)
    bumpCategoryStats(queuePlanConflictStats, conflictCategory)

    appendWorldEvent({
      category: 'planning',
      action: 'queue_plan_execution',
      success: false,
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
      requestId: params.requestId,
      message: failed.message,
      metadata: {
        source: params.source,
        factionId: targetFactionId,
        autonomyLevel,
        controlMode,
        basedOnWorldVersion: params.basedOnWorldVersion,
        failureCode: failed.failureCode,
        failureCategory,
        conflictCategory,
        mutationHolder,
        queuePlanFailureStats: snapshotCategoryStats(queuePlanFailureStats),
        queuePlanConflictStats: snapshotCategoryStats(queuePlanConflictStats),
        executionStatus: failed.execution?.status,
        activeOrderCount: failed.execution?.activeOrderCount,
        queuedOrderCount: failed.execution?.queuedOrderCount,
        runningOrderCount: failed.execution?.runningOrderCount,
        actionPointsRemaining: failed.execution?.actionPointsRemaining,
        foodRemaining: failed.execution?.foodRemaining,
        activeRequestId: failed.execution?.requestId,
      },
    })

    return failed
  }

  try {
    let planForExecution = params.plan
    let generalDispatchMeta: Record<string, unknown> | undefined
    let generalDirectiveMeta: Record<string, unknown> | undefined

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
      const failureCategory = resolveQueuePlanFailureCategory(result.failureCode)
      const conflictCategory = resolveQueuePlanConflictCategory(failureCategory)
      bumpCategoryStats(queuePlanFailureStats, failureCategory)
      if (conflictCategory !== 'none') {
        bumpCategoryStats(queuePlanConflictStats, conflictCategory)
      }

      const execution = buildAiExecutionStateSnapshot(worldState, targetFactionId)

      const failed = buildWorldActionResponse({
        ok: false,
        includeWorld,
        message: result.message,
        failureCode: result.failureCode,
        requestId: params.requestId,
        execution,
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
          failureCode: result.failureCode,
          failureCategory,
          conflictCategory,
          queuePlanFailureStats: snapshotCategoryStats(queuePlanFailureStats),
          queuePlanConflictStats: snapshotCategoryStats(queuePlanConflictStats),
          executionStatus: execution?.status,
          activeOrderCount: execution?.activeOrderCount,
          queuedOrderCount: execution?.queuedOrderCount,
          runningOrderCount: execution?.runningOrderCount,
          actionPointsRemaining: execution?.actionPointsRemaining,
          foodRemaining: execution?.foodRemaining,
          activeRequestId: execution?.requestId,
          ...(generalDirectiveMeta ?? {}),
          ...(generalDispatchMeta ?? {}),
        },
      })

      return failed
    }

    commitWorldState(result.world)
    refreshReplayArchive()
    const execution = buildAiExecutionStateSnapshot(worldState, targetFactionId)

    const succeeded = buildWorldActionResponse({
      ok: true,
      includeWorld,
      message: result.message,
      requestId: params.requestId,
      execution,
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
        enqueueOutcome: result.enqueueOutcome,
        queuePlanFailureStats: snapshotCategoryStats(queuePlanFailureStats),
        queuePlanConflictStats: snapshotCategoryStats(queuePlanConflictStats),
        executionStatus: execution?.status,
        activeOrderCount: execution?.activeOrderCount,
        queuedOrderCount: execution?.queuedOrderCount,
        runningOrderCount: execution?.runningOrderCount,
        actionPointsRemaining: execution?.actionPointsRemaining,
        foodRemaining: execution?.foodRemaining,
        activeRequestId: execution?.requestId,
        reviewAtTick: execution?.reviewAtTick,
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
  const normalizedAgenda = {
    ...preview.agenda,
    options: normalizeDomainAgendaOptions(preview.agenda),
    targetTileId: preview.agenda.targetTileId ?? preview.agenda.candidates[0]?.targetTileId,
    targetUnitIds: preview.agenda.targetUnitIds ?? preview.agenda.candidates[0]?.targetUnitIds ?? [],
    recommendedFollowups: preview.agenda.recommendedFollowups ?? [],
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
      optionCount: normalizedAgenda.options.length,
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
    domainAgenda: normalizedAgenda,
    domainCommMetrics: preview.metrics,
    domainMessages: includeMessages ? preview.messages : undefined,
  }
}

function normalizeDomainAgendaOptions(previewAgenda: {
  options?: DomainAgendaOption[]
  candidates: Array<{
    actionId: string
    intent: string
    summary: string
    priority: string
    targetTileId?: string
    targetUnitIds?: string[]
    supportingAiPlayerIds: string[]
    evidenceRefs: string[]
    supportCount?: number
    recommendedFollowups?: string[]
  }>
  recommendedFollowups?: string[]
}): DomainAgendaOption[] {
  const fallbackFollowups = previewAgenda.recommendedFollowups ?? []
  if (previewAgenda.options && previewAgenda.options.length > 0) {
    return previewAgenda.options.map((option, index): DomainAgendaOption => {
      const candidate = previewAgenda.candidates[index]
      return {
        actionId: option.actionId ?? candidate?.actionId ?? '',
        intent: option.intent ?? candidate?.intent ?? option.actionId ?? candidate?.actionId ?? '',
        label: option.label ?? candidate?.summary ?? option.summary ?? candidate?.actionId ?? '',
        summary: option.summary ?? candidate?.summary ?? option.label ?? '',
        priority: (option.priority ?? candidate?.priority ?? 'P2') as DomainAgendaOption['priority'],
        targetTileId: String(option.targetTileId ?? candidate?.targetTileId ?? '').trim() || undefined,
        targetUnitIds: Array.isArray(option.targetUnitIds)
          ? option.targetUnitIds
          : candidate?.targetUnitIds ?? [],
        supportingAiPlayerIds: Array.isArray(option.supportingAiPlayerIds)
          ? option.supportingAiPlayerIds
          : candidate?.supportingAiPlayerIds ?? [],
        evidenceRefs: Array.isArray(option.evidenceRefs) ? option.evidenceRefs : candidate?.evidenceRefs ?? [],
        supportCount: Number.isFinite(Number(option.supportCount))
          ? Math.max(0, Math.floor(Number(option.supportCount)))
          : candidate?.supportingAiPlayerIds.length ?? 0,
        recommendedFollowups:
          Array.isArray(option.recommendedFollowups) && option.recommendedFollowups.length > 0
            ? option.recommendedFollowups
            : fallbackFollowups,
      }
    })
  }

  return previewAgenda.candidates.map((candidate): DomainAgendaOption => ({
    actionId: candidate.actionId,
    intent: candidate.intent,
    label: candidate.summary,
    summary: candidate.summary,
    priority: candidate.priority as DomainAgendaOption['priority'],
    targetTileId: candidate.targetTileId,
    targetUnitIds: candidate.targetUnitIds ?? [],
    supportingAiPlayerIds: candidate.supportingAiPlayerIds,
    evidenceRefs: candidate.evidenceRefs,
    supportCount: candidate.supportingAiPlayerIds.length,
    recommendedFollowups: candidate.recommendedFollowups ?? fallbackFollowups,
  }))
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
      factionId: params.factionId,
      relatedId: params.relatedId,
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

function resolveAiContextRelatedId(world: WorldState, factionId: FactionId, contextFocusId: string): string | undefined {
  const faction = world.factions[factionId]
  if (!faction) {
    return undefined
  }

  switch (contextFocusId) {
    case 'focus_city':
      return faction.heroCommand.homeTileId || undefined
    case 'focus_troop': {
      const primaryUnit = world.units.find((unit) => unit.faction === factionId)
      return primaryUnit?.id
    }
    case 'focus_alliance': {
      const directives = Object.values(world.alliance.directives ?? {})
      if (directives.length > 0) {
        const regionById = new Map(world.map.regions.map((region) => [region.id, region]))
        const rankedDirective = directives
          .slice()
          .sort((left, right) => {
            if (left.supportLevel !== right.supportLevel) {
              return left.supportLevel - right.supportLevel
            }
            const leftRegion = regionById.get(left.regionId)
            const rightRegion = regionById.get(right.regionId)
            const leftPriority = String(leftRegion?.priority ?? '')
            const rightPriority = String(rightRegion?.priority ?? '')
            if (leftPriority !== rightPriority) {
              return leftPriority.localeCompare(rightPriority)
            }
            return left.regionId.localeCompare(right.regionId)
          })[0]
        if (rankedDirective?.regionId) {
          return rankedDirective.regionId
        }
      }

      const assignedRegionId = world.alliance.commanders.find((commander) => commander.assignedRegionId)?.assignedRegionId
      return assignedRegionId || undefined
    }
    default:
      return undefined
  }
}

function buildAiContextMemorySummary(entries: CivilMemoryEntry[], contextFocusId: string, updatedTick: number) {
  return {
    focusId: contextFocusId,
    lines: entries.slice(0, 3).map((entry) => {
      const typeLabel = String(entry.type ?? 'memory').trim()
      const summaryLabel = String(entry.summary ?? entry.title ?? '').trim()
      const tickLabel = typeof entry.tick === 'number' ? `T${entry.tick}` : ''
      return [typeLabel, summaryLabel, tickLabel].filter(Boolean).join(' · ')
    }),
    updatedTick,
  }
}

function findFactionUnitForHero(world: WorldState, factionId: FactionId, heroId: string) {
  return world.units.find((unit) => {
    if (unit.faction !== factionId) {
      return false
    }
    if (unit.hero?.id === heroId) {
      return true
    }
    return (unit.coHeroes ?? []).some((coHero) => coHero.id === heroId)
  })
}

function resolveGeneralTacticTemplateId(tacticId: SetGeneralTacticActionParams['tacticId']): Parameters<typeof queueTacticalOverride>[2] {
  switch (tacticId) {
    case 'guard':
      return 'garrison'
    case 'logistics':
      return 'rally'
    default:
      return 'breakthrough'
  }
}

function buildGeneralTacticSummary(heroId: string, tacticId: SetGeneralTacticActionParams['tacticId']): string {
  switch (tacticId) {
    case 'guard':
      return `武将 ${heroId} 切换为驻守态势`
    case 'logistics':
      return `武将 ${heroId} 切换为后勤支援态势`
    default:
      return `武将 ${heroId} 切换为先锋推进态势`
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
    const failed = buildWorldMutationBusyResponse(includeWorld)
    const mutationHolder = getActiveWorldMutationHolder()
    const failureCategory: AdvanceTickFailureCategory = 'mutation_lock_busy'
    bumpCategoryStats(advanceTickFailureStats, failureCategory)

    appendWorldEvent({
      category: 'world_action',
      action: 'advance_tick',
      success: false,
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
      message: failed.message,
      metadata: {
        failureCode: failed.failureCode,
        failureCategory,
        mutationHolder,
        advanceTickFailureStats: snapshotCategoryStats(advanceTickFailureStats),
      },
    })

    return failed
  }

  const tickBefore = worldState.tick
  const worldVersionBefore = worldState.worldVersion
  const startedAt = new Date().toISOString()
  const startedAtMs = performance.now()
  const phaseTimings: AiRuntimeAdvanceTickPhaseTiming[] = []
  let narrativeEventsCount = 0
  let memoryWrites = 0
  let memoryWriteFailures = 0
  let battleReportsBroadcast = 0

  try {
    const { domainCommWindow, nationalAgenda, courtSession } = await measureAdvanceTickPhase(
      phaseTimings,
      'compile_advisory',
      async () => {
        const advisoryWindow = compileNationalAgendaForCurrentWorld(9)
        const session = runCourtSession({
          world: worldState,
          nationalAgenda: advisoryWindow.nationalAgenda,
          maxProposals: 9,
        })
        return {
          domainCommWindow: advisoryWindow.domainCommWindow,
          nationalAgenda: advisoryWindow.nationalAgenda,
          courtSession: session,
        }
      },
    )

    await measureAdvanceTickPhase(phaseTimings, 'record_pre_tick_memory', () => {
      recordAgendaWindowMemory(nationalAgenda)
      recordCourtSessionMemory(courtSession)
    })

    await measureAdvanceTickPhase(phaseTimings, 'append_pre_tick_events', () => {
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
    })

    let previousWorld!: WorldState
    const advanceWorldSubphases: AiRuntimeAdvanceTickSubphaseTiming[] = []
    await measureAdvanceTickPhase(phaseTimings, 'advance_world_state', async () => {
      previousWorld = await measureAdvanceTickSubphase(
        advanceWorldSubphases,
        'advance_world_state.snapshot_previous_world',
        () => createWorldDeltaSnapshot(worldState, advanceWorldSubphases),
      )
      const advanceTickDiagnostics: AdvanceTickDiagnostics = { subphases: [] }
      const nextWorld = advanceTick(worldState, advanceTickDiagnostics)
      advanceWorldSubphases.push(...advanceTickDiagnostics.subphases)
      await measureAdvanceTickSubphase(advanceWorldSubphases, 'advance_world_state.commit_world_state', () => {
        commitWorldState(nextWorld, advanceWorldSubphases, previousWorld)
      })
      await measureAdvanceTickSubphase(advanceWorldSubphases, 'advance_world_state.refresh_replay_archive', () => {
        refreshReplayArchive()
      })
    }, { subphases: advanceWorldSubphases })

    // V2 sync + resource settlement: align captured tile/city snapshot first, then settle and mirror back to world.
    const syncV2Subphases: AiRuntimeAdvanceTickSubphaseTiming[] = []
    const v2Sync = await measureAdvanceTickPhase(phaseTimings, 'sync_v2_resources', async () => {
      const tileInfoById = await measureAdvanceTickSubphase(
        syncV2Subphases,
        'sync_v2_resources.build_tile_info_index',
        () => new Map(
          worldState.map.tiles.map((tile) => [
            tile.id,
            { type: tile.type, cityLevel: tile.cityLevel, resourceKind: tile.resourceKind },
          ]),
        ),
      )
      const syncResult = await measureAdvanceTickSubphase(
        syncV2Subphases,
        'sync_v2_resources.sync_v2_state',
        () => syncV2StateWithWorld(worldState),
      )
      await measureAdvanceTickSubphase(syncV2Subphases, 'sync_v2_resources.settle_resources', () => {
        settleResourcesForAllPlayers((tileId: string) => tileInfoById.get(tileId))
      })
      await measureAdvanceTickSubphase(
        syncV2Subphases,
        'sync_v2_resources.mirror_world_faction_resources',
        () => {
          syncWorldFactionResourcesFromV2(worldState)
        },
      )
      return syncResult
    }, { subphases: syncV2Subphases })

    const reflectWorldSubphases: AiRuntimeAdvanceTickSubphaseTiming[] = []
    const reflectResult = await measureAdvanceTickPhase(phaseTimings, 'reflect_world_tick', async () => {
      const result = await reflectWorldTick({
        before: previousWorld,
        after: worldState,
        commanderId: process.env.COMMANDER_AGENT_ID?.trim() || `commander_${Object.keys(worldState.factions)[0] ?? 'default'}`,
      })
      reflectWorldSubphases.push(...result.performance.subphases)
      return result
    }, { subphases: reflectWorldSubphases })

    const passedResolutions = courtSession.resolutions.filter((item) => item.decision === 'passed')
    narrativeEventsCount = reflectResult.events.length
    memoryWrites = reflectResult.memoryWrites
    memoryWriteFailures = reflectResult.memoryWriteFailures
    await measureAdvanceTickPhase(phaseTimings, 'record_post_tick_memory', () => {
      recordSimulationNarrativeEvents(reflectResult.events)
      recordExecutionOutcomeMemory({
        tick: worldState.tick,
        worldVersion: worldState.worldVersion,
        narrativeCount: reflectResult.events.length,
        memoryWrites: reflectResult.memoryWrites,
        memoryWriteFailures: reflectResult.memoryWriteFailures,
        passedResolutions,
      })
    })

    // WebSocket delta broadcast for subscribed clients
    const broadcastRuntimeSubphases: AiRuntimeAdvanceTickSubphaseTiming[] = []
    battleReportsBroadcast = await measureAdvanceTickPhase(phaseTimings, 'broadcast_runtime', async () => {
      const tickDeltaSummary = broadcastTickDelta(previousWorld, worldState, reflectResult.events)
      broadcastRuntimeSubphases.push(...tickDeltaSummary.subphases)
      return measureAdvanceTickSubphase(broadcastRuntimeSubphases, 'broadcast_runtime.battle_report_fanout', () => {
        let broadcastCount = 0
        const previousBattleRecordIds = new Set(previousWorld.feedback.battleRecords.map((record) => record.id))
        for (const br of worldState.feedback.battleRecords) {
          if (!previousBattleRecordIds.has(br.id)) {
            broadcastBattleReport(worldState.tick, br)
            broadcastCount += 1
          }
        }
        return broadcastCount
      })
    }, { subphases: broadcastRuntimeSubphases })

    const response = await measureAdvanceTickPhase(phaseTimings, 'finalize_response', () => ({
      ...buildWorldActionResponse({
        ok: true,
        includeWorld,
      }),
      nationalAgenda,
      courtSession,
    }))
    const timing = finalizeAdvanceTickRun({
      startedAt,
      startedAtMs,
      phases: phaseTimings,
      outcome: 'success',
      tickBefore,
      tickAfter: worldState.tick,
      worldVersionBefore,
      worldVersionAfter: worldState.worldVersion,
      narrativeEvents: narrativeEventsCount,
      memoryWrites,
      memoryWriteFailures,
      battleReportsBroadcast,
    })
    recordAdvanceTickRun(timing)

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
        v2AutoPlayersSynced: v2Sync.autoPlayers,
        v2SyncedFactions: v2Sync.syncedFactions,
        advanceTickFailureStats: snapshotCategoryStats(advanceTickFailureStats),
        advanceTickTiming: {
          totalDurationMs: timing.totalDurationMs,
          slowestPhase: timing.slowestPhase,
          slowestPhaseDurationMs: timing.slowestPhaseDurationMs,
          phaseDurationsMs: buildAdvanceTickPhaseTimingsRecord(timing.phases),
          subphaseDurationsMs: buildAdvanceTickSubphaseTimingsRecord(timing.phases),
        },
      },
    })

    return response
  } catch (error) {
    const failureCategory: AdvanceTickFailureCategory = 'runtime_error'
    bumpCategoryStats(advanceTickFailureStats, failureCategory)
    const timing = finalizeAdvanceTickRun({
      startedAt,
      startedAtMs,
      phases: phaseTimings,
      outcome: 'runtime_error',
      tickBefore,
      tickAfter: worldState.tick,
      worldVersionBefore,
      worldVersionAfter: worldState.worldVersion,
      narrativeEvents: narrativeEventsCount,
      memoryWrites,
      memoryWriteFailures,
      battleReportsBroadcast,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'advance_tick failed',
    })
    recordAdvanceTickRun(timing)
    appendWorldEvent({
      category: 'world_action',
      action: 'advance_tick',
      success: false,
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
      message: error instanceof Error ? error.message : 'advance_tick failed',
      metadata: {
        failureCategory,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        advanceTickFailureStats: snapshotCategoryStats(advanceTickFailureStats),
        advanceTickTiming: {
          totalDurationMs: timing.totalDurationMs,
          slowestPhase: timing.slowestPhase,
          slowestPhaseDurationMs: timing.slowestPhaseDurationMs,
          phaseDurationsMs: buildAdvanceTickPhaseTimingsRecord(timing.phases),
          subphaseDurationsMs: buildAdvanceTickSubphaseTimingsRecord(timing.phases),
        },
      },
    })
    throw error
  } finally {
    mutationLock.release()
  }
}

export function clearPlanExecutionAction(includeWorld = true, factionId?: FactionId): WorldActionResponse {
  const targetFactionId = factionId ?? resolveDefaultFactionId()
  const mutationLock = tryAcquireWorldMutationLock('clear_plan_execution')
  if (!mutationLock) {
    const failed = buildWorldMutationBusyResponse(includeWorld, targetFactionId)
    const mutationHolder = getActiveWorldMutationHolder()
    appendWorldEvent({
      category: 'world_action',
      action: 'clear_plan_execution',
      success: false,
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
      message: failed.message,
      metadata: {
        factionId: targetFactionId,
        failureCode: failed.failureCode,
        conflictCategory: 'mutation_lock_busy',
        mutationHolder,
        executionStatus: failed.execution?.status,
        activeOrderCount: failed.execution?.activeOrderCount,
        queuedOrderCount: failed.execution?.queuedOrderCount,
        runningOrderCount: failed.execution?.runningOrderCount,
        actionPointsRemaining: failed.execution?.actionPointsRemaining,
        foodRemaining: failed.execution?.foodRemaining,
        activeRequestId: failed.execution?.requestId,
      },
    })
    return failed
  }

  try {
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

export function promoteCityBuildingAction(
  cityId: string,
  groupId: string,
  buildingId: string,
  includeWorld = true,
  factionId?: FactionId,
): WorldActionResponse {
  const mutationLock = tryAcquireWorldMutationLock('promote_city_building')
  if (!mutationLock) {
    return buildWorldMutationBusyResponse(includeWorld)
  }

  try {
    const targetFactionId = factionId ?? resolveDefaultFactionId()
    const result = promoteCityBuilding(worldState, cityId, groupId, buildingId, targetFactionId)
    if (!result.ok) {
      const failed = buildWorldActionResponse({
        ok: false,
        includeWorld,
        message: result.message,
      })
      appendWorldEvent({
        category: 'world_action',
        action: 'promote_city_building',
        success: false,
        tick: worldState.tick,
        worldVersion: worldState.worldVersion,
        message: result.message,
        metadata: { cityId, groupId, buildingId, factionId: targetFactionId },
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
      action: 'promote_city_building',
      success: true,
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
      message: result.message,
      metadata: { cityId, groupId, buildingId, factionId: targetFactionId, nextLevel: result.nextLevel },
    })
    return succeeded
  } finally {
    mutationLock.release()
  }
}

export function setGeneralActiveHeroAction(
  heroId: string,
  includeWorld = true,
  factionId?: FactionId,
): WorldActionResponse {
  const requestId = randomUUID()
  const mutationLock = tryAcquireWorldMutationLock('set_general_active_hero')
  if (!mutationLock) {
    return buildWorldMutationBusyResponse(includeWorld, factionId, requestId)
  }

  try {
    const targetFactionId = factionId ?? resolveDefaultFactionId()
    const result = setGeneralActiveHero(worldState, heroId, targetFactionId)
    if (!result.ok) {
      const execution = buildAiExecutionStateSnapshot(worldState, targetFactionId)
      const failed = buildWorldActionResponse({
        ok: false,
        includeWorld,
        message: result.message,
        requestId,
        heroId,
        relatedId: heroId,
        execution,
      })
      appendWorldEvent({
        category: 'world_action',
        action: 'set_general_active_hero',
        success: false,
        tick: worldState.tick,
        worldVersion: worldState.worldVersion,
        requestId,
        message: result.message,
        metadata: {
          factionId: targetFactionId,
          heroId,
          executionStatus: execution?.status,
          activeOrderCount: execution?.activeOrderCount,
          actionPointsRemaining: execution?.actionPointsRemaining,
          foodRemaining: execution?.foodRemaining,
        },
      })
      return failed
    }

    commitWorldState(result.world)
    const execution = buildAiExecutionStateSnapshot(worldState, targetFactionId)
    const response = buildWorldActionResponse({
      ok: true,
      includeWorld,
      message: result.message,
      requestId,
      heroId: result.heroId,
      relatedId: result.heroId,
      execution,
    })
    appendWorldEvent({
      category: 'world_action',
      action: 'set_general_active_hero',
      success: true,
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
      requestId,
      message: result.message,
      metadata: {
        factionId: targetFactionId,
        heroId: result.heroId,
        executionStatus: execution?.status,
        activeOrderCount: execution?.activeOrderCount,
        actionPointsRemaining: execution?.actionPointsRemaining,
        foodRemaining: execution?.foodRemaining,
      },
    })
    return response
  } finally {
    mutationLock.release()
  }
}

export function setGeneralTacticAction(
  heroId: string,
  tacticId: SetGeneralTacticActionParams['tacticId'],
  includeWorld = true,
  factionId?: FactionId,
): WorldActionResponse {
  const requestId = randomUUID()
  const mutationLock = tryAcquireWorldMutationLock('set_general_tactic')
  if (!mutationLock) {
    return buildWorldMutationBusyResponse(includeWorld, factionId, requestId)
  }

  try {
    const targetFactionId = factionId ?? resolveDefaultFactionId()
    const result = setGeneralTactic(worldState, heroId, tacticId, targetFactionId)
    if (!result.ok) {
      const execution = buildAiExecutionStateSnapshot(worldState, targetFactionId)
      const failed = buildWorldActionResponse({
        ok: false,
        includeWorld,
        message: result.message,
        requestId,
        heroId,
        tacticId,
        relatedId: heroId,
        execution,
      })
      appendWorldEvent({
        category: 'world_action',
        action: 'set_general_tactic',
        success: false,
        tick: worldState.tick,
        worldVersion: worldState.worldVersion,
        requestId,
        message: result.message,
        metadata: {
          factionId: targetFactionId,
          heroId,
          tacticId,
          executionStatus: execution?.status,
          activeOrderCount: execution?.activeOrderCount,
          actionPointsRemaining: execution?.actionPointsRemaining,
          foodRemaining: execution?.foodRemaining,
        },
      })
      return failed
    }

    let nextWorld = result.world
    const activeUnit = findFactionUnitForHero(nextWorld, targetFactionId, result.heroId)
    nextWorld.slgDomainState ??= {}
    nextWorld.slgDomainState.generalStateByFaction ??= {}
    const currentGeneralState = nextWorld.slgDomainState.generalStateByFaction[targetFactionId] ?? {}
    if (activeUnit?.tileId) {
      nextWorld = queueTacticalOverride(
        nextWorld,
        activeUnit.id,
        resolveGeneralTacticTemplateId(tacticId),
        activeUnit.tileId,
        buildGeneralTacticSummary(result.heroId, tacticId),
        targetFactionId,
      )
      nextWorld.slgDomainState ??= {}
      nextWorld.slgDomainState.generalStateByFaction ??= {}
      const currentState = nextWorld.slgDomainState.generalStateByFaction[targetFactionId] ?? currentGeneralState
      const existingHeroPreview = (currentState.directivePreviewByHeroId ?? {})[result.heroId] ?? {}
      const appliedDirectivePreview = {
        ...existingHeroPreview,
        heroId: result.heroId,
        tacticId,
        source: 'hero_authority',
        sourceActionId: 'set_general_tactic',
        accepted: 1,
        rejected: 0,
        status: 'applied',
        executionState: 'queued_to_unit',
        summary: `${buildGeneralTacticSummary(result.heroId, tacticId)}，并已同步到当前部队。`,
        warnings: [],
        effectLines: [
          `当前部队：${activeUnit.id}`,
          `当前位置：${activeUnit.tileId}`,
          `已写入模板：${resolveGeneralTacticTemplateId(tacticId)}`,
        ],
        nextSteps: ['当前部队已收到新的权威战法模板。', '如再次切换战法，当前部队会收到新的权威指令。'],
        templateId: resolveGeneralTacticTemplateId(tacticId),
        affectedUnitIds: [activeUnit.id],
        targetUnitId: activeUnit.id,
        targetTileId: activeUnit.tileId,
        updatedTick: nextWorld.tick,
        updatedWorldVersion: nextWorld.worldVersion,
      }
      nextWorld.slgDomainState.generalStateByFaction[targetFactionId] = {
        ...currentState,
        directivePreviewHeroId: currentState.activeHeroId === result.heroId ? result.heroId : currentState.directivePreviewHeroId,
        directivePreview: currentState.activeHeroId === result.heroId ? cloneGeneralDirectivePreviewMirror(appliedDirectivePreview) : currentState.directivePreview,
        directivePreviewByHeroId: {
          ...(currentState.directivePreviewByHeroId ?? {}),
          [result.heroId]: appliedDirectivePreview,
        },
        updatedTick: nextWorld.tick,
      }
    } else {
      const existingHeroPreview = (currentGeneralState.directivePreviewByHeroId ?? {})[result.heroId] ?? {}
      const pendingDirectivePreview = {
        ...existingHeroPreview,
        heroId: result.heroId,
        tacticId,
        source: 'hero_authority',
        sourceActionId: 'set_general_tactic',
        accepted: 1,
        rejected: 0,
        status: 'pending_assignment',
        executionState: 'pending_assignment',
        summary: `${buildGeneralTacticSummary(result.heroId, tacticId)} 当前未编组，已记录为待生效战法。`,
        warnings: ['当前武将未编组，战法将在后续编组或调度时继续生效。'],
        effectLines: [
          `当前武将 ${result.heroId} 尚未编组到部队。`,
          `战法 ${resolveGeneralTacticTemplateId(tacticId)} 已记入权威状态。`,
        ],
        nextSteps: ['如后续完成编组，权威模板会自动继承到目标部队。', '如果继续切换战法，待生效说明会被新的权威状态覆盖。'],
        templateId: resolveGeneralTacticTemplateId(tacticId),
        affectedUnitIds: [],
        updatedTick: nextWorld.tick,
        updatedWorldVersion: nextWorld.worldVersion,
      }
      nextWorld.slgDomainState.generalStateByFaction[targetFactionId] = {
        ...currentGeneralState,
        directivePreviewHeroId: currentGeneralState.activeHeroId === result.heroId ? result.heroId : currentGeneralState.directivePreviewHeroId,
        directivePreview:
          currentGeneralState.activeHeroId === result.heroId
            ? cloneGeneralDirectivePreviewMirror(pendingDirectivePreview)
            : currentGeneralState.directivePreview,
        directivePreviewByHeroId: {
          ...(currentGeneralState.directivePreviewByHeroId ?? {}),
          [result.heroId]: pendingDirectivePreview,
        },
        updatedTick: nextWorld.tick,
      }
    }

    commitWorldState(nextWorld)
    const execution = buildAiExecutionStateSnapshot(worldState, targetFactionId)
    const response = buildWorldActionResponse({
      ok: true,
      includeWorld,
      message: activeUnit?.id
        ? `${result.message} 已同步到部队 ${activeUnit.id}。`
        : `${result.message} 当前未编组，已记录为待生效战法。`,
      requestId,
      heroId: result.heroId,
      unitId: activeUnit?.id,
      tacticId,
      relatedId: result.heroId,
      execution,
    })
    appendWorldEvent({
      category: 'world_action',
      action: 'set_general_tactic',
      success: true,
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
      requestId,
      message: response.message,
      metadata: {
        factionId: targetFactionId,
        heroId: result.heroId,
        tacticId,
        unitId: activeUnit?.id,
        executionStatus: execution?.status,
        activeOrderCount: execution?.activeOrderCount,
        actionPointsRemaining: execution?.actionPointsRemaining,
        foodRemaining: execution?.foodRemaining,
      },
    })
    return response
  } finally {
    mutationLock.release()
  }
}

export function setAiContextFocusAction(
  contextFocusId: SetAiContextFocusActionParams['contextFocusId'],
  includeWorld = true,
  factionId?: FactionId,
): WorldActionResponse {
  const targetFactionId = factionId ?? resolveDefaultFactionId()
  const mutationLock = tryAcquireWorldMutationLock('set_ai_context_focus')
  if (!mutationLock) {
    const failed = buildWorldMutationBusyResponse(includeWorld, targetFactionId)
    appendWorldEvent({
      category: 'world_action',
      action: 'set_ai_context_focus',
      success: false,
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
      message: failed.message,
      metadata: {
        factionId: targetFactionId,
        contextFocusId,
        failureCode: failed.failureCode,
        mutationHolder: getActiveWorldMutationHolder(),
        executionStatus: failed.execution?.status,
        activeOrderCount: failed.execution?.activeOrderCount,
        queuedOrderCount: failed.execution?.queuedOrderCount,
        runningOrderCount: failed.execution?.runningOrderCount,
      },
    })
    return failed
  }

  try {
    const result = setAiContextFocus(worldState, contextFocusId, targetFactionId)
    if (!result.ok) {
      const failed = buildWorldActionResponse({
        ok: false,
        includeWorld,
        message: result.message,
      })
      appendWorldEvent({
        category: 'world_action',
        action: 'set_ai_context_focus',
        success: false,
        tick: worldState.tick,
        worldVersion: worldState.worldVersion,
        message: result.message,
        metadata: { factionId: targetFactionId, contextFocusId },
      })
      return failed
    }

    const relatedId = resolveAiContextRelatedId(result.world, targetFactionId, contextFocusId)
    let entries = listCivilMemoryEntries({
      limit: 3,
      factionId: targetFactionId,
      relatedId,
    })
    if (entries.length === 0 && relatedId) {
      entries = listCivilMemoryEntries({
        limit: 3,
        factionId: targetFactionId,
      })
    }
    result.world.slgDomainState ??= {}
    result.world.slgDomainState.aiStateByFaction ??= {}
    const currentAiState = result.world.slgDomainState.aiStateByFaction[targetFactionId] ?? {}
    result.world.slgDomainState.aiStateByFaction[targetFactionId] = {
      ...currentAiState,
      contextFocusId,
      contextMemorySummary: {
        ...buildAiContextMemorySummary(entries, contextFocusId, result.world.tick),
        relatedId,
      },
      updatedTick: result.world.tick,
    }

    commitWorldState(result.world)
    const response = {
      ...buildWorldActionResponse({
        ok: true,
        includeWorld,
        message: result.message,
        contextFocusId,
        relatedId,
      }),
      civilMemoryEntries: entries,
    }
    appendWorldEvent({
      category: 'world_action',
      action: 'set_ai_context_focus',
      success: true,
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
      message: result.message,
      metadata: {
        factionId: targetFactionId,
        contextFocusId,
        relatedId,
        results: entries.length,
      },
    })
    return response
  } finally {
    mutationLock.release()
  }
}

export function queueAiAgendaActionAction(
  agendaActionId: QueueAiAgendaActionParams['agendaActionId'],
  includeWorld = true,
  factionId?: FactionId,
): WorldActionResponse {
  const targetFactionId = factionId ?? resolveDefaultFactionId()
  const mutationLock = tryAcquireWorldMutationLock('queue_ai_agenda_action')
  if (!mutationLock) {
    const failed = buildWorldMutationBusyResponse(includeWorld, targetFactionId)
    appendWorldEvent({
      category: 'world_action',
      action: 'queue_ai_agenda_action',
      success: false,
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
      message: failed.message,
      metadata: {
        factionId: targetFactionId,
        agendaActionId,
        failureCode: failed.failureCode,
        mutationHolder: getActiveWorldMutationHolder(),
        executionStatus: failed.execution?.status,
        activeOrderCount: failed.execution?.activeOrderCount,
        queuedOrderCount: failed.execution?.queuedOrderCount,
        runningOrderCount: failed.execution?.runningOrderCount,
        actionPointsRemaining: failed.execution?.actionPointsRemaining,
        foodRemaining: failed.execution?.foodRemaining,
        activeRequestId: failed.execution?.requestId,
      },
    })
    return failed
  }

  try {
    const result = queueAiAgendaAction(worldState, agendaActionId, targetFactionId)
    if (!result.ok) {
      const execution = buildAiExecutionStateSnapshot(worldState, targetFactionId)
      const failed = buildWorldActionResponse({
        ok: false,
        includeWorld,
        message: result.message,
        failureCode: result.failureCode,
        execution,
      })
      appendWorldEvent({
        category: 'world_action',
        action: 'queue_ai_agenda_action',
        success: false,
        tick: worldState.tick,
        worldVersion: worldState.worldVersion,
        message: result.message,
        metadata: {
          factionId: targetFactionId,
          agendaActionId,
          failureCode: result.failureCode,
          executionStatus: execution?.status,
          activeOrderCount: execution?.activeOrderCount,
          queuedOrderCount: execution?.queuedOrderCount,
          runningOrderCount: execution?.runningOrderCount,
          actionPointsRemaining: execution?.actionPointsRemaining,
          foodRemaining: execution?.foodRemaining,
          activeRequestId: execution?.requestId,
        },
      })
      return failed
    }

    commitWorldState(result.world)
    const execution = buildAiExecutionStateSnapshot(worldState, targetFactionId)
    const response = buildWorldActionResponse({
      ok: true,
      includeWorld,
      message: result.message,
      requestId: result.requestId,
      execution,
    })
    appendWorldEvent({
      category: 'world_action',
      action: 'queue_ai_agenda_action',
      success: true,
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
      message: result.message,
      metadata: {
        factionId: targetFactionId,
        agendaActionId,
        requestId: result.requestId,
        executionStatus: execution?.status,
        activeOrderCount: execution?.activeOrderCount,
        queuedOrderCount: execution?.queuedOrderCount,
        runningOrderCount: execution?.runningOrderCount,
        actionPointsRemaining: execution?.actionPointsRemaining,
        foodRemaining: execution?.foodRemaining,
        basedOnWorldVersion: execution?.basedOnWorldVersion,
        reviewAtTick: execution?.reviewAtTick,
      },
    })
    return response
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
      heroId,
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

export function allianceHelpAction(
  regionId: string,
  includeWorld = true,
  factionId?: FactionId,
): WorldActionResponse {
  const requestId = randomUUID()
  const mutationLock = tryAcquireWorldMutationLock('alliance_help')
  if (!mutationLock) {
    return buildWorldMutationBusyResponse(includeWorld, factionId, requestId)
  }

  try {
    const targetFactionId = factionId ?? resolveDefaultFactionId()
    const result = allianceHelp(worldState, regionId, targetFactionId)
    if (!result.ok) {
      const execution = buildAiExecutionStateSnapshot(worldState, targetFactionId)
      const failed = buildWorldActionResponse({
        ok: false,
        includeWorld,
        message: result.message,
        failureCode: result.failureCode,
        requestId,
        execution,
        relatedId: regionId,
      })

      appendWorldEvent({
        category: 'world_action',
        action: 'alliance_help',
        success: false,
        tick: worldState.tick,
        worldVersion: worldState.worldVersion,
        requestId,
        message: result.message,
        metadata: {
          factionId: targetFactionId,
          regionId,
          failureCode: result.failureCode,
          executionStatus: execution?.status,
          activeOrderCount: execution?.activeOrderCount,
          actionPointsRemaining: execution?.actionPointsRemaining,
          foodRemaining: execution?.foodRemaining,
        },
      })

      return failed
    }

    commitWorldState(result.world)
    const execution = buildAiExecutionStateSnapshot(worldState, targetFactionId)
    const response = buildWorldActionResponse({
      ok: true,
      includeWorld,
      message: result.message,
      requestId,
      execution,
      relatedId: regionId,
    })

    appendWorldEvent({
      category: 'world_action',
      action: 'alliance_help',
      success: true,
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
      requestId,
      message: result.message,
      metadata: {
        factionId: targetFactionId,
        regionId,
        commanderId: result.commanderId,
        supportLevel: result.supportLevel,
        commanderReadiness: result.commanderReadiness,
        executionStatus: execution?.status,
        activeOrderCount: execution?.activeOrderCount,
        actionPointsRemaining: execution?.actionPointsRemaining,
        foodRemaining: execution?.foodRemaining,
      },
    })

    return response
  } finally {
    mutationLock.release()
  }
}

export function rewardClaimAction(
  rewardId: string | undefined,
  includeWorld = true,
  factionId?: FactionId,
): WorldActionResponse {
  const requestId = randomUUID()
  const mutationLock = tryAcquireWorldMutationLock('reward_claim')
  if (!mutationLock) {
    return buildWorldMutationBusyResponse(includeWorld, factionId, requestId)
  }

  try {
    const targetFactionId = factionId ?? resolveDefaultFactionId()
    const result = claimReward(worldState, rewardId, targetFactionId)
    if (!result.ok) {
      const execution = buildAiExecutionStateSnapshot(worldState, targetFactionId)
      const failed = buildWorldActionResponse({
        ok: false,
        includeWorld,
        message: result.message,
        failureCode: result.failureCode,
        requestId,
        execution,
        relatedId: rewardId,
      })

      appendWorldEvent({
        category: 'world_action',
        action: 'reward_claim',
        success: false,
        tick: worldState.tick,
        worldVersion: worldState.worldVersion,
        requestId,
        message: result.message,
        metadata: {
          factionId: targetFactionId,
          rewardId,
          failureCode: result.failureCode,
          executionStatus: execution?.status,
          activeOrderCount: execution?.activeOrderCount,
          actionPointsRemaining: execution?.actionPointsRemaining,
          foodRemaining: execution?.foodRemaining,
        },
      })

      return failed
    }

    commitWorldState(result.world)
    const execution = buildAiExecutionStateSnapshot(worldState, targetFactionId)
    const response = buildWorldActionResponse({
      ok: true,
      includeWorld,
      message: result.message,
      requestId,
      execution,
      relatedId: result.rewardId,
    })

    appendWorldEvent({
      category: 'world_action',
      action: 'reward_claim',
      success: true,
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
      requestId,
      message: result.message,
      metadata: {
        factionId: targetFactionId,
        rewardId: result.rewardId,
        source: result.source,
        foodReward: result.foodReward,
        actionPointReward: result.actionPointReward,
        pendingRewardCount: result.pendingRewardCount,
        executionStatus: execution?.status,
        activeOrderCount: execution?.activeOrderCount,
        actionPointsRemaining: execution?.actionPointsRemaining,
        foodRemaining: execution?.foodRemaining,
      },
    })

    return response
  } finally {
    mutationLock.release()
  }
}

export function transferFactionResourcesToGovernorAction(
  params: {
    sourceFactionId: string
    sourceAiPlayerId: string
    governorPlayerId: string
    resources: {
      food?: number
      wood?: number
      stone?: number
      iron?: number
    }
    reason: string
    approvedBy: string
  },
  includeWorld = true,
): WorldActionResponse {
  const requestId = randomUUID()
  const mutationLock = tryAcquireWorldMutationLock('transfer_faction_resources_to_governor')
  if (!mutationLock) {
    return buildWorldMutationBusyResponse(includeWorld, params.sourceFactionId, requestId)
  }

  try {
    const result = transferFactionResourcesToGovernor(worldState, params)
    if (!result.ok) {
      const execution = buildAiExecutionStateSnapshot(worldState, params.sourceFactionId)
      const failed = buildWorldActionResponse({
        ok: false,
        includeWorld,
        message: result.message,
        failureCode: result.failureCode,
        requestId,
        execution,
        relatedId: params.sourceAiPlayerId,
      })

      appendWorldEvent({
        category: 'world_action',
        action: 'transfer_faction_resources_to_governor',
        success: false,
        tick: worldState.tick,
        worldVersion: worldState.worldVersion,
        requestId,
        message: result.message,
        metadata: {
          sourceFactionId: params.sourceFactionId,
          sourceAiPlayerId: params.sourceAiPlayerId,
          governorPlayerId: params.governorPlayerId,
          failureCode: result.failureCode,
          executionStatus: execution?.status,
          activeOrderCount: execution?.activeOrderCount,
          actionPointsRemaining: execution?.actionPointsRemaining,
          foodRemaining: execution?.foodRemaining,
        },
      })

      return failed
    }

    commitWorldState(result.world)
    const execution = buildAiExecutionStateSnapshot(worldState, params.sourceFactionId)
    const response = buildWorldActionResponse({
      ok: true,
      includeWorld,
      message: result.message,
      requestId,
      execution,
      relatedId: result.transferId,
    })

    appendWorldEvent({
      category: 'world_action',
      action: 'transfer_faction_resources_to_governor',
      success: true,
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
      requestId,
      message: result.message,
      metadata: {
        sourceFactionId: params.sourceFactionId,
        sourceAiPlayerId: result.sourceAiPlayerId,
        governorPlayerId: result.governorPlayerId,
        transferId: result.transferId,
        resources: result.resources,
        executionStatus: execution?.status,
        activeOrderCount: execution?.activeOrderCount,
        actionPointsRemaining: execution?.actionPointsRemaining,
        foodRemaining: execution?.foodRemaining,
      },
    })

    return response
  } finally {
    mutationLock.release()
  }
}

export function recruitProspectHeroAction(
  includeWorld = true,
  factionId?: FactionId,
  count = 1,
  poolId = 'pool_standard',
): WorldActionResponse {
  const mutationLock = tryAcquireWorldMutationLock('recruit_prospect_hero')
  if (!mutationLock) {
    return buildWorldMutationBusyResponse(includeWorld)
  }

  try {
    const targetFactionId = factionId ?? resolveDefaultFactionId()
    const result = recruitProspectHero(worldState, targetFactionId, count, poolId)
    if (!result.ok) {
      const failed = buildWorldActionResponse({
        ok: false,
        includeWorld,
        message: result.message,
      })
      appendWorldEvent({
        category: 'world_action',
        action: 'recruit_prospect_hero',
        success: false,
        tick: worldState.tick,
        worldVersion: worldState.worldVersion,
        message: result.message,
        metadata: { factionId: targetFactionId, count, poolId },
      })
      return failed
    }

    commitWorldState(result.world)
    const succeeded = buildWorldActionResponse({
      ok: true,
      includeWorld,
      message: result.message,
      heroId: result.heroId,
      heroIds: result.heroIds,
      heroNames: result.heroNames,
    })
    appendWorldEvent({
      category: 'world_action',
      action: 'recruit_prospect_hero',
      success: true,
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
      message: result.message,
      metadata: { factionId: targetFactionId, count, poolId, heroIds: result.heroIds },
    })
    return succeeded
  } finally {
    mutationLock.release()
  }
}

export function setRecruitSelectedPoolAction(
  poolId: SetRecruitSelectedPoolActionParams['poolId'],
  includeWorld = true,
  factionId?: FactionId,
): WorldActionResponse {
  const requestId = randomUUID()
  const mutationLock = tryAcquireWorldMutationLock('set_recruit_selected_pool')
  if (!mutationLock) {
    return buildWorldMutationBusyResponse(includeWorld, factionId, requestId)
  }

  try {
    const targetFactionId = factionId ?? resolveDefaultFactionId()
    const result = setRecruitSelectedPool(worldState, poolId, targetFactionId)
    if (!result.ok) {
      const execution = buildAiExecutionStateSnapshot(worldState, targetFactionId)
      const failed = buildWorldActionResponse({
        ok: false,
        includeWorld,
        message: result.message,
        requestId,
        relatedId: poolId,
        execution,
      })
      appendWorldEvent({
        category: 'world_action',
        action: 'set_recruit_selected_pool',
        success: false,
        tick: worldState.tick,
        worldVersion: worldState.worldVersion,
        requestId,
        message: result.message,
        metadata: {
          factionId: targetFactionId,
          poolId,
          executionStatus: execution?.status,
          activeOrderCount: execution?.activeOrderCount,
          actionPointsRemaining: execution?.actionPointsRemaining,
          foodRemaining: execution?.foodRemaining,
        },
      })
      return failed
    }

    commitWorldState(result.world)
    const execution = buildAiExecutionStateSnapshot(worldState, targetFactionId)
    const succeeded = buildWorldActionResponse({
      ok: true,
      includeWorld,
      message: result.message,
      requestId,
      relatedId: result.poolId,
      execution,
    })
    appendWorldEvent({
      category: 'world_action',
      action: 'set_recruit_selected_pool',
      success: true,
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
      requestId,
      message: result.message,
      metadata: {
        factionId: targetFactionId,
        poolId: result.poolId,
        executionStatus: execution?.status,
        activeOrderCount: execution?.activeOrderCount,
        actionPointsRemaining: execution?.actionPointsRemaining,
        foodRemaining: execution?.foodRemaining,
      },
    })
    return succeeded
  } finally {
    mutationLock.release()
  }
}

export function promoteTroopFacilityBuildingAction(
  unitId: string,
  facilityId: string,
  buildingId: string,
  includeWorld = true,
  factionId?: FactionId,
): WorldActionResponse {
  const requestId = randomUUID()
  const mutationLock = tryAcquireWorldMutationLock('promote_troop_facility_building')
  if (!mutationLock) {
    return buildWorldMutationBusyResponse(includeWorld, factionId, requestId)
  }

  try {
    const targetFactionId = factionId ?? resolveDefaultFactionId()
    const result = promoteTroopFacilityBuilding(worldState, unitId, facilityId, buildingId, targetFactionId)
    if (!result.ok) {
      const execution = buildAiExecutionStateSnapshot(worldState, targetFactionId)
      const failed = buildWorldActionResponse({
        ok: false,
        includeWorld,
        message: result.message,
        requestId,
        unitId,
        relatedId: unitId,
        execution,
      })
      appendWorldEvent({
        category: 'world_action',
        action: 'promote_troop_facility_building',
        success: false,
        tick: worldState.tick,
        worldVersion: worldState.worldVersion,
        requestId,
        message: result.message,
        metadata: {
          unitId,
          facilityId,
          buildingId,
          factionId: targetFactionId,
          executionStatus: execution?.status,
          activeOrderCount: execution?.activeOrderCount,
          actionPointsRemaining: execution?.actionPointsRemaining,
          foodRemaining: execution?.foodRemaining,
        },
      })
      return failed
    }

    commitWorldState(result.world)
    const execution = buildAiExecutionStateSnapshot(worldState, targetFactionId)

    const response = buildWorldActionResponse({
      ok: true,
      includeWorld,
      message: result.message,
      requestId,
      unitId: result.unitId,
      relatedId: result.unitId,
      execution,
    })
    appendWorldEvent({
      category: 'world_action',
      action: 'promote_troop_facility_building',
      success: true,
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
      requestId,
      message: result.message,
      metadata: {
        unitId,
        facilityId,
        buildingId,
        nextLevel: result.nextLevel,
        factionId: targetFactionId,
        executionStatus: execution?.status,
        activeOrderCount: execution?.activeOrderCount,
        actionPointsRemaining: execution?.actionPointsRemaining,
        foodRemaining: execution?.foodRemaining,
      },
    })
    return response
  } finally {
    mutationLock.release()
  }
}

export function enqueueAffairAction(
  cityId: string,
  affairId: string,
  includeWorld = true,
  factionId?: FactionId,
): WorldActionResponse {
  const mutationLock = tryAcquireWorldMutationLock('enqueue_affair')
  if (!mutationLock) {
    return buildWorldMutationBusyResponse(includeWorld)
  }

  try {
    const targetFactionId = factionId ?? resolveDefaultFactionId()
    const result = enqueueAffair(worldState, cityId, affairId, targetFactionId)
    if (!result.ok) {
      const failed = buildWorldActionResponse({
        ok: false,
        includeWorld,
        message: result.message,
      })
      appendWorldEvent({
        category: 'world_action',
        action: 'enqueue_affair',
        success: false,
        tick: worldState.tick,
        worldVersion: worldState.worldVersion,
        message: result.message,
        metadata: { cityId, affairId, factionId: targetFactionId },
      })
      return failed
    }

    commitWorldState(result.world)

    const response = buildWorldActionResponse({
      ok: true,
      includeWorld,
      message: result.message,
    })
    appendWorldEvent({
      category: 'world_action',
      action: 'enqueue_affair',
      success: true,
      tick: worldState.tick,
      worldVersion: worldState.worldVersion,
      message: result.message,
      metadata: { cityId, affairId, factionId: targetFactionId },
    })
    return response
  } finally {
    mutationLock.release()
  }
}

function commitWorldState(
  nextWorld: WorldState,
  subphases?: AiRuntimeAdvanceTickSubphaseTiming[],
  previousWorldSnapshot?: WorldState,
) {
  const previousWorld = previousWorldSnapshot ?? worldState
  recordAdvanceTickSubphaseSync(
    subphases,
    'advance_world_state.commit_world_state.sync_authoritative_ai_state',
    () => {
      syncAuthoritativeAiState(nextWorld)
    },
  )
  recordAdvanceTickSubphaseSync(
    subphases,
    'advance_world_state.commit_world_state.sync_ai_quota',
    () => {
      syncAllFactionAiQuota(nextWorld)
    },
  )
  recordAdvanceTickSubphaseSync(
    subphases,
    'advance_world_state.commit_world_state.swap_authoritative_world',
    () => {
      worldState = nextWorld
    },
  )
  recordAdvanceTickSubphaseSync(
    subphases,
    'advance_world_state.commit_world_state.sync_world_map_layout',
    () => {
      syncWorldMapLayout(previousWorld, nextWorld)
    },
  )
  recordAdvanceTickSubphaseSync(
    subphases,
    'advance_world_state.commit_world_state.record_tile_state_diff',
    () => {
      recordTileStateDiff(previousWorld, nextWorld)
    },
  )
  recordAdvanceTickSubphaseSync(
    subphases,
    'advance_world_state.commit_world_state.record_intel_diff',
    () => {
      recordIntelDiff(previousWorld, nextWorld, subphases)
    },
  )
  recordAdvanceTickSubphaseSync(
    subphases,
    'advance_world_state.commit_world_state.schedule_world_persist',
    () => {
      scheduleWorldPersist(() => worldState)
    },
  )
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


function recordIntelDiff(
  previousWorld: WorldState,
  nextWorld: WorldState,
  subphases?: AiRuntimeAdvanceTickSubphaseTiming[],
) {
  if (nextWorld.worldVersion <= previousWorld.worldVersion) {
    intelDiffByVersion.clear()
    return
  }

  const diff: WorldState['intel'] = {}
  const previousIntelByTileId = previousWorld.intel
  const nextIntelByTileId = nextWorld.intel

  recordAdvanceTickSubphaseSync(
    subphases,
    'advance_world_state.commit_world_state.record_intel_diff.scan_next_intel',
    () => {
      const changedEntries: Array<readonly [string, WorldState['intel'][string]]> = []
      recordAdvanceTickSubphaseSync(
        subphases,
        'advance_world_state.commit_world_state.record_intel_diff.scan_next_intel.compare_entries',
        () => {
          recordAdvanceTickSubphaseSync(
            subphases,
            'advance_world_state.commit_world_state.record_intel_diff.scan_next_intel.compare_entries.iterate_next_entries',
            () => {
              for (const tileId in nextIntelByTileId) {
                const nextIntel = nextIntelByTileId[tileId]
                if (!nextIntel) {
                  continue
                }
                const previousIntel = previousIntelByTileId[tileId]
                if (previousIntel === nextIntel) {
                  continue
                }
                const changed =
                  !previousIntel ||
                  previousIntel.level !== nextIntel.level ||
                  previousIntel.lastScoutedTick !== nextIntel.lastScoutedTick ||
                  previousIntel.summary !== nextIntel.summary

                if (changed) {
                  changedEntries.push([tileId, nextIntel] as const)
                }
              }
            },
          )
        },
      )
      recordAdvanceTickSubphaseSync(
        subphases,
        'advance_world_state.commit_world_state.record_intel_diff.scan_next_intel.encode_sparse_updates',
        () => {
          for (const [tileId, nextIntel] of changedEntries) {
            diff[tileId] = optionsToSparseIntel(nextIntel)
          }
        },
      )
    },
  )

  recordAdvanceTickSubphaseSync(
    subphases,
    'advance_world_state.commit_world_state.record_intel_diff.scan_removed_intel',
    () => {
      recordAdvanceTickSubphaseSync(
        subphases,
        'advance_world_state.commit_world_state.record_intel_diff.scan_removed_intel.iterate_previous_entries',
        () => {
          for (const tileId in previousIntelByTileId) {
            if (!(tileId in nextIntelByTileId)) {
              diff[tileId] = {
                level: 'unknown',
              }
            }
          }
        },
      )
    },
  )

  recordAdvanceTickSubphaseSync(
    subphases,
    'advance_world_state.commit_world_state.record_intel_diff.persist_diff',
    () => {
      recordAdvanceTickSubphaseSync(
        subphases,
        'advance_world_state.commit_world_state.record_intel_diff.persist_diff.store_version_entry',
        () => {
          intelDiffByVersion.set(nextWorld.worldVersion, diff)
        },
      )
      recordAdvanceTickSubphaseSync(
        subphases,
        'advance_world_state.commit_world_state.record_intel_diff.persist_diff.trim_history',
        () => {
          trimIntelDiffHistory()
        },
      )
    },
  )
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

  while (intelDiffByVersion.size > MAX_INTEL_DIFF_HISTORY) {
    const oldest = intelDiffByVersion.keys().next().value
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

function loadPersistedSaveSlots() {
  saveSlotsLoaded = true
  try {
    if (!existsSync(SAVE_SLOTS_PERSIST_PATH)) {
      return
    }

    const raw = readFileSync(SAVE_SLOTS_PERSIST_PATH, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    const persistedSlots = extractPersistedSaveSlots(parsed)
    if (persistedSlots.length === 0) {
      return
    }

    for (const slot of persistedSlots) {
      try {
        const normalizedSlotId = normalizeSlotId(slot.record.slotId)
        saveSlots.set(normalizedSlotId, {
          record: {
            ...slot.record,
            slotId: normalizedSlotId,
          },
          world: structuredClone(slot.world),
        })
      } catch {
        // drop malformed slot
      }
    }

    trimSaveSlots()
    saveSlotsRestoredSlotCount = saveSlots.size
    saveSlotsLastRestoreAt = Date.now()
    console.log(`[WorldService] restored ${saveSlots.size} save slots from disk`)
  } catch {
    const quarantinePath = `${SAVE_SLOTS_PERSIST_PATH}.corrupt.${Date.now()}`
    try {
      renameSync(SAVE_SLOTS_PERSIST_PATH, quarantinePath)
      saveSlotsCorruptQuarantineCount += 1
      saveSlotsLastCorruptQuarantineAt = Date.now()
      console.warn(`[WorldService] save-slot persistence parse failed; quarantined -> ${quarantinePath}`)
    } catch {
      console.warn('[WorldService] save-slot persistence parse failed; quarantine skipped')
    }
  }
}

function extractPersistedSaveSlots(raw: unknown): SaveSlotState[] {
  if (Array.isArray(raw)) {
    return raw.filter(isSaveSlotStateLike)
  }

  if (typeof raw !== 'object' || raw === null) {
    return []
  }

  const payload = raw as Partial<PersistedSaveSlotsPayload>
  if (!Array.isArray(payload.slots)) {
    return []
  }

  return payload.slots.filter(isSaveSlotStateLike)
}

function isSaveSlotStateLike(value: unknown): value is SaveSlotState {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const record = (value as { record?: unknown }).record
  const world = (value as { world?: unknown }).world
  if (typeof record !== 'object' || record === null || typeof world !== 'object' || world === null) {
    return false
  }

  const slotId = (record as { slotId?: unknown }).slotId
  const tick = (record as { tick?: unknown }).tick
  const worldTick = (world as { tick?: unknown }).tick
  return typeof slotId === 'string' && typeof tick === 'number' && typeof worldTick === 'number'
}

function isFsErrorCode(error: unknown, code: string) {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code
}

function listSaveSlotsArchiveFiles() {
  if (!existsSync(SAVE_SLOTS_ARCHIVE_DIR)) {
    return [] as SaveSlotsArchiveFile[]
  }

  const entries = readdirSync(SAVE_SLOTS_ARCHIVE_DIR, { withFileTypes: true })
  const files: SaveSlotsArchiveFile[] = []
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue
    }

    if (!entry.name.startsWith(`${SAVE_SLOTS_ARCHIVE_BASENAME}.`) || !entry.name.endsWith('.json.gz')) {
      continue
    }

    const archivePath = join(SAVE_SLOTS_ARCHIVE_DIR, entry.name)
    try {
      const stats = statSync(archivePath)
      files.push({ path: archivePath, mtimeMs: stats.mtimeMs, sizeBytes: stats.size })
    } catch {
      // ignore stat failure for partially-created archive file
    }
  }

  files.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return files
}

function refreshSaveSlotsArchiveFileCount() {
  try {
    saveSlotsArchiveFileCount = listSaveSlotsArchiveFiles().length
  } catch {
    saveSlotsArchiveFileCount = 0
  }
}

function pruneSaveSlotsArchiveFiles() {
  const files = listSaveSlotsArchiveFiles()
  if (files.length <= SAVE_SLOTS_ARCHIVE_MAX_FILES) {
    saveSlotsArchiveFileCount = files.length
    return
  }

  for (const item of files.slice(SAVE_SLOTS_ARCHIVE_MAX_FILES)) {
    try {
      unlinkSync(item.path)
    } catch {
      // ignore cleanup failure, surfaced by archiveFileCount drift on next health snapshot
    }
  }

  refreshSaveSlotsArchiveFileCount()
}

async function archiveSaveSlotsPersistFileIfNeeded(fileSizeBytes: number) {
  if (!SAVE_SLOTS_ARCHIVE_ON_SOFT_LIMIT || fileSizeBytes < SAVE_SLOTS_SOFT_LIMIT_BYTES) {
    return
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const archivePath = join(SAVE_SLOTS_ARCHIVE_DIR, `${SAVE_SLOTS_ARCHIVE_BASENAME}.${stamp}.json.gz`)

  try {
    mkdirSync(SAVE_SLOTS_ARCHIVE_DIR, { recursive: true })
    await pipeline(createReadStream(SAVE_SLOTS_PERSIST_PATH), createGzip({ level: 6 }), createWriteStream(archivePath))
    saveSlotsArchiveSuccessCount += 1
    saveSlotsLastArchiveAt = Date.now()
    saveSlotsLastArchivePath = archivePath
    pruneSaveSlotsArchiveFiles()
  } catch (error) {
    saveSlotsArchiveFailureCount += 1
    saveSlotsLastArchiveErrorAt = Date.now()
    console.warn(
      '[WorldService] save-slot archive write failed:',
      error instanceof Error ? error.message : error,
    )
  } finally {
    refreshSaveSlotsArchiveFileCount()
  }
}

function tryAcquireSaveSlotsPersistLock() {
  mkdirSync(dirname(SAVE_SLOTS_LOCK_PATH), { recursive: true })

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const lockToken = `${process.pid}:${Date.now()}:${randomUUID()}`
      const fd = openSync(SAVE_SLOTS_LOCK_PATH, 'wx')
      writeFileSync(fd, lockToken, 'utf8')
      closeSync(fd)
      return lockToken
    } catch (error) {
      if (!isFsErrorCode(error, 'EEXIST')) {
        saveSlotsPersistLockFailureCount += 1
        console.warn(
          '[WorldService] save-slot lock acquire failed:',
          error instanceof Error ? error.message : error,
        )
        return null
      }

      const now = Date.now()
      let lockAgeMs = 0
      try {
        const stats = statSync(SAVE_SLOTS_LOCK_PATH)
        lockAgeMs = Math.max(0, now - stats.mtimeMs)
      } catch (statError) {
        if (isFsErrorCode(statError, 'ENOENT')) {
          continue
        }
        saveSlotsPersistLockFailureCount += 1
        console.warn(
          '[WorldService] save-slot lock stat failed:',
          statError instanceof Error ? statError.message : statError,
        )
        return null
      }

      if (lockAgeMs < SAVE_SLOTS_LOCK_STALE_MS) {
        saveSlotsPersistLockContentionCount += 1
        return null
      }

      const stalePath = `${SAVE_SLOTS_LOCK_PATH}.stale.${now}`
      try {
        renameSync(SAVE_SLOTS_LOCK_PATH, stalePath)
        saveSlotsPersistLockStealCount += 1
      } catch (renameError) {
        if (isFsErrorCode(renameError, 'ENOENT')) {
          continue
        }
        saveSlotsPersistLockFailureCount += 1
        console.warn(
          '[WorldService] save-slot stale lock quarantine failed:',
          renameError instanceof Error ? renameError.message : renameError,
        )
        return null
      }
    }
  }

  saveSlotsPersistLockContentionCount += 1
  return null
}

function releaseSaveSlotsPersistLock(lockToken: string | null) {
  if (!lockToken) {
    return
  }

  try {
    if (!existsSync(SAVE_SLOTS_LOCK_PATH)) {
      return
    }

    const currentToken = readFileSync(SAVE_SLOTS_LOCK_PATH, 'utf8').trim()
    if (currentToken !== lockToken) {
      return
    }
  } catch (error) {
    if (!isFsErrorCode(error, 'ENOENT')) {
      saveSlotsPersistLockFailureCount += 1
      console.warn(
        '[WorldService] save-slot lock verify failed:',
        error instanceof Error ? error.message : error,
      )
    }
    return
  }

  try {
    unlinkSync(SAVE_SLOTS_LOCK_PATH)
  } catch (error) {
    if (!isFsErrorCode(error, 'ENOENT')) {
      saveSlotsPersistLockFailureCount += 1
      console.warn(
        '[WorldService] save-slot lock release failed:',
        error instanceof Error ? error.message : error,
      )
    }
  }
}

function scheduleSaveSlotsPersist() {
  saveSlotsPersistDirty = true
  if (saveSlotsPersistTimer || saveSlotsPersistInFlight) {
    return
  }

  saveSlotsPersistTimer = setTimeout(() => {
    saveSlotsPersistTimer = null
    void persistSaveSlotsNow()
  }, SAVE_SLOTS_PERSIST_DEBOUNCE_MS)
}

function buildSaveSlotsPersistPayload(): PersistedSaveSlotsPayload {
  const slots = Array.from(saveSlots.values()).sort((a, b) =>
    a.record.savedAt < b.record.savedAt ? 1 : a.record.savedAt > b.record.savedAt ? -1 : 0,
  )

  return {
    version: SAVE_SLOTS_PERSIST_VERSION,
    savedAt: Date.now(),
    slots: structuredClone(slots),
  }
}

async function persistSaveSlotsNow() {
  if (!saveSlotsPersistDirty || saveSlotsPersistInFlight) {
    return
  }

  saveSlotsPersistDirty = false
  saveSlotsPersistInFlight = true
  const payload = buildSaveSlotsPersistPayload()
  const serializedPayload = JSON.stringify(payload, null, 2)
  const dir = dirname(SAVE_SLOTS_PERSIST_PATH)
  const tempPath = `${SAVE_SLOTS_PERSIST_PATH}.tmp`
  const lockToken = tryAcquireSaveSlotsPersistLock()

  try {
    if (!lockToken) {
      saveSlotsPersistDirty = true
      return
    }

    mkdirSync(dir, { recursive: true })
    await writeFile(tempPath, serializedPayload, 'utf8')
    renameSync(tempPath, SAVE_SLOTS_PERSIST_PATH)
    saveSlotsPersistSuccessCount += 1
    saveSlotsLastPersistAt = Date.now()
    await archiveSaveSlotsPersistFileIfNeeded(Buffer.byteLength(serializedPayload, 'utf8'))
  } catch (error) {
    saveSlotsPersistDirty = true
    saveSlotsPersistFailureCount += 1
    saveSlotsLastPersistErrorAt = Date.now()
    try {
      if (existsSync(tempPath)) {
        renameSync(tempPath, `${tempPath}.failed.${Date.now()}`)
      }
    } catch {
      // ignore temp cleanup failures
    }
    console.warn(
      '[WorldService] save-slot persistence write failed:',
      error instanceof Error ? error.message : error,
    )
  } finally {
    releaseSaveSlotsPersistLock(lockToken)
    saveSlotsPersistInFlight = false
    if (saveSlotsPersistDirty && !saveSlotsPersistTimer) {
      saveSlotsPersistTimer = setTimeout(() => {
        saveSlotsPersistTimer = null
        void persistSaveSlotsNow()
      }, SAVE_SLOTS_PERSIST_DEBOUNCE_MS)
    }
  }
}

export async function flushSaveSlotsPersist() {
  if (saveSlotsPersistTimer) {
    clearTimeout(saveSlotsPersistTimer)
    saveSlotsPersistTimer = null
  }

  if (saveSlotsPersistDirty && !saveSlotsPersistInFlight) {
    await persistSaveSlotsNow()
  }

  while (saveSlotsPersistInFlight) {
    await new Promise((resolve) => setTimeout(resolve, 20))
  }

  if (saveSlotsPersistDirty) {
    await persistSaveSlotsNow()
    while (saveSlotsPersistInFlight) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
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
