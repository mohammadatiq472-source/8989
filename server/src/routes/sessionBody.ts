import type { IncomingMessage } from 'node:http'
import { readJsonBody } from './http'

const TOKEN_PATTERN = /^[a-f0-9]{48}$/
const MAX_PLAYER_NAME_LENGTH = 64

export interface JoinSessionBody {
  factionId?: string
  playerName?: string
}

export interface SessionTokenBody {
  token?: string
}

export interface SessionAutonomyBody extends SessionTokenBody {
  level?: string
}

function toTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

export async function readJoinSessionBody(req: IncomingMessage): Promise<JoinSessionBody> {
  const payload = (await readJsonBody(req)) as Record<string, unknown>
  return {
    factionId: toTrimmedString(payload?.factionId),
    playerName: toTrimmedString(payload?.playerName),
  }
}

export async function readSessionTokenBody(req: IncomingMessage): Promise<SessionTokenBody> {
  const payload = (await readJsonBody(req)) as Record<string, unknown>
  return {
    token: toTrimmedString(payload?.token),
  }
}

export async function readSessionAutonomyBody(req: IncomingMessage): Promise<SessionAutonomyBody> {
  const payload = (await readJsonBody(req)) as Record<string, unknown>
  return {
    token: toTrimmedString(payload?.token),
    level: toTrimmedString(payload?.level),
  }
}

export function isJoinSessionBodyValid(
  body: JoinSessionBody,
): body is Required<Pick<JoinSessionBody, 'factionId' | 'playerName'>> {
  return typeof body.factionId === 'string' && body.factionId.length > 0
    && typeof body.playerName === 'string'
    && body.playerName.length > 0
    && body.playerName.length <= MAX_PLAYER_NAME_LENGTH
}

export function isSessionTokenBodyValid(
  body: SessionTokenBody,
): body is Required<Pick<SessionTokenBody, 'token'>> {
  return typeof body.token === 'string' && TOKEN_PATTERN.test(body.token)
}

export function isSessionAutonomyBodyValid(
  body: SessionAutonomyBody,
): body is Required<Pick<SessionAutonomyBody, 'token' | 'level'>> {
  return (
    typeof body.token === 'string' &&
    TOKEN_PATTERN.test(body.token) &&
    typeof body.level === 'string' &&
    body.level.length > 0
  )
}
