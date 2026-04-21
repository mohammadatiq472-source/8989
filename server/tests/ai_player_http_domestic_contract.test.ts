import assert from 'node:assert/strict'
import {
  assertSuccessfulReceipt,
  bootRegisteredAiPlayer,
  clearAllPlanExecutions,
  createApproveExecuteProposal,
  ensureFactionBudget,
} from './helpers/aiPlayerHttpContractHarness'

const DOMESTIC_ACTIONS: Array<{
  action: 'city_upgrade' | 'building_upgrade' | 'queue_fill_idle_slot' | 'research_start'
  worldAction: string
  minFood: number
  minActionPoints: number
}> = [
  {
    action: 'city_upgrade',
    worldAction: 'upgradeCity',
    minFood: 0,
    minActionPoints: 4,
  },
  {
    action: 'building_upgrade',
    worldAction: 'promoteCityBuilding',
    minFood: 0,
    minActionPoints: 4,
  },
  {
    action: 'queue_fill_idle_slot',
    worldAction: 'enqueueAffair',
    minFood: 0,
    minActionPoints: 4,
  },
  {
    action: 'research_start',
    worldAction: 'upgradeCityTech',
    minFood: 0,
    minActionPoints: 4,
  },
]

async function run() {
  const backend = await bootRegisteredAiPlayer('ai_player_http_domestic_contract')
  try {
    for (const { action, worldAction, minFood, minActionPoints } of DOMESTIC_ACTIONS) {
      await clearAllPlanExecutions(backend.baseUrl)
      await ensureFactionBudget(
        backend.baseUrl,
        minActionPoints,
        minFood,
        `prepare ${action} in domestic contract shard`,
      )

      const { receipt } = await createApproveExecuteProposal(
        backend.baseUrl,
        action,
        {},
        `Domestic AI player contract smoke test for ${action}`,
      )

      assertSuccessfulReceipt(action, receipt, worldAction)
      assert.equal(receipt.failureCode, null, `${action} failureCode should remain null`)
    }

    console.log('[ai_player_http_domestic_contract] all checks passed')
  } finally {
    await backend.stop()
  }
}

run().catch((error) => {
  console.error('[ai_player_http_domestic_contract] failed:', error)
  process.exitCode = 1
})
