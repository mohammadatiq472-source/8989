import assert from 'node:assert/strict'
import {
  buildTacticalCombatantFromGeneralCatalog,
  getGeneralProfileCatalogEntry,
  getGeneralSkillCatalogEntry,
  loadGeneralProfileCatalog,
  loadGeneralSkillCatalog,
} from '../../shared/domain/generalProfileCatalog'
import {
  listRepresentativeTacticalSkillFormulas,
  resolveRepresentativeTacticalDuel,
  validateTacticalLoadout,
  type TacticalSkillEvent,
} from '../../shared/domain/tacticalSkillRules'

const zhangLiaoProfile = getGeneralProfileCatalogEntry('100027')
const zhaoYunProfile = getGeneralProfileCatalogEntry('100021')
const commandSkill = getGeneralSkillCatalogEntry('lib_s_command_battle_banner')
const activeSkill = getGeneralSkillCatalogEntry('lib_s_active_fire_raid')
const passiveSkill = getGeneralSkillCatalogEntry('lib_s_passive_fortified_mind')
const chaseSkill = getGeneralSkillCatalogEntry('lib_s_chase_rending_charge')

const zhangLiao = buildTacticalCombatantFromGeneralCatalog(
  '100027',
  [commandSkill.id, chaseSkill.id],
)

const zhaoYun = buildTacticalCombatantFromGeneralCatalog(
  '100021',
  [passiveSkill.id, activeSkill.id],
  { strength: 20_000 },
)

function findEvent(events: TacticalSkillEvent[], skillId: string) {
  const event = events.find((candidate) => candidate.skillId === skillId)
  assert.ok(event, `${skillId} event should exist`)
  return event
}

function findEvents(events: TacticalSkillEvent[], skillId: string) {
  return events.filter((candidate) => candidate.skillId === skillId)
}

function testCatalogAuthority() {
  const profiles = loadGeneralProfileCatalog()
  const skills = loadGeneralSkillCatalog()

  assert.equal(Object.keys(profiles).length, 27)
  assert.equal(Object.keys(skills).length, 50)
  assert.equal(zhangLiaoProfile.name, '张辽')
  assert.deepEqual(zhangLiaoProfile.attributes, {
    force: 138,
    command: 102,
    intelligence: 118,
    charisma: 6,
    speed: 88,
  })
  assert.deepEqual(zhangLiaoProfile.growth, {
    force: 2.42,
    command: 1.66,
    intelligence: 0.92,
    charisma: 0.82,
    speed: 2.05,
  })
  assert.equal(zhangLiaoProfile.innateSkill.id, 'innate_100027')
  assert.equal(zhangLiaoProfile.innateSkill.name, '威震逍遥')
  assert.equal(zhangLiaoProfile.learnableSkillSlots, 2)
  assert.equal(zhaoYunProfile.innateSkill.id, 'innate_100021')
  assert.equal(zhaoYunProfile.innateSkill.name, '长坂护主')
  assert.equal(commandSkill.name, '军势旌旗')
  assert.equal(activeSkill.name, '烈焰突袭')
  assert.equal(passiveSkill.name, '固本守心')
  assert.equal(chaseSkill.name, '破阵追袭')
}

function testFormulaCoverage() {
  const formulas = listRepresentativeTacticalSkillFormulas()
  const equippedTypes = new Set(
    formulas
      .filter((formula) => formula.slot === 'equipped')
      .map((formula) => formula.type),
  )

  assert.deepEqual(
    [...equippedTypes].sort(),
    ['active', 'chase', 'command', 'passive'],
    'representative formulas should cover command/active/passive/chase equipped skills',
  )
  assert.equal(formulas.filter((formula) => formula.slot === 'innate').length, 27)
}

function testLoadoutContract() {
  assert.deepEqual(validateTacticalLoadout(zhangLiao), [])
  assert.deepEqual(validateTacticalLoadout(zhaoYun), [])

  assert.throws(
    () => buildTacticalCombatantFromGeneralCatalog(
      '100027',
      [commandSkill.id, chaseSkill.id, activeSkill.id],
    ),
    /at most 2 general skills/,
  )

  const invalid = validateTacticalLoadout({
    ...zhangLiao,
    innateSkillId: 'innate_100021',
    equippedSkillIds: [
      commandSkill.id,
      chaseSkill.id,
      activeSkill.id,
    ],
  })

  assert.ok(
    invalid.some((message) => message.includes('fixed to innate_100027')),
    'hero innate tactical skill should be fixed by hero id',
  )
  assert.ok(
    invalid.some((message) => message.includes('at most two equipped')),
    'hero should not equip more than two extra tactical skills',
  )
}

function testEightRoundDecisiveResult() {
  const report = resolveRepresentativeTacticalDuel({
    round: 1,
    maxRounds: 8,
    seed: 'catalog-authority-decisive-duel',
    attacker: zhangLiao,
    defender: zhaoYun,
    activationRolls: {
      '100027:innate_100027': 12,
      '100027:lib_s_chase_rending_charge': 16,
      '100021:lib_s_active_fire_raid': 21,
    },
  })

  assert.equal(report.attacker.heroId, '100027')
  assert.equal(report.attacker.innateSkillId, zhangLiaoProfile.innateSkill.id)
  assert.deepEqual(report.attacker.equippedSkillIds, [commandSkill.id, chaseSkill.id])
  assert.equal(report.defender.heroId, '100021')
  assert.equal(report.defender.innateSkillId, zhaoYunProfile.innateSkill.id)
  assert.deepEqual(report.defender.equippedSkillIds, [passiveSkill.id, activeSkill.id])

  assert.equal(report.attacker.baseStats.force, zhangLiaoProfile.attributes.force)
  assert.equal(report.attacker.baseStats.speed, zhangLiaoProfile.attributes.speed)
  assert.equal(report.attacker.effectiveStats.force, 154.56)
  assert.equal(report.attacker.effectiveStats.speed, 95.04)
  assert.equal(report.defender.baseStats.command, zhaoYunProfile.attributes.command)
  assert.equal(report.defender.baseStats.intelligence, zhaoYunProfile.attributes.intelligence)
  assert.equal(report.defender.effectiveStats.command, 126.45)
  assert.equal(report.defender.effectiveStats.intelligence, 112.2)

  const commandEvent = findEvent(report.events, commandSkill.id)
  assert.equal(commandEvent.round, 1)
  assert.equal(commandEvent.phase, 'battle_start')
  assert.ok(commandEvent.notes.includes('force+12%'))
  assert.ok(commandEvent.notes.includes('evasion:active/chase'))

  const passiveEvent = findEvent(report.events, passiveSkill.id)
  assert.equal(passiveEvent.phase, 'battle_start')
  assert.ok(passiveEvent.notes.includes('damageReduction+8%'))

  const chaseEvent = findEvent(report.events, chaseSkill.id)
  assert.equal(chaseEvent.activated, true)
  assert.equal(chaseEvent.activationRoll, 16)
  assert.equal(chaseEvent.damageRate, 1.85)
  assert.equal(chaseEvent.damage, 5222)

  const innateEvent = findEvent(report.events, zhangLiaoProfile.innateSkill.id)
  assert.equal(innateEvent.activated, true)
  assert.equal(innateEvent.activationRoll, 12)
  assert.equal(innateEvent.damageRate, 1.43)
  assert.equal(innateEvent.damage, 4023)

  const fireEvent = findEvent(report.events, activeSkill.id)
  assert.equal(fireEvent.activated, true)
  assert.equal(fireEvent.activationRoll, 21)
  assert.equal(fireEvent.damageRate, 1)
  assert.equal(fireEvent.damage, 0)
  assert.equal(fireEvent.preventedDamage, 1910)

  assert.equal(report.winner, 'attacker')
  assert.equal(report.outcomeReason, 'defender_defeated')
  assert.equal(report.round, 2)
  assert.equal(report.maxRounds, 8)
  assert.equal(report.attacker.strengthAfter, 7578)
  assert.equal(report.defender.strengthAfter, 0)
}

function testRoundLimitDraw() {
  const durableZhangLiao = buildTacticalCombatantFromGeneralCatalog(
    '100027',
    [commandSkill.id, chaseSkill.id],
    { strength: 1_000_000 },
  )
  const durableZhaoYun = buildTacticalCombatantFromGeneralCatalog(
    '100021',
    [passiveSkill.id, activeSkill.id],
    { strength: 1_000_000 },
  )

  const report = resolveRepresentativeTacticalDuel({
    round: 1,
    maxRounds: 8,
    damageScale: 0.01,
    seed: 'catalog-authority-round-limit-draw',
    attacker: durableZhangLiao,
    defender: durableZhaoYun,
    activationRolls: {
      '100027:innate_100027': 99,
      '100027:lib_s_chase_rending_charge': 99,
      '100021:lib_s_active_fire_raid': 99,
    },
  })

  assert.equal(report.round, 8)
  assert.equal(report.winner, 'draw')
  assert.equal(report.outcomeReason, 'round_limit')
  assert.ok(report.attacker.strengthAfter > 0)
  assert.ok(report.defender.strengthAfter > 0)
  assert.notEqual(
    report.attacker.strengthAfter,
    report.defender.strengthAfter,
    'round-limit draw must not be decided by higher remaining strength',
  )
  assert.equal(findEvents(report.events, 'normal_attack').length, 16)
}

function testDamageTakenDamageRateScaling() {
  const simaYi = buildTacticalCombatantFromGeneralCatalog(
    '100709',
    [],
    { strength: 30_000 },
  )
  const zhugeLiang = buildTacticalCombatantFromGeneralCatalog(
    '100017',
    [],
    { strength: 30_000 },
  )

  const report = resolveRepresentativeTacticalDuel({
    round: 1,
    maxRounds: 4,
    seed: 'sima-damage-taken-scaling-contract',
    attacker: simaYi,
    defender: zhugeLiang,
    activationRolls: {
      '100709:innate_100709': 1,
    },
  })

  const simaYiEvents = findEvents(report.events, 'innate_100709')
  assert.equal(simaYiEvents.length, 3)
  assert.equal(simaYiEvents[0].damageRate, 0.95)
  assert.equal(simaYiEvents[1].damageRate, 1.51)
  assert.equal(simaYiEvents[1].damage, 5693)
  assert.ok(simaYiEvents[1].notes.includes('damageTakenDamageRateBonus+0.56'))
  assert.ok(simaYiEvents[1].notes.includes('damageTakenDamageRateMinRound=2'))
}

function run() {
  testCatalogAuthority()
  testFormulaCoverage()
  testLoadoutContract()
  testEightRoundDecisiveResult()
  testRoundLimitDraw()
  testDamageTakenDamageRateScaling()
  console.log('[tactical_skill_rules_contract] all checks passed')
}

run()
