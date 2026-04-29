import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { createInitialWorldState } from '../../shared/domain/scenario'
import type { ClaimableReward, WorldState } from '../../shared/contracts/game/world'
import {
  buildSessionPersistPath,
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

function seedWorldStateWithPendingReward(): { path: string; reward: ClaimableReward } {
  const world = createInitialWorldState()
  const faction = world.factions.player
  assert.ok(faction, 'player faction should exist while seeding reward claim contract')

  const anchorTileId = world.units.find((unit) => unit.faction === 'player')?.tileId ?? 'tile_00'
  const reward: ClaimableReward = {
    id: 'reward_world_contract_seed',
    source: 'province_pve',
    label: 'World contract seeded reward',
    summary: 'Seeded pending reward for the claimReward HTTP authority contract.',
    reward: {
      food: 4,
      ap: 1,
    },
    createdTick: world.tick,
    nodeId: 'world_contract_seed_node',
    tileId: anchorTileId,
  }
  faction.claimableRewards = [reward]

  const path = buildSessionPersistPath('world_reward_claim_contract_world_state')
  writeFileSync(path, `${JSON.stringify(world)}\n`, 'utf-8')
  return { path, reward }
}

async function run() {
  const seeded = seedWorldStateWithPendingReward()
  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const tail: TailState = { stdout: [], stderr: [] }
  const child = spawnBackend(port, tail, {
    WORLD_STATE_PERSIST_PATH: seeded.path,
  })

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

    const worldBeforeClaim = await loadWorldState(baseUrl)
    const pendingReward = seeded.reward
    const factionBeforeClaim = worldBeforeClaim.factions.player
    assert.ok(factionBeforeClaim, 'player faction should exist before reward claim')
    assert.ok(
      (factionBeforeClaim.claimableRewards ?? []).some((reward) => reward.id === pendingReward.id),
      'seeded world snapshot should expose a pending claimable reward',
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
