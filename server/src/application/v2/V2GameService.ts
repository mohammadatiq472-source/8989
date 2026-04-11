/**
 * V2 Game Service — 管理 AIPlayerV2、Alliance、HumanPlayer 内存状态
 *
 * 负责：
 * - 招募武将（通过 recruitment.ts 逻辑）
 * - 升星分配
 * - 部队编组
 * - 同盟 CRUD
 * - 资源结算（由 advanceTick 调用）
 */

import { existsSync, readFileSync, renameSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type {
  AIPlayerV2,
  Alliance,
  Army,
  GeneralInstance,
  HumanPlayer,
  PlayerResources,
  RecruitPoolType,
  RecruitResult,
} from '../../../../shared/contracts/game'
import type { WorldState } from '../../../../shared/contracts/game/world'
import {
  performRecruit,
  validateStarUpgrade,
  performStarUpgrade,
  allocateStarAttributes,
  computeArmySlots,
  RECRUIT_COST,
} from '../../../../shared/domain/recruitment'
import {
  computeResourceIncome,
  computeResourceUpkeep,
  INITIAL_RESOURCES,
} from '../../../../shared/domain/resources'
import type { TileInfo } from '../../../../shared/domain/resources'

// ─── In-Memory Store ─────────────────────────────

const aiPlayers = new Map<string, AIPlayerV2>()
const alliances = new Map<string, Alliance>()
const humanPlayers = new Map<string, HumanPlayer>()
const V2_AUTO_PLAYER_PREFIX = 'v2_auto_'
const V2_GAME_STATE_PERSIST_PATH = process.env.V2_GAME_STATE_PATH?.trim() || join(process.cwd(), 'tmp', 'v2_game_state.json')
const V2_GAME_STATE_PERSIST_DEBOUNCE_MS = 1_500
const V2_GAME_STATE_PERSIST_VERSION = 2
const MAX_PERSIST_PLAYERS = 5000
const MAX_PERSIST_ALLIANCES = 500
const MAX_PERSIST_HUMAN_PLAYERS = 5000
const MAX_PERSIST_ARRAY_ITEMS = 5000

type PersistedPityCounters = Record<string, Record<string, number>>

type PersistedV2GameState = {
  version?: number
  savedAt?: string
  aiPlayers?: unknown
  alliances?: unknown
  humanPlayers?: unknown
  pityCounters?: unknown
}

let loaded = false
let persistDirty = false
let persistTimer: ReturnType<typeof setTimeout> | null = null
let persistInFlight: Promise<void> | null = null
let persistSuccessCount = 0
let persistFailureCount = 0
let lastPersistAt: number | null = null
let lastPersistErrorAt: number | null = null
let corruptQuarantineCount = 0
let lastCorruptQuarantineAt: number | null = null

export type V2WorldResourceSyncEntry = {
  factionId: string
  autoPlayerId: string
  world: PlayerResources
  v2: PlayerResources
  delta: PlayerResources
}

export type V2WorldAllianceSyncSnapshot = {
  worldCommanderCount: number
  worldDirectiveCount: number
  v2AllianceCount: number
  v2AllianceMemberCount: number
  leaderMissingCount: number
  orphanMemberCount: number
  orphanMemberIds: string[]
}

export type V2WorldSyncSnapshot = {
  tick: number
  worldVersion: number
  resources: {
    factionCount: number
    autoPlayerCount: number
    entries: V2WorldResourceSyncEntry[]
    mismatchCount: number
    missingAutoPlayerFactionIds: string[]
    totalWorld: PlayerResources
    totalV2: PlayerResources
    totalDelta: PlayerResources
  }
  alliances: V2WorldAllianceSyncSnapshot
}

export type V2GameStateSnapshot = {
  aiPlayers: AIPlayerV2[]
  alliances: Alliance[]
  humanPlayers: HumanPlayer[]
  sync?: V2WorldSyncSnapshot
}

/** 每个 AI 玩家的招募保底计数器: Map<aiPlayerId, Map<poolType, pityCounter>> */
const pityCounters = new Map<string, Map<string, number>>()
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function asFiniteNumber(value: unknown): number | null {
  const next = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(next)) {
    return null
  }
  return next
}

function quarantineCorruptStoreFile() {
  try {
    if (!existsSync(V2_GAME_STATE_PERSIST_PATH)) {
      return
    }

    const quarantinedPath = `${V2_GAME_STATE_PERSIST_PATH}.corrupt.${Date.now()}`
    renameSync(V2_GAME_STATE_PERSIST_PATH, quarantinedPath)
    corruptQuarantineCount += 1
    lastCorruptQuarantineAt = Date.now()
    console.warn(`[V2GameService] quarantined corrupt store file: ${quarantinedPath}`)
  } catch {
    // keep non-fatal behavior; continue with in-memory defaults
  }
}

function resolvePersistedState(input: unknown): PersistedV2GameState {
  if (!input || typeof input !== 'object') {
    return {}
  }

  return input as PersistedV2GameState
}

function sanitizeString(input: unknown, maxLength = 120): string | null {
  if (typeof input !== 'string') {
    return null
  }
  const normalized = input.trim()
  if (!normalized) {
    return null
  }
  return normalized.slice(0, maxLength)
}

function sanitizeStringArray(input: unknown, maxItems = MAX_PERSIST_ARRAY_ITEMS, maxLength = 120): string[] {
  if (!Array.isArray(input)) {
    return []
  }

  const items: string[] = []
  for (const value of input) {
    const normalized = sanitizeString(value, maxLength)
    if (!normalized) {
      continue
    }
    items.push(normalized)
    if (items.length >= maxItems) {
      break
    }
  }

  return items
}

function sanitizeResources(input: unknown): PlayerResources {
  if (!isRecord(input)) {
    return { ...INITIAL_RESOURCES }
  }

  return {
    food: Math.max(0, asFiniteNumber(input.food) ?? INITIAL_RESOURCES.food),
    wood: Math.max(0, asFiniteNumber(input.wood) ?? INITIAL_RESOURCES.wood),
    stone: Math.max(0, asFiniteNumber(input.stone) ?? INITIAL_RESOURCES.stone),
    iron: Math.max(0, asFiniteNumber(input.iron) ?? INITIAL_RESOURCES.iron),
  }
}

function sanitizeGeneralInstance(input: unknown): GeneralInstance | null {
  if (!isRecord(input)) {
    return null
  }

  const id = sanitizeString(input.id, 128)
  const templateId = sanitizeString(input.templateId, 128)
  const ownerId = sanitizeString(input.ownerId, 128)
  const quality = sanitizeString(input.quality, 32)
  if (!id || !templateId || !ownerId || !quality) {
    return null
  }

  const assignedArmyId = sanitizeString(input.assignedArmyId, 128) ?? undefined
  const assignedRoleRaw = sanitizeString(input.assignedRole, 16)
  const assignedRole =
    assignedRoleRaw === 'main' || assignedRoleRaw === 'vice'
      ? (assignedRoleRaw as GeneralInstance['assignedRole'])
      : undefined

  return {
    id,
    templateId,
    ownerId,
    quality: quality as unknown as GeneralInstance['quality'],
    redStars: Math.max(0, Math.floor(asFiniteNumber(input.redStars) ?? 0)),
    level: Math.max(1, Math.floor(asFiniteNumber(input.level) ?? 1)),
    bonusForce: Math.floor(asFiniteNumber(input.bonusForce) ?? 0),
    bonusCommand: Math.floor(asFiniteNumber(input.bonusCommand) ?? 0),
    bonusIntelligence: Math.floor(asFiniteNumber(input.bonusIntelligence) ?? 0),
    bonusCharisma: Math.floor(asFiniteNumber(input.bonusCharisma) ?? 0),
    bonusSpeed: Math.floor(asFiniteNumber(input.bonusSpeed) ?? 0),
    assignedArmyId,
    assignedRole,
  }
}

function sanitizeArmy(input: unknown): Army | null {
  if (!isRecord(input)) {
    return null
  }

  const id = sanitizeString(input.id, 128)
  const aiPlayerId = sanitizeString(input.aiPlayerId, 128)
  const tileId = sanitizeString(input.tileId, 128)
  if (!id || !aiPlayerId || !tileId) {
    return null
  }

  return {
    id,
    aiPlayerId,
    mainGeneralId: sanitizeString(input.mainGeneralId, 128) ?? undefined,
    viceGeneralIds: sanitizeStringArray(input.viceGeneralIds, 2, 128),
    troopCount: Math.max(0, Math.floor(asFiniteNumber(input.troopCount) ?? 0)),
    maxTroopCount: Math.max(0, Math.floor(asFiniteNumber(input.maxTroopCount) ?? 0)),
    tileId,
    status: (sanitizeString(input.status, 32) ?? '待命') as Army['status'],
    currentTask: sanitizeString(input.currentTask, 256) ?? undefined,
  }
}

function sanitizeSpecialty(input: unknown): AIPlayerV2['specialty'] {
  const normalized = sanitizeString(input, 24)
  if (!normalized) {
    return 'expansion'
  }

  if (
    normalized === 'assault' ||
    normalized === 'recon' ||
    normalized === 'guard' ||
    normalized === 'logistics' ||
    normalized === 'expansion'
  ) {
    return normalized
  }

  return 'expansion'
}

function sanitizeAIPlayer(input: unknown): AIPlayerV2 | null {
  if (!isRecord(input)) {
    return null
  }

  const id = sanitizeString(input.id, 128)
  const name = sanitizeString(input.name, 128)
  const ownerId = sanitizeString(input.ownerId, 128)
  const factionId = sanitizeString(input.factionId, 64)
  if (!id || !name || !ownerId || !factionId) {
    return null
  }

  const armies = Array.isArray(input.armies)
    ? input.armies.map((item) => sanitizeArmy(item)).filter((item): item is Army => item !== null)
    : []
  const generals = Array.isArray(input.generals)
    ? input.generals.map((item) => sanitizeGeneralInstance(item)).filter((item): item is GeneralInstance => item !== null)
    : []

  return {
    id,
    name,
    ownerId,
    factionId,
    specialty: sanitizeSpecialty(input.specialty),
    armySlots: Math.max(1, Math.floor(asFiniteNumber(input.armySlots) ?? 1)),
    armies,
    generals,
    resources: sanitizeResources(input.resources),
    capturedTiles: sanitizeStringArray(input.capturedTiles, MAX_PERSIST_ARRAY_ITEMS, 128),
    capturedCities: sanitizeStringArray(input.capturedCities, MAX_PERSIST_ARRAY_ITEMS, 128),
  }
}

function sanitizeAlliance(input: unknown): Alliance | null {
  if (!isRecord(input)) {
    return null
  }

  const id = sanitizeString(input.id, 128)
  const name = sanitizeString(input.name, 128)
  const leaderId = sanitizeString(input.leaderId, 128)
  if (!id || !name || !leaderId) {
    return null
  }

  const memberIds = sanitizeStringArray(input.memberIds, MAX_PERSIST_ARRAY_ITEMS, 128)
  if (!memberIds.includes(leaderId)) {
    memberIds.unshift(leaderId)
  }

  const memberSet = new Set(memberIds)
  const officerIds = sanitizeStringArray(input.officerIds, MAX_PERSIST_ARRAY_ITEMS, 128).filter((id) => memberSet.has(id))

  return {
    id,
    name,
    leaderId,
    officerIds,
    memberIds,
    maxMembers: Math.max(1, Math.floor(asFiniteNumber(input.maxMembers) ?? 100)),
    doctrine: sanitizeString(input.doctrine, 2000) ?? undefined,
    createdAt: Math.max(0, Math.floor(asFiniteNumber(input.createdAt) ?? Date.now())),
  }
}

function sanitizeHumanPlayer(input: unknown): HumanPlayer | null {
  if (!isRecord(input)) {
    return null
  }

  const id = sanitizeString(input.id, 128)
  const username = sanitizeString(input.username, 128)
  if (!id || !username) {
    return null
  }

  const roleRaw = sanitizeString(input.allianceRole, 16)
  const allianceRole =
    roleRaw === 'leader' || roleRaw === 'officer' || roleRaw === 'member'
      ? (roleRaw as HumanPlayer['allianceRole'])
      : undefined

  return {
    id,
    username,
    email: sanitizeString(input.email, 160) ?? undefined,
    allianceId: sanitizeString(input.allianceId, 128) ?? undefined,
    allianceRole,
    aiPlayerIds: sanitizeStringArray(input.aiPlayerIds, MAX_PERSIST_ARRAY_ITEMS, 128),
    createdAt: Math.max(0, Math.floor(asFiniteNumber(input.createdAt) ?? Date.now())),
  }
}

function stringArrayEquals(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) {
      return false
    }
  }
  return true
}

function resourcesEqual(left: PlayerResources, right: PlayerResources): boolean {
  return left.food === right.food && left.wood === right.wood && left.stone === right.stone && left.iron === right.iron
}

function ensureLoaded() {
  if (loaded) {
    return
  }

  loaded = true
  aiPlayers.clear()
  alliances.clear()
  humanPlayers.clear()
  pityCounters.clear()

  try {
    if (!existsSync(V2_GAME_STATE_PERSIST_PATH)) {
      return
    }

    const raw = readFileSync(V2_GAME_STATE_PERSIST_PATH, 'utf8')
    const parsed = resolvePersistedState(JSON.parse(raw) as unknown)
    hydrateAiPlayers(parsed.aiPlayers)
    hydrateAlliances(parsed.alliances)
    hydrateHumanPlayers(parsed.humanPlayers)
    hydratePityCounters(parsed.pityCounters)
  } catch {
    aiPlayers.clear()
    alliances.clear()
    humanPlayers.clear()
    pityCounters.clear()
    quarantineCorruptStoreFile()
  }
}

function hydrateAiPlayers(source: unknown) {
  if (!Array.isArray(source)) {
    return
  }

  for (const item of source) {
    if (!isRecord(item)) {
      continue
    }
    const next = sanitizeAIPlayer(item)
    if (!next) {
      continue
    }
    aiPlayers.set(next.id, next)
    if (aiPlayers.size >= MAX_PERSIST_PLAYERS) {
      break
    }
  }
}

function hydrateAlliances(source: unknown) {
  if (!Array.isArray(source)) {
    return
  }

  for (const item of source) {
    if (!isRecord(item)) {
      continue
    }
    const next = sanitizeAlliance(item)
    if (!next) {
      continue
    }
    alliances.set(next.id, next)
    if (alliances.size >= MAX_PERSIST_ALLIANCES) {
      break
    }
  }
}

function hydrateHumanPlayers(source: unknown) {
  if (!Array.isArray(source)) {
    return
  }

  for (const item of source) {
    if (!isRecord(item)) {
      continue
    }
    const next = sanitizeHumanPlayer(item)
    if (!next) {
      continue
    }
    humanPlayers.set(next.id, next)
    if (humanPlayers.size >= MAX_PERSIST_HUMAN_PLAYERS) {
      break
    }
  }
}

function hydratePityCounters(source: unknown) {
  if (!isRecord(source)) {
    return
  }

  for (const [playerId, rawPools] of Object.entries(source)) {
    if (!playerId.trim() || !isRecord(rawPools)) {
      continue
    }

    const poolMap = new Map<string, number>()
    for (const [poolType, rawCount] of Object.entries(rawPools)) {
      const count = asFiniteNumber(rawCount)
      if (!poolType || count === null) {
        continue
      }
      poolMap.set(poolType, Math.max(0, Math.floor(count)))
    }

    if (poolMap.size > 0) {
      pityCounters.set(playerId, poolMap)
    }
  }
}

function buildPersistedPityCounters(): PersistedPityCounters {
  const next: PersistedPityCounters = {}

  for (const [playerId, pools] of pityCounters.entries()) {
    const row: Record<string, number> = {}
    for (const [poolType, count] of pools.entries()) {
      row[poolType] = count
    }
    next[playerId] = row
  }

  return next
}

function buildPersistedSnapshot(): PersistedV2GameState {
  return {
    version: V2_GAME_STATE_PERSIST_VERSION,
    savedAt: new Date().toISOString(),
    aiPlayers: Array.from(aiPlayers.values(), (item) => structuredClone(item)),
    alliances: Array.from(alliances.values(), (item) => structuredClone(item)),
    humanPlayers: Array.from(humanPlayers.values(), (item) => structuredClone(item)),
    pityCounters: buildPersistedPityCounters(),
  }
}

function schedulePersist() {
  persistDirty = true
  if (persistTimer) {
    return
  }

  persistTimer = setTimeout(() => {
    persistTimer = null
    void drainPersistQueue()
  }, V2_GAME_STATE_PERSIST_DEBOUNCE_MS)
}

async function drainPersistQueue(): Promise<void> {
  if (persistInFlight) {
    await persistInFlight
    return
  }

  if (!persistDirty) {
    return
  }

  persistInFlight = (async () => {
    try {
      while (persistDirty) {
        persistDirty = false
        const payload = JSON.stringify(buildPersistedSnapshot(), null, 2)
        const tmpPath = `${V2_GAME_STATE_PERSIST_PATH}.tmp`
        await mkdir(dirname(V2_GAME_STATE_PERSIST_PATH), { recursive: true })
        await writeFile(tmpPath, payload, 'utf8')
        await rename(tmpPath, V2_GAME_STATE_PERSIST_PATH)
        persistSuccessCount += 1
        lastPersistAt = Date.now()
      }
    } catch {
      persistDirty = true
      persistFailureCount += 1
      lastPersistErrorAt = Date.now()
    } finally {
      persistInFlight = null
      if (persistDirty) {
        schedulePersist()
      }
    }
  })()

  await persistInFlight
}

export async function flushV2GamePersist(): Promise<void> {
  ensureLoaded()

  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }

  if (!persistDirty) {
    if (persistInFlight) {
      await persistInFlight
    }
    return
  }

  await drainPersistQueue()
}

// ─── AI Player CRUD ─────────────────────────────

export function getV2GamePersistHealth() {
  return {
    path: V2_GAME_STATE_PERSIST_PATH,
    loaded,
    aiPlayerCount: aiPlayers.size,
    allianceCount: alliances.size,
    humanPlayerCount: humanPlayers.size,
    persistDirty,
    persistInFlight: Boolean(persistInFlight),
    persistSuccessCount,
    persistFailureCount,
    lastPersistAt,
    lastPersistErrorAt,
    corruptQuarantineCount,
    lastCorruptQuarantineAt,
    persistVersion: V2_GAME_STATE_PERSIST_VERSION,
  }
}

export function getAIPlayer(id: string): AIPlayerV2 | undefined {
  ensureLoaded()
  return aiPlayers.get(id)
}

export function getAllAIPlayers(): AIPlayerV2[] {
  ensureLoaded()
  return [...aiPlayers.values()]
}

export function getAIPlayersByFaction(factionId: string): AIPlayerV2[] {
  ensureLoaded()
  return [...aiPlayers.values()].filter(p => p.factionId === factionId)
}

export function createAIPlayer(
  id: string,
  name: string,
  ownerId: string,
  factionId: string,
  specialty: AIPlayerV2['specialty'] = 'expansion',
): AIPlayerV2 {
  ensureLoaded()
  const player: AIPlayerV2 = {
    id,
    name,
    ownerId,
    factionId,
    specialty,
    armySlots: 1,
    armies: [],
    generals: [],
    resources: { ...INITIAL_RESOURCES },
    capturedTiles: [],
    capturedCities: [],
  }
  aiPlayers.set(id, player)
  schedulePersist()
  return player
}

function createZeroResources(): PlayerResources {
  return { food: 0, wood: 0, stone: 0, iron: 0 }
}

function createPlayerResources(food: number, wood: number, stone: number, iron: number): PlayerResources {
  return { food, wood, stone, iron }
}

function cloneResources(resources: PlayerResources): PlayerResources {
  return {
    food: resources.food,
    wood: resources.wood,
    stone: resources.stone,
    iron: resources.iron,
  }
}

function buildFactionResourcesFromWorld(world: WorldState, factionId: string): PlayerResources {
  const faction = world.factions[factionId]
  if (!faction) {
    return createZeroResources()
  }

  return createPlayerResources(
    Math.max(0, faction.food),
    Math.max(0, faction.wood ?? 0),
    Math.max(0, faction.stone ?? 0),
    Math.max(0, faction.iron ?? 0),
  )
}

function addResources(target: PlayerResources, source: PlayerResources) {
  target.food += source.food
  target.wood += source.wood
  target.stone += source.stone
  target.iron += source.iron
}

function subtractResources(left: PlayerResources, right: PlayerResources): PlayerResources {
  return createPlayerResources(
    left.food - right.food,
    left.wood - right.wood,
    left.stone - right.stone,
    left.iron - right.iron,
  )
}

function resolveAutoPlayerId(factionId: string): string {
  return `${V2_AUTO_PLAYER_PREFIX}${factionId}`
}

function resolveFactionIds(world: WorldState): string[] {
  return Object.keys(world.factions).filter((id) => id !== 'neutral')
}

function ensureAutoPlayerForFaction(factionId: string): AIPlayerV2 {
  const autoPlayerId = resolveAutoPlayerId(factionId)
  const existing = aiPlayers.get(autoPlayerId)
  if (existing) {
    return existing
  }

  return createAIPlayer(
    autoPlayerId,
    `${factionId.toUpperCase()} Auto Commander`,
    `system:${factionId}`,
    factionId,
    'expansion',
  )
}

export function syncV2StateWithWorld(world: WorldState): { autoPlayers: number; syncedFactions: number } {
  ensureLoaded()
  const factionIds = resolveFactionIds(world)
  let autoPlayers = 0
  let changed = false

  for (const factionId of factionIds) {
    const autoPlayerId = resolveAutoPlayerId(factionId)
    const existed = aiPlayers.has(autoPlayerId)
    const player = ensureAutoPlayerForFaction(factionId)
    autoPlayers += 1
    if (!existed) {
      changed = true
    }

    const factionResources = buildFactionResourcesFromWorld(world, factionId)
    if (!resourcesEqual(player.resources, factionResources)) {
      player.resources = factionResources
      changed = true
    }

    const capturedTiles = world.map.tiles.filter((tile) => tile.owner === factionId).map((tile) => tile.id)
    const capturedCities = world.map.tiles
      .filter((tile) => tile.owner === factionId && tile.type === 'city')
      .map((tile) => tile.id)

    if (!stringArrayEquals(player.capturedTiles, capturedTiles)) {
      player.capturedTiles = capturedTiles
      changed = true
    }

    if (!stringArrayEquals(player.capturedCities, capturedCities)) {
      player.capturedCities = capturedCities
      changed = true
    }

    const nextArmySlots = computeArmySlots(capturedCities.length)
    if (player.armySlots !== nextArmySlots) {
      player.armySlots = nextArmySlots
      changed = true
    }
  }

  if (changed) {
    schedulePersist()
  }

  return {
    autoPlayers,
    syncedFactions: factionIds.length,
  }
}

export function syncWorldFactionResourcesFromV2(world: WorldState): void {
  ensureLoaded()
  for (const factionId of resolveFactionIds(world)) {
    const faction = world.factions[factionId]
    if (!faction) {
      continue
    }

    const autoPlayer = aiPlayers.get(resolveAutoPlayerId(factionId))
    if (!autoPlayer) {
      continue
    }

    faction.food = Math.max(0, Math.round(autoPlayer.resources.food))
    faction.wood = Math.max(0, Math.round(autoPlayer.resources.wood))
    faction.stone = Math.max(0, Math.round(autoPlayer.resources.stone))
    faction.iron = Math.max(0, Math.round(autoPlayer.resources.iron))
  }
}

// ─── 招募 ─────────────────────────────

export type RecruitOutcome = {
  results: RecruitResult[]
  newGenerals: GeneralInstance[]
  costDeducted: PlayerResources
}

export function recruitForPlayer(
  aiPlayerId: string,
  poolType: RecruitPoolType,
  count: number,
): RecruitOutcome {
  ensureLoaded()
  const player = aiPlayers.get(aiPlayerId)
  if (!player) throw new Error(`AI player ${aiPlayerId} not found`)

  // 获取或初始化保底计数器
  if (!pityCounters.has(aiPlayerId)) {
    pityCounters.set(aiPlayerId, new Map())
  }
  const playerPity = pityCounters.get(aiPlayerId)!
  let pityCounter = playerPity.get(poolType) ?? 0

  const results: RecruitResult[] = []
  const newGenerals: GeneralInstance[] = []
  const totalCost: PlayerResources = { food: 0, wood: 0, stone: 0, iron: 0 }

  for (let i = 0; i < count; i++) {
    const recruited = performRecruit(poolType, aiPlayerId, player.generals, pityCounter)
    pityCounter = recruited.newPityCount
    results.push(recruited.result)

    // performRecruit 已创建 GeneralInstance
    player.generals.push(recruited.instance)
    newGenerals.push(recruited.instance)

    // 扣资源
    const cost = RECRUIT_COST[poolType]
    totalCost.food += cost.food
    totalCost.iron += cost.iron
  }

  // 更新保底计数
  playerPity.set(poolType, pityCounter)

  // 扣减资源
  player.resources.food -= totalCost.food
  player.resources.iron -= totalCost.iron

  schedulePersist()
  return { results, newGenerals, costDeducted: totalCost }
}

// ─── 升星 ─────────────────────────────

export function starUpgradeForPlayer(
  aiPlayerId: string,
  targetInstanceId: string,
  sacrificeInstanceIds: string[],
): { success: boolean; error?: string; updatedGeneral?: GeneralInstance } {
  ensureLoaded()
  const player = aiPlayers.get(aiPlayerId)
  if (!player) return { success: false, error: `AI player ${aiPlayerId} not found` }

  const target = player.generals.find((g: GeneralInstance) => g.id === targetInstanceId)
  if (!target) return { success: false, error: `General ${targetInstanceId} not found` }

  const sacrifices = sacrificeInstanceIds
    .map((id: string) => player.generals.find((g: GeneralInstance) => g.id === id))
    .filter((g): g is GeneralInstance => g !== undefined)

  if (sacrifices.length !== sacrificeInstanceIds.length) {
    return { success: false, error: 'Some sacrifice generals not found' }
  }

  const validation = validateStarUpgrade(target, sacrifices)

  if (validation !== null) {
    return { success: false, error: validation }
  }

  const result = performStarUpgrade(
    { targetInstanceId, sacrificeInstanceIds },
    player.generals,
  )

  // 用升级后的武将替换原武将
  const idx = player.generals.findIndex((g: GeneralInstance) => g.id === targetInstanceId)
  if (idx >= 0) player.generals[idx] = result.upgraded

  // 移除被消耗的武将
  player.generals = player.generals.filter((g: GeneralInstance) => !result.consumedIds.includes(g.id))

  schedulePersist()
  return { success: true, updatedGeneral: result.upgraded }
}

// ─── 属性分配 ─────────────────────────────

export function allocateAttributesForPlayer(
  aiPlayerId: string,
  instanceId: string,
  allocation: { force: number; command: number; intelligence: number; charisma: number; speed: number },
): { success: boolean; error?: string; updatedGeneral?: GeneralInstance } {
  ensureLoaded()
  const player = aiPlayers.get(aiPlayerId)
  if (!player) return { success: false, error: `AI player ${aiPlayerId} not found` }

  const general = player.generals.find((g: GeneralInstance) => g.id === instanceId)
  if (!general) return { success: false, error: `General ${instanceId} not found` }

  try {
    const updated = allocateStarAttributes(
      { instanceId, ...allocation },
      player.generals,
    )
    // 替换 generals 数组中对应元素
    const idx = player.generals.findIndex((g: GeneralInstance) => g.id === instanceId)
    if (idx >= 0) player.generals[idx] = updated

    schedulePersist()
    return { success: true, updatedGeneral: updated }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Allocation failed' }
  }
}

// ─── 部队编组 ─────────────────────────────

export function composeArmy(
  aiPlayerId: string,
  armyId: string,
  mainGeneralId?: string,
  viceGeneralIds: string[] = [],
): { success: boolean; error?: string; army?: Army } {
  ensureLoaded()
  const player = aiPlayers.get(aiPlayerId)
  if (!player) return { success: false, error: `AI player ${aiPlayerId} not found` }

  const army = player.armies.find((a: Army) => a.id === armyId)
  if (!army) return { success: false, error: `Army ${armyId} not found` }

  // 验证主将
  if (mainGeneralId) {
    const mainGen = player.generals.find((g: GeneralInstance) => g.id === mainGeneralId)
    if (!mainGen) return { success: false, error: `Main general ${mainGeneralId} not found` }
    if (mainGen.assignedArmyId && mainGen.assignedArmyId !== armyId) {
      return { success: false, error: `General ${mainGeneralId} already assigned to army ${mainGen.assignedArmyId}` }
    }
  }

  // 验证副将
  for (const vid of viceGeneralIds) {
    const viceGen = player.generals.find((g: GeneralInstance) => g.id === vid)
    if (!viceGen) return { success: false, error: `Vice general ${vid} not found` }
    if (viceGen.assignedArmyId && viceGen.assignedArmyId !== armyId) {
      return { success: false, error: `General ${vid} already assigned to army ${viceGen.assignedArmyId}` }
    }
  }

  // 解除旧编组
  for (const g of player.generals) {
    if (g.assignedArmyId === armyId) {
      g.assignedArmyId = undefined
      g.assignedRole = undefined
    }
  }

  // 设置新编组
  if (mainGeneralId) {
    const mainGen = player.generals.find((g: GeneralInstance) => g.id === mainGeneralId)!
    mainGen.assignedArmyId = armyId
    mainGen.assignedRole = 'main'
    army.mainGeneralId = mainGeneralId
  } else {
    army.mainGeneralId = undefined
  }

  army.viceGeneralIds = []
  for (const vid of viceGeneralIds) {
    const viceGen = player.generals.find((g: GeneralInstance) => g.id === vid)!
    viceGen.assignedArmyId = armyId
    viceGen.assignedRole = 'vice'
    army.viceGeneralIds.push(vid)
  }

  schedulePersist()
  return { success: true, army }
}

/** 为 AI 玩家创建新部队（解锁槽位时调用） */
export function createArmyForPlayer(
  aiPlayerId: string,
  tileId: string,
): { success: boolean; error?: string; army?: Army } {
  ensureLoaded()
  const player = aiPlayers.get(aiPlayerId)
  if (!player) return { success: false, error: `AI player ${aiPlayerId} not found` }

  const maxSlots = computeArmySlots(player.capturedCities.length)
  if (player.armies.length >= maxSlots) {
    return { success: false, error: `Army slots full (${player.armies.length}/${maxSlots})` }
  }

  const army: Army = {
    id: `army_${aiPlayerId}_${Date.now()}`,
    aiPlayerId,
    mainGeneralId: undefined,
    viceGeneralIds: [],
    troopCount: 500,
    maxTroopCount: 2000,
    tileId,
    status: '待命',
  }
  player.armies.push(army)

  player.armySlots = maxSlots
  schedulePersist()
  return { success: true, army }
}

// ─── 资源结算（由 advanceTick 调用） ─────────────────────────────

export function settleResourcesForAllPlayers(
  tileTypeResolver: (tileId: string) => TileInfo | undefined,
): void {
  ensureLoaded()
  if (aiPlayers.size === 0) {
    return
  }

  for (const player of aiPlayers.values()) {
    // 收集占领地块信息
    const tiles: TileInfo[] = []
    for (const tileId of player.capturedTiles) {
      const info = tileTypeResolver(tileId)
      if (info) tiles.push(info)
    }

    // 产出
    const income = computeResourceIncome(tiles)
    const marchingCount = player.armies.filter((a: Army) => a.status === '行军中').length
    const upkeep = computeResourceUpkeep(player.armies.length, marchingCount, player.capturedTiles.length)

    // 净值
    player.resources.food += income.food - upkeep.food
    player.resources.wood += income.wood - upkeep.wood
    player.resources.stone += income.stone - upkeep.stone
    player.resources.iron += income.iron - upkeep.iron

    // 资源不能为负（粮草不足时部队士气降低等机制留给后续）
    player.resources.food = Math.max(0, player.resources.food)
    player.resources.wood = Math.max(0, player.resources.wood)
    player.resources.stone = Math.max(0, player.resources.stone)
    player.resources.iron = Math.max(0, player.resources.iron)

    // 更新部队槽位
    player.armySlots = computeArmySlots(player.capturedCities.length)
  }

  schedulePersist()
}

// ─── 同盟 CRUD ─────────────────────────────

export function createAlliance(
  name: string,
  leaderId: string,
  doctrine?: string,
): Alliance {
  ensureLoaded()
  const id = `alliance_${Date.now()}`
  const alliance: Alliance = {
    id,
    name,
    leaderId,
    officerIds: [],
    memberIds: [leaderId],
    maxMembers: 100,
    doctrine,
    createdAt: Date.now(),
  }
  alliances.set(id, alliance)

  // 更新玩家的同盟信息
  const player = humanPlayers.get(leaderId)
  if (player) {
    player.allianceId = id
    player.allianceRole = 'leader'
  }

  schedulePersist()
  return alliance
}

export function getAlliance(id: string): Alliance | undefined {
  ensureLoaded()
  return alliances.get(id)
}

export function getAllAlliances(): Alliance[] {
  ensureLoaded()
  return [...alliances.values()]
}

export function joinAlliance(
  allianceId: string,
  playerId: string,
): { success: boolean; error?: string } {
  ensureLoaded()
  const alliance = alliances.get(allianceId)
  if (!alliance) return { success: false, error: 'Alliance not found' }

  if (alliance.memberIds.length >= alliance.maxMembers) {
    return { success: false, error: `Alliance is full (${alliance.maxMembers} max)` }
  }

  if (alliance.memberIds.includes(playerId)) {
    return { success: false, error: 'Already a member' }
  }

  alliance.memberIds.push(playerId)

  const player = humanPlayers.get(playerId)
  if (player) {
    player.allianceId = allianceId
    player.allianceRole = 'member'
  }

  schedulePersist()
  return { success: true }
}

export function changeAllianceRole(
  allianceId: string,
  targetPlayerId: string,
  newRole: 'officer' | 'member',
): { success: boolean; error?: string } {
  ensureLoaded()
  const alliance = alliances.get(allianceId)
  if (!alliance) return { success: false, error: 'Alliance not found' }

  if (!alliance.memberIds.includes(targetPlayerId)) {
    return { success: false, error: 'Player not in this alliance' }
  }

  if (targetPlayerId === alliance.leaderId) {
    return { success: false, error: 'Cannot change leader role directly' }
  }

  // 更新 officer 列表
  if (newRole === 'officer' && !alliance.officerIds.includes(targetPlayerId)) {
    alliance.officerIds.push(targetPlayerId)
  } else if (newRole === 'member') {
    alliance.officerIds = alliance.officerIds.filter((id: string) => id !== targetPlayerId)
  }

  const player = humanPlayers.get(targetPlayerId)
  if (player) {
    player.allianceRole = newRole
  }

  schedulePersist()
  return { success: true }
}

// ─── HumanPlayer ─────────────────────────────

export function getHumanPlayer(id: string): HumanPlayer | undefined {
  ensureLoaded()
  return humanPlayers.get(id)
}

export function createHumanPlayer(id: string, username: string, email?: string): HumanPlayer {
  ensureLoaded()
  const player: HumanPlayer = {
    id,
    username,
    aiPlayerIds: [],
    createdAt: Date.now(),
    email,
  }
  humanPlayers.set(id, player)
  schedulePersist()
  return player
}

// ─── 状态快照（用于 API 响应） ─────────────────────────────

export function buildV2WorldSyncSnapshot(world: WorldState): V2WorldSyncSnapshot {
  ensureLoaded()
  const factionIds = resolveFactionIds(world)
  const totalWorld = createZeroResources()
  const totalV2 = createZeroResources()
  const entries: V2WorldResourceSyncEntry[] = []
  const missingAutoPlayerFactionIds: string[] = []
  let mismatchCount = 0

  for (const factionId of factionIds) {
    const autoPlayerId = resolveAutoPlayerId(factionId)
    const worldResources = buildFactionResourcesFromWorld(world, factionId)
    const autoPlayer = aiPlayers.get(autoPlayerId)
    if (!autoPlayer) {
      missingAutoPlayerFactionIds.push(factionId)
      addResources(totalWorld, worldResources)
      continue
    }

    const v2Resources = cloneResources(autoPlayer.resources)
    const delta = subtractResources(v2Resources, worldResources)
    const hasMismatch =
      delta.food !== 0 ||
      delta.wood !== 0 ||
      delta.stone !== 0 ||
      delta.iron !== 0

    if (hasMismatch) {
      mismatchCount += 1
    }

    entries.push({
      factionId,
      autoPlayerId,
      world: worldResources,
      v2: v2Resources,
      delta,
    })

    addResources(totalWorld, worldResources)
    addResources(totalV2, v2Resources)
  }

  const allianceList = [...alliances.values()]
  const orphanMemberIds: string[] = []
  let leaderMissingCount = 0
  let v2AllianceMemberCount = 0

  for (const alliance of allianceList) {
    v2AllianceMemberCount += alliance.memberIds.length
    if (!humanPlayers.has(alliance.leaderId)) {
      leaderMissingCount += 1
    }
    for (const memberId of alliance.memberIds) {
      if (!humanPlayers.has(memberId)) {
        orphanMemberIds.push(memberId)
      }
    }
  }

  return {
    tick: world.tick,
    worldVersion: world.worldVersion,
    resources: {
      factionCount: factionIds.length,
      autoPlayerCount: factionIds.length - missingAutoPlayerFactionIds.length,
      entries,
      mismatchCount,
      missingAutoPlayerFactionIds,
      totalWorld,
      totalV2,
      totalDelta: subtractResources(totalV2, totalWorld),
    },
    alliances: {
      worldCommanderCount: world.alliance.commanders.length,
      worldDirectiveCount: Object.keys(world.alliance.directives).length,
      v2AllianceCount: allianceList.length,
      v2AllianceMemberCount,
      leaderMissingCount,
      orphanMemberCount: orphanMemberIds.length,
      orphanMemberIds,
    },
  }
}

export function getV2GameState(world?: WorldState): V2GameStateSnapshot {
  ensureLoaded()
  const state: V2GameStateSnapshot = {
    aiPlayers: [...aiPlayers.values()],
    alliances: [...alliances.values()],
    humanPlayers: [...humanPlayers.values()],
  }

  if (world) {
    state.sync = buildV2WorldSyncSnapshot(world)
  }

  return state
}
