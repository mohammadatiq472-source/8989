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
import type { SessionAutonomyLevel, SessionRuntimeResponse } from '../../../shared/contracts/game'
import { writeJson } from './http'
import {
  getFactionSessionSnapshot,
  getSessionMetrics,
  getSessionStatus,
  heartbeat,
  joinSession,
  leaveSession,
  setSessionAutonomyLevel,
} from '../multiplayer/SessionManager'
import { getWorldStateReadonly } from '../application/world/WorldService'
import { getFactionConfig, getFactionDoctrine } from '../application/faction/FactionConfigStore'
import {
  isJoinSessionBodyValid,
  isSessionAutonomyBodyValid,
  isSessionTokenBodyValid,
  readSessionAutonomyBody,
  readJoinSessionBody,
  readSessionTokenBody,
} from './sessionBody'

const AUTONOMY_LEVELS = new Set<SessionAutonomyLevel>(['L1_assigned', 'L2_delegated', 'L3_negotiated'])

function resolveSessionControlMode(autonomyLevel: SessionAutonomyLevel) {
  if (autonomyLevel === 'L1_assigned') {
    return 'human_assigned' as const
  }
  if (autonomyLevel === 'L3_negotiated') {
    return 'ai_negotiated' as const
  }
  return 'ai_delegated' as const
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
      writeJson(res, 400, { error: 'factionId and playerName required' })
      return
    }

    const result = joinSession(body.factionId, body.playerName, allFactionIds)
    if ('error' in result) {
      writeJson(res, 409, result)
      return
    }

    writeJson(res, 200, {
      sessionId: result.sessionId,
      token: result.token,
      factionId: result.factionId,
      seatId: result.seatId,
    })
    return
  }

  if (req.method === 'POST' && pathname === '/api/session/heartbeat') {
    const body = await readSessionTokenBody(req)
    if (!isSessionTokenBodyValid(body)) {
      writeJson(res, 400, { error: 'valid token required' })
      return
    }

    writeJson(res, 200, heartbeat(body.token))
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
    writeJson(res, 200, runtime)
    return
  }

  if (req.method === 'POST' && pathname === '/api/session/autonomy') {
    const body = await readSessionAutonomyBody(req)
    if (!isSessionAutonomyBodyValid(body) || !AUTONOMY_LEVELS.has(body.level as SessionAutonomyLevel)) {
      writeJson(res, 400, { error: 'valid token and level required' })
      return
    }
    writeJson(res, 200, setSessionAutonomyLevel(body.token, body.level as SessionAutonomyLevel))
    return
  }

  if (req.method === 'POST' && pathname === '/api/session/leave') {
    const body = await readSessionTokenBody(req)
    if (!isSessionTokenBodyValid(body)) {
      writeJson(res, 400, { error: 'valid token required' })
      return
    }

    writeJson(res, 200, leaveSession(body.token))
    return
  }

  writeJson(res, 404, { error: 'Session route not found' })
}
