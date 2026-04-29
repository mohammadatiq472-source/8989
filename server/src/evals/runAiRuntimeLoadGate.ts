import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

type GateCheck = {
  name: string
  profile: string
  target: string
  ok: boolean
  summary: string
  env: Record<string, string>
  result?: Record<string, unknown> | null
  outputTail?: string[]
  attempts?: number
}

type LoadMatrixCell = {
  profile: string
  script?: string
  entry?: string
  env?: Record<string, string>
}

function tryParseLastJsonObject(output: string): Record<string, unknown> | null {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    if (!line.startsWith('{') || !line.endsWith('}')) {
      continue
    }
    try {
      const parsed = JSON.parse(line)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      // Ignore non-JSON lines in mixed stdout/stderr output.
    }
  }
  return null
}

function runNpmScript(cell: LoadMatrixCell): GateCheck {
  const target = cell.script ?? cell.entry ?? 'unknown_target'
  const args = cell.script
    ? ['run', cell.script]
    : cell.entry
      ? ['exec', '--', 'tsx', cell.entry]
      : null

  if (!args) {
    return {
      name: `${cell.profile}_${target.replace(/[/:.\\]/g, '_')}`,
      profile: cell.profile,
      target,
      ok: false,
      summary: 'missing script/entry',
      env: cell.env ?? {},
    }
  }

  const env = {
    ...process.env,
    AI_RUNTIME_LOAD_PROFILE: cell.profile,
    ...(cell.env ?? {}),
  }
  const runOnce = () => {
    const result = process.platform === 'win32'
      ? spawnSync('cmd.exe', ['/d', '/s', '/c', `npm ${args.join(' ')}`], {
          cwd: process.cwd(),
          encoding: 'utf-8',
          maxBuffer: 64 * 1024 * 1024,
          env,
        })
      : spawnSync('npm', args, {
          cwd: process.cwd(),
          encoding: 'utf-8',
          maxBuffer: 64 * 1024 * 1024,
          env,
        })
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? `\n${result.error.message}` : ''}`.trim()
    const outputLines = output.split(/\r?\n/).filter(Boolean)
    const lastLine = outputLines.slice(-1)[0] ?? 'no output'
    const parsedResult = tryParseLastJsonObject(output)
    return {
      result,
      outputLines,
      lastLine,
      parsedResult,
    }
  }

  let attempts = 1
  let execution = runOnce()
  if (execution.result.status !== 0) {
    attempts += 1
    execution = runOnce()
  }

  return {
    name: `${cell.profile}_${target.replace(/[/:.\\]/g, '_')}`,
    profile: cell.profile,
    target,
    ok: execution.result.status === 0,
    summary: execution.parsedResult ? JSON.stringify(execution.parsedResult).slice(-240) : execution.lastLine.slice(-240),
    env: cell.env ?? {},
    result: execution.parsedResult,
    outputTail: execution.outputLines.slice(-12),
    attempts,
  }
}

function run() {
  const matrix: LoadMatrixCell[] = [
    {
      profile: 'baseline',
      script: 'test:world:mutation-load',
    },
    {
      profile: 'baseline',
      script: 'test:session:load',
    },
    {
      profile: 'baseline',
      script: 'test:websocket:load',
    },
    {
      profile: 'tick_pressure_ultra',
      script: 'test:world:mutation-load',
      env: {
        WORLD_MUTATION_LOAD_CONTENDING_REQUESTS: '64',
        WORLD_MUTATION_LOAD_PRESSURE_WAVES: '5',
        WORLD_MUTATION_LOAD_WAVE_DELAY_MS: '60',
        WORLD_MUTATION_LOAD_MAX_BUSY_P95_MS: '2500',
      },
    },
    {
      profile: 'tick_pressure_extreme',
      script: 'test:world:mutation-load',
      env: {
        WORLD_MUTATION_LOAD_CONTENDING_REQUESTS: '96',
        WORLD_MUTATION_LOAD_PRESSURE_WAVES: '6',
        WORLD_MUTATION_LOAD_WAVE_DELAY_MS: '40',
        WORLD_MUTATION_LOAD_MAX_BUSY_P95_MS: '3000',
      },
    },
    {
      profile: 'session_seat_cap_plus',
      script: 'test:session:load',
      env: {
        SESSION_LOAD_SESSION_COUNT: '128',
        SESSION_LOAD_PRIMARY_SEAT_COUNT: '64',
        SESSION_LOAD_SECONDARY_SEAT_COUNT: '64',
        SESSION_LOAD_HEARTBEAT_ROUNDS: '8',
        SESSION_LOAD_MAX_JOIN_P95_MS: '15000',
        SESSION_LOAD_MAX_HEARTBEAT_P95_MS: '12000',
        SESSION_LOAD_MAX_LEAVE_P95_MS: '12000',
      },
    },
    {
      profile: 'session_endurance_cap_plus',
      script: 'test:session:load',
      env: {
        SESSION_LOAD_SESSION_COUNT: '128',
        SESSION_LOAD_PRIMARY_SEAT_COUNT: '64',
        SESSION_LOAD_SECONDARY_SEAT_COUNT: '64',
        SESSION_LOAD_HEARTBEAT_ROUNDS: '16',
        SESSION_LOAD_MAX_JOIN_P95_MS: '15000',
        SESSION_LOAD_MAX_HEARTBEAT_P95_MS: '15000',
        SESSION_LOAD_MAX_LEAVE_P95_MS: '12000',
      },
    },
    {
      profile: 'ws_fanout_dual_faction_ultra',
      script: 'test:websocket:load',
      env: {
        WEBSOCKET_LOAD_CLIENT_COUNT: '128',
        WEBSOCKET_LOAD_PRIMARY_CLIENT_COUNT: '64',
        WEBSOCKET_LOAD_SECONDARY_CLIENT_COUNT: '64',
        WEBSOCKET_LOAD_FANOUT_BURSTS: '6',
        WEBSOCKET_LOAD_FANOUT_BURST_DELAY_MS: '60',
        WEBSOCKET_LOAD_MAX_SUBSCRIBE_P95_MS: '15000',
        WEBSOCKET_LOAD_MAX_FANOUT_P95_MS: '30000',
      },
    },
    {
      profile: 'ws_fanout_dual_faction_extreme',
      script: 'test:websocket:load',
      env: {
        WEBSOCKET_LOAD_CLIENT_COUNT: '128',
        WEBSOCKET_LOAD_PRIMARY_CLIENT_COUNT: '64',
        WEBSOCKET_LOAD_SECONDARY_CLIENT_COUNT: '64',
        WEBSOCKET_LOAD_FANOUT_BURSTS: '10',
        WEBSOCKET_LOAD_FANOUT_BURST_DELAY_MS: '40',
        WEBSOCKET_LOAD_MAX_SUBSCRIBE_P95_MS: '20000',
        WEBSOCKET_LOAD_MAX_FANOUT_P95_MS: '30000',
      },
    },
    {
      profile: 'runtime_combo_dual_faction_ultra',
      script: 'test:runtime:combo-load',
      env: {
        RUNTIME_COMBO_SESSION_COUNT: '128',
        RUNTIME_COMBO_PRIMARY_SESSION_COUNT: '64',
        RUNTIME_COMBO_SECONDARY_SESSION_COUNT: '64',
        RUNTIME_COMBO_CLIENT_COUNT: '128',
        RUNTIME_COMBO_PRIMARY_CLIENT_COUNT: '64',
        RUNTIME_COMBO_SECONDARY_CLIENT_COUNT: '64',
        RUNTIME_COMBO_HEARTBEAT_ROUNDS: '3',
        RUNTIME_COMBO_FANOUT_BURSTS: '4',
        RUNTIME_COMBO_FANOUT_BURST_DELAY_MS: '60',
        RUNTIME_COMBO_MAX_JOIN_P95_MS: '15000',
        RUNTIME_COMBO_MAX_HEARTBEAT_P95_MS: '12000',
        RUNTIME_COMBO_MAX_SUBSCRIBE_P95_MS: '15000',
        RUNTIME_COMBO_MAX_FANOUT_P95_MS: '30000',
        RUNTIME_COMBO_MAX_ADVANCE_P95_MS: '240000',
      },
    },
    {
      profile: 'runtime_combo_dual_faction_extreme',
      script: 'test:runtime:combo-load',
      env: {
        RUNTIME_COMBO_SESSION_COUNT: '128',
        RUNTIME_COMBO_PRIMARY_SESSION_COUNT: '64',
        RUNTIME_COMBO_SECONDARY_SESSION_COUNT: '64',
        RUNTIME_COMBO_CLIENT_COUNT: '128',
        RUNTIME_COMBO_PRIMARY_CLIENT_COUNT: '64',
        RUNTIME_COMBO_SECONDARY_CLIENT_COUNT: '64',
        RUNTIME_COMBO_HEARTBEAT_ROUNDS: '6',
        RUNTIME_COMBO_FANOUT_BURSTS: '8',
        RUNTIME_COMBO_FANOUT_BURST_DELAY_MS: '40',
        RUNTIME_COMBO_MAX_JOIN_P95_MS: '20000',
        RUNTIME_COMBO_MAX_HEARTBEAT_P95_MS: '15000',
        RUNTIME_COMBO_MAX_SUBSCRIBE_P95_MS: '20000',
        RUNTIME_COMBO_MAX_FANOUT_P95_MS: '30000',
        RUNTIME_COMBO_MAX_ADVANCE_P95_MS: '240000',
      },
    },
  ]
  const checks = matrix.map((cell) => runNpmScript(cell))
  const ok = checks.every((check) => check.ok)
  const payload = {
    ok,
    generatedAt: new Date().toISOString(),
    ranAt: new Date().toISOString(),
    matrix,
    checks,
  }

  const gatesDir = join(process.cwd(), 'tmp', 'gates')
  mkdirSync(gatesDir, { recursive: true })
  const stampedPath = join(
    gatesDir,
    `ai_runtime_load_gate_${payload.ranAt.replace(/[:.]/g, '_')}.json`,
  )
  const latestPath = join(gatesDir, 'ai_runtime_load_gate_latest.json')
  const body = JSON.stringify(payload, null, 2)
  writeFileSync(stampedPath, body, 'utf-8')
  writeFileSync(latestPath, body, 'utf-8')

  console.log(`[AI Runtime Load Gate] ok=${ok} latest=${latestPath} stamped=${stampedPath}`)
  if (!ok) {
    process.exitCode = 1
  }
}

run()
