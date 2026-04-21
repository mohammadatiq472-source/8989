import assert from 'node:assert/strict'
import { request as httpRequest } from 'node:http'
import {
  buildSessionPersistPath,
  getAvailablePort,
  readArray,
  readObject,
  shutdownChild,
  spawnBackend,
  type TailState,
  waitForHealth,
} from './helpers/backendHarness'
import { moveUnit } from '../../shared/domain/rules'
import type { CityTechTrackId } from '../../shared/contracts/game/meta'
import type { ClaimableReward, PveNode, WorldState } from '../../shared/contracts/game/world'

function readWorldStatePayload(value: unknown): WorldState {
  const root = readObject(value)
  const world = readObject(root.world)
  return world as unknown as WorldState
}

async function requestJson(
  baseUrl: string,
  path: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>,
  timeoutMs = 15_000,
) {
  const url = new URL(path, baseUrl)
  const requestBody = body ? JSON.stringify(body) : undefined

  return await new Promise<{ ok: boolean; status: number; data: unknown }>((resolve, reject) => {
    const req = httpRequest(
      url,
      {
        method,
        headers: requestBody
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(requestBody).toString(),
              Connection: 'close',
            }
          : { Connection: 'close' },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8')
          let data: unknown = null
          if (raw.trim().length > 0) {
            try {
              data = JSON.parse(raw)
            } catch {
              data = { raw }
            }
          }
          resolve({
            ok: (res.statusCode ?? 500) >= 200 && (res.statusCode ?? 500) < 300,
            status: res.statusCode ?? 500,
            data,
          })
        })
      },
    )

    req.on('error', reject)
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`request timeout after ${timeoutMs}ms`)))
    if (requestBody) {
      req.write(requestBody)
    }
    req.end()
  })
}

async function loadWorldState(baseUrl: string): Promise<WorldState> {
  const worldResult = await requestJson(baseUrl, '/api/world?intelMode=full', 'GET')
  assert.equal(worldResult.status, 200, `world route failed: ${JSON.stringify(worldResult.data)}`)
  const world = readWorldStatePayload(worldResult.data)
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

function resolveMoveCandidate(world: WorldState, factionId: string): { unitId: string; targetTileId: string } {
  for (const unit of world.units) {
    if (unit.faction !== factionId) {
      continue
    }

    const neighbors = world.map.connections[unit.tileId] ?? []
    for (const targetTileId of neighbors) {
      if (targetTileId === unit.tileId) {
        continue
      }
      const result = moveUnit(world, unit.id, targetTileId, factionId)
      if (result.ok) {
        return {
          unitId: unit.id,
          targetTileId,
        }
      }
    }
  }

  throw new Error(`no executable moveUnit candidate found for faction ${factionId}`)
}

function resolveResearchTrack(_world: WorldState, _factionId: string): CityTechTrackId {
  return 'governance'
}

function resolveGarrisonCandidate(world: WorldState, factionId: string): { unitId: string; targetTileId: string } {
  const unit = world.units.find((candidate) => candidate.faction === factionId)
  if (!unit) {
    throw new Error(`no unit available for garrison candidate in faction ${factionId}`)
  }
  return {
    unitId: unit.id,
    targetTileId: unit.tileId,
  }
}

function resolveScoutCandidate(world: WorldState, factionId: string): { unitId: string; targetTileId: string } {
  for (const unit of world.units) {
    if (unit.faction !== factionId) {
      continue
    }

    const neighbors = (world.map.connections[unit.tileId] ?? []).filter((tileId) => tileId !== unit.tileId)
    if (neighbors.length <= 0) {
      continue
    }

    const rankedNeighbors = neighbors
      .map((tileId) => {
        const tile = world.map.tiles.find((candidate) => candidate.id === tileId)
        if (!tile) {
          return null
        }
        const intelLevel = world.intel[tileId]?.level ?? 'unknown'
        const intelRank = intelLevel === 'unknown' ? 0 : intelLevel === 'suspected' ? 1 : 2
        const ownerRank = tile.owner === factionId ? 1 : 0
        return {
          tileId,
          tile,
          intelRank,
          ownerRank,
        }
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
      .sort((left, right) => {
        if (left.intelRank !== right.intelRank) {
          return left.intelRank - right.intelRank
        }
        if (left.ownerRank !== right.ownerRank) {
          return left.ownerRank - right.ownerRank
        }
        if (left.tile.enemyPressure !== right.tile.enemyPressure) {
          return right.tile.enemyPressure - left.tile.enemyPressure
        }
        return left.tile.id.localeCompare(right.tile.id)
      })

    if (rankedNeighbors[0]) {
      return {
        unitId: unit.id,
        targetTileId: rankedNeighbors[0].tileId,
      }
    }
  }

  throw new Error(`no executable scout candidate found for faction ${factionId}`)
}

function resolveAllianceHelpCandidate(world: WorldState, factionId: string) {
  const regionById = new Map(world.map.regions.map((region) => [region.id, region] as const))
  const tileById = new Map(world.map.tiles.map((tile) => [tile.id, tile] as const))
  const commanderById = new Map(world.alliance.commanders.map((commander) => [commander.id, commander] as const))
  const faction = world.factions[factionId]
  assert.ok(faction, `missing faction ${factionId} while resolving alliance help candidate`)

  const candidate = Object.values(world.alliance.directives)
    .map((directive) => {
      const region = regionById.get(directive.regionId)
      const commander = commanderById.get(directive.assignedCommanderId)
      if (!region || !commander) {
        return null
      }

      const enemyPressure = region.tileIds.reduce((highest, tileId) => {
        const tile = tileById.get(tileId)
        return Math.max(highest, tile?.enemyPressure ?? 0)
      }, 0)

      return {
        regionId: directive.regionId,
        commanderId: directive.assignedCommanderId,
        supportLevel: directive.supportLevel,
        commanderReadiness: commander.readiness,
        enemyPressure,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((left, right) => {
      if (left.supportLevel !== right.supportLevel) {
        return left.supportLevel - right.supportLevel
      }
      if (left.enemyPressure !== right.enemyPressure) {
        return right.enemyPressure - left.enemyPressure
      }
      return left.regionId.localeCompare(right.regionId)
    })[0]

  assert.ok(candidate, `no executable alliance_help candidate found for faction ${factionId}`)
  return {
    regionId: candidate.regionId,
    commanderId: candidate.commanderId,
    supportLevel: candidate.supportLevel,
    commanderReadiness: candidate.commanderReadiness,
    actionPoints: faction.actionPoints,
    allianceActionCount: world.feedback.allianceActions.length,
  }
}

function resolveFormationAssignCandidate(world: WorldState, factionId: string): {
  heroId: string
  unitId: string | null
  tacticId: 'assault' | 'guard' | 'logistics'
  actionPoints: number
  executionState: 'queued_to_unit' | 'pending_assignment'
} {
  const faction = world.factions[factionId]
  assert.ok(faction, `missing faction ${factionId} while resolving formation_assign candidate`)

  const rosterHeroIds = faction.heroCommand.rosterHeroIds
  const generalState = world.slgDomainState?.generalStateByFaction?.[factionId]
  const unit = world.units.find((candidate) =>
    candidate.faction === factionId && rosterHeroIds.includes(candidate.hero.id))
  const heroId =
    unit?.hero.id ||
    (generalState?.activeHeroId && rosterHeroIds.includes(generalState.activeHeroId) ? generalState.activeHeroId : null) ||
    (faction.heroCommand.recentHeroId && rosterHeroIds.includes(faction.heroCommand.recentHeroId)
      ? faction.heroCommand.recentHeroId
      : null) ||
    rosterHeroIds[0]
  assert.ok(heroId, `no executable formation_assign hero found for faction ${factionId}`)

  const currentTactic = generalState?.tacticByHeroId?.[heroId]
  const tacticId =
    (['guard', 'assault', 'logistics'] as const).find((candidate) => candidate !== currentTactic) ?? 'guard'

  return {
    heroId,
    unitId: unit?.id ?? null,
    tacticId,
    actionPoints: faction.actionPoints,
    executionState: unit ? 'queued_to_unit' : 'pending_assignment',
  }
}

function resolveGeneralFocusCandidate(world: WorldState, factionId: string): {
  heroId: string
  previousHeroId: string | null
  actionPoints: number
} {
  const faction = world.factions[factionId]
  assert.ok(faction, `missing faction ${factionId} while resolving general_focus_set candidate`)

  const rosterHeroIds = faction.heroCommand.rosterHeroIds
  const generalState = world.slgDomainState?.generalStateByFaction?.[factionId]
  const previousHeroId =
    generalState?.activeHeroId && rosterHeroIds.includes(generalState.activeHeroId)
      ? generalState.activeHeroId
      : null
  const heroId =
    rosterHeroIds.find((candidate) => candidate !== previousHeroId) ??
    previousHeroId ??
    faction.heroCommand.recentHeroId ??
    rosterHeroIds[0]
  assert.ok(heroId, `no executable general_focus_set hero found for faction ${factionId}`)

  return {
    heroId,
    previousHeroId,
    actionPoints: faction.actionPoints,
  }
}

function resolveTroopFacilityUpgradeCandidate(world: WorldState, factionId: string): {
  unitId: string
  facilityId: 'training_ground'
  buildingId: 'training_ground_base'
  previousLevel: number
  actionPoints: number
} {
  const faction = world.factions[factionId]
  assert.ok(faction, `missing faction ${factionId} while resolving troop_facility_upgrade candidate`)

  const unit = world.units.find((candidate) => candidate.faction === factionId)
  assert.ok(unit, `no executable troop_facility_upgrade unit found for faction ${factionId}`)

  const facilityId = 'training_ground'
  const buildingId = 'training_ground_base'
  const previousLevel = Math.max(
    1,
    Number(
      world.slgDomainState?.troopFacilitiesByUnit?.[unit.id]?.[facilityId]?.[buildingId]?.level ?? 1,
    ),
  )

  return {
    unitId: unit.id,
    facilityId,
    buildingId,
    previousLevel,
    actionPoints: faction.actionPoints,
  }
}

function resolveRecruitPoolSelectCandidate(world: WorldState, factionId: string): {
  poolId: 'pool_standard' | 'pool_season' | 'pool_limited'
  previousPoolId: string | null
  actionPoints: number
} {
  const faction = world.factions[factionId]
  assert.ok(faction, `missing faction ${factionId} while resolving recruit_pool_select candidate`)

  const previousPoolId = world.slgDomainState?.recruitStateByFaction?.[factionId]?.selectedPoolId ?? null
  const poolId =
    (['pool_standard', 'pool_season', 'pool_limited'] as const).find((candidate) => candidate !== previousPoolId) ??
    'pool_standard'

  return {
    poolId,
    previousPoolId,
    actionPoints: faction.actionPoints,
  }
}

function resolveThreatEscapeCandidate(world: WorldState, factionId: string): {
  unitId: string
  mode: 'recover' | 'redeploy'
  agendaActionId: 'agenda_recover' | 'agenda_redeploy'
  targetTileId: string
} {
  const unit = world.units.find((candidate) => candidate.faction === factionId)
  assert.ok(unit, `no executable threat_escape unit found for faction ${factionId}`)

  const currentTile = world.map.tiles.find((tile) => tile.id === unit.tileId)
  const firstNeighborId = (world.map.connections[unit.tileId] ?? []).find((tileId) => tileId !== unit.tileId)
  const mode =
    firstNeighborId && (currentTile?.enemyPressure ?? 0) > 0
      ? 'redeploy'
      : 'recover'

  return {
    unitId: unit.id,
    mode,
    agendaActionId: mode === 'redeploy' ? 'agenda_redeploy' : 'agenda_recover',
    targetTileId: mode === 'redeploy' ? (firstNeighborId ?? unit.tileId) : unit.tileId,
  }
}

function buildShortestPath(
  connections: WorldState['map']['connections'],
  startTileId: string,
  targetTileId: string,
): string[] | null {
  if (startTileId === targetTileId) {
    return [startTileId]
  }

  const queue: string[] = [startTileId]
  const previous = new Map<string, string | null>([[startTileId, null]])
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]
    for (const neighbor of connections[current] ?? []) {
      if (previous.has(neighbor)) {
        continue
      }
      previous.set(neighbor, current)
      if (neighbor === targetTileId) {
        const path: string[] = [targetTileId]
        let cursor: string | null = current
        while (cursor) {
          path.unshift(cursor)
          cursor = previous.get(cursor) ?? null
        }
        return path
      }
      queue.push(neighbor)
    }
  }

  return null
}

function isLegalMovePath(
  world: WorldState,
  factionId: string,
  unitId: string,
  path: string[],
): boolean {
  let simulatedWorld = structuredClone(world)
  for (const targetTileId of path.slice(1)) {
    const result = moveUnit(simulatedWorld, unitId, targetTileId, factionId)
    if (!result.ok) {
      return false
    }
    simulatedWorld = result.world
    simulatedWorld.factions[factionId].actionPoints = 999
    simulatedWorld.factions[factionId].food = 999
  }

  return true
}

function resolveRewardClaimCandidate(
  world: WorldState,
  factionId: string,
): {
  unitId: string
  node: PveNode
  path: string[]
} {
  const unclearedNodes = (world.pveNodes ?? []).filter((node) => !node.cleared)
  assert.ok(unclearedNodes.length > 0, 'baseline world should expose uncleared pve nodes')

  const candidates = world.units
    .filter((unit) => unit.faction === factionId)
    .flatMap((unit) =>
      unclearedNodes
        .filter((node) => unit.strength * 0.8 >= node.guardStrength)
        .map((node) => {
          const path = buildShortestPath(world.map.connections, unit.tileId, node.tileId)
          if (!path || path.length <= 1) {
            return null
          }
          if (!isLegalMovePath(world, factionId, unit.id, path)) {
            return null
          }
          return {
            unitId: unit.id,
            node,
            path,
          }
        })
        .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null),
    )
    .sort((left, right) => {
      if (left.path.length !== right.path.length) {
        return left.path.length - right.path.length
      }
      if (left.node.guardStrength !== right.node.guardStrength) {
        return left.node.guardStrength - right.node.guardStrength
      }
      return left.unitId.localeCompare(right.unitId)
    })

  const candidate = candidates[0]
  assert.ok(candidate, `no legal pve path found for faction ${factionId}`)
  return candidate
}

function resolveMarchCost(world: WorldState, fromTileId: string, toTileId: string) {
  const fromTile = world.map.tiles.find((tile) => tile.id === fromTileId)
  const toTile = world.map.tiles.find((tile) => tile.id === toTileId)
  assert.ok(toTile, `missing target tile ${toTileId} while resolving march cost`)

  let actionPoints = toTile.moveCost
  let food = 1
  if (toTile.terrain === 'mountain') {
    actionPoints += 1
    food += 1
  }

  const crossingRiverBand = fromTile?.terrain !== 'riverland' && toTile.terrain === 'riverland'
  if (crossingRiverBand) {
    actionPoints += 1
    food += 1
  }

  if (toTile.type === 'pass') {
    actionPoints += 1
  }

  return { actionPoints, food }
}

async function moveUnitAlongPath(
  baseUrl: string,
  world: WorldState,
  factionId: string,
  unitId: string,
  path: string[],
): Promise<void> {
  const faction = world.factions[factionId]
  assert.ok(faction, `missing faction ${factionId} while traversing reward path`)
  let remainingActionPoints = faction.actionPoints
  let remainingFood = faction.food
  let currentTileId = path[0]

  for (const targetTileId of path.slice(1)) {
    const cost = resolveMarchCost(world, currentTileId, targetTileId)
    while (remainingActionPoints < cost.actionPoints || remainingFood < cost.food) {
      const advance = await requestJson(
        baseUrl,
        '/api/world/action?includeWorld=false',
        'POST',
        { action: 'advanceTick' },
        60_000,
      )
      assert.equal(advance.status, 200, `advance tick for reward move prep failed: ${JSON.stringify(advance.data)}`)
      assert.equal(readObject(advance.data).ok, true, `advance tick for reward move prep should succeed: ${JSON.stringify(advance.data)}`)
      const refreshedWorld = await loadWorldState(baseUrl)
      const refreshedFaction = refreshedWorld.factions[factionId]
      assert.ok(refreshedFaction, `missing faction ${factionId} after reward move prep tick`)
      remainingActionPoints = refreshedFaction.actionPoints
      remainingFood = refreshedFaction.food
    }

    let move:
      | {
          ok: boolean
          status: number
          data: unknown
        }
      | undefined
    for (let attempt = 0; attempt < 3; attempt += 1) {
      move = await requestJson(
        baseUrl,
        '/api/world/action?includeWorld=false',
        'POST',
        {
          action: 'moveUnit',
          payload: {
            factionId,
            unitId,
            targetTileId,
          },
        },
        60_000,
      )
      assert.equal(move.status, 200, `moveUnit route failed while traversing reward path: ${JSON.stringify(move.data)}`)
      if (readObject(move.data).ok === true) {
        break
      }

      if (readObject(move.data).message === '当前已有 AI 任务在执行，地图点击已切换为查看模式。') {
        await clearAllPlanExecutions(baseUrl)
        continue
      }
      break
    }
    assert.ok(move, 'moveUnit response should be defined while traversing reward path')
    assert.equal(readObject(move.data).ok, true, `moveUnit should succeed while traversing reward path: ${JSON.stringify(move.data)}`)
    remainingActionPoints -= cost.actionPoints
    remainingFood -= cost.food
    currentTileId = targetTileId
  }
}

function resolvePendingReward(world: WorldState, factionId: string, nodeId: string): ClaimableReward {
  const rewards = world.factions[factionId]?.claimableRewards ?? []
  const reward = rewards.find((candidate) => candidate.nodeId === nodeId)
  assert.ok(reward, `claimable reward should exist for node ${nodeId}`)
  return reward
}

async function ensureMoveReady(
  baseUrl: string,
  factionId: string,
): Promise<{ unitId: string; targetTileId: string }> {
  for (let tickIndex = 0; tickIndex < 8; tickIndex += 1) {
    const world = await loadWorldState(baseUrl)
    const faction = world.factions[factionId]
    assert.ok(faction, `missing faction ${factionId} while preparing move`)
    if (faction.actionPoints >= 1 && faction.food >= 1) {
      return resolveMoveCandidate(world, factionId)
    }

    const advance = await requestJson(
      baseUrl,
      '/api/world/action?includeWorld=false',
      'POST',
      { action: 'advanceTick' },
      60_000,
    )
    assert.equal(advance.status, 200, `advance tick for move prep failed: ${JSON.stringify(advance.data)}`)
    assert.equal(readObject(advance.data).ok, true, `advance tick for move prep should succeed: ${JSON.stringify(advance.data)}`)
  }

  throw new Error(`move readiness was not reached for faction ${factionId}`)
}

async function ensureFactionBudget(
  baseUrl: string,
  factionId: string,
  minActionPoints: number,
  minFood: number,
  label: string,
): Promise<void> {
  for (let tickIndex = 0; tickIndex < 12; tickIndex += 1) {
    const world = await loadWorldState(baseUrl)
    const faction = world.factions[factionId]
    assert.ok(faction, `missing faction ${factionId} while preparing ${label}`)
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
    assert.equal(readObject(advance.data).ok, true, `advance tick for ${label} prep should succeed: ${JSON.stringify(advance.data)}`)
  }

  throw new Error(`${label} budget was not reached for faction ${factionId}`)
}

async function clearAllPlanExecutions(baseUrl: string): Promise<void> {
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
    assert.equal(readObject(clear.data).ok, true, `clear plan for ${factionId} should succeed: ${JSON.stringify(clear.data)}`)
  }
}

async function run() {
  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const tail: TailState = { stdout: [], stderr: [] }
  const aiPlayerPersistPath = buildSessionPersistPath('ai_player_governance_state')
  const sessionPersistPath = buildSessionPersistPath('ai_player_session_state')
  const envOverrides = {
    AI_PLAYER_GOVERNANCE_STATE_PATH: aiPlayerPersistPath,
    SESSION_STATE_PERSIST_PATH: sessionPersistPath,
  }
  let child = spawnBackend(port, tail, envOverrides)

  try {
    const health = await waitForHealth(baseUrl)
    assert.ok(health, `backend did not become healthy\nstdout=${tail.stdout.join('\n')}\nstderr=${tail.stderr.join('\n')}`)
    const healthPayload = readObject(health.data)
    const persistence = readObject(healthPayload.persistence)
    const aiPlayerGovernancePersist = readObject(persistence.aiPlayerGovernance)
    assert.equal(aiPlayerGovernancePersist.enabled, true, 'health should expose aiPlayerGovernance persistence health')

    const join = await requestJson(baseUrl, '/api/session/join', 'POST', {
      factionId: 'player',
      playerName: 'human_alpha',
    })
    assert.equal(join.status, 200, `session join failed: ${JSON.stringify(join.data)}`)

    const catalog = await requestJson(baseUrl, '/api/ai/player-actions/catalog', 'GET')
    assert.equal(catalog.status, 200, `catalog route failed: ${JSON.stringify(catalog.data)}`)
    const catalogPayload = readObject(catalog.data)
    const catalogItems = readArray(catalogPayload.catalog)
    const catalogByAction = new Map(
      catalogItems.map((item) => {
        const entry = readObject(item)
        return [String(entry.action), entry] as const
      }),
    )
    const cityUpgradeCatalogEntry = catalogByAction.get('city_upgrade')
    const buildingUpgradeCatalogEntry = catalogByAction.get('building_upgrade')
    const queueFillIdleSlotCatalogEntry = catalogByAction.get('queue_fill_idle_slot')
    const researchStartCatalogEntry = catalogByAction.get('research_start')
    const troopTrainCatalogEntry = catalogByAction.get('troop_train')
    const recruitPoolSelectCatalogEntry = catalogByAction.get('recruit_pool_select')
    const recruitCommanderCatalogEntry = catalogByAction.get('recruit_commander')
    const worldScoutCatalogEntry = catalogByAction.get('world_scout')
    const marchMoveCatalogEntry = catalogByAction.get('march_move')
    const garrisonSetCatalogEntry = catalogByAction.get('garrison_set')
    const troopFacilityUpgradeCatalogEntry = catalogByAction.get('troop_facility_upgrade')
    const generalFocusSetCatalogEntry = catalogByAction.get('general_focus_set')
    const formationAssignCatalogEntry = catalogByAction.get('formation_assign')
    const threatEscapeCatalogEntry = catalogByAction.get('threat_escape')
    const allianceHelpCatalogEntry = catalogByAction.get('alliance_help')
    const rewardClaimCatalogEntry = catalogByAction.get('reward_claim')
    assert.ok(cityUpgradeCatalogEntry, 'city_upgrade should exist in AI player action catalog')
    assert.ok(buildingUpgradeCatalogEntry, 'building_upgrade should exist in AI player action catalog')
    assert.ok(queueFillIdleSlotCatalogEntry, 'queue_fill_idle_slot should exist in AI player action catalog')
    assert.ok(researchStartCatalogEntry, 'research_start should exist in AI player action catalog')
    assert.ok(troopTrainCatalogEntry, 'troop_train should exist in AI player action catalog')
    assert.ok(recruitPoolSelectCatalogEntry, 'recruit_pool_select should exist in AI player action catalog')
    assert.ok(recruitCommanderCatalogEntry, 'recruit_commander should exist in AI player action catalog')
    assert.ok(worldScoutCatalogEntry, 'world_scout should exist in AI player action catalog')
    assert.ok(marchMoveCatalogEntry, 'march_move should exist in AI player action catalog')
    assert.ok(garrisonSetCatalogEntry, 'garrison_set should exist in AI player action catalog')
    assert.ok(troopFacilityUpgradeCatalogEntry, 'troop_facility_upgrade should exist in AI player action catalog')
    assert.ok(generalFocusSetCatalogEntry, 'general_focus_set should exist in AI player action catalog')
    assert.ok(formationAssignCatalogEntry, 'formation_assign should exist in AI player action catalog')
    assert.ok(threatEscapeCatalogEntry, 'threat_escape should exist in AI player action catalog')
    assert.ok(allianceHelpCatalogEntry, 'alliance_help should exist in AI player action catalog')
    assert.ok(rewardClaimCatalogEntry, 'reward_claim should exist in AI player action catalog')
    assert.equal(cityUpgradeCatalogEntry.executableInV1, true, 'city_upgrade should be executable in v1')
    assert.equal(buildingUpgradeCatalogEntry.executableInV1, true, 'building_upgrade should be executable in v1')
    assert.equal(queueFillIdleSlotCatalogEntry.executableInV1, true, 'queue_fill_idle_slot should be executable in v1')
    assert.equal(researchStartCatalogEntry.executableInV1, true, 'research_start should be executable in v1')
    assert.equal(troopTrainCatalogEntry.executableInV1, true, 'troop_train should be executable in v1')
    assert.equal(recruitPoolSelectCatalogEntry.executableInV1, true, 'recruit_pool_select should be executable in v1')
    assert.equal(recruitCommanderCatalogEntry.executableInV1, true, 'recruit_commander should be executable in v1')
    assert.equal(worldScoutCatalogEntry.executableInV1, true, 'world_scout should be executable in v1')
    assert.equal(marchMoveCatalogEntry.executableInV1, true, 'march_move should be executable in v1')
    assert.equal(garrisonSetCatalogEntry.executableInV1, true, 'garrison_set should be executable in v1')
    assert.equal(troopFacilityUpgradeCatalogEntry.executableInV1, true, 'troop_facility_upgrade should be executable in v1')
    assert.equal(generalFocusSetCatalogEntry.executableInV1, true, 'general_focus_set should be executable in v1')
    assert.equal(formationAssignCatalogEntry.executableInV1, true, 'formation_assign should be executable in v1')
    assert.equal(threatEscapeCatalogEntry.executableInV1, true, 'threat_escape should be executable in v1')
    assert.equal(allianceHelpCatalogEntry.executableInV1, true, 'alliance_help should be executable in v1')
    assert.equal(rewardClaimCatalogEntry.executableInV1, true, 'reward_claim should be executable in v1')
    assert.equal(cityUpgradeCatalogEntry.mappedWorldAction, 'upgradeCity', 'city_upgrade should map to upgradeCity')
    assert.equal(buildingUpgradeCatalogEntry.mappedWorldAction, 'promoteCityBuilding', 'building_upgrade should map to promoteCityBuilding')
    assert.equal(queueFillIdleSlotCatalogEntry.mappedWorldAction, 'enqueueAffair', 'queue_fill_idle_slot should map to enqueueAffair')
    assert.equal(researchStartCatalogEntry.mappedWorldAction, 'upgradeCityTech', 'research_start should map to upgradeCityTech')
    assert.equal(troopTrainCatalogEntry.mappedWorldAction, 'deployReserveHero', 'troop_train should map to deployReserveHero')
    assert.equal(recruitPoolSelectCatalogEntry.mappedWorldAction, 'setRecruitSelectedPool', 'recruit_pool_select should map to setRecruitSelectedPool')
    assert.equal(recruitCommanderCatalogEntry.mappedWorldAction, 'recruitProspectHero', 'recruit_commander should map to recruitProspectHero')
    assert.equal(worldScoutCatalogEntry.mappedWorldAction, 'queuePlanExecution', 'world_scout should map to queuePlanExecution')
    assert.equal(marchMoveCatalogEntry.mappedWorldAction, 'moveUnit', 'march_move should map to moveUnit')
    assert.equal(garrisonSetCatalogEntry.mappedWorldAction, 'queueTacticalOverride', 'garrison_set should map to queueTacticalOverride')
    assert.equal(troopFacilityUpgradeCatalogEntry.mappedWorldAction, 'promoteTroopFacilityBuilding', 'troop_facility_upgrade should map to promoteTroopFacilityBuilding')
    assert.equal(generalFocusSetCatalogEntry.mappedWorldAction, 'setGeneralActiveHero', 'general_focus_set should map to setGeneralActiveHero')
    assert.equal(formationAssignCatalogEntry.mappedWorldAction, 'setGeneralTactic', 'formation_assign should map to setGeneralTactic')
    assert.equal(threatEscapeCatalogEntry.mappedWorldAction, 'queueAiAgendaAction', 'threat_escape should map to queueAiAgendaAction')
    assert.equal(allianceHelpCatalogEntry.mappedWorldAction, 'allianceHelp', 'alliance_help should map to allianceHelp')
    assert.equal(rewardClaimCatalogEntry.mappedWorldAction, 'claimReward', 'reward_claim should map to claimReward')

    const worldBeforeActions = await loadWorldState(baseUrl)
    const moveCandidate = resolveMoveCandidate(worldBeforeActions, 'player')
    const garrisonCandidate = resolveGarrisonCandidate(worldBeforeActions, 'player')
    const scoutCandidate = resolveScoutCandidate(worldBeforeActions, 'player')
    const researchTechId = resolveResearchTrack(worldBeforeActions, 'player')

    const registerAlpha = await requestJson(baseUrl, '/api/ai/players', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      displayName: 'Player Operator Alpha',
      governorPlayerId: 'human_alpha',
      factionId: 'player',
      actionWhitelist: [
        'city_upgrade',
        'building_upgrade',
        'queue_fill_idle_slot',
        'research_start',
        'troop_train',
        'recruit_pool_select',
        'recruit_commander',
        'world_scout',
        'march_move',
        'garrison_set',
        'troop_facility_upgrade',
        'general_focus_set',
        'formation_assign',
        'threat_escape',
        'alliance_help',
        'reward_claim',
        'battle_report_read',
      ],
    })
    assert.equal(registerAlpha.status, 200, `register alpha failed: ${JSON.stringify(registerAlpha.data)}`)

    const registerBeta = await requestJson(baseUrl, '/api/ai/players', 'POST', {
      aiPlayerId: 'player_operator_beta',
      displayName: 'Player Operator Beta',
      governorPlayerId: 'human_alpha',
      factionId: 'player',
      actionWhitelist: [
        'city_upgrade',
        'building_upgrade',
        'queue_fill_idle_slot',
        'research_start',
        'troop_train',
        'recruit_pool_select',
        'recruit_commander',
        'world_scout',
        'march_move',
        'garrison_set',
        'troop_facility_upgrade',
        'general_focus_set',
        'formation_assign',
        'threat_escape',
        'alliance_help',
        'reward_claim',
        'battle_report_read',
      ],
    })
    assert.equal(registerBeta.status, 200, `register beta failed: ${JSON.stringify(registerBeta.data)}`)

    const listPlayers = await requestJson(
      baseUrl,
      '/api/ai/players?governorPlayerId=human_alpha',
      'GET',
    )
    assert.equal(listPlayers.status, 200, `list players failed: ${JSON.stringify(listPlayers.data)}`)
    const listPayload = readObject(listPlayers.data)
    const players = readArray(listPayload.items)
    assert.equal(players.length, 2, 'one human governor should be able to own two governed AI players')
    const playerAlphaRuntime = players.map((item) => readObject(item)).find((item) => item.aiPlayerId === 'player_operator_alpha')
    assert.ok(playerAlphaRuntime, 'runtime list should include alpha AI player')
    assert.equal(playerAlphaRuntime.autonomyLevel, 'L1_assigned', 'AI player runtime should reflect SessionManager authority')
    assert.equal(playerAlphaRuntime.controlMode, 'human_assigned', 'AI player runtime should derive control mode from session authority')
    assert.equal(playerAlphaRuntime.governorOnline, true, 'runtime should detect online governor through session roster')

    const pauseBeta = await requestJson(baseUrl, '/api/ai/players/player_operator_beta/pause', 'POST', {
      updatedBy: 'human_alpha',
    })
    assert.equal(pauseBeta.status, 200, `pause beta failed: ${JSON.stringify(pauseBeta.data)}`)
    const pausedPlayer = readObject(readObject(pauseBeta.data).player)
    assert.equal(pausedPlayer.paused, true, 'pause route should persist paused flag')

    const resumeBeta = await requestJson(baseUrl, '/api/ai/players/player_operator_beta/resume', 'POST', {
      updatedBy: 'human_alpha',
    })
    assert.equal(resumeBeta.status, 200, `resume beta failed: ${JSON.stringify(resumeBeta.data)}`)
    const resumedPlayer = readObject(readObject(resumeBeta.data).player)
    assert.equal(resumedPlayer.paused, false, 'resume route should clear paused flag')

    const runtimeBeforeProposal = await requestJson(baseUrl, '/api/ai/players/player_operator_alpha', 'GET')
    assert.equal(runtimeBeforeProposal.status, 200, 'get ai player runtime should return 200')
    const runtimeBeforeProposalPayload = readObject(runtimeBeforeProposal.data)
    const runtimeBudget = readObject(runtimeBeforeProposalPayload.budget)
    assert.ok(typeof runtimeBudget.actionPointsRemaining === 'number', 'runtime should expose actionPointsRemaining')
    assert.ok(runtimeBudget.aiQuota === null || typeof readObject(runtimeBudget.aiQuota).currentQuota === 'number', 'runtime should expose aiQuota snapshot')
    const runtimeObservability = readObject(runtimeBeforeProposalPayload.observability)
    const runtimePersistence = readObject(runtimeBeforeProposalPayload.persistence)
    assert.equal(runtimeObservability.factionId, 'player', 'runtime detail should expose faction-scoped observability')
    assert.ok(Array.isArray(runtimeObservability.recentEventActions), 'runtime detail should expose recent event actions')
    assert.equal(runtimePersistence.path, aiPlayerPersistPath, 'runtime detail should expose governance persist path')

    const invalidResearchProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'research_start',
      source: 'mcp',
      reason: 'Reject invalid research args before proposal persistence',
      args: {
        techId: 'invalid_track',
      },
    })
    assert.equal(invalidResearchProposal.status, 422, 'research_start should reject unsupported techId at request validation time')

    const invalidBuildingProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'building_upgrade',
      source: 'mcp',
      reason: 'Reject invalid building group before proposal persistence',
      args: {
        groupId: 'invalid_group',
      },
    })
    assert.equal(invalidBuildingProposal.status, 422, 'building_upgrade should reject unsupported groupId at request validation time')

    const invalidQueueProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'queue_fill_idle_slot',
      source: 'mcp',
      reason: 'Reject invalid queue group before proposal persistence',
      args: {
        groupId: 'invalid_group',
      },
    })
    assert.equal(invalidQueueProposal.status, 422, 'queue_fill_idle_slot should reject unsupported groupId at request validation time')

    const invalidMoveProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'march_move',
      source: 'mcp',
      reason: 'Reject invalid march args before proposal persistence',
      args: {
        unitId: 123,
        targetTileId: moveCandidate.targetTileId,
      },
    })
    assert.equal(invalidMoveProposal.status, 422, 'march_move should reject non-string unitId at request validation time')

    const invalidScoutProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'world_scout',
      source: 'mcp',
      reason: 'Reject invalid world_scout args before proposal persistence',
      args: {
        targetTileId: 123,
      },
    })
    assert.equal(invalidScoutProposal.status, 422, 'world_scout should reject non-string targetTileId at request validation time')

    const invalidTroopTrainProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'troop_train',
      source: 'mcp',
      reason: 'Reject invalid troop_train args before proposal persistence',
      args: {
        heroId: 123,
      },
    })
    assert.equal(invalidTroopTrainProposal.status, 422, 'troop_train should reject non-string heroId at request validation time')

    const invalidTroopFacilityUpgradeProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'troop_facility_upgrade',
      source: 'mcp',
      reason: 'Reject invalid troop_facility_upgrade args before proposal persistence',
      args: {
        buildingId: 'invalid_building',
      },
    })
    assert.equal(
      invalidTroopFacilityUpgradeProposal.status,
      422,
      'troop_facility_upgrade should reject unsupported buildingId at request validation time',
    )

    const invalidRecruitPoolSelectProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'recruit_pool_select',
      source: 'mcp',
      reason: 'Reject invalid recruit_pool_select args before proposal persistence',
      args: {
        poolId: 'invalid_pool',
      },
    })
    assert.equal(
      invalidRecruitPoolSelectProposal.status,
      422,
      'recruit_pool_select should reject unsupported poolId at request validation time',
    )

    const invalidRecruitProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'recruit_commander',
      source: 'mcp',
      reason: 'Reject invalid recruit count before proposal persistence',
      args: {
        count: 0,
      },
    })
    assert.equal(invalidRecruitProposal.status, 422, 'recruit_commander should reject out-of-range count at request validation time')

    const invalidGarrisonProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'garrison_set',
      source: 'mcp',
      reason: 'Reject invalid garrison summary before proposal persistence',
      args: {
        summary: 123,
      },
    })
    assert.equal(invalidGarrisonProposal.status, 422, 'garrison_set should reject non-string summary at request validation time')

    const invalidGeneralFocusSetProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'general_focus_set',
      source: 'mcp',
      reason: 'Reject invalid general_focus_set args before proposal persistence',
      args: {
        heroId: 123,
      },
    })
    assert.equal(invalidGeneralFocusSetProposal.status, 422, 'general_focus_set should reject non-string heroId at request validation time')

    const invalidFormationAssignProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'formation_assign',
      source: 'mcp',
      reason: 'Reject invalid formation_assign args before proposal persistence',
      args: {
        tacticId: 'invalid_tactic',
      },
    })
    assert.equal(invalidFormationAssignProposal.status, 422, 'formation_assign should reject unsupported tacticId at request validation time')

    const invalidThreatEscapeProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'threat_escape',
      source: 'mcp',
      reason: 'Reject invalid threat_escape args before proposal persistence',
      args: {
        mode: 'invalid_mode',
      },
    })
    assert.equal(invalidThreatEscapeProposal.status, 422, 'threat_escape should reject unsupported mode at request validation time')

    const invalidAllianceHelpProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'alliance_help',
      source: 'mcp',
      reason: 'Reject invalid alliance_help args before proposal persistence',
      args: {
        regionId: 123,
      },
    })
    assert.equal(invalidAllianceHelpProposal.status, 422, 'alliance_help should reject non-string regionId at request validation time')

    const invalidRewardClaimProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'reward_claim',
      source: 'mcp',
      reason: 'Reject invalid reward_claim args before proposal persistence',
      args: {
        rewardId: 123,
      },
    })
    assert.equal(invalidRewardClaimProposal.status, 422, 'reward_claim should reject non-string rewardId at request validation time')

    const invalidIntelProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'battle_report_read',
      source: 'mcp',
      reason: 'Reject stray args for non-executable empty-args action',
      args: {
        unexpected: 'field',
      },
    })
    assert.equal(invalidIntelProposal.status, 422, 'non-executable empty-args actions should reject stray args during request validation')

    const worldBeforeRecruitSuccess = await loadWorldState(baseUrl)
    const factionBeforeRecruitSuccess = worldBeforeRecruitSuccess.factions.player
    assert.ok(factionBeforeRecruitSuccess, 'player faction should exist before recruit success')
    const recruitArgs = {
      poolId: 'pool_standard',
      count: 1,
    } as const

    const createRecruitSuccessProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'recruit_commander',
      source: 'mcp',
      reason: 'Formal AI player recruit success smoke test',
      args: recruitArgs,
    })
    assert.equal(createRecruitSuccessProposal.status, 200, `create recruit success proposal failed: ${JSON.stringify(createRecruitSuccessProposal.data)}`)
    const recruitSuccessProposal = readObject(readObject(createRecruitSuccessProposal.data).proposal)
    const recruitSuccessProposalId = String(recruitSuccessProposal.proposalId)
    assert.deepEqual(recruitSuccessProposal.args, recruitArgs, 'recruit_commander should preserve action-specific args for success samples')

    const approveRecruitSuccessProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${recruitSuccessProposalId}/approve`, 'POST', {
      approvedBy: 'human_alpha',
    })
    assert.equal(approveRecruitSuccessProposal.status, 200, `approve recruit success proposal failed: ${JSON.stringify(approveRecruitSuccessProposal.data)}`)

    const executeRecruitSuccessProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${recruitSuccessProposalId}/execute`, 'POST', {
      executedBy: 'human_alpha',
      includeWorld: false,
    }, 60_000)
    assert.equal(executeRecruitSuccessProposal.status, 200, `execute recruit success proposal failed: ${JSON.stringify(executeRecruitSuccessProposal.data)}`)
    const executedRecruitSuccessProposal = readObject(readObject(executeRecruitSuccessProposal.data).proposal)
    const recruitSuccessReceipt = readObject(readObject(executeRecruitSuccessProposal.data).receipt)
    assert.equal(executedRecruitSuccessProposal.status, 'executed', `recruit_commander should expose a baseline success sample: ${JSON.stringify(executeRecruitSuccessProposal.data)}`)
    assert.equal(recruitSuccessReceipt.ok, true, `recruit success receipt should report success: ${JSON.stringify(executeRecruitSuccessProposal.data)}`)
    assert.equal(recruitSuccessReceipt.worldAction, 'recruitProspectHero', 'recruit success receipt should preserve mapped world action')

    const worldAfterRecruitSuccess = await loadWorldState(baseUrl)
    const factionAfterRecruitSuccess = worldAfterRecruitSuccess.factions.player
    assert.ok(factionAfterRecruitSuccess, 'player faction should exist after recruit success')
    assert.equal(
      factionAfterRecruitSuccess.heroCommand.rosterHeroIds.length,
      factionBeforeRecruitSuccess.heroCommand.rosterHeroIds.length + 1,
      'recruit_commander baseline success should add one hero to roster',
    )
    assert.equal(
      factionAfterRecruitSuccess.heroCommand.reserveHeroIds.length,
      factionBeforeRecruitSuccess.heroCommand.reserveHeroIds.length + 1,
      'recruit_commander baseline success should add one hero to reserve',
    )
    assert.equal(
      factionAfterRecruitSuccess.heroCommand.prospectHeroIds.length,
      Math.max(0, factionBeforeRecruitSuccess.heroCommand.prospectHeroIds.length - 1),
      'recruit_commander baseline success should consume one prospect hero',
    )
    const recruitedHeroId = factionAfterRecruitSuccess.heroCommand.reserveHeroIds.find(
      (heroId) => !factionBeforeRecruitSuccess.heroCommand.reserveHeroIds.includes(heroId),
    )
    assert.ok(recruitedHeroId, 'recruit_commander baseline success should surface a newly reserved hero')

    const createRecruitFailureProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'recruit_commander',
      source: 'mcp',
      reason: 'Formal AI player recruit failure smoke test after baseline success',
      args: recruitArgs,
    })
    assert.equal(createRecruitFailureProposal.status, 200, `create recruit failure proposal failed: ${JSON.stringify(createRecruitFailureProposal.data)}`)
    const recruitFailureProposal = readObject(readObject(createRecruitFailureProposal.data).proposal)
    const recruitFailureProposalId = String(recruitFailureProposal.proposalId)

    const approveRecruitFailureProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${recruitFailureProposalId}/approve`, 'POST', {
      approvedBy: 'human_alpha',
    })
    assert.equal(approveRecruitFailureProposal.status, 200, `approve recruit failure proposal failed: ${JSON.stringify(approveRecruitFailureProposal.data)}`)

    const executeRecruitFailureProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${recruitFailureProposalId}/execute`, 'POST', {
      executedBy: 'human_alpha',
      includeWorld: false,
    }, 60_000)
    assert.equal(executeRecruitFailureProposal.status, 200, `execute recruit failure proposal failed: ${JSON.stringify(executeRecruitFailureProposal.data)}`)
    const executedRecruitFailureProposal = readObject(readObject(executeRecruitFailureProposal.data).proposal)
    const recruitFailureReceipt = readObject(readObject(executeRecruitFailureProposal.data).receipt)
    assert.equal(executedRecruitFailureProposal.status, 'failed', 'recruit_commander should keep a structured failure sample after baseline success')
    assert.equal(recruitFailureReceipt.ok, false, `recruit failure receipt should surface structured failure after baseline success: ${JSON.stringify(executeRecruitFailureProposal.data)}`)
    assert.equal(recruitFailureReceipt.worldAction, 'recruitProspectHero', 'recruit failure receipt should preserve mapped world action')
    assert.equal(
      recruitFailureReceipt.message,
      'Development points are insufficient for the requested recruit draw.',
      'recruit failure sample should reflect insufficient development points after the baseline success draw',
    )

    const worldBeforeRecruitPoolSelect = await loadWorldState(baseUrl)
    const recruitPoolSelectCandidate = resolveRecruitPoolSelectCandidate(worldBeforeRecruitPoolSelect, 'player')
    const createRecruitPoolSelectProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'recruit_pool_select',
      source: 'mcp',
      reason: 'Formal AI player recruit pool authority smoke test',
      args: {
        poolId: recruitPoolSelectCandidate.poolId,
      },
    })
    assert.equal(
      createRecruitPoolSelectProposal.status,
      200,
      `create recruit_pool_select proposal failed: ${JSON.stringify(createRecruitPoolSelectProposal.data)}`,
    )
    const recruitPoolSelectProposal = readObject(readObject(createRecruitPoolSelectProposal.data).proposal)
    const recruitPoolSelectProposalId = String(recruitPoolSelectProposal.proposalId)
    assert.deepEqual(
      recruitPoolSelectProposal.args,
      {
        poolId: recruitPoolSelectCandidate.poolId,
      },
      'recruit_pool_select should preserve action-specific args',
    )

    const approveRecruitPoolSelectProposal = await requestJson(
      baseUrl,
      `/api/ai/players/proposals/${recruitPoolSelectProposalId}/approve`,
      'POST',
      {
        approvedBy: 'human_alpha',
      },
    )
    assert.equal(
      approveRecruitPoolSelectProposal.status,
      200,
      `approve recruit_pool_select proposal failed: ${JSON.stringify(approveRecruitPoolSelectProposal.data)}`,
    )

    const executeRecruitPoolSelectProposal = await requestJson(
      baseUrl,
      `/api/ai/players/proposals/${recruitPoolSelectProposalId}/execute`,
      'POST',
      {
        executedBy: 'human_alpha',
        includeWorld: false,
      },
      60_000,
    )
    assert.equal(
      executeRecruitPoolSelectProposal.status,
      200,
      `execute recruit_pool_select proposal failed: ${JSON.stringify(executeRecruitPoolSelectProposal.data)}`,
    )
    const recruitPoolSelectReceipt = readObject(readObject(executeRecruitPoolSelectProposal.data).receipt)
    assert.equal(
      recruitPoolSelectReceipt.ok,
      true,
      `recruit_pool_select receipt should report success: ${JSON.stringify(executeRecruitPoolSelectProposal.data)}`,
    )
    assert.equal(
      recruitPoolSelectReceipt.worldAction,
      'setRecruitSelectedPool',
      'recruit_pool_select receipt should preserve mapped world action',
    )
    assert.ok(
      typeof recruitPoolSelectReceipt.actionRequestId === 'string' && recruitPoolSelectReceipt.actionRequestId.length > 0,
      'recruit_pool_select should return a formal execution requestId',
    )
    assert.deepEqual(
      recruitPoolSelectReceipt.worldActionPayload,
      {
        factionId: 'player',
        poolId: recruitPoolSelectCandidate.poolId,
      },
      'recruit_pool_select should surface the resolved pool payload in receipt',
    )
    const recruitPoolSelectExecution = readObject(recruitPoolSelectReceipt.execution)
    assert.equal(
      recruitPoolSelectExecution.status,
      'idle',
      'recruit_pool_select execution snapshot should stay idle after pure recruit authority writes',
    )
    assert.equal(
      Number(recruitPoolSelectExecution.activeOrderCount),
      0,
      'recruit_pool_select should not enqueue execution orders',
    )
    assert.equal(
      Number(recruitPoolSelectExecution.actionPointsRemaining),
      recruitPoolSelectCandidate.actionPoints,
      'recruit_pool_select execution snapshot should preserve current AP because the authority write does not spend AP',
    )

    const worldAfterRecruitPoolSelect = await loadWorldState(baseUrl)
    assert.equal(
      worldAfterRecruitPoolSelect.slgDomainState?.recruitStateByFaction?.player?.selectedPoolId,
      recruitPoolSelectCandidate.poolId,
      'recruit_pool_select should update the authoritative selectedPoolId',
    )
    if (
      recruitPoolSelectCandidate.previousPoolId &&
      recruitPoolSelectCandidate.previousPoolId !== recruitPoolSelectCandidate.poolId
    ) {
      assert.notEqual(
        worldAfterRecruitPoolSelect.slgDomainState?.recruitStateByFaction?.player?.selectedPoolId,
        recruitPoolSelectCandidate.previousPoolId,
        'recruit_pool_select should move authority away from the previous selected pool when a different pool is requested',
      )
    }

    await ensureFactionBudget(baseUrl, 'player', 2, 0, 'world scout')
    const createScoutProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'world_scout',
      source: 'mcp',
      reason: 'Formal AI player scout smoke test',
      args: scoutCandidate,
    })
    assert.equal(createScoutProposal.status, 200, `create scout proposal failed: ${JSON.stringify(createScoutProposal.data)}`)
    const scoutProposal = readObject(readObject(createScoutProposal.data).proposal)
    const scoutProposalId = String(scoutProposal.proposalId)
    assert.deepEqual(scoutProposal.args, scoutCandidate, 'world_scout should preserve action-specific args')
    assert.equal(scoutProposal.status, 'pending_approval', 'world_scout should respect the current approval policy in v1')

    const approveScoutProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${scoutProposalId}/approve`, 'POST', {
      approvedBy: 'human_alpha',
    })
    assert.equal(approveScoutProposal.status, 200, `approve scout proposal failed: ${JSON.stringify(approveScoutProposal.data)}`)

    const executeScoutProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${scoutProposalId}/execute`, 'POST', {
      executedBy: 'human_alpha',
      includeWorld: false,
    }, 60_000)
    assert.equal(executeScoutProposal.status, 200, `execute scout proposal failed: ${JSON.stringify(executeScoutProposal.data)}`)
    const scoutReceipt = readObject(readObject(executeScoutProposal.data).receipt)
    assert.equal(scoutReceipt.ok, true, `world_scout receipt should report success: ${JSON.stringify(executeScoutProposal.data)}`)
    assert.equal(scoutReceipt.worldAction, 'queuePlanExecution', 'world_scout receipt should preserve mapped world action')
    assert.ok(typeof scoutReceipt.actionRequestId === 'string' && scoutReceipt.actionRequestId.length > 0, 'world_scout should return a formal execution requestId')
    const scoutExecution = readObject(scoutReceipt.execution)
    assert.equal(scoutExecution.status, 'queued', 'world_scout should expose queued execution snapshot before advance tick')
    assert.ok(Number(scoutExecution.activeOrderCount) >= 1, 'world_scout execution snapshot should expose active orders')

    const advanceScoutExecution = await requestJson(
      baseUrl,
      '/api/world/action?includeWorld=false',
      'POST',
      { action: 'advanceTick' },
      60_000,
    )
    assert.equal(advanceScoutExecution.status, 200, `advance tick after scout failed: ${JSON.stringify(advanceScoutExecution.data)}`)
    assert.equal(
      readObject(advanceScoutExecution.data).ok,
      true,
      `advance tick after scout should succeed: ${JSON.stringify(advanceScoutExecution.data)}`,
    )

    const clearScoutExecution = await requestJson(
      baseUrl,
      '/api/world/action?includeWorld=false',
      'POST',
      { action: 'clearPlanExecution', payload: { factionId: 'player' } },
      60_000,
    )
    assert.equal(clearScoutExecution.status, 200, `clear scout execution failed: ${JSON.stringify(clearScoutExecution.data)}`)
    assert.equal(
      readObject(clearScoutExecution.data).ok,
      true,
      `clear scout execution should succeed: ${JSON.stringify(clearScoutExecution.data)}`,
    )

    const createResearchProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'research_start',
      source: 'mcp',
      reason: 'Formal AI player research smoke test',
      args: {
        techId: researchTechId,
      },
    })
    assert.equal(createResearchProposal.status, 200, `create research proposal failed: ${JSON.stringify(createResearchProposal.data)}`)
    const researchProposal = readObject(readObject(createResearchProposal.data).proposal)
    const researchProposalId = String(researchProposal.proposalId)
    assert.equal(researchProposal.status, 'pending_approval', 'research_start should require approval in v1')
    assert.deepEqual(researchProposal.args, { techId: researchTechId }, 'research_start should preserve action-specific args')

    const approveResearchProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${researchProposalId}/approve`, 'POST', {
      approvedBy: 'human_alpha',
    })
    assert.equal(approveResearchProposal.status, 200, `approve research proposal failed: ${JSON.stringify(approveResearchProposal.data)}`)

    const executeResearchProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${researchProposalId}/execute`, 'POST', {
      executedBy: 'human_alpha',
      includeWorld: false,
    }, 60_000)
    assert.equal(executeResearchProposal.status, 200, `execute research proposal failed: ${JSON.stringify(executeResearchProposal.data)}`)
    const researchReceipt = readObject(readObject(executeResearchProposal.data).receipt)
    assert.equal(researchReceipt.ok, true, `research receipt should report success: ${JSON.stringify(executeResearchProposal.data)}`)
    assert.equal(researchReceipt.worldAction, 'upgradeCityTech', 'research_start receipt should preserve mapped world action')

    const createBuildingProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'building_upgrade',
      source: 'mcp',
      reason: 'Formal AI player building upgrade smoke test',
    })
    assert.equal(createBuildingProposal.status, 200, `create building proposal failed: ${JSON.stringify(createBuildingProposal.data)}`)
    const buildingProposal = readObject(readObject(createBuildingProposal.data).proposal)
    const buildingProposalId = String(buildingProposal.proposalId)
    assert.deepEqual(buildingProposal.args, {}, 'building_upgrade should normalize omitted args to an empty action-specific object')

    const approveBuildingProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${buildingProposalId}/approve`, 'POST', {
      approvedBy: 'human_alpha',
    })
    assert.equal(approveBuildingProposal.status, 200, `approve building proposal failed: ${JSON.stringify(approveBuildingProposal.data)}`)

    const executeBuildingProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${buildingProposalId}/execute`, 'POST', {
      executedBy: 'human_alpha',
      includeWorld: false,
    }, 60_000)
    assert.equal(executeBuildingProposal.status, 200, `execute building proposal failed: ${JSON.stringify(executeBuildingProposal.data)}`)
    const buildingReceipt = readObject(readObject(executeBuildingProposal.data).receipt)
    assert.equal(buildingReceipt.ok, true, `building receipt should report success: ${JSON.stringify(executeBuildingProposal.data)}`)
    assert.equal(buildingReceipt.worldAction, 'promoteCityBuilding', 'building_upgrade receipt should preserve mapped world action')

    const createQueueProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'queue_fill_idle_slot',
      source: 'mcp',
      reason: 'Formal AI player city affair smoke test',
    })
    assert.equal(createQueueProposal.status, 200, `create queue proposal failed: ${JSON.stringify(createQueueProposal.data)}`)
    const queueProposal = readObject(readObject(createQueueProposal.data).proposal)
    const queueProposalId = String(queueProposal.proposalId)
    assert.deepEqual(queueProposal.args, {}, 'queue_fill_idle_slot should normalize omitted args to an empty action-specific object')
    assert.equal(queueProposal.status, 'pending_approval', 'queue_fill_idle_slot should require explicit approval in v1')

    const approveQueueProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${queueProposalId}/approve`, 'POST', {
      approvedBy: 'human_alpha',
    })
    assert.equal(approveQueueProposal.status, 200, `approve queue proposal failed: ${JSON.stringify(approveQueueProposal.data)}`)

    const executeQueueProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${queueProposalId}/execute`, 'POST', {
      executedBy: 'human_alpha',
      includeWorld: false,
    }, 60_000)
    assert.equal(executeQueueProposal.status, 200, `execute queue proposal failed: ${JSON.stringify(executeQueueProposal.data)}`)
    const queueReceipt = readObject(readObject(executeQueueProposal.data).receipt)
    assert.equal(queueReceipt.ok, true, `queue receipt should report success: ${JSON.stringify(executeQueueProposal.data)}`)
    assert.equal(queueReceipt.worldAction, 'enqueueAffair', 'queue_fill_idle_slot receipt should preserve mapped world action')

    const createGarrisonProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'garrison_set',
      source: 'mcp',
      reason: 'Formal AI player garrison smoke test',
      args: {
        unitId: garrisonCandidate.unitId,
        targetTileId: garrisonCandidate.targetTileId,
      },
    })
    assert.equal(createGarrisonProposal.status, 200, `create garrison proposal failed: ${JSON.stringify(createGarrisonProposal.data)}`)
    const garrisonProposal = readObject(readObject(createGarrisonProposal.data).proposal)
    const garrisonProposalId = String(garrisonProposal.proposalId)
    assert.deepEqual(
      garrisonProposal.args,
      garrisonCandidate,
      'garrison_set should preserve action-specific args',
    )

    const executableMoveCandidate = await ensureMoveReady(baseUrl, 'player')
    const createMoveProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'march_move',
      source: 'mcp',
      reason: 'Formal AI player move smoke test',
      args: executableMoveCandidate,
    })
    assert.equal(createMoveProposal.status, 200, `create move proposal failed: ${JSON.stringify(createMoveProposal.data)}`)
    const moveProposal = readObject(readObject(createMoveProposal.data).proposal)
    const moveProposalId = String(moveProposal.proposalId)
    assert.deepEqual(moveProposal.args, executableMoveCandidate, 'march_move should preserve action-specific args')

    const approveMoveProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${moveProposalId}/approve`, 'POST', {
      approvedBy: 'human_alpha',
    })
    assert.equal(approveMoveProposal.status, 200, `approve move proposal failed: ${JSON.stringify(approveMoveProposal.data)}`)

    const executeMoveProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${moveProposalId}/execute`, 'POST', {
      executedBy: 'human_alpha',
      includeWorld: false,
    }, 60_000)
    assert.equal(executeMoveProposal.status, 200, `execute move proposal failed: ${JSON.stringify(executeMoveProposal.data)}`)
    const moveReceipt = readObject(readObject(executeMoveProposal.data).receipt)
    assert.equal(moveReceipt.ok, true, `move receipt should report success: ${JSON.stringify(executeMoveProposal.data)}`)
    assert.equal(moveReceipt.worldAction, 'moveUnit', 'march_move receipt should preserve mapped world action')

    const clearBeforeTroopTrain = await requestJson(
      baseUrl,
      '/api/world/action?includeWorld=false',
      'POST',
      { action: 'clearPlanExecution', payload: { factionId: 'player' } },
      60_000,
    )
    assert.equal(clearBeforeTroopTrain.status, 200, `clear plan before troop train failed: ${JSON.stringify(clearBeforeTroopTrain.data)}`)
    assert.equal(
      readObject(clearBeforeTroopTrain.data).ok,
      true,
      `clear plan before troop train should succeed: ${JSON.stringify(clearBeforeTroopTrain.data)}`,
    )

    await ensureFactionBudget(baseUrl, 'player', 1, 0, 'alliance help')
    const worldBeforeAllianceHelp = await loadWorldState(baseUrl)
    const allianceHelpCandidate = resolveAllianceHelpCandidate(worldBeforeAllianceHelp, 'player')
    const createAllianceHelpProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'alliance_help',
      source: 'mcp',
      reason: 'Formal AI player alliance help smoke test',
    })
    assert.equal(createAllianceHelpProposal.status, 200, `create alliance_help proposal failed: ${JSON.stringify(createAllianceHelpProposal.data)}`)
    const allianceHelpProposal = readObject(readObject(createAllianceHelpProposal.data).proposal)
    const allianceHelpProposalId = String(allianceHelpProposal.proposalId)
    assert.deepEqual(allianceHelpProposal.args, {}, 'alliance_help should normalize omitted args to an empty action-specific object')
    assert.equal(allianceHelpProposal.status, 'pending_approval', 'alliance_help should respect the current approval policy in v1')

    const approveAllianceHelpProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${allianceHelpProposalId}/approve`, 'POST', {
      approvedBy: 'human_alpha',
    })
    assert.equal(approveAllianceHelpProposal.status, 200, `approve alliance_help proposal failed: ${JSON.stringify(approveAllianceHelpProposal.data)}`)

    const executeAllianceHelpProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${allianceHelpProposalId}/execute`, 'POST', {
      executedBy: 'human_alpha',
      includeWorld: false,
    }, 60_000)
    assert.equal(executeAllianceHelpProposal.status, 200, `execute alliance_help proposal failed: ${JSON.stringify(executeAllianceHelpProposal.data)}`)
    const allianceHelpReceipt = readObject(readObject(executeAllianceHelpProposal.data).receipt)
    assert.equal(allianceHelpReceipt.ok, true, `alliance_help receipt should report success: ${JSON.stringify(executeAllianceHelpProposal.data)}`)
    assert.equal(allianceHelpReceipt.worldAction, 'allianceHelp', 'alliance_help receipt should preserve mapped world action')
    assert.ok(
      typeof allianceHelpReceipt.actionRequestId === 'string' && allianceHelpReceipt.actionRequestId.length > 0,
      'alliance_help should return a formal execution requestId',
    )
    const allianceHelpExecution = readObject(allianceHelpReceipt.execution)
    assert.equal(
      Number(allianceHelpExecution.actionPointsRemaining),
      Math.max(0, allianceHelpCandidate.actionPoints - 1),
      'alliance_help execution snapshot should reflect AP spend',
    )

    const worldAfterAllianceHelp = await loadWorldState(baseUrl)
    const directiveAfterAllianceHelp = worldAfterAllianceHelp.alliance.directives[allianceHelpCandidate.regionId]
    assert.ok(directiveAfterAllianceHelp, 'alliance_help should keep the target directive addressable')
    assert.ok(
      directiveAfterAllianceHelp.supportLevel > allianceHelpCandidate.supportLevel,
      'alliance_help should increase alliance directive support level',
    )
    const commanderAfterAllianceHelp = worldAfterAllianceHelp.alliance.commanders.find(
      (candidate) => candidate.id === allianceHelpCandidate.commanderId,
    )
    assert.ok(commanderAfterAllianceHelp, 'alliance_help should keep the target commander addressable')
    assert.ok(
      Number(commanderAfterAllianceHelp.readiness) > allianceHelpCandidate.commanderReadiness,
      'alliance_help should increase commander readiness',
    )
    assert.equal(
      worldAfterAllianceHelp.feedback.allianceActions.length,
      Math.min(8, allianceHelpCandidate.allianceActionCount + 1),
      'alliance_help should append an alliance feedback action within the capped feedback window',
    )
    assert.equal(
      worldAfterAllianceHelp.feedback.allianceActions[0]?.regionId,
      allianceHelpCandidate.regionId,
      'alliance_help feedback action should point at the helped region',
    )

    await ensureFactionBudget(baseUrl, 'player', 1, 3, 'troop train')
    const createTroopTrainProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'troop_train',
      source: 'mcp',
      reason: 'Formal AI player troop train smoke test',
    })
    assert.equal(createTroopTrainProposal.status, 200, `create troop train proposal failed: ${JSON.stringify(createTroopTrainProposal.data)}`)
    const troopTrainProposal = readObject(readObject(createTroopTrainProposal.data).proposal)
    const troopTrainProposalId = String(troopTrainProposal.proposalId)
    assert.deepEqual(troopTrainProposal.args, {}, 'troop_train should normalize omitted args to an empty action-specific object')

    const approveTroopTrainProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${troopTrainProposalId}/approve`, 'POST', {
      approvedBy: 'human_alpha',
    })
    assert.equal(approveTroopTrainProposal.status, 200, `approve troop train proposal failed: ${JSON.stringify(approveTroopTrainProposal.data)}`)

    const executeTroopTrainProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${troopTrainProposalId}/execute`, 'POST', {
      executedBy: 'human_alpha',
      includeWorld: false,
    }, 60_000)
    assert.equal(executeTroopTrainProposal.status, 200, `execute troop train proposal failed: ${JSON.stringify(executeTroopTrainProposal.data)}`)
    const troopTrainReceipt = readObject(readObject(executeTroopTrainProposal.data).receipt)
    assert.equal(troopTrainReceipt.ok, true, `troop_train receipt should report success: ${JSON.stringify(executeTroopTrainProposal.data)}`)
    assert.equal(troopTrainReceipt.worldAction, 'deployReserveHero', 'troop_train receipt should preserve mapped world action')

    await ensureFactionBudget(baseUrl, 'player', 2, 8, 'city upgrade')
    const createProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'city_upgrade',
      source: 'mcp',
      reason: 'Formal AI player upgrade smoke test',
    })
    assert.equal(createProposal.status, 200, `create proposal failed: ${JSON.stringify(createProposal.data)}`)
    const proposalPayload = readObject(createProposal.data)
    const proposal = readObject(proposalPayload.proposal)
    const proposalId = String(proposal.proposalId)
    assert.ok(proposalId.length > 0, 'proposal should return proposalId')
    assert.equal(proposal.status, 'pending_approval', 'default city_upgrade should require explicit approval in v1')
    assert.equal(proposal.executableInV1, true, 'city_upgrade proposal should be executable in v1')
    assert.deepEqual(proposal.args, {}, 'city_upgrade should normalize omitted args to an empty action-specific object')

    const listPendingProposals = await requestJson(
      baseUrl,
      '/api/ai/players/proposals?aiPlayerId=player_operator_alpha&status=pending_approval',
      'GET',
    )
    assert.equal(listPendingProposals.status, 200, 'proposal list route should return 200')
    const pendingItems = readArray(readObject(listPendingProposals.data).items)
    assert.ok(
      pendingItems.some((item) => readObject(item).proposalId === proposalId),
      'proposal list should include the pending proposal',
    )

    const approveProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${proposalId}/approve`, 'POST', {
      approvedBy: 'human_alpha',
    })
    assert.equal(approveProposal.status, 200, `approve proposal failed: ${JSON.stringify(approveProposal.data)}`)
    const approvedProposal = readObject(readObject(approveProposal.data).proposal)
    assert.equal(approvedProposal.status, 'approved', 'approve route should transition proposal to approved')

    const executeProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${proposalId}/execute`, 'POST', {
      executedBy: 'human_alpha',
      includeWorld: false,
    }, 60_000)
    assert.equal(executeProposal.status, 200, `execute proposal failed: ${JSON.stringify(executeProposal.data)}`)
    const executePayload = readObject(executeProposal.data)
    const executedProposal = readObject(executePayload.proposal)
    const receipt = readObject(executePayload.receipt)
    assert.equal(executedProposal.status, 'executed', `proposal should execute successfully: ${JSON.stringify(executeProposal.data)}`)
    assert.equal(receipt.ok, true, `receipt should report success: ${JSON.stringify(executeProposal.data)}`)
    assert.equal(receipt.worldAction, 'upgradeCity', 'receipt should preserve mapped world action')

    const approveGarrisonProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${garrisonProposalId}/approve`, 'POST', {
      approvedBy: 'human_alpha',
    })
    assert.equal(approveGarrisonProposal.status, 200, `approve garrison proposal failed: ${JSON.stringify(approveGarrisonProposal.data)}`)

    const executeGarrisonProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${garrisonProposalId}/execute`, 'POST', {
      executedBy: 'human_alpha',
      includeWorld: false,
    }, 60_000)
    assert.equal(executeGarrisonProposal.status, 200, `execute garrison proposal failed: ${JSON.stringify(executeGarrisonProposal.data)}`)
    const garrisonReceipt = readObject(readObject(executeGarrisonProposal.data).receipt)
    assert.equal(garrisonReceipt.ok, true, `garrison receipt should report success: ${JSON.stringify(executeGarrisonProposal.data)}`)
    assert.equal(garrisonReceipt.worldAction, 'queueTacticalOverride', 'garrison_set receipt should preserve mapped world action')

    await clearAllPlanExecutions(baseUrl)

    const worldBeforeRewardClaimPrep = await loadWorldState(baseUrl)
    const rewardClaimCandidate = resolveRewardClaimCandidate(worldBeforeRewardClaimPrep, 'player')
    await moveUnitAlongPath(baseUrl, worldBeforeRewardClaimPrep, 'player', rewardClaimCandidate.unitId, rewardClaimCandidate.path)

    const advanceForRewardClaim = await requestJson(
      baseUrl,
      '/api/world/action?includeWorld=false',
      'POST',
      { action: 'advanceTick' },
      60_000,
    )
    assert.equal(advanceForRewardClaim.status, 200, `advance tick for reward_claim prep failed: ${JSON.stringify(advanceForRewardClaim.data)}`)
    assert.equal(
      readObject(advanceForRewardClaim.data).ok,
      true,
      `advance tick for reward_claim prep should succeed: ${JSON.stringify(advanceForRewardClaim.data)}`,
    )

    const worldBeforeRewardClaim = await loadWorldState(baseUrl)
    const pendingReward = resolvePendingReward(worldBeforeRewardClaim, 'player', rewardClaimCandidate.node.id)
    const factionBeforeRewardClaim = worldBeforeRewardClaim.factions.player
    assert.ok(factionBeforeRewardClaim, 'player faction should exist before reward_claim')
    assert.ok(
      (factionBeforeRewardClaim.claimableRewards ?? []).some((reward) => reward.id === pendingReward.id),
      'reward_claim prep should create a pending reward instead of auto-paying immediately',
    )

    const createRewardClaimProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'reward_claim',
      source: 'mcp',
      reason: 'Formal AI player reward claim smoke test',
    })
    assert.equal(createRewardClaimProposal.status, 200, `create reward_claim proposal failed: ${JSON.stringify(createRewardClaimProposal.data)}`)
    const rewardClaimProposal = readObject(readObject(createRewardClaimProposal.data).proposal)
    const rewardClaimProposalId = String(rewardClaimProposal.proposalId)
    assert.deepEqual(rewardClaimProposal.args, {}, 'reward_claim should normalize omitted args to an empty action-specific object')
    assert.equal(rewardClaimProposal.status, 'pending_approval', 'reward_claim should respect the current approval policy in v1')

    const approveRewardClaimProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${rewardClaimProposalId}/approve`, 'POST', {
      approvedBy: 'human_alpha',
    })
    assert.equal(approveRewardClaimProposal.status, 200, `approve reward_claim proposal failed: ${JSON.stringify(approveRewardClaimProposal.data)}`)

    const executeRewardClaimProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${rewardClaimProposalId}/execute`, 'POST', {
      executedBy: 'human_alpha',
      includeWorld: false,
    }, 60_000)
    assert.equal(executeRewardClaimProposal.status, 200, `execute reward_claim proposal failed: ${JSON.stringify(executeRewardClaimProposal.data)}`)
    const rewardClaimReceipt = readObject(readObject(executeRewardClaimProposal.data).receipt)
    assert.equal(rewardClaimReceipt.ok, true, `reward_claim receipt should report success: ${JSON.stringify(executeRewardClaimProposal.data)}`)
    assert.equal(rewardClaimReceipt.worldAction, 'claimReward', 'reward_claim receipt should preserve mapped world action')
    assert.ok(
      typeof rewardClaimReceipt.actionRequestId === 'string' && rewardClaimReceipt.actionRequestId.length > 0,
      'reward_claim should return a formal execution requestId',
    )
    assert.deepEqual(
      rewardClaimReceipt.worldActionPayload,
      { factionId: 'player', rewardId: pendingReward.id },
      'reward_claim should surface the resolved reward payload in receipt',
    )
    const rewardClaimExecution = readObject(rewardClaimReceipt.execution)
    assert.equal(
      Number(rewardClaimExecution.actionPointsRemaining),
      Math.min(8, factionBeforeRewardClaim.actionPoints + pendingReward.reward.ap),
      'reward_claim execution snapshot should reflect rewarded AP',
    )

    const worldAfterRewardClaim = await loadWorldState(baseUrl)
    const factionAfterRewardClaim = worldAfterRewardClaim.factions.player
    assert.ok(factionAfterRewardClaim, 'player faction should exist after reward_claim')
    assert.equal(
      factionAfterRewardClaim.food,
      factionBeforeRewardClaim.food + pendingReward.reward.food,
      'reward_claim should grant pending food reward through AI executor',
    )
    assert.equal(
      factionAfterRewardClaim.actionPoints,
      Math.min(8, factionBeforeRewardClaim.actionPoints + pendingReward.reward.ap),
      'reward_claim should grant pending action point reward with cap through AI executor',
    )
    assert.ok(
      !(factionAfterRewardClaim.claimableRewards ?? []).some((reward) => reward.id === pendingReward.id),
      'reward_claim should remove the claimed reward from pending queue',
    )

    const worldBeforeFormationAssign = await loadWorldState(baseUrl)
    const formationAssignCandidate = resolveFormationAssignCandidate(worldBeforeFormationAssign, 'player')
    const createFormationAssignProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'formation_assign',
      source: 'mcp',
      reason: 'Formal AI player formation assign smoke test',
      args: {
        heroId: formationAssignCandidate.heroId,
        tacticId: formationAssignCandidate.tacticId,
      },
    })
    assert.equal(createFormationAssignProposal.status, 200, `create formation_assign proposal failed: ${JSON.stringify(createFormationAssignProposal.data)}`)
    const formationAssignProposal = readObject(readObject(createFormationAssignProposal.data).proposal)
    const formationAssignProposalId = String(formationAssignProposal.proposalId)
    assert.deepEqual(
      formationAssignProposal.args,
      {
        heroId: formationAssignCandidate.heroId,
        tacticId: formationAssignCandidate.tacticId,
      },
      'formation_assign should preserve action-specific args',
    )

    const approveFormationAssignProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${formationAssignProposalId}/approve`, 'POST', {
      approvedBy: 'human_alpha',
    })
    assert.equal(approveFormationAssignProposal.status, 200, `approve formation_assign proposal failed: ${JSON.stringify(approveFormationAssignProposal.data)}`)

    const executeFormationAssignProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${formationAssignProposalId}/execute`, 'POST', {
      executedBy: 'human_alpha',
      includeWorld: false,
    }, 60_000)
    assert.equal(executeFormationAssignProposal.status, 200, `execute formation_assign proposal failed: ${JSON.stringify(executeFormationAssignProposal.data)}`)
    const formationAssignReceipt = readObject(readObject(executeFormationAssignProposal.data).receipt)
    assert.equal(formationAssignReceipt.ok, true, `formation_assign receipt should report success: ${JSON.stringify(executeFormationAssignProposal.data)}`)
    assert.equal(formationAssignReceipt.worldAction, 'setGeneralTactic', 'formation_assign receipt should preserve mapped world action')
    assert.ok(
      typeof formationAssignReceipt.actionRequestId === 'string' && formationAssignReceipt.actionRequestId.length > 0,
      'formation_assign should return a formal execution requestId',
    )
    assert.deepEqual(
      formationAssignReceipt.worldActionPayload,
      {
        factionId: 'player',
        heroId: formationAssignCandidate.heroId,
        tacticId: formationAssignCandidate.tacticId,
      },
      'formation_assign should surface the resolved setGeneralTactic payload in receipt',
    )
    const formationAssignExecution = readObject(formationAssignReceipt.execution)
    assert.equal(
      Number(formationAssignExecution.actionPointsRemaining),
      formationAssignCandidate.actionPoints,
      'formation_assign execution snapshot should preserve current AP because the authority write does not spend AP',
    )

    const worldAfterFormationAssign = await loadWorldState(baseUrl)
    const playerGeneralState = worldAfterFormationAssign.slgDomainState?.generalStateByFaction?.player
    assert.ok(playerGeneralState, 'formation_assign should materialize general state for the player faction')
    assert.equal(
      playerGeneralState.tacticByHeroId?.[formationAssignCandidate.heroId],
      formationAssignCandidate.tacticId,
      'formation_assign should update the authoritative tactic map for the target hero',
    )
    assert.equal(
      playerGeneralState.directivePreviewByHeroId?.[formationAssignCandidate.heroId]?.executionState,
      formationAssignCandidate.executionState,
      'formation_assign should preserve the expected directive execution state for the resolved hero',
    )
    if (formationAssignCandidate.unitId) {
      assert.ok(
        (playerGeneralState.directivePreviewByHeroId?.[formationAssignCandidate.heroId]?.affectedUnitIds ?? []).includes(formationAssignCandidate.unitId),
        'formation_assign should record the affected active unit in the directive preview when the hero is already deployed',
      )
    } else {
      assert.equal(
        (playerGeneralState.directivePreviewByHeroId?.[formationAssignCandidate.heroId]?.affectedUnitIds ?? []).length,
        0,
        'formation_assign should keep affectedUnitIds empty when the target hero is pending assignment',
      )
    }

    await clearAllPlanExecutions(baseUrl)
    const worldBeforeGeneralFocus = await loadWorldState(baseUrl)
    const generalFocusCandidate = resolveGeneralFocusCandidate(worldBeforeGeneralFocus, 'player')
    const createGeneralFocusProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'general_focus_set',
      source: 'mcp',
      reason: 'Formal AI player general focus authority smoke test',
      args: {
        heroId: generalFocusCandidate.heroId,
      },
    })
    assert.equal(createGeneralFocusProposal.status, 200, `create general_focus_set proposal failed: ${JSON.stringify(createGeneralFocusProposal.data)}`)
    const generalFocusProposal = readObject(readObject(createGeneralFocusProposal.data).proposal)
    const generalFocusProposalId = String(generalFocusProposal.proposalId)
    assert.deepEqual(
      generalFocusProposal.args,
      {
        heroId: generalFocusCandidate.heroId,
      },
      'general_focus_set should preserve action-specific args',
    )

    const approveGeneralFocusProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${generalFocusProposalId}/approve`, 'POST', {
      approvedBy: 'human_alpha',
    })
    assert.equal(approveGeneralFocusProposal.status, 200, `approve general_focus_set proposal failed: ${JSON.stringify(approveGeneralFocusProposal.data)}`)

    const executeGeneralFocusProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${generalFocusProposalId}/execute`, 'POST', {
      executedBy: 'human_alpha',
      includeWorld: false,
    }, 60_000)
    assert.equal(executeGeneralFocusProposal.status, 200, `execute general_focus_set proposal failed: ${JSON.stringify(executeGeneralFocusProposal.data)}`)
    const generalFocusReceipt = readObject(readObject(executeGeneralFocusProposal.data).receipt)
    assert.equal(generalFocusReceipt.ok, true, `general_focus_set receipt should report success: ${JSON.stringify(executeGeneralFocusProposal.data)}`)
    assert.equal(generalFocusReceipt.worldAction, 'setGeneralActiveHero', 'general_focus_set receipt should preserve mapped world action')
    assert.ok(
      typeof generalFocusReceipt.actionRequestId === 'string' && generalFocusReceipt.actionRequestId.length > 0,
      'general_focus_set should return a formal execution requestId',
    )
    assert.deepEqual(
      generalFocusReceipt.worldActionPayload,
      {
        factionId: 'player',
        heroId: generalFocusCandidate.heroId,
      },
      'general_focus_set should surface the resolved hero payload in receipt',
    )
    const generalFocusExecution = readObject(generalFocusReceipt.execution)
    assert.equal(generalFocusExecution.status, 'idle', 'general_focus_set execution snapshot should stay idle after pure focus switching')
    assert.equal(Number(generalFocusExecution.activeOrderCount), 0, 'general_focus_set should not enqueue execution orders')
    assert.equal(
      Number(generalFocusExecution.actionPointsRemaining),
      generalFocusCandidate.actionPoints,
      'general_focus_set execution snapshot should preserve current AP because the authority write does not spend AP',
    )

    const worldAfterGeneralFocus = await loadWorldState(baseUrl)
    const playerGeneralStateAfterFocus = worldAfterGeneralFocus.slgDomainState?.generalStateByFaction?.player
    assert.ok(playerGeneralStateAfterFocus, 'general_focus_set should materialize general state for the player faction')
    assert.equal(
      playerGeneralStateAfterFocus.activeHeroId,
      generalFocusCandidate.heroId,
      'general_focus_set should update the authoritative activeHeroId',
    )
    assert.equal(
      playerGeneralStateAfterFocus.directivePreviewHeroId,
      generalFocusCandidate.heroId,
      'general_focus_set should keep directivePreviewHeroId aligned with the authoritative active hero',
    )
    if (generalFocusCandidate.previousHeroId && generalFocusCandidate.previousHeroId !== generalFocusCandidate.heroId) {
      assert.notEqual(
        playerGeneralStateAfterFocus.activeHeroId,
        generalFocusCandidate.previousHeroId,
        'general_focus_set should move authority away from the previous active hero when a different hero is requested',
      )
    }

    const worldBeforeTroopFacilityUpgrade = await loadWorldState(baseUrl)
    const troopFacilityUpgradeCandidate = resolveTroopFacilityUpgradeCandidate(worldBeforeTroopFacilityUpgrade, 'player')
    const createTroopFacilityUpgradeProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'troop_facility_upgrade',
      source: 'mcp',
      reason: 'Formal AI player troop facility authority smoke test',
      args: {
        unitId: troopFacilityUpgradeCandidate.unitId,
        facilityId: troopFacilityUpgradeCandidate.facilityId,
        buildingId: troopFacilityUpgradeCandidate.buildingId,
      },
    })
    assert.equal(
      createTroopFacilityUpgradeProposal.status,
      200,
      `create troop_facility_upgrade proposal failed: ${JSON.stringify(createTroopFacilityUpgradeProposal.data)}`,
    )
    const troopFacilityUpgradeProposal = readObject(readObject(createTroopFacilityUpgradeProposal.data).proposal)
    const troopFacilityUpgradeProposalId = String(troopFacilityUpgradeProposal.proposalId)
    assert.deepEqual(
      troopFacilityUpgradeProposal.args,
      {
        unitId: troopFacilityUpgradeCandidate.unitId,
        facilityId: troopFacilityUpgradeCandidate.facilityId,
        buildingId: troopFacilityUpgradeCandidate.buildingId,
      },
      'troop_facility_upgrade should preserve action-specific args',
    )

    const approveTroopFacilityUpgradeProposal = await requestJson(
      baseUrl,
      `/api/ai/players/proposals/${troopFacilityUpgradeProposalId}/approve`,
      'POST',
      {
        approvedBy: 'human_alpha',
      },
    )
    assert.equal(
      approveTroopFacilityUpgradeProposal.status,
      200,
      `approve troop_facility_upgrade proposal failed: ${JSON.stringify(approveTroopFacilityUpgradeProposal.data)}`,
    )

    const executeTroopFacilityUpgradeProposal = await requestJson(
      baseUrl,
      `/api/ai/players/proposals/${troopFacilityUpgradeProposalId}/execute`,
      'POST',
      {
        executedBy: 'human_alpha',
        includeWorld: false,
      },
      60_000,
    )
    assert.equal(
      executeTroopFacilityUpgradeProposal.status,
      200,
      `execute troop_facility_upgrade proposal failed: ${JSON.stringify(executeTroopFacilityUpgradeProposal.data)}`,
    )
    const troopFacilityUpgradeReceipt = readObject(readObject(executeTroopFacilityUpgradeProposal.data).receipt)
    assert.equal(
      troopFacilityUpgradeReceipt.ok,
      true,
      `troop_facility_upgrade receipt should report success: ${JSON.stringify(executeTroopFacilityUpgradeProposal.data)}`,
    )
    assert.equal(
      troopFacilityUpgradeReceipt.worldAction,
      'promoteTroopFacilityBuilding',
      'troop_facility_upgrade receipt should preserve mapped world action',
    )
    assert.ok(
      typeof troopFacilityUpgradeReceipt.actionRequestId === 'string' && troopFacilityUpgradeReceipt.actionRequestId.length > 0,
      'troop_facility_upgrade should return a formal execution requestId',
    )
    assert.deepEqual(
      troopFacilityUpgradeReceipt.worldActionPayload,
      {
        factionId: 'player',
        unitId: troopFacilityUpgradeCandidate.unitId,
        facilityId: troopFacilityUpgradeCandidate.facilityId,
        buildingId: troopFacilityUpgradeCandidate.buildingId,
      },
      'troop_facility_upgrade should surface the resolved facility payload in receipt',
    )
    const troopFacilityUpgradeExecution = readObject(troopFacilityUpgradeReceipt.execution)
    assert.equal(
      troopFacilityUpgradeExecution.status,
      'idle',
      'troop_facility_upgrade execution snapshot should stay idle after pure facility authority writes',
    )
    assert.equal(
      Number(troopFacilityUpgradeExecution.activeOrderCount),
      0,
      'troop_facility_upgrade should not enqueue execution orders',
    )
    assert.equal(
      Number(troopFacilityUpgradeExecution.actionPointsRemaining),
      troopFacilityUpgradeCandidate.actionPoints,
      'troop_facility_upgrade execution snapshot should preserve current AP because the authority write does not spend AP',
    )

    const worldAfterTroopFacilityUpgrade = await loadWorldState(baseUrl)
    assert.equal(
      worldAfterTroopFacilityUpgrade.slgDomainState?.troopFacilitiesByUnit?.[troopFacilityUpgradeCandidate.unitId]?.[
        troopFacilityUpgradeCandidate.facilityId
      ]?.[troopFacilityUpgradeCandidate.buildingId]?.level,
      troopFacilityUpgradeCandidate.previousLevel + 1,
      'troop_facility_upgrade should update the authoritative troop facility level',
    )

    const worldBeforeThreatEscape = await loadWorldState(baseUrl)
    const threatEscapeCandidate = resolveThreatEscapeCandidate(worldBeforeThreatEscape, 'player')
    const createThreatEscapeProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'threat_escape',
      source: 'mcp',
      reason: 'Formal AI player threat escape smoke test',
      args: {
        mode: threatEscapeCandidate.mode,
      },
    })
    assert.equal(createThreatEscapeProposal.status, 200, `create threat_escape proposal failed: ${JSON.stringify(createThreatEscapeProposal.data)}`)
    const threatEscapeProposal = readObject(readObject(createThreatEscapeProposal.data).proposal)
    const threatEscapeProposalId = String(threatEscapeProposal.proposalId)
    assert.deepEqual(
      threatEscapeProposal.args,
      {
        mode: threatEscapeCandidate.mode,
      },
      'threat_escape should preserve action-specific args',
    )

    const approveThreatEscapeProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${threatEscapeProposalId}/approve`, 'POST', {
      approvedBy: 'human_alpha',
    })
    assert.equal(approveThreatEscapeProposal.status, 200, `approve threat_escape proposal failed: ${JSON.stringify(approveThreatEscapeProposal.data)}`)

    const executeThreatEscapeProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${threatEscapeProposalId}/execute`, 'POST', {
      executedBy: 'human_alpha',
      includeWorld: false,
    }, 60_000)
    assert.equal(executeThreatEscapeProposal.status, 200, `execute threat_escape proposal failed: ${JSON.stringify(executeThreatEscapeProposal.data)}`)
    const threatEscapeReceipt = readObject(readObject(executeThreatEscapeProposal.data).receipt)
    assert.equal(threatEscapeReceipt.ok, true, `threat_escape receipt should report success: ${JSON.stringify(executeThreatEscapeProposal.data)}`)
    assert.equal(threatEscapeReceipt.worldAction, 'queueAiAgendaAction', 'threat_escape receipt should preserve mapped world action')
    assert.ok(
      typeof threatEscapeReceipt.actionRequestId === 'string' && threatEscapeReceipt.actionRequestId.length > 0,
      'threat_escape should return a formal execution requestId',
    )
    assert.deepEqual(
      threatEscapeReceipt.worldActionPayload,
      {
        factionId: 'player',
        agendaActionId: threatEscapeCandidate.agendaActionId,
      },
      'threat_escape should surface the resolved agenda payload in receipt',
    )
    const threatEscapeExecution = readObject(threatEscapeReceipt.execution)
    assert.equal(threatEscapeExecution.status, 'queued', 'threat_escape should expose queued execution snapshot after scheduling agenda escape')
    assert.ok(Number(threatEscapeExecution.activeOrderCount) >= 1, 'threat_escape execution snapshot should expose queued escape orders')
    assert.equal(
      String(threatEscapeExecution.requestId),
      String(threatEscapeReceipt.actionRequestId),
      'threat_escape execution snapshot should expose the same requestId as the receipt',
    )

    const worldAfterThreatEscape = await loadWorldState(baseUrl)
    const playerAiState = worldAfterThreatEscape.slgDomainState?.aiStateByFaction?.player
    assert.ok(playerAiState?.agenda, 'threat_escape should materialize ai agenda state for the player faction')
    assert.equal(
      playerAiState.lastAgendaActionId,
      threatEscapeCandidate.agendaActionId,
      'threat_escape should update the authoritative lastAgendaActionId',
    )
    assert.equal(
      playerAiState.agenda?.executionRequestId,
      threatEscapeReceipt.actionRequestId,
      'threat_escape should persist the authoritative agenda execution requestId',
    )
    assert.equal(
      playerAiState.agenda?.targetTileId,
      threatEscapeCandidate.targetTileId,
      'threat_escape should persist the resolved agenda target tile',
    )
    assert.ok(
      (playerAiState.agenda?.targetUnitIds ?? []).includes(threatEscapeCandidate.unitId),
      'threat_escape should keep the primary unit in the authoritative agenda target set',
    )

    const receipts = await requestJson(baseUrl, '/api/ai/players/player_operator_alpha/receipts?limit=20', 'GET')
    assert.equal(receipts.status, 200, `receipts route failed: ${JSON.stringify(receipts.data)}`)
    const receiptItems = readArray(readObject(receipts.data).items)
    assert.ok(
      receiptItems.some((item) => readObject(item).proposalId === proposalId),
      'receipts route should include executed proposal receipt',
    )
    assert.ok(
      receiptItems.some((item) => readObject(item).proposalId === moveProposalId),
      'receipts route should include move proposal receipt',
    )
    assert.ok(
      receiptItems.some((item) => readObject(item).proposalId === troopTrainProposalId),
      'receipts route should include troop train proposal receipt',
    )
    assert.ok(
      receiptItems.some((item) => readObject(item).proposalId === researchProposalId),
      'receipts route should include research proposal receipt',
    )
    assert.ok(
      receiptItems.some((item) => readObject(item).proposalId === buildingProposalId),
      'receipts route should include building proposal receipt',
    )
    assert.ok(
      receiptItems.some((item) => readObject(item).proposalId === queueProposalId),
      'receipts route should include queue proposal receipt',
    )
    assert.ok(
      receiptItems.some((item) => readObject(item).proposalId === scoutProposalId),
      'receipts route should include scout proposal receipt',
    )
    assert.ok(
      receiptItems.some((item) => readObject(item).proposalId === allianceHelpProposalId),
      'receipts route should include alliance_help proposal receipt',
    )
    assert.ok(
      receiptItems.some((item) => readObject(item).proposalId === rewardClaimProposalId),
      'receipts route should include reward_claim proposal receipt',
    )
    assert.ok(
      receiptItems.some((item) => readObject(item).proposalId === garrisonProposalId),
      'receipts route should include garrison proposal receipt',
    )
    assert.ok(
      typeof readObject(receiptItems.find((item) => readObject(item).proposalId === rewardClaimProposalId) ?? {}).actionRequestId === 'string',
      'reward_claim receipt should remain queryable through the receipts route',
    )
    assert.ok(
      receiptItems.some((item) => readObject(item).proposalId === recruitSuccessProposalId),
      'receipts route should include recruit success proposal receipt',
    )
    assert.ok(
      receiptItems.some((item) => readObject(item).proposalId === recruitFailureProposalId),
      'receipts route should include recruit failure proposal receipt',
    )
    assert.ok(
      receiptItems.some((item) => readObject(item).proposalId === formationAssignProposalId),
      'receipts route should include formation_assign proposal receipt',
    )
    assert.ok(
      receiptItems.some((item) => readObject(item).proposalId === generalFocusProposalId),
      'receipts route should include general_focus_set proposal receipt',
    )
    assert.ok(
      receiptItems.some((item) => readObject(item).proposalId === recruitPoolSelectProposalId),
      'receipts route should include recruit_pool_select proposal receipt',
    )
    assert.ok(
      receiptItems.some((item) => readObject(item).proposalId === troopFacilityUpgradeProposalId),
      'receipts route should include troop_facility_upgrade proposal receipt',
    )
    assert.ok(
      receiptItems.some((item) => readObject(item).proposalId === threatEscapeProposalId),
      'receipts route should include threat_escape proposal receipt',
    )

    const runtimeAfterExecution = await requestJson(baseUrl, '/api/ai/players/player_operator_alpha', 'GET')
    assert.equal(runtimeAfterExecution.status, 200, 'runtime should stay available after execution')
    const runtimeAfterExecutionPayload = readObject(runtimeAfterExecution.data)
    const proposalStats = readObject(runtimeAfterExecutionPayload.proposalStats)
    assert.equal(proposalStats.executedCount, 16, 'runtime should expose successful executed proposal count across the closed v1 player actions')
    assert.equal(proposalStats.failedCount, 1, 'runtime should expose failed proposal count for the retained recruit failure sample')
    assert.equal(runtimeAfterExecutionPayload.latestProposalId, threatEscapeProposalId, 'runtime should expose latestProposalId')
    const latestReceipt = readObject(runtimeAfterExecutionPayload.latestReceipt)
    assert.equal(latestReceipt.proposalId, threatEscapeProposalId, 'runtime should expose latestReceipt for the latest executed proposal')

    await shutdownChild(child)
    const restartPort = await getAvailablePort()
    const restartBaseUrl = `http://127.0.0.1:${restartPort}`
    child = spawnBackend(restartPort, tail, envOverrides)

    const restartedHealth = await waitForHealth(restartBaseUrl)
    assert.ok(restartedHealth, `restarted backend did not become healthy\nstdout=${tail.stdout.join('\n')}\nstderr=${tail.stderr.join('\n')}`)
    const restartedHealthPayload = readObject(restartedHealth.data)
    const restartedPersistence = readObject(readObject(restartedHealthPayload.persistence).aiPlayerGovernance)
    assert.ok(Number(restartedPersistence.restoredPlayerCount) >= 2, 'restart should restore governed AI players from persistence')
    assert.ok(Number(restartedPersistence.restoredProposalCount) >= 17, 'restart should restore proposals from persistence')
    assert.ok(Number(restartedPersistence.restoredReceiptCount) >= 17, 'restart should restore receipts from persistence')

    const listPlayersAfterRestart = await requestJson(restartBaseUrl, '/api/ai/players?governorPlayerId=human_alpha&includeDisabled=true', 'GET')
    assert.equal(listPlayersAfterRestart.status, 200, `list players after restart failed: ${JSON.stringify(listPlayersAfterRestart.data)}`)
    const restartedPlayers = readArray(readObject(listPlayersAfterRestart.data).items)
    assert.equal(restartedPlayers.length, 2, 'governed AI players should survive backend restart')

    const runtimeAfterRestart = await requestJson(restartBaseUrl, '/api/ai/players/player_operator_alpha', 'GET')
    assert.equal(runtimeAfterRestart.status, 200, 'runtime should restore after backend restart')
    const runtimeAfterRestartPayload = readObject(runtimeAfterRestart.data)
    const restartedStats = readObject(runtimeAfterRestartPayload.proposalStats)
    assert.equal(restartedStats.executedCount, 16, 'executed proposal stats should survive backend restart')
    assert.equal(restartedStats.failedCount, 1, 'failed proposal stats should survive backend restart')
    const restartedLatestReceipt = readObject(runtimeAfterRestartPayload.latestReceipt)
    assert.equal(restartedLatestReceipt.proposalId, threatEscapeProposalId, 'latest receipt should survive backend restart')
    const restartedRuntimePersistence = readObject(runtimeAfterRestartPayload.persistence)
    assert.ok(Number(restartedRuntimePersistence.restoredPlayerCount) >= 2, 'runtime detail should expose restored player count')
  } finally {
    await shutdownChild(child)
  }
}

run().catch((error) => {
  console.error('[ai_player_http_contract] failed:', error)
  process.exitCode = 1
})
