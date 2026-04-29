import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join, relative, resolve } from 'node:path'

import type { ResourceKind, WorldState } from '../../../shared/contracts/game'
import { createInitialWorldState } from '../../../shared/domain/scenario'
import {
  DEFAULT_WORLD_RESOURCE_GENERATION_POLICY,
  type WorldResourceGenerationPolicy,
  type WorldResourceKindWeight,
  type WorldResourceLevelWeight,
} from '../../../shared/domain/worldResourceGeneration'

const RESOURCE_KINDS: ResourceKind[] = ['food', 'wood', 'stone', 'iron']
const DEFAULT_LEVEL_WEIGHT_TABLE = '1:360,2:250,3:170,4:110,5:60,6:30,7:12,8:6,9:2'
const DEFAULT_KIND_WEIGHT_TABLE = 'food:250,wood:250,stone:250,iron:250'

type Check = {
  name: string
  passed: boolean
  details?: Record<string, unknown>
}

type InspectReport = {
  ok?: boolean
  map?: {
    resourceTileCount?: number
    generatedResourceTileCount?: number | null
    resourceTileCountMatchesMetadata?: boolean | null
  }
  generation?: {
    worldSeed?: string
    generationVersion?: string
  } | null
  counts?: {
    byLevel?: Record<string, number>
  }
  validation?: {
    missingKindTileIds?: string[]
    missingLevelTileIds?: string[]
    invalidLevelTileIds?: string[]
    levelWeightDistributionWarnings?: string[]
  }
}

type CutoverReport = {
  ok: boolean
  mode: 'precheck' | 'create-persist'
  checkedAt: string
  runId: string
  serverId: string
  seasonId: string
  target: {
    oldWorldStatePersistPath: string
    oldPersistExists: boolean
    oldPersistBytes: number | null
    oldPersistSha256: string | null
    worldStatePersistPath: string
    reportDir: string
    reportPath: string
    reportMarkdownPath: string
    latestReportPath: string
    latestReportMarkdownPath: string
  }
  policy: WorldResourceGenerationPolicy
  precheck: Check[]
  preview: {
    generatedResourceTileCount: number
    levelCounts: Record<string, number>
    kindCounts: Record<string, number>
  } | null
  creation: {
    created: boolean
    bytes: number | null
  } | null
  postCreateChecks: Check[]
  inspectReport: InspectReport | null
  backendTail: {
    stdout: string[]
    stderr: string[]
  }
  humanConfirmation: {
    requiredForCreate: boolean
    received: boolean
    oldWorldWriteStopped: boolean
    requiredArgs: string[]
  }
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

function sanitizePathSegment(value: string) {
  return value.replace(/[^A-Za-z0-9_.:-]+/g, '_')
}

function isNonEmptyId(value: string | undefined) {
  return Boolean(value && /^[A-Za-z0-9][A-Za-z0-9_.:-]{1,79}$/.test(value))
}

function isPathInsideStrict(parentRaw: string, childRaw: string) {
  const parent = resolve(parentRaw)
  const child = resolve(childRaw)
  const rel = relative(parent, child)
  return rel === '' || (!!rel && !rel.startsWith('..') && !rel.includes(':'))
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value?.trim()) {
    return { value: fallback, errors: [] as string[] }
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    return { value: fallback, errors: [`expected a positive integer, got ${value}`] }
  }
  return { value: parsed, errors: [] as string[] }
}

function readRawTableEntries(raw: string): unknown[] | Record<string, unknown> {
  const trimmed = raw.trim()
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return JSON.parse(trimmed) as unknown[] | Record<string, unknown>
  }
  return trimmed.split(',').map((entry) => {
    const [key, weight] = entry.split(':')
    return { key: key?.trim(), weight: weight?.trim() }
  })
}

function normalizeWeight(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined
  }
  return Math.floor(parsed)
}

function parseLevelWeightTable(raw: string | undefined) {
  const source = raw?.trim() || DEFAULT_LEVEL_WEIGHT_TABLE
  const errors: string[] = []
  const entries: WorldResourceLevelWeight[] = []

  try {
    const parsed = readRawTableEntries(source)
    const rows = Array.isArray(parsed)
      ? parsed
      : Object.entries(parsed).map(([level, weight]) => ({ level, weight }))

    for (const row of rows) {
      const record = row as Record<string, unknown>
      const rawLevel = record.level ?? record.key
      const level = Number(String(rawLevel ?? '').trim())
      const weight = normalizeWeight(record.weight)
      if (!Number.isInteger(level) || level < 1 || level > 9 || weight === undefined) {
        errors.push(`invalid level weight entry: ${JSON.stringify(row)}`)
        continue
      }
      entries.push({ level, weight })
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'failed to parse level weight table')
  }

  if (entries.length === 0) {
    errors.push('level weight table must contain at least one valid entry')
    return { value: DEFAULT_WORLD_RESOURCE_GENERATION_POLICY.levelWeightTable, errors }
  }

  return { value: entries, errors }
}

function isResourceKind(value: unknown): value is ResourceKind {
  return RESOURCE_KINDS.includes(value as ResourceKind)
}

function parseKindWeightTable(raw: string | undefined) {
  const source = raw?.trim() || DEFAULT_KIND_WEIGHT_TABLE
  const errors: string[] = []
  const entries: WorldResourceKindWeight[] = []

  try {
    const parsed = readRawTableEntries(source)
    const rows = Array.isArray(parsed)
      ? parsed
      : Object.entries(parsed).map(([kind, weight]) => ({ kind, weight }))

    for (const row of rows) {
      const record = row as Record<string, unknown>
      const kind = record.kind ?? record.key
      const weight = normalizeWeight(record.weight)
      if (!isResourceKind(kind) || weight === undefined) {
        errors.push(`invalid kind weight entry: ${JSON.stringify(row)}`)
        continue
      }
      entries.push({ kind, weight })
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'failed to parse kind weight table')
  }

  if (entries.length === 0) {
    errors.push('kind weight table must contain at least one valid entry')
    return { value: DEFAULT_WORLD_RESOURCE_GENERATION_POLICY.kindWeightTable, errors }
  }

  return { value: entries, errors }
}

function buildPolicy(serverId: string, seasonId: string) {
  const density = parsePositiveInteger(
    getArgValue('--density-permille') || process.env.WORLD_RESOURCE_TILE_DENSITY_PERMILLE,
    DEFAULT_WORLD_RESOURCE_GENERATION_POLICY.resourceTileDensityPermille,
  )
  const levelWeightTable = parseLevelWeightTable(
    getArgValue('--level-weight-table') || process.env.WORLD_RESOURCE_LEVEL_WEIGHT_TABLE,
  )
  const kindWeightTable = parseKindWeightTable(
    getArgValue('--kind-weight-table') || process.env.WORLD_RESOURCE_KIND_WEIGHT_TABLE,
  )
  const policy: WorldResourceGenerationPolicy = {
    worldSeed:
      getArgValue('--world-seed')
      || process.env.WORLD_RESOURCE_SEED?.trim()
      || `${serverId}:${seasonId}:world_resource:v1`,
    generationVersion:
      getArgValue('--generation-version')
      || process.env.WORLD_RESOURCE_GENERATION_VERSION?.trim()
      || `world_resource_generation_${seasonId}_v1`,
    resourceTileDensityPermille: Math.max(1, Math.min(1000, density.value)),
    levelWeightTable: levelWeightTable.value,
    kindWeightTable: kindWeightTable.value,
  }

  return {
    policy,
    errors: [
      ...density.errors.map((error) => `density: ${error}`),
      ...levelWeightTable.errors.map((error) => `levelWeightTable: ${error}`),
      ...kindWeightTable.errors.map((error) => `kindWeightTable: ${error}`),
    ],
  }
}

function createCheck(name: string, passed: boolean, details?: Record<string, unknown>): Check {
  return { name, passed, details }
}

function summarizeWorld(world: WorldState) {
  const generation = world.map.resourceGeneration
  return {
    generatedResourceTileCount: generation?.generatedResourceTileCount ?? 0,
    levelCounts: generation?.levelCounts ?? {},
    kindCounts: generation?.kindCounts ?? { food: 0, wood: 0, stone: 0, iron: 0 },
  }
}

function summarizePersistFile(path: string) {
  if (!existsSync(path) || statSync(path).isDirectory()) {
    return {
      exists: false,
      bytes: null,
      sha256: null,
    }
  }

  const body = readFileSync(path)
  return {
    exists: true,
    bytes: body.length,
    sha256: createHash('sha256').update(body).digest('hex'),
  }
}

function appendTail(target: string[], chunk: string, max = 60) {
  const lines = chunk.split(/\r?\n/).filter((line) => line.trim().length > 0)
  target.push(...lines)
  if (target.length > max) {
    target.splice(0, target.length - max)
  }
}

async function getAvailablePort() {
  return await new Promise<number>((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('failed to allocate port')))
        return
      }
      const { port } = address
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolvePort(port)
      })
    })
  })
}

function spawnBackend(
  port: number,
  worldStatePersistPath: string,
  policy: WorldResourceGenerationPolicy,
  tail: CutoverReport['backendTail'],
) {
  const inheritedNodeOptions = process.env.NODE_OPTIONS?.trim() ?? ''
  const nodeOptions = inheritedNodeOptions.includes('--max-old-space-size')
    ? inheritedNodeOptions
    : `${inheritedNodeOptions} --max-old-space-size=2048`.trim()
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/src/app.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      GAME_CLOCK_ENABLED: '0',
      NODE_ENV: 'test',
      NODE_OPTIONS: nodeOptions,
      ENABLE_FULL_MAP_LAYOUT: '1',
      WORLD_PERSIST_ROOT: dirname(worldStatePersistPath),
      WORLD_STATE_PERSIST_PATH: worldStatePersistPath,
      WORLD_RESOURCE_SEED: policy.worldSeed,
      WORLD_RESOURCE_GENERATION_VERSION: policy.generationVersion,
      WORLD_RESOURCE_TILE_DENSITY_PERMILLE: String(policy.resourceTileDensityPermille),
      WORLD_RESOURCE_LEVEL_WEIGHT_TABLE: policy.levelWeightTable
        .map((entry) => `${entry.level}:${entry.weight}`)
        .join(','),
      WORLD_RESOURCE_KIND_WEIGHT_TABLE: policy.kindWeightTable
        .map((entry) => `${entry.kind}:${entry.weight}`)
        .join(','),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout?.on('data', (chunk) => appendTail(tail.stdout, String(chunk)))
  child.stderr?.on('data', (chunk) => appendTail(tail.stderr, String(chunk)))
  return child
}

async function waitForHealth(baseUrl: string, timeoutMs = 90_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const ok = await fetch(new URL('/api/health', baseUrl), { signal: AbortSignal.timeout(5_000) })
      .then((response) => response.ok)
      .catch(() => false)
    if (ok) {
      return true
    }
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 500))
  }
  return false
}

async function shutdownChild(child: ChildProcess | null) {
  if (!child || child.exitCode !== null) {
    return
  }

  const pid = child.pid
  const waitForExit = (timeoutMs: number) =>
    new Promise<boolean>((resolveExit) => {
      if (child.exitCode !== null) {
        resolveExit(true)
        return
      }
      const timer = setTimeout(() => resolveExit(false), timeoutMs)
      child.once('exit', () => {
        clearTimeout(timer)
        resolveExit(true)
      })
    })

  child.kill('SIGINT')
  const exited = await waitForExit(8_000)
  if (!exited && pid) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      child.kill('SIGKILL')
    }
    await waitForExit(8_000)
  }

  child.stdout?.destroy()
  child.stderr?.destroy()
}

function runOpsInspect(baseUrl: string) {
  const env = {
    ...process.env,
    WORLD_RESOURCE_INSPECT_URL: `${baseUrl}/api/world/map-layout?scope=full`,
  }
  const result =
    process.platform === 'win32'
      ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npm run ops:world:resource-generation'], {
          cwd: process.cwd(),
          encoding: 'utf-8',
          env,
        })
      : spawnSync('npm', ['run', 'ops:world:resource-generation'], {
          cwd: process.cwd(),
          encoding: 'utf-8',
          env,
        })

  return {
    status: result.status,
    output: `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    error: result.error?.message,
  }
}

function parseLastJsonObject(output: string): InspectReport | null {
  const start = output.indexOf('{')
  const end = output.lastIndexOf('}')
  if (start < 0 || end < start) {
    return null
  }
  return JSON.parse(output.slice(start, end + 1)) as InspectReport
}

function writeReport(report: CutoverReport) {
  mkdirSync(report.target.reportDir, { recursive: true })
  const body = JSON.stringify(report, null, 2)
  const markdown = renderMarkdownReport(report)
  writeFileSync(report.target.reportPath, body, 'utf-8')
  writeFileSync(report.target.latestReportPath, body, 'utf-8')
  writeFileSync(report.target.reportMarkdownPath, markdown, 'utf-8')
  writeFileSync(report.target.latestReportMarkdownPath, markdown, 'utf-8')
}

function formatCheckList(checks: Check[]) {
  if (checks.length === 0) {
    return '- none'
  }
  return checks
    .map((check) => `- ${check.passed ? 'PASS' : 'FAIL'} ${check.name}`)
    .join('\n')
}

function renderMarkdownReport(report: CutoverReport) {
  const previewLevels = report.preview?.levelCounts ?? {}
  const inspectLevels = report.inspectReport?.counts?.byLevel ?? {}
  return [
    `# World Season Cutover Report`,
    ``,
    `- ok: ${report.ok}`,
    `- mode: ${report.mode}`,
    `- checkedAt: ${report.checkedAt}`,
    `- runId: ${report.runId}`,
    `- serverId: ${report.serverId}`,
    `- seasonId: ${report.seasonId}`,
    ``,
    `## Persist`,
    ``,
    `- oldWorldStatePersistPath: ${report.target.oldWorldStatePersistPath}`,
    `- oldPersistExists: ${report.target.oldPersistExists}`,
    `- oldPersistBytes: ${report.target.oldPersistBytes ?? 'null'}`,
    `- oldPersistSha256: ${report.target.oldPersistSha256 ?? 'null'}`,
    `- newWorldStatePersistPath: ${report.target.worldStatePersistPath}`,
    `- created: ${report.creation?.created ?? false}`,
    `- createdBytes: ${report.creation?.bytes ?? 'null'}`,
    ``,
    `## Policy`,
    ``,
    `- worldSeed: ${report.policy.worldSeed}`,
    `- generationVersion: ${report.policy.generationVersion}`,
    `- resourceTileDensityPermille: ${report.policy.resourceTileDensityPermille}`,
    `- levelWeightTable: ${report.policy.levelWeightTable.map((entry) => `${entry.level}:${entry.weight}`).join(',')}`,
    `- kindWeightTable: ${report.policy.kindWeightTable.map((entry) => `${entry.kind}:${entry.weight}`).join(',')}`,
    ``,
    `## Confirmation`,
    ``,
    `- createConfirmed: ${report.humanConfirmation.received}`,
    `- oldWorldWriteStopped: ${report.humanConfirmation.oldWorldWriteStopped}`,
    `- requiredArgs: ${report.humanConfirmation.requiredArgs.join(' ')}`,
    ``,
    `## Preview Counts`,
    ``,
    `- generatedResourceTileCount: ${report.preview?.generatedResourceTileCount ?? 'null'}`,
    `- L01: ${previewLevels['1'] ?? 0}`,
    `- L05: ${previewLevels['5'] ?? 0}`,
    `- L09: ${previewLevels['9'] ?? 0}`,
    ``,
    `## Runtime Inspect Counts`,
    ``,
    `- inspectOk: ${report.inspectReport?.ok ?? false}`,
    `- L01: ${inspectLevels.L01 ?? 0}`,
    `- L05: ${inspectLevels.L05 ?? 0}`,
    `- L09: ${inspectLevels.L09 ?? 0}`,
    ``,
    `## Precheck`,
    ``,
    formatCheckList(report.precheck),
    ``,
    `## Post Create Checks`,
    ``,
    formatCheckList(report.postCreateChecks),
    ``,
    `## Notes`,
    ``,
    ...report.notes.map((note) => `- ${note}`),
    ``,
  ].join('\n')
}

async function inspectCreatedPersist(worldStatePersistPath: string, policy: WorldResourceGenerationPolicy) {
  const tail: CutoverReport['backendTail'] = { stdout: [], stderr: [] }
  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  let child: ChildProcess | null = null
  let healthReady = false
  let opsStatus: number | null = null
  let inspectReport: InspectReport | null = null

  try {
    child = spawnBackend(port, worldStatePersistPath, policy, tail)
    healthReady = await waitForHealth(baseUrl)
    if (healthReady) {
      const ops = runOpsInspect(baseUrl)
      opsStatus = ops.status
      inspectReport = parseLastJsonObject(ops.output)
      if (!inspectReport && ops.error) {
        inspectReport = { ok: false }
      }
    }
  } finally {
    await shutdownChild(child)
  }

  const byLevel = inspectReport?.counts?.byLevel ?? {}
  const l01 = byLevel.L01 ?? 0
  const l05 = byLevel.L05 ?? 0
  const l09 = byLevel.L09 ?? 0
  const warnings = inspectReport?.validation?.levelWeightDistributionWarnings ?? []
  const missingKind = inspectReport?.validation?.missingKindTileIds ?? []
  const missingLevel = inspectReport?.validation?.missingLevelTileIds ?? []
  const invalidLevel = inspectReport?.validation?.invalidLevelTileIds ?? []

  return {
    tail,
    inspectReport,
    checks: [
      createCheck('backend_started_with_created_persist', healthReady, { worldStatePersistPath }),
      createCheck('ops_world_resource_generation_exit_zero', opsStatus === 0, { status: opsStatus }),
      createCheck('ops_report_ok', inspectReport?.ok === true, { ok: inspectReport?.ok ?? null }),
      createCheck(
        'seed_and_generation_version_match_cutover',
        inspectReport?.generation?.worldSeed === policy.worldSeed
        && inspectReport?.generation?.generationVersion === policy.generationVersion,
        {
          expectedWorldSeed: policy.worldSeed,
          actualWorldSeed: inspectReport?.generation?.worldSeed ?? null,
          expectedGenerationVersion: policy.generationVersion,
          actualGenerationVersion: inspectReport?.generation?.generationVersion ?? null,
        },
      ),
      createCheck('resource_tile_count_matches_metadata', inspectReport?.map?.resourceTileCountMatchesMetadata === true, {
        resourceTileCount: inspectReport?.map?.resourceTileCount ?? null,
        generatedResourceTileCount: inspectReport?.map?.generatedResourceTileCount ?? null,
      }),
      createCheck('level_distribution_low_to_high', l01 > l05 && l05 > l09 && l09 > 0, { L01: l01, L05: l05, L09: l09 }),
      createCheck('resource_fields_complete', missingKind.length === 0 && missingLevel.length === 0 && invalidLevel.length === 0, {
        missingKindTileIds: missingKind,
        missingLevelTileIds: missingLevel,
        invalidLevelTileIds: invalidLevel,
      }),
      createCheck('level_weight_distribution_has_no_warnings', warnings.length === 0, { warnings }),
    ],
  }
}

async function main() {
  const confirmed = hasArg('--confirm-create-persist')
  const serverId = getArgValue('--server-id') || process.env.WORLD_SEASON_CUTOVER_SERVER_ID?.trim() || ''
  const seasonId = getArgValue('--season-id') || process.env.WORLD_SEASON_CUTOVER_SEASON_ID?.trim() || ''
  const safeServerId = sanitizePathSegment(serverId || 'missing_server')
  const safeSeasonId = sanitizePathSegment(seasonId || 'missing_season')
  const runId = `world_season_cutover_${safeServerId}_${safeSeasonId}_${new Date().toISOString().replace(/[:.]/g, '-')}`
  const cutoverRoot = resolve(
    getArgValue('--root')
    || process.env.WORLD_SEASON_CUTOVER_ROOT?.trim()
    || join(process.cwd(), 'tmp', 'world-season-cutovers'),
  )
  const worldStatePersistPath = resolve(
    getArgValue('--persist-path')
    || process.env.WORLD_SEASON_CUTOVER_PERSIST_PATH?.trim()
    || join(cutoverRoot, safeServerId, safeSeasonId, 'world_snapshot.json'),
  )
  const reportDir = resolve(
    getArgValue('--report-dir')
    || process.env.WORLD_SEASON_CUTOVER_REPORT_DIR?.trim()
    || join(process.cwd(), 'tmp', 'ops', 'world-season-cutover', safeServerId, safeSeasonId),
  )
  const reportPath = join(reportDir, `${runId}.json`)
  const reportMarkdownPath = join(reportDir, `${runId}.md`)
  const latestReportPath = join(reportDir, 'latest.json')
  const latestReportMarkdownPath = join(reportDir, 'latest.md')
  const currentPersistPath = resolve(
    process.env.WORLD_STATE_PERSIST_PATH?.trim() || join(process.cwd(), 'tmp', 'world_snapshot.json'),
  )
  const oldWorldStatePersistPath = resolve(
    getArgValue('--old-persist-path')
    || process.env.WORLD_SEASON_CUTOVER_OLD_PERSIST_PATH?.trim()
    || currentPersistPath,
  )
  const oldPersist = summarizePersistFile(oldWorldStatePersistPath)
  const requireOldPersist =
    hasArg('--require-old-persist') || process.env.WORLD_SEASON_CUTOVER_REQUIRE_OLD_PERSIST === '1'
  const confirmOldWorldWriteStopped =
    hasArg('--confirm-old-world-write-stopped') || process.env.WORLD_SEASON_CUTOVER_CONFIRM_OLD_WORLD_WRITE_STOPPED === '1'
  const tmpRoot = resolve(process.cwd(), 'tmp')
  const parentPath = dirname(worldStatePersistPath)
  const targetExists = existsSync(worldStatePersistPath)
  const parentIsUsable = !existsSync(parentPath) || statSync(parentPath).isDirectory()
  const allowNonTmpTarget = hasArg('--allow-non-tmp-target') || process.env.WORLD_SEASON_CUTOVER_ALLOW_NON_TMP_TARGET === '1'
  const confirmServerId = getArgValue('--confirm-server-id') || process.env.WORLD_SEASON_CUTOVER_CONFIRM_SERVER_ID?.trim()
  const confirmSeasonId = getArgValue('--confirm-season-id') || process.env.WORLD_SEASON_CUTOVER_CONFIRM_SEASON_ID?.trim()
  const { policy, errors } = buildPolicy(serverId, seasonId)
  const previewWorld = createInitialWorldState({ resourceGenerationPolicy: policy })
  const preview = summarizeWorld(previewWorld)
  const previewL01 = preview.levelCounts['1'] ?? 0
  const previewL05 = preview.levelCounts['5'] ?? 0
  const previewL09 = preview.levelCounts['9'] ?? 0

  const precheck = [
    createCheck('server_id_present_and_valid', isNonEmptyId(serverId), { serverId }),
    createCheck('season_id_present_and_valid', isNonEmptyId(seasonId), { seasonId }),
    createCheck('policy_inputs_valid', errors.length === 0, { errors }),
    createCheck('world_seed_present', policy.worldSeed.trim().length > 0, { worldSeed: policy.worldSeed }),
    createCheck('generation_version_present', policy.generationVersion.trim().length > 0, {
      generationVersion: policy.generationVersion,
    }),
    createCheck('target_is_new_file', !targetExists, { worldStatePersistPath }),
    createCheck('target_parent_is_directory_or_missing', parentIsUsable, { parentPath }),
    createCheck('target_not_current_live_persist_path', worldStatePersistPath !== currentPersistPath, {
      worldStatePersistPath,
      currentPersistPath,
    }),
    createCheck('target_not_old_persist_path', worldStatePersistPath !== oldWorldStatePersistPath, {
      worldStatePersistPath,
      oldWorldStatePersistPath,
    }),
    createCheck('old_persist_exists_when_required', !requireOldPersist || oldPersist.exists, {
      oldWorldStatePersistPath,
      requireOldPersist,
      oldPersistExists: oldPersist.exists,
    }),
    createCheck('old_world_write_stopped_confirmed_for_create', !confirmed || confirmOldWorldWriteStopped, {
      confirmed,
      confirmOldWorldWriteStopped,
    }),
    createCheck('target_inside_tmp_or_explicitly_allowed', allowNonTmpTarget || isPathInsideStrict(tmpRoot, worldStatePersistPath), {
      worldStatePersistPath,
      tmpRoot,
      allowNonTmpTarget,
    }),
    createCheck('preview_has_resource_tiles', preview.generatedResourceTileCount > 0, {
      generatedResourceTileCount: preview.generatedResourceTileCount,
    }),
    createCheck('preview_level_distribution_low_to_high', previewL01 > previewL05 && previewL05 > previewL09 && previewL09 > 0, {
      L01: previewL01,
      L05: previewL05,
      L09: previewL09,
    }),
    createCheck(
      'human_confirmation_matches_target',
      !confirmed || (confirmServerId === serverId && confirmSeasonId === seasonId),
      {
        confirmed,
        confirmServerId: confirmServerId ?? null,
        confirmSeasonId: confirmSeasonId ?? null,
      },
    ),
  ]
  const precheckPassed = precheck.every((check) => check.passed)
  let creation: CutoverReport['creation'] = null
  let postCreateChecks: Check[] = []
  let inspectReport: InspectReport | null = null
  let backendTail: CutoverReport['backendTail'] = { stdout: [], stderr: [] }

  if (confirmed && precheckPassed) {
    mkdirSync(parentPath, { recursive: true })
    const payload = `${JSON.stringify(previewWorld)}\n`
    writeFileSync(worldStatePersistPath, payload, 'utf-8')
    creation = {
      created: true,
      bytes: statSync(worldStatePersistPath).size,
    }
    const postCreate = await inspectCreatedPersist(worldStatePersistPath, policy)
    postCreateChecks = postCreate.checks
    inspectReport = postCreate.inspectReport
    backendTail = postCreate.tail
  } else if (confirmed && !precheckPassed) {
    creation = { created: false, bytes: null }
  }

  const report: CutoverReport = {
    ok: precheckPassed && (!confirmed || postCreateChecks.every((check) => check.passed)),
    mode: confirmed ? 'create-persist' : 'precheck',
    checkedAt: new Date().toISOString(),
    runId,
    serverId,
    seasonId,
    target: {
      oldWorldStatePersistPath,
      oldPersistExists: oldPersist.exists,
      oldPersistBytes: oldPersist.bytes,
      oldPersistSha256: oldPersist.sha256,
      worldStatePersistPath,
      reportDir,
      reportPath,
      reportMarkdownPath,
      latestReportPath,
      latestReportMarkdownPath,
    },
    policy,
    precheck,
    preview,
    creation,
    postCreateChecks,
    inspectReport,
    backendTail,
    humanConfirmation: {
      requiredForCreate: true,
      received: confirmed,
      oldWorldWriteStopped: confirmOldWorldWriteStopped,
      requiredArgs: [
        '--confirm-create-persist',
        `--confirm-server-id=${serverId}`,
        `--confirm-season-id=${seasonId}`,
        '--confirm-old-world-write-stopped',
      ],
    },
    notes: [
      'This operation prepares a new season world persist file; it does not switch live traffic.',
      'Do not reuse an existing WORLD_STATE_PERSIST_PATH for a new season.',
      'After human review, start the new season backend with the reported worldStatePersistPath.',
    ],
  }

  writeReport(report)
  console.info(JSON.stringify(report, null, 2))
  if (!report.ok) {
    process.exit(1)
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'world season cutover prepare failed')
  process.exit(1)
})
