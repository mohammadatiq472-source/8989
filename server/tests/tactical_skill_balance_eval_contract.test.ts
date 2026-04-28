import assert from 'node:assert/strict'
import {
  buildDefaultTacticalSkillBalanceEvalScenarios,
  runTacticalSkillBalanceEval,
  summarizeTacticalSkillBalanceAnomalies,
} from '../../shared/domain/tacticalSkillBalanceEval'

function testDefaultScenarioCatalog() {
  const scenarios = buildDefaultTacticalSkillBalanceEvalScenarios()
  assert.ok(scenarios.length >= 5)
  for (const scenario of scenarios) {
    assert.equal(scenario.teamA.heroIds.length, 3)
    assert.equal(scenario.teamB.heroIds.length, 3)
    assert.ok(scenario.teamA.name.length > 0)
    assert.ok(scenario.teamB.name.length > 0)
  }
}

function testBalanceEvalReportShape() {
  const report = runTacticalSkillBalanceEval({
    seedCount: 64,
    seedPrefix: 'contract:tactical-skill-balance-eval',
  })

  assert.equal(report.seedCount, 64)
  assert.equal(report.formulaCoverage.totalSkillCount, 77)
  assert.equal(report.formulaCoverage.implementedSkillCount, 77)
  assert.deepEqual(report.formulaCoverage.missingSkillIds, [])
  assert.deepEqual(report.formulaCoverage.missingInnateSkillIds, [])
  assert.deepEqual(report.formulaCoverage.missingGeneralSkillIds, [])
  assert.ok(report.scenarioResults.length >= 5)

  for (const result of report.scenarioResults) {
    assert.equal(result.seedCount, 64)
    assert.equal(result.randomEquippedSkillPoolSize, 50)
    assert.deepEqual(result.missingFormulaSkillIds, [])
    assert.equal(result.outcomeLabels.win, `teamA:${result.teamA.name}`)
    assert.equal(result.outcomeLabels.loss, `teamB:${result.teamB.name}`)
    assert.equal(result.outcomeLabels.draw, 'draw')
    assert.equal(
      result.outcomes.win + result.outcomes.loss + result.outcomes.draw,
      64,
    )
    assert.equal(
      Object.values(result.roundHistogram).reduce((sum, count) => sum + count, 0),
      64,
    )
    assert.ok(result.averageRounds > 0)
    assert.ok(result.shortBattleRate >= 0)
    assert.ok(result.topDamageSkills.length > 0)
    assert.ok(result.topDamageSkills.every((skill) => skill.perActivationDamage >= 0))
    assert.ok(result.topHealingSkills.every((skill) => skill.perActivationHealing >= 0))
  }
  assert.ok(
    report.scenarioResults.filter((result) => result.averageRounds >= 2.5 && result.averageRounds <= 4.5).length
      >= Math.ceil(report.scenarioResults.length / 2),
    'most default balance scenarios should average 2.5-4.5 rounds after tuning',
  )

  const anomalies = summarizeTacticalSkillBalanceAnomalies(report)
  assert.equal(anomalies, report.anomalies)
  assert.ok(anomalies.length > 0)
  assert.ok(
    anomalies.some((anomaly) => (
      anomaly.type === 'win_rate_skew'
        || anomaly.type === 'skill_damage_outlier'
        || anomaly.type === 'skill_healing_outlier'
    )),
    'current tuned formula set should still surface balance pressure for follow-up tuning',
  )
  assert.ok(!anomalies.some((anomaly) => anomaly.severity === 'blocker'))
  assert.ok(
    anomalies.every((anomaly) => anomaly.scenarioId.length > 0 && anomaly.metric.length > 0),
    'anomalies should carry stable scenario and metric fields',
  )
}

function run() {
  testDefaultScenarioCatalog()
  testBalanceEvalReportShape()

  console.log('[tactical_skill_balance_eval_contract] all checks passed')
}

run()
