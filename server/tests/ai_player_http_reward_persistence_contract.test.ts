import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { createInitialWorldState } from '../../shared/domain/scenario'
import type { ClaimableReward } from '../../shared/contracts/game/world'
import {
  AI_PLAYER_ID,
  FACTION_ID,
  assertSuccessfulReceipt,
  createApproveExecuteProposal,
  joinGovernor,
  loadWorldState,
  registerDefaultAiPlayer,
  startAiPlayerHttpBackend,
  type AiPlayerHttpBackend,
} from './helpers/aiPlayerHttpContractHarness'
import { buildSessionPersistPath, readObject, requestJson } from './helpers/backendHarness'

const SEEDED_REWARD_ID = 'reward_ai_player_http_contract_seed'

function seedWorldStateWithPendingReward(): { path: string; reward: ClaimableReward } {
  const world = createInitialWorldState()
  const faction = world.factions[FACTION_ID]
  assert.ok(faction, `missing faction ${FACTION_ID} while seeding reward_claim shard`)

  const anchorTileId = world.units.find((unit) => unit.faction === FACTION_ID)?.tileId ?? 'tile_00'
  const reward: ClaimableReward = {
    id: SEEDED_REWARD_ID,
    source: 'province_pve',
    label: 'AI player contract seeded reward',
    summary: 'Seeded pending reward for AI player reward_claim HTTP contract.',
    reward: {
      food: 3,
      ap: 1,
    },
    createdTick: world.tick,
    nodeId: 'ai_player_http_contract_seed_node',
    tileId: anchorTileId,
  }
  faction.claimableRewards = [reward]

  const path = buildSessionPersistPath('ai_player_http_reward_world_state')
  writeFileSync(path, `${JSON.stringify(world)}\n`, 'utf-8')
  return { path, reward }
}

async function bootRewardBackend(worldPersistPath: string): Promise<AiPlayerHttpBackend> {
  const backend = await startAiPlayerHttpBackend(
    'ai_player_http_reward_persistence_contract',
    undefined,
    {
      WORLD_STATE_PERSIST_PATH: worldPersistPath,
    },
  )
  await joinGovernor(backend.baseUrl)
  await registerDefaultAiPlayer(backend.baseUrl)
  return backend
}

async function assertPersistenceAfterRestart(
  backend: AiPlayerHttpBackend,
  worldPersistPath: string,
  latestProposalId: unknown,
): Promise<AiPlayerHttpBackend> {
  const { aiPlayerPersistPath, sessionPersistPath } = backend
  await backend.stop()

  const restarted = await startAiPlayerHttpBackend(
    'ai_player_http_reward_persistence_restart',
    {
      aiPlayerPersistPath,
      sessionPersistPath,
    },
    {
      WORLD_STATE_PERSIST_PATH: worldPersistPath,
    },
  )

  const health = await requestJson(restarted.baseUrl, '/api/health', 'GET')
  assert.equal(health.status, 200, `health after restart failed: ${JSON.stringify(health.data)}`)
  const persistence = readObject(readObject(readObject(health.data).persistence).aiPlayerGovernance)
  assert.ok(Number(persistence.restoredPlayerCount) >= 1, 'restart should restore governed AI players')
  assert.ok(Number(persistence.restoredProposalCount) >= 1, 'restart should restore proposals')
  assert.ok(Number(persistence.restoredReceiptCount) >= 1, 'restart should restore receipts')

  const runtime = await requestJson(restarted.baseUrl, `/api/ai/players/${AI_PLAYER_ID}`, 'GET')
  assert.equal(runtime.status, 200, `runtime after restart failed: ${JSON.stringify(runtime.data)}`)
  const runtimePayload = readObject(runtime.data)
  const proposalStats = readObject(runtimePayload.proposalStats)
  assert.ok(Number(proposalStats.executedCount) >= 1, 'runtime should restore executed proposal stats')
  assert.equal(readObject(runtimePayload.latestReceipt).proposalId, latestProposalId, 'latest receipt should survive restart')
  assert.equal(readObject(runtimePayload.persistence).path, aiPlayerPersistPath, 'runtime should expose restored persist path')

  return restarted
}

async function run() {
  const seeded = seedWorldStateWithPendingReward()
  let backend: AiPlayerHttpBackend | undefined = await bootRewardBackend(seeded.path)

  try {
    const worldBeforeRewardClaim = await loadWorldState(backend.baseUrl)
    const factionBeforeRewardClaim = worldBeforeRewardClaim.factions[FACTION_ID]
    assert.ok(factionBeforeRewardClaim, 'player faction should exist before reward_claim')
    assert.ok(
      (factionBeforeRewardClaim.claimableRewards ?? []).some((reward) => reward.id === seeded.reward.id),
      'reward_claim shard should start from an isolated pending reward snapshot',
    )

    const rewardClaim = await createApproveExecuteProposal(
      backend.baseUrl,
      'reward_claim',
      {},
      'Reward claim shard smoke test',
    )
    assert.equal(rewardClaim.proposal.status, 'executed', 'reward_claim proposal should execute')
    assertSuccessfulReceipt('reward_claim', rewardClaim.receipt, 'claimReward')
    assert.ok(
      typeof rewardClaim.receipt.actionRequestId === 'string' && rewardClaim.receipt.actionRequestId.length > 0,
      'reward_claim should return a formal actionRequestId',
    )
    assert.deepEqual(
      rewardClaim.receipt.worldActionPayload,
      { factionId: FACTION_ID, rewardId: seeded.reward.id },
      'reward_claim should surface the resolved reward payload in receipt',
    )

    const rewardClaimExecution = readObject(rewardClaim.receipt.execution)
    assert.equal(
      Number(rewardClaimExecution.actionPointsRemaining),
      Math.min(8, factionBeforeRewardClaim.actionPoints + seeded.reward.reward.ap),
      'reward_claim execution snapshot should reflect rewarded AP',
    )

    const worldAfterRewardClaim = await loadWorldState(backend.baseUrl)
    const factionAfterRewardClaim = worldAfterRewardClaim.factions[FACTION_ID]
    assert.ok(factionAfterRewardClaim, 'player faction should exist after reward_claim')
    assert.equal(
      factionAfterRewardClaim.food,
      factionBeforeRewardClaim.food + seeded.reward.reward.food,
      'reward_claim should grant pending food reward through AI executor',
    )
    assert.equal(
      factionAfterRewardClaim.actionPoints,
      Math.min(8, factionBeforeRewardClaim.actionPoints + seeded.reward.reward.ap),
      'reward_claim should grant pending action point reward with cap through AI executor',
    )
    assert.ok(
      !(factionAfterRewardClaim.claimableRewards ?? []).some((reward) => reward.id === seeded.reward.id),
      'reward_claim should remove the claimed reward from pending queue',
    )

    backend = await assertPersistenceAfterRestart(backend, seeded.path, rewardClaim.proposal.proposalId)

    console.log('[ai_player_http_reward_persistence_contract] all checks passed')
  } finally {
    await backend?.stop()
  }
}

run().catch((error) => {
  console.error('[ai_player_http_reward_persistence_contract] failed:', error)
  process.exitCode = 1
})
