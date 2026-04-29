import assert from 'node:assert/strict'
import {
  buildSessionPersistPath,
  getAvailablePort,
  readObject,
  requestJson,
  shutdownChild,
  spawnBackend,
  type TailState,
  waitForHealth,
} from './backendHarness'
import type { WorldState } from '../../../shared/contracts/game/world'

export const AI_PLAYER_ID = 'player_operator_alpha'
export const GOVERNOR_PLAYER_ID = 'human_alpha'
export const FACTION_ID = 'player'

export const AI_PLAYER_ACTION_WHITELIST = [
  'city_upgrade',
  'building_upgrade',
  'queue_fill_idle_slot',
  'research_start',
  'troop_train',
  'troop_heal',
  'recruit_pool_select',
  'recruit_commander',
  'world_scout',
  'march_move',
  'garrison_set',
  'resource_gather',
  'tile_occupy',
  'troop_facility_upgrade',
  'general_focus_set',
  'formation_assign',
  'threat_escape',
  'alliance_help',
  'reward_claim',
  'battle_report_read',
]

export type AiPlayerHttpBackend = {
  baseUrl: string
  tail: TailState
  aiPlayerPersistPath: string
  sessionPersistPath: string
  stop: () => Promise<void>
}

export type AiPlayerHttpPersistPaths = {
  aiPlayerPersistPath: string
  sessionPersistPath: string
}

export type ExecutedProposal = {
  proposal: Record<string, unknown>
  receipt: Record<string, unknown>
}

export async function startAiPlayerHttpBackend(
  prefix: string,
  persistPaths?: Partial<AiPlayerHttpPersistPaths>,
  envOverrides: NodeJS.ProcessEnv = {},
): Promise<AiPlayerHttpBackend> {
  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const tail: TailState = { stdout: [], stderr: [] }
  const aiPlayerPersistPath = persistPaths?.aiPlayerPersistPath ?? buildSessionPersistPath(`${prefix}_governance_state`)
  const sessionPersistPath = persistPaths?.sessionPersistPath ?? buildSessionPersistPath(`${prefix}_session_state`)
  const child = spawnBackend(port, tail, {
    AI_PLAYER_GOVERNANCE_STATE_PATH: aiPlayerPersistPath,
    SESSION_STATE_PERSIST_PATH: sessionPersistPath,
    ...envOverrides,
  })

  const health = await waitForHealth(baseUrl)
  assert.ok(health, `backend did not become healthy\nstdout=${tail.stdout.join('\n')}\nstderr=${tail.stderr.join('\n')}`)
  assert.equal(readObject(readObject(readObject(health.data).persistence).aiPlayerGovernance).enabled, true)

  return {
    baseUrl,
    tail,
    aiPlayerPersistPath,
    sessionPersistPath,
    stop: () => shutdownChild(child),
  }
}

export async function joinGovernor(baseUrl: string) {
  const join = await requestJson(baseUrl, '/api/session/join', 'POST', {
    factionId: FACTION_ID,
    playerName: GOVERNOR_PLAYER_ID,
  })
  assert.equal(join.status, 200, `session join failed: ${JSON.stringify(join.data)}`)
}

export async function registerDefaultAiPlayer(baseUrl: string) {
  const register = await requestJson(baseUrl, '/api/ai/players', 'POST', {
    aiPlayerId: AI_PLAYER_ID,
    displayName: 'Player Operator Alpha',
    governorPlayerId: GOVERNOR_PLAYER_ID,
    factionId: FACTION_ID,
    actionWhitelist: AI_PLAYER_ACTION_WHITELIST,
  })
  assert.equal(register.status, 200, `register AI player failed: ${JSON.stringify(register.data)}`)
}

export async function bootRegisteredAiPlayer(prefix: string): Promise<AiPlayerHttpBackend> {
  const backend = await startAiPlayerHttpBackend(prefix)
  await joinGovernor(backend.baseUrl)
  await registerDefaultAiPlayer(backend.baseUrl)
  return backend
}

export async function loadWorldState(baseUrl: string): Promise<WorldState> {
  const worldResult = await requestJson(baseUrl, '/api/world?intelMode=full', 'GET', undefined, 30_000)
  assert.equal(worldResult.status, 200, `world route failed: ${JSON.stringify(worldResult.data)}`)
  const root = readObject(worldResult.data)
  const world = readObject(root.world) as unknown as WorldState

  if (!world.map.connections || Object.keys(world.map.connections).length === 0) {
    const layoutResult = await requestJson(baseUrl, '/api/world/map-layout?scope=bootstrap', 'GET')
    assert.equal(layoutResult.status, 200, `map layout route failed: ${JSON.stringify(layoutResult.data)}`)
    const layoutMap = readObject(readObject(layoutResult.data).map)
    world.map = {
      ...world.map,
      connections: (layoutMap.connections ?? world.map.connections) as WorldState['map']['connections'],
      tiles: (layoutMap.tiles ?? world.map.tiles) as WorldState['map']['tiles'],
      regions: (layoutMap.regions ?? world.map.regions) as WorldState['map']['regions'],
    }
  }

  return world
}

export async function ensureFactionBudget(
  baseUrl: string,
  minActionPoints: number,
  minFood: number,
  label: string,
): Promise<void> {
  for (let tickIndex = 0; tickIndex < 12; tickIndex += 1) {
    const world = await loadWorldState(baseUrl)
    const faction = world.factions[FACTION_ID]
    assert.ok(faction, `missing faction ${FACTION_ID} while preparing ${label}`)
    if (faction.actionPoints >= minActionPoints && faction.food >= minFood) {
      return
    }

    const advance = await requestJson(
      baseUrl,
      '/api/world/action?includeWorld=false',
      'POST',
      { action: 'advanceTick' },
      60_000,
    )
    assert.equal(advance.status, 200, `advance tick for ${label} prep failed: ${JSON.stringify(advance.data)}`)
    assert.equal(readObject(advance.data).ok, true, `advance tick for ${label} prep should succeed`)
  }

  throw new Error(`${label} budget was not reached for faction ${FACTION_ID}`)
}

export async function clearAllPlanExecutions(baseUrl: string): Promise<void> {
  const world = await loadWorldState(baseUrl)
  for (const factionId of Object.keys(world.factions)) {
    const clear = await requestJson(
      baseUrl,
      '/api/world/action?includeWorld=false',
      'POST',
      { action: 'clearPlanExecution', payload: { factionId } },
      60_000,
    )
    assert.equal(clear.status, 200, `clear plan for ${factionId} failed: ${JSON.stringify(clear.data)}`)
    assert.equal(readObject(clear.data).ok, true, `clear plan for ${factionId} should succeed`)
  }
}

export async function createApproveExecuteProposal(
  baseUrl: string,
  action: string,
  args: Record<string, unknown> = {},
  reason = `AI player shard smoke test: ${action}`,
): Promise<ExecutedProposal> {
  const create = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
    aiPlayerId: AI_PLAYER_ID,
    action,
    source: 'mcp',
    reason,
    args,
  })
  assert.equal(create.status, 200, `create ${action} proposal failed: ${JSON.stringify(create.data)}`)
  const createdProposal = readObject(readObject(create.data).proposal)
  assert.deepEqual(createdProposal.args, args, `${action} should preserve action-specific args`)

  const proposalId = String(createdProposal.proposalId)
  const approve = await requestJson(baseUrl, `/api/ai/players/proposals/${proposalId}/approve`, 'POST', {
    approvedBy: GOVERNOR_PLAYER_ID,
  })
  assert.equal(approve.status, 200, `approve ${action} proposal failed: ${JSON.stringify(approve.data)}`)

  const execute = await requestJson(
    baseUrl,
    `/api/ai/players/proposals/${proposalId}/execute`,
    'POST',
    {
      executedBy: GOVERNOR_PLAYER_ID,
      includeWorld: false,
    },
    60_000,
  )
  assert.equal(execute.status, 200, `execute ${action} proposal failed: ${JSON.stringify(execute.data)}`)

  return {
    proposal: readObject(readObject(execute.data).proposal),
    receipt: readObject(readObject(execute.data).receipt),
  }
}

export function assertSuccessfulReceipt(
  action: string,
  receipt: Record<string, unknown>,
  worldAction: string,
) {
  assert.equal(receipt.ok, true, `${action} receipt should report success`)
  assert.equal(receipt.worldAction, worldAction, `${action} receipt should preserve mapped world action`)
  assert.equal(receipt.failureCode, null, `${action} receipt should expose null failureCode on success`)
}
