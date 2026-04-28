import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { createInitialWorldState } from '../../shared/domain/scenario'
import { WORLD_CELL_FOOTPRINT_MANIFEST_V1 } from '../../shared/contracts/game/worldCellFootprint'
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

const STRATEGIC_NODE_TYPES = ['pass', 'fort', 'dock'] as const
type StrategicNodeType = (typeof STRATEGIC_NODE_TYPES)[number]

function readWorldMapLayoutPayload(value: unknown): WorldMapLayoutResponse {
  return readObject(value) as unknown as WorldMapLayoutResponse
}

function countStrategicNodes(tiles: Array<Pick<Tile, 'type'>>) {
  const counts: Record<StrategicNodeType, number> = {
    pass: 0,
    fort: 0,
    dock: 0,
  }

  for (const tile of tiles) {
    if (tile.type === 'pass' || tile.type === 'fort' || tile.type === 'dock') {
      counts[tile.type] += 1
    }
  }

  return counts
}

function assertStrategicNodeCounts(counts: Record<StrategicNodeType, number>, source: string) {
  assert.ok(counts.pass > 0, `${source} should expose pass nodes`)
  assert.ok(counts.fort > 0, `${source} should expose fort nodes`)
  assert.ok(counts.dock > 0, `${source} should expose dock nodes`)
}

function assertStrategicNodesHaveNoResourcePayload(world: WorldState) {
  const invalid = world.map.tiles.filter(
    (tile) =>
      (tile.type === 'pass' || tile.type === 'fort' || tile.type === 'dock') &&
      (tile.resourceKind || tile.resourceLevel),
  )
  assert.deepEqual(invalid, [], 'strategic node tiles must not carry resource payload')
}

function assertScopedLayoutCounts(
  actualTiles: Array<Pick<Tile, 'type'>>,
  expectedTiles: Array<Pick<Tile, 'type'>>,
  source: string,
) {
  const actualCounts = assertScopedLayoutMatches(actualTiles, expectedTiles, source)
  assertStrategicNodeCounts(actualCounts, source)
}

function assertScopedLayoutMatches(
  actualTiles: Array<Pick<Tile, 'type'>>,
  expectedTiles: Array<Pick<Tile, 'type'>>,
  source: string,
) {
  const actualCounts = countStrategicNodes(actualTiles)
  const expectedCounts = countStrategicNodes(expectedTiles)

  assert.deepEqual(actualCounts, expectedCounts, `${source} strategic node counts should match the selected full layout tiles`)
  return actualCounts
}

function removeFortDockForLegacyPersist(world: WorldState): WorldState {
  return {
    ...world,
    map: {
      ...world.map,
      tiles: world.map.tiles.map((tile) => {
        if (tile.type !== 'fort' && tile.type !== 'dock') {
          return tile
        }
        return {
          ...tile,
          name: `${tile.district ?? 'legacy'} legacy ${tile.x}-${tile.y}`,
          type: 'plain',
          terrain: tile.type === 'dock' ? 'riverland' : tile.terrain,
          resourceLevel: undefined,
          resourceKind: undefined,
        }
      }),
    },
  }
}

async function run() {
  const world = createInitialWorldState()
  const worldCounts = countStrategicNodes(world.map.tiles)
  assertStrategicNodeCounts(worldCounts, 'initial world')
  assertStrategicNodesHaveNoResourcePayload(world)

  for (const footprintId of ['pass_1x1', 'fort_1x1', 'dock_1x1'] as const) {
    const footprint = WORLD_CELL_FOOTPRINT_MANIFEST_V1.footprints[footprintId]
    assert.ok(footprint, `missing footprint ${footprintId}`)
    assert.equal(footprint.drawLayer, 'world_node')
    assert.equal(footprint.placementPolicy.blockResourceGeneration, true)
  }

  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const tail: TailState = { stdout: [], stderr: [] }
  const child = spawnBackend(port, tail, {
    ENABLE_FULL_MAP_LAYOUT: '1',
  })

  try {
    const health = await waitForHealth(baseUrl)
    assert.ok(health, `backend did not become healthy\nstdout=${tail.stdout.join('\n')}\nstderr=${tail.stderr.join('\n')}`)

    const response = await requestJson(baseUrl, '/api/world/map-layout?scope=full', 'GET')
    assert.equal(response.status, 200, `world map-layout route failed: ${JSON.stringify(response.data)}`)
    const layout = readWorldMapLayoutPayload(response.data)
    const layoutCounts = countStrategicNodes(layout.map.tiles)

    assert.deepEqual(layoutCounts, worldCounts, 'HTTP map-layout strategic node counts should match the authoritative world')
    assertStrategicNodeCounts(layoutCounts, 'HTTP map-layout')

    const layoutStrategicNodes = layout.map.tiles.filter(
      (tile) => tile.type === 'pass' || tile.type === 'fort' || tile.type === 'dock',
    )
    assert.ok(layoutStrategicNodes.length > 0, 'HTTP map-layout should include strategic nodes')
    assert.ok(
      layoutStrategicNodes.every(
        (tile) =>
          !Object.prototype.hasOwnProperty.call(tile, 'owner') &&
          !Object.prototype.hasOwnProperty.call(tile, 'enemyPressure'),
      ),
      'map-layout strategic nodes should not expose owner/enemyPressure',
    )

    const provinceId = 'yanzhou'
    const provinceResponse = await requestJson(
      baseUrl,
      `/api/world/map-layout?scope=province&provinceId=${encodeURIComponent(provinceId)}`,
      'GET',
    )
    assert.equal(
      provinceResponse.status,
      200,
      `province map-layout route failed: ${JSON.stringify(provinceResponse.data)}`,
    )
    const provinceLayout = readWorldMapLayoutPayload(provinceResponse.data)
    assert.equal(provinceLayout.chunk?.scope, 'province')
    assert.equal(provinceLayout.chunk?.id, provinceId)
    assertScopedLayoutCounts(
      provinceLayout.map.tiles,
      layout.map.tiles.filter((tile) => tile.district === provinceId),
      'province map-layout',
    )

    const passOnlyProvinceId = Array.from(
      new Set(layout.map.tiles.map((tile) => tile.district).filter((district): district is string => !!district)),
    ).find((district) => {
      const counts = countStrategicNodes(layout.map.tiles.filter((tile) => tile.district === district))
      return counts.pass > 0 && counts.fort === 0 && counts.dock === 0
    })
    assert.ok(passOnlyProvinceId, 'expected at least one loaded province without fort/dock for boundary coverage')
    const passOnlyProvinceResponse = await requestJson(
      baseUrl,
      `/api/world/map-layout?scope=province&provinceId=${encodeURIComponent(passOnlyProvinceId)}`,
      'GET',
    )
    assert.equal(
      passOnlyProvinceResponse.status,
      200,
      `pass-only province map-layout route failed: ${JSON.stringify(passOnlyProvinceResponse.data)}`,
    )
    const passOnlyProvinceLayout = readWorldMapLayoutPayload(passOnlyProvinceResponse.data)
    assert.equal(passOnlyProvinceLayout.chunk?.scope, 'province')
    assert.equal(passOnlyProvinceLayout.chunk?.id, passOnlyProvinceId)
    const passOnlyProvinceCounts = assertScopedLayoutMatches(
      passOnlyProvinceLayout.map.tiles,
      layout.map.tiles.filter((tile) => tile.district === passOnlyProvinceId),
      'province without fort/dock map-layout',
    )
    assert.ok(passOnlyProvinceCounts.pass > 0, 'province without fort/dock should still expose pass nodes')
    assert.equal(passOnlyProvinceCounts.fort, 0)
    assert.equal(passOnlyProvinceCounts.dock, 0)

    const regionId = 'central_plains'
    const centralRegion = layout.map.regions.find((region) => region.id === regionId)
    assert.ok(centralRegion, `missing test region ${regionId}`)
    const regionTileIds = new Set(centralRegion.tileIds)
    const regionResponse = await requestJson(
      baseUrl,
      `/api/world/map-layout?scope=region&regionId=${encodeURIComponent(regionId)}`,
      'GET',
    )
    assert.equal(regionResponse.status, 200, `region map-layout route failed: ${JSON.stringify(regionResponse.data)}`)
    const regionLayout = readWorldMapLayoutPayload(regionResponse.data)
    assert.equal(regionLayout.chunk?.scope, 'region')
    assert.equal(regionLayout.chunk?.id, regionId)
    assertScopedLayoutCounts(
      regionLayout.map.tiles,
      layout.map.tiles.filter((tile) => regionTileIds.has(tile.id)),
      'region map-layout',
    )

    const viewportCenter = layout.map.tiles.find((tile) => regionTileIds.has(tile.id) && tile.type === 'dock')
    assert.ok(viewportCenter, `missing dock viewport center in ${regionId}`)
    const viewportResponse = await requestJson(
      baseUrl,
      `/api/world/map-layout?scope=viewport&layer=region&centerX=${viewportCenter.x}&centerY=${viewportCenter.y}`,
      'GET',
    )
    assert.equal(
      viewportResponse.status,
      200,
      `viewport map-layout route failed: ${JSON.stringify(viewportResponse.data)}`,
    )
    const viewportLayout = readWorldMapLayoutPayload(viewportResponse.data)
    assert.equal(viewportLayout.chunk?.scope, 'viewport')
    assert.equal(viewportLayout.chunk?.id, regionId)
    assertScopedLayoutCounts(
      viewportLayout.map.tiles,
      layout.map.tiles.filter((tile) => regionTileIds.has(tile.id)),
      'viewport region map-layout',
    )

    const viewportProvinceId = viewportCenter.district
    assert.ok(viewportProvinceId, 'dock viewport center should belong to a province')
    const viewportProvinceResponse = await requestJson(
      baseUrl,
      `/api/world/map-layout?scope=viewport&layer=province&centerX=${viewportCenter.x}&centerY=${viewportCenter.y}`,
      'GET',
    )
    assert.equal(
      viewportProvinceResponse.status,
      200,
      `viewport province map-layout route failed: ${JSON.stringify(viewportProvinceResponse.data)}`,
    )
    const viewportProvinceLayout = readWorldMapLayoutPayload(viewportProvinceResponse.data)
    assert.equal(viewportProvinceLayout.chunk?.scope, 'viewport')
    assert.equal(viewportProvinceLayout.chunk?.id, viewportProvinceId)
    assertScopedLayoutCounts(
      viewportProvinceLayout.map.tiles,
      layout.map.tiles.filter((tile) => tile.district === viewportProvinceId),
      'viewport province map-layout',
    )

    const bootstrapResponse = await requestJson(baseUrl, '/api/world/map-layout?scope=bootstrap', 'GET')
    assert.equal(bootstrapResponse.status, 200, `bootstrap map-layout route failed: ${JSON.stringify(bootstrapResponse.data)}`)
    const bootstrapLayout = readWorldMapLayoutPayload(bootstrapResponse.data)
    assert.equal(bootstrapLayout.chunk?.scope, 'bootstrap')

    const missingProvinceResponse = await requestJson(baseUrl, '/api/world/map-layout?scope=province', 'GET')
    assert.equal(
      missingProvinceResponse.status,
      200,
      `missing provinceId map-layout route failed: ${JSON.stringify(missingProvinceResponse.data)}`,
    )
    const missingProvinceLayout = readWorldMapLayoutPayload(missingProvinceResponse.data)
    assert.equal(missingProvinceLayout.chunk?.scope, 'bootstrap')
    assert.deepEqual(
      countStrategicNodes(missingProvinceLayout.map.tiles),
      countStrategicNodes(bootstrapLayout.map.tiles),
      'missing provinceId should fall back to bootstrap instead of full map',
    )

    const missingRegionResponse = await requestJson(baseUrl, '/api/world/map-layout?scope=region', 'GET')
    assert.equal(
      missingRegionResponse.status,
      200,
      `missing regionId map-layout route failed: ${JSON.stringify(missingRegionResponse.data)}`,
    )
    const missingRegionLayout = readWorldMapLayoutPayload(missingRegionResponse.data)
    assert.equal(missingRegionLayout.chunk?.scope, 'bootstrap')
    assert.deepEqual(
      countStrategicNodes(missingRegionLayout.map.tiles),
      countStrategicNodes(bootstrapLayout.map.tiles),
      'missing regionId should fall back to bootstrap instead of full map',
    )

    const invalidProvinceId = '__missing_province_for_map_layout_contract__'
    const invalidProvinceResponse = await requestJson(
      baseUrl,
      `/api/world/map-layout?scope=province&provinceId=${encodeURIComponent(invalidProvinceId)}`,
      'GET',
    )
    assert.equal(
      invalidProvinceResponse.status,
      200,
      `invalid provinceId map-layout route failed: ${JSON.stringify(invalidProvinceResponse.data)}`,
    )
    const invalidProvinceLayout = readWorldMapLayoutPayload(invalidProvinceResponse.data)
    assert.equal(invalidProvinceLayout.chunk?.scope, 'province')
    assert.equal(invalidProvinceLayout.chunk?.id, invalidProvinceId)
    assert.deepEqual(invalidProvinceLayout.chunk?.loadedProvinceIds, [])
    assert.deepEqual(
      countStrategicNodes(invalidProvinceLayout.map.tiles),
      { pass: 0, fort: 0, dock: 0 },
      'invalid provinceId should return an empty province chunk instead of full map',
    )

    const invalidRegionResponse = await requestJson(
      baseUrl,
      '/api/world/map-layout?scope=region&regionId=__missing_region_for_map_layout_contract__',
      'GET',
    )
    assert.equal(
      invalidRegionResponse.status,
      200,
      `invalid regionId map-layout route failed: ${JSON.stringify(invalidRegionResponse.data)}`,
    )
    const invalidRegionLayout = readWorldMapLayoutPayload(invalidRegionResponse.data)
    assert.equal(invalidRegionLayout.chunk?.scope, 'bootstrap')
    assert.deepEqual(
      countStrategicNodes(invalidRegionLayout.map.tiles),
      countStrategicNodes(bootstrapLayout.map.tiles),
      'invalid regionId should fall back to bootstrap instead of full map',
    )
  } finally {
    await shutdownChild(child)
  }

  const guardPort = await getAvailablePort()
  const guardBaseUrl = `http://127.0.0.1:${guardPort}`
  const guardTail: TailState = { stdout: [], stderr: [] }
  const guardChild = spawnBackend(guardPort, guardTail)

  try {
    const health = await waitForHealth(guardBaseUrl)
    assert.ok(
      health,
      `guard backend did not become healthy\nstdout=${guardTail.stdout.join('\n')}\nstderr=${guardTail.stderr.join('\n')}`,
    )

    const guardedFullResponse = await requestJson(guardBaseUrl, '/api/world/map-layout?scope=full', 'GET')
    assert.equal(guardedFullResponse.status, 403, 'default backend should reject full map-layout without debug flag')

    const guardBootstrapResponse = await requestJson(guardBaseUrl, '/api/world/map-layout?scope=bootstrap', 'GET')
    assert.equal(
      guardBootstrapResponse.status,
      200,
      `guard bootstrap map-layout route failed: ${JSON.stringify(guardBootstrapResponse.data)}`,
    )
    const guardBootstrapLayout = readWorldMapLayoutPayload(guardBootstrapResponse.data)
    assert.equal(guardBootstrapLayout.chunk?.scope, 'bootstrap')

    for (const [path, source] of [
      ['/api/world/map-layout?scope=province', 'missing provinceId guard fallback'],
      ['/api/world/map-layout?scope=region', 'missing regionId guard fallback'],
      [
        '/api/world/map-layout?scope=region&regionId=__missing_region_for_map_layout_contract__',
        'invalid regionId guard fallback',
      ],
    ] as const) {
      const response = await requestJson(guardBaseUrl, path, 'GET')
      assert.equal(response.status, 200, `${source} route failed: ${JSON.stringify(response.data)}`)
      const layout = readWorldMapLayoutPayload(response.data)
      assert.equal(layout.chunk?.scope, 'bootstrap')
      assert.deepEqual(
        countStrategicNodes(layout.map.tiles),
        countStrategicNodes(guardBootstrapLayout.map.tiles),
        `${source} should not bypass full map guard`,
      )
    }

    const invalidProvinceResponse = await requestJson(
      guardBaseUrl,
      '/api/world/map-layout?scope=province&provinceId=__missing_province_for_map_layout_contract__',
      'GET',
    )
    assert.equal(
      invalidProvinceResponse.status,
      200,
      `invalid provinceId guard route failed: ${JSON.stringify(invalidProvinceResponse.data)}`,
    )
    const invalidProvinceLayout = readWorldMapLayoutPayload(invalidProvinceResponse.data)
    assert.equal(invalidProvinceLayout.chunk?.scope, 'province')
    assert.deepEqual(
      countStrategicNodes(invalidProvinceLayout.map.tiles),
      { pass: 0, fort: 0, dock: 0 },
      'invalid provinceId guard route should return empty chunk instead of full map',
    )
  } finally {
    await shutdownChild(guardChild)
  }

  const legacyPersistPath = buildSessionPersistPath('world_map_layout_strategic_nodes_legacy_world_state')
  writeFileSync(legacyPersistPath, `${JSON.stringify(removeFortDockForLegacyPersist(world))}\n`, 'utf-8')

  const legacyPort = await getAvailablePort()
  const legacyBaseUrl = `http://127.0.0.1:${legacyPort}`
  const legacyTail: TailState = { stdout: [], stderr: [] }
  const legacyChild = spawnBackend(legacyPort, legacyTail, {
    WORLD_STATE_PERSIST_PATH: legacyPersistPath,
    ENABLE_FULL_MAP_LAYOUT: '1',
  })

  try {
    const health = await waitForHealth(legacyBaseUrl)
    assert.ok(
      health,
      `legacy backend did not become healthy\nstdout=${legacyTail.stdout.join('\n')}\nstderr=${legacyTail.stderr.join('\n')}`,
    )

    const response = await requestJson(legacyBaseUrl, '/api/world/map-layout?scope=full', 'GET')
    assert.equal(response.status, 200, `legacy world map-layout route failed: ${JSON.stringify(response.data)}`)
    const layout = readWorldMapLayoutPayload(response.data)
    const layoutCounts = countStrategicNodes(layout.map.tiles)

    assert.deepEqual(
      layoutCounts,
      worldCounts,
      'legacy persisted worlds should backfill fort/dock into HTTP map-layout',
    )
    assertStrategicNodeCounts(layoutCounts, 'legacy HTTP map-layout')
  } finally {
    await shutdownChild(legacyChild)
  }
}

run().catch((error) => {
  console.error('[world_map_layout_strategic_nodes_contract] failed:', error)
  process.exitCode = 1
})
