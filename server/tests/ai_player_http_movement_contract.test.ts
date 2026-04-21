import assert from 'node:assert/strict'
import type { WorldState } from '../../shared/contracts/game/world'
import { readObject } from './helpers/backendHarness'
import {
  assertSuccessfulReceipt,
  bootRegisteredAiPlayer,
  clearAllPlanExecutions,
  createApproveExecuteProposal,
  ensureFactionBudget,
  loadWorldState,
} from './helpers/aiPlayerHttpContractHarness'

const MOVEMENT_ACTIONS: Array<{ action: 'world_scout' | 'march_move' | 'garrison_set'; worldAction: string }> = [
  { action: 'world_scout', worldAction: 'queuePlanExecution' },
  { action: 'march_move', worldAction: 'moveUnit' },
  { action: 'garrison_set', worldAction: 'queueTacticalOverride' },
]

const FACTION_ID = 'player'

function resolveAdjacentTileCandidate(world: WorldState, factionId: string): { unitId: string; targetTileId: string } {
  const unit = world.units.find((candidate) => candidate.faction === factionId && candidate.tileId)
  if (!unit) {
    throw new Error(`no movement unit found for faction ${factionId}`)
  }

  const targets = (world.map.connections[unit.tileId] ?? []).filter((tileId) => tileId !== unit.tileId)
  const targetTileId = targets[0]
  if (!targetTileId) {
    throw new Error(`no adjacent tile found for faction ${factionId} unit ${unit.id}`)
  }

  return {
    unitId: unit.id,
    targetTileId,
  }
}

async function loadAndResolveMoveCandidate(baseUrl: string, action: 'world_scout' | 'march_move' | 'garrison_set'): Promise<{
  unitId: string
  targetTileId: string
  summary?: string
}> {
  const world = await loadWorldState(baseUrl)
  const candidate = resolveAdjacentTileCandidate(world, FACTION_ID)
  if (action === 'garrison_set') {
    return {
      unitId: candidate.unitId,
      targetTileId: world.units.find((unit) => unit.id === candidate.unitId)?.tileId ?? candidate.targetTileId,
      summary: 'garrison_set action contract smoke test',
    }
  }

  return {
    unitId: candidate.unitId,
    targetTileId: candidate.targetTileId,
  }
}

async function run() {
  const backend = await bootRegisteredAiPlayer('ai_player_http_movement_contract')
  try {
    for (const { action, worldAction } of MOVEMENT_ACTIONS) {
      await clearAllPlanExecutions(backend.baseUrl)
      await ensureFactionBudget(backend.baseUrl, 4, 0, `prepare ${action} in movement contract shard`)

      const candidate = await loadAndResolveMoveCandidate(backend.baseUrl, action)
      const { receipt } = await createApproveExecuteProposal(
        backend.baseUrl,
        action,
        candidate,
        `Movement AI player contract smoke test for ${action}`,
      )

      assertSuccessfulReceipt(action, receipt, worldAction)
      assert.equal(receipt.failureCode, null, `${action} failureCode should remain null`)

      if (action === 'world_scout') {
        const execution = readObject(receipt.execution)
        assert.equal(
          typeof execution.status === 'string' && execution.status.length > 0,
          true,
          'world_scout execution snapshot should expose a non-empty status',
        )
        const actionRequestId = receipt.actionRequestId
        assert.ok(
          typeof actionRequestId === 'string' && actionRequestId.length > 0,
          'world_scout should return a formal actionRequestId',
        )
      }
    }

    console.log('[ai_player_http_movement_contract] all checks passed')
  } finally {
    await backend.stop()
  }
}

run().catch((error) => {
  console.error('[ai_player_http_movement_contract] failed:', error)
  process.exitCode = 1
})
