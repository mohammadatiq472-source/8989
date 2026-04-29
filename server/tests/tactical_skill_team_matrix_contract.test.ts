import assert from 'node:assert/strict'
import {
  buildTacticalCombatantFromGeneralCatalog,
  loadGeneralSkillCatalog,
  resolveTacticalStrengthFromGeneralLevel,
} from '../../shared/domain/generalProfileCatalog'
import {
  resolveRepresentativeTacticalTeamBattle,
  runRepresentativeTacticalTeamMatrix,
  type TacticalTeam,
} from '../../shared/domain/tacticalSkillRules'
import { runTacticalSkillPlayerMixEval } from '../../shared/domain/tacticalSkillPlayerMixEval'

const allGeneralSkillIds = Object.keys(loadGeneralSkillCatalog()).sort()

function testGeneralLevelStrengthBaseline() {
  assert.equal(resolveTacticalStrengthFromGeneralLevel(50), 10_000)
  assert.equal(resolveTacticalStrengthFromGeneralLevel(51), 10_000)
  assert.equal(resolveTacticalStrengthFromGeneralLevel(1), 5_100)

  const liuBei = buildTacticalCombatantFromGeneralCatalog('100016', [])
  assert.equal(liuBei.strength, 10_000)

  const overrideLiuBei = buildTacticalCombatantFromGeneralCatalog('100016', [], { strength: 30_000 })
  assert.equal(overrideLiuBei.strength, 30_000)
}

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
    win: 11,
    loss: 21,
    draw: 0,
  })
  assert.deepEqual(matrix.rates, {
    win: 0.3438,
    loss: 0.6563,
    draw: 0,
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
  assert.equal(matrix.skillStats.innate_100027.eventCount, 74)
  assert.equal(matrix.skillStats.innate_100027.totalDamage, 52398)
  assert.equal(matrix.skillStats.innate_100451.totalDamage, 73473)
  assert.equal(matrix.skillStats.innate_100661.totalPreventedDamage, 18282)
  assert.equal(matrix.skillStats.lib_s_active_fire_raid.seenInLoadouts, 7)
  assert.equal(matrix.skillStats.lib_s_active_fire_raid.totalDamage, 22622)
  assert.equal(matrix.skillStats.lib_s_active_thunder_camp.seenInLoadouts, 13)
  assert.equal(matrix.skillStats.lib_s_active_thunder_camp.totalDamage, 32339)
  assert.equal(matrix.skillStats.lib_a_active_benevolent_aid.totalHealing, 7027)
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
  assert.ok(commanderGuardEvent.notes.includes('commandRecoveryRateScale=5%'))

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
  assert.equal(firstTeamActiveCommanderHitEvent.damage, 1601)
  assert.ok(firstTeamActiveCommanderHitEvent.notes.includes('commanderTargetPressureTeamActiveDamageReduction-38%'))
  assert.ok(firstTeamActiveCommanderHitEvent.notes.includes('commanderTargetPressureTeamActiveDamageLevel=1'))

  const firstTeamActiveNonCommanderHitEvent = report.events.find((event) => (
    event.skillId === 'innate_100716'
      && event.targetHeroId === '100718'
      && event.phase === 'active_skill'
      && event.round === 1
  ))
  assert.ok(firstTeamActiveNonCommanderHitEvent)
  assert.equal(firstTeamActiveNonCommanderHitEvent.damage, 2619)
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
  assert.equal(secondTeamActiveCommanderHitEvent.damage, 695)
  assert.ok(secondTeamActiveCommanderHitEvent.notes.includes('commanderTargetPressureTeamActiveDamageReduction-68%'))
  assert.ok(secondTeamActiveCommanderHitEvent.notes.includes('commanderTargetPressureTeamActiveDamageLevel=2'))

  const normalCommanderHitEvent = report.events.find((event) => (
    event.phase === 'normal_attack'
      && event.targetHeroId === '100016'
      && event.round === 2
  ))
  assert.ok(normalCommanderHitEvent)
  assert.equal(normalCommanderHitEvent.damage, 2940)
  assert.ok(normalCommanderHitEvent.notes.includes('commanderTargetPressureNormalDamageReduction-12%'))
  assert.ok(normalCommanderHitEvent.notes.includes('commanderTargetPressureNormalDamageLevel=1'))
  assert.ok(normalCommanderHitEvent.notes.includes('commanderTargetPressurePostActiveDamageReduction-8%'))
  assert.ok(normalCommanderHitEvent.notes.includes('commanderTargetPressurePostActiveDamageLevel=1'))

  const commandRecoveryEvent = report.events.find((event) => (
    event.skillId === 'innate_100016'
      && event.phase === 'command_recovery'
      && event.targetHeroId === '100016'
      && event.round === 2
  ))
  assert.ok(commandRecoveryEvent)
  assert.equal(commandRecoveryEvent.healing, 55)
  assert.ok(commandRecoveryEvent.notes.includes('trigger=received_damage_this_round'))
  assert.ok(commandRecoveryEvent.notes.includes('healingSourceStat=intelligence'))
  assert.ok(commandRecoveryEvent.notes.includes('baseHealingRate=0.75'))
  assert.ok(commandRecoveryEvent.notes.includes('commandRecoveryRateScale=5%'))

  const repeatedCommanderStrikeEvent = report.events.find((event) => (
    event.skillId === 'innate_100027'
      && event.phase === 'active_skill'
      && event.round === 4
  ))
  assert.ok(repeatedCommanderStrikeEvent)
  assert.equal(repeatedCommanderStrikeEvent.activated, true)
  assert.equal(repeatedCommanderStrikeEvent.damage, 1592)
  assert.ok(repeatedCommanderStrikeEvent.notes.includes('commanderTargetDamageReduction-57%'))
  assert.ok(repeatedCommanderStrikeEvent.notes.includes('commanderTargetDamagePressureLevel=2'))
}

function testCommandProtectionDamageReductionDiminishesSameTypeStacks() {
  const teamA: TacticalTeam = {
    id: 'teamA',
    name: '双指挥护主队',
    members: [
      buildTacticalCombatantFromGeneralCatalog('100016', ['lib_s_command_eight_gate_guard']),
      buildTacticalCombatantFromGeneralCatalog('100718', []),
      buildTacticalCombatantFromGeneralCatalog('100021', []),
    ],
  }
  const teamB = buildTeam('teamB', '点杀队', ['100027', '100451', '100716'])

  const report = resolveRepresentativeTacticalTeamBattle({
    teamA,
    teamB,
    seed: 'contract:command-protection-diminishing',
  })

  const repeatedCommandProtectionEvent = report.events.find((event) => (
    event.skillId === 'lib_s_command_eight_gate_guard'
      && event.phase === 'battle_start'
      && event.targetHeroId === '100016'
  ))
  assert.ok(repeatedCommandProtectionEvent)
  assert.ok(repeatedCommandProtectionEvent.notes.includes('commandProtectionDamageReductionStack=2'))
  assert.ok(repeatedCommandProtectionEvent.notes.includes('commandProtectionDamageReductionRepeatMultiplier=65%'))
  assert.ok(repeatedCommandProtectionEvent.notes.includes('damageReduction+13%'))
}

function testPlayerMixEvalEntrypointShape() {
  const report = runTacticalSkillPlayerMixEval({
    mode: 'both',
    wideSeedCount: 2,
    focusSeedCount: 2,
    seedPrefix: 'contract:player-mix',
    teamSeeds: [
      { id: 'ci-liu-zhou-mix', name: '慈刘周混搭', heroIds: ['100090', '100016', '100717'] },
      { id: 'wu-assault', name: '东吴突击', heroIds: ['100710', '100704', '100717'] },
      { id: 'shu-sustain', name: '季汉续航', heroIds: ['100016', '100021', '100716'] },
      { id: 'han-support', name: '汉室辅助', heroIds: ['100706', '100718', '100703'] },
    ],
  })

  assert.equal(report.mode, 'both')
  assert.equal(report.wide.seedCount, 2)
  assert.equal(report.focus?.seedCountPerDirection, 2)
  assert.equal(report.wide.battleCount, 24)
  assert.equal(report.focus?.pairCount, 6)
  assert.equal(report.focus?.battleCount, 24)
  assert.equal(report.battleCount, 48)
  assert.equal(report.formulaCoverage.totalSkillCount, 77)
  assert.deepEqual(report.formulaCoverage.missingSkillIds, [])
  assert.deepEqual(report.wide.missingFormulaSkillIds, [])
  assert.deepEqual(report.focus?.missingFormulaSkillIds, [])
  assert.equal(report.randomEquippedSkillPoolSize, 50)
  assert.equal(report.wide.importantTeams.length, 4)
  assert.ok(report.wide.topTeams.length > 0)
  assert.ok(report.wide.bottomTeams.length > 0)
}

function testPlayerMixWeakVsHotLevelAdvantageShape() {
  const report = runTacticalSkillPlayerMixEval({
    mode: 'quick',
    wideSeedCount: 2,
    weakVsHotSeedCount: 1,
    weakVsHotLevelBonus: 5,
    seedPrefix: 'contract:player-mix:weak-vs-hot',
    teamSeeds: [
      { id: 'shu-taoyuan', name: '蜀汉桃园', heroIds: ['100016', '100451', '100716'] },
      { id: 'ci-liu-zhou-mix', name: '慈刘周混搭', heroIds: ['100090', '100016', '100717'] },
      { id: 'han-support', name: '汉室辅助', heroIds: ['100703', '100706', '100718'] },
      { id: 'wu-fire-bow', name: '东吴火弓', heroIds: ['100711', '100031', '100090'] },
    ],
  })

  assert.equal(report.weakVsHotSeedCount, 1)
  assert.equal(report.weakVsHotLevelBonus, 5)
  assert.ok(report.weakVsHot)
  assert.equal(report.weakVsHot.seedCountPerDirection, 1)
  assert.equal(report.weakVsHot.weakStrengthBonusPerHero, 500)
  assert.deepEqual(report.weakVsHot.missingFormulaSkillIds, [])
  assert.ok(report.weakVsHot.scenarioSummaries.length > 0)
  assert.ok(report.weakVsHot.scenarioSummaries.some((summary) => summary.variant === 'baseline'))
  assert.ok(report.weakVsHot.scenarioSummaries.some((summary) => summary.variant === 'weak_level_plus_5'))
  assert.ok(report.weakVsHot.scenarioSummaries.some((summary) => (
    summary.weakLastHitTakenTopSkills.length > 0
  )))
}

function testHanSupportInnateReworkAddsSmallSustainAndFrontDongZhuoCommandDamage() {
  const teamA = buildTeam('teamA', '汉室辅助', ['100706', '100718', '100703'])
  const teamB = buildTeam('teamB', '测试敌队', ['100027', '100451', '100716'])

  const backlineDongZhuoReport = resolveRepresentativeTacticalTeamBattle({
    teamA,
    teamB,
    seed: 'contract:han-support-rework',
  })

  const xianDiStartEvent = backlineDongZhuoReport.events.find((event) => (
    event.skillId === 'innate_100706'
      && event.phase === 'battle_start'
      && event.targetHeroId === '100706'
  ))
  assert.ok(xianDiStartEvent)
  assert.ok(xianDiStartEvent.notes.includes('damageReduction+12%'))
  assert.ok(xianDiStartEvent.notes.includes('evasion:active'))
  assert.ok(xianDiStartEvent.notes.includes('healingRate=0.7'))
  assert.ok(xianDiStartEvent.notes.includes('commandRecoveryRateScale=5%'))

  const xianDiActiveGuardEvent = backlineDongZhuoReport.events.find((event) => (
    event.phase === 'active_skill'
      && event.targetHeroId === '100706'
      && event.preventedDamage
      && event.preventedDamage > 0
      && event.notes.includes('damage prevented by evasion charge')
  ))
  assert.ok(xianDiActiveGuardEvent)

  const xianDiRecoveryEvent = backlineDongZhuoReport.events.find((event) => (
    event.skillId === 'innate_100706'
      && event.phase === 'command_recovery'
      && event.targetHeroId === '100718'
      && event.round === 1
  ))
  assert.ok(xianDiRecoveryEvent)
  assert.equal(xianDiRecoveryEvent.healing, 49)
  assert.ok(xianDiRecoveryEvent.notes.includes('trigger=received_damage_this_round'))

  const backlineDongZhuoCommandDamageEvents = backlineDongZhuoReport.events.filter((event) => (
    event.skillId === 'innate_100703'
      && event.phase === 'battle_start'
      && event.damageKind === 'strategy'
  ))
  assert.equal(backlineDongZhuoCommandDamageEvents.length, 0)

  const frontDongZhuoReport = resolveRepresentativeTacticalTeamBattle({
    teamA: buildTeam('teamA', '前排董卓汉室辅助', ['100703', '100706', '100718']),
    teamB,
    seed: 'contract:han-support-rework:front-dong-zhuo',
  })
  const dongZhuoCommandDamageEvents = frontDongZhuoReport.events.filter((event) => (
    event.skillId === 'innate_100703'
      && event.phase === 'battle_start'
      && event.damageKind === 'strategy'
  ))
  assert.equal(dongZhuoCommandDamageEvents.length, 4)
  assert.deepEqual(
    dongZhuoCommandDamageEvents.map((event) => [event.targetHeroId, event.damage]),
    [['100027', 358], ['100027', 358], ['100027', 358], ['100027', 358]],
  )
  assert.ok(dongZhuoCommandDamageEvents.every((event) => (
    event.notes.includes('commandDamageConversion=true')
      && event.notes.includes('requiredPosition=front')
      && event.notes.some((note) => note.startsWith('commandDamageHit='))
  )))
}

function run() {
  testGeneralLevelStrengthBaseline()
  testRandomLoadoutThreeVsThreeMatrix()
  testThreeVsThreeRoundLimitDraw()
  testCommanderProtectionReducesCommanderTargetActivation()
  testCommandProtectionDamageReductionDiminishesSameTypeStacks()
  testPlayerMixEvalEntrypointShape()
  testPlayerMixWeakVsHotLevelAdvantageShape()
  testHanSupportInnateReworkAddsSmallSustainAndFrontDongZhuoCommandDamage()

  console.log('[tactical_skill_team_matrix_contract] all checks passed')
}

run()
