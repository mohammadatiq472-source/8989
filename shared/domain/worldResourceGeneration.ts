import type { ResourceKind, Tile, TileTerrain, WorldResourceGenerationMetadata } from '../contracts/game'

export type WorldResourceLevelWeight = {
  level: number
  weight: number
}

export type WorldResourceKindWeight = {
  kind: ResourceKind
  weight: number
}

export type WorldResourceGenerationPolicy = {
  worldSeed: string
  generationVersion: string
  resourceTileDensityPermille: number
  levelWeightTable: WorldResourceLevelWeight[]
  kindWeightTable: WorldResourceKindWeight[]
}

export type WorldResourceGenerationSummary = WorldResourceGenerationMetadata

export type WorldResourceTileNormalizationResult = {
  tiles: Tile[]
  changed: boolean
}

export const DEFAULT_WORLD_RESOURCE_GENERATION_POLICY: WorldResourceGenerationPolicy = {
  worldSeed: 'initial_world_v1_resource_seed_2026_04',
  generationVersion: 'world_resource_generation_v1',
  resourceTileDensityPermille: 480,
  levelWeightTable: [
    { level: 1, weight: 360 },
    { level: 2, weight: 250 },
    { level: 3, weight: 170 },
    { level: 4, weight: 110 },
    { level: 5, weight: 60 },
    { level: 6, weight: 30 },
    { level: 7, weight: 12 },
    { level: 8, weight: 6 },
    { level: 9, weight: 2 },
  ],
  kindWeightTable: [
    { kind: 'food', weight: 250 },
    { kind: 'wood', weight: 250 },
    { kind: 'stone', weight: 250 },
    { kind: 'iron', weight: 250 },
  ],
}

export function shouldGenerateWorldResourceTile(
  x: number,
  y: number,
  provinceId: string,
  policy: WorldResourceGenerationPolicy = DEFAULT_WORLD_RESOURCE_GENERATION_POLICY,
) {
  return deterministicRoll(policy, x, y, provinceId, 'resource-presence') % 1000 < policy.resourceTileDensityPermille
}

export function resolveGeneratedWorldResourceLevel(
  x: number,
  y: number,
  provinceId: string,
  policy: WorldResourceGenerationPolicy = DEFAULT_WORLD_RESOURCE_GENERATION_POLICY,
) {
  return pickWeightedValue(
    policy.levelWeightTable,
    deterministicRoll(policy, x, y, provinceId, 'resource-level'),
    (entry) => entry.level,
  )
}

export function resolveGeneratedWorldResourceKind(
  x: number,
  y: number,
  provinceId: string,
  terrain: TileTerrain,
  policy: WorldResourceGenerationPolicy = DEFAULT_WORLD_RESOURCE_GENERATION_POLICY,
): ResourceKind {
  const terrainBiasedWeights = policy.kindWeightTable.map((entry) => {
    let weight = entry.weight
    if (terrain === 'forest' && entry.kind === 'wood') weight += 180
    if ((terrain === 'mountain' || terrain === 'highland') && (entry.kind === 'stone' || entry.kind === 'iron')) {
      weight += 120
    }
    if ((terrain === 'grassland' || terrain === 'riverland') && entry.kind === 'food') weight += 160
    return { ...entry, weight }
  })

  return pickWeightedValue(
    terrainBiasedWeights,
    deterministicRoll(policy, x, y, provinceId, 'resource-kind'),
    (entry) => entry.kind,
  )
}

export function buildWorldResourceGenerationSummary(
  tiles: Tile[],
  policy: WorldResourceGenerationPolicy = DEFAULT_WORLD_RESOURCE_GENERATION_POLICY,
): WorldResourceGenerationSummary {
  const levelCounts: Record<string, number> = {}
  const kindCounts: Record<ResourceKind, number> = {
    food: 0,
    wood: 0,
    stone: 0,
    iron: 0,
  }
  let generatedResourceTileCount = 0

  for (const tile of tiles) {
    if (tile.type !== 'resource') {
      continue
    }
    generatedResourceTileCount += 1
    const level = String(Math.max(1, Math.min(9, Math.floor(tile.resourceLevel ?? 1))))
    levelCounts[level] = (levelCounts[level] ?? 0) + 1
    const kind = tile.resourceKind ?? 'food'
    kindCounts[kind] = (kindCounts[kind] ?? 0) + 1
  }

  return {
    worldSeed: policy.worldSeed,
    generationVersion: policy.generationVersion,
    resourceTileDensityPermille: policy.resourceTileDensityPermille,
    levelWeightTable: policy.levelWeightTable.map((entry) => ({ ...entry })),
    kindWeightTable: policy.kindWeightTable.map((entry) => ({ ...entry })),
    generatedResourceTileCount,
    levelCounts,
    kindCounts,
  }
}

export function normalizeGeneratedWorldResourceTiles(
  tiles: Tile[],
  policy: WorldResourceGenerationPolicy = DEFAULT_WORLD_RESOURCE_GENERATION_POLICY,
): WorldResourceTileNormalizationResult {
  let changed = false
  const normalizedTiles = tiles.map((tile) => {
    if (tile.type !== 'resource') {
      return tile
    }

    const level = normalizeResourceLevel(tile.resourceLevel)
      ?? resolveGeneratedWorldResourceLevel(tile.x, tile.y, tile.district ?? '', policy)
    const kind = normalizeResourceKind(tile.resourceKind)
      ?? resolveGeneratedWorldResourceKind(tile.x, tile.y, tile.district ?? '', tile.terrain, policy)

    if (level === tile.resourceLevel && kind === tile.resourceKind) {
      return tile
    }

    changed = true
    return {
      ...tile,
      resourceLevel: level,
      resourceKind: kind,
    }
  })

  return {
    tiles: changed ? normalizedTiles : tiles,
    changed,
  }
}

export function normalizeWorldResourceGenerationMetadata(
  tiles: Tile[],
  existingMetadata?: WorldResourceGenerationMetadata,
  fallbackPolicy: WorldResourceGenerationPolicy = DEFAULT_WORLD_RESOURCE_GENERATION_POLICY,
): WorldResourceGenerationMetadata {
  return buildWorldResourceGenerationSummary(tiles, {
    worldSeed: normalizeNonEmptyString(existingMetadata?.worldSeed) ?? fallbackPolicy.worldSeed,
    generationVersion: normalizeNonEmptyString(existingMetadata?.generationVersion) ?? fallbackPolicy.generationVersion,
    resourceTileDensityPermille:
      normalizePositiveInteger(existingMetadata?.resourceTileDensityPermille)
      ?? fallbackPolicy.resourceTileDensityPermille,
    levelWeightTable:
      normalizeLevelWeightTable(existingMetadata?.levelWeightTable)
      ?? fallbackPolicy.levelWeightTable,
    kindWeightTable:
      normalizeKindWeightTable(existingMetadata?.kindWeightTable)
      ?? fallbackPolicy.kindWeightTable,
  })
}

function deterministicRoll(
  policy: WorldResourceGenerationPolicy,
  x: number,
  y: number,
  provinceId: string,
  salt: string,
) {
  return hashToUint32(`${policy.worldSeed}:${policy.generationVersion}:${salt}:${provinceId}:${x}:${y}`)
}

function pickWeightedValue<T extends { weight: number }, R>(entries: T[], roll: number, select: (entry: T) => R): R {
  const totalWeight = entries.reduce((total, entry) => total + Math.max(0, entry.weight), 0)
  if (totalWeight <= 0 || entries.length === 0) {
    throw new Error('world resource generation requires at least one positive weight')
  }

  let cursor = roll % totalWeight
  for (const entry of entries) {
    const weight = Math.max(0, entry.weight)
    if (cursor < weight) {
      return select(entry)
    }
    cursor -= weight
  }

  return select(entries[entries.length - 1])
}

function hashToUint32(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function normalizeResourceLevel(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }
  return Math.max(1, Math.min(9, Math.round(value)))
}

function normalizeResourceKind(value: ResourceKind | undefined): ResourceKind | undefined {
  if (value === 'food' || value === 'wood' || value === 'stone' || value === 'iron') {
    return value
  }
  return undefined
}

function normalizeNonEmptyString(value: string | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function normalizePositiveInteger(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }
  return Math.max(1, Math.floor(value))
}

function normalizeLevelWeightTable(value: WorldResourceLevelWeight[] | undefined) {
  const normalized = (value ?? [])
    .map((entry) => ({
      level: normalizeResourceLevel(entry.level),
      weight: normalizePositiveInteger(entry.weight) ?? 0,
    }))
    .filter((entry): entry is WorldResourceLevelWeight => entry.level !== undefined && entry.weight > 0)

  return normalized.length > 0 ? normalized : undefined
}

function normalizeKindWeightTable(value: WorldResourceKindWeight[] | undefined) {
  const normalized = (value ?? [])
    .map((entry) => ({
      kind: normalizeResourceKind(entry.kind),
      weight: normalizePositiveInteger(entry.weight) ?? 0,
    }))
    .filter((entry): entry is WorldResourceKindWeight => entry.kind !== undefined && entry.weight > 0)

  return normalized.length > 0 ? normalized : undefined
}
