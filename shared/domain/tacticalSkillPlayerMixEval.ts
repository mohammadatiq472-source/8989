import {
  TACTICAL_GENERAL_STRENGTH_PER_LEVEL,
  buildTacticalCombatantFromGeneralCatalog,
  loadGeneralProfileCatalog,
  loadGeneralSkillCatalog,
} from './generalProfileCatalog'
import { auditRepresentativeTacticalFormulaCoverage } from './tacticalSkillFormulaCatalog'
import {
  resolveRepresentativeTacticalTeamBattle,
  type TacticalSkillEvent,
  type TacticalTeam,
  type TacticalTeamBattleOutcome,
  type TacticalTeamMatrixSkillStat,
} from './tacticalSkillRules'

export type TacticalSkillPlayerMixEvalMode = 'quick' | 'focus' | 'both'

export type TacticalSkillPlayerMixTeamSeed = {
  id: string
  name: string
  heroIds: [string, string, string]
}

export type TacticalSkillPlayerMixEvalParams = {
  mode?: TacticalSkillPlayerMixEvalMode
  wideSeedCount?: number
  focusSeedCount?: number
  weakVsHotSeedCount?: number
  weakVsHotLevelBonus?: number
  seedPrefix?: string
  maxRounds?: number
  damageScale?: number
  teamSeeds?: TacticalSkillPlayerMixTeamSeed[]
}

export type TacticalSkillPlayerMixPhaseTotals = {
  battle_start: number
  normal_attack: number
  active_skill: number
  chase_skill: number
  command_recovery: number
  burn: number
}

export type TacticalSkillPlayerMixSkillSummary = TacticalTeamMatrixSkillStat & {
  skillId: string
  skillName: string
  perMatchDamage: number
  perMatchHealing: number
  perActivationDamage: number
  perActivationHealing: number
}

export type TacticalSkillPlayerMixLastHitSkillSummary = {
  skillId: string
  skillName: string
  count: number
  share: number
}

export type TacticalSkillPlayerMixTeamSummary = TacticalSkillPlayerMixTeamSeed & {
  matches: number
  wins: number
  losses: number
  draws: number
  winRate: number
  lossRate: number
  drawRate: number
  pointRate: number
  averageRounds: number
  damageDonePerMatch: number
  damageTakenPerMatch: number
  healingDonePerMatch: number
  preventedDamagePerMatch: number
  phaseDamageDonePerMatch: TacticalSkillPlayerMixPhaseTotals
  phaseDamageTakenPerMatch: TacticalSkillPlayerMixPhaseTotals
  lastHitDoneByPhase: TacticalSkillPlayerMixPhaseTotals
  lastHitTakenByPhase: TacticalSkillPlayerMixPhaseTotals
  commandProtectionEventsPerMatch: number
  topInnateSkills: TacticalSkillPlayerMixSkillSummary[]
  topEquippedSkills: TacticalSkillPlayerMixSkillSummary[]
  weaknessSignals: string[]
}

export type TacticalSkillPlayerMixPairSummary = {
  pairId: string
  teamA: TacticalSkillPlayerMixTeamSeed
  teamB: TacticalSkillPlayerMixTeamSeed
  seedCountPerDirection: number
  battleCount: number
  winsByTeamId: Record<string, number>
  winRatesByTeamId: Record<string, number>
  draws: number
  drawRate: number
  averageRounds: number
  lastHitTakenByPhaseByTeamId: Record<string, TacticalSkillPlayerMixPhaseTotals>
  lastHitTakenBySkillByTeamId: Record<string, Record<string, number>>
  lastHitTakenTopSkillsByTeamId: Record<string, TacticalSkillPlayerMixLastHitSkillSummary[]>
}

export type TacticalSkillPlayerMixWeakVsHotScenarioSummary = {
  scenarioId: string
  variant: 'baseline' | `weak_level_plus_${number}`
  weakTeam: TacticalSkillPlayerMixTeamSeed
  hotTeam: TacticalSkillPlayerMixTeamSeed
  weakLevelBonus: number
  weakStrengthBonusPerHero: number
  seedCountPerDirection: number
  battleCount: number
  weakWins: number
  hotWins: number
  draws: number
  weakWinRate: number
  weakPointRate: number
  hotWinRate: number
  drawRate: number
  averageRounds: number
  reachesPointRate40: boolean
  weakLastHitTakenByPhase: TacticalSkillPlayerMixPhaseTotals
  weakLastHitTakenShareByPhase: TacticalSkillPlayerMixPhaseTotals
  weakLastHitTakenTopSkills: TacticalSkillPlayerMixLastHitSkillSummary[]
  hotLastHitTakenTopSkills: TacticalSkillPlayerMixLastHitSkillSummary[]
}

export type TacticalSkillPlayerMixEvalReport = {
  generatedAt: string
  mode: TacticalSkillPlayerMixEvalMode
  seedPrefix: string
  wideSeedCount: number
  focusSeedCount: number
  weakVsHotSeedCount: number
  weakVsHotLevelBonus: number
  maxRounds: number
  randomEquippedSkillPoolSize: number
  battleCount: number
  formulaCoverage: {
    totalSkillCount: number
    implementedSkillCount: number
    missingSkillIds: string[]
    missingInnateSkillIds: string[]
    missingGeneralSkillIds: string[]
  }
  wide: {
    seedCount: number
    battleCount: number
    teamSummaries: TacticalSkillPlayerMixTeamSummary[]
    topTeams: TacticalSkillPlayerMixTeamSummary[]
    bottomTeams: TacticalSkillPlayerMixTeamSummary[]
    importantTeams: TacticalSkillPlayerMixTeamSummary[]
    minimumPointRate: number
    teamsBelowPointRate40: TacticalSkillPlayerMixTeamSummary[]
    missingFormulaSkillIds: string[]
  }
  focus?: {
    seedCountPerDirection: number
    pairCount: number
    battleCount: number
    pairSummaries: TacticalSkillPlayerMixPairSummary[]
    importantPairSummaries: TacticalSkillPlayerMixPairSummary[]
    missingFormulaSkillIds: string[]
  }
  weakVsHot?: {
    seedCountPerDirection: number
    weakLevelBonus: number
    weakStrengthBonusPerHero: number
    hotTeamIds: string[]
    weakTeamIds: string[]
    scenarioCount: number
    battleCount: number
    scenarioSummaries: TacticalSkillPlayerMixWeakVsHotScenarioSummary[]
    baselineBelowPointRate40: TacticalSkillPlayerMixWeakVsHotScenarioSummary[]
    levelBonusBelowPointRate40: TacticalSkillPlayerMixWeakVsHotScenarioSummary[]
    passedWithLevelBonus: TacticalSkillPlayerMixWeakVsHotScenarioSummary[]
    missingFormulaSkillIds: string[]
  }
}

type TeamAccumulator = TacticalSkillPlayerMixTeamSeed & {
  matches: number
  wins: number
  losses: number
  draws: number
  roundTotal: number
  damageDone: number
  damageTaken: number
  healingDone: number
  preventedDamage: number
  commandProtectionEvents: number
  phaseDamageDone: TacticalSkillPlayerMixPhaseTotals
  phaseDamageTaken: TacticalSkillPlayerMixPhaseTotals
  lastHitDoneByPhase: TacticalSkillPlayerMixPhaseTotals
  lastHitTakenByPhase: TacticalSkillPlayerMixPhaseTotals
  innateSkillStats: Record<string, TacticalTeamMatrixSkillStat>
  equippedSkillStats: Record<string, TacticalTeamMatrixSkillStat>
}

type PairAccumulator = {
  pairId: string
  teamA: TacticalSkillPlayerMixTeamSeed
  teamB: TacticalSkillPlayerMixTeamSeed
  battleCount: number
  roundTotal: number
  winsByTeamId: Record<string, number>
  draws: number
  lastHitTakenByPhaseByTeamId: Record<string, TacticalSkillPlayerMixPhaseTotals>
  lastHitTakenBySkillByTeamId: Record<string, Record<string, number>>
}

const DEFAULT_WIDE_SEED_COUNT = 1_000
const DEFAULT_FOCUS_SEED_COUNT = 10_000
const DEFAULT_WEAK_VS_HOT_LEVEL_BONUS = 5
const DEFAULT_MAX_ROUNDS = 8
const IMPORTANT_TEAM_IDS = [
  'ci-liu-zhou-mix',
  'wu-assault',
  'shu-sustain',
  'han-support',
  'mixed-strategy',
  'poison-fire-mix',
  'wei-strategy',
]

const CONTROVERSY_PAIR_IDS: Array<[string, string]> = [
  ['ci-liu-zhou-mix', 'wu-assault'],
  ['ci-liu-zhou-mix', 'shu-sustain'],
  ['wu-assault', 'shu-sustain'],
  ['han-support', 'ci-liu-zhou-mix'],
  ['han-support', 'wu-assault'],
  ['han-support', 'shu-sustain'],
  ['dong-liu-zhao-mix', 'wu-assault'],
  ['dong-liu-cai-mix', 'han-support'],
]

export function buildDefaultTacticalSkillPlayerMixTeams(): TacticalSkillPlayerMixTeamSeed[] {
  return [
    { id: 'shu-sustain', name: '季汉续航', heroIds: ['100016', '100021', '100716'] },
    { id: 'shu-strategy', name: '季汉谋略', heroIds: ['100016', '100017', '100451'] },
    { id: 'shu-taoyuan', name: '蜀汉桃园', heroIds: ['100016', '100451', '100716'] },
    { id: 'shu-five-tiger', name: '五虎冲阵', heroIds: ['100021', '100708', '100716'] },
    { id: 'wei-burst', name: '曹魏爆发', heroIds: ['100023', '100027', '100709'] },
    { id: 'wei-strategy', name: '曹魏谋略', heroIds: ['100023', '100714', '100709'] },
    { id: 'wei-temple', name: '曹魏庙算', heroIds: ['100701', '100714', '100709'] },
    { id: 'wei-shield', name: '曹魏虎卫', heroIds: ['100023', '100702', '100713'] },
    { id: 'wu-assault', name: '东吴突击', heroIds: ['100710', '100704', '100717'] },
    { id: 'wu-fire-bow', name: '东吴火弓', heroIds: ['100711', '100031', '100090'] },
    { id: 'wu-father-son', name: '江东父子', heroIds: ['100712', '100710', '100711'] },
    { id: 'wu-bow-control', name: '吴弓控制', heroIds: ['100031', '100090', '100711'] },
    { id: 'qun-cavalry', name: '群雄骑压', heroIds: ['100661', '100708', '100715'] },
    { id: 'qun-chaos', name: '群雄乱武', heroIds: ['100703', '100661', '100707'] },
    { id: 'qun-force', name: '群雄强攻', heroIds: ['100661', '100703', '100715'] },
    { id: 'han-support', name: '汉室辅助', heroIds: ['100703', '100706', '100718'] },
    { id: 'han-recovery', name: '汉室双辅', heroIds: ['100706', '100016', '100718'] },
    { id: 'advisor-mix', name: '谋士混编', heroIds: ['100701', '100714', '100709'] },
    { id: 'poison-fire-mix', name: '毒火谋略', heroIds: ['100707', '100031', '100714'] },
    { id: 'mixed-strategy', name: '混编谋略', heroIds: ['100714', '100031', '100709'] },
    { id: 'ci-liu-zhou-mix', name: '慈刘周混搭', heroIds: ['100090', '100016', '100717'] },
    { id: 'guan-cao-zhou-mix', name: '关曹周混搭', heroIds: ['100451', '100023', '100717'] },
    { id: 'lv-cao-zhou-mix', name: '吕曹周混搭', heroIds: ['100661', '100023', '100717'] },
    { id: 'gan-zhou-cai-mix', name: '甘周蔡混搭', heroIds: ['100704', '100717', '100718'] },
    { id: 'ma-liu-zhao-mix', name: '马刘赵混搭', heroIds: ['100708', '100016', '100021'] },
    { id: 'sun-liu-zhao-mix', name: '孙刘赵混搭', heroIds: ['100710', '100016', '100021'] },
    { id: 'yi-liu-zhao-mix', name: '懿刘赵混搭', heroIds: ['100709', '100016', '100021'] },
    { id: 'dong-liu-zhao-mix', name: '董刘赵混搭', heroIds: ['100703', '100016', '100021'] },
    { id: 'dong-liu-cai-mix', name: '董刘蔡混搭', heroIds: ['100703', '100016', '100718'] },
  ]
}

export function runTacticalSkillPlayerMixEval(
  params: TacticalSkillPlayerMixEvalParams = {},
): TacticalSkillPlayerMixEvalReport {
  const mode = params.mode ?? 'both'
  const wideSeedCount = normalizeSeedCount(params.wideSeedCount ?? DEFAULT_WIDE_SEED_COUNT, 'wideSeedCount')
  const focusSeedCount = normalizeSeedCount(params.focusSeedCount ?? DEFAULT_FOCUS_SEED_COUNT, 'focusSeedCount')
  const weakVsHotSeedCount = normalizeOptionalSeedCount(params.weakVsHotSeedCount ?? 0, 'weakVsHotSeedCount')
  const weakVsHotLevelBonus = normalizeNonNegativeInteger(
    params.weakVsHotLevelBonus ?? DEFAULT_WEAK_VS_HOT_LEVEL_BONUS,
    'weakVsHotLevelBonus',
  )
  const maxRounds = params.maxRounds ?? DEFAULT_MAX_ROUNDS
  const seedPrefix = params.seedPrefix ?? 'tactical_skill_player_mix_eval'
  const teams = params.teamSeeds ?? buildDefaultTacticalSkillPlayerMixTeams()
  const generalSkillIds = Object.keys(loadGeneralSkillCatalog()).sort()
  const profiles = loadGeneralProfileCatalog()
  const formulaAudit = auditRepresentativeTacticalFormulaCoverage({
    innateSkillIds: Object.values(profiles).map((profile) => profile.innateSkill.id),
    generalSkillIds,
  })
  const wide = runWideSweep({
    teams,
    seedCount: wideSeedCount,
    seedPrefix,
    maxRounds,
    damageScale: params.damageScale,
    generalSkillIds,
  })
  const focus = mode === 'quick'
    ? undefined
    : runFocusedSweep({
      teams,
      wideTeamSummaries: wide.teamSummaries,
      seedCount: focusSeedCount,
      seedPrefix,
      maxRounds,
      damageScale: params.damageScale,
      generalSkillIds,
    })
  const weakVsHot = weakVsHotSeedCount > 0
    ? runWeakVsHotSweep({
      teams,
      wideTeamSummaries: wide.teamSummaries,
      seedCount: weakVsHotSeedCount,
      levelBonus: weakVsHotLevelBonus,
      seedPrefix,
      maxRounds,
      damageScale: params.damageScale,
      generalSkillIds,
    })
    : undefined

  return {
    generatedAt: new Date().toISOString(),
    mode,
    seedPrefix,
    wideSeedCount,
    focusSeedCount,
    weakVsHotSeedCount,
    weakVsHotLevelBonus,
    maxRounds,
    randomEquippedSkillPoolSize: generalSkillIds.length,
    battleCount: wide.battleCount + (focus?.battleCount ?? 0) + (weakVsHot?.battleCount ?? 0),
    formulaCoverage: {
      totalSkillCount: formulaAudit.totalSkillCount,
      implementedSkillCount: formulaAudit.implementedSkillIds.length,
      missingSkillIds: formulaAudit.missingSkillIds,
      missingInnateSkillIds: formulaAudit.missingInnateSkillIds,
      missingGeneralSkillIds: formulaAudit.missingGeneralSkillIds,
    },
    wide,
    focus,
    weakVsHot,
  }
}

function runWideSweep(params: {
  teams: TacticalSkillPlayerMixTeamSeed[]
  seedCount: number
  seedPrefix: string
  maxRounds: number
  damageScale?: number
  generalSkillIds: string[]
}) {
  const accumulators = Object.fromEntries(params.teams.map((team) => [team.id, createTeamAccumulator(team)]))
  const missingFormulaSkillIds = new Set<string>()
  let battleCount = 0

  for (const teamA of params.teams) {
    for (const teamB of params.teams) {
      if (teamA.id === teamB.id) {
        continue
      }
      for (let index = 0; index < params.seedCount; index += 1) {
        const seed = `${params.seedPrefix}:wide:${teamA.id}:vs:${teamB.id}:${index}`
        const report = resolveRepresentativeTacticalTeamBattle({
          teamA: buildRandomLoadoutTeam(teamA, params.generalSkillIds, `${seed}:teamA`),
          teamB: buildRandomLoadoutTeam(teamB, params.generalSkillIds, `${seed}:teamB`),
          seed,
          maxRounds: params.maxRounds,
          damageScale: params.damageScale,
        })
        battleCount += 1
        recordBattle(accumulators, teamA, teamB, report)
        for (const skillId of report.missingFormulaSkillIds) {
          missingFormulaSkillIds.add(skillId)
        }
      }
    }
  }

  const teamSummaries = summarizeTeamAccumulators(accumulators)
  const topTeams = teamSummaries.slice(0, 10)
  const bottomTeams = [...teamSummaries].slice(-10).reverse()
  return {
    seedCount: params.seedCount,
    battleCount,
    teamSummaries,
    topTeams,
    bottomTeams,
    importantTeams: IMPORTANT_TEAM_IDS
      .map((teamId) => teamSummaries.find((summary) => summary.id === teamId))
      .filter((summary): summary is TacticalSkillPlayerMixTeamSummary => Boolean(summary)),
    minimumPointRate: teamSummaries.length > 0 ? teamSummaries[teamSummaries.length - 1].pointRate : 0,
    teamsBelowPointRate40: teamSummaries.filter((summary) => summary.pointRate < 0.4),
    missingFormulaSkillIds: [...missingFormulaSkillIds].sort(),
  }
}

function runFocusedSweep(params: {
  teams: TacticalSkillPlayerMixTeamSeed[]
  wideTeamSummaries: TacticalSkillPlayerMixTeamSummary[]
  seedCount: number
  seedPrefix: string
  maxRounds: number
  damageScale?: number
  generalSkillIds: string[]
}) {
  const teamById = Object.fromEntries(params.teams.map((team) => [team.id, team]))
  const pairSeeds = buildFocusedPairSeeds(params.wideTeamSummaries)
    .map(([teamAId, teamBId]) => [teamById[teamAId], teamById[teamBId]] as const)
    .filter(([teamA, teamB]) => Boolean(teamA) && Boolean(teamB))
  const pairAccumulators = pairSeeds.map(([teamA, teamB]) => createPairAccumulator(teamA, teamB))
  const missingFormulaSkillIds = new Set<string>()
  let battleCount = 0

  for (let pairIndex = 0; pairIndex < pairSeeds.length; pairIndex += 1) {
    const [teamA, teamB] = pairSeeds[pairIndex]
    const pairAccumulator = pairAccumulators[pairIndex]
    for (let index = 0; index < params.seedCount; index += 1) {
      for (const direction of [0, 1]) {
        const left = direction === 0 ? teamA : teamB
        const right = direction === 0 ? teamB : teamA
        const seed = `${params.seedPrefix}:focus:${teamA.id}:vs:${teamB.id}:${index}:${direction}`
        const report = resolveRepresentativeTacticalTeamBattle({
          teamA: buildRandomLoadoutTeam(left, params.generalSkillIds, `${seed}:teamA`),
          teamB: buildRandomLoadoutTeam(right, params.generalSkillIds, `${seed}:teamB`),
          seed,
          maxRounds: params.maxRounds,
          damageScale: params.damageScale,
        })
        battleCount += 1
        recordPairBattle(pairAccumulator, left, right, report)
        for (const skillId of report.missingFormulaSkillIds) {
          missingFormulaSkillIds.add(skillId)
        }
      }
    }
  }

  const pairSummaries = pairAccumulators
    .map((accumulator) => summarizePairAccumulator(accumulator, params.seedCount))
    .sort((left, right) => left.pairId.localeCompare(right.pairId))

  return {
    seedCountPerDirection: params.seedCount,
    pairCount: pairSummaries.length,
    battleCount,
    pairSummaries,
    importantPairSummaries: pairSummaries.filter((summary) => (
      CONTROVERSY_PAIR_IDS.some(([left, right]) => (
        summary.pairId === buildPairId(left, right)
      ))
    )),
    missingFormulaSkillIds: [...missingFormulaSkillIds].sort(),
  }
}

function runWeakVsHotSweep(params: {
  teams: TacticalSkillPlayerMixTeamSeed[]
  wideTeamSummaries: TacticalSkillPlayerMixTeamSummary[]
  seedCount: number
  levelBonus: number
  seedPrefix: string
  maxRounds: number
  damageScale?: number
  generalSkillIds: string[]
}) {
  const teamById = Object.fromEntries(params.teams.map((team) => [team.id, team]))
  const hotTeams = params.wideTeamSummaries
    .slice(0, 4)
    .map((summary) => teamById[summary.id])
    .filter((team): team is TacticalSkillPlayerMixTeamSeed => Boolean(team))
  const weakSummarySeeds = params.wideTeamSummaries.filter((summary) => summary.pointRate < 0.4)
  const weakTeams = (weakSummarySeeds.length > 0 ? weakSummarySeeds : params.wideTeamSummaries.slice(-10))
    .map((summary) => teamById[summary.id])
    .filter((team): team is TacticalSkillPlayerMixTeamSeed => Boolean(team))
  const scenarioSummaries: TacticalSkillPlayerMixWeakVsHotScenarioSummary[] = []
  const missingFormulaSkillIds = new Set<string>()
  let battleCount = 0

  for (const weakTeam of weakTeams) {
    for (const hotTeam of hotTeams) {
      if (weakTeam.id === hotTeam.id) {
        continue
      }
      const baseline = runWeakVsHotScenario({
        weakTeam,
        hotTeam,
        seedCount: params.seedCount,
        levelBonus: 0,
        seedPrefix: params.seedPrefix,
        maxRounds: params.maxRounds,
        damageScale: params.damageScale,
        generalSkillIds: params.generalSkillIds,
      })
      scenarioSummaries.push(baseline.summary)
      battleCount += baseline.battleCount
      for (const skillId of baseline.missingFormulaSkillIds) {
        missingFormulaSkillIds.add(skillId)
      }
      if (params.levelBonus > 0) {
        const levelBonus = runWeakVsHotScenario({
          weakTeam,
          hotTeam,
          seedCount: params.seedCount,
          levelBonus: params.levelBonus,
          seedPrefix: params.seedPrefix,
          maxRounds: params.maxRounds,
          damageScale: params.damageScale,
          generalSkillIds: params.generalSkillIds,
        })
        scenarioSummaries.push(levelBonus.summary)
        battleCount += levelBonus.battleCount
        for (const skillId of levelBonus.missingFormulaSkillIds) {
          missingFormulaSkillIds.add(skillId)
        }
      }
    }
  }

  const sortedScenarioSummaries = scenarioSummaries.sort((left, right) => {
    const variantDiff = left.variant.localeCompare(right.variant)
    if (variantDiff !== 0) return variantDiff
    const pointDiff = left.weakPointRate - right.weakPointRate
    if (pointDiff !== 0) return pointDiff
    return left.scenarioId.localeCompare(right.scenarioId)
  })

  return {
    seedCountPerDirection: params.seedCount,
    weakLevelBonus: params.levelBonus,
    weakStrengthBonusPerHero: params.levelBonus * TACTICAL_GENERAL_STRENGTH_PER_LEVEL,
    hotTeamIds: hotTeams.map((team) => team.id),
    weakTeamIds: weakTeams.map((team) => team.id),
    scenarioCount: sortedScenarioSummaries.length,
    battleCount,
    scenarioSummaries: sortedScenarioSummaries,
    baselineBelowPointRate40: sortedScenarioSummaries.filter((summary) => (
      summary.variant === 'baseline' && summary.weakPointRate < 0.4
    )),
    levelBonusBelowPointRate40: sortedScenarioSummaries.filter((summary) => (
      summary.variant !== 'baseline' && summary.weakPointRate < 0.4
    )),
    passedWithLevelBonus: sortedScenarioSummaries.filter((summary) => (
      summary.variant !== 'baseline' && summary.weakPointRate >= 0.4
    )),
    missingFormulaSkillIds: [...missingFormulaSkillIds].sort(),
  }
}

function runWeakVsHotScenario(params: {
  weakTeam: TacticalSkillPlayerMixTeamSeed
  hotTeam: TacticalSkillPlayerMixTeamSeed
  seedCount: number
  levelBonus: number
  seedPrefix: string
  maxRounds: number
  damageScale?: number
  generalSkillIds: string[]
}) {
  const accumulator = createPairAccumulator(params.weakTeam, params.hotTeam)
  const missingFormulaSkillIds = new Set<string>()
  let battleCount = 0

  for (let index = 0; index < params.seedCount; index += 1) {
    for (const direction of [0, 1]) {
      const left = direction === 0 ? params.weakTeam : params.hotTeam
      const right = direction === 0 ? params.hotTeam : params.weakTeam
      const seed = [
        params.seedPrefix,
        'weak-vs-hot',
        params.weakTeam.id,
        'vs',
        params.hotTeam.id,
        params.levelBonus,
        index,
        direction,
      ].join(':')
      const report = resolveRepresentativeTacticalTeamBattle({
        teamA: buildRandomLoadoutTeam(
          left,
          params.generalSkillIds,
          `${seed}:teamA`,
          left.id === params.weakTeam.id ? { levelBonus: params.levelBonus } : undefined,
        ),
        teamB: buildRandomLoadoutTeam(
          right,
          params.generalSkillIds,
          `${seed}:teamB`,
          right.id === params.weakTeam.id ? { levelBonus: params.levelBonus } : undefined,
        ),
        seed,
        maxRounds: params.maxRounds,
        damageScale: params.damageScale,
      })
      battleCount += 1
      recordPairBattle(accumulator, left, right, report)
      for (const skillId of report.missingFormulaSkillIds) {
        missingFormulaSkillIds.add(skillId)
      }
    }
  }

  return {
    battleCount,
    missingFormulaSkillIds: [...missingFormulaSkillIds].sort(),
    summary: summarizeWeakVsHotAccumulator(accumulator, params),
  }
}

function buildFocusedPairSeeds(teamSummaries: TacticalSkillPlayerMixTeamSummary[]) {
  const top10 = teamSummaries.slice(0, 10).map((summary) => summary.id)
  const top3 = top10.slice(0, 3)
  const bottom10 = [...teamSummaries].slice(-10).map((summary) => summary.id)
  const pairIds = new Set<string>()
  const pairs: Array<[string, string]> = []
  const addPair = (left: string, right: string) => {
    if (left === right) return
    const pairId = buildPairId(left, right)
    if (pairIds.has(pairId)) return
    pairIds.add(pairId)
    pairs.push(left < right ? [left, right] : [right, left])
  }

  for (let leftIndex = 0; leftIndex < top10.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < top10.length; rightIndex += 1) {
      addPair(top10[leftIndex], top10[rightIndex])
    }
  }
  for (const weakTeamId of bottom10) {
    for (const strongTeamId of top3) {
      addPair(weakTeamId, strongTeamId)
    }
  }
  for (const [left, right] of CONTROVERSY_PAIR_IDS) {
    addPair(left, right)
  }
  return pairs
}

function recordBattle(
  accumulators: Record<string, TeamAccumulator>,
  teamA: TacticalSkillPlayerMixTeamSeed,
  teamB: TacticalSkillPlayerMixTeamSeed,
  report: ReturnType<typeof resolveRepresentativeTacticalTeamBattle>,
) {
  recordTeamOutcome(accumulators[teamA.id], report.winner === 'teamA' ? 'win' : report.winner === 'teamB' ? 'loss' : 'draw', report.round)
  recordTeamOutcome(accumulators[teamB.id], report.winner === 'teamB' ? 'win' : report.winner === 'teamA' ? 'loss' : 'draw', report.round)
  recordTeamEvents(accumulators, teamA, teamB, report.events)
  recordLastHit(accumulators, teamA, teamB, report.winner, report.events)
}

function recordPairBattle(
  accumulator: PairAccumulator,
  teamA: TacticalSkillPlayerMixTeamSeed,
  teamB: TacticalSkillPlayerMixTeamSeed,
  report: ReturnType<typeof resolveRepresentativeTacticalTeamBattle>,
) {
  accumulator.battleCount += 1
  accumulator.roundTotal += report.round
  if (report.winner === 'draw') {
    accumulator.draws += 1
  } else {
    const winnerId = report.winner === 'teamA' ? teamA.id : teamB.id
    accumulator.winsByTeamId[winnerId] = (accumulator.winsByTeamId[winnerId] ?? 0) + 1
  }
  const loserId = report.winner === 'teamA' ? teamB.id : report.winner === 'teamB' ? teamA.id : undefined
  const heroTeamMap = buildHeroTeamMap(teamA, teamB)
  const lastHit = loserId ? findLastDamageEventToTeam(report.events, loserId, heroTeamMap) : undefined
  if (loserId && lastHit) {
    const phaseTotals = accumulator.lastHitTakenByPhaseByTeamId[loserId]
    if (phaseTotals) {
      phaseTotals[lastHit.phase] += 1
    }
    const skillTotals = accumulator.lastHitTakenBySkillByTeamId[loserId]
    if (skillTotals) {
      skillTotals[lastHit.skillId] = (skillTotals[lastHit.skillId] ?? 0) + 1
    }
  }
}

function recordTeamOutcome(accumulator: TeamAccumulator, outcome: 'win' | 'loss' | 'draw', round: number) {
  accumulator.matches += 1
  accumulator.roundTotal += round
  if (outcome === 'win') accumulator.wins += 1
  if (outcome === 'loss') accumulator.losses += 1
  if (outcome === 'draw') accumulator.draws += 1
}

function recordTeamEvents(
  accumulators: Record<string, TeamAccumulator>,
  teamA: TacticalSkillPlayerMixTeamSeed,
  teamB: TacticalSkillPlayerMixTeamSeed,
  events: TacticalSkillEvent[],
) {
  const heroTeamMap = buildHeroTeamMap(teamA, teamB)
  for (const event of events) {
    const actorTeamId = event.actorTeamId ?? heroTeamMap[event.actorHeroId]
    const targetTeamId = event.targetTeamId ?? (event.targetHeroId ? heroTeamMap[event.targetHeroId] : undefined)
    if (actorTeamId) {
      const actorAccumulator = accumulators[actorTeamId]
      actorAccumulator.damageDone += event.damage ?? 0
      actorAccumulator.healingDone += event.healing ?? 0
      actorAccumulator.phaseDamageDone[event.phase] += event.damage ?? 0
      if (event.notes.some((note) => (
        note.startsWith('commanderProtection+')
          || note.startsWith('damageReduction+')
          || note.startsWith('commandProtectionDamageReduction')
      ))) {
        actorAccumulator.commandProtectionEvents += 1
      }
      if (event.skillId.startsWith('innate_')) {
        recordSkillStat(actorAccumulator.innateSkillStats, event, actorAccumulator.matches)
      } else if (event.skillId !== 'normal_attack') {
        recordSkillStat(actorAccumulator.equippedSkillStats, event, actorAccumulator.matches)
      }
    }
    if (targetTeamId) {
      const targetAccumulator = accumulators[targetTeamId]
      targetAccumulator.damageTaken += event.damage ?? 0
      targetAccumulator.preventedDamage += event.preventedDamage ?? 0
      targetAccumulator.phaseDamageTaken[event.phase] += event.damage ?? 0
    }
  }
}

function recordLastHit(
  accumulators: Record<string, TeamAccumulator>,
  teamA: TacticalSkillPlayerMixTeamSeed,
  teamB: TacticalSkillPlayerMixTeamSeed,
  winner: TacticalTeamBattleOutcome,
  events: TacticalSkillEvent[],
) {
  if (winner === 'draw') {
    return
  }
  const winnerId = winner === 'teamA' ? teamA.id : teamB.id
  const loserId = winner === 'teamA' ? teamB.id : teamA.id
  const heroTeamMap = buildHeroTeamMap(teamA, teamB)
  const lastHit = findLastDamageEventToTeam(events, loserId, heroTeamMap)
  if (!lastHit) {
    return
  }
  accumulators[winnerId].lastHitDoneByPhase[lastHit.phase] += 1
  accumulators[loserId].lastHitTakenByPhase[lastHit.phase] += 1
}

function findLastDamageEventToTeam(
  events: TacticalSkillEvent[],
  teamId: string,
  heroTeamMap: Record<string, string>,
) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if ((event.damage ?? 0) <= 0 || !event.targetHeroId) {
      continue
    }
    if ((event.targetTeamId ?? heroTeamMap[event.targetHeroId]) === teamId) {
      return event
    }
  }
  return undefined
}

function createTeamAccumulator(team: TacticalSkillPlayerMixTeamSeed): TeamAccumulator {
  return {
    ...team,
    matches: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    roundTotal: 0,
    damageDone: 0,
    damageTaken: 0,
    healingDone: 0,
    preventedDamage: 0,
    commandProtectionEvents: 0,
    phaseDamageDone: emptyPhaseTotals(),
    phaseDamageTaken: emptyPhaseTotals(),
    lastHitDoneByPhase: emptyPhaseTotals(),
    lastHitTakenByPhase: emptyPhaseTotals(),
    innateSkillStats: {},
    equippedSkillStats: {},
  }
}

function createPairAccumulator(teamA: TacticalSkillPlayerMixTeamSeed, teamB: TacticalSkillPlayerMixTeamSeed): PairAccumulator {
  return {
    pairId: buildPairId(teamA.id, teamB.id),
    teamA,
    teamB,
    battleCount: 0,
    roundTotal: 0,
    winsByTeamId: {
      [teamA.id]: 0,
      [teamB.id]: 0,
    },
    draws: 0,
    lastHitTakenByPhaseByTeamId: {
      [teamA.id]: emptyPhaseTotals(),
      [teamB.id]: emptyPhaseTotals(),
    },
    lastHitTakenBySkillByTeamId: {
      [teamA.id]: {},
      [teamB.id]: {},
    },
  }
}

function summarizeTeamAccumulators(accumulators: Record<string, TeamAccumulator>) {
  const skillNameMap = buildSkillNameMap()
  const summaries = Object.values(accumulators).map((accumulator) => {
    const summary: TacticalSkillPlayerMixTeamSummary = {
      id: accumulator.id,
      name: accumulator.name,
      heroIds: accumulator.heroIds,
      matches: accumulator.matches,
      wins: accumulator.wins,
      losses: accumulator.losses,
      draws: accumulator.draws,
      winRate: roundRatio(accumulator.wins, accumulator.matches),
      lossRate: roundRatio(accumulator.losses, accumulator.matches),
      drawRate: roundRatio(accumulator.draws, accumulator.matches),
      pointRate: roundRatio(accumulator.wins + accumulator.draws * 0.5, accumulator.matches),
      averageRounds: roundRatio(accumulator.roundTotal, accumulator.matches),
      damageDonePerMatch: roundRatio(accumulator.damageDone, accumulator.matches),
      damageTakenPerMatch: roundRatio(accumulator.damageTaken, accumulator.matches),
      healingDonePerMatch: roundRatio(accumulator.healingDone, accumulator.matches),
      preventedDamagePerMatch: roundRatio(accumulator.preventedDamage, accumulator.matches),
      phaseDamageDonePerMatch: dividePhaseTotals(accumulator.phaseDamageDone, accumulator.matches),
      phaseDamageTakenPerMatch: dividePhaseTotals(accumulator.phaseDamageTaken, accumulator.matches),
      lastHitDoneByPhase: { ...accumulator.lastHitDoneByPhase },
      lastHitTakenByPhase: { ...accumulator.lastHitTakenByPhase },
      commandProtectionEventsPerMatch: roundRatio(accumulator.commandProtectionEvents, accumulator.matches),
      topInnateSkills: summarizeSkillStats(accumulator.innateSkillStats, accumulator.matches, skillNameMap).slice(0, 5),
      topEquippedSkills: summarizeSkillStats(accumulator.equippedSkillStats, accumulator.matches, skillNameMap).slice(0, 8),
      weaknessSignals: [],
    }
    summary.weaknessSignals = buildWeaknessSignals(summary)
    return summary
  })

  return summaries.sort((left, right) => {
    const pointDiff = right.pointRate - left.pointRate
    if (pointDiff !== 0) return pointDiff
    const winDiff = right.winRate - left.winRate
    if (winDiff !== 0) return winDiff
    return left.id.localeCompare(right.id)
  })
}

function summarizePairAccumulator(
  accumulator: PairAccumulator,
  seedCountPerDirection: number,
): TacticalSkillPlayerMixPairSummary {
  const skillNameMap = buildSkillNameMap()
  return {
    pairId: accumulator.pairId,
    teamA: accumulator.teamA,
    teamB: accumulator.teamB,
    seedCountPerDirection,
    battleCount: accumulator.battleCount,
    winsByTeamId: { ...accumulator.winsByTeamId },
    winRatesByTeamId: Object.fromEntries(
      Object.entries(accumulator.winsByTeamId).map(([teamId, wins]) => [teamId, roundRatio(wins, accumulator.battleCount)]),
    ),
    draws: accumulator.draws,
    drawRate: roundRatio(accumulator.draws, accumulator.battleCount),
    averageRounds: roundRatio(accumulator.roundTotal, accumulator.battleCount),
    lastHitTakenByPhaseByTeamId: accumulator.lastHitTakenByPhaseByTeamId,
    lastHitTakenBySkillByTeamId: accumulator.lastHitTakenBySkillByTeamId,
    lastHitTakenTopSkillsByTeamId: Object.fromEntries(
      Object.entries(accumulator.lastHitTakenBySkillByTeamId).map(([teamId, counts]) => [
        teamId,
        summarizeLastHitSkillCounts(counts, skillNameMap),
      ]),
    ),
  }
}

function summarizeWeakVsHotAccumulator(
  accumulator: PairAccumulator,
  params: {
    weakTeam: TacticalSkillPlayerMixTeamSeed
    hotTeam: TacticalSkillPlayerMixTeamSeed
    seedCount: number
    levelBonus: number
  },
): TacticalSkillPlayerMixWeakVsHotScenarioSummary {
  const skillNameMap = buildSkillNameMap()
  const weakWins = accumulator.winsByTeamId[params.weakTeam.id] ?? 0
  const hotWins = accumulator.winsByTeamId[params.hotTeam.id] ?? 0
  const weakLastHitTakenByPhase = accumulator.lastHitTakenByPhaseByTeamId[params.weakTeam.id] ?? emptyPhaseTotals()
  const weakLastHitTakenCount = sumPhaseTotals(weakLastHitTakenByPhase)
  const weakPointRate = roundRatio(weakWins + accumulator.draws * 0.5, accumulator.battleCount)
  const weakLevelBonus = params.levelBonus

  return {
    scenarioId: `${params.weakTeam.id}__vs__${params.hotTeam.id}__${weakLevelBonus > 0 ? `weak_level_plus_${weakLevelBonus}` : 'baseline'}`,
    variant: weakLevelBonus > 0 ? `weak_level_plus_${weakLevelBonus}` : 'baseline',
    weakTeam: params.weakTeam,
    hotTeam: params.hotTeam,
    weakLevelBonus,
    weakStrengthBonusPerHero: weakLevelBonus * TACTICAL_GENERAL_STRENGTH_PER_LEVEL,
    seedCountPerDirection: params.seedCount,
    battleCount: accumulator.battleCount,
    weakWins,
    hotWins,
    draws: accumulator.draws,
    weakWinRate: roundRatio(weakWins, accumulator.battleCount),
    weakPointRate,
    hotWinRate: roundRatio(hotWins, accumulator.battleCount),
    drawRate: roundRatio(accumulator.draws, accumulator.battleCount),
    averageRounds: roundRatio(accumulator.roundTotal, accumulator.battleCount),
    reachesPointRate40: weakPointRate >= 0.4,
    weakLastHitTakenByPhase,
    weakLastHitTakenShareByPhase: dividePhaseTotals(weakLastHitTakenByPhase, weakLastHitTakenCount),
    weakLastHitTakenTopSkills: summarizeLastHitSkillCounts(
      accumulator.lastHitTakenBySkillByTeamId[params.weakTeam.id] ?? {},
      skillNameMap,
    ),
    hotLastHitTakenTopSkills: summarizeLastHitSkillCounts(
      accumulator.lastHitTakenBySkillByTeamId[params.hotTeam.id] ?? {},
      skillNameMap,
    ),
  }
}

function buildWeaknessSignals(summary: TacticalSkillPlayerMixTeamSummary) {
  const signals: string[] = []
  const totalOffense = summary.damageDonePerMatch + summary.healingDonePerMatch
  const activeShare = summary.damageDonePerMatch > 0
    ? summary.phaseDamageDonePerMatch.active_skill / summary.damageDonePerMatch
    : 0
  const chaseShare = summary.damageDonePerMatch > 0
    ? summary.phaseDamageDonePerMatch.chase_skill / summary.damageDonePerMatch
    : 0
  const normalShare = summary.damageDonePerMatch > 0
    ? summary.phaseDamageDonePerMatch.normal_attack / summary.damageDonePerMatch
    : 0
  const lastHitDoneCount = sumPhaseTotals(summary.lastHitDoneByPhase)
  const lastHitTakenCount = sumPhaseTotals(summary.lastHitTakenByPhase)
  const normalLastHitDoneShare = lastHitDoneCount > 0
    ? summary.lastHitDoneByPhase.normal_attack / lastHitDoneCount
    : 0
  const normalLastHitTakenShare = lastHitTakenCount > 0
    ? summary.lastHitTakenByPhase.normal_attack / lastHitTakenCount
    : 0
  const activeLastHitTakenShare = lastHitTakenCount > 0
    ? summary.lastHitTakenByPhase.active_skill / lastHitTakenCount
    : 0
  const isLowPointRate = summary.pointRate < 0.4
  const innateDamage = summary.topInnateSkills.reduce((sum, skill) => sum + skill.perMatchDamage, 0)
  const innateHealing = summary.topInnateSkills.reduce((sum, skill) => sum + skill.perMatchHealing, 0)

  if (isLowPointRate) signals.push('point_rate_below_40')
  if (summary.damageDonePerMatch < 5_500) signals.push('low_total_damage')
  if (summary.damageTakenPerMatch > summary.damageDonePerMatch * 1.25) signals.push('takes_much_more_damage_than_deals')
  if (activeShare < 0.28 && chaseShare < 0.18) signals.push('low_skill_damage_share')
  if (normalShare > 0.62) signals.push('over_relies_on_normal_attack')
  if (isLowPointRate && normalLastHitDoneShare > 0.52 && activeShare < 0.32 && chaseShare < 0.16) signals.push('normal_attack_finish_dependency')
  if (isLowPointRate && summary.damageTakenPerMatch > summary.damageDonePerMatch * 1.18 && normalLastHitTakenShare > 0.45) signals.push('normal_attack_last_hit_pressure')
  if (isLowPointRate && summary.damageTakenPerMatch > summary.damageDonePerMatch * 1.18 && activeLastHitTakenShare > 0.36) signals.push('active_skill_last_hit_pressure')
  if (summary.healingDonePerMatch > 1_200 && summary.damageDonePerMatch < 6_500) signals.push('support_without_finisher')
  if (summary.commandProtectionEventsPerMatch > 2 && totalOffense < 7_000) signals.push('protection_without_output')
  if (innateDamage < 1_100 && innateHealing < 700) signals.push('weak_innate_skill_impact')
  return signals
}

function sumPhaseTotals(totals: TacticalSkillPlayerMixPhaseTotals) {
  return Object.values(totals).reduce((sum, value) => sum + value, 0)
}

function summarizeSkillStats(
  skillStats: Record<string, TacticalTeamMatrixSkillStat>,
  matches: number,
  skillNameMap: Record<string, string>,
): TacticalSkillPlayerMixSkillSummary[] {
  return Object.entries(skillStats)
    .map(([skillId, stat]) => ({
      skillId,
      skillName: skillNameMap[skillId] ?? skillId,
      seenInLoadouts: stat.seenInLoadouts,
      eventCount: stat.eventCount,
      activatedCount: stat.activatedCount,
      totalDamage: stat.totalDamage,
      totalHealing: stat.totalHealing,
      totalPreventedDamage: stat.totalPreventedDamage,
      perMatchDamage: roundRatio(stat.totalDamage, matches),
      perMatchHealing: roundRatio(stat.totalHealing, matches),
      perActivationDamage: roundRatio(stat.totalDamage, stat.activatedCount),
      perActivationHealing: roundRatio(stat.totalHealing, stat.activatedCount),
    }))
    .sort((left, right) => (
      (right.totalDamage + right.totalHealing + right.totalPreventedDamage)
        - (left.totalDamage + left.totalHealing + left.totalPreventedDamage)
    ))
}

function summarizeLastHitSkillCounts(
  counts: Record<string, number>,
  skillNameMap: Record<string, string>,
): TacticalSkillPlayerMixLastHitSkillSummary[] {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  return Object.entries(counts)
    .map(([skillId, count]) => ({
      skillId,
      skillName: skillNameMap[skillId] ?? skillId,
      count,
      share: roundRatio(count, total),
    }))
    .sort((left, right) => {
      const countDiff = right.count - left.count
      if (countDiff !== 0) return countDiff
      return left.skillId.localeCompare(right.skillId)
    })
    .slice(0, 5)
}

function recordSkillStat(
  skillStats: Record<string, TacticalTeamMatrixSkillStat>,
  event: TacticalSkillEvent,
  seenInLoadouts: number,
) {
  const stat = ensureSkillStat(skillStats, event.skillId)
  stat.seenInLoadouts = Math.max(stat.seenInLoadouts, seenInLoadouts)
  stat.eventCount += 1
  if (event.activated) {
    stat.activatedCount += 1
  }
  stat.totalDamage += event.damage ?? 0
  stat.totalHealing += event.healing ?? 0
  stat.totalPreventedDamage += event.preventedDamage ?? 0
}

function ensureSkillStat(skillStats: Record<string, TacticalTeamMatrixSkillStat>, skillId: string) {
  skillStats[skillId] ??= {
    seenInLoadouts: 0,
    eventCount: 0,
    activatedCount: 0,
    totalDamage: 0,
    totalHealing: 0,
    totalPreventedDamage: 0,
  }
  return skillStats[skillId]
}

function buildRandomLoadoutTeam(
  teamSeed: TacticalSkillPlayerMixTeamSeed,
  equippedSkillPool: string[],
  seed: string,
  options: {
    levelBonus?: number
  } = {},
): TacticalTeam {
  const strengthBonus = (options.levelBonus ?? 0) * TACTICAL_GENERAL_STRENGTH_PER_LEVEL
  return {
    id: teamSeed.id,
    name: teamSeed.name,
    members: teamSeed.heroIds.map((heroId, index) => {
      const combatant = buildTacticalCombatantFromGeneralCatalog(
        heroId,
        chooseRandomSkillIds(equippedSkillPool, 2, seed, `${heroId}:${index}`),
      )
      return strengthBonus > 0
        ? { ...combatant, strength: combatant.strength + strengthBonus }
        : combatant
    }),
  }
}

function chooseRandomSkillIds(skillPool: string[], count: number, seed: string, key: string) {
  const pool = [...skillPool]
  const selected: string[] = []
  for (let index = 0; index < count && pool.length > 0; index += 1) {
    const selectedIndex = resolveDeterministicIndex(seed, `${key}:${index}`, pool.length)
    selected.push(pool.splice(selectedIndex, 1)[0])
  }
  return selected
}

function buildHeroTeamMap(teamA: TacticalSkillPlayerMixTeamSeed, teamB: TacticalSkillPlayerMixTeamSeed) {
  return {
    ...Object.fromEntries(teamA.heroIds.map((heroId) => [heroId, teamA.id])),
    ...Object.fromEntries(teamB.heroIds.map((heroId) => [heroId, teamB.id])),
  }
}

function buildSkillNameMap() {
  const profileSkillNames = Object.fromEntries(
    Object.values(loadGeneralProfileCatalog()).map((profile) => [profile.innateSkill.id, profile.innateSkill.name]),
  )
  const generalSkillNames = Object.fromEntries(
    Object.values(loadGeneralSkillCatalog()).map((skill) => [skill.id, skill.name]),
  )
  return {
    normal_attack: '普通攻击',
    ...profileSkillNames,
    ...generalSkillNames,
  }
}

function emptyPhaseTotals(): TacticalSkillPlayerMixPhaseTotals {
  return {
    battle_start: 0,
    normal_attack: 0,
    active_skill: 0,
    chase_skill: 0,
    command_recovery: 0,
    burn: 0,
  }
}

function dividePhaseTotals(totals: TacticalSkillPlayerMixPhaseTotals, denominator: number) {
  return {
    battle_start: roundRatio(totals.battle_start, denominator),
    normal_attack: roundRatio(totals.normal_attack, denominator),
    active_skill: roundRatio(totals.active_skill, denominator),
    chase_skill: roundRatio(totals.chase_skill, denominator),
    command_recovery: roundRatio(totals.command_recovery, denominator),
    burn: roundRatio(totals.burn, denominator),
  }
}

function buildPairId(left: string, right: string) {
  return left < right ? `${left}__${right}` : `${right}__${left}`
}

function normalizeSeedCount(seedCount: number, label: string) {
  if (!Number.isInteger(seedCount) || seedCount <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
  return seedCount
}

function normalizeOptionalSeedCount(seedCount: number, label: string) {
  if (!Number.isInteger(seedCount) || seedCount < 0) {
    throw new Error(`${label} must be a non-negative integer`)
  }
  return seedCount
}

function normalizeNonNegativeInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`)
  }
  return value
}

function roundRatio(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return 0
  }
  return Math.round((numerator / denominator) * 10_000) / 10_000
}

function resolveDeterministicIndex(seed: string, key: string, length: number) {
  if (length <= 0) {
    throw new Error('cannot choose from empty deterministic pool')
  }
  const input = `${seed}:${key}`
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % length
}
