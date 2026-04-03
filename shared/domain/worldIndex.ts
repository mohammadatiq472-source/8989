/**
 * worldIndex.ts — 世界状态快速空间索引
 *
 * 核心思想：
 *   - world.map.tiles 在场景生命周期内是同一个数组引用（shallowCloneWorld 共享 map 对象）。
 *     因此可用 WeakMap<Tile[], Map<string, Tile>> 缓存 tileById，只建一次，场景销毁后自动 GC。
 *   - world.units 每 tick 深克隆，不能持久缓存；提供 per-call 分组函数，
 *     每次 advanceTick 开头调用一次即可替代多处 O(n) 线性过滤。
 *
 * Phase 1 性能目标：
 *   - getTileByIdFast: O(n) 首次 → O(1) 后续（当前 102K tiles 每 tick 节省 ~1.5M 字符串比较）
 *   - buildUnitsByFaction: O(u) 单次扫描替换每势力 O(u) 过滤（避免 O(f×u) 嵌套）
 *   - computeAllFactionFoodIncomes: O(n) 单次扫描替换 O(n×f)（2 势力 → 2x 节省）
 */

import type { FactionId, Tile, Unit, WorldState } from '../contracts/game'

// ─── tileById 持久索引 ───────────────────────────────────────────────────────
// Key = world.map.tiles 数组引用（shallowCloneWorld 保证场景全程共享同一引用）。
// Tile 对象本身被 mutate（owner/enemyPressure 会变化），但引用不变，Map 始终正确。
const _tileIndexCache = new WeakMap<Tile[], Map<string, Tile>>()

/**
 * O(1) tile 查找。首次调用时建立 Map 索引（O(n)），后续所有调用直接取 O(1)。
 * 这是替换散落在代码库中 `world.map.tiles.find(t => t.id === tileId)` 的统一入口。
 */
export function getTileByIdFast(world: WorldState, tileId: string): Tile | undefined {
  let index = _tileIndexCache.get(world.map.tiles)
  if (!index) {
    index = new Map(world.map.tiles.map((t) => [t.id, t]))
    _tileIndexCache.set(world.map.tiles, index)
  }
  return index.get(tileId)
}

/**
 * 强制重建 tileById 索引（场景重置/强制刷新时使用，正常 tick 不需要调用）。
 */
export function invalidateTileIndex(world: WorldState): void {
  _tileIndexCache.delete(world.map.tiles)
}

// ─── 单位分组 (per-call，不缓存) ──────────────────────────────────────────────

/**
 * 一次 O(u) 扫描，将 units 按 faction 分组。
 * 替换形如 `world.units.filter(u => u.faction === id)` 的多次调用。
 *
 * 用法（advanceTick 开头）：
 *   const unitsByFaction = buildUnitsByFaction(nextWorld.units)
 *   const factionUnits = unitsByFaction.get('faction-a') ?? []
 */
export function buildUnitsByFaction(units: readonly Unit[]): Map<FactionId, Unit[]> {
  const result = new Map<FactionId, Unit[]>()
  for (const unit of units) {
    const bucket = result.get(unit.faction)
    if (bucket) {
      bucket.push(unit)
    } else {
      result.set(unit.faction, [unit])
    }
  }
  return result
}

/**
 * 一次 O(u) 扫描，构建 unitId → Unit 映射。
 * 替换 `world.units.find(u => u.id === id)` 的多次调用。
 */
export function buildUnitById(units: readonly Unit[]): Map<string, Unit> {
  return new Map(units.map((u) => [u.id, u]))
}

// ─── 地块分组 (per-tick，不缓存 because owner 会变化) ───────────────────────

/**
 * 一次 O(n) 扫描计算所有势力的食物收入。
 * 替换 calculateFactionFoodIncome 被每个势力各调用一次的 O(n×f) 模式。
 *
 * 返回 Map<factionId, income>。不出现在 Map 中的势力收入为 0。
 */
export function computeAllFactionFoodIncomes(tiles: readonly Tile[]): Map<FactionId, number> {
  const result = new Map<FactionId, number>()
  for (const tile of tiles) {
    if (!tile.owner || tile.owner === 'neutral') continue
    if (tile.type === 'resource') {
      result.set(tile.owner, (result.get(tile.owner) ?? 0) + 2)
    } else if (tile.type === 'city') {
      result.set(tile.owner, (result.get(tile.owner) ?? 0) + 1)
    }
  }
  return result
}

/**
 * 将 tileId 数组转为 Set，用 O(1) has() 替换 Array.includes() 的 O(n)。
 * 主要用于 summarizeRegion 中的区域内单位检测。
 */
export function buildTileIdSet(tileIds: readonly string[]): Set<string> {
  return new Set(tileIds)
}

/**
 * 按 owner + type 双重索引，一次 O(n) 扫描。
 * 用于批量统计（如 calculateFactionDevelopmentGain）。
 *
 * 返回：{ byOwner: Map<owner, Tile[]>, byType: Map<type, Tile[]> }
 */
export function partitionTiles(tiles: readonly Tile[]): {
  byOwner: Map<string, Tile[]>
  byType: Map<string, Tile[]>
} {
  const byOwner = new Map<string, Tile[]>()
  const byType = new Map<string, Tile[]>()

  for (const tile of tiles) {
    const ownerBucket = byOwner.get(tile.owner)
    if (ownerBucket) ownerBucket.push(tile)
    else byOwner.set(tile.owner, [tile])

    const typeBucket = byType.get(tile.type)
    if (typeBucket) typeBucket.push(tile)
    else byType.set(tile.type, [tile])
  }

  return { byOwner, byType }
}
