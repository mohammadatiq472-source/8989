import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { join } from 'node:path'

export type HttpJsonResult = {
  ok: boolean
  status: number
  data: unknown
}

export type TailState = {
  stdout: string[]
  stderr: string[]
}

export async function getAvailablePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('failed to allocate ephemeral port')))
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

function appendTail(target: string[], chunk: string, max = 40) {
  const lines = chunk.split(/\r?\n/).filter((line) => line.trim().length > 0)
  target.push(...lines)
  if (target.length > max) {
    target.splice(0, target.length - max)
  }
}

export function buildSessionPersistPath(prefix: string): string {
  return join(process.cwd(), 'tmp', `${prefix}_${process.pid}_${Date.now()}.json`)
}

export function spawnBackend(
  port: number,
  tail: TailState,
  envOverrides: NodeJS.ProcessEnv = {},
): ChildProcess {
  const worldPersistRoot =
    envOverrides.WORLD_PERSIST_ROOT?.trim() || join(process.cwd(), 'tmp', `backend_world_${port}_${process.pid}_${Date.now()}`)
  const inheritedNodeOptions = process.env.NODE_OPTIONS?.trim() ?? ''
  const nodeOptions = inheritedNodeOptions.includes('--max-old-space-size')
    ? inheritedNodeOptions
    : `${inheritedNodeOptions} --max-old-space-size=2048`.trim()
  const env = {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(port),
    GAME_CLOCK_ENABLED: '0',
    NODE_ENV: 'test',
    NODE_OPTIONS: nodeOptions,
    WORLD_PERSIST_ROOT: worldPersistRoot,
    ...envOverrides,
  }

  const child = spawn(process.execPath, ['--import', 'tsx', 'server/src/app.ts'], {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout?.on('data', (chunk) => appendTail(tail.stdout, String(chunk)))
  child.stderr?.on('data', (chunk) => appendTail(tail.stderr, String(chunk)))
  return child
}

export async function requestJson(
  baseUrl: string,
  path: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>,
  timeoutMs = 15_000,
): Promise<HttpJsonResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(new URL(path, baseUrl), {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })

    const raw = await response.text()
    let data: unknown = null
    if (raw.trim().length > 0) {
      try {
        data = JSON.parse(raw)
      } catch {
        data = { raw }
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function waitForHealth(baseUrl: string, timeoutMs = 90_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const result = await requestJson(baseUrl, '/api/health', 'GET', undefined, 5_000).catch(() => null)
    if (result?.status === 200 && result.ok) {
      return result
    }
    await sleep(500)
  }
  return null
}

export async function shutdownChild(child: ChildProcess | null) {
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

export function readObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('expected object payload')
  }
  return value as Record<string, unknown>
}

export function readArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error('expected array payload')
  }
  return value
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function readIntegerEnv(name: string, fallback: number, minimum = 1): number {
  const raw = Number(process.env[name] ?? fallback)
  if (!Number.isFinite(raw)) {
    return fallback
  }
  return Math.max(minimum, Math.floor(raw))
}

export function readNumberEnv(name: string, fallback: number, minimum = 0): number {
  const raw = Number(process.env[name] ?? fallback)
  if (!Number.isFinite(raw)) {
    return fallback
  }
  return Math.max(minimum, raw)
}

export function readLabelEnv(name: string, fallback: string): string {
  const raw = process.env[name]?.trim()
  return raw && raw.length > 0 ? raw : fallback
}

export function calculatePercentile(samples: number[], percentile: number): number {
  if (samples.length === 0) {
    return 0
  }

  const sorted = [...samples].sort((a, b) => a - b)
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((Math.max(0, percentile) / 100) * sorted.length) - 1),
  )
  return sorted[index]
}
