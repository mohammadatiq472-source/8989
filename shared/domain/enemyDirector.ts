import { buildTheaterSnapshot } from './theater'
import type { Tile, WorldState } from '../contracts/game'

type EnemyDirectorOptions = {
  defenderFactionId: string
  targetFactionId: string
}

export type OpposingDirectorOptions = EnemyDirectorOptions

function resolveDefaultOpposingDirectorOptions(world: WorldState): OpposingDirectorOptions {
  const factionIds = Object.keys(world.factions)
  const targetFactionId = factionIds[0] ?? 'neutral'
  const defenderFactionId = factionIds.find((factionId) => factionId !== targetFactionId) ?? targetFactionId
  return { defenderFactionId, targetFactionId }
}

export function runOpposingDirector(world: WorldState, options?: OpposingDirectorOptions) {
  const resolvedOptions = options ?? resolveDefaultOpposingDirectorOptions(world)
  const { defenderFactionId, targetFactionId } = resolvedOptions
  const actions: string[] = []
  const theater = buildTheaterSnapshot(world, targetFactionId)
  const northRecon = theater.macroRegions.find((region) => region.id === 'north_recon')
  const westFront = theater.macroRegions.find((region) => region.id === 'west_front')
  const eastExpansion = theater.macroRegions.find((region) => region.id === 'east_expansion')

  const scout = world.units.find((unit) => unit.id === 'e2')
  const reserve = world.units.find((unit) => unit.id === 'e4')
  const fortress = world.units.find((unit) => unit.id === 'e1')
  const easternGuard = world.units.find((unit) => unit.id === 'e3')

  if (scout) {
    const nextScoutTileId = (northRecon?.scoutingCoverage ?? 0) >= 60 ? 'tile_05' : 'tile_04'
    const nextScoutTile = world.map.tiles.find((tile) => tile.id === nextScoutTileId)

    if (
      nextScoutTile &&
      scout.tileId !== nextScoutTile.id &&
      canOpposingUnitMoveInto(world, nextScoutTile, targetFactionId)
    ) {
      scout.tileId = nextScoutTile.id
      scout.status = '侦察中'
      scout.currentTask = `盯防${nextScoutTile.name}`
      actions.push(`敌侦察转移至 ${nextScoutTile.name}`)
    }
  }

  const westPass = world.map.tiles.find((tile) => tile.id === 'tile_06')
  const riverPlain = world.map.tiles.find((tile) => tile.id === 'tile_07')
  const northJunction = world.map.tiles.find((tile) => tile.id === 'tile_09')
  const easternPass = world.map.tiles.find((tile) => tile.id === 'tile_15')
  const eastResource = world.map.tiles.find((tile) => tile.id === 'tile_14')
  const midSupply = world.map.tiles.find((tile) => tile.id === 'tile_13')

  if (westPass && westFront && (westFront.friendlyUnits >= 1 || westFront.control !== defenderFactionId)) {
    westPass.enemyPressure = Math.min(5, westPass.enemyPressure + 1)
    actions.push(`敌方对 ${westPass.name} 增加强压`)
  }

  if (riverPlain && westFront && westFront.friendlyUnits >= 2) {
    riverPlain.enemyPressure = Math.min(5, riverPlain.enemyPressure + 1)
    actions.push(`敌方对 ${riverPlain.name} 实施压制`)
  }

  if (reserve && northJunction) {
    reserve.tileId = 'tile_09'
    reserve.status = '驻防中'
    reserve.currentTask = `压住${northJunction.name}`
    northJunction.enemyPressure = Math.min(5, northJunction.enemyPressure + 1)
    actions.push(`敌机动稳固 ${northJunction.name}`)
  }

  if (midSupply && theater.supplyLineHealth >= 60) {
    midSupply.enemyPressure = Math.min(5, midSupply.enemyPressure + 1)
    actions.push(`敌军开始试探 ${midSupply.name}，意图切断我方补给线`)
  }

  if (fortress) {
    fortress.status = '驻防中'
    fortress.currentTask = '固守赤垒要塞'
  }

  if (easternGuard && easternPass) {
    easternGuard.status = '驻防中'
    easternGuard.currentTask = `卡住${easternPass.name}`
    easternPass.enemyPressure = Math.min(5, easternPass.enemyPressure + 1)
    actions.push(`敌左翼强化 ${easternPass.name}`)
  }

  if (eastResource && eastExpansion && (eastExpansion.friendlyUnits > 0 || eastExpansion.friendlyControlledTiles > 0)) {
    eastResource.enemyPressure = Math.min(5, eastResource.enemyPressure + 1)
    actions.push(`敌军察觉我方向 ${eastResource.name} 发育，开始加压`)
  }

  // Generic AI for all defender units not covered by hardcoded logic above.
  const handledUnitIds = new Set(['e1', 'e2', 'e3', 'e4'])
  const unhandledOpposingUnits = world.units.filter(
    (unit) => unit.faction === defenderFactionId && !handledUnitIds.has(unit.id),
  )

  for (const unit of unhandledOpposingUnits) {
    const currentTile = world.map.tiles.find((tile) => tile.id === unit.tileId)
    if (!currentTile) continue

    const connectedIds: string[] = world.map.connections[currentTile.id] ?? []
    const neighborTiles = connectedIds
      .map((id: string) => world.map.tiles.find((tile) => tile.id === id))
      .filter((tile): tile is Tile => tile !== undefined)

    if (currentTile.owner === defenderFactionId) {
      unit.status = '驻防中'
      unit.currentTask = `驻守 ${currentTile.name}`
      currentTile.enemyPressure = Math.min(5, currentTile.enemyPressure + 1)
      continue
    }

    const moveTarget = neighborTiles
      .filter((tile) => canOpposingUnitMoveInto(world, tile, targetFactionId))
      .sort((a: Tile, b: Tile) => {
        const scoreA =
          (a.owner === targetFactionId ? 3 : 0) + (a.type === 'resource' ? 2 : 0) + (a.type === 'pass' ? 2 : 0)
        const scoreB =
          (b.owner === targetFactionId ? 3 : 0) + (b.type === 'resource' ? 2 : 0) + (b.type === 'pass' ? 2 : 0)
        return scoreB - scoreA
      })[0]

    if (moveTarget) {
      unit.tileId = moveTarget.id
      unit.status = '行军中'
      unit.currentTask = `向 ${moveTarget.name} 推进`
      moveTarget.enemyPressure = Math.min(5, moveTarget.enemyPressure + 1)
      actions.push(`敌 ${unit.name} 向 ${moveTarget.name} 推进`)
    }
  }

  return actions
}

function canOpposingUnitMoveInto(world: WorldState, tile: Tile, targetFactionId: string) {
  return !world.units.some((unit) => unit.faction === targetFactionId && unit.tileId === tile.id)
}

// Backward compatibility: keep old API export name while semantic naming migrates.
export function runEnemyDirector(world: WorldState, options?: EnemyDirectorOptions) {
  return runOpposingDirector(world, options)
}
