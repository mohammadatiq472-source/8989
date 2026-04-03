/**
 * worldHierarchy.ts — 三层地图抽象
 *
 * 为百万格子地图设计的分层索引系统。
 * 当前地图（320×320 ≈ 10 万格）和未来地图（≥100 万格）均可适配。
 *
 * 三层结构：
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  Province（省级，战略层）                                            │
 * │    ↓ 包含多个 Sector                                                │
 * │  Sector（扇区，战术层）                                              │
 * │    ↓ 包含 N×N 个 Tile                                               │
 * │  Tile（格子，单位层）                                                │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * 设计原则：
 *   - **坐标驱动**：不依赖 Tile 对象数组，只需知道 (x,y) 即可定位到层级
 *   - **惰性计算**：WorldHierarchy 对象只在调用时按需计算，不扫描全部格子
 *   - **零 GC 压力**：缓存用 Map，WeakMap 缓存 WorldState 对应的 hierarchy
 *   - **HPA* 友好**：Sector 之间的邻接图直接支持层级 A* 路径规划
 *
 * 尺寸参数（可配置）：
 *   - SECTOR_SIZE = 16（每扇区 16×16 = 256 格）
 *   - PROVINCE_SECTOR_SPAN = 4（每省 = 4×4 扇区 = 64×64 格 = 4096 格）
 *
 * 对于 100 万格地图（~1000×1000）：
 *   - SECTOR_SIZE = 32 → ~31×31 = ~961 个扇区
 *   - PROVINCE_SECTOR_SPAN = 5 → ~6×6 = ~36 个省
 *
 * 对于 100 万×100 万格地图（极限扩展）：
 *   - 省级只需存 "sector 范围"，无需内存枚举
 *   - HPA* 只在 sector 层做 A*，不触碰 tile 层
 */

import type { WorldState } from '../contracts/game'

// ─── 配置常量 ────────────────────────────────────────────────────────────────

/** 每扇区边长（格子数） */
export const SECTOR_SIZE = 16

/** 每省包含的扇区数（单边） */
export const PROVINCE_SECTOR_SPAN = 4

/** 每省包含的格子数（单边） = SECTOR_SIZE × PROVINCE_SECTOR_SPAN */
export const PROVINCE_SIZE = SECTOR_SIZE * PROVINCE_SECTOR_SPAN

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

/** 扇区 ID 格式：`s{sectorRow}_{sectorCol}` */
export type SectorId = string

/** 省级 ID 格式：`p{provinceRow}_{provinceCol}` */
export type ProvinceId = string

export type SectorBounds = {
  minX: number
  minY: number
  maxX: number // exclusive
  maxY: number // exclusive
}

export type SectorNode = {
  id: SectorId
  provinceId: ProvinceId
  bounds: SectorBounds
  /** 相邻扇区 ID（4 方向，地图边缘时不足 4 个）*/
  neighbors: SectorId[]
  /** 穿越此扇区的基础移动代价（最大地形代价的简化估算）*/
  traversalCost: number
}

export type ProvinceNode = {
  id: ProvinceId
  /** 扇区 ID 列表（PROVINCE_SECTOR_SPAN×PROVINCE_SECTOR_SPAN 个）*/
  sectorIds: SectorId[]
  bounds: SectorBounds
  totalTiles: number
  /** 战略摘要（懒计算）*/
  strategicSummary?: ProvinceStrategicSummary
}

export type ProvinceStrategicSummary = {
  tick: number
  /** 主导势力所控地块数 */
  dominantFactionTiles: number
  /** 其他非中立势力合计地块数 */
  otherFactionTiles: number
  neutralTiles: number
  cityCount: number
  resourceCount: number
  avgEnemyPressure: number
  dominantOwner: string | null
  threatLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical'
}

/**
 * WorldHierarchy — 地图层级索引。
 * 通过 `buildWorldHierarchy` 构建，绑定到当前地图尺寸。
 */
export type WorldHierarchy = {
  mapWidth: number
  mapHeight: number
  sectorCols: number
  sectorRows: number
  provinceCols: number
  provinceRows: number
  sectors: Map<SectorId, SectorNode>
  provinces: Map<ProvinceId, ProvinceNode>
}

// ─── 内部缓存 ────────────────────────────────────────────────────────────────

// 以地图尺寸字符串为 key，缓存层级结构（不随 WorldState 变化）
const HIERARCHY_CACHE = new Map<string, WorldHierarchy>()

// ─── 坐标计算函数 ────────────────────────────────────────────────────────────

/** 
 * 由 (x,y) 格子坐标算出 SectorId。
 * 不需要 WorldState，纯坐标计算。
 */
export function sectorIdForCoord(x: number, y: number): SectorId {
  const sectorCol = Math.floor(x / SECTOR_SIZE)
  const sectorRow = Math.floor(y / SECTOR_SIZE)
  return `s${sectorRow}_${sectorCol}`
}

/**
 * 由 (x,y) 算出 ProvinceId。
 */
export function provinceIdForCoord(x: number, y: number): ProvinceId {
  const provinceCol = Math.floor(x / PROVINCE_SIZE)
  const provinceRow = Math.floor(y / PROVINCE_SIZE)
  return `p${provinceRow}_${provinceCol}`
}

// ─── 层级构建 ────────────────────────────────────────────────────────────────

/**
 * 构建（或复用缓存的）世界层级索引。
 * 只依赖地图尺寸，不扫描所有格子——O(sectors) 而非 O(tiles)。
 */
export function buildWorldHierarchy(mapWidth: number, mapHeight: number): WorldHierarchy {
  const cacheKey = `${mapWidth}x${mapHeight}`
  const cached = HIERARCHY_CACHE.get(cacheKey)
  if (cached) return cached

  const sectorCols = Math.ceil(mapWidth / SECTOR_SIZE)
  const sectorRows = Math.ceil(mapHeight / SECTOR_SIZE)
  const provinceCols = Math.ceil(sectorCols / PROVINCE_SECTOR_SPAN)
  const provinceRows = Math.ceil(sectorRows / PROVINCE_SECTOR_SPAN)

  const sectors = new Map<SectorId, SectorNode>()
  const provinces = new Map<ProvinceId, ProvinceNode>()

  // 构建扇区
  for (let row = 0; row < sectorRows; row++) {
    for (let col = 0; col < sectorCols; col++) {
      const id: SectorId = `s${row}_${col}`
      const minX = col * SECTOR_SIZE
      const minY = row * SECTOR_SIZE
      const maxX = Math.min(minX + SECTOR_SIZE, mapWidth)
      const maxY = Math.min(minY + SECTOR_SIZE, mapHeight)

      const neighbors: SectorId[] = []
      if (row > 0) neighbors.push(`s${row - 1}_${col}`)
      if (row < sectorRows - 1) neighbors.push(`s${row + 1}_${col}`)
      if (col > 0) neighbors.push(`s${row}_${col - 1}`)
      if (col < sectorCols - 1) neighbors.push(`s${row}_${col + 1}`)

      sectors.set(id, {
        id,
        provinceId: `p${Math.floor(row / PROVINCE_SECTOR_SPAN)}_${Math.floor(col / PROVINCE_SECTOR_SPAN)}`,
        bounds: { minX, minY, maxX, maxY },
        neighbors,
        traversalCost: 1, // 默认值，可通过 updateSectorTraversalCost 精细化
      })
    }
  }

  // 构建省级
  for (let pRow = 0; pRow < provinceRows; pRow++) {
    for (let pCol = 0; pCol < provinceCols; pCol++) {
      const id: ProvinceId = `p${pRow}_${pCol}`
      const sectorIds: SectorId[] = []
      const minX = pCol * PROVINCE_SIZE
      const minY = pRow * PROVINCE_SIZE
      const maxX = Math.min(minX + PROVINCE_SIZE, mapWidth)
      const maxY = Math.min(minY + PROVINCE_SIZE, mapHeight)

      for (let sr = 0; sr < PROVINCE_SECTOR_SPAN; sr++) {
        for (let sc = 0; sc < PROVINCE_SECTOR_SPAN; sc++) {
          const sectorRow = pRow * PROVINCE_SECTOR_SPAN + sr
          const sectorCol = pCol * PROVINCE_SECTOR_SPAN + sc
          if (sectorRow < sectorRows && sectorCol < sectorCols) {
            sectorIds.push(`s${sectorRow}_${sectorCol}`)
          }
        }
      }

      const totalTiles = (maxX - minX) * (maxY - minY)
      provinces.set(id, {
        id,
        sectorIds,
        bounds: { minX, minY, maxX, maxY },
        totalTiles,
      })
    }
  }

  const hierarchy: WorldHierarchy = {
    mapWidth,
    mapHeight,
    sectorCols,
    sectorRows,
    provinceCols,
    provinceRows,
    sectors,
    provinces,
  }

  HIERARCHY_CACHE.set(cacheKey, hierarchy)
  return hierarchy
}

/**
 * 从 WorldState 自动推导地图尺寸并构建层级索引。
 * 通过扫描所有 tile 的 x/y 找到最大值。使用缓存，只扫描一次。
 */
const WORLD_HIERARCHY_REF = new WeakMap<WorldState['map'], WorldHierarchy>()

export function getWorldHierarchy(world: WorldState): WorldHierarchy {
  const cached = WORLD_HIERARCHY_REF.get(world.map)
  if (cached) return cached

  let maxX = 0
  let maxY = 0
  for (const tile of world.map.tiles) {
    if (tile.x > maxX) maxX = tile.x
    if (tile.y > maxY) maxY = tile.y
  }
  // maxX/maxY 是最后一格索引，宽高 = maxX+1
  const hierarchy = buildWorldHierarchy(maxX + 1, maxY + 1)
  WORLD_HIERARCHY_REF.set(world.map, hierarchy)
  return hierarchy
}

// ─── 查询 API ────────────────────────────────────────────────────────────────

/**
 * 获取某格子所在的扇区 ID（只需传入 tile.x, tile.y，不需要 WorldState）。
 */
export function getSectorForTile(tileX: number, tileY: number): SectorId {
  return sectorIdForCoord(tileX, tileY)
}

/**
 * 获取某格子所在的省级 ID。
 */
export function getProvinceForTile(tileX: number, tileY: number): ProvinceId {
  return provinceIdForCoord(tileX, tileY)
}

/**
 * 获取某扇区的相邻扇区列表。
 */
export function getNeighborSectors(hierarchy: WorldHierarchy, sectorId: SectorId): SectorId[] {
  return hierarchy.sectors.get(sectorId)?.neighbors ?? []
}

/**
 * 获取某省级的相邻省级列表（8 方向，仅水平/垂直）。
 */
export function getNeighborProvinces(hierarchy: WorldHierarchy, provinceId: ProvinceId): ProvinceId[] {
  const [, pRowStr, pColStr] = provinceId.split(/[p_]/)
  const pRow = Number(pRowStr)
  const pCol = Number(pColStr)
  const neighbors: ProvinceId[] = []
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const
  for (const [dr, dc] of dirs) {
    const nr = pRow + dr
    const nc = pCol + dc
    if (nr >= 0 && nr < hierarchy.provinceRows && nc >= 0 && nc < hierarchy.provinceCols) {
      neighbors.push(`p${nr}_${nc}`)
    }
  }
  return neighbors
}

/**
 * 计算省级战略摘要（扫描该省内的所有格子）。
 * 结果缓存在 ProvinceNode.strategicSummary 中，tick 变化时需手动重置。
 */
export function computeProvinceStrategicSummary(
  hierarchy: WorldHierarchy,
  provinceId: ProvinceId,
  world: WorldState,
  forceTick?: number,
): ProvinceStrategicSummary {
  const province = hierarchy.provinces.get(provinceId)
  if (!province) throw new Error(`Province '${provinceId}' not found`)

  // 如果已有当前 tick 的缓存，直接复用
  if (
    province.strategicSummary &&
    province.strategicSummary.tick === (forceTick ?? world.tick)
  ) {
    return province.strategicSummary
  }

  const { minX, maxX, minY, maxY } = province.bounds
  const ownerCounts = new Map<string, number>()
  let neutralTiles = 0
  let cityCount = 0, resourceCount = 0
  let totalPressure = 0, tileCount = 0

  for (const tile of world.map.tiles) {
    if (tile.x < minX || tile.x >= maxX || tile.y < minY || tile.y >= maxY) continue
    tileCount++
    totalPressure += tile.enemyPressure

    if (tile.type === 'city') cityCount++
    if (tile.type === 'resource') resourceCount++

    const o = tile.owner || 'neutral'
    ownerCounts.set(o, (ownerCounts.get(o) ?? 0) + 1)

    if (o === 'neutral' || o === '') neutralTiles++
  }

  let dominantOwner: string | null = null
  let maxCount = 0
  for (const [owner, count] of ownerCounts) {
    if (count > maxCount) { maxCount = count; dominantOwner = owner }
  }
  // 多势力兼容：用 dominantOwner 视角动态计算
  const dominantFactionTiles = maxCount
  const otherFactionTiles = tileCount - neutralTiles - dominantFactionTiles

  const avgPressure = tileCount > 0 ? totalPressure / tileCount : 0
  const threatLevel =
    avgPressure >= 4 ? 'critical' :
    avgPressure >= 3 ? 'high' :
    avgPressure >= 2 ? 'medium' :
    avgPressure >= 1 ? 'low' : 'safe'

  const summary: ProvinceStrategicSummary = {
    tick: world.tick,
    dominantFactionTiles,
    otherFactionTiles,
    neutralTiles,
    cityCount,
    resourceCount,
    avgEnemyPressure: Math.round(avgPressure * 100) / 100,
    dominantOwner,
    threatLevel,
  }

  province.strategicSummary = summary
  return summary
}

/**
 * 更新扇区的移动代价（基于该扇区内格子的平均 moveCost）。
 * 可在游戏开始时预计算，之后缓存使用。
 */
export function updateSectorTraversalCost(
  hierarchy: WorldHierarchy,
  sectorId: SectorId,
  world: WorldState,
): void {
  const sector = hierarchy.sectors.get(sectorId)
  if (!sector) return

  const { minX, maxX, minY, maxY } = sector.bounds
  let totalCost = 0
  let count = 0
  for (const tile of world.map.tiles) {
    if (tile.x >= minX && tile.x < maxX && tile.y >= minY && tile.y < maxY) {
      totalCost += tile.moveCost
      count++
    }
  }
  sector.traversalCost = count > 0 ? totalCost / count : 1
}

/**
 * 将所有扇区的移动代价批量更新（O(n) 单次扫描）。
 * 适合在游戏初始化时调用一次。
 */
export function batchUpdateSectorTraversalCosts(
  hierarchy: WorldHierarchy,
  world: WorldState,
): void {
  const sectorCostAccum = new Map<SectorId, { total: number; count: number }>()

  for (const tile of world.map.tiles) {
    const sectorId = sectorIdForCoord(tile.x, tile.y)
    const entry = sectorCostAccum.get(sectorId)
    if (entry) {
      entry.total += tile.moveCost
      entry.count++
    } else {
      sectorCostAccum.set(sectorId, { total: tile.moveCost, count: 1 })
    }
  }

  for (const [sectorId, { total, count }] of sectorCostAccum) {
    const sector = hierarchy.sectors.get(sectorId)
    if (sector && count > 0) {
      sector.traversalCost = total / count
    }
  }
}

// ─── 辅助函数：AI-friendly 省级摘要文本 ────────────────────────────────────

/**
 * 生成省级战略摘要的自然语言描述，用于 CommanderAgent prompt 注入。
 * 这是 AI-First API Design 的实现：不是原始数字，而是带推荐行动的语义摘要。
 */
export function formatProvinceForAI(
  provinceId: ProvinceId,
  summary: ProvinceStrategicSummary,
): string {
  const control =
    summary.dominantFactionTiles > summary.otherFactionTiles + summary.neutralTiles
      ? '我方主导'
      : summary.otherFactionTiles > summary.dominantFactionTiles + summary.neutralTiles
        ? '敌方主导'
        : '争夺状态'

  const recommendation =
    summary.threatLevel === 'critical' || summary.threatLevel === 'high'
      ? '建议立即驻防或增援'
      : summary.neutralTiles > summary.dominantFactionTiles
        ? '建议推进占领中立区域'
        : summary.cityCount > 0
          ? '建议巩固城市控制'
          : '区域稳定，可维持当前态势'

  return `省 ${provinceId}（${control}）：城 ${summary.cityCount} / 资源 ${summary.resourceCount} / 威胁:${summary.threatLevel} — ${recommendation}`
}
