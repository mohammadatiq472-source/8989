/**
 * session.ts ? ????????
 *
 * POST /api/session/join       { factionId, playerName } ? { sessionId, token, factionId, seatId }
 * POST /api/session/heartbeat  { token } ? { ok }
 * GET  /api/session/status     ? { players, aiControlledFactions }
 * GET  /api/session/metrics    ? runtime session metrics
 * POST /api/session/leave      { token } ? { ok }
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type {
  SessionAuthErrorCode,
  SessionAutonomyLevel,
  SessionJoinResponse,
  SessionMutationResponse,
  SessionRuntimeResponse,
  SessionTokenState,
} from '../../../shared/contracts/game'
import { writeJson } from './http'
import {
  getFactionAutonomyLevel,
  getFactionSessionSnapshot,
  getSessionControlContextByToken,
  getSessionMetrics,
  getSessionStatus,
  getSessionTokenStateByToken,
  heartbeat,
  joinSession,
  leaveSession,
  resolveSessionControlMode,
  setSessionAutonomyLevel,
} from '../multiplayer/SessionManager'
import { appendRuntimeWorldEvent, getWorldStateReadonly } from '../application/world/WorldService'
import { getFactionConfig, getFactionDoctrine } from '../application/faction/FactionConfigStore'
import {
  sessionJoinResponseSchema,
  sessionMutationResponseSchema,
  sessionRuntimeResponseSchema,
} from '../../../shared/schemas/session'
import {
  isJoinSessionBodyValid,
  isSessionAutonomyBodyValid,
  isSessionTokenBodyValid,
  readSessionAutonomyBody,
  readJoinSessionBody,
  readSessionTokenBody,
} from './sessionBody'

const AUTONOMY_LEVELS = new Set<SessionAutonomyLevel>(['L1_assigned', 'L2_delegated', 'L3_negotiated'])

function toSessionTokenStatePayload(raw: {
  issuedAt: number
  expiresAt: number
  remainingMs: number
  expired: boolean
} | null | undefined): SessionTokenState | undefined {
  if (!raw) {
    return undefined
  }
  return {
    issuedAt: new Date(raw.issuedAt).toISOString(),
    expiresAt: new Date(raw.expiresAt).toISOString(),
    remainingMs: raw.remainingMs,
    expired: raw.expired,
  }
}

function resolveMutationStatusCode(result: { ok: boolean; errorCode?: SessionAuthErrorCode }): number {
  if (result.ok) {
    return 200
  }
  if (result.errorCode === 'invalid_token_format') {
    return 400
  }
  if (result.errorCode === 'invalid_token' || result.errorCode === 'token_expired') {
    return 401
  }
  return 409
}

function recordSessionRuntimeEvent(params: {
  action: string
  success: boolean
  message: string
  metadata?: Record<string, unknown>
}) {
  appendRuntimeWorldEvent({
    action: params.action,
    success: params.success,
    message: params.message,
    metadata: params.metadata,
  })
}

export async function dispatchSessionRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<void> {
  const world = getWorldStateReadonly()
  const allFactionIds = Object.keys(world.factions)

  if (req.method === 'POST' && pathname === '/api/session/join') {
    const body = await readJoinSessionBody(req)
    if (!isJoinSessionBodyValid(body)) {
      recordSessionRuntimeEvent({
        action: 'session_join',
        success: false,
        message: 'session join rejected: invalid body',
        metadata: { reason: 'invalid_body' },
      })
      writeJson(res, 400, { error: 'factionId and playerName required' })
      return
    }

    const result = joinSession(body.factionId, body.playerName, allFactionIds)
    if ('error' in result) {
      const hasKnownFaction = allFactionIds.includes(body.factionId)
      const autonomyLevel = hasKnownFaction ? getFactionAutonomyLevel(body.factionId) : undefined
      const controlMode = autonomyLevel ? resolveSessionControlMode(autonomyLevel) : undefined
      recordSessionRuntimeEvent({
        action: 'session_join',
        success: false,
        message: result.error,
        metadata: {
          factionId: body.factionId,
          autonomyLevel,
          controlMode,
          reason: 'join_failed',
        },
      })
      writeJson(res, 409, result)
      return
    }

    const autonomyLevel = getFactionAutonomyLevel(result.factionId)
    const controlMode = resolveSessionControlMode(autonomyLevel)
    recordSessionRuntimeEvent({
      action: 'session_join',
      success: true,
      message: `session joined for faction ${result.factionId}`,
      metadata: {
        factionId: result.factionId,
        seatId: result.seatId,
        playerName: body.playerName,
        autonomyLevel,
        controlMode,
      },
    })

    const responsePayload: SessionJoinResponse = {
      sessionId: result.sessionId,
      token: result.token,
      factionId: result.factionId,
      seatId: result.seatId,
      autonomyLevel,
      controlMode,
      tokenState: toSessionTokenStatePayload(getSessionTokenStateByToken(result.token)),
    }
    writeJson(res, 200, sessionJoinResponseSchema.parse(responsePayload))
    return
  }

  if (req.method === 'POST' && pathname === '/api/session/heartbeat') {
    const body = await readSessionTokenBody(req)
    if (!isSessionTokenBodyValid(body)) {
      recordSessionRuntimeEvent({
        action: 'session_heartbeat',
        success: false,
        message: 'session heartbeat rejected: invalid token payload',
        metadata: { reason: 'invalid_body' },
      })
      writeJson(res, 400, { error: 'valid token required' })
      return
    }

    const result = heartbeat(body.token)
    const context = result.ok ? getSessionControlContextByToken(body.token) : null
    recordSessionRuntimeEvent({
      action: 'session_heartbeat',
      success: result.ok,
      message: result.ok ? 'session heartbeat accepted' : result.error ?? 'session heartbeat failed',
      metadata: {
        factionId: context?.factionId,
        autonomyLevel: context?.autonomyLevel,
        controlMode: context?.controlMode,
      },
    })

    const responsePayload: SessionMutationResponse = {
      ...result,
      factionId: context?.factionId,
      autonomyLevel: context?.autonomyLevel,
      controlMode: context?.controlMode,
      errorCode: result.errorCode,
      tokenState: toSessionTokenStatePayload(result.tokenState),
    }
    writeJson(res, resolveMutationStatusCode(result), sessionMutationResponseSchema.parse(responsePayload))
    return
  }

  if (req.method === 'GET' && pathname === '/api/session/status') {
    writeJson(res, 200, getSessionStatus(allFactionIds))
    return
  }

  if (req.method === 'GET' && pathname === '/api/session/metrics') {
    writeJson(res, 200, getSessionMetrics())
    return
  }

  if (req.method === 'GET' && pathname === '/api/session/runtime') {
    const runtime: SessionRuntimeResponse = {
      tick: world.tick,
      worldVersion: world.worldVersion,
      factions: allFactionIds.map((factionId) => {
        const session = getFactionSessionSnapshot(factionId)
        const factionConfig = getFactionConfig(factionId)
        const doctrine = getFactionDoctrine(factionId)
        const doctrinePreview = doctrine.slice(0, 180) + (doctrine.length > 180 ? '...' : '')

        return {
          factionId,
          autonomyLevel: session.autonomyLevel,
          controlMode: resolveSessionControlMode(session.autonomyLevel),
          playerName: session.playerName,
          playerNames: session.playerNames,
          online: session.online,
          seatCount: session.seatCount,
          onlineSeatCount: session.onlineSeatCount,
          doctrinePreview,
          doctrineUpdatedAt: factionConfig ? new Date(factionConfig.updatedAt).toISOString() : undefined,
          hasModelConfig: Boolean(factionConfig?.modelConfig),
          commanderModel: factionConfig?.modelConfig?.commanderModel,
          generalModel: factionConfig?.modelConfig?.generalModel,
          unitModel: factionConfig?.modelConfig?.unitModel,
        }
      }),
    }
    writeJson(res, 200, sessionRuntimeResponseSchema.parse(runtime))
    return
  }

  if (req.method === 'POST' && pathname === '/api/session/autonomy') {
    const body = await readSessionAutonomyBody(req)
    if (!isSessionAutonomyBodyValid(body) || !AUTONOMY_LEVELS.has(body.level as SessionAutonomyLevel)) {
      recordSessionRuntimeEvent({
        action: 'session_set_autonomy',
        success: false,
        message: 'session autonomy rejected: invalid payload',
        metadata: { reason: 'invalid_body' },
      })
      writeJson(res, 400, { error: 'valid token and level required' })
      return
    }

    const result = setSessionAutonomyLevel(body.token, body.level as SessionAutonomyLevel)
    const context = result.ok ? getSessionControlContextByToken(body.token) : null
    recordSessionRuntimeEvent({
      action: 'session_set_autonomy',
      success: result.ok,
      message: result.ok
        ? `session autonomy updated to ${body.level}`
        : result.error ?? 'session autonomy update failed',
      metadata: {
        requestedLevel: body.level,
        factionId: context?.factionId,
        autonomyLevel: context?.autonomyLevel,
        controlMode: context?.controlMode,
      },
    })

    const responsePayload: SessionMutationResponse = {
      ...result,
      factionId: context?.factionId,
      autonomyLevel: context?.autonomyLevel,
      controlMode: context?.controlMode,
      errorCode: result.errorCode,
      tokenState: toSessionTokenStatePayload(result.tokenState),
    }
    writeJson(res, resolveMutationStatusCode(result), sessionMutationResponseSchema.parse(responsePayload))
    return
  }

  if (req.method === 'POST' && pathname === '/api/session/leave') {
    const body = await readSessionTokenBody(req)
    if (!isSessionTokenBodyValid(body)) {
      recordSessionRuntimeEvent({
        action: 'session_leave',
        success: false,
        message: 'session leave rejected: invalid token payload',
        metadata: { reason: 'invalid_body' },
      })
      writeJson(res, 400, { error: 'valid token required' })
      return
    }

    const beforeContext = getSessionControlContextByToken(body.token)
    const result = leaveSession(body.token)
    const nextAutonomyLevel = beforeContext
      ? getFactionAutonomyLevel(beforeContext.factionId)
      : undefined
    const nextControlMode = nextAutonomyLevel
      ? resolveSessionControlMode(nextAutonomyLevel)
      : undefined

    recordSessionRuntimeEvent({
      action: 'session_leave',
      success: result.ok,
      message: result.ok ? 'session leave accepted' : 'session leave failed',
      metadata: {
        factionId: beforeContext?.factionId,
        previousAutonomyLevel: beforeContext?.autonomyLevel,
        previousControlMode: beforeContext?.controlMode,
        nextAutonomyLevel,
        nextControlMode,
      },
    })

    const responsePayload: SessionMutationResponse = {
      ...result,
      factionId: beforeContext?.factionId,
      autonomyLevel: nextAutonomyLevel,
      controlMode: nextControlMode,
      errorCode: result.errorCode,
      tokenState: toSessionTokenStatePayload(result.tokenState),
    }
    writeJson(res, resolveMutationStatusCode(result), sessionMutationResponseSchema.parse(responsePayload))
    return
  }

  writeJson(res, 404, { error: 'Session route not found' })
}
