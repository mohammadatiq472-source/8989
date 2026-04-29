import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

type GateCheck = {
  name: string
  passed: boolean
  details?: Record<string, unknown>
}

type CutoverOpsReport = {
  ok?: boolean
  mode?: string
  serverId?: string
  seasonId?: string
  target?: {
    worldStatePersistPath?: string
    reportPath?: string
    reportMarkdownPath?: string
    latestReportPath?: string
    latestReportMarkdownPath?: string
  }
  creation?: {
    created?: boolean
    bytes?: number | null
  } | null
  precheck?: GateCheck[]
  postCreateChecks?: GateCheck[]
  inspectReport?: {
    ok?: boolean
    generation?: {
      worldSeed?: string
      generationVersion?: string
    } | null
    counts?: {
      byLevel?: Record<string, number>
    }
  } | null
}

type GateReport = {
  runId: string
  generatedAt: string
  passed: boolean
  config: {
    serverId: string
    seasonId: string
    worldStatePersistPath: string
  }
  checks: GateCheck[]
  opsStatus: number | null
  opsReport: CutoverOpsReport | null
  opsTail: {
    stdout: string[]
    stderr: string[]
  }
}

function createCheck(name: string, passed: boolean, details?: Record<string, unknown>): GateCheck {
  return { name, passed, details }
}

function parseLastJsonObject(output: string): CutoverOpsReport | null {
  const start = output.indexOf('{')
  const end = output.lastIndexOf('}')
  if (start < 0 || end < start) {
    return null
  }
  return JSON.parse(output.slice(start, end + 1)) as CutoverOpsReport
}

function tailLines(output: string, max = 80) {
  const lines = output.split(/\r?\n/).filter((line) => line.trim().length > 0)
  return lines.slice(Math.max(0, lines.length - max))
}

function runCutoverOps(params: {
  serverId: string
  seasonId: string
  worldStatePersistPath: string
  reportDir: string
}) {
  const args = [
    'run',
    'ops:world:season-cutover:create-persist',
    '--',
    `--server-id=${params.serverId}`,
    `--season-id=${params.seasonId}`,
    `--persist-path=${params.worldStatePersistPath}`,
    `--report-dir=${params.reportDir}`,
    `--confirm-server-id=${params.serverId}`,
    `--confirm-season-id=${params.seasonId}`,
    '--confirm-old-world-write-stopped',
  ]
  const result =
    process.platform === 'win32'
      ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `npm ${args.join(' ')}`], {
          cwd: process.cwd(),
          encoding: 'utf-8',
        })
      : spawnSync('npm', args, {
          cwd: process.cwd(),
          encoding: 'utf-8',
        })

  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error?.message,
  }
}

function buildChecks(params: {
  opsStatus: number | null
  opsReport: CutoverOpsReport | null
  serverId: string
  seasonId: string
  worldStatePersistPath: string
}): GateCheck[] {
  const report = params.opsReport
  const postCreateChecks = report?.postCreateChecks ?? []
  const failedPostCreateChecks = postCreateChecks.filter((check) => !check.passed)
  const byLevel = report?.inspectReport?.counts?.byLevel ?? {}
  const l01 = byLevel.L01 ?? 0
  const l05 = byLevel.L05 ?? 0
  const l09 = byLevel.L09 ?? 0
  const reportPath = report?.target?.reportPath
  const reportMarkdownPath = report?.target?.reportMarkdownPath
  const latestReportPath = report?.target?.latestReportPath
  const latestReportMarkdownPath = report?.target?.latestReportMarkdownPath

  return [
    createCheck('ops_exit_zero', params.opsStatus === 0, { status: params.opsStatus }),
    createCheck('ops_report_parseable', report !== null),
    createCheck('ops_report_ok', report?.ok === true, { ok: report?.ok ?? null }),
    createCheck('ops_created_new_persist', report?.creation?.created === true, {
      created: report?.creation?.created ?? null,
      bytes: report?.creation?.bytes ?? null,
    }),
    createCheck('persist_file_exists', existsSync(params.worldStatePersistPath), {
      worldStatePersistPath: params.worldStatePersistPath,
    }),
    createCheck('server_and_season_match', report?.serverId === params.serverId && report?.seasonId === params.seasonId, {
      expectedServerId: params.serverId,
      actualServerId: report?.serverId ?? null,
      expectedSeasonId: params.seasonId,
      actualSeasonId: report?.seasonId ?? null,
    }),
    createCheck('target_path_match', report?.target?.worldStatePersistPath === params.worldStatePersistPath, {
      expected: params.worldStatePersistPath,
      actual: report?.target?.worldStatePersistPath ?? null,
    }),
    createCheck('post_create_checks_all_passed', failedPostCreateChecks.length === 0 && postCreateChecks.length > 0, {
      failedPostCreateChecks,
      total: postCreateChecks.length,
    }),
    createCheck('inspect_report_ok', report?.inspectReport?.ok === true, { ok: report?.inspectReport?.ok ?? null }),
    createCheck('level_distribution_low_to_high', l01 > l05 && l05 > l09 && l09 > 0, { L01: l01, L05: l05, L09: l09 }),
    createCheck('ops_report_files_exist', Boolean(reportPath) && Boolean(reportMarkdownPath)
      && Boolean(latestReportPath) && Boolean(latestReportMarkdownPath)
      && existsSync(reportPath ?? '')
      && existsSync(reportMarkdownPath ?? '')
      && existsSync(latestReportPath ?? '')
      && existsSync(latestReportMarkdownPath ?? ''), {
      reportPath: reportPath ?? null,
      reportMarkdownPath: reportMarkdownPath ?? null,
      latestReportPath: latestReportPath ?? null,
      latestReportMarkdownPath: latestReportMarkdownPath ?? null,
    }),
  ]
}

function persistReport(report: GateReport, runDir: string) {
  const gateDir = join(process.cwd(), 'tmp', 'gates', 'world-season-cutover-prepare')
  mkdirSync(gateDir, { recursive: true })
  const body = JSON.stringify(report, null, 2)
  writeFileSync(join(runDir, 'report.json'), body, 'utf-8')
  writeFileSync(join(gateDir, 'world_season_cutover_prepare_latest.json'), body, 'utf-8')
}

function main() {
  const runId = `world_season_cutover_prepare_${new Date().toISOString().replace(/[:.]/g, '-')}`
  const runDir = join(process.cwd(), 'tmp', 'gates', 'world-season-cutover-prepare', runId)
  mkdirSync(runDir, { recursive: true })
  const serverId = 'gate_world_resource'
  const seasonId = runId
  const worldStatePersistPath = join(runDir, 'world_snapshot.json')
  const reportDir = join(runDir, 'ops-report')
  const ops = runCutoverOps({ serverId, seasonId, worldStatePersistPath, reportDir })
  const opsReport = parseLastJsonObject(`${ops.stdout}\n${ops.stderr}`)
  const checks = buildChecks({
    opsStatus: ops.status,
    opsReport,
    serverId,
    seasonId,
    worldStatePersistPath,
  })
  const report: GateReport = {
    runId,
    generatedAt: new Date().toISOString(),
    passed: checks.every((check) => check.passed),
    config: {
      serverId,
      seasonId,
      worldStatePersistPath,
    },
    checks,
    opsStatus: ops.status,
    opsReport,
    opsTail: {
      stdout: tailLines(ops.stdout),
      stderr: tailLines(`${ops.stderr}\n${ops.error ?? ''}`),
    },
  }

  persistReport(report, runDir)
  console.info(JSON.stringify(report, null, 2))
  if (!report.passed) {
    process.exit(1)
  }
}

main()
