import type { IncomingMessage } from 'node:http'
import { readJsonBody } from './http'

export function parseBooleanFlag(raw: string | null): boolean {
  if (!raw) {
    return false
  }
  const normalized = raw.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

export function parseOptionalLimit(raw: string | null, fallback = 20): number {
  const value = Number(raw ?? fallback)
  if (!Number.isFinite(value)) {
    return fallback
  }
  return Math.max(1, Math.min(200, Math.trunc(value)))
}

type SafeParseSuccess<T> = {
  success: true
  data: T
}

type SafeParseFailure = {
  success: false
  error: {
    message: string
  }
}

type SafeParseSchema<T> = {
  safeParse: (input: unknown) => SafeParseSuccess<T> | SafeParseFailure
}

export async function parseBody<T>(req: IncomingMessage, schema: SafeParseSchema<T>) {
  const body = await readJsonBody(req)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.message,
    }
  }
  return {
    ok: true as const,
    data: parsed.data,
  }
}
