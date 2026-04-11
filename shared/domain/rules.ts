import { getHeroPoolEntryById, buildHeroProfileFromPoolId } from './heroPool'
import { findPath as hpaStarFindPath } from './hpaStar'
import { runAllianceDirector } from './allianceDirector'
import { runOpposingDirectorDetailed } from './enemyDirector'
import { buildTheaterSnapshot } from './theater'
import { syncAllFactionAiQuota } from './aiQuota'
import { buildUnitsByFaction, computeAllFactionFoodIncomes, getTileByIdFast, partitionTiles } from './worldIndex'
import { updateLuoyangHoldCounters, checkVictoryConditions } from './victoryCondition'
import { processProvincePve } from './provincePve'
import {
  getLuoyangDefenseBonus,
  getAndIncrementSiegeProgress,
  processSiegeDecay,
  isLuoyangTile,
  LUOYANG_SIEGE_TICKS_REQUIRED,
} from './luoyangEndgame'
import { computeResourceIncome } from './resources'
import { actionLabel, allianceStanceLabel, ownerLabel, templateLabel } from './ruleLabels'
import type {
  ActionType,
  BattleOutcomeRecord,
  CityTechLevels,
  CityTechTrackId,
  ExecutableOrder,
  ExecutionReplay,
  ExecutionReplayFrame,
  ExecutionReplayOutcome,
  FactionId,
  IntelligenceLevel,
  PlanExecution,
  PlanningJobHistoryEntry,
  PlanSource,
  ExecutionEnqueueMode,
  ReplayHighlight,
  ReplayOrderSnapshot,
  StrategicPlan,
  TacticalOverride,
  TacticalTemplateId,
  Tile,
  TileIntel,
  Unit,
  UnitStatus,
  WorldState,
} from '../contracts/game'

type MoveResult =
  | { ok: true; world: WorldState; message: string; unitId: string }
  | { ok: false; message: string }

export type QueuePlanFailureCode =
  | 'stale_world_version'
  | 'unknown_faction'
  | 'invalid_order_units'
  | 'execution_chain_guard_missing'
  | 'execution_chain_guard_mismatch'
  | 'execution_chain_active_rejected'

export type QueuePlanEnqueueOutcome = 'queued' | 'appended' | 'replaced'

type QueuePlanResult =
  | { ok: true; world: WorldState; message: string; enqueueOutcome: QueuePlanEnqueueOutcome }
  | { ok: false; message: string; failureCode: QueuePlanFailureCode }

type DeployReserveResult =
  | { ok: true; world: WorldState; message: string; unitId: string }
  | { ok: false; message: string }

type UpgradeCityResult =
  | { ok: true; world: WorldState; message: string; cityHallTileId: string }
  | { ok: false; message: string }

type CityUpgradeRule = {
  nextFootprintTiles: 4 | 9
  actionPoints: number
  food: number
}

const CITY_UPGRADE_RULES: Record<1 | 4, CityUpgradeRule> = {
  1: {
    nextFootprintTiles: 4,
    actionPoints: 1,
    food: 4,
  },
  4: {
    nextFootprintTiles: 9,
    actionPoints: 2,
    food: 8,
  },
}

type UpgradeCityTechResult =
  | { ok: true; world: WorldState; message: string; cityHallTileId: string; techId: CityTechTrackId; nextLevel: number }
  | { ok: false; message: string }

type CityTechUpgradeRule = {
  maxLevel: number
  actionPoints: number
  food: number
  minFootprint: 1 | 4 | 9 | 16
}

const CITY_TECH_UPGRADE_RULES: Record<CityTechTrackId, CityTechUpgradeRule> = {
  governance: { maxLevel: 5, actionPoints: 1, food: 3, minFootprint: 1 },
  logistics: { maxLevel: 5, actionPoints: 1, food: 4, minFootprint: 4 },
  defense: { maxLevel: 5, actionPoints: 2, food: 5, minFootprint: 4 },
  recruitment: { maxLevel: 5, actionPoints: 2, food: 6, minFootprint: 9 },
}

const CITY_TECH_LABELS: Record<CityTechTrackId, string> = {
  governance: 'Governance Core',
  logistics: 'Logistics Grid',
  defense: 'Fortress Works',
  recruitment: 'Recruitment Drill',
}

const EMPTY_CITY_TECH_LEVELS: CityTechLevels = {
  governance: 0,
  logistics: 0,
  defense: 0,
  recruitment: 0,
}

export function getTileById(world: WorldState, tileId: string) {
  // 保留原始接口兼容性；热路径请改用 getTileByIdFast（worldIndex.ts）
  return getTileByIdFast(world, tileId)
}

export function getUnitById(world: WorldState, unitId: string) {
  return world.units.find((unit) => unit.id === unitId)
}

export function getUnitsOnTile(world: WorldState, tileId: string) {
  return world.units.filter((unit) => unit.tileId === tileId)
}

export function isDeployAnchorTile(tile: Tile, factionId: string) {
  return (
    tile.owner === factionId &&
    (tile.type === 'city' || tile.type === 'resource' || tile.type === 'pass')
  )
}

export function getDeployableAnchorTiles(world: WorldState, factionId: string) {
  return world.map.tiles.filter((tile) => isDeployAnchorTile(tile, factionId))
}

function ensureCityTechLevels(cluster: WorldState['map']['overlays']['cityClusters'][number]): CityTechLevels {
  const levels = cluster.techLevels ?? EMPTY_CITY_TECH_LEVELS

  return {
    governance: levels.governance ?? 0,
    logistics: levels.logistics ?? 0,
    defense: levels.defense ?? 0,
    recruitment: levels.recruitment ?? 0,
  }
}

/**
 * Shallow clone WorldState — avoids structuredClone OOM on 102k-tile maps.
 * Shares map.tiles and map.connections by reference (never structurally modified).
 * Deep-clones units, factions, executions, and other small state.
 */
function shallowCloneWorld(world: WorldState): WorldState {
  return {
    tick: world.tick,
    worldVersion: world.worldVersion,
    map: world.map, // Share tiles (102k) + connections (102k) — never add/remove tiles
    factions: Object.fromEntries(
      Object.entries(world.factions).map(([k, v]) => [k, {
        ...v,
        heroCommand: {
          ...v.heroCommand,
          rosterHeroIds: [...v.heroCommand.rosterHeroIds],
          reserveHeroIds: [...v.heroCommand.reserveHeroIds],
          prospectHeroIds: [...v.heroCommand.prospectHeroIds],
        },
      }])
    ) as WorldState['factions'],
    alliance: {
      ...world.alliance,
      directives: Object.fromEntries(
        Object.entries(world.alliance.directives).map(([k, v]) => [k, { ...v }])
      ),
    },
    feedback: {
      allianceActions: [...world.feedback.allianceActions],
      battleRecords: [...world.feedback.battleRecords],
      diplomacyAgreements: [...(world.feedback.diplomacyAgreements ?? [])],
      gameEnded: world.feedback.gameEnded ? { ...world.feedback.gameEnded } : undefined,
    },
    units: world.units.map(u => ({
      ...u,
      corps: { ...u.corps, roster: [...u.corps.roster] },
      hero: { ...u.hero, signatureSkill: { ...u.hero.signatureSkill }, traits: [...u.hero.traits] },
    })),
    reports: [...world.reports],
    intel: { ...world.intel },
    tacticalOverrides: world.tacticalOverrides.map(o => ({ ...o })),
    executions: Object.fromEntries(
      Object.entries(world.executions).map(([k, v]) => [k,
        v ? {
          ...v,
          orders: v.orders.map(o => ({ ...o })),
          currentPlan: { ...v.currentPlan, orders: [...v.currentPlan.orders], constraints: [...v.currentPlan.constraints] },
          planningRationale: v.planningRationale ? [...v.planningRationale] : undefined,
        } : null
      ])
    ),
    history: {
      planningJobs: world.history.planningJobs.map(j => ({ ...j })),
      executionReplays: [...world.history.executionReplays],
    },
    pveNodes: world.pveNodes?.map(n => ({ ...n })),
    luoyangSiegeProgress: world.luoyangSiegeProgress ? { ...world.luoyangSiegeProgress } : undefined,
    citySiegeProgress: world.citySiegeProgress ? { ...world.citySiegeProgress } : undefined,
  }
}

/** Get the execution for a specific faction (or null). */
function getExecution(world: WorldState, factionId: string): PlanExecution | null {
  return world.executions[factionId] ?? null
}

/** Check if a faction (or any faction if not specified) has active orders. */
export function hasActiveOrders(world: WorldState, factionId?: string) {
  if (factionId) {
    const exec = getExecution(world, factionId)
    return exec?.orders.some((order) => order.status === 'queued' || order.status === 'running') ?? false
  }
  return Object.keys(world.factions).some((knownFactionId) => {
    const exec = getExecution(world, knownFactionId)
    return exec?.orders.some((order) => order.status === 'queued' || order.status === 'running') ?? false
  })

}

function spendFactionResources(world: WorldState, factionId: string, actionPoints: number, food: number) {
  const faction = world.factions[factionId]
  if (!faction) return false
  if (faction.actionPoints < actionPoints || faction.food < food) {
    return false
  }
  faction.actionPoints -= actionPoints
  faction.food -= food
  return true
}

function hasHostileUnit(world: WorldState, tileId: string, friendlyFactionId: string) {
  return world.units.some((unit) => unit.faction !== friendlyFactionId && unit.tileId === tileId)
}

function resolveFallbackFactionId(world: WorldState): string {
  const firstFactionId = Object.keys(world.factions)[0]
  return firstFactionId ?? 'neutral'
}

function resolvePrimaryOpposingFactionId(world: WorldState, factionId: string): string {
  const candidates = Object.keys(world.factions).filter((candidateId) => candidateId !== factionId)
  if (candidates.length === 0) {
    return factionId
  }
  return candidates
    .sort((left, right) => {
      const rightUnits = world.units.filter((unit) => unit.faction === right).length
      const leftUnits = world.units.filter((unit) => unit.faction === left).length
      return rightUnits - leftUnits
    })[0]
}

function resolveFactionDisplayLabel(factionId: string): string {
  if (factionId === 'neutral') {
    return '中立'
  }
  return `势力(${factionId})`
}

export function appendPlanningJobHistory(
  world: WorldState,
  entry: PlanningJobHistoryEntry,
): WorldState {
  const nextWorld = shallowCloneWorld(world)
  upsertPlanningJobHistory(nextWorld, entry)
  return nextWorld
}

export function updateAllianceDirective(world: WorldState, regionId: string, stance: WorldState['alliance']['directives'][string]['stance']) {
  const nextWorld = shallowCloneWorld(world)
  const directive = nextWorld.alliance.directives[regionId]
  if (!directive || directive.stance === stance) {
    return nextWorld
  }

  directive.stance = stance
  directive.supportLevel = Math.round(
    clampValue(resolveAllianceSupportLevel(stance, directive.supportLevel), 35, 92),
  )
  directive.summary = `同盟已切换为${allianceStanceLabel(stance)}姿态，当前协同强度 ${directive.supportLevel}。`
  prependReport(
    nextWorld,
    nextWorld.tick,
    '同盟协同调整',
    `${directive.regionId} 已切换为${allianceStanceLabel(stance)}姿态，盟友将据此调整战区协同。`,
  )
  bumpWorldVersion(nextWorld)
  return nextWorld
}

export function queueTacticalOverride(
  world: WorldState,
  unitId: string,
  templateId: TacticalTemplateId,
  targetTileId: string,
  summary: string,
  factionId: string = resolveFallbackFactionId(world),
) {
  const nextWorld = shallowCloneWorld(world)
  const unit = getUnitById(nextWorld, unitId)
  const targetTile = getTileById(nextWorld, targetTileId)

  if (!unit || !targetTile || unit.faction !== factionId) {
    return world
  }

  nextWorld.tacticalOverrides = nextWorld.tacticalOverrides.filter(
    (override) =>
      !(
        override.unitId === unitId &&
        (override.status === 'queued' || override.status === 'committed')
      ),
  )

  nextWorld.tacticalOverrides.unshift({
    id: `tac_${nextWorld.tick}_${unitId}_${templateId}_${targetTileId}`,
    unitId,
    templateId,
    targetTileId,
    summary,
    status: 'queued',
    createdTick: nextWorld.tick,
    createdWorldVersion: nextWorld.worldVersion,
  })
  nextWorld.tacticalOverrides = nextWorld.tacticalOverrides.slice(0, 16)

  prependReport(
    nextWorld,
    nextWorld.tick,
    '战术插令待执行',
    `${unit.name} 已加入 ${templateLabel(templateId)} 指令，目标 ${targetTile.name}。`,
  )
  bumpWorldVersion(nextWorld)
  return nextWorld
}

export function deployReserveHero(
  world: WorldState,
  factionId: string,
  heroId: string,
  tileId: string,
): DeployReserveResult {
  const nextWorld = shallowCloneWorld(world)
  const faction = nextWorld.factions[factionId]
  const heroCommand = faction.heroCommand
  const targetTile = getTileById(nextWorld, tileId)

  if (hasActiveOrders(nextWorld)) {
    return { ok: false, message: '当前已有 AI 任务在执行，请等待本轮执行完成后再调整 reserve 编组。' }
  }

  if (!targetTile) {
    return { ok: false, message: '部署支点不存在。' }
  }

  if (!isDeployAnchorTile(targetTile, factionId)) {
    return { ok: false, message: '仅可在己方城池、关口或资源支点完成编组。' }
  }

  if (!heroCommand.reserveHeroIds.includes(heroId)) {
    return { ok: false, message: '目标武将当前不在 reserve 中。' }
  }

  if (nextWorld.units.filter((unit) => unit.faction === factionId).length >= heroCommand.commandLimit) {
    return { ok: false, message: '当前执行单元已达到指挥上限。' }
  }

  if (faction.food < 3) {
    return { ok: false, message: '粮草不足，至少需要 3 点粮草才能完成编组。' }
  }

  if (faction.actionPoints < 1) {
    return { ok: false, message: '行动点不足，至少需要 1 点行动点才能完成编组。' }
  }

  heroCommand.reserveHeroIds = heroCommand.reserveHeroIds.filter((candidateId) => candidateId !== heroId)
  const spawnedUnit = createReserveUnit(nextWorld, factionId, heroId, tileId, 'manual')
  nextWorld.units.push(spawnedUnit)
  faction.food = Math.max(0, faction.food - 3)
  faction.actionPoints = Math.max(0, faction.actionPoints - 1)

  prependReport(
    nextWorld,
    nextWorld.tick,
    `${resolveFactionDisplayLabel(factionId)} reserve 手动编组完成`,
    `${spawnedUnit.hero.name} 已在 ${targetTile.name} 完成编组并进入地图待命。`,
  )
  bumpWorldVersion(nextWorld)

  return {
    ok: true,
    world: nextWorld,
    message: `${spawnedUnit.hero.name} 已在 ${targetTile.name} 完成编组，现可纳入 AI 指挥链。`,
    unitId: spawnedUnit.id,
  }
}

export function upgradeCity(world: WorldState, tileId: string, factionId: string = resolveFallbackFactionId(world)): UpgradeCityResult {
  if (hasActiveOrders(world)) {
    return { ok: false, message: '当前已有 AI 任务在执行，请等待本轮执行完成后再升级城池。' }
  }

  const nextWorld = shallowCloneWorld(world)
  const cluster = nextWorld.map.overlays.cityClusters.find(
    (item) => item.cityHallTileId === tileId || item.tileIds.includes(tileId),
  )

  if (!cluster) {
    return { ok: false, message: '目标地块不在可识别的城池连续层中。' }
  }

  if (cluster.owner !== factionId) {
    return { ok: false, message: `当前仅允许升级 ${resolveFactionDisplayLabel(factionId)} 城池。` }
  }

  if (!cluster.isUpgradeable) {
    return { ok: false, message: '该城池已达到当前阶段上限。' }
  }

  if (cluster.footprintTiles !== 1 && cluster.footprintTiles !== 4) {
    return { ok: false, message: '当前城池规模不在可升级范围内。' }
  }

  const upgradeRule = CITY_UPGRADE_RULES[cluster.footprintTiles]
  if (!upgradeRule) {
    return { ok: false, message: '未找到对应的城池升级规则。' }
  }

  const hallTile = getTileById(nextWorld, cluster.cityHallTileId)
  if (!hallTile) {
    return { ok: false, message: '城主府锚点缺失，无法升级。' }
  }

  const nextFootprintTileIds = resolveCityUpgradeFootprintTileIds(
    nextWorld,
    hallTile,
    upgradeRule.nextFootprintTiles,
    cluster.tileIds,
  )
  if (nextFootprintTileIds.length !== upgradeRule.nextFootprintTiles) {
    return { ok: false, message: '扩建范围缺失可用地块，请清理周边后重试。' }
  }

  const blockedByOpposingUnit = nextFootprintTileIds.find((candidateTileId) => hasHostileUnit(nextWorld, candidateTileId, cluster.owner))
  if (blockedByOpposingUnit) {
    const blockedTile = getTileById(nextWorld, blockedByOpposingUnit)
    return {
      ok: false,
      message: `扩建范围存在对立单位占据地块（${blockedTile?.name ?? blockedByOpposingUnit}）。`,
    }
  }

  const blockedTiles = nextFootprintTileIds
    .map((candidateTileId) => getTileById(nextWorld, candidateTileId))
    .filter((candidate): candidate is Tile => !!candidate)
    .filter((candidate) => candidate.owner !== factionId)

  if (blockedTiles.length > 0) {
    return {
      ok: false,
      message: `扩建范围存在非我方地块（${blockedTiles[0].name}），请先完成占领。`,
    }
  }

  if (!spendResources(nextWorld, factionId, upgradeRule.actionPoints, upgradeRule.food)) {
    return {
      ok: false,
      message: `资源不足，升级需要 ${upgradeRule.actionPoints} 行动点与 ${upgradeRule.food} 点粮草。`,
    }
  }

  const cityLevelTarget = upgradeRule.nextFootprintTiles === 4 ? 5 : 7
  for (const candidateTileId of nextFootprintTileIds) {
    const tile = getTileById(nextWorld, candidateTileId)
    if (!tile) {
      continue
    }

    tile.owner = factionId
    tile.type = 'city'
    tile.terrain = 'urban'
    tile.moveCost = 1
    tile.cityLevel = Math.max(tile.cityLevel ?? cityLevelTarget, cityLevelTarget)
    tile.enemyPressure = Math.max(0, Math.min(5, tile.enemyPressure))
    tile.scoutingDifficulty = Math.max(tile.scoutingDifficulty, cityLevelTarget >= 7 ? 3 : 2)
    tile.landmarkId = cluster.id
    tile.landmarkName = cluster.name
  }

  cluster.tileIds = nextFootprintTileIds
  cluster.centerTileId = cluster.cityHallTileId
  cluster.footprintTiles = upgradeRule.nextFootprintTiles
  cluster.footprintTier = resolveCityFootprintTier(upgradeRule.nextFootprintTiles)
  cluster.upgradeCapTiles = 9
  cluster.isUpgradeable = upgradeRule.nextFootprintTiles < 9

  prependReport(
    nextWorld,
    nextWorld.tick,
    '城池扩建完成',
    `${cluster.name} 已扩建至 ${upgradeRule.nextFootprintTiles} 格，消耗 ${upgradeRule.actionPoints} 行动点与 ${upgradeRule.food} 点粮草。`,
  )
  bumpWorldVersion(nextWorld)

  return {
    ok: true,
    world: nextWorld,
    cityHallTileId: cluster.cityHallTileId,
    message: `${cluster.name} 扩建完成，当前规模 ${upgradeRule.nextFootprintTiles} 格。`,
  }
}

export function upgradeCityTech(
  world: WorldState,
  tileId: string,
  techId: CityTechTrackId,
  factionId: string = resolveFallbackFactionId(world),
): UpgradeCityTechResult {
  if (hasActiveOrders(world)) {
    return { ok: false, message: 'Active AI orders are running. Wait for this tick to finish before researching city tech.' }
  }

  const nextWorld = shallowCloneWorld(world)
  const cluster = nextWorld.map.overlays.cityClusters.find(
    (item) => item.cityHallTileId === tileId || item.tileIds.includes(tileId),
  )

  if (!cluster) {
    return { ok: false, message: 'Target tile is not part of a valid city cluster.' }
  }

  if (cluster.owner !== factionId) {
    return { ok: false, message: `Only ${resolveFactionDisplayLabel(factionId)} cities can research city tech.` }
  }

  const rule = CITY_TECH_UPGRADE_RULES[techId]
  if (!rule) {
    return { ok: false, message: 'Unsupported city tech track.' }
  }

  if (cluster.footprintTiles < rule.minFootprint) {
    return {
      ok: false,
      message: `${CITY_TECH_LABELS[techId]} requires city footprint >= ${rule.minFootprint} tiles.`,
    }
  }

  cluster.techLevels = ensureCityTechLevels(cluster)
  const currentLevel = cluster.techLevels[techId]
  if (currentLevel >= rule.maxLevel) {
    return { ok: false, message: `${CITY_TECH_LABELS[techId]} is already max level.` }
  }

  const actionCost = rule.actionPoints + Math.floor(currentLevel / 2)
  const foodCost = rule.food + currentLevel * 2
  if (!spendResources(nextWorld, factionId, actionCost, foodCost)) {
    return {
      ok: false,
      message: `Insufficient resources. Need ${actionCost} AP and ${foodCost} food.`,
    }
  }

  const nextLevel = currentLevel + 1
  cluster.techLevels[techId] = nextLevel

  let bonusNote = 'City-wide efficiency improved.'
  switch (techId) {
    case 'governance': {
      nextWorld.factions[factionId].heroCommand.developmentPoints += 1
      bonusNote = 'Development points +1.'
      break
    }
    case 'logistics': {
      nextWorld.factions[factionId].food += 2
      bonusNote = 'Immediate +2 food bonus.'
      break
    }
    case 'defense': {
      for (const clusterTileId of cluster.tileIds) {
        const tile = getTileById(nextWorld, clusterTileId)
        if (!tile) {
          continue
        }
        tile.scoutingDifficulty = Math.max(tile.scoutingDifficulty, 2 + Math.floor(nextLevel / 2))
        tile.enemyPressure = Math.max(0, tile.enemyPressure - 1)
      }
      bonusNote = 'Defense scouting difficulty increased and opposing pressure reduced.'
      break
    }
    case 'recruitment': {
      nextWorld.factions[factionId].actionPoints = Math.min(12, nextWorld.factions[factionId].actionPoints + 1)
      bonusNote = 'Immediate +1 AP recovery.'
      break
    }
    default:
      break
  }

  prependReport(
    nextWorld,
    nextWorld.tick,
    'City Tech Upgraded',
    `${cluster.name} researched ${CITY_TECH_LABELS[techId]} Lv.${nextLevel}. Cost ${actionCost} AP / ${foodCost} food. ${bonusNote}`,
  )
  bumpWorldVersion(nextWorld)

  return {
    ok: true,
    world: nextWorld,
    cityHallTileId: cluster.cityHallTileId,
    techId,
    nextLevel,
    message: `${cluster.name} upgraded ${CITY_TECH_LABELS[techId]} to Lv.${nextLevel}.`,
  }
}


export function moveUnit(
  world: WorldState,
  unitId: string,
  targetTileId: string,
  factionId: string = resolveFallbackFactionId(world),
): MoveResult {
  if (hasActiveOrders(world)) {
    return { ok: false, message: '当前已有 AI 任务在执行，地图点击已切换为查看模式。' }
  }

  const nextWorld = shallowCloneWorld(world)
  const unit = getUnitById(nextWorld, unitId)
  const targetTile = getTileById(nextWorld, targetTileId)

  if (!unit || !targetTile) {
    return { ok: false, message: '目标单位或目标地块不存在。' }
  }

  if (unit.faction !== factionId) {
    return { ok: false, message: `仅允许调度 ${resolveFactionDisplayLabel(factionId)} 队伍。` }
  }

  if (unit.tileId === targetTileId) {
    return { ok: false, message: `${unit.name} 已经位于 ${targetTile.name}。` }
  }

  if (!nextWorld.map.connections[unit.tileId]?.includes(targetTileId)) {
    return { ok: false, message: `${unit.name} 只能向相邻地块行军。` }
  }

  const blockedReason = getEntryBlockReason(nextWorld, unit, targetTile, 'march')
  if (blockedReason) {
    return { ok: false, message: blockedReason }
  }

  const currentTile = getTileById(nextWorld, unit.tileId)
  const marchCost = resolveMarchResourceCost(currentTile, targetTile)
  if (!spendFactionResources(nextWorld, unit.faction, marchCost.actionPoints, marchCost.food)) {
    return {
      ok: false,
      message: `资源不足，进入 ${targetTile.name} 需要 ${marchCost.actionPoints} 行动点与 ${marchCost.food} 点粮草。`
    }
  }

  const originTileId = unit.tileId
  unit.tileId = targetTile.id
  unit.supply = Math.max(0, unit.supply - 1)
  unit.status = '行军中'
  unit.currentTask = `向${targetTile.name}机动`

  prependReport(
    nextWorld,
    nextWorld.tick,
    '行军命令执行',
    `${unit.name} 从手动调度进入 ${targetTile.name}，消耗 ${marchCost.actionPoints} 行动点与 ${marchCost.food} 点粮草。`
  )

  const battleMessage = resolveBattleAtTile(nextWorld, unit, targetTile, originTileId, [])
  const detailMessage = battleMessage ?? `${unit.name} 已开始向 ${targetTile.name} 行军。`
  bumpWorldVersion(nextWorld)

  return {
    ok: true,
    world: nextWorld,
    unitId,
    message: detailMessage,
  }
}

export function queuePlanExecution(
  world: WorldState,
  plan: StrategicPlan,
  source: PlanSource,
  factionId: string,
  strategicCommand: string,
  requestId: string,
  basedOnWorldVersion: number,
  executionMode: ExecutionEnqueueMode = 'replace',
  expectedExecutionRequestId?: string,
  plannerNote?: string,
  plannerExplanation?: string,
  planningRationale?: string[],
): QueuePlanResult {
  if (world.worldVersion !== basedOnWorldVersion) {
    return {
      ok: false,
      message: `planning result stale: world is V${world.worldVersion}, plan is based on V${basedOnWorldVersion}.`,
      failureCode: 'stale_world_version',
    }
  }

  if (!world.factions[factionId]) {
    return {
      ok: false,
      message: `unknown faction: ${factionId}.`,
      failureCode: 'unknown_faction',
    }
  }

  const invalidOrderUnitIds = Array.from(
    new Set(
      plan.orders
        .map((order) => {
          const unit = getUnitById(world, order.unitId)
          if (!unit || unit.faction !== factionId) {
            return order.unitId
          }
          return null
        })
        .filter((unitId): unitId is string => typeof unitId === 'string' && unitId.length > 0),
    ),
  )

  if (invalidOrderUnitIds.length > 0) {
    return {
      ok: false,
      message: `invalid order units for faction ${factionId}: ${invalidOrderUnitIds.slice(0, 6).join(', ')}.`,
      failureCode: 'invalid_order_units',
    }
  }

  const normalizedExecutionMode = normalizeExecutionEnqueueMode(executionMode)
  const activeExecution = getExecution(world, factionId) && hasActiveOrders(world, factionId) ? getExecution(world, factionId) : null
  const expectedRequestId = expectedExecutionRequestId?.trim()

  if (expectedRequestId) {
    if (!activeExecution) {
      return {
        ok: false,
        message: `execution chain guard: expected active requestId=${expectedRequestId}, but no active execution exists.`,
        failureCode: 'execution_chain_guard_missing',
      }
    }

    if (activeExecution.requestId !== expectedRequestId) {
      return {
        ok: false,
        message: `execution chain guard: expected active requestId=${expectedRequestId}, actual=${activeExecution.requestId}.`,
        failureCode: 'execution_chain_guard_mismatch',
      }
    }
  }

  if (normalizedExecutionMode === 'reject_if_active' && activeExecution) {
    return {
      ok: false,
      message: `execution chain is active (requestId=${activeExecution.requestId}); mode reject_if_active blocked the new plan.`,
      failureCode: 'execution_chain_active_rejected',
    }
  }

  const nextWorld = shallowCloneWorld(world)
  const providerLabel = resolvePlannerSourceLabel(source)
  const factionExec = getExecution(nextWorld, factionId)

  if (normalizedExecutionMode === 'append' && factionExec && hasActiveOrders(nextWorld, factionId)) {
    const appendRequestId = factionExec.requestId
    const tacticalOrders = materializeQueuedTacticalOrders(nextWorld, appendRequestId, basedOnWorldVersion, factionId)
    const plannerOrders: ExecutableOrder[] = plan.orders.map((order, index) => ({
      id: `${appendRequestId}_append_${nextWorld.tick}_${index}`,
      requestId: appendRequestId,
      unitId: order.unitId,
      action: order.action,
      target: order.target,
      status: 'queued',
      summary: `${actionLabel(order.action)} ${getTileById(nextWorld, order.target)?.name ?? order.target}`,
      createdTick: nextWorld.tick,
      basedOnWorldVersion,
    }))

    nextWorld.executions[factionId] = {
      ...factionExec,
      source,
      strategicCommand: mergeExecutionStrategicCommand(factionExec.strategicCommand, strategicCommand),
      currentPlan: mergeStrategicPlanForAppend(factionExec.currentPlan, plan),
      orders: [...factionExec.orders, ...tacticalOrders, ...plannerOrders],
      reviewAtTick: Math.max(factionExec.reviewAtTick, nextWorld.tick + plan.reviewAfterTicks),
      basedOnWorldVersion,
      plannerNote: plannerNote ?? factionExec.plannerNote,
      plannerExplanation: plannerExplanation ?? factionExec.plannerExplanation,
      planningRationale: mergePlanningRationale(factionExec.planningRationale, planningRationale),
    }

    prependReport(
      nextWorld,
      nextWorld.tick,
      'AI plan appended',
      `${providerLabel} appended ${plannerOrders.length} orders and merged ${tacticalOrders.length} tactical overrides. intent=${plan.intent}.`,
    )
    bumpWorldVersion(nextWorld)
    const appendedFocusOrder = tacticalOrders[0] ?? plannerOrders[0]
    syncExecutionReplay(nextWorld, factionId, 'plan_appended', 'running', true, [
      createReplayHighlight(
        nextWorld.tick,
        'planning',
        'medium',
        'Plan appended',
        `${providerLabel} appended ${plannerOrders.length + tacticalOrders.length} orders to active chain.`,
        {
          unitId: appendedFocusOrder?.unitId,
          tileId: appendedFocusOrder?.target,
          factionId,
        },
      ),
    ])

    return {
      ok: true,
      world: nextWorld,
      message: `plan appended to active execution chain (requestId=${appendRequestId}), based on world V${basedOnWorldVersion}.`,
      enqueueOutcome: 'appended',
    }
  }

  if (factionExec && hasActiveOrders(nextWorld, factionId)) {
    const overriddenFocusOrder = factionExec.orders.find(
      (order) => order.status === 'queued' || order.status === 'running',
    ) ?? factionExec.orders[0]
    syncExecutionReplay(nextWorld, factionId, 'plan_overridden_by_new_request', 'cleared', true, [
      createReplayHighlight(
        nextWorld.tick,
        'planning',
        'medium',
        'Plan overridden',
        'a new strategic plan replaced the active execution chain.',
        {
          unitId: overriddenFocusOrder?.unitId,
          tileId: overriddenFocusOrder?.target,
          factionId,
        },
      ),
    ])
  }

  const tacticalOrders = materializeQueuedTacticalOrders(nextWorld, requestId, basedOnWorldVersion, factionId)

  const plannerOrders: ExecutableOrder[] = plan.orders.map((order, index) => ({
    id: `${requestId}_order_${index}`,
    requestId,
    unitId: order.unitId,
    action: order.action,
    target: order.target,
    status: 'queued',
    summary: `${actionLabel(order.action)} ${getTileById(nextWorld, order.target)?.name ?? order.target}`,
    createdTick: nextWorld.tick,
    basedOnWorldVersion,
  }))
  const orders: ExecutableOrder[] = [...tacticalOrders, ...plannerOrders]

  nextWorld.executions[factionId] = {
    requestId,
    source,
    strategicCommand,
    currentPlan: plan,
    orders,
    reviewAtTick: nextWorld.tick + plan.reviewAfterTicks,
    basedOnWorldVersion,
    plannerNote,
    plannerExplanation,
    planningRationale,
  }

  prependReport(
    nextWorld,
    nextWorld.tick,
    'AI plan dispatched',
    `${providerLabel} produced ${plannerOrders.length} orders and merged ${tacticalOrders.length} tactical overrides. intent=${plan.intent}.`,
  )
  bumpWorldVersion(nextWorld)
  const dispatchedFocusOrder = orders[0]
  syncExecutionReplay(nextWorld, factionId, 'plan_dispatched', 'running', true, [
    createReplayHighlight(
      nextWorld.tick,
      'planning',
      'medium',
      'Plan dispatched',
      `${providerLabel} dispatched ${orders.length} structured orders.`,
      {
        unitId: dispatchedFocusOrder?.unitId,
        tileId: dispatchedFocusOrder?.target,
        factionId,
      },
    ),
  ])

  return {
    ok: true,
    world: nextWorld,
    message: `AI plan queued based on world version V${basedOnWorldVersion}.`,
    enqueueOutcome: activeExecution ? 'replaced' : 'queued',
  }
}

function normalizeExecutionEnqueueMode(mode: ExecutionEnqueueMode): ExecutionEnqueueMode {
  if (mode === 'append' || mode === 'reject_if_active') {
    return mode
  }

  return 'replace'
}

function resolvePlannerSourceLabel(source: PlanSource) {
  if (source === 'local') {
    return 'local_model'
  }

  if (source === 'gateway') {
    return 'gateway_relay'
  }

  return 'mock_planner'
}

function mergeExecutionStrategicCommand(current: string, incoming: string) {
  const normalizedIncoming = incoming.trim()
  if (!normalizedIncoming) {
    return current
  }

  const normalizedCurrent = current.trim()
  if (!normalizedCurrent) {
    return normalizedIncoming
  }

  if (normalizedCurrent === normalizedIncoming) {
    return normalizedCurrent
  }

  return `${normalizedCurrent} | append: ${normalizedIncoming}`
}

function mergePlanningRationale(current?: string[], incoming?: string[]) {
  if (!incoming || incoming.length === 0) {
    return current
  }

  const merged = new Set<string>()
  for (const item of current ?? []) {
    const normalized = item.trim()
    if (normalized) {
      merged.add(normalized)
    }
  }
  for (const item of incoming) {
    const normalized = item.trim()
    if (normalized) {
      merged.add(normalized)
    }
  }

  return Array.from(merged).slice(0, 8)
}

function mergeStrategicPlanForAppend(current: StrategicPlan, incoming: StrategicPlan): StrategicPlan {
  const byUnitId = new Map<string, StrategicPlan['orders'][number]>()

  for (const order of current.orders) {
    byUnitId.set(order.unitId, order)
  }

  for (const order of incoming.orders) {
    byUnitId.set(order.unitId, order)
  }

  return {
    ...current,
    intent: incoming.intent.trim() || current.intent,
    priority: incoming.priority,
    orders: Array.from(byUnitId.values()).slice(0, 8),
    constraints: Array.from(new Set([...current.constraints, ...incoming.constraints, 'execution_append_mode_v1'])).slice(0, 16),
    reviewAfterTicks: Math.max(1, Math.min(6, incoming.reviewAfterTicks)),
  }
}

export function clearPlanExecution(world: WorldState, factionId: string = resolveFallbackFactionId(world)) {
  const nextWorld = shallowCloneWorld(world)
  const hadActiveExecution = getExecution(nextWorld, factionId) && hasActiveOrders(nextWorld, factionId)
  const clearedFocusOrder = nextWorld.executions[factionId]?.orders.find(
    (order) => order.status === 'queued' || order.status === 'running',
  ) ?? nextWorld.executions[factionId]?.orders[0]

  prependReport(nextWorld, nextWorld.tick, '计划已清空', '当前 AI 任务队列已移除，部队恢复为可手动调度状态。')
  bumpWorldVersion(nextWorld)

  if (hadActiveExecution) {
    syncExecutionReplay(nextWorld, factionId, '计划清空', 'cleared', true, [
      createReplayHighlight(nextWorld.tick, 'planning', 'low', '计划被手动清空', '当前 AI 任务队列已移除。', {
        unitId: clearedFocusOrder?.unitId,
        tileId: clearedFocusOrder?.target,
        factionId,
      }),
    ])
  }

  nextWorld.executions[factionId] = null
  return nextWorld
}

// ─── 自动扩张 / 开荒 / 升级常量 ──────────────────────────────────────────────
/** 铺路：每单位每回合可占领的中立普通格子数（配额降低，让 AI march/capture 成为扩张主力） */
const PAVE_QUOTA_PER_UNIT = 3
/** 开荒：每单位每回合可占领的中立资源格子数（每格花费 1 粮草） */
const PIONEER_QUOTA_PER_UNIT = 2
/** 升级：每势力每回合可升级的队伍数 */
const LEVELUP_SQUADS_PER_TICK = 1
/** 升级：每次升级增加的等级数 */
const LEVELUP_LEVELS_PER_SQUAD = 5
/** 升级：每次升级花费的粮草 */
const LEVELUP_FOOD_COST = 5
/** 武将最高等级 */
const HERO_MAX_LEVEL = 50

// ── 行军速度（格/回合）—— 100格=1回合基准，骑兵更快 ────────────────────────────
/** 骑兵：150格/回合（1.5x，高速机动） */
const MARCH_STEPS_CAVALRY = 150
/** 步兵/混合：100格/回合（1.0x 基准） */
const MARCH_STEPS_INFANTRY = 100
/** 重甲盾兵：70格/回合（0.7x，厚重缓慢） */
const MARCH_STEPS_SHIELD = 70
/** 辎重/后勤：60格/回合（0.6x，最慢） */
const MARCH_STEPS_SUPPLY = 60
/** 混合兵种：90格/回合 */
const MARCH_STEPS_MIXED = 90

// ── 征兵参数 ──────────────────────────────────────────────────────────────────
/** 征兵花费粮草 */
const RECRUIT_FOOD_COST = 25
/** 征兵冷却：每 N 回合可征兵一次（粮草充足时） */
const RECRUIT_COOLDOWN_TICKS = 4
/** 每势力最多部队数 */
const MAX_UNITS_PER_FACTION = 30

/**
 * 获取兵种对应的行军步数（格/回合）
 * 骑兵 150 > 混合 90 > 步兵 100 > 重甲 70 > 辎重 60
 */
function getMarchSteps(unit: Unit): number {
  switch (unit.hero.troopType) {
    case 'cavalry': return MARCH_STEPS_CAVALRY
    case 'supply':  return MARCH_STEPS_SUPPLY
    case 'shield':  return MARCH_STEPS_SHIELD
    case 'mixed':   return MARCH_STEPS_MIXED
    case 'infantry':
    default:        return MARCH_STEPS_INFANTRY
  }
}

/**
 * 自动领土扩张（铺路 + 开荒）— 全势力飞地共享边界版（O(n) 单次扫描优化）
 *
 * 性能关键：
 *   - 原实现每势力单独扫描全部 102k 格建立 frontier → 13 × 102k = 133 万次/tick
 *   - 现实现：1 次扫描全部 102k 格，同时为所有势力建立 frontier → 102k 次/tick（13x 提速）
 *   - 各势力 frontier 独立 BFS 扩张，新占格立即入队（真正多步波浪扩张）
 *   - 飞地支持：任意己方领地边界均可扩，不限单个单位位置
 */
function processAutoExpansion(
  world: WorldState,
  unitsByFaction: Map<string, Unit[]>,
  highlights: ReplayHighlight[],
) {
  // ── Phase 1: O(n) 单次扫描 ── 建立 owner 索引 + 所有势力初始 frontier ───────
  const ownerById = new Map<string, string>()
  for (const tile of world.map.tiles) {
    ownerById.set(tile.id, tile.owner)
  }

  // 每个势力的初始边界中立格（key = factionId）
  const factionFrontiers = new Map<string, string[]>()
  const factionSeens = new Map<string, Set<string>>()

  // 预填充参与扩张的势力
  for (const [factionId, units] of unitsByFaction.entries()) {
    const idleCount = units.filter(u => u.status === '待命' || u.status === '驻防中').length
    if (idleCount > 0) {
      factionFrontiers.set(factionId, [])
      factionSeens.set(factionId, new Set())
    }
  }

  // 一次性扫描所有 tile，将相邻中立格加入对应势力的初始 frontier
  for (const tile of world.map.tiles) {
    const fq = factionFrontiers.get(tile.owner)
    if (!fq) continue  // 不参与扩张 or 中立
    const seen = factionSeens.get(tile.owner)!
    for (const nId of world.map.connections[tile.id] ?? []) {
      const nOwner = ownerById.get(nId) ?? 'neutral'
      // 只扩张到中立格，跳过停战方领土
      if (!seen.has(nId) && nOwner === 'neutral') {
        seen.add(nId)
        fq.push(nId)
      }
    }
  }

  // ── Phase 2: 每势力独立 BFS 扩张（直到配额耗尽）──────────────────────────
  for (const [factionId, units] of unitsByFaction.entries()) {
    const faction = world.factions[factionId]
    if (!faction) continue

    const idleUnits = units.filter(u => u.status === '待命' || u.status === '驻防中')
    if (idleUnits.length === 0) continue

    const frontierQ = factionFrontiers.get(factionId)
    const seen2 = factionSeens.get(factionId)
    if (!frontierQ || !seen2) continue

    const paveQuota = idleUnits.length * PAVE_QUOTA_PER_UNIT
    const pioneerQuota = idleUnits.length * PIONEER_QUOTA_PER_UNIT
    const expansionAnchorUnitId = idleUnits[0]?.id
    let paved = 0
    let pioneered = 0
    let capturedCityCount = 0
    let lastClaimedTileId: string | undefined

    let qi = 0
    while (qi < frontierQ.length && (paved < paveQuota || pioneered < pioneerQuota)) {
      const nId = frontierQ[qi++]
      if (ownerById.get(nId) !== 'neutral') continue

      const nTile = getTileByIdFast(world, nId)
      if (!nTile) continue

      let claimed = false
      if (nTile.type === 'resource' && pioneered < pioneerQuota) {
        if (faction.food < 1) continue
        faction.food -= 1
        nTile.owner = factionId
        ownerById.set(nId, factionId)
        pioneered++
        claimed = true
      } else if (nTile.type !== 'resource' && paved < paveQuota) {
        nTile.owner = factionId
        ownerById.set(nId, factionId)
        paved++
        claimed = true
        // 城池占领：解锁传送/征兵出生点
        if (nTile.type === 'city') {
          if (!faction.capturedCities) faction.capturedCities = []
          if (!faction.capturedCities.includes(nId)) {
            faction.capturedCities.push(nId)
            capturedCityCount++
          }
        }
      }

      if (claimed) {
        lastClaimedTileId = nId
        // 新占领格的中立邻居立即入队（波浪式扩张，不限步数）
        for (const nnId of world.map.connections[nId] ?? []) {
          if (!seen2.has(nnId) && ownerById.get(nnId) === 'neutral') {
            seen2.add(nnId)
            frontierQ.push(nnId)
          }
        }
      }
    }

    if (paved + pioneered > 0) {
      const cityNote = capturedCityCount > 0 ? `，占领 ${capturedCityCount} 座城池（传送点解锁）` : ''
      prependReport(
        world,
        world.tick,
        `${factionId} 领土扩张`,
        `铺路 ${paved} 格，开荒 ${pioneered} 格资源地${cityNote}。`,
      )
      highlights.push(
        createEngageReplayHighlight(
          world.tick,
          'tile_control',
          paved + pioneered > 100 ? 'medium' : 'low',
          `${factionId} 自动扩张`,
          `铺路 ${paved} 格，开荒 ${pioneered} 格`,
          {
            unitId: expansionAnchorUnitId,
            tileId: lastClaimedTileId,
            toTileId: lastClaimedTileId,
            factionId,
          },
        ),
      )
    }
  }
}

/**
 * 自动征兵（滚雪球核心）
 *
 * 每 RECRUIT_COOLDOWN_TICKS 回合，当粮草 ≥ RECRUIT_FOOD_COST 且部队数 < MAX_UNITS_PER_FACTION 时，
 * 自动为该势力征募一支新部队，出生于已占领的城池（传送点）或主城基地。
 * 领地越多 → 粮食越多 → 征兵越快 → 扩张越快 → 接触敌人越快。
 */
function processRecruitment(
  world: WorldState,
  unitsByFaction: Map<string, Unit[]>,
) {
  if (world.tick % RECRUIT_COOLDOWN_TICKS !== 0) return

  for (const [factionId, units] of unitsByFaction.entries()) {
    const faction = world.factions[factionId]
    if (!faction) continue
    if (faction.food < RECRUIT_FOOD_COST) continue
    if (units.length >= MAX_UNITS_PER_FACTION) continue

    // 出生点：优先已占领的城池（传送点），其次主城
    let spawnTileId = faction.heroCommand.homeTileId
    if (faction.capturedCities && faction.capturedCities.length > 0) {
      const validCity = faction.capturedCities.find(cId => {
        const t = getTileByIdFast(world, cId)
        return t && t.owner === factionId
      })
      if (validCity) spawnTileId = validCity
    }

    faction.food -= RECRUIT_FOOD_COST
    faction.recruitedTotal = (faction.recruitedTotal ?? 0) + 1
    const recIdx = faction.recruitedTotal

    const archetypePool: Array<Unit['hero']['archetype']> = ['guard', 'mobile', 'assault', 'assault', 'mobile', 'recon']
    const archetype = archetypePool[recIdx % archetypePool.length]
    const troopType: Unit['hero']['troopType'] = archetype === 'mobile' ? 'cavalry' : archetype === 'guard' ? 'shield' : 'infantry'
    const nameMap: Record<string, string> = { guard: '守将', mobile: '斥候', assault: '先锋', recon: '探马', logistics: '粮官', reserve: '预备将' }

    const newUnit: Unit = {
      id: `unit_${factionId}_r${recIdx}`,
      name: `${factionId}征兵${recIdx}军`,
      faction: factionId as Unit['faction'],
      corps: {
        name: `${factionId}征${recIdx}军`,
        doctrine: '扩张边境，支援主力',
        specialty: archetype,
        readiness: 60,
        roster: [],
      },
      hero: {
        id: `hero_rec_${factionId}_${recIdx}`,
        name: `${factionId}新将${recIdx}`,
        title: `新晋${nameMap[archetype] ?? '将领'}`,
        faction: '群',
        cardType: troopType === 'cavalry' ? '骑' : '步',
        quality: '3-R',
        archetype,
        level: Math.max(5, Math.min(20, recIdx * 2)),
        troopType,
        avatarKey: 'hero-avatar-recruit',
        portraitKey: 'hero-portrait-recruit',
        force: 50,
        command: 55 + recIdx,
        intelligence: 45,
        charisma: 42,
        speed: archetype === 'mobile' ? 65 : 45,
        traits: archetype === 'guard' ? ['坚守', '抗压'] : archetype === 'mobile' ? ['机动', '侦察'] : ['突击', '攻坚'],
        signatureSkill: { name: '新兵冲劲', detail: '新招募兵员的初次作战' },
        growthFocus: `${factionId}边境扩张`,
      },
      tileId: spawnTileId,
      strength: 20,
      mobility: archetype === 'mobile' ? 6 : 3,
      supply: 5,
      status: '待命',
    }

    world.units.push(newUnit)
    prependReport(
      world,
      world.tick,
      `${factionId} 征兵`,
      `第${recIdx}次征兵于 tick${world.tick}，出生于${spawnTileId}（消耗粮草${RECRUIT_FOOD_COST}），当前总兵力：${units.length + 1}支。`,
    )
  }
}

/**
 * 自动升级武将
 *
 * 每势力每回合自动为一个队伍提升 5 级（花费 LEVELUP_FOOD_COST 粮草）。
 * 优先升级等级最低的武将，最高不超过 HERO_MAX_LEVEL。
 * 升级同时提升战力和属性。
 */
function processAutoLevelUp(
  world: WorldState,
  unitsByFaction: Map<string, Unit[]>,
  highlights: ReplayHighlight[],
) {
  for (const [factionId, units] of unitsByFaction.entries()) {
    const faction = world.factions[factionId]
    if (!faction || faction.food < LEVELUP_FOOD_COST) continue

    // 找等级最低且可升级的武将
    const levelable = units
      .filter(u => u.hero.level < HERO_MAX_LEVEL)
      .sort((a, b) => a.hero.level - b.hero.level)

    if (levelable.length === 0) continue

    let leveled = 0
    for (const target of levelable) {
      if (leveled >= LEVELUP_SQUADS_PER_TICK) break
      if (faction.food < LEVELUP_FOOD_COST) break

      const oldLevel = target.hero.level
      const newLevel = Math.min(HERO_MAX_LEVEL, oldLevel + LEVELUP_LEVELS_PER_SQUAD)
      const levelGain = newLevel - oldLevel
      if (levelGain <= 0) continue

      target.hero.level = newLevel
      faction.food -= LEVELUP_FOOD_COST
      // 升级提升战力和属性（五维全涨）
      target.strength = Math.min(100, target.strength + levelGain * 2)
      target.hero.force = Math.min(100, target.hero.force + levelGain)
      target.hero.command = Math.min(100, target.hero.command + levelGain)
      target.hero.intelligence = Math.min(100, target.hero.intelligence + levelGain)
      target.hero.charisma = Math.min(100, target.hero.charisma + levelGain)
      target.hero.speed = Math.min(100, target.hero.speed + levelGain)
      leveled++

      prependReport(
        world,
        world.tick,
        `${factionId} 武将升级`,
        `${target.hero.name} 升级至 Lv.${newLevel}（+${levelGain}级），战力提升至 ${target.strength}。`,
      )
      highlights.push(
        createEngageReplayHighlight(
          world.tick,
          'logistics',
          'low',
          `${target.hero.name} 升级`,
          `${target.hero.name} Lv.${oldLevel}→${newLevel}，战力 ${target.strength}`,
          {
            unitId: target.id,
            tileId: target.tileId,
            factionId,
          },
        ),
      )
    }
  }
}

/**
 * 处理外交协议倒计时
 *
 * 每回合递减所有外交协议的 duration，过期则移除。
 */
function processDiplomacyAgreements(world: WorldState) {
  if (!world.feedback.diplomacyAgreements) {
    world.feedback.diplomacyAgreements = []
    return
  }
  for (const agreement of world.feedback.diplomacyAgreements) {
    agreement.duration -= 1
  }
  world.feedback.diplomacyAgreements = world.feedback.diplomacyAgreements.filter(a => a.duration > 0)
}

/**
 * 检查两个势力之间是否存在有效的停战/同盟协议
 */
function hasCeasefireOrAlliance(world: WorldState, factionA: string, factionB: string): boolean {
  if (!world.feedback.diplomacyAgreements) return false
  return world.feedback.diplomacyAgreements.some(
    a => (a.type === 'ceasefire' || a.type === 'alliance') &&
      a.duration > 0 &&
      a.parties.includes(factionA) &&
      a.parties.includes(factionB),
  )
}

export function advanceTick(world: WorldState): WorldState {
  const nextWorld = shallowCloneWorld(world)
  const tickHighlights: ReplayHighlight[] = []
  nextWorld.tick += 1

  // Phase 1B 性能优化：一次扫描完成食物收入计算 + 单位分组（O(n+u) 替换 O(n×f + u×f)）
  const factionFoodIncomes = computeAllFactionFoodIncomes(nextWorld.map.tiles)
  const unitsByFaction = buildUnitsByFaction(nextWorld.units)
  // Phase 2 优化：一次扫描按 owner 分组地块，避免 calculateFactionDevelopmentGain 的 O(2n)
  const tilePartition = partitionTiles(nextWorld.map.tiles)
  // Phase 2 优化：一次扫描预计算全图高压对立地块数，避免 resolveNeededArchetype 的 O(n)
  let globalHostilePressureCount = 0
  for (const tile of nextWorld.map.tiles) {
    if (tile.enemyPressure >= 3) globalHostilePressureCount++
  }

  // Per-faction: food income, AP recovery, unit supply, development
  for (const [factionId, faction] of Object.entries(nextWorld.factions)) {
    const incomeFood = factionFoodIncomes.get(factionId) ?? 0
    faction.actionPoints = Math.min(8, faction.actionPoints + 3)
    faction.food += incomeFood

    // 粮草维护消耗：每支在编部队每 tick 消耗 2 粮草
    // 规模压力：部队多→消耗大→逼迫持续扩张领地，防止无限屯兵
    const unitCount = (unitsByFaction.get(factionId) ?? []).length
    faction.food = Math.max(0, faction.food - unitCount * 2)

    // 四资源经济：木材/石料/铁矿 每 tick 收入（使用 resources.ts 产出表）
    const ownedTiles = tilePartition.byOwner.get(factionId) ?? []
    const extraIncome = computeResourceIncome(
      ownedTiles.map((t) => ({ type: t.type, cityLevel: t.cityLevel, resourceKind: t.resourceKind })),
    )
    // 仅取 wood/stone/iron（food 仍由 computeAllFactionFoodIncomes 主导，保持现有平衡）
    faction.wood = (faction.wood ?? 0) + extraIncome.wood
    faction.stone = (faction.stone ?? 0) + extraIncome.stone
    faction.iron = (faction.iron ?? 0) + extraIncome.iron

    for (const unit of unitsByFaction.get(factionId) ?? []) {
      unit.supply = Math.min(9, unit.supply + 1)
      // 战备度每 tick 恢复 5 点（完整恢复需 20 tick）
      unit.corps.readiness = Math.min(100, unit.corps.readiness + 5)
      // 行动完成后回到待命状态（行军中/侦察中/支援中/占领中均为短周期任务）
      if (unit.status === '行军中' || unit.status === '侦察中' || unit.status === '支援中' || unit.status === '占领中') {
        unit.status = '待命'
      }
    }

    processFactionHeroDevelopment(nextWorld, factionId, tickHighlights, tilePartition, unitsByFaction, globalHostilePressureCount)
  }

  const quotaSyncResults = syncAllFactionAiQuota(nextWorld)
  for (const result of quotaSyncResults) {
    if (result.currentQuota <= result.previousQuota) {
      continue
    }
    prependReport(
      nextWorld,
      nextWorld.tick,
      'AI 协作配额扩容',
      `${result.factionId} 协作席位从 ${result.previousQuota} 扩容到 ${result.currentQuota}（拉锯强度 ${result.tugIntensity}，成长分 ${result.growthScore}）。`,
    )
    const quotaAnchorUnit = nextWorld.units.find((unit) => unit.faction === result.factionId)
    tickHighlights.push(
      createReplayHighlight(
        nextWorld.tick,
        'planning',
        'medium',
        'AI 协作席位提升',
        `${result.factionId} 本回合解锁新 AI 协作位（${result.currentQuota}/10）。`,
        {
          unitId: quotaAnchorUnit?.id,
          tileId: quotaAnchorUnit?.tileId,
          factionId: result.factionId,
        },
      ),
    )
  }

  // Phase 2: 自动领土扩张（全势力飞地共享边界BFS，30格铺路+15格开荒/单位）
  processAutoExpansion(nextWorld, unitsByFaction, tickHighlights)

  // Phase 2.5: 自动征兵（滚雪球核心：领地→粮食→征兵→更快扩张→更快接触）
  processRecruitment(nextWorld, unitsByFaction)

  // Phase 3: 自动武将升级 — 每势力 1 队 +5 级
  processAutoLevelUp(nextWorld, unitsByFaction, tickHighlights)

  // Phase 4: 外交协议倒计时
  processDiplomacyAgreements(nextWorld)

  applyTacticalOverrides(nextWorld, tickHighlights)

  // Process executions for ALL factions
  for (const factionId of Object.keys(nextWorld.factions)) {
    processExecutionForFaction(nextWorld, factionId, tickHighlights)
  }

  // Post-execution status normalization: completeOrder sets transient statuses
  // ('占领中','行军中' etc.) during execution — reset them so units are available
  // for next tick's planning (guardPlan only allows '待命'/'驻防中')
  for (const unit of nextWorld.units) {
    if (unit.status === '行军中' || unit.status === '侦察中' || unit.status === '支援中' || unit.status === '占领中') {
      unit.status = '待命'
    }
  }

  const primaryFactionId = resolveFallbackFactionId(nextWorld)
  const primaryOpposingFactionId = resolvePrimaryOpposingFactionId(nextWorld, primaryFactionId)
  const allianceActions = runAllianceDirector(nextWorld, primaryFactionId)
  if (allianceActions.length > 0) {
    prependReport(
      nextWorld,
      nextWorld.tick,
      '同盟独立行动',
      allianceActions.map((action) => action.detail).join('；'),
    )
    tickHighlights.push(
      createReplayHighlight(
        nextWorld.tick,
        'alliance_turn',
        'medium',
        '同盟行动摘要',
        allianceActions.map((action) => action.detail).join('；'),
        {
          unitId: allianceActions[0]?.unitId,
          tileId: allianceActions[0]?.tileId
            ?? nextWorld.map.regions.find((region) => region.id === allianceActions[0]?.regionId)?.centerTileId,
          fromTileId: allianceActions[0]?.fromTileId,
          toTileId: allianceActions[0]?.toTileId ?? allianceActions[0]?.tileId,
          factionId: allianceActions[0]?.factionId ?? primaryFactionId,
        },
      ),
    )
  }

  const opposingResult = runOpposingDirectorDetailed(nextWorld, {
    defenderFactionId: primaryOpposingFactionId,
    targetFactionId: primaryFactionId,
  })
  const opposingActions = opposingResult.actions
  if (opposingActions.length > 0) {
    prependReport(
      nextWorld,
      nextWorld.tick,
      '对立势力规则 AI 行动',
      opposingActions.join('；'),
    )
    tickHighlights.push(
      createReplayHighlight(
        nextWorld.tick,
        'enemy_turn',
        'high',
        '对立势力回合摘要',
        opposingActions.join('；'),
        {
          unitId: opposingResult.traces[0]?.unitId
            ?? nextWorld.units.find((unit) => unit.faction === primaryOpposingFactionId)?.id,
          tileId: opposingResult.traces[0]?.tileId
            ?? nextWorld.units.find((unit) => unit.faction === primaryOpposingFactionId)?.tileId,
          fromTileId: opposingResult.traces[0]?.fromTileId,
          toTileId: opposingResult.traces[0]?.toTileId ?? opposingResult.traces[0]?.tileId,
          factionId: primaryOpposingFactionId,
        },
      ),
    )
  }

  const theaterSnapshot = buildTheaterSnapshot(nextWorld)
  const summaryFaction = nextWorld.factions[primaryFactionId]
  const summaryFoodLabel = summaryFaction ? `${primaryFactionId} 行动点恢复至 ${summaryFaction.actionPoints}` : ''

  prependReport(
    nextWorld,
    nextWorld.tick,
    '时间推进完成',
    `后勤线回补完成，${summaryFoodLabel}，补给线健康度 ${theaterSnapshot.supplyLineHealth}，同盟协同 ${theaterSnapshot.allianceCoordination}，战斗风险 ${theaterSnapshot.battleRisk}。`,
  )
  tickHighlights.push(
    createEngageReplayHighlight(
      nextWorld.tick,
      'logistics',
      'low',
      '后勤回补',
      `补给线健康度 ${theaterSnapshot.supplyLineHealth}，发展能力 ${theaterSnapshot.developmentCapacity}，同盟协同 ${theaterSnapshot.allianceCoordination}，战斗风险 ${theaterSnapshot.battleRisk}。`,
      {
        unitId: nextWorld.units.find((unit) => unit.faction === primaryFactionId)?.id,
        tileId: nextWorld.units.find((unit) => unit.faction === primaryFactionId)?.tileId,
        factionId: primaryFactionId,
      },
    ),
  )

  updateLuoyangHoldCounters(nextWorld)
  processProvincePve(nextWorld, tickHighlights)
  processSiegeDecay(nextWorld, tickHighlights)

  // 城池围攻衰减：若攻城方在目标城池没有驻军则进度清零
  if (nextWorld.citySiegeProgress) {
    for (const key of Object.keys(nextWorld.citySiegeProgress)) {
      // 使用 indexOf 而非 split，防止 tileId 内部含冒号若导致截断
      const colonIdx = key.indexOf(':')
      const besiegerFactionId = key.slice(0, colonIdx)
      const siegeTileId = key.slice(colonIdx + 1)
      const hasBesiegerOnTile = nextWorld.units.some(
        (u) => u.faction === besiegerFactionId && u.tileId === siegeTileId,
      )
      if (!hasBesiegerOnTile) {
        delete nextWorld.citySiegeProgress[key]
      }
    }
  }

  // 情报衰减：confirmed → suspected（8 tick 未刷新）→ unknown（20 tick）
  // 战争迷雾因此真正生效：久未侦察的区域重新变为未知
  const INTEL_DECAY_SUSPECTED = 8
  const INTEL_DECAY_UNKNOWN = 20
  for (const intel of Object.values(nextWorld.intel)) {
    if (!intel.lastScoutedTick) continue
    const age = nextWorld.tick - intel.lastScoutedTick
    if (intel.level === 'confirmed' && age > INTEL_DECAY_SUSPECTED) {
      intel.level = 'suspected'
    } else if (intel.level === 'suspected' && age > INTEL_DECAY_UNKNOWN) {
      intel.level = 'unknown'
    }
  }

  // 胜利条件检测：在每 tick 末尾由规则引擎自主判断，结果写入 feedback
  const victoryResult = checkVictoryConditions(nextWorld)
  if (victoryResult.winner) {
    nextWorld.feedback.gameEnded = {
      winner: victoryResult.winner,
      condition: victoryResult.condition,
      reason: victoryResult.reason,
    }
  }

  bumpWorldVersion(nextWorld)

  // Sync replay for all factions
  for (const factionId of Object.keys(nextWorld.factions)) {
    syncExecutionReplay(nextWorld, factionId, 'Tick 推进', undefined, false, tickHighlights)
  }

  return nextWorld
}

export function summarizeFrontline(world: WorldState, factionId: string = resolveFallbackFactionId(world)) {
  const theater = buildTheaterSnapshot(world, factionId)
  const factionUnits = world.units.filter((unit) => unit.faction === factionId)
  const committedWest = factionUnits.filter((unit) => unit.tileId === 'tile_06').length
  const scoutingNorth = factionUnits.filter((unit) => ['tile_01', 'tile_02', 'tile_03', 'tile_04', 'tile_09'].includes(unit.tileId)).length
  const reserve = factionUnits.filter((unit) => ['tile_08', 'tile_12', 'tile_13'].includes(unit.tileId)).length
  const activeOrders = Object.values(world.executions).reduce((count, exec) =>
    count + (exec?.orders.filter((order) => order.status === 'queued' || order.status === 'running').length ?? 0), 0)
  const frontlinePressure = ['tile_06', 'tile_07', 'tile_09', 'tile_15']
    .map((tileId) => getTileByIdFast(world, tileId)?.enemyPressure ?? 0)
    .reduce((sum, pressure) => sum + pressure, 0)

  return `西侧关口现有 ${committedWest} 支${factionId}队伍接触，北线方向投入 ${scoutingNorth} 支，中军预备队保留 ${reserve} 支。当前资源为 ${world.factions[factionId]?.food ?? 0} 粮草 / ${world.factions[factionId]?.actionPoints ?? 0} 行动点，执行中的 AI 任务 ${activeOrders} 条，前线累计对立压力 ${frontlinePressure}，同盟协同 ${theater.allianceCoordination}，战斗风险 ${theater.battleRisk}。`
}

export function getTileIntel(world: WorldState, tileId: string): TileIntel | undefined {
  return world.intel[tileId]
}

export function canRevealEnemy(world: WorldState, tileId: string) {
  const intel = getTileIntel(world, tileId)
  return intel?.level === 'confirmed'
}

function processFactionHeroDevelopment(
  world: WorldState,
  factionId: string,
  highlights: ReplayHighlight[],
  tilePartition: ReturnType<typeof partitionTiles>,
  unitsByFaction: Map<string, Unit[]>,
  globalHostilePressureCount: number,
) {
  const faction = world.factions[factionId]
  const heroCommand = faction.heroCommand
  const developmentGain = calculateFactionDevelopmentGain(factionId, faction, tilePartition)
  heroCommand.developmentPoints += developmentGain

  const recruitedHeroes: string[] = []
  while (
    heroCommand.prospectHeroIds.length > 0 &&
    heroCommand.developmentPoints >= heroCommand.acquisitionThreshold
  ) {
    heroCommand.developmentPoints -= heroCommand.acquisitionThreshold
    heroCommand.acquisitionThreshold = Math.min(36, heroCommand.acquisitionThreshold + 2)

    const recruitedHeroId = pickNextProspectHeroId(heroCommand)
    if (!recruitedHeroId) {
      break
    }

    heroCommand.rosterHeroIds.push(recruitedHeroId)
    heroCommand.reserveHeroIds.push(recruitedHeroId)
    heroCommand.recentHeroId = recruitedHeroId
    recruitedHeroes.push(getHeroPoolEntryById(recruitedHeroId).name)
  }

  if (recruitedHeroes.length > 0) {
    const factionAnchorUnit = (unitsByFaction.get(factionId) ?? [])[0]
    prependReport(
      world,
      world.tick,
      `${factionId} 发展获得武将`,
      `${factionId} 通过发展补充了 ${recruitedHeroes.join('、')}，已进入 reserve。`,
    )
    highlights.push(
      createReplayHighlight(
        world.tick,
        'planning',
        'medium',
        `${factionId} 新增 reserve 武将`,
        `${recruitedHeroes.join('、')} 已通过发展加入 ${factionId} reserve。`,
        {
          unitId: factionAnchorUnit?.id,
          tileId: factionAnchorUnit?.tileId,
          factionId,
        },
      ),
    )
  }

  autoDeployReserveHero(world, factionId, highlights, unitsByFaction, globalHostilePressureCount)
}

/** Phase 2 优化：使用预分区 O(k) 替代 O(2n) filter */
function calculateFactionDevelopmentGain(
  factionId: string,
  faction: WorldState['factions'][string],
  tilePartition: ReturnType<typeof partitionTiles>,
) {
  const ownedTiles = tilePartition.byOwner.get(factionId) ?? []
  let resourceCount = 0
  let cityCount = 0
  for (const tile of ownedTiles) {
    if (tile.type === 'resource') resourceCount++
    else if (tile.type === 'city') cityCount++
  }
  const foodGain = Math.max(1, Math.round(faction.food / 12))
  return resourceCount * 3 + cityCount * 2 + foodGain
}

function pickNextProspectHeroId(heroCommand: WorldState['factions'][string]['heroCommand']) {
  const sorted = [...heroCommand.prospectHeroIds].sort((leftId, rightId) => {
    const left = getHeroPoolEntryById(leftId)
    const right = getHeroPoolEntryById(rightId)
    const leftScore = left.cost * 10 + (left.quality === '4-SR' ? 20 : left.quality === '3-R' ? 10 : 0)
    const rightScore =
      right.cost * 10 + (right.quality === '4-SR' ? 20 : right.quality === '3-R' ? 10 : 0)
    return rightScore - leftScore
  })

  const pickWindow = heroCommand.heroLuck >= 78 ? 1 : heroCommand.heroLuck >= 70 ? 2 : 3
  const chosen = sorted[Math.min(pickWindow - 1, sorted.length - 1)]
  if (!chosen) {
    return null
  }

  heroCommand.prospectHeroIds = heroCommand.prospectHeroIds.filter((heroId) => heroId !== chosen)
  return chosen
}

function autoDeployReserveHero(
  world: WorldState,
  factionId: string,
  highlights: ReplayHighlight[],
  unitsByFaction: Map<string, Unit[]>,
  globalHostilePressureCount: number,
) {
  const faction = world.factions[factionId]
  const heroCommand = faction.heroCommand
  const deployedUnits = unitsByFaction.get(factionId) ?? []
  if (
    heroCommand.reserveHeroIds.length === 0 ||
    deployedUnits.length >= heroCommand.commandLimit ||
    faction.food < 3
  ) {
    return
  }

  const nextHeroId = pickReserveHeroForDeployment(world, factionId, unitsByFaction, globalHostilePressureCount)
  if (!nextHeroId) {
    return
  }

  heroCommand.reserveHeroIds = heroCommand.reserveHeroIds.filter((heroId) => heroId !== nextHeroId)
  const spawnedUnit = createReserveUnit(world, factionId, nextHeroId)
  world.units.push(spawnedUnit)
  faction.food = Math.max(0, faction.food - 3)

  prependReport(
    world,
    world.tick,
    `${factionId} reserve 编组完成`,
    `${spawnedUnit.hero.name} 已从 reserve 编入 ${spawnedUnit.corps.name}，在 ${getTileById(world, spawnedUnit.tileId)?.name ?? spawnedUnit.tileId} 待命。`,
  )
  highlights.push(
    createReplayHighlight(
      world.tick,
      'planning',
      'high',
      `${factionId} 新增执行单元`,
      `${spawnedUnit.hero.name} 已完成编组并进入地图。`,
      {
        unitId: spawnedUnit.id,
        tileId: spawnedUnit.tileId,
        factionId,
      },
    ),
  )
}

function pickReserveHeroForDeployment(
  world: WorldState,
  factionId: string,
  unitsByFaction: Map<string, Unit[]>,
  globalHostilePressureCount: number,
) {
  const reserveHeroIds = world.factions[factionId].heroCommand.reserveHeroIds
  if (reserveHeroIds.length === 0) {
    return null
  }

  const currentUnits = unitsByFaction.get(factionId) ?? []
  const neededArchetype = resolveNeededArchetype(world, factionId, currentUnits, globalHostilePressureCount)
  const preferred = reserveHeroIds.find(
    (heroId) => getHeroPoolEntryById(heroId).archetype === neededArchetype,
  )
  return preferred ?? reserveHeroIds[0]
}

function resolveNeededArchetype(
  world: WorldState,
  factionId: string,
  currentUnits: Unit[],
  globalHostilePressureCount: number,
) {
  const counts = currentUnits.reduce<Record<Unit['hero']['archetype'], number>>(
    (accumulator, unit) => {
      accumulator[unit.hero.archetype] += 1
      return accumulator
    },
    {
      assault: 0,
      recon: 0,
      guard: 0,
      mobile: 0,
      heavy: 0,
      logistics: 0,
      reserve: 0,
    },
  )

  if (counts.logistics === 0) {
    return 'logistics'
  }

  // Phase 2 优化：使用 advanceTick 预计算的高压地块数，替代 O(n) 全图扫描
  if (globalHostilePressureCount >= 3 && counts.heavy <= counts.mobile) {
    return 'heavy'
  }

  if (counts.recon === 0 || world.map.tiles.some((tile) => tile.owner !== factionId && world.intel[tile.id]?.level === 'unknown')) {
    return 'recon'
  }

  const factionPressure = world.map.tiles.filter((tile) => tile.owner === factionId && tile.enemyPressure >= 3).length
  return factionPressure >= 3 ? 'guard' : 'mobile'
}

function createReserveUnit(
  world: WorldState,
  factionId: string,
  heroId: string,
  spawnTileId = world.factions[factionId].heroCommand.homeTileId,
  deploymentMode: 'auto' | 'manual' = 'auto',
): Unit {
  const heroEntry = getHeroPoolEntryById(heroId)
  const index = world.units.filter((unit) => unit.faction === factionId).length + 1
  const archetype = heroEntry.archetype
  const troopType =
    heroEntry.troopType === 'mixed' && (archetype === 'guard' || archetype === 'heavy')
      ? 'shield'
      : heroEntry.troopType

  return {
    id: `u_${factionId}_${world.tick}_${index}_${heroId}`,
    name: `${heroEntry.name}所部`,
    faction: factionId,
    corps: {
      name: buildCorpsName(heroEntry.name, factionId, archetype),
      doctrine: buildCorpsDoctrine(archetype, factionId),
      specialty: buildCorpsSpecialty(archetype),
      readiness: Math.min(100, 68 + Math.round(heroEntry.cost * 6)),
      roster: buildCorpsRoster(heroEntry.name, archetype),
    },
    hero: buildHeroProfileFromPoolId(heroId, {
      archetype,
      troopType,
      title: buildReserveHeroTitle(archetype, factionId),
      level: 18 + Math.round(heroEntry.cost * 2),
      growthFocus:
        deploymentMode === 'manual'
          ? '由玩家指定支点完成编组，可直接接入战术模板与 AI 指挥链。'
          : '通过发展进入战区，可继续在 AI 指挥链中成长。',
      traits: heroEntry.tags,
    }),
    tileId: spawnTileId,
    strength: 58 + Math.round(heroEntry.cost * 8),
    mobility: archetype === 'mobile' || archetype === 'recon' ? 3 : archetype === 'heavy' ? 1 : 2,
    supply: archetype === 'logistics' ? 8 : 6,
    status: '待命',
    currentTask:
      deploymentMode === 'manual'
        ? `由玩家指定支点编组进入 ${getTileById(world, spawnTileId)?.name ?? spawnTileId}`
        : `由 reserve 编组进入 ${getTileById(world, spawnTileId)?.name ?? spawnTileId}`,
  }
}

function buildCorpsName(heroName: string, factionId: string, archetype: Unit['hero']['archetype']) {
  const suffix =
    archetype === 'assault'
      ? '突击营'
      : archetype === 'recon'
        ? '游骑营'
        : archetype === 'guard'
          ? '守备营'
          : archetype === 'mobile'
            ? '机动营'
            : archetype === 'heavy'
              ? '重锋营'
              : archetype === 'logistics'
                ? '辎运营'
                : '预备营'
  return `军团${abbreviateFactionId(factionId)}·${heroName}${suffix}`
}

function buildCorpsDoctrine(archetype: Unit['hero']['archetype'], factionId: string) {
  const direction = `将 ${resolveFactionDisplayLabel(factionId)} 的发展成果转成可调度执行单元。`
  switch (archetype) {
    case 'assault':
      return `抢节奏、打先手，${direction}`
    case 'recon':
      return `先摸清局势和路径，再决定接敌强度。${direction}`
    case 'guard':
      return `稳住支点和补给入口，避免阵线塌陷。${direction}`
    case 'mobile':
      return `优先补位和转场，随时插向薄弱点。${direction}`
    case 'heavy':
      return `做决定性正面压制，不做无意义来回。${direction}`
    case 'logistics':
      return `优先保补给和恢复，让主力能继续推进。${direction}`
    case 'reserve':
      return `保持待机，准备接任何空缺或战损轮换。${direction}`
  }
}

function buildCorpsSpecialty(archetype: Unit['hero']['archetype']) {
  switch (archetype) {
    case 'assault':
      return '前线突破'
    case 'recon':
      return '视野侦察'
    case 'guard':
      return '驻点守备'
    case 'mobile':
      return '快速策应'
    case 'heavy':
      return '正面压制'
    case 'logistics':
      return '补给维护'
    case 'reserve':
      return '轮换预备'
  }
}

function buildCorpsRoster(heroName: string, archetype: Unit['hero']['archetype']) {
  const roleRoster =
    archetype === 'assault'
      ? ['突前兵', '冲阵手', '破障兵']
      : archetype === 'recon'
        ? ['轻骑斥候', '信标手', '探路队']
        : archetype === 'guard'
          ? ['盾列守军', '城防班', '援护兵']
          : archetype === 'mobile'
            ? ['机动步队', '侧翼护送', '快速补位队']
            : archetype === 'heavy'
              ? ['重步列阵', '压阵亲卫', '破甲手']
              : archetype === 'logistics'
                ? ['辎车列', '补给兵', '修缮班']
                : ['预备兵', '整编队', '接应兵']
  return [heroName, ...roleRoster].slice(0, 3)
}

function buildReserveHeroTitle(archetype: Unit['hero']['archetype'], factionId: string) {
  const prefix = `${abbreviateFactionId(factionId)}编`
  switch (archetype) {
    case 'assault':
      return `${prefix}突击将`
    case 'recon':
      return `${prefix}侦察使`
    case 'guard':
      return `${prefix}镇守将`
    case 'mobile':
      return `${prefix}机动将`
    case 'heavy':
      return `${prefix}重锋将`
    case 'logistics':
      return `${prefix}军资使`
    case 'reserve':
      return `${prefix}预备将`
  }
}

function applyTacticalOverrides(world: WorldState, highlights: ReplayHighlight[]) {
  const queuedOverrides = world.tacticalOverrides.filter((override) => override.status === 'queued')
  if (queuedOverrides.length === 0) {
    return
  }

  const queuedByFaction = new Map<string, TacticalOverride[]>()
  for (const override of queuedOverrides) {
    const overrideFactionId = resolveTacticalOverrideFactionId(world, override)
    if (!overrideFactionId) {
      override.status = 'failed'
      override.lastMessage = '无法识别所属势力，战术插令已标记失败。'
      continue
    }
    const queue = queuedByFaction.get(overrideFactionId) ?? []
    queue.push(override)
    queuedByFaction.set(overrideFactionId, queue)
  }

  for (const [factionId, factionOverrides] of queuedByFaction.entries()) {
    const factionLabel = resolveFactionDisplayLabel(factionId)
    const factionExec = getExecution(world, factionId)
    if (factionExec) {
      const injectedOrders = materializeQueuedTacticalOrders(
        world,
        factionExec.requestId,
        factionExec.basedOnWorldVersion,
        factionId,
      )
      if (injectedOrders.length === 0) {
        continue
      }

      factionExec.orders = [...injectedOrders, ...factionExec.orders]
      world.executions[factionId] = factionExec
      prependReport(
        world,
        world.tick,
        '战术插令接管优先级',
        `${factionLabel} 插入的 ${injectedOrders.length} 条战术命令已压到当前执行队列前部。`,
      )
      highlights.push(
        createReplayHighlight(
          world.tick,
          'planning',
          'medium',
          '战术插令并入当前计划',
          `${factionLabel} 本回合新增 ${injectedOrders.length} 条战术动作，优先于既有任务执行。`,
          {
            unitId: injectedOrders[0]?.unitId,
            tileId: injectedOrders[0]?.target,
            factionId,
          },
        ),
      )
      continue
    }

    const requestId = `tactical_${factionId}_${world.tick}_${world.worldVersion}`
    const tacticalOrders = materializeQueuedTacticalOrders(world, requestId, world.worldVersion, factionId)
    if (tacticalOrders.length === 0) {
      continue
    }

    const tacticalPlan: StrategicPlan = {
      intent: `执行 ${factionLabel} 插入战术命令`,
      priority: 'high',
      orders: tacticalOrders.map((order) => ({
        unitId: order.unitId,
        action: order.action,
        target: order.target,
      })),
      constraints: ['来自战术执行层插令，不改动 planner 主链'],
      reviewAfterTicks: 1,
    }

    world.executions[factionId] = {
      requestId,
      source: 'mock',
      strategicCommand: `${factionLabel} 战术插令`,
      currentPlan: tacticalPlan,
      orders: tacticalOrders,
      reviewAtTick: world.tick + 1,
      basedOnWorldVersion: world.worldVersion,
      plannerNote: '该执行链由战术模板直接注入，没有重新调用 planner。',
      plannerExplanation: 'This execution chain comes from tactical overrides, not a fresh AI plan.',
      planningRationale: ['Prioritize immediate tactical intent', 'Keep the main planner chain unchanged'],
    }

    prependReport(
      world,
      world.tick,
      '战术插令启动执行',
      `${factionLabel} 插入的 ${factionOverrides.length} 条战术命令已单独启动执行链。`,
    )
    highlights.push(
      createReplayHighlight(
        world.tick,
        'planning',
        'medium',
        '战术插令启动',
        `${factionLabel} 在本回合无新计划时，系统已直接执行 ${tacticalOrders.length} 条战术命令。`,
        {
          unitId: tacticalOrders[0]?.unitId,
          tileId: tacticalOrders[0]?.target,
          factionId,
        },
      ),
    )
  }
}

function materializeQueuedTacticalOrders(
  world: WorldState,
  requestId: string,
  basedOnWorldVersion: number,
  factionId: string,
) {
  const queuedOverrides = world.tacticalOverrides.filter(
    (override) =>
      override.status === 'queued' &&
      resolveTacticalOverrideFactionId(world, override) === factionId,
  )

  return queuedOverrides.map((override, index) => {
    const action = mapTemplateToAction(world, override, factionId)
    override.status = 'committed'
    override.committedRequestId = requestId
    override.lastMessage = `已并入 ${requestId}`

    return {
      id: `${requestId}_tactical_${index}`,
      requestId,
      unitId: override.unitId,
      action,
      target: override.targetTileId,
      tacticalOverrideId: override.id,
      status: 'queued',
      summary: override.summary,
      createdTick: world.tick,
      basedOnWorldVersion,
    } satisfies ExecutableOrder
  })
}

function mapTemplateToAction(world: WorldState, override: TacticalOverride, factionId: string): ActionType {
  const targetTile = getTileById(world, override.targetTileId)
  switch (override.templateId) {
    case 'rally':
      return 'march'
    case 'harass':
      return 'recon'
    case 'withdraw':
      return 'march'
    case 'breakthrough':
      return 'capture'
    case 'sweep':
      return targetTile?.owner === factionId ? 'recon' : 'capture'
    case 'garrison':
      return 'garrison'
  }
}

function resolveTacticalOverrideFactionId(world: WorldState, override: TacticalOverride): string | null {
  const unit = getUnitById(world, override.unitId)
  return unit?.faction ?? null
}

function processExecutionForFaction(world: WorldState, factionId: string, highlights: ReplayHighlight[]) {
  const execution = getExecution(world, factionId)
  if (!execution) {
    return
  }

  execution.lastError = undefined

  for (let index = 0; index < execution.orders.length; index += 1) {
    const order = execution.orders[index]
    if (order.status === 'completed' || order.status === 'failed') {
      continue
    }

    const previousBlockingOrder = execution.orders.find(
      (candidate, candidateIndex) =>
        candidateIndex < index &&
        candidate.unitId === order.unitId &&
        candidate.status !== 'completed' &&
        candidate.status !== 'failed',
    )

    if (previousBlockingOrder) {
      continue
    }

    executeOrderStep(world, factionId, order, highlights)
  }

  if (execution && world.tick >= execution.reviewAtTick && !hasActiveOrders(world, factionId)) {
    prependReport(
      world,
      world.tick,
      '计划执行窗口结束',
      '当前计划已达到复盘时点，可根据最新局势继续下达下一条战略命令。',
    )
    highlights.push(
      createReplayHighlight(
        world.tick,
        'planning',
        'medium',
        '计划进入复盘窗口',
        '当前计划已达到复盘时点，可根据最新局势继续下达下一条战略命令。',
        {
          unitId: execution.orders[0]?.unitId,
          tileId: execution.orders[0]?.target,
          factionId,
        },
      ),
    )
  }
}

function executeOrderStep(world: WorldState, factionId: string, order: ExecutableOrder, highlights: ReplayHighlight[]) {
  const unit = getUnitById(world, order.unitId)
  const targetTile = getTileById(world, order.target)

  if (!unit || !targetTile) {
    failOrder(world, factionId, order, '任务引用的单位或地块不存在。')
    return
  }

  if (unit.faction !== factionId) {
    failOrder(world, factionId, order, 'order unit does not belong to executing faction.')
    return
  }

  if (order.status === 'queued') {
    order.status = 'running'
    order.startedTick = world.tick
    // ── 命令启动时消耗 1 行动点（不再按步计费，让兵种速度成为唯一限制）──
    if (!spendFactionResources(world, factionId, 1, 0)) {
      order.status = 'queued'
      order.lastMessage = '等待行动点...'
      return
    }
  }

  if (unit.tileId !== targetTile.id) {
    // ── 多步行军：骑兵 150格/回合，步兵 100格/回合（一次BFS计算路径，沿路走走完）──
    const isMarchOrder = order.action === 'march' || order.action === 'capture'
    const stepsThisTick = isMarchOrder ? getMarchSteps(unit) : 1

    // 一次 BFS 算出完整路径，避免每步重算路径（性能关键）
    const fullPath = getFullPath(world, unit.tileId, targetTile.id)
    if (fullPath.length === 0) {
      failOrder(world, factionId, order, `${unit.name} 无法抵达 ${targetTile.name}。`)
      return
    }

    if (stepsThisTick === 1) {
      // 原有逻辑：走一步
      const nextStep = fullPath[0]
      const nextTile = getTileById(world, nextStep)
      if (!nextTile) {
        failOrder(world, factionId, order, `${unit.name} 的路径节点不存在。`)
        return
      }
      const blockedReason = getEntryBlockReason(world, unit, nextTile, order.action)
      if (blockedReason) {
        failOrder(world, factionId, order, blockedReason)
        return
      }
      const originTileId = unit.tileId
      unit.tileId = nextTile.id
      unit.supply = Math.max(0, unit.supply - 1)
      unit.status = '行军中'
      unit.currentTask = `${actionLabel(order.action)} ${targetTile.name}`
      order.lastMessage = `${unit.name} 向 ${targetTile.name} 行军`
      const battleMessage = resolveBattleAtTile(world, unit, nextTile, originTileId, highlights)
      if (battleMessage) {
        order.lastMessage = battleMessage
        if (unit.tileId !== nextTile.id) {
          order.status = 'failed'
          order.completedTick = world.tick
          order.error = battleMessage
          const factionExec = getExecution(world, factionId)
          if (factionExec) factionExec.lastError = battleMessage
        }
      }
    } else {
      // 多步行军：沿预算路径走 stepsThisTick 步（一次 BFS，不重算）
      prependReport(
        world,
        world.tick,
        '急行军',
        `${unit.name} 以 ${stepsThisTick}格/回合速度（${unit.hero.troopType}）向 ${targetTile.name} 急行军。`,
      )
      for (let step = 0; step < stepsThisTick && step < fullPath.length; step++) {
        if (unit.tileId === targetTile.id) break

        const nextStep = fullPath[step]
        const nextTile = getTileById(world, nextStep)
        if (!nextTile) return

        const blockedReason = getEntryBlockReason(world, unit, nextTile, order.action)
        if (blockedReason) return

        const originTileId = unit.tileId
        unit.tileId = nextTile.id
        // 急行军补给消耗极低（每 100 步 -1），不阻断长途进军
        if (step % 100 === 0 && step > 0) unit.supply = Math.max(0, unit.supply - 1)
        unit.status = '行军中'
        unit.currentTask = `${actionLabel(order.action)} ${targetTile.name}`
        order.lastMessage = `${unit.name} 向 ${targetTile.name} 急行军`

        const battleMessage = resolveBattleAtTile(world, unit, nextTile, originTileId, highlights)
        if (battleMessage) {
          order.lastMessage = battleMessage
          if (unit.tileId !== nextTile.id) {
            order.status = 'failed'
            order.completedTick = world.tick
            order.error = battleMessage
            const factionExec = getExecution(world, factionId)
            if (factionExec) factionExec.lastError = battleMessage
          }
          return // 遭遇战：中止本回合急行军
        }
      }
    }

    if (unit.tileId !== targetTile.id) {
      return
    }
  }

  resolveActionAtTarget(world, unit, targetTile, order, highlights)
}

function resolveActionAtTarget(
  world: WorldState,
  unit: Unit,
  targetTile: Tile,
  order: ExecutableOrder,
  highlights: ReplayHighlight[],
) {
  const factionId = unit.faction
  switch (order.action) {
    case 'march':
      completeOrder(world, order, unit, '待命', `抵达${targetTile.name}待命`, `${unit.name} 已抵达 ${targetTile.name}。`)
      return
    case 'capture': {
      if (hasHostileUnit(world, targetTile.id, factionId)) {
        failOrder(world, factionId, order, `${targetTile.name} 敌情仍在，当前不具备安全占领条件。`)
        return
      }

      // Luoyang siege mechanic: requires LUOYANG_SIEGE_TICKS_REQUIRED consecutive capture ticks
      if (isLuoyangTile(targetTile) && targetTile.owner !== factionId) {
        const siegeTicks = getAndIncrementSiegeProgress(world, factionId)
        if (siegeTicks < LUOYANG_SIEGE_TICKS_REQUIRED) {
          completeOrder(
            world,
            order,
            unit,
            '占领中',
            `围困${targetTile.name}(${siegeTicks}/${LUOYANG_SIEGE_TICKS_REQUIRED})`,
            `${unit.name} 正在围攻 ${targetTile.name}（${siegeTicks}/${LUOYANG_SIEGE_TICKS_REQUIRED} 回合），尚需 ${LUOYANG_SIEGE_TICKS_REQUIRED - siegeTicks} 回合完成占领。`,
          )
          return
        }
        // siegeTicks >= required — fall through to complete ownership transfer below
        world.luoyangSiegeProgress = world.luoyangSiegeProgress ?? {}
        delete world.luoyangSiegeProgress[factionId]
      }

      // 非洛阳城池分阶段围攻：高等级城池（cityLevel ≥ 4）需持续多 tick 战领才能完成易主
      if (targetTile.type === 'city' && !isLuoyangTile(targetTile) && targetTile.owner !== factionId) {
        const required = getCityCaptureTicks(targetTile.cityLevel)
        if (required > 1) {
          const key = `${factionId}:${targetTile.id}`
          world.citySiegeProgress = world.citySiegeProgress ?? {}
          const current = (world.citySiegeProgress[key] ?? 0) + 1
          world.citySiegeProgress[key] = current
          if (current < required) {
            completeOrder(
              world, order, unit, '占领中',
              `围攻${targetTile.name}`,
              `${unit.name} 正在围攻 ${targetTile.name}（${current}/${required} 回合），尚需 ${required - current} 回合完成占领。`,
            )
            return
          }
          // current >= required — 完成围攻，清理进度
          delete world.citySiegeProgress[key]
        }
      }

      if (!spendFactionResources(world, factionId, 1, 1)) {
        order.lastMessage = `等待资源以完成对 ${targetTile.name} 的占领`
        return
      }

      const previousOwner = targetTile.owner
      targetTile.owner = factionId
      targetTile.enemyPressure = Math.max(0, targetTile.enemyPressure - 1)
      if (previousOwner !== factionId) {
        highlights.push(
          createEngageReplayHighlight(
            world.tick,
            'tile_control',
            tileControlSeverity(targetTile.type),
            `控制权变更：${targetTile.name}`,
            `${unit.name} 已将 ${targetTile.name} 从${ownerLabel(previousOwner)}转入 ${factionId} 控制。`,
            {
              unitId: unit.id,
              tileId: targetTile.id,
              factionId,
            },
          ),
        )
      }
      completeOrder(world, order, unit, '占领中', `控制${targetTile.name}`, `${unit.name} 完成对 ${targetTile.name} 的占领。`)
      return
    }
    case 'garrison': {
      if (hasHostileUnit(world, targetTile.id, factionId)) {
        failOrder(world, factionId, order, `${targetTile.name} 仍属敌占，无法直接驻防。`)
        return
      }

      if (!spendFactionResources(world, factionId, 1, 0)) {
        order.lastMessage = `等待行动点以建立 ${targetTile.name} 驻防`
        return
      }

      const previousOwner = targetTile.owner
      targetTile.owner = factionId
      targetTile.enemyPressure = Math.max(0, targetTile.enemyPressure - 1)
      if (previousOwner !== factionId) {
        highlights.push(
          createEngageReplayHighlight(
            world.tick,
            'tile_control',
            tileControlSeverity(targetTile.type),
            `控制权变更：${targetTile.name}`,
            `${unit.name} 驻防接管 ${targetTile.name}，前线支点已纳入 ${factionId}。`,
            {
              unitId: unit.id,
              tileId: targetTile.id,
              factionId,
            },
          ),
        )
      }
      completeOrder(world, order, unit, '驻防中', `驻防${targetTile.name}`, `${unit.name} 已在 ${targetTile.name} 建立驻防。`)
      return
    }
    case 'recon':
      if (!spendFactionResources(world, factionId, 1, 0)) {
        order.lastMessage = `等待行动点以侦察 ${targetTile.name}`
        return
      }

      revealIntel(
        world,
        targetTile.id,
        'confirmed',
        `侦察确认：${targetTile.name} 对立压力 ${targetTile.enemyPressure}。`,
        highlights,
        {
          unitId: unit.id,
          factionId,
          fromTileId: unit.tileId,
        },
      )
      for (const neighborId of world.map.connections[targetTile.id] ?? []) {
        const intel = world.intel[neighborId]
        if (intel?.level === 'unknown') {
          revealIntel(world, neighborId, 'suspected', `由 ${targetTile.name} 延伸获得轮廓情报。`, highlights, {
            unitId: unit.id,
            factionId,
            fromTileId: targetTile.id,
          })
        }
      }

      completeOrder(world, order, unit, '侦察中', `侦察${targetTile.name}`, `${unit.name} 完成对 ${targetTile.name} 的侦察。`)
      return
    case 'support': {
      if (hasHostileUnit(world, targetTile.id, factionId)) {
        failOrder(world, factionId, order, `${targetTile.name} 不是安全支援点。`)
        return
      }

      if (!spendFactionResources(world, factionId, 1, 1)) {
        order.lastMessage = `等待资源以完成对 ${targetTile.name} 的支援`
        return
      }

      const friendlyUnits = world.units.filter(
        (candidate) => candidate.faction === factionId && candidate.tileId === targetTile.id,
      )

      for (const ally of friendlyUnits) {
        ally.supply = Math.min(9, ally.supply + 1)
        if (ally.id !== unit.id) {
          ally.strength = Math.min(100, ally.strength + 6)
        }
      }

      targetTile.enemyPressure = Math.max(0, targetTile.enemyPressure - 1)
      highlights.push(
        createEngageReplayHighlight(
          world.tick,
          'logistics',
          'medium',
          `战备支援：${targetTile.name}`,
          `${unit.name} 为 ${friendlyUnits.length} 支友军补充补给与战备。`,
          {
            unitId: unit.id,
            tileId: targetTile.id,
            factionId,
          },
        ),
      )
      completeOrder(world, order, unit, '支援中', `支援${targetTile.name}`, `${unit.name} 已为 ${targetTile.name} 的友军补充战备。`)
      return
    }
  }
}

function completeOrder(
  world: WorldState,
  order: ExecutableOrder,
  unit: Unit,
  status: UnitStatus,
  task: string,
  detail: string,
) {
  unit.status = status
  unit.currentTask = task
  order.status = 'completed'
  order.completedTick = world.tick
  order.lastMessage = detail
  syncTacticalOverrideStatus(world, order, 'completed', detail)
  prependReport(world, world.tick, `${actionLabel(order.action)}完成`, detail)
}

function failOrder(world: WorldState, factionId: string, order: ExecutableOrder, message: string) {
  order.status = 'failed'
  order.completedTick = world.tick
  order.error = message
  syncTacticalOverrideStatus(world, order, 'failed', message)
  const factionExec = getExecution(world, factionId)
  if (factionExec) {
    factionExec.lastError = message
  }
  prependReport(world, world.tick, '任务执行受阻', message)
}

/**
 * BFS 计算完整路径（从 from → to，返回路径节点列表，不含起点）
 * 用于多步行军：只调用一次 BFS，沿返回路径走，避免每步重算（O(n) × 150步 → O(n) × 1次）
 *
 * 性能关键：用 head 指针代替 queue.shift()，避免 O(n) 移位；用 push+reverse 代替 unshift 重建路径。
 */
/**
 * 从 fromTileId 到 toTileId 的完整路径。
 *
 * 性能优化：地图已在 buildMultiFactionWorld 中清除全部地形/区划障碍（mountain→grassland，
 * connections 重建为纯四向网格），故可用 O(W+H) 坐标贪心替代 O(W×H) BFS。
 *
 * 贪心策略：每步选择曼哈顿距离最小的邻居，在无障碍网格上保证最短路径。
 * 与 BFS 相比：路径质量相同，速度提升 ~160× （320×320 地图上 640 步 vs. 102,400 步）。
 */
function getFullPath(world: WorldState, fromTileId: string, toTileId: string): string[] {
  if (fromTileId === toTileId) return []

  // 优先使用 HPA* 层级 A* 寻路
  try {
    const result = hpaStarFindPath(world, fromTileId, toTileId)
    if (result.found && result.tileIds.length > 1) {
      // hpaStar 返回含起点的路径，去掉起点以匹配原始接口
      return result.tileIds.slice(1)
    }
  } catch {
    // HPA* 失败时降级到贪心
  }

  // 贪心降级：坐标下降法（原始实现）
  const toTile = getTileByIdFast(world, toTileId)
  if (!toTile) return []

  const tx = toTile.x
  const ty = toTile.y
  const path: string[] = []
  const visited = new Set<string>([fromTileId])
  let curId = fromTileId

  const mapW = world.map.width ?? 320
  const mapH = Math.ceil(world.map.tiles.length / mapW)
  const maxIter = (mapW + mapH) * 2 + 50

  for (let i = 0; i < maxIter; i++) {
    if (curId === toTileId) return path

    const neighbors = world.map.connections[curId] ?? []
    let bestId: string | null = null
    let bestDist = Infinity

    for (const nId of neighbors) {
      if (visited.has(nId)) continue
      const nTile = getTileByIdFast(world, nId)
      if (!nTile) continue
      const dist = Math.abs(nTile.x - tx) + Math.abs(nTile.y - ty)
      if (dist < bestDist) {
        bestDist = dist
        bestId = nId
      }
    }

    if (!bestId) {
      const fallback = neighbors.find(n => !visited.has(n))
      if (!fallback) break
      bestId = fallback
    }

    visited.add(bestId)
    path.push(bestId)
    curId = bestId
  }

  return path
}

function getEntryBlockReason(world: WorldState, unit: Unit, tile: Tile, action: ActionType) {
  const currentTile = getTileById(world, unit.tileId)
  const passControlBlockReason = resolvePassControlBlockReason(unit, currentTile, tile)
  if (passControlBlockReason) {
    return passControlBlockReason
  }

  const terrainConstraintBlockReason = resolveTerrainConstraintBlockReason(currentTile, tile, action)
  if (terrainConstraintBlockReason) {
    return terrainConstraintBlockReason
  }

  if (action === 'support' && tile.owner !== 'neutral' && tile.owner !== unit.faction) {
    return `${tile.name} 为对立势力地块，支援命令不能直接进入。`
  }

  if (
    action === 'support' &&
    world.units.some((candidate) => candidate.faction !== unit.faction && candidate.tileId === tile.id)
  ) {
    return `${tile.name} 存在对立单位，支援命令不能直接进入。`
  }

  // ── 外交停战协议约束：不能进攻有停战/同盟协议的势力领土 ──
  if (tile.owner !== 'neutral' && tile.owner !== unit.faction) {
    if (hasCeasefireOrAlliance(world, unit.faction, tile.owner)) {
      if (action === 'capture' || action === 'march') {
        return `与 ${tile.owner} 存在停战协议，不能对其发起进攻行动。违约需先废除协议。`
      }
    }
  }

  return null
}

function resolvePassControlBlockReason(unit: Unit, fromTile: Tile | undefined, toTile: Tile) {
  if (!fromTile?.district || !toTile.district || fromTile.district === toTile.district) {
    return null
  }

  if (toTile.type === 'pass') {
    return null
  }

  if (fromTile.type !== 'pass') {
    return `跨州推进需先攻占关口，无法直接进入 ${toTile.name}。`
  }

  if (fromTile.owner !== unit.faction) {
    return `关口 ${fromTile.name} 未被我方控制，无法向 ${toTile.name} 推进。`
  }

  return null
}

function resolveTerrainConstraintBlockReason(
  fromTile: Tile | undefined,
  toTile: Tile,
  action: ActionType,
) {
  if (!fromTile) {
    return null
  }

  if (toTile.terrain === 'mountain' && toTile.type !== 'pass' && action !== 'recon') {
    return `${toTile.name} 为险峻山地，必须通过关口才能大规模通行。`
  }

  const crossingRiverBand = fromTile.terrain !== 'riverland' && toTile.terrain === 'riverland'
  if (crossingRiverBand && toTile.type !== 'pass' && toTile.type !== 'city') {
    return `${toTile.name} 位于河流阻隔带，需先控制渡口城池或关口后再推进。`
  }

  return null
}

function resolveMarchResourceCost(fromTile: Tile | undefined, toTile: Tile) {
  let actionPoints = toTile.moveCost
  let food = 1

  if (toTile.terrain === 'mountain') {
    actionPoints += 1
    food += 1
  }

  const crossingRiverBand = fromTile?.terrain !== 'riverland' && toTile.terrain === 'riverland'
  if (crossingRiverBand) {
    actionPoints += 1
    food += 1
  }

  if (toTile.type === 'pass') {
    actionPoints += 1
  }

  return {
    actionPoints,
    food,
  }
}

function resolveBattleAtTile(
  world: WorldState,
  attacker: Unit,
  tile: Tile,
  originTileId: string,
  highlights: ReplayHighlight[],
) {
  const defenders = world.units.filter(
    (candidate) => candidate.faction !== attacker.faction && candidate.tileId === tile.id,
  )

  if (defenders.length === 0) {
    return null
  }

  // 外交协议检查：如果所有防守方都与攻击方有停战/同盟协议，跳过战斗
  const hostileDefenders = defenders.filter(
    d => !hasCeasefireOrAlliance(world, attacker.faction, d.faction),
  )
  if (hostileDefenders.length === 0) {
    return null
  }

  attacker.status = '交战中'
  const allianceSupport = getAllianceSupportModifier(world, tile.id, attacker.faction)

  // 武将五维属性加成（force/command/intelligence/charisma/speed 标准值 60，范围 40-98）
  // force（武力）: 直接伤害加成
  const attackerForceBonus = 1 + (attacker.hero.force - 60) * 0.005
  // command（统率）: 提升兵力发挥效率
  const attackerCommandBonus = 1 + (attacker.hero.command - 60) * 0.004
  // speed（机动）: 提升机动力贡献
  const attackerSpeedBonus = 1 + (attacker.hero.speed - 60) * 0.006

  // coHeroes 副英雄战力加成：三武将编队每位副将贡献 30% 战力
  // 让 coHeroes 数据结构真正发挥作用，SSR 编队 vs 单将有明显差距
  const coHeroBonus = (attacker.coHeroes ?? []).reduce((sum, co) => {
    const cof = 1 + (co.force - 60) * 0.005
    const coc = 1 + (co.command - 60) * 0.004
    return sum + attacker.strength * 0.30 * coc * cof
  }, 0)

  // 兵种克制三角：使用 hero.cardType ('步'|'骑'|'弓')
  // 弓克骑(+20%)，骑克步(+15%)，步克弓(+10%)
  const dominantDefenderType = getDominantCardType(hostileDefenders)
  const troopCounterBonus = computeTroopCounter(attacker.hero.cardType, dominantDefenderType)

  // 画集疲劳修正： readiness < 40 时战斗力 -20%
  const attackerReadinessMod = attacker.corps.readiness < 40 ? 0.80 : 1.0

  const attackerPower =
    attacker.strength * (0.74 + attacker.supply * 0.05) * attackerCommandBonus * attackerForceBonus
    + attacker.mobility * 4 * attackerSpeedBonus
    + allianceSupport
    + coHeroBonus

  const attackerEffectivePower = attackerPower * (1 + troopCounterBonus) * attackerReadinessMod

  const defenderPower =
    hostileDefenders.reduce(
      (sum, defender) => {
        const dForceBonus = 1 + (defender.hero.force - 60) * 0.005
        const dCommandBonus = 1 + (defender.hero.command - 60) * 0.004
        const dSpeedBonus = 1 + (defender.hero.speed - 60) * 0.006
        // 防守方疲劳修正
        const dReadinessMod = defender.corps.readiness < 40 ? 0.80 : 1.0
        return sum
          + (defender.strength * (0.74 + defender.supply * 0.04) * dCommandBonus * dForceBonus
          + defender.mobility * 3 * dSpeedBonus) * dReadinessMod
      },
      0,
    ) * terrainDefenseFactor(tile) * getLuoyangDefenseBonus(tile)
  const defenderStrengthBefore = hostileDefenders.reduce((sum, defender) => sum + defender.strength, 0)
  const attackerWon = attackerEffectivePower >= defenderPower * 0.92

  // intelligence（智谋）: 减少己方损失（标准值 60 = 无加减）
  const attackerIntelReduction = 1 - (attacker.hero.intelligence - 60) * 0.005

  const attackerLoss = clampValue(
    Math.round(((attackerWon ? defenderPower / 14 : defenderPower / 9) / Math.max(1, defenders.length)) * attackerIntelReduction),
    8,
    26,
  )
  const defenderLossPool = clampValue(
    Math.round(attackerWon ? attackerEffectivePower / 8 : attackerEffectivePower / 14),
    10,
    42,
  )

  attacker.strength = Math.max(8, attacker.strength - attackerLoss)
  attacker.supply = Math.max(0, attacker.supply - 1)
  // 战斗消耗战备度（连续作战需要轮换休整）
  attacker.corps.readiness = Math.max(0, attacker.corps.readiness - 20)

  const destroyedDefenderNames: string[] = []
  const retreatedDefenderNames: string[] = []
  for (const defender of hostileDefenders) {
    const dIntelReduction = 1 - (defender.hero.intelligence - 60) * 0.005
    const defenderLoss = clampValue(Math.round((defenderLossPool / defenders.length) * dIntelReduction), 6, 26)
    defender.strength = Math.max(0, defender.strength - defenderLoss)
    defender.supply = Math.max(0, defender.supply - 1)
    defender.corps.readiness = Math.max(0, defender.corps.readiness - 20)  // 防守方战斗消耗战备度

    if (attackerWon) {
      if (defender.strength <= 12) {
        destroyedDefenderNames.push(defender.name)
        removeUnit(world, defender.id)
        continue
      }

      const retreatTileId = findRetreatTile(world, defender, tile.id, originTileId)
      if (!retreatTileId) {
        destroyedDefenderNames.push(defender.name)
        removeUnit(world, defender.id)
        continue
      }

      defender.tileId = retreatTileId
      defender.status = '待命'
      defender.currentTask = `从${tile.name}撤退`
      retreatedDefenderNames.push(`${defender.name}→${getTileById(world, retreatTileId)?.name ?? retreatTileId}`)
    } else {
      defender.status = '驻防中'
      defender.currentTask = `坚守${tile.name}`
    }
  }

  if (attackerWon) {
    tile.enemyPressure = Math.max(0, tile.enemyPressure - 2)
    attacker.currentTask = `突破${tile.name}`
  } else {
    attacker.tileId = originTileId
    attacker.status = '待命'
    attacker.currentTask = `自${tile.name}撤回`
    tile.enemyPressure = Math.min(6, tile.enemyPressure + 1)
  }

  const message = attackerWon
    ? `${attacker.name} 在 ${tile.name} 接敌后取胜，损失 ${attackerLoss} 战力。${formatDefenderOutcome(destroyedDefenderNames, retreatedDefenderNames)}`
    : `${attacker.name} 在 ${tile.name} 接敌失利，损失 ${attackerLoss} 战力后撤回 ${getTileById(world, originTileId)?.name ?? originTileId}。`

  recordBattleOutcome(world, {
    id: `battle_${world.tick}_${attacker.id}_${tile.id}`,
    tick: world.tick,
    regionId: getRegionIdForTile(world, tile.id),
    tileId: tile.id,
    attackerFaction: attacker.faction,
    attackerUnitId: attacker.id,
    outcome: attackerWon ? 'win' : 'loss',
    attackerLoss,
    defenderLoss: Math.max(
      0,
      defenderStrengthBefore - defenders.reduce((sum, defender) => sum + defender.strength, 0),
    ),
    alliedSupport: allianceSupport,
    summary: message,
  })

  prependReport(world, world.tick, attackerWon ? '前线接敌取胜' : '前线接敌失利', message)
  highlights.push(
    createEngageReplayHighlight(
      world.tick,
      'battle',
      attackerWon ? 'high' : 'medium',
      attackerWon ? `突破 ${tile.name}` : `${tile.name} 受阻`,
      message,
      {
        unitId: attacker.id,
        tileId: tile.id,
        fromTileId: originTileId,
        toTileId: tile.id,
        factionId: attacker.faction,
      },
    ),
  )

  return message
}

function getAllianceSupportModifier(world: WorldState, tileId: string, faction: Unit['faction']) {
  // 联盟指令仅作用于当前主指挥势力（默认按 world.factions 首位）
  if (faction === resolveFallbackFactionId(world)) {
    const region = world.map.regions.find((candidate) => candidate.tileIds.includes(tileId))
    if (!region) {
      return 0
    }

    const directive = world.alliance.directives[region.id]
    if (!directive) {
      return 0
    }

    const stanceFactor =
      directive.stance === 'support'
        ? 1
        : directive.stance === 'harass'
          ? 0.65
          : directive.stance === 'expand'
            ? 0.8
            : 0.45

    return Math.round((directive.supportLevel / 10) * stanceFactor)
  }

  // B5修复: AI 势力通过 diplomacyAgreements 获取联盟军事支援加成
  if (!world.feedback.diplomacyAgreements?.length) return 0

  const alliedFactions = world.feedback.diplomacyAgreements
    .filter(a => a.type === 'alliance' && a.duration > 0 && a.parties.includes(faction))
    .flatMap(a => a.parties.filter(p => p !== faction))

  if (alliedFactions.length === 0) return 0

  // 搜索战场附近（2格内）的盟友单位并计算支援加成
  const nearbyTileIds = new Set<string>([tileId])
  for (const nId of world.map.connections[tileId] ?? []) {
    nearbyTileIds.add(nId)
    for (const n2Id of world.map.connections[nId] ?? []) {
      nearbyTileIds.add(n2Id)
    }
  }

  let support = 0
  for (const unit of world.units) {
    if (alliedFactions.includes(unit.faction) && nearbyTileIds.has(unit.tileId)) {
      support += Math.round(unit.strength * 0.12)
    }
  }
  return Math.min(support, 25) // 上限 25，避免联盟助攻压倒战斗本体
}

/** 计算防守方中兵力占比最高的 cardType（用于兵种克制判断） */
function getDominantCardType(units: Unit[]): string | null {
  const totals: Record<string, number> = {}
  for (const u of units) {
    const ct = u.hero.cardType ?? ''
    if (!ct) continue
    totals[ct] = (totals[ct] ?? 0) + u.strength
  }
  let best: string | null = null
  let bestVal = 0
  for (const [ct, val] of Object.entries(totals)) {
    if (val > bestVal) { best = ct; bestVal = val }
  }
  return best
}

/** 兵种克制加成（攻击方 cardType vs 防守方主力 cardType）
 *  弓(弓)克骑(骑) +20%，骑(骑)克步(步) +15%，步(步)克弓(弓) +10% */
function computeTroopCounter(attackerType: string | undefined, defenderType: string | null): number {
  if (!attackerType || !defenderType) return 0
  if (attackerType === '弓' && defenderType === '骑') return 0.20
  if (attackerType === '骑' && defenderType === '步') return 0.15
  if (attackerType === '步' && defenderType === '弓') return 0.10
  return 0
}

function abbreviateFactionId(factionId: string) {
  if (!factionId) {
    return 'UNK'
  }
  const compact = factionId.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '')
  if (!compact) {
    return 'UNK'
  }
  return compact.slice(0, 3).toUpperCase()
}

/** 获取城池需要的围攻 tick 数（基于城池等级）*/
function getCityCaptureTicks(cityLevel?: number): number {
  if (!cityLevel || cityLevel <= 3) return 1  // 小城：即刻占领
  if (cityLevel <= 6) return 2               // 中城：需2tick持续围攻
  return 3                                    // 大城：需3tick持续围攻
}

function terrainDefenseFactor(tile: Tile) {
  // 地块类型基础应定能
  let typeFactor: number
  switch (tile.type) {
    case 'pass':     typeFactor = 1.26; break
    case 'city':     typeFactor = 1.22; break
    case 'fog':      typeFactor = 1.14; break
    case 'resource': typeFactor = 1.08; break
    default:         typeFactor = 1.0;  break  // plain & unknown
  }

  // 地形层叠加成（与类型叠加，表现地形对防守的額外加成）
  let terrainFactor = 1.0
  switch (tile.terrain) {
    case 'forest':    terrainFactor = 1.15; break  // 森林掩议，骑兵奮进不便
    case 'highland':  terrainFactor = 1.20; break  // 高地偵隐，兑盘有利
    case 'mountain':  terrainFactor = 1.0;  break  // 山地尅5隅断，已由移动阅知处理
    default:          terrainFactor = 1.0;  break
  }

  return typeFactor * terrainFactor
}

function findRetreatTile(world: WorldState, unit: Unit, contestedTileId: string, blockedTileId: string) {
  return (world.map.connections[contestedTileId] ?? []).find((candidateTileId) => {
    if (candidateTileId === blockedTileId) {
      return false
    }

    const tile = getTileById(world, candidateTileId)
    if (!tile) {
      return false
    }

    const occupiedByEnemy = world.units.some(
      (candidate) => candidate.faction === unit.faction && candidate.tileId === candidateTileId,
    )

    return tile.owner === unit.faction || occupiedByEnemy
  })
}

function removeUnit(world: WorldState, unitId: string) {
  // 单位被消灭时仅移除场上部队实体。
  // 武将卡牌保留在 rosterHeroIds 中，可以重新征兵/升星召回（gacha 机制）。
  world.units = world.units.filter((unit) => unit.id !== unitId)
}

function formatDefenderOutcome(destroyedDefenderNames: string[], retreatedDefenderNames: string[]) {
  const parts: string[] = []

  if (destroyedDefenderNames.length > 0) {
    parts.push(`对立单位溃散 ${destroyedDefenderNames.join('、')}`)
  }

  if (retreatedDefenderNames.length > 0) {
    parts.push(`对立单位撤退 ${retreatedDefenderNames.join('；')}`)
  }

  return parts.join('，')
}

function recordBattleOutcome(world: WorldState, record: BattleOutcomeRecord) {
  world.feedback.battleRecords = [record, ...world.feedback.battleRecords].slice(0, 8)
}

function syncTacticalOverrideStatus(
  world: WorldState,
  order: ExecutableOrder,
  status: TacticalOverride['status'],
  message: string,
) {
  if (!order.tacticalOverrideId) {
    return
  }

  const override = world.tacticalOverrides.find((item) => item.id === order.tacticalOverrideId)
  if (!override) {
    return
  }

  override.status = status
  override.completedTick = world.tick
  override.lastMessage = message
}

function getRegionIdForTile(world: WorldState, tileId: string) {
  return world.map.regions.find((region) => region.tileIds.includes(tileId))?.id ?? 'unknown_region'
}

function resolveCityUpgradeFootprintTileIds(
  world: WorldState,
  hallTile: Tile,
  nextFootprintTiles: 4 | 9,
  existingTileIds: string[],
) {
  const tileByCoord = new Map(world.map.tiles.map((tile) => [`${tile.x},${tile.y}`, tile]))
  const sideLength = Math.round(Math.sqrt(nextFootprintTiles))
  const existingTileIdSet = new Set(existingTileIds)

  const candidateStarts =
    nextFootprintTiles === 4
      ? [
          { x: hallTile.x, y: hallTile.y },
          { x: hallTile.x - 1, y: hallTile.y },
          { x: hallTile.x, y: hallTile.y - 1 },
          { x: hallTile.x - 1, y: hallTile.y - 1 },
        ]
      : [
          { x: hallTile.x - 1, y: hallTile.y - 1 },
          { x: hallTile.x - 1, y: hallTile.y },
          { x: hallTile.x, y: hallTile.y - 1 },
          { x: hallTile.x, y: hallTile.y },
        ]

  let bestTileSet: Tile[] = []
  let bestScore = Number.NEGATIVE_INFINITY

  for (const start of candidateStarts) {
    const set: Tile[] = []
    let valid = true

    for (let localY = 0; localY < sideLength; localY += 1) {
      for (let localX = 0; localX < sideLength; localX += 1) {
        const tile = tileByCoord.get(`${start.x + localX},${start.y + localY}`)
        if (!tile) {
          valid = false
          break
        }
        set.push(tile)
      }

      if (!valid) {
        break
      }
    }

    if (!valid || set.length !== nextFootprintTiles) {
      continue
    }

    const overlapScore = set.reduce((score, tile) => score + (existingTileIdSet.has(tile.id) ? 1 : 0), 0)
    const distanceScore = set.reduce(
      (score, tile) => score - Math.abs(tile.x - hallTile.x) - Math.abs(tile.y - hallTile.y),
      0,
    )
    const score = overlapScore * 100 + distanceScore

    if (score > bestScore) {
      bestScore = score
      bestTileSet = set
    }
  }

  if (bestTileSet.length !== nextFootprintTiles) {
    return []
  }

  return bestTileSet
    .sort((left, right) => {
      if (left.y !== right.y) {
        return left.y - right.y
      }

      if (left.x !== right.x) {
        return left.x - right.x
      }

      return left.id.localeCompare(right.id)
    })
    .map((tile) => tile.id)
}

function resolveCityFootprintTier(footprintTiles: 1 | 4 | 9 | 16) {
  if (footprintTiles === 1) {
    return 'single_1' as const
  }

  if (footprintTiles === 4) {
    return 'small_2x2' as const
  }

  if (footprintTiles === 9) {
    return 'medium_3x3' as const
  }

  return 'mega_4x4' as const
}

// Backward-compatible helper used by city upgrade actions.
function spendResources(world: WorldState, factionId: string, actionPoints: number, food: number) {
  return spendFactionResources(world, factionId, actionPoints, food)
}

function revealIntel(
  world: WorldState,
  tileId: string,
  level: IntelligenceLevel,
  summary: string,
  highlights: ReplayHighlight[],
  context?: {
    unitId?: string
    factionId?: FactionId
    fromTileId?: string
  },
) {
  const previousLevel = world.intel[tileId]?.level ?? 'unknown'
  world.intel[tileId] = {
    level,
    lastScoutedTick: world.tick,
    summary,
  }

  if (level !== previousLevel) {
    const tile = getTileById(world, tileId)
    highlights.push(
      createReplayHighlight(
        world.tick,
        'intel',
        level === 'confirmed' ? 'high' : 'medium',
        `侦察更新：${tile?.name ?? tileId}`,
        summary,
        {
          unitId: context?.unitId,
          tileId,
          fromTileId: context?.fromTileId,
          toTileId: tileId,
          factionId: context?.factionId,
        },
      ),
    )
  }
}

function prependReport(world: WorldState, tick: number, title: string, detail: string) {
  world.reports.unshift({
    id: `${tick}-${title}-${detail}`,
    tick,
    title,
    detail,
  })
  world.reports = world.reports.slice(0, 12)
}

function bumpWorldVersion(world: WorldState) {
  world.worldVersion += 1
}

function upsertPlanningJobHistory(world: WorldState, entry: PlanningJobHistoryEntry) {
  const filtered = world.history.planningJobs.filter((item) => item.id !== entry.id)
  world.history.planningJobs = [entry, ...filtered].slice(0, 12)
}

function syncExecutionReplay(
  world: WorldState,
  factionId: string,
  label: string,
  overrideOutcome?: ExecutionReplayOutcome,
  forceFrame = false,
  highlights: ReplayHighlight[] = [],
) {
  const factionExec = getExecution(world, factionId)
  if (!factionExec) {
    return
  }

  const replay = ensureExecutionReplay(world, factionId)
  const derivedOutcome = overrideOutcome ?? deriveExecutionOutcome(factionExec)
  if (!forceFrame && replay.outcome !== 'running' && derivedOutcome !== 'running') {
    return
  }

  const frame = createExecutionReplayFrame(world, factionId, label, highlights)
  const lastFrame = replay.frames.at(-1)
  const shouldAppend =
    forceFrame ||
    !lastFrame ||
    lastFrame.tick !== frame.tick ||
    lastFrame.worldVersion !== frame.worldVersion ||
    lastFrame.label !== frame.label

  if (shouldAppend) {
    replay.frames.push(frame)
    replay.frames = replay.frames.slice(-12)
  }

  replay.outcome = derivedOutcome
  if (derivedOutcome !== 'running') {
    replay.completedTick = world.tick
    replay.completedWorldVersion = world.worldVersion
  }
}

function ensureExecutionReplay(world: WorldState, factionId: string): ExecutionReplay {
  const activeExecution = getExecution(world, factionId)
  if (!activeExecution) {
    throw new Error('No active execution to record.')
  }

  const existing = world.history.executionReplays.find(
    (entry) => entry.requestId === activeExecution.requestId,
  )
  if (existing) {
    return existing
  }

  const created: ExecutionReplay = {
    requestId: activeExecution.requestId,
    source: activeExecution.source,
    strategicCommand: activeExecution.strategicCommand,
    basedOnWorldVersion: activeExecution.basedOnWorldVersion,
    createdTick: world.tick,
    createdWorldVersion: world.worldVersion,
    reviewAtTick: activeExecution.reviewAtTick,
    plannerNote: activeExecution.plannerNote,
    plannerExplanation: activeExecution.plannerExplanation,
    planningRationale: activeExecution.planningRationale,
    plan: activeExecution.currentPlan,
    outcome: 'running',
    frames: [],
  }

  world.history.executionReplays = [created, ...world.history.executionReplays].slice(0, 8)
  return created
}

function createExecutionReplayFrame(
  world: WorldState,
  factionId: string,
  label: string,
  highlights: ReplayHighlight[],
): ExecutionReplayFrame {
  const execution = getExecution(world, factionId)
  if (!execution) {
    throw new Error('No execution available for replay frame.')
  }

  const orderStates: ReplayOrderSnapshot[] = execution.orders.map((order) => ({
    orderId: order.id,
    unitId: order.unitId,
    action: order.action,
    target: order.target,
    status: order.status,
    message: order.error ?? order.lastMessage ?? order.summary,
  }))

  return {
    tick: world.tick,
    worldVersion: world.worldVersion,
    label,
    frontlineSummary: summarizeFrontline(world, factionId),
    latestReports: world.reports.slice(0, 3).map((report) => `${report.title}：${report.detail}`),
    highlights,
    orderStates,
  }
}

function deriveExecutionOutcome(execution: PlanExecution | null): ExecutionReplayOutcome {
  if (!execution) {
    return 'cleared'
  }

  if (execution.orders.some((order) => order.status === 'queued' || order.status === 'running')) {
    return 'running'
  }

  if (execution.orders.some((order) => order.status === 'failed')) {
    return 'failed'
  }

  return 'completed'
}

type ReplayHighlightContext = {
  unitId?: string
  tileId?: string
  fromTileId?: string
  toTileId?: string
  factionId?: FactionId
}

type EngageReplayHighlightKind = 'battle' | 'tile_control' | 'logistics'

const ENGAGE_REPLAY_HIGHLIGHT_KIND_WHITELIST: ReadonlySet<EngageReplayHighlightKind> = new Set([
  'battle',
  'tile_control',
  'logistics',
])

const LOGGED_UNKNOWN_ENGAGE_REPLAY_KINDS = new Set<string>()

function createReplayHighlight(
  tick: number,
  kind: ReplayHighlight['kind'],
  severity: ReplayHighlight['severity'],
  title: string,
  detail: string,
  context?: ReplayHighlightContext,
): ReplayHighlight {
  const normalizedTileId = context?.tileId ?? context?.toTileId ?? context?.fromTileId
  const normalizedToTileId = context?.toTileId ?? normalizedTileId
  const idSuffix = context?.unitId ?? normalizedTileId ?? 'none'

  return {
    id: `${kind}_${tick}_${title}_${idSuffix}`,
    kind,
    severity,
    title,
    detail,
    unitId: context?.unitId,
    tileId: normalizedTileId,
    fromTileId: context?.fromTileId,
    toTileId: normalizedToTileId,
    factionId: context?.factionId,
  }
}

function normalizeEngageReplayHighlightKind(kind: string): {
  normalizedKind: EngageReplayHighlightKind
  downgradedFrom: string | null
} {
  if (ENGAGE_REPLAY_HIGHLIGHT_KIND_WHITELIST.has(kind as EngageReplayHighlightKind)) {
    return {
      normalizedKind: kind as EngageReplayHighlightKind,
      downgradedFrom: null,
    }
  }
  return {
    normalizedKind: 'tile_control',
    downgradedFrom: kind,
  }
}

function createEngageReplayHighlight(
  tick: number,
  kind: string,
  severity: ReplayHighlight['severity'],
  title: string,
  detail: string,
  context?: ReplayHighlightContext,
): ReplayHighlight {
  const { normalizedKind, downgradedFrom } = normalizeEngageReplayHighlightKind(kind)
  if (downgradedFrom !== null && !LOGGED_UNKNOWN_ENGAGE_REPLAY_KINDS.has(downgradedFrom)) {
    LOGGED_UNKNOWN_ENGAGE_REPLAY_KINDS.add(downgradedFrom)
    console.warn(
      `[replay-highlight] downgraded unknown engage kind "${downgradedFrom}" -> "${normalizedKind}"`,
    )
  }
  const normalizedDetail =
    downgradedFrom === null ? detail : `${detail} [engageKindDowngradedFrom=${downgradedFrom}]`
  return createReplayHighlight(tick, normalizedKind, severity, title, normalizedDetail, {
    unitId: context?.unitId,
    tileId: context?.tileId,
    fromTileId: context?.fromTileId,
    toTileId: context?.toTileId,
    factionId: context?.factionId,
  })
}

function tileControlSeverity(tileType: Tile['type']): ReplayHighlight['severity'] {
  if (tileType === 'pass' || tileType === 'city') {
    return 'high'
  }

  if (tileType === 'resource') {
    return 'medium'
  }

  return 'low'
}

function resolveAllianceSupportLevel(
  stance: WorldState['alliance']['directives'][string]['stance'],
  currentSupportLevel: number,
) {
  switch (stance) {
    case 'hold':
      return currentSupportLevel * 0.92
    case 'support':
      return currentSupportLevel + 8
    case 'harass':
      return currentSupportLevel + 4
    case 'expand':
      return currentSupportLevel + 6
  }
}

function clampValue(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export { actionLabel } from './ruleLabels'

