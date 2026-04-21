import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

type GateCheck = {
  name: string
  script: string
  ok: boolean
  summary: string
}

function buildNestedNpmEnv() {
  const env = { ...process.env }
  delete env.npm_command
  delete env.npm_lifecycle_event
  delete env.npm_lifecycle_script
  return env
}

function runNpmScript(script: string): GateCheck {
  const result =
    process.platform === 'win32'
      ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `npm run ${script}`], {
          cwd: process.cwd(),
          encoding: 'utf-8',
          env: buildNestedNpmEnv(),
        })
      : spawnSync('npm', ['run', script], {
          cwd: process.cwd(),
          encoding: 'utf-8',
          env: buildNestedNpmEnv(),
        })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? `\n${result.error.message}` : ''}`.trim()
  const lastLine = output.split(/\r?\n/).filter(Boolean).slice(-1)[0] ?? 'no output'
  const failureDetail =
    result.status === null ? `signal=${result.signal ?? 'unknown'}` : `exit=${result.status}`
  return {
    name: script.replace(/:/g, '_'),
    script,
    ok: result.status === 0,
    summary: (result.status === 0 ? lastLine : `${lastLine} (${failureDetail})`).slice(-240),
  }
}

function run() {
  const checks = [
    runNpmScript('test:world:mutation-lock'),
    runNpmScript('test:session:manager'),
    runNpmScript('test:websocket:quota'),
    runNpmScript('gate:ai:runtime-load'),
    runNpmScript('test:ai:governance-guard'),
    runNpmScript('test:ai:player-http-contract'),
    runNpmScript('test:ai:runtime-observability'),
    runNpmScript('test:ai:runtime-http-contract'),
    runNpmScript('test:ai:quota'),
  ]
  const ok = checks.every((check) => check.ok)
  const payload = {
    ok,
    ranAt: new Date().toISOString(),
    checks,
  }

  const gatesDir = join(process.cwd(), 'tmp', 'gates')
  mkdirSync(gatesDir, { recursive: true })
  const stampedPath = join(
    gatesDir,
    `ai_runtime_capacity_gate_${payload.ranAt.replace(/[:.]/g, '_')}.json`,
  )
  const latestPath = join(gatesDir, 'ai_runtime_capacity_gate_latest.json')
  const body = JSON.stringify(payload, null, 2)
  writeFileSync(stampedPath, body, 'utf-8')
  writeFileSync(latestPath, body, 'utf-8')

  console.log(`[AI Runtime Capacity Gate] ok=${ok} latest=${latestPath} stamped=${stampedPath}`)
  if (!ok) {
    process.exitCode = 1
  }
}

run()
