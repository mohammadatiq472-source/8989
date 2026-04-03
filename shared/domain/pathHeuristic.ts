import type { SectorId, WorldHierarchy } from './worldHierarchy'

/** Manhattan distance on tile coordinates. */
export function estimateTileDistance(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): number {
  return Math.abs(fromX - toX) + Math.abs(fromY - toY)
}

/** Manhattan distance between sector centers. */
export function sectorCenterHeuristic(
  hierarchy: WorldHierarchy,
  fromId: SectorId,
  toId: SectorId,
): number {
  const from = hierarchy.sectors.get(fromId)
  const to = hierarchy.sectors.get(toId)
  if (!from || !to) return Infinity

  const fcx = (from.bounds.minX + from.bounds.maxX) / 2
  const fcy = (from.bounds.minY + from.bounds.maxY) / 2
  const tcx = (to.bounds.minX + to.bounds.maxX) / 2
  const tcy = (to.bounds.minY + to.bounds.maxY) / 2
  return Math.abs(fcx - tcx) + Math.abs(fcy - tcy)
}
