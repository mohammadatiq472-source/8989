import assert from 'node:assert/strict'
import { request as httpRequest } from 'node:http'
import { moveUnit } from '../../shared/domain/rules'
import type { ClaimableReward, PveNode, WorldState } from '../../shared/contracts/game/world'
import {
  getAvailablePort,
  readObject,
  shutdownChild,
  spawnBackend,
  type TailState,
  waitForHealth,
} from './helpers/backendHarness'

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
  if (
    !Array.isArray(world.map.tiles) ||
    world.map.tiles.length === 0 ||
    !world.map.connections ||
    Object.keys(world.map.connections).length === 0 ||
    !Array.isArray(world.map.regions) ||
    world.map.regions.length === 0
  ) {
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

function buildShortestPath(
  connections: Record<string, string[]>,
  startTileId: string,
  targetTileId: string,
): string[] | null {
  const queue = [startTileId]
  const previousByTile = new Map<string, string | null>([[startTileId, null]])

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]
    if (current === targetTileId) {
      break
    }
    for (const neighbor of connections[current] ?? []) {
      if (previousByTile.has(neighbor)) {
        continue
      }
      previousByTile.set(neighbor, current)
      queue.push(neighbor)
    }
  }

  if (!previousByTile.has(targetTileId)) {
    return null
  }

  const path: string[] = []
  let cursor: string | null = targetTileId
  while (cursor) {
    path.push(cursor)
    cursor = previousByTile.get(cursor) ?? null
  }
  path.reverse()
  return path
}

function isLegalMovePath(
  world: WorldState,
  factionId: string,
  unitId: string,
  path: string[],
): boolean {
  let simulatedWorld = structuredClone(world)
  const faction = simulatedWorld.factions[factionId]
  if (!faction) {
    return false
  }

  faction.actionPoints = 999
  faction.food = 999
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
      assert.equal(advance.status, 200, `advance tick for move prep failed: ${JSON.stringify(advance.data)}`)
      assert.equal(readObject(advance.data).ok, true, `advance tick for move prep should succeed: ${JSON.stringify(advance.data)}`)
      const refreshedWorld = await loadWorldState(baseUrl)
      const refreshedFaction = refreshedWorld.factions[factionId]
      assert.ok(refreshedFaction, `missing faction ${factionId} after move prep tick`)
      remainingActionPoints = refreshedFaction.actionPoints
      remainingFood = refreshedFaction.food
    }

    const move = await requestJson(baseUrl, '/api/world/action?includeWorld=false', 'POST', {
      action: 'moveUnit',
      payload: {
        factionId,
        unitId,
        targetTileId,
      },
    }, 60_000)
    assert.equal(move.status, 200, `moveUnit route failed while traversing path: ${JSON.stringify(move.data)}`)
    assert.equal(readObject(move.data).ok, true, `moveUnit should succeed while traversing path: ${JSON.stringify(move.data)}`)
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

async function run() {
  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const tail: TailState = { stdout: [], stderr: [] }
  const child = spawnBackend(port, tail)

  try {
    const health = await waitForHealth(baseUrl)
    assert.ok(health, `backend did not become healthy\nstdout=${tail.stdout.join('\n')}\nstderr=${tail.stderr.join('\n')}`)

    const invalidSchema = await requestJson(baseUrl, '/api/world/action?includeWorld=false', 'POST', {
      action: 'claimReward',
      payload: {
        factionId: 'player',
        rewardId: 123,
      },
    })
    assert.equal(invalidSchema.status, 400, 'claimReward should reject non-string rewardId at world action schema validation time')

    const missingReward = await requestJson(baseUrl, '/api/world/action?includeWorld=false', 'POST', {
      action: 'claimReward',
      payload: {
        factionId: 'player',
        rewardId: 'reward_missing_for_contract_test',
      },
    })
    assert.equal(missingReward.status, 200, `claimReward missing reward route failed: ${JSON.stringify(missingReward.data)}`)
    const missingRewardPayload = readObject(missingReward.data)
    assert.equal(missingRewardPayload.ok, false, 'claimReward should surface structured failure for missing reward')
    assert.equal(missingRewardPayload.failureCode, 'missing_claimable_reward', 'claimReward should return missing_claimable_reward failureCode')
    const missingRewardExecution = readObject(missingRewardPayload.execution)
    assert.ok(typeof missingRewardExecution.actionPointsRemaining === 'number', 'claimReward failure should expose execution snapshot')

    const worldBeforeTravel = await loadWorldState(baseUrl)
    const candidate = resolveRewardClaimCandidate(worldBeforeTravel, 'player')
    await moveUnitAlongPath(baseUrl, worldBeforeTravel, 'player', candidate.unitId, candidate.path)

    const advanceForPve = await requestJson(
      baseUrl,
      '/api/world/action?includeWorld=false',
      'POST',
      { action: 'advanceTick' },
      60_000,
    )
    assert.equal(advanceForPve.status, 200, `advance tick for reward claim prep failed: ${JSON.stringify(advanceForPve.data)}`)
    assert.equal(
      readObject(advanceForPve.data).ok,
      true,
      `advance tick for reward claim prep should succeed: ${JSON.stringify(advanceForPve.data)}`,
    )

    const worldBeforeClaim = await loadWorldState(baseUrl)
    const pendingReward = resolvePendingReward(worldBeforeClaim, 'player', candidate.node.id)
    const factionBeforeClaim = worldBeforeClaim.factions.player
    assert.ok(factionBeforeClaim, 'player faction should exist before reward claim')
    assert.ok(
      (factionBeforeClaim.claimableRewards ?? []).some((reward) => reward.id === pendingReward.id),
      'pve clear should create a claimable reward instead of auto-paying immediately',
    )

    const success = await requestJson(baseUrl, '/api/world/action?includeWorld=true', 'POST', {
      action: 'claimReward',
      payload: {
        factionId: 'player',
        rewardId: pendingReward.id,
      },
    }, 60_000)
    assert.equal(success.status, 200, `claimReward success route failed: ${JSON.stringify(success.data)}`)
    const successPayload = readObject(success.data)
    assert.equal(successPayload.ok, true, `claimReward should succeed: ${JSON.stringify(success.data)}`)
    assert.equal(successPayload.relatedId, pendingReward.id, 'claimReward should expose rewardId as relatedId')
    assert.ok(
      typeof successPayload.requestId === 'string' && String(successPayload.requestId).length > 0,
      'claimReward should expose a formal requestId',
    )

    const successExecution = readObject(successPayload.execution)
    assert.equal(
      Number(successExecution.actionPointsRemaining),
      Math.min(8, factionBeforeClaim.actionPoints + pendingReward.reward.ap),
      'claimReward execution snapshot should reflect rewarded AP',
    )

    const worldAfterClaim = readWorldStatePayload(success.data)
    const factionAfterClaim = worldAfterClaim.factions.player
    assert.ok(factionAfterClaim, 'player faction should remain in world state after claimReward')
    assert.equal(
      factionAfterClaim.food,
      factionBeforeClaim.food + pendingReward.reward.food,
      'claimReward should grant pending food reward',
    )
    assert.equal(
      factionAfterClaim.actionPoints,
      Math.min(8, factionBeforeClaim.actionPoints + pendingReward.reward.ap),
      'claimReward should grant pending action point reward with cap',
    )
    assert.ok(
      !(factionAfterClaim.claimableRewards ?? []).some((reward) => reward.id === pendingReward.id),
      'claimReward should remove the claimed reward from pending queue',
    )

    const worldReloaded = await loadWorldState(baseUrl)
    assert.equal(
      worldReloaded.factions.player?.food,
      factionAfterClaim.food,
      'claimReward mutation should persist through world summary reload',
    )
    assert.equal(
      worldReloaded.factions.player?.actionPoints,
      factionAfterClaim.actionPoints,
      'claimReward action point mutation should persist through world summary reload',
    )
    assert.ok(
      !(worldReloaded.factions.player?.claimableRewards ?? []).some((reward) => reward.id === pendingReward.id),
      'claimed reward should stay removed after reload',
    )
  } catch (error) {
    console.error('[world_reward_claim_http_contract] tail stdout:', tail.stdout.join('\n'))
    console.error('[world_reward_claim_http_contract] tail stderr:', tail.stderr.join('\n'))
    throw error
  } finally {
    await shutdownChild(child)
  }
}

run().catch((error) => {
  console.error('[world_reward_claim_http_contract] failed:', error)
  process.exitCode = 1
})
