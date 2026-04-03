import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildPlannerSnapshotForFaction, buildTheaterSnapshot } from '../../../../shared/domain/theater'
import { retrieveReplays } from '../../infra/rag/retrieveReplays'
import { getNarrativeEvents } from '../../application/world/WorldService'
import type { ActionType, FactionId, NarrativeEvent, RegionPriority, UnitStatus, WorldState } from '../../../../shared/contracts/game'
import { retrieveTacticalSkills, buildSituationTags, type TacticalSkillEntry } from './TacticalSkillLibrary'
import { getTileByIdFast } from '../../../../shared/domain/worldIndex'

export type CommanderAvailableUnit = {
  id: string
  name: string
  tileId: string
  status: UnitStatus
  strength: number
  supply: number
  heroLevel: number
  archetype: string
  force: number
  command: number
  intelligence: number
  charisma: number
  speed: number
  available: boolean
  unavailableReason?: string
}

export type FrontlineRiskSignal = {
  score: number
  tier: 'low' | 'medium' | 'high'
  hotspots: Array<{
    regionId: string
    regionName: string
    priority: RegionPriority
    riskScore: number
    scoutingCoverage: number
    summary: string
  }>
}

export type ReplayMemorySnippet = {
  requestId: string
  createdTick: number
  outcome: 'running' | 'completed' | 'failed' | 'cleared'
  intent: string
  priority: RegionPriority
  orderCount: number
  shortSummary: string
  excerpt: string
  score: number
}

export type DoctrineSnippet = {
  id: string
  title: string
  trigger: string
  guidance: string
  preferredActions: ActionType[]
  caution: string
}



export type MemoryRecallSnippet = {
  text: string
  score?: number
  createdAt?: string
  metadata?: Record<string, unknown>
}

export type NarrativeSnippet = {
  tick: number
  type: NarrativeEvent['type']
  summary: string
  significance: NarrativeEvent['significance']
  actors: string[]
}

export type PassControlEntry = {
  passId: string
  passName: string
  owner: string
  connectsDistricts: [string, string]
  hasGarrison: boolean
  controlled: boolean        // true = our faction controls it
  recommended_action: 'hold' | 'capture' | 'bypass' | 'n/a'
}

/** PVE 开荒机会节点——让 AI 看见哪些资源地还有守营可攻克 */
export type PveOpportunityEntry = {
  nodeId: string
  nodeName: string
  district: string
  tileId: string
  guardStrength: number
  rewardSummary: string                 // e.g. "3粮+1AP"
  nearestFriendlyUnitId: string | null  // 最近我方单位 id
  nearestUnitDistance: number           // 曼哈顿距离，-1 代表无友方单位
  recommended_action: 'already_on_site' | 'send_unit' | 'too_far'
}

/** 洛阳终局状态摘要——AI 决策胜负节点时使用 */
export type VictoryContextSnapshot = {
  luoyangOwner: string
  ourHoldTicks: number             // 我方连续占领洛阳已 N 回合
  holdTicksRequired: number        // 需 5 回合获胜
  ourSiegeTicks: number            // 我方本次围城进度
  enemyMaxSiegeTicks: number       // 最高威胁敌方的围城进度
  siegeTicksRequired: number       // 需 3 回合完成占领
  recommended_action: 'attack_luoyang' | 'besiege_now' | 'defend_luoyang' | 'hold_position'
}

export type CommanderToolContext = {
  command: string
  worldSnapshot: ReturnType<typeof readWorldSnapshot>
  availableUnits: CommanderAvailableUnit[]
  frontlineRisk: FrontlineRiskSignal
  recentReplays: ReplayMemorySnippet[]
  doctrineSnippets: DoctrineSnippet[]
  memoryRecall: MemoryRecallSnippet[]
  recentNarratives: NarrativeSnippet[]
  allowedActions: ActionType[]
  passControlStatus: PassControlEntry[]
  pveOpportunities: PveOpportunityEntry[]
  victoryContext: VictoryContextSnapshot
  /** Voyager 模式：与当前情境最相关的历史成功战术，供 LLM 参考 */
  historicalSkills: TacticalSkillEntry[]
  /** U7/B9: 前线附近敌方威胁摘要（不超过5个），供 LLM 知己知彼 */
  enemyThreats?: NearbyEnemyThreat[]
}

/** U7: 前线附近的敌方威胁摘要 */
export type NearbyEnemyThreat = {
  factionId: string
  unitName: string
  strength: number
  tileId: string
  threatLevel: 'high' | 'medium' | 'low'
}

const DISPATCHABLE_STATUS = new Set<UnitStatus>(['待命', '驻防中'])
const DEFAULT_ALLOWED_ACTIONS: ActionType[] = ['march', 'garrison', 'recon', 'support', 'capture']
const MAX_TOOL_CONTEXT_CACHE_ENTRIES = 160
const toolContextPromiseCache = new Map<string, Promise<CommanderToolContext>>()
const MAX_TOOL_DERIVED_CACHE_ENTRIES = 64
const theaterSnapshotCache = new Map<number, ReturnType<typeof buildTheaterSnapshot>>()
const plannerSnapshotCache = new Map<string, ReturnType<typeof buildPlannerSnapshotForFaction>>()

const DOCTRINE_LIBRARY: DoctrineSnippet[] = loadDoctrineLibrary()

function loadDoctrineLibrary(): DoctrineSnippet[] {
  try {
    const raw = readFileSync(join(process.cwd(), 'server', 'config', 'doctrine.json'), 'utf8')
    return JSON.parse(raw) as DoctrineSnippet[]
  } catch {
    console.warn('[CommanderTools] failed to load doctrine.json, using empty library')
    return []
  }
}

const SUPPLY_KEYWORDS = ['supply', 'logistics', '补给', '粮道', '后勤', '资源']
const EXPAND_KEYWORDS = ['expand', 'push', 'capture', '扩张', '推进', '占点']
const CAUTIOUS_KEYWORDS = ['cautious', 'safe', '保守', '稳']
const RECON_KEYWORDS = ['recon', 'scout', '侦察', '情报']

function resolveDefaultFactionId(world: WorldState): FactionId {
  const firstFactionId = Object.keys(world.factions)[0]
  return (firstFactionId ?? 'neutral') as FactionId
}

export function readWorldSnapshot(world: WorldState, strategicCommand: string) {
  return readWorldSnapshotForFaction(world, strategicCommand, resolveDefaultFactionId(world))
}

export function readWorldSnapshotForFaction(
  world: WorldState,
  strategicCommand: string,
  factionId: FactionId,
) {
  return getCachedPlannerSnapshot(world, strategicCommand, factionId)
}

export function listAvailableUnits(world: WorldState): CommanderAvailableUnit[] {
  return listAvailableUnitsForFaction(world, resolveDefaultFactionId(world))
}

export function listAvailableUnitsForFaction(
  world: WorldState,
  factionId: FactionId,
): CommanderAvailableUnit[] {
  return world.units
    .filter((unit) => unit.faction === factionId)
    .map((unit) => {
      const available = DISPATCHABLE_STATUS.has(unit.status)
      return {
        id: unit.id,
        name: unit.name,
        tileId: unit.tileId,
        status: unit.status,
        strength: unit.strength,
        supply: unit.supply,
        heroLevel: unit.hero.level,
        archetype: unit.hero.archetype,
        force: unit.hero.force,
        command: unit.hero.command,
        intelligence: unit.hero.intelligence,
        charisma: unit.hero.charisma,
        speed: unit.hero.speed,
        available,
        unavailableReason: available ? undefined : `status:${unit.status}`,
      }
    })
}

export function scoreFrontlineRisk(world: WorldState): FrontlineRiskSignal {
  const theater = getCachedTheaterSnapshot(world)
  const hotspots = theater.macroRegions
    .map((region) => {
      const riskScore = Math.max(
        0,
        Math.min(
          100,
          Math.round(
            region.averageEnemyPressure * 16 +
              (100 - region.scoutingCoverage) * 0.22 +
              region.recentBattlePressure * 0.56 +
              (region.role === 'frontier' ? 8 : 0),
          ),
        ),
      )
      return {
        regionId: region.id,
        regionName: region.name,
        priority: region.priority,
        riskScore,
        scoutingCoverage: region.scoutingCoverage,
        summary: region.summary,
      }
    })
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 4)

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(theater.frontlineRisk * 8 + theater.battleRisk * 0.45 + (100 - theater.reconCoverage) * 0.2),
    ),
  )

  return {
    score,
    tier: score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low',
    hotspots,
  }
}

export async function readRecentReplays(
  world: WorldState,
  strategicCommand: string,
  limit = 3,
): Promise<ReplayMemorySnippet[]> {
  return (await retrieveReplays(world, strategicCommand, { topK: limit })).map((item) => ({
    requestId: item.requestId,
    createdTick: item.createdTick,
    outcome: item.outcome,
    intent: item.intent,
    priority: item.priority,
    orderCount: item.orderCount,
    shortSummary: item.shortSummary,
    excerpt: item.excerpt,
    score: item.score,
  }))
}

export function retrieveDoctrineSnippets(
  world: WorldState,
  strategicCommand: string,
  limit = 3,
): DoctrineSnippet[] {
  const normalizedCommand = strategicCommand.toLowerCase()
  const risk = scoreFrontlineRisk(world)

  const ranked = DOCTRINE_LIBRARY.map((snippet) => {
    let score = 0

    if (snippet.id === 'stabilize-frontline' && risk.tier === 'high') {
      score += 4
    }

    if (snippet.id === 'intel-first' && (containsAny(normalizedCommand, RECON_KEYWORDS) || risk.score >= 55)) {
      score += 3
    }

    if (snippet.id === 'supply-guard' && containsAny(normalizedCommand, SUPPLY_KEYWORDS)) {
      score += 4
    }

    if (snippet.id === 'opportunistic-expand' && containsAny(normalizedCommand, EXPAND_KEYWORDS)) {
      score += risk.tier === 'low' ? 4 : 1
    }

    if (containsAny(normalizedCommand, CAUTIOUS_KEYWORDS)) {
      if (snippet.id === 'stabilize-frontline' || snippet.id === 'intel-first') {
        score += 2
      }
    }

    return { snippet, score }
  })

  return ranked
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.snippet)
}

export async function buildCommanderToolContext(
  world: WorldState,
  strategicCommand: string,
): Promise<CommanderToolContext> {
  return buildCommanderToolContextForFaction(world, strategicCommand, resolveDefaultFactionId(world))
}

export async function buildCommanderToolContextForFaction(
  world: WorldState,
  strategicCommand: string,
  factionId: FactionId,
): Promise<CommanderToolContext> {
  const normalizedCommand = normalizeStrategicCommand(strategicCommand)
  const cacheKey = buildToolContextCacheKey(world.worldVersion, factionId, normalizedCommand)
  const cached = toolContextPromiseCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const contextPromise = (async () => {
    return {
      command: normalizedCommand,
      worldSnapshot: readWorldSnapshotForFaction(world, normalizedCommand, factionId),
      availableUnits: listAvailableUnitsForFaction(world, factionId),
      frontlineRisk: scoreFrontlineRisk(world),
      recentReplays: await readRecentReplays(world, normalizedCommand),
      doctrineSnippets: retrieveDoctrineSnippets(world, normalizedCommand),
      memoryRecall: [],
      recentNarratives: readRecentNarratives(8, factionId),
      allowedActions: DEFAULT_ALLOWED_ACTIONS,
      passControlStatus: buildPassControlStatus(world, factionId),
      pveOpportunities: buildPveOpportunities(world, factionId),
      victoryContext: buildVictoryContext(world, factionId),
      historicalSkills: buildHistoricalSkills(world, factionId),
      enemyThreats: buildNearbyEnemyThreats(world, factionId),
    } satisfies CommanderToolContext
  })()

  toolContextPromiseCache.set(cacheKey, contextPromise)
  trimToolContextCache()

  try {
    return await contextPromise
  } catch (error) {
    toolContextPromiseCache.delete(cacheKey)
    throw error
  }
}

function buildToolContextCacheKey(worldVersion: number, factionId: FactionId, command: string) {
  return `${worldVersion}:${factionId}:${command.toLowerCase()}`
}

function normalizeStrategicCommand(input: string) {
  const normalized = input.replace(/\s+/g, ' ').trim()
  return normalized.length > 0 ? normalized : 'hold position'
}

function trimToolContextCache() {
  if (toolContextPromiseCache.size <= MAX_TOOL_CONTEXT_CACHE_ENTRIES) {
    return
  }

  while (toolContextPromiseCache.size > MAX_TOOL_CONTEXT_CACHE_ENTRIES) {
    const firstKey = toolContextPromiseCache.keys().next().value
    if (!firstKey) {
      break
    }
    toolContextPromiseCache.delete(firstKey)
  }
}


function getCachedTheaterSnapshot(world: WorldState) {
  const cached = theaterSnapshotCache.get(world.worldVersion)
  if (cached) {
    return cached
  }

  const snapshot = buildTheaterSnapshot(world)
  theaterSnapshotCache.set(world.worldVersion, snapshot)
  trimDerivedCaches()
  return snapshot
}

function getCachedPlannerSnapshot(
  world: WorldState,
  strategicCommand: string,
  factionId: FactionId,
) {
  const normalizedCommand = normalizeStrategicCommand(strategicCommand)
  const cacheKey = `${world.worldVersion}:${factionId}`
  const cached = plannerSnapshotCache.get(cacheKey)
  if (cached) {
    return cached.command === normalizedCommand ? cached : { ...cached, command: normalizedCommand }
  }

  const snapshot = buildPlannerSnapshotForFaction(world, normalizedCommand, factionId)
  plannerSnapshotCache.set(cacheKey, snapshot)
  trimDerivedCaches()
  return snapshot
}

function trimDerivedCaches() {
  while (theaterSnapshotCache.size > MAX_TOOL_DERIVED_CACHE_ENTRIES) {
    const oldest = theaterSnapshotCache.keys().next().value
    if (oldest === undefined) {
      break
    }
    theaterSnapshotCache.delete(oldest)
  }

  while (plannerSnapshotCache.size > MAX_TOOL_DERIVED_CACHE_ENTRIES) {
    const oldest = plannerSnapshotCache.keys().next().value
    if (!oldest) {
      break
    }
    plannerSnapshotCache.delete(oldest)
  }
}

function containsAny(input: string, keywords: string[]) {
  return keywords.some((keyword) => input.includes(keyword))
}

function readRecentNarratives(limit: number, factionId?: string): NarrativeSnippet[] {
  // U5/B8: 按 factionId 过滤叙事事件，避免不同势力读到对方情报
  const fetchLimit = factionId ? limit * 4 : limit
  const narratives = getNarrativeEvents(fetchLimit)
  const items = factionId
    ? narratives.items.filter((event) => event.actors.includes(factionId))
    : narratives.items
  return items.slice(0, limit).map((event) => ({
    tick: event.tick,
    type: event.type,
    summary: event.summary,
    significance: event.significance,
    actors: event.actors,
  }))
}

export function buildPassControlStatus(world: WorldState, factionId: FactionId): PassControlEntry[] {
  const passTiles = world.map.tiles.filter((t) => t.type === 'pass')
  const results: PassControlEntry[] = []

  for (const tile of passTiles) {
    // Determine which two districts this pass connects by checking neighbors
    const neighborIds: string[] = world.map.connections[tile.id] ?? []
    const neighborDistricts = new Set<string>()
    for (const nid of neighborIds) {
      const n = getTileByIdFast(world, nid)
      if (n?.district && n.district !== tile.district) {
        neighborDistricts.add(n.district)
      }
    }
    const [d1 = tile.district ?? 'unknown', d2 = '?'] = Array.from(neighborDistricts)

    const controlled = tile.owner === factionId
    const hasGarrison = world.units.some((u) => u.tileId === tile.id && u.faction === factionId)

    let recommended_action: PassControlEntry['recommended_action'] = 'n/a'
    if (!controlled) {
      recommended_action = 'capture'
    } else if (!hasGarrison) {
      recommended_action = 'hold'
    }

    results.push({
      passId: tile.id,
      passName: tile.name,
      owner: tile.owner ?? 'neutral',
      connectsDistricts: [d1, d2],
      hasGarrison,
      controlled,
      recommended_action,
    })
  }

  return results
}

/** 最多向 AI 展示的 PVE 节点数（避免 token 爆炸） */
const MAX_PVE_OPPORTUNITIES = 8

/**
 * 构建 PVE 开荒机会列表：找出未清剿节点中距离友方最近的若干个。
 * AI 可据此主动指派单位前往"守营"所在格开荒。
 */
// ── TacticalSkillLibrary 情境召回 ─────────────────────────────────────────────
function buildHistoricalSkills(world: WorldState, factionId: FactionId): TacticalSkillEntry[] {
  const vc = buildVictoryContext(world, factionId)
  const risk = scoreFrontlineRisk(world)
  const tags = buildSituationTags(
    world.tick,
    factionId,
    vc.luoyangOwner,
    risk.tier,
    `tick_${world.tick}`,
  )
  return retrieveTacticalSkills(tags, 5)
}

/** U7/B9: 构建当前势力前线附近的敌方威胁摘要（扫描友军2跳范围内的敌方单位） */
function buildNearbyEnemyThreats(world: WorldState, factionId: FactionId): NearbyEnemyThreat[] {
  const tilePosMap = new Map<string, { x: number; y: number }>()
  for (const tile of world.map.tiles) {
    tilePosMap.set(tile.id, { x: tile.x, y: tile.y })
  }

  const friendlyTileIds = new Set(
    world.units.filter((u) => u.faction === factionId).map((u) => u.tileId),
  )

  const threats: NearbyEnemyThreat[] = []
  for (const unit of world.units) {
    if (unit.faction === factionId) continue
    if (unit.strength <= 0) continue

    const uPos = tilePosMap.get(unit.tileId)
    if (!uPos) continue

    let nearestDist = Infinity
    for (const ftileId of friendlyTileIds) {
      const fPos = tilePosMap.get(ftileId)
      if (!fPos) continue
      const d = Math.abs(fPos.x - uPos.x) + Math.abs(fPos.y - uPos.y)
      if (d < nearestDist) nearestDist = d
    }

    if (nearestDist > 4) continue

    const threatLevel: 'high' | 'medium' | 'low' =
      unit.strength >= 80 ? 'high' : unit.strength >= 40 ? 'medium' : 'low'

    threats.push({
      factionId: unit.faction,
      unitName: unit.name ?? unit.id,
      strength: unit.strength,
      tileId: unit.tileId,
      threatLevel,
    })
  }

  // 按威胁等级排序，最多返回 5 条
  const order = { high: 0, medium: 1, low: 2 } as const
  threats.sort((a, b) => order[a.threatLevel] - order[b.threatLevel])
  return threats.slice(0, 5)
}

export function buildPveOpportunities(world: WorldState, factionId: FactionId): PveOpportunityEntry[] {
  if (!world.pveNodes || world.pveNodes.length === 0) return []

  // Build tileId → position lookup (O(n) once)
  const tilePosMap = new Map<string, { x: number; y: number }>()
  for (const tile of world.map.tiles) {
    tilePosMap.set(tile.id, { x: tile.x, y: tile.y })
  }

  const friendlyUnits = world.units.filter((u) => u.faction === factionId)
  const entries: PveOpportunityEntry[] = []

  for (const node of world.pveNodes) {
    if (node.cleared) continue

    const nodePos = tilePosMap.get(node.tileId)
    if (!nodePos) continue

    // Find nearest friendly unit by Manhattan distance
    let nearestUnitId: string | null = null
    let minDist = Infinity
    for (const unit of friendlyUnits) {
      const uPos = tilePosMap.get(unit.tileId)
      if (!uPos) continue
      const dist = Math.abs(uPos.x - nodePos.x) + Math.abs(uPos.y - nodePos.y)
      if (dist < minDist) {
        minDist = dist
        nearestUnitId = unit.id
      }
    }

    const distanceValue = nearestUnitId ? minDist : -1
    let recommended_action: PveOpportunityEntry['recommended_action']
    if (distanceValue === 0) {
      recommended_action = 'already_on_site'
    } else if (distanceValue > 0 && distanceValue <= 15) {
      recommended_action = 'send_unit'
    } else {
      recommended_action = 'too_far'
    }

    entries.push({
      nodeId: node.id,
      nodeName: node.name,
      district: node.district,
      tileId: node.tileId,
      guardStrength: node.guardStrength,
      rewardSummary: `${node.reward.food}粮+${node.reward.ap}AP`,
      nearestFriendlyUnitId: nearestUnitId,
      nearestUnitDistance: distanceValue,
      recommended_action,
    })
  }

  // Sort: already_on_site first, then nearest, drop too_far stragglers last
  return entries
    .sort((a, b) => {
      if (a.nearestUnitDistance < 0) return 1
      if (b.nearestUnitDistance < 0) return -1
      return a.nearestUnitDistance - b.nearestUnitDistance
    })
    .slice(0, MAX_PVE_OPPORTUNITIES)
}

const LUOYANG_SIEGE_REQUIRED = 3
const LUOYANG_HOLD_REQUIRED = 5

/**
 * 构建洛阳终局状态摘要：让 AI 感知己方/敌方围城进度，
 * 并给出"进攻/坚守/围城推进"推荐动作。
 */
export function buildVictoryContext(world: WorldState, factionId: FactionId): VictoryContextSnapshot {
  const luoyangTiles = world.map.tiles.filter(
    (t) =>
      t.landmarkName?.includes('洛阳') ||
      (t.x >= 155 && t.x <= 165 && t.y >= 150 && t.y <= 160 && t.type === 'city'),
  )

  let luoyangOwner = 'neutral'
  if (luoyangTiles.length > 0) {
    const owners = new Set(luoyangTiles.map((t) => t.owner ?? 'neutral'))
    luoyangOwner = owners.size === 1 ? (owners.values().next().value ?? 'neutral') : 'contested'
  }

  const ourHoldTicks = world.factions[factionId]?.luoyangHoldTicks ?? 0
  const ourSiegeTicks = world.luoyangSiegeProgress?.[factionId] ?? 0

  const enemyMaxSiegeTicks = Math.max(
    0,
    ...Object.entries(world.luoyangSiegeProgress ?? {})
      .filter(([k]) => k !== factionId)
      .map(([, v]) => v as number),
  )

  let recommended_action: VictoryContextSnapshot['recommended_action']
  if (luoyangOwner === factionId) {
    recommended_action = 'defend_luoyang'
  } else if (ourSiegeTicks > 0) {
    recommended_action = 'besiege_now'
  } else if (enemyMaxSiegeTicks >= LUOYANG_SIEGE_REQUIRED - 1) {
    // Enemy is one tick away from completing siege
    recommended_action = 'attack_luoyang'
  } else {
    recommended_action = 'hold_position'
  }

  return {
    luoyangOwner,
    ourHoldTicks,
    holdTicksRequired: LUOYANG_HOLD_REQUIRED,
    ourSiegeTicks,
    enemyMaxSiegeTicks,
    siegeTicksRequired: LUOYANG_SIEGE_REQUIRED,
    recommended_action,
  }
}
