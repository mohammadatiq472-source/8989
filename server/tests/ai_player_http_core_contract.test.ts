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

const EXECUTABLE_ACTIONS: Record<string, string> = {
  city_upgrade: 'upgradeCity',
  building_upgrade: 'promoteCityBuilding',
  queue_fill_idle_slot: 'enqueueAffair',
  research_start: 'upgradeCityTech',
  troop_train: 'deployReserveHero',
  recruit_pool_select: 'setRecruitSelectedPool',
  recruit_commander: 'recruitProspectHero',
  world_scout: 'queuePlanExecution',
  march_move: 'moveUnit',
  garrison_set: 'queueTacticalOverride',
  troop_facility_upgrade: 'promoteTroopFacilityBuilding',
  general_focus_set: 'setGeneralActiveHero',
  formation_assign: 'setGeneralTactic',
  threat_escape: 'queueAiAgendaAction',
  alliance_help: 'allianceHelp',
  reward_claim: 'claimReward',
}

const ACTION_WHITELIST = [...Object.keys(EXECUTABLE_ACTIONS), 'battle_report_read']

const INVALID_PROPOSAL_CASES: Array<{
  action: string
  args: Record<string, unknown>
  message: string
}> = [
  { action: 'research_start', args: { techId: 'invalid_track' }, message: 'research_start rejects unsupported techId' },
  { action: 'building_upgrade', args: { groupId: 'invalid_group' }, message: 'building_upgrade rejects unsupported groupId' },
  { action: 'queue_fill_idle_slot', args: { groupId: 'invalid_group' }, message: 'queue_fill_idle_slot rejects unsupported groupId' },
  { action: 'march_move', args: { unitId: 123, targetTileId: 'tile_01' }, message: 'march_move rejects non-string unitId' },
  { action: 'world_scout', args: { targetTileId: 123 }, message: 'world_scout rejects non-string targetTileId' },
  { action: 'troop_train', args: { heroId: 123 }, message: 'troop_train rejects non-string heroId' },
  {
    action: 'troop_facility_upgrade',
    args: { buildingId: 'invalid_building' },
    message: 'troop_facility_upgrade rejects unsupported buildingId',
  },
  {
    action: 'recruit_pool_select',
    args: { poolId: 'invalid_pool' },
    message: 'recruit_pool_select rejects unsupported poolId',
  },
  { action: 'recruit_commander', args: { count: 0 }, message: 'recruit_commander rejects out-of-range count' },
  { action: 'garrison_set', args: { summary: 123 }, message: 'garrison_set rejects non-string summary' },
  { action: 'general_focus_set', args: { heroId: 123 }, message: 'general_focus_set rejects non-string heroId' },
  { action: 'formation_assign', args: { tacticId: 'invalid_tactic' }, message: 'formation_assign rejects tacticId' },
  { action: 'threat_escape', args: { mode: 'invalid_mode' }, message: 'threat_escape rejects unsupported mode' },
  { action: 'alliance_help', args: { regionId: 123 }, message: 'alliance_help rejects non-string regionId' },
  { action: 'reward_claim', args: { rewardId: 123 }, message: 'reward_claim rejects non-string rewardId' },
  { action: 'battle_report_read', args: { unexpected: 'field' }, message: 'empty-args actions reject stray args' },
]

async function run() {
  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const tail: TailState = { stdout: [], stderr: [] }
  const aiPlayerPersistPath = buildSessionPersistPath('ai_player_http_core_governance_state')
  const child = spawnBackend(port, tail, {
    AI_PLAYER_GOVERNANCE_STATE_PATH: aiPlayerPersistPath,
    SESSION_STATE_PERSIST_PATH: buildSessionPersistPath('ai_player_http_core_session_state'),
  })

  try {
    const health = await waitForHealth(baseUrl)
    assert.ok(health, `backend did not become healthy\nstdout=${tail.stdout.join('\n')}\nstderr=${tail.stderr.join('\n')}`)
    const healthPayload = readObject(health.data)
    const persistence = readObject(healthPayload.persistence)
    assert.equal(readObject(persistence.aiPlayerGovernance).enabled, true, 'health should expose AI player persistence')

    const join = await requestJson(baseUrl, '/api/session/join', 'POST', {
      factionId: 'player',
      playerName: 'human_alpha',
    })
    assert.equal(join.status, 200, `session join failed: ${JSON.stringify(join.data)}`)

    const catalog = await requestJson(baseUrl, '/api/ai/player-actions/catalog', 'GET')
    assert.equal(catalog.status, 200, `catalog route failed: ${JSON.stringify(catalog.data)}`)
    const catalogByAction = new Map(
      readArray(readObject(catalog.data).catalog).map((item) => {
        const entry = readObject(item)
        return [String(entry.action), entry] as const
      }),
    )
    for (const [action, worldAction] of Object.entries(EXECUTABLE_ACTIONS)) {
      const entry = catalogByAction.get(action)
      assert.ok(entry, `${action} should exist in AI player action catalog`)
      assert.equal(entry.executableInV1, true, `${action} should be executable in v1`)
      assert.equal(entry.mappedWorldAction, worldAction, `${action} should map to ${worldAction}`)
    }

    const registerAlpha = await requestJson(baseUrl, '/api/ai/players', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      displayName: 'Player Operator Alpha',
      governorPlayerId: 'human_alpha',
      factionId: 'player',
      actionWhitelist: ACTION_WHITELIST,
    })
    assert.equal(registerAlpha.status, 200, `register alpha failed: ${JSON.stringify(registerAlpha.data)}`)

    const listPlayers = await requestJson(baseUrl, '/api/ai/players?governorPlayerId=human_alpha', 'GET')
    assert.equal(listPlayers.status, 200, `list players failed: ${JSON.stringify(listPlayers.data)}`)
    const players = readArray(readObject(listPlayers.data).items)
    const playerAlphaRuntime = players.map((item) => readObject(item)).find((item) => item.aiPlayerId === 'player_operator_alpha')
    assert.ok(playerAlphaRuntime, 'runtime list should include alpha AI player')
    assert.equal(playerAlphaRuntime.autonomyLevel, 'L1_assigned', 'runtime should reflect SessionManager authority')
    assert.equal(playerAlphaRuntime.controlMode, 'human_assigned', 'runtime should derive control mode from session authority')
    assert.equal(playerAlphaRuntime.governorOnline, true, 'runtime should detect online governor through session roster')

    const runtimeBeforeProposal = await requestJson(baseUrl, '/api/ai/players/player_operator_alpha', 'GET')
    assert.equal(runtimeBeforeProposal.status, 200, 'get ai player runtime should return 200')
    const runtimeBeforeProposalPayload = readObject(runtimeBeforeProposal.data)
    assert.equal(readObject(runtimeBeforeProposalPayload.observability).factionId, 'player')
    assert.equal(readObject(runtimeBeforeProposalPayload.persistence).path, aiPlayerPersistPath)

    for (const testCase of INVALID_PROPOSAL_CASES) {
      const invalidProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
        aiPlayerId: 'player_operator_alpha',
        action: testCase.action,
        source: 'mcp',
        reason: `Core contract validation: ${testCase.message}`,
        args: testCase.args,
      })
      assert.equal(invalidProposal.status, 422, testCase.message)
    }

    const createProposal = await requestJson(baseUrl, '/api/ai/players/proposals', 'POST', {
      aiPlayerId: 'player_operator_alpha',
      action: 'recruit_pool_select',
      source: 'mcp',
      reason: 'Core HTTP contract execution smoke test',
      args: {
        poolId: 'pool_season',
      },
    })
    assert.equal(createProposal.status, 200, `create proposal failed: ${JSON.stringify(createProposal.data)}`)
    const proposal = readObject(readObject(createProposal.data).proposal)
    const proposalId = String(proposal.proposalId)
    assert.equal(proposal.status, 'pending_approval', 'proposal should require explicit approval in v1')
    assert.deepEqual(proposal.args, { poolId: 'pool_season' }, 'proposal should preserve action-specific args')

    const approveProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${proposalId}/approve`, 'POST', {
      approvedBy: 'human_alpha',
    })
    assert.equal(approveProposal.status, 200, `approve proposal failed: ${JSON.stringify(approveProposal.data)}`)

    const executeProposal = await requestJson(baseUrl, `/api/ai/players/proposals/${proposalId}/execute`, 'POST', {
      executedBy: 'human_alpha',
      includeWorld: false,
    })
    assert.equal(executeProposal.status, 200, `execute proposal failed: ${JSON.stringify(executeProposal.data)}`)
    const receipt = readObject(readObject(executeProposal.data).receipt)
    assert.equal(receipt.ok, true, `receipt should report success: ${JSON.stringify(executeProposal.data)}`)
    assert.equal(receipt.worldAction, 'setRecruitSelectedPool', 'receipt should preserve mapped world action')
    assert.equal(receipt.failureCode, null, 'receipt should expose null failureCode on success')
    assert.ok(readObject(receipt.execution), 'receipt should expose execution snapshot')
    assert.deepEqual(
      receipt.worldActionPayload,
      { factionId: 'player', poolId: 'pool_season' },
      'receipt should surface resolved action payload',
    )

    console.log('[ai_player_http_core_contract] all checks passed')
  } finally {
    await shutdownChild(child)
  }
}

run().catch((error) => {
  console.error('[ai_player_http_core_contract] failed:', error)
  process.exitCode = 1
})
