import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

type QueueWaiter = {
  resolve: () => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout> | null
}

class QueueOverflowError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QueueOverflowError'
  }
}

class QueueWaitTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QueueWaitTimeoutError'
  }
}

class RequestBodyTooLargeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RequestBodyTooLargeError'
  }
}

const MAX_CONCURRENCY = readIntEnv('AI_SERVER_CONCURRENCY', 8, 1, 256)
const MAX_QUEUE_SIZE = readIntEnv('AI_SERVER_MAX_QUEUE', MAX_CONCURRENCY * 8, 1, 4096)
const QUEUE_WAIT_TIMEOUT_MS = readIntEnv('AI_SERVER_QUEUE_WAIT_TIMEOUT_MS', 20_000, 500, 180_000)
const UPSTREAM_TIMEOUT_MS = readIntEnv('AI_SERVER_UPSTREAM_TIMEOUT_MS', 30_000, 1_000, 180_000)
const MAX_BODY_BYTES = readIntEnv('AI_SERVER_MAX_BODY_BYTES', 1_048_576, 1_024, 10_485_760)
const REQUEST_TIMEOUT_MS = readIntEnv(
  'AI_SERVER_REQUEST_TIMEOUT_MS',
  Math.max(45_000, UPSTREAM_TIMEOUT_MS + QUEUE_WAIT_TIMEOUT_MS + 2_000),
  5_000,
  300_000,
)
const HEADERS_TIMEOUT_MS = readIntEnv(
  'AI_SERVER_HEADERS_TIMEOUT_MS',
  Math.min(120_000, REQUEST_TIMEOUT_MS + 5_000),
  5_000,
  300_000,
)
const KEEP_ALIVE_TIMEOUT_MS = readIntEnv('AI_SERVER_KEEP_ALIVE_TIMEOUT_MS', 5_000, 1_000, 120_000)
const MAX_REQUESTS_PER_SOCKET = readIntEnv('AI_SERVER_MAX_REQUESTS_PER_SOCKET', 200, 1, 10_000)

let activeRequests = 0
let totalRequests = 0
let completedRequests = 0
let rejectedRequests = 0
let queueTimeouts = 0
const waitQueue: QueueWaiter[] = []

async function withConcurrencyLimit<T>(fn: () => Promise<T>): Promise<T> {
  await acquireConcurrencySlot()
  activeRequests += 1

  try {
    return await fn()
  } finally {
    activeRequests = Math.max(0, activeRequests - 1)
    wakeNextWaiter()
  }
}

async function acquireConcurrencySlot() {
  if (activeRequests < MAX_CONCURRENCY) {
    return
  }

  if (waitQueue.length >= MAX_QUEUE_SIZE) {
    throw new QueueOverflowError(`queue capacity exceeded (${MAX_QUEUE_SIZE})`)
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false
    const waiter: QueueWaiter = {
      resolve: () => {
        if (settled) {
          return
        }

        settled = true
        if (waiter.timer) {
          clearTimeout(waiter.timer)
          waiter.timer = null
        }
        resolve()
      },
      reject: (error) => {
        if (settled) {
          return
        }

        settled = true
        if (waiter.timer) {
          clearTimeout(waiter.timer)
          waiter.timer = null
        }
        reject(error)
      },
      timer: null,
    }

    waiter.timer = setTimeout(() => {
      const index = waitQueue.indexOf(waiter)
      if (index >= 0) {
        waitQueue.splice(index, 1)
      }
      queueTimeouts += 1
      waiter.reject(new QueueWaitTimeoutError(`queue wait exceeded ${QUEUE_WAIT_TIMEOUT_MS}ms`))
    }, QUEUE_WAIT_TIMEOUT_MS)

    waitQueue.push(waiter)
  })
}

function wakeNextWaiter() {
  const waiter = waitQueue.shift()
  if (!waiter) {
    return
  }

  waiter.resolve()
}

function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0

    req.on('data', (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      total += buf.length
      if (total > maxBytes) {
        req.destroy()
        reject(new RequestBodyTooLargeError(`request body exceeds ${maxBytes} bytes`))
        return
      }
      chunks.push(buf)
    })

    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function writeJson(res: ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

async function handleLLMChat(req: IncomingMessage, res: ServerResponse) {
  totalRequests += 1

  const relayUrl = process.env.LLM_RELAY_URL
  if (!relayUrl) {
    rejectedRequests += 1
    writeJson(res, 503, { error: 'LLM_RELAY_URL not configured', code: 'relay_not_configured' })
    return
  }

  const relayApiKey = process.env.LLM_RELAY_API_KEY ?? ''

  let body: string
  try {
    body = await readBody(req, MAX_BODY_BYTES)
  } catch (error) {
    rejectedRequests += 1
    if (error instanceof RequestBodyTooLargeError) {
      writeJson(res, 413, { error: error.message, code: 'request_body_too_large' })
      return
    }

    const message = error instanceof Error ? error.message : 'failed to read request body'
    writeJson(res, 400, { error: message, code: 'invalid_request_body' })
    return
  }

  try {
    const result = await withConcurrencyLimit(async () => {
      const endpoint = `${relayUrl.replace(/\/$/, '')}/v1/chat/completions`
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)

      try {
        const upstream = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${relayApiKey}`,
          },
          body,
          signal: controller.signal,
        })
        const responseText = await upstream.text()
        return {
          status: upstream.status,
          body: responseText,
          contentType: upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
        }
      } finally {
        clearTimeout(timeout)
      }
    })

    completedRequests += 1
    res.writeHead(result.status, {
      'Content-Type': result.contentType,
      'Content-Length': Buffer.byteLength(result.body),
    })
    res.end(result.body)
  } catch (error) {
    rejectedRequests += 1

    if (error instanceof QueueOverflowError) {
      writeJson(res, 503, {
        error: error.message,
        code: 'ai_server_overloaded',
        activeRequests,
        queueLength: waitQueue.length,
        maxConcurrency: MAX_CONCURRENCY,
        maxQueueSize: MAX_QUEUE_SIZE,
      })
      return
    }

    if (error instanceof QueueWaitTimeoutError) {
      writeJson(res, 503, {
        error: error.message,
        code: 'ai_server_queue_timeout',
        activeRequests,
        queueLength: waitQueue.length,
      })
      return
    }

    if (isAbortLikeError(error)) {
      writeJson(res, 504, {
        error: `LLM upstream timeout after ${UPSTREAM_TIMEOUT_MS}ms`,
        code: 'upstream_timeout',
      })
      return
    }

    const message = error instanceof Error ? error.message : 'unknown error'
    writeJson(res, 502, { error: `LLM proxy failed: ${message}`, code: 'proxy_failed' })
  }
}

function isAbortLikeError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  const name = error.name.toLowerCase()
  const message = error.message.toLowerCase()
  return name.includes('abort') || message.includes('aborted') || message.includes('timeout')
}

function readIntEnv(name: string, fallback: number, min: number, max: number) {
  const raw = Number(process.env[name] ?? fallback)
  if (!Number.isFinite(raw)) {
    return fallback
  }

  return Math.max(min, Math.min(max, Math.round(raw)))
}

const PORT = parseInt(process.env.AI_SERVER_PORT ?? '8788', 10)

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)

  if (url.pathname === '/health' && req.method === 'GET') {
    writeJson(res, 200, {
      status: 'ok',
      activeRequests,
      queueLength: waitQueue.length,
      maxConcurrency: MAX_CONCURRENCY,
      maxQueueSize: MAX_QUEUE_SIZE,
      queueWaitTimeoutMs: QUEUE_WAIT_TIMEOUT_MS,
      upstreamTimeoutMs: UPSTREAM_TIMEOUT_MS,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      stats: {
        totalRequests,
        completedRequests,
        rejectedRequests,
        queueTimeouts,
      },
    })
    return
  }

  if (url.pathname === '/v1/chat/completions' && req.method === 'POST') {
    try {
      await handleLLMChat(req, res)
    } catch {
      if (!res.headersSent) {
        writeJson(res, 500, { error: 'internal server error', code: 'internal_error' })
      }
    }
    return
  }

  writeJson(res, 404, { error: 'not found', code: 'not_found' })
})

server.requestTimeout = REQUEST_TIMEOUT_MS
server.headersTimeout = HEADERS_TIMEOUT_MS
server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS
server.maxRequestsPerSocket = MAX_REQUESTS_PER_SOCKET

server.listen(PORT, () => {
  console.log(
    `[AI-Server] listening on :${PORT} (concurrency=${MAX_CONCURRENCY}, maxQueue=${MAX_QUEUE_SIZE}, upstreamTimeoutMs=${UPSTREAM_TIMEOUT_MS})`,
  )
  console.log(`[AI-Server] upstream: ${process.env.LLM_RELAY_URL ?? '(not set)'}`)
})

process.on('SIGINT', () => {
  console.log('[AI-Server] shutting down...')
  server.close()
  process.exit(0)
})

process.on('SIGTERM', () => {
  server.close()
  process.exit(0)
})
