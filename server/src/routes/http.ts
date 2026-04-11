import type { IncomingMessage, ServerResponse } from 'node:http'

const MAX_BODY_SIZE = 1_048_576 // 1 MB
const CLIENT_ERROR_STATUS = 400
const SERVER_ERROR_STATUS = 500

export class HttpBodyError extends Error {
  readonly statusCode: number

  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'HttpBodyError'
    this.statusCode = statusCode
  }
}

export function isHttpBodyError(error: unknown): error is HttpBodyError {
  return error instanceof HttpBodyError
}

export function readJsonBody(req: IncomingMessage) {
  return new Promise<unknown>((resolve, reject) => {
    const chunks: Buffer[] = []
    let totalSize = 0

    req.on('data', (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      totalSize += buf.length
      if (totalSize > MAX_BODY_SIZE) {
        req.destroy()
        reject(new HttpBodyError('Request body too large.', CLIENT_ERROR_STATUS))
        return
      }
      chunks.push(buf)
    })
    req.on('end', () => {
      try {
        const rawText = Buffer.concat(chunks).toString('utf8')
        resolve(rawText ? JSON.parse(rawText) : {})
      } catch {
        reject(new HttpBodyError('Invalid JSON body.', 400))
      }
    })
    req.on('error', reject)
  })
}

export function writeJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = normalizeHttpStatusCode(statusCode)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

export function normalizeHttpStatusCode(statusCode: number): number {
  if (!Number.isFinite(statusCode)) {
    return SERVER_ERROR_STATUS
  }
  const normalized = Math.trunc(statusCode)
  if (normalized < CLIENT_ERROR_STATUS) {
    return normalized
  }
  if (normalized < SERVER_ERROR_STATUS) {
    return normalized
  }
  return SERVER_ERROR_STATUS
}
