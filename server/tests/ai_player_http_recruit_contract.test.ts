import assert from 'node:assert/strict'
import type { WorldState } from '../../shared/contracts/game/world'
import {
  FACTION_ID,
  bootRegisteredAiPlayer,
  createApproveExecuteProposal,
  ensureFactionBudget,
  loadWorldState,
  assertSuccessfulReceipt,
} from './helpers/aiPlayerHttpContractHarness'

type RecruitPoolId = 'pool_standard' | 'pool_season' | 'pool_limited'

function resolveRecruitPoolId(world: WorldState): RecruitPoolId {
  const currentPoolId = world.slgDomainState?.recruitStateByFaction?.[FACTION_ID]?.selectedPoolId
  const nextPoolId = ['pool_standard', 'pool_season', 'pool_limited'].find((candidate) => candidate !== currentPoolId)
  return (nextPoolId ?? 'pool_standard') as RecruitPoolId
}

async function run() {
  const backend = await bootRegisteredAiPlayer('ai_player_http_recruit_contract_recruit')
  const baseUrl = backend.baseUrl

  try {
    const worldBeforeRecruit = await loadWorldState(baseUrl)
    const factionBefore = worldBeforeRecruit.factions[FACTION_ID]
    assert.ok(factionBefore, 'player faction should exist before recruit baseline')

    const recruitArgs = {
      poolId: 'pool_standard' as RecruitPoolId,
      count: 1,
    }

    const recruitSuccess = await createApproveExecuteProposal(baseUrl, 'recruit_commander', recruitArgs, 'Recruit baseline success')
    assert.equal(recruitSuccess.proposal.status, 'executed')
    assertSuccessfulReceipt('recruit_commander', recruitSuccess.receipt, 'recruitProspectHero')
    assert.equal(recruitSuccess.receipt.failureCode, null, 'recruit_commander baseline success should be failure free')

    const worldAfterRecruit = await loadWorldState(baseUrl)
    const factionAfter = worldAfterRecruit.factions[FACTION_ID]
    assert.ok(factionAfter, 'player faction should exist after recruit baseline success')
    assert.equal(
      factionAfter.heroCommand.rosterHeroIds.length,
      factionBefore.heroCommand.rosterHeroIds.length + 1,
      'recruit_commander should append one hero into roster',
    )
    assert.equal(
      factionAfter.heroCommand.reserveHeroIds.length,
      factionBefore.heroCommand.reserveHeroIds.length + 1,
      'recruit_commander should append one hero into reserve',
    )

    const worldBeforePoolSelect = await loadWorldState(baseUrl)
    const poolId = resolveRecruitPoolId(worldBeforePoolSelect)
    const recruitPoolSelect = await createApproveExecuteProposal(
      baseUrl,
      'recruit_pool_select',
      { poolId },
      `Set recruit pool to ${poolId}`,
    )
    assertSuccessfulReceipt('recruit_pool_select', recruitPoolSelect.receipt, 'setRecruitSelectedPool')
    assert.equal(recruitPoolSelect.receipt.failureCode, null, 'recruit_pool_select should be success receipt')

    const worldAfterPoolSelect = await loadWorldState(baseUrl)
    assert.equal(
      worldAfterPoolSelect.slgDomainState?.recruitStateByFaction?.[FACTION_ID]?.selectedPoolId,
      poolId,
      'recruit_pool_select should set selected pool id',
    )

    await ensureFactionBudget(baseUrl, 2, 8, 'troop train')
    const troopTrain = await createApproveExecuteProposal(baseUrl, 'troop_train', {}, 'Smoke troop training execution')
    assertSuccessfulReceipt('troop_train', troopTrain.receipt, 'deployReserveHero')
    assert.equal(troopTrain.receipt.failureCode, null, 'troop_train should be success receipt')
  } finally {
    await backend.stop()
  }
}

run().catch((error) => {
  console.error('[ai_player_http_recruit_contract] failed:', error)
  process.exitCode = 1
})
