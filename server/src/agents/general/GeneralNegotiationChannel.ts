/**
 * GeneralNegotiationChannel.ts — 跨势力将领对话博弈通道
 *
 * 架构定位：
 *   这是比 DiplomacyAgent（势力级外交）更低层的"战场通信层"。
 *   当两支不同势力的部队在地图上距离足够近时，对应的将领会触发
 *   "战场对话"——威慑、谈判、情报交换、甚至临阵投降。
 *
 * 工作流：
 *   1. runGeneralDispatch 每回合结束后调用 detectAndPostNegotiations()
 *   2. 检测地图上相距 ≤ NEGOTIATION_RANGE 格的跨势力单位对
 *   3. 基于双方将领性格（loyalty / aggression / riskTolerance）生成消息
 *   4. 消息写入 NegotiationInbox（Map<generalId, NegotiationMessage[]>）
 *   5. 下一回合 dispatch 时，将领读取 inbox 并可能调整战术意图
 *   6. 消息自动过期（TTL = 3 ticks）
 */

import type { WorldState } from '../../../../shared/contracts/game'
import type { GeneralProfile } from './GeneralProfileStore'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

export type NegotiationTone = 'threat' | 'challenge' | 'ceasefire_offer' | 'intelligence' | 'alliance_offer'

export type NegotiationMessage = {
  id: string
  tick: number
  /** 发送方将领 ID */
  senderId: string
  senderName: string
  senderFactionId: string
  /** 接收方将领 ID */
  receiverId: string
  receiverFactionId: string
  tone: NegotiationTone
  /** 消息正文（in-character 文言风格） */
  body: string
  /** 发送时双方距离（格） */
  distanceTiles: number
  /** 建议接收方采取的反应 */
  suggestedResponse?: 'retreat' | 'hold' | 'negotiate' | 'attack'
  /** TTL：剩余有效回合数 */
  ttl: number
}

export type NegotiationInbox = Map<string, NegotiationMessage[]>
export type NegotiationOutbox = Map<string, NegotiationMessage[]>

// ─── 全局通信通道（进程级单例，仿真共享） ────────────────────────────────────

const globalInbox: NegotiationInbox = new Map()
const NEGOTIATION_INBOX_PERSIST_PATH = join(process.cwd(), 'tmp', 'general_negotiation_inbox.json')
const NEGOTIATION_INBOX_PERSIST_DEBOUNCE_MS = 1_000
const MAX_PERSISTED_MESSAGES = 600
let persistTimer: ReturnType<typeof setTimeout> | null = null
let persistInFlight: Promise<void> | null = null
let persistDirty = false

/** 相邻距离阈值（格数），超过此距离不触发战场对话 */
const NEGOTIATION_RANGE = 5

/** 每回合最多生成的谈判消息对数（避免日志爆炸） */
const MAX_NEGOTIATIONS_PER_TICK = 6

loadPersistedNegotiationInbox()

// ─── 公共接口 ─────────────────────────────────────────────────────────────────

/** 读取某将领的待处理谈判消息（并清空 inbox） */
export function drainNegotiationInbox(generalId: string): NegotiationMessage[] {
  const hadEntry = globalInbox.has(generalId)
  const messages = globalInbox.get(generalId) ?? []
  globalInbox.delete(generalId)
  if (hadEntry) {
    schedulePersistNegotiationInbox()
  }
  return messages
}

/** 获取 inbox 快照（不清空，用于仿真报告） */
export function peekNegotiationInbox(generalId: string): NegotiationMessage[] {
  return globalInbox.get(generalId) ?? []
}

/** 全局 inbox 待处理消息总数 */
export function totalPendingNegotiations(): number {
  let total = 0
  for (const msgs of globalInbox.values()) total += msgs.length
  return total
}

/**
 * 核心函数：检测邻近跨势力单位对，生成战场谈判消息并推入 inbox
 *
 * 应在每回合 runGeneralDispatch 完成后调用。
 *
 * @param world  当前世界状态
 * @param generals 本次参与 dispatch 的将领列表（所有势力）
 */
export function detectAndPostNegotiations(
  world: WorldState,
  generals: GeneralProfile[],
): NegotiationMessage[] {
  const generated: NegotiationMessage[] = []
  let inboxChanged = false

  // 构建 tileId → unit 快速索引
  const unitByTile = new Map<string, { unitId: string; factionId: string; general: GeneralProfile }>()
  for (const general of generals) {
    const unit = world.units.find(u => u.id === general.unitId)
    if (!unit) continue
    unitByTile.set(unit.tileId, { unitId: unit.id, factionId: unit.faction, general })
  }

  // 构建邻接关系（使用地图 connections 来计算近距离）
  const checked = new Set<string>()  // 避免重复触发同一对

  let count = 0
  for (const [tileId, info] of unitByTile.entries()) {
    if (count >= MAX_NEGOTIATIONS_PER_TICK) break

    // BFS 搜索 NEGOTIATION_RANGE 格内的异势力单位
    const visited = new Set<string>([tileId])
    let frontier = [tileId]
    for (let depth = 1; depth <= NEGOTIATION_RANGE; depth++) {
      const next: string[] = []
      for (const fid of frontier) {
        for (const nid of world.map.connections[fid] ?? []) {
          if (visited.has(nid)) continue
          visited.add(nid)
          next.push(nid)

          const neighbor = unitByTile.get(nid)
          if (!neighbor || neighbor.factionId === info.factionId) continue

          const pairKey = [info.unitId, neighbor.unitId].sort().join(':')
          if (checked.has(pairKey)) continue
          checked.add(pairKey)

          // 检查是否有外交停战协议（有则不触发战场对话）
          const hasAgreement = world.feedback.diplomacyAgreements?.some(
            a => a.duration > 0 &&
              a.parties.includes(info.factionId) &&
              a.parties.includes(neighbor.factionId),
          )
          if (hasAgreement) continue

          const msg = buildNegotiationMessage(world, info.general, neighbor.general, depth)
          if (!msg) continue

          // 推入接收方 inbox
          const existing = globalInbox.get(neighbor.general.id) ?? []
          existing.push(msg)
          globalInbox.set(neighbor.general.id, existing)
          inboxChanged = true

          generated.push(msg)
          count++
          if (count >= MAX_NEGOTIATIONS_PER_TICK) break
        }
      }
      frontier = next
      if (count >= MAX_NEGOTIATIONS_PER_TICK) break
    }
  }

  // TTL 衰减：移除过期消息
  for (const [gid, msgs] of globalInbox.entries()) {
    if (msgs.length > 0) {
      inboxChanged = true
    }
    const alive = msgs.map(m => ({ ...m, ttl: m.ttl - 1 })).filter(m => m.ttl > 0)
    if (alive.length === 0) globalInbox.delete(gid)
    else globalInbox.set(gid, alive)
  }

  if (inboxChanged) {
    schedulePersistNegotiationInbox()
  }

  return generated
}

// ─── 内部辅助 ─────────────────────────────────────────────────────────────────

function buildNegotiationMessage(
  world: WorldState,
  sender: GeneralProfile,
  receiver: GeneralProfile,
  distance: number,
): NegotiationMessage | null {
  const senderUnit = world.units.find(u => u.id === sender.unitId)
  const receiverUnit = world.units.find(u => u.id === receiver.unitId)
  if (!senderUnit || !receiverUnit) return null

  const aggression = sender.personality.aggression
  const loyalty = sender.personality.loyalty
  const risk = sender.personality.riskTolerance

  // 根据将领性格决定消息类型和内容
  let tone: NegotiationTone
  let body: string
  let suggestedResponse: NegotiationMessage['suggestedResponse']

  if (aggression > 0.7 && risk > 0.6) {
    tone = 'threat'
    body = `吾乃 ${sender.name}（${senderUnit.faction}），汝部已在视野之内！速速退兵，否则此地必成汝等葬身之所！`
    suggestedResponse = 'retreat'
  } else if (aggression > 0.5) {
    tone = 'challenge'
    body = `${sender.name} 于此向 ${receiver.name} 发出挑战：两军相遇，勇者胜。若汝有胆，可在此地决一死战；若惜兵力，可各退一步，互不侵扰。`
    suggestedResponse = 'hold'
  } else if (loyalty < 0.4) {
    tone = 'intelligence'
    body = `【密报】${sender.name} 悄然向 ${receiver.name} 传递：我主近日粮草短缺，此处防线空虚。若贵部欲图谋此地，时机正佳——此言仅作私下交换，望对方也有情报回赠。`
    suggestedResponse = 'negotiate'
  } else if (senderUnit.strength < 30 || distance <= 2) {
    tone = 'ceasefire_offer'
    body = `${sender.name} 遣使致意 ${receiver.name}：两军对阵，徒费兵力，不如暂订停战，各守疆域，共图洛阳大业？停战期间双方皆可从容备战，岂不两利？`
    suggestedResponse = 'negotiate'
  } else {
    tone = 'alliance_offer'
    body = `${sender.name} 特向 ${receiver.name} 致意：当前局势，孤军难支。若能携手，共击强敌，洛阳之役或可共谋一战之机。特此相邀——结盟否？`
    suggestedResponse = 'negotiate'
  }

  return {
    id: `neg_${world.tick}_${sender.id}_${receiver.id}`,
    tick: world.tick,
    senderId: sender.id,
    senderName: sender.name,
    senderFactionId: senderUnit.faction,
    receiverId: receiver.id,
    receiverFactionId: receiverUnit.faction,
    tone,
    body,
    distanceTiles: distance,
    suggestedResponse,
    ttl: 3,
  }
}

type PersistedNegotiationInbox = Array<[string, NegotiationMessage[]]>

function loadPersistedNegotiationInbox(): void {
  try {
    if (!existsSync(NEGOTIATION_INBOX_PERSIST_PATH)) {
      return
    }

    const raw = readFileSync(NEGOTIATION_INBOX_PERSIST_PATH, 'utf8')
    const parsed = JSON.parse(raw) as PersistedNegotiationInbox
    if (!Array.isArray(parsed)) {
      return
    }

    let restored = 0
    for (const item of parsed) {
      if (!Array.isArray(item) || item.length !== 2) {
        continue
      }

      const generalId = typeof item[0] === 'string' ? item[0] : ''
      const messages = Array.isArray(item[1]) ? item[1] : []
      if (!generalId || messages.length === 0) {
        continue
      }

      const alive = messages
        .filter((message) => typeof message?.ttl === 'number' && message.ttl > 0)
        .slice(-MAX_NEGOTIATIONS_PER_TICK * 3)
      if (alive.length === 0) {
        continue
      }

      globalInbox.set(generalId, alive)
      restored += alive.length
    }

    if (restored > 0) {
      console.log(`[GeneralNegotiationChannel] restored ${restored} pending negotiation messages`)
    }
  } catch {
    console.warn('[GeneralNegotiationChannel] failed to restore negotiation inbox, starting fresh')
  }
}

function schedulePersistNegotiationInbox(): void {
  persistDirty = true
  if (persistTimer) {
    return
  }

  persistTimer = setTimeout(() => {
    persistTimer = null
    void flushNegotiationInboxPersist()
  }, NEGOTIATION_INBOX_PERSIST_DEBOUNCE_MS)
}

export async function flushNegotiationInboxPersist(): Promise<void> {
  if (!persistDirty) {
    return
  }

  if (persistInFlight) {
    await persistInFlight
    return
  }

  const snapshot = buildPersistedNegotiationInbox()
  persistDirty = false

  persistInFlight = (async () => {
    try {
      mkdirSync(dirname(NEGOTIATION_INBOX_PERSIST_PATH), { recursive: true })
      const tmpPath = `${NEGOTIATION_INBOX_PERSIST_PATH}.tmp-${process.pid}-${Date.now()}`
      await writeFile(tmpPath, JSON.stringify(snapshot, null, 2), 'utf8')
      await rename(tmpPath, NEGOTIATION_INBOX_PERSIST_PATH)
    } catch {
      persistDirty = true
      console.warn('[GeneralNegotiationChannel] failed to persist negotiation inbox')
    } finally {
      persistInFlight = null
      if (persistDirty && !persistTimer) {
        schedulePersistNegotiationInbox()
      }
    }
  })()

  await persistInFlight
}

function buildPersistedNegotiationInbox(): PersistedNegotiationInbox {
  const persisted: PersistedNegotiationInbox = []
  let remaining = MAX_PERSISTED_MESSAGES

  for (const [generalId, messages] of globalInbox.entries()) {
    if (remaining <= 0) {
      break
    }

    const alive = messages.filter((message) => message.ttl > 0)
    if (alive.length === 0) {
      continue
    }

    const kept = alive.slice(-Math.min(alive.length, remaining))
    persisted.push([generalId, kept])
    remaining -= kept.length
  }

  return persisted
}
