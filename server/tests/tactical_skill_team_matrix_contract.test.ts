import assert from 'node:assert/strict'
import {
  buildTacticalCombatantFromGeneralCatalog,
  loadGeneralSkillCatalog,
} from '../../shared/domain/generalProfileCatalog'
import {
  resolveRepresentativeTacticalTeamBattle,
  runRepresentativeTacticalTeamMatrix,
  type TacticalTeam,
} from '../../shared/domain/tacticalSkillRules'

const allGeneralSkillIds = Object.keys(loadGeneralSkillCatalog()).sort()

function buildTeam(id: string, name: string, heroIds: string[], strength?: number): TacticalTeam {
  return {
    id,
    name,
    members: heroIds.map((heroId) => buildTacticalCombatantFromGeneralCatalog(
      heroId,
      [],
      strength === undefined ? undefined : { strength },
    )),
  }
}

function testRandomLoadoutThreeVsThreeMatrix() {
  const teamA = buildTeam('teamA', '张辽队', ['100027', '100451', '100031'])
  const teamB = buildTeam('teamB', '赵云队', ['100021', '100023', '100661'])

  const matrix = runRepresentativeTacticalTeamMatrix({
    seedCount: 32,
    seedPrefix: 'contract:random-3v3',
    teamA,
    teamB,
    randomizeEquippedSkillSlots: true,
    equippedSkillPool: allGeneralSkillIds,
  })

  assert.equal(matrix.loadoutMode, 'random_equipped')
  assert.equal(matrix.randomEquippedSkillPoolSize, 50)
  assert.deepEqual(matrix.outcomeLabels, {
    win: 'teamA:张辽队',
    loss: 'teamB:赵云队',
    draw: 'draw',
  })
  assert.deepEqual(matrix.outcomes, {
    win: 10,
    loss: 21,
    draw: 1,
  })
  assert.deepEqual(matrix.rates, {
    win: 0.3125,
    loss: 0.6563,
    draw: 0.0313,
  })
  assert.equal(matrix.averageRounds, 3.06)

  assert.deepEqual(matrix.teamA.members[0].equippedSkillIds, [
    'lib_a_passive_calm_reserve',
    'lib_s_active_thunder_camp',
  ])
  assert.deepEqual(matrix.teamB.members[1].equippedSkillIds, [
    'lib_s_active_fire_raid',
    'lib_a_active_break_morale',
  ])

  assert.deepEqual(matrix.missingFormulaSkillIds, [])

  assert.equal(matrix.skillStats.innate_100027.seenInLoadouts, 32)
  assert.equal(matrix.skillStats.innate_100027.eventCount, 76)
  assert.equal(matrix.skillStats.innate_100027.totalDamage, 40892)
  assert.equal(matrix.skillStats.innate_100451.totalDamage, 72908)
  assert.equal(matrix.skillStats.innate_100661.totalPreventedDamage, 18088)
  assert.equal(matrix.skillStats.lib_s_active_fire_raid.seenInLoadouts, 7)
  assert.equal(matrix.skillStats.lib_s_active_fire_raid.totalDamage, 22564)
  assert.equal(matrix.skillStats.lib_s_active_thunder_camp.seenInLoadouts, 13)
  assert.equal(matrix.skillStats.lib_s_active_thunder_camp.totalDamage, 32367)
  assert.equal(matrix.skillStats.lib_a_active_benevolent_aid.totalHealing, 6804)
  assert.equal(matrix.skillStats.lib_s_command_battle_banner.seenInLoadouts, 6)
}

function testThreeVsThreeRoundLimitDraw() {
  const teamA = buildTeam('teamA', '高兵力甲队', ['100027', '100451', '100031'], 1_000_000)
  const teamB = buildTeam('teamB', '高兵力乙队', ['100021', '100023', '100661'], 1_000_000)

  const report = resolveRepresentativeTacticalTeamBattle({
    teamA,
    teamB,
    seed: 'contract:3v3-round-limit-draw',
    damageScale: 0.01,
  })

  assert.equal(report.round, 8)
  assert.equal(report.winner, 'draw')
  assert.equal(report.outcomeReason, 'round_limit')
  assert.ok(report.teamA.members.every((member) => member.strengthAfter > 0))
  assert.ok(report.teamB.members.every((member) => member.strengthAfter > 0))
  assert.deepEqual(report.missingFormulaSkillIds, [])
}

function testCommanderProtectionReducesCommanderTargetActivation() {
  const teamA = buildTeam('teamA', '护主队', ['100016', '100718', '100021'], 30_000)
  const teamB = buildTeam('teamB', '点杀队', ['100027', '100451', '100716'], 30_000)

  const report = resolveRepresentativeTacticalTeamBattle({
    teamA,
    teamB,
    seed: 'contract:commander-protection:0',
    damageScale: 0.75,
  })

  const commanderGuardEvent = report.events.find((event) => (
    event.skillId === 'innate_100016'
      && event.targetHeroId === '100016'
      && event.phase === 'battle_start'
  ))
  assert.ok(commanderGuardEvent)
  assert.ok(commanderGuardEvent.notes.includes('commanderProtection+1'))

  const firstCommanderStrikeEvent = report.events.find((event) => (
    event.skillId === 'innate_100027'
      && event.phase === 'active_skill'
      && event.round === 1
  ))
  assert.ok(firstCommanderStrikeEvent)
  assert.equal(firstCommanderStrikeEvent.activated, true)
  assert.equal(firstCommanderStrikeEvent.activationRate, 41)
  assert.equal(firstCommanderStrikeEvent.activationRoll, 7)
  assert.ok(firstCommanderStrikeEvent.notes.includes('commanderProtectionActivationPenalty-4%'))
  assert.ok(firstCommanderStrikeEvent.notes.includes('commanderGuardPenalty-4%'))
  assert.ok(firstCommanderStrikeEvent.notes.includes('baseActivationRate=45'))
  assert.ok(firstCommanderStrikeEvent.notes.includes('commanderTargetPressure=1'))

  const firstTeamActiveCommanderHitEvent = report.events.find((event) => (
    event.skillId === 'innate_100716'
      && event.targetHeroId === '100016'
      && event.phase === 'active_skill'
      && event.round === 1
  ))
  assert.ok(firstTeamActiveCommanderHitEvent)
  assert.equal(firstTeamActiveCommanderHitEvent.damage, 1727)
  assert.ok(firstTeamActiveCommanderHitEvent.notes.includes('commanderTargetPressureTeamActiveDamageReduction-38%'))
  assert.ok(firstTeamActiveCommanderHitEvent.notes.includes('commanderTargetPressureTeamActiveDamageLevel=1'))

  const firstTeamActiveNonCommanderHitEvent = report.events.find((event) => (
    event.skillId === 'innate_100716'
      && event.targetHeroId === '100718'
      && event.phase === 'active_skill'
      && event.round === 1
  ))
  assert.ok(firstTeamActiveNonCommanderHitEvent)
  assert.equal(firstTeamActiveNonCommanderHitEvent.damage, 2821)
  assert.ok(!firstTeamActiveNonCommanderHitEvent.notes.some((note) => note.startsWith('commanderTargetPressure')))

  const secondCommanderStrikeEvent = report.events.find((event) => (
    event.skillId === 'innate_100027'
      && event.phase === 'active_skill'
      && event.round === 2
  ))
  assert.ok(secondCommanderStrikeEvent)
  assert.equal(secondCommanderStrikeEvent.activated, false)
  assert.equal(secondCommanderStrikeEvent.activationRate, 37)
  assert.equal(secondCommanderStrikeEvent.activationRoll, 88)
  assert.ok(secondCommanderStrikeEvent.notes.includes('commanderProtectionActivationPenalty-8%'))
  assert.ok(secondCommanderStrikeEvent.notes.includes('commanderTargetPressurePenalty-4%'))
  assert.ok(secondCommanderStrikeEvent.notes.includes('commanderTargetPressureLevel=1'))
  assert.ok(secondCommanderStrikeEvent.notes.includes('commanderTargetPressure=2'))

  const secondTeamActiveCommanderHitEvent = report.events.find((event) => (
    event.skillId === 'innate_100716'
      && event.targetHeroId === '100016'
      && event.phase === 'active_skill'
      && event.round === 2
  ))
  assert.ok(secondTeamActiveCommanderHitEvent)
  assert.equal(secondTeamActiveCommanderHitEvent.damage, 741)
  assert.ok(secondTeamActiveCommanderHitEvent.notes.includes('commanderTargetPressureTeamActiveDamageReduction-68%'))
  assert.ok(secondTeamActiveCommanderHitEvent.notes.includes('commanderTargetPressureTeamActiveDamageLevel=2'))

  const normalCommanderHitEvent = report.events.find((event) => (
    event.phase === 'normal_attack'
      && event.targetHeroId === '100016'
      && event.round === 2
  ))
  assert.ok(normalCommanderHitEvent)
  assert.equal(normalCommanderHitEvent.damage, 3211)
  assert.ok(normalCommanderHitEvent.notes.includes('commanderTargetPressureNormalDamageReduction-12%'))
  assert.ok(normalCommanderHitEvent.notes.includes('commanderTargetPressureNormalDamageLevel=1'))

  const repeatedCommanderStrikeEvent = report.events.find((event) => (
    event.skillId === 'innate_100027'
      && event.phase === 'active_skill'
      && event.round === 4
  ))
  assert.ok(repeatedCommanderStrikeEvent)
  assert.equal(repeatedCommanderStrikeEvent.activated, true)
  assert.equal(repeatedCommanderStrikeEvent.damage, 1264)
  assert.ok(repeatedCommanderStrikeEvent.notes.includes('commanderTargetDamageReduction-57%'))
  assert.ok(repeatedCommanderStrikeEvent.notes.includes('commanderTargetDamagePressureLevel=2'))
}

function run() {
  testRandomLoadoutThreeVsThreeMatrix()
  testThreeVsThreeRoundLimitDraw()
  testCommanderProtectionReducesCommanderTargetActivation()

  console.log('[tactical_skill_team_matrix_contract] all checks passed')
}

run()
