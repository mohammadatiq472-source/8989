import type { ResourceKind, WorldMapLayoutResponse, WorldMapLayoutTile } from '../../../shared/contracts/game'

const DEFAULT_BASE_URL = `http://${process.env.HOST ?? '127.0.0.1'}:${process.env.PORT ?? '8787'}`
const DEFAULT_URL = `${DEFAULT_BASE_URL}/api/world/map-layout?scope=full`
const RESOURCE_KINDS: ResourceKind[] = ['food', 'wood', 'stone', 'iron']

type CountTable = Record<string, number>

type InspectReport = {
  ok: boolean
  checkedAt: string
  sourceUrl: string
  map?: {
    width: number
    height: number
    totalTileCount: number
    resourceTileCount: number
    generatedResourceTileCount: number | null
    resourceTileCountMatchesMetadata: boolean | null
  }
  generation?: WorldMapLayoutResponse['map']['resourceGeneration'] | null
  counts?: {
    byKind: CountTable
    byLevel: CountTable
    byTerrain: CountTable
  }
  validation: {
    missingResourceGeneration: boolean
    missingKindTileIds: string[]
    missingLevelTileIds: string[]
    invalidLevelTileIds: string[]
    levelWeightDistributionWarnings: string[]
  }
  troubleshooting?: string[]
  error?: string
}

function getArgValue(name: string) {
  const prefix = `${name}=`
  const inline = process.argv.find((arg) => arg.startsWith(prefix))
  if (inline) {
    return inline.slice(prefix.length).trim()
  }

  const index = process.argv.indexOf(name)
  if (index >= 0) {
    return process.argv[index + 1]?.trim()
  }

  return undefined
}

function resolveSourceUrl() {
  const rawUrl = getArgValue('--url') || process.env.WORLD_RESOURCE_INSPECT_URL || DEFAULT_URL
  const url = new URL(rawUrl)
  if (url.pathname.endsWith('/api/world/map-layout') && !url.searchParams.has('scope')) {
    url.searchParams.set('scope', 'full')
  }
  return url
}

function createLevelCountTable() {
  const table: CountTable = {}
  for (let level = 1; level <= 9; level += 1) {
    table[`L${String(level).padStart(2, '0')}`] = 0
  }
  table.invalid = 0
  return table
}

function createKindCountTable() {
  const table: CountTable = {}
  for (const kind of RESOURCE_KINDS) {
    table[kind] = 0
  }
  table.unknown = 0
  return table
}

function increment(table: CountTable, key: string) {
  table[key] = (table[key] ?? 0) + 1
}

function resolveLevelKey(tile: WorldMapLayoutTile) {
  const level = tile.resourceLevel
  if (typeof level !== 'number' || !Number.isInteger(level) || level < 1 || level > 9) {
    return 'invalid'
  }
  return `L${String(level).padStart(2, '0')}`
}

function levelKey(level: number) {
  return `L${String(level).padStart(2, '0')}`
}

function resolveKindKey(tile: WorldMapLayoutTile) {
  return tile.resourceKind && RESOURCE_KINDS.includes(tile.resourceKind) ? tile.resourceKind : 'unknown'
}

function buildLevelWeightDistributionWarnings(
  resourceGeneration: WorldMapLayoutResponse['map']['resourceGeneration'],
  byLevel: CountTable,
) {
  const warnings: string[] = []
  const weights = resourceGeneration?.levelWeightTable ?? []

  for (const heavier of weights) {
    for (const lighter of weights) {
      if (heavier.level === lighter.level) {
        continue
      }
      if (heavier.weight < lighter.weight * 1.5) {
        continue
      }

      const heavierCount = byLevel[levelKey(heavier.level)] ?? 0
      const lighterCount = byLevel[levelKey(lighter.level)] ?? 0
      if (heavierCount <= lighterCount) {
        warnings.push(
          `level ${heavier.level} weight ${heavier.weight} produced ${heavierCount} tiles, `
          + `but level ${lighter.level} weight ${lighter.weight} produced ${lighterCount} tiles`,
        )
      }
    }
  }

  return warnings
}

function buildReport(sourceUrl: string, payload: WorldMapLayoutResponse): InspectReport {
  const resourceTiles = payload.map.tiles.filter((tile) => tile.type === 'resource')
  const byKind = createKindCountTable()
  const byLevel = createLevelCountTable()
  const byTerrain: CountTable = {}
  const missingKindTileIds: string[] = []
  const missingLevelTileIds: string[] = []
  const invalidLevelTileIds: string[] = []

  for (const tile of resourceTiles) {
    increment(byKind, resolveKindKey(tile))
    increment(byLevel, resolveLevelKey(tile))
    increment(byTerrain, tile.terrain ?? 'unknown')

    if (!tile.resourceKind) {
      missingKindTileIds.push(tile.id)
    }
    const level = tile.resourceLevel
    if (level === undefined) {
      missingLevelTileIds.push(tile.id)
    } else if (!Number.isInteger(level) || level < 1 || level > 9) {
      invalidLevelTileIds.push(tile.id)
    }
  }

  const generatedResourceTileCount = payload.map.resourceGeneration?.generatedResourceTileCount ?? null
  const resourceTileCountMatchesMetadata =
    generatedResourceTileCount === null ? null : generatedResourceTileCount === resourceTiles.length
  const levelWeightDistributionWarnings = buildLevelWeightDistributionWarnings(payload.map.resourceGeneration, byLevel)
  const ok =
    Boolean(payload.map.resourceGeneration) &&
    missingKindTileIds.length === 0 &&
    missingLevelTileIds.length === 0 &&
    invalidLevelTileIds.length === 0 &&
    levelWeightDistributionWarnings.length === 0 &&
    resourceTileCountMatchesMetadata !== false

  return {
    ok,
    checkedAt: new Date().toISOString(),
    sourceUrl,
    map: {
      width: payload.map.width,
      height: payload.map.height,
      totalTileCount: payload.map.tiles.length,
      resourceTileCount: resourceTiles.length,
      generatedResourceTileCount,
      resourceTileCountMatchesMetadata,
    },
    generation: payload.map.resourceGeneration ?? null,
    counts: {
      byKind,
      byLevel,
      byTerrain,
    },
    validation: {
      missingResourceGeneration: !payload.map.resourceGeneration,
      missingKindTileIds: missingKindTileIds.slice(0, 20),
      missingLevelTileIds: missingLevelTileIds.slice(0, 20),
      invalidLevelTileIds: invalidLevelTileIds.slice(0, 20),
      levelWeightDistributionWarnings: levelWeightDistributionWarnings.slice(0, 20),
    },
  }
}

async function readErrorBody(response: Response) {
  const text = await response.text()
  try {
    return JSON.stringify(JSON.parse(text))
  } catch {
    return text.slice(0, 500)
  }
}

async function main() {
  const sourceUrl = resolveSourceUrl()
  const response = await fetch(sourceUrl)
  if (!response.ok) {
    const body = await readErrorBody(response)
    const report: InspectReport = {
      ok: false,
      checkedAt: new Date().toISOString(),
      sourceUrl: sourceUrl.toString(),
      validation: {
        missingResourceGeneration: true,
        missingKindTileIds: [],
        missingLevelTileIds: [],
        invalidLevelTileIds: [],
        levelWeightDistributionWarnings: [],
      },
      troubleshooting: [
        'Start the backend before running this command.',
        'For full map inspection, start the backend with ENABLE_FULL_MAP_LAYOUT=1.',
        'Override the target with --url or WORLD_RESOURCE_INSPECT_URL when using a non-default host.',
      ],
      error: `GET failed with status=${response.status}: ${body}`,
    }
    console.info(JSON.stringify(report, null, 2))
    process.exit(2)
  }

  const payload = (await response.json()) as WorldMapLayoutResponse
  const report = buildReport(sourceUrl.toString(), payload)
  console.info(JSON.stringify(report, null, 2))
  if (!report.ok) {
    process.exit(1)
  }
}

void main().catch((error) => {
  const report: InspectReport = {
    ok: false,
    checkedAt: new Date().toISOString(),
    sourceUrl: resolveSourceUrl().toString(),
    validation: {
      missingResourceGeneration: true,
      missingKindTileIds: [],
      missingLevelTileIds: [],
      invalidLevelTileIds: [],
      levelWeightDistributionWarnings: [],
    },
    troubleshooting: [
      'Start the backend before running this command.',
      'For full map inspection, start the backend with ENABLE_FULL_MAP_LAYOUT=1.',
      'Override the target with --url or WORLD_RESOURCE_INSPECT_URL when using a non-default host.',
    ],
    error: error instanceof Error ? error.message : 'world resource inspection failed',
  }
  console.error(JSON.stringify(report, null, 2))
  process.exit(1)
})
