/**
 * GAP-9: 洛阳终局机制
 *
 * 1. 洛阳区域战斗时，守方享有 1.5x 防御加成（叠加在地形加成之上）。
 * 2. 占领洛阳需持续 3 个 tick 的攻城行动才能完成所有权转移。
 * 3. 若攻城方中断（单位离开），已积累的围城进度清零。
 *
 * 胜利倒计时（占领后 5 tick 赢得 luoyang_control）由 victoryCondition.ts 处理。
 */
import type { FactionId, ReplayHighlight, Tile, WorldState } from '../contracts/game'

/** 完成洛阳占领所需连续攻城回合数 */
export const LUOYANG_SIEGE_TICKS_REQUIRED = 3

/**
 * 判断某地块是否属于洛阳区域。
 * 同时兼容 landmarkName 和坐标范围两种匹配方式。
 */
export function isLuoyangTile(tile: Tile): boolean {
  return !!(
    tile.landmarkName?.includes('洛阳') ||
    (tile.x >= 155 && tile.x <= 165 && tile.y >= 150 && tile.y <= 160 && tile.type === 'city')
  )
}

/**
 * 返回洛阳特殊防御乘数。
 * 非洛阳地块返回 1.0，不影响原有战斗逻辑。
 */
export function getLuoyangDefenseBonus(tile: Tile): number {
  return isLuoyangTile(tile) ? 1.5 : 1.0
}

/**
 * 在 capture 动作执行时调用：
 * 递增该 faction 对洛阳的围城进度，返回当前已积累的回合数（从 1 开始计）。
 */
export function getAndIncrementSiegeProgress(
  world: WorldState,
  factionId: FactionId,
): number {
  world.luoyangSiegeProgress = world.luoyangSiegeProgress ?? {}
  const next = (world.luoyangSiegeProgress[factionId] ?? 0) + 1
  world.luoyangSiegeProgress[factionId] = next
  return next
}

/**
 * 重置某 faction 对洛阳的围城进度（攻城中断时调用）。
 */
export function resetSiegeProgress(world: WorldState, factionId: FactionId): void {
  if (world.luoyangSiegeProgress) {
    world.luoyangSiegeProgress[factionId] = 0
  }
}

/**
 * 每 tick 调用：对没有在洛阳地块驻军的 faction 清零围城进度。
 * 这样可以防止离线后的围城进度积累。
 */
export function processSiegeDecay(world: WorldState, highlights: ReplayHighlight[]): void {
  if (!world.luoyangSiegeProgress) return

  const luoyangTileIds = new Set(
    world.map.tiles.filter(isLuoyangTile).map((t) => t.id),
  )
  if (luoyangTileIds.size === 0) return

  for (const factionId of Object.keys(world.luoyangSiegeProgress)) {
    const progress = world.luoyangSiegeProgress[factionId] ?? 0
    if (progress === 0) continue

    const hasUnitOnLuoyang = world.units.some(
      (u) => u.faction === factionId && luoyangTileIds.has(u.tileId),
    )

    if (!hasUnitOnLuoyang) {
      world.luoyangSiegeProgress[factionId] = 0
      const luoyangAnchorTileId = Array.from(luoyangTileIds)[0]
      const factionAnchorUnit = world.units.find((u) => u.faction === factionId)

      world.reports.unshift({
        id: `siege_break_${world.tick}_${factionId}`,
        tick: world.tick,
        title: '围城中断',
        detail: `${factionId} 在洛阳的围城进度已清零（单位离开洛阳区域）。`,
      })
      highlights.push({
        id: `siege_break_${world.tick}_${factionId}`,
        kind: 'tile_control',
        severity: 'medium',
        title: '围城中断',
        detail: `${factionId} 对洛阳的围攻中断，进度归零。`,
        unitId: factionAnchorUnit?.id,
        tileId: luoyangAnchorTileId,
        toTileId: luoyangAnchorTileId,
        factionId,
      })
    }
  }
}
