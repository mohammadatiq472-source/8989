import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import type {
  ResourceKind,
  WorldMapLayoutResponse,
  WorldResourceGenerationMetadata,
  WorldState,
} from '../../../shared/contracts/game'
import type { WorldResourceGenerationPolicy } from '../../../shared/domain/worldResourceGeneration'

const RESOURCE_KINDS: ResourceKind[] = ['food', 'wood', 'stone', 'iron']
const DEFAULT_BASE_URL = `http://${process.env.HOST ?? '127.0.0.1'}:${process.env.PORT ?? '8787'}`

type Check = {
  name: string
  passed: boolean
  details?: Record<string, unknown>
}

type CutoverReport = {
  ok?: boolean
  serverId?: string
  seasonId?: string
  target?: {
    worldStatePersistPath?: string
    reportPath?: string
    reportMarkdownPath?: string
  }
  policy?: WorldResourceGenerationPolicy
  preview?: {
    generatedResourceTileCount?: number
    levelCounts?: Record<string, number>
    kindCounts?: Record<string, number>
  } | null
  inspectReport?: {
    ok?: boolean
    map?: {
      resourceTileCount?: number
      generatedResourceTileCount?: number | null
      resourceTileCountMatchesMetadata?: boolean | null
    }
    generation?: {
      worldSeed?: string
      generationVersion?: string
      resourceTileDensityPermille?: number
    } | null
    counts?: {
      byKind?: Record<string, number>
      byLevel?: Record<string, number>
    }
  } | null
}

type HealthResponse = {
  ok?: boolean
  persistence?: {
    worldState?: {
      path?: string
      exists?: boolean
      fileSizeBytes?: number | null
      tick?: number
      worldVersion?: number
      resourceGeneration?: WorldResourceGenerationMetadata
    }
  }
}

type CountSummary = {
  generatedResourceTileCount: number
  byLevel: Record<string, number>
  byKind: Record<string, number>
}

type VerifyReport = {
  ok: boolean
  checkedAt: string
  source: {
    reportPath: string
    baseUrl: string | null
    currentPersistPath: string
    expectedPersistPath: string | null
  }
  expected: {
    serverId: string | null
    seasonId: string | null
    persistExists: boolean
    persistBytes: number | null
    persistSha256: string | null
    generation: WorldResourceGenerationMetadata | null
    counts: CountSummary | null
  }
  runtime: {
    skipped: boolean
    healthUrl: string | null
    mapLayoutUrl: string | null
    health: HealthResponse | null
    mapLayout: {
      ok: boolean
      status: number | null
      error: string | null
      generation: WorldResourceGenerationMetadata | null
      counts: CountSummary | null
    } | null
  }
  checks: Check[]
  notes: string[]
}

function hasArg(name: string) {
  return process.argv.includes(name)
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

function createCheck(name: string, passed: boolean, details?: Record<string, unknown>): Check {
  return { name, passed, details }
}

function normalizePathForCompare(path: string) {
  const normalized = resolve(path)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function samePath(left: string | undefined | null, right: string | undefined | null) {
  if (!left || !right) {
    return false
  }
  return normalizePathForCompare(left) === normalizePathForCompare(right)
}

function buildLevelCountTable() {
  const table: Record<string, number> = {}
  for (let level = 1; level <= 9; level += 1) {
    table[`L${String(level).padStart(2, '0')}`] = 0
  }
  table.invalid = 0
  return table
}

function buildKindCountTable() {
  const table: Record<string, number> = {}
  for (const kind of RESOURCE_KINDS) {
    table[kind] = 0
  }
  table.unknown = 0
  return table
}

function increment(table: Record<string, number>, key: string) {
  table[key] = (table[key] ?? 0) + 1
}

function levelKey(level: unknown) {
  if (typeof level !== 'number' || !Number.isInteger(level) || level < 1 || level > 9) {
    return 'invalid'
  }
  return `L${String(level).padStart(2, '0')}`
}

function kindKey(kind: unknown) {
  return RESOURCE_KINDS.includes(kind as ResourceKind) ? String(kind) : 'unknown'
}

function summarizeWorld(world: WorldState): CountSummary {
  const byLevel = buildLevelCountTable()
  const byKind = buildKindCountTable()
  const resourceTiles = world.map.tiles.filter((tile) => tile.type === 'resource')
  for (const tile of resourceTiles) {
    increment(byLevel, levelKey(tile.resourceLevel))
    increment(byKind, kindKey(tile.resourceKind))
  }
  return {
    generatedResourceTileCount: resourceTiles.length,
    byLevel,
    byKind,
  }
}

function summarizeLayout(payload: WorldMapLayoutResponse): CountSummary {
  const byLevel = buildLevelCountTable()
  const byKind = buildKindCountTable()
  const resourceTiles = payload.map.tiles.filter((tile) => tile.type === 'resource')
  for (const tile of resourceTiles) {
    increment(byLevel, levelKey(tile.resourceLevel))
    increment(byKind, kindKey(tile.resourceKind))
  }
  return {
    generatedResourceTileCount: resourceTiles.length,
    byLevel,
    byKind,
  }
}

function resolveCutoverReportPath() {
  const explicit = getArgValue('--report-path') || process.env.WORLD_SEASON_CONFIG_VERIFY_REPORT_PATH?.trim()
  if (explicit) {
    return resolve(explicit)
  }

  const serverId = getArgValue('--server-id') || process.env.WORLD_SEASON_CONFIG_VERIFY_SERVER_ID?.trim()
  const seasonId = getArgValue('--season-id') || process.env.WORLD_SEASON_CONFIG_VERIFY_SEASON_ID?.trim()
  if (!serverId || !seasonId) {
    return ''
  }

  const reportRoot =
    getArgValue('--report-root')
    || process.env.WORLD_SEASON_CONFIG_VERIFY_REPORT_ROOT?.trim()
    || join(process.cwd(), 'tmp', 'ops', 'world-season-cutover')

  return resolve(reportRoot, serverId, seasonId, 'latest.json')
}

function resolveCurrentPersistPath() {
  return resolve(
    getArgValue('--current-persist-path')
    || process.env.WORLD_SEASON_CONFIG_VERIFY_CURRENT_PERSIST_PATH?.trim()
    || process.env.WORLD_STATE_PERSIST_PATH?.trim()
    || join(process.cwd(), 'tmp', 'world_snapshot.json'),
  )
}

function resolveBaseUrl() {
  const raw = getArgValue('--base-url') || getArgValue('--url') || process.env.WORLD_SEASON_CONFIG_VERIFY_BASE_URL?.trim()
  if (!raw) {
    return DEFAULT_BASE_URL
  }

  const url = new URL(raw)
  return url.origin
}

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T
}

function summarizePersistFile(path: string | null) {
  if (!path || !existsSync(path) || statSync(path).isDirectory()) {
    return {
      exists: false,
      bytes: null as number | null,
      sha256: null as string | null,
    }
  }
  const body = readFileSync(path)
  return {
    exists: true,
    bytes: body.length,
    sha256: createHash('sha256').update(body).digest('hex'),
  }
}

function generationMatchesPolicy(
  generation: WorldResourceGenerationMetadata | null | undefined,
  policy: WorldResourceGenerationPolicy | null | undefined,
) {
  if (!generation || !policy) {
    return false
  }
  return generation.worldSeed === policy.worldSeed
    && generation.generationVersion === policy.generationVersion
    && generation.resourceTileDensityPermille === policy.resourceTileDensityPermille
    && JSON.stringify(generation.levelWeightTable) === JSON.stringify(policy.levelWeightTable)
    && JSON.stringify(generation.kindWeightTable) === JSON.stringify(policy.kindWeightTable)
}

function lowToHigh(summary: CountSummary | null | undefined) {
  const l01 = summary?.byLevel.L01 ?? 0
  const l05 = summary?.byLevel.L05 ?? 0
  const l09 = summary?.byLevel.L09 ?? 0
  return l01 > l05 && l05 > l09 && l09 > 0
}

function countsMatchMetadata(summary: CountSummary | null, generation: WorldResourceGenerationMetadata | null | undefined) {
  return Boolean(summary && generation && summary.generatedResourceTileCount === generation.generatedResourceTileCount)
}

function countsMatch(left: CountSummary | null, right: CountSummary | null) {
  if (!left || !right || left.generatedResourceTileCount !== right.generatedResourceTileCount) {
    return false
  }
  return JSON.stringify(left.byLevel) === JSON.stringify(right.byLevel)
    && JSON.stringify(left.byKind) === JSON.stringify(right.byKind)
}

async function fetchJson<T>(url: URL) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`GET ${url.toString()} failed status=${response.status}: ${text.slice(0, 500)}`)
  }
  return (await response.json()) as T
}

async function fetchMapLayout(url: URL) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    return {
      ok: false,
      status: response.status,
      error: `GET failed status=${response.status}: ${text.slice(0, 500)}`,
      payload: null as WorldMapLayoutResponse | null,
    }
  }
  return {
    ok: true,
    status: response.status,
    error: null,
    payload: (await response.json()) as WorldMapLayoutResponse,
  }
}

function writeOutput(report: VerifyReport) {
  const outputPath = getArgValue('--output') || process.env.WORLD_SEASON_CONFIG_VERIFY_OUTPUT?.trim()
  if (!outputPath) {
    return
  }
  const resolved = resolve(outputPath)
  mkdirSync(dirname(resolved), { recursive: true })
  writeFileSync(resolved, `${JSON.stringify(report, null, 2)}\n`, 'utf-8')
}

async function main() {
  const reportPath = resolveCutoverReportPath()
  const currentPersistPath = resolveCurrentPersistPath()
  const baseUrl = resolveBaseUrl()
  const skipRuntime = hasArg('--env-only') || process.env.WORLD_SEASON_CONFIG_VERIFY_ENV_ONLY === '1'
  const skipFullMap = hasArg('--skip-full-map') || process.env.WORLD_SEASON_CONFIG_VERIFY_SKIP_FULL_MAP === '1'
  const checks: Check[] = []
  let cutoverReport: CutoverReport | null = null
  let expectedPersistPath: string | null = null
  let expectedWorld: WorldState | null = null
  let expectedGeneration: WorldResourceGenerationMetadata | null = null
  let expectedCounts: CountSummary | null = null
  let health: HealthResponse | null = null
  let mapLayoutResult: VerifyReport['runtime']['mapLayout'] = null

  checks.push(createCheck('cutover_report_path_resolved', reportPath.length > 0, { reportPath: reportPath || null }))

  if (reportPath && existsSync(reportPath)) {
    cutoverReport = readJsonFile<CutoverReport>(reportPath)
  }
  checks.push(createCheck('cutover_report_exists', Boolean(reportPath && existsSync(reportPath)), { reportPath }))
  checks.push(createCheck('cutover_report_ok', cutoverReport?.ok === true, { ok: cutoverReport?.ok ?? null }))

  expectedPersistPath = cutoverReport?.target?.worldStatePersistPath
    ? resolve(cutoverReport.target.worldStatePersistPath)
    : null
  checks.push(createCheck('expected_persist_path_present', Boolean(expectedPersistPath), { expectedPersistPath }))
  checks.push(createCheck('current_env_persist_path_matches_report', samePath(currentPersistPath, expectedPersistPath), {
    currentPersistPath,
    expectedPersistPath,
  }))

  const expectedFile = summarizePersistFile(expectedPersistPath)
  checks.push(createCheck('expected_persist_file_exists', expectedFile.exists, {
    expectedPersistPath,
    bytes: expectedFile.bytes,
    sha256: expectedFile.sha256,
  }))

  if (expectedPersistPath && expectedFile.exists) {
    expectedWorld = readJsonFile<WorldState>(expectedPersistPath)
    expectedGeneration = expectedWorld.map.resourceGeneration ?? null
    expectedCounts = summarizeWorld(expectedWorld)
  }

  checks.push(createCheck('expected_persist_json_has_world_map', Boolean(expectedWorld?.map?.tiles?.length), {
    tileCount: expectedWorld?.map?.tiles?.length ?? null,
  }))
  checks.push(createCheck('expected_persist_generation_matches_report_policy', generationMatchesPolicy(
    expectedGeneration,
    cutoverReport?.policy,
  ), {
    expectedWorldSeed: cutoverReport?.policy?.worldSeed ?? null,
    actualWorldSeed: expectedGeneration?.worldSeed ?? null,
    expectedGenerationVersion: cutoverReport?.policy?.generationVersion ?? null,
    actualGenerationVersion: expectedGeneration?.generationVersion ?? null,
  }))
  checks.push(createCheck('expected_persist_resource_count_matches_metadata', countsMatchMetadata(
    expectedCounts,
    expectedGeneration,
  ), {
    generatedResourceTileCount: expectedCounts?.generatedResourceTileCount ?? null,
    metadataGeneratedResourceTileCount: expectedGeneration?.generatedResourceTileCount ?? null,
  }))
  checks.push(createCheck('expected_persist_level_distribution_low_to_high', lowToHigh(expectedCounts), {
    L01: expectedCounts?.byLevel.L01 ?? null,
    L05: expectedCounts?.byLevel.L05 ?? null,
    L09: expectedCounts?.byLevel.L09 ?? null,
  }))

  const healthUrl = new URL('/api/health', baseUrl)
  const mapLayoutUrl = new URL('/api/world/map-layout?scope=full', baseUrl)

  if (!skipRuntime) {
    health = await fetchJson<HealthResponse>(healthUrl)
    checks.push(createCheck('runtime_health_ok', health.ok === true, { healthUrl: healthUrl.toString(), ok: health.ok ?? null }))
    checks.push(createCheck('runtime_health_world_persist_path_matches_report', samePath(
      health.persistence?.worldState?.path,
      expectedPersistPath,
    ), {
      runtimeWorldPersistPath: health.persistence?.worldState?.path ?? null,
      expectedPersistPath,
    }))
    checks.push(createCheck('runtime_health_world_persist_exists', health.persistence?.worldState?.exists === true, {
      runtimeWorldPersistPath: health.persistence?.worldState?.path ?? null,
      exists: health.persistence?.worldState?.exists ?? null,
    }))
    checks.push(createCheck('runtime_health_generation_matches_report_policy', generationMatchesPolicy(
      health.persistence?.worldState?.resourceGeneration,
      cutoverReport?.policy,
    ), {
      expectedWorldSeed: cutoverReport?.policy?.worldSeed ?? null,
      actualWorldSeed: health.persistence?.worldState?.resourceGeneration?.worldSeed ?? null,
      expectedGenerationVersion: cutoverReport?.policy?.generationVersion ?? null,
      actualGenerationVersion: health.persistence?.worldState?.resourceGeneration?.generationVersion ?? null,
    }))

    if (!skipFullMap) {
      const fetched = await fetchMapLayout(mapLayoutUrl)
      const layoutCounts = fetched.payload ? summarizeLayout(fetched.payload) : null
      mapLayoutResult = {
        ok: fetched.ok,
        status: fetched.status,
        error: fetched.error,
        generation: fetched.payload?.map.resourceGeneration ?? null,
        counts: layoutCounts,
      }
      checks.push(createCheck('runtime_full_map_layout_ok', fetched.ok, {
        mapLayoutUrl: mapLayoutUrl.toString(),
        status: fetched.status,
        error: fetched.error,
      }))
      checks.push(createCheck('runtime_map_generation_matches_report_policy', generationMatchesPolicy(
        fetched.payload?.map.resourceGeneration,
        cutoverReport?.policy,
      ), {
        expectedWorldSeed: cutoverReport?.policy?.worldSeed ?? null,
        actualWorldSeed: fetched.payload?.map.resourceGeneration?.worldSeed ?? null,
        expectedGenerationVersion: cutoverReport?.policy?.generationVersion ?? null,
        actualGenerationVersion: fetched.payload?.map.resourceGeneration?.generationVersion ?? null,
      }))
      checks.push(createCheck('runtime_map_counts_match_expected_persist', countsMatch(layoutCounts, expectedCounts), {
        expectedGeneratedResourceTileCount: expectedCounts?.generatedResourceTileCount ?? null,
        runtimeGeneratedResourceTileCount: layoutCounts?.generatedResourceTileCount ?? null,
      }))
      checks.push(createCheck('runtime_map_level_distribution_low_to_high', lowToHigh(layoutCounts), {
        L01: layoutCounts?.byLevel.L01 ?? null,
        L05: layoutCounts?.byLevel.L05 ?? null,
        L09: layoutCounts?.byLevel.L09 ?? null,
      }))
    }
  }

  const persistSha = expectedFile.sha256
  const report: VerifyReport = {
    ok: checks.every((check) => check.passed),
    checkedAt: new Date().toISOString(),
    source: {
      reportPath,
      baseUrl: skipRuntime ? null : baseUrl,
      currentPersistPath,
      expectedPersistPath,
    },
    expected: {
      serverId: cutoverReport?.serverId ?? null,
      seasonId: cutoverReport?.seasonId ?? null,
      persistExists: expectedFile.exists,
      persistBytes: expectedFile.bytes,
      persistSha256: persistSha,
      generation: expectedGeneration,
      counts: expectedCounts,
    },
    runtime: {
      skipped: skipRuntime,
      healthUrl: skipRuntime ? null : healthUrl.toString(),
      mapLayoutUrl: skipRuntime || skipFullMap ? null : mapLayoutUrl.toString(),
      health,
      mapLayout: mapLayoutResult,
    },
    checks,
    notes: [
      'This command is read-only and never switches live traffic.',
      'For post-start validation, run the target backend with ENABLE_FULL_MAP_LAYOUT=1 unless using --skip-full-map.',
      'The path match is taken from /api/health persistence.worldState.path, not from a local guess.',
    ],
  }

  writeOutput(report)
  console.info(JSON.stringify(report, null, 2))
  if (!report.ok) {
    process.exit(1)
  }
}

void main().catch((error) => {
  const report: VerifyReport = {
    ok: false,
    checkedAt: new Date().toISOString(),
    source: {
      reportPath: resolveCutoverReportPath(),
      baseUrl: null,
      currentPersistPath: resolveCurrentPersistPath(),
      expectedPersistPath: null,
    },
    expected: {
      serverId: null,
      seasonId: null,
      persistExists: false,
      persistBytes: null,
      persistSha256: null,
      generation: null,
      counts: null,
    },
    runtime: {
      skipped: false,
      healthUrl: null,
      mapLayoutUrl: null,
      health: null,
      mapLayout: null,
    },
    checks: [createCheck('verify_command_completed', false, {
      error: error instanceof Error ? error.message : 'world season config verify failed',
    })],
    notes: [
      'Pass --report-path or --server-id/--season-id.',
      'Start the backend before runtime verification, or use --env-only for pre-start config checks.',
    ],
  }
  console.error(JSON.stringify(report, null, 2))
  process.exit(1)
})
