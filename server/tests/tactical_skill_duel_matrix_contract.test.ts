import assert from 'node:assert/strict'
import {
  buildTacticalCombatantFromGeneralCatalog,
  getGeneralSkillCatalogEntry,
} from '../../shared/domain/generalProfileCatalog'
import { runRepresentativeTacticalDuelMatrix } from '../../shared/domain/tacticalSkillRules'

const commandSkill = getGeneralSkillCatalogEntry('lib_s_command_battle_banner')
const activeSkill = getGeneralSkillCatalogEntry('lib_s_active_fire_raid')
const passiveSkill = getGeneralSkillCatalogEntry('lib_s_passive_fortified_mind')
const chaseSkill = getGeneralSkillCatalogEntry('lib_s_chase_rending_charge')

function testZhangLiaoVsZhaoYunMatrixDistribution() {
  const zhangLiao = buildTacticalCombatantFromGeneralCatalog(
    '100027',
    [commandSkill.id, chaseSkill.id],
  )
  const zhaoYun = buildTacticalCombatantFromGeneralCatalog(
    '100021',
    [passiveSkill.id, activeSkill.id],
    { strength: 20_000 },
  )

  const matrix = runRepresentativeTacticalDuelMatrix({
    seedCount: 128,
    seedPrefix: 'contract:zhang-vs-zhao',
    attacker: zhangLiao,
    defender: zhaoYun,
  })

  assert.equal(matrix.seedPrefix, 'contract:zhang-vs-zhao')
  assert.equal(matrix.seedCount, 128)
  assert.equal(matrix.maxRounds, 8)
  assert.deepEqual(matrix.attacker, {
    heroId: '100027',
    heroName: '张辽',
    innateSkillId: 'innate_100027',
    equippedSkillIds: [commandSkill.id, chaseSkill.id],
  })
  assert.deepEqual(matrix.defender, {
    heroId: '100021',
    heroName: '赵云',
    innateSkillId: 'innate_100021',
    equippedSkillIds: [passiveSkill.id, activeSkill.id],
  })
  assert.deepEqual(matrix.outcomeLabels, {
    win: 'attacker:张辽',
    loss: 'defender:赵云',
    draw: 'draw',
  })
  assert.deepEqual(matrix.outcomes, {
    win: 35,
    loss: 93,
    draw: 0,
  })
  assert.deepEqual(matrix.rates, {
    win: 0.2734,
    loss: 0.7266,
    draw: 0,
  })
  assert.equal(matrix.averageRounds, 3.63)
  assert.equal(matrix.averageAttackerDamage, 13810.86)
  assert.equal(matrix.averageDefenderDamage, 8823.06)
}

function testDrawDistributionCanBeMeasured() {
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

  const matrix = runRepresentativeTacticalDuelMatrix({
    seedCount: 32,
    seedPrefix: 'contract:durable-draw',
    damageScale: 0.01,
    attacker: durableZhangLiao,
    defender: durableZhaoYun,
  })

  assert.deepEqual(matrix.outcomes, {
    win: 0,
    loss: 0,
    draw: 32,
  })
  assert.deepEqual(matrix.rates, {
    win: 0,
    loss: 0,
    draw: 1,
  })
  assert.equal(matrix.averageRounds, 8)
}

function testInvalidSeedCountIsRejected() {
  const zhangLiao = buildTacticalCombatantFromGeneralCatalog(
    '100027',
    [commandSkill.id, chaseSkill.id],
  )
  const zhaoYun = buildTacticalCombatantFromGeneralCatalog(
    '100021',
    [passiveSkill.id, activeSkill.id],
  )

  assert.throws(
    () => runRepresentativeTacticalDuelMatrix({
      seedCount: 0,
      attacker: zhangLiao,
      defender: zhaoYun,
    }),
    /seedCount must be a positive integer/,
  )
}

function run() {
  testZhangLiaoVsZhaoYunMatrixDistribution()
  testDrawDistributionCanBeMeasured()
  testInvalidSeedCountIsRejected()

  console.log('[tactical_skill_duel_matrix_contract] all checks passed')
}

run()
