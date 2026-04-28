import assert from 'node:assert/strict'
import {
  buildSessionPersistPath,
  getAvailablePort,
  readArray,
  readObject,
  requestJson,
  shutdownChild,
  spawnBackend,
  type TailState,
  waitForHealth,
} from './helpers/backendHarness'

const ACTION_WHITELIST = [
  'formation_assign',
  'march_move',
  'resource_gather',
  'tile_occupy',
  'troop_heal',
  'troop_train',
  'recruit_commander',
  'resource_transfer_to_governor',
  'battle_report_read',
]

async function run() {
  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const tail: TailState = { stdout: [], stderr: [] }
  const child = spawnBackend(port, tail, {
    AI_PLAYER_GOVERNANCE_STATE_PATH: buildSessionPersistPath('ai_player_development_plan_governance_state'),
    SESSION_STATE_PERSIST_PATH: buildSessionPersistPath('ai_player_development_plan_session_state'),
  })

  try {
    const health = await waitForHealth(baseUrl)
    assert.ok(health, `backend did not become healthy\nstdout=${tail.stdout.join('\n')}\nstderr=${tail.stderr.join('\n')}`)
    const beforeWorldVersion = Number(readObject(readObject(health.data).world).worldVersion)

    const join = await requestJson(baseUrl, '/api/session/join', 'POST', {
      factionId: 'player',
      playerName: 'human_alpha',
    })
    assert.equal(join.status, 200, `session join failed: ${JSON.stringify(join.data)}`)

    const registerAlpha = await requestJson(baseUrl, '/api/ai/players', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      displayName: '青州 AI 参谋',
      governorPlayerId: 'human_alpha',
      factionId: 'player',
      actionWhitelist: ACTION_WHITELIST,
    })
    assert.equal(registerAlpha.status, 200, `register alpha failed: ${JSON.stringify(registerAlpha.data)}`)

    const planResponse = await requestJson(
      baseUrl,
      '/api/ai/players/player_operator_alpha/development-plan?goalPower=4000',
      'GET',
    )
    assert.equal(planResponse.status, 200, `development plan failed: ${JSON.stringify(planResponse.data)}`)
    const plan = readObject(planResponse.data)
    assert.equal(plan.ok, true)
    assert.equal(plan.aiPlayerId, 'player_operator_alpha')
    assert.equal(plan.factionId, 'player')
    assert.equal(readObject(plan.goal).targetDevelopmentPoints, 4000)
    assert.ok(Number(readObject(plan.goal).remainingDevelopmentPoints) >= 0)

    const resources = readObject(plan.resources)
    const factionResources = readObject(resources.faction)
    for (const key of ['food', 'wood', 'stone', 'iron', 'actionPoints']) {
      assert.equal(typeof factionResources[key], 'number', `faction resource ${key} should be numeric`)
    }
    const aiAccountResources = readObject(resources.aiAccount)
    for (const key of ['food', 'wood', 'stone', 'iron']) {
      assert.equal(typeof aiAccountResources[key], 'number', `ai account resource ${key} should be numeric`)
    }

    const actions = readArray(plan.candidateActions).map((item) => readObject(item))
    const byAction = new Map(actions.map((action) => [String(action.action), action] as const))
    for (const action of ['formation_assign', 'march_move', 'resource_gather', 'tile_occupy', 'troop_heal']) {
      const candidate = byAction.get(action)
      assert.ok(candidate, `${action} should be listed as a development-plan mainline action`)
      assert.equal(candidate.executableInV1, true, `${action} should remain executable in v1`)
      assert.ok(
        !readArray(candidate.blockers).includes('not_executable_in_v1'),
        `${action} should no longer be marked as deferred`,
      )
    }
    for (const action of ['march_move', 'resource_gather', 'tile_occupy']) {
      const candidate = byAction.get(action)
      assert.ok(candidate, `${action} candidate should exist for target-summary checks`)
      if (candidate.readiness === 'ready' && candidate.targetTileId) {
        assert.match(String(candidate.reason), new RegExp(String(candidate.targetTileId)), `${action} reason should name the map target tile`)
        assert.ok(
          candidate.proposalReason === undefined || String(candidate.proposalReason).includes(String(candidate.targetTileId)),
          `${action} proposalReason should stay aligned with the map target tile`,
        )
      }
    }
    const battleReportRead = byAction.get('battle_report_read')
    assert.ok(battleReportRead, 'battle_report_read should be listed as a read-model action')
    assert.equal(battleReportRead.executableInV1, false, 'battle_report_read must remain read-model only')
    assert.equal(battleReportRead.readiness, 'information_only')
    assert.ok(readArray(battleReportRead.blockers).includes('read_model_only'))
    assert.ok(!readArray(battleReportRead.blockers).includes('not_executable_in_v1'))

    const recommendedLoop = readArray(plan.recommendedLoop).map((item) => readObject(item))
    assert.deepEqual(
      recommendedLoop.map((step) => step.action),
      ['tile_occupy', 'troop_heal', 'march_move', 'resource_gather'],
      'development-plan should expose the playable development loop in the requested order',
    )
    for (const [index, step] of recommendedLoop.entries()) {
      assert.equal(step.order, index + 1, 'recommended loop should use one-based ordering')
      assert.equal(typeof step.summary, 'string', 'recommended loop step should explain player-readable intent')
      assert.equal(typeof step.nextWhen, 'string', 'recommended loop step should explain when to use it')
    }

    const risks = readArray(plan.riskItems).map((item) => readObject(item))
    assert.ok(
      !risks.some((risk) => (
        risk.code === 'tile_occupy_deferred'
        || risk.code === 'troop_heal_deferred'
        || risk.code === 'battle_report_read_deferred'
      )),
      'tile_occupy, troop_heal, and battle_report_read should no longer be listed as deferred risks',
    )

    const missingPlan = await requestJson(baseUrl, '/api/ai/players/missing_ai/development-plan', 'GET')
    assert.equal(missingPlan.status, 404, 'unknown AI player should return 404')

    const afterHealth = await requestJson(baseUrl, '/api/health', 'GET')
    assert.equal(afterHealth.status, 200, `health after plan failed: ${JSON.stringify(afterHealth.data)}`)
    const afterWorldVersion = Number(readObject(readObject(afterHealth.data).world).worldVersion)
    assert.equal(afterWorldVersion, beforeWorldVersion, 'development-plan route must be read-only')

    console.log('[ai_player_development_plan_http_contract] all checks passed')
  } finally {
    await shutdownChild(child)
  }
}

run().catch((error) => {
  console.error('[ai_player_development_plan_http_contract] failed:', error)
  process.exitCode = 1
})
