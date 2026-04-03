import assert from 'node:assert/strict'
import { advanceTickAction, moveUnitAction, updateAllianceDirectiveAction } from '../src/application/world/WorldService'
import { getActiveWorldMutationHolder, tryAcquireWorldMutationLock } from '../src/application/world/runtime/worldMutationLock'

function testLockPrimitiveLifecycle() {
  const lock = tryAcquireWorldMutationLock('unit_test_holder')
  assert.ok(lock, 'first lock acquire should succeed')
  assert.equal(getActiveWorldMutationHolder(), 'unit_test_holder', 'active holder should be recorded')

  const blocked = tryAcquireWorldMutationLock('unit_test_blocked')
  assert.equal(blocked, null, 'second lock acquire should be rejected while locked')

  lock.release()
  assert.equal(getActiveWorldMutationHolder(), null, 'active holder should be cleared after release')
}

async function testAdvanceTickWriteContention() {
  const tickPromise = advanceTickAction(false)

  const contested = updateAllianceDirectiveAction('region_test', 'hold', false)
  assert.equal(contested.ok, false, 'contended write should be rejected')
  assert.ok(contested.message?.startsWith('world mutation busy'), 'busy response should expose lock status')
  assert.ok(contested.message?.includes('advance_tick'), 'busy response should expose active holder')

  const tickResult = await tickPromise
  assert.equal(tickResult.ok, true, 'advance tick should still complete successfully')

  const afterRelease = moveUnitAction('unit_not_exists', 'tile_00', false)
  assert.ok(
    !afterRelease.message?.startsWith('world mutation busy'),
    'lock should be released after tick completion',
  )
}

async function run() {
  testLockPrimitiveLifecycle()
  await testAdvanceTickWriteContention()
  console.log('[world_mutation_lock] all checks passed')
}

run().catch((error) => {
  console.error('[world_mutation_lock] failed', error)
  process.exitCode = 1
})
