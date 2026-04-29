/**
 * GAP-5: 省内开荒 PVE 系统
 *
 * 每个省份有若干 PVE 关卡节点（绑定在 resource 地块上），
 * 中立守卫驻防。每 tick 检查：若我方单位驻扎在该地块，自动触发开荒战斗。
 * 清剿成功后获得额外食物与行动点奖励。
 */
import type { FactionId, PveNode, ReplayHighlight, Tile, WorldState } from '../contracts/game'

/** 每个省最多生成的 PVE 节点数 */
const MAX_NODES_PER_PROVINCE = 4
const MAX_PENDING_REWARDS_PER_FACTION = 64

/**
 * 根据已生成地块列表初始化 PVE 节点。
 * 每个省选 resource 地块中间隔采样最多 4 个。
 * 在 createInitialWorldState 中调用一次。
 */
export function generateInitialPveNodes(tiles: Tile[]): PveNode[] {
  const byDistrict = new Map<string, Tile[]>()
  for (const tile of tiles) {
    if (tile.type !== 'resource' || !tile.district) continue
    const list = byDistrict.get(tile.district) ?? []
    list.push(tile)
    byDistrict.set(tile.district, list)
  }

  // 每个 district 的中心点（用于排序，确保节点均匀分布在 district 内部而非偏角落）
  function districtCenter(dtiles: Tile[]): { cx: number; cy: number } {
    const cx = dtiles.reduce((s, t) => s + t.x, 0) / dtiles.length
    const cy = dtiles.reduce((s, t) => s + t.y, 0) / dtiles.length
    return { cx, cy }
  }

  const nodes: PveNode[] = []
  let nodeIndex = 0

  for (const [district, districtTiles] of byDistrict) {
    const count = Math.min(MAX_NODES_PER_PROVINCE, districtTiles.length)
    if (count === 0) continue

    // 按到 district 自身中心的距离排序，然后均匀采样
    // 这样可以在 district 内均匀覆盖，而不是随机偏向某角落
    const { cx, cy } = districtCenter(districtTiles)
    const sorted = [...districtTiles].sort((a, b) => {
      const da = Math.abs(a.x - cx) + Math.abs(a.y - cy)
      const db = Math.abs(b.x - cx) + Math.abs(b.y - cy)
      return da - db  // 优先选靠近 district 中心的格子
    })

    const step = Math.max(1, Math.floor(sorted.length / count))

    for (let i = 0; i < count; i++) {
      const tile = sorted[i * step]
      if (!tile) continue
      nodeIndex++
      // 守军战力: 15 ~ 30，按 nodeIndex 交错分布
      const guardStrength = 15 + ((nodeIndex * 7) % 16)
      nodes.push({
        id: `pve_${district}_${i + 1}`,
        name: `${tile.name}守营`,
        district,
        tileId: tile.id,
        guardStrength,
        reward: { food: 3 + (nodeIndex % 3), ap: 1 },
        cleared: false,
      })
    }
  }

  return nodes
}

/**
 * 每 tick 扫描所有未清剿的 PVE 节点：
 * 若有我方单位驻扎在该地块，自动触发开荒战斗。
 * 攻击方战力 >= 守卫战力 * 0.8 才能清剿成功。
 * 清剿成功后只生成“待领取奖励”，实际资源发放需走正式 claimReward authority。
 */
export function processProvincePve(
  world: WorldState,
  highlights: ReplayHighlight[],
): void {
  if (!world.pveNodes || world.pveNodes.length === 0) return

  for (const node of world.pveNodes) {
    if (node.cleared) continue

    // 找到驻扎该地块的非中立、非敌对单位（任何属于已注册 faction 的单位）
    const attacker = world.units.find(
      (u) => u.tileId === node.tileId && u.faction !== 'neutral' && world.factions[u.faction],
    )
    if (!attacker) continue

    const factionId: FactionId = attacker.faction
    const attackerPower = attacker.strength * 0.8
    const defenderPower = node.guardStrength

    if (attackerPower >= defenderPower) {
      // 清剿成功
      node.cleared = true
      node.clearedByFaction = factionId

      const faction = world.factions[factionId]
      if (faction) {
        const reward = {
          id: `reward_${node.id}_${factionId}`,
          source: 'province_pve' as const,
          label: `开荒奖励：${node.name}`,
          summary: `${attacker.name} 清剿 ${node.name} 后等待领取的奖励。`,
          reward: { ...node.reward },
          createdTick: world.tick,
          nodeId: node.id,
          tileId: node.tileId,
        }
        faction.claimableRewards = [reward, ...(faction.claimableRewards ?? [])].slice(0, MAX_PENDING_REWARDS_PER_FACTION)
      }

      world.reports.unshift({
        id: `pve_clear_${world.tick}_${node.id}`,
        tick: world.tick,
        title: `开荒完成：${node.name}`,
        detail: `${attacker.name} 清剿了 ${node.name}（${factionId}），产出 ${node.reward.food} 粮草、${node.reward.ap} 行动点待领取。`,
      })
      highlights.push({
        id: `pve_clear_${world.tick}_${node.id}`,
        kind: 'tile_control',
        severity: 'low',
        title: `开荒完成：${node.name}`,
        detail: `${attacker.name} 清剿了 ${node.name}，已挂起 ${node.reward.food} 粮草和 ${node.reward.ap} 行动点奖励。`,
        unitId: attacker.id,
        tileId: node.tileId,
        toTileId: node.tileId,
        factionId,
      })
    } else {
      // 清剿失败，守卫反击，攻击方受损
      const loss = Math.max(1, Math.ceil((defenderPower - attackerPower) / 8))
      attacker.strength = Math.max(8, attacker.strength - loss)

      world.reports.unshift({
        id: `pve_resist_${world.tick}_${node.id}`,
        tick: world.tick,
        title: `守营抵抗：${node.name}`,
        detail: `${attacker.name} 尝试清剿 ${node.name} 未果，损失 ${loss} 战力。`,
      })
      highlights.push({
        id: `pve_resist_${world.tick}_${node.id}`,
        kind: 'battle',
        severity: 'low',
        title: `守营抵抗：${node.name}`,
        detail: `${attacker.name} 开荒 ${node.name} 失败，损失 ${loss} 战力。`,
        unitId: attacker.id,
        tileId: node.tileId,
        toTileId: node.tileId,
        factionId,
      })
    }
  }
}
