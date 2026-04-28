import {
  runTacticalSkillBalanceEval,
  summarizeTacticalSkillBalanceAnomalies,
} from '../../../shared/domain/tacticalSkillBalanceEval'

const seedCount = Number.parseInt(process.env.TACTICAL_SKILL_BALANCE_SEEDS ?? '256', 10)
const report = runTacticalSkillBalanceEval({
  seedCount: Number.isFinite(seedCount) && seedCount > 0 ? seedCount : 256,
  seedPrefix: process.env.TACTICAL_SKILL_BALANCE_SEED_PREFIX ?? 'tactical_skill_balance_eval',
})

console.log(JSON.stringify({
  ...report,
  anomalySummary: summarizeTacticalSkillBalanceAnomalies(report),
}, null, 2))
