import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import type { WorldState } from '../../shared/contracts/game/world'
import { createInitialWorldState } from '../../shared/domain/scenario'
import {
  FACTION_ID,
  assertSuccessfulReceipt,
  clearAllPlanExecutions,
  createApproveExecuteProposal,
  ensureFactionBudget,
  joinGovernor,
  registerDefaultAiPlayer,
  startAiPlayerHttpBackend,
  type AiPlayerHttpBackend,
} from './helpers/aiPlayerHttpContractHarness'
import { buildSessionPersistPath } from './helpers/backendHarness'

const DOMESTIC_ACTIONS: Array<{
  action: 'city_upgrade' | 'building_upgrade' | 'queue_fill_idle_slot' | 'research_start'
  worldAction: string
  minFood: number
  minActionPoints: number
}> = [
  {
    action: 'city_upgrade',
    worldAction: 'upgradeCity',
    minFood: 0,
    minActionPoints: 4,
  },
  {
    action: 'building_upgrade',
    worldAction: 'promoteCityBuilding',
    minFood: 0,
    minActionPoints: 4,
  },
  {
    action: 'queue_fill_idle_slot',
    worldAction: 'enqueueAffair',
    minFood: 0,
    minActionPoints: 4,
  },
  {
    action: 'research_start',
    worldAction: 'upgradeCityTech',
    minFood: 0,
    minActionPoints: 4,
  },
]

function resolveUpgradeFootprintTileIds(world: WorldState, hallTileId: string, existingTileIds: string[]): string[] {
  const hallTile = world.map.tiles.find((tile) => tile.id === hallTileId)
  assert.ok(hallTile, `missing city hall tile ${hallTileId} while seeding domestic shard`)
  const tileByCoord = new Map(world.map.tiles.map((tile) => [`${tile.x},${tile.y}`, tile]))
  const existingTileIdSet = new Set(existingTileIds)
  const candidateStarts = [
    { x: hallTile.x - 2, y: hallTile.y - 2 },
    { x: hallTile.x - 2, y: hallTile.y - 3 },
    { x: hallTile.x - 3, y: hallTile.y - 2 },
    { x: hallTile.x - 3, y: hallTile.y - 3 },
  ]

  let bestTileIds: string[] = []
  let bestScore = Number.NEGATIVE_INFINITY
  for (const start of candidateStarts) {
    const tiles = []
    for (let localY = 0; localY < 5; localY += 1) {
      for (let localX = 0; localX < 5; localX += 1) {
        const tile = tileByCoord.get(`${start.x + localX},${start.y + localY}`)
        if (tile) {
          tiles.push(tile)
        }
      }
    }
    if (tiles.length !== 25) {
      continue
    }

    const score = tiles.reduce(
      (total, tile) =>
        total
        + (existingTileIdSet.has(tile.id) ? 100 : 0)
        - Math.abs(tile.x - hallTile.x)
        - Math.abs(tile.y - hallTile.y),
      0,
    )
    if (score > bestScore) {
      bestScore = score
      bestTileIds = tiles.map((tile) => tile.id)
    }
  }

  assert.equal(bestTileIds.length, 25, 'domestic shard should resolve a 5x5 city upgrade footprint')
  return bestTileIds
}

function seedWorldStateWithUpgradeableCity(): { path: string } {
  const world = createInitialWorldState()
  const faction = world.factions[FACTION_ID]
  assert.ok(faction, `missing faction ${FACTION_ID} while seeding domestic shard`)
  faction.actionPoints = Math.max(faction.actionPoints, 12)
  faction.food = Math.max(faction.food, 100)

  const cluster = world.map.overlays.cityClusters.find(
    (candidate) => candidate.owner === FACTION_ID && candidate.footprintTiles === 9,
  )
  assert.ok(cluster, `missing owned 3x3 city cluster for ${FACTION_ID} while seeding domestic shard`)
  const footprintTileIds = resolveUpgradeFootprintTileIds(world, cluster.cityHallTileId, cluster.tileIds)
  cluster.isUpgradeable = true
  for (const tileId of footprintTileIds) {
    const tile = world.map.tiles.find((candidate) => candidate.id === tileId)
    assert.ok(tile, `missing tile ${tileId} while seeding domestic shard`)
    tile.owner = FACTION_ID
  }
  for (const unit of world.units) {
    if (unit.faction !== FACTION_ID && footprintTileIds.includes(unit.tileId)) {
      const fallbackTile = world.map.tiles.find((tile) => !footprintTileIds.includes(tile.id))
      assert.ok(fallbackTile, 'missing fallback tile while moving hostile unit away from domestic city footprint')
      unit.tileId = fallbackTile.id
    }
  }

  const path = buildSessionPersistPath('ai_player_http_domestic_world_state')
  writeFileSync(path, `${JSON.stringify(world)}\n`, 'utf-8')
  return { path }
}

async function bootDomesticBackend(): Promise<AiPlayerHttpBackend> {
  const seeded = seedWorldStateWithUpgradeableCity()
  const backend = await startAiPlayerHttpBackend(
    'ai_player_http_domestic_contract',
    undefined,
    {
      WORLD_STATE_PERSIST_PATH: seeded.path,
    },
  )
  await joinGovernor(backend.baseUrl)
  await registerDefaultAiPlayer(backend.baseUrl)
  return backend
}

async function run() {
  const backend = await bootDomesticBackend()
  try {
    for (const { action, worldAction, minFood, minActionPoints } of DOMESTIC_ACTIONS) {
      await clearAllPlanExecutions(backend.baseUrl)
      await ensureFactionBudget(
        backend.baseUrl,
        minActionPoints,
        minFood,
        `prepare ${action} in domestic contract shard`,
      )

      const { receipt } = await createApproveExecuteProposal(
        backend.baseUrl,
        action,
        {},
        `Domestic AI player contract smoke test for ${action}`,
      )

      assertSuccessfulReceipt(action, receipt, worldAction)
      assert.equal(receipt.failureCode, null, `${action} failureCode should remain null`)
    }

    console.log('[ai_player_http_domestic_contract] all checks passed')
  } finally {
    await backend.stop()
  }
}

run().catch((error) => {
  console.error('[ai_player_http_domestic_contract] failed:', error)
  process.exitCode = 1
})
