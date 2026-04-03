/**
 * GameWebSocket.ts — WebSocket Delta 协议服务（对标 CMD_90005 增量同步）
 *
 * 连接端点: ws://localhost:8787/ws
 *
 * 协议:
 *   客户端 → 服务端:
 *     { type: 'subscribe', factionId: string, token?: string }
 *     { type: 'ping' }
 *
 *   服务端 → 客户端:
 *     { type: 'tick_delta', tick, worldVersion, factionStats, unitChanges, tileChanges, aiQuotaChanges, events }
 *     { type: 'battle_report', tick, report: BattleOutcomeRecord }
 *     { type: 'diplomacy_event', tick, event: DiplomacyAgreement }
 *     { type: 'general_action', tick, generalId, action, autonomySource }
 *     { type: 'error', message: string }
 *     { type: 'pong' }
 *
 * Delta 增量策略:
 *   - unitChanges: op='upsert'|'delete'，只推送 strength/supply/tileId/status 变化的单位
 *   - tileChanges: 只推送 owner/enemyPressure 变化的地块
 *   - factionStats: 每势力领土数/总兵力/单位数
 *   - 战争迷雾: 按 factionId 过滤，只推送己方单位变化 + 涉及己方的事件
 */

import { WebSocketServer, WebSocket } from 'ws'
import type { Server, IncomingMessage } from 'node:http'
import type { WorldState, NarrativeEvent, BattleOutcomeRecord, DiplomacyAgreement } from '../../../shared/contracts/game'
import type { WsServerMessage } from '../../../shared/contracts/game/ws'
import { getWorldStateReadonly } from '../application/world/WorldService'
import { getFactionAutonomyLevel, validateToken } from '../multiplayer/SessionManager'

// ─── 连接管理 ─────────────────────────────────────────

type ClientSession = {
  ws: WebSocket
  factionId: string | null
  subscribedAt: number
}

const clients = new Set<ClientSession>()
let wss: WebSocketServer | null = null

// ─── 初始化 ───────────────────────────────────────────

export function attachWebSocket(server: Server): void {
  wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (request: IncomingMessage, socket, head) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
    if (url.pathname !== '/ws') {
      socket.destroy()
      return
    }

    wss!.handleUpgrade(request, socket, head, (ws) => {
      wss!.emit('connection', ws, request)
    })
  })

  wss.on('connection', (ws: WebSocket) => {
    const session: ClientSession = { ws, factionId: null, subscribedAt: Date.now() }
    clients.add(session)

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw))
        handleClientMessage(session, msg)
      } catch {
        sendToClient(session, { type: 'error', message: 'Invalid JSON' })
      }
    })

    ws.on('close', () => {
      clients.delete(session)
    })

    ws.on('error', () => {
      clients.delete(session)
    })
  })

  console.log('[WebSocket] attached to HTTP server on /ws')
}

// ─── 客户端消息处理 ──────────────────────────────────

function handleClientMessage(session: ClientSession, msg: unknown): void {
  if (!msg || typeof msg !== 'object') return
  const { type } = msg as { type?: string }

  switch (type) {
    case 'subscribe': {
      const { factionId, token } = msg as { factionId?: string; token?: string }
      if (!factionId || typeof factionId !== 'string') {
        sendToClient(session, { type: 'error', message: 'factionId required' })
        return
      }

      const normalizedFactionId = factionId.trim()
      const normalizedToken = typeof token === 'string' ? token.trim() : ''

      if (!normalizedFactionId) {
        sendToClient(session, { type: 'error', message: 'factionId required' })
        return
      }

      // Validate factionId exists in authoritative world state.
      const world = getWorldStateReadonly()
      if (!world.factions[normalizedFactionId]) {
        sendToClient(session, { type: 'error', message: `Unknown faction: ${normalizedFactionId}` })
        return
      }

      // Human-controlled factions require a matching session token for subscribe.
      const autonomyLevel = getFactionAutonomyLevel(normalizedFactionId)
      if (!normalizedToken && autonomyLevel === 'L1_assigned') {
        sendToClient(session, { type: 'error', message: 'token required for human-controlled faction subscription' })
        return
      }

      if (normalizedToken) {
        const validated = validateToken(normalizedToken)
        if (!validated) {
          sendToClient(session, { type: 'error', message: 'Invalid token' })
          return
        }

        if (validated.factionId !== normalizedFactionId) {
          sendToClient(session, { type: 'error', message: 'Token does not match factionId' })
          return
        }
      }

      session.factionId = normalizedFactionId
      sendToClient(session, { type: 'subscribed', factionId: normalizedFactionId, tick: world.tick })
      console.info(
        `[WebSocket] subscribed faction=${normalizedFactionId} tick=${world.tick} autonomy=${autonomyLevel}`,
      )
      break
    }

    case 'ping':
      sendToClient(session, { type: 'pong' })
      break

    default:
      sendToClient(session, { type: 'error', message: `Unknown message type: ${type}` })
  }
}

// ─── 服务端广播 API（由 WorldService/Simulation 调用）──

/**
 * 计算两个 WorldState 之间的实体差量（对标 CMD_90005 增量同步）
 *
 * 返回不同维度的变化：
 * - unitChanges:  strength/supply/tileId/status 变化的单位
 * - tileChanges:  owner/enemyPressure 变化的地块
 * - factionStats: 每个势力的领土/资源概要
 */
function computeEntityDelta(
  prev: WorldState,
  next: WorldState,
): {
  unitChanges: Array<{ id: string; op: 'upsert' | 'delete'; data?: { name: string; faction: string; tileId: string; strength: number; supply: number; status: string } }>
  tileChanges: Array<{ id: string; owner: string | null; enemyPressure: number }>
  factionStats: Record<string, { territories: number; totalStrength: number; unitCount: number }>
  aiQuotaChanges: Array<{
    factionId: string
    previousQuota: number
    currentQuota: number
    maxQuota: number
    growthScore: number
    tugIntensity: number
    nextUnlockScore: number | null
  }>
} {
  // --- Unit diff ---
  const prevUnits = new Map(prev.units.map(u => [u.id, u]))
  const nextUnits = new Map(next.units.map(u => [u.id, u]))
  const unitChanges: Array<{ id: string; op: 'upsert' | 'delete'; data?: { name: string; faction: string; tileId: string; strength: number; supply: number; status: string } }> = []

  for (const [id, nu] of nextUnits) {
    const pu = prevUnits.get(id)
    if (!pu || pu.tileId !== nu.tileId || pu.strength !== nu.strength || pu.supply !== nu.supply || pu.status !== nu.status) {
      unitChanges.push({ id, op: 'upsert', data: { name: nu.name, faction: nu.faction, tileId: nu.tileId, strength: nu.strength, supply: nu.supply, status: nu.status } })
    }
  }
  for (const id of prevUnits.keys()) {
    if (!nextUnits.has(id)) {
      unitChanges.push({ id, op: 'delete' })
    }
  }

  // --- Tile diff (owner / enemyPressure) ---
  const tileChanges: Array<{ id: string; owner: string | null; enemyPressure: number }> = []
  const prevTileMap = new Map(prev.map.tiles.map(t => [t.id, t]))
  for (const nt of next.map.tiles) {
    const pt = prevTileMap.get(nt.id)
    if (!pt || pt.owner !== nt.owner || pt.enemyPressure !== nt.enemyPressure) {
      tileChanges.push({ id: nt.id, owner: nt.owner, enemyPressure: nt.enemyPressure })
    }
  }

  // --- Faction stats ---
  const factionStats: Record<string, { territories: number; totalStrength: number; unitCount: number }> = {}
  for (const [fid, faction] of Object.entries(next.factions)) {
    const fUnits = next.units.filter(u => u.faction === fid)
    factionStats[fid] = {
      territories: faction.capturedCities?.length ?? 0,
      totalStrength: fUnits.reduce((s, u) => s + u.strength, 0),
      unitCount: fUnits.length,
    }
  }

  const aiQuotaChanges: Array<{
    factionId: string
    previousQuota: number
    currentQuota: number
    maxQuota: number
    growthScore: number
    tugIntensity: number
    nextUnlockScore: number | null
  }> = []
  for (const [factionId, faction] of Object.entries(next.factions)) {
    const nextQuota = faction.aiQuota
    if (nextQuota == null) {
      continue
    }
    const prevQuota = prev.factions[factionId]?.aiQuota
    const previousQuota = prevQuota?.currentQuota ?? nextQuota.initialQuota
    if (previousQuota === nextQuota.currentQuota) {
      continue
    }

    aiQuotaChanges.push({
      factionId,
      previousQuota,
      currentQuota: nextQuota.currentQuota,
      maxQuota: nextQuota.maxQuota,
      growthScore: nextQuota.growthScore,
      tugIntensity: nextQuota.tugIntensity,
      nextUnlockScore: nextQuota.nextUnlockScore ?? null,
    })
  }

  return { unitChanges, tileChanges, factionStats, aiQuotaChanges }
}

/**
 * Tick 完成后广播 delta 给所有订阅的客户端
 *
 * @param prevWorld - Tick 前的世界快照（用于计算差量）
 * @param world     - Tick 后的世界状态
 * @param events    - 本 tick 生成的叙事事件
 */
export function broadcastTickDelta(
  prevWorld: WorldState,
  world: WorldState,
  events: NarrativeEvent[],
): void {
  if (clients.size === 0) return

  const delta = computeEntityDelta(prevWorld, world)

  for (const session of clients) {
    if (session.ws.readyState !== WebSocket.OPEN || !session.factionId) continue

    // 战争迷雾：过滤事件，只推送涉及己方的
    const visibleEvents = events.filter(e =>
      e.actors.includes(session.factionId!) ||
      e.significance === 'epic',
    )

    // 战争迷雾：过滤 unit 变化，只推送己方单位 + 交战中的敌方单位
    const visibleUnitChanges = delta.unitChanges.filter(uc =>
      uc.data?.faction === session.factionId || uc.op === 'delete',
    )
    const sessionAiQuotaChanges = delta.aiQuotaChanges.filter((item) => item.factionId === session.factionId)

    sendToClient(session, {
      type: 'tick_delta',
      tick: world.tick,
      worldVersion: world.worldVersion,
      factionStats: delta.factionStats,
      unitChanges: visibleUnitChanges,
      tileChanges: delta.tileChanges,
      aiQuotaChanges: sessionAiQuotaChanges,
      events: visibleEvents,
    })

    if (sessionAiQuotaChanges.length > 0) {
      console.info(
        `[WebSocket] tick_delta faction=${session.factionId} tick=${world.tick} worldVersion=${world.worldVersion} ` +
        `unitChanges=${visibleUnitChanges.length} tileChanges=${delta.tileChanges.length} ` +
        `aiQuotaChanges=${sessionAiQuotaChanges.length} events=${visibleEvents.length}`,
      )
    }
  }
}

/**
 * 广播战斗报告
 */
export function broadcastBattleReport(tick: number, report: BattleOutcomeRecord): void {
  for (const session of clients) {
    if (session.ws.readyState !== WebSocket.OPEN || !session.factionId) continue
    // 战报推送给攻方，以及所有可能在同区域的势力（防方无法从 record 确定，推给全体订阅者）
    sendToClient(session, { type: 'battle_report', tick, report })
  }
}

/**
 * 广播外交事件
 */
export function broadcastDiplomacyEvent(tick: number, agreement: DiplomacyAgreement): void {
  for (const session of clients) {
    if (session.ws.readyState !== WebSocket.OPEN || !session.factionId) continue
    if (!agreement.parties.includes(session.factionId)) continue

    sendToClient(session, { type: 'diplomacy_event', tick, event: agreement })
  }
}

/**
 * 广播将领行动摘要（携带忠诚度/信任度/tier）
 */
export function broadcastGeneralAction(
  tick: number,
  generalId: string,
  faction: string,
  action: string,
  autonomySource: string,
  loyaltyLevel?: number,
  lordTrust?: number,
  tier?: 1 | 2 | 3,
): void {
  for (const session of clients) {
    if (session.ws.readyState !== WebSocket.OPEN || !session.factionId) continue
    if (session.factionId !== faction) continue

    sendToClient(session, { type: 'general_action', tick, generalId, action, autonomySource, loyaltyLevel, lordTrust, tier })
  }
}

/**
 * 将领主动向玩家推送消息（委屈、大胜、危机、忠诚告急等）
 * 这是"将领有状态角色"最直观的体现——将领会主动"请奏"
 */
export function broadcastGeneralMessage(
  faction: string,
  payload: {
    tick: number
    generalId: string
    generalName: string
    text: string
    trigger: 'grievance' | 'victory' | 'crisis' | 'loyalty_critical' | 'promotion'
    loyaltyLevel: number
    lordTrust: number
  },
): void {
  for (const session of clients) {
    if (session.ws.readyState !== WebSocket.OPEN || !session.factionId) continue
    if (session.factionId !== faction) continue

    sendToClient(session, {
      type: 'general_message',
      faction,
      ...payload,
    })
  }
}

/**
 * 获取当前连接数和分布
 */
export function getWebSocketStats(): { totalConnections: number; subscribedConnections: number; factionDistribution: Record<string, number> } {
  const distribution: Record<string, number> = {}
  let subscribed = 0
  for (const session of clients) {
    if (session.factionId) {
      subscribed++
      distribution[session.factionId] = (distribution[session.factionId] ?? 0) + 1
    }
  }
  return { totalConnections: clients.size, subscribedConnections: subscribed, factionDistribution: distribution }
}

// ─── 工具函数 ─────────────────────────────────────────

function sendToClient(session: ClientSession, data: WsServerMessage): void {
  if (session.ws.readyState === WebSocket.OPEN) {
    session.ws.send(JSON.stringify(data))
  }
}
