import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  advanceTickAction,
  clearPlanExecutionAction,
  deployReserveHeroAction,
  enqueueAffairAction,
  getNarrativeEvents,
  getWorldEvents,
  getWorldStateReadonly,
  loadWorldSlot,
  moveUnitAction,
  previewCourtSessionAction,
  previewNationalAgendaAction,
  promoteCityBuildingAction,
  primeReplayFixtureSlot,
  queuePlanExecutionAction,
  queueTacticalOverrideAction,
  saveWorldSlot,
  upgradeCityTechAction,
} from '../application/world/WorldService'

type GateCheck = {
  name: string
  passed: boolean
  details?: Record<string, unknown>
}

type GateReport = {
  runId: string
  generatedAt: string
  requestId: string
  beforeTick: number
  afterTick: number
  checks: GateCheck[]
  passed: boolean
  templateReplay?: {
    runId: string
    passed: boolean
    latestPath: string
    stampedPath: string
  }
}

type TemplateReplayStep = {
  templateId: string
  eventAction: string
  required: boolean
  resultOk: boolean
  passed: boolean
  details?: Record<string, unknown>
}

type TemplateReplayReport = {
  runId: string
  generatedAt: string
  scenario: 'baseline_v1'
  factionId: string
  fixture: {
    fixtureSlotId: string
    backupSlotId: string
    primed: boolean
    loaded: boolean
    restored: boolean
  }
  checks: GateCheck[]
  steps: TemplateReplayStep[]
  events: {
    beforeCount: number
    afterCount: number
    newCount: number
    newActions: string[]
    missingExpectedActions: string[]
  }
  narratives: {
    beforeCount: number
    afterCount: number
    newCount: number
    expectedFromAdvanceTickMetadata: number
  }
  passed: boolean
}

function createRunContext() {
  const runId = `ai_mainline_${new Date().toISOString().replace(/[:.]/g, '-')}`
  const runDir = join(process.cwd(), 'tmp', 'gates', 'ai-mainline-stability')
  mkdirSync(runDir, { recursive: true })
  return { runId, runDir }
}

function resolvePrimaryFactionId(): string | null {
  const world = getWorldStateReadonly()
  const factionIds = Object.keys(world.factions).filter((id) => id !== 'neutral')
  if (factionIds.length === 0) {
    return null
  }
  return factionIds[0] ?? null
}

function resolveFirstFactionUnit(factionId: string) {
  const world = getWorldStateReadonly()
  return world.units.find((item) => item.faction === factionId) ?? null
}

function resolveMoveTargetTileId(currentTileId: string): string | null {
  const world = getWorldStateReadonly()
  const map = world.map
  const connections = map.connections?.[currentTileId] ?? []
  if (!Array.isArray(connections)) {
    return null
  }

  const occupiedTiles = new Set(world.units.map((item) => item.tileId))
  for (const tileId of connections) {
    if (tileId && tileId !== currentTileId && !occupiedTiles.has(tileId)) {
      return tileId
    }
  }

  for (const tileId of connections) {
    if (tileId && tileId !== currentTileId) {
      return tileId
    }
  }

  return null
}

function resolveOwnedCityTileId(factionId: string): string | null {
  const world = getWorldStateReadonly()
  const matchingCluster = world.map.overlays.cityClusters.find((cluster) => cluster.owner === factionId)
  if (matchingCluster) {
    return matchingCluster.cityHallTileId
  }
  for (const tile of world.map.tiles) {
    if (tile.owner !== factionId) {
      continue
    }
    if (typeof tile.cityLevel === 'number') {
      return tile.id
    }
  }
  return null
}

function resolveReserveHeroTarget(factionId: string): { heroId: string; tileId: string } | null {
  const world = getWorldStateReadonly()
  const faction = world.factions[factionId]
  if (!faction) {
    return null
  }

  const heroId = faction.heroCommand.reserveHeroIds[0]
  const tileId = faction.heroCommand.homeTileId || resolveOwnedCityTileId(factionId)
  if (!heroId || !tileId) {
    return null
  }
  return { heroId, tileId }
}

function collectIds(items: Array<{ id?: string }>): Set<string> {
  const output = new Set<string>()
  for (const item of items) {
    if (typeof item.id === 'string' && item.id.length > 0) {
      output.add(item.id)
    }
  }
  return output
}

function collectNewItems<T extends { id?: string }>(afterItems: T[], beforeIds: Set<string>): T[] {
  if (beforeIds.size === 0) {
    return afterItems
  }

  return afterItems.filter((item) => {
    if (typeof item.id !== 'string' || item.id.length === 0) {
      return true
    }
    return !beforeIds.has(item.id)
  })
}

function persistTemplateReplayReport(report: TemplateReplayReport) {
  const runDir = join(process.cwd(), 'tmp', 'gates', 'ai-ops-template-replay')
  mkdirSync(runDir, { recursive: true })
  const latestPath = join(process.cwd(), 'tmp', 'gates', 'ai_ops_template_replay_latest.json')
  const stampedPath = join(runDir, `${report.runId}.json`)
  const payload = JSON.stringify(report, null, 2)
  writeFileSync(latestPath, payload, 'utf8')
  writeFileSync(stampedPath, payload, 'utf8')
  return { latestPath, stampedPath }
}

async function runTemplateReplayScenario(factionId: string): Promise<TemplateReplayReport> {
  const runId = `ai_ops_template_replay_${new Date().toISOString().replace(/[:.]/g, '-')}`
  const fixtureSlotId = 'ai_template_replay_fixture_v1'
  const backupSlotId = 'ai_template_replay_backup_v1'
  const checks: GateCheck[] = []
  const steps: TemplateReplayStep[] = []

  const backupRecord = saveWorldSlot(backupSlotId, 'AI Template Replay Runtime Backup')
  checks.push({
    name: 'fixture_backup_saved',
    passed: true,
    details: {
      backupSlotId,
      tick: backupRecord.tick,
      worldVersion: backupRecord.worldVersion,
    },
  })

  const fixtureRecord = primeReplayFixtureSlot(fixtureSlotId, {
    label: 'AI Template Replay Fixture v1',
    source: 'initial_world_v1',
  })
  checks.push({
    name: 'fixture_slot_primed',
    passed: true,
    details: {
      fixtureSlotId: fixtureRecord.slotId,
      tick: fixtureRecord.tick,
      worldVersion: fixtureRecord.worldVersion,
    },
  })

  const fixtureLoadResult = loadWorldSlot(fixtureSlotId)
  checks.push({
    name: 'fixture_slot_loaded',
    passed: fixtureLoadResult.ok,
    details: {
      fixtureSlotId,
      ok: fixtureLoadResult.ok,
      message: fixtureLoadResult.message ?? null,
      tick: fixtureLoadResult.tick,
      worldVersion: fixtureLoadResult.worldVersion,
    },
  })

  const beforeEvents = getWorldEvents(240).items
  const beforeNarratives = getNarrativeEvents(240).items
  const beforeEventIds = collectIds(beforeEvents)
  const beforeNarrativeIds = collectIds(beforeNarratives)

  const unit = resolveFirstFactionUnit(factionId)
  const targetTileId = unit ? resolveMoveTargetTileId(unit.tileId) : null
  const cityTileId = resolveOwnedCityTileId(factionId)
  const reserveHeroTarget = resolveReserveHeroTarget(factionId)
  const researchTechId = 'logistics'
  const buildingGroupId = 'market'
  const buildingId = 'market_plaza'
  const affairId = 'queue_tax_upgrade'
  checks.push({
    name: 'resolve_template_targets',
    passed: Boolean(unit && targetTileId && cityTileId),
    details: {
      factionId,
      unitId: unit?.id ?? null,
      unitTileId: unit?.tileId ?? null,
      targetTileId: targetTileId ?? null,
      cityTileId: cityTileId ?? null,
      reserveHeroId: reserveHeroTarget?.heroId ?? null,
      reserveTileId: reserveHeroTarget?.tileId ?? null,
      researchTechId,
      buildingGroupId,
      buildingId,
      affairId,
    },
  })

  if (unit && targetTileId && cityTileId) {
    const templateSteps: Array<{
      templateId: string
      eventAction: string
      required: boolean
      run: () => Promise<{ ok: boolean; message?: string; tick?: number; worldVersion?: number }>
    }> = [
      {
        templateId: 'clear_plan_execution',
        eventAction: 'clear_plan_execution',
        required: true,
        run: async () => clearPlanExecutionAction(false, factionId),
      },
      {
        templateId: 'preview_national_agenda',
        eventAction: 'preview_national_agenda',
        required: true,
        run: async () => previewNationalAgendaAction({ maxOptions: 5 }, false),
      },
      {
        templateId: 'preview_court_session',
        eventAction: 'preview_court_session',
        required: true,
        run: async () => previewCourtSessionAction({ maxProposals: 5, maxOptions: 5 }, false),
      },
      {
        templateId: 'move_first_unit',
        eventAction: 'move_unit',
        required: true,
        run: async () => moveUnitAction(unit.id, targetTileId, false, factionId),
      },
      {
        templateId: 'enqueue_first_city_affair',
        eventAction: 'enqueue_affair',
        required: true,
        run: async () => enqueueAffairAction(cityTileId, affairId, false, factionId),
      },
      {
        templateId: 'advance_tick_recharge_before_building',
        eventAction: 'advance_tick',
        required: true,
        run: async () => advanceTickAction(false),
      },
      {
        templateId: 'upgrade_first_city_building',
        eventAction: 'promote_city_building',
        required: true,
        run: async () => promoteCityBuildingAction(cityTileId, buildingGroupId, buildingId, false, factionId),
      },
      {
        templateId: 'advance_tick_recharge',
        eventAction: 'advance_tick',
        required: true,
        run: async () => advanceTickAction(false),
      },
      {
        templateId: 'upgrade_first_city_tech',
        eventAction: 'upgrade_city_tech',
        required: true,
        run: async () => upgradeCityTechAction(cityTileId, researchTechId, false, factionId),
      },
      {
        templateId: 'advance_tick_recharge_deploy',
        eventAction: 'advance_tick',
        required: true,
        run: async () => advanceTickAction(false),
      },
      {
        templateId: 'deploy_first_reserve_hero',
        eventAction: 'deploy_reserve_hero',
        required: false,
        run: async () => {
          const target = resolveReserveHeroTarget(factionId)
          if (!target) {
            return {
              ok: false,
              message: `no reserve hero target resolved for faction ${factionId}`,
            }
          }
          return deployReserveHeroAction(factionId, target.heroId, target.tileId, false)
        },
      },
      {
        templateId: 'tactical_override_first_unit',
        eventAction: 'queue_tactical_override',
        required: true,
        run: async () =>
          queueTacticalOverrideAction(
            unit.id,
            'garrison',
            targetTileId,
            `gate_template_replay ${targetTileId}`,
            false,
            factionId,
          ),
      },
      {
        templateId: 'advance_tick',
        eventAction: 'advance_tick',
        required: true,
        run: async () => advanceTickAction(false),
      },
    ]

    for (const step of templateSteps) {
      const result = await step.run()
      const stepPassed = step.required ? result.ok : true
      steps.push({
        templateId: step.templateId,
        eventAction: step.eventAction,
        required: step.required,
        resultOk: result.ok,
        passed: stepPassed,
        details: {
          ok: result.ok,
          message: result.message ?? null,
          tick: result.tick ?? null,
          worldVersion: result.worldVersion ?? null,
        },
      })
    }
  }

  const afterEvents = getWorldEvents(240).items
  const afterNarratives = getNarrativeEvents(240).items
  const newEvents = collectNewItems(afterEvents, beforeEventIds)
  const newNarratives = collectNewItems(afterNarratives, beforeNarrativeIds)

  const requiredFailedSteps = steps.filter((step) => step.required && !step.resultOk).map((step) => step.templateId)
  const optionalFailedSteps = steps.filter((step) => !step.required && !step.resultOk).map((step) => step.templateId)
  const stepPassed = requiredFailedSteps.length === 0
  checks.push({
    name: 'template_steps_all_ok',
    passed: stepPassed,
    details: {
      stepCount: steps.length,
      requiredFailedSteps,
      optionalFailedSteps,
    },
  })

  const expectedActions = Array.from(new Set(steps.map((step) => step.eventAction)))
  const observedActions = Array.from(
    new Set(
      newEvents
        .map((item) => item.action)
        .filter((action): action is string => typeof action === 'string' && action.length > 0),
    ),
  )
  const missingExpectedActions = expectedActions.filter((action) => !observedActions.includes(action))

  checks.push({
    name: 'template_event_actions_logged',
    passed: missingExpectedActions.length === 0,
    details: {
      expectedActions,
      observedActions,
      missingExpectedActions,
    },
  })

  const advanceEvents = newEvents.filter((item) => item.action === 'advance_tick' && item.success === true)
  let expectedNarrativeCount = 0
  for (const event of advanceEvents) {
    const narrativeCount = event.metadata?.narrativeEvents
    if (typeof narrativeCount === 'number' && Number.isFinite(narrativeCount) && narrativeCount > 0) {
      expectedNarrativeCount += narrativeCount
    }
  }

  const narrativeReconciled = newNarratives.length >= expectedNarrativeCount
  checks.push({
    name: 'template_narrative_reconcile_ok',
    passed: narrativeReconciled,
    details: {
      newNarratives: newNarratives.length,
      expectedFromAdvanceTickMetadata: expectedNarrativeCount,
      advanceTickEvents: advanceEvents.length,
    },
  })

  const restoreResult = loadWorldSlot(backupSlotId)
  checks.push({
    name: 'fixture_backup_restored',
    passed: restoreResult.ok,
    details: {
      backupSlotId,
      ok: restoreResult.ok,
      message: restoreResult.message ?? null,
      tick: restoreResult.tick,
      worldVersion: restoreResult.worldVersion,
    },
  })

  const passed = checks.every((check) => check.passed)
  return {
    runId,
    generatedAt: new Date().toISOString(),
    scenario: 'baseline_v1',
    factionId,
    fixture: {
      fixtureSlotId,
      backupSlotId,
      primed: true,
      loaded: fixtureLoadResult.ok,
      restored: restoreResult.ok,
    },
    checks,
    steps,
    events: {
      beforeCount: beforeEvents.length,
      afterCount: afterEvents.length,
      newCount: newEvents.length,
      newActions: observedActions,
      missingExpectedActions,
    },
    narratives: {
      beforeCount: beforeNarratives.length,
      afterCount: afterNarratives.length,
      newCount: newNarratives.length,
      expectedFromAdvanceTickMetadata: expectedNarrativeCount,
    },
    passed,
  }
}

async function main() {
  const { runId, runDir } = createRunContext()
  const requestId = `gate_ai_mainline_${Date.now()}`
  const beforeWorld = getWorldStateReadonly()
  const beforeTick = beforeWorld.tick
  const checks: GateCheck[] = []

  const factionId = resolvePrimaryFactionId()
  if (!factionId) {
    checks.push({
      name: 'resolve_faction',
      passed: false,
      details: { reason: 'no_non_neutral_faction' },
    })
    const report: GateReport = {
      runId,
      generatedAt: new Date().toISOString(),
      requestId,
      beforeTick,
      afterTick: beforeTick,
      checks,
      passed: false,
    }
    persistReport(runDir, runId, report)
    console.info(JSON.stringify(report, null, 2))
    process.exit(1)
  }

  const unit = beforeWorld.units.find((item) => item.faction === factionId)
  if (!unit) {
    checks.push({
      name: 'resolve_unit',
      passed: false,
      details: { factionId, reason: 'no_unit_found' },
    })
    const report: GateReport = {
      runId,
      generatedAt: new Date().toISOString(),
      requestId,
      beforeTick,
      afterTick: beforeTick,
      checks,
      passed: false,
    }
    persistReport(runDir, runId, report)
    console.info(JSON.stringify(report, null, 2))
    process.exit(1)
  }

  const queueResult = await queuePlanExecutionAction({
    source: 'mock',
    strategicCommand: 'AI mainline stability gate command',
    requestId,
    basedOnWorldVersion: beforeWorld.worldVersion,
    factionId,
    dispatchGenerals: true,
    generalSide: factionId,
    generalConcurrency: 2,
    plan: {
      intent: 'Gate smoke: verify AI mainline pipeline',
      priority: 'medium',
      reviewAfterTicks: 1,
      constraints: ['gate_ai_mainline_stability'],
      orders: [
        {
          unitId: unit.id,
          action: 'recon',
          target: unit.tileId,
        },
      ],
    },
  }, false)

  checks.push({
    name: 'queue_plan_execution_ok',
    passed: queueResult.ok,
    details: { message: queueResult.message ?? null },
  })

  checks.push({
    name: 'queue_response_request_id_echoed',
    passed: queueResult.requestId === requestId,
    details: {
      requestId: queueResult.requestId ?? null,
    },
  })

  checks.push({
    name: 'queue_response_execution_snapshot',
    passed: Boolean(queueResult.execution && queueResult.execution.requestId === requestId),
    details: {
      status: queueResult.execution?.status ?? null,
      executionRequestId: queueResult.execution?.requestId ?? null,
      activeOrderCount: queueResult.execution?.activeOrderCount ?? null,
    },
  })

  const advanceResult = await advanceTickAction(false)
  checks.push({
    name: 'advance_tick_ok',
    passed: advanceResult.ok,
    details: { message: advanceResult.message ?? null },
  })

  const afterTick = getWorldStateReadonly().tick
  checks.push({
    name: 'tick_progressed',
    passed: afterTick > beforeTick,
    details: { beforeTick, afterTick },
  })

  const events = getWorldEvents(80).items
  const queueEvent = events.find((item) => item.action === 'queue_plan_execution' && item.requestId === requestId)
  const advanceEvent = events.find((item) => item.action === 'advance_tick' && item.tick === afterTick)

  checks.push({
    name: 'event_queue_logged',
    passed: Boolean(queueEvent),
    details: {
      action: queueEvent?.action,
      success: queueEvent?.success,
      controlMode: queueEvent?.metadata?.controlMode,
    },
  })

  checks.push({
    name: 'event_general_dispatch_logged',
    passed: Boolean(queueEvent?.metadata && queueEvent.metadata.generalDispatch === true),
    details: {
      generalDispatch: queueEvent?.metadata?.generalDispatch,
      generalSummary: queueEvent?.metadata?.generalSummary,
    },
  })

  checks.push({
    name: 'event_reflect_logged',
    passed: Boolean(
      advanceEvent?.metadata &&
      typeof advanceEvent.metadata.narrativeEvents === 'number',
    ),
    details: {
      narrativeEvents: advanceEvent?.metadata?.narrativeEvents,
      reportCount: advanceEvent?.metadata?.reportCount,
    },
  })

  checks.push({
    name: 'event_control_mode_logged',
    passed: typeof queueEvent?.metadata?.controlMode === 'string',
    details: {
      autonomyLevel: queueEvent?.metadata?.autonomyLevel,
      controlMode: queueEvent?.metadata?.controlMode,
    },
  })

  const templateReplayReport = await runTemplateReplayScenario(factionId)
  const templateReplayPaths = persistTemplateReplayReport(templateReplayReport)
  checks.push({
    name: 'template_replay_passed',
    passed: templateReplayReport.passed,
    details: {
      runId: templateReplayReport.runId,
      latestPath: templateReplayPaths.latestPath,
      stampedPath: templateReplayPaths.stampedPath,
      failedChecks: templateReplayReport.checks.filter((item) => !item.passed).map((item) => item.name),
    },
  })

  const passed = checks.every((item) => item.passed)
  const report: GateReport = {
    runId,
    generatedAt: new Date().toISOString(),
    requestId,
    beforeTick,
    afterTick,
    checks,
    passed,
    templateReplay: {
      runId: templateReplayReport.runId,
      passed: templateReplayReport.passed,
      latestPath: templateReplayPaths.latestPath,
      stampedPath: templateReplayPaths.stampedPath,
    },
  }

  persistReport(runDir, runId, report)
  console.info(JSON.stringify(report, null, 2))
  process.exit(passed ? 0 : 1)
}

function persistReport(runDir: string, runId: string, report: GateReport) {
  const latestPath = join(runDir, 'ai_mainline_stability_latest.json')
  const stampedPath = join(runDir, `${runId}.json`)
  writeFileSync(latestPath, JSON.stringify(report, null, 2), 'utf8')
  writeFileSync(stampedPath, JSON.stringify(report, null, 2), 'utf8')
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : 'ai mainline stability gate failed'
  console.error(message)
  process.exit(1)
})
