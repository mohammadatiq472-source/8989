import {
  getExpectedRepresentativeInnateSkillId,
  getRepresentativeTacticalSkillFormula as getRepresentativeTacticalSkillFormulaFromCatalog,
  listRepresentativeTacticalSkillFormulas as listRepresentativeTacticalSkillFormulasFromCatalog,
} from './tacticalSkillFormulaCatalog'

export type TacticalAttribute = 'force' | 'command' | 'intelligence' | 'charisma' | 'speed'
export type TacticalSkillType = 'command' | 'active' | 'passive' | 'chase'
export type TacticalDamageKind = 'physical' | 'strategy'
export type TacticalTroopType = 'cavalry' | 'infantry' | 'archer' | 'shield' | 'mixed' | 'supply'

export type TacticalHeroStats = Record<TacticalAttribute, number>

export type TacticalCombatant = {
  heroId: string
  heroName: string
  troopType: TacticalTroopType
  stats: TacticalHeroStats
  strength: number
  mobility: number
  supply: number
  innateSkillId: string
  equippedSkillIds: string[]
}

export type TacticalSkillFormula = {
  id: string
  name: string
  slot: 'innate' | 'equipped'
  type: TacticalSkillType
  attributeModifiers?: Partial<Record<TacticalAttribute, number>>
  activationRate?: number
  damageKind?: TacticalDamageKind
  damageRate?: number
  breakDamageRate?: number
  speedBonusRate?: number
  burnRate?: number
  burnTurns?: number
  healingRate?: number
  damageReduction?: number
  evasionChargesAgainst?: TacticalSkillType[]
  controlCleanseCharges?: number
  targetSelector:
    | 'self'
    | 'ally_team'
    | 'ally_commander'
    | 'ally_lowest_1'
    | 'ally_lowest_2'
    | 'enemy_commander'
    | 'enemy_team'
    | 'enemy_random_1'
    | 'enemy_group_2'
    | 'enemy_lowest_1'
    | 'normal_attack_target'
}

export type TacticalSkillEvent = {
  round: number
  phase: 'battle_start' | 'normal_attack' | 'active_skill' | 'chase_skill' | 'burn'
  actorHeroId: string
  targetHeroId?: string
  skillId: string
  skillName: string
  skillType: TacticalSkillType | 'normal'
  activated: boolean
  activationRate?: number
  activationRoll?: number
  damageKind?: TacticalDamageKind
  damageRate?: number
  damage?: number
  healing?: number
  preventedDamage?: number
  remainingStrength?: number
  notes: string[]
}

export type TacticalDuelReport = {
  round: number
  maxRounds: number
  attacker: TacticalCombatantSnapshot
  defender: TacticalCombatantSnapshot
  events: TacticalSkillEvent[]
  totals: {
    attackerDamage: number
    defenderDamage: number
  }
  winner: 'attacker' | 'defender' | 'draw'
  outcomeReason: 'attacker_defeated' | 'defender_defeated' | 'mutual_defeat' | 'round_limit'
}

export type TacticalCombatantSnapshot = {
  heroId: string
  heroName: string
  innateSkillId: string
  equippedSkillIds: string[]
  baseStats: TacticalHeroStats
  effectiveStats: TacticalHeroStats
  strengthBefore: number
  strengthAfter: number
}

export type TacticalDuelMatrixOutcome = 'win' | 'loss' | 'draw'

export type TacticalDuelMatrixReport = {
  seedPrefix: string
  seedCount: number
  maxRounds: number
  attacker: Pick<TacticalCombatant, 'heroId' | 'heroName' | 'innateSkillId' | 'equippedSkillIds'>
  defender: Pick<TacticalCombatant, 'heroId' | 'heroName' | 'innateSkillId' | 'equippedSkillIds'>
  outcomeLabels: Record<TacticalDuelMatrixOutcome, string>
  outcomes: Record<TacticalDuelMatrixOutcome, number>
  rates: Record<TacticalDuelMatrixOutcome, number>
  averageRounds: number
  averageAttackerDamage: number
  averageDefenderDamage: number
}

export type TacticalTeam = {
  id: string
  name: string
  members: TacticalCombatant[]
}

export type TacticalTeamBattleOutcome = 'teamA' | 'teamB' | 'draw'

export type TacticalTeamBattleReport = {
  round: number
  maxRounds: number
  teamA: TacticalTeamSnapshot
  teamB: TacticalTeamSnapshot
  events: TacticalSkillEvent[]
  winner: TacticalTeamBattleOutcome
  outcomeReason:
    | 'teamA_commander_defeated'
    | 'teamB_commander_defeated'
    | 'teamA_defeated'
    | 'teamB_defeated'
    | 'mutual_commanders_defeated'
    | 'mutual_defeat'
    | 'round_limit'
  missingFormulaSkillIds: string[]
}

export type TacticalTeamSnapshot = {
  id: string
  name: string
  members: TacticalTeamMemberSnapshot[]
}

export type TacticalTeamMemberSnapshot = TacticalCombatantSnapshot & {
  position: number
  isCommander: boolean
}

export type TacticalTeamMatrixOutcome = 'win' | 'loss' | 'draw'

export type TacticalTeamMatrixSkillStat = {
  seenInLoadouts: number
  eventCount: number
  activatedCount: number
  totalDamage: number
  totalHealing: number
  totalPreventedDamage: number
}

export type TacticalTeamMatrixReport = {
  seedPrefix: string
  seedCount: number
  maxRounds: number
  loadoutMode: 'fixed' | 'random_equipped'
  randomEquippedSkillPoolSize?: number
  teamA: Pick<TacticalTeam, 'id' | 'name'> & { members: TacticalTeamMemberSnapshot[] }
  teamB: Pick<TacticalTeam, 'id' | 'name'> & { members: TacticalTeamMemberSnapshot[] }
  outcomeLabels: Record<TacticalTeamMatrixOutcome, string>
  outcomes: Record<TacticalTeamMatrixOutcome, number>
  rates: Record<TacticalTeamMatrixOutcome, number>
  averageRounds: number
  missingFormulaSkillIds: string[]
  skillStats: Record<string, TacticalTeamMatrixSkillStat>
}

type MutableCombatant = TacticalCombatant & {
  effectiveStats: TacticalHeroStats
  maxStrength: number
  currentStrength: number
  damageReduction: number
  evasionCharges: Partial<Record<TacticalSkillType, number>>
  controlCleanseCharges: number
  healingDoneBySkill: Record<string, number>
}

type MutableTeamMember = MutableCombatant & {
  teamId: string
  teamName: string
  position: number
  isCommander: boolean
  commanderProtection: number
  commanderTargetPressure: number
  commanderTargetPressureRound?: number
}

type CommanderProtectionActivationPenalty = {
  total: number
  guard: number
  focus: number
  focusLevel: number
}

const COMMANDER_PROTECTION_BASE_ACTIVATION_PENALTY = 2
const COMMANDER_PROTECTION_PER_LEVEL_ACTIVATION_PENALTY = 2
const COMMANDER_PROTECTION_MAX_ACTIVATION_PENALTY = 6
const COMMANDER_TARGET_PRESSURE_MAX_LEVEL = 2
const COMMANDER_TARGET_PRESSURE_PER_LEVEL_ACTIVATION_PENALTY = 4
const COMMANDER_TARGET_PRESSURE_MAX_ACTIVATION_PENALTY = 8
const COMMANDER_TARGET_PRESSURE_PER_LEVEL_DAMAGE_REDUCTION = 0.2
const COMMANDER_TARGET_PRESSURE_MAX_DAMAGE_REDUCTION = 0.4
const COMMANDER_TARGET_PRESSURE_ACTIVE_DAMAGE_REDUCTION_PER_LEVEL = 0.14
const COMMANDER_TARGET_PRESSURE_ACTIVE_DAMAGE_REDUCTION_MAX = 0.28
const COMMANDER_TARGET_PRESSURE_TEAM_ACTIVE_DAMAGE_REDUCTION_PER_LEVEL = 0.28
const COMMANDER_TARGET_PRESSURE_TEAM_ACTIVE_DAMAGE_REDUCTION_MAX = 0.56
const COMMANDER_TARGET_PRESSURE_NORMAL_DAMAGE_REDUCTION_PER_LEVEL = 0.12
const COMMANDER_TARGET_PRESSURE_NORMAL_DAMAGE_REDUCTION_MAX = 0.24
const COMMANDER_TARGET_PRESSURE_LOW_HP_FINISH_STRENGTH_THRESHOLD = 1_000
const COMMANDER_TARGET_PRESSURE_LOW_HP_FINISH_STRENGTH_RATIO = 0.15
const COMMANDER_TARGET_PRESSURE_LOW_HP_FINISH_TARGET_SHARE_CHANCE = 35
const COMMANDER_TARGET_PRESSURE_LOW_HP_FINISH_DAMAGE_REDUCTION = 0.15
const HEALING_SOURCE_SOFT_CAP = 3_000
const HEALING_SOURCE_SOFT_CAP_EXCESS_RATE = 0.5

export function getRepresentativeTacticalSkillFormula(skillId: string): TacticalSkillFormula | undefined {
  return getRepresentativeTacticalSkillFormulaFromCatalog(skillId)
}

export function listRepresentativeTacticalSkillFormulas(): TacticalSkillFormula[] {
  return listRepresentativeTacticalSkillFormulasFromCatalog()
}

export function validateTacticalLoadout(combatant: TacticalCombatant): string[] {
  const errors: string[] = []
  const expectedInnate = getExpectedRepresentativeInnateSkillId(combatant.heroId)

  if (!combatant.innateSkillId.startsWith('innate_')) {
    errors.push(`${combatant.heroName}: innateSkillId must use innate_ prefix`)
  }
  if (expectedInnate && combatant.innateSkillId !== expectedInnate) {
    errors.push(`${combatant.heroName}: innateSkillId must be fixed to ${expectedInnate}`)
  }
  if (combatant.equippedSkillIds.length > 2) {
    errors.push(`${combatant.heroName}: at most two equipped tactical skills are allowed`)
  }
  for (const skillId of combatant.equippedSkillIds) {
    if (skillId.startsWith('innate_')) {
      errors.push(`${combatant.heroName}: equipped tactical skill ${skillId} must not be an innate skill`)
    }
  }
  for (const skillId of [combatant.innateSkillId, ...combatant.equippedSkillIds]) {
    if (!getRepresentativeTacticalSkillFormula(skillId)) {
      errors.push(`${combatant.heroName}: unsupported representative tactical skill ${skillId}`)
    }
  }

  return errors
}

export function resolveRepresentativeTacticalDuel(params: {
  round: number
  maxRounds?: number
  damageScale?: number
  attacker: TacticalCombatant
  defender: TacticalCombatant
  seed: string
  activationRolls?: Record<string, number>
}): TacticalDuelReport {
  const loadoutErrors = [
    ...validateTacticalLoadout(params.attacker),
    ...validateTacticalLoadout(params.defender),
  ]
  if (loadoutErrors.length > 0) {
    throw new Error(`Invalid tactical loadout: ${loadoutErrors.join('; ')}`)
  }

  const attacker = toMutableCombatant(params.attacker)
  const defender = toMutableCombatant(params.defender)
  const events: TacticalSkillEvent[] = []
  const maxRounds = params.maxRounds ?? 8
  const damageScale = params.damageScale ?? 1

  applyBattleStartEffects(attacker, params.round, events)
  applyBattleStartEffects(defender, params.round, events)

  let finalRound = params.round
  for (let offset = 0; offset < maxRounds; offset += 1) {
    const currentRound = params.round + offset
    finalRound = currentRound
    const first = attacker.effectiveStats.speed >= defender.effectiveStats.speed ? attacker : defender
    const second = first === attacker ? defender : attacker

    executeCombatantAction(first, second, params.seed, currentRound, params.activationRolls ?? {}, damageScale, events)
    if (isBattleDefeated(attacker) || isBattleDefeated(defender)) {
      break
    }
    executeCombatantAction(second, first, params.seed, currentRound, params.activationRolls ?? {}, damageScale, events)
    if (isBattleDefeated(attacker) || isBattleDefeated(defender)) {
      break
    }
  }

  const attackerDamage = params.defender.strength - defender.currentStrength
  const defenderDamage = params.attacker.strength - attacker.currentStrength
  const outcome = resolveBattleOutcome(attacker, defender)

  return {
    round: finalRound,
    maxRounds,
    attacker: toSnapshot(params.attacker, attacker),
    defender: toSnapshot(params.defender, defender),
    events,
    totals: {
      attackerDamage,
      defenderDamage,
    },
    winner: outcome.winner,
    outcomeReason: outcome.outcomeReason,
  }
}

export function runRepresentativeTacticalDuelMatrix(params: {
  seedCount: number
  seedPrefix?: string
  round?: number
  maxRounds?: number
  damageScale?: number
  attacker: TacticalCombatant
  defender: TacticalCombatant
}): TacticalDuelMatrixReport {
  const seedCount = normalizeMatrixSeedCount(params.seedCount)
  const seedPrefix = params.seedPrefix ?? 'representative_tactical_duel_matrix'
  const maxRounds = params.maxRounds ?? 8
  const outcomes: Record<TacticalDuelMatrixOutcome, number> = {
    win: 0,
    loss: 0,
    draw: 0,
  }
  let roundTotal = 0
  let attackerDamageTotal = 0
  let defenderDamageTotal = 0

  for (let index = 0; index < seedCount; index += 1) {
    const report = resolveRepresentativeTacticalDuel({
      round: params.round ?? 1,
      maxRounds,
      damageScale: params.damageScale,
      seed: `${seedPrefix}:${index}`,
      attacker: params.attacker,
      defender: params.defender,
    })
    const outcome = toMatrixOutcome(report.winner)
    outcomes[outcome] += 1
    roundTotal += report.round
    attackerDamageTotal += report.totals.attackerDamage
    defenderDamageTotal += report.totals.defenderDamage
  }

  return {
    seedPrefix,
    seedCount,
    maxRounds,
    attacker: summarizeMatrixCombatant(params.attacker),
    defender: summarizeMatrixCombatant(params.defender),
    outcomeLabels: {
      win: `attacker:${params.attacker.heroName}`,
      loss: `defender:${params.defender.heroName}`,
      draw: 'draw',
    },
    outcomes,
    rates: {
      win: roundNumber(outcomes.win / seedCount, 4),
      loss: roundNumber(outcomes.loss / seedCount, 4),
      draw: roundNumber(outcomes.draw / seedCount, 4),
    },
    averageRounds: roundNumber(roundTotal / seedCount, 2),
    averageAttackerDamage: roundNumber(attackerDamageTotal / seedCount, 2),
    averageDefenderDamage: roundNumber(defenderDamageTotal / seedCount, 2),
  }
}

export function resolveRepresentativeTacticalTeamBattle(params: {
  teamA: TacticalTeam
  teamB: TacticalTeam
  seed: string
  round?: number
  maxRounds?: number
  damageScale?: number
}): TacticalTeamBattleReport {
  assertValidTeam(params.teamA, 'teamA')
  assertValidTeam(params.teamB, 'teamB')

  const teamA = toMutableTeam(params.teamA)
  const teamB = toMutableTeam(params.teamB)
  const events: TacticalSkillEvent[] = []
  const missingFormulaSkillIds = new Set<string>()
  const startRound = params.round ?? 1
  const maxRounds = params.maxRounds ?? 8
  const damageScale = params.damageScale ?? 1

  applyTeamBattleStartEffects(teamA, teamB, params.seed, startRound, events, missingFormulaSkillIds)
  applyTeamBattleStartEffects(teamB, teamA, params.seed, startRound, events, missingFormulaSkillIds)

  let finalRound = startRound
  let outcome = resolveTeamBattleOutcome(teamA, teamB, false)
  for (let offset = 0; offset < maxRounds && !outcome; offset += 1) {
    const currentRound = startRound + offset
    finalRound = currentRound
    const actionOrder = [...aliveMembers(teamA), ...aliveMembers(teamB)]
      .sort((left, right) => {
        const speedDiff = right.effectiveStats.speed - left.effectiveStats.speed
        if (speedDiff !== 0) return speedDiff
        return `${left.teamId}:${left.position}`.localeCompare(`${right.teamId}:${right.position}`)
      })

    for (const actor of actionOrder) {
      if (actor.currentStrength <= 0) {
        continue
      }
      const allies = actor.teamId === params.teamA.id ? teamA : teamB
      const enemies = actor.teamId === params.teamA.id ? teamB : teamA
      const normalTarget = chooseRandomAliveMember(
        enemies,
        params.seed,
        `${currentRound}:${actor.heroId}:normal`,
      )
      if (!normalTarget) {
        break
      }

      const normalTargetResolution = resolveCommanderTargetLowHpFinishNormalTarget(
        normalTarget,
        enemies,
        params.seed,
        `${currentRound}:${actor.heroId}:low_hp_finish_target`,
        currentRound,
      )
      executeTeamNormalAttack(
        actor,
        normalTargetResolution.target,
        enemies,
        damageScale,
        currentRound,
        events,
        normalTargetResolution.notes,
      )
      executeTeamChaseSkills(
        actor,
        normalTargetResolution.target,
        enemies,
        params.seed,
        currentRound,
        damageScale,
        events,
        missingFormulaSkillIds,
      )
      executeTeamActiveSkills(
        actor,
        allies,
        enemies,
        normalTarget,
        params.seed,
        currentRound,
        damageScale,
        events,
        missingFormulaSkillIds,
      )

      outcome = resolveTeamBattleOutcome(teamA, teamB, false)
      if (outcome) {
        break
      }
    }
  }

  const finalOutcome = outcome ?? resolveTeamBattleOutcome(teamA, teamB, true)
  if (!finalOutcome) {
    throw new Error('team battle outcome could not be resolved')
  }

  return {
    round: finalRound,
    maxRounds,
    teamA: toTeamSnapshot(params.teamA, teamA),
    teamB: toTeamSnapshot(params.teamB, teamB),
    events,
    winner: finalOutcome.winner,
    outcomeReason: finalOutcome.outcomeReason,
    missingFormulaSkillIds: [...missingFormulaSkillIds].sort(),
  }
}

export function runRepresentativeTacticalTeamMatrix(params: {
  seedCount: number
  seedPrefix?: string
  round?: number
  maxRounds?: number
  damageScale?: number
  teamA: TacticalTeam
  teamB: TacticalTeam
  randomizeEquippedSkillSlots?: boolean
  equippedSkillPool?: string[]
  equippedSkillSlotsPerMember?: number
}): TacticalTeamMatrixReport {
  const seedCount = normalizeMatrixSeedCount(params.seedCount)
  const seedPrefix = params.seedPrefix ?? 'representative_tactical_team_matrix'
  const maxRounds = params.maxRounds ?? 8
  const randomizeEquipped = params.randomizeEquippedSkillSlots ?? false
  const equippedSkillSlotsPerMember = params.equippedSkillSlotsPerMember ?? 2
  const outcomes: Record<TacticalTeamMatrixOutcome, number> = {
    win: 0,
    loss: 0,
    draw: 0,
  }
  const missingFormulaSkillIds = new Set<string>()
  const skillStats: Record<string, TacticalTeamMatrixSkillStat> = {}
  let roundTotal = 0
  let firstReport: TacticalTeamBattleReport | null = null

  if (randomizeEquipped && (!params.equippedSkillPool || params.equippedSkillPool.length === 0)) {
    throw new Error('team matrix random loadout requires a non-empty equippedSkillPool')
  }

  for (let index = 0; index < seedCount; index += 1) {
    const seed = `${seedPrefix}:${index}`
    const teamA = randomizeEquipped
      ? withRandomEquippedSkills(params.teamA, params.equippedSkillPool ?? [], equippedSkillSlotsPerMember, `${seed}:teamA`)
      : params.teamA
    const teamB = randomizeEquipped
      ? withRandomEquippedSkills(params.teamB, params.equippedSkillPool ?? [], equippedSkillSlotsPerMember, `${seed}:teamB`)
      : params.teamB

    recordLoadoutSkillStats(skillStats, teamA)
    recordLoadoutSkillStats(skillStats, teamB)

    const report = resolveRepresentativeTacticalTeamBattle({
      teamA,
      teamB,
      seed,
      round: params.round ?? 1,
      maxRounds,
      damageScale: params.damageScale,
    })
    firstReport ??= report
    outcomes[toTeamMatrixOutcome(report.winner)] += 1
    roundTotal += report.round
    for (const skillId of report.missingFormulaSkillIds) {
      missingFormulaSkillIds.add(skillId)
    }
    recordEventSkillStats(skillStats, report.events)
  }

  const teamASnapshot = firstReport?.teamA ?? toTeamSnapshot(params.teamA, toMutableTeam(params.teamA))
  const teamBSnapshot = firstReport?.teamB ?? toTeamSnapshot(params.teamB, toMutableTeam(params.teamB))

  return {
    seedPrefix,
    seedCount,
    maxRounds,
    loadoutMode: randomizeEquipped ? 'random_equipped' : 'fixed',
    randomEquippedSkillPoolSize: randomizeEquipped ? params.equippedSkillPool?.length ?? 0 : undefined,
    teamA: {
      id: params.teamA.id,
      name: params.teamA.name,
      members: teamASnapshot.members,
    },
    teamB: {
      id: params.teamB.id,
      name: params.teamB.name,
      members: teamBSnapshot.members,
    },
    outcomeLabels: {
      win: `teamA:${params.teamA.name}`,
      loss: `teamB:${params.teamB.name}`,
      draw: 'draw',
    },
    outcomes,
    rates: {
      win: roundNumber(outcomes.win / seedCount, 4),
      loss: roundNumber(outcomes.loss / seedCount, 4),
      draw: roundNumber(outcomes.draw / seedCount, 4),
    },
    averageRounds: roundNumber(roundTotal / seedCount, 2),
    missingFormulaSkillIds: [...missingFormulaSkillIds].sort(),
    skillStats,
  }
}

function normalizeMatrixSeedCount(seedCount: number) {
  if (!Number.isInteger(seedCount) || seedCount <= 0) {
    throw new Error('duel matrix seedCount must be a positive integer')
  }
  return seedCount
}

function toMatrixOutcome(winner: TacticalDuelReport['winner']): TacticalDuelMatrixOutcome {
  if (winner === 'attacker') {
    return 'win'
  }
  if (winner === 'defender') {
    return 'loss'
  }
  return 'draw'
}

function summarizeMatrixCombatant(
  combatant: TacticalCombatant,
): Pick<TacticalCombatant, 'heroId' | 'heroName' | 'innateSkillId' | 'equippedSkillIds'> {
  return {
    heroId: combatant.heroId,
    heroName: combatant.heroName,
    innateSkillId: combatant.innateSkillId,
    equippedSkillIds: [...combatant.equippedSkillIds],
  }
}

function assertValidTeam(team: TacticalTeam, label: string) {
  if (team.members.length !== 3) {
    throw new Error(`${label} must contain exactly 3 combatants`)
  }
  for (const member of team.members) {
    if (!member.innateSkillId.startsWith('innate_')) {
      throw new Error(`${label}:${member.heroName} innateSkillId must use innate_ prefix`)
    }
    if (member.equippedSkillIds.length > 2) {
      throw new Error(`${label}:${member.heroName} can equip at most two general skills`)
    }
  }
}

function toMutableTeam(team: TacticalTeam): MutableTeamMember[] {
  return team.members.map((member, index) => ({
    ...toMutableCombatant(member),
    teamId: team.id,
    teamName: team.name,
    position: index,
    isCommander: index === 0,
    commanderProtection: 0,
    commanderTargetPressure: 0,
  }))
}

function aliveMembers(team: MutableTeamMember[]) {
  return team.filter((member) => member.currentStrength > 0)
}

function getTeamMemberSkillFormulas(
  member: TacticalCombatant,
  missingFormulaSkillIds: Set<string>,
): TacticalSkillFormula[] {
  const formulas: TacticalSkillFormula[] = []
  for (const skillId of [member.innateSkillId, ...member.equippedSkillIds]) {
    const formula = getRepresentativeTacticalSkillFormula(skillId)
    if (formula) {
      formulas.push(formula)
    } else {
      missingFormulaSkillIds.add(skillId)
    }
  }
  return formulas
}

function applyTeamBattleStartEffects(
  team: MutableTeamMember[],
  enemies: MutableTeamMember[],
  seed: string,
  round: number,
  events: TacticalSkillEvent[],
  missingFormulaSkillIds: Set<string>,
) {
  for (const actor of team) {
    for (const formula of getTeamMemberSkillFormulas(actor, missingFormulaSkillIds)) {
      if (formula.type !== 'command' && formula.type !== 'passive') {
        continue
      }
      const targets = selectTeamStartTargets(actor, team, enemies, formula, seed, round)
      for (const target of targets) {
        applyTeamBattleStartFormula(actor, target, formula, round, events)
      }
    }
  }
}

function applyTeamBattleStartFormula(
  actor: MutableTeamMember,
  target: MutableTeamMember,
  formula: TacticalSkillFormula,
  round: number,
  events: TacticalSkillEvent[],
) {
  const notes: string[] = [`target=${formula.targetSelector}`]
  if (formula.attributeModifiers) {
    for (const [rawAttribute, modifier] of Object.entries(formula.attributeModifiers)) {
      const attribute = rawAttribute as TacticalAttribute
      target.effectiveStats[attribute] = roundNumber(target.effectiveStats[attribute] * (1 + modifier), 2)
      notes.push(`${attribute}+${Math.round(modifier * 100)}%`)
    }
  }
  if (formula.damageReduction) {
    target.damageReduction += formula.damageReduction
    notes.push(`damageReduction+${Math.round(formula.damageReduction * 100)}%`)
  }
  if (formula.evasionChargesAgainst) {
    for (const skillType of formula.evasionChargesAgainst) {
      target.evasionCharges[skillType] = (target.evasionCharges[skillType] ?? 0) + 1
    }
    notes.push(`evasion:${formula.evasionChargesAgainst.join('/')}`)
  }
  if (formula.controlCleanseCharges) {
    target.controlCleanseCharges += formula.controlCleanseCharges
    notes.push(`controlCleanse+${formula.controlCleanseCharges}`)
  }
  const commanderProtectionGain = resolveCommanderProtectionGain(target, formula)
  if (commanderProtectionGain > 0) {
    target.commanderProtection += commanderProtectionGain
    notes.push(`commanderProtection+${commanderProtectionGain}`)
  }
  let healing = 0
  if (formula.healingRate) {
    notes.push(`healingRate=${formula.healingRate}`)
    healing = applyHealing(target, calculateEffectiveHealing(actor, formula.id, formula.healingRate, 1, notes))
    recordHealingSource(actor, formula.id, healing)
  }
  if (notes.length > 1) {
    events.push({
      round,
      phase: 'battle_start',
      actorHeroId: actor.heroId,
      targetHeroId: target.heroId,
      skillId: formula.id,
      skillName: formula.name,
      skillType: formula.type,
      activated: true,
      healing,
      remainingStrength: target.currentStrength,
      notes,
    })
  }
}

function executeTeamNormalAttack(
  actor: MutableTeamMember,
  target: MutableTeamMember,
  targetAllies: MutableTeamMember[],
  damageScale: number,
  round: number,
  events: TacticalSkillEvent[],
  extraNotes: string[] = [],
) {
  const notes = ['3v3 random normal target', ...extraNotes]
  const normalDamage = calculateDamage(actor, target, 'physical', 1, damageScale)
  const commanderTargetNormalDamageReduction = resolveCommanderTargetNormalDamageReduction(target, round)
  const incomingDamage = applyCommanderTargetNormalDamageReduction(
    normalDamage,
    commanderTargetNormalDamageReduction,
    notes,
  )
  const finishProtectedDamage = applyCommanderTargetLowHpFinishDamageReduction(
    incomingDamage,
    resolveCommanderTargetLowHpFinishDamageReduction(target, targetAllies, round),
    notes,
  )
  const normalResult = applyIncomingDamage(target, 'normal', finishProtectedDamage)
  events.push({
    round,
    phase: 'normal_attack',
    actorHeroId: actor.heroId,
    targetHeroId: target.heroId,
    skillId: 'normal_attack',
    skillName: '普通攻击',
    skillType: 'normal',
    activated: true,
    damageKind: 'physical',
    damageRate: 1,
    damage: normalResult.damage,
    preventedDamage: normalResult.preventedDamage,
    remainingStrength: target.currentStrength,
    notes,
  })
}

function executeTeamChaseSkills(
  actor: MutableTeamMember,
  normalTarget: MutableTeamMember,
  targetAllies: MutableTeamMember[],
  seed: string,
  round: number,
  damageScale: number,
  events: TacticalSkillEvent[],
  missingFormulaSkillIds: Set<string>,
) {
  if (normalTarget.currentStrength <= 0) return
  for (const formula of getTeamMemberSkillFormulas(actor, missingFormulaSkillIds)) {
    if (normalTarget.currentStrength <= 0) return
    if (formula.type === 'chase') {
      executeTeamTriggeredSkill(actor, [normalTarget], formula, seed, round, damageScale, events, targetAllies)
    }
  }
}

function executeTeamActiveSkills(
  actor: MutableTeamMember,
  allies: MutableTeamMember[],
  enemies: MutableTeamMember[],
  normalTarget: MutableTeamMember,
  seed: string,
  round: number,
  damageScale: number,
  events: TacticalSkillEvent[],
  missingFormulaSkillIds: Set<string>,
) {
  for (const formula of getTeamMemberSkillFormulas(actor, missingFormulaSkillIds)) {
    if (formula.type !== 'active') {
      continue
    }
    const targets = selectTeamSkillTargets(actor, allies, enemies, normalTarget, formula, seed, round)
    executeTeamTriggeredSkill(actor, targets, formula, seed, round, damageScale, events)
  }
}

function executeTeamTriggeredSkill(
  actor: MutableTeamMember,
  targets: MutableTeamMember[],
  formula: TacticalSkillFormula,
  seed: string,
  round: number,
  damageScale: number,
  events: TacticalSkillEvent[],
  targetAllies?: MutableTeamMember[],
) {
  const liveTargets = targets.filter((target) => target.currentStrength > 0)
  const baseActivationRate = formula.activationRate ?? 100
  const commanderProtectionPenalty = resolveCommanderProtectionActivationPenalty(formula, liveTargets, round)
  const activationRate = Math.max(1, baseActivationRate - commanderProtectionPenalty.total)
  const activationRoll = resolveActivationRoll(seed, actor.heroId, formula.id, round, {})
  const activated = activationRoll <= activationRate
  const phase = formula.type === 'chase' ? 'chase_skill' : 'active_skill'
  if (liveTargets.length === 0) {
    return
  }

  if (!activated) {
    const notes = buildTeamSkillNotes(formula, commanderProtectionPenalty, baseActivationRate)
    const target = liveTargets[0]
    if (target) {
      applyCommanderTargetPressure(target, formula, round, notes)
    }
    events.push({
      round,
      phase,
      actorHeroId: actor.heroId,
      targetHeroId: liveTargets.length === 1 ? liveTargets[0].heroId : undefined,
      skillId: formula.id,
      skillName: formula.name,
      skillType: formula.type,
      activated,
      activationRate,
      activationRoll,
      notes,
    })
    return
  }

  if (formula.healingRate) {
    for (const target of liveTargets) {
      const notes = [`target=${formula.targetSelector}`]
      if (formula.controlCleanseCharges) {
        target.controlCleanseCharges += formula.controlCleanseCharges
        notes.push(`controlCleanse+${formula.controlCleanseCharges}`)
      }
      const healing = applyHealing(
        target,
        calculateEffectiveHealing(actor, formula.id, formula.healingRate, damageScale, notes),
      )
      recordHealingSource(actor, formula.id, healing)
      events.push({
        round,
        phase,
        actorHeroId: actor.heroId,
        targetHeroId: target.heroId,
        skillId: formula.id,
        skillName: formula.name,
        skillType: formula.type,
        activated: true,
        activationRate,
        activationRoll,
        healing,
        remainingStrength: target.currentStrength,
        notes,
      })
    }
    if (!formula.damageKind || !formula.damageRate) {
      return
    }
  }

  if (formula.controlCleanseCharges && (!formula.damageKind || !formula.damageRate)) {
    for (const target of liveTargets) {
      target.controlCleanseCharges += formula.controlCleanseCharges
      events.push({
        round,
        phase,
        actorHeroId: actor.heroId,
        targetHeroId: target.heroId,
        skillId: formula.id,
        skillName: formula.name,
        skillType: formula.type,
        activated: true,
        activationRate,
        activationRoll,
        remainingStrength: target.currentStrength,
        notes: [`target=${formula.targetSelector}`, `controlCleanse+${formula.controlCleanseCharges}`],
      })
    }
    return
  }

  if (!formula.damageKind || !formula.damageRate) {
    events.push({
      round,
      phase,
      actorHeroId: actor.heroId,
      skillId: formula.id,
      skillName: formula.name,
      skillType: formula.type,
      activated: true,
      activationRate,
      activationRoll,
      notes: buildTeamSkillNotes(formula, commanderProtectionPenalty, baseActivationRate),
    })
    return
  }

  for (const target of liveTargets) {
    if (target.currentStrength <= 0) {
      continue
    }
    const notes = buildTeamSkillNotes(formula, commanderProtectionPenalty, baseActivationRate)
    const damageRate = resolveDamageRate(actor, target, formula)
    const rawDamage = calculateDamage(actor, target, formula.damageKind, damageRate, damageScale)
    const commanderTargetDamageReduction = resolveCommanderTargetDamageReduction(formula, target, round)
    const incomingDamage = applyCommanderTargetDamageReduction(rawDamage, commanderTargetDamageReduction, notes)
    const finishProtectedDamage = formula.type === 'chase' && targetAllies
      ? applyCommanderTargetLowHpFinishDamageReduction(
        incomingDamage,
        resolveCommanderTargetLowHpFinishDamageReduction(target, targetAllies, round),
        notes,
      )
      : incomingDamage
    const result = applyIncomingDamage(target, formula.type, finishProtectedDamage)
    if (result.preventedDamage > 0) {
      notes.push('damage prevented by evasion charge')
    }
    applyCommanderTargetPressure(target, formula, round, notes)
    events.push({
      round,
      phase,
      actorHeroId: actor.heroId,
      targetHeroId: target.heroId,
      skillId: formula.id,
      skillName: formula.name,
      skillType: formula.type,
      activated: true,
      activationRate,
      activationRoll,
      damageKind: formula.damageKind,
      damageRate,
      damage: result.damage,
      preventedDamage: result.preventedDamage,
      remainingStrength: target.currentStrength,
      notes,
    })

    if (formula.burnRate && formula.burnTurns && result.damage > 0 && target.currentStrength > 0) {
      const burnNotes = [`burnTurns=${formula.burnTurns}`]
      const burnDamage = calculateDamage(actor, target, 'strategy', formula.burnRate, damageScale) * formula.burnTurns
      const commanderTargetBurnReduction = resolveCommanderTargetDamageReduction(formula, target, round)
      const incomingBurnDamage = applyCommanderTargetDamageReduction(burnDamage, commanderTargetBurnReduction, burnNotes)
      const burnResult = applyIncomingDamage(target, 'active', incomingBurnDamage)
      events.push({
        round,
        phase: 'burn',
        actorHeroId: actor.heroId,
        targetHeroId: target.heroId,
        skillId: formula.id,
        skillName: `${formula.name}-燃烧`,
        skillType: formula.type,
        activated: true,
        damageKind: 'strategy',
        damageRate: formula.burnRate,
        damage: burnResult.damage,
        preventedDamage: burnResult.preventedDamage,
        remainingStrength: target.currentStrength,
        notes: burnNotes,
      })
    }
  }
}

function resolveCommanderProtectionGain(target: MutableTeamMember, formula: TacticalSkillFormula) {
  if (!target.isCommander || !formula.damageReduction) {
    return 0
  }
  if (formula.targetSelector === 'ally_commander') {
    return 2
  }
  if (formula.targetSelector === 'ally_team') {
    return 1
  }
  return 0
}

function resolveCommanderProtectionActivationPenalty(
  formula: TacticalSkillFormula,
  targets: MutableTeamMember[],
  round: number,
): CommanderProtectionActivationPenalty {
  const emptyPenalty = {
    total: 0,
    guard: 0,
    focus: 0,
    focusLevel: 0,
  }
  if (formula.type !== 'active' || formula.targetSelector !== 'enemy_commander') {
    return emptyPenalty
  }
  const protectedCommander = targets.find((target) => target.isCommander)
  if (!protectedCommander) {
    return emptyPenalty
  }
  const guard = protectedCommander.commanderProtection > 0
    ? Math.min(
      COMMANDER_PROTECTION_MAX_ACTIVATION_PENALTY,
      COMMANDER_PROTECTION_BASE_ACTIVATION_PENALTY
        + protectedCommander.commanderProtection * COMMANDER_PROTECTION_PER_LEVEL_ACTIVATION_PENALTY,
    )
    : 0
  const focusLevel = resolveActiveCommanderTargetPressure(protectedCommander, round)
  const focus = Math.min(
    COMMANDER_TARGET_PRESSURE_MAX_ACTIVATION_PENALTY,
    focusLevel * COMMANDER_TARGET_PRESSURE_PER_LEVEL_ACTIVATION_PENALTY,
  )
  if (guard === 0 && focus === 0) {
    return emptyPenalty
  }
  return {
    total: guard + focus,
    guard,
    focus,
    focusLevel,
  }
}

function resolveActiveCommanderTargetPressure(target: MutableTeamMember, round: number) {
  if (!target.commanderTargetPressureRound || target.commanderTargetPressure <= 0) {
    return 0
  }
  const elapsedRounds = Math.max(0, round - target.commanderTargetPressureRound)
  const decay = Math.max(0, elapsedRounds - 1)
  return Math.max(0, target.commanderTargetPressure - decay)
}

function applyCommanderTargetPressure(
  target: MutableTeamMember,
  formula: TacticalSkillFormula,
  round: number,
  notes: string[],
) {
  if (!target.isCommander || formula.type !== 'active' || formula.targetSelector !== 'enemy_commander') {
    return
  }
  const currentLevel = resolveActiveCommanderTargetPressure(target, round)
  const nextLevel = Math.min(COMMANDER_TARGET_PRESSURE_MAX_LEVEL, currentLevel + 1)
  target.commanderTargetPressure = nextLevel
  target.commanderTargetPressureRound = round
  notes.push(`commanderTargetPressure=${nextLevel}`)
}

function resolveCommanderTargetDamageReduction(
  formula: TacticalSkillFormula,
  target: MutableTeamMember,
  round: number,
) {
  if (!target.isCommander || formula.type !== 'active') {
    return {
      level: 0,
      reduction: 0,
      scope: 'none' as const,
    }
  }
  const level = resolveActiveCommanderTargetPressure(target, round)
  if (level <= 0) {
    return {
      level: 0,
      reduction: 0,
      scope: 'none' as const,
    }
  }
  const activeReduction = Math.min(
    COMMANDER_TARGET_PRESSURE_ACTIVE_DAMAGE_REDUCTION_MAX,
    level * COMMANDER_TARGET_PRESSURE_ACTIVE_DAMAGE_REDUCTION_PER_LEVEL,
  )
  if (formula.targetSelector !== 'enemy_commander') {
    const teamActiveReduction = formula.targetSelector === 'enemy_team'
      ? Math.min(
        COMMANDER_TARGET_PRESSURE_TEAM_ACTIVE_DAMAGE_REDUCTION_MAX,
        level * COMMANDER_TARGET_PRESSURE_TEAM_ACTIVE_DAMAGE_REDUCTION_PER_LEVEL,
      )
      : 0
    const reduction = 1 - (1 - activeReduction) * (1 - teamActiveReduction)
    return {
      level,
      reduction,
      scope: teamActiveReduction > 0 ? 'team_active' as const : 'active' as const,
    }
  }
  const commanderTargetReduction = Math.min(
    COMMANDER_TARGET_PRESSURE_MAX_DAMAGE_REDUCTION,
    level * COMMANDER_TARGET_PRESSURE_PER_LEVEL_DAMAGE_REDUCTION,
  )
  const reduction = 1 - (1 - activeReduction) * (1 - commanderTargetReduction)
  return {
    level,
    reduction,
    scope: 'commander_target' as const,
  }
}

function applyCommanderTargetDamageReduction(
  rawDamage: number,
  commanderTargetDamageReduction: {
    level: number
    reduction: number
    scope: 'none' | 'active' | 'team_active' | 'commander_target'
  },
  notes: string[],
) {
  if (commanderTargetDamageReduction.reduction <= 0) {
    return rawDamage
  }
  if (commanderTargetDamageReduction.scope === 'team_active') {
    notes.push(`commanderTargetPressureTeamActiveDamageReduction-${Math.round(commanderTargetDamageReduction.reduction * 100)}%`)
    notes.push(`commanderTargetPressureTeamActiveDamageLevel=${commanderTargetDamageReduction.level}`)
  } else if (commanderTargetDamageReduction.scope === 'active') {
    notes.push(`commanderTargetPressureActiveDamageReduction-${Math.round(commanderTargetDamageReduction.reduction * 100)}%`)
    notes.push(`commanderTargetPressureActiveDamageLevel=${commanderTargetDamageReduction.level}`)
  } else {
    notes.push(`commanderTargetDamageReduction-${Math.round(commanderTargetDamageReduction.reduction * 100)}%`)
    notes.push(`commanderTargetDamagePressureLevel=${commanderTargetDamageReduction.level}`)
  }
  return Math.max(1, Math.round(rawDamage * (1 - commanderTargetDamageReduction.reduction)))
}

function resolveCommanderTargetNormalDamageReduction(target: MutableTeamMember, round: number) {
  if (!target.isCommander) {
    return {
      level: 0,
      reduction: 0,
    }
  }
  const level = resolveActiveCommanderTargetPressure(target, round)
  if (level <= 0) {
    return {
      level: 0,
      reduction: 0,
    }
  }
  return {
    level,
    reduction: Math.min(
      COMMANDER_TARGET_PRESSURE_NORMAL_DAMAGE_REDUCTION_MAX,
      level * COMMANDER_TARGET_PRESSURE_NORMAL_DAMAGE_REDUCTION_PER_LEVEL,
    ),
  }
}

function applyCommanderTargetNormalDamageReduction(
  rawDamage: number,
  commanderTargetNormalDamageReduction: { level: number; reduction: number },
  notes: string[],
) {
  if (commanderTargetNormalDamageReduction.reduction <= 0) {
    return rawDamage
  }
  notes.push(`commanderTargetPressureNormalDamageReduction-${Math.round(
    commanderTargetNormalDamageReduction.reduction * 100,
  )}%`)
  notes.push(`commanderTargetPressureNormalDamageLevel=${commanderTargetNormalDamageReduction.level}`)
  return Math.max(1, Math.round(rawDamage * (1 - commanderTargetNormalDamageReduction.reduction)))
}

function resolveCommanderTargetLowHpFinishNormalTarget(
  target: MutableTeamMember,
  targetAllies: MutableTeamMember[],
  seed: string,
  key: string,
  round: number,
) {
  const lowHpFinishProtection = resolveCommanderTargetLowHpFinishDamageReduction(target, targetAllies, round)
  if (lowHpFinishProtection.reduction <= 0) {
    return {
      target,
      notes: [] as string[],
    }
  }
  if (target.currentStrength > COMMANDER_TARGET_PRESSURE_LOW_HP_FINISH_STRENGTH_THRESHOLD) {
    return {
      target,
      notes: [] as string[],
    }
  }
  const targetDeputies = targetAllies.filter((member) => (
    member.heroId !== target.heroId
      && !member.isCommander
      && member.currentStrength > 0
  ))
  if (targetDeputies.length === 0) {
    return {
      target,
      notes: [] as string[],
    }
  }
  const shareRoll = resolveDeterministicIndex(seed, `${key}:share`, 100) + 1
  if (shareRoll > COMMANDER_TARGET_PRESSURE_LOW_HP_FINISH_TARGET_SHARE_CHANCE) {
    return {
      target,
      notes: [] as string[],
    }
  }
  const sharedTarget = targetDeputies[resolveDeterministicIndex(seed, `${key}:target`, targetDeputies.length)]
  return {
    target: sharedTarget,
    notes: [
      `commanderTargetPressureLowHpTargetShareFrom=${target.heroId}`,
      `commanderTargetPressureLowHpTargetShareChance=${COMMANDER_TARGET_PRESSURE_LOW_HP_FINISH_TARGET_SHARE_CHANCE}%`,
      `commanderTargetPressureLowHpTargetShareRoll=${shareRoll}`,
      `commanderTargetPressureLowHpFinishThreshold=${lowHpFinishProtection.threshold}`,
    ],
  }
}

function resolveCommanderTargetLowHpFinishDamageReduction(
  target: MutableTeamMember,
  targetAllies: MutableTeamMember[],
  round: number,
) {
  if (!target.isCommander) {
    return {
      level: 0,
      reduction: 0,
      threshold: 0,
    }
  }
  const level = resolveActiveCommanderTargetPressure(target, round)
  if (level <= 0) {
    return {
      level: 0,
      reduction: 0,
      threshold: 0,
    }
  }
  const hasAliveDeputy = targetAllies.some((member) => (
    member.heroId !== target.heroId
      && !member.isCommander
      && member.currentStrength > 0
  ))
  if (!hasAliveDeputy) {
    return {
      level: 0,
      reduction: 0,
      threshold: 0,
    }
  }
  const threshold = Math.max(
    COMMANDER_TARGET_PRESSURE_LOW_HP_FINISH_STRENGTH_THRESHOLD,
    Math.round(target.maxStrength * COMMANDER_TARGET_PRESSURE_LOW_HP_FINISH_STRENGTH_RATIO),
  )
  if (target.currentStrength > threshold) {
    return {
      level: 0,
      reduction: 0,
      threshold,
    }
  }
  return {
    level,
    reduction: COMMANDER_TARGET_PRESSURE_LOW_HP_FINISH_DAMAGE_REDUCTION,
    threshold,
  }
}

function applyCommanderTargetLowHpFinishDamageReduction(
  rawDamage: number,
  commanderTargetLowHpFinishDamageReduction: { level: number; reduction: number; threshold: number },
  notes: string[],
) {
  if (commanderTargetLowHpFinishDamageReduction.reduction <= 0) {
    return rawDamage
  }
  notes.push(`commanderTargetPressureLowHpFinishDamageReduction-${Math.round(
    commanderTargetLowHpFinishDamageReduction.reduction * 100,
  )}%`)
  notes.push(`commanderTargetPressureLowHpFinishLevel=${commanderTargetLowHpFinishDamageReduction.level}`)
  notes.push(`commanderTargetPressureLowHpFinishThreshold=${commanderTargetLowHpFinishDamageReduction.threshold}`)
  return Math.max(1, Math.round(rawDamage * (1 - commanderTargetLowHpFinishDamageReduction.reduction)))
}

function buildTeamSkillNotes(
  formula: TacticalSkillFormula,
  commanderProtectionPenalty: CommanderProtectionActivationPenalty,
  baseActivationRate: number,
) {
  const notes = [`target=${formula.targetSelector}`]
  if (commanderProtectionPenalty.total > 0) {
    notes.push(`commanderProtectionActivationPenalty-${commanderProtectionPenalty.total}%`)
    if (commanderProtectionPenalty.guard > 0) {
      notes.push(`commanderGuardPenalty-${commanderProtectionPenalty.guard}%`)
    }
    if (commanderProtectionPenalty.focus > 0) {
      notes.push(`commanderTargetPressurePenalty-${commanderProtectionPenalty.focus}%`)
      notes.push(`commanderTargetPressureLevel=${commanderProtectionPenalty.focusLevel}`)
    }
    notes.push(`baseActivationRate=${baseActivationRate}`)
  }
  return notes
}

function selectTeamSkillTargets(
  actor: MutableTeamMember,
  allies: MutableTeamMember[],
  enemies: MutableTeamMember[],
  normalTarget: MutableTeamMember,
  formula: TacticalSkillFormula,
  seed: string,
  round: number,
) {
  switch (formula.targetSelector) {
    case 'self':
      return [actor]
    case 'ally_team':
      return aliveMembers(allies)
    case 'ally_commander': {
      const commander = allies[0]
      if (commander?.currentStrength > 0) {
        return [commander]
      }
      return chooseRandomAliveMembers(allies, 1, seed, `${round}:${actor.heroId}:${formula.id}:ally_commander_fallback`)
    }
    case 'ally_lowest_1':
      return chooseLowestStrengthAliveMembers(allies, 1)
    case 'ally_lowest_2':
      return chooseLowestStrengthAliveMembers(allies, 2)
    case 'enemy_commander': {
      const commander = enemies[0]
      if (commander?.currentStrength > 0) {
        return [commander]
      }
      return chooseRandomAliveMembers(enemies, 1, seed, `${round}:${actor.heroId}:${formula.id}:commander_fallback`)
    }
    case 'enemy_team':
      return aliveMembers(enemies)
    case 'enemy_random_1':
      return chooseRandomAliveMembers(enemies, 1, seed, `${round}:${actor.heroId}:${formula.id}:single`)
    case 'enemy_group_2':
      return chooseRandomAliveMembers(enemies, 2, seed, `${round}:${actor.heroId}:${formula.id}:group`)
    case 'enemy_lowest_1':
      return chooseLowestStrengthAliveMembers(enemies, 1)
    case 'normal_attack_target':
      return normalTarget.currentStrength > 0
        ? [normalTarget]
        : chooseRandomAliveMembers(enemies, 1, seed, `${round}:${actor.heroId}:${formula.id}:normal_fallback`)
  }
}

function selectTeamStartTargets(
  actor: MutableTeamMember,
  allies: MutableTeamMember[],
  enemies: MutableTeamMember[],
  formula: TacticalSkillFormula,
  seed: string,
  round: number,
) {
  switch (formula.targetSelector) {
    case 'self':
      return [actor]
    case 'ally_team':
      return aliveMembers(allies)
    case 'ally_commander': {
      const commander = allies[0]
      return commander?.currentStrength > 0 ? [commander] : []
    }
    case 'ally_lowest_1':
      return chooseLowestStrengthAliveMembers(allies, 1)
    case 'ally_lowest_2':
      return chooseLowestStrengthAliveMembers(allies, 2)
    case 'enemy_commander': {
      const commander = enemies[0]
      return commander?.currentStrength > 0 ? [commander] : []
    }
    case 'enemy_team':
      return aliveMembers(enemies)
    case 'enemy_random_1':
      return chooseRandomAliveMembers(enemies, 1, seed, `${round}:${actor.heroId}:${formula.id}:start_single`)
    case 'enemy_group_2':
      return chooseRandomAliveMembers(enemies, 2, seed, `${round}:${actor.heroId}:${formula.id}:start_group`)
    case 'enemy_lowest_1':
      return chooseLowestStrengthAliveMembers(enemies, 1)
    case 'normal_attack_target':
      return chooseRandomAliveMembers(enemies, 1, seed, `${round}:${actor.heroId}:${formula.id}:start_normal`)
  }
}

function chooseRandomAliveMember(
  candidates: MutableTeamMember[],
  seed: string,
  key: string,
): MutableTeamMember | null {
  return chooseRandomAliveMembers(candidates, 1, seed, key)[0] ?? null
}

function chooseRandomAliveMembers(
  candidates: MutableTeamMember[],
  count: number,
  seed: string,
  key: string,
) {
  const pool = aliveMembers(candidates)
  const selected: MutableTeamMember[] = []
  for (let index = 0; index < count && pool.length > 0; index += 1) {
    const selectedIndex = resolveDeterministicIndex(seed, `${key}:${index}`, pool.length)
    selected.push(pool.splice(selectedIndex, 1)[0])
  }
  return selected
}

function chooseLowestStrengthAliveMembers(candidates: MutableTeamMember[], count: number) {
  return aliveMembers(candidates)
    .sort((left, right) => {
      const strengthDiff = left.currentStrength - right.currentStrength
      if (strengthDiff !== 0) return strengthDiff
      return `${left.teamId}:${left.position}`.localeCompare(`${right.teamId}:${right.position}`)
    })
    .slice(0, count)
}

function resolveTeamBattleOutcome(
  teamA: MutableTeamMember[],
  teamB: MutableTeamMember[],
  forceRoundLimit: boolean,
): Pick<TacticalTeamBattleReport, 'winner' | 'outcomeReason'> | null {
  const teamACommanderDefeated = teamA[0]?.currentStrength <= 0
  const teamBCommanderDefeated = teamB[0]?.currentStrength <= 0
  const teamADefeated = aliveMembers(teamA).length === 0
  const teamBDefeated = aliveMembers(teamB).length === 0
  if (teamACommanderDefeated && teamBCommanderDefeated) {
    return { winner: 'draw', outcomeReason: 'mutual_commanders_defeated' }
  }
  if (teamADefeated && teamBDefeated) {
    return { winner: 'draw', outcomeReason: 'mutual_defeat' }
  }
  if (teamACommanderDefeated) {
    return { winner: 'teamB', outcomeReason: 'teamA_commander_defeated' }
  }
  if (teamBCommanderDefeated) {
    return { winner: 'teamA', outcomeReason: 'teamB_commander_defeated' }
  }
  if (teamADefeated) {
    return { winner: 'teamB', outcomeReason: 'teamA_defeated' }
  }
  if (teamBDefeated) {
    return { winner: 'teamA', outcomeReason: 'teamB_defeated' }
  }
  return forceRoundLimit ? { winner: 'draw', outcomeReason: 'round_limit' } : null
}

function toTeamMatrixOutcome(winner: TacticalTeamBattleOutcome): TacticalTeamMatrixOutcome {
  if (winner === 'teamA') return 'win'
  if (winner === 'teamB') return 'loss'
  return 'draw'
}

function toTeamSnapshot(source: TacticalTeam, mutableTeam: MutableTeamMember[]): TacticalTeamSnapshot {
  return {
    id: source.id,
    name: source.name,
    members: source.members.map((member, index) => ({
      ...toSnapshot(member, mutableTeam[index]),
      position: index,
      isCommander: index === 0,
    })),
  }
}

function withRandomEquippedSkills(
  team: TacticalTeam,
  equippedSkillPool: string[],
  slotCount: number,
  seed: string,
): TacticalTeam {
  return {
    ...team,
    members: team.members.map((member, memberIndex) => ({
      ...member,
      equippedSkillIds: chooseRandomSkillIds(
        equippedSkillPool,
        Math.min(2, Math.max(0, slotCount)),
        seed,
        `${member.heroId}:${memberIndex}`,
      ),
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

function toMutableCombatant(combatant: TacticalCombatant): MutableCombatant {
  return {
    ...combatant,
    equippedSkillIds: [...combatant.equippedSkillIds],
    effectiveStats: { ...combatant.stats },
    maxStrength: combatant.strength,
    currentStrength: combatant.strength,
    damageReduction: 0,
    evasionCharges: {},
    controlCleanseCharges: 0,
    healingDoneBySkill: {},
  }
}

function getCombatantSkillFormulas(combatant: TacticalCombatant): TacticalSkillFormula[] {
  return [combatant.innateSkillId, ...combatant.equippedSkillIds].map((skillId) => {
    const formula = getRepresentativeTacticalSkillFormula(skillId)
    if (!formula) {
      throw new Error(`Unsupported representative tactical skill ${skillId}`)
    }
    return formula
  })
}

function applyBattleStartEffects(combatant: MutableCombatant, round: number, events: TacticalSkillEvent[]) {
  for (const formula of getCombatantSkillFormulas(combatant)) {
    if (formula.type !== 'command' && formula.type !== 'passive') {
      continue
    }
    const notes: string[] = []
    if (formula.attributeModifiers) {
      for (const [rawAttribute, modifier] of Object.entries(formula.attributeModifiers)) {
        const attribute = rawAttribute as TacticalAttribute
        combatant.effectiveStats[attribute] = roundNumber(combatant.effectiveStats[attribute] * (1 + modifier), 2)
        notes.push(`${attribute}+${Math.round(modifier * 100)}%`)
      }
    }
    if (formula.damageReduction) {
      combatant.damageReduction += formula.damageReduction
      notes.push(`damageReduction+${Math.round(formula.damageReduction * 100)}%`)
    }
    if (formula.evasionChargesAgainst) {
      for (const skillType of formula.evasionChargesAgainst) {
        combatant.evasionCharges[skillType] = (combatant.evasionCharges[skillType] ?? 0) + 1
      }
      notes.push(`evasion:${formula.evasionChargesAgainst.join('/')}`)
    }
    if (formula.controlCleanseCharges) {
      combatant.controlCleanseCharges += formula.controlCleanseCharges
      notes.push(`controlCleanse+${formula.controlCleanseCharges}`)
    }
    if (notes.length > 0) {
      events.push({
        round,
        phase: 'battle_start',
        actorHeroId: combatant.heroId,
        skillId: formula.id,
        skillName: formula.name,
        skillType: formula.type,
        activated: true,
        notes,
      })
    }
  }
}

function executeCombatantAction(
  actor: MutableCombatant,
  target: MutableCombatant,
  seed: string,
  round: number,
  activationRolls: Record<string, number>,
  damageScale: number,
  events: TacticalSkillEvent[],
) {
  if (actor.currentStrength <= 0) return

  const normalDamage = calculateDamage(actor, target, 'physical', 1, damageScale)
  const normalResult = applyIncomingDamage(target, 'normal', normalDamage)
  events.push({
    round,
    phase: 'normal_attack',
    actorHeroId: actor.heroId,
    targetHeroId: target.heroId,
    skillId: 'normal_attack',
    skillName: '普通攻击',
    skillType: 'normal',
    activated: true,
    damageKind: 'physical',
    damageRate: 1,
    damage: normalResult.damage,
    preventedDamage: normalResult.preventedDamage,
    remainingStrength: target.currentStrength,
    notes: ['武将属性参与普通攻击结算'],
  })

  for (const formula of getCombatantSkillFormulas(actor)) {
    if (target.currentStrength <= 0) return
    if (formula.type === 'chase') {
      executeTriggeredSkill(actor, selectDuelSkillTarget(actor, target, formula), formula, seed, round, activationRolls, damageScale, events)
    }
  }

  for (const formula of getCombatantSkillFormulas(actor)) {
    if (target.currentStrength <= 0) return
    if (formula.type === 'active') {
      executeTriggeredSkill(actor, selectDuelSkillTarget(actor, target, formula), formula, seed, round, activationRolls, damageScale, events)
    }
  }
}

function selectDuelSkillTarget(
  actor: MutableCombatant,
  opponent: MutableCombatant,
  formula: TacticalSkillFormula,
) {
  switch (formula.targetSelector) {
    case 'self':
    case 'ally_team':
    case 'ally_commander':
    case 'ally_lowest_1':
    case 'ally_lowest_2':
      return actor
    case 'enemy_commander':
    case 'enemy_team':
    case 'enemy_random_1':
    case 'enemy_group_2':
    case 'enemy_lowest_1':
    case 'normal_attack_target':
      return opponent
  }
}

function executeTriggeredSkill(
  actor: MutableCombatant,
  target: MutableCombatant,
  formula: TacticalSkillFormula,
  seed: string,
  round: number,
  activationRolls: Record<string, number>,
  damageScale: number,
  events: TacticalSkillEvent[],
) {
  const activationRate = formula.activationRate ?? 100
  const activationRoll = resolveActivationRoll(seed, actor.heroId, formula.id, round, activationRolls)
  const activated = activationRoll <= activationRate
  const phase = formula.type === 'chase' ? 'chase_skill' : 'active_skill'
  const notes: string[] = [`target=${formula.targetSelector}`]

  if (!activated) {
    events.push({
      round,
      phase,
      actorHeroId: actor.heroId,
      targetHeroId: target.heroId,
      skillId: formula.id,
      skillName: formula.name,
      skillType: formula.type,
      activated,
      activationRate,
      activationRoll,
      notes,
    })
    return
  }

  if (formula.healingRate) {
    if (formula.controlCleanseCharges) {
      target.controlCleanseCharges += formula.controlCleanseCharges
      notes.push(`controlCleanse+${formula.controlCleanseCharges}`)
    }
    const healing = applyHealing(
      target,
      calculateEffectiveHealing(actor, formula.id, formula.healingRate, damageScale, notes),
    )
    recordHealingSource(actor, formula.id, healing)
    events.push({
      round,
      phase,
      actorHeroId: actor.heroId,
      targetHeroId: target.heroId,
      skillId: formula.id,
      skillName: formula.name,
      skillType: formula.type,
      activated: true,
      activationRate,
      activationRoll,
      healing,
      remainingStrength: target.currentStrength,
      notes,
    })
    if (!formula.damageKind || !formula.damageRate) {
      return
    }
  }

  if (formula.controlCleanseCharges && (!formula.damageKind || !formula.damageRate)) {
    target.controlCleanseCharges += formula.controlCleanseCharges
    events.push({
      round,
      phase,
      actorHeroId: actor.heroId,
      targetHeroId: target.heroId,
      skillId: formula.id,
      skillName: formula.name,
      skillType: formula.type,
      activated: true,
      activationRate,
      activationRoll,
      remainingStrength: target.currentStrength,
      notes: [...notes, `controlCleanse+${formula.controlCleanseCharges}`],
    })
    return
  }

  if (!formula.damageKind || !formula.damageRate) {
    events.push({
      round,
      phase,
      actorHeroId: actor.heroId,
      targetHeroId: target.heroId,
      skillId: formula.id,
      skillName: formula.name,
      skillType: formula.type,
      activated: true,
      activationRate,
      activationRoll,
      notes,
    })
    return
  }

  const damageRate = resolveDamageRate(actor, target, formula)
  const rawDamage = calculateDamage(actor, target, formula.damageKind, damageRate, damageScale)
  const result = applyIncomingDamage(target, formula.type, rawDamage)
  if (result.preventedDamage > 0) {
    notes.push('damage prevented by evasion charge')
  }

  events.push({
    round,
    phase,
    actorHeroId: actor.heroId,
    targetHeroId: target.heroId,
    skillId: formula.id,
    skillName: formula.name,
    skillType: formula.type,
    activated: true,
    activationRate,
    activationRoll,
    damageKind: formula.damageKind,
    damageRate,
    damage: result.damage,
    preventedDamage: result.preventedDamage,
    remainingStrength: target.currentStrength,
    notes,
  })

  if (formula.burnRate && formula.burnTurns && result.damage > 0) {
    const burnDamage = calculateDamage(actor, target, 'strategy', formula.burnRate, damageScale) * formula.burnTurns
    const burnResult = applyIncomingDamage(target, 'active', burnDamage)
    events.push({
      round,
      phase: 'burn',
      actorHeroId: actor.heroId,
      targetHeroId: target.heroId,
      skillId: formula.id,
      skillName: `${formula.name}-燃烧`,
      skillType: formula.type,
      activated: true,
      damageKind: 'strategy',
      damageRate: formula.burnRate,
      damage: burnResult.damage,
      preventedDamage: burnResult.preventedDamage,
      remainingStrength: target.currentStrength,
      notes: [`burnTurns=${formula.burnTurns}`],
    })
  }
}

function resolveDamageRate(
  actor: MutableCombatant,
  target: MutableCombatant,
  formula: TacticalSkillFormula,
) {
  let damageRate = formula.damageRate ?? 1
  if (
    formula.breakDamageRate
    && actor.effectiveStats.force > target.effectiveStats.command
  ) {
    damageRate = formula.breakDamageRate
  } else if (
    formula.speedBonusRate
    && actor.effectiveStats.speed > target.effectiveStats.speed
  ) {
    damageRate = formula.damageRate ? formula.damageRate + formula.speedBonusRate : formula.speedBonusRate
  }
  return roundNumber(damageRate, 2)
}

function calculateDamage(
  actor: MutableCombatant,
  target: MutableCombatant,
  kind: TacticalDamageKind,
  rate: number,
  damageScale: number,
) {
  const attackValue = kind === 'physical'
    ? actor.effectiveStats.force * 1.7 + actor.currentStrength * 0.28 + actor.mobility * 1.2
    : actor.effectiveStats.intelligence * 1.9 + actor.currentStrength * 0.22 + actor.supply * 2.5
  const defenseValue = kind === 'physical'
    ? target.effectiveStats.command * 0.52
    : (target.effectiveStats.intelligence * 0.34 + target.effectiveStats.command * 0.26)
  const reducedDamage = (attackValue * rate - defenseValue) * (1 - target.damageReduction) * damageScale
  return Math.max(1, Math.round(reducedDamage))
}

function calculateHealing(actor: MutableCombatant, rate: number, damageScale: number) {
  const healingValue = (
    actor.effectiveStats.intelligence * 1.8
    + actor.currentStrength * 0.12
    + actor.supply * 2
  ) * rate * damageScale
  return Math.max(1, Math.round(healingValue))
}

function calculateEffectiveHealing(
  actor: MutableCombatant,
  skillId: string,
  rate: number,
  damageScale: number,
  notes: string[],
) {
  return applyHealingSourceSoftCap(actor, skillId, calculateHealing(actor, rate, damageScale), notes)
}

function applyHealingSourceSoftCap(
  actor: MutableCombatant,
  skillId: string,
  healing: number,
  notes: string[],
) {
  const accumulatedHealing = actor.healingDoneBySkill[skillId] ?? 0
  const fullHealingRemaining = Math.max(0, HEALING_SOURCE_SOFT_CAP - accumulatedHealing)
  const fullHealing = Math.min(healing, fullHealingRemaining)
  const excessHealing = Math.max(0, healing - fullHealing)
  if (excessHealing <= 0) {
    return healing
  }
  notes.push(`healingSourceSoftCap=${HEALING_SOURCE_SOFT_CAP}`)
  notes.push(`healingSourceSoftCapExcessRate=${Math.round(HEALING_SOURCE_SOFT_CAP_EXCESS_RATE * 100)}%`)
  return Math.max(1, Math.round(fullHealing + excessHealing * HEALING_SOURCE_SOFT_CAP_EXCESS_RATE))
}

function recordHealingSource(actor: MutableCombatant, skillId: string, healing: number) {
  if (healing <= 0) {
    return
  }
  actor.healingDoneBySkill[skillId] = (actor.healingDoneBySkill[skillId] ?? 0) + healing
}

function applyHealing(target: MutableCombatant, healing: number) {
  const effectiveHealing = Math.min(healing, Math.max(0, target.maxStrength - target.currentStrength))
  target.currentStrength += effectiveHealing
  return effectiveHealing
}

function applyIncomingDamage(
  target: MutableCombatant,
  sourceSkillType: TacticalSkillType | 'normal',
  incomingDamage: number,
) {
  if (sourceSkillType !== 'normal' && (target.evasionCharges[sourceSkillType] ?? 0) > 0) {
    target.evasionCharges[sourceSkillType] = (target.evasionCharges[sourceSkillType] ?? 0) - 1
    return {
      damage: 0,
      preventedDamage: incomingDamage,
    }
  }

  const damage = Math.min(target.currentStrength, incomingDamage)
  target.currentStrength -= damage
  return {
    damage,
    preventedDamage: 0,
  }
}

function isBattleDefeated(combatant: MutableCombatant) {
  return combatant.currentStrength <= 0
}

function resolveBattleOutcome(
  attacker: MutableCombatant,
  defender: MutableCombatant,
): Pick<TacticalDuelReport, 'winner' | 'outcomeReason'> {
  const attackerDefeated = isBattleDefeated(attacker)
  const defenderDefeated = isBattleDefeated(defender)
  if (attackerDefeated && defenderDefeated) {
    return { winner: 'draw', outcomeReason: 'mutual_defeat' }
  }
  if (attackerDefeated) {
    return { winner: 'defender', outcomeReason: 'attacker_defeated' }
  }
  if (defenderDefeated) {
    return { winner: 'attacker', outcomeReason: 'defender_defeated' }
  }
  return { winner: 'draw', outcomeReason: 'round_limit' }
}

function resolveActivationRoll(
  seed: string,
  heroId: string,
  skillId: string,
  round: number,
  activationRolls: Record<string, number>,
) {
  const overrideKey = `${heroId}:${skillId}`
  const overrideRoll = activationRolls[overrideKey] ?? activationRolls[skillId]
  if (overrideRoll !== undefined) {
    return clampRoll(overrideRoll)
  }

  let hash = 2166136261
  const input = `${seed}:${heroId}:${skillId}:${round}`
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % 100 + 1
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

function clampRoll(value: number) {
  return Math.max(1, Math.min(100, Math.round(value)))
}

function roundNumber(value: number, decimals: number) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function toSnapshot(source: TacticalCombatant, mutable: MutableCombatant): TacticalCombatantSnapshot {
  return {
    heroId: source.heroId,
    heroName: source.heroName,
    innateSkillId: source.innateSkillId,
    equippedSkillIds: [...source.equippedSkillIds],
    baseStats: { ...source.stats },
    effectiveStats: { ...mutable.effectiveStats },
    strengthBefore: source.strength,
    strengthAfter: mutable.currentStrength,
  }
}
