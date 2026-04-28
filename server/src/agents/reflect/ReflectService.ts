import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import type {
  AllianceActionSummary,
  BattleOutcomeRecord,
  NarrativeEvent,
  Report,
  WorldState,
} from '../../../../shared/contracts/game'
import { getMemoryProvider } from '../memory/MemoryStore'
import {
  applyGeneralReflectFeedback,
  getOrCreateGeneralProfiles,
  recordGeneralShortTermMemory,
  type GeneralReflectOutcome,
} from '../general/GeneralProfileStore'
import { addTacticalSkill, buildSituationTags } from '../tools/TacticalSkillLibrary'
import { broadcastGeneralMessage } from '../../ws/GameWebSocket'
import { buildReflectMemoryMetadata } from './reflectMemoryMeta'

type TileOwner = WorldState['map']['tiles'][number]['owner']

type ReflectDraft = {
  event: NarrativeEvent
  source: 'battle' | 'report' | 'alliance'
  sourceId: string
  regionId?: string
  tileId?: string
  unitId?: string
  factionId?: string
  battleOutcome?: BattleOutcomeRecord['outcome']
}

type UnitDelta = {
  strengthDelta: number
  supplyDelta: number
  tileChanged: boolean
}

type OrderOutcome = {
  completed: number
  failed: number
}

type SearchEntry<T> = {
  item: T
  idLower: string
  nameLower: string
  idLength: number
  nameLength: number
  idLeadChar: string
  nameLeadChar: string
}

type PreparedReportDraft = {
  report: Report
  combined: string
  combinedLength: number
  combinedCharIndex: Set<string>
  unit?: WorldState['units'][number]
  tile?: WorldState['map']['tiles'][number]
}

type ReflectContext = {
  tick: number
  after: WorldState
  battles: BattleOutcomeRecord[]
  reports: Report[]
  allianceActions: AllianceActionSummary[]
  ownerChanges: Map<string, { before: TileOwner; after: TileOwner }>
  unitDeltas: Map<string, UnitDelta>
  orderOutcomes: Map<string, OrderOutcome>
  tileToRegion: Map<string, string>
  unitSearchEntries: Array<SearchEntry<WorldState['units'][number]>>
  tileSearchEntries: Array<SearchEntry<WorldState['map']['tiles'][number]>>
}

export type ReflectSubphaseTiming = {
  subphase: string
  durationMs: number
}

export type ReflectPerformanceSummary = {
  subphases: ReflectSubphaseTiming[]
}

export type ReflectResult = {
  events: NarrativeEvent[]
  memoryWrites: number
  memoryWriteFailures: number
  profileUpdates: number
  causalLinks: number
  consequenceLinks: number
  performance: ReflectPerformanceSummary
}

async function measureReflectSubphase<T>(
  subphases: ReflectSubphaseTiming[],
  subphase: string,
  work: () => Promise<T> | T,
): Promise<T> {
  const startedAtMs = performance.now()
  try {
    return await work()
  } finally {
    subphases.push({
      subphase,
      durationMs: Number((performance.now() - startedAtMs).toFixed(2)),
    })
  }
}

function measureSyncReflectSubphase<T>(
  subphases: ReflectSubphaseTiming[] | undefined,
  subphase: string,
  work: () => T,
): T {
  const startedAtMs = performance.now()
  try {
    return work()
  } finally {
    subphases?.push({
      subphase,
      durationMs: Number((performance.now() - startedAtMs).toFixed(2)),
    })
  }
}

export async function reflectWorldTick(params: {
  before: WorldState
  after: WorldState
  commanderId: string
}): Promise<ReflectResult> {
  const subphases: ReflectSubphaseTiming[] = []
  let context!: ReflectContext
  let drafts!: ReflectDraft[]
  await measureReflectSubphase(subphases, 'reflect_world_tick.collect_context', async () => {
    await measureReflectSubphase(subphases, 'reflect_world_tick.collect_context.build_context', () => {
      context = buildReflectContext(params.before, params.after, subphases)
    })
    await measureReflectSubphase(subphases, 'reflect_world_tick.collect_context.build_drafts', () => {
      drafts = buildNarrativeDrafts(context, subphases)
    })
    await measureReflectSubphase(subphases, 'reflect_world_tick.collect_context.finalize_drafts', () => {
      finalizeNarrativeDrafts(drafts, context)
    })
  })

  let memory!: Awaited<ReturnType<typeof getMemoryProvider>>
  let generals!: ReturnType<typeof getOrCreateGeneralProfiles>
  let generalIdSet!: Set<string>
  let generalByUnitId!: Map<string, string>
  await measureReflectSubphase(subphases, 'reflect_world_tick.prepare_memory_and_generals', async () => {
    memory = await getMemoryProvider()
    generals = getOrCreateGeneralProfiles(params.after)
    generalIdSet = new Set(generals.map((item) => item.id))
    generalByUnitId = new Map(
      generals.flatMap((item) =>
        typeof item.unitId === 'string' && item.unitId.length > 0
          ? [[item.unitId, item.id] as const]
          : [],
      ),
    )
  })

  let memoryWrites = 0
  let memoryWriteFailures = 0
  let profileUpdates = 0
  const touchedGenerals = new Set<string>()

  await measureReflectSubphase(subphases, 'reflect_world_tick.write_memory_and_feedback', async () => {
    for (const draft of drafts) {
      const entry = formatMemoryEntry(draft.event)
      const sharedMeta = buildReflectMemoryMetadata({
        source: draft.source,
        event: draft.event,
      })

      // P1-5: 收集所有 memory write promise 并行执行
      const writePromises: Array<Promise<{ written: boolean; generalId?: string }>> = []

      // Commander 写入
      writePromises.push(
        writeMemory(memory, params.commanderId, entry, sharedMeta)
          .then(written => ({ written, generalId: undefined }))
      )

      // 将领写入
      const eventGeneralIds = resolveGeneralActorIds(draft.event.actors, generalIdSet, generalByUnitId)
      for (const generalId of eventGeneralIds) {
        writePromises.push(
          writeMemory(memory, generalId, entry, sharedMeta)
            .then(written => ({ written, generalId }))
        )
      }

      // 并行等待所有写入完成
      const results = await Promise.allSettled(writePromises)
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.written) {
          memoryWrites += 1
          if (result.value.generalId) {
            recordGeneralShortTermMemory(result.value.generalId, entry)
          }
        } else {
          memoryWriteFailures += 1
        }
      }

      // profile 更新保持同步（依赖 GENERAL_STORE 的一致性）
      for (const generalId of eventGeneralIds) {
        const outcome = deriveGeneralOutcome(draft, context, generalId)
        if (
          applyGeneralReflectFeedback({
            profileId: generalId,
            tick: draft.event.tick,
            summary: draft.event.summary,
            significance: draft.event.significance,
            outcome,
            battleOutcome: draft.battleOutcome,
            grievance: outcome === 'failure' ? buildGrievance(draft.event.summary, draft.event.tick) : undefined,
          })
        ) {
          profileUpdates += 1
          touchedGenerals.add(generalId)
        }
      }
    }
  })

  await measureReflectSubphase(subphases, 'reflect_world_tick.apply_passive_general_feedback', async () => {
    for (const general of generals) {
      const outcome = context.orderOutcomes.get(general.unitId)
      if (!outcome || touchedGenerals.has(general.id)) {
        continue
      }

      if (outcome.completed === 0 && outcome.failed === 0) {
        continue
      }

      const result: GeneralReflectOutcome = outcome.failed > 0 && outcome.completed === 0 ? 'failure' : 'success'
      const summary =
        result === 'failure'
          ? `tick ${context.tick}: order resolution degraded (failed ${outcome.failed})`
          : `tick ${context.tick}: order resolution acknowledged (completed ${outcome.completed})`

      if (
        applyGeneralReflectFeedback({
          profileId: general.id,
          tick: context.tick,
          summary,
          significance: 'minor',
          outcome: result,
          grievance: result === 'failure' ? summary : undefined,
        })
      ) {
        profileUpdates += 1
      }
    }
  })

  const events = drafts.map((item) => item.event)

  await measureReflectSubphase(subphases, 'reflect_world_tick.post_tick_side_effects', () => {
    // Voyager 模式：把本 tick 中有意义的事件写进战术技能库
    recordTickSkills(context, events, params.after)

    // 将领情绪告警：grievance 积累超阈值时主动向玩家推送"将领请奏"
    maybePushGrievanceAlerts(generals, context.tick)
  })

  return {
    events,
    memoryWrites,
    memoryWriteFailures,
    profileUpdates,
    causalLinks: events.reduce((sum, event) => sum + event.causalChain.length, 0),
    consequenceLinks: events.reduce((sum, event) => sum + event.consequences.length, 0),
    performance: {
      subphases,
    },
  }
}

function buildReflectContext(
  before: WorldState,
  after: WorldState,
  subphases?: ReflectSubphaseTiming[],
): ReflectContext {
  const tick = after.tick
  const { battles, reports, allianceActions } = measureSyncReflectSubphase(
    subphases,
    'reflect_world_tick.collect_context.select_tick_artifacts',
    () => {
      const battleRecords: BattleOutcomeRecord[] = []
      const reportRecords: Report[] = []
      const allianceRecords: AllianceActionSummary[] = []
      measureSyncReflectSubphase(
        subphases,
        'reflect_world_tick.collect_context.select_tick_artifacts.scan_battle_records',
        () => {
          for (const item of after.feedback.battleRecords) {
            if (item.tick === tick) {
              battleRecords.push(item)
            }
          }
        },
      )
      measureSyncReflectSubphase(
        subphases,
        'reflect_world_tick.collect_context.select_tick_artifacts.scan_reports',
        () => {
          for (const item of after.reports) {
            if (item.tick === tick) {
              reportRecords.push(item)
            }
          }
        },
      )
      measureSyncReflectSubphase(
        subphases,
        'reflect_world_tick.collect_context.select_tick_artifacts.scan_alliance_actions',
        () => {
          for (const item of after.feedback.allianceActions) {
            if (item.tick === tick) {
              allianceRecords.push(item)
            }
          }
        },
      )
      return {
        battles: battleRecords,
        reports: reportRecords,
        allianceActions: allianceRecords,
      }
    },
  )

  const ownerChanges = measureSyncReflectSubphase(
    subphases,
    'reflect_world_tick.collect_context.collect_owner_changes',
    () => collectOwnerChanges(before, after, subphases),
  )
  const unitDeltas = measureSyncReflectSubphase(
    subphases,
    'reflect_world_tick.collect_context.collect_unit_deltas',
    () => collectUnitDeltas(before, after, subphases),
  )
  const orderOutcomes = measureSyncReflectSubphase(
    subphases,
    'reflect_world_tick.collect_context.collect_order_outcomes',
    () => collectOrderOutcomes(after, subphases),
  )
  const tileToRegion = measureSyncReflectSubphase(
    subphases,
    'reflect_world_tick.collect_context.build_tile_to_region_map',
    () => buildTileToRegionMap(after, subphases),
  )
  const { unitSearchEntries, tileSearchEntries } = measureSyncReflectSubphase(
    subphases,
    'reflect_world_tick.collect_context.build_search_indexes',
    () => {
      const unitSearchEntries = measureSyncReflectSubphase(
        subphases,
        'reflect_world_tick.collect_context.build_search_indexes.normalize_unit_entries',
        () =>
          after.units.map((unit) => ({
            item: unit,
            idLower: unit.id.toLowerCase(),
            nameLower: unit.name.toLowerCase(),
            idLength: unit.id.length,
            nameLength: unit.name.length,
            idLeadChar: unit.id.slice(0, 1).toLowerCase(),
            nameLeadChar: unit.name.slice(0, 1).toLowerCase(),
          })),
      )
      const tileSearchEntries = measureSyncReflectSubphase(
        subphases,
        'reflect_world_tick.collect_context.build_search_indexes.normalize_tile_entries',
        () =>
          after.map.tiles.map((tile) => ({
            item: tile,
            idLower: tile.id.toLowerCase(),
            nameLower: tile.name.toLowerCase(),
            idLength: tile.id.length,
            nameLength: tile.name.length,
            idLeadChar: tile.id.slice(0, 1).toLowerCase(),
            nameLeadChar: tile.name.slice(0, 1).toLowerCase(),
          })),
      )
      return {
        unitSearchEntries,
        tileSearchEntries,
      }
    },
  )

  return {
    tick,
    after,
    battles,
    reports,
    allianceActions,
    ownerChanges,
    unitDeltas,
    orderOutcomes,
    tileToRegion,
    unitSearchEntries,
    tileSearchEntries,
  }
}

function buildNarrativeDrafts(context: ReflectContext, subphases?: ReflectSubphaseTiming[]) {
  const drafts: ReflectDraft[] = []

  measureSyncReflectSubphase(
    subphases,
    'reflect_world_tick.collect_context.build_drafts.build_battle_drafts',
    () => {
      for (const battle of context.battles) {
        drafts.push(buildBattleDraft(battle, context))
      }
    },
  )

  measureSyncReflectSubphase(
    subphases,
    'reflect_world_tick.collect_context.build_drafts.build_alliance_drafts',
    () => {
      for (const allianceAction of context.allianceActions) {
        drafts.push(buildAllianceDraft(allianceAction))
      }
    },
  )

  measureSyncReflectSubphase(
    subphases,
    'reflect_world_tick.collect_context.build_drafts.build_report_drafts',
    () => {
      const preparedDrafts = prepareReportDrafts(context, subphases)
      matchPreparedReportDraftUnits(preparedDrafts, context.unitSearchEntries, subphases)
      matchPreparedReportDraftTiles(preparedDrafts, context.tileSearchEntries, subphases)
      appendReportDrafts(drafts, preparedDrafts, context, subphases)
    },
  )

  return drafts
}

function prepareReportDrafts(context: ReflectContext, subphases?: ReflectSubphaseTiming[]) {
  const preparedDrafts: PreparedReportDraft[] = []
  measureSyncReflectSubphase(
    subphases,
    'reflect_world_tick.collect_context.build_drafts.build_report_drafts.prepare_report_text',
    () => {
      preparedDrafts.push(
        ...context.reports.map((report) => {
          const combined = `${report.title} ${report.detail}`.toLowerCase()
          return {
            report,
            combined,
            combinedLength: combined.length,
            combinedCharIndex: buildSearchCharIndex(combined),
          }
        }),
      )
    },
  )
  return preparedDrafts
}

function matchPreparedReportDraftUnits(
  preparedDrafts: PreparedReportDraft[],
  unitSearchEntries: Array<SearchEntry<WorldState['units'][number]>>,
  subphases?: ReflectSubphaseTiming[],
) {
  measureSyncReflectSubphase(
    subphases,
    'reflect_world_tick.collect_context.build_drafts.build_report_drafts.match_units',
    () => {
      for (const preparedDraft of preparedDrafts) {
        preparedDraft.unit = findSearchEntryMatch(
          unitSearchEntries,
          preparedDraft,
          subphases,
          'reflect_world_tick.collect_context.build_drafts.build_report_drafts.match_units',
        )
      }
    },
  )
}

function matchPreparedReportDraftTiles(
  preparedDrafts: PreparedReportDraft[],
  tileSearchEntries: Array<SearchEntry<WorldState['map']['tiles'][number]>>,
  subphases?: ReflectSubphaseTiming[],
) {
  measureSyncReflectSubphase(
    subphases,
    'reflect_world_tick.collect_context.build_drafts.build_report_drafts.match_tiles',
    () => {
      for (const preparedDraft of preparedDrafts) {
        preparedDraft.tile = findSearchEntryMatch(
          tileSearchEntries,
          preparedDraft,
          subphases,
          'reflect_world_tick.collect_context.build_drafts.build_report_drafts.match_tiles',
        )
      }
    },
  )
}

function appendReportDrafts(
  drafts: ReflectDraft[],
  preparedDrafts: PreparedReportDraft[],
  context: ReflectContext,
  subphases?: ReflectSubphaseTiming[],
) {
  measureSyncReflectSubphase(
    subphases,
    'reflect_world_tick.collect_context.build_drafts.build_report_drafts.assemble_report_events',
    () => {
      for (const preparedDraft of preparedDrafts) {
        drafts.push(buildReportDraft(preparedDraft, context))
      }
    },
  )
}

function finalizeNarrativeDrafts(drafts: ReflectDraft[], context: ReflectContext) {
  const battleByRegion = new Map<string, string[]>()
  const battleByTile = new Map<string, string[]>()
  const battleByUnit = new Map<string, string[]>()
  const allianceByRegion = new Map<string, string[]>()

  for (const draft of drafts) {
    if (draft.source === 'battle') {
      addMapList(battleByRegion, draft.regionId, draft.event.id)
      addMapList(battleByTile, draft.tileId, draft.event.id)
      addMapList(battleByUnit, draft.unitId, draft.event.id)
    }

    if (draft.source === 'alliance') {
      addMapList(allianceByRegion, draft.regionId, draft.event.id)
    }
  }

  const majorBattleIds = drafts
    .filter((item) => item.source === 'battle' && item.event.significance !== 'minor')
    .map((item) => item.event.id)

  for (const draft of drafts) {
    const causal: string[] = []

    if (draft.source === 'battle') {
      causal.push(...(allianceByRegion.get(draft.regionId || '') ?? []))
    }

    if (draft.source === 'report') {
      causal.push(...(battleByTile.get(draft.tileId || '') ?? []))
      causal.push(...(battleByUnit.get(draft.unitId || '') ?? []))
      causal.push(...(battleByRegion.get(draft.regionId || '') ?? []))

      if (causal.length === 0) {
        causal.push(...majorBattleIds.slice(0, 2))
      }
    }

    if (draft.source === 'alliance') {
      causal.push(...(battleByRegion.get(draft.regionId || '') ?? []).slice(0, 1))
    }

    draft.event.causalChain = unique(causal.filter((id) => id && id !== draft.event.id)).slice(0, 6)

    const consequences = draft.event.consequences.slice()
    if (draft.unitId) {
      const outcome = context.orderOutcomes.get(draft.unitId)
      if (outcome?.completed) {
        consequences.push(`order_completed:${draft.unitId}:${outcome.completed}`)
      }
      if (outcome?.failed) {
        consequences.push(`order_failed:${draft.unitId}:${outcome.failed}`)
      }
    }

    draft.event.consequences = unique(consequences.filter((item) => item.length > 0)).slice(0, 6)
  }
}

function buildBattleDraft(record: BattleOutcomeRecord, context: ReflectContext): ReflectDraft {
  const outcomeText = record.outcome === 'win' ? '取胜' : '失利'
  const totalLoss = record.attackerLoss + record.defenderLoss
  const ownerShift = context.ownerChanges.get(record.tileId)
  const controlShift = Boolean(ownerShift && ownerShift.after === record.attackerFaction)

  let significance: NarrativeEvent['significance'] = 'minor'
  if (record.outcome === 'loss' || controlShift || totalLoss >= 20) {
    significance = 'major'
  }
  if (controlShift && totalLoss >= 28) {
    significance = 'epic'
  }

  const summary = `${record.attackerUnitId} 于 ${record.tileId} ${outcomeText}，战损 A${record.attackerLoss}/D${record.defenderLoss}，协同 ${record.alliedSupport}。`

  return {
    source: 'battle',
    sourceId: record.id,
    regionId: record.regionId,
    tileId: record.tileId,
    unitId: record.attackerUnitId,
    factionId: record.attackerFaction,
    battleOutcome: record.outcome,
    event: {
      id: randomUUID(),
      tick: record.tick,
      type: 'battle',
      actors: unique([record.attackerUnitId, record.attackerFaction, record.tileId]),
      summary,
      causalChain: [],
      consequences: buildBattleConsequences(record, context),
      significance,
    },
  }
}

function buildAllianceDraft(action: AllianceActionSummary): ReflectDraft {
  const type = inferAllianceType(action)
  const significance = action.severity === 'high' ? 'major' : 'minor'

  return {
    source: 'alliance',
    sourceId: action.id,
    regionId: action.regionId,
    event: {
      id: randomUUID(),
      tick: action.tick,
      type,
      actors: unique(['alliance', action.regionId]),
      summary: `${action.title}: ${action.detail}`,
      causalChain: [],
      consequences:
        action.severity === 'high'
          ? [`coordination_shift:${action.regionId}`]
          : action.severity === 'medium'
            ? [`coordination_adjust:${action.regionId}`]
            : [],
      significance,
    },
  }
}

function buildReportDraft(preparedDraft: PreparedReportDraft, context: ReflectContext): ReflectDraft {
  const { report, combined, tile, unit } = preparedDraft
  const isFailure = /(失利|失守|溩退|失败|fail|loss|collapse)/i.test(combined)
  const type: NarrativeEvent['type'] = isFailure ? 'failure' : 'achievement'

  const tileId = tile?.id
  const regionId = tileId ? context.tileToRegion.get(tileId) : undefined

  return {
    source: 'report',
    sourceId: report.id,
    regionId,
    tileId,
    unitId: unit?.id,
    event: {
      id: randomUUID(),
      tick: report.tick,
      type,
      actors: unique(unit?.id ? [unit.id, 'commander'] : ['commander']),
      summary: `${report.title}: ${report.detail}`,
      causalChain: [],
      consequences: isFailure ? ['command_pressure_raise'] : ['command_alignment_confirmed'],
      significance: isFailure ? 'major' : 'minor',
    },
  }
}

function findSearchEntryMatch<T>(
  entries: Array<SearchEntry<T>>,
  preparedDraft: PreparedReportDraft,
  subphases?: ReflectSubphaseTiming[],
  subphasePrefix?: string,
) {
  const scanEntries = (
    suffix: 'scan_id_entries' | 'scan_name_entries',
    key: 'idLower' | 'nameLower',
    lengthKey: 'idLength' | 'nameLength',
    leadKey: 'idLeadChar' | 'nameLeadChar',
  ) => {
    if (!subphases || !subphasePrefix) {
      for (const entry of entries) {
        if (!canSearchEntryPossiblyMatch(entry, preparedDraft, lengthKey, leadKey)) {
          continue
        }
        if (preparedDraft.combined.includes(entry[key])) {
          return entry.item
        }
      }
      return undefined
    }

    return measureSyncReflectSubphase(subphases, `${subphasePrefix}.${suffix}`, () => {
      for (const entry of entries) {
        if (!canSearchEntryPossiblyMatch(entry, preparedDraft, lengthKey, leadKey)) {
          continue
        }
        if (preparedDraft.combined.includes(entry[key])) {
          return entry.item
        }
      }
      return undefined
    })
  }

  return (
    scanEntries('scan_id_entries', 'idLower', 'idLength', 'idLeadChar') ??
    scanEntries('scan_name_entries', 'nameLower', 'nameLength', 'nameLeadChar')
  )
}

function canSearchEntryPossiblyMatch<T>(
  entry: SearchEntry<T>,
  preparedDraft: PreparedReportDraft,
  lengthKey: 'idLength' | 'nameLength',
  leadKey: 'idLeadChar' | 'nameLeadChar',
) {
  if (entry[lengthKey] === 0 || entry[lengthKey] > preparedDraft.combinedLength) {
    return false
  }

  const leadChar = entry[leadKey]
  if (!leadChar) {
    return true
  }
  return preparedDraft.combinedCharIndex.has(leadChar)
}

function buildSearchCharIndex(value: string) {
  return new Set(value)
}

function collectOwnerChanges(before: WorldState, after: WorldState, subphases?: ReflectSubphaseTiming[]) {
  const beforeByTile = measureSyncReflectSubphase(
    subphases,
    'reflect_world_tick.collect_context.collect_owner_changes.build_before_owner_index',
    () => new Map(before.map.tiles.map((tile) => [tile.id, tile.owner] as const)),
  )
  const result = new Map<string, { before: TileOwner; after: TileOwner }>()

  measureSyncReflectSubphase(
    subphases,
    'reflect_world_tick.collect_context.collect_owner_changes.scan_after_tiles',
    () => {
      for (const tile of after.map.tiles) {
        const previousOwner = beforeByTile.get(tile.id)
        if (previousOwner && previousOwner !== tile.owner) {
          result.set(tile.id, { before: previousOwner, after: tile.owner })
        }
      }
    },
  )

  return result
}

function collectUnitDeltas(before: WorldState, after: WorldState, subphases?: ReflectSubphaseTiming[]) {
  const beforeByUnit = measureSyncReflectSubphase(
    subphases,
    'reflect_world_tick.collect_context.collect_unit_deltas.build_before_unit_index',
    () => new Map(before.units.map((unit) => [unit.id, unit] as const)),
  )
  const result = new Map<string, UnitDelta>()

  measureSyncReflectSubphase(
    subphases,
    'reflect_world_tick.collect_context.collect_unit_deltas.scan_after_units',
    () => {
      for (const unit of after.units) {
        const previous = beforeByUnit.get(unit.id)
        if (!previous) {
          continue
        }

        const strengthDelta = unit.strength - previous.strength
        const supplyDelta = unit.supply - previous.supply
        const tileChanged = unit.tileId !== previous.tileId

        if (strengthDelta !== 0 || supplyDelta !== 0 || tileChanged) {
          result.set(unit.id, {
            strengthDelta,
            supplyDelta,
            tileChanged,
          })
        }
      }
    },
  )

  return result
}

function collectOrderOutcomes(world: WorldState, subphases?: ReflectSubphaseTiming[]) {
  const result = new Map<string, OrderOutcome>()
  const allOrders = measureSyncReflectSubphase(
    subphases,
    'reflect_world_tick.collect_context.collect_order_outcomes.collect_execution_orders',
    () => {
      const orders: NonNullable<WorldState['executions'][string]>['orders'][number][] = []
      measureSyncReflectSubphase(
        subphases,
        'reflect_world_tick.collect_context.collect_order_outcomes.collect_execution_orders.flatten_execution_buckets',
        () => {
          for (const execution of Object.values(world.executions ?? {})) {
            if (!execution?.orders) {
              continue
            }
            orders.push(...execution.orders)
          }
        },
      )
      return orders
    },
  )

  measureSyncReflectSubphase(
    subphases,
    'reflect_world_tick.collect_context.collect_order_outcomes.scan_resolved_orders',
    () => {
      for (const order of allOrders) {
        const resolvedThisTick =
          order.completedTick === world.tick ||
          (order.startedTick === world.tick && (order.status === 'completed' || order.status === 'failed'))

        if (!resolvedThisTick) {
          continue
        }

        if (!order.unitId) continue
        const bucket = result.get(order.unitId) ?? { completed: 0, failed: 0 }
        if (order.status === 'completed') {
          bucket.completed += 1
        } else if (order.status === 'failed') {
          bucket.failed += 1
        }

        result.set(order.unitId, bucket)
      }
    },
  )

  return result
}

function buildTileToRegionMap(world: WorldState, subphases?: ReflectSubphaseTiming[]) {
  const result = new Map<string, string>()

  measureSyncReflectSubphase(
    subphases,
    'reflect_world_tick.collect_context.build_tile_to_region_map.scan_regions',
    () => {
      for (const region of world.map.regions) {
        for (const tileId of region.tileIds) {
          if (!result.has(tileId)) {
            result.set(tileId, region.id)
          }
        }
      }
    },
  )
  return result
}

function buildBattleConsequences(record: BattleOutcomeRecord, context: ReflectContext) {
  const consequences: string[] = []
  const ownerShift = context.ownerChanges.get(record.tileId)
  if (ownerShift) {
    consequences.push(`control_shift:${record.tileId}:${ownerShift.before}->${ownerShift.after}`)
  }

  const unitDelta = context.unitDeltas.get(record.attackerUnitId)
  if (unitDelta && unitDelta.strengthDelta <= -15) {
    consequences.push(`unit_attrition:${record.attackerUnitId}:${Math.abs(unitDelta.strengthDelta)}`)
  }

  if (record.outcome === 'loss') {
    consequences.push(`frontline_pressure_rise:${record.tileId}`)
  }

  if (record.outcome === 'win' && record.alliedSupport >= 2) {
    consequences.push(`alliance_momentum_gain:${record.regionId}`)
  }

  return unique(consequences).slice(0, 4)
}

function resolveGeneralActorIds(
  actors: string[],
  generalIdSet: Set<string>,
  generalByUnitId: Map<string, string>,
) {
  const ids: string[] = []

  for (const actor of actors) {
    if (generalIdSet.has(actor)) {
      ids.push(actor)
      continue
    }

    const matchedByUnit = generalByUnitId.get(actor)
    if (matchedByUnit) {
      ids.push(matchedByUnit)
    }
  }

  return unique(ids)
}

function deriveGeneralOutcome(
  draft: ReflectDraft,
  context: ReflectContext,
  generalId: string,
): GeneralReflectOutcome {
  if (draft.unitId === generalId) {
    const orderOutcome = context.orderOutcomes.get(generalId)
    if (orderOutcome?.failed && !orderOutcome.completed) {
      return 'failure'
    }

    if (orderOutcome?.completed) {
      return draft.event.type === 'failure' ? 'neutral' : 'success'
    }
  }

  if (draft.source === 'battle') {
    return draft.battleOutcome === 'win' ? 'success' : 'failure'
  }

  if (draft.event.type === 'failure') {
    return 'failure'
  }

  if (draft.event.significance === 'major' || draft.event.significance === 'epic') {
    if (draft.event.type === 'achievement' || draft.event.type === 'diplomacy') {
      return 'success'
    }
  }

  return 'neutral'
}

function buildGrievance(summary: string, tick: number) {
  const compact = summary.replace(/\s+/g, ' ').trim()
  return `tick ${tick}: ${truncate(compact, 120)}`
}

/**
 * 将领情绪告警推送
 *
 * 在 Reflect 结束后检查所有将领的委屈积累，超过阈值时主动向玩家推送 WS 消息。
 * 这是"将领是有状态角色"最直观的体现——将领会主动"请奏"、抒发委屈。
 *
 * 触发阈值（任一满足）:
 *   - pendingGrievance.length >= 5：委屈积累到"快忍不住了"
 *   - loyalty < 0.35：忠诚度告急（叛变风险）
 *   - 本 tick 刚升为 Tier 3（大胜晋升）
 */
type GeneralLike = {
  id: string
  name: string
  faction: string
  personality: { loyalty: number }
  relationship: { lordTrust: number; pendingGrievance: string[] }
  history: { battlesWon: number; battlesLost: number }
}

function maybePushGrievanceAlerts(generals: GeneralLike[], tick: number): void {
  for (const general of generals) {
    const { loyalty } = general.personality
    const { lordTrust, pendingGrievance } = general.relationship

    // 忠诚度危机告警
    if (loyalty < 0.35) {
      broadcastGeneralMessage(general.faction, {
        tick,
        generalId: general.id,
        generalName: general.name,
        text: `末将近日心灰意冷，忠诚已至危境（${(loyalty * 100).toFixed(0)}%）。若主公继续不问，末将恐难留守。`,
        trigger: 'loyalty_critical',
        loyaltyLevel: loyalty,
        lordTrust,
      })
      continue
    }

    // 委屈积累过多告警
    if (pendingGrievance.length >= 5) {
      const latestGrievance = pendingGrievance[0] ?? '数次征战未见主公关怀'
      broadcastGeneralMessage(general.faction, {
        tick,
        generalId: general.id,
        generalName: general.name,
        text: `末将有苦难言，积怨已深。最近：${latestGrievance.slice(0, 60)}……恳请主公明察。`,
        trigger: 'grievance',
        loyaltyLevel: loyalty,
        lordTrust,
      })
    }
  }
}

function formatMemoryEntry(event: NarrativeEvent) {
  const causal = event.causalChain.length > 0 ? ` cause=${event.causalChain.slice(0, 2).join('|')}` : ''
  const consequences =
    event.consequences.length > 0 ? ` impact=${event.consequences.slice(0, 2).join('|')}` : ''
  return `[tick ${event.tick}] [${event.type}/${event.significance}] ${event.summary}${causal}${consequences}`
}

async function writeMemory(
  memory: Awaited<ReturnType<typeof getMemoryProvider>>,
  agentId: string,
  entry: string,
  metadata: Record<string, unknown>,
) {
  try {
    await memory.add(agentId, entry, metadata)
    return true
  } catch {
    return false
  }
}

function inferAllianceType(action: AllianceActionSummary): NarrativeEvent['type'] {
  const text = `${action.title} ${action.detail}`.toLowerCase()
  if (/(外交|停战|谈判|diplom|truce|treaty|alliance)/i.test(text)) {
    return 'diplomacy'
  }

  if (/(背叛|betray|sabotage)/i.test(text)) {
    return 'betrayal'
  }

  return 'achievement'
}

function addMapList(map: Map<string, string[]>, key: string | undefined, value: string) {
  if (!key) {
    return
  }

  const bucket = map.get(key) ?? []
  bucket.push(value)
  map.set(key, bucket)
}

function unique(values: string[]) {
  return Array.from(new Set(values))
}

function resolveFallbackFactionId(world: WorldState): string {
  const candidates = Object.keys(world.factions).filter((factionId) => factionId !== 'neutral')
  const pool = candidates.length > 0 ? candidates : Object.keys(world.factions)
  if (pool.length === 0) {
    return 'neutral'
  }

  const scored = pool.map((factionId) => {
    const unitCount = world.units.filter((unit) => unit.faction === factionId).length
    const tileCount = world.map.tiles.filter((tile) => tile.owner === factionId).length
    return { factionId, score: unitCount * 1000 + tileCount }
  })
  scored.sort((left, right) => right.score - left.score || left.factionId.localeCompare(right.factionId))
  return scored[0]?.factionId ?? 'neutral'
}

function truncate(value: string, limit: number) {
  if (value.length <= limit) {
    return value
  }

  return `${value.slice(0, Math.max(0, limit - 1))}?`
}

// ── TacticalSkillLibrary 写入 ──────────────────────────────────────────────────

/**
 * 在每次 Reflect 结束后，把本 tick 中"有意义"的事件提炼成战术技能写入 TacticalSkillLibrary。
 *
 * - major/epic 胜利事件 → outcomeScore = 0.8~1.0
 * - 占领地物/突破 → outcomeScore = 0.6~0.8
 * - 失败/撤退 → outcomeScore = 0.1~0.3（保存失败战术，供 LLM 规避）
 */
function recordTickSkills(
  context: ReflectContext,
  events: NarrativeEvent[],
  world: WorldState,
): void {
  // 只处理 major/epic 事件
  const significant = events.filter((e) => e.significance === 'major' || e.significance === 'epic')
  if (significant.length === 0) return

  // 推断主阵营（仅统计存在于 world.factions 的 actor）
  const factionCounts = new Map<string, number>()
  for (const e of significant) {
    for (const actor of e.actors) {
      if (!world.factions[actor]) {
        continue
      }
      factionCounts.set(actor, (factionCounts.get(actor) ?? 0) + 1)
    }
  }
  const dominantFaction = [...factionCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    ?? resolveFallbackFactionId(world)

  // 计算胜负味道 —— 以战斗胜率为主
  const wins = context.battles.filter((b) => b.outcome === 'win').length
  const losses = context.battles.filter((b) => b.outcome === 'loss').length
  const battleScore = context.battles.length > 0
    ? wins / context.battles.length
    : 0.5

  // 领土变化信号
  const gains = [...context.ownerChanges.values()].filter((c) => c.after === dominantFaction).length
  const lost = [...context.ownerChanges.values()].filter((c) => c.before === dominantFaction).length
  const territoryDelta = gains - lost
  const territoryScore = Math.min(1, Math.max(0, 0.5 + territoryDelta * 0.05))

  const outcomeScore = battleScore * 0.6 + territoryScore * 0.4

  // 找洛阳当前归属
  const luoyangTile = world.map.tiles.find(
    (t) => t.landmarkName?.includes('洛阳'),
  )
  const luoyangOwner = luoyangTile?.owner ?? 'neutral'

  // 推断当前阶段
  const phaseLabel = significant[0]?.summary?.slice(0, 12) ?? `tick_${context.tick}`

  // 识别主战术类型
  const tacticKeywords = significant.map((e) => e.summary).join(' ')
  const prototypeOrders: Array<{ action: string; context: string }> = []

  if (tacticKeywords.includes('突破') || tacticKeywords.includes('攻占')) {
    prototypeOrders.push({ action: 'capture', context: '对敌方弱点发起突破，集中兵力拿下关键地块' })
  }
  if (tacticKeywords.includes('围城') || tacticKeywords.includes('洛阳')) {
    prototypeOrders.push({ action: 'siege', context: '对洛阳或要塞展开围城，持续施压直至倒计时完成' })
  }
  if (tacticKeywords.includes('侦察') || tacticKeywords.includes('情报')) {
    prototypeOrders.push({ action: 'recon', context: '提前侦察敌方动向，确保情报优势再发起攻势' })
  }
  if (tacticKeywords.includes('扩张') || tacticKeywords.includes('占领')) {
    prototypeOrders.push({ action: 'capture', context: '稳步向中立区域扩张，建立连续领土纵深' })
  }
  if (prototypeOrders.length === 0) {
    prototypeOrders.push({ action: 'garrison', context: '稳守既有阵地，等待反击机会' })
  }

  const frontlineRiskTier: 'low' | 'medium' | 'high' =
    losses > wins ? 'high' : wins > 0 ? 'medium' : 'low'

  const tags = buildSituationTags(
    context.tick,
    dominantFaction,
    luoyangOwner,
    frontlineRiskTier,
    phaseLabel,
  )

  addTacticalSkill({
    situationTags: tags,
    tacticSummary: significant.map((e) => e.summary).slice(0, 2).join('；'),
    prototypeOrders,
    outcomeScore,
    tickRecorded: context.tick,
    factionId: dominantFaction,
  })
}
