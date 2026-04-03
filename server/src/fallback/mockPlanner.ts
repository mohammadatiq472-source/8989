import type {
  PlannerResult,
  PveNode,
  StrategicPlan,
  StructuredOrder,
  WorldState,
} from '../../../shared/contracts/game'

export function createMockPlan(world: WorldState, strategicCommand: string, factionId?: string): PlannerResult {
  const targetFactionId = resolveTargetFactionId(world, factionId)
  const factionUnits = world.units.filter(u => u.faction === targetFactionId)
  if (factionUnits.length === 0) {
    return {
      source: 'mock',
      plan: { intent: 'no_units', priority: 'low', orders: [], constraints: [], reviewAfterTicks: 2 },
      note: 'No units available for faction.',
    }
  }

  const orders: StructuredOrder[] = []
  const usedUnits = new Set<string>()
  const tags: string[] = []

  // 洛阳大目标坐标（胜利关键）
  const LUOYANG_X = 160, LUOYANG_Y = 158

  // 找洛阳实际格 ID（用曼哈顿距离最近格）
  let luoyangTileId: string | null = null
  let luoyangMinDist = Infinity
  for (const tile of world.map.tiles) {
    const d = Math.abs(tile.x - LUOYANG_X) + Math.abs(tile.y - LUOYANG_Y)
    if (d < luoyangMinDist) { luoyangMinDist = d; luoyangTileId = tile.id }
  }

  // 预计算 PVE 节点位置（曼哈顿距离用）+ 地块 O(1) 索引
  const uncleared: PveNode[] = (world.pveNodes ?? []).filter(n => !n.cleared)
  const tilePosMap = new Map<string, { x: number; y: number }>()
  const tileByIdMap = new Map<string, typeof world.map.tiles[0]>()
  for (const tile of world.map.tiles) {
    tilePosMap.set(tile.id, { x: tile.x, y: tile.y })
    tileByIdMap.set(tile.id, tile)
  }
  // 预计算单位位置集合 O(1) 碰撞检测
  const occupiedTiles = new Set<string>()
  for (const u of world.units) occupiedTiles.add(u.tileId)

  function manhattan(a: { x: number; y: number }, b: { x: number; y: number }) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
  }

  /** B2/U2: 检查与目标势力是否有有效停战或联盟协议 */
  function isCeasefireWith(targetFaction: string): boolean {
    if (targetFaction === 'neutral' || targetFaction === targetFactionId) return false
    if (!world.feedback.diplomacyAgreements?.length) return false
    return world.feedback.diplomacyAgreements.some(
      a => (a.type === 'ceasefire' || a.type === 'alliance') &&
        a.duration > 0 &&
        a.parties.includes(targetFactionId) &&
        a.parties.includes(targetFaction)
    )
  }

  function isHostileOwner(owner: string): boolean {
    return owner !== targetFactionId && owner !== 'neutral' && !isCeasefireWith(owner)
  }

  /**
   * 从 unitTileId 出发，BFS 搜索最近的中立格。
   * 直接返回目标中立格 ID（单位会用 getFullPath 一路行军过去，充分利用高速移动）。
   */
  function findFrontierStep(unitTileId: string): string | null {
    const visited = new Set<string>()
    let frontier = [unitTileId]
    visited.add(unitTileId)

    for (let depth = 0; depth < 50 && frontier.length > 0; depth++) {
      const nextFrontier: string[] = []
      for (const tid of frontier) {
        const conns = world.map.connections[tid] ?? []
        for (const nId of conns) {
          if (visited.has(nId)) continue
          visited.add(nId)
          const nTile = tileByIdMap.get(nId)
          if (!nTile) continue
          if (nTile.owner === 'neutral') {
            return nId  // 直接返回目标格，单位完整行军过去
          }
          if (nTile.owner === targetFactionId) {
            nextFrontier.push(nId)
          }
        }
      }
      frontier = nextFrontier
    }
    return null
  }

  /**
   * BFS 穿越己方领土，找最近的「敌方格子」，直接返回目标格 ID。
   * 用于所有中立格被占满后驱兵攻入敌境触发战斗。
   * 深度 800 层确保能穿越整个大地图（102k格，最远约 460 步）。
   */
  function findAttackBorderStep(unitTileId: string): string | null {
    const visited = new Set<string>()
    const queue: string[] = [unitTileId]
    visited.add(unitTileId)
    let qi = 0
    while (qi < queue.length) {
      const tid = queue[qi++]
      const conns = world.map.connections[tid] ?? []
      for (const nId of conns) {
        if (visited.has(nId)) continue
        visited.add(nId)
        const nTile = tileByIdMap.get(nId)
        if (!nTile) continue
        if (nTile.owner !== targetFactionId && nTile.owner !== 'neutral' && !isCeasefireWith(nTile.owner)) {
          return nId  // 直接返回敌方格，单位向此格进军触发战斗（跳过停战方）
        }
        queue.push(nId)
      }
      // 安全阈值：防止扫描整图（只需找到最近边境，3万格足够）
      if (qi > 30000) break
    }
    return null
  }

  /**
   * 返回洛阳实际格 tile（用于生成「march to Luoyang」订单目标）。
   * 直接用实际洛阳格 ID，让 getFullPath 算出完整路径，骑兵可在1-2回合内抵达。
   */
  function getLuoyangTile(): WorldState['map']['tiles'][number] | null {
    if (!luoyangTileId) return null
    return tileByIdMap.get(luoyangTileId) ?? null
  }

  /** 全图找距离 unit 最近的未清剿 PVE 节点（无距离上限） */
  function nearestPveNode(unitTileId: string): PveNode | null {
    const pos = tilePosMap.get(unitTileId)
    if (!pos || uncleared.length === 0) return null
    let best: PveNode | null = null
    let bestDist = Infinity
    for (const node of uncleared) {
      const npos = tilePosMap.get(node.tileId)
      if (!npos) continue
      const d = manhattan(pos, npos)
      if (d < bestDist) { bestDist = d; best = node }
    }
    return best
  }

  /**
   * 返回最适合移向 PVE 节点的下一步邻居格（1 步逼近法）。
   */
  function bestStepTowardPve(
    unitTileId: string,
    neighbors: WorldState['map']['tiles'],
    pveNode: PveNode,
  ): WorldState['map']['tiles'][number] | null {
    if (unitTileId === pveNode.tileId) return null
    const pvePos = tilePosMap.get(pveNode.tileId)
    if (!pvePos) return null
    const candidates = neighbors.filter(t => !isHostileOwner(t.owner))
    if (candidates.length === 0) return neighbors[0] ?? null
    return candidates.sort((a, b) => {
      const pa = tilePosMap.get(a.id)
      const pb = tilePosMap.get(b.id)
      if (!pa || !pb) return 0
      return manhattan(pa, pvePos) - manhattan(pb, pvePos)
    })[0] ?? null
  }

  // 统计己方格子数决定战略阶段
  const myTileCount = world.map.tiles.filter(t => t.owner === targetFactionId).length
  const unitPos = (id: string) => tilePosMap.get(id) ?? { x: 0, y: 0 }
  const luoyangPos = { x: LUOYANG_X, y: LUOYANG_Y }

  // ── U1: 教义 doctrine 关键词解析（来自 buildDynamicStrategy 生成的战略指令）──
  const docKw = strategicCommand.toLowerCase()
  const preferRecon = docKw.includes('侦察') || docKw.includes('recon') || docKw.includes('情报') || docKw.includes('scout')
  const preferDefense = docKw.includes('防御') || docKw.includes('defend') || docKw.includes('守') || docKw.includes('consolidat')
  const preferRush = docKw.includes('进攻') || docKw.includes('attack') || docKw.includes('攻') || docKw.includes('rush')
  const preferConservative =
    docKw.includes('保守') ||
    docKw.includes('稳住') ||
    docKw.includes('谨慎') ||
    docKw.includes('避免') ||
    docKw.includes('高损失') ||
    docKw.includes('high risk') ||
    docKw.includes('conservative') ||
    docKw.includes('cautious')
  const intelEntries = Object.values(world.intel)
  const unknownIntelCount = intelEntries.filter(item => item?.level === 'unknown').length
  const unknownIntelRatio = intelEntries.length > 0 ? unknownIntelCount / intelEntries.length : 0
  const recentLosses = world.feedback.battleRecords
    .slice(-6)
    .filter(record => record.attackerFaction === targetFactionId && record.outcome === 'loss').length
  const conservativeNoBlindPush =
    preferConservative ||
    preferDefense ||
    preferRecon ||
    unknownIntelRatio >= 0.6 ||
    recentLosses >= 2
  const allowCapture = preferRush || !conservativeNoBlindPush

  // ── U4: 单位兵种原型（deterministic，基于索引产生多样化行为）──
  // 默认周期: assault(0) recon(1) guard(2) logistics(3) assault(4) recon(5) ...
  function getUnitArchetype(idx: number): 'assault' | 'recon' | 'guard' | 'logistics' {
    if (preferRush) return 'assault'
    const cycle = idx % 4
    if (cycle === 1 || (preferRecon && cycle === 3)) return 'recon'
    if (cycle === 2 || (preferDefense && cycle === 0)) return 'guard'
    if (cycle === 3) return 'logistics'
    return 'assault'
  }

  // Strategy: assign each unit an action based on proximity to frontline / PVE nodes
  for (const [myUnitIndex, unit] of factionUnits.entries()) {
    if (usedUnits.has(unit.id)) continue
    if (orders.length >= 6) break

    const currentTile = tileByIdMap.get(unit.tileId)
    if (!currentTile) continue

    const neighborIds: string[] = world.map.connections[currentTile.id] ?? []
    const neighbors = neighborIds
      .map(id => tileByIdMap.get(id))
      .filter((t): t is NonNullable<typeof t> => t !== undefined)

    // Find hostile or neutral neighbors as targets
    // 扩展检测范围到曼哈顿距离≤2的格子（1步邻居 + 邻居的邻居），更快触发战斗
    const pos = unitPos(unit.tileId)
    const nearTiles = new Map<string, typeof neighbors[number]>()
    for (const nb of neighbors) { nearTiles.set(nb.id, nb) }
    for (const nb of neighbors) {
      for (const nbId of (world.map.connections[nb.id] ?? [])) {
        if (!nearTiles.has(nbId)) {
          const t = tileByIdMap.get(nbId)
          if (t) nearTiles.set(nbId, t)
        }
      }
    }
    const nearTileArr = [...nearTiles.values()]
    // B2修复: hostileNeighbor 排除有停战协议的势力
    const hostileNeighbor = nearTileArr.find((t) => isHostileOwner(t.owner))
    // 中立邻格：优先朝洛阳方向的中立格（只取1格邻居）
    const neutralNeighborsSorted = neighbors
      .filter(t => t.owner === 'neutral')
      .sort((a, b) => {
        const pa = tilePosMap.get(a.id) ?? pos
        const pb = tilePosMap.get(b.id) ?? pos
        return manhattan(pa, luoyangPos) - manhattan(pb, luoyangPos)
      })
    const neutralNeighbor = neutralNeighborsSorted[0]

    // 争霸策略：领土 >= 300 格后就开始向洛阳推进（不等中立格耗尽）
    // 骑兵 150格/回合，2回合可从任何地方打到洛阳
    // 已在洛阳格：不再 march，改为攻击最近敌方边境
    const atLuoyang = luoyangTileId ? unit.tileId === luoyangTileId : false
    // 一半单位（偶数索引）向洛阳进军；另一半继续扩张
    const shouldMarchToLuoyang = myTileCount >= 300 && !hostileNeighbor && !atLuoyang && myUnitIndex % 2 === 0

    // PVE 节点：仅在已驻扎或无中立邻格时才追击远处 PVE
    const pveNode = !hostileNeighbor ? nearestPveNode(unit.tileId) : null
    const pveOnSite = pveNode?.tileId === unit.tileId
    const pveNextStep = pveNode && !pveOnSite && !neutralNeighbor
      ? bestStepTowardPve(unit.tileId, neighbors, pveNode)
      : null

    if (hostileNeighbor) {
      // 在保守/情报优先态下不盲目 capture，先侦察再推进。
      const action = allowCapture ? 'capture' : 'recon'
      orders.push({ unitId: unit.id, action, target: hostileNeighbor.id })
      usedUnits.add(unit.id)
      tags.push(allowCapture ? 'attack_frontline' : 'recon_intel')
    } else {
      // ── U4: 兵种原型差异化行为（在扩张分支中分叉，产生多样化策略）──
      const archetype = getUnitArchetype(myUnitIndex)

      // 侦察兵（recon）：优先情报收集，不急于占领
      if (archetype === 'recon' && !preferRush) {
        const reconTarget = neutralNeighbor?.id ?? findFrontierStep(unit.tileId)
        if (reconTarget) {
          orders.push({ unitId: unit.id, action: 'recon', target: reconTarget })
          usedUnits.add(unit.id)
          tags.push('recon_intel')
        } else {
          // 无可侦察目标→守备
          orders.push({ unitId: unit.id, action: 'garrison', target: currentTile.id })
          usedUnits.add(unit.id)
          tags.push('garrison')
        }
      } else if (archetype === 'logistics') {
        // 后勤兵（logistics）：优先补给低供给友军
        const supplyTarget = world.units.find(
          u => u.faction === targetFactionId && u.id !== unit.id && (u.supply ?? 5) <= 3
        )
        if (supplyTarget) {
          orders.push({ unitId: unit.id, action: 'support', target: supplyTarget.tileId })
          usedUnits.add(unit.id)
          tags.push('logistics_support')
        } else if (neutralNeighbor) {
          // 无低供给目标：保守时改为先侦察。
          const action = allowCapture ? 'capture' : 'recon'
          orders.push({ unitId: unit.id, action, target: neutralNeighbor.id })
          usedUnits.add(unit.id)
          tags.push(allowCapture ? 'expand' : 'recon_intel')
        } else {
          orders.push({ unitId: unit.id, action: 'garrison', target: currentTile.id })
          usedUnits.add(unit.id)
          tags.push('garrison')
        }
      } else if (archetype === 'guard' && currentTile.enemyPressure >= 2) {
        // 守备兵（guard）：有敌方压力时优先 garrison 稳固前线
        orders.push({ unitId: unit.id, action: 'garrison', target: currentTile.id })
        usedUnits.add(unit.id)
        tags.push('defensive_garrison')
      } else if (shouldMarchToLuoyang) {
        // 争霸：向洛阳进军——骑兵 T3 就能到，沿途会走穿敌方格子触发战斗
        const luoyangTile = getLuoyangTile()
        if (luoyangTile && unit.tileId !== luoyangTile.id) {
          // 如果洛阳是敌方领土，用 capture 直接触发战斗；否则用 march
          const luoyangIsHostile = luoyangTile.owner !== targetFactionId && luoyangTile.owner !== 'neutral' && !isCeasefireWith(luoyangTile.owner)
          const action = luoyangIsHostile ? 'capture' : 'march'
          orders.push({ unitId: unit.id, action, target: luoyangTile.id })
          usedUnits.add(unit.id)
          tags.push(luoyangIsHostile ? 'attack_luoyang' : 'luoyang_advance')
        } else {
          // 已在洛阳或无中立格：找最近敌方边境攻击
          const attackTarget = findAttackBorderStep(unit.tileId)
          if (attackTarget) {
            const action = allowCapture ? 'capture' : 'recon'
            orders.push({ unitId: unit.id, action, target: attackTarget })
            usedUnits.add(unit.id)
            tags.push(allowCapture ? 'attack_at_luoyang' : 'recon_intel')
          } else if (neutralNeighbor) {
            const action = allowCapture ? 'capture' : 'recon'
            orders.push({ unitId: unit.id, action, target: neutralNeighbor.id })
            usedUnits.add(unit.id)
            tags.push(allowCapture ? 'expand' : 'recon_intel')
          }
        }
      } else if (pveOnSite) {
        orders.push({ unitId: unit.id, action: 'garrison', target: unit.tileId })
        usedUnits.add(unit.id)
        tags.push('pve_clear')
      } else if (neutralNeighbor) {
        // 向中立扩张（优先朝洛阳方向）
        const action = allowCapture ? 'capture' : 'recon'
        orders.push({ unitId: unit.id, action, target: neutralNeighbor.id })
        usedUnits.add(unit.id)
        tags.push(allowCapture ? 'expand' : 'recon_intel')
      } else if (pveNextStep) {
        orders.push({ unitId: unit.id, action: 'march', target: pveNextStep.id })
        usedUnits.add(unit.id)
        tags.push('pve_advance')
      } else {
        // 内陆单位：先找中立边境，中立边境没有则找敌方边境（推进攻击），否则驻守
        const frontierStep = findFrontierStep(unit.tileId)
        if (frontierStep && frontierStep !== unit.tileId) {
          orders.push({ unitId: unit.id, action: 'march', target: frontierStep })
          usedUnits.add(unit.id)
          tags.push('frontier_march')
        } else {
          // 无中立格可扩，找最近的敌方边境并推进（触发战斗条件）
          const attackStep = findAttackBorderStep(unit.tileId)
          if (attackStep && attackStep !== unit.tileId) {
            orders.push({ unitId: unit.id, action: 'march', target: attackStep })
            usedUnits.add(unit.id)
            tags.push('attack_advance')
          } else {
            orders.push({ unitId: unit.id, action: 'garrison', target: currentTile.id })
            usedUnits.add(unit.id)
            tags.push('garrison')
          }
        }
      }
    }
  }

  if (orders.length === 0 && factionUnits.length > 0) {
    const unit = factionUnits[0]
    orders.push({ unitId: unit.id, action: 'garrison', target: unit.tileId })
  }

  const priority = tags.includes('attack_frontline') ? 'high' : 'medium'
  const intent = tags.includes('attack_frontline')
    ? 'frontline_push'
    : tags.includes('pve_clear') || tags.includes('pve_advance')
      ? 'pve_expansion'
      : tags.includes('recon_intel')
        ? 'intelligence_gathering'
        : tags.includes('logistics_support')
          ? 'logistical_support'
          : tags.includes('defensive_garrison')
            ? 'defensive_consolidation'
            : tags.includes('expand')
              ? 'territory_expansion'
              : 'stabilize_growth'

  const constraints = new Set<string>()
  if (preferRecon || unknownIntelRatio >= 0.5) {
    constraints.add('intel_first_no_blind_push')
  }
  if (preferDefense || recentLosses > 0) {
    constraints.add('protect_supply_line')
  }
  if (conservativeNoBlindPush) {
    constraints.add('avoid_high_loss_engagements')
  }

  const plan: StrategicPlan = {
    intent,
    priority,
    orders: orders.slice(0, 6),
    constraints: Array.from(constraints),
    reviewAfterTicks: 2,
  }

  return {
    source: 'mock',
    plan,
    note: `Dynamic mock plan for ${targetFactionId}: ${tags.join(', ')} (${orders.length} orders).`,
    explanation: `Mock planner generated ${orders.length} orders for ${targetFactionId} with intent ${intent}.`,
    planningRationale: [`Faction ${targetFactionId} has ${factionUnits.length} units`, `Tags: ${tags.join(', ')}`],
  }
}

function resolveTargetFactionId(world: WorldState, requestedFactionId: string | undefined) {
  if (requestedFactionId && world.factions[requestedFactionId]) {
    return requestedFactionId
  }
  return resolvePreferredFactionId(world)
}

function resolvePreferredFactionId(world: WorldState) {
  const factionIds = Object.keys(world.factions)
  const nonNeutralFactionIds = factionIds.filter((factionId) => factionId !== 'neutral')

  const scoredFactionIds = (nonNeutralFactionIds.length > 0 ? nonNeutralFactionIds : factionIds)
    .map((factionId) => ({
      factionId,
      unitCount: world.units.filter((unit) => unit.faction === factionId).length,
      tileCount: world.map.tiles.filter((tile) => tile.owner === factionId).length,
    }))

  if (scoredFactionIds.length === 0) {
    return 'neutral'
  }

  scoredFactionIds.sort((left, right) => {
    if (right.unitCount !== left.unitCount) {
      return right.unitCount - left.unitCount
    }
    if (right.tileCount !== left.tileCount) {
      return right.tileCount - left.tileCount
    }
    return left.factionId.localeCompare(right.factionId)
  })

  return scoredFactionIds[0]?.factionId ?? 'neutral'
}
