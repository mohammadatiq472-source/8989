import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'

type GateCheck = {
  name: string
  passed: boolean
  details?: Record<string, unknown>
}

type CutoverReport = {
  ok?: boolean
  target?: {
    worldStatePersistPath?: string
    latestReportPath?: string
  }
  policy?: {
    worldSeed?: string
    generationVersion?: string
    resourceTileDensityPermille?: number
    levelWeightTable?: Array<{ level: number; weight: number }>
    kindWeightTable?: Array<{ kind: string; weight: number }>
  }
}

type VerifyReport = {
  ok?: boolean
  checks?: GateCheck[]
  source?: {
    currentPersistPath?: string
    expectedPersistPath?: string | null
  }
  runtime?: {
    health?: {
      persistence?: {
        worldState?: {
          path?: string
        }
      }
    } | null
    mapLayout?: {
      counts?: {
        generatedResourceTileCount?: number
        byLevel?: Record<string, number>
      } | null
    } | null
  }
}

type GateReport = {
  runId: string
  generatedAt: string
  passed: boolean
  config: {
    port: number
    worldStatePersistPath: string
    cutoverReportPath: string
  }
  checks: GateCheck[]
  cutoverStatus: number | null
  verifyStatus: number | null
  verifyReport: VerifyReport | null
  backendTail: {
    stdout: string[]
    stderr: string[]
  }
}

function createRunContext() {
  const runId = `world_season_config_verify_${new Date().toISOString().replace(/[:.]/g, '-')}`
  const runDir = join(process.cwd(), 'tmp', 'gates', 'world-season-config-verify', runId)
  mkdirSync(runDir, { recursive: true })
  return { runId, runDir }
}

function createCheck(name: string, passed: boolean, details?: Record<string, unknown>): GateCheck {
  return { name, passed, details }
}

function parseLastJsonObject<T>(output: string): T | null {
  const start = output.indexOf('{')
  const end = output.lastIndexOf('}')
  if (start < 0 || end < start) {
    return null
  }
  return JSON.parse(output.slice(start, end + 1)) as T
}

function runNpmScript(script: string, args: string[], env?: NodeJS.ProcessEnv) {
  return process.platform === 'win32'
    ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', ['npm', 'run', script, '--', ...args].join(' ')], {
        cwd: process.cwd(),
        encoding: 'utf-8',
        env: env ?? process.env,
      })
    : spawnSync('npm', ['run', script, '--', ...args], {
        cwd: process.cwd(),
        encoding: 'utf-8',
        env: env ?? process.env,
      })
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

function appendTail(target: string[], chunk: string, max = 60) {
  const lines = chunk.split(/\r?\n/).filter((line) => line.trim().length > 0)
  target.push(...lines)
  if (target.length > max) {
    target.splice(0, target.length - max)
  }
}

function spawnBackend(params: {
  port: number
  worldStatePersistPath: string
  cutoverReport: CutoverReport
  tail: GateReport['backendTail']
}) {
  const policy = params.cutoverReport.policy ?? {}
  const inheritedNodeOptions = process.env.NODE_OPTIONS?.trim() ?? ''
  const nodeOptions = inheritedNodeOptions.includes('--max-old-space-size')
    ? inheritedNodeOptions
    : `${inheritedNodeOptions} --max-old-space-size=2048`.trim()
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/src/app.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(params.port),
      GAME_CLOCK_ENABLED: '0',
      NODE_ENV: 'test',
      NODE_OPTIONS: nodeOptions,
      ENABLE_FULL_MAP_LAYOUT: '1',
      WORLD_PERSIST_ROOT: params.worldStatePersistPath.replace(/[\\/][^\\/]+$/, ''),
      WORLD_STATE_PERSIST_PATH: params.worldStatePersistPath,
      WORLD_RESOURCE_SEED: policy.worldSeed ?? '',
      WORLD_RESOURCE_GENERATION_VERSION: policy.generationVersion ?? '',
      WORLD_RESOURCE_TILE_DENSITY_PERMILLE: String(policy.resourceTileDensityPermille ?? 480),
      WORLD_RESOURCE_LEVEL_WEIGHT_TABLE: (policy.levelWeightTable ?? [])
        .map((entry) => `${entry.level}:${entry.weight}`)
        .join(','),
      WORLD_RESOURCE_KIND_WEIGHT_TABLE: (policy.kindWeightTable ?? [])
        .map((entry) => `${entry.kind}:${entry.weight}`)
        .join(','),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout?.on('data', (chunk) => appendTail(params.tail.stdout, String(chunk)))
  child.stderr?.on('data', (chunk) => appendTail(params.tail.stderr, String(chunk)))
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

function persistReport(report: GateReport, runDir: string) {
  const gateDir = join(process.cwd(), 'tmp', 'gates', 'world-season-config-verify')
  mkdirSync(gateDir, { recursive: true })
  const body = `${JSON.stringify(report, null, 2)}\n`
  writeFileSync(join(runDir, 'report.json'), body, 'utf-8')
  writeFileSync(join(gateDir, 'world_season_config_verify_latest.json'), body, 'utf-8')
}

async function main() {
  const { runId, runDir } = createRunContext()
  const serverId = 'local_dev'
  const seasonId = `season_config_verify_${runId}`
  const worldStatePersistPath = join(runDir, 'world_snapshot.json')
  const reportDir = join(runDir, 'cutover-report')
  const cutover = runNpmScript('ops:world:season-cutover:create-persist', [
    `--server-id=${serverId}`,
    `--season-id=${seasonId}`,
    `--persist-path=${worldStatePersistPath}`,
    `--report-dir=${reportDir}`,
    `--confirm-server-id=${serverId}`,
    `--confirm-season-id=${seasonId}`,
    '--confirm-old-world-write-stopped',
  ])
  const cutoverReport = parseLastJsonObject<CutoverReport>(`${cutover.stdout ?? ''}\n${cutover.stderr ?? ''}`)
  const cutoverReportPath = cutoverReport?.target?.latestReportPath ?? join(reportDir, 'latest.json')
  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const backendTail: GateReport['backendTail'] = { stdout: [], stderr: [] }
  let child: ChildProcess | null = null
  let healthReady = false
  let verifyStatus: number | null = null
  let verifyReport: VerifyReport | null = null

  try {
    if (cutover.status === 0 && cutoverReport?.ok === true && cutoverReport.target?.worldStatePersistPath) {
      child = spawnBackend({
        port,
        worldStatePersistPath: cutoverReport.target.worldStatePersistPath,
        cutoverReport,
        tail: backendTail,
      })
      healthReady = await waitForHealth(baseUrl)
      if (healthReady) {
        const verify = runNpmScript('ops:world:season-config:verify', [
          `--report-path=${cutoverReportPath}`,
          `--current-persist-path=${cutoverReport.target.worldStatePersistPath}`,
          `--base-url=${baseUrl}`,
          `--output=${join(runDir, 'verify-report.json')}`,
        ])
        verifyStatus = verify.status
        verifyReport = parseLastJsonObject<VerifyReport>(`${verify.stdout ?? ''}\n${verify.stderr ?? ''}`)
      }
    }
  } finally {
    await shutdownChild(child)
  }

  const l01 = verifyReport?.runtime?.mapLayout?.counts?.byLevel?.L01 ?? 0
  const l05 = verifyReport?.runtime?.mapLayout?.counts?.byLevel?.L05 ?? 0
  const l09 = verifyReport?.runtime?.mapLayout?.counts?.byLevel?.L09 ?? 0
  const pathCheck = verifyReport?.checks?.find((check) => check.name === 'runtime_health_world_persist_path_matches_report')

  const checks = [
    createCheck('cutover_create_exit_zero', cutover.status === 0, { status: cutover.status }),
    createCheck('cutover_report_ok', cutoverReport?.ok === true, { ok: cutoverReport?.ok ?? null }),
    createCheck('cutover_created_persist_exists', Boolean(cutoverReport?.target?.worldStatePersistPath && existsSync(cutoverReport.target.worldStatePersistPath)), {
      worldStatePersistPath: cutoverReport?.target?.worldStatePersistPath ?? null,
    }),
    createCheck('backend_started_with_cutover_persist', healthReady, { baseUrl }),
    createCheck('season_config_verify_exit_zero', verifyStatus === 0, { status: verifyStatus }),
    createCheck('season_config_verify_report_ok', verifyReport?.ok === true, { ok: verifyReport?.ok ?? null }),
    createCheck('runtime_health_path_check_passed', pathCheck?.passed === true, {
      runtimeWorldPersistPath: verifyReport?.runtime?.health?.persistence?.worldState?.path ?? null,
      expectedPersistPath: verifyReport?.source?.expectedPersistPath ?? null,
    }),
    createCheck('runtime_level_distribution_low_to_high', l01 > l05 && l05 > l09 && l09 > 0, { L01: l01, L05: l05, L09: l09 }),
  ]
  const report: GateReport = {
    runId,
    generatedAt: new Date().toISOString(),
    passed: checks.every((check) => check.passed),
    config: {
      port,
      worldStatePersistPath: cutoverReport?.target?.worldStatePersistPath ?? worldStatePersistPath,
      cutoverReportPath,
    },
    checks,
    cutoverStatus: cutover.status,
    verifyStatus,
    verifyReport,
    backendTail,
  }

  persistReport(report, runDir)
  console.info(JSON.stringify(report, null, 2))
  if (!report.passed) {
    process.exit(1)
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'world season config verify gate failed')
  process.exit(1)
})
