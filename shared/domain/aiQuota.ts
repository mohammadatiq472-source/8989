import type { FactionAiQuota, FactionState, WorldState } from '../contracts/game'

export const AI_QUOTA_MAX = 10
export const AI_QUOTA_MIN_INITIAL = 2
export const AI_QUOTA_MAX_INITIAL = 4

type AiQuotaSyncResult = {
  factionId: string
  previousQuota: number
  currentQuota: number
  growthScore: number
  tugIntensity: number
  nextUnlockScore: number | null
}

const AI_QUOTA_THRESHOLDS_BY_SLOT: Readonly<Record<number, number>> = {
  1: 0,
  2: 10,
  3: 24,
  4: 42,
  5: 66,
  6: 94,
  7: 126,
  8: 162,
  9: 202,
  10: 246,
}

export function syncAllFactionAiQuota(world: WorldState): AiQuotaSyncResult[] {
  const results: AiQuotaSyncResult[] = []
  for (const factionId of Object.keys(world.factions)) {
    const result = syncFactionAiQuota(world, factionId)
    if (result) {
      results.push(result)
    }
  }
  return results
}

export function resolveFactionAiQuotaLimit(world: WorldState, factionId: string): number {
  const faction = world.factions[factionId]
  if (!faction) {
    return AI_QUOTA_MAX
  }
  const quota = ensureAiQuotaShape(faction)
  return clampInt(quota.currentQuota, quota.initialQuota, quota.maxQuota)
}

function syncFactionAiQuota(world: WorldState, factionId: string): AiQuotaSyncResult | null {
  const faction = world.factions[factionId]
  if (!faction) {
    return null
  }

  const quota = ensureAiQuotaShape(faction)
  const previousQuota = quota.currentQuota
  const metrics = computeFactionQuotaMetrics(world, factionId)
  const targetQuota = resolveQuotaByScore(metrics.growthScore, quota.initialQuota, quota.maxQuota)
  const nextUnlockScore =
    targetQuota >= quota.maxQuota ? null : AI_QUOTA_THRESHOLDS_BY_SLOT[targetQuota + 1] ?? null

  quota.currentQuota = targetQuota
  quota.growthScore = metrics.growthScore
  quota.tugIntensity = metrics.tugIntensity
  quota.nextUnlockScore = nextUnlockScore
  if (targetQuota > previousQuota) {
    quota.lastGrowthTick = world.tick
  }
  faction.aiQuota = quota

  if (Array.isArray(faction.aiPlayers) && faction.aiPlayers.length > targetQuota) {
    faction.aiPlayers = faction.aiPlayers.slice(0, targetQuota)
  }

  return {
    factionId,
    previousQuota,
    currentQuota: targetQuota,
    growthScore: metrics.growthScore,
    tugIntensity: metrics.tugIntensity,
    nextUnlockScore,
  }
}

function ensureAiQuotaShape(faction: FactionState): FactionAiQuota {
  const existing = faction.aiQuota
  const derivedInitial = deriveInitialQuota(faction)
  const initialQuota = clampInt(existing?.initialQuota ?? derivedInitial, AI_QUOTA_MIN_INITIAL, AI_QUOTA_MAX)
  const maxQuota = clampInt(existing?.maxQuota ?? AI_QUOTA_MAX, initialQuota, AI_QUOTA_MAX)
  const currentQuota = clampInt(existing?.currentQuota ?? initialQuota, initialQuota, maxQuota)

  return {
    initialQuota,
    currentQuota,
    maxQuota,
    growthScore: Math.max(0, Math.round(existing?.growthScore ?? 0)),
    tugIntensity: clampInt(Math.round(existing?.tugIntensity ?? 0), 0, 100),
    nextUnlockScore: existing?.nextUnlockScore ?? AI_QUOTA_THRESHOLDS_BY_SLOT[currentQuota + 1] ?? null,
    lastGrowthTick: existing?.lastGrowthTick,
  }
}

function deriveInitialQuota(faction: FactionState): number {
  const commandLimit = Number.isFinite(faction.heroCommand.commandLimit)
    ? Math.max(1, Math.round(faction.heroCommand.commandLimit))
    : 6
  const derived = Math.max(2, Math.ceil(commandLimit * 0.4))
  return clampInt(derived, AI_QUOTA_MIN_INITIAL, AI_QUOTA_MAX_INITIAL)
}

function resolveQuotaByScore(score: number, initialQuota: number, maxQuota: number): number {
  let resolved = initialQuota
  for (let slot = initialQuota + 1; slot <= maxQuota; slot += 1) {
    const threshold = AI_QUOTA_THRESHOLDS_BY_SLOT[slot]
    if (typeof threshold !== 'number') {
      continue
    }
    if (score >= threshold) {
      resolved = slot
    } else {
      break
    }
  }
  return resolved
}

function computeFactionQuotaMetrics(world: WorldState, factionId: string) {
  const ownedTiles = world.map.tiles.filter((tile) => tile.owner === factionId)
  const resourceTiles = ownedTiles.filter((tile) => tile.type === 'resource').length
  const cityTiles = ownedTiles.filter((tile) => tile.type === 'city').length
  const passTiles = ownedTiles.filter((tile) => tile.type === 'pass').length
  const tileById = new Map(world.map.tiles.map((tile) => [tile.id, tile]))
  const unitFactionById = new Map(world.units.map((unit) => [unit.id, unit.faction]))

  let contestedBorderEdges = 0
  let frontlinePressureSum = 0
  let frontlineTileCount = 0
  for (const tile of ownedTiles) {
    const neighborIds = world.map.connections[tile.id] ?? []
    let isFrontline = false
    for (const neighborId of neighborIds) {
      const neighbor = tileById.get(neighborId)
      if (!neighbor) {
        continue
      }
      if (neighbor.owner && neighbor.owner !== 'neutral' && neighbor.owner !== factionId) {
        contestedBorderEdges += 1
        isFrontline = true
      }
    }
    if (isFrontline) {
      frontlinePressureSum += tile.enemyPressure
      frontlineTileCount += 1
    }
  }

  const averageFrontlinePressure =
    frontlineTileCount > 0 ? frontlinePressureSum / frontlineTileCount : 0

  const recentBattles = world.feedback.battleRecords
    .slice(0, 10)
    .filter(
      (record) =>
        record.attackerFaction === factionId ||
        unitFactionById.get(record.attackerUnitId) === factionId,
    )

  const recentBattleLoss = recentBattles.reduce(
    (sum, record) => sum + (record.attackerFaction === factionId ? record.attackerLoss : record.defenderLoss),
    0,
  )

  const territoryScore = ownedTiles.length * 2 + resourceTiles * 3 + cityTiles * 4 + passTiles * 2
  const engagementScore =
    contestedBorderEdges * 2 +
    recentBattles.length * 6 +
    Math.round(averageFrontlinePressure * 4) +
    Math.round(recentBattleLoss * 0.18)

  const growthScore = Math.max(0, territoryScore + engagementScore)
  const tugIntensity = clampInt(
    Math.round(contestedBorderEdges * 2.2 + recentBattles.length * 8 + averageFrontlinePressure * 9),
    0,
    100,
  )

  return { growthScore, tugIntensity }
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min
  }
  const rounded = Math.round(value)
  if (rounded < min) {
    return min
  }
  if (rounded > max) {
    return max
  }
  return rounded
}
