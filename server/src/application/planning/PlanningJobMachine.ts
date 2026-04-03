import { createActor, createMachine } from 'xstate'
import type { PlanningJobStatus } from '../../../../shared/contracts/game'

export type PlanningJobEventType = 'START' | 'SUCCEED' | 'FAIL' | 'STALE'

const planningJobMachine = createMachine({
  id: 'planningJobLifecycle',
  initial: 'queued',
  states: {
    queued: {
      on: {
        START: 'running',
        FAIL: 'failed',
        STALE: 'stale',
      },
    },
    running: {
      on: {
        SUCCEED: 'succeeded',
        FAIL: 'failed',
        STALE: 'stale',
      },
    },
    succeeded: { type: 'final' },
    failed: { type: 'final' },
    stale: { type: 'final' },
  },
})

export function createPlanningJobLifecycle() {
  const actor = createActor(planningJobMachine)
  actor.start()

  return {
    getStatus(): PlanningJobStatus {
      return actor.getSnapshot().value as PlanningJobStatus
    },
    send(eventType: PlanningJobEventType): PlanningJobStatus {
      actor.send({ type: eventType })
      return actor.getSnapshot().value as PlanningJobStatus
    },
  }
}
