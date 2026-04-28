import {
  buildTacticalCombatantFromGeneralCatalog,
  loadGeneralProfileCatalog,
  loadGeneralSkillCatalog,
} from './generalProfileCatalog'
import {
  auditRepresentativeTacticalFormulaCoverage,
} from './tacticalSkillFormulaCatalog'
import {
  resolveRepresentativeTacticalTeamBattle,
  type TacticalSkillEvent,
  type TacticalTeam,
  type TacticalTeamBattleOutcome,
  type TacticalTeamMatrixOutcome,
  type TacticalTeamMatrixSkillStat,
} from './tacticalSkillRules'

export type TacticalSkillBalanceEvalScenario = {
  id: string
  name: string
  teamA: TacticalSkillBalanceEvalTeamSeed
  teamB: TacticalSkillBalanceEvalTeamSeed
}

export type TacticalSkillBalanceEvalTeamSeed = {
  id: string
  name: string
  heroIds: [string, string, string]
}

export type TacticalSkillBalanceEvalThresholds = {
  shortAverageRoundMax: number
  shortRoundMax: number
  shortRoundRateMin: number
  winRateSkewMin: number
  damagePerActivationWarn: number
  damagePerSeenLoadoutWarn: number
  healingPerActivationWarn: number
  healingPerSeenLoadoutWarn: number
  topSkillCount: number
}

export type TacticalSkillBalanceEvalSkillSummary = TacticalTeamMatrixSkillStat & {
  skillId: string
  perActivationDamage: number
  perSeenLoadoutDamage: number
  perActivationHealing: number
  perSeenLoadoutHealing: number
}

export type TacticalSkillBalanceEvalAnomaly = {
  type:
    | 'formula_missing'
    | 'short_battle_average'
    | 'short_battle_rate'
    | 'win_rate_skew'
    | 'skill_damage_outlier'
    | 'skill_healing_outlier'
  severity: 'warning' | 'blocker'
  scenarioId: string
  metric: string
  value: number
  threshold: number
  skillId?: string
  teamId?: string
  teamName?: string
  message: string
}

export type TacticalSkillBalanceEvalScenarioResult = {
  scenarioId: string
  scenarioName: string
  seedPrefix: string
  seedCount: number
  maxRounds: number
  loadoutMode: 'random_equipped'
  randomEquippedSkillPoolSize: number
  teamA: TacticalSkillBalanceEvalTeamSeed
  teamB: TacticalSkillBalanceEvalTeamSeed
  outcomeLabels: Record<TacticalTeamMatrixOutcome, string>
  outcomes: Record<TacticalTeamMatrixOutcome, number>
  rates: Record<TacticalTeamMatrixOutcome, number>
  averageRounds: number
  shortBattleCount: number
  shortBattleRate: number
  roundHistogram: Record<string, number>
  missingFormulaSkillIds: string[]
  topDamageSkills: TacticalSkillBalanceEvalSkillSummary[]
  topHealingSkills: TacticalSkillBalanceEvalSkillSummary[]
  anomalies: TacticalSkillBalanceEvalAnomaly[]
}

export type TacticalSkillBalanceEvalReport = {
  generatedAt: string
  seedCount: number
  seedPrefix: string
  thresholds: TacticalSkillBalanceEvalThresholds
  formulaCoverage: {
    totalSkillCount: number
    implementedSkillCount: number
    missingSkillIds: string[]
    missingInnateSkillIds: string[]
    missingGeneralSkillIds: string[]
  }
  scenarioResults: TacticalSkillBalanceEvalScenarioResult[]
  anomalies: TacticalSkillBalanceEvalAnomaly[]
}

export const DEFAULT_TACTICAL_SKILL_BALANCE_EVAL_THRESHOLDS: TacticalSkillBalanceEvalThresholds = {
  shortAverageRoundMax: 2.25,
  shortRoundMax: 2,
  shortRoundRateMin: 0.65,
  winRateSkewMin: 0.75,
  damagePerActivationWarn: 3_000,
  damagePerSeenLoadoutWarn: 5_000,
  healingPerActivationWarn: 1_100,
  healingPerSeenLoadoutWarn: 2_200,
  topSkillCount: 8,
}

export function buildDefaultTacticalSkillBalanceEvalScenarios(): TacticalSkillBalanceEvalScenario[] {
  return [
    {
      id: 'weiwu-vs-changban',
      name: '魏武张辽周瑜 vs 赵云曹操吕布',
      teamA: { id: 'teamA', name: '魏武张辽周瑜', heroIds: ['100027', '100451', '100031'] },
      teamB: { id: 'teamB', name: '赵云曹操吕布', heroIds: ['100021', '100023', '100661'] },
    },
    {
      id: 'burst-cavalry-vs-guard',
      name: '张辽关羽周瑜 vs 赵云曹操吕布',
      teamA: { id: 'teamA', name: '爆发骑弓', heroIds: ['100027', '100451', '100031'] },
      teamB: { id: 'teamB', name: '护主混编', heroIds: ['100021', '100023', '100661'] },
    },
    {
      id: 'shu-vs-wei',
      name: '刘备赵云张飞 vs 曹操张辽司马懿',
      teamA: { id: 'teamA', name: '蜀汉续航', heroIds: ['100016', '100021', '100716'] },
      teamB: { id: 'teamB', name: '曹魏爆发', heroIds: ['100023', '100027', '100709'] },
    },
    {
      id: 'wu-vs-qun',
      name: '孙权周瑜太史慈 vs 吕布董卓贾诩',
      teamA: { id: 'teamA', name: '东吴火弓', heroIds: ['100711', '100031', '100090'] },
      teamB: { id: 'teamB', name: '群雄乱武', heroIds: ['100661', '100703', '100707'] },
    },
    {
      id: 'heal-vs-burst',
      name: '刘备蔡文姬赵云 vs 张辽关羽张飞',
      teamA: { id: 'teamA', name: '治疗护主', heroIds: ['100016', '100718', '100021'] },
      teamB: { id: 'teamB', name: '强攻压制', heroIds: ['100027', '100451', '100716'] },
    },
  ]
}

export function runTacticalSkillBalanceEval(params: {
  scenarios?: TacticalSkillBalanceEvalScenario[]
  seedCount?: number
  seedPrefix?: string
  maxRounds?: number
  damageScale?: number
  thresholds?: Partial<TacticalSkillBalanceEvalThresholds>
} = {}): TacticalSkillBalanceEvalReport {
  const scenarios = params.scenarios ?? buildDefaultTacticalSkillBalanceEvalScenarios()
  const seedCount = params.seedCount ?? 256
  const seedPrefix = params.seedPrefix ?? 'tactical_skill_balance_eval'
  const maxRounds = params.maxRounds ?? 8
  const thresholds = {
    ...DEFAULT_TACTICAL_SKILL_BALANCE_EVAL_THRESHOLDS,
    ...params.thresholds,
  }
  const generalSkills = loadGeneralSkillCatalog()
  const profiles = loadGeneralProfileCatalog()
  const equippedSkillPool = Object.keys(generalSkills).sort()
  const formulaAudit = auditRepresentativeTacticalFormulaCoverage({
    innateSkillIds: Object.values(profiles).map((profile) => profile.innateSkill.id),
    generalSkillIds: equippedSkillPool,
  })
  const scenarioResults = scenarios.map((scenario) => runScenario({
    scenario,
    seedCount,
    seedPrefix,
    maxRounds,
    damageScale: params.damageScale,
    equippedSkillPool,
    thresholds,
  }))
  const formulaAnomalies = formulaAudit.missingSkillIds.length > 0
    ? scenarios.map((scenario) => ({
      type: 'formula_missing' as const,
      severity: 'blocker' as const,
      scenarioId: scenario.id,
      metric: 'missingFormulaSkillIds',
      value: formulaAudit.missingSkillIds.length,
      threshold: 0,
      message: `formula catalog missing ${formulaAudit.missingSkillIds.length} skills`,
    }))
    : []

  return {
    generatedAt: new Date().toISOString(),
    seedCount,
    seedPrefix,
    thresholds,
    formulaCoverage: {
      totalSkillCount: formulaAudit.totalSkillCount,
      implementedSkillCount: formulaAudit.implementedSkillIds.length,
      missingSkillIds: formulaAudit.missingSkillIds,
      missingInnateSkillIds: formulaAudit.missingInnateSkillIds,
      missingGeneralSkillIds: formulaAudit.missingGeneralSkillIds,
    },
    scenarioResults,
    anomalies: [...formulaAnomalies, ...scenarioResults.flatMap((result) => result.anomalies)],
  }
}

export function summarizeTacticalSkillBalanceAnomalies(
  report: TacticalSkillBalanceEvalReport,
): TacticalSkillBalanceEvalAnomaly[] {
  return report.anomalies
}

function runScenario(params: {
  scenario: TacticalSkillBalanceEvalScenario
  seedCount: number
  seedPrefix: string
  maxRounds: number
  damageScale?: number
  equippedSkillPool: string[]
  thresholds: TacticalSkillBalanceEvalThresholds
}): TacticalSkillBalanceEvalScenarioResult {
  const outcomes: Record<TacticalTeamMatrixOutcome, number> = {
    win: 0,
    loss: 0,
    draw: 0,
  }
  const skillStats: Record<string, TacticalTeamMatrixSkillStat> = {}
  const missingFormulaSkillIds = new Set<string>()
  const roundHistogram: Record<string, number> = {}
  let roundTotal = 0
  let shortBattleCount = 0

  for (let index = 0; index < params.seedCount; index += 1) {
    const seed = `${params.seedPrefix}:${params.scenario.id}:${index}`
    const teamA = withRandomEquippedSkills(
      buildTeam(params.scenario.teamA),
      params.equippedSkillPool,
      `${seed}:teamA`,
    )
    const teamB = withRandomEquippedSkills(
      buildTeam(params.scenario.teamB),
      params.equippedSkillPool,
      `${seed}:teamB`,
    )
    recordLoadoutSkillStats(skillStats, teamA)
    recordLoadoutSkillStats(skillStats, teamB)

    const report = resolveRepresentativeTacticalTeamBattle({
      teamA,
      teamB,
      seed,
      maxRounds: params.maxRounds,
      damageScale: params.damageScale,
    })
    outcomes[toTeamMatrixOutcome(report.winner)] += 1
    roundTotal += report.round
    if (report.round <= params.thresholds.shortRoundMax) {
      shortBattleCount += 1
    }
    roundHistogram[String(report.round)] = (roundHistogram[String(report.round)] ?? 0) + 1
    for (const skillId of report.missingFormulaSkillIds) {
      missingFormulaSkillIds.add(skillId)
    }
    recordEventSkillStats(skillStats, report.events)
  }

  const topDamageSkills = summarizeSkillStats(skillStats)
    .filter((summary) => summary.totalDamage > 0)
    .sort((left, right) => right.totalDamage - left.totalDamage)
    .slice(0, params.thresholds.topSkillCount)
  const topHealingSkills = summarizeSkillStats(skillStats)
    .filter((summary) => summary.totalHealing > 0)
    .sort((left, right) => right.totalHealing - left.totalHealing)
    .slice(0, params.thresholds.topSkillCount)
  const averageRounds = roundNumber(roundTotal / params.seedCount, 2)
  const shortBattleRate = roundNumber(shortBattleCount / params.seedCount, 4)
  const rates = {
    win: roundNumber(outcomes.win / params.seedCount, 4),
    loss: roundNumber(outcomes.loss / params.seedCount, 4),
    draw: roundNumber(outcomes.draw / params.seedCount, 4),
  }
  const resultBase = {
    scenarioId: params.scenario.id,
    scenarioName: params.scenario.name,
    seedPrefix: params.seedPrefix,
    seedCount: params.seedCount,
    maxRounds: params.maxRounds,
    loadoutMode: 'random_equipped' as const,
    randomEquippedSkillPoolSize: params.equippedSkillPool.length,
    teamA: cloneTeamSeed(params.scenario.teamA),
    teamB: cloneTeamSeed(params.scenario.teamB),
    outcomeLabels: {
      win: `teamA:${params.scenario.teamA.name}`,
      loss: `teamB:${params.scenario.teamB.name}`,
      draw: 'draw',
    },
    outcomes,
    rates,
    averageRounds,
    shortBattleCount,
    shortBattleRate,
    roundHistogram,
    missingFormulaSkillIds: [...missingFormulaSkillIds].sort(),
    topDamageSkills,
    topHealingSkills,
  }

  return {
    ...resultBase,
    anomalies: detectScenarioAnomalies(resultBase, params.thresholds),
  }
}

function detectScenarioAnomalies(
  result: Omit<TacticalSkillBalanceEvalScenarioResult, 'anomalies'>,
  thresholds: TacticalSkillBalanceEvalThresholds,
): TacticalSkillBalanceEvalAnomaly[] {
  const anomalies: TacticalSkillBalanceEvalAnomaly[] = []
  if (result.missingFormulaSkillIds.length > 0) {
    anomalies.push({
      type: 'formula_missing',
      severity: 'blocker',
      scenarioId: result.scenarioId,
      metric: 'missingFormulaSkillIds',
      value: result.missingFormulaSkillIds.length,
      threshold: 0,
      message: `scenario has ${result.missingFormulaSkillIds.length} missing formulas`,
    })
  }
  if (result.averageRounds <= thresholds.shortAverageRoundMax) {
    anomalies.push({
      type: 'short_battle_average',
      severity: 'warning',
      scenarioId: result.scenarioId,
      metric: 'averageRounds',
      value: result.averageRounds,
      threshold: thresholds.shortAverageRoundMax,
      message: `averageRounds ${result.averageRounds} is at or below ${thresholds.shortAverageRoundMax}`,
    })
  }
  if (result.shortBattleRate >= thresholds.shortRoundRateMin) {
    anomalies.push({
      type: 'short_battle_rate',
      severity: 'warning',
      scenarioId: result.scenarioId,
      metric: `round<=${thresholds.shortRoundMax} rate`,
      value: result.shortBattleRate,
      threshold: thresholds.shortRoundRateMin,
      message: `short battle rate ${result.shortBattleRate} is at or above ${thresholds.shortRoundRateMin}`,
    })
  }
  for (const [outcome, rate] of Object.entries(result.rates) as Array<[TacticalTeamMatrixOutcome, number]>) {
    if (outcome === 'draw') {
      continue
    }
    if (rate >= thresholds.winRateSkewMin) {
      const team = outcome === 'win' ? result.teamA : result.teamB
      anomalies.push({
        type: 'win_rate_skew',
        severity: 'warning',
        scenarioId: result.scenarioId,
        teamId: team.id,
        teamName: team.name,
        metric: `${outcome}Rate`,
        value: rate,
        threshold: thresholds.winRateSkewMin,
        message: `${team.name} rate ${rate} is at or above ${thresholds.winRateSkewMin}`,
      })
    }
  }
  for (const skill of result.topDamageSkills) {
    const metric = skill.perActivationDamage >= thresholds.damagePerActivationWarn
      ? {
        name: 'perActivationDamage',
        value: skill.perActivationDamage,
        threshold: thresholds.damagePerActivationWarn,
      }
      : skill.perSeenLoadoutDamage >= thresholds.damagePerSeenLoadoutWarn
        ? {
          name: 'perSeenLoadoutDamage',
          value: skill.perSeenLoadoutDamage,
          threshold: thresholds.damagePerSeenLoadoutWarn,
        }
        : null
    if (metric) {
      anomalies.push({
        type: 'skill_damage_outlier',
        severity: 'warning',
        scenarioId: result.scenarioId,
        skillId: skill.skillId,
        metric: metric.name,
        value: metric.value,
        threshold: metric.threshold,
        message: `${skill.skillId} ${metric.name} ${metric.value}`,
      })
    }
  }
  for (const skill of result.topHealingSkills) {
    const metric = skill.perActivationHealing >= thresholds.healingPerActivationWarn
      ? {
        name: 'perActivationHealing',
        value: skill.perActivationHealing,
        threshold: thresholds.healingPerActivationWarn,
      }
      : skill.perSeenLoadoutHealing >= thresholds.healingPerSeenLoadoutWarn
        ? {
          name: 'perSeenLoadoutHealing',
          value: skill.perSeenLoadoutHealing,
          threshold: thresholds.healingPerSeenLoadoutWarn,
        }
        : null
    if (metric) {
      anomalies.push({
        type: 'skill_healing_outlier',
        severity: 'warning',
        scenarioId: result.scenarioId,
        skillId: skill.skillId,
        metric: metric.name,
        value: metric.value,
        threshold: metric.threshold,
        message: `${skill.skillId} ${metric.name} ${metric.value}`,
      })
    }
  }
  return anomalies
}

function buildTeam(seed: TacticalSkillBalanceEvalTeamSeed): TacticalTeam {
  return {
    id: seed.id,
    name: seed.name,
    members: seed.heroIds.map((heroId) => buildTacticalCombatantFromGeneralCatalog(heroId, [])),
  }
}

function withRandomEquippedSkills(team: TacticalTeam, equippedSkillPool: string[], seed: string): TacticalTeam {
  return {
    ...team,
    members: team.members.map((member, memberIndex) => ({
      ...member,
      equippedSkillIds: chooseRandomSkillIds(equippedSkillPool, 2, seed, `${member.heroId}:${memberIndex}`),
    })),
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

function recordLoadoutSkillStats(skillStats: Record<string, TacticalTeamMatrixSkillStat>, team: TacticalTeam) {
  for (const member of team.members) {
    for (const skillId of [member.innateSkillId, ...member.equippedSkillIds]) {
      const stat = ensureSkillStat(skillStats, skillId)
      stat.seenInLoadouts += 1
    }
  }
}

function recordEventSkillStats(skillStats: Record<string, TacticalTeamMatrixSkillStat>, events: TacticalSkillEvent[]) {
  for (const event of events) {
    if (event.skillId === 'normal_attack') {
      continue
    }
    const stat = ensureSkillStat(skillStats, event.skillId)
    stat.eventCount += 1
    if (event.activated) {
      stat.activatedCount += 1
    }
    stat.totalDamage += event.damage ?? 0
    stat.totalHealing += event.healing ?? 0
    stat.totalPreventedDamage += event.preventedDamage ?? 0
  }
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

function summarizeSkillStats(skillStats: Record<string, TacticalTeamMatrixSkillStat>) {
  return Object.entries(skillStats).map(([skillId, stat]) => ({
    skillId,
    seenInLoadouts: stat.seenInLoadouts,
    eventCount: stat.eventCount,
    activatedCount: stat.activatedCount,
    totalDamage: stat.totalDamage,
    totalHealing: stat.totalHealing,
    totalPreventedDamage: stat.totalPreventedDamage,
    perActivationDamage: stat.activatedCount > 0
      ? roundNumber(stat.totalDamage / stat.activatedCount, 2)
      : 0,
    perSeenLoadoutDamage: stat.seenInLoadouts > 0
      ? roundNumber(stat.totalDamage / stat.seenInLoadouts, 2)
      : 0,
    perActivationHealing: stat.activatedCount > 0
      ? roundNumber(stat.totalHealing / stat.activatedCount, 2)
      : 0,
    perSeenLoadoutHealing: stat.seenInLoadouts > 0
      ? roundNumber(stat.totalHealing / stat.seenInLoadouts, 2)
      : 0,
  }))
}

function toTeamMatrixOutcome(winner: TacticalTeamBattleOutcome): TacticalTeamMatrixOutcome {
  if (winner === 'teamA') return 'win'
  if (winner === 'teamB') return 'loss'
  return 'draw'
}

function cloneTeamSeed(seed: TacticalSkillBalanceEvalTeamSeed): TacticalSkillBalanceEvalTeamSeed {
  return {
    id: seed.id,
    name: seed.name,
    heroIds: [...seed.heroIds],
  }
}

function resolveDeterministicIndex(seed: string, key: string, length: number) {
  if (length <= 0) {
    return 0
  }
  let hash = 2166136261
  const input = `${seed}:${key}`
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % length
}

function roundNumber(value: number, decimals: number) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
