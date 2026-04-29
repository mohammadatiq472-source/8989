import {
  runTacticalSkillPlayerMixEval,
  type TacticalSkillPlayerMixEvalMode,
  type TacticalSkillPlayerMixEvalReport,
  type TacticalSkillPlayerMixPhaseTotals,
  type TacticalSkillPlayerMixTeamSummary,
  type TacticalSkillPlayerMixWeakVsHotScenarioSummary,
} from '../../../shared/domain/tacticalSkillPlayerMixEval'

const argv = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith('--') && arg.includes('='))
    .map((arg) => {
      const [key, ...valueParts] = arg.slice(2).split('=')
      return [key, valueParts.join('=')]
    }),
)

const mode = normalizeMode(
  argv.get('mode') ?? process.env.TACTICAL_SKILL_PLAYER_MIX_MODE ?? 'both',
)
const wideSeedCount = normalizePositiveInteger(
  argv.get('wide-seeds') ?? process.env.TACTICAL_SKILL_PLAYER_MIX_WIDE_SEEDS,
  1_000,
)
const focusSeedCount = normalizePositiveInteger(
  argv.get('focus-seeds') ?? process.env.TACTICAL_SKILL_PLAYER_MIX_FOCUS_SEEDS,
  10_000,
)
const weakVsHotSeedCount = normalizeNonNegativeInteger(
  argv.get('weak-vs-hot-seeds') ?? process.env.TACTICAL_SKILL_PLAYER_MIX_WEAK_VS_HOT_SEEDS,
  0,
)
const weakVsHotLevelBonus = normalizeNonNegativeInteger(
  argv.get('weak-vs-hot-level-bonus') ?? process.env.TACTICAL_SKILL_PLAYER_MIX_WEAK_VS_HOT_LEVEL_BONUS,
  5,
)
const seedPrefix = argv.get('seed-prefix')
  ?? process.env.TACTICAL_SKILL_PLAYER_MIX_SEED_PREFIX
  ?? 'tactical_skill_player_mix_eval'
const format = argv.get('format') ?? process.env.TACTICAL_SKILL_PLAYER_MIX_FORMAT ?? 'json'

const report = runTacticalSkillPlayerMixEval({
  mode,
  wideSeedCount,
  focusSeedCount,
  weakVsHotSeedCount,
  weakVsHotLevelBonus,
  seedPrefix,
})

console.log(JSON.stringify(
  format === 'compact'
    ? toCompactSummary(report)
    : format === 'brief'
      ? toBriefSummary(report)
      : format === 'summary'
      ? toSummary(report)
      : report,
  null,
  2,
))

function normalizeMode(rawMode: string): TacticalSkillPlayerMixEvalMode {
  if (rawMode === 'quick' || rawMode === 'focus' || rawMode === 'both') {
    return rawMode
  }
  throw new Error(`TACTICAL_SKILL_PLAYER_MIX_MODE must be quick, focus, or both: ${rawMode}`)
}

function normalizePositiveInteger(rawValue: string | undefined, fallback: number) {
  if (!rawValue) {
    return fallback
  }
  const parsed = Number.parseInt(rawValue, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`seed count must be a positive integer: ${rawValue}`)
  }
  return parsed
}

function normalizeNonNegativeInteger(rawValue: string | undefined, fallback: number) {
  if (!rawValue) {
    return fallback
  }
  const parsed = Number.parseInt(rawValue, 10)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`seed count or level bonus must be a non-negative integer: ${rawValue}`)
  }
  return parsed
}

function toSummary(report: TacticalSkillPlayerMixEvalReport) {
  return {
    generatedAt: report.generatedAt,
    mode: report.mode,
    wideSeedCount: report.wideSeedCount,
    focusSeedCount: report.focusSeedCount,
    weakVsHotSeedCount: report.weakVsHotSeedCount,
    weakVsHotLevelBonus: report.weakVsHotLevelBonus,
    battleCount: report.battleCount,
    formulaCoverage: report.formulaCoverage,
    wide: {
      seedCount: report.wide.seedCount,
      battleCount: report.wide.battleCount,
      minimumPointRate: report.wide.minimumPointRate,
      teamsBelowPointRate40: report.wide.teamsBelowPointRate40.map((team) => ({
        id: team.id,
        name: team.name,
        pointRate: team.pointRate,
        winRate: team.winRate,
        weaknessSignals: team.weaknessSignals,
      })),
      topTeams: report.wide.topTeams.map(toTeamSummaryLine),
      bottomTeams: report.wide.bottomTeams.map(toTeamSummaryLine),
      importantTeams: report.wide.importantTeams.map(toTeamSummaryLine),
      missingFormulaSkillIds: report.wide.missingFormulaSkillIds,
    },
    focus: report.focus
      ? {
        seedCountPerDirection: report.focus.seedCountPerDirection,
        pairCount: report.focus.pairCount,
        battleCount: report.focus.battleCount,
        importantPairSummaries: report.focus.importantPairSummaries,
        missingFormulaSkillIds: report.focus.missingFormulaSkillIds,
      }
      : undefined,
    weakVsHot: report.weakVsHot ? toWeakVsHotSummary(report) : undefined,
  }
}

function toCompactSummary(report: TacticalSkillPlayerMixEvalReport) {
  return {
    generatedAt: report.generatedAt,
    mode: report.mode,
    wideSeedCount: report.wideSeedCount,
    focusSeedCount: report.focusSeedCount,
    weakVsHotSeedCount: report.weakVsHotSeedCount,
    weakVsHotLevelBonus: report.weakVsHotLevelBonus,
    battleCount: report.battleCount,
    formulaCoverage: report.formulaCoverage,
    wide: {
      seedCount: report.wide.seedCount,
      battleCount: report.wide.battleCount,
      minimumPointRate: report.wide.minimumPointRate,
      teamsBelowPointRate40: report.wide.teamsBelowPointRate40.map(toCompactTeamLine),
      topTeams: report.wide.topTeams.map(toCompactTeamLine),
      bottomTeams: report.wide.bottomTeams.map(toCompactTeamLine),
      importantTeams: report.wide.importantTeams.map(toCompactTeamLine),
      missingFormulaSkillIds: report.wide.missingFormulaSkillIds,
    },
    focus: report.focus
      ? {
        seedCountPerDirection: report.focus.seedCountPerDirection,
        pairCount: report.focus.pairCount,
        battleCount: report.focus.battleCount,
        importantPairSummaries: report.focus.importantPairSummaries.map((pair) => ({
          pairId: pair.pairId,
          teamA: pair.teamA.name,
          teamB: pair.teamB.name,
          winRatesByTeamId: pair.winRatesByTeamId,
          draws: pair.draws,
          drawRate: pair.drawRate,
          averageRounds: pair.averageRounds,
          lastHitTakenByPhaseByTeamId: pair.lastHitTakenByPhaseByTeamId,
          lastHitTakenTopSkillsByTeamId: pair.lastHitTakenTopSkillsByTeamId,
        })),
        missingFormulaSkillIds: report.focus.missingFormulaSkillIds,
      }
      : undefined,
    weakVsHot: report.weakVsHot ? toWeakVsHotCompactSummary(report) : undefined,
  }
}

function toBriefSummary(report: TacticalSkillPlayerMixEvalReport) {
  return {
    mode: report.mode,
    wideSeedCount: report.wideSeedCount,
    focusSeedCount: report.focusSeedCount,
    weakVsHotSeedCount: report.weakVsHotSeedCount,
    weakVsHotLevelBonus: report.weakVsHotLevelBonus,
    battleCount: report.battleCount,
    formulaCoverage: report.formulaCoverage,
    wide: {
      seedCount: report.wide.seedCount,
      battleCount: report.wide.battleCount,
      minimumPointRate: report.wide.minimumPointRate,
      teamsBelowPointRate40: report.wide.teamsBelowPointRate40.map((team) => ({
        name: team.name,
        pointRate: team.pointRate,
        winRate: team.winRate,
        averageRounds: team.averageRounds,
        weaknessSignals: team.weaknessSignals,
      })),
      topTeams: report.wide.topTeams.map(toBriefTeamLine),
      bottomTeams: report.wide.bottomTeams.map(toBriefTeamLine),
      importantTeams: report.wide.importantTeams.map(toBriefTeamLine),
      missingFormulaSkillIds: report.wide.missingFormulaSkillIds,
    },
    focus: report.focus
      ? {
        seedCountPerDirection: report.focus.seedCountPerDirection,
        pairCount: report.focus.pairCount,
        battleCount: report.focus.battleCount,
        importantPairSummaries: report.focus.importantPairSummaries.map((pair) => ({
          pairId: pair.pairId,
          teamA: pair.teamA.name,
          teamB: pair.teamB.name,
          winRatesByTeamId: pair.winRatesByTeamId,
          drawRate: pair.drawRate,
          averageRounds: pair.averageRounds,
          lastHitTakenTopSkillsByTeamId: pair.lastHitTakenTopSkillsByTeamId,
        })),
        missingFormulaSkillIds: report.focus.missingFormulaSkillIds,
      }
      : undefined,
    weakVsHot: report.weakVsHot ? toWeakVsHotBriefSummary(report) : undefined,
  }
}

function toBriefTeamLine(team: TacticalSkillPlayerMixTeamSummary) {
  return {
    name: team.name,
    pointRate: team.pointRate,
    winRate: team.winRate,
    drawRate: team.drawRate,
    averageRounds: team.averageRounds,
    damageDonePerMatch: team.damageDonePerMatch,
    damageTakenPerMatch: team.damageTakenPerMatch,
    healingDonePerMatch: team.healingDonePerMatch,
    normalDamagePerMatch: team.phaseDamageDonePerMatch.normal_attack,
    activeDamagePerMatch: team.phaseDamageDonePerMatch.active_skill,
    chaseDamagePerMatch: team.phaseDamageDonePerMatch.chase_skill,
    phaseDamageShare: toPhaseShareLine(team.phaseDamageDonePerMatch),
    lastHitDoneByPhase: team.lastHitDoneByPhase,
    lastHitDoneShareByPhase: toPhaseShareLine(team.lastHitDoneByPhase),
    lastHitTakenByPhase: team.lastHitTakenByPhase,
    lastHitTakenShareByPhase: toPhaseShareLine(team.lastHitTakenByPhase),
    topInnateSkills: team.topInnateSkills.slice(0, 3).map((skill) => ({
      skillName: skill.skillName,
      damage: skill.perMatchDamage,
      healing: skill.perMatchHealing,
    })),
    weaknessSignals: team.weaknessSignals,
  }
}

function toCompactTeamLine(team: TacticalSkillPlayerMixTeamSummary) {
  return {
    id: team.id,
    name: team.name,
    heroIds: team.heroIds,
    winRate: team.winRate,
    pointRate: team.pointRate,
    drawRate: team.drawRate,
    averageRounds: team.averageRounds,
    damageDonePerMatch: team.damageDonePerMatch,
    damageTakenPerMatch: team.damageTakenPerMatch,
    healingDonePerMatch: team.healingDonePerMatch,
    normalDamagePerMatch: team.phaseDamageDonePerMatch.normal_attack,
    activeDamagePerMatch: team.phaseDamageDonePerMatch.active_skill,
    chaseDamagePerMatch: team.phaseDamageDonePerMatch.chase_skill,
    phaseDamageShare: toPhaseShareLine(team.phaseDamageDonePerMatch),
    lastHitDoneByPhase: team.lastHitDoneByPhase,
    lastHitDoneShareByPhase: toPhaseShareLine(team.lastHitDoneByPhase),
    lastHitTakenByPhase: team.lastHitTakenByPhase,
    lastHitTakenShareByPhase: toPhaseShareLine(team.lastHitTakenByPhase),
    topInnateSkills: team.topInnateSkills.slice(0, 3).map((skill) => ({
      skillId: skill.skillId,
      skillName: skill.skillName,
      damage: skill.perMatchDamage,
      healing: skill.perMatchHealing,
    })),
    weaknessSignals: team.weaknessSignals,
  }
}

function toTeamSummaryLine(team: TacticalSkillPlayerMixTeamSummary) {
  return {
    id: team.id,
    name: team.name,
    heroIds: team.heroIds,
    matches: team.matches,
    winRate: team.winRate,
    pointRate: team.pointRate,
    drawRate: team.drawRate,
    averageRounds: team.averageRounds,
    damageDonePerMatch: team.damageDonePerMatch,
    damageTakenPerMatch: team.damageTakenPerMatch,
    healingDonePerMatch: team.healingDonePerMatch,
    phaseDamageDonePerMatch: team.phaseDamageDonePerMatch,
    phaseDamageShare: toPhaseShareLine(team.phaseDamageDonePerMatch),
    lastHitDoneByPhase: team.lastHitDoneByPhase,
    lastHitDoneShareByPhase: toPhaseShareLine(team.lastHitDoneByPhase),
    lastHitTakenByPhase: team.lastHitTakenByPhase,
    lastHitTakenShareByPhase: toPhaseShareLine(team.lastHitTakenByPhase),
    topInnateSkills: team.topInnateSkills.map((skill) => ({
      skillId: skill.skillId,
      skillName: skill.skillName,
      perMatchDamage: skill.perMatchDamage,
      perMatchHealing: skill.perMatchHealing,
      perActivationDamage: skill.perActivationDamage,
      perActivationHealing: skill.perActivationHealing,
    })),
    weaknessSignals: team.weaknessSignals,
  }
}

function toWeakVsHotSummary(report: TacticalSkillPlayerMixEvalReport) {
  const weakVsHot = report.weakVsHot
  if (!weakVsHot) return undefined
  return {
    seedCountPerDirection: weakVsHot.seedCountPerDirection,
    weakLevelBonus: weakVsHot.weakLevelBonus,
    weakStrengthBonusPerHero: weakVsHot.weakStrengthBonusPerHero,
    hotTeamIds: weakVsHot.hotTeamIds,
    weakTeamIds: weakVsHot.weakTeamIds,
    scenarioCount: weakVsHot.scenarioCount,
    battleCount: weakVsHot.battleCount,
    baselineBelowPointRate40: weakVsHot.baselineBelowPointRate40.map(toWeakVsHotLine),
    levelBonusBelowPointRate40: weakVsHot.levelBonusBelowPointRate40.map(toWeakVsHotLine),
    passedWithLevelBonus: weakVsHot.passedWithLevelBonus.map(toWeakVsHotLine),
    missingFormulaSkillIds: weakVsHot.missingFormulaSkillIds,
  }
}

function toWeakVsHotCompactSummary(report: TacticalSkillPlayerMixEvalReport) {
  const weakVsHot = report.weakVsHot
  if (!weakVsHot) return undefined
  return {
    seedCountPerDirection: weakVsHot.seedCountPerDirection,
    weakLevelBonus: weakVsHot.weakLevelBonus,
    weakStrengthBonusPerHero: weakVsHot.weakStrengthBonusPerHero,
    hotTeamIds: weakVsHot.hotTeamIds,
    weakTeamIds: weakVsHot.weakTeamIds,
    scenarioCount: weakVsHot.scenarioCount,
    battleCount: weakVsHot.battleCount,
    baselineWorst10: weakVsHot.baselineBelowPointRate40.slice(0, 10).map(toWeakVsHotLine),
    levelBonusStillBelow40: weakVsHot.levelBonusBelowPointRate40.slice(0, 10).map(toWeakVsHotLine),
    passedWithLevelBonus: weakVsHot.passedWithLevelBonus.slice(0, 10).map(toWeakVsHotLine),
    missingFormulaSkillIds: weakVsHot.missingFormulaSkillIds,
  }
}

function toWeakVsHotBriefSummary(report: TacticalSkillPlayerMixEvalReport) {
  const weakVsHot = report.weakVsHot
  if (!weakVsHot) return undefined
  return {
    seedCountPerDirection: weakVsHot.seedCountPerDirection,
    weakLevelBonus: weakVsHot.weakLevelBonus,
    weakStrengthBonusPerHero: weakVsHot.weakStrengthBonusPerHero,
    hotTeamIds: weakVsHot.hotTeamIds,
    weakTeamIds: weakVsHot.weakTeamIds,
    scenarioCount: weakVsHot.scenarioCount,
    battleCount: weakVsHot.battleCount,
    baselineWorst10: weakVsHot.baselineBelowPointRate40.slice(0, 10).map(toWeakVsHotBriefLine),
    levelBonusStillBelow40: weakVsHot.levelBonusBelowPointRate40.slice(0, 10).map(toWeakVsHotBriefLine),
    passedWithLevelBonus: weakVsHot.passedWithLevelBonus.slice(0, 10).map(toWeakVsHotBriefLine),
    missingFormulaSkillIds: weakVsHot.missingFormulaSkillIds,
  }
}

function toWeakVsHotLine(summary: TacticalSkillPlayerMixWeakVsHotScenarioSummary) {
  return {
    scenarioId: summary.scenarioId,
    variant: summary.variant,
    weakTeam: summary.weakTeam.name,
    hotTeam: summary.hotTeam.name,
    weakLevelBonus: summary.weakLevelBonus,
    weakStrengthBonusPerHero: summary.weakStrengthBonusPerHero,
    weakWinRate: summary.weakWinRate,
    weakPointRate: summary.weakPointRate,
    hotWinRate: summary.hotWinRate,
    drawRate: summary.drawRate,
    averageRounds: summary.averageRounds,
    reachesPointRate40: summary.reachesPointRate40,
    weakLastHitTakenShareByPhase: summary.weakLastHitTakenShareByPhase,
    weakLastHitTakenTopSkills: summary.weakLastHitTakenTopSkills,
  }
}

function toWeakVsHotBriefLine(summary: TacticalSkillPlayerMixWeakVsHotScenarioSummary) {
  return {
    variant: summary.variant,
    weakTeam: summary.weakTeam.name,
    hotTeam: summary.hotTeam.name,
    weakPointRate: summary.weakPointRate,
    weakWinRate: summary.weakWinRate,
    drawRate: summary.drawRate,
    averageRounds: summary.averageRounds,
    weakLastHitTakenTopSkills: summary.weakLastHitTakenTopSkills.slice(0, 3).map((skill) => ({
      skillId: skill.skillId,
      skillName: skill.skillName,
      share: skill.share,
    })),
  }
}

function toPhaseShareLine(totals: TacticalSkillPlayerMixPhaseTotals) {
  const total = toPhaseTotal(totals)
  return {
    battle_start: divide(totals.battle_start, total),
    normal_attack: divide(totals.normal_attack, total),
    active_skill: divide(totals.active_skill, total),
    chase_skill: divide(totals.chase_skill, total),
    command_recovery: divide(totals.command_recovery, total),
    burn: divide(totals.burn, total),
  }
}

function toPhaseTotal(totals: TacticalSkillPlayerMixPhaseTotals) {
  return totals.battle_start
    + totals.normal_attack
    + totals.active_skill
    + totals.chase_skill
    + totals.command_recovery
    + totals.burn
}

function divide(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return 0
  }
  return Math.round((numerator / denominator) * 10_000) / 10_000
}
