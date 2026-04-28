/**
 * 资源系统：产出、消耗、滚雪球效应
 *
 * 四资源：粮草(food)、木材(wood)、石料(stone)、铁矿(iron)
 * - 占领资源地块 → 每回合自动产出
 * - 城池等级 → 加成周围地块产出
 * - 部队维护 → 每回合消耗粮草
 * - 行军中的部队 → 额外补给线消耗
 */

import type { PlayerResources } from '../contracts/game'

// ─── 资源地块产出配置 ─────────────────────────────

/**
 * 地块类型 + resourceKind 映射到资源产出
 * 游戏中 TileType: 'plain' | 'resource' | 'pass' | 'fort' | 'dock' | 'city' | 'fog'
 * resource 类地块通过 resourceKind 区分具体资源
 */
export const TILE_TYPE_OUTPUT: Record<string, Partial<PlayerResources>> = {
  plain:    { food: 10 },
  pass:     { stone: 5, iron: 5 },
  fort:     {},
  dock:     {},
  city:     { food: 50, wood: 30, stone: 20, iron: 15 },
  fog:      {},
}

/** resource 地块根据 resourceKind 的具体产出 */
export const RESOURCE_KIND_OUTPUT: Record<string, Partial<PlayerResources>> = {
  food:  { food: 30 },
  wood:  { wood: 25 },
  stone: { stone: 20 },
  iron:  { iron: 15 },
}

/** 城池等级对应的产出加成倍率 */
export const CITY_LEVEL_MULTIPLIER: Record<number, number> = {
  1: 1.0,
  2: 1.2,
  3: 1.5,
  4: 1.8,
  5: 2.2,
  6: 2.6,
  7: 3.0,
  8: 3.5,
  9: 4.0,
  10: 5.0,
}

// ─── 消耗配置 ─────────────────────────────

/** 每支部队每回合粮草维护消耗（基础值） */
export const ARMY_FOOD_UPKEEP_BASE = 50

/** 每支行军中的部队额外消耗（补给线成本） */
export const ARMY_MARCHING_EXTRA_FOOD = 20

/** 领地维护：超过阈值后每块领地的额外消耗 */
export const TERRITORY_UPKEEP_THRESHOLD = 30
export const TERRITORY_UPKEEP_PER_TILE = 5

// ─── 初始资源 ─────────────────────────────

/** 新 AI 玩家的初始资源 */
export const INITIAL_RESOURCES: PlayerResources = {
  food: 1000,
  wood: 500,
  stone: 300,
  iron: 200,
}

// ─── 产出计算 ─────────────────────────────

export type TileInfo = {
  type: string
  cityLevel?: number
  resourceKind?: string
}

/**
 * 计算单个 AI 玩家每回合的资源产出
 * @param capturedTiles 占领的地块信息
 * @returns 本回合资源产出
 */
export function computeResourceIncome(capturedTiles: TileInfo[]): PlayerResources {
  const income: PlayerResources = { food: 0, wood: 0, stone: 0, iron: 0 }

  for (const tile of capturedTiles) {
    // resource 类地块使用 resourceKind 确定具体产出
    let output: Partial<PlayerResources> | undefined
    if (tile.type === 'resource' && tile.resourceKind) {
      output = RESOURCE_KIND_OUTPUT[tile.resourceKind]
    } else {
      output = TILE_TYPE_OUTPUT[tile.type]
    }
    if (!output) continue

    const multiplier = tile.cityLevel ? (CITY_LEVEL_MULTIPLIER[tile.cityLevel] ?? 1.0) : 1.0

    income.food += Math.round((output.food ?? 0) * multiplier)
    income.wood += Math.round((output.wood ?? 0) * multiplier)
    income.stone += Math.round((output.stone ?? 0) * multiplier)
    income.iron += Math.round((output.iron ?? 0) * multiplier)
  }

  return income
}

/**
 * 计算单个 AI 玩家每回合的资源消耗
 * @param armyCount 当前出战部队数
 * @param marchingArmyCount 行军中的部队数
 * @param totalTiles 总占领地块数
 * @returns 本回合资源消耗
 */
export function computeResourceUpkeep(
  armyCount: number,
  marchingArmyCount: number,
  totalTiles: number,
): PlayerResources {
  const upkeep: PlayerResources = { food: 0, wood: 0, stone: 0, iron: 0 }

  // 部队粮草维护
  upkeep.food += armyCount * ARMY_FOOD_UPKEEP_BASE

  // 行军部队额外消耗
  upkeep.food += marchingArmyCount * ARMY_MARCHING_EXTRA_FOOD

  // 领地维护（超过阈值后的额外消耗）
  if (totalTiles > TERRITORY_UPKEEP_THRESHOLD) {
    upkeep.food += (totalTiles - TERRITORY_UPKEEP_THRESHOLD) * TERRITORY_UPKEEP_PER_TILE
  }

  return upkeep
}

/**
 * 计算净资源变化（产出 - 消耗）
 */
export function computeNetResources(
  income: PlayerResources,
  upkeep: PlayerResources,
): PlayerResources {
  return {
    food: income.food - upkeep.food,
    wood: income.wood - upkeep.wood,
    stone: income.stone - upkeep.stone,
    iron: income.iron - upkeep.iron,
  }
}

/**
 * 应用资源变化到玩家资源，确保不为负
 */
export function applyResourceChange(
  current: PlayerResources,
  change: PlayerResources,
): PlayerResources {
  return {
    food: Math.max(0, current.food + change.food),
    wood: Math.max(0, current.wood + change.wood),
    stone: Math.max(0, current.stone + change.stone),
    iron: Math.max(0, current.iron + change.iron),
  }
}

/**
 * 检查资源是否足够支付指定费用
 */
export function canAfford(
  current: PlayerResources,
  cost: Partial<PlayerResources>,
): boolean {
  if ((cost.food ?? 0) > current.food) return false
  if ((cost.wood ?? 0) > current.wood) return false
  if ((cost.stone ?? 0) > current.stone) return false
  if ((cost.iron ?? 0) > current.iron) return false
  return true
}

/**
 * 扣除资源
 * @throws 如果资源不足
 */
export function deductResources(
  current: PlayerResources,
  cost: Partial<PlayerResources>,
): PlayerResources {
  if (!canAfford(current, cost)) {
    throw new Error(`资源不足: 需要 F${cost.food ?? 0}/W${cost.wood ?? 0}/S${cost.stone ?? 0}/I${cost.iron ?? 0}，拥有 F${current.food}/W${current.wood}/S${current.stone}/I${current.iron}`)
  }
  return {
    food: current.food - (cost.food ?? 0),
    wood: current.wood - (cost.wood ?? 0),
    stone: current.stone - (cost.stone ?? 0),
    iron: current.iron - (cost.iron ?? 0),
  }
}
