/**
 * V2 Game Routes — 招募/升星/部队/同盟/玩家 API
 *
 * 路由前缀: /api/v2/
 *   POST /api/v2/recruit       — 武将招募
 *   POST /api/v2/star-upgrade  — 武将升星
 *   POST /api/v2/star-allocate — 升星属性分配
 *   POST /api/v2/army/compose  — 部队编组
 *   POST /api/v2/army/create   — 创建部队
 *   GET  /api/v2/player/:id    — 查询 AI 玩家
 *   GET  /api/v2/players       — 查询所有 AI 玩家
 *   POST /api/v2/alliance      — 创建同盟
 *   GET  /api/v2/alliances     — 查询所有同盟
 *   POST /api/v2/alliance/join — 加入同盟
 *   GET  /api/v2/state         — V2 完整状态快照
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { writeJson } from './http'
import {
  recruitForPlayer,
  starUpgradeForPlayer,
  allocateAttributesForPlayer,
  composeArmy,
  createArmyForPlayer,
  getAIPlayer,
  getAllAIPlayers,
  createAlliance,
  getAllAlliances,
  joinAlliance,
  getV2GameState,
  syncV2StateWithWorld,
} from '../application/v2/V2GameService'
import { getWorldStateReadonly } from '../application/world/WorldService'
import {
  parseRecruitRequestBody,
  parseStarUpgradeRequestBody,
  parseStarAllocateRequestBody,
  parseArmyComposeRequestBody,
  parseArmyCreateRequestBody,
  parseAllianceCreateRequestBody,
  parseAllianceJoinRequestBody,
} from './v2RequestBody'


export async function dispatchV2Routes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<void> {
  // ── 招募 ──
  if (req.method === 'POST' && pathname === '/api/v2/recruit') {
    try {
      const parsed = await parseRecruitRequestBody(req)
      if (!parsed.success) {
        writeJson(res, 400, parsed.responseBody)
        return
      }
      const { aiPlayerId, poolType, count } = parsed.data
      const result = recruitForPlayer(aiPlayerId, poolType, count)
      writeJson(res, 200, result)
    } catch (err) {
      writeJson(res, 500, { error: err instanceof Error ? err.message : 'Recruit failed' })
    }
    return
  }

  // ── 升星 ──
  if (req.method === 'POST' && pathname === '/api/v2/star-upgrade') {
    try {
      const parsed = await parseStarUpgradeRequestBody(req)
      if (!parsed.success) {
        writeJson(res, 400, parsed.responseBody)
        return
      }
      const { aiPlayerId, targetInstanceId, sacrificeInstanceIds } = parsed.data
      const result = starUpgradeForPlayer(aiPlayerId, targetInstanceId, sacrificeInstanceIds)
      if (!result.success) {
        writeJson(res, 400, { error: result.error })
        return
      }
      writeJson(res, 200, result)
    } catch (err) {
      writeJson(res, 500, { error: err instanceof Error ? err.message : 'Star upgrade failed' })
    }
    return
  }

  // ── 属性分配 ──
  if (req.method === 'POST' && pathname === '/api/v2/star-allocate') {
    try {
      const parsed = await parseStarAllocateRequestBody(req)
      if (!parsed.success) {
        writeJson(res, 400, parsed.responseBody)
        return
      }
      const { aiPlayerId, instanceId, force, command, intelligence, charisma, speed } = parsed.data
      const result = allocateAttributesForPlayer(aiPlayerId, instanceId, { force, command, intelligence, charisma, speed })
      if (!result.success) {
        writeJson(res, 400, { error: result.error })
        return
      }
      writeJson(res, 200, result)
    } catch (err) {
      writeJson(res, 500, { error: err instanceof Error ? err.message : 'Allocation failed' })
    }
    return
  }

  // ── 部队编组 ──
  if (req.method === 'POST' && pathname === '/api/v2/army/compose') {
    try {
      const parsed = await parseArmyComposeRequestBody(req)
      if (!parsed.success) {
        writeJson(res, 400, parsed.responseBody)
        return
      }
      const { aiPlayerId, armyId, mainGeneralId, viceGeneralIds } = parsed.data
      const result = composeArmy(aiPlayerId, armyId, mainGeneralId, viceGeneralIds)
      if (!result.success) {
        writeJson(res, 400, { error: result.error })
        return
      }
      writeJson(res, 200, result)
    } catch (err) {
      writeJson(res, 500, { error: err instanceof Error ? err.message : 'Army compose failed' })
    }
    return
  }

  // ── 创建部队 ──
  if (req.method === 'POST' && pathname === '/api/v2/army/create') {
    try {
      const parsed = await parseArmyCreateRequestBody(req)
      if (!parsed.success) {
        writeJson(res, 400, parsed.responseBody)
        return
      }
      const { aiPlayerId, tileId } = parsed.data
      const result = createArmyForPlayer(aiPlayerId, tileId)
      if (!result.success) {
        writeJson(res, 400, { error: result.error })
        return
      }
      writeJson(res, 200, result)
    } catch (err) {
      writeJson(res, 500, { error: err instanceof Error ? err.message : 'Army create failed' })
    }
    return
  }

  // ── 查询 AI 玩家 ──
  if (req.method === 'GET' && pathname.startsWith('/api/v2/player/')) {
    const playerId = pathname.slice('/api/v2/player/'.length)
    if (!playerId) {
      writeJson(res, 400, { error: 'Player ID required' })
      return
    }
    const player = getAIPlayer(playerId)
    if (!player) {
      writeJson(res, 404, { error: 'AI player not found' })
      return
    }
    writeJson(res, 200, player)
    return
  }

  if (req.method === 'GET' && pathname === '/api/v2/players') {
    writeJson(res, 200, getAllAIPlayers())
    return
  }

  // ── 同盟 CRUD ──
  if (req.method === 'POST' && pathname === '/api/v2/alliance') {
    try {
      const parsed = await parseAllianceCreateRequestBody(req)
      if (!parsed.success) {
        writeJson(res, 400, parsed.responseBody)
        return
      }
      const alliance = createAlliance(parsed.data.name, parsed.data.leaderId, parsed.data.doctrine)
      writeJson(res, 200, alliance)
    } catch (err) {
      writeJson(res, 500, { error: err instanceof Error ? err.message : 'Alliance create failed' })
    }
    return
  }

  if (req.method === 'GET' && pathname === '/api/v2/alliances') {
    writeJson(res, 200, getAllAlliances())
    return
  }

  if (req.method === 'POST' && pathname === '/api/v2/alliance/join') {
    try {
      const parsed = await parseAllianceJoinRequestBody(req)
      if (!parsed.success) {
        writeJson(res, 400, parsed.responseBody)
        return
      }
      const result = joinAlliance(parsed.data.allianceId, parsed.data.playerId)
      if (!result.success) {
        writeJson(res, 400, { error: result.error })
        return
      }
      writeJson(res, 200, { success: true })
    } catch (err) {
      writeJson(res, 500, { error: err instanceof Error ? err.message : 'Join failed' })
    }
    return
  }

  // ── V2 完整状态 ──
  if (req.method === 'GET' && pathname === '/api/v2/state') {
    const world = getWorldStateReadonly()
    syncV2StateWithWorld(world)
    writeJson(res, 200, getV2GameState(world))
    return
  }

  writeJson(res, 404, { error: 'V2 route not found' })
}
