import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPlanningResult } from '../application/planning/PlanningService'
import { createInitialWorldState } from '../../../shared/domain/scenario'
import { parsePlannerResult } from '../../../shared/schemas/planning'
import type {
  ActionType,
  PlannerConfig,
  PlannerMode,
  PlannerResult,
  WorldState,
} from '../../../shared/contracts/game'

type EvalScenario =
  | 'baseline'
  | 'intel_scarce'
  | 'high_frontline_risk'
  | 'expansion_window'
  | 'high_global_risk'

type EvalExpectations = {
  maxOrders?: number
  requireAnyAction?: ActionType[]
  requireAllActions?: ActionType[]
  forbidActions?: ActionType[]
  preferReconWhenIntelLow?: boolean
  requireExplanation?: boolean
  minExplanationLength?: number
  requirePlanningRationale?: boolean
  minRationaleItems?: number
}

type EvalCase = {
  id: string
  title: string
  scenario: EvalScenario
  strategicCommand: string
  plannerConfig: PlannerConfig
  expectations?: EvalExpectations
}

type EvalDataset = {
  version: string
  updatedAt?: string
  description?: string
  cases: EvalCase[]
}

type EvalCategoryResult = {
  pass: boolean
  issues: string[]
}

type EvalCaseResult = {
  id: string
  title: string
  scenario: EvalScenario
  source: PlannerResult['source']
  structure: EvalCategoryResult
  tactical: EvalCategoryResult
  acceptability: EvalCategoryResult
  fullPass: boolean
  orderCount: number
}

type EvalSummary = {
  datasetVersion: string
  datasetUpdatedAt?: string
  totalCases: number
  structureCorrectRate: number
  tacticalReasonableRate: number
  acceptabilityRate: number
  fullPassRate: number
  generatedAt: string
}

const ALLOWED_ACTIONS = new Set<ActionType>(['march', 'garrison', 'recon', 'support', 'capture'])

async function main() {
  const datasetArg = readArg('--dataset') ?? 'server/evals/planning_offline_eval_v1.json'
  const modeOverride = readArg('--mode') as PlannerMode | undefined
  const outputArg = readArg('--output')
  const strict = hasArg('--strict')
  const minFullPassRate = Number(readArg('--min-full-pass-rate') ?? 1)

  const dataset = loadDataset(datasetArg)
  const caseResults: EvalCaseResult[] = []

  for (const item of dataset.cases) {
    const world = buildWorldForScenario(item.scenario)
    const config: PlannerConfig = {
      mode: modeOverride ?? item.plannerConfig.mode,
      model: item.plannerConfig.model,
    }

    const result = await createPlanningResult(world, item.strategicCommand, config)
    const structure = evaluateStructure(result, world)
    const tactical = evaluateTactical(result, world, item.expectations)
    const acceptability = evaluateAcceptability(result, item.expectations)

    caseResults.push({
      id: item.id,
      title: item.title,
      scenario: item.scenario,
      source: result.source,
      structure,
      tactical,
      acceptability,
      fullPass: structure.pass && tactical.pass && acceptability.pass,
      orderCount: result.plan.orders.length,
    })
  }

  const summary = buildSummary(dataset, caseResults)
  const report = {
    summary,
    caseResults,
  }

  const serialized = JSON.stringify(report, null, 2)
  console.info(serialized)

  if (outputArg) {
    writeFileSync(resolve(process.cwd(), outputArg), `${serialized}
`, 'utf-8')
  }

  if (strict && summary.fullPassRate < minFullPassRate) {
    console.error(
      `offline planning eval failed strict gate: fullPassRate=${summary.fullPassRate}, min=${minFullPassRate}`,
    )
    process.exit(1)
  }
}

function loadDataset(datasetPath: string): EvalDataset {
  const absolute = resolve(process.cwd(), datasetPath)
  const raw = readFileSync(absolute, 'utf-8')
  const parsed = JSON.parse(raw) as EvalDataset

  if (!Array.isArray(parsed.cases) || parsed.cases.length === 0) {
    throw new Error(`dataset has no cases: ${absolute}`)
  }

  return parsed
}

function evaluateStructure(result: PlannerResult, world: WorldState): EvalCategoryResult {
  const issues: string[] = []

  try {
    parsePlannerResult(result)
  } catch (error) {
    issues.push(`schema_invalid:${error instanceof Error ? error.message : 'unknown'}`)
    return {
      pass: false,
      issues,
    }
  }

  const primaryFactionId = resolvePrimaryFactionId(world)
  const primaryUnitIds = new Set(world.units.filter((unit) => unit.faction === primaryFactionId).map((unit) => unit.id))
  const tileIds = new Set(world.map.tiles.map((tile) => tile.id))
  const orderedUnits = new Set<string>()

  for (const order of result.plan.orders) {
    if (!ALLOWED_ACTIONS.has(order.action)) {
      issues.push(`illegal_action:${order.action}`)
    }

    if (!primaryUnitIds.has(order.unitId)) {
      issues.push(`unknown_or_non_primary_unit:${order.unitId}`)
    }

    if (!tileIds.has(order.target)) {
      issues.push(`unknown_target_tile:${order.target}`)
    }

    if (orderedUnits.has(order.unitId)) {
      issues.push(`duplicate_unit_order:${order.unitId}`)
    }

    orderedUnits.add(order.unitId)
  }

  return {
    pass: issues.length === 0,
    issues,
  }
}

function evaluateTactical(
  result: PlannerResult,
  world: WorldState,
  expectations: EvalExpectations | undefined,
): EvalCategoryResult {
  const issues: string[] = []
  const planActions = result.plan.orders.map((order) => order.action)

  if (expectations?.maxOrders && result.plan.orders.length > expectations.maxOrders) {
    issues.push(`too_many_orders:${result.plan.orders.length}`)
  }

  if (expectations?.requireAnyAction?.length) {
    const hit = expectations.requireAnyAction.some((action) => planActions.includes(action))
    if (!hit) {
      issues.push(`missing_any_required_action:${expectations.requireAnyAction.join(',')}`)
    }
  }

  if (expectations?.requireAllActions?.length) {
    for (const action of expectations.requireAllActions) {
      if (!planActions.includes(action)) {
        issues.push(`missing_required_action:${action}`)
      }
    }
  }

  if (expectations?.forbidActions?.length) {
    for (const action of expectations.forbidActions) {
      if (planActions.includes(action)) {
        issues.push(`forbidden_action_present:${action}`)
      }
    }
  }

  if (expectations?.preferReconWhenIntelLow) {
    const confirmedIntelCount = Object.values(world.intel).filter((intel) => intel.level === 'confirmed').length
    const reconCoverage = confirmedIntelCount / Math.max(1, world.map.tiles.length)
    if (reconCoverage < 0.25 && !planActions.includes('recon')) {
      issues.push('intel_low_without_recon')
    }
  }

  return {
    pass: issues.length === 0,
    issues,
  }
}

function evaluateAcceptability(
  result: PlannerResult,
  expectations: EvalExpectations | undefined,
): EvalCategoryResult {
  const issues: string[] = []

  if (expectations?.requireExplanation) {
    if (!result.explanation?.trim()) {
      issues.push('missing_explanation')
    }

    const minExplanationLength = expectations.minExplanationLength ?? 16
    if ((result.explanation?.trim().length ?? 0) < minExplanationLength) {
      issues.push(`explanation_too_short:${result.explanation?.trim().length ?? 0}`)
    }
  }

  if (expectations?.requirePlanningRationale) {
    const rationaleCount = result.planningRationale?.length ?? 0
    const minRationaleItems = expectations.minRationaleItems ?? 2
    if (rationaleCount < minRationaleItems) {
      issues.push(`insufficient_rationale_items:${rationaleCount}`)
    }

    if (
      result.planningRationale?.some((item) => item.trim().length < 6)
    ) {
      issues.push('rationale_item_too_short')
    }
  }

  return {
    pass: issues.length === 0,
    issues,
  }
}

function buildWorldForScenario(scenario: EvalScenario): WorldState {
  const world = createInitialWorldState()
  const primaryFactionId = resolvePrimaryFactionId(world)

  switch (scenario) {
    case 'baseline':
      return world
    case 'intel_scarce':
      for (const tile of world.map.tiles) {
        world.intel[tile.id] = {
          level: 'unknown',
          summary: 'intel withheld for offline eval',
        }
      }
      return world
    case 'high_frontline_risk': {
      const westRegion = world.map.regions.find((region) => region.id === 'west_front')
      for (const tileId of westRegion?.tileIds ?? []) {
        const tile = world.map.tiles.find((candidate) => candidate.id === tileId)
        if (tile) {
          tile.enemyPressure = Math.max(tile.enemyPressure, 4)
        }
      }
      world.feedback.battleRecords.unshift({
        id: 'eval_high_risk_battle',
        tick: world.tick,
        regionId: 'west_front',
        tileId: westRegion?.centerTileId ?? 'tile_06',
        attackerFaction: primaryFactionId,
        attackerUnitId: 'u1',
        outcome: 'loss',
        attackerLoss: 140,
        defenderLoss: 70,
        alliedSupport: 20,
        summary: 'offline eval injected heavy frontline loss',
      })
      return world
    }
    case 'expansion_window': {
      const eastRegion = world.map.regions.find((region) => region.id === 'east_expansion')
      for (const tileId of eastRegion?.tileIds ?? []) {
        const tile = world.map.tiles.find((candidate) => candidate.id === tileId)
        if (tile) {
          tile.enemyPressure = Math.min(tile.enemyPressure, 1)
        }
        world.intel[tileId] = {
          level: 'confirmed',
          lastScoutedTick: world.tick,
          summary: 'east expansion zone confirmed during offline eval',
        }
      }

      const eastDirective = world.alliance.directives[eastRegion?.id ?? 'east_expansion']
      if (eastDirective) {
        eastDirective.stance = 'expand'
        eastDirective.supportLevel = 82
      }

      world.feedback.battleRecords = world.feedback.battleRecords.filter(
        (record) => record.regionId !== 'east_expansion',
      )
      return world
    }
    case 'high_global_risk':
      for (const tile of world.map.tiles) {
        tile.enemyPressure = Math.max(tile.enemyPressure, 4)
        world.intel[tile.id] = {
          level: 'unknown',
          summary: 'global pressure and low intel for offline eval',
        }
      }
      world.feedback.battleRecords.unshift({
        id: 'eval_global_risk_battle',
        tick: world.tick,
        regionId: 'west_front',
        tileId: 'tile_06',
        attackerFaction: primaryFactionId,
        attackerUnitId: 'u1',
        outcome: 'loss',
        attackerLoss: 180,
        defenderLoss: 90,
        alliedSupport: 10,
        summary: 'offline eval injected global pressure loss',
      })
      return world
  }
}

function buildSummary(dataset: EvalDataset, caseResults: EvalCaseResult[]): EvalSummary {
  const total = caseResults.length
  const structurePass = caseResults.filter((item) => item.structure.pass).length
  const tacticalPass = caseResults.filter((item) => item.tactical.pass).length
  const acceptabilityPass = caseResults.filter((item) => item.acceptability.pass).length
  const fullPass = caseResults.filter((item) => item.fullPass).length

  return {
    datasetVersion: dataset.version,
    datasetUpdatedAt: dataset.updatedAt,
    totalCases: total,
    structureCorrectRate: Number((structurePass / Math.max(1, total)).toFixed(4)),
    tacticalReasonableRate: Number((tacticalPass / Math.max(1, total)).toFixed(4)),
    acceptabilityRate: Number((acceptabilityPass / Math.max(1, total)).toFixed(4)),
    fullPassRate: Number((fullPass / Math.max(1, total)).toFixed(4)),
    generatedAt: new Date().toISOString(),
  }
}

function readArg(name: string) {
  const index = process.argv.findIndex((item) => item === name)
  if (index < 0 || index + 1 >= process.argv.length) {
    return undefined
  }

  return process.argv[index + 1]
}

function hasArg(name: string) {
  return process.argv.includes(name)
}

function resolvePrimaryFactionId(world: WorldState): string {
  const factionIds = Object.keys(world.factions).filter((factionId) => factionId !== 'neutral')
  return factionIds[0] ?? 'neutral'
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'offline planning eval failed')
  process.exit(1)
})
