import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { request as httpRequest } from 'node:http'

type HttpResult = {
  ok: boolean
  status: number
  durationMs: number
  path: string
  method: string
  data?: unknown
  error?: string
}

type SessionSecurityCheck = {
  name: string
  passed: boolean
  expectedStatus?: number
  status?: number
  expectedErrorCode?: string
  actualErrorCode?: string | null
  details?: Record<string, unknown>
}

type SessionSecurityGateReport = {
  runId: string
  generatedAt: string
  baseUrl: string
  port: number
  checks: SessionSecurityCheck[]
  passed: boolean
  backend: {
    started: boolean
    pid?: number
    spawnError?: string
    stdoutTail?: string
    stderrTail?: string
  }
}

function createRunContext() {
  const runId = `session_security_${new Date().toISOString().replace(/[:.]/g, '-')}`
  const runDir = join(process.cwd(), 'tmp', 'gates', 'session-security-gate')
  mkdirSync(runDir, { recursive: true })
  return { runId, runDir }
}

function persistReport(runDir: string, runId: string, report: SessionSecurityGateReport) {
  const latestPath = join(runDir, 'session_security_gate_latest.json')
  const stampedPath = join(runDir, `${runId}.json`)
  const payload = JSON.stringify(report, null, 2)
  writeFileSync(latestPath, payload, 'utf8')
  writeFileSync(stampedPath, payload, 'utf8')
}

function readErrorCode(result: HttpResult | null): string | null {
  if (!result || !result.data || typeof result.data !== 'object') {
    return null
  }
  const value = (result.data as { errorCode?: unknown }).errorCode
  return typeof value === 'string' ? value : null
}

function readToken(result: HttpResult | null): string {
  if (!result || !result.data || typeof result.data !== 'object') {
    return ''
  }
  const token = (result.data as { token?: unknown }).token
  return typeof token === 'string' ? token : ''
}

function hasTokenState(result: HttpResult | null): boolean {
  if (!result || !result.data || typeof result.data !== 'object') {
    return false
  }
  return typeof (result.data as { tokenState?: unknown }).tokenState === 'object'
}

function requestJson(
  baseUrl: string,
  path: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>,
  timeoutMs = 10_000,
): Promise<HttpResult> {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    const payload = body ? JSON.stringify(body) : ''
    const url = new URL(path, baseUrl)
    const req = httpRequest(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method,
        timeout: timeoutMs,
        headers: body
          ? {
              'content-type': 'application/json',
              'content-length': Buffer.byteLength(payload),
            }
          : undefined,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        })
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let data: unknown = undefined
          if (text.trim().length > 0) {
            try {
              data = JSON.parse(text)
            } catch {
              data = { raw: text }
            }
          }

          resolve({
            ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
            status: res.statusCode ?? -1,
            durationMs: Date.now() - startedAt,
            path,
            method,
            data,
          })
        })
      },
    )

    req.on('timeout', () => {
      req.destroy(new Error('request timeout'))
    })
    req.on('error', (error) => {
      resolve({
        ok: false,
        status: -1,
        durationMs: Date.now() - startedAt,
        path,
        method,
        error: error.message,
      })
    })

    if (body) {
      req.write(payload)
    }
    req.end()
  })
}

async function waitForHealth(baseUrl: string, timeoutMs = 30_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const result = await requestJson(baseUrl, '/api/health', 'GET')
    if (result.status === 200 && result.ok) {
      return result
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return null
}

async function getAvailablePort(start = 8796, end = 8899): Promise<number> {
  for (let port = start; port <= end; port += 1) {
    const available = await new Promise<boolean>((resolve) => {
      const server = createServer()
      server.once('error', () => {
        resolve(false)
      })
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve(true))
      })
    })
    if (available) {
      return port
    }
  }
  throw new Error(`No available port in range ${start}-${end}`)
}

function toTailAppend(tail: string[], chunk: string, max = 40) {
  const lines = chunk.split(/\r?\n/).filter((line) => line.trim().length > 0)
  tail.push(...lines)
  if (tail.length > max) {
    tail.splice(0, tail.length - max)
  }
}

async function main() {
  const { runId, runDir } = createRunContext()
  const checks: SessionSecurityCheck[] = []
  const stdoutTail: string[] = []
  const stderrTail: string[] = []

  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const npmExecPath = process.env.npm_execpath?.trim()
  const env = {
    ...process.env,
    PORT: String(port),
    SESSION_TOKEN_MAX_AGE_MS: process.env.SESSION_TOKEN_MAX_AGE_MS?.trim() || '60000',
  }
  const child = npmExecPath
    ? spawn(process.execPath, [npmExecPath, 'run', 'start'], {
        cwd: process.cwd(),
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    : spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'start'], {
        cwd: process.cwd(),
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

  child.stdout?.on('data', (chunk) => toTailAppend(stdoutTail, String(chunk)))
  child.stderr?.on('data', (chunk) => toTailAppend(stderrTail, String(chunk)))

  const health = await waitForHealth(baseUrl, 35_000)
  checks.push({
    name: 'health_ready',
    passed: Boolean(health && health.status === 200),
    expectedStatus: 200,
    status: health?.status,
  })

  let join: HttpResult | null = null
  let runtime: HttpResult | null = null
  let autonomy: HttpResult | null = null
  let heartbeatValid: HttpResult | null = null
  let heartbeatBadFormat: HttpResult | null = null
  let heartbeatUnknown: HttpResult | null = null
  let leave: HttpResult | null = null
  let heartbeatAfterLeave: HttpResult | null = null

  if (health) {
    join = await requestJson(baseUrl, '/api/session/join', 'POST', {
      factionId: 'player',
      playerName: 'security_gate',
    })
    const token = readToken(join)

    checks.push({
      name: 'join_200_with_token_state',
      passed: join.status === 200 && token.length > 0 && hasTokenState(join),
      expectedStatus: 200,
      status: join.status,
    })

    runtime = await requestJson(baseUrl, '/api/session/runtime', 'GET')
    checks.push({
      name: 'runtime_200',
      passed: runtime.status === 200,
      expectedStatus: 200,
      status: runtime.status,
    })

    autonomy = await requestJson(baseUrl, '/api/session/autonomy', 'POST', {
      token,
      level: 'L2_delegated',
    })
    checks.push({
      name: 'autonomy_200_with_token_state',
      passed: autonomy.status === 200 && hasTokenState(autonomy),
      expectedStatus: 200,
      status: autonomy.status,
    })

    heartbeatValid = await requestJson(baseUrl, '/api/session/heartbeat', 'POST', { token })
    checks.push({
      name: 'heartbeat_valid_200_with_token_state',
      passed: heartbeatValid.status === 200 && hasTokenState(heartbeatValid),
      expectedStatus: 200,
      status: heartbeatValid.status,
    })

    heartbeatBadFormat = await requestJson(baseUrl, '/api/session/heartbeat', 'POST', {
      token: 'bad-token',
    })
    checks.push({
      name: 'heartbeat_bad_format_400',
      passed: heartbeatBadFormat.status === 400,
      expectedStatus: 400,
      status: heartbeatBadFormat.status,
    })

    heartbeatUnknown = await requestJson(baseUrl, '/api/session/heartbeat', 'POST', {
      token: 'a'.repeat(48),
    })
    checks.push({
      name: 'heartbeat_unknown_token_401',
      passed: heartbeatUnknown.status === 401 && readErrorCode(heartbeatUnknown) === 'invalid_token',
      expectedStatus: 401,
      status: heartbeatUnknown.status,
      expectedErrorCode: 'invalid_token',
      actualErrorCode: readErrorCode(heartbeatUnknown),
    })

    leave = await requestJson(baseUrl, '/api/session/leave', 'POST', { token })
    checks.push({
      name: 'leave_200_with_token_state',
      passed: leave.status === 200 && hasTokenState(leave),
      expectedStatus: 200,
      status: leave.status,
    })

    heartbeatAfterLeave = await requestJson(baseUrl, '/api/session/heartbeat', 'POST', { token })
    checks.push({
      name: 'heartbeat_after_leave_401',
      passed:
        heartbeatAfterLeave.status === 401 &&
        readErrorCode(heartbeatAfterLeave) === 'invalid_token',
      expectedStatus: 401,
      status: heartbeatAfterLeave.status,
      expectedErrorCode: 'invalid_token',
      actualErrorCode: readErrorCode(heartbeatAfterLeave),
    })
  }

  const passed = checks.every((item) => item.passed)

  const report: SessionSecurityGateReport = {
    runId,
    generatedAt: new Date().toISOString(),
    baseUrl,
    port,
    checks,
    passed,
    backend: {
      started: Boolean(health),
      pid: child.pid,
      stdoutTail: stdoutTail.join('\n').slice(-2000),
      stderrTail: stderrTail.join('\n').slice(-2000),
    },
  }

  persistReport(runDir, runId, report)
  console.info(JSON.stringify(report, null, 2))

  if (process.platform === 'win32') {
    if (typeof child.pid === 'number') {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    }
  } else {
    child.kill('SIGTERM')
  }

  process.exit(passed ? 0 : 1)
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : 'session security gate failed'
  console.error(message)
  try {
    const runDir = join(process.cwd(), 'tmp', 'gates', 'session-security-gate')
    mkdirSync(runDir, { recursive: true })
    const latestPath = join(runDir, 'session_security_gate_latest.json')
    const fallback = {
      runId: `session_security_error_${Date.now()}`,
      generatedAt: new Date().toISOString(),
      passed: false,
      error: message,
    }
    writeFileSync(latestPath, JSON.stringify(fallback, null, 2), 'utf8')
  } catch {
    // ignore persist fallback failures
  }
  process.exit(1)
})
