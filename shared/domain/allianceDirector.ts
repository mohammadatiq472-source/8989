import { buildTheaterSnapshot, getRegionById } from './theater'
import type { AllianceActionSummary, Tile, WorldState } from '../contracts/game'

function resolveDefaultBeneficiaryFactionId(world: WorldState) {
  const factionIds = Object.keys(world.factions)
  return factionIds.find((factionId) => factionId !== 'neutral') ?? factionIds[0] ?? 'neutral'
}

function resolvePrimaryRivalFactionId(world: WorldState, beneficiaryFactionId: string) {
  return Object.keys(world.factions).find((factionId) => factionId !== beneficiaryFactionId) ?? beneficiaryFactionId
}

export function runAllianceDirector(world: WorldState, beneficiaryFactionId: string = resolveDefaultBeneficiaryFactionId(world)) {
  const actions: AllianceActionSummary[] = []
  const rivalFactionId = resolvePrimaryRivalFactionId(world, beneficiaryFactionId)
  const theater = buildTheaterSnapshot(world, beneficiaryFactionId)

  for (const directive of Object.values(world.alliance.directives)) {
    const region = getRegionById(world, directive.regionId)
    const regionSummary = theater.macroRegions.find((item) => item.id === directive.regionId)
    const commander = world.alliance.commanders.find(
      (candidate) => candidate.id === directive.assignedCommanderId,
    )

    if (!region || !regionSummary || !commander) {
      continue
    }

    const targetTile = pickAllianceTargetTile(world, region.tileIds, directive.stance, beneficiaryFactionId, rivalFactionId)
    if (!targetTile) {
      continue
    }
    const anchorUnit = pickAllianceAnchorUnit(world, beneficiaryFactionId, region.tileIds)

    switch (directive.stance) {
      case 'hold':
        targetTile.enemyPressure = Math.max(0, targetTile.enemyPressure - 1)
        actions.push(
          createAllianceAction(
            world,
            region.id,
            'low',
            `${commander.name} 稳住 ${region.name}`,
            `${commander.name} 在 ${targetTile.name} 加固警戒，压低敌压并维持补给秩序。`,
            {
              factionId: beneficiaryFactionId,
              unitId: anchorUnit?.id,
              tileId: targetTile.id,
              fromTileId: anchorUnit?.tileId,
              toTileId: targetTile.id,
            },
          ),
        )
        break
      case 'support':
        targetTile.enemyPressure = Math.max(0, targetTile.enemyPressure - 1)
        for (const unit of world.units) {
          if (unit.faction === beneficiaryFactionId && region.tileIds.includes(unit.tileId)) {
            unit.supply = Math.min(9, unit.supply + 1)
          }
        }
        actions.push(
          createAllianceAction(
            world,
            region.id,
            'medium',
            `${commander.name} 策应 ${region.name}`,
            `${commander.name} 向 ${region.name} 输送补给和侧翼策应，减轻 ${targetTile.name} 压力。`,
            {
              factionId: beneficiaryFactionId,
              unitId: anchorUnit?.id,
              tileId: targetTile.id,
              fromTileId: anchorUnit?.tileId,
              toTileId: targetTile.id,
            },
          ),
        )
        break
      case 'harass':
        targetTile.enemyPressure = Math.max(0, targetTile.enemyPressure - 1)
        world.intel[targetTile.id] = {
          level: 'confirmed',
          lastScoutedTick: world.tick,
          summary: `盟友骚扰后回传：${targetTile.name} 敌压 ${targetTile.enemyPressure}。`,
        }
        actions.push(
          createAllianceAction(
            world,
            region.id,
            'medium',
            `${commander.name} 骚扰 ${targetTile.name}`,
            `${commander.name} 对 ${targetTile.name} 发起袭扰并共享视野，压低敌军组织度。`,
            {
              factionId: beneficiaryFactionId,
              unitId: anchorUnit?.id,
              tileId: targetTile.id,
              fromTileId: anchorUnit?.tileId,
              toTileId: targetTile.id,
            },
          ),
        )
        break
      case 'expand':
        targetTile.enemyPressure = Math.max(0, targetTile.enemyPressure - 1)
        if (targetTile.owner === 'neutral' && targetTile.type === 'resource') {
          targetTile.owner = beneficiaryFactionId
        }
        actions.push(
          createAllianceAction(
            world,
            region.id,
            'high',
            `${commander.name} 推进 ${region.name}`,
            `${commander.name} 在 ${targetTile.name} 展开同盟先遣推进，为我方打开发展或接敌空间。`,
            {
              factionId: beneficiaryFactionId,
              unitId: anchorUnit?.id,
              tileId: targetTile.id,
              fromTileId: anchorUnit?.tileId,
              toTileId: targetTile.id,
            },
          ),
        )
        break
    }
  }

  if (actions.length > 0) {
    world.feedback.allianceActions = [...actions, ...world.feedback.allianceActions].slice(0, 8)
  }

  return actions
}

function pickAllianceTargetTile(
  world: WorldState,
  regionTileIds: string[],
  stance: string,
  beneficiaryFactionId: string,
  rivalFactionId: string,
) {
  const regionTiles = regionTileIds
    .map((tileId) => world.map.tiles.find((tile) => tile.id === tileId))
    .filter((tile): tile is Tile => !!tile)

  if (stance === 'expand') {
    return (
      regionTiles.find((tile) => tile.type === 'resource' && tile.owner !== rivalFactionId) ??
      regionTiles.sort((left, right) => right.enemyPressure - left.enemyPressure)[0]
    )
  }

  if (stance === 'harass') {
    return regionTiles.sort((left, right) => right.enemyPressure - left.enemyPressure)[0]
  }

  if (stance === 'support') {
    return (
      regionTiles.find((tile) => world.units.some((unit) => unit.faction === beneficiaryFactionId && unit.tileId === tile.id)) ??
      regionTiles.sort((left, right) => right.enemyPressure - left.enemyPressure)[0]
    )
  }

  return regionTiles.sort((left, right) => left.enemyPressure - right.enemyPressure)[0]
}

function createAllianceAction(
  world: WorldState,
  regionId: string,
  severity: AllianceActionSummary['severity'],
  title: string,
  detail: string,
  context?: {
    factionId?: string
    unitId?: string
    tileId?: string
    fromTileId?: string
    toTileId?: string
  },
): AllianceActionSummary {
  return {
    id: `${world.tick}-${regionId}-${title}`,
    tick: world.tick,
    regionId,
    title,
    detail,
    severity,
    factionId: context?.factionId,
    unitId: context?.unitId,
    tileId: context?.tileId,
    fromTileId: context?.fromTileId,
    toTileId: context?.toTileId,
  }
}

function pickAllianceAnchorUnit(world: WorldState, factionId: string, regionTileIds: string[]) {
  return world.units.find((unit) => unit.faction === factionId && regionTileIds.includes(unit.tileId))
    ?? world.units.find((unit) => unit.faction === factionId)
}
