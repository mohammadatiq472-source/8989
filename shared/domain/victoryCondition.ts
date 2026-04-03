import type { WorldState } from '../contracts/game'

export type VictoryConditionType = 'luoyang_control' | 'annihilation' | 'territory_dominance' | 'alliance_dominance'

export type VictoryCheckResult = {
  winner: string | null
  condition: VictoryConditionType | null
  reason: string
}

const LUOYANG_HOLD_TICKS = 15

/**
 * Check if any faction has won the game.
 * Three conditions:
 * 1. luoyang_control — A faction controls Luoyang for N consecutive ticks.
 * 2. annihilation — A faction eliminates all other factions' units.
 * 3. territory_dominance — A faction controls >60% of all tiles.
 */
export function checkVictoryConditions(world: WorldState): VictoryCheckResult {
  const factionIds = Object.keys(world.factions)
  if (factionIds.length < 2) {
    return { winner: null, condition: null, reason: 'Not enough factions.' }
  }

  // 1. Luoyang control check
  const luoyangResult = checkLuoyangControl(world, factionIds)
  if (luoyangResult.winner) return luoyangResult

  // 2. Annihilation check
  const annihilationResult = checkAnnihilation(world, factionIds)
  if (annihilationResult.winner) return annihilationResult

  // 3. Territory dominance check (single faction)
  const dominanceResult = checkTerritoryDominance(world, factionIds)
  if (dominanceResult.winner) return dominanceResult

  return { winner: null, condition: null, reason: 'No victory condition met.' }
}

function checkLuoyangControl(world: WorldState, factionIds: string[]): VictoryCheckResult {
  const luoyangTiles = world.map.tiles.filter(
    (t) =>
      t.landmarkName?.includes('洛阳') ||
      (t.x >= 155 && t.x <= 165 && t.y >= 150 && t.y <= 160 && t.type === 'city'),
  )

  if (luoyangTiles.length === 0) {
    return { winner: null, condition: null, reason: 'No Luoyang tiles found on map.' }
  }

  // Check each faction — does it hold ALL Luoyang tiles?
  for (const fid of factionIds) {
    const holdsAll = luoyangTiles.every((t) => t.owner === fid)
    if (!holdsAll) continue

    // Check how long the faction has been holding Luoyang (via consecutive control counter)
    const faction = world.factions[fid]
    const holdTicks = faction?.luoyangHoldTicks ?? 0
    if (holdTicks >= LUOYANG_HOLD_TICKS) {
      return {
        winner: fid,
        condition: 'luoyang_control',
        reason: `${fid} has controlled Luoyang for ${holdTicks} consecutive ticks.`,
      }
    }
  }

  return { winner: null, condition: null, reason: '' }
}

function checkAnnihilation(world: WorldState, factionIds: string[]): VictoryCheckResult {
  const unitsByFaction = new Map<string, number>()
  for (const unit of world.units) {
    unitsByFaction.set(unit.faction, (unitsByFaction.get(unit.faction) ?? 0) + 1)
  }

  // Find factions with zero units
  const aliveFactions = factionIds.filter((fid) => (unitsByFaction.get(fid) ?? 0) > 0)

  if (aliveFactions.length === 1) {
    return {
      winner: aliveFactions[0],
      condition: 'annihilation',
      reason: `${aliveFactions[0]} has eliminated all other factions.`,
    }
  }

  return { winner: null, condition: null, reason: '' }
}

function checkTerritoryDominance(world: WorldState, factionIds: string[]): VictoryCheckResult {
  const totalTiles = world.map.tiles.length
  if (totalTiles === 0) return { winner: null, condition: null, reason: '' }

  const threshold = 0.6

  for (const fid of factionIds) {
    const controlledCount = world.map.tiles.filter((t) => t.owner === fid).length
    const ratio = controlledCount / totalTiles
    if (ratio >= threshold) {
      return {
        winner: fid,
        condition: 'territory_dominance',
        reason: `${fid} controls ${(ratio * 100).toFixed(1)}% of all territory (${controlledCount}/${totalTiles}).`,
      }
    }
  }

  return { winner: null, condition: null, reason: '' }
}

/**
 * Update Luoyang hold tick counters for all factions.
 * Call this at the end of each tick in advanceTick.
 */
export function updateLuoyangHoldCounters(world: WorldState): void {
  const luoyangTiles = world.map.tiles.filter(
    (t) =>
      t.landmarkName?.includes('洛阳') ||
      (t.x >= 155 && t.x <= 165 && t.y >= 150 && t.y <= 160 && t.type === 'city'),
  )

  if (luoyangTiles.length === 0) return

  for (const fid of Object.keys(world.factions)) {
    const holdsAll = luoyangTiles.every((t) => t.owner === fid)
    const faction = world.factions[fid]
    if (!faction) continue

    if (holdsAll) {
      faction.luoyangHoldTicks = (faction.luoyangHoldTicks ?? 0) + 1
    } else {
      faction.luoyangHoldTicks = 0
    }
  }
}
