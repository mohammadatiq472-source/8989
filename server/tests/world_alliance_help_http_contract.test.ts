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
} from './helpers/backendHarness'
import type { WorldState } from '../../shared/contracts/game/world'

function readWorldStatePayload(value: unknown): WorldState {
  const root = readObject(value)
  const world = readObject(root.world)
  return world as unknown as WorldState
}

async function loadWorldState(baseUrl: string): Promise<WorldState> {
  const worldResult = await requestJson(baseUrl, '/api/world?intelMode=full', 'GET')
  assert.equal(worldResult.status, 200, `world route failed: ${JSON.stringify(worldResult.data)}`)
  return readWorldStatePayload(worldResult.data)
}

async function ensureActionPoints(baseUrl: string, factionId: string, minimum: number) {
  for (let tickIndex = 0; tickIndex < 8; tickIndex += 1) {
    const world = await loadWorldState(baseUrl)
    const faction = world.factions[factionId]
    assert.ok(faction, `missing faction ${factionId} while preparing alliance help`)
    if (faction.actionPoints >= minimum) {
      return
    }

    const advance = await requestJson(
      baseUrl,
      '/api/world/action?includeWorld=false',
      'POST',
      { action: 'advanceTick' },
      60_000,
    )
    assert.equal(advance.status, 200, `advance tick for alliance help prep failed: ${JSON.stringify(advance.data)}`)
    assert.equal(readObject(advance.data).ok, true, `advance tick for alliance help prep should succeed: ${JSON.stringify(advance.data)}`)
  }

  throw new Error(`alliance help action points were not reached for faction ${factionId}`)
}

function resolveAllianceHelpCandidate(world: WorldState, factionId: string) {
  const directive = Object.values(world.alliance.directives)[0]
  assert.ok(directive, 'alliance directive should exist in baseline world')
  const commander = world.alliance.commanders.find((candidate) => candidate.id === directive.assignedCommanderId)
  assert.ok(commander, `assigned commander should exist for region ${directive.regionId}`)
  const faction = world.factions[factionId]
  assert.ok(faction, `missing faction ${factionId}`)
  return {
    regionId: directive.regionId,
    commanderId: directive.assignedCommanderId,
    supportLevel: directive.supportLevel,
    commanderReadiness: commander.readiness,
    actionPoints: faction.actionPoints,
    allianceActionCount: world.feedback.allianceActions.length,
  }
}

async function run() {
  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const tail: TailState = { stdout: [], stderr: [] }
  const sessionPersistPath = buildSessionPersistPath('world_alliance_help_session_state')
  const envOverrides = {
    SESSION_STATE_PERSIST_PATH: sessionPersistPath,
  }
  let child = spawnBackend(port, tail, envOverrides)

  try {
    const health = await waitForHealth(baseUrl)
    assert.ok(health, `backend did not become healthy\nstdout=${tail.stdout.join('\n')}\nstderr=${tail.stderr.join('\n')}`)

    const invalidSchema = await requestJson(baseUrl, '/api/world/action?includeWorld=false', 'POST', {
      action: 'allianceHelp',
      payload: {
        factionId: 'player',
        regionId: 123,
      },
    })
    assert.equal(invalidSchema.status, 400, 'allianceHelp should reject non-string regionId at world action schema validation time')

    const missingRegion = await requestJson(baseUrl, '/api/world/action?includeWorld=false', 'POST', {
      action: 'allianceHelp',
      payload: {
        factionId: 'player',
        regionId: 'region_missing_for_contract_test',
      },
    })
    assert.equal(missingRegion.status, 200, `allianceHelp missing region route failed: ${JSON.stringify(missingRegion.data)}`)
    const missingRegionPayload = readObject(missingRegion.data)
    assert.equal(missingRegionPayload.ok, false, 'allianceHelp should surface structured failure for missing region')
    assert.equal(missingRegionPayload.failureCode, 'missing_alliance_region', 'allianceHelp should return missing_alliance_region failureCode')
    const missingRegionExecution = readObject(missingRegionPayload.execution)
    assert.ok(typeof missingRegionExecution.actionPointsRemaining === 'number', 'allianceHelp failure should expose execution snapshot')

    await ensureActionPoints(baseUrl, 'player', 1)
    const worldBefore = await loadWorldState(baseUrl)
    const candidate = resolveAllianceHelpCandidate(worldBefore, 'player')

    const success = await requestJson(baseUrl, '/api/world/action?includeWorld=true', 'POST', {
      action: 'allianceHelp',
      payload: {
        factionId: 'player',
        regionId: candidate.regionId,
      },
    }, 60_000)
    assert.equal(success.status, 200, `allianceHelp success route failed: ${JSON.stringify(success.data)}`)
    const successPayload = readObject(success.data)
    assert.equal(successPayload.ok, true, `allianceHelp should succeed: ${JSON.stringify(success.data)}`)
    assert.equal(successPayload.relatedId, candidate.regionId, 'allianceHelp should expose regionId as relatedId')

    const successExecution = readObject(successPayload.execution)
    assert.equal(
      Number(successExecution.actionPointsRemaining),
      Math.max(0, candidate.actionPoints - 1),
      'allianceHelp execution snapshot should reflect AP spend',
    )

    const worldAfter = readWorldStatePayload(success.data)
    const directiveAfter = worldAfter.alliance.directives[candidate.regionId]
    assert.ok(directiveAfter, 'alliance directive should remain addressable after allianceHelp')
    assert.ok(directiveAfter.supportLevel > candidate.supportLevel, 'allianceHelp should increase support level')

    const commanderAfter = worldAfter.alliance.commanders.find((item) => item.id === candidate.commanderId)
    assert.ok(commanderAfter, 'allianceHelp should keep assigned commander in world state')
    assert.ok(
      Number(commanderAfter.readiness) > candidate.commanderReadiness,
      'allianceHelp should increase assigned commander readiness',
    )

    const factionAfter = worldAfter.factions.player
    assert.ok(factionAfter, 'player faction should remain in world state after allianceHelp')
    assert.equal(factionAfter.actionPoints, Math.max(0, candidate.actionPoints - 1), 'allianceHelp should spend 1 AP')
    assert.ok(
      worldAfter.feedback.allianceActions.length >= candidate.allianceActionCount + 1,
      'allianceHelp should append an alliance feedback action',
    )
    assert.equal(
      worldAfter.feedback.allianceActions[0]?.regionId,
      candidate.regionId,
      'allianceHelp feedback action should point at the helped region',
    )

    const worldReloaded = await loadWorldState(baseUrl)
    assert.equal(
      worldReloaded.alliance.directives[candidate.regionId]?.supportLevel,
      directiveAfter.supportLevel,
      'allianceHelp mutation should persist through world summary reload',
    )
  } finally {
    await shutdownChild(child)
  }
}

run().catch((error) => {
  console.error('[world_alliance_help_http_contract] failed:', error)
  process.exitCode = 1
})
