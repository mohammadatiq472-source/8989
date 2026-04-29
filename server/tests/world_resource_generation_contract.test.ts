import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { createInitialWorldState } from '../../shared/domain/scenario'
import { DEFAULT_WORLD_RESOURCE_GENERATION_POLICY } from '../../shared/domain/worldResourceGeneration'
import type { Tile, WorldMapLayoutResponse, WorldState } from '../../shared/contracts/game/world'
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

function readWorldStatePayload(value: unknown): WorldState {
  const root = readObject(value)
  const world = readObject(root.world)
  return world as unknown as WorldState
}

function readWorldMapLayoutPayload(value: unknown): WorldMapLayoutResponse {
  return readObject(value) as unknown as WorldMapLayoutResponse
}

type ResourceTileSummarySource = {
  map: {
    tiles: Array<Pick<Tile, 'id' | 'x' | 'y' | 'type' | 'resourceLevel' | 'resourceKind'>>
  }
}

function summarizeResourceTiles(world: ResourceTileSummarySource) {
  const levelCounts: Record<string, number> = {}
  const kindCounts: Record<string, number> = {}
  const samples: string[] = []

  for (const tile of world.map.tiles) {
    if (tile.type !== 'resource') {
      continue
    }
    const level = String(tile.resourceLevel ?? 1)
    const kind = tile.resourceKind ?? 'food'
    levelCounts[level] = (levelCounts[level] ?? 0) + 1
    kindCounts[kind] = (kindCounts[kind] ?? 0) + 1
    if (samples.length < 48) {
      samples.push(`${tile.id}:${tile.x}:${tile.y}:${kind}:${level}`)
    }
  }

  return {
    levelCounts,
    kindCounts,
    samples,
  }
}

async function run() {
  const firstWorld = createInitialWorldState()
  const secondWorld = createInitialWorldState()
  const firstSummary = summarizeResourceTiles(firstWorld)
  const secondSummary = summarizeResourceTiles(secondWorld)

  assert.deepEqual(firstSummary, secondSummary, 'world resource generation must be deterministic for the same seed/version')

  const metadata = firstWorld.map.resourceGeneration
  assert.ok(metadata, 'world map should expose resource generation metadata')
  assert.equal(metadata.worldSeed, DEFAULT_WORLD_RESOURCE_GENERATION_POLICY.worldSeed)
  assert.equal(metadata.generationVersion, DEFAULT_WORLD_RESOURCE_GENERATION_POLICY.generationVersion)
  assert.equal(metadata.resourceTileDensityPermille, DEFAULT_WORLD_RESOURCE_GENERATION_POLICY.resourceTileDensityPermille)
  assert.deepEqual(metadata.levelWeightTable, DEFAULT_WORLD_RESOURCE_GENERATION_POLICY.levelWeightTable)
  assert.deepEqual(metadata.kindWeightTable, DEFAULT_WORLD_RESOURCE_GENERATION_POLICY.kindWeightTable)
  assert.equal(
    metadata.generatedResourceTileCount,
    firstWorld.map.tiles.filter((tile) => tile.type === 'resource').length,
    'metadata resource tile count must match the generated map',
  )

  assert.ok((metadata.levelCounts['1'] ?? 0) > (metadata.levelCounts['5'] ?? 0), 'L01 resources should be more common than L05')
  assert.ok((metadata.levelCounts['5'] ?? 0) > (metadata.levelCounts['9'] ?? 0), 'L05 resources should be more common than L09')
  assert.ok((metadata.levelCounts['9'] ?? 0) > 0, 'L09 resources should exist but remain rare')
  assert.ok(metadata.kindCounts.food > 0)
  assert.ok(metadata.kindCounts.wood > 0)
  assert.ok(metadata.kindCounts.stone > 0)
  assert.ok(metadata.kindCounts.iron > 0)
  assert.equal(
    firstWorld.map.tiles.filter((tile) => tile.type === 'resource' && (tile.terrain === 'mountain' || tile.terrain === 'riverland')).length,
    0,
    'resources must not generate on reserved mountain/river footprint cells',
  )
  const reservedCityTileIds = new Set(firstWorld.map.overlays.cityClusters.flatMap((cluster) => cluster.tileIds))
  assert.equal(
    firstWorld.map.tiles.filter((tile) => tile.type === 'resource' && reservedCityTileIds.has(tile.id)).length,
    0,
    'resources must not generate inside reserved city footprints',
  )
  assert.ok(
    firstWorld.map.overlays.cityClusters.every((cluster) => [9, 25, 49, 81].includes(cluster.footprintTiles)),
    'city footprints must use odd 3x3/5x5/7x7/9x9 areas',
  )

  const legacyPersistedWorld = structuredClone(firstWorld)
  delete legacyPersistedWorld.map.resourceGeneration
  const legacyResourceTile = legacyPersistedWorld.map.tiles.find((tile) => tile.type === 'resource')
  assert.ok(legacyResourceTile, 'generated world should contain at least one resource tile')
  delete legacyResourceTile.resourceLevel
  delete legacyResourceTile.resourceKind

  const persistPath = buildSessionPersistPath('world_resource_generation_contract_world_state')
  writeFileSync(persistPath, `${JSON.stringify(legacyPersistedWorld)}\n`, 'utf-8')

  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const tail: TailState = { stdout: [], stderr: [] }
  const child = spawnBackend(port, tail, {
    WORLD_STATE_PERSIST_PATH: persistPath,
    ENABLE_FULL_MAP_LAYOUT: '1',
  })

  try {
    const health = await waitForHealth(baseUrl)
    assert.ok(health, `backend did not become healthy\nstdout=${tail.stdout.join('\n')}\nstderr=${tail.stderr.join('\n')}`)

    const response = await requestJson(baseUrl, '/api/world?intelMode=full', 'GET')
    assert.equal(response.status, 200, `world route failed: ${JSON.stringify(response.data)}`)
    const reloadedWorld = readWorldStatePayload(response.data)
    assert.deepEqual(
      reloadedWorld.map.resourceGeneration,
      metadata,
      'resource generation metadata should be backfilled through the authoritative world snapshot',
    )

    const mapLayoutResponse = await requestJson(baseUrl, '/api/world/map-layout?scope=full', 'GET')
    assert.equal(mapLayoutResponse.status, 200, `world map-layout route failed: ${JSON.stringify(mapLayoutResponse.data)}`)
    const reloadedMapLayout = readWorldMapLayoutPayload(mapLayoutResponse.data)
    assert.deepEqual(
      reloadedMapLayout.map.resourceGeneration,
      metadata,
      'resource generation metadata should be backfilled through the authoritative map layout',
    )
    assert.deepEqual(
      summarizeResourceTiles({ map: reloadedMapLayout.map }),
      firstSummary,
      'resource tile distribution should persist through HTTP world loading',
    )
  } finally {
    await shutdownChild(child)
  }

  const customPort = await getAvailablePort()
  const customBaseUrl = `http://127.0.0.1:${customPort}`
  const customTail: TailState = { stdout: [], stderr: [] }
  const customSeed = 'world_resource_generation_contract_alt_seed'
  const customVersion = 'world_resource_generation_contract_alt_v2'
  const customChild = spawnBackend(customPort, customTail, {
    ENABLE_FULL_MAP_LAYOUT: '1',
    WORLD_RESOURCE_SEED: customSeed,
    WORLD_RESOURCE_GENERATION_VERSION: customVersion,
    WORLD_RESOURCE_LEVEL_WEIGHT_TABLE: '1:1,9:999',
    WORLD_RESOURCE_KIND_WEIGHT_TABLE: 'food:100,wood:200,stone:300,iron:400',
  })

  try {
    const health = await waitForHealth(customBaseUrl)
    assert.ok(
      health,
      `custom policy backend did not become healthy\nstdout=${customTail.stdout.join('\n')}\nstderr=${customTail.stderr.join('\n')}`,
    )

    const mapLayoutResponse = await requestJson(customBaseUrl, '/api/world/map-layout?scope=full', 'GET')
    assert.equal(
      mapLayoutResponse.status,
      200,
      `custom policy map-layout route failed: ${JSON.stringify(mapLayoutResponse.data)}`,
    )
    const mapLayout = readWorldMapLayoutPayload(mapLayoutResponse.data)
    const customMetadata = mapLayout.map.resourceGeneration
    assert.ok(customMetadata, 'custom policy world map should expose resource generation metadata')
    assert.equal(customMetadata.worldSeed, customSeed)
    assert.equal(customMetadata.generationVersion, customVersion)
    assert.deepEqual(customMetadata.levelWeightTable, [
      { level: 1, weight: 1 },
      { level: 9, weight: 999 },
    ])
    assert.deepEqual(customMetadata.kindWeightTable, [
      { kind: 'food', weight: 100 },
      { kind: 'wood', weight: 200 },
      { kind: 'stone', weight: 300 },
      { kind: 'iron', weight: 400 },
    ])
    assert.ok(
      (customMetadata.levelCounts['9'] ?? 0) > (customMetadata.levelCounts['1'] ?? 0),
      'custom level weights should make L09 more common than L01',
    )
    assert.notDeepEqual(
      summarizeResourceTiles({ map: mapLayout.map }),
      firstSummary,
      'custom seed/version should produce a distinct resource tile distribution',
    )
  } finally {
    await shutdownChild(customChild)
  }
}

run().catch((error) => {
  console.error('[world_resource_generation_contract] failed:', error)
  process.exitCode = 1
})
