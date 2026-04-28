import assert from 'node:assert/strict'
import type { SlgGeneralTacticalSkillSlotState, Unit } from '../../shared/contracts/game'
import { createInitialWorldState } from '../../shared/domain/scenario'
import { getTileById, getUnitById, moveUnit } from '../../shared/domain/rules'
import { getGeneralProfileCatalogEntry } from '../../shared/domain/generalProfileCatalog'

function applyCatalogHeroProfile(unit: Unit, heroId: '100021' | '100027') {
  const profile = getGeneralProfileCatalogEntry(heroId)
  unit.hero = {
    ...unit.hero,
    id: `hero_${profile.id}`,
    name: profile.name,
    faction: profile.faction as Unit['hero']['faction'],
    troopType: profile.troopType as Unit['hero']['troopType'],
    cardType: profile.troopType === 'cavalry' ? '骑' : '步',
    level: profile.level,
    force: profile.attributes.force,
    command: profile.attributes.command,
    intelligence: profile.attributes.intelligence,
    charisma: profile.attributes.charisma,
    speed: profile.attributes.speed,
    signatureSkill: {
      name: profile.innateSkill.name,
      detail: profile.innateSkill.description,
    },
  }
}

function setTacticalSkillSlots(
  world: ReturnType<typeof createInitialWorldState>,
  factionId: Unit['faction'],
  slots: Record<string, SlgGeneralTacticalSkillSlotState>,
) {
  world.slgDomainState ??= {}
  world.slgDomainState.generalStateByFaction ??= {}
  world.slgDomainState.generalStateByFaction[factionId] = {
    ...(world.slgDomainState.generalStateByFaction[factionId] ?? {}),
    tacticalSkillSlotsByHeroId: slots,
  }
}

function seedZhangLiaoVsZhaoYunEncounter() {
  const world = createInitialWorldState()
  const attacker = world.units.find((unit) => unit.hero.name === '张辽')
  assert.ok(attacker, 'scenario should contain Zhang Liao unit')
  const targetTileId = world.map.connections[attacker.tileId]?.[0]
  assert.ok(targetTileId, 'Zhang Liao should have an adjacent target tile')
  const targetTile = getTileById(world, targetTileId)
  assert.ok(targetTile, 'target tile should exist')

  targetTile.type = 'plain'
  targetTile.terrain = 'grassland'
  targetTile.owner = 'enemy'
  targetTile.moveCost = 1
  targetTile.enemyPressure = 3
  world.factions.player.actionPoints = 6
  world.factions.player.food = 6

  applyCatalogHeroProfile(attacker, '100027')
  attacker.name = '张辽所部'
  attacker.strength = 100
  attacker.mobility = 34
  attacker.supply = 6
  attacker.status = '待命'
  attacker.currentTask = undefined
  attacker.corps.readiness = 100

  const defender: Unit = structuredClone(attacker)
  applyCatalogHeroProfile(defender, '100021')
  defender.id = 'world_tactical_zhaoyun_defender'
  defender.name = '赵云所部'
  defender.faction = 'enemy'
  defender.tileId = targetTile.id
  defender.strength = 200
  defender.mobility = 34
  defender.supply = 5
  defender.status = '驻防中'
  defender.currentTask = `坚守${targetTile.name}`
  defender.corps = {
    name: '白马护军',
    doctrine: '用真实武将五维和代表战法承接接敌公式验证。',
    specialty: '战法公式验证',
    readiness: 100,
    roster: ['护军前列', '游骑策应'],
  }

  world.units = world.units.filter((unit) => unit.id === attacker.id || unit.tileId !== targetTile.id)
  world.units.push(defender)
  setTacticalSkillSlots(world, 'player', {
    '100027': {
      innateSkillId: 'innate_100027',
      equippedSkillIds: ['lib_s_command_battle_banner', 'lib_s_chase_rending_charge'],
    },
  })
  setTacticalSkillSlots(world, 'enemy', {
    '100021': {
      innateSkillId: 'innate_100021',
      equippedSkillIds: ['lib_s_passive_fortified_mind', 'lib_s_active_fire_raid'],
    },
  })

  return {
    world,
    attackerId: attacker.id,
    defenderId: defender.id,
    originTileId: attacker.tileId,
    targetTileId: targetTile.id,
  }
}

function testDecisiveEncounterReadsFormalSkillSlots() {
  const seeded = seedZhangLiaoVsZhaoYunEncounter()
  const result = moveUnit(seeded.world, seeded.attackerId, seeded.targetTileId, 'player')
  assert.equal(result.ok, true, `moveUnit should resolve tactical encounter: ${result.message}`)
  if (!result.ok) return

  const world = result.world
  const attacker = getUnitById(world, seeded.attackerId)
  assert.equal(attacker, undefined, 'defeated attacker should be removed from the map')

  const defender = getUnitById(world, seeded.defenderId)
  assert.ok(defender, 'winning defender should remain on the contested tile')
  assert.equal(defender.tileId, seeded.targetTileId)
  assert.equal(defender.strength, 147)

  const record = world.feedback.battleRecords[0]
  assert.ok(record, 'tactical encounter should create a battle record')
  assert.equal(record.attackerUnitId, seeded.attackerId)
  assert.equal(record.tileId, seeded.targetTileId)
  assert.equal(record.outcome, 'loss')
  assert.equal(record.attackerLoss, 100)
  assert.equal(record.defenderLoss, 53)
  assert.ok(record.summary.includes('战法公式 张辽[innate_100027+lib_s_command_battle_banner/lib_s_chase_rending_charge]'))
  assert.ok(record.summary.includes('赵云[innate_100021+lib_s_passive_fortified_mind/lib_s_active_fire_raid]'))
  assert.ok(record.summary.includes('第3/8回合防守方胜(attacker_defeated)'))
  assert.ok(record.summary.includes('军势旌旗生效'))
  assert.ok(record.summary.includes('长坂护主生效'))
  assert.ok(record.summary.includes('固本守心生效'))
  assert.ok(record.summary.includes('破阵追袭'))
  assert.ok(record.summary.includes('威震逍遥'))
  assert.ok(record.summary.includes('烈焰突袭'))
  assert.ok(result.message.includes(record.summary), 'move result should surface tactical battle report summary')

  const report = world.reports[0]
  assert.equal(report.title, '前线战法接敌失利')
  assert.ok(report.detail.includes('战法事件'))
}

function testDrawOutcomeProjection() {
  const seeded = seedZhangLiaoVsZhaoYunEncounter()
  const attacker = getUnitById(seeded.world, seeded.attackerId)
  const defender = getUnitById(seeded.world, seeded.defenderId)
  assert.ok(attacker)
  assert.ok(defender)

  for (const unit of [attacker, defender]) {
    unit.strength = 100
    unit.mobility = 0
    unit.hero.force = 1
    unit.hero.command = 9_999
    unit.hero.intelligence = 1
    unit.hero.speed = 1
  }
  setTacticalSkillSlots(seeded.world, 'player', {
    '100027': {
      innateSkillId: 'innate_100027',
      equippedSkillIds: ['lib_s_command_battle_banner'],
    },
  })
  setTacticalSkillSlots(seeded.world, 'enemy', {
    '100021': {
      innateSkillId: 'innate_100021',
      equippedSkillIds: ['lib_s_passive_fortified_mind'],
    },
  })

  const result = moveUnit(seeded.world, seeded.attackerId, seeded.targetTileId, 'player')
  assert.equal(result.ok, true, `moveUnit should resolve draw tactical encounter: ${result.message}`)
  if (!result.ok) return

  const world = result.world
  const attackerAfter = getUnitById(world, seeded.attackerId)
  const defenderAfter = getUnitById(world, seeded.defenderId)
  assert.ok(attackerAfter, 'draw attacker should remain on the map')
  assert.ok(defenderAfter, 'draw defender should remain on the map')
  assert.equal(attackerAfter.tileId, seeded.originTileId)
  assert.equal(defenderAfter.tileId, seeded.targetTileId)

  const record = world.feedback.battleRecords[0]
  assert.equal(record.outcome, 'draw')
  assert.equal(record.attackerLoss, 0)
  assert.equal(record.defenderLoss, 0)
  assert.ok(record.summary.includes('第8/8回合平局(round_limit)'))
  assert.ok(record.summary.includes('innate_100027+lib_s_command_battle_banner'))
  assert.ok(record.summary.includes('innate_100021+lib_s_passive_fortified_mind'))
  assert.ok(!record.summary.includes('破阵追袭'), 'world encounter should not use hardcoded Zhang Liao chase slot')
  assert.ok(!record.summary.includes('烈焰突袭'), 'world encounter should not use hardcoded Zhao Yun active slot')
}

function run() {
  testDecisiveEncounterReadsFormalSkillSlots()
  testDrawOutcomeProjection()

  console.log('[world_tactical_skill_encounter_contract] all checks passed')
}

run()
