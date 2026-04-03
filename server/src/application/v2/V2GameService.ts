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

/** 每个 AI 玩家的招募保底计数器: Map<aiPlayerId, Map<poolType, pityCounter>> */
const pityCounters = new Map<string, Map<string, number>>()

// ─── AI Player CRUD ─────────────────────────────

export function getAIPlayer(id: string): AIPlayerV2 | undefined {
  return aiPlayers.get(id)
}

export function getAllAIPlayers(): AIPlayerV2[] {
  return [...aiPlayers.values()]
}

export function getAIPlayersByFaction(factionId: string): AIPlayerV2[] {
  return [...aiPlayers.values()].filter(p => p.factionId === factionId)
}

export function createAIPlayer(
  id: string,
  name: string,
  ownerId: string,
  factionId: string,
  specialty: AIPlayerV2['specialty'] = 'expansion',
): AIPlayerV2 {
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
  return player
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

  return { results, newGenerals, costDeducted: totalCost }
}

// ─── 升星 ─────────────────────────────

export function starUpgradeForPlayer(
  aiPlayerId: string,
  targetInstanceId: string,
  sacrificeInstanceIds: string[],
): { success: boolean; error?: string; updatedGeneral?: GeneralInstance } {
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

  return { success: true, updatedGeneral: result.upgraded }
}

// ─── 属性分配 ─────────────────────────────

export function allocateAttributesForPlayer(
  aiPlayerId: string,
  instanceId: string,
  allocation: { force: number; command: number; intelligence: number; charisma: number; speed: number },
): { success: boolean; error?: string; updatedGeneral?: GeneralInstance } {
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

  return { success: true, army }
}

/** 为 AI 玩家创建新部队（解锁槽位时调用） */
export function createArmyForPlayer(
  aiPlayerId: string,
  tileId: string,
): { success: boolean; error?: string; army?: Army } {
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
  return { success: true, army }
}

// ─── 资源结算（由 advanceTick 调用） ─────────────────────────────

export function settleResourcesForAllPlayers(
  tileTypeResolver: (tileId: string) => TileInfo | undefined,
): void {
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
}

// ─── 同盟 CRUD ─────────────────────────────

export function createAlliance(
  name: string,
  leaderId: string,
  doctrine?: string,
): Alliance {
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

  return alliance
}

export function getAlliance(id: string): Alliance | undefined {
  return alliances.get(id)
}

export function getAllAlliances(): Alliance[] {
  return [...alliances.values()]
}

export function joinAlliance(
  allianceId: string,
  playerId: string,
): { success: boolean; error?: string } {
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

  return { success: true }
}

export function changeAllianceRole(
  allianceId: string,
  targetPlayerId: string,
  newRole: 'officer' | 'member',
): { success: boolean; error?: string } {
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

  return { success: true }
}

// ─── HumanPlayer ─────────────────────────────

export function getHumanPlayer(id: string): HumanPlayer | undefined {
  return humanPlayers.get(id)
}

export function createHumanPlayer(id: string, username: string, email?: string): HumanPlayer {
  const player: HumanPlayer = {
    id,
    username,
    aiPlayerIds: [],
    createdAt: Date.now(),
    email,
  }
  humanPlayers.set(id, player)
  return player
}

// ─── 状态快照（用于 API 响应） ─────────────────────────────

export function getV2GameState() {
  return {
    aiPlayers: [...aiPlayers.values()],
    alliances: [...alliances.values()],
    humanPlayers: [...humanPlayers.values()],
  }
}
