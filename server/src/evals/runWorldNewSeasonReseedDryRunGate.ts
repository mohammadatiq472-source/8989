import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'

type GateCheck = {
  name: string
  passed: boolean
  details?: Record<string, unknown>
}

type InspectReport = {
  ok?: boolean
  sourceUrl?: string
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
    levelWeightDistributionWarnings?: string[]
    missingKindTileIds?: string[]
    missingLevelTileIds?: string[]
    invalidLevelTileIds?: string[]
  }
}

type DryRunReport = {
  runId: string
  generatedAt: string
  passed: boolean
  config: {
    port: number
    worldStatePersistPath: string
    worldSeed: string
    generationVersion: string
    levelWeightTable: string
    kindWeightTable: string
  }
  checks: GateCheck[]
  inspectReport: InspectReport | null
  backendTail: {
    stdout: string[]
    stderr: string[]
  }
}

function createRunContext() {
  const runId = `world_new_season_reseed_dry_run_${new Date().toISOString().replace(/[:.]/g, '-')}`
  const runDir = join(process.cwd(), 'tmp', 'gates', 'world-new-season-reseed-dry-run', runId)
  mkdirSync(runDir, { recursive: true })
  return { runId, runDir }
}

async function getAvailablePort() {
  return await new Promise<number>((resolve, reject) => {
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
        resolve(port)
      })
    })
  })
}

function appendTail(target: string[], chunk: string, max = 60) {
  const lines = chunk.split(/\r?\n/).filter((line) => line.trim().length > 0)
  target.push(...lines)
  if (target.length > max) {
    target.splice(0, target.length - max)
  }
}

function spawnBackend(
  port: number,
  runDir: string,
  tail: DryRunReport['backendTail'],
  options: {
    worldStatePersistPath: string
    worldSeed: string
    generationVersion: string
    levelWeightTable: string
    kindWeightTable: string
  },
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
      WORLD_PERSIST_ROOT: runDir,
      WORLD_STATE_PERSIST_PATH: options.worldStatePersistPath,
      WORLD_RESOURCE_SEED: options.worldSeed,
      WORLD_RESOURCE_GENERATION_VERSION: options.generationVersion,
      WORLD_RESOURCE_TILE_DENSITY_PERMILLE: '480',
      WORLD_RESOURCE_LEVEL_WEIGHT_TABLE: options.levelWeightTable,
      WORLD_RESOURCE_KIND_WEIGHT_TABLE: options.kindWeightTable,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout?.on('data', (chunk) => appendTail(tail.stdout, String(chunk)))
  child.stderr?.on('data', (chunk) => appendTail(tail.stderr, String(chunk)))
  return child
}

async function fetchHealth(baseUrl: string) {
  const response = await fetch(new URL('/api/health', baseUrl), { signal: AbortSignal.timeout(5_000) })
  return response.ok
}

async function waitForHealth(baseUrl: string, timeoutMs = 90_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const ok = await fetchHealth(baseUrl).catch(() => false)
    if (ok) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return false
}

async function shutdownChild(child: ChildProcess | null) {
  if (!child || child.exitCode !== null) {
    return
  }

  const pid = child.pid
  const waitForExit = (timeoutMs: number) =>
    new Promise<boolean>((resolve) => {
      if (child.exitCode !== null) {
        resolve(true)
        return
      }
      const timer = setTimeout(() => resolve(false), timeoutMs)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve(true)
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
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
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

function buildChecks(params: {
  healthReady: boolean
  opsStatus: number | null
  inspectReport: InspectReport | null
  worldSeed: string
  generationVersion: string
  worldStatePersistPath: string
  runDir: string
}): GateCheck[] {
  const byLevel = params.inspectReport?.counts?.byLevel ?? {}
  const l01 = byLevel.L01 ?? 0
  const l05 = byLevel.L05 ?? 0
  const l09 = byLevel.L09 ?? 0
  const warnings = params.inspectReport?.validation?.levelWeightDistributionWarnings ?? []
  const missingKind = params.inspectReport?.validation?.missingKindTileIds ?? []
  const missingLevel = params.inspectReport?.validation?.missingLevelTileIds ?? []
  const invalidLevel = params.inspectReport?.validation?.invalidLevelTileIds ?? []

  return [
    {
      name: 'backend_started_with_temp_persist_path',
      passed: params.healthReady && params.worldStatePersistPath.startsWith(params.runDir),
      details: {
        healthReady: params.healthReady,
        worldStatePersistPath: params.worldStatePersistPath,
      },
    },
    {
      name: 'ops_world_resource_generation_exit_zero',
      passed: params.opsStatus === 0,
      details: { status: params.opsStatus },
    },
    {
      name: 'ops_report_ok',
      passed: params.inspectReport?.ok === true,
      details: { ok: params.inspectReport?.ok ?? null },
    },
    {
      name: 'seed_and_generation_version_match_new_season',
      passed:
        params.inspectReport?.generation?.worldSeed === params.worldSeed &&
        params.inspectReport?.generation?.generationVersion === params.generationVersion,
      details: {
        expectedWorldSeed: params.worldSeed,
        actualWorldSeed: params.inspectReport?.generation?.worldSeed ?? null,
        expectedGenerationVersion: params.generationVersion,
        actualGenerationVersion: params.inspectReport?.generation?.generationVersion ?? null,
      },
    },
    {
      name: 'resource_tile_count_matches_metadata',
      passed: params.inspectReport?.map?.resourceTileCountMatchesMetadata === true,
      details: {
        resourceTileCount: params.inspectReport?.map?.resourceTileCount ?? null,
        generatedResourceTileCount: params.inspectReport?.map?.generatedResourceTileCount ?? null,
      },
    },
    {
      name: 'level_distribution_low_to_high',
      passed: l01 > l05 && l05 > l09 && l09 > 0,
      details: { L01: l01, L05: l05, L09: l09 },
    },
    {
      name: 'resource_fields_complete',
      passed: missingKind.length === 0 && missingLevel.length === 0 && invalidLevel.length === 0,
      details: {
        missingKindTileIds: missingKind,
        missingLevelTileIds: missingLevel,
        invalidLevelTileIds: invalidLevel,
      },
    },
    {
      name: 'level_weight_distribution_has_no_warnings',
      passed: warnings.length === 0,
      details: { warnings },
    },
  ]
}

function persistReport(report: DryRunReport, runDir: string) {
  const gateDir = join(process.cwd(), 'tmp', 'gates', 'world-new-season-reseed-dry-run')
  mkdirSync(gateDir, { recursive: true })
  const body = JSON.stringify(report, null, 2)
  writeFileSync(join(runDir, 'report.json'), body, 'utf-8')
  writeFileSync(join(gateDir, 'world_new_season_reseed_dry_run_latest.json'), body, 'utf-8')
}

async function main() {
  const { runId, runDir } = createRunContext()
  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const worldStatePersistPath = join(runDir, 'world_snapshot.json')
  const worldSeed = process.env.WORLD_RESOURCE_DRY_RUN_SEED?.trim() || `${runId}:world_resource_seed`
  const generationVersion =
    process.env.WORLD_RESOURCE_DRY_RUN_GENERATION_VERSION?.trim() || `${runId}:world_resource_generation_v1`
  const levelWeightTable =
    process.env.WORLD_RESOURCE_DRY_RUN_LEVEL_WEIGHT_TABLE?.trim() ||
    '1:360,2:250,3:170,4:110,5:60,6:30,7:12,8:6,9:2'
  const kindWeightTable =
    process.env.WORLD_RESOURCE_DRY_RUN_KIND_WEIGHT_TABLE?.trim() ||
    'food:250,wood:250,stone:250,iron:250'
  const tail: DryRunReport['backendTail'] = { stdout: [], stderr: [] }
  let child: ChildProcess | null = null
  let healthReady = false
  let opsStatus: number | null = null
  let inspectReport: InspectReport | null = null

  try {
    child = spawnBackend(port, runDir, tail, {
      worldStatePersistPath,
      worldSeed,
      generationVersion,
      levelWeightTable,
      kindWeightTable,
    })
    healthReady = await waitForHealth(baseUrl)

    if (healthReady) {
      const ops = runOpsInspect(baseUrl)
      opsStatus = ops.status
      inspectReport = parseLastJsonObject(`${ops.stdout}\n${ops.stderr}`)
      if (!inspectReport && ops.error) {
        inspectReport = { ok: false }
      }
    }
  } finally {
    await shutdownChild(child)
  }

  const checks = buildChecks({
    healthReady,
    opsStatus,
    inspectReport,
    worldSeed,
    generationVersion,
    worldStatePersistPath,
    runDir,
  })
  const report: DryRunReport = {
    runId,
    generatedAt: new Date().toISOString(),
    passed: checks.every((check) => check.passed),
    config: {
      port,
      worldStatePersistPath,
      worldSeed,
      generationVersion,
      levelWeightTable,
      kindWeightTable,
    },
    checks,
    inspectReport,
    backendTail: tail,
  }

  persistReport(report, runDir)
  console.info(JSON.stringify(report, null, 2))
  if (!report.passed) {
    process.exit(1)
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'world new season reseed dry-run gate failed')
  process.exit(1)
})
