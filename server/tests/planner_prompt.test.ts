import assert from 'node:assert/strict'
import { buildCommanderToolContext } from '../src/agents/tools/CommanderTools'
import { createPlanningResult } from '../src/application/planning/PlanningService'
import { createInitialWorldState } from '../../shared/domain/scenario'
import { parsePlannerResult } from '../../shared/schemas/planning'
import type { ExecutionReplay, PlannerConfig, WorldState } from '../../shared/contracts/game'

const MOCK_CONFIG: PlannerConfig = {
  mode: 'mock',
  model: 'mock-planner',
}

const COMMAND_BASELINE = '\u7a33\u4f4f\u897f\u7ebf\u5e76\u4fdd\u62a4\u8865\u7ed9\u7ebf\uff0c\u5148\u4fa6\u5bdf\u518d\u63a8\u8fdb\u3002'
const COMMAND_CASE_002 = '\u5317\u7ebf\u5148\u4fa6\u5bdf\u540e\u63a8\u8fdb\uff0c\u907f\u514d\u9ad8\u635f\u5931\u3002'
const COMMAND_CASE_005 = '\u5168\u7ebf\u9ad8\u538b\uff0c\u4fdd\u5b88\u7a33\u4f4f\u8865\u7ed9\u548c\u9632\u7ebf\uff0c\u907f\u514d\u9ad8\u635f\u5931\u3002'
const COMMAND_RAG = '\u5317\u7ebf\u4fa6\u5bdf\u5e76\u7a33\u4f4f\u8865\u7ed9\u7ebf\uff0c\u907f\u514d\u91cd\u590d\u5931\u8d25'

async function testPlannerSchemaAndExplanation() {
  const world = createInitialWorldState()
  const result = await createPlanningResult(world, COMMAND_BASELINE, MOCK_CONFIG)

  assert.doesNotThrow(() => parsePlannerResult(result), 'planner result must satisfy schema parser')
  assert.ok(result.explanation && result.explanation.trim().length >= 16, 'explanation must be present')
  assert.ok(
    (result.planningRationale?.length ?? 0) >= 1,
    'planningRationale must contain at least one reason',
  )
}

async function testCase002IntelFirstRecon() {
  const world = createIntelScarceWorld()
  const result = await createPlanningResult(world, COMMAND_CASE_002, MOCK_CONFIG)

  const actions = result.plan.orders.map((order) => order.action)
  assert.ok(actions.includes('recon'), 'intel-scarce scenario should include recon action')
  assert.ok(
    result.plan.constraints.includes('intel_first_no_blind_push'),
    'should keep conservative intel-first constraint',
  )
}

async function testCase005HighRiskConservative() {
  const world = createHighGlobalRiskWorld()
  const result = await createPlanningResult(world, COMMAND_CASE_005, MOCK_CONFIG)

  const actions = result.plan.orders.map((order) => order.action)
  assert.ok(actions.includes('recon'), 'high global risk should still keep recon')
  assert.ok(!actions.includes('capture'), 'high global risk conservative plan should not capture blindly')
}

async function testReplayRagInjectionPath() {
  const world = createInitialWorldState()
  seedReplayHistory(world)

  const context = await buildCommanderToolContext(world, COMMAND_RAG)

  assert.ok(context.recentReplays.length > 0, 'recentReplays should be retrieved from replay memory')
  assert.ok(context.recentReplays.length <= 3, 'recentReplays should respect default topK=3')
  assert.ok(context.recentReplays.every((item) => Number.isFinite(item.score)), 'retrieved replay should include score')
  assert.ok(
    context.recentReplays.every((item) => item.requestId.length > 0 && item.shortSummary.length > 0),
    'retrieved replay should preserve metadata fields',
  )
}

function createIntelScarceWorld() {
  const world = createInitialWorldState()
  for (const tile of world.map.tiles) {
    world.intel[tile.id] = {
      level: 'unknown',
      summary: 'intel withheld for planner prompt test',
    }
  }
  return world
}

function createHighGlobalRiskWorld() {
  const world = createInitialWorldState()

  for (const tile of world.map.tiles) {
    tile.enemyPressure = Math.max(tile.enemyPressure, 4)
    world.intel[tile.id] = {
      level: 'unknown',
      summary: 'global pressure for planner prompt test',
    }
  }

  world.feedback.battleRecords.unshift({
    id: 'test_global_risk_battle',
    tick: world.tick,
    regionId: 'west_front',
    tileId: 'tile_06',
    attackerFaction: 'player',
    attackerUnitId: 'u1',
    outcome: 'loss',
    attackerLoss: 180,
    defenderLoss: 90,
    alliedSupport: 10,
    summary: 'planner prompt test injected global pressure loss',
  })

  return world
}

function seedReplayHistory(world: WorldState) {
  const sampleReplays: ExecutionReplay[] = [
    {
      requestId: 'rp-001',
      source: 'mock',
      strategicCommand: '\u7a33\u4f4f\u897f\u7ebf\uff0c\u9632\u6b62\u8865\u7ed9\u88ab\u5207',
      basedOnWorldVersion: world.worldVersion,
      createdTick: Math.max(1, world.tick - 6),
      createdWorldVersion: world.worldVersion,
      reviewAtTick: world.tick + 2,
      plannerExplanation: 'West frontline overextended in previous execution.',
      planningRationale: ['Supply line was exposed after aggressive march.'],
      plan: {
        intent: 'secure_supply',
        priority: 'high',
        orders: [
          { unitId: 'u1', action: 'garrison', target: 'tile_06' },
          { unitId: 'u2', action: 'recon', target: 'tile_04' },
        ],
        constraints: ['protect_supply_line'],
        reviewAfterTicks: 2,
      },
      outcome: 'failed',
      completedTick: world.tick - 4,
      completedWorldVersion: world.worldVersion,
      frames: [
        {
          tick: world.tick - 5,
          worldVersion: world.worldVersion,
          label: 'supply collapse',
          frontlineSummary: 'West supply route disrupted.',
          latestReports: ['Loss around tile_06 due to flank pressure.'],
          highlights: [
            {
              id: 'rp-001-h1',
              kind: 'logistics',
              severity: 'high',
              title: 'Supply route severed',
              detail: 'Enemy pressure around tile_06 exceeded support capability.',
            },
          ],
          orderStates: [],
        },
      ],
    },
    {
      requestId: 'rp-002',
      source: 'mock',
      strategicCommand: '\u5317\u7ebf\u8bd5\u63a2\u4fa6\u5bdf\uff0c\u907f\u514d\u76f2\u63a8',
      basedOnWorldVersion: world.worldVersion,
      createdTick: Math.max(1, world.tick - 4),
      createdWorldVersion: world.worldVersion,
      reviewAtTick: world.tick + 1,
      plannerExplanation: 'North recon-first reduced uncertainty before commit.',
      planningRationale: ['Recon-first improved tactical certainty on north edge.'],
      plan: {
        intent: 'probe_north',
        priority: 'medium',
        orders: [
          { unitId: 'u2', action: 'recon', target: 'tile_04' },
          { unitId: 'u5', action: 'garrison', target: 'tile_13' },
        ],
        constraints: ['intel_first_no_blind_push'],
        reviewAfterTicks: 2,
      },
      outcome: 'completed',
      completedTick: world.tick - 2,
      completedWorldVersion: world.worldVersion,
      frames: [
        {
          tick: world.tick - 3,
          worldVersion: world.worldVersion,
          label: 'north recon success',
          frontlineSummary: 'North enemy posture clarified.',
          latestReports: ['Recon discovered weak enemy detachments near tile_04.'],
          highlights: [
            {
              id: 'rp-002-h1',
              kind: 'intel',
              severity: 'medium',
              title: 'Recon clarified enemy movement',
              detail: 'New intel prevented high-risk blind capture.',
            },
          ],
          orderStates: [],
        },
      ],
    },
    {
      requestId: 'rp-003',
      source: 'mock',
      strategicCommand: '\u4e1c\u7ebf\u62a2\u70b9\u6269\u5f20',
      basedOnWorldVersion: world.worldVersion,
      createdTick: Math.max(1, world.tick - 2),
      createdWorldVersion: world.worldVersion,
      reviewAtTick: world.tick + 3,
      plannerExplanation: 'Expansion succeeded after risk dropped.',
      planningRationale: ['Low-risk east window enabled capture operation.'],
      plan: {
        intent: 'expand_resource',
        priority: 'medium',
        orders: [
          { unitId: 'u4', action: 'capture', target: 'tile_14' },
          { unitId: 'u6', action: 'support', target: 'tile_11' },
        ],
        constraints: [],
        reviewAfterTicks: 3,
      },
      outcome: 'completed',
      completedTick: world.tick - 1,
      completedWorldVersion: world.worldVersion,
      frames: [
        {
          tick: world.tick - 1,
          worldVersion: world.worldVersion,
          label: 'east expansion',
          frontlineSummary: 'East expansion stable after support deployment.',
          latestReports: ['Resource tile captured with low losses.'],
          highlights: [
            {
              id: 'rp-003-h1',
              kind: 'planning',
              severity: 'low',
              title: 'Expansion window utilized',
              detail: 'Capture succeeded under low pressure and confirmed intel.',
            },
          ],
          orderStates: [],
        },
      ],
    },
  ]

  world.history.executionReplays = sampleReplays
}

async function main() {
  await testPlannerSchemaAndExplanation()
  await testCase002IntelFirstRecon()
  await testCase005HighRiskConservative()
  await testReplayRagInjectionPath()
  console.info('planner_prompt tests passed')
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : 'planner_prompt tests failed')
  process.exit(1)
})
